import { prisma } from "@/lib/db/prisma";
import { getMediaStylePromptFragment, type MediaStyleId } from "@/lib/media/media-style";
import { estiloDoCatalogo, normalizarEscolha, type EscolhaDeEstilo, type EstiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { lerEstiloDoCliente } from "@/lib/media/estilo-do-cliente";
import { identidadeDoProjeto } from "@/lib/media/identidade-visual";

/**
 * A direção de arte de cada peça visual: QUAL ESTILO e QUAIS CORES.
 *
 * Existe porque em 14/09 o Bruno abriu os infográficos da Demandou e todos
 * eram iguais: mesma paleta, mesmo layout, mesmo "modern corporate
 * infographic", fosse qual fosse o tema. A causa era hardcoded em
 * lib/media/infographic.ts: cinco paletas fixas escolhidas pelo NICHO (e o
 * nicho não muda de um post para outro), mais uma única frase de estilo. A
 * imagem comum tinha o problema parecido: "paleta alinhada ao nicho" e um
 * estilo fixo por campanha, "cinematic" por padrão.
 *
 * Duas decisões moram aqui:
 *
 * 1. AS CORES VÊM DA MARCA DO PROJETO, não do nicho. `Project.colorPalette`
 *    existe desde o setup ("#F97316,#1e1f22,#dbdee1": destaque, fundo escuro,
 *    claro). O nicho diz o assunto; a marca diz a cor. Misturar os dois era
 *    o que fazia todo cliente de "consultoria" sair azul-marinho.
 *
 * 2. O ESTILO ALTERNA, de propósito, e não repete o anterior. Um feed em que
 *    toda peça tem a mesma cara parece template, e template é o que o cliente
 *    compraria no Canva por dez reais. A escolha é determinística (mesma
 *    execução e mesmo dia dão o mesmo estilo, para retentativa não trocar a
 *    arte) e desvia do último estilo usado no projeto.
 */

export interface EstiloVisual {
  id: string;
  nome: string;
  /** Em inglês, porque é o que os modelos de imagem entendem melhor. */
  prompt: string;
  /** Vale para infográfico (layout com texto) ou só para imagem livre. */
  serveParaInfografico: boolean;
}

/**
 * O catálogo. A ordem importa pouco; o que importa é que sejam de fato
 * diferentes entre si. Cada entrada descreve composição, tipografia e
 * acabamento, e deixa a COR para a paleta do projeto.
 */
export const ESTILOS: EstiloVisual[] = [
  {
    id: "consultoria-clean",
    nome: "Consultoria clean",
    prompt:
      "Clean consulting deck aesthetic: generous white space, thin rules, restrained sans-serif typography, one accent color used sparingly, numbered sections aligned to a strict grid, no decoration, McKinsey-like clarity.",
    serveParaInfografico: true,
  },
  {
    id: "editorial-dados",
    nome: "Editorial com gráfico",
    prompt:
      "Editorial data-journalism style, like a magazine feature: a large chart (bar, line or area) as the hero element with annotated callouts, elegant serif headline paired with a small sans-serif body, muted background, precise labeled axes.",
    serveParaInfografico: true,
  },
  {
    id: "poster-tipografico",
    nome: "Pôster tipográfico",
    prompt:
      "Bold typographic poster: the headline is the image, oversized condensed type filling the frame, tight leading, one or two words in the accent color, minimal supporting text, strong contrast, Swiss poster energy.",
    serveParaInfografico: true,
  },
  {
    id: "dashboard-cards",
    nome: "Painel de indicadores",
    prompt:
      "Modern analytics dashboard look: rounded cards with big numbers and small labels, sparklines and progress rings, subtle drop shadows, dark or light surface depending on the palette, product-UI precision.",
    serveParaInfografico: true,
  },
  {
    id: "caderno-desenhado",
    nome: "Caderno desenhado à mão",
    prompt:
      "Hand-drawn notebook sketchnote: marker-style handwriting, doodled icons and arrows, boxes and underlines drawn by hand, paper texture, warm and human, the kind of visual notes from a workshop wall.",
    serveParaInfografico: true,
  },
  {
    id: "futurista",
    nome: "Futurista",
    prompt:
      "Futuristic tech aesthetic: dark gradient background, thin glowing lines, glassmorphism panels, subtle grid and light streaks, neon accent in the brand color, sharp geometric typography.",
    serveParaInfografico: true,
  },
  {
    id: "colagem-realista",
    nome: "Colagem com foto real",
    prompt:
      "Photographic collage: a realistic photograph of a real scene related to the topic (people at work, objects, environments), cut and layered with flat color blocks and short text overlays, editorial magazine cover feel.",
    serveParaInfografico: true,
  },
  {
    id: "ilustracao-flat",
    nome: "Ilustração flat",
    prompt:
      "Flat vector illustration: simple geometric characters and objects, limited palette, no gradients, playful but professional, isometric or front-facing scene that tells the idea of the post.",
    serveParaInfografico: true,
  },
  {
    id: "foto-cinematografica",
    nome: "Foto cinematográfica",
    prompt:
      "Cinematic photograph: film color grading, dramatic natural light, shallow depth of field, a single evocative scene that carries the mood of the topic, no text at all.",
    serveParaInfografico: false,
  },
  {
    id: "monocromo-acento",
    nome: "Monocromático com um acento",
    prompt:
      "Monochrome composition in one dark or light tone with a single accent color, high contrast, minimalist geometric shapes, lots of negative space, one headline, gallery-print restraint.",
    serveParaInfografico: true,
  },
  {
    // Pedido do Bruno em 18/09: "estilo Vox, uma mistura de arte recortada com
    // preto e branco e cinismo, tipo a estátua da liberdade rindo".
    id: "vox-recorte",
    nome: "Recorte editorial (Vox)",
    prompt:
      "Editorial cut-paper collage in the style of Vox and The Atlantic explainer art: black-and-white halftone photo cutouts with visible torn paper edges, arranged over flat solid shapes, ONE bold accent color only, generous negative space, deadpan visual irony and gentle satire (think the Statue of Liberty laughing), hand-cut imperfection, printed-zine texture, printed and hand-cut rather than glossy.",
    serveParaInfografico: true,
  },
];

/**
 * O estilo que o CLIENTE escolheu na campanha, quando ele escolheu um.
 *
 * Até 18/09 esta ponte não existia: o cliente marcava "Desenho animado" na
 * configuração, o `mediaStyle` ia gravado no config do run, e a direção de
 * arte sorteava outro estilo do catálogo. O Bruno pegou pelo resultado: "eu
 * escolhi o tema cartoon e olha a imagem que foi gerada, nada a ver".
 *
 * O que o cliente escolhe manda. A rotação automática existe para quem deixou
 * em "Automático", e só para esses.
 */
const DO_CLIENTE: Record<string, string> = {
  cartoon: "ilustracao-flat",
  caricature: "caderno-desenhado",
  illustration: "ilustracao-flat",
  photorealistic: "colagem-realista",
  documentary: "colagem-realista",
  cinematic: "foto-cinematografica",
  corporate_clean: "consultoria-clean",
  vox_recorte: "vox-recorte",
};

/**
 * A paleta do projeto vira uma frase que o modelo respeita.
 *
 * A última frase entrou em 30/09: na prova do item 10 o Gemini leu os códigos
 * como conteúdo e desenhou uma faixa de amostras com "#F97316" escrito no pé
 * da arte. Cor é instrução, não texto da peça.
 */
export function paletaDoProjeto(colorPalette: string | null | undefined): string {
  const cores = (colorPalette ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c));
  if (cores.length === 0) {
    return "Use a coherent, professional color palette that fits the topic.";
  }
  const [acento, fundo, claro] = cores;
  // A cor vai pelo NOME, e não pelo código: com "#F97316" no texto, o modelo
  // de imagem escreveu o código dentro da arte (teste de 30/09, duas vezes).
  const partes = [`brand accent color ${nomeDaCor(acento)}`];
  if (fundo) partes.push(`primary dark tone ${nomeDaCor(fundo)}`);
  if (claro) partes.push(`light neutral ${nomeDaCor(claro)}`);
  // "Mandatory" (até 02/10) tingia a cena inteira; a cor é direção, e a
  // prova A/B de 02/10 mostrou que a cena com cor natural e o acento num
  // detalhe é o que parece foto. A frase das amostras fica: veio de defeito real.
  return `Brand colours to lean toward: ${partes.join(", ")}; the accent for emphasis (a key object, one detail, the light), the rest natural to the scene. Colour is an instruction, never drawn as swatches or written on the art.`;
}

