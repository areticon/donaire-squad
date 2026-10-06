import { chaveDaPecaDoVideo } from "@/lib/posts/peca-do-video";
import type { PecaDoVideoNaLinha } from "@/lib/media/linha-do-tempo";
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

/**
 * Aguardando gravação, cortando, ou o corte já pronto esperando o ok.
 *
 * "aprovar" (05/10) substituiu o "pronto para revisar": com a edição
 * terminada não há mais corte a caminho, e o cartão dizia "o corte do seu
 * vídeo chega aqui" com o corte pronto na faixa de cima. Agora ele diz
 * "Corte pronto: aprovar" e abre o corte (`corte`), na semana dele.
 */
export type EstadoDaEsperaDoCorte = "aguardando" | "cortando" | "aprovar";

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
  /** No estado "aprovar": o card do corte pronto e a data dele (AAAA-MM-DD). */
  corte?: { cardId: string; data: string };
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
  /** Quantos trechos a edição escolheu: com todos cortados, nada mais chega. */
  trechosEscolhidos?: number;
  roteiroPendente?: boolean;
  /** Quando a gravação entrou (ISO): só a recente vale sem run. */
  criadoEm?: string;
  /** Onde cada peça do vídeo está no quadro (lib/media/linha-do-tempo-servidor.ts). */
  linha?: { pecas?: PecaDoVideoNaLinha[] } | null;
};

/** As peças que já estão no quadro, para saber se o corte já chegou. */
type PostDoDia = { metadata?: unknown; runId?: string | null };
type CardDoDia = { cardType: string; runId: string; metadata?: unknown };

const ESPERANDO_ROTEIRO = new Set(["roteiro"]);
const TERMINADOS = new Set(["cut", "ready"]);

/**
 * A edição terminou: os cortes que vão existir já existem. Vale também com a
 * gravação ainda em "cutting" ou "writing" (05/10) quando todo trecho escolhido
 * já tem corte: o corte está no quadro (o card nasce com a mídia), e o que
 * ainda roda são os textos ou a montagem do completo, não o corte.
 */
const edicaoTerminou = (v: GravacaoParaEspera) => {
  // GRAVAÇÃO TERMINADA SEM NENHUM CORTE (05/10, noite): os dois vídeos do
  // gêmeo da conta admin (30 s e 49 s) ficaram "ready" com zero cortes, e o
  // quadro prometeu "cortando" em terça e quinta para sempre, girando sem
  // parar e sem jeito de cancelar. Vídeo terminado é terminado: com corte ou
  // sem corte, nada mais vai chegar.
  if (TERMINADOS.has(v.status)) return true;
  const prontos = v.cortesProntos ?? 0;
  if (prontos <= 0) return false;
  const escolhidos = v.trechosEscolhidos ?? 0;
  return escolhidos > 0 && prontos >= escolhidos && v.status !== "failed";
};

/**
 * O estado da espera a partir da gravação. Sem gravação conhecida (vídeo mais
 * antigo que os cinco que a tela carrega) não há o que prometer: devolve nulo.
 * Com a edição terminada também devolve nulo: não há corte a caminho, e o que
 * sobra é o corte pronto esperando o ok (ver `esperasDoCorteNoDia`).
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
  if (edicaoTerminou(v)) return null;
  return { estado: "cortando", rotulo: "cortando", detalhe: "O Vitor está cortando a gravação. O corte entra aqui assim que ficar pronto." };
}

/** AAAA-MM-DD de um instante, em UTC (é como o quadro compara datas). */
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);

/** "domingo, 04/10", de uma data AAAA-MM-DD. */
function diaPorExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
  return `${semana}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

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
  semana,
  agora = Date.now(),
}: {
  iso: string;
  planos: PlanoDoVideo[];
  gravacoes: GravacaoParaEspera[];
  semanaDoProjeto?: unknown;
  postsDoDia: PostDoDia[];
  cardsDoDia: CardDoDia[];
  /** A semana aberta no quadro (AAAA-MM-DD da segunda e do domingo). */
  semana?: { de: string; ate: string };
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

  const naSemana = (d: string) => Boolean(semana && d >= semana.de && d <= semana.ate);

  const avaliar = (videoJobId: string, plano: ReturnType<typeof planoDoRun>, weekStart: Date | null) => {
    const dias = diasDeVideoCurto(plano).map((d) => ({ ...d, iso: isoUtc(dataDoDia({ inicio: plano.inicio, weekStart }, d.dia)) }));
    const doDia = dias.find((d) => d.iso === iso);
    if (!doDia) return;
    if (corteJaChegou(videoJobId)) return;
    const g = gravacoes.find((x) => x.id === videoJobId);
    if (!g) return;

    /**
     * O CORTE PRONTO ESPERANDO O OK (05/10). Antes de prometer corte, o dia
     * aponta o corte que já existe e que o quadro desta semana não mostra
     * (caiu em outra semana: o vídeo enviado no domingo à noite tem o
     * primeiro corte no domingo, e na segunda o quadro abre na semana nova).
     * Os dias vazios recebem esses cortes em ordem, um por dia, e o clique
     * abre o corte na semana dele, sem rolar a tela até a faixa. Vale também
     * com a edição ainda cortando os outros trechos: o que já está pronto é
     * dito como pronto, nunca como "chega aqui".
     */
    const terminou = edicaoTerminou(g);
    const cortes = (g.linha?.pecas ?? []).filter((p) => !p.completo);
    if (cortes.some((p) => p.data === iso)) return;
    if (semana && cortes.length) {
      const pendentes = cortes.filter((p) => p.paraAprovar && !naSemana(p.data));
      const vazios = dias.filter((d) => naSemana(d.iso) && !cortes.some((p) => p.data === d.iso)).map((d) => d.iso);
      const alvo = pendentes[vazios.indexOf(iso)];
      if (alvo) {
        const quando = alvo.data < semana.de ? "na semana anterior" : "na próxima semana";
        esperas.push({
          id: `espera-corte:${videoJobId}:${iso}`,
          videoJobId,
          redes: doDia.redes,
          estado: "aprovar",
          rotulo: "esperando você",
          detalhe: `Ele está no ${diaPorExtenso(alvo.data)}, ${quando}. Toque para assistir e aprovar.`,
          corte: { cardId: alvo.cardId, data: alvo.data },
        });
        return;
      }
    }
    // A edição terminou: nenhum corte vai chegar, então não há o que prometer.
    if (terminou) return;

    const e = estadoDaEspera(g);
    if (!e) return;
    esperas.push({ id: `espera-corte:${videoJobId}:${iso}`, videoJobId, redes: doDia.redes, ...e });
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
