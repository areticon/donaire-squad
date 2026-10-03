import { prisma } from "@/lib/db/prisma";
import { despacharPasso, type PassoDoPiloto } from "@/lib/media/piloto-do-servidor";
import {
  MAX_RETOMADAS,
  MAX_TENTATIVAS,
  MORTE,
  NOME_DA_ETAPA,
  TRABALHANDO,
  mensagemDeDesistencia,
  prazoDaEtapa,
  type EstadoDeTrabalho,
  type RetomadaDaEtapa,
  type RetomadasDoVideo,
} from "@/lib/media/video-state";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { enviarEmail } from "@/lib/email";

/**
 * O VIGIA DAS ETAPAS (01/10): quem retoma, NO SERVIDOR, a etapa de vídeo que
 * parou sem avisar.
 *
 * O incidente que o criou: o vídeo cmupyrkqv do Bruno ficou mais de uma hora
 * em "cutting" ("Enquadrando cada corte", "passou do previsto"). Um deploy do
 * worker no Railway reiniciou o servidor no meio do corte, o pedido morreu sem
 * aviso de volta, e nada no servidor relançou: a cura de etapa parada vivia na
 * rota de status, que só roda com a aba do cliente aberta, e a internet dele
 * tinha caído. Pior, quando a aba voltasse, a cura antiga DECLARAVA MORTO
 * (status "failed"), em vez de continuar de onde parou.
 *
 * O desenho:
 *
 * 1. Roda no cron de 1 minuto (app/api/cron/fila), depois da régua da agenda.
 *    A rota de status também chama, mas só com uma folga extra (o cron é quem
 *    manda; a aba é rede de segurança do cron).
 * 2. Para cada vídeo em etapa de trabalho que passou do prazo, VOLTA ao estado
 *    de espera que a rota da etapa aceita e DESPACHA o passo certo pelo piloto
 *    do servidor. As rotas são atômicas (updateMany por status) e não cobram
 *    de novo (ver a tabela RETOMADA abaixo), então retomar é continuar, e não
 *    recomeçar pagando.
 * 3. A retomada é idempotente: a tomada é um UPDATE condicionado ao status E ao
 *    `startedAt` lidos. Duas passadas simultâneas (o cron e uma aba, ou dois
 *    crons sobrepostos) leem o mesmo vídeo, e só a primeira escrita pega a
 *    linha; a segunda não despacha nada.
 * 4. Até MAX_RETOMADAS (2) por etapa, contadas na coluna `retomadas`. Na
 *    terceira parada o vídeo vira "failed" com a mensagem para o cliente
 *    clicar, e os admins recebem um e-mail.
 * 5. No CORTE, antes de relançar, pergunta ao worker (`/vivo`) se o trabalho
 *    deste vídeo ainda está rodando lá: gravação longa passa do prazo sem
 *    estar morta, e relançar seria cortar duas vezes. Worker que não sabe
 *    responder (versão antiga, fora do ar) ganha o prazo mais uma folga.
 *
 * A montagem dos cortes, a edição do completo, a abertura por IA e o gêmeo
 * NÃO passam por aqui: cada um já tem estado próprio com prazo e tentativas no
 * mesmo cron (montagem-nos-cortes.ts, montagem-do-completo.ts,
 * higgsfield-nos-cortes.ts, gemeo-passo.ts). O que eles ganharam neste
 * trabalho foi o aviso "reiniciado" do worker, que os faz reenviar na hora.
 */

/**
 * Para onde cada etapa volta e qual passo do piloto a retoma.
 *
 * Por que nenhuma delas cobra de novo (conferido nas rotas em 01/10):
 * - transcrever: a rota /transcribe não cobra crédito (a primeira parte é
 *   cobrada na seleção). O custo é só da transcrição de fora, uma vez a mais.
 * - selecionar: `cobrarPrimeiraParte` é idempotente (uma linha por vídeo) e
 *   `recobrarSeEstornado` só cobra se houve estorno; retomar não estorna.
 * - roteiro: a continuação (vídeo em "roteirizando", chamada assinada) só
 *   renova o prazo, e a cobrança dentro dela é a mesma idempotente.
 * - cortar: a rota /cortar não cobra (a segunda parte é cobrada na aprovação
 *   do roteiro).
 * - preparar (redação): /write confere `jaCobrado` e a aprovação cobrada antes
 *   de debitar.
 *
 * `devolveTentativa`: a rota incrementa `attempts` ao tomar a etapa. A
 * retomada não é uma tentativa do cliente que falhou, é o servidor que caiu;
 * sem devolver, duas retomadas queimariam as três tentativas e aposentariam o
 * botão "tentar de novo" do cliente.
 */
