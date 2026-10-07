import { prisma } from "@/lib/db/prisma";
import { debitoIsento } from "@/lib/credits/isencao";
import { contaDoPlano } from "@/lib/equipe/conta";
import { debitar, SaldoInsuficiente } from "@/lib/credits";
import { estornarRefacaoDoCompleto, refDaRefacaoDoCompleto } from "@/lib/credits/estorno-da-refacao";
import { indicesDaFala, lerVideo, levarPlanoParaFalaNova, type VideoLido } from "@/lib/media/ajuste-pelo-chat";
import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import type { Word } from "@/lib/media/transcribe";
import type { Remocao } from "@/lib/media/edicao";
import { falaDoCorte } from "@/lib/media/montagem-nos-cortes";
import { reedicaoAberta } from "@/lib/media/reedicao";
import { gravarRoteiroDoVideo, lerRoteiroDoVideo, manterDoCompleto } from "@/lib/media/roteiro-da-edicao";
import { marcarCompletoNaFila, montagemDoCompletoLigada } from "@/lib/media/montagem-do-completo";
import { corpoDoSoCompleto, enviarSoOCompleto } from "@/lib/media/pedido-do-completo";
import { levarEdicaoParaFalaNova, tempoNaFalaNova } from "@/lib/media/edicao-na-fala-nova";
import { RecusaDoControle } from "@/lib/media/controle-do-corte-servidor";
import type { FalaDoTrecho, RoteiroDoVideo } from "@/lib/media/roteiro-em-texto";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import { levarJornadaParaFalaNova, palavrasDoMomento, type ElementoQueSaiu } from "@/lib/media/jornada/corte";
import { mapaExatoEntreFalas } from "@/lib/media/jornada/linha-do-tempo";
import type { EstadoDaJornada } from "@/lib/media/jornada/estado";
import {
  calcularCorte,
  CREDITOS_POR_REFACAO_DO_COMPLETO,
  DURACAO_MINIMA_DO_CORTE_SEG,
  escolhaDoCompleto,
  manterDoCompletoNoAr,
  mesmaEscolha,
  motivoDaIA,
  REFACOES_GRATIS_DO_COMPLETO,
  remocoesDoCompleto,
  resumoDaMudanca,
  tempoCurto,
  vizinhasNoAr,
  type ControleDoCorte,
  type ElementoNoControle,
  type EscolhaDoCorte,
  type Intervalo,
  type PalavraDoControle,
} from "@/lib/media/controle-do-corte";
import {
  baseDoCorte,
  comCorteQueNaoSaiu,
  editadoNoAr,
  levarTrecho,
  moverAbertura,
  REFAZENDO_VALE_MS,
  roteiroAntesDoCorte,
  semRefazendo,
  type CompletoDoCliente,
  type RefazendoOCompleto,
} from "@/lib/media/corte-do-completo";

/**
 * O CONTROLE DO CORTE NO VÍDEO COMPLETO, do lado do servidor (08/10/2026).
 * Espelho de lib/media/controle-do-corte-servidor.ts (o dos cortes): a conta é
 * a do módulo puro (lib/media/controle-do-corte.ts), a mesma que a tela faz
 * para o player; aqui ficam a leitura, as travas, o roteiro e o envio.
 *
 * O pedido do Bruno: "deve ter o controle de corte, os mesmos recursos para o
 * vídeo inteiro; às vezes o usuário não quer um corte de um vídeo pequeno, ele
 * quer o vídeo mas sem o começo, sem o fim, ele quer fazer um pequeno corte no
 * meio que a IA deixou passar".
 *
 * ## Aplicar
 *
 * - ANTES da aprovação (vídeo em "roteiro"): grava no roteiro, sem custo. A
 *   fala do completo passa a ser a do corte, e tudo o que foi escrito em cima
 *   dela anda junto pela palavra da gravação (o mapa exato, nunca alinhamento
 *   de texto): os elementos da jornada, o plano cena a cena, o do editor por
 *   comando, a abertura, as sugestões. O que perdeu a fala inteira sai, dito.
 * - DEPOIS da entrega: o mesmo, e refaz SÓ o completo no worker com as
 *   remoções do cliente. As mídias desta edição ficam (nada é gerado de novo),
 *   e o editado de agora continua no ar até o novo ficar pronto
 *   (lib/media/corte-do-completo.ts). Se o novo não sair, tudo volta.
 *
 * ## O registro
 *
 * `roteiro.completoDoCliente`, só do completo: os cortes continuam com a
 * limpeza da IA (`roteiro.remocoes`), que a tela mostra riscada.
 */

