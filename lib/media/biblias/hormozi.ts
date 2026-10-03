import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * CORTE COM LEGENDA DINÂMICA, ESTILO HORMOZI (01/10/2026).
 *
 * A diferença para o MrBeast, que até 01/10 recebia o mesmo prompt: aqui a
 * ESTRELA é a fala e a legenda. Fundo neutro ou escuro, a pessoa olhando para
 * a câmera, zoom alternado a cada frase, a palavra-chave da legenda na cor da
 * marca, imagem de apoio de 1 a 2 s por ideia e ícone só onde ajuda. Menos
 * circo, mais autoridade.
 */
export const HORMOZI: BibliaDoEstilo = {
  id: "hormozi",
  nome: "Corte com legenda dinâmica (estilo Hormozi)",
  completa: true,
  kit: "impacto",
  kitFuturo: "retencao",
  essencia:
    "Autoridade direta: a pessoa fala para a câmera, a legenda grande no centro carrega o ritmo e a palavra-chave acende na cor da marca. O zoom alterna a cada frase, a imagem de apoio entra por 1 a 2 s quando há um objeto concreto, e o resto é limpo. Contraste alto, sem enfeite.",
  referencias: [
    "Cortes de Alex Hormozi e da escola de cortes de negócio (2023 a 2026): legenda central palavra a palavra, zoom de corte em salto alternado, B-roll curto por ideia, fundo neutro.",
    "Ficha 17 de docs/estilos-de-edicao-de-video.md.",
  ],
  tipografia: {
    titulo: "condensada pesada (Anton) em caixa alta, branca com contorno; uma palavra na cor de destaque",
    texto: "sem serifa pesada em caixa alta",
    numero: "Anton grande, branco, com a unidade na cor de destaque",
    legenda: "palavra a palavra no centro, duas por vez, a palavra-chave na cor da marca (a legenda é o elemento principal)",
    regras: ["A legenda manda: grafismo nunca disputa a faixa da legenda.", "Uma cor de destaque só."],
  },
  paleta: {
    papeis: "Fundo ESCURO da marca ou neutro como base; o ACENTO só na palavra-chave, no número e no fundo da cartela de ênfase.",
    fundosMax: { "papel-marca": 0.45 },
    regras: ["Fundo da cor da marca só em ênfase (no máximo quase metade das cenas com fundo).", "Contraste alto e limpo."],
  },
  movimento: {
    camera: "Zoom alternado: cada frase muda o enquadramento (punch na palavra forte, depois volta), como o corte em salto. Zoom lento só na frase de emoção.",
    entradas: "Palavra e ícone estouram no tempo da fala, um por vez, sem balanço exagerado.",
    punchPorMinuto: [8, 16],
  },
  transicoes: [
    { id: "corte", porMinuto: [10, 25], quando: "a base: corte em salto com troca de enquadramento" },
    { id: "deslize", porMinuto: [1, 4], quando: "troca de ideia" },
    { id: "flash", porMinuto: [1, 3], quando: "número ou virada" },
  ],
  layouts: [
    { id: "narrador-cheio", fatia: [0.55, 0.75], quando: "a base: a pessoa falando, zoom alternado" },
    { id: "broll-cheio", fatia: [0.08, 0.15], quando: "1 a 2 s, o objeto concreto da ideia" },
    { id: "narrador-recortado", fatia: [0.05, 0.15], quando: "ênfase ou lista, sobre o escuro ou a cor da marca" },
    { id: "cartela", fatia: [0.03, 0.1], quando: "o número ou a regra em tela cheia, 1,5 a 2,5 s" },
    { id: "tela-dividida", fatia: [0, 0.06], quando: "errado e certo" },
    { id: "narrador-canto", fatia: [0, 0.05], quando: "depois do broll-cheio, com a mesma imagem" },
    { id: "pip-terco", fatia: [0, 0.1], quando: "a regra ou a lista nos dois terços e você no terço, quando a fala enumera" },
  ],
  elementos: {
    permitidos: [
      { nome: "palavra", quando: "a regra ou a palavra-chave da frase, uma a cada 4 a 6 s", porMinuto: [8, 14] },
      { nome: "destaque", quando: "a frase-regra do vídeo, uma a cada 12 a 20 s", porMinuto: [2, 5] },
      { nome: "numero", quando: "todo número dito", porMinuto: [0, 5] },
      { nome: "emoji", quando: "só onde o ícone ajuda a ler (check, x, dinheiro, relogio)", porMinuto: [2, 6] },
      { nome: "barras", quando: "comparação de números ditos", porMinuto: [0, 1] },
      { nome: "recorte-pop", quando: "objeto concreto, pouco", porMinuto: [0, 3] },
      { nome: "icone", quando: "marca citada, na palavra em que é dita" },
    ],
    proibidos: ["papel, colagem, fita, letras de revista, carimbo", "mais de 2 elementos na mesma cena de narrador-cheio", "grafismo cobrindo a faixa da legenda"],
    maxPorCena: 2,
  },
  imagens: {
    apoio: "UM objeto herói do substantivo dito, luz dura e contrastada, fundo simples escuro ou na cor da marca, visual moderno e limpo",
    elemento: "UM objeto em ilustração chapada e limpa, contorno escuro (ex.: \"light bulb\", \"stack of coins\", \"calendar\")",
    cinema: "UMA ação simples e enérgica, luz de contraste, cor natural (ex.: \"coins pouring onto a dark wooden table in slow motion under a hard top spotlight, 50mm close-up, tense, natural colors\")",
    exemplos: [
      ["chat", "a single smartphone with blank glowing chat bubbles, hard rim light on a dark background"],
      ["dinheiro", "a neat stack of banknotes under a hard spotlight on a dark background"],
    ],
    nunca: ["papel, colagem ou gravura", "cena com várias coisas competindo"],
  },
  metas: {
    cenaSeg: { padrao: 3, min: 2, max: 4.5 },
    mudancaACadaSeg: { padrao: 3, min: 2, max: 4 },
    ganchoAteSeg: { padrao: 2, min: 1, max: 3 },
    textoNaTela: { padrao: 0.35, min: 0.2, max: 0.5 },
    rostoNaTela: { padrao: 0.75, min: 0.6, max: 0.85 },
    brollNaTela: { padrao: 0.12, min: 0.05, max: 0.2 },
    elementosPorMinuto: { padrao: 14, min: 10, max: 22 },
    batidasPorMinuto: { padrao: 100, min: 90, max: 120 },
  },
  tempoMorto: "agressivo",
  som: {
    trilha: "baixa e constante, 90 a 120 batidas por minuto, nunca disputa a voz",
    efeitos: [
      { evento: "palavra gigante", som: "pop curto" },
      { evento: "deslize", som: "whoosh" },
      { evento: "número", som: "ding" },
    ],
  },
  layoutsFuturos: ["PIP com um terço livre para a prova (print, gráfico)", "destaque animado sobre a tela compartilhada"],
  abertura: {
    tipo: "frase",
    descricao: "UMA ou DUAS frases-tese do próprio vídeo, as mais fortes e contraintuitivas, ditas sem contexto. Nada de trailer em cortes picados: a abertura é a regra que o vídeo prova.",
    momentoSeg: [2.5, 6],
    totalAlvoSeg: 7,
    totalMaxSeg: 10,
    ligadaPorPadrao: true,
    passagem: "corte-seco",
  },
  fecho: "A regra do vídeo de novo, em palavra gigante, e a chamada em uma frase, sem fade.",
  legenda: "destaque",
  regras: [
    "Os primeiros 2 s: narrador-cheio com punch e a PALAVRA da tese, ou cartela com o número.",
    "Zoom alternado: duas cenas seguidas de narrador-cheio nunca com o mesmo movimento.",
    "A legenda é a estrela: no narrador-cheio, no máximo UM elemento, fora da faixa da legenda.",
    "B-roll de 1 a 2 s, só quando há objeto concreto dito.",
    "Fundo escuro é a base; a cor da marca como fundo só na ênfase.",
  ],
  exemplos: `{"de":0,"ate":5,"layout":"narrador-cheio","movimento":"punch","movimentoNa":3,"transicao":"corte","fundo":"escuro","elementos":[{"tipo":"palavra","texto":"NÃO ESCALA","zona":"centro","palavra":3}],"motivo":"a tese no primeiro segundo"}
{"de":6,"ate":8,"layout":"broll-cheio","movimento":"zoom-in-lento","transicao":"corte","fundo":"escuro","asset":"a1","elementos":[],"motivo":"o objeto concreto dito, 1,5 s"}
{"de":9,"ate":16,"layout":"narrador-cheio","movimento":"zoom-out","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"emoji","nome":"relogio","zona":"base","palavra":11}],"motivo":"volta ao rosto com zoom alternado"}`,
  checklist: [
    "Gancho até 2 s.",
    "Zoom alternado entre narradores-cheios seguidos.",
    "No máximo 1 elemento por cena de narrador-cheio.",
    "B-roll de 1 a 2,5 s.",
    "Entre 10 e 22 elementos por minuto.",
    "Nenhum papel, colagem, carimbo.",
  ],
};
