import { contaDoPlano } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { debitar, SaldoInsuficiente } from "@/lib/credits";
import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { emendarNoSilencio, intervalosDoTrecho, type Remocao } from "@/lib/media/edicao";
import { remocoesDaGravacao, type VideoParaCortar } from "@/lib/media/pedido-de-corte";
import { enviarRecorteDoTrecho, refazerCapa } from "@/lib/media/refazer";
import { falaDoCorte, montagemNaEdicaoLigada, planoAprovadoDoCorte, refazerMontagens } from "@/lib/media/montagem-nos-cortes";
import { novaIdeiaDaCena } from "@/lib/media/diretor-de-montagem";
import { recortesDoProjeto, type AssetGerado } from "@/lib/media/assets-da-montagem";
import { lerMontagem, type MontagemDoCorte } from "@/lib/media/estado-da-montagem";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { familiaDaLinguagem } from "@/lib/media/capa-composta";
import { noTempoDoCorte } from "@/lib/media/legenda-falada";
import { textoFinalDoCorte } from "@/lib/media/texto-final-do-corte";
import { ASSETS_EM_VIDEO, type CenaDoPlano, type PalavraNoCorte, type PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import {
  cenaNaTela,
  cenaTemEfeito,
  editarIdeia,
  palavrasDaCena,
  remapearPlano,
  removerEfeito,
  restaurarCena,
  semAssetsSoltos,
  tempoDaCena,
  trocarCena,
  type RoteiroDoCorte,
  type RoteiroDoVideo,
} from "@/lib/media/roteiro-em-texto";
import {
  CREDITOS_POR_CENA_NO_AJUSTE,
  CREDITOS_POR_CENARIO_NO_AJUSTE,
  CREDITOS_POR_IMAGEM_NO_AJUSTE,
  CREDITOS_POR_NOVA_IDEIA,
} from "@/lib/media/limits";
import type { MontagemDoCompleto } from "@/lib/media/montagem-do-completo";
import type { Word } from "@/lib/media/transcribe";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * O CLIENTE AJUSTA O VÍDEO PELO CHAT DO CARD (30/09/2026).
 *
 * O pedido do Bruno: o cliente ajusta os vídeos pelo chat do card, "porque é
 * essa a forma que o usuário vai fazer". Até aqui o chat do corte só entendia
 * segundos ("começa 2 s depois") e capa; tirar um trecho do meio, terminar numa
 * palavra, tirar uma imagem ou trocar uma cena caíam na edição de TEXTO do post
 * e o vídeo não mudava. No card do vídeo completo, qualquer pedido reescrevia o
 * post e dizia que tinha feito.
 *
 * ## O que o Vitor entende
 *
 * Uma chamada curta ao modelo (esforço baixo) com a fala do corte numerada,
 * palavra por palavra, com o tempo de cada uma no ar, e as cenas da edição em
 * português (as mesmas frases da tela de roteiro). Ele devolve AÇÕES em
 * índices, e o código confere cada índice antes de fazer qualquer coisa:
 *
 *   - onde o corte começa e termina, por palavra ou por segundo;
 *   - trechos do meio a tirar ("a parte em que eu erro e repito");
 *   - cenas: tirar o efeito, trocar a imagem, outra ideia, desfazer;
 *   - um intervalo sem efeito ("nos primeiros 10 segundos");
 *   - capa, ou texto do post (este segue o caminho antigo da rota).
 *
 * Pedido ambíguo volta como PERGUNTA, e nada é feito: chutar a cena errada e
 * refazer a edição custa tempo do cliente e dinheiro nosso.
 *
 * ## Como refaz sem pagar de novo
 *
 * - Cena ou efeito: o plano da edição que está no ar muda, e SÓ a montagem é
 *   refeita. No corte, o plano ajustado vira o roteiro aprovado do corte
 *   (`clips[i].roteiro`), e `planoAprovadoDoCorte` faz a montagem usá-lo sem
 *   chamar o diretor. No completo, o estado volta a "ilustrando" com o plano
 *   novo. Imagem e cena com o mesmo pedido saem de graça pelo hash guardado
 *   (lib/media/assets-da-montagem.ts): só o que mudou é gerado.
 * - Tempo e trecho do meio: o corte é refeito no worker com as bordas no
 *   silêncio e as remoções guardadas (sem rodar a limpeza por IA de novo), e o
 *   plano de cenas é levado para a fala nova palavra por palavra. A montagem
 *   que vem depois do re-corte reconhece o plano e não chama o diretor.
 *
 * ## Custo
 *
 * O que gera imagem ou cena nova mostra o custo em créditos e espera um "sim"
 * (o pedido fica em `metadata.ajustePendente` do card). O que não gera nada é
 * feito na hora. "Outra ideia" cobra os créditos do botão da tela de roteiro
 * (`CREDITOS_POR_NOVA_IDEIA`, 10 desde 01/10),
 * e a ideia nova é mostrada antes de gerar as imagens dela.
 */

// ─────────────────────────────── tipos ───────────────────────────────

export type Fala = { palavras: PalavraNoCorte[]; duracao: number };
type Intervalo = { de: number; ate: number };

export type TrechoLido = {
  inicio: number;
  fim: number;
  emPausa?: boolean;
  titulo?: string;
  transcricao?: string;
  edicao?: { inicio: number; fim: number; manter: Intervalo[] } | null;
  roteiro?: RoteiroDoCorte | null;
  montagem?: (MontagemDoCorte & { plano?: (PlanoDeMontagem & { fala?: { manter: Intervalo[]; palavras: PalavraNoCorte[]; duracao: number } }) | null }) | null;
  midia?: Record<string, unknown> | null;
  /** Os trechos do meio que o cliente mandou tirar pelo chat, no tempo da gravação. */
  remocoesDoCliente?: Remocao[];
  /**
   * A reedição ainda não refeita (tela de roteiro reaberta): as bordas e as
   * remoções que o cliente escolheu. Só vira `inicio`/`fim` do trecho quando
   * ele manda refazer, para nada no ar mudar antes disso.
   */
  rascunho?: { inicio: number; fim: number; emPausa?: boolean; remocoesDoCliente?: Remocao[] } | null;
};

export type VideoLido = {
  id: string;
  projectId: string;
  userId: string;
  blobUrl: string;
  durationSec: number | null;
  clips: unknown;
  transcript: unknown;
  project: {
    videoStyle: string | null;
    videoMusicUrl: string | null;
    videoTerms: string | null;
    videoEstiloEscolha: unknown;
    colorPalette: string | null;
    niche: string | null;
  };
};

type Familia = ReturnType<typeof familiaDaLinguagem>;

export type ContextoDoCorte = {
  alvo: "corte";
  video: VideoLido;
  indice: number;
  t: TrechoLido;
  /** A transcrição com os termos do cliente: é nela que os índices de palavra valem. */
  palavras: Word[];
  brutas: Word[];
  bordas: { inicio: number; fim: number };
  manter: Intervalo[];
  plano: PlanoDeMontagem | null;
  fala: Fala | null;
  /** Os intervalos da fala do plano (o que a montagem emendou). */
  manterDoPlano: Intervalo[] | null;
  /** Bordas em que a fala do plano foi feita. */
  bordasDoPlano: { inicio: number; fim: number } | null;
  planoOriginal: PlanoDeMontagem | null;
  montagemDesde: string | null;
  montagemTrabalhando: boolean;
  assetsProntos: AssetGerado[];
  familia: Familia;
  remocoesDoVideo: Remocao[] | null;
};

export type ContextoDoCompleto = {
  alvo: "completo";
  video: VideoLido;
  m: (MontagemDoCompleto & { planoOriginal?: PlanoDeMontagem | null }) | null;
  plano: PlanoDeMontagem | null;
  fala: Fala | null;
  planoOriginal: PlanoDeMontagem | null;
  montagemDesde: string | null;
  montagemTrabalhando: boolean;
  assetsProntos: AssetGerado[];
  familia: Familia;
};

type Contexto = ContextoDoCorte | ContextoDoCompleto;

/** Uma mudança de cena já conferida (índice que existe no plano de hoje). */
export type OpDeCena =
  | { acao: "remover" | "restaurar"; cena: number }
  | { acao: "editar"; cena: number; texto: string }
  | { acao: "sem-efeito"; de: number; ate: number };

/** O que espera o "sim" do cliente, guardado no card. Só operações, nunca o plano inteiro (o do completo tem centenas de cenas e o card vai inteiro para a tela). */
export type AjustePendente = {
  alvo: "corte" | "completo";
  videoJobId: string;
  trecho: number | null;
  /** O `desde` da montagem quando o custo foi calculado: se mudou, a conta é outra. */
  baseDesde: string | null;
  fase: "ideia" | "gerar";
  ops: OpDeCena[];
  novaIdeia?: { cena: number; texto?: string | null; plano?: PlanoDeMontagem | null; prefixo?: string } | null;
  creditos: number;
  resumo: string;
  criadoEm: string;
};

export type ResultadoDoAjuste =
  | { tratado: false }
  | { tratado: true; resposta: string; aviso: string; refazendoCorte?: boolean };

export type OpcoesDoAjuste = {
  /** Troca o envio ao worker (prova sem worker de verdade). */
  enviarRecorte?: typeof enviarRecorteDoTrecho;
};

const agora = () => new Date().toISOString();
const DURACAO_MINIMA_DO_CORTE = 10;
/** Pedido pendente mais velho que isto não vale mais: o cliente já seguiu em frente. */
const PENDENTE_VALE_MS = 60 * 60_000;
const TRABALHANDO_NO_COMPLETO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"];

export class Recusa extends Error {}

// ─────────────────────────────── números em português ───────────────────────────────

/** "0:06", "1:12". Um décimo quando o corte é curto e o segundo exato importa. */
function tempo(s: number, decimo = false): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  const seg = v - m * 60;
  const txt = decimo ? seg.toFixed(1).replace(".", ",") : String(Math.floor(seg));
  const [inteiro, resto] = txt.split(",");
  return `${m}:${inteiro.padStart(2, "0")}${resto ? `,${resto}` : ""}`;
}

