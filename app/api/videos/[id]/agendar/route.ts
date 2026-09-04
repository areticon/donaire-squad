export const dynamic = "force-dynamic";
// A parte lenta (pesquisa do Roberto, redação da semana, peças da Diana e
// veredito da Vera) roda em `after`, depois da resposta, e precisa deste teto
// para não morrer no meio.
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";
import { sincronizarQuadroDoVideo } from "@/lib/media/sincronizar-quadro";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";
import { abrirQuadroDoVideo } from "@/lib/media/quadro-do-video";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";

/**
 * Leva os cortes aprovados para o quadro do Gestor de Conteúdo.
 *
 * É a fusão que o Bruno pediu em 22/08: até aqui o vídeo vivia numa aba própria
 * e primitiva enquanto o resto do produto vivia no kanban com agentes,
 * cronograma e prévia por rede. Depois desta rota, os cortes viram cards no
 * mesmo quadro, na linha do Vitor Vídeo.
 *
 * Desde 04/09 esta rota é fina: o run e os cards de espera nascem em
 * `abrirQuadroDoVideo` (chamado já no callback da transcrição, para o quadro
 * não ficar vazio 13 minutos), e os cards do Vitor nascem na sincronização,
 * que é a mesma que roda quando o cliente marca ou desmarca um corte. Aqui só
 * se junta tudo, idempotente: um clique repetido não duplica nada.
 *
 * **Os cortes são espalhados na semana, e não empilhados num dia** (ver
 * `diaDoTrecho`). Sete cortes publicados na mesma manhã é spam, e a plataforma
 * existe justamente para sustentar presença ao longo do tempo.
 */

type TrechoPronto = Trecho & {
  publicar?: boolean;
  midia?: { vertical?: { url: string } | null } | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: { id: true, clips: true, completoUrl: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const trechos = (video.clips as unknown as TrechoPronto[]) ?? [];
  const aprovados = trechos.filter((t) => t.publicar !== false && t.midia?.vertical);
  if (!aprovados.length) {
    return NextResponse.json(
      { error: "Nenhum corte pronto e marcado para publicar." },
      { status: 400 }
    );
  }

  const quadro = await abrirQuadroDoVideo(video.id);
  if (!quadro) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const antes = await prisma.campaignCard.count({
    where: { runId: quadro.runId, cardType: "video_clip" },
  });
  await sincronizarQuadroDoVideo(video.id);
  const depois = await prisma.campaignCard.count({
    where: { runId: quadro.runId, cardType: "video_clip" },
  });

  // O vídeo completo entra pelo mesmo caminho que o callback usa quando ele
  // chega atrasado (aviso em duas fases desde 01/09). Se ainda não terminou de
  // codificar, o callback anexa depois, sozinho.
  if (video.completoUrl) {
    await anexarCompletoAoQuadro(video.id).catch((e) =>
      console.error(`[agendar][${video.id}] completo no quadro falhou:`, e)
    );
  }

  // A esteira é idempotente (Roberto uma vez, cada dia uma vez, Vera só no
  // que mudou), então chamar de novo aqui é o que garante que os dias dos
  // cortes recebam o veredito da Vera mesmo quando a semana de texto já
  // terminou antes dos cortes ficarem prontos.
  after(() => completarEsteiraDoVideo(video.id));

  return NextResponse.json({
    runId: quadro.runId,
    criado: quadro.criado,
    cards: depois - antes,
    cortes: aprovados.length,
  });
}
