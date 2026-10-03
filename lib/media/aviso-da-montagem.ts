import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";

/**
 * O AVISO AOS ADMINS quando a montagem de efeitos desiste por erro técnico
 * (01/10/2026, parte 240).
 *
 * Até aqui a desistência ficava num campo do banco: o completo do Bruno com 78
 * cenas falhou três vezes no render e a tela disse "edição finalizada". Agora
 * o cliente lê a falha com todas as letras (lib/media/estado-da-montagem.ts) e
 * a equipe recebe um e-mail com o motivo, para olhar o worker antes de o
 * cliente clicar em "Tentar a montagem de novo".
 *
 * Só servidor (lê o banco e manda e-mail); falhar aqui nunca derruba a troca
 * de estado que chamou.
 */
export async function avisarAdminsDaMontagem(p: { videoJobId: string; alvo: "completo" | number; motivo: string }): Promise<void> {
  const v = await prisma.videoJob.findUnique({
    where: { id: p.videoJobId },
    select: { originalName: true, projectId: true, userId: true },
  });
  if (!v) return;
  const [admins, dono] = await Promise.all([
    prisma.user.findMany({ where: { role: "admin" }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: v.userId }, select: { email: true } }),
  ]);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const peca = p.alvo === "completo" ? "o vídeo completo" : `o corte ${p.alvo + 1}`;
  for (const a of admins) {
    if (!a.email) continue;
    await enviarEmail({
      para: a.email,
      assunto: `Montagem de efeitos desistiu: ${peca} de ${v.originalName ?? "uma gravação"}`,
      texto: [
        `A montagem de efeitos de ${peca} do vídeo ${p.videoJobId} falhou três vezes (a última com os parâmetros leves) e parou.`,
        "",
        `Arquivo: ${v.originalName ?? "(sem nome)"}`,
        `Cliente: ${dono?.email ?? v.userId}`,
        `Projeto: ${base}/projects/${v.projectId}/live`,
        `Último motivo: ${p.motivo.slice(0, 600)}`,
        "",
        "O cliente vê o aviso \"A montagem de efeitos falhou; o vídeo abaixo tem só a edição de fala\" e o botão \"Tentar a montagem de novo\", que não cobra nada. Vale olhar os registros do worker no Railway antes.",
      ].join("\n"),
    }).catch(() => false);
  }
}
