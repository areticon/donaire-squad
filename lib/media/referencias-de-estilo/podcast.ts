import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * PODCAST EM VÍDEO (03/10/2026): o videocast de estúdio.
 *
 * O que a pesquisa deu: três câmeras como base (plano geral de dois e um
 * close de cada pessoa), a câmera segue a voz e troca exatamente na troca de
 * turno, com corte J (a voz de quem vai falar entra antes da imagem) e corte
 * L (a imagem fica em quem ouve para mostrar a reação); quando uma pessoa
 * fala muito tempo, troca de ângulo interna a cada 5 a 6 s; abertura fria no
 * meio de uma frase forte com faixa de título que some em ~5 s; no
 * episódio inteiro, troca confortável a cada 8 a 15 s; sem trilha nem efeito durante a conversa;
 * tarja no espaço vazio sem cobrir rosto ou pescoço; legenda sobe para o
 * topo quando a tarja aparece; voz normalizada a -16 LUFS.
 * Diferença para o "60-minutes": aqui é conversa entre iguais, longa, com
 * microfone à vista e luz de estúdio na cor da marca, e o vídeo é feito para
 * render CORTES verticais.
 */
export const PODCAST: ReferenciaDeEstilo = {
  id: "podcast",
  nome: "Podcast em vídeo",
  inspiracao: "videocasts de entrevista longa como The Diary of a CEO",
  essencia:
    "Uma conversa de verdade num estúdio escuro: duas ou três pessoas à mesa, microfones de braço à vista, luz de destaque na cor da marca no fundo. A câmera segue quem fala e mostra quem ouve quando a reação vale. A edição é quase invisível no corpo e afiada nas pontas: abertura fria com a frase mais forte, capítulos que dão mapa a uma conversa longa, e cada trecho bom pronto para virar corte vertical com legenda limpa por voz.",
  estrutura: {
    abre:
      "Abertura fria de 20 a 60 s: 3 a 5 frases fortes da conversa inteira em sequência, cada uma no close de quem disse, com a faixa de título nos primeiros 5 s; corte para preto de 1 s, vinheta curta da marca e plano geral do estúdio com a tarja de cada convidado.",
    avanca:
      "Em capítulos de 5 a 20 min, cada um aberto pelo título de capítulo sobre o plano geral e marcado na barra de capítulos. Dentro: a câmera segue a voz, reação de quem ouve nas frases de peso, plano geral a cada 1 a 2 min para relembrar o espaço, uma citação nos picos.",
    fecha:
      "A pergunta final de sempre (o conselho, a frase que fica), resposta no close segurado, plano geral com os dois rindo ou agradecendo, corte para preto e cartela com o próximo episódio. O som da sala some em 2 s.",
  },
  ritmo: {
    cenaSeg: [4, 12],
    cortesPorMinuto: [5, 15],
    zoom:
      "Sem zoom de efeito: três tamanhos (geral, médio, close) trocados por corte; com uma câmera só, recortes de 100%, 135% e 170% alternados a cada 5 a 6 s para simular várias câmeras.",
    observacoes:
      "Episódio inteiro: troca a cada 8 a 15 s; corte vertical: a cada 4 a 6 s. Troca de câmera na troca de turno, com corte J de 6 a 10 quadros. Reação em corte L de 1 a 2 s. Monólogo longo ganha troca de ângulo interna a cada 5 a 6 s. Pausa de emoção fica.",
  },
  tipografia: {
    familias: [
      { papel: "legenda dos cortes e faixa de título", familia: "Archivo", pesos: "800, caixa alta (corte) e 500 (sério)", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "tarja de convidado, capítulo", familia: "Inter", pesos: "600 e 400", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "citação", familia: "Newsreader", pesos: "500 itálico", origem: "google-fonts", alternativa: "PT Serif local" },
    ],
    hierarquia:
      "Legenda do corte a 4,5% a 5,5% da altura, 1 a 3 palavras por tela; faixa de título a 3,5%; título de capítulo a 4%; tarja com nome a 3% e descrição a 2,2%; citação a 4,5%; barra de capítulos com rótulo a 1,8%.",
    regras: [
      "Uma cor de legenda por voz: anfitrião numa cor, convidado em branco.",
      "Em trecho pesado, a legenda vira caixa baixa pequena com sombra, sem cor.",
      "Legenda sobe para o topo quando a tarja está na base.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "estúdio", hex: "#0E0F12" },
      { papel: "luz de destaque no fundo", hex: "#3A2A5C" },
      { papel: "luz quente da mesa", hex: "#D9A066" },
      { papel: "legenda do convidado", hex: "#FFFFFF" },
      { papel: "legenda do anfitrião", hex: "#FFD23F" },
      { papel: "faixa de título", hex: "#F5F5F5" },
    ],
    marca:
      "A cor da marca é a luz de destaque do fundo do estúdio (na gradação, puxando o fundo para ela), a cor da legenda do anfitrião e o marcador da barra de capítulos. Amarelo e roxo da tabela só se a marca não tiver cor. A pele fica natural.",
  },
  elementos: [
    {
      id: "faixa-de-titulo",
      nome: "Faixa de título",
      forma:
        "Retângulo claro com o tema do episódio em caixa alta escura, uma ou duas linhas. Sem raio; padding de 2% da altura; até 8 palavras.",
      animacao: "Abre da esquerda em 250 ms como máscara. Some em 200 ms aos 5 s.",
      duracaoSeg: [4, 6],
      posicao916: "Faixa de 16% a 24% da altura, centrada.",
      posicao169: "Centro superior, 8% a 16% da altura.",
      quando: "Os primeiros segundos e o começo de cada corte vertical.",
    },
    {
      id: "tarja-convidado",
      nome: "Tarja de convidado",
      forma:
        "Nome e uma descrição curta (o que faz, o que construiu) em duas linhas, sobre painel escuro translúcido com filete na cor da marca. Nunca cobre rosto ou pescoço.",
      animacao: "Desliza 20 px de baixo em 350 ms. Sai em fade de 300 ms.",
      duracaoSeg: [5, 7],
      posicao916: "Inferior esquerdo, 64% a 74% da altura.",
      posicao169: "Espaço vazio ao lado de quem fala, 76% a 88% da altura.",
      quando: "Primeira fala de cada pessoa e volta do capítulo.",
    },
    {
      id: "barra-de-capitulos",
      nome: "Barra de capítulos",
      forma:
        "Linha fina dividida em segmentos, um por capítulo, com o atual na cor da marca e o nome dele em cima. Altura de 4 px; vãos de 4 px entre segmentos.",
      animacao: "Sobe em fade de 300 ms e o segmento atual se preenche em 600 ms. Some em 2 s.",
      duracaoSeg: [3, 4],
      posicao916: "Faixa de 74% a 77% da altura, de 6% a 88% da largura.",
      posicao169: "Base, 88% a 91% da altura, de 5% a 95% da largura.",
      quando: "Início de cada capítulo.",
    },
    {
      id: "titulo-capitulo",
      nome: "Título de capítulo",
      forma: "Número do capítulo pequeno e o título em uma linha sobre o plano geral escurecido 40%. Inter 600, alinhado à esquerda.",
      animacao: "O plano escurece em 400 ms e o título entra com deslize de 12 px. Sai em fade quando a primeira fala começa.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 40% a 52% da altura.",
      posicao169: "Terço esquerdo, centro vertical.",
      quando: "Troca de assunto grande.",
    },
    {
      id: "legenda-por-voz",
      nome: "Legenda por voz",
      forma:
        "Legenda de 1 a 3 palavras por tela, caixa alta pesada com contorno escuro, na cor de quem fala. Contorno de 6 px, sombra de 30%.",
      animacao: "Cada tela entra por corte seco no tempo da palavra, com escala de 96% para 100% em 80 ms.",
      duracaoSeg: [0.3, 1.2],
      posicao916: "Faixa de 60% a 70% da altura.",
      posicao169: "Faixa de 72% a 80% da altura.",
      quando: "Só nos cortes verticais e na abertura fria; no episódio inteiro, legenda limpa opcional de duas linhas.",
    },
    {
      id: "citacao-do-episodio",
      nome: "Citação do episódio",
      forma:
        "A frase forte em serifa itálica sobre o close congelado e escurecido de quem disse, com o nome embaixo. Aspas na cor da marca; até 14 palavras.",
      animacao: "Congela e escurece em 300 ms, frase linha a linha em 400 ms. Sai por corte para o vídeo.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 34% a 58% da altura.",
      posicao169: "Metade livre do quadro, 30% a 70% da altura.",
      quando: "A frase mais citável do capítulo.",
    },
    {
      id: "objeto-citado",
      nome: "Foto do que foi citado",
      forma:
        "Cartão retangular com a foto ou imagem do que a pessoa nomeou (livro, lugar, produto) e uma legenda curta. Raio 12 px, sombra de 30%.",
      animacao: "Entra com escala de 92% para 100% e fade em 300 ms. Sai em 250 ms.",
      duracaoSeg: [2, 3.5],
      posicao916: "Faixa de 18% a 44% da altura, acima do rosto.",
      posicao169: "Lado oposto a quem fala, 20% a 70% da altura.",
      quando: "A fala nomeia algo concreto.",
    },
  ],
  insercoesGeradas: {
    quando: "Quase nenhuma: o motor é a troca de quem fala. Até 1 por minuto, só para algo concreto citado sem imagem.",
    tipos: [
      "objeto citado sobre fundo escuro em luz lateral, para o cartão",
      "lugar citado em foto documental realista",
    ],
    nunca: "texto, capa de livro, logo ou número desenhados por modelo; rosto de pessoa citada; imagem decorativa sem ter sido dita.",
  },
  som: {
    trilha: "Nenhuma durante a conversa. Vinheta curta da marca (3 a 5 s) depois da abertura fria e música de fim só sob a cartela.",
    efeitos: ["nenhum efeito sonoro na conversa", "risada e som da mesa preservados"],
    mixagem: "Vozes a -16 LUFS, todas no mesmo nível; vozes de microfone sem eco; corte J e L também no áudio; pausa de emoção mantida em silêncio.",
  },
  nunca: [
    "Trilha ou efeito sonoro sob a conversa.",
    "Ficar mais de 10 s no mesmo plano num monólogo.",
    "Tarja ou legenda sobre rosto ou pescoço.",
    "Câmera atrasada em relação a quem fala.",
    "Imagem de apoio decorativa a cada frase.",
    "Vinheta, trilha ou logo de terceiros.",
  ],
  momentos: [
    {
      quando: "O convidado enumera 7 passos",
      edicao:
        "Close dele; no passo 1, rótulo curto \"1 DE 7\" e o nome do passo na faixa de título; troca de ângulo interna a cada 5 s; reação do anfitrião no passo que surpreende; a cada passo, novo rótulo; ao fim, plano geral e o capítulo marcado na barra. No corte vertical, a lista vira legenda por voz.",
    },
    { quando: "Os primeiros segundos", edicao: "Frase mais forte no meio da frase, close, faixa de título por 5 s, outras 3 frases fortes, corte para preto, vinheta, plano geral, tarjas." },
    { quando: "O anfitrião faz a pergunta e o convidado começa", edicao: "Corte J: a voz do convidado entra 8 quadros antes do close dele." },
    { quando: "O convidado diz algo surpreendente", edicao: "Corte L para o anfitrião reagindo 1,5 s, volta ao close." },
    { quando: "Ele cita um livro ou lugar", edicao: "Cartão com a foto do que foi citado ao lado, 3 s." },
    { quando: "Muda o assunto", edicao: "Plano geral escurecido com título de capítulo e a barra de capítulos." },
    { quando: "A frase mais citável do capítulo", edicao: "Close segurado, citação do episódio sobre o close congelado; marcada como início de corte vertical." },
    { quando: "O fim", edicao: "Pergunta final, close segurado, plano geral rindo, preto, cartela do próximo episódio." },
  ],
  quadrosDeReferencia: [
    "Plano geral de estúdio escuro com duas pessoas à mesa, frente a frente, microfones de braço à vista, luz de destaque na cor da marca na parede do fundo e luz quente nos rostos.",
    "Close do convidado falando, microfone entrando pelo canto do quadro; no canto inferior, painel escuro translúcido com filete na cor da marca, nome e uma linha de descrição.",
    "Corte vertical: close de quem fala ocupando o quadro, faixa clara com o tema em caixa alta escura no topo e uma legenda de duas palavras em caixa alta pesada com contorno abaixo do queixo.",
  ],
  fontes: [
    "https://www.finchley.co.uk/finchley-learning/visual-podcast/video-execution-of-a-professional-podcast-the-post-production-guide-editing-considerations (corte J e L, três câmeras, tarja no espaço vazio sem cobrir rosto, legenda sobe com a tarja, -16 LUFS)",
    "https://www.writepanda.ai/blog/how-diary-of-a-ceo-edits-podcast-clips/ (corte a cada 4 a 6 s, troca na troca de turno, ângulo interno a cada 5 a 6 s, faixa de título que some em 5,5 s, legenda por cor de voz, sem trilha)",
    "https://onreplay.com.au/blog/video-podcast-editing-guide/ (2 a 4 câmeras: geral de dois e close de cada pessoa; troca a cada 8 a 15 s no episódio; tarja de 5 a 7 s; cartões de tema; cor casada entre câmeras)",
    "https://joyspace.ai/diary-of-ceo-formula-trailerize-podcast (abertura fria no meio da frase mais forte; lido pelo resumo da busca)",
  ],
};

export const TEXTO_PODCAST = textoParaOPrompt(PODCAST);
