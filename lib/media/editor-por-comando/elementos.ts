import { DOLAR_POR_IMAGEM, DOLAR_POR_RECORTE, IMAGEM_DA_EDICAO, dolarDoVideoDaEdicao } from "@/lib/credits/higgsfield-tabela";
import type { VarianteDoElemento } from "@/lib/media/editor-por-comando/linguagem";
import { TIPOS_GERADOS_POR_IA, custoDoElemento, ehPecaGerada } from "@/lib/media/editor-por-comando/elemento-gerado";

/**
 * O TIPO DE ELEMENTO (05/10/2026, noite): o PRIMEIRO EIXO do editor por
 * comando. Livre por momento da fala: o JEV escolhe, para cada frase, o que a
 * tela mostra (pergunta de escolha com o trecho, o comando, o nicho, a marca
 * e o que já entrou perto, para variar). Nenhum tipo é preso a um estilo: a
 * linguagem visual (linguagem.ts) decide só COMO cada tipo é desenhado.
 *
 * O que é regra explícita, aqui, em código (o JEV não decide):
 *   - o mesmo tipo não entra duas vezes seguidas, e nenhum tipo passa de 40%
 *     dos elementos depois dos cinco primeiros;
 *   - a densidade por minuto vem do comando (calmo, médio, rápido);
 *   - o teto de vídeo por minuto e o teto de custo por minuto
 *     (EDITOR_TETO_USD_POR_MINUTO), com o preço da tabela da Higgsfield.
 *
 * Módulo puro (a tela de aprovação usa a mesma estimativa).
 */

export type TipoDeElemento =
  | "texto-atras"
  | "icone"
  | "imagem"
  | "video"
  // A PEÇA COMBINADA (06/10): vídeo de IA ao fundo e a camada exata do Remotion por cima (combinada.ts).
  | "combinada"
  | "dado"
  | "lista"
  | "citacao"
  | "impacto"
  | "legenda-destaque"
  // OS TIPOS DE CONTEXTO (06/10): só entram quando a leitura do vídeo mostra que cabem (leitura-no-plano.ts, `tiposPossiveis`).
  | "nome-de-quem-fala"
  | "realce-de-quem-fala"
  | "zoom-no-ponto"
  | "destaque-na-tela"
  | "cartao-de-passo"
  | "frase-chave"
  | "slide"
  // OS ELEMENTOS GERADOS POR IA (06/10, noite): o visual nasce na Higgsfield, recortado e conferido (elemento-gerado.ts).
  | "icone-com-frase"
  | "comparacao-lado-a-lado"
  | "cartoes-em-linha"
  | "interface-de-edicao"
  | "titulo-em-caixa"
  | "inscrever"
  | "nada";

/**
 * OS ELEMENTOS GERADOS POR IA (06/10, noite, regra do Bruno): entram na lista de sempre, em qualquer linguagem. Eram as
 * "peças vetoriais" desenhadas em código (tarefa D, mesma tarde), que saíram do worker: o visual de cada um é gerado na
 * Higgsfield pelo prompt do redator, recortado e conferido (elemento-gerado.ts); o nome só dá a caixa no quadro.
 */
export const TIPOS_GERADOS: TipoDeElemento[] = [...TIPOS_GERADOS_POR_IA];

/**
 * Os tipos que o JEV escolhe MOMENTO A MOMENTO. O "inscrever" (a chamada de
 * curtir e se inscrever, 05/10 à noite) fica fora desta lista de propósito:
 * ele não disputa com a fala; o JEV escolhe os 2 ou 3 momentos dele à parte
 * (plano-pelo-jev.ts, `decidirInscrever`), só nos vídeos com destino YouTube.
 *
 * Esta é a lista de SEMPRE (o vídeo sem leitura segue igual). Com a leitura
 * do vídeo (06/10), `tiposPossiveis` acrescenta por trecho os tipos de
 * contexto que a câmera permite (TIPOS_DO_CONTEXTO).
 */
export const TIPOS_DE_ELEMENTO: TipoDeElemento[] = ["texto-atras", "icone", "imagem", "video", "combinada", "dado", "lista", "citacao", "impacto", "legenda-destaque", ...TIPOS_GERADOS, "nada"];

