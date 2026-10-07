import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { MAX_TENTATIVAS, etapaDeRetomada, prazoDoCompletoSegundos } from "@/lib/media/video-state";
import { roteiroLigado } from "@/lib/media/roteiro-da-edicao";
import { falhaQueRepete, servidorRepetindo, type FalhaTratada } from "@/lib/media/falha-explicita-do-video";
import {
  avisarEstorno,
  avisarFalhaDaCampanha,
  avisarFalhaDoVideo,
  avisarPecasDoVideo,
  avisarRoteiroPronto,
  avisarSemanaPronta,
  avisarVideoPronto,
} from "@/lib/notificacoes/avisos";

/**
 * O OBSERVADOR DOS AVISOS (02/10/2026), uma passada por minuto no cron da fila.
 *
 * Por que existe, além dos avisos na hora: o vídeo muda de estado por mais de
 * vinte caminhos (rotas, callbacks do worker, o vigia, a montagem, a tela).
 * Pôr um aviso em cada um é a receita do aviso que falta no caminho que
 * ninguém lembrou. Aqui o aviso nasce do ESTADO, não do caminho: o que está
 * gravado no banco nos últimos minutos vira notificação, e a chave única de
 * cada fato (lib/notificacoes) garante que o aviso dado na hora e o dado aqui
 * são uma linha só e um e-mail só.
 *
 * A JANELA é curta (30 min) de propósito: o observador é rede de segurança
 * de um cron que roda todo minuto, e não varredura do passado. No primeiro
 * deploy ele não acorda o histórico de semanas, só o que mudou agora.
 *
 * Nunca lança: o cron segue com o resto.
 */

const JANELA_MS = 30 * 60_000;
/**
 * A falha só vira aviso depois de 2 minutos parada: a primeira falha ganha uma
 * nova tentativa automática da tela aberta, e avisar "parou" do que voltou a
 * andar em segundos seria estado que sobrevive ao fato.
 */
const FALHA_ASSENTADA_MS = 2 * 60_000;
const ANDANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"];

type LinhaDoVideo = {
  id: string;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  rodadaEm: Date | null;
  error: string | null;
  attempts: number;
  durationSec: number | null;
  completoUrl: string | null;
  clips: unknown;
  estado: string | null;
  mdesde: string | null;
  falha: string | null;
  segura: string | null;
  montado: string | null;
  aprovado: string | null;
  tem_roteiro: boolean | null;
  tratada: FalhaTratada | null;
  detalhe_montagem: string | null;
};

type Trecho = { posts?: unknown; midia?: { vertical?: unknown } | null; montagem?: { estado?: string; desde?: string; falhaTecnica?: boolean } | null };

