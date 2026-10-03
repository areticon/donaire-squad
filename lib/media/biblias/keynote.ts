import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * LANÇAMENTO DE PRODUTO, ESTILO KEYNOTE DA APPLE (01/10/2026).
 *
 * O que o vídeo de referência sobre edição por IA chama de "motion graphics
 * limpos estilo Apple": uma ideia por tela, muito espaço vazio, tipografia
 * grande e fina, o texto aparecendo no instante exato em que a palavra é dita,
 * cor só na palavra-chave, transições suaves. É o antídoto da "cara de IA"
 * (tela poluída). Hoje é desenhado pelo kit sóbrio (título, citação, número);
 * o kit próprio, com texto palavra a palavra em peso fino e entrada pelos
 * lados, chega na Fase 2b.
 */
export const KEYNOTE: BibliaDoEstilo = {
  id: "keynote",
  nome: "Lançamento de produto (estilo keynote da Apple)",
  completa: true,
  kit: "sobrio",
  kitFuturo: "keynote",
  essencia:
    "Clareza de palco de lançamento: uma ideia por tela, muito espaço vazio, a frase-chave em letras grandes aparecendo no instante em que é dita, cor só na palavra que importa. Fundos pretos ou brancos puros, imagem de objeto com luz suave, transições que fundem. Nada compete com a ideia.",
  referencias: [
    "Keynotes da Apple e a estética de motion graphics limpos (ficha 11 de docs/estilos-de-edicao-de-video.md).",
    "Vídeo de referência do Bruno sobre edição por IA (HyperFrames, 01/10): motion graphics limpos, sem poluição, no instante exato da palavra.",
  ],
  tipografia: {
    titulo: "sem serifa grande e de peso médio, em caixa normal, centralizada, com muito ar em volta",
    texto: "sem serifa limpa, frases curtas",
    numero: "número enorme e fino, com rótulo pequeno embaixo",
    legenda: "limpa e discreta, ou nenhuma quando o título já diz a frase",
    regras: ["Uma frase por tela.", "Nunca mais de 6 palavras visíveis ao mesmo tempo.", "Cor só na palavra-chave."],
  },
  paleta: {
    papeis: "Fundo PRETO (escuro) ou BRANCO (claro), alternando por bloco; o ACENTO da marca só na palavra-chave e no detalhe do objeto.",
    fundosMax: { "papel-marca": 0.05 },
    regras: ["Nada de fundo colorido chapado.", "Imagem com luz suave de estúdio sobre fundo puro."],
  },
  movimento: {
    camera: "Aproximação lenta e suave como base; nada de punch.",
    entradas: "O texto surge com fade e leve subida no instante da palavra; o objeto aparece com fusão.",
    punchPorMinuto: [0, 0],
  },
  transicoes: [
    { id: "fundir", porMinuto: [3, 6], quando: "a base entre ideias" },
    { id: "corte", porMinuto: [2, 6], quando: "dentro da mesma ideia" },
  ],
  layouts: [
    { id: "narrador-cheio", fatia: [0.4, 0.55], quando: "a pessoa falando, quadro limpo, no máximo um título" },
    { id: "cartela", fatia: [0.15, 0.25], quando: "a frase-chave ou o número sozinho na tela, 3 a 5 s" },
    { id: "broll-cheio", fatia: [0.12, 0.22], quando: "o objeto dito em luz de estúdio, fundo puro" },
    { id: "narrador-canto", fatia: [0.05, 0.12], quando: "o objeto grande e a pessoa numa janela reta" },
    { id: "tela-dividida", fatia: [0, 0.05], quando: "antes e depois" },
    { id: "pip-terco", fatia: [0.08, 0.18], quando: "o objeto isolado ou a frase-chave nos dois terços, a pessoa no terço, entrando de lado com suavidade" },
  ],
  elementos: {
    permitidos: [
      { nome: "titulo", quando: "a ideia-chave em 1 a 3 palavras ditas (até 14 letras), na palavra em que começa", porMinuto: [3, 6] },
      { nome: "citacao", quando: "a frase-chave dita, de 4 a 6 palavras, sozinha na cartela ou abaixo do rosto", porMinuto: [1, 4] },
      { nome: "numero-com-fonte", quando: "todo número dito" },
      { nome: "barras", quando: "comparação simples de dois números ditos", porMinuto: [0, 1] },
      { nome: "icone", quando: "marca citada" },
    ],
    proibidos: ["tarja de telejornal", "mais de 1 elemento por cena", "emoji, seta, recorte, papel", "fundo colorido chapado", "punch"],
    maxPorCena: 1,
  },
  imagens: {
    apoio: "UM objeto do substantivo dito, isolado sobre fundo preto ou branco puro, luz suave de estúdio com reflexo discreto, enorme espaço vazio em volta, composição de anúncio de produto",
    elemento: null,
    cinema: "UM movimento lento e elegante em volta de um objeto sobre fundo puro, luz suave (ex.: \"a slow orbit around a single glass of water on a pure white surface, soft studio light, minimal\")",
    exemplos: [
      ["calendário", "a single minimal desk calendar with blank squares on a pure white surface, soft studio light, huge negative space"],
      ["energia", "a single glowing light bulb on a pure black background, soft reflection, minimal product shot"],
    ],
    nunca: ["cena cheia de objetos", "fundo de cenário real bagunçado", "cor saturada em tudo"],
  },
  metas: {
    cenaSeg: { padrao: 5, min: 3.5, max: 7 },
    mudancaACadaSeg: { padrao: 4, min: 3, max: 6 },
    ganchoAteSeg: { padrao: 3, min: 2, max: 4 },
    textoNaTela: { padrao: 0.35, min: 0.2, max: 0.5 },
    rostoNaTela: { padrao: 0.5, min: 0.35, max: 0.65 },
    brollNaTela: { padrao: 0.2, min: 0.1, max: 0.3 },
    elementosPorMinuto: { padrao: 8, min: 5, max: 12 },
    batidasPorMinuto: { padrao: 90, min: 75, max: 105 },
  },
  tempoMorto: "medio",
  som: {
    trilha: "minimalista e luminosa, 75 a 105 batidas por minuto, piano ou sintetizador limpo",
    efeitos: [
      { evento: "título surgindo", som: "um sopro suave" },
      { evento: "fusão", som: "nenhum" },
    ],
  },
  layoutsFuturos: ["texto palavra a palavra em peso fino no instante dito", "PIP com um terço livre e o objeto nos outros dois", "elementos entrando pelos lados para preencher a tela"],
  abertura: {
    tipo: "frase",
    descricao: "UMA frase, a tese do vídeo, dita sozinha. Silêncio visual em volta.",
    momentoSeg: [2.5, 6],
    totalAlvoSeg: 5,
    totalMaxSeg: 7,
    ligadaPorPadrao: true,
    passagem: "fusao",
  },
  fecho: "A ideia central sozinha numa cartela branca ou preta, e a chamada em uma linha.",
  legenda: "limpa",
  regras: [
    "Uma ideia por tela: no máximo 1 elemento por cena.",
    "O texto entra na PRIMEIRA palavra que ele repete, nunca antes.",
    "Fundo preto ou branco, alternando por bloco; nada de cor chapada.",
    "Imagem é sempre UM objeto isolado em fundo puro, com espaço vazio.",
    "Transição suave (fundir) entre ideias; nenhum punch.",
  ],
  exemplos: `{"de":0,"ate":9,"layout":"cartela","movimento":"zoom-in-lento","transicao":"fundir","fundo":"escuro","elementos":[{"tipo":"citacao","texto":"um vídeo por semana","zona":"centro","palavra":3}],"motivo":"a tese sozinha na tela"}
{"de":10,"ate":21,"layout":"narrador-cheio","movimento":"zoom-in-lento","transicao":"fundir","fundo":"claro","elementos":[],"motivo":"a pessoa, quadro limpo"}
{"de":22,"ate":30,"layout":"broll-cheio","movimento":"zoom-in-lento","transicao":"fundir","fundo":"claro","asset":"a1","elementos":[{"tipo":"titulo","texto":"sem agência","zona":"base","palavra":25}],"motivo":"o objeto em fundo puro e uma frase"}`,
  checklist: [
    "No máximo 1 elemento por cena.",
    "Nenhum punch, emoji, recorte ou tarja.",
    "Fundo colorido chapado em no máximo 5% das cenas com fundo.",
    "Imagens de um objeto isolado em fundo puro.",
    "Texto curto (até 6 palavras) entrando na palavra dita.",
  ],
};
