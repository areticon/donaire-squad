import type { LeituraDoVideo, MedidaDoWorker, TrechoLido } from "@/lib/media/leitura-do-video";
import type { AmostraDaJornada, Caixa } from "@/lib/media/jornada/estado";

/**
 * A LINHA DO TEMPO DA EDIÇÃO (jornada, passo 2; E1). Os passos 3 a 7 falam a
 * mesma língua de tempo: o "tempo editado" (o do completo depois da limpeza
 * de fala). A leitura do vídeo é feita no ORIGINAL (antes do corte) e levada
 * para o tempo editado por uma função pura (`tempoEditado`), a partir dos
 * pedaços mantidos da gravação (os mesmos que o roteiro usa para a fala do
 * completo). Módulo puro.
 */

export type Pedaco = { de: number; ate: number };
export type Palavra = { texto: string; inicio: number; fim: number };

const arred = (n: number) => Math.round(n * 1000) / 1000;

/** Os pedaços mantidos a partir das remoções (tempo da gravação), em ordem e sem sobreposição. */
export function manterDasRemocoes(remocoes: Pedaco[], duracao: number): Pedaco[] {
  const r = [...remocoes].filter((x) => x.ate > x.de).sort((a, b) => a.de - b.de);
  const saida: Pedaco[] = [];
  let t = 0;
  for (const x of r) {
    if (x.de > t + 1e-3) saida.push({ de: arred(t), ate: arred(Math.min(x.de, duracao)) });
    t = Math.max(t, x.ate);
  }
  if (duracao > t + 1e-3) saida.push({ de: arred(t), ate: arred(duracao) });
  return saida.filter((p) => p.ate > p.de);
}

/**
 * O instante `t` da gravação no tempo editado: a soma do que foi mantido
 * antes dele. Um instante dentro de um pedaço removido cai no começo do
 * pedaço mantido seguinte (null se depois do último).
 */
export function tempoEditado(t: number, manter: Pedaco[]): number | null {
  let acumulado = 0;
  for (const p of manter) {
    if (t < p.de) return arred(acumulado);
    if (t <= p.ate) return arred(acumulado + (t - p.de));
    acumulado += p.ate - p.de;
  }
  return null;
}

/** A duração editada (a soma dos pedaços mantidos). */
export function duracaoEditada(manter: Pedaco[]): number {
  return arred(manter.reduce((s, p) => s + (p.ate - p.de), 0));
}

/** A leitura do original levada para o tempo editado; trechos que caem inteiros em remoção saem. */
export function leituraNoTempoEditado(leitura: LeituraDoVideo, manter: Pedaco[]): LeituraDoVideo {
  const fim = duracaoEditada(manter);
  const trechos: TrechoLido[] = [];
  for (const t of leitura.trechos) {
    const de = tempoEditado(t.de, manter);
    const ate = tempoEditado(t.ate, manter) ?? fim;
    if (de === null || ate - de < 0.2) continue;
    const pontos = (t.pontos ?? []).map((p) => ({ ...p, t: tempoEditado(p.t, manter) ?? de })).filter((p) => p.t >= de && p.t <= ate);
    trechos.push({ ...t, de, ate, ...(pontos.length ? { pontos } : {}) });
  }
  return { ...leitura, trechos };
}

/** As amostras da medição (worker) compactas e no tempo editado. */
export function amostrasNoTempoEditado(medida: Pick<MedidaDoWorker, "amostras"> | null | undefined, manter: Pedaco[] | null): AmostraDaJornada[] {
  const cx = (v: number[] | null | undefined): Caixa | null => (v && v.length === 4 && v.every(Number.isFinite) ? { x: arred(v[0]), y: arred(v[1]), w: arred(v[2]), h: arred(v[3]) } : null);
  const saida: AmostraDaJornada[] = [];
  for (const a of medida?.amostras ?? []) {
    const t = manter ? tempoEditado(a.t, manter) : a.t;
    if (t === null) continue;
    saida.push({
      t: arred(t),
      rostos: a.pessoas.map((p) => cx(p.rosto)).filter((c): c is Caixa => Boolean(c)),
      corpos: a.pessoas.map((p) => cx(p.caixa)).filter((c): c is Caixa => Boolean(c)),
      tela: cx(a.tela),
      quadro: cx(a.quadro),
    });
  }
  return saida;
}

