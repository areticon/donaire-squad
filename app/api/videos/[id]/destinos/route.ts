export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { destinoPorId } from "@/lib/media/destinos";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";

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
  const { trecho, publicar, destinos } = (await req.json().catch(() => ({}))) as {
    trecho?: number;
    publicar?: boolean;
    destinos?: string[];
  };

  if (typeof trecho !== "number") {
    return NextResponse.json({ error: "Informe o trecho." }, { status: 400 });
  }

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: { clips: true },
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

  trechos[trecho] = {
    ...trechos[trecho],
    publicar: publicar ?? trechos[trecho].publicar ?? false,
    destinos: limpos,
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

  return NextResponse.json({ ok: true });
}
