import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";

/**
 * O FUNIL, medido no proprio banco.
 *
 * Cinco passos, e nada além deles: visita, demo, cadastro, checkout e
 * assinatura. A tentação de instrumentar tudo é o que faz painel virar enfeite;
 * o que decide o negócio é quanto custa levar alguém do primeiro clique até a
 * assinatura, e isso cabe em cinco números.
 *
 * A ORIGEM é gravada na primeira visita, num cookie de 90 dias, e viaja daí em
 * diante. Sem isso o teste de tráfego pago responde "quantos assinaram", que é
 * a pergunta fácil, e não "quanto custou cada um", que é a que decide se
 * continua ou pivota.
 */

/**
 * Os passos, na ordem em que a pessoa anda.
 *
 * "contato" entrou em 10/09 e fica ENTRE demo e cadastro: e o instante em que
 * um desconhecido deixa e-mail (e, desde hoje, telefone) para receber os
 * textos. Sem passo proprio, ele viraria um "demo" contado duas vezes, e a
 * pergunta que decide se o campo de telefone fica (quantos deixam contato, e
 * quantos deixam telefone junto) nao teria onde ser respondida.
 */
export const PASSOS = ["visita", "demo", "contato", "cadastro", "checkout", "assinatura"] as const;
export type Passo = (typeof PASSOS)[number];

/** O cookie de primeira visita. 90 dias porque ciclo de decisão B2B é longo. */
export const COOKIE_ORIGEM = "dmd_origem";
export const DIAS_DE_ORIGEM = 90;

export type Origem = {
  origem?: string | null;
  campanha?: string | null;
  midia?: string | null;
  termo?: string | null;
};

/** Lê a origem de primeira visita do cookie, se existir. */
export async function origemDoCookie(): Promise<Origem> {
  try {
    const cru = (await cookies()).get(COOKIE_ORIGEM)?.value;
    if (!cru) return {};
    const o = JSON.parse(decodeURIComponent(cru)) as Origem;
    return {
      origem: texto(o.origem),
      campanha: texto(o.campanha),
      midia: texto(o.midia),
      termo: texto(o.termo),
    };
  } catch {
    return {};
  }
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 120);
  return t.length ? t : null;
}

/**
 * Registra um passo. NUNCA sobe erro: medir é importante, mas não a ponto de
 * derrubar um checkout porque o banco piscou.
 */
export async function registrarPasso(
  evento: Passo,
  dados: Origem & {
    caminho?: string | null;
    userId?: string | null;
    valorCents?: number | null;
    ipHash?: string | null;
    meta?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    const doCookie = await origemDoCookie();
    let ipHash = dados.ipHash ?? null;
    if (!ipHash) {
      try {
        ipHash = hashIp(extrairIp(await headers()));
      } catch {
        ipHash = null;
      }
    }
    await prisma.funnelEvent.create({
      data: {
        evento,
        origem: texto(dados.origem) ?? doCookie.origem ?? null,
        campanha: texto(dados.campanha) ?? doCookie.campanha ?? null,
        midia: texto(dados.midia) ?? doCookie.midia ?? null,
        termo: texto(dados.termo) ?? doCookie.termo ?? null,
        caminho: texto(dados.caminho),
        ipHash,
        userId: dados.userId ?? null,
        valorCents: dados.valorCents ?? null,
        meta: (dados.meta ?? undefined) as never,
      },
    });
  } catch (e) {
    console.warn("[funil] nao consegui registrar", evento, e instanceof Error ? e.message : e);
  }
}

/**
 * Carimba a origem no usuário, uma vez só.
 *
 * `updateMany` com `origem: null` no filtro em vez de ler e depois escrever:
 * duas abas terminando o cadastro ao mesmo tempo escreveriam as duas, e a
 * primeira visita é a que vale.
 */
export async function carimbarOrigemDoUsuario(userId: string, o: Origem): Promise<void> {
  if (!o.origem && !o.campanha) return;
  try {
    await prisma.user.updateMany({
      where: { id: userId, origem: null },
      data: { origem: o.origem ?? null, campanha: o.campanha ?? null },
    });
  } catch {
    // Medição não derruba cadastro.
  }
}
