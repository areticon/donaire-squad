import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { debitar, creditar, jaCobrado, SaldoInsuficiente } from "@/lib/credits";
import {
  CREDITOS_POR_GERACAO_HIGGSFIELD,
  geracoesPorCorte,
  EFEITOS_SO_NO_FFMPEG,
} from "@/lib/credits/higgsfield-tabela";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import {
  higgsfieldNaEdicaoLigada,
  pedirGeracao,
  promptDeCenaSemPessoa,
  concluirSePronto,
  montarPrompt,
  MODELO_PADRAO,
} from "@/lib/media/higgsfield";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { AberturaIa, GeracaoDoCorte } from "@/lib/media/estado-da-abertura-ia";

/**
 * A ABERTURA POR IA NOS CORTES, de ponta a ponta (item 9, aprovado em 29/09).
 *
 * O caminho de um corte:
 *
 *   1. o worker entrega os cortes e o `cortar-callback` MARCA cada corte
 *      elegível como "na-fila" (`marcarAberturasNaFila`), uma escrita barata
 *      que já faz a tela dizer "Vitor gerando a abertura";
 *   2. o passo `avancarAberturas`, que roda no cron de um minuto da fila
 *      (`app/api/cron/fila`), faz o resto, um estado por vez:
 *        na-fila   -> cobra os créditos, pede ao worker o quadro 9:16 da capa,
 *                     pede as gerações à Higgsfield e GRAVA os request_id;
 *        gerando   -> consulta o status de cada pedido (uma vez por minuto, no
 *                     ritmo do cron, nunca a espera do SDK) e baixa o que ficou
 *                     pronto para o nosso Blob;
 *        emendando -> chama o `/emendar` do worker e troca `midia.vertical`
 *                     pela versão emendada, guardando a original em
 *                     `midia.verticalSemAbertura`.
 *
 * POR QUE O CRON DA FILA, e não um trabalho novo na tabela da fila: a fila de
 * trabalhos roda o que é pego NA HORA, e aqui o que se quer é o contrário,
 * olhar de novo daqui a um minuto. O cron já passa a cada minuto, já tem teto
 * de 800 s e já é autenticado; o passo só precisa de um pedaço do orçamento.
 *
 * FALHA NUNCA SEGURA O CORTE: prazo estourado (30 min), Higgsfield recusando,
 * worker fora do ar, saldo insuficiente, tudo termina em "sem-abertura" com o
 * motivo gravado, e o corte original continua valendo. As gerações que não
 * entregaram voltam como estorno de créditos.
 */

const OPERACAO = "video_higgsfield";
const OPERACAO_ESTORNO = "video_higgsfield_estorno";
/** Pedido que não fechou em 30 min não fecha mais em tempo de ser útil. */
const PRAZO_DA_GERACAO_MS = 30 * 60_000;
/** "pedindo" ou "emendando" parado há mais que isto é função morta. */
const PASSO_MORTO_MS = 10 * 60_000;
const MAX_TENTATIVAS_DE_EMENDA = 2;

type MidiaDoCorte = {
  vertical?: { url: string; bytes?: number } | null;
  verticalSemAbertura?: { url: string; bytes?: number } | null;
  capa?: { url: string } | null;
  enquadramento?: { cena?: string; pessoa?: { x: number; w: number } | null } | null;
  erro?: string | null;
};
type TrechoComIa = { midia?: MidiaDoCorte | null; higgsfield?: AberturaIa | null; titulo?: string; texto?: { fraseDaCapa?: string } | null };

const agora = () => new Date().toISOString();
const hashCurto = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// ─────────────────────────────── gravação atômica ───────────────────────────────

/**
 * Grava o estado no trecho SÓ se o estado lido ainda é o mesmo (estado e
 * `desde`). O cron pode sobrepor duas passadas, e sem esta condição as duas
 * pediriam a mesma geração ou emendariam o mesmo corte duas vezes.
 */
