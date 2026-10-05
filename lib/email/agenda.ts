import { casca, titulo, paragrafo, separador, botao, escapar, MARCA } from "@/lib/email/layout";
import { NOME_DA_FAIXA } from "@/lib/email/demonstracao";
import { NOME_DO_TIME } from "@/lib/email/calculadora";
import { emReais, type Resultado } from "@/lib/calculadora/custos";
import { montarConvite } from "@/lib/agenda/ics";
import { quandoPorExtenso, rotuloDoDia, horaEmSP, dataEmSP } from "@/lib/agenda/tempo";
import { descricaoDaReuniao, nomeCurtoDaReuniao, nomeDaReuniao, tipoDeReuniao, tituloDoEvento, type TipoDeReuniao } from "@/lib/agenda/tipo";
import type { Email } from "@/lib/email";

/**
 * OS E-MAILS DO AGENDAMENTO (01/10): confirmação, aviso ao time, lembretes e
 * cancelamento, todos na casca da marca e com o convite de calendário anexo.
 *
 * O CONVITE VAI COMO PARTE text/calendar COM METHOD (e não um .ics solto), e
 * com o mesmo UID em todas as mensagens da mesma reunião: remarcar move o
 * evento na agenda do lead, cancelar tira. Ver lib/agenda/ics.ts.
 */

export type DadosDaReuniao = {
  /** "demonstracao" (padrão) | "onboarding" (05/10): muda o nome da reunião em todo texto. */
  tipo?: TipoDeReuniao;
  inicio: Date;
  fim: Date;
  uid: string;
  sequencia: number;
  linkReuniao: string | null;
  pessoa: { nome: string; email: string | null; whatsapp?: string | null };
  lead: {
    /** O WhatsApp já no formato internacional (5511987654321), ou null. */
    whatsapp?: string | null;
    email: string;
    nome?: string | null;
    telefone?: string | null;
    cargo?: string | null;
    setor?: string | null;
    faturamento?: string | null;
    tamanhoTime?: string | null;
    empresa?: string | null;
    origem?: string | null;
    calculadora?: unknown;
  };
  /** O link de remarcar ou cancelar (token assinado da reunião). */
  linkGerenciar: string;
  /** O link do /admin/agenda, para o aviso do time. */
  linkAdmin: string;
  /** Régua de alertas (01/10): remarcar direto no calendário. */
  linkRemarcar?: string;
  /** A sala pelo nosso endereço, que registra a presença do lead e leva ao Meet. */
  linkSalaDoLead?: string;
  /** "Marcar que começou", para a pessoa do time. */
  linkComecou?: string;
};

/**
 * O PRÓXIMO PASSO depois da demonstração, no agradecimento ao lead (e-mail e
 * WhatsApp). Mudou o processo comercial, muda aqui e no modelo
 * demandou_demo_obrigado (lib/whatsapp/modelos.ts), que precisa ser aprovado
 * de novo.
 */
export function proximoPasso(pessoa: string): string {
  return `${pessoa} manda a proposta com o plano que montamos juntos`;
}

// O NOME DA REUNIÃO EM CADA TEXTO (05/10): "demonstração" ou "conversa de
// onboarding", conforme o tipo. Os textos abaixo nunca escrevem o nome fixo.
const ehOnboarding = (d: DadosDaReuniao) => tipoDeReuniao(d.tipo) === "onboarding";
const nome = (d: DadosDaReuniao) => nomeDaReuniao(d.tipo);
const Nome = (d: DadosDaReuniao) => nomeCurtoDaReuniao(d.tipo);

function remetenteDoConvite(): string {
  const r = process.env.EMAIL_REMETENTE ?? "Demandou <contato@demandou.com>";
  return r.match(/<([^>]+)>/)?.[1] ?? r;
}

function nomeDoLead(d: DadosDaReuniao): string {
  return d.lead.nome?.trim() || d.lead.email;
}

function quandoCurto(inicio: Date): string {
  return `${rotuloDoDia(dataEmSP(inicio))}, ${horaEmSP(inicio)}`;
}

function linhaDaSala(d: DadosDaReuniao): string {
  return d.linkReuniao
    ? `Videochamada: ${d.linkReuniao}`
    : "O link da videochamada chega por e-mail antes da reunião.";
}

