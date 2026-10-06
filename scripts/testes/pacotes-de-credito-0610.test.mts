// Testes dos pacotes de crédito avulsos (06/10/2026): a tabela contra a régua
// dos planos, quem pode comprar e o crédito do webhook com um evento simulado
// e assinado como o Stripe assina. Banco em memória; nenhuma chamada ao Stripe.
// Rodar: npx tsx --test scripts/testes/pacotes-de-credito-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { bancoEmMemoria } from "./banco-em-memoria";

const pacotes = await import("@/lib/credits/pacotes-de-credito");
const { creditarPacoteDaSessao, OPERACAO_DA_COMPRA, TIPO_DO_CHECKOUT } = await import("@/lib/credits/pacotes-de-credito-servidor");
const { PLANS } = await import("@/lib/stripe");
const { planoPublico } = await import("@/lib/planos");
const { creditosDaGravacao } = await import("@/lib/credits/o-que-rende");

// ─── a tabela ───

test("a régua do Starter bate com os planos de verdade", () => {
  assert.equal(pacotes.CREDITOS_DO_STARTER_POR_CICLO, PLANS.pro.credits);
  assert.equal(pacotes.REAIS_DO_STARTER_POR_MES, planoPublico("pro").mensal);
});

test("três pacotes em reais: 97, 197 e 597", () => {
  assert.deepEqual(pacotes.PACOTES_DE_CREDITO.map((p) => p.reais), [97, 197, 597]);
});

test("incentivo crescente: quanto maior, mais crédito por real", () => {
  const cpr = pacotes.PACOTES_DE_CREDITO.map(pacotes.creditosPorReal);
  assert.ok(cpr[0] < cpr[1] && cpr[1] < cpr[2], `créditos por real: ${cpr.join(", ")}`);
});

test("a regra contra a assinatura: menor um pouco mais caro, médio perto, maior compensa", () => {
  const [menor, medio, maior] = pacotes.pacotesNaTela();
  assert.ok(menor.contraOPlanoPorcento < 0 && menor.contraOPlanoPorcento >= -15, `menor: ${menor.contraOPlanoPorcento}%`);
  assert.ok(Math.abs(medio.contraOPlanoPorcento) <= 5, `médio: ${medio.contraOPlanoPorcento}%`);
  assert.ok(maior.contraOPlanoPorcento >= 20, `maior: ${maior.contraOPlanoPorcento}%`);
});

test("nenhum pacote chega ao crédito do Pro, e a margem fica acima de 70% no teto de custo", () => {
  const creditosPorRealDoPro = PLANS.business.credits / planoPublico("business").mensal;
  for (const p of pacotes.PACOTES_DE_CREDITO) {
    assert.ok(pacotes.creditosPorReal(p) < creditosPorRealDoPro, `${p.id} passa do Pro`);
    const reaisPorCredito = p.reais / p.creditos;
    assert.ok((reaisPorCredito - 0.027) / reaisPorCredito > 0.7, `${p.id}: margem abaixo de 70%`);
  }
});

test("o ganho em linguagem simples e o que rende", () => {
  const [menor, medio, maior] = pacotes.pacotesNaTela();
  assert.equal(menor.ganho, null);
  assert.equal(medio.ganho, "11% a mais de crédito por real que o pacote de R$ 97");
  assert.equal(maior.ganho, "41% a mais de crédito por real que o pacote de R$ 97");
  assert.equal(menor.rende, "1 corte vertical a mais");
  assert.equal(medio.rende, "3 cortes verticais a mais");
  assert.equal(maior.rende, "1 gravação de 30 minutos com a semana inteira e mais 2 cortes verticais");
  assert.equal(creditosDaGravacao(30), 4150);
});

test("nenhum texto da tabela tem travessão", () => {
  const textos = pacotes.pacotesNaTela().flatMap((p) => [p.nome, p.ganho ?? "", p.rende]);
  for (const t of textos) assert.ok(!t.includes(String.fromCharCode(0x2014)), t);
});

// ─── quem pode comprar ───

const base = { membroDe: null, admin: false, plano: "pro", statusDaAssinatura: "active", emTeste: false, contratoPago: false };

test("assinatura ativa compra", () => {
  assert.equal(pacotes.decidirElegibilidade(base).pode, true);
});

test("membro de equipe não compra e é mandado ao dono, pelo nome", () => {
  const r = pacotes.decidirElegibilidade({ ...base, membroDe: "Matheus" });
  assert.equal(r.pode, false);
  assert.equal(r.motivo, "membro");
  assert.match(String(r.frase), /Peça a Matheus/);
});

test("em teste não compra, pelo banco ou pelo Stripe", () => {
  assert.equal(pacotes.decidirElegibilidade({ ...base, emTeste: true }).motivo, "teste");
  assert.equal(pacotes.decidirElegibilidade({ ...base, statusDaAssinatura: "trialing" }).motivo, "teste");
});

