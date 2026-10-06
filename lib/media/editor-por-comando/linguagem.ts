import { papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import type { Visual } from "@/lib/media/editor-sob-medida/tipos";
import type { FonteDoComando } from "@/lib/media/editor-por-comando/comando";

/**
 * A LINGUAGEM VISUAL DO VÍDEO (05/10/2026, noite): o SEGUNDO EIXO do editor
 * por comando. Regra do Bruno: "não quero hardcoded em nada; o editor tem de
 * ser tão bom para um médico quanto para um dev de IA".
 *
 * O erro anterior: o plano só podia usar as peças do catálogo do estilo (no
 * Vox, as 7 de papel) e o JEV saiu com 43 marca-textos em 52 peças e nenhum
 * vídeo. Agora há dois eixos separados:
 *
 *   1. O TIPO DE ELEMENTO (elementos.ts): livre por momento da fala, escolhido
 *      pelo JEV (texto atrás, ícone, imagem, B-roll em vídeo, dado, lista,
 *      citação, impacto, legenda de destaque ou nada).
 *   2. A LINGUAGEM VISUAL (este módulo): COMO todo tipo é desenhado. Ela sai
 *      do comando, da marca e do nicho do projeto e decide:
 *        - a FAMÍLIA de componentes Remotion (o tema de props que o worker já
 *          sabe desenhar: papel, vidro, neon, luxo, giz, realista, traço,
 *          minimalista, impacto). Tipo sem componente próprio na família usa o
 *          componente genérico com o tema dela; nenhum tipo é recusado;
 *        - as letras e as cores (a hierarquia de lib/media/papeis-da-paleta.ts:
 *          a cor da marca só nos detalhes);
 *        - o BLOCO DE ESTILO que vai em TODO prompt de imagem e de vídeo da
 *          Higgsfield. Quem escreve o bloco é o redator (Claude), a partir do
 *          comando, do nicho e da marca; aqui fica só a reserva montada com as
 *          palavras do próprio comando, para quando o redator falhar.
 *
 * As famílias são o que existe no código do worker (não há como desenhar um
 * acabamento que nenhum componente sabe); o que o cliente pede além delas
 * entra pelo bloco de estilo das imagens e dos vídeos e pela escolha da
 * família mais próxima, feita pelo JEV.
 *
 * Módulo puro: a tela e o servidor importam daqui.
 */

export type FamiliaVisual = "papel" | "vidro" | "neon" | "luxo" | "giz" | "realista" | "traco" | "minimalista" | "impacto";

/**
 * As variantes que o código deriva do tipo escolhido pelo JEV (a forma da
 * imagem, a espécie do dado, da lista e da citação). É a chave do mapa de
 * componentes de cada família.
 */
export type VarianteDoElemento =
  | "texto-atras"
  | "icone"
  | "imagem-janela"
  | "imagem-tela"
  | "video"
  | "dado-numero"
  | "dado-comparacao"
  | "dado-porcentagem"
  | "dado-evolucao"
  | "lista-datas"
  | "lista-passos"
  | "lista-itens"
  | "citacao"
  | "citacao-versiculo"
  | "impacto"
  | "legenda-destaque"
  // Os tipos de contexto (06/10): uma variante cada, desenhada pelo tema da família.
  | "nome-de-quem-fala"
  | "realce-de-quem-fala"
  | "zoom-no-ponto"
  | "destaque-na-tela"
  | "cartao-de-passo"
  | "frase-chave"
  | "slide"
  | "inscrever";

export type FichaDaFamilia = {
  id: FamiliaVisual;
  nome: string;
  /** O que o JEV lê para escolher a família pelo comando, pela marca e pelo nicho. */
  criterio: string;
  /** O tema que o worker aplica a TODA peça genérica. */
  visual: Visual;
  acabamento?: "tecnologico" | "luxo";
  /** A base antiga que a montagem ainda usa (os acentos do Vox, o fundo de colagem). */
  base: string;
  /** A letra quando o cliente não escolheu outra (a escolha dele sempre manda). */
  fonte: FonteDoComando;
  /** O componente PRÓPRIO da família por variante; o que falta cai no genérico. */
  componentes: Partial<Record<VarianteDoElemento, string>>;
  /** As palavras-semente da reserva do bloco de estilo (inglês), só sem o redator. */
  semente: string;
};

/** O componente GENÉRICO de cada variante: vale em toda família, com o tema dela. Imagem em tela e vídeo são inserções (sem peça). */
export const COMPONENTE_GENERICO: Record<VarianteDoElemento, string | null> = {
  "texto-atras": "titulo-atras",
  icone: "icone",
  "imagem-janela": "imagem-janela",
  "imagem-tela": null,
  video: null,
  "dado-numero": "numero",
  "dado-comparacao": "barras",
  "dado-porcentagem": "progresso",
  "dado-evolucao": "grafico-linha",
  "lista-datas": "linha-do-tempo",
  "lista-passos": "passos-foco",
  "lista-itens": "cartoes",
  citacao: "citacao",
  "citacao-versiculo": "pergaminho",
  impacto: "frase-impacto",
  "legenda-destaque": "sublinhado",
  // Os tipos de contexto (06/10, worker/remotion/src/sob-medida/pecas/contexto.tsx): um componente cada, na linguagem do vídeo.
  "nome-de-quem-fala": "nome-de-quem-fala",
  "realce-de-quem-fala": "realce-de-quem-fala",
  "zoom-no-ponto": "zoom-no-ponto",
  "destaque-na-tela": "destaque-na-tela",
  "cartao-de-passo": "cartao-de-passo",
  "frase-chave": "frase-chave",
  slide: "slide",
  // A chamada de curtir e inscrever (05/10, noite): um componente só, desenhado na linguagem do vídeo.
  inscrever: "inscrever",
};

export const FAMILIAS: FichaDaFamilia[] = [
  {
    id: "papel",
    nome: "Papel recortado (colagem editorial)",
    criterio: "colagem de papel recortado, jornal, mapa antigo, fotos de arquivo, documentário explicativo editorial (Vox, Johnny Harris)",
    visual: "documental",
    base: "vox",
    fonte: "playfair",
    componentes: { "imagem-janela": "colagem", "lista-datas": "cronologia", citacao: "jornal", "citacao-versiculo": "jornal", impacto: "jornal", "legenda-destaque": "marca-texto" },
    semente: "paper cutout collage, aged paper texture, torn edges, halftone print, archival documentary look",
  },
  {
    id: "vidro",
    nome: "Tecnológico limpo (painéis de vidro)",
    criterio: "tecnológico, didático, limpo, passo a passo, painéis de vidro, interface, produto digital, SaaS, aula organizada",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "keynote",
    fonte: "geist",
    componentes: {},
    semente: "clean modern tech aesthetic, frosted glass panels, soft gradients, crisp product lighting",
  },
  {
    id: "neon",
    nome: "Futurista neon",
    criterio: "futurista, neon, cyberpunk, ficção científica, hologramas, brilho, noite da cidade, IA e tecnologia de ponta",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "keynote",
    fonte: "geist",
    componentes: {},
    semente: "futuristic neon look, dark background, glowing light trails, holographic interface elements, high contrast",
  },
  {
    id: "luxo",
    nome: "Luxo e high ticket",
    criterio: "luxo, high ticket, premium, preto e dourado, minimalismo elegante, autoridade, exclusividade",
    visual: "impacto",
    acabamento: "luxo",
    base: "consorcio",
    fonte: "oswald",
    componentes: { impacto: "palavra-gigante", "lista-passos": "pilha-passos", "lista-itens": "pilha-passos" },
    semente: "luxury editorial look, deep black and metallic gold accents, elegant soft light, premium materials, lots of negative space",
  },
  {
    id: "giz",
    nome: "Lousa e diagramas",
    criterio: "lousa, quadro, diagramas desenhados à mão, frameworks, aula de negócios, Dan Martell",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "lousa",
    fonte: "geist",
    componentes: { impacto: "palavra-gigante", "lista-passos": "pilha-passos", "imagem-janela": "imagem-janela" },
    semente: "hand drawn chalk and marker diagram style, sketch lines on a board, simple shapes, educational",
  },
  {
    id: "realista",
    nome: "Realista e documental",
    criterio: "realista, fotográfico, documental, acolhedor, humano, clínica, saúde, natureza, cinema sóbrio, reportagem",
    visual: "documental",
    base: "documentario",
    fonte: "playfair",
    componentes: {},
    semente: "realistic photographic look, natural soft light, warm and human, shallow depth of field, documentary",
  },
  {
    id: "traco",
    nome: "Charge, cartoon e ilustração",
    criterio: "charge, cartoon, desenho animado, ilustração, quadrinhos, humor, traço de caneta, infantil",
    visual: "impacto",
    base: "keynote",
    fonte: "archivo",
    componentes: {},
    semente: "flat cartoon illustration, bold ink outlines, playful editorial cartoon style, simple shapes",
  },
  {
    id: "minimalista",
    nome: "Minimalista corporativo",
    criterio: "minimalista, corporativo, B2B, relatório, sóbrio, pouco texto, muito respiro, keynote da Apple",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "keynote",
    fonte: "geist",
    componentes: {},
    semente: "minimalist corporate look, plenty of negative space, soft neutral background, one clear subject",
  },
  {
    id: "impacto",
    nome: "Alta retenção (impacto)",
    criterio: "impacto, retenção, viral, Hormozi, MrBeast, texto grande e rápido, energia alta, cores fortes",
    visual: "impacto",
    base: "hormozi",
    fonte: "archivo",
    componentes: {},
    semente: "bold high energy look, punchy saturated colors, dramatic contrast, dynamic composition",
  },
];

export const FAMILIA = Object.fromEntries(FAMILIAS.map((f) => [f.id, f])) as Record<FamiliaVisual, FichaDaFamilia>;

export const familiaValida = (v: unknown): FamiliaVisual => (FAMILIAS.some((f) => f.id === v) ? (v as FamiliaVisual) : "minimalista");

/** A família pelas palavras do comando: a reserva sem o JEV. */
export function familiaPorPalavras(texto: string): FamiliaVisual {
  const t = texto.toLowerCase();
  if (/vox|papel|colagem|recorte|jornal|arquivo/.test(t)) return "papel";
  if (/neon|futur|cyber|holo/.test(t)) return "neon";
  if (/lousa|quadro|dan martell|diagrama|giz/.test(t)) return "giz";
  if (/luxo|high ticket|premium|dourad/.test(t)) return "luxo";
  if (/charge|cartoon|desenho animado|ilustra|quadrinho/.test(t)) return "traco";
  if (/realist|fotogr|document|acolhe|cl[ií]nica|cinema/.test(t)) return "realista";
  if (/hormozi|mrbeast|reten|viral|impacto/.test(t)) return "impacto";
  if (/tecnol|vidro|passo a passo|did[aá]tic/.test(t)) return "vidro";
  return "minimalista";
}

/** O componente Remotion de uma variante na família: o próprio dela ou o genérico com o tema. Null: é inserção (imagem em tela cheia, vídeo). */
export function componenteDa(familia: FamiliaVisual, variante: VarianteDoElemento): string | null {
  return FAMILIA[familia]?.componentes[variante] ?? COMPONENTE_GENERICO[variante];
}

/** As cores da marca para o prompt de imagem, pela hierarquia do cliente (só nos detalhes). */
export function coresNoPrompt(paleta: string[] | null | undefined, cores?: { acento: string; escuro: string; claro: string } | null): string {
  const p = papeisDaPaleta(paleta?.length ? paleta : cores ? [cores.acento, cores.escuro, cores.claro] : null);
  if (!p) return "";
  const partes = [`accent ${p.destaque}`, p.escuro ? `dark ${p.escuro}` : "", p.claro ? `light ${p.claro}` : ""].filter(Boolean);
  return `Brand colors only as small accents and details (never a flat color wash): ${partes.join(", ")}.`;
}

/**
 * A RESERVA do bloco de estilo, quando o redator não devolveu o dele: as
 * sementes da família, o comando do cliente como foi escrito (o modelo de
 * imagem entende português) e as cores da marca. Nunca genérico: o comando e
 * a marca estão nele.
 */
export function blocoDeEstiloDeReserva(familia: FamiliaVisual, comando: string, nicho: string | null | undefined, coresTexto: string): string {
  const f = FAMILIA[familia];
  return [`Visual language: ${f.semente}.`, `As the client described it (Portuguese): "${comando.replace(/\s+/g, " ").slice(0, 280)}".`, nicho ? `Audience and field: ${nicho.slice(0, 120)}.` : "", coresTexto].filter(Boolean).join(" ");
}

/**
 * O CENÁRIO DA GRAVAÇÃO (05/10, noite; regra do Bruno depois do vídeo
 * cmuvv0jje): o cenário do cliente NUNCA é trocado sem pedido explícito.
 * "gravacao": a gravação fica como foi gravada e as artes entram, ficam e
 * saem por cima dela. "trocado": o comando pediu, com todas as letras, para
 * trocar o fundo ou pôr a pessoa num cenário ("troque o meu fundo", "me
 * coloque numa biblioteca antiga"); só então existe um fundo atrás da pessoa
 * recortada. Quem decide é o JEV, lendo o comando; isto é a reserva sem ele.
 */
export type CenarioDaGravacao = "gravacao" | "trocado";

export function cenarioPorPalavras(comando: string): CenarioDaGravacao {
  const t = comando.toLowerCase();
  const pede =
    /tro(c|qu)\w*\s+(o\s+|a\s+)?(meu\s+|minha\s+)?(fundo|cen[aá]rio|parede)/.test(t) ||
    /(me\s+)?(colo(c|qu)\w*|p[oõ]e|ponha|bota\w*|insira|situe)(-me)?\s+(a\s+pessoa\s+|me\s+|eu\s+)?(em|num|numa|dentro de)\s+(um\s+|uma\s+)?(cen[aá]rio|fundo|ambiente|estúdio|estudio)/.test(t) ||
    /(fundo|cen[aá]rio)\s+(novo|diferente|trocado|virtual|gerado)/.test(t) ||
    /substitu\w*\s+(o\s+)?(fundo|cen[aá]rio)/.test(t) ||
    /(atr[aá]s de mim|por tr[aá]s de mim)\s+(um|uma)\s+(cen[aá]rio|fundo)/.test(t);
  return pede ? "trocado" : "gravacao";
}

/** O que a linguagem decidida carrega para o plano (gravado com ele; a tela lê). */
export type LinguagemDoVideo = {
  familia: FamiliaVisual;
  nome: string;
  /** O cenário da gravação: sem o campo (planos de antes de 05/10 à noite), a gravação fica como foi gravada. */
  cenario?: CenarioDaGravacao;
  /** O bloco que vai em TODO prompt de imagem e vídeo (inglês). */
  blocoDeEstilo: string;
  /** Quem escreveu o bloco: o redator, ou a reserva do código. */
  origemDoBloco: "redator" | "reserva";
  fonte: FonteDoComando;
  cores: string;
  nicho?: string | null;
};

/**
 * A GUARDA de todo pedido de imagem ou vídeo estilizado: sem texto, sem marca
 * d'água, sem pessoa real reconhecível. Não diz "fotográfico": quem decide o
 * acabamento é o bloco de estilo (papel, cartoon, neon...).
 */
export const GUARDA_DA_IMAGEM_ESTILIZADA =
  " No text, no letters, no captions, no logos, no watermark. No recognizable real person and no famous or historical figure; people only anonymous, from behind, in silhouette, as hands or far away. Nothing sensual.";

export const GUARDA_DO_VIDEO_ESTILIZADO =
  " The camera moves continuously and visibly from the first to the last frame (slow push-in, dolly, orbit or parallax), never a static shot." + GUARDA_DA_IMAGEM_ESTILIZADA;

/** O prompt final de uma imagem ou vídeo: a cena escrita para ESTE trecho + o bloco de estilo do vídeo + a guarda. */
export function promptDaMidia(cena: string, linguagem: Pick<LinguagemDoVideo, "blocoDeEstilo">, midia: "imagem" | "video"): string {
  const c = cena.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim().replace(/\.$/, "").slice(0, 600);
  return `${c}. ${linguagem.blocoDeEstilo.trim()}${midia === "video" ? GUARDA_DO_VIDEO_ESTILIZADO : GUARDA_DA_IMAGEM_ESTILIZADA}`;
}
