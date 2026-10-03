import {
  intervaloDaCena,
  normalizarPalavra,
  type CenaDoPlano,
  type ElementoDoPlano,
  type PalavraNoCorte,
  type PlanoDeMontagem,
} from "@/lib/media/plano-de-montagem";

/**
 * AS GUARDAS DO COMPLETO (02/10/2026). Módulo PURO: a esteira, a revisão
 * visual e o script de prova importam daqui.
 *
 * A reprovação do Bruno no completo cmuqc9r7z (MrBeast, tour pelo escritório
 * e pregação em Lucas 5) tinha três defeitos de critério, e não de gosto:
 *
 * 1. O DIRETOR COBRIA O QUE A PESSOA ESTAVA MOSTRANDO. "Ali é minha mesa,
 *    olha" levou uma colagem de "a simple wooden work desk" com "MINHA MESA"
 *    por cima da mesa real; "ali a areazinha de café", um "coffee corner"; a
 *    porta, o sol e a represa, na mesma linha. O diretor só lê texto. Aqui a
 *    demonstração é detectada pela FALA (olha, ali, aqui, vou mostrar, está
 *    vendo, este é, deixa eu mostrar) e confirmada pela IMAGEM (quadros da
 *    gravação classificados com visão em lib/media/demonstracao.ts), e nada
 *    cobre esses trechos. Gravação que é majoritariamente demonstração recebe
 *    quase nenhuma inserção. Inserção ilustra ideia abstrata; nunca substitui
 *    o que a câmera já mostra.
 * 2. TEXTO DEMAIS NA TELA: uma palavra gigante a cada frase. Aqui há teto por
 *    minuto e espaço mínimo entre dois textos.
 * 3. INSERÇÃO DEMAIS (cobertura de 39%): as cotas por minuto caíram em
 *    ritmo-da-edicao.ts; este módulo só aplica as guardas que dependem da
 *    gravação.
 */

// ─────────────────────────────── a fala que aponta ───────────────────────────────

/**
 * Expressões que apontam para algo na cena. FORTES só existem apontando
 * ("está vendo", "deixa eu mostrar", "atrás de mim"); FRACAS também aparecem
 * em fala comum ("aqui em Lucas cinco", "lá tem dois barcos" contando a
 * história, "quero mostrar pra vocês" a vida) e só valem confirmadas pela
 * imagem ou coladas (até 8 s) num trecho já confirmado: no tour, uma frase
 * puxa a outra ("Lá tem a represa", "E aqui é da onde eu oro", "Ali é da onde
 * eu tomo meu cafezinho"). Medido na prova de 02/10 contra o vídeo inteiro.
 */
const FORTES: string[][] = [
  ["olhem"],
  ["vou", "mostrar"], ["vou", "te", "mostrar"], ["deixa", "eu", "mostrar"], ["deixa", "eu", "te", "mostrar"], ["deixa", "eu", "ver"],
  ["esta", "vendo"], ["ta", "vendo"], ["tao", "vendo"], ["estao", "vendo"], ["da", "pra", "ver"], ["consegue", "ver"], ["conseguem", "ver"], ["voces", "verem"],
  ["atras", "de", "mim"], ["desse", "lado"], ["daquele", "lado"], ["do", "lado", "de", "ca"], ["la", "no", "fundo"],
];
const FRACAS_EM_SEQUENCIA: string[][] = [
  ["este", "e"], ["esse", "e"], ["essa", "e"], ["esta", "aqui"], ["essa", "aqui"], ["esse", "aqui"], ["isso", "aqui"],
  ["ali", "tem"], ["la", "tem"], ["aqui", "tem"], ["mostrar", "pra", "voces"], ["mostrar", "para", "voces"], ["pra", "mostrar"], ["para", "mostrar"],
  ["repara"], ["reparem"], ["vejam"],
];
const FRACAS = new Set(["aqui", "ali", "la", "aca"]);
/** Uma frase fraca colada (até tantos segundos) num trecho confirmado também é demonstração. */
export const COLADA_NA_DEMONSTRACAO_SEG = 8;

