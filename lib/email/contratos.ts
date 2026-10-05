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

/**
 * AS BOAS-VINDAS DO CONTRATO (04/10/2026): sai quando o pagamento é
 * confirmado e a conta é ativada. Leva o link de entrada: para quem ainda não
 * tem senha, o link de escolher a senha (o mesmo mecanismo do convite, que
 * vale 1 hora); para quem já tem, o link de entrar. Diz o que vem primeiro na
 * plataforma, que é a jornada de entrada (perfil, referências, redes).
 */
/**
 * O PAGAMENTO DO PARCELADO (05/10/2026): o contrato assinado com a 1ª parcela
 * no Pix e as demais no cartão manda ao cliente a condição por extenso, a
 * chave Pix da 1ª parcela (o comprovante vai por e-mail e a equipe registra
 * no gestor) e o link do cartão, que não vence.
 */
export function linksDoPagamentoParcelado(a: {
  nome: string | null;
  numero: number;
  plano: string;
  entradaCentavos: number;
  parcelas: number;
  parcelaCentavos: number;
  primeiraParcelaEm: Date | null;
  chavePix: string | null;
  linkDoCartao: string;
}): Email {
  const primeiro = (a.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const n = String(a.numero).padStart(4, "0");
  const quando = a.primeiraParcelaEm ? `a primeira em ${dataLonga(a.primeiraParcelaEm)}` : "a primeira um mês depois da 1ª parcela";
  const abertura = `O contrato nº ${n}, plano ${a.plano}, está assinado. Falta o pagamento, em duas partes, para liberar o seu acesso.`;
  const condicao = `1ª parcela de ${reais(a.entradaCentavos)} via Pix, mais ${a.parcelas} parcelas mensais de ${reais(a.parcelaCentavos)} no cartão de crédito em cobrança recorrente (${quando}). Cada mês cobra só a parcela do mês, sem comprometer o limite total do cartão, e a cobrança termina sozinha depois da última parcela.`;
  const passo1 = a.chavePix
    ? `1. Pague a 1ª parcela (${reais(a.entradaCentavos)}) pelo Pix na chave ${a.chavePix} e responda a este e-mail com o comprovante. A nossa equipe registra e confirma.`
    : `1. Pague a 1ª parcela (${reais(a.entradaCentavos)}) pelo Pix: responda a este e-mail e enviamos a chave. Depois mande o comprovante, que a nossa equipe registra e confirma.`;
  const passo2 = "2. Cadastre o cartão das parcelas pelo link abaixo: nada é cobrado antes da data da primeira parcela.";
  const fim = "Com a 1ª parcela confirmada e o cartão cadastrado, a sua conta é ativada e chega o e-mail de boas-vindas. Qualquer dúvida, é só responder a este e-mail.";
  return {
    para: "",
    assunto: `Contrato nº ${n} assinado: como pagar`,
    texto: [`${oi}.`, "", abertura, "", condicao, "", passo1, "", passo2, a.linkDoCartao, "", fim, "", MARCA.nome, MARCA.site].join("\n"),
    html: casca({
      previa: abertura,
      miolo: [
        titulo(`${oi}.`),
        paragrafo(abertura),
        paragrafo(condicao),
        paragrafo(passo1),
        paragrafo(passo2),
        botao("Cadastrar o cartão das parcelas", a.linkDoCartao),
        paragrafo(fim, { apagado: true, tamanho: 13 }),
      ].join("\n"),
    }),
  };
}

export function boasVindasDoContrato(a: { nome: string | null; numero: number; plano: string; fim: Date | null; url: string; definirSenha: boolean; agendaUrl?: string | null }): Email {
  const primeiro = (a.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const n = String(a.numero).padStart(4, "0");
  const abertura = `Recebemos o pagamento do contrato nº ${n} e a sua conta na ${MARCA.nome} está ativa, no plano ${a.plano}${a.fim ? `, até ${dataLonga(a.fim)}` : ""}.`;
  const passo = a.definirSenha
    ? "Para entrar pela primeira vez, escolha a sua senha no botão abaixo. O link vale por 1 hora; se vencer, use \"Esqueci a senha\" na tela de entrada com este mesmo e-mail."
    : "Entre com o seu e-mail e a sua senha de sempre.";
  const jornada = "Logo na entrada, a plataforma conduz o setup do seu projeto, passo a passo: seu perfil, as referências que você admira, a sua marca, a sua voz e o seu estilo, até conectar as redes. É o que deixa o primeiro conteúdo com a sua cara.";
  // O ONBOARDING (05/10): a conversa de entrada com o Bruno, pelo link de agenda.
  const onboarding = a.agendaUrl
    ? "E marque a sua conversa de onboarding: em 30 minutos com o Bruno, alinhamos o seu posicionamento e o plano das primeiras semanas."
    : "E marque a sua conversa de onboarding: responda a este e-mail com dois horários que ficam bons para você, e alinhamos o seu posicionamento e o plano das primeiras semanas.";
  const acao = a.definirSenha ? "Escolher minha senha e entrar" : "Entrar na plataforma";
  return {
    para: "",
    assunto: `Boas-vindas à ${MARCA.nome}: sua conta está ativa`,
    texto: [`${oi}.`, "", abertura, "", passo, "", a.url, "", jornada, "", onboarding, ...(a.agendaUrl ? [a.agendaUrl] : []), "", "Qualquer dúvida, é só responder a este e-mail.", "", MARCA.nome, MARCA.site].join("\n"),
    html: casca({
      previa: abertura,
      miolo: [
        titulo(`${oi}.`),
        paragrafo(abertura),
        paragrafo(passo),
        botao(acao, a.url),
        paragrafo(jornada),
        paragrafo(onboarding),
        ...(a.agendaUrl ? [botao("Agendar o meu onboarding", a.agendaUrl)] : []),
        paragrafo("Qualquer dúvida, é só responder a este e-mail.", { apagado: true, tamanho: 13 }),
      ].join("\n"),
    }),
  };
}
