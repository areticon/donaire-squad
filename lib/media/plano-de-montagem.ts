/**
 * O PLANO DE MONTAGEM do editor completo (30/09/2026). Módulo PURO: não chama
 * IA, não lê banco, não baixa nada. É o contrato entre três pontas.
 *
 *   1. O DIRETOR (lib/media/diretor-de-montagem.ts) escreve um `PlanoDeMontagem`:
 *      decisões editoriais, cena a cena, ancoradas em PALAVRAS da fala.
 *   2. `validarPlano` confere e conserta o que é garantível por código (regra
 *      da Bíblia de estilo: o que dá para garantir em código não fica na mão
 *      do modelo). Cena sem buraco, texto só com palavra falada, B-roll curto,
 *      teto de cenas geradas por minuto.
 *   3. `resolverMontagem` transforma o plano em GEOMETRIA e TEMPO prontos
 *      (`MontagemResolvida`): pixels de cada caixa, segundo de cada entrada,
 *      páginas da legenda. É isso que vai ao worker, e o Remotion só desenha.
 *
 * ## Por que a geometria é resolvida AQUI e não no Remotion
 *
 * Pelo mesmo motivo do pedido de corte: "o worker recebe listas prontas e só
 * executa". A regra "nunca cobrir o rosto" depende de saber onde o rosto cai
 * em cada layout; se essa conta morasse no Remotion, o validador (aqui) e o
 * desenho (lá) teriam duas cópias da mesma matemática, e cópias divergem (foi
 * o que aconteceu com o script de corte em 23 e 24/08). E o worker é publicado
 * com o contexto de build da pasta worker/, que não enxerga lib/.
 *
 * ## Âncora textual, nunca segundo
 *
 * Regra 2 da Bíblia de estilo: o diretor devolve ÍNDICES de palavra, e o
 * segundo sai daqui, das palavras medidas. Âncora que não existe vira elemento
 * nenhum, e não elemento no lugar errado.
 */

// Módulos puros também (listas e detecção por texto): o plano continua sem IA,
// sem banco e sem rede.
import { MOVIMENTOS_DE_CAMERA, EFEITOS } from "@/lib/media/catalogo-de-estilos";
import { marcasNaFala, marcaPorId, type MencaoDeMarca } from "@/lib/media/marcas-na-fala";
import type { EstiloDeLegenda, LegendaDecidida } from "@/lib/media/legenda-escolhida";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { sonsDaMontagem, type EventoDeSom } from "@/lib/media/sons-da-montagem";
import { promessaProibida } from "@/lib/media/promessas-proibidas";

// ─────────────────────────────── vocabulário ───────────────────────────────

/** Ids de câmera e efeito que o prompt da Higgsfield sabe traduzir. */
const CAMERAS_VALIDAS = new Set(MOVIMENTOS_DE_CAMERA.map((o) => o.id));
const EFEITOS_VALIDOS = new Set(EFEITOS.map((o) => o.id));

export const LAYOUTS = [
  "narrador-cheio",
  "narrador-canto",
  "narrador-na-foto",
  "narrador-recortado",
  "tela-dividida",
  "broll-cheio",
  "cartela",
  // PIP COM UM TERÇO LIVRE (01/10): a pessoa numa janela que ocupa um terço do
  // quadro (direita no deitado, embaixo no vertical), entrando e saindo
  // animada; os outros dois terços ficam para a imagem, o gráfico ou a lista.
  "pip-terco",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const MOVIMENTOS = ["estatico", "zoom-in-lento", "zoom-out", "punch"] as const;
export type Movimento = (typeof MOVIMENTOS)[number];

/**
 * "fundir" (30/09) é a fusão curta dos sóbrios (BBC, NatGeo, 60 Minutes): a
 * cena nova aparece por cima da anterior em 8 quadros. Folha de papel é só da
 * colagem; o flash e o deslize (chicote) são do impacto.
 */
export const TRANSICOES = ["corte", "folha-de-papel", "deslize", "flash", "fundir"] as const;
export type Transicao = (typeof TRANSICOES)[number];

export const FUNDOS = ["papel", "papel-marca", "escuro"] as const;
export type Fundo = (typeof FUNDOS)[number];

export type Familia = "colagem" | "impacto" | "sobrio";

/**
 * ÍCONES POP do impacto (Hormozi, MrBeast): desenhados em código no Remotion
 * (worker/remotion/src/partes/elementos.tsx), sem IA e sem depender de fonte
 * de emoji no contêiner (o Chrome do worker não tem Noto Color Emoji, e emoji
 * que vira quadrado é pior que nenhum).
 */
export const ICONES_POP = ["check", "x", "seta-cima", "seta-baixo", "raio", "fogo", "dinheiro", "relogio", "alvo", "alerta", "estrela", "coracao"] as const;
export type IconePop = (typeof ICONES_POP)[number];

/**
 * A LINGUAGEM DE CADA FAMÍLIA EM CÓDIGO (30/09, pedido do dono: "toda a
 * edição segue o que o usuário escolheu"). Até aqui o vocabulário inteiro era
 * o da Vox (papel, kraft, fita, letras de revista, carimbo) e só a legenda
 * mudava por família: um cliente que escolheu Hormozi ou BBC recebia colagem.
 *
 * O diretor recebe só o vocabulário da família (diretor-de-montagem.ts), e o
 * validador CONVERTE o que escapar, porque o modelo às vezes volta ao hábito:
 * - impacto: sem papel. Palavra gigante no centro (o tipo interno continua
 *   "letras-revista", desenhado como tipografia pesada), frase de destaque
 *   ("marca-texto" desenhado como caixa alta com a palavra na cor da marca),
 *   ícone pop, número, gráfico. Transições secas: corte, flash, chicote.
 * - sobrio: sem colagem nenhuma. Tarja de telejornal (a "tarja"), título de
 *   capítulo, citação limpa (o "marca-texto"), número grande com fonte,
 *   gráfico, logo de marca citada. Corte e fusão; planos que respiram.
 * - colagem: tudo como era.
 */
export const VOCABULARIO: Record<
  Familia,
  { layouts: readonly Layout[]; transicoes: readonly Transicao[]; fundos: readonly Fundo[]; elementos: readonly TipoDeElemento[] }
> = {
  colagem: {
    layouts: ["narrador-cheio", "narrador-canto", "narrador-na-foto", "narrador-recortado", "tela-dividida", "broll-cheio", "cartela", "pip-terco"],
    transicoes: ["corte", "folha-de-papel", "deslize", "flash"],
    fundos: ["papel", "papel-marca", "escuro"],
    elementos: ["recorte", "marca-texto", "letras-revista", "carimbo", "tarja", "numero", "barras", "seta", "circulo", "titulo"],
  },
  impacto: {
    layouts: ["narrador-cheio", "narrador-canto", "narrador-recortado", "tela-dividida", "broll-cheio", "cartela", "pip-terco"],
    transicoes: ["corte", "flash", "deslize"],
    fundos: ["papel-marca", "escuro"],
    // faixa, selo e comentario (02/10): os do consórcio, desenhados pelo impacto.
    elementos: ["recorte", "marca-texto", "letras-revista", "numero", "barras", "seta", "circulo", "icone-pop", "faixa", "selo", "comentario"],
  },
  sobrio: {
    layouts: ["narrador-cheio", "narrador-canto", "tela-dividida", "broll-cheio", "cartela", "pip-terco"],
    transicoes: ["corte", "fundir"],
    fundos: ["papel", "papel-marca", "escuro"],
    elementos: ["recorte", "marca-texto", "tarja", "numero", "barras", "titulo"],
  },
};

/** Para onde vai o que a família não usa (null: o elemento sai). */
const TROCA_DE_ELEMENTO: Record<Familia, Partial<Record<TipoDeElemento, TipoDeElemento | null>>> = {
  // Os do consórcio fora do impacto (02/10): a faixa vira o título da
  // família, o comentário vira a frase dita dela, e o selo sai.
  colagem: { "icone-pop": null, faixa: "carimbo", comentario: "marca-texto", selo: null },
  impacto: { carimbo: "letras-revista", titulo: "letras-revista", tarja: "marca-texto" },
  sobrio: { "letras-revista": "titulo", carimbo: "titulo", seta: null, circulo: null, "icone-pop": null, faixa: "titulo", comentario: "tarja", selo: null },
};
const TROCA_DE_LAYOUT: Record<Familia, Partial<Record<Layout, Layout>>> = {
  colagem: {},
  impacto: { "narrador-na-foto": "narrador-recortado" },
  sobrio: { "narrador-na-foto": "narrador-cheio", "narrador-recortado": "narrador-cheio" },
};
const TROCA_DE_TRANSICAO: Record<Familia, Partial<Record<Transicao, Transicao>>> = {
  colagem: { fundir: "corte" },
  impacto: { "folha-de-papel": "flash", fundir: "corte" },
  sobrio: { "folha-de-papel": "fundir", flash: "corte", deslize: "fundir" },
};
const TROCA_DE_FUNDO: Record<Familia, Partial<Record<Fundo, Fundo>>> = {
  colagem: {},
  impacto: { papel: "escuro" },
  sobrio: {},
};

/**
 * Nomes que o diretor usa no prompt de cada família e o tipo interno. O
 * contrato com o Remotion continua com os tipos de sempre; quem desenha olha
 * a família (montagem.familia) e pinta cada tipo na linguagem dela.
 */
const APELIDO_DO_ELEMENTO: Record<string, TipoDeElemento> = {
  palavra: "letras-revista",
  "palavra-gigante": "letras-revista",
  destaque: "marca-texto",
  citacao: "marca-texto",
  "citação": "marca-texto",
  rodape: "tarja",
  "tarja-de-titulo": "tarja",
  emoji: "icone-pop",
  "icone-pop": "icone-pop",
  // Os nomes do consórcio no prompt (02/10). "rotulo" é o selo sem o check.
  "faixa-de-valor": "faixa",
  "faixa-valor": "faixa",
  rotulo: "selo",
  "rótulo": "selo",
  "comentário": "comentario",
};
const APELIDO_DO_FUNDO: Record<string, Fundo> = { claro: "papel", marca: "papel-marca", "cor-da-marca": "papel-marca" };

/** Legenda de cada família: papel na colagem, caixa alta forte no impacto, limpa no sóbrio. */
export const LEGENDA_DA_FAMILIA: Record<Familia, "papel" | "destaque" | "limpa"> = { colagem: "papel", impacto: "destaque", sobrio: "limpa" };

export const ZONAS = [
  "topo",
  "topo-esquerda",
  "topo-direita",
  "meio-esquerda",
  "meio-direita",
  "centro",
  "base",
  "base-esquerda",
  "base-direita",
] as const;
export type Zona = (typeof ZONAS)[number];

export type Formato = "9:16" | "16:9";

/** Layouts que precisam de uma mídia (imagem de colagem ou cena gerada). */
const PEDE_MIDIA: Layout[] = ["narrador-canto", "tela-dividida", "broll-cheio"];

export type EntradaDoRecorte = "cair" | "deslizar" | "pop";

export type ElementoDoPlano =
  | { tipo: "recorte"; asset: string; zona: Zona; palavra: number; entrada: EntradaDoRecorte; tamanho: "p" | "m" | "g" }
  /**
   * `visual: "faixa"` (03/10, corte limpo): a frase dita numa faixa
   * semitransparente no terço de baixo, SOBRE a gravação, com a pessoa
   * falando por trás (o texto do vídeo de pitch). Sem o campo, o desenho de
   * sempre da família.
   */
  | { tipo: "marca-texto"; texto: string; zona: Zona; palavra: number; visual?: "faixa" }
  | { tipo: "letras-revista"; texto: string; zona: Zona; palavra: number }
  | { tipo: "carimbo"; texto: string; zona: Zona; palavra: number }
  /** `rotulo`: o chapéu da tarja de telejornal no sóbrio (até 3 palavras). */
  | { tipo: "tarja"; texto: string; zona: Zona; palavra: number; rotulo?: string }
  /** `fonte`: de onde vem o número, só se foi DITO ("segundo o IBGE"). */
  | { tipo: "numero"; valor: number; prefixo?: string; sufixo?: string; rotulo: string; fonte?: string; zona: Zona; palavra: number }
  | { tipo: "icone-pop"; nome: IconePop; zona: Zona; palavra: number }
  | { tipo: "barras"; titulo?: string; itens: { rotulo: string; valor: number; texto: string }[]; zona: Zona; palavra: number }
  | { tipo: "seta"; zona: Zona; palavra: number }
  | { tipo: "circulo"; zona: Zona; palavra: number }
  /** Título de capítulo em serifa, sem caixa (o "Remotion" da referência). */
  | { tipo: "titulo"; texto: string; zona: Zona; palavra: number }
  /**
   * OS TRÊS DO CONSÓRCIO (02/10, bíblia "Autoridade em consórcio"), medidos
   * nos Reels do nicho:
   * - faixa: o VALOR ou a palavra da prova ("R$ 120 MIL", "CONTEMPLADO") numa
   *   faixa de papel rasgado na cor da marca; só número e palavra DITOS;
   * - selo: o rótulo branco arredondado. Com `check`, o nome da marca ou do
   *   vendedor com o círculo de check ("Pai do Consórcio"); sem, a frase dita
   *   em letra preta ("Não façam isso em casa!");
   * - comentario: o cartão do comentário respondido, com a pergunta como foi
   *   DITA e o @ só quando a pessoa disse o nome.
   */
  | { tipo: "faixa"; texto: string; zona: Zona; palavra: number }
  | { tipo: "selo"; texto: string; check: boolean; zona: Zona; palavra: number }
  | { tipo: "comentario"; texto: string; autor?: string; zona: Zona; palavra: number };

export type TipoDeElemento = ElementoDoPlano["tipo"];

/**
 * O que precisa ser gerado. `descricao` vai em inglês para o modelo de imagem
 * e NUNCA pede texto, letra, número, rosto ou pessoa: texto na tela é código
 * (Remotion) e rosto na tela é só o do cliente, pixel da gravação.
 */
export type AssetDoPlano = {
  id: string;
  /**
   * colagem: imagem inteira de colagem de papel (B-roll, canto, tela dividida).
   * elemento: um objeto solto recortado (tesoura, câmera, olho), fundo removido.
   * cena-em-movimento: cena de CINEMA da Higgsfield (texto para vídeo), ligada
   *   ao substantivo concreto dito; entra em broll-cheio e depois no canto.
   * cena-do-narrador: o CENÁRIO real do narrador (quadro da gravação sem a
   *   pessoa) recriado em vídeo pela Higgsfield, com efeito (desintegração).
   * icone: logo oficial de marca citada na fala, renderizado em código
   *   (lib/media/icones-de-marca.ts); nunca pedido pelo diretor como asset,
   *   nasce do elemento {"tipo":"icone"} na validação.
   */
  tipo: TipoDeAsset;
  descricao: string;
  /**
   * Índice da palavra que MOTIVOU o asset (o substantivo dito). O validador
   * confere que ela cai numa cena que usa o asset, e o recorte entra nela.
   */
  ancora?: number;
  /** icone: id da marca em lib/media/marcas-na-fala.ts. */
  marca?: string;
  /** Cenas geradas: movimento de câmera e efeito, ids do catálogo de estilos. */
  camera?: string;
  efeito?: string;
  /**
   * O que o cliente vai ver, em português e em uma frase (30/09, tela de
   * roteiro): a `descricao` é o prompt em inglês do modelo de imagem, e o
   * cliente aprova a ideia antes de ela ser gerada.
   */
  resumo?: string;
  /** O cliente reescreveu esta ideia na tela de roteiro: a `descricao` é a dele. */
  doCliente?: boolean;
  /**
   * O cliente PEDIU gente nesta imagem ou cena (02/10): figura histórica ou
   * bíblica, multidão com roupa da época, pessoa fictícia. Libera pessoas no
   * pedido ao gerador (com as guardas de roupa e de respeito) e avisa a
   * conferência com visão que o pedido é explícito. Pessoa real contemporânea
   * identificável continua proibida.
   */
  comPessoas?: boolean;
};

export const TIPOS_DE_ASSET = ["colagem", "elemento", "cena-em-movimento", "cena-do-narrador", "icone"] as const;
export type TipoDeAsset = (typeof TIPOS_DE_ASSET)[number];

/** Os tipos que a Higgsfield gera (vídeo pago, com request_id guardado). */
export const ASSETS_EM_VIDEO: TipoDeAsset[] = ["cena-em-movimento", "cena-do-narrador"];

export type PedidoDoCliente = { texto: string; atendido: "sim" | "parcial" | "nao"; motivo?: string | null };

export type CenaDoPlano = {
  /** Índice da primeira palavra da cena (inclusivo). */
  de: number;
  /** Índice da última palavra da cena (inclusivo). */
  ate: number;
  layout: Layout;
  movimento: Movimento;
  /**
   * Índice da palavra FORTE da cena, onde o punch bate ou o zoom lento começa
   * (reprovação de 29/09: o punch caía no início da cena, 1 s antes da palavra).
   * Opcional: sem ele, `resolverMontagem` escolhe pela fala.
   */
  movimentoNa?: number;
  transicao: Transicao;
  fundo: Fundo;
  /** Id do asset principal (colagem ou cena em movimento), quando o layout pede. */
  asset?: string;
  elementos: ElementoDoPlano[];
  /** Por que o diretor escolheu isto; vai para o log e para a tela de revisão. */
  motivo: string;
  /**
   * O ENQUADRAMENTO da cena (03/10, corte limpo): 1 é o plano aberto da
   * gravação, 1,1 o médio, 1,2 o fechado. Alternar entre cortes de câmera
   * faz a gravação de uma câmera parecer duas. No punch, é o zoom de chegada
   * na palavra forte (o padrão é 1,12). Ausente: aberto.
   */
  zoom?: number;
  /**
   * O que o cliente fez nesta cena na tela de roteiro (30/09): tirou o efeito,
   * reescreveu a ideia ou pediu outra ao diretor. Só a tela lê; a montagem
   * monta a cena como ela está.
   */
  ajuste?: "removido" | "editado" | "nova-ideia";
  /**
   * O PEDIDO DO CLIENTE nesta cena (02/10, "outra ideia" com texto): nunca
   * some em silêncio. `atendido` diz se o diretor fez o pedido inteiro, em
   * parte ou não fez, e `motivo` explica em uma linha quando não fez inteiro.
   * A tela mostra os dois; as guardas automáticas não mexem nesta cena.
   */
  pedido?: PedidoDoCliente | null;
  /**
   * A cena cai em TELA COMPARTILHADA (01/10, lib/media/faixas-de-tela.ts): a
   * imagem é a tela do computador, e o narrador, quando aparece, é a webcam
   * no canto. `regiao` é a parte da tela que importa (o zoom vai para lá) e
   * `narrador` a caixa da webcam (nada a cobre); as duas em fração do quadro.
   * Só o completo usa; o corte em pé tem o enquadramento dele.
   */
  tela?: {
    regiao?: { x: number; y: number; w: number; h: number } | null;
    narrador?: { x: number; y: number; w: number; h: number } | null;
    /** As linhas de texto medidas no print (01/10): a caixa do zoom. */
    linhas?: { x: number; y: number; w: number; h: number } | null;
    mostra?: string | null;
  } | null;
};

/**
 * O desenho da legenda no Remotion. "caixa" e "marca-texto" (30/09) só entram
 * quando o cliente fixa o estilo da legenda (lib/media/legenda-escolhida.ts);
 * o diretor continua escolhendo entre os três de sempre. Worker antigo que
 * receba um dos novos desenha a legenda branca de contorno, sem quebrar.
 */
export type EstiloDaLegenda = "papel" | "destaque" | "limpa" | "caixa" | "marca-texto";

export type PlanoDeMontagem = {
  formato: Formato;
  /** Uma frase sobre a linha editorial da montagem, para o relatório. */
  resumo: string;
  legenda: { estilo: EstiloDaLegenda };
  assets: AssetDoPlano[];
  cenas: CenaDoPlano[];
};

/** Palavra no tempo do CORTE (já limpo), que é o tempo do vídeo montado. */
export type PalavraNoCorte = { texto: string; inicio: number; fim: number };

// ─────────────────────────────── regras ───────────────────────────────

/** As regras do dono, em número. O diretor recebe as mesmas no prompt. */
export const REGRAS = {
  /** "variar layout a cada 4 a 8 s": acima disto a cena é longa demais. */
  cenaMaxSeg: 8.5,
  /** Cena menor que isto vira pulo nervoso; é fundida à vizinha. */
  cenaMinSeg: 1.2,
  /** B-roll em tela cheia é curto: de 2 a 4 s. */
  brollMaxSeg: 4.5,
  /** Texto na tela: até 6 palavras. */
  palavrasPorTexto: 6,
  /** Título de colagem (letras de revista, carimbo): até 3 palavras. */
  palavrasPorTitulo: 3,
  /** Letras de revista acima disto não cabem na largura do corte vertical. */
  letrasPorTitulo: 14,
  /**
   * Cenas de cinema da Higgsfield: de 2 a 3 por minuto (reprovação de 29/09,
   * "nenhuma cena": o teto de 2 sem piso virou zero cena no corte). O piso vale
   * a partir de `cenasGeradasAPartirDe` segundos de corte.
   */
  cenasGeradasPorMinuto: 3,
  cenasGeradasMinimoPorMinuto: 2,
  cenasGeradasAPartirDe: 20,
  /**
   * Cenário do narrador recriado em vídeo (gap 11): exatamente 1 por corte a
   * partir de `cenaDoNarradorAPartirDe` segundos; abaixo disso, opcional.
   */
  cenasDoNarradorPorCorte: 1,
  cenaDoNarradorAPartirDe: 30,
  /** Colagens inteiras por minuto (teto de custo, separado dos recortes). */
  colagensPorMinuto: 6,
  /** Recortes NOVOS por minuto; os do catálogo do projeto e os ícones não contam. */
  recortesPorMinuto: 12,
  /** Na família colagem a referência tem 5 a 9 recortes por quadro. */
  elementosPorCenaColagem: 7,
  elementosPorCena: 3,
} as const;

/**
 * CORTE ou COMPLETO (30/09). O corte é curto e vive do impacto: tem PISO de
 * cenas de cinema e cenário do narrador obrigatório. O completo (16:9, por
 * blocos de ~3,5 min, lib/media/montagem-do-completo.ts) não pode ter piso:
 * o piso forçava uma 2a rodada do diretor em todo bloco (tempo e custo
 * dobrados; 22 min dariam ~US$ 7 só de diretor), e o teto de cinema do
 * completo é do vídeo INTEIRO (poucas cenas, cobertura de inserção de 30 a
 * 40%), controlado por quem chama.
 */
export type ModoDaMontagem = "corte" | "completo";

export type TetosDoTrecho = {
  /** Teto de cena-em-movimento neste trecho (no completo, a fatia do bloco). */
  cinema?: number;
  /** Teto de cena-do-narrador neste trecho (no completo, 1 no vídeo todo). */
  cenarioDoNarrador?: number;
};

/** Teto padrão de cenas de cinema por bloco do completo, quando quem chama não diz. */
const CINEMA_POR_BLOCO_DO_COMPLETO = 4;

/**
 * Quantas cenas geradas um trecho pede: o diretor recebe estes números no
 * prompt e o validador cobra os mesmos. No completo não há piso nenhum, e o
 * cenário do narrador só entra se quem chama liberar (padrão 0 por bloco).
 */
export function cenasGeradasDoTrecho(
  duracao: number,
  modo: ModoDaMontagem = "corte",
  tetos: TetosDoTrecho = {}
): { piso: number; teto: number; pisoDoCenario: number; tetoDoCenario: number } {
  if (modo === "completo") {
    return { piso: 0, teto: Math.max(0, tetos.cinema ?? CINEMA_POR_BLOCO_DO_COMPLETO), pisoDoCenario: 0, tetoDoCenario: Math.max(0, tetos.cenarioDoNarrador ?? 0) };
  }
  const minutos = Math.max(duracao / 60, 0.5);
  const piso = duracao >= REGRAS.cenasGeradasAPartirDe ? Math.max(1, Math.round(minutos * REGRAS.cenasGeradasMinimoPorMinuto)) : 0;
  const teto = Math.max(piso, 1, Math.ceil(minutos * REGRAS.cenasGeradasPorMinuto));
  const tetoDoCenario = tetos.cenarioDoNarrador ?? REGRAS.cenasDoNarradorPorCorte;
  const pisoDoCenario = duracao >= REGRAS.cenaDoNarradorAPartirDe ? Math.min(1, tetoDoCenario) : 0;
  return { piso: Math.min(piso, tetos.cinema ?? piso), teto: tetos.cinema ?? teto, pisoDoCenario, tetoDoCenario };
}

/** Compatibilidade: as contas do CORTE. */
export function cenasDeCinemaDoCorte(duracao: number): { piso: number; teto: number } {
  const { piso, teto } = cenasGeradasDoTrecho(duracao, "corte");
  return { piso, teto };
}

// ─────────────────────────────── validação ───────────────────────────────

export type ResultadoDaValidacao = {
  plano: PlanoDeMontagem;
  /** Defeitos que justificam pedir ao diretor outra versão. */
  erros: string[];
  /** Consertos que o código já fez sozinho (vão para o log). */
  avisos: string[];
};

/** Minúsculas, sem acento e sem pontuação: para comparar texto com a fala. */
export function normalizarPalavra(p: string): string {
  return p
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");
}

function palavrasDoTexto(t: string): string[] {
  return t.split(/\s+/).map(normalizarPalavra).filter(Boolean);
}

const umDe = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
  typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : padrao;

const inteiro = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : padrao);

