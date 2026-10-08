export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";

/**
 * "DISPENSAR" O VÍDEO QUE FALHOU (03/10, pedido do Bruno: "se dispensei,
 * precisa deletar, vou começar de novo do zero"). Antes o botão só escondia a
 * faixa no navegador, e ela voltava ao recarregar a página.
 *
 * Apaga de vez só o vídeo PARADO EM FALHA e que não deixou nada publicado nem
 * agendado; o que já foi cobrado e não entregue foi devolvido pela régua de
 * estorno no momento da falha. Vídeo em andamento ou pronto não se apaga por aqui.
 *
 * SÓ O DONO DO PROJETO (07/10): o membro da equipe vê o cartão, mas apagar
 * tira o vídeo de todo mundo. Para ele, o X do cartão descarta o aviso só na
 * lista dele (lib/avisos). Na tela, o "Apagar o vídeo" só aparece para o dono,
 * com a confirmação antes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const video = await prisma.videoJob.findFirst({ where: acesso.where, select: { id: true, status: true, project: { select: { userId: true } } } });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  if (!acesso.interno && video.project.userId !== acesso.userId) {
    return NextResponse.json({ error: "Só quem administra a conta apaga um vídeo. O X do cartão tira o aviso só da sua lista." }, { status: 403 });
  }
  if (video.status !== "failed") {
    return NextResponse.json({ error: "Só dá para apagar daqui um vídeo que parou. Este ainda está em andamento ou pronto." }, { status: 409 });
  }
  const pecas = await prisma.post.count({
    where: { metadata: { path: ["videoJobId"], equals: id }, status: { in: ["published", "scheduled"] } },
  });
  if (pecas > 0) {
    return NextResponse.json({ error: "Este vídeo já tem peças publicadas ou agendadas; arquive as peças antes." }, { status: 409 });
  }
  await prisma.post.updateMany({
    where: { metadata: { path: ["videoJobId"], equals: id }, status: { notIn: ["published", "scheduled"] } },
    data: { status: "cancelled" },
  });
  await prisma.videoJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
