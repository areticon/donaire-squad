/**
 * A VERA GERENTE (04/10/2026): o que a tela e o servidor combinam entre si.
 *
 * Pedido do Bruno: "eu posso pedir o que eu quiser e ela aplica, ela é a
 * gerente". Até aqui a conversa com a Vera só respondia; agora ela age no
 * projeto por ferramentas (lib/vera/ferramentas-da-gerente.ts), e todo pedido
 * que muda alguma coisa vira um PEDIDO com a lista do que muda, o antes e o
 * depois de cada item, quem pediu e como desfazer (lib/vera/pedidos.ts).
 *
 * Puro de propósito: o componente da conversa importa daqui, e componente de
 * cliente nunca importa módulo de banco.
 */

export const ID_DA_VERA = "vera-veredito";

/** O evento que abre a conversa com a Vera de qualquer canto da tela. */
export const EVENTO_ABRIR_VERA = "demandou:abrir-vera";

/** Disparado quando um pedido da Vera foi gravado ou desfeito, para as telas abertas relerem. */
export const EVENTO_PROJETO_MUDOU = "demandou:projeto-mudou";

export type EstadoDoPedido = "proposto" | "aplicando" | "aplicado" | "desfeito" | "descartado" | "falhou";

/** Um item do pedido, como a pessoa lê: o que é, como estava, como fica e onde ver. */
export type ItemDoPedido = {
  titulo: string;
  antes?: string | null;
  depois?: string | null;
  /** Amostra de cor, quando o item é a paleta da marca (primária primeiro). */
  cores?: { antes: string[]; depois: string[] };
  /** Caminho na plataforma, relativo (ex.: /projects/abc/settings?aba=marca). */
  link?: string;
  /** Uma frase de cuidado: contraste baixo, crédito que não volta ao desfazer. */
  aviso?: string;
};

export type PedidoNaTela = {
  id: string;
  status: EstadoDoPedido;
  /** Uma frase com o que o pedido faz. */
  resumo: string;
  itens: ItemDoPedido[];
  /** Mudança ampla espera o toque em "Aplicar"; pequena é gravada na hora e pode ser desfeita. */
  amplo: boolean;
  /** Créditos que o pedido gasta ao ser aplicado (zero na maioria). */
  custoCreditos: number;
  pedidoPor: string;
  pedido: string;
  criadoEm: string;
  aplicadoEm?: string | null;
  desfeitoEm?: string | null;
  /** O que aconteceu ao aplicar ou desfazer, em português. */
  resultado?: string | null;
  podeDesfazer: boolean;
};

export type TurnoDaVera = {
  de: "voce" | "vera";
  texto: string;
  pedido?: PedidoNaTela;
};

/** Quantos dias depois de aplicado um pedido ainda pode ser desfeito. */
export const DIAS_PARA_DESFAZER = 7;
