import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { medirLinhasDeTexto } from "@/lib/media/linhas-da-tela";
import type { Word } from "@/lib/media/transcribe";
import {
  faixasDaFala,
  faixasDaMedida,
  faixasDasAmostras,
  instantesDeAmostra,
  mencoesDeTela,
  type AmostraDeTela,
  type Caixa,
  type TelasDaGravacao,
  type TipoDoQuadro,
  webcamComFolga,
} from "@/lib/media/faixas-de-tela";

/**
 * A DETECÇÃO DE TELA COMPARTILHADA antes do roteiro (01/10/2026), lado do
 * servidor. A parte pura (fala, junção, tempo) está em faixas-de-tela.ts.
 *
 * O caminho, do melhor para o pior, e cada um só entra se o anterior falhar:
 *   1. prints da gravação no worker (/amostras-de-tela) classificados pelo
 *      Claude com visão: câmera, tela ou misto, o que aparece e onde olhar;
 *   2. a medida por quadro-chave do worker (diferença do quadro típico), que
 *      vem na mesma resposta, ou da rota antiga /analisar-completo (o worker
 *      publicado antes de 01/10 não tem a rota nova);
 *   3. só a fala ("deixa eu te mostrar"), da menção até 40 s depois.
 *
 * Nada aqui derruba o roteiro: no pior caso ele planeja como antes, sem tela.
 */

const POR_CHAMADA = 16;
const CHAMADAS_JUNTAS = 3;

const SISTEMA = `Você classifica prints de uma gravação de vídeo de um criador de conteúdo brasileiro. Cada print vem com um rótulo "Quadro k (m:ss)".

Para CADA quadro, diga:
- "tipo": "camera" quando a pessoa falando para a câmera ocupa o quadro (sem tela de computador); "tela" quando a tela do computador (navegador, aplicativo, documento, apresentação) ocupa o quadro e a pessoa NÃO aparece; "misto" quando a tela do computador ocupa o quadro e a pessoa aparece numa janela menor (a webcam num canto).
- "mostra": o que aparece na tela, em português do Brasil, até 10 palavras e concreto (o aplicativo e o conteúdo: "o Notion com o roteiro do vídeo", "o Claude Code respondendo um pedido", "planilha de custos por mês"). null quando o tipo é "camera".
- "regiao": a parte da tela que importa AGORA (o texto em destaque, a resposta, o gráfico, onde o olho deve ir), como [x, y, largura, altura] em fração do quadro (0 a 1), fora da webcam. A caixa contém as LINHAS DE TEXTO INTEIRAS, de ponta a ponta (o zoom vai mostrar só ela, e linha cortada no meio da palavra não serve); se o texto ocupa a largura toda, a caixa ocupa a largura toda. null quando o tipo é "camera" ou quando não dá para saber.
- "narrador": a caixa da webcam com a pessoa no quadro "misto", [x, y, largura, altura] em fração do quadro. null nos outros tipos.

Sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"quadros":[{"k":0,"tipo":"misto","mostra":"...","regiao":[0.1,0.2,0.5,0.4],"narrador":[0.75,0.7,0.25,0.3]}]}`;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function caixa(v: unknown): Caixa | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x0, y0, w0, h0] = v as number[];
  const x = Math.min(0.95, Math.max(0, x0));
  const y = Math.min(0.95, Math.max(0, y0));
  const w = Math.min(1 - x, Math.max(0.05, w0));
  const h = Math.min(1 - y, Math.max(0.05, h0));
  return { x: +x.toFixed(3), y: +y.toFixed(3), w: +w.toFixed(3), h: +h.toFixed(3) };
}

function urlDoWorker(): string {
  const w = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
  if (!w) throw new Error("VIDEO_WORKER_URL não configurado");
  return w;
}

