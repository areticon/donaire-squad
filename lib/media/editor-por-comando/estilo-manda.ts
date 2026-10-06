import type { Retangulo } from "@/lib/media/plano-de-montagem";
import type { EstiloDeLegenda } from "@/lib/media/legenda-escolhida";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";

/**
 * O ESTILO MANDA NA LEGENDA E NAS PEÇAS (06/10/2026, noite; diagnóstico do
 * vídeo cmux0hoxk, estilo Autoridade high ticket, celular na mão). O comando
 * pedia "legenda grande em letra condensada no meio da tela, 1 a 4 palavras",
 * "número em faixa de destaque" e "palavra-tese gigante atrás de mim". Saiu a
 * legenda pequena de sempre (a do modo "Automática", que não lia o estilo),
 * o título atrás virou sublinhado porque a pessoa se mexia, a folha do número
 * saiu sem área livre e a tese escolhida foi "OLHA ISSO". Três regras, todas
 * genéricas (nenhum estilo é citado pelo nome):
 *
 *   1. A LEGENDA DO ESTILO: com a escolha "Automática", a posição, o tamanho,
 *      a letra e as palavras por vez vêm do comando do estilo, decididos pelo
 *      JEV (`perguntasDaLegenda`); sem JEV, lidos do texto do comando
 *      (`legendaPorPalavras`). Só o estilo de legenda escolhido pelo cliente
 *      passa por cima (`legendaDoEstiloFixo`).
 *   2. A VERSÃO NA FRENTE: quando a guarda impede a peça (a pessoa se mexe
 *      para o título atrás; sem área livre para a folha), a peça não é
 *      rebaixada nem removida: vira uma versão na FRENTE que não depende de
 *      recorte nem de área livre (caixa no topo, cartão abaixo do rosto,
 *      título no topo). O JEV escolhe a versão no plano (`props.naFrente`); o
 *      resolvedor confere a geometria (nada cobre o rosto) e cai na seguinte
 *      que couber.
 *   3. A PALAVRA-TESE: o JEV escolhe entre candidatas tiradas da fala, com o
 *      critério (palavra com significado do momento; nunca interjeição).
 *
 * Módulo puro.
 */

// ─────────────────────────────── 1. a legenda do estilo ───────────────────────────────

export type PosicaoDaLegenda = "centro" | "baixo" | "topo";
export type TamanhoDaLegenda = "grande" | "medio" | "pequeno";
export type LetraDaLegenda = "condensada" | "limpa" | "serifa";

export type LegendaDoEstilo = {
  posicao: PosicaoDaLegenda;
  tamanho: TamanhoDaLegenda;
  letra: LetraDaLegenda;
  /** Palavras por vez (no máximo). */
  palavras: number;
  caixaAlta: boolean;
  /** Quem decidiu: o JEV lendo o comando, a leitura do texto do comando (reserva) ou o estilo fixado pelo cliente. */
  origem: "jev" | "comando" | "cliente";
  /**
   * O DESENHO DO ESTILO DE LEGENDA ESCOLHIDO PELO CLIENTE (06/10, noite; vídeo cmux4417u): papel, caixa,
   * marca-texto, palavra ou limpa, desenhado no worker com o MESMO visual da legenda do caminho antigo
   * (worker/src/montagem-do-completo.mjs legendaEmAss). Só o estilo fixado pelo cliente leva o campo.
   */
  desenho?: EstiloDeLegenda;
};

/** O desenho que vai ao worker (EdicaoResolvida.legenda.estilo): `y` é o alto da legenda no centro, abaixo do rosto (fração da altura). */
export type LegendaDesenhada = { posicao: PosicaoDaLegenda; tamanho: TamanhoDaLegenda; letra: LetraDaLegenda; caixaAlta: boolean; y?: number; desenho?: EstiloDeLegenda };

const DESENHOS: readonly EstiloDeLegenda[] = ["palavra", "caixa", "marca-texto", "limpa", "papel"];

const normal = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * A RESERVA SEM JEV: o que o texto do comando diz da legenda. Só lê as frases
 * que falam de legenda; sem nenhuma, null (a legenda de sempre).
 */