export type ApontaNaFala = { de: number; ate: number; inicio: number; fim: number; forca: "forte" | "fraca"; frase: string; /** O segundo de cada palavra que aponta. */ marcas: number[] };

const fechaFrase = (t: string) => /[.!?…]["”]?$/.test(t);

/** A frase (índices) que contém a palavra i: da palavra depois do último ponto até o próximo ponto. */
function fraseDe(palavras: PalavraNoCorte[], i: number): { de: number; ate: number } {
  let de = i;
  while (de > 0 && !fechaFrase(palavras[de - 1].texto) && palavras[de].inicio - palavras[de - 1].fim < 0.7 && i - de < 30) de--;
  let ate = i;
  while (ate < palavras.length - 1 && !fechaFrase(palavras[ate].texto) && palavras[ate + 1].inicio - palavras[ate].fim < 0.7 && ate - i < 30) ate++;
  return { de, ate };
}

/** As frases da fala que apontam para a cena, com a força de cada uma. */
export function demonstracaoNaFala(palavras: PalavraNoCorte[]): ApontaNaFala[] {
  const n = palavras.map((p) => normalizarPalavra(p.texto));
  const achados: ApontaNaFala[] = [];
  for (let i = 0; i < n.length; i++) {
    let forca: "forte" | "fraca" | null = null;
    if (FORTES.some((seq) => seq.every((w, k) => n[i + k] === w))) forca = "forte";
    // "olha" só aponta com um lugar na mesma frase ("ali é minha mesa,
    // olha", "olha ali"); "fala olha, agora vocês vão" é citação e "olha que
    // interessante" é muleta.
    if (!forca && n[i] === "olha") {
      const f = fraseDe(palavras, i);
      if (n.slice(f.de, f.ate + 1).some((w) => FRACAS.has(w))) forca = "forte";
    }
    if (!forca && (FRACAS.has(n[i]) || FRACAS_EM_SEQUENCIA.some((seq) => seq.every((w, k) => n[i + k] === w)))) forca = "fraca";
    if (!forca) continue;
    const f = fraseDe(palavras, i);
    const ultimo = achados[achados.length - 1];
    if (ultimo && f.de <= ultimo.ate) {
      ultimo.ate = Math.max(ultimo.ate, f.ate);
      ultimo.fim = palavras[ultimo.ate].fim;
      if (forca === "forte") ultimo.forca = "forte";
      ultimo.marcas.push(palavras[i].inicio);
      ultimo.frase = palavras.slice(ultimo.de, ultimo.ate + 1).map((p) => p.texto).join(" ");
      continue;
    }
    achados.push({ de: f.de, ate: f.ate, inicio: palavras[f.de].inicio, fim: palavras[f.ate].fim, forca, frase: palavras.slice(f.de, f.ate + 1).map((p) => p.texto).join(" "), marcas: [palavras[i].inicio] });
  }
  return achados;
}

// ─────────────────────────────── a imagem que mostra ───────────────────────────────

/** Um quadro da gravação classificado pela visão (lib/media/demonstracao.ts). */
export type QuadroClassificado = { t: number; tipo: "camera" | "ambiente" | "incerto"; oQue?: string | null };

export type TrechoDeDemonstracao = { inicio: number; fim: number; por: string; frase?: string };

export type Demonstracao = {
  trechos: TrechoDeDemonstracao[];
  /** Fração do vídeo em demonstração (0 a 1). */
  fracao: number;
  /** A gravação é majoritariamente demonstração ou tour. */
  majoritaria: boolean;
  /** Quadros classificados (para o relatório). */
  quadros: number;
  /** A visão falhou: valeu só a fala forte. */
  semVisao?: boolean;
};

/** Folga em volta de cada trecho de demonstração: a inserção não encosta nele. */
export const FOLGA_DA_DEMONSTRACAO_SEG = 1.5;
/** Fração que torna a gravação "majoritariamente demonstração". */
export const FRACAO_DE_TOUR = 0.45;

/**
 * Os instantes que a visão precisa ver, SÓ ONDE HÁ DÚVIDA (02/10, custo):
 * o texto decide primeiro (`juntarDemonstracao` sem quadros), e a visão olha
 * um quadro no meio de cada frase fraca que o texto não decidiu e de cada
 * inserção que ainda não encosta num trecho decidido, mais uma amostra de
 * fundo a cada 20 s (a medida de "majoritariamente tour"). Na prova, a
 * primeira versão (fundo a cada 6 s, três quadros por frase e dois por
 * inserção, 360 px) custava US$ 0,13 por vídeo de 4 min; esta, um terço.
 */
export function instantesDaDemonstracao(plano: PlanoDeMontagem | null, palavras: PalavraNoCorte[], duracao: number, aponta: ApontaNaFala[], decididos: TrechoDeDemonstracao[] = []): number[] {
  const ts = new Set<number>();
  const r = (t: number) => Math.round(Math.max(0, Math.min(duracao - 0.2, t)) * 2) / 2;
  const decidido = (a: number, b: number) => decididos.some((d) => a < d.fim + FOLGA_DA_DEMONSTRACAO_SEG && b > d.inicio - FOLGA_DA_DEMONSTRACAO_SEG);
  for (let t = 2; t < duracao - 0.5; t += 20) ts.add(r(t));
  for (const a of aponta) {
    if (a.forca === "forte" || decidido(a.inicio, a.fim)) continue;
    for (const t of a.marcas) ts.add(r(t + 0.3));
  }
  for (const c of plano?.cenas ?? []) {
    if (c.layout === "narrador-cheio" && !c.elementos.length) continue;
    const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
    if (decidido(inicio, fim)) continue;
    ts.add(r((inicio + fim) / 2));
  }
  return [...ts].sort((a, b) => a - b);
}

/**
 * Junta fala e imagem nos trechos de demonstração:
 *   - frase com apontar FORTE é demonstração, com ou sem visão;
 *   - frase com apontar FRACO só se algum quadro dela mostra o ambiente;
 *   - quadro que mostra o ambiente, mesmo sem fala que aponte, é
 *     demonstração do quadro anterior ao seguinte (a câmera virada para o
 *     lugar, andando).
 */
export function juntarDemonstracao(aponta: ApontaNaFala[], quadros: QuadroClassificado[] | null, duracao: number): Demonstracao {
  const trechos: TrechoDeDemonstracao[] = [];
  const ordenados = [...(quadros ?? [])].sort((a, b) => a.t - b.t);
  const mostraEntre = (a: number, b: number) => ordenados.some((q) => q.t >= a - 0.3 && q.t <= b + 0.3 && q.tipo === "ambiente");
  const confirmadas = new Set<number>();
  aponta.forEach((a, k) => {
    if (a.forca === "forte" || (quadros && mostraEntre(a.inicio, a.fim))) confirmadas.add(k);
  });
  // A frase fraca colada num trecho confirmado (o tour seguindo de cômodo em
  // cômodo) também é demonstração; repete até parar de crescer.
  for (let mudou = true; mudou; ) {
    mudou = false;
    aponta.forEach((a, k) => {
      if (confirmadas.has(k)) return;
      // A distância é da PALAVRA que aponta, e não do começo da frase: uma
      // frase longa que só diz "lá" no fim ("lá tem dois barcos", contando a
      // história) não se cola no tour que acabou 10 s antes.
      const perto = [...confirmadas].some((j) => a.marcas.some((t) => t < aponta[j].fim + COLADA_NA_DEMONSTRACAO_SEG && t > aponta[j].inicio - COLADA_NA_DEMONSTRACAO_SEG));
      if (perto) {
        confirmadas.add(k);
        mudou = true;
      }
    });
  }
  aponta.forEach((a, k) => {
    if (!confirmadas.has(k)) return;
    const por = a.forca === "forte" ? "fala" : quadros && mostraEntre(a.inicio, a.fim) ? "fala e imagem" : "fala, colada no tour";
    trechos.push({ inicio: a.inicio, fim: a.fim, por, frase: a.frase });
  });
  ordenados.forEach((q, k) => {
    if (q.tipo !== "ambiente") return;
    const antes = ordenados[k - 1]?.t ?? Math.max(0, q.t - 2);
    const depois = ordenados[k + 1]?.t ?? Math.min(duracao, q.t + 2);
    // Do meio do caminho até o vizinho, para não engolir o trecho de câmera.
    trechos.push({ inicio: Math.max(0, (antes + q.t) / 2), fim: Math.min(duracao, (q.t + depois) / 2), por: `imagem${q.oQue ? `: ${q.oQue}` : ""}` });
  });
  const juntos: TrechoDeDemonstracao[] = [];
  for (const t of trechos.sort((a, b) => a.inicio - b.inicio)) {
    const u = juntos[juntos.length - 1];
    if (u && t.inicio <= u.fim + 0.5) {
      u.fim = Math.max(u.fim, t.fim);
      if (!u.por.includes(t.por.split(":")[0])) u.por = `${u.por}; ${t.por}`;
      if (t.frase && !u.frase?.includes(t.frase)) u.frase = [u.frase, t.frase].filter(Boolean).join(" / ");
    } else juntos.push({ ...t });
  }
  const soma = juntos.reduce((s, t) => s + (t.fim - t.inicio), 0);
  // A fração "de tour" pela amostra de fundo, que é uniforme no tempo; sem
  // visão, pela soma dos trechos da fala.
  const fundo = ordenados.filter((q) => q.tipo !== "incerto");
  const fracaoPelaImagem = fundo.length >= 6 ? fundo.filter((q) => q.tipo === "ambiente").length / fundo.length : null;
  const fracao = +(fracaoPelaImagem ?? (duracao ? soma / duracao : 0)).toFixed(3);
  return { trechos: juntos.map((t) => ({ ...t, inicio: +t.inicio.toFixed(2), fim: +t.fim.toFixed(2) })), fracao, majoritaria: fracao >= FRACAO_DE_TOUR, quadros: ordenados.length, ...(quadros ? {} : { semVisao: true }) };
}

// ─────────────────────────────── o plano ───────────────────────────────

export type DecisaoDaGuarda = { cena: number; antes: string; depois: string; motivo: string; inicio: number; fim: number };

const ehInsercao = (c: CenaDoPlano) => c.layout !== "narrador-cheio" || c.elementos.length > 0;
/**
 * A cena que o CLIENTE pediu ou reescreveu (02/10): as guardas automáticas
 * (demonstração, relâmpago, coisa real da pessoa, teto de texto) não mexem
 * nela. O que continua valendo é a conferência das imagens (roupa, respeito,
 * pessoa real) e a revisão visual do vídeo pronto.
 */
export const pedidaPeloCliente = (c: CenaDoPlano) => Boolean(c.pedido) || c.ajuste === "editado" || c.ajuste === "nova-ideia";

/** A cena volta à pessoa: narrador cheio sem nada por cima e sem movimento (câmera na mão já mexe). */
function paraPessoa(c: CenaDoPlano, motivo: string, parado: boolean): CenaDoPlano {
  // Parada, a cena volta ao plano aberto (03/10): o enquadramento fechado do
  // corte limpo recortaria o que a pessoa mostra.
  return { ...c, layout: "narrador-cheio", asset: undefined, elementos: [], movimento: parado ? "estatico" : c.movimento, movimentoNa: parado ? undefined : c.movimentoNa, zoom: parado ? undefined : c.zoom, motivo: `${c.motivo} (${motivo})` };
}

const descreve = (c: CenaDoPlano) =>
  `${c.layout}${c.asset ? ` ${c.asset}` : ""}${c.elementos.length ? ` [${c.elementos.map((e) => ("texto" in e ? `${e.tipo}: ${e.texto}` : e.tipo)).join("; ")}]` : ""}`;

/**
 * NADA COBRE A DEMONSTRAÇÃO. Toda inserção (layout que não é narrador cheio,
 * ou elemento por cima) que encosta num trecho de demonstração, com a folga,
 * volta à pessoa, parada. Na gravação majoritariamente demonstração, as
 * inserções que sobram fora dos trechos ficam no máximo uma a cada 2 min, só
 * as de maior peso (cartela e número antes de imagem).
 */
export function tirarCoberturaDaDemonstracao(
  plano: PlanoDeMontagem,
  palavras: PalavraNoCorte[],
  duracao: number,
  d: Demonstracao
): { plano: PlanoDeMontagem; decisoes: DecisaoDaGuarda[] } {
  const decisoes: DecisaoDaGuarda[] = [];
  const toca = (a: number, b: number) =>
    d.trechos.find((t) => a < t.fim + FOLGA_DA_DEMONSTRACAO_SEG && b > t.inicio - FOLGA_DA_DEMONSTRACAO_SEG) ?? null;
  let cenas = plano.cenas.map((c, i) => {
    const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
    const t = toca(inicio, fim);
    if (!t || pedidaPeloCliente(c)) return c;
    // Movimento de câmera em cima da câmera andando também sai.
    // E o enquadramento fechado do corte limpo (03/10): na demonstração, plano aberto.
    if (!ehInsercao(c)) return c.movimento === "estatico" && !c.zoom ? c : { ...c, movimento: "estatico" as const, movimentoNa: undefined, zoom: undefined };
    const nova = paraPessoa(c, `demonstração: ${t.por}`, true);
    decisoes.push({ cena: i, antes: descreve(c), depois: "narrador-cheio", motivo: `cobria a demonstração (${t.por}${t.frase ? `: "${t.frase.slice(0, 80)}"` : ""})`, inicio, fim });
    return nova;
  });
  if (d.majoritaria) {
    const teto = Math.max(1, Math.floor(duracao / 120));
    const peso = (c: CenaDoPlano) => (c.layout === "cartela" ? 3 : c.elementos.some((e) => e.tipo === "numero") ? 2 : c.layout === "narrador-cheio" ? 1 : 0);
    const restantes = cenas.map((c, i) => ({ c, i })).filter(({ c }) => ehInsercao(c)).sort((a, b) => peso(b.c) - peso(a.c));
    const ficam = new Set(restantes.slice(0, teto).map((x) => x.i));
    cenas = cenas.map((c, i) => {
      if (!ehInsercao(c) || ficam.has(i)) return c;
      const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
      decisoes.push({ cena: i, antes: descreve(c), depois: "narrador-cheio", motivo: `gravação majoritariamente demonstração (${Math.round(d.fracao * 100)}% do tempo): teto de ${teto} inserção(ões)`, inicio, fim });
      return paraPessoa(c, "gravação de demonstração", false);
    });
  }
  return { plano: { ...plano, cenas }, decisoes };
}

const POSSE = new Set(["meu", "minha", "meus", "minhas", "nosso", "nossa", "nossos", "nossas"]);

/**
 * INSERÇÃO QUE NÃO SE SUSTENTA (02/10):
 *   - RELÂMPAGO: inserção de menos de 1,2 s (o B-roll de 0,1 s em cima de
 *     "o", o número de 0,4 s em "empresa") pisca e não se lê; volta à pessoa;
 *   - A COISA REAL DA PESSOA desenhada por IA: imagem gerada na frase que fala
 *     do que é DELA ("a minha mesa", "nossa casa", "o nosso quarto está quase
 *     pronto") troca o real por uma invenção. Inserção ilustra ideia; o que é
 *     da pessoa, ou a câmera mostra, ou não aparece.
 */
export function semInsercaoQueNaoSeSustenta(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, minimoSeg = 1.2): { plano: PlanoDeMontagem; decisoes: DecisaoDaGuarda[] } {
  const decisoes: DecisaoDaGuarda[] = [];
  const cenas = plano.cenas.map((c, i) => {
    if (!ehInsercao(c) || pedidaPeloCliente(c)) return c;
    const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
    if (fim - inicio < minimoSeg) {
      decisoes.push({ cena: i, antes: descreve(c), depois: "narrador-cheio", motivo: `inserção relâmpago de ${(fim - inicio).toFixed(1)} s`, inicio, fim });
      return paraPessoa(c, "inserção curta demais", false);
    }
    const temImagem = Boolean(c.asset) && c.layout !== "narrador-cheio" && c.layout !== "cartela";
    const fala = palavras.slice(Math.max(0, c.de - 2), c.ate + 1).map((p) => normalizarPalavra(p.texto));
    if (temImagem && fala.some((w) => POSSE.has(w))) {
      decisoes.push({ cena: i, antes: descreve(c), depois: "narrador-cheio", motivo: `imagem gerada no lugar de algo real da pessoa ("${palavras.slice(c.de, c.ate + 1).map((p) => p.texto).join(" ").slice(0, 60)}")`, inicio, fim });
      return paraPessoa(c, "coisa real da pessoa", false);
    }
    return c;
  });
  return { plano: { ...plano, cenas }, decisoes };
}

/** Os tipos que são TEXTO na tela (palavra, destaque, título, carimbo, tarja). */
// A faixa e o comentário do consórcio (02/10) contam como texto; o selo é a
// assinatura da marca, um por vídeo, e não disputa o teto.
const TEXTO_NA_TELA = new Set<ElementoDoPlano["tipo"]>(["letras-revista", "marca-texto", "carimbo", "titulo", "tarja", "faixa", "comentario"]);

/**
 * POUCAS PALAVRAS NA TELA (02/10): no máximo `porMinuto` textos por minuto e
 * `espacoSeg` entre dois. A cartela fica com o texto dela (é o que ela é);
 * palavra por cima de imagem (B-roll, canto) sai primeiro, depois a palavra
 * solta no narrador cheio; o destaque (marca-texto) da frase de virada é o
 * último a sair. Cena que perde o único elemento e fica sem nada volta à
 * pessoa.
 */
export function limitarTextoNaTela(
  plano: PlanoDeMontagem,
  palavras: PalavraNoCorte[],
  duracao: number,
  o: { porMinuto: number; espacoSeg: number }
): { plano: PlanoDeMontagem; decisoes: DecisaoDaGuarda[] } {
  const decisoes: DecisaoDaGuarda[] = [];
  type Item = { ci: number; k: number; t: number; prioridade: number };
  const itens: Item[] = [];
  plano.cenas.forEach((c, ci) => {
    c.elementos.forEach((e, k) => {
      if (!TEXTO_NA_TELA.has(e.tipo)) return;
      const t = palavras[e.palavra]?.inicio ?? intervaloDaCena(c, palavras, duracao).inicio;
      const prioridade = c.layout === "cartela" || pedidaPeloCliente(c) ? 100 : e.tipo === "marca-texto" || e.tipo === "tarja" || e.tipo === "comentario" || e.tipo === "faixa" ? 30 : c.layout === "narrador-cheio" ? 20 : 5;
      itens.push({ ci, k, t, prioridade });
    });
  });
  const teto = Math.max(1, Math.round((duracao / 60) * o.porMinuto));
  const ficam: Item[] = [];
  for (const it of [...itens].sort((a, b) => b.prioridade - a.prioridade || a.t - b.t)) {
    if (it.prioridade < 100 && ficam.length >= teto) continue;
    if (it.prioridade < 100 && ficam.some((f) => Math.abs(f.t - it.t) < o.espacoSeg)) continue;
    ficam.push(it);
  }
  const fica = new Set(ficam.map((f) => `${f.ci}:${f.k}`));
  const cenas = plano.cenas.map((c, ci) => {
    const elementos = c.elementos.filter((e, k) => !TEXTO_NA_TELA.has(e.tipo) || fica.has(`${ci}:${k}`));
    if (elementos.length === c.elementos.length) return c;
    const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
    const tirados = c.elementos.filter((e) => !elementos.includes(e)).map((e) => ("texto" in e ? e.texto : e.tipo)).join(", ");
    decisoes.push({ cena: ci, antes: descreve(c), depois: elementos.length || c.layout !== "narrador-cheio" ? `${c.layout} sem "${tirados}"` : "narrador-cheio", motivo: `texto demais na tela (teto de ${o.porMinuto} por minuto, ${o.espacoSeg} s entre dois)`, inicio, fim });
    const nova = { ...c, elementos };
    // A cartela sem texto não tem o que mostrar, e o recortado sem texto
    // deixa a faixa de cima vazia na cor da marca (prova do corte de 02/10):
    // os dois voltam à pessoa em tela cheia.
    if ((c.layout === "cartela" || c.layout === "narrador-recortado") && !elementos.length) return paraPessoa(nova, `${c.layout} sem texto`, false);
    return nova;
  });
  return { plano: { ...plano, cenas }, decisoes };
}

/**
 * A VERSÃO SEGURA (02/10): corte limpo com legenda e zoom, sem inserção. É o
 * que vai ao ar quando a revisão visual ainda acha defeito depois de duas
 * rodadas de conserto: a fala do cliente, enquadrada, com o movimento das
 * cenas cheias, e nada por cima.
 */
export function planoSeguro(plano: PlanoDeMontagem): PlanoDeMontagem {
  return {
    ...plano,
    assets: [],
    cenas: plano.cenas.map((c) => ({ ...c, layout: "narrador-cheio" as const, asset: undefined, elementos: [], transicao: "corte" as const, motivo: `${c.motivo} (versão segura)` })),
  };
}

/** A cena do plano em que cai o instante `t` (tempo da base). */
export function cenaNoInstante(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, t: number): number {
  return plano.cenas.findIndex((c) => {
    const x = intervaloDaCena(c, palavras, duracao);
    return t >= x.inicio && t < x.fim;
  });
}

/** Volta as cenas pedidas à pessoa (conserto da revisão visual). */
export function voltarCenasParaPessoa(plano: PlanoDeMontagem, indices: number[], motivo: string): PlanoDeMontagem {
  const alvo = new Set(indices);
  return { ...plano, cenas: plano.cenas.map((c, i) => (alvo.has(i) && ehInsercao(c) ? paraPessoa(c, motivo, false) : c)) };
}

/**
 * NUNCA AMPLIAR IMAGEM PEQUENA PARA A TELA CHEIA (02/10): o B-roll cheio de
 * uma imagem menor que o quadro (mais de 12% de ampliação para cobrir) vira o
 * canto, onde a imagem aparece no tamanho dela; sem canto na linguagem, a
 * cena volta à pessoa. `medidas`: id do asset para largura e altura.
 */
export function semAmpliarImagemPequena(
  plano: PlanoDeMontagem,
  medidas: Record<string, { largura?: number; altura?: number } | undefined>,
  quadro: { largura: number; altura: number },
  comCanto = true
): { plano: PlanoDeMontagem; trocadas: number[] } {
  const trocadas: number[] = [];
  const cenas = plano.cenas.map((c, i) => {
    if (c.layout !== "broll-cheio" || !c.asset) return c;
    const m = medidas[c.asset];
    if (!m?.largura || !m.altura) return c;
    const escala = Math.max(quadro.largura / m.largura, quadro.altura / m.altura);
    if (escala <= 1.12) return c;
    trocadas.push(i);
    return comCanto ? { ...c, layout: "narrador-canto" as const, motivo: `${c.motivo} (imagem pequena para a tela cheia)` } : paraPessoa(c, "imagem pequena para a tela cheia", false);
  });
  return { plano: { ...plano, cenas }, trocadas };
}

/** As inserções que sobraram, para o relatório. */
export function insercoesDoPlano(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number): Array<{ cena: number; inicio: number; fim: number; o: string; fala: string; motivo: string }> {
  return plano.cenas
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => ehInsercao(c))
    .map(({ c, i }) => {
      const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
      return { cena: i, inicio: +inicio.toFixed(2), fim: +fim.toFixed(2), o: descreve(c), fala: palavras.slice(c.de, c.ate + 1).map((p) => p.texto).join(" "), motivo: c.motivo };
    });
}