const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Número falado pode vir por extenso ("doze meses"): o gráfico aceita o número
 * se ele OU o extenso dele foi dito. Cobre 0 a 20 e as dezenas, que é onde mora
 * quase todo número de fala; fora disso, o número precisa ter sido transcrito
 * em algarismo.
 */
const EXTENSO: Record<number, string[]> = {
  0: ["zero"], 1: ["um", "uma"], 2: ["dois", "duas"], 3: ["tres"], 4: ["quatro"], 5: ["cinco"], 6: ["seis"],
  7: ["sete"], 8: ["oito"], 9: ["nove"], 10: ["dez"], 11: ["onze"], 12: ["doze"], 13: ["treze"], 14: ["catorze", "quatorze"],
  15: ["quinze"], 16: ["dezesseis"], 17: ["dezessete"], 18: ["dezoito"], 19: ["dezenove"], 20: ["vinte"], 30: ["trinta"],
  40: ["quarenta"], 50: ["cinquenta"], 60: ["sessenta"], 70: ["setenta"], 80: ["oitenta"], 90: ["noventa"], 100: ["cem", "cento"],
  1000: ["mil"],
};

function numeroFoiFalado(n: number, faladas: Set<string>): boolean {
  if (faladas.has(String(n))) return true;
  return (EXTENSO[n] ?? []).some((e) => faladas.has(e));
}

/**
 * O valor da faixa do consórcio (02/10): "120" em "R$ 120 MIL" vale quando a
 * fala tem o 120, o 120000 (transcrito "120.000", que normalizado é 120000) ou
 * o 120 milhões. Valor por extenso acima de 20 ("cento e vinte") não é
 * reconstruído: a faixa sai e o diretor escolhe outra palavra.
 */
function valorFoiFalado(n: number, faladas: Set<string>): boolean {
  return numeroFoiFalado(n, faladas) || faladas.has(String(n * 1000)) || faladas.has(String(n * 1_000_000));
}

/** Palavras que servem de liga e não precisam ter sido faladas ("de", "e"). */
const LIGAS = new Set(["de", "da", "do", "e", "a", "o", "em", "vs", "x", "no", "na", "com", "para", "por"]);

/**
 * Confere e conserta o plano que o diretor devolveu.
 *
 * Conserta sozinho o que é mecânico (índice fora da faixa, cena com buraco,
 * elemento demais) e devolve em `erros` o que é julgamento (cena longa demais,
 * texto que não foi falado): esses justificam uma segunda rodada do diretor, e
 * se ainda assim sobrarem, o elemento sai e a cena é aparada, porque montagem
 * com texto inventado é pior que montagem com menos texto.
 */
