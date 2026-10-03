import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * LOUSA DE NEGÓCIOS, LINGUAGEM DE DAN MARTELL (03/10/2026).
 *
 * Base medida: 14 quadros de "Business is Hard Until You Build These Systems"
 * e "How to Make Money Like The Top 0.001%" (docs/overlays/referencias/dan-martell,
 * 25/08), mais as análises de ritmo e gancho da equipe dele. O pedido do Bruno
 * por cima da medição: tecnologia pura e futurista, interface de painel (HUD),
 * linhas finas, gráficos, escada de passos, linha do tempo, lista com
 * desfoque, câmera em movimento e o gancho do MEIO do vídeo no começo, sempre.
 *
 * Convenção dos elementos (vale para todas as referências): a PRIMEIRA frase
 * de forma, animação e posição é a que vai para o prompt; as seguintes são o
 * detalhe para o código que desenha.
 */
export const LOUSA: ReferenciaDeEstilo = {
  id: "lousa",
  nome: "Lousa de negócios",
  inspiracao: "Dan Martell",
  essencia:
    "Aula de negócios com cara de painel futurista: fundo quase preto com curvas de nível finas, traço branco de 2 px, brilho ciano, tudo arredondado e preciso. A pessoa fala num cenário real e quente e a interface aparece AO LADO dela, no espaço vazio. Quando a fala vira estrutura, a tela vira LOUSA cheia e a pessoa vai para uma janela no canto. O espectador sempre sabe onde está: a lista volta, o passo atual brilha, os outros desfocam.",
  estrutura: {
    abre:
      "SEMPRE com o gancho do meio: os 3 a 6 s mais fortes (resultado, número, frase contrária) recortados de depois da metade e postos no segundo zero, com o painel já aparecendo; depois a promessa com número, a lousa-título com a lista inteira desfocada por 2 s e corte seco para a pessoa. Nada de logo ou \"olá\" antes de 0:15.",
    avanca:
      "Um bloco por passo: reabre a lista (atual nítido, outros desfocados), chamada PASSO N, volta para a pessoa com elementos de apoio entrando ao lado dela conforme fala, um exemplo concreto, uma frase de efeito. A cada 60 a 90 s, mini gancho com a escada mostrando quanto falta.",
    fecha:
      "Lousa final com todos os passos acesos em verde, a pessoa em janela no canto, uma frase de síntese e o card do próximo vídeo entrando pela direita. Corte seco.",
  },
  ritmo: {
    cenaSeg: [3, 7],
    cortesPorMinuto: [10, 18],
    zoom:
      "Câmera sempre viva: aproximação lenta de 100% para 108% em cada plano, alternando médio e fechado; punch de 115% só na frase de efeito. Na lousa, a câmera virtual desliza 3% a 5% em 4 s e mergulha no item.",
    observacoes:
      "6 a 10 cortes nos primeiros 20 s. Elemento novo a cada 4 a 8 s. Lousa cheia de 8 a 20 s; entre lousas, 20 a 45 s de fala com no máximo dois elementos. Todo elemento entra NA PALAVRA que o nomeia.",
  },
  tipografia: {
    familias: [
      { papel: "título e itens", familia: "Inter", pesos: "700 e 800", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
      { papel: "conceito, rótulo de eixo", familia: "Instrument Serif itálico", pesos: "400", origem: "google-fonts", alternativa: "PT Serif itálico" },
      { papel: "dados de painel, PASSO 01", familia: "JetBrains Mono", pesos: "500", origem: "google-fonts" },
    ],
    hierarquia:
      "Título branco bold a 6% a 7% da altura, palavra-chave sublinhada por barra ciano de 4 px ou trocada para ciano. Conceito em serifa itálica a 8% a 10%. Itens a 4,5%. Rótulos de painel em mono caixa alta a 2,5%.",
    regras: [
      "Brilho externo suave de 8 a 16 px em todo texto sobre o escuro.",
      "Até 6 palavras por item, 8 no título.",
      "Número de passo com zero à esquerda no chapéu (PASSO 01); nos tiles, serifa itálica.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "lousa", hex: "#0A0A0A" },
      { papel: "curvas de nível", hex: "#1C1C1C" },
      { papel: "acento", hex: "#12D4EA" },
      { papel: "brilho", hex: "#87DBE4" },
      { papel: "tile inativo", hex: "#087F7F" },
      { papel: "concluído", hex: "#1FE461" },
      { papel: "negativo", hex: "#EA0002" },
      { papel: "texto", hex: "#FFFFFF" },
    ],
    marca:
      "O ciano vira a cor de destaque da marca (clareada se não brilhar no preto); o fundo é o escuro da marca levado a quase preto. Verde e vermelho só para estado; se a marca for verde ou vermelha, o estado vira branco e cinza.",
  },
  elementos: [
    {
      id: "lousa-lista-desfoque",
      nome: "Lista de passos com desfoque",
      forma:
        "Lousa cheia com título e N tiles arredondados de borda ciano brilhante; o ativo aceso, os outros desfocados. Raio 18 px, borda 2 px, brilho 12 px, até 4 por linha. Ativo preenchido de ciano com o nome em branco bold; futuros teal escuro com número em serifa itálica cinza e desfoque de 6 a 10 px; concluídos verdes.",
      animacao:
        "Tiles em cascata (escala 0,9 para 1, 120 ms de intervalo), depois desfoque nos outros em 300 ms. O ativo cresce 6% e o brilho pulsa uma vez. Saída: a câmera virtual mergulha no tile ativo (zoom 1 para 2,4 em 500 ms) e corta para a chamada.",
      duracaoSeg: [3, 6],
      posicao916: "Título a 15% a 24% da altura, tiles em coluna de 24% a 72%. Largura de 6% a 88%.",
      posicao169: "Título a 8% a 18%, grade de 25% a 85% da altura. Quadrante inferior direito livre quando a pessoa está em janela.",
      quando: "A fala enumera passos, erros, pilares; e a cada troca de passo.",
    },
    {
      id: "chamada-passo",
      nome: "Chamada PASSO N",
      forma:
        "Cartela escura com \"PASSO 01\" em mono ciano entre duas linhas de 1 px e o nome do passo grande em branco bold. Nome a 9% da altura; quatro cantos de mira em L de 40 px emoldurando.",
      animacao: "Linhas se desenham do centro para fora em 300 ms, o rótulo digita, o nome sobe 20 px em 250 ms. Saída por corte seco.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Centro óptico, 40% a 55% da altura.",
      posicao169: "Centro, 38% a 60% da altura.",
      quando: "Logo depois da lista, no nome do passo.",
    },
    {
      id: "escada-de-passos",
      nome: "Escada de progresso",
      forma:
        "Degraus em traço branco de 2 px subindo para a direita, um por passo, com um ponto ciano brilhante no degrau atual. Número em mono em cada degrau; degraus feitos preenchidos de ciano a 20%.",
      animacao: "Degraus se desenham por traço em 600 ms e o ponto salta ao degrau atual com mola em 400 ms. Deixa um rastro de 1 px.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 58% a 76% da altura, sob o rosto.",
      posicao169: "Metade livre ao lado da pessoa, 30% a 75% da altura.",
      quando: "Mini gancho a cada 60 a 90 s, ou fala de nível, fase, evolução.",
    },
    {
      id: "linha-do-tempo",
      nome: "Linha do tempo de painel",
      forma:
        "Linha branca de 2 px com marcações, datas em mono acima e rótulos em serifa itálica abaixo; um cursor ciano marca o ponto da história. Cursor: triângulo de 12 px com linha vertical.",
      animacao: "A linha cresce da esquerda em 700 ms e o cursor desliza com desaceleração até o ponto dito. Marcações piscam uma a uma (60 ms).",
      duracaoSeg: [3, 6],
      posicao916: "Faixa de 62% a 74% da altura, de 6% a 88% da largura.",
      posicao169: "Terço inferior, 65% a 80% da altura, pessoa acima.",
      quando: "História com datas, idades, antes e depois.",
    },
    {
      id: "grafico-de-eixos",
      nome: "Gráfico de eixos na cena",
      forma:
        "Eixos em L de traço branco brilhante desenhados sobre o cenário real, rótulos em serifa itálica e curva ciano com ponto brilhante na ponta. Traço 3 px, curva 4 px; segunda curva vermelha quando há comparação.",
      animacao: "Eixos em 500 ms, depois a curva se desenha em 900 a 1.200 ms no ritmo da fala.",
      duracaoSeg: [3, 7],
      posicao916: "Gráfico de 15% a 44% da altura, pessoa reenquadrada embaixo.",
      posicao169: "Espaço vazio ao lado da pessoa, 55% a 95% da largura.",
      quando: "Crescimento, queda, \"com o tempo\", trajetórias comparadas.",
    },
    {
      id: "anotacao-tracejada",
      nome: "Anotação tracejada",
      forma:
        "Linha vertical tracejada branca com ramos em T, cada ramo com um rótulo bold, e a conclusão embaixo em ciano brilhante. Traço 10 px, vão 8 px, 3 px de espessura.",
      animacao: "O tracejado corre de cima para baixo em 500 ms e cada rótulo desliza 12 px na palavra dita. A conclusão entra por último com um pulso.",
      duracaoSeg: [3, 6],
      posicao916: "Coluna à direita do rosto, 18% a 58% da altura.",
      posicao169: "Terço direito, 15% a 85% da altura.",
      quando: "Causa e efeito, soma de fatores.",
    },
    {
      id: "card-lateral",
      nome: "Card de painel ao lado",
      forma:
        "Retângulo preto arredondado com curvas de nível, título ciano pequeno, itens numerados brancos e nota em serifa itálica cinza. Raio 28 px; vidro fosco de 20 px sobre cena clara.",
      animacao: "Desliza 40 px da direita em 350 ms e assenta com balanço de 2 graus. Itens aparecem na palavra dita.",
      duracaoSeg: [4, 10],
      posicao916: "Sobre o peito, 50% a 74% da altura.",
      posicao169: "Ao lado da pessoa, 62% a 94% da largura.",
      quando: "Sublista curta dentro de um passo, ou definição de termo.",
    },
    {
      id: "conceito-serifado",
      nome: "Conceito em serifa itálica",
      forma: "Nome do framework em serifa itálica branca grande flutuando no vazio, com linha ciano de 1 px embaixo.",
      animacao: "Revela da esquerda por máscara em 600 ms e sobe 2% durante a permanência.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 20% a 32% da altura, acima do rosto.",
      posicao169: "Vazio ao lado da pessoa, na altura dos olhos.",
      quando: "A pessoa nomeia um conceito.",
    },
    {
      id: "hud-dado",
      nome: "Leitura de painel",
      forma:
        "Número grande com contador, rótulo em mono acima, cantos de mira de 1 px e barra de progresso ciano de 4 px. Uma régua fina com marcações sob o número.",
      animacao: "Cantos de mira fecham de 120% para 100% em 300 ms e o número conta até o valor em 800 ms.",
      duracaoSeg: [2, 4],
      posicao916: "Faixa de 18% a 36% da altura, centrado.",
      posicao169: "Terço superior ao lado da pessoa.",
      quando: "Número dito.",
    },
  ],
  insercoesGeradas: {
    quando: "Pouca: lousa, gráfico, escada e painel são código, nunca gerados. Imagem gerada só para objeto ou cena concreta da história, até 3 por minuto.",
    tipos: [
      "objeto concreto em luz lateral sobre fundo quase preto, muito espaço vazio",
      "plano de cinema de 2 a 3 s da história, frio e escuro, com aproximação lenta",
      "tela de produto do cliente em janela arredondada com borda ciano",
    ],
    nunca: "imagem fazendo papel de lousa, gráfico com número desenhado por modelo, banco de imagem genérico.",
  },
  som: {
    trilha: "Eletrônica cinematográfica discreta com pulso de sintetizador, 90 a 110 batidas por minuto; sobe na lousa, baixa sob a fala.",
    efeitos: ["clique digital em cada item", "whoosh grave ao entrar e sair da lousa", "ping de interface no passo ativo", "riser de 1 s antes do gancho"],
    mixagem: "Voz a -14 LUFS; trilha a -28 dB sob a fala e -20 dB na lousa sem fala; efeitos sutis, nunca cômicos.",
  },
  nunca: [
    "Abrir sem o gancho do meio do vídeo.",
    "Papel, recorte, carimbo, emoji, giz ou letra manuscrita.",
    "Fundo claro como base da lousa.",
    "Mais de dois elementos de apoio ao mesmo tempo.",
    "Elemento antes da palavra que o nomeia.",
    "Câmera parada por mais de 6 s, ou tremida.",
    "Legenda palavra a palavra amarela (isso é Hormozi).",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Lousa com os 7 tiles; desfoca 6, destaca o 1; mergulha nele e abre PASSO 01 com o nome; volta para a pessoa em aproximação lenta; no meio surgem elementos de apoio conforme ela fala; ao trocar de passo reabre a lista com o 1 verde, o 2 nítido e o resto desfocado.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Gancho do meio com a leitura de painel do número, riser, promessa com número, lousa-título com a lista desfocada 2 s, corte seco para a pessoa.",
    },
    {
      quando: "Ela conta a trajetória (\"aos 17 quebrado, aos 30 vendi a empresa\")",
      edicao: "Linha do tempo no terço de baixo, cursor parando em cada idade dita; inserção de cinema curta na virada; plano fechado no resultado.",
    },
    {
      quando: "Ela diz um resultado (\"a margem subiu 40%\")",
      edicao: "Leitura de painel ao lado dela contando até 40% com ping; punch de 115% na frase seguinte.",
    },
    {
      quando: "Ela explica que um fator leva a outro",
      edicao: "Anotação tracejada ao lado, um rótulo por fator na palavra dita, conclusão em ciano; a câmera aproxima enquanto a lista cresce.",
    },
    {
      quando: "Ela descreve algo crescendo com o tempo",
      edicao: "Eixos desenhados no cenário e curva ciano no ritmo da fala; se compara dois caminhos, a segunda curva vermelha mais baixa.",
    },
    {
      quando: "Ela nomeia um framework",
      edicao: "Lousa cheia 3 s com o nome em serifa itálica grande e whoosh; volta para a pessoa com o conceito pequeno no canto por mais 2 s.",
    },
    {
      quando: "Meio do vídeo, atenção caindo",
      edicao: "Escada de progresso mostra o degrau atual e quantos faltam enquanto ela anuncia o próximo; dois cortes rápidos.",
    },
  ],
  quadrosDeReferencia: [
    "Lousa quase preta com curvas de nível finas cinza; título branco bold com brilho no topo (\"7 passos para aumentar o valor da empresa\"); abaixo, 7 retângulos arredondados com borda ciano brilhante em duas linhas: o primeiro verde com o nome do passo em branco, o segundo ciano vivo, os outros teal escuro com números em serifa itálica cinza, desfocados.",
    "A pessoa sentada à esquerda num cenário real e quente (madeira, luz âmbar, microfone de braço) e, no espaço vazio à direita, dois eixos brancos finos com brilho desenhados sobre a parede, rótulos em serifa itálica branca (\"Tempo\", \"Valor\") e uma curva ciano subindo.",
    "Cartela escura de tela cheia com \"PASSO 03\" em mono ciano pequena entre duas linhas finas, o nome do passo em branco bold grande abaixo e quatro cantos de mira em L emoldurando o texto.",
  ],
  fontes: [
    "Quadros medidos em 25/08: docs/overlays/referencias/dan-martell (slate-7steps, slate-fases, card-lista, grafico-eixos, anotacao) e docs/overlays/BIBLIA-DE-ESTILO.md, Sistema 2.",
    "https://abhinavstellermedia.substack.com/p/how-dan-martell-grew-his-youtube (gancho imediato, muitos cortes nos primeiros 20 s)",
    "https://creators.spotify.com/pod/profile/1of10-podcast4/episodes/Meet-the-YouTube-Genius-Behind-Dan-Martell-Sam-Gaudet-e3ja3ph (Sam Gaudet, fórmula de gancho e retenção)",
    "https://www.freelancer.in/projects/adobe-premiere-pro/Dan-Martell-Style-Video-Editing.html (zooms, sobreposições, efeitos discretos)",
  ],
};

export const TEXTO_LOUSA = textoParaOPrompt(LOUSA);
