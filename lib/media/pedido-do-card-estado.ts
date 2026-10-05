/**
 * O PEDIDO DO CHAT DO CARD, do lado que a TELA pode ler (05/10).
 *
 * Gêmea pura de `lib/media/pedido-do-card.ts`, que escreve e puxa o banco: o
 * componente cliente lê o andamento daqui e nunca importa módulo de banco.
 *
 * Por que existe: o dono pediu no card do Paulo "tira o 'minha preta' e refaz
 * a arte com a cor escarlate", o spinner rodou minutos presos à requisição, ele
 * fechou o modal, o chat sumiu, e mandou de novo. O pedido agora é uma TAREFA
 * gravada no card (metadata.pedidoDoChat): roda no servidor depois da
 * resposta, cada etapa grava o seu estado, e a tela consulta. Fechar o modal
 * não perde nada, e mandar de novo enquanto há tarefa em curso não duplica.
 */

export type EstadoDaEtapa = "esperando" | "fazendo" | "feito" | "falhou";

export interface EtapaDoPedido {
  chave: string;
  /** Em português de gente: "reescrevendo o texto", "lâmina 2 de 3". */
  rotulo: string;
  estado: EstadoDaEtapa;
  /** O que saiu ou o que falhou, em palavras simples. */
  detalhe?: string;
}

export interface PedidoDoCard {
  id: string;
  mensagem: string;
  estado: "fazendo" | "feito" | "falhou";
  etapas: EtapaDoPedido[];
  /** ISO. */
  desde: string;
  /** ISO. Cada etapa atualiza; tarefa sem notícia há muito tempo morreu. */
  atualizadoEm: string;
  /** O agente que responde no chat. */
  agenteNome?: string;
}

/** Sem notícia há mais que isto, a função que fazia o pedido morreu no meio. */
export const PEDIDO_PARADO_MS = 6 * 60_000;

/**
 * O rótulo que a tela mostra: no gerúndio enquanto faz ("refazendo a lâmina 2
 * de 3"), no particípio quando acabou ("lâmina 2 de 3 refeita").
 */
export function rotuloDaEtapa(e: EtapaDoPedido): string {
  let r = e.rotulo;
  if (e.estado === "feito") {
    r = r
      .replace(/^entendendo o pedido$/, "pedido entendido")
      .replace(/^reescrevendo o texto$/, "texto reescrito")
      .replace(/^refazendo a (lâmina .+)$/, "$1 refeita")
      .replace(/^refazendo a arte$/, "arte refeita")
      .replace(/^refazendo o infográfico$/, "infográfico refeito")
      .replace(/^mudando a data$/, "data mudada")
      .replace(/^mudando as redes$/, "redes ajustadas");
  }
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** O pedido gravado no card, se houver. */
export function lerPedidoDoCard(metadata: unknown): PedidoDoCard | null {
  const p = ((metadata ?? {}) as Record<string, unknown>).pedidoDoChat as PedidoDoCard | undefined;
  if (!p || typeof p.id !== "string" || !Array.isArray(p.etapas)) return null;
  return p;
}

/** O pedido que ainda está sendo feito de verdade (não parado, não terminado). */
export function pedidoEmCurso(metadata: unknown, agora = Date.now()): PedidoDoCard | null {
  const p = lerPedidoDoCard(metadata);
  if (!p || p.estado !== "fazendo") return null;
  const idade = agora - new Date(p.atualizadoEm).getTime();
  if (!Number.isFinite(idade) || idade > PEDIDO_PARADO_MS) return null;
  return p;
}

/** O pedido que ficou "fazendo" sem notícia: a tela diz que parou. */
export function pedidoParado(metadata: unknown, agora = Date.now()): PedidoDoCard | null {
  const p = lerPedidoDoCard(metadata);
  if (!p || p.estado !== "fazendo") return null;
  return pedidoEmCurso(metadata, agora) ? null : p;
}
