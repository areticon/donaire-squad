import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * DOCUMENTÁRIO CINEMATOGRÁFICO, LINGUAGEM NATIONAL GEOGRAPHIC (03/10/2026).
 *
 * O que a pesquisa deu: a identidade de movimento da Nat Geo (Gretel) vem de
 * dois gestos da exploração científica, o ÍNDICE (imagens que se encaixam em
 * mosaico) e o MAPEAMENTO, e só anda para a frente no eixo X, desacelerando
 * sem parar; a tipografia é geométrica (Verlag, Neue Haas, Geograph de raiz
 * Futura) e cede o centro à fotografia; o documentário de natureza vive de
 * aéreo, macro, câmera lenta, narrador grave e mapa com rota que se desenha.
 * Diferença para o "documentario" (streaming): aqui quem conduz é o LUGAR e o
 * narrador, não a entrevista; a letra é geométrica, não serifada; o grafismo
 * é de campo (mapa, coordenada, escala), não de capítulo sobre preto.
 */
export const NATGEO: ReferenciaDeEstilo = {
  id: "natgeo",
  nome: "Documentário cinematográfico",
  inspiracao: "documentários da National Geographic",
  essencia:
    "Expedição filmada como cinema: o LUGAR é o protagonista e a pessoa é a guia que leva o espectador até ele. Aéreos que mostram a escala, macros que mostram a textura, câmera lenta no gesto que importa, luz dourada. A voz é de narrador, grave e pausada, e a imagem chega antes da explicação. O grafismo é de caderno de campo (mapa com rota, coordenada, régua de escala, rótulo apontando o detalhe) e tudo se move devagar e sempre para a frente, na horizontal.",
  estrutura: {
    abre:
      "Aéreo largo de 6 a 10 s em luz dourada, só som ambiente; a voz entra com a pergunta do vídeo; a moldura fina se desenha com o título dentro; o mapa mostra onde estamos. A pessoa aparece depois, no lugar, com a tarja.",
    avanca:
      "Por TERRITÓRIOS de 1 a 3 min (um lugar, uma etapa, um elemento do assunto): plano de situação, aproximação, macro do detalhe, a pessoa explicando em campo, câmera lenta no momento-chave. Entre territórios, o mapa avança a rota até o próximo ponto.",
    fecha:
      "A câmera se afasta até o plano mais aberto do vídeo, a voz diz o que está em jogo daqui em diante, a trilha resolve, a moldura se fecha com o logo do cliente pequeno dentro e fusão longa para preto.",
  },
  ritmo: {
    cenaSeg: [5, 10],
    cortesPorMinuto: [6, 10],
    zoom:
      "Quase nunca zoom digital: movimento de câmera (deslize lateral lento, aéreo que avança, aproximação de 100% para 103% em 8 s); no plano parado, deslize da esquerda para a direita, nunca para trás.",
    observacoes:
      "Fusões de 600 a 1.000 ms entre lugares, corte seco no tempo da trilha dentro do mesmo lugar. Câmera lenta em no máximo um plano a cada 30 s. A pessoa nunca fica mais de 20 s sem o lugar voltar.",
  },
  tipografia: {
    familias: [
      { papel: "título e territórios", familia: "Montserrat", pesos: "600, caixa alta espaçada +18%", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "rótulos de mapa, coordenada, tarja", familia: "Jost", pesos: "300 e 500", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "número de campo", familia: "Barlow Condensed", pesos: "500", origem: "google-fonts", alternativa: "Anton local" },
    ],
    hierarquia:
      "Título a 5% a 6% da altura dentro da moldura; território a 3,5%; tarja com nome a 2,8% e função a 2%; coordenada e rótulo de mapa a 2%; número de campo a 8% com a unidade a 2,5% ao lado.",
    regras: [
      "Letra geométrica e limpa, sem serifa: tom de atlas, não de romance.",
      "Texto branco quebrado com sombra suave; nunca caixa sólida atrás.",
      "Coordenada no formato 23°32'S 46°38'O.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "sombra", hex: "#1B1610" },
      { papel: "terra", hex: "#7A5A3A" },
      { papel: "luz dourada", hex: "#E3B26B" },
      { papel: "verde de campo", hex: "#4F6B3A" },
      { papel: "água e mapa", hex: "#2E4A5C" },
      { papel: "texto", hex: "#F5F1E8" },
    ],
    marca:
      "O acento da marca vira a cor da ROTA, do marcador e da moldura fina, clareado se não ler sobre o aéreo. A gradação continua terrosa e quente qualquer que seja a marca. Nunca o retângulo amarelo de terceiros como assinatura.",
  },
  elementos: [
    {
      id: "mapa-rota",
      nome: "Mapa com rota que se desenha",
      forma:
        "Mapa escuro em relevo suave, região acesa e rota na cor da marca ligando os pontos ditos. Linha de 4 px com ponta arredondada, marcadores circulares de 14 px com anel, rótulos em Jost 500 caixa alta; fora da região, o mapa escurece 50%.",
      animacao:
        "Empurrão lento da câmera virtual enquanto a rota se desenha em 1.500 a 2.500 ms. Escala de 1 para 1,15 em 4 s; cada marcador surge com anel que se expande em 600 ms; rótulo em fade com deslize de 8 px para a direita.",
      duracaoSeg: [4, 8],
      posicao916: "Tela cheia, região entre 18% e 70% da altura. Rótulos dentro de 6% a 88% da largura.",
      posicao169: "Tela cheia, região no centro. Rótulos a 5% das bordas.",
      quando: "Lugares, origem e destino, expansão, rota de entrega.",
    },
    {
      id: "coordenada-lugar",
      nome: "Marcador de lugar com coordenada",
      forma:
        "Haste vertical na cor da marca, nome do lugar em caixa alta e a coordenada fina embaixo, sem fundo. Haste de 2 px com ponto no topo; sombra suave.",
      animacao: "Haste cresce em 300 ms, nome desliza 10 px em 400 ms, coordenada conta os dígitos em 600 ms. Sai em fade de 400 ms.",
      duracaoSeg: [3, 4.5],
      posicao916: "Inferior esquerdo, 64% a 74% da altura.",
      posicao169: "Inferior esquerdo, 78% a 88% da altura.",
      quando: "Primeiro plano de cada lugar novo.",
    },
    {
      id: "moldura-fina",
      nome: "Moldura retangular fina",
      forma:
        "Retângulo em pé de contorno fino na cor da marca, enquadrando o título ou um detalhe. Traço de 3 px no 16:9 e 4 px no 9:16; proporção de cerca de 0,7.",
      animacao: "O contorno se desenha no sentido horário em 900 ms e o título entra dentro em 600 ms. Saída: a moldura cresce até sair do quadro em 800 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Centro, 30% a 66% da altura.",
      posicao169: "Centro, 20% a 80% da altura.",
      quando: "Título, abertura de território e fecho com o logo.",
    },
    {
      id: "rotulo-chamada",
      nome: "Rótulo com linha de chamada",
      forma:
        "Ponto com anel sobre o detalhe e linha fina em diagonal até um rótulo de até 4 palavras. Linha de 1,5 px a 45 graus, ponto de 8 px, rótulo em Jost 500.",
      animacao: "Ponto em 300 ms, linha em 400 ms, rótulo em 300 ms. Acompanha o detalhe se a câmera desliza.",
      duracaoSeg: [2.5, 4],
      posicao916: "Junto ao detalhe, rótulo entre 20% e 70% da altura.",
      posicao169: "Junto ao detalhe, rótulo no lado vazio.",
      quando: "A fala nomeia uma parte, material ou peça visível no macro.",
    },
    {
      id: "regua-escala",
      nome: "Dado de campo com régua",
      forma:
        "Número grande com a unidade ao lado sobre uma régua fina com marcações. Marcações a cada 10%; rótulo do que mede em Jost 300 acima.",
      animacao: "Régua se desenha em 600 ms e o número conta em 1.000 ms. Um tique acende na posição proporcional.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 56% a 70% da altura, centrado.",
      posicao169: "Terço inferior esquerdo, 66% a 84% da altura.",
      quando: "Distância, área, volume, toneladas: número de escala física.",
    },
    {
      id: "indice-mosaico",
      nome: "Índice em mosaico",
      forma:
        "Três a seis imagens que se encaixam em grade sobre fundo quase preto, como prancha de catálogo. Vão de 8 px, legenda numerada pequena em cada uma.",
      animacao: "Entram uma a uma deslizando 24 px no eixo X, 500 ms cada, 180 ms de intervalo. A prancha inteira segue deslizando 2% para a esquerda sem parar.",
      duracaoSeg: [4, 7],
      posicao916: "Duas colunas, 16% a 74% da altura.",
      posicao169: "Grade de 3 por 2, 12% a 86% da altura.",
      quando: "Lista de tipos, etapas, produtos ou lugares.",
    },
    {
      id: "barras-cinema",
      nome: "Faixas de cinema",
      forma: "Faixas pretas em cima e embaixo levando o 16:9 a 2,39:1. No 9:16, deixam um quadro de 4:5 no centro.",
      animacao: "Fecham em 1.200 ms junto com a fusão para o aéreo. Abrem em 800 ms quando a pessoa volta.",
      duracaoSeg: [5, 20],
      posicao916: "0% a 18% e 78% a 100% da altura.",
      posicao169: "12,5% em cima e embaixo.",
      quando: "Sequências de lugar sem a pessoa, abertura e fecho.",
    },
  ],
  insercoesGeradas: {
    quando: "Muita: é o estilo que mais pede lugar. 4 a 7 por minuto quando falta material, sempre planos longos com movimento de câmera.",
    tipos: [
      "aéreo avançando devagar sobre o território do assunto em luz dourada",
      "macro de material, textura ou peça com profundidade curtíssima",
      "gesto de trabalho em câmera lenta contra a luz",
      "paisagem ao amanhecer com névoa para título e fecho",
    ],
    nunca: "mapa, rota, coordenada ou número desenhados por modelo (são código), texto na imagem, lugar fantástico, rosto de pessoa real.",
  },
  som: {
    trilha: "Orquestral com tambores graves e cordas que crescem, 70 a 95 batidas por minuto; quase some sob a voz e ocupa tudo nos aéreos.",
    efeitos: ["ambiente do lugar em primeiro plano (vento, água, máquina ao longe)", "grave de cinema no título", "tique baixo em cada marcador do mapa"],
    mixagem: "Voz a -16 LUFS; ambiente a -22 dB sempre presente; trilha a -26 dB sob a fala e -14 dB nos aéreos sem fala.",
  },
  nunca: [
    "Abrir com a pessoa falando antes de mostrar o lugar.",
    "Movimento que volta para trás ou para no meio.",
    "Serifa romântica, caixa sólida atrás do texto, legenda palavra a palavra.",
    "Punch, chicote, flash.",
    "Gradação fria ou saturada de rede social.",
    "Retângulo amarelo, vinheta ou trilha de terceiros.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 etapas de um processo",
      edicao:
        "Índice em mosaico com as 7 imagens; escurece 6 e a 1 cresce até a tela cheia; \"ETAPA 1\" na moldura fina; situação, aproximação, macro com rótulo no detalhe que ela nomeia; volta para ela em campo; ao trocar de etapa, a prancha reabre com a 1 marcada e a 2 crescendo.",
    },
    { quando: "Os primeiros segundos", edicao: "Aéreo dourado com faixas de cinema e vento; a voz faz a pergunta; moldura com o título; mapa com marcador; corte para ela no lugar com tarja." },
    { quando: "Ela conta de onde vem a matéria-prima", edicao: "Mapa escuro, marcador na origem, rota na cor da marca se desenhando até o destino na fala; fusão para o aéreo do destino." },
    { quando: "Ela cita um número de escala (\"1.200 hectares\")", edicao: "Aéreo avançando sobre a área com régua e o número contando; trilha sobe; volta para ela." },
    { quando: "Ela explica um detalhe técnico", edicao: "Macro em câmera lenta com rótulo de chamada na parte nomeada, deslize lateral, som real do material." },
    { quando: "Ela fala de uma virada", edicao: "Câmera lenta do gesto contra a luz, 2 s sem fala, trilha cresce, fusão longa para o lugar hoje." },
    { quando: "O fim", edicao: "Afasta até o plano mais aberto, última frase em narração, trilha resolve, moldura com o logo, fusão para preto." },
  ],
  quadrosDeReferencia: [
    "Aéreo em luz dourada sobre um campo ou fábrica, com faixas pretas de cinema; no canto inferior esquerdo, uma haste fina na cor da marca, o nome do lugar em caixa alta geométrica e a coordenada em letra fina embaixo.",
    "Mapa escuro em relevo com a região do assunto iluminada, uma rota grossa na cor da marca ligando dois marcadores circulares com anel, rótulos curtos em caixa alta ao lado de cada ponto.",
    "Macro de uma peça com profundidade de campo curtíssima, um ponto com anel sobre o detalhe e uma linha fina em diagonal até um rótulo curto em letra geométrica branca.",
  ],
  fontes: [
    "https://gretelny.com/national-geographic (movimento: o índice e o mapeamento, imagens que se encaixam, só para a frente no eixo X, nunca para, só desacelera)",
    "https://klim.co.nz/blog/geograph-design-information/ (Geograph, geométrica de raiz Futura, papel secundário ao lado da imagem)",
    "https://chasedhont.com/national-geographic-motion (retângulo como janela e revelação por escala)",
    "https://mappi.studio/documentary-map-animation (mapa de documentário: empurrão lento, rota que se desenha, contorno com brilho suave, rótulos contidos)",
    "https://www.businesswire.com/news/home/20200803005213/en/ (série From Above: o aéreo no centro da linguagem; lido pelo resumo da busca)",
  ],
};

export const TEXTO_NATGEO = textoParaOPrompt(NATGEO);
