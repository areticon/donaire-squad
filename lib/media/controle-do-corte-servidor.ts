import { prisma } from "@/lib/db/prisma";
import { debitoIsento } from "@/lib/credits/isencao";
import { contaDoPlano } from "@/lib/equipe/conta";
import { debitar, SaldoInsuficiente } from "@/lib/credits";
import {
  calcularNovoCorte,
  contextoDoCorte,
  enviarNovoCorte,
  fundirNoTrecho,
  indicesDaFala,
  lerVideo,
  Recusa,
  remocoesDeBase,
  type ContextoDoCorte,
  type TrechoLido,
} from "@/lib/media/ajuste-pelo-chat";
import { lerMontagem } from "@/lib/media/estado-da-montagem";
import { montagemNaEdicaoLigada } from "@/lib/media/montagem-nos-cortes";
import { reedicaoAberta } from "@/lib/media/reedicao";
import type { GanchoDoCorte, MomentoDaAbertura } from "@/lib/media/abertura-do-roteiro";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { Remocao } from "@/lib/media/edicao";
import { moverMomento } from "@/lib/media/corte-do-completo";
import {
  calcularCorte,
  CREDITOS_POR_REFACAO_DO_CORTE,
  DURACAO_MAXIMA_DO_CORTE_SEG,
  DURACAO_MINIMA_DO_CORTE_SEG,
  escolhaDoCorte,
  FOLGA_DA_JANELA_SEG,
  mesmaEscolha,
  motivoDaIA,
  REFACOES_GRATIS_POR_CORTE,
  resumoDaMudanca,
  vizinhasNoAr,
  type ControleDoCorte,
  type EscolhaDoCorte,
  type PalavraDoControle,
} from "@/lib/media/controle-do-corte";

/**
 * O CONTROLE DO CORTE, do lado do servidor (03/10/2026). A conta é a do
 * módulo puro (lib/media/controle-do-corte.ts), a mesma que a tela faz para o
 * player; aqui ficam a leitura, as travas, a cobrança e o envio.
 *
 * ## Aplicar
 *
 * - ANTES da aprovação (vídeo em "roteiro"): só grava no roteiro do corte. As
 *   artes, a Higgsfield e a legenda saem DEPOIS, em cima deste corte, quando o
 *   cliente aprovar. Sem custo e sem contar refação.
 * - DEPOIS (corte entregue): refaz SÓ este corte no worker, com as remoções
 *   prontas (a limpeza por IA não roda de novo) e as bordas exatas, e a edição
 *   que vem depois REAPROVEITA o que já foi pago: o plano de cenas vai para a
 *   fala nova palavra por palavra (`calcularNovoCorte`), e a edição sob medida
 *   (editor, imagens, B-roll e vídeos da Higgsfield) é levada para a fala nova
 *   sem chamar o editor (`reaproveitarMontagem`, lido em
 *   lib/media/montagem-nos-cortes.ts). Os outros cortes e o completo não são
 *   tocados.
 *
 * ## Quanto custa
 *
 * As três primeiras refações de cada corte são cortesia (registradas no
 * extrato, sem mexer no saldo); da quarta em diante, CREDITOS_POR_REFACAO_DO_CORTE.
 */

export class RecusaDoControle extends Error {
  constructor(
    message: string,
    readonly status = 409
  ) {
    super(message);
  }
}

type TrechoComControle = TrechoLido & {
  titulo?: string;
  controleDoCorte?: { refacoes?: number; ultima?: unknown } | null;
  mantidosPeloUsuario?: Array<{ de: number; ate: number; texto: string; antes?: string; depois?: string }> | null;
  roteiro?: TrechoLido["roteiro"] & { gancho?: GanchoDoCorte | null };
};

type Lido = {
  ctx: ContextoDoCorte;
  t: TrechoComControle;
  status: string;
  palavras: PalavraDoControle[];
  remocoesDaIA: Remocao[];
  base: Remocao[];
  atual: EscolhaDoCorte;
  modo: "roteiro" | "no-ar";
  impedimento: string | null;
};

