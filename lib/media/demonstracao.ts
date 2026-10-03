import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { PalavraNoCorte, PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import {
  demonstracaoNaFala,
  instantesDaDemonstracao,
  juntarDemonstracao,
  type Demonstracao,
  type QuadroClassificado,
} from "@/lib/media/guardas-do-completo";

/**
 * A DEMONSTRAÇÃO VISTA (02/10/2026), lado do servidor: a parte pura está em
 * lib/media/guardas-do-completo.ts.
 *
 * O diretor de montagem só lê texto, e no completo cmuqc9r7z cobriu com
 * colagem de IA a mesa, o cantinho do café, a porta e a represa que a câmera
 * estava mostrando. Aqui quadros da gravação, nos trechos candidatos (a frase
 * fraca que o texto não decidiu, cada inserção ainda em dúvida e uma amostra de fundo a cada 20 s), vão
 * a um modelo com visão, que diz se a pessoa está falando para a câmera ou se
 * a câmera está mostrando o ambiente ou um objeto. Os quadros vêm do worker
 * (/amostras-de-tela, o mesmo dos prints de tela compartilhada).
 *
 * Custo medido na prova de 02/10: ver o relatório (`custoUsd` sai do
 * ai_usage pela operação "montagem-demonstracao").
 */

const SISTEMA = `Você olha quadros de uma gravação de celular de um criador de conteúdo brasileiro. Cada quadro vem com o rótulo "Quadro k (m:ss)".

Para CADA quadro, diga o "tipo":
- "camera": a pessoa está falando PARA A CÂMERA (o rosto dela é o assunto do quadro, olhando para a lente, mesmo que o fundo apareça).
- "ambiente": a câmera está MOSTRANDO um lugar ou um objeto (a pessoa não aparece, aparece de costas, pequena, cortada na borda, ou a câmera está virada para o cômodo, a mesa, a janela, a paisagem, um objeto; quadro tremido de quem anda mostrando o lugar).
- "incerto": não dá para saber.
E "oQue": quando é "ambiente", o que está sendo mostrado, em até 6 palavras em português ("a mesa de trabalho", "a vista da janela"); null nos outros.

Sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"quadros":[{"k":0,"tipo":"camera","oQue":null}]}`;

const POR_CHAMADA = 24;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export type ObterQuadros = (instantes: number[]) => Promise<Array<{ t: number; base64: string }>>;

/** Os quadros pelo worker (/amostras-de-tela), de qualquer vídeo público: a base do completo ou o vídeo pronto. */
export function quadrosPeloWorker(url: string, largura = 256): ObterQuadros {
  return async (instantes) => {
    const w = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
    if (!w) throw new Error("VIDEO_WORKER_URL não configurado");
    const corpo = JSON.stringify({ sourceUrl: url, instantes, largura, semMedida: true });
    const r = await fetch(`${w}/amostras-de-tela`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(300_000),
    });
    if (!r.ok) throw new Error(`worker /amostras-de-tela respondeu ${r.status}`);
    const j = (await r.json()) as { quadros?: Array<{ t: number; base64: string }> };
    return j.quadros ?? [];
  };
}

/** Classifica quadros (câmera ou ambiente) em lotes de 24, numa chamada por lote. */
export async function classificarQuadros(quadros: Array<{ t: number; base64: string }>, ctx: { projectId?: string | null }): Promise<QuadroClassificado[]> {
  const saida: QuadroClassificado[] = [];
  for (let i = 0; i < quadros.length; i += POR_CHAMADA) {
    const lote = quadros.slice(i, i + POR_CHAMADA);
    const resposta = await askClaudeComImagens(
      SISTEMA,
      `Classifique os ${lote.length} quadros acima (k de 0 a ${lote.length - 1}).`,
      lote.map((q, k) => ({ base64: q.base64, rotulo: `Quadro ${k} (${mmss(q.t)})` })),
      { effort: "low", maxTokens: 4000, timeoutMs: 120_000, usage: { projectId: ctx.projectId ?? undefined, operation: "montagem-demonstracao" } }
    );
    const dados = extrairJson(resposta) as { quadros?: Array<{ k?: number; tipo?: string; oQue?: string | null }> };
    for (const q of dados.quadros ?? []) {
      const base = typeof q.k === "number" ? lote[q.k] : undefined;
      if (!base) continue;
      const tipo = q.tipo === "ambiente" ? "ambiente" : q.tipo === "camera" ? "camera" : "incerto";
      saida.push({ t: base.t, tipo, oQue: tipo === "ambiente" && typeof q.oQue === "string" ? q.oQue.slice(0, 60) : null });
    }
  }
  return saida;
}

/**
 * A demonstração da gravação inteira: a fala que aponta, confirmada pelos
 * quadros. A visão falhando, vale só a fala forte (nunca derruba a montagem).
 */
export async function detectarDemonstracao(p: {
  plano: PlanoDeMontagem | null;
  palavras: PalavraNoCorte[];
  duracao: number;
  obterQuadros: ObterQuadros;
  projectId?: string | null;
}): Promise<Demonstracao & { erro?: string }> {
  const aponta = demonstracaoNaFala(p.palavras);
  try {
    // O texto decide primeiro; a visão só olha onde ficou dúvida (02/10, custo).
    const pelaFala = juntarDemonstracao(aponta, null, p.duracao);
    const instantes = instantesDaDemonstracao(p.plano, p.palavras, p.duracao, aponta, pelaFala.trechos);
    const quadros = await p.obterQuadros(instantes);
    const classificados = quadros.length ? await classificarQuadros(quadros, { projectId: p.projectId }) : null;
    return juntarDemonstracao(aponta, classificados, p.duracao);
  } catch (e) {
    return { ...juntarDemonstracao(aponta, null, p.duracao), erro: e instanceof Error ? e.message.slice(0, 200) : "falhou" };
  }
}
