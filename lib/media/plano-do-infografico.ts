import { larguraEmCorpos } from "@/lib/media/metricas-de-fonte";
import {
  caberBlocos,
  caberNumero,
  medirNaEscala,
  quebrarLinhas,
  type BlocoDeTexto,
  type BlocoMedido,
  type Encaixe,
  type FonteDeMedida,
} from "@/lib/media/caber-texto";
import type { ConteudoDoInfografico } from "@/lib/media/infographic";

/**
 * O PLANO DO INFOGRÁFICO (06/10/2026): onde cada texto vai, em que corpo e
 * em quais linhas, calculado ANTES do desenho e sem Satori.
 *
 * Até 06/10 o compositor (lib/media/infografico-em-codigo.tsx) dava corpos
 * fixos e deixava o Satori quebrar e encolher; o resultado foi texto por cima
 * de texto e parágrafo cortado no meio da linha (o infográfico do Demandou de
 * 06/10). Agora o plano mede tudo pela métrica da fonte (lib/media/caber-texto)
 * e o compositor só desenha as linhas do plano, com as alturas do plano:
 *   - o número do cartão e o parágrafo ficam em FLUXO vertical, um embaixo do
 *     outro, sem sobreposição possível;
 *   - todos os cartões saem no mesmo corpo (o menor que serve a todos);
 *   - o número nunca é cortado; uma faixa ("R$ 1.500 a R$ 30.000") cabe numa
 *     linha ou quebra no conector, alinhada;
 *   - só o parágrafo, no piso, perde o fim com reticência, e isso vai ao log.
 *
 * Vale para as três famílias (impacto, colagem, sóbrio) e as quatro
 * proporções: a regra de caber não é de um estilo. Puro: os testes de
 * scripts/testes rodam sem nada pago.
 */

export type FamiliaDoInfografico = "impacto" | "colagem" | "sobrio" | "claro";

export interface NumeroMedido {
  linhas: string[];
  corpo: number;
  altura: number;
}

export interface CartaoPlanejado {
  titulo: BlocoMedido;
  numero: BlocoMedido | null;
  texto: BlocoMedido;
  cortado: boolean;
}

export interface PlanoDoInfografico {
  W: number;
  H: number;
  m: number;
  u: number;
  deitada: boolean;
  /** O destaque ao lado dos cartões (peça deitada e quadrada) ou em cima deles (em pé). */
  destaqueAoLado: boolean;
  familia: FamiliaDoInfografico;
  decoracaoH: number;
  titulo: { linhas: string[]; corpo: number; fonte: FonteDeMedida; entrelinha: number; altura: number; espaco: number };
  subtitulo: { bloco: BlocoMedido; mt: number; mb: number } | null;
  destaque: { valor: NumeroMedido; rotulo: BlocoMedido; largura: number; altura: number; pad: number; margem: number } | null;
  cartoes: {
    colunas: number;
    largura: number;
    altura: number;
    padV: number;
    padH: number;
    bordaTopo: number;
    circulo: number;
    gapCirculo: number;
    margem: number;
    itens: CartaoPlanejado[];
  };
  rodape: { itens: Array<{ valor: NumeroMedido; rotulo: BlocoMedido }>; altura: number; mt: number; pt: number; borda: number; gap: number } | null;
  /** O que foi cortado com reticência (vai ao log; o teste exige vazio com texto normal). */
  cortes: string[];
  /** A soma das alturas do plano; o teste confere que não passa de H. */
  alturaTotal: number;
}

const ENTRE_TITULO = 1.08;
const ENTRE_SUB = 1.3;
const ENTRE_TEXTO = 1.3;
const ENTRE_TITULO_CARTAO = 1.15;
const ENTRE_NUMERO = 1.05;
const ENTRE_DESTAQUE = 1.0;

function medirNumero(valor: string, fonte: FonteDeMedida, largura: number, corpo: number, piso: number, entrelinha: number): NumeroMedido {
  const r = caberNumero(valor, fonte, largura, corpo, piso);
  return { ...r, altura: r.linhas.length * r.corpo * entrelinha };
}

