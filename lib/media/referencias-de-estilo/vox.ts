import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * EXPLICATIVO EDITORIAL, LINGUAGEM DA VOX (03/10/2026; refeita em 04/10).
 *
 * Base: a bíblia lib/media/biblias/vox.ts e as análises de edição da Vox. Em
 * 04/10 o dono mandou o QUADRO DE TREINO docs/overlays/referencias/vox/
 * bruno-0410/vox-01.png, e o juiz tinha dado 4,9 ao Vox ("cabeça falando com
 * cartões de texto, parece slide"). O que o quadro ensina e o que faltava:
 *   - PROFUNDIDADE: papel envelhecido no fundo, manuscrito, mapa recortado,
 *     fotos recortadas na frente, cada camada com sombra e parallax;
 *   - MISTURA DE RECORTES COM FOTOS DE ALTA RESOLUÇÃO: fotos de arquivo em P&B
 *     nítidas (prédio com chaminé, homem de terno), recortadas com borda de
 *     papel, geradas na Higgsfield e recortadas no BiRefNet
 *     (lib/media/editor-sob-medida/recortes-vox.ts);
 *   - ELEMENTOS POLÊMICOS: a tarja AMARELA de censura nos olhos (estátua ou
 *     figura anônima fictícia, nunca pessoa real) e o carimbo vermelho;
 *   - O JORNAL e o papel rasgado: a manchete serifada no recorte de jornal;
 *   - o título serifado preto na faixa amarela de marca-texto e o círculo
 *     vermelho sobre o lugar no mapa.
 * Cada elemento é uma peça do editor sob medida: o `id` é o nome da peça
 * (worker/remotion/src/sob-medida/pecas/vox.tsx).
 */
export const VOX: ReferenciaDeEstilo = {
  id: "vox",
  nome: "Explicativo editorial",
  inspiracao: "Vox (vídeos explicativos)",
  essencia:
    "Explicar com COLAGEM DE ARQUIVO em camadas, como o quadro de treino vox-01: papel envelhecido com textura e grão no fundo, um manuscrito antigo esmaecido, um MAPA ANTIGO recortado com o CÍRCULO VERMELHO no lugar dito e, na frente, FOTOS DE ARQUIVO em preto e branco de ALTA RESOLUÇÃO (prédio com chaminé, figura anônima de terno, estátua, documento) recortadas com borda de papel e sombra, em camadas que se movem em velocidades diferentes (parallax). O título é serifado preto, pesado, numa faixa AMARELA de marca-texto que corre. Na polêmica, a TARJA AMARELA de censura bate sobre os olhos da estátua; no que alguém disse, o recorte de JORNAL rasgado com a manchete. Cada coisa na tela responde ao que o narrador acabou de dizer; algo novo entra a cada 2 s; o papel anima a 12 quadros por segundo (o engasgo artesanal) e a câmera deriva contínua por cima. Cartão chapado com texto sobre a pessoa não é Vox.",
  estrutura: {
    abre:
      "Com a PERGUNTA ou a tensão do vídeo dita pela pessoa e, no segundo 0, uma colagem que já mostra o que está em jogo (2 a 3 fotos de arquivo caindo, o título no marca-texto amarelo), ou a tarja de censura se o assunto é polêmico. Depois o rosto, com o marca-texto na frase-chave.",
    avanca:
      "Por blocos de argumento: cada bloco abre com uma colagem do contexto (época, lugar, personagem), desenvolve com a pessoa e o marca-texto nas frases-chave, prova com o jornal (o que foi dito), o mapa antigo (o lugar) ou um gráfico de papel, e põe a tarja de censura onde a fala toca na polêmica. Entre duas telas de papel o rosto volta.",
    fecha:
      "A resposta da pergunta inicial no marca-texto sobre a pessoa, um último recorte que amarra o argumento, o carimbo no veredito e a pessoa em plano cheio dizendo a chamada.",
  },
  ritmo: {
    cenaSeg: [3, 6],
    cortesPorMinuto: [14, 22],
    zoom:
      "Dentro da colagem a câmera deriva e aproxima 6% devagar, com parallax entre as camadas; sobre a pessoa, aproximação lenta e soco de 112% só na palavra mais forte.",
    observacoes:
      "Algo novo a cada 1,5 a 3 s: recorte caindo, marca-texto, círculo, tarja, carimbo. As animações de papel a 12 quadros por segundo; a câmera e o vídeo a 24 ou 30. Cada recorte entra na SUA palavra, nunca dois na mesma.",
  },
  tipografia: {
    familias: [
      { papel: "título no marca-texto e manchete", familia: "Playfair Display", pesos: "800 e 900, caixa alta no marca-texto", origem: "google-fonts e local" },
      { papel: "carimbo e rótulo", familia: "Oswald", pesos: "600 e 700, caixa alta", origem: "google-fonts", alternativa: "Anton local" },
      { papel: "texto corrido e legenda", familia: "Geist", pesos: "600", origem: "local" },
    ],
    hierarquia:
      "Título no marca-texto a 9% a 12% da altura no 16:9 e 6% a 7% no 9:16, serifa preta pesada sobre o amarelo. Manchete do jornal a 8% a 10%. Rótulo do lugar em tira de papel a 3,5%. Carimbo a 6%.",
    regras: [
      "Texto preto sobre amarelo ou sobre papel; nunca texto claro sobre caixa escura.",
      "Até 6 palavras no marca-texto; texto só com palavra dita, nunca contradizendo a fala.",
      "Manchete e título sempre em serifa; carimbo em condensada.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "papel envelhecido", hex: "#D3BF97" },
      { papel: "tinta", hex: "#16130E" },
      { papel: "marca-texto e tarja", hex: "#FFE11F" },
      { papel: "círculo, fio e carimbo", hex: "#B8231B" },
      { papel: "foto de arquivo", hex: "#6B6B6B" },
      { papel: "borda do recorte", hex: "#F2EAD8" },
    ],
    marca:
      "O amarelo do marca-texto e da tarja e o vermelho do círculo são a assinatura do estilo e não mudam; a cor da marca entra só nas peças de dado (gráfico) e no fecho. Papel e tinta não mudam.",
  },
  elementos: [
    {
      id: "colagem",
      nome: "Colagem de arquivo em camadas",
      forma:
        "Papel envelhecido com textura, manuscrito esmaecido atrás, mapa antigo recortado com borda rasgada e círculo vermelho, e 1 a 3 fotos de arquivo P&B de alta resolução recortadas com borda de papel clara e sombra de verdade, sobrepostas em profundidade; o título serifado preto na faixa amarela; o fio vermelho com alfinetes ligando dois recortes; o carimbo.",
      animacao:
        "A folha varre a tela com a borda rasgada; cada recorte CAI grande e torto e assenta a 12 quadros por segundo na palavra dele; o marca-texto corre sob o título; o círculo se desenha no mapa; a câmera deriva e cada camada anda na sua profundidade (parallax).",
      duracaoSeg: [3.5, 8],
      posicao916: "Mapa no alto (0% a 32%), título no marca-texto a 33%, a foto maior embaixo à direita (40% a 100%), as menores à esquerda.",
      posicao169: "Mapa no canto de cima à esquerda, título no meio à esquerda, a foto maior na altura toda à direita, o prédio no centro embaixo.",
      quando: "FATO HISTÓRICO, ORIGEM, PERSONAGEM, ÉPOCA, LUGAR com contexto. A peça-mãe: 1 a 2 por corte, 1 a cada 40 a 60 s no longo. Nunca sem foto (colagem só de texto é slide).",
    },
    {
      id: "jornal",
      nome: "Recorte de jornal rasgado",
      forma:
        "Folha de jornal com as bordas rasgadas e a fibra branca aparecendo, fios do cabeçalho, manchete serifada preta pesada, colunas de texto miúdo ilegível e a foto de arquivo saltando do papel para a frente, com sombra.",
      animacao: "A folha entra varrendo e a câmera se aproxima devagar; no evento o marca-texto amarelo corre sob o destaque da manchete; a foto cai por cima.",
      duracaoSeg: [3, 7],
      posicao916: "Jornal de 7% a 67% da altura, a foto recortada embaixo à direita.",
      posicao169: "Jornal à esquerda (60% da largura), a foto recortada à direita na altura toda.",
      quando: "Notícia, acontecimento, declaração, reclamação, o que alguém disse: a frase dita vira manchete. Só lugar ou data DITOS no cabeçalho; nunca nome de jornal real.",
    },
    {
      id: "mapa-antigo",
      nome: "Mapa antigo com círculo vermelho",
      forma: "Mapa antigo em sépia com borda rasgada ocupando a tela, o círculo vermelho translúcido com o anel à mão sobre o lugar, o nome numa tira de papel com fita.",
      animacao: "A câmera aproxima o ponto durante a peça; no evento o círculo se desenha (12 quadros por segundo) e a tira cai; a foto do lugar pode cair ao lado como cópia fotográfica.",
      duracaoSeg: [3, 7],
      posicao916: "Mapa de 5% a 61% da altura, título no marca-texto a 60%, a foto embaixo.",
      posicao169: "Mapa em 80% da tela, a foto à direita.",
      quando: "Lugar dito: cidade, região, país, de onde para onde, onde aconteceu.",
    },
    {
      id: "cronologia",
      nome: "Linha do tempo em tira de papel",
      forma: "Tira de papel rasgada atravessando a tela com a régua de tinta; os anos em serifa preta pesada acima dela, o ano dito com o marcador amarelo; etiquetas de papel com o que aconteceu; a foto de arquivo de cada marco pendurada por fita.",
      animacao: "A câmera anda pela tira até o marco dito (0,7 s, suave); o marcador corre no ano a 12 quadros por segundo; a foto do marco cai e assenta.",
      duracaoSeg: [3.5, 8],
      posicao916: "Tira a 56% da altura, anos acima, etiquetas abaixo, título no alto.",
      posicao169: "Tira a 60% da altura, três marcos visíveis por vez.",
      quando: "Datas, épocas, a ordem dos acontecimentos, uma história contada com anos.",
    },
    {
      id: "censura",
      nome: "Tarja de censura na estátua",
      forma: "Estátua genérica (ou figura anônima de época, fictícia) grande, em P&B de alta resolução, recortada sobre o papel com manuscrito; a tarja AMARELA chapada sobre os olhos; o carimbo vermelho com a palavra dita.",
      animacao: "A estátua cai e assenta; no evento a tarja BATE (entra grande e encolhe com mola) e o quadro treme 0,3 s; o carimbo bate meio segundo depois.",
      duracaoSeg: [2.5, 6],
      posicao916: "Estátua embaixo no centro (34% a 100%), título no alto, carimbo a 27%.",
      posicao169: "Estátua à direita na altura toda, título e carimbo à esquerda.",
      quando: "Polêmica, tabu, o que ninguém fala, o proibido, a crítica, a revelação. Sempre onde couber (1 por corte). Tarja SÓ em estátua ou figura anônima fictícia, nunca em pessoa real.",
    },
    {
      id: "marca-texto",
      nome: "Marca-texto amarelo",
      forma: "Texto serifado preto, pesado, em caixa alta, numa faixa amarela chapada que acompanha cada linha, levemente inclinada, com sombra curta.",
      animacao: "A faixa e o texto correm juntos da esquerda para a direita em 0,4 s, a 12 quadros por segundo.",
      duracaoSeg: [1.5, 4],
      posicao916: "No alto (15%) ou no centro (36%), largura de 7% a 93%.",
      posicao169: "No alto à esquerda, até metade da largura.",
      quando: "A frase-chave, o número, a definição, sobre a pessoa; o ritmo entre as telas de papel.",
    },
    {
      id: "carimbo",
      nome: "Carimbo vermelho",
      forma: "Palavra condensada em caixa alta, vermelha, borda dupla, tinta gasta e inclinada.",
      animacao: "Entra grande e bate no papel em 0,15 s; o quadro treme.",
      duracaoSeg: [1.2, 3],
      posicao916: "No alto, do lado vazio.",
      posicao169: "No alto, do lado vazio.",
      quando: "A palavra de veredito dita com força: proibido, errado, aprovado, mentira.",
    },
    {
      id: "grafico-linha",
      nome: "Gráfico de papel",
      forma: "Linha ou barras chapadas, rótulos pequenos, o valor dito grande.",
      animacao: "A linha se desenha a 12 quadros por segundo; o valor conta junto.",
      duracaoSeg: [3, 6],
      posicao916: "Faixa de 16% a 50% da altura.",
      posicao169: "Dois terços da tela.",
      quando: "Evolução ou comparação com números DITOS.",
    },
  ],
  insercoesGeradas: {
    quando: "As FOTOS DE ARQUIVO das peças de papel (3 a 8 por corte, geradas pelo código a partir da descrição em inglês do editor), mais 1 a 2 cenas de cinema curtas por bloco para o substantivo mais concreto.",
    tipos: [
      "foto de arquivo em preto e branco de ALTA resolução, nítida, de época (1900 a 1950): prédio, objeto, documento, estátua genérica, figura anônima fictícia, isolada para recortar",
      "cena de cinema de 35 mm, luz natural, uma ação simples ligada à palavra concreta, 2 a 4 s",
    ],
    nunca: "pessoa real ou famosa, estátua de pessoa real, nome próprio de gente na descrição, foto colorida saturada, render 3D, texto legível desenhado pelo modelo.",
  },
  som: {
    trilha: "Eletrônica discreta e pulsante, 88 a 112 batidas por minuto, com sintetizador quente; muda de tom a cada bloco.",
    efeitos: ["papel passando na troca de bloco", "papel pousando no recorte", "risco de marcador no marca-texto", "batida seca na tarja e no carimbo", "whoosh grave na câmera"],
    mixagem: "Voz a -14 LUFS; trilha a -26 dB sob a fala e -18 dB nos respiros de colagem; efeitos de papel baixos e secos.",
  },
  nunca: [
    "Cartão chapado com texto em cima da pessoa (o juiz reprova como slide): no Vox o texto vive no marca-texto ou no papel.",
    "Colagem sem foto de arquivo: papel e título sozinhos são slide.",
    "Tarja de censura em pessoa real ou identificável; foto ou estátua de pessoa real; figura histórica com nome.",
    "Foto em baixa resolução, borrada ou colorida saturada; recorte sem borda de papel e sem sombra (parece colado).",
    "Fundo escuro como base da colagem; outro amarelo; vermelho fora do círculo, do fio e do carimbo.",
    "Elemento sem palavra dita que o motive; manchete com nome de jornal real ou fato que a fala não disse.",
    "Duas telas de papel seguidas sem o rosto voltar; 4 s ou mais sem nada novo entrando.",
  ],
  momentos: [
    {
      quando: "Os primeiros segundos",
      edicao: "Colagem: o assunto em 2 ou 3 fotos de arquivo caindo, o título com as palavras do falante no marca-texto amarelo; ou a censura, se o trecho abre com polêmica.",
    },
    {
      quando: "Ele conta um fato histórico, uma origem, uma história bíblica",
      edicao: "Colagem com as fotos da época (a casa, o objeto, a estátua genérica), o mapa com o círculo vermelho no lugar dito, o fio vermelho ligando os dois recortes que a fala liga.",
    },
    {
      quando: "Ele diz um lugar",
      edicao: "Mapa antigo rasgado, a câmera chegando no ponto, o círculo vermelho se desenhando na palavra do lugar, o nome numa tira de papel.",
    },
    {
      quando: "Alguém disse, reclamou, declarou algo",
      edicao: "Jornal rasgado com a frase como manchete, o marca-texto correndo no destaque, a foto de arquivo saltando do papel.",
    },
    {
      quando: "Ele toca numa polêmica, num tabu, numa verdade incômoda",
      edicao: "Censura: a estátua grande, a tarja amarela batendo nos olhos com tremor, o carimbo com a palavra dita.",
    },
    {
      quando: "Um número ou a frase-síntese",
      edicao: "Marca-texto amarelo sobre a pessoa com o número ou a frase em serifa preta; no veredito, o carimbo vermelho.",
    },
  ],
  quadrosDeReferencia: [
    "QUADRO DE TREINO vox-01: papel envelhecido com textura; mapa antigo recortado no canto com borda amarelada e um círculo vermelho num lugar; manuscrito antigo ao fundo; recortes de foto de arquivo P&B de alta resolução (prédio industrial com chaminé, homem de terno) em camadas com profundidade e sombra; tarja amarela sobre os olhos do homem; título serifado preto numa faixa amarela de marca-texto.",
    "Recorte de jornal rasgado inclinado com a manchete serifada preta e o marca-texto amarelo em duas palavras; colunas ilegíveis; uma foto de arquivo recortada saltando do papel com sombra.",
    "Estátua clássica em P&B recortada grande sobre papel com manuscrito, a tarja amarela de censura sobre os olhos e um carimbo vermelho.",
  ],
  fontes: [
    "docs/overlays/referencias/vox/bruno-0410/vox-01.png (quadro de treino do dono, 04/10)",
    "lib/media/biblias/vox.ts (bíblia aprovada, corte cmuon0yxo de 30/09) e docs/overlays/BIBLIA-DE-ESTILO.md",
    "https://earnedits.com/how-vox-style-edits-are-built/ (12 quadros por segundo dentro de 24, câmera 3D com desfoque, marca-texto no tempo da narração, mapa com pincelada)",
    "https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/ (texturas em camadas que respiram, tarja com máscara rasgada)",
    "https://www.flatpackfx.com/blog/create-vox-style-collage-animation-adobe-after-effects (colagem de papel e meio-tom)",
  ],
};

export const TEXTO_VOX = textoParaOPrompt(VOX);
