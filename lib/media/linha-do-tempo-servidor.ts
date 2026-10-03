import { prisma } from "@/lib/db/prisma";
import { roteiroLigado } from "@/lib/media/roteiro-da-edicao";
import { revisaoVisualLigada } from "@/lib/media/revisao-visual";
import type { ExtrasDaLinha, GemeoNaLinha } from "@/lib/media/linha-do-tempo";
import { listarVideos } from "@/lib/media/gemeo-servidor";
import type { VideoAoVivo } from "@/components/video/esteira-do-video";

/**
 * OS VÍDEOS DO GÊMEO NA FAIXA DO GESTOR (02/10, pedido do Bruno): depois de
 * pedir o vídeo, o cliente vai para o escritório e vê a geração passo a passo
 * (voz, pedaços, junção) na MESMA linha do tempo da edição.
 *
 *   ativos       os que ainda estão gravando, como linhas da faixa (o vídeo
 *                ainda não existe na esteira, então a linha é montada aqui);
 *   porVideoJob  os que já viraram gravação: a linha dela mostra as três
 *                etapas do gêmeo como feitas antes do "Ouvindo".
 *
 * Os que falharam ou foram cancelados ficam na tela do gêmeo, com o motivo e
 * a devolução: a faixa é de trabalho andando.
 */
export async function gemeosNaFaixa(projectId: string): Promise<{ ativos: VideoAoVivo[]; porVideoJob: Map<string, GemeoNaLinha> }> {
  const porVideoJob = new Map<string, GemeoNaLinha>();
  const ativos: VideoAoVivo[] = [];
  const lista = await listarVideos(projectId).catch(() => []);
  // A linha inteira desde o primeiro segundo (02/10): o vídeo do gêmeo ainda
  // não tem montagem nem roteiro, mas as etapas que vêm depois já aparecem.
  const extras: ExtrasDaLinha = {
    roteiroLigado: roteiroLigado(),
    efeitosLigados: process.env.MONTAGEM_DO_COMPLETO === "1" || process.env.MONTAGEM_NA_EDICAO === "1",
    revisaoLigada: revisaoVisualLigada(),
    completo: null,
    cortesEmEfeitos: 0,
    cortesEmRevisao: 0,
    postsParaAprovar: 0,
  };
  for (const g of lista) {
    const naLinha: GemeoNaLinha = { estado: g.estado, pedacos: g.pedacos?.length ?? 0, pedacosProntos: (g.pedacos ?? []).filter((p) => p.videoUrl).length };
    if (g.estado === "na-esteira" && g.videoJobId) porVideoJob.set(g.videoJobId, naLinha);
    if (!["na-fila", "falando", "gerando", "juntando", "juntado"].includes(g.estado)) continue;
    ativos.push({
      id: `gemeo-${g.id}`,
      status: "gemeo",
      error: null,
      attempts: 0,
      durationSec: g.segundosDaFala ?? g.segundosEstimados ?? null,
      criadoEm: g.criadoEm,
      inicioDaRodada: g.criadoEm,
      originalName: `Gêmeo digital: ${g.titulo}`,
      trechosEscolhidos: 0,
      cortesProntos: 0,
      cortesQueVaoAoAr: 0,
      temTranscricao: false,
      temTrechos: false,
      temCortes: false,
      temTrechosComPosts: false,
      temCompleto: false,
      rodandoHaSegundos: null,
      gemeo: naLinha,
      linha: extras,
    });
  }
  return { ativos, porVideoJob };
}

/**
 * O QUE A LINHA DO TEMPO PRECISA DO BANCO (02/10/2026), para a página do
 * Gestor e para a consulta de quatro em quatro segundos (videos/status).
 *
 * Duas consultas para todos os vídeos de uma vez: o estado da montagem do
 * completo (coluna fora do schema do Prisma, lida por SQL como nas outras
 * telas) e os posts de cada vídeo esperando aprovação. Falha vira linha sem
 * extras, e a faixa cai no desenho de antes em vez de quebrar.
 */

const ANDANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"];

type Trecho = { montagem?: { estado?: string; candidato?: unknown; revisaoVisual?: { pendente?: boolean } | null } | null };

export async function extrasDaLinha(
  projectId: string,
  videos: Array<{ id: string; clips: unknown }>
): Promise<Map<string, ExtrasDaLinha>> {
  const r = new Map<string, ExtrasDaLinha>();
  if (!videos.length) return r;
  const ids = videos.map((v) => v.id);
  const [montagens, rascunhos] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; estado: string | null; pendente: string | null; candidato: boolean | null; rodadas: string | null; segura: string | null; falha: string | null }>>`
      SELECT id,
             "completoMontagem" ->> 'estado' AS estado,
             "completoMontagem" -> 'revisaoVisual' ->> 'pendente' AS pendente,
             ("completoMontagem" -> 'candidato') IS NOT NULL AND "completoMontagem" -> 'candidato' <> 'null'::jsonb AS candidato,
             "completoMontagem" -> 'revisaoVisual' ->> 'rodadas' AS rodadas,
             "completoMontagem" -> 'revisaoVisual' ->> 'segura' AS segura,
             "completoMontagem" ->> 'falhaTecnica' AS falha
      FROM video_jobs WHERE id = ANY(${ids})`.catch(() => []),
    prisma.$queryRaw<Array<{ vid: string; n: number }>>`
      SELECT r.config ->> 'videoJobId' AS vid, count(p.id)::int AS n
      FROM pipeline_runs r JOIN posts p ON p."runId" = r.id
      WHERE r."projectId" = ${projectId} AND r.archived = false
        AND r.config ->> 'videoJobId' = ANY(${ids}) AND p.status = 'draft'
      GROUP BY 1`.catch(() => []),
  ]);
  const porVideo = new Map(montagens.map((m) => [m.id, m]));
  const posts = new Map(rascunhos.map((x) => [x.vid, x.n]));
  const montagemLigada = process.env.MONTAGEM_DO_COMPLETO === "1" || process.env.MONTAGEM_NA_EDICAO === "1";
  const revisao = revisaoVisualLigada();
  const roteiro = roteiroLigado();

  for (const v of videos) {
    const m = porVideo.get(v.id);
    const trechos = (Array.isArray(v.clips) ? v.clips : []) as Trecho[];
    const revisandoCorte = (t: Trecho) => t?.montagem?.estado === "montando" && Boolean(t.montagem.revisaoVisual?.pendente) && Boolean(t.montagem.candidato);
    const cortesEmRevisao = trechos.filter(revisandoCorte).length;
    const cortesEmEfeitos = trechos.filter((t) => ANDANDO.includes(t?.montagem?.estado ?? "") && !revisandoCorte(t)).length;
    const temMontagem = Boolean(m?.estado) || trechos.some((t) => t?.montagem?.estado);
    r.set(v.id, {
      roteiroLigado: roteiro,
      efeitosLigados: montagemLigada || temMontagem,
      revisaoLigada: revisao,
      completo: m?.estado
        ? {
            estado: m.estado,
            revisando: m.estado === "montando" && m.pendente === "true" && Boolean(m.candidato),
            rodadas: Number(m.rodadas ?? 0) || 0,
            segura: m.segura === "true",
            falhaTecnica: m.falha === "true",
          }
        : null,
      cortesEmEfeitos,
      cortesEmRevisao,
      postsParaAprovar: posts.get(v.id) ?? 0,
    });
  }
  return r;
}
