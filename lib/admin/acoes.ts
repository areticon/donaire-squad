import { prisma } from "@/lib/db/prisma";
import { creditar, debitar, reporCiclo, SaldoInsuficiente } from "@/lib/credits";
import { lerFicha } from "@/lib/admin/crm";

/**
 * O QUE O ADMIN PODE FAZER NA CONTA DE OUTRA PESSOA, e o que o impede.
 *
 * Pedido do Bruno em 23/09: remover, adicionar e mexer nos usuários, "é claro
 * que respeitando os termos e o que ele já pagou no Stripe". As travas abaixo
 * são essa frase escrita em código:
 *
 *   • plano PAGO não se troca por aqui. Quem assina pelo Stripe tem o plano
 *     decidido pela assinatura, e o webhook desfaria qualquer troca manual na
 *     próxima renovação. Cortesia só vale para quem não tem assinatura viva;
 *   • exclusão exige que não haja assinatura viva. Apagar a conta de quem está
 *     pagando deixaria o Stripe cobrando alguém que não existe mais;
 *   • reembolso segue os itens 5.5 a 5.7 dos termos, e fora deles pede motivo;
 *   • o admin não tira o próprio acesso de admin, nem se exclui.
 *
 * Toda ação grava em `admin_acoes` quem fez, em quem e com que detalhe.
 * Só servidor: lê o banco e fala com o Stripe.
 */

export class RecusaDoAdmin extends Error {}

export type Admin = { id: string; email: string };

async function registrar(admin: Admin, alvo: { id: string | null; email: string }, acao: string, detalhe: unknown) {
  await prisma.acaoDeAdmin.create({
    data: {
      adminId: admin.id,
      adminEmail: admin.email,
      alvoId: alvo.id,
      alvoEmail: alvo.email,
      acao,
      detalhe: detalhe as object,
    },
  });
}

async function alvo(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, plan: true, stripeCustomerId: true },
  });
  if (!u) throw new RecusaDoAdmin("Conta não encontrada.");
  return u;
}

async function assinaturaViva(customerId: string | null) {
  if (!customerId) return null;
  const { getStripe } = await import("@/lib/stripe");
  const lista = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return lista.data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status)) ?? null;
}

/** Soma ou tira créditos do plano, sempre com motivo no extrato. */
export async function ajustarCreditos(admin: Admin, userId: string, quantidade: number, motivo: string) {
  const u = await alvo(userId);
  if (!Number.isInteger(quantidade) || quantidade === 0) throw new RecusaDoAdmin("Informe um número inteiro diferente de zero.");
  if (Math.abs(quantidade) > 50_000) throw new RecusaDoAdmin("Ajuste acima de 50.000 créditos: faça em partes, para o erro de digitação não virar prejuízo.");
  if (!motivo.trim()) throw new RecusaDoAdmin("Escreva o motivo: ele aparece no extrato do cliente.");
  const nota = `Ajuste do admin: ${motivo.trim()}`;
  try {
    if (quantidade > 0) await creditar({ userId, quantidade, operation: "ajuste_admin", note: nota });
    else await debitar({ userId, quantidade: -quantidade, operation: "ajuste_admin", note: nota });
  } catch (err) {
    if (err instanceof SaldoInsuficiente) throw new RecusaDoAdmin("A conta não tem esse saldo para retirar.");
    throw err;
  }
  await registrar(admin, u, "creditos", { quantidade, motivo: motivo.trim() });
}

/** Dá ou tira o acesso interno. */
export async function mudarPapel(admin: Admin, userId: string, papel: "admin" | "user") {
  const u = await alvo(userId);
  if (u.id === admin.id && papel !== "admin") throw new RecusaDoAdmin("Você não pode tirar o seu próprio acesso de admin.");
  if (u.role === papel) return;
  await prisma.user.update({ where: { id: userId }, data: { role: papel } });
  await registrar(admin, u, "papel", { de: u.role, para: papel });
}

export async function mudarNome(admin: Admin, userId: string, nome: string) {
  const u = await alvo(userId);
  await prisma.user.update({ where: { id: userId }, data: { name: nome.trim() || null } });
  await registrar(admin, u, "nome", { nome: nome.trim() });
}

/**
 * PLANO DE CORTESIA, para quem não paga pelo Stripe.
 *
 * Serve para parceiro, teste interno ou compensação. Repõe os créditos do
 * plano, como uma renovação faria. `free` tira a cortesia e mantém o saldo
 * que sobrou, porque crédito dado não se toma de volta sem motivo escrito, e
 * para isso existe o ajuste.
 */
