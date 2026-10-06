import type { Email } from "@/lib/email";
import { casca, titulo, paragrafo, botao, escapar, MARCA } from "@/lib/email/layout";
import type { MotivoDaCobranca } from "@/lib/contratos/fup";

/**
 * OS E-MAILS DE ACOMPANHAMENTO (FUP, follow-up) DA COBRANÇA (05/10/2026):
 * curtos e cordiais, na casca da marca, um por passo da cadência. Saem pelo
 * mesmo caminho dos avisos de contrato (lib/email, Resend). Tom de quem
 * acompanha, não de quem cobra: o que falta, o link, e uma porta aberta.
 */

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type DadosDoFup = {
  motivo: MotivoDaCobranca;
  nome: string | null;
  numero: number;
  plano: string;
  valorCentavos: number;
  /** O link de assinatura (assinatura) ou de pagamento (entrada), quando há. */
  link: string | null;
  /** O passo da cadência (1 = D+1). Muda o texto: o primeiro pergunta, os outros lembram. */
  passo: number;
  closerNome: string | null;
  /** O telefone do vendedor na tela (+55 11 ...), quando há. */
  closerTelefone: string | null;
};

function assinaturaDoVendedor(d: DadosDoFup): string {
  if (!d.closerNome) return MARCA.nome;
  return d.closerTelefone ? `${d.closerNome}, ${MARCA.nome} (${d.closerTelefone})` : `${d.closerNome}, ${MARCA.nome}`;
}

export function emailDeFup(d: DadosDoFup): Email {
  const primeiro = (d.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const n = String(d.numero).padStart(4, "0");
  const primeiroPasso = d.passo <= 1;

  let assunto: string;
  let corpo: string;
  let segue: string;
  let acao: string | null = null;
  if (d.motivo === "assinatura") {
    assunto = primeiroPasso ? `Ficou alguma dúvida no contrato nº ${n}?` : `Lembrete: o contrato nº ${n} aguarda a sua assinatura`;
    corpo = primeiroPasso
      ? `Enviamos o contrato nº ${n} (plano ${d.plano}) para a sua assinatura e queremos saber se ficou alguma dúvida. Qualquer ponto do texto pode ser conversado antes de assinar.`
      : `O contrato nº ${n} (plano ${d.plano}) continua aguardando a sua assinatura. Se algum ponto ficou em aberto, respondemos no mesmo dia.`;
    segue = "Assinando, a conta é liberada assim que o pagamento for confirmado, e o onboarding é agendado na sequência.";
    acao = "Assinar o contrato";
  } else if (d.motivo === "entrada") {
    assunto = primeiroPasso ? `Falta só o pagamento para liberar o acesso (contrato nº ${n})` : `Lembrete: o pagamento do contrato nº ${n} ainda não entrou`;
    corpo = `O contrato nº ${n} (plano ${d.plano}, ${reais(d.valorCentavos)} por ano) já está assinado. Falta só o pagamento para a conta ser liberada e o onboarding ser agendado.`;
    segue = "Se já pagou por Pix, boleto ou transferência, responda a este e-mail com o comprovante que registramos na hora.";
    acao = "Pagar agora";
  } else {
    assunto = `Uma parcela do contrato nº ${n} não entrou no cartão`;
    corpo = `A cobrança de uma parcela do contrato nº ${n} (plano ${d.plano}) não foi aprovada pelo cartão. O sistema tenta de novo sozinho nos próximos dias.`;
    segue = "Se o cartão mudou ou venceu, responda a este e-mail e enviamos o link para atualizar.";
  }
  const vendedor = assinaturaDoVendedor(d);
  const texto = [`${oi}.`, "", corpo, "", ...(d.link ? [d.link, ""] : []), segue, "", "Qualquer dúvida, é só responder a este e-mail.", "", vendedor, MARCA.site].join("\n");
  const miolo = [
    titulo(`${oi}.`),
    paragrafo(escapar(corpo)),
    d.link && acao ? botao(acao, d.link) : "",
    d.link ? paragrafo(`Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(d.link)}</span>`, { apagado: true, tamanho: 13 }) : "",
    paragrafo(escapar(segue)),
    paragrafo("Qualquer dúvida, é só responder a este e-mail.", { apagado: true, tamanho: 13 }),
    paragrafo(escapar(vendedor), { apagado: true, tamanho: 13 }),
  ]
    .filter(Boolean)
    .join("\n");
  return { para: "", assunto, texto, html: casca({ previa: corpo, miolo }) };
}
