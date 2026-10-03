import { prisma } from "@/lib/db/prisma";
import { emailDeRoteiroPronto } from "@/lib/email";
import { emailDePecasDoVideo, emailDeSemanaPronta, emailDeVideoPronto } from "@/lib/email/avisos";
import { enderecoDaPlataforma, notificar } from "@/lib/notificacoes";
import { CODIGO_DA_ETAPA, NOME_DA_ETAPA_NO_AVISO } from "@/lib/notificacoes/tipos";

/**
 * CADA FATO QUE VIRA AVISO (02/10/2026), com a chave que o torna único.
 *
 * Quem chama: o passo que produziu o fato (o roteiro pronto, a troca do
 * completo) e o observador do cron (`observador.ts`), que confere os fatos
 * recentes. A chave é a mesma pelos dois caminhos, então o aviso sai uma vez.
 *
 * A RODADA entra na chave dos fatos do vídeo: um vídeo refeito ("Voltar à
 * edição", refazer) é outro fato, e merece outro aviso.
 */

type VideoDoAviso = {
  id: string;
  userId: string;
  projectId: string;
  originalName: string | null;
  createdAt: Date;
  rodadaEm: Date | null;
  clips: unknown;
};

const SELECAO = { id: true, userId: true, projectId: true, originalName: true, createdAt: true, rodadaEm: true, clips: true } as const;

async function lerVideo(videoId: string): Promise<VideoDoAviso | null> {
  return prisma.videoJob.findUnique({ where: { id: videoId }, select: SELECAO });
}

const rodadaDe = (v: VideoDoAviso) => (v.rodadaEm ?? v.createdAt).toISOString();
const nomeDe = (v: VideoDoAviso) => v.originalName ?? "sua gravação";
const titulosDosCortes = (v: VideoDoAviso) =>
  (Array.isArray(v.clips) ? (v.clips as Array<{ titulo?: string; texto?: { titulo?: string }; publicar?: boolean }>) : [])
    .filter((c) => c.publicar !== false)
    .map((c) => c.texto?.titulo ?? c.titulo ?? "Corte")
    .filter(Boolean);

/** O ROTEIRO PRONTO PARA APROVAR. E-mail sempre (é pedido de aprovação). */
export async function avisarRoteiroPronto(videoId: string): Promise<void> {
  const v = await lerVideo(videoId);
  if (!v) return;
  const caminho = `/projects/${v.projectId}/video/${v.id}/roteiro`;
  const cortes = (Array.isArray(v.clips) ? (v.clips as Array<{ titulo?: string }>) : []).map((c) => c.titulo ?? "Corte").filter(Boolean);
  await notificar({
    userId: v.userId,
    projectId: v.projectId,
    tipo: "roteiro",
    titulo: "Roteiro pronto para você aprovar",
    texto: `${nomeDe(v)}: ${cortes.length} ${cortes.length === 1 ? "corte possível" : "cortes possíveis"} com a fala exata. Nada é gerado antes da sua aprovação.`,
    link: caminho,
    chave: `roteiro:${v.id}:${rodadaDe(v)}`,
    email: (dono) => emailDeRoteiroPronto({ nome: dono.nome, arquivo: nomeDe(v), cortes, link: `${enderecoDaPlataforma()}${caminho}` }),
  });
}

/**
 * OS CORTES E OS TEXTOS NO QUADRO, esperando aprovação. Só quando há peça em
 * rascunho de fato (o quadro do vídeo recebeu os posts).
 */
export async function avisarPecasDoVideo(
  videoId: string,
  opcoes: {
    completoAindaEditando?: boolean;
    /** Peças pedidas depois, no "Aproveitar o roteiro": outro fato, outro aviso. */
    chaveExtra?: string;
  } = {}
): Promise<void> {
  const v = await lerVideo(videoId);
  if (!v) return;
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: v.projectId, archived: false, config: { path: ["videoJobId"], equals: v.id } },
    select: { id: true },
  });
  if (!run) return;
  const pecas = await prisma.post.count({ where: { runId: run.id, status: "draft" } });
  if (!pecas) return;
  const caminho = `/projects/${v.projectId}/live`;
  const cortes = titulosDosCortes(v);
  await notificar({
    userId: v.userId,
    projectId: v.projectId,
    tipo: "pecas",
    titulo: "Cortes e textos prontos para aprovar",
    texto: `${nomeDe(v)}: ${pecas} ${pecas === 1 ? "peça espera" : "peças esperam"} o seu ok no quadro.${opcoes.completoAindaEditando ? " O vídeo completo chega por último." : ""}`,
    link: caminho,
    chave: opcoes.chaveExtra ? `pecas-extra:${opcoes.chaveExtra}` : `pecas:${v.id}:${rodadaDe(v)}`,
    email: (dono) =>
      emailDePecasDoVideo({
        nome: dono.nome,
        arquivo: nomeDe(v),
        pecas,
        cortes,
        completoAindaEditando: Boolean(opcoes.completoAindaEditando),
        link: `${enderecoDaPlataforma()}${caminho}`,
      }),
  });
}

/**
 * O VÍDEO COMPLETO PRONTO. `versao` é o arquivo que foi ao ar (a URL do
 * render): o mesmo render nunca avisa duas vezes, e um render novo (pedir os
 * efeitos de novo) é fato novo. E-mail só com os avisos ligados.
 */