/** Um hex vira um nome de cor em inglês que o modelo de imagem entende. */
export function nomeDaCor(hex: string): string {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const sat = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (sat < 0.12) return l < 0.18 ? "near-black charcoal" : l < 0.45 ? "dark gray" : l < 0.8 ? "light gray" : "off-white";
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  const nomes: [number, string][] = [[15, "red"], [40, "orange"], [65, "yellow"], [150, "green"], [190, "teal"], [250, "blue"], [290, "purple"], [335, "magenta"], [360, "red"]];
  const base = nomes.find(([lim]) => hue < lim)?.[1] ?? "red";
  const tom = l < 0.3 ? "deep " : l > 0.75 ? "pale " : sat > 0.7 ? "vivid " : "";
  return `${tom}${base}`;
}

function hashSimples(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A LINGUAGEM DO VÍDEO TRADUZIDA PARA ARTE PARADA (30/09/2026, item 10).
 *
 * Até aqui havia duas direções visuais no mesmo projeto e elas não se
 * conheciam: o cliente escolhia "estilo Vox" no catálogo de edição
 * (lib/media/catalogo-de-estilos.ts, gravado em `Project.videoEstiloEscolha`)
 * e as artes da semana saíam do sorteio acima, uma semana "futurista", outra
 * "dashboard". O feed e o vídeo pareciam de duas marcas. A linguagem é do
 * projeto, e o que é do projeto vale para tudo que ele publica.
 *
 * Uma entrada por linguagem, e não por família (como a capa faz em
 * capa-composta.tsx), porque aqui o custo de ser específico é zero: é texto de
 * prompt. A família serve à capa porque lá cada família é CÓDIGO de montagem.
 * As fichas de origem estão em docs/estilos-de-edicao-de-video.md (linhas
 * "Grafismo" e "Cor" de cada uma). Nenhuma cita cor: a cor é a da marca,
 * sempre, pela `paletaDoProjeto`. "Estilo Vox" é a linguagem da Vox com as
 * cores do cliente, e nunca a marca, a vinheta ou o logo da Vox.
 */
export const ARTE_DA_LINGUAGEM: Record<string, { pt: string; en: string }> = {
  // O vendedor de consórcio (02/10, bíblia lib/media/biblias/consorcio.ts):
  // prova e confiança, nunca ostentação.
  consorcio: {
    pt: "Reels de vendedor de consórcio: o valor numa faixa rasgada na cor da marca, selo branco com o nome e letra condensada grande",
    en: "Consortium-sales social cover: one real, credible scene of the deal (house keys, car keys, a signed contract on a desk, a bright sales office), ONE big value in heavy condensed uppercase type on a torn paper strip in the brand accent color, a small white rounded badge with a check mark, high contrast, trustworthy and direct, modest and credible rather than flashy.",
  },
  vox: {
    pt: "colagem editorial de recortes de papel, fotos em preto e branco e marca-texto na cor da marca nas palavras-chave",
    en: "Editorial cut-paper collage in the language of an explainer video: black-and-white halftone photo cutouts with torn paper edges over a neutral off-white paper background, ONE accent color only (the brand accent) used as highlighter-marker strokes over the key words and as flat cut shapes, hand-drawn circles and arrows, zoomed fragments of documents whose small print is blurred and illegible (no fake readable words), printed-zine texture, generous negative space, deadpan editorial irony, printed and hand-cut rather than glossy.",
  },
  bbc: {
    pt: "sóbrio de telejornal: foto natural, tarja de título e um número grande com a fonte",
    en: "Sober broadcast-news graphic: a clean realistic photograph with natural color and moderate contrast, a lower-third style title bar, one big number with its source line, disciplined sans-serif typography on a strict grid, restrained use of the accent color, credible and calm.",
  },
  natgeo: {
    pt: "fotografia documental de grande reportagem, plano aberto que respira, cor rica e quente",
    en: "Documentary photography cover: one wide, breathing cinematic shot of a real place or activity related to the topic, rich warm earthy color, golden natural light, cinematic contrast, a thin frame border or one elegant serif title, lots of air, uncluttered.",
  },
  "johnny-harris": {
    pt: "mapa e foto com anotações à mão, setas e círculos na cor da marca",
    en: "Map-journalism collage: a real photograph or a textured paper map with hand-drawn marker annotations, circles, arrows and route lines, pinned notes and handwritten labels, warm slightly desaturated film grain, investigative desk feel, annotations in the accent color.",
  },
  "crime-real": {
    pt: "arquivo de investigação: luz dura, documentos sobre a mesa, tom frio e escuro",
    en: "Investigative case-file look: hard directional light, cold dark palette with high contrast, documents, folders and evidence photos laid on a dark desk, redaction bars, one detail highlighted in the accent color, tense and silent mood.",
  },
  "60-minutes": {
    pt: "retrato de entrevista de revista, luz quente sobre fundo escuro, uma citação curta",
    en: "Magazine-interview portrait look: warm natural key light against a dark background, classic interview framing, dignified serif typography with one short quote, minimal graphics, serious and human.",
  },
  kurzgesagt: {
    pt: "ilustração vetorial explicativa, formas geométricas e números grandes",
    en: "Flat vector explainer illustration: bold geometric shapes, a vibrant palette built from the brand colors on a dark or saturated background, big friendly numbers, clean rounded sans-serif, simple iconic characters and objects, fully illustrated.",
  },
  "quadro-branco": {
    pt: "desenho de quadro branco, traço preto e uma cor da marca",
    en: "Whiteboard drawing: black marker line art on a clean white board, the idea drawn step by step with arrows, boxes and simple figures, ONE accent color (the brand accent) for emphasis, handwritten labels, fully drawn.",
  },
  "ali-abdaal": {
    pt: "claro e acolhedor, tópicos numerados com imagem de apoio",
    en: "Friendly educational look: bright, warm and clean, numbered points with simple icons and one supporting photo or object per point, rounded cards, soft shadows, modern sans-serif, the accent color on the numbers.",
  },
  ted: {
    pt: "palco escuro com luz no centro e uma ideia grande",
    en: "Stage-talk look: a dark theatre stage with one spotlight, a single big idea statement as if projected on the screen, high contrast, the accent color as the only warm light, minimal text.",
  },
  keynote: {
    pt: "uma frase por tela, muito espaço vazio, cor só no destaque",
    en: "Product-launch keynote slide: pure black or pure white background, one sentence or one object, enormous negative space, precise thin sans-serif, color only on the product or the key word (brand accent), keynote restraint.",
  },
  institucional: {
    pt: "cena cinematográfica da equipe trabalhando, tom quente e frase de valor",
    en: "Cinematic corporate film still: a real team at work, warm cinematic grade, shallow depth of field, soft backlight, one short values statement in elegant type, aspirational and human.",
  },
  depoimento: {
    pt: "cartão de depoimento: foto natural, citação e o resultado em destaque",
    en: "Customer-testimonial card: a natural photo of a real customer in their own business setting, a short quote in large quotation marks, the result as a big number in the accent color, honest and warm, candid rather than glossy.",
  },
  vlog: {
    pt: "bastidor com cara de câmera na mão, cor vibrante e rótulos à mão",
    en: "Founder-vlog behind-the-scenes look: candid handheld-feel photo, vibrant contrasty color, casual handwritten or sticker-style labels, a small timestamp tag, energetic and real, imperfect framing on purpose.",
  },
  podcast: {
    pt: "estúdio escuro de podcast com luz na cor da marca",
    en: "Video-podcast cover look: a dark studio with a colored key light in the brand accent, microphones, the set or one or two people at the mic, a bold chapter title, premium audio-show feel.",
  },
  mrbeast: {
    pt: "saturado ao máximo, texto enorme e contornado, leitura instantânea",
    en: "Maximum-retention thumbnail look: extremely saturated, two or three huge bold words with a thick outline, exaggerated contrast, one clear subject, arrows or circles, one big number, instantly readable at small size.",
  },
  hormozi: {
    pt: "impacto: tipografia pesada no centro e a palavra-chave na cor da marca",
    en: "High-impact typographic look: heavy condensed uppercase type as the hero, huge centered words on a dark background, ONE keyword in the brand accent color, thick contrast, undecorated, punchy and direct, bold-caption energy.",
  },
  ugc: {
    pt: "cara de celular e ambiente real, com a caixa de texto simples da rede",
    en: "Native social-feed look: a real smartphone photo in a real environment, natural color, the platform's own simple text-box style (white rounded label with black text), authentic and unpolished.",
  },
  tipografia: {
    pt: "o texto é a imagem: palavras em tamanhos e pesos diferentes",
    en: "Kinetic-typography poster: the text IS the image, words of different sizes and weights stacked and rotated in rhythm, two or three brand colors, high contrast, bold grid, pure typography.",
  },
  "carrossel-animado": {
    pt: "lâmina de carrossel limpa, uma ideia por tela",
    en: "Clean carousel-slide design: one idea per slide, large headline, generous margins, consistent header and page indicator, flat brand-color blocks, readable at phone size.",
  },
  "wes-anderson": {
    pt: "simetria perfeita e tons pastel derivados da marca",
    en: "Symmetric pastel composition: perfectly centered frontal framing, pastel tints derived from the brand colors, tidy retro props, centered classic serif title, whimsical and meticulous.",
  },
  vhs: {
    pt: "retrô de fita VHS: granulado, linhas de varredura e data no canto",
    en: "Retro VHS aesthetic: grainy washed-out image, scan lines, faded magenta and cyan tints, a camcorder date stamp in the corner, 80s and 90s typography, nostalgic.",
  },
  minimalista: {
    pt: "claro e limpo, ícones de linha e gráfico simples na cor da marca",
    en: "Minimal corporate look: light, clean neutral background, thin line icons, a simple bar or line chart in the brand accent, lots of white space, precise sans-serif, B2B report clarity.",
  },
  "tela-dividida": {
    pt: "tela dividida em dois lados, como antes e depois",
    en: "Split-screen layout: the frame divided in two panels (before and after, or the person and what they comment on), a clear divider line in the accent color, bold labels on each side, contrasty.",
  },
};

/**
 * As CAMADAS do catálogo que fazem sentido numa imagem parada. Movimento de
 * câmera não tem (a arte não se mexe) e alguns efeitos só existem no tempo
 * (desaparecer, derreter, flash); esses ficam de fora de propósito, em vez de
 * virar frase que o modelo interpreta como quiser.
 */
const LOOK_NA_ARTE: Record<string, string> = {
  natural: "natural, balanced color",
  "cinema-quente": "warm earthy film grade",
  "frio-escuro": "cool, dark grade with strong shadows",
  pastel: "soft pastel tints derived from the brand colors",
  "pb-destaque": "everything in black and white except the elements in the brand accent color",
  "filme-16mm": "16mm film grain and soft edges",
  vhs: "VHS scan lines and faded magenta and cyan",
  ilustrado: "real imagery with an illustrated ink-line treatment",
  papel: "paper texture over the whole image",
  pintura: "visible painterly brush strokes",
  "alto-contraste": "saturated, high-contrast finish",
};
const EFEITO_NA_ARTE: Record<string, string> = {
  colagem: "cut-paper collage layers with soft paper shadows",
  recorte: "the subject cut out like paper over a paper background",
  quadrinho: "comic-panel framing with halftone dots",
  glitch: "one subtle digital glitch accent",
  "luz-vazada": "a warm film light leak on one edge",
  particulas: "a few floating light particles",
  "mundo-congelado": "a frozen, suspended moment",
};

/**
 * A marca por cima de qualquer linguagem. A cor já vem da `paletaDoProjeto`;
 * aqui entram a fonte e o logo. O logo NÃO é desenhado pelo modelo (ele
 * inventa letra e símbolo), então a instrução é não inventar nenhum e deixar
 * o canto limpo para o logo real. "Reservado para o logo" (texto de 30/09)
 * fez o modelo escrever "LOGO" e "Brand logo" nas lâminas: a frase agora
 * proíbe o marcador e não fala em reservar.
 */
const MARCA_NA_ARTE =
  "Brand consistency: one typeface family across the piece, the top-left corner left empty for the real logo (applied later, so the image carries no invented logo or placeholder), and nothing borrowed from the reference channel's own branding.";

/** A linguagem que o cliente escolheu para o vídeo, quando escolheu uma. */
export function linguagemDoProjeto(videoEstiloEscolha: unknown): { escolha: EscolhaDeEstilo; estilo: EstiloDoCatalogo } | null {
  // Só a escolha EXPLÍCITA conta. `normalizarEscolha` cai no Hormozi quando a
  // coluna está vazia, e isso é padrão de vídeo, não pedido do cliente: um
  // projeto que nunca abriu o catálogo continua na rotação de sempre.
  if (!videoEstiloEscolha || typeof videoEstiloEscolha !== "object") return null;
  const escolha = normalizarEscolha(videoEstiloEscolha);
  const estilo = estiloDoCatalogo(escolha.estiloId);
  if (!estilo || !ARTE_DA_LINGUAGEM[estilo.id]) return null;
  return { escolha, estilo };
}

/**
 * O que a tela mostra: "as artes seguem a linguagem do vídeo". Sai daqui, e
 * não de uma cópia na tela, para a frase e o prompt nunca discordarem.
 */
export async function linguagemDasArtes(projectId: string): Promise<{ id: string; nome: string; referencia?: string; arte: string } | null> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { videoEstiloEscolha: true } });
  const l = linguagemDoProjeto(p?.videoEstiloEscolha);
  if (!l) return null;
  return { id: l.estilo.id, nome: l.estilo.nome, referencia: l.estilo.referencia, arte: ARTE_DA_LINGUAGEM[l.estilo.id].pt };
}

