import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * ALTA RETENÇÃO, ESTILO MRBEAST (01/10/2026).
 *
 * O que saiu no vídeo do Bruno de 01/10 (cmupyrkqv, corte 0 de 100 s): 26 de
 * 33 cenas em fundo ESCURO, 16 elementos por minuto, 1 recorte, nenhum som.
 * Era o prompt do Hormozi com outro nome. O MrBeast é o oposto do escuro:
 * tela clara e saturada, tudo grande, algo novo a cada 1,5 a 3 s, efeito sonoro
 * em cada corte, o que está em jogo sempre visível. Esta bíblia é a medida
 * dessa linguagem em regras que o diretor segue e o revisor cobra.
 */
export const MRBEAST: BibliaDoEstilo = {
  id: "mrbeast",
  nome: "Alta retenção (estilo MrBeast)",
  completa: true,
  kit: "impacto",
  kitFuturo: "retencao",
  essencia:
    "Entretenimento de alta retenção: a promessa e o que está em jogo aparecem no primeiro segundo e meio, e a cada 1,5 a 3 s algo muda na tela (corte com zoom, palavra gigante, ícone, número, imagem). A tela é CLARA e SATURADA, com a cor da marca chapada ocupando o fundo; nada de clima escuro. Tudo é grande e legível num celular a um braço de distância.",
  referencias: [
    "Canal MrBeast e a escola de retenção do YouTube (observação de cortes de 2024 a 2026): cortes de 1,5 a 3 s, zoom alternado a cada corte, texto enorme com contorno, cor saturada, efeito sonoro em cada transição.",
    "Ficha 16 de docs/estilos-de-edicao-de-video.md (40 a 60 cortes por minuto, saturado ao máximo, efeitos sonoros em cada corte).",
  ],
  tipografia: {
    titulo: "sem serifa pesada e limpa (Archivo Black) em CAIXA ALTA, contorno preto fino e sombra macia; a última palavra na cor de destaque",
    texto: "sem serifa pesada (Archivo Black) em caixa alta",
    numero: "Anton enorme na cor de destaque, contorno preto, contando até o valor em 0,6 s",
    legenda: "palavra a palavra, duas por vez, grande, a palavra falada acende na cor da marca",
    regras: ["Nada de serifa nem de letra fina.", "Tipografia limpa e pesada (Archivo Black), branca com contorno fino e sombra macia, a palavra-chave na cor da marca; sem letra torta estourando.", "No máximo 3 palavras por texto, e poucos textos: 2 a 4 por minuto."],
  },
  paleta: {
    papeis: "O ACENTO da marca é o fundo chapado (\"marca\") das cartelas e do narrador recortado, saturado. O ESCURO da marca só aparece em contorno, sombra e no máximo em um fundo a cada quatro. O CLARO é o respiro entre dois fundos de cor.",
    fundosMax: { escuro: 0.3 },
    regras: ["Fundo \"marca\" é a base desta linguagem; \"escuro\" só para contraste pontual.", "Nunca dois fundos escuros seguidos.", "Imagens geradas claras e saturadas, nunca em fundo preto."],
  },
  movimento: {
    camera: "PUNCH (zoom de soco) é o movimento principal: na palavra forte, em 60% a 80% das cenas, alternando o enquadramento a cada corte (como o corte em salto com zoom). Zoom lento quase nunca.",
    entradas: "Tudo ESTOURA: palavras e ícones entram com escala passando do tamanho e assentando, um por vez, cada um na sua palavra.",
    punchPorMinuto: [12, 24],
  },
  transicoes: [
    { id: "corte", porMinuto: [10, 30], quando: "a base: corte seco, sempre com mudança de enquadramento" },
    { id: "deslize", porMinuto: [4, 8], quando: "chicote na troca de assunto ou de bloco" },
    { id: "flash", porMinuto: [3, 6], quando: "revelação, número, virada" },
  ],
  layouts: [
    { id: "narrador-cheio", fatia: [0.4, 0.55], quando: "a base, sempre com punch na palavra forte e uma palavra gigante ou ícone" },
    { id: "narrador-recortado", fatia: [0.15, 0.25], quando: "ênfase e lista: a pessoa recortada sobre a COR DA MARCA chapada" },
    { id: "cartela", fatia: [0.08, 0.15], quando: "a palavra ou o número da promessa em tela cheia sobre a cor da marca, 1,5 a 2,5 s" },
    { id: "broll-cheio", fatia: [0.1, 0.2], quando: "o objeto ou a ação dita, 1,5 a 2,5 s, clara e saturada" },
    { id: "tela-dividida", fatia: [0, 0.08], quando: "comparação: errado e certo, antes e depois, com x e check" },
    { id: "narrador-canto", fatia: [0, 0.08], quando: "logo depois de um broll-cheio, com a mesma imagem em cima" },
    { id: "pip-terco", fatia: [0, 0.1], quando: "a PROVA: o objeto, o número ou a imagem grande nos dois terços e você no terço, entrando de lado" },
  ],
  elementos: {
    permitidos: [
      { nome: "palavra", quando: "SÓ a palavra da promessa, do número ou da virada, nunca uma a cada frase (02/10: texto demais ficou amador); limpa e legível", porMinuto: [2, 4] },
      { nome: "emoji", quando: "o ícone que representa a palavra (dinheiro, relógio, fogo, check, x), só onde ajuda a entender", porMinuto: [1, 4] },
      { nome: "numero", quando: "TODO número dito vira número enorme", porMinuto: [0, 6] },
      { nome: "seta-circulo", quando: "apontar ou circular o que importa numa imagem ou no rosto", porMinuto: [2, 4] },
      { nome: "recorte-pop", quando: "o objeto do substantivo dito, estourando ao lado da pessoa", porMinuto: [3, 6] },
      { nome: "destaque", quando: "a frase da promessa ou da virada, uma a cada 20 a 30 s", porMinuto: [1, 3] },
      { nome: "barras", quando: "só quando a fala compara dois ou três números", porMinuto: [0, 1] },
      { nome: "icone", quando: "marca citada, na palavra em que é dita" },
    ],
    proibidos: ["papel, colagem, fita adesiva, letras de revista, carimbo, textura vintage", "fundo escuro em duas cenas seguidas", "cena de 4 s ou mais sem nada novo", "imagem gerada em fundo preto ou com clima sombrio"],
    maxPorCena: 3,
  },
  imagens: {
    apoio: "UM objeto herói do substantivo dito, ENORME no quadro, cores saturadas e luz clara de estúdio, fundo limpo e luminoso na cor da marca ou branco, sombra curta; leitura instantânea num celular",
    elemento: "UM objeto em ilustração chapada e brilhante estilo adesivo, contorno escuro grosso, cores saturadas (ex.: \"trophy\", \"stack of cash\", \"alarm clock\", \"rocket\")",
    cinema: "UMA ação rápida e exagerada, luz clara e cor saturada, câmera rápida (ex.: \"a mountain of gold coins pouring onto a bright table in slow motion, vivid saturated colors, bright studio light\")",
    exemplos: [
      ["dinheiro", "a huge neat stack of banknotes on a bright solid colored background, bright even studio light, saturated colors"],
      ["tempo", "a giant red alarm clock ringing, bright white background, saturated colors, playful energy"],
      ["barco", "a small wooden boat on vivid turquoise water seen from above, bright sunny light, saturated colors"],
    ],
    nunca: ["fundo preto ou escuro", "clima dramático sombrio", "papel, colagem ou gravura"],
  },
  metas: {
    cenaSeg: { padrao: 2.2, min: 1.5, max: 3.2 },
    mudancaACadaSeg: { padrao: 2, min: 1.5, max: 3 },
    ganchoAteSeg: { padrao: 1.5, min: 1, max: 2 },
    textoNaTela: { padrao: 0.25, min: 0.12, max: 0.4 },
    rostoNaTela: { padrao: 0.6, min: 0.45, max: 0.75 },
    brollNaTela: { padrao: 0.15, min: 0.08, max: 0.25 },
    elementosPorMinuto: { padrao: 10, min: 6, max: 16 },
    batidasPorMinuto: { padrao: 128, min: 115, max: 145 },
  },
  tempoMorto: "agressivo",
  som: {
    trilha: "energética, 120 a 145 batidas por minuto, sobe no gancho e na revelação",
    efeitos: [
      { evento: "corte com punch", som: "impacto grave curto" },
      { evento: "deslize", som: "whoosh rápido" },
      { evento: "palavra gigante e ícone", som: "pop" },
      { evento: "número contando", som: "tique de contagem e ding no fim" },
      { evento: "flash ou revelação", som: "riser curto antes e impacto" },
      { evento: "check e x", som: "acerto e erro de game show" },
    ],
  },
  layoutsFuturos: ["PIP com um terço livre (pessoa num terço, o objeto ou a prova nos outros dois)", "elementos entrando pelos lados para preencher a tela", "janela que amplia um trecho da tela com borda grossa e sombra dura"],
  abertura: {
    tipo: "trailer",
    descricao: "Os MELHORES MOMENTOS do próprio vídeo, cada um uma FRASE INTEIRA e curta (começa no início da frase e termina no ponto final), do mais forte ao menos forte, com a promessa ou o número primeiro. É o trailer: quem chega decide em 2 s se fica.",
    momentoSeg: [1.5, 6.5],
    totalAlvoSeg: 16,
    totalMaxSeg: 22,
    ligadaPorPadrao: true,
    passagem: "flash-e-whoosh",
  },
  fecho: "Chamada direta em PALAVRA gigante na cor da marca (a ação, como \"COMENTA\" ou \"SEGUE\") com seta, sem fade lento: o vídeo termina em alta.",
  legenda: "destaque",
  regras: [
    "Os primeiros 1,5 s prendem: narrador-cheio com punch e a PALAVRA gigante da promessa, OU cartela com o número ou a palavra da promessa sobre a cor da marca.",
    "Nenhuma janela de 3 s sem mudança na tela, do primeiro ao último segundo.",
    "Fundo: \"marca\" é a base. \"escuro\" em no máximo 1 de cada 4 cenas com fundo, e nunca em duas seguidas.",
    "Toda cena de narrador-cheio tem punch na palavra forte (\"movimentoNa\"); texto na tela só na promessa, no número e na virada, de 2 a 4 por minuto, nunca um por frase.",
    "Todo número dito vira número enorme; toda comparação vira tela dividida ou x e check.",
    "B-roll e cartela curtos: 1,5 a 2,5 s, nunca mais.",
    "Imagens geradas CLARAS e SATURADAS, objeto herói enorme; nunca fundo escuro.",
  ],
  exemplos: `{"de":0,"ate":4,"layout":"narrador-cheio","movimento":"punch","movimentoNa":2,"transicao":"corte","fundo":"marca","elementos":[{"tipo":"palavra","texto":"20 DIAS","zona":"centro","palavra":2}],"motivo":"promessa no primeiro segundo e meio"}
{"de":5,"ate":9,"layout":"cartela","movimento":"punch","movimentoNa":6,"transicao":"flash","fundo":"marca","elementos":[{"tipo":"numero","valor":12,"sufixo":"meses","rotulo":"virou 20 dias","zona":"centro","palavra":6}],"motivo":"o número dito em tela cheia, sobre a cor da marca"}
{"de":10,"ate":15,"layout":"narrador-recortado","movimento":"punch","movimentoNa":12,"transicao":"deslize","fundo":"marca","elementos":[{"tipo":"emoji","nome":"dinheiro","zona":"meio-direita","palavra":11},{"tipo":"palavra","texto":"LUCRO","zona":"base","palavra":13}],"motivo":"lista do que muda, energia alta"}`,
  checklist: [
    "Gancho visual (palavra gigante, número ou cartela) até 1,5 s.",
    "Nenhuma janela de 3 s sem mudança (o punch e o corte de câmera contam).",
    "Fundo escuro em no máximo 30% das cenas com fundo, e nunca dois seguidos.",
    "De 6 a 16 elementos por minuto, com no máximo 4 textos por minuto.",
    "Punch na palavra forte na maioria das cenas de narrador-cheio.",
    "Nenhum papel, colagem, carimbo ou letra de revista.",
    "Descrições de imagem claras e saturadas, sem fundo escuro.",
    "Palavra gigante e destaque só com palavras ditas, sem contradizer a fala.",
  ],
};
