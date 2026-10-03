export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { OpcoesDoTikTok, PrivacidadeDoTikTok } from "@/lib/oauth/tiktok";
import { projetoVisivel } from "@/lib/equipe/conta";

const PRIVACIDADES: PrivacidadeDoTikTok[] = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
];

/**
 * Grava no post as escolhas que a pessoa fez na janela do TikTok
 * (components/social/janela-do-tiktok.tsx), em metadata.tiktok. É daqui que a
 * publicação lê, agora ou no horário agendado (ver opcoesDoTikTokNoPost).
 *
 * As regras que a tela já aplica são conferidas de novo aqui, porque a
 * auditoria do TikTok olha o resultado, e uma chamada direta à rota não pode
 * produzir o que a tela proíbe: conteúdo de marca não pode sair como "somente
 * eu", e a privacidade é obrigatória.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const corpo = (await req.json().catch(() => ({}))) as Partial<OpcoesDoTikTok>;
  if (!corpo.privacidade || !PRIVACIDADES.includes(corpo.privacidade)) {
    return NextResponse.json({ error: "Escolha quem pode ver o vídeo." }, { status: 400 });
  }
  if (corpo.conteudoDeMarca && corpo.privacidade === "SELF_ONLY") {
    return NextResponse.json(
      { error: "Conteúdo de marca não pode sair como \"somente eu\". Escolha outra privacidade." },
      { status: 400 }
    );
  }

  const post = await prisma.post.findFirst({
    where: { id, project: projetoVisivel(userId) },
    select: { id: true, platform: true, mediaType: true, metadata: true },
  });
  if (!post) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  if (post.platform !== "tiktok") {
    return NextResponse.json({ error: "Este post não é do TikTok." }, { status: 400 });
  }

  const opcoes: OpcoesDoTikTok & { escolhidoEm: string } = {
    privacidade: corpo.privacidade,
    permitirComentario: Boolean(corpo.permitirComentario),
    permitirDueto: Boolean(corpo.permitirDueto),
    permitirCostura: Boolean(corpo.permitirCostura),
    suaMarca: Boolean(corpo.suaMarca),
    conteudoDeMarca: Boolean(corpo.conteudoDeMarca),
    // Quando a pessoa escolheu: se o agendamento for longe, o registro mostra
    // que a decisão foi dela e em que dia.
    escolhidoEm: new Date().toISOString(),
  };
  const metadata = { ...((post.metadata as Record<string, unknown> | null) ?? {}), tiktok: opcoes };
  await prisma.post.update({ where: { id }, data: { metadata: metadata as never } });
  return NextResponse.json({ ok: true, tiktok: opcoes });
}