/** O título no maior corpo que cabe, com as linhas equilibradas (nenhuma palavra sozinha na última). */
function planejarTitulo(texto: string, fonte: FonteDeMedida, largura: number, alturaMax: number, corpoMax: number, piso: number, maxLinhas: number) {
  const folga = 0.3; // em corpos: a faixa do destaque passa um pouco da palavra
  for (let corpo = corpoMax; corpo >= piso; corpo -= 2) {
    const limite = largura - folga * corpo;
    const linhas = quebrarLinhas(texto, fonte, corpo, limite);
    if (linhas.length > maxLinhas || linhas.length * corpo * ENTRE_TITULO > alturaMax) continue;
    let melhor = linhas;
    for (let l = limite * 0.98; l > limite * 0.5; l *= 0.98) {
      const t = quebrarLinhas(texto, fonte, corpo, l);
      if (t.length !== linhas.length) break;
      melhor = t;
    }
    return { linhas: melhor, corpo, cortado: false };
  }
  const r = caberBlocos([{ nome: "título", texto, fonte, corpo: piso, piso, entrelinha: ENTRE_TITULO, maxLinhas }], largura - folga * piso, alturaMax, "infográfico, título");
  return { linhas: r.blocos[0].linhas, corpo: piso, cortado: r.cortado };
}

interface OpcoesDoPlano {
  semSubtitulo?: boolean;
  tituloMaxLinhas?: number;
}

/**
 * A LETRA DO TÍTULO quando o cliente aprovou a identidade (06/10): a família
 * da letra aprovada (condensada, serifada, sem serifa) manda no título, e não
 * a família herdada do estilo de vídeo. Sem identidade aprovada, vale a família.
 */
export interface TituloDoPlano {
  fonte: FonteDeMedida;
  caixaAlta: boolean;
}

export function tituloDaFamilia(familia: FamiliaDoInfografico): TituloDoPlano {
  return familia === "sobrio" ? { fonte: "PT Serif", caixaAlta: false } : { fonte: "Anton", caixaAlta: true };
}

export function tituloDaTipografia(tipografia: "condensada" | "serifada" | "sem-serifa"): TituloDoPlano {
  if (tipografia === "serifada") return { fonte: "PT Serif", caixaAlta: false };
  if (tipografia === "sem-serifa") return { fonte: "Liberation Sans", caixaAlta: false };
  return { fonte: "Anton", caixaAlta: true };
}

/**
 * O plano, com as saídas em ordem quando o texto não cabe nem no corpo mínimo:
 * primeiro tudo; depois sem o subtítulo (o texto de apoio cede o lugar antes
 * de qualquer parágrafo perder o fim); depois o título em até duas linhas. Só
 * quando nenhuma serve, fica a reticência no parágrafo. Cada saída vai ao log.
 */
export function planejarInfografico(c: ConteudoDoInfografico, familia: FamiliaDoInfografico, W: number, H: number, tituloEscolhido?: TituloDoPlano): PlanoDoInfografico {
  const tentativas: OpcoesDoPlano[] = [{}];
  if (c.subtitle?.trim()) tentativas.push({ semSubtitulo: true });
  tentativas.push({ semSubtitulo: true, tituloMaxLinhas: 2 });
  const planos: PlanoDoInfografico[] = [];
  const avisoOriginal = console.warn;
  for (const op of tentativas) {
    // As tentativas que não vão ser usadas não poluem o log com cortes que não aconteceram.
    const avisos: unknown[][] = [];
    console.warn = (...a: unknown[]) => void avisos.push(a);
    let plano: PlanoDoInfografico;
    try {
      plano = planejar(c, familia, W, H, op, tituloEscolhido ?? tituloDaFamilia(familia));
    } finally {
      console.warn = avisoOriginal;
    }
    planos.push(plano);
    if (!plano.cortes.length && !problemasDoPlano(plano).length) {
      if (op.semSubtitulo) console.warn(`[infografico] o texto não cabia${op.tituloMaxLinhas ? " nem sem o subtítulo; título em até duas linhas e" : ";"} o subtítulo saiu para nenhum parágrafo ser cortado.`);
      return plano;
    }
    (plano as PlanoDoInfografico & { avisos?: unknown[][] }).avisos = avisos;
  }
  // Nenhuma saída sem corte: fica a de menos cortes entre as sem problema de medida
  // (no empate, a mais completa), e os avisos dela vão ao log.
  const semProblema = planos.filter((p) => !problemasDoPlano(p).length);
  const escolhido = semProblema.length ? semProblema.reduce((a, b) => (b.cortes.length < a.cortes.length ? b : a)) : planos[planos.length - 1];
  for (const a of (escolhido as PlanoDoInfografico & { avisos?: unknown[][] }).avisos ?? []) console.warn(...a);
  return escolhido;
}

