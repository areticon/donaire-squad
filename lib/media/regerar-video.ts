import { fraseDeSaldoDoMembro, podeUsarProjetoPorId } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { enfileirar } from "@/lib/fila/trabalhos";
import { cabeNoSaldoDeVideo, type PedidoDeVideoDaFila } from "@/lib/media/video-por-ia";
import { marcarRegeracaoNaPeca } from "@/lib/media/marca-do-video";
import { geracoesDoVideo } from "@/lib/credits/video-tabela";

/**
 * REFAZER O VÍDEO DE UM DIA, a pedido do cliente (28/09).
 *
 * O Bruno escreveu no chat do Paulo "o vídeo falhou, gere novamente por favor".
 * Não existia caminho para isso: o chat do Paulo só edita texto (reescreveu os
 * seis posts e respondeu "apliquei"), e o da Diana ainda dizia "vídeo por IA
 * foi descontinuado", frase de agosto que ficou velha quando o Veo voltou em
 * 19/09. O cliente pediu, o agente respondeu, e nada aconteceu.
 *
 * Aqui o pedido ORIGINAL do dia (o trabalho `video-ia` da campanha) volta para
 * a fila com uma referência NOVA: a antiga já tem débito e estorno gravados, e
 * reaproveitá-la faria o vídeo sair de graça e o checkpoint devolver a falha
 * velha. Com referência nova é uma cobrança nova, do saldo de vídeo, e o card
 * diz na hora que o vídeo está sendo gerado.
 */
export type ResultadoDaRegeracao =
  | { ok: true; custo: number; segundos: number; geracoes: number; qualidade: string }
  | { ok: false; motivo: string };

/** O pedido de vídeo é de refazer? "gere o vídeo de novo", "o vídeo falhou". */
export function ehPedidoDeRefazerVideo(mensagem: string): boolean {
  const m = mensagem.toLowerCase();
  if (!/v[ií]deo|clipe/.test(m)) return false;
  return /(ger|refa|refaz|fa[cç]a|cri|tent|de novo|novamente|outra vez|falh|n[aã]o (veio|saiu|gerou)|cad[eê]|sem o v[ií]deo)/.test(m);
}

export async function regerarVideoDoDia(args: {
  runId: string;
  dayOfWeek: number;
  userId: string;
}): Promise<ResultadoDaRegeracao> {
  // O pedido original do dia: o trabalho de vídeo que a campanha enfileirou.
  const trabalhos = await prisma.trabalho.findMany({
    where: { grupo: args.runId, tipo: "video-ia" },
    orderBy: { createdAt: "desc" },
    select: { status: true, payload: true },
  });
  const doDia = trabalhos.filter((t) => (t.payload as { dayOfWeek?: number } | null)?.dayOfWeek === args.dayOfWeek);
  if (doDia.length === 0) {
    return { ok: false, motivo: "Não encontrei o vídeo que a campanha pediu para este dia. Ele só pode ser refeito num dia que foi criado com vídeo." };
  }
  if (doDia.some((t) => t.status === "pendente" || t.status === "rodando" || t.status === "pausado")) {
    return { ok: false, motivo: "O vídeo deste dia já está sendo gerado. Assim que ficar pronto, ele aparece no card sozinho." };
  }

  const original = doDia[0].payload as unknown as PedidoDeVideoDaFila;
  // Quem pediu, ou quem usa o mesmo projeto pela equipe (01/10).
  if (original.userId !== args.userId && !(await podeUsarProjetoPorId(args.userId, original.projectId))) return { ok: false, motivo: "Este vídeo não é da sua conta." };

  const saldo = await cabeNoSaldoDeVideo(args.userId, original.segundos, original.qualidade);
  if (!saldo.cabe) {
    // Membro da equipe (01/10) não compra pacote: a frase diz a quem pedir.
    const doMembro = await fraseDeSaldoDoMembro(args.userId, { necessario: saldo.custo, disponivel: saldo.disponivel });
    if (doMembro) return { ok: false, motivo: doMembro };
    return {
      ok: false,
      motivo: `Refazer este vídeo custa ${saldo.custo} créditos de vídeo e você tem ${saldo.disponivel}. Escolha uma duração menor ou a qualidade Rápida, ou compre um pacote de vídeo.`,
    };
  }

  const refeito: PedidoDeVideoDaFila = {
    ...original,
    referencia: `${original.postId ?? original.cardId ?? args.runId}:refeito-${Date.now()}`,
  };
  await enfileirar([
    {
      tipo: "video-ia",
      grupo: args.runId,
      // Na frente da fila de vídeo: é um pedido de quem está olhando a tela.
      ordem: 0,
      userId: args.userId,
      projectId: original.projectId,
      payload: refeito as unknown as Record<string, unknown>,
    },
  ]);
  await marcarRegeracaoNaPeca(refeito).catch(() => {});

  // A campanha precisa estar aberta para a fila fechar de novo quando o vídeo
  // chegar; e o log diz o que aconteceu, onde o Gestor lê.
  const run = await prisma.pipelineRun.findUnique({ where: { id: args.runId }, select: { logs: true } });
  const logs = Array.isArray(run?.logs) ? (run!.logs as unknown[]) : [];
  logs.push({
    agent: "Diana Design",
    status: "running",
    message: `Refazendo o vídeo a seu pedido: ${original.segundos}s no Veo 3.1 ${original.qualidade}, ${saldo.custo} créditos de vídeo.`,
    timestamp: new Date().toISOString(),
  });
  await prisma.pipelineRun.update({ where: { id: args.runId }, data: { logs: logs as never } }).catch(() => {});

  return { ok: true, custo: saldo.custo, segundos: original.segundos, geracoes: geracoesDoVideo(original.segundos), qualidade: original.qualidade };
}
