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

  const adapter = new PrismaPg({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (PrismaClient as any)({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