export function legendaPorPalavras(comando: string | null | undefined): LegendaDoEstilo | null {
  const t = normal(comando ?? "");
  const trechos = [...t.matchAll(/legenda[^.;]{0,140}/g)].map((m) => m[0]);
  if (!trechos.length) return null;
  const s = trechos.join(" | ");
  let achou = false;
  const marca = <T>(v: T): T => ((achou = true), v);
  const posicao: PosicaoDaLegenda = /(no meio|no centro|centralizad|centro da tela|meio da tela)/.test(s) ? marca("centro") : /(no topo|em cima|parte de cima)/.test(s) ? marca("topo") : /(embaixo|em baixo|na base|rodape|terco inferior)/.test(s) ? marca("baixo") : "baixo";
  const tamanho: TamanhoDaLegenda = /(grande|gigante|enorme|grossa)/.test(s) ? marca("grande") : /(pequena|discreta|miuda)/.test(s) ? marca("pequeno") : /(limpa)/.test(s) ? marca("medio") : "medio";
  const letra: LetraDaLegenda = /(condensad|pesad|anton|oswald|impact)/.test(s) ? marca("condensada") : /serifa/.test(s) && !/sem serifa/.test(s) ? marca("serifa") : /(limpa|discreta)/.test(s) ? marca("limpa") : "limpa";
  let palavras = tamanho === "grande" ? 3 : tamanho === "pequeno" ? 6 : 4;
  const faixa = s.match(/(\d+)\s*(?:a|ate|-)\s*(\d+)\s*palavras/);
  const uma = s.match(/(\d+)\s*palavras?\s*por vez/);
  if (faixa) palavras = marca(Math.max(1, Math.min(7, Number(faixa[2]))));
  else if (uma) palavras = marca(Math.max(1, Math.min(7, Number(uma[1]))));
  else if (/palavra a palavra/.test(s)) palavras = marca(2);
  const caixaAlta = /caixa alta|maiuscula/.test(s) || letra === "condensada";
  return achou ? { posicao, tamanho, letra, palavras, caixaAlta, origem: "comando" } : null;
}

/** O estilo de legenda fixado pelo cliente no desenho da legenda do editor (vale sobre o estilo do vídeo). */
export function legendaDoEstiloFixo(id: EstiloDeLegenda): LegendaDoEstilo {
  if (id === "palavra") return { posicao: "centro", tamanho: "grande", letra: "condensada", palavras: 2, caixaAlta: true, origem: "cliente", desenho: id };
  if (id === "limpa") return { posicao: "baixo", tamanho: "pequeno", letra: "limpa", palavras: 5, caixaAlta: false, origem: "cliente", desenho: id };
  if (id === "marca-texto") return { posicao: "baixo", tamanho: "medio", letra: "limpa", palavras: 4, caixaAlta: false, origem: "cliente", desenho: id };
  // caixa e papel: a frase curta na faixa (escura da marca, ou a tira de papel clara), no lugar de sempre.
  return { posicao: "baixo", tamanho: "medio", letra: "limpa", palavras: 4, caixaAlta: false, origem: "cliente", desenho: id };
}

const NAO_DIZ = "nao-diz";

/** As perguntas ao JEV sobre a legenda que o comando pede (vão junto com as da linguagem, no mesmo pedido). */
export function perguntasDaLegenda(): Record<string, PerguntaDoJev> {
  const pre = "Leia só o que o comando do cliente diz sobre a LEGENDA da fala (o texto do que a pessoa diz, queimado no vídeo).";
  return {
    legendaPosicao: {
      type: "choice",
      instructions: `${pre} Onde o comando quer a legenda?`,
      criteria: { centro: "no meio da tela, abaixo do rosto", baixo: "embaixo, no terço inferior", topo: "no alto da tela", [NAO_DIZ]: "o comando não diz onde fica a legenda" },
    },
    legendaTamanho: {
      type: "choice",
      instructions: `${pre} De que tamanho o comando quer a legenda?`,
      criteria: { grande: "grande, chamativa, ocupa a largura", medio: "média, de leitura confortável", pequeno: "pequena, discreta, de telejornal", [NAO_DIZ]: "o comando não diz o tamanho da legenda" },
    },
    legendaLetra: {
      type: "choice",
      instructions: `${pre} Que letra o comando pede para a legenda?`,
      criteria: { condensada: "condensada e pesada, de impacto, em caixa alta", limpa: "limpa, sem serifa, de leitura", serifa: "com serifa, elegante", [NAO_DIZ]: "o comando não diz a letra da legenda" },
    },
    legendaPalavras: {
      type: "choice",
      instructions: `${pre} Quantas palavras por vez o comando quer na legenda?`,
      criteria: { "1-2": "uma ou duas palavras por vez (palavra a palavra)", "3-4": "três ou quatro palavras por vez", frase: "a frase curta inteira, cinco ou mais palavras", [NAO_DIZ]: "o comando não diz quantas palavras por vez" },
    },
  };
}