const PRODUZINDO = ["roteirizando", "aprovando", "cutting", "transcribing", "selecting", "selected", "pending", "uploading"];

async function ler(videoId: string, userId: string, indice: number): Promise<Lido> {
  const v = await lerVideo(videoId, userId);
  if (!v) throw new RecusaDoControle("Vídeo não encontrado.", 404);
  const linha = await prisma.videoJob.findUnique({ where: { id: videoId }, select: { status: true } });
  const status = linha?.status ?? "";
  let ctx: ContextoDoCorte;
  try {
    ctx = await contextoDoCorte(v, indice, "no-ar");
  } catch (e) {
    if (e instanceof Recusa) throw new RecusaDoControle(e.message, 404);
    throw e;
  }
  const t = ctx.t as TrechoComControle;
  const base = await remocoesDeBase(ctx);
  const de = ctx.bordas.inicio - FOLGA_DA_JANELA_SEG;
  const ate = ctx.bordas.fim + FOLGA_DA_JANELA_SEG;
  const remocoesDaIA = base.filter((r) => r.ate > de - 1 && r.de < ate + 1);
  const palavras: PalavraDoControle[] = [];
  ctx.palavras.forEach((w, i) => {
    if (w.end <= de || w.start >= ate) return;
    const p = { i, texto: w.word, inicio: w.start, fim: w.end };
    palavras.push({ ...p, ia: motivoDaIA(p, remocoesDaIA) });
  });
  if (!palavras.length) throw new RecusaDoControle("Este corte está sem fala na transcrição.", 409);
  const atual = escolhaDoCorte(palavras, ctx.bordas, ctx.manter);
  const modo = status === "roteiro" ? "roteiro" : "no-ar";

  let impedimento: string | null = null;
  if (modo === "no-ar") {
    if (PRODUZINDO.includes(status)) impedimento = "O squad ainda está produzindo este vídeo. Quando os cortes chegarem, você ajusta cada um aqui.";
    else if (!["cut", "writing", "ready"].includes(status)) impedimento = "Este vídeo não está pronto para refazer cortes agora.";
    else if (!(t.midia as { vertical?: unknown } | null | undefined)?.vertical) impedimento = "Este corte ainda não tem o vídeo pronto.";
    else if ((t.midia as { refazendo?: boolean } | null | undefined)?.refazendo) impedimento = "Este corte está sendo refeito agora. Quando ele voltar, você ajusta de novo.";
    else if (lerMontagem(t.montagem)?.trabalhando) impedimento = "A edição deste corte está sendo montada agora. Quando terminar, você ajusta.";
    else if (await reedicaoAberta(videoId)) impedimento = "A edição deste vídeo está reaberta na tela de roteiro. Refaça ou descarte lá antes de ajustar um corte aqui.";
  } else if (status !== "roteiro") {
    impedimento = "O roteiro deste vídeo não está aberto agora.";
  }
  return { ctx, t, status, palavras, remocoesDaIA, base, atual, modo, impedimento };
}

async function saldoDa(userId: string): Promise<{ saldo: number | null; interno: boolean }> {
  const u = await prisma.user.findUnique({ where: { id: await contaDoPlano(userId) }, select: { creditsBalance: true, role: true } });
  return { saldo: u?.creditsBalance ?? null, interno: debitoIsento(u?.role) };
}

