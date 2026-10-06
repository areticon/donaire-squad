// Testes do débito do admin, do reset de saldo e da concessão pelo admin
// (06/10/2026). O banco é trocado por um em memória (banco-em-memoria.ts):
// nada aqui toca banco real, Stripe ou IA.
// Rodar: npx tsx --test scripts/testes/creditos-admin-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bancoEmMemoria } from "./banco-em-memoria";

const { debitar, creditar, redefinirSaldo, SaldoInsuficiente } = await import("@/lib/credits");
const { debitoIsento } = await import("@/lib/credits/isencao");
const { concederCreditos, OPERACAO_DA_CONCESSAO } = await import("@/lib/admin/conceder-creditos");
const { RecusaDoAdmin } = await import("@/lib/admin/acoes");

type Db = Parameters<typeof debitar>[1];
const comoBanco = (b: ReturnType<typeof bancoEmMemoria>) => b as unknown as NonNullable<Db>;
const ADMIN = { id: "adm", email: "bruno.donaire@demandou.com" };

function semIsencao<T>(fn: () => Promise<T>): Promise<T> {
  const antes = process.env.ADMIN_SEM_DEBITO;
  delete process.env.ADMIN_SEM_DEBITO;
  return fn().finally(() => {
    if (antes === undefined) delete process.env.ADMIN_SEM_DEBITO;
    else process.env.ADMIN_SEM_DEBITO = antes;
  });
}

function comIsencao<T>(fn: () => Promise<T>): Promise<T> {
  const antes = process.env.ADMIN_SEM_DEBITO;
  process.env.ADMIN_SEM_DEBITO = "1";
  return fn().finally(() => {
    if (antes === undefined) delete process.env.ADMIN_SEM_DEBITO;
    else process.env.ADMIN_SEM_DEBITO = antes;
  });
}

// ─── a configuração ───

test("isenção: só admin, e só com ADMIN_SEM_DEBITO=1", async () => {
  await semIsencao(async () => {
    assert.equal(debitoIsento("admin"), false);
    assert.equal(debitoIsento("user"), false);
  });
  await comIsencao(async () => {
    assert.equal(debitoIsento("admin"), true);
    assert.equal(debitoIsento("user"), false);
    assert.equal(debitoIsento(null), false);
  });
});

// ─── o débito do admin ───

test("admin debita como cliente por padrão: o saldo baixa e o extrato grava o valor", async () => {
  await semIsencao(async () => {
    const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin", creditsBalance: 34487 }] });
    const r = await debitar({ userId: "adm", quantidade: 440, operation: "video_aprovacao", note: "corte" }, comoBanco(b));
    assert.equal(r.balance, 34047);
    assert.equal(b.user.linhas[0].creditsBalance, 34047);
    const linha = b.creditTransaction.linhas[0];
    assert.equal(linha.amount, -440);
    assert.equal(linha.note, "corte");
  });
});

test("admin sem saldo é recusado como cliente, e nada é cobrado", async () => {
  await semIsencao(async () => {
    const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin", creditsBalance: 100 }] });
    await assert.rejects(
      debitar({ userId: "adm", quantidade: 440, operation: "video_aprovacao" }, comoBanco(b)),
      (e: unknown) => e instanceof SaldoInsuficiente && e.disponivel === 100 && e.necessario === 440
    );
    assert.equal(b.user.linhas[0].creditsBalance, 100);
    assert.equal(b.creditTransaction.linhas.length, 0);
  });
});

test("com ADMIN_SEM_DEBITO=1 volta a regra antiga: linha de valor zero e saldo parado", async () => {
  await comIsencao(async () => {
    const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin", creditsBalance: 34487 }] });
    const r = await debitar({ userId: "adm", quantidade: 440, operation: "video_aprovacao" }, comoBanco(b));
    assert.equal(r.balance, 34487);
    assert.equal(b.creditTransaction.linhas[0].amount, 0);
    assert.match(String(b.creditTransaction.linhas[0].note), /Acesso interno: custaria 440 créditos/);
  });
});

test("cliente comum não muda com a configuração", async () => {
  await comIsencao(async () => {
    const b = bancoEmMemoria({ users: [{ id: "c", email: "c@x.com", creditsBalance: 1000 }] });
    await debitar({ userId: "c", quantidade: 15, operation: "campanha" }, comoBanco(b));
    assert.equal(b.user.linhas[0].creditsBalance, 985);
  });
});

// ─── crédito único e reset ───

test("creditar único: a mesma chave duas vezes credita uma vez só", async () => {
  const b = bancoEmMemoria({ users: [{ id: "c", email: "c@x.com", creditsBalance: 10 }] });
  const [a, c] = await Promise.all([
    creditar({ userId: "c", quantidade: 600, operation: "compra_creditos", refId: "cs_1", unico: true }, comoBanco(b)),
    creditar({ userId: "c", quantidade: 600, operation: "compra_creditos", refId: "cs_1", unico: true }, comoBanco(b)),
  ]);
  assert.deepEqual([a.duplicado, c.duplicado].sort(), [false, true]);
  assert.equal(b.user.linhas[0].creditsBalance, 610);
  assert.equal(b.creditTransaction.linhas.length, 1);
});