function creditosPorExtenso(n: number): string {
  return `${n} ${n === 1 ? "crédito" : "créditos"}`;
}

const aspas = (t: string) => `“${t}”`;

function trechoDeFala(palavras: string[], max = 8): string {
  if (palavras.length <= max) return palavras.join(" ");
  return `${palavras.slice(0, Math.ceil(max / 2)).join(" ")} ... ${palavras.slice(-Math.floor(max / 2)).join(" ")}`;
}

// ─────────────────────────────── leitura ───────────────────────────────

export async function lerVideo(videoJobId: string, userId: string): Promise<VideoLido | null> {
  return (await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: projetoVisivel(userId) },
    select: {
      id: true,
      projectId: true,
      userId: true,
      blobUrl: true,
      durationSec: true,
      clips: true,
      transcript: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true, niche: true } },
    },
  })) as VideoLido | null;
}

/** O estado da montagem do completo (coluna fora do schema do Prisma: SQL cru, como em montagem-do-completo.ts). */
async function lerCompletoMontagem(videoJobId: string): Promise<(MontagemDoCompleto & { planoOriginal?: PlanoDeMontagem | null }) | null> {
  const linhas = await prisma.$queryRaw<Array<{ m: MontagemDoCompleto | null }>>`
    SELECT "completoMontagem" AS m FROM video_jobs WHERE id = ${videoJobId}`;
  return linhas[0]?.m ?? null;
}

function familiaDoVideo(v: VideoLido): Familia {
  return familiaDaLinguagem(normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle).estiloId);
}

const iguais = (a: Intervalo[], b: Intervalo[]) =>
  a.length === b.length && a.every((m, i) => Math.abs(m.de - b[i].de) < 0.02 && Math.abs(m.ate - b[i].ate) < 0.02);

function semFala(p: PlanoDeMontagem & { fala?: unknown }): PlanoDeMontagem {
  const { formato, resumo, legenda, assets, cenas } = p;
  return { formato, resumo, legenda, assets, cenas };
}

/**
 * `base`: "no-ar" parte do que o cliente está vendo (a montagem pronta); é o
 * chat. "rascunho" parte do que o cliente já mexeu na reedição e ainda não
 * mandou refazer (`clips[i].rascunho` e o roteiro do corte); é a tela de
 * roteiro reaberta (lib/media/reedicao.ts).
 */
export async function contextoDoCorte(video: VideoLido, indice: number, base: "no-ar" | "rascunho" = "no-ar"): Promise<ContextoDoCorte> {
  const trechos = (video.clips as TrechoLido[] | null) ?? [];
  const lido = trechos[indice];
  if (!lido || typeof lido !== "object") throw new Recusa("Não achei este corte no vídeo. Recarregue a página.");
  const rascunho = base === "rascunho" ? lido.rascunho ?? null : null;
  const t: TrechoLido = rascunho
    ? { ...lido, inicio: rascunho.inicio, fim: rascunho.fim, emPausa: rascunho.emPausa, remocoesDoCliente: rascunho.remocoesDoCliente ?? lido.remocoesDoCliente }
    : lido;
  const brutas = ((video.transcript as { words?: Word[] } | null)?.words ?? []) as Word[];
  if (!brutas.length) throw new Recusa("Este vídeo não tem a transcrição guardada, então não consigo achar as palavras dele.");
  const palavras = aplicarTermos(brutas, parseTermos(video.project.videoTerms));
  const bordas = bordasDoCorte(t, palavras);

  // O plano que está NO AR: o da montagem pronta; sem ela, o aprovado no roteiro.
  const pm = t.montagem?.plano;
  let plano: PlanoDeMontagem | null = null;
  let fala: Fala | null = null;
  let manterDoPlano: Intervalo[] | null = null;
  let bordasDoPlano: { inicio: number; fim: number } | null = null;
  const doRoteiro = base === "rascunho" && Boolean(t.roteiro?.plano && t.roteiro.fala?.palavras?.length);
  if (!doRoteiro && pm?.cenas?.length && pm.fala?.palavras?.length) {
    plano = semFala(pm);
    fala = { palavras: pm.fala.palavras, duracao: pm.fala.duracao };
    manterDoPlano = pm.fala.manter;
    // A montagem fez a fala com as bordas do corte daquele momento (as da
    // edição gravada quando ela bate com a fala, senão as de agora).
    const bruto = bordasDoCorte(t, brutas);
    bordasDoPlano = t.edicao && iguais(t.edicao.manter ?? [], pm.fala.manter) ? { inicio: t.edicao.inicio, fim: t.edicao.fim } : bruto;
  } else if (t.roteiro?.plano && t.roteiro.fala?.palavras?.length) {
    plano = t.roteiro.plano;
    fala = t.roteiro.fala;
    manterDoPlano = t.roteiro.manter;
    bordasDoPlano = { inicio: t.roteiro.inicio, fim: t.roteiro.fim };
  }

  // Os intervalos que estão no ar hoje.
  const e = t.edicao;
  const manter = doRoteiro
    ? t.roteiro!.manter
    : e && Math.abs(e.inicio - bordas.inicio) < 0.01 && Math.abs(e.fim - bordas.fim) < 0.01 && e.manter?.length
      ? e.manter
      : t.roteiro && Math.abs(t.roteiro.inicio - bordas.inicio) < 0.01 && t.roteiro.manter?.length
        ? t.roteiro.manter
        : manterDoPlano ?? [{ de: 0, ate: bordas.fim - bordas.inicio }];

  const roteiroDoVideo = await prisma.$queryRaw<Array<{ r: RoteiroDoVideo | null }>>`
    SELECT "completoMontagem" -> 'roteiro' AS r FROM video_jobs WHERE id = ${video.id}`;
  const r = roteiroDoVideo[0]?.r;
  const m = t.montagem ?? null;
  return {
    alvo: "corte",
    video,
    indice,
    t,
    palavras,
    brutas,
    bordas,
    manter,
    plano,
    fala,
    manterDoPlano,
    bordasDoPlano,
    planoOriginal: t.roteiro?.planoOriginal ?? null,
    montagemDesde: m?.desde ?? null,
    montagemTrabalhando: Boolean(lerMontagem(m)?.trabalhando),
    assetsProntos: ((m?.assets as AssetGerado[] | undefined) ?? []).filter((a) => a.url),
    familia: familiaDoVideo(video),
    remocoesDoVideo: r?.limpezaFeita ? r.remocoes.map((x) => ({ de: x.de, ate: x.ate, motivo: x.motivo ?? "roteiro" })) : null,
  };
}

export async function contextoDoCompleto(video: VideoLido): Promise<ContextoDoCompleto> {
  const m = await lerCompletoMontagem(video.id);
  const plano = m?.plano?.cenas?.length ? m.plano : null;
  const fala = m?.fala?.palavras?.length ? m.fala : null;
  const idade = m?.desde ? Date.now() - new Date(m.desde).getTime() : Infinity;
  return {
    alvo: "completo",
    video,
    m,
    plano,
    fala,
    planoOriginal: m?.planoOriginal ?? null,
    montagemDesde: m?.desde ?? null,
    montagemTrabalhando: Boolean(m && TRABALHANDO_NO_COMPLETO.includes(m.estado) && idade < 3 * 3600_000),
    assetsProntos: (m?.assets ?? []).filter((a) => a.url),
    familia: familiaDoVideo(video),
  };
}

// ─────────────────────────────── puro: fala e plano ───────────────────────────────

/**
 * Os índices (na transcrição com termos) das palavras da fala de um corte, na
 * MESMA ordem e com as MESMAS regras de `falaDoCorte` (montagem-nos-cortes.ts):
 * é o que liga a palavra 12 do corte à palavra 4.310 da gravação.
 */
export function indicesDaFala(palavras: Word[], inicio: number, fim: number, manter: Intervalo[]): number[] {
  const saida: number[] = [];
  palavras.forEach((w, i) => {
    if (w.start < inicio || w.start > fim) return;
    if (noTempoDoCorte(w.start, inicio, manter) === null) return;
    saida.push(i);
  });
  return saida;
}

/**
 * O plano levado para a fala nova do corte (re-corte pedido pelo chat), pela
 * palavra da gravação e não pela posição: a cena que falava de "Jetro" continua
 * em "Jetro" mesmo com o começo do corte mais para trás. Cena cuja fala saiu
 * inteira sai junto; a primeira cena cobre as palavras novas do começo e a
 * última, as do fim. `mapa[i]` é o índice na fala nova da palavra i da antiga,
 * ou null se ela saiu.
 */
