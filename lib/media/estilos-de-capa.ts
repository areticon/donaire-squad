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

export type ExpressaoDaCapa = "confiante" | "serio" | "curioso" | "surpreso" | "preocupado";

export type OpcaoDeCapa = { url: string; frase: string; expressao: ExpressaoDaCapa };

export type CapasDoCompleto = {
  estilo: EstiloDeCapa;
  opcoes: OpcaoDeCapa[];
  /** Índice em `opcoes` da capa que o cliente marcou. */
  escolhida: number;
  geradaEm: string;
};
