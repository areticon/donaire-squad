import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * CORTE COM LEGENDA DINÂMICA, LINGUAGEM DE ALEX HORMOZI (03/10/2026).
 *
 * O pedido do Bruno: a mesma estrutura da lousa do Dan Martell (gancho do
 * meio, lista que volta, passo destacado), só que extravagante: texto
 * gigante, amarelo e preto, sombras duras, palavra a palavra, energia. As
 * medidas de legenda, corte e punch vêm das análises abaixo (Montserrat Black,
 * contorno preto de 8 a 12 px, uma palavra amarela por frase, corte a cada 1 a
 * 3 s, punch de 10% a 20%).
 */
export const HORMOZI: ReferenciaDeEstilo = {
  id: "hormozi",
  nome: "Corte com legenda dinâmica",
  inspiracao: "Alex Hormozi",
  essencia:
    "Energia de palco em fundo escuro: a pessoa num estúdio de pretos esmagados e pele quente, a câmera trocando de enquadramento a cada frase, e o TEXTO como protagonista. Legenda palavra a palavra em caixa alta, branca com contorno preto grosso, uma palavra por frase em amarelo. Quando a fala vira estrutura, a tela vira cartela amarela gigante com texto preto e sombra dura, sem meio-termo. Tudo é grande, chapado, de contraste máximo, sem degradê nem brilho: amarelo, preto, branco. A mesma arquitetura da lousa (lista que volta, passo destacado), em volume máximo.",
  estrutura: {
    abre:
      "Gancho do meio no segundo zero: a frase mais contrária ou o número mais alto do vídeo, recortada de depois da metade, com a palavra-chave explodindo em amarelo gigante e punch de 120%. Em seguida a promessa em uma frase (\"Vou te mostrar os 5 passos que...\") com o número em cartela amarela por 1 s. Zero apresentação, zero logo.",
    avanca:
      "Blocos curtos por ideia: lista amarela com o passo atual aceso e os outros escurecidos, chamada PASSO N gigante com sombra dura, volta para a pessoa com legenda palavra a palavra e, a cada frase forte, uma palavra solta ocupando meia tela. Exemplos viram imagem de meme ou clipe de 1 a 2 s. A cada 45 a 60 s, reabre a lista ou faz uma pergunta na tela para segurar.",
    fecha:
      "A lista inteira com todos os itens marcados, a frase-síntese em cartela amarela palavra a palavra, e a chamada para ação curta em caixa alta. Corta na última sílaba, sem respiro.",
  },
  ritmo: {
    cenaSeg: [1, 3],
    cortesPorMinuto: [25, 45],
    zoom:
      "Punch digital de 110% a 120% alternado com o plano médio a cada corte, sempre caindo na palavra de ênfase; nas palavras explosivas, zoom de impacto de 100% para 125% em 120 ms. Nunca aproximação lenta.",
    observacoes:
      "Silêncios, respiros e vícios de fala removidos. Algo muda na tela a cada 1 a 2 s (corte, punch, palavra, elemento). Cartela cheia dura de 0,8 a 2 s.",
  },
  tipografia: {
    familias: [
      { papel: "legenda e palavra gigante", familia: "Montserrat", pesos: "900 (Black), caixa alta", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "cartela e número", familia: "Anton", pesos: "400 (já ultra bold), caixa alta", origem: "google-fonts e local", alternativa: "Archivo Black" },
    ],
    hierarquia:
      "Legenda a 7% a 9% da altura do quadro, 1 a 3 palavras por vez. Palavra gigante e cartela a 18% a 30% da altura, uma a três palavras. Número a até 35% da altura.",
    regras: [
      "Contorno preto puro de 8 a 12 px (no 1080x1920) em todo texto branco ou amarelo sobre imagem.",
      "Sombra dura deslocada 8 px para baixo e para a direita, preta, sem desfoque.",
      "Exatamente UMA palavra amarela por frase (o substantivo ou verbo que carrega o sentido).",
      "Espaçamento entre letras 0 a -2%; entrelinha 0,9.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo e contorno", hex: "#000000" },
      { papel: "destaque", hex: "#FFD93D" },
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "positivo ocasional", hex: "#39FF14" },
      { papel: "negativo", hex: "#FF2E2E" },
    ],
    marca:
      "O amarelo é o lugar da cor mais viva da marca: palavra de ênfase, cartela, tile ativo. Se a marca for escura, use-a no preenchimento da cartela com texto branco e mantenha o contorno preto. O preto e o branco não mudam. Nunca mais de uma cor de destaque.",
  },
  elementos: [
    {
      id: "legenda-palavra",
      nome: "Legenda palavra a palavra",
      forma:
        "Caixa alta branca com contorno preto grosso, 1 a 3 palavras por vez, a palavra de ênfase em amarelo. Montserrat 900; contorno 8 a 12 px.",
      animacao: "Cada palavra salta de 80% para 105% e assenta em 100% em 120 ms, no instante em que é dita. A anterior some no corte de frase.",
      duracaoSeg: [0.2, 0.6],
      posicao916: "Centro horizontal, 60% a 70% da altura, sob o queixo.",
      posicao169: "Centro, 70% a 82% da altura.",
      quando: "O vídeo inteiro, enquanto há fala.",
    },
    {
      id: "palavra-gigante",
      nome: "Palavra explosiva",
      forma:
        "Uma palavra de impacto em caixa alta ocupando quase a largura toda, amarela com contorno e sombra dura preta, por cima da pessoa. Pode girar -4 a 4 graus.",
      animacao: "Entra de 160% para 100% em 140 ms com tremor de 2 quadros e zoom de impacto na câmera junto. Sai por corte.",
      duracaoSeg: [0.6, 1.2],
      posicao916: "Faixa de 38% a 58% da altura, de 6% a 88% da largura.",
      posicao169: "Centro, 30% a 70% da altura.",
      quando: "A palavra mais forte de uma frase de efeito (\"NUNCA\", \"DOBRO\", \"GRÁTIS\").",
    },
    {
      id: "lista-amarela",
      nome: "Lista com o item aceso",
      forma:
        "Tela preta com título branco gigante e a lista numerada em barras; o item atual em barra amarela com texto preto, os outros em cinza escuro desfocado. Barras retangulares retas, sem raio, sombra dura de 8 px; número em Anton dentro de um quadrado preto.",
      animacao: "Barras entram da esquerda em cascata de 80 ms, cada uma com batida. Ao destacar, o atual cresce 8% e os outros apagam e desfocam em 150 ms.",
      duracaoSeg: [1.5, 3],
      posicao916: "Título a 15% a 25% da altura, barras de 28% a 75%.",
      posicao169: "Título no topo, barras de 25% a 88% da altura.",
      quando: "A fala enumera, e a cada troca de item.",
    },
    {
      id: "chamada-passo",
      nome: "Chamada PASSO N",
      forma:
        "Cartela amarela de tela cheia com \"PASSO 1\" em preto pequeno e o nome do passo gigante em preto com sombra dura. Texto a 20% a 28% da altura, alinhado à esquerda.",
      animacao: "A cartela entra num corte com flash branco de 2 quadros e o nome bate de 130% para 100% em 120 ms.",
      duracaoSeg: [0.8, 1.6],
      posicao916: "Texto de 30% a 65% da altura, margem esquerda 6%.",
      posicao169: "Texto de 25% a 75% da altura, margem esquerda 6%.",
      quando: "No nome de cada passo.",
    },
    {
      id: "numero-gigante",
      nome: "Número gigante",
      forma:
        "O número em Anton amarelo enorme com contorno preto e um rótulo curto branco embaixo. Moeda e porcentagem do mesmo tamanho do número.",
      animacao: "Conta rápido até o valor em 500 ms com estalo a cada dígito e assenta com tremor.",
      duracaoSeg: [1, 2],
      posicao916: "Faixa de 20% a 45% da altura, acima do rosto.",
      posicao169: "Lado livre ao lado da pessoa, 20% a 70% da altura.",
      quando: "Dinheiro, porcentagem, prazo dito.",
    },
    {
      id: "certo-errado",
      nome: "Certo e errado",
      forma:
        "Um X vermelho grosso ou um check verde grosso com contorno preto, ao lado da frase que julga. Traço de 24 px de ponta reta.",
      animacao: "Desenha-se em 2 traços rápidos (150 ms) com estalo.",
      duracaoSeg: [0.8, 1.5],
      posicao916: "Ao lado da legenda, 50% a 62% da altura.",
      posicao169: "Ao lado da pessoa, altura do rosto.",
      quando: "\"Isso é errado\", \"faça assim\", mito e verdade.",
    },
    {
      id: "meme-broll",
      nome: "Corte de meme",
      forma:
        "Clipe ou imagem de 1 a 2 s em tela cheia ilustrando a frase literalmente, com a legenda continuando por cima. Cor saturada, contraste alto.",
      animacao: "Corte seco de entrada e saída, sem transição.",
      duracaoSeg: [0.8, 2],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Metáfora visual ou exagero (\"queimar dinheiro\", \"correr atrás do rabo\").",
    },
  ],
  insercoesGeradas: {
    quando: "De 2 a 5 por minuto, sempre curtas e literais, para dar imagem à metáfora; nunca para enfeitar.",
    tipos: [
      "imagem literal da metáfora dita, saturada e de contraste alto (dinheiro pegando fogo, cofre vazio)",
      "cena de cinema de 1 a 2 s com câmera rápida (zoom de impacto, chicote)",
      "objeto isolado sobre fundo preto para receber a palavra gigante por cima",
    ],
    nunca: "imagem calma e contemplativa, banco de imagem de escritório, número desenhado pelo modelo.",
  },
  som: {
    trilha: "Batida moderna de hip hop ou trap instrumental baixa, 95 a 130 batidas por minuto, constante; pode parar de repente antes da frase mais forte.",
    efeitos: ["whoosh em cada troca de cartela", "pop na palavra explosiva", "clique em cada item da lista", "estalo de caixa registradora no número", "impacto grave no gancho"],
    mixagem: "Voz alta e comprimida a -14 LUFS, sempre na frente; trilha a -26 dB; efeitos curtos e secos que nunca cobrem a palavra.",
  },
  nunca: [
    "Respiro, silêncio ou vício de fala deixados no corte.",
    "Mais de uma palavra amarela por frase.",
    "Degradê, brilho suave, textura de papel ou letra manuscrita.",
    "Legenda fina, pequena ou sem contorno.",
    "Aproximação lenta, plano de mais de 4 s sem nada mudar.",
    "Abrir com apresentação, logo ou \"fala, pessoal\".",
    "Fonte serifada.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 5 passos",
      edicao:
        "Lista com 5 barras e título gigante; apaga 4, acende o 1 em amarelo; flash e cartela amarela PASSO 1 com o nome gigante; volta para a pessoa com punch; enquanto ela explica, palavra gigante e número entram nas frases fortes; ao trocar de passo, a lista volta com o 1 marcado e o 2 aceso.",
    },
    {
      quando: "O primeiro segundo",
      edicao: "Frase mais contrária do meio do vídeo, a palavra-chave explodindo em amarelo, impacto grave; corte para a promessa com o número em cartela amarela por 1 s.",
    },
    {
      quando: "Ela diz um valor (\"eu perdi 2 milhões\")",
      edicao: "Número gigante amarelo contando até R$ 2 MILHÕES com estalo, punch de 120% no rosto na frase seguinte.",
    },
    {
      quando: "Ela desmonta um mito",
      edicao: "Frase do mito na legenda com X vermelho desenhado ao lado; corte; a verdade com check verde e a palavra-chave gigante.",
    },
    {
      quando: "Ela usa uma metáfora",
      edicao: "Corte de meme de 1,5 s literal (dinheiro pegando fogo) com a legenda seguindo por cima; volta com punch.",
    },
    {
      quando: "Uma frase de efeito curta",
      edicao: "A trilha para, a frase entra palavra a palavra em cartela preta com cada palavra batendo, a última em amarelo; a trilha volta no corte seguinte.",
    },
    {
      quando: "Ela faz uma pergunta para o público",
      edicao: "A pergunta inteira em caixa alta gigante na tela por 1,5 s, ponto de interrogação amarelo; plano fechado no rosto esperando.",
    },
    {
      quando: "O fecho",
      edicao: "Lista inteira com todos os itens marcados, síntese palavra a palavra em cartela amarela, chamada curta em caixa alta, corte na última sílaba.",
    },
  ],
  quadrosDeReferencia: [
    "Plano médio fechado da pessoa em estúdio quase preto, pele quente e contraste alto; no terço de baixo, duas palavras em caixa alta Montserrat Black branca com contorno preto grosso, a segunda em amarelo.",
    "Cartela amarela de tela cheia com \"PASSO 2\" pequeno em preto no topo e o nome do passo gigante em preto, alinhado à esquerda, com sombra dura preta deslocada.",
    "Tela preta com cinco barras retas empilhadas: a terceira amarela com texto preto e número num quadrado preto, as outras quatro cinza escuro e desfocadas; título branco gigante no topo.",
  ],
  fontes: [
    "https://ascynd.io/en/blog/hormozi-captions (Montserrat Black, contorno 8 a 12 px, #FFD93D, uma palavra destacada, 60% a 70% da altura)",
    "https://www.choppity.com/tools/recreate-video-editing-style/alex-hormozi/ (corte a cada 1 a 3 s, punch de 10% a 20%, pretos esmagados, abre direto no gancho)",
    "https://www.submagic.co/blog/how-to-make-alex-hormozi-captions",
    "https://sendshort.ai/guides/hormozi-captions/",
    "https://riverside.com/blog/hormozi-style-videos e joyspace.ai/hormozi-editing-style-2026-analysis (whoosh, pop e clique como marca de transição; imagem de meme no lugar de emoji)",
    "lib/media/biblias/hormozi.ts (bíblia medida do projeto)",
  ],
};

export const TEXTO_HORMOZI = textoParaOPrompt(HORMOZI);
