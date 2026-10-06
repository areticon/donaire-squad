import { config } from "dotenv";
// DEMANDOU_ENV_ARQUIVO (06/10) deixa migrar o banco de dev a partir da máquina
// sem mexer no .env.local: `DEMANDOU_ENV_ARQUIVO=.env.dev.local npx prisma
// migrate deploy`. Sem ela, nada muda: lê o .env.local como sempre.
config({ path: process.env["DEMANDOU_ENV_ARQUIVO"] ?? ".env.local" });
import { defineConfig } from "prisma/config";
import { travarAmbiente } from "./lib/ambiente/trava-do-banco.mjs";

// A trava dos ambientes: migração de dev nunca toca o banco de produção, e a
// de produção nunca toca outro banco. Só lê as variáveis.
travarAmbiente(process.env, { origem: "prisma" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations precisam da conexão direta (porta 5432). O pooler em modo
    // transaction não suporta os comandos DDL que o Prisma Migrate emite.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "",
  },
});