function convite(d: DadosDaReuniao, metodo: "REQUEST" | "CANCEL"): NonNullable<Email["anexos"]>[number] {
  const organizador = d.pessoa.email ?? remetenteDoConvite();
  const ics = montarConvite({
    metodo,
    uid: d.uid,
    sequencia: d.sequencia,
    inicio: d.inicio,
    fim: d.fim,
    titulo: tituloDoEvento(d.tipo),
    descricao: [
      `${tituloDoEvento(d.tipo)} com ${d.pessoa.nome}.`,
      linhaDaSala(d),
      "",
      `Remarcar ou cancelar: ${d.linkGerenciar}`,
    ].join("\n"),
    local: d.linkReuniao ?? "Videochamada (link por e-mail)",
    url: d.linkReuniao,
    organizador: { nome: `${d.pessoa.nome} (Demandou)`, email: organizador },
    convidados: [
      { nome: nomeDoLead(d), email: d.lead.email },
      ...(d.pessoa.email && d.pessoa.email !== organizador ? [{ nome: d.pessoa.nome, email: d.pessoa.email }] : []),
    ],
  });
  return {
    nome: metodo === "CANCEL" ? "cancelamento.ics" : "convite.ics",
    conteudo: ics,
    tipo: `text/calendar; charset=utf-8; method=${metodo}`,
  };
}

function tabela(pares: Array<[string, string]>): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:15px;line-height:1.6;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">` +
    pares
      .map(([k, v]) => `<tr><td style="color:${MARCA.apagado};padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top">${escapar(k)}</td><td style="color:${MARCA.texto}">${escapar(v)}</td></tr>`)
      .join("") +
    `</table>`
  );
}

function linkDaSalaHtml(d: DadosDaReuniao): string {
  return d.linkReuniao
    ? paragrafo(`Videochamada: <a href="${escapar(d.linkReuniao)}" style="color:${MARCA.link};font-weight:600">${escapar(d.linkReuniao)}</a>`)
    : paragrafo("O link da videochamada chega por e-mail antes da reunião.", { apagado: true, tamanho: 14 });
}

/** A confirmação para o lead, marcada ou remarcada. */
export function emailReuniaoParaLead(d: DadosDaReuniao, tipo: "marcada" | "remarcada"): Email {
  const quando = quandoPorExtenso(d.inicio);
  const primeiro = d.lead.nome?.trim().split(/\s+/)[0];
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const abertura =
    tipo === "marcada"
      ? `Sua ${nome(d)} da Demandou está marcada para ${quando}, com ${d.pessoa.nome}.`
      : `Sua ${nome(d)} da Demandou mudou para ${quando}, com ${d.pessoa.nome}.`;
  const detalhe = descricaoDaReuniao(d.tipo);
  // Remarcar e cancelar em links separados (01/10, régua): o remarcar abre
  // direto no calendário, o cancelar abre a página da reunião com o botão.
  const remarcar = d.linkRemarcar ?? d.linkGerenciar;
  const avisos = "O convite vai anexo para a sua agenda. Avisamos de novo antes da reunião, com o link da sala.";
  const texto = [
    `${oi}.`,
    "",
    abertura,
    linhaDaSala(d),
    "",
    detalhe,
    "",
    `Remarcar: ${remarcar}`,
    `Cancelar: ${d.linkGerenciar}`,
    "",
    avisos,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(tipo === "marcada" ? `${Nome(d)} ${ehOnboarding(d) ? "marcado" : "marcada"}.` : `${Nome(d)} ${ehOnboarding(d) ? "remarcado" : "remarcada"}.`),
    paragrafo(escapar(abertura)),
    linkDaSalaHtml(d),
    paragrafo(escapar(detalhe), { apagado: true, tamanho: 15 }),
    botao("Remarcar", remarcar),
    paragrafo(`<a href="${escapar(d.linkGerenciar)}" style="color:${MARCA.link}">Cancelar ${ehOnboarding(d) ? "o onboarding" : "a demonstração"}</a>`, { tamanho: 14 }),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(d.linkGerenciar)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
    paragrafo(escapar(avisos), { apagado: true, tamanho: 13 }),
  ].join("\n");
  return {
    para: d.lead.email,
    assunto: `${Nome(d)} ${tipo === "marcada" ? (ehOnboarding(d) ? "marcado" : "marcada") : ehOnboarding(d) ? "remarcado" : "remarcada"}: ${quandoCurto(d.inicio)} (horário de Brasília)`,
    texto,
    html: casca({ previa: abertura, miolo }),
    anexos: [convite(d, "REQUEST")],
  };
}

