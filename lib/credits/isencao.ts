/**
 * QUEM NÃO TEM O SALDO DEBITADO (06/10/2026), decidido por configuração.
 *
 * De 12/09 a 06/10 a regra era fixa: conta com `role = "admin"` não debitava
 * crédito (o trabalho acontecia, o extrato gravava uma linha de valor zero com
 * "Acesso interno: custaria N créditos" e o saldo ficava parado). O efeito
 * medido em 06/10: a conta admin do Bruno ficou travada em 34.487 créditos, e o
 * admin nunca via o produto como o cliente vê (saldo baixando, aviso de saldo
 * acabando, recusa por falta de saldo).
 *
 * Pedido do Bruno em 06/10: o admin passa a consumir como qualquer cliente. Ele
 * continua entrando sem plano e com acesso interno (cota de gravações, marcas,
 * painel de admin); SÓ o débito muda. Por configuração e não por e-mail fixo:
 *
 *   ADMIN_SEM_DEBITO=1   volta à regra antiga (admin não debita);
 *   ausente ou outro     admin debita como cliente (o padrão desde 06/10).
 *
 * EFEITO QUE PRECISA SER LEMBRADO: com o débito ligado, se o saldo do admin
 * acabar ele é recusado como qualquer cliente ("Saldo insuficiente") até
 * conceder crédito a si mesmo pelo painel (/admin, ficha da conta, "Conceder
 * créditos").
 *
 * Só servidor: lê o ambiente.
 */
export function adminSemDebito(): boolean {
  return process.env.ADMIN_SEM_DEBITO === "1";
}

/** Esta conta (pelo papel de quem PAGA) tem o débito dispensado? */
export function debitoIsento(role: string | null | undefined): boolean {
  return role === "admin" && adminSemDebito();
}
