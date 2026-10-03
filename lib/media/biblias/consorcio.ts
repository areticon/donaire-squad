import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * AUTORIDADE EM CONSÓRCIO (02/10/2026), para os 10 vendedores da Gaberlini
 * Consórcios (sócio Matheus Gaberlini), que gravam Reels, TikTok e Shorts.
 *
 * DE ONDE SAEM OS NÚMEROS (scripts/tmp/medir-consorcio-0210.mts, US$ 0,49 de
 * coleta pela Apify): 163 posts de seis perfis do nicho que o Bruno mandou
 * (@wesley.ajo, @referenciacapital, @maria_descomplicaconsorcio,
 * @sanley_lima, @fvlconsorcio, @portoeliteoficial), o ganho de cada post
 * contado contra a mediana do próprio perfil, e a forma dos 18 Reels que mais
 * renderam (3 por perfil) medida com o código do worker e olhada quadro a
 * quadro (8 quadros por vídeo).
 *
 *   • Reels são 133 de 163 posts (82%); carrossel e foto rendem menos (foto 0,35x).
 *   • Duração: a faixa de 30 a 45 s é a que mais rende (1,32x em plays e 1,72x
 *     em curtidas, 17 Reels); 45 a 60 s rende 0,8x. O corte mira 30 a 45 s.
 *   • A fala começa no quadro zero (mediana 0,03 s): nada de vinheta.
 *   • Cena: mediana de 6,8 s nos 18 melhores (a gravação real em plano longo,
 *     com a legenda trocando), primeiro corte aos 5,6 s, 0,09 cortes por
 *     segundo; o mais visto de todos (77x a mediana do perfil, bastidor de
 *     fechamento) corta a cada 2 s. Andamento da trilha: mediana de 100 bpm.
 *   • Legenda da fala em 11 dos 18, SEMPRE na faixa do meio do quadro (de 55% a
 *     78% da altura, nunca no rodapé), 1 a 4 palavras por vez; 5 dos 11 em
 *     caixa alta condensada e pesada. Título fixo no topo (o "POV: ...") em 3.
 *   • Texto grande além da legenda em 3 dos 18 (o "50% OFF", o "0%", o
 *     "1º DIA"): é a prova, e aparece quando a fala diz o número.
 *   • Rosto de quem fala em 13 dos 18; o resto é bastidor, obra, evento. Lugar
 *     real: o escritório comercial, o palco, o carro, a mesa da cozinha.
 *   • Formatos pela legenda do post (ganho em curtidas): explicação 1,13x
 *     (32), POV 1,12x (15), negociação e fechamento 1,11x (8), bastidor e
 *     evento 1,06x (35), contemplação 1,05x (26), responde comentário 1,43x
 *     (só 2, sinal fraco). Pergunta no gancho rende MENOS (0,66x, 8) e número
 *     na primeira linha da legenda do post não ajuda (0,88x, 18): o número
 *     ganha quando é a prova DITA, não como isca.
 *
 * O que NÃO veio da medida e é regra da casa: a guarda do Banco Central
 * (nunca prometer contemplação, data ou rendimento; lib/media/promessas-proibidas.ts
 * tira da tela) e a recusa de imagem de IA de dinheiro voando ou carro de luxo.
 */
