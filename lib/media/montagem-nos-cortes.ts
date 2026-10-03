import { ganchoEmFraseInteira, limparSoco } from "@/lib/media/abertura-do-roteiro";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import { detectarPausas, duracaoDosIntervalos, emendarNoSilencio, intervalosDoTrecho } from "@/lib/media/edicao";
import {
  detectarFalsosComecos,
  detectarHesitacao,
  detectarMuletasArrastadas,
  detectarRepeticoes,
  limpezaParaRemocoes,
  unirRemocoes,
} from "@/lib/media/limpeza";
import { noTempoDoCorte } from "@/lib/media/legenda-falada";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { coresDaMarca, familiaDaLinguagem } from "@/lib/media/capa-composta";
import { dirigirMontagem } from "@/lib/media/diretor-de-montagem";
import { gerarAssetsDaMontagem, recortesDoProjeto, urlsDosAssets, type AssetGerado } from "@/lib/media/assets-da-montagem";
import { concluirSePronto } from "@/lib/media/higgsfield";
import { ASSETS_EM_VIDEO, resolverMontagem, type PalavraNoCorte, type PlanoDeMontagem, type Retangulo } from "@/lib/media/plano-de-montagem";
import { legendaDecidida } from "@/lib/media/legenda-escolhida";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { EdicaoDoTrecho } from "@/lib/media/edicao-gravada";
import type { MontagemDoCorte } from "@/lib/media/estado-da-montagem";
import type { Word } from "@/lib/media/transcribe";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { edicaoDaLinguagem } from "@/lib/media/linguagem-da-edicao";
import { detectarDemonstracao, quadrosPeloWorker, type ObterQuadros } from "@/lib/media/demonstracao";
import { limitarTextoNaTela, planoSeguro, semInsercaoQueNaoSeSustenta, tirarCoberturaDaDemonstracao, voltarCenasParaPessoa } from "@/lib/media/guardas-do-completo";
import { conferirAssets } from "@/lib/media/conferencia-da-imagem";
import { perfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import { pedidosDoCliente } from "@/lib/media/montagem-do-completo";
import { estornarEdicaoNaoEntregue } from "@/lib/credits/estorno-da-edicao";
import { consertosDaRevisao, RODADAS_DE_CONSERTO, revisaoVisualLigada, revisarVideoPronto, type EstadoDaRevisaoVisual } from "@/lib/media/revisao-visual";

/** O volume da trilha e o quanto ela abaixa sob a voz: os do estilo do corte simples (estilos.ts). */
function somDaTrilha(video: { project: { videoEstiloEscolha: unknown; videoStyle: string | null; colorPalette: string | null } }): { volume: number; abaixar: number } {
  const { estilo } = edicaoDaLinguagem(video.project.videoEstiloEscolha, video.project.videoStyle, video.project.colorPalette);
  return { volume: estilo.som.volumeDaTrilha, abaixar: estilo.som.abaixarSobAVoz };
}
import { avisarAdminsDaMontagem } from "@/lib/media/aviso-da-montagem";
import type { RoteiroDoCorte } from "@/lib/media/roteiro-em-texto";
import {
  consertarEdicao,
  editorSobMedidaLigado,
  frasesNumeradas,
  gerarInsercoes,
  medidasDaEdicao,
  referenciaParaOEditor,
  resolverEdicao,
  revisarPrevia,
  temaDoEstilo,
  type EdicaoDoEditor,
  type EdicaoResolvida,
} from "@/lib/media/editor-sob-medida";
import { escreverBloco, type EntradaDoEditor } from "@/lib/media/editor-sob-medida/editor";
import { PECAS } from "@/lib/media/editor-sob-medida/pecas";
import { adensarCorte, arejarCorte, densidadeDoCorte, instantesDoCorte, instrucoesDoCorte, noQuadroDoCorte, quadroDoCorte } from "@/lib/media/editor-sob-medida/corte";
import { perfilNoPrompt } from "@/lib/media/perfil-do-projeto";

/**
 * O EDITOR COMPLETO NA ESTEIRA (30/09/2026), com a trava MONTAGEM_NA_EDICAO=1.
 *
 * Mesmo desenho da abertura por IA (lib/media/higgsfield-nos-cortes.ts), que
 * já provou o caminho: o callback MARCA, o cron da fila ANDA um estado por vez,
 * e nada espera dentro de uma função.
 *
 *   1. `cortar-callback` marca cada corte novo como "na-fila";
 *   2. `avancarMontagens` (cron da fila, a cada minuto):
 *        na-fila    -> "dirigindo": a fala limpa (a edição GRAVADA do corte,
 *                      `clips[i].edicao`), o diretor (Claude), as imagens
 *                      (Nano Banana) e os PEDIDOS da Higgsfield; grava tudo e
 *                      vai para "gerando";
 *        gerando    -> uma consulta de status por passada (nunca a espera do
 *                      SDK); com as cenas prontas (ou 15 min, e aí a cena que
 *                      não veio sai do plano), resolve a geometria e manda ao
 *                      worker `/montar` com callback -> "montando";
 *        montando   -> espera o callback; morto aos 40 min, tenta mais uma vez;
 *   3. `/api/videos/[id]/montar-callback` troca `midia.vertical` pela montagem,
 *      guardando o original em `midia.verticalOriginal`, e move os posts que
 *      ainda não saíram para o vídeo novo.
 *
 * Com a montagem ligada, a abertura por IA antiga fica DESLIGADA
 * (`marcarAberturasNaFila` devolve zero): as cenas geradas entram pelo diretor.
 *
 * FALHA NUNCA SEGURA O CORTE: qualquer erro termina em "sem-montagem" com o
 * motivo, e o vertical original continua valendo.
 */

export function montagemNaEdicaoLigada(): boolean {
  return process.env.MONTAGEM_NA_EDICAO === "1";
}

/** "dirigindo" parado há mais que isto é função morta (diretor + imagens levam ~2 min). */
const PASSO_MORTO_MS = 10 * 60_000;
/** Cena da Higgsfield que não chegou nisto sai do plano (a montagem não espera para sempre). */
const PRAZO_DAS_CENAS_MS = 15 * 60_000;
/**
 * Sem callback nisto, a montagem morreu. 90 min e não 40 (30/09): o worker
 * agora monta UM corte por vez e espera cortes e completo terminarem, então
 * o quarto corte de um vídeo pode passar meia hora só na fila.
 */
const PRAZO_DO_RENDER_MS = 90 * 60_000;
/**
 * Envios ao worker por corte. Três, e não dois (30/09): na primeira rodada em
 * produção as duas tentativas de cada corte falharam juntas, com o worker
 * sobrecarregado; agora cada nova tentativa espera `ESPERA_ENTRE_TENTATIVAS`.
 */
const MAX_TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 3 * 60_000;
const depois = (ms: number) => new Date(Date.now() + ms).toISOString();

type MidiaDoCorte = {
  vertical?: { url: string; bytes?: number } | null;
  verticalOriginal?: { url: string; bytes?: number } | null;
  capa?: { url: string } | null;
  recorte?: { rosto?: Retangulo } | null;
  enquadramento?: { pessoa?: Retangulo | null } | null;
  erro?: string | null;
};
export type TrechoComMontagem = {
  inicio: number;
  fim: number;
  emPausa?: boolean;
  titulo?: string;
  midia?: MidiaDoCorte | null;
  edicao?: EdicaoDoTrecho | null;
  montagem?: MontagemDoCorte | null;
  /** O roteiro aprovado pelo cliente (30/09): fala e plano, com os ajustes dele. */
  roteiro?: RoteiroDoCorte | null;
};

/**
 * O plano APROVADO na tela de roteiro vale para este corte? Só se a fala é a
 * mesma que o worker emendou: mesmas bordas e mesmos intervalos mantidos. O
 * pedido de corte usa as remoções guardadas no roteiro, então isto é o caso
 * normal; se a Vera refez o corte com bordas novas, o plano não serve mais e
 * o diretor planeja de novo (como antes da tela de roteiro).
 */
export function planoAprovadoDoCorte(t: TrechoComMontagem, inicio: number, fim: number): RoteiroDoCorte | null {
  const r = t.roteiro;
  if (!r?.plano || !r.fala?.palavras?.length) return null;
  if (Math.abs(r.inicio - inicio) > 0.01 || Math.abs(r.fim - fim) > 0.01) return null;
  const e = t.edicao?.manter;
  if (e && (e.length !== r.manter.length || e.some((m, i) => Math.abs(m.de - r.manter[i].de) > 0.02 || Math.abs(m.ate - r.manter[i].ate) > 0.02))) return null;
  return r;
}

const agora = () => new Date().toISOString();
const hashCurto = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// ─────────────────────────────── gravação atômica ───────────────────────────────

/**
 * Grava o estado no trecho SÓ se o lido ainda é o mesmo (estado e `desde`):
 * duas passadas do cron sobrepostas não dirigem nem montam o mesmo corte duas
 * vezes. `midia` (opcional) é fundida em `clips[i].midia`.
 */
async function trocarEstado(
  videoJobId: string,
  indice: number,
  lido: MontagemDoCorte | null,
  novo: MontagemDoCorte,
  midia?: Record<string, unknown>
): Promise<boolean> {
  const json = JSON.stringify(novo);
  const midiaJson = JSON.stringify(midia ?? {});
  const n = await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(
      clips,
      ARRAY[${String(indice)}]::text[],
      (clips -> ${indice}::int)
        || jsonb_build_object('montagem', ${json}::jsonb)
        || jsonb_build_object('midia', COALESCE(clips -> ${indice}::int -> 'midia', '{}'::jsonb) || ${midiaJson}::jsonb)
    )
    WHERE id = ${videoJobId}
      AND jsonb_typeof(clips -> ${indice}::int) = 'object'
      AND COALESCE(clips -> ${indice}::int -> 'montagem' ->> 'estado', '') = ${lido?.estado ?? ""}
      AND COALESCE(clips -> ${indice}::int -> 'montagem' ->> 'desde', '') = ${lido?.desde ?? ""}`;
  if (n > 0) {
    await espelharNoCard(videoJobId, indice, novo);
    // A desistência por erro técnico avisa os admins, uma vez (01/10, parte 240).
    if (novo.estado === "sem-montagem" && novo.falhaTecnica && lido?.estado !== "sem-montagem") {
      await avisarAdminsDaMontagem({ videoJobId, alvo: indice, motivo: novo.motivo ?? "sem detalhe" }).catch((e) =>
        console.error(`[montagem][${videoJobId}] aviso aos admins do corte ${indice} falhou:`, e)
      );
      // A DEVOLUÇÃO (02/10): a montagem do corte não foi entregue por erro nosso.
      await estornarEdicaoNaoEntregue({ videoId: videoJobId, alvo: indice, motivo: novo.motivo ?? "a montagem de efeitos falhou" }).catch((e) =>
        console.error(`[montagem][${videoJobId}] devolução do corte ${indice} falhou:`, e)
      );
    }
  }
  return n > 0;
}

/** O card do Vitor mostra o mesmo estado (como `montagem` no metadata), sem o plano inteiro. */
async function espelharNoCard(videoJobId: string, indice: number, m: MontagemDoCorte): Promise<void> {
  const json = JSON.stringify({ estado: m.estado, desde: m.desde, motivo: m.motivo ?? null, falhaTecnica: Boolean(m.falhaTecnica) });
  await prisma.$executeRaw`
    UPDATE campaign_cards
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('montagem', ${json}::jsonb)
    WHERE "agentId" = 'vitor-video'
      AND metadata ->> 'videoJobId' = ${videoJobId}
      AND metadata ->> 'trechoIndice' = ${String(indice)}`.catch((e) =>
    console.error(`[montagem][${videoJobId}] espelhar no card ${indice} falhou:`, e)
  );
}

// ─────────────────────────────── 1. marcar ───────────────────────────────

/**
 * Chamado pelo `cortar-callback` (e pelo re-corte) quando cortes chegam.
 * Só marca. `indices` limita aos trechos daquele aviso.
 */
export async function marcarMontagensNaFila(videoJobId: string, indices?: number[]): Promise<number> {
  if (!montagemNaEdicaoLigada()) return 0;
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  const trechos = (video?.clips as unknown as TrechoComMontagem[] | null) ?? [];
  let marcados = 0;
  for (const [i, t] of trechos.entries()) {
    if (indices && !indices.includes(i)) continue;
    if (!t?.midia?.vertical?.url || t.midia.erro) continue;
    // A origem é o vertical CRU: se o vertical atual é a própria montagem, a
    // origem continua sendo o original guardado.
    const cru = t.montagem?.montadoUrl && t.midia.vertical.url === t.montagem.montadoUrl ? t.midia.verticalOriginal?.url : t.midia.vertical.url;
    if (!cru) continue;
    const origem = hashCurto(cru);
    if (t.montagem && t.montagem.origem === origem) continue;
    if (await trocarEstado(videoJobId, i, t.montagem ?? null, { estado: "na-fila", desde: agora(), origem })) marcados++;
  }
  return marcados;
}

// ─────────────────────────────── a fala ───────────────────────────────

/**
 * A fala limpa do trecho, no tempo do corte. Usa a edição GRAVADA no pedido
 * de corte (`clips[i].edicao`, lib/media/edicao-gravada.ts), que é exatamente
 * o que o worker emendou; sem ela (corte antigo), refaz com as mesmas funções.
 */
export async function falaDoCorte(p: {
  palavras: Word[];
  termos: string | null;
  inicio: number;
  fim: number;
  duracaoDaGravacao: number;
  edicao?: EdicaoDoTrecho | null;
  projectId?: string;
}): Promise<{ manter: { de: number; ate: number }[]; palavras: PalavraNoCorte[]; duracao: number }> {
  const todas = aplicarTermos(p.palavras, parseTermos(p.termos));
  let manter: { de: number; ate: number }[];
  const e = p.edicao;
  if (e && Math.abs(e.inicio - p.inicio) < 0.01 && Math.abs(e.fim - p.fim) < 0.01 && e.manter?.length) {
    manter = e.manter;
  } else {
    const janela = todas.filter((w) => w.end > p.inicio - 2 && w.start < p.fim + 2);
    const hes = await detectarHesitacao(janela, { projectId: p.projectId }).catch(() => []);
    const remocoes = emendarNoSilencio(
      unirRemocoes(
        unirRemocoes(unirRemocoes(detectarPausas(todas, p.duracaoDaGravacao), detectarFalsosComecos(todas)), detectarMuletasArrastadas(todas)),
        unirRemocoes(detectarRepeticoes(todas), limpezaParaRemocoes(hes, janela))
      ),
      todas
    );
    manter = intervalosDoTrecho(remocoes, p.inicio, p.fim, todas);
  }
  const palavras: PalavraNoCorte[] = [];
  for (const w of todas) {
    if (w.start < p.inicio || w.start > p.fim) continue;
    const a = noTempoDoCorte(w.start, p.inicio, manter);
    if (a === null) continue;
    const b = noTempoDoCorte(w.end, p.inicio, manter) ?? a + Math.min(0.4, w.end - w.start);
    palavras.push({ texto: w.word, inicio: +a.toFixed(3), fim: +Math.max(a + 0.05, b).toFixed(3) });
  }
  return { manter, palavras, duracao: +duracaoDosIntervalos(manter).toFixed(3) };
}

// ─────────────────────────────── o passo ───────────────────────────────

export type VideoDoPasso = {
  id: string;
  projectId: string;
  blobUrl: string;
  durationSec: number | null;
  clips: unknown;
  transcript: unknown;
  project: { niche: string | null; colorPalette: string | null; logoUrl: string | null; videoEstiloEscolha: unknown; videoStyle: string | null; videoTerms: string | null; videoMusicUrl?: string | null };
};

/**
 * As MESMAS bordas do corte simples (lib/media/bordas-do-corte.ts), e não uma
 * cópia com arredondamento (30/09). A cópia fazia 769,07 s virar 770 s e o
 * corte montado levava quase um segundo da frase seguinte ("...as
 * ferramentas. Hoje você"), mesmo depois de o corte simples estar certo.
 */
function bordas(t: TrechoComMontagem, video: Pick<VideoDoPasso, "transcript">) {
  return bordasDoCorte(t, ((video.transcript as { words?: Word[] } | null)?.words ?? []) as Word[]);
}

function contexto(video: VideoDoPasso, t: TrechoComMontagem) {
  const pessoa = t.midia?.enquadramento?.pessoa ?? { x: 0.2, y: 0, w: 0.6, h: 1 };
  const rosto = t.midia?.recorte?.rosto ?? { x: pessoa.x + pessoa.w * 0.3, y: pessoa.y + 0.1, w: pessoa.w * 0.4, h: 0.3 };
  const escolha = normalizarEscolha(video.project.videoEstiloEscolha, video.project.videoStyle);
  const familia = familiaDaLinguagem(escolha.estiloId);
  // A legenda escolhida (30/09) é lida AGORA, na hora de montar: quem trocou
  // para "sem legenda" depois de aprovar o roteiro ainda recebe o corte sem.
  return { pessoa, rosto, escolha, familia, marca: coresDaMarca(video.project.colorPalette), legenda: legendaDecidida(escolha.legenda, familia) };
}

/** Teto de texto no corte curto (02/10): 5 por minuto, 6 s entre dois. */
const TEXTO_NA_TELA_DO_CORTE = { porMinuto: 5, espacoSeg: 6 };

/**
 * AS GUARDAS DO CORTE (02/10, as do completo em lib/media/guardas-do-completo.ts):
 * nada cobre o que a pessoa está mostrando (a fala que aponta, confirmada
 * pelos quadros do próprio corte), e nada de inserção relâmpago nem de imagem
 * inventada no lugar de algo real da pessoa. Só tira inserção.
 */
export async function guardasDoCorte(
  plano: PlanoDeMontagem,
  fala: { palavras: PalavraNoCorte[]; duracao: number },
  obterQuadros: ObterQuadros,
  projectId?: string | null
) {
  const demonstracao = await detectarDemonstracao({ plano, palavras: fala.palavras, duracao: fala.duracao, obterQuadros, projectId });
  const semDemo = tirarCoberturaDaDemonstracao(plano, fala.palavras, fala.duracao, demonstracao);
  const sustenta = semInsercaoQueNaoSeSustenta(semDemo.plano, fala.palavras, fala.duracao);
  // POUCAS PALAVRAS NA TELA também no corte (02/10): o corte 0 do completo
  // reprovado tinha texto em 31 de 37 cenas, um por frase.
  const texto = limitarTextoNaTela(sustenta.plano, fala.palavras, fala.duracao, TEXTO_NA_TELA_DO_CORTE);
  return { plano: texto.plano, demonstracao, decisoes: [...semDemo.decisoes, ...sustenta.decisoes, ...texto.decisoes] };
}

/** na-fila -> dirigindo -> gerando: diretor, imagens e pedidos da Higgsfield. */
async function dirigir(video: VideoDoPasso, indice: number, t: TrechoComMontagem, lido: MontagemDoCorte): Promise<void> {
  const tomado: MontagemDoCorte = { ...lido, estado: "dirigindo", desde: agora() };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  try {
    const { inicio, fim } = bordas(t, video);
    const ctx = contexto(video, t);
    // O plano que o cliente aprovou (e ajustou) na tela de roteiro: o diretor
    // já foi pago antes da aprovação, e chamar de novo jogaria fora os ajustes.
    const aprovado = planoAprovadoDoCorte(t, inicio, fim);
    const fala = aprovado ? { manter: aprovado.manter, palavras: aprovado.fala.palavras, duracao: aprovado.fala.duracao } : await falaDoCorte({
      palavras: ((video.transcript as { words?: Word[] } | null)?.words ?? []) as Word[],
      termos: video.project.videoTerms,
      inicio,
      fim,
      duracaoDaGravacao: video.durationSec ?? fim,
      edicao: t.edicao,
      projectId: video.projectId,
    });
    // O catálogo de recortes do projeto: o diretor reaproveita pela descrição.
    const recortesProntos = aprovado ? [] : (await recortesDoProjeto(video.projectId)).map((x) => x.descricao);
    const direcao = aprovado ? { plano: aprovado.plano! } : await dirigirMontagem({
      recortesProntos,
      projectId: video.projectId,
      referencia: `${video.id}/${indice}`,
      palavras: fala.palavras,
      duracao: fala.duracao,
      formato: "9:16",
      rosto: ctx.rosto,
      pessoa: ctx.pessoa,
      escolha: video.project.videoEstiloEscolha,
      videoStyle: video.project.videoStyle,
      colorPalette: video.project.colorPalette,
      nicho: video.project.niche,
      titulo: t.titulo,
    });
    // AS GUARDAS DE 02/10 (lib/media/guardas-do-completo.ts), antes de pagar
    // as imagens: nada cobre o que a pessoa está mostrando (a fala que aponta,
    // confirmada pelos quadros do próprio corte) e nada de inserção relâmpago
    // ou de imagem inventada no lugar de algo real da pessoa.
    const original = t.midia?.verticalOriginal?.url && lido.montadoUrl && t.midia?.vertical?.url === lido.montadoUrl ? t.midia.verticalOriginal.url : t.midia?.vertical?.url;
    direcao.plano = (await guardasDoCorte(direcao.plano, fala, original ? quadrosPeloWorker(original) : async () => [], video.projectId)).plano;
    const { assets, papelUrl } = await gerarAssetsDaMontagem(direcao.plano, {
      familia: ctx.familia,
      marca: ctx.marca,
      referencia: video.id,
      palavras: fala.palavras,
      duracao: fala.duracao,
      camera: ctx.escolha.camera[0] ?? null,
      cameras: ctx.escolha.camera,
      estiloId: ctx.escolha.estiloId,
      projectId: video.projectId,
      // A capa é um quadro real do corte: dela sai o cenário sem a pessoa.
      quadroDoNarradorUrl: t.midia?.capa?.url ?? null,
      ctx: { projectId: video.projectId, operation: "montagem" },
      // Zero: consulta uma vez e volta. Quem olha de novo é a próxima passada.
      prazoDasCenasMs: 0,
    });
    await trocarEstado(video.id, indice, tomado, {
      ...tomado,
      estado: "gerando",
      desde: agora(),
      // O gancho aprovado (01/10) só vale com a fala aprovada: os tempos dele são dela.
      // FRASE INTEIRA (02/10): o gancho aprovado vira a frase que o contém, ou sai.
      plano: { ...direcao.plano, fala, gancho: aprovado?.gancho && !aprovado.gancho.desligado ? ganchoEmFraseInteira(fala.palavras, { inicio: aprovado.gancho.inicio, fim: aprovado.gancho.fim, soco: limparSoco(aprovado.gancho.soco) ?? "" }) : null },
      assets,
      papelUrl,
      custoUsd: +assets.reduce((s, a) => s + a.custoEstimadoUsd, 0).toFixed(3),
      motivo: null,
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falhou";
    console.error(`[montagem][${video.id}] dirigir o corte ${indice}:`, erro);
    // Uma nova chance automática ao diretor (JSON quebrado, API instável),
    // depois de um respiro; na segunda falha o corte segue sem montagem.
    const falhas = (lido.tentativasDoDiretor ?? 0) + 1;
    await trocarEstado(
      video.id,
      indice,
      tomado,
      falhas < 2
        ? { ...lido, estado: "na-fila", desde: agora(), tentativasDoDiretor: falhas, esperarAte: depois(2 * 60_000), motivo: null }
        : { ...tomado, estado: "sem-montagem", desde: agora(), tentativasDoDiretor: falhas, motivo: `O diretor não conseguiu montar este corte (${erro.slice(0, 140)}).`, falhaTecnica: true }
    );
  }
}

/**
 * As dimensões da gravação, pelo quadro da capa (que é um quadro inteiro dela,
 * já em pé quando a gravação é de celular: o worker gira ao decodificar).
 *
 * É uma ESTIMATIVA, e não precisa ser mais que isso: a capa antiga sai reduzida
 * a 1280 de largura, e a reserva de 1920x1080 erra de vez numa gravação em pé
 * (30/09). Quem manda é o worker: `ajustarAFonteReal` (worker/src/montagem.mjs)
 * mede o narrador que ele mesmo gerou e corrige o recorte antes do render.
 */
export async function dimensoesDaGravacao(capaUrl: string | undefined): Promise<{ largura: number; altura: number }> {
  if (capaUrl) {
    try {
      const r = await fetch(capaUrl, { signal: AbortSignal.timeout(20_000) });
      const meta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
      if (meta.width && meta.height) return { largura: meta.width, altura: meta.height };
    } catch {
      /* cai no padrão */
    }
  }
  return { largura: 1920, altura: 1080 };
}

/** gerando -> montando: cenas prontas (ou prazo), resolve e manda ao worker. */
async function montar(video: VideoDoPasso, indice: number, t: TrechoComMontagem, lido: MontagemDoCorte): Promise<void> {
  // Nova tentativa depois de uma falha: espera o respiro combinado.
  if (lido.esperarAte && Date.now() < new Date(lido.esperarAte).getTime()) return;
  const assets = (lido.assets as AssetGerado[] | undefined) ?? [];
  const idade = Date.now() - new Date(lido.desde).getTime();
  // Uma consulta de status por cena pendente, e só.
  let mudou = false;
  for (const a of assets) {
    if (!ASSETS_EM_VIDEO.includes(a.tipo) || a.url || a.origem !== "pendente" || !a.chave) continue;
    const pronto = await concluirSePronto(video.id, a.chave, { projectId: video.projectId, operation: "montagem-cena" }).catch(() => null);
    if (pronto?.blobUrl) {
      a.url = pronto.blobUrl;
      a.origem = "gerado";
      mudou = true;
    } else if (["failed", "nsfw", "canceled", "cancelled"].includes(pronto?.status ?? "")) {
      a.origem = "falhou";
      mudou = true;
    }
  }
  const pendentes = assets.filter((a) => ASSETS_EM_VIDEO.includes(a.tipo) && a.origem === "pendente");
  if (pendentes.length && idade < PRAZO_DAS_CENAS_MS) {
    if (mudou) await trocarEstado(video.id, indice, lido, { ...lido, assets });
    return;
  }

  let tomado: MontagemDoCorte = { ...lido, assets, estado: "montando", desde: agora(), tentativas: (lido.tentativas ?? 0) + 1 };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  const marcado = tomado;
  try {
    // A CONFERÊNCIA DAS IMAGENS contra o perfil do projeto (02/10), uma vez:
    // a reprovada perde a URL e a cena volta à pessoa na resolução.
    if (!tomado.assetsConferidos && assets.length) {
      const perfil = await perfilDoProjeto(video.projectId).catch(() => null);
      const c = await conferirAssets(assets, { perfil, projectId: video.projectId, quadroDoVideo: (url) => quadrosPeloWorker(url, 512), pedidos: pedidosDoCliente(tomado.plano as PlanoDeMontagem) }).catch(() => null);
      if (c) tomado = { ...tomado, assets: c.assets, assetsConferidos: { em: agora(), reprovados: c.reprovados, ...(c.erro ? { erro: c.erro } : {}) } };
    }
    const { corpo, chave } = await pedidoDoCorte(video, indice, t, tomado);
    const worker = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
    if (!worker) throw new Error("VIDEO_WORKER_URL não configurado");
    const r = await fetch(`${worker}/montar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status !== 202) throw new Error(`worker recusou a montagem (HTTP ${r.status})`);
    await trocarEstado(video.id, indice, marcado, { ...tomado, chave });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falhou";
    console.error(`[montagem][${video.id}] mandar montar o corte ${indice}:`, erro);
    await trocarEstado(video.id, indice, marcado, {
      ...tomado,
      estado: tomado.tentativas! >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
      desde: agora(),
      esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
      motivo: tomado.tentativas! >= MAX_TENTATIVAS ? `Não consegui mandar a montagem ao worker (${erro.slice(0, 140)}).` : null,
      falhaTecnica: tomado.tentativas! >= MAX_TENTATIVAS,
    });
  }
}

