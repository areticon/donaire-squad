import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";

/**
 * MINIMALISTA CORPORATIVO, B2B (03/10/2026).
 *
 * O que a pesquisa deu: o explicador B2B e de software limpo usa formas
 * simples, linhas e ícones de traço, grade rígida, muito espaço em branco,
 * paleta contida (neutros mais uma cor de marca), gráficos limpos com pontos
 * de dado animados e transições controladas que guiam em vez de chamar
 * atenção. Para os textos de apoio (terço inferior, rótulos), os guias de
 * motion convergem em entrada de 300 a 700 ms com curva de desaceleração,
 * permanência de 4 a 7 s, saída de 300 a 500 ms, a mesma curva para tudo e
 * no máximo duas linhas.
 */
export const MINIMALISTA: ReferenciaDeEstilo = {
  id: "minimalista",
  nome: "Minimalista corporativo",
  inspiracao: "explicadores de software B2B e relatórios anuais em vídeo",
  essencia:
    "Clareza como argumento de confiança. Fundo claro e neutro, uma cor de marca usada com parcimônia, texto curto sem serifa com muito ar em volta, ícones de traço fino e gráficos que mostram um número de cada vez. Tudo alinhado numa grade, tudo se move com a mesma curva suave; nada pisca, nada treme, nada brilha. A pessoa fala em plano limpo e bem iluminado, e a informação aparece ao lado dela como num relatório bem diagramado. O espectador deve sentir que a empresa é organizada.",
  estrutura: {
    abre:
      "O problema ou o número central em uma frase, dito pela pessoa em plano médio limpo, com o dado aparecendo ao lado em número grande e rótulo curto; depois a cartela de título branca com a linha de marca e o tema em 6 palavras.",
    avanca:
      "Seções numeradas (01, 02, 03): cartela de seção, pessoa explicando com um elemento por vez ao lado (ícone, número, gráfico), B-roll limpo de trabalho real sob a voz. Cada seção termina com uma frase de conclusão em texto.",
    fecha:
      "Cartela de resumo com 3 pontos em ícones de traço, a chamada objetiva (\"agende uma conversa\") e o logo da marca no centro sobre branco, com a linha de marca abaixo.",
  },
  ritmo: {
    cenaSeg: [4, 8],
    cortesPorMinuto: [8, 14],
    zoom:
      "Aproximação muito lenta de 100% para 103% em planos longos; deslize lateral de 2% no B-roll. Sem punch.",
    observacoes:
      "Um elemento gráfico por vez, entrando na palavra que o nomeia. Toda entrada de 400 a 600 ms com a mesma curva de desaceleração (cubic-bezier 0.2, 0, 0, 1); saída de 300 ms. Transição entre cenas por corte ou deslize suave de 500 ms.",
  },
  tipografia: {
    familias: [
      { papel: "título e número", familia: "Inter", pesos: "600 e 700", origem: "google-fonts", alternativa: "Liberation Sans local" },
      { papel: "rótulo e corpo", familia: "Inter", pesos: "400 e 500", origem: "google-fonts", alternativa: "IBM Plex Sans" },
      { papel: "número de seção e unidade", familia: "IBM Plex Mono", pesos: "500", origem: "google-fonts" },
    ],
    hierarquia:
      "Título a 4,5% a 5,5% da altura, peso 600. Número de destaque a 12% a 16%, peso 700. Rótulo a 2,5% a 3%. Número de seção em mono a 2%, cor de marca, acima do título.",
    regras: [
      "Até 6 palavras no título, 2 linhas no rótulo; alinhamento à esquerda numa margem fixa.",
      "Espaçamento entre letras de -1% no título e 0 no corpo; nenhum texto em caixa alta longa.",
      "Texto escuro sobre claro; a cor de marca só em número, linha ou palavra-chave.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo", hex: "#F7F8FA" },
      { papel: "superfície", hex: "#FFFFFF" },
      { papel: "texto", hex: "#0F172A" },
      { papel: "texto secundário", hex: "#64748B" },
      { papel: "linha e grade", hex: "#E2E8F0" },
      { papel: "marca", hex: "#2563EB" },
      { papel: "marca clara", hex: "#DBEAFE" },
    ],
    marca:
      "A cor da marca é a única cor: em número, linha, barra de destaque e ícone ativo, nunca em fundo inteiro (exceto a cartela final, se a marca pedir). Uma versão a 15% dela vira o preenchimento suave. Se a marca for escura, o fundo continua claro; se for muito clara, ela vai em barra e não em texto.",
  },
  elementos: [
    {
      id: "numero-destaque",
      nome: "Número de destaque com rótulo",
      forma:
        "Número grande na cor de marca com unidade menor ao lado e rótulo cinza de uma linha embaixo. Linha fina de 2 px na cor de marca acima, com 15% da largura.",
      animacao: "O número conta até o valor em 900 ms com desaceleração. A linha cresce da esquerda em 400 ms antes; o rótulo sobe 12 px com fade.",
      duracaoSeg: [3, 6],
      posicao916: "De 18% a 36% da altura, alinhado a 8%. Pessoa reenquadrada embaixo.",
      posicao169: "Metade livre ao lado da pessoa, de 30% a 60% da altura.",
      quando: "Número, percentual, prazo ou valor dito.",
    },
    {
      id: "grafico-simples",
      nome: "Gráfico simples de barras ou linha",
      forma:
        "Até 5 barras arredondadas cinza-claro com a que importa na cor de marca, ou uma linha de 3 px com ponto final. Sem eixo vertical; rótulos cinza na base, valor só na barra destacada; grade horizontal de 1 px a 40%.",
      animacao: "Barras crescem da base com 80 ms de intervalo em 600 ms. A destacada cresce por último e o valor aparece sobre ela.",
      duracaoSeg: [4, 7],
      posicao916: "Cartão branco de 16% a 52% da altura. Largura de 8% a 86%.",
      posicao169: "Cartão à direita, de 52% a 94% da largura. Entre 18% e 82% da altura.",
      quando: "Comparação, crescimento, resultado antes e depois.",
    },
    {
      id: "icone-de-traco",
      nome: "Ícone de traço com rótulo",
      forma:
        "Ícone de linha de 2 px, cantos arredondados, dentro de um círculo de marca clara, com rótulo de uma linha ao lado. Ícone a 6% da altura; estilo único do começo ao fim.",
      animacao: "O traço do ícone se desenha em 500 ms. O círculo cresce de 90% para 100% em 300 ms antes.",
      duracaoSeg: [2.5, 5],
      posicao916: "Coluna de 20% a 70% da altura. Alinhada a 8%, até 4 ícones empilhados.",
      posicao169: "Fileira horizontal no terço inferior ou coluna ao lado da pessoa.",
      quando: "Benefício, etapa, área, recurso.",
    },
    {
      id: "terco-inferior",
      nome: "Terço inferior de nome e cargo",
      forma:
        "Barra vertical de 4 px na cor de marca com nome em 600 e cargo em 400 cinza, sem fundo ou sobre cartão branco a 92%. Duas linhas, no máximo.",
      animacao: "A barra cresce de cima em 300 ms e o texto desliza 16 px da esquerda em 400 ms. Sai ao contrário em 300 ms.",
      duracaoSeg: [4, 6],
      posicao916: "De 62% a 70% da altura. Alinhado a 6%.",
      posicao169: "De 76% a 86% da altura. Alinhado à margem de 5%.",
      quando: "Primeira aparição de cada pessoa.",
    },
    {
      id: "cartela-de-secao",
      nome: "Cartela de seção numerada",
      forma:
        "Fundo claro com número de seção em mono na cor de marca e título em uma linha, alinhados à esquerda. Linha de 1 px atravessando a largura abaixo do título.",
      animacao: "O número aparece em fade de 300 ms e o título sobe 16 px em 450 ms. A linha corre da esquerda em 600 ms.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "De 40% a 52% da altura. Alinhada a 8%.",
      posicao169: "De 40% a 58% da altura. Alinhada a 10%.",
      quando: "Troca de seção ou de assunto.",
    },
    {
      id: "lista-com-checks",
      nome: "Lista com marcadores de check",
      forma:
        "Cartão branco com sombra de 24 px a 6% e até 5 itens curtos, cada um com um check de traço na cor de marca. Raio 16 px; padding de 4% da largura.",
      animacao: "O cartão sobe 20 px com fade em 450 ms. Cada item entra na palavra dita e o check se desenha em 250 ms.",
      duracaoSeg: [4, 10],
      posicao916: "De 46% a 74% da altura. Largura de 6% a 86%.",
      posicao169: "Ao lado da pessoa, de 55% a 94% da largura.",
      quando: "Lista curta, critérios, o que está incluso.",
    },
    {
      id: "tela-de-produto",
      nome: "Tela de produto em moldura",
      forma:
        "Captura real do produto do cliente dentro de uma janela de navegador simplificada (três pontos cinza) com raio de 14 px e sombra suave. Um destaque em retângulo de traço de 2 px na cor de marca sobre a área citada.",
      animacao: "A janela sobe 24 px com fade em 500 ms e aproxima de 100% para 104%. O destaque se desenha em 400 ms.",
      duracaoSeg: [4, 8],
      posicao916: "De 18% a 58% da altura. Largura de 6% a 88%.",
      posicao169: "Dois terços da tela, centrada. Ou à direita da pessoa.",
      quando: "Demonstração de funcionalidade ou resultado no sistema.",
    },
  ],
  insercoesGeradas: {
    quando: "B-roll limpo sob a voz quando o cliente não tem imagem do trabalho: 2 a 4 por minuto, sempre claro e neutro.",
    tipos: [
      "escritório claro e organizado, luz natural, pessoas trabalhando de costas ou desfocadas",
      "mãos no teclado, reunião em mesa clara, tela sem texto legível",
      "objeto do setor do cliente (painel, máquina, caixa) em fundo neutro, plano geral limpo",
    ],
    nunca: "gráfico, número, interface ou texto desenhado pelo modelo (dado e tela são código ou captura real), foto de banco com aperto de mão ou sorriso forçado, ilustração 3D brilhante.",
  },
  som: {
    trilha: "Trilha corporativa leve de piano, pluck e batida suave, 90 a 110 batidas por minuto, otimista e sem picos.",
    efeitos: ["clique suave de interface nos números", "deslize de ar discreto nos cartões", "tom curto na cartela de seção"],
    mixagem: "Voz a -14 LUFS, limpa; trilha a -26 dB sob a fala e -20 dB nas cartelas; efeitos a -24 dB, quase imperceptíveis.",
  },
  nunca: [
    "Brilho, neon, degradê forte, glitch, sombra dura.",
    "Mais de uma cor de destaque ou fundo inteiro saturado.",
    "Punch, tremida, câmera na mão, transição de giro ou cubo.",
    "Legenda palavra a palavra, emoji, texto em caixa alta longa.",
    "Dois elementos gráficos entrando ao mesmo tempo.",
    "Gráfico com eixo cheio de números ou mais de 5 barras.",
  ],
  momentos: [
    {
      quando: "A pessoa enumera 7 passos",
      edicao:
        "Cartão branco com os 7 passos numerados; os outros 6 a 35% de opacidade e o 1 em texto cheio com barra de marca à esquerda; cartela de seção \"01\" com o nome do passo; volta para a pessoa; ao lado entram, um de cada vez, ícone e número conforme ela fala; ao trocar de passo, o cartão volta com check no 1 e o 2 destacado.",
    },
    {
      quando: "Os primeiros segundos",
      edicao: "Pessoa em plano médio dizendo o número central; o número conta ao lado com linha de marca; cartela de título branca com o tema.",
    },
    {
      quando: "Ela apresenta um resultado (\"reduzimos o prazo de 30 para 12 dias\")",
      edicao: "Gráfico de duas barras, a de 30 em cinza e a de 12 na cor de marca, valor sobre ela; volta para a pessoa.",
    },
    {
      quando: "Ela mostra como o sistema funciona",
      edicao: "Tela de produto em moldura com destaque na área citada; segundo destaque na próxima área dita; volta à pessoa.",
    },
    {
      quando: "Ela lista o que está incluso",
      edicao: "Lista com checks ao lado dela, um item por fala, cartão some depois do último item.",
    },
    {
      quando: "Entra um segundo porta-voz",
      edicao: "Terço inferior com nome e cargo por 5 s; plano limpo; nada mais na tela.",
    },
    {
      quando: "O fecho",
      edicao: "Cartela de resumo com 3 ícones de traço, chamada objetiva, logo centrado sobre branco.",
    },
  ],
  quadrosDeReferencia: [
    "Pessoa em plano médio num escritório claro e desfocado, à esquerda; à direita, sobre o espaço vazio, um número grande azul (\"42%\") com uma linha fina azul acima e um rótulo cinza de uma linha embaixo; muito espaço livre.",
    "Fundo cinza-claro com um cartão branco de cantos arredondados mostrando quatro barras cinza-claro e uma azul mais alta com o valor em cima; rótulos cinza pequenos na base, sem eixo vertical.",
    "Cartela clara com \"02\" pequeno em mono azul acima de um título escuro de uma linha alinhado à esquerda e uma linha cinza fina atravessando a largura.",
  ],
  fontes: [
    "https://www.b2w.tv/blog/types-of-motion-graphics (formas simples, ícones, paleta contida, gráficos limpos, transições controladas)",
    "https://studiopigeon.com/blog/best-b2b-explainer-animations/ (estilo 2D mínimo para B2B e SaaS, espaço em branco, foco na mensagem)",
    "https://infinitecreation.io/tutorial-lower-thirds (terço inferior mínimo, entrada de 0,3 a 0,7 s, permanência de 4 a 7 s, saída de 0,3 a 0,5 s)",
    "https://pixflow.net/blog/how-to-make-professional-lower-thirds-in-after-effects/ (sempre com curva, mesma curva para elementos relacionados)",
  ],
};

export const TEXTO_MINIMALISTA = textoParaOPrompt(MINIMALISTA);