/**
 * OS TIPOS DE CONTEXTO (06/10, regra do Bruno: o editor decide pelo contexto
 * do vídeo inteiro e serve a qualquer vídeo, de pastor a médico). Cada um é
 * desenhado na linguagem do comando, nunca condicionado a um estilo; o que
 * decide se ele é oferecido ao JEV é a LEITURA do trecho (duas pessoas, tela,
 * quadro, pessoa nomeada), e quem escolhe por momento é o JEV.
 */
export const TIPOS_DO_CONTEXTO: TipoDeElemento[] = ["nome-de-quem-fala", "realce-de-quem-fala", "zoom-no-ponto", "destaque-na-tela", "cartao-de-passo", "frase-chave", "slide"];

/** Todos os tipos que podem sair de uma onda do JEV (os de sempre e os de contexto), sem "nada" e sem "inscrever". */
export const TIPOS_DECIDIVEIS: Array<Exclude<TipoDeElemento, "nada" | "inscrever">> = [...TIPOS_DE_ELEMENTO, ...TIPOS_DO_CONTEXTO].filter((t): t is Exclude<TipoDeElemento, "nada" | "inscrever"> => t !== "nada" && t !== "inscrever");

/** O que o JEV lê para escolher o tipo de cada momento (pergunta de escolha). */
export const CRITERIO_DO_TIPO: Record<TipoDeElemento, string> = {
  "texto-atras": "TEXTO ATRÁS DA PESSOA: a palavra ou a tese dita com ênfase vira letra gigante atrás da pessoa recortada, com profundidade e luz. Para a ideia central, a tese, a virada.",
  icone: "ÍCONE OU SÍMBOLO ANIMADO pequeno, no canto, acima da cabeça ou ao lado: a fala cita um objeto, um conceito ou um sentimento concreto que um símbolo mostra (dinheiro, tempo, coração, alerta, aprovado).",
  imagem: "IMAGEM INSERIDA (foto, ilustração ou objeto) em janela ou tela cheia: a fala descreve algo que se VÊ e que não precisa de movimento (um objeto, um lugar, um exemplo concreto, uma situação).",
  video: "B-ROLL EM VÍDEO: o momento pede MOVIMENTO, uma ação acontecendo, um lugar com vida, uma cena que a fala narra ou uma metáfora visual em movimento.",
  combinada:
    "VÍDEO GERADO AO FUNDO COM A CAMADA EXATA POR CIMA: a fala cita lugares, uma região, uma expansão ou um caminho (vista aérea que anda, com os pontos acendendo, a linha da rota e as etiquetas com os nomes ditos), ou liga pessoas, fatos e partes de uma história (mural com as etiquetas e o fio ligando). O fundo é cena em movimento; o que precisa ser exato (nome, número, ponto, linha, fio) é desenhado por cima. Para 2 a 5 itens concretos ditos no mesmo momento.",
  dado: "DADO OU NÚMERO ANIMADO: a fala diz um número, uma porcentagem, um valor, um prazo ou compara números.",
  lista: "LISTA OU PASSOS: a fala enumera itens, etapas, fases, sintomas, causas ou datas em sequência.",
  citacao: "CITAÇÃO: a fala repete o que alguém disse, uma frase de autor, um versículo, uma manchete, uma orientação oficial.",
  impacto: "TELA CHEIA DE IMPACTO: a frase mais forte do trecho, a conclusão ou o alerta que merece tirar o rosto da tela por um instante.",
  "legenda-destaque": "LEGENDA DE DESTAQUE: uma palavra ou expressão curta que merece ser grifada sobre a pessoa, sem tirar a atenção dela.",
  "nome-de-quem-fala": "NOME DE QUEM FALA (terço inferior): a pessoa que está falando ganha o nome e o papel dela numa tarja embaixo, perto dela. Para a primeira vez que cada pessoa fala numa conversa, podcast ou entrevista, ou quando a fala se apresenta.",
  "realce-de-quem-fala": "REALCE DE QUEM FALA: com duas ou mais pessoas em cena, quem está falando ganha a luz (a moldura acesa em volta dela), sem escurecer ninguém. Para a troca de turno numa conversa ou debate.",
  "zoom-no-ponto": "ZOOM NO PONTO: a câmera aproxima a região da tela compartilhada ou do quadro que a fala está explicando (um trecho do código, uma célula, um desenho no quadro), com uma moldura na região. Quando a fala diz \"aqui\", \"olha isso\", \"esse ponto\".",
  "destaque-na-tela": "DESTAQUE NA TELA: uma moldura ou realce em volta da região da tela ou do quadro que a fala nomeia, sem aproximar a câmera (o resto continua visível).",
  "cartao-de-passo": "CARTÃO DE PASSO, INGREDIENTE OU LUGAR: um cartão pequeno na área livre com o número do passo e o nome dele, o ingrediente e a quantidade dita, ou o nome do lugar. Para demonstração, receita, tutorial, vlog.",
  "frase-chave": "FRASE-CHAVE: a frase inteira que resume o ponto, escrita num cartão na área livre, enquanto a pessoa segue falando (sem tirar a atenção dela). Para palestra, aula, sermão: a tese dita por extenso.",
  slide: "SLIDE: um slide pequeno ao lado da pessoa com o título do ponto e 2 a 4 itens que a fala percorre (o item dito acende). Para palestra e aula, quando a fala organiza o conteúdo em tópicos.",
  "icone-com-frase":
    "ÍCONE GRANDE COM FRASE (gerado por IA em alta resolução): um cartão com um ícone ou objeto grande e a frase curta embaixo (às vezes com o rótulo \"REGRA 01\"). Para uma regra, um hábito, um conselho ou um item de uma lista dita um de cada vez, quando um objeto ou símbolo concreto mostra a ideia (despertador, celular, TV, dinheiro, livro).",
  "comparacao-lado-a-lado":
    "NÃO DIGA, DIGA ISTO (gerado por IA): duas colunas, o errado marcado em vermelho e o certo na cor da marca. Para a fala que troca uma palavra, uma frase, um hábito ou uma atitude por outra (\"em vez de X, faça Y\", \"pare de dizer X\").",
  "cartoes-em-linha":
    "CARTÕES LADO A LADO (gerados por IA, com o LOGO OFICIAL de cada marca citada): 2 a 4 cartões com o nome e o ícone ou o logo de cada. Para ferramentas, aplicativos, redes sociais, opções, canais ou etapas que a fala cita juntos no mesmo fôlego.",
  "interface-de-edicao":
    "TELA DE UM EDITOR DE VÍDEO (gerada por IA): a linha do tempo com os clipes e a prévia com a legenda. Para a fala sobre edição de vídeo, automação, plataforma, software, ferramenta, produção de conteúdo ou fluxo de trabalho.",
  "titulo-em-caixa":
    "TÍTULO NA CAIXA (gerado por IA): o assunto numa caixa arredondada acima da cabeça (nunca colada no topo do quadro), enquanto a pessoa fala. Para abrir um tema, uma lista ou uma série (\"3 erros de quem começa\", \"hábitos que ninguém te ensina\"), normalmente no começo do vídeo ou de um bloco.",
  inscrever: "CURTIR E INSCREVER: a chamada animada de curtir e se inscrever, logo depois de um momento forte (nunca é escolhida frase a frase; ver decidirInscrever).",
  nada: "NADA: a pessoa sozinha basta (transição, emoção, conversa, frase de ligação, ou um elemento acabou de sair).",
};

