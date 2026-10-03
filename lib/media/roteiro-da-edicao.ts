import type { Prisma } from "@prisma/client";
import { contaDoPlano } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { debitar } from "@/lib/credits";
import { aplicarTermos, comTroca, lerTroca, parseTermos } from "@/lib/media/termos";
import { intervalosDoTrecho } from "@/lib/media/edicao";
import { textoFinalDoCorte } from "@/lib/media/texto-final-do-corte";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { remocoesDaGravacao } from "@/lib/media/pedido-de-corte";
import { dirigirMontagem, novaIdeiaDaCena, usarDiretorLimpo } from "@/lib/media/diretor-de-montagem";
import { aberturaPeloJev } from "@/lib/media/diretor-limpo";
import { falaDoCorte, montagemNaEdicaoLigada } from "@/lib/media/montagem-nos-cortes";
import {
  blocosDaFala,
  dirigirBloco,
  fecharPlanoDoCompleto,
  geometriaDaPessoa,
  juntarPlanos,
  montagemDoCompletoLigada,
  usadoNoPlano,
} from "@/lib/media/montagem-do-completo";
import { detectarTelas } from "@/lib/media/telas-da-gravacao";
import { cameraForaDasFaixas, faixaNoInstante, faixasNoTrecho, type FaixaDeTela } from "@/lib/media/faixas-de-tela";
import { cotasDoCompleto } from "@/lib/media/ritmo-da-edicao";
import { escolherAberturaDoCompleto, escolherGanchosDosCortes } from "@/lib/media/escolha-da-abertura";
import {
  aberturaAtiva,
  acrescentarMomento,
  tirarMomento,
  trocarGancho,
  trocarMomento,
  type GanchoDoCorte,
} from "@/lib/media/abertura-do-roteiro";
import type { Formato } from "@/lib/media/plano-de-montagem";
import { recortesDoProjeto } from "@/lib/media/assets-da-montagem";
import { estiloDoCatalogo, normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { familiaDaLinguagem } from "@/lib/media/capa-composta";
import {
  CREDITOS_DA_ABERTURA_DO_COMPLETO,
  CREDITOS_POR_NOVA_IDEIA,
  CORTES_SUGERIDOS,
  MAX_CORTES_APROVADOS,
  creditosDaAprovacao,
  creditosDoRoteiro,
  creditosPorCorteAprovado,
  roteiroPagoNoPrecoAntigo,
} from "@/lib/media/limits";
import {
  completoNaTela,
  cortesNaTela,
  editarIdeia,
  insercoesDoCompleto,
  palavrasDaCena,
  remapearPlano,
  removerEfeito,
  restaurarCena,
  tempoDaCena,
  trocarCena,
  type FalaDoTrecho,
  type RoteiroDoCompleto,
  type RoteiroDoCorte,
  type RoteiroDoVideo,
  type TelaDeRoteiro,
} from "@/lib/media/roteiro-em-texto";
import type { PalavraNoCorte, PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import type { Word } from "@/lib/media/transcribe";
import { projetoVisivel } from "@/lib/equipe/conta";
import { revisarECorrigir, revisorLigado } from "@/lib/media/revisor-da-montagem";
import type { ResumoDaRevisao } from "@/lib/media/revisao-tipos";
import { perfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { falaDoBloco } from "@/lib/media/montagem-do-completo";

/**
 * O plano antigo pode ser reaproveitado no estilo de agora? (01/10, "trocar
 * de estilo e refazer replaneja", decisão do Bruno.) Com a linguagem gravada
 * no roteiro, compara a linguagem; plano de antes de 01/10 não tem a marca, e
 * aí compara o kit pela legenda que o plano escolheu (papel é colagem,
 * destaque é impacto, limpa é sóbrio). Trocar Vox por MrBeast replaneja;
 * entre duas linguagens do mesmo kit sem marca gravada, reaproveita (o custo
 * de replanejar todo vídeo antigo não vale o risco de igualdade).
 */
export function planoServeAoEstilo(plano: Pick<PlanoDeMontagem, "legenda"> | null | undefined, estiloDoPlano: string | undefined, estiloAtual: string): boolean {
  if (!plano) return false;
  if (estiloDoPlano) return estiloDoPlano === estiloAtual;
  const kitDaLegenda: Record<string, string> = { papel: "colagem", destaque: "impacto", limpa: "sobrio" };
  const kit = kitDaLegenda[plano.legenda?.estilo ?? ""];
  return !kit || kit === bibliaDoEstilo(estiloAtual).kit;
}

/**
 * A TELA DE ROTEIRO, lado do servidor (30/09/2026).
 *
 * O pedido do Bruno, nas palavras dele: "antes de construir os cortes deveria
 * ter uma tela prévia, mostrando a linha editorial para o usuário aprovar,
 * dizendo que depois de aprovada serão consumidos os créditos". Até aqui a
 * esteira ia do envio ao fim sem parar: transcrevia, limpava, escolhia, cortava,
 * o diretor planejava, o Gemini e a Higgsfield geravam imagem e cena, e o
 * Remotion montava. O cliente pagava tudo sem ter aprovado nada, e a Demandou
 * pagava imagem e cena de corte que o cliente nem queria.
 *
 * ## Onde a esteira para
 *
 * Depois da SELEÇÃO. A rota `/select` despacha o passo "roteiro" em vez do
 * "cortar"; o roteiro roda a limpeza de fala da gravação inteira (a mesma conta
 * do pedido de corte, com a limpeza por IA) e o diretor EM TEXTO para os cortes
 * candidatos e para o completo, sem imagem, sem cena, sem worker. O vídeo fica
 * em "roteiro" até o cliente aprovar. Na aprovação, os cortes escolhidos (até
 * 3) ficam em `clips`, os outros vão para `roteiro.descartados`, o vídeo volta
 * a "selected" e o passo "cortar" sai.
 *
 * ## Por que nada é pago duas vezes
 *
 * - O pedido de corte usa as remoções GUARDADAS (a limpeza por IA não é
 *   determinística: rodar de novo daria outro texto e outra conta).
 * - A montagem de cada corte usa o plano aprovado quando a fala bate
 *   (`planoAprovadoDoCorte` em montagem-nos-cortes.ts).
 * - A montagem do completo usa o plano aprovado, levado para a fala transcrita
 *   do arquivo (`preparar` em montagem-do-completo.ts).
 *
 * ## Onde mora
 *
 * Sem coluna nova: cada corte em `clips[i].roteiro`, e o que é do vídeo inteiro
 * (remoções, completo, aprovação) em `completoMontagem.roteiro`, que viaja em
 * toda troca de estado da montagem do completo.
 */

/** Liga a parada. Ligada por padrão; ROTEIRO_ANTES_DE_GERAR=0 volta à esteira sem parada. */
export function roteiroLigado(): boolean {
  return process.env.ROTEIRO_ANTES_DE_GERAR !== "0";
}

/**
 * Quantos cortes candidatos o diretor planeja antes da aprovação. Até 30/09
 * eram 6 dos até 15 da seleção (o cliente escolhia 3). Desde 01/10 a seleção
 * traz o pedido e mais 2 candidatos, até 8, e todos podem ser aprovados: os 8
 * são planejados, para nenhum aparecer só em texto na tela (~US$ 0,15 cada no
 * Sonnet). Se a seleção trouxer mais, os de maior nota ganham as cenas e os
 * outros são planejados depois da aprovação, como antes.
 */
// Até 01/10: export const CORTES_PLANEJADOS_NO_ROTEIRO = 6;
export const CORTES_PLANEJADOS_NO_ROTEIRO = 8;

/** Diretor em paralelo: cortes e blocos do completo dividem a mesma fila. */
const DIRETORES_EM_PARALELO = 6;

const agora = () => new Date().toISOString();

export type EstiloDosCortes = { atual: string; nomeAtual: string; cortesDeOutroEstilo: number[] };

/** Quais cortes do vídeo foram planejados num estilo diferente do de agora. */
export function cortesDeOutroEstilo(clips: unknown, estiloAtual: string): number[] {
  const trechos = (clips as Array<Record<string, unknown>> | null) ?? [];
  const saida: number[] = [];
  trechos.forEach((t, i) => {
    const rc = t?.roteiro as { plano?: { legenda?: { estilo?: string } } | null; estiloId?: string } | null | undefined;
    const plano = rc?.plano ?? (t?.montagem as { plano?: { legenda?: { estilo?: string } } } | null | undefined)?.plano;
    if (!plano) return;
    if (!planoServeAoEstilo(plano as never, rc?.estiloId, estiloAtual)) saida.push(i);
  });
  return saida;
}

export function estiloDosCortes(v: { clips: unknown; project: { videoEstiloEscolha: unknown; videoStyle: string | null } }): EstiloDosCortes {
  const atual = normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle).estiloId;
  const e = estiloDoCatalogo(atual);
  return { atual, nomeAtual: e ? `${e.nome}${e.referencia ? ` (${e.referencia})` : ""}` : atual, cortesDeOutroEstilo: cortesDeOutroEstilo(v.clips, atual) };
}


// ─────────────────────────────── banco ───────────────────────────────

type TrechoDoRoteiro = {
  inicio: number;
  fim: number;
  emPausa?: boolean;
  titulo?: string;
  motivo?: string;
  ideia?: string;
  nota?: number;
  transcricao?: string;
  publicar?: boolean;
  edicao?: { inicio: number; fim: number; manter: Array<{ de: number; ate: number }> } | null;
  montagem?: { plano?: (PlanoDeMontagem & { fala?: { manter: Array<{ de: number; ate: number }>; palavras: PalavraNoCorte[]; duracao: number } }) | null } | null;
  roteiro?: RoteiroDoCorte | null;
};

type VideoDoRoteiro = {
  id: string;
  projectId: string;
  userId: string;
  blobUrl: string;
  status: string;
  startedAt: Date | null;
  durationSec: number | null;
  sizeBytes: bigint | null;
  originalName: string | null;
  diagnostico: string | null;
  transcript: unknown;
  radar: unknown;
  clips: unknown;
  project: {
    niche: string | null;
    colorPalette: string | null;
    videoEstiloEscolha: unknown;
    videoStyle: string | null;
    videoTerms: string | null;
  };
};

async function lerVideo(id: string): Promise<VideoDoRoteiro | null> {
  return prisma.videoJob.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      userId: true,
      blobUrl: true,
      status: true,
      startedAt: true,
      durationSec: true,
      sizeBytes: true,
      originalName: true,
      diagnostico: true,
      transcript: true,
      radar: true,
      clips: true,
      project: { select: { niche: true, colorPalette: true, videoEstiloEscolha: true, videoStyle: true, videoTerms: true } },
    },
  });
}

