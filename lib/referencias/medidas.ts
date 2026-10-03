import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { askClaudeComImagem } from "@/lib/claude";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * A MEDIDA DOS VÍDEOS DE REFERÊNCIA (01/10/2026).
 *
 * Decisões do Bruno de 01/10: baixar o vídeo de terceiro, medir e apagar na
 * hora; medir só Instagram e YouTube no começo. O worker
 * (worker/src/medir-referencia.mjs) baixa, mede os cortes, a fala e o
 * andamento, faz uma folha de contato de 8 quadros e apaga tudo; aqui a folha
 * vai à visão (Haiku) para etiquetar texto na tela, rosto, imagem de apoio e o
 * olhar (enquadramento, luz, saturação, ambiente), e é descartada. Fica em
 * `referencias_posts.medidas` SÓ número e etiqueta, e a linha some em 90 dias
 * com o post. O padrão do nicho sai daqui em padrao-visual.ts.
 */

export const REDES_MEDIDAS: RedeDeReferencia[] = ["instagram", "youtube"];
const FORMATOS_DE_VIDEO = ["reel", "video", "short"];

/** O que fica gravado de cada vídeo medido. */
export type MedidaDoVideo = {
  medidoEm: string;
  duracao: number;
  /** Quanto do começo foi medido (s). */
  medido: number;
  vertical: boolean;
  cortesPorSegundo: number;
  cenaMedia: number;
  cenaMediana: number;
  /** Primeiro corte (s): a primeira mudança forte na tela. */
  primeiroCorte: number | null;
  falaComecaEm: number | null;
  batidas: { bpm: number | null; confianca: number };
  /** Fração dos 8 quadros com texto de grafismo, com o rosto de quem fala, e em imagem de apoio. */
  quadros: { texto: number; rosto: number; apoio: number } | null;
  /** Etiquetas abstratas de imagem (lista fechada). */
  olhar: { enquadramento: string; luz: string; saturacao: string; ambiente: string } | null;
  custoUsd: number;
};

type MedidaDoWorker = {
  duracao: number;
  medido: number;
  largura: number;
  altura: number;
  cortesPorSegundo: number;
  cenaMedia: number;
  cenaMediana: number;
  primeiroCorte: number | null;
  falaComecaEm: number | null;
  batidas: { bpm: number | null; confianca: number };
  folha: string | null;
};

function urlDoWorker(): string {
  const w = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
  if (!w) throw new Error("VIDEO_WORKER_URL não configurado");
  return w;
}

