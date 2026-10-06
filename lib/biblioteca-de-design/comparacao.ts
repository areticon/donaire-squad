import { decidirChoice, decidirNoul, jevLigado, perguntarAoJev, type PerguntaDoJev } from "@/lib/jev/cliente";
import { semTravessao, type TipoDeDesign, type VereditoDaComparacao } from "@/lib/biblioteca-de-design/tipos";

/**
 * A COMPARAÇÃO PELO JEV (06/10/2026): o JEV DECIDE se um pedido novo é
 * igual a um design que já existe na biblioteca, uma variação dele ou um
 * design novo. Duas perguntas num pedido só, sobre o mesmo estado (o pedido
 * e os candidatos):
 *   1. choice: "qual destes designs o pedido descreve?" com os candidatos
 *      (nome e descrição) mais a opção "novo";
 *   2. noul: "o pedido é exatamente o mesmo design, sem pedir mudança?"
 *      (sim: igual; não: variação).
 * "Não sei" é resposta: confiança baixa cai em "novo", que é o padrão seguro
 * (uma entrada a mais na biblioteca custa menos que juntar o que é
 * diferente). Sem o JEV (chave fora ou JEV_LIGADO=0), tudo é novo.
 */

export type CandidatoDaBiblioteca = { id: string; nome: string; descricao: string };

/** Quantos candidatos entram na pergunta: os mais usados do tipo. */
export const TETO_DE_CANDIDATOS = 40;

export async function compararComABiblioteca(e: { tipo: TipoDeDesign; pedido: string; candidatos: CandidatoDaBiblioteca[]; projectId?: string | null }): Promise<VereditoDaComparacao> {
  const candidatos = e.candidatos.slice(0, TETO_DE_CANDIDATOS);
  if (!candidatos.length || !jevLigado()) return { veredito: "novo" };
  const pedido = semTravessao(e.pedido).slice(0, 1200);
  const criterios: Record<string, string> = Object.fromEntries(candidatos.map((c) => [c.id, `${c.nome}: ${c.descricao}`.slice(0, 220)]));
  criterios.novo = "Nenhum design da lista descreve o pedido; é um visual diferente de todos.";
  const perguntas: Record<string, PerguntaDoJev> = {
    qual: {
      type: "choice",
      instructions: `O cliente pediu um design de ${e.tipo === "video" ? "vídeo (como o vídeo é editado)" : "imagem (como a arte do post é desenhada)"}. Qual design da biblioteca o pedido descreve? Escolha "novo" quando nenhum descreve o mesmo visual.`,
      criteria: criterios,
    },
    igual: {
      type: "noul",
      instructions: "O pedido descreve EXATAMENTE o mesmo visual do design escolhido, sem pedir nenhuma mudança (cor, material, ritmo, elemento ou enquadramento)? Se o pedido acrescenta ou troca algo, a resposta é não.",
    },
  };
  try {
    const r = await perguntarAoJev({ projectId: e.projectId ?? null, etapa: "biblioteca-de-design", state: { pedido, candidatos: candidatos.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao })) } }, perguntas);
    const ids = ["novo", ...candidatos.map((c) => c.id)] as const;
    const escolhido = decidirChoice(r.qual, ids, "novo", 0.45);
    if (escolhido === "novo") return { veredito: "novo" };
    return decidirNoul(r.igual, false, 0.4, 0.7) ? { veredito: "igual", designId: escolhido } : { veredito: "variacao", designId: escolhido };
  } catch (err) {
    console.warn("[biblioteca-de-design] o JEV não comparou, o pedido entra como novo:", err instanceof Error ? err.message : err);
    return { veredito: "novo" };
  }
}
