/**
 * AS FAIXAS DE TELA COMPARTILHADA da gravação (01/10/2026). Módulo PURO: sem
 * banco, sem IA, sem rede. Quem detecta (quadros no worker e o Claude com
 * visão) mora em lib/media/telas-da-gravacao.ts; aqui ficam os tipos, a
 * detecção pela FALA, a junção das amostras em faixas e a conta de tempo.
 *
 * ## Por que existe
 *
 * No completo de 22 min do Bruno (30/09) a cobertura de edição foi de 2,9%: o
 * roteiro planejava sem saber onde havia tela compartilhada (só se sabia
 * depois do corte), e a montagem jogava fora toda cena que encostava na tela.
 * Os minutos 2 a 7 (o Bruno mostrando o Claude Code e o Notion) ficaram sem
 * nada. Agora o roteiro sabe ANTES, e o diretor planeja a tela como tela:
 * zoom na região que importa, chamada sobre o que está sendo mostrado, o
 * narrador continua no canto (a webcam da própria gravação).
 *
 * ## Duas fontes
 *
 * 1. A fala: "olha na minha tela", "vou compartilhar", "deixa eu te mostrar".
 *    Barata e imediata, mas só diz que a tela PROVAVELMENTE entra ali.
 * 2. Os quadros: um print a cada ~8 s e um logo depois de cada menção,
 *    classificados por visão (rosto, tela ou misto, e o que aparece).
 *
 * Tempos aqui são da GRAVAÇÃO; `faixasNoTrecho` leva para o tempo do corte ou
 * do completo (depois da limpeza de fala).
 */

/** Caixa em FRAÇÃO do quadro (0 a 1). */
export type Caixa = { x: number; y: number; w: number; h: number };

export type TipoDoQuadro = "camera" | "tela" | "misto";

/** Um print classificado. */
export type AmostraDeTela = {
  t: number;
  tipo: TipoDoQuadro;
  /** O que aparece na tela, em português e curto ("o Notion com o roteiro do vídeo"). */
  mostra?: string | null;
  /** A parte da tela que importa no momento (onde o olho deve ir): é para lá que o zoom vai. */
  regiao?: Caixa | null;
  /** Onde a pessoa aparece no quadro misto (a webcam no canto): nada pode cobrir. */
  narrador?: Caixa | null;
  /** O print foi tirado logo depois de uma menção na fala. */
  mencao?: boolean;
  /**
   * A extensão REAL das linhas de texto que passam pela região, medida nos
   * pixels do print (lib/media/linhas-da-tela.ts), com 4% de folga. É a caixa
   * do zoom: a região da visão sozinha cortava linha no meio.
   */
  linhas?: Caixa | null;
};

export type PontoDaTela = { t: number; mostra?: string | null; regiao?: Caixa | null; linhas?: Caixa | null };

export type FaixaDeTela = {
  de: number;
  ate: number;
  /** misto: tela com a webcam no canto; tela: só a tela. */
  tipo: "tela" | "misto";
  /** O que é mostrado ao longo da faixa, sem repetição, na ordem. */
  mostra: string[];
  /** Os prints da faixa, com a região de cada um (o zoom de cada cena vem do mais perto). */
  pontos: PontoDaTela[];
  narrador?: Caixa | null;
  /** quadros: visão; medida: diferença de quadros no worker; fala: só a menção. */
  fonte: "quadros" | "medida" | "fala";
};

/** O que fica guardado no roteiro (`completoMontagem.roteiro.telas`). */
export type TelasDaGravacao = {
  versao: 1;
  feitoEm: string;
  fonte: "quadros" | "medida" | "fala";
  amostras: number;
  mencoes: Array<{ t: number; frase: string }>;
  faixas: FaixaDeTela[];
  custoUsd?: number;
  /** Por que caiu numa fonte pior (worker sem a rota, visão falhou). */
  aviso?: string | null;
  /** O quadro da gravação, medido no worker: gravação em pé não tem tela compartilhada e monta 9:16. */
  quadro?: { largura: number; altura: number } | null;
};

// ─────────────────────────────── a fala ───────────────────────────────

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * As frases de quem vai mostrar a tela. Testadas no começo de uma janela de
 * até 7 palavras normalizadas (sem acento e sem pontuação), separadas por
 * espaço. Lista fechada e conservadora: "olha" sozinho não conta (é muleta).
 */