export const CONSORCIO: BibliaDoEstilo = {
  id: "consorcio",
  nome: "Autoridade em consórcio",
  completa: true,
  kit: "impacto",
  kitFuturo: "consorcio",
  essencia:
    "O Reels do vendedor de consórcio que rende: a pessoa real falando para a câmera no escritório, no carro ou no evento, desde o primeiro quadro, com a legenda grande em letra condensada no MEIO do quadro. A prova aparece quando é dita: o valor numa faixa de papel rasgado na cor da marca, o selo branco com o nome do vendedor, o cartão do comentário que está sendo respondido. Confiança acima de energia: nada de dinheiro voando, carro de luxo genérico ou promessa.",
  referencias: [
    "Medida de 02/10/2026 em seis perfis de consórcio do Instagram (163 posts, 18 Reels medidos quadro a quadro): Reels de 30 a 45 s rendem 1,32x; legenda na faixa do meio do quadro, 1 a 4 palavras por vez; fala desde o quadro zero; cena mediana de 6,8 s com a gravação real; texto grande só como prova do número dito.",
    "Formatos do nicho vistos nos perfis: negociação ao vivo (\"110 x 115 x R$ 120.000\"), cheque de CONTEMPLADO com o cliente, \"3 sinais de que você está pronto\", \"POV: é dia de fechamento\", respondendo comentário de seguidor, bastidor da operação comercial, evento e premiação.",
    "Guarda regulatória: consórcio é regulado pelo Banco Central (Lei 11.795/2008); contemplação é por sorteio ou lance.",
  ],
  tipografia: {
    titulo: "condensada pesada (Anton) em CAIXA ALTA, branca com sombra macia; nunca letra fina nem serifa",
    texto: "condensada pesada (Anton) em caixa alta",
    numero: "Anton dentro da FAIXA de papel rasgado na cor da marca (letra branca ou escura, a que ler sobre o acento), contando até o valor dito em 0,6 s",
    legenda: "Anton em caixa alta, até 3 palavras por vez, branca com sombra, no MEIO do quadro (a dois terços da altura, abaixo do rosto); a palavra da vez cresce",
    regras: ["A legenda é o padrão do nicho: grande, no meio, poucas palavras.", "Uma cor de destaque só: a da marca, na faixa e no check.", "Nada de letra torta, contorno grosso ou estouro palavra a palavra."],
  },
  paleta: {
    papeis: "A gravação é o fundo (o escritório, o carro, o evento). O ACENTO da marca é a faixa do valor e o círculo do check. O BRANCO é o selo e o cartão do comentário. O ESCURO só na cartela de ênfase, raramente.",
    fundosMax: { escuro: 0.5 },
    regras: ["Cartela na cor da marca só para o valor ou o CONTEMPLADO, 1,5 a 2,5 s.", "Nada de fundo escuro dramático: o nicho é luz de dia, lugar real."],
  },
  movimento: {
    camera: "A gravação real manda. Punch curto na palavra do VALOR e da virada; zoom-in-lento na explicação; zoom alternado entre frases quando a cena é longa. Nunca câmera nervosa.",
    entradas: "A faixa do valor se abre da esquerda e o número conta; o selo estoura curto e o check se desenha; o comentário sobe da base do quadro. Uma coisa por vez.",
    punchPorMinuto: [6, 12],
  },
  transicoes: [
    { id: "corte", porMinuto: [8, 20], quando: "a base: corte seco com troca de enquadramento" },
    { id: "deslize", porMinuto: [0, 3], quando: "troca de sinal na lista (\"sinal 2\") ou de bloco" },
    { id: "flash", porMinuto: [0, 2], quando: "só na revelação: o CONTEMPLADO, o FECHADO, o valor final da negociação" },
  ],
  layouts: [
    { id: "narrador-cheio", fatia: [0.7, 0.9], quando: "a base: a pessoa falando, com a legenda no meio e a prova entrando quando é dita" },
    { id: "cartela", fatia: [0.03, 0.1], quando: "o valor ou a palavra da prova (CONTEMPLADO) em tela cheia sobre a cor da marca, 1,5 a 2,5 s, no máximo duas por corte" },
    { id: "pip-terco", fatia: [0, 0.12], quando: "a lista (\"3 sinais\") ou a negociação (\"110 x 115\") nos dois terços e a pessoa no terço" },
    { id: "broll-cheio", fatia: [0, 0.08], quando: "só o objeto concreto dito (a chave da casa, o contrato), 1,5 a 2,5 s" },
    { id: "narrador-canto", fatia: [0, 0.05], quando: "logo depois do broll-cheio, com a mesma imagem" },
    { id: "tela-dividida", fatia: [0, 0.05], quando: "comparação dita: aluguel contra parcela, financiamento contra consórcio, com x e check" },
    { id: "narrador-recortado", fatia: [0, 0.05], quando: "ênfase rara, sobre a cor da marca" },
  ],
  elementos: {
    permitidos: [
      { nome: "faixa", quando: "TODO valor dito (carta, crédito, lance, parcela) e a palavra da prova (CONTEMPLADO, FECHADO); quando a fala abre com valor, a primeira faixa entra nos 2 primeiros segundos", porMinuto: [1, 4] },
      { nome: "selo", quando: "UM por corte, nos 3 primeiros segundos, zona topo: o nome do cliente (QUEM É O CLIENTE) ou o apelido que a pessoa diz de si", porMinuto: [0, 2] },
      { nome: "comentario", quando: "SÓ quando a pessoa lê ou responde a pergunta de um seguidor (\"me perguntaram\", \"o João comentou\"): o cartão no topo enquanto ela lê", porMinuto: [0, 2] },
      { nome: "rotulo", quando: "o bordão dito (\"Não façam isso em casa!\", \"POV: é dia de fechamento\" quando dito), no máximo um por corte", porMinuto: [0, 1] },
      { nome: "palavra", quando: "a palavra do formato e da virada (\"SINAL 1\", \"LANCE\"), curta e dita", porMinuto: [1, 3] },
      { nome: "numero", quando: "número dito que não é dinheiro (meses, contemplados, clientes); também sai como faixa", porMinuto: [0, 3] },
      { nome: "destaque", quando: "a frase-regra do vídeo, uma a cada 20 a 30 s", porMinuto: [0, 2] },
      { nome: "emoji", quando: "só check e x na comparação, e relógio em prazo dito; nunca dinheiro, fogo ou foguete", porMinuto: [0, 3] },
      { nome: "barras", quando: "comparação de dois valores ditos (parcela do consórcio contra a do financiamento)", porMinuto: [0, 1] },
      { nome: "icone", quando: "marca citada, na palavra em que é dita" },
    ],
    proibidos: [
      "texto na tela que promete contemplação garantida, data ou prazo de contemplação, rendimento, retorno, valorização ou crédito aprovado",
      "emoji de dinheiro, fogo ou foguete",
      "pilha de dinheiro, dinheiro voando, ouro, carro de luxo, mansão ou iate, na imagem ou no recorte",
      "papel de colagem, letras de revista, carimbo",
      "mais de 2 elementos na mesma cena de narrador-cheio",
    ],
    maxPorCena: 2,
  },
  imagens: {
    apoio: "UM objeto concreto do negócio DITO (a chave da casa nova, a chave do carro, o contrato assinado com a caneta, a maquete da casa, o calendário da assembleia), luz de dia, escritório ou casa real, crível; nunca dinheiro em pilha, nunca luxo",
    elemento: null,
    cinema: "UMA ação simples e real, luz de dia, câmera calma (ex.: \"new house keys being placed on a wooden desk next to a signed contract and a pen, bright daylight, slow push-in\")",
    exemplos: [
      ["casa própria", "new house keys on a wooden desk next to a small house model, bright natural daylight, clean modern home office"],
      ["carro", "a car key resting on a closed folder of documents on a bright office desk, clean daylight, shallow depth of field"],
      ["contrato", "a signed contract with a pen on a meeting table in a bright sales office, no readable text, warm daylight"],
      ["parcela", "a simple desk calendar beside a calculator on a clean office desk, bright daylight, calm and orderly"],
    ],
    nunca: ["dinheiro voando, pilha de notas, ouro", "carro esportivo de luxo, mansão, iate, cassino", "gente (o cliente e a equipe só aparecem se estão na gravação)", "clima escuro dramático"],
  },
  metas: {
    // Medido: cena mediana de 6,8 s nos 18 melhores; o corte da Demandou
    // troca de enquadramento antes disso (zoom, punch, prova entrando).
    cenaSeg: { padrao: 4.5, min: 2.5, max: 7 },
    mudancaACadaSeg: { padrao: 3.5, min: 2.5, max: 5 },
    // Medido: a fala começa no quadro zero.
    ganchoAteSeg: { padrao: 1.5, min: 1, max: 2 },
    // Medido: texto grande além da legenda em 3 de 18 vídeos.
    textoNaTela: { padrao: 0.15, min: 0.08, max: 0.25 },
    // Medido: rosto de quem fala em 13 de 18.
    rostoNaTela: { padrao: 0.78, min: 0.6, max: 0.9 },
    brollNaTela: { padrao: 0.06, min: 0, max: 0.12 },
    elementosPorMinuto: { padrao: 6, min: 4, max: 10 },
    // Medido: mediana de 100 bpm.
    batidasPorMinuto: { padrao: 100, min: 85, max: 125 },
  },
  tempoMorto: "agressivo",
  som: {
    trilha: "baixa e animada, 85 a 125 batidas por minuto, nunca disputa a voz do vendedor",
    efeitos: [
      { evento: "faixa do valor", som: "impacto curto" },
      { evento: "número contando", som: "tique de contagem e ding no fim" },
      { evento: "selo", som: "pop" },
      { evento: "comentário", som: "clique" },
      { evento: "deslize", som: "whoosh" },
    ],
  },
  layoutsFuturos: ["o título fixo no topo do POV durante o corte inteiro", "o cheque de CONTEMPLADO desenhado em código com o nome dito"],
  abertura: {
    tipo: "frase",
    descricao: "UMA frase inteira do próprio vídeo, curta: a que tem o VALOR dito (é o gancho de prova do nicho), senão a do formato (\"3 sinais de que...\", \"POV: ...\") ou a virada da negociação. Nunca uma pergunta solta (no nicho, pergunta no gancho rende menos) e nunca uma promessa.",
    momentoSeg: [2, 5],
    totalAlvoSeg: 4,
    totalMaxSeg: 6,
    ligadaPorPadrao: true,
    passagem: "corte-seco",
  },
  fecho: "A chamada em uma frase dita (\"comenta QUERO\", \"me chama no direct\"), com o selo do vendedor de volta; sem fade.",
  legenda: "destaque",
  regras: [
    "GUARDA DO BANCO CENTRAL, acima de tudo: nenhum texto na tela promete contemplação garantida, data ou prazo de contemplação, rendimento, retorno ou crédito aprovado. Se a fala promete, a tela não repete; o código tira o texto que prometer.",
    "Os primeiros 2 s: a pessoa falando desde o quadro zero, com o selo do vendedor no topo; se a fala abre com um valor, a FAIXA do valor entra junto.",
    "Todo valor dito vira FAIXA (carta, crédito, lance, parcela); a palavra da prova (CONTEMPLADO, FECHADO) também. Nunca valor que não foi dito.",
    "Reconheça o FORMATO pela fala e escolha a cara: lista (\"3 sinais\") vira palavra \"SINAL 1\" em cada item; negociação vira faixa de cada valor dito; comentário lido vira o cartão do comentário; POV e bastidor ficam na gravação com o rótulo dito; contemplação vira faixa CONTEMPLADO.",
    "A legenda é a estrela, no meio do quadro: no narrador-cheio, no máximo 2 elementos, fora da faixa da legenda, e o selo e o comentário no TOPO.",
    "Prova real acima de imagem gerada: B-roll só do objeto concreto dito (a chave, o contrato), curto; nunca dinheiro, luxo ou gente gerada.",
    "Nada de emoji de dinheiro, fogo ou foguete; check e x só na comparação.",
  ],
  exemplos: `{"de":0,"ate":6,"layout":"narrador-cheio","movimento":"punch","movimentoNa":4,"transicao":"corte","fundo":"escuro","elementos":[{"tipo":"selo","texto":"Gaberlini Consórcios","zona":"topo","palavra":0},{"tipo":"faixa","texto":"R$ 120 MIL","zona":"centro","palavra":4}],"motivo":"o valor dito no primeiro segundo e meio, com o selo do vendedor"}
{"de":7,"ate":15,"layout":"narrador-cheio","movimento":"zoom-in-lento","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"comentario","texto":"dá pra usar o FGTS no lance?","autor":"","zona":"topo","palavra":9}],"motivo":"ela lê a pergunta do seguidor: o cartão do comentário no topo"}
{"de":16,"ate":19,"layout":"cartela","movimento":"punch","movimentoNa":17,"transicao":"flash","fundo":"marca","elementos":[{"tipo":"faixa","texto":"CONTEMPLADO","zona":"centro","palavra":17}],"motivo":"a prova dita em tela cheia, 2 s"}`,
  checklist: [
    "Nenhum texto na tela promete contemplação, data, rendimento ou crédito aprovado.",
    "Selo do vendedor nos 3 primeiros segundos, no topo (um por corte).",
    "Todo valor dito vira faixa, e só valor dito.",
    "Comentário só quando a pessoa lê a pergunta de alguém.",
    "No máximo 2 elementos por narrador-cheio, fora da faixa da legenda.",
    "Nenhum emoji de dinheiro, fogo ou foguete; nenhuma imagem de dinheiro, luxo ou gente.",
    "Entre 4 e 10 elementos por minuto.",
  ],
  // Medido: a gravação real rende mais que a cena gerada. Uma cena de cinema
  // por corte (o objeto concreto dito), e nenhum cenário que se desintegra.
  tetosDoCorte: { cinema: 1, cenarioDoNarrador: 0 },
};
