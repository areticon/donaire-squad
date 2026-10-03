import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * INSTITUCIONAL CINEMATOGRÁFICO (03/10/2026): o filme de marca.
 *
 * O que a pesquisa deu: o filme de marca bom é construído em torno de UMA
 * verdade sobre a empresa, e imagem, trilha, ritmo e voz apontam para ela; o
 * ritmo é o de segurar o plano antes de cortar, recuar antes de avançar e
 * deixar a música crescer no momento certo; corte na ação e na batida;
 * câmera lenta só nos gestos que mostram os
 * valores, com o som sincronizado ao gesto; fusão para passagem de tempo;
 * logo no fim com a imagem desfocada por baixo e pelo menos 5 s parado.
 * Diferença para o "natgeo" e o "documentario": aqui não há mapa, capítulo
 * nem entrevista longa; é montagem musical curta (1 a 4 min), conduzida pela
 * trilha, com frases de valor na letra da marca e depoimentos em voz.
 */
export const INSTITUCIONAL: ReferenciaDeEstilo = {
  id: "institucional",
  nome: "Institucional cinematográfico",
  inspiracao: "filmes de marca e manifestos de empresa",
  essencia:
    "Um manifesto em imagens: pessoas da empresa trabalhando de verdade, mãos, rostos concentrados, o lugar ao amanhecer, tudo com luz de cinema e câmera em movimento suave. A TRILHA manda: a montagem cresce com ela, corta na batida e respira nas pausas. As vozes de quem trabalha ali costuram a história, quase sempre sobre imagem, e poucas palavras da marca aparecem grandes na tela, uma frase de valor de cada vez. Tudo serve a uma única verdade sobre a empresa, dita no fim junto com o logo.",
  estrutura: {
    abre:
      "Silêncio ou uma nota só sobre um detalhe em câmera lenta (mão, ferramenta, luz entrando); uma voz diz a frase que provoca; a trilha começa baixa; a primeira frase de valor aparece em palavra única sobre o plano mais bonito.",
    avanca:
      "Em três movimentos que acompanham a trilha: QUEM SOMOS (pessoas e lugar, ritmo calmo), O QUE FAZEMOS (processo e cliente, cortes na batida, ritmo sobe), POR QUE IMPORTA (impacto, rostos, câmera lenta no pico). Uma frase de valor por movimento, um número de marca no segundo.",
    fecha:
      "O pico da trilha com o plano mais emocionante (equipe, cliente, entrega), a frase-verdade da empresa em tela, a música resolve, o logo entra sobre a imagem desfocada e fica 5 s parado.",
  },
  ritmo: {
    cenaSeg: [2, 6],
    cortesPorMinuto: [12, 24],
    zoom:
      "Sem zoom digital de impacto: deslize, travelling e aproximação lenta de 100% para 106% em cada plano; recuar antes de avançar no pico. Câmera lenta a 50% nos gestos que mostram valor.",
    observacoes:
      "O corte cai na batida forte da trilha ou na respiração da voz. Primeiro movimento com planos de 4 a 6 s, último de 2 a 3 s. Fusão de 500 ms só para passagem de tempo.",
  },
  tipografia: {
    familias: [
      { papel: "frase de valor e verdade final", familia: "Plus Jakarta Sans", pesos: "300 e 700", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "palavra única de impacto", familia: "Fraunces", pesos: "600", origem: "google-fonts", alternativa: "PT Serif Bold local" },
      { papel: "tarja de quem fala, rótulo", familia: "Plus Jakarta Sans", pesos: "500", origem: "google-fonts", alternativa: "Liberation Sans local" },
    ],
    hierarquia:
      "Frase de valor a 5% a 7% da altura, uma palavra em peso forte e o resto fino; palavra única a 12% a 16%; número de marca a 14%; tarja a 2,6% e 2%.",
    regras: [
      "A fonte da marca do cliente substitui as duas primeiras sempre que existir.",
      "No máximo 6 palavras por tela, centradas ou no terço vazio.",
      "Nada de lista, bala ou texto corrido.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "sombra quente", hex: "#1E1914" },
      { papel: "luz de janela", hex: "#F3D9B1" },
      { papel: "pele e madeira", hex: "#B5835A" },
      { papel: "texto", hex: "#FFFFFF" },
      { papel: "véu do logo", hex: "#00000066" },
    ],
    marca:
      "É o estilo em que a marca mais aparece: a fonte da marca nas frases, a cor da marca na palavra forte e no logo, a cor da marca levada para a gradação (altas luzes puxando para o tom da marca em 10% a 15%). Cor chapada da marca como fundo só na assinatura final.",
  },
  elementos: [
    {
      id: "frase-de-valor",
      nome: "Frase de valor",
      forma:
        "Frase curta da marca sobre o plano, peso fino com uma palavra em peso forte na cor da marca. Sombra suave de 30%; até 6 palavras em 1 a 2 linhas.",
      animacao: "Palavra a palavra em fade com deslize de 6 px para cima, uma palavra por batida da trilha. Sai inteira em fade de 500 ms antes do corte.",
      duracaoSeg: [2.5, 4],
      posicao916: "Centro, 38% a 58% da altura.",
      posicao169: "Centro ou terço vazio do plano, 35% a 65% da altura.",
      quando: "Abertura de cada movimento e a frase da voz que resume o valor.",
    },
    {
      id: "palavra-unica",
      nome: "Palavra única",
      forma: "Uma palavra enorme em serifa sobre câmera lenta, branca, com 85% de opacidade. Pode passar atrás da pessoa com recorte de silhueta.",
      animacao: "Fade de 700 ms com escala de 96% para 100%. Sai em fade de 500 ms.",
      duracaoSeg: [1.5, 3],
      posicao916: "Centro, 40% a 56% da altura.",
      posicao169: "Centro.",
      quando: "A voz diz o valor em uma palavra (cuidado, coragem, gente).",
    },
    {
      id: "triade-de-valores",
      nome: "Tríade de valores",
      forma: "Três palavras com ponto final em sequência, cada uma em tela diferente sobre planos diferentes. Mesma posição e tamanho nas três.",
      animacao: "Cada palavra entra por corte seco na batida e o plano troca junto. Sem fade.",
      duracaoSeg: [1, 1.5],
      posicao916: "Centro, 44% a 54% da altura.",
      posicao169: "Centro.",
      quando: "Pico do segundo movimento ou fala que lista três coisas.",
    },
    {
      id: "tarja-de-voz",
      nome: "Tarja de quem fala",
      forma: "Primeiro nome e função em uma linha fina, sem caixa, com um ponto na cor da marca antes. Plus Jakarta Sans 500.",
      animacao: "Fade de 400 ms com deslize de 8 px. Sai em fade.",
      duracaoSeg: [2.5, 3.5],
      posicao916: "Inferior esquerdo, 68% a 72% da altura.",
      posicao169: "Inferior esquerdo, 82% a 86% da altura.",
      quando: "Primeira vez que cada voz aparece no rosto.",
    },
    {
      id: "numero-de-marca",
      nome: "Número de marca",
      forma: "Número grande com uma palavra de contexto ao lado (\"40 anos\", \"1.200 pessoas\"), em peso forte. Unidade em fino.",
      animacao: "O número conta até o valor em 1.200 ms desacelerando, na batida. Sai por corte.",
      duracaoSeg: [2, 3.5],
      posicao916: "Centro, 40% a 58% da altura.",
      posicao169: "Terço vazio do plano.",
      quando: "Ano de fundação, tamanho da equipe, clientes atendidos.",
    },
    {
      id: "texto-janela",
      nome: "Texto que vira janela",
      forma: "Palavra grande em peso forte que funciona como máscara: dentro dela, o próximo plano; fora, preto. Ocupa 80% da largura.",
      animacao: "A palavra cresce de 100% para 1.200% em 900 ms e o plano de dentro toma a tela. Curva que acelera no fim.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Centro.",
      posicao169: "Centro.",
      quando: "Passagem de um movimento para o outro.",
    },
    {
      id: "assinatura-logo",
      nome: "Assinatura com logo",
      forma: "Logo do cliente no centro sobre o último plano desfocado e escurecido, com a frase-verdade embaixo. Desfoque de 20 px e véu de 40%.",
      animacao: "O fundo desfoca em 800 ms, o logo entra em fade com escala de 95% para 100% em 700 ms e a frase 400 ms depois. Fica parado 5 s.",
      duracaoSeg: [5, 7],
      posicao916: "Logo entre 40% e 52% da altura, frase a 56%.",
      posicao169: "Logo no centro, frase a 60% da altura.",
      quando: "Fim, uma vez.",
    },
  ],
  insercoesGeradas: {
    quando: "Média: completa o que a empresa não filmou, 3 a 6 por minuto, sempre planos de cinema curtos com movimento.",
    tipos: [
      "mãos trabalhando no ofício do setor em câmera lenta, luz de janela",
      "o lugar do setor (galpão, escritório, campo, loja) ao amanhecer, travelling lento",
      "pessoas de costas ou em silhueta caminhando juntas contra a luz",
      "detalhe de produto ou ferramenta com profundidade curta",
    ],
    nunca: "frase, número ou logo desenhados por modelo, rosto inventado no lugar de funcionário real, cena de banco de imagem genérica com aperto de mão.",
  },
  som: {
    trilha: "Inspiradora e crescente (piano, cordas e percussão que entra no segundo movimento), 80 a 110 batidas por minuto, com pico no terceiro movimento e resolução no logo.",
    efeitos: ["som real do gesto em câmera lenta (ferramenta, papel, máquina)", "respiro de silêncio de 1 s antes do pico", "grave suave no logo"],
    mixagem: "Vozes a -16 LUFS; trilha a -20 dB sob as vozes e a -12 dB nos trechos só de imagem; som do gesto a -18 dB.",
  },
  nunca: [
    "Texto corrido, lista de serviços ou organograma na tela.",
    "Aperto de mão de banco de imagem, sorriso posado para a câmera.",
    "Corte fora da batida nos trechos musicais.",
    "Câmera lenta em todos os planos.",
    "Logo no começo ou no meio do filme.",
    "Punch, flash, legenda palavra a palavra.",
  ],
  momentos: [
    {
      quando: "A voz enumera 7 passos do jeito de trabalhar",
      edicao:
        "Vira montagem: cada passo é um plano de 2 s cortado na batida, com a palavra do passo pequena no terço vazio; o passo 1 ganha câmera lenta e a frase de valor completa; os outros passam em ritmo crescente; no 7, a trilha respira e volta a voz no rosto.",
    },
    { quando: "Os primeiros segundos", edicao: "Detalhe em câmera lenta com som real, a voz faz a provocação, trilha entra baixa, palavra única sobre o plano mais bonito." },
    { quando: "Alguém da equipe conta por que trabalha ali", edicao: "Rosto 4 s com tarja de voz, a voz continua sobre as mãos dela trabalhando e o lugar; volta ao rosto na frase de emoção." },
    { quando: "A voz diz um número (\"40 anos\")", edicao: "Número de marca contando na batida sobre um plano largo do lugar." },
    { quando: "A voz diz três valores", edicao: "Tríade de valores, uma palavra por batida, três planos diferentes." },
    { quando: "Passagem para o porquê", edicao: "Texto que vira janela com a palavra do movimento revelando o próximo plano." },
    { quando: "O fim", edicao: "Pico da trilha com a equipe ou o cliente, frase-verdade, assinatura com logo sobre a imagem desfocada por 5 s." },
  ],
  quadrosDeReferencia: [
    "Mãos de uma pessoa trabalhando em câmera lenta sob luz de janela quente, profundidade de campo curta, e no centro uma frase curta em letra fina com uma palavra em peso forte na cor da marca.",
    "Plano largo de uma equipe de costas caminhando contra a luz do amanhecer num galpão ou escritório, sem texto.",
    "Último plano desfocado e escurecido com o logo do cliente no centro e uma frase curta embaixo em letra fina.",
  ],
  fontes: [
    "https://www.dirxecp.com/post/how-cinematic-storytelling-makes-brand-videos-actually-work (uma verdade da marca, segurar o plano, a música cresce no momento certo)",
    "https://kweenmedia.in/how-to-edit-brand-films-that-stand-out-and-stay-memorable/ (corte na ação, gradação que unifica o material, depoimento e imagem de apoio intercalados)",
    "https://www.indievisual.in/blog/how-slow-motion-and-time-lapse-videos-transform-your-brand-films (câmera lenta só nos gestos de valor, com som sincronizado)",
    "https://brand.adventisthealth.org/files/AH-Video-Brand-Standards.pdf (guia de vídeo de marca, lido pelo resumo da busca: logo no fim com a imagem desfocada por baixo e no mínimo 5 s parado)",
  ],
};

export const TEXTO_INSTITUCIONAL = textoParaOPrompt(INSTITUCIONAL);