export async function observarAvisos(
  opcoes: {
    agora?: Date;
    janelaMs?: number;
    /**
     * Só estes registros (a prova, scripts/tmp/notif-sim-0210.mts): a prova
     * roda no banco compartilhado e não pode avisar, sem e-mail, um fato real
     * de outro cliente, que depois não ganharia o e-mail dele.
     */
    so?: { videos?: string[]; runs?: string[]; estornos?: string[] };
  } = {}
): Promise<{ videos: number; runs: number; estornos: number }> {
  const agora = opcoes.agora ?? new Date();
  const desde = new Date(agora.getTime() - (opcoes.janelaMs ?? JANELA_MS));
  const r = { videos: 0, runs: 0, estornos: 0 };
  const so = opcoes.so;

  // ── VÍDEOS que mudaram na janela (o registro ou a montagem do completo) ──
  const videos = await prisma.$queryRaw<LinhaDoVideo[]>`
    SELECT id, status, "updatedAt", "createdAt", "rodadaEm", error, attempts, "durationSec", "completoUrl", clips,
           "completoMontagem" ->> 'estado' AS estado,
           "completoMontagem" ->> 'desde' AS mdesde,
           "completoMontagem" ->> 'falhaTecnica' AS falha,
           "completoMontagem" -> 'revisaoVisual' ->> 'segura' AS segura,
           "completoMontagem" ->> 'montadoUrl' AS montado,
           "completoMontagem" -> 'roteiro' ->> 'aprovadoEm' AS aprovado,
           ("completoMontagem" -> 'roteiro') IS NOT NULL AS tem_roteiro,
           retomadas -> 'falhaExplicita' AS tratada,
           "completoMontagem" ->> 'detalheDoCliente' AS detalhe_montagem
    FROM video_jobs
    WHERE ${so ? Prisma.sql`id = ANY(${so.videos ?? []})` : Prisma.sql`"createdAt" > ${new Date(agora.getTime() - 14 * 86400_000)}`}
      AND ("updatedAt" > ${desde} OR "completoMontagem" ->> 'desde' > ${desde.toISOString()})
    ORDER BY "updatedAt" DESC
    LIMIT 60`.catch((e) => {
    console.error("[observador] leitura dos vídeos falhou:", e);
    return [] as LinhaDoVideo[];
  });

  for (const v of videos) {
    try {
      await observarVideo(v, agora, desde);
      r.videos++;
    } catch (e) {
      console.error(`[observador][${v.id}]`, e);
    }
  }

  // ── CAMPANHAS DA SEMANA que fecharam com peça, e as que FALHARAM ───────────
  // A falha entrou em 08/10: a campanha do Igor de 07/10 fechou com zero peças
  // e este observador, que só olhava "completed", não disse nada a ninguém. A
  // falha que nasce fora do fecho (sem squad, sem rede, sem dia) também passa
  // por aqui, porque grava `endedAt` do mesmo jeito.
  const runs = await prisma.pipelineRun
    .findMany({ where: { status: { in: ["completed", "failed"] }, archived: false, endedAt: { gt: desde }, ...(so ? { id: { in: so.runs ?? [] } } : {}) }, select: { id: true, status: true }, take: 30 })
    .catch(() => [] as Array<{ id: string; status: string }>);
  for (const run of runs) {
    if (run.status === "completed") await avisarSemanaPronta(run.id).catch((e) => console.error(`[observador][run ${run.id}]`, e));
    // Concluída com dia falhado também avisa (a função decide se há falha).
    await avisarFalhaDaCampanha(run.id).catch((e) => console.error(`[observador][run ${run.id}] falha:`, e));
    r.runs++;
  }

  // ── CRÉDITOS DEVOLVIDOS ────────────────────────────────────────────────────
  const estornos = await prisma.creditTransaction
    .findMany({
      where: { amount: { gt: 0 }, operation: { startsWith: "estorno" }, createdAt: { gt: desde }, ...(so ? { id: { in: so.estornos ?? [] } } : {}) },
      select: { id: true, userId: true, projectId: true, amount: true, carteira: true, note: true },
      take: 50,
    })
    .catch(() => []);
  for (const tx of estornos) {
    await avisarEstorno(tx).catch((e) => console.error(`[observador][estorno ${tx.id}]`, e));
    r.estornos++;
  }
  return r;
}