export function levarPlanoParaFalaNova(plano: PlanoDeMontagem, mapa: Array<number | null>, total: number): PlanoDeMontagem {
  if (!total) return plano;
  const perto = (i: number) => {
    for (let k = Math.max(0, i); k < mapa.length; k++) if (mapa[k] !== null) return mapa[k] as number;
    for (let k = Math.min(mapa.length - 1, i - 1); k >= 0; k--) if (mapa[k] !== null) return mapa[k] as number;
    return 0;
  };
  let cenas: CenaDoPlano[] = [];
  for (const c of plano.cenas) {
    const novos: number[] = [];
    for (let k = c.de; k <= c.ate; k++) if (mapa[k] !== null && mapa[k] !== undefined) novos.push(mapa[k] as number);
    if (!novos.length) continue;
    const de = Math.min(...novos);
    const ate = Math.max(...novos);
    const dentro = (i: number) => Math.min(ate, Math.max(de, perto(i)));
    cenas.push({
      ...c,
      de,
      ate,
      movimentoNa: typeof c.movimentoNa === "number" ? dentro(c.movimentoNa) : undefined,
      elementos: c.elementos.map((e) => ({ ...e, palavra: dentro(e.palavra) })) as CenaDoPlano["elementos"],
    });
  }
  if (!cenas.length) {
    cenas = [{ de: 0, ate: total - 1, layout: "narrador-cheio", movimento: "estatico", transicao: "corte", fundo: "papel", elementos: [], motivo: "fala refeita pelo cliente" }];
  }
  cenas.sort((a, b) => a.de - b.de);
  cenas[0].de = 0;
  for (let i = 1; i < cenas.length; i++) cenas[i].de = Math.max(cenas[i].de, cenas[i - 1].de + 1);
  for (let i = 0; i < cenas.length - 1; i++) cenas[i].ate = cenas[i + 1].de - 1;
  cenas[cenas.length - 1].ate = total - 1;
  cenas = cenas.filter((c) => c.de <= c.ate && c.de <= total - 1);
  const assets = plano.assets.map((a) => (typeof a.ancora === "number" ? { ...a, ancora: perto(a.ancora) } : a));
  return semAssetsSoltos({ ...plano, cenas, assets });
}

/** A cena em que cai o segundo `s` do vídeo (tempo no ar). */
function cenaNoTempo(plano: PlanoDeMontagem, fala: Fala, s: number): number {
  for (let k = 0; k < plano.cenas.length; k++) {
    const { inicio, fim } = tempoDaCena(plano.cenas[k], fala.palavras, fala.duracao);
    if (s >= inicio - 0.05 && s < fim) return k;
  }
  return s >= fala.duracao - 0.5 ? plano.cenas.length - 1 : -1;
}

/** Parte uma cena na palavra `p` (primeira palavra da segunda parte). Os elementos ficam na parte em que caem. */
function partirCena(plano: PlanoDeMontagem, k: number, p: number): PlanoDeMontagem {
  const c = plano.cenas[k];
  if (!c || p <= c.de || p > c.ate) return plano;
  const a: CenaDoPlano = {
    ...c,
    ate: p - 1,
    elementos: c.elementos.filter((e) => e.palavra < p),
    movimentoNa: typeof c.movimentoNa === "number" && c.movimentoNa < p ? c.movimentoNa : undefined,
  };
  const b: CenaDoPlano = {
    ...c,
    de: p,
    transicao: "corte",
    elementos: c.elementos.filter((e) => e.palavra >= p),
    movimentoNa: typeof c.movimentoNa === "number" && c.movimentoNa >= p ? c.movimentoNa : undefined,
  };
  const cenas = [...plano.cenas];
  cenas.splice(k, 1, a, b);
  return { ...plano, cenas };
}

/** "Sem efeito de X a Y segundos": parte as cenas nas bordas e tira o efeito (e o movimento) do que fica dentro. */
export function semEfeitoNoIntervalo(plano: PlanoDeMontagem, fala: Fala, de: number, ate: number): { plano: PlanoDeMontagem; mudou: number } {
  const primeiraEm = (s: number) => {
    const i = fala.palavras.findIndex((w) => w.inicio >= s - 0.05);
    return i < 0 ? fala.palavras.length : i;
  };
  const pDe = primeiraEm(de);
  const pAte = primeiraEm(ate);
  if (pAte <= pDe) return { plano, mudou: 0 };
  let p = plano;
  for (const borda of [pDe, pAte]) {
    const k = p.cenas.findIndex((c) => borda > c.de && borda <= c.ate);
    if (k >= 0) p = partirCena(p, k, borda);
  }
  let mudou = 0;
  for (let k = 0; k < p.cenas.length; k++) {
    const c = p.cenas[k];
    if (c.de >= pDe && c.ate < pAte && (cenaTemEfeito(c) || c.movimento !== "estatico")) {
      p = removerEfeito(p, k);
      mudou++;
    }
  }
  return { plano: semAssetsSoltos(p), mudou };
}

/**
 * Aplica as mudanças de cena. As que apontam cena por índice vão da última
 * para a primeira (restaurar pode juntar cenas e mudaria os índices seguintes);
 * as de intervalo de tempo vêm depois, porque não dependem de índice.
 */
export function aplicarOps(
  plano: PlanoDeMontagem,
  fala: Fala,
  ops: OpDeCena[],
  original: PlanoDeMontagem | null,
  novaIdeia?: { cena: number; plano: PlanoDeMontagem; prefixo: string } | null
): PlanoDeMontagem {
  let p = plano;
  const porIndice = [
    ...ops.filter((o): o is Exclude<OpDeCena, { acao: "sem-efeito" }> => o.acao !== "sem-efeito").map((o) => ({ k: o.cena, o, ideia: false as const })),
    ...(novaIdeia ? [{ k: novaIdeia.cena, o: null, ideia: true as const }] : []),
  ].sort((a, b) => b.k - a.k);
  for (const x of porIndice) {
    if (x.ideia) p = trocarCena(p, x.k, novaIdeia!.plano, novaIdeia!.prefixo);
    else if (x.o!.acao === "remover") p = removerEfeito(p, x.k);
    else if (x.o!.acao === "editar") p = editarIdeia(p, x.k, (x.o as { texto: string }).texto);
    else if (original) p = restaurarCena(p, x.k, original);
  }
  for (const o of ops) if (o.acao === "sem-efeito") p = semEfeitoNoIntervalo(p, fala, o.de, o.ate).plano;
  return p;
}

/**
 * O que o plano novo manda GERAR: asset que não existia pronto com o mesmo
 * tipo e a mesma descrição. O recorte da colagem com descrição do catálogo do
 * projeto sai de graça (o mesmo atalho de `gerarAssetsDaMontagem`).
 */
export function assetsNovos(
  novo: PlanoDeMontagem,
  base: PlanoDeMontagem,
  prontos: AssetGerado[],
  catalogo: Set<string> = new Set()
): { imagens: number; cenas: number; cenarios: number; descricoes: string[] } {
  const chave = (a: { tipo: string; descricao: string }) => `${a.tipo}|${a.descricao.trim().toLowerCase()}`;
  const comUrl = new Set(prontos.filter((g) => g.url).map((g) => g.id));
  const feitos = new Set(base.assets.filter((a) => comUrl.has(a.id)).map(chave));
  const novos = novo.assets.filter(
    (a) => a.tipo !== "icone" && !feitos.has(chave(a)) && !(a.tipo === "elemento" && catalogo.has(a.descricao.trim().toLowerCase()))
  );
  return {
    imagens: novos.filter((a) => !ASSETS_EM_VIDEO.includes(a.tipo)).length,
    cenas: novos.filter((a) => a.tipo === "cena-em-movimento").length,
    cenarios: novos.filter((a) => a.tipo === "cena-do-narrador").length,
    descricoes: novos.map((a) => a.resumo ?? a.descricao),
  };
}

export function creditosDosAssets(n: { imagens: number; cenas: number; cenarios: number }): number {
  return n.imagens * CREDITOS_POR_IMAGEM_NO_AJUSTE + n.cenas * CREDITOS_POR_CENA_NO_AJUSTE + n.cenarios * CREDITOS_POR_CENARIO_NO_AJUSTE;
}

export function oQueGera(n: { imagens: number; cenas: number; cenarios: number }): string {
  const partes: string[] = [];
  if (n.imagens) partes.push(`${n.imagens} ${n.imagens === 1 ? "imagem nova" : "imagens novas"}`);
  if (n.cenas) partes.push(`${n.cenas} ${n.cenas === 1 ? "cena de cinema nova (vídeo gerado por IA)" : "cenas de cinema novas (vídeo gerado por IA)"}`);
  if (n.cenarios) partes.push(`${n.cenarios === 1 ? "a sua sala recriada em vídeo" : `${n.cenarios} cenários recriados em vídeo`}`);
  return partes.join(" e ");
}

// ─────────────────────────────── o classificador ───────────────────────────────

type Entendido = {
  entendi?: string;
  pergunta?: string | null;
  comecarNaPalavra?: number | null;
  terminarNaPalavra?: number | null;
  tirar?: Array<{ de: number; ate: number }>;
  cenas?: Array<{ cena?: number | null; em?: number | null; acao?: string; texto?: string }>;
  semEfeito?: { de: number; ate: number } | null;
  capa?: string | null;
  textoDoPost?: boolean;
};

