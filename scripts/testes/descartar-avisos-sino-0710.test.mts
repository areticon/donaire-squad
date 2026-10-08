// O SINO COM O DESCARTE (07/10/2026): a notificação descartada sai da lista e
// da contagem sem que a linha seja apagada (ela é a trava do e-mail), o mesmo
// fato não manda e-mail de novo, a consulta crua cai para a de sempre em
// QUALQUER erro, e as rotas só mexem nas linhas de quem está logado. Nada aqui
// toca banco, rede ou e-mail: os depósitos são em memória.
// Rodar: npx tsx --test scripts/testes/descartar-avisos-sino-0710.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { notificacoesDe, notificar } from "@/lib/notificacoes";
import { responderAoSino } from "@/lib/notificacoes/rota-do-sino";
import { responderAosDescartes, MAXIMO_DE_CHAVES } from "@/lib/avisos/rota-dos-descartes";
import { descartesEmMemoria } from "./descartes-em-memoria";

const silenciar = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const MONTAGEM = "falha:efeitos:v1:2026-10-07T14:00:00.000Z";

test("a descartada sai da lista e da contagem, e a linha continua lá (nenhum delete)", async () => {
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "u1", chave: MONTAGEM, titulo: "A montagem dos efeitos parou" },
      { userId: "u1", chave: "roteiro:v2:r1", titulo: "Roteiro pronto para você aprovar" },
    ],
  });
  const antes = await notificacoesDe("u1", 30, b.sino);
  assert.equal(antes.itens.length, 2);
  assert.equal(antes.naoLidas, 2);
  const id = b.notificacoes.find((n) => n.chave === MONTAGEM)!.id;
  const r = await responderAoSino({ userId: "u1", corpo: { descartar: [id] } }, { descartes: b.deposito });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { ok: true, chaves: [MONTAGEM], lembrado: true });
  const depois = await notificacoesDe("u1", 30, b.sino);
  assert.deepEqual(
    depois.itens.map((n) => n.titulo),
    ["Roteiro pronto para você aprovar"]
  );
  assert.equal(depois.naoLidas, 1);
  assert.equal(b.notificacoes.length, 2, "a linha do sino continua no banco");
  assert.ok(!b.chamadas.includes("apagar"), "nenhum delete foi chamado no descarte");
});

test("o notificar do mesmo fato depois do descarte devolve nova:false e não manda e-mail", async () => {
  const b = descartesEmMemoria();
  const aviso = { userId: "u1", tipo: "roteiro" as const, titulo: "Roteiro pronto", texto: "x", chave: "roteiro:v1:r1", email: (dono: { email: string }) => ({ para: dono.email, assunto: "a", texto: "b" }) };
  assert.deepEqual(await notificar(aviso, b.notificar), { nova: true, emailEnviado: true });
  await descartar(b, "u1", "roteiro:v1:r1");
  assert.deepEqual(await notificar(aviso, b.notificar), { nova: false, emailEnviado: false });
  assert.equal(b.emails.length, 1, "um e-mail só: a chave única continua sendo a trava");
});

async function descartar(b: ReturnType<typeof descartesEmMemoria>, userId: string, chave: string) {
  const id = b.notificacoes.find((n) => n.userId === userId && n.chave === chave)!.id;
  await responderAoSino({ userId, corpo: { descartar: [id] } }, { descartes: b.deposito });
}

test("o descarte feito ANTES de a notificação existir já a deixa fora (o NOT EXISTS)", async () => {
  const b = descartesEmMemoria();
  // A pessoa descarta a faixa; o cron cria a notificação depois.
  const r = await responderAosDescartes(
    { metodo: "POST", userId: "u1", contentType: "application/json", corpo: async () => ({ chaves: [MONTAGEM] }) },
    b.deposito
  );
  assert.equal(r.status, 200);
  await notificar({ userId: "u1", tipo: "falha", titulo: "A montagem dos efeitos parou", texto: "x", chave: MONTAGEM }, b.notificar);
  const lido = await notificacoesDe("u1", 30, b.sino);
  assert.equal(lido.itens.length, 0);
  assert.equal(lido.naoLidas, 0);
});

test("fallback: em QUALQUER erro da consulta crua, o sino volta às consultas de sempre", async () => {
  for (const erro of [
    Object.assign(new Error('relation "avisos_descartados" does not exist'), { code: "P2010" }),
    new Error("syntax error at or near \"EXISTS\""),
    new Error("Connection terminated unexpectedly"),
  ]) {
    const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "roteiro:v1:r1" }] });
    const sino = { ...b.sino, comDescartes: async () => Promise.reject(erro) };
    const lido = await silenciar(() => notificacoesDe("u1", 30, sino));
    assert.equal(lido.itens.length, 1, erro.message);
    assert.equal(lido.naoLidas, 1);
    assert.ok(b.chamadas.includes("sino:semDescartes"));
  }
});

