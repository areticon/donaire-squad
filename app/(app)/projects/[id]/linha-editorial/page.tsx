import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { LinhaEditorial } from "@/components/editorial/linha-editorial";
import { PerfisDeReferencia } from "@/components/editorial/referencias";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/** A linha editorial do projeto: ideias e roteiros de vídeo (29/09). */
export default async function LinhaEditorialPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  return (
    <div className="px-4 py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Linha editorial
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Ideias de vídeo novas no seu mercado e o roteiro de cada uma, cena por cena, para você gravar.
        </p>
      </div>
      {/* Os perfis de referência do nicho (01/10): some sozinho com o trilho desligado. */}
      <PerfisDeReferencia projectId={id} />
      <LinhaEditorial projectId={id} />
    </div>
  );
}
