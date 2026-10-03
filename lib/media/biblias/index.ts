import { CATALOGO_DE_ESTILOS, estiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import type { BibliaDoEstilo, Faixa } from "@/lib/media/biblias/tipos";
import { MRBEAST } from "@/lib/media/biblias/mrbeast";
import { HORMOZI } from "@/lib/media/biblias/hormozi";
import { VOX } from "@/lib/media/biblias/vox";
import { SOBRIO } from "@/lib/media/biblias/sobrio";
import { KEYNOTE } from "@/lib/media/biblias/keynote";
import { LOUSA } from "@/lib/media/biblias/lousa";
import { CONSORCIO } from "@/lib/media/biblias/consorcio";

/**
 * AS BÍBLIAS DOS ESTILOS (01/10/2026).
 *
 * Seis completas, a pedido do Bruno: MrBeast, Hormozi, Vox, sóbrio (BBC),
 * keynote estilo Apple e lousa estilo Dan Martell; a sétima (02/10) é a do
 * vendedor de consórcio, medida nos Reels do nicho. As outras 19 linguagens do
 * catálogo saem da bíblia do kit delas (colagem do Vox, impacto do Hormozi,
 * sóbrio da BBC), com o nome, o resumo e o ritmo próprios e o selo "beta"
 * na tela. É melhor que antes (o prompt da família, sem metas nem revisor)
 * e honesto sobre o que falta.
 *
 * Módulo puro.
 */

export const BIBLIAS_COMPLETAS: Record<string, BibliaDoEstilo> = {
  mrbeast: MRBEAST,
  hormozi: HORMOZI,
  vox: VOX,
  bbc: SOBRIO,
  keynote: KEYNOTE,
  lousa: LOUSA,
  // 02/10: o vendedor de consórcio e crédito (Gaberlini Consórcios).
  consorcio: CONSORCIO,
};

/**
 * Duração típica de cena de cada linguagem ainda sem bíblia (segundos), das
 * fichas do catálogo (era a tabela RITMO de diretor-de-montagem.ts).
 */
const RITMO_DAS_DERIVADAS: Record<string, [number, number]> = {
  natgeo: [6, 8], "johnny-harris": [3, 6], "crime-real": [4, 7], "60-minutes": [6, 8],
  kurzgesagt: [3, 6], "quadro-branco": [4, 7], "ali-abdaal": [3, 6], ted: [6, 8], institucional: [4, 7],
  depoimento: [5, 8], vlog: [2, 4], podcast: [6, 8], ugc: [2, 5], tipografia: [1.5, 3],
  "carrossel-animado": [3, 5], "wes-anderson": [5, 8], vhs: [3, 6], minimalista: [4, 7], "tela-dividida": [3, 6],
};

const BASE_DO_KIT: Record<BibliaDoEstilo["kit"], BibliaDoEstilo> = { colagem: VOX, impacto: HORMOZI, sobrio: SOBRIO };

function faixaDaCena(min: number, max: number): Faixa {
  return { padrao: Math.round(((min + max) / 2) * 10) / 10, min, max };
}

/** A bíblia de uma linguagem ainda sem a própria: a do kit, com o nome, o resumo e o ritmo dela. */
function derivada(id: string): BibliaDoEstilo {
  const e = estiloDoCatalogo(id) ?? estiloDoCatalogo("hormozi")!;
  const base = BASE_DO_KIT[e.kit];
  const ritmo = RITMO_DAS_DERIVADAS[e.id];
  const cena = ritmo ? faixaDaCena(ritmo[0], ritmo[1]) : base.metas.cenaSeg;
  return {
    ...base,
    id: e.id,
    nome: `${e.nome}${e.referencia ? ` (${e.referencia})` : ""}`,
    completa: false,
    essencia: `${e.resumo} Segue as regras gerais de ${base.nome}, com o ritmo desta linguagem.`,
    metas: {
      ...base.metas,
      cenaSeg: cena,
      // Algo muda na tela, no máximo, a cada duração média de cena.
      mudancaACadaSeg: { padrao: Math.min(cena.padrao, base.metas.mudancaACadaSeg.max), min: Math.min(cena.min, base.metas.mudancaACadaSeg.min), max: Math.max(cena.max, base.metas.mudancaACadaSeg.max) },
    },
  };
}

/** A bíblia da linguagem escolhida (a própria, ou a derivada do kit). */
export function bibliaDoEstilo(estiloId: string | null | undefined): BibliaDoEstilo {
  const id = estiloId ?? "hormozi";
  return BIBLIAS_COMPLETAS[id] ?? derivada(id);
}

/** Todas, para a prova e para a documentação. */
export function todasAsBiblias(): BibliaDoEstilo[] {
  return CATALOGO_DE_ESTILOS.map((e) => bibliaDoEstilo(e.id));
}

export type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";