/** O que o lead respondeu e simulou, para quem vai atender. */
function fichaDoLead(d: DadosDaReuniao): { pares: Array<[string, string]>; simulou: Array<[string, string]>; zap: string | null } {
  const l = d.lead;
  const pares: Array<[string, string]> = [
    ["E-mail", l.email],
    ...(l.nome ? [["Nome", l.nome] as [string, string]] : []),
    ...(l.empresa ? [["Empresa", l.empresa] as [string, string]] : []),
    ["WhatsApp", l.telefone ?? "não informado"],
    ["Cargo", l.cargo ?? "não informado"],
    ["Setor", l.setor ?? "não informado"],
    ["Faturamento", (l.faturamento && NOME_DA_FAIXA[l.faturamento]) ?? l.faturamento ?? "não informado"],
    ["Tamanho do time", (l.tamanhoTime && NOME_DO_TIME[l.tamanhoTime]) ?? l.tamanhoTime ?? "não informado"],
    ["Veio de", l.origem ?? "direto"],
  ];
  const r = l.calculadora as Resultado | null | undefined;
  const simulou: Array<[string, string]> =
    r && r.demandou && Array.isArray(r.cenarios)
      ? [
          ["Volume por mês", `${r.volume.textos} textos, ${r.volume.artes} artes, ${r.volume.cortes} vídeos curtos, ${r.volume.longos} vídeos longos`],
          ...r.cenarios.map((c) => [c.nome, `${emReais(c.mensal)} por mês`] as [string, string]),
          [`Demandou (${r.demandou.nome})`, `${emReais(r.demandou.mensal)} por mês`],
          ["Economia contra o time próprio", `${emReais(r.economia[0]?.reais ?? 0)} por mês (${r.economia[0]?.porcento ?? 0}%)`],
        ]
      : [];
  const digitos = (l.telefone ?? "").replace(/\D/g, "");
  return { pares, simulou, zap: digitos ? `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}` : null };
}

/** O aviso para a pessoa do time que vai atender. */
export function emailReuniaoParaTime(d: DadosDaReuniao, tipo: "marcada" | "remarcada", para: string): Email {
  const { pares, simulou, zap } = fichaDoLead(d);
  const quem = d.lead.empresa || [d.lead.cargo, d.lead.setor].filter(Boolean).join(", ") || d.lead.email;
  const marcada = tipo === "marcada" ? (ehOnboarding(d) ? "marcado" : "marcada") : ehOnboarding(d) ? "remarcado" : "remarcada";
  const assunto = `${Nome(d)} ${marcada}: ${quandoCurto(d.inicio)}, ${quem}`;
  const texto = [
    assunto,
    "",
    `Com: ${d.pessoa.nome}`,
    `Quando: ${quandoPorExtenso(d.inicio)}`,
    linhaDaSala(d),
    "",
    ...pares.map(([k, v]) => `${k}: ${v}`),
    ...(simulou.length ? ["", "O que simulou na calculadora:", ...simulou.map(([k, v]) => `${k}: ${v}`)] : []),
    "",
    ...(zap ? [`Chamar no WhatsApp: ${zap}`] : []),
    `Todas as reuniões: ${d.linkAdmin}`,
  ].join("\n");
  const miolo = [
    titulo(tipo === "marcada" ? (ehOnboarding(d) ? "Novo onboarding marcado." : "Nova demonstração marcada.") : `${Nome(d)} ${marcada}.`),
    paragrafo(`<strong>${escapar(quandoPorExtenso(d.inicio))}</strong>, com ${escapar(d.pessoa.nome)}.`),
    linkDaSalaHtml(d),
    separador(),
    tabela(pares),
    ...(simulou.length ? [separador(), paragrafo("<strong>O que simulou na calculadora</strong>"), tabela(simulou)] : []),
    separador(),
    ...(zap ? [paragrafo(`<a href="${zap}" style="color:${MARCA.link};font-weight:600">Chamar no WhatsApp</a>`)] : []),
    paragrafo(`<a href="${escapar(d.linkAdmin)}" style="color:${MARCA.link}">Ver todas as reuniões no painel</a>`, { tamanho: 14 }),
  ].join("\n");
  return { para, assunto, texto, html: casca({ previa: `${quem}, ${quandoCurto(d.inicio)}.`, miolo }), anexos: [convite(d, "REQUEST")] };
}