function planejar(c: ConteudoDoInfografico, familia: FamiliaDoInfografico, W: number, H: number, op: OpcoesDoPlano, tituloEscolhido: TituloDoPlano): PlanoDoInfografico {
  const deitada = W / H > 1.2;
  // No quadrado o destaque vai ao lado dos cartões, como na peça deitada: empilhado, sobra pouco para os cartões.
  const destaqueAoLado = W / H >= 0.95;
  const m = Math.round(Math.min(W, H) * 0.075);
  const u = Math.min(W, H) / 1000;
  const cortes: string[] = [];
  const largura = W - 2 * m;

  const decoracaoH = familia === "colagem" ? 28 * u : familia === "sobrio" ? 23 * u : 0;

  // TÍTULO
  const fonteDoTitulo: FonteDeMedida = tituloEscolhido.fonte;
  const tituloCru = (c.title ?? "").trim();
  const tituloTexto = tituloEscolhido.caixaAlta ? tituloCru.toUpperCase() : tituloCru;
  const t = planejarTitulo(tituloTexto, fonteDoTitulo, largura, H * 0.2, Math.round((deitada ? 92 : 72) * u), Math.round(30 * u), op.tituloMaxLinhas ?? 3);
  if (t.cortado) cortes.push("título");
  const titulo = {
    linhas: t.linhas,
    corpo: t.corpo,
    fonte: fonteDoTitulo,
    entrelinha: ENTRE_TITULO,
    altura: t.linhas.length * t.corpo * ENTRE_TITULO,
    espaco: larguraEmCorpos(" ", fonteDoTitulo) * t.corpo,
  };

  // O corpo de base dos textos sai do espaço de cada cartão (como antes).
  const secoes = (c.sections ?? []).slice(0, 4);
  const corpoDoTexto = Math.round((deitada ? (secoes.length > 3 ? 25 : 28) : secoes.length > 2 ? 21 : 30) * u);
  const pisoDoTexto = Math.max(12, Math.round(15 * u));

  // SUBTÍTULO
  let subtitulo: PlanoDoInfografico["subtitulo"] = null;
  if (c.subtitle?.trim() && !op.semSubtitulo) {
    const r = caberBlocos(
      [{ nome: "subtítulo", texto: c.subtitle.trim(), fonte: "Liberation Sans", corpo: (deitada ? 24 : 27) * u, piso: Math.max(12, 18 * u), entrelinha: ENTRE_SUB, maxLinhas: 2, cortavel: true }],
      largura,
      2 * 27 * u * ENTRE_SUB,
      "infográfico, subtítulo"
    );
    if (r.cortado) cortes.push("subtítulo");
    subtitulo = { bloco: r.blocos[0], mt: 12 * u, mb: 14 * u };
  }

  // RODAPÉ: valor em cima, rótulo embaixo, todos os valores no mesmo corpo e alinhados pelo topo.
  const temDestaque = Boolean(c.highlight?.value && c.highlight?.label);
  const numeros = (c.keyNumbers ?? []).filter((n) => n.value && n.label).slice(0, 3);
  let rodape: PlanoDoInfografico["rodape"] = null;
  if (numeros.length) {
    const gap = 16 * u;
    const larguraItem = (largura - gap * (numeros.length - 1)) / numeros.length;
    const corpoMax = (deitada ? 40 : 44) * u;
    const piso = 26 * u;
    const comum = Math.min(...numeros.map((n) => caberNumero(n.value, "Anton", larguraItem, corpoMax, piso).corpo));
    const itens = numeros.map((n, i) => {
      const valor = medirNumero(n.value, "Anton", larguraItem, comum, comum, ENTRE_DESTAQUE);
      const r = caberBlocos(
        [{ nome: `rótulo do rodapé ${i + 1}`, texto: n.label, fonte: "Liberation Sans", corpo: corpoDoTexto * 0.95, piso: pisoDoTexto, entrelinha: 1.2, maxLinhas: 2, cortavel: true }],
        larguraItem,
        2 * corpoDoTexto * 0.95 * 1.2,
        "infográfico, rodapé"
      );
      if (r.cortado) cortes.push(`rótulo do rodapé ${i + 1}`);
      return { valor, rotulo: r.blocos[0] };
    });
    // Valores em uma linha para todos, ou todos com a mesma altura de valor: os rótulos ficam alinhados.
    const alturaDoValor = Math.max(...itens.map((i) => i.valor.altura));
    const alturaDosItens = alturaDoValor + 4 * u + Math.max(...itens.map((i) => i.rotulo.altura));
    for (const i of itens) i.valor = { ...i.valor, altura: alturaDoValor };
    rodape = { itens, altura: alturaDosItens, mt: 12 * u, pt: 14 * u, borda: 3 * u, gap };
  }

  const sub = subtitulo ? subtitulo.mt + subtitulo.bloco.altura + subtitulo.mb : 0;
  const rod = rodape ? rodape.mt + rodape.borda + rodape.pt + rodape.altura : 0;
  const meio = H - 2 * m - decoracaoH - titulo.altura - sub - 6 * u - rod;

  // DESTAQUE
  const margemDoBloco = 8 * u;
  const padDestaque = 22 * u;
  let destaque: PlanoDoInfografico["destaque"] = null;
  if (temDestaque) {
    const larguraDoBloco = deitada ? W * 0.2 : destaqueAoLado ? W * 0.27 : largura - 2 * margemDoBloco;
    const interna = larguraDoBloco - 2 * padDestaque;
    const valor = medirNumero(c.highlight!.value, "Anton", interna, (deitada ? 78 : 80) * u, 34 * u, ENTRE_DESTAQUE);
    const alturaDoRotuloMax = destaqueAoLado ? meio - 2 * margemDoBloco - 2 * padDestaque - valor.altura - 8 * u : 3 * corpoDoTexto * 1.25;
    const r = caberBlocos(
      [{ nome: "rótulo do destaque", texto: c.highlight!.label, fonte: "Liberation Sans", corpo: corpoDoTexto, piso: pisoDoTexto, entrelinha: 1.25, maxLinhas: 4, cortavel: true }],
      interna,
      Math.max(alturaDoRotuloMax, pisoDoTexto * 1.25),
      "infográfico, destaque"
    );
    if (r.cortado) cortes.push("rótulo do destaque");
    const altura = destaqueAoLado ? meio - 2 * margemDoBloco : 2 * padDestaque + valor.altura + 8 * u + r.blocos[0].altura;
    destaque = { valor, rotulo: r.blocos[0], largura: larguraDoBloco, altura, pad: padDestaque, margem: margemDoBloco };
  }

  // CARTÕES
  const colunas = deitada ? Math.max(1, secoes.length) : secoes.length > 2 ? 2 : 1;
  const linhasDeCartoes = Math.max(1, Math.ceil(secoes.length / colunas));
  const larguraDaArea = destaqueAoLado && destaque ? largura - destaque.largura - 2 * margemDoBloco : largura;
  const alturaDaArea = destaqueAoLado || !destaque ? meio : meio - destaque.altura - 2 * margemDoBloco;
  const larguraDoCartao = larguraDaArea / colunas - 2 * margemDoBloco;
  const alturaDoCartao = alturaDaArea / linhasDeCartoes - 2 * margemDoBloco;
  const padV = familia === "sobrio" ? 14 * u : 22 * u;
  const padH = familia === "sobrio" ? 6 * u : 22 * u;
  const bordaTopo = familia === "sobrio" ? 5 * u : 0;
  const circulo = 46 * u;
  const gapCirculo = 12 * u;
  const internaW = larguraDoCartao - 2 * padH;
  const internaH = alturaDoCartao - 2 * padV - bordaTopo;

  const blocosDoCartao = (s: ConteudoDoInfografico["sections"][number], i: number): BlocoDeTexto[] => [
    {
      nome: `título do cartão ${i + 1}`,
      texto: s.heading ?? "",
      fonte: "Liberation Sans",
      corpo: corpoDoTexto * 1.08,
      piso: pisoDoTexto * 1.05,
      entrelinha: ENTRE_TITULO_CARTAO,
      maxLinhas: 3,
      depois: 10 * u,
      largura: internaW - circulo - gapCirculo,
      alturaMinima: circulo,
    },
    {
      nome: `número do cartão ${i + 1}`,
      texto: s.stat ?? "",
      fonte: "Anton",
      corpo: corpoDoTexto * (deitada ? 1.9 : 1.6),
      piso: Math.max(pisoDoTexto * 1.3, 20 * u),
      entrelinha: ENTRE_NUMERO,
      maxLinhas: 2,
      depois: 6 * u,
    },
    {
      nome: `parágrafo do cartão ${i + 1}`,
      texto: s.body ?? "",
      fonte: "Liberation Sans",
      corpo: corpoDoTexto,
      piso: pisoDoTexto,
      entrelinha: ENTRE_TEXTO,
      cortavel: true,
    },
  ];

  // Todos os cartões no mesmo corpo: o menor que serve a todos.
  const individuais = secoes.map((s, i) => caberBlocos(blocosDoCartao(s, i), internaW, internaH, `infográfico, cartão ${i + 1}`));
  const escala = individuais.length ? Math.min(...individuais.map((r) => r.escala)) : 1;
  const itens: CartaoPlanejado[] = secoes.map((s, i) => {
    let r: Encaixe = medirNaEscala(blocosDoCartao(s, i), internaW, internaH, escala);
    if (!r.cabe) r = individuais[i];
    if (r.cortado) cortes.push(...r.blocos.filter((b) => b.cortado).map((b) => b.nome));
    const [tituloDoCartao, numero, texto] = r.blocos;
    return { titulo: tituloDoCartao, numero: numero.linhas.length ? numero : null, texto, cortado: r.cortado };
  });

  const alturaTotal =
    2 * m + decoracaoH + titulo.altura + sub + 6 * u + rod + (destaqueAoLado ? alturaDaArea : (destaque ? destaque.altura + 2 * margemDoBloco : 0) + alturaDaArea);

  if (cortes.length) console.warn(`[infografico] cortado com reticência, no corpo mínimo: ${cortes.join(", ")}.`);

  return {
    W,
    H,
    m,
    u,
    deitada,
    destaqueAoLado,
    familia,
    decoracaoH,
    titulo,
    subtitulo,
    destaque,
    cartoes: { colunas, largura: larguraDoCartao, altura: alturaDoCartao, padV, padH, bordaTopo, circulo, gapCirculo, margem: margemDoBloco, itens },
    rodape,
    cortes,
    alturaTotal,
  };
}