const RETOMADA: Record<EstadoDeTrabalho, { volta: (v: LinhaDoVideo) => string; passo: PassoDoPiloto; devolveTentativa: boolean }> = {
  transcribing: { volta: () => "uploaded", passo: "transcrever", devolveTentativa: true },
  selecting: { volta: () => "transcribed", passo: "selecionar", devolveTentativa: true },
  // A continuação do roteiro roda com o vídeo AINDA em "roteirizando": a rota
  // aceita a chamada assinada nesse estado e retoma do que ficou gravado.
  roteirizando: { volta: () => "roteirizando", passo: "roteiro", devolveTentativa: false },
  cutting: { volta: () => "selected", passo: "cortar", devolveTentativa: true },
  // A redação volta para "cut" quando os cortes existem (voltar para
  // "selected" ofereceria cortar de novo, meia hora de worker por nada).
  writing: { volta: (v) => (v.temCortes ? "cut" : "selected"), passo: "preparar", devolveTentativa: true },
};

/**
 * O prazo que o VIGIA usa, em segundos. É o `prazoDaEtapa` de sempre, com uma
 * exceção: o roteiro renova o `startedAt` a cada volta de 150 s (e um diretor
 * leva até 3 min), então seis minutos sem renovar já querem dizer que ninguém
 * está trabalhando. Era a regra do cron antes do vigia (30/09).
 */
export function prazoDoVigia(v: { status: string; startedAt: Date | null; durationSec?: number | null; sizeBytes?: bigint | number | null; id: string }): number {
  if (v.status === "roteirizando") return 6 * 60;
  return prazoDaEtapa(v);
}

/**
 * Folga do corte quando o worker não sabe dizer se o trabalho está vivo
 * (versão antiga sem /vivo, ou fora do ar). Cobre o tempo de drenagem do
 * deploy (railway.json do worker) e o aviso de volta atrasado.
 */
export const FOLGA_DO_CORTE_SEM_RESPOSTA_S = 15 * 60;

/**
 * Quando o WORKER CONFIRMA que o corte não está mais lá, o vigia não espera o
 * prazo da gravação (piso de 90 min): retoma depois de 20 minutos de corte. No
 * incidente de 01/10 foram mais de 60 minutos parados; com isto seriam 20 no
 * pior caso (o reinício sem aviso, SIGKILL direto). Por que não antes: durante
 * o deploy o contêiner VELHO ainda drena por até 15 min (worker/railway.json),
 * e o /vivo responde pelo contêiner NOVO, que não conhece aquele trabalho.
 * Vinte minutos passam da drenagem e evitam cortar duas vezes.
 */
export const CORTE_MORTO_CONFIRMADO_S = 20 * 60;

/** Acima disto parado, o vídeo não é retomado sozinho: só declarado parado. */
export const LIMITE_DA_RETOMADA_S = 24 * 3600;

export type EstadoNoWorker = "vivo" | "morto" | "desconhecido";

type LinhaDoVideo = {
  id: string;
  status: string;
  startedAt: Date | null;
  attempts: number;
  durationSec: number | null;
  sizeBytes: bigint | null;
  userId: string;
  projectId: string;
  originalName: string | null;
  temCortes: boolean;
  retomadas: RetomadasDoVideo;
};

export type OpcoesDoVigia = {
  /** Só os vídeos deste projeto (a rota de status). */
  projectId?: string;
  /** Só estes vídeos (a prova por script nunca encosta em vídeo real). */
  ids?: string[];
  /** Segundos a mais além do prazo antes de agir (a aba espera o cron). */
  folgaExtraS?: number;
  agora?: Date;
  /** Trocáveis na prova: despachar de verdade mandaria a produção trabalhar. */
  despachar?: (videoId: string, passo: PassoDoPiloto) => Promise<boolean>;
  consultarWorker?: (videoId: string) => Promise<EstadoNoWorker>;
  avisarAdmins?: (info: AvisoDeDesistencia) => Promise<void>;
  /** Teto de vídeos por passada, para a passada caber no orçamento do cron. */
  limite?: number;
};

