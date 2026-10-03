import { prisma } from "@/lib/db/prisma";
import { creditar, debitar } from "@/lib/credits";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";
import { datasDoPlano, planoDoRun, type ChaveDoDia, type DiaDoPlano, type RedeDoPlano, type SemanaDoVideo } from "@/lib/media/semana-do-video";
import {
  OPCOES_DE_APROVEITAR,
  creditosDoPedido,
  diasDoPedido,
  type OQueJaExiste,
  type OpcaoDeAproveitar,
} from "@/lib/media/aproveitar-tipos";
import { avisarPecasDoVideo } from "@/lib/notificacoes/avisos";

/**
 * "QUER APROVEITAR ESTE ROTEIRO PARA GERAR MAIS CONTEÚDO?" (02/10/2026, pedido
 * do Bruno). Quando o vídeo (gravado ou do gêmeo) fica pronto, a plataforma
 * oferece mais peças a partir do MESMO roteiro e da mesma transcrição.
 *
 * SEM LÓGICA NOVA DE GERAÇÃO: as peças novas entram como dias livres do plano
 * da semana do próprio vídeo (`config.semana` do quadro, o mesmo que o cliente
 * escolhe no envio) e quem escreve é a esteira de sempre
 * (`completarEsteiraDoVideo`: Roberto, os redatores, a Diana nas artes e a
 * Vera revisando), que já pula o dia escrito e só escreve o que falta.
 *
 * O PREÇO é o da campanha (`estimarCampanha`, a mesma conta do "Nova
 * campanha"): a semana que veio com o vídeo está paga na primeira parte, e o
 * que se pede a mais é campanha. Cobrado na confirmação; o que não for
 * entregue volta ao saldo no fim, com linha no extrato.
 */

export const OPERACAO_DO_APROVEITAR = "aproveitar_roteiro";
export const OPERACAO_DO_ESTORNO_DO_APROVEITAR = "estorno_aproveitar_roteiro";

type Contexto = {
  video: { id: string; projectId: string; userId: string; clips: unknown };
  run: { id: string; config: unknown; weekStart: Date | null };
  semana: SemanaDoVideo;
  inicio: string;
  conectadas: RedeDoPlano[];
};

async function contexto(videoId: string): Promise<Contexto | null> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoId },
    select: { id: true, projectId: true, userId: true, clips: true, project: { select: { videoSemana: true, socialAccounts: { select: { platform: true } } } } },
  });
  if (!video) return null;
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, config: true, weekStart: true },
  });
  if (!run) return null;
  const semana = planoDoRun(run.config, video.project.videoSemana);
  // Run de antes de 30/09 não tem início: a semana dele começava na segunda.
  const inicio = semana.inicio ?? (run.weekStart ?? new Date()).toISOString().slice(0, 10);
  const conectadas = [...new Set(video.project.socialAccounts.map((a) => a.platform))].filter((p): p is RedeDoPlano =>
    ["linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube"].includes(p)
  );
  return { video: { id: video.id, projectId: video.projectId, userId: video.userId, clips: video.clips }, run, semana: { ...semana, inicio }, inicio, conectadas };
}

/** O que este vídeo já gerou, e o que ainda cabe. */
export async function oQueJaExiste(videoId: string): Promise<OQueJaExiste | null> {
  const c = await contexto(videoId);
  if (!c) return null;
  const posts = await prisma.post.findMany({
    where: { runId: c.run.id, status: { not: "cancelled" } },
    select: { mediaType: true, platform: true },
  });
  const porFormato: Record<string, number> = {};
  const porRede: Record<string, number> = {};
  let cortesComPost = 0;
  for (const p of posts) {
    const tipo = p.mediaType ?? "text";
    if (tipo === "video") cortesComPost++;
    porFormato[tipo] = (porFormato[tipo] ?? 0) + 1;
    porRede[p.platform] = (porRede[p.platform] ?? 0) + 1;
  }
  const trechos = (Array.isArray(c.video.clips) ? c.video.clips : []) as Array<{ publicar?: boolean; midia?: { vertical?: unknown } | null }>;
  const cortes = trechos.filter((t) => t?.midia?.vertical).length;
  const datas = datasDoPlano(c.inicio);
  const diasLivres = datas.filter((d) => !c.semana.dias[String(d.dia) as ChaveDoDia]).map((d) => ({ dia: d.dia, iso: d.iso, nome: d.nome }));
  return {
    posts: posts.length - cortesComPost,
    porFormato,
    porRede,
    cortes,
    candidatosSemCorte: trechos.filter((t) => !t?.midia?.vertical).length,
    diasLivres,
    redesConectadas: c.conectadas,
  };
}

export class RecusaDoAproveitar extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Pede as peças a mais: grava os dias no plano do quadro, cobra e devolve o
 * que a esteira precisa para escrever. Quem chama roda `escreverPedido` depois
 * da resposta (`after`).
 */