const PRODUZINDO = ["roteirizando", "aprovando", "selected", "cutting", "transcribing", "selecting", "pending", "uploading"];
const MONTAGEM_ANDANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"];

type MidiaDaEdicao = { url: string | null; tipo: "imagem" | "recorte" | "video" | null; formato: string; proporcao: number | null };

type Lido = {
  v: VideoLido;
  status: string;
  completoUrl: string | null;
  montagem: { estado: string | null; desde: string | null; montadoUrl: string | null; midias: Record<string, MidiaDaEdicao> | null };
  r: RoteiroDoVideo;
  termos: string | null;
  brutas: Word[];
  comTermos: Word[];
  dur: number;
  palavras: PalavraDoControle[];
  remocoesDaIA: Remocao[];
  /** O que está no ar (ou no roteiro) hoje, no tempo da gravação. */
  manter: Intervalo[];
  atual: EscolhaDoCorte;
  /** Os índices da transcrição da fala guardada do completo; null quando ela não bate com a gravação. */
  velhos: number[] | null;
  modo: "roteiro" | "no-ar";
  impedimento: string | null;
};

/**
 * Os índices (na transcrição) da fala do completo que está guardada no
 * roteiro, conferidos palavra a palavra: o mapa exato só vale se a fala
 * guardada é a desta gravação com estes pedaços. Null quando não é (um roteiro
 * de antes de uma correção da limpeza): aí não há como levar a edição com
 * segurança, e o controle diz isso em vez de chutar.
 */
export function indicesDaFalaGuardada(comTermos: Word[], dur: number, manter: Intervalo[], fala: Pick<FalaDoTrecho, "palavras"> | null | undefined): number[] | null {
  const idx = indicesDaFala(comTermos, 0, dur, manter);
  if (!fala?.palavras?.length) return idx;
  if (idx.length !== fala.palavras.length) return null;
  for (let k = 0; k < idx.length; k++) if (comTermos[idx[k]]?.word !== fala.palavras[k].texto) return null;
  return idx;
}

