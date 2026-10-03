import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { planoPublico, type PlanoId } from "@/lib/planos";
import { pareceRobo, lerContatos } from "@/lib/admin/painel";

/**
 * O CRM DO PAINEL: quem é quem, e em que pé está com a Demandou.
 *
 * Pedido do Bruno em 23/09: "CRM, lista de leads, clientes ativos em teste,
 * clientes pagantes, por planos", com ações sobre cada conta.
 *
 * ## De onde vem o segmento
 *
 * Do STRIPE para quem tem assinatura, e do banco para o resto. O campo `plan`
 * do banco diz o que o produto libera; ele não diz se a pessoa está em teste,
 * pagando, cancelando ou com a cobrança falhando. Quem sabe isso é a
 * assinatura, e o CRM que lesse só o banco chamaria de "pagante" quem ainda
 * está nos sete dias grátis, que é exatamente a confusão que decide errado
 * quanto se fatura.
 *
 * ## Os segmentos, na ordem em que a pessoa anda
 *
 *   lead        deixou contato (formulário ou demo) e não criou conta
 *   sem_plano   criou conta e nunca assinou
 *   teste       assinatura em `trialing`
 *   pagante     assinatura `active`
 *   cancelando  ativa ou em teste, com `cancel_at_period_end`: o churn que vem
 *   inadimplente `past_due` ou `unpaid`: o cartão falhou
 *   ex_cliente  já teve assinatura no Stripe e hoje não tem nenhuma viva
 *   cortesia    plano liberado pelo admin, sem assinatura no Stripe
 *   interno     papel admin
 *   robo        marcada como robô ou com o padrão (ver `pareceRobo`, refeito em 01/10)
 *
 * Este módulo lê o banco e o Stripe: só servidor.
 */

// Os nomes vivem num módulo sem banco, porque a TELA do CRM também precisa
// deles e componente de cliente não pode importar este arquivo.
import type { Segmento } from "@/lib/admin/segmentos";
export { NOME_DO_SEGMENTO, type Segmento } from "@/lib/admin/segmentos";

/** A assinatura resumida no que o CRM precisa. */
export type ResumoDaAssinatura = {
  id: string;
  status: Stripe.Subscription.Status;
  plano: string | null;
  planoNome: string;
  ciclo: "mensal" | "anual";
  /** Valor por ciclo, em reais. */
  valor: number;
  /** Valor por mês, em reais: o anual dividido por doze. */
  valorMensal: number;
  cancelaNoFim: boolean;
  /** ISO. Fim do período pago ou do teste. */
  fimDoPeriodo: string | null;
  fimDoTeste: string | null;
  inicio: string;
};

export type ClienteDoCrm = {
  /** Null para lead, que ainda não tem conta. */
  id: string | null;
  email: string;
  nome: string | null;
  segmento: Segmento;
  plano: string;
  planoNome: string;
  papel: string;
  creditos: number;
  projetos: number;
  publicados: number;
  cadastroEm: string;
  ultimaCampanha: string | null;
  assinatura: ResumoDaAssinatura | null;
  /** Para lead: o que a pessoa faz ou pediu na demo, e de onde veio. */
  pista: string | null;
  origem: string | null;
};

const VIVAS: Stripe.Subscription.Status[] = ["active", "trialing", "past_due", "unpaid"];

/** O plano pelo preço, sem importar o SDK aqui em cima. */
async function planoDoPreco(priceId: string | undefined) {
  const { planoDoPreco } = await import("@/lib/stripe/aplicar-plano");
  return planoDoPreco(priceId);
}

export async function resumirAssinatura(sub: Stripe.Subscription): Promise<ResumoDaAssinatura> {
  const item = sub.items.data[0];
  const preco = item?.price;
  const plano = await planoDoPreco(preco?.id);
  const anual = preco?.recurring?.interval === "year";
  const valor = (preco?.unit_amount ?? 0) / 100;
  return {
    id: sub.id,
    status: sub.status,
    plano,
    planoNome: plano ? (planoPublico(plano as PlanoId)?.nome ?? plano) : "preço desconhecido",
    ciclo: anual ? "anual" : "mensal",
    valor,
    valorMensal: anual ? Math.round((valor / 12) * 100) / 100 : valor,
    cancelaNoFim: Boolean(sub.cancel_at_period_end),
    fimDoPeriodo: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    fimDoTeste: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    inicio: new Date(sub.created * 1000).toISOString(),
  };
}

