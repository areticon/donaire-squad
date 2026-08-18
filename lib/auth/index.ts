import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";

const socialProviders =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

// Origens que o better-auth aceita. Sem isso, o navegador recebe "Invalid
// origin" sempre que a porta ou o domínio diferirem do baseURL configurado.
// Em desenvolvimento aceitamos as portas alternativas que o Next escolhe
// sozinho quando a 3000 está ocupada.
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  "https://demandou.com",
  "https://www.demandou.com",
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
      ]),
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    updateAge: 60 * 60 * 24, // renova o cookie 1x/dia
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min sem bater no banco a cada request
    },
  },
  advanced: {
    database: {
      generateId: false, // Prisma gera cuid() — mantém padrão do schema
    },
  },
});

export type Session = typeof auth.$Infer.Session;
