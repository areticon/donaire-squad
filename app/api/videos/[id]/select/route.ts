export const dynamic = "force-dynamic";
// Medido em 22/08 contra a gravação real de 27 minutos: 121s de parede, com
// 12.358 tokens de entrada e 10.916 de saída, quase toda ela de pensamento. O
// pensamento escala com a entrada, então gravação de 60 minutos anda para perto
// do dobro. 800 é o teto do plano Pro e existe para essa folga.
//
// Isto NÃO conserta o timeout, apenas afasta. O que conserta o silêncio é o
// estado explícito com prazo em `lib/media/video-state.ts`: função morta pela
// plataforma não consegue gravar erro nenhum, e sem prazo ninguém percebe.
export const maxDuration = 800;

import { NextRequest, NextResponse, after } from "next/server";
import { acessoAoVideo, despacharPasso } from "@/lib/media/piloto-do-servidor";
import { prisma } from "@/lib/db/prisma";
import { selecionarTrechos, SemTrechoAproveitavel } from "@/lib/media/select-clips";
import { estornarPrimeiraParte, recobrarSeEstornado } from "@/lib/credits/estorno-do-roteiro";
import { MAX_TENTATIVAS } from "@/lib/media/video-state";
import { cobrarPrimeiraParte, lerRoteiroDoVideo, roteiroLigado } from "@/lib/media/roteiro-da-edicao";
import { soCompletoAprovado } from "@/lib/media/decisao-dos-cortes";
import { lerDecisaoDosCortes } from "@/lib/media/decisao-dos-cortes-banco";
import { SaldoInsuficiente } from "@/lib/credits";
import { diasDeVideoCurto, normalizarSemana, planoDoRun } from "@/lib/media/semana-do-video";

/**
 * Quantos dias de "Vídeo curto" o plano do vídeo tem: é o número de cortes que
 * o cliente pediu. O run arquivado é de campanha cancelada e não conta.
 * `normalizarSemana(..., false)` é o mesmo jeito de ler que o quadro usa ao
 * congelar o plano (rede desconectada não apaga a escolha do cliente).
 */
async function cortesPedidos(videoId: string, projectId: string, videoSemana: unknown): Promise<number> {
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId, archived: false, config: { path: ["videoJobId"], equals: videoId } },
    select: { config: true },
  });
  const plano = run ? planoDoRun(run.config, videoSemana) : normalizarSemana(videoSemana, undefined, false);
  return diasDeVideoCurto(plano).length;
}

