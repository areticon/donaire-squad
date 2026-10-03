import { bibliaDoEstilo } from "@/lib/media/biblias";
import type { CenaResolvida } from "@/lib/media/plano-de-montagem";

/**
 * O SOUND DESIGN DA MONTAGEM (01/10/2026, decisão do Bruno: efeitos
 * sintetizados, sem arquivo de terceiro). Os eventos saem da montagem
 * resolvida (transição, punch, elemento entrando) e do estilo: o MrBeast tem
 * som em todo corte; o Vox, papel e marcador; o telejornal e o keynote quase
 * nada. O worker sintetiza cada som e mistura por baixo da voz
 * (worker/src/sons.mjs). Módulo puro.
 */

export type NomeDoSom = "whoosh" | "pop" | "impacto" | "ding" | "tique" | "papel" | "riser" | "marcador" | "clique";

export type EventoDeSom = { t: number; som: NomeDoSom; volume: number };

type Mapa = {
  /** Volume geral do estilo (0 a 1), por baixo da voz. */
  volume: number;
  transicao: Partial<Record<"corte" | "deslize" | "flash" | "folha-de-papel" | "fundir", NomeDoSom>>;
  punch?: NomeDoSom;
  elemento: Partial<Record<string, NomeDoSom>>;
  /** O número contando ganha o tique na entrada e o ding no fim (0,6 s). */
  numero?: boolean;
};

/** O mapa de cada kit futuro (a bíblia diz o kit; ver biblias/*.ts, campo `som`). */
const MAPA: Record<string, Mapa> = {
  retencao: {
    volume: 0.55,
    transicao: { deslize: "whoosh", flash: "impacto" },
    punch: "impacto",
    elemento: { "letras-revista": "pop", "icone-pop": "pop", "marca-texto": "pop", recorte: "pop", seta: "whoosh", circulo: "whoosh" },
    numero: true,
  },
  colagem: {
    volume: 0.4,
    transicao: { "folha-de-papel": "papel", deslize: "whoosh", flash: "impacto" },
    elemento: { recorte: "papel", "marca-texto": "marcador", carimbo: "impacto", "letras-revista": "papel", tarja: "tique" },
    numero: true,
  },
  emissora: { volume: 0.18, transicao: {}, elemento: { tarja: "clique" } },
  keynote: { volume: 0.2, transicao: { fundir: "whoosh" }, elemento: { titulo: "clique", "marca-texto": "clique" } },
  lousa: { volume: 0.22, transicao: { fundir: "whoosh" }, elemento: { tarja: "clique", titulo: "clique", "marca-texto": "clique" } },
  tipografia: { volume: 0.45, transicao: { deslize: "whoosh", flash: "impacto" }, elemento: { "letras-revista": "pop", "marca-texto": "pop" } },
  // O consórcio (02/10): o impacto do Reels de vendas, mais contido que o
  // MrBeast (a voz do vendedor é a prova): impacto na faixa de valor, pop no
  // selo e clique no comentário que aparece.
  consorcio: {
    volume: 0.4,
    transicao: { deslize: "whoosh", flash: "impacto" },
    punch: "impacto",
    elemento: { faixa: "impacto", selo: "pop", comentario: "clique", "letras-revista": "pop", "marca-texto": "pop", "icone-pop": "pop" },
    numero: true,
  },
};

/** O MrBeast punch é mais forte que o do Hormozi: volume por estilo, quando difere do kit. */
const VOLUME_DO_ESTILO: Record<string, number> = { mrbeast: 0.65, hormozi: 0.4 };

/** Distância mínima entre dois sons (s): som em cima de som vira barulho. */
const INTERVALO_MINIMO = 0.22;

export function sonsDaMontagem(cenas: CenaResolvida[], estiloId: string | null | undefined, duracao: number): EventoDeSom[] {
  if (!estiloId) return [];
  const b = bibliaDoEstilo(estiloId);
  const mapa = MAPA[b.kitFuturo] ?? MAPA.emissora;
  const volume = VOLUME_DO_ESTILO[estiloId] ?? mapa.volume;
  const eventos: EventoDeSom[] = [];
  cenas.forEach((c, i) => {
    if (i > 0) {
      const s = mapa.transicao[c.transicao as keyof Mapa["transicao"]];
      // O som de passagem começa um pouco antes do corte (o whoosh "puxa").
      if (s) eventos.push({ t: Math.max(0, c.inicio - (s === "whoosh" ? 0.12 : 0)), som: s, volume });
    }
    if (mapa.punch && c.movimento === "punch" && typeof c.movimentoEm === "number") eventos.push({ t: c.movimentoEm, som: mapa.punch, volume: volume * 0.8 });
    for (const e of c.elementos) {
      if (e.tipo === "numero" && mapa.numero) {
        eventos.push({ t: e.inicio, som: "tique", volume: volume * 0.7 });
        eventos.push({ t: e.inicio + 0.6, som: "ding", volume: volume * 0.8 });
        continue;
      }
      const s = mapa.elemento[e.tipo];
      if (s) eventos.push({ t: e.inicio, som: s, volume: volume * (s === "pop" ? 0.75 : 0.85) });
    }
  });
  // Ordena, tira os que se atropelam (fica o primeiro) e o que passa do fim.
  eventos.sort((a, b2) => a.t - b2.t);
  const saida: EventoDeSom[] = [];
  for (const e of eventos) {
    if (e.t >= duracao - 0.1) continue;
    const ultimo = saida[saida.length - 1];
    if (ultimo && e.t - ultimo.t < INTERVALO_MINIMO) continue;
    saida.push({ t: +e.t.toFixed(3), som: e.som, volume: +Math.min(1, e.volume).toFixed(2) });
  }
  return saida;
}