/**
 * O PEDIDO AO WORKER de um corte (02/10, separado de `montar` para a prova
 * local refazer o mesmo pedido sem gravar nada): a montagem resolvida com os
 * assets que passaram na conferência, a fala, o gancho e a trilha.
 */
export async function pedidoDoCorte(video: VideoDoPasso, indice: number, t: TrechoComMontagem, tomado: MontagemDoCorte): Promise<{ corpo: string; chave: string }> {
  const assetsConferidos = (tomado.assets as AssetGerado[] | undefined) ?? [];
  const plano = tomado.plano as PlanoDeMontagem & {
    fala: { manter: { de: number; ate: number }[]; palavras: PalavraNoCorte[]; duracao: number };
    gancho?: { inicio: number; fim: number; soco: string } | null;
  };
  const ctx = contexto(video, t);
  const { inicio, fim } = bordas(t, video);
  const fonte = await dimensoesDaGravacao(t.midia?.capa?.url);
  // A cena gerada que não chegou (ou foi reprovada) some da resolução: o
  // layout dela vira narrador cheio (resolverMontagem trata asset sem URL).
  const { montagem } = resolverMontagem(plano, {
    palavras: plano.fala.palavras,
    duracao: plano.fala.duracao,
    fonte,
    rosto: ctx.rosto,
    pessoa: ctx.pessoa,
    marca: { ...ctx.marca, logoUrl: video.project.logoUrl },
    familia: ctx.familia,
    urls: urlsDosAssets(assetsConferidos),
    papelUrl: tomado.papelUrl ?? null,
    legenda: ctx.legenda,
    // O estilo e o sound design (01/10): o Remotion e o worker leem daqui.
    estiloId: ctx.escolha.estiloId,
  });
  const chave = `cortes/${video.id}/montado-${indice}.mp4`;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const corpo = JSON.stringify({
    chave,
    videoJobId: video.id,
    montagem,
    sourceUrl: video.blobUrl,
    inicio,
    duracao: fim - inicio,
    manter: plano.fala.manter,
    pessoa: ctx.pessoa,
    // O GANCHO do corte curto (01/10): a frase forte de 3 a 5 s, no tempo do
    // corte, que o worker toca antes do começo com zoom, flash e som. Worker
    // antigo ignora o campo e o corte sai sem gancho, sem quebrar.
    gancho: plano.gancho ? { ...plano.gancho, familia: ctx.familia, acento: ctx.marca.acento, escuro: ctx.marca.escuro, passagem: bibliaDoEstilo(ctx.escolha.estiloId).abertura.passagem } : null,
    // A TRILHA do projeto (01/10): o corte montado nascia sem a música que o
    // corte simples tinha; o worker mistura no volume do estilo e encaixa os
    // cortes na batida dela. Worker antigo ignora o campo.
    trilha: video.project.videoMusicUrl ? { url: video.project.videoMusicUrl, ...somDaTrilha(video) } : null,
    // A TERCEIRA tentativa vai leve (01/10, parte 240): duas abas do Chrome
    // em vez de quatro. Worker antigo ignora o campo.
    leve: (tomado.tentativas ?? 1) >= MAX_TENTATIVAS,
    callbackUrl: `${base}/api/videos/${video.id}/montar-callback`,
    // Volta no corpo do callback (assinado): o callback só troca o vídeo se
    // o corte ainda estiver neste mesmo "montando".
    retorno: { indice, desde: tomado.desde },
  });
  return { corpo, chave };
}

