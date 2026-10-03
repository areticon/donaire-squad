import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * BASTIDOR E VLOG DE FUNDADOR, LINGUAGEM DE CASEY NEISTAT (03/10/2026).
 *
 * O que a pesquisa deu: arco clássico comprimido (abertura fria, pista do que
 * vem, preparação, o feito, fechamento), com mini-arcos dentro; a música
 * escolhida ANTES da edição e os cortes no tempo dela; cortes em salto na
 * selfie de grande angular; chicote de câmera (whip pan) entre lugares;
 * timelapse para pular tempo morto; títulos e "marcadores de capítulo
 * físicos" (texto escrito à mão, cartazes filmados, stop motion feito à mão);
 * títulos em condensada bold branca (Futura Condensed Extra Bold, Helvetica
 * e Gotham nas épocas do canal); algo novo a cada 30 s; cor contrastada,
 * levemente fria e dessaturada, tratada por último.
 */
export const VLOG: ReferenciaDeEstilo = {
  id: "vlog",
  nome: "Bastidor e vlog de fundador",
  inspiracao: "Casey Neistat",
  essencia:
    "Um dia de verdade contado como um pequeno filme. A gravação do cliente é a estrela: selfie de grande angular com a câmera na mão, plano aberto do lugar, detalhe das mãos trabalhando, a rua, o carro, a equipe. A edição corta no tempo da música, salta dentro da fala, gira a câmera num chicote para trocar de lugar e acelera o tempo morto num timelapse. Os textos parecem feitos à mão: lugar e hora em letra condensada branca, anotações de marcador sobre a imagem, cartão de capítulo que parece filmado em cima da mesa. Cor contrastada e um pouco fria, imperfeições mantidas. Energia de quem está construindo algo agora.",
  estrutura: {
    abre:
      "Abertura fria no meio da ação (o momento mais vivo do dia, 3 a 6 s, sem explicação), depois uma pista do que vai acontecer dita na selfie (\"hoje a gente entrega a primeira obra\") e o título do vídeo em condensada branca grande sobre um plano aberto do lugar, com a hora no canto.",
    avanca:
      "Por mini-arcos: cada etapa do dia tem preparação, o feito e uma reação curta. Entre etapas, timelapse ou chicote de câmera e o rótulo de lugar e hora. A fala na selfie é picotada em cortes em salto; a cada 20 a 30 s, algo novo (outro lugar, um detalhe, uma anotação à mão, um timelapse).",
    fecha:
      "O resultado mostrado (a obra entregue, o evento cheio), uma reflexão curta e sincera na selfie, um timelapse do fim do dia, e o encerramento com a última anotação à mão. Pode cortar seco no meio de uma risada.",
  },
  ritmo: {
    cenaSeg: [1, 4],
    cortesPorMinuto: [25, 40],
    zoom:
      "Nada de punch digital constante: a ênfase vem do corte em salto e da troca de plano. Zoom de 100% para 112% em 150 ms só numa reação. O movimento é físico: câmera na mão, chicote, aproximação real.",
    observacoes:
      "A música manda: cortes caem na batida, a montagem acelera quando ela cresce. Planos longos de até 8 s só em momento íntimo ou bonito. Timelapse de 2 a 4 s para cada hora pulada.",
  },
  tipografia: {
    familias: [
      { papel: "título, lugar, hora e palavra grande", familia: "Barlow Condensed", pesos: "800 e 900 itálico, caixa alta", origem: "google-fonts", alternativa: "Anton" },
      { papel: "anotação à mão", familia: "Caveat Brush", pesos: "400", origem: "google-fonts", alternativa: "Permanent Marker" },
      { papel: "dado pequeno e legenda de detalhe", familia: "Liberation Sans", pesos: "700", origem: "local", alternativa: "Archivo 700" },
    ],
    hierarquia:
      "Título do vídeo a 10% a 14% da altura; lugar e hora a 4% a 5%; palavra grande da fala a 12% a 18%; anotação à mão a 5% a 7%.",
    regras: [
      "Texto branco puro, sem contorno; sombra suave de 25% só para ler sobre céu claro.",
      "Rótulo de lugar e hora sempre no mesmo canto, caixa alta, espaçamento +4%.",
      "Anotação à mão curta (até 5 palavras), com seta, como se escrita por cima da imagem.",
      "Nada de legenda contínua por padrão; texto só onde soma.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "sombra e fundo de cartão", hex: "#111111" },
      { papel: "anotação e destaque", hex: "#FF3B30" },
      { papel: "fita crepe do cartão", hex: "#E8DCC0" },
      { papel: "tom frio da imagem", hex: "#3A4A5C" },
    ],
    marca:
      "A cor da marca vira a anotação à mão e a seta (no lugar do vermelho) e a tinta do cartão de capítulo. Títulos e rótulos ficam brancos. A imagem não é tingida pela marca: só contraste alto e leve tom frio.",
  },
  elementos: [
    {
      id: "lugar-e-hora",
      nome: "Lugar e hora",
      forma:
        "Rótulo em caixa alta condensada branca com o lugar e a hora (\"MOGI DAS CRUZES, 6:14\"). Uma linha, Barlow Condensed 800, hora em peso 900; sem fundo.",
      animacao: "Aparece seco no corte, letras em cascata de 30 ms. Sai no corte seguinte.",
      duracaoSeg: [1.5, 3],
      posicao916: "Canto inferior esquerdo, 70% a 76% da altura. Margem esquerda 6%.",
      posicao169: "Canto inferior esquerdo, 82% a 88% da altura. Margem de 5%.",
      quando: "Chegada a um lugar novo ou salto de horário.",
    },
    {
      id: "titulo-do-dia",
      nome: "Título do vídeo",
      forma:
        "O título em caixa alta condensada branca gigante sobre um plano aberto. Duas linhas no máximo, itálico 900, entrelinha 0,9.",
      animacao: "Corta para dentro na batida da música. Fica parado enquanto a câmera se move por baixo e sai na batida seguinte.",
      duracaoSeg: [2, 3.5],
      posicao916: "Centro, 30% a 55% da altura.",
      posicao169: "Centro ou terço inferior esquerdo.",
      quando: "Logo depois da abertura fria.",
    },
    {
      id: "anotacao-a-mao",
      nome: "Anotação de marcador",
      forma:
        "Frase curta escrita à mão na cor da marca com uma seta curva apontando algo na imagem. Traço da seta de 6 px; texto levemente torto.",
      animacao: "A seta se desenha em 300 ms e o texto se escreve em 400 ms. Sai seca.",
      duracaoSeg: [1.5, 3],
      posicao916: "Perto do que aponta, entre 18% e 74% da altura. Fora da coluna direita de 12%.",
      posicao169: "Perto do que aponta.",
      quando: "Piada, detalhe que ninguém notaria, \"este é o Zé\".",
    },
    {
      id: "cartao-de-capitulo",
      nome: "Cartão de capítulo feito à mão",
      forma:
        "Um cartão branco preso por dois pedaços de fita crepe, filmado de cima sobre uma superfície, com o capítulo escrito à mão. Cartão girado 3 a 6 graus, sombra real suave, escrita na cor da marca ou preta.",
      animacao: "Entra em stop motion: 3 posições em 4 quadros cada até assentar. Leve tremor de câmera na mão.",
      duracaoSeg: [1.2, 2.5],
      posicao916: "Centro, 28% a 60% da altura.",
      posicao169: "Centro.",
      quando: "Troca de etapa do dia ou de capítulo.",
    },
    {
      id: "chicote",
      nome: "Chicote de câmera",
      forma:
        "Transição por desfoque de movimento horizontal forte entre dois planos. Desfoque direcional de 80 a 120 px, sem tela preta.",
      animacao: "O plano A desliza e borra em 120 ms, o plano B entra borrado e assenta em 120 ms. Whoosh junto.",
      duracaoSeg: [0.2, 0.3],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Mudança de lugar ou de assunto na mesma cena.",
    },
    {
      id: "timelapse",
      nome: "Timelapse com relógio",
      forma:
        "Trecho acelerado de 8 a 30 vezes com um relógio digital pequeno correndo no canto. Relógio em Barlow Condensed branca a 4% da altura.",
      animacao: "Entra e sai por corte na batida. Os minutos do relógio correm com o trecho.",
      duracaoSeg: [2, 4],
      posicao916: "Tela cheia; relógio no canto superior esquerdo, 14% a 18% da altura.",
      posicao169: "Tela cheia; relógio no canto superior esquerdo.",
      quando: "Espera, deslocamento, montagem, fim do dia.",
    },
    {
      id: "palavra-grande",
      nome: "Palavra grande da fala",
      forma:
        "Uma ou duas palavras em caixa alta condensada branca, enormes, sobre a selfie. Sem contorno, sombra suave.",
      animacao: "Corta para dentro na sílaba e sai no corte seguinte, com zoom de 112% junto.",
      duracaoSeg: [0.6, 1.2],
      posicao916: "Centro, 36% a 54% da altura.",
      posicao169: "Centro.",
      quando: "Reação forte (\"DEU CERTO\"), um número do dia.",
    },
  ],
  insercoesGeradas: {
    quando:
      "Pouquíssimas (0 a 2 por minuto): a gravação do cliente é a estrela. Só para cobrir um deslocamento ou um timelapse que não foi filmado.",
    tipos: [
      "plano aéreo ou de rua da cidade do cliente ao amanhecer ou entardecer, contraste alto, tom frio",
      "timelapse de céu, trânsito ou luzes acendendo",
      "plano de estrada pela janela do carro, câmera na mão",
    ],
    nunca: "rosto, equipe ou cliente gerados (as pessoas são sempre as da gravação); texto ou número na imagem; cena de estúdio limpa.",
  },
  som: {
    trilha: "Indie, eletrônica ou hip hop instrumental animado, escolhido antes do corte, 100 a 128 batidas por minuto; troca de faixa a cada etapa do dia; some sob a fala importante.",
    efeitos: ["whoosh no chicote", "som direto do lugar (porta, motor, rua) mantido", "clique de câmera no cartão de capítulo"],
    mixagem: "Voz a -14 LUFS; música a -18 dB nos trechos sem fala e -26 dB sob a fala; som ambiente vivo, sem limpar demais.",
  },
  nunca: [
    "Legenda palavra a palavra o vídeo todo.",
    "Cartela colorida chapada ou gráfico corporativo.",
    "Corte fora da batida da música.",
    "Imagem gerada com pessoas ou plano de banco de imagem.",
    "Cor lavada, morna ou sem contraste.",
    "Esconder imperfeições boas (risada, tropeço, vento no microfone).",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 3 tarefas do dia",
      edicao:
        "Cartão feito à mão com as 3 tarefas escritas, entra em stop motion; a mão dela risca a 1 (desenho de marcador na cor da marca); chicote para o lugar da tarefa 1 com rótulo de lugar e hora; mini-arco de preparação, feito e reação; na troca, o cartão volta com a 1 riscada e a 2 circulada.",
    },
    {
      quando: "O começo",
      edicao: "Abertura fria de 4 s no momento mais vivo, corte na batida para a selfie dizendo o que vai acontecer, título gigante branco sobre plano aberto com a hora no canto.",
    },
    {
      quando: "Ela se desloca (\"agora vamos para a fábrica\")",
      edicao: "Chicote de câmera para o carro, timelapse de 3 s da estrada com o relógio correndo, rótulo do novo lugar e hora na chegada.",
    },
    {
      quando: "Ela fala para a câmera por 30 s",
      edicao: "Cortes em salto a cada 2 a 4 s tirando as pausas, um plano de detalhe do que ela cita no meio, uma anotação à mão apontando algo do cenário.",
    },
    {
      quando: "Algo dá certo",
      edicao: "Palavra grande \"DEU CERTO\" por 0,8 s com zoom de 112%, a música sobe e entra uma montagem de 4 planos curtos na batida.",
    },
    {
      quando: "Um momento bonito ou íntimo",
      edicao: "Plano longo de 6 a 8 s sem texto, a música baixa, só o som do lugar.",
    },
    {
      quando: "O fecho",
      edicao: "O resultado mostrado, reflexão de uma frase na selfie, timelapse do fim do dia e a última anotação à mão na cor da marca; corte seco.",
    },
  ],
  quadrosDeReferencia: [
    "Selfie de grande angular com a câmera na mão, a pessoa falando na rua com prédios atrás, cor contrastada e levemente fria; no canto inferior esquerdo, \"SÃO PAULO, 7:42\" em caixa alta condensada branca.",
    "Cartão branco preso por fita crepe sobre uma mesa de madeira, filmado de cima, girado alguns graus, com o nome do capítulo escrito à mão em marcador.",
    "Plano aberto de um galpão com a equipe trabalhando, uma seta curva desenhada à mão apontando para uma pessoa e uma anotação curta manuscrita ao lado.",
  ],
  fontes: [
    "https://www.indepthcine.com/videos/casey-neistat (arco com abertura fria e mini-arcos, marcadores de capítulo físicos, chicote, cortes em salto, timelapse, grande angular)",
    "https://vloggingpro.com/casey-neistat-guide-to-filmmaking/ (música escolhida antes, corte na batida, algo novo a cada 30 s, cor fria e dessaturada tratada por último)",
    "https://vidprohero.com/casey-neistat-style-tips/ (imperfeição aceita, entrar no quadro, cortes rápidos, ângulos inesperados, timelapse)",
    "https://ids-water.com/2019/09/17/what-font-does-casey-neistat-use/ (Futura Condensed Extra Bold nos títulos, Helvetica e Gotham)",
    "https://lwks.com/blog/the-evolution-of-engagement-editing-for-the-youtube-and-tiktok-generation (cortes em salto e música como linguagem do vlog)",
  ],
};

export const TEXTO_VLOG = textoParaOPrompt(VLOG);
