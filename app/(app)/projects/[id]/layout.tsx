import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { ProjectNav } from "@/components/ui/project-nav";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { lerCadastro } from "@/lib/media/gemeo-servidor";
import { faltaUmPasso, hojeDoLembrete, situacaoDoGemeo } from "@/lib/media/gemeo-situacao";
import { SeloDoGemeo } from "@/components/gemeo/selo-do-gemeo";
import { chaveDoGemeoFaltaUmPasso } from "@/lib/avisos/chaves";
import { GerenteVera } from "@/components/vera/gerente-vera";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, userId: true },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  // O SELO "FALTA UM PASSO" (03/10): o gêmeo treinado esperando a pessoa
  // confirmar no gerador. Visível em qualquer aba do projeto, até ela
  // confirmar; só para o dono, que é quem gravou e quem confirma.
  const cadastroDoGemeo = project.userId === userId ? await lerCadastro(id).catch(() => null) : null;
  const gemeoEspera = Boolean(cadastroDoGemeo) && faltaUmPasso(situacaoDoGemeo(cadastroDoGemeo));
  // A chave do descarte do selo (07/10): o grupo do gêmeo; perto do link
  // vencer, a chave do lembrete, e o selo volta. O grupo é id do fornecedor e
  // entra só como marca opaca (chaveDoGemeoFaltaUmPasso): a chave desce ao
  // navegador, o id não.
  const chaveDoSelo = gemeoEspera
    ? chaveDoGemeoFaltaUmPasso(id, cadastroDoGemeo?.avatar?.grupoId ?? cadastroDoGemeo?.avatar?.origem ?? "sem-grupo", hojeDoLembrete(cadastroDoGemeo?.avatar))
    : null;

  return (
    <div className="min-h-screen">
      {/* Project header */}
      <div
        // `top-14` no celular porque a barra do aplicativo já ocupa 14 ali.
        // Sem isso os dois cabeçalhos grudados ficariam um por cima do outro.
        className="sticky top-14 lg:top-0 z-20 lg:z-30"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <div className="px-4 lg:px-8">
          <div className="flex items-center justify-between gap-2 h-14 min-w-0">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/projects"
                className="text-sm transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Projetos
              </Link>
              <span style={{ color: "var(--border)" }}>/</span>
              <span
                className="text-sm font-medium truncate max-w-[200px]"
                style={{ color: "var(--text-primary)" }}
              >
                {project.name}
              </span>
            </div>
            {gemeoEspera && <SeloDoGemeo projectId={id} chave={chaveDoSelo} />}
          </div>
          <ProjectNav projectId={id} isActive={project.status === "active"} souMembro={project.userId !== userId} />
        </div>
      </div>

      {children}

      {/* A VERA GERENTE (04/10): em qualquer tela do projeto, a conversa em que
          a pessoa pede e ela aplica (regras, setup, peças do quadro). */}
      <GerenteVera projectId={id} />
    </div>
  );
}
