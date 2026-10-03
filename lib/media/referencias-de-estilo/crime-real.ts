import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * INVESTIGAÇÃO, LINGUAGEM DE SÉRIE DE CRIME REAL (03/10/2026).
 *
 * O que as fontes dão: o quadro de cortiça com fotos, alfinetes e linha
 * vermelha ligando as pistas (o padrão das aberturas e promos do gênero, com
 * câmera em trilho passando rente ao quadro); a estrutura de "abertura fria e
 * gancho a cada cinco minutos" das séries de streaming; a preferência por
 * material de câmera de segurança e documento; a trilha com batidas graves de
 * filme de suspense. Para negócio, a linguagem vira ESTUDO DE CASO: o
 * problema é o crime, os números são as provas.
 */
export const CRIME_REAL: ReferenciaDeEstilo = {
  id: "crime-real",
  nome: "Investigação",
  inspiracao: "séries documentais de crime real",
  essencia:
    "Um caso sendo montado na frente do espectador. A pessoa é a investigadora: luz dura de um lado, sombra funda do outro, fundo escuro. A ideia central vive num QUADRO DE CORTIÇA com fotos instantâneas, recortes, fichas e documentos presos por alfinetes, ligados por linha vermelha; a câmera passa rente ao quadro e cada pista nova é presa e ligada às outras. Documentos ocupam a tela inteira com marca-texto na frase que importa. Tensão constante: cor fria e dessaturada, grão, trilha grave, revelação com flash e batida.",
  estrutura: {
    abre:
      "Abertura fria com a revelação do meio (o número do prejuízo, a frase que entrega o culpado) em plano escuro com batida grave, sem explicar; depois \"vamos voltar ao começo\": o quadro de cortiça vazio com uma foto só, e o título do caso datilografado numa ficha presa por alfinete.",
    avanca:
      "Pista por pista: a pessoa apresenta a prova, a prova vai para a tela (documento grifado, foto, número), a câmera volta ao quadro e a pista é presa e ligada por linha vermelha. Uma pista falsa ou uma dúvida a cada 2 a 4 minutos. Cronologia com data e hora datilografadas.",
    fecha:
      "A revelação: o quadro inteiro visto de longe, as linhas convergindo para a causa, que recebe um círculo vermelho; flash branco e batida; a pessoa diz a conclusão e a lição. Ficha final \"CASO ENCERRADO\" ou a pergunta que fica.",
  },
  ritmo: {
    cenaSeg: [2.5, 6],
    cortesPorMinuto: [12, 22],
    zoom:
      "Aproximação lenta e constante em tudo (100% para 106%), como câmera em trilho; deslize lateral rente ao quadro de cortiça com profundidade curta; zoom de impacto só na revelação.",
    observacoes:
      "Uma nova pista a cada 20 a 40 s. Silêncio de 0,5 a 1 s antes de cada revelação. Documentos ficam tempo suficiente para ler a frase grifada (mínimo 3 s).",
  },
  tipografia: {
    familias: [
      { papel: "fichas, datas, rótulos", familia: "Special Elite", pesos: "400 (máquina de escrever)", origem: "google-fonts", alternativa: "Courier Prime 700" },
      { papel: "título do caso e capítulos", familia: "Bebas Neue", pesos: "400, caixa alta espaçada", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "anotação no quadro", familia: "Permanent Marker", pesos: "400", origem: "google-fonts" },
      { papel: "documento", familia: "IBM Plex Mono", pesos: "400", origem: "google-fonts", alternativa: "Liberation Sans local" },
    ],
    hierarquia:
      "Título do caso a 6% a 8% da altura, caixa alta espaçada +15%. Ficha datilografada a 3% a 4%. Data e hora a 2,5%. Anotação no quadro a 4%, torta.",
    regras: ["Texto de documento sempre legível na frase grifada; o resto pode desfocar.", "Carimbo (CONFIDENCIAL, ARQUIVADO) só uma vez por vídeo."],
  },
  paleta: {
    tipica: [
      { papel: "fundo e sombra", hex: "#0E0F11" },
      { papel: "cortiça", hex: "#9C7A54" },
      { papel: "papel de ficha", hex: "#E9E3D3" },
      { papel: "linha e círculo", hex: "#C1121F" },
      { papel: "marca-texto", hex: "#F4E04D" },
      { papel: "luz fria", hex: "#7F96A6" },
    ],
    marca:
      "A linha vermelha é a linha; a cor da marca vai nos alfinetes e na etiqueta do título do caso. A correção de cor é fria e dessaturada, com a pele um pouco quente para não ficar morta.",
  },
  elementos: [
    {
      id: "quadro-cortica",
      nome: "Quadro de cortiça",
      forma:
        "Cortiça em tela cheia com fotos instantâneas, fichas e recortes presos por alfinetes coloridos, ligados por linha vermelha esticada. Luz dura de cima formando sombra de cada papel; vinheta escura nas bordas.",
      animacao: "A câmera virtual desliza rente ao quadro (3% em 4 s) com profundidade curta; a pista nova é presa (escala 104% para 100%, 2 quadros) e a linha se estica até ela em 500 ms.",
      duracaoSeg: [3, 8],
      posicao916: "Tela cheia; a pista nova entre 25% e 70% da altura.",
      posicao169: "Tela cheia; a pista nova no terço central.",
      quando: "Cada pista nova e cada vez que a história liga duas ideias.",
    },
    {
      id: "documento-grifado",
      nome: "Documento com marca-texto",
      forma:
        "Página de documento, contrato, extrato ou e-mail em tela cheia, levemente inclinada, com a frase que importa grifada de amarelo e o resto desfocado 2 px. Granulação e luz dura lateral.",
      animacao: "Corte seco para o documento, aproximação lenta até a frase, grifo correndo da esquerda para a direita em 500 ms no momento em que é dita.",
      duracaoSeg: [3, 6],
      posicao916: "Tela cheia, frase grifada a 40% a 55% da altura.",
      posicao169: "Tela cheia, frase no centro.",
      quando: "Prova documental, número de relatório, cláusula, mensagem.",
    },
    {
      id: "ficha-datilografada",
      nome: "Ficha datilografada",
      forma: "Cartão de papel com texto de máquina de escrever (nome, data, valor) e um alfinete em cima, girado 2 a 4 graus.",
      animacao: "O texto digita letra a letra (35 ms) com som de tecla; o cartão desliza 20 px.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 62% a 74% da altura.",
      posicao169: "Terço inferior esquerdo.",
      quando: "Apresentar pessoa, empresa, data ou valor.",
    },
    {
      id: "linha-vermelha",
      nome: "Linha que liga",
      forma: "Fio vermelho de 3 px entre dois alfinetes, levemente curvo pela gravidade, com sombra fina.",
      animacao: "Estica do primeiro alfinete ao segundo em 400 a 600 ms com leve quique no fim.",
      duracaoSeg: [1, 3],
      posicao916: "Sobre o quadro.",
      posicao169: "Sobre o quadro.",
      quando: "\"Isso tem a ver com aquilo\", causa e consequência.",
    },
    {
      id: "carimbo-data",
      nome: "Data e hora de registro",
      forma: "Data e hora no formato de registro (\"14/03/2024 23:47\") em mono branca com ponto vermelho piscando, como câmera de segurança.",
      animacao: "Aparece seco e o ponto pisca a cada 500 ms.",
      duracaoSeg: [2, 4],
      posicao916: "Canto superior esquerdo, 14% a 18% da altura.",
      posicao169: "Canto superior esquerdo.",
      quando: "Momento cronológico do caso.",
    },
    {
      id: "revelacao-flash",
      nome: "Revelação com flash",
      forma: "Quadro branco total de 2 a 3 quadros seguido da imagem da revelação em contraste alto, com círculo vermelho à mão.",
      animacao: "Flash, zoom de impacto de 100% para 115% em 150 ms, o círculo se desenha em 400 ms.",
      duracaoSeg: [1.5, 3],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "A causa, o culpado, o número final.",
    },
  ],
  insercoesGeradas: {
    quando: "Para reconstituir o caso: 2 a 4 por minuto, sempre escuras e sem rosto identificável.",
    tipos: [
      "reconstituição de costas ou em silhueta (mão na maçaneta, pessoa no corredor), luz dura e fria",
      "plano de detalhe de objeto-prova sobre mesa de metal, luz de cima",
      "imagem com cara de câmera de segurança, granulada, alto ângulo, cor lavada",
      "lugar vazio à noite com uma luz acesa",
    ],
    nunca: "rosto de pessoa real, sangue ou violência gráfica, documento com texto gerado pelo modelo (documento é código ou material do cliente).",
  },
  som: {
    trilha: "Suspense em camadas: drone grave, pulso de sintetizador e piano esparso, 70 a 95 batidas por minuto, crescendo até cada revelação.",
    efeitos: ["batida grave (boom) em cada revelação", "som de alfinete e papel no quadro", "tecla de máquina de escrever nas fichas", "estática curta nas imagens de câmera de segurança", "respiração de silêncio antes da prova"],
    mixagem: "Voz a -15 LUFS, seca e próxima; trilha a -24 dB, subindo nos planos sem fala; graves fortes mas curtos.",
  },
  nunca: [
    "Cor saturada, alegre ou fundo claro.",
    "Emoji, legenda palavra a palavra amarela, efeito cômico.",
    "Violência gráfica ou acusação a pessoa real identificável.",
    "Documento ilegível na frase que importa.",
    "Revelar a conclusão antes do fim (a abertura mostra, não explica).",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 4 erros que quebraram a empresa",
      edicao:
        "Quadro de cortiça com 4 fichas viradas e desfocadas; a 1 é desvirada e iluminada (\"ERRO 1\" datilografado); corte para o documento que prova, grifado; volta para a pessoa em luz dura; ao passar ao erro 2, o quadro volta com a linha vermelha ligando o 1 ao 2.",
    },
    {
      quando: "O começo",
      edicao: "Plano escuro com o número final do caso e boom grave; \"vamos voltar ao começo\"; quadro vazio com uma foto e a ficha do título digitando.",
    },
    {
      quando: "Ela mostra uma prova (\"olha o que estava no contrato\")",
      edicao: "Corte seco para o contrato em tela cheia, aproximação até a cláusula, grifo amarelo na palavra dita, silêncio de 1 s.",
    },
    {
      quando: "Ela narra o momento exato em que algo aconteceu",
      edicao: "Reconstituição de costas, granulada como câmera de segurança, com data e hora no canto e ponto vermelho piscando.",
    },
    {
      quando: "Ela liga duas ideias",
      edicao: "A câmera desliza rente ao quadro de uma foto a outra enquanto a linha vermelha se estica entre elas.",
    },
    {
      quando: "A revelação",
      edicao: "Silêncio, flash, quadro inteiro de longe com as linhas convergindo para uma ficha, círculo vermelho nela, boom; plano fechado na pessoa dizendo a conclusão.",
    },
  ],
  quadrosDeReferencia: [
    "Quadro de cortiça escuro, visto de perto em diagonal com profundidade curta: fotos instantâneas, fichas datilografadas e recortes presos por alfinetes, ligados por linhas vermelhas esticadas; luz dura de cima e vinheta escura.",
    "Página de documento em tela cheia, levemente inclinada e granulada, com uma frase grifada em amarelo nítida e o resto do texto desfocado.",
    "A pessoa em plano médio com luz dura de um lado e o outro lado do rosto na sombra, fundo quase preto, cor fria e dessaturada; ficha de papel datilografada no canto inferior esquerdo.",
  ],
  fontes: [
    "https://filmmakermagazine.com/126596-how-true-crime-series-are-edited/ (abertura fria, gancho a cada cinco minutos, câmera de segurança, reconstituição de costas, batidas de suspense)",
    "https://www.secondhomestudios.com/portfolio/amc-true-crime-evidence-board/ (quadro de alfinete e linha vermelha, câmera em trilho rente ao quadro, linha estendida na pós)",
    "https://elements.envato.com/evidence-board-with-red-strings-2d-object-animatio-6ZFGBHQ e o tutorial https://www.youtube.com/watch?v=BWFzvwnJmwI (quadro animado estilo Netflix)",
    "https://invideo.io/blog/ai-video-prompt-formats-true-crime-creators/ (três pistas ligadas, aproximação em documento com paralaxe, cor escura constante)",
    "https://en.wikipedia.org/wiki/The_Jinx_(TV_series) (mistura de arquivo, reconstituição e entrevista)",
  ],
};

export const TEXTO_CRIME_REAL = textoParaOPrompt(CRIME_REAL);