export async function pedirMaisPecas(
  videoId: string,
  quemPediu: string,
  pedido: { formatos: OpcaoDeAproveitar[]; redes: RedeDoPlano[] }
): Promise<{ creditos: number; dias: Array<{ dia: number; plano: DiaDoPlano }>; refId: string }> {
  const c = await contexto(videoId);
  if (!c) throw new RecusaDoAproveitar("O quadro deste vídeo ainda não existe. Espere a edição terminar.", 409);
  const existe = await oQueJaExiste(videoId);
  if (!existe) throw new RecusaDoAproveitar("Vídeo não encontrado.", 404);
  const formatos = [...new Set(pedido.formatos)].filter((f) => OPCOES_DE_APROVEITAR.some((o) => o.id === f));
  if (!formatos.length) throw new RecusaDoAproveitar("Escolha pelo menos um tipo de peça.");
  if (!pedido.redes.length) throw new RecusaDoAproveitar("Escolha pelo menos uma rede.");
  if (formatos.length > existe.diasLivres.length) {
    throw new RecusaDoAproveitar(
      existe.diasLivres.length
        ? `A semana deste vídeo tem ${existe.diasLivres.length} ${existe.diasLivres.length === 1 ? "dia livre" : "dias livres"}. Escolha até ${existe.diasLivres.length} ${existe.diasLivres.length === 1 ? "tipo" : "tipos"} de peça.`
        : "A semana deste vídeo já está cheia. Para mais peças, crie uma campanha nova a partir do tema."
    );
  }
  const dias = diasDoPedido({ formatos, redes: pedido.redes }, existe.diasLivres);
  const semRede = dias.find((d) => !d.plano.redes.length);
  if (semRede) {
    const nome = OPCOES_DE_APROVEITAR.find((o) => o.formato === semRede.plano.formato)?.rotulo ?? semRede.plano.formato;
    throw new RecusaDoAproveitar(`Nenhuma das redes marcadas publica ${nome.toLowerCase()}. Marque outra rede.`);
  }
  const creditos = creditosDoPedido(dias);
  const refId = `${videoId}:${Date.now()}`;
  // Cobra antes de escrever: SaldoInsuficiente e o teto do membro sobem para a rota.
  await debitar({
    userId: quemPediu,
    quantidade: creditos,
    operation: OPERACAO_DO_APROVEITAR,
    projectId: c.video.projectId,
    refId,
    note: `mais peças do roteiro: ${dias.map((d) => d.plano.formato).join(", ")}`,
  });
  // Os dias entram no plano do quadro numa instrução só, mexendo só na chave
  // "semana" (a esteira grava "esteiraDesde" na mesma coluna ao mesmo tempo).
  const novos: Record<string, DiaDoPlano> = Object.fromEntries(dias.map((d) => [String(d.dia), d.plano]));
  const semana = { ...c.semana, inicio: c.inicio, dias: { ...c.semana.dias, ...novos } };
  await prisma.$executeRaw`
    UPDATE pipeline_runs SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('semana', ${JSON.stringify(semana)}::jsonb)
    WHERE id = ${c.run.id}`;
  return { creditos, dias, refId };
}

/**
 * Escreve as peças pedidas pela esteira de sempre e acerta a conta: o que não
 * saiu volta ao saldo. Roda depois da resposta (`after`), com o teto da rota.
 */
export async function escreverPedido(videoId: string, quemPediu: string, pedido: { creditos: number; dias: Array<{ dia: number; plano: DiaDoPlano }>; refId: string }): Promise<{ entregues: number }> {
  const c = await contexto(videoId);
  if (!c) return { entregues: 0 };
  const diasPedidos = pedido.dias.map((d) => d.dia);
  const entreguesDe = async () =>
    prisma.post.findMany({ where: { runId: c.run.id, dayOfWeek: { in: diasPedidos }, status: { not: "cancelled" } }, select: { dayOfWeek: true, platform: true } });
  // A esteira pode estar ocupada por outra passada (trava de 10 min): tenta
  // de novo algumas vezes dentro do teto da rota.
  let entregues = await entreguesDe();
  for (let i = 0; i < 4 && diasPedidos.some((d) => !entregues.some((p) => p.dayOfWeek === d)); i++) {
    await completarEsteiraDoVideo(videoId).catch((e) => console.error(`[aproveitar][${videoId}]`, e));
    entregues = await entreguesDe();
    if (diasPedidos.every((d) => entregues.some((p) => p.dayOfWeek === d))) break;
    await new Promise((r) => setTimeout(r, 45_000));
  }
  // O que foi entregue, pela mesma conta; a diferença volta.
  const entregueDe = pedido.dias
    .map((d) => ({ plano: { ...d.plano, redes: d.plano.redes.filter((r) => entregues.some((p) => p.dayOfWeek === d.dia && p.platform === r)) } }))
    .filter((d) => d.plano.redes.length);
  const devido = entregueDe.length ? creditosDoPedido(entregueDe) : 0;
  const volta = pedido.creditos - devido;
  if (volta > 0) {
    await creditar({
      userId: quemPediu,
      quantidade: volta,
      operation: OPERACAO_DO_ESTORNO_DO_APROVEITAR,
      refId: pedido.refId,
      note: "peças a mais do roteiro que não ficaram prontas",
    }).catch((e) => console.error(`[aproveitar][${videoId}] devolução falhou:`, e));
  }
  if (entregueDe.length) await avisarPecasDoVideo(videoId, { chaveExtra: pedido.refId });
  return { entregues: entregues.length };
}
