import { spawnSync } from "node:child_process";

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

const naVercel = Boolean(process.env.VERCEL);
const producao = process.env.VERCEL_ENV === "production";
const migrar = !naVercel || producao;

function rodar(comando, args) {
  const r = spawnSync(comando, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (migrar) {
  console.log(
    naVercel
      ? "[build] produção: aplicando migrações"
      : "[build] fora da Vercel: aplicando migrações"
  );
  rodar("prisma", ["migrate", "deploy", "--config", "prisma.config.ts"]);
} else {
  console.log(
    `[build] ambiente "${process.env.VERCEL_ENV}": migrações puladas de propósito, ` +
      "para branch nao mergeado nunca mexer no schema de produção"
  );
}

rodar("next", ["build", "--webpack"]);