const FRASES_DE_TELA: RegExp[] = [
  /^(olha|olhe|olhem|veja|vejam) (aqui )?(na|a|pra|para) (minha )?tela/,
  /^(vou|vamos|deixa eu|deixe eu|deixa me) (te |lhes |vos )?(compartilhar|compartilho)/,
  /^compartilh(ar|o|ando|ei) (a |minha |aqui a )?tela/,
  /^(aqui|ali) na (minha )?tela/,
  /^na minha tela/,
  /^(deixa|deixe) (eu|me) (te |lhes |vos )?(mostrar|mostra)/,
  /^(vou|vamos) (te |lhes |vos )?mostrar/,
  /^(to|tou|estou) (te |lhes )?mostrando/,
  /^(voces|vc|voce) (estao|tao|esta|ta) vendo/,
  /^(da|de) uma olhada (aqui|nisso|nessa|nesse)/,
  /^olha so (isso|aqui|essa|esse)/,
  /^aqui no (meu )?(computador|notebook|navegador|claude|notion|chatgpt)/,
  /^(vou|deixa eu) abrir (aqui|o|a)/,
];

/** Os instantes (fim da frase) em que a pessoa anuncia que vai mostrar a tela. */
export function mencoesDeTela(palavras: Array<{ word: string; start: number; end: number }>): Array<{ t: number; frase: string }> {
  const tokens = palavras.map((p) => normalizar(p.word));
  const saida: Array<{ t: number; frase: string }> = [];
  let ultimo = -Infinity;
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i]) continue;
    const janela = tokens.slice(i, i + 7).filter(Boolean);
    const texto = janela.join(" ");
    for (const re of FRASES_DE_TELA) {
      const m = texto.match(re);
      if (!m) continue;
      const usadas = m[0].split(" ").length;
      // O índice da última palavra da frase, contando só os tokens não vazios.
      let k = i;
      let contadas = 0;
      while (k < tokens.length && contadas < usadas) {
        if (tokens[k]) contadas++;
        k++;
      }
      const fim = palavras[Math.max(i, k - 1)];
      // Duas menções a menos de 10 s são a mesma ("vou compartilhar, deixa eu te mostrar").
      if (fim.end - ultimo > 10) {
        saida.push({ t: +fim.end.toFixed(2), frase: palavras.slice(i, k).map((p) => p.word).join(" ") });
        ultimo = fim.end;
      }
      break;
    }
  }
  return saida;
}

// ─────────────────────────────── os prints ───────────────────────────────

/**
 * Onde tirar os prints: uma grade regular (um a cada `passo` s, a partir do
 * meio do primeiro passo) e, depois de cada menção, um a 1,5 s e outro a 5 s
 * (a tela costuma entrar logo depois de "deixa eu te mostrar"). O teto segura
 * o custo da visão num vídeo longo: acima dele, o passo cresce.
 */
export function instantesDeAmostra(duracao: number, mencoes: Array<{ t: number }>, passo = 8, teto = 220): Array<{ t: number; mencao: boolean }> {
  if (!(duracao > 0)) return [];
  const extras = mencoes.flatMap((m) => [m.t + 1.5, m.t + 5]).filter((t) => t < duracao - 0.2);
  const p = Math.max(passo, duracao / Math.max(10, teto - extras.length));
  const grade: number[] = [];
  for (let t = p / 2; t < duracao - 0.2; t += p) grade.push(t);
  const todos = [...grade.map((t) => ({ t, mencao: false })), ...extras.map((t) => ({ t, mencao: true }))].sort((a, b) => a.t - b.t);
  // Dois prints a menos de 1,5 s dizem a mesma coisa: fica o da menção.
  const saida: Array<{ t: number; mencao: boolean }> = [];
  for (const x of todos) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && x.t - ultimo.t < 1.5) {
      if (x.mencao) ultimo.mencao = true;
      continue;
    }
    saida.push({ t: +x.t.toFixed(2), mencao: x.mencao });
  }
  return saida;
}

// ─────────────────────────────── as faixas ───────────────────────────────

const ehTela = (a: AmostraDeTela) => a.tipo !== "camera";

/** A caixa típica (mediana de cada lado) de uma lista. */
function caixaTipica(caixas: Array<Caixa | null | undefined>): Caixa | null {
  const v = caixas.filter((c): c is Caixa => Boolean(c && c.w > 0 && c.h > 0));
  if (!v.length) return null;
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return { x: med(v.map((c) => c.x)), y: med(v.map((c) => c.y)), w: med(v.map((c) => c.w)), h: med(v.map((c) => c.h)) };
}

