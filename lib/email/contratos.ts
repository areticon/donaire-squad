import type { Email } from "@/lib/email";
import { casca, titulo, paragrafo, botao, MARCA } from "@/lib/email/layout";

/**
 * OS AVISOS DE VENCIMENTO DO CONTRATO (02/10/2026): 60, 30 e 7 dias antes e
 * no dia em que vence, para o cliente e para o Bruno. Tom de aviso, não de
 * venda: a data, o valor e o que acontece, nessa ordem.
 */

const dataLonga = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function quandoVence(dias: number, fim: Date): string {
  if (dias <= 0) return `venceu em ${dataLonga(fim)}`;
  return `vence em ${dataLonga(fim)}, daqui a ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function avisoDeVencimentoAoCliente(a: { nome: string | null; numero: number; plano: string; fim: Date; dias: number; valorCentavos: number; renovacaoAutomatica: boolean }): Email {
  const primeiro = (a.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const n = String(a.numero).padStart(4, "0");
  const corpo = `O contrato nº ${n} da sua empresa com a ${MARCA.nome} (plano ${a.plano}) ${quandoVence(a.dias, a.fim)}.`;
  const segue =
    a.dias <= 0
      ? "Se a renovação ainda não foi combinada, responda a este e-mail e a gente resolve com você."
      : a.renovacaoAutomatica
        ? `A renovação é automática, por mais um ano, no valor de ${reais(a.valorCentavos)} (com o reajuste previsto no contrato). Se não quiser renovar, é só responder a este e-mail antes dessa data.`
        : "A renovação não é automática. Se quiser continuar, responda a este e-mail e preparamos o contrato do próximo ano.";
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? MARCA.site).replace(/\/$/, "");
  return {
    para: "",
    assunto: a.dias <= 0 ? `Seu contrato com a ${MARCA.nome} venceu` : `Seu contrato com a ${MARCA.nome} vence em ${a.dias} ${a.dias === 1 ? "dia" : "dias"}`,
    texto: [`${oi}.`, "", corpo, "", segue, "", MARCA.nome, MARCA.site].join("\n"),
    html: casca({ previa: corpo, miolo: [titulo(`${oi}.`), paragrafo(corpo), paragrafo(segue), botao("Abrir a plataforma", `${base}/dashboard`)].join("\n") }),
  };
}

export function avisoDeVencimentoAoAdmin(a: { cliente: string; numero: number; plano: string; fim: Date; dias: number; valorCentavos: number; renovacaoAutomatica: boolean; userId: string }): Email {
  const n = String(a.numero).padStart(4, "0");
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? MARCA.site).replace(/\/$/, "");
  const link = `${base}/admin/contratos/${a.userId}`;
  const linha = `Contrato nº ${n} de ${a.cliente} (plano ${a.plano}, ${reais(a.valorCentavos)} por ano) ${quandoVence(a.dias, a.fim)}. Renovação ${a.renovacaoAutomatica ? "automática" : "manual"}.`;
  return {
    para: "",
    assunto: `Contrato ${n} de ${a.cliente}: ${a.dias <= 0 ? "venceu" : `vence em ${a.dias} dias`}`,
    texto: [linha, "", `Ver o cliente: ${link}`].join("\n"),
    html: casca({ previa: linha, miolo: [titulo(a.dias <= 0 ? "Contrato vencido" : "Contrato a vencer"), paragrafo(linha), botao("Ver o cliente", link)].join("\n") }),
  };
}