/** A frase em inglês da linguagem, com as camadas que cabem numa arte parada. */
function promptDaLinguagem(escolha: EscolhaDeEstilo, estilo: EstiloDoCatalogo): string {
  const partes = [ARTE_DA_LINGUAGEM[estilo.id].en];
  const camadas = [
    ...(escolha.look && LOOK_NA_ARTE[escolha.look] ? [LOOK_NA_ARTE[escolha.look]] : []),
    ...escolha.efeitos.map((e) => EFEITO_NA_ARTE[e]).filter(Boolean),
  ];
  if (camadas.length) partes.push(`Finishing touches from the same video language: ${camadas.join("; ")}.`);
  // O cliente escreveu um ajuste no próprio catálogo ("como a Vox, mas mais
  // rápido"): vai como está, em português, porque o modelo lê e porque
  // traduzir aqui seria uma chamada por peça para um texto que não muda.
  if (escolha.texto?.trim()) partes.push(`Client's note on this language (Portuguese, apply what fits a still image): "${escolha.texto.trim().slice(0, 300)}".`);
  return partes.join(" ");
}

/** De onde veio a direção desta peça, para o log, o metadata e a tela. */
export type OrigemDaDirecao = "campanha" | "linguagem-do-video" | "estilo-proprio" | "setor" | "rotacao";

