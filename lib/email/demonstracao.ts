import { casca, titulo, paragrafo, separador, escapar, MARCA } from "@/lib/email/layout";

/** A faixa de faturamento como a pessoa leu no formulário. */
export const NOME_DA_FAIXA: Record<string, string> = {
  ate_50k: "até R$ 50 mil por mês",
  "50k_100k": "de R$ 50 mil a R$ 100 mil por mês",
  "100k_500k": "de R$ 100 mil a R$ 500 mil por mês",
  "500k_1m": "de R$ 500 mil a R$ 1 milhão por mês",
  acima_1m: "acima de R$ 1 milhão por mês",
};

/**
 * Desde 01/10 o formulário da demonstração pede os MESMOS campos do portão da
 * calculadora (faturamento, time, setor, cargo, e-mail e WhatsApp) e leva
 * direto ao calendário: nome, empresa e objetivo ficaram opcionais, para os
 * leads antigos que ainda os têm.
 */
type Pedido = {
  nome?: string | null;
  email: string;
  telefone: string;
  empresa?: string | null;
  cargo: string | null;
  faturamento: string;
  objetivo?: string | null;
  setor?: string | null;
  tamanhoTime?: string | null;
  origem: string | null;
};

/**
 * O AVISO PARA OS SÓCIOS: tudo o que é preciso para ligar, sem abrir o painel.
 * O WhatsApp vira link direto, porque a primeira resposta é o que mais pesa
 * em venda consultiva.
 */
export function emailDemonstracaoParaSocios(p: Pedido) {
  const zap = p.telefone.replace(/\D/g, "");
  const linkZap = `https://wa.me/${zap.startsWith("55") ? zap : `55${zap}`}`;
  const quem = p.empresa || p.setor || p.email;
  const linhas: Array<[string, string]> = [
    ...(p.nome ? [["Nome", p.nome] as [string, string]] : []),
    ...(p.empresa ? [["Empresa", p.empresa] as [string, string]] : []),
    ["Cargo", p.cargo ?? "não informado"],
    ...(p.setor ? [["Setor", p.setor] as [string, string]] : []),
    ...(p.tamanhoTime ? [["Tamanho do time", p.tamanhoTime] as [string, string]] : []),
    ["Faturamento", NOME_DA_FAIXA[p.faturamento] ?? p.faturamento],
    ["WhatsApp", p.telefone],
    ["E-mail", p.email],
    ["Veio de", p.origem ?? "direto"],
  ];
  const texto = [
    `Pedido de demonstração: ${quem}`,
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    "",
    `O que espera: ${p.objetivo ?? "não escreveu"}`,
    "Ainda sem horário: a pessoa está na página do calendário.",
    "",
    `Chamar no WhatsApp: ${linkZap}`,
  ].join("\n");
  const miolo = [
    titulo(`Pedido de demonstração: ${quem}`),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:15px;line-height:1.6">` +
      linhas.map(([k, v]) => `<tr><td style="color:${MARCA.apagado};padding:3px 12px 3px 0;white-space:nowrap">${k}</td><td>${escapar(v)}</td></tr>`).join("") +
      `</table>`,
    separador(),
    ...(p.objetivo ? [paragrafo(`<strong>O que espera:</strong> ${escapar(p.objetivo)}`)] : []),
    paragrafo("Ainda sem horário: a pessoa está na página do calendário. Se marcar, chega outro aviso com o convite."),
    paragrafo(`<a href="${linkZap}" style="color:${MARCA.link};font-weight:600">Chamar no WhatsApp</a>`),
  ].join("\n");
  return {
    para: "",
    assunto: `Demonstração: ${quem} (${NOME_DA_FAIXA[p.faturamento] ?? p.faturamento})`,
    texto,
    html: casca({ previa: `${p.nome ?? p.email}, ${quem}, pediu uma demonstração.`, miolo }),
  };
}

/** A confirmação para quem pediu: o que acontece agora, e quando. */
export function emailDemonstracaoRecebida(nome: string) {
  const primeiro = nome.trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const corpo = "Recebemos seu pedido de demonstração da Demandou. Um dos sócios fala com você pelo WhatsApp em até 1 dia útil para marcar um horário.";
  const detalhe = "Na conversa, mostramos a plataforma funcionando com o conteúdo de uma empresa de verdade e montamos com você o plano que faz sentido para a sua.";
  return {
    para: "",
    assunto: `Recebemos seu pedido de demonstração da ${MARCA.nome}`,
    texto: [`${oi}.`, "", corpo, "", detalhe, "", MARCA.nome, MARCA.site].join("\n"),
    html: casca({ previa: corpo, miolo: [titulo(`${oi}.`), paragrafo(corpo), paragrafo(detalhe)].join("\n") }),
  };
}