async function observarVideo(v: LinhaDoVideo, agora: Date, desde: Date): Promise<void> {
  const trechos = (Array.isArray(v.clips) ? v.clips : []) as Trecho[];
  const temTrechos = trechos.length > 0;
  const temCortes = trechos.some((t) => t?.midia?.vertical);
  const mudouAgora = v.updatedAt > desde;
  const inicioDaRodada = v.rodadaEm ?? v.createdAt;

  // O roteiro esperando o cliente.
  if (v.status === "roteiro" && mudouAgora) await avisarRoteiroPronto(v.id);

  // Uma etapa que parou e ficou parada. Desde 08/10 o servidor repete a
  // primeira falha sozinho (vigiarFalhas): enquanto ele repete, o sino não diz
  // "parou" do que vai voltar a andar.
  const repetindo = servidorRepetindo({ status: v.status, updatedAt: v.updatedAt, attempts: v.attempts, error: v.error, tratada: v.tratada }, agora);
  if (v.status === "failed" && mudouAgora && agora.getTime() - v.updatedAt.getTime() > FALHA_ASSENTADA_MS && !repetindo) {
    const roteiroPendente = roteiroLigado() && temTrechos && !temCortes && !v.aprovado;
    const etapa = etapaDeRetomada({ temTranscricao: v.durationSec !== null, temTrechos, temCortes, roteiroPendente });
    await avisarFalhaDoVideo({
      videoId: v.id,
      etapa,
      marca: v.updatedAt.toISOString(),
      detalhe:
        v.attempts >= MAX_TENTATIVAS
          ? "Já tentamos três vezes e não deu. O que ficou pronto continua guardado; abra um chamado com o código e a equipe resolve."
          : v.attempts >= 2 && falhaQueRepete(v.error)
            ? "Já tentamos de novo sozinhos e não deu; a equipe foi avisada. O que ficou pronto continua guardado, e você pode clicar em tentar de novo no Gestor."
            : "O que já ficou pronto continua guardado. Abra o Gestor e clique em tentar de novo.",
    });
  }

  // O vídeo completo que não veio (o worker avisou a falha, ou passou do prazo).
  const esperandoCompleto = !v.completoUrl && ["cut", "writing", "ready"].includes(v.status) && temCortes;
  if (esperandoCompleto) {
    const fimDoPrazo = inicioDaRodada.getTime() + prazoDoCompletoSegundos(v.durationSec) * 1000;
    const avisouOWorker = Boolean(v.error?.includes("completo:")) && mudouAgora;
    const passouAgora = fimDoPrazo > desde.getTime() && fimDoPrazo < agora.getTime();
    if (avisouOWorker || passouAgora) {
      await avisarFalhaDoVideo({
        videoId: v.id,
        etapa: "completo",
        marca: inicioDaRodada.toISOString(),
        detalhe: "Os cortes e os textos já estão no quadro e não se perdem. Dá para refazer só o vídeo completo, no Gestor.",
      });
    }
  }

  // A montagem de efeitos do completo: pronta, ou desistiu.
  const montagemMudouAgora = Boolean(v.mdesde && v.mdesde > desde.toISOString());
  const completoAndando = ANDANDO.includes(v.estado ?? "");
  if (montagemMudouAgora && v.estado === "pronto" && (v.montado || v.completoUrl)) {
    await avisarVideoPronto(v.id, v.montado ?? v.completoUrl!, { versaoLimpa: v.segura === "true" });
  }
  if (montagemMudouAgora && v.estado === "sem-montagem" && v.falha === "true") {
    await avisarFalhaDoVideo({
      videoId: v.id,
      etapa: "efeitos",
      marca: v.mdesde!,
      // A falha que não se resolve pedindo de novo (08/10, o completo aprovado
      // sem o plano da jornada) traz a própria frase: prometer o botão seria mentira.
      detalhe: v.detalhe_montagem ?? "O vídeo completo ficou só com a edição de fala. Dá para pedir os efeitos de novo no Gestor, sem pagar nada.",
    });
  }
  // O completo sem montagem de efeitos (desligada, ou não se aplica a este vídeo).
  const montagemLigada = process.env.MONTAGEM_DO_COMPLETO === "1";
  const semEfeitos = !v.estado ? !montagemLigada || agora.getTime() - v.createdAt.getTime() > 6 * 3600_000 : v.estado === "sem-montagem" && v.falha !== "true";
  if (mudouAgora && v.status === "ready" && v.completoUrl && semEfeitos) await avisarVideoPronto(v.id, v.completoUrl);

  // A montagem de efeitos de um CORTE que desistiu.
  for (const [i, t] of trechos.entries()) {
    const m = t?.montagem;
    if (m?.estado === "sem-montagem" && m.falhaTecnica && m.desde && m.desde > desde.toISOString()) {
      await avisarFalhaDoVideo({
        videoId: v.id,
        etapa: "efeitos",
        marca: `corte-${i}:${m.desde}`,
        detalhe: `O corte ${i + 1} ficou só com a edição de fala. Dá para pedir os efeitos de novo no Gestor, sem pagar nada.`,
      });
    }
  }

  // Os cortes e os textos no quadro, esperando aprovação.
  if (mudouAgora && v.status === "ready" && trechos.some((t) => t?.posts)) {
    await avisarPecasDoVideo(v.id, { completoAindaEditando: completoAndando || !v.completoUrl });
  }
}