export async function avisarVideoPronto(videoId: string, versao: string, opcoes: { versaoLimpa?: boolean } = {}): Promise<void> {
  const v = await lerVideo(videoId);
  if (!v) return;
  const caminho = `/projects/${v.projectId}/live`;
  // "APROVEITAR O ROTEIRO" (02/10): o mesmo aviso leva à pergunta de gerar
  // mais peças a partir deste vídeo (components/video/aproveitar-roteiro.tsx).
  const aproveitar = `${caminho}?aproveitar=${v.id}`;
  await notificar({
    userId: v.userId,
    projectId: v.projectId,
    tipo: "completo",
    titulo: "Seu vídeo completo está pronto",
    texto: opcoes.versaoLimpa
      ? `${nomeDe(v)}: a revisão final não aprovou os efeitos e entregamos a fala editada, sem inserções. Dá para pedir os efeitos de novo sem pagar nada.`
      : `${nomeDe(v)}: edição completa, conferida quadro a quadro. Quer aproveitar este roteiro para gerar mais conteúdo?`,
    link: aproveitar,
    chave: `completo:${v.id}:${versao.slice(-120)}`,
    email: (dono) =>
      emailDeVideoPronto({
        nome: dono.nome,
        arquivo: nomeDe(v),
        link: `${enderecoDaPlataforma()}${caminho}`,
        aproveitar: `${enderecoDaPlataforma()}${aproveitar}`,
        configuracoes: `${enderecoDaPlataforma()}/settings`,
        versaoLimpa: opcoes.versaoLimpa,
      }),
  });
}

/**
 * UMA ETAPA QUE PAROU e precisa do clique (ou da equipe). Sem e-mail: o
 * e-mail é para aprovação e para o vídeo pronto (pedido de 02/10); a equipe
 * já recebe o dela. O código vai junto, para o chamado.
 */
export async function avisarFalhaDoVideo(p: {
  videoId: string;
  etapa: keyof typeof CODIGO_DA_ETAPA;
  /** O que identifica ESTA falha (o instante dela): a mesma falha avisa uma vez. */
  marca: string;
  detalhe?: string | null;
}): Promise<void> {
  const v = await lerVideo(p.videoId);
  if (!v) return;
  const codigo = CODIGO_DA_ETAPA[p.etapa];
  await notificar({
    userId: v.userId,
    projectId: v.projectId,
    tipo: "falha",
    titulo: `${NOME_DA_ETAPA_NO_AVISO[p.etapa]} parou`,
    texto: `${nomeDe(v)}: ${p.detalhe ?? "O que já ficou pronto continua guardado. Dá para tentar de novo no Gestor."}`,
    link: `/projects/${v.projectId}/live`,
    codigo,
    chave: `falha:${p.etapa}:${v.id}:${p.marca}`,
  });
}

/** OS POSTS DA SEMANA PRONTOS PARA APROVAR (campanha de texto e arte). */
export async function avisarSemanaPronta(runId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, config: true, project: { select: { id: true, name: true, userId: true } } },
  });
  if (!run || run.status !== "completed") return;
  // O quadro do vídeo também é um PipelineRun: as peças dele avisam pelo vídeo.
  if ((run.config as { videoJobId?: string } | null)?.videoJobId) return;
  const pecas = await prisma.post.count({ where: { runId, status: "draft" } });
  if (!pecas) return;
  // Quem pediu a campanha (a equipe, 01/10) recebe; sem trabalho, o dono.
  const quemPediu =
    (await prisma.trabalho.findFirst({ where: { grupo: runId }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId ??
    run.project.userId;
  const caminho = `/projects/${run.project.id}/live`;
  await notificar({
    userId: quemPediu,
    projectId: run.project.id,
    tipo: "campanha",
    titulo: "Posts da semana prontos para aprovar",
    texto: `${run.project.name}: ${pecas} ${pecas === 1 ? "peça pronta" : "peças prontas"}, com texto e arte de cada rede. Nada sai sem o seu ok.`,
    link: caminho,
    chave: `campanha:${runId}`,
    email: (dono) => emailDeSemanaPronta({ nome: dono.nome, projeto: run.project.name, pecas, link: `${enderecoDaPlataforma()}${caminho}` }),
  });
}

/** CRÉDITOS DEVOLVIDOS (uma linha positiva de estorno no extrato). Sem e-mail. */
export async function avisarEstorno(tx: { id: string; userId: string; projectId: string | null; amount: number; carteira: string; note: string | null }): Promise<void> {
  const qtd = tx.amount.toLocaleString("pt-BR");
  const de = tx.carteira === "video" ? "créditos de vídeo" : "créditos";
  await notificar({
    userId: tx.userId,
    projectId: tx.projectId,
    tipo: "estorno",
    titulo: `Devolvemos ${qtd} ${de}`,
    texto: "Uma parte do trabalho não foi entregue como prometido, e o que você pagou por ela voltou ao seu saldo. A devolução já está no extrato.",
    link: tx.projectId ? `/projects/${tx.projectId}/live` : "/settings",
    chave: `estorno:${tx.id}`,
  });
}