export type AvisoDeDesistencia = {
  videoId: string;
  projectId: string;
  userId: string;
  etapa: EstadoDeTrabalho;
  arquivo: string | null;
  motivo: "prazo" | "reiniciado";
};

export type ResultadoDoVigia = {
  olhados: number;
  retomados: Array<{ id: string; etapa: string; n: number; motivo: string }>;
  desistidos: Array<{ id: string; etapa: string }>;
  /** Corte passou do prazo mas o worker disse que ainda está trabalhando nele. */
  vivosNoWorker: string[];
  /** Corte sem resposta do worker, ainda dentro da folga. */
  aguardando: string[];
  /** A tomada não pegou a linha: outra passada chegou antes, ou o trabalho terminou. */
  perdidos: string[];
};

/** Lê a coluna `retomadas` por SQL cru (o cliente do Prisma pode ser anterior a ela). */
async function lerRetomadas(ids: string[]): Promise<Map<string, RetomadasDoVideo>> {
  const mapa = new Map<string, RetomadasDoVideo>();
  if (!ids.length) return mapa;
  const linhas = await prisma.$queryRaw<Array<{ id: string; retomadas: RetomadasDoVideo | null }>>`
    SELECT id, retomadas FROM video_jobs WHERE id = ANY(${ids})`;
  for (const l of linhas) mapa.set(l.id, l.retomadas ?? {});
  return mapa;
}

/** As linhas candidatas: etapa de trabalho, filtradas por projeto ou ids. */
async function candidatos(opcoes: OpcoesDoVigia): Promise<LinhaDoVideo[]> {
  const videos = await prisma.videoJob.findMany({
    where: {
      status: { in: [...TRABALHANDO] },
      ...(opcoes.projectId ? { projectId: opcoes.projectId } : {}),
      ...(opcoes.ids ? { id: { in: opcoes.ids } } : {}),
    },
    select: {
      id: true,
      status: true,
      startedAt: true,
      attempts: true,
      durationSec: true,
      sizeBytes: true,
      userId: true,
      projectId: true,
      originalName: true,
      clips: true,
    },
    orderBy: { startedAt: "asc" },
    take: opcoes.limite ?? 20,
  });
  const retomadas = await lerRetomadas(videos.map((v) => v.id));
  return videos.map((v) => ({
    id: v.id,
    status: v.status,
    startedAt: v.startedAt,
    attempts: v.attempts,
    durationSec: v.durationSec,
    sizeBytes: v.sizeBytes,
    userId: v.userId,
    projectId: v.projectId,
    originalName: v.originalName,
    temCortes: ((v.clips as Array<{ midia?: { vertical?: unknown } }> | null) ?? []).some((t) => t?.midia?.vertical),
    retomadas: retomadas.get(v.id) ?? {},
  }));
}

/**
 * Pergunta ao worker se o corte deste vídeo ainda está rodando lá. Assinado
 * como todo pedido ao worker. 404 é worker antigo (sem /vivo): desconhecido.
 */
export async function corteNoWorker(videoId: string): Promise<EstadoNoWorker> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) return "desconhecido";
  const corpo = JSON.stringify({ videoJobId: videoId, tipo: "cortar" });
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/vivo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return "desconhecido";
    const j = (await r.json().catch(() => ({}))) as { vivo?: boolean };
    return j.vivo ? "vivo" : "morto";
  } catch {
    return "desconhecido";
  }
}

