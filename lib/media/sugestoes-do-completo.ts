import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { lerRoteiroDoVideo, montarTela, RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import type { SugestaoDaCena, TelaDeRoteiro } from "@/lib/media/roteiro-em-texto";

/**
 * AS SUGESTÕES DO CLIENTE CENA A CENA NO COMPLETO (05/10/2026).
 *
 * O pedido do Bruno: o corte tem a visão cena a cena, o completo não; ele
 * quer só o completo neste caso e precisa ver cena a cena para analisar e
 * sugerir efeitos. O campo "sugerir ajuste ou efeito" de cada cena grava um
 * texto curto aqui, sem IA e sem custo, e a montagem lê:
 *   - no editor por comando, como instrução obrigatória do trecho no plano
 *     do diretor (lib/media/editor-por-comando/diretor.ts, pedidosNoPrompt);
 *   - no caminho antigo, como pedido do cliente no diretor de bloco quando o
 *     completo é dirigido na montagem (montagem-do-completo.ts, dirigir) e
 *     como o texto já preenchido do "Outra ideia" da cena na tela.
 *
 * Mora em `completoMontagem.roteiro.completo.sugestoes`, gravada só nesse
 * caminho do jsonb (nunca o roteiro inteiro): o roteiro pode estar sendo
 * montado por outro processo enquanto o cliente escreve.
 */

export type PedidoDeSugestao = { inicio: number; fim: number; texto: string };

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

/**
 * Grava (ou troca, ou tira com texto vazio) a sugestão de um trecho do
 * completo, pelo tempo da fala do roteiro. Devolve a tela inteira refeita.
 */
export async function gravarSugestao(videoId: string, userId: string, p: PedidoDeSugestao): Promise<TelaDeRoteiro> {
  await videoEmRoteiro(videoId, userId);
  const r = await lerRoteiroDoVideo(videoId);
  const palavras = r?.completo?.fala?.palavras ?? [];
  if (!r?.completo || !palavras.length) throw new RecusaDoRoteiro("O vídeo completo ainda não tem a fala pronta. Recarregue em um minuto.", 409);
  const inicio = Number(p.inicio);
  const fim = Number(p.fim);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) throw new RecusaDoRoteiro("Não achei este trecho. Recarregue a página.", 400);
  const texto = String(p.texto ?? "").replace(/\s+/g, " ").trim().slice(0, TEXTO_MAX);

  // O trecho em índices de palavra: sobrevive ao alinhamento com a fala da montagem.
  let de = palavras.findIndex((w) => w.fim > inicio + 0.05);
  if (de < 0) de = palavras.length - 1;
  let ate = de;
  for (let i = palavras.length - 1; i >= de; i--) if (palavras[i].inicio < fim - 0.05) {
    ate = i;
    break;
  }
  const atuais = (r.completo.sugestoes ?? []).filter((s) => !mesmoTrecho(s, { inicio, fim }));
  const nova: SugestaoDaCena | null = texto
    ? { de, ate, inicio: +inicio.toFixed(3), fim: +fim.toFixed(3), fala: palavras.slice(de, ate + 1).map((w) => w.texto).join(" ").slice(0, 200), texto, em: new Date().toISOString() }
    : null;
  const lista = [...atuais, ...(nova ? [nova] : [])].sort((a, b) => a.inicio - b.inicio);
  const json = JSON.stringify(lista);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = jsonb_set("completoMontagem", '{roteiro,completo,sugestoes}', ${json}::jsonb, true)
    WHERE id = ${videoId} AND jsonb_typeof("completoMontagem" #> '{roteiro,completo}') = 'object'`;
  return (await montarTela(videoId, userId))!;
}
