import type { CondicaoPedida, DescontoPedido } from "@/lib/contratos/contratos";
import { CONDICAO_PARCELADA } from "@/lib/contratos/condicao";

/**
 * A LEITURA DO FORMULÁRIO DO GESTOR (04/10/2026): as rotas de contrato, de
 * versão nova e de aditivo leem o preço do mesmo jeito.
 */

/** "35.964,00", "35964,00", "35964.00" e "7,5" viram número. */
export function numeroDoTexto(v: unknown): number {
  const t = String(v ?? "").replace(/[^\d.,]/g, "");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * O desconto do corpo: `descontoTipo` ("percentual" ou "valor"),
 * `descontoValor` (porcentagem ou reais), `descontoMotivo` e
 * `descontoObservacao`. Sem valor, sem desconto (null).
 */
export function descontoDoCorpo(b: Record<string, unknown>): DescontoPedido | null {
  const valor = numeroDoTexto(b.descontoValor);
  if (!valor) return null;
  return {
    tipo: b.descontoTipo === "valor" ? "valor" : "percentual",
    valor,
    motivo: typeof b.descontoMotivo === "string" ? b.descontoMotivo : "",
    observacao: typeof b.descontoObservacao === "string" ? b.descontoObservacao : null,
  };
}

/** "2026-10-04" vira meio-dia de Brasília (o dia não escorrega no fuso). */
export function dataDoTexto(v: unknown): Date | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-03:00`) : null;
}

/**
 * A CONDIÇÃO DE PAGAMENTO do corpo (05/10): `condicaoDePagamento` ("a_vista"
 * ou "entrada_e_restante"), `entradaReais`, `formaDaEntrada` (pix, boleto,
 * transferencia, cartao_stripe), `parcelas`, `formaDoRestante`
 * (cartao_recorrente, cartao_parcelado_emissor, cartao_a_vista) e
 * `primeiraParcelaEm` (AAAA-MM-DD, opcional, só na recorrência). Sem o campo,
 * undefined (na edição, mantém o que está).
 */
export function condicaoDoCorpo(b: Record<string, unknown>): CondicaoPedida | undefined {
  if (!("condicaoDePagamento" in b)) return undefined;
  if (b.condicaoDePagamento !== CONDICAO_PARCELADA) return { tipo: "a_vista" };
  return {
    tipo: CONDICAO_PARCELADA,
    entradaCentavos: Math.round(numeroDoTexto(b.entradaReais) * 100),
    formaDaEntrada: typeof b.formaDaEntrada === "string" ? b.formaDaEntrada : null,
    parcelas: Math.floor(Number(b.parcelas ?? 0)),
    formaDoRestante: typeof b.formaDoRestante === "string" ? b.formaDoRestante : null,
    primeiraParcelaEm: dataDoTexto(b.primeiraParcelaEm),
  };
}