/** O nome de cada tipo como o cliente lê (tela de aprovação, relatório). */
export const NOME_DO_TIPO: Record<TipoDeElemento, string> = {
  "texto-atras": "texto atrás de você",
  icone: "ícone animado",
  imagem: "imagem",
  video: "B-roll em vídeo",
  combinada: "vídeo com camada exata",
  dado: "número animado",
  lista: "lista ou passos",
  citacao: "citação",
  impacto: "tela de impacto",
  "legenda-destaque": "legenda de destaque",
  "nome-de-quem-fala": "nome de quem fala",
  "realce-de-quem-fala": "realce de quem fala",
  "zoom-no-ponto": "zoom no ponto",
  "destaque-na-tela": "destaque na tela",
  "cartao-de-passo": "cartão de passo",
  "frase-chave": "frase-chave",
  slide: "slide ao lado",
  "icone-com-frase": "ícone com frase",
  "comparacao-lado-a-lado": "não diga, diga isto",
  "cartoes-em-linha": "cartões lado a lado",
  "interface-de-edicao": "tela de edição animada",
  "titulo-em-caixa": "título na caixa",
  inscrever: "curtir e se inscrever",
  nada: "só você",
};

// ─────────────────────────────── a variante (código, pela fala) ───────────────────────────────

const NUMERO = /\b\d+([.,]\d+)?\b|\b(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|cem|mil|milh[aã]o|milh[oõ]es|bilh[oõ]es)\b/gi;
const ANO = /\b(1[5-9]\d\d|20\d\d)\b|\bs[eé]culo\b/i;
const VERSICULO = /\b\d{1,3}\s*[:.]\s*\d{1,3}\b|\b(vers[ií]culo|salmo|prov[eé]rbios|evangelho|b[ií]blia)\b/i;