/** O lembrete de 24 horas ou de 1 hora, para o lead ou para o time. */
export function emailLembrete(d: DadosDaReuniao, quando: "24h" | "1h", para: string, lado: "lead" | "time"): Email {
  const falta = quando === "24h" ? "amanhã" : "daqui a 1 hora";
  const comQuem = lado === "lead" ? d.pessoa.nome : d.lead.empresa || d.lead.email;
  const frase = `Lembrete: a ${nome(d)} da Demandou é ${falta}, ${quandoPorExtenso(d.inicio)}, com ${comQuem}.`;
  const texto = [
    frase,
    linhaDaSala(d),
    "",
    lado === "lead" ? `Precisa mudar? Remarque ou cancele aqui: ${d.linkGerenciar}` : `Todas as reuniões: ${d.linkAdmin}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(quando === "24h" ? `A ${nome(d)} é amanhã.` : `A ${nome(d)} começa em 1 hora.`),
    paragrafo(escapar(frase)),
    linkDaSalaHtml(d),
    lado === "lead"
      ? botao("Remarcar ou cancelar", d.linkGerenciar)
      : paragrafo(`<a href="${escapar(d.linkAdmin)}" style="color:${MARCA.link}">Ver a ficha do lead no painel</a>`, { tamanho: 14 }),
  ].join("\n");
  return {
    para,
    assunto: `Lembrete: ${ehOnboarding(d) ? "onboarding" : "demonstração"} ${falta}, ${horaEmSP(d.inicio)} (horário de Brasília)`,
    texto,
    html: casca({ previa: frase, miolo }),
  };
}

/** O cancelamento, para os dois lados, com o convite de CANCEL que tira o evento da agenda. */
export function emailCancelamento(d: DadosDaReuniao, para: string, lado: "lead" | "time", por: "lead" | "admin"): Email {
  const quando = quandoPorExtenso(d.inicio);
  const frase =
    lado === "lead"
      ? por === "lead"
        ? `Cancelamos a sua ${nome(d)} de ${quando}, como você pediu.`
        : `Precisamos cancelar a ${nome(d)} de ${quando}. Pedimos desculpas pelo transtorno.`
      : `A ${nome(d)} de ${quando} com ${d.lead.empresa || d.lead.email} foi cancelada ${por === "lead" ? (ehOnboarding(d) ? "pelo cliente" : "pelo lead") : "pelo painel"}.`;
  // O onboarding volta à página do contrato (que abre o calendário de novo); a demonstração, à página pública.
  const volta = ehOnboarding(d) ? d.linkGerenciar : `${MARCA.site}/demonstracao`;
  const texto = [frase, "", lado === "lead" ? `Quando quiser, escolha outro horário: ${volta}` : `Painel: ${d.linkAdmin}`, "", MARCA.nome, MARCA.site].join("\n");
  const miolo = [
    titulo(`${Nome(d)} ${ehOnboarding(d) ? "cancelado" : "cancelada"}.`),
    paragrafo(escapar(frase)),
    lado === "lead" ? botao("Escolher outro horário", volta) : paragrafo(`<a href="${escapar(d.linkAdmin)}" style="color:${MARCA.link}">Abrir o painel</a>`, { tamanho: 14 }),
  ].join("\n");
  return {
    para,
    assunto: `${Nome(d)} ${ehOnboarding(d) ? "cancelado" : "cancelada"}: ${quandoCurto(d.inicio)}`,
    texto,
    html: casca({ previa: frase, miolo }),
    anexos: [convite(d, "CANCEL")],
  };
}

// ---------------------------------------------------------------------------
// A RÉGUA DE ALERTAS (01/10): 5 minutos antes, início, atraso e depois.
// Curtos de propósito: quem lê está com o celular na mão, a minutos da reunião.
// ---------------------------------------------------------------------------

function quemEhOLead(d: DadosDaReuniao): string {
  return d.lead.nome?.trim() || d.lead.empresa || d.lead.email;
}

/** O botão de entrar do lead: pelo nosso endereço (presença), senão o Meet direto. */
function entrarDoLead(d: DadosDaReuniao): string | null {
  return d.linkSalaDoLead ?? d.linkReuniao;
}

function semLinkParaOLead(d: DadosDaReuniao): string {
  return `A sala desta reunião ainda está sem link. ${d.pessoa.nome} vai mandar o link para você em instantes.`;
}

/** 5 minutos antes, para o lead ou para o time, com o link em destaque. */
export function emailCincoMinutos(d: DadosDaReuniao, para: string, lado: "lead" | "time"): Email {
  const hora = horaEmSP(d.inicio);
  if (lado === "lead") {
    const frase = `Sua ${nome(d)} da Demandou com ${d.pessoa.nome} começa em 5 minutos, às ${hora} (horário de Brasília).`;
    const entrar = entrarDoLead(d);
    const texto = [frase, "", d.linkReuniao && entrar ? `Entrar na sala: ${entrar}` : semLinkParaOLead(d), "", MARCA.nome, MARCA.site].join("\n");
    const miolo = [
      titulo("Começa em 5 minutos."),
      paragrafo(escapar(frase)),
      d.linkReuniao && entrar ? botao("Entrar na sala", entrar) : paragrafo(escapar(semLinkParaOLead(d))),
      ...(d.linkReuniao ? [paragrafo(`Ou abra direto: <span style="word-break:break-all">${escapar(d.linkReuniao)}</span>`, { apagado: true, tamanho: 13 })] : []),
    ].join("\n");
    return { para, assunto: `Começa em 5 minutos: ${ehOnboarding(d) ? "onboarding" : "demonstração"} às ${hora}`, texto, html: casca({ previa: frase, miolo }) };
  }
  const frase = `${ehOnboarding(d) ? "O onboarding" : "A demonstração"} com ${quemEhOLead(d)} começa em 5 minutos, às ${hora} (horário de Brasília).`;
  const alertaSemLink = "Atenção: a reunião está sem link de videochamada. Mande o link ao lead agora.";
  const comecou = d.linkComecou ?? d.linkAdmin;
  const texto = [
    frase,
    d.linkReuniao ? `Videochamada: ${d.linkReuniao}` : alertaSemLink,
    "",
    `Quando o lead entrar, marque que começou (assim ele não recebe o aviso de atraso): ${comecou}`,
    ...(d.lead.whatsapp ? [`WhatsApp do lead: https://wa.me/${d.lead.whatsapp}`] : []),
  ].join("\n");
  const miolo = [
    titulo(`${Nome(d)} em 5 minutos.`),
    paragrafo(escapar(frase)),
    d.linkReuniao ? botao("Entrar na sala", d.linkReuniao) : paragrafo(`<strong>${escapar(alertaSemLink)}</strong>`),
    paragrafo(
      `Quando o lead entrar, <a href="${escapar(comecou)}" style="color:${MARCA.link};font-weight:600">marque que começou</a>. Assim ele não recebe o aviso de atraso.`,
      { tamanho: 14 }
    ),
    ...(d.lead.whatsapp ? [paragrafo(`<a href="https://wa.me/${d.lead.whatsapp}" style="color:${MARCA.link}">Chamar o lead no WhatsApp</a>`, { tamanho: 14 })] : []),
  ].join("\n");
  return { para, assunto: `Em 5 minutos: ${ehOnboarding(d) ? "onboarding" : "demonstração"} com ${quemEhOLead(d)}`, texto, html: casca({ previa: frase, miolo }) };
}

