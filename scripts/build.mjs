import { spawnSync } from "node:child_process";
import { travarAmbiente } from "../lib/ambiente/trava-do-banco.mjs";

/**
 * O build, com a migração rodando SÓ em produção.
 *
 * Antes o `build` era `prisma migrate deploy && next build`, incondicional, e
 * isso criava dois problemas ao mesmo tempo:
 *
 * 1. **Todo deploy de Preview falhava em 7 segundos**, porque o ambiente de
 *    Preview não tem variável de banco e o migrate morre com "Connection url is
 *    empty" antes de compilar. Consequência prática: o check vermelho de todo
 *    pull request era falso alarme, e ninguém conseguia distinguir um PR
 *    quebrado de um PR bom. Descoberto em 22/08, quando o alarme já era ruído
 *    havia dias.
 *
 * 2. **Se o Preview TIVESSE a variável, seria pior.** O ambiente é um só, então
 *    o Preview apontaria para o banco de produção, e cada deploy de um branch
 *    não mergeado aplicaria as migrações dele em produção. Uma migração de um
 *    experimento abandonado ficaria lá para sempre.
 *
 * Rodar a migração apenas em produção resolve os dois: o Preview compila e
 * verifica tipos de verdade, e nenhum branch mexe no schema antes de ser
 * mergeado.
 *
 * `VERCEL_ENV` é definida pela própria Vercel e vale "production", "preview" ou
 * "development". Fora da Vercel ela não existe, e aí a migração roda, que é o
 * certo para o build local.
 */

/*
 * Ambiente de dev (06/10): o Preview da Vercel vira o ambiente `dev`
 * (dev.demandou.com, banco `demandou-dev`). Ali a migração roda também, porque
 * o banco de dev é descartável e é nele que a migração nova se prova antes de
 * chegar à produção. Só migra com DEMANDOU_AMBIENTE=dev gravado no Preview E
 * com a trava confirmando que o banco não é o de produção; sem isso o Preview
 * continua como antes (compila e pula a migração). Em produção nada muda: a
 * trava só confere que o banco é o de produção, o que ele já é.
 */
const naVercel = Boolean(process.env.VERCEL);
const producao = process.env.VERCEL_ENV === "production";
const ambiente = travarAmbiente(process.env, { origem: "build" });
const previewDeDev =
  naVercel &&
  process.env.VERCEL_ENV === "preview" &&
  ambiente === "dev" &&
  (process.env.DEMANDOU_AMBIENTE ?? "").trim().toLowerCase() === "dev";
const migrar = !naVercel || producao || previewDeDev;

function rodar(comando, args) {
  const r = spawnSync(comando, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (migrar) {
  console.log(
    !naVercel
      ? "[build] fora da Vercel: aplicando migrações"
      : producao
        ? "[build] produção: aplicando migrações"
        : "[build] dev (Preview com banco de dev): aplicando migrações"
  );
  rodar("prisma", ["migrate", "deploy", "--config", "prisma.config.ts"]);
} else {
  console.log(
    `[build] ambiente "${process.env.VERCEL_ENV}": migrações puladas de propósito, ` +
      "para branch nao mergeado nunca mexer no schema de produção"
  );
}

rodar("next", ["build", "--webpack"]);
