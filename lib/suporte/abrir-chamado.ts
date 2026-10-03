/**
 * ABRIR A JANELA DE AJUDA DE QUALQUER LUGAR DA TELA (02/10/2026).
 *
 * A janela mora uma vez só, no esqueleto da plataforma (components/suporte/
 * ajuda.tsx). Quem quer abri-la já preenchida (o cartão de erro com código,
 * por exemplo) dispara este evento, sem importar a janela e sem prop
 * atravessando a árvore. Módulo puro de navegador: não toca banco.
 */
import type { Categoria } from "@/lib/suporte/regras";

export const EVENTO_DA_AJUDA = "demandou:abrir-chamado";

export type PedidoDeChamado = {
  categoria?: Categoria;
  /** O código de erro que a tela mostrou (VID-402, PUB-MID...). */
  codigo?: string;
  /** A peça do erro, para o servidor montar o diagnóstico. */
  postId?: string;
  /** O vídeo (gravação) do erro, quando a tela sabe qual é. */
  videoId?: string;
  texto?: string;
  /** Chamado quando o chamado é criado, com o protocolo (#0012). */
  aoAbrir?: (protocolo: string) => void;
};

export function abrirChamado(pedido: PedidoDeChamado = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PedidoDeChamado>(EVENTO_DA_AJUDA, { detail: pedido }));
}