async function ler(videoId: string, userId: string): Promise<Lido> {
  const v = await lerVideo(videoId, userId);
  if (!v) throw new RecusaDoControle("Vídeo não encontrado.", 404);
  const linhas = await prisma.$queryRaw<
    Array<{ status: string; completoUrl: string | null; estado: string | null; desde: string | null; montadoUrl: string | null; midias: Record<string, MidiaDaEdicao> | null }>
  >`
    SELECT status, "completoUrl",
           "completoMontagem" ->> 'estado' AS estado,
           "completoMontagem" ->> 'desde' AS desde,
           "completoMontagem" ->> 'montadoUrl' AS "montadoUrl",
           "completoMontagem" #> '{jornada,midias}' AS midias
    FROM video_jobs WHERE id = ${videoId}`;
  const linha = linhas[0];
  const r = await lerRoteiroDoVideo(videoId);
  if (!r) throw new RecusaDoControle("Este vídeo é de antes da tela de roteiro: o controle do corte do completo não está disponível nele.", 409);
  const brutas = ((v.transcript as { words?: Word[] } | null)?.words ?? []) as Word[];
  if (!brutas.length) throw new RecusaDoControle("Este vídeo não tem a transcrição guardada, então não consigo achar as palavras dele.", 409);
  const termos = v.project.videoTerms;
  const comTermos = aplicarTermos(brutas, parseTermos(termos));
  const dur = v.durationSec ?? brutas[brutas.length - 1].end;
  const remocoesDaIA: Remocao[] = (r.remocoes ?? []).map((x) => ({ de: x.de, ate: x.ate, motivo: x.motivo ?? "limpeza" }));
  const palavras: PalavraDoControle[] = comTermos.map((w, i) => {
    const p = { i, texto: w.word, inicio: w.start, fim: w.end };
    return { ...p, ia: motivoDaIA(p, remocoesDaIA) };
  });
  const manter = manterDoCompleto(v, r, termos);
  const atual = escolhaDoCompleto(palavras, manter);
  const velhos = indicesDaFalaGuardada(comTermos, dur, manter, r.completo?.fala);
  const status = linha?.status ?? "";
  const montagem = { estado: linha?.estado ?? null, desde: linha?.desde ?? null, montadoUrl: linha?.montadoUrl ?? null, midias: linha?.midias ?? null };
  const modo = status === "roteiro" ? "roteiro" : "no-ar";
  const cdc = r.completoDoCliente;

  let impedimento: string | null = null;
  if (modo === "roteiro") {
    if (r.jornada && !r.jornada.plano && !r.jornada.erro) impedimento = "O plano do vídeo completo ainda está sendo feito. Quando ele aparecer, você ajusta o corte aqui.";
  } else if (PRODUZINDO.includes(status)) {
    impedimento = "O squad ainda está produzindo este vídeo. Quando o vídeo completo chegar, você ajusta o corte dele aqui.";
  } else if (!["cut", "writing", "ready"].includes(status)) {
    impedimento = "Este vídeo não está pronto para refazer o completo agora.";
  } else if (!linha?.completoUrl) {
    impedimento = "O vídeo completo ainda não chegou. Quando ele chegar, você ajusta o corte aqui.";
  } else if (montagem.estado && MONTAGEM_ANDANDO.includes(montagem.estado) && Date.now() - new Date(montagem.desde ?? 0).getTime() < REFAZENDO_VALE_MS) {
    impedimento = "A edição do vídeo completo está sendo montada agora. Quando terminar, você ajusta o corte.";
  } else if (cdc?.refazendo && !cdc.refazendo.base && Date.now() - new Date(cdc.refazendo.em).getTime() < REFAZENDO_VALE_MS) {
    impedimento = "O vídeo completo está sendo refeito com o seu último corte. Quando ele voltar, você ajusta de novo.";
  } else if (await reedicaoAberta(videoId)) {
    impedimento = "A edição deste vídeo está reaberta na tela de roteiro. Refaça ou descarte lá antes de ajustar o completo aqui.";
  } else if ((cdc?.refacoes ?? 0) >= REFACOES_GRATIS_DO_COMPLETO && CREDITOS_POR_REFACAO_DO_COMPLETO <= 0) {
    impedimento = `As ${REFACOES_GRATIS_DO_COMPLETO} refações gratuitas do vídeo completo já foram usadas. Para refazer de novo, fale com o suporte (código REFACAO-COMPLETO).`;
  }
  if (!impedimento && r.completo?.fala?.palavras?.length && !velhos) {
    impedimento = "Não consigo levar a edição deste vídeo completo para um corte novo com segurança. Fale com o suporte (código FALA-DO-COMPLETO).";
  }
  return { v, status, completoUrl: linha?.completoUrl ?? null, montagem, r, termos, brutas, comTermos, dur, palavras, remocoesDaIA, manter, atual, velhos, modo, impedimento };
}

async function saldoDa(userId: string): Promise<{ saldo: number | null; interno: boolean }> {
  const u = await prisma.user.findUnique({ where: { id: await contaDoPlano(userId) }, select: { creditsBalance: true, role: true } });
  return { saldo: u?.creditsBalance ?? null, interno: debitoIsento(u?.role) };
}

/** A edição do completo vai ser remontada sobre a base nova (o editado está no ar e a montagem está ligada)? */
function remonta(l: Lido): boolean {
  return montagemDoCompletoLigada() && editadoNoAr({ estado: l.montagem.estado ?? "", montadoUrl: l.montagem.montadoUrl ?? undefined }, l.completoUrl);
}

function oQueVemDepois(l: Lido): string {
  if (l.modo === "roteiro") {
    return "Fica no roteiro: quando você aprovar, o vídeo completo sai exatamente assim, e os elementos da edição entram em cima desta fala.";
  }
  const minutos = Math.max(2, Math.round((l.dur * 0.6) / 60));
  if (remonta(l)) {
    return `Refaço só o vídeo completo (uns ${minutos} minutos) e depois monto a edição de novo com os mesmos elementos, encaixados na fala nova, sem gerar imagem nova. O vídeo de agora continua no ar até o novo ficar pronto.`;
  }
  return `Refaço só o vídeo completo com este corte (uns ${minutos} minutos).`;
}

