import { auth } from "@/lib/auth/server";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { revogarGemeo } from "@/lib/media/gemeo-servidor";
import { esquecerIdentidade } from "@/lib/media/identidade-visual";
import { FICHAS_DOS_AGENTES } from "@/lib/squad/definicoes-dos-agentes";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { CAMPOS_DO_ENVIO, soODono } from "@/lib/equipe/permissoes";

/**
 * O squad que o projeto ganha na ativação: as fichas centrais (29/09). Até
 * aqui era uma cópia própria, sem o Vitor, e ficaria sem os especialistas
 * novos. A esteira usa a ficha como reserva de quem não tiver linha.
 */
const DEFAULT_AGENTS = FICHAS_DOS_AGENTES;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow only safe, user-editable fields
  const ALLOWED_FIELDS = [
    "name", "description", "status", "niche", "voice",
    "targetAudience", "colorPalette", "postFrequency", "timezone", "setupStep", "config",
    // O estilo de edição de vídeo. Fica no projeto e não no envio, por decisão
    // do Bruno em 24/08: canal com estilo diferente a cada vídeo não constrói
    // reconhecimento.
    "videoStyle",
    // A trilha dos cortes: o espelho do onUploadCompleted, porque em
    // desenvolvimento o storage nao alcanca o localhost.
    "videoMusicUrl", "videoMusicName",
    // Os termos do negocio que a transcricao precisa acertar (30/08).
    "videoTerms",
    // A semana a partir do video: formato por dia, escolhido no envio (02/09).
    "videoSemana",
    // O estilo da capa do video completo no YouTube (02/09). Do projeto, como
    // o estilo de edicao: capa diferente a cada video nao constroi canal.
    "capaEstilo",
    // A marca (14/09): logo e manual. Espelho do onUploadCompleted da rota
    // /marca, pelo mesmo motivo da trilha: em desenvolvimento o storage nao
    // alcanca o localhost.
    "logoUrl", "brandManualUrl", "brandManualName",
  ] as const;
  type AllowedField = (typeof ALLOWED_FIELDS)[number];

  const data: Partial<Record<AllowedField, unknown>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key];
  }

  // MEMBRO DA EQUIPE (01/10, acabamento): grava só as escolhas da jornada de
  // envio de vídeo. O resto (nome, voz, público, cores, capa, status, setup) é
  // configuração da marca, e é do dono. Ver lib/equipe/permissoes.ts.
  if (project.userId !== userId) {
    const doEnvio = new Set<string>(CAMPOS_DO_ENVIO);
    const foraDoEnvio = Object.keys(data).filter((k) => !doEnvio.has(k));
    if (foraDoEnvio.length > 0) {
      const recusa = await soODono(userId, project);
      if (recusa) return recusa;
    }
  }

  const updated = await prisma.project.update({
    where: { id },
    data: data as Prisma.ProjectUpdateInput,
  });

  // A identidade visual fica 10 min em cache: mudou cor, logo, nicho ou
  // manual, a próxima prévia e a próxima arte já saem na marca nova (05/10).
  if (["colorPalette", "logoUrl", "niche", "name", "brandManualUrl", "targetAudience"].some((k) => k in data)) esquecerIdentidade(id);

  // Create default agents when project is activated for the first time
  if (body.status === "active") {
    const existing = await prisma.projectAgent.count({ where: { projectId: id } });
    if (existing === 0) {
      await prisma.projectAgent.createMany({
        data: DEFAULT_AGENTS.map((a) => ({ ...a, projectId: id })),
      });
    }
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Apagar é só do DONO (01/10): o membro da equipe usa o projeto, mas a marca
  // e o histórico são da conta que paga.
  const recusa = await soODono(userId, project, "apagar este projeto");
  if (recusa) return recusa;

  // O GÊMEO DIGITAL (01/10): o projeto some em cascata, mas a voz clonada na
  // ElevenLabs e os arquivos de rosto e voz no storage não. Revoga antes, que
  // é o que apaga os dois; falhar aqui não impede apagar o projeto.
  await revogarGemeo(id, "Projeto apagado.").catch((e) => console.error(`[gemeo][${id}] revogar ao apagar o projeto:`, e));
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
