import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * EXPLICATIVO EDITORIAL, ESTILO VOX (01/10/2026).
 *
 * O único estilo que o Bruno aprovou ("o efeito Vox está bom"). Por isso o
 * prompt do diretor do Vox continua o texto de sempre (SISTEMA_COLAGEM em
 * diretor-de-montagem.ts, `promptProprio: "colagem-legado"`): mexer no que
 * funciona sem prova seria regressão. A bíblia em dados entra para o que é
 * novo para todos (metas, revisor, abertura por estilo, perfil do projeto) e
 * mede o que o Vox já faz: no corte de 48 s aprovado (cmuon0yxo, 30/09), 13
 * cenas, 37 elementos (46 por minuto), 20 recortes, 19 imagens, fundo de papel.
 * Fonte das medidas originais: docs/overlays/BIBLIA-DE-ESTILO.md.
 */
export const VOX: BibliaDoEstilo = {
  id: "vox",
  nome: "Explicativo editorial (estilo Vox)",
  completa: true,
  promptProprio: "colagem-legado",
  kit: "colagem",
  kitFuturo: "colagem",
  essencia:
    "Explicar com colagem editorial: papel, recortes em gravura, marca-texto na cor da marca nas frases-chave, letras de revista, fotos coladas com fita. O ritmo é guiado pela narração, sem pressa, mas o quadro nunca para: algo novo entra a cada 2 s, cada coisa na palavra que a motivou.",
  referencias: [
    "Vox: Why do we have grass lawns?, Why it's hard for Americans to retire, How to balance paying debt vs. investing (medidos em 25/08, docs/overlays/BIBLIA-DE-ESTILO.md).",
    "Corte aprovado pelo Bruno em 30/09 (cmuon0yxo): 46 elementos por minuto, 20 recortes em 48 s.",
  ],
  tipografia: {
    titulo: "letras recortadas de revista (título) e grotesca condensada em caixa alta",
    texto: "sem serifa bold escura sobre papel claro",
    numero: "número grande na cor de destaque com rótulo pequeno em caixa alta",
    legenda: "frase curta em tira de papel clara, texto escuro, a palavra falada acende na cor da marca",
    regras: ["Texto escuro sobre papel; a cor da marca só no marca-texto e nas formas.", "Rótulo pequeno em caixa alta espaçada."],
  },
  paleta: {
    papeis: "Fundo neutro de PAPEL claro; o ACENTO da marca só em marca-texto, formas recortadas e fita; o ESCURO só em tinta, fotos em preto e branco e sombra.",
    fundosMax: { escuro: 0.15 },
    regras: ["Uma cor de destaque só (a da marca).", "Fotos e gravuras em preto e branco.", "Nunca fundo escuro como base."],
  },
  movimento: {
    camera: "Aproximação lenta nas frases importantes, afastamento para abrir assunto, punch só na palavra forte; o mural inteiro anda junto, com leve deriva.",
    entradas: "Recortes CAEM e se acumulam, textos deslizam, a fita estica depois que o papel pousa; tudo respira enquanto está na tela.",
    punchPorMinuto: [2, 6],
  },
  transicoes: [
    { id: "corte", porMinuto: [6, 14], quando: "a base, na narração" },
    { id: "folha-de-papel", porMinuto: [2, 4], quando: "troca de bloco" },
    { id: "deslize", porMinuto: [1, 3], quando: "empurrão de colagem" },
    { id: "flash", porMinuto: [1, 3], quando: "revelação e cena de cinema" },
  ],
  layouts: [
    { id: "narrador-canto", fatia: [0.2, 0.35], quando: "conceito a ilustrar, colagem grande em cima" },
    { id: "narrador-na-foto", fatia: [0.05, 0.15], quando: "apresentar quem fala, prova pessoal" },
    { id: "narrador-recortado", fatia: [0.08, 0.2], quando: "troca de fundo e tom de revista" },
    { id: "broll-cheio", fatia: [0.15, 0.3], quando: "cena de cinema do substantivo dito, 2 a 4 s" },
    { id: "narrador-cheio", fatia: [0.1, 0.3], quando: "emoção, confissão, virada" },
    { id: "tela-dividida", fatia: [0, 0.1], quando: "contraste" },
    { id: "cartela", fatia: [0, 0.08], quando: "título em letras de revista ou gráfico" },
  ],
  elementos: {
    permitidos: [
      { nome: "recorte", quando: "o objeto de cada substantivo dito, 6 a 12 por minuto", porMinuto: [6, 20] },
      { nome: "marca-texto", quando: "a frase-chave falada", porMinuto: [6, 12] },
      { nome: "letras-revista", quando: "título de bloco", porMinuto: [2, 5] },
      { nome: "carimbo", quando: "veredito curto", porMinuto: [1, 4] },
      { nome: "tarja", quando: "frase dita digitada", porMinuto: [0, 3] },
      { nome: "numero", quando: "número dito" },
      { nome: "barras", quando: "comparação dita" },
      { nome: "seta-circulo", quando: "apontar na colagem" },
      { nome: "icone", quando: "marca citada" },
    ],
    proibidos: ["fundo escuro como base", "foto de produto ou render 3D", "texto escrito dentro da imagem gerada"],
    maxPorCena: 7,
  },
  imagens: {
    apoio: "colagem de papel com o substantivo dito (gravuras e recortes em preto e branco sobre papel claro ou kraft, uma cor de destaque)",
    elemento: "gravura de enciclopédia recortada com borda branca",
    cinema: "cena de cinema de 35 mm, luz natural, uma ação simples ligada à palavra concreta",
    exemplos: [
      ["chat", "an old computer terminal window cut from paper, with blank speech bubbles"],
      ["contexto", "a stack of manila folders and index cards"],
    ],
    nunca: ["fundo escuro", "foto de produto", "render 3D"],
  },
  metas: {
    cenaSeg: { padrao: 5, min: 4, max: 7 },
    mudancaACadaSeg: { padrao: 2, min: 1.5, max: 3 },
    ganchoAteSeg: { padrao: 2, min: 1.5, max: 3 },
    textoNaTela: { padrao: 0.4, min: 0.25, max: 0.55 },
    rostoNaTela: { padrao: 0.45, min: 0.3, max: 0.6 },
    brollNaTela: { padrao: 0.25, min: 0.15, max: 0.35 },
    elementosPorMinuto: { padrao: 40, min: 28, max: 55 },
    batidasPorMinuto: { padrao: 100, min: 88, max: 112 },
  },
  tempoMorto: "medio",
  som: {
    trilha: "eletrônica discreta e pulsante, 88 a 112 batidas por minuto",
    efeitos: [
      { evento: "folha de papel", som: "papel passando" },
      { evento: "recorte caindo", som: "papel pousando" },
      { evento: "marca-texto", som: "risco de marcador" },
      { evento: "carimbo", som: "batida seca de carimbo" },
    ],
  },
  layoutsFuturos: ["janela que amplia um trecho de documento com marca-texto", "PIP com um terço livre em foto colada"],
  abertura: {
    tipo: "pergunta",
    descricao: "A PERGUNTA que o vídeo responde (dita na fala) e dois ou três momentos curtos que mostram o que está em jogo. Ritmo de explicador, não de trailer.",
    momentoSeg: [1.5, 6.5],
    totalAlvoSeg: 12,
    totalMaxSeg: 16,
    ligadaPorPadrao: true,
    passagem: "folha-de-papel",
  },
  fecho: "A resposta da pergunta em marca-texto sobre papel, e a chamada dita pela pessoa no narrador-cheio.",
  legenda: "papel",
  regras: [
    "Os primeiros 2 s: narrador-na-foto com 2 a 3 recortes caindo, OU letras de revista com a promessa, OU uma cena de cinema.",
    "Numa cena de 4 s ou mais, algo novo entra pelo menos a cada 2 s.",
    "Cada recorte e cada texto na SUA palavra, nunca dois na mesma.",
    "Texto só com palavra dita e nunca o contrário da fala.",
  ],
  exemplos: "",
  checklist: [
    "Gancho até 2 s com recortes, letras de revista ou cena de cinema.",
    "Algo novo a cada 2 s nas cenas longas.",
    "Fundo de papel como base; escuro em no máximo 15% das cenas com fundo.",
    "Pelo menos 28 elementos por minuto.",
    "Recortes de substantivos realmente ditos.",
    "Texto só com palavra dita, sem contradizer a fala.",
  ],
};