const SISTEMA = (alvo: "corte" | "completo") => `Você é o Vitor, editor de vídeo da Demandou. O cliente escreveu no chat do card de ${alvo === "corte" ? "um CORTE (vídeo curto vertical)" : "um VÍDEO COMPLETO (o vídeo longo)"}. Transforme o pedido em ações. Responda APENAS um JSON, sem nada fora dele:
{"entendi":"...","pergunta":null,"comecarNaPalavra":null,"terminarNaPalavra":null,"tirar":[],"cenas":[],"semEfeito":null,"capa":null,"textoDoPost":false}

${alvo === "corte" ? `- comecarNaPalavra / terminarNaPalavra: índice (da lista FALA) da PRIMEIRA palavra que deve ficar no corte / da ÚLTIMA palavra que deve ficar. "Termine depois de 'ferramentas'" põe o índice de "ferramentas" em terminarNaPalavra. "Comece em 'Jesus entrou'" põe o índice de "Jesus" em comecarNaPalavra. Pedido em segundos usa a coluna de tempo no ar: "corta os 3 primeiros segundos" é a primeira palavra que começa depois de 0:03; "termina 2 s antes" é a última palavra que termina 2 s antes do fim; "encerra no segundo 37" é a última palavra que termina até 0:37. A palavra pode estar ANTES ou DEPOIS do corte atual quando o cliente quer esticar. Deixe null o que não muda.
- tirar: trechos do MEIO a tirar, [{"de":índice,"ate":índice}], inclusive, com palavras que hoje estão no ar. "Tira a parte em que eu erro e repito": ache a frase errada ou repetida e marque a versão que sai (fica a última versão boa). "Corta de 'né' até 'então'": de = "né" e ate = a palavra ANTES de "então" (a frase volta em "então"), a não ser que o cliente diga que "então" também sai.
` : `- No vídeo completo não dá para mudar onde começa e termina nem tirar trecho da fala pelo chat: se o cliente pedir isso, responda com "pergunta" explicando em uma frase que pelo chat do completo dá para mudar cenas e efeitos, e pergunte se ele quer isso.
`}- cenas: mudanças em cenas da lista CENAS: [{"cena":número ou null,"em":segundo do vídeo ou null,"acao":"remover"|"editar"|"nova-ideia"|"restaurar","texto":"..."}]. "remover" tira o efeito da cena (fica a pessoa em tela cheia, sem nada por cima). "editar" troca o que aparece na cena pelo "texto": escreva em português, concreto, o que deve aparecer (ex.: "um barco a vela no mar"). "nova-ideia" pede outra ideia ao diretor ("texto" = o que o cliente quer, se disse). "restaurar" volta a cena como era antes do ajuste. Use "cena" quando souber o número; use "em" (segundos) quando o cliente citar um momento e nenhuma cena da lista estiver nele. "Tira a imagem do Moisés": todas as cenas cuja descrição mostra Moisés.
- semEfeito: {"de":segundos,"ate":segundos} quando o cliente pede um intervalo sem efeito ("sem efeito nos primeiros 10 segundos" = {"de":0,"ate":10}).
- capa: o pedido resumido, se for sobre a CAPA (a miniatura).
- textoDoPost: true se o pedido é sobre o TEXTO do post (legenda do post, título, descrição, tom, hashtags) e não sobre o vídeo.
- pergunta: se o pedido é ambíguo ou não dá para achar na lista (qual cena? qual das duas vezes que a palavra aparece? trocar por o quê?), escreva UMA pergunta curta e simples para o cliente e deixe o resto vazio. Nunca chute. Nunca use travessão.
- entendi: uma frase curta, em português simples, do que vai ser feito.`;

function linhasDaFala(ctx: ContextoDoCorte): string {
  const { palavras, bordas, manter } = ctx;
  const linhas: string[] = [];
  palavras.forEach((w, i) => {
    if (w.end < bordas.inicio - 12 || w.start > bordas.fim + 12) return;
    let rotulo: string;
    if (w.start < bordas.inicio - 0.02) rotulo = "antes do corte";
    else if (w.start > bordas.fim) rotulo = "depois do corte";
    else {
      const t = noTempoDoCorte(w.start, bordas.inicio, manter) ?? noTempoDoCorte((w.start + w.end) / 2, bordas.inicio, manter);
      rotulo = t === null ? "cortada na limpeza" : `no ar em ${tempo(t, true)}`;
    }
    linhas.push(`${i} | ${rotulo} | ${w.word}`);
  });
  return linhas.join("\n");
}

function linhasDasCenas(plano: PlanoDeMontagem, fala: Fala, familia: Familia, original: PlanoDeMontagem | null, soComEfeito: boolean): string {
  const linhas: string[] = [];
  plano.cenas.forEach((c, k) => {
    if (soComEfeito && !cenaTemEfeito(c) && !c.ajuste) return;
    const n = cenaNaTela(plano, k, fala, familia, original);
    const falaDaCena = n.fala.length > 140 ? `${n.fala.slice(0, 140)}...` : n.fala;
    linhas.push(`cena ${k}: ${tempo(n.inicio)} a ${tempo(n.fim)} | ${n.efeito ? "com efeito" : "sem efeito"} | na tela: ${n.descricao}${n.ajuste ? ` (ajustada: ${n.ajuste})` : ""} | fala: "${falaDaCena}"`);
  });
  return linhas.join("\n");
}

async function entender(ctx: Contexto, mensagem: string, historico: Array<{ role: string; content: string }>): Promise<Entendido> {
  const partes: string[] = [];
  if (ctx.alvo === "corte") {
    partes.push(`O corte hoje tem ${tempo(ctx.fala?.duracao ?? ctx.bordas.fim - ctx.bordas.inicio)} no ar.`);
    partes.push(`FALA (índice | onde está | palavra), com 12 s de folga antes e depois do corte:\n${linhasDaFala(ctx)}`);
  } else {
    partes.push(`O vídeo completo tem ${tempo(ctx.fala?.duracao ?? ctx.video.durationSec ?? 0)} no ar. Só as cenas com efeito aparecem na lista; o resto é a pessoa em tela cheia.`);
  }
  if (ctx.plano && ctx.fala) {
    partes.push(`CENAS da edição (tempo no ar):\n${linhasDasCenas(ctx.plano, ctx.fala, ctx.familia, ctx.planoOriginal, ctx.alvo === "completo")}`);
  } else {
    partes.push("CENAS: este vídeo saiu sem a edição de efeitos, então não há cenas para mudar.");
  }
  const recentes = historico.slice(-4).map((m) => `${m.role === "user" ? "Cliente" : "Vitor"}: ${m.content.slice(0, 300)}`);
  if (recentes.length) partes.push(`CONVERSA ANTERIOR (para entender respostas curtas):\n${recentes.join("\n")}`);
  partes.push(`PEDIDO DO CLIENTE: ${mensagem}`);
  const bruto = await askClaude(SISTEMA(ctx.alvo), partes.join("\n\n"), {
    maxTokens: 6000,
    effort: "low",
    timeoutMs: 90_000,
    usage: { operation: "video_ajuste_chat", projectId: ctx.video.projectId },
  });
  try {
    return JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Entendido;
  } catch {
    return { pergunta: "Não entendi bem o que mudar no vídeo. Pode me dizer de outro jeito? Por exemplo: termine depois da palavra tal, ou tire a imagem da cena de 0:12." };
  }
}

// ─────────────────────────────── gravar ───────────────────────────────

/** Funde campos num trecho, direto no jsonb (as outras rotas escrevem em `clips` ao mesmo tempo). */
export async function fundirNoTrecho(videoJobId: string, indice: number, campos: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(campos);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(clips, ARRAY[${String(indice)}]::text[], (clips -> ${indice}::int) || ${json}::jsonb)
    WHERE id = ${videoJobId} AND jsonb_typeof(clips -> ${indice}::int) = 'object'`;
}

async function guardarPendente(cardId: string, p: AjustePendente | null): Promise<void> {
  if (p) {
    const json = JSON.stringify(p);
    await prisma.$executeRaw`
      UPDATE campaign_cards SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ajustePendente', ${json}::jsonb) WHERE id = ${cardId}`;
  } else {
    await prisma.$executeRaw`UPDATE campaign_cards SET metadata = COALESCE(metadata, '{}'::jsonb) - 'ajustePendente' WHERE id = ${cardId}`;
  }
}

/** O card do corte mostra "o squad está fazendo" logo no pedido, sem esperar o worker devolver o corte. */
async function marcarCardsDoCorte(videoJobId: string, indice: number): Promise<void> {
  const json = JSON.stringify({ estado: "na-fila", desde: agora(), motivo: null });
  await prisma.$executeRaw`
    UPDATE campaign_cards
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('montagem', ${json}::jsonb)
    WHERE "agentId" = 'vitor-video' AND metadata ->> 'videoJobId' = ${videoJobId} AND metadata ->> 'trechoIndice' = ${String(indice)}`;
}

// ─────────────────────────────── cobrar ───────────────────────────────

async function saldoParaMostrar(userId: string): Promise<string> {
  // O saldo da CONTA que paga (01/10, acesso de equipe).
  const u = await prisma.user.findUnique({ where: { id: await contaDoPlano(userId) }, select: { creditsBalance: true, role: true } });
  if (u?.role === "admin") return "Acesso interno: fica no extrato e não sai do saldo.";
  return `Seu saldo: ${creditosPorExtenso(u?.creditsBalance ?? 0)}.`;
}

export async function cobrar(ctx: Contexto, userId: string, quantidade: number, operation: string, nota: string): Promise<void> {
  if (quantidade <= 0) return;
  await debitar({
    userId,
    quantidade,
    operation,
    projectId: ctx.video.projectId,
    refId: `${ctx.video.id}:${ctx.alvo}:${ctx.alvo === "corte" ? ctx.indice : "c"}:${Date.now()}`,
    note: nota.slice(0, 180),
  });
}

// ─────────────────────────────── tempo que leva ───────────────────────────────

function prazoDaMontagem(ctx: Contexto, geraCenaDeCinema: boolean): string {
  if (ctx.alvo === "corte") return geraCenaDeCinema ? "uns 10 a 20 minutos (a cena de cinema leva alguns minutos para sair)" : "uns 5 a 10 minutos";
  // O render do completo de 22 min levou ~35 min (montagem-do-completo.ts).
  const min = Math.max(10, Math.round(((ctx.fala?.duracao ?? ctx.video.durationSec ?? 600) / 60) * 1.6));
  return `uns ${min} a ${min + 15} minutos`;
}

// ─────────────────────────────── entrada ───────────────────────────────

/**
 * "Sim" só quando a mensagem inteira é de concordância ("sim", "pode gerar",
 * "ok, pode seguir"). "Pode tirar a imagem do Moisés" começa com "pode" e é
 * um pedido novo: por isso toda palavra precisa estar na lista, e não só a
 * primeira.
 */
