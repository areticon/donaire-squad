import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { lerRoteiroDoVideo, montarTela, RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { RoteiroDoCorte, SugestaoDaCena, TelaDeRoteiro } from "@/lib/media/roteiro-em-texto";

/**
 * AS SUGESTÕES DO CLIENTE CENA A CENA (05/10/2026; no corte desde 06/10).
 *
 * O pedido do Bruno: o corte tem a visão cena a cena, o completo não; ele
 * quer só o completo neste caso e precisa ver cena a cena para analisar e
 * sugerir efeitos. O campo "sugerir ajuste ou efeito" de cada cena grava um
 * texto curto aqui, sem IA e sem custo, e a montagem lê:
 *   - no editor por comando, como PEDIDO DO CLIENTE do momento (lei, 06/10:
 *     lib/media/editor-por-comando/pedido-do-cliente.ts), interpretado pelo
 *     JEV e conferido no fim;
 *   - no caminho antigo, como pedido do cliente no diretor de bloco quando o
 *     completo é dirigido na montagem (montagem-do-completo.ts, dirigir) e
 *     como o texto já preenchido do "Outra ideia" da cena na tela.
 *
 * Mora em `completoMontagem.roteiro.completo.sugestoes` (o completo) ou em
 * `clips[i].roteiro.sugestoes` (um corte, 06/10), gravada só nesse caminho do
 * jsonb (nunca o roteiro inteiro): o roteiro pode estar sendo montado por
 * outro processo enquanto o cliente escreve.
 */

export type PedidoDeSugestao = {
  inicio: number;
  fim: number;
  texto: string;
  /** O índice do corte em `clips` (06/10); sem ele, a sugestão é do completo. */
  trecho?: number | null;
};

const TEXTO_MAX = 300;

async function videoEmRoteiro(videoId: string, userId: string): Promise<void> {
  const v = await prisma.videoJob.findFirst({ where: { id: videoId, project: projetoVisivel(userId) }, select: { status: true } });
  if (!v) throw new RecusaDoRoteiro("Vídeo não encontrado.", 404);
  if (v.status !== "roteiro") {
    throw new RecusaDoRoteiro(
      v.status === "roteirizando" ? "O roteiro ainda está sendo montado. Em um minuto ele fica pronto." : "Este roteiro já foi aprovado e o squad está gerando."
    );
  }
}

/** Sobreposição de metade do menor intervalo: é o mesmo trecho. */
function mesmoTrecho(a: { inicio: number; fim: number }, b: { inicio: number; fim: number }): boolean {
  const d = Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio);
  const menor = Math.max(0.2, Math.min(a.fim - a.inicio, b.fim - b.inicio));
  return d >= menor * 0.5;
}

/** A lista de sugestões com a nova (ou sem a do trecho, com texto vazio), no tempo e nos índices desta fala. */
export function sugestoesComANova(atuais: SugestaoDaCena[] | undefined, palavras: PalavraNoCorte[], p: PedidoDeSugestao): SugestaoDaCena[] {
  const inicio = Number(p.inicio);
  const fim = Number(p.fim);
  const texto = String(p.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TEXTO_MAX);
  // O trecho em índices de palavra: sobrevive ao alinhamento com a fala da montagem.
  let de = palavras.findIndex((w) => w.fim > inicio + 0.05);
  if (de < 0) de = palavras.length - 1;
  let ate = de;
  for (let i = palavras.length - 1; i >= de; i--) if (palavras[i].inicio < fim - 0.05) {
    ate = i;
    break;
  }
  const semODoTrecho = (atuais ?? []).filter((s) => !mesmoTrecho(s, { inicio, fim }));
  const nova: SugestaoDaCena | null = texto
    ? { de, ate, inicio: +inicio.toFixed(3), fim: +fim.toFixed(3), fala: palavras.slice(de, ate + 1).map((w) => w.texto).join(" ").slice(0, 200), texto, em: new Date().toISOString() }
    : null;
  return [...semODoTrecho, ...(nova ? [nova] : [])].sort((a, b) => a.inicio - b.inicio);
}

/**
 * Grava (ou troca, ou tira com texto vazio) a sugestão de um trecho do
 * completo ou de um corte, pelo tempo da fala do roteiro. Devolve a tela
 * inteira refeita.
 */
export async function gravarSugestao(videoId: string, userId: string, p: PedidoDeSugestao): Promise<TelaDeRoteiro> {
  await videoEmRoteiro(videoId, userId);
  const inicio = Number(p.inicio);
  const fim = Number(p.fim);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) throw new RecusaDoRoteiro("Não achei este trecho. Recarregue a página.", 400);
  if (typeof p.trecho === "number" && Number.isInteger(p.trecho) && p.trecho >= 0) {
    // UM CORTE (06/10): a sugestão mora em clips[i].roteiro.sugestoes, no tempo da fala do corte.
    const v = await prisma.videoJob.findUnique({ where: { id: videoId }, select: { clips: true } });
    const clips = (Array.isArray(v?.clips) ? v!.clips : []) as Array<{ roteiro?: RoteiroDoCorte | null }>;
    const r = clips[p.trecho]?.roteiro;
    const palavras = r?.fala?.palavras ?? [];
    if (!r || !palavras.length) throw new RecusaDoRoteiro("Este corte ainda não tem a fala pronta. Recarregue em um minuto.", 409);
    const json = JSON.stringify(sugestoesComANova(r.sugestoes, palavras, p));
    await prisma.$executeRaw`
      UPDATE video_jobs
      SET clips = jsonb_set(clips, ARRAY[${String(p.trecho)}, 'roteiro', 'sugestoes']::text[], ${json}::jsonb, true)
      WHERE id = ${videoId} AND jsonb_typeof(clips -> ${p.trecho}::int -> 'roteiro') = 'object'`;
    return (await montarTela(videoId, userId))!;
  }
  const r = await lerRoteiroDoVideo(videoId);
  const palavras = r?.completo?.fala?.palavras ?? [];
  if (!r?.completo || !palavras.length) throw new RecusaDoRoteiro("O vídeo completo ainda não tem a fala pronta. Recarregue em um minuto.", 409);
  const json = JSON.stringify(sugestoesComANova(r.completo.sugestoes, palavras, p));
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = jsonb_set("completoMontagem", '{roteiro,completo,sugestoes}', ${json}::jsonb, true)
    WHERE id = ${videoId} AND jsonb_typeof("completoMontagem" #> '{roteiro,completo}') = 'object'`;
  return (await montarTela(videoId, userId))!;
}
