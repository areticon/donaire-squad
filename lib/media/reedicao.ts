import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { aplicarTermos, comTroca, lerTroca, parseTermos } from "@/lib/media/termos";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { falaDoCorte, montagemNaEdicaoLigada, planoAprovadoDoCorte, refazerMontagens } from "@/lib/media/montagem-nos-cortes";
import { lerMontagem } from "@/lib/media/estado-da-montagem";
import { textoFinalDoCorte } from "@/lib/media/texto-final-do-corte";
import { CREDITOS_POR_NOVA_IDEIA } from "@/lib/media/limits";
import { estiloDosCortes, montarTela, RecusaDoRoteiro, type AcaoNaCena } from "@/lib/media/roteiro-da-edicao";
import {
  assetsNovos,
  calcularNovoCorte,
  catalogoDoProjeto,
  cobrar,
  completoPodeRefazer,
  contextoDoCompleto,
  contextoDoCorte,
  creditosDosAssets,
  enviarNovoCorte,
  fundirNoTrecho,
  lerVideo,
  oQueGera,
  pedirOutraIdeia,
  Recusa,
  refazerMontagemDoCompleto,
  type ContextoDoCompleto,
  type ContextoDoCorte,
  type Fala,
  type NovoCorte,
  type TrechoLido,
  type VideoLido,
} from "@/lib/media/ajuste-pelo-chat";
import { enviarRecorteDoTrecho } from "@/lib/media/refazer";
import {
  completoNaTela,
  editarIdeia,
  insercoesDoCompleto,
  mmss,
  remapearPlano,
  removerEfeito,
  restaurarCena,
  trocarCena,
  type RoteiroDoCorte,
  type TelaDeRoteiro,
} from "@/lib/media/roteiro-em-texto";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { familiaDaLinguagem } from "@/lib/media/capa-composta";
import type { PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import type { Word } from "@/lib/media/transcribe";

/**
 * "VOLTAR À EDIÇÃO" DE UM VÍDEO JÁ APROVADO (30/09/2026).
 *
 * O pedido do Bruno: um botão para o cliente reabrir o roteiro de um vídeo já
 * aprovado (na faixa do Gestor, no card do corte e no card do completo),
 * revisar e mudar: corrigir palavra da legenda (ele viu "azede" no lugar de
 * "as redes"), mudar início e fim dos cortes, tirar ou trocar efeitos por cena,
 * e então "Refazer com estes ajustes", que refaz SÓ o que mudou.
 *
 * ## Rascunho, e não refação a cada clique
 *
 * Cada clique na tela reaberta mexe num RASCUNHO; nada no ar muda até o
 * cliente mandar refazer. Num corte, o rascunho é o próprio roteiro do corte
 * (`clips[i].roteiro`, que é o que a montagem usa sem chamar o diretor) e as
 * bordas novas (`clips[i].rascunho`); no completo, `completoMontagem.reedicao
 * .completo` (plano e fala, no tempo do completo que está no ar). Ao abrir, o
 * roteiro de cada corte é sincronizado com o que está NO AR (a montagem pode
 * ter sido refeita pelo chat ou pela Vera depois da aprovação), e uma marca de
 * cada peça fica guardada para saber, no fim, o que mudou.
 *
 * ## O que "refazer" faz
 *
 *   - corte com bordas ou trecho do meio diferentes: re-corte no worker com as
 *     remoções prontas (a limpeza por IA não roda de novo), e a montagem que
 *     vem depois reconhece o roteiro (sem diretor);
 *   - corte com cena ou palavra diferente: só a montagem, com o roteiro novo;
 *   - completo com cena ou palavra diferente: só a montagem do completo, com
 *     o plano e a fala do rascunho.
 * Imagem e cena com o mesmo pedido saem de graça (hash). O que for gerado de
 * novo aparece em créditos no botão antes do clique, e é cobrado no clique.
 */

type EstadoDaReedicao = {
  abertaEm: string;
  /** Marca de cada corte na abertura: texto no ar e hash do plano. */
  cortes: Array<{ texto: string; plano: string } | null>;
  /** O rascunho do completo; null enquanto o cliente não mexeu nele. */
  completo: { plano: PlanoDeMontagem; fala: Fala } | null;
  /** Hash do plano e da fala do completo na abertura. */
  completoNoAr: string | null;
};

const agora = () => new Date().toISOString();
/**
 * JSON com as chaves em ordem: o jsonb do Postgres devolve as chaves em outra
 * ordem da que foi gravada, e o mesmo plano dava outro hash ("2 mudanças" logo
 * ao abrir, sem o cliente ter mexido em nada).
 */
function estavel(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(estavel).join(",")}]`;
  if (x && typeof x === "object") {
    return `{${Object.keys(x as Record<string, unknown>)
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estavel((x as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(x ?? null);
}
const hash = (x: unknown) => createHash("sha256").update(estavel(x)).digest("hex").slice(0, 16);
const textoDaFala = (f: Fala | null | undefined) => (f?.palavras ?? []).map((p) => p.texto).join(" ");

function recusa(e: unknown): never {
  if (e instanceof Recusa) throw new RecusaDoRoteiro(e.message, 409);
  throw e;
}

// ─────────────────────────────── banco ───────────────────────────────

async function lerReedicao(videoId: string): Promise<EstadoDaReedicao | null> {
  const l = await prisma.$queryRaw<Array<{ r: EstadoDaReedicao | null }>>`
    SELECT "completoMontagem" -> 'reedicao' AS r FROM video_jobs WHERE id = ${videoId}`;
  return l[0]?.r ?? null;
}

/** Fica DENTRO de `completoMontagem`: toda troca de estado do completo espalha o lido, então viaja junto. */
async function gravarReedicao(videoId: string, r: EstadoDaReedicao | null): Promise<void> {
  const json = JSON.stringify(r);
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = COALESCE("completoMontagem", '{}'::jsonb) || jsonb_build_object('reedicao', ${json}::jsonb)
    WHERE id = ${videoId}`;
}

async function videoDoDono(videoId: string, userId: string): Promise<VideoLido> {
  const v = await lerVideo(videoId, userId);
  if (!v) throw new RecusaDoRoteiro("Vídeo não encontrado.", 404);
  return v;
}

/** Por que não dá para reabrir agora; null quando dá. */
async function impedimento(v: VideoLido): Promise<string | null> {
  const status = await prisma.videoJob.findUnique({ where: { id: v.id }, select: { status: true } });
  if (status?.status !== "ready") return "O squad ainda está fazendo este vídeo. Quando ele ficar pronto, você volta à edição.";
  const trechos = (v.clips as TrechoLido[] | null) ?? [];
  if (trechos.some((t) => t?.midia?.refazendo || lerMontagem(t?.montagem)?.trabalhando)) {
    return "Um corte deste vídeo está sendo refeito agora. Quando ele terminar, você volta à edição.";
  }
  const c = await contextoDoCompleto(v);
  if (c.montagemTrabalhando) return "O vídeo completo está sendo editado agora. Quando terminar, você volta à edição.";
  return null;
}

/**
 * O roteiro de cada corte passa a ser o que está NO AR (a montagem pronta),
 * e o rascunho de bordas sai. É a abertura e é o "descartar".
 */
async function sincronizarCortes(v: VideoLido): Promise<Array<{ texto: string; plano: string } | null>> {
  const trechos = (v.clips as TrechoLido[] | null) ?? [];
  const marcas: Array<{ texto: string; plano: string } | null> = [];
  for (let i = 0; i < trechos.length; i++) {
    if (!trechos[i] || typeof trechos[i] !== "object") {
      marcas.push(null);
      continue;
    }
    const ctx = await contextoDoCorte(v, i, "no-ar").catch(() => null);
    if (!ctx) {
      marcas.push(null);
      continue;
    }
    let roteiro: RoteiroDoCorte | null = ctx.t.roteiro ?? null;
    if (ctx.plano && ctx.fala && ctx.manterDoPlano && ctx.bordasDoPlano) {
      // As bordas são as que a montagem confere (`bordasDoCorte` na transcrição crua).
      const b = bordasDoCorte(ctx.t, ctx.brutas);
      roteiro = {
        inicio: b.inicio,
        fim: b.fim,
        manter: ctx.manterDoPlano,
        texto: textoFinalDoCorte(ctx.palavras, b.inicio, ctx.manterDoPlano).texto,
        fala: ctx.fala,
        plano: ctx.plano,
        planoOriginal: ctx.t.roteiro?.planoOriginal ?? ctx.plano,
        origem: ctx.t.roteiro?.origem ?? "reaproveitado",
        feitoEm: agora(),
        // O estilo em que o plano no ar foi feito (01/10): é por ele que a
        // reedição sabe se o projeto mudou de estilo depois. Só vale quando o
        // plano do roteiro é o mesmo que está no ar (um rascunho replanejado
        // e descartado não pode deixar a marca do estilo novo).
        ...(ctx.t.roteiro?.estiloId && ctx.t.roteiro.plano && hash(ctx.t.roteiro.plano) === hash(ctx.plano) ? { estiloId: ctx.t.roteiro.estiloId } : {}),
      };
    }
    await fundirNoTrecho(v.id, i, { roteiro, rascunho: null });
    marcas.push(roteiro ? { texto: roteiro.texto, plano: hash(roteiro.plano) } : null);
  }
  return marcas;
}

// ─────────────────────────────── abrir e descartar ───────────────────────────────

export async function abrirReedicao(videoId: string, userId: string): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  const aberta = await lerReedicao(videoId);
  if (aberta) return (await montarTelaComReedicao(videoId, userId))!;
  const motivo = await impedimento(v);
  if (motivo) throw new RecusaDoRoteiro(motivo, 409);
  const cortes = await sincronizarCortes(v);
  const c = await contextoDoCompleto(v);
  await gravarReedicao(videoId, {
    abertaEm: agora(),
    cortes,
    completo: null,
    completoNoAr: c.plano && c.fala ? hash({ p: c.plano, f: textoDaFala(c.fala) }) : null,
  });
  return (await montarTelaComReedicao(videoId, userId))!;
}

export async function descartarReedicao(videoId: string, userId: string): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  await sincronizarCortes(v);
  await gravarReedicao(videoId, null);
  return (await montarTelaComReedicao(videoId, userId))!;
}

// ─────────────────────────────── a tela ───────────────────────────────

type Diferencas = {
  cortes: Array<{ indice: number; recortar: boolean; montar: boolean; linhas: string[]; gera: ReturnType<typeof assetsNovos> }>;
  completo: { montar: boolean; linhas: string[]; gera: ReturnType<typeof assetsNovos> } | null;
  creditos: number;
  gera: { imagens: number; cenas: number; cenarios: number };
};

/** O que o rascunho tem de diferente do que está no ar, peça por peça. */
async function diferencas(v: VideoLido, r: EstadoDaReedicao): Promise<Diferencas> {
  const trechos = (v.clips as Array<TrechoLido & { titulo?: string }> | null) ?? [];
  const saida: Diferencas = { cortes: [], completo: null, creditos: 0, gera: { imagens: 0, cenas: 0, cenarios: 0 } };
  const somar = (g: { imagens: number; cenas: number; cenarios: number }) => {
    saida.gera.imagens += g.imagens;
    saida.gera.cenas += g.cenas;
    saida.gera.cenarios += g.cenarios;
  };
  for (let i = 0; i < trechos.length; i++) {
    const t = trechos[i];
    const marca = r.cortes[i];
    if (!t?.roteiro || !marca) continue;
    const bordas = Boolean(t.rascunho);
    const texto = t.roteiro.texto !== marca.texto;
    const plano = hash(t.roteiro.plano) !== marca.plano;
    if (!bordas && !texto && !plano) continue;
    const titulo = t.titulo ?? `Corte ${i + 1}`;
    const linhas: string[] = [];
    // Com a borda nova as cenas são levadas para a fala nova: isso não é
    // "mudança de cena" para o cliente, e dizer que é confunde.
    if (bordas) linhas.push(`${titulo}: começo ou fim mudou (fica com ${mmss(t.roteiro.fala.duracao)} no ar; as cenas acompanham a fala)`);
    else {
      if (texto) linhas.push(`${titulo}: palavra corrigida na legenda`);
      if (plano) linhas.push(`${titulo}: cenas e efeitos mudaram`);
    }
    let gera = { imagens: 0, cenas: 0, cenarios: 0, descricoes: [] as string[] };
    if (t.roteiro.plano) {
      const ctx = await contextoDoCorte(v, i, "no-ar").catch(() => null);
      if (ctx?.plano) gera = assetsNovos(t.roteiro.plano, ctx.plano, ctx.assetsProntos, await catalogoDoProjeto(ctx));
    }
    somar(gera);
    // Sem plano de montagem, a legenda que se vê é a queimada no corte: corrigir palavra pede re-corte.
    const semMontagem = !t.roteiro.plano;
    saida.cortes.push({ indice: i, recortar: bordas || (texto && semMontagem), montar: !semMontagem && (plano || texto || bordas), linhas, gera });
  }
  if (r.completo) {
    const c = await contextoDoCompleto(v);
    const agoraHash = hash({ p: r.completo.plano, f: textoDaFala(r.completo.fala) });
    if (c.plano && agoraHash !== r.completoNoAr) {
      const linhas: string[] = [];
      if (hash(r.completo.plano) !== hash(c.plano)) linhas.push("Vídeo completo: cenas e efeitos mudaram");
      if (textoDaFala(r.completo.fala) !== textoDaFala(c.fala)) linhas.push("Vídeo completo: palavra corrigida na legenda");
      const gera = assetsNovos(r.completo.plano, c.plano, c.assetsProntos, await catalogoDoProjeto(c));
      somar(gera);
      saida.completo = { montar: true, linhas, gera };
    }
  }
  saida.creditos = creditosDosAssets(saida.gera);
  return saida;
}

/** A tela de roteiro, com a reedição quando o vídeo já foi aprovado. */
export async function montarTelaComReedicao(videoId: string, userId: string): Promise<TelaDeRoteiro | null> {
  const tela = await montarTela(videoId, userId);
  if (!tela || !tela.aprovadoEm) return tela;
  const v = await lerVideo(videoId, userId);
  if (!v) return tela;
  const r = await lerReedicao(videoId);
  if (!r) {
    const motivo = await impedimento(v);
    return { ...tela, reedicao: { aberta: false, podeAbrir: !motivo, motivo, mudancas: [], creditos: 0, geracao: null } };
  }
  // Reaberta: o completo mostrado é o que está NO AR (ou o rascunho dele), e
  // não o plano do roteiro aprovado, que é de outra fala.
  const c = await contextoDoCompleto(v);
  const familia = familiaDaLinguagem(normalizarEscolha(v.project.videoEstiloEscolha, v.project.videoStyle).estiloId);
  const fala = r.completo?.fala ?? c.fala;
  const plano = r.completo?.plano ?? c.plano;
  const completo =
    fala && plano
      ? completoNaTela({ fala, plano, planoOriginal: c.planoOriginal ?? c.plano, blocos: [], insercoes: insercoesDoCompleto(fala.duracao) }, familia, true, v.durationSec ?? 0)
      : tela.completo;
  const d = await diferencas(v, r);
  // O estilo do projeto mudou depois do plano (01/10): a tela oferece replanejar.
  const estilo = estiloDosCortes(v);
  return {
    ...tela,
    completo,
    reedicao: {
      aberta: true,
      podeAbrir: false,
      motivo: null,
      mudancas: [...d.cortes.flatMap((x) => x.linhas), ...(d.completo?.linhas ?? [])],
      creditos: d.creditos,
      geracao: d.creditos > 0 ? oQueGera(d.gera) : null,
      estiloNovo: estilo.cortesDeOutroEstilo.length ? { nome: estilo.nomeAtual, cortes: estilo.cortesDeOutroEstilo } : null,
    },
  };
}

// ─────────────────────────────── mexer no rascunho ───────────────────────────────

async function exigirAberta(videoId: string): Promise<EstadoDaReedicao> {
  const r = await lerReedicao(videoId);
  if (!r) throw new RecusaDoRoteiro("Esta edição não está aberta. Toque em Voltar à edição.", 409);
  return r;
}

/** Cena na reedição: o mesmo que a tela de roteiro faz antes da aprovação, só que no rascunho. */
export async function ajustarCenaNaReedicao(videoId: string, userId: string, a: AcaoNaCena): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  const r = await exigirAberta(videoId);
  try {
    if (a.alvo === "corte") {
      const ctx = await contextoDoCorte(v, a.trecho ?? -1, "rascunho");
      if (!ctx.plano || !ctx.fala || !ctx.plano.cenas[a.cena]) throw new RecusaDoRoteiro("Não achei esta cena. Recarregue a página.", 404);
      const novo = await mudarPlano(ctx, ctx.plano, ctx.fala, a, userId);
      await fundirNoTrecho(v.id, ctx.indice, { roteiro: { ...ctx.t.roteiro!, plano: novo } });
    } else {
      const c = await contextoDoCompleto(v);
      const plano = r.completo?.plano ?? c.plano;
      const fala = r.completo?.fala ?? c.fala;
      if (!plano || !fala || !plano.cenas[a.cena]) throw new RecusaDoRoteiro("Não achei esta cena. Recarregue a página.", 404);
      const novo = await mudarPlano({ ...c, plano, fala }, plano, fala, a, userId);
      await gravarReedicao(videoId, { ...r, completo: { plano: novo, fala } });
    }
  } catch (e) {
    recusa(e);
  }
  return (await montarTelaComReedicao(videoId, userId))!;
}

async function mudarPlano(
  ctx: ContextoDoCorte | ContextoDoCompleto,
  plano: PlanoDeMontagem,
  fala: Fala,
  a: AcaoNaCena,
  userId: string
): Promise<PlanoDeMontagem> {
  if (a.acao === "remover") return removerEfeito(plano, a.cena);
  if (a.acao === "editar") {
    if (!a.texto?.trim()) throw new RecusaDoRoteiro("Escreva o que você quer ver nesta cena.", 400);
    return editarIdeia(plano, a.cena, a.texto);
  }
  if (a.acao === "restaurar") {
    if (!ctx.planoOriginal) throw new RecusaDoRoteiro("Esta cena não tem versão anterior.", 400);
    return restaurarCena(plano, a.cena, ctx.planoOriginal);
  }
  // "Outra ideia": os créditos do botão, e o diretor só para a cena. As
  // imagens dela entram na conta do "Refazer", mostrada antes do clique.
  await cobrar(ctx, userId, CREDITOS_POR_NOVA_IDEIA, "roteiro_nova_ideia", a.texto?.trim() ? `Outra ideia para uma cena (reedição): "${a.texto.trim().slice(0, 80)}"` : "Outra ideia para uma cena (reedição)");
  const mini = await pedirOutraIdeia({ ...ctx, plano, fala } as ContextoDoCorte | ContextoDoCompleto, a.cena, a.texto?.trim() || null);
  return trocarCena(plano, a.cena, mini, `n${Date.now() % 1_000_000}`);
}

// ─────────────────────────────── início e fim do corte ───────────────────────────────

const fimDeFrase = (w: Word | undefined) => Boolean(w && /[.!?…]["”']?$/.test(w.word.trim()));
function inicioDaFrase(P: Word[], i: number): number {
  let j = Math.max(0, i);
  while (j > 0 && !fimDeFrase(P[j - 1])) j--;
  return j;
}
function fimDaFrase(P: Word[], i: number): number {
  let j = Math.min(P.length - 1, i);
  while (j < P.length - 1 && !fimDeFrase(P[j])) j++;
  return j;
}

/** Corte de até 3 minutos: mais que isso não é corte para rede. */
const DURACAO_MAXIMA_DO_CORTE = 180;

/**
 * "Começar uma frase antes", "Terminar uma frase depois": pela pontuação da
 * transcrição, para a borda cair sempre no fim de uma frase, nunca no meio.
 */
export async function moverBordaNaReedicao(
  videoId: string,
  userId: string,
  p: { trecho: number; lado: "inicio" | "fim"; sentido: "antes" | "depois" }
): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  await exigirAberta(videoId);
  try {
    const ctx = await contextoDoCorte(v, p.trecho, "rascunho");
    const P = ctx.palavras;
    const noAr = textoFinalDoCorte(P, ctx.bordas.inicio, ctx.manter).indices;
    if (!noAr.length) throw new RecusaDoRoteiro("Este corte está sem fala. Recarregue a página.", 409);
    const a = noAr[0];
    const b = noAr[noAr.length - 1];
    let comecar: number | null = null;
    let terminar: number | null = null;
    if (p.lado === "inicio") {
      if (p.sentido === "antes") {
        const s = inicioDaFrase(P, a);
        comecar = s < a ? s : a > 0 ? inicioDaFrase(P, a - 1) : a;
      } else {
        comecar = fimDaFrase(P, a) + 1;
      }
      if (comecar >= b) throw new RecusaDoRoteiro("Não dá para começar mais tarde: o corte ficaria sem fala.", 409);
    } else {
      if (p.sentido === "antes") terminar = inicioDaFrase(P, b) - 1;
      else terminar = fimDeFrase(P[b]) ? fimDaFrase(P, b + 1) : fimDaFrase(P, b);
      if (terminar <= a) throw new RecusaDoRoteiro("Não dá para terminar mais cedo: o corte ficaria sem fala.", 409);
    }
    const n = await calcularNovoCorte(ctx, { comecar, terminar });
    if ("erro" in n) throw new RecusaDoRoteiro(n.erro, 409);
    if (n.roteiro.fala.duracao > DURACAO_MAXIMA_DO_CORTE) throw new RecusaDoRoteiro(`Assim o corte passaria de ${DURACAO_MAXIMA_DO_CORTE / 60} minutos.`, 409);
    await fundirNoTrecho(v.id, p.trecho, {
      roteiro: n.roteiro,
      rascunho: { inicio: n.trecho.inicio, fim: n.trecho.fim, emPausa: n.trecho.emPausa ?? false, remocoesDoCliente: n.remocoesDoCliente },
    });
  } catch (e) {
    recusa(e);
  }
  return (await montarTelaComReedicao(videoId, userId))!;
}

// ─────────────────────────────── corrigir palavra ───────────────────────────────

/**
 * "azede" vira "as redes" na reedição: a troca vai para os termos do projeto
 * (vale para todo vídeo dele) e o rascunho de cada peça é refeito sem IA: o
 * texto e a fala de cada corte, e a fala do completo que está no ar, com o
 * plano levado para a fala nova quando a troca junta ou separa palavras.
 */
export async function corrigirTermoNaReedicao(videoId: string, userId: string, entrada: { errado: string; certo: string }): Promise<TelaDeRoteiro> {
  const v = await videoDoDono(videoId, userId);
  const r = await exigirAberta(videoId);
  const troca = lerTroca(`${entrada.errado} => ${entrada.certo}`);
  if (!troca) throw new RecusaDoRoteiro("Escreva a palavra como saiu e como é o certo, diferentes.", 400);
  const termos = comTroca(v.project.videoTerms, troca);
  await prisma.project.update({ where: { id: v.projectId }, data: { videoTerms: termos } });
  const vNovo: VideoLido = { ...v, project: { ...v.project, videoTerms: termos } };
  const brutas = ((v.transcript as { words?: Word[] } | null)?.words ?? []) as Word[];
  const palavras = aplicarTermos(brutas, parseTermos(termos));

  const trechos = (v.clips as TrechoLido[] | null) ?? [];
  for (let i = 0; i < trechos.length; i++) {
    const rc = trechos[i]?.roteiro;
    if (!rc) continue;
    // As mesmas bordas e intervalos: só o texto e as palavras mudam.
    const f = await falaDoCorte({
      palavras: brutas,
      termos,
      inicio: rc.inicio,
      fim: rc.fim,
      duracaoDaGravacao: v.durationSec ?? rc.fim,
      edicao: { inicio: rc.inicio, fim: rc.fim, manter: rc.manter, em: agora() },
      projectId: v.projectId,
    });
    const mudouLista = f.palavras.length !== rc.fala.palavras.length;
    await fundirNoTrecho(v.id, i, {
      roteiro: {
        ...rc,
        texto: textoFinalDoCorte(palavras, rc.inicio, rc.manter).texto,
        fala: { palavras: f.palavras, duracao: f.duracao },
        plano: rc.plano && mudouLista ? remapearPlano(rc.plano, rc.fala.palavras, f.palavras) : rc.plano,
      },
    });
  }

  // O completo: a fala dele é a do ARQUIVO no ar (transcrita de novo depois
  // do corte), então a troca é aplicada direto nela.
  const c = await contextoDoCompleto(vNovo);
  const falaBase = r.completo?.fala ?? c.fala;
  const planoBase = r.completo?.plano ?? c.plano;
  let completo = r.completo;
  if (falaBase && planoBase) {
    const comoWords: Word[] = falaBase.palavras.map((p) => ({ word: p.texto, start: p.inicio, end: p.fim }) as Word);
    const trocadas = aplicarTermos(comoWords, parseTermos(termos));
    const novaFala: Fala = { palavras: trocadas.map((w) => ({ texto: w.word, inicio: w.start, fim: w.end })), duracao: falaBase.duracao };
    if (textoDaFala(novaFala) !== textoDaFala(falaBase)) {
      const plano = novaFala.palavras.length !== falaBase.palavras.length ? remapearPlano(planoBase, falaBase.palavras, novaFala.palavras) : planoBase;
      completo = { plano, fala: novaFala };
    }
  }
  await gravarReedicao(videoId, { ...r, completo });
  return (await montarTelaComReedicao(videoId, userId))!;
}

// ─────────────────────────────── refazer ───────────────────────────────

export type ResultadoDaRefacao = { tela: TelaDeRoteiro; feito: string[]; creditos: number };

/**
 * "Refazer com estes ajustes": só o que mudou. Os créditos do que for gerado
 * de novo saem antes de qualquer envio (o botão mostrou o número); refazer
 * corte e montagem não cobra.
 */
export async function refazerComAjustes(
  videoId: string,
  userId: string,
  opcoes: { enviarRecorte?: typeof enviarRecorteDoTrecho } = {}
): Promise<ResultadoDaRefacao> {
  const v = await videoDoDono(videoId, userId);
  const r = await exigirAberta(videoId);
  const motivo = await impedimento(v);
  if (motivo) throw new RecusaDoRoteiro(motivo, 409);
  const d = await diferencas(v, r);
  if (!d.cortes.length && !d.completo) throw new RecusaDoRoteiro("Nada mudou ainda. Mexa em alguma cena, palavra ou borda antes de refazer.", 400);
  // As travas antes de cobrar: sem elas o estado "na-fila" nunca andaria.
  if (d.cortes.some((x) => x.montar && !x.recortar) && !montagemNaEdicaoLigada()) {
    throw new RecusaDoRoteiro("A edição com efeitos dos cortes não está ligada agora. Nada foi feito nem cobrado.", 409);
  }
  const ctxCompleto = d.completo ? await contextoDoCompleto(v) : null;
  if (ctxCompleto && !(await completoPodeRefazer(ctxCompleto))) {
    throw new RecusaDoRoteiro("A edição com efeitos do vídeo completo não está ligada agora. Nada foi feito nem cobrado.", 409);
  }

  try {
    const qualquer = d.cortes[0] ? await contextoDoCorte(v, d.cortes[0].indice, "rascunho") : ctxCompleto!;
    if (d.creditos > 0) await cobrar(qualquer, userId, d.creditos, "video_reedicao", `Voltar à edição: ${oQueGera(d.gera)}`);

    const feito: string[] = [];
    for (const x of d.cortes) {
      const ctx = await contextoDoCorte(v, x.indice, "rascunho");
      const t = ctx.t;
      const titulo = (t as TrechoLido & { titulo?: string }).titulo ?? `Corte ${x.indice + 1}`;
      if (x.recortar) {
        const n: NovoCorte = {
          trecho: t,
          roteiro: t.roteiro!,
          remocoesDoCliente: t.remocoesDoCliente ?? [],
          remocoes: [...(ctx.remocoesDoVideo ?? []), ...(t.remocoesDoCliente ?? [])],
          noAr: [],
          corrido: t.roteiro!.texto.replace(/ \/ /g, " "),
          gera: { imagens: 0, cenas: 0, cenarios: 0, descricoes: [] },
        };
        // Vídeo sem remoções guardadas: o roteiro já traz os intervalos certos (o pedido usa os dele).
        await enviarNovoCorte(ctx, n, opcoes.enviarRecorte);
        feito.push(`${titulo}: refazendo o corte (uns 2 minutos)${t.roteiro!.plano ? " e depois a edição com as mesmas cenas" : ""}`);
      } else if (x.montar) {
        await refazerSoAMontagem(ctx);
        feito.push(`${titulo}: refazendo só a edição (uns 5 a 10 minutos)`);
      }
    }
    if (d.completo && ctxCompleto && r.completo) {
      // A reedição fecha junto, dentro da mesma gravação do estado do completo.
      await refazerMontagemDoCompleto(ctxCompleto, r.completo.plano, r.completo.fala, { reedicao: null });
      const min = Math.max(10, Math.round((r.completo.fala.duracao / 60) * 1.6));
      feito.push(`Vídeo completo: refazendo só a edição (uns ${min} a ${min + 15} minutos)`);
    }
    await gravarReedicao(videoId, null);
    return { tela: (await montarTelaComReedicao(videoId, userId))!, feito, creditos: d.creditos };
  } catch (e) {
    recusa(e);
  }
}

/** A montagem do corte com o roteiro do rascunho (bordas iguais ao que está no ar). */
async function refazerSoAMontagem(ctx: ContextoDoCorte): Promise<void> {
  const b = bordasDoCorte(ctx.t, ctx.brutas);
  const roteiro = { ...ctx.t.roteiro!, inicio: b.inicio, fim: b.fim };
  if (!planoAprovadoDoCorte({ ...ctx.t, roteiro } as Parameters<typeof planoAprovadoDoCorte>[0], b.inicio, b.fim)) {
    throw new Recusa("Não consegui refazer a edição deste corte sem refazer o plano inteiro (a fala mudou desde a edição). Nada foi feito.");
  }
  await fundirNoTrecho(ctx.video.id, ctx.indice, { roteiro });
  const n = await refazerMontagens(ctx.video.id, [ctx.indice]);
  if (!n) throw new Recusa("Este corte ainda não tem o vídeo pronto para refazer a edição.");
}

/** A tela reaberta manda as ações de cena e de palavra para o rascunho (rotas roteiro/cena e roteiro/termos). */
export async function reedicaoAberta(videoId: string): Promise<boolean> {
  return Boolean(await lerReedicao(videoId));
}