/** O que acontece com a edição depois do re-corte, em português. */
function oQueVemDepois(l: Lido): string {
  if (l.modo === "roteiro") {
    return "Fica no roteiro: quando você aprovar, o corte sai exatamente assim, e as artes, as cenas e a legenda são feitas em cima dele.";
  }
  const m = l.t.montagem as { estado?: string; sobMedida?: { editor?: unknown; desistiu?: string | null } | null } | null | undefined;
  if (montagemNaEdicaoLigada() && m?.estado === "pronto" && m.sobMedida?.editor && !m.sobMedida.desistiu) {
    return "Refaço só este corte (uns 2 minutos) e depois a edição volta com as mesmas artes, cenas e legenda, encaixadas na fala nova, sem gerar nada de novo (mais uns 5 a 10 minutos).";
  }
  if (montagemNaEdicaoLigada() && (l.ctx.plano || l.t.roteiro?.plano)) {
    return "Refaço só este corte (uns 2 minutos) e depois a edição com as mesmas cenas e imagens, levadas para a fala nova (mais uns 5 a 10 minutos).";
  }
  return "Refaço só este corte, com a legenda e o estilo de sempre (uns 2 minutos).";
}

export async function lerControleDoCorte(videoId: string, userId: string, indice: number): Promise<ControleDoCorte> {
  const l = await ler(videoId, userId, indice);
  const { saldo, interno } = await saldoDa(userId);
  const feitas = l.t.controleDoCorte?.refacoes ?? 0;
  return {
    videoId,
    indice,
    titulo: l.t.titulo ?? `Corte ${indice + 1}`,
    palavras: l.palavras,
    remocoesDaIA: l.remocoesDaIA.map((r) => ({ de: +r.de.toFixed(3), ate: +r.ate.toFixed(3), motivo: r.motivo })),
    atual: l.atual,
    mantidosPeloUsuario: (l.t.mantidosPeloUsuario ?? []).map((x) => ({ de: x.de, ate: x.ate, texto: x.texto })),
    duracaoDaGravacao: l.ctx.video.durationSec ?? 0,
    modo: l.modo,
    impedimento: l.impedimento,
    refacoes: {
      feitas,
      gratis: REFACOES_GRATIS_POR_CORTE,
      creditosDaProxima: l.modo === "no-ar" && feitas >= REFACOES_GRATIS_POR_CORTE ? CREDITOS_POR_REFACAO_DO_CORTE : 0,
      saldo,
      interno,
    },
    depois: oQueVemDepois(l),
    fonteUrl: `/api/videos/${videoId}/midia?tipo=fonte`,
    posterUrl: (l.t.midia as { capa?: { url?: string } } | null | undefined)?.capa?.url ? `/api/videos/${videoId}/midia?tipo=capa&trecho=${indice}` : null,
  };
}

// ─────────────────────────────── a fala de antes e a de depois ───────────────────────────────

/** Para cada palavra da fala antiga, a posição dela na fala nova (null se saiu). Null se a fala antiga não bate com a transcrição. */
function mapaEntreFalas(
  ctx: ContextoDoCorte,
  antes: { inicio: number; fim: number; manter: Array<{ de: number; ate: number }>; total: number },
  depois: { inicio: number; fim: number; manter: Array<{ de: number; ate: number }> }
): Array<number | null> | null {
  const velhos = indicesDaFala(ctx.palavras, antes.inicio, antes.fim, antes.manter);
  if (velhos.length !== antes.total) return null;
  const novos = indicesDaFala(ctx.palavras, depois.inicio, depois.fim, depois.manter);
  const pos = new Map(novos.map((g, k) => [g, k]));
  return velhos.map((g) => pos.get(g) ?? null);
}

// O momento do gancho na fala nova: a mesma conta da abertura do completo (08/10, lib/media/corte-do-completo.ts).
function moverGancho(g: GanchoDoCorte | null | undefined, mapa: Array<number | null> | null, novas: PalavraNoCorte[]): GanchoDoCorte | null {
  if (!g || !mapa) return null;
  const principal = moverMomento(g, mapa, novas);
  if (!principal) return null;
  const reservas = (g.reservas ?? []).map((r) => moverMomento(r, mapa, novas)).filter((r): r is MomentoDaAbertura => Boolean(r));
  return { ...g, ...principal, reservas, desligado: g.desligado };
}

