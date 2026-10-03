import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * DOCUMENTÁRIO DE STREAMING (03/10/2026): a linguagem dos grandes
 * documentários da Netflix e da HBO e a escola Ken Burns.
 *
 * Ainda não está no catálogo com este id (o mais perto é "natgeo", que tem a
 * referência própria); o Bruno pediu como estilo à parte. As regras vêm de
 * Ken Burns (o plano que "segura mais uma batida", a foto tratada como plano
 * de cinema, a pergunta embutida na resposta), dos guias de tarja de
 * documentário (The Social Dilemma, Becoming) e da Filmmaker Magazine sobre
 * a estrutura das séries de streaming.
 */
export const DOCUMENTARIO: ReferenciaDeEstilo = {
  id: "documentario",
  nome: "Documentário de streaming",
  inspiracao: "grandes documentários da Netflix e de Ken Burns",
  essencia:
    "Cinema que respira. A pessoa vira ENTREVISTADA: enquadrada fora do centro, olhando para fora da câmera, fundo escuro com luz lateral suave e profundidade de campo curta. A história é contada em capítulos, com a voz dela costurando planos de detalhe, fotos de arquivo que ganham movimento lento e lugares filmados de longe. Nada pisca, nada pula: o corte acontece no fim do pensamento, a trilha cresce por baixo e o silêncio também é edição. Os grafismos são poucos, finos e sóbrios, e somem antes de virar assunto.",
  estrutura: {
    abre:
      "Abertura fria (cold open): 20 a 40 s de um momento forte do meio da história, só a voz sobre imagens lentas e uma frase que fica no ar; corte para preto, a trilha sobe e entra o título do vídeo em letras finas espaçadas sobre um plano largo. Só então a primeira entrevista, com a tarja de nome.",
    avanca:
      "Em capítulos de 1,5 a 4 min, cada um aberto por um título de capítulo sobre preto ou plano largo. Dentro do capítulo: entrevista, voz sobre arquivo e detalhe, volta à entrevista na frase de emoção. A informação nova chega por pergunta e resposta. No fim de cada capítulo, uma revelação ou dúvida que puxa o seguinte.",
    fecha:
      "O plano mais largo do vídeo (lugar, horizonte, a pessoa de costas), uma última frase da entrevista sobre o que mudou, a trilha resolve, fade para preto e uma cartela de texto curta (o que aconteceu depois) em letras finas. Créditos simples.",
  },
  ritmo: {
    cenaSeg: [4, 12],
    cortesPorMinuto: [5, 12],
    zoom:
      "Nunca punch. Aproximação lenta de 100% para 104% ao longo da entrevista; Ken Burns em toda foto (2% a 6% de zoom em 5 a 8 s, ou deslize de um rosto a outro); câmera em deslize lento nos planos de lugar.",
    observacoes:
      "Segurar o plano uma batida a mais depois da frase de emoção (1 a 2 s de silêncio). A entrevista nunca fica mais de 25 s sem uma imagem de apoio. Fades para preto só entre capítulos.",
  },
  tipografia: {
    familias: [
      { papel: "título do vídeo e capítulos", familia: "Cormorant Garamond", pesos: "500, caixa alta espaçada", origem: "google-fonts", alternativa: "PT Serif local" },
      { papel: "tarja de nome e cartelas de texto", familia: "Inter", pesos: "500 (nome) e 300 (cargo)", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "data e lugar", familia: "IBM Plex Mono", pesos: "400", origem: "google-fonts" },
    ],
    hierarquia:
      "Título do capítulo a 4% a 6% da altura, caixa alta com espaçamento de +20% a +30%, número do capítulo menor acima. Tarja: nome a 3% da altura, cargo a 2,2% em cinza claro. Data e lugar a 2% da altura.",
    regras: [
      "Sem caixa atrás do texto: só uma linha fina de 1 px ou nada.",
      "Branco quebrado, nunca branco puro; nunca contorno.",
      "Legenda, quando houver, pequena e limpa, duas linhas, na base.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "preto de cartela", hex: "#0B0B0C" },
      { papel: "texto", hex: "#EDE8E0" },
      { papel: "texto secundário", hex: "#A8A29A" },
      { papel: "tom quente das sombras", hex: "#2A2118" },
      { papel: "tom frio das altas luzes", hex: "#9FB3BF" },
    ],
    marca:
      "A marca aparece pouco: uma linha fina ou o número do capítulo na cor da marca, dessaturada uns 20% para não brigar com a imagem. A correção de cor é de cinema (sombras quentes, altas luzes frias, contraste suave), não da marca. O logo só no fim.",
  },
  elementos: [
    {
      id: "titulo-capitulo",
      nome: "Título de capítulo",
      forma:
        "Número pequeno (\"CAPÍTULO 2\" ou \"II\") e o nome do capítulo em serifa caixa alta espaçada, centrados sobre preto ou sobre plano largo escurecido. Linha fina de 1 px de 60 px entre os dois.",
      animacao: "Fade de 800 ms com o espaçamento das letras fechando de +40% para +25%; sai em fade de 600 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Centro, 44% a 56% da altura.",
      posicao169: "Centro, 42% a 58% da altura.",
      quando: "Mudança de tempo, lugar ou tema na história.",
    },
    {
      id: "tarja-sobria",
      nome: "Tarja de nome sóbria",
      forma:
        "Nome em sem serifa média e cargo em fina cinza, alinhados à esquerda, sem caixa, com uma linha vertical de 2 px na cor da marca dessaturada. Duas linhas no máximo.",
      animacao: "Linha cresce de baixo para cima em 300 ms, texto entra em fade com deslize de 8 px em 500 ms; sai em fade.",
      duracaoSeg: [3, 4],
      posicao916: "Canto inferior esquerdo, 66% a 74% da altura, margem 8%.",
      posicao169: "Terço inferior esquerdo, 76% a 86% da altura, margem 7%.",
      quando: "Primeira aparição de cada entrevistado; nunca de novo.",
    },
    {
      id: "foto-ken-burns",
      nome: "Foto de arquivo com Ken Burns",
      forma:
        "Foto ou documento em tela cheia (ou com moldura fina sobre preto se for vertical num 16:9), granulação leve. Separada em duas camadas para paralaxe quando houver primeiro plano claro.",
      animacao: "Zoom lento de 2% a 6% ou deslize até o rosto de quem a fala cita, em 5 a 8 s, curva linear. Entra e sai em fusão de 400 ms.",
      duracaoSeg: [4, 8],
      posicao916: "Tela cheia, recorte no assunto.",
      posicao169: "Tela cheia.",
      quando: "Passado, pessoa citada, documento, lugar que não existe mais.",
    },
    {
      id: "data-lugar",
      nome: "Data e lugar",
      forma: "Lugar e data em mono pequena branca quebrada (\"SÃO PAULO, 2019\"), sem fundo.",
      animacao: "Digita letra a letra (40 ms por letra) com cursor que some ao fim; sai em fade.",
      duracaoSeg: [2.5, 4],
      posicao916: "Canto inferior esquerdo, 70% a 76% da altura.",
      posicao169: "Canto inferior esquerdo, 84% a 89% da altura.",
      quando: "Início de capítulo ou salto no tempo.",
    },
    {
      id: "cartela-texto",
      nome: "Cartela de contexto",
      forma: "Duas a três linhas de texto fino centradas sobre preto, frase completa. Corpo a 3,5% da altura, entrelinha 1,4.",
      animacao: "Uma linha de cada vez em fade de 700 ms, 1,2 s entre linhas.",
      duracaoSeg: [4, 7],
      posicao916: "Centro, largura de 10% a 85%.",
      posicao169: "Centro, largura de 20% a 80%.",
      quando: "Fato que ninguém diz na entrevista, e o epílogo.",
    },
    {
      id: "citacao-sobre-imagem",
      nome: "Citação sobre o detalhe",
      forma: "Frase curta dita, entre aspas finas, em serifa sobre plano de detalhe escurecido 40%.",
      animacao: "Fade de 600 ms, palavra a palavra lenta só se a frase for de até 8 palavras.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 30% a 50% da altura.",
      posicao169: "Metade esquerda, centro vertical.",
      quando: "A frase que resume o capítulo.",
    },
  ],
  insercoesGeradas: {
    quando: "Para cobrir a voz quando falta material próprio: 3 a 6 por minuto, sempre planos de cinema longos e calmos.",
    tipos: [
      "plano de detalhe com profundidade curta (mãos, objeto, papel, xícara) em luz de janela",
      "lugar em plano largo ao amanhecer ou entardecer, câmera deslizando devagar",
      "reconstituição de costas ou em silhueta, sem rosto, luz lateral",
      "foto que parece de arquivo, granulada, para receber Ken Burns",
    ],
    nunca: "rosto inventado de pessoa real, cena agitada, cor saturada, texto dentro da imagem.",
  },
  som: {
    trilha: "Piano, cordas e textura ambiente, 60 a 85 batidas por minuto, que CRESCE em camadas ao longo do capítulo e resolve no fim dele; silêncio total antes da revelação.",
    efeitos: ["som ambiente do lugar em cada plano de apoio", "grave longo e suave na entrada do título", "nenhum whoosh ou pop"],
    mixagem: "Voz a -16 LUFS, natural, com o ar da sala; trilha a -24 dB sob a fala e subindo a -16 dB nos planos sem fala; fades de áudio de 1 a 2 s.",
  },
  nunca: [
    "Punch, zoom de impacto, chicote, tremida.",
    "Legenda palavra a palavra, emoji, cor saturada.",
    "Caixa sólida atrás da tarja ou tarja repetida do mesmo entrevistado.",
    "Corte no meio da frase de emoção ou sem segurar o silêncio depois.",
    "Música animada ou de batida marcada.",
    "Mais de um grafismo na tela ao mesmo tempo.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera etapas de uma história",
      edicao:
        "Não vira lista: cada etapa vira um capítulo com título sobre preto (\"I. O COMEÇO\"), data e lugar digitando no primeiro plano de apoio, e a voz dela sobre planos de detalhe; volta para a entrevista na frase de emoção de cada etapa.",
    },
    {
      quando: "O começo do vídeo",
      edicao: "Abertura fria com a frase mais forte do meio sobre planos lentos, corte para preto, trilha sobe, título fino espaçado sobre plano largo, primeira entrevista com tarja.",
    },
    {
      quando: "Ela fala de alguém do passado",
      edicao: "Foto dessa pessoa em tela cheia com Ken Burns até o rosto em 6 s, a voz dela por cima, fusão de volta para a entrevista.",
    },
    {
      quando: "Ela diz algo emocionado e para",
      edicao: "Plano fechado segurado 2 s depois da frase, trilha desce a quase nada, corte para um plano largo silencioso de 4 s.",
    },
    {
      quando: "Ela cita um número importante",
      edicao: "Cartela de contexto sobre preto com a frase completa e o número no meio (\"Em 2019, eram 3 funcionários.\"), sem animação de contador.",
    },
    {
      quando: "Muda o tempo ou o lugar",
      edicao: "Fade para preto, título de capítulo, plano de lugar ao amanhecer com data e lugar digitando.",
    },
    {
      quando: "O fim",
      edicao: "Plano mais largo do vídeo, última frase da entrevista, trilha resolve, fade para preto, cartela de epílogo em duas linhas, logo pequeno.",
    },
  ],
  quadrosDeReferencia: [
    "Entrevista em plano médio com a pessoa no terço direito olhando para fora da câmera, fundo escuro desfocado com uma luz prática quente, luz lateral suave no rosto; no canto inferior esquerdo, nome em branco quebrado e cargo em cinza, com uma linha vertical fina.",
    "Tela preta com \"CAPÍTULO 2\" pequeno e o nome do capítulo em serifa caixa alta muito espaçada, centrados, separados por uma linha fina.",
    "Foto antiga granulada em tela cheia, levemente ampliada sobre o rosto de uma pessoa, com \"SÃO PAULO, 2009\" em letras mono pequenas no canto inferior esquerdo.",
  ],
  fontes: [
    "https://en.wikipedia.org/wiki/Ken_Burns_effect (zoom lento e deslize até a pessoa citada, paralaxe simulada)",
    "https://www.masterclass.com/articles/how-ken-burns-edited-the-vietnam-war-documentary e o curso Ken Burns Teaches Documentary Filmmaking (segurar mais uma batida, pergunta embutida na resposta)",
    "https://www.soundstripe.com/blogs/a-documentarians-guide-to-lower-thirds (tarja sóbria, sem fundo; The Social Dilemma e Becoming)",
    "https://www.miracamp.com/learn/video-editing/best-fonts-for-documentaries",
    "https://filmmakermagazine.com/126596-how-true-crime-series-are-edited/ (abertura fria e gancho de fim de capítulo nas séries de streaming)",
  ],
};

export const TEXTO_DOCUMENTARIO = textoParaOPrompt(DOCUMENTARIO);