async function medirNoWorker(url: string, origem: "instagram" | "youtube"): Promise<MedidaDoWorker> {
  const corpo = JSON.stringify({ url, origem, maxSeg: 90 });
  const r = await fetch(`${urlDoWorker()}/medir-referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
    body: corpo,
    signal: AbortSignal.timeout(240_000),
  });
  const j = (await r.json().catch(() => ({}))) as { medida?: MedidaDoWorker; error?: string; codigo?: string };
  if (!r.ok || !j.medida) throw new Error(`${r.status} ${j.codigo ?? ""} ${j.error ?? ""}`.trim());
  return j.medida;
}

const ENQUADRAMENTOS = ["close", "medio", "aberto"];
const LUZES = ["clara", "escura", "natural", "estudio"];
const SATURACOES = ["alta", "media", "baixa"];

/** A visão etiqueta a folha de contato (8 quadros) e a folha é esquecida. */
async function etiquetarFolha(projectId: string, folha: string): Promise<{ quadros: MedidaDoVideo["quadros"]; olhar: MedidaDoVideo["olhar"] }> {
  const bruto = await askClaudeComImagem(
    "Você mede vídeos de redes sociais pela FORMA, nunca pelo conteúdo nem por quem aparece. Responda só com JSON.",
    `A imagem é uma folha com 8 quadros do mesmo vídeo, em ordem (4 em cima, 4 embaixo). Para cada quadro diga:
- "texto": tem texto de grafismo ou legenda grande na tela? (true/false)
- "rosto": a pessoa que fala aparece com o rosto visível? (true/false)
- "apoio": é imagem de apoio (cena, objeto, tela, gráfico) sem a pessoa falando? (true/false)
E para o vídeo inteiro, só com estas palavras:
- "enquadramento": ${ENQUADRAMENTOS.join(" | ")}
- "luz": ${LUZES.join(" | ")}
- "saturacao": ${SATURACOES.join(" | ")}
- "ambiente": o tipo de lugar em até 3 palavras genéricas (ex.: "estúdio escuro", "escritório claro", "rua"), sem nome de marca, pessoa ou lugar real.
Responda {"quadros":[{"texto":true,"rosto":true,"apoio":false}],"enquadramento":"...","luz":"...","saturacao":"...","ambiente":"..."}`,
    folha,
    "image/jpeg",
    { model: "claude-haiku-4-5", maxTokens: 1500, usage: { projectId, operation: "referencias_medida" } }
  );
  const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as {
    quadros?: Array<{ texto?: boolean; rosto?: boolean; apoio?: boolean }>;
    enquadramento?: string;
    luz?: string;
    saturacao?: string;
    ambiente?: string;
  };
  const q = (j.quadros ?? []).slice(0, 8);
  // A visão às vezes devolve o texto lido no lugar de true (prova de 01/10): texto não vazio conta como sim.
  const sim = (v: unknown) => v === true || (typeof v === "string" && v.trim() !== "" && !/^(false|nao|não|no)$/i.test(v.trim()));
  const fracao = (k: "texto" | "rosto" | "apoio") => (q.length ? +(q.filter((x) => sim(x[k])).length / q.length).toFixed(2) : 0);
  const de = (v: unknown, lista: string[]) => (typeof v === "string" && lista.includes(v) ? v : "");
  return {
    quadros: q.length ? { texto: fracao("texto"), rosto: fracao("rosto"), apoio: fracao("apoio") } : null,
    olhar: {
      enquadramento: de(j.enquadramento, ENQUADRAMENTOS),
      luz: de(j.luz, LUZES),
      saturacao: de(j.saturacao, SATURACOES),
      ambiente: String(j.ambiente ?? "").replace(/[—–]/g, ",").slice(0, 40),
    },
  };
}

/** Custo da etiqueta na visão (Haiku, uma imagem pequena): registrado em ai_usage; aqui só a estimativa. */
const CUSTO_DA_VISAO_USD = 0.003;

/**
 * Mede os vídeos novos de um projeto. `midias`: o arquivo de cada post da
 * MESMA coleta (o link do Instagram expira; nada disso é gravado). Post do
 * YouTube mede pela página. Devolve quantos mediu e o custo estimado.
 */
export async function medirVideosDoProjeto(
  projectId: string,
  opcoes: { midias?: Map<string, string>; limite?: number; prazoMs?: number } = {}
): Promise<{ medidos: number; falhas: number; custoUsd: number; avisos: string[] }> {
  const fim = Date.now() + (opcoes.prazoMs ?? 600_000);
  const pendentes = await prisma.referenciaPost.findMany({
    // Só referência (03/10): o perfil do próprio cliente (status "proprio") não é medido aqui.
    where: { projectId, rede: { in: REDES_MEDIDAS }, formato: { in: FORMATOS_DE_VIDEO }, medidas: { equals: Prisma.DbNull }, perfil: { status: { not: "proprio" } } },
    select: { id: true, rede: true, externoId: true, perfilId: true, url: true },
    orderBy: { publicadoEm: "desc" },
    take: 200,
  });
  const avisos: string[] = [];
  let medidos = 0;
  let falhas = 0;
  let custoUsd = 0;
  let semBaixador = false;
  const limite = opcoes.limite ?? 40;
  for (const p of pendentes) {
    if (medidos >= limite || Date.now() > fim) break;
    const origem = p.rede as "instagram" | "youtube";
    const url = origem === "youtube" ? p.url : opcoes.midias?.get(`${p.perfilId}:${p.externoId}`);
    if (!url) continue;
    if (origem === "youtube" && semBaixador) continue;
    try {
      const m = await medirNoWorker(url, origem);
      let rotulos: { quadros: MedidaDoVideo["quadros"]; olhar: MedidaDoVideo["olhar"] } = { quadros: null, olhar: null };
      if (m.folha) {
        rotulos = await etiquetarFolha(projectId, m.folha).catch((e) => {
          avisos.push(`visão: ${e instanceof Error ? e.message.slice(0, 80) : "falhou"}`);
          return { quadros: null, olhar: null };
        });
        custoUsd += CUSTO_DA_VISAO_USD;
      }
      const medida: MedidaDoVideo = {
        medidoEm: new Date().toISOString(),
        duracao: m.duracao,
        medido: m.medido,
        vertical: m.altura > m.largura,
        cortesPorSegundo: m.cortesPorSegundo,
        cenaMedia: m.cenaMedia,
        cenaMediana: m.cenaMediana,
        primeiroCorte: m.primeiroCorte,
        falaComecaEm: m.falaComecaEm,
        batidas: m.batidas,
        quadros: rotulos.quadros,
        olhar: rotulos.olhar,
        custoUsd: m.folha ? CUSTO_DA_VISAO_USD : 0,
      };
      await prisma.referenciaPost.update({ where: { id: p.id }, data: { medidas: medida as never } });
      medidos++;
    } catch (e) {
      falhas++;
      const msg = e instanceof Error ? e.message : String(e);
      // Falha que não é do vídeo (02/10): o YouTube passou a pedir interpretador
      // de JavaScript e o worker antigo devolvia isso em TODO vídeo, perdendo
      // uns 2 min por estudo até o fim da lista. Uma vez basta para desistir
      // do YouTube nesta execução.
      if (/sem-baixador|JS runtime|JavaScript runtime|Requested format is not available|Sign in to confirm/i.test(msg)) {
        semBaixador = true;
        avisos.push(`YouTube sem baixador no worker (yt-dlp): só o Instagram foi medido (${msg.slice(0, 80)})`);
      } else avisos.push(`${origem}/${p.externoId}: ${msg.slice(0, 100)}`);
    }
  }
  return { medidos, falhas, custoUsd: Math.round(custoUsd * 10000) / 10000, avisos: [...new Set(avisos)].slice(0, 10) };
}
