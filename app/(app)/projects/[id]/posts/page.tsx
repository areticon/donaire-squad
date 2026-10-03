import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { PostsPanel } from "@/components/posts/posts-panel";
import { whereSocialAccountCanPublish } from "@/lib/social/account-filters";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { chamadoDaFalha, codigoDaFalha, motivoDaRedeNaFrase } from "@/lib/publish/codigos";

export default async function PostsPage({
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
      socialAccounts: {
        where: whereSocialAccountCanPublish,
        select: { id: true, platform: true, displayName: true, accountType: true, avatarUrl: true },
      },
    },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  // As redes que a própria rede recusou. Vêm numa consulta separada de
  // propósito: `whereSocialAccountCanPublish` agora EXCLUI essas contas, e é
  // isso que a gente quer para escolher destino. Mas o post que falhou precisa
  // poder explicar por que falhou, e essa explicação está justamente na conta
  // que o filtro tirou da frente.
  const paraReconectar = await prisma.socialAccount.findMany({
    where: { projectId: id, needsReconnectAt: { not: null } },
    select: { platform: true, needsReconnectReason: true },
  });

  const posts = await prisma.post.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      content: true,
      imageUrl: true,
      imagePrompt: true,
      mediaType: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      externalUrl: true,
      sourcesComment: true,
      createdAt: true,
      socialAccountId: true,
      socialAccount: { select: { displayName: true, platform: true } },
      metadata: true,
    },
  });

  // A FALHA TRADUZIDA (01/10): o metadata inteiro não desce para o navegador;
  // desce só o código PUB-*, o chamado já aberto e o motivo da rede, que é o
  // que o cartão da falha precisa para explicar sem expor o resto.
  const postsDaTela = posts.map(({ metadata, ...p }) => ({
    ...p,
    falhaDaPublicacao:
      p.status === "failed" && codigoDaFalha(metadata)
        ? { codigo: codigoDaFalha(metadata)!, protocolo: chamadoDaFalha(metadata), motivoDaRede: motivoDaRedeNaFrase(metadata) }
        : null,
  }));

  return (
    <PostsPanel
      project={project}
      posts={postsDaTela}
      socialAccounts={project.socialAccounts}
      redesParaReconectar={paraReconectar}
    />
  );
}
