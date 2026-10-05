import type { FonteId } from "@/lib/modelos-de-arte/fontes";
import { PROMPTS_VOX } from "@/lib/modelos-de-arte/prompts-vox";

/**
 * O BOOK DE MODELOS DA DEMANDOU (03/10/2026).
 *
 * Pedido do Bruno, para reduzir rejeição e retrabalho: "o que gera rejeição é o
 * cliente não saber o que vem e vir uma surpresa; escolher antes é o mais
 * inteligente". Então o cliente vê cada modelo JÁ com as cores, a fonte e o
 * logo dele (components/modelos-de-arte/galeria-de-modelos.tsx), escolhe um ou
 * mais, e a geração OBEDECE: o modelo vira o molde do layout (desenhado em
 * código por lib/modelos-de-arte/desenho.tsx, o mesmo desenho da prévia) e da
 * foto que a IA gera para o lugar da foto.
 *
 * Os modelos são da Demandou. Nasceram de formatos que funcionam (o estudo de
 * perfis que já fazemos com a Apify em lib/referencias, os modelos de Canva e
 * Figma Community, e o que mais roda em carrossel em 2026: lista numerada,
 * antes e depois, dado, print de texto), sem copiar marca, logo ou identidade
 * de ninguém. O nome é descritivo; quem inspirou fica só no campo interno
 * `inspiracao`, que a tela não mostra.
 *
 * Arquivo puro (sem banco): a galeria, que é componente de cliente, importa daqui.
 */

export type FormatoDoModelo = "post" | "carrossel" | "story" | "reels";

export type Arquetipo =
  | "foto-topo"
  | "foto-inteira"
  | "foto-lado"
  | "foto-profundidade"
  | "frase"
  | "citacao"
  | "lista"
  | "checklist"
  | "passos"
  | "dois-lados"
  | "dado"
  | "dado-barra"
  | "print-post"
  | "print-conversa"
  | "colagem"
  | "polaroid"
  | "jornal"
  | "revista"
  | "tipografia"
  | "marca-texto"
  | "caderno"
  | "caixa-pergunta"
  | "enquete"
  | "capa-tipografica"
  | "capa-carrossel"
  | "depoimento"
  | "oferta"
  | "verbete"
  // Os modelos com foto de 05/10 (desenhados em lib/modelos-de-arte/desenho-com-foto.tsx).
  | "retrato-bloco"
  | "retrato-faixas"
  | "foto-escurecida"
  | "frase-dupla"
  | "pb-palavra"
  | "textura-tipografica"
  | "foto-pura"
  | "capa-objetos"
  | "mapa-pontilhado"
  | "papel-pb"
  // A família Vox / colagem editorial (05/10, lib/modelos-de-arte/desenho-vox.tsx).
  | "vox-faixa"
  | "vox-foto-rasgada"
  | "vox-jornal"
  | "vox-antes-depois"
  | "vox-rosto"
  | "vox-capa"
  | "vox-infografico"
  | "vox-carimbo";

/** Os textos que um modelo pode pedir além do título. */
export type CampoDoModelo = "apoio" | "itens" | "numero" | "lados" | "autor" | "opcoes" | "chamada";

export type FundoDoModelo = "claro" | "escuro" | "acento" | "branco" | "papel";
export type DestaqueDoModelo = "cor" | "bloco" | "marca-texto" | "sublinhado" | "nenhum";
/** "recorte" (03/10): a foto real do cliente, com a pessoa recortada na frente do título. */
export type FotoDoModelo = "nenhuma" | "topo" | "inteira" | "lado" | "moldura" | "colagem" | "recorte";

export interface ModeloDeArte {
  id: string;
  /** Nome descritivo, nunca nome de pessoa real. */
  nome: string;
  /** A quem serve, em uma frase. */
  paraQuem: string;
  categoria: string;
  formatos: FormatoDoModelo[];
  arquetipo: Arquetipo;
  /** A estrutura, como o cliente lê. */
  estrutura: string;
  tipografia: { titulo: FonteId; texto: FonteId; caixaAlta?: boolean };
  /** Como a cor da marca é usada. */
  cor: string;
  fundo: FundoDoModelo;
  destaque: DestaqueDoModelo;
  foto: FotoDoModelo;
  /** Onde vai a foto, como o cliente lê. */
  fotoOnde: string;
  /** A direção da foto para o modelo de imagem, em inglês. Só quando há foto. */
  fotoPrompt?: string;
  /** As regras de texto, que o redator da manchete recebe. */
  regrasDeTexto: string;
  /** Teto de palavras do título. */
  maxPalavras: number;
  campos: CampoDoModelo[];
  /** Interno (não aparece na tela): o formato real que inspirou. */
  inspiracao: string;
  /**
   * A foto SEMPRE em preto e branco (05/10), feita em código e sem IA: no
   * servidor o sharp tira a cor do pixel antes de compor (lib/modelos-de-arte/compor.tsx);
   * na prévia, um filtro CSS. Vale por cima da opção "Fotos" da identidade,
   * porque aqui o preto e branco é o próprio desenho do modelo.
   */
  fotoPretoEBranco?: boolean;
  /**
   * O MODELO POR PROMPT (05/10, lib/modelos-de-arte/prompts-vox.ts): nos
   * modelos complexos (a família Vox), quem desenha o visual é o próprio
   * modelo de imagem, a partir deste prompt com variáveis ({destaque},
   * {manchete}, {foto}...), SEM texto; a tipografia entra depois em código
   * (lib/modelos-de-arte/prompt-do-modelo.ts e desenho-vox.tsx, modo "fundo
   * gerado"). Sem prompt, o modelo é desenhado inteiro em código.
   */
  prompt?: string;
  /**
   * A prévia do modelo por prompt: UM exemplo gerado uma vez pelo modelo de
   * imagem e guardado no Blob (scripts/tmp/gerar-previas-vox-0510.mts). Sem
   * ela, a galeria mostra o desenho em código com o selo "exemplo gerado pelo
   * modelo de imagem ao escolher".
   */
  previaGerada?: string;
}

export interface TextosDaArte {
  /** A frase principal (manchete, citação, pergunta, termo do verbete). */
  titulo: string;
  apoio?: string;
  itens?: string[];
  /** O número do dado, como escrito ("73%", "R$ 1.200", "3x"). */
  numero?: string;
  /** Os dois lados (antes e depois, evite e faça, mito e verdade). */
  lados?: { rotulos: [string, string]; esquerda: string[]; direita: string[] };
  autor?: string;
  opcoes?: [string, string];
  chamada?: string;
}

const FOTO_EDITORIAL =
  "Realistic editorial photograph, natural light, one clear focal subject, believable real place and materials, shallow depth of field, calm composition, no people's faces, no text, no logos.";

