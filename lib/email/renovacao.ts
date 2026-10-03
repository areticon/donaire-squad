import { casca, titulo, paragrafo, MARCA } from "@/lib/email/layout";

/**
 * O AVISO DE RENOVAÇÃO do contrato anual (termos, item 5.3). Diz o valor, a
 * data e como cancelar, nessa ordem, porque é isso que a pessoa precisa para
 * decidir. Sem tom de venda: é um aviso de cobrança.
 */
export function avisoDeRenovacao(args: { valorCentavos: number; data: Date | null }) {
  const valor = (args.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const quando = args.data
    ? args.data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "na data de renovação do contrato";
  const corpo = `O contrato anual da sua empresa com a ${MARCA.nome} renova em ${quando}, com a cobrança de ${valor} no mesmo meio de pagamento.`;
  const cancelar = `Se não quiser renovar, é só cancelar antes dessa data em Configurações, na aba Plano, ou responder a este e-mail. O acesso continua até o fim do período já pago.`;
  return {
    para: "",
    assunto: `Seu contrato com a ${MARCA.nome} renova em ${quando}`,
    texto: [corpo, "", cancelar, "", MARCA.nome, MARCA.site].join("\n"),
    html: casca({ previa: corpo, miolo: [titulo("Aviso de renovação"), paragrafo(corpo), paragrafo(cancelar)].join("\n") }),
  };
}