/**
 * Todas as assinaturas do Stripe, agrupadas pelo cliente.
 *
 * Paginado até o fim: o painel antigo lia só as 100 primeiras, o que serve
 * hoje e deixa de servir em silêncio no dia em que passar disso.
 */
async function assinaturasPorCliente(): Promise<{ mapa: Map<string, Stripe.Subscription[]>; leu: boolean }> {
  const mapa = new Map<string, Stripe.Subscription[]>();
  try {
    const { getStripe } = await import("@/lib/stripe");
    for await (const sub of getStripe().subscriptions.list({ status: "all", limit: 100 })) {
      const cliente = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      mapa.set(cliente, [...(mapa.get(cliente) ?? []), sub]);
    }
    return { mapa, leu: true };
  } catch (err) {
    console.error("[crm] nao consegui ler as assinaturas do Stripe", err);
    return { mapa, leu: false };
  }
}

/** A assinatura que manda: a viva mais recente, senão a mais recente de todas. */
function principal(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  const ordenadas = [...subs].sort((a, b) => b.created - a.created);
  return ordenadas.find((s) => VIVAS.includes(s.status)) ?? ordenadas[0];
}

function segmentoDaConta(args: {
  papel: string;
  plano: string;
  sub: Stripe.Subscription | null;
  robo: boolean;
}): Segmento {
  if (args.papel === "admin") return "interno";
  const s = args.sub;
  if (s && VIVAS.includes(s.status)) {
    if (s.status === "past_due" || s.status === "unpaid") return "inadimplente";
    if (s.cancel_at_period_end) return "cancelando";
    return s.status === "trialing" ? "teste" : "pagante";
  }
  if (args.plano !== "free") return "cortesia";
  if (s) return "ex_cliente";
  return args.robo ? "robo" : "sem_plano";
}

export async function lerCrm(): Promise<{ clientes: ClienteDoCrm[]; leuStripe: boolean }> {
  const [users, publicados, campanhas, { mapa, leu }, contatos] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        creditsBalance: true,
        stripeCustomerId: true,
        emailVerified: true,
        roboEm: true,
        createdAt: true,
        projects: { select: { id: true } },
      },
    }),
    // Publicado é o que foi ao ar, mesmo arquivado depois (01/10).
    prisma.post.groupBy({ by: ["projectId"], where: { publishedAt: { not: null } }, _count: { _all: true } }),
    prisma.pipelineRun.groupBy({ by: ["projectId"], _max: { startedAt: true } }),
    assinaturasPorCliente(),
    lerContatos(500),
  ]);

  const dono = new Map<string, string>();
  for (const u of users) for (const p of u.projects) dono.set(p.id, u.id);
  const publicadosPorDono = new Map<string, number>();
  for (const p of publicados) {
    const d = dono.get(p.projectId);
    if (d) publicadosPorDono.set(d, (publicadosPorDono.get(d) ?? 0) + p._count._all);
  }
  const ultimaPorDono = new Map<string, Date>();
  for (const r of campanhas) {
    const d = dono.get(r.projectId);
    const quando = r._max.startedAt;
    if (d && quando && (!ultimaPorDono.get(d) || quando > ultimaPorDono.get(d)!)) ultimaPorDono.set(d, quando);
  }

  const contas: ClienteDoCrm[] = [];
  for (const u of users) {
    const sub = u.stripeCustomerId ? principal(mapa.get(u.stripeCustomerId) ?? []) : null;
    const segmento = segmentoDaConta({
      papel: u.role,
      plano: u.plan,
      sub,
      robo: pareceRobo({
        email: u.email, name: u.name, emailVerified: u.emailVerified, projetos: u.projects.length, roboEm: u.roboEm,
      }),
    });
    contas.push({
      id: u.id,
      email: u.email,
      nome: u.name,
      segmento,
      plano: u.plan,
      planoNome: u.plan === "free" ? "Sem plano" : (planoPublico(u.plan as PlanoId)?.nome ?? u.plan),
      papel: u.role,
      creditos: u.creditsBalance,
      projetos: u.projects.length,
      publicados: publicadosPorDono.get(u.id) ?? 0,
      cadastroEm: u.createdAt.toISOString(),
      ultimaCampanha: ultimaPorDono.get(u.id)?.toISOString() ?? null,
      assinatura: sub ? await resumirAssinatura(sub) : null,
      pista: null,
      origem: null,
    });
  }

  // Lead é quem deixou contato e não virou conta. O mesmo e-mail pode ter
  // deixado contato duas vezes (formulário e demo): fica o mais recente.
  const emailsComConta = new Set(users.map((u) => u.email.toLowerCase()));
  const vistos = new Set<string>();
  const leads: ClienteDoCrm[] = [];
  for (const c of contatos) {
    const email = c.email.toLowerCase();
    if (c.virouConta || emailsComConta.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    leads.push({
      id: null,
      email: c.email,
      nome: c.nome,
      segmento: "lead",
      plano: "free",
      planoNome: "Sem conta",
      papel: "lead",
      creditos: 0,
      projetos: 0,
      publicados: 0,
      cadastroEm: c.quando,
      ultimaCampanha: null,
      assinatura: null,
      pista: [c.faz, c.objetivo].filter(Boolean).join(" · ") || null,
      origem: [c.origemDoContato, c.origem].filter(Boolean).join(" · "),
    });
  }

  return { clientes: [...contas, ...leads], leuStripe: leu };
}

