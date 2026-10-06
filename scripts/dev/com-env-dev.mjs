#!/usr/bin/env node
/**
 * Roda um comando com as variáveis do banco de DEV (06/10/2026).
 *
 * Lê o `.env.dev.local` (na pasta do projeto ou na pasta principal, quando se
 * roda de um worktree), marca DEMANDOU_AMBIENTE=dev, passa a trava dos
 * ambientes e só então chama o comando. Com DEMANDOU_ENV_ARQUIVO apontando
 * para o mesmo arquivo, o `prisma.config.ts` também deixa de ler o
 * `.env.local` (que é o da produção).
 *
 * Uso:
 *   node scripts/dev/com-env-dev.mjs npx prisma migrate deploy
 *   node scripts/dev/com-env-dev.mjs npx tsx scripts/dev/semente-dev.mts
 *   node scripts/dev/com-env-dev.mjs npx tsx scripts/dev/conferir-banco-dev.mts
 *
 * Não serve para `next dev`: o Next lê o `.env.local` por conta própria e
 * completaria o que faltar com valores de produção (a trava do app recusaria
 * subir, que é o certo). O ambiente de dev de verdade é o Preview em
 * dev.demandou.com.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { travarAmbiente } from "../../lib/ambiente/trava-do-banco.mjs";

const AQUI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function pastaPrincipal() {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd: AQUI, encoding: "utf8" });
  return r.status === 0 ? resolve(AQUI, r.stdout.trim(), "..") : AQUI;
}

const candidatos = [join(AQUI, ".env.dev.local"), join(pastaPrincipal(), ".env.dev.local")];
const arquivo = candidatos.find((c) => existsSync(c));
if (!arquivo) {
  console.error(`[dev] falta o .env.dev.local (procurei em ${candidatos.join(" e ")}). Modelo: docs/ambientes/env.dev.modelo`);
  process.exit(1);
}

const doArquivo = {};
for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  doArquivo[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

const env = { ...process.env, ...doArquivo, DEMANDOU_AMBIENTE: "dev", DEMANDOU_ENV_ARQUIVO: arquivo };
// Nenhuma variável da Vercel herdada da máquina pode fazer o ambiente parecer outro.
delete env.VERCEL_ENV;

const ambiente = travarAmbiente(env, { origem: "com-env-dev" });
if (ambiente !== "dev") {
  console.error(`[dev] ambiente resolvido "${ambiente}", esperado "dev"`);
  process.exit(1);
}

const comando = process.argv.slice(2);
if (!comando.length) {
  console.log(`[dev] trava ok com ${arquivo}; nenhum comando informado`);
  process.exit(0);
}
console.log(`[dev] ${comando.join(" ")} (variáveis de ${arquivo})`);
const r = spawnSync(comando[0], comando.slice(1), { stdio: "inherit", env, shell: true, cwd: AQUI });
process.exit(r.status ?? 1);
