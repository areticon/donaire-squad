export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { MAX_RETOMADAS, estaTrabalhando, prazoDaEtapa, prazoDoCompletoSegundos, roteiroPendenteDe, type RetomadasDoVideo } from "@/lib/media/video-state";
import { prazoDoVigia } from "@/lib/media/vigia-das-etapas";
import { roteiroLigado } from "@/lib/media/roteiro-da-edicao";
import { varrerExpirados } from "@/lib/media/video-sweep";
import { projetoVisivel } from "@/lib/equipe/conta";
import { extrasDaLinha, gemeosNaFaixa } from "@/lib/media/linha-do-tempo-servidor";
import { temCapasGeradas } from "@/lib/media/estilos-de-capa";

/**
 * O estado dos vídeos de um projeto, enxuto, para a tela consultar de tempos em
 * tempos.
 *
 * Existe separado de `/api/videos` porque aquele devolve os `clips` inteiros,
 * com os textos das três redes de cada trecho, e a tela de espera consulta isto
 * a cada poucos segundos. Mandar dezenas de KB de post pronto para descobrir se
 * o status mudou seria desperdício por consulta, multiplicado pelo tempo todo
 * que alguém fica esperando.
 *
 * **E ele também é o relógio do sistema.** Trabalho morto por timeout não
 * consegue se declarar morto, então quem está vivo precisa fazer isso. Quem
 * está sempre vivo é quem tem a tela aberta esperando. Enquanto não existe
 * fila, é esta rota que fecha o buraco da falha silenciosa.
 */
