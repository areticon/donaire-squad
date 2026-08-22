import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // Em runtime usamos a connection string do pooler do Supabase (porta 6543).
  // As migrations usam DIRECT_URL (porta 5432), configurada em prisma.config.ts.
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:placeholder@localhost:5432/postgres";

  // Teto de conexões por instância. Sem isto o pool do node-postgres abre até
  // 10 por função, e em serverless cada instância nova multiplica isso: em
  // 21/08 a produção caiu inteira com "max clients reached in session mode",
  // porque a DATABASE_URL estava na 5432 (modo sessão, teto 15) em vez da
  // 6543 (modo transação, que multiplexa). Corrigida a porta, o teto baixo
  // aqui é o cinto de segurança para a próxima vez.
  const adapter = new PrismaPg({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PrismaClient as any)({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