/** O roteiro do vídeo inteiro (fora do schema do Prisma: SQL cru, mesmo motivo da montagem do completo). */
export async function lerRoteiroDoVideo(id: string): Promise<RoteiroDoVideo | null> {
  const linhas = await prisma.$queryRaw<Array<{ r: RoteiroDoVideo | null }>>`
    SELECT "completoMontagem" -> 'roteiro' AS r FROM video_jobs WHERE id = ${id}`;
  return linhas[0]?.r ?? null;
}

/** O plano da montagem do completo que já existe (vídeo refeito): o roteiro reaproveita em vez de pagar o diretor. */
async function montagemDoCompletoAnterior(id: string): Promise<{ plano: PlanoDeMontagem; fala: FalaDoTrecho } | null> {
  const linhas = await prisma.$queryRaw<Array<{ plano: PlanoDeMontagem | null; fala: FalaDoTrecho | null }>>`
    SELECT "completoMontagem" -> 'plano' AS plano, "completoMontagem" -> 'fala' AS fala FROM video_jobs WHERE id = ${id}`;
  const l = linhas[0];
  return l?.plano?.cenas?.length && l.fala?.palavras?.length ? { plano: l.plano, fala: l.fala } : null;
}

async function gravarRoteiroDoVideo(id: string, r: RoteiroDoVideo): Promise<void> {
  const json = JSON.stringify(r);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = COALESCE("completoMontagem", '{}'::jsonb) || jsonb_build_object('roteiro', ${json}::jsonb)
    WHERE id = ${id}`;
}

/**
 * UM BLOCO do completo por vez, direto no caminho do jsonb (03/10). Até aqui
 * cada bloco pronto regravava o roteiro INTEIRO da memória deste processo:
 * quando o vigia relançava o roteiro com o anterior ainda vivo (um diretor de
 * 2 min por bloco passava dos 6 min sem renovar o prazo), o segundo processo
 * gravava por cima dos blocos que o primeiro já tinha planejado, e os dois
 * pagavam o diretor de novo (43 chamadas no vídeo de 19 min cmurn3adj).
 * Escrever só a posição do bloco nunca apaga bloco pronto de outro processo.
 * Só grava se o esqueleto do completo já existe no banco.
 */
async function gravarBlocoDoCompleto(id: string, k: number, bloco: RoteiroDoCompleto["blocos"][number]): Promise<void> {
  const json = JSON.stringify(bloco);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = jsonb_set("completoMontagem", ARRAY['roteiro', 'completo', 'blocos', ${String(k)}]::text[], ${json}::jsonb, false)
    WHERE id = ${id} AND jsonb_typeof("completoMontagem" #> '{roteiro,completo,blocos}') = 'array'`;
}

/** Os blocos do completo que JÁ estão prontos no banco (outro processo pode ter planejado). */
async function blocosProntosNoBanco(id: string): Promise<Map<number, RoteiroDoCompleto["blocos"][number]>> {
  const r = await lerRoteiroDoVideo(id);
  const saida = new Map<number, RoteiroDoCompleto["blocos"][number]>();
  (r?.completo?.blocos ?? []).forEach((b, k) => {
    if (b && b.plano !== undefined) saida.set(k, b);
  });
  return saida;
}

