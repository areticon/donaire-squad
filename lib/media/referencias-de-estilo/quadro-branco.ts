import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * QUADRO BRANCO, EXPLICAÇÃO DESENHADA (03/10/2026).
 *
 * O que a pesquisa deu: a linguagem nasce do "scribing" do RSA Animate
 * (Andrew Park, Cognitive Media): uma palestra traduzida em desenho de
 * marcador preto num painel branco enorme, com a câmera passeando de um
 * desenho ao outro e recuando no fim para mostrar o painel inteiro. Os
 * manuais de whiteboard (VideoScribe, B2W) acrescentam as medidas: um
 * conceito por vez, o desenho termina junto com a frase, no máximo 2 s de
 * traço por elemento, 0,5 s de transição, quase só preto e UMA cor de
 * destaque. Aqui a gravação do cliente entra como recorte colado no quadro.
 */
export const QUADRO_BRANCO: ReferenciaDeEstilo = {
  id: "quadro-branco",
  nome: "Quadro branco",
  inspiracao: "explicações desenhadas do RSA Animate e dos vídeos de whiteboard",
  essencia:
    "Um professor pensando em voz alta diante de um painel branco enorme. Cada ideia dita vira um desenho simples de marcador preto que se faz no tempo exato da frase: ícone, palavra escrita à mão, seta ligando uma coisa à outra. Uma única cor (a da marca) grifa o que importa. A câmera não corta, ela PASSEIA pelo painel de um desenho ao próximo, e no fim recua até mostrar a fala inteira transformada num mapa visual. A pessoa aparece como recorte colado no quadro, ou em tela cheia nas frases de convicção. Calmo, claro, artesanal, com muito branco; a retenção vem de ver a ideia sendo construída.",
  estrutura: {
    abre:
      "O problema desenhado no segundo zero: ícone ou boneco de palito com ponto de interrogação e a pergunta escrita à mão em 3 a 6 palavras, traço de 1,2 s. A pessoa entra em recorte no canto com a promessa; meio segundo do painel final desfocado avisa que tudo vai virar um mapa. Sem logo nem vinheta.",
    avanca:
      "Um conceito por enquadramento: a câmera desliza até um espaço branco, o desenho se faz enquanto a frase é dita, a palavra-chave é escrita e grifada, e uma seta liga o desenho novo ao anterior. Listas viram uma coluna numerada que volta a cada passo. A cada 30 a 45 s, a pessoa volta em tela cheia por uma frase, e o quadro retorna de onde parou.",
    fecha:
      "Recuo de 3 a 4 s até o painel inteiro, com todos os desenhos e setas da fala; a frase-síntese se escreve no centro com sublinhado duplo na cor da marca; o recorte da pessoa faz a chamada. Painel parado por 1 s.",
  },
  ritmo: {
    cenaSeg: [3, 8],
    cortesPorMinuto: [6, 14],
    zoom:
      "Câmera virtual sobre o painel: deslize de 500 a 700 ms com pouso suave entre conceitos, aproximação lenta de 100% para 115% num detalhe, recuo no fim. Na gravação da pessoa, nenhum punch.",
    observacoes:
      "O ritmo vem do traço, não do corte: algo está sempre se desenhando, nenhum desenho passa de 2 s, frase e desenho terminam juntos, e há 0,5 s de desenho pronto antes de deslizar.",
  },
  tipografia: {
    familias: [
      { papel: "palavra escrita e título do quadro", familia: "Kalam", pesos: "700", origem: "google-fonts", alternativa: "Patrick Hand" },
      { papel: "rótulo e item de lista", familia: "Patrick Hand", pesos: "400", origem: "google-fonts", alternativa: "Architects Daughter" },
      { papel: "número desenhado", familia: "Kalam", pesos: "700", origem: "google-fonts", alternativa: "Liberation Sans 700" },
    ],
    hierarquia:
      "Título do quadro a 6% a 8% da altura; palavra-chave a 4% a 6%; rótulo e item a 3% a 4%; número a 10% a 14%.",
    regras: [
      "Escrita como se fala, primeira letra maiúscula; caixa alta só numa palavra de efeito.",
      "Texto sempre preto; a cor da marca vai no grifo, no sublinhado, no círculo e na seta principal.",
      "Letra a letra na ordem de escrita (40 a 60 ms por letra), nunca a palavra de uma vez.",
      "No máximo 8 palavras escritas por enquadramento, linha de base torta 1 a 2 graus.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "quadro", hex: "#FAFAF7" },
      { papel: "tinta", hex: "#1C1C1C" },
      { papel: "destaque", hex: "#1F6FEB" },
      { papel: "erro ocasional", hex: "#D62828" },
      { papel: "item apagado", hex: "#C9C9C4" },
    ],
    marca:
      "A cor principal da marca substitui o azul: grifo a 35% de opacidade, sublinhado, círculo, seta principal, check. Se ela não ler sobre branco (amarelo, verde-limão), fica só no grifo e a seta vai em preto. O branco e o preto nunca mudam; uma cor só por quadro.",
  },
  elementos: [
    {
      id: "traco-que-se-desenha",
      nome: "Desenho de traço",
      forma:
        "Ícone ou cena simples em traço preto de marcador, sem preenchimento. Traço de 6 a 8 px (no 1080 de largura), pontas arredondadas, ocupando 25% a 40% da largura: boneco de palito, prédio, moeda, funil, relógio, celular, formas que se reconhecem em 3 a 8 traços. Uma área pode ganhar hachura leve na cor da marca.",
      animacao:
        "Revelação do caminho traço a traço em 800 a 2000 ms. Cada traço acelera no começo e desacelera no fim, na ordem natural (contorno, depois detalhe). Não sai: fica no painel e a câmera vai embora.",
      duracaoSeg: [2, 8],
      posicao916:
        "Centro, 22% a 62% da altura. Quando a pessoa está em recorte embaixo, o desenho sobe para 18% a 50%; largura até 82%.",
      posicao169: "No centro do enquadramento da câmera virtual. Entre 12% e 80% da altura.",
      quando: "Cada conceito ou objeto concreto citado.",
    },
    {
      id: "palavra-escrita",
      nome: "Palavra escrita à mão",
      forma: "Uma a quatro palavras em Kalam preta junto do desenho. Linha de base levemente torta, tamanho variando 3% entre palavras.",
      animacao: "Letra a letra, 40 a 60 ms cada, junto com a sílaba. Sem fade.",
      duracaoSeg: [2, 8],
      posicao916: "Logo abaixo do desenho. Nunca abaixo de 74% da altura.",
      posicao169: "Abaixo ou à direita do desenho. Dentro da margem de 5%.",
      quando: "O nome do conceito ou a palavra repetida.",
    },
    {
      id: "grifo-marcador",
      nome: "Grifo de marca-texto",
      forma:
        "Faixa da cor da marca a 35% atrás de uma palavra. Pontas cortadas em diagonal, borda irregular de 2 px, altura de 70% do corpo da letra.",
      animacao: "Passa da esquerda para a direita em 400 ms. Desacelera no fim, no instante em que a palavra é dita de novo.",
      duracaoSeg: [2, 8],
      posicao916: "Atrás da palavra.",
      posicao169: "Atrás da palavra.",
      quando: "A palavra que carrega o quadro, uma por quadro.",
    },
    {
      id: "seta-e-circulo",
      nome: "Seta que liga e círculo",
      forma:
        "Seta curva de marcador ligando dois desenhos, ou círculo irregular que não fecha. Traço de 6 px, ponta aberta em V; a principal na cor da marca, as secundárias em preto.",
      animacao: "Desenha-se do início à ponta em 400 a 600 ms. A ponta em V entra em 2 traços rápidos no fim.",
      duracaoSeg: [1.5, 8],
      posicao916: "Entre os desenhos que liga. Dentro de 18% a 74% da altura e até 88% da largura.",
      posicao169: "Entre os desenhos que liga. A câmera pode acompanhar a ponta.",
      quando: "Causa e consequência, \"isso leva a\", \"olha este ponto\".",
    },
    {
      id: "lista-do-quadro",
      nome: "Lista numerada no quadro",
      forma:
        "Coluna escrita à mão, número circulado à esquerda e caixa de seleção à direita; item atual preto, os outros cinza. O círculo do número atual vai na cor da marca; os itens apagados parecem escrita apagada pela metade.",
      animacao:
        "Números em cascata de 150 ms, nomes já em cinza. Ao destacar, o item escurece em 200 ms e o círculo se desenha em 400 ms; ao concluir, check desenhado em 300 ms.",
      duracaoSeg: [2, 5],
      posicao916: "Coluna de 20% a 70% da altura, margem esquerda 8%.",
      posicao169: "Terço esquerdo, 15% a 85% da altura. O terço direito fica para o desenho do item.",
      quando: "A fala enumera, e a cada troca de item.",
    },
    {
      id: "pessoa-no-quadro",
      nome: "Pessoa colada no quadro",
      forma:
        "A gravação num recorte retangular com contorno de marcador preto desenhado à mão. Contorno de 5 px, cantos levemente arredondados, sombra de lápis cinza deslocada 6 px; 40% da largura no 9:16 e 28% no 16:9.",
      animacao: "O contorno se desenha em 500 ms e a imagem acende dentro em 200 ms. Sai num risco de apagador de 250 ms.",
      duracaoSeg: [3, 15],
      posicao916: "Canto inferior esquerdo, 56% a 76% da altura. Margem esquerda 6%; o desenho fica acima.",
      posicao169: "Canto inferior direito, 52% a 90% da altura. Margem direita 5%.",
      quando: "Enquanto o desenho se constrói e a pessoa fala.",
    },
    {
      id: "apagador",
      nome: "Passada de apagador",
      forma:
        "Faixa branca larga de borda irregular que limpa o quadro. Rastro de pó cinza a 15% e vestígio de 5% do desenho anterior.",
      animacao: "Varre na diagonal em 300 a 400 ms. O próximo traço começa 100 ms depois.",
      duracaoSeg: [0.3, 0.5],
      posicao916: "Tela cheia.",
      posicao169: "Tela cheia.",
      quando: "Assunto novo que não continua o anterior.",
    },
  ],
  insercoesGeradas: {
    quando: "Raras, de 0 a 2 por minuto, quando o conceito pede figura que não cabe em 8 traços; sempre como desenho de linha.",
    tipos: [
      "ilustração em traço preto contínuo sobre branco puro de um objeto ou cena do setor do cliente",
      "esboço a lápis de um personagem em pose simples, para colar no quadro",
      "produto do cliente convertido em contorno de traço",
    ],
    nunca: "texto ou número na imagem; foto colorida no meio do quadro; mão gerada desenhando; vetor chapado colorido.",
  },
  som: {
    trilha: "Acústica leve e curiosa (piano em pizzicato, ukulele, violão dedilhado), 90 a 110 batidas por minuto, baixa e constante.",
    efeitos: ["risco de marcador em cada traço", "tampa de caneta quando o desenho termina", "apagador na troca de assunto", "riscado rápido no check"],
    mixagem: "Voz a -14 LUFS; trilha a -26 dB; marcador entre -30 e -24 dB, que cala na palavra importante.",
  },
  nunca: [
    "Corte rápido, punch, zoom de impacto ou tremor.",
    "Legenda palavra a palavra em caixa alta com contorno.",
    "Duas cores de destaque, degradê ou brilho.",
    "Desenho surgindo pronto com fade.",
    "Fundo preto, lousa escura ou papel envelhecido.",
    "Desenho realista que demora enquanto a fala já mudou.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 4 passos",
      edicao:
        "A câmera recua até a coluna com os 4 números e nomes em cinza; o 1 escurece e seu círculo se desenha na cor da marca; a câmera desliza para o lado e o desenho do passo 1 se faz enquanto ela explica, com a palavra-chave grifada e o recorte dela no canto; ao trocar, volta à coluna, o 1 ganha check e o 2 escurece.",
    },
    {
      quando: "O primeiro segundo",
      edicao: "Boneco com ponto de interrogação em 1,2 s, a pergunta escrita acima, o recorte dela com a promessa, e a câmera mergulha no primeiro espaço branco.",
    },
    {
      quando: "Causa e consequência (\"sem processo, o vendedor improvisa, e o cliente desiste\")",
      edicao: "Três desenhos em linha (folha vazia, vendedor confuso, porta fechando), um por trecho da frase, ligados por setas; a última seta e o grifo de \"desiste\" na cor da marca.",
    },
    {
      quando: "Um número (\"perdemos 40% no segundo contato\")",
      edicao: "Círculo à mão dividido como pizza, a fatia de 40% hachurada na cor da marca, \"40%\" escrito grande ao lado com sublinhado duplo; aproximação de 110%.",
    },
    {
      quando: "Errado contra certo",
      edicao: "Linha vertical no meio do quadro; à esquerda o jeito errado com X vermelho, à direita o certo com check na cor da marca; recuo mostrando os dois.",
    },
    {
      quando: "Uma frase de convicção",
      edicao: "Passada de apagador e a pessoa em tela cheia, sem nada por cima; no corte seguinte o quadro volta onde estava.",
    },
    {
      quando: "Troca de assunto",
      edicao: "Deslize de 600 ms para um espaço branco com o título do bloco escrito e sublinhado; o desenho anterior aparece na borda.",
    },
    {
      quando: "O fecho",
      edicao: "Recuo de 3,5 s até o painel inteiro, síntese escrita no centro com sublinhado duplo, chamada no recorte, painel parado 1 s.",
    },
  ],
  quadrosDeReferencia: [
    "Fundo branco liso; no centro, um funil em traço preto com três bonecos de palito entrando, a palavra \"conversão\" escrita à mão embaixo com grifo azul translúcido e uma seta curva azul saindo para a direita.",
    "Painel branco com uma coluna de quatro itens escritos à mão e números circulados: o segundo em preto com o círculo na cor de destaque, os outros em cinza claro; no canto, o recorte retangular da pessoa com contorno de marcador.",
    "Vista recuada de um painel branco largo cheio de pequenos desenhos de traço ligados por setas, algumas palavras grifadas na mesma cor e uma frase sublinhada duas vezes no centro.",
  ],
  fontes: [
    "https://en.wikipedia.org/wiki/Andrew_Park_(animator) (RSA Animate e Cognitive Media: palestra traduzida em desenho ao vivo, \"scribing\")",
    "https://sketchnotearmy.com/blog/2025/11/18/andrew-park (o painel único que vira o mapa visual da fala)",
    "https://videoscribe.co/en/transitions-and-timings e https://blog.videoscribe.co/10-ways-to-make-a-winning-whiteboard-animation (traço de até 2 s, transição e pausa de 0,5 s, não abrir com texto lento, câmera que desliza)",
    "https://www.b2w.tv/blog/types-of-whiteboard-animation (uma ideia por vez, paleta mínima na cor da marca, caixas de destaque)",
    "https://pexo.ai/blog/what-is-whiteboard-animation-6014 (desenho e fala terminam juntos, um conceito por vez)",
  ],
};

export const TEXTO_QUADRO_BRANCO = textoParaOPrompt(QUADRO_BRANCO);
