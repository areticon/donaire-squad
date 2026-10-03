import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * PROFESSOR COM IMAGENS DE APOIO, LINGUAGEM DE ALI ABDAAL (03/10/2026).
 *
 * O que a pesquisa deu: no vídeo longo, a pessoa num cenário arrumado e
 * quente (estante, planta, luz âmbar, fundo desfocado, câmera levemente de
 * lado), cortes em salto sem pausa morta, punch de cerca de 10% para ênfase,
 * texto animado por caractere ("Spin-In by Character"), transição de papel
 * rasgado, capítulos numerados, citação de livro, captura de tela e
 * infográfico simplificado; tipografia Inter (às vezes TT Fors); efeitos de
 * papel amassado e página virando; trilha lo-fi baixa. No corte vertical, o
 * tratamento muda: preto e branco com UMA cor viva (amarelo), legenda frase a
 * frase em letra manuscrita, em minúsculas, ao lado da pessoa, plano de 2 a 5
 * s. Distância do Hormozi: calma, minúscula, sem contorno, sem gritar.
 */
export const ALI_ABDAAL: ReferenciaDeEstilo = {
  id: "ali-abdaal",
  nome: "Professor com imagens de apoio",
  inspiracao: "Ali Abdaal",
  essencia:
    "Um amigo que estudou o assunto e te explica na sala dele. A pessoa em plano médio, levemente de lado, num cenário quente e arrumado (estante, planta, luz âmbar, fundo desfocado), falando com calma e simpatia. A edição é limpa e organizada como um bom caderno: capítulos numerados, a palavra-chave aparecendo ao lado da pessoa em letra minúscula elegante, citação de livro em cartão de papel, captura de tela flutuando com o trecho grifado, um diagrama simples quando a ideia é abstrata. Papel rasgado nas trocas de capítulo. Nada grita: sem caixa alta, sem contorno, sem tremor. O tom é de curiosidade e utilidade, com um sorriso.",
  estrutura: {
    abre:
      "Uma pergunta ou reformulação que desperta curiosidade (\"e se o problema não for falta de tempo?\"), dita olhando para a câmera, com a frase-chave surgindo ao lado em minúscula. Em seguida a promessa do que o vídeo entrega e um vislumbre rápido dos capítulos (os títulos passando em cartões). Até 20 s de abertura.",
    avanca:
      "Por capítulos numerados: cartão de capítulo com número e título, a explicação com exemplo simples, um reforço (história, estudo, citação de livro, captura de tela) e a aplicação prática. Dentro do capítulo, a pessoa domina a tela e as imagens de apoio entram nos pontos concretos, de 2 a 6 s cada. Ao fim de cada capítulo, uma frase-resumo em cartão.",
    fecha:
      "Recapitulação com a lista de capítulos inteira e cada um marcado, a lição principal em uma frase ao lado da pessoa, e o convite para o próximo passo dito com calma. Pode terminar com a pessoa sorrindo por meio segundo.",
  },
  ritmo: {
    cenaSeg: [2, 6],
    cortesPorMinuto: [15, 25],
    zoom:
      "Punch de 100% para 110% no corte em salto, para marcar ênfase ou disfarçar o corte, alternando com o plano normal; aproximação lenta de 3 a 5% nas imagens de apoio e capturas de tela.",
    observacoes:
      "Cortes em salto tiram toda pausa morta, mas o ritmo alterna trechos rápidos e momentos mais contemplativos. A imagem de apoio entra onde a atenção cai, não em toda frase.",
  },
  tipografia: {
    familias: [
      { papel: "palavra-chave, título de capítulo e lista", familia: "Inter", pesos: "500 e 700", origem: "google-fonts", alternativa: "Manrope" },
      { papel: "citação de livro", familia: "Lora", pesos: "400 itálico e 600", origem: "google-fonts", alternativa: "PT Serif" },
      { papel: "legenda manuscrita do corte vertical e anotação", familia: "Caveat", pesos: "600", origem: "google-fonts", alternativa: "Kalam" },
    ],
    hierarquia:
      "Título de capítulo a 7% a 9% da altura com o número a 14% a 18%; palavra-chave ao lado da pessoa a 5% a 7%; citação a 4% a 5%; rótulo de captura e lista a 3% a 4%.",
    regras: [
      "Minúscula, com maiúscula só onde a língua pede; nunca caixa alta inteira.",
      "Sem contorno e sem sombra dura; no máximo uma sombra suave de 20% para ler sobre imagem.",
      "Uma palavra por frase pode levar a cor de destaque, como sublinhado ou marca-texto, nunca a frase inteira.",
      "Texto alinhado à esquerda, entrelinha de 1,15, muito respiro em volta.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "cartão e papel", hex: "#F6F1E7" },
      { papel: "texto", hex: "#1E1E1E" },
      { papel: "destaque", hex: "#FFC83D" },
      { papel: "acerto", hex: "#5CB176" },
      { papel: "texto secundário", hex: "#8A8580" },
      { papel: "tom quente do cenário", hex: "#C98A4B" },
    ],
    marca:
      "O amarelo de destaque vira a cor da marca: sublinhado e marca-texto da palavra-chave, número do capítulo, check da lista, borda do grifo na captura. O creme e o grafite ficam. Se a marca for escura, ela vai no número e no sublinhado e o marca-texto passa a ser a mesma cor a 25%.",
  },
  elementos: [
    {
      id: "palavra-ao-lado",
      nome: "Palavra-chave ao lado da pessoa",
      forma:
        "Uma a cinco palavras em Inter 700 minúscula ao lado do rosto, a principal sublinhada na cor da marca. Branca ou grafite; o sublinhado tem 6 px de espessura e pontas arredondadas; sem caixa nem fundo quando o cenário é escuro, cartão creme quando é claro.",
      animacao:
        "Letras entram por caractere, cada uma girando de -30 graus e subindo 20 px até o lugar, em cascata de 25 ms e 350 ms no total. O sublinhado corre da esquerda para a direita em 300 ms depois do texto; sai com fade de 200 ms.",
      duracaoSeg: [1.5, 4],
      posicao916: "Acima da cabeça, 16% a 30% da altura. Alinhada à esquerda com margem de 8%.",
      posicao169: "No terço livre ao lado da pessoa, 30% a 60% da altura. A pessoa fica no terço oposto.",
      quando: "O termo, a regra ou o número que resume a frase.",
    },
    {
      id: "cartao-de-capitulo",
      nome: "Cartão de capítulo",
      forma:
        "Cartão creme de tela cheia com número grande na cor da marca e título grafite. Título em Inter 700, textura de papel sutil a 6%, número a 16% da altura e título logo abaixo, alinhados à esquerda.",
      animacao:
        "Entra por papel rasgado: a imagem anterior se rasga na diagonal e as metades saem em 400 ms. O número sobe 30 px com desaceleração em 300 ms e o título vem 120 ms depois.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Texto de 32% a 60% da altura. Margem esquerda 8%.",
      posicao169: "Texto de 30% a 70% da altura. Margem esquerda 8%.",
      quando: "Início de cada capítulo ou dica numerada.",
    },
    {
      id: "citacao-de-livro",
      nome: "Citação de livro",
      forma:
        "Cartão de papel com a citação em Lora itálica ao lado de um livro desenhado em código. O livro é um retângulo da cor da marca com lombada; autor e obra em Inter 500 cinza; aspas grandes na cor da marca no canto superior; a frase central do trecho com marca-texto.",
      animacao:
        "O cartão desliza 40 px de baixo com leve rotação de 2 graus em 350 ms. A citação aparece por linha a cada 150 ms e o marca-texto passa quando a pessoa lê aquele trecho.",
      duracaoSeg: [3, 6],
      posicao916: "Centro, 22% a 62% da altura. Largura de 84%.",
      posicao169: "Centro ou dois terços à direita, 18% a 82% da altura.",
      quando: "\"Como diz o livro\", estudo, frase de autor.",
    },
    {
      id: "captura-flutuante",
      nome: "Captura de tela flutuante",
      forma:
        "Janela de cantos arredondados e sombra suave com a tela citada, o trecho que importa num retângulo da cor da marca. Cantos de 16 px, sombra de 30 px a 25%, sobre o fundo desfocado; o retângulo tem borda de 4 px e o resto da janela escurece 30%.",
      animacao:
        "Sobe 60 px com escala 96% para 100% em 400 ms e flutua com aproximação lenta. O retângulo de destaque se desenha em 300 ms e a câmera aproxima até ele.",
      duracaoSeg: [2.5, 6],
      posicao916: "Centro, 20% a 66% da altura. Largura de 86%.",
      posicao169: "Centro, 12% a 86% da altura, ou à direita com a pessoa à esquerda.",
      quando: "Ferramenta, aplicativo, site, planilha, resultado mostrado.",
    },
    {
      id: "lista-com-check",
      nome: "Lista com check",
      forma:
        "Itens com caixa de seleção; concluídos com check na cor da marca e texto cinza, o atual em grafite. Inter 500 e 700; cartão creme ou texto direto sobre o cenário escurecido 40%.",
      animacao: "Itens entram em cascata de 100 ms subindo 16 px. O check se desenha em 250 ms com um clique suave.",
      duracaoSeg: [2, 5],
      posicao916: "De 22% a 66% da altura. Margem esquerda 8%.",
      posicao169: "Terço livre ao lado da pessoa, ou centro em cartão.",
      quando: "Recapitulação, passos, \"três coisas\".",
    },
    {
      id: "diagrama-simples",
      nome: "Diagrama simples",
      forma:
        "Infográfico de poucas peças (dois círculos que se cruzam, matriz 2x2, eixo, pirâmide). Traço de 4 px grafite, rótulos em Inter 500, a parte que importa preenchida com a cor da marca a 30%.",
      animacao: "Peças entram uma por vez em 250 ms com escala de 90% para 100%. O preenchimento acende quando a pessoa nomeia a parte.",
      duracaoSeg: [3, 7],
      posicao916: "Centro, 20% a 64% da altura.",
      posicao169: "Dois terços do quadro, a pessoa reduzida ou fora.",
      quando: "Ideia abstrata, comparação de dois critérios, modelo mental.",
    },
    {
      id: "legenda-frase-manuscrita",
      nome: "Legenda frase a frase (corte vertical)",
      forma:
        "Frase de 3 a 8 palavras em Caveat minúscula branca ao lado da pessoa, UMA palavra na cor da marca. Em 2 ou 3 linhas; usada no corte vertical, sobre imagem em preto e branco com só a cor da marca viva.",
      animacao: "Cada frase aparece inteira em 150 ms de fade com subida de 8 px. Troca na pausa natural da fala, nunca palavra a palavra.",
      duracaoSeg: [1.5, 3.5],
      posicao916: "À esquerda da pessoa, 30% a 64% da altura. Margem esquerda 7%; a pessoa um pouco à direita do centro.",
      posicao169: "Não se usa no 16:9. No horizontal vale a palavra-chave ao lado.",
      quando: "O corte vertical inteiro, enquanto há fala.",
    },
  ],
  insercoesGeradas: {
    quando: "De 3 a 6 por minuto, curtas (2 a 5 s), nos pontos concretos que o cliente não filmou: o exemplo, o lugar, a ação.",
    tipos: [
      "plano de detalhe com luz quente e fundo desfocado (mãos escrevendo num caderno, xícara na mesa, tela de notebook vista de lado)",
      "cena cotidiana do exemplo citado, em cor natural e quente, câmera estável",
      "objeto simbólico isolado sobre mesa de madeira clara (relógio, livro fechado, planta)",
    ],
    nunca: "texto, número, interface ou capa de livro desenhados pelo modelo; marca de terceiros; imagem saturada, dramática ou de banco corporativo.",
  },
  som: {
    trilha: "Lo-fi ou acústico leve e otimista, 70 a 95 batidas por minuto, bem baixo, trocando de faixa a cada capítulo.",
    efeitos: ["papel rasgando na troca de capítulo", "whoosh suave na entrada de cartão", "página virando na citação", "clique leve no check", "papel amassado ao descartar uma ideia"],
    mixagem: "Voz a -14 LUFS, quente e próxima; trilha a -28 dB; efeitos baixos e macios, nunca acima da voz.",
  },
  nunca: [
    "Caixa alta inteira, contorno preto, sombra dura ou tremor.",
    "Legenda palavra a palavra ou amarelo saturado chapado em tudo.",
    "Punch acima de 115% ou zoom de impacto.",
    "Imagem de apoio em toda frase; a pessoa é a âncora.",
    "Cenário frio, luz azulada ou fundo vazio sem desfoque.",
    "Abrir com logo, vinheta ou apresentação.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 5 dicas",
      edicao:
        "Lista com check de 5 itens ao lado dela, o 1 em grafite e os outros cinza; papel rasgado e cartão \"1\" com o título; volta para ela com a palavra-chave ao lado; no meio, captura de tela ou imagem de apoio onde ela dá o exemplo; na troca, a lista volta com o 1 marcado e o 2 aceso.",
    },
    {
      quando: "O começo",
      edicao: "Pergunta olhando para a câmera, a frase-chave entrando por caractere ao lado do rosto, promessa em uma frase e os títulos dos capítulos passando em cartões de 0,5 s.",
    },
    {
      quando: "Ela cita um livro ou estudo",
      edicao: "Cartão de citação com o livro desenhado em código, a frase central grifada quando ela lê; volta para ela com punch de 108%.",
    },
    {
      quando: "Ela mostra uma ferramenta (\"eu uso esta planilha\")",
      edicao: "Captura flutuante da planilha, retângulo na cor da marca se desenhando na coluna citada, aproximação lenta até ela.",
    },
    {
      quando: "Ela explica uma ideia abstrata (\"urgente não é importante\")",
      edicao: "Matriz 2x2 com os eixos rotulados, o quadrante importante e não urgente acendendo na cor da marca quando ela o nomeia.",
    },
    {
      quando: "Ela dá um exemplo do cotidiano",
      edicao: "Inserção de 3 s de mãos anotando num caderno com luz quente, a voz por cima; volta para ela no corte em salto com punch de 110%.",
    },
    {
      quando: "Corte vertical de 40 s",
      edicao: "Imagem em preto e branco com só a cor da marca viva, legenda manuscrita frase a frase à esquerda dela, uma palavra colorida por frase, plano trocando a cada 2 a 5 s.",
    },
    {
      quando: "O fecho",
      edicao: "Lista de capítulos inteira com todos os checks, a lição principal ao lado dela com sublinhado na cor da marca, convite dito com calma, meio segundo de sorriso.",
    },
  ],
  quadrosDeReferencia: [
    "Plano médio da pessoa levemente de lado num cômodo quente e desfocado, com estante e planta ao fundo; à esquerda do rosto, duas palavras em minúscula sem serifa branca, a segunda sublinhada em amarelo.",
    "Cartão creme de tela cheia com um número \"2\" grande na cor de destaque e o título do capítulo em grafite alinhado à esquerda; borda de papel rasgado saindo pela diagonal.",
    "Corte vertical em preto e branco: a pessoa à direita do centro e, à esquerda dela, três linhas de letra manuscrita branca em minúscula com uma palavra em amarelo.",
  ],
  fontes: [
    "https://sendshort.ai/guides/ali-abdaal-style/ (Inter e TT Fors, Spin-In by Character, papel rasgado, cenário quente com estante e fundo desfocado, papel amassado e página virando)",
    "https://www.choppity.com/tools/recreate-video-editing-style/ali-abdaal/ (corte vertical: preto e branco com amarelo, legenda manuscrita frase a frase à esquerda, plano de 2 a 5 s, trilha lo-fi baixa)",
    "https://techbullion.com/an-ultimate-guide-to-ali-abdaal-video-editing-style-and-methods/ (texto animado, infográfico simplificado, cortes em salto, alternância de ritmo)",
    "https://www.submagic.co/blog/make-shorts-like-ali-abdaal",
    "docs/estilos-de-edicao-de-video.md, ficha 9 (15 a 25 cortes por minuto, punch de 10%, capítulos e telas de livro)",
  ],
};

export const TEXTO_ALI_ABDAAL = textoParaOPrompt(ALI_ABDAAL);
