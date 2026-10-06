// Testes da trava dos ambientes (06/10/2026): app, build, migração e worker.
// Nada aqui abre conexão: a trava só lê texto. As senhas são de mentira.
// Rodar: npx tsx --test scripts/testes/trava-do-ambiente-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REF_DO_BANCO_DE_PRODUCAO,
  ambienteAtual,
  conferirAmbiente,
  ehBancoDeProducao,
  identidadeDoBanco,
  travarAmbiente,
} from "@/lib/ambiente/trava-do-banco.mjs";
import {
  ambienteDoWorker,
  motivoParaRecusarCallback,
  travarPartidaDoWorker,
  REF_DO_BANCO_DE_PRODUCAO as REF_NO_WORKER,
} from "../../worker/src/trava-do-ambiente.mjs";

const PROD_POOLER = `postgresql://postgres.${REF_DO_BANCO_DE_PRODUCAO}:senha@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const PROD_DIRETA = `postgresql://postgres.${REF_DO_BANCO_DE_PRODUCAO}:senha@aws-0-us-east-2.pooler.supabase.com:5432/postgres`;
const PROD_HOST_DB = `postgresql://postgres:senha@db.${REF_DO_BANCO_DE_PRODUCAO}.supabase.co:5432/postgres`;
const DEV_POOLER = "postgresql://postgres.abcdefghijklmnopqrst:senha@aws-0-us-east-2.pooler.supabase.com:6543/postgres";
const DEV_DIRETA = "postgresql://postgres.abcdefghijklmnopqrst:senha@aws-0-us-east-2.pooler.supabase.com:5432/postgres";

const devOk = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  DEMANDOU_AMBIENTE: "dev",
  DATABASE_URL: DEV_POOLER,
  DIRECT_URL: DEV_DIRETA,
  VIDEO_WORKER_URL: "https://video-worker-dev-xxxx.up.railway.app",
  NEXT_PUBLIC_APP_URL: "https://dev.demandou.com",
  BETTER_AUTH_URL: "https://dev.demandou.com",
  STRIPE_SECRET_KEY: "sk_test_x",
};

test("o worker e o app usam o mesmo ref de produção", () => {
  assert.equal(REF_NO_WORKER, REF_DO_BANCO_DE_PRODUCAO);
});

test("reconhece o banco de produção pelo usuário do pooler e pelo host direto", () => {
  assert.equal(identidadeDoBanco(PROD_POOLER)?.ref, REF_DO_BANCO_DE_PRODUCAO);
  assert.ok(ehBancoDeProducao(PROD_POOLER));
  assert.ok(ehBancoDeProducao(PROD_DIRETA));
  assert.ok(ehBancoDeProducao(PROD_HOST_DB));
  assert.ok(!ehBancoDeProducao(DEV_POOLER));
  assert.ok(!ehBancoDeProducao("postgresql://postgres:x@localhost:5432/demandou_dev"));
  assert.ok(!ehBancoDeProducao(undefined));
});

test("o ambiente sai da Vercel e o explícito não pode contradizer", () => {
  assert.equal(ambienteAtual({ VERCEL_ENV: "production" }), "producao");
  assert.equal(ambienteAtual({ VERCEL_ENV: "preview" }), "dev");
  assert.equal(ambienteAtual({}), "local");
  assert.equal(ambienteAtual({ DEMANDOU_AMBIENTE: "dev" }), "dev");
  assert.throws(() => ambienteAtual({ VERCEL_ENV: "production", DEMANDOU_AMBIENTE: "dev" }));
  assert.throws(() => ambienteAtual({ VERCEL_ENV: "preview", DEMANDOU_AMBIENTE: "producao" }));
  assert.throws(() => ambienteAtual({ DEMANDOU_AMBIENTE: "homologacao" }));
});

test("PRODUÇÃO DE HOJE PASSA: Vercel production com o banco de produção", () => {
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    DATABASE_URL: PROD_POOLER,
    DIRECT_URL: PROD_DIRETA,
    NEXT_PUBLIC_APP_URL: "https://demandou.com",
    VIDEO_WORKER_URL: "https://video-worker-production-2eb6.up.railway.app",
    STRIPE_SECRET_KEY: "sk_live_x",
    PUBLICAR_VIA_BLOTATO: "instagram,facebook",
    ZAPSIGN_AMBIENTE: "producao",
  };
  assert.equal(travarAmbiente(env), "producao");
});

