import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * PALESTRA DE PALCO, LINGUAGEM TED (03/10/2026).
 *
 * O que a pesquisa deu: o guia de vídeo do TEDx e o blog de edição do TED
 * mandam cortar a saudação e abrir na frase mais forte, usar mais plano médio
 * e fechado que aberto, cortar NA AÇÃO (o gesto esconde o corte) e NA PALAVRA
 * (consoante forte), variar o ângulo para manter o ritmo da internet, pôr o
 * slide em TELA CHEIA assim que é citado (nunca janela ou tela dividida) e
 * revelar o slide por partes, no tempo da fala; tarja de nome perto dos 20 s,
 * seguida da tarja de lugar e data; marca só no começo e no fim. A letra da
 * casa é a Helvetica Neue; o TED recomenda Inter nos slides.
 * Diferença para os outros sóbrios: aqui a pessoa está em PÉ, num palco
 * escuro, falando para uma plateia; o grafismo é o slide dela, não tarja de
 * telejornal nem mapa.
 */
export const TED: ReferenciaDeEstilo = {
  id: "ted",
  nome: "Palestra de palco",
  inspiracao: "palestras do TED",
  essencia:
    "Uma ideia, uma pessoa, um palco escuro. A pessoa em pé sob uma luz quente que a recorta do fundo preto, a câmera alternando médio, fechado e aberto para que o espectador sinta a sala. A edição é invisível: corta no gesto e na palavra forte, nunca no meio do pensamento. O grafismo é o SLIDE da pessoa, em tela cheia, limpo, uma ideia por tela, revelado por partes no ritmo da fala; fora dele, só a tarja de nome no começo e a citação quando a ideia muda.",
  estrutura: {
    abre:
      "Sem saudação: os primeiros 5 a 10 s são a frase mais forte do começo da fala (pergunta, história, dado surpreendente) em plano médio. Aos 15 a 20 s, plano aberto do palco e a tarja de nome e título da palestra; depois a de lugar e data.",
    avanca:
      "Pela ideia: a história abre, a ideia é dita numa frase (vira citação), cada argumento ganha um slide em tela cheia revelado por partes e a pessoa volta ao fechado para o exemplo. Plano da plateia a cada 1 a 2 min, na risada ou no silêncio atento.",
    fecha:
      "A frase final em plano fechado, segurada 1 s; corte para o aberto do palco com a plateia aplaudindo; cartela escura com a ideia em uma frase e o logo do cliente pequeno. Sem tela de agradecimento longa.",
  },
  ritmo: {
    cenaSeg: [4, 9],
    cortesPorMinuto: [7, 14],
    zoom:
      "Sem zoom digital como efeito: a troca de câmera faz o papel. Com uma câmera só, recortes de 100%, 120% e 150% alternados no gesto, como se fossem três câmeras.",
    observacoes:
      "Mais médio e fechado (75% do tempo) que aberto. Corte no fim do gesto ou na consoante forte. Slide entra na palavra que o cita e fica o tempo de ler mais 1 s. Gaguejo e falha técnica saem em corte coberto por gesto ou plateia.",
  },
  tipografia: {
    familias: [
      { papel: "slide, título e citação", familia: "Inter", pesos: "700 (título), 300 (citação)", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "tarja de nome e lugar", familia: "Inter", pesos: "600 e 400", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "número de slide", familia: "Inter Tight", pesos: "800", origem: "google-fonts", alternativa: "Anton local" },
    ],
    hierarquia:
      "Título de slide a 6% a 8% da altura; citação a 5% em peso fino; número de slide a 18% a 24%; tarja com nome a 3% e título da palestra a 2,2%; lugar e data a 2%.",
    regras: [
      "Uma ideia por slide, no máximo 6 palavras no título e 3 itens visíveis por vez.",
      "Branco sobre preto, alinhado à esquerda; o acento da marca em uma palavra só.",
      "Nunca texto sobre o rosto ou sobre o slide em tela cheia.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "palco e slide", hex: "#0A0A0A" },
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "texto secundário", hex: "#9A9A9A" },
      { papel: "luz de palco", hex: "#F2C79A" },
      { papel: "acento", hex: "#E62B1E" },
    ],
    marca:
      "O vermelho da tabela é só lugar: vira a cor de destaque da marca na palavra-chave do slide, no filete da tarja e no número. O fundo do slide continua preto ou o tom mais escuro da marca. Nada do X vermelho, do tapete circular com logo ou da vinheta de terceiros.",
  },
  elementos: [
    {
      id: "tarja-palestrante",
      nome: "Tarja de palestrante",
      forma:
        "Nome em branco e título da palestra em cinza, alinhados à esquerda, com filete vertical na cor da marca. Sem caixa; sombra suave de 25%; filete de 3 px da altura das duas linhas.",
      animacao: "Filete cresce em 250 ms e o texto entra em fade com deslize de 12 px em 400 ms. Sai em fade de 300 ms.",
      duracaoSeg: [4, 5],
      posicao916: "Inferior esquerdo, 66% a 74% da altura, margem 8%.",
      posicao169: "Terço inferior esquerdo, 78% a 88% da altura.",
      quando: "Por volta de 15 a 20 s, uma vez só.",
    },
    {
      id: "lugar-data",
      nome: "Lugar e data do evento",
      forma: "Uma linha curta com o nome do evento, cidade e mês e ano, no mesmo lugar da tarja. Inter 400, cinza claro.",
      animacao: "Fusão cruzada com a tarja em 400 ms. Sai em fade.",
      duracaoSeg: [3, 4],
      posicao916: "Inferior esquerdo, 68% a 72% da altura.",
      posicao169: "Inferior esquerdo, 82% a 86% da altura.",
      quando: "Logo depois da tarja de nome.",
    },
    {
      id: "slide-tela-cheia",
      nome: "Slide em tela cheia",
      forma:
        "Tela preta inteira com uma ideia: título em branco e uma imagem ou um gráfico simples, sem moldura nem janela. Margens internas de 10%; palavra-chave na cor da marca.",
      animacao: "Corte seco para o slide na palavra que o cita. Saída por corte seco para a câmera que dá continuidade ao gesto.",
      duracaoSeg: [3, 8],
      posicao916: "Tela cheia, conteúdo entre 18% e 74% da altura.",
      posicao169: "Tela cheia, conteúdo entre 10% e 88% da altura.",
      quando: "A pessoa mostra algo ou diz \"olhem isso\", \"imagine\", \"aqui está\".",
    },
    {
      id: "slide-por-partes",
      nome: "Slide revelado por partes",
      forma:
        "Slide de lista com os itens empilhados; o item dito em branco, os já ditos em cinza, os futuros ainda invisíveis. Até 5 itens; marcador numérico na cor da marca.",
      animacao: "Cada item entra em fade com deslize de 16 px de baixo em 350 ms, na palavra dita. O item anterior esmaece para cinza 40% em 300 ms.",
      duracaoSeg: [4, 10],
      posicao916: "Coluna de 16% a 72% da altura, largura de 8% a 86%.",
      posicao169: "Metade esquerda, 18% a 82% da altura.",
      quando: "Enumeração, passos, razões, comparações.",
    },
    {
      id: "citacao-de-palco",
      nome: "Citação da ideia",
      forma:
        "A frase-ideia em peso fino e grande sobre preto, com aspas finas na cor da marca. Até 12 palavras, 2 a 3 linhas.",
      animacao: "Linha a linha em fade de 500 ms, 300 ms entre linhas. Sai em fade de 400 ms.",
      duracaoSeg: [3, 5],
      posicao916: "Centro, 34% a 62% da altura.",
      posicao169: "Centro, largura de 15% a 85%.",
      quando: "A pessoa diz a ideia central ou a muda.",
    },
    {
      id: "numero-de-slide",
      nome: "Número de slide",
      forma: "Um número enorme branco sobre preto com uma linha curta de contexto embaixo. A unidade ou o símbolo na cor da marca.",
      animacao: "Corte seco para o número já parado. Sem contador: palco não conta, mostra.",
      duracaoSeg: [2.5, 4],
      posicao916: "Centro, 32% a 58% da altura.",
      posicao169: "Centro.",
      quando: "Dado surpreendente dito.",
    },
    {
      id: "titulo-da-ideia",
      nome: "Cartela da ideia em uma frase",
      forma: "Tela escura com a ideia da palestra em uma frase e o nome da pessoa menor embaixo. Logo do cliente pequeno no rodapé.",
      animacao: "Fusão de 800 ms a partir do plano aberto com aplauso. Fica parada.",
      duracaoSeg: [3, 5],
      posicao916: "Centro, 38% a 60% da altura.",
      posicao169: "Centro.",
      quando: "Fim do vídeo.",
    },
  ],
  insercoesGeradas: {
    quando: "Pouca: a palestra se sustenta na pessoa e no slide. Até 2 por minuto, só quando a história pede uma imagem e não há slide.",
    tipos: [
      "imagem fotográfica de tela cheia do que a história descreve, como seria num slide",
      "plateia de costas em silhueta contra a luz do palco, sem rostos",
      "plano aberto de auditório escuro com uma luz no centro, para abertura sem material",
    ],
    nunca: "texto, número ou gráfico desenhados por modelo (o slide é código), rosto de plateia inventado, palco com logo.",
  },
  som: {
    trilha: "Nenhuma durante a fala. Uma batida curta e limpa de 2 s só na cartela final, se houver.",
    efeitos: ["som da sala: risada, aplauso, silêncio atento", "nenhum whoosh no slide"],
    mixagem: "Voz a -16 LUFS com o ar da sala; risada e aplauso a -22 dB, nunca cortados no meio; aplauso final com fade de 2 s.",
  },
  nunca: [
    "Abrir com \"bom dia\", agradecimento ou subida ao palco.",
    "Slide em janela, tela dividida ou sobre a pessoa.",
    "Trilha por baixo da fala, efeito sonoro, punch, legenda palavra a palavra.",
    "Logo ou marca no meio do vídeo.",
    "Cortar a risada ou o aplauso no meio.",
    "Mais de um elemento na tela ao mesmo tempo.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Slide em tela cheia com \"7 passos\" e o 1 aparecendo na palavra; corte para ela no fechado explicando o 1, aberto no gesto largo; ao dizer o 2, volta o slide com o 1 em cinza e o 2 em branco; no 4, plano da plateia; no fim, slide com os 7 visíveis e o 7 em branco.",
    },
    { quando: "Os primeiros segundos", edicao: "A frase mais forte em plano médio, sem saudação; aberto do palco; tarja de nome e título; lugar e data." },
    { quando: "Ela diz a ideia central", edicao: "Fechado na frase, corte para a citação da ideia sobre preto 4 s, volta para o médio." },
    { quando: "Ela cita um dado surpreendente", edicao: "Corte seco para o número de slide enorme; volta para ela no fechado; se a plateia reage, plano da plateia." },
    { quando: "Ela conta uma história pessoal", edicao: "Fechado o tempo todo, um aberto no gesto que muda de cena, uma imagem de tela cheia do lugar se não houver slide." },
    { quando: "A plateia ri", edicao: "Corte para a plateia na risada, volta para ela antes da próxima frase; o som da risada não é cortado." },
    { quando: "O fim", edicao: "Última frase no fechado segurada 1 s, aberto com aplauso, cartela da ideia em uma frase com o logo." },
  ],
  quadrosDeReferencia: [
    "A pessoa em pé em plano médio sob luz quente de palco, fundo preto, microfone de cabeça; no canto inferior esquerdo, um filete vertical na cor da marca com o nome em branco e o título da palestra em cinza.",
    "Tela preta inteira com uma lista de três itens alinhada à esquerda: o primeiro em cinza, o segundo em branco com o número na cor da marca, o terceiro ainda ausente.",
    "Plano aberto de um palco escuro visto do fundo do auditório, cabeças da plateia em silhueta em primeiro plano, a pessoa pequena e iluminada no centro.",
  ],
  fontes: [
    "https://blog.ted.com/10-tips-for-editing-video/ (cortar na ação e na palavra, médio e fechado, slide revelado por partes)",
    "https://www.ted.com/participate/organize-a-local-tedx-event/tedx-organizer-guide/video-photography/video/video-prep-production (sem saudação, frase forte nos primeiros 5 a 10 s, slide em tela cheia, sem janela ou tela dividida, marca só no começo e no fim)",
    "https://storage.ted.com/tedx/manuals/TEDxSHOOTINGGUIDELINES.pdf (duas câmeras com tamanhos de plano diferentes, tarja perto dos 20 s seguida de lugar e data; lido pelo resumo da busca)",
    "https://www.ted.com/participate/organize-a-local-tedx-event/tedx-organizer-guide/speakers-program/prepare-your-speaker/create-prepare-slides (slide com sem serifa simples como Inter ou Helvetica)",
    "https://www.monotype.com/resources/case-studies/neue-helvetica-comes-into-its-own-for-ted (Neue Helvetica como letra da casa)",
  ],
};

export const TEXTO_TED = textoParaOPrompt(TED);
