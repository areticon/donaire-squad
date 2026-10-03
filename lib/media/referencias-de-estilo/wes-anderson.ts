import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * SIMETRIA E COR PASTEL, LINGUAGEM DE WES ANDERSON (03/10/2026).
 *
 * O que a pesquisa deu: encenação planimétrica (câmera a 90 graus, frontal,
 * pessoa cravada no centro), câmera no tripé com movimentos só em eixo
 * (travelling lateral, panorâmica chicote de 90 graus, plano de cima para
 * objetos), paleta pastel curada por cena com um contraponto saturado,
 * cartelas de capítulo centradas em geométrica sem serifa (Futura, aqui Jost)
 * com efeito de máquina de escrever, granulação de filme e trilha de cordas,
 * sopros e percussão leve. Descreve a LINGUAGEM; nenhum filme é material.
 */
export const WES_ANDERSON: ReferenciaDeEstilo = {
  id: "wes-anderson",
  nome: "Simetria e cor pastel",
  inspiracao: "Wes Anderson",
  essencia:
    "Cada quadro é uma vitrine montada: a pessoa cravada no centro, de frente, com o cenário espelhado dos dois lados e uma paleta pastel de duas ou três cores que se repete em tudo (parede, roupa, objeto, cartela). A câmera não segue ninguém; ela fica parada, desliza de lado como num trilho ou gira 90 graus num chicote. O texto é tipografia de livro antigo e de letreiro: capítulos numerados centrados, etiquetas, plaquinhas. O humor é seco e organizado; a graça está na ordem exagerada.",
  estrutura: {
    abre:
      "Plano frontal simétrico da pessoa parada olhando a câmera por meio segundo antes de falar, com a cartela do título centrada sobre fundo pastel chapado e o gancho dito em tom sério; depois o plano de cima de 3 a 5 objetos alinhados que resumem o assunto.",
    avanca:
      "Em capítulos: cada parte abre com uma cartela numerada (\"Capítulo 2. O preço\"), segue com a pessoa no centro e planos de detalhe frontais, e troca de ideia por chicote lateral ou travelling. Cada capítulo pode ter sua cor dominante dentro da paleta da marca.",
    fecha:
      "Recuo frontal lento até o plano geral simétrico com a pessoa pequena no centro, cartela final \"Fim\" ou a chamada em letreiro, e o logo da marca centrado como um selo.",
  },
  ritmo: {
    cenaSeg: [3, 8],
    cortesPorMinuto: [8, 14],
    zoom:
      "Zoom ótico rápido e reto (snap) em 300 ms do plano geral para o médio, sempre no eixo central, uma ou duas vezes por minuto. Nada de aproximação lenta contínua.",
    observacoes:
      "Câmera fixa ou em trilho: travelling lateral constante, chicote de 90 graus em 250 ms com desfoque de movimento. Corte de plano frontal para plano frontal (campo e contracampo simétricos). Câmera lenta só no momento-chave.",
  },
  tipografia: {
    familias: [
      { papel: "cartela, capítulo e letreiro", familia: "Jost", pesos: "500 e 700, caixa alta espaçada", origem: "google-fonts", alternativa: "League Spartan 700" },
      { papel: "título nobre e número de capítulo", familia: "Bodoni Moda", pesos: "500 e itálico 400", origem: "google-fonts", alternativa: "PT Serif local" },
      { papel: "nota, ficha e etiqueta", familia: "Courier Prime", pesos: "400 e 700", origem: "google-fonts" },
    ],
    hierarquia:
      "Título de cartela a 5% a 6% da altura, caixa alta com espaçamento de +12%. Número de capítulo em serifa a 8%. Letreiro e etiqueta a 2,5% a 3,5%. Ficha datilografada a 2,2%.",
    regras: [
      "Todo texto centrado no eixo vertical do quadro, nunca alinhado à esquerda.",
      "Texto em amarelo-manteiga, creme ou branco sobre o pastel chapado; uma linha fina de enfeite acima e abaixo.",
      "Cartela digitada letra a letra como máquina de escrever.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "rosa", hex: "#F2B8C6" },
      { papel: "amarelo-manteiga", hex: "#F6D776" },
      { papel: "verde-menta", hex: "#A8D5BA" },
      { papel: "azul-céu", hex: "#9CC3D5" },
      { papel: "contraponto vinho", hex: "#8C2F39" },
      { papel: "creme", hex: "#FBF3E4" },
      { papel: "tinta", hex: "#3B2F2F" },
    ],
    marca:
      "A paleta pastel sai da marca: a cor principal clareada (mais branco, menos saturação) vira o fundo dominante, a secundária vira a cor de apoio, e a cor original saturada vira o contraponto pequeno (porta, objeto, selo). Cada capítulo pode tomar um dos tons, nunca mais de três por quadro.",
  },
  elementos: [
    {
      id: "cartela-de-capitulo",
      nome: "Cartela de capítulo centrada",
      forma:
        "Tela inteira em pastel chapado com o número do capítulo em serifa e o título em caixa alta espaçada, tudo centrado. Duas linhas finas de 2 px acima e abaixo; moldura interna de 1 px a 6% da borda; granulação leve.",
      animacao: "O título digita letra a letra a 40 ms por letra. O número aparece seco antes; sai por corte seco.",
      duracaoSeg: [2, 3.5],
      posicao916: "Centro exato, de 40% a 58% da altura. Moldura dentro da área segura.",
      posicao169: "Centro exato, de 38% a 62% da altura.",
      quando: "Abertura de cada parte ou ideia nova.",
    },
    {
      id: "plano-de-cima",
      nome: "Mesa de objetos vista de cima",
      forma:
        "Plano de cima de objetos alinhados em grade sobre superfície pastel, cada um com etiqueta datilografada. Até 6 objetos, espaçamento igual, sombras curtas.",
      animacao: "Cada objeto e etiqueta entra seco, um por vez, a cada 250 ms. Como mãos arrumando a mesa; câmera parada.",
      duracaoSeg: [3, 5],
      posicao916: "Tela cheia. Grade de 2 colunas entre 20% e 72% da altura.",
      posicao169: "Tela cheia. Grade de 3 colunas entre 15% e 85% da altura.",
      quando: "Lista de ferramentas, itens, ingredientes, o que está em jogo.",
    },
    {
      id: "letreiro",
      nome: "Letreiro e plaquinha",
      forma:
        "Placa retangular com moldura dupla e texto curto em caixa alta, como letreiro de hotel ou de loja. Fundo na cor de contraponto, texto creme; cantos chanfrados de 6 px.",
      animacao: "Cai de cima e para com balanço amortecido de 3 graus em 500 ms. Fica imóvel depois.",
      duracaoSeg: [2, 4],
      posicao916: "Topo do quadro, de 16% a 26% da altura. Centrado acima da cabeça.",
      posicao169: "Topo centrado, de 8% a 20% da altura.",
      quando: "Nome de lugar, de produto, de método ou de etapa.",
    },
    {
      id: "ficha-datilografada",
      nome: "Ficha datilografada",
      forma:
        "Cartão creme com cabeçalho e 3 a 5 linhas datilografadas (NOME, FUNÇÃO, NOTA). Linhas pontilhadas, carimbo redondo no canto na cor de contraponto.",
      animacao: "O cartão desliza de baixo em 300 ms e as linhas digitam em sequência. O carimbo bate seco no fim, escala 1,2 para 1 em 120 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Centrado, de 50% a 72% da altura. Sob o rosto.",
      posicao169: "Metade direita, de 30% a 75% da altura.",
      quando: "Apresentar pessoa, cliente, produto ou caso.",
    },
    {
      id: "chicote-lateral",
      nome: "Chicote lateral de 90 graus",
      forma: "Transição de panorâmica rápida com desfoque horizontal de movimento. A cena de destino também é frontal e simétrica.",
      animacao: "Gira 90 graus em 250 ms com desfoque de 40 px. Curva rápida no meio e parada seca no destino.",
      duracaoSeg: [0.25, 0.4],
      posicao916: "Tela inteira.",
      posicao169: "Tela inteira.",
      quando: "Mudança de lado, de pessoa ou de capítulo, e campo e contracampo.",
    },
    {
      id: "corte-em-maquete",
      nome: "Corte de casa de bonecas",
      forma:
        "Fachada em corte com cômodos lado a lado, cada um na cor de um tema, desenhada em formas chapadas. Paredes de 6 px, rótulo centrado em cada cômodo.",
      animacao: "A fachada recua e revela os cômodos, depois a câmera desliza de lado de cômodo em cômodo. Cada pouso dura o tempo do item dito.",
      duracaoSeg: [4, 8],
      posicao916: "Tela cheia. Cômodos empilhados de 18% a 76% da altura.",
      posicao169: "Tela cheia. Cômodos lado a lado de 15% a 85% da altura.",
      quando: "Etapas de processo, áreas de uma empresa, partes de um sistema.",
    },
    {
      id: "selo-final",
      nome: "Selo da marca centrado",
      forma: "Logo da marca dentro de um selo redondo de borda dupla com texto em arco. Diâmetro de 30% da largura; cores da marca chapadas.",
      animacao: "Aparece seco e dá um único carimbo de 1,1 para 1 em 150 ms. Fica parado.",
      duracaoSeg: [2, 3],
      posicao916: "Centro, de 38% a 56% da altura.",
      posicao169: "Centro.",
      quando: "O fecho.",
    },
  ],
  insercoesGeradas: {
    quando: "Para planos frontais simétricos que o cliente não filmou: fachadas, corredores, objetos. 2 a 4 por minuto, todos com a paleta da marca em pastel.",
    tipos: [
      "fachada ou corredor frontal perfeitamente simétrico, pastel, sem gente",
      "objeto único no centro sobre fundo pastel chapado, luz suave frontal",
      "plano de cima de objetos alinhados em grade sobre mesa colorida",
      "maquete em miniatura de um lugar (loja, fábrica, prédio) em vista frontal",
    ],
    nunca: "letreiro, placa ou etiqueta com texto desenhado pelo modelo (o texto é sempre código), personagem ou cena reconhecível de filme, rosto de ator.",
  },
  som: {
    trilha: "Cordas dedilhadas, cravo, sopros e percussão leve de orquestra de câmara, excêntrica e em tom menor-maior, 90 a 120 batidas por minuto; para de repente nos cortes de capítulo.",
    efeitos: ["batida seca de máquina de escrever na cartela", "whoosh curto no chicote", "carimbo grave no selo e na ficha", "sino pequeno no letreiro"],
    mixagem: "Voz a -14 LUFS, seca e próxima; trilha a -22 dB sob a fala e -16 dB nas cartelas; silêncio de 0,5 s antes de cada capítulo.",
  },
  nunca: [
    "Pessoa fora do centro ou câmera em ângulo de três quartos.",
    "Câmera na mão, tremida, ou zoom lento contínuo.",
    "Mais de três cores por quadro ou cor saturada como fundo.",
    "Texto alinhado à esquerda, legenda palavra a palavra, emoji.",
    "Cena, personagem, cartaz ou trilha de filme real.",
    "Glitch, brilho neon, degradê digital.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Corte de casa de bonecas com 7 cômodos, um por passo, rótulos centrados; os outros cômodos escurecem 40% e o 1 fica aceso; a câmera desliza até ele e entra a cartela \"Passo 1\" digitada; volta para a pessoa no centro; enquanto ela fala, letreiro e ficha aparecem nos lados vazios; na troca, chicote lateral de volta à fachada, com o 1 carimbado e o 2 aceso.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Pessoa no centro, parada meio segundo, diz o gancho; snap zoom para o médio; cartela do título digitando; plano de cima com os objetos do tema.",
    },
    {
      quando: "Ela apresenta um cliente ou funcionário",
      edicao: "Plano frontal da pessoa citada (ou objeto que a representa) e ficha datilografada com nome e função, carimbo no fim.",
    },
    {
      quando: "Ela compara duas opções",
      edicao: "Dois planos frontais idênticos em cores diferentes da paleta, ligados por chicote lateral; letreiro com o nome de cada opção.",
    },
    {
      quando: "Ela conta algo engraçado ou absurdo",
      edicao: "Corte seco para plano fechado frontal da reação parada por 1 s, trilha para; volta ao plano médio.",
    },
    {
      quando: "Ela muda de assunto",
      edicao: "Silêncio de meio segundo, cartela de capítulo numerada na cor nova, travelling lateral até a pessoa.",
    },
    {
      quando: "O fecho",
      edicao: "Recuo frontal até o plano geral com a pessoa pequena no centro, cartela \"Fim\" e o selo da marca carimbando.",
    },
  ],
  quadrosDeReferencia: [
    "A pessoa sentada exatamente no centro, de frente, numa parede rosa-claro com duas portas iguais e dois quadros espelhados nos lados; acima da cabeça, uma plaquinha vinho com texto creme em caixa alta; luz chapada e granulação leve.",
    "Cartela de tela cheia em amarelo-manteiga com \"CAPÍTULO 2\" em serifa e, abaixo, o título em geométrica caixa alta espaçada, tudo centrado entre duas linhas finas e uma moldura de 1 px.",
    "Vista de cima de uma mesa verde-menta com seis objetos alinhados em grade de duas colunas, cada um com uma etiqueta creme datilografada embaixo, sombras curtas iguais.",
  ],
  fontes: [
    "https://theconversation.com/wes-anderson-has-an-obsessive-systematic-repetition-of-stylistic-choices-hes-perfect-for-this-tiktok-meme-204803 (encenação planar, centro, chicote, Futura com máquina de escrever, planos de cima, câmera lenta)",
    "https://www.studiobinder.com/blog/wes-anderson-style/ (simetria, travelling, chicote, paleta)",
    "https://filmora.wondershare.com/customize-video/how-to-edit-like-wes-anderson.html (tripé, snap zoom, cartela centrada, granulação, trilha)",
    "https://www.getstud.io/wes-anderson-style-graphic-design/ (composição frontal, tipografia vintage, objetos com personalidade, o que evitar)",
    "https://www.designyourway.net/blog/what-font-does-wes-anderson-use/ (Futura Bold centrada sobre fundo chapado, texto creme ou amarelo)",
  ],
};

export const TEXTO_WES_ANDERSON = textoParaOPrompt(WES_ANDERSON);