function escolha<T extends string>(r: RespostaDoJev | undefined, opcoes: readonly T[], minimo = 0.35): T | null {
  if (!r || r.type !== "choice") return null;
  if ((r.confidence ?? 0) < minimo) return null;
  return (opcoes as readonly string[]).includes(r.choice) ? (r.choice as T) : null;
}

/**
 * A legenda que o JEV leu no comando. Atributo que o JEV não decidiu (ou disse
 * "não diz") fica com a leitura do texto (`recuo`); se nem o JEV nem o texto
 * dizem nada da legenda, null (a legenda de sempre).
 */
export function legendaDasRespostas(r: Record<string, RespostaDoJev | undefined>, recuo: LegendaDoEstilo | null): LegendaDoEstilo | null {
  const posicao = escolha(r.legendaPosicao, ["centro", "baixo", "topo"] as const);
  const tamanho = escolha(r.legendaTamanho, ["grande", "medio", "pequeno"] as const);
  const letra = escolha(r.legendaLetra, ["condensada", "limpa", "serifa"] as const);
  const pal = escolha(r.legendaPalavras, ["1-2", "3-4", "frase"] as const);
  if (!posicao && !tamanho && !letra && !pal) return recuo;
  const tam = tamanho ?? recuo?.tamanho ?? "medio";
  const let0 = letra ?? recuo?.letra ?? "limpa";
  // A faixa de palavras do JEV vale sobre o texto só quando o texto não deu número.
  const palavras = pal === "1-2" ? Math.min(recuo?.palavras ?? 2, 2) : pal === "3-4" ? (recuo && recuo.palavras >= 3 && recuo.palavras <= 4 ? recuo.palavras : 4) : pal === "frase" ? Math.max(recuo?.palavras ?? 5, 5) : recuo?.palavras ?? (tam === "grande" ? 3 : 4);
  return { posicao: posicao ?? recuo?.posicao ?? "baixo", tamanho: tam, letra: let0, palavras, caixaAlta: let0 === "condensada" || Boolean(recuo?.caixaAlta), origem: "jev" };
}

/** Lê a legenda gravada no plano (o JSON do banco), ou null. */
export function legendaValida(v: unknown): LegendaDoEstilo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const posicao = (["centro", "baixo", "topo"] as const).find((x) => x === o.posicao);
  const tamanho = (["grande", "medio", "pequeno"] as const).find((x) => x === o.tamanho);
  const letra = (["condensada", "limpa", "serifa"] as const).find((x) => x === o.letra);
  if (!posicao || !tamanho || !letra) return null;
  const palavras = Math.max(1, Math.min(7, Math.round(Number(o.palavras) || 3)));
  const origem = o.origem === "cliente" || o.origem === "comando" ? o.origem : "jev";
  const desenho = DESENHOS.find((x) => x === o.desenho);
  return { posicao, tamanho, letra, palavras, caixaAlta: Boolean(o.caixaAlta), origem, ...(desenho ? { desenho } : {}) };
}

/**
 * A LEGENDA QUE VALE NO VÍDEO: o estilo fixado pelo cliente; senão a do plano
 * (decidida pelo JEV); senão a leitura do texto do comando (plano antigo);
 * senão null (a legenda de sempre).
 */
export function legendaQueVale(fixa: EstiloDeLegenda | null | undefined, doPlano: unknown, comando: string | null | undefined): LegendaDoEstilo | null {
  if (fixa) return legendaDoEstiloFixo(fixa);
  return legendaValida(doPlano) ?? legendaPorPalavras(comando);
}

