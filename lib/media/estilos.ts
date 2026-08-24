/**
 * Os estilos de edição, escolhidos uma vez por projeto.
 *
 * Ideia do Bruno em 24/08: "dar a opção para o usuário mudar o tipo de filtro,
 * efeito, fontes dos textos, talvez isso vir até antes, ele escolhe se o vídeo é
 * dramático, mais acelerado, mais animado, mais sério, e aí isso muda o tipo da
 * legenda, do áudio, a velocidade, a precisão dos cortes".
 *
 * Ele está certo sobre a ORDEM: o estilo precisa ser conhecido antes da edição,
 * porque decide legenda, ritmo e som. E fica no projeto, e não no upload, porque
 * canal com estilo diferente a cada vídeo não constrói reconhecimento.
 *
 * ## O que a pesquisa fixou, e o que ficou por conta do estilo
 *
 * Pesquisado em 24/08, e vale para TODOS os estilos, então não é opção:
 *
 * - **85% assiste sem som.** Legenda não é enfeite, é o canal principal.
 * - **Palavra a palavra é o padrão de 2026**, com a palavra falada em destaque.
 * - **Alto contraste**: branco com contorno preto, ou amarelo com contorno
 *   preto. Qualquer outra combinação perde legibilidade sobre imagem variável.
 * - **Terço inferior central.** Acima disso briga com o rosto, abaixo some sob
 *   a interface do aplicativo.
 * - **Mudança visual a cada 1,5 a 2 segundos** é o alvo de retenção.
 *
 * O que varia por estilo é o RITMO, o peso da tipografia e a agressividade do
 * movimento. O que não varia é a legibilidade.
 */

export type NomeDoEstilo = "dramatico" | "acelerado" | "serio" | "animado";

export type Estilo = {
  nome: NomeDoEstilo;
  /** Como aparece na tela de escolha. */
  rotulo: string;
  /** Uma frase dizendo para que serve, na hora de escolher. */
  paraQue: string;

  legenda: {
    /** Fonte, com alternativa: contêiner sem a fonte instalada cai na segunda. */
    fonte: string;
    /** Corpo em pixels, num quadro de 1080x1920. */
    corpo: number;
    /** Cor do texto normal, em BGR do ASS (que é invertido em relação ao web). */
    cor: string;
    /** Cor da palavra que está sendo falada agora. */
    corDoDestaque: string;
    /** Espessura do contorno. Abaixo de 3 some sobre fundo claro. */
    contorno: number;
    /** Quantas palavras por vez na tela. */
    palavrasPorVez: number;
    /** Distância do rodapé, em pixels. */
    margemDeBaixo: number;
    /** Caixa alta muda muito o peso percebido. */
    caixaAlta: boolean;
  };

  ritmo: {
    /** Segundos entre um movimento de câmera e o próximo. */
    intervaloDeMovimento: number;
    /** Quanto o zoom avança em cada movimento, em fração. */
    forcaDoZoom: number;
  };

  som: {
    /** Volume da trilha por baixo da voz, em fração. */
    volumeDaTrilha: number;
    /** Quanto a trilha abaixa quando a pessoa fala. */
    abaixarSobAVoz: number;
  };

  /**
   * Quanto respiro fica em volta da fala nos cortes, em segundos.
   *
   * Estilo acelerado corta rente, dramático deixa a pausa respirar. É o
   * parâmetro que o Bruno chamou de "precisão dos cortes".
   */
  respiroDoCorte: number;
};

/**
 * Distância do rodapé até a legenda, em pixels de um quadro de 1920.
 *
 * A pesquisa manda pôr legenda no terço inferior central, e a razão dela é
 * desviar do rosto e da interface do aplicativo. Nesta composição o rosto ESTÁ
 * no terço inferior, porque a pessoa recortada fica encostada na base.
 *
 * Medido no corte real em 24/08: a silhueta ocupa de y=1183 a y=1870. Com 420
 * de margem a legenda cai em y≈1500, em cima da boca. Com 800 ela pousa logo
 * acima da cabeça, que é onde o olho já está indo, e ainda desvia da interface
 * do TikTok e do Reels, que vive embaixo e à direita.
 *
 * Ou seja: obedece à INTENÇÃO da regra (não cobrir o rosto, não sumir sob a
 * interface) em vez de obedecer ao número dela.
 */