async function trocarEstado(
  videoJobId: string,
  indice: number,
  lido: AberturaIa | null,
  novo: AberturaIa,
  midia?: Record<string, unknown>
): Promise<boolean> {
  const json = JSON.stringify(novo);
  const midiaJson = JSON.stringify(midia ?? {});
  const estadoLido = lido?.estado ?? "";
  const desdeLido = lido?.desde ?? "";
  const n = await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(
      clips,
      ARRAY[${String(indice)}]::text[],
      (clips -> ${indice}::int)
        || jsonb_build_object('higgsfield', ${json}::jsonb)
        || jsonb_build_object('midia', COALESCE(clips -> ${indice}::int -> 'midia', '{}'::jsonb) || ${midiaJson}::jsonb)
    )
    WHERE id = ${videoJobId}
      AND jsonb_typeof(clips -> ${indice}::int) = 'object'
      AND COALESCE(clips -> ${indice}::int -> 'higgsfield' ->> 'estado', '') = ${estadoLido}
      AND COALESCE(clips -> ${indice}::int -> 'higgsfield' ->> 'desde', '') = ${desdeLido}`;
  if (n > 0) await espelharNoCard(videoJobId, indice, novo);
  return n > 0;
}

/** O card do Vitor mostra o mesmo estado (como `aberturaIa` no metadata). */
async function espelharNoCard(videoJobId: string, indice: number, estado: AberturaIa): Promise<void> {
  const json = JSON.stringify(estado);
  await prisma.$executeRaw`
    UPDATE campaign_cards
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('aberturaIa', ${json}::jsonb)
    WHERE "agentId" = 'vitor-video'
      AND metadata ->> 'videoJobId' = ${videoJobId}
      AND metadata ->> 'trechoIndice' = ${String(indice)}`.catch((e) =>
    console.error(`[higgsfield][${videoJobId}] espelhar no card ${indice} falhou:`, e)
  );
}

// ─────────────────────────────── 1. marcar ───────────────────────────────

/**
 * Chamado pelo `cortar-callback` quando os cortes chegam. Só marca: quem cobra
 * e pede é o passo do cron. Duas travas: a chave de ambiente e a escolha do
 * projeto pedir IA (movimento de câmera ou efeito que o ffmpeg não faz).
 */
export async function marcarAberturasNaFila(videoJobId: string): Promise<number> {
  if (!higgsfieldNaEdicaoLigada()) return 0;
  // Com o editor completo ligado, a abertura antiga fica desligada: as cenas
  // geradas entram pelo diretor da montagem (lib/media/montagem-nos-cortes.ts).
  // Lido do ambiente aqui, e não importado, para não criar ciclo de módulos.
  if (process.env.MONTAGEM_NA_EDICAO === "1") return 0;
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: { clips: true, project: { select: { videoEstiloEscolha: true, videoStyle: true } } },
  });
  if (!video) return 0;
  const escolha = normalizarEscolha(video.project.videoEstiloEscolha, video.project.videoStyle);
  const porCorte = geracoesPorCorte(escolha);
  if (!porCorte.total) return 0;

  const trechos = (video.clips as unknown as TrechoComIa[] | null) ?? [];
  let marcados = 0;
  for (const [i, t] of trechos.entries()) {
    if (!t?.midia?.vertical?.url || !t.midia.capa?.url || t.midia.erro) continue;
    const origem = hashCurto(t.midia.capa.url);
    // Já tem abertura desta mesma capa (ou está a caminho): nada a fazer. Capa
    // nova (corte refeito do zero) recomeça.
    if (t.higgsfield && t.higgsfield.origem === origem) continue;
    const novo: AberturaIa = {
      estado: "na-fila",
      desde: agora(),
      origem,
      creditos: porCorte.total * CREDITOS_POR_GERACAO_HIGGSFIELD,
    };
    if (await trocarEstado(videoJobId, i, t.higgsfield ?? null, novo)) marcados++;
  }
  return marcados;
}

// ─────────────────────────────── worker ───────────────────────────────

async function chamarWorker<T>(rota: "quadro" | "emendar", corpo: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("VIDEO_WORKER_URL não configurado");
  const texto = JSON.stringify(corpo);
  const r = await fetch(`${base.replace(/\/$/, "")}/${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
    body: texto,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`worker /${rota} respondeu ${r.status}: ${String(dados.error ?? "").slice(0, 200)}`);
  return dados as T;
}

// ─────────────────────────────── estorno ───────────────────────────────

