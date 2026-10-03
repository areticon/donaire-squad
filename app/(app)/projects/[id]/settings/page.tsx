import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ConfiguracaoDoProjeto } from "@/components/projects/configuracao-do-projeto";
import { nomeDoDono, podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * Configuração do PROJETO: o que é da marca, e não da pessoa.
 *
 * Até 12/09/2026 esta tela tinha 31 linhas e só renderizava o painel de redes
 * sociais. Voz, nicho, público, paleta, estilo de vídeo, capa, trilha, termos e
 * semana padrão continuavam mudáveis, mas só pela aba "Editar setup", que
 * obriga a percorrer o assistente inteiro até a última etapa para gravar. Aqui
 * cada seção salva sozinha.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { socialAccounts: true },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();
  // O projeto desce SEM as contas: elas iam junto dentro do `projeto` e
  // levavam os tokens para o HTML (achado de 01/10). As contas descem à parte,
  // só com os campos que a tela usa.
  const { socialAccounts: _contas, ...semContas } = project;
  void _contas;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Configurações
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {project.name}
        </p>
      </div>

      {/* Só os campos que a tela usa (01/10). Até aqui a conta inteira descia
          para o componente de cliente, com accessToken e refreshToken dentro
          do HTML da página. `assistida` diz que o time conectou a conta. */}
      <ConfiguracaoDoProjeto
        // MEMBRO DA EQUIPE (01/10, acabamento): vê tudo em leitura, com o aviso
        // de quem muda. A API recusa do mesmo jeito (lib/equipe/permissoes.ts).
        somenteLeitura={project.userId === userId ? null : { dono: (await nomeDoDono(project.userId)) ?? "quem administra a conta" }}
        projeto={semContas}
        contasSociais={project.socialAccounts.map((c) => ({
          id: c.id,
          platform: c.platform,
          displayName: c.displayName,
          username: c.username,
          isActive: c.isActive,
          accountType: c.accountType,
          organizationId: c.organizationId,
          avatarUrl: c.avatarUrl,
          needsReconnectAt: c.needsReconnectAt,
          needsReconnectReason: c.needsReconnectReason,
          assistida: !c.accessToken && Boolean(c.blotatoAccountId?.trim()),
        }))}
      />
    </div>
  );
}