async function avisarAdminsDeVerdade(info: AvisoDeDesistencia): Promise<void> {
  const [admins, dono] = await Promise.all([
    prisma.user.findMany({ where: { role: "admin" }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: info.userId }, select: { email: true } }),
  ]);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  for (const a of admins) {
    if (!a.email) continue;
    await enviarEmail({
      para: a.email,
      assunto: `Vídeo parado: ${NOME_DA_ETAPA[info.etapa].toLowerCase()} travou três vezes`,
      texto: [
        `${NOME_DA_ETAPA[info.etapa]} do vídeo ${info.videoId} parou três vezes seguidas e o vigia desistiu de retomar sozinho.`,
        "",
        `Arquivo: ${info.arquivo ?? "(sem nome)"}`,
        `Cliente: ${dono?.email ?? info.userId}`,
        `Projeto: ${base}/projects/${info.projectId}/live`,
        `Último motivo: ${info.motivo === "reiniciado" ? "o worker avisou que reiniciou" : "passou do prazo sem aviso de volta"}`,
        "",
        "O cliente vê a mensagem para clicar em tentar de novo. Vale olhar os registros do worker no Railway e da Vercel antes de ele clicar.",
      ].join("\n"),
    }).catch(() => false);
  }
}

/** O caminho da chave no jsonb, no formato que o `jsonb_set` pede. */
function caminho(chave: string): string[] {
  return [chave];
}

/**
 * Retoma UM vídeo, de forma idempotente. Usada pelo vigia (prazo) e pelo
 * cortar-callback quando o worker avisa que reiniciou (na hora, sem esperar o
 * prazo). Devolve o que aconteceu.
 */
export async function retomarEtapa(
  v: LinhaDoVideo,
  motivo: "prazo" | "reiniciado",
  opcoes: Pick<OpcoesDoVigia, "despachar" | "avisarAdmins" | "agora"> = {}
): Promise<"retomado" | "desistiu" | "perdido" | "falhou-o-despacho"> {
  if (!(TRABALHANDO as readonly string[]).includes(v.status)) return "perdido";
  const etapa = v.status as EstadoDeTrabalho;
  const regra = RETOMADA[etapa];
  const anterior: RetomadaDaEtapa = v.retomadas[etapa] ?? { n: 0 };
  const agora = opcoes.agora ?? new Date();
  // O `startedAt` lido, em texto: a tomada só pega a linha se ele não mudou.
  // `::timestamp` descarta o fuso do texto ISO, e o Prisma grava em UTC, então
  // a comparação é exata ao milissegundo (timestamp(3)).
  const lidoEm = v.startedAt ? v.startedAt.toISOString() : null;

  // ── A TERCEIRA PARADA: desiste, com mensagem e aviso ──────────────────────
  if (anterior.n >= MAX_RETOMADAS) {
    // O contador volta a zero: o próximo clique do cliente ganha de novo as
    // duas retomadas automáticas. `attempts` fica em MAX_TENTATIVAS - 1 para o
    // botão "tentar de novo" aparecer (proximaAcao) e para a cura da tela NÃO
    // repetir sozinha (ela só repete a primeira falha, attempts < 2).
    const registro: RetomadaDaEtapa = { n: 0, em: agora.toISOString(), motivo, desistencias: (anterior.desistencias ?? 0) + 1 };
    const pegou = await prisma.$executeRaw`
      UPDATE video_jobs SET
        status = 'failed',
        "startedAt" = NULL,
        error = ${mensagemDeDesistencia(etapa)},
        attempts = ${MAX_TENTATIVAS - 1},
        retomadas = jsonb_set(COALESCE(retomadas, '{}'::jsonb), ${caminho(etapa)}::text[], ${JSON.stringify(registro)}::jsonb, true),
        "updatedAt" = now()
      WHERE id = ${v.id} AND status = ${etapa}
        AND (("startedAt" IS NULL AND ${lidoEm}::text IS NULL) OR "startedAt" = ${lidoEm}::timestamp)`;
    if (pegou === 0) return "perdido";
    console.warn(`[vigia][${v.id}] ${etapa} parou ${MAX_RETOMADAS + 1} vezes; desisti e pedi o clique do cliente`);
    await (opcoes.avisarAdmins ?? avisarAdminsDeVerdade)({
      videoId: v.id,
      projectId: v.projectId,
      userId: v.userId,
      etapa,
      arquivo: v.originalName,
      motivo,
    }).catch((e) => console.error(`[vigia][${v.id}] aviso aos admins falhou:`, e));
    return "desistiu";
  }

  // ── A RETOMADA: volta ao estado que a rota aceita e despacha o passo ──────
  const volta = regra.volta(v);
  const registro: RetomadaDaEtapa = { n: anterior.n + 1, em: agora.toISOString(), motivo, ...(anterior.desistencias ? { desistencias: anterior.desistencias } : {}) };
  // O roteiro continua em "roteirizando" com o prazo renovado; as outras
  // voltam a um estado de espera, sem `startedAt`.
  const novoInicio = volta === etapa ? agora.toISOString() : null;
  const devolve = regra.devolveTentativa ? 1 : 0;
  const pegou = await prisma.$executeRaw`
    UPDATE video_jobs SET
      status = ${volta},
      "startedAt" = ${novoInicio}::timestamp,
      attempts = GREATEST(attempts - ${devolve}, 0),
      error = NULL,
      retomadas = jsonb_set(COALESCE(retomadas, '{}'::jsonb), ${caminho(etapa)}::text[], ${JSON.stringify(registro)}::jsonb, true),
      "updatedAt" = now()
    WHERE id = ${v.id} AND status = ${etapa}
      AND (("startedAt" IS NULL AND ${lidoEm}::text IS NULL) OR "startedAt" = ${lidoEm}::timestamp)`;
  if (pegou === 0) return "perdido";

  const despachou = await (opcoes.despachar ?? despacharPasso)(v.id, regra.passo).catch(() => false);
  if (!despachou) {
    // O despacho não saiu (o próprio app fora do ar por um instante): devolve
    // a linha ao estado parado, com o prazo antigo e sem contar a retomada,
    // para a próxima passada tentar de novo em vez de deixar o vídeo esperando
    // num estado que ninguém vai mover.
    await prisma.$executeRaw`
      UPDATE video_jobs SET
        status = ${etapa},
        "startedAt" = ${lidoEm}::timestamp,
        attempts = attempts + ${devolve},
        retomadas = jsonb_set(COALESCE(retomadas, '{}'::jsonb), ${caminho(etapa)}::text[], ${JSON.stringify(anterior)}::jsonb, true),
        "updatedAt" = now()
      WHERE id = ${v.id} AND status = ${volta}
        AND (("startedAt" IS NULL AND ${novoInicio}::text IS NULL) OR "startedAt" = ${novoInicio}::timestamp)`;
    console.error(`[vigia][${v.id}] despachar ${regra.passo} falhou; a próxima passada tenta de novo`);
    return "falhou-o-despacho";
  }
  console.warn(`[vigia][${v.id}] ${etapa} retomada (${registro.n} de ${MAX_RETOMADAS}, ${motivo}): voltou a "${volta}" e despachou "${regra.passo}"`);
  return "retomado";
}