export interface DirecaoDaPeca {
  /** O estilo, com o refino do estilo próprio já dentro do `prompt`. Sem paleta. */
  estilo: EstiloVisual;
  paleta: string;
  /** estilo + paleta: o que a imagem livre e o carrossel recebem inteiro. */
  styleHint: string;
  origem: OrigemDaDirecao;
  /** O que vai para `Post.metadata.visualStyle` (memória da rotação). */
  visualStyle: string;
  /** Em português, para o log da Diana. */
  resumo: string;
}

/**
 * A DIREÇÃO DE ARTE COMPLETA DE UMA PEÇA, e a PRECEDÊNCIA entre as três
 * fontes que o cliente pode ter preenchido (decidida em 30/09, item 10):
 *
 * 1. **O estilo escolhido NA CAMPANHA** (`mediaStyle` diferente de
 *    "automático") é a base. É o pedido mais recente e mais específico: o
 *    cliente abriu a janela desta semana e clicou "Desenho animado". Vale só
 *    para esta campanha (lição de 18/09: o que o cliente escolhe manda).
 * 2. **A LINGUAGEM DO VÍDEO** (`Project.videoEstiloEscolha`) é a base quando a
 *    campanha está no automático, que é o padrão. Aqui ela substitui a
 *    rotação: o feed passa a falar a mesma língua do vídeo em todas as peças.
 * 3. **O ESTILO PRÓPRIO** que o cliente escreveu na Diana
 *    (lib/media/estilo-do-cliente.ts) REFINA a base, não a substitui: o
 *    catálogo diz a linguagem (colagem, impacto, sóbrio), a direção própria
 *    diz o resto (o tipo de foto, o que nunca aparece). Só quando não há base
 *    nenhuma (automático e sem linguagem) ele vira a direção inteira, que é o
 *    comportamento de 21/09.
 * 4. Sem nada disso, a DIREÇÃO DO SETOR (01/10), e não mais a rotação do
 *    catálogo: a rotação sorteava "futurista" para um consultório e "colagem
 *    Vox" para uma igreja. Quem não escolheu ganha a cara do próprio ramo
 *    (lib/media/identidade-visual.ts), e a variedade vem do enquadramento e
 *    do layout por peça, não de trocar de linguagem a cada post.
 *
 * A marca (cores, fonte, logo) vale em todas: `paletaDoProjeto` e
 * `MARCA_NA_ARTE`. Desde 01/10 a paleta é a EFETIVA da identidade: a da
 * configuração quando o cliente escolheu; senão a do manual, a do logo ou a
 * do setor. O laranja padrão do formulário não conta como escolha.
 */