/** Letras por página no tamanho (o que cabe em até duas linhas no vertical). */
const LETRAS_POR_PAGINA: Record<TamanhoDaLegenda, [number, number]> = { grande: [22, 30], medio: [30, 42], pequeno: [38, 56] };

/**
 * As páginas da legenda no estilo: até `palavras` palavras por vez e o teto
 * de letras do tamanho, quebrando na pontuação e na pausa (como a de sempre).
 */
export function paginasNoEstilo(
  palavras: Array<{ texto: string; inicio: number; fim: number }>,
  l: Pick<LegendaDoEstilo, "palavras" | "tamanho" | "caixaAlta" | "desenho">,
  vertical: boolean
): Array<{ inicio: number; fim: number; texto: string; palavras?: Array<{ texto: string; inicio: number; fim: number }> }> {
  const saida: Array<{ inicio: number; fim: number; texto: string; palavras?: Array<{ texto: string; inicio: number; fim: number }> }> = [];
  const teto = LETRAS_POR_PAGINA[l.tamanho][vertical ? 0 : 1];
  let g: Array<{ texto: string; inicio: number; fim: number }> = [];
  const fechar = (fim: number) => {
    if (!g.length) return;
    const txt = g.map((x) => x.texto).join(" ").replace(/[,.:;]+$/, "");
    const caixa = (t: string) => (l.caixaAlta ? t.toLocaleUpperCase("pt-BR") : t);
    // Com o desenho do cliente, cada palavra leva o tempo dela: o worker acende a falada (como no caminho antigo).
    const ws = l.desenho ? g.map((x, k) => ({ texto: caixa(k === g.length - 1 ? x.texto.replace(/[,.:;]+$/, "") : x.texto), inicio: +x.inicio.toFixed(3), fim: +x.fim.toFixed(3) })) : null;
    saida.push({ inicio: g[0].inicio, fim, texto: caixa(txt), ...(ws ? { palavras: ws } : {}) });
    g = [];
  };
  palavras.forEach((p, j) => {
    const prox = palavras[j + 1];
    const comEla = [...g, p].map((x) => x.texto).join(" ");
    // A palavra que estoura o teto de letras abre a página seguinte.
    if (g.length && comEla.length > teto) fechar(Math.min(p.inicio, g[g.length - 1].fim + 0.35));
    g.push(p);
    const pausa = prox ? prox.inicio - p.fim : 1;
    if (g.length >= l.palavras || /[.,:;?!]$/.test(p.texto) || pausa > 0.6 || !prox) fechar(Math.min(prox ? prox.inicio : p.fim + 0.4, p.fim + 0.35));
  });
  return saida;
}

/** A altura (fração do quadro) que a página ocupa em cada tamanho, com folga para duas linhas. */
export const ALTURA_DA_LEGENDA: Record<TamanhoDaLegenda, number> = { grande: 0.13, medio: 0.11, pequeno: 0.09 };

/** O desenho da legenda para o worker: no centro, o alto da legenda fica logo abaixo do rosto (nada cobre o rosto). */
export function legendaDesenhada(l: LegendaDoEstilo, rosto: Retangulo, vertical: boolean): LegendaDesenhada {
  const base = { posicao: l.posicao, tamanho: l.tamanho, letra: l.letra, caixaAlta: l.caixaAlta, ...(l.desenho ? { desenho: l.desenho } : {}) };
  if (l.posicao !== "centro") return base;
  const y = Math.min(vertical ? 0.66 : 0.72, Math.max(vertical ? 0.5 : 0.55, rosto.y + rosto.h + 0.04));
  return { ...base, y: +y.toFixed(3) };
}

/** A faixa (fração da altura) que a legenda ocupa na posição principal do estilo; null: a de sempre. */
export function faixaPrincipalDaLegenda(d: LegendaDesenhada | null | undefined): [number, number] | null {
  if (!d) return null;
  const h = ALTURA_DA_LEGENDA[d.tamanho];
  if (d.posicao === "centro") return [d.y ?? 0.58, +((d.y ?? 0.58) + h).toFixed(3)];
  if (d.posicao === "topo") return [0.035, +(0.035 + h).toFixed(3)];
  return [+(0.82 - h).toFixed(3), 0.83];
}

// ─────────────────────────────── 2. a versão na frente ───────────────────────────────