async function chamarWorker<T>(rota: string, corpo: unknown, prazoMs: number): Promise<T> {
  const texto = JSON.stringify(corpo);
  const r = await fetch(`${urlDoWorker()}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
    body: texto,
    signal: AbortSignal.timeout(prazoMs),
  });
  if (!r.ok) throw new Error(`worker ${rota} respondeu ${r.status}`);
  return (await r.json()) as T;
}

export type Medida = { duracao: number; largura?: number; altura?: number; trechosDeCamera: Array<{ de: number; ate: number }> };

/** Um lote de prints no Claude com visão. Print sem resposta fica de fora (quem chama decide). */
async function classificarLote(lote: Array<{ t: number; base64: string; mencao: boolean }>, ctx: { projectId?: string }): Promise<AmostraDeTela[]> {
  const resposta = await askClaudeComImagens(
    SISTEMA,
    `Classifique os ${lote.length} quadros acima (k de 0 a ${lote.length - 1}).`,
    lote.map((q, k) => ({ base64: q.base64, rotulo: `Quadro ${k} (${mmss(q.t)})` })),
    // Classificar é tarefa mecânica sobre lista: esforço baixo, com conferência em código.
    { effort: "low", maxTokens: 8000, timeoutMs: 150_000, usage: { projectId: ctx.projectId, operation: "telas-da-gravacao" } }
  );
  const dados = extrairJson(resposta) as { quadros?: Array<{ k?: number; tipo?: string; mostra?: string | null; regiao?: unknown; narrador?: unknown }> };
  const saida: AmostraDeTela[] = [];
  for (const q of dados.quadros ?? []) {
    const k = typeof q.k === "number" ? q.k : -1;
    const base = lote[k];
    if (!base) continue;
    const tipo: TipoDoQuadro = q.tipo === "tela" || q.tipo === "misto" ? q.tipo : "camera";
    saida.push({
      t: base.t,
      tipo,
      mostra: tipo === "camera" ? null : typeof q.mostra === "string" ? q.mostra.replace(/\s+/g, " ").trim().slice(0, 90) : null,
      regiao: tipo === "camera" ? null : caixa(q.regiao),
      narrador: tipo === "misto" ? caixa(q.narrador) : null,
      mencao: base.mencao,
    });
  }
  return saida;
}

/**
 * A detecção inteira. `palavras` é a transcrição da gravação (tempo da
 * gravação). Devolve sempre alguma coisa; o `aviso` diz quando caiu numa
 * fonte pior.
 */
export async function detectarTelas(v: {
  id: string;
  projectId: string;
  blobUrl: string;
  durationSec: number;
  palavras: Word[];
  /** Gravação em pé (celular): não existe tela compartilhada, e a visão nem roda. */
  emPe?: boolean;
}): Promise<TelasDaGravacao> {
  const agora = new Date().toISOString();
  const duracao = v.durationSec || v.palavras.at(-1)?.end || 0;
  const mencoes = mencoesDeTela(v.palavras);
  if (v.emPe) return { versao: 1, feitoEm: agora, fonte: "quadros", amostras: 0, mencoes, faixas: [], aviso: "gravação em pé: sem tela compartilhada" };

  const pedidos = instantesDeAmostra(duracao, mencoes);
  let quadros: Array<{ t: number; base64: string }> = [];
  let medida: Medida | null = null;
  let aviso: string | null = null;
  let esgotou = false;
  try {
    // 7 min: o worker baixa a gravação inteira (1,3 GB no teste) antes do
    // primeiro print. No Railway o download leva menos de um minuto; o teto é
    // para a fila de um worker ocupado, e ainda cabe no teto de 800 s da rota.
    const r = await chamarWorker<{ quadros: Array<{ t: number; base64: string }>; medida: Medida | null }>(
      "/amostras-de-tela",
      { sourceUrl: v.blobUrl, instantes: pedidos.map((p) => p.t), largura: 640 },
      420_000
    );
    quadros = r.quadros ?? [];
    medida = r.medida ?? null;
  } catch (e) {
    esgotou = e instanceof Error && /abort|timeout/i.test(`${e.name} ${e.message}`);
    aviso = `prints indisponíveis (${e instanceof Error ? e.message.slice(0, 80) : "falhou"})`;
  }
  // A rota antiga só se a nova não existe (worker publicado antes de 01/10).
  // Se a nova esgotou o prazo, o worker está baixando ou ocupado, e pedir de
  // novo só dobraria a espera: cai direto na fala.
  if (!quadros.length && !medida && !esgotou) {
    try {
      medida = await chamarWorker<Medida>("/analisar-completo", { completoUrl: v.blobUrl }, 280_000);
    } catch (e) {
      aviso = `${aviso ? `${aviso}; ` : ""}medida indisponível (${e instanceof Error ? e.message.slice(0, 60) : "falhou"})`;
    }
  }
  return telasDosQuadros({ id: v.id, projectId: v.projectId, duracao, mencoes, pedidos, quadros, medida, aviso, agora });
}

/**
 * Dos prints (e da medida) às faixas: a visão em lotes, a medida para o
 * print sem resposta, e as reservas quando faltam os prints. Separada da
 * chamada ao worker para a prova local (scripts/tmp) usar prints tirados no
 * notebook com a mesma conta.
 */
export async function telasDosQuadros(p: {
  id: string;
  projectId: string;
  duracao: number;
  mencoes: Array<{ t: number; frase: string }>;
  pedidos: Array<{ t: number; mencao: boolean }>;
  quadros: Array<{ t: number; base64: string }>;
  medida: Medida | null;
  aviso: string | null;
  agora?: string;
}): Promise<TelasDaGravacao> {
  const agora = p.agora ?? new Date().toISOString();
  const { duracao, mencoes, quadros, medida } = p;
  let aviso = p.aviso;
  const quadro = medida?.largura && medida.altura ? { largura: medida.largura, altura: medida.altura } : null;
  // Gravação em pé (celular): não existe tela compartilhada, e a visão nem roda.
  if (quadro && quadro.altura > quadro.largura) {
    return { versao: 1, feitoEm: agora, fonte: "medida", amostras: 0, mencoes, faixas: [], quadro, aviso: "gravação em pé: sem tela compartilhada" };
  }

  if (quadros.length) {
    const comMencao = quadros.map((q) => ({ ...q, mencao: p.pedidos.find((x) => Math.abs(x.t - q.t) < 0.01)?.mencao ?? false }));
    const lotes: Array<typeof comMencao> = [];
    for (let i = 0; i < comMencao.length; i += POR_CHAMADA) lotes.push(comMencao.slice(i, i + POR_CHAMADA));
    const resultados: AmostraDeTela[][] = new Array(lotes.length).fill(null).map(() => []);
    let proximo = 0;
    let falhas = 0;
    await Promise.all(
      Array.from({ length: Math.min(CHAMADAS_JUNTAS, lotes.length) }, async () => {
        while (proximo < lotes.length) {
          const k = proximo++;
          try {
            resultados[k] = await classificarLote(lotes[k], { projectId: p.projectId });
          } catch (e) {
            falhas++;
            console.error(`[telas][${p.id}] lote ${k} falhou: ${e instanceof Error ? e.message : e}`);
          }
        }
      })
    );
    const amostras = resultados.flat();
    // A extensão real das linhas de texto em cada print de tela (01/10, sem
    // IA): é a caixa do zoom, porque a região da visão cortava linha no meio.
    for (const a of amostras) {
      if (a.tipo === "camera" || !a.regiao) continue;
      const q = comMencao.find((x) => Math.abs(x.t - a.t) < 0.01);
      if (!q) continue;
      a.linhas = await medirLinhasDeTexto(Buffer.from(q.base64, "base64"), a.regiao, webcamComFolga(a.narrador)).catch(() => null);
    }
    // Print que a visão não respondeu: a medida do worker decide (câmera ou misto).
    const naCamera = (t: number) => medida?.trechosDeCamera.some((c) => t >= c.de && t <= c.ate) ?? true;
    for (const q of comMencao) {
      if (amostras.some((a) => Math.abs(a.t - q.t) < 0.01)) continue;
      amostras.push({ t: q.t, tipo: naCamera(q.t) ? "camera" : "misto", mencao: q.mencao });
    }
    if (amostras.length && falhas < lotes.length) {
      return {
        versao: 1,
        feitoEm: agora,
        fonte: "quadros",
        amostras: amostras.length,
        mencoes,
        faixas: faixasDasAmostras(amostras, duracao),
        // ~442 tokens por print de 640x360 a US$ 2 por milhão, mais a resposta (estimativa para o relatório).
        custoUsd: +(quadros.length * 0.0012).toFixed(3),
        aviso: falhas ? `${falhas} de ${lotes.length} lotes sem visão (medida no lugar)` : aviso,
        quadro,
      };
    }
    aviso = "a visão não respondeu";
  }

  // 2. A medida do worker.
  if (medida?.trechosDeCamera) {
    return { versao: 1, feitoEm: agora, fonte: "medida", amostras: 0, mencoes, faixas: faixasDaMedida(medida.trechosDeCamera, duracao), aviso, quadro };
  }
  // 3. Só a fala.
  return { versao: 1, feitoEm: agora, fonte: "fala", amostras: 0, mencoes, faixas: faixasDaFala(mencoes, duracao), aviso };
}