export async function direcaoDaPeca(opcoes: {
  projectId: string;
  runId: string;
  dayOfWeek: number;
  infografico: boolean;
  /** O `mediaStyle` da campanha. "auto" (ou ausente) não é escolha. */
  preferido?: string | null;
}): Promise<DirecaoDaPeca> {
  const [projeto, proprio, identidade] = await Promise.all([
    prisma.project.findUnique({
      where: { id: opcoes.projectId },
      select: { colorPalette: true, videoEstiloEscolha: true },
    }),
    lerEstiloDoCliente(opcoes.projectId),
    identidadeDoProjeto(opcoes.projectId),
  ]);
  const { acento, escuro, claro } = identidade.cores;
  const paleta = paletaDoProjeto(`${acento},${escuro},${claro}`);
  // O mundo do cliente vai junto do estilo para quem escreve a cena (a
  // manchete da esteira e o roteiro do carrossel) desenhar no ramo certo. A
  // marca "CLIENT'S WORLD:" é o que `lookSemTexto` tira na hora da arte, onde
  // o mundo entra numa linha própria.
  const mundo = `CLIENT'S WORLD: ${identidade.setor.mundo}.`;
  const linguagem = linguagemDoProjeto(projeto?.videoEstiloEscolha);
  const daCampanha = estiloDaCampanha(opcoes.preferido, opcoes.infografico);

  let base: EstiloVisual | null = null;
  let origem: OrigemDaDirecao;
  if (daCampanha) {
    base = daCampanha;
    origem = "campanha";
  } else if (linguagem) {
    base = {
      id: `linguagem-${linguagem.estilo.id}`,
      nome: `${linguagem.estilo.nome}${linguagem.estilo.referencia ? ` (${linguagem.estilo.referencia})` : ""}`,
      prompt: promptDaLinguagem(linguagem.escolha, linguagem.estilo),
      serveParaInfografico: true,
    };
    origem = "linguagem-do-video";
  } else if (proprio) {
    origem = "estilo-proprio";
  } else {
    origem = "setor";
  }

  let estilo: EstiloVisual;
  if (base) {
    estilo = proprio
      ? {
          ...base,
          prompt: `${base.prompt} Refinement from the client's own art direction (keeps the language above, adjusts subject, light and what to avoid): ${proprio.prompt}`,
        }
      : base;
    if (origem === "linguagem-do-video") estilo = { ...estilo, prompt: `${estilo.prompt} ${MARCA_NA_ARTE}` };
  } else if (proprio) {
    estilo = { id: "proprio", nome: "Estilo próprio", prompt: `${proprio.prompt} ${MARCA_NA_ARTE}`, serveParaInfografico: true };
  } else {
    estilo = {
      id: `setor-${identidade.setor.id}`,
      nome: `Direção do setor (${identidade.setor.nome})`,
      prompt: `${identidade.setor.estilo} ${MARCA_NA_ARTE}`,
      serveParaInfografico: true,
    };
  }

  const origemEmTexto =
    origem === "linguagem-do-video" && linguagem
      ? `linguagem do vídeo, ${estilo.nome}: ${ARTE_DA_LINGUAGEM[linguagem.estilo.id].pt}${proprio ? ", refinada pelo seu estilo próprio" : ""}`
      : origem === "campanha"
        ? `estilo escolhido na campanha, ${estilo.nome}${proprio ? ", refinado pelo seu estilo próprio" : ""}`
        : origem === "estilo-proprio"
          ? "o seu estilo próprio"
          : `direção do setor ${identidade.setor.nome}, porque o projeto ainda não escolheu estilo`;
  // A identidade vai no log: o cliente vê de onde vieram as cores e, quando
  // são sugeridas, que precisa confirmar na configuração.
  const resumo = `${origemEmTexto}. Identidade: ${identidade.resumo}`;

  return {
    estilo,
    paleta,
    styleHint: `${estilo.prompt} ${paleta} ${mundo}`,
    origem,
    // "proprio" continua sendo o rótulo do estilo próprio sozinho, como já
    // gravado nos posts desde 21/09.
    visualStyle: origem === "estilo-proprio" ? "proprio" : origem === "campanha" ? (opcoes.preferido as string) : estilo.id,
    resumo,
  };
}

