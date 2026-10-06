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
  | "combinada"
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
  // A PEÇA COMBINADA (06/10): a camada exata (pontos, linha, número, fio, etiquetas) sobre o vídeo de fundo gerado.
  combinada: "camada-exata",
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
    criterio: "colagem de papel recortado, jornal, mapa antigo, fotos de arquivo, mural de investigação, documentário explicativo editorial (Vox, Johnny Harris, crime real, Wes Anderson)",
    visual: "documental",
    base: "vox",
    fonte: "playfair",
    componentes: { "imagem-janela": "colagem", "lista-datas": "cronologia", citacao: "jornal", "citacao-versiculo": "jornal", impacto: "jornal", "legenda-destaque": "marca-texto" },
    semente:
      "editorial paper-cutout collage, scanned crumpled cream paper with fibre grain and folds, black and white halftone photographs hand cut with a white border and a short shadow, torn newspaper fragments with tiny unreadable letterpress, translucent tape, pen scribbles and hand-drawn arrows, one dry-brush highlighter sweep, elements layered at a slight tilt with real shadows; never vector, never 3D, no gloss",
  },
  {
    id: "vidro",
    nome: "Tecnológico limpo (painéis de vidro)",
    criterio: "tecnológico, didático, limpo, passo a passo, painéis de vidro, interface, produto digital, SaaS, aula organizada com cartões (Ali Abdaal, podcast em vídeo)",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "keynote",
    fonte: "geist",
    componentes: {},
    semente:
      "clean modern tech look, dark cool background with soft gradients, frosted glass panels with thin light borders, crisp product and screen lighting, subtle depth and reflections, geometric sans typography; no paper, no neon tubes, no clutter",
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
    semente:
      "futuristic neon look, near-black background, glowing light trails and holographic interface elements in the brand colour, wet reflective surfaces, volumetric haze, high contrast, cyan and magenta rim light; no paper, no daylight, no cartoon",
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
    semente:
      "premium luxury editorial look, deep matte black, the brand colour as brushed metal and thin metallic lines, elegant low-key light with a soft rim, polished stone, dark wood, leather and glass, lots of negative space, condensed uppercase type; no saturated colour, no clutter, no fake gold sparkle",
  },
  {
    id: "giz",
    nome: "Lousa e diagramas",
    criterio: "lousa, quadro branco, diagramas desenhados à mão, frameworks, aula de negócios (Dan Martell, whiteboard explainer)",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "lousa",
    fonte: "geist",
    componentes: { impacto: "palavra-gigante", "lista-passos": "pilha-passos", "imagem-janela": "imagem-janela" },
    semente:
      "hand-drawn board diagram look, a flat board (dark slate or clean white, as the command says), thin marker strokes drawn by hand (loops, ladders, arrows, axes), simple line icons, rounded frames and numbered tiles, the brand colour only for underlines and highlights; no cluttered photographs, no paper grain, no cartoon characters, no 3D",
  },
  {
    id: "realista",
    nome: "Realista e documental",
    criterio: "realista, fotográfico, documental, acolhedor, humano, clínica, saúde, natureza, cinema sóbrio, reportagem, entrevista, depoimento, institucional (BBC, National Geographic, 60 Minutes)",
    visual: "documental",
    base: "documentario",
    fonte: "playfair",
    componentes: {},
    semente:
      "realistic documentary photography, full-frame camera, available natural light, honest true-to-life colour, fine grain, shallow depth of field on details, real places and real work, people anonymous and unposed; no stock gloss, no HDR, no illustration, no neon",
  },
  {
    id: "traco",
    nome: "Charge, cartoon e ilustração",
    criterio: "charge, cartoon, desenho animado, ilustração vetorial plana, quadrinhos, humor, traço de caneta, infantil, animação explicativa (Kurzgesagt)",
    visual: "impacto",
    base: "keynote",
    fonte: "archivo",
    componentes: {},
    semente:
      "flat editorial cartoon illustration, bold clean ink outlines or rounded flat vector shapes, simple two-tone shading, playful simplified characters without detailed faces, solid colour backgrounds in the brand palette; no photographs, no 3D render, no grain",
  },
  {
    id: "minimalista",
    nome: "Minimalista corporativo",
    criterio: "minimalista, corporativo, B2B, relatório, sóbrio, pouco texto, muito respiro, uma frase por tela (keynote da Apple, palestra TED, carrossel animado)",
    visual: "vidro",
    acabamento: "tecnologico",
    base: "keynote",
    fonte: "geist",
    componentes: {},
    semente:
      "minimalist corporate look, off-white or pale grey background, generous negative space, one clear subject, thin line icons, flat charts in the brand colour, clean geometric sans, soft even light; no clutter, no textures, no neon, no cartoon",
  },
  {
    id: "impacto",
    nome: "Alta retenção (impacto)",
    criterio: "impacto, retenção, viral, Hormozi, MrBeast, vlog, TikTok nativo, tipografia animada, tela dividida, VHS, texto grande e rápido, energia alta, cores fortes",
    visual: "impacto",
    base: "hormozi",
    fonte: "archivo",
    componentes: {},
    semente:
      "bold high-energy short-form look, bright saturated high-contrast colour, punchy direct light, one big literal subject centred, heavy rounded or condensed type with thick outlines, colour blocks; no muted grades, no paper, no thin elegant type, no empty space",
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
/**
 * O TETO DO PROMPT ESTILIZADO (card 714): a cena, o bloco de estilo e a
 * guarda. Com a ficha do estilo inteira no bloco (até 900 da ficha, o
 * ajuste e as cores), o prompt passa de 1600; o teto antigo cortava o fim
 * do bloco e a guarda. 2400 cabe no limite do Kling (2500) e folga nos de
 * imagem (5000 ou mais).
 */
export const TETO_DO_BRIEFING_ESTILIZADO = 2400;

export const GUARDA_DA_IMAGEM_ESTILIZADA =
  " No text, no letters, no captions, no logos, no watermark. No recognizable real person and no famous or historical figure; people only anonymous, from behind, in silhouette, as hands or far away. Nothing sensual.";

export const GUARDA_DO_VIDEO_ESTILIZADO =
  " The camera moves continuously and visibly from the first to the last frame (slow push-in, dolly, orbit or parallax), never a static shot." + GUARDA_DA_IMAGEM_ESTILIZADA;

/** O prompt final de uma imagem ou vídeo: a cena escrita para ESTE trecho + o bloco de estilo do vídeo + a guarda. */
export function promptDaMidia(cena: string, linguagem: Pick<LinguagemDoVideo, "blocoDeEstilo">, midia: "imagem" | "video"): string {
  const c = cena.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim().replace(/\.$/, "").slice(0, 600);
  return `${c}. ${linguagem.blocoDeEstilo.trim()}${midia === "video" ? GUARDA_DO_VIDEO_ESTILIZADO : GUARDA_DA_IMAGEM_ESTILIZADA}`;
}
