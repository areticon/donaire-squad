export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";

/**
 * Cron: publica posts com status `scheduled` e horário já passado (OAuth LinkedIn/X).
 *
 * Roda a cada 5 minutos desde 09/09. Até então rodava UMA vez por dia, às 12:00
 * UTC (9h de Brasília), herança do plano Hobby, que só permite cron diário. O
 * efeito, visto pelo Bruno: post agendado para as 10h ficava "agendado" o dia
 * inteiro e só sairia no dia seguinte, às 9h. Um post marcado para as 10h
 * precisa sair às 10h, e não "no próximo dia em que o relógio passar por aqui".
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const candidatos = await prisma.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    select: { id: true },
    take: 20,
  });

  // Reserva ANTES de publicar. Com o cron a cada 5 minutos, duas execuções
  // podem se sobrepor numa publicação lenta, e sem a reserva o mesmo post
  // sairia duas vezes na rede. `updateMany` com o status no filtro é atômico:
  // só uma das duas leva o post.
  const scheduledPosts = [];
  for (const { id } of candidatos) {
    const reservado = await prisma.post.updateMany({
      where: { id, status: "scheduled" },
      data: { status: "publishing" },
    });
    if (reservado.count === 0) continue;
    const post = await prisma.post.findUnique({ where: { id }, include: { socialAccount: true } });
    if (post) scheduledPosts.push(post);
  }

  const results: Array<{ id: string; status: string; reason?: string }> = [];

  for (const post of scheduledPosts) {
    if (!post.socialAccountId || !post.socialAccount) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed", reason: "No account" });
      continue;
    }

    if (!post.socialAccount.accessToken) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed", reason: "No token" });
      continue;
    }

    try {
      await executeOAuthPostPublish(post, post.socialAccount);
      results.push({ id: post.id, status: "published" });
    } catch (err) {
      console.error(`[cron] failed to publish ${post.id}:`, err);
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed" });
    }
  }

  return NextResponse.json({
    processed: scheduledPosts.length,
    results,
    timestamp: now.toISOString(),
  });
}
