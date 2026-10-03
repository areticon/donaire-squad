import type { FonteId } from "@/lib/modelos-de-arte/fontes";

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
  | "verbete";

/** Os textos que um modelo pode pedir além do título. */
export type CampoDoModelo = "apoio" | "itens" | "numero" | "lados" | "autor" | "opcoes" | "chamada";

export type FundoDoModelo = "claro" | "escuro" | "acento" | "branco" | "papel";
export type DestaqueDoModelo = "cor" | "bloco" | "marca-texto" | "sublinhado" | "nenhum";
export type FotoDoModelo = "nenhuma" | "topo" | "inteira" | "lado" | "moldura" | "colagem";

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