// ─────────────────────────────── 2b. o editor sob medida no corte ───────────────────────────────

/**
 * O EDITOR SOB MEDIDA NO CORTE (03/10), com EDITOR_SOB_MEDIDA ligado e o
 * estilo com referência: o mesmo caminho do completo
 * (lib/media/montagem-do-completo.ts), para o vídeo curto vertical. O editor
 * lê só a fala do trecho (a da edição gravada, já sem a frase errada e o
 * retake), escreve a edição em 9:16 com gancho nos primeiros 2 s e densidade
 * alta (lib/media/editor-sob-medida/corte.ts); a prévia vai ao worker pela
 * porta do completo (`trecho` no pedido), o revisor com visão olha, o editor
 * conserta até 2 vezes, e só vai ao ar o que passou.
 *
 * Mesmos estados de sempre, para a tela e a linha do tempo não mudarem:
 *   na-fila -> dirigindo (editor e inserções) -> montando (prévia; revisão;
 *   conserto e nova prévia; final) -> pronto.
 * QUALQUER FALHA volta o corte para "na-fila" com `sobMedida.desistiu`, e a
 * próxima passada monta pelo caminho de sempre (a reserva), sem travar.
 */
export type SobMedidaDoCorte = {
  fase: "editar" | "previa" | "revisar" | "final";
  estiloId: string;
  fala?: { manter: { de: number; ate: number }[]; palavras: PalavraNoCorte[]; duracao: number } | null;
  /** O quadro 9:16 dentro da gravação (fração) e o rosto já nele. */
  quadro?: Retangulo | null;
  rosto?: Retangulo | null;
  gancho?: { inicio: number; fim: number; soco: string } | null;
  editor?: EdicaoDoEditor | null;
  insercoes?: Record<string, { url: string; tipo: "imagem" | "video" }>;
  edicao?: EdicaoResolvida | null;
  rodada: number;
  historico: Array<{ rodada: number; quadros: number; nota: number | null; defeitos: Array<{ momento: string | null; t: number; tipo: string; descricao: string }>; falta: string[]; erro?: string | null }>;
  soIds?: string[] | null;
  previaUrl?: string | null;
  custoImagensUsd?: number;
  medidas?: Record<string, number>;
  avisos?: string[];
  /** O worker reiniciou com o pedido na fila: a próxima passada reenvia a mesma fase. */
  reenviar?: boolean;
  desistiu?: string | null;
};

