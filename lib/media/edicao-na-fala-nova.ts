import { frasesNumeradas, type Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { Ancora, EdicaoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";

/**
 * A EDIÇÃO SOB MEDIDA LEVADA PARA A FALA NOVA (03/10/2026), sem chamar o
 * editor de novo. Serve ao controle do corte (lib/media/controle-do-corte.ts):
 * o cliente puxou o começo, tirou uma frase ou devolveu um trecho, o corte foi
 * refeito, e a edição que já estava paga (as peças, a câmera, as inserções, o
 * B-roll e os vídeos da Higgsfield) volta encaixada na fala nova.
 *
 * O editor ancora tudo em FRASE e PALAVRA da fala ("F12:palavra#2/fim"). A
 * frase 12 da fala antiga não é a 12 da nova (o começo mudou, uma frase saiu),
 * então cada âncora vira a PALAVRA da gravação que ela apontava, e a palavra
 * vira âncora de novo na numeração nova. Peça cuja fala saiu inteira sai junto
 * (`perdidos`); a que perdeu só uma ponta encolhe até a palavra mais perto que
 * ficou.
 *
 * Módulo puro.
 */

const norm = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

/** O mesmo critério de casamento de `resolverAncora` (editor-sob-medida/resolver.ts). */
const casa = (w: string, alvo: string) => Boolean(w) && (w === alvo || (alvo.length >= 4 && w.startsWith(alvo)) || (w.length >= 4 && alvo.startsWith(w)));

/** A palavra (posição na fala) para onde a âncora aponta, e se é o fim dela. Espelha `resolverAncora`. */
export function palavraDaAncora(a: Ancora, frases: Frase[], palavras: PalavraNoCorte[]): { k: number; fim: boolean } | null {
  const m = String(a ?? "").trim().match(/^F?(\d+)(?:\s*:\s*([^/#]+?))?(?:#(\d+))?\s*(\/\s*fim)?$/i);
  if (!m) return null;
  const f = frases[Number(m[1])];
  if (!f) return null;
  const fim = Boolean(m[4]);
  if (!m[2]) return { k: fim ? f.ate : f.de, fim };
  const alvo = norm(m[2].split(/\s+/)[0]);
  const n = Math.max(1, Number(m[3] ?? 1));
  const procurar = (de: number, ate: number) => {
    let achou = 0;
    for (let i = de; i <= ate; i++) {
      if (casa(norm(palavras[i]?.texto ?? ""), alvo)) {
        achou++;
        if (achou === n) return i;
      }
    }
    return -1;
  };
  const k0 = Number(m[1]);
  let i = procurar(f.de, f.ate);
  if (i < 0 && frases[k0 + 1]) i = procurar(frases[k0 + 1].de, frases[k0 + 1].ate);
  if (i < 0 && frases[k0 - 1]) i = procurar(frases[k0 - 1].de, frases[k0 - 1].ate);
  if (i < 0) return { k: fim ? f.ate : f.de, fim };
  return { k: i, fim };
}

/** A âncora que aponta para a palavra `k` da fala, na numeração de frases desta fala. */
export function ancoraDaPalavra(k: number, fim: boolean, frases: Frase[], palavras: PalavraNoCorte[]): Ancora {
  const fi = Math.max(0, frases.findIndex((f) => k >= f.de && k <= f.ate));
  const f = frases[fi];
  const alvo = norm(palavras[k]?.texto ?? "");
  if (!alvo || !f) return `F${fi}${fim ? "/fim" : ""}`;
  let n = 0;
  for (let i = f.de; i <= k; i++) if (casa(norm(palavras[i].texto), alvo)) n++;
  return `F${fi}:${alvo}${n > 1 ? `#${n}` : ""}${fim ? "/fim" : ""}`;
}

/**
 * `mapa[k]`: a posição na fala nova da palavra `k` da antiga (null se saiu).
 * Devolve a edição com as âncoras na fala nova e quantas peças saíram.
 */
export function levarEdicaoParaFalaNova(
  editor: EdicaoDoEditor,
  antigas: PalavraNoCorte[],
  novas: PalavraNoCorte[],
  mapa: Array<number | null>
): { editor: EdicaoDoEditor; perdidos: number } {
  const fa = frasesNumeradas(antigas);
  const fn = frasesNumeradas(novas);
  // A palavra que ficou mais perto: para a frente no começo de uma peça, para trás no fim.
  const perto = (k: number, sentido: 1 | -1): number | null => {
    for (let j = k; j >= 0 && j < mapa.length; j += sentido) if (mapa[j] != null) return mapa[j] as number;
    return null;
  };
  const mover = (a: Ancora, sentido: 1 | -1): { ancora: Ancora; k: number; velho: number; saiu: boolean } | null => {
    const p = palavraDaAncora(a, fa, antigas);
    if (!p) return null;
    const j = mapa[p.k] ?? perto(p.k, sentido);
    if (j == null) return null;
    return { ancora: ancoraDaPalavra(j, p.fim, fn, novas), k: j, velho: p.k, saiu: mapa[p.k] == null };
  };
  let perdidos = 0;
  /**
   * A peça cai quando a fala dela saiu: metade ou mais das palavras dela, ou,
   * numa peça de texto (`gatilho`), a palavra em que ela entra (o "LENDA" na
   * tela depois de o cliente tirar "chamar de lenda" é o defeito que isto evita).
   */
  const intervalo = <T extends { de: Ancora; ate: Ancora }>(x: T, gatilho = false): T | null => {
    const de = mover(x.de, 1);
    const ate = mover(x.ate, -1);
    let saiu = false;
    if (de && ate) {
      const a = Math.min(de.velho, ate.velho);
      const b = Math.max(de.velho, ate.velho);
      let fora = 0;
      for (let k = a; k <= b; k++) if (mapa[k] == null) fora++;
      saiu = fora / Math.max(1, b - a + 1) >= 0.5 || (gatilho && de.saiu);
    }
    if (!de || !ate || de.k > ate.k || saiu) {
      perdidos++;
      return null;
    }
    return { ...x, de: de.ancora, ate: ate.ancora };
  };
  const momentos = (editor.momentos ?? [])
    .map((m) => {
      const x = intervalo(m, true);
      if (!x) return null;
      const eventos = m.eventos?.map((e) => mover(e, 1)?.ancora).filter((e): e is Ancora => Boolean(e));
      return { ...x, ...(m.eventos ? { eventos } : {}) };
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  // A câmera não é conteúdo: só encolhe com a fala (não cai por palavra tirada).
  const camera = editor.camera?.map((c) => {
    const de = mover(c.de, 1);
    const ate = mover(c.ate, -1);
    return de && ate && de.k <= ate.k ? { ...c, de: de.ancora, ate: ate.ancora } : null;
  }).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const insercoes = editor.insercoes?.map((x) => intervalo(x)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const broll = editor.broll?.map((x) => intervalo(x)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const enfases = editor.enfases?.map((e) => {
    const m = mover(e, 1);
    return m && !m.saiu ? m.ancora : null;
  }).filter((e): e is Ancora => Boolean(e));
  return {
    editor: {
      ...editor,
      momentos,
      ...(camera ? { camera } : {}),
      ...(insercoes ? { insercoes } : {}),
      ...(broll ? { broll } : {}),
      ...(enfases ? { enfases } : {}),
    },
    perdidos,
  };
}

/** Um intervalo de tempo da fala antiga (o gancho) na fala nova, pelas palavras; null se alguma palavra dele saiu. */
export function tempoNaFalaNova(
  g: { inicio: number; fim: number },
  antigas: PalavraNoCorte[],
  novas: PalavraNoCorte[],
  mapa: Array<number | null>
): { inicio: number; fim: number } | null {
  const ks = antigas.map((p, k) => ({ p, k })).filter(({ p }) => p.inicio >= g.inicio - 0.08 && p.fim <= g.fim + 0.08).map(({ k }) => k);
  if (!ks.length || ks.some((k) => mapa[k] == null)) return null;
  const a = mapa[ks[0]] as number;
  const b = mapa[ks[ks.length - 1]] as number;
  if (b - a !== ks[ks.length - 1] - ks[0]) return null;
  return {
    inicio: +Math.max(0, novas[a].inicio - (antigas[ks[0]].inicio - g.inicio)).toFixed(3),
    fim: +(novas[b].fim + (g.fim - antigas[ks[ks.length - 1]].fim)).toFixed(3),
  };
}
