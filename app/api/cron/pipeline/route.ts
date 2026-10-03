export const dynamic = "force-dynamic";
// A publicação de vídeo no LinkedIn agora ESPERA o processamento (até 3 min
// por vídeo, ver esperarVideoDoLinkedIn). Sem teto explícito a rota caía no
// padrão da plataforma e morreria no meio, com o post preso em "publishing".
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { executeOAuthPostPublish } from "@/lib/publish/oauth-post";
import { vaiPeloBlotato } from "@/lib/publish/roteador";
import { conferirEnviosPendentes, PREFIXO_DO_ENVIO } from "@/lib/publish/via-blotato";
import { medirPostsVencidos } from "@/lib/analytics/agenda-de-medicao";

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

    // Conta ligada só pelo Blotato não tem token próprio e publica assim mesmo
    // (lib/publish/roteador.ts). As outras sem token continuam falhando aqui.
    if (!post.socialAccount.accessToken && !vaiPeloBlotato(post.socialAccount)) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ id: post.id, status: "failed", reason: "No token" });
      continue;
    }

    try {
      // Teto curto para o Blotato: o que não confirmar em 30 s fica
      // "publishing" e é conferido logo abaixo, na próxima volta.
      const saiu = await executeOAuthPostPublish(post, post.socialAccount, { tetoMs: 30_000 });
      const pendente = !saiu.url && saiu.externalId?.startsWith(PREFIXO_DO_ENVIO);
      results.push({ id: post.id, status: pendente ? "publishing" : "published" });
    } catch (err) {
      console.error(`[cron] failed to publish ${post.id}:`, err);
      // O motivo vai para o post: é o que a tela lê para dizer "reconecte"
      // em vez de "publique de novo" (ver safeMarkPostFailed em /publish).
      const motivo = err instanceof Error ? err.message : String(err);
      const metadata = { ...((post.metadata as Record<string, unknown> | null) ?? {}), error: motivo.slice(0, 300) };
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed", metadata: metadata as never },
      });
      results.push({ id: post.id, status: "failed", reason: motivo.slice(0, 120) });
    }
  }

  /**
   * Os envios do Blotato que ainda não tinham resposta (30/09). Sem isto o
   * post ficaria "publishing" para sempre. Não faz nada com o Blotato
   * desligado, e falha aqui não derruba o resto do cron.
   */
  const envios = await conferirEnviosPendentes().catch((e) => {
    console.error("[cron] conferência dos envios do Blotato falhou:", e);
    return [];
  });

  // Os lembretes da demonstração (24 h e 1 h) saíram daqui em 01/10: agora são
  // parte da régua de alertas, no cron de 1 minuto (app/api/cron/fila), que
  // precisa do minuto certo para o "começa em 5 minutos" e o "estamos na sala".

  /**
   * OS NÚMEROS DOS POSTS PUBLICADOS (01/10), aqui e não num cron novo: quem
   * publica é quem sabe quando medir. Cada post é lido 2 h, 24 h, 3 dias, 7
   * dias e 30 dias depois de ir ao ar (lib/analytics/agenda-de-medicao.ts),
   * com teto de 90 s por passada. Vem DEPOIS da publicação para nunca atrasar
   * um post agendado; falha aqui não derruba o resto do cron.
   */
  const medicao = await medirPostsVencidos({ orcamentoMs: 90_000 }).catch((e) => {
    console.error("[cron] medição dos posts falhou:", e instanceof Error ? e.message : e);
    return null;
  });

  return NextResponse.json({
    processed: scheduledPosts.length,
    results,
    ...(envios.length ? { envios } : {}),
    ...(medicao && medicao.vencidos ? { medicao } : {}),
    timestamp: now.toISOString(),
  });
}
