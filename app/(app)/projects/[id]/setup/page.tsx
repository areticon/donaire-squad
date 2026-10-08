import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import Link from "next/link";
import { nomeDoDono, podeUsarProjeto } from "@/lib/equipe/conta";
import { AvisoSoODono } from "@/components/equipe/aviso-so-o-dono";

export default async function ProjectSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      agents: true,
      // Sem os tokens (01/10): o projeto inteiro desce para o componente de
      // cliente, e com `true` o accessToken e o refreshToken iam no HTML.
      socialAccounts: { select: { id: true, platform: true, isActive: true } },
      // Os documentos da marca, para a etapa Marca listar o que ja existe, com
      // o estado da leitura: sem ele a lista so sabia dizer "compilado", e dizia
      // isso para documento nenhum tambem.
      contexts: {
        select: { id: true, type: true, title: true, status: true, erro: true },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { posts: true, runs: true } },
    },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  // MEMBRO DA EQUIPE (01/10, acabamento): o setup é o assistente que grava a
  // marca inteira (redes, voz, documentos, squad), e é do dono. Em vez do
  // assistente, o aviso de quem cuida e o caminho para o que o membro faz.
  // A aba some do menu do projeto; esta tela cobre quem chega pelo link.
  if (project.userId !== userId) {
    const dono = (await nomeDoDono(project.userId)) ?? "quem administra a conta";
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-5 p-6 lg:p-8">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Setup do projeto
        </h1>
        <AvisoSoODono dono={dono} oQue="o setup deste projeto" projectId={id} tela="setup" />
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/projects/${id}/criar`}
            className="inline-flex h-10 items-center rounded-lg bg-marca-600 px-4 text-sm font-medium text-white hover:bg-marca-700"
          >
            Ir para Criar
          </Link>
          <Link
            href={`/projects/${id}/settings`}
            className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            Ver as configurações
          </Link>
        </div>
      </div>
    );
  }

  return <KanbanBoard project={project} editMode={project.status === "active"} />;
}