/** O estilo que o cliente escolheu na janela da campanha, se ele escolheu. */
function estiloDaCampanha(preferido: string | null | undefined, infografico: boolean): EstiloVisual | null {
  if (!preferido || preferido === "auto") return null;
  const idNoCatalogo = DO_CLIENTE[preferido];
  const doCatalogo = idNoCatalogo ? ESTILOS.find((e) => e.id === idNoCatalogo) : undefined;
  if (doCatalogo && (!infografico || doCatalogo.serveParaInfografico)) return doCatalogo;
  // Estilo novo que ainda não tem par no catálogo: vale o fragmento dele,
  // que é escrito para o mesmo tipo de modelo.
  const fragmento = getMediaStylePromptFragment(preferido as MediaStyleId);
  if (fragmento) return { id: preferido, nome: preferido, prompt: fragmento, serveParaInfografico: true };
  return null;
}

/**
 * Escolhe o estilo desta peça. Mantida com a assinatura antiga porque três
 * lugares a chamam (esteira, peças da semana do vídeo, regenerar pelo chat) e
 * todos passam a seguir a mesma precedência sem mudar uma linha: o `prompt`
 * devolvido já traz a linguagem do vídeo e o refino do estilo próprio. A
 * paleta continua separada, como sempre foi.
 */
