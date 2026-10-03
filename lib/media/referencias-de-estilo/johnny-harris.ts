import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * JORNALISMO DE MAPA, LINGUAGEM DE JOHNNY HARRIS (03/10/2026).
 *
 * O que as análises e tutoriais concordam: mapas animados (GEOlayers e Google
 * Earth Studio no After Effects) com zoom do espaço até o lugar, linhas que se
 * desenham sobre o mapa, e tudo com cara de FEITO À MÃO: textura de papel,
 * setas e círculos desenhados, fotos que parecem presas na parede, granulação,
 * queimado de filme e animação em degraus (gráficos a 12 quadros por segundo
 * dentro de uma edição a 24, então eles "pulam" em vez de deslizar).
 */
export const JOHNNY_HARRIS: ReferenciaDeEstilo = {
  id: "johnny-harris",
  nome: "Jornalismo de mapa",
  inspiracao: "Johnny Harris",
  essencia:
    "Um repórter explicando o mundo sobre a mesa de trabalho dele. Mapas reais com zoom do espaço até a rua, caminhos e fronteiras que se desenham, números colados no lugar onde acontecem. Tudo tem textura e imperfeição: papel, granulação, setas e círculos à mão que tremem, recortes de foto com borda branca e sombra, recortes de jornal rasgados, animação que pula em degraus. Entre os mapas, a pessoa fala para a câmera em lugares reais, com energia de quem descobriu algo. A curiosidade puxa o vídeo: cada resposta abre a próxima pergunta.",
  estrutura: {
    abre:
      "Uma pergunta concreta e intrigante sobre um lugar ou número (\"por que esta linha no mapa existe?\"), mostrada no mapa no segundo zero: zoom do globo até o ponto, círculo à mão em volta. Depois a pessoa na câmera dizendo o que vai descobrir, e um vislumbre da revelação do meio (um mapa que ainda não faz sentido). Título do vídeo como recorte de papel colado.",
    avanca:
      "Investigação em camadas: cada camada é uma pergunta, uma ida ao mapa (zoom, caminho, dado), uma prova (documento, recorte de jornal, foto presa) e a volta para a pessoa com a conclusão parcial. O mapa é o fio: volta várias vezes, cada vez com uma camada a mais desenhada. Pausas de \"espera\" (a pessoa para e reage) marcam as viradas.",
    fecha:
      "O mapa completo com todas as camadas desenhadas, um recuo até o globo, e a pessoa num lugar real dizendo o que isso significa para nós. Fecha com uma reflexão, não com resumo.",
  },
  ritmo: {
    cenaSeg: [2.5, 6],
    cortesPorMinuto: [12, 24],
    zoom:
      "No mapa: zoom contínuo do espaço até o lugar em 3 a 5 s com aceleração no meio; deslizes de câmera virtual entre pontos. Na pessoa: câmera na mão leve, cortes de enquadramento; punch raro. Nas fotos e documentos: aproximação lenta.",
    observacoes:
      "Gráficos animados a 12 quadros por segundo (em degraus) dentro da edição a 24 ou 30. Um elemento novo a cada 3 a 6 s nos trechos de mapa. A pessoa raramente fica mais de 15 s sem um corte para mapa ou prova.",
  },
  tipografia: {
    familias: [
      { papel: "rótulo de mapa e título", familia: "Oswald", pesos: "500 e 700, caixa alta", origem: "google-fonts", alternativa: "Bebas Neue" },
      { papel: "anotação à mão", familia: "Permanent Marker", pesos: "400", origem: "google-fonts", alternativa: "Caveat 700" },
      { papel: "documento e data", familia: "Special Elite", pesos: "400 (máquina de escrever)", origem: "google-fonts", alternativa: "Courier Prime" },
      { papel: "manchete de jornal", familia: "PT Serif", pesos: "700", origem: "google-fonts e local" },
    ],
    hierarquia:
      "Rótulo de país ou cidade a 3% a 4% da altura, caixa alta espaçada +10%. Anotação à mão a 4% a 6%, levemente torta. Número no mapa a 8% a 12% em condensada bold. Datilografado a 2,5% a 3%.",
    regras: [
      "Rótulo de mapa sobre etiqueta de papel branco com sombra curta, ou direto no mapa com contorno fino escuro.",
      "Anotação manuscrita só em frase curta (até 4 palavras) e em português correto.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "papel", hex: "#EFE6D2" },
      { papel: "terra do mapa", hex: "#D9CFB8" },
      { papel: "oceano", hex: "#9DB4C0" },
      { papel: "tinta", hex: "#1A1A1A" },
      { papel: "caminho e destaque", hex: "#D7372F" },
      { papel: "marca-texto", hex: "#F2D544" },
    ],
    marca:
      "O vermelho do caminho e do círculo é o lugar da cor da marca, desde que ela leia sobre papel bege; se não ler, a marca vai na etiqueta do título e o caminho fica vermelho. Mapa sempre dessaturado para o destaque saltar.",
  },
  elementos: [
    {
      id: "zoom-do-globo",
      nome: "Zoom do globo ao lugar",
      forma:
        "Mapa de satélite ou de relevo dessaturado que vai do globo até a cidade ou rua, com a região citada em destaque e o resto escurecido 30%. Contorno da região em traço de 3 px na cor de destaque com leve tremor.",
      animacao: "Zoom de 3 a 5 s com aceleração no meio e pouso suave; o contorno se desenha depois do pouso, em degraus (12 qps), em 700 ms.",
      duracaoSeg: [3, 6],
      posicao916: "Tela cheia; o ponto de pouso a 40% da altura.",
      posicao169: "Tela cheia; o ponto de pouso no centro.",
      quando: "Lugar citado pela primeira vez.",
    },
    {
      id: "caminho-animado",
      nome: "Caminho que se desenha",
      forma:
        "Linha tracejada vermelha de 4 px ligando pontos no mapa, com seta no fim e pontos de parada em círculo vazado. Um ícone recortado (navio, caminhão, avião) com borda branca pode seguir a linha.",
      animacao: "A linha se desenha em degraus no tempo da fala (1 a 3 s), a câmera virtual acompanha a ponta.",
      duracaoSeg: [2, 5],
      posicao916: "Mapa em tela cheia, caminho dentro de 15% a 75% da altura.",
      posicao169: "Mapa em tela cheia, caminho dentro da margem de 5%.",
      quando: "Rota, logística, expansão, migração, \"de A para B\".",
    },
    {
      id: "numero-no-mapa",
      nome: "Número colado no lugar",
      forma:
        "Número grande em condensada bold sobre etiqueta de papel branca com cantos tortos e sombra, presa por um pedaço de fita adesiva. Rótulo curto embaixo em datilografado.",
      animacao: "A etiqueta cai de 110% para 100% com giro de 3 graus em 3 quadros (degraus), som de papel.",
      duracaoSeg: [2, 4],
      posicao916: "Sobre o ponto citado, entre 20% e 70% da altura.",
      posicao169: "Sobre o ponto citado.",
      quando: "Dado regional (população, preço, quantidade por cidade).",
    },
    {
      id: "circulo-a-mao",
      nome: "Círculo e seta à mão",
      forma: "Círculo irregular ou seta em traço de pincel de 5 px, vermelho ou branco, sobre a imagem; ponta da seta aberta.",
      animacao: "Desenha-se como traço de caneta em 400 a 600 ms, em degraus, e treme 1 px a cada 2 quadros enquanto fica.",
      duracaoSeg: [1.5, 4],
      posicao916: "Em volta do detalhe citado.",
      posicao169: "Em volta do detalhe citado.",
      quando: "\"Olha aqui\", \"este ponto\", o detalhe que prova.",
    },
    {
      id: "foto-recortada",
      nome: "Foto recortada com borda",
      forma:
        "Foto ou pessoa recortada com borda branca de 8 px e sombra suave, sobre fundo de papel ou mapa, levemente girada. Pode ter fita adesiva nos cantos.",
      animacao: "Entra em 3 quadros com escala 105% para 100% e oscila 1 grau em degraus enquanto fica.",
      duracaoSeg: [2, 5],
      posicao916: "Faixa de 20% a 60% da altura.",
      posicao169: "Terço lateral ou centro, conforme o mapa.",
      quando: "Pessoa, objeto ou lugar citado.",
    },
    {
      id: "jornal-rasgado",
      nome: "Recorte de jornal rasgado",
      forma:
        "Manchete em serifa sobre papel amarelado com borda rasgada, a frase-chave grifada com marca-texto amarelo. Granulação e leve sépia.",
      animacao: "Desliza 30 px com giro, a câmera aproxima devagar e o grifo passa da esquerda para a direita em 500 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Centro, 22% a 62% da altura.",
      posicao169: "Centro.",
      quando: "Fato histórico, notícia, lei, citação de fonte.",
    },
    {
      id: "grafico-papel",
      nome: "Gráfico sobre papel",
      forma: "Barras ou linha em traço de caneta sobre papel quadriculado, rótulos datilografados, a barra que importa em vermelho.",
      animacao: "Barras crescem em degraus em 600 ms, uma depois da outra.",
      duracaoSeg: [3, 6],
      posicao916: "Faixa de 18% a 70% da altura.",
      posicao169: "Tela cheia ou dois terços.",
      quando: "Comparação de números ditos.",
    },
  ],
  insercoesGeradas: {
    quando: "Para lugares e provas que o cliente não filmou: 2 a 4 por minuto, com tratamento de textura por cima.",
    tipos: [
      "vista aérea ou de satélite de um tipo de lugar (porto, plantação, centro de cidade) para receber caminho e rótulo",
      "foto que parece de arquivo, granulada, para recorte com borda branca",
      "plano de rua com câmera na mão, cor natural, para a voz passar por cima",
    ],
    nunca: "mapa com fronteiras ou nomes desenhados pelo modelo (o mapa e o rótulo são código ou dado real), texto dentro da imagem, ilustração lisa de vetor.",
  },
  som: {
    trilha: "Eletrônica ambiente com sintetizadores quentes e pulso suave, 80 a 110 batidas por minuto, que muda de clima a cada camada da investigação.",
    efeitos: ["papel e fita adesiva em cada recorte", "risco de caneta nos círculos e setas", "whoosh suave no zoom do globo", "máquina de escrever nos rótulos datilografados"],
    mixagem: "Voz a -14 LUFS com presença; trilha a -24 dB; efeitos de foley baixos, táteis.",
  },
  nunca: [
    "Gráfico liso, brilhante, com degradê e animação suave de software corporativo.",
    "Mapa colorido saturado ou com todos os países em cores diferentes.",
    "Legenda palavra a palavra, emoji, punch em toda frase.",
    "Rótulo de mapa errado ou inventado.",
    "Animação a 30 ou 60 quadros fluidos nos grafismos (tem de pular em degraus).",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 3 razões",
      edicao:
        "Uma folha de papel com o título e três linhas datilografadas desfocadas; a 1 aparece nítida com círculo à mão; vai para o mapa daquela razão (zoom, caminho, número colado); volta para a pessoa; na troca, a folha reaparece com a 1 riscada à caneta e a 2 circulada.",
    },
    {
      quando: "O começo",
      edicao: "Zoom do globo até o lugar da pergunta, círculo à mão, a pessoa na câmera fazendo a pergunta, vislumbre do mapa final sem explicação, título em recorte de papel.",
    },
    {
      quando: "Ela fala de uma rota ou expansão (\"saímos de Mogi e chegamos a 4 estados\")",
      edicao: "Mapa do Brasil dessaturado, ponto de partida circulado, caminhos vermelhos se desenhando em degraus até cada estado, etiqueta de papel com o número em cada um.",
    },
    {
      quando: "Ela cita uma notícia ou lei",
      edicao: "Recorte de jornal rasgado entra girando, câmera aproxima, a frase-chave grifada de amarelo no momento em que ela lê.",
    },
    {
      quando: "Ela compara regiões",
      edicao: "Mapa com as duas regiões contornadas, cada uma com etiqueta de número; corte para gráfico de barras em papel quadriculado com a que importa em vermelho.",
    },
    {
      quando: "Ela descobre algo surpreendente",
      edicao: "Corte para ela em plano fechado, pausa de 1 s, a trilha muda; volta para o mapa com a nova camada desenhada por cima das antigas.",
    },
    {
      quando: "O fecho",
      edicao: "Mapa completo com todas as camadas, recuo até o globo em 4 s, a pessoa num lugar real com a reflexão final.",
    },
  ],
  quadrosDeReferencia: [
    "Mapa de relevo dessaturado de uma região, com uma área contornada em vermelho tremido, uma linha tracejada vermelha com seta ligando duas cidades e uma etiqueta de papel branco com um número grande presa por fita adesiva; granulação de filme em tudo.",
    "Fundo de papel bege texturizado com uma foto recortada com borda branca e sombra, levemente girada, um círculo vermelho desenhado à mão em volta de um detalhe e uma anotação manuscrita curta ao lado.",
    "Recorte de jornal amarelado com borda rasgada sobre uma mesa, manchete serifada preta e uma frase grifada em amarelo; leve sépia e luz quente.",
  ],
  fontes: [
    "https://aescripts.com/learn/post/create-a-johnny-harris-style-animated-map-montage e /making-maps-for-johnny-harris---volcanoes (GEOlayers, câmera do espaço ao lugar)",
    "https://www.premiumbeat.com/blog/making-maps-for-johnny-harris/ (Jason Boone, mapas de vulcões, Chipre, Ucrânia)",
    "https://motionarray.com/learn/premiere-pro/edit-documentary-in-premiere-pro/ (resumo da busca: papel, setas à mão, fotos presas na parede, animação em degraus a 12 qps, granulação, queimado de filme)",
    "https://indianfunmedia.com/master-the-johnny-harris-style-newspaper-animation-in-after-effects/ (jornal rasgado, máquina de escrever, sépia)",
    "https://sigmaeditor.com/this-tool-makes-map-animation-videos-like-vox-and-johnny-harris/ e Google Earth Studio",
  ],
};

export const TEXTO_JOHNNY_HARRIS = textoParaOPrompt(JOHNNY_HARRIS);