export function validarPlano(
  bruto: unknown,
  ctx: {
    palavras: PalavraNoCorte[];
    duracao: number;
    formato: Formato;
    /** Família da linguagem: na colagem cabem mais recortes por cena. */
    familia?: "colagem" | "impacto" | "sobrio";
    /** Descrições do catálogo de recortes do projeto: reaproveitar não conta no teto. */
    recortesProntos?: string[];
    /** Corte (padrão) ou bloco do completo: o completo não tem piso de cinema. */
    modo?: ModoDaMontagem;
    /** Tetos de cena gerada deste trecho, quando quem chama quer outros. */
    tetos?: TetosDoTrecho;
    /** O nome do projeto (02/10): o selo com check pode trazê-lo mesmo sem ter sido dito. */
    nomeDaMarca?: string | null;
  }
): ResultadoDaValidacao {
  const modo: ModoDaMontagem = ctx.modo ?? "corte";
  const erros: string[] = [];
  const avisos: string[] = [];
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const n = ctx.palavras.length;
  const ultima = Math.max(0, n - 1);
  const faladas = new Set(ctx.palavras.flatMap((p) => palavrasDoTexto(p.texto)));

  // Marcas ditas na fala: o ícone só entra onde a marca foi falada.
  const mencoes = marcasNaFala(ctx.palavras);

  // ── assets ──
  const assetsBrutos = Array.isArray(b.assets) ? b.assets : [];
  const assets: AssetDoPlano[] = [];
  for (const a of assetsBrutos) {
    const r = (a ?? {}) as Record<string, unknown>;
    const id = texto(r.id, 40);
    const descricao = texto(r.descricao, 500);
    if (!id || !descricao || assets.some((x) => x.id === id)) continue;
    // Ícone não é pedido como asset: nasce do elemento "icone" (abaixo). Só
    // volta como asset quando o plano JÁ validado passa de novo pelo validador
    // (refazer, ajuste): aí fica, se a marca foi dita na fala.
    const tipo = umDe(TIPOS_DE_ASSET, r.tipo, "colagem");
    if (tipo === "icone") {
      const m = marcaPorId(r.marca);
      if (m && id === `icone-${m.id}` && mencoes.some((x) => x.marca === m.id)) assets.push({ id, tipo, marca: m.id, descricao: m.nome });
      continue;
    }
    const ancora = inteiro(r.ancora, -1);
    const camera = texto(r.camera, 30);
    const efeito = texto(r.efeito, 30);
    const resumo = texto(r.resumo, 160);
    assets.push({
      id,
      tipo,
      descricao,
      ...(resumo ? { resumo } : {}),
      ...(r.doCliente === true ? { doCliente: true } : {}),
      ...(r.comPessoas === true ? { comPessoas: true } : {}),
      ...(ancora >= 0 && ancora <= ultima ? { ancora } : {}),
      // Câmera e efeito só valem com id do catálogo (o prompt da Higgsfield
      // traduz cada id; texto livre ali seria ignorado ou pior).
      ...(ASSETS_EM_VIDEO.includes(tipo) && CAMERAS_VALIDAS.has(camera) ? { camera } : {}),
      ...(ASSETS_EM_VIDEO.includes(tipo) && EFEITOS_VALIDOS.has(efeito) ? { efeito } : {}),
    });
  }
  const minutos = Math.max(ctx.duracao / 60, 0.5);
  // Cenas de cinema: teto de custo E piso (o piso é o que faltava em 29/09).
  const {
    piso: pisoDeCenasGeradas,
    teto: tetoDeCenasGeradas,
    pisoDoCenario,
    tetoDoCenario,
  } = cenasGeradasDoTrecho(ctx.duracao, modo, ctx.tetos);
  const geradas = assets.filter((a) => a.tipo === "cena-em-movimento");
  if (geradas.length > tetoDeCenasGeradas) {
    // As excedentes viram colagem parada: o custo da Higgsfield é o que mais pesa.
    for (const a of geradas.slice(tetoDeCenasGeradas)) a.tipo = "colagem";
    avisos.push(`cenas geradas acima do teto de ${tetoDeCenasGeradas}; as excedentes viraram colagem parada`);
  }
  const doNarrador = assets.filter((a) => a.tipo === "cena-do-narrador");
  if (doNarrador.length > tetoDoCenario) {
    for (const a of doNarrador.slice(tetoDoCenario)) a.tipo = "colagem";
    avisos.push(`mais de ${tetoDoCenario} cenário do narrador; os excedentes viraram colagem parada`);
  }
  // Tetos de imagem separados: colagem inteira pesa mais na tela e no custo;
  // recorte do catálogo do projeto sai de graça e não conta.
  const prontos = new Set((ctx.recortesProntos ?? []).map((d) => d.trim().toLowerCase()));
  const tetoDeColagens = Math.max(3, Math.ceil(minutos * REGRAS.colagensPorMinuto));
  const tetoDeRecortes = Math.max(4, Math.ceil(minutos * REGRAS.recortesPorMinuto));
  const colagens = assets.filter((a) => a.tipo === "colagem").length;
  const recortesNovos = assets.filter((a) => a.tipo === "elemento" && !prontos.has(a.descricao.trim().toLowerCase())).length;
  if (colagens > tetoDeColagens) erros.push(`${colagens} colagens pedidas; o teto é ${tetoDeColagens}. Reaproveite a mesma colagem em mais de uma cena.`);
  if (recortesNovos > tetoDeRecortes) erros.push(`${recortesNovos} recortes novos; o teto é ${tetoDeRecortes}. Use os recortes prontos do projeto pela descrição exata.`);
  const ehAsset = (id: unknown, tipos: AssetDoPlano["tipo"][]) =>
    typeof id === "string" && assets.some((a) => a.id === id && tipos.includes(a.tipo));
  const registrarIcone = (marca: string): string => {
    const id = `icone-${marca}`;
    if (!assets.some((a) => a.id === id)) assets.push({ id, tipo: "icone", marca, descricao: marcaPorId(marca)?.nome ?? marca });
    return id;
  };

  // ── cenas: ordem, cobertura sem buraco, índices válidos ──
  const cenasBrutas = (Array.isArray(b.cenas) ? b.cenas : []) as Record<string, unknown>[];
  // A família manda no vocabulário: o que é de outra linguagem é convertido
  // (ver VOCABULARIO). Sem família (chamadas antigas), vale a colagem.
  const familia: Familia = ctx.familia ?? "colagem";
  const layoutDaFamilia = (l: Layout): Layout => TROCA_DE_LAYOUT[familia][l] ?? l;
  const transicaoDaFamilia = (t: Transicao): Transicao => TROCA_DE_TRANSICAO[familia][t] ?? t;
  const fundoPadrao: Fundo = familia === "impacto" ? "escuro" : "papel";
  const fundoDaFamilia = (f: unknown): Fundo => {
    const bruto = typeof f === "string" && APELIDO_DO_FUNDO[f] ? APELIDO_DO_FUNDO[f] : f;
    const x = umDe(FUNDOS, bruto, fundoPadrao);
    return TROCA_DE_FUNDO[familia][x] ?? x;
  };
  let cenas: CenaDoPlano[] = cenasBrutas
    .map((c) => ({
      de: Math.min(ultima, Math.max(0, inteiro(c.de, 0))),
      ate: Math.min(ultima, Math.max(0, inteiro(c.ate, 0))),
      layout: layoutDaFamilia(umDe(LAYOUTS, c.layout, "narrador-cheio")),
      movimento: umDe(MOVIMENTOS, c.movimento, "estatico"),
      movimentoNa: typeof c.movimentoNa === "number" && Number.isFinite(c.movimentoNa) ? Math.round(c.movimentoNa) : undefined,
      transicao: transicaoDaFamilia(umDe(TRANSICOES, c.transicao, "corte")),
      fundo: fundoDaFamilia(c.fundo),
      asset: typeof c.asset === "string" ? c.asset : undefined,
      elementos: (Array.isArray(c.elementos) ? c.elementos : []) as ElementoDoPlano[],
      motivo: texto(c.motivo, 240),
      ...(typeof c.zoom === "number" && Number.isFinite(c.zoom) && c.zoom > 1.01 ? { zoom: +Math.min(1.3, c.zoom).toFixed(3) } : {}),
    }))
    .sort((x, y) => x.de - y.de);

  if (cenas.length === 0) {
    erros.push("o plano veio sem cenas");
    cenas = [{ de: 0, ate: ultima, layout: "narrador-cheio", movimento: "estatico", transicao: "corte", fundo: "papel", elementos: [], motivo: "plano vazio" }];
  }
  // Emenda: cada cena começa na palavra seguinte à última da anterior. O
  // diretor às vezes deixa uma palavra de fora ou sobrepõe; aqui isso some.
  cenas[0].de = 0;
  for (let i = 1; i < cenas.length; i++) cenas[i].de = Math.max(cenas[i - 1].de + 1, Math.min(cenas[i].de, cenas[i - 1].ate + 1));
  for (let i = 0; i < cenas.length - 1; i++) cenas[i].ate = cenas[i + 1].de - 1;
  cenas[cenas.length - 1].ate = ultima;
  cenas = cenas.filter((c) => c.ate >= c.de && c.de <= ultima);

  // ── cenas curtas demais: fundem na anterior ──
  const tempos = (c: CenaDoPlano) => intervaloDaCena(c, ctx.palavras, ctx.duracao);
  for (let i = cenas.length - 1; i > 0; i--) {
    const { inicio, fim } = tempos(cenas[i]);
    if (fim - inicio < REGRAS.cenaMinSeg) {
      cenas[i - 1].ate = cenas[i].ate;
      cenas[i - 1].elementos.push(...cenas[i].elementos);
      cenas.splice(i, 1);
      avisos.push(`cena de ${(fim - inicio).toFixed(1)} s fundida na anterior`);
    }
  }

  // ── regras por cena ──
  cenas.forEach((c, i) => {
    const { inicio, fim } = tempos(c);
    const dur = fim - inicio;
    const rotulo = `cena ${i + 1} (${inicio.toFixed(1)}-${fim.toFixed(1)} s, ${c.layout})`;
    if (dur > REGRAS.cenaMaxSeg) erros.push(`${rotulo} tem ${dur.toFixed(1)} s; o máximo é ${REGRAS.cenaMaxSeg} s. Divida em duas com layouts diferentes.`);
    if (c.layout === "broll-cheio" && dur > REGRAS.brollMaxSeg) {
      erros.push(`${rotulo}: B-roll cheio de ${dur.toFixed(1)} s; o máximo é ${REGRAS.brollMaxSeg} s.`);
    }
    if (i > 0 && cenas[i - 1].layout === c.layout && c.layout !== "narrador-cheio") {
      avisos.push(`${rotulo} repete o layout da anterior`);
    }
    if (PEDE_MIDIA.includes(c.layout) && !ehAsset(c.asset, ["colagem", "cena-em-movimento", "cena-do-narrador"])) {
      avisos.push(`${rotulo} pedia mídia e veio sem asset válido; virou narrador-cheio`);
      c.layout = "narrador-cheio";
      c.asset = undefined;
    }
    // O PIP (01/10) aceita mídia nos dois terços livres, mas não exige: sem ela,
    // o fundo da linguagem e os elementos ocupam o espaço.
    if (c.layout === "pip-terco" && c.asset && !ehAsset(c.asset, ["colagem", "cena-em-movimento", "cena-do-narrador"])) c.asset = undefined;
    if (!PEDE_MIDIA.includes(c.layout) && c.layout !== "cartela" && c.layout !== "narrador-na-foto" && c.layout !== "pip-terco") c.asset = undefined;

    // Elementos: forma, âncora dentro da cena, texto só falado.
    const faladasNaCena = new Set(ctx.palavras.slice(c.de, c.ate + 1).flatMap((p) => palavrasDoTexto(p.texto)));
    const bons: ElementoDoPlano[] = [];
    for (const e of c.elementos) {
      const el = elementoValido(e, { ultima, faladas, faladasNaCena, ehAsset, cena: c, mencoes, registrarIcone, assets, familia, nomeDaMarca: ctx.nomeDaMarca }, (m) => erros.push(`${rotulo}: ${m}`));
      if (el) bons.push(el);
    }
    // Na colagem o quadro da referência tem 5 a 9 recortes; nas outras
    // famílias o quadro limpo é a linguagem, e 3 bastam.
    const limite = ctx.familia === "colagem" ? REGRAS.elementosPorCenaColagem : REGRAS.elementosPorCena;
    if (bons.length > limite) avisos.push(`${rotulo}: ${bons.length} elementos, ficam ${limite}`);
    c.elementos = bons.slice(0, limite);
    // ESCALONAR (reprovação de 29/09, "nenhum efeito"): o diretor ancorava
    // todos os elementos da cena na mesma palavra e o quadro congelava depois
    // da primeira. Dois na mesma palavra: o segundo vai para uma palavra
    // espaçada dentro da cena. Os textos falados ainda são reancorados pela
    // fala em `resolverMontagem`; isto cobre recorte, seta e gráfico.
    const usadas = new Set<number>();
    const n = c.elementos.length;
    c.elementos.forEach((e, k) => {
      if (usadas.has(e.palavra)) {
        let nova = c.de + Math.round((c.ate - c.de) * ((k + 1) / (n + 1)));
        while (usadas.has(nova) && nova < c.ate) nova++;
        avisos.push(`${rotulo}: ${e.tipo} dividia a palavra ${e.palavra} com outro elemento; foi para ${nova}`);
        e.palavra = nova;
      }
      usadas.add(e.palavra);
    });
    if (c.movimentoNa !== undefined && (c.movimentoNa < c.de || c.movimentoNa > c.ate)) c.movimentoNa = undefined;
    // CENA SEM A PESSOA PRECISA DE ELEMENTO PRINCIPAL (01/10): a cartela é só
    // fundo e o texto dela; sem nenhum elemento, ela seria a tela inteira na
    // cor da marca com a legenda pequena. Volta para a pessoa.
    if (c.layout === "cartela" && !c.elementos.length) {
      avisos.push(`${rotulo} não tinha elemento principal; virou narrador-cheio`);
      c.layout = "narrador-cheio";
      c.asset = undefined;
    }
  });

  // ── âncora dos assets (o substantivo dito) e piso de cinema ──
  for (const a of assets) {
    if (a.ancora === undefined || a.tipo === "icone") continue;
    const ancora = a.ancora;
    const usam = cenas.filter((c) => c.asset === a.id || c.elementos.some((e) => e.tipo === "recorte" && e.asset === a.id));
    if (usam.length && !usam.some((c) => ancora >= c.de && ancora <= c.ate)) {
      const m = `asset ${a.id} ilustra a palavra ${ancora} ("${ctx.palavras[ancora]?.texto ?? ""}"), mas nenhuma cena que o usa contém essa palavra. Ponha o asset na cena em que a palavra é dita.`;
      // No completo, âncora deslocada não vale uma 2a rodada do bloco inteiro.
      (modo === "completo" ? avisos : erros).push(m);
    }
  }
  if (pisoDeCenasGeradas > 0) {
    const cinema = new Set(assets.filter((a) => ASSETS_EM_VIDEO.includes(a.tipo)).map((a) => a.id));
    const naTela = cenas.filter((c) => c.asset && cinema.has(c.asset));
    const geradasUsadas = new Set(naTela.map((c) => c.asset)).size;
    if (geradasUsadas < pisoDeCenasGeradas) {
      erros.push(
        `o corte de ${ctx.duracao.toFixed(0)} s tem ${geradasUsadas} cena(s) de cinema em uso; o mínimo é ${pisoDeCenasGeradas}. Crie assets "cena-em-movimento" nos substantivos concretos da fala e use cada um num broll-cheio de 2 a 4 s na palavra.`
      );
    } else if (!naTela.some((c) => c.layout === "broll-cheio")) {
      erros.push("nenhuma cena de cinema entra em broll-cheio; cada cena gerada abre em tela cheia (2 a 4 s) na palavra que ela ilustra.");
    }
  }
  if (pisoDoCenario > 0) {
    const cenario = new Set(assets.filter((a) => a.tipo === "cena-do-narrador").map((a) => a.id));
    if (!cenas.some((c) => c.asset && cenario.has(c.asset))) {
      erros.push(
        `o corte de ${ctx.duracao.toFixed(0)} s precisa de 1 "cena-do-narrador" (o cenário real recriado, com desintegração) em broll-cheio de 2 a 3 s na virada do argumento.`
      );
    }
  }

  // Assets que nenhuma cena usa não são gerados: custo sem tela.
  const usados = new Set(cenas.flatMap((c) => [c.asset, ...c.elementos.map((e) => (e.tipo === "recorte" ? e.asset : undefined))]).filter(Boolean));
  const assetsUsados = assets.filter((a) => usados.has(a.id));
  if (assetsUsados.length < assets.length) avisos.push(`${assets.length - assetsUsados.length} asset(s) sem uso descartado(s)`);

  const legenda = (b.legenda ?? {}) as Record<string, unknown>;
  return {
    plano: {
      formato: ctx.formato,
      resumo: texto(b.resumo, 400),
      // A legenda é da família, não do diretor: um "papel" escapado num plano
      // de Hormozi punha papel rasgado debaixo de cada palavra.
      legenda: { estilo: ctx.familia ? LEGENDA_DA_FAMILIA[ctx.familia] : umDe(["papel", "destaque", "limpa"] as const, legenda.estilo, "papel") },
      assets: assetsUsados,
      cenas,
    },
    erros,
    avisos,
  };
}