/**
 * A variante do tipo pela fala (regra explícita, não decisão de gosto): a
 * espécie do dado (porcentagem, comparação, evolução no tempo, um número), a
 * da lista (datas, passos, itens) e a da citação (versículo ou não). A forma
 * da imagem (janela ou tela cheia) vem do JEV.
 */
export function varianteDo(tipo: TipoDeElemento, fala: string, formaDaImagem: "janela" | "tela-cheia" = "janela"): VarianteDoElemento | null {
  switch (tipo) {
    case "texto-atras":
    case "icone":
    case "video":
    case "combinada":
    case "impacto":
    case "legenda-destaque":
    case "inscrever":
    case "nome-de-quem-fala":
    case "realce-de-quem-fala":
    case "zoom-no-ponto":
    case "destaque-na-tela":
    case "cartao-de-passo":
    case "frase-chave":
    case "slide":
    case "icone-com-frase":
    case "comparacao-lado-a-lado":
    case "cartoes-em-linha":
    case "interface-de-edicao":
    case "titulo-em-caixa":
      return tipo;
    case "imagem":
      return formaDaImagem === "tela-cheia" ? "imagem-tela" : "imagem-janela";
    case "dado": {
      const n = (fala.match(NUMERO) ?? []).length;
      if (/%|por cento/i.test(fala)) return "dado-porcentagem";
      if (n >= 2 && ANO.test(fala)) return "dado-evolucao";
      if (n >= 2) return "dado-comparacao";
      return "dado-numero";
    }
    case "lista":
      return ANO.test(fala) ? "lista-datas" : /passo|etapa|fase|primeiro|depois|por fim|em seguida/i.test(fala) ? "lista-passos" : "lista-itens";
    case "citacao":
      return VERSICULO.test(fala) ? "citacao-versiculo" : "citacao";
    default:
      return null;
  }
}

// ─────────────────────────────── o ritmo (regras explícitas) ───────────────────────────────

export type Densidade = "calmo" | "medio" | "rapido";
export type QuantoDeMidia = "muito" | "algum" | "pouco" | "nenhum";

export type RegrasDoRitmo = {
  curto: boolean;
  /** Elementos por minuto que o comando pede. */
  porMinuto: number;
  /** Espaço mínimo (s) entre o fim de um elemento e o começo do próximo. */
  espaco: number;
  /** Tela cheia: no máximo esta fração do vídeo, este tanto de segundos cada, nunca antes de `telaDepoisDe`. */
  telaMaxFracao: number;
  telaMaxSeg: number;
  telaDepoisDe: number;
  /** Vídeos (B-roll gerado) por minuto, no máximo. */
  videosPorMinuto: number;
  /** Teto de custo em US$ por minuto de vídeo (imagens e vídeos da Higgsfield). */
  tetoUsdPorMinuto: number;
  /** Probabilidade mínima do tipo escolhido para entrar. */
  limiar: number;
  /**
   * A RÉGUA DA COBERTURA (05/10, noite): o maior trecho (s) que o vídeo pode
   * ficar sem nenhum elemento entrando ou saindo. No vídeo de 17 min de 05/10
   * o plano deixou 203 s seguidos sem peça; a medida `maiorSemTroca` já
   * existia no relatório, agora ela é regra do plano (ver `cobrirBuracos`).
   */
  maiorSemTroca: number;
};