/** Um trecho por vez, direto no jsonb (mesmo cuidado de `gravarEdicaoDosTrechos`). */
async function gravarRoteiroDoCorte(id: string, indice: number, r: RoteiroDoCorte): Promise<void> {
  const json = JSON.stringify(r);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(clips, ARRAY[${String(indice)}, 'roteiro']::text[], ${json}::jsonb, true)
    WHERE id = ${id} AND jsonb_typeof(clips -> ${indice}::int) = 'object'`;
}

// ─────────────────────────────── créditos ───────────────────────────────

/** Já existe linha no extrato (inclusive a de valor zero do acesso interno)? */
async function registrado(operation: string, refId: string): Promise<boolean> {
  const t = await prisma.creditTransaction.findFirst({ where: { operation, refId }, select: { id: true } });
  return Boolean(t);
}

export const OPERACAO_DO_ROTEIRO = "video_roteiro";
export const OPERACAO_DA_APROVACAO = "video_aprovacao";

/**
 * A PRIMEIRA PARTE: transcrição, limpeza de fala, escolha dos cortes, roteiro
 * e a semana de peças escritas. Cobrada uma vez só, antes da seleção (é a
 * primeira etapa paga depois do envio, e a duração já é conhecida). Lança
 * `SaldoInsuficiente` sem cobrar nada quando não dá.
 */
export async function cobrarPrimeiraParte(v: {
  id: string;
  userId: string;
  projectId: string;
  durationSec: number | null;
  sizeBytes?: bigint | number | null;
}): Promise<number> {
  if (!roteiroLigado()) return 0;
  if (await registrado(OPERACAO_DO_ROTEIRO, v.id)) return 0;
  const quantidade = creditosDoRoteiro(v.durationSec ?? 0, Number(v.sizeBytes ?? 0) || undefined);
  await debitar({
    userId: v.userId,
    quantidade,
    operation: OPERACAO_DO_ROTEIRO,
    projectId: v.projectId,
    refId: v.id,
    note: `${Math.round((v.durationSec ?? 0) / 60)} min: transcrição, limpeza, escolha dos cortes, roteiro e semana escrita`,
  });
  await prisma.videoJob.update({ where: { id: v.id }, data: { creditsCharged: { increment: quantidade } } });
  return quantidade;
}

/** A segunda parte já foi cobrada? A redação (rota /write) não cobra o preço antigo em cima dela. */
export async function aprovacaoCobrada(videoId: string): Promise<boolean> {
  return registrado(OPERACAO_DA_APROVACAO, videoId);
}

// ─────────────────────────────── a fala de cada trecho ───────────────────────────────

function palavrasDoVideo(v: VideoDoRoteiro): Word[] {
  return (((v.transcript as { words?: Word[] } | null)?.words ?? []) as Word[]);
}

/**
 * Texto, intervalos e fala (no tempo do corte) de um trecho, com os termos do
 * cliente. A edição já gravada do trecho vale quando as bordas batem (vídeo
 * refeito: é o que o worker emendou da outra vez); senão, as remoções do roteiro.
 */
async function falaDoTrecho(
  v: VideoDoRoteiro,
  t: TrechoDoRoteiro,
  remocoes: Array<{ de: number; ate: number }>,
  termos: string | null
): Promise<Pick<RoteiroDoCorte, "inicio" | "fim" | "manter" | "texto" | "fala">> {
  const brutas = palavrasDoVideo(v);
  const palavras = aplicarTermos(brutas, parseTermos(termos));
  const { inicio, fim } = bordasDoCorte(t, palavras);
  const e = t.edicao;
  const manter =
    e && Math.abs(e.inicio - inicio) < 0.01 && Math.abs(e.fim - fim) < 0.01 && e.manter?.length
      ? e.manter
      : intervalosDoTrecho(remocoes, inicio, fim, palavras);
  const texto = textoFinalDoCorte(palavras, inicio, manter).texto;
  const f = await falaDoCorte({
    palavras: brutas,
    termos,
    inicio,
    fim,
    duracaoDaGravacao: v.durationSec ?? fim,
    edicao: { inicio, fim, manter, em: agora() },
  });
  return { inicio, fim, manter, texto, fala: { palavras: f.palavras, duracao: f.duracao } };
}

async function falaDoCompleto(v: VideoDoRoteiro, remocoes: Array<{ de: number; ate: number }>, termos: string | null): Promise<FalaDoTrecho> {
  const brutas = palavrasDoVideo(v);
  const dur = v.durationSec ?? (brutas.at(-1)?.end ?? 0);
  const manter = manterDoCompleto(v, remocoes, termos);
  const f = await falaDoCorte({ palavras: brutas, termos, inicio: 0, fim: dur, duracaoDaGravacao: dur, edicao: { inicio: 0, fim: dur, manter, em: agora() } });
  return { palavras: f.palavras, duracao: f.duracao };
}

/** Os pedaços mantidos do completo (tempo da gravação): a mesma conta da fala acima, sem IA. */
function manterDoCompleto(v: VideoDoRoteiro, remocoes: Array<{ de: number; ate: number }>, termos: string | null): Array<{ de: number; ate: number }> {
  const palavras = aplicarTermos(palavrasDoVideo(v), parseTermos(termos));
  const dur = v.durationSec ?? (palavras.at(-1)?.end ?? 0);
  return intervalosDoTrecho(remocoes, 0, dur, palavras);
}

/** As faixas de tela da gravação no tempo da fala do completo (01/10). */
function faixasDoCompleto(v: VideoDoRoteiro, r: RoteiroDoVideo, termos: string | null): FaixaDeTela[] {
  if (!r.telas?.faixas?.length) return [];
  const dur = v.durationSec ?? 0;
  return faixasNoTrecho(r.telas.faixas, 0, dur, manterDoCompleto(v, r.remocoes, termos));
}

/** O formato do completo pela medida do quadro (gravação em pé monta 9:16); sem medida, 16:9. */
function formatoDoRoteiro(r: RoteiroDoVideo): Formato {
  const q = r.telas?.quadro;
  return q && q.altura > q.largura ? "9:16" : "16:9";
}

const iguais = (a: Array<{ de: number; ate: number }>, b: Array<{ de: number; ate: number }>) =>
  a.length === b.length && a.every((m, i) => Math.abs(m.de - b[i].de) < 0.02 && Math.abs(m.ate - b[i].ate) < 0.02);

function semFala<T extends PlanoDeMontagem>(p: T): PlanoDeMontagem {
  const { formato, resumo, legenda, assets, cenas } = p;
  return { formato, resumo, legenda, assets, cenas };
}

// ─────────────────────────────── preparar ───────────────────────────────

/**
 * Prepara (ou continua) o roteiro. Idempotente: o que já está pronto fica, e
 * cada plano é gravado assim que chega, então uma função que morre no meio
 * perde só o que estava em voo.
 *
 * Devolve "continuar" quando o orçamento de tempo acabou com diretor por
 * fazer (vídeo longo): quem chama re-despacha o passo.
 */
export async function prepararRoteiro(
  videoId: string,
  /**
   * `semIA` e `semDiretor`: prova de tela sem gastar (30/09). Sem IA a limpeza
   * fica só no que é determinístico; sem diretor, só entra plano reaproveitado.
   */
  opcoes: { orcamentoMs?: number; semIA?: boolean; semDiretor?: boolean; semTelas?: boolean } = {}
): Promise<{ estado: "pronto" | "continuar"; planejados: number; blocos: number }> {
  const inicioMs = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 150_000;
  const v = await lerVideo(videoId);
  if (!v) throw new Error("vídeo não encontrado");
  const trechos = ((v.clips as TrechoDoRoteiro[] | null) ?? []).filter((t) => t && typeof t === "object");
  const termos = v.project.videoTerms;
  const duracao = v.durationSec ?? 0;

  // 1. A limpeza da gravação inteira (a única parte com IA fora do diretor).
  let r: RoteiroDoVideo = (await lerRoteiroDoVideo(videoId)) ?? { versao: 1, desde: agora(), remocoes: [], completo: null, cortesPlanejados: [] };
  if (!r.limpezaFeita) {
    const palavras = aplicarTermos(palavrasDoVideo(v), parseTermos(termos));
    const { remocoes } = await remocoesDaGravacao(palavras, duracao, { id: v.id, projectId: v.projectId, semIA: opcoes.semIA });
    r = { ...r, remocoes: remocoes.map((x) => ({ de: +x.de.toFixed(3), ate: +x.ate.toFixed(3), motivo: x.motivo })), limpezaFeita: true };
    await gravarRoteiroDoVideo(videoId, r);
  }

  // 1b. AS TELAS COMPARTILHADAS, antes do diretor (01/10). Até 30/09 o
  // roteiro planejava sem saber onde havia tela, e a montagem descartava
  // depois toda cena que encostava nela (20 cenas e 2,9% de cobertura no
  // completo de 22 min do Bruno). Uma vez por vídeo, e nunca derruba o roteiro.
  if (!r.telas && !opcoes.semTelas) {
    // A detecção pode levar minutos (o worker baixa a gravação inteira): o
    // `startedAt` é renovado a cada minuto para o cron da fila, que relança
    // roteiro parado há 6 min, não abrir uma segunda detecção em paralelo.
    const vivo = setInterval(() => {
      void prisma.videoJob.updateMany({ where: { id: videoId, status: "roteirizando" }, data: { startedAt: new Date() } }).catch(() => {});
    }, 60_000);
    try {
      r.telas = await detectarTelas({ id: v.id, projectId: v.projectId, blobUrl: v.blobUrl, durationSec: duracao, palavras: aplicarTermos(palavrasDoVideo(v), parseTermos(termos)) });
    } catch (e) {
      console.error(`[roteiro][${videoId}] telas:`, e);
      r.telas = { versao: 1, feitoEm: agora(), fonte: "fala", amostras: 0, mencoes: [], faixas: [], aviso: e instanceof Error ? e.message.slice(0, 120) : "falhou" };
    } finally {
      clearInterval(vivo);
    }
    await gravarRoteiroDoVideo(videoId, r);
  }
  const formato = formatoDoRoteiro(r);
  const faixasC = faixasDoCompleto(v, r, termos);

  // 2. O texto de cada candidato (sem IA).
  const falas: Array<Pick<RoteiroDoCorte, "inicio" | "fim" | "manter" | "texto" | "fala">> = [];
  for (const t of trechos) falas.push(await falaDoTrecho(v, t, r.remocoes, termos));

  // Quem o diretor planeja: os mais fortes pela nota.
  const montagemLigada = montagemNaEdicaoLigada();
  const planejar = montagemLigada
    ? trechos
        .map((t, i) => ({ i, nota: typeof t.nota === "number" ? t.nota : 0 }))
        .sort((a, b) => b.nota - a.nota)
        .slice(0, CORTES_PLANEJADOS_NO_ROTEIRO)
        .map((x) => x.i)
    : [];
  r.cortesPlanejados = planejar.sort((a, b) => a - b);

  const recortes = montagemLigada || montagemDoCompletoLigada() ? (await recortesDoProjeto(v.projectId).catch(() => [])).map((x) => x.descricao) : [];
  // A linguagem de agora e o perfil do projeto (01/10): lidos UMA vez e
  // passados ao diretor e ao revisor de todos os cortes e blocos.
  const estiloAtual = normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle).estiloId;
  const perfil = opcoes.semDiretor ? null : await perfilDoProjeto(v.projectId);
  // O revisor (Sonnet) confere o plano cena a cena contra a bíblia e pede
  // cenas novas ao diretor cena a cena: não tem o que fazer sobre o corte
  // limpo (03/10), que não tem imagem nem cena gerada e já sai validado.
  const limpo = usarDiretorLimpo(v.project.videoEstiloEscolha, v.project.videoStyle);
  const revisar = revisorLigado() && !opcoes.semDiretor && !limpo;
  const pessoa = { x: 0.2, y: 0, w: 0.6, h: 1 };
  const rosto = { x: pessoa.x + pessoa.w * 0.3, y: pessoa.y + 0.1, w: pessoa.w * 0.4, h: 0.3 };

  // As gravações ficam em fila: cada plano vai ao banco assim que chega.
  let fila: Promise<unknown> = Promise.resolve();
  const gravar = (f: () => Promise<unknown>) => (fila = fila.then(f).catch((e) => console.error(`[roteiro][${videoId}] gravar:`, e)));

  const tarefas: Array<() => Promise<void>> = [];
  for (const [i, t] of trechos.entries()) {
    const f = falas[i];
    const anterior = t.roteiro;
    // O mesmo roteiro de uma volta anterior (vídeo longo, continuação) fica.
    // A continuação de uma volta anterior não refaz o que já está pronto, desde
    // que o estilo seja o mesmo (01/10); roteiro sem a marca é desta mesma
    // rodada, de antes da marca existir.
    const mesmoEstiloDoAnterior = !anterior?.estiloId || anterior.estiloId === estiloAtual;
    if (anterior && mesmoEstiloDoAnterior && Math.abs(anterior.inicio - f.inicio) < 0.01 && iguais(anterior.manter, f.manter) && (anterior.plano || anterior.erro || !planejar.includes(i))) continue;
    const base: RoteiroDoCorte = { ...f, plano: null, feitoEm: agora(), estiloId: estiloAtual };
    // A montagem que o corte já teve (vídeo refeito): reaproveita em vez de
    // pagar o diretor de novo. A limpeza pode ter mudado umas palavras (a da
    // outra rodada foi outra chamada de IA), então o plano é levado para a
    // fala de agora pelo alinhamento por sequência; fala muito diferente
    // (duração 10% fora) é outro corte, e o diretor planeja. Plano de OUTRO
    // estilo não é reaproveitado (01/10): o cliente trocou o estilo para mudar.
    const velho = t.montagem?.plano;
    const mesmaFala = velho?.fala && Math.abs(velho.fala.duracao - f.fala.duracao) <= Math.max(3, f.fala.duracao * 0.1);
    if (planejar.includes(i) && velho?.cenas?.length && velho.fala && mesmaFala && planoServeAoEstilo(velho, t.roteiro?.estiloId, estiloAtual)) {
      const plano = iguais(velho.fala.manter, f.manter) && velho.fala.palavras.length === f.fala.palavras.length
        ? semFala(velho)
        : remapearPlano(semFala(velho), velho.fala.palavras, f.fala.palavras);
      await gravarRoteiroDoCorte(videoId, i, { ...base, plano, planoOriginal: plano, origem: "reaproveitado" });
      continue;
    }
    if (!planejar.includes(i)) {
      await gravarRoteiroDoCorte(videoId, i, base);
      continue;
    }
    if (opcoes.semDiretor) {
      await gravarRoteiroDoCorte(videoId, i, { ...base, erro: "prova sem diretor" });
      continue;
    }
    tarefas.push(async () => {
      try {
        const d = await dirigirMontagem({
          recortesProntos: recortes,
          projectId: v.projectId,
          referencia: `${v.id}/roteiro/${i}`,
          palavras: f.fala.palavras,
          duracao: f.fala.duracao,
          formato: "9:16",
          rosto,
          pessoa,
          escolha: v.project.videoEstiloEscolha,
          videoStyle: v.project.videoStyle,
          colorPalette: v.project.colorPalette,
          nicho: v.project.niche,
          titulo: t.titulo,
          perfil,
        });
        // O LOOP DE VERIFICAÇÃO (01/10): o revisor confere contra a bíblia,
        // a fala e o perfil do projeto, e as cenas apontadas são refeitas
        // ANTES de o cliente ver o roteiro e antes de qualquer imagem paga.
        let plano = d.plano;
        let revisao: ResumoDaRevisao | null = null;
        if (revisar) {
          const r = await revisarECorrigir({
            projectId: v.projectId,
            referencia: `${v.id}/roteiro/${i}`,
            plano,
            palavras: f.fala.palavras,
            duracao: f.fala.duracao,
            formato: "9:16",
            escolha: v.project.videoEstiloEscolha,
            videoStyle: v.project.videoStyle,
            colorPalette: v.project.colorPalette,
            nicho: v.project.niche,
            modo: "corte",
            perfil,
          });
          plano = r.plano;
          revisao = r.revisao;
        }
        await gravar(() => gravarRoteiroDoCorte(videoId, i, { ...base, plano, planoOriginal: plano, origem: "diretor", feitoEm: agora(), revisao }));
      } catch (e) {
        const erro = e instanceof Error ? e.message.slice(0, 140) : "falhou";
        console.error(`[roteiro][${videoId}] diretor do corte ${i}:`, erro);
        await gravar(() => gravarRoteiroDoCorte(videoId, i, { ...base, erro, feitoEm: agora() }));
      }
    });
  }

  // 2b. Os GANCHOS dos cortes curtos (01/10): uma frase forte de 3 a 5 s de
  // cada corte planejado, numa chamada só. Entra no começo da fila, junto do
  // primeiro diretor.
  if (!r.ganchosFeitos && montagemLigada && !opcoes.semDiretor && planejar.length) {
    tarefas.unshift(async () => {
      try {
        const g = await escolherGanchosDosCortes({
          projectId: v.projectId,
          cortes: planejar.map((i) => ({ indice: i, titulo: trechos[i].titulo, palavras: falas[i].fala.palavras })),
          estiloId: estiloAtual,
        });
        r.ganchos = Object.fromEntries([...g.entries()].map(([k, x]) => [String(k), x]));
      } catch (e) {
        console.error(`[roteiro][${videoId}] ganchos:`, e instanceof Error ? e.message : e);
      }
      r.ganchosFeitos = true;
      await gravar(() => gravarRoteiroDoVideo(videoId, r));
    });
  }

  // 3. O completo: coberto do começo ao fim (cotas por minuto, mais denso no
  // começo; ritmo-da-edicao.ts), planejado por blocos, com a tela compartilhada.
  const fecho = { formato, familia: familiaDaLinguagem(normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle).estiloId), faixas: faixasC };
  if (montagemDoCompletoLigada() && !r.completo?.plano && !r.completo?.erro) {
    const fala = r.completo?.fala ?? (await falaDoCompleto(v, r.remocoes, termos));
    const insercoes = insercoesDoCompleto(fala.duracao, formato);
    const lido = await montagemDoCompletoAnterior(videoId);
    // Plano de outro estilo não volta (01/10): o diretor planeja de novo.
    const anterior = lido && planoServeAoEstilo(lido.plano, r.completo?.estiloId, estiloAtual) ? lido : null;
    if (anterior) {
      // Vídeo refeito: o plano da montagem anterior, levado para esta fala.
      const plano = fecharCompleto(remapearPlano(anterior.plano, anterior.fala.palavras, fala.palavras), fala, fecho);
      r.completo = { fala, blocos: [], plano, planoOriginal: plano, insercoes, estiloId: estiloAtual };
      await gravarRoteiroDoVideo(videoId, r);
    } else if (opcoes.semDiretor) {
      r.completo = { fala, blocos: [], plano: null, insercoes, erro: "prova sem diretor" };
      await gravarRoteiroDoVideo(videoId, r);
    } else {
      const completo: RoteiroDoCompleto = r.completo ?? { fala, blocos: blocosDaFala(fala.palavras, fala.duracao), plano: null, insercoes, estiloId: estiloAtual };
      // O esqueleto vai ao banco ANTES dos blocos (03/10): cada bloco pronto é
      // gravado na posição dele, e a retomada continua do bloco seguinte.
      if (!r.completo) {
        r.completo = completo;
        await gravarRoteiroDoVideo(videoId, r);
      }
      // Bloco que outro processo (um relance anterior) já planejou fica.
      for (const [k, pronto] of await blocosProntosNoBanco(videoId)) completo.blocos[k] = pronto;
      const { rosto: rostoDoVideo, pessoa: pessoaDoVideo } = geometriaDaPessoa(v.clips);
      const total = completo.blocos.length;
      const cotas = cotasDoCompleto(fala.duracao, formato);
      for (const [k, b] of completo.blocos.entries()) {
        if (b.plano !== undefined) continue;
        tarefas.push(async () => {
          try {
            const jaUsado = completo.blocos.flatMap((x) => (x.plano ? usadoNoPlano(x.plano) : []));
            b.plano = await dirigirBloco({
              v: { id: v.id, projectId: v.projectId, clips: v.clips, videoEstiloEscolha: v.project.videoEstiloEscolha, videoStyle: v.project.videoStyle, colorPalette: v.project.colorPalette, niche: v.project.niche },
              bloco: b,
              indice: k,
              total,
              fala,
              // A câmera é o que sobra fora das telas detectadas antes do roteiro (01/10).
              analise: { trechosDeCamera: cameraForaDasFaixas(faixasC, fala.duracao) },
              rosto: rostoDoVideo,
              pessoa: pessoaDoVideo,
              jaUsado,
              recortesProntos: recortes,
              cotas,
              faixas: faixasC,
              formato,
            });
            // O revisor também no completo (01/10), bloco a bloco: a cena que
            // cai em tela compartilhada fica como o diretor fez (o fecho do
            // completo trata a tela).
            if (revisar && b.plano) {
              const doBloco = falaDoBloco(fala.palavras, b);
              const rv = await revisarECorrigir({
                projectId: v.projectId,
                referencia: `${v.id}/completo/${k}`,
                plano: b.plano,
                palavras: doBloco.palavras,
                duracao: doBloco.duracao,
                formato,
                escolha: v.project.videoEstiloEscolha,
                videoStyle: v.project.videoStyle,
                colorPalette: v.project.colorPalette,
                nicho: v.project.niche,
                modo: "completo",
                perfil,
                intocavel: (ini, fim) => faixasC.some((x) => x.de < b.inicio + fim && x.ate > b.inicio + ini),
              });
              b.plano = rv.plano;
              completo.revisoes = completo.revisoes ?? [];
              completo.revisoes[k] = rv.revisao;
            }
          } catch (e) {
            b.plano = null;
            b.erro = e instanceof Error ? e.message.slice(0, 140) : "falhou";
          }
          await gravar(() => gravarBlocoDoCompleto(videoId, k, b));
        });
      }
    }
  }

  // 3b. A ABERTURA com os melhores momentos do completo (01/10, estilo
  // MrBeast): o diretor escolhe as frases mais fortes do tema pela fala do
  // completo; o cliente aprova e troca na tela. Momento em tela compartilhada
  // fica por último na fila (tela sem contexto não prende).
  if (!r.abertura && r.completo?.fala?.palavras?.length && !opcoes.semDiretor) {
    const fala = r.completo.fala;
    const radar = v.radar as { tema?: string; resumo?: string; teses?: Array<{ minuto: string; frase: string }> } | null;
    tarefas.unshift(async () => {
      try {
        // No corte limpo (03/10) a abertura é a frase de gancho mais forte
        // pela nota do JEV, de 2 a 4 s; o Sonnet lendo tudo fica para quem
        // ligou as inserções de IA.
        if (limpo) {
          r.abertura = await aberturaPeloJev({ palavras: fala.palavras, projectId: v.projectId, nicho: v.project.niche, evitar: (t) => Boolean(faixaNoInstante(faixasC, t)) });
          await gravar(() => gravarRoteiroDoVideo(videoId, r));
          return;
        }
        r.abertura = await escolherAberturaDoCompleto({
          projectId: v.projectId,
          referencia: `${v.id}/abertura`,
          palavras: fala.palavras,
          tema: radar?.tema ?? null,
          resumo: radar?.resumo ?? null,
          teses: radar?.teses?.slice(0, 6),
          evitar: (t) => Boolean(faixaNoInstante(faixasC, t)),
          estiloId: estiloAtual,
        });
      } catch (e) {
        r.abertura = { momentos: [], reservas: [], feitoEm: agora(), erro: e instanceof Error ? e.message.slice(0, 120) : "falhou" };
      }
      await gravar(() => gravarRoteiroDoVideo(videoId, r));
    });
  }

  // 4. O diretor, em paralelo, até o orçamento de tempo. Tarefa começada
  // termina (o teto da rota cobre duas rodadas do diretor).
  // O PRAZO RENOVADO ENQUANTO SE TRABALHA (03/10): o vigia relança o roteiro
  // parado há 6 min; uma onda de diretores cena a cena passava disso sem
  // ninguém renovar o `startedAt`, e o relance refazia os blocos em paralelo.
  const vivo = setInterval(() => {
    void prisma.videoJob.updateMany({ where: { id: videoId, status: "roteirizando" }, data: { startedAt: new Date() } }).catch(() => {});
  }, 60_000);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < tarefas.length && Date.now() - inicioMs < orcamento) {
      const t = tarefas[proxima++];
      await t();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(DIRETORES_EM_PARALELO, tarefas.length) }, trabalhador));
    await fila;
  } finally {
    clearInterval(vivo);
  }

  if (proxima < tarefas.length) return { estado: "continuar", planejados: proxima, blocos: r.completo?.blocos.length ?? 0 };

  // 5. Com todos os blocos, o plano do completo inteiro.
  const c = r.completo;
  if (c && !c.plano && c.blocos.length) for (const [k, pronto] of await blocosProntosNoBanco(videoId)) c.blocos[k] = pronto;
  if (c && !c.plano && c.blocos.length && c.blocos.every((b) => b.plano !== undefined)) {
    if (c.blocos.every((b) => !b.plano)) {
      c.erro = c.blocos.find((b) => b.erro)?.erro ?? "o diretor não planejou nenhum bloco";
    } else {
      const plano = fecharCompleto(juntarPlanos(c.blocos as Parameters<typeof juntarPlanos>[0], formato), c.fala, fecho);
      c.plano = plano;
      c.planoOriginal = plano;
    }
    // Os planos por bloco já estão no plano inteiro: sai do banco o que pesa.
    c.blocos = c.blocos.map((b) => ({ de: b.de, ate: b.ate, inicio: b.inicio, fim: b.fim, ...(b.erro ? { erro: b.erro } : {}) }));
  }
  r.feitoEm = agora();
  await gravarRoteiroDoVideo(videoId, r);
  return { estado: "pronto", planejados: proxima, blocos: c?.blocos.length ?? 0 };
}

/**
 * O fecho do completo no roteiro (01/10): cotas por minuto (o começo mais
 * denso), tela compartilhada tratada como tela com a região e a webcam da
 * visão, ritmo mínimo, e os tetos de cinema e imagem. Até 30/09: uma inserção
 * a cada ~2 min, sem saber da tela (ver ritmo-da-edicao.ts).
 */
export function fecharCompleto(
  plano: PlanoDeMontagem,
  fala: FalaDoTrecho,
  ctx: { formato: Formato; familia: "colagem" | "impacto" | "sobrio"; faixas: FaixaDeTela[] }
): PlanoDeMontagem {
  const minutos = fala.duracao / 60;
  return fecharPlanoDoCompleto(plano, {
    palavras: fala.palavras,
    duracao: fala.duracao,
    formato: ctx.formato,
    familia: ctx.familia,
    camera: cameraForaDasFaixas(ctx.faixas, fala.duracao),
    faixas: ctx.faixas,
    cenasDeCinema: Number(process.env.MONTAGEM_COMPLETO_CENAS_IA ?? 4),
    // 3 por minuto até 02/10: menos inserções e melhores.
    imagens: Math.max(4, Math.round(minutos * 2)),
  }).plano;
}

// ─────────────────────────────── a tela ───────────────────────────────

export async function montarTela(videoId: string, userId: string): Promise<TelaDeRoteiro | null> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoId, project: projetoVisivel(userId) },
    select: { id: true },
  });
  if (!video) return null;
  const v = (await lerVideo(videoId))!;
  const r = await lerRoteiroDoVideo(videoId);
  const escolha = normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle);
  const familia = familiaDaLinguagem(escolha.estiloId);
  const radar = v.radar as { tema?: string; resumo?: string; teses?: Array<{ minuto: string; frase: string }> } | null;
  // O saldo da CONTA que paga (01/10): a gravação de um membro sai do dono.
  const dono = await prisma.user.findUnique({ where: { id: await contaDoPlano(v.userId) }, select: { creditsBalance: true, role: true } });
  const pago = await prisma.creditTransaction.findFirst({ where: { operation: OPERACAO_DO_ROTEIRO, refId: videoId }, select: { amount: true, note: true } });
  const trechos = (v.clips as TrechoDoRoteiro[] | null) ?? [];
  const aprovado = Boolean(r?.aprovadoEm);
  const lista = parseTermos(v.project.videoTerms);
  // Quem pagou o roteiro antes de 01/10 aprova no preço de até 30/09: foi o
  // total que a tela de envio mostrou a ele (01/10).
  const precoAntigo = roteiroPagoNoPrecoAntigo(pago?.amount, v.durationSec ?? 0, Number(v.sizeBytes ?? 0) || undefined);
  // O gancho de cada candidato mora no roteiro do vídeo até a aprovação (ver `ganchos`).
  const comGancho = trechos.map((t, i) => {
    const g = r?.ganchos?.[String(i)];
    return g && t.roteiro && !t.roteiro.gancho ? { ...t, roteiro: { ...t.roteiro, gancho: g } } : t;
  });
  // As faixas de tela no tempo do completo, para o cliente conferir onde há tela.
  const telas = r ? faixasDoCompleto(v, r, v.project.videoTerms).map((f) => ({ inicio: f.de, fim: f.ate, mostra: f.mostra.slice(0, 3) })) : [];
  return {
    videoId,
    projectId: v.projectId,
    nome: v.originalName ?? "Gravação",
    status: v.status,
    familia,
    tema: radar?.tema ?? null,
    resumo: radar?.resumo ?? null,
    teses: (radar?.teses ?? []).slice(0, 4),
    diagnostico: v.diagnostico,
    termos: v.project.videoTerms ?? "",
    trocas: lista.trocas ?? [],
    cortes: cortesNaTela(comGancho, familia, montagemNaEdicaoLigada()),
    completo: completoNaTela(r?.completo, familia, montagemDoCompletoLigada(), v.durationSec ?? 0, { abertura: r?.abertura, telas }),
    duracaoSec: v.durationSec ?? 0,
    creditos: {
      roteiro: pago ? Math.abs(pago.amount) || creditosDoRoteiro(v.durationSec ?? 0) : creditosDoRoteiro(v.durationSec ?? 0),
      porCorte: creditosPorCorteAprovado(precoAntigo),
      completo: creditosDaAprovacao(v.durationSec ?? 0, 0, precoAntigo),
      abertura: creditosDaAbertura(r, precoAntigo),
      novaIdeia: CREDITOS_POR_NOVA_IDEIA,
      saldo: dono?.creditsBalance ?? null,
      interno: dono?.role === "admin",
    },
    maxCortes: MAX_CORTES_APROVADOS,
    aprovadoEm: r?.aprovadoEm ?? null,
    videoCurto: (v.durationSec ?? 0) > 0 && (v.durationSec ?? 0) <= VIDEO_CURTO_SEG,
    // Antes da aprovação, a sugestão: os mais fortes pela nota (3); cabem até 8.
    // O vídeo que já é curto (02/10, o gêmeo de 52 s) vem sem corte marcado.
    escolhidos: aprovado
      ? trechos.map((_, i) => i)
      : (v.durationSec ?? 0) > 0 && (v.durationSec ?? 0) <= VIDEO_CURTO_SEG
        ? []
        : trechos
          .map((t, i) => ({ i, nota: typeof t.nota === "number" ? t.nota : 0 }))
          .sort((a, b) => b.nota - a.nota)
          .slice(0, CORTES_SUGERIDOS)
          .map((x) => x.i)
          .sort((a, b) => a - b),
  };
}

/** A abertura com os melhores momentos (01/10): cobrada só se ligada, e nunca no preço antigo. */
function creditosDaAbertura(r: RoteiroDoVideo | null, precoAntigo: boolean): number {
  return !precoAntigo && aberturaAtiva(r?.abertura) ? CREDITOS_DA_ABERTURA_DO_COMPLETO : 0;
}

// ─────────────────────────────── ajustes do cliente ───────────────────────────────

export class RecusaDoRoteiro extends Error {
  constructor(msg: string, readonly status = 409) {
    super(msg);
  }
}

async function videoDoDono(videoId: string, userId: string): Promise<VideoDoRoteiro> {
  const dono = await prisma.videoJob.findFirst({ where: { id: videoId, project: projetoVisivel(userId) }, select: { id: true } });
  if (!dono) throw new RecusaDoRoteiro("Vídeo não encontrado.", 404);
  const v = (await lerVideo(videoId))!;
  // "aprovando" parado há 2 min é aprovação que morreu no meio (a cobrança é
  // idempotente): o cliente pode aprovar de novo.
  if (v.status === "aprovando" && v.startedAt && Date.now() - v.startedAt.getTime() > APROVACAO_MORTA_MS) v.status = "roteiro";
  if (v.status !== "roteiro") {
    throw new RecusaDoRoteiro(
      v.status === "roteirizando" ? "O roteiro ainda está sendo montado. Em um minuto ele fica pronto." : "Este roteiro já foi aprovado e o squad está gerando."
    );
  }
  return v;
}

const APROVACAO_MORTA_MS = 2 * 60_000;

export type AcaoNaCena = {
  alvo: "corte" | "completo";
  trecho?: number;
  cena: number;
  acao: "remover" | "editar" | "restaurar" | "nova-ideia";
  texto?: string;
};

/** Remover, editar, desfazer ou pedir outra ideia numa cena. Devolve a tela nova. */
export async function ajustarCena(videoId: string, userId: string, a: AcaoNaCena): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  const r = await lerRoteiroDoVideo(videoId);
  const trechos = (v.clips as TrechoDoRoteiro[] | null) ?? [];
  let alvo: { plano: PlanoDeMontagem; original?: PlanoDeMontagem | null; fala: FalaDoTrecho } | null = null;
  if (a.alvo === "corte") {
    const rc = trechos[a.trecho ?? -1]?.roteiro;
    if (rc?.plano) alvo = { plano: rc.plano, original: rc.planoOriginal, fala: rc.fala };
  } else if (r?.completo?.plano) {
    alvo = { plano: r.completo.plano, original: r.completo.planoOriginal, fala: r.completo.fala };
  }
  if (!alvo || !alvo.plano.cenas[a.cena]) throw new RecusaDoRoteiro("Não achei esta cena. Recarregue a página.", 404);

  let novo: PlanoDeMontagem;
  if (a.acao === "remover") novo = removerEfeito(alvo.plano, a.cena);
  else if (a.acao === "editar") {
    if (!a.texto?.trim()) throw new RecusaDoRoteiro("Escreva o que você quer ver nesta cena.", 400);
    novo = editarIdeia(alvo.plano, a.cena, a.texto);
  } else if (a.acao === "restaurar") {
    if (!alvo.original) throw new RecusaDoRoteiro("Esta cena não tem versão anterior.", 400);
    novo = restaurarCena(alvo.plano, a.cena, alvo.original);
  } else {
    novo = await outraIdeia(v, alvo, a);
  }

  if (a.alvo === "corte") {
    const rc = trechos[a.trecho!].roteiro!;
    await gravarRoteiroDoCorte(videoId, a.trecho!, { ...rc, plano: novo });
  } else {
    await gravarRoteiroDoVideo(videoId, { ...r!, completo: { ...r!.completo!, plano: novo } });
  }
  return (await montarTela(videoId, userId))!;
}

/** "Outra ideia": cobra os créditos do botão e chama o diretor só para a cena. */
async function outraIdeia(
  v: VideoDoRoteiro,
  alvo: { plano: PlanoDeMontagem; fala: FalaDoTrecho },
  a: AcaoNaCena
): Promise<PlanoDeMontagem> {
  const c = alvo.plano.cenas[a.cena];
  const palavras = alvo.fala.palavras;
  const { inicio, fim } = tempoDaCena(c, palavras, alvo.fala.duracao);
  const daCena = palavras.slice(c.de, c.ate + 1).map((p) => ({ texto: p.texto, inicio: +(p.inicio - inicio).toFixed(3), fim: +(p.fim - inicio).toFixed(3) }));
  const refId = `${v.id}:${a.alvo}:${a.trecho ?? "c"}:${a.cena}:${Date.now()}`;
  await debitar({
    userId: v.userId,
    quantidade: CREDITOS_POR_NOVA_IDEIA,
    operation: "roteiro_nova_ideia",
    projectId: v.projectId,
    refId,
    note: a.texto?.trim() ? `Outra ideia para uma cena: "${a.texto.trim().slice(0, 80)}"` : "Outra ideia para uma cena",
  });
  const plano = await novaIdeiaDaCena({
    projectId: v.projectId,
    referencia: refId,
    palavras: daCena,
    duracao: +(fim - inicio).toFixed(3),
    formato: a.alvo === "corte" ? "9:16" : "16:9",
    escolha: v.project.videoEstiloEscolha,
    videoStyle: v.project.videoStyle,
    colorPalette: v.project.colorPalette,
    nicho: v.project.niche,
    antes: palavras.slice(Math.max(0, c.de - 25), c.de).map((p) => p.texto).join(" "),
    depois: palavras.slice(c.ate + 1, c.ate + 26).map((p) => p.texto).join(" "),
    atual: `${c.layout}, ${c.movimento}, ${c.elementos.map((e) => e.tipo).join(", ") || "sem elementos"}; ${c.motivo}; fala: ${palavrasDaCena(c, palavras)}`,
    pedido: a.texto?.trim() || null,
  });
  return trocarCena(alvo.plano, a.cena, plano, `n${Date.now() % 1_000_000}`);
}

export type AcaoNaAbertura = {
  alvo: "completo" | "corte";
  /** Corte: o índice em `clips` (antes da aprovação). */
  trecho?: number;
  acao: "trocar" | "tirar" | "acrescentar" | "desligar" | "ligar";
  /** Completo: qual momento (para trocar e tirar). */
  momento?: number;
};

/**
 * A abertura na tela de roteiro (01/10): trocar um momento pela próxima frase
 * forte, tirar, pôr mais um, ou desligar a abertura inteira (aí não cobra). No
 * corte, trocar o gancho ou desligar. Nada aqui chama IA: as reservas vieram
 * na mesma escolha do diretor.
 */
export async function ajustarAbertura(videoId: string, userId: string, a: AcaoNaAbertura): Promise<TelaDeRoteiro> {
  await videoDoDono(videoId, userId);
  const r = await lerRoteiroDoVideo(videoId);
  if (!r) throw new RecusaDoRoteiro("Este vídeo ainda não tem roteiro.");
  if (a.alvo === "completo") {
    const ab = r.abertura;
    if (!ab) throw new RecusaDoRoteiro("A abertura ainda está sendo escolhida. Recarregue em um minuto.", 409);
    let nova = ab;
    if (a.acao === "trocar") nova = trocarMomento(ab, a.momento ?? -1);
    else if (a.acao === "tirar") nova = tirarMomento(ab, a.momento ?? -1);
    else if (a.acao === "acrescentar") nova = acrescentarMomento(ab);
    else if (a.acao === "desligar") nova = { ...ab, desligada: true };
    else nova = { ...ab, desligada: false };
    if (nova === ab && (a.acao === "trocar" || a.acao === "acrescentar")) throw new RecusaDoRoteiro("Não há outra frase forte que caiba na abertura sem passar de 25 s.", 409);
    await gravarRoteiroDoVideo(videoId, { ...r, abertura: nova });
  } else {
    const k = String(a.trecho ?? -1);
    const g: GanchoDoCorte | undefined = r.ganchos?.[k];
    if (!g) throw new RecusaDoRoteiro("Este corte ainda não tem gancho.", 404);
    const novo = a.acao === "trocar" ? trocarGancho(g) : { ...g, desligado: a.acao === "desligar" };
    if (a.acao === "trocar" && novo === g) throw new RecusaDoRoteiro("Não há outra frase forte neste corte.", 409);
    await gravarRoteiroDoVideo(videoId, { ...r, ganchos: { ...(r.ganchos ?? {}), [k]: novo } });
  }
  return (await montarTela(videoId, userId))!;
}

/**
 * Corrige um termo ("Cloud" vira "Claude") no projeto e refaz o texto do
 * roteiro inteiro, sem IA: a troca vale para a legenda, a fala da montagem e
 * todo vídeo novo do projeto. Os planos acompanham a fala nova (a troca pode
 * juntar palavras: "arete com" vira "Areticon").
 */
export async function corrigirTermo(videoId: string, userId: string, entrada: { errado: string; certo: string }): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  const troca = lerTroca(`${entrada.errado} => ${entrada.certo}`);
  if (!troca) throw new RecusaDoRoteiro("Escreva a palavra como saiu e como é o certo, diferentes.", 400);
  const termos = comTroca(v.project.videoTerms, troca);
  await prisma.project.update({ where: { id: v.projectId }, data: { videoTerms: termos } });
  await refazerTextos({ ...v, project: { ...v.project, videoTerms: termos } });
  return (await montarTela(videoId, userId))!;
}

async function refazerTextos(v: VideoDoRoteiro): Promise<void> {
  const r = await lerRoteiroDoVideo(v.id);
  if (!r) return;
  const trechos = (v.clips as TrechoDoRoteiro[] | null) ?? [];
  for (const [i, t] of trechos.entries()) {
    const rc = t.roteiro;
    if (!rc) continue;
    // As mesmas bordas e intervalos: só o texto e as palavras mudam.
    const f = await falaDoTrecho(v, { ...t, edicao: { inicio: rc.inicio, fim: rc.fim, manter: rc.manter } }, r.remocoes, v.project.videoTerms);
    const mudouLista = f.fala.palavras.length !== rc.fala.palavras.length;
    await gravarRoteiroDoCorte(v.id, i, {
      ...rc,
      texto: f.texto,
      fala: f.fala,
      plano: rc.plano && mudouLista ? remapearPlano(rc.plano, rc.fala.palavras, f.fala.palavras) : rc.plano,
      planoOriginal: rc.planoOriginal && mudouLista ? remapearPlano(rc.planoOriginal, rc.fala.palavras, f.fala.palavras) : rc.planoOriginal,
    });
  }
  if (r.completo) {
    const fala = await falaDoCompleto(v, r.remocoes, v.project.videoTerms);
    const mudouLista = fala.palavras.length !== r.completo.fala.palavras.length;
    const c = r.completo;
    await gravarRoteiroDoVideo(v.id, {
      ...r,
      completo: {
        ...c,
        fala,
        plano: c.plano && mudouLista ? remapearPlano(c.plano, c.fala.palavras, fala.palavras) : c.plano,
        planoOriginal: c.planoOriginal && mudouLista ? remapearPlano(c.planoOriginal, c.fala.palavras, fala.palavras) : c.planoOriginal,
      },
    });
  }
}

// ─────────────────────────────── aprovar ───────────────────────────────

/**
 * APROVAR E GERAR: cobra a segunda parte (pelos cortes escolhidos e pelo
 * completo), deixa em `clips` só os escolhidos (os outros ficam guardados no
 * roteiro) e devolve o vídeo à esteira em "selected". Quem despacha o corte é
 * a rota, depois de responder.
 */
/** Até quanto o vídeo já é curto o bastante para ir inteiro, sem cortes (02/10). */
export const VIDEO_CURTO_SEG = 90;

export async function aprovarRoteiro(videoId: string, userId: string, escolhidos: number[]): Promise<{ cobrado: number; cortes: number }> {
  const v = await videoDoDono(videoId, userId);
  const r = await lerRoteiroDoVideo(videoId);
  if (!r) throw new RecusaDoRoteiro("Este vídeo ainda não tem roteiro.");
  const trechos = (v.clips as TrechoDoRoteiro[] | null) ?? [];
  const lista = [...new Set(escolhidos)].filter((i) => Number.isInteger(i) && i >= 0 && i < trechos.length).sort((a, b) => a - b);
  // APROVAR SÓ O VÍDEO COMPLETO (02/10, pedido do Bruno: o vídeo do gêmeo de
  // 52 s não pede corte nenhum). Zero cortes vale: cobra só a parte do
  // completo e a esteira monta só ele (o cortar-callback trata a lista vazia).
  // Sem o completo planejado não há o que aprovar.
  if (!lista.length && !r.completo?.plano) throw new RecusaDoRoteiro("Escolha pelo menos um corte: este vídeo não tem o completo planejado.", 400);
  if (lista.length > MAX_CORTES_APROVADOS) throw new RecusaDoRoteiro(`Escolha no máximo ${MAX_CORTES_APROVADOS} cortes.`, 400);

  // Toma a aprovação antes de cobrar: dois cliques seguidos, e só um passa.
  const tomado = await prisma.videoJob.updateMany({
    where: {
      id: videoId,
      OR: [{ status: "roteiro" }, { status: "aprovando", startedAt: { lt: new Date(Date.now() - APROVACAO_MORTA_MS) } }],
    },
    data: { status: "aprovando", startedAt: new Date() },
  });
  if (tomado.count === 0) throw new RecusaDoRoteiro("Este roteiro já está sendo aprovado.");

  // A transição de 01/10: roteiro pago no preço antigo aprova no preço antigo,
  // a mesma regra que a tela usa para mostrar o número do botão.
  const pagoRoteiro = await prisma.creditTransaction.findFirst({ where: { operation: OPERACAO_DO_ROTEIRO, refId: videoId }, select: { amount: true } });
  const precoAntigo = roteiroPagoNoPrecoAntigo(pagoRoteiro?.amount, v.durationSec ?? 0, Number(v.sizeBytes ?? 0) || undefined);
  // A abertura dos melhores momentos (01/10) entra na mesma cobrança, se ligada.
  const abertura = creditosDaAbertura(r, precoAntigo);
  const quantidade = creditosDaAprovacao(v.durationSec ?? 0, lista.length, precoAntigo) + abertura;
  try {
    if (!(await registrado(OPERACAO_DA_APROVACAO, videoId))) {
      await debitar({
        userId: v.userId,
        quantidade,
        operation: OPERACAO_DA_APROVACAO,
        projectId: v.projectId,
        refId: videoId,
        note: `${lista.length ? `${lista.length} ${lista.length === 1 ? "corte" : "cortes"} e o vídeo completo` : "Só o vídeo completo, sem cortes,"}${abertura ? " com a abertura dos melhores momentos" : ""}, com a edição aprovada`,
      });
    }
  } catch (e) {
    await prisma.videoJob.update({ where: { id: videoId }, data: { status: "roteiro", startedAt: null } });
    throw e;
  }

  // Cada corte que fica leva o gancho dele para o próprio roteiro (os índices
  // mudam aqui: `clips` passa a ter só os escolhidos).
  const ficam = lista.map((i) => {
    const t = trechos[i];
    const g = r.ganchos?.[String(i)];
    return { ...t, publicar: true, ...(g && t.roteiro && !t.roteiro.gancho ? { roteiro: { ...t.roteiro, gancho: g } } : {}) };
  });
  const descartados = trechos.filter((_, i) => !lista.includes(i));
  await gravarRoteiroDoVideo(videoId, {
    ...r,
    aprovadoEm: agora(),
    descartados,
    creditos: { ...(r.creditos ?? {}), aprovacao: quantidade },
  });
  await prisma.videoJob.update({
    where: { id: videoId },
    data: {
      status: "selected",
      clips: ficam as unknown as Prisma.InputJsonValue,
      startedAt: null,
      attempts: 0,
      error: null,
      // A contagem regressiva da faixa parte da aprovação: o tempo em que o
      // roteiro esperou o cliente não é tempo do squad.
      rodadaEm: new Date(),
      creditsCharged: { increment: quantidade },
    },
  });
  return { cobrado: quantidade, cortes: lista.length };
}