/** Os elementos da edição (jornada), com as palavras da gravação do momento de cada um. */
function elementosNoControle(l: Lido): ElementoNoControle[] {
  const j = l.r.jornada;
  const fala = l.r.completo?.fala?.palavras;
  if (!j || !fala?.length || !l.velhos) return [];
  const lista = j.aprovado?.elementos ?? (j.plano?.elementos ?? []).filter((el) => j.revisao[el.id]?.acao !== "removido");
  const velhos = l.velhos;
  return lista.map((el) => {
    const [de, ate] = palavrasDoMomento(el, fala);
    const palavras: number[] = [];
    for (let k = de; k <= ate; k++) if (velhos[k] !== undefined) palavras.push(velhos[k]);
    const g = velhos[Math.max(0, Math.min(velhos.length - 1, el.gatilho.indice))];
    return { id: el.id, descricao: j.revisao[el.id]?.descricaoAprovada ?? el.descricao, gatilho: g, palavras, t: l.comTermos[g]?.start ?? 0 };
  });
}

function avisoDoUltimo(l: Lido): string | null {
  // Só o roteiro: as duas voltas (sem base e sem montagem) gravam a marca nele, e um corte novo que sai a apaga.
  const n = l.r.completoDoCliente?.naoSaiu;
  return n ?"O seu último corte no vídeo completo não pôde ser aplicado: o vídeo segue como estava, e aquela refação não contou. Pode aplicar de novo." : null;
}

export async function lerControleDoCompleto(videoId: string, userId: string): Promise<ControleDoCorte> {
  return controleDe(await ler(videoId, userId), userId);
}

async function controleDe(l: Lido, userId: string): Promise<ControleDoCorte> {
  const { saldo, interno } = await saldoDa(userId);
  const feitas = l.r.completoDoCliente?.refacoes ?? 0;
  return {
    videoId: l.v.id,
    alvo: "completo",
    indice: -1,
    titulo: "Vídeo completo",
    palavras: l.palavras,
    remocoesDaIA: l.remocoesDaIA.map((r) => ({ de: +r.de.toFixed(3), ate: +r.ate.toFixed(3), motivo: r.motivo })),
    atual: l.atual,
    mantidosPeloUsuario: (l.r.completoDoCliente?.mantidosPeloUsuario ?? []).map((x) => ({ de: x.de, ate: x.ate, texto: x.texto })),
    duracaoDaGravacao: l.dur,
    modo: l.modo,
    impedimento: l.impedimento,
    refacoes: {
      feitas,
      gratis: REFACOES_GRATIS_DO_COMPLETO,
      creditosDaProxima: l.modo === "no-ar" && feitas >= REFACOES_GRATIS_DO_COMPLETO ? CREDITOS_POR_REFACAO_DO_COMPLETO : 0,
      saldo,
      interno,
    },
    depois: oQueVemDepois(l),
    fonteUrl: `/api/videos/${l.v.id}/midia?tipo=fonte`,
    posterUrl: `/api/videos/${l.v.id}/midia?tipo=capa-fonte`,
    elementos: elementosNoControle(l),
    aviso: avisoDoUltimo(l),
  };
}

// ─────────────────────────────── o roteiro na fala nova ───────────────────────────────

