import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * ANIMAÇÃO EXPLICATIVA, LINGUAGEM DA KURZGESAGT (03/10/2026).
 *
 * Sem bíblia própria ainda; a base é a ficha 7 de
 * docs/estilos-de-edicao-de-video.md e a pesquisa: ilustração vetorial chapada
 * de formas arredondadas com degradê suave e brilho, cores vibrantes (rosa,
 * laranja, amarelo, ciano) sobre azul profundo (#141535 a #1A1D4E), uns 200
 * desenhos por vídeo de 10 min, animação em After Effects a 60 quadros por
 * segundo com personagens articulados simples, câmera que mergulha e afasta em
 * zoom contínuo, trilha ambiente de sintetizador com graves profundos nas
 * palavras-chave e efeitos de interface futuristas. Aqui a pessoa do cliente
 * entra numa janela arredondada; o mundo desenhado é código, não imagem gerada.
 */
export const KURZGESAGT: ReferenciaDeEstilo = {
  id: "kurzgesagt",
  nome: "Animação explicativa",
  inspiracao: "Kurzgesagt (In a Nutshell)",
  essencia:
    "Explicar um conceito com um mundo vetorial chapado e luminoso: formas geométricas arredondadas, degradês suaves de dentro para fora, brilho nas bordas, cores vibrantes sobre um fundo azul profundo com pontinhos de estrela. Cada frase vira uma imagem: o conceito abstrato ganha uma metáfora visual simples (uma célula, um planeta, uma engrenagem, uma pilha de moedas), os números crescem enormes e redondos, os processos viram fluxos de partículas que andam. A câmera nunca para: mergulha no detalhe e se afasta para mostrar a escala. Pouco texto; o desenho explica. A pessoa do cliente aparece numa janela arredondada no canto, como guia.",
  estrutura: {
    abre:
      "Com a escala do problema: um plano do mundo desenhado (o planeta, a cidade, a empresa como um pequeno ecossistema) e a frase-pergunta dita; a câmera mergulha nele até o detalhe que o vídeo vai explicar. Até 10 s. A pessoa em janela entra na primeira frase dela.",
    avanca:
      "Em cadeia de causa: cada etapa do processo é uma cena desenhada que se transforma na próxima (a forma morfa, a câmera atravessa), com o número grande quando há dado e o diagrama de fluxo quando há sequência. A cada 40 a 60 s, um plano de escala (zoom out) lembra onde estamos no todo.",
    fecha:
      "Afastamento lento até o mundo inteiro de novo, agora mudado pelo que foi explicado; a frase-síntese em letras redondas sobre o azul profundo; a pessoa em plano maior dizendo a chamada.",
  },
  ritmo: {
    cenaSeg: [3, 6],
    cortesPorMinuto: [10, 18],
    zoom:
      "Zoom contínuo como linguagem: mergulho de 100% a 300% em 1,5 s para entrar no detalhe, afastamento de 2 s para mostrar a escala, deriva lenta de 2% a 4% em todo plano parado. Sem punch.",
    observacoes:
      "A imagem troca a cada frase; transição preferida é a transformação de uma forma na outra (500 a 800 ms), não o corte. Animação fluida a 60 quadros por segundo, com desaceleração e um leve balanço no fim de cada movimento.",
  },
  tipografia: {
    familias: [
      { papel: "título, número, rótulo", familia: "Nunito", pesos: "800 e 900", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "rótulo pequeno de diagrama", familia: "Nunito", pesos: "700", origem: "google-fonts" },
    ],
    hierarquia:
      "Número a 16% a 24% da altura. Título de capítulo a 7% a 8%. Rótulo de diagrama a 2,6% a 3,2%, em caixa alta espaçada (+4%). Legenda a 3,6%.",
    regras: [
      "Letra branca ou da cor clara do degradê, sempre com brilho suave de 8 px sobre o azul.",
      "Até 4 palavras por rótulo; o desenho diz o resto.",
      "Cantos e terminais arredondados; nada de serifa ou condensada.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo profundo", hex: "#141535" },
      { papel: "fundo médio", hex: "#1A1D4E" },
      { papel: "azul de volume", hex: "#3B6AAB" },
      { papel: "ciano de luz", hex: "#96DEEA" },
      { papel: "rosa", hex: "#EE437C" },
      { papel: "amarelo", hex: "#FABD3D" },
      { papel: "verde-limão", hex: "#CCF20D" },
      { papel: "ciano vivo", hex: "#51FBDC" },
    ],
    marca:
      "O fundo profundo vira o escuro da marca levado a azul-noite (ou ao tom escuro mais próximo dela). A cor da marca é o acento principal dos objetos que importam; a paleta se estende com duas ou três cores vizinhas dela, mais claras e mais saturadas, para os volumes e degradês. Se a marca for clara, ela vai nos objetos e o fundo continua profundo.",
  },
  elementos: [
    {
      id: "objeto-vetorial",
      nome: "Objeto vetorial chapado",
      forma:
        "O objeto da fala desenhado em formas geométricas arredondadas, preenchimento chapado com degradê radial suave e uma borda de luz no lado de cima. Sem contorno preto; sombra interna leve; até 3 cores por objeto.",
      animacao:
        "Cresce de 0 a 105% a 100% em 400 ms com balanço; depois flutua 6 px em ciclo de 3 s. Sai encolhendo para um ponto em 250 ms.",
      duracaoSeg: [2.5, 6],
      posicao916: "Centro, 22% a 60% da altura.",
      posicao169: "Centro ou dois terços livres, 15% a 85% da altura.",
      quando: "Todo substantivo concreto ou conceito que ganha metáfora visual.",
    },
    {
      id: "numero-redondo",
      nome: "Número enorme arredondado",
      forma:
        "O número em letra arredondada pesada, branco com brilho, e um ícone vetorial pequeno ao lado que representa a unidade. Rótulo curto em caixa alta embaixo.",
      animacao: "Conta até o valor em 900 ms com desaceleração; o ícone salta com mola no fim. Grave profundo no último dígito.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 26% a 50% da altura.",
      posicao169: "Centro, 28% a 66% da altura.",
      quando: "Todo número dito, sobretudo escala (\"bilhões\", \"10 mil vezes\").",
    },
    {
      id: "fluxo-de-particulas",
      nome: "Fluxo do processo",
      forma:
        "Caminho curvo de pontos ou cápsulas luminosas andando entre duas ou três formas, mostrando o que passa de uma para outra. Pontos de 10 a 16 px com rastro; setas arredondadas nas pontas.",
      animacao: "O caminho se desenha em 700 ms e as partículas correm em fluxo contínuo, acelerando quando a fala diz \"mais\".",
      duracaoSeg: [3, 7],
      posicao916: "Faixa de 20% a 66% da altura, em zigue-zague vertical.",
      posicao169: "Da esquerda para a direita, 25% a 75% da altura.",
      quando: "Processo, causa e efeito, \"isso leva a\", dinheiro ou dados circulando.",
    },
    {
      id: "diagrama-de-blocos",
      nome: "Diagrama de cápsulas",
      forma:
        "Cápsulas arredondadas coloridas ligadas por linhas curvas, cada uma com um ícone e um rótulo curto, a ativa iluminada e as outras em azul de volume. Raio total; brilho de 12 px na ativa.",
      animacao: "As cápsulas surgem em cascata de 150 ms com mola; a ligação se desenha depois; a ativa pulsa uma vez.",
      duracaoSeg: [3, 6],
      posicao916: "Coluna de 18% a 70% da altura.",
      posicao169: "Grade de 15% a 85% da altura.",
      quando: "A fala enumera etapas, partes ou tipos.",
    },
    {
      id: "plano-de-escala",
      nome: "Plano de escala",
      forma:
        "O mundo inteiro desenhado (planeta, cidade, mercado) pequeno no centro, cercado de estrelas e pontos de luz, com o detalhe atual marcado por um anel brilhante. Estrelas de 2 a 4 px em três camadas de paralaxe.",
      animacao: "A câmera se afasta de 300% a 100% em 2 s com desaceleração; as camadas de estrela andam em velocidades diferentes.",
      duracaoSeg: [2.5, 5],
      posicao916: "Tela cheia; o anel entre 30% e 60% da altura.",
      posicao169: "Tela cheia.",
      quando: "Abertura, fecho e a cada 40 a 60 s para mostrar onde estamos.",
    },
    {
      id: "grafico-redondo",
      nome: "Gráfico de barras arredondadas",
      forma:
        "Barras de cantos totalmente arredondados com degradê vertical e brilho no topo, a principal na cor da marca. Sem eixos visíveis; valor acima de cada barra.",
      animacao: "Barras crescem de baixo com mola em 600 ms, em cascata de 120 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 24% a 62% da altura.",
      posicao169: "Centro, 20% a 80% da altura.",
      quando: "Comparação de quantidades ditas.",
    },
    {
      id: "janela-do-narrador",
      nome: "Janela do narrador",
      forma:
        "A gravação da pessoa numa janela de cantos bem arredondados com borda de luz de 3 px na cor da marca. Raio 36 px; ocupa 30% a 40% da largura.",
      animacao: "Surge crescendo de 80% a 100% em 300 ms. Some ou cresce para tela cheia nas frases de emoção.",
      duracaoSeg: [4, 20],
      posicao916: "Canto inferior esquerdo, 56% a 76% da altura.",
      posicao169: "Canto inferior direito, 60% a 90% da altura.",
      quando: "Enquanto a pessoa fala sobre o mundo desenhado.",
    },
    {
      id: "personagem-simples",
      nome: "Personagem genérico",
      forma:
        "Figura humana mínima: cabeça redonda, corpo em cápsula, braços em traço grosso arredondado, sem rosto detalhado. Uma cor sólida com degradê; nunca a cópia de personagem de terceiros.",
      animacao: "Entra caminhando em ciclo de 600 ms ou salta para dentro com mola; gestos com o braço articulado na palavra.",
      duracaoSeg: [2, 5],
      posicao916: "Base do mundo desenhado, 50% a 74% da altura.",
      posicao169: "Terço inferior, 55% a 85% da altura.",
      quando: "\"O cliente\", \"as pessoas\", \"o vendedor\": quem age no processo.",
    },
  ],
  insercoesGeradas: {
    quando: "Pouca: o mundo é desenhado em código. Imagem gerada só como fundo de paisagem vetorial distante, 1 por bloco, quando o código não dá conta.",
    tipos: [
      "paisagem vetorial chapada de formas arredondadas na paleta da marca sobre azul profundo, sem personagens, muito espaço vazio",
      "textura de céu estrelado vetorial com nebulosa suave",
    ],
    nunca: "foto realista, render 3D brilhante, personagem de terceiros, texto ou número desenhado pelo modelo.",
  },
  som: {
    trilha: "Ambiente de sintetizador, espaçosa e serena, 70 a 100 batidas por minuto; cresce nos planos de escala.",
    efeitos: ["grave profundo na palavra-chave e no número", "bipe suave de interface na cápsula ativa", "brilho cintilante quando um objeto surge", "sopro na transformação de forma"],
    mixagem: "Voz a -15 LUFS, clara; trilha a -24 dB sob a fala e -16 dB nos planos sem fala; efeitos suaves e espaciais.",
  },
  nunca: [
    "Foto realista, colagem de papel ou recorte com fita.",
    "Contorno preto grosso, cantos vivos, letra serifada.",
    "Fundo branco ou claro como base.",
    "Texto explicando o que o desenho já mostra.",
    "Corte seco entre ideias quando dá para transformar uma forma na outra.",
    "Copiar personagens, pássaros ou mascotes de terceiros.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 5 etapas de um processo",
      edicao:
        "Diagrama com 5 cápsulas ligadas; 4 caem para o azul de volume, a 1 acende e pulsa; mergulho de câmera na cápsula 1, que se transforma na cena desenhada da etapa com o rótulo ETAPA 1; objetos e personagens surgem conforme ela fala; na troca, a câmera se afasta, o diagrama volta com a 1 marcada e a 2 acesa.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Plano de escala do mundo desenhado com estrelas, a pergunta dita, mergulho de câmera até o detalhe; a janela da pessoa entra na frase seguinte.",
    },
    {
      quando: "Ela diz um número de escala (\"são 2 milhões de empresas\")",
      edicao: "Número enorme contando até 2 MILHÕES com grave; em seguida, milhares de pontinhos preenchendo a tela num enxame.",
    },
    {
      quando: "Ela explica que algo causa outra coisa",
      edicao: "Fluxo de partículas saindo da primeira forma para a segunda; a segunda cresce conforme recebe; brilho no fim.",
    },
    {
      quando: "Ela usa uma metáfora (\"a empresa é como um organismo\")",
      edicao: "A forma da empresa morfa numa célula arredondada com partes se movendo; a câmera atravessa a membrana.",
    },
    {
      quando: "Ela compara dois cenários",
      edicao: "Gráfico de barras arredondadas, a da marca brilhando; ou o mundo dividido em duas metades com cores diferentes.",
    },
    {
      quando: "O fecho",
      edicao: "Afastamento lento até o mundo inteiro, mudado; frase-síntese em letra redonda com brilho; a janela da pessoa cresce para a chamada.",
    },
  ],
  quadrosDeReferencia: [
    "Fundo azul profundo com pontinhos de estrela; no centro, um objeto vetorial de formas arredondadas com degradê radial e borda de luz em rosa e amarelo; um rótulo curto em letra arredondada branca abaixo; a pessoa numa janela de cantos arredondados no canto.",
    "Diagrama de cinco cápsulas arredondadas ligadas por linhas curvas sobre azul-noite, a primeira acesa na cor de destaque com brilho e as outras em azul médio, cada uma com um ícone simples.",
    "Plano amplo de um pequeno planeta vetorial no centro com camadas de estrelas, um anel brilhante marcando um ponto na superfície e um número enorme arredondado branco acima.",
  ],
  fontes: [
    "docs/estilos-de-edicao-de-video.md, ficha 7 (animação vetorial, números animados, zoom contínuo e morfismo)",
    "https://github.com/black-atom-industries/black-atom/issues/47 (paleta: azuis profundos #141535 a #1A1D4E, acentos #EE437C, #CCF20D, #FABD3D, #51FBDC)",
    "https://10.studio/the-incredible-amount-of-work-behind-kurzgesagts-beautiful-animated-videos/ (cerca de 200 desenhos por vídeo, After Effects, som com graves profundos nas palavras-chave e efeitos futuristas)",
    "https://www.skillshare.com/en/classes/motion-graphics-with-kurzgesagt-part-3/140140401 (animação a 60 quadros por segundo, personagens articulados)",
    "https://midlibrary.io/styles/kurzgesagt (formas arredondadas, degradê, paleta neon de rosa, azul e laranja)",
  ],
};

export const TEXTO_KURZGESAGT = textoParaOPrompt(KURZGESAGT);