async function estornar(
  video: { id: string; userId: string },
  indice: number,
  papel: "abertura" | "apoio",
  origem: string | undefined,
  motivo: string
): Promise<void> {
  const refId = `${video.id}:${indice}:${origem ?? ""}:${papel}`;
  const ja = await prisma.creditTransaction.findFirst({
    where: { operation: OPERACAO_ESTORNO, refId, amount: { gt: 0 } },
    select: { id: true },
  });
  if (ja) return;
  // Admin não foi cobrado de verdade (debitar grava linha de valor zero), e
  // estornar daria crédito que ninguém pagou.
  const cobrado = await prisma.creditTransaction.findFirst({
    where: { operation: OPERACAO, refId: `${video.id}:${indice}:${origem ?? ""}`, amount: { lt: 0 } },
    select: { id: true },
  });
  if (!cobrado) return;
  await creditar({
    userId: video.userId,
    quantidade: CREDITOS_POR_GERACAO_HIGGSFIELD,
    operation: OPERACAO_ESTORNO,
    refId,
    note: `Abertura por IA do corte ${indice + 1} (${papel}) não entregue: ${motivo.slice(0, 120)}`,
  }).catch((e) => console.error(`[higgsfield][${video.id}] estorno ${indice}/${papel} falhou:`, e));
}

// ─────────────────────────────── 2. pedir ───────────────────────────────

type VideoDoPasso = {
  id: string;
  userId: string;
  projectId: string;
  clips: unknown;
  project: { videoEstiloEscolha: unknown; videoStyle: string | null };
};

async function pedir(video: VideoDoPasso, indice: number, t: TrechoComIa, lido: AberturaIa): Promise<void> {
  const tomado: AberturaIa = { ...lido, estado: "pedindo", desde: agora() };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;

  const escolha = normalizarEscolha(video.project.videoEstiloEscolha, video.project.videoStyle);
  const porCorte = geracoesPorCorte(escolha);
  /** Encerra sem abertura; `estornarTudo` quando já cobrou e nada foi pedido. */
  const semAbertura = async (motivo: string, estornarTudo: boolean) => {
    if (estornarTudo) {
      if (porCorte.abertura) await estornar(video, indice, "abertura", tomado.origem, motivo);
      if (porCorte.apoio) await estornar(video, indice, "apoio", tomado.origem, motivo);
    }
    await trocarEstado(video.id, indice, tomado, { ...tomado, estado: "sem-abertura", desde: agora(), motivo });
  };

  if (!higgsfieldNaEdicaoLigada()) {
    await semAbertura("Abertura por IA desligada.", false);
    return;
  }
  const capaUrl = t.midia?.capa?.url;
  const vertical = t.midia?.vertical?.url;
  if (!porCorte.total || !capaUrl || !vertical) {
    await semAbertura("O corte não tem capa ou a escolha de estilo não pede IA.", false);
    return;
  }

  // COBRA ANTES DE PEDIR, pela regra do vídeo por IA: pedir primeiro deixaria
  // o custo na nossa conta se o cliente não tiver saldo.
  const creditos = porCorte.total * CREDITOS_POR_GERACAO_HIGGSFIELD;
  const refId = `${video.id}:${indice}:${tomado.origem ?? ""}`;
  try {
    if (!(await jaCobrado(OPERACAO, refId))) {
      await debitar({
        userId: video.userId,
        quantidade: creditos,
        operation: OPERACAO,
        projectId: video.projectId,
        refId,
        note: `Abertura por IA do corte ${indice + 1}: ${porCorte.total} geração(ões) Higgsfield`,
      });
    }
  } catch (e) {
    const motivo =
      e instanceof SaldoInsuficiente
        ? `Saldo insuficiente para a abertura por IA (${creditos} créditos). O corte segue sem ela.`
        : "Não consegui cobrar a abertura por IA. O corte segue sem ela.";
    await semAbertura(motivo, false);
    return;
  }

  // O quadro em pé, recortado em volta da pessoa, para o Kling gerar direto
  // em 9:16 (ver `quadroNaProporcao` no worker).
  // DESDE 30/09 A ABERTURA NÃO PARTE DO ROSTO. O primeiro teste pago mostrou o
  // Kling animando o Bruno e fechando os olhos dele: é a mesma licença para
  // mexer no rosto que a capa perdeu. A abertura agora é uma CENA SEM PESSOA
  // (texto para vídeo), na linguagem escolhida e sobre o tema do corte, e o
  // corte entra logo depois com a pessoa real. O quadro fica só como registro.
  let quadroUrl = tomado.quadroUrl ?? capaUrl;
  if (!quadroUrl) {
    try {
      const pessoa = t.midia?.enquadramento?.pessoa;
      const centroX = pessoa ? pessoa.x + pessoa.w / 2 : 0.5;
      const r = await chamarWorker<{ quadro?: { url: string } }>(
        "quadro",
        { imagemUrl: capaUrl, proporcao: "9:16", centroX, chave: `cortes/${video.id}/quadro-ia-${indice}.jpg` },
        90_000
      );
      quadroUrl = r.quadro?.url ?? "";
      if (!quadroUrl) throw new Error("worker não devolveu o quadro");
    } catch (e) {
      await semAbertura(`Não consegui preparar o quadro da abertura (${e instanceof Error ? e.message : "erro"}).`, true);
      return;
    }
  }

  // Movimento e efeito giram entre os cortes: o cliente vê tudo o que
  // escolheu, e não o primeiro da lista repetido.
  const cameras = escolha.camera.length ? escolha.camera : ["dolly-in"];
  const efeitosIa = escolha.efeitos.filter((e) => !EFEITOS_SO_NO_FFMPEG.includes(e));

  const pedirUma = async (papel: "abertura" | "apoio"): Promise<GeracaoDoCorte> => {
    const camera = papel === "abertura" ? cameras[indice % cameras.length] : cameras[(indice + 1) % cameras.length];
    const efeito = papel === "apoio" && efeitosIa.length ? efeitosIa[indice % efeitosIa.length] : null;
    // A origem (hash da capa) entra na chave: corte refeito com outra capa não
    // pode receber o clipe gerado da capa antiga.
    const chave = `corte-${indice}-${papel}-${tomado.origem ?? "x"}`;
    try {
      const p = await pedirGeracao({
        modelo: MODELO_PADRAO,
        prompt: promptDeCenaSemPessoa({
          papel,
          camera,
          efeito,
          look: escolha.look,
          estiloId: escolha.estiloId,
          assunto: [t.texto?.fraseDaCapa, t.titulo].filter(Boolean).join(". "),
        }),
        proporcao: "9:16",
        segundos: 3,
        referencia: video.id,
        chave,
      });
      return { chave, requestId: p.requestId, status: p.status, custoUsd: p.custoEstimadoUsd, camera, efeito };
    } catch (e) {
      const erro = e instanceof Error ? e.message : "falhou";
      await estornar(video, indice, papel, tomado.origem, erro);
      return { chave, erro, camera, efeito };
    }
  };

  const abertura = porCorte.abertura ? await pedirUma("abertura") : undefined;
  const apoio = porCorte.apoio ? await pedirUma("apoio") : undefined;
  const algum = Boolean(abertura?.requestId || apoio?.requestId);
  await trocarEstado(video.id, indice, tomado, {
    ...tomado,
    estado: algum ? "gerando" : "sem-abertura",
    desde: agora(),
    quadroUrl,
    creditos,
    abertura,
    apoio,
    motivo: algum ? null : `A Higgsfield recusou o pedido (${abertura?.erro ?? apoio?.erro ?? "sem detalhe"}).`,
  });
}