export const VERSOES_NA_FRENTE = ["caixa-no-topo", "cartao-embaixo", "titulo-no-topo"] as const;
export type VersaoNaFrente = (typeof VERSOES_NA_FRENTE)[number];

/** O que cada versão é, para o JEV escolher (as mesmas palavras em toda pergunta). */
export const CRITERIO_DA_FRENTE: Record<VersaoNaFrente, string> = {
  "caixa-no-topo": "o texto numa caixa clara arredondada no alto da tela, acima da cabeça (como título de post): para a tese, a frase forte, a pergunta",
  "cartao-embaixo": "um cartão sobre o terço inferior, logo abaixo do rosto: para o número, o dado, o passo, o nome",
  "titulo-no-topo": "um título grande no alto da tela, com o apoio embaixo dele: para a ideia central com uma frase que completa",
};

/** A peça depende de recorte ou de área livre (pode ser barrada pela guarda), e por isso leva uma versão na frente escolhida no plano. */
export function precisaDeVersaoNaFrente(peca: string, planoDaFicha: string | undefined): boolean {
  // E as peças de caixa medida (06/10, noite): a vetorial e o cartão que não couberem pela posição viram a versão na frente.
  return peca === "titulo-atras" || planoDaFicha === "tela" || planoDaFicha === "lado" || PECAS_DE_CAIXA.has(peca);
}

/** As peças posicionadas por caixa medida no trecho (podem não caber sem cobrir o rosto). */
const PECAS_DE_CAIXA = new Set(["icone-com-frase", "comparacao-lado-a-lado", "cartoes-em-linha", "interface-de-edicao", "titulo-em-caixa", "cartao-de-passo", "frase-chave"]);

/** A pergunta ao JEV: qual versão na frente, se esta peça não puder entrar como planejada. */
export function perguntaDaFrente(peca: string, texto: string, fala: string): PerguntaDoJev {
  return {
    type: "choice",
    instructions: `Se a peça "${peca}" (texto: "${texto.slice(0, 120)}") não puder entrar como planejada (a pessoa se mexe e o recorte falha, ou não há área livre para a folha), qual versão NA FRENTE da pessoa diz melhor este momento, sem cobrir o rosto? A fala do momento: "${fala.slice(0, 300)}".`,
    criteria: { ...CRITERIO_DA_FRENTE },
  };
}

/** Lê a escolha do JEV (só com confiança mínima). */
export function versaoDaResposta(r: RespostaDoJev | undefined, minimo = 0.3): VersaoNaFrente | null {
  return escolha(r, VERSOES_NA_FRENTE, minimo);
}

const textoLimpo = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** O texto principal e o de apoio de qualquer peça (o que a versão na frente escreve). */
export function textosDaPeca(props: Record<string, unknown>): { principal: string; apoio: string } {
  const valor = textoLimpo(props.valor);
  const cru = (v: unknown) => (typeof v === "string" ? v : "");
  const numero = valor ? `${cru(props.prefixo)}${valor}${cru(props.sufixo)}`.replace(/\s+/g, " ").trim() : "";
  const principal = numero || ["texto", "titulo", "manchete", "frase", "palavra", "nome", "pergunta", "afirmacao"].map((k) => textoLimpo(props[k])).find(Boolean) || "";
  const itens = Array.isArray(props.itens) ? (props.itens as unknown[]).map((x) => (typeof x === "object" && x ? textoLimpo((x as Record<string, unknown>).texto ?? (x as Record<string, unknown>).titulo) : textoLimpo(x))).filter(Boolean) : [];
  const apoio = ["apoio", "rotulo", "descricao", "antes", "subtitulo", "resposta"].map((k) => textoLimpo(props[k])).find((x) => x && x !== principal) || itens.slice(0, 2).join(", ");
  return { principal: principal || itens[0] || "", apoio };
}

const cruzaVertical = (a: Retangulo, b: Retangulo) => a.y < b.y + b.h && b.y < a.y + a.h && a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * A caixa de cada versão (fração do quadro). `rosto` é o de quem fala no
 * trecho: a caixa do topo fica acima dele e o cartão abaixo dele.
 */
