import { chaveDaPecaDoVideo } from "@/lib/posts/peca-do-video";
import {
  dataDoDia,
  diasDeVideoCurto,
  inicioEfetivo,
  planoDoRun,
  type RedeDoPlano,
} from "@/lib/media/semana-do-video";

/**
 * O LUGAR GUARDADO DO CORTE NO QUADRO (05/10).
 *
 * O plano marca dias de "Vídeo curto" (`diasDeVideoCurto`), e o card do corte
 * só nasce quando o corte existe (`sincronizarQuadroDoVideo` cria o card do
 * Vitor para o trecho que já tem `midia.vertical`). Entre o envio da gravação
 * e o corte pronto, esses dias ficavam vazios ou sumiam do quadro, e o cliente
 * achava que o plano tinha pulado o dia.
 *
 * Este módulo diz, para cada data da semana aberta, se ali cabe um corte que
 * ainda não chegou e em que pé ele está. É puro de propósito (sem banco): roda
 * no navegador, com o plano congelado no run e o estado da gravação que a
 * faixa do vídeo já consulta. Quando o corte chega, o card de verdade ocupa o
 * lugar e a espera some sozinha, porque o dia passa a ter peça do vídeo.
 */

/** Aguardando gravação, cortando, pronto para revisar. */
export type EstadoDaEsperaDoCorte = "aguardando" | "cortando" | "revisar";

export type EsperaDoCorte = {
  /** Chave estável: o vídeo e a data. */
  id: string;
  videoJobId: string;
  estado: EstadoDaEsperaDoCorte;
  /** O estado dito ao cliente: "aguardando gravação", "cortando"... */
  rotulo: string;
  /** As redes marcadas no plano para este dia. */
  redes: RedeDoPlano[];
  /** Uma linha que explica o estado, já sem jargão. */
  detalhe: string;
};

/** O run de vídeo, com o plano congelado (config.semana) e a segunda dele. */
export type PlanoDoVideo = {
  runId: string;
  videoJobId: string;
  weekStart: string | null;
  config: unknown;
};

/** O que esta conta precisa saber da gravação (um recorte de VideoAoVivo). */
export type GravacaoParaEspera = {
  id: string;
  status: string;
  cortesProntos?: number;
  cortesQueVaoAoAr?: number;
  roteiroPendente?: boolean;
  /** Quando a gravação entrou (ISO): só a recente vale sem run. */
  criadoEm?: string;
};

/** As peças que já estão no quadro, para saber se o corte já chegou. */
type PostDoDia = { metadata?: unknown; runId?: string | null };
type CardDoDia = { cardType: string; runId: string; metadata?: unknown };

const ESPERANDO_ROTEIRO = new Set(["roteiro"]);
const TERMINADOS = new Set(["cut", "ready"]);

/**
 * O estado da espera a partir da gravação. Sem gravação conhecida (vídeo mais
 * antigo que os cinco que a tela carrega) não há o que prometer: devolve nulo.
 */
export function estadoDaEspera(
  v: GravacaoParaEspera | undefined
): { estado: EstadoDaEsperaDoCorte; rotulo: string; detalhe: string } | null {
  if (!v) return null;
  if (v.status === "gemeo") {
    return { estado: "aguardando", rotulo: "aguardando gravação", detalhe: "O seu gêmeo digital está gravando o vídeo. O corte sai dele." };
  }
  // O roteiro espera o cliente: antes da aprovação nada é cortado.
  if (ESPERANDO_ROTEIRO.has(v.status) || v.roteiroPendente) {
    return { estado: "aguardando", rotulo: "aguardando o roteiro", detalhe: "Aprove o roteiro na faixa do vídeo, acima do quadro, e o corte começa." };
  }
  if (v.status === "failed") {
    return { estado: "aguardando", rotulo: "aguardando gravação", detalhe: "A gravação parou no meio. Veja a faixa do vídeo, acima do quadro." };
  }
  if (TERMINADOS.has(v.status) && (v.cortesProntos ?? 0) > 0) {
    const guardados = (v.cortesProntos ?? 0) - (v.cortesQueVaoAoAr ?? 0);
    return {
      estado: "revisar",
      rotulo: "pronto para revisar",
      detalhe:
        guardados > 0
          ? "Há corte pronto que ainda não vai ao ar. Revise na faixa do vídeo e ligue o que quiser."
          : "Os cortes estão prontos. Revise na faixa do vídeo.",
    };
  }
  return { estado: "cortando", rotulo: "cortando", detalhe: "O Vitor está cortando a gravação. O corte entra aqui assim que ficar pronto." };
}