/**
 * Conta uma retomada de um trabalho que NÃO é estado do vídeo (o completo e o
 * recorte de um trecho, que rodam com o vídeo em "cut" ou "ready"), de forma
 * atômica e com o mesmo teto. Devolve o novo número, ou null quando o teto já
 * foi atingido (aí quem chamou desiste e avisa o cliente).
 */
export async function contarRetomadaExtra(videoId: string, chave: "completo" | "recorte"): Promise<number | null> {
  const linhas = await prisma.$queryRaw<Array<{ n: number }>>`
    UPDATE video_jobs SET
      retomadas = jsonb_set(
        COALESCE(retomadas, '{}'::jsonb), ${caminho(chave)}::text[],
        jsonb_build_object('n', COALESCE((retomadas -> ${chave} ->> 'n')::int, 0) + 1, 'em', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'motivo', 'reiniciado'),
        true)
    WHERE id = ${videoId} AND COALESCE((retomadas -> ${chave} ->> 'n')::int, 0) < ${MAX_RETOMADAS}
    RETURNING (retomadas -> ${chave} ->> 'n')::int AS n`;
  return linhas[0]?.n ?? null;
}

/** Lê UM vídeo no formato do vigia (para o cortar-callback). */
export async function lerParaRetomar(videoId: string): Promise<LinhaDoVideo | null> {
  const [v] = await candidatos({ ids: [videoId], limite: 1 });
  return v ?? null;
}

/**
 * Uma passada do vigia. Nunca lança: o cron segue com o resto da fila.
 */