/**
 * As regras pelo comando: a densidade (o JEV lê do comando) e o quanto de
 * imagem e vídeo (também do comando) mexem no ritmo e nos tetos; os tetos de
 * dinheiro vêm do ambiente (o servidor passa).
 */
export function regrasDoRitmo(o: { formato: "9:16" | "16:9"; duracao: number; densidade: Densidade; video: QuantoDeMidia; tetoUsdPorMinuto: number; videosPorMinutoMax: number }): RegrasDoRitmo {
  const curto = o.duracao <= 95 || o.formato === "9:16";
  const porMinuto = curto ? { calmo: 8, medio: 11, rapido: 15 }[o.densidade] : { calmo: 2.5, medio: 4, rapido: 6 }[o.densidade];
  const fatorVideo = { muito: 1, algum: 0.6, pouco: 0.3, nenhum: 0 }[o.video];
  return {
    curto,
    porMinuto,
    espaco: +Math.max(curto ? 1.2 : 4, (60 / porMinuto) * 0.25).toFixed(2),
    telaMaxFracao: curto ? 0.45 : 0.3,
    telaMaxSeg: curto ? 6 : 8,
    telaDepoisDe: curto ? 2 : 3,
    videosPorMinuto: +(o.videosPorMinutoMax * fatorVideo).toFixed(2),
    tetoUsdPorMinuto: o.tetoUsdPorMinuto,
    limiar: { calmo: 0.3, medio: 0.25, rapido: 0.2 }[o.densidade],
    // Duas vezes e meia o intervalo médio pedido, entre 8 s (corte) e 45 s (longo calmo).
    maiorSemTroca: +Math.min(curto ? 12 : 45, Math.max(curto ? 6 : 15, (60 / porMinuto) * 2.5)).toFixed(1),
  };
}

/** A duração (s) de cada tipo na tela: mínimo e máximo. */
export const DURACAO_DO_TIPO: Record<Exclude<TipoDeElemento, "nada">, [number, number]> = {
  "texto-atras": [2, 4.5],
  icone: [2, 4.5],
  imagem: [2.5, 5],
  video: [3, 5],
  combinada: [3.5, 5],
  dado: [2.5, 6],
  lista: [3.5, 9],
  citacao: [3, 7],
  impacto: [1.8, 4],
  "legenda-destaque": [1.2, 3],
  "nome-de-quem-fala": [2.5, 5],
  "realce-de-quem-fala": [2, 6],
  "zoom-no-ponto": [2.5, 6],
  "destaque-na-tela": [2, 5],
  "cartao-de-passo": [2.5, 6],
  "frase-chave": [3, 7],
  slide: [3.5, 9],
  "icone-com-frase": [2.5, 5],
  "comparacao-lado-a-lado": [3, 8],
  "cartoes-em-linha": [2.5, 6],
  "interface-de-edicao": [3, 7],
  "titulo-em-caixa": [2.5, 8],
  inscrever: [3, 5],
};

// ─────────────────────────────── o custo ───────────────────────────────

export const DOLAR_DA_IMAGEM = DOLAR_POR_IMAGEM[IMAGEM_DA_EDICAO];

/**
 * O CUSTO PREVISTO de um elemento antes do texto (o JEV respeita o teto ao
 * escolher): imagem é uma imagem; a janela que é peça com foto de arquivo são
 * duas fotos recortadas; vídeo é a imagem de reserva mais os segundos do
 * Kling 3.0 Pro. `pecaComFoto`: o componente escolhido pela linguagem pede
 * foto de arquivo recortada (PECAS_COM_FOTO), seja qual for a família.
 */
