import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { esconderDiaSemPosts, reabrirDia } from "@/lib/posts/espelhar-no-gestor";
import { formatoValido } from "@/lib/publish/formato-de-destino";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { arteCoerenteComOTexto } from "@/lib/squad/coerencia-da-arte";
import { abrirPedido, executarPedido } from "@/lib/media/pedido-do-card";

/**
 * O CLIENTE EDITOU A LEGENDA E A ARTE FICOU DE OUTRO ASSUNTO? (05/10, noite)
 * O JEV confere a frase desenhada na imagem contra o texto novo; se não
 * conversa mais, a arte é refeita pelo mesmo caminho do chat do card (a frase
 * nasce do texto novo), e o cliente vê no card. Nada aqui segura a resposta.
 */
async function arteAcompanhaOTexto(post: { id: string; projectId: string; runId: string | null; mediaType: string | null; metadata: unknown }, userId: string, texto: string): Promise<void> {
  try {
    if (post.mediaType !== "image" || !post.runId) return;
    const frase = (post.metadata as { frase?: unknown } | null)?.frase;
    if (typeof frase !== "string" || !frase.trim() || !texto.trim()) return;
    const c = await arteCoerenteComOTexto({ projectId: post.projectId, texto, arte: { frase }, etapa: "arte-coerencia" });
    if (c.coerente !== false) return;
    const card = await prisma.campaignCard.findFirst({
      where: { postId: post.id, runId: post.runId, cardType: { notIn: ["media", "publish", "preview", "research"] }, NOT: { status: "archived" } },
      select: { id: true, agentName: true, dayOfWeek: true },
      orderBy: { createdAt: "desc" },
    });
    if (!card?.dayOfWeek) return;
    const mensagem = "A legenda foi editada e a frase da imagem ficou de outro assunto: refaça a arte com uma frase que nasça do texto novo.";
    const aberto = await abrirPedido({ cardId: card.id, mensagem, agenteNome: card.agentName });
    if (aberto.jaFazendo) return;
    await executarPedido({
      cardId: card.id,
      userId,
      mensagem,
      slideIndex: null,
      acoesProntas: [{ tipo: "arte", instrucao: mensagem, cor: null, lamina: null, marcaToda: false }],
    });
  } catch (e) {
    console.warn("[posts] arte acompanha o texto:", e instanceof Error ? e.message : e);
  }
}

const PAST_TOLERANCE_MS = 60_000;