export async function vigiarEtapas(opcoes: OpcoesDoVigia = {}): Promise<ResultadoDoVigia> {
  const r: ResultadoDoVigia = { olhados: 0, retomados: [], desistidos: [], vivosNoWorker: [], aguardando: [], perdidos: [] };
  const agora = opcoes.agora ?? new Date();
  const folga = opcoes.folgaExtraS ?? 0;
  let lista: LinhaDoVideo[] = [];
  try {
    lista = await candidatos(opcoes);
  } catch (e) {
    console.error("[vigia] leitura falhou:", e);
    return r;
  }

  const parados = lista.filter((v) => {
    if (!v.startedAt) return true; // estado de trabalho sem início: registro velho, parado desde sempre
    const decorrido = (agora.getTime() - v.startedAt.getTime()) / 1000;
    // O corte entra na conferência mais cedo: o worker diz se o trabalho
    // ainda está lá, e a resposta "não está" encurta a espera (ver abaixo).
    if (v.status === "cutting") return decorrido > Math.min(prazoDoVigia(v), CORTE_MORTO_CONFIRMADO_S) + folga;
    return decorrido > prazoDoVigia(v) + folga;
  });
  r.olhados = parados.length;

  // Consulta ao worker em paralelo, só para os cortes: 8 s de teto cada, e a
  // passada não pode atrasar o resto do cron.
  const consultar = opcoes.consultarWorker ?? corteNoWorker;
  const noWorker = new Map<string, EstadoNoWorker>();
  await Promise.all(
    parados
      .filter((v) => v.status === "cutting")
      .map(async (v) => noWorker.set(v.id, await consultar(v.id).catch(() => "desconhecido" as const)))
  );

  for (const v of parados) {
    try {
      // PARADO HÁ MAIS DE UM DIA (ou sem `startedAt`, registro de antes da
      // coluna): não é reinício de deploy, é registro esquecido. Retomar
      // sozinho mandaria o worker cortar, ou a transcrição ouvir, um vídeo de
      // que o cliente nem lembra. Fica a regra antiga: declara parado, com a
      // mensagem da etapa e o botão de tentar de novo.
      const decorridoS = v.startedAt ? (agora.getTime() - v.startedAt.getTime()) / 1000 : Infinity;
      if (decorridoS > LIMITE_DA_RETOMADA_S) {
        const lidoEm = v.startedAt ? v.startedAt.toISOString() : null;
        const pegou = await prisma.$executeRaw`
          UPDATE video_jobs SET status = 'failed', "startedAt" = NULL, error = ${MORTE[v.status as EstadoDeTrabalho]}, "updatedAt" = now()
          WHERE id = ${v.id} AND status = ${v.status}
            AND (("startedAt" IS NULL AND ${lidoEm}::text IS NULL) OR "startedAt" = ${lidoEm}::timestamp)`;
        if (pegou > 0) r.desistidos.push({ id: v.id, etapa: v.status });
        continue;
      }
      if (v.status === "cutting") {
        const estado = noWorker.get(v.id) ?? "desconhecido";
        if (estado === "vivo") {
          // Gravação longa passou do prazo, mas o worker está nela: relançar
          // seria cortar duas vezes o mesmo vídeo.
          r.vivosNoWorker.push(v.id);
          continue;
        }
        if (estado === "desconhecido" && v.startedAt) {
          const decorrido = (agora.getTime() - v.startedAt.getTime()) / 1000;
          if (decorrido <= prazoDoVigia(v) + folga + FOLGA_DO_CORTE_SEM_RESPOSTA_S) {
            r.aguardando.push(v.id);
            continue;
          }
        }
        // "morto" confirmado pelo worker: retoma já (passados os 20 min do
        // CORTE_MORTO_CONFIRMADO_S), sem esperar o prazo longo da gravação.
      }
      const feito = await retomarEtapa(v, "prazo", { ...opcoes, agora });
      if (feito === "retomado") r.retomados.push({ id: v.id, etapa: v.status, n: (v.retomadas[v.status]?.n ?? 0) + 1, motivo: "prazo" });
      else if (feito === "desistiu") r.desistidos.push({ id: v.id, etapa: v.status });
      else if (feito === "perdido") r.perdidos.push(v.id);
    } catch (e) {
      console.error(`[vigia][${v.id}] retomada falhou:`, e);
    }
  }
  return r;
}
