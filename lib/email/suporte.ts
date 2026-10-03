import type { Email } from "@/lib/email";
import { casca, titulo, paragrafo, botao, separador, escapar, MARCA } from "@/lib/email/layout";

/**
 * OS E-MAILS DO CHAMADO (02/10/2026): o aviso ao Bruno a cada chamado novo e o
 * aviso ao cliente quando o suporte responde. Texto puro sempre, HTML na casca
 * da marca (mesma regra de lib/email: e-mail só HTML pontua pior em spam).
 */

function base(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? MARCA.site).replace(/\/$/, "");
}

export function emailDeChamadoNovo(args: {
  protocolo: string;
  categoria: string;
  cliente: { nome: string | null; email: string; plano: string };
  texto: string;
  codigo: string | null;
  contexto: string[];
  diagnostico: string | null;
  temPrint: boolean;
  resumoDoErro?: string | null;
}): Email {
  const link = `${base()}/admin/chamados?abrir=${encodeURIComponent(args.protocolo.replace("#", ""))}`;
  const assunto = `Chamado ${args.protocolo}: ${args.categoria}${args.resumoDoErro ? `, ${args.resumoDoErro}` : ""} (${args.cliente.nome || args.cliente.email})`;
  const linhas = [
    `Chamado novo na ${MARCA.nome}.`,
    "",
    `PROTOCOLO: ${args.protocolo}`,
    `CATEGORIA: ${args.categoria}`,
    args.codigo ? `CÓDIGO NA TELA: ${args.codigo}` : "",
    `Cliente: ${args.cliente.nome ?? "(sem nome)"} <${args.cliente.email}>, plano ${args.cliente.plano}`,
    "",
    "O QUE A PESSOA ESCREVEU:",
    args.texto,
    "",
    ...args.contexto,
    args.temPrint ? "Print anexado: abra no painel." : "Sem print.",
    args.diagnostico ? `\nDIAGNÓSTICO (interno, o cliente não vê):\n${args.diagnostico}` : "",
    "",
    `Responder no painel: ${link}`,
  ].filter((l) => l !== "");
  const miolo = [
    titulo(`Chamado ${args.protocolo}`),
    paragrafo(
      `<strong style="font-weight:600">${escapar(args.categoria)}</strong>${args.codigo ? `, código <code>${escapar(args.codigo)}</code>` : ""}. ` +
        `De ${escapar(args.cliente.nome ?? args.cliente.email)} (${escapar(args.cliente.email)}), plano ${escapar(args.cliente.plano)}.`
    ),
    paragrafo(escapar(args.texto).replace(/\n/g, "<br>")),
    separador(),
    paragrafo(args.contexto.map(escapar).join("<br>"), { apagado: true, tamanho: 13 }),
    args.diagnostico
      ? paragrafo(`<strong>Diagnóstico (interno):</strong><br>${escapar(args.diagnostico).replace(/\n/g, "<br>")}`, { apagado: true, tamanho: 13 })
      : "",
    botao("Responder no painel", link),
  ]
    .filter(Boolean)
    .join("\n");
  return { para: "", assunto, texto: linhas.join("\n"), html: casca({ previa: args.texto.slice(0, 120), miolo }) };
}

export function emailDeRespostaDoChamado(args: { nome: string | null; protocolo: string; resposta: string; status: string }): Email {
  const primeiro = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `${primeiro}, respondemos o seu chamado ${args.protocolo}` : `Respondemos o seu chamado ${args.protocolo}`;
  const link = `${base()}/chamados`;
  const texto = [
    `${oi}.`,
    "",
    args.resposta,
    "",
    `Situação do chamado: ${args.status}.`,
    "",
    `Ver o chamado e responder: ${link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(oi + "."),
    paragrafo(escapar(args.resposta).replace(/\n/g, "<br>")),
    paragrafo(`Situação do chamado: <strong style="font-weight:600">${escapar(args.status)}</strong>.`, { apagado: true, tamanho: 13 }),
    botao("Ver meus chamados", link),
  ].join("\n");
  return { para: "", assunto: `Resposta do chamado ${args.protocolo}`, texto, html: casca({ previa: args.resposta.slice(0, 120), miolo }) };
}
