/**
 * O estilo da capa (thumbnail) do vídeo completo no YouTube, e o formato das
 * opções guardadas em `VideoJob.capas`.
 *
 * Vive sozinho, sem importar nada, porque a tela (componente de cliente)
 * precisa da lista e dos rótulos, e os módulos que compõem a capa puxam
 * Prisma, sharp e o modelo de imagem, que não podem ir para o navegador.
 *
 * Nasceu em 02/09, quando o Bruno pediu que o cliente escolhesse o estilo da
 * capa do vídeo completo. Cada estilo troca as seções RECORTE E FUNDO e
 * TEXTO do prompt em lib/media/capa-e-titulo.ts; a identidade da pessoa não
 * muda nunca.
 */

export type EstiloDeCapa = "impacto" | "limpo" | "manchete";

export const ESTILOS_DE_CAPA: EstiloDeCapa[] = ["impacto", "limpo", "manchete"];

/** O que a tela mostra ao cliente para cada estilo. */
export const ESTILOS_DE_CAPA_ROTULO: Record<EstiloDeCapa, { rotulo: string; descricao: string }> = {
  impacto: {
    rotulo: "Impacto",
    descricao: "Você recortado sobre um cenário novo, frase enorme com uma palavra em destaque.",
  },
  limpo: {
    rotulo: "Limpo",
    descricao: "A foto real, fundo levemente escurecido, frase curta em letra fina.",
  },
  manchete: {
    rotulo: "Manchete",
    descricao: "Fundo chapado na cor da marca, você de um lado e o título em duas linhas do outro.",
  },
};

export function estiloDeCapaValido(valor: unknown): valor is EstiloDeCapa {
  return typeof valor === "string" && (ESTILOS_DE_CAPA as string[]).includes(valor);
}

/**
 * O CLIMA da capa: a emoção do rosto e a atmosfera da luz, escolhidos pelo
 * cliente. É outra coisa que o estilo: o estilo é a diagramação (recorte,
 * fundo, tipografia); o clima é a cara que a pessoa faz e o tom da imagem.
 *
 * Nasceu em 02/09 de uma queixa do Bruno: "as capas sempre me colocam com
 * uma expressão séria, brava, todas do mesmo jeito, qual o critério?". O
 * critério era do agente que escreve a frase: ele escolhia entre cinco
 * emoções pelo CONTEÚDO do vídeo, e um vídeo sobre dor, mudança e propósito
 * rendia sempre "sério", "preocupado" ou "curioso". Somado a isso, as cinco
 * descrições mandavam "boca FECHADA" e "olhar firme", então até "confiante"
 * saía como um homem sisudo olhando para a câmera. O cliente não tinha como
 * pedir outra coisa.
 *
 * A lista vem dos climas que dominam thumbnail de YouTube (pesquisa de
 * 02/09): alegria e empolgação, confiança e autoridade, seriedade e
 * verdade dura, curiosidade e intriga, surpresa e choque, mistério e
 * suspense, drama e tensão, humor e descontração, provocação e desafio.
 * "automatico" mantém o comportamento antigo, com o agente escolhendo pelo
 * conteúdo, mas agora entre todas as opções e sem o viés de boca fechada.
 */
export type ClimaDaCapa =
  | "automatico"
  | "alegre"
  | "confiante"
  | "serio"
  | "curioso"
  | "surpreso"
  | "misterioso"
  | "dramatico"
  | "divertido"
  | "provocativo";

export const CLIMAS_DE_CAPA: ClimaDaCapa[] = [
  "automatico",
  "alegre",
  "confiante",
  "serio",
  "curioso",
  "surpreso",
  "misterioso",
  "dramatico",
  "divertido",
  "provocativo",
];

/** O que a tela mostra ao cliente para cada clima. */
export const CLIMAS_DE_CAPA_ROTULO: Record<ClimaDaCapa, { rotulo: string; descricao: string }> = {
  automatico: {
    rotulo: "Automático",
    descricao: "Vitor escolhe a emoção pelo que você disse no vídeo. Uma opção afirmativa, outra em pergunta.",
  },
  alegre: {
    rotulo: "Alegre",
    descricao: "Sorriso aberto, luz quente. Para conteúdo leve, boa notícia ou convite.",
  },
  confiante: {
    rotulo: "Confiante",
    descricao: "Sorriso discreto e olhar firme, luz limpa. A cara de quem sabe do que fala.",
  },
  serio: {
    rotulo: "Sério",
    descricao: "Sem sorrir, olhar direto, contraste alto. Para erro, perda ou verdade dura.",
  },
  curioso: {
    rotulo: "Curioso",
    descricao: "Sobrancelha erguida, cabeça inclinada. Para pergunta ou promessa de revelar algo.",
  },
  surpreso: {
    rotulo: "Surpreso",
    descricao: "Olhos bem abertos, boca entreaberta. Para número que choca ou fato contraintuitivo.",
  },
  misterioso: {
    rotulo: "Misterioso",
    descricao: "Meia-luz, fundo escuro, olhar intenso. Para segredo, bastidor ou o que ninguém conta.",
  },
  dramatico: {
    rotulo: "Dramático",
    descricao: "Tensão no rosto, luz fria e dura, sombras fortes. Para crise, risco ou virada.",
  },
  divertido: {
    rotulo: "Divertido",
    descricao: "Riso solto, cores vivas. Para humor, história engraçada ou reação.",
  },
  provocativo: {
    rotulo: "Provocativo",
    descricao: "Meio sorriso de canto, queixo erguido, olhar desafiador. Para opinião polêmica.",
  },
};

export function climaDeCapaValido(valor: unknown): valor is ClimaDaCapa {
  return typeof valor === "string" && (CLIMAS_DE_CAPA as string[]).includes(valor);
}

export type ExpressaoDaCapa =
  | "confiante"
  | "serio"
  | "curioso"
  | "surpreso"
  | "preocupado"
  | "alegre"
  | "misterioso"
  | "dramatico"
  | "divertido"
  | "provocativo";

export type OpcaoDeCapa = { url: string; frase: string; expressao: ExpressaoDaCapa };

export type CapasDoCompleto = {
  estilo: EstiloDeCapa;
  /** O clima pedido quando estas opções foram geradas; ausente nas antigas. */
  clima?: ClimaDaCapa;
  opcoes: OpcaoDeCapa[];
  /** Índice em `opcoes` da capa que o cliente marcou. */
  escolhida: number;
  geradaEm: string;
};