const BASE_LEGENDA = {
  contorno: 4,
  margemDeBaixo: 800,
} as const;

export const ESTILOS: Record<NomeDoEstilo, Estilo> = {
  dramatico: {
    nome: "dramatico",
    rotulo: "Dramático",
    paraQue: "História pessoal, virada, confissão. Ritmo lento, deixa a frase pousar.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Georgia,Times New Roman,serif",
      corpo: 62,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H0060C0FF", // âmbar quente
      // Três palavras por vez, e não uma: no ritmo lento, palavra solta piscando
      // briga com a fala em vez de acompanhar.
      palavrasPorVez: 3,
      caixaAlta: false,
    },
    ritmo: { intervaloDeMovimento: 4, forcaDoZoom: 0.03 },
    som: { volumeDaTrilha: 0.18, abaixarSobAVoz: 0.6 },
    // Meio segundo de respiro: em história pessoal a pausa É conteúdo, e cortar
    // rente transforma emoção em pressa.
    respiroDoCorte: 0.5,
  },

  acelerado: {
    nome: "acelerado",
    rotulo: "Acelerado",
    paraQue: "Dica, lista, opinião forte. Corte curto, palavra a palavra, sem sobra.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Impact,Arial Black,sans-serif",
      corpo: 76,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H0000E5FF", // amarelo, o par de maior contraste da pesquisa
      palavrasPorVez: 1,
      caixaAlta: true,
    },
    // 1,6s está dentro da faixa de 1,5 a 2 que a pesquisa aponta como alvo.
    ritmo: { intervaloDeMovimento: 1.6, forcaDoZoom: 0.08 },
    som: { volumeDaTrilha: 0.28, abaixarSobAVoz: 0.5 },
    respiroDoCorte: 0.08,
  },

  serio: {
    nome: "serio",
    rotulo: "Sério e técnico",
    paraQue: "Autoridade, dado, análise. Quase sem efeito, para o argumento mandar.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Arial,Helvetica,sans-serif",
      corpo: 58,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H00F0F0F0", // quase sem destaque: aqui ele distrairia
      palavrasPorVez: 4,
      caixaAlta: false,
      contorno: 3,
    },
    ritmo: { intervaloDeMovimento: 6, forcaDoZoom: 0.02 },
    som: { volumeDaTrilha: 0.12, abaixarSobAVoz: 0.75 },
    respiroDoCorte: 0.3,
  },

  animado: {
    nome: "animado",
    rotulo: "Animado e leve",
    paraQue: "Bastidor, humor, conteúdo descontraído. Cor forte e movimento solto.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Verdana,Trebuchet MS,sans-serif",
      corpo: 70,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H00FF66CC", // rosa
      palavrasPorVez: 2,
      caixaAlta: true,
      contorno: 5,
    },
    ritmo: { intervaloDeMovimento: 2.2, forcaDoZoom: 0.06 },
    som: { volumeDaTrilha: 0.3, abaixarSobAVoz: 0.45 },
    respiroDoCorte: 0.15,
  },
};

/**
 * O estilo do projeto, com queda para o acelerado.
 *
 * Acelerado e não dramático como padrão: ele é o que a pesquisa mostra
 * funcionando na maior variedade de conteúdo, e quem não escolheu estilo
 * provavelmente também não pensou no ritmo.
 */
export function estiloDoProjeto(nome: string | null | undefined): Estilo {
  const chave = (nome ?? "").trim().toLowerCase() as NomeDoEstilo;
  return ESTILOS[chave] ?? ESTILOS.acelerado;
}

/** Os quatro, para montar a tela de escolha sem repetir a lista. */
export const LISTA_DE_ESTILOS = Object.values(ESTILOS);