export function custoPrevisto(tipo: TipoDeElemento, variante: VarianteDoElemento | null, segundos: number, pecaComFoto: boolean): number {
  if (tipo === "video") return DOLAR_DA_IMAGEM + dolarDoVideoDaEdicao(segundos);
  // A combinada é só o vídeo de fundo (texto para vídeo, sem imagem antes); a camada é código, sem custo.
  if (tipo === "combinada") return dolarDoVideoDaEdicao(segundos);
  if (tipo === "imagem") return variante === "imagem-janela" && pecaComFoto ? 2 * (DOLAR_DA_IMAGEM + DOLAR_POR_RECORTE) : DOLAR_DA_IMAGEM;
  // Os elementos gerados por IA (06/10, noite): a imagem, o recorte e a conferência (sem contar a refação).
  if (ehPecaGerada(tipo)) return custoDoElemento();
  // As peças com foto de arquivo (jornal, cronologia) pagam a foto delas.
  return pecaComFoto ? DOLAR_DA_IMAGEM + DOLAR_POR_RECORTE : 0;
}

export type EstimativaDeCusto = {
  imagens: number;
  videos: number;
  segundosDeVideo: number;
  usd: number;
  usdPorMinuto: number;
  tetoUsdPorMinuto: number;
  /** A tabela usada, para a tela dizer de onde veio o preço. */
  precos: { imagemUsd: number; videoUsdPorSegundo: number; modeloDeImagem: string; modeloDeVideo: string };
};

/** Os componentes que pedem foto de arquivo recortada (o mesmo mapa de recortes-vox.ts, sem importar o servidor). */
export const COMPONENTES_COM_FOTO = new Set(["colagem", "jornal", "mapa-antigo", "censura", "cronologia"]);

type MomentoComFoto = { peca: string; props?: Record<string, unknown> };
type InsercaoComMidia = { midia?: "imagem" | "video"; segundos?: number; combinada?: boolean };

/** As fotos de arquivo que uma peça de papel pede (o mesmo mapa de recortes-vox.ts, sem importar o servidor). */
export function fotosDaPecaDePapel(m: MomentoComFoto): number {
  const p = (m.props ?? {}) as Record<string, unknown>;
  const conta = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? 1 : 0);
  if (m.peca === "colagem") return Math.min(3, conta(p.recortes));
  if (m.peca === "jornal" || m.peca === "mapa-antigo") return conta(p.foto);
  if (m.peca === "censura") return conta(p.figura);
  if (m.peca === "cronologia") return Array.isArray(p.marcos) ? (p.marcos as Array<{ foto?: unknown }>).filter((x) => x?.foto).length : 0;
  return 0;
}

/** A ESTIMATIVA do plano escrito: as fotos das peças, as imagens e os vídeos das inserções, pelo preço da tabela. */
export function estimarCusto(plano: { momentos?: MomentoComFoto[]; insercoes?: InsercaoComMidia[] }, duracao: number, tetoUsdPorMinuto: number): EstimativaDeCusto {
  const fotos = (plano.momentos ?? []).reduce((s, m) => s + fotosDaPecaDePapel(m), 0);
  const ins = plano.insercoes ?? [];
  const videos = ins.filter((x) => x.midia === "video");
  const segundosDeVideo = videos.reduce((s, x) => s + Math.min(15, Math.max(3, Math.ceil(x.segundos ?? 4))), 0);
  // O fundo da combinada é texto para vídeo: não paga a imagem antes (combinada.ts).
  const comImagem = ins.filter((x) => !x.combinada).length;
  // Os elementos gerados por IA (06/10, noite): uma imagem e um recorte cada.
  const gerados = (plano.momentos ?? []).filter((m) => ehPecaGerada(m.peca)).length;
  const imagens = fotos + comImagem + gerados;
  const usd = +(fotos * (DOLAR_DA_IMAGEM + DOLAR_POR_RECORTE) + comImagem * DOLAR_DA_IMAGEM + gerados * custoDoElemento() + videos.reduce((s, x) => s + dolarDoVideoDaEdicao(x.segundos ?? 4), 0)).toFixed(3);
  const min = Math.max(duracao / 60, 1 / 6);
  return {
    imagens,
    videos: videos.length,
    segundosDeVideo,
    usd,
    usdPorMinuto: +(usd / min).toFixed(3),
    tetoUsdPorMinuto,
    precos: { imagemUsd: DOLAR_DA_IMAGEM, videoUsdPorSegundo: +(dolarDoVideoDaEdicao(10) / 10).toFixed(4), modeloDeImagem: IMAGEM_DA_EDICAO, modeloDeVideo: "kling-pro" },
  };
}