export async function planoDeCortesia(admin: Admin, userId: string, plano: "free" | "pro" | "business" | "studio", motivo: string) {
  const u = await alvo(userId);
  if (!motivo.trim()) throw new RecusaDoAdmin("Escreva o motivo da cortesia.");
  if (await assinaturaViva(u.stripeCustomerId)) {
    throw new RecusaDoAdmin(
      "Esta conta tem assinatura viva no Stripe: o plano dela é o que ela paga. Troca de plano pago é feita pela própria pessoa, ou pelo painel do Stripe."
    );
  }
  await prisma.user.update({ where: { id: userId }, data: { plan: plano, trialEndsAt: null } });
  if (plano !== "free") {
    const { PLANS } = await import("@/lib/stripe");
    const { creditosDoCiclo } = await import("@/lib/equipe/regras");
    const extras = (await prisma.user.findUnique({ where: { id: userId }, select: { acessosExtras: true } }))?.acessosExtras ?? 0;
    await reporCiclo({ userId, creditos: creditosDoCiclo(PLANS[plano].credits, extras), note: `Cortesia do admin: ${motivo.trim()}` });
  }
  await registrar(admin, u, "cortesia", { de: u.plan, para: plano, motivo: motivo.trim() });
}

/**
 * ACESSOS EXTRAS DA EQUIPE, ativados à mão (01/10).
 *
 * Enquanto o preço do acesso extra não existir no Stripe (decisão de 01/10: não
 * criar preço com a chave de produção sem o Bruno), quem vende o acesso extra
 * cobra por fora e o admin ativa aqui. Cada acesso a mais soma 2.000 créditos
 * na hora (o ciclo em curso, sem proporcional: é a regra mais simples de
 * explicar ao cliente) e passa a entrar em toda reposição. Diminuir não tira
 * créditos do ciclo em curso: crédito dado não se toma de volta sem motivo
 * escrito, e para isso existe o ajuste. Membros acima do novo total continuam
 * entrando; o dono não consegue convidar mais até remover alguém.
 */
export async function definirAcessosExtras(admin: Admin, userId: string, quantidade: number, motivo: string) {
  const u = await alvo(userId);
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 200) throw new RecusaDoAdmin("Informe um número inteiro de 0 a 200.");
  if (!motivo.trim()) throw new RecusaDoAdmin("Escreva o motivo (por exemplo, o pedido ou a nota da venda).");
  const atual = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { acessosExtras: true } })).acessosExtras;
  if (atual === quantidade) throw new RecusaDoAdmin("A conta já tem esse número de acessos extras.");
  await prisma.user.update({ where: { id: userId }, data: { acessosExtras: quantidade } });
  const { ACESSO_EXTRA } = await import("@/lib/equipe/regras");
  if (quantidade > atual) {
    await creditar({
      userId,
      quantidade: (quantidade - atual) * ACESSO_EXTRA.creditosPorMes,
      operation: "acesso_extra",
      note: `${quantidade - atual} acesso(s) extra(s) da equipe: ${motivo.trim()}`,
    });
  }
  await registrar(admin, u, "acessos_extras", { de: atual, para: quantidade, motivo: motivo.trim() });
}

/**
 * CANCELAR NO FIM DO PERÍODO (termos 5.4): a pessoa usa até o fim do que pagou,
 * e a renovação seguinte não acontece. Num teste, o fim do período É o fim do
 * teste, então nada é cobrado. `desfazer` reativa a renovação.
 */
export async function cancelarNoFim(admin: Admin, userId: string, desfazer: boolean) {
  const u = await alvo(userId);
  const viva = await assinaturaViva(u.stripeCustomerId);
  if (!viva) throw new RecusaDoAdmin("Esta conta não tem assinatura viva no Stripe.");
  const { getStripe } = await import("@/lib/stripe");
  const atualizada = await getStripe().subscriptions.update(viva.id, { cancel_at_period_end: !desfazer });
  const { aplicarPlanoDaAssinatura } = await import("@/lib/stripe/aplicar-plano");
  await aplicarPlanoDaAssinatura(atualizada);
  await registrar(admin, u, desfazer ? "reativar_renovacao" : "cancelar_no_fim", { assinatura: viva.id });
}

/**
 * REEMBOLSO INTEGRAL E CANCELAMENTO IMEDIATO.
 *
 * O que volta é o que foi pago NESTA contratação (termos 5.5 e 5.6), cobrança
 * por cobrança, pelo mesmo meio de pagamento. A assinatura é encerrada na hora
 * e o plano cai para "free" já aqui, sem esperar o webhook, para a tela do
 * admin não mostrar um cliente reembolsado com plano ativo.
 *
 * Fora do arrependimento e da garantia, o reembolso é exceção (5.7) e só sai
 * com `excecao` marcada e motivo escrito.
 */
