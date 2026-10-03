import { prisma } from "@/lib/db/prisma";

/**
 * OS POSTS NÃO PODEM PERDER A CONTA QUANDO A CONTA É RECONECTADA.
 *
 * Medido em 21/09 na Areticon: o Bruno desconectou e reconectou o LinkedIn
 * (perfil e página) e o X. Desconectar APAGA a linha da conta, e o post
 * aponta para ela por id, então os posts do dia ficaram sem conta (o Prisma
 * põe `null` no apontador). Reconectar criou linhas NOVAS, com id novo. Na
 * hora de publicar de novo, a tela escolheu "a conta pessoal" para os dois
 * posts do LinkedIn, porque era a única regra que sobrava: o post da PÁGINA
 * da Areticon saiu no perfil dele, duplicado, e a página ficou sem nada.
 *
 * O apontador por id é frágil; o que identifica uma conta é a rede mais o id
 * dela na rede (`platformUserId`), que é a chave que os callbacks já usam no
 * `upsert`. Então:
 *
 *   1. ao DESCONECTAR, cada post da conta recebe a marca `contaDesconectada`
 *      com essa chave, antes de a linha sumir;
 *   2. ao RECONECTAR, os posts órfãos com a marca daquela chave voltam a
 *      apontar para a conta, seja o id o mesmo (upsert achou a linha) ou novo.
 *
 * O post nunca esquece para onde ia. Publicar no lugar errado é pior que não
 * publicar, e foi exatamente isso que aconteceu.
 */

function chave(platform: string, platformUserId: string): string {
  return `${platform}:${platformUserId}`;
}

/** Marca os posts de uma conta que vai ser apagada. Chamar ANTES do delete. */
export async function marcarPostsDaConta(accountId: string): Promise<number> {
  const conta = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { platform: true, platformUserId: true },
  });
  if (!conta || !conta.platformUserId) return 0;
  const posts = await prisma.post.findMany({
    where: { socialAccountId: accountId, status: { notIn: ["published"] } },
    select: { id: true, metadata: true },
  });
  for (const p of posts) {
    const metadata = { ...((p.metadata as Record<string, unknown> | null) ?? {}), contaDesconectada: chave(conta.platform, conta.platformUserId) };
    await prisma.post.update({ where: { id: p.id }, data: { metadata: metadata as never } }).catch(() => {});
  }
  return posts.length;
}

/** Devolve aos posts órfãos a conta que acabou de ser (re)conectada. */
export async function readotarPostsOrfaos(projectId: string, platform: string, platformUserId: string): Promise<number> {
  const conta = await prisma.socialAccount.findUnique({
    where: { projectId_platform_platformUserId: { projectId, platform, platformUserId } },
    select: { id: true },
  });
  if (!conta) return 0;
  const { count } = await prisma.post.updateMany({
    where: {
      projectId,
      platform,
      socialAccountId: null,
      metadata: { path: ["contaDesconectada"], equals: chave(platform, platformUserId) },
    },
    data: { socialAccountId: conta.id },
  });
  if (count > 0) console.log(`[contas] ${count} post(s) de ${platform} voltaram para a conta ${platformUserId}`);
  return count;
}