/** Passos pesados (editor, revisão) rodando juntos numa passada do cron. */
const CORTES_EM_PARALELO = Math.max(1, Number(process.env.MONTAGEM_CORTES_EM_PARALELO ?? 3));
/** Prazo de cada chamada do editor no corte: uma tentativa só, a reserva cobre a falha. */
const PRAZO_DO_EDITOR_NO_CORTE_MS = 240_000;
/** Os quadros do corte para o editor não podem segurar a passada. */
const PRAZO_DOS_QUADROS_MS = 60_000;
const DURACAO_MAXIMA_DA_PECA: Record<string, number> = Object.fromEntries(PECAS.map((p) => [p.nome, p.duracao[1]]));
const DURACAO_MINIMA_DA_PECA: Record<string, number> = Object.fromEntries(PECAS.map((p) => [p.nome, p.duracao[0]]));

function comPrazo<T>(p: Promise<T>, ms: number, reserva: T): Promise<T> {
  return Promise.race([p.catch(() => reserva), new Promise<T>((ok) => setTimeout(() => ok(reserva), ms))]);
}

function sobMedidaDe(m: MontagemDoCorte | null | undefined): SobMedidaDoCorte | null {
  return (m?.sobMedida as SobMedidaDoCorte | null | undefined) ?? null;
}

