import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * LOUSA DE NEGÓCIOS, ESTILO DAN MARTELL (01/10/2026).
 *
 * Medida em 25/08 (docs/overlays/BIBLIA-DE-ESTILO.md, Sistema 2): lousa preta
 * com textura sutil, título branco com a palavra-chave na cor de destaque,
 * conceito em serifa itálica, lista numerada revelada item a item, a pessoa
 * numa janela no canto durante a lousa cheia; entre lousas, fala limpa com no
 * máximo uma anotação. Hoje desenhada pelo kit sóbrio: a "lousa" é uma imagem
 * de fundo escuro com textura (gerada UMA vez e reaproveitada) no
 * narrador-canto e na cartela, com título, chapéu numerado e citação. O kit
 * próprio (lista revelada, card lateral, borda com brilho) chega na Fase 2b.
 */
export const LOUSA: BibliaDoEstilo = {
  id: "lousa",
  nome: "Lousa de negócios (estilo Dan Martell)",
  completa: true,
  kit: "sobrio",
  kitFuturo: "lousa",
  essencia:
    "Aula de negócios em lousa preta: nos momentos de ESTRUTURA (passos, framework, regra) a tela vira lousa com título e lista, e a pessoa vai para uma janela no canto; entre as lousas, a fala limpa da pessoa com no máximo uma anotação. A palavra-chave sempre na cor de destaque; o nome do conceito em serifa itálica.",
  referencias: [
    "Dan Martell: Business is Hard Until You Build These Systems; How to Make Money Like The Top 0.001% (medidos em 25/08, docs/overlays/BIBLIA-DE-ESTILO.md).",
  ],
  tipografia: {
    titulo: "sem serifa bold branca, a palavra-chave trocada para a cor de destaque",
    texto: "sem serifa branca, itens numerados",
    numero: "número grande branco com rótulo em serifa itálica",
    legenda: "limpa, uma ou duas linhas, só nas frases de efeito",
    regras: ["Nome de conceito ou framework em serifa itálica (citação).", "Numeração dos passos no chapéu (\"PASSO 1\")."],
  },
  paleta: {
    papeis: "A lousa é o ESCURO da marca quase preto; o ACENTO da marca é a palavra-chave, a borda e o número do passo; o CLARO é o texto.",
    fundosMax: { "papel-marca": 0.1, papel: 0.15 },
    regras: ["Fundo escuro é a base.", "Verde e vermelho só para estado (certo e errado), nunca decoração."],
  },
  movimento: {
    camera: "Quase parada na lousa; aproximação lenta na fala; nenhum punch.",
    entradas: "Itens da lousa entram um a um, na palavra em que são ditos.",
    punchPorMinuto: [0, 1],
  },
  transicoes: [
    { id: "corte", porMinuto: [4, 10], quando: "a base" },
    { id: "fundir", porMinuto: [1, 4], quando: "entrar e sair da lousa" },
  ],
  layouts: [
    { id: "pip-terco", fatia: [0.25, 0.4], quando: "LOUSA COM A PESSOA NO TERÇO: SEM asset (a lousa escura com textura é desenhada em código), o título e cada passo entrando um a um nos dois terços livres, na palavra em que são ditos" },
    { id: "narrador-canto", fatia: [0, 0.08], quando: "raro: uma imagem concreta dita em cima e a pessoa na janela" },
    { id: "narrador-cheio", fatia: [0.35, 0.55], quando: "fala limpa entre lousas, no máximo uma anotação" },
    { id: "cartela", fatia: [0.08, 0.18], quando: "lousa cheia sem a pessoa: o nome do framework ou o número, 3 a 5 s" },
    { id: "broll-cheio", fatia: [0, 0.08], quando: "raro: objeto concreto dito" },
  ],
  elementos: {
    permitidos: [
      { nome: "titulo", quando: "o título da lousa (o assunto do bloco)", porMinuto: [2, 5] },
      { nome: "tarja-telejornal", quando: "cada passo ou item da lista: chapéu \"PASSO N\" e a frase dita", porMinuto: [3, 8] },
      { nome: "citacao", quando: "o nome do conceito ou framework dito", porMinuto: [1, 3] },
      { nome: "numero-com-fonte", quando: "número dito" },
      { nome: "barras", quando: "comparação dita" },
      { nome: "icone", quando: "marca citada" },
    ],
    proibidos: ["papel, colagem, recorte, carimbo", "emoji", "fundo claro como base", "mais de 2 elementos por cena"],
    maxPorCena: 2,
  },
  imagens: {
    apoio: "só para um objeto concreto dito (raro): o objeto em luz lateral suave sobre fundo quase preto, elegante, muito espaço vazio. A LOUSA em si NÃO é imagem: é desenhada em código",
    elemento: null,
    cinema: "plano escuro e elegante de um objeto ligado à ideia, luz lateral suave",
    exemplos: [
      ["agenda", "a closed leather notebook and a pen on a near-black desk, soft side light, minimal, lots of empty space"],
    ],
    nunca: ["imagem para servir de lousa", "lousa de giz com desenhos", "cores fortes no fundo"],
  },
  metas: {
    cenaSeg: { padrao: 6, min: 4.5, max: 8 },
    mudancaACadaSeg: { padrao: 4, min: 3, max: 6 },
    ganchoAteSeg: { padrao: 3, min: 2, max: 4 },
    textoNaTela: { padrao: 0.4, min: 0.25, max: 0.55 },
    rostoNaTela: { padrao: 0.6, min: 0.45, max: 0.75 },
    brollNaTela: { padrao: 0.05, min: 0, max: 0.12 },
    elementosPorMinuto: { padrao: 10, min: 7, max: 15 },
    batidasPorMinuto: { padrao: 95, min: 85, max: 108 },
  },
  tempoMorto: "medio",
  som: {
    trilha: "corporativa moderna e discreta, 85 a 108 batidas por minuto",
    efeitos: [
      { evento: "item da lousa entrando", som: "clique suave" },
      { evento: "entrar na lousa", som: "whoosh baixo" },
    ],
  },
  layoutsFuturos: ["lousa cheia com a pessoa em PIP no canto inferior direito (um terço livre)", "lista numerada revelada item a item com tiles na cor da marca", "card lateral flutuando ao lado da pessoa"],
  abertura: {
    tipo: "promessa",
    descricao: "A PROMESSA do vídeo (o que a pessoa vai aprender ou conquistar) em uma ou duas frases ditas, de preferência com número.",
    momentoSeg: [2.5, 6],
    totalAlvoSeg: 7,
    totalMaxSeg: 10,
    ligadaPorPadrao: true,
    passagem: "corte-seco",
  },
  fecho: "A lousa final com o framework inteiro (título e os passos ditos) e a chamada em uma frase.",
  legenda: "limpa",
  regras: [
    "Quando a fala enumera (passos, pilares, erros) ou nomeia um framework, a tela vira LOUSA: pip-terco SEM asset e com fundo escuro (a lousa com textura é desenhada em código), título na primeira palavra e cada item na palavra em que é dito (tarja com chapéu \"PASSO N\").",
    "Não peça imagem para a lousa: ela não é gerada. Imagem só para um objeto concreto dito, e raramente.",
    "Entre lousas, narrador-cheio com no máximo uma anotação.",
    "Os primeiros 3 s: narrador-cheio com o título da promessa, OU cartela com o número da promessa.",
    "Nenhum emoji, recorte, papel ou carimbo.",
  ],
  exemplos: `{"de":0,"ate":10,"layout":"narrador-cheio","movimento":"zoom-in-lento","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"titulo","texto":"3 sistemas","zona":"base","palavra":4}],"motivo":"a promessa com número"}
{"de":11,"ate":24,"layout":"pip-terco","movimento":"estatico","transicao":"fundir","fundo":"escuro","elementos":[{"tipo":"titulo","texto":"os sistemas","zona":"topo","palavra":12},{"tipo":"tarja","texto":"contratar antes de precisar","rotulo":"PASSO 1","zona":"meio-esquerda","palavra":16}],"motivo":"a fala enumera: vira lousa com a pessoa no terço"}
{"de":25,"ate":31,"layout":"cartela","movimento":"estatico","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"citacao","texto":"o princípio da recompra","zona":"centro","palavra":27}],"motivo":"o nome do conceito sozinho na lousa"}`,
  checklist: [
    "Toda enumeração ou framework dito vira lousa (pip-terco sem asset, ou cartela).",
    "Nenhuma imagem gerada para a lousa.",
    "Itens da lista na palavra em que são ditos.",
    "No máximo 2 elementos por cena; nenhum emoji, recorte ou papel.",
    "Fundo escuro como base.",
  ],
};
