import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * DEPOIMENTO DE CLIENTE (03/10/2026): a prova social em vídeo.
 *
 * O que a pesquisa deu: o depoimento que converte abre nos primeiros 1 a 3 s
 * com o resultado concreto ou a objeção ("eu desconfiava"), segue o arco
 * problema, virada, resultado e "para quem é", dura de 45 s a 2 min, corta o
 * tempo morto sem dó, põe nome e cargo na tarja em vez de a pessoa se
 * apresentar, puxa o número (dinheiro, prazo, porcentagem) para a tela, usa
 * imagem de apoio do cliente usando o produto como tempero e não como prato,
 * mantém a trilha baixa e a linguagem sem promessa exagerada.
 * Diferença para o "60-minutes" e o "documentario": aqui não há
 * entrevistador nem capítulos; é uma pessoa só, curta, e o NÚMERO DO
 * RESULTADO é o grafismo mais importante.
 */
export const DEPOIMENTO: ReferenciaDeEstilo = {
  id: "depoimento",
  nome: "Depoimento de cliente",
  inspiracao: "depoimentos de cliente de empresas B2B",
  essencia:
    "Uma pessoa real contando o que mudou no negócio dela, sem roteiro decorado. Plano médio levemente fora do centro, no ambiente de trabalho dela, luz natural, olhar para quem pergunta fora do quadro. A fala manda: corta o tempo morto, guarda a emoção. A imagem de apoio mostra o negócio dela funcionando, e o grafismo existe para tornar a prova visível: quem ela é, a frase-chave grifada, o número do resultado grande, antes e depois.",
  estrutura: {
    abre:
      "Nos primeiros 1 a 3 s, a frase do resultado ou da desconfiança (\"em 30 dias a gente dobrou\" ou \"eu não acreditava\"), já com o número na tela; depois a tarja com nome, cargo e empresa sobre um plano do negócio dela.",
    avanca:
      "Arco fixo: O PROBLEMA (como era, em plano médio, apoio do dia a dia difícil), A VIRADA (quando conheceu a solução, apoio do produto em uso), O RESULTADO (número grande, antes e depois, frase-chave grifada). Cada parte de 15 a 40 s.",
    fecha:
      "PARA QUEM É: ela diz a quem recomendaria, em plano fechado; cartela final com a frase-chave entre aspas, nome dela e o logo do cliente com a chamada curta.",
  },
  ritmo: {
    cenaSeg: [3, 7],
    cortesPorMinuto: [10, 18],
    zoom:
      "Dois tamanhos: médio e fechado, trocados por corte para esconder o salto da edição. Aproximação lenta de 100% para 104% no resultado.",
    observacoes:
      "Tempo morto e muleta saem todos; a pausa de emoção fica. Apoio de 2 a 4 s cobre todo corte que ficaria visível. Duração alvo de 45 s a 2 min.",
  },
  tipografia: {
    familias: [
      { papel: "tarja e texto corrido", familia: "DM Sans", pesos: "700 (nome) e 400 (cargo)", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "número do resultado", familia: "DM Sans", pesos: "800", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "frase-chave entre aspas", familia: "DM Serif Display", pesos: "400", origem: "google-fonts", alternativa: "PT Serif local" },
    ],
    hierarquia:
      "Número do resultado a 14% a 18% da altura com a legenda a 3%; frase-chave a 4,5% a 5,5%; tarja com nome a 3%, cargo e empresa a 2,2%; legenda limpa a 3,2%.",
    regras: [
      "Uma ideia por quadro: tarja OU número OU frase, nunca dois juntos.",
      "Número sempre com o que mede e o prazo (\"+42% em vendas, 6 meses\").",
      "Legenda limpa de duas linhas o vídeo inteiro (a maioria assiste sem som).",
    ],
  },
  paleta: {
    tipica: [
      { papel: "painel claro da tarja", hex: "#FFFFFF" },
      { papel: "texto escuro", hex: "#16181D" },
      { papel: "positivo", hex: "#1E9E5A" },
      { papel: "antes, neutro", hex: "#8A8F98" },
      { papel: "véu da cartela", hex: "#000000B3" },
    ],
    marca:
      "A cor da marca vai no filete da tarja, no grifo da frase-chave e no número do resultado; o verde da tabela só se a marca não tiver acento que leia como positivo. A imagem fica com cor natural: o negócio do cliente é real, não gradado.",
  },
  elementos: [
    {
      id: "tarja-cliente",
      nome: "Tarja de cliente",
      forma:
        "Painel claro arredondado com o nome em negrito e cargo e empresa embaixo, com um filete vertical na cor da marca à esquerda. Raio 10 px, filete de 6 px, sombra suave de 15%.",
      animacao: "O painel desliza 24 px da esquerda em 350 ms e o texto entra 120 ms depois. Sai deslizando de volta em 300 ms.",
      duracaoSeg: [3.5, 5],
      posicao916: "Inferior esquerdo, 64% a 74% da altura, margem 6%.",
      posicao169: "Terço inferior esquerdo, 76% a 88% da altura.",
      quando: "Logo depois do gancho, uma vez.",
    },
    {
      id: "numero-resultado",
      nome: "Número do resultado",
      forma:
        "Número enorme na cor da marca com o sinal (+, -, x), o que mede embaixo e o prazo em cinza. Sobre a imagem com véu escuro ou sobre painel claro.",
      animacao: "O número conta de 0 até o valor em 900 ms desacelerando e assenta com um pulso de 4%. Sai em fade de 300 ms.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 20% a 42% da altura, acima do rosto.",
      posicao169: "Metade livre ao lado da pessoa, 25% a 70% da altura.",
      quando: "Ela diz o resultado com número.",
    },
    {
      id: "antes-depois",
      nome: "Antes e depois",
      forma:
        "Duas barras ou dois cartões lado a lado: ANTES em cinza com o valor menor, DEPOIS na cor da marca com o valor maior. Rótulo em caixa alta pequena acima de cada um.",
      animacao: "O ANTES aparece em 300 ms; a barra do DEPOIS cresce em 800 ms até a altura proporcional. Uma seta fina liga os dois em 300 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 18% a 46% da altura.",
      posicao169: "Lado livre, 25% a 75% da altura.",
      quando: "Ela compara como era e como ficou.",
    },
    {
      id: "frase-grifada",
      nome: "Frase-chave grifada",
      forma:
        "A frase dela entre aspas em serifa, com o trecho principal grifado por uma faixa na cor da marca atrás das letras. Até 10 palavras.",
      animacao: "A frase entra em fade de 400 ms e o grifo corre da esquerda em 500 ms na palavra dita. Sai em fade.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 18% a 34% da altura.",
      posicao169: "Terço superior ou lado livre.",
      quando: "A frase mais forte de cada parte do arco.",
    },
    {
      id: "selo-contexto",
      nome: "Selo de contexto",
      forma:
        "Pílula pequena com ícone e um dado do cliente: setor, cidade ou tempo como cliente. Fundo claro, texto escuro, ícone de traço na cor da marca.",
      animacao: "Escala de 90% para 100% em 250 ms com fade. Sai em fade.",
      duracaoSeg: [2.5, 3.5],
      posicao916: "Logo acima da tarja, 60% a 63% da altura.",
      posicao169: "Logo acima da tarja.",
      quando: "Ela menciona o setor ou há quanto tempo é cliente.",
    },
    {
      id: "titulo-de-parte",
      nome: "Título de parte do arco",
      forma:
        "Rótulo curto em caixa alta (ANTES, A VIRADA, DEPOIS) com um filete na cor da marca, sem fundo, sobre o primeiro plano de apoio de cada parte. DM Sans 700 a 2,6% da altura, espaçamento +12%.",
      animacao: "O filete cresce em 250 ms e o rótulo entra em fade de 300 ms. Sai em fade quando a voz volta ao rosto.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Superior esquerdo, 15% a 19% da altura.",
      posicao169: "Superior esquerdo, 7% a 11% da altura.",
      quando: "Entrada de cada parte do arco, com a voz continuando sobre o apoio.",
    },
    {
      id: "cartela-final",
      nome: "Cartela final",
      forma:
        "O último plano escurecido com a frase-chave entre aspas, o nome dela embaixo e o logo do cliente com a chamada curta. Véu de 70%.",
      animacao: "Véu em 500 ms, frase linha a linha em 400 ms, logo e chamada por último. Fica parada.",
      duracaoSeg: [4, 6],
      posicao916: "Frase entre 32% e 52%, logo a 60% a 68% da altura.",
      posicao169: "Frase no centro, logo e chamada abaixo.",
      quando: "Fim.",
    },
  ],
  insercoesGeradas: {
    quando: "Pouca e com cuidado: o apoio ideal é o negócio REAL do cliente. Gerar só ambiente genérico do setor, até 2 por minuto.",
    tipos: [
      "ambiente do setor do cliente (loja, clínica, obra, escritório) em luz natural, sem rostos",
      "detalhe de mãos usando um computador ou ferramenta, tela ilegível",
      "fachada genérica do tipo de negócio, câmera parada",
    ],
    nunca: "número, gráfico, depoimento ou logo desenhados por modelo; rosto inventado passando por cliente; cena que finja ser o negócio dela.",
  },
  som: {
    trilha: "Baixa, positiva e simples (violão, piano leve ou eletrônica suave), 90 a 110 batidas por minuto; sobe só na cartela final.",
    efeitos: ["clique suave no número", "nenhum efeito na tarja"],
    mixagem: "Voz a -14 LUFS, limpa e presente; trilha a -28 dB sob a fala e -18 dB na cartela; testar em alto-falante de celular.",
  },
  nunca: [
    "A pessoa se apresentando (\"meu nome é...\"): isso é a tarja.",
    "Abrir com logo, música ou contexto antes do resultado.",
    "Promessa que ela não disse ou corte que mude o sentido da frase.",
    "Número sem o que mede e sem prazo.",
    "Dois grafismos ao mesmo tempo.",
    "Apoio de banco de imagem que finja ser o negócio dela.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 coisas que mudaram",
      edicao:
        "Não vira lousa: as 3 mais fortes ficam (o resto sai na edição); cada uma em plano médio com apoio do negócio dela; a mais forte ganha o número do resultado; uma frase-chave grifada fecha o bloco.",
    },
    { quando: "Os primeiros segundos", edicao: "A frase do resultado no plano fechado com o número contando, corte para um plano do negócio dela com a tarja." },
    { quando: "Ela conta como era antes", edicao: "Plano médio, apoio do dia a dia difícil (fila, papelada, planilha), antes e depois ainda só com o ANTES em cinza." },
    { quando: "Ela diz quando decidiu contratar", edicao: "Apoio do produto em uso, frase-chave grifada com a palavra da decisão." },
    { quando: "Ela cita o resultado (\"as vendas subiram 42% em 6 meses\")", edicao: "Antes e depois com a barra crescendo, aproximação lenta no rosto na frase seguinte." },
    { quando: "Ela se emociona", edicao: "Plano fechado segurado 1,5 s, trilha desce, nenhum grafismo." },
    { quando: "O fim", edicao: "Ela diz para quem recomenda no fechado; cartela final com a frase, o nome e o logo do cliente." },
  ],
  quadrosDeReferencia: [
    "A pessoa em plano médio no ambiente de trabalho dela, luz natural, olhando para fora da câmera; no canto inferior esquerdo, um painel claro arredondado com filete na cor da marca, nome em negrito e cargo e empresa embaixo.",
    "A pessoa no terço inferior do 9:16 e, acima dela, \"+42%\" enorme na cor da marca com \"em vendas, em 6 meses\" em letra menor embaixo.",
    "Último plano escurecido com uma frase curta entre aspas em serifa, o trecho principal grifado na cor da marca, o nome da pessoa embaixo e o logo do cliente no rodapé.",
  ],
  fontes: [
    "https://www.share.one/testimonial-video-editing-checklist/ (gancho de 1 a 3 s, arco problema, virada, resultado e para quem é; 60 a 120 s; uma ideia por quadro; apoio é tempero)",
    "https://www.testimonialhero.com/blog/6-powerful-b2b-video-testimonial-examples-you-can-copy (número real na fala, apoio do negócio funcionando, recomendação direta no fim)",
    "https://www.contentbeta.com/blog/client-testimonial-videos/ (cortes secos que tiram a pausa, métrica na tarja sem interromper a fala, títulos de antes e depois, voz continuando sobre o apoio)",
    "https://www.popvideo.com/resources/customer-testimonials-b2b-customer-lifecycle-video-types (depoimento como prova no fundo do funil)",
  ],
};

export const TEXTO_DEPOIMENTO = textoParaOPrompt(DEPOIMENTO);
