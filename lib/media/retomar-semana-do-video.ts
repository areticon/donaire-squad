import { prisma } from "@/lib/db/prisma";
import { despacharPasso, type PassoDoPiloto } from "@/lib/media/piloto-do-servidor";
import { ESPERA_DA_NOVA_TENTATIVA_MIN, TETO_DE_TENTATIVAS_DO_DIA } from "@/lib/media/falha-do-dia-da-semana";
import { avisarFalhaDoVideo } from "@/lib/notificacoes/avisos";
import { avisarAdmins } from "@/lib/notificacoes/aviso-aos-admins";
import { enderecoDaPlataforma } from "@/lib/notificacoes";
import { CODIGO_DA_ETAPA } from "@/lib/notificacoes/tipos";

/**
 * A NOVA TENTATIVA DOS DIAS DA SEMANA DO VÍDEO QUE FALHARAM (08/10/2026).
 *
 * O card "AVISO:" prometia "a esteira tenta de novo sozinha" e nada tentava:
 * a esteira só roda quando alguém a chama (o agendar, o revisar, o piloto), e
 * o dia com aviso contava como escrito. Agora o cron da fila, a cada minuto,
 * acha os dias com falha que ainda têm tentativa, esperados os minutos do
 * aviso, e despacha o passo "semana" do piloto (a mesma esteira de sempre,
 * com o teto de tempo da rota do piloto, sem segurar o cron).
 *
 * A tomada é atômica (UPDATE condicionado): duas passadas do cron não
 * despacham o mesmo vídeo duas vezes. `ultimaRetomadaEm` evita martelar um
 * vídeo cuja esteira não chega ao dia (run arquivado no meio, por exemplo):
 * sem uma falha nova gravada, a próxima tentativa espera 20 minutos.
 */

const ESPERA_SEM_RESPOSTA_MIN = 20;

export async function retomarSemanasQueFalharam(
  opcoes: { limite?: number; despachar?: (videoId: string, passo: PassoDoPiloto) => Promise<boolean> } = {}
): Promise<{ despachados: string[] }> {
  const limite = opcoes.limite ?? 2;
  const despachados: string[] = [];
  const agoraMs = Date.now();
  const falhouAntesDe = new Date(agoraMs - ESPERA_DA_NOVA_TENTATIVA_MIN * 60_000);
  const retomadaAntesDe = new Date(agoraMs - ESPERA_SEM_RESPOSTA_MIN * 60_000);
  const recente = new Date(agoraMs - 2 * 86_400_000);
  const candidatos = await prisma.$queryRaw<Array<{ video: string }>>`
    SELECT DISTINCT c.metadata ->> 'videoJobId' AS video
    FROM campaign_cards c JOIN pipeline_runs r ON r.id = c."runId"
    WHERE c.metadata ->> 'falha' IS NOT NULL
      AND c.metadata ->> 'videoJobId' IS NOT NULL
      AND c."postId" IS NULL
      AND r.archived = false
      AND COALESCE((c.metadata ->> 'tentativasDoDia')::int, 1) < ${TETO_DE_TENTATIVAS_DO_DIA}
      AND c."updatedAt" < ${falhouAntesDe}
      AND c."updatedAt" > ${recente}
      AND (c.metadata ->> 'ultimaRetomadaEm' IS NULL OR (c.metadata ->> 'ultimaRetomadaEm')::timestamptz < ${retomadaAntesDe})
    LIMIT ${limite}`;

  for (const { video } of candidatos) {
    const agora = new Date().toISOString();
    // A tomada: só quem marcar os cards deste vídeo despacha.
    const tomados = await prisma.$executeRaw`
      UPDATE campaign_cards c SET metadata = c.metadata || jsonb_build_object('ultimaRetomadaEm', ${agora}::text)
      FROM pipeline_runs r
      WHERE r.id = c."runId"
        AND r.archived = false
        AND c.metadata ->> 'videoJobId' = ${video}
        AND c.metadata ->> 'falha' IS NOT NULL
        AND c."postId" IS NULL
        AND COALESCE((c.metadata ->> 'tentativasDoDia')::int, 1) < ${TETO_DE_TENTATIVAS_DO_DIA}
        AND c."updatedAt" < ${falhouAntesDe}
        AND (c.metadata ->> 'ultimaRetomadaEm' IS NULL OR (c.metadata ->> 'ultimaRetomadaEm')::timestamptz < ${retomadaAntesDe})`;
    if (tomados === 0) continue;
    const saiu = await (opcoes.despachar ?? despacharPasso)(video, "semana").catch(() => false);
    if (saiu) despachados.push(video);
    else console.error(`[semana][${video}] a nova tentativa dos dias com falha não foi despachada; a próxima passada tenta de novo`);
  }
  return { despachados };
}

