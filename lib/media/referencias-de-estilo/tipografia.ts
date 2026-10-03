import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * TIPOGRAFIA ANIMADA, KINETIC TYPOGRAPHY (03/10/2026).
 *
 * O que a pesquisa deu: o texto É o vídeo. As palavras entram no tempo exato
 * da sílaba (o animador marca o início de cada palavra no áudio), separadas
 * em camadas para entrar uma a uma; a câmera virtual se move entre grupos de
 * palavras, aproxima rápido no que é íntimo e recua para revelar a frase
 * inteira; a ênfase vem de escala (80% para 100% com desaceleração seca dá
 * soco; 50% para 100% devagar dá revelação), peso e contraste. Medidas dos
 * tutoriais: entrada e saída de 200 a 400 ms, batida principal de 600 a
 * 1200 ms, defasagem de 50 a 100 ms entre letras, palavra de ênfase segura 2
 * a 4 quadros a mais, quebra de linha com pausa de 6 a 8 quadros, 1 a 10
 * palavras por cena, nunca movimento linear. Distância do Hormozi: aqui é
 * composição tipográfica limpa (blocos alinhados, contraste de peso e de
 * família, cor da marca chapada), sem contorno, sem sombra dura, sem pessoa
 * como protagonista.
 */
export const TIPOGRAFIA: ReferenciaDeEstilo = {
  id: "tipografia",
  nome: "Tipografia animada",
  inspiracao: "kinetic typography de vídeos-manifesto, aberturas de filme e vídeos de letra",
  essencia:
    "A voz vira desenho de letra. Fundo chapado na cor da marca ou quase preto, e as palavras da fala entrando uma a uma no tempo da sílaba, montando blocos tipográficos como um cartaz que se compõe sozinho: a palavra importante enorme e pesada, as de ligação pequenas e leves, uma palavra emocional em serifa itálica para contrastar. A câmera virtual passeia pelo cartaz, gira 90 graus para o próximo bloco, aproxima numa palavra e recua para mostrar a frase inteira. Formas geométricas da marca varrem a tela e viram o fundo da cena seguinte. Quando a pessoa aparece, é em respiros curtos entre cartelas. Preciso, musical, gráfico; cada movimento tem curva.",
  estrutura: {
    abre:
      "A frase de impacto no segundo zero, palavra por palavra no tempo da voz, em fundo da cor da marca; a última palavra entra enorme e segura 1 s. Sem logo, sem pessoa: o texto prende antes de qualquer contexto.",
    avanca:
      "Uma ideia por cena, de 1 a 10 palavras. Cada cena monta um bloco tipográfico e termina com o texto se transformando no começo da próxima (uma palavra cresce e vira fundo, o bloco gira, a forma varre). Listas viram blocos empilhados que a câmera percorre. Se há gravação da pessoa, ela aparece por 2 a 5 s entre blocos, emoldurada pela forma da marca, e o texto volta.",
    fecha:
      "Recuo da câmera revelando todos os blocos como um único cartaz, ou a frase-síntese palavra por palavra em tela limpa com a palavra final na cor de contraste; a chamada em uma linha pequena embaixo. Silêncio de 0,5 s antes do corte.",
  },
  ritmo: {
    cenaSeg: [1.5, 5],
    cortesPorMinuto: [12, 30],
    zoom:
      "Câmera virtual sobre o texto: aproximação rápida de 400 ms numa palavra íntima, recuo de 600 a 900 ms revelando a frase, giro de 90 graus em 500 ms entre blocos. Toda curva acelera e desacelera; nunca linear.",
    observacoes:
      "O ritmo é o da fala, sílaba a sílaba: cada palavra entra no início exato dela. Algo se move o tempo todo, mas cada bloco pronto segura 300 a 600 ms parado para ser lido. Pausa de 6 a 8 quadros a cada quebra de linha.",
  },
  tipografia: {
    familias: [
      { papel: "palavra forte e bloco principal", familia: "Archivo", pesos: "800 e 900, largura expandida 112% a 125%", origem: "google-fonts", alternativa: "Archivo Black" },
      { papel: "palavras de ligação", familia: "Archivo", pesos: "400, largura normal", origem: "google-fonts", alternativa: "Liberation Sans" },
      { papel: "palavra emocional em contraste", familia: "Instrument Serif", pesos: "400 itálico", origem: "google-fonts", alternativa: "PT Serif itálico" },
    ],
    hierarquia:
      "Palavra principal a 14% a 30% da altura, ocupando a largura útil; palavra secundária a 6% a 9%; ligação (de, que, o, para) a 3% a 5%. Três tamanhos por bloco, no máximo.",
    regras: [
      "Blocos justificados ou alinhados à esquerda, cada linha ajustada à largura do bloco; entrelinha de 0,85 a 0,95.",
      "Uma palavra por bloco pode ir em serifa itálica, a de mais sentimento.",
      "Caixa alta nas palavras fortes, minúscula nas de ligação.",
      "Sem contorno, sem sombra, sem brilho: só cor chapada contra fundo chapado.",
      "Kerning ajustado à mão nas palavras gigantes; espaçamento entre letras de -2% a -4%.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo escuro", hex: "#111111" },
      { papel: "texto principal", hex: "#F5F5F0" },
      { papel: "cor de contraste", hex: "#FF4D2E" },
      { papel: "fundo claro alternado", hex: "#F5F5F0" },
      { papel: "texto secundário", hex: "#9A9A9A" },
    ],
    marca:
      "Duas a três cores da marca, em alto contraste: a principal é fundo de cena inteira ou a palavra de ênfase; a escura (ou um quase preto) e a clara (ou um quase branco) alternam como fundo e texto. Contraste mínimo de 4,5 para 1 entre texto e fundo; se a marca não dá contraste, ela vira só a forma geométrica e o texto fica preto e branco.",
  },
  elementos: [
    {
      id: "palavra-no-tempo",
      nome: "Palavra no tempo da sílaba",
      forma:
        "Cada palavra da frase como camada própria, montando o bloco. Tamanho pelo peso do sentido: forte em Archivo 900 expandida, ligação em 400 pequena.",
      animacao:
        "Entra no início exato da palavra falada, de 80% para 100% de escala em 200 a 250 ms com desaceleração forte. As fortes podem subir de uma máscara (o texto nasce de baixo de uma linha invisível) em 300 ms.",
      duracaoSeg: [0.3, 3],
      posicao916: "Bloco no centro, 22% a 70% da altura. Largura útil de 6% a 88%.",
      posicao169: "Bloco no centro, 10% a 88% da altura. Margens de 8%.",
      quando: "O vídeo inteiro, em cada palavra dita.",
    },
    {
      id: "revelacao-por-mascara",
      nome: "Revelação por máscara",
      forma:
        "Linha de texto que nasce de trás de uma borda reta invisível ou de uma barra da cor da marca. A barra tem a altura da linha e some depois.",
      animacao: "A barra corre da esquerda para a direita em 300 ms e o texto aparece atrás dela. Saída inversa em 250 ms.",
      duracaoSeg: [1, 3],
      posicao916: "Linha dentro do bloco, 22% a 70% da altura.",
      posicao169: "Linha dentro do bloco.",
      quando: "Frase de afirmação, título de bloco, nome de passo.",
    },
    {
      id: "bloco-que-gira",
      nome: "Bloco que gira para o próximo",
      forma:
        "O bloco pronto e o próximo dispostos em ângulo reto num grande cartaz virtual. A câmera, e não o texto, gira.",
      animacao: "A câmera gira 90 graus e desliza até o novo bloco em 500 ms, com aceleração e pouso suaves. Desfoque de movimento leve no meio.",
      duracaoSeg: [0.5, 0.6],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Virada de ideia dentro da mesma frase.",
    },
    {
      id: "palavra-que-cresce",
      nome: "Palavra que cresce e vira fundo",
      forma:
        "Uma palavra (ou uma letra dela) escala até encher a tela, e a cor dela vira o fundo da cena seguinte. Transição de cena dentro do próprio texto.",
      animacao: "Escala de 100% a 2000% em 450 ms com aceleração no fim. A próxima cena começa sobre a cor dela.",
      duracaoSeg: [0.4, 0.5],
      posicao916: "Centro.",
      posicao169: "Centro.",
      quando: "Fim de bloco, a palavra mais forte.",
    },
    {
      id: "contraste-serifado",
      nome: "Palavra em serifa itálica",
      forma:
        "A palavra de sentimento em Instrument Serif itálica, maior que as vizinhas, na cor de contraste. Única no bloco.",
      animacao: "Entra com 250 ms de fade e subida de 12 px, mais lenta que as outras. Segura 3 quadros a mais antes de seguir.",
      duracaoSeg: [0.8, 3],
      posicao916: "Dentro do bloco.",
      posicao169: "Dentro do bloco.",
      quando: "Palavra de emoção (medo, liberdade, orgulho, casa).",
    },
    {
      id: "forma-que-varre",
      nome: "Forma geométrica que varre",
      forma:
        "Retângulo, círculo ou faixa diagonal chapada na cor da marca que atravessa a tela. Sem borda nem textura.",
      animacao: "Atravessa em 350 a 450 ms com aceleração e desaceleração; ao passar, troca o fundo e o texto. Pode deixar uma faixa fina de 2% como sublinhado.",
      duracaoSeg: [0.35, 0.45],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Troca de cena entre ideias diferentes.",
    },
    {
      id: "numero-que-conta",
      nome: "Número tipográfico",
      forma:
        "O número em Archivo 900 expandida ocupando a largura, com a unidade pequena em 400 ao lado. Algarismos tabulares.",
      animacao: "Os dígitos rolam como contador em 600 ms com desaceleração. A unidade entra 100 ms depois.",
      duracaoSeg: [1, 2.5],
      posicao916: "Centro, 34% a 56% da altura.",
      posicao169: "Centro.",
      quando: "Número, prazo, porcentagem dita.",
    },
  ],
  insercoesGeradas: {
    quando: "Raras (0 a 2 por minuto): o texto é o vídeo. Só como textura de fundo atrás de um bloco, escurecida e desfocada.",
    tipos: [
      "textura abstrata em movimento lento (tinta na água, luz atravessando vidro, grão) na cor da marca",
      "plano de detalhe muito desfocado do setor do cliente, a 30% de opacidade, atrás de um bloco",
    ],
    nunca: "qualquer letra, palavra ou número gerado pelo modelo (toda letra é código); imagem nítida que compete com o texto.",
  },
  som: {
    trilha: "Batida marcada, eletrônica ou percussiva, 90 a 120 batidas por minuto, com as frases alinhadas à batida; ou só a voz marcante, com silêncio entre frases.",
    efeitos: ["tique seco por palavra forte, nunca em todas", "whoosh curto no giro e na forma que varre", "batida grave na palavra que cresce"],
    mixagem: "Voz a -14 LUFS, seca e próxima; trilha a -22 dB; efeitos baixos e precisos, alinhados ao quadro da animação.",
  },
  nunca: [
    "Movimento linear ou entrada sem curva.",
    "Contorno, sombra dura, brilho ou degradê na letra.",
    "Frase inteira aparecendo de uma vez.",
    "Mais de 10 palavras numa cena ou três famílias juntas.",
    "Palavra entrando antes ou depois da sílaba.",
    "Fonte decorativa ou manuscrita.",
    "Pessoa em tela por mais de 5 s seguidos.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 5 princípios",
      edicao:
        "Um bloco com os números de 1 a 5 empilhados em Archivo 900 cinza; o 1 acende na cor da marca e a câmera aproxima até ele; o nome do princípio se monta palavra por palavra ao lado; a câmera gira 90 graus para o bloco da explicação; na troca, recua para o bloco dos números com o 1 apagado e o 2 aceso.",
    },
    {
      quando: "O primeiro segundo",
      edicao: "Fundo da cor da marca, a frase de impacto entrando palavra por palavra no tempo da voz, a última enorme segurando 1 s.",
    },
    {
      quando: "Uma frase de manifesto (\"a gente não vende casa, vende liberdade\")",
      edicao: "\"a gente não vende\" pequeno, \"CASA\" enorme que é riscada por uma faixa da marca, giro de 90 graus, \"vende\" pequeno e \"liberdade\" em serifa itálica na cor de contraste.",
    },
    {
      quando: "Ela diz um número",
      edicao: "Número tipográfico rolando até o valor em largura cheia, a unidade pequena ao lado, batida grave.",
    },
    {
      quando: "Uma pergunta para o público",
      edicao: "Cada palavra entra e sai sozinha no centro, a última fica com o ponto de interrogação na cor de contraste e 0,5 s de silêncio.",
    },
    {
      quando: "Ela aparece em vídeo",
      edicao: "Forma da marca varre e deixa uma janela retangular com a pessoa por 3 s, uma palavra-chave alinhada à borda da janela; a forma varre de volta para o texto.",
    },
    {
      quando: "O fecho",
      edicao: "Recuo revelando todos os blocos como um cartaz único, síntese palavra por palavra em tela limpa, chamada pequena embaixo, silêncio de 0,5 s.",
    },
  ],
  quadrosDeReferencia: [
    "Fundo chapado quase preto com um bloco tipográfico justificado: uma palavra gigante em caixa alta sem serifa larga e pesada, duas palavras pequenas leves acima e uma palavra em serifa itálica na cor de contraste embaixo.",
    "Fundo inteiro na cor da marca com uma única palavra enorme em caixa alta clara ocupando a largura, e uma faixa fina da mesma cor mais escura atravessando abaixo dela.",
    "Vista recuada de um grande cartaz tipográfico com vários blocos de texto em ângulos retos entre si, tamanhos e pesos contrastantes, um deles em destaque na cor de contraste.",
  ],
  fontes: [
    "https://www.schoolofmotion.com/blog/kinetic-typography-after-effects-part-2 (palavras em camadas separadas, câmera que aproxima e recua para revelar a frase, giro com sobrepasso, marcação do início de cada palavra no áudio)",
    "https://trydemotion.com/blog/kinetic-typography-masterclass (defasagem de 50 a 100 ms, ênfase segura 2 a 4 quadros, pausa de 6 a 8 quadros na quebra, nunca linear, sem serifa pesada)",
    "https://www.ikagency.com/graphic-design-typography/kinetic-typography/ (resumo da busca: entradas de 200 a 400 ms, batidas de 600 a 1200 ms, 1 a 10 palavras por cena)",
    "https://www.todaymade.com/blog/kinetic-typography-examples (resumo da busca: escala de 80% para 100% dá soco, de 50% para 100% devagar dá revelação; revelação por máscara)",
  ],
};

export const TEXTO_TIPOGRAFIA = textoParaOPrompt(TIPOGRAFIA);