// ─────────────────────────────────────────────────────────────────────────────
// A FICHA DE UMA CONTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O QUE OS TERMOS PERMITEM DEVOLVER, calculado e não lembrado.
 *
 * Termos de Uso, itens 5.5 a 5.7 (versão de 23/09):
 *   5.5  arrependimento: 7 dias corridos a contar da PRIMEIRA COBRANÇA de cada
 *        nova contratação, reembolso integral;
 *   5.6  garantia: 30 dias da primeira cobrança, SE a pessoa não publicou nada
 *        que ela mesma aprovou, uma vez por usuário, reembolso integral;
 *   5.7  fora disso, não há reembolso proporcional, e situação excepcional é
 *        decidida caso a caso.
 *
 * O painel mostra qual regra vale ANTES do botão, e o reembolso fora delas
 * exige motivo escrito. É o jeito de o admin não precisar reler os termos a
 * cada chamado, e de o registro dizer por que cada real voltou.
 */
export type Reembolso = {
  primeiraCobranca: string | null;
  /** Soma paga nesta contratação, em reais. */
  pago: number;
  diasDesdeACobranca: number | null;
  regra: "arrependimento" | "garantia" | "fora_da_regra" | "nada_pago";
  explicacao: string;
};

export function regraDeReembolso(args: {
  primeiraCobranca: Date | null;
  pago: number;
  publicados: number;
  agora?: Date;
}): Reembolso {
  const agora = args.agora ?? new Date();
  if (!args.primeiraCobranca || args.pago <= 0) {
    return {
      primeiraCobranca: null,
      pago: 0,
      diasDesdeACobranca: null,
      regra: "nada_pago",
      explicacao: "Nada foi cobrado nesta contratação (teste ou cortesia). Cancelar não gera cobrança nem reembolso.",
    };
  }
  const dias = Math.floor((agora.getTime() - args.primeiraCobranca.getTime()) / 86_400_000);
  const base = { primeiraCobranca: args.primeiraCobranca.toISOString(), pago: args.pago, diasDesdeACobranca: dias };
  if (dias <= 7) {
    return { ...base, regra: "arrependimento", explicacao: `Dia ${dias} depois da primeira cobrança: dentro dos 7 dias do art. 49 do CDC (termos 5.5). Reembolso integral é direito dele.` };
  }
  if (dias <= 30 && args.publicados === 0) {
    return { ...base, regra: "garantia", explicacao: `Dia ${dias} e nenhuma peça publicada: dentro da garantia de 30 dias (termos 5.6). Reembolso integral, uma vez por usuário.` };
  }
  return {
    ...base,
    regra: "fora_da_regra",
    explicacao:
      dias <= 30
        ? `Dia ${dias}, mas já publicou ${args.publicados} peça(s): a garantia não vale (termos 5.6). O normal é cancelar no fim do período (5.4). Reembolso só como exceção, com motivo.`
        : `Dia ${dias}: fora do arrependimento e da garantia. O normal é cancelar no fim do período (5.4). Reembolso só como exceção, com motivo (5.7).`,
  };
}