/** O corte vai pelo editor sob medida? Ligado, estilo com referência, e o caminho novo não desistiu neste corte. */
export function corteVaiSobMedida(video: Pick<VideoDoPasso, "project">, m: MontagemDoCorte | null | undefined): boolean {
  const escolha = normalizarEscolha(video.project.videoEstiloEscolha, video.project.videoStyle);
  return editorSobMedidaLigado(escolha.estiloId) && !sobMedidaDe(m)?.desistiu;
}

/** O caminho novo desiste e o corte volta à fila, para a montagem de sempre (a reserva). */
async function desistirDoCorteSobMedida(id: string, indice: number, lido: MontagemDoCorte, motivo: string): Promise<void> {
  console.warn(`[montagem][${id}] corte ${indice}: editor sob medida desistiu: ${motivo}`);
  const sm = sobMedidaDe(lido) ?? { fase: "editar", estiloId: "", rodada: 0, historico: [] };
  await trocarEstado(id, indice, lido, {
    ...lido,
    estado: "na-fila",
    desde: agora(),
    trabalhando: false,
    candidato: null,
    tentativas: 0,
    esperarAte: null,
    motivo: null,
    sobMedida: { ...sm, reenviar: false, desistiu: motivo.slice(0, 300) },
  });
}

/** A edição resolvida do corte: 1080x1920, o rosto no quadro do corte, a legenda só se o cliente quer, e os buracos curtos fechados. */
export function resolverCorteSobMedida(
  video: Pick<VideoDoPasso, "project">,
  t: TrechoComMontagem,
  sm: SobMedidaDoCorte,
  editor: EdicaoDoEditor,
  insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>
): { edicao: EdicaoResolvida; avisos: string[] } {
  const ctx = contexto(video as VideoDoPasso, t);
  const r = resolverEdicao(editor, {
    palavras: sm.fala!.palavras,
    duracao: sm.fala!.duracao,
    largura: 1080,
    altura: 1920,
    tema: { ...temaDoEstilo(sm.estiloId, ctx.marca), escuroLegenda: "#06111F" },
    rosto: sm.rosto ?? { x: 0.3, y: 0.2, w: 0.4, h: 0.25 },
    estiloId: sm.estiloId,
    // A escolha "sem legenda" do cliente vale aqui também (lida AGORA, na hora de montar).
    comLegenda: ctx.legenda.mostrar,
    logoUrl: video.project.logoUrl ?? null,
    insercoes,
  });
  const ar = arejarCorte(r.edicao, DURACAO_MINIMA_DA_PECA);
  const a = adensarCorte(ar.edicao, DURACAO_MAXIMA_DA_PECA);
  return { edicao: a.edicao, avisos: [...r.avisos, ...ar.mudancas, ...(a.esticadas ? [`adensar: ${a.esticadas} peça(s) esticada(s) até a próxima`] : [])] };
}

/** O que o editor recebe para um corte. */
export async function entradaDoCorte(
  video: VideoDoPasso,
  indice: number,
  t: TrechoComMontagem,
  sm: SobMedidaDoCorte,
  quadros: Array<{ t: number; base64: string }>
): Promise<EntradaDoEditor> {
  const ctx = contexto(video, t);
  const perfil = await perfilDoProjeto(video.projectId).catch(() => null);
  const tema = temaDoEstilo(sm.estiloId, ctx.marca);
  const fala = sm.fala!;
  return {
    palavras: fala.palavras,
    frases: frasesNumeradas(fala.palavras),
    duracao: fala.duracao,
    formato: "9:16",
    referencia: referenciaParaOEditor(sm.estiloId).texto,
    perfil: [perfilNoPrompt(perfil), `MARCA: cores ${ctx.marca.acento} (acento) e ${ctx.marca.escuro} (escuro); acabamento ${tema.visual}, letra de título ${tema.fonteTitulo}. Logo: ${video.project.logoUrl ? "sim" : "não"}.`].join("\n"),
    roteiro: null,
    quadros,
    projectId: video.projectId,
    referenciaDeUso: `${video.id}/${indice}`,
    instrucoes: instrucoesDoCorte({ duracao: fala.duracao, titulo: t.titulo }),
    timeoutMs: PRAZO_DO_EDITOR_NO_CORTE_MS,
    tentativas: 1,
  };
}

/** O vertical cru do corte (sem a montagem): é dele que o editor vê os quadros. */
function verticalCru(t: TrechoComMontagem, lido: MontagemDoCorte): string | null {
  return t.midia?.verticalOriginal?.url && lido.montadoUrl && t.midia?.vertical?.url === lido.montadoUrl ? t.midia.verticalOriginal.url : t.midia?.vertical?.url ?? null;
}

/** na-fila -> dirigindo: a fala, o editor, as inserções e a resolução; depois a prévia vai ao worker. */
async function editarCorteSobMedida(video: VideoDoPasso, indice: number, t: TrechoComMontagem, lido: MontagemDoCorte): Promise<void> {
  // "dirigindo" parado (a função morreu no meio do editor): não paga o editor
  // de novo, vai para a reserva.
  if (lido.estado === "dirigindo") {
    await desistirDoCorteSobMedida(video.id, indice, lido, "o editor parou no meio");
    return;
  }
  const ctx = contexto(video, t);
  const sm0: SobMedidaDoCorte = { fase: "editar", estiloId: ctx.escolha.estiloId, rodada: 0, historico: [] };
  const tomado: MontagemDoCorte = { ...lido, estado: "dirigindo", desde: agora(), trabalhando: true, motivo: null, sobMedida: sm0 };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  try {
    const { inicio, fim } = bordas(t, video);
    // A fala LIMPA do trecho: a aprovada no roteiro, ou a da edição gravada
    // (lib/media/pedido-de-corte.ts já tirou a frase errada e o retake).
    const aprovado = planoAprovadoDoCorte(t, inicio, fim);
    const fala = aprovado
      ? { manter: aprovado.manter, palavras: aprovado.fala.palavras, duracao: aprovado.fala.duracao }
      : await falaDoCorte({
          palavras: ((video.transcript as { words?: Word[] } | null)?.words ?? []) as Word[],
          termos: video.project.videoTerms,
          inicio,
          fim,
          duracaoDaGravacao: video.durationSec ?? fim,
          edicao: t.edicao,
          projectId: video.projectId,
        });
    if (fala.palavras.length < 5 || fala.duracao < 5) throw new Error("fala curta demais para o editor");
    const fonte = await dimensoesDaGravacao(t.midia?.capa?.url);
    const quadro = quadroDoCorte(fonte, ctx.pessoa);
    const gancho = aprovado?.gancho && !aprovado.gancho.desligado ? ganchoEmFraseInteira(fala.palavras, { inicio: aprovado.gancho.inicio, fim: aprovado.gancho.fim, soco: limparSoco(aprovado.gancho.soco) ?? "" }) : null;
    const sm: SobMedidaDoCorte = { ...sm0, fala, quadro, rosto: noQuadroDoCorte(ctx.rosto, quadro), gancho };
    const cru = verticalCru(t, lido);
    const quadros = cru ? await comPrazo(quadrosPeloWorker(cru, 384)(instantesDoCorte(fala.duracao)), PRAZO_DOS_QUADROS_MS, []) : [];
    const entrada = await entradaDoCorte(video, indice, t, sm, quadros);
    const parte = await escreverBloco(entrada, { de: 0, ate: fala.duracao, f0: 0, f1: entrada.frases.length - 1 }, 0, 1);
    if (!parte.momentos.length) throw new Error(`o editor não devolveu edição (${parte.erro ?? "sem momentos"})`);
    const { erro: _erro, ...editor } = parte;
    void _erro;
    const ins = await gerarInsercoes(editor, { formato: "9:16", projectId: video.projectId, teto: 2 });
    const r = resolverCorteSobMedida(video, t, sm, editor, ins.insercoes);
    const novo: SobMedidaDoCorte = {
      ...sm,
      editor,
      insercoes: ins.insercoes,
      edicao: r.edicao,
      fase: "previa",
      custoImagensUsd: ins.custoUsd,
      medidas: { ...medidasDaEdicao(r.edicao), densidade: densidadeDoCorte(r.edicao) },
      avisos: r.avisos.slice(0, 30),
    };
    await enviarCorteSobMedida(video, indice, t, { ...tomado, trabalhando: false, custoUsd: ins.custoUsd, sobMedida: novo }, tomado);
  } catch (e) {
    await desistirDoCorteSobMedida(video.id, indice, tomado, `o editor falhou (${e instanceof Error ? e.message.slice(0, 200) : e})`);
  }
}

/**
 * O PEDIDO AO WORKER de um corte sob medida (separado para a prova local
 * refazer o mesmo pedido): a porta do completo (`/montar-completo`) com
 * `trecho`, que emenda a fala limpa da gravação e recorta o quadro 9:16. A
 * trilha do projeto e o gancho aprovado entram só no final.
 */