function elementoValido(
  e: unknown,
  ctx: {
    ultima: number;
    faladas: Set<string>;
    faladasNaCena: Set<string>;
    ehAsset: (id: unknown, tipos: AssetDoPlano["tipo"][]) => boolean;
    cena: CenaDoPlano;
    /** Menções de marca na fala inteira (lib/media/marcas-na-fala.ts). */
    mencoes?: MencaoDeMarca[];
    /** Cria (uma vez) o asset do ícone da marca e devolve o id dele. */
    registrarIcone?: (marca: string) => string;
    assets?: AssetDoPlano[];
    familia?: Familia;
    nomeDaMarca?: string | null;
  },
  erro: (m: string) => void
): ElementoDoPlano | null {
  const r = { ...((e ?? {}) as Record<string, unknown>) };
  // O nome que o diretor usou, antes do apelido: "rotulo" é o selo sem check.
  const pedido = typeof r.tipo === "string" ? r.tipo : "";
  // PROMESSA QUE A REGULAÇÃO PROÍBE (02/10, lib/media/promessas-proibidas.ts):
  // nenhum texto da tela promete contemplação garantida, rendimento ou crédito
  // aprovado, em nenhum tipo de elemento e em nenhum setor.
  for (const campo of ["texto", "rotulo", "titulo", "autor"] as const) {
    const motivo = typeof r[campo] === "string" ? promessaProibida(r[campo] as string) : null;
    if (motivo) {
      erro(`texto "${String(r[campo])}" ${motivo}; a regulação proíbe, escolha outra frase`);
      return null;
    }
  }
  // Apelido do prompt da família para o tipo interno, e o que a família não
  // usa vira o equivalente dela (carimbo no Hormozi vira palavra gigante; no
  // BBC, título) ou sai (seta desenhada à mão não existe no telejornal).
  if (typeof r.tipo === "string" && APELIDO_DO_ELEMENTO[r.tipo]) r.tipo = APELIDO_DO_ELEMENTO[r.tipo];
  if (ctx.familia && typeof r.tipo === "string" && r.tipo !== "icone") {
    const troca = TROCA_DE_ELEMENTO[ctx.familia][r.tipo as TipoDeElemento];
    if (troca === null) return null;
    if (troca) r.tipo = troca;
    // No sóbrio o recorte só existe como logo de marca citada (ícone); objeto
    // recortado com borda branca é colagem.
    if (ctx.familia === "sobrio" && r.tipo === "recorte" && !ctx.ehAsset(r.asset, ["icone"])) return null;
  }
  const zona = umDe(ZONAS, r.zona, "topo");
  // Âncora fora da cena vai para a primeira palavra dela: o elemento entra
  // junto da cena em vez de sumir.
  let palavra = inteiro(r.palavra, ctx.cena.de);
  if (palavra < ctx.cena.de || palavra > ctx.cena.ate) palavra = ctx.cena.de;

  const conferirFalado = (t: string, estrito: boolean): boolean => {
    const ps = palavrasDoTexto(t);
    if (ps.length === 0) return false;
    if (ps.length > REGRAS.palavrasPorTexto) {
      erro(`texto "${t}" tem ${ps.length} palavras; o máximo é ${REGRAS.palavrasPorTexto}`);
      return false;
    }
    if (!estrito) return true;
    const fora = ps.filter((p) => !LIGAS.has(p) && !ctx.faladas.has(p) && !/^\d+%?$/.test(p));
    if (fora.length) {
      erro(`texto "${t}" usa palavra que não foi falada (${fora.join(", ")})`);
      return false;
    }
    return true;
  };
  const conferirTitulo = (t: string): boolean => {
    const ps = palavrasDoTexto(t);
    if (ps.length === 0 || ps.length > REGRAS.palavrasPorTitulo) {
      erro(`título "${t}" precisa de 1 a ${REGRAS.palavrasPorTitulo} palavras`);
      return false;
    }
    if (t.replace(/\s/g, "").length > REGRAS.letrasPorTitulo) {
      erro(`título "${t}" passa de ${REGRAS.letrasPorTitulo} letras`);
      return false;
    }
    return true;
  };

  switch (r.tipo) {
    case "recorte": {
      if (!ctx.ehAsset(r.asset, ["elemento", "icone"])) {
        erro(`recorte aponta para asset inexistente ou que não é elemento (${String(r.asset)})`);
        return null;
      }
      // O recorte entra na palavra que o motivou (a âncora do asset), quando
      // ela está nesta cena: "fala mapa, aparece o mapa".
      const ancora = ctx.assets?.find((a) => a.id === r.asset)?.ancora;
      const naPalavra = ancora !== undefined && ancora >= ctx.cena.de && ancora <= ctx.cena.ate ? ancora : palavra;
      return {
        tipo: "recorte",
        asset: r.asset as string,
        zona,
        palavra: naPalavra,
        entrada: umDe(["cair", "deslizar", "pop"] as const, r.entrada, "cair"),
        tamanho: umDe(["p", "m", "g"] as const, r.tamanho, "m"),
      };
    }
    case "icone": {
      // Logo de marca citada (pedido do dono, 30/09): vira um recorte cujo
      // asset é o SVG oficial renderizado em código. Só marca DITA nesta cena,
      // e sempre na palavra em que ela é dita.
      const marca = marcaPorId(r.marca);
      if (!marca || !ctx.registrarIcone) {
        erro(`ícone de marca desconhecida (${String(r.marca)})`);
        return null;
      }
      const dita = (ctx.mencoes ?? []).filter((m) => m.marca === marca.id && m.palavra >= ctx.cena.de && m.palavra <= ctx.cena.ate);
      if (!dita.length) {
        erro(`ícone de ${marca.nome} numa cena em que ${marca.nome} não é dito`);
        return null;
      }
      const naPalavra = dita.reduce((melhor, m) => (Math.abs(m.palavra - palavra) < Math.abs(melhor.palavra - palavra) ? m : melhor)).palavra;
      return {
        tipo: "recorte",
        asset: ctx.registrarIcone(marca.id),
        zona,
        palavra: naPalavra,
        entrada: umDe(["cair", "deslizar", "pop"] as const, r.entrada, "pop"),
        tamanho: umDe(["p", "m", "g"] as const, r.tamanho, "m"),
      };
    }
    case "marca-texto":
    case "tarja": {
      const t = texto(r.texto, 60);
      // Marca-texto e tarja são FALA na tela: só palavra dita.
      if (!conferirFalado(t, true)) return null;
      // O chapéu da tarja de telejornal é curto como um título; longo, sai só ele.
      const chapeu = r.tipo === "tarja" ? texto(r.rotulo, 28) : "";
      const rotulo = chapeu && palavrasDoTexto(chapeu).length <= REGRAS.palavrasPorTitulo ? chapeu : undefined;
      return r.tipo === "tarja" ? { tipo: "tarja", texto: t, zona, palavra, ...(rotulo ? { rotulo } : {}) } : { tipo: "marca-texto", texto: t, zona, palavra, ...(r.visual === "faixa" ? { visual: "faixa" as const } : {}) };
    }
    case "icone-pop": {
      const nome = umDe(ICONES_POP, r.nome, "estrela");
      return { tipo: "icone-pop", nome, zona, palavra };
    }
    case "letras-revista":
    case "carimbo":
    case "titulo": {
      const t = texto(r.texto, 30);
      // Título curto pode não ter sido dito ("REMOTION"), mas é curto e correto.
      if (!conferirTitulo(t)) return null;
      return { tipo: r.tipo, texto: t, zona, palavra };
    }
    case "numero": {
      const valor = typeof r.valor === "number" && Number.isFinite(r.valor) ? r.valor : NaN;
      const rotulo = texto(r.rotulo, 40);
      // Número real é código, e só número que foi DITO (Bíblia, regra 3).
      if (!Number.isFinite(valor) || !numeroFoiFalado(valor, ctx.faladas)) {
        erro(`número ${String(r.valor)} não aparece na fala`);
        return null;
      }
      if (!conferirFalado(rotulo, false)) return null;
      // A fonte do número (telejornal) só entra se foi DITA: fonte inventada
      // é dado inventado. Não dita, o número sai sem ela.
      const fonteBruta = texto(r.fonte, 40);
      const faladasDaFonte = palavrasDoTexto(fonteBruta).filter((p) => !LIGAS.has(p) && p !== "fonte" && p !== "segundo");
      const fonte = fonteBruta && faladasDaFonte.length && faladasDaFonte.every((p) => ctx.faladas.has(p)) ? fonteBruta : undefined;
      return { tipo: "numero", valor, rotulo, prefixo: texto(r.prefixo, 4) || undefined, sufixo: texto(r.sufixo, 12) || undefined, ...(fonte ? { fonte } : {}), zona, palavra };
    }
    case "barras": {
      const itens = (Array.isArray(r.itens) ? r.itens : [])
        .map((x) => {
          const i = (x ?? {}) as Record<string, unknown>;
          return { rotulo: texto(i.rotulo, 24), valor: typeof i.valor === "number" ? i.valor : NaN, texto: texto(i.texto, 24) };
        })
        .filter((i) => i.rotulo && Number.isFinite(i.valor) && i.valor >= 0)
        .slice(0, 4);
      if (itens.length < 2) {
        erro("gráfico de barras precisa de 2 a 4 itens com valor");
        return null;
      }
      // O valor da barra pode ser convertido (12 meses = 365 dias), mas o
      // TEXTO que aparece precisa trazer o número falado.
      for (const i of itens) {
        const nums = (i.texto.match(/\d+/g) ?? []).map(Number);
        const dito = nums.length === 0 ? palavrasDoTexto(i.texto).some((p) => ctx.faladas.has(p)) : nums.every((x) => numeroFoiFalado(x, ctx.faladas));
        if (!dito) {
          erro(`barra "${i.rotulo}: ${i.texto}" não traz número falado`);
          return null;
        }
      }
      return { tipo: "barras", titulo: texto(r.titulo, 40) || undefined, itens, zona, palavra };
    }
    case "faixa": {
      // O VALOR NA FAIXA (02/10): curto como um título, e tudo dito. "R$" e
      // "mil" não precisam ter sido transcritos do mesmo jeito: "120 MIL"
      // vale quando a fala disse "120 mil", "120.000" ou "cento e vinte mil".
      const t = texto(r.texto, 30).toUpperCase();
      if (!conferirTitulo(t)) return null;
      const ps = palavrasDoTexto(t).filter((p) => !LIGAS.has(p) && p !== "r" && p !== "rs");
      const forma = ps.filter((p) => {
        if (/^\d+%?$/.test(p)) return !valorFoiFalado(Number(p.replace("%", "")), ctx.faladas);
        return !ctx.faladas.has(p) && !(p === "mil" && ps.some((x) => /^\d+$/.test(x)));
      });
      if (!ps.length || forma.length) {
        erro(`faixa "${t}" usa palavra ou número que não foi falado (${forma.join(", ")})`);
        return null;
      }
      return { tipo: "faixa", texto: t, zona, palavra };
    }
    case "selo": {
      // Com check: o nome da marca ou do vendedor, até 4 palavras, dito na
      // fala OU igual ao nome do projeto. Sem check ("rotulo"): a frase DITA.
      const check = pedido !== "rotulo" && pedido !== "rótulo" && r.check !== false;
      const t = texto(r.texto, 40);
      const ps = palavrasDoTexto(t);
      if (!ps.length || ps.length > (check ? 4 : REGRAS.palavrasPorTexto)) {
        erro(`selo "${t}" precisa de 1 a ${check ? 4 : REGRAS.palavrasPorTexto} palavras`);
        return null;
      }
      const marca = palavrasDoTexto(ctx.nomeDaMarca ?? "");
      const daMarca = check && marca.length > 0 && ps.every((p) => marca.includes(p) || LIGAS.has(p));
      if (!daMarca && !conferirFalado(t, true)) return null;
      return { tipo: "selo", texto: t, check, zona, palavra };
    }
    case "comentario": {
      // A pergunta como foi DITA (o vendedor lê o comentário em voz alta), até
      // 10 palavras; o @ só se o nome foi dito.
      const t = texto(r.texto, 90);
      const ps = palavrasDoTexto(t);
      if (!ps.length || ps.length > 10) {
        erro(`comentário "${t}" precisa de 1 a 10 palavras`);
        return null;
      }
      const fora = ps.filter((p) => !LIGAS.has(p) && !ctx.faladas.has(p) && !/^\d+%?$/.test(p));
      if (fora.length) {
        erro(`comentário "${t}" usa palavra que não foi falada (${fora.join(", ")})`);
        return null;
      }
      const autorBruto = texto(r.autor, 30).replace(/^@+/, "");
      const autor = autorBruto && palavrasDoTexto(autorBruto).every((p) => ctx.faladas.has(p)) ? autorBruto : undefined;
      return { tipo: "comentario", texto: t, ...(autor ? { autor } : {}), zona, palavra };
    }
    case "seta":
    case "circulo":
      return { tipo: r.tipo, zona, palavra };
    default:
      return null;
  }
}

/**
 * A rede de segurança depois da revisão do diretor: B-roll longo vira canto
 * (a mesma imagem, com o narrador de volta) e cena longa é partida ao meio,
 * na palavra mais perto do meio, com a segunda metade no narrador cheio (ou
 * no canto, quando a primeira já era cheia). Julgamento pior que o do
 * diretor, mas nunca uma cena parada de 15 s.
 */
export function apararCenas(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, familia: Familia = "colagem"): { plano: PlanoDeMontagem; avisos: string[] } {
  const avisos: string[] = [];
  const cenas: CenaDoPlano[] = [];
  const fila = plano.cenas.map((c) => ({ ...c, elementos: [...c.elementos] }));
  while (fila.length) {
    const c = fila.shift()!;
    const { inicio, fim } = intervaloDaCena(c, palavras, duracao);
    if (c.layout === "broll-cheio" && fim - inicio > REGRAS.brollMaxSeg) {
      c.layout = "narrador-canto";
      avisos.push(`B-roll de ${(fim - inicio).toFixed(1)} s virou narrador-canto`);
    }
    if (fim - inicio > REGRAS.cenaMaxSeg && c.ate > c.de + 2) {
      const meio = (inicio + fim) / 2;
      let corte = c.de + 1;
      for (let i = c.de + 1; i <= c.ate; i++) if (Math.abs(palavras[i].inicio - meio) < Math.abs(palavras[corte].inicio - meio)) corte = i;
      const segunda: CenaDoPlano = {
        ...c,
        de: corte,
        layout: c.layout === "narrador-cheio" ? (c.asset ? "narrador-canto" : "narrador-recortado") : "narrador-cheio",
        movimento: c.movimento === "zoom-in-lento" ? "zoom-out" : "zoom-in-lento",
        transicao: "corte",
        elementos: c.elementos.filter((e) => e.palavra >= corte),
        motivo: `${c.motivo} (continuação, partida por tamanho)`,
      };
      if (segunda.layout === "narrador-canto" && !segunda.asset) segunda.layout = "narrador-cheio";
      // Recortado não existe no sóbrio: a continuação fica cheia, com outro movimento.
      if (segunda.layout === "narrador-recortado" && !VOCABULARIO[familia].layouts.includes("narrador-recortado")) segunda.layout = "narrador-cheio";
      const primeira: CenaDoPlano = { ...c, ate: corte - 1, elementos: c.elementos.filter((e) => e.palavra < corte) };
      avisos.push(`cena de ${(fim - inicio).toFixed(1)} s partida em duas`);
      fila.unshift(primeira, segunda);
      // A primeira metade volta à fila e é conferida de novo (pode ainda ser longa).
      const p = fila.shift()!;
      const t = intervaloDaCena(p, palavras, duracao);
      if (t.fim - t.inicio > REGRAS.cenaMaxSeg) fila.unshift(p);
      else cenas.push(p);
      continue;
    }
    cenas.push(c);
  }
  return { plano: { ...plano, cenas }, avisos };
}

// ─────────────────────────────── tempo ───────────────────────────────

/**
 * Onde a cena começa e termina, em segundos do vídeo montado. A borda entre
 * duas cenas cai no silêncio entre as palavras, um pouco antes do ataque da
 * primeira palavra da cena nova: o corte na imagem chega junto da fala, nunca
 * depois dela.
 */
export function intervaloDaCena(c: { de: number; ate: number }, palavras: PalavraNoCorte[], duracao: number): { inicio: number; fim: number } {
  const borda = (i: number) => {
    if (i <= 0) return 0;
    if (i >= palavras.length) return duracao;
    const antes = palavras[i - 1].fim;
    const depois = palavras[i].inicio;
    return Math.max(antes, depois - 0.12);
  };
  return { inicio: borda(c.de), fim: c.ate + 1 >= palavras.length ? duracao : borda(c.ate + 1) };
}

/** Quanto dura a animação de saída de um elemento, em segundos (8 quadros a 30 fps). */
export const DURACAO_DA_SAIDA = 0.27;

/**
 * Onde um texto do diretor aparece DITO na cena: o trecho da fala que ele
 * repete, e o segundo de cada palavra dele. Reprovação de 29/09: o diretor
 * ancorava o marca-texto na primeira palavra da cena, e o texto aparecia 3 a
 * 4 s antes da voz ("no seu dia a dia" entrava junto de "a inteligência").
 *
 * Alinhamento guloso: cada palavra do texto procura a próxima igual na fala,
 * pulando até duas palavras (muleta, "ali", "né"). Vale o começo que acerta
 * mais palavras (metade ou mais), e no empate o mais perto da âncora do
 * diretor. Texto que não foi dito (um título como "REMOTION") devolve null e
 * fica na âncora do diretor.
 */
export function textoNaFala(
  textoDoElemento: string,
  palavras: PalavraNoCorte[],
  de: number,
  ate: number,
  preferida: number
): { de: number; ate: number; tempos: { inicio: number; fim: number }[] } | null {
  // Cada pedaço do texto como aparece na tela, com a forma normalizada ao lado.
  const pedacos = textoDoElemento.split(/\s+/).filter(Boolean).map((p) => ({ tela: p, norma: normalizarPalavra(p) }));
  const alvo = pedacos.filter((p) => p.norma);
  if (!alvo.length || de > ate) return null;
  const faladas = palavras.map((p) => normalizarPalavra(p.texto));
  let melhor: { de: number; ate: number; acertos: number; distancia: number; casou: number[] } | null = null;
  for (let s = de; s <= ate; s++) {
    let k = s;
    const casou: number[] = [];
    for (const w of alvo) {
      let achou = -1;
      for (let j = k; j <= Math.min(ate, k + 2); j++) {
        if (faladas[j] === w.norma) {
          achou = j;
          break;
        }
      }
      casou.push(achou);
      if (achou >= 0) k = achou + 1;
    }
    const acertados = casou.filter((x) => x >= 0);
    // Cada começo é contado uma vez só: no índice da primeira palavra que casou.
    if (!acertados.length || acertados[0] !== s) continue;
    const acertos = acertados.length;
    if (acertos * 2 < alvo.length) continue;
    const distancia = Math.abs(s - preferida);
    if (!melhor || acertos > melhor.acertos || (acertos === melhor.acertos && distancia < melhor.distancia)) {
      melhor = { de: s, ate: acertados[acertados.length - 1], acertos, distancia, casou };
    }
  }
  if (!melhor) return null;
  // O tempo de cada palavra da TELA: a casada leva o da fala; a que não casou
  // (ou pontuação solta) herda o fim da anterior, para o grifo não pular.
  const tempos: { inicio: number; fim: number }[] = [];
  let a = 0;
  let ultimo = { inicio: palavras[melhor.de].inicio, fim: palavras[melhor.de].inicio };
  for (const p of pedacos) {
    if (!p.norma) {
      tempos.push({ ...ultimo });
      continue;
    }
    const j = melhor.casou[a++];
    if (j >= 0) ultimo = { inicio: palavras[j].inicio, fim: palavras[j].fim };
    else ultimo = { inicio: ultimo.fim, fim: ultimo.fim + 0.15 };
    tempos.push({ ...ultimo });
  }
  return { de: melhor.de, ate: melhor.ate, tempos };
}