// ─────────────────────────────── as frases (os momentos candidatos) ───────────────────────────────

export type Frase = { indice: number; de: number; ate: number; inicio: number; fim: number; texto: string };

/**
 * AS FRASES DA FALA: cada uma é um momento candidato do passo 4. Fecha na
 * pontuação final, na pausa de 0,6 s ou em 22 palavras; frase de menos de
 * 0,8 s junta com a seguinte. Nada é escolhido aqui.
 */
export function frasesDaFala(palavras: Palavra[]): Frase[] {
  const cruas: Array<{ de: number; ate: number }> = [];
  let de = 0;
  for (let i = 0; i < palavras.length; i++) {
    const pausa = i + 1 < palavras.length ? palavras[i + 1].inicio - palavras[i].fim : Infinity;
    const fecha = i === palavras.length - 1 || /[.!?…]["”]?$/.test(palavras[i].texto) || pausa >= 0.6 || i - de + 1 >= 22;
    if (!fecha) continue;
    cruas.push({ de, ate: i });
    de = i + 1;
  }
  const juntas: Array<{ de: number; ate: number }> = [];
  for (const f of cruas) {
    const ult = juntas[juntas.length - 1];
    if (ult && palavras[ult.ate].fim - palavras[ult.de].inicio < 0.8) ult.ate = f.ate;
    else juntas.push({ ...f });
  }
  return juntas.map((f, k) => ({
    indice: k,
    de: f.de,
    ate: f.ate,
    inicio: arred(palavras[f.de].inicio),
    fim: arred(palavras[f.ate].fim),
    texto: palavras.slice(f.de, f.ate + 1).map((p) => p.texto).join(" "),
  }));
}

/**
 * AS FRONTEIRAS DOS TRECHOS FINOS da leitura (E1): trechos de 4 a 10 s
 * alinhados às frases (um trecho termina sempre num fim de frase, ou é
 * partido ao meio quando a frase passa de 10 s). Cobrem [0, duracao].
 */
export function limitesFinos(palavras: Palavra[], duracao: number, min = 4, max = 10): Pedaco[] {
  if (duracao <= 0) return [];
  const fins = frasesDaFala(palavras).map((f) => f.fim).filter((t) => t > 0 && t < duracao);
  const cortes: number[] = [0];
  let ini = 0;
  for (const f of [...fins, duracao]) {
    while (f - ini > max) {
      ini = arred(ini + Math.min(max, Math.max(min, (f - ini) / Math.ceil((f - ini) / max))));
      cortes.push(ini);
    }
    if (f - ini >= min || f === duracao) {
      if (f !== ini) cortes.push(arred(f));
      ini = f;
    }
  }
  const lim = [...new Set(cortes)].sort((a, b) => a - b);
  // O último pedaço curto demais junta com o anterior, desde que não passe do máximo.
  if (lim.length > 2 && lim[lim.length - 1] - lim[lim.length - 2] < min && lim[lim.length - 1] - lim[lim.length - 3] <= max) lim.splice(lim.length - 2, 1);
  const saida: Pedaco[] = [];
  for (let i = 0; i < lim.length - 1; i++) saida.push({ de: lim[i], ate: lim[i + 1] });
  return saida;
}

/** O índice da palavra (na fala nova) que corresponde à palavra `indice` da fala antiga, pelo mapa de sequência. */
export function levarIndice(mapa: number[], indice: number): number {
  if (!mapa.length) return indice;
  return mapa[Math.max(0, Math.min(mapa.length - 1, indice))] ?? indice;
}