/** De qual etapa de trabalho cada estado de espera é a volta (ver o vigia). */
const ETAPA_DA_VOLTA: Record<string, string | undefined> = {
  uploaded: "transcribing",
  transcribed: "selecting",
  selected: "cutting",
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId é obrigatório" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ...projetoVisivel(userId) },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  await varrerExpirados(projectId);

  const videos = await prisma.videoJob.findMany({
    // O vídeo CANCELADO pelo cliente (05/10) sai da faixa de vez: o registro
    // fica no banco e no sino, não na tela de trabalho andando.
    where: { projectId, status: { not: "cancelado" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      error: true,
      startedAt: true,
      attempts: true,
      durationSec: true,
      sizeBytes: true,
      updatedAt: true,
      createdAt: true,
      finishedAt: true,
      rodadaEm: true,
      originalName: true,
      completoUrl: true,
      capas: true,
      radar: true,
      // Os trechos entram na CONSULTA mas não na resposta: o que a faixa do
      // Gestor precisa é contagem, não conteúdo. Mandar os textos das três
      // redes de cada trecho a cada quatro segundos seriam dezenas de KB por
      // consulta, e foi por isso que esta rota nasceu separada de `/api/videos`.
      clips: true,
    },
  });

  // O estado da edição do completo vive numa coluna fora do schema do Prisma
  // (lib/media/montagem-do-completo.ts), então vem por consulta crua.
  const estadoDoCompleto = new Map<string, string>();
  // O roteiro (30/09) mora no mesmo jsonb: existe? foi aprovado?
  const roteiros = new Map<string, { existe: boolean; aprovado: boolean }>();
  // As retomadas do vigia (01/10), na mesma consulta crua: a coluna é lida por
  // SQL para não depender do cliente do Prisma regenerado.
  const retomadas = new Map<string, RetomadasDoVideo>();
  if (videos.length) {
    const linhas = await prisma.$queryRaw<{ id: string; estado: string | null; tem_roteiro: boolean | null; aprovado: string | null; retomadas: RetomadasDoVideo | null }[]>`
      SELECT id, "completoMontagem" ->> 'estado' AS estado,
             ("completoMontagem" -> 'roteiro') IS NOT NULL AS tem_roteiro,
             "completoMontagem" -> 'roteiro' ->> 'aprovadoEm' AS aprovado,
             retomadas
      FROM video_jobs WHERE id = ANY(${videos.map((v) => v.id)})`.catch(() => []);
    for (const l of linhas) {
      if (l.estado) estadoDoCompleto.set(l.id, l.estado);
      roteiros.set(l.id, { existe: Boolean(l.tem_roteiro), aprovado: Boolean(l.aprovado) });
      if (l.retomadas) retomadas.set(l.id, l.retomadas);
    }
  }
  const ligado = roteiroLigado();
  // A LINHA DO TEMPO INTEIRA (02/10): efeitos, revisão final e as peças
  // esperando aprovação. Ver lib/media/linha-do-tempo.ts.
  const extras = await extrasDaLinha(projectId, videos);
  // O GÊMEO DIGITAL gravando (02/10): a linha dele começa antes da esteira.
  const gemeos = await gemeosNaFaixa(projectId);

  const agora = Date.now();

  return NextResponse.json({
    videos: [...gemeos.ativos, ...videos.map((v) => {
      const trechos = (Array.isArray(v.clips) ? v.clips : []) as Array<{
        publicar?: boolean;
        posts?: unknown;
        titulo?: string;
        destinos?: string[];
        texto?: { titulo?: string };
        inicio?: number;
        fim?: number;
        midia?: { vertical?: unknown };
      }>;
      const comMidia = trechos.filter((t) => t.midia?.vertical);
      // O começo da RODADA atual: `rodadaEm` quando o vídeo foi refeito,
      // senão o envio. Ver o campo no schema.
      const inicioDaRodada = v.rodadaEm ?? v.createdAt;
      // O COMPLETO QUE NÃO VEIO vira estado explícito, nunca contagem
      // infinita (30/09). Dois jeitos de saber: o worker avisou a falha (o
      // callback grava "completo: ..." em `error`), ou a rodada passou do
      // prazo do completo sem ele chegar.
      const esperandoCompleto =
        !v.completoUrl && ["cut", "writing", "ready"].includes(v.status) && comMidia.length > 0;
      const completoFalhou =
        esperandoCompleto &&
        (Boolean(v.error?.includes("completo:")) ||
          (agora - inicioDaRodada.getTime()) / 1000 > prazoDoCompletoSegundos(v.durationSec));
      return {
      id: v.id,
      status: v.status,
      error: v.error,
      attempts: v.attempts,
      durationSec: v.durationSec,
      updatedAt: v.updatedAt.toISOString(),
      /**
       * Quando a gravação foi enviada. Desde 30/09 a faixa conta a partir
       * de `inicioDaRodada`, e não daqui: o vídeo refeito contava do envio
       * original e mostrou 196 minutos para uma rodada de 56.
       */
      criadoEm: v.createdAt.toISOString(),
      /**
       * De onde a contagem regressiva da faixa parte (30/09). Igual a
       * `criadoEm` no vídeo que roda uma vez só; diferente quando foi refeito.
       */
      inicioDaRodada: inicioDaRodada.toISOString(),
      completoFalhou,
      /** Quando a esteira terminou. Null enquanto ela nao terminou, e null nos
       *  videos anteriores a 08/09, que nao tem o instante gravado. */
      terminadoEm: v.finishedAt?.toISOString() ?? null,
      originalName: v.originalName,
      /**
       * O que a faixa do piloto mostra em cada fase, e o que o piloto usa para
       * decidir a próxima etapa. São contagens derivadas dos trechos, não os
       * trechos: quem quer o conteúdo chama `/api/videos`.
       */
      trechosEscolhidos: trechos.length,
      cortesProntos: comMidia.length,
      cortesQueVaoAoAr: comMidia.filter((t) => t.publicar !== false).length,
      // Edições ainda rodando (30/09): a faixa só diz "pronto" quando a
      // montagem dos cortes e do completo terminou, e não quando o corte
      // simples chegou. Antes ela dizia pronto com o completo sem edição.
      edicoesEmAndamento:
        (trechos as Array<{ montagem?: { estado?: string } }>).filter((t) => ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(t.montagem?.estado ?? "")).length +
        (["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(estadoDoCompleto.get(v.id) ?? "") ||
        // O INTERVALO entre a gravação limpa chegar e a montagem entrar na
        // fila (30/09): sem estado ainda, a faixa dizia "pronto" e o card do
        // completo sumia do quadro por um instante. Vídeo recente, completo
        // pronto, montagem ligada e nenhum estado: ainda é edição.
        (Boolean(v.completoUrl) && !estadoDoCompleto.get(v.id) && process.env.MONTAGEM_DO_COMPLETO === "1" && Date.now() - v.createdAt.getTime() < 6 * 3600_000)
          ? 1
          : 0),
      etapaDoCompleto: estadoDoCompleto.get(v.id) ?? null,
      temTranscricao: v.durationSec !== null,
      temTrechos: trechos.length > 0,
      temCortes: comMidia.length > 0,
      temTrechosComPosts: trechos.some((t) => t.posts),
      temCompleto: Boolean(v.completoUrl),
      // A tela de roteiro (30/09): a faixa leva o cliente a ela, e o piloto da
      // tela cura o vídeo parado em "selected" pelo roteiro, e não pelo corte.
      roteiro: roteiros.get(v.id) ?? null,
      roteiroPendente: roteiroPendenteDe({
        status: v.status,
        temTrechos: trechos.length > 0,
        temCortes: comMidia.length > 0,
        roteiroLigado: ligado,
        roteiroAprovado: Boolean(roteiros.get(v.id)?.aprovado),
      }),
      // A capa do completo já tem opções? O piloto gera uma vez quando não.
      capas: temCapasGeradas(v.capas),
      /**
       * A pesquisa do Roberto, em contagem: a faixa mostra "Pesquisando"
       * enquanto não existe e "3 teses, 4 fontes" quando existe. O briefing
       * inteiro vive no card do quadro, não aqui.
       */
      radar: (() => {
        const r = v.radar as { teses?: unknown[]; achados?: unknown[]; dados?: unknown[]; fontes?: unknown[] } | null;
        if (!r) return null;
        return {
          teses: r.teses?.length ?? 0,
          achados: r.achados?.length ?? 0,
          dados: r.dados?.length ?? 0,
          fontes: r.fontes?.length ?? 0,
        };
      })(),
      /**
       * Os cortes que o cliente DESLIGOU, com o mínimo para caberem no quadro.
       *
       * Eles existem, foram pagos e estão no storage, mas não têm card nem
       * post: o quadro só mostra o que vai ao ar. No teste de 02/09 dois dos
       * três cortes estavam desligados e simplesmente não apareciam em lugar
       * nenhum, o que se lê como trabalho perdido. Aqui eles voltam a ser
       * visíveis, apagados, e com um interruptor para mudar de ideia.
       */
      cortesGuardados: trechos
        .map((t, indice) => ({ t, indice }))
        .filter(({ t }) => t.midia?.vertical && t.publicar === false)
        .map(({ t, indice }) => ({
          indice,
          titulo: t.texto?.titulo ?? t.titulo ?? "Corte sem título",
          destinos: t.destinos ?? [],
          inicio: typeof t.inicio === "number" ? t.inicio : null,
          fim: typeof t.fim === "number" ? t.fim : null,
          capa: `/api/videos/${v.id}/midia?trecho=${indice}&tipo=capa-arte`,
          video: `/api/videos/${v.id}/midia?trecho=${indice}&tipo=vertical`,
        })),
      /**
       * Há quantos segundos esta etapa está rodando, e quanto ela tem de prazo.
       *
       * Vai daqui, e não do relógio do navegador, porque o relógio do navegador
       * mente: máquina com fuso errado ou hora dessincronizada mostraria tempo
       * negativo ou tempo absurdo justamente na tela em que o cliente está
       * ansioso.
       */
      rodandoHaSegundos:
        estaTrabalhando(v.status) && v.startedAt
          ? Math.max(0, Math.round((agora - v.startedAt.getTime()) / 1000))
          : null,
      prazoSegundos: estaTrabalhando(v.status) ? prazoDaEtapa(v) : null,
      /**
       * A etapa passou do prazo que o vigia usa (01/10): a faixa troca o
       * "passou do previsto" por "o servidor vai retomar sozinho".
       */
      passouDoPrazo:
        estaTrabalhando(v.status) && v.startedAt ? (agora - v.startedAt.getTime()) / 1000 > prazoDoVigia(v) : false,
      /**
       * A etapa atual já foi retomada pelo vigia nesta rodada? A faixa mostra
       * "foi retomada automaticamente (tentativa 1 de 2)". Também no estado de
       * espera logo depois da retomada (ex.: "selected" antes de o corte ser
       * tomado de novo), para a frase não piscar.
       */
      retomada: (() => {
        const etapa = estaTrabalhando(v.status) ? v.status : ETAPA_DA_VOLTA[v.status];
        const r = etapa ? retomadas.get(v.id)?.[etapa] : undefined;
        if (!r || !r.n || !r.em || new Date(r.em).getTime() < inicioDaRodada.getTime()) return null;
        return { n: r.n, max: MAX_RETOMADAS, motivo: r.motivo ?? "prazo", em: r.em };
      })(),
      /**
       * Há quanto tempo o registro não muda. É o que o piloto da tela usa,
       * desde 04/09, para decidir se CURA: o servidor encadeia as etapas
       * sozinho, e um estado de espera parado há mais de um minuto e meio
       * significa que essa corrente quebrou.
       */
      paradoHaSegundos: Math.max(0, Math.round((agora - v.updatedAt.getTime()) / 1000)),
      linha: extras.get(v.id) ?? null,
      gemeo: gemeos.porVideoJob.get(v.id) ?? null,
      };
    })],
  });
}