/**
 * O DIA QUE BATEU NO TETO: o cliente recebe no sino o código (o card já diz o
 * mesmo); a equipe, sino e e-mail com o motivo técnico. Uma vez por dia de
 * cada execução (chave única).
 *
 * `postJaCriado` (revisão de 08/10): o dia falhou DEPOIS de virar post (o card
 * não gravou). Não houve três tentativas, e a peça existe: as frases dizem isso.
 */
export async function avisarDiaQueDesistiu(p: {
  videoJobId: string;
  runId: string;
  dia: number;
  rotulo: string;
  nomeDoDia: string;
  motivo: string;
  tentativas: number;
  postJaCriado?: string | null;
}): Promise<void> {
  const oQue = p.postJaCriado
    ? { cliente: `${p.rotulo} de ${p.nomeDoDia} foi criado, mas não terminou de ser montado no quadro.`, pedido: "se faltar algo nesta peça", equipe: `falhou depois de virar post (${p.postJaCriado})` }
    : { cliente: `${p.rotulo} de ${p.nomeDoDia} não saiu depois de ${p.tentativas} tentativas.`, pedido: "se quiser esta peça", equipe: `falhou ${p.tentativas} vezes` };
  await avisarFalhaDoVideo({
    videoId: p.videoJobId,
    etapa: "semana",
    marca: `${p.runId}:${p.dia}`,
    detalhe: `${oQue.cliente} O resto da semana segue no quadro. A equipe já foi avisada; ${oQue.pedido}, abra um chamado com o código.`,
  });
  const v = await prisma.videoJob.findUnique({ where: { id: p.videoJobId }, select: { originalName: true, projectId: true, userId: true } });
  if (!v) return;
  const dono = await prisma.user.findUnique({ where: { id: v.userId }, select: { email: true } });
  const link = `/projects/${v.projectId}/live`;
  await avisarAdmins({
    chave: `semana-do-video:${p.runId}:${p.dia}`,
    titulo: `Dia da semana do vídeo desistiu (${CODIGO_DA_ETAPA.semana})`,
    texto: `${v.originalName ?? "Gravação"}: ${p.rotulo} de ${p.nomeDoDia} ${oQue.equipe}. O motivo foi por e-mail.`,
    assunto: `Semana do vídeo: ${p.rotulo} de ${p.nomeDoDia} ${oQue.equipe} (${v.originalName ?? p.videoJobId})`,
    corpo: [
      `O dia ${p.nomeDoDia} (${p.rotulo}) da semana escrita a partir do vídeo ${p.videoJobId} ${oQue.equipe} e parou de ser tentado sozinho.`,
      "",
      `Arquivo: ${v.originalName ?? "(sem nome)"}`,
      `Cliente: ${dono?.email ?? v.userId}`,
      `Projeto: ${enderecoDaPlataforma()}${link}`,
      `Execução: ${p.runId}`,
      `Último motivo: ${p.motivo.slice(0, 600)}`,
      "",
      `O cliente vê o card "AVISO" do dia com o código ${CODIGO_DA_ETAPA.semana} e o aviso no sino. O resto da semana não depende deste dia.`,
    ].join("\n"),
  });
}