type TempoDoElemento = {
  inicio: number;
  fim: number;
  saida: SaidaDoElemento;
  palavras?: { texto: string; inicio: number; fim: number }[];
};

/** Textos que repetem a fala: entram na palavra dita e saem depois da última. */
// O comentário respondido (02/10) também é fala: fica até a pergunta acabar de ser lida.
const EH_FALA = (t: TipoDeElemento) => t === "marca-texto" || t === "tarja" || t === "comentario";

/**
 * O TEMPO dos elementos de uma cena (reprovação de 29/09, "nenhum efeito").
 *
 * 1. Texto que foi dito entra NA palavra dita (ver `textoNaFala`), inclusive
 *    título e carimbo ("ESTAGIÁRIO" entra quando a voz diz "estagiário").
 * 2. O que não tem palavra (recorte, seta, gráfico) fica na âncora do diretor
 *    se ela estiver livre; se cair a menos de 1 s de outro elemento, vai para
 *    a palavra que mais se afasta dos já colocados: algo novo entra ao longo
 *    da cena, e não tudo no primeiro quadro.
 * 3. Nunca dois no mesmo instante: 0,25 s de piso entre entradas.
 * 4. Saída: texto falado sai 0,4 s depois da última palavra (a legenda volta);
 *    o resto sai um pouco antes do corte (recorte cai, título encolhe).
 */
export function tempoDosElementos(c: CenaDoPlano, palavras: PalavraNoCorte[], inicio: number, fim: number): Map<ElementoDoPlano, TempoDoElemento> {
  const saida = new Map<ElementoDoPlano, TempoDoElemento>();
  const inicioDe = (i: number) => Math.max(inicio, palavras[Math.max(0, Math.min(palavras.length - 1, i))]?.inicio ?? inicio);
  // Ninguém entra no último segundo: entraria para sair em seguida.
  const ultimaEntrada = Math.max(inicio, fim - 1.1);

  type Linha = { e: ElementoDoPlano; t: number; fixo: boolean; faixa: ReturnType<typeof textoNaFala> };
  const linhas: Linha[] = c.elementos.map((e) => {
    let faixa: ReturnType<typeof textoNaFala> = null;
    if (e.tipo === "marca-texto" || e.tipo === "tarja" || e.tipo === "letras-revista" || e.tipo === "carimbo" || e.tipo === "titulo" || e.tipo === "faixa" || e.tipo === "selo" || e.tipo === "comentario") {
      faixa = textoNaFala(e.texto, palavras, c.de, c.ate, e.palavra);
    } else if (e.tipo === "numero") {
      for (const forma of [String(e.valor), ...(EXTENSO[e.valor] ?? [])]) {
        faixa = textoNaFala(forma, palavras, c.de, c.ate, e.palavra);
        if (faixa) break;
      }
    }
    return { e, t: faixa ? inicioDe(faixa.de) : inicioDe(e.palavra), fixo: !!faixa, faixa };
  });

  // Os sem palavra, na ordem do diretor, procuram lugar longe dos outros.
  const ocupados = linhas.filter((l) => l.fixo).map((l) => l.t);
  // Quem é reposicionado fica pelo menos 1,8 s na tela antes de sair.
  const candidatos = palavras.slice(c.de, c.ate + 1).map((p) => Math.max(inicio, p.inicio)).filter((x) => x >= inicio + 0.25 && x <= Math.max(inicio + 0.25, fim - 1.8));
  for (const l of linhas.filter((x) => !x.fixo)) {
    const longe = (x: number) => ocupados.every((o) => Math.abs(o - x) >= 1);
    if (!longe(l.t) && candidatos.length) {
      // A palavra cuja menor distância aos já colocados (e ao começo da cena,
      // que já é "algo novo") é a maior.
      let melhor = l.t;
      let folgaMelhor = -1;
      for (const x of candidatos) {
        const f = Math.min(x - inicio + 0.5, ...ocupados.map((o) => Math.abs(o - x)));
        if (f > folgaMelhor + 1e-6) {
          folgaMelhor = f;
          melhor = x;
        }
      }
      l.t = melhor;
    }
    ocupados.push(l.t);
  }

  const ordem = [...linhas].sort((a, b) => a.t - b.t);
  let anterior = -Infinity;
  for (const l of ordem) {
    l.t = Math.min(ultimaEntrada, Math.max(l.t, anterior + 0.25));
    anterior = l.t;
    const e = l.e;
    let t: TempoDoElemento;
    if (EH_FALA(e.tipo) && l.faixa) {
      const ultima = palavras[l.faixa.ate];
      const partes = (e as { texto: string }).texto.split(/\s+/).filter(Boolean);
      t = {
        inicio: l.t,
        fim: Math.min(fim - 0.05, Math.max(l.t + 1.2, ultima.fim + 0.4)),
        saida: e.tipo === "tarja" ? "deslizar" : "encolher",
        palavras: partes.map((texto, i) => ({ texto, inicio: +l.faixa!.tempos[i].inicio.toFixed(3), fim: +l.faixa!.tempos[i].fim.toFixed(3) })),
      };
    } else if (EH_FALA(e.tipo)) {
      // Texto falado que não casou com a fala: fica o tempo de ler.
      const n = (e as { texto: string }).texto.split(/\s+/).length;
      t = { inicio: l.t, fim: Math.min(fim - DURACAO_DA_SAIDA, l.t + 1.5 + n * 0.35), saida: "encolher" };
    } else {
      const saidaDoTipo: SaidaDoElemento = e.tipo === "recorte" ? "cair" : e.tipo === "carimbo" ? "fica" : "encolher";
      t = { inicio: l.t, fim: saidaDoTipo === "fica" ? fim : Math.max(l.t + 0.6, fim - DURACAO_DA_SAIDA - 0.08), saida: saidaDoTipo };
    }
    t.inicio = +t.inicio.toFixed(3);
    t.fim = +Math.max(t.inicio + 0.5, t.fim).toFixed(3);
    saida.set(e, t);
  }
  return saida;
}

/**
 * O segundo da palavra FORTE da cena, onde o punch bate. O diretor pode dizer
 * (`movimentoNa`); sem isso vale o título ou carimbo da cena (o momento que o
 * diretor já marcou como ênfase) e, sem eles, a palavra mais longa da fala,
 * que em português costuma ser a de conteúdo ("construí", "estagiário").
 * Nunca no primeiro terço de segundo: punch no corte é só um corte.
 */
export function palavraForte(c: CenaDoPlano, palavras: PalavraNoCorte[], elementos: ElementoResolvido[], inicio: number, fim: number): number {
  if (c.movimentoNa !== undefined && c.movimentoNa >= c.de && c.movimentoNa <= c.ate) return Math.max(inicio, palavras[c.movimentoNa].inicio);
  const de = inicio + 0.3;
  const ate = Math.max(de, fim - 0.6);
  const enfase = elementos.find((e) => (e.tipo === "carimbo" || e.tipo === "letras-revista" || e.tipo === "numero" || e.tipo === "titulo" || e.tipo === "faixa") && e.inicio >= de && e.inicio <= ate);
  if (enfase) return enfase.inicio;
  let melhor: PalavraNoCorte | null = null;
  for (const p of palavras.slice(c.de, c.ate + 1)) {
    if (p.inicio < de || p.inicio > ate) continue;
    const n = normalizarPalavra(p.texto);
    if (LIGAS.has(n)) continue;
    if (!melhor || n.length > normalizarPalavra(melhor.texto).length) melhor = p;
  }
  return melhor ? melhor.inicio : inicio;
}

// ─────────────────────────────── geometria ───────────────────────────────

export type Retangulo = { x: number; y: number; w: number; h: number };

/** Fração do quadro (0 a 1) para pixels. */
const px = (r: Retangulo, W: number, H: number): Retangulo => ({ x: Math.round(r.x * W), y: Math.round(r.y * H), w: Math.round(r.w * W), h: Math.round(r.h * H) });

const cruza = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const folga = (r: Retangulo, f: number): Retangulo => ({ x: r.x - r.w * f, y: r.y - r.h * f, w: r.w * (1 + 2 * f), h: r.h * (1 + 2 * f) });

/**
 * As zonas onde o diretor pode pôr elemento, em fração do quadro. As mesmas
 * nos dois formatos; o que muda por layout é o que está PROIBIDO (rosto,
 * janela do narrador, legenda), e isso é conferido em pixel.
 */
const ZONA_NO_QUADRO: Record<Zona, Retangulo> = {
  topo: { x: 0.08, y: 0.035, w: 0.84, h: 0.17 },
  "topo-esquerda": { x: 0.04, y: 0.035, w: 0.44, h: 0.19 },
  "topo-direita": { x: 0.52, y: 0.035, w: 0.44, h: 0.19 },
  "meio-esquerda": { x: 0.02, y: 0.36, w: 0.3, h: 0.24 },
  "meio-direita": { x: 0.68, y: 0.36, w: 0.3, h: 0.24 },
  centro: { x: 0.18, y: 0.3, w: 0.64, h: 0.34 },
  base: { x: 0.08, y: 0.8, w: 0.84, h: 0.15 },
  "base-esquerda": { x: 0.04, y: 0.8, w: 0.44, h: 0.15 },
  "base-direita": { x: 0.52, y: 0.8, w: 0.44, h: 0.15 },
};

/** A faixa inteira da mesma altura, para texto que pediu meia zona. */
const FAIXA_INTEIRA: Partial<Record<Zona, Retangulo>> = {
  "topo-esquerda": ZONA_NO_QUADRO.topo,
  "topo-direita": ZONA_NO_QUADRO.topo,
  "base-esquerda": ZONA_NO_QUADRO.base,
  "base-direita": ZONA_NO_QUADRO.base,
  topo: ZONA_NO_QUADRO.topo,
  base: ZONA_NO_QUADRO.base,
  // As laterais do meio são estreitas para fugir do rosto no narrador cheio;
  // onde não há rosto ali (canto, cartela), o texto ocupa até o centro.
  "meio-esquerda": { x: 0.03, y: 0.36, w: 0.62, h: 0.22 },
  "meio-direita": { x: 0.35, y: 0.36, w: 0.62, h: 0.22 },
};

// Só os de UMA linha larga; marca-texto e carimbo cabem em meia zona com duas
// linhas, e alargá-los tirava o lugar do vizinho (o carimbo sumiu na prova).
// A faixa de valor e o comentário do consórcio (02/10) também pedem a faixa larga.
const ehTexto = (t: TipoDeElemento) => t === "letras-revista" || t === "tarja" || t === "titulo" || t === "faixa" || t === "comentario";

/** Na cartela não há narrador: o centro é o palco e cresce. */
function zonaDoLayout(z: Zona, layout: Layout, formato: Formato = "9:16"): Retangulo {
  if (layout === "cartela" && z === "centro") return { x: 0.07, y: 0.2, w: 0.86, h: 0.44 };
  if (layout === "pip-terco") {
    const a = AREA_LIVRE_DO_PIP[formato];
    const r = ZONA_NO_QUADRO[z];
    return { x: a.x + r.x * a.w, y: a.y + r.y * a.h, w: r.w * a.w, h: r.h * a.h };
  }
  // No canto vertical, a coluna ao lado da janela do narrador é o lugar dos
  // recortes e textos soltos (29/09: a janela cresceu e a meia zona do meio
  // batia nela, e o marca-texto saía da cena).
  if (formato === "9:16" && layout === "narrador-canto") {
    if (z === "meio-esquerda") return { x: 0.02, y: 0.515, w: 0.31, h: 0.165 };
    if (z === "base-esquerda") return { x: 0.02, y: 0.685, w: 0.31, h: 0.16 };
  }
  return ZONA_NO_QUADRO[z];
}

/** A ordem de fuga quando a zona pedida bate no rosto ou na legenda. */
const FUGA: Zona[] = ["topo", "topo-direita", "topo-esquerda", "base", "base-direita", "base-esquerda", "meio-direita", "meio-esquerda", "centro"];

type GeometriaDoLayout = {
  /** Onde o narrador aparece (fração do quadro), ou null quando não aparece. */
  narrador: Retangulo | null;
  /** Quanto da altura da caixa o rosto ocupa no enquadramento. */
  rostoNaCaixa: number;
  /** Onde a mídia (colagem ou cena) aparece. */
  midia: Retangulo | null;
  /** Centro e largura da legenda (fração). */
  legenda: { x: number; y: number; w: number };
  moldura: "nenhuma" | "canto" | "foto";
  rotacaoNarrador: number;
  rotacaoMidia: number;
};

