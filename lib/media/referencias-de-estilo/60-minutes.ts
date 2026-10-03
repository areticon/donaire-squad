import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * ENTREVISTA DE REVISTA, LINGUAGEM 60 MINUTES (03/10/2026).
 *
 * O que a pesquisa deu: a revista eletrônica de reportagem longa (matérias de
 * uns 13 min feitas de horas de entrevista), duas câmeras em plano e
 * contraplano com o entrevistador visível, o plano de escuta (o "nod shot")
 * para esconder o corte, luz de entrevista que deixa só o rosto (profundidade
 * curta, fundo escuro), cenário preto, nenhum grafismo sobreposto durante a
 * reportagem e a matéria apresentada por uma tela com cara de capa de revista;
 * o cronômetro marca o tempo do programa. Diferença para o "documentario":
 * aqui a PERGUNTA está na tela (o entrevistador aparece e pressiona), o
 * close é apertado e frontal, não há trilha nem capítulos poéticos; é
 * jornalismo de confronto, não cinema de memória.
 */
export const SESSENTA_MINUTOS: ReferenciaDeEstilo = {
  id: "60-minutes",
  nome: "Entrevista de revista",
  inspiracao: "a revista eletrônica 60 Minutes",
  essencia:
    "Duas pessoas, duas cadeiras, uma conversa que vale a pena ouvir. Plano e contraplano: o entrevistador pergunta curto e aparece de verdade; a pessoa responde num close apertado, rosto iluminado contra fundo escuro, olhos perto do terço superior. Sem trilha durante a fala: o peso está no silêncio entre a pergunta e a resposta. O grafismo é de revista impressa (capa da matéria, citação puxada, documento com a linha grifada) e quase nunca aparece por cima da entrevista.",
  estrutura: {
    abre:
      "Capa da matéria: tela escura com o título da reportagem em layout de revista sobre uma foto da pessoa, 4 s; a voz do entrevistador apresenta o assunto em uma frase; corte para a pergunta mais dura e a resposta mais forte, só então o plano de dois e a tarja.",
    avanca:
      "Por blocos de pergunta: pergunta curta no contraplano, resposta no close, plano de escuta onde houve corte, apoio (documento, lugar, foto) quando a resposta cita algo verificável, volta ao close na frase de peso. A cada 2 a 3 min, uma pergunta de confronto com pausa segurada.",
    fecha:
      "A última pergunta é pessoal (\"o que você diria a quem duvida?\"), resposta no close mais apertado do vídeo, 2 s de silêncio, plano de dois se afastando, contador de segmento parando e logo do cliente pequeno sobre preto.",
  },
  ritmo: {
    cenaSeg: [4, 12],
    cortesPorMinuto: [6, 12],
    zoom:
      "Três tamanhos fixos, trocados por corte: plano de dois, médio e close apertado (testa cortada, queixo no terço inferior). Com uma câmera, recortes de 100% e 140% simulam a segunda câmera.",
    observacoes:
      "Pergunta de 3 a 8 s; resposta deixada inteira. Plano de escuta de 1 a 2 s sobre todo corte dentro da resposta. Pausa antes da resposta difícil fica na tela.",
  },
  tipografia: {
    familias: [
      { papel: "capa da matéria e título", familia: "Libre Franklin", pesos: "800, caixa alta", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "citação puxada", familia: "Source Serif 4", pesos: "600 itálico", origem: "google-fonts", alternativa: "PT Serif local" },
      { papel: "tarja, rótulo, contador", familia: "Libre Franklin", pesos: "500 e 400", origem: "google-fonts", alternativa: "Liberation Sans local" },
    ],
    hierarquia:
      "Título da capa a 8% a 10% da altura, apertado; citação a 4,5% a 5%; tarja com nome a 2,8% e função a 2%; contador e rótulo a 2%.",
    regras: [
      "Texto branco sobre preto ou preto sobre papel claro, nunca colorido.",
      "Citação sempre literal, com o nome de quem disse embaixo.",
      "Nada de texto sobre o close durante a resposta, exceto a tarja.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo e cenário", hex: "#0D0D0D" },
      { papel: "texto", hex: "#F4F2EE" },
      { papel: "papel de documento", hex: "#ECE7DC" },
      { papel: "tom de pele quente", hex: "#C08A64" },
      { papel: "cinza de apoio", hex: "#6E6E6E" },
    ],
    marca:
      "A marca vira só o grifo do documento, o filete da tarja e o ponteiro do contador; o resto é preto, branco e papel. A cor da imagem é natural e quente. Nunca o relógio, a abertura ou a capa de terceiros.",
  },
  elementos: [
    {
      id: "capa-da-materia",
      nome: "Capa da matéria",
      forma:
        "Layout de capa de revista: foto da pessoa em preto e branco ou cor contida, título grande em caixa alta e uma linha de chamada. Título em Libre Franklin 800 sobre a foto, filete de 4 px na cor da marca acima.",
      animacao: "A foto aproxima de 100% para 104% em 4 s e o título entra em fade de 500 ms. Sai por corte seco para a entrevista.",
      duracaoSeg: [3, 5],
      posicao916: "Tela cheia; título entre 16% e 34% da altura.",
      posicao169: "Tela cheia; título no terço esquerdo, 20% a 60% da altura.",
      quando: "Abertura e cada nova matéria dentro do vídeo.",
    },
    {
      id: "tarja-revista",
      nome: "Tarja de entrevistado",
      forma:
        "Nome em branco e função em cinza, sem caixa, com um filete horizontal curto na cor da marca acima. Filete de 40 px por 3 px.",
      animacao: "Filete cresce da esquerda em 250 ms e o texto entra em fade de 400 ms. Sai em fade.",
      duracaoSeg: [3, 4],
      posicao916: "Inferior esquerdo, 66% a 73% da altura.",
      posicao169: "Inferior esquerdo, 78% a 87% da altura, no lado oposto ao olhar.",
      quando: "Primeira resposta de cada pessoa.",
    },
    {
      id: "citacao-puxada",
      nome: "Citação puxada",
      forma:
        "A frase dita em serifa itálica sobre preto, com aspas grandes na cor da marca e o nome embaixo. Ao lado ou atrás, o close congelado da pessoa escurecido 60%.",
      animacao: "O close congela e escurece em 400 ms, a citação entra linha a linha em 500 ms. Sai por corte.",
      duracaoSeg: [3, 5],
      posicao916: "Faixa de 36% a 62% da altura.",
      posicao169: "Metade direita, 30% a 70% da altura.",
      quando: "A frase mais dura ou mais memorável do bloco.",
    },
    {
      id: "pergunta-escrita",
      nome: "Pergunta na tela",
      forma: "A pergunta em uma linha branca sobre faixa preta translúcida, quando o entrevistador não aparece. Libre Franklin 500, até 12 palavras.",
      animacao: "Faixa abre da esquerda em 300 ms e o texto entra junto. Sai quando a resposta começa.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 18% a 24% da altura.",
      posicao169: "Faixa no topo, 8% a 14% da altura.",
      quando: "Pergunta gravada só em áudio ou entrevista com uma câmera.",
    },
    {
      id: "documento-grifado",
      nome: "Documento com a linha grifada",
      forma:
        "Página de documento em papel claro ocupando a tela, uma linha grifada na cor da marca e o resto esmaecido. Grifo com 30% de opacidade; página levemente inclinada 2 graus.",
      animacao: "Aproxima até a linha em 1.500 ms e o grifo corre da esquerda em 600 ms. Sai por corte.",
      duracaoSeg: [3, 6],
      posicao916: "Tela cheia, linha grifada entre 40% e 55% da altura.",
      posicao169: "Tela cheia, linha no centro.",
      quando: "A resposta cita contrato, relatório, número oficial, e-mail.",
    },
    {
      id: "numero-revista",
      nome: "Número de revista",
      forma: "Número grande branco sobre preto com uma frase de contexto e a fonte embaixo em cinza. Sem gráfico.",
      animacao: "Fade de 500 ms, sem contador. Sai por corte.",
      duracaoSeg: [3, 4],
      posicao916: "Centro, 34% a 60% da altura.",
      posicao169: "Centro.",
      quando: "Dado que sustenta ou contradiz a resposta.",
    },
    {
      id: "contador-segmento",
      nome: "Contador de segmento",
      forma:
        "Contador digital discreto em mono (00:12:40) com um ponto que pisca na cor da marca, no canto. Sem mostrador de relógio.",
      animacao: "Fade de 300 ms, os segundos correndo. Para e some em fade.",
      duracaoSeg: [2, 3],
      posicao916: "Superior esquerdo, 14% a 17% da altura.",
      posicao169: "Superior esquerdo, 6% a 9% da altura.",
      quando: "Abertura, troca de bloco e fecho.",
    },
  ],
  insercoesGeradas: {
    quando: "Pouca: a entrevista é o assunto. Até 2 por minuto, só para o que a resposta cita e não há imagem.",
    tipos: [
      "fachada ou sala de trabalho real em luz de fim de tarde, câmera parada",
      "objeto citado sobre mesa escura em luz lateral",
      "foto que parece de arquivo do lugar ou da época citada",
    ],
    nunca: "documento, número ou manchete desenhados por modelo, rosto de pessoa real, reconstituição dramática.",
  },
  som: {
    trilha: "Nenhuma durante a entrevista. Um acorde grave de 2 s só na capa da matéria e no fecho.",
    efeitos: ["tique seco do contador na abertura e no fecho", "som da sala nas pausas"],
    mixagem: "Voz a -16 LUFS, as duas vozes no mesmo nível; ar da sala sempre presente; nada de música por baixo.",
  },
  nunca: [
    "Trilha sob a fala ou efeito sonoro na resposta.",
    "Cortar a pausa antes da resposta difícil.",
    "Corte visível dentro da resposta sem plano de escuta ou apoio.",
    "Grafismo sobre o close enquanto a pessoa responde.",
    "Punch, legenda palavra a palavra, cor saturada.",
    "Copiar relógio, abertura ou capa de terceiros.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "O entrevistador pergunta \"quais são?\" no contraplano; ela responde no close; no passo 1, número de revista \"1 DE 7\" com o nome do passo 3 s; volta ao close; a cada passo, a pergunta curta \"e o segundo?\" e o número seguinte; plano de escuta onde houve corte; no último, plano de dois.",
    },
    { quando: "Os primeiros segundos", edicao: "Capa da matéria 4 s, contador de segmento, a pergunta mais dura e a resposta mais forte, plano de dois, tarja." },
    { quando: "O entrevistador faz uma pergunta de confronto", edicao: "Contraplano na pergunta, corte para o close dela em silêncio 2 s, a resposta inteira sem corte." },
    { quando: "Ela cita um contrato ou relatório", edicao: "Documento em tela cheia com a linha dita grifada na cor da marca; volta ao close." },
    { quando: "Ela diz a frase mais forte do bloco", edicao: "Close segurado, depois citação puxada com o close congelado ao lado." },
    { quando: "A resposta foi encurtada", edicao: "Plano de escuta do entrevistador de 1,5 s sobre o corte; a voz dela continua por baixo." },
    { quando: "O fim", edicao: "Pergunta pessoal, close mais apertado, 2 s de silêncio, plano de dois se afastando, contador parando, logo pequeno." },
  ],
  quadrosDeReferencia: [
    "Close apertado e frontal da pessoa, testa levemente cortada, rosto bem iluminado contra fundo quase preto, olhar um pouco para o lado da câmera onde está o entrevistador.",
    "Plano de dois em ângulo: as costas e o ombro do entrevistador desfocados em primeiro plano e a pessoa na cadeira em frente, sala escura com uma luz prática ao fundo.",
    "Página de documento em papel claro em tela cheia, levemente inclinada, uma linha grifada na cor da marca e o restante esmaecido.",
  ],
  fontes: [
    "https://en.wikipedia.org/wiki/60_Minutes (cronômetro, matéria apresentada com tela de capa de revista, sem grafismo sobreposto na reportagem)",
    "https://en.wikipedia.org/wiki/Nod_shot (plano de escuta para esconder o corte da entrevista)",
    "https://www.linkedin.com/pulse/60-minutes-multi-camera-interviews-apollo-dennis-dillon-haubrich (entrevista em várias câmeras, plano e contraplano; lido pelo resumo da busca)",
    "https://www.linkedin.com/pulse/lighting-backgrounds-60-minutes-interviews-weekend-al-tompkins (luz e profundidade que deixam só o rosto)",
    "https://www.aol.com/articles/anatomy-news-story-60-minutes-225249292.html (horas de entrevista reduzidas a uns 13 min de matéria; lido pelo resumo da busca)",
  ],
};

export const TEXTO_SESSENTA_MINUTOS = textoParaOPrompt(SESSENTA_MINUTOS);
