import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Contenção de abuso da demonstração pública.
 *
 * O endpoint da demo é o único do produto que chama a API do Claude sem sessão.
 * Sem limite, uma pessoa com um laço de repetição gasta a conta inteira em uma
 * madrugada. Por isso são dois tetos, e os dois importam: o por IP evita que um
 * visitante consuma sozinho, e o global protege o caixa contra um ataque
 * distribuído, onde limitar por IP não adianta nada.
 *
 * O contador vive no Postgres em vez de memória porque função serverless não
 * tem memória compartilhada entre instâncias: um contador em módulo zeraria a
 * cada cold start e o limite não valeria nada.
 */

export const LIMITE_POR_IP_DIA = Number(process.env.DEMO_LIMITE_IP ?? 3);
export const LIMITE_GLOBAL_DIA = Number(process.env.DEMO_LIMITE_GLOBAL ?? 200);

/** Nunca guardamos IP em texto puro. O sal vem do segredo da aplicação. */
export function hashIp(ip: string): string {
  const sal = process.env.BETTER_AUTH_SECRET ?? "demandou";
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex").slice(0, 32);
}

/** Pega o IP real atrás do proxy da Vercel. */
export function extrairIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "desconhecido";
}

export type Veredito =
  | { ok: true; ipHash: string }
  | { ok: false; motivo: string; status: number };

export async function verificarLimite(headers: Headers): Promise<Veredito> {
  const ipHash = hashIp(extrairIp(headers));
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [doIp, global] = await Promise.all([
    prisma.demoRun.count({ where: { ipHash, createdAt: { gte: desde } } }),
    prisma.demoRun.count({ where: { createdAt: { gte: desde } } }),
  ]);

  if (doIp >= LIMITE_POR_IP_DIA) {
    return {
      ok: false,
      status: 429,
      motivo: `Você já usou a demonstração ${LIMITE_POR_IP_DIA} vezes hoje. Crie uma conta para continuar, são 7 dias grátis.`,
    };
  }
  if (global >= LIMITE_GLOBAL_DIA) {
    return {
      ok: false,
      status: 503,
      motivo:
        "A demonstração atingiu o limite de hoje. Volte amanhã, ou crie uma conta e use sem limite.",
    };
  }
  return { ok: true, ipHash };
}