test("POST {descartar} com o id de outra pessoa só mexe nas linhas do próprio userId", async () => {
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "u1", chave: "falha:campanha:r1" },
      { userId: "u2", chave: "falha:campanha:r2" },
    ],
  });
  const daOutra = b.notificacoes.find((n) => n.userId === "u2")!.id;
  const r = await responderAoSino({ userId: "u1", corpo: { descartar: [daOutra] } }, { descartes: b.deposito });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.chaves, []);
  assert.equal(b.descartes.length, 0);
  assert.equal(b.notificacoes.find((n) => n.userId === "u2")!.lidaEm, null);
  assert.equal((await notificacoesDe("u2", 30, b.sino)).itens.length, 1, "a notificação da outra pessoa continua no sino dela");
});

test("{restaurar} traz o item de volta (o Desfazer do sino é pelo id)", async () => {
  const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "cancelado:v1:r1" }] });
  const id = b.notificacoes[0].id;
  await responderAoSino({ userId: "u1", corpo: { descartar: [id] } }, { descartes: b.deposito });
  assert.equal((await notificacoesDe("u1", 30, b.sino)).itens.length, 0);
  const r = await responderAoSino({ userId: "u1", corpo: { restaurar: [id] } }, { descartes: b.deposito });
  assert.deepEqual(r.corpo, { ok: true, chaves: ["cancelado:v1:r1"], lembrado: true });
  const depois = await notificacoesDe("u1", 30, b.sino);
  assert.equal(depois.itens.length, 1);
  // Voltou como estava: não lida, e o contador sobe de novo.
  assert.equal(depois.itens[0].lida, false);
  assert.equal(depois.naoLidas, 1);
});

test("o sino marca o fato que também é faixa (temFaixa) e diz se a pessoa tem alguma notificação", async () => {
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "u1", chave: "falha:efeitos:v1:2026-10-07T14:00:00.000Z", lidaEm: new Date() },
      { userId: "u1", chave: "estorno:t1", lidaEm: new Date() },
    ],
  });
  const lido = await notificacoesDe("u1", 30, b.sino);
  assert.deepEqual(
    lido.itens.map((n) => Boolean(n.temFaixa)).sort(),
    [false, true]
  );
  assert.equal(lido.temAlguma, true);
  // Depois do Limpar as lidas, a montagem continua no sino (sai só pelo X dela, junto com a faixa).
  await responderAoSino({ userId: "u1", corpo: { descartarLidas: true } }, { descartes: b.deposito });
  const depois = await notificacoesDe("u1", 30, b.sino);
  assert.deepEqual(
    depois.itens.map((n) => n.temFaixa),
    [true]
  );
  // Tudo descartado: a lista vazia sabe que a pessoa já recebeu alguma (o "Nada novo").
  await responderAoSino({ userId: "u1", corpo: { descartar: [b.notificacoes[0].id] } }, { descartes: b.deposito });
  const vazio = await notificacoesDe("u1", 30, b.sino);
  assert.equal(vazio.itens.length, 0);
  assert.equal(vazio.temAlguma, true);
  assert.equal((await notificacoesDe("nunca-recebeu", 30, b.sino)).temAlguma, false);
});

test("{descartarLidas} tira as lidas do sino, e {ids}/{todas} continuam marcando como lidas", async () => {
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "u1", chave: "estorno:t1", lidaEm: new Date() },
      { userId: "u1", chave: "estorno:t2", lidaEm: new Date() },
      { userId: "u1", chave: "roteiro:v1:r1" },
    ],
  });
  const r = await responderAoSino({ userId: "u1", corpo: { descartarLidas: true } }, { descartes: b.deposito });
  assert.deepEqual(r.corpo, { ok: true, quantas: 2, lembrado: true });
  assert.deepEqual((await notificacoesDe("u1", 30, b.sino)).itens.length, 1);
  let marcou: unknown = null;
  const m = await responderAoSino({ userId: "u1", corpo: { todas: true } }, { marcar: async (u, ids) => ((marcou = [u, ids]), 1) });
  assert.deepEqual(m.corpo, { ok: true, marcadas: 1 });
  assert.deepEqual(marcou, ["u1", undefined]);
  assert.equal((await responderAoSino({ userId: "u1", corpo: {} })).status, 400);
  assert.equal((await responderAoSino({ userId: null, corpo: { descartar: ["x"] } })).status, 401);
});