test("reset: leva o saldo ao valor exato com a diferença no extrato, e só uma vez", async () => {
  const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin", creditsBalance: 34487 }] });
  const r1 = await redefinirSaldo({ userId: "adm", saldo: 20000, operation: "reset_de_saldo", refId: "reset-0610", note: "reset" }, comoBanco(b));
  assert.deepEqual(r1, { antes: 34487, depois: 20000, diferenca: -14487, jaFeito: false });
  assert.equal(b.creditTransaction.linhas[0].amount, -14487);
  assert.equal(b.creditTransaction.linhas[0].balance, 20000);
  // gastou um pouco e rodou o script de novo: nada muda
  b.user.linhas[0].creditsBalance = 19000;
  const r2 = await redefinirSaldo({ userId: "adm", saldo: 20000, operation: "reset_de_saldo", refId: "reset-0610", note: "reset" }, comoBanco(b));
  assert.equal(r2.jaFeito, true);
  assert.equal(b.user.linhas[0].creditsBalance, 19000);
  assert.equal(b.creditTransaction.linhas.length, 1);
});

// ─── a concessão pelo admin ───

test("concessão: credita pela lib/credits, grava extrato e registro do admin", async () => {
  const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin" }, { id: "c", email: "c@x.com", creditsBalance: 50 }] });
  const r = await concederCreditos(ADMIN, "c", { quantidade: 2000, motivo: "Compensação do vídeo travado", chave: "chave-abc-123" }, b as never);
  assert.equal(r.duplicado, false);
  assert.equal(r.saldo, 2050);
  const linha = b.creditTransaction.linhas[0];
  assert.equal(linha.operation, OPERACAO_DA_CONCESSAO);
  assert.equal(linha.amount, 2000);
  assert.equal(linha.refId, "concessao:chave-abc-123");
  assert.match(String(linha.note), /Concedido pelo admin: Compensação do vídeo travado/);
  assert.equal(b.acaoDeAdmin.linhas.length, 1);
  const acao = b.acaoDeAdmin.linhas[0] as { acao: string; alvoId: string; detalhe: { receita: boolean; quantidade: number } };
  assert.equal(acao.acao, "conceder_creditos");
  assert.equal(acao.alvoId, "c");
  assert.equal(acao.detalhe.receita, false);
});

test("concessão: clique duplo (mesma chave, juntos) soma uma vez e registra uma vez", async () => {
  const b = bancoEmMemoria({ users: [{ id: "adm", email: ADMIN.email, role: "admin" }, { id: "c", email: "c@x.com", creditsBalance: 0 }] });
  const pedido = { quantidade: 500, motivo: "Teste do cliente", chave: "chave-dupla-01" };
  const [a, c] = await Promise.all([concederCreditos(ADMIN, "c", pedido, b as never), concederCreditos(ADMIN, "c", pedido, b as never)]);
  assert.deepEqual([a.duplicado, c.duplicado].sort(), [false, true]);
  assert.equal(b.user.linhas[1].creditsBalance, 500);
  assert.equal(b.creditTransaction.linhas.length, 1);
  assert.equal(b.acaoDeAdmin.linhas.length, 1);
});

test("concessão para membro de equipe cai na conta do dono, sem marcar o membro como autor", async () => {
  const b = bancoEmMemoria({
    users: [
      { id: "adm", email: ADMIN.email, role: "admin" },
      { id: "dono", email: "dono@x.com", plan: "business", creditsBalance: 100 },
      { id: "vend", email: "vend@x.com" },
    ],
    membros: [{ id: "m1", userId: "vend", donoId: "dono", status: "ativo", tetoGravacoes: null, tetoCreditos: 1000, todosOsProjetos: true }],
  });
  const r = await concederCreditos(ADMIN, "vend", { quantidade: 300, motivo: "Pedido do dono", chave: "chave-membro-1" }, b as never);
  assert.equal(r.contaId, "dono");
  assert.equal(r.viaDono, "dono@x.com");
  assert.equal(b.user.linhas[1].creditsBalance, 400);
  assert.equal(b.user.linhas[2].creditsBalance, 0);
  const linha = b.creditTransaction.linhas[0];
  assert.equal(linha.userId, "dono");
  assert.equal(linha.autorId ?? null, null);
  const acao = b.acaoDeAdmin.linhas[0] as { alvoId: string; detalhe: { pedidoPara: string } };
  assert.equal(acao.alvoId, "dono");
  assert.equal(acao.detalhe.pedidoPara, "vend@x.com");
});

test("concessão: motivo, valor e chave são obrigatórios", async () => {
  const b = bancoEmMemoria({ users: [{ id: "c", email: "c@x.com" }] });
  await assert.rejects(concederCreditos(ADMIN, "c", { quantidade: 100, motivo: " ", chave: "chave-abc-123" }, b as never), RecusaDoAdmin);
  await assert.rejects(concederCreditos(ADMIN, "c", { quantidade: 0, motivo: "ok ok", chave: "chave-abc-123" }, b as never), RecusaDoAdmin);
  await assert.rejects(concederCreditos(ADMIN, "c", { quantidade: 2.5, motivo: "ok ok", chave: "chave-abc-123" }, b as never), RecusaDoAdmin);
  await assert.rejects(concederCreditos(ADMIN, "c", { quantidade: 60000, motivo: "ok ok", chave: "chave-abc-123" }, b as never), RecusaDoAdmin);
  await assert.rejects(concederCreditos(ADMIN, "c", { quantidade: 100, motivo: "ok ok", chave: "x" }, b as never), RecusaDoAdmin);
  await assert.rejects(concederCreditos(ADMIN, "nao-existe", { quantidade: 100, motivo: "ok ok", chave: "chave-abc-123" }, b as never), RecusaDoAdmin);
  assert.equal(b.creditTransaction.linhas.length, 0);
});