// ─────────────────────────────── 3. acompanhar ───────────────────────────────

async function acompanhar(video: VideoDoPasso, indice: number, lido: AberturaIa): Promise<"esperando" | "pronto-para-emendar" | "encerrado"> {
  const ctx = { projectId: video.projectId, operation: OPERACAO };
  const atualizar = async (g: GeracaoDoCorte | undefined): Promise<GeracaoDoCorte | undefined> => {
    if (!g?.requestId || g.blobUrl || g.erro) return g;
    try {
      const r = await concluirSePronto(video.id, g.chave, ctx);
      if (!r) return { ...g, erro: "pedido sem registro" };
      if (r.blobUrl) return { ...g, status: r.status, blobUrl: r.blobUrl };
      if (["failed", "nsfw", "canceled", "cancelled"].includes(r.status ?? "")) return { ...g, status: r.status, erro: `Higgsfield: ${r.status}` };
      return { ...g, status: r.status };
    } catch (e) {
      // Status que falhou por rede não encerra: o próximo minuto tenta de novo.
      console.warn(`[higgsfield][${video.id}] status ${g.chave}: ${e instanceof Error ? e.message : e}`);
      return g;
    }
  };
  const abertura = await atualizar(lido.abertura);
  const apoio = await atualizar(lido.apoio);
  const aberto = (g?: GeracaoDoCorte) => Boolean(g?.requestId && !g.blobUrl && !g.erro);
  const estourou = Date.now() - new Date(lido.desde).getTime() > PRAZO_DA_GERACAO_MS;

  // Falhou (não é cobrada pela Higgsfield) ou passou do prazo: devolve ao cliente.
  for (const [papel, g] of [["abertura", abertura], ["apoio", apoio]] as const) {
    if (g?.erro && !lido[papel]?.erro) await estornar(video, indice, papel, lido.origem, g.erro);
    if (estourou && aberto(g)) await estornar(video, indice, papel, lido.origem, "prazo de 30 min");
  }

  const pendente = aberto(abertura) || aberto(apoio);
  if (pendente && !estourou) {
    // Só grava se algo mudou, para não reescrever o JSON a cada minuto.
    if (abertura?.status !== lido.abertura?.status || apoio?.status !== lido.apoio?.status) {
      await trocarEstado(video.id, indice, lido, { ...lido, abertura, apoio });
    }
    return "esperando";
  }
  const temClipe = Boolean(abertura?.blobUrl || apoio?.blobUrl);
  const ok = await trocarEstado(video.id, indice, lido, {
    ...lido,
    abertura,
    apoio,
    estado: temClipe ? "emendando" : "sem-abertura",
    desde: agora(),
    motivo: temClipe
      ? null
      : estourou
        ? "A Higgsfield não entregou em 30 minutos. O corte segue sem abertura, e os créditos voltaram."
        : "A Higgsfield não conseguiu gerar a abertura. O corte segue sem ela, e os créditos voltaram.",
  });
  return ok && temClipe ? "pronto-para-emendar" : "encerrado";
}

