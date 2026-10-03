export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { destinoPorId } from "@/lib/media/destinos";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * Guarda o que o cliente marcou: quais cortes vão, e para onde.
 *
 * Salva a cada clique, sem botão de salvar. O modelo mental que o Bruno pediu é
 * o de revisar uma entrega, e numa revisão ninguém espera ter que confirmar que
 * quer manter o que acabou de marcar. Botão de salvar aqui só criaria a chance
 * de perder a escolha ao sair da tela.
 *
 * A validação existe porque o corpo vem do navegador: destino inventado é
 * ignorado em silêncio, e não gravado, senão a publicação depois tentaria
 * mandar vídeo para uma rede que não existe.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { trecho, publicar, destinos, maisDestino, contaId } = (await req.json().catch(() => ({}))) as {
    trecho?: number;
    publicar?: boolean;
    destinos?: string[];
    /** Um destino a mais para ESTE corte, vindo do card do dia (30/09). */
    maisDestino?: string;
    /** A conta por onde o corte sai nesse destino (perfil ou página). */
    contaId?: string;
  };

  if (typeof trecho !== "number") {
    return NextResponse.json({ error: "Informe o trecho." }, { status: 400 });
  }

  const video = await prisma.videoJob.findFirst({
    where: { id, project: projetoVisivel(userId) },
    select: { clips: true, projectId: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const trechos = (video.clips as unknown as Array<Record<string, unknown>>) ?? [];
  if (!trechos[trecho]) {
    return NextResponse.json({ error: "Trecho não encontrado." }, { status: 404 });
  }

  /**
   * Destino OMITIDO é diferente de destino VAZIO.
   *
   * A tela antiga mandava sempre a lista inteira, então tratar ausência como
   * lista vazia nunca doeu. O card do Gestor manda só `publicar`, e com a regra
   * antiga ligar o interruptor apagava os destinos do corte no mesmo movimento:
   * o corte voltava a valer, sem nenhuma rede para onde ir, e a sincronização
   * do quadro não criava card nenhum. Falha silenciosa, com a tela dizendo que
   * o corte vai ao ar.
   */
  const atuais = (trechos[trecho].destinos as string[] | undefined) ?? [];
  const limpos = destinos === undefined ? atuais : destinos.filter((d) => destinoPorId(d));

  /**
   * O CORTE QUE VAI TAMBÉM PARA OUTRA REDE, marcado no card do dia (30/09).
   *
   * Pedido do Bruno: a plataforma também gera vídeo para o LinkedIn. O dia de
   * vídeo curto sai nas redes do plano; aqui o cliente acrescenta uma rede a
   * UM corte depois de pronto, sem voltar ao passo 4. Não chama IA e não
   * cobra: o vídeo é o mesmo corte vertical e o texto de cada rede o redator
   * já escreveu (`posts.linkedin`). Destino que não publica vídeo é recusado
   * com motivo, em vez de virar card que falha na hora de publicar.
   */
  const extra = typeof maisDestino === "string" ? destinoPorId(maisDestino) : undefined;
  if (maisDestino !== undefined && (!extra || !extra.publicaVideo || extra.id === "youtube")) {
    return NextResponse.json({ error: "Este destino não recebe corte." }, { status: 400 });
  }
  let conta: { id: string } | null = null;
  if (extra && typeof contaId === "string" && contaId) {
    conta = await prisma.socialAccount.findFirst({
      where: { id: contaId, projectId: video.projectId, platform: extra.plataforma },
      select: { id: true },
    });
    if (!conta) return NextResponse.json({ error: "Essa conta não é desta rede neste projeto." }, { status: 400 });
  }
  const doCard = (trechos[trecho].destinosDoCard as string[] | undefined) ?? [];

  trechos[trecho] = {
    ...trechos[trecho],
    publicar: publicar ?? trechos[trecho].publicar ?? false,
    destinos: limpos,
    ...(extra ? { destinosDoCard: [...new Set([...doCard, extra.id])] } : {}),
  };

  await prisma.videoJob.update({
    where: { id },
    data: { clips: trechos as never },
  });

  // As telas SE CONVERSAM: se o vídeo já foi ao quadro, cada marcação aqui
  // cria ou remove o card correspondente lá (só pendentes; aprovado fica).
  await sincronizarQuadroDoVideo(id).catch((e) =>
    console.error(`[destinos][${id}] sincronizar quadro falhou:`, e)
  );

  if (!extra) return NextResponse.json({ ok: true });

  // O post que a sincronização criou (ou o que já existia) para este corte
  // neste destino. Sem card, o corte ainda não foi ao quadro, ou não está
  // aprovado para publicar: a tela diz isso em vez de fingir que marcou.
  const card = await prisma.campaignCard.findFirst({
    where: {
      projectId: video.projectId,
      cardType: "video_clip",
      AND: [
        { metadata: { path: ["videoJobId"], equals: id } },
        { metadata: { path: ["trechoIndice"], equals: trecho } },
        { metadata: { path: ["destino"], equals: extra.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { postId: true },
  });
  if (!card?.postId) {
    return NextResponse.json(
      { error: "Este corte ainda não está no quadro para publicar. Aprove o corte e tente de novo." },
      { status: 409 }
    );
  }
  const post = await prisma.post.findUnique({ where: { id: card.postId }, select: { id: true, status: true } });
  const foraDoDia = post?.status === "cancelled" || post?.status === "rejected";
  const jaSaiu = post?.status === "published" || post?.status === "publishing";
  if (post && !jaSaiu && (conta || foraDoDia)) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        // A conta escolhida no card (perfil ou página). O post nasce sem conta
        // na sincronização, e sem conta ele sai pelo perfil.
        ...(conta ? { socialAccountId: conta.id } : {}),
        // Arquivado ou reprovado antes: marcar de novo no card é trazer de
        // volta como rascunho, porque o arquivar do card promete que é
        // reversível, e sem isto o botão ficaria na tela sem fazer nada.
        ...(foraDoDia ? { status: "draft" } : {}),
      },
    });
  }
  return NextResponse.json({ ok: true, postId: card.postId });
}