/** O plano do editor por comando na fala nova: as âncoras pela palavra da gravação, e o resumo dos elementos pelo tempo. */
function levarComando(plano: PlanoDoDiretor, antigas: PalavraNoCorte[], novas: PalavraNoCorte[], mapa: Array<number | null>): PlanoDoDiretor {
  const levada = levarEdicaoParaFalaNova(plano, antigas, novas, mapa);
  const elementos = plano.elementos
    ?.map((e) => {
      const t = tempoNaFalaNova(e, antigas, novas, mapa);
      return t ? { ...e, ...t } : null;
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  return { ...plano, ...levada.editor, ...(plano.elementos ? { elementos } : {}) };
}

/**
 * Tudo o que foi escrito sobre a fala do completo, levado para a fala nova
 * pelo mapa exato. A jornada vai pela função pura testada
 * (lib/media/jornada/corte.ts); o plano cena a cena, pela mesma conta do
 * re-corte dos cortes (`levarPlanoParaFalaNova`).
 */
export function roteiroNaFalaNova(
  r: RoteiroDoVideo,
  c: { mapa: Array<number | null>; falaNova: FalaDoTrecho; manterVelho: Intervalo[]; manterNovo: Intervalo[]; agora: string }
): { roteiro: RoteiroDoVideo; sairam: ElementoQueSaiu[]; movidos: number } {
  const antigas = r.completo?.fala?.palavras ?? [];
  const novas = c.falaNova.palavras;
  let jornada: EstadoDaJornada | null | undefined = r.jornada;
  let sairam: ElementoQueSaiu[] = [];
  let movidos = 0;
  if (jornada && antigas.length) {
    const j = levarJornadaParaFalaNova(jornada, { mapa: c.mapa, falaVelha: antigas, falaNova: novas, manterVelho: c.manterVelho, manterNovo: c.manterNovo, agora: c.agora });
    jornada = j.estado;
    sairam = j.sairam;
    movidos = j.movidos;
  }
  const comp = r.completo;
  const temFala = antigas.length > 0;
  const completo = comp
    ? {
        ...comp,
        fala: c.falaNova,
        plano: comp.plano && temFala ? levarPlanoParaFalaNova(comp.plano, c.mapa, novas.length) : comp.plano,
        planoOriginal: comp.planoOriginal && temFala ? levarPlanoParaFalaNova(comp.planoOriginal, c.mapa, novas.length) : comp.planoOriginal,
        blocos: temFala ? comp.blocos.map((b) => levarTrecho(b, c.mapa, novas)).filter((b): b is NonNullable<typeof b> => Boolean(b)) : comp.blocos,
        ...(comp.sugestoes && temFala ? { sugestoes: comp.sugestoes.map((s) => levarTrecho(s, c.mapa, novas)).filter((s): s is NonNullable<typeof s> => Boolean(s)) } : {}),
        ...(comp.comando?.plano && temFala ? { comando: { ...comp.comando, plano: levarComando(comp.comando.plano, antigas, novas, c.mapa) } } : {}),
      }
    : comp;
  const abertura = r.abertura && temFala ? moverAbertura(r.abertura, c.mapa, novas) : r.abertura;
  return { roteiro: { ...r, completo, jornada, abertura }, sairam, movidos };
}

// ─────────────────────────────── aplicar ───────────────────────────────

export type ResultadoDoControleDoCompleto = {
  modo: "roteiro" | "no-ar";
  mensagem: string;
  mudancas: string[];
  creditos: number;
  duracao: number;
  divergencias: number;
  /** Os elementos da edição que saíram porque a fala deles foi cortada. */
  sairam: string[];
  controle: ControleDoCorte;
};

function validar(l: Lido, e: EscolhaDoCorte): EscolhaDoCorte {
  const ids = new Set(l.palavras.map((p) => p.i));
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
  const comecar = num(e?.comecar);
  const terminar = num(e?.terminar);
  if (!ids.has(comecar) || !ids.has(terminar)) throw new RecusaDoControle("O começo ou o fim caiu fora da fala do vídeo. Recarregue a página.", 400);
  if (terminar < comecar) throw new RecusaDoControle("O fim ficou antes do começo.", 400);
  const fora = Array.isArray(e?.fora) ? [...new Set(e.fora.map(num).filter((i) => ids.has(i) && i >= comecar && i <= terminar))] : [];
  return { comecar, terminar, fora, finoInicio: num(e?.finoInicio) || 0, finoFim: num(e?.finoFim) || 0 };
}

const listaDosQueSairam = (s: ElementoQueSaiu[]) => s.map((x) => `“${x.descricao.slice(0, 60)}”`).join(", ");

export async function aplicarControleDoCompleto(
  videoId: string,
  userId: string,
  bruta: EscolhaDoCorte,
  opcoes: { enviar?: (corpo: string) => Promise<void>; appUrl?: string } = {}
): Promise<ResultadoDoControleDoCompleto> {
  const l = await ler(videoId, userId);
  if (l.impedimento) throw new RecusaDoControle(l.impedimento, 409);
  const escolha = validar(l, bruta);
  if (mesmaEscolha(escolha, l.atual)) throw new RecusaDoControle("Nada mudou ainda. Puxe o começo ou o fim, ou toque numa frase para tirar ou devolver.", 400);
  const calc = calcularCorte(l.palavras, l.remocoesDaIA, escolha, l.dur);
  if (calc.duracao < DURACAO_MINIMA_DO_CORTE_SEG) throw new RecusaDoControle(`Assim o vídeo completo ficaria com ${Math.round(calc.duracao)} segundos, e o mínimo é ${DURACAO_MINIMA_DO_CORTE_SEG}.`, 400);

  // A fala nova: exatamente os pedaços que o player tocou, pela mesma conta da fala do roteiro.
  const manterNovo = manterDoCompletoNoAr(calc, l.palavras);
  const remocoes = remocoesDoCompleto(calc, l.dur, l.palavras);
  const agora = new Date().toISOString();
  const f = await falaDoCorte({ palavras: l.brutas, termos: l.termos, inicio: 0, fim: l.dur, duracaoDaGravacao: l.dur, edicao: { inicio: 0, fim: l.dur, manter: manterNovo, em: agora } });
  const falaNova: FalaDoTrecho = { palavras: f.palavras, duracao: f.duracao };
  const novos = indicesDaFala(l.comTermos, 0, l.dur, manterNovo);
  if (novos.length !== falaNova.palavras.length) {
    console.error(`[controle-do-completo][${videoId}] a fala nova tem ${falaNova.palavras.length} palavras e o mapa ${novos.length}`);
    throw new RecusaDoControle("Não consegui montar a fala nova deste corte. Tente de novo (código MAPA-DO-COMPLETO).", 500);
  }
  // O MAPA EXATO (lib/media/jornada/linha-do-tempo.ts): a palavra 12 da fala antiga é a palavra X da gravação, e ela está (ou não) na fala nova.
  const mapa = mapaExatoEntreFalas(l.velhos ?? [], novos);
  const levado = roteiroNaFalaNova(l.r, { mapa, falaNova, manterVelho: l.manter, manterNovo, agora });

  const noAr = new Set(calc.noAr);
  const mantidosPeloUsuario = calc.devolvidos.map((d) => ({ ...d, ...vizinhasNoAr(l.palavras, noAr, d.de, d.ate) }));
  const mudancas = resumoDaMudanca(l.palavras, l.atual, escolha);
  const sairam = levado.sairam.map((s) => s.descricao);
  const registro = { em: agora, escolha, mudancas, duracao: calc.duracao, ...(sairam.length ? { sairam } : {}) };
  const cdc0 = l.r.completoDoCliente;
  const completoDoCliente = (refacoes: number, extra: Partial<CompletoDoCliente> = {}): CompletoDoCliente => ({
    manter: manterNovo,
    remocoes,
    doCliente: calc.doCliente,
    mantidosPeloUsuario,
    refacoes,
    ultima: registro,
    refazendo: null,
    naoSaiu: null,
    ...extra,
  });
  const saem = levado.sairam.length ? ` Sai da edição, porque a fala foi cortada: ${listaDosQueSairam(levado.sairam)}.` : "";

  if (l.modo === "roteiro") {
    await gravarRoteiroDoVideo(videoId, { ...levado.roteiro, completoDoCliente: completoDoCliente(cdc0?.refacoes ?? 0) });
    return {
      modo: "roteiro",
      mensagem: `Guardado no roteiro: ${mudancas.join("; ")}. O vídeo completo fica com ${tempoCurto(calc.duracao)} e sai exatamente assim quando você aprovar.${saem}`,
      mudancas,
      creditos: 0,
      duracao: calc.duracao,
      divergencias: calc.divergencias.length,
      sairam,
      controle: await lerControleDoCompleto(videoId, userId),
    };
  }

  // DEPOIS DA ENTREGA: a refação conta (as gratuitas primeiro).
  const refacoes = (cdc0?.refacoes ?? 0) + 1;
  const cobra = refacoes > REFACOES_GRATIS_DO_COMPLETO;
  const creditos = cobra ? CREDITOS_POR_REFACAO_DO_COMPLETO : 0;
  const { saldo, interno } = await saldoDa(userId);
  if (cobra && creditos <= 0) throw new RecusaDoControle(`As ${REFACOES_GRATIS_DO_COMPLETO} refações gratuitas do vídeo completo já foram usadas. Para refazer de novo, fale com o suporte (código REFACAO-COMPLETO).`, 402);
  if (cobra && !interno && (saldo ?? 0) < creditos) {
    throw new RecusaDoControle(`As ${REFACOES_GRATIS_DO_COMPLETO} refações gratuitas do vídeo completo já foram usadas, e a próxima usa ${creditos} créditos. Seu saldo: ${saldo ?? 0}.`, 402);
  }

  // As mídias DESTA edição ficam (o mesmo caminho do ajuste pelo card, E6): a montagem nova não gera nada de novo.
  const j = levado.roteiro.jornada;
  const vivos = new Set((j?.aprovado?.elementos ?? []).map((e) => e.id));
  const jornada = j?.aprovado
    ? {
        ...j,
        midiasMantidas: Object.fromEntries(
          Object.entries(l.montagem.midias ?? {})
            .filter(([id, x]) => vivos.has(id) && x?.url && x.tipo)
            .map(([id, x]) => [id, { url: x.url as string, tipo: x.tipo as "imagem" | "recorte" | "video", formato: x.formato, proporcao: x.proporcao ?? null }])
        ),
      }
    : j;
  // O que volta se este corte não sair é o que está no ar: com uma refação velha que nunca voltou, o roteiro de antes dela (revisão de 08/10).
  const refazendo: RefazendoOCompleto = { em: agora, base: null, refacao: refacoes, creditos, userId, roteiroAnterior: roteiroAntesDoCorte(l.r) as unknown as Record<string, unknown> };
  const novo: RoteiroDoVideo = { ...levado.roteiro, jornada, completoDoCliente: completoDoCliente(refacoes, { refazendo, ultima: { ...registro, creditos } }) };

  // O roteiro primeiro (o pedido ao worker é montado dele), e volta se o worker recusar: nada muda e nada é cobrado.
  await gravarRoteiroDoVideo(videoId, novo);
  try {
    const corpo = await corpoDoSoCompleto(l.v, novo, opcoes.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com");
    await (opcoes.enviar ?? enviarSoOCompleto)(corpo);
  } catch (e) {
    await gravarRoteiroDoVideo(videoId, l.r);
    console.error(`[controle-do-completo][${videoId}] o worker não aceitou o completo:`, e);
    throw new RecusaDoControle("Não consegui pedir o vídeo completo de novo agora. Nada mudou; tente em alguns minutos.", 502);
  }
  // Sem preço aprovado (zero), a refação gratuita não vai ao extrato: `debitar` não registra zero.
  if (creditos > 0) {
    try {
      await debitar({
        userId,
        quantidade: creditos,
        operation: "corte_refacao",
        projectId: l.v.projectId,
        refId: refDaRefacaoDoCompleto(videoId, refacoes),
        note: `Refação ${refacoes} do vídeo completo: ${mudancas.join("; ")}`.slice(0, 180),
      });
    } catch (e) {
      if (!(e instanceof SaldoInsuficiente)) console.error(`[controle-do-completo][${videoId}] cobrança da refação ${refacoes} falhou:`, e);
    }
  }
  const restantes = Math.max(0, REFACOES_GRATIS_DO_COMPLETO - refacoes);
  return {
    modo: "no-ar",
    mensagem:
      `Refazendo o vídeo completo: ${mudancas.join("; ")}. Ele fica com ${tempoCurto(calc.duracao)}. ${oQueVemDepois(l)}${saem} ` +
      (creditos
        ? `Esta refação usou ${creditos} créditos.`
        : restantes
          ? `Sem custo: ${restantes === 1 ? "ainda resta 1 refação gratuita" : `ainda restam ${restantes} refações gratuitas`} do vídeo completo.`
          : "Sem custo; esta foi a última refação gratuita do vídeo completo."),
    mudancas,
    creditos,
    duracao: calc.duracao,
    divergencias: calc.divergencias.length,
    sairam,
    controle: await lerControleDoCompleto(videoId, userId),
  };
}

// ─────────────────────────────── a volta do worker ───────────────────────────────

/**
 * A BASE DO CORTE DO CLIENTE CHEGOU (cortar-callback, completo atrasado). Com
 * o editado no ar, ela NÃO toma o lugar dele: vai direto para a fila da
 * montagem, e o editado só sai quando o novo estiver pronto. Devolve true
 * quando tratou (a rota não troca o `completoUrl`). Sem editado no ar (a
 * montagem desligada ou nunca saiu), a base com o corte vai ao ar como sempre,
 * e a marca da refação sai aqui.
 *
 * O AVISO REPETIDO (revisão de 08/10): com o editado no ar, o `completoUrl`
 * nunca é a base do corte, então a rota não reconhece pela URL um aviso que o
 * worker repetiu (ele repete quando a resposta demora ou falha), nem a
 * segunda base do mesmo corte. Sem esta conta, o repetido tomava o lugar do
 * editado e apagava o arquivo dele (`baseDoCorte`, lib/media/corte-do-completo.ts).
 */
export async function receberBaseDoCorteDoCompleto(videoId: string, completoUrl: string | null, base: { url: string; bytes?: number | null }): Promise<boolean> {
  const r = await lerRoteiroDoVideo(videoId);
  const linhas = await prisma.$queryRaw<Array<{ estado: string | null; montadoUrl: string | null; baseUrl: string | null; original: string | null }>>`
    SELECT "completoMontagem" ->> 'estado' AS estado, "completoMontagem" ->> 'montadoUrl' AS "montadoUrl",
           "completoMontagem" ->> 'baseUrl' AS "baseUrl", "completoMontagem" #>> '{completoOriginal,url}' AS original
    FROM video_jobs WHERE id = ${videoId}`;
  const m = linhas[0];
  const tipo = baseDoCorte(base.url, r?.completoDoCliente, m ? { baseUrl: m.baseUrl, completoOriginal: m.original ? { url: m.original } : null } : null);
  if (tipo === "repetida" || tipo === "segunda") {
    console.warn(`[controle-do-completo][${videoId}] base ${tipo === "repetida" ? "repetida" : "a mais do mesmo corte"} ignorada; o completo no ar não muda`);
    return true;
  }
  if (tipo === "comum") return false;
  if (montagemDoCompletoLigada() && m && editadoNoAr({ estado: m.estado ?? "", montadoUrl: m.montadoUrl ?? undefined }, completoUrl)) {
    if (await marcarCompletoNaFila(videoId, { base: { url: base.url, bytes: base.bytes ?? null } })) {
      // A retomada depois de um reinício do worker passa pela rota de refazer o completo, que zera o fim da rodada.
      await prisma.videoJob.updateMany({ where: { id: videoId, finishedAt: null }, data: { finishedAt: new Date() } });
      console.log(`[controle-do-completo][${videoId}] a base do corte do cliente chegou e foi para a montagem; o editado de antes segue no ar`);
      return true;
    }
  }
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET "completoMontagem" = jsonb_set("completoMontagem", '{roteiro,completoDoCliente,refazendo}', 'null'::jsonb, false)
    WHERE id = ${videoId} AND jsonb_typeof("completoMontagem" #> '{roteiro,completoDoCliente}') = 'object'`;
  return false;
}

/**
 * O WORKER NÃO DEVOLVEU A BASE do corte do cliente (erro ou reinícios
 * demais). O completo de antes continua no ar, então o roteiro volta ao de
 * antes do corte, com o aviso, e a refação é devolvida. Devolve true quando
 * era um corte do cliente (a rota não grava o erro do completo: o vídeo no
 * ar está bem).
 */
export async function desfazerCorteDoCompletoSemBase(videoId: string, motivo: string): Promise<boolean> {
  const r = await lerRoteiroDoVideo(videoId);
  const ref = r?.completoDoCliente?.refazendo;
  if (!r || !ref || ref.base) return false;
  const anterior = ((ref.roteiroAnterior as RoteiroDoVideo | null) ?? semRefazendo(r)) as RoteiroDoVideo;
  await gravarRoteiroDoVideo(videoId, comCorteQueNaoSaiu(anterior, { em: new Date().toISOString(), motivo: motivo.slice(0, 200) }));
  await prisma.videoJob.updateMany({ where: { id: videoId, finishedAt: null }, data: { finishedAt: new Date() } });
  await estornarRefacaoDoCompleto(videoId, ref).catch((e) => console.error(`[controle-do-completo][${videoId}] devolução da refação falhou:`, e));
  console.warn(`[controle-do-completo][${videoId}] o corte do cliente não saiu no worker (${motivo.slice(0, 200)}); o roteiro voltou ao de antes`);
  return true;
}