/** Confere o plano contra a regra: toda linha cabe na largura dela e nada passa da altura. Os testes usam. */
export function problemasDoPlano(p: PlanoDoInfografico): string[] {
  const problemas: string[] = [];
  const mede = (t: string, f: FonteDeMedida, corpo: number) => larguraEmCorpos(t, f) * corpo;
  const internaW = p.cartoes.largura - 2 * p.cartoes.padH;
  const internaH = p.cartoes.altura - 2 * p.cartoes.padV - p.cartoes.bordaTopo;
  p.cartoes.itens.forEach((c, i) => {
    const lt = internaW - p.cartoes.circulo - p.cartoes.gapCirculo;
    for (const l of c.titulo.linhas) if (mede(l, "Liberation Sans", c.titulo.corpo) > lt + 0.5) problemas.push(`cartão ${i + 1}: título largo "${l}"`);
    for (const l of c.numero?.linhas ?? []) if (mede(l, "Anton", c.numero!.corpo) > internaW + 0.5) problemas.push(`cartão ${i + 1}: número largo "${l}"`);
    for (const l of c.texto.linhas) if (mede(l, "Liberation Sans", c.texto.corpo) > internaW + 0.5) problemas.push(`cartão ${i + 1}: linha larga "${l}"`);
    const usada = c.titulo.altura + (c.titulo.linhas.length ? c.titulo.depois : 0) + (c.numero ? c.numero.altura + c.numero.depois : 0) + c.texto.altura;
    if (usada > internaH + 1) problemas.push(`cartão ${i + 1}: conteúdo de ${Math.round(usada)}px numa caixa de ${Math.round(internaH)}px`);
  });
  if (p.rodape) {
    const larguraItem = (p.W - 2 * p.m - p.rodape.gap * (p.rodape.itens.length - 1)) / p.rodape.itens.length;
    p.rodape.itens.forEach((it, i) => {
      for (const l of it.valor.linhas) if (mede(l, "Anton", it.valor.corpo) > larguraItem + 0.5) problemas.push(`rodapé ${i + 1}: valor largo "${l}"`);
    });
  }
  if (p.alturaTotal > p.H + 1) problemas.push(`altura total ${Math.round(p.alturaTotal)} passa de ${p.H}`);
  return problemas;
}