export async function escolherEstilo(opcoes: {
  projectId: string;
  runId: string;
  dayOfWeek: number;
  infografico: boolean;
  /** O `mediaStyle` da campanha. "auto" (ou ausente) mantém a rotação. */
  preferido?: string | null;
}): Promise<EstiloVisual> {
  return (await direcaoDaPeca(opcoes)).estilo;
}

/**
 * A rotação, que até 01/10 era a direção de quem não escolheu nada. Saiu da
 * precedência (quem não escolheu ganha a direção do setor, ver
 * `direcaoDaPeca`) e fica exportada para os scripts de prova que a citam.
 *
 * Determinístico em (runId, dayOfWeek) para uma retentativa do mesmo dia não
 * trocar de arte no meio. Desvia dos estilos usados nas últimas peças do
 * projeto, lidos de `Post.metadata.visualStyle`, para a semana alternar de
 * verdade e não por sorte.
 */
export async function estiloDaRotacao(opcoes: { projectId: string; runId: string; dayOfWeek: number; infografico: boolean }): Promise<EstiloVisual> {
  const candidatos = ESTILOS.filter((e) => !opcoes.infografico || e.serveParaInfografico);

  const recentes = await prisma.post.findMany({
    where: { projectId: opcoes.projectId, imageUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { metadata: true },
  });
  const evitar = new Set(
    recentes
      .map((p) => (p.metadata as { visualStyle?: string } | null)?.visualStyle)
      .filter((s): s is string => Boolean(s))
  );

  const livres = candidatos.filter((e) => !evitar.has(e.id));
  const lista = livres.length > 0 ? livres : candidatos;
  const indice = (hashSimples(opcoes.runId) + opcoes.dayOfWeek * 7) % lista.length;
  return lista[indice];
}
