/**
 * RESET DO SALDO DE UMA CONTA para o valor do ciclo de um plano (06/10/2026).
 *
 * Feito para a conta admin bruno.donaire@demandou.com, travada em 34.487
 * créditos enquanto o admin não debitava. Com o débito do admin ligado (ver
 * lib/credits/isencao.ts), o saldo passa a ser de verdade, e começa do valor de
 * um ciclo do plano de referência.
 *
 * PLANO DE REFERÊNCIA: o plano gravado na própria conta. Lido em 06/10 (só
 * leitura): a conta admin está com plan = "business", o Pro, de 40.000
 * créditos por ciclo. É o saldo que um cliente do mesmo plano teria logo depois
 * da renovação, que é exatamente a experiência que o admin passa a ter. Conta
 * sem plano da tabela cai no Starter (20.000). Para escolher outro, passe
 * --plano pro (Starter, 20.000), business (Pro, 40.000) ou studio (Enterprise,
 * 60.000).
 *
 * O saldo vai a um valor EXATO pela lib/credits (`redefinirSaldo`): uma linha
 * no extrato com a diferença de verdade (de 34.487 para 40.000 é +5.513),
 * operação "reset_de_saldo". É IDEMPOTENTE: uma vez só por conta (refId
 * "reset-0610"); rodar de novo não mexe em nada e avisa.
 *
 * SEM --aplicar, só lê e mostra o que faria (SELECT puro, nenhum SET).
 *
 *   npx tsx --env-file=.env.local scripts/tmp/reset-saldo-admin-0610.mts bruno.donaire@demandou.com
 *   npx tsx --env-file=.env.local scripts/tmp/reset-saldo-admin-0610.mts bruno.donaire@demandou.com --aplicar
 *   (opcional) --plano pro | business | studio
 */
import { prisma } from "../../lib/db/prisma";
import { redefinirSaldo } from "../../lib/credits";
import { PLANS } from "../../lib/stripe";
import { planoPublico, type PlanoId } from "../../lib/planos";

const args = process.argv.slice(2);
const email = args.find((a) => a.includes("@"))?.trim().toLowerCase();
const aplicar = args.includes("--aplicar");
const iPlano = args.indexOf("--plano");
const planoPedido = iPlano >= 0 ? args[iPlano + 1] : null;

if (!email) {
  console.error("Uso: reset-saldo-admin-0610.mts <email> [--plano pro|business|studio] [--aplicar]");
  process.exit(1);
}
if (planoPedido && !(planoPedido in PLANS)) {
  console.error(`Plano desconhecido: ${planoPedido}. Use pro (Starter), business (Pro) ou studio (Enterprise).`);
  process.exit(1);
}

const REF = "reset-0610";
const OPERACAO = "reset_de_saldo";

try {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, plan: true, creditsBalance: true, acessosExtras: true } });
  if (!u) throw new Error(`Conta não encontrada: ${email}`);
  const plano = (planoPedido ?? (u.plan in PLANS ? u.plan : "pro")) as PlanoId;
  const valor = PLANS[plano].credits;
  const ja = await prisma.creditTransaction.findFirst({ where: { userId: u.id, operation: OPERACAO, refId: REF }, select: { createdAt: true, amount: true } });

  console.log(`Conta: ${u.email} (papel ${u.role}, plano ${u.plan})`);
  console.log(`Saldo hoje: ${u.creditsBalance.toLocaleString("pt-BR")}`);
  console.log(`Alvo: ${valor.toLocaleString("pt-BR")} (um ciclo do ${planoPublico(plano).nome}${planoPedido ? ", escolhido por --plano" : ", o plano da conta"})`);
  if (u.acessosExtras > 0) console.log(`Atenção: a conta tem ${u.acessosExtras} acesso(s) extra(s); o alvo NÃO soma os 2.000 de cada um.`);
  if (ja) {
    console.log(`Já feito em ${ja.createdAt.toISOString()} (diferença ${ja.amount}). Nada a fazer.`);
  } else if (!aplicar) {
    console.log(`Faria: diferença ${(valor - u.creditsBalance).toLocaleString("pt-BR")} no extrato. Rode com --aplicar para gravar.`);
  } else {
    const r = await redefinirSaldo({
      userId: u.id,
      saldo: valor,
      operation: OPERACAO,
      refId: REF,
      note: `Saldo recolocado em um ciclo do ${planoPublico(plano).nome} (${valor.toLocaleString("pt-BR")}): o admin passou a debitar como cliente em 06/10`,
    });
    console.log(r.jaFeito ? "Já tinha sido feito por outra execução. Nada mudou." : `Feito: ${r.antes.toLocaleString("pt-BR")} para ${r.depois.toLocaleString("pt-BR")} (diferença ${r.diferenca.toLocaleString("pt-BR")}).`);
  }
} finally {
  await prisma.$disconnect();
}