/** Na hora de começar, só para o lead: "estamos na sala". */
export function emailComecando(d: DadosDaReuniao): Email {
  const frase = `Estamos na sala. Sua ${nome(d)} da Demandou com ${d.pessoa.nome} está começando agora.`;
  const entrar = entrarDoLead(d);
  const texto = [frase, "", d.linkReuniao && entrar ? `Entrar: ${entrar}` : semLinkParaOLead(d), "", MARCA.nome, MARCA.site].join("\n");
  const miolo = [
    titulo("Estamos na sala."),
    paragrafo(escapar(frase)),
    d.linkReuniao && entrar ? botao("Entrar agora", entrar) : paragrafo(escapar(semLinkParaOLead(d))),
  ].join("\n");
  return { para: d.lead.email, assunto: `Estamos na sala: ${ehOnboarding(d) ? "seu onboarding" : "sua demonstração"} está começando`, texto, html: casca({ previa: frase, miolo }) };
}

/**
 * 10 minutos depois do início, sem sinal de que começou: uma mensagem só,
 * sem cobrança. Entrar agora ou remarcar com um clique.
 */
export function emailEsperando(d: DadosDaReuniao): Email {
  const frase = `Estamos na sala esperando você para a ${nome(d)} da Demandou com ${d.pessoa.nome}.`;
  const entrar = entrarDoLead(d);
  const remarcar = d.linkRemarcar ?? d.linkGerenciar;
  const texto = [
    frase,
    "",
    ...(d.linkReuniao && entrar ? [`Se ainda der, entre agora: ${entrar}`] : []),
    `Se o horário ficou ruim, escolha outro com um clique: ${remarcar}`,
    "",
    "Se você já entrou, pode ignorar esta mensagem.",
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo("Estamos esperando você."),
    paragrafo(escapar(frase)),
    ...(d.linkReuniao && entrar ? [botao("Entrar agora", entrar)] : []),
    paragrafo(`Se o horário ficou ruim, <a href="${escapar(remarcar)}" style="color:${MARCA.link};font-weight:600">escolha outro com um clique</a>.`),
    paragrafo("Se você já entrou, pode ignorar esta mensagem.", { apagado: true, tamanho: 13 }),
  ].join("\n");
  return { para: d.lead.email, assunto: `Estamos esperando você ${ehOnboarding(d) ? "no onboarding" : "na demonstração"}`, texto, html: casca({ previa: frase, miolo }) };
}

