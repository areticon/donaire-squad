// O DESCARTE DOS AVISOS NA SQL DE VERDADE (07/10/2026), contra o banco de DEV.
//
// Os outros testes do descarte provam a regra com o banco em memória; este
// roda a SQL real: a migração aplicada duas vezes, o NOT EXISTS do sino (o
// descarte gravado ANTES de a notificação existir), o ON CONFLICT DO NOTHING e
// o "Limpar as lidas" com o teto de 500.
//
// SÓ RODA EM DEV, E NUNCA NA PRODUÇÃO: pula sem DEMANDOU_AMBIENTE=dev, e a
// trava dos ambientes (lib/ambiente/trava-do-banco.mjs) recusa qualquer
// DATABASE_URL ou DIRECT_URL que aponte para o banco de produção antes da
// primeira conexão. Cria uma pessoa de teste e a apaga no fim (o CASCADE leva
// as notificações e os descartes dela).
//
// Rodar (com as variáveis do demandou-dev):
//   DEMANDOU_AMBIENTE=dev DEMANDOU_ENV_ARQUIVO=.env.dev.local npx tsx --test scripts/testes/descartar-avisos-sql-0710.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const emDev = (process.env.DEMANDOU_AMBIENTE ?? "").trim().toLowerCase() === "dev";
const motivoParaPular = emDev ? false : "só roda com DEMANDOU_AMBIENTE=dev (nunca na produção)";

test("a SQL do descarte no banco de dev: migração duas vezes, NOT EXISTS, ON CONFLICT e o teto das lidas", { skip: motivoParaPular }, async () => {
  if (process.env.DEMANDOU_ENV_ARQUIVO) {
    const { config } = await import("dotenv");
    config({ path: process.env.DEMANDOU_ENV_ARQUIVO });
  }
  const { travarAmbiente, ehBancoDeProducao } = await import("@/lib/ambiente/trava-do-banco.mjs");
  // A trava antes de qualquer conexão: dev apontando para a produção lança aqui.
  assert.equal(travarAmbiente(process.env, { origem: "teste-sql" }), "dev");
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(url, "sem DATABASE_URL de dev");
  assert.equal(ehBancoDeProducao(url), false);

  // 1) A migração aplicada duas vezes, sem erro.
  const { Client } = await import("pg");
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const sql = readFileSync("prisma/migrations/20261007120000_avisos_descartados/migration.sql", "utf8");
  try {
    await cliente.query(sql);
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }

  const { prisma } = await import("@/lib/db/prisma");
  const { notificacoesDe, notificar } = await import("@/lib/notificacoes");
  const { descartar, descartarLidas, descartadasEntre } = await import("@/lib/avisos/descartes");
  const pessoa = await prisma.user.create({ data: { email: `teste-descarte-${Date.now()}@exemplo.invalid`, name: "Teste do descarte" }, select: { id: true } });
  try {
    // 2) O NOT EXISTS: o descarte gravado ANTES de a notificação existir.
    const chave = `falha:efeitos:teste:${new Date().toISOString()}`;
    assert.deepEqual(await descartar(pessoa.id, [chave]), { lembrado: true });
    await notificar({ userId: pessoa.id, tipo: "falha", titulo: "A montagem dos efeitos parou", texto: "teste", chave });
    await notificar({ userId: pessoa.id, tipo: "cancelado", titulo: "Vídeo cancelado", texto: "teste", chave: "cancelado:teste:1" });
    const lido = await notificacoesDe(pessoa.id);
    assert.deepEqual(lido.itens.map((n) => n.titulo), ["Vídeo cancelado"]);
    assert.equal(lido.naoLidas, 1, "a contagem também sai sem a descartada");

    // 3) O ON CONFLICT DO NOTHING: descartar de novo não duplica nem lança.
    assert.deepEqual(await descartar(pessoa.id, [chave, chave]), { lembrado: true });
    assert.equal(await prisma.avisoDescartado.count({ where: { userId: pessoa.id, chave } }), 1);
    assert.deepEqual([...(await descartadasEntre(pessoa.id, [chave, "dica:nunca"]))], [chave]);

    // 4) O "Limpar as lidas": as 500 mais recentes, numa instrução.
    await prisma.notificacao.createMany({
      data: Array.from({ length: 600 }, (_, i) => ({ userId: pessoa.id, tipo: "estorno", titulo: "Devolvemos", texto: "teste", chave: `estorno:teste-${i}`, lidaEm: new Date() })),
    });
    const r = await descartarLidas(pessoa.id);
    assert.equal(r.lembrado, true);
    assert.equal(r.quantas, 500);
    assert.equal(
      (await descartarLidas(pessoa.id)).quantas,
      0,
      "o teto é das 500 MAIS RECENTES: já descartadas, ficam pelo ON CONFLICT, e as 100 mais antigas não são lidas"
    );
  } finally {
    await prisma.user.delete({ where: { id: pessoa.id } });
    await prisma.$disconnect();
  }
});
