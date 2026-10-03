import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { publicarDiaComoImagem } from "@/lib/media/sair-do-video";

/**
 * A SAIDA do dia que ficou preso esperando video (21/09).
 *
 * Pedido do Bruno: "o usuario fica sem opcao e sem saber o que esta
 * acontecendo". O aviso na peca resolve a segunda parte; esta rota resolve a
 * primeira, trocando as pecas de video pelo quadro (que ja e uma peca de feed
 * inteira), tirando o trabalho da fila e devolvendo os creditos de video.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId, dayOfWeek } = (await req.json().catch(() => ({}))) as {
    runId?: string;
    dayOfWeek?: number;
  };
  if (!runId || !dayOfWeek) {
    return NextResponse.json({ error: "Campanha e dia são obrigatórios." }, { status: 400 });
  }

  const r = await publicarDiaComoImagem({ runId, dayOfWeek, userId });
  if (r.ok) {
    return NextResponse.json({
      pecas: r.pecas,
      creditosDevolvidos: r.creditosDevolvidos,
      trabalhosCancelados: r.trabalhosCancelados,
    });
  }

  switch (r.erro) {
    case "nao_encontrado":
      return NextResponse.json({ error: "Dia não encontrado." }, { status: 404 });
    case "sem_video_no_dia":
      return NextResponse.json({ error: "Este dia não tem peça de vídeo esperando." }, { status: 409 });
    case "sem_quadro":
      return NextResponse.json(
        { error: "Este dia ainda não tem a arte de abertura, então não há o que publicar como imagem. Refaça a peça para gerar a arte." },
        { status: 409 }
      );
  }
}