// ─── a rota /api/avisos/descartes ───

const json = (corpo: unknown) => ({ contentType: "application/json", corpo: async () => corpo });

test("a rota dos descartes: 401 sem sessão", async () => {
  const b = descartesEmMemoria();
  for (const metodo of ["GET", "POST", "DELETE"] as const) {
    const r = await responderAosDescartes({ metodo, userId: null, ...json({ chaves: ["dica:x"] }), consulta: ["dica:x"] }, b.deposito);
    assert.equal(r.status, 401, metodo);
  }
});

test("a rota dos descartes: 400 com lista vazia, mais de 50, chave inválida ou corpo sem JSON", async () => {
  const b = descartesEmMemoria();
  const pedir = (p: Partial<Parameters<typeof responderAosDescartes>[0]>) => responderAosDescartes({ metodo: "POST", userId: "u1", ...p }, b.deposito);
  assert.equal((await pedir(json({ chaves: [] }))).status, 400);
  assert.equal((await pedir(json({}))).status, 400);
  assert.equal((await pedir(json({ chaves: Array.from({ length: MAXIMO_DE_CHAVES + 1 }, (_, i) => `dica:x${i}`) }))).status, 400);
  assert.equal((await pedir(json({ chaves: ["dica:com espaço"] }))).status, 400);
  assert.equal((await pedir(json({ chaves: ["inventada:x"] }))).status, 400);
  assert.equal((await pedir({ contentType: "text/plain", corpo: async () => ({ chaves: ["dica:x"] }) })).status, 400);
  assert.equal((await pedir({ contentType: null, corpo: async () => ({ chaves: ["dica:x"] }) })).status, 400);
  assert.equal(b.descartes.length, 0);
  assert.equal((await responderAosDescartes({ metodo: "GET", userId: "u1", consulta: [] }, b.deposito)).status, 400);
});

test("a rota dos descartes: POST grava para quem está logado, GET consulta exata, DELETE desfaz", async () => {
  const b = descartesEmMemoria();
  const chaves = ["dica:pode-sair", "falha:campanha:r1"];
  const post = await responderAosDescartes({ metodo: "POST", userId: "u1", ...json({ chaves, userId: "outra-pessoa" }) }, b.deposito);
  assert.equal(post.status, 200);
  assert.deepEqual(post.corpo, { ok: true, lembrado: true });
  assert.ok(b.descartes.every((d) => d.userId === "u1"), "o userId é o da sessão, nunca o do corpo");
  const get = await responderAosDescartes({ metodo: "GET", userId: "u1", consulta: ["dica:pode-sair", "dica:outra"] }, b.deposito);
  assert.deepEqual(get.corpo, { descartadas: ["dica:pode-sair"] });
  const del = await responderAosDescartes({ metodo: "DELETE", userId: "u1", ...json({ chaves: ["dica:pode-sair"] }) }, b.deposito);
  assert.equal(del.status, 200);
  assert.deepEqual(
    b.descartes.map((d) => d.chave),
    ["falha:campanha:r1"]
  );
});

test("a rota dos descartes: 202 sem a tabela (a tela esconde só nesta visita)", async () => {
  const b = descartesEmMemoria();
  const semTabela = b.quebrado(Object.assign(new Error("Raw query failed"), { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "42P01", kind: "TableDoesNotExist" } } } }));
  const r = await silenciar(() => responderAosDescartes({ metodo: "POST", userId: "u1", ...json({ chaves: ["dica:x"] }) }, semTabela));
  assert.equal(r.status, 202);
  assert.deepEqual(r.corpo, { ok: true, lembrado: false });
  const g = await silenciar(() => responderAosDescartes({ metodo: "GET", userId: "u1", consulta: ["dica:x"] }, semTabela));
  assert.deepEqual(g.corpo, { descartadas: [] });
});

test("as rotas de verdade só repassam a sessão (auth) para a regra", async () => {
  const { readFileSync } = await import("node:fs");
  const rota = readFileSync("app/api/avisos/descartes/route.ts", "utf8");
  assert.match(rota, /const \{ userId \} = await auth\(\);/);
  assert.match(rota, /searchParams\.getAll\("c"\)/);
  assert.match(rota, /contentType: req\.headers\.get\("content-type"\)/);
  const sino = readFileSync("app/api/notificacoes/route.ts", "utf8");
  assert.match(sino, /responderAoSino\(\{ userId, corpo \}\)/);
});