function isPastDate(d: Date): boolean {
  return d.getTime() < Date.now() - PAST_TOLERANCE_MS;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || !(await podeUsarProjeto(userId, { id: post.projectId, userId: post.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || !(await podeUsarProjeto(userId, { id: post.projectId, userId: post.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (body.content !== undefined) updateData.content = body.content;

  // A conta pela qual o post sai. O card do Paulo manda junto com "deixar
  // agendado" porque o cron publica pela conta gravada no post, e um post de
  // vídeo nasce sem conta quando a rede foi conectada depois da esteira: sem
  // isto ele entrava na fila e falhava na hora com "No account".
  if (typeof body.socialAccountId === "string" && body.socialAccountId) {
    const conta = await prisma.socialAccount.findUnique({ where: { id: body.socialAccountId } });
    if (!conta || conta.projectId !== post.projectId) {
      return NextResponse.json({ error: "Esta conta não pertence a este projeto." }, { status: 403 });
    }
    updateData.socialAccountId = conta.id;
  }

  // ONDE A PEÇA CAI NA REDE (item 13, 29/09): o card do dia troca o lugar
  // de um post que ainda não saiu. Mora em `metadata.formato`, que é o que o
  // publicador lê (`formatoDoPost`); o valor passa por `formatoValido`, então
  // pedido de lugar que a rede não tem vira feed em vez de gravar lixo.
  if (typeof body.formato === "string") {
    if (post.status === "published" || post.status === "publishing") {
      return NextResponse.json({ error: "Este post já saiu: o lugar dele não muda mais." }, { status: 409 });
    }
    updateData.metadata = {
      ...((post.metadata as Record<string, unknown> | null) ?? {}),
      formato: formatoValido(post.platform, body.formato),
    };
  }

  if (body.cancelSchedule) {
    // Volta a rascunho NO MESMO DIA (03/10): com a data apagada, o post saía
    // de todos os dias do quadro e o card ficava vazio. Aprovar de novo leva
    // ao próximo horário livre quando este já passou.
    updateData.status = "draft";
  } else if (body.scheduledAt !== undefined) {
    const d = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (d && isPastDate(d)) {
      return NextResponse.json(
        { error: "Não é possível agendar no passado. Escolha data e hora atuais ou futuras." },
        { status: 400 }
      );
    }
    updateData.scheduledAt = d;
    // Reagendar: mantém fila se já estava scheduled; senão permanece rascunho até aprovação
    if (d && post.status === "scheduled") {
      updateData.status = "scheduled";
    } else if (d && post.status !== "published") {
      updateData.status = "draft";
    }
  }

  if (body.status !== undefined) {
    if (body.status === "scheduled") {
      const at = (updateData.scheduledAt as Date | undefined) ?? post.scheduledAt;
      if (!at) {
        return NextResponse.json(
          { error: "Defina data e hora de publicação antes de aprovar o agendamento." },
          { status: 400 }
        );
      }
      if (isPastDate(new Date(at))) {
        return NextResponse.json(
          { error: "Não é possível agendar no passado." },
          { status: 400 }
        );
      }
      updateData.status = "scheduled";
    } else {
      updateData.status = body.status;
    }
  }

  // Um post que FOI AO AR e está arquivado só sai do arquivo como publicado
  // (01/10): virar rascunho ou agendado faria a mesma peça sair duas vezes na
  // rede, e o publishedAt continua dizendo que ela já saiu.
  if (post.status === "cancelled" && post.publishedAt && typeof updateData.status === "string" && updateData.status !== "cancelled") {
    updateData.status = "published";
    delete updateData.scheduledAt;
  }

  const updated = await prisma.post.update({
    where: { id },
    data: updateData,
  });

  // A aba de posts e o Gestor falam de objetos diferentes (posts e cards), e
  // esta é a tradução entre eles. Arquivar o último post vivo do dia esconde o
  // dia da agenda; um post que volta de arquivado reabre o dia. Ver
  // lib/posts/espelhar-no-gestor.ts.
  // O TEXTO EDITADO É O MESMO NO CARD (03/10): o quadro titula a peça pelo
  // card do redator, e editar só o post deixava o título antigo no quadro.
  if (typeof body.content === "string" && body.content !== post.content) {
    await prisma.campaignCard.updateMany({
      where: { postId: id, cardType: { notIn: ["media", "publish", "preview", "research"] } },
      data: { content: body.content },
    });
    const texto = body.content;
    after(() => arteAcompanhaOTexto({ id: post.id, projectId: post.projectId, runId: post.runId, mediaType: post.mediaType, metadata: post.metadata }, userId, texto));
  }

  const virouArquivado = updated.status === "cancelled" && post.status !== "cancelled";
  const saiuDoArquivo = post.status === "cancelled" && updated.status !== "cancelled";
  if (virouArquivado) await esconderDiaSemPosts(updated.runId, updated.dayOfWeek);
  if (saiuDoArquivo) await reabrirDia(updated.runId, updated.dayOfWeek);

  return NextResponse.json({ post: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });

  if (!post || !(await podeUsarProjeto(userId, { id: post.projectId, userId: post.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Post que foi ao ar não se apaga (01/10), mesmo arquivado: apagar o
  // registro não tira a publicação da rede, só faz a plataforma esquecer que
  // ela existe e leva junto o histórico dos números. Arquivar é o caminho.
  if (post.publishedAt || post.status === "published") {
    return NextResponse.json(
      { error: "Este post já foi publicado na rede e não pode ser apagado daqui. Arquive para tirá-lo da tela; os números continuam contando." },
      { status: 409 }
    );
  }

  await prisma.post.delete({ where: { id } });
  // O Gestor desenha cards, não posts, e a relação card -> post não tem
  // cascade. Sem isto o post some da aba de posts e continua na agenda da
  // semana (aconteceu em 14/09). O porquê inteiro está em espelhar-no-gestor.
  await esconderDiaSemPosts(post.runId, post.dayOfWeek);
  return NextResponse.json({ ok: true });
}