test("cobrança pendente, sem plano e admin não compram", () => {
  assert.equal(pacotes.decidirElegibilidade({ ...base, statusDaAssinatura: "past_due" }).motivo, "pendente");
  assert.equal(pacotes.decidirElegibilidade({ ...base, plano: "free", statusDaAssinatura: null }).motivo, "sem_plano");
  assert.equal(pacotes.decidirElegibilidade({ ...base, statusDaAssinatura: null }).motivo, "sem_plano");
  assert.equal(pacotes.decidirElegibilidade({ ...base, admin: true }).motivo, "interno");
});

test("contrato anual pago por fora (sem assinatura no Stripe) compra", () => {
  assert.equal(pacotes.decidirElegibilidade({ ...base, statusDaAssinatura: null, contratoPago: true }).pode, true);
});

// ─── o webhook, com evento simulado e assinado ───

const SEGREDO = "whsec_teste_local_0610";
const stripeFalso = new Stripe("sk_test_nao_usado", { typescript: true });

function eventoAssinado(sessao: Record<string, unknown>) {
  const payload = JSON.stringify({ id: "evt_teste_1", object: "event", type: "checkout.session.completed", data: { object: sessao } });
  const header = stripeFalso.webhooks.generateTestHeaderString({ payload, secret: SEGREDO });
  // O mesmo caminho da rota: o evento só vale se a assinatura bater.
  return stripeFalso.webhooks.constructEvent(payload, header, SEGREDO);
}

function sessaoPaga(over: Record<string, unknown> = {}) {
  return {
    id: "cs_test_pacote_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_total: 59700,
    metadata: { userId: "dono", tipo: TIPO_DO_CHECKOUT, pacoteId: "creditos-597", creditos: "5200" },
    ...over,
  };
}

test("webhook: o pacote pago entra no saldo pela lib/credits, com extrato", async () => {
  const b = bancoEmMemoria({ users: [{ id: "dono", email: "dono@x.com", plan: "pro", creditsBalance: 120 }] });
  const ev = eventoAssinado(sessaoPaga());
  const r = await creditarPacoteDaSessao(ev.data.object as Stripe.Checkout.Session, b as never);
  assert.deepEqual(r, { creditado: true, motivo: "creditado" });
  assert.equal(b.user.linhas[0].creditsBalance, 5320);
  const linha = b.creditTransaction.linhas[0];
  assert.equal(linha.operation, OPERACAO_DA_COMPRA);
  assert.equal(linha.amount, 5200);
  assert.equal(linha.refId, "cs_test_pacote_1");
  assert.match(String(linha.note), /Pacote de R\$ 597: 5\.200 créditos, pagos R\$\s?597,00 no Stripe/);
});

test("webhook: o Stripe reenvia o mesmo evento (até ao mesmo tempo) e o crédito entra uma vez", async () => {
  const b = bancoEmMemoria({ users: [{ id: "dono", email: "dono@x.com", plan: "pro", creditsBalance: 0 }] });
  const s = eventoAssinado(sessaoPaga()).data.object as Stripe.Checkout.Session;
  const rs = await Promise.all([creditarPacoteDaSessao(s, b as never), creditarPacoteDaSessao(s, b as never), creditarPacoteDaSessao(s, b as never)]);
  assert.equal(rs.filter((r) => r.creditado).length, 1);
  assert.equal(b.user.linhas[0].creditsBalance, 5200);
  assert.equal(b.creditTransaction.linhas.length, 1);
});

test("webhook: pagamento não aprovado, outro tipo de checkout ou metadado ruim não credita", async () => {
  const b = bancoEmMemoria({ users: [{ id: "dono", email: "dono@x.com", creditsBalance: 0 }] });
  const naoPago = eventoAssinado(sessaoPaga({ payment_status: "unpaid" })).data.object as Stripe.Checkout.Session;
  assert.equal((await creditarPacoteDaSessao(naoPago, b as never)).creditado, false);
  const video = eventoAssinado(sessaoPaga({ metadata: { userId: "dono", tipo: "creditos_de_video", creditos: "400" } })).data.object as Stripe.Checkout.Session;
  assert.equal((await creditarPacoteDaSessao(video, b as never)).creditado, false);
  const ruim = eventoAssinado(sessaoPaga({ metadata: { userId: "dono", tipo: TIPO_DO_CHECKOUT, creditos: "-5" } })).data.object as Stripe.Checkout.Session;
  assert.equal((await creditarPacoteDaSessao(ruim, b as never)).creditado, false);
  assert.equal(b.creditTransaction.linhas.length, 0);
});

test("webhook: assinatura errada é recusada antes de qualquer crédito", () => {
  const payload = JSON.stringify({ id: "evt_x", object: "event", type: "checkout.session.completed", data: { object: sessaoPaga() } });
  const header = stripeFalso.webhooks.generateTestHeaderString({ payload, secret: "whsec_outro" });
  assert.throws(() => stripeFalso.webhooks.constructEvent(payload, header, SEGREDO));
});
