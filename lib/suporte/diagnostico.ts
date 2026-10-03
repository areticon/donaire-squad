import { prisma } from "@/lib/db/prisma";
import { lerFalhaDoVideo, type CodigoDaFalha } from "@/lib/media/falha-do-video";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { codigoDaFalha, ehCodigoDePublicacao } from "@/lib/publish/codigos";
import { traducaoCompleta } from "@/lib/publish/codigos-admin";

/**
 * O DIAGNÓSTICO DE UMA PEÇA COM ERRO, montado no SERVIDOR (02/10/2026).
 *
 * Saiu de app/api/suporte/chamado/route.ts, onde nasceu em 21/09 com a regra
 * do Bruno: "quem tem que saber sobre saldo das APIs sou eu, não os clientes".
 * O cliente informa o código que viu; o que o código significa naquela peça é
 * lido aqui (o erro gravado na peça ou no trabalho da fila) e vai para o
 * e-mail do Bruno e para o painel de chamados. Nunca para a tela do cliente.
 *
 * Também marca a peça com o chamado aberto, para a tela não oferecer o botão
 * de novo enquanto a pessoa espera (o protocolo agora é o número do chamado,
 * #0012, e não mais o código com o fim do id).
 */

export type DiagnosticoDaPeca = {
  projectId: string;
  projectName: string;
  /** O código que vale: o gravado na peça, ou o que a tela informou. */
  codigo: string;
  /** "publicação falhou" ou "vídeo não gerado", para o assunto do e-mail. */
  resumo: string;
  /** O texto técnico, interno. */
  diagnostico: string;
  marcar: (protocolo: string) => Promise<void>;
};

export async function diagnosticarPeca(userId: string, postId: string, codigoDaTela?: string | null): Promise<DiagnosticoDaPeca | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { project: { select: { id: true, name: true, userId: true } } },
  });
  if (!post || !(await podeUsarProjeto(userId, { id: post.projectId, userId: post.project.userId }))) return null;

  const meta = (post.metadata as Record<string, unknown> | null) ?? {};

  // FALHA DE PUBLICAÇÃO (PUB-*): o código gravado na peça manda.
  const codigoGravado = codigoDaFalha(post.metadata);
  if (post.status === "failed" && (codigoGravado || ehCodigoDePublicacao(codigoDaTela))) {
    const cod = codigoGravado ?? (codigoDaTela as Parameters<typeof traducaoCompleta>[0]);
    const t = traducaoCompleta(cod);
    const ponte = (meta.ponte as { envio?: string; estado?: string } | undefined) ?? {};
    const diagnostico = [
      `CÓDIGO GRAVADO NA PEÇA: ${cod}${codigoDaTela && codigoDaTela !== cod ? ` (a tela informou ${codigoDaTela})` : ""}`,
      `O QUE O CLIENTE LEU: ${t.titulo}`,
      `Peça: ${post.id}, rede ${post.platform}, tipo ${post.mediaType ?? "?"}`,
      ponte.envio ? `Número do envio: ${ponte.envio} (estado ${ponte.estado ?? "?"})` : "",
      `O QUE É, DE VERDADE: ${t.tecnico}`,
      typeof meta.error === "string" ? `Frase gravada na peça: ${meta.error}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      projectId: post.projectId,
      projectName: post.project.name,
      codigo: cod,
      resumo: "publicação falhou",
      diagnostico,
      marcar: async (protocolo) => {
        await prisma.post
          .update({
            where: { id: post.id },
            data: { metadata: { ...meta, chamadoDaPublicacao: { protocolo, codigo: cod, erro: meta.error ?? null, em: new Date().toISOString() } } as never },
          })
          .catch(() => {});
      },
    };
  }

  // VÍDEO QUE NÃO SAIU: o erro de verdade está no trabalho da fila.
  let erroBruto = "";
  let interno = "";
  if (post.runId) {
    const trabalho = await prisma.trabalho.findFirst({
      where: { grupo: { contains: post.runId }, tipo: { startsWith: "video-ia" }, status: "falhou" },
      orderBy: { updatedAt: "desc" },
      select: { error: true },
    });
    if (trabalho?.error) {
      erroBruto = trabalho.error;
      interno = lerFalhaDoVideo(new Error(trabalho.error)).interno;
    }
  }
  const cod = (codigoDaTela as CodigoDaFalha) || "VID-500";
  const diagnostico = [
    `CÓDIGO NA TELA DO CLIENTE: ${codigoDaTela ?? "(não informado)"}`,
    `Peça: ${post.id}, rede ${post.platform}, tipo ${post.mediaType ?? "?"}`,
    post.runId ? `Campanha: ${post.runId}` : "",
    `O QUE É, DE VERDADE: ${interno || "não encontrei o trabalho de vídeo que falhou para esta campanha."}`,
    erroBruto ? `Erro bruto do fornecedor:\n${erroBruto.slice(0, 800)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    projectId: post.projectId,
    projectName: post.project.name,
    codigo: cod,
    resumo: "vídeo não gerado",
    diagnostico,
    marcar: async (protocolo) => {
      const videoFalhou = (meta.videoFalhou as Record<string, unknown> | undefined) ?? {};
      await prisma.post
        .update({
          where: { id: post.id },
          data: { metadata: { ...meta, videoFalhou: { ...videoFalhou, chamado: { protocolo, em: new Date().toISOString() } } } as never },
        })
        .catch(() => {});
    },
  };
}