export const MODELOS_DE_ARTE: ModeloDeArte[] = [
  // ── Com a sua foto (03/10, biblioteca de materiais) ──
  {
    id: "voce-na-frente-do-titulo",
    nome: "Você na frente do título",
    paraQuem: "Quem aparece na própria marca: a sua foto real vira capa, com profundidade.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "foto-profundidade",
    estrutura: "A sua foto em tela cheia, com o fundo desfocado e na luz da marca; o título gigante passa ATRÁS de você, que fica recortado na frente; linha de apoio e logo embaixo.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: true },
    cor: "Luz da cor de destaque atrás de você e na palavra-chave; o resto em branco sobre o tom escuro da marca.",
    fundo: "escuro",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "A peça inteira: a sua foto da biblioteca de materiais, sem mexer no rosto, só luz, cor e recorte.",
    fotoPrompt: `${FOTO_EDITORIAL} Full-bleed frame with a calm upper half for a giant headline.`,
    regrasDeTexto: "Título de até 6 palavras, curto e forte; uma linha de apoio de até 12 palavras.",
    maxPalavras: 6,
    campos: ["apoio"],
    inspiracao: "Capas de criadores e palestrantes com o rosto na frente do título (efeito de profundidade de Reels e YouTube).",
  },
  // ── Com foto ──
  {
    id: "foto-legenda-escura",
    nome: "Foto real com legenda escura embaixo",
    paraQuem: "Quem quer parecer marca de verdade: foto do mundo do negócio e a frase logo abaixo.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "foto-topo",
    estrutura: "Foto realista ocupando 60% de cima; faixa escura da marca embaixo com a manchete em branco e um fio na cor de destaque.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo da faixa no tom escuro da marca, palavra-chave na cor de destaque.",
    fundo: "escuro",
    destaque: "cor",
    foto: "topo",
    fotoOnde: "Em cima, de borda a borda, 60% da altura.",
    fotoPrompt: `${FOTO_EDITORIAL} Wide horizontal composition, the subject in the upper two thirds.`,
    regrasDeTexto: "Manchete de até 10 palavras, afirmativa; uma palavra-chave leva a cor da marca.",
    maxPalavras: 10,
    campos: [],
    inspiracao: "Carrosséis de posicionamento com foto e texto embaixo (estudo Apify: perfis de comunicação com ganho 3x a 49x).",
  },
  {
    id: "foto-legenda-clara",
    nome: "Foto real com legenda clara embaixo",
    paraQuem: "Consultório, escola e escritório: limpo, claro e confiável.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "foto-topo",
    estrutura: "Foto em quadro de cantos arredondados em cima; frase escura sobre fundo claro embaixo, com uma linha de apoio.",
    tipografia: { titulo: "Inter-700", texto: "Inter-400" },
    cor: "Fundo claro da marca, texto no tom escuro, palavra-chave na cor de destaque.",
    fundo: "claro",
    destaque: "cor",
    foto: "topo",
    fotoOnde: "Em cima, num quadro com margem e cantos arredondados.",
    fotoPrompt: `${FOTO_EDITORIAL} Bright, airy, soft daylight.`,
    regrasDeTexto: "Manchete de até 10 palavras e uma linha de apoio de até 14 palavras.",
    maxPalavras: 10,
    campos: ["apoio"],
    inspiracao: "Posts de clínicas e escritórios de contabilidade (modelos 'clean' do Canva).",
  },
  {
    id: "foto-inteira-degrade",
    nome: "Foto inteira com manchete no degradê",
    paraQuem: "Quem tem uma cena forte e quer impacto no feed.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "foto-inteira",
    estrutura: "Foto ocupando a peça inteira, escurecendo de baixo para cima; manchete em caixa alta condensada embaixo, palavra-chave num bloco da cor da marca.",
    tipografia: { titulo: "Oswald-700", texto: "Inter-400", caixaAlta: true },
    cor: "A cor de destaque só no bloco da palavra-chave.",
    fundo: "escuro",
    destaque: "bloco",
    foto: "inteira",
    fotoOnde: "A peça inteira, de borda a borda.",
    fotoPrompt: `${FOTO_EDITORIAL} Full-bleed cinematic frame, calmer darker area in the lower third where the headline sits.`,
    regrasDeTexto: "Até 8 palavras, curtas e diretas.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Capas de notícia de portais e perfis de negócios de grande alcance.",
  },
  {
    id: "foto-meia-meia",
    nome: "Foto de um lado, texto do outro",
    paraQuem: "LinkedIn e quem explica um ponto com calma.",
    categoria: "Com foto",
    formatos: ["post", "carrossel"],
    arquetipo: "foto-lado",
    estrutura: "A peça dividida ao meio: foto de um lado, texto do outro, com fio da cor da marca acima da manchete.",
    tipografia: { titulo: "PlayfairDisplay-700", texto: "Inter-400" },
    cor: "Fundo claro, fio e palavra-chave na cor de destaque.",
    fundo: "claro",
    destaque: "cor",
    foto: "lado",
    fotoOnde: "Metade da peça (em cima no formato em pé, à esquerda no deitado).",
    fotoPrompt: `${FOTO_EDITORIAL} Balanced composition that survives a square or tall crop.`,
    regrasDeTexto: "Manchete de até 9 palavras e uma linha de apoio de até 16 palavras.",
    maxPalavras: 9,
    campos: ["apoio"],
    inspiracao: "Layouts editoriais meio a meio de revistas de negócio e modelos de LinkedIn do Figma Community.",
  },
  {
    id: "polaroid-legenda-a-mao",
    nome: "Foto instantânea com legenda à mão",
    paraQuem: "Bastidor, história pessoal, marca próxima e humana.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "polaroid",
    estrutura: "Foto numa moldura branca de foto instantânea, levemente torta, sobre a cor da marca; legenda escrita à mão embaixo.",
    tipografia: { titulo: "Caveat-700", texto: "Inter-400" },
    cor: "Fundo na cor de destaque da marca, moldura branca, letra escura.",
    fundo: "acento",
    destaque: "nenhum",
    foto: "moldura",
    fotoOnde: "Dentro da moldura branca, quadrada.",
    fotoPrompt: `${FOTO_EDITORIAL} Candid snapshot feel, warm natural colour, square framing.`,
    regrasDeTexto: "Frase curta de até 9 palavras, em tom de conversa.",
    maxPalavras: 9,
    campos: [],
    inspiracao: "Moldes de 'polaroid' do Canva e perfis de bastidor de pequenos negócios.",
  },
  {
    id: "colagem-fita-adesiva",
    nome: "Colagem com fita adesiva",
    paraQuem: "Marca criativa, educação e conteúdo de opinião.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "colagem",
    estrutura: "Duas fotos recortadas e coladas com fita, uma por cima da outra; a manchete em tiras de papel branco, a palavra-chave em letra de pincel na cor da marca.",
    tipografia: { titulo: "ArchivoBlack-400", texto: "PermanentMarker-400", caixaAlta: true },
    cor: "Papel na cor clara, tira de destaque na cor da marca.",
    fundo: "papel",
    destaque: "marca-texto",
    foto: "colagem",
    fotoOnde: "Duas fotos recortadas, tortas, no meio da peça.",
    fotoPrompt: `${FOTO_EDITORIAL} Strong simple subject that reads well when cut out and printed small, slightly desaturated print look.`,
    regrasDeTexto: "Até 8 palavras; uma palavra forte vira o destaque.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Estética de colagem editorial (explicadores de jornal digital) e o post de leituras do ano do próprio Bruno no estudo de perfis.",
  },
  {
    id: "manchete-de-jornal",
    nome: "Página de jornal",
    paraQuem: "Notícia do setor, opinião e análise.",
    categoria: "Com foto",
    formatos: ["post", "carrossel"],
    arquetipo: "foto-topo",
    estrutura: "Cabeçalho com o nome da marca em serifa, linha de data, manchete grande em serifa, foto com legenda pequena; papel de jornal.",
    tipografia: { titulo: "PlayfairDisplay-700", texto: "Inter-400" },
    cor: "Papel claro, letra preta, só os fios na cor da marca.",
    fundo: "papel",
    destaque: "nenhum",
    foto: "topo",
    fotoOnde: "Embaixo da manchete, faixa larga.",
    fotoPrompt: `${FOTO_EDITORIAL} Documentary news photo look, wide frame.`,
    regrasDeTexto: "Manchete de jornal, até 10 palavras, e uma linha fina de até 14.",
    maxPalavras: 10,
    campos: ["apoio"],
    inspiracao: "Formato 'notícia' que perfis de notícias de negócio usam no Instagram.",
  },
  {
    id: "capa-de-revista",
    nome: "Capa de revista",
    paraQuem: "Lançamento, edição especial, conteúdo de autoridade.",
    categoria: "Com foto",
    formatos: ["post", "story", "reels"],
    arquetipo: "revista",
    estrutura: "Foto inteira; o nome da marca grande no topo como título da revista; a manchete e duas chamadas de capa embaixo.",
    tipografia: { titulo: "DMSerifDisplay-400", texto: "Montserrat-500", caixaAlta: false },
    cor: "Nome da marca na cor de destaque, chamadas em branco.",
    fundo: "escuro",
    destaque: "cor",
    foto: "inteira",
    fotoOnde: "A peça inteira.",
    fotoPrompt: `${FOTO_EDITORIAL} Magazine cover still life, clean upper area for a masthead.`,
    regrasDeTexto: "Manchete de até 7 palavras e dois itens curtos de chamada.",
    maxPalavras: 7,
    campos: ["itens"],
    inspiracao: "Capas de revistas de negócio (sem nome nem diagramação de revista real).",
  },
  {
    id: "capa-reels-com-foto",
    nome: "Capa de Reels com foto e caixa de título",
    paraQuem: "Quem posta vídeo e quer a grade do perfil organizada.",
    categoria: "Story e Reels",
    formatos: ["reels", "story"],
    arquetipo: "foto-inteira",
    estrutura: "Foto inteira em pé; o título numa caixa sólida da cor da marca, no centro da área segura (que aparece na grade do perfil).",
    tipografia: { titulo: "BebasNeue-400", texto: "Inter-400", caixaAlta: true },
    cor: "Caixa do título na cor de destaque.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "inteira",
    fotoOnde: "A peça inteira, em pé.",
    fotoPrompt: `${FOTO_EDITORIAL} Vertical frame, the subject in the upper half, calm middle area.`,
    regrasDeTexto: "Título de capa com até 6 palavras.",
    maxPalavras: 6,
    campos: [],
    inspiracao: "Capas de Reels padronizadas de criadores de educação financeira.",
  },
  // ── Só texto ──
  {
    id: "quadro-branco-minimalista",
    nome: "Quadro branco minimalista",
    paraQuem: "Opinião, ideia forte, perfil de autoridade que escreve bem.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "frase",
    estrutura: "Fundo branco, frase preta grande alinhada à esquerda, muita margem, um fio curto na cor da marca e o logo pequeno no pé.",
    tipografia: { titulo: "Inter-700", texto: "Inter-400" },
    cor: "Branco e preto; a cor da marca só no fio.",
    fundo: "branco",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Uma frase de até 18 palavras, que se sustenta sozinha.",
    maxPalavras: 18,
    campos: [],
    inspiracao: "Posts de frase em fundo branco de autores de negócio e moldes minimalistas do Canva.",
  },
  {
    id: "frase-fundo-escuro",
    nome: "Frase branca no fundo escuro",
    paraQuem: "Motivação, provocação e reflexão para vendedores e líderes.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "frase",
    estrutura: "Fundo no tom escuro da marca, frase branca centralizada, palavra-chave na cor de destaque; assinatura com o logo embaixo.",
    tipografia: { titulo: "Poppins-700", texto: "Poppins-400" },
    cor: "Fundo escuro da marca, destaque na cor principal.",
    fundo: "escuro",
    destaque: "cor",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase de até 18 palavras; uma palavra-chave.",
    maxPalavras: 18,
    campos: [],
    inspiracao: "Estudo Apify: texto sobre fundo escuro sem rosto foi o post de imagem de maior ganho (84x a mediana) num perfil de palestrante de vendas.",
  },
  {
    id: "frase-fundo-cor",
    nome: "Frase no fundo da cor da marca",
    paraQuem: "Marca que quer ser reconhecida pela cor no feed.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "frase",
    estrutura: "Fundo inteiro na cor de destaque, frase grande no centro, logo no pé.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo na cor principal; letra branca ou escura, a que der mais contraste.",
    fundo: "acento",
    destaque: "sublinhado",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase de até 14 palavras.",
    maxPalavras: 14,
    campos: [],
    inspiracao: "Feeds monocromáticos de marcas de serviço (moldes 'bold quote' do Canva).",
  },
  {
    id: "tipografia-gigante",
    nome: "Tipografia gigante",
    paraQuem: "Impacto, chamada curta, opinião forte.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "tipografia",
    estrutura: "Letra condensada enorme ocupando a peça, em caixa alta; a palavra-chave num bloco da cor da marca, levemente inclinado.",
    tipografia: { titulo: "Anton-400", texto: "Inter-400", caixaAlta: true },
    cor: "Fundo escuro, letra branca, bloco na cor de destaque.",
    fundo: "escuro",
    destaque: "bloco",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Até 6 palavras, de impacto.",
    maxPalavras: 6,
    campos: [],
    inspiracao: "Pôster tipográfico de legenda forte (vídeos de alta retenção), em versão parada.",
  },
  {
    id: "frase-marca-texto",
    nome: "Frase com marca-texto",
    paraQuem: "Educação e explicação: a pessoa lê a parte que importa.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "marca-texto",
    estrutura: "Papel claro, frase escura grande; as palavras-chave grifadas com marca-texto na cor da marca.",
    tipografia: { titulo: "Inter-700", texto: "Inter-400" },
    cor: "Papel claro, grifo na cor de destaque.",
    fundo: "papel",
    destaque: "marca-texto",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase de até 16 palavras com um trecho que merece o grifo.",
    maxPalavras: 16,
    campos: [],
    inspiracao: "Explicadores em vídeo com marca-texto nas palavras e posts de estudo.",
  },
  {
    id: "anotacao-de-caderno",
    nome: "Anotação de caderno",
    paraQuem: "Dica rápida, bastidor de estudo, marca pessoal próxima.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "caderno",
    estrutura: "Folha pautada de caderno, frase escrita à mão, um círculo e um sublinhado de caneta na cor da marca.",
    tipografia: { titulo: "Caveat-700", texto: "Caveat-700" },
    cor: "Papel branco pautado, caneta na cor de destaque.",
    fundo: "branco",
    destaque: "sublinhado",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase de até 16 palavras, como quem anota.",
    maxPalavras: 16,
    campos: [],
    inspiracao: "Posts de 'anotações' de criadores de estudo e moldes de caderno do Figma Community.",
  },
  {
    id: "citacao-aspas-gigantes",
    nome: "Citação com aspas gigantes",
    paraQuem: "Frase de cliente, de livro, de versículo ou do próprio dono.",
    categoria: "Citação",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "citacao",
    estrutura: "Aspas enormes na cor da marca no alto, a citação em serifa itálica, e quem disse embaixo.",
    tipografia: { titulo: "PlayfairDisplay-400i", texto: "Montserrat-500" },
    cor: "Fundo claro, aspas e fio na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Citação de até 22 palavras; a autoria só se estiver no texto do post (nunca inventada).",
    maxPalavras: 22,
    campos: ["autor"],
    inspiracao: "Cartões de citação de perfis de leitura e moldes 'quote' do Canva.",
  },
  {
    id: "citacao-escura-nobre",
    nome: "Citação nobre no escuro",
    paraQuem: "Jurídico, fé, finanças: tom sério e elegante.",
    categoria: "Citação",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "citacao",
    estrutura: "Fundo escuro, citação em serifa clássica centralizada, fio fino na cor da marca e autoria em versalete.",
    tipografia: { titulo: "DMSerifDisplay-400", texto: "Montserrat-500" },
    cor: "Fundo escuro da marca, fio e autoria na cor de destaque.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Citação de até 22 palavras; autoria só se estiver no texto.",
    maxPalavras: 22,
    campos: ["autor"],
    inspiracao: "Cartões de versículo e de máxima jurídica de perfis institucionais.",
  },
  {
    id: "verbete-de-dicionario",
    nome: "Verbete de dicionário",
    paraQuem: "Quem ensina um termo do mercado ou desfaz um mal-entendido.",
    categoria: "Citação",
    formatos: ["post", "carrossel"],
    arquetipo: "verbete",
    estrutura: "O termo grande em serifa, a classe gramatical em itálico, e a definição em texto corrido, como num dicionário.",
    tipografia: { titulo: "PlayfairDisplay-700", texto: "Inter-400" },
    cor: "Papel claro, número da acepção na cor de destaque.",
    fundo: "papel",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título é o termo (1 a 3 palavras); apoio é a definição, até 28 palavras.",
    maxPalavras: 3,
    campos: ["apoio"],
    inspiracao: "Posts de 'significado' de perfis de educação e moldes de dicionário do Canva.",
  },
  // ── Listas e passos ──
  {
    id: "lista-numerada",
    nome: "Lista numerada",
    paraQuem: "Dicas, erros, motivos: o formato que mais segura até o fim.",
    categoria: "Listas e passos",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "lista",
    estrutura: "Título em cima; de 3 a 5 itens com o número grande na cor da marca à esquerda.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo claro, números na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título com até 9 palavras; 3 a 5 itens de até 7 palavras cada.",
    maxPalavras: 9,
    campos: ["itens"],
    inspiracao: "Carrosséis 'top 5' e 'erros que' (os formatos numerados lideram conclusão em 2026).",
  },
  {
    id: "checklist-de-conferencia",
    nome: "Checklist de conferência",
    paraQuem: "Quem ensina a fazer certo: saúde, finanças, documentação.",
    categoria: "Listas e passos",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "checklist",
    estrutura: "Título e uma lista de itens com caixinhas marcadas na cor da marca, em cartão branco sobre o tom claro.",
    tipografia: { titulo: "Poppins-700", texto: "Poppins-400" },
    cor: "Marcas de conferido na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título até 8 palavras; 3 a 5 itens de até 7 palavras.",
    maxPalavras: 8,
    campos: ["itens"],
    inspiracao: "Moldes de checklist do Canva usados por clínicas e contabilidades.",
  },
  {
    id: "passo-a-passo-em-linha",
    nome: "Passo a passo em linha",
    paraQuem: "Processo, método, jornada de compra.",
    categoria: "Listas e passos",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "passos",
    estrutura: "Título e de 3 a 4 passos ligados por uma linha vertical, cada um com um ponto na cor da marca.",
    tipografia: { titulo: "SpaceGrotesk-700", texto: "Inter-400" },
    cor: "Fundo escuro, linha e pontos na cor de destaque.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título até 8 palavras; 3 a 4 passos de até 6 palavras.",
    maxPalavras: 8,
    campos: ["itens"],
    inspiracao: "Linhas do tempo de produto (moldes de processo do Figma Community).",
  },
  // ── Comparação ──
  {
    id: "antes-e-depois",
    nome: "Antes e depois",
    paraQuem: "Transformação: o cliente se vê no 'antes' e quer o 'depois'.",
    categoria: "Comparação",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "dois-lados",
    estrutura: "Peça dividida em dois blocos: 'Antes' em cinza apagado e 'Depois' na cor da marca, cada um com 2 ou 3 frases curtas; título em cima.",
    tipografia: { titulo: "Montserrat-800", texto: "Inter-400" },
    cor: "Antes em cinza; depois na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título até 8 palavras; 2 a 3 frases curtas de cada lado, sem inventar resultado.",
    maxPalavras: 8,
    campos: ["lados"],
    inspiracao: "Carrossel de transformação (antes e depois na primeira lâmina é o formato de maior conversão citado em 2026).",
  },
  {
    id: "isso-ou-aquilo",
    nome: "Evite e faça",
    paraQuem: "Corrigir hábito errado com a alternativa certa.",
    categoria: "Comparação",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "dois-lados",
    estrutura: "Duas colunas: à esquerda 'Evite' com X, à direita 'Faça' com visto na cor da marca.",
    tipografia: { titulo: "Poppins-700", texto: "Poppins-400" },
    cor: "X em cinza escuro, visto e cabeçalho na cor de destaque.",
    fundo: "branco",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título até 8 palavras; 2 a 3 itens por coluna.",
    maxPalavras: 8,
    campos: ["lados"],
    inspiracao: "Posts 'do and don't' de perfis de educação.",
  },
  {
    id: "mito-ou-verdade",
    nome: "Mito ou verdade",
    paraQuem: "Desfazer crença comum do nicho.",
    categoria: "Comparação",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "dois-lados",
    estrutura: "Em cima o mito riscado, embaixo a verdade em destaque, cada um com selo.",
    tipografia: { titulo: "ArchivoBlack-400", texto: "Inter-400" },
    cor: "Selo de mito em cinza, selo de verdade na cor de destaque.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título curto; um mito e uma verdade de até 14 palavras cada.",
    maxPalavras: 6,
    campos: ["lados"],
    inspiracao: "Séries de 'mito ou verdade' de perfis de saúde e finanças.",
  },
  // ── Dados ──
  {
    id: "dado-gigante",
    nome: "Dado gigante",
    paraQuem: "Quem tem número para mostrar: resultado, pesquisa, prazo.",
    categoria: "Dados",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "dado",
    estrutura: "O número enorme na cor da marca, uma frase explicando embaixo e a linha da fonte.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700" },
    cor: "Fundo escuro, número na cor de destaque.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Só quando o post tem um número de verdade; nunca inventado. Frase de até 14 palavras.",
    maxPalavras: 14,
    campos: ["numero"],
    inspiracao: "Cartões de 'fatos e números' de perfis de dados e de notícias.",
  },
  {
    id: "dado-com-barra",
    nome: "Dado com barra de progresso",
    paraQuem: "Percentual que precisa ser visto, não só lido.",
    categoria: "Dados",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "dado-barra",
    estrutura: "O percentual grande, uma barra preenchida na cor da marca até o valor, e a frase explicando.",
    tipografia: { titulo: "SpaceGrotesk-700", texto: "Inter-400" },
    cor: "Fundo claro, barra na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Só com percentual que está no post. Frase de até 14 palavras.",
    maxPalavras: 14,
    campos: ["numero"],
    inspiracao: "Infográficos de relatório B2B (moldes de estatística do Canva).",
  },
  // ── Prints e conversas ──
  {
    id: "print-de-post-de-texto",
    nome: "Print de post de texto",
    paraQuem: "Opinião curta que parece conversa de rede social.",
    categoria: "Prints e conversas",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "print-post",
    estrutura: "Um cartão branco de post de texto, com o logo redondo, o nome e o @ da marca, o texto e os contadores; sobre a cor da marca.",
    tipografia: { titulo: "Inter-400", texto: "Inter-700" },
    cor: "Fundo na cor de destaque, cartão branco.",
    fundo: "acento",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Texto de até 30 palavras, em primeira pessoa, como quem posta.",
    maxPalavras: 30,
    campos: [],
    inspiracao: "Prints de post de texto viral reaproveitados no Instagram (sem a marca de nenhuma rede).",
  },
  {
    id: "print-de-conversa",
    nome: "Print de conversa",
    paraQuem: "Dúvida frequente de cliente respondida pela marca.",
    categoria: "Prints e conversas",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "print-conversa",
    estrutura: "Uma conversa de mensagens: o balão cinza do cliente perguntando e o balão da cor da marca respondendo.",
    tipografia: { titulo: "Inter-400", texto: "Inter-700" },
    cor: "Fundo claro, balão de resposta na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Pergunta de até 14 palavras (título) e resposta de até 24 (apoio).",
    maxPalavras: 14,
    campos: ["apoio"],
    inspiracao: "Prints de atendimento usados por lojas e consultórios para responder dúvida comum.",
  },
  {
    id: "depoimento-com-estrelas",
    nome: "Depoimento com estrelas",
    paraQuem: "Prova social: o que o cliente disse.",
    categoria: "Venda e prova",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "depoimento",
    estrutura: "Cinco estrelas na cor da marca, o depoimento entre aspas e a identificação do cliente (só se estiver no post).",
    tipografia: { titulo: "Poppins-400", texto: "Poppins-700" },
    cor: "Cartão branco sobre o tom claro, estrelas na cor de destaque.",
    fundo: "claro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Só depoimento real que está no texto; até 28 palavras. Sem nome inventado.",
    maxPalavras: 28,
    campos: ["autor"],
    inspiracao: "Cartões de avaliação de lojas e prestadores de serviço.",
  },
  {
    id: "oferta-com-chamada",
    nome: "Oferta com botão de chamada",
    paraQuem: "Convite para agendar, comprar ou se inscrever.",
    categoria: "Venda e prova",
    formatos: ["post", "story"],
    arquetipo: "oferta",
    estrutura: "Fundo escuro, manchete da oferta, uma linha de apoio e um botão na cor da marca com a chamada.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500", caixaAlta: false },
    cor: "Botão na cor de destaque, o resto escuro e branco.",
    fundo: "escuro",
    destaque: "cor",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Manchete até 8 palavras, apoio até 14, chamada de 2 a 4 palavras. Sem preço que não esteja no post.",
    maxPalavras: 8,
    campos: ["apoio", "chamada"],
    inspiracao: "Peças de convite para agenda de consultoria e matrícula.",
  },
  // ── Story e Reels ──
  {
    id: "caixa-de-pergunta",
    nome: "Caixa de pergunta",
    paraQuem: "Puxar conversa no story e colher dúvidas.",
    categoria: "Story e Reels",
    formatos: ["story"],
    arquetipo: "caixa-pergunta",
    estrutura: "Fundo na cor da marca, uma caixa branca de pergunta no centro com o título no alto em faixa escura e o campo de resposta.",
    tipografia: { titulo: "Poppins-700", texto: "Poppins-400" },
    cor: "Fundo na cor de destaque, caixa branca.",
    fundo: "acento",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Uma pergunta de até 10 palavras.",
    maxPalavras: 10,
    campos: [],
    inspiracao: "Caixinhas de pergunta dos stories (desenho próprio, sem o adesivo da rede).",
  },
  {
    id: "enquete-de-story",
    nome: "Enquete de duas opções",
    paraQuem: "Pesquisa rápida com o público.",
    categoria: "Story e Reels",
    formatos: ["story", "post"],
    arquetipo: "enquete",
    estrutura: "A pergunta grande e duas barras de opção, uma na cor da marca e outra em branco.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo escuro, opção destacada na cor principal.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Pergunta de até 10 palavras e duas opções de até 4 palavras.",
    maxPalavras: 10,
    campos: ["opcoes"],
    inspiracao: "Enquetes de story de perfis de comunidade.",
  },
  {
    id: "capa-reels-tipografica",
    nome: "Capa de Reels tipográfica",
    paraQuem: "Grade de perfil limpa e reconhecível pela cor.",
    categoria: "Story e Reels",
    formatos: ["reels", "story"],
    arquetipo: "capa-tipografica",
    estrutura: "Fundo inteiro na cor da marca, o título grande no centro (área que aparece na grade) e o logo no pé.",
    tipografia: { titulo: "ArchivoBlack-400", texto: "Inter-400", caixaAlta: true },
    cor: "Fundo na cor principal, letra branca ou escura pelo contraste.",
    fundo: "acento",
    destaque: "nenhum",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título com até 6 palavras.",
    maxPalavras: 6,
    campos: [],
    inspiracao: "Capas de Reels em série de perfis educativos.",
  },
  {
    id: "capa-de-carrossel-com-seta",
    nome: "Capa de carrossel com seta",
    paraQuem: "A primeira lâmina que faz a pessoa arrastar.",
    categoria: "Listas e passos",
    formatos: ["carrossel", "post"],
    arquetipo: "capa-carrossel",
    estrutura: "Manchete grande, uma linha de apoio, e a indicação 'arraste' com seta e os pontinhos das lâminas no pé.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo claro, seta e ponto ativo na cor de destaque, palavra-chave grifada.",
    fundo: "claro",
    destaque: "marca-texto",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Manchete de até 9 palavras que promete o que vem nas lâminas.",
    maxPalavras: 9,
    campos: ["apoio"],
    inspiracao: "Capas de carrossel de perfis de marketing com indicação de arrastar.",
  },

  // ── Mais modelos com foto (05/10, pedido do Bruno: "mais modelos, principalmente com foto") ──
  // Três linguagens que rodam bem em 2026, sem copiar marca nem pessoa: a do
  // apresentador em cores com a palavra num bloco sólido; a do preto e branco
  // com uma palavra na cor; e a da capa escura com objeto, mapa e "arraste".
  // Todos desenhados em lib/modelos-de-arte/desenho-com-foto.tsx, obedecendo a
  // letra e os papéis (fundo, título, destaque) que o cliente aprovou.
  {
    id: "voce-com-palavra-em-bloco",
    nome: "Você com a palavra em bloco",
    paraQuem: "Apresentador, palestrante, mentor: a sua foto em cores e a manchete com a palavra-chave num bloco sólido.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "retrato-bloco",
    estrutura: "A sua foto em pé ocupando a peça, escurecendo para a cor de fundo embaixo; a manchete grande em caixa alta condensada na parte de baixo, a palavra-chave dentro de um retângulo sólido na cor de destaque; o logo no alto.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: true },
    cor: "O bloco da palavra-chave na cor de destaque; o degradê de baixo na cor de fundo; o título na cor de título.",
    fundo: "escuro",
    destaque: "bloco",
    foto: "recorte",
    fotoOnde: "A peça inteira: a sua foto da biblioteca de materiais, em cores, com você recortado na frente do degradê.",
    fotoPrompt: `${FOTO_EDITORIAL} Vertical portrait framing, calm lower third for a headline.`,
    regrasDeTexto: "Manchete de até 8 palavras, afirmativa e direta; a palavra mais forte vai para o bloco.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Perfis de mentores de alta performance: foto vertical em cores, título branco condensado e uma palavra num retângulo vermelho.",
  },
  {
    id: "titulo-em-faixas-solidas",
    nome: "Título em faixas sólidas",
    paraQuem: "Quem quer a frase inteira saltando da foto, linha por linha, em blocos de cor.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "retrato-faixas",
    estrutura: "Foto inteira; a manchete em caixa alta, cada linha dentro de uma faixa sólida na cor de destaque, empilhadas na parte de baixo; o logo no alto.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: true },
    cor: "As faixas na cor de destaque, com a letra que contrasta com ela; a foto segue natural.",
    fundo: "escuro",
    destaque: "bloco",
    foto: "inteira",
    fotoOnde: "A peça inteira, de borda a borda.",
    fotoPrompt: `${FOTO_EDITORIAL} Vertical frame, strong single subject in the upper half, calm lower third for stacked headline bars.`,
    regrasDeTexto: "Manchete de até 7 palavras, em linhas curtas (de 1 a 3 palavras por linha).",
    maxPalavras: 7,
    campos: [],
    inspiracao: "A variação do mesmo perfil de mentoria com o título inteiro dentro de um bloco vermelho sólido.",
  },
  {
    id: "foto-escura-texto-no-centro",
    nome: "Foto escura com texto no centro",
    paraQuem: "Reflexão, frase de impacto, momento sério: a foto quase apagada e a frase no meio.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "foto-escurecida",
    estrutura: "Foto inteira sob um véu da cor de fundo; a frase centralizada em caixa alta na cor de título, entre dois fios finos na cor de destaque; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "Inter-400", caixaAlta: true },
    cor: "O véu na cor de fundo (quase opaco), o texto na cor de título, os fios na cor de destaque.",
    fundo: "escuro",
    destaque: "cor",
    foto: "inteira",
    fotoOnde: "A peça inteira, escurecida.",
    fotoPrompt: `${FOTO_EDITORIAL} Moody low-key scene, dark tones, lots of negative space in the middle.`,
    regrasDeTexto: "Frase de até 12 palavras, em tom de reflexão; sem número.",
    maxPalavras: 12,
    campos: [],
    inspiracao: "A variação de foto escura com texto branco centralizado dos perfis de mentoria.",
  },
  {
    id: "frase-grande-e-complemento",
    nome: "Frase grande e complemento",
    paraQuem: "Opinião curta e certeira: a frase grande e uma linha menor embaixo, sem foto.",
    categoria: "Só texto",
    formatos: ["post", "carrossel"],
    arquetipo: "frase-dupla",
    estrutura: "Fundo na cor de fundo, um quadradinho na cor de destaque no alto, a frase grande na cor de título à esquerda e, abaixo, uma linha menor e mais fraca; o logo no pé.",
    tipografia: { titulo: "Inter-700", texto: "Inter-400" },
    cor: "Só a cor de fundo e a de título; o destaque aparece no quadradinho e na palavra-chave.",
    fundo: "claro",
    destaque: "cor",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase principal de até 12 palavras e um complemento de até 10, que fecha a ideia (um conselho, um 'tenha isso em mente').",
    maxPalavras: 12,
    campos: ["apoio"],
    inspiracao: "Posts só texto em fundo branco com frase em cinza escuro e uma linha menor embaixo.",
  },
  {
    id: "preto-e-branco-com-uma-palavra",
    nome: "Preto e branco com uma palavra",
    paraQuem: "Autoridade e sobriedade: a sua foto sem cor e uma única palavra na cor da marca.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story", "reels"],
    arquetipo: "pb-palavra",
    estrutura: "A foto inteira em preto e branco; a palavra-chave gigante na cor de destaque passa atrás de você (recortado); o resto da frase pequeno embaixo; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: true },
    cor: "Só a palavra-chave leva cor (a de destaque); a foto é preto e branco por construção.",
    fundo: "escuro",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "A peça inteira: a sua foto da biblioteca, em preto e branco feito em código, com você na frente da palavra.",
    fotoPrompt: `${FOTO_EDITORIAL} High contrast portrait lighting, clean background, will be converted to black and white.`,
    regrasDeTexto: "Frase de até 5 palavras; a palavra mais forte vira a palavra gigante.",
    maxPalavras: 5,
    campos: [],
    inspiracao: "Perfis de palestrantes com foto preto e branco e uma só palavra em vermelho sobreposta.",
    fotoPretoEBranco: true,
  },
  {
    id: "palavra-repetida-ao-fundo",
    nome: "Palavra repetida ao fundo",
    paraQuem: "Só texto com textura: a palavra-chave repetida ao fundo, quase invisível, e a frase por cima.",
    categoria: "Só texto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "textura-tipografica",
    estrutura: "Fundo na cor de fundo; a palavra-chave repetida em fileiras, num tom um pouco mais claro que o fundo, como textura; a frase na cor de título por cima, com a palavra-chave na cor de destaque; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "Inter-400", caixaAlta: true },
    cor: "A textura é o fundo um tom mais claro; a frase na cor de título; a palavra-chave na cor de destaque.",
    fundo: "escuro",
    destaque: "cor",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Frase de até 10 palavras com uma palavra forte, que é a repetida ao fundo.",
    maxPalavras: 10,
    campos: [],
    inspiracao: "Posts só texto com fundo preto e a palavra-chave repetida em cinza escuro como textura tipográfica.",
  },
  {
    id: "foto-de-palco-sem-texto",
    nome: "Foto de palco sem texto",
    paraQuem: "Evento, palestra, bastidor forte: a foto fala sozinha; a frase vai na legenda.",
    categoria: "Com foto",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "foto-pura",
    estrutura: "A foto inteira, sem nenhum texto por cima; só um fio curto na cor de destaque e o logo pequeno no canto de baixo.",
    tipografia: { titulo: "Inter-700", texto: "Inter-400" },
    cor: "Só o fio na cor de destaque; a foto fica como é.",
    fundo: "escuro",
    destaque: "nenhum",
    foto: "inteira",
    fotoOnde: "A peça inteira, sem texto.",
    fotoPrompt: `${FOTO_EDITORIAL} Wide stage or event atmosphere, dramatic lighting, the scene carries the message by itself.`,
    regrasDeTexto: "Nenhum texto na arte: a frase do post vai para a legenda.",
    maxPalavras: 0,
    campos: [],
    inspiracao: "Fotos de palco e evento publicadas inteiras, sem texto, por perfis de palestrantes.",
  },
  {
    id: "capa-escura-com-objeto",
    nome: "Capa escura com objeto",
    paraQuem: "Produto, prêmio, livro, lançamento: a capa de carrossel que vende com o objeto em cena.",
    categoria: "Venda e prova",
    formatos: ["carrossel", "post"],
    arquetipo: "capa-objetos",
    estrutura: "Fundo escuro na cor de fundo; o título em duas cores (título e destaque) no alto; a foto do objeto num círculo grande com um anel na cor de destaque; na capa de carrossel, o selo 'arraste para o lado' com seta.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo na cor de fundo, título na cor de título, palavra-chave, anel e seta na cor de destaque.",
    fundo: "escuro",
    destaque: "cor",
    foto: "moldura",
    fotoOnde: "Num círculo grande, no canto de baixo à direita.",
    fotoPrompt: `${FOTO_EDITORIAL} Product or object still life, centered subject, dark neutral backdrop, square framing.`,
    regrasDeTexto: "Título de até 9 palavras que promete o que vem nas lâminas; a palavra-chave leva a cor.",
    maxPalavras: 9,
    campos: [],
    inspiracao: "Capas de carrossel escuras de perfis de investimento com troféus, livros e produto em cena e título em duas cores.",
  },
  {
    id: "voce-sobre-o-mapa",
    nome: "Você sobre o mapa",
    paraQuem: "Alcance, mercado, visão global: você recortado sobre um mapa-múndi pontilhado.",
    categoria: "Com foto",
    formatos: ["carrossel", "post", "story"],
    arquetipo: "mapa-pontilhado",
    estrutura: "Fundo na cor de fundo com um mapa-múndi pontilhado num tom discreto; o título em duas cores à esquerda, no alto; você recortado à direita, embaixo; na capa de carrossel, o selo 'arraste para o lado' com seta na cor de destaque.",
    tipografia: { titulo: "Montserrat-800", texto: "Montserrat-500" },
    cor: "Fundo na cor de fundo; o mapa um tom acima do fundo; título na cor de título; palavra-chave, selo e seta na cor de destaque.",
    fundo: "escuro",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "Você recortado da sua foto da biblioteca de materiais, à direita; sem foto recortada, a foto entra num quadro arredondado.",
    fotoPrompt: `${FOTO_EDITORIAL} Vertical portrait, person centered, plain backdrop for easy cut-out.`,
    regrasDeTexto: "Título de até 8 palavras; a palavra-chave leva a cor de destaque.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Capas de carrossel com o apresentador recortado sobre mapa-múndi pontilhado e selo de arrastar.",
  },
  {
    id: "foto-pb-com-tira-de-papel",
    nome: "Foto preto e branco com tira de papel",
    paraQuem: "Editorial e artesanal: foto sem cor, a frase numa tira de papel colada e a palavra-chave em pincel.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "papel-pb",
    estrutura: "A foto inteira em preto e branco; uma tira de papel branco, levemente torta e presa com fita na cor de destaque, com a frase em letra escura e a palavra-chave em pincel na cor de destaque; o logo no pé.",
    tipografia: { titulo: "ArchivoBlack-400", texto: "PermanentMarker-400", caixaAlta: true },
    cor: "A foto sem cor; só a fita e a palavra em pincel levam a cor de destaque.",
    fundo: "escuro",
    destaque: "marca-texto",
    foto: "inteira",
    fotoOnde: "A peça inteira, em preto e branco feito em código.",
    fotoPrompt: `${FOTO_EDITORIAL} Strong textures and light, documentary feel, will be converted to black and white.`,
    regrasDeTexto: "Frase de até 8 palavras; a palavra mais forte sai em pincel.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Colagens editoriais com foto preto e branco e tira de papel; o 'papel rasgado como contraste' que o Bruno pediu no Fé & Gestão.",
    fotoPretoEBranco: true,
  },

  // ── Vox / colagem editorial (05/10) ──
  // O Bruno não achou o estilo Vox no book. A régua é o feed dele: papel
  // cinza-claro com textura, título condensado enorme com uma palavra no
  // destaque, foto preto e branco em meio-tom recortada, faixa de papel
  // rasgado no destaque, infográfico em papel com ícones a traço; e a colagem
  // Vox clássica (jornal amarelado, marca-texto, setas tracejadas, círculo à
  // mão, carimbo, rosto em pedaços de jornal, selo com a marca). Papel, jornal
  // e meio-tom são desenhados em código (lib/modelos-de-arte/desenho-vox.tsx).
  {
    id: "papel-com-titulo-e-faixa-rasgada",
    prompt: PROMPTS_VOX["papel-com-titulo-e-faixa-rasgada"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/papel-com-titulo-e-faixa-rasgada.jpg",
    nome: "Papel com título e faixa rasgada",
    paraQuem: "O post de opinião do feed: título enorme, você em preto e branco e uma faixa de papel rasgado na cor da marca.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-faixa",
    estrutura: "Papel cinza-claro com textura; o título em condensada, muito grande, com UMA palavra na cor de destaque; você recortado em preto e branco embaixo, com uma faixa de papel rasgado na cor de destaque atravessando; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: false },
    cor: "Papel cinza fixo; o título na cor de título (ou preto, se ela não ler no papel); a palavra-chave e a faixa na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "Você recortado da sua foto da biblioteca, em preto e branco feito em código; sem foto recortada, a foto entra num papel rasgado.",
    fotoPrompt: `${FOTO_EDITORIAL} Expressive portrait, plain backdrop for easy cut-out, will be converted to black and white.`,
    regrasDeTexto: "Título de até 9 palavras, de opinião, com uma palavra forte para a cor.",
    maxPalavras: 9,
    campos: [],
    inspiracao: "Os posts do próprio Bruno (boca tapada com papel rasgado) e a colagem editorial Vox.",
    fotoPretoEBranco: true,
  },
  {
    id: "papel-com-foto-rasgada",
    prompt: PROMPTS_VOX["papel-com-foto-rasgada"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/papel-com-foto-rasgada.jpg",
    nome: "Papel com foto rasgada e destaque",
    paraQuem: "Mostrar um dado, uma tela, um detalhe: a foto num papel rasgado, em meio-tom, com um ponto marcado.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-foto-rasgada",
    estrutura: "Papel cinza com textura; o título grande no alto com a palavra-chave na cor de destaque; embaixo, a foto em preto e branco com trama de meio-tom, colada num pedaço de papel rasgado e preso com fita; um retângulo na cor de destaque marca um ponto da foto.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: false },
    cor: "Papel fixo; título na cor de título; palavra-chave, fita e retângulo na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "topo",
    fotoOnde: "Na metade de baixo, num pedaço de papel rasgado, em preto e branco.",
    fotoPrompt: `${FOTO_EDITORIAL} Close detail of a document, screen, object or workspace, flat and graphic, will be converted to black and white.`,
    regrasDeTexto: "Título de até 9 palavras; uma palavra forte para a cor.",
    maxPalavras: 9,
    campos: [],
    inspiracao: "A planilha rasgada dos posts do Bruno.",
    fotoPretoEBranco: true,
  },
  {
    id: "jornal-com-marca-texto",
    prompt: PROMPTS_VOX["jornal-com-marca-texto"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/jornal-com-marca-texto.jpg",
    nome: "Jornal com marca-texto",
    paraQuem: "A colagem Vox clássica: jornal antigo, frase grifada, você recortado e o selo da marca.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-jornal",
    estrutura: "Fundo de jornal amarelado (colunas desenhadas, sem texto legível); o título grande com a palavra-chave grifada na cor de destaque; você recortado em preto e branco à direita; uma seta tracejada ligando o título a você; o selo redondo com a marca no pé.",
    tipografia: { titulo: "PlayfairDisplay-700", texto: "Inter-400", caixaAlta: false },
    cor: "Jornal fixo; o grifo, a seta e o selo na cor de destaque (o amarelo Vox só se a marca não tiver destaque).",
    fundo: "papel",
    destaque: "marca-texto",
    foto: "recorte",
    fotoOnde: "Você recortado da sua foto, à direita, em preto e branco; sem recorte, a foto entra num papel rasgado.",
    fotoPrompt: `${FOTO_EDITORIAL} Portrait with a clear gesture, plain backdrop for easy cut-out, will be converted to black and white.`,
    regrasDeTexto: "Título de até 10 palavras; a palavra grifada é a mais forte.",
    maxPalavras: 10,
    campos: [],
    inspiracao: "Colagens de jornal do estilo Vox, com marca-texto amarelo e selo.",
    fotoPretoEBranco: true,
  },
  {
    id: "antes-e-depois-em-papel",
    prompt: PROMPTS_VOX["antes-e-depois-em-papel"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/antes-e-depois-em-papel.jpg",
    nome: "Antes e depois em papel",
    paraQuem: "Transformação, resultado, comparação: a mesma foto dividida ao meio, com a barra da marca.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-antes-depois",
    estrutura: "A foto inteira em preto e branco; a metade direita em trama de meio-tom; uma barra vertical na cor de destaque no meio; 'Antes' e 'Depois' em itálico de um lado e de outro; o título numa tira de papel rasgado no alto; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "PlayfairDisplay-400i", caixaAlta: false },
    cor: "A barra e a palavra-chave na cor de destaque; a tira de papel fixa com o título na cor de título.",
    fundo: "papel",
    destaque: "cor",
    foto: "inteira",
    fotoOnde: "A peça inteira, em preto e branco, dividida ao meio.",
    fotoPrompt: `${FOTO_EDITORIAL} Strong centered subject that reads well split in two halves, will be converted to black and white.`,
    regrasDeTexto: "Título de até 8 palavras sobre a mudança; os rótulos 'Antes' e 'Depois' são fixos.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "O 'before / after' da colagem Vox, com a barra amarela.",
    fotoPretoEBranco: true,
  },
  {
    id: "rosto-em-pedacos-de-jornal",
    prompt: PROMPTS_VOX["rosto-em-pedacos-de-jornal"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/rosto-em-pedacos-de-jornal.jpg",
    nome: "Rosto em pedaços de jornal",
    paraQuem: "Capa ousada: blocos de papel nas cores da marca, você em preto e branco e recortes de jornal colados.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-rosto",
    estrutura: "Papel cinza; dois blocos de papel rasgado, um na cor de destaque e outro na cor de fundo; você recortado em preto e branco no centro; pedaços de jornal colados por cima; o título no alto com a palavra-chave na cor de destaque.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: true },
    cor: "Blocos na cor de destaque e na cor de fundo; título na cor de título; palavra-chave na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "Você recortado da sua foto, no centro, em preto e branco; sem recorte, a foto entra num papel rasgado.",
    fotoPrompt: `${FOTO_EDITORIAL} Frontal portrait, plain backdrop for easy cut-out, will be converted to black and white.`,
    regrasDeTexto: "Título de até 6 palavras, em caixa alta.",
    maxPalavras: 6,
    campos: [],
    inspiracao: "O rosto recortado em pedaços de jornal das animações Vox.",
    fotoPretoEBranco: true,
  },
  {
    id: "capa-de-carrossel-em-papel",
    prompt: PROMPTS_VOX["capa-de-carrossel-em-papel"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/capa-de-carrossel-em-papel.jpg",
    nome: "Capa de carrossel em papel",
    paraQuem: "A primeira lâmina da série em papel: título enorme, selo circulado à mão e o 'arraste' numa tira de papel.",
    categoria: "Colagem e papel",
    formatos: ["carrossel", "post", "story"],
    arquetipo: "vox-capa",
    estrutura: "Papel cinza com textura; o título enorme com a palavra-chave na cor de destaque; o selo redondo da marca com um círculo feito à mão em volta; você recortado pequeno à direita; na capa de carrossel, a seta tracejada e 'arraste para o lado' numa tira de papel rasgado.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: false },
    cor: "Papel fixo; título na cor de título; palavra-chave, selo e seta na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "recorte",
    fotoOnde: "Você recortado, pequeno, à direita; sem foto recortada, a capa sai só com o papel e o selo.",
    fotoPrompt: `${FOTO_EDITORIAL} Portrait, plain backdrop for easy cut-out, will be converted to black and white.`,
    regrasDeTexto: "Título de até 8 palavras que promete o que vem nas lâminas.",
    maxPalavras: 8,
    campos: [],
    inspiracao: "Capas de carrossel em papel com selo circulado e seta, no estilo Vox.",
    fotoPretoEBranco: true,
  },
  {
    id: "infografico-em-papel",
    prompt: PROMPTS_VOX["infografico-em-papel"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/infografico-em-papel.jpg",
    nome: "Infográfico em papel com ícones",
    paraQuem: "Explicar em 3 ou 4 pontos, com ícones desenhados a traço, no papel do feed.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-infografico",
    estrutura: "Papel cinza com textura; o título no alto com a palavra-chave na cor de destaque; de 3 a 4 itens, cada um com um ícone a traço num círculo de papel, o número na cor de destaque e o texto; uma linha tracejada liga os itens; o logo no pé.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: false },
    cor: "Papel fixo; título e ícones na cor de título; números e linha na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "nenhuma",
    fotoOnde: "Sem foto.",
    regrasDeTexto: "Título de até 8 palavras e de 3 a 4 itens de até 8 palavras cada.",
    maxPalavras: 8,
    campos: ["itens"],
    inspiracao: "Os infográficos editoriais em papel do feed do Bruno.",
  },
  {
    id: "frase-com-carimbo-e-foto",
    prompt: PROMPTS_VOX["frase-com-carimbo-e-foto"],
    // Prévia gerada uma vez pelo modelo de imagem (05/10, paleta do Fé & Gestão, US$ 0,06).
    previaGerada: "https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/book-modelos/previas-vox/frase-com-carimbo-e-foto.jpg",
    nome: "Frase com carimbo e foto colada",
    paraQuem: "Opinião com assinatura: o título, o carimbo torto da marca e uma foto pequena colada com fita.",
    categoria: "Colagem e papel",
    formatos: ["post", "carrossel", "story"],
    arquetipo: "vox-carimbo",
    estrutura: "Papel cinza com textura; o título grande com a palavra-chave na cor de destaque; embaixo, uma foto pequena em preto e branco com meio-tom, torta, numa moldura de papel presa com fita; ao lado, o carimbo com o nome da marca na cor de destaque.",
    tipografia: { titulo: "Anton-400", texto: "Inter-700", caixaAlta: false },
    cor: "Papel fixo; título na cor de título; palavra-chave, fita e carimbo na cor de destaque.",
    fundo: "papel",
    destaque: "cor",
    foto: "moldura",
    fotoOnde: "Numa moldura de papel pequena, à esquerda e embaixo, em preto e branco.",
    fotoPrompt: `${FOTO_EDITORIAL} Simple subject, square framing, will be converted to black and white.`,
    regrasDeTexto: "Título de até 9 palavras; uma palavra forte para a cor.",
    maxPalavras: 9,
    campos: [],
    inspiracao: "O carimbo e a foto colada da colagem Vox.",
    fotoPretoEBranco: true,
  },
];

export function modeloPorId(id: string | null | undefined): ModeloDeArte | undefined {
  return MODELOS_DE_ARTE.find((m) => m.id === id);
}

export const CATEGORIAS_DOS_MODELOS = [
  "Com foto",
  "Só texto",
  "Citação",
  "Listas e passos",
  "Comparação",
  "Dados",
  "Prints e conversas",
  "Colagem e papel",
  "Venda e prova",
  "Story e Reels",
];

export const ROTULO_DO_FORMATO: Record<FormatoDoModelo, string> = {
  post: "Post único",
  carrossel: "Carrossel",
  story: "Story",
  reels: "Capa de Reels",
};

/** O tamanho em pixel de cada formato na prévia. */
export const TAMANHO_DO_FORMATO: Record<FormatoDoModelo, { largura: number; altura: number }> = {
  post: { largura: 1080, altura: 1350 },
  carrossel: { largura: 1080, altura: 1350 },
  story: { largura: 1080, altura: 1920 },
  reels: { largura: 1080, altura: 1920 },
};

/** O formato de uma peça pelo tamanho: em pé alongado é story ou Reels. */
export function formatoPeloTamanho(largura: number, altura: number, carrossel = false): FormatoDoModelo {
  if (altura / largura >= 1.6) return "story";
  return carrossel ? "carrossel" : "post";
}

/** O modelo serve a esta frase? O dado só existe com número de verdade. */
export function modeloServe(m: ModeloDeArte, textoComNumeros: string): boolean {
  if (m.arquetipo === "dado") return /\d/.test(textoComNumeros);
  if (m.arquetipo === "dado-barra") return /\d+\s*%/.test(textoComNumeros);
  return true;
}

function hash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * O modelo DESTA peça, entre os que o cliente escolheu: só os que servem ao
 * formato e à frase, e entre eles um pela frase (a retentativa repete, peças
 * diferentes variam). Story aceita também modelo de Reels e vice-versa. Null
 * quando nenhum escolhido serve: a peça segue a composição de antes.
 */
export function modeloDaPeca(ids: string[], formato: FormatoDoModelo, frase: string, contexto = ""): ModeloDeArte | null {
  const escolhidos = ids.map((id) => modeloPorId(id)).filter((m): m is ModeloDeArte => Boolean(m));
  if (!escolhidos.length) return null;
  const aceita = (m: ModeloDeArte) =>
    m.formatos.includes(formato) || (formato === "story" && m.formatos.includes("reels")) || (formato === "carrossel" && m.formatos.includes("post"));
  const doFormato = escolhidos.filter(aceita);
  const servem = doFormato.filter((m) => modeloServe(m, `${frase} ${contexto}`));
  const lista = servem.length ? servem : [];
  if (!lista.length) return null;
  return lista[hash(`modelo:${frase}`) % lista.length];
}