const PALAVRAS_DE_SIM = new Set(["sim", "s", "pode", "ok", "okay", "confirmo", "confirmado", "manda", "ver", "bora", "vai", "gera", "gere", "gerar", "faz", "faca", "fazer", "quero", "claro", "isso", "fechado", "seguir", "segue", "por", "favor", "obrigado", "obrigada", "beleza", "perfeito", "certo", "top", "pfv", "pf"]);
const COMECO_DE_SIM = new Set(["sim", "s", "pode", "ok", "okay", "confirmo", "confirmado", "manda", "bora", "vai", "gera", "gere", "faz", "faca", "quero", "claro", "isso", "fechado", "beleza", "perfeito", "certo", "top"]);
export function ehSim(mensagem: string): boolean {
  const palavras = mensagem.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return palavras.length > 0 && palavras.length <= 6 && COMECO_DE_SIM.has(palavras[0]) && palavras.every((p) => PALAVRAS_DE_SIM.has(p));
}
const EH_NAO = /^\s*(n[aã]o|cancela|cancelar|deixa|esquece|melhor n[aã]o)\b/i;

/**
 * O chat do card de vídeo (corte ou completo). `tratado: false` quando o
 * pedido é sobre o TEXTO do post: a rota segue o caminho de edição de texto.
 */
export async function ajustarVideoPeloChat(
  args: {
    card: { id: string; metadata: unknown; chatHistory: unknown };
    userId: string;
    mensagem: string;
  },
  opcoes: OpcoesDoAjuste = {}
): Promise<ResultadoDoAjuste> {
  const meta = (args.card.metadata ?? {}) as { videoJobId?: string; trechoIndice?: number; completo?: boolean; ajustePendente?: AjustePendente | null };
  const videoJobId = meta.videoJobId;
  if (!videoJobId) return { tratado: false };
  const alvo: "corte" | "completo" | null = typeof meta.trechoIndice === "number" ? "corte" : meta.completo === true ? "completo" : null;
  if (!alvo) return { tratado: false };
  const historico = Array.isArray(args.card.chatHistory) ? (args.card.chatHistory as Array<{ role: string; content: string }>) : [];

  try {
    const video = await lerVideo(videoJobId, args.userId);
    if (!video) throw new Recusa("Não achei o vídeo deste card.");
    const ctx = alvo === "corte" ? await contextoDoCorte(video, meta.trechoIndice!) : await contextoDoCompleto(video);

    // 1. Resposta a um pedido que esperava o "sim".
    const pendente = meta.ajustePendente ?? null;
    const curta = args.mensagem.trim().length <= 60;
    if (pendente && curta && EH_NAO.test(args.mensagem)) {
      await guardarPendente(args.card.id, null);
      // A ideia do diretor já foi paga no sim anterior: dizer "nada foi
      // cobrado" aqui seria mentira no extrato do cliente.
      const ideiaPaga = pendente.fase === "gerar" && Boolean(pendente.novaIdeia?.plano);
      return {
        tratado: true,
        resposta: ideiaPaga
          ? `Tudo bem, não gerei as imagens e o vídeo continua como está. Os ${creditosPorExtenso(CREDITOS_POR_NOVA_IDEIA)} da ideia do diretor já tinham sido usados.`
          : "Tudo bem, não gerei nada e nada foi cobrado. O vídeo continua como está.",
        aviso: "Pedido cancelado",
      };
    }
    if (pendente && curta && ehSim(args.mensagem)) {
      await guardarPendente(args.card.id, null);
      const velho = Date.now() - new Date(pendente.criadoEm).getTime() > PENDENTE_VALE_MS;
      if (velho || pendente.baseDesde !== ctx.montagemDesde) {
        return {
          tratado: true,
          resposta: "O vídeo mudou desde que eu calculei o custo (ou já passou muito tempo), então não gerei nada. Me peça o ajuste de novo que eu refaço a conta.",
          aviso: "Peça de novo",
        };
      }
      return await executarPendente(ctx, pendente, args.userId, args.card.id);
    }
    // Qualquer outra mensagem troca de assunto: o pedido anterior não vale mais.
    if (pendente) await guardarPendente(args.card.id, null);

    if (ctx.montagemTrabalhando) {
      return {
        tratado: true,
        resposta: "O squad ainda está montando a edição deste vídeo. Assim que ficar pronta (o card avisa), me peça o ajuste que eu faço em cima dela.",
        aviso: "O squad está fazendo",
      };
    }

    // 2. O pedido novo.
    const e = await entender(ctx, args.mensagem, historico);
    if (e.pergunta && e.pergunta.trim()) return { tratado: true, resposta: e.pergunta.trim(), aviso: "O Vitor tem uma pergunta" };

    const temCorte = ctx.alvo === "corte" && (typeof e.comecarNaPalavra === "number" || typeof e.terminarNaPalavra === "number" || (e.tirar?.length ?? 0) > 0);
    const temCena = (e.cenas?.length ?? 0) > 0 || Boolean(e.semEfeito);
    if (!temCorte && !temCena) {
      if (e.capa && ctx.alvo === "corte") {
        await refazerCapa(video.id, args.userId, ctx.indice, e.capa);
        return { tratado: true, resposta: "Capa refeita com o seu ajuste. Recarregue o card para ver como ficou.", aviso: "Capa refeita" };
      }
      if (e.capa) {
        return { tratado: true, resposta: "A capa do vídeo completo ainda não muda pelo chat. Pelo chat do completo eu mudo as cenas e os efeitos.", aviso: "Ainda não dá" };
      }
      if (e.textoDoPost) return { tratado: false };
      return {
        tratado: true,
        resposta:
          "Não achei o que mudar no vídeo com esse pedido. Você pode me pedir, por exemplo: termine depois da palavra tal, tire a parte em que eu repito, tire a imagem da cena de 0:12, troque a cena dos 0:06 por um barco, ou sem efeito nos primeiros 10 segundos.",
        aviso: "O Vitor tem uma pergunta",
      };
    }

    // 3. As cenas, conferidas.
    const conferido = conferirCenas(ctx, e);
    if ("pergunta" in conferido) return { tratado: true, resposta: conferido.pergunta, aviso: "O Vitor tem uma pergunta" };
    const { ops, novaIdeia } = conferido;

    if (temCorte && ctx.alvo === "corte") {
      if (novaIdeia) {
        return {
          tratado: true,
          resposta: "Vamos por partes: primeiro eu ajusto o corte e, quando ele voltar, você me pede a outra ideia para a cena. Me mande só a parte do corte agora.",
          aviso: "O Vitor tem uma pergunta",
        };
      }
      return await recortar(ctx, e, ops, args.card.id, opcoes);
    }

    // 4. Só cenas.
    if (!ctx.plano || !ctx.fala) {
      return {
        tratado: true,
        resposta: "Este vídeo saiu sem a edição de efeitos, então não tem cena para mudar. O que dá para ajustar aqui é onde ele começa e termina e tirar trechos da fala.",
        aviso: "Ainda não dá",
      };
    }
    // Com a trava da montagem desligada, o estado "na-fila" nunca andaria e o
    // card ficaria "o squad está fazendo" para sempre.
    if (ctx.alvo === "corte" && !montagemNaEdicaoLigada()) {
      return {
        tratado: true,
        resposta: "A edição com efeitos dos cortes não está ligada agora, então eu não consigo refazê-la. O corte continua como está.",
        aviso: "Ainda não dá",
      };
    }
    if (ctx.alvo === "completo" && !(await completoPodeRefazer(ctx))) {
      return {
        tratado: true,
        resposta: "A edição com efeitos do vídeo completo não está ligada agora, então eu não consigo refazê-la. O completo continua como está.",
        aviso: "Ainda não dá",
      };
    }
    if (novaIdeia) {
      const c = ctx.plano.cenas[novaIdeia.cena];
      const { inicio, fim } = tempoDaCena(c, ctx.fala.palavras, ctx.fala.duracao);
      const falaDaCena = trechoDeFala(palavrasDaCena(c, ctx.fala.palavras).split(" "));
      const p: AjustePendente = {
        alvo: ctx.alvo,
        videoJobId: video.id,
        trecho: ctx.alvo === "corte" ? ctx.indice : null,
        baseDesde: ctx.montagemDesde,
        fase: "ideia",
        ops,
        novaIdeia: { cena: novaIdeia.cena, texto: novaIdeia.texto },
        creditos: CREDITOS_POR_NOVA_IDEIA,
        resumo: `outra ideia para a cena de ${tempo(inicio)} a ${tempo(fim)}`,
        criadoEm: agora(),
      };
      await guardarPendente(args.card.id, p);
      return {
        tratado: true,
        resposta:
          `Posso pedir ao diretor outra ideia para a cena de ${tempo(inicio)} a ${tempo(fim)} (${aspas(falaDaCena)}). ` +
          `Custa ${creditosPorExtenso(CREDITOS_POR_NOVA_IDEIA)}, o mesmo do botão da tela de roteiro. ` +
          `Se a ideia nova precisar de imagem ou cena gerada, eu mostro antes quanto custa e peço outro sim. ${await saldoParaMostrar(args.userId)} ` +
          "Responda sim para eu pedir.",
        aviso: "Esperando o seu sim",
      };
    }
    return await mudarCenas(ctx, ops, null, args.userId, args.card.id);
  } catch (e) {
    if (e instanceof Recusa) return { tratado: true, resposta: e.message, aviso: "Não deu" };
    if (e instanceof SaldoInsuficiente) {
      // Membro da equipe (01/10) não compra: a mensagem do débito já diz a quem pedir.
      return { tratado: true, resposta: `Não gerei nada: ${e.message}${e.equipe ? "" : " Você pode comprar mais créditos em Planos e créditos."}`, aviso: "Saldo insuficiente" };
    }
    console.error(`[ajuste-pelo-chat][${videoJobId}]`, e);
    return { tratado: true, resposta: "Não consegui fazer esse ajuste agora. Nada foi cobrado. Tente de novo em um minuto.", aviso: "Não deu" };
  }
}

