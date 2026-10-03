/**
 * A ESCOLHA DA LEGENDA, separada da linguagem (30/09/2026).
 *
 * Pedido do Bruno: "o usuário deve ter a opção de querer legendas ou não no
 * vídeo e, se sim, escolher o estilo ou deixar a IA escolher baseado no
 * contexto". Até aqui a legenda era derivada só da linguagem do vídeo
 * (lib/media/linguagem-da-edicao.ts): quem escolhia Vox levava papel, quem
 * escolhia Hormozi levava palavra a palavra, e não havia como tirar.
 *
 * Três modos, guardados dentro de `Project.videoEstiloEscolha.legenda` (o Json
 * que já existe, sem migração):
 *
 * - "auto" (o padrão, e o comportamento de antes): o estilo sai da linguagem
 *   escolhida, sempre nas cores da marca;
 * - "estilo": o cliente fixa um dos estilos abaixo, e ele vale em tudo;
 * - "sem": nenhuma legenda em lugar nenhum (corte simples, corte montado e
 *   vídeo completo).
 *
 * ## Por que a decisão sai pronta daqui
 *
 * São três lugares que desenham legenda, com três tecnologias: o ASS do corte
 * simples (libass no worker), o Remotion do corte montado e o ASS do
 * acabamento do completo. Se cada um lesse a escolha e decidisse sozinho, um
 * dia um deles esqueceria o "sem" e a legenda voltaria num vídeo só. Aqui a
 * escolha vira UMA decisão (`legendaDecidida`) que o app manda pronta no
 * pedido; o worker só obedece.
 *
 * Módulo puro: a tela (cliente) importa daqui.
 */

export type ModoDaLegenda = "sem" | "auto" | "estilo";

/** Os estilos que o cliente pode fixar. Todos nas cores da marca. */
export type EstiloDeLegenda = "palavra" | "caixa" | "marca-texto" | "limpa" | "papel";

export type EscolhaDaLegenda = { modo: ModoDaLegenda; estilo?: EstiloDeLegenda };

export type OpcaoDeLegenda = { id: EstiloDeLegenda; nome: string; resumo: string };

/**
 * A lista curta. Cinco e não vinte: legenda é leitura, e a diferença que o
 * cliente precisa ver é de desenho (uma palavra grande, frase em caixa,
 * grifo, discreta, papel), não de fonte. A ordem vai da mais chamativa à
 * mais discreta.
 */
export const ESTILOS_DE_LEGENDA: OpcaoDeLegenda[] = [
  { id: "palavra", nome: "Palavra a palavra", resumo: "Uma ou duas palavras grandes no centro, a falada na cor da marca. Retenção de Reels e Shorts." },
  { id: "caixa", nome: "Frase em caixa", resumo: "A frase numa faixa escura da marca, a palavra falada acende na cor de destaque." },
  { id: "marca-texto", nome: "Marca-texto", resumo: "Cada palavra ganha um grifo na cor da marca quando é dita." },
  { id: "papel", nome: "Recorte de papel", resumo: "Cada palavra num pedaço de papel, como colagem de revista." },
  { id: "limpa", nome: "Limpa e discreta", resumo: "Frase branca com sombra, de telejornal. A cor da marca só na palavra falada." },
];

const IDS = new Set<string>(ESTILOS_DE_LEGENDA.map((e) => e.id));

export function nomeDoEstiloDeLegenda(id: EstiloDeLegenda | null | undefined): string {
  return ESTILOS_DE_LEGENDA.find((e) => e.id === id)?.nome ?? "";
}

/**
 * Lê a escolha guardada. Sem nada (todo projeto de antes de 30/09), é "auto",
 * que é exatamente o que esses projetos já tinham. "estilo" sem um estilo
 * válido também cai em "auto": melhor a legenda da linguagem do que nenhuma.
 */
export function normalizarLegenda(bruta: unknown): EscolhaDaLegenda {
  const b = (bruta && typeof bruta === "object" ? bruta : {}) as Record<string, unknown>;
  if (b.modo === "sem") return { modo: "sem" };
  if (b.modo === "estilo" && typeof b.estilo === "string" && IDS.has(b.estilo)) {
    return { modo: "estilo", estilo: b.estilo as EstiloDeLegenda };
  }
  return { modo: "auto" };
}

/** As três famílias de linguagem (as mesmas de capa-composta, repetidas aqui para o módulo ficar puro). */
export type FamiliaDaLegenda = "colagem" | "impacto" | "sobrio";

/**
 * O que o modo automático escolhe para cada família de linguagem. É o mesmo
 * par que valia antes de 30/09 (papel na colagem, palavra a palavra no
 * impacto, limpa no sóbrio), então "auto" não muda nenhum vídeo que já saía.
 */
export const LEGENDA_AUTOMATICA: Record<FamiliaDaLegenda, EstiloDeLegenda> = {
  colagem: "papel",
  impacto: "palavra",
  sobrio: "limpa",
};

export type LegendaDecidida =
  | { mostrar: false }
  | {
      mostrar: true;
      estilo: EstiloDeLegenda;
      /** Veio do modo automático: o corte simples mantém o desenho antigo da família. */
      automatica: boolean;
    };

/** A decisão que viaja no pedido: mostrar ou não, e em qual estilo. */
export function legendaDecidida(bruta: unknown, familia: FamiliaDaLegenda): LegendaDecidida {
  const e = normalizarLegenda(bruta);
  if (e.modo === "sem") return { mostrar: false };
  if (e.modo === "estilo" && e.estilo) return { mostrar: true, estilo: e.estilo, automatica: false };
  return { mostrar: true, estilo: LEGENDA_AUTOMATICA[familia], automatica: true };
}

/** A frase curta que as telas mostram ("Automática: palavra a palavra"). */
export function resumoDaLegenda(bruta: unknown, automatica: EstiloDeLegenda | null): string {
  const e = normalizarLegenda(bruta);
  if (e.modo === "sem") return "Sem legenda";
  if (e.modo === "estilo" && e.estilo) return nomeDoEstiloDeLegenda(e.estilo);
  return automatica ? `Automática (hoje: ${nomeDoEstiloDeLegenda(automatica).toLowerCase()})` : "Automática";
}