// ─────────────────────────────── 4. emendar ───────────────────────────────

async function emendarNoCorte(video: VideoDoPasso, indice: number, t: TrechoComIa, lido: AberturaIa): Promise<void> {
  const tentativas = (lido.tentativasDeEmenda ?? 0) + 1;
  const tomado: AberturaIa = { ...lido, estado: "emendando", desde: agora(), tentativasDeEmenda: tentativas };
  if (!(await trocarEstado(video.id, indice, lido, tomado))) return;

  // A base é sempre o corte SEM abertura: se o vertical atual já é o emendado,
  // volta ao original guardado; se o corte foi refeito (Vera), é o novo.
  const atual = t.midia?.vertical;
  const base =
    atual?.url && atual.url === lido.verticalEmendado ? t.midia?.verticalSemAbertura ?? null : atual ?? null;
  if (!base?.url) {
    await trocarEstado(video.id, indice, tomado, { ...tomado, estado: "sem-abertura", desde: agora(), motivo: "O corte não tem vídeo para emendar." });
    return;
  }

  try {
    const r = await chamarWorker<{ vertical?: { url: string; bytes: number } }>(
      "emendar",
      {
        corteUrl: base.url,
        aberturaUrl: tomado.abertura?.blobUrl ?? undefined,
        apoio: tomado.apoio?.blobUrl ? { url: tomado.apoio.blobUrl } : undefined,
        chave: `cortes/${video.id}/vertical-${indice}-ia.mp4`,
        crossfade: 0.3,
      },
      5 * 60_000
    );
    if (!r.vertical?.url) throw new Error("worker não devolveu o vertical");

    const trocou = await trocarEstado(
      video.id,
      indice,
      tomado,
      { ...tomado, estado: "pronto", desde: agora(), verticalEmendado: r.vertical.url, motivo: null },
      { vertical: r.vertical, verticalSemAbertura: base }
    );
    if (trocou) {
      // O post aprovado antes da emenda guardou a URL do vertical antigo em
      // `imageUrl` (approve/route.ts). O que ainda não saiu passa a apontar
      // para a versão com abertura; o que já foi publicado fica como está.
      await prisma.post.updateMany({
        where: { imageUrl: base.url, status: { notIn: ["published", "publishing"] } },
        data: { imageUrl: r.vertical.url },
      });
      if (atual?.url && atual.url !== base.url) {
        await prisma.post.updateMany({
          where: { imageUrl: atual.url, status: { notIn: ["published", "publishing"] } },
          data: { imageUrl: r.vertical.url },
        });
      }
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falhou";
    console.error(`[higgsfield][${video.id}] emenda do corte ${indice} (tentativa ${tentativas}):`, erro);
    // Volta para "emendando" com `desde` antigo o bastante para a próxima
    // passada tentar de novo; depois do teto, segue sem abertura. Os clipes
    // foram entregues (e pagos), então aqui não há estorno automático.
    await trocarEstado(
      video.id,
      indice,
      tomado,
      tentativas >= MAX_TENTATIVAS_DE_EMENDA
        ? { ...tomado, estado: "sem-abertura", desde: agora(), motivo: `Não consegui emendar a abertura (${erro.slice(0, 120)}). O corte segue sem ela.` }
        : { ...tomado, desde: new Date(Date.now() - PASSO_MORTO_MS - 1000).toISOString() }
    );
  }
}

// ─────────────────────────────── o passo do cron ───────────────────────────────

/**
 * Uma passada: avança cada corte com abertura em andamento um estado. Roda no
 * cron da fila, a cada minuto, com orçamento próprio (a fila de campanhas usa
 * o que sobrar). Seguro de rodar em paralelo: cada troca de estado é
 * condicional ao estado lido.
 */
export async function avancarAberturas(opcoes: { orcamentoMs?: number } = {}): Promise<{ olhados: number; pedidos: number; emendados: number }> {
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 240_000;
  const r = { olhados: 0, pedidos: 0, emendados: 0 };

  // Só vídeos da última semana com abertura em algum estado: a consulta é
  // barata, e trabalho mais velho que isso já teria encerrado pelo prazo.
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM video_jobs
    WHERE "createdAt" > now() - interval '7 days'
      AND clips IS NOT NULL
      AND jsonb_typeof(clips) = 'array'
      AND jsonb_path_exists(clips, '$[*].higgsfield.estado')
    ORDER BY "createdAt" DESC
    LIMIT 50`;

  for (const { id } of ids) {
    if (Date.now() - inicio > orcamento) break;
    const video = (await prisma.videoJob.findUnique({
      where: { id },
      select: { id: true, userId: true, projectId: true, clips: true, project: { select: { videoEstiloEscolha: true, videoStyle: true } } },
    })) as VideoDoPasso | null;
    if (!video) continue;
    const trechos = (video.clips as TrechoComIa[] | null) ?? [];
    for (const [i, t] of trechos.entries()) {
      if (Date.now() - inicio > orcamento) break;
      const h = t?.higgsfield;
      if (!h) continue;
      const idade = Date.now() - new Date(h.desde).getTime();
      try {
        if (h.estado === "na-fila" || (h.estado === "pedindo" && idade > PASSO_MORTO_MS)) {
          r.olhados++;
          await pedir(video, i, t, h);
          r.pedidos++;
        } else if (h.estado === "gerando") {
          r.olhados++;
          const fim = await acompanhar(video, i, h);
          if (fim === "pronto-para-emendar") {
            // Relê: o estado acabou de mudar para "emendando".
            const fresco = await lerTrecho(id, i);
            if (fresco?.higgsfield?.estado === "emendando") {
              await emendarNoCorte(video, i, fresco, fresco.higgsfield);
              r.emendados++;
            }
          }
        } else if (h.estado === "emendando" && idade > PASSO_MORTO_MS) {
          r.olhados++;
          await emendarNoCorte(video, i, t, h);
          r.emendados++;
        } else if (
          h.estado === "pronto" &&
          t.midia?.vertical?.url &&
          h.verticalEmendado &&
          t.midia.vertical.url !== h.verticalEmendado &&
          (h.abertura?.blobUrl || h.apoio?.blobUrl)
        ) {
          // O corte foi refeito depois da emenda (a Vera pediu, o Vitor
          // recortou): emenda de novo com os MESMOS clipes, sem pagar outra
          // geração. A capa é a mesma, então a abertura continua valendo.
          r.olhados++;
          await emendarNoCorte(video, i, t, { ...h, tentativasDeEmenda: 0 });
          r.emendados++;
        }
      } catch (e) {
        console.error(`[higgsfield][${id}] corte ${i} (${h.estado}):`, e);
      }
    }
  }
  return r;
}

async function lerTrecho(videoJobId: string, indice: number): Promise<TrechoComIa | null> {
  const v = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  return ((v?.clips as TrechoComIa[] | null) ?? [])[indice] ?? null;
}