export function caixaDaVersao(v: VersaoNaFrente, rosto: Retangulo, vertical: boolean): Retangulo {
  if (v === "caixa-no-topo") return vertical ? { x: 0.07, y: 0.045, w: 0.86, h: 0.15 } : { x: 0.22, y: 0.05, w: 0.56, h: 0.17 };
  if (v === "titulo-no-topo") return vertical ? { x: 0.05, y: 0.08, w: 0.9, h: 0.24 } : { x: 0.05, y: 0.06, w: 0.6, h: 0.28 };
  const w = vertical ? 0.8 : 0.4;
  const h = vertical ? 0.15 : 0.2;
  const y = Math.min(0.88 - h, Math.max(vertical ? 0.55 : 0.6, rosto.y + rosto.h + 0.04));
  const cx = Math.min(0.97 - w / 2, Math.max(0.03 + w / 2, rosto.x + rosto.w / 2));
  return { x: +(cx - w / 2).toFixed(4), y: +y.toFixed(4), w, h };
}

/** A versão cabe: dentro do quadro e sem cobrir o rosto (com folga), e sem cobrir o que a leitura marca (`cobre`). */
export function versaoCabe(v: VersaoNaFrente, rosto: Retangulo, vertical: boolean, cobre?: (c: Retangulo) => boolean): boolean {
  const c = caixaDaVersao(v, rosto, vertical);
  if (c.y + c.h > 0.92) return false;
  const folga = { x: rosto.x - 0.01, y: rosto.y - 0.015, w: rosto.w + 0.02, h: rosto.h + 0.03 };
  if (cruzaVertical(c, folga)) return false;
  return !(cobre && cobre(c));
}

export type PecaNaFrente = { versao: VersaoNaFrente; peca: string; props: Record<string, unknown>; doJev: boolean };

/**
 * A VERSÃO NA FRENTE de uma peça barrada pela guarda: a escolhida pelo JEV
 * (`props.naFrente`) se couber; senão a primeira das outras que couber.
 * Null: nenhuma cabe sem cobrir o rosto (ou a peça não tem texto).
 * As peças são as do catálogo (frase-chave, cartao-de-passo, titulo).
 */
export function pecaNaFrente(props: Record<string, unknown>, rosto: Retangulo, vertical: boolean, cobre?: (c: Retangulo) => boolean): PecaNaFrente | null {
  const { principal, apoio } = textosDaPeca(props);
  if (!principal) return null;
  const pedida = VERSOES_NA_FRENTE.find((v) => v === props.naFrente) ?? null;
  const ordem = [...(pedida ? [pedida] : []), ...VERSOES_NA_FRENTE.filter((v) => v !== pedida)];
  const v = ordem.find((x) => versaoCabe(x, rosto, vertical, cobre));
  if (!v) return null;
  const caixa = caixaDaVersao(v, rosto, vertical);
  const doJev = v === pedida;
  const comum = { naFrente: v, ...(props.pedidoDoCliente ? { pedidoDoCliente: props.pedidoDoCliente } : {}) };
  if (v === "caixa-no-topo") return { versao: v, peca: "frase-chave", props: { ...comum, texto: apoio ? `**${principal}** ${apoio}`.slice(0, 140) : `**${principal}**`, caixa, claro: true }, doJev };
  if (v === "cartao-embaixo") return { versao: v, peca: "cartao-de-passo", props: { ...comum, titulo: principal.slice(0, 40), ...(apoio ? { texto: apoio.slice(0, 80) } : {}), caixa }, doJev };
  return { versao: v, peca: "titulo", props: { ...comum, titulo: `**${principal}**`.slice(0, 80), ...(apoio ? { apoio: apoio.slice(0, 90) } : {}), posicao: "topo", caixa }, doJev };
}

// ─────────────────────────────── 3. a palavra-tese ───────────────────────────────

/** Interjeições, muletas e chamadas de atenção: nunca são a tese. */
const INTERJEICOES = new Set(
  "olha olhe veja vejam ve isso isto aquilo ai aqui ali entao ne ta tá tipo cara gente galera pessoal mano bom bem ok okay beleza sim nao ah eh oh opa uau nossa caramba pois enfim agora assim coisa coisas negocio jeito vez vezes fala falar falei sabe sabia entende entendeu imagina presta atencao repara escuta escute vamos bora vem simples".split(/\s+/)
);