export type FichaDoCliente = {
  id: string;
  email: string;
  nome: string | null;
  papel: string;
  plano: string;
  creditos: number;
  creditosDeVideo: number;
  cadastroEm: string;
  emailVerificado: boolean;
  projetos: { id: string; nome: string }[];
  /** EQUIPE (01/10): acessos extras vendidos, membros ativos e de quem é membro. */
  acessosExtras: number;
  membrosAtivos: number;
  membroDe: string | null;
  publicados: number;
  stripeCustomerId: string | null;
  assinatura: ResumoDaAssinatura | null;
  /** Assinatura viva impede excluir e impede plano de cortesia. */
  temAssinaturaViva: boolean;
  reembolso: Reembolso;
  extrato: { quando: string; quantidade: number; operacao: string; nota: string | null; saldo: number }[];
  acoes: { quando: string; admin: string; acao: string; detalhe: unknown }[];
};

export async function lerFicha(userId: string): Promise<FichaDoCliente | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      plan: true,
      creditsBalance: true,
      videoCredits: true,
      createdAt: true,
      emailVerified: true,
      stripeCustomerId: true,
      projects: { select: { id: true, name: true } },
      acessosExtras: true,
      equipe: { where: { status: "ativo" }, select: { id: true } },
      participacoes: { where: { status: "ativo" }, select: { dono: { select: { email: true } } } },
    },
  });
  if (!u) return null;

  const [publicados, extrato, acoes] = await Promise.all([
    prisma.post.count({ where: { projectId: { in: u.projects.map((p) => p.id) }, publishedAt: { not: null } } }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { createdAt: true, amount: true, operation: true, note: true, balance: true },
    }),
    prisma.acaoDeAdmin.findMany({
      where: { alvoId: userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { createdAt: true, adminEmail: true, acao: true, detalhe: true },
    }),
  ]);

  let sub: Stripe.Subscription | null = null;
  let primeiraCobranca: Date | null = null;
  let pago = 0;
  if (u.stripeCustomerId) {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({ customer: u.stripeCustomerId, status: "all", limit: 20 });
    sub = principal(subs.data);
    if (sub) {
      // O que foi pago NESTA contratação: faturas pagas da assinatura que
      // manda. Contratação anterior já encerrada não entra na conta de
      // arrependimento, que é "de cada nova contratação" (termos 5.5).
      const faturas = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 100 });
      const cobradas = faturas.data.filter((f) => (f.amount_paid ?? 0) > 0);
      pago = cobradas.reduce((s, f) => s + (f.amount_paid ?? 0), 0) / 100;
      const primeira = cobradas.map((f) => f.status_transitions?.paid_at ?? f.created).sort((a, b) => a - b)[0];
      primeiraCobranca = primeira ? new Date(primeira * 1000) : null;
    }
  }

  return {
    id: u.id,
    email: u.email,
    nome: u.name,
    papel: u.role,
    plano: u.plan,
    creditos: u.creditsBalance,
    creditosDeVideo: u.videoCredits,
    cadastroEm: u.createdAt.toISOString(),
    emailVerificado: u.emailVerified,
    projetos: u.projects.map((p) => ({ id: p.id, nome: p.name })),
    acessosExtras: u.acessosExtras,
    membrosAtivos: u.equipe.length,
    membroDe: u.participacoes[0]?.dono.email ?? null,
    publicados,
    stripeCustomerId: u.stripeCustomerId,
    assinatura: sub ? await resumirAssinatura(sub) : null,
    temAssinaturaViva: Boolean(sub && VIVAS.includes(sub.status)),
    reembolso: regraDeReembolso({ primeiraCobranca, pago, publicados }),
    extrato: extrato.map((t) => ({
      quando: t.createdAt.toISOString(),
      quantidade: t.amount,
      operacao: t.operation,
      nota: t.note,
      saldo: t.balance,
    })),
    acoes: acoes.map((a) => ({ quando: a.createdAt.toISOString(), admin: a.adminEmail, acao: a.acao, detalhe: a.detalhe })),
  };
}
