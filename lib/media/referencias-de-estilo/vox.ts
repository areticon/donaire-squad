import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * EXPLICATIVO EDITORIAL, LINGUAGEM DA VOX (03/10/2026).
 *
 * Base: a bíblia lib/media/biblias/vox.ts (o único estilo que o Bruno aprovou;
 * corte de 48 s com 46 elementos por minuto e 20 recortes) e as análises de
 * edição da Vox: colagem de papel com meio-tom, marca-texto que corre sob a
 * frase no tempo da narração, gráficos animados a 12 quadros por segundo dentro
 * da linha de 24 (o "engasgo" proposital), passagem por câmera 3D com desfoque,
 * mapa com borda pincelada, textura que respira por baixo de tudo.
 */
export const VOX: ReferenciaDeEstilo = {
  id: "vox",
  nome: "Explicativo editorial",
  inspiracao: "Vox (vídeos explicativos)",
  essencia:
    "Explicar com colagem editorial: papel claro com grão, gravuras em preto e branco recortadas, marca-texto na cor da marca correndo sob a frase-chave no instante em que é dita, títulos condensados, gráficos simples que se desenham. Cada coisa na tela responde ao que o narrador acabou de dizer; nada é enfeite. O ritmo é o da narração, sem pressa, mas o quadro nunca para: algo novo entra a cada 2 s e o mural inteiro deriva devagar. Os gráficos andam a 12 quadros por segundo: o engasgo artesanal de papel animado à mão.",
  estrutura: {
    abre:
      "Com a PERGUNTA que o vídeo responde, dita pela pessoa, sobre uma colagem que já mostra o que está em jogo (2 a 3 recortes caindo, um número marcado). Em seguida dois ou três momentos curtos do próprio vídeo e o título do assunto em letras condensadas sobre papel. Até 12 s, passagem por folha de papel.",
    avanca:
      "Por blocos de argumento: cada bloco abre com um título-capítulo em papel, desenvolve com a pessoa no canto e a colagem grande ilustrando cada substantivo dito, prova com um documento ampliado com marca-texto ou um gráfico, e fecha com a frase-síntese marcada. Mapa quando a fala tem lugar; linha do tempo quando tem data.",
    fecha:
      "A resposta da pergunta inicial em marca-texto sobre papel, um último gráfico ou documento que amarra o argumento e a pessoa em plano cheio dizendo a chamada. Fusão em folha de papel para o fim.",
  },
  ritmo: {
    cenaSeg: [4, 7],
    cortesPorMinuto: [12, 20],
    zoom:
      "Aproximação lenta (100% a 106% em 5 s) sobre a colagem nas frases importantes; afastamento para abrir assunto; punch de 112% só na palavra mais forte, 2 a 6 por minuto. Entre blocos, a câmera 3D atravessa a colagem com desfoque de movimento.",
    observacoes:
      "Algo novo a cada 1,5 a 3 s: recorte caindo, marca-texto, número, seta. Gráficos a 12 quadros por segundo; a câmera e o vídeo a 24 ou 30. Cada recorte entra na SUA palavra, nunca dois na mesma.",
  },
  tipografia: {
    familias: [
      { papel: "título de bloco e rótulo", familia: "Oswald", pesos: "600 e 700, caixa alta", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "texto corrido, tarja e legenda", familia: "Libre Franklin", pesos: "600 e 800", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "citação de documento, manchete recortada", familia: "PT Serif", pesos: "400 e 700", origem: "google-fonts e local" },
    ],
    hierarquia:
      "Título de bloco a 7% a 9% da altura em condensada caixa alta, escuro sobre papel. Frase-chave a 4,5% a 5,5%, com o marca-texto atrás. Número a 14% a 18% na cor de destaque, rótulo a 2,2% em caixa alta espaçada (+8%). Legenda a 3,8% em tira de papel.",
    regras: [
      "Texto escuro (quase preto) sobre papel claro; a cor da marca só no marca-texto, nas formas e na fita.",
      "Até 8 palavras por frase na tela; texto só com palavra dita, nunca contradizendo a fala.",
      "Rótulo pequeno sempre em caixa alta espaçada; manchete de documento em serifa.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "papel", hex: "#F2EDE4" },
      { papel: "papel kraft", hex: "#D9C7A7" },
      { papel: "tinta", hex: "#1A1A1A" },
      { papel: "meio-tom e sombra", hex: "#6B6B6B" },
      { papel: "marca-texto (destaque)", hex: "#FFD84D" },
      { papel: "segunda cor de dado", hex: "#3E6FB0" },
      { papel: "borda do recorte", hex: "#FFFFFF" },
    ],
    marca:
      "O amarelo do marca-texto vira a cor de destaque da marca (clareada a 70% se for escura, para o texto preto ler por cima). Papel e tinta não mudam. A segunda cor de dado é o escuro da marca. Nunca mais de uma cor de destaque na mesma cena.",
  },
  elementos: [
    {
      id: "marca-texto",
      nome: "Marca-texto na frase",
      forma:
        "Faixa de cor da marca atrás da frase-chave, com bordas levemente irregulares de marcador. Altura de 70% do corpo da letra, deslocada 10% para baixo, opacidade 85%, multiplicando sobre o papel.",
      animacao:
        "Corre da esquerda para a direita em 400 a 600 ms. No ritmo das sílabas da frase dita; em frase de duas linhas, a segunda começa quando a primeira termina; sai junto com o texto.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 30% a 55% da altura. Largura de 6% a 88%; nunca sob o rosto quando a pessoa está cheia.",
      posicao169: "Terço central ou o lado livre da colagem, 25% a 70% da altura.",
      quando: "A frase-chave do trecho, a definição, o dado que a pessoa enfatiza.",
    },
    {
      id: "recorte-caindo",
      nome: "Recorte de gravura",
      forma:
        "Gravura ou foto em preto e branco recortada com borda branca. Meio-tom, borda de 6 px, sombra curta 8 px a 40% de opacidade; leve rotação de -6 a 6 graus.",
      animacao:
        "Cai de 115% para 100% em 250 ms. Assenta a 12 quadros por segundo e um pedaço de fita estica sobre a borda 100 ms depois; na saída, é empurrado para fora pelo próximo.",
      duracaoSeg: [2, 5],
      posicao916: "Colagem de 15% a 50% da altura. Acima da pessoa no canto; até 3 recortes sobrepostos.",
      posicao169: "Metade livre ao lado da pessoa, 10% a 85% da altura.",
      quando: "Cada substantivo concreto dito (o objeto, o lugar, a pessoa histórica).",
    },
    {
      id: "documento-ampliado",
      nome: "Documento ampliado",
      forma:
        "Folha inclinada com um trecho ampliado numa janela e marca-texto na frase. Papel levemente amarelado; texto do documento em serifa cinza, só o trecho dito legível.",
      animacao:
        "A folha assenta em 400 ms e a câmera aproxima o trecho em 800 ms. Desliza 60 px; o marca-texto corre depois; sai por empurrão lateral.",
      duracaoSeg: [3, 6],
      posicao916: "Folha de 18% a 62% da altura. Largura de 6% a 88%.",
      posicao169: "Centro, 12% a 88% da altura. A pessoa sai ou fica em janela à direita.",
      quando: "A pessoa cita lei, estudo, notícia, contrato ou relatório.",
    },
    {
      id: "grafico-simples",
      nome: "Gráfico de papel",
      forma:
        "Barras ou linha chapadas, uma série na cor da marca e a outra em cinza. Eixos em traço de tinta de 3 px; rótulos em caixa alta pequena; o valor dito em número grande ao lado.",
      animacao:
        "Eixos em 400 ms, barras em cascata de 120 ms. A linha se desenha em 900 ms, tudo a 12 quadros por segundo; o valor conta junto.",
      duracaoSeg: [3, 6],
      posicao916: "Faixa de 16% a 50% da altura, pessoa no canto inferior.",
      posicao169: "Dois terços da tela, 15% a 85% da altura.",
      quando: "Comparação, evolução no tempo, proporção dita com números.",
    },
    {
      id: "mapa-pincelado",
      nome: "Mapa com borda pincelada",
      forma:
        "Mapa chapado em tons de papel com a região dita contornada por pincelada da cor da marca. Rótulo em caixa alta; pincel de 8 a 12 px com borda irregular; sem nomes de rua.",
      animacao:
        "Aproximação em 1.000 ms e pincelada em 600 ms. O rótulo cai como recorte.",
      duracaoSeg: [3, 6],
      posicao916: "Mapa de 13% a 60% da altura, tela cheia na largura.",
      posicao169: "Tela cheia, rótulos dentro da margem de 5%.",
      quando: "País, cidade, região, rota ou expansão dita.",
    },
    {
      id: "titulo-capitulo",
      nome: "Título-capítulo em papel",
      forma:
        "Tira de papel rasgado com o título do bloco em condensada caixa alta. Número de capítulo pequeno acima; borda rasgada nos dois lados, sombra curta.",
      animacao: "A tira desliza para dentro em 300 ms. O texto bate em 2 quadros; sai com a folha de papel que passa por cima.",
      duracaoSeg: [1.5, 3],
      posicao916: "Faixa de 35% a 50% da altura, centro.",
      posicao169: "Centro, 40% a 60% da altura.",
      quando: "Troca de bloco de argumento.",
    },
    {
      id: "seta-circulo",
      nome: "Seta e círculo à mão",
      forma:
        "Círculo e seta em traço de marcador da cor da marca, irregulares como feitos à mão. Traço de 6 px, ponta aberta.",
      animacao: "Desenham-se por traço em 350 ms, a 12 quadros por segundo. Ficam até a troca de cena.",
      duracaoSeg: [1.5, 4],
      posicao916: "Sobre o detalhe apontado, dentro da área segura.",
      posicao169: "Sobre o detalhe apontado.",
      quando: "\"Olha aqui\", \"esse número\", \"repare que\".",
    },
    {
      id: "linha-do-tempo",
      nome: "Linha do tempo rolando",
      forma:
        "Régua horizontal de tinta com anos em caixa alta e um recorte pequeno pendurado em cada marco. Marco atual com marca-texto.",
      animacao: "Rola até o ano dito em 700 ms. Da direita para a esquerda, com desaceleração; o recorte do marco cai.",
      duracaoSeg: [3, 6],
      posicao916: "Faixa de 55% a 72% da altura.",
      posicao169: "Terço inferior, 62% a 82% da altura.",
      quando: "Datas e sequência histórica.",
    },
  ],
  insercoesGeradas: {
    quando: "Muitas, pequenas e de papel: 6 a 12 recortes por minuto, mais 1 a 2 cenas de cinema curtas por bloco para o substantivo mais concreto.",
    tipos: [
      "gravura de enciclopédia ou foto antiga em preto e branco do objeto dito, isolada para recortar",
      "textura de papel, kraft, papel milimetrado ou jornal sem texto legível para o fundo",
      "cena de cinema de 35 mm, luz natural, uma ação simples ligada à palavra concreta, 2 a 4 s",
    ],
    nunca: "texto ou número desenhado pelo modelo, render 3D, foto de produto brilhante, fundo escuro.",
  },
  som: {
    trilha: "Eletrônica discreta e pulsante, 88 a 112 batidas por minuto, com sintetizador quente; muda de tom a cada bloco.",
    efeitos: ["papel passando na troca de bloco", "papel pousando no recorte", "risco de marcador no marca-texto", "batida seca no carimbo ou no título", "whoosh grave na câmera 3D"],
    mixagem: "Voz a -14 LUFS; trilha a -26 dB sob a fala e -18 dB nos respiros de colagem; efeitos de papel baixos e secos.",
  },
  nunca: [
    "Fundo escuro como base da colagem.",
    "Mais de uma cor de destaque, ou fotos coloridas saturadas no recorte.",
    "Elemento sem palavra dita que o motive.",
    "Legenda palavra a palavra amarela gigante (isso é Hormozi).",
    "Render 3D, brilho, partícula ou interface futurista.",
    "Cena de 4 s ou mais sem nada novo entrando.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 4 razões",
      edicao:
        "Folha com as 4 razões em tiras rasgadas; 3 em cinza claro, a 1 com marca-texto; tira-título RAZÃO 1; volta para a pessoa no canto com recortes caindo a cada substantivo; na troca, a folha volta com a 1 riscada e a 2 marcada.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "A pergunta dita sobre a pessoa recortada no papel, 2 recortes caindo do que está em jogo; dois momentos curtos do vídeo; título do assunto em tira rasgada; folha de papel.",
    },
    {
      quando: "Ela cita uma lei ou um estudo",
      edicao: "Documento inclinado, câmera no trecho, marca-texto correndo enquanto ela lê; seta à mão no número.",
    },
    {
      quando: "Ela compara dois números (\"o aluguel subiu 12%, o salário 4%\")",
      edicao: "Gráfico de papel com duas barras, a da marca crescendo primeiro, os valores contando; círculo à mão na diferença.",
    },
    {
      quando: "Ela fala de uma cidade ou região",
      edicao: "Mapa de papel, aproximação até a região, pincelada da cor da marca contornando, rótulo caindo como recorte.",
    },
    {
      quando: "Ela conta a origem histórica de algo",
      edicao: "Linha do tempo rolando até o ano dito, gravura do marco caindo, aproximação lenta; corte para a pessoa no canto.",
    },
    {
      quando: "A frase-síntese do bloco",
      edicao: "Frase escura sobre papel, marca-texto no tempo da fala, aproximação lenta; papel passando para o próximo bloco.",
    },
  ],
  quadrosDeReferencia: [
    "Fundo de papel bege com grão; à direita, três gravuras em preto e branco recortadas com borda branca e fita, levemente tortas; à esquerda, a frase-chave em sem serifa preta bold com uma faixa de marca-texto amarela atrás de três palavras; a pessoa recortada pequena no canto inferior.",
    "Uma página de documento inclinada ocupando a tela, texto em serifa cinza ilegível exceto uma linha ampliada numa janela retangular, com marca-texto na cor de destaque sob ela e um círculo de marcador em volta do número.",
    "Mapa chapado em tons de papel e cinza, uma região contornada por pincelada grossa da cor de destaque e um rótulo em caixa alta condensada preta numa tira de papel, com uma gravura pequena colada ao lado.",
  ],
  fontes: [
    "lib/media/biblias/vox.ts (bíblia aprovada, corte cmuon0yxo de 30/09) e docs/overlays/BIBLIA-DE-ESTILO.md",
    "https://earnedits.com/how-vox-style-edits-are-built/ (12 quadros por segundo dentro de 24, câmera 3D com desfoque, marca-texto no tempo da narração, mapa com pincelada)",
    "https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/ (texturas em camadas que respiram, tarja com máscara rasgada, aberração cromática nas bordas)",
    "https://www.flatpackfx.com/blog/create-vox-style-collage-animation-adobe-after-effects (colagem de papel e meio-tom)",
    "https://fontsinuse.com/uses/6828/vox-website (tipografia da casa: Balto, Harriet; aqui substituídas por famílias abertas)",
  ],
};

export const TEXTO_VOX = textoParaOPrompt(VOX);