/** Palavras de ligação (sem significado sozinhas). */
const LIGACAO = new Set(
  "a o as os um uma uns umas de da do das dos em na no nas nos por pra para pro com sem que qual quais quando onde como mais menos muito muita muitos muitas pouco e ou mas se eu tu ele ela nos voces vc voce eles elas meu minha meus minhas seu sua seus suas teu tua esse essa esses essas este esta estes estas ja so tambem ainda sobre entre ate desde porque porque pq era foi ser sao sou esta estao estou tem tenho ter tinha vai vou vao fazer faz fiz feito pode posso poder quero quer todo toda todos todas cada outro outra mesmo mesma lhe me te se la lo".split(/\s+/)
);

/** A palavra serve de tese: tem significado (não é interjeição nem ligação) e tamanho de palavra forte. */
export function palavraServeDeTese(w: string): boolean {
  const n = normal(w).replace(/[^a-z0-9%$]/g, "");
  if (!n) return false;
  if (/^\d/.test(n)) return true;
  return n.length >= 4 && !INTERJEICOES.has(n) && !LIGACAO.has(n);
}

/** O texto serve de tese: ao menos uma palavra com significado e nenhuma interjeição ("OLHA ISSO" não serve). */
export function teseServe(texto: string): boolean {
  const ws = String(texto ?? "").replace(/\*\*/g, "").split(/\s+/).filter(Boolean);
  if (!ws.length) return false;
  if (ws.some((w) => INTERJEICOES.has(normal(w).replace(/[^a-z0-9]/g, "")))) return false;
  return ws.some(palavraServeDeTese);
}

/**
 * As CANDIDATAS A TESE tiradas da fala do momento: os números (com a unidade
 * que vem logo depois) e as palavras com significado, as mais longas e as
 * repetidas primeiro. Até `max`.
 */
export function candidatasATese(fala: string, max = 6): string[] {
  const ws = String(fala ?? "").split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}R$]+|[^\p{L}\p{N}%]+$/gu, "")).filter(Boolean);
  const vistas = new Map<string, { texto: string; n: number; num: boolean; ordem: number }>();
  ws.forEach((w, i) => {
    let texto = w;
    const num = /^(R\$)?\d/.test(w);
    if (num && ws[i + 1] && /^(mil|milh|bilh|reais|anos|meses|dias|clientes|%|por)/i.test(ws[i + 1])) texto = `${w} ${ws[i + 1]}`;
    if (!num && !palavraServeDeTese(w)) return;
    const k = normal(texto);
    const atual = vistas.get(k);
    if (atual) atual.n++;
    else vistas.set(k, { texto: texto.toLocaleUpperCase("pt-BR"), n: 1, num, ordem: i });
  });
  return [...vistas.values()]
    .sort((a, b) => Number(b.num) - Number(a.num) || b.n - a.n || b.texto.length - a.texto.length || a.ordem - b.ordem)
    .slice(0, max)
    .map((x) => x.texto);
}

/** O critério que o JEV recebe para escolher a tese. */
export const CRITERIO_DA_TESE =
  "A palavra-tese vai gigante atrás da pessoa: é a palavra que carrega o SIGNIFICADO deste momento (o conceito, o número, o resultado, a virada), a que alguém lembraria depois. Nunca uma interjeição, chamada de atenção ou muleta de fala (olha, isso, veja, gente, cara, né, então).";

/** A pergunta ao JEV: qual das candidatas é a tese deste momento. */
export function perguntaDaTese(fala: string, candidatas: string[]): PerguntaDoJev {
  return {
    type: "choice",
    instructions: `${CRITERIO_DA_TESE} A fala do momento: "${fala.slice(0, 360)}". Qual destas palavras, tiradas da fala, é a tese?`,
    criteria: Object.fromEntries(candidatas.map((c, i) => [`c${i}`, c])),
  };
}

/** A tese escolhida pela resposta do JEV (o índice da candidata), ou null. */
export function teseDaResposta(r: RespostaDoJev | undefined, candidatas: string[], minimo = 0.25): string | null {
  const k = escolha(r, candidatas.map((_, i) => `c${i}`), minimo);
  return k ? candidatas[Number(k.slice(1))] ?? null : null;
}