/**
 * As amostras viram faixas: a troca entre câmera e tela cai no MEIO entre
 * duas amostras de classes diferentes (a troca de cena do OBS pode estar em
 * qualquer ponto entre os prints). Faixa de tela mais curta que `minSeg` some
 * (um print isolado de tela no meio da câmera é a pessoa erguendo o celular,
 * não uma tela compartilhada).
 */
export function faixasDasAmostras(amostras: AmostraDeTela[], duracao: number, minSeg = 6): FaixaDeTela[] {
  const a = [...amostras].sort((x, y) => x.t - y.t);
  if (!a.length) return [];
  const faixas: FaixaDeTela[] = [];
  let i = 0;
  while (i < a.length) {
    if (!ehTela(a[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < a.length && ehTela(a[j + 1])) j++;
    const de = i === 0 ? 0 : (a[i - 1].t + a[i].t) / 2;
    const ate = j === a.length - 1 ? duracao : (a[j].t + a[j + 1].t) / 2;
    const grupo = a.slice(i, j + 1);
    if (ate - de >= minSeg) {
      const mistos = grupo.filter((x) => x.tipo === "misto").length;
      const mostra: string[] = [];
      for (const x of grupo) {
        const m = x.mostra?.trim();
        if (m && !mostra.some((y) => y.toLowerCase() === m.toLowerCase())) mostra.push(m);
      }
      faixas.push({
        de: +de.toFixed(2),
        ate: +ate.toFixed(2),
        tipo: mistos * 2 >= grupo.length ? "misto" : "tela",
        mostra: mostra.slice(0, 8),
        pontos: grupo.map((x) => ({ t: x.t, mostra: x.mostra ?? null, regiao: x.regiao ?? null, linhas: x.linhas ?? null })),
        narrador: caixaTipica(grupo.map((x) => x.narrador)),
        fonte: "quadros",
      });
    }
    i = j + 1;
  }
  return faixas;
}

/** O complemento dos trechos de câmera medidos pelo worker (a reserva quando a visão não roda). */
export function faixasDaMedida(trechosDeCamera: Array<{ de: number; ate: number }>, duracao: number, minSeg = 6): FaixaDeTela[] {
  const cam = [...trechosDeCamera].sort((a, b) => a.de - b.de);
  const faixas: FaixaDeTela[] = [];
  let cursor = 0;
  for (const c of cam) {
    if (c.de - cursor >= minSeg) faixas.push({ de: +cursor.toFixed(2), ate: +c.de.toFixed(2), tipo: "misto", mostra: [], pontos: [], narrador: null, fonte: "medida" });
    cursor = Math.max(cursor, c.ate);
  }
  if (duracao - cursor >= minSeg) faixas.push({ de: +cursor.toFixed(2), ate: +duracao.toFixed(2), tipo: "misto", mostra: [], pontos: [], narrador: null, fonte: "medida" });
  return faixas;
}

/**
 * Só a fala, quando nem os prints nem a medida existem: da menção até 40 s
 * depois (ou a próxima menção). É uma suposição, e o plano a trata com
 * cuidado: chamada de texto sim, colagem por cima não.
 */
export function faixasDaFala(mencoes: Array<{ t: number }>, duracao: number, alcance = 40): FaixaDeTela[] {
  const faixas: FaixaDeTela[] = [];
  for (const m of mencoes) {
    const de = m.t;
    const ate = Math.min(duracao, m.t + alcance);
    const ultima = faixas[faixas.length - 1];
    if (ultima && de <= ultima.ate) ultima.ate = Math.max(ultima.ate, ate);
    else faixas.push({ de: +de.toFixed(2), ate: +ate.toFixed(2), tipo: "misto", mostra: [], pontos: [], narrador: null, fonte: "fala" });
  }
  return faixas;
}

// ─────────────────────────────── o tempo ───────────────────────────────

/**
 * Um instante da GRAVAÇÃO no tempo do trecho limpo (corte ou completo). O
 * instante que caiu numa remoção vai para o começo do próximo pedaço mantido,
 * então a conta nunca devolve vazio e é sempre crescente (borda de faixa
 * dentro de uma pausa removida continua sendo uma borda).
 */
export function paraOTempoDoTrecho(t: number, inicio: number, manter: Array<{ de: number; ate: number }>): number {
  const x = t - inicio;
  let acumulado = 0;
  for (const m of manter) {
    if (x < m.de) return acumulado;
    if (x <= m.ate) return acumulado + (x - m.de);
    acumulado += m.ate - m.de;
  }
  return acumulado;
}

/** As faixas no tempo do trecho, recortadas nele; a que sobra com menos de 1 s some. */
export function faixasNoTrecho(faixas: FaixaDeTela[], inicio: number, fim: number, manter: Array<{ de: number; ate: number }>): FaixaDeTela[] {
  const saida: FaixaDeTela[] = [];
  for (const f of faixas) {
    if (f.ate <= inicio || f.de >= fim) continue;
    const de = paraOTempoDoTrecho(Math.max(f.de, inicio), inicio, manter);
    const ate = paraOTempoDoTrecho(Math.min(f.ate, fim), inicio, manter);
    if (ate - de < 1) continue;
    saida.push({
      ...f,
      de: +de.toFixed(2),
      ate: +ate.toFixed(2),
      pontos: f.pontos.filter((p) => p.t >= inicio && p.t <= fim).map((p) => ({ ...p, t: +paraOTempoDoTrecho(p.t, inicio, manter).toFixed(2) })),
    });
  }
  return saida;
}

/** A faixa que cobre o instante (tempo do trecho), ou null. */
export function faixaNoInstante(faixas: FaixaDeTela[], t: number): FaixaDeTela | null {
  return faixas.find((f) => t >= f.de && t < f.ate) ?? null;
}

/** O print mais perto do instante (com região, se houver um a até 20 s). */
export function pontoMaisPerto(f: FaixaDeTela, t: number): PontoDaTela | null {
  const comRegiao = f.pontos.filter((p) => p.regiao);
  const lista = comRegiao.length ? comRegiao : f.pontos;
  let melhor: PontoDaTela | null = null;
  for (const p of lista) if (!melhor || Math.abs(p.t - t) < Math.abs(melhor.t - t)) melhor = p;
  return melhor && Math.abs(melhor.t - t) <= 20 ? melhor : null;
}

/**
 * A caixa da webcam com folga (01/10). A visão erra a caixa por alguns por
 * cento (na prova: x 0,78 para uma webcam que começa em 0,74), e o erro tem
 * dois efeitos ruins: a borda da webcam entra na medida das linhas como se
 * fosse texto, e a webcam colada de volta depois do zoom sai pela metade, com
 * o resto da webcam ampliada aparecendo ao lado. Com 25% da caixa de folga
 * para cada lado (pelo menos 3% do quadro), presa ao quadro, a caixa cobre a
 * webcam real; colar um pouco a mais do quadro original em volta não se nota.
 */
export function webcamComFolga(c: Caixa | null | undefined): Caixa | null {
  if (!c) return null;
  const fx = Math.max(0.03, c.w * 0.25);
  const fy = Math.max(0.03, c.h * 0.25);
  const x = Math.max(0, c.x - fx);
  const y = Math.max(0, c.y - fy);
  return { x: +x.toFixed(3), y: +y.toFixed(3), w: +(Math.min(1, c.x + c.w + fx) - x).toFixed(3), h: +(Math.min(1, c.y + c.h + fy) - y).toFixed(3) };
}

/**
 * O ZOOM NA TELA sem cortar texto (01/10). A caixa é a das LINHAS MEDIDAS no
 * print (`medirLinhasDeTexto`, já com 4% de folga), e não a região da visão,
 * que pegava só parte das linhas. O fator é o que faz a caixa caber inteira
 * com 10% de margem:
 *   zoom = min(1,8, 1 / (largura * 1,1), 1 / (altura * 1,1))
 * Abaixo de 1,05 não há zoom (null). A webcam NÃO precisa caber: depois do
 * zoom, o worker cola de volta a webcam do quadro original no mesmo canto
 * (worker/src/montagem-do-completo.mjs). Sem caixa medida, sem zoom.
 */
export function janelaDoZoomNaTela(linhas: Caixa | null | undefined): { caixa: Caixa; zoom: number } | null {
  if (!linhas || !(linhas.w > 0) || !(linhas.h > 0)) return null;
  const zoom = Math.min(1.8, 1 / (linhas.w * 1.1), 1 / (linhas.h * 1.1));
  if (zoom < 1.05) return null;
  return { caixa: linhas, zoom: +zoom.toFixed(3) };
}

/** Os trechos de câmera (complemento das faixas), no formato que a montagem do completo usa. */
export function cameraForaDasFaixas(faixas: FaixaDeTela[], duracao: number): Array<{ de: number; ate: number }> {
  const saida: Array<{ de: number; ate: number }> = [];
  let cursor = 0;
  for (const f of [...faixas].sort((a, b) => a.de - b.de)) {
    if (f.de > cursor) saida.push({ de: cursor, ate: f.de });
    cursor = Math.max(cursor, f.ate);
  }
  if (cursor < duracao) saida.push({ de: cursor, ate: duracao });
  return saida;
}