/** AAAA-MM-DD de um instante, em UTC (é como o quadro compara datas). */
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/**
 * As esperas de corte de uma data. Uma por vídeo cujo plano marca vídeo curto
 * nesta data e que ainda não tem corte no quadro neste dia.
 *
 * `semanaDoProjeto` cobre a gravação que ainda não abriu quadro (o gêmeo
 * gravando, o roteiro esperando): o run nasce depois, com o plano do projeto
 * congelado e o início em hoje ou na data escolhida, que é a mesma conta aqui.
 */
export function esperasDoCorteNoDia({
  iso,
  planos,
  gravacoes,
  semanaDoProjeto,
  postsDoDia,
  cardsDoDia,
  agora = Date.now(),
}: {
  iso: string;
  planos: PlanoDoVideo[];
  gravacoes: GravacaoParaEspera[];
  semanaDoProjeto?: unknown;
  postsDoDia: PostDoDia[];
  cardsDoDia: CardDoDia[];
  agora?: number;
}): EsperaDoCorte[] {
  const esperas: EsperaDoCorte[] = [];

  const corteJaChegou = (videoJobId: string) =>
    postsDoDia.some((p) => chaveDaPecaDoVideo(p.metadata)?.startsWith(`corte:${videoJobId}:`)) ||
    cardsDoDia.some((c) => {
      if (c.cardType !== "video_clip") return false;
      const m = c.metadata as { videoJobId?: string; virtual?: string; completo?: boolean } | null;
      // O lugar do completo e o corte guardado são virtuais: não contam.
      return m?.videoJobId === videoJobId && !m.virtual && !m.completo;
    });

  const avaliar = (videoJobId: string, plano: ReturnType<typeof planoDoRun>, weekStart: Date | null) => {
    for (const { dia, redes } of diasDeVideoCurto(plano)) {
      if (isoUtc(dataDoDia({ inicio: plano.inicio, weekStart }, dia)) !== iso) continue;
      if (corteJaChegou(videoJobId)) return;
      const e = estadoDaEspera(gravacoes.find((g) => g.id === videoJobId));
      if (!e) return;
      esperas.push({ id: `espera-corte:${videoJobId}:${iso}`, videoJobId, redes, ...e });
      return;
    }
  };

  for (const p of planos) {
    avaliar(p.videoJobId, planoDoRun(p.config), p.weekStart ? new Date(p.weekStart) : null);
  }

  // A gravação mais recente que ainda não abriu quadro, se está esperando
  // gravação ou sendo cortada. Uma só: o plano do projeto vale para ela. Só a
  // dos últimos três dias: gravação velha parada (de campanha cancelada, por
  // exemplo) não pode inventar lugar guardado na semana de hoje.
  if (semanaDoProjeto) {
    const recente = (g: GravacaoParaEspera) => !g.criadoEm || agora - new Date(g.criadoEm).getTime() < 3 * 86400000;
    const semRun = gravacoes.find(
      (g) => !planos.some((p) => p.videoJobId === g.id) && g.status !== "failed" && !TERMINADOS.has(g.status) && recente(g)
    );
    if (semRun) {
      const plano = planoDoRun(null, semanaDoProjeto);
      avaliar(semRun.id, { ...plano, inicio: inicioEfetivo(plano) }, null);
    }
  }

  return esperas;
}