/**
 * Depois da reunião que aconteceu: agradecimento com o próximo passo. No
 * onboarding (05/10) o próximo passo não é proposta: é seguir na plataforma.
 */
export function emailObrigado(d: DadosDaReuniao): Email {
  const frase = `Obrigado pela conversa de hoje ${ehOnboarding(d) ? "no onboarding" : "na demonstração"} da Demandou.`;
  const passo = ehOnboarding(d)
    ? "O próximo passo: entre na plataforma e siga o setup do seu projeto, que já está começado. O primeiro conteúdo sai dali."
    : `O próximo passo: ${proximoPasso(d.pessoa.nome)}.`;
  const duvida = "Se surgir alguma dúvida antes disso, é só responder este e-mail.";
  const texto = [frase, "", passo, duvida, "", MARCA.nome, MARCA.site].join("\n");
  const miolo = [titulo("Obrigado pela conversa."), paragrafo(escapar(frase)), paragrafo(escapar(passo)), paragrafo(escapar(duvida), { apagado: true, tamanho: 14 })].join("\n");
  return { para: d.lead.email, assunto: "Obrigado pela conversa, e o próximo passo", texto, html: casca({ previa: passo, miolo }) };
}

/** Depois da reunião, para o time: marcar "aconteceu" ou "faltou" no painel. */
export function emailResultado(d: DadosDaReuniao, para: string): Email {
  const frase = `${ehOnboarding(d) ? "O onboarding" : "A demonstração"} com ${quemEhOLead(d)} de hoje, às ${horaEmSP(d.inicio)}, terminou.`;
  const quemFaltou = ehOnboarding(d) ? "o cliente" : "o lead";
  const pedido =
    `Marque no painel se aconteceu ou se ${quemFaltou} faltou, para o funil ficar certo. O agradecimento só sai para reunião marcada como começada ou como aconteceu.`;
  const texto = [frase, "", pedido, "", `Painel: ${d.linkAdmin}`].join("\n");
  const miolo = [titulo(`Como foi ${ehOnboarding(d) ? "o onboarding" : "a demonstração"}?`), paragrafo(escapar(frase)), paragrafo(escapar(pedido)), botao("Marcar no painel", d.linkAdmin)].join("\n");
  return { para, assunto: `Marcar resultado: ${ehOnboarding(d) ? "onboarding" : "demonstração"} com ${quemEhOLead(d)}`, texto, html: casca({ previa: frase, miolo }) };
}
