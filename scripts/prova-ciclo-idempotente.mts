/**
 * PROVA: a concessão do ciclo acontece uma vez só, mesmo com chegadas
 * simultâneas (05/10). Ver lib/credits/ciclo.ts.
 *
 *   npx tsx --env-file=.env.local scripts/prova-ciclo-idempotente.mts
 *
 * Cria uma conta descartável (prova-ciclo-<hora>@demandou.invalid), sem
 * Stripe e sem projeto, roda os cenários contra o banco de verdade e APAGA a
 * conta no fim (o extrato vai junto, em cascata). Não toca em nenhuma outra.
 *
 *  1. O defeito de 05/10, reproduzido: o padrão antigo (lê a carteira de
 *     vídeo, depois credita, fora de transação) com duas chegadas juntas.
 *  2. A ativação do Stripe: a volta do checkout, o checkout.session.completed
 *     e o customer.subscription.created ao mesmo tempo, mesma chave e mesmo
 *     início de período. Tem de conceder uma vez.
 *  3. Uma quarta chegada atrasada, com chave diferente (outro evento do mesmo
 *     período), barrada pelo guarda de data.
 *  4. O cron: duas execuções simultâneas com a chave do dia. Uma vez.
 */
import { prisma } from "../lib/db/prisma";
import { concederCiclo } from "../lib/credits/ciclo";

const CREDITOS = 40000;
const COTA = 8320;
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}: ${detalhe}`);
  if (!ok) falhas++;
}

async function extrato(userId: string) {
  return prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { operation: true, carteira: true, amount: true, balance: true, refId: true },
  });
}

const email = `prova-ciclo-${Date.now()}@demandou.invalid`;
const u = await prisma.user.create({ data: { email, name: "Prova do ciclo (descartável)" }, select: { id: true } });
console.log(`conta descartável ${email} (${u.id})`);

try {
  // 1. O padrão antigo, para mostrar que a corrida existia.
  const antigo = async () => {
    const atual = (await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { videoCredits: true } })).videoCredits;
    const falta = COTA - atual;
    if (falta <= 0) return;
    await prisma.user.update({ where: { id: u.id }, data: { videoCredits: { increment: falta } } });
  };
  await Promise.all([antigo(), antigo()]);
  const dobro = (await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { videoCredits: true } })).videoCredits;
  console.log(`      padrão antigo com duas chegadas: carteira de vídeo em ${dobro} (cota ${COTA})`);
  await prisma.user.update({ where: { id: u.id }, data: { videoCredits: 0, creditsBalance: 0, creditsResetAt: null } });

  // 2. A ativação: três chegadas juntas.
  const inicio = new Date(Date.now() - 60_000);
  const chave = `stripe:sub_prova:${Math.floor(inicio.getTime() / 1000)}`;
  const chegada = () =>
    concederCiclo({ userId: u.id, creditos: CREDITOS, cotaDeVideo: COTA, chave, desde: inicio, note: "prova", noteVideo: "prova vídeo" });
  const r = await Promise.all([chegada(), chegada(), chegada()]);
  const s1 = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { creditsBalance: true, videoCredits: true } });
  const e1 = await extrato(u.id);
  confere("ativação, três chegadas", r.filter((x) => x.concedido).length === 1, `${r.filter((x) => x.concedido).length} concessão(ões)`);
  confere("saldo do plano", s1.creditsBalance === CREDITOS, `${s1.creditsBalance}`);
  confere("carteira de vídeo", s1.videoCredits === COTA, `${s1.videoCredits}`);
  confere(
    "extrato",
    e1.filter((t) => t.operation === "renovacao").length === 1 && e1.filter((t) => t.operation === "plano_video").length === 1,
    e1.map((t) => `${t.operation} ${t.amount}`).join(", ")
  );

  // 3. Chegada atrasada com outra chave, mesmo período: o guarda de data barra.
  const r3 = await concederCiclo({ userId: u.id, creditos: CREDITOS, cotaDeVideo: COTA, chave: `${chave}:outro`, desde: inicio, note: "prova" });
  confere("chegada atrasada, outra chave", !r3.concedido, r3.concedido ? "concedeu de novo" : "barrada");

  // 4. O cron: ciclo vencido (31 dias), duas execuções juntas com a chave do dia.
  await prisma.user.update({
    where: { id: u.id },
    data: { creditsResetAt: new Date(Date.now() - 31 * 86400_000), videoCredits: 1000, creditsBalance: 5 },
  });
  const desde = new Date(Date.now() - 30 * 86400_000);
  const chaveDia = `anual:sub_prova:${new Date().toISOString().slice(0, 10)}`;
  const cron = () => concederCiclo({ userId: u.id, creditos: CREDITOS, cotaDeVideo: COTA, chave: chaveDia, desde, note: "prova cron" });
  const r4 = await Promise.all([cron(), cron()]);
  const s4 = await prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { creditsBalance: true, videoCredits: true } });
  confere("cron, duas execuções", r4.filter((x) => x.concedido).length === 1, `${r4.filter((x) => x.concedido).length} concessão(ões)`);
  confere("cron completa o vídeo até a cota, uma vez", s4.videoCredits === COTA, `${s4.videoCredits}`);
  confere("cron repõe o plano", s4.creditsBalance === CREDITOS, `${s4.creditsBalance}`);
} finally {
  await prisma.user.delete({ where: { id: u.id } });
  const sobra = await prisma.creditTransaction.count({ where: { userId: u.id } });
  console.log(`conta descartável apagada (linhas de extrato restantes: ${sobra})`);
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo: cada ciclo concedido uma vez só.");
process.exit(falhas ? 1 : 0);