const GEOMETRIA: Record<Formato, Record<Layout, GeometriaDoLayout>> = {
  "9:16": {
    // O narrador cheio do vertical começa a 20% do topo (30/09, pedido do
    // Bruno: "não precisa preencher tanto a tela com a pessoa, pode reduzir um
    // pouco para caber os elementos"). Na gravação deitada o recorte já usava a
    // altura inteira, então a pessoa só diminui se a caixa diminui: com 80% da
    // altura ela aparece 20% menor, mais aberta, e a faixa de cima fica para
    // título e elementos, sobre o fundo da linguagem.
    "narrador-cheio": { narrador: { x: 0, y: 0.2, w: 1, h: 0.8 }, rostoNaCaixa: 0.2, midia: null, legenda: { x: 0.5, y: 0.76, w: 0.86 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    // Janela do narrador maior (0,44 x 0,30 sumia no quadro, reprovação de
    // 29/09) e sobreposta à ponta da colagem, como foto colada por cima; a
    // coluna à esquerda dela fica para os recortes soltos.
    "narrador-canto": { narrador: { x: 0.35, y: 0.46, w: 0.61, h: 0.38 }, rostoNaCaixa: 0.42, midia: { x: 0.05, y: 0.045, w: 0.9, h: 0.46 }, legenda: { x: 0.5, y: 0.905, w: 0.9 }, moldura: "canto", rotacaoNarrador: 1.2, rotacaoMidia: -1.5 },
    "narrador-na-foto": { narrador: { x: 0.15, y: 0.21, w: 0.7, h: 0.44 }, rostoNaCaixa: 0.36, midia: null, legenda: { x: 0.5, y: 0.73, w: 0.86 }, moldura: "foto", rotacaoNarrador: -3, rotacaoMidia: 0 },
    "narrador-recortado": { narrador: { x: 0, y: 0.18, w: 1, h: 0.82 }, rostoNaCaixa: 0, midia: null, legenda: { x: 0.5, y: 0.8, w: 0.86 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    "tela-dividida": { narrador: { x: 0, y: 0.5, w: 1, h: 0.5 }, rostoNaCaixa: 0.36, midia: { x: 0, y: 0, w: 1, h: 0.5 }, legenda: { x: 0.5, y: 0.5, w: 0.8 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    "broll-cheio": { narrador: null, rostoNaCaixa: 0, midia: { x: 0, y: 0, w: 1, h: 1 }, legenda: { x: 0.5, y: 0.76, w: 0.86 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    cartela: { narrador: null, rostoNaCaixa: 0, midia: null, legenda: { x: 0.5, y: 0.78, w: 0.86 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    // O PIP no vertical: a pessoa no terço de baixo, numa janela larga; os dois
    // terços de cima para a mídia e os elementos, a legenda entre os dois.
    "pip-terco": { narrador: { x: 0.04, y: 0.655, w: 0.92, h: 0.315 }, rostoNaCaixa: 0.42, midia: { x: 0.04, y: 0.035, w: 0.92, h: 0.52 }, legenda: { x: 0.5, y: 0.6, w: 0.9 }, moldura: "canto", rotacaoNarrador: 0, rotacaoMidia: 0 },
  },
  "16:9": {
    "narrador-cheio": { narrador: { x: 0, y: 0, w: 1, h: 1 }, rostoNaCaixa: 0.35, midia: null, legenda: { x: 0.5, y: 0.87, w: 0.7 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    "narrador-canto": { narrador: { x: 0.68, y: 0.44, w: 0.28, h: 0.46 }, rostoNaCaixa: 0.4, midia: { x: 0.04, y: 0.07, w: 0.6, h: 0.74 }, legenda: { x: 0.82, y: 0.9, w: 0.34 }, moldura: "canto", rotacaoNarrador: 0, rotacaoMidia: -1 },
    "narrador-na-foto": { narrador: { x: 0.33, y: 0.1, w: 0.34, h: 0.7 }, rostoNaCaixa: 0.36, midia: null, legenda: { x: 0.5, y: 0.9, w: 0.7 }, moldura: "foto", rotacaoNarrador: -3, rotacaoMidia: 0 },
    "narrador-recortado": { narrador: { x: 0.35, y: 0.1, w: 0.62, h: 0.9 }, rostoNaCaixa: 0, midia: null, legenda: { x: 0.5, y: 0.9, w: 0.7 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    "tela-dividida": { narrador: { x: 0.5, y: 0, w: 0.5, h: 1 }, rostoNaCaixa: 0.36, midia: { x: 0, y: 0, w: 0.5, h: 1 }, legenda: { x: 0.5, y: 0.88, w: 0.6 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    "broll-cheio": { narrador: null, rostoNaCaixa: 0, midia: { x: 0, y: 0, w: 1, h: 1 }, legenda: { x: 0.5, y: 0.87, w: 0.7 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    cartela: { narrador: null, rostoNaCaixa: 0, midia: null, legenda: { x: 0.5, y: 0.88, w: 0.7 }, moldura: "nenhuma", rotacaoNarrador: 0, rotacaoMidia: 0 },
    // O PIP no deitado: a pessoa no terço da direita, de alto a baixo; os dois
    // terços da esquerda para a mídia e os elementos.
    "pip-terco": { narrador: { x: 0.675, y: 0.06, w: 0.3, h: 0.88 }, rostoNaCaixa: 0.3, midia: { x: 0.03, y: 0.07, w: 0.615, h: 0.74 }, legenda: { x: 0.335, y: 0.9, w: 0.6 }, moldura: "canto", rotacaoNarrador: 0, rotacaoMidia: 0 },
  },
};

/**
 * As zonas no PIP (01/10): os elementos vivem nos dois terços livres, então a
 * zona do quadro inteiro é encolhida para dentro deles.
 */
const AREA_LIVRE_DO_PIP: Record<Formato, Retangulo> = {
  "9:16": { x: 0.03, y: 0.03, w: 0.94, h: 0.55 },
  "16:9": { x: 0.02, y: 0.05, w: 0.63, h: 0.78 },
};

/** As medidas do quadro de saída. */
export function dimensoesDoFormato(f: Formato): { largura: number; altura: number } {
  return f === "9:16" ? { largura: 1080, altura: 1920 } : { largura: 1920, altura: 1080 };
}

/**
 * Qual pedaço da gravação mostrar numa caixa, para o rosto ocupar `fracao` da
 * altura dela, com os olhos no terço de cima. Limitado à gravação: nunca pede
 * pixel que não existe (isso seria borda preta).
 */
export function recorteAoRedorDoRosto(
  fonte: { largura: number; altura: number },
  rosto: Retangulo,
  aspecto: number,
  fracao: number
): Retangulo {
  const rostoH = rosto.h * fonte.altura;
  let h = fracao > 0 ? rostoH / fracao : fonte.altura;
  let w = h * aspecto;
  if (h > fonte.altura) { h = fonte.altura; w = h * aspecto; }
  if (w > fonte.largura) { w = fonte.largura; h = w / aspecto; }
  const cx = (rosto.x + rosto.w / 2) * fonte.largura;
  const cy = (rosto.y + rosto.h / 2) * fonte.altura;
  const x = Math.max(0, Math.min(fonte.largura - w, cx - w / 2));
  const y = Math.max(0, Math.min(fonte.altura - h, cy - h * 0.42));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// ─────────────────────────────── montagem resolvida ───────────────────────────────

/** O narrador de uma cena, pronto para desenhar. */
export type NarradorResolvido = {
  /** video: pedaço da gravação; recortado: a pessoa sem fundo (matte). */
  modo: "video" | "recortado";
  /** Onde aparece, em pixels do quadro de saída. */
  caixa: Retangulo;
  /** Que pedaço da fonte mostrar (pixels da fonte do modo). */
  recorte: Retangulo;
  moldura: "nenhuma" | "canto" | "foto";
  rotacao: number;
  /** Centro do rosto dentro da caixa (0 a 1): origem do zoom. */
  origemDoZoom: { x: number; y: number };
};

export type MidiaResolvida = {
  url: string;
  tipo: "imagem" | "video";
  caixa: Retangulo;
  rotacao: number;
  /** papel: foto impressa com fita (colagem); limpa: janela reta de cantos arredondados (impacto e sóbrio). */
  moldura: "papel" | "nenhuma" | "limpa";
  /**
   * Segundo do vídeo gerado em que esta cena começa. A mesma cena gerada em
   * cenas seguidas (B-roll cheio e depois no canto) CONTINUA de onde parou,
   * em vez de recomeçar do primeiro quadro. Ausente ou 0: do começo.
   */
  inicioNoVideo?: number;
};

/**
 * Como o elemento deixa o quadro. Reprovação de 29/09: tudo entrava e nada
 * saía, a cena congelava até o corte seco. `fica` é o carimbo, que assenta e
 * vai embora com o corte.
 */
export type SaidaDoElemento = "cair" | "encolher" | "deslizar" | "fica";

export type ElementoResolvido = {
  tipo: TipoDeElemento;
  caixa: Retangulo;
  /** Segundo em que entra (junto da palavra âncora). */
  inicio: number;
  /**
   * Segundo em que COMEÇA a sair (a animação de saída dura uns 8 quadros).
   * Texto falado sai 0,4 s depois da última palavra dele e devolve a legenda;
   * o resto sai pouco antes do fim da cena.
   */
  fim: number;
  saida: SaidaDoElemento;
  /**
   * As palavras faladas que o texto mostra, com o tempo de cada uma, para o
   * marca-texto grifar e a tarja digitar JUNTO da voz (antes o grifo varria a
   * linha em 12 quadros e parava, 3 s antes da fala).
   */
  palavras?: { texto: string; inicio: number; fim: number }[];
  rotacao: number;
  texto?: string;
  url?: string;
  entrada?: EntradaDoRecorte;
  valor?: number;
  prefixo?: string;
  sufixo?: string;
  rotulo?: string;
  titulo?: string;
  itens?: { rotulo: string; valor: number; texto: string }[];
  /** Semente para o que é "aleatório" (letras, rasgos): o mesmo plano sai igual. */
  semente: number;
  /** Ícone pop (impacto): qual desenhar. */
  nome?: IconePop;
  /** Número (sóbrio): a fonte dita na fala. */
  fonte?: string;
  /** Selo do consórcio (02/10): com o círculo de check (marca) ou sem (rótulo da frase dita). */
  check?: boolean;
  /** Comentário respondido (02/10): o @ de quem comentou, só quando foi dito. */
  autor?: string;
  /** "faixa" (03/10): a frase sobre a gravação, numa faixa semitransparente no terço de baixo. */
  visual?: "faixa";
};

export type CenaResolvida = {
  inicio: number;
  fim: number;
  layout: Layout;
  movimento: Movimento;
  /** Segundo da palavra forte: onde o punch bate e o zoom lento começa. */
  movimentoEm: number;
  /** O enquadramento da cena (03/10, ver CenaDoPlano.zoom): o worker recorta a base nele. */
  zoom?: number;
  /**
   * Para onde a câmera da cena aponta, em pixels do quadro: o centro do rosto
   * quando há narrador, o da mídia quando não há. O punch e o zoom mexem a
   * cena INTEIRA (colagem, recortes, título) em volta deste ponto.
   */
  foco: { x: number; y: number };
  transicao: Transicao;
  fundo: Fundo;
  narrador: NarradorResolvido | null;
  midia: MidiaResolvida | null;
  elementos: ElementoResolvido[];
  legenda: { x: number; y: number; largura: number };
  /**
   * A pessoa em tela cheia, em vídeo, para quando o recorte da cena
   * recortada falhar (01/10): o worker e o Remotion trocam por ela em vez de
   * deixar a cena só com o fundo.
   */
  reserva?: NarradorResolvido;
  /**
   * Cena em tela compartilhada no completo (01/10): o zoom do movimento vai à
   * `regiao` (pixels do quadro) e chega a `zoom` (até 1,8), em vez dos 10 a
   * 12% em volta do rosto. `webcam` (pixels) é colada de volta do quadro
   * original depois do zoom, para o rosto não sumir. Quem desenha é o ffmpeg
   * da base (worker/src/montagem-do-completo.mjs); o Remotion ignora o campo.
   */
  tela?: {
    regiao: Retangulo;
    zoom: number;
    webcam?: Retangulo | null;
    /**
     * zoom: a tela inteira amplia até a região (como até 01/10); popup: a
     * tela fica e o TRECHO salta para a frente, ampliado num cartão com borda
     * e sombra, sobre o resto escurecido (01/10, "popup que amplia um trecho
     * da tela para ler melhor").
     */
    modo?: "zoom" | "popup";
    /** A cor do contorno de destaque em volta da região (o acento da marca). */
    destaque?: string | null;
  } | null;
};

export type PaginaDaLegenda = {
  inicio: number;
  fim: number;
  palavras: { texto: string; inicio: number; fim: number }[];
  /** Escondida porque um marca-texto ou tarja já mostra as mesmas palavras. */
  oculta?: boolean;
};

/**
 * O que vai ao worker. Tipo espelhado em worker/remotion/src/tipos.ts (o
 * worker não enxerga lib/); mudou aqui, muda lá.
 */
export type MontagemResolvida = {
  versao: 1;
  largura: number;
  altura: number;
  fps: number;
  duracao: number;
  marca: { acento: string; escuro: string; claro: string; logoUrl: string | null };
  familia: "colagem" | "impacto" | "sobrio";
  /** Textura de papel gerada (reaproveitada entre vídeos), ou null para a de código. */
  papelUrl: string | null;
  /** A fonte do narrador (a gravação limpa no tempo do corte) e o recorte da pessoa. */
  fonte: { largura: number; altura: number };
  pessoaNaFonte: Retangulo;
  legenda: { estilo: EstiloDaLegenda; paginas: PaginaDaLegenda[] };
  cenas: CenaResolvida[];
  /**
   * A linguagem do catálogo e o kit da bíblia (01/10): o Remotion desenha a
   * entrada pelos lados, a tipografia do keynote e a lousa por aqui. Worker
   * antigo ignora o campo e desenha pela família.
   */
  estilo?: { id: string; kit: string; entradaLateral: boolean } | null;
  /** O sound design (01/10, lib/media/sons-da-montagem.ts): o worker sintetiza e mistura. */
  sons?: EventoDeSom[];
};

export type ContextoDaResolucao = {
  /** A linguagem do catálogo (01/10): sem ela, sem estilo nem sons na montagem. */
  estiloId?: string | null;
  palavras: PalavraNoCorte[];
  duracao: number;
  fps?: number;
  /** Dimensões da gravação do narrador (a fonte que o worker entrega ao Remotion). */
  fonte: { largura: number; altura: number };
  /** Rosto e pessoa em fração da fonte (quadro-da-capa e enquadramento). */
  rosto: Retangulo;
  pessoa: Retangulo;
  marca: { acento: string; escuro: string; claro: string; logoUrl?: string | null };
  familia: "colagem" | "impacto" | "sobrio";
  /** URL pública de cada asset gerado; asset sem URL é tratado como ausente. */
  urls: Record<string, { url: string; tipo: "imagem" | "video" }>;
  papelUrl?: string | null;
  palavrasPorPagina?: number;
  /**
   * A legenda que o cliente escolheu, já decidida (30/09): sem legenda, um
   * estilo fixo, ou a automática (a da família, como sempre foi). Sem isto,
   * vale a automática.
   */
  legenda?: LegendaDecidida;
};

/** A caixa da pessoa em pixels PARES da fonte: é o tamanho do vídeo recortado que o worker gera. */
export function pessoaEmPixels(fonte: { largura: number; altura: number }, pessoa: Retangulo): Retangulo {
  const par = (v: number) => Math.max(2, Math.floor(v / 2) * 2);
  const x = par(pessoa.x * fonte.largura);
  const y = par(pessoa.y * fonte.altura);
  return { x, y, w: Math.min(par(pessoa.w * fonte.largura), fonte.largura - x), h: Math.min(par(pessoa.h * fonte.altura), fonte.altura - y) };
}

/** Páginas de legenda: poucas palavras por vez, quebrando na pontuação e na pausa. */
export function paginasDaLegenda(palavras: PalavraNoCorte[], porPagina = 3): PaginaDaLegenda[] {
  const paginas: PaginaDaLegenda[] = [];
  let atual: PalavraNoCorte[] = [];
  const fechar = () => {
    if (!atual.length) return;
    paginas.push({ inicio: atual[0].inicio, fim: atual[atual.length - 1].fim, palavras: atual.map((p) => ({ texto: p.texto, inicio: p.inicio, fim: p.fim })) });
    atual = [];
  };
  palavras.forEach((p, i) => {
    const anterior = palavras[i - 1];
    if (atual.length && anterior && p.inicio - anterior.fim > 0.6) fechar();
    atual.push(p);
    if (atual.length >= porPagina || /[.,!?;:]$/.test(p.texto)) fechar();
  });
  fechar();
  // A página fica na tela até a próxima começar (sem piscar entre palavras),
  // mas some numa pausa longa.
  for (let i = 0; i < paginas.length - 1; i++) {
    const gap = paginas[i + 1].inicio - paginas[i].fim;
    paginas[i].fim = gap < 0.8 ? paginas[i + 1].inicio : paginas[i].fim + 0.3;
  }
  return paginas;
}

function semente(...xs: number[]): number {
  let h = 2166136261;
  for (const x of xs) h = Math.imul(h ^ Math.round(x * 1000), 16777619) >>> 0;
  return h;
}

const ESCALA_DO_MOVIMENTO: Record<Movimento, number> = { estatico: 1, "zoom-in-lento": 1.1, "zoom-out": 1.1, punch: 1.14 };

/**
 * O plano validado vira geometria e tempo. Nada aqui chama IA: o mesmo plano
 * com as mesmas URLs sai sempre igual, o que permite refazer só o render.
 */
export function resolverMontagem(plano: PlanoDeMontagem, ctx: ContextoDaResolucao): { montagem: MontagemResolvida; avisos: string[] } {
  const avisos: string[] = [];
  const { largura: W, altura: H } = dimensoesDoFormato(plano.formato);
  const geo = GEOMETRIA[plano.formato];
  const pessoaPx = pessoaEmPixels(ctx.fonte, ctx.pessoa);
  const rostoPx: Retangulo = {
    x: ctx.rosto.x * ctx.fonte.largura,
    y: ctx.rosto.y * ctx.fonte.altura,
    w: ctx.rosto.w * ctx.fonte.largura,
    h: ctx.rosto.h * ctx.fonte.altura,
  };

  // Fora da colagem nada entra torto: foto colada girada, recorte inclinado e
  // título de revista torto são a linguagem do papel (30/09). Hormozi e BBC
  // são retos; o que mexe no impacto é a câmera, não o ângulo das peças.
  const reto = ctx.familia !== "colagem";
  // A LEGENDA NO MEIO DO QUADRO (02/10, consórcio): nos 18 Reels do nicho que
  // mais renderam, a legenda fica entre 55% e 78% da altura, nunca no rodapé.
  // No narrador cheio vertical ela sobe para 66%, abaixo do rosto.
  const legendaNoMeio = plano.formato === "9:16" && !!ctx.estiloId && bibliaDoEstilo(ctx.estiloId).kitFuturo === "consorcio";
  const yDaLegenda = (l: Layout, y: number) => (legendaNoMeio && l === "narrador-cheio" ? 0.66 : y);
  const cenas: CenaResolvida[] = plano.cenas.map((c, indice) => {
    const { inicio, fim } = intervaloDaCena(c, ctx.palavras, ctx.duracao);
    const g = geo[c.layout];
    let layout = c.layout;

    // ── mídia ──
    let midia: MidiaResolvida | null = null;
    // O PIP sem asset (01/10) fica PIP: os dois terços livres são do fundo e dos elementos.
    if (g.midia && !(c.layout === "pip-terco" && !c.asset)) {
      const a = c.asset ? ctx.urls[c.asset] : undefined;
      if (a) {
        midia = {
          url: a.url,
          tipo: a.tipo,
          caixa: px(g.midia, W, H),
          rotacao: reto ? 0 : g.rotacaoMidia,
          // Na colagem o canto é foto impressa com fita; nas outras, uma janela limpa.
          moldura: c.layout === "narrador-canto" || c.layout === "pip-terco" ? (reto ? "limpa" : "papel") : "nenhuma",
        };
      } else {
        avisos.push(`cena ${indice + 1}: asset ${c.asset ?? "(nenhum)"} sem URL; ${c.layout === "pip-terco" ? "o PIP fica sem a imagem" : "virou narrador-cheio"}`);
        if (c.layout !== "pip-terco") layout = "narrador-cheio";
      }
    }
    // O NARRADOR CHEIO VERTICAL SEM ELEMENTO ocupa o quadro inteiro (02/10):
    // a faixa livre de 20% no topo existe para os elementos (30/09); sem
    // nenhum, ela era uma tarja na cor da marca vazia em cima da pessoa, e a
    // revisão visual do corte a leu como "faixa laranja vazia".
    // A faixa sobre a gravação (03/10) também quer a pessoa no quadro inteiro.
    const soFaixaSobreVideo = c.elementos.length > 0 && c.elementos.every((e) => e.tipo === "marca-texto" && e.visual === "faixa");
    const semFaixa = layout === "narrador-cheio" && plano.formato === "9:16" && (!c.elementos.length || soFaixaSobreVideo);
    const gl = semFaixa ? { ...geo[layout], narrador: { x: 0, y: 0, w: 1, h: 1 }, rostoNaCaixa: 0.16 } : geo[layout];

    // ── narrador ──
    let narrador: NarradorResolvido | null = null;
    let rostoNaTela: Retangulo | null = null;
    if (gl.narrador) {
      const caixa = px(gl.narrador, W, H);
      if (layout === "narrador-recortado") {
        // A pessoa inteira (caixa do enquadramento), apoiada na base do quadro.
        const escala = caixa.h / pessoaPx.h;
        const w = pessoaPx.w * escala;
        const cxRosto = (rostoPx.x + rostoPx.w / 2 - pessoaPx.x) * escala;
        const x = Math.max(caixa.x + caixa.w - w, Math.min(caixa.x, caixa.x + caixa.w / 2 - cxRosto));
        const destino = { x: Math.round(x), y: caixa.y, w: Math.round(w), h: caixa.h };
        narrador = {
          modo: "recortado",
          caixa: destino,
          recorte: { x: 0, y: 0, w: pessoaPx.w, h: pessoaPx.h },
          moldura: "nenhuma",
          rotacao: 0,
          origemDoZoom: { x: (cxRosto) / w, y: ((rostoPx.y + rostoPx.h / 2 - pessoaPx.y) * escala) / caixa.h },
        };
        rostoNaTela = {
          x: destino.x + (rostoPx.x - pessoaPx.x) * escala,
          y: destino.y + (rostoPx.y - pessoaPx.y) * escala,
          w: rostoPx.w * escala,
          h: rostoPx.h * escala,
        };
      } else {
        const recorte = recorteAoRedorDoRosto(ctx.fonte, ctx.rosto, caixa.w / caixa.h, gl.rostoNaCaixa);
        const escala = caixa.w / recorte.w;
        rostoNaTela = {
          x: caixa.x + (rostoPx.x - recorte.x) * escala,
          y: caixa.y + (rostoPx.y - recorte.y) * escala,
          w: rostoPx.w * escala,
          h: rostoPx.h * escala,
        };
        narrador = {
          modo: "video",
          caixa,
          recorte,
          moldura: gl.moldura,
          rotacao: reto ? 0 : gl.rotacaoNarrador,
          origemDoZoom: {
            x: (rostoNaTela.x + rostoNaTela.w / 2 - caixa.x) / caixa.w,
            y: (rostoNaTela.y + rostoNaTela.h / 2 - caixa.y) / caixa.h,
          },
        };
      }
    }

    // A RESERVA DA PESSOA (01/10): o narrador cheio em vídeo, a mesma conta do
    // layout narrador-cheio. Vai junto da cena recortada para o worker e o
    // Remotion trocarem quando o recorte da pessoa falhar (sem máscara, ou no
    // completo, que não compõe recortado): antes a cena saía só com o fundo
    // e a legenda (prova do MrBeast de 01/10, três quadros laranja vazios).
    const reservaCheia = (): NarradorResolvido => {
      // No vertical, a reserva ocupa o QUADRO INTEIRO (02/10): com a faixa de
      // cima dos elementos, a pessoa reserva deixava uma tarja de cor vazia.
      const gc = plano.formato === "9:16" ? { ...geo["narrador-cheio"], narrador: { x: 0, y: 0, w: 1, h: 1 }, rostoNaCaixa: 0.16 } : geo["narrador-cheio"];
      const caixa = px(gc.narrador!, W, H);
      const recorte = recorteAoRedorDoRosto(ctx.fonte, ctx.rosto, caixa.w / caixa.h, gc.rostoNaCaixa);
      const escala = caixa.w / recorte.w;
      const r = { x: caixa.x + (rostoPx.x - recorte.x) * escala, y: caixa.y + (rostoPx.y - recorte.y) * escala, w: rostoPx.w * escala, h: rostoPx.h * escala };
      return { modo: "video", caixa, recorte, moldura: "nenhuma", rotacao: 0, origemDoZoom: { x: (r.x + r.w / 2 - caixa.x) / caixa.w, y: (r.y + r.h / 2 - caixa.y) / caixa.h } };
    };
    const reserva = narrador?.modo === "recortado" ? reservaCheia() : undefined;

    // ── legenda ──
    const legenda = { x: Math.round(gl.legenda.x * W), y: Math.round(yDaLegenda(layout, gl.legenda.y) * H), largura: Math.round(gl.legenda.w * W) };
    const alturaDaLegenda = plano.formato === "9:16" ? 190 : 130;
    const caixaDaLegenda: Retangulo = { x: legenda.x - legenda.largura / 2, y: legenda.y - alturaDaLegenda / 2, w: legenda.largura, h: alturaDaLegenda };

    // ── o que é proibido cobrir ──
    // O rosto cresce com o zoom da cena, então a folga acompanha o movimento.
    const proibidas: Retangulo[] = [caixaDaLegenda];
    if (rostoNaTela && narrador) {
      const z = Math.max(ESCALA_DO_MOVIMENTO[c.movimento], c.zoom ?? 1);
      const ox = narrador.caixa.x + narrador.origemDoZoom.x * narrador.caixa.w;
      const oy = narrador.caixa.y + narrador.origemDoZoom.y * narrador.caixa.h;
      const crescido: Retangulo = {
        x: ox + (rostoNaTela.x - ox) * z,
        y: oy + (rostoNaTela.y - oy) * z,
        w: rostoNaTela.w * z,
        h: rostoNaTela.h * z,
      };
      proibidas.push(folga(crescido, 0.12));
    }
    // A janela do narrador no canto e a foto são intocáveis inteiras.
    if (narrador && (narrador.moldura === "canto" || narrador.moldura === "foto")) proibidas.push(folga(narrador.caixa, 0.02));

    // ── elementos ──
    const ocupadas: { r: Retangulo; de: number; ate: number }[] = [];
    const elementos: ElementoResolvido[] = [];
    // O tempo de cada elemento (entrada pela palavra DITA, escalonada, e a
    // saída) sai antes da geometria; ver `tempoDosElementos`.
    const tempo = tempoDosElementos(c, ctx.palavras, inicio, fim);
    // Os textos largos escolhem lugar primeiro: um recorte pequeno cabe em
    // qualquer canto, uma palavra de 13 letras não (prova de 30/09). Depois
    // os outros textos (marca-texto, carimbo, número), e só então os recortes,
    // que sempre acham um canto livre (29/09: o marca-texto saía da cena
    // porque um recorte tinha pegado a única zona que ele cabia).
    const prioridade = (t: TipoDeElemento) => (ehTexto(t) ? 0 : t === "marca-texto" || t === "carimbo" || t === "numero" || t === "barras" || t === "selo" ? 1 : 2);
    const naOrdem = [...c.elementos].sort((a, b) => prioridade(a.tipo) - prioridade(b.tipo));
    naOrdem.forEach((e, k) => {
      const t = tempo.get(e)!;
      const inicioDoElemento = t.inicio;
      const ordem = [e.zona, ...FUGA.filter((z) => z !== e.zona)];
      // Dois elementos só disputam lugar se estão na tela AO MESMO TEMPO:
      // com entradas escalonadas e saídas, o recorte que entra depois que o
      // marca-texto saiu pode usar o mesmo canto.
      const janela = { de: t.inicio, ate: t.fim + DURACAO_DA_SAIDA };
      const livre = (r: Retangulo) => !proibidas.some((p) => cruza(r, p)) && !ocupadas.some((o) => cruza(r, o.r) && o.de < janela.ate && janela.de < o.ate);
      // Texto em meia zona sai pequeno demais (prova de 30/09: letras de
      // revista de 42 px em "PRODUTIVIDADE"). Tenta primeiro a faixa inteira
      // da mesma altura; se ela bate em algo, fica a meia zona.
      // No impacto a frase de destaque também quer a faixa inteira (caixa alta larga).
      const largo = ehTexto(e.tipo) || (ctx.familia === "impacto" && e.tipo === "marca-texto");
      const candidatas = (z: Zona) => [...(largo && FAIXA_INTEIRA[z] ? [FAIXA_INTEIRA[z]!] : []), zonaDoLayout(z, layout, plano.formato)];
      let caixa: Retangulo | null = null;
      let zonaFinal: Zona = e.zona;
      // A FAIXA SOBRE A GRAVAÇÃO (03/10): lugar fixo no terço de baixo, abaixo
      // da legenda, larga; só cai na busca por zona se bater no rosto.
      if (e.tipo === "marca-texto" && e.visual === "faixa") {
        const r = px(plano.formato === "9:16" ? { x: 0.04, y: 0.815, w: 0.92, h: 0.14 } : { x: 0.04, y: 0.6, w: 0.56, h: 0.18 }, W, H);
        if (livre(r)) caixa = r;
        // A faixa fica abaixo da caixa da legenda (que sobe a 76% no vertical).
        else avisos.push(`cena ${indice + 1}: a faixa sobre a gravação bateu no rosto ou na legenda; foi para a busca por zona`);
      }
      if (caixa) {
        // já posta
      } else if (e.tipo === "letras-revista") {
        // As letras de revista vão para onde saem MAIORES (são o maior
        // elemento do quadro na referência); a zona pedida ganha no quase
        // empate. "CONTEXTO" numa coluna de 0,31 da largura saía espremido.
        let nota = 0;
        for (const z of ordem) {
          // A caixa crescida e, se ela bate em algo, a zona do tamanho normal
          // ("CONTEXTO É REI" saía da cena no narrador cheio, 29/09).
          for (const r of candidatas(z).flatMap((zona) => [caixaDoElemento(e, px(zona, W, H), H, ctx.familia), px(zona, W, H)])) {
            if (!livre(r)) continue;
            const n = tamanhoDasLetras(e.texto, r) * (z === e.zona ? 1.25 : 1);
            if (n > nota) {
              nota = n;
              caixa = r;
              zonaFinal = z;
            }
          }
        }
      } else {
        for (const z of ordem) {
          // A caixa crescida (destaque do impacto) e, se ela bate no rosto ou
          // na legenda, a do tamanho da zona: menor, mas na tela.
          for (const r of candidatas(z).flatMap((zona) => [caixaDoElemento(e, px(zona, W, H), H, ctx.familia), px(zona, W, H)])) {
            if (!livre(r)) continue;
            caixa = r;
            break;
          }
          if (!caixa) continue;
          zonaFinal = z;
          break;
        }
      }
      if (!caixa && (e.tipo === "recorte" || e.tipo === "seta" || e.tipo === "circulo" || e.tipo === "icone-pop")) {
        // MICROPOSIÇÕES (29/09): com até 7 elementos por cena, as 9 zonas
        // não bastam e o que colidia era descartado. O objeto pequeno tenta
        // 3/4 e depois metade do tamanho, nos cantos e no meio de cada zona.
        busca: for (const f of [0.75, 0.55]) {
          for (const z of ordem) {
            const zp = px(zonaDoLayout(z, layout, plano.formato), W, H);
            const inteiro = caixaDoElemento(e, zp, H, ctx.familia);
            const w = Math.round(inteiro.w * f);
            const h = Math.round(inteiro.h * f);
            for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
              const r = { x: Math.round(zp.x + (zp.w - w) * ax), y: Math.round(zp.y + (zp.h - h) * ay), w, h };
              if (!livre(r)) continue;
              caixa = r;
              zonaFinal = z;
              break busca;
            }
          }
        }
      }
      if (caixa && zonaFinal !== e.zona) avisos.push(`cena ${indice + 1}: ${e.tipo} saiu de ${e.zona} para ${zonaFinal} (rosto, legenda, narrador ou tamanho)`);
      if (!caixa) {
        avisos.push(`cena ${indice + 1}: ${e.tipo} não coube sem cobrir o rosto; saiu`);
        return;
      }
      ocupadas.push({ r: caixa, ...janela });
      const base: ElementoResolvido = {
        tipo: e.tipo,
        caixa,
        inicio: inicioDoElemento,
        fim: t.fim,
        saida: t.saida,
        ...(t.palavras ? { palavras: t.palavras } : {}),
        rotacao: reto ? 0 : ((semente(indice, k) % 9) - 4) * (e.tipo === "carimbo" ? 2 : 1),
        semente: semente(indice, k, e.palavra),
      };
      if (e.tipo === "recorte") {
        const a = ctx.urls[e.asset];
        if (!a) {
          avisos.push(`cena ${indice + 1}: recorte ${e.asset} sem URL; saiu`);
          ocupadas.pop();
          return;
        }
        // Ícone de marca (logo) estoura no lugar e fica quase reto: logo
        // girado e caindo lê como descaso com a marca dos outros.
        const icone = plano.assets.find((x) => x.id === e.asset)?.tipo === "icone";
        elementos.push({ ...base, url: a.url, entrada: icone ? "pop" : e.entrada, ...(icone ? { rotacao: ((semente(indice, k) % 5) - 2) * 0.5 } : {}) });
      } else if (e.tipo === "numero") {
        elementos.push({ ...base, valor: e.valor, prefixo: e.prefixo, sufixo: e.sufixo, rotulo: e.rotulo, ...(e.fonte ? { fonte: e.fonte } : {}) });
      } else if (e.tipo === "icone-pop") {
        elementos.push({ ...base, nome: e.nome });
      } else if (e.tipo === "tarja") {
        elementos.push({ ...base, texto: e.texto, rotacao: 0, ...(e.rotulo ? { rotulo: e.rotulo } : {}) });
      } else if (e.tipo === "barras") {
        elementos.push({ ...base, titulo: e.titulo, itens: e.itens, rotacao: 0 });
      } else if (e.tipo === "seta" || e.tipo === "circulo") {
        elementos.push(base);
      } else if (e.tipo === "selo") {
        elementos.push({ ...base, texto: e.texto, check: e.check, rotacao: 0 });
      } else if (e.tipo === "comentario") {
        elementos.push({ ...base, texto: e.texto, rotacao: 0, ...(e.autor ? { autor: e.autor } : {}) });
      } else {
        elementos.push({ ...base, texto: e.texto, ...(e.tipo === "marca-texto" && e.visual === "faixa" ? { visual: "faixa" as const, rotacao: 0 } : {}) });
      }
    });

    // Elementos na ordem de entrada: quem desenha e quem confere lê em ordem.
    elementos.sort((a, b) => a.inicio - b.inicio);
    // CENA SEM A PESSOA E SEM MÍDIA (a cartela) não começa vazia (02/10): o
    // primeiro elemento entra junto com a cena. Antes ele esperava a palavra
    // dele ser dita, e o começo da cartela era a tela de uma cor só (o
    // completo cmuqc9r7z tinha 0,7 s de laranja puro antes de "PROSPERIDADE").
    if (!narrador && !midia && elementos.length && elementos[0].inicio > inicio) elementos[0].inicio = inicio;
    // Com a faixa do topo (narrador cheio vertical com elemento), o primeiro
    // elemento também entra com a cena: a faixa nunca fica vazia.
    if (layout === "narrador-cheio" && plano.formato === "9:16" && narrador && narrador.caixa.y > 0 && elementos.length && elementos[0].inicio > inicio) elementos[0].inicio = inicio;
    // A CARTELA DE UM TEXTO SÓ ocupa o meio do quadro (02/10): na zona do
    // topo, a frase saía miúda num mar de cor da marca, e a revisão visual a
    // leu como tela vazia. O texto é a cena inteira: área segura central.
    // Com dois ou três textos (PROSPERIDADE, ABUNDÂNCIA), eles se empilham
    // na mesma área. E na cartela nenhum texto SAI antes do corte (prova do
    // corte de 02/10: "PLATAFORMA" encolhia e sumia 1,5 s antes do fim, e
    // sobrava a tela laranja vazia).
    const textosDaCartela = layout === "cartela" ? elementos.filter((e) => ["marca-texto", "letras-revista", "tarja", "titulo", "carimbo", "faixa", "comentario"].includes(e.tipo)) : [];
    if (textosDaCartela.length >= 1 && textosDaCartela.length <= 3 && textosDaCartela.length === elementos.length) {
      const vertical = H > W;
      const area = vertical
        ? { x: Math.round(W * 0.07), y: Math.round(H * 0.27), w: Math.round(W * 0.86), h: Math.round(H * 0.38) }
        : { x: Math.round(W * 0.08), y: Math.round(H * 0.2), w: Math.round(W * 0.84), h: Math.round(H * 0.5) };
      const n = textosDaCartela.length;
      textosDaCartela.forEach((e, k) => {
        e.caixa = { x: area.x, y: Math.round(area.y + (area.h / n) * k), w: area.w, h: Math.round(area.h / n) };
      });
    }
    if (layout === "cartela") {
      for (const e of elementos) {
        e.fim = fim;
        e.saida = "fica";
      }
    }
    // Na ÚLTIMA cena não há corte depois: o que não é fala fica até o fim do
    // vídeo (29/09: "CONTEXTO É REI" entrava e saía em 0,7 s no fecho).
    if (indice === plano.cenas.length - 1) {
      for (const el of elementos) {
        if (el.tipo === "marca-texto" || el.tipo === "tarja") continue;
        el.fim = fim;
        el.saida = "fica";
      }
    }

    // ── câmera ──
    // Com mídia na tela (canto, tela dividida, B-roll) a câmera aponta para
    // o meio do quadro: apontada para o rosto lá embaixo, o zoom empurrava a
    // colagem e os títulos do topo para fora do quadro (prévia de 29/09).
    const foco =
      rostoNaTela && !midia
        ? { x: Math.round(rostoNaTela.x + rostoNaTela.w / 2), y: Math.round(rostoNaTela.y + rostoNaTela.h / 2) }
        : { x: Math.round(W / 2), y: Math.round(H / 2) };
    const movimentoEm = palavraForte(c, ctx.palavras, elementos, inicio, fim);

    // NENHUMA CENA SÓ COM FUNDO E LEGENDA (01/10): cena sem a pessoa e sem
    // mídia precisa de um elemento principal; se ele não coube (ou nunca
    // veio), a cena volta para a pessoa em tela cheia.
    if (!narrador && !midia && !elementos.length) {
      avisos.push(`cena ${indice + 1}: ${layout} ficaria só com fundo e legenda; voltou para a pessoa`);
      const cheio = reservaCheia();
      const gc = geo["narrador-cheio"];
      return {
        inicio, fim, layout: "narrador-cheio" as Layout, movimento: c.movimento, movimentoEm,
        foco: { x: Math.round(cheio.caixa.x + cheio.origemDoZoom.x * cheio.caixa.w), y: Math.round(cheio.caixa.y + cheio.origemDoZoom.y * cheio.caixa.h) },
        transicao: indice === 0 ? "corte" : c.transicao, fundo: c.fundo, narrador: cheio, midia: null, elementos,
        legenda: { x: Math.round(gc.legenda.x * W), y: Math.round(yDaLegenda("narrador-cheio", gc.legenda.y) * H), largura: Math.round(gc.legenda.w * W) },
      };
    }

    return { inicio, fim, layout, movimento: c.movimento, movimentoEm, ...(c.zoom && c.zoom > 1.01 ? { zoom: c.zoom } : {}), foco, transicao: indice === 0 ? "corte" : c.transicao, fundo: c.fundo, narrador, midia, elementos, legenda, ...(reserva ? { reserva } : {}) };
  });

  // A mesma cena gerada em cenas seguidas continua de onde parou (o B-roll
  // cheio vira canto e o vídeo não volta ao primeiro quadro).
  for (let i = 1; i < cenas.length; i++) {
    const antes = cenas[i - 1].midia;
    const agora = cenas[i].midia;
    if (agora?.tipo === "video" && antes?.tipo === "video" && antes.url === agora.url) {
      agora.inicioNoVideo = +((antes.inicioNoVideo ?? 0) + (cenas[i - 1].fim - cenas[i - 1].inicio)).toFixed(3);
    }
  }

  return {
    montagem: {
      versao: 1,
      largura: W,
      altura: H,
      fps: ctx.fps ?? 30,
      duracao: ctx.duracao,
      marca: { acento: ctx.marca.acento, escuro: ctx.marca.escuro, claro: ctx.marca.claro, logoUrl: ctx.marca.logoUrl ?? null },
      familia: ctx.familia,
      papelUrl: ctx.papelUrl ?? null,
      fonte: ctx.fonte,
      pessoaNaFonte: pessoaPx,
      // Por família (30/09): o impacto é palavra a palavra, grande (2 por
      // página); o sóbrio é a frase de telejornal, limpa (5 a 7 por página).
      // A escolha do cliente manda por cima (30/09): "sem" sai sem nenhuma
      // página (o Remotion e o ASS do completo não desenham nada), e o estilo
      // fixo troca o desenho e o tamanho da página.
      legenda: legendaDaMontagem(plano, ctx, cenas),
      cenas,
      ...estiloDaMontagem(ctx.estiloId, cenas, ctx.duracao),
    },
    avisos,
  };
}

/** O estilo e os sons da montagem (01/10), quando quem chama diz a linguagem. */
export function estiloDaMontagem(estiloId: string | null | undefined, cenas: CenaResolvida[], duracao: number): Pick<MontagemResolvida, "estilo" | "sons"> {
  if (!estiloId) return {};
  const b = bibliaDoEstilo(estiloId);
  // Entrada pelos lados (o vídeo de referência do Bruno: elementos entrando
  // pelos lados para preencher a tela) nos kits limpos, onde o estouro do
  // impacto e a queda do papel não são a linguagem.
  const entradaLateral = b.kitFuturo === "keynote" || b.kitFuturo === "lousa";
  return { estilo: { id: b.id, kit: b.kitFuturo, entradaLateral }, sons: sonsDaMontagem(cenas, estiloId, duracao) };
}

/** O estilo fixo do cliente virando o desenho do Remotion. */
const DESENHO_DO_ESTILO: Record<EstiloDeLegenda, EstiloDaLegenda> = {
  palavra: "destaque",
  caixa: "caixa",
  "marca-texto": "marca-texto",
  papel: "papel",
  limpa: "limpa",
};

/** Palavras por página de cada estilo fixo: [vertical, deitado]. */
const PAGINA_DO_ESTILO: Record<EstiloDeLegenda, [number, number]> = {
  palavra: [2, 3],
  caixa: [4, 6],
  "marca-texto": [3, 5],
  papel: [4, 3],
  limpa: [5, 7],
};

/** A legenda da montagem com a escolha do cliente aplicada (ver ContextoDaResolucao.legenda). */
export function legendaDaMontagem(plano: PlanoDeMontagem, ctx: ContextoDaResolucao, cenas: CenaResolvida[]): MontagemResolvida["legenda"] {
  const d = ctx.legenda;
  if (d && !d.mostrar) return { estilo: plano.legenda.estilo, paginas: [] };
  const fixo = d && d.mostrar && !d.automatica ? d.estilo : null;
  const estilo = fixo ? DESENHO_DO_ESTILO[fixo] : plano.legenda.estilo;
  const porPagina = fixo
    ? PAGINA_DO_ESTILO[fixo][plano.formato === "9:16" ? 0 : 1]
    : ctx.palavrasPorPagina ?? (ctx.estiloId && bibliaDoEstilo(ctx.estiloId).kitFuturo === "consorcio" ? 3 : palavrasPorPaginaDaFamilia(ctx.familia, plano.formato));
  return { estilo, paginas: semLegendaRepetida(paginasDaLegenda(ctx.palavras, porPagina), cenas) };
}

/** Quantas palavras por página de legenda, pela linguagem e pelo formato. */
export function palavrasPorPaginaDaFamilia(familia: Familia, formato: Formato): number {
  if (familia === "impacto") return formato === "9:16" ? 2 : 3;
  if (familia === "sobrio") return formato === "9:16" ? 5 : 7;
  // Quatro palavras por página no vertical: com três, a caixa trocava 38
  // vezes em 37 s e a legenda piscava mais do que se lia (29/09).
  return formato === "9:16" ? 4 : 3;
}

/**
 * A LEGENDA NÃO REPETE O MARCA-TEXTO (pedido de 30/09, olhando a prova):
 * "construí duas empresas" aparecia duas vezes na tela, na legenda e no
 * marca-texto. Enquanto um marca-texto ou tarja de fala está visível, a página
 * de legenda cujas palavras ele já mostra (metade ou mais) some, como na Vox:
 * a frase-chave grifada substitui a legenda naquele instante.
 *
 * E a legenda VOLTA quando o texto sai (29/09): a janela é a do elemento
 * (entrada até o fim da saída), não a da cena inteira.
 */
export function semLegendaRepetida(paginas: PaginaDaLegenda[], cenas: CenaResolvida[]): PaginaDaLegenda[] {
  const textos = cenas.flatMap((c) =>
    c.elementos
      .filter((e) => (e.tipo === "marca-texto" || e.tipo === "tarja" || e.tipo === "letras-revista" || e.tipo === "titulo" || e.tipo === "faixa" || e.tipo === "comentario") && e.texto)
      .map((e) => ({ de: e.inicio, ate: Math.min(c.fim, (e.fim ?? c.fim) + DURACAO_DA_SAIDA), palavras: new Set(palavrasDoTexto(e.texto ?? "")) }))
  );
  return paginas.map((p) => {
    const ps = p.palavras.map((w) => normalizarPalavra(w.texto)).filter(Boolean);
    const repetida = textos.some((t) => p.fim > t.de && p.inicio < t.ate && ps.filter((w) => t.palavras.has(w)).length * 2 >= ps.length);
    return repetida ? { ...p, oculta: true } : p;
  });
}

/** O tamanho de cada elemento dentro da zona: texto ocupa a faixa, recorte é quadrado. */
/**
 * O tamanho de letra que as letras de revista alcançam numa caixa: a mesma
 * conta de `linhasDaRevista` no Remotion (por palavra, ou a palavra longa
 * partida em duas ou três linhas; cada letra perto de 1 em de largura).
 * Serve só para escolher a zona onde elas saem maiores.
 */
export function tamanhoDasLetras(texto: string, caixa: Retangulo): number {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const semEspaco = palavras.join("");
  const opcoes: number[][] = [palavras.map((p) => p.length)];
  // Várias palavras não se partem: por palavra ou em duas linhas de palavras.
  if (palavras.length > 2) {
    const total = palavras.join(" ").length;
    let a = 0;
    let i = 0;
    while (i < palavras.length - 1 && a + palavras[i].length <= total / 2) a += palavras[i++].length + 1;
    const um = palavras.slice(0, Math.max(1, i)).join(" ").length;
    opcoes.push([um, total - um - 1]);
  }
  for (const n of palavras.length > 1 ? [] : [2, 3]) {
    if (semEspaco.length < n * 3) continue;
    const passo = Math.ceil(semEspaco.length / n);
    const linhas: number[] = [];
    for (let i = 0; i < semEspaco.length; i += passo) linhas.push(Math.min(passo, semEspaco.length - i));
    opcoes.push(linhas);
  }
  return Math.max(...opcoes.map((l) => Math.min((caixa.h * 0.9) / (l.length * 1.18), caixa.w / (Math.max(...l) * 1.0))));
}

function caixaDoElemento(e: ElementoDoPlano, zona: Retangulo, alturaDoQuadro = Infinity, familia: Familia = "colagem"): Retangulo {
  const centro = (w: number, h: number): Retangulo => ({ x: Math.round(zona.x + (zona.w - w) / 2), y: Math.round(zona.y + (zona.h - h) / 2), w: Math.round(w), h: Math.round(h) });
  const lado = Math.min(zona.w, zona.h);
  switch (e.tipo) {
    case "recorte": {
      // Maiores que na primeira prova (29/09: o relógio saía com 70 px no
      // mosaico); o "g" é um objeto que disputa o quadro com o narrador.
      const f = e.tamanho === "p" ? 0.8 : e.tamanho === "g" ? 1.4 : 1.05;
      const s = Math.min(lado * f, zona.w);
      return centro(s, Math.min(s, zona.h * 1.1));
    }
    case "seta":
    case "circulo":
      return centro(lado * 0.8, lado * 0.8);
    case "icone-pop": {
      // Do tamanho de um recorte médio: o ícone pop é sinal, não protagonista.
      const s = Math.min(lado * 1.05, zona.w);
      return centro(s, Math.min(s, zona.h * 1.1));
    }
    case "carimbo":
      return centro(Math.min(zona.w, lado * 2.2), Math.min(zona.h, lado * 0.8));
    case "faixa": {
      // A faixa rasgada do valor (02/10): larga e baixa, um pouco maior que a
      // zona (é a prova do vídeo), sem sair do quadro.
      const h = Math.round(zona.h * 1.15);
      return { ...zona, y: Math.min(zona.y, Math.round(alturaDoQuadro * 0.985) - h), h };
    }
    case "selo": {
      // O rótulo branco arredondado: uma pílula baixa, do tamanho do texto.
      const h = Math.round(Math.min(zona.h, Number.isFinite(alturaDoQuadro) ? alturaDoQuadro * 0.058 : zona.h * 0.6));
      return centro(Math.min(zona.w, zona.w * 0.92), h);
    }
    case "comentario": {
      // O cartão do comentário: a faixa inteira, alto o bastante para duas linhas.
      const h = Math.round(Number.isFinite(alturaDoQuadro) ? Math.max(zona.h, alturaDoQuadro * 0.15) : zona.h);
      return { ...zona, y: Math.min(zona.y, Math.round(alturaDoQuadro * 0.985) - h), h };
    }
    case "marca-texto":
      // No impacto a frase de destaque é caixa alta grande (Hormozi): na faixa
      // baixa de 0,15 da altura ela saía em três linhas miúdas (prova de
      // 30/09). Cresce como as letras de revista, sem sair do quadro.
      if (familia === "impacto") {
        const h = Math.round(zona.h * 1.5);
        return { ...zona, y: Math.min(zona.y, Math.round(alturaDoQuadro * 0.985) - h), h };
      }
      return { ...zona };
    case "letras-revista": {
      // As letras de revista são o MAIOR elemento do quadro na referência
      // (cada letra perto de 12% da largura); a faixa de 0,17 da altura as
      // espremia em 40 px. A caixa cresce 45% para baixo, e a conferência de
      // rosto e legenda continua valendo sobre a caixa crescida.
      // Perto da base, cresce para cima: a caixa nunca sai do quadro.
      const h = Math.round(zona.h * 1.45);
      const y = Math.min(zona.y, Math.round(alturaDoQuadro * 0.985) - h);
      return { ...zona, y, h };
    }
    default:
      return { ...zona };
  }
}
