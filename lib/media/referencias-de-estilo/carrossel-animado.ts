import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * CARROSSEL ANIMADO, CARTELAS NA COR DA MARCA (03/10/2026).
 *
 * O que a pesquisa deu: o carrossel de Instagram que vira Reels e Shorts.
 * Guias de carrossel concordam em capa que para a rolagem (número, promessa,
 * público nomeado), uma ideia por lâmina, alto contraste, tipografia grande e
 * espaço vazio, e coerência de marca de lâmina a lâmina; os modelos animados
 * (CapCut, Motion Array, Envato) somam o deslize lateral de "passar a lâmina",
 * a barra de progresso segmentada no topo e o texto que entra palavra a
 * palavra ou subindo. Uma só animação de texto no vídeo inteiro fica mais limpo.
 */
export const CARROSSEL_ANIMADO: ReferenciaDeEstilo = {
  id: "carrossel-animado",
  nome: "Carrossel animado",
  inspiracao: "carrosséis educativos do Instagram e do LinkedIn transformados em Reels",
  essencia:
    "Um carrossel que se passa sozinho. Cada ideia é uma lâmina de cor chapada da marca com uma frase grande, e a troca de ideia é um deslize lateral, como o dedo passando a lâmina. A pessoa aparece entre as lâminas ou numa bolha redonda sobre elas, mas quem conduz é o texto: o espectador lê no ritmo da fala e sempre sabe em que lâmina está (barra segmentada e contador 03/07). Visual plano, sem textura, muito espaço vazio e uma palavra grifada por lâmina.",
  estrutura: {
    abre:
      "Lâmina de capa no segundo zero: cor principal da marca, promessa com número em fonte enorme (\"7 erros que travam seu caixa\"), uma palavra grifada e a seta de deslize pulsando. Em 1,5 a 2 s ela desliza e entra a pessoa dizendo o gancho.",
    avanca:
      "Uma lâmina por ideia, 3 a 5 s cada, alternando lâmina cheia e pessoa com rótulo. Em listas, a lâmina-índice volta a cada troca de item, atual aceso e outros apagados. A barra segmentada avança um segmento por lâmina e nunca some.",
    fecha:
      "Lâmina de síntese com os itens marcados, depois a lâmina final de chamada (\"salve para revisar\") com o logo pequeno e o @ do cliente; para 1,5 s, sem vinheta.",
  },
  ritmo: {
    cenaSeg: [2.5, 5],
    cortesPorMinuto: [14, 24],
    zoom:
      "Lâminas com aproximação lenta de 100% para 104%; pessoa de 100% para 106% com corte de enquadramento a cada troca. Sem punch brusco.",
    observacoes:
      "Vídeo de 15 a 45 s, até 90 s em lista longa. Frase acima de 12 palavras vira duas lâminas. O deslize leva 350 a 450 ms e o texto entra no começo da fala que resume.",
  },
  tipografia: {
    familias: [
      { papel: "frase da lâmina e capa", familia: "Montserrat", pesos: "800 e 900", origem: "google-fonts", alternativa: "Anton local, caixa alta" },
      { papel: "apoio", familia: "Inter", pesos: "500 e 600", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "número e contador", familia: "Anton", pesos: "400", origem: "google-fonts e local" },
    ],
    hierarquia:
      "Capa a 9% a 11% da altura, até 3 linhas. Frase da lâmina a 6% a 7,5%. Apoio a 3%, até 2 linhas. Número do item gigante a 18% a 22%, em contorno atrás da frase. Contador e @ a 2%.",
    regras: [
      "Uma frase por lâmina, de 3 a 12 palavras, em bloco alinhado à esquerda.",
      "Uma só palavra grifada por lâmina, em caixa de marca-texto na cor de acento.",
      "Uma só animação de texto no vídeo inteiro (subida de 24 px com fade).",
    ],
  },
  paleta: {
    tipica: [
      { papel: "lâmina principal", hex: "#1E3A8A" },
      { papel: "lâmina alternada", hex: "#F5F1E8" },
      { papel: "grifo", hex: "#FACC15" },
      { papel: "texto claro", hex: "#FFFFFF" },
      { papel: "texto escuro", hex: "#111827" },
      { papel: "apagado", hex: "#9CA3AF" },
      { papel: "feito", hex: "#22C55E" },
    ],
    marca:
      "As lâminas SÃO a marca: a cor principal do cliente é o fundo da lâmina principal, um tom muito claro dela a lâmina alternada, a cor de destaque o grifo. Verde só para item feito; se a marca for verde, o feito vira o acento.",
  },
  elementos: [
    {
      id: "lamina-cheia",
      nome: "Lâmina de cor chapada",
      forma:
        "Tela inteira de cor sólida da marca com uma frase grande alinhada à esquerda e uma palavra grifada. Sem textura nem degradê; margem interna de 8% da largura; opcional um número gigante do item atrás da frase em contorno de 3 px.",
      animacao:
        "Desliza da direita em 400 ms empurrando a anterior. Curva de desaceleração forte; o texto sobe 24 px com fade em 250 ms, palavra a palavra a cada 60 ms, e o grifo se estende da esquerda em 300 ms depois da última palavra.",
      duracaoSeg: [2.5, 5],
      posicao916: "Texto de 24% a 66% da altura. Tela cheia; de 8% a 86% da largura, a coluna direita de 12% fica sem texto.",
      posicao169: "Texto na metade esquerda. De 8% a 55% da largura, centrado na altura; a metade direita recebe o número gigante.",
      quando: "Cada ideia nova, resumida em até 12 palavras.",
    },
    {
      id: "barra-segmentada",
      nome: "Barra de progresso segmentada",
      forma:
        "Fileira de segmentos finos no topo, um por lâmina, como nos stories. Vistos cheios, o atual enchendo, futuros a 30% de opacidade; altura de 6 px no 9:16 e 5 px no 16:9, vão de 6 px.",
      animacao: "O segmento atual enche linearmente durante a lâmina. Aparece com a capa em fade de 200 ms; na troca, o segmento completa em 120 ms.",
      duracaoSeg: [15, 90],
      posicao916: "A 14% da altura. De 6% a 88% da largura.",
      posicao169: "A 6% da altura. De 5% a 95% da largura.",
      quando: "O vídeo inteiro, desde a capa.",
    },
    {
      id: "contador-de-lamina",
      nome: "Contador 03/07",
      forma: "Número atual e total em condensada numa pílula da cor de acento. Raio total, 2% da altura, texto escuro.",
      animacao: "O número rola para cima como odômetro em 250 ms.",
      duracaoSeg: [3, 90],
      posicao916: "Canto superior esquerdo, a 16% da altura. Alinhado a 6% da largura, logo abaixo da barra.",
      posicao169: "Canto superior direito, a 9% da altura. Alinhado à margem de 5%.",
      quando: "Vídeo em lista; some na capa e na final.",
    },
    {
      id: "indice-com-apagado",
      nome: "Lâmina-índice com itens apagados",
      forma:
        "Título curto e a lista numerada inteira; o atual cheio e grifado, os outros a 35%, os feitos riscados com check. Número em Anton, item em Inter 600, entrelinha de 1,6; risco de 3 px.",
      animacao:
        "Itens em cascata a cada 70 ms, depois os não atuais apagam em 250 ms. Na troca, o risco atravessa o feito em 300 ms e o grifo pula para o próximo com mola em 350 ms.",
      duracaoSeg: [2, 4],
      posicao916: "Lista de 28% a 72% da altura. Título a 18% a 24%; de 8% a 86% da largura.",
      posicao169: "Lista de 22% a 85% da altura na metade esquerda. Título a 10% a 18%; duas colunas acima de 6 itens.",
      quando: "A fala anuncia uma lista, e a cada troca de item.",
    },
    {
      id: "bolha-da-pessoa",
      nome: "Pessoa em bolha sobre a lâmina",
      forma:
        "Recorte circular da pessoa falando, com borda branca de 6 px, sobre a lâmina. Diâmetro de 30% da largura no 9:16 e 18% no 16:9; sombra suave de 12 px a 15%.",
      animacao: "Cresce com rebote leve em 350 ms. Escala 0 para 1,06 para 1; sai encolhendo em 200 ms.",
      duracaoSeg: [3, 12],
      posicao916: "Canto inferior esquerdo, base a 76% da altura. Acima da legenda da rede.",
      posicao169: "Canto inferior direito, acima dos 8% do player. Dentro da margem de 5%.",
      quando: "A lâmina passa de 4 s e a pessoa segue explicando.",
    },
    {
      id: "rotulo-sobre-a-pessoa",
      nome: "Rótulo da ideia sobre a pessoa",
      forma:
        "Retângulo da cor da marca com a frase-chave em branco bold, sobre a pessoa em tela cheia. Raio 14 px, padding de 1,5% da altura, até 6 palavras.",
      animacao: "Desliza 40 px da esquerda em 300 ms. Sai para a esquerda em 200 ms quando a próxima lâmina entra.",
      duracaoSeg: [2, 5],
      posicao916: "De 60% a 70% da altura, sob o queixo. Alinhado a 6% da largura.",
      posicao169: "Terço inferior, 70% a 80% da altura. Alinhado à margem esquerda.",
      quando: "A pessoa dá o exemplo de uma ideia já mostrada.",
    },
    {
      id: "lamina-final-cta",
      nome: "Lâmina final de chamada",
      forma:
        "Lâmina da cor principal com a chamada em duas linhas, ícone de linha grande (salvar ou enviar) acima, logo pequeno e @ embaixo. Ícone de 14% da largura em traço de 5 px.",
      animacao: "O ícone desenha o traço em 500 ms e a chamada sobe em 250 ms. O ícone dá um pulso de 6% no fim.",
      duracaoSeg: [2, 3.5],
      posicao916: "Centrado, de 28% a 72% da altura. Ícone a 28% a 38%, chamada a 42% a 56%, logo e @ a 66% a 72%.",
      posicao169: "Centrado, de 25% a 78% da altura. Ícone a 25% a 40%, chamada a 45% a 62%, logo a 75%.",
      quando: "O pedido de salvar, enviar ou seguir.",
    },
  ],
  insercoesGeradas: {
    quando: "Quase nunca: as lâminas são código. No máximo uma imagem a cada 3 lâminas, em janela arredondada dentro da lâmina.",
    tipos: [
      "objeto do exemplo em fundo liso da cor da marca, centralizado, sombra curta",
      "ilustração plana sem texto de uma cena simples, em janela de raio 24 px",
      "plano de 2 s de mãos fazendo a ação, escurecido 60% atrás da frase",
    ],
    nunca: "lâmina inteira gerada, texto, número, gráfico ou logo desenhado por modelo, foto de banco genérica.",
  },
  som: {
    trilha: "Pop eletrônico leve ou lo-fi sem letra, 100 a 120 batidas por minuto; as trocas de lâmina caem na batida.",
    efeitos: ["deslize de ar curto em cada troca", "clique suave no grifo", "tique no check do item feito", "pop discreto na bolha"],
    mixagem: "Voz a -14 LUFS; trilha a -24 dB sob a fala e -18 dB sem fala; efeitos a -20 dB.",
  },
  nunca: [
    "Duas ideias ou mais de 12 palavras na mesma lâmina.",
    "Parágrafo, ou texto abaixo de 3% da altura.",
    "Foto, degradê ou textura atrás do texto da lâmina.",
    "Trocar de lâmina com corte seco, giro, cubo 3D ou zoom; é sempre o deslize lateral.",
    "Esconder a barra de progresso no meio do vídeo.",
    "Mais de duas famílias de fonte ou duas animações de texto.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Desliza para o índice com os 7; apaga 6, grifa o 1; desliza para a lâmina PASSO 1 com o número gigante atrás; volta para a pessoa com o rótulo sob o queixo; se ela se estende, a lâmina volta com a pessoa em bolha; ao trocar de passo, o índice reaparece com o 1 riscado e o 2 grifado, contador de 01/07 para 02/07.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Capa com promessa e número, seta pulsando, barra já no topo; desliza para a pessoa em plano fechado dizendo o gancho.",
    },
    {
      quando: "Ela diz uma frase de efeito (\"cliente não compra produto, compra alívio\")",
      edicao: "Lâmina clara só com a frase, \"alívio\" grifado, aproximação lenta; volta para a pessoa sem rótulo.",
    },
    {
      quando: "Ela compara o errado e o certo",
      edicao: "Lâmina escura com X no canto e o jeito errado; desliza a lâmina da marca com check e o jeito certo.",
    },
    {
      quando: "Ela dá um número (\"80% das vendas vêm de 20% dos clientes\")",
      edicao: "Lâmina com 80% gigante contando de 0 em 700 ms e a frase curta abaixo; volta para a pessoa.",
    },
    {
      quando: "Ela conta um exemplo de 15 s",
      edicao: "Fica na pessoa com dois cortes de enquadramento; rótulo na primeira metade; a barra lembra onde está.",
    },
    {
      quando: "O fecho (\"salva esse vídeo\")",
      edicao: "Síntese com os 7 marcados de verde, lâmina final com o ícone de salvar desenhando, logo e @; para 1,5 s.",
    },
  ],
  quadrosDeReferencia: [
    "Tela vertical inteira em azul da marca, sem foto: no topo, uma fileira de 7 segmentos finos (3 cheios, 1 enchendo); à esquerda, pílula amarela com \"04/07\"; no meio, uma frase branca grande em três linhas alinhadas à esquerda, uma palavra com caixa amarela de marca-texto; atrás, um \"4\" gigante em contorno.",
    "A pessoa em plano médio num ambiente real, olhando para a câmera, com um retângulo azul arredondado sob o queixo contendo uma frase curta em branco bold; a barra segmentada continua visível no topo.",
    "Lâmina off-white com o título \"7 passos\" e uma lista numerada: o 1 e o 2 riscados com check verde, o 3 em preto com grifo amarelo, do 4 ao 7 em cinza apagado; uma bolha redonda com o rosto da pessoa no canto inferior esquerdo.",
  ],
  fontes: [
    "https://www.socialhabitmarketing.com/article-posts/the-ultimate-guide-to-designing-a-perfect-instagram-carousel (capa que para a rolagem, clareza, alto contraste, coerência de marca entre lâminas)",
    "https://www.capcut.com/resource/how-to-make-a-carousel-on-instagram e /instagram-carousel-template (carrossel em vídeo, uma animação de texto só, subida e palavra a palavra)",
    "https://motionarray.com/after-effects-templates/instagram-stories-slider-carousel-244916/ (deslize lateral entre lâminas, barra de stories)",
    "https://yoursocial.team/blog/instagrams-rings-awards-are-here-but-where-are-the-small-creators-6a4t3 (carrossel de deslize contínuo, \"hold and scroll\")",
    "docs/estilos-de-edicao-de-video.md, ficha 20 (uma ideia a cada 3 a 5 s, barras de progresso, deslize lateral)",
  ],
};

export const TEXTO_CARROSSEL_ANIMADO = textoParaOPrompt(CARROSSEL_ANIMADO);
