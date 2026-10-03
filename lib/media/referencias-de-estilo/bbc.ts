import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * TELEJORNAL E REPORTAGEM, LINGUAGEM DA BBC NEWS (03/10/2026).
 *
 * Base: a bíblia sóbria lib/media/biblias/sobrio.ts (id "bbc": planos de 5 a 8
 * s, tarja com chapéu a cada 8 a 15 s, número com a fonte, no máximo 1 punch
 * por minuto) e a pesquisa sobre o pacote gráfico da emissora: desde 2019 a
 * tarja inferior é uma caixa escura com uma pincelada de cor (a vermelha desde
 * 2023), manchete em serifa e contexto em sem serifa da mesma família
 * humanista (a Reith, feita para ler bem na tela), animações curtas nas
 * chamadas e lentas nos fundos, tudo dentro da área segura do 16:9.
 */
export const BBC: ReferenciaDeEstilo = {
  id: "bbc",
  nome: "Telejornal e reportagem",
  inspiracao: "BBC News",
  essencia:
    "Credibilidade antes de energia: a pessoa em plano médio, bem iluminada, em planos de 5 a 8 s que respiram; tarja de telejornal escura com a manchete em serifa e o chapéu em sem serifa, um filete da cor da marca; número grande com a fonte citada; imagem documental real do que foi dito. Grafismo reto, alinhado, discreto, com cantos retos e animações curtas que não chamam atenção. A cor da marca aparece em um bloco pequeno e no filete, nunca no quadro inteiro.",
  estrutura: {
    abre:
      "Como a chamada de uma reportagem: duas ou três frases calmas e fortes do próprio vídeo, de 3 a 5 s cada, sobre imagem documental ou a pessoa com a tarja do assunto; depois a apresentação de quem fala na tarja de nome e cargo. Até 15 s, sem cortes picados nem flash.",
    avanca:
      "Por blocos de reportagem: a pessoa expõe com a tarja da frase-chave, a imagem documental cobre o que ela descreve (com a voz por cima), a tela de dado prova com número e fonte, e o mapa situa quando há lugar. Troca de bloco com cartela de capítulo curta ou fusão.",
    fecha:
      "A frase de conclusão em tarja ou citação, a pessoa em plano médio olhando para a câmera, e fusão para o fim com o nome da marca discreto.",
  },
  ritmo: {
    cenaSeg: [5, 8],
    cortesPorMinuto: [8, 14],
    zoom:
      "Aproximação quase imperceptível (100% a 103% em 6 s) como base; afastamento lento para abrir assunto; punch no máximo uma vez por minuto, numa revelação, de 108%.",
    observacoes:
      "Respiros naturais da fala ficam. Tarja a cada 8 a 15 s, nunca duas na mesma cena. Imagem documental de 3 a 5 s. Fusão de 500 ms só em troca de assunto.",
  },
  tipografia: {
    familias: [
      { papel: "manchete da tarja, citação", familia: "Source Serif 4", pesos: "600 e 700", origem: "google-fonts", alternativa: "PT Serif local" },
      { papel: "chapéu, nome, cargo, fonte, legenda", familia: "Source Sans 3", pesos: "400, 600 e 700", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "número da tela de dado", familia: "Roboto Condensed", pesos: "700", origem: "google-fonts", alternativa: "Liberation Sans Narrow local" },
    ],
    hierarquia:
      "Manchete da tarja a 4% a 4,5% da altura, chapéu a 2,4% em caixa alta espaçada (+6%). Nome a 3,6% bold, cargo a 2,8% regular. Número da tela de dado a 16% a 20%, fonte a 2,2% em cinza.",
    regras: [
      "Manchete em serifa, contexto em sem serifa: nunca o contrário.",
      "Caixa normal no texto; caixa alta só no chapéu.",
      "Tarja com até 8 palavras numa linha, alinhada à esquerda; a fonte do dado sempre que foi dita.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "caixa da tarja", hex: "#141414" },
      { papel: "bloco de marca e filete (destaque)", hex: "#B80000" },
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "texto secundário e fonte", hex: "#BFBFBF" },
      { papel: "fundo da tela de dado", hex: "#0E1A2B" },
      { papel: "segunda série de dado", hex: "#7A8C99" },
    ],
    marca:
      "O vermelho do bloco e do filete vira a cor da marca. A caixa escura continua quase preta (ou o escuro da marca levado a 90% de preto). O fundo da tela de dado é o escuro da marca. Cor da marca chapada no quadro inteiro só na cartela de capítulo.",
  },
  elementos: [
    {
      id: "tarja-manchete",
      nome: "Tarja de manchete",
      forma:
        "Caixa retangular escura com um bloco quadrado da cor da marca à esquerda, chapéu em caixa alta acima e a manchete em serifa branca. Cantos retos; altura de 9% a 11% do quadro; filete de 4 px da cor da marca na base.",
      animacao:
        "O bloco de cor entra primeiro (120 ms), a caixa se abre da esquerda para a direita em 300 ms e o texto surge com fade em 200 ms. Sai pelo caminho inverso em 250 ms.",
      duracaoSeg: [4, 7],
      posicao916: "Faixa de 62% a 74% da altura. Largura de 6% a 88%.",
      posicao169: "Terço inferior, base a 88% da altura. Da margem esquerda de 5% até 70% da largura.",
      quando: "A frase-chave do trecho, a cada 8 a 15 s.",
    },
    {
      id: "tarja-nome",
      nome: "Tarja de nome e cargo",
      forma:
        "Duas linhas alinhadas à esquerda: nome em sem serifa bold branca na caixa escura e cargo em regular cinza claro numa faixa mais fina abaixo. Bloco da cor da marca de 8 px à esquerda.",
      animacao: "O bloco cresce de cima para baixo em 150 ms e as linhas deslizam 20 px da esquerda com fade em 250 ms. Sai com fade de 200 ms.",
      duracaoSeg: [3.5, 5],
      posicao916: "Faixa de 64% a 74% da altura, margem esquerda de 6%.",
      posicao169: "Terço inferior esquerdo, 76% a 88% da altura.",
      quando: "A primeira vez que a pessoa aparece, e quando outra pessoa fala.",
    },
    {
      id: "tela-de-dado",
      nome: "Tela de dado com fonte",
      forma:
        "Cartela de fundo escuro com o número grande em condensada branca, um rótulo curto embaixo e a fonte em cinza no canto inferior. Filete da cor da marca de 3 px acima do rótulo.",
      animacao: "O número sobe 16 px com fade e conta até o valor em 700 ms; o rótulo e a fonte surgem 200 ms depois. Nada estoura.",
      duracaoSeg: [3, 5],
      posicao916: "Número de 32% a 48% da altura, rótulo e fonte até 60%.",
      posicao169: "Centro, 30% a 70% da altura; fonte no canto inferior esquerdo.",
      quando: "Todo dado dito, com a fonte quando a pessoa a disse.",
    },
    {
      id: "grafico-de-barras",
      nome: "Gráfico de barras sóbrio",
      forma:
        "Barras retas finas, a principal na cor da marca e as outras em cinza azulado, valores em cima e eixo de 1 px. Sem grade carregada; título em sem serifa acima.",
      animacao: "As barras crescem de baixo em 600 ms com desaceleração, em cascata de 100 ms. Valores surgem no fim.",
      duracaoSeg: [3.5, 6],
      posicao916: "Faixa de 22% a 66% da altura.",
      posicao169: "Centro, 18% a 82% da altura.",
      quando: "Comparação de dois a cinco números ditos.",
    },
    {
      id: "mapa-localizador",
      nome: "Mapa localizador",
      forma:
        "Mapa chapado em cinza escuro com a região dita preenchida da cor da marca, um ponto pulsante e o nome em sem serifa branca. Sem relevo, sem nomes de rua.",
      animacao: "A câmera aproxima do mapa em 1.200 ms com desaceleração; a região preenche em 300 ms e o ponto pulsa duas vezes.",
      duracaoSeg: [3, 5],
      posicao916: "Mapa de 13% a 70% da altura, tela cheia na largura.",
      posicao169: "Tela cheia, rótulo dentro da margem de 5%.",
      quando: "Cidade, estado, país ou obra dita.",
    },
    {
      id: "citacao-destacada",
      nome: "Citação em tela",
      forma:
        "A frase dita entre aspas grandes em serifa branca sobre fundo escuro, com o nome de quem disse em sem serifa cinza abaixo. Aspas da cor da marca.",
      animacao: "As aspas surgem com fade e a frase aparece linha a linha em 250 ms cada. Fusão na saída.",
      duracaoSeg: [3.5, 6],
      posicao916: "Faixa de 30% a 60% da altura.",
      posicao169: "Centro, 30% a 70% da altura, largura de 15% a 85%.",
      quando: "A frase de mais peso do bloco, ou a citação de um documento.",
    },
    {
      id: "cartela-capitulo",
      nome: "Cartela de capítulo",
      forma:
        "Tela da cor da marca (ou escura) com o título do bloco em serifa branca e um número pequeno em sem serifa. Uma linha fina horizontal sob o título.",
      animacao: "A linha cresce do centro em 300 ms e o título sobe com fade. Fusão na saída.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Centro, 42% a 56% da altura.",
      posicao169: "Centro, 42% a 58% da altura.",
      quando: "Troca de capítulo em vídeo de mais de 2 min.",
    },
  ],
  insercoesGeradas: {
    quando: "Moderadas: imagem documental cobrindo a fala quando ela descreve um lugar, obra ou objeto, 1 a 3 por minuto. A gravação real do cliente sempre vem antes.",
    tipos: [
      "fotografia documental realista do substantivo dito, luz natural, profundidade de campo, composição calma",
      "plano documental com um movimento lento de câmera (deriva aérea, travelling lateral)",
      "vista de satélite ou aérea de região sem nomes visíveis",
    ],
    nunca: "cartum, recorte de objeto, estúdio colorido, partícula, texto ou número desenhado pelo modelo.",
  },
  som: {
    trilha: "Ambiente discreta ou nenhuma por baixo da fala, 65 a 95 batidas por minuto; som ambiente real sob a imagem documental.",
    efeitos: ["tique suave na tarja (ou nenhum)", "sopro curto na cartela de capítulo", "nenhum som na fusão"],
    mixagem: "Voz a -16 LUFS, limpa e natural; trilha a -30 dB ou ausente; ambiente da imagem documental a -28 dB.",
  },
  nunca: [
    "Papel, colagem, recorte, carimbo, emoji ou seta desenhada.",
    "Punch nervoso, flash, chicote ou mais de 1 punch por minuto.",
    "Mais de 2 elementos por cena, ou duas tarjas juntas.",
    "Caixa alta gritada no texto corrido.",
    "Número sem rótulo, ou fonte inventada que não foi dita.",
    "Cor saturada chapada fora da cartela de capítulo.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 3 pontos",
      edicao:
        "Cartela escura com os 3 pontos em lista numerada; os outros 2 caem para cinza e o 1 fica branco com o bloco da cor da marca; tarja com o ponto 1 sobre a pessoa; imagem documental cobre o exemplo; na troca, a lista volta com o 1 em cinza e o 2 aceso.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Imagem documental do assunto com a voz da frase mais forte por cima; corte para a pessoa com a tarja do assunto; tarja de nome e cargo na frase seguinte.",
    },
    {
      quando: "Ela cita um dado com fonte (\"segundo o IBGE, 30%\")",
      edicao: "Tela de dado: 30% contando em condensada branca, rótulo, \"Fonte: IBGE\" no canto; volta para a pessoa.",
    },
    {
      quando: "Ela fala de um lugar",
      edicao: "Mapa localizador aproximando até a região preenchida da cor da marca; imagem documental aérea do lugar com a voz por cima.",
    },
    {
      quando: "Ela compara números de anos diferentes",
      edicao: "Gráfico de barras sóbrio, a barra do ano atual na cor da marca, valores no fim; fusão para a pessoa.",
    },
    {
      quando: "Ela diz uma frase de muito peso",
      edicao: "Plano mais fechado por corte (não punch), tarja com a frase na manchete e chapéu do assunto; ou citação em tela com aspas da cor da marca.",
    },
    {
      quando: "O fecho",
      edicao: "Tarja com a conclusão, a pessoa olhando para a câmera, respiro de 1 s e fusão para o fim.",
    },
  ],
  quadrosDeReferencia: [
    "A pessoa em plano médio, iluminada de forma natural num escritório desfocado; no terço inferior, uma tarja escura reta com um pequeno bloco da cor de destaque à esquerda, chapéu em caixa alta pequena acima e a manchete em serifa branca.",
    "Cartela de fundo escuro azulado com um número grande em condensada branca, um filete fino da cor de destaque acima de um rótulo curto e a fonte em cinza no canto inferior esquerdo.",
    "Mapa chapado em cinza escuro com uma região preenchida pela cor de destaque, um ponto branco e o nome do lugar em sem serifa branca ao lado.",
  ],
  fontes: [
    "lib/media/biblias/sobrio.ts (bíblia do projeto, id bbc, 01/10)",
    "https://www.newscaststudio.com/2019/07/17/bbc-news-rebrand-broadcast-design-2019/ (tarja invertida para caixa escura com pincelada de cor; manchete em serifa e contexto em sem serifa)",
    "https://www.itsnicethat.com/news/bbc-reith-typeface-graphic-design-110817 (Reith: humanista de aberturas largas, desenhada para ler na tela)",
    "https://archive.org/details/new-bbc-news-strap-and-sport (a tarja vermelha de 26/06/2023)",
    "https://www.tvforum.co.uk/thegallery/bbc-news-reith-style-44185 (animação rápida nas chamadas e lenta nos fundos, tudo seguro no 16:9)",
  ],
};

export const TEXTO_BBC = textoParaOPrompt(BBC);
