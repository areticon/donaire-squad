import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { legendaComLinkDoCompleto, nomeDoCanal } from "@/lib/media/elo-da-campanha";

/**
 * O LINK DO COMPLETO CHEGA AOS CORTES (05/10, noite, regra 2 do Bruno).
 *
 * Todo corte nasce convidando para o vídeo completo "no meu canal do
 * YouTube", porque na hora em que a legenda é montada o completo ainda é
 * rascunho. Quando o post do completo é PUBLICADO no YouTube (API própria em
 * lib/publish/oauth-post.ts ou a ponte em lib/publish/via-blotato.ts), esta
 * função passa pelos cortes do mesmo vídeo que ainda não foram ao ar e troca
 * o convite pela versão com o link (onde a rede aceita URL) ou pela chamada
 * ao primeiro comentário (LinkedIn, que recebe o link lá). O card do Vitor,
 * que espelha a legenda, acompanha.
 *
 * Corte já publicado não é tocado: o que está no ar fica como foi aprovado.
 * Devolve quantos posts mudaram.
 */
export async function ligarCortesAoCompleto(
  post: { id: string; projectId: string; platform: string; content: string; metadata: unknown },
  url: string | null
): Promise<number> {
  const meta = post.metadata as { videoJobId?: string; gravacaoCompleta?: boolean } | null;
  if (!url || post.platform !== "youtube" || !meta?.gravacaoCompleta || !meta.videoJobId) return 0;

  // O bloco de links do corte já está na legenda desde a sincronização; aqui
  // só o convite muda, e o nome do canal serve às redes que não aceitam URL.
  const projeto = await prisma.project.findUnique({
    where: { id: post.projectId },
    select: { config: true, socialAccounts: { where: { isActive: true }, select: { platform: true, username: true, displayName: true } } },
  });
  const canal = nomeDoCanal(projeto?.socialAccounts ?? [], projeto?.config);
  // O título do completo é a primeira linha do post dele (a que vira o título no YouTube).
  const titulo = post.content.split("\n")[0]?.trim() || null;

  const candidatos = await prisma.post.findMany({
    where: {
      projectId: post.projectId,
      id: { not: post.id },
      status: { in: ["draft", "scheduled"] },
      metadata: { path: ["videoJobId"], equals: meta.videoJobId },
    },
    select: { id: true, platform: true, content: true, metadata: true },
  });

  let ligados = 0;
  for (const c of candidatos) {
    const m = c.metadata as { trechoIndice?: unknown; gravacaoCompleta?: boolean; firstComment?: unknown } | null;
    // Só os cortes: o post do completo e as peças escritas da semana ficam de fora.
    if (m?.gravacaoCompleta || typeof m?.trechoIndice !== "number") continue;
    const novo = legendaComLinkDoCompleto(c.content, { rede: c.platform, titulo, url, canal });
    const dados: Prisma.PostUpdateInput = {};
    if (novo) dados.content = novo;
    if (c.platform === "linkedin") {
      // No LinkedIn o link vai no primeiro comentário, que o publicador lê de metadata.firstComment.
      const atual = typeof m?.firstComment === "string" ? m.firstComment.trim() : "";
      if (!atual.includes(url)) {
        const linha = `Vídeo completo: ${url}`;
        dados.metadata = { ...((c.metadata as Record<string, unknown> | null) ?? {}), firstComment: atual ? `${linha}\n\n${atual}` : linha } as Prisma.InputJsonValue;
      }
    }
    if (!Object.keys(dados).length) continue;
    await prisma.post.update({ where: { id: c.id }, data: dados });
    if (novo) await prisma.campaignCard.updateMany({ where: { postId: c.id }, data: { content: novo } });
    ligados++;
  }
  if (ligados) console.log(`[completo][${post.id}] ${ligados} corte(s) receberam o link do vídeo completo`);
  return ligados;
}
