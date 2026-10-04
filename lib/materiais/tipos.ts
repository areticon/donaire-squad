/**
 * A BIBLIOTECA DE MATERIAIS DO CLIENTE: o que é puro (03/10/2026).
 *
 * Sem banco e sem Node: a tela importa daqui as etiquetas, os rótulos e os
 * limites do envio, e o servidor usa as mesmas regras. Quem precisa do banco
 * vai em lib/materiais/servidor.ts.
 */

export const ETIQUETAS = ["pessoa", "equipe", "produto", "local", "bastidor", "documento"] as const;
export type Etiqueta = (typeof ETIQUETAS)[number];

export const ROTULO_DA_ETIQUETA: Record<Etiqueta, string> = {
  pessoa: "Você",
  equipe: "Equipe",
  produto: "Produto",
  local: "Local",
  bastidor: "Bastidor",
  documento: "Documento",
};

export const DICA_DA_ETIQUETA: Record<Etiqueta, string> = {
  pessoa: "Foto sua: vira arte com você em destaque e o título atrás",
  equipe: "Gente do time trabalhando",
  produto: "O que você vende",
  local: "Escritório, loja, consultório, fachada",
  bastidor: "O dia a dia, o processo",
  documento: "Print, papel, tela: não entra em arte",
};

export type TipoDeMaterial = "foto" | "video";

/** O teto por arquivo. O total da conta segue o armazenamento do plano. */
export const LIMITES_DO_MATERIAL = {
  foto: { maxBytes: 25 * 1024 * 1024, tipos: ["image/jpeg", "image/png", "image/webp"] },
  // Vídeo curto (bastidor, produto): até 3 min e 400 MB, o que um celular em 4K grava em ~1 min.
  video: { maxBytes: 400 * 1024 * 1024, maxSegundos: 180, tipos: ["video/mp4", "video/quicktime", "video/webm"] },
  miniatura: { maxBytes: 4 * 1024 * 1024, tipos: ["image/jpeg"] },
  /** Quantos arquivos de uma vez na tela. */
  porEnvio: 20,
} as const;

/** O material como a tela recebe (sem URL de Blob: a imagem vem pela rota do projeto). */
export interface MaterialNaTela {
  id: string;
  tipo: TipoDeMaterial;
  nome: string | null;
  etiquetas: Etiqueta[];
  etiquetasEditadas: boolean;
  descricao: string | null;
  qualidade: string | null;
  luz: string | null;
  orientacao: string | null;
  temRosto: boolean;
  status: "analisando" | "pronto" | "falhou";
  duracaoSec: number | null;
  largura: number | null;
  altura: number | null;
  usos: number;
  temRecorte: boolean;
  createdAt: string;
}

export function orientacaoDe(largura?: number | null, altura?: number | null): "vertical" | "horizontal" | "quadrada" | null {
  if (!largura || !altura) return null;
  const r = largura / altura;
  if (r > 1.1) return "horizontal";
  if (r < 0.9) return "vertical";
  return "quadrada";
}

export function ehEtiqueta(x: unknown): x is Etiqueta {
  return typeof x === "string" && (ETIQUETAS as readonly string[]).includes(x);
}
