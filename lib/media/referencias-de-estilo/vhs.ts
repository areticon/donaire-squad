import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * RETRÔ E VHS (03/10/2026).
 *
 * O que a pesquisa deu: o visual de fita é uma pilha de defeitos conhecidos.
 * Resolução de definição padrão (640 ou 720 de largura, ampliada), canais de
 * cor deslocados uns 2 px (vermelho para a direita, azul para a esquerda),
 * contraste baixo (0,85) e saturação reduzida com sangramento de cor, linhas de
 * varredura, ruído, faixa de rastreamento torta na base, quadro 4:3 com bordas
 * de TV, e o texto de tela do videocassete (PLAY, REC, data e hora) em fonte
 * de bloco monoespaçada (VCR OSD Mono; no Google Fonts, VT323). Transições de
 * rebobinar e de avanço rápido com faixas horizontais.
 */
export const VHS: ReferenciaDeEstilo = {
  id: "vhs",
  nome: "Retrô e VHS",
  inspiracao: "fitas caseiras de videocassete e a estética synthwave dos anos 80 e 90",
  essencia:
    "O vídeo parece uma fita achada na gaveta: imagem levemente borrada, cor desbotada que sangra, canais vermelho e azul descolados nas bordas, linhas de varredura, chiado e uma faixa torta que treme na base. Por cima, o texto do videocassete em letra de bloco (PLAY, REC, a data no canto) e títulos em neon magenta e ciano. A edição em si é de impacto, com ritmo médio e imagens de apoio; o defeito é a moldura, não pode impedir de ler nem de ouvir. A nostalgia é o argumento: \"antigamente era assim\".",
  estrutura: {
    abre:
      "Tela azul de videocassete com \"PLAY\" no canto, chiado de 0,5 s, a imagem estabiliza com uma faixa de rastreamento subindo e a pessoa já dizendo o gancho; o título entra em neon com aberração cromática e a data no canto inferior.",
    avanca:
      "Blocos separados por transições de fita: rebobinar para voltar no tempo, avanço rápido para pular etapa, pausa com faixas tremendo para destacar. Imagens de apoio com mais defeito que a pessoa; o contador de fita avança de bloco em bloco.",
    fecha:
      "Frase final da pessoa, \"STOP\" no canto, a imagem colapsa numa linha horizontal branca e um ponto, como TV de tubo desligando; tela preta com o logo da marca em neon por 1,5 s.",
  },
  ritmo: {
    cenaSeg: [2.5, 6],
    cortesPorMinuto: [10, 18],
    zoom:
      "Punch de 110% a 115% com tremor de rastreamento de 2 quadros na frase de impacto; aproximação lenta de 100% para 105% na pessoa. Sem zoom suave no grafismo.",
    observacoes:
      "Glitch de 3 a 6 quadros em no máximo um corte a cada 15 s, sempre num corte. Linhas e grão contínuos; a faixa de rastreamento passa a cada 8 a 15 s.",
  },
  tipografia: {
    familias: [
      { papel: "texto do videocassete, data, contador", familia: "VT323", pesos: "400, caixa alta", origem: "google-fonts", alternativa: "Share Tech Mono" },
      { papel: "título neon", familia: "Audiowide", pesos: "400", origem: "google-fonts", alternativa: "Monoton para uma palavra" },
      { papel: "rótulo e lista", familia: "Press Start 2P", pesos: "400", origem: "google-fonts", alternativa: "VT323 maior" },
    ],
    hierarquia:
      "Título neon a 7% a 9% da altura, com brilho de 16 px. Texto do videocassete a 3,5% a 4,5%, branco com sombra preta dura de 3 px. Rótulo pixelado a 2,5% a 3%. Data a 3%.",
    regras: [
      "Texto de tela sempre branco ou verde de fósforo com contorno; título em magenta ou ciano com aberração cromática de 2 a 4 px.",
      "Texto do videocassete em caixa alta, sem acento decorativo, alinhado ao canto.",
      "O texto não treme junto com a imagem; só o título pisca no glitch.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "tela azul", hex: "#0018A8" },
      { papel: "magenta neon", hex: "#FF2E88" },
      { papel: "ciano neon", hex: "#2DE2E6" },
      { papel: "roxo de fundo", hex: "#241734" },
      { papel: "verde de fósforo", hex: "#39FF14" },
      { papel: "texto de tela", hex: "#F2F2F2" },
      { papel: "preto de tubo", hex: "#0B0B0F" },
    ],
    marca:
      "A cor da marca toma o lugar do magenta no título e no neon; o ciano vira o complementar dela. A tela azul de abertura pode virar a cor da marca escurecida. A imagem tem saturação reduzida a 70% e contraste a 85%, com leve puxada para magenta nas sombras.",
  },
  elementos: [
    {
      id: "osd-videocassete",
      nome: "Texto de tela do videocassete",
      forma:
        "\"PLAY ▶\" no canto superior esquerdo e o contador de fita no direito, em fonte de bloco branca com sombra dura. Ícone de triângulo cheio de 3% da altura; contador SP 0:00:00.",
      animacao: "Aparece seco e pisca duas vezes a 4 Hz. Muda para PAUSE, REW ou FF nas transições.",
      duracaoSeg: [3, 90],
      posicao916: "Topo, a 15% a 19% da altura. PLAY a 6% da largura, contador terminando a 86%.",
      posicao169: "Topo, a 7% a 12% da altura. Nos cantos dentro da margem de 5%.",
      quando: "O vídeo todo; troca de estado a cada transição.",
    },
    {
      id: "data-no-canto",
      nome: "Data da filmagem no canto",
      forma: "Data e hora em fonte de bloco no canto inferior (\"OUT. 12 1994  PM 4:32\"). Branca com sombra; o ano pode ser o ano dito na fala.",
      animacao: "Entra seca. Os segundos avançam; na volta no tempo, os números rolam para trás.",
      duracaoSeg: [3, 90],
      posicao916: "Inferior esquerdo, a 72% a 76% da altura. Alinhada a 6% da largura.",
      posicao169: "Inferior direito, a 84% a 88% da altura. Dentro da margem.",
      quando: "Sempre que a fala cita uma época ou data.",
    },
    {
      id: "titulo-neon",
      nome: "Título neon com aberração",
      forma:
        "Palavra ou frase curta em letra larga, magenta com contorno ciano deslocado e brilho. Aberração de 3 px, brilho de 16 px, linhas de varredura por cima a 20%.",
      animacao: "Liga como letreiro de neon: duas piscadas em 200 ms e acende. Glitch horizontal de 2 quadros na saída.",
      duracaoSeg: [1.5, 3.5],
      posicao916: "De 20% a 34% da altura, centrado. Largura máxima de 80%.",
      posicao169: "Centro ou terço superior. Largura máxima de 70%.",
      quando: "Frase de impacto, nome do bloco, título do vídeo.",
    },
    {
      id: "faixa-de-rastreamento",
      nome: "Faixa de rastreamento",
      forma:
        "Banda horizontal de ruído branco e imagem deslocada de 4% a 8% da altura que atravessa o quadro. Dentro dela a imagem desloca 20 a 40 px para o lado; borda de cima mais clara.",
      animacao: "Sobe de baixo para cima em 600 a 900 ms. Uma vez a cada 8 a 15 s, ou fica parada na base tremendo.",
      duracaoSeg: [0.6, 1],
      posicao916: "Quadro inteiro. Em repouso, na base, abaixo de 78%.",
      posicao169: "Quadro inteiro. Em repouso, nos últimos 5% da base.",
      quando: "Trocas de bloco e respiros.",
    },
    {
      id: "rebobinar",
      nome: "Transição de rebobinar",
      forma:
        "A imagem anda para trás acelerada com 3 a 5 faixas horizontais de ruído e \"◀◀ REW\" no canto. Saturação cai a 40% durante.",
      animacao: "Volta acelerada de 0,8 a 1,5 s com faixas pulando. Para seca com um quadro congelado tremendo de 200 ms.",
      duracaoSeg: [0.8, 1.6],
      posicao916: "Quadro inteiro.",
      posicao169: "Quadro inteiro.",
      quando: "\"Lá em 1998\", \"quando comecei\", voltar a um ponto anterior.",
    },
    {
      id: "barras-de-cor",
      nome: "Barras de cor de teste",
      forma: "Sete barras verticais de cor de teste com faixa inferior, cobrindo o quadro. Cores puxadas para a paleta da marca e desbotadas.",
      animacao: "Corte seco com bipe de 1 kHz. Some num glitch de 3 quadros.",
      duracaoSeg: [0.4, 1],
      posicao916: "Quadro inteiro.",
      posicao169: "Quadro inteiro.",
      quando: "Virada forte, \"agora a parte que ninguém conta\".",
    },
    {
      id: "moldura-de-tv",
      nome: "Moldura de TV de tubo",
      forma:
        "Imagem em 4:3 com cantos arredondados e vinheta escura, como vista numa TV antiga. Raio de 6% da largura, curvatura leve e reflexo diagonal a 6%.",
      animacao: "Liga a partir de um ponto branco que abre em linha e depois em quadro em 400 ms. Desliga ao contrário.",
      duracaoSeg: [3, 10],
      posicao916: "Centrada, de 28% a 62% da altura. Largura de 88%, legenda e título fora dela.",
      posicao169: "Centrada, 75% da largura. Fundo roxo escuro ao redor.",
      quando: "Imagem de arquivo, foto antiga, prova do passado.",
    },
  ],
  insercoesGeradas: {
    quando: "Para imagens de época que o cliente não tem: 2 a 4 por minuto, todas passadas pelo filtro de fita com mais defeito que a pessoa.",
    tipos: [
      "filmagem caseira de época (festa, loja, rua, escritório dos anos 90), câmera na mão",
      "objeto retrô em mesa (telefone de disco, fita, computador antigo), luz quente",
      "paisagem synthwave sem texto: grade em perspectiva, sol listrado, céu roxo",
    ],
    nunca: "texto, data, marca ou logo desenhados pelo modelo (o texto de tela é código), personagem ou programa de TV reconhecível, vinheta de emissora real.",
  },
  som: {
    trilha: "Synthwave ou retrowave com bateria eletrônica e baixo de sintetizador, 90 a 118 batidas por minuto, com leve oscilação de fita (wow e flutter) aplicada.",
    efeitos: ["chiado de fita na abertura e nas transições", "som de rebobinar acelerado", "clique mecânico de tecla de videocassete no PLAY e PAUSE", "bipe de barras de teste", "estalo de TV de tubo ligando e desligando"],
    mixagem: "Voz a -14 LUFS limpa, sem efeito de fita; trilha a -22 dB com corte acima de 12 kHz; chiado de fundo a -40 dB contínuo.",
  },
  nunca: [
    "Defeito tão forte que o rosto ou o texto fique ilegível.",
    "Glitch na voz ou em mais de um corte a cada 15 s.",
    "Texto do videocassete em fonte moderna lisa ou com degradê.",
    "Imagem 4K nítida e saturada sem tratamento ao lado da imagem de fita.",
    "Vinheta, logo ou programa de emissora real.",
    "Datas anacrônicas (o ano na data tem de bater com a fala).",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Tela de menu de videocassete em fundo azul com os 7 passos em fonte de bloco; os outros 6 em cinza, o 1 com o cursor ▶ piscando ao lado; chamada \"PASSO 1\" em neon; volta para a pessoa com PLAY no canto; no meio surgem data e título neon conforme ela fala; na troca, avanço rápido de 0,8 s com \"▶▶ FF\" e o menu volta com o cursor no 2.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Tela azul, PLAY, chiado, faixa de rastreamento subindo, a pessoa dizendo o gancho, título neon ligando com duas piscadas.",
    },
    {
      quando: "Ela lembra o começo da empresa (\"em 2009 era só eu e uma mesa\")",
      edicao: "Rebobinar de 1,2 s, moldura de TV com imagem de época, data no canto com o ano 2009, trilha com mais oscilação.",
    },
    {
      quando: "Ela compara antes e agora",
      edicao: "O antes em moldura de TV com defeito forte; corte seco para o agora com defeito leve; data rola até hoje.",
    },
    {
      quando: "Ela solta a frase de impacto",
      edicao: "Punch de 115% com tremor de 2 quadros, título neon da palavra-chave, PAUSE no canto por meio segundo.",
    },
    {
      quando: "Virada forte (\"só que tem um problema\")",
      edicao: "Barras de cor com bipe por 0,5 s, glitch de 3 quadros, volta para a pessoa em plano fechado.",
    },
    {
      quando: "O fecho",
      edicao: "Frase final, STOP no canto, TV desligando numa linha e num ponto, logo da marca em neon no preto.",
    },
  ],
  quadrosDeReferencia: [
    "A pessoa em plano médio com cor desbotada e levemente borrada, linhas de varredura finas, bordas vermelha e azul descoladas no contorno; no topo, \"PLAY ▶\" em letra de bloco branca à esquerda e o contador à direita; embaixo à esquerda, a data \"OUT. 12 1994\".",
    "Fundo roxo escuro com uma TV de tubo de cantos arredondados no centro mostrando uma imagem caseira granulada de época, uma faixa de ruído horizontal atravessando a metade de baixo dela.",
    "Tela azul chapada de menu de videocassete com uma lista em letra de bloco branca, um item com triângulo piscando ao lado e os outros em cinza; título em neon magenta com contorno ciano acima.",
  ],
  fontes: [
    "https://borisfx.com/blog/vhs-effect-in-after-effects-how-to-create/ (resolução SD, linhas de varredura, ruído, degradação de croma e luma, avanço rápido)",
    "https://www.freevisuals.net/post/how-to-make-vhs-effect-in-davinci-resolve (canais deslocados 2 px, contraste 0,85, 4:3, VCR OSD Mono e VT323)",
    "https://www.psd-dude.com/tutorials/resources/vhs-overlay.aspx (PLAY, PAUSE, STOP, REC, data e hora em VCR OSD Mono)",
    "https://pixflow.net/blog/how-to-add-glitch-vhs-and-retro-effects-in-premiere-pro/ (glitch, VHS e retrô na edição)",
    "https://www.dafont.com/vcr-osd-mono.font (a fonte de tela do videocassete, referência para a VT323)",
  ],
};

export const TEXTO_VHS = textoParaOPrompt(VHS);
