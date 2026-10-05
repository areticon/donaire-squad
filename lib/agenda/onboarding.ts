import { prisma } from "@/lib/db/prisma";
import { contratoDoTokenDeOnboarding } from "@/lib/contratos/links-de-pagamento";
import { ErroDeAgenda, marcarReuniao } from "@/lib/agenda/reunioes";

/**
 * O AGENDAMENTO DO ONBOARDING DO CLIENTE NOVO (05/10/2026).
 *
 * Pedido do dono: quando o contrato é ativado, o e-mail de boas-vindas leva o
 * botão "Agendar o meu onboarding" para /onboarding/agendar/<token>, que
 * mostra o calendário do Bruno (a mesma engine, as mesmas janelas e a mesma
 * fonte de agenda da demonstração), sem pedir nada que o contrato já tem.
 *
 * O CLIENTE ENTRA NA AGENDA COMO LEAD: a tabela de reuniões é uma só e aponta
 * para um Lead (e-mail, nome, empresa), então o cliente ganha, ou reaproveita,
 * a linha de lead com o e-mail dele, marcada como convertida na conta. É o
 * que deixa a régua de alertas, o convite e o painel funcionarem sem forquilha.
 *
 * Só servidor.
 */

/**
 * QUEM FAZ O ONBOARDING: a pessoa do time cujo e-mail é o de
 * ONBOARDING_PESSOA_EMAIL (padrão, o Bruno). Se ninguém bater, a primeira
 * pessoa ativa pela ordem do admin, para a agenda nunca ficar sem dono.
 */
export async function pessoaDoOnboarding(): Promise<{ id: string; nome: string } | null> {
  const email = (process.env.ONBOARDING_PESSOA_EMAIL?.trim() || "bruno.donaire@demandou.com").toLowerCase();
  const ativas = await prisma.pessoaDoTime.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    select: { id: true, nome: true, emailUsuario: true, emailAgenda: true },
  });
  const certa = ativas.find((p) => p.emailUsuario?.toLowerCase() === email || p.emailAgenda?.toLowerCase() === email) ?? ativas[0];
  return certa ? { id: certa.id, nome: certa.nome } : null;
}

export type ContratoDoOnboarding = {
  id: string;
  numero: number;
  plano: string;
  empresa: string | null;
  ativadoEm: Date | null;
  status: string;
  user: { id: string; email: string; name: string | null };
  /** O nome de quem assina, ou o da conta. */
  nome: string | null;
};

/** O contrato do token do link, ou null (token inválido ou contrato inexistente). */
export async function contratoDoOnboarding(token: string | null | undefined): Promise<ContratoDoOnboarding | null> {
  const id = contratoDoTokenDeOnboarding(token);
  if (!id) return null;
  const c = await prisma.contrato.findUnique({
    where: { id },
    select: {
      id: true, numero: true, plano: true, empresa: true, ativadoEm: true, status: true, signatarioNome: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!c) return null;
  return { id: c.id, numero: c.numero, plano: c.plano, empresa: c.empresa, ativadoEm: c.ativadoEm, status: c.status, user: c.user, nome: c.signatarioNome ?? c.user.name };
}

/** O onboarding pode ser marcado: contrato ativado e não cancelado. */
export function onboardingLiberado(c: ContratoDoOnboarding): boolean {
  return Boolean(c.ativadoEm) && c.status !== "cancelado";
}

/**
 * O lead do cliente, pelo e-mail da conta: reaproveita o que existe (quem fez
 * a demonstração já é lead) e só completa nome e empresa que faltam; senão
 * cria o mínimo. Em todo caso, fica ligado à conta (convertedUserId).
 */
export async function leadDoCliente(c: ContratoDoOnboarding): Promise<string> {
  const email = c.user.email.trim().toLowerCase();
  const existente = await prisma.lead.findUnique({ where: { email }, select: { id: true, nome: true, empresa: true, convertedUserId: true } });
  if (existente) {
    const completar = {
      ...(existente.nome ? {} : c.nome ? { nome: c.nome } : {}),
      ...(existente.empresa ? {} : c.empresa ? { empresa: c.empresa } : {}),
      ...(existente.convertedUserId ? {} : { convertedUserId: c.user.id }),
    };
    if (Object.keys(completar).length) await prisma.lead.update({ where: { id: existente.id }, data: completar });
    return existente.id;
  }
  const novo = await prisma.lead.create({
    data: { email, nome: c.nome, empresa: c.empresa, cta: "onboarding", convertedUserId: c.user.id },
    select: { id: true },
  });
  return novo.id;
}

/**
 * A reunião de onboarding que vale mostrar: a marcada (ou que passou há menos
 * de um dia sem começar, caso em que `passou` abre o remarcar), senão a última.
 */
export async function reuniaoDoOnboarding(contratoId: string) {
  const agora = Date.now();
  const marcada = await prisma.reuniaoDeDemonstracao.findFirst({
    where: { contratoId, tipo: "onboarding", status: "marcada", inicio: { gt: new Date(agora - 24 * 3600_000) } },
    orderBy: { inicio: "asc" },
    include: { pessoa: { select: { nome: true } } },
  });
  if (marcada) return { atual: marcada, passou: marcada.inicio.getTime() < agora, passada: null };
  const passada = await prisma.reuniaoDeDemonstracao.findFirst({
    where: { contratoId, tipo: "onboarding", status: { in: ["realizada", "marcada"] } },
    orderBy: { inicio: "desc" },
    include: { pessoa: { select: { nome: true } } },
  });
  return { atual: null, passou: false, passada };
}

/** Marca o onboarding do contrato no horário pedido, com a pessoa do onboarding. */
export async function marcarOnboarding(c: ContratoDoOnboarding, inicioIso: string) {
  if (!onboardingLiberado(c)) throw new ErroDeAgenda("O seu contrato ainda não está ativo. Assim que o pagamento for confirmado, o link passa a funcionar.", 403);
  const pessoa = await pessoaDoOnboarding();
  if (!pessoa) throw new ErroDeAgenda("A agenda do onboarding está sem pessoa configurada. Escreva para contato@demandou.com.", 503);
  const leadId = await leadDoCliente(c);
  return marcarReuniao({ leadId, inicioIso, pessoaId: pessoa.id, tipo: "onboarding", contratoId: c.id });
}
