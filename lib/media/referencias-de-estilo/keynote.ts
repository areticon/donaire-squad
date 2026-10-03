import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * LANÇAMENTO DE PRODUTO, LINGUAGEM DO KEYNOTE DA APPLE (03/10/2026).
 *
 * Base: a bíblia lib/media/biblias/keynote.ts (uma ideia por tela, no máximo
 * um elemento por cena, nenhum punch) e a pesquisa: tipografia grande em sem
 * serifa de peso médio a bold, só branco ou preto, sem degradê nem sombra;
 * texto que surge subindo levemente com fade no instante em que a informação
 * importa e sai limpo; espaçamento generoso; fundos quase brancos (#F5F5F7) ou
 * pretos puros; o objeto em luz de estúdio com reflexo; movimento ágil com
 * desaceleração, nunca lento demais; efeitos sonoros curtos e suaves.
 */
export const KEYNOTE: ReferenciaDeEstilo = {
  id: "keynote",
  nome: "Lançamento de produto",
  inspiracao: "keynotes e filmes de produto da Apple",
  essencia:
    "Clareza de palco de lançamento: uma ideia por tela, enorme espaço vazio, a frase-chave grande surgindo no instante exato em que é dita e saindo limpa. Fundo preto puro ou quase branco, alternando por bloco; cor só na palavra que importa e no detalhe do objeto. O objeto aparece isolado em luz suave de estúdio, com reflexo discreto e movimento lento em volta. Confiança silenciosa: nada estoura, nada treme, nada compete com a ideia. O movimento é preciso e ágil, com desaceleração suave, nunca preguiçoso.",
  estrutura: {
    abre:
      "UMA frase, a tese, sozinha na tela preta, surgindo palavra por palavra enquanto é dita; silêncio visual em volta. Depois a pessoa em quadro limpo. Até 7 s, passagem por fusão.",
    avanca:
      "Por revelações: cada recurso ou ideia tem seu momento (a frase-título sozinha, o objeto ou a tela em fundo puro com um rótulo fino apontando, o número grande que prova), separadas por fusão. A pessoa volta entre revelações em quadro limpo, sem nada por cima.",
    fecha:
      "A ideia central sozinha numa cartela branca ou preta, um respiro de silêncio e a chamada em uma linha. Fusão para o fim.",
  },
  ritmo: {
    cenaSeg: [3.5, 7],
    cortesPorMinuto: [6, 14],
    zoom:
      "Aproximação lenta e contínua de 100% a 104% em cada plano; no objeto, órbita ou deslize lateral lento. Nenhum punch, nenhum zoom de impacto.",
    observacoes:
      "Uma mudança a cada 3 a 6 s. Silêncio de 0,5 a 1 s antes da revelação principal. Cortes no tempo da música dentro da mesma ideia; fusão de 400 a 600 ms entre ideias.",
  },
  tipografia: {
    familias: [
      { papel: "frase-título e citação", familia: "Inter", pesos: "600 e 700", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "número grande", familia: "Inter", pesos: "200 e 300", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "rótulo fino de recurso", familia: "Inter", pesos: "500", origem: "google-fonts" },
    ],
    hierarquia:
      "Frase-título a 6% a 8% da altura, centralizada, caixa normal, entrelinha 1,05. Número enorme e fino a 18% a 24%, rótulo a 2,5% embaixo. Rótulo de recurso a 2,2% a 2,8%.",
    regras: [
      "Uma frase por tela, no máximo 6 palavras visíveis.",
      "Só branco sobre preto ou quase preto sobre quase branco; a cor da marca só na palavra-chave.",
      "Sem sombra, contorno, degradê no texto ou caixa alta gritada; espaçamento de -1% no título e +2% no rótulo.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo escuro", hex: "#000000" },
      { papel: "fundo claro", hex: "#F5F5F7" },
      { papel: "texto sobre escuro", hex: "#F5F5F7" },
      { papel: "texto sobre claro", hex: "#1D1D1F" },
      { papel: "texto secundário", hex: "#86868B" },
      { papel: "palavra-chave (destaque)", hex: "#2997FF" },
    ],
    marca:
      "O azul da palavra-chave vira a cor da marca; se a marca for clara demais, ela vai só no fundo preto. Os fundos continuam preto e quase branco, nunca a cor da marca chapada. A palavra-chave pode ganhar um degradê suave entre duas cores da marca, só no título da revelação principal.",
  },
  elementos: [
    {
      id: "frase-titulo",
      nome: "Frase-título surgindo",
      forma:
        "A frase-chave sozinha, grande, centralizada, em sem serifa bold com a palavra-chave na cor da marca. Nada mais na tela.",
      animacao:
        "Cada palavra sobe 16 px com fade em 350 ms, no instante em que é dita. Desaceleração suave (cúbica); escalonamento de 80 ms; sai com fade de 250 ms.",
      duracaoSeg: [2.5, 5],
      posicao916: "Centro óptico, 40% a 52% da altura. Largura de 8% a 86%.",
      posicao169: "Centro, 42% a 58% da altura.",
      quando: "A tese, a frase que resume o recurso, a frase de mais peso.",
    },
    {
      id: "numero-fino",
      nome: "Número grande e fino",
      forma:
        "O número enorme em peso fino, branco ou quase preto, com unidade menor e um rótulo curto embaixo. Comparação opcional em cinza (\"2x mais rápido\").",
      animacao: "Conta até o valor em 900 ms com desaceleração forte, enquanto sobe 12 px com fade. Sem som de contagem.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 36% a 56% da altura.",
      posicao169: "Centro, 32% a 64% da altura.",
      quando: "Todo número dito que prova o valor.",
    },
    {
      id: "rotulo-fino",
      nome: "Rótulo fino apontando",
      forma:
        "Linha de 1,5 px saindo de um ponto de 6 px no detalhe do objeto até um rótulo curto em peso médio. Linha e ponto brancos ou cinza escuro, conforme o fundo.",
      animacao: "O ponto aparece, a linha se desenha em 400 ms e o rótulo surge com fade. Vários rótulos em sequência de 300 ms.",
      duracaoSeg: [2, 4],
      posicao916: "Ao redor do objeto, 20% a 70% da altura. Rótulos nunca na coluna direita de 12%.",
      posicao169: "Ao redor do objeto, rótulos nas laterais dentro da margem de 5%.",
      quando: "A pessoa nomeia um recurso, uma parte, um detalhe.",
    },
    {
      id: "objeto-isolado",
      nome: "Objeto em fundo puro",
      forma:
        "O produto ou objeto dito, isolado em fundo preto ou quase branco, luz suave com reflexo discreto, ocupando um terço do quadro. Sombra de contato muito suave.",
      animacao: "Surge por fusão em 500 ms e gira ou desliza devagar (8 a 15 graus em 4 s). Nunca balança.",
      duracaoSeg: [3, 6],
      posicao916: "Centro, 25% a 65% da altura.",
      posicao169: "Centro ou dois terços, 15% a 85% da altura.",
      quando: "O produto, a tela do serviço ou o objeto dito.",
    },
    {
      id: "grade-de-recursos",
      nome: "Grade de recursos",
      forma:
        "Cartões de cantos bem arredondados, com fundo levemente mais claro que a tela, cada um com um ícone de traço fino e duas palavras. Raio 28 px; até 4 cartões.",
      animacao: "Os cartões sobem 24 px com fade em cascata de 120 ms. O citado acende com a cor da marca no ícone; os outros ficam em 50%.",
      duracaoSeg: [3, 6],
      posicao916: "Coluna de 22% a 72% da altura.",
      posicao169: "Linha de 30% a 70% da altura, largura de 8% a 92%.",
      quando: "A pessoa enumera recursos, benefícios ou etapas.",
    },
    {
      id: "antes-depois",
      nome: "Antes e depois em duas colunas",
      forma:
        "Duas colunas lado a lado com o rótulo em cinza (antes) e em branco (depois), uma linha fina vertical entre elas. Valor do depois na cor da marca.",
      animacao: "A coluna do antes surge, 400 ms depois a do depois. Fusão na saída.",
      duracaoSeg: [3, 5],
      posicao916: "Empilhadas, 28% a 70% da altura.",
      posicao169: "Lado a lado, 30% a 70% da altura.",
      quando: "\"Antes levava\", \"agora\", comparação de versão.",
    },
  ],
  insercoesGeradas: {
    quando: "Poucas e precisas: 1 a 2 por minuto, sempre UM objeto isolado em fundo puro; a tela real do produto do cliente vale mais.",
    tipos: [
      "UM objeto do substantivo dito em fundo preto ou branco puro, luz suave de estúdio, reflexo discreto, enorme espaço vazio",
      "movimento lento e elegante em volta de um objeto sobre fundo puro",
      "macro de detalhe de material (vidro, metal, papel) com foco raso",
    ],
    nunca: "cena cheia de objetos, cenário real bagunçado, cor saturada em tudo, texto ou número desenhado pelo modelo.",
  },
  som: {
    trilha: "Minimalista e luminosa, 75 a 105 batidas por minuto, piano ou sintetizador limpo com batida leve; para antes da revelação.",
    efeitos: ["sopro suave quando a frase-título surge", "clique macio no rótulo e no cartão", "nenhum som na fusão"],
    mixagem: "Voz a -16 LUFS, limpa e próxima; trilha a -26 dB; efeitos quase imperceptíveis, sempre no quadro exato.",
  },
  nunca: [
    "Mais de um elemento por cena.",
    "Punch, tremor, flash, chicote ou câmera na mão.",
    "Emoji, seta grossa, recorte, papel, tarja de telejornal.",
    "Fundo colorido chapado (só preto ou quase branco).",
    "Texto antes da palavra dita, ou mais de 6 palavras na tela.",
    "Sombra, contorno ou brilho no texto.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 4 recursos",
      edicao:
        "Grade com os 4 cartões em cascata; 3 caem para 50%, o 1 acende; fusão para a frase-título com o nome do recurso sozinha; volta para a pessoa em quadro limpo; o objeto com rótulos finos entra quando ela descreve o detalhe; na troca, a grade volta com o 2 aceso.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Tela preta, a tese surgindo palavra por palavra no ritmo da fala, a palavra-chave na cor da marca; fusão para a pessoa.",
    },
    {
      quando: "Ela diz um número de desempenho (\"3 vezes mais rápido\")",
      edicao: "Silêncio de meio segundo, número fino enorme contando até 3x, rótulo embaixo; fusão de volta.",
    },
    {
      quando: "Ela apresenta o produto",
      edicao: "Objeto isolado em fundo preto girando devagar; rótulos finos aparecem um a um conforme ela nomeia cada parte.",
    },
    {
      quando: "Ela compara com o jeito antigo",
      edicao: "Duas colunas: antes em cinza, depois em branco com o valor na cor da marca; fusão para a pessoa.",
    },
    {
      quando: "Ela mostra o serviço funcionando na tela",
      edicao: "A gravação da tela numa janela de cantos arredondados sobre fundo quase branco, aproximação lenta até o botão citado, um rótulo fino apontando; a pessoa não aparece por cima.",
    },
    {
      quando: "A frase de efeito",
      edicao: "Cartela quase branca com a frase em quase preto surgindo palavra por palavra; trilha baixa; 3 s.",
    },
    {
      quando: "O fecho",
      edicao: "A ideia central sozinha em cartela preta, um respiro, a chamada em uma linha, fusão.",
    },
  ],
  quadrosDeReferencia: [
    "Tela preta pura com uma única frase curta centralizada em sem serifa bold branca, a última palavra na cor de destaque, e nada mais no quadro.",
    "Um objeto isolado no centro de um fundo quase branco, luz suave com reflexo discreto, duas linhas finas saindo de pontos no objeto até rótulos curtos em cinza escuro.",
    "Fundo preto com um número enorme em peso fino branco (\"3x\") e um rótulo pequeno cinza embaixo, muito espaço vazio em volta.",
  ],
  fontes: [
    "lib/media/biblias/keynote.ts (bíblia do projeto, 01/10)",
    "https://trydemotion.com/blog/after-effects-advanced-techniques (fundo #F5F5F7 ou preto, palavras subindo com fade em sequência, desaceleração, cliques suaves)",
    "https://www.yansmedia.com/blog/what-font-apple-use (tipografia de movimento: só branco ou preto, sem degradê nem sombra, espaçamento maior no vídeo)",
    "https://motion.so/learn/apple-style-product-launch-video (ritmo contido, revelação guiada pelo produto, confiança silenciosa)",
    "https://www.diyphotography.net/heres-how-to-light-and-shoot-cinematic-apple-like-product-commercials/ (luz de produto com reflexo assinatura)",
  ],
};

export const TEXTO_KEYNOTE = textoParaOPrompt(KEYNOTE);