/** As palavras no ar em volta de um trecho devolvido: é por elas que a guarda acha o trecho no arquivo pronto. */
function vizinhas(l: Lido, noAr: Set<number>, de: number, ate: number): { antes: string; depois: string } {
  return vizinhasNoAr(l.palavras, noAr, de, ate);
}

// ─────────────────────────────── aplicar ───────────────────────────────

export type ResultadoDoControle = {
  modo: "roteiro" | "no-ar";
  mensagem: string;
  mudancas: string[];
  creditos: number;
  duracao: number;
  /** Palavras cujo estado final não ficou o pedido (a tela avisa). */
  divergencias: number;
  controle: ControleDoCorte;
};

function validar(l: Lido, e: EscolhaDoCorte): EscolhaDoCorte {
  const ids = new Set(l.palavras.map((p) => p.i));
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
  const comecar = num(e?.comecar);
  const terminar = num(e?.terminar);
  if (!ids.has(comecar) || !ids.has(terminar)) throw new RecusaDoControle("O começo ou o fim caiu fora da fala deste corte. Recarregue a página.", 400);
  if (terminar < comecar) throw new RecusaDoControle("O fim ficou antes do começo.", 400);
  const fora = Array.isArray(e?.fora) ? [...new Set(e.fora.map(num).filter((i) => ids.has(i) && i >= comecar && i <= terminar))] : [];
  return { comecar, terminar, fora, finoInicio: num(e?.finoInicio) || 0, finoFim: num(e?.finoFim) || 0 };
}

