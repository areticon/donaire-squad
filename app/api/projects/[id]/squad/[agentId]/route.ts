export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AGENTES, AGENTE_DEV, donoDaPeca } from "@/lib/squad/estado-do-squad";
import { fichaDoAgente, ID_ANTIGO } from "@/lib/squad/definicoes-dos-agentes";
import { parecerDosCards } from "@/lib/squad/parecer-da-peca";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * A ficha de um agente do squad: quem é, o que faz, e o que já fez neste
 * projeto, do mais recente para o mais antigo.
 *
 * Pedido do Bruno em 18/09: "clicar no agente e abrir sua ficha, quem é, o que
 * faz e o histórico dos trabalhos feitos, sempre os mais recentes". Quem é e o
 * que faz vêm de `project_agents` (persona e estilo, escritos no setup). O
 * histórico são os cards dele, de qualquer semana, sem os arquivados.
 *
 * O Vitor não tem linha em `project_agents` (ele nasce do vídeo, não do
 * setup), então a ficha dele sai da lista fixa `AGENTES`.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; agentId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, agentId } = await params;
  // O Davi Dev (06/10) não está em AGENTES: trabalha para a Demandou, em todo projeto, sem peça.
  const fixo = AGENTES.find((a) => a.id === agentId) ?? (agentId === AGENTE_DEV.id ? AGENTE_DEV : undefined);
  if (!fixo) return NextResponse.json({ error: "Agente desconhecido" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Os ids antigos que hoje são deste agente ("tiago-twitter" é do Xavier).
  const ids = [agentId, ...Object.keys(ID_ANTIGO).filter((k) => ID_ANTIGO[k] === agentId)];
  const [registro, todos] = await Promise.all([
    prisma.projectAgent.findFirst({
      where: { projectId: id, agentId },
      select: { name: true, role: true, persona: true, style: true },
    }),
    prisma.campaignCard.findMany({
      where: {
        projectId: id,
        OR: [{ agentId: { in: ids } }, { cardType: { in: fixo.cardTypes } }],
        NOT: { status: "archived" },
        run: { archived: false },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { run: { select: { topic: true } } },
    }),
  ]);

  /**
   * O parecer de cada trabalho: a nota da Vera E a linha do tempo dela até a
   * rede (reprovado, corrigido, aprovado por você, publicado). Até 19/09 a
   * ficha lia só o card da Vera e mostrava um selo; "rejeitado pelo cliente"
   * mora nos posts e nunca chegava aqui.
   */
  // O filtro do banco é largo (id OU tipo) e o dono decide: desde 29/09 o
  // tipo `post_linkedin` também é escrito pelo Igor, pela Fernanda e pelo Tiago.
  const trabalhos = todos.filter((c) => donoDaPeca(c)?.id === agentId);
  const pareceres = await parecerDosCards(id, trabalhos);

  return NextResponse.json({
    agente: {
      id: agentId,
      nome: registro?.name ?? fixo.nome,
      papel: registro?.role ?? fixo.papel,
      // Sem linha no projeto (agente que entrou depois do setup), vale a ficha
      // central: ficha vazia fazia o agente novo parecer sem função.
      persona: registro?.persona ?? fichaDoAgente(agentId)?.persona ?? "",
      estilo: registro?.style ?? fichaDoAgente(agentId)?.style ?? "",
      cor: fixo.cor,
    },
    trabalhos: trabalhos.map(({ run, ...c }) => {
      const parecer = pareceres.get(c.id);
      // O mp4 no lugar do quadro. O trabalho de vídeo entregava o arquivo nos
      // posts e o card da Diana ficava com o JPEG 9:16, que abria como a
      // "imagem comprida" (Bruno, 19/09). O quadro vira a capa do player.
      const trocaPeloVideo = Boolean(parecer?.videoUrl && parecer.videoUrl !== c.mediaUrl);
      const metadata = trocaPeloVideo
        ? { ...((c.metadata as Record<string, unknown> | null) ?? {}), thumb: c.mediaUrl }
        : c.metadata;
      return {
        ...c,
        mediaUrl: trocaPeloVideo ? parecer!.videoUrl : c.mediaUrl,
        metadata,
        tema: run.topic ?? null,
        // A própria Vera não recebe nota de si mesma: o card dela É a nota.
        veredito: agentId === "vera-veredito" ? null : parecer?.veredito ?? null,
        parecer: agentId === "vera-veredito" ? null : { etapas: parecer?.etapas ?? [] },
      };
    }),
  });
}