// ─────────────────────────────── conferir o que o modelo devolveu ───────────────────────────────

function conferirCenas(
  ctx: Contexto,
  e: Entendido
): { ops: OpDeCena[]; novaIdeia: { cena: number; texto: string | null } | null } | { pergunta: string } {
  const ops: OpDeCena[] = [];
  let novaIdeia: { cena: number; texto: string | null } | null = null;
  if (!(e.cenas?.length || e.semEfeito)) return { ops, novaIdeia };
  if (!ctx.plano || !ctx.fala) return { ops, novaIdeia };
  const vistos = new Set<string>();
  for (const c of e.cenas ?? []) {
    let k = typeof c.cena === "number" ? c.cena : -1;
    if ((k < 0 || !ctx.plano.cenas[k]) && typeof c.em === "number") k = cenaNoTempo(ctx.plano, ctx.fala, c.em);
    if (k < 0 || !ctx.plano.cenas[k]) return { pergunta: "Não achei essa cena. Pode me dizer o momento do vídeo (por exemplo, 0:12) ou o que aparece nela?" };
    const acao = c.acao;
    const chave = `${k}:${acao}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (acao === "remover") ops.push({ acao: "remover", cena: k });
    else if (acao === "restaurar") {
      if (!ctx.planoOriginal) return { pergunta: "Esta cena não tem versão anterior guardada para eu voltar. Quer que eu tire o efeito dela, ou que troque por outra coisa?" };
      ops.push({ acao: "restaurar", cena: k });
    } else if (acao === "editar") {
      const texto = (c.texto ?? "").trim();
      if (!texto) return { pergunta: "Trocar por o quê? Me diga o que você quer ver nessa cena." };
      ops.push({ acao: "editar", cena: k, texto });
    } else if (acao === "nova-ideia") {
      if (novaIdeia) return { pergunta: "Uma outra ideia por vez: qual cena você quer mudar primeiro?" };
      novaIdeia = { cena: k, texto: (c.texto ?? "").trim() || null };
    }
  }
  if (e.semEfeito && typeof e.semEfeito.de === "number" && typeof e.semEfeito.ate === "number" && e.semEfeito.ate > e.semEfeito.de) {
    ops.push({ acao: "sem-efeito", de: Math.max(0, e.semEfeito.de), ate: Math.min(ctx.fala.duracao, e.semEfeito.ate) });
  }
  if (novaIdeia && ops.some((o) => o.acao !== "sem-efeito" && o.cena === novaIdeia!.cena)) {
    return { pergunta: "Nessa cena você quer outra ideia do diretor ou quer que eu faça exatamente o que você descreveu?" };
  }
  return { ops, novaIdeia };
}

// ─────────────────────────────── cenas ───────────────────────────────

/** O que cada mudança fez, em português, para a resposta. */
function relatoDasOps(ctx: Contexto, ops: OpDeCena[], novaIdeia: { cena: number } | null): string[] {
  const { plano, fala, familia, planoOriginal } = ctx;
  if (!plano || !fala) return [];
  const saida: string[] = [];
  for (const o of ops) {
    if (o.acao === "sem-efeito") {
      saida.push(`tirei os efeitos de ${tempo(o.de)} a ${tempo(o.ate)}: ali fica você, sem nada por cima`);
      continue;
    }
    const n = cenaNaTela(plano, o.cena, fala, familia, planoOriginal);
    const quando = `a cena de ${tempo(n.inicio)} a ${tempo(n.fim)}`;
    if (o.acao === "remover") saida.push(`tirei o efeito da ${quando.slice(2)} (${resumoDaCena(n.descricao)})`);
    else if (o.acao === "editar") saida.push(`${quando} passa a mostrar ${aspas(o.texto)}`);
    else saida.push(`${quando} voltou a ser como o diretor tinha feito`);
  }
  if (novaIdeia) {
    const n = cenaNaTela(plano, novaIdeia.cena, fala, familia, planoOriginal);
    saida.push(`a cena de ${tempo(n.inicio)} a ${tempo(n.fim)} ganhou a ideia nova do diretor`);
  }
  return saida;
}

/** A descrição da cena encurtada para a resposta: o que aparece, sem a lista inteira de elementos. */
function resumoDaCena(descricao: string): string {
  const principal = descricao.split(", na tela:")[0];
  return principal.length > 90 ? `${principal.slice(0, 87).replace(/[ ,;(]+[^ ,;(]*$/, "")}...` : principal;
}

function juntar(frases: string[]): string {
  if (!frases.length) return "";
  const t =
    frases.length === 1
      ? frases[0]
      : frases.length === 2
        ? `${frases[0]} e ${frases[1]}`
        : `${frases.slice(0, -1).join("; ")}; e ${frases[frases.length - 1]}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export async function catalogoDoProjeto(ctx: Contexto): Promise<Set<string>> {
  if (ctx.familia !== "colagem") return new Set();
  const lista = await recortesDoProjeto(ctx.video.projectId).catch(() => []);
  return new Set(lista.map((x) => x.descricao.trim().toLowerCase()));
}

/**
 * Aplica as mudanças de cena. Sem nada novo para gerar, refaz a montagem na
 * hora; com imagem ou cena nova, guarda o pedido e pergunta o custo.
 */
async function mudarCenas(
  ctx: Contexto,
  ops: OpDeCena[],
  novaIdeia: { cena: number; plano: PlanoDeMontagem; prefixo: string } | null,
  userId: string,
  cardId: string,
  jaConfirmado = false
): Promise<ResultadoDoAjuste> {
  const plano = ctx.plano!;
  const fala = ctx.fala!;
  const novo = aplicarOps(plano, fala, ops, ctx.planoOriginal, novaIdeia);
  if (JSON.stringify(novo.cenas) === JSON.stringify(plano.cenas) && JSON.stringify(novo.assets) === JSON.stringify(plano.assets)) {
    return { tratado: true, resposta: "Essa parte do vídeo já está assim: não havia efeito para tirar ali. Me diga o momento exato se eu entendi errado.", aviso: "Nada mudou" };
  }
  const gera = assetsNovos(novo, plano, ctx.assetsProntos, await catalogoDoProjeto(ctx));
  const creditos = creditosDosAssets(gera);
  const relato = juntar(relatoDasOps(ctx, ops, novaIdeia));

  if (creditos > 0 && !jaConfirmado) {
    const p: AjustePendente = {
      alvo: ctx.alvo,
      videoJobId: ctx.video.id,
      trecho: ctx.alvo === "corte" ? ctx.indice : null,
      baseDesde: ctx.montagemDesde,
      fase: "gerar",
      ops,
      novaIdeia: novaIdeia ? { cena: novaIdeia.cena, plano: novaIdeia.plano, prefixo: novaIdeia.prefixo } : null,
      creditos,
      resumo: relato,
      criadoEm: agora(),
    };
    await guardarPendente(cardId, p);
    const ideia = novaIdeia ? descreverIdeiaNova(ctx, novo, novaIdeia) : relato ? `Entendi: ${relato.charAt(0).toLowerCase()}${relato.slice(1)}. ` : "";
    return {
      tratado: true,
      resposta:
        `${ideia}Para isso eu preciso gerar ${oQueGera(gera)}: ${creditosPorExtenso(creditos)}. ${await saldoParaMostrar(userId)} ` +
        `O resto reaproveita as imagens e cenas que já existem. Responda sim para eu gerar e refazer a edição, ou me diga outra coisa.`,
      aviso: "Esperando o seu sim",
    };
  }

  if (creditos > 0) await cobrar(ctx, userId, creditos, "video_ajuste_chat", `Ajuste pelo chat: ${oQueGera(gera)}`);
  if (ctx.alvo === "corte") await refazerMontagemDoCorte(ctx, novo);
  else await refazerMontagemDoCompleto(ctx, novo);
  const prazo = prazoDaMontagem(ctx, gera.cenas + gera.cenarios > 0);
  return {
    tratado: true,
    resposta:
      `Feito: ${relato.charAt(0).toLowerCase()}${relato.slice(1)}. ` +
      (creditos > 0 ? `Cobrei ${creditosPorExtenso(creditos)} pelo que foi gerado de novo; o resto reaproveita o que já existia. ` : "Sem custo novo: reaproveito as imagens e cenas que já existem. ") +
      `Estou refazendo só a edição ${ctx.alvo === "corte" ? "deste corte" : "do vídeo completo"}; fica pronta em ${prazo}. Enquanto isso o card mostra que o squad está fazendo.`,
    aviso: "O squad está fazendo",
  };
}

function descreverIdeiaNova(ctx: Contexto, novo: PlanoDeMontagem, ideia: { cena: number; plano: PlanoDeMontagem }): string {
  const fala = ctx.fala!;
  const partes: string[] = [];
  const n = ideia.plano.cenas.length;
  for (let k = ideia.cena; k < ideia.cena + n && k < novo.cenas.length; k++) partes.push(cenaNaTela(novo, k, fala, ctx.familia).descricao);
  const c = novo.cenas[ideia.cena];
  const { inicio } = tempoDaCena(c, fala.palavras, fala.duracao);
  return `A ideia nova para a cena de ${tempo(inicio)}: ${partes.join("; depois, ")}. `;
}

/** Corte: o plano ajustado vira o roteiro aprovado do corte, e a montagem recomeça (sem diretor). */
export async function refazerMontagemDoCorte(ctx: ContextoDoCorte, plano: PlanoDeMontagem): Promise<void> {
  const b = bordasDoCorte(ctx.t, ctx.brutas);
  const manter = ctx.manterDoPlano!;
  const roteiro: RoteiroDoCorte = {
    inicio: b.inicio,
    fim: b.fim,
    manter,
    texto: ctx.t.roteiro?.texto ?? textoFinalDoCorte(ctx.palavras, b.inicio, manter).texto,
    fala: ctx.fala!,
    plano,
    planoOriginal: ctx.t.roteiro?.planoOriginal ?? ctx.plano,
    origem: ctx.t.roteiro?.origem ?? "reaproveitado",
    feitoEm: agora(),
  };
  // A montagem só usa o plano se a fala dele é a que o worker emendou. Se não
  // bater, refazer chamaria o diretor de novo (e pagaria tudo): melhor parar.
  if (!planoAprovadoDoCorte({ ...ctx.t, roteiro } as Parameters<typeof planoAprovadoDoCorte>[0], b.inicio, b.fim)) {
    throw new Recusa("Não consegui ajustar a edição deste corte sem refazer o plano inteiro (a fala mudou desde a edição). Nada foi feito nem cobrado.");
  }
  await fundirNoTrecho(ctx.video.id, ctx.indice, { roteiro });
  const n = await refazerMontagens(ctx.video.id, [ctx.indice]);
  if (!n) throw new Recusa("Este corte ainda não tem o vídeo pronto para eu refazer a edição. Tente de novo em alguns minutos.");
}

export async function completoPodeRefazer(ctx: ContextoDoCompleto): Promise<boolean> {
  if (process.env.MONTAGEM_DO_COMPLETO !== "1") return false;
  const m = ctx.m;
  return Boolean(m?.fala?.palavras?.length && m.analise && m.baseUrl);
}

/**
 * Completo: o estado volta a "ilustrando" com o plano ajustado. O cron da
 * montagem do completo gera só o que mudou (hash), manda ao worker e troca o
 * completo no callback; o original continua guardado em `completoOriginal`.
 * Mesmo cuidado de `trocarEstado` (montagem-do-completo.ts): só grava se
 * ninguém mexeu no estado desde a leitura, e espelha no card.
 */
export async function refazerMontagemDoCompleto(
  ctx: ContextoDoCompleto,
  plano: PlanoDeMontagem,
  // A fala com palavra corrigida (reedição): a legenda do completo sai dela.
  fala?: Fala | null,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const m = ctx.m!;
  const novo = {
    ...m,
    ...(fala ? { fala } : {}),
    ...extra,
    estado: "ilustrando" as const,
    desde: agora(),
    plano,
    // O plano de antes do primeiro ajuste pelo chat, para "volta como era".
    planoOriginal: m.planoOriginal ?? m.plano,
    trabalhando: false,
    tentativas: 0,
    tentativasDoPasso: 0,
    esperarAte: null,
    motivo: null,
    resumo: { ...(m.resumo ?? {}), ajustadoPeloChatEm: agora() },
  };
  const json = JSON.stringify(novo);
  const n = await prisma.$executeRaw`
    UPDATE video_jobs SET "completoMontagem" = ${json}::jsonb
    WHERE id = ${ctx.video.id}
      AND COALESCE("completoMontagem" ->> 'estado', '') = ${m.estado}
      AND COALESCE("completoMontagem" ->> 'desde', '') = ${m.desde}`;
  if (!n) throw new Recusa("A edição do completo mudou enquanto eu ajustava. Me peça de novo em um minuto.");
  await prisma.$executeRaw`
    UPDATE campaign_cards SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('montagem', jsonb_build_object('estado', 'ilustrando'::text))
    WHERE metadata ->> 'videoJobId' = ${ctx.video.id} AND (metadata ->> 'completo')::boolean IS TRUE`.catch(() => 0);
}

// ─────────────────────────────── o sim ───────────────────────────────

async function executarPendente(ctx: Contexto, p: AjustePendente, userId: string, cardId: string): Promise<ResultadoDoAjuste> {
  if (ctx.montagemTrabalhando) {
    return { tratado: true, resposta: "O squad está montando este vídeo agora. Quando terminar, me peça o ajuste de novo.", aviso: "O squad está fazendo" };
  }
  if (!ctx.plano || !ctx.fala) throw new Recusa("Este vídeo não tem mais a edição em que eu calculei o ajuste. Me peça de novo.");
  if (p.fase === "ideia" && p.novaIdeia) {
    // Os créditos do diretor (10 desde 01/10), cobrados antes da chamada (mesma regra da tela de roteiro).
    await cobrar(ctx, userId, CREDITOS_POR_NOVA_IDEIA, "roteiro_nova_ideia", `Outra ideia para uma cena, pelo chat${p.novaIdeia.texto ? `: "${p.novaIdeia.texto.slice(0, 80)}"` : ""}`);
    const mini = await pedirOutraIdeia(ctx, p.novaIdeia.cena, p.novaIdeia.texto ?? null);
    const prefixo = `n${Date.now() % 1_000_000}`;
    return mudarCenas(ctx, p.ops, { cena: p.novaIdeia.cena, plano: mini, prefixo }, userId, cardId);
  }
  const ideia = p.novaIdeia?.plano ? { cena: p.novaIdeia.cena, plano: p.novaIdeia.plano, prefixo: p.novaIdeia.prefixo ?? `n${Date.now() % 1_000_000}` } : null;
  return mudarCenas(ctx, p.ops, ideia, userId, cardId, true);
}

/** O diretor só para uma cena (a mesma chamada do botão "Outra ideia" da tela de roteiro). */
export async function pedirOutraIdeia(ctx: Contexto, k: number, pedido: string | null): Promise<PlanoDeMontagem> {
  const plano = ctx.plano!;
  const fala = ctx.fala!;
  const c = plano.cenas[k];
  const { inicio, fim } = tempoDaCena(c, fala.palavras, fala.duracao);
  const daCena = fala.palavras.slice(c.de, c.ate + 1).map((w) => ({ texto: w.texto, inicio: +(w.inicio - inicio).toFixed(3), fim: +(w.fim - inicio).toFixed(3) }));
  return novaIdeiaDaCena({
    projectId: ctx.video.projectId,
    referencia: `${ctx.video.id}:chat:${ctx.alvo === "corte" ? ctx.indice : "c"}:${k}:${Date.now()}`,
    palavras: daCena,
    duracao: +(fim - inicio).toFixed(3),
    formato: plano.formato,
    escolha: ctx.video.project.videoEstiloEscolha,
    videoStyle: ctx.video.project.videoStyle,
    colorPalette: ctx.video.project.colorPalette,
    nicho: ctx.video.project.niche,
    antes: fala.palavras.slice(Math.max(0, c.de - 25), c.de).map((w) => w.texto).join(" "),
    depois: fala.palavras.slice(c.ate + 1, c.ate + 26).map((w) => w.texto).join(" "),
    atual: `${c.layout}, ${c.movimento}, ${c.elementos.map((e) => e.tipo).join(", ") || "sem elementos"}; ${c.motivo}; fala: ${palavrasDaCena(c, fala.palavras)}`,
    pedido,
  });
}

// ─────────────────────────────── o re-corte ───────────────────────────────

/**
 * As remoções de base da gravação: as GUARDADAS no roteiro (as que o cliente
 * leu e aprovou; rodar a limpeza por IA de novo daria outro texto e pagaria de
 * novo). Vídeo sem roteiro: as emendas que o corte de hoje já tem, mais a
 * limpeza sem IA (pausas, repetições, falso começo) no que o corte ganhar.
 */
async function remocoesDeBase(ctx: ContextoDoCorte): Promise<Remocao[]> {
  if (ctx.remocoesDoVideo) return ctx.remocoesDoVideo;
  const { bordas, manter } = ctx;
  const emendas: Remocao[] = [];
  for (let k = 0; k < manter.length - 1; k++) {
    emendas.push({ de: bordas.inicio + manter[k].ate, ate: bordas.inicio + manter[k + 1].de, motivo: "emenda do corte" });
  }
  const janela = ctx.palavras.filter((w) => w.end > bordas.inicio - 90 && w.start < bordas.fim + 90);
  const { remocoes } = await remocoesDaGravacao(janela, ctx.video.durationSec ?? bordas.fim + 90, { id: ctx.video.id, projectId: ctx.video.projectId, semIA: true });
  const fora = remocoes.filter((r) => r.ate <= bordas.inicio || r.de >= bordas.fim);
  return [...emendas, ...fora];
}

/** O corte refeito, calculado e ainda não enviado: bordas, fala, texto e plano. */
export type NovoCorte = {
  /** O trecho com as bordas pedidas (no tempo da gravação, nas palavras). */
  trecho: TrechoLido;
  roteiro: RoteiroDoCorte;
  remocoesDoCliente: Remocao[];
  /** Todas as remoções (base mais as do cliente): vão prontas ao worker. */
  remocoes: Remocao[];
  /** Índices (na transcrição) das palavras que ficam no ar. */
  noAr: number[];
  corrido: string;
  gera: { imagens: number; cenas: number; cenarios: number; descricoes: string[] };
};

/**
 * Calcula o corte novo a partir de palavras: onde começa, onde termina e o
 * que sai do meio. Não envia nada e não grava nada: serve ao chat do card e
 * ao "Voltar à edição" da tela de roteiro (lib/media/reedicao.ts).
 */
export async function calcularNovoCorte(
  ctx: ContextoDoCorte,
  pedido: { comecar?: number | null; terminar?: number | null; tirar?: Array<{ de: number; ate: number }>; ops?: OpDeCena[] }
): Promise<NovoCorte | { erro: string }> {
  const P = ctx.palavras;
  const valido = (i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < P.length;
  const { comecar, terminar } = pedido;
  if ((comecar != null && !valido(comecar)) || (terminar != null && !valido(terminar))) {
    return { erro: "Não achei essa palavra na fala. Pode me dizer as palavras exatas, do jeito que você fala no vídeo?" };
  }
  const tirar = (pedido.tirar ?? []).filter((r) => valido(r.de) && valido(r.ate) && r.ate >= r.de);
  if ((pedido.tirar?.length ?? 0) !== tirar.length) {
    return { erro: "Não achei exatamente o trecho que você quer tirar. Pode me dizer a primeira e a última palavra dele?" };
  }

  // As bordas novas: a palavra pedida, e o silêncio em volta dela.
  const tNovo: TrechoLido = {
    ...ctx.t,
    inicio: valido(comecar) ? P[comecar].start : ctx.t.inicio,
    fim: valido(terminar) ? P[terminar].end : ctx.t.fim,
    emPausa: valido(comecar) || valido(terminar) ? false : ctx.t.emPausa,
  };
  if (tNovo.fim <= tNovo.inicio) return { erro: "Com essas palavras o corte terminaria antes de começar. Pode conferir as palavras de início e de fim?" };
  const b = bordasDoCorte(tNovo, P);

  // O trecho do meio sai com as bordas no silêncio entre palavras: nunca no
  // meio de uma palavra. O pedido do cliente não passa pelo veto de fala
  // longa da limpeza automática: tirar fala é justamente o que ele pediu.
  const novasDoCliente = emendarNoSilencio(
    tirar.map((r) => ({ de: P[r.de].start, ate: P[r.ate].end, motivo: "pedido do cliente" })),
    P
  );
  const doCliente = [...(ctx.t.remocoesDoCliente ?? []), ...novasDoCliente];
  const base = await remocoesDeBase(ctx);
  const todas = [...base, ...doCliente];
  const manter = intervalosDoTrecho(todas, b.inicio, b.fim, P);
  const f = await falaDoCorte({
    palavras: ctx.brutas,
    termos: ctx.video.project.videoTerms,
    inicio: b.inicio,
    fim: b.fim,
    duracaoDaGravacao: ctx.video.durationSec ?? b.fim,
    edicao: { inicio: b.inicio, fim: b.fim, manter, em: agora() },
    projectId: ctx.video.projectId,
  });
  if (f.duracao < DURACAO_MINIMA_DO_CORTE) {
    return { erro: `Assim o corte ficaria com ${Math.round(f.duracao)} segundos, e o mínimo é ${DURACAO_MINIMA_DO_CORTE}. Quer tirar menos?` };
  }
  const final = textoFinalDoCorte(P, b.inicio, manter);

  // O plano de cenas vai junto, palavra por palavra: a montagem depois do
  // re-corte reconhece o roteiro e não chama o diretor.
  let plano: PlanoDeMontagem | null = null;
  let planoOriginal: PlanoDeMontagem | null = null;
  let gera = { imagens: 0, cenas: 0, cenarios: 0, descricoes: [] as string[] };
  if (ctx.plano && ctx.fala) {
    const ops = pedido.ops ?? [];
    const comOps = ops.length ? aplicarOps(ctx.plano, ctx.fala, ops, ctx.planoOriginal) : ctx.plano;
    const mapa = mapaDaFala(ctx, b, manter, f.palavras.length);
    plano = mapa ? levarPlanoParaFalaNova(comOps, mapa, f.palavras.length) : remapearPlano(comOps, ctx.fala.palavras, f.palavras);
    planoOriginal =
      ctx.planoOriginal && mapa && ctx.planoOriginal.cenas.every((c) => c.ate < mapa.length) ? levarPlanoParaFalaNova(ctx.planoOriginal, mapa, f.palavras.length) : null;
    gera = assetsNovos(plano, ctx.plano, ctx.assetsProntos, await catalogoDoProjeto(ctx));
  }
  const roteiro: RoteiroDoCorte = {
    inicio: b.inicio,
    fim: b.fim,
    manter,
    texto: final.texto,
    fala: { palavras: f.palavras, duracao: f.duracao },
    plano,
    planoOriginal,
    origem: "reaproveitado",
    feitoEm: agora(),
  };
  return { trecho: tNovo, roteiro, remocoesDoCliente: doCliente, remocoes: todas, noAr: final.indices, corrido: final.corrido, gera };
}

/**
 * Manda o corte novo ao worker e grava. Primeiro o pedido, depois o banco: se
 * o worker recusar, o corte no banco continua o que está no ar. Devolve se a
 * edição com efeitos vem em seguida (montagem ligada e plano reaproveitado).
 */
export async function enviarNovoCorte(ctx: ContextoDoCorte, n: NovoCorte, enviar: typeof enviarRecorteDoTrecho = enviarRecorteDoTrecho): Promise<boolean> {
  const v = ctx.video;
  const trecho = { ...n.trecho, roteiro: n.roteiro, remocoesDoCliente: n.remocoesDoCliente, transcricao: n.corrido };
  const paraOWorker: Omit<VideoParaCortar, "trechos"> = {
    id: v.id,
    blobUrl: v.blobUrl,
    durationSec: v.durationSec ?? 0,
    projectId: v.projectId,
    palavras: ctx.brutas,
    estilo: v.project.videoStyle,
    musicaUrl: v.project.videoMusicUrl,
    termos: v.project.videoTerms,
    escolha: v.project.videoEstiloEscolha,
    colorPalette: v.project.colorPalette,
    // As remoções prontas: o pedido não roda a limpeza por IA de novo.
    remocoesProntas: n.remocoes,
  };
  await enviar(paraOWorker, trecho as unknown as Parameters<typeof enviarRecorteDoTrecho>[1], ctx.indice);
  await fundirNoTrecho(v.id, ctx.indice, {
    inicio: n.trecho.inicio,
    fim: n.trecho.fim,
    emPausa: n.trecho.emPausa ?? false,
    roteiro: n.roteiro,
    remocoesDoCliente: n.remocoesDoCliente,
    transcricao: n.corrido,
    rascunho: null,
    midia: { ...(ctx.t.midia ?? {}), refazendo: true },
  });
  const comEdicao = Boolean(n.roteiro.plano) && montagemNaEdicaoLigada();
  if (comEdicao) await marcarCardsDoCorte(v.id, ctx.indice);
  return comEdicao;
}

async function recortar(
  ctx: ContextoDoCorte,
  e: Entendido,
  ops: OpDeCena[],
  cardId: string,
  opcoes: OpcoesDoAjuste
): Promise<ResultadoDoAjuste> {
  const n = await calcularNovoCorte(ctx, { comecar: e.comecarNaPalavra, terminar: e.terminarNaPalavra, tirar: e.tirar, ops });
  if ("erro" in n) return { tratado: true, resposta: n.erro, aviso: "O Vitor tem uma pergunta" };
  if (creditosDosAssets(n.gera) > 0) {
    // Só acontece quando o pedido mistura corte e troca de imagem: a troca
    // fica para depois, com o custo dito.
    return {
      tratado: true,
      resposta: "Vamos por partes: primeiro eu ajusto o corte (sem custo) e, quando ele voltar, você me pede a troca da imagem, que eu mostro quanto custa antes de gerar. Me mande só a parte do corte agora.",
      aviso: "O Vitor tem uma pergunta",
    };
  }
  const comEdicao = await enviarNovoCorte(ctx, n, opcoes.enviarRecorte);
  await guardarPendente(cardId, null);

  // A resposta: o que mudou, com as palavras do cliente.
  const P = ctx.palavras;
  const frases: string[] = [];
  if (typeof e.comecarNaPalavra === "number") frases.push(`o corte agora começa em ${aspas(trechoDeFala(n.noAr.slice(0, 4).map((i) => P[i].word), 4))}`);
  if (typeof e.terminarNaPalavra === "number") frases.push(`termina em ${aspas(trechoDeFala(n.noAr.slice(-4).map((i) => P[i].word), 4))}`);
  for (const r of e.tirar ?? []) {
    const saiu = P.slice(r.de, r.ate + 1).map((w) => w.word);
    const segundos = P[r.ate].end - P[r.de].start;
    frases.push(`tirei ${aspas(trechoDeFala(saiu, 10))} (${segundos.toFixed(1).replace(".", ",")} s)`);
  }
  for (const r of relatoDasOps(ctx, ops, null)) frases.push(r);
  const resposta =
    `Feito: ${juntar(frases).charAt(0).toLowerCase()}${juntar(frases).slice(1)}. O corte fica com ${tempo(n.roteiro.fala.duracao)} no ar. ` +
    `Estou refazendo o corte agora, sem cortar nenhuma palavra no meio; leva uns 2 minutos` +
    (comEdicao ? `, e depois a edição com as mesmas cenas e imagens, sem custo novo (mais ${prazoDaMontagem(ctx, false)}).` : ".") +
    " Enquanto isso o card mostra que o squad está fazendo.";
  return { tratado: true, resposta, aviso: "Refazendo o corte", refazendoCorte: true };
}

/** O mapa da fala antiga do plano para a nova, pelas palavras da gravação. Null se a fala do plano não bate com a transcrição (termos mudaram). */
function mapaDaFala(ctx: ContextoDoCorte, b: { inicio: number; fim: number }, manter: Intervalo[], total: number): Array<number | null> | null {
  if (!ctx.fala || !ctx.manterDoPlano || !ctx.bordasDoPlano) return null;
  const velhos = indicesDaFala(ctx.palavras, ctx.bordasDoPlano.inicio, ctx.bordasDoPlano.fim, ctx.manterDoPlano);
  if (velhos.length !== ctx.fala.palavras.length) return null;
  const novos = indicesDaFala(ctx.palavras, b.inicio, b.fim, manter);
  if (novos.length !== total) return null;
  const pos = new Map(novos.map((g, k) => [g, k]));
  return velhos.map((g) => pos.get(g) ?? null);
}
