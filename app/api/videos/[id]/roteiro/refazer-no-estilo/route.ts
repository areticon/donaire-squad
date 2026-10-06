export const dynamic = "force-dynamic";

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { acessoAoVideo, despacharPasso } from "@/lib/media/piloto-do-servidor";
import { lerRoteiroDoVideo, marcarCompletoParaRefazer } from "@/lib/media/roteiro-da-edicao";
import { lerComandoDoProjeto } from "@/lib/media/editor-por-comando";
import { estiloQueVale, roteiroDeOutroComando } from "@/lib/media/estilo-do-comando";

/**
 * "REFAZER O ROTEIRO NO ESTILO NOVO" (06/10, relato do Bruno: "mesmo
 * confirmando a mudança, ele não muda os efeitos sugeridos no vídeo"). O
 * vídeo em "roteiro" (ainda não aprovado) cujo completo foi planejado com
 * outro comando: o plano antigo sai, o vídeo volta a "selected" e o piloto
 * roda o passo do roteiro, que planeja só o completo de novo pelo comando de
 * agora (o JEV decide, o redator escreve; nenhuma imagem é gerada aqui).
 * A tela de roteiro já se atualiza sozinha enquanto o vídeo está em
 * "roteirizando". Nada é cobrado do cliente: o roteiro já foi pago.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso || acesso.interno) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: { id: true, status: true, projectId: true, project: { select: { videoEstiloEscolha: true, videoStyle: true } } },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (video.status !== "roteiro") {
    return NextResponse.json({ error: video.status === "roteirizando" ? "O roteiro já está sendo refeito." : "Só dá para refazer o roteiro antes de aprovar." }, { status: 409 });
  }
  const r = await lerRoteiroDoVideo(id);
  if (r?.aprovadoEm) return NextResponse.json({ error: "Este roteiro já foi aprovado." }, { status: 409 });
  const comando = await lerComandoDoProjeto(video.projectId).catch(() => null);
  if (!roteiroDeOutroComando(comando, r?.completo?.comando?.texto)) {
    return NextResponse.json({ error: "O roteiro já está no estilo de agora." }, { status: 409 });
  }
  const marcado = await marcarCompletoParaRefazer(id, estiloQueVale(comando, video.project.videoEstiloEscolha, video.project.videoStyle));
  if (!marcado) return NextResponse.json({ error: "Não há plano do completo para refazer." }, { status: 409 });
  const voltou = await prisma.videoJob.updateMany({ where: { id, status: "roteiro" }, data: { status: "selected", attempts: 0, error: null, startedAt: null } });
  if (voltou.count === 0) return NextResponse.json({ error: "O vídeo mudou de etapa agora há pouco. Recarregue a página." }, { status: 409 });
  after(() => despacharPasso(id, "roteiro"));
  return NextResponse.json({ ok: true });
}
