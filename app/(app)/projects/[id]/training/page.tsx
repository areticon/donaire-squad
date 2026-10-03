import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { TrainingPanel } from "@/components/training/training-panel";
import { nomeDoDono, podeUsarProjeto } from "@/lib/equipe/conta";
import { AvisoSoODono } from "@/components/equipe/aviso-so-o-dono";
import { RegrasDoProjetoPainel } from "@/components/editorial/regras-do-projeto";

export default async function TrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contexts: { orderBy: { createdAt: "desc" } } },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) redirect("/projects");

  // MEMBRO DA EQUIPE (01/10, acabamento): os documentos que treinam o squad
  // valem para a equipe inteira, e só o dono muda (a API recusa com 403). O
  // membro lê, porque saber o que o squad sabe ajuda a pedir melhor.
  if (project.userId !== userId) {
    const dono = (await nomeDoDono(project.userId)) ?? "quem administra a conta";
    return (
      <div className="flex flex-col gap-4">
        <div className="px-6 pt-6 lg:px-8">
          <AvisoSoODono dono={dono} oQue="os documentos que treinam o squad" />
        </div>
        <div inert aria-disabled style={{ opacity: 0.8 }}>
          <TrainingPanel project={project} initialContexts={project.contexts} />
        </div>
        {/* As regras do projeto (02/10): o membro vê em leitura (a API diz que não pode editar). */}
        <div className="px-6 pb-8 lg:px-8">
          <RegrasDoProjetoPainel projectId={id} />
        </div>
      </div>
    );
  }

  // AS REGRAS DO PROJETO (02/10, pedido do Bruno: "um lugar óbvio para
  // gerenciar"): a mesma lista da linha editorial, com o filtro por área e o
  // "Escrever uma regra minha". Regra aprovada entra em roteiro, textos, arte e
  // edição (lib/referencias/regras.ts).
  return (
    <>
      <TrainingPanel project={project} initialContexts={project.contexts} />
      <div className="px-6 pb-8 lg:px-8">
        <RegrasDoProjetoPainel projectId={id} />
      </div>
    </>
  );
}