export function pedidoDoCorteSobMedida(video: VideoDoPasso, indice: number, t: TrechoComMontagem, estado: MontagemDoCorte): { corpo: string; chave: string } {
  const sm = sobMedidaDe(estado)!;
  const final = sm.fase === "final";
  const ctx = contexto(video, t);
  const { inicio, fim } = bordas(t, video);
  const chave = final ? `cortes/${video.id}/montado-${indice}-sob-medida.mp4` : `cortes/${video.id}/previa-sob-medida-${indice}-${sm.rodada}.mp4`;
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const corpo = JSON.stringify({
    chave,
    videoJobId: video.id,
    // A porta do completo pede `completoUrl`; com `trecho`, o worker usa a gravação.
    completoUrl: video.blobUrl,
    trecho: { sourceUrl: video.blobUrl, inicio, duracao: fim - inicio, manter: sm.fala!.manter, pessoa: ctx.pessoa, quadro: sm.quadro },
    edicao: sm.edicao,
    escala: final ? 1 : 0.5,
    gancho: final && sm.gancho ? { ...sm.gancho, familia: ctx.familia, acento: ctx.marca.acento, escuro: ctx.marca.escuro, passagem: bibliaDoEstilo(sm.estiloId).abertura.passagem } : null,
    trilha: final && video.project.videoMusicUrl ? { url: video.project.videoMusicUrl, ...somDaTrilha(video) } : null,
    callbackUrl: `${base}/api/videos/${video.id}/montar-callback`,
    retorno: { indice, desde: estado.desde },
  });
  return { corpo, chave };
}

