import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * TELEJORNAL E REPORTAGEM, ESTILO BBC (01/10/2026): a bíblia sóbria.
 *
 * É a linguagem de quem precisa de credibilidade antes de energia: médico,
 * advogado, empresa de energia, igreja quando o assunto é sério. Planos que
 * respiram, tarja de telejornal com a frase-chave, número grande com a fonte,
 * imagem documental, fusão curta. Serve de base para os estilos de emissora
 * ainda sem bíblia própria (National Geographic, 60 Minutes, TED,
 * institucional, depoimento, podcast, minimalista).
 */
export const SOBRIO: BibliaDoEstilo = {
  id: "bbc",
  nome: "Telejornal e reportagem (estilo BBC)",
  completa: true,
  kit: "sobrio",
  kitFuturo: "emissora",
  essencia:
    "Credibilidade e calma: a pessoa em plano médio, planos de 5 a 8 s que respiram, tarja de telejornal com a frase-chave e um chapéu curto, número grande com a fonte quando a fala cita um dado, imagem documental real do que foi dito. Grafismo reto, alinhado, discreto; a cor da marca só num filete.",
  referencias: [
    "BBC News, reportagens de emissora (ficha 2 de docs/estilos-de-edicao-de-video.md): 10 a 16 cortes por minuto, tarjas de nome e cargo, números com fonte.",
    "Bíblia de agosto (docs/overlays/BIBLIA-DE-ESTILO.md): lower third de nome em bold com cargo em linha fina, rótulo em caixa alta espaçada.",
  ],
  tipografia: {
    titulo: "condensada de média espessura em caixa alta espaçada, com um filete na cor da marca embaixo",
    texto: "sem serifa limpa, peso bold, escura sobre painel claro na tarja",
    numero: "condensada grande, branca, num cartão escuro reto com borda na cor da marca, rótulo e fonte embaixo",
    legenda: "limpa, branca com contorno fino, frases de 5 a 7 palavras",
    regras: ["Nada de caixa alta gritada no texto corrido.", "Fonte do dado sempre que a fala disse de onde vem."],
  },
  paleta: {
    papeis: "Fundos ESCURO e CLARO da marca, alternando; o ACENTO só no filete da tarja, no chapéu e na borda do número.",
    fundosMax: { "papel-marca": 0.1 },
    regras: ["Cor da marca chapada como fundo só em cartela de capítulo.", "Imagem documental com cor natural."],
  },
  movimento: {
    camera: "Aproximação quase imperceptível (3 a 4%) como base; afastamento para abrir assunto; punch no máximo uma vez por minuto, numa revelação.",
    entradas: "A tarja se abre da esquerda depois do filete crescer; números sobem com fade; nada estoura nem balança.",
    punchPorMinuto: [0, 1],
  },
  transicoes: [
    { id: "corte", porMinuto: [5, 12], quando: "a base" },
    { id: "fundir", porMinuto: [1, 4], quando: "troca de assunto e entrada de imagem documental" },
  ],
  layouts: [
    { id: "narrador-cheio", fatia: [0.5, 0.7], quando: "a base, em planos de 5 a 8 s" },
    { id: "broll-cheio", fatia: [0.12, 0.25], quando: "imagem documental do lugar ou objeto dito, 3 a 4,5 s" },
    { id: "narrador-canto", fatia: [0.05, 0.15], quando: "como o telejornal chama o repórter: imagem grande e a pessoa numa janela reta" },
    { id: "cartela", fatia: [0.03, 0.1], quando: "tela de dado: número com fonte, gráfico ou título de capítulo, 3 a 5 s" },
    { id: "tela-dividida", fatia: [0, 0.05], quando: "comparação" },
    { id: "pip-terco", fatia: [0.04, 0.12], quando: "o documento, o lugar ou o dado nos dois terços e a pessoa no terço, como o apresentador ao lado da reportagem" },
  ],
  elementos: {
    permitidos: [
      { nome: "tarja-telejornal", quando: "a frase-chave falada com chapéu do assunto, uma a cada 8 a 15 s", porMinuto: [4, 7] },
      { nome: "numero-com-fonte", quando: "todo dado dito, com a fonte se foi dita" },
      { nome: "titulo", quando: "troca de capítulo", porMinuto: [0, 2] },
      { nome: "citacao", quando: "a frase de mais peso do trecho", porMinuto: [0, 2] },
      { nome: "barras", quando: "comparação de números ditos" },
      { nome: "icone", quando: "marca citada" },
    ],
    proibidos: ["papel, colagem, recorte, carimbo, letras de revista", "emoji, seta desenhada, punch nervoso", "mais de 2 elementos por cena"],
    maxPorCena: 2,
  },
  imagens: {
    apoio: "FOTOGRAFIA documental realista do substantivo dito, luz natural, profundidade de campo, composição calma e crível; lugar, objeto, paisagem ou mapa de satélite sem nomes",
    elemento: null,
    cinema: "plano documental com UM movimento lento de câmera e luz natural (ex.: \"slow aerial drift over a quiet harbor at dawn, soft mist\")",
    exemplos: [
      ["chat", "a laptop on a wooden desk by a window at dusk, the screen softly glowing and unreadable"],
      ["mapa", "an aerial satellite view of a coastline at golden hour"],
    ],
    nunca: ["recorte de objeto", "cartum", "fundo de estúdio colorido", "efeito de partícula"],
  },
  metas: {
    cenaSeg: { padrao: 6, min: 5, max: 8 },
    mudancaACadaSeg: { padrao: 6, min: 4, max: 8 },
    ganchoAteSeg: { padrao: 4, min: 3, max: 6 },
    textoNaTela: { padrao: 0.2, min: 0.1, max: 0.3 },
    rostoNaTela: { padrao: 0.65, min: 0.5, max: 0.8 },
    brollNaTela: { padrao: 0.2, min: 0.12, max: 0.3 },
    elementosPorMinuto: { padrao: 6, min: 4, max: 10 },
    batidasPorMinuto: { padrao: 80, min: 65, max: 95 },
  },
  tempoMorto: "respira",
  som: {
    trilha: "ambiente discreto ou nenhuma por baixo da fala, 65 a 95 batidas por minuto",
    efeitos: [
      { evento: "tarja", som: "nenhum ou um tique suave" },
      { evento: "fusão", som: "nenhum" },
    ],
  },
  layoutsFuturos: ["PIP com um terço livre para o documento ou o dado", "janela que amplia um trecho do documento na tela compartilhada"],
  abertura: {
    tipo: "teaser",
    descricao: "Duas ou três frases calmas e fortes do próprio vídeo, de 3 a 5 s cada, que dizem o que está em jogo, como a chamada de uma reportagem. Sem cortes picados nem flash.",
    momentoSeg: [2.5, 5.5],
    totalAlvoSeg: 11,
    totalMaxSeg: 15,
    ligadaPorPadrao: true,
    passagem: "fusao",
  },
  fecho: "A frase de conclusão em tarja ou citação, com a pessoa em narrador-cheio, e fusão para o fim.",
  legenda: "limpa",
  regras: [
    "Os primeiros 3 s: narrador-cheio com a tarja que apresenta o assunto, OU uma imagem documental de abertura.",
    "Planos de 5 a 8 s; nunca troca nervosa.",
    "Tarja com a frase-chave a cada 8 a 15 s; nunca duas tarjas na mesma cena.",
    "Número dito vira tela de dado com fonte quando a fonte foi dita.",
    "Imagem gerada é documental e realista, nunca cartum, recorte ou estúdio colorido.",
  ],
  exemplos: `{"de":0,"ate":14,"layout":"narrador-cheio","movimento":"zoom-in-lento","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"tarja","texto":"o custo que ninguém mede","rotulo":"O PROBLEMA","zona":"base-esquerda","palavra":4}],"motivo":"apresenta o assunto com credibilidade"}
{"de":15,"ate":24,"layout":"broll-cheio","movimento":"zoom-in-lento","transicao":"fundir","fundo":"escuro","asset":"a1","elementos":[],"motivo":"imagem documental do lugar dito"}
{"de":25,"ate":34,"layout":"cartela","movimento":"estatico","transicao":"corte","fundo":"escuro","elementos":[{"tipo":"numero","valor":30,"sufixo":"%","rotulo":"das usinas","fonte":"ONS","zona":"centro","palavra":27}],"motivo":"o dado dito, com a fonte dita"}`,
  checklist: [
    "Planos médios de 5 a 8 s.",
    "Tarja com chapéu a cada 8 a 15 s.",
    "No máximo 1 punch por minuto.",
    "No máximo 2 elementos por cena.",
    "Nenhum recorte, emoji, carimbo ou papel.",
    "Imagens documentais e realistas.",
  ],
};