test("produção recusa banco que não é o dela", () => {
  const r = conferirAmbiente({ VERCEL_ENV: "production", DATABASE_URL: DEV_POOLER });
  assert.equal(r.problemas.length, 1);
  assert.throws(() => travarAmbiente({ VERCEL_ENV: "production", DATABASE_URL: DEV_POOLER }));
  assert.throws(() => travarAmbiente({ VERCEL_ENV: "production", DATABASE_URL: PROD_POOLER, NEXT_PUBLIC_APP_URL: "https://dev.demandou.com" }));
});

test("dev completo e certo passa", () => {
  assert.equal(travarAmbiente(devOk), "dev");
});

test("dev recusa o banco de produção, pelo pooler, pela conexão direta ou pelo host", () => {
  assert.throws(() => travarAmbiente({ ...devOk, DATABASE_URL: PROD_POOLER }), /BANCO DE PRODUÇÃO/);
  assert.throws(() => travarAmbiente({ ...devOk, DIRECT_URL: PROD_DIRETA }), /BANCO DE PRODUÇÃO/);
  assert.throws(() => travarAmbiente({ ...devOk, DIRECT_URL: PROD_HOST_DB }), /BANCO DE PRODUÇÃO/);
});

test("dev recusa worker, endereço, Stripe, Blotato e ZapSign de produção", () => {
  assert.throws(() => travarAmbiente({ ...devOk, VIDEO_WORKER_URL: "https://video-worker-production-2eb6.up.railway.app" }));
  assert.throws(() => travarAmbiente({ ...devOk, NEXT_PUBLIC_APP_URL: "https://demandou.com" }));
  assert.throws(() => travarAmbiente({ ...devOk, NEXT_PUBLIC_APP_URL: undefined }));
  assert.throws(() => travarAmbiente({ ...devOk, BETTER_AUTH_URL: "https://www.demandou.com" }));
  assert.throws(() => travarAmbiente({ ...devOk, STRIPE_SECRET_KEY: "sk_live_x" }));
  assert.throws(() => travarAmbiente({ ...devOk, PUBLICAR_VIA_BLOTATO: "instagram" }));
  assert.throws(() => travarAmbiente({ ...devOk, PUBLICAR_VIA_BLOTATO_CONTAS: "cmabc" }));
  assert.throws(() => travarAmbiente({ ...devOk, ZAPSIGN_AMBIENTE: "producao" }));
  assert.throws(() => travarAmbiente({ ...devOk, DATABASE_URL: undefined }));
});

test("local com o banco de produção avisa e não bloqueia (a máquina do Bruno hoje)", () => {
  const r = conferirAmbiente({ DATABASE_URL: PROD_POOLER, DIRECT_URL: PROD_DIRETA });
  assert.equal(r.ambiente, "local");
  assert.equal(r.problemas.length, 0);
  assert.equal(r.avisos.length, 1);
});

test("worker: ambiente pelo Railway e a partida sem banco", () => {
  assert.equal(ambienteDoWorker({ RAILWAY_ENVIRONMENT_NAME: "production" }), "producao");
  assert.equal(ambienteDoWorker({ RAILWAY_ENVIRONMENT_NAME: "dev" }), "dev");
  assert.equal(ambienteDoWorker({}), "local");
  assert.throws(() => ambienteDoWorker({ RAILWAY_ENVIRONMENT_NAME: "production", DEMANDOU_AMBIENTE: "dev" }));
  assert.throws(() => ambienteDoWorker({ RAILWAY_ENVIRONMENT_NAME: "dev", DEMANDOU_AMBIENTE: "producao" }));
  // Produção de hoje: o worker não tem variável de banco.
  assert.equal(travarPartidaDoWorker({ RAILWAY_ENVIRONMENT_NAME: "production" }), "producao");
  assert.throws(() => travarPartidaDoWorker({ RAILWAY_ENVIRONMENT_NAME: "dev", DATABASE_URL: PROD_POOLER }));
});

test("worker: callback cruzado é recusado; o de hoje passa", () => {
  assert.equal(motivoParaRecusarCallback("https://demandou.com/api/videos/x/montar-callback", "producao"), null);
  assert.equal(motivoParaRecusarCallback("http://localhost:3000/api/videos/x/montar-callback", "producao"), null);
  assert.ok(motivoParaRecusarCallback("https://dev.demandou.com/api/videos/x/montar-callback", "producao"));
  assert.ok(motivoParaRecusarCallback("https://demandou.com/api/videos/x/montar-callback", "dev"));
  assert.ok(motivoParaRecusarCallback("https://www.demandou.com/api/videos/x/montar-callback", "dev"));
  assert.equal(motivoParaRecusarCallback("https://dev.demandou.com/api/videos/x/montar-callback", "dev"), null);
  assert.equal(motivoParaRecusarCallback("lixo", "dev"), null);
});