/** Manda a prévia (metade da resolução) ou o final ao worker. */
async function enviarCorteSobMedida(video: VideoDoPasso, indice: number, t: TrechoComMontagem, estado: MontagemDoCorte, lido: MontagemDoCorte): Promise<void> {
  const sm = sobMedidaDe(estado)!;
  const tomado: MontagemDoCorte = { ...estado, estado: "montando", desde: agora(), tentativas: (estado.tentativas ?? 0) + 1, candidato: null, trabalhando: false, sobMedida: { ...sm, reenviar: false } };
  if ((tomado.tentativas ?? 0) > MAX_TENTATIVAS + 2) {
    await desistirDoCorteSobMedida(video.id, indice, lido, "envios demais ao worker");
    return;
  }
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  try {
    const worker = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
    if (!worker) throw new Error("VIDEO_WORKER_URL não configurado");
    const { corpo, chave } = pedidoDoCorteSobMedida(video, indice, t, tomado);
    const r = await fetch(`${worker}/montar-completo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status !== 202) throw new Error(`worker recusou a edição sob medida do corte (HTTP ${r.status})`);
    await trocarEstado(video.id, indice, tomado, { ...tomado, chave });
  } catch (e) {
    await desistirDoCorteSobMedida(video.id, indice, tomado, e instanceof Error ? e.message : "envio falhou");
  }
}

/** A prévia voltou: o revisor olha; com defeito, o editor conserta (até 2 rodadas); o que ainda tem defeito sai; vai o final. */
async function revisarCorteSobMedida(video: VideoDoPasso, indice: number, t: TrechoComMontagem, lido: MontagemDoCorte): Promise<void> {
  // Revisão parada no meio (a função morreu): reserva, sem pagar de novo.
  if (lido.trabalhando) {
    await desistirDoCorteSobMedida(video.id, indice, lido, "a revisão da prévia parou no meio");
    return;
  }
  const tomado: MontagemDoCorte = { ...lido, trabalhando: true, desde: agora() };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  const sm = sobMedidaDe(lido)!;
  try {
    const frases = frasesNumeradas(sm.fala!.palavras);
    const ref = referenciaParaOEditor(sm.estiloId);
    const rev = await revisarPrevia({
      edicao: sm.edicao!,
      frases,
      obterQuadros: quadrosPeloWorker(sm.previaUrl!, 360),
      referencia: `${ref.texto.slice(0, 1800)}\nQuadros típicos: ${ref.quadros.join(" | ")}\nÉ um CORTE VERTICAL 9:16 para Reels, Shorts e TikTok: texto encostado na borda, ou na faixa da direita e no rodapé (a interface da rede), é defeito "ilegivel".`,
      soIds: sm.soIds ?? null,
      projectId: video.projectId,
      passo: 6,
    });
    // SÓ VAI AO AR O QUE PASSOU: sem olhar nenhum quadro, nada passou.
    if (rev.erro && !rev.quadros) throw new Error(`o revisor não olhou a prévia (${rev.erro})`);
    const historico = [
      ...sm.historico,
      { rodada: sm.rodada, quadros: rev.quadros, nota: rev.nota, defeitos: rev.defeitos.map((d) => ({ momento: d.momento, t: d.t, tipo: d.tipo, descricao: d.descricao })), falta: rev.falta, erro: rev.erro ?? null },
    ].slice(-6);
    let editor = sm.editor!;
    if (rev.defeitos.length && sm.rodada < 2) {
      const entrada = await entradaDoCorte(video, indice, t, sm, []);
      const quadrosDoDefeito = rev.olhados.filter((q) => rev.defeitos.some((d) => Math.abs(d.t - q.t) < 0.05));
      editor = (await consertarEdicao(entrada, editor, rev.defeitos, quadrosDoDefeito)).edicao;
      const soIds = [...new Set(rev.defeitos.map((d) => d.momento).filter((x): x is string => Boolean(x)))];
      const r = resolverCorteSobMedida(video, t, sm, editor, sm.insercoes ?? {});
      const novo: SobMedidaDoCorte = { ...sm, editor, edicao: r.edicao, fase: "previa", rodada: sm.rodada + 1, soIds, historico, medidas: { ...medidasDaEdicao(r.edicao), densidade: densidadeDoCorte(r.edicao) } };
      await enviarCorteSobMedida(video, indice, t, { ...tomado, trabalhando: false, sobMedida: novo }, tomado);
      return;
    }
    const reprovadas = new Set(rev.defeitos.map((d) => d.momento).filter((x): x is string => Boolean(x)));
    if (reprovadas.size) editor = { ...editor, momentos: editor.momentos.filter((x) => !reprovadas.has(String(x.id))) };
    const r = resolverCorteSobMedida(video, t, sm, editor, sm.insercoes ?? {});
    const novo: SobMedidaDoCorte = { ...sm, editor, edicao: r.edicao, fase: "final", historico, soIds: null, medidas: { ...medidasDaEdicao(r.edicao), densidade: densidadeDoCorte(r.edicao) } };
    await enviarCorteSobMedida(video, indice, t, { ...tomado, trabalhando: false, tentativas: 0, sobMedida: novo }, tomado);
  } catch (e) {
    await desistirDoCorteSobMedida(video.id, indice, tomado, `a revisão da prévia falhou (${e instanceof Error ? e.message.slice(0, 200) : e})`);
  }
}

/** Roda os passos pesados com teto de paralelismo, começando só enquanto cabe na passada. */
async function emPiscina(tarefas: Array<() => Promise<void>>, teto: number, podeComecar: () => boolean): Promise<void> {
  const fila = [...tarefas];
  await Promise.all(
    Array.from({ length: Math.min(teto, fila.length) }, async () => {
      while (fila.length && podeComecar()) {
        const tarefa = fila.shift()!;
        await tarefa().catch((e) => console.error("[montagem] passo pesado:", e));
      }
    })
  );
}

/** O passo do cron. Orçamento próprio; devolve contagens para o log. */
export async function avancarMontagens(opcoes: { orcamentoMs?: number } = {}): Promise<{ olhados: number; dirigidos: number; enviados: number } | null> {
  if (!montagemNaEdicaoLigada()) return null;
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 240_000;
  const r = { olhados: 0, dirigidos: 0, enviados: 0 };
  // Os passos pesados (diretor, editor sob medida, revisões) vão para uma
  // piscina com teto (03/10): cortes em paralelo, e nenhum começa depois dos
  // primeiros 90 s da passada, para caber no teto de 800 s do cron.
  const pesados: Array<() => Promise<void>> = [];
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM video_jobs
    WHERE "createdAt" > now() - interval '7 days'
      AND clips IS NOT NULL
      AND jsonb_typeof(clips) = 'array'
      AND jsonb_path_exists(clips, '$[*].montagem.estado ? (@ == "na-fila" || @ == "dirigindo" || @ == "gerando" || @ == "montando")')
    ORDER BY "createdAt" DESC
    LIMIT 30`;
  for (const { id } of ids) {
    if (Date.now() - inicio > orcamento) break;
    const video = (await prisma.videoJob.findUnique({
      where: { id },
      select: {
        id: true, projectId: true, blobUrl: true, durationSec: true, clips: true, transcript: true,
        project: { select: { niche: true, colorPalette: true, logoUrl: true, videoEstiloEscolha: true, videoStyle: true, videoTerms: true, videoMusicUrl: true } },
      },
    })) as VideoDoPasso | null;
    if (!video) continue;
    const trechos = (video.clips as TrechoComMontagem[] | null) ?? [];
    for (const [i, t] of trechos.entries()) {
      // O diretor e as imagens levam de 2 a 6 min (com a revisão do diretor):
      // só começa um corte novo nos primeiros 90 s da passada, para a soma com
      // a fila de campanhas caber no teto de 800 s do cron.
      if (Date.now() - inicio > orcamento - 150_000) break;
      const m = t?.montagem;
      if (!m) continue;
      const idade = Date.now() - new Date(m.desde).getTime();
      try {
        const esperando = Boolean(m.esperarAte && Date.now() < new Date(m.esperarAte).getTime());
        const sm = sobMedidaDe(m);
        const sobMedidaVivo = Boolean(sm && !sm.desistiu);
        if ((m.estado === "na-fila" && !esperando) || (m.estado === "dirigindo" && idade > PASSO_MORTO_MS)) {
          r.olhados++;
          r.dirigidos++;
          // O EDITOR SOB MEDIDA (03/10); a montagem de sempre é a reserva.
          // No "dirigindo" morto, só volta ao editor quem estava nele.
          const novo = m.estado === "na-fila" ? corteVaiSobMedida(video, m) : sobMedidaVivo;
          pesados.push(() => (novo ? editarCorteSobMedida(video, i, t, m) : dirigir(video, i, t, m)));
        } else if (m.estado === "montando" && sobMedidaVivo && sm!.reenviar && !esperando) {
          // O worker reiniciou com a prévia ou o final na fila: reenvia a mesma fase.
          r.olhados++;
          await enviarCorteSobMedida(video, i, t, m, m);
          r.enviados++;
        } else if (m.estado === "montando" && sobMedidaVivo && sm!.fase === "revisar" && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
          r.olhados++;
          pesados.push(() => revisarCorteSobMedida(video, i, t, m));
        } else if (m.estado === "montando" && sobMedidaVivo && idade > PRAZO_DO_RENDER_MS) {
          r.olhados++;
          await desistirDoCorteSobMedida(video.id, i, m, "o render da edição sob medida não terminou no prazo");
        } else if (m.estado === "gerando") {
          r.olhados++;
          await montar(video, i, t, m);
          r.enviados++;
        } else if (m.estado === "montando" && m.revisaoVisual?.pendente && m.candidato && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
          // A revisão visual do corte pronto (02/10).
          r.olhados++;
          pesados.push(() => revisarCorte(video, i, m));
        } else if (m.estado === "montando" && sobMedidaVivo) {
          // A edição sob medida está no worker: espera o callback.
        } else if (m.estado === "montando" && idade > PRAZO_DO_RENDER_MS) {
          r.olhados++;
          // Sem callback no prazo: volta para "gerando" (reenvia) ou desiste.
          await trocarEstado(video.id, i, m, {
            ...m,
            estado: (m.tentativas ?? 1) >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
            desde: agora(),
            esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
            motivo: (m.tentativas ?? 1) >= MAX_TENTATIVAS ? "O render não terminou no prazo. O corte segue com a edição simples." : null,
            falhaTecnica: (m.tentativas ?? 1) >= MAX_TENTATIVAS,
          });
        }
      } catch (e) {
        console.error(`[montagem][${id}] corte ${i}:`, e);
      }
    }
  }
  await emPiscina(pesados, CORTES_EM_PARALELO, () => Date.now() - inicio < orcamento - 150_000);
  return r;
}

// ─────────────────────────────── 3. o callback ───────────────────────────────

/**
 * O worker terminou (ou falhou). Troca o vertical pela montagem, guardando o
 * original, e move os posts que ainda não saíram. Idempotente: só age se o
 * corte ainda está "montando" no mesmo `desde` que foi mandado.
 */
export async function concluirMontagem(
  videoJobId: string,
  indice: number,
  desde: string,
  resultado: { ok?: boolean; montado?: { url: string; bytes: number }; tempos?: Record<string, number>; erro?: string; reiniciado?: boolean }
): Promise<"trocado" | "ignorado" | "falhou"> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  const t = ((video?.clips as unknown as TrechoComMontagem[] | null) ?? [])[indice];
  const lido = t?.montagem;
  if (!t || !lido || lido.estado !== "montando" || lido.desde !== desde) return "ignorado";

  // O EDITOR SOB MEDIDA (03/10): a prévia volta para o revisor; o final já
  // passou pela revisão da prévia e vai ao ar. Reinício do worker reenvia a
  // mesma fase; falha de render volta à montagem de sempre (a reserva).
  const sm = sobMedidaDe(lido);
  if (sm && !sm.desistiu) {
    if (resultado.reiniciado) {
      await trocarEstado(videoJobId, indice, lido, { ...lido, desde: agora(), tentativas: Math.max(0, (lido.tentativas ?? 1) - 1), sobMedida: { ...sm, reenviar: true } });
      return "falhou";
    }
    if (!resultado.ok || !resultado.montado?.url) {
      await desistirDoCorteSobMedida(videoJobId, indice, lido, `o render da edição sob medida falhou (${resumoDoErro(resultado.erro ?? "sem detalhe")})`);
      return "falhou";
    }
    if (sm.fase === "previa") {
      const ok = await trocarEstado(videoJobId, indice, lido, { ...lido, desde: agora(), trabalhando: false, sobMedida: { ...sm, fase: "revisar", previaUrl: resultado.montado.url } });
      return ok ? "trocado" : "ignorado";
    }
    return entregarCorte(
      videoJobId,
      indice,
      t,
      { ...lido, revisaoVisual: { rodadas: sm.rodada, historico: [], pendente: false, final: true, motivo: "editor sob medida: revisado na prévia" } },
      resultado.montado,
      resultado.tempos
    );
  }

  // O WORKER REINICIOU (deploy, 01/10): o render não falhou, foi cortado no
  // meio. Volta para "gerando" sem espera e sem gastar tentativa, e a próxima
  // passada do cron reenvia ao worker novo.
  if (resultado.reiniciado) {
    await trocarEstado(videoJobId, indice, lido, {
      ...lido,
      estado: "gerando",
      desde: agora(),
      tentativas: Math.max(0, (lido.tentativas ?? 1) - 1),
      esperarAte: undefined,
      motivo: null,
    });
    return "falhou";
  }
  if (!resultado.ok || !resultado.montado?.url) {
    await trocarEstado(videoJobId, indice, lido, {
      ...lido,
      estado: (lido.tentativas ?? 1) >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
      desde: agora(),
      // O render falhou (memória, threads): a próxima tentativa espera o
      // worker respirar. Ele também só começa com o resto parado.
      esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
      // Começo e fim do erro: no ffmpeg a causa (ex.: "Resource temporarily
      // unavailable") costuma vir no FIM, e 140 caracteres a escondiam.
      motivo: `O render falhou (${resumoDoErro(resultado.erro ?? "sem detalhe")}).`,
      falhaTecnica: (lido.tentativas ?? 1) >= MAX_TENTATIVAS,
    });
    return "falhou";
  }

  // A REVISÃO VISUAL FINAL (02/10): o corte pronto vira candidato e o cron o
  // confere quadro a quadro antes de trocar o vertical (`revisarCorte`).
  if (revisaoVisualLigada() && !lido.revisaoVisual?.final) {
    const ok = await trocarEstado(videoJobId, indice, lido, {
      ...lido,
      desde: agora(),
      candidato: { url: resultado.montado.url, bytes: resultado.montado.bytes, tempos: resultado.tempos },
      revisaoVisual: { rodadas: lido.revisaoVisual?.rodadas ?? 0, historico: lido.revisaoVisual?.historico ?? [], pendente: true },
      trabalhando: false,
    });
    return ok ? "trocado" : "ignorado";
  }
  return entregarCorte(videoJobId, indice, t, lido, resultado.montado, resultado.tempos);
}

/** O corte vai ao ar: troca o vertical pela montagem e move os posts que ainda não saíram. */
async function entregarCorte(
  videoJobId: string,
  indice: number,
  t: TrechoComMontagem,
  lido: MontagemDoCorte,
  montado: { url: string; bytes: number },
  tempos?: Record<string, number>
): Promise<"trocado" | "ignorado"> {
  const resultado = { montado, tempos };
  // O original é sempre o vertical CRU (se o atual já é uma montagem antiga,
  // o original guardado continua sendo ele).
  const atual = t.midia?.vertical ?? null;
  const original = lido.montadoUrl && atual?.url === lido.montadoUrl ? t.midia?.verticalOriginal ?? atual : atual;
  const trocou = await trocarEstado(
    videoJobId,
    indice,
    lido,
    { ...lido, estado: "pronto", desde: agora(), montadoUrl: resultado.montado.url, tempos: resultado.tempos, motivo: null, falhaTecnica: false, candidato: null, trabalhando: false, ...(lido.revisaoVisual ? { revisaoVisual: { ...lido.revisaoVisual, pendente: false } } : {}) },
    { vertical: resultado.montado, verticalOriginal: original }
  );
  if (!trocou) return "ignorado";
  // A VERSÃO SEGURA foi ao ar (02/10): a montagem do corte volta em créditos.
  if (lido.revisaoVisual?.segura) {
    await estornarEdicaoNaoEntregue({ videoId: videoJobId, alvo: indice, motivo: lido.revisaoVisual.motivo ?? "a revisão visual entregou a versão segura, sem inserção" }).catch((e) =>
      console.error(`[montagem][${videoJobId}] devolução do corte ${indice} falhou:`, e)
    );
  }
  // O post aprovado antes guardou a URL do vertical em `imageUrl`: o que ainda
  // não saiu passa a apontar para a montagem; o publicado fica como está.
  for (const antiga of new Set([atual?.url, original?.url].filter(Boolean) as string[])) {
    await prisma.post.updateMany({
      where: { imageUrl: antiga, status: { notIn: ["published", "publishing"] } },
      data: { imageUrl: resultado.montado.url },
    });
  }
  return "trocado";
}

/**
 * A REVISÃO VISUAL DO CORTE (02/10), a mesma do completo
 * (lib/media/revisao-visual.ts): o gancho é a "abertura" do corte. Defeito
 * consertável volta a cena à pessoa (ou tira o gancho) e o worker refaz, até
 * 2 rodadas; sobrando, a versão segura sem inserção. Falha da revisão não
 * segura o corte.
 */
async function revisarCorte(video: VideoDoPasso, indice: number, lido: MontagemDoCorte): Promise<void> {
  const tomado: MontagemDoCorte = { ...lido, trabalhando: true, desde: agora() };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;
  const trechos = (video.clips as TrechoComMontagem[] | null) ?? [];
  const t = trechos[indice];
  const cand = lido.candidato!;
  const rv = (lido.revisaoVisual ?? { rodadas: 0, pendente: true, historico: [] }) as EstadoDaRevisaoVisual;
  const plano = lido.plano as PlanoDeMontagem & { fala: { manter: { de: number; ate: number }[]; palavras: PalavraNoCorte[]; duracao: number }; gancho?: { inicio: number; fim: number; soco: string } | null };
  try {
    const gancho = plano.gancho ? [plano.gancho] : null;
    // O gancho entra inteiro antes do corte (worker/src/abertura-de-impacto.mjs, prefixarAbertura).
    const deslocamento = plano.gancho ? Math.max(0, plano.gancho.fim - plano.gancho.inicio) : 0;
    const r = await revisarVideoPronto({
      obterQuadros: quadrosPeloWorker(cand.url, 256),
      plano,
      palavras: plano.fala.palavras,
      duracao: plano.fala.duracao,
      abertura: gancho,
      deslocamento,
      projectId: video.projectId,
      soCenas: rv.historico.at(-1)?.consertadas ?? null,
      passoSeg: 3,
    });
    const { cenas, momentos } = consertosDaRevisao(r.defeitos);
    const historico = [...rv.historico, { em: agora(), rodada: rv.rodadas + 1, quadros: r.quadros, defeitos: r.defeitos, consertadas: cenas, momentosTirados: momentos, erro: r.erro ?? null }].slice(-6);
    if (!cenas.length && !momentos.length) {
      await entregarCorte(video.id, indice, t, { ...tomado, revisaoVisual: { ...rv, historico, pendente: false } }, { url: cand.url, bytes: cand.bytes }, cand.tempos);
      return;
    }
    const semGancho = momentos.length ? { gancho: null } : {};
    const segura = rv.rodadas >= RODADAS_DE_CONSERTO;
    await trocarEstado(video.id, indice, tomado, {
      ...tomado,
      estado: "gerando",
      desde: agora(),
      trabalhando: false,
      tentativas: 0,
      esperarAte: null,
      candidato: null,
      plano: { ...(segura ? planoSeguro(plano) : voltarCenasParaPessoa(plano, cenas, "revisão visual")), fala: plano.fala, gancho: plano.gancho ?? null, ...semGancho },
      ...(segura ? { planoAntesDaSegura: plano } : {}),
      revisaoVisual: segura
        ? { ...rv, historico, pendente: false, segura: true, final: true, motivo: `a revisão visual ainda achou ${r.defeitos.length} defeito(s) depois de ${rv.rodadas} rodada(s); foi ao ar a versão segura, sem inserção` }
        : { ...rv, rodadas: rv.rodadas + 1, historico, pendente: false },
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message.slice(0, 160) : "falhou";
    await entregarCorte(video.id, indice, t, { ...tomado, revisaoVisual: { ...rv, pendente: false, motivo: `revisão visual falhou (${erro})` } }, { url: cand.url, bytes: cand.bytes }, cand.tempos);
  }
}

// ─────────────────────────────── refazer ───────────────────────────────

/**
 * Recomeça a montagem de cortes (todos, ou só `indices`), qualquer que seja o
 * estado: volta para "na-fila" e o cron faz o resto. Serve para refazer um
 * vídeo que terminou "sem-montagem" (primeira rodada de 30/09). O plano e as
 * imagens saem de novo pelo diretor; imagem com o mesmo prompt é reaproveitada.
 */
export async function refazerMontagens(videoJobId: string, indices?: number[]): Promise<number> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  const trechos = (video?.clips as unknown as TrechoComMontagem[] | null) ?? [];
  let n = 0;
  for (const [i, t] of trechos.entries()) {
    if (indices && !indices.includes(i)) continue;
    if (!t?.midia?.vertical?.url || t.midia.erro) continue;
    // Se o vertical atual já é uma montagem, a origem é o original guardado.
    const cru = t.montagem?.montadoUrl && t.midia.vertical.url === t.montagem.montadoUrl ? t.midia.verticalOriginal?.url : t.midia.vertical.url;
    if (!cru) continue;
    // A montagem que está NO AR (`montadoUrl`) vai junto (30/09, ajuste pelo
    // chat): sem ela, `concluirMontagem` guardava a montagem velha como se
    // fosse o corte cru em `verticalOriginal`, e o corte cru se perdia.
    const noAr = t.montagem?.montadoUrl && t.midia.vertical.url === t.montagem.montadoUrl ? { montadoUrl: t.montagem.montadoUrl } : {};
    if (await trocarEstado(videoJobId, i, t.montagem ?? null, { estado: "na-fila", desde: agora(), origem: hashCurto(cru), ...noAr })) n++;
  }
  return n;
}

/**
 * "TENTAR A MONTAGEM DE NOVO" de um corte (01/10, parte 240), sem cobrar: a
 * montagem nunca debita crédito. Com plano e imagens prontos, volta a
 * "gerando" com as tentativas zeradas e o cron reenvia ao worker; sem plano
 * (o diretor falhou), recomeça da fila (`refazerMontagens`). Recusa enquanto a
 * montagem do corte está andando.
 */
export async function tentarMontagemDoCorteDeNovo(videoJobId: string, indice: number): Promise<{ ok: boolean; caminho: "reenvio" | "do-comeco" | null; motivo?: string }> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  const t = ((video?.clips as unknown as TrechoComMontagem[] | null) ?? [])[indice];
  const m = t?.montagem;
  if (!t || !m) return { ok: false, caminho: null, motivo: "Este corte não tem montagem de efeitos." };
  const idade = Date.now() - new Date(m.desde).getTime();
  // 60 min: o mesmo prazo em que a tela deixa de mostrar "montando" e oferece o
  // botão (lib/media/estado-da-montagem.ts). Botão que aparece e recusa não serve.
  if (["na-fila", "dirigindo", "gerando", "montando"].includes(m.estado) && idade < 60 * 60_000) {
    return { ok: false, caminho: null, motivo: "A montagem deste corte já está rodando. O card avisa quando terminar." };
  }
  if (m.plano && m.assets) {
    // Pedir de novo depois da VERSÃO SEGURA (02/10) volta o plano com as
    // inserções e zera a revisão visual; a devolução já feita fica (cortesia).
    const volta = m.planoAntesDaSegura ? { plano: m.planoAntesDaSegura, planoAntesDaSegura: null, revisaoVisual: null } : {};
    const ok = await trocarEstado(videoJobId, indice, m, { ...m, ...volta, estado: "gerando", desde: agora(), tentativas: 0, esperarAte: null, motivo: null, falhaTecnica: false, candidato: null, trabalhando: false });
    return { ok, caminho: "reenvio" };
  }
  const n = await refazerMontagens(videoJobId, [indice]);
  return { ok: n > 0, caminho: "do-comeco" };
}

function resumoDoErro(erro: string): string {
  const e = erro.replace(/\s+/g, " ").trim();
  return e.length <= 360 ? e : `${e.slice(0, 160)} (...) ${e.slice(-200)}`;
}