export async function aplicarControleDoCorte(
  videoId: string,
  userId: string,
  indice: number,
  bruta: EscolhaDoCorte,
  opcoes: { enviarRecorte?: Parameters<typeof enviarNovoCorte>[2] } = {}
): Promise<ResultadoDoControle> {
  const l = await ler(videoId, userId, indice);
  if (l.impedimento) throw new RecusaDoControle(l.impedimento, 409);
  const escolha = validar(l, bruta);
  if (mesmaEscolha(escolha, l.atual)) throw new RecusaDoControle("Nada mudou ainda. Puxe o começo ou o fim, ou toque numa frase para tirar ou devolver.", 400);
  const dur = l.ctx.video.durationSec ?? 0;
  const calc = calcularCorte(l.palavras, l.remocoesDaIA, escolha, dur);
  if (calc.duracao < DURACAO_MINIMA_DO_CORTE_SEG) throw new RecusaDoControle(`Assim o corte ficaria com ${Math.round(calc.duracao)} segundos no ar, e o mínimo é ${DURACAO_MINIMA_DO_CORTE_SEG}.`, 400);
  if (calc.duracao > DURACAO_MAXIMA_DO_CORTE_SEG) throw new RecusaDoControle(`Assim o corte passaria de ${DURACAO_MAXIMA_DO_CORTE_SEG / 60} minutos no ar.`, 400);

  // A lista inteira de remoções que vai ao worker: as da IA fora da janela,
  // como estavam, e a conta do controle dentro dela.
  const de0 = l.palavras[0].inicio;
  const ate0 = l.palavras[l.palavras.length - 1].fim;
  const remocoes = [...l.base.filter((r) => r.ate <= de0 - 1 || r.de >= ate0 + 1), ...calc.remocoes].sort((a, b) => a.de - b.de);

  const n = await calcularNovoCorte(l.ctx, {
    pronto: { trecho: { inicio: calc.inicio, fim: calc.fim, emPausa: true }, remocoes, doCliente: calc.doCliente, manter: calc.manter },
  });
  if ("erro" in n) throw new RecusaDoControle(n.erro, 400);

  // O gancho do corte (a frase que abre) vai para a fala nova, ou sai se a frase dele saiu.
  const r0 = l.t.roteiro;
  const mapaDoRoteiro = r0?.fala?.palavras?.length
    ? mapaEntreFalas(l.ctx, { inicio: r0.inicio, fim: r0.fim, manter: r0.manter, total: r0.fala.palavras.length }, n.roteiro)
    : null;
  const gancho = r0?.gancho ? moverGancho(r0.gancho, mapaDoRoteiro, n.roteiro.fala.palavras) : null;
  const roteiro = {
    ...(r0 ?? {}),
    ...n.roteiro,
    gancho,
    // O que o roteiro já tinha e o re-corte não muda.
    ...(r0?.estiloId ? { estiloId: r0.estiloId } : {}),
    ...(r0?.revisao ? { revisao: r0.revisao } : {}),
    origem: r0?.origem ?? n.roteiro.origem,
  };

  const noAr = new Set(calc.noAr);
  const mantidosPeloUsuario = calc.devolvidos.map((d) => ({ ...d, ...vizinhas(l, noAr, d.de, d.ate) }));
  const mudancas = resumoDaMudanca(l.palavras, l.atual, escolha);
  const registro = { em: new Date().toISOString(), escolha, mudancas, duracao: calc.duracao };

  if (l.modo === "roteiro") {
    await fundirNoTrecho(videoId, indice, {
      inicio: n.trecho.inicio,
      fim: n.trecho.fim,
      emPausa: true,
      roteiro,
      remocoesDoCliente: n.remocoesDoCliente,
      transcricao: n.corrido,
      mantidosPeloUsuario,
      controleDoCorte: { refacoes: l.t.controleDoCorte?.refacoes ?? 0, ultima: registro },
    });
    // O gancho dos candidatos mora no roteiro do vídeo até a aprovação.
    await moverGanchoDoCandidato(l, indice, n.roteiro);
    return {
      modo: "roteiro",
      mensagem: `Guardado no roteiro: ${mudancas.join("; ")}. O corte fica com ${Math.round(calc.duracao)} s no ar e sai exatamente assim quando você aprovar.`,
      mudancas,
      creditos: 0,
      duracao: calc.duracao,
      divergencias: calc.divergencias.length,
      controle: await lerControleDoCorte(videoId, userId, indice),
    };
  }

  // DEPOIS DA ENTREGA: a refação conta, e da quarta em diante cobra.
  const refacoes = (l.t.controleDoCorte?.refacoes ?? 0) + 1;
  const cobra = refacoes > REFACOES_GRATIS_POR_CORTE;
  const { saldo, interno } = await saldoDa(userId);
  if (cobra && !interno && (saldo ?? 0) < CREDITOS_POR_REFACAO_DO_CORTE) {
    throw new RecusaDoControle(
      `As ${REFACOES_GRATIS_POR_CORTE} refações gratuitas deste corte já foram usadas, e a próxima usa ${CREDITOS_POR_REFACAO_DO_CORTE} créditos. Seu saldo: ${saldo ?? 0}.`,
      402
    );
  }

  // A edição sob medida que está no ar é guardada para ser levada à fala nova
  // sem chamar o editor (lib/media/montagem-nos-cortes.ts). Só os campos que
  // ela usa: a edição resolvida é refeita lá.
  const m = l.t.montagem as { estado?: string; sobMedida?: Record<string, unknown> | null } | null | undefined;
  const sm = m?.sobMedida;
  const reaproveitarMontagem =
    m?.estado === "pronto" && sm?.editor && !sm.desistiu && sm.fala
      ? {
          inicio: l.ctx.bordas.inicio,
          fim: l.ctx.bordas.fim,
          sobMedida: {
            estiloId: sm.estiloId, fala: sm.fala, quadro: sm.quadro, rosto: sm.rosto, gancho: sm.gancho, editor: sm.editor,
            insercoes: sm.insercoes, videos: sm.videos, rodada: sm.rodada, historico: sm.historico, creditos: sm.creditos, custoImagensUsd: sm.custoImagensUsd,
          },
        }
      : null;

  // Primeiro o pedido ao worker (se ele recusar, nada no banco muda e nada é cobrado).
  await enviarNovoCorte(l.ctx, { ...n, roteiro }, opcoes.enviarRecorte, { retomadasNasProntas: true });
  await fundirNoTrecho(videoId, indice, {
    emPausa: true,
    mantidosPeloUsuario,
    controleDoCorte: { refacoes, ultima: { ...registro, creditos: cobra ? CREDITOS_POR_REFACAO_DO_CORTE : 0 } },
    reaproveitarMontagem,
  });
  try {
    await debitar({
      userId,
      quantidade: CREDITOS_POR_REFACAO_DO_CORTE,
      operation: "corte_refacao",
      projectId: l.ctx.video.projectId,
      refId: `${videoId}:${indice}:refacao:${refacoes}`,
      note: `Refação ${refacoes} do corte "${(l.t.titulo ?? `Corte ${indice + 1}`).slice(0, 60)}": ${mudancas.join("; ")}`.slice(0, 180),
      ...(cobra ? {} : { cortesia: { motivo: `refação gratuita ${refacoes} de ${REFACOES_GRATIS_POR_CORTE}` } }),
    });
  } catch (e) {
    // O corte já foi pedido: a falha de cobrança fica no log, não volta o trabalho.
    if (!(e instanceof SaldoInsuficiente)) console.error(`[controle-do-corte][${videoId}] cobrança da refação ${refacoes} falhou:`, e);
  }
  const restantes = Math.max(0, REFACOES_GRATIS_POR_CORTE - refacoes);
  return {
    modo: "no-ar",
    mensagem:
      `Refazendo o corte: ${mudancas.join("; ")}. Ele fica com ${Math.round(calc.duracao)} s no ar. ${oQueVemDepois(l)} ` +
      (cobra
        ? `Esta refação usou ${CREDITOS_POR_REFACAO_DO_CORTE} créditos.`
        : restantes
          ? `Sem custo: ${restantes === 1 ? "ainda resta 1 refação gratuita" : `ainda restam ${restantes} refações gratuitas`} neste corte.`
          : `Sem custo; esta foi a última refação gratuita deste corte, e as próximas usam ${CREDITOS_POR_REFACAO_DO_CORTE} créditos cada.`),
    mudancas,
    creditos: cobra ? CREDITOS_POR_REFACAO_DO_CORTE : 0,
    duracao: calc.duracao,
    divergencias: calc.divergencias.length,
    controle: await lerControleDoCorte(videoId, userId, indice),
  };
}