/**
 * Passo 3 do fluxo de vídeo: escolher os melhores trechos.
 *
 * Roda depois da transcrição, sobre o que já está gravado no banco. Não toca no
 * arquivo de vídeo, então é barato e pode ser repetido sem pagar transcrição de
 * novo, que é útil quando o cliente não gostou da seleção.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id } = await params;
  // Sessão do dono OU assinatura do piloto do servidor (ver piloto-do-servidor.ts).
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
    select: {
      id: true,
      status: true,
      attempts: true,
      durationSec: true,
      transcript: true,
      projectId: true,
      userId: true,
      sizeBytes: true,
      finishedAt: true,
      project: { select: { niche: true, targetAudience: true, voice: true, videoSemana: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "transcribed" && video.status !== "failed") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". A seleção roda depois da transcrição.` },
      { status: 409 }
    );
  }

  if (video.attempts >= MAX_TENTATIVAS) {
    return NextResponse.json(
      { error: "Esta etapa já falhou vezes demais. Fale com o suporte antes de tentar outra vez." },
      { status: 409 }
    );
  }

  // ZERO CORTES APROVADO É ZERO CORTES (06/10): o vídeo aprovado "só o
  // completo" que falhou depois cai aqui na retomada (lista vazia parece
  // "ainda não escolhido"). Não escolhe nada: segue para o corte, que manda
  // ao worker só o completo.
  if (soCompletoAprovado(await lerDecisaoDosCortes(id).catch(() => null))) {
    after(() => despacharPasso(id, "cortar"));
    return NextResponse.json({ ok: true, soCompleto: true, trechos: [] });
  }

  const transcript = video.transcript as {
    paragraphs?: Array<{ text: string; start: number; end: number }>;
    words?: Array<{ word: string; start: number; end: number; confidence: number }>;
  } | null;

  const paragrafos = transcript?.paragraphs ?? [];
  if (!paragrafos.length) {
    return NextResponse.json(
      { error: "Esse vídeo não tem transcrição com parágrafos. Transcreva antes." },
      { status: 400 }
    );
  }

  // A PRIMEIRA PARTE dos créditos (30/09, tela de roteiro): transcrição,
  // limpeza, escolha dos cortes, roteiro e semana escrita. Cobrada aqui porque
  // é a primeira etapa paga depois do envio e a duração já é conhecida; o
  // resto só na aprovação do roteiro. Idempotente (uma linha por vídeo).
  try {
    // Nova tentativa de um vídeo cuja primeira parte foi estornada (01/10): cobra de novo.
    await recobrarSeEstornado({ id, userId: video.userId, projectId: video.projectId });
    await cobrarPrimeiraParte({ id, userId: video.userId, projectId: video.projectId, durationSec: video.durationSec, sizeBytes: video.sizeBytes });
  } catch (err) {
    if (err instanceof SaldoInsuficiente) {
      await prisma.videoJob.update({ where: { id }, data: { status: "failed", startedAt: null, error: err.message } });
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    throw err;
  }

  // Toma o trabalho para si antes de começar. O `status` no filtro é o que
  // torna isto atômico: dois cliques seguidos, ou duas abas, e só um passa. E
  // gravar `startedAt` agora é o que permite declarar isto morto depois, se a
  // plataforma derrubar a função sem deixar o `catch` rodar.
  const tomado = await prisma.videoJob.updateMany({
    where: { id, status: video.status },
    data: {
      status: "selecting",
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
      // Refazer a partir da escolha começa uma rodada nova (ver cortar/route.ts).
      ...(video.finishedAt ? { rodadaEm: new Date(), finishedAt: null } : {}),
    },
  });
  if (tomado.count === 0) {
    return NextResponse.json(
      { error: "A escolha dos trechos deste vídeo já começou.", jaEmAndamento: true },
      { status: 409 }
    );
  }

  try {
    // QUANTOS CORTES O CLIENTE PEDIU (01/10): os dias de "Vídeo curto" do
    // passo 4. Até aqui o número não chegava à seleção, que adivinhava pela
    // duração e devolvia um ou dois. Vale o plano congelado no run do vídeo
    // (é o que vai ao ar); sem run ainda, o plano guardado no projeto.
    const pedido = await cortesPedidos(id, video.projectId, video.project.videoSemana).catch(() => null);
    const trechos = await selecionarTrechos(
      // As palavras vão junto porque é delas que sai o recorte da fala de cada
      // trecho. Antes quem copiava a fala era o modelo, e isso respondia por
      // quase toda a duração desta chamada.
      { paragrafos, palavras: transcript?.words },
      video.durationSec ?? paragrafos[paragrafos.length - 1].end,
      {
        nicho: video.project.niche,
        publico: video.project.targetAudience,
        voz: video.project.voice,
      },
      { projectId: video.projectId },
      pedido
    );

    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "selected",
        startedAt: null,
        attempts: 0,
        clips: trechos,
        error: null,
      },
    });

    // Trechos escolhidos, o próximo passo sai daqui, seja quem for que pediu
    // a seleção (o servidor ou a tela): a aba do cliente não precisa estar
    // aberta. Desde 30/09 o próximo passo é o ROTEIRO, que para a esteira
    // para o cliente aprovar antes de gastarmos com imagem, cena e corte.
    // Vídeo refeito cujo roteiro já foi aprovado (e pago) vai direto ao corte.
    const jaAprovado = Boolean((await lerRoteiroDoVideo(id).catch(() => null))?.aprovadoEm);
    after(() => despacharPasso(id, roteiroLigado() && !jaAprovado ? "roteiro" : "cortar"));

    return NextResponse.json({
      ok: true,
      trechos: trechos.map((t) => ({
        inicio: t.inicio,
        fim: t.fim,
        titulo: t.titulo,
        motivo: t.motivo,
      })),
    });
  } catch (err) {
    let message = err instanceof Error ? err.message : "Falha ao escolher os trechos";
    // NENHUM TRECHO APROVEITÁVEL (decisão do Bruno, 01/10): o vídeo falha sem
    // custo. A primeira parte volta para a conta que pagou, com o autor de quem
    // enviou, e a mensagem diz que nada foi cobrado e por quê.
    if (err instanceof SemTrechoAproveitavel) {
      const devolvidos = await estornarPrimeiraParte({ id, userId: video.userId }, "nenhum trecho aproveitável").catch((e) => {
        console.error(`[selecao][${id}] estorno falhou:`, e);
        return 0;
      });
      if (devolvidos > 0) message = `${message} Nada foi cobrado por esta gravação: os ${devolvidos.toLocaleString("pt-BR")} créditos voltaram para a conta.`;
    }
    await prisma.videoJob.update({
      where: { id },
      data: { status: "failed", startedAt: null, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
