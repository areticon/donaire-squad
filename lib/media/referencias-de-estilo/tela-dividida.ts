import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * TELA DIVIDIDA E REAÇÃO, ANTES E DEPOIS (03/10/2026).
 *
 * O que a pesquisa deu: no vertical, a divisão empilhada (em cima e embaixo)
 * mantém os rostos grandes; duas metades é o ponto de partida mais claro, uma
 * relação direta por vez. Divisor fino (2 a 4 px) ou vão limpo, nunca borda
 * grossa animada. Rótulo curto por lado (ANTES / DEPOIS), no alto de cada
 * metade, longe das bordas, com uma só cor de acento; as duas metades na mesma
 * escala, cor e brilho. Reação chega uma batida depois do momento comentado,
 * nunca antes. Áudio com hierarquia: uma voz principal, a outra fonte baixa,
 * legenda para não perder o contexto. Divisão entra no gancho, na revelação
 * ou na comparação, não o vídeo inteiro por obrigação.
 */
export const TELA_DIVIDIDA: ReferenciaDeEstilo = {
  id: "tela-dividida",
  nome: "Tela dividida e reação",
  inspiracao: "vídeos de reação, comentário de notícia e comparações de antes e depois das redes",
  essencia:
    "Duas coisas lado a lado para o espectador julgar junto: a pessoa e o que ela comenta, ou o antes e o depois. O quadro se parte em duas metades limpas com um divisor fino, cada metade com um rótulo curto, e a comparação é marcada por X vermelho e check verde que batem na hora da conclusão. A pessoa reage uma batida depois do que aparece, e a edição corta seco, rápido, entre tela dividida e tela cheia. Cor natural; a graça é o contraste entre as duas metades, não o efeito.",
  estrutura: {
    abre:
      "O momento mais forte do material comentado em tela cheia por 1 a 2 s, corte seco para a divisão com a reação da pessoa embaixo (ou ao lado) e a frase de gancho; rótulos das duas metades entram já no primeiro segundo da divisão.",
    avanca:
      "Ciclos de mostra, pausa e comenta: o material roda na metade de cima, congela no ponto a comentar com um contorno, a pessoa explica (às vezes em tela cheia por 3 a 8 s), e volta a divisão. Em antes e depois, cada critério é um par com veredito X e check.",
    fecha:
      "Placar final com as duas metades lado a lado e o veredito de cada critério empilhado, a pessoa em tela cheia dando a opinião final, e a chamada para comentar qual lado o espectador escolhe.",
  },
  ritmo: {
    cenaSeg: [2, 5],
    cortesPorMinuto: [16, 30],
    zoom:
      "Punch de 110% na metade da pessoa na reação forte; zoom de 130% a 160% dentro da metade do material para mostrar o detalhe. A divisão em si não se move.",
    observacoes:
      "Reação entra 6 a 12 quadros depois do momento. Tela dividida em 50% a 70% do tempo, o resto em tela cheia. Rótulos ficam o tempo todo da divisão; veredito na palavra da conclusão.",
  },
  tipografia: {
    familias: [
      { papel: "rótulo da metade e veredito", familia: "Inter", pesos: "800, caixa alta", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "legenda da fala", familia: "Montserrat", pesos: "700", origem: "google-fonts" },
      { papel: "VS e placar", familia: "Anton", pesos: "400", origem: "google-fonts e local" },
    ],
    hierarquia:
      "Rótulo a 3% da altura dentro de pílula. VS a 7%. Legenda da fala a 4% a 4,5%, até 2 linhas, frase inteira (não palavra a palavra). Fonte do material comentado a 2%.",
    regras: [
      "Um rótulo por metade, de 1 a 3 palavras, sempre no mesmo lugar dentro dela.",
      "Legenda junto da metade de quem fala, nunca atravessando o divisor.",
      "Texto branco com contorno escuro de 3 px ou sobre pílula, sem brilho.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "divisor", hex: "#FFFFFF" },
      { papel: "pílula de rótulo", hex: "#111111" },
      { papel: "acento da marca", hex: "#7C3AED" },
      { papel: "errado e antes", hex: "#EF4444" },
      { papel: "certo e depois", hex: "#22C55E" },
      { papel: "legenda", hex: "#FFFFFF" },
    ],
    marca:
      "A cor da marca vai no rótulo do lado do cliente (o DEPOIS, o NOSSO), no VS e na legenda destacada; o outro lado fica em neutro escuro. Vermelho e verde são só do veredito; se a marca for vermelha ou verde, o veredito vira X e check brancos sobre círculo da marca e cinza.",
  },
  elementos: [
    {
      id: "divisao-empilhada",
      nome: "Divisão em duas metades",
      forma:
        "Quadro partido em duas metades iguais com divisor branco de 4 px; no 9:16 em cima e embaixo, no 16:9 lado a lado. Cada metade recorta o próprio vídeo na mesma escala de rosto e no mesmo brilho; proporção 50/50, ou 60/40 quando o material precisa de largura.",
      animacao: "O divisor corre do centro para as bordas em 250 ms e as metades deslizam de lados opostos. Entrada em 300 ms com desaceleração; saída por corte seco.",
      duracaoSeg: [3, 20],
      posicao916: "Divisor a 50% da altura; em 60/40, a 55%. Metade de baixo com o rosto acima de 76%, por causa da legenda da rede.",
      posicao169: "Divisor a 50% da largura. Rostos na altura dos olhos de cada metade.",
      quando: "Reação, comparação, antes e depois, \"olha isso\".",
    },
    {
      id: "rotulo-da-metade",
      nome: "Rótulo de cada metade",
      forma:
        "Pílula escura ou da cor da marca com 1 a 3 palavras em caixa alta (ANTES, DEPOIS, ELES, NÓS). Raio total, altura de 4,5% da altura; pílula do lado do cliente na cor da marca.",
      animacao: "Cai 12 px com fade em 200 ms, um lado depois do outro com 100 ms. Fica fixo.",
      duracaoSeg: [3, 20],
      posicao916: "Alto de cada metade, centrado. A 16% e a 53% da altura.",
      posicao169: "Alto de cada metade, centrado. A 8% da altura.",
      quando: "Junto com a divisão, sempre.",
    },
    {
      id: "veredito-x-check",
      nome: "Veredito X e check",
      forma:
        "Círculo vermelho com X branco sobre o lado errado e círculo verde com check sobre o certo. Diâmetro de 12% da largura; traço de 10 px; contorno branco de 4 px.",
      animacao: "Batem com escala 1,4 para 1 em 180 ms e tremor de 2 graus. O X primeiro, o check 250 ms depois; o lado do X escurece 30%.",
      duracaoSeg: [1.5, 3],
      posicao916: "Centro de cada metade. Deslocado para não cobrir rosto.",
      posicao169: "Centro de cada metade.",
      quando: "A palavra da conclusão (\"errado\", \"assim não\", \"faz assim\").",
    },
    {
      id: "vs-central",
      nome: "VS no divisor",
      forma: "\"VS\" em condensada dentro de um círculo da cor da marca, sobre o divisor. Diâmetro de 14% da largura; contorno branco.",
      animacao: "Gira de -20 a 0 graus e cresce de 0 a 1 com rebote em 300 ms. Sai com a divisão.",
      duracaoSeg: [1, 2.5],
      posicao916: "Sobre o divisor, a 50% da altura. Centrado.",
      posicao169: "Sobre o divisor, no centro. Ou a 30% da altura se cobrir rostos.",
      quando: "Abertura de uma comparação direta entre duas opções.",
    },
    {
      id: "congelado-com-contorno",
      nome: "Quadro congelado com contorno",
      forma:
        "A metade do material congela e o detalhe comentado ganha um retângulo arredondado de traço 5 px na cor da marca. O resto da metade escurece 40%; indicador de pausa (duas barras) no canto.",
      animacao: "Congela seco com flash branco de 2 quadros. O contorno se desenha em 300 ms e a metade aproxima de 100% para 130% em 500 ms.",
      duracaoSeg: [2, 6],
      posicao916: "Metade de cima, de 14% a 49% da altura. Indicador no canto superior esquerdo dela.",
      posicao169: "Metade do material. Indicador no canto superior dela.",
      quando: "\"Para aqui\", \"repara nisso\", o ponto exato a comentar.",
    },
    {
      id: "cortina-antes-depois",
      nome: "Cortina de antes e depois",
      forma:
        "As duas imagens sobrepostas no mesmo enquadramento, com uma linha vertical branca e uma alça redonda que revela o depois. Alça de 6% da largura com setas; rótulos ANTES e DEPOIS nos cantos de cima.",
      animacao: "A linha varre da esquerda para a direita em 1,2 s com desaceleração. Volta até o meio e para.",
      duracaoSeg: [2.5, 5],
      posicao916: "Tela cheia ou metade de cima. Rótulos a 16% da altura.",
      posicao169: "Tela cheia. Rótulos a 8% da altura.",
      quando: "Resultado visual do mesmo lugar ou objeto (reforma, design, foto, tela).",
    },
    {
      id: "placar",
      nome: "Placar de critérios",
      forma:
        "Tabela de duas colunas com os rótulos no topo e uma linha por critério, cada célula com X ou check. Linhas de 1 px a 30%; critério em Inter 600 a 3%.",
      animacao: "Linhas entram de cima com 150 ms de intervalo. A coluna vencedora acende na cor da marca no fim.",
      duracaoSeg: [3, 6],
      posicao916: "De 18% a 72% da altura. Largura de 6% a 88%.",
      posicao169: "Centro, de 15% a 85% da altura. Largura de 20% a 80%.",
      quando: "Fechamento de comparação com vários critérios.",
    },
  ],
  insercoesGeradas: {
    quando: "Raras: o material vem do cliente (vídeo comentado, foto antiga e nova). Gera só a metade que falta num antes e depois ilustrativo, até 2 por minuto.",
    tipos: [
      "a versão errada de uma cena simples (mesa bagunçada, vitrine vazia) para a metade ANTES",
      "plano de apoio neutro do tema para a metade oposta à pessoa enquanto ela explica",
    ],
    nunca: "fingir que imagem gerada é o depois real do cliente, texto, número, gráfico ou interface desenhado por modelo, rosto de terceiro reconhecível, vídeo, marca ou logo de concorrente reproduzido sem ser o material comentado pelo cliente.",
  },
  som: {
    trilha: "Batida leve de hip-hop ou eletrônica, 95 a 115 batidas por minuto, baixa; some quando o material comentado tem áudio.",
    efeitos: ["campainha de erro curta no X", "ding brilhante no check", "whoosh curto quando a tela divide", "toca-discos parando no congelado"],
    mixagem: "Uma voz principal a -14 LUFS; o material comentado a -22 dB enquanto a pessoa fala e a -16 dB quando ela escuta; nunca as duas vozes cheias juntas; trilha a -28 dB.",
  },
  nunca: [
    "Metades em escalas, cores ou brilhos diferentes sem querer.",
    "Divisor grosso, animado ou colorido; mais de duas metades.",
    "Legenda atravessando o divisor ou na faixa de baixo do 9:16.",
    "Reação antes do momento que ela comenta.",
    "Tela dividida o vídeo inteiro sem pausa em tela cheia.",
    "Veredito antes da fala que conclui.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Tela cheia com a lista dos 7; desfoca 6, destaca o 1; divide: em cima, o jeito errado do passo 1 com rótulo ANTES, embaixo, a pessoa com rótulo DEPOIS; ela explica, X e check batem na conclusão; no meio, congelados com contorno conforme ela aponta; ao trocar de passo, a lista volta com o 1 marcado com check.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Momento mais forte do material em tela cheia por 1,5 s, corte seco para a divisão com a reação embaixo e o gancho dito; rótulos caem.",
    },
    {
      quando: "Ela comenta um vídeo de concorrente ou notícia",
      edicao: "Material em cima, pessoa embaixo; congela no ponto com contorno, ela explica em tela cheia por 5 s, a divisão volta e o material segue.",
    },
    {
      quando: "Ela mostra o resultado de um cliente",
      edicao: "Cortina de antes e depois em tela cheia, a linha varre devagar; punch na pessoa reagindo.",
    },
    {
      quando: "Ela compara duas opções",
      edicao: "Divisão com VS no centro, um critério por vez, X e check em cada um; placar no fim.",
    },
    {
      quando: "Ela reage com surpresa",
      edicao: "Punch de 110% na metade dela 8 quadros depois do momento, material parado no quadro do susto.",
    },
    {
      quando: "O fecho",
      edicao: "Placar com a coluna vencedora acesa, pessoa em tela cheia com a opinião final, legenda pedindo para comentar o lado preferido.",
    },
  ],
  quadrosDeReferencia: [
    "Tela vertical partida ao meio por uma linha branca fina: em cima, um vídeo de rede social congelado com um retângulo roxo arredondado em volta de um detalhe e o resto escurecido; embaixo, a pessoa reagindo de olhos arregalados; pílulas \"ELES\" e \"NÓS\" no alto de cada metade.",
    "Duas fotos do mesmo ambiente lado a lado, uma bagunçada à esquerda com círculo vermelho e X branco, uma arrumada à direita com círculo verde e check; pílulas ANTES e DEPOIS no topo de cada lado.",
    "Tabela de duas colunas com cabeçalhos em pílula, cinco linhas de critério com X vermelhos e checks verdes, a coluna da direita destacada na cor da marca.",
  ],
  fontes: [
    "https://shortgenius.com/blog/split-screen-video-editing (divisão empilhada no vertical, divisor fino, legenda sem cruzar o divisor, sincronia da reação, hierarquia de áudio)",
    "https://www.aicoursify.com/blog/using-split-screen-effects-to-compare-examples (rótulo curto por lado, divisor de 2 a 4 px, uma cor de acento, mesma cor e brilho)",
    "https://www.capcut.com/resource/how-to-put-two-videos-side-by-side (reação em cima e embaixo, antes e depois lado a lado, reação uma batida depois)",
    "https://pixflow.net/blog/how-to-make-a-split-screen-video-in-after-effects/ (montagem da divisão e transição)",
  ],
};

export const TEXTO_TELA_DIVIDIDA = textoParaOPrompt(TELA_DIVIDIDA);