export async function reembolsarECancelar(admin: Admin, userId: string, motivo: string, excecao: boolean) {
  const u = await alvo(userId);
  const ficha = await lerFicha(userId);
  if (!ficha?.assinatura) throw new RecusaDoAdmin("Esta conta não tem assinatura no Stripe.");
  if (!motivo.trim()) throw new RecusaDoAdmin("Escreva o motivo do reembolso.");
  const regra = ficha.reembolso.regra;
  if (regra === "fora_da_regra" && !excecao) {
    throw new RecusaDoAdmin("Fora do arrependimento e da garantia. Para reembolsar mesmo assim, marque como exceção.");
  }

  const { getStripe } = await import("@/lib/stripe");
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(ficha.assinatura.id);

  // Cobrança por cobrança, e só as desta assinatura: pagamento de outra
  // contratação, ou pacote de vídeo avulso, não entra no reembolso do plano.
  const faturas = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 100 });
  const devolvidos: { fatura: string; reais: number; reembolso: string }[] = [];
  for (const f of faturas.data) {
    if ((f.amount_paid ?? 0) <= 0) continue;
    const pagamentos = await stripe.invoicePayments.list({ invoice: f.id!, limit: 10 });
    for (const p of pagamentos.data) {
      const pi = p.payment?.payment_intent;
      if (!pi || p.status !== "paid") continue;
      const r = await stripe.refunds.create({
        payment_intent: typeof pi === "string" ? pi : pi.id,
        reason: "requested_by_customer",
        metadata: { motivo: motivo.trim().slice(0, 450), regra, admin: admin.email },
      });
      devolvidos.push({ fatura: f.id!, reais: (r.amount ?? 0) / 100, reembolso: r.id });
    }
  }

  let final = sub;
  if (["active", "trialing", "past_due", "unpaid"].includes(sub.status)) {
    final = await stripe.subscriptions.cancel(sub.id, { prorate: false });
  }
  const { aplicarPlanoDaAssinatura } = await import("@/lib/stripe/aplicar-plano");
  await aplicarPlanoDaAssinatura(final);

  await registrar(admin, u, "reembolso_e_cancelamento", {
    assinatura: sub.id,
    regra,
    excecao,
    motivo: motivo.trim(),
    devolvidos,
    totalReais: devolvidos.reduce((s, d) => s + d.reais, 0),
  });
  return devolvidos;
}

/**
 * EXCLUIR A CONTA.
 *
 * Só sem assinatura viva: primeiro se cancela (e, se for o caso, se
 * reembolsa), depois se exclui. O cliente no Stripe fica, de propósito: a nota
 * fiscal e o histórico de cobrança são obrigação legal (Política de
 * Privacidade, seção 6), e apagá-lo apagaria a prova do que foi cobrado.
 *
 * O registro de funil perde o vínculo com a pessoa (userId vai a null) e
 * continua contando visita, que é número agregado e não dado pessoal.
 */
export async function excluirConta(admin: Admin, userId: string, confirmacao: string) {
  const u = await alvo(userId);
  if (u.id === admin.id) throw new RecusaDoAdmin("Você não pode excluir a sua própria conta por aqui.");
  if (confirmacao.trim().toLowerCase() !== u.email.toLowerCase()) {
    throw new RecusaDoAdmin("Para excluir, digite o e-mail da conta exatamente.");
  }
  if (await assinaturaViva(u.stripeCustomerId)) {
    throw new RecusaDoAdmin("Esta conta tem assinatura viva no Stripe. Cancele (ou reembolse e cancele) antes de excluir.");
  }
  // Registrar ANTES de apagar: se a exclusão cair no meio, o registro diz o
  // que se tentou; se ela passar, o registro é tudo o que sobra da conta.
  await registrar(admin, u, "exclusao", { plano: u.plan, stripeCustomerId: u.stripeCustomerId });
  await prisma.$transaction([
    prisma.funnelEvent.updateMany({ where: { userId }, data: { userId: null } }),
    prisma.project.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

/**
 * CONVIDAR: criar a conta de alguém e mandar o link para ela escolher a senha.
 *
 * A conta nasce com o e-mail confirmado, porque quem confirma é o admin que
 * digitou; e sem senha, porque senha escolhida por outra pessoa não é senha. O
 * link é o mesmo da recuperação, com texto de convite (ver `emailDeSenha`).
 * Sem plano: a pessoa escolhe e assina como qualquer cliente, ou o admin dá
 * uma cortesia em seguida.
 */
export async function convidar(admin: Admin, email: string, nome: string, papel: "user" | "admin") {
  const limpo = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) throw new RecusaDoAdmin("E-mail inválido.");
  if (await prisma.user.findUnique({ where: { email: limpo }, select: { id: true } })) {
    throw new RecusaDoAdmin("Já existe uma conta com esse e-mail.");
  }
  const criado = await prisma.user.create({
    data: { email: limpo, name: nome.trim() || null, emailVerified: true, role: papel },
    select: { id: true, email: true },
  });
  const { auth } = await import("@/lib/auth");
  await auth.api.requestPasswordReset({ body: { email: limpo, redirectTo: "/redefinir-senha" } });
  await registrar(admin, criado, "convite", { nome: nome.trim(), papel });
  return criado.id;
}

/** Reenvia o link de senha (convite perdido, ou cliente que pediu ajuda). */
export async function reenviarLinkDeSenha(admin: Admin, userId: string) {
  const u = await alvo(userId);
  const { auth } = await import("@/lib/auth");
  await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: "/redefinir-senha" } });
  await registrar(admin, u, "link_de_senha", {});
}