/** Antes da aprovação, o gancho do candidato fica em `completoMontagem.roteiro.ganchos[indice]`: vai para a fala nova também. */
async function moverGanchoDoCandidato(l: Lido, indice: number, novo: { inicio: number; fim: number; manter: Array<{ de: number; ate: number }>; fala: { palavras: PalavraNoCorte[] } }): Promise<void> {
  const linhas = await prisma.$queryRaw<Array<{ g: GanchoDoCorte | null }>>`
    SELECT "completoMontagem" #> ARRAY['roteiro', 'ganchos', ${String(indice)}]::text[] AS g FROM video_jobs WHERE id = ${l.ctx.video.id}`;
  const g = linhas[0]?.g;
  const r0 = l.t.roteiro;
  if (!g || !r0?.fala?.palavras?.length) return;
  const mapa = mapaEntreFalas(l.ctx, { inicio: r0.inicio, fim: r0.fim, manter: r0.manter, total: r0.fala.palavras.length }, novo);
  const movido = moverGancho(g, mapa, novo.fala.palavras);
  // Sem lugar na fala nova, o gancho sai (desligado), e o cliente vê na tela.
  const json = JSON.stringify(movido ?? { ...g, desligado: true });
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = jsonb_set("completoMontagem", ARRAY['roteiro', 'ganchos', ${String(indice)}]::text[], ${json}::jsonb, false)
    WHERE id = ${l.ctx.video.id} AND jsonb_typeof("completoMontagem" #> '{roteiro,ganchos}') = 'object'`;
}
