import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { researchTopic } from "@/lib/research/web-search";
import { montarPrefixoCacheavel } from "@/lib/media/write-posts";
import { diasDaSemana, normalizarSemana, ROTULO_DO_FORMATO, type FormatoDoDia } from "@/lib/media/semana-do-video";
import type { Prisma } from "@prisma/client";

/**
 * O Roberto Radar pesquisa A PARTIR DA TRANSCRIÇÃO.
 *
 * Na campanha de texto o Roberto abre a semana: pesquisa o tema, traz o que
 * estão falando, dados com fonte, e só depois o Lucas escreve. Na campanha do
 * vídeo ele não existia: o agendar copiava o texto do melhor corte para o
 * LinkedIn e o X e chamava de campanha. O Bruno cobrou em 02/09: "o Roberto
 * deve a partir da transcrição do vídeo iniciar o fluxo, fazendo pesquisas,
 * vendo o que estão falando, trazendo dados".
 *
 * O resultado tem quatro partes, na ordem em que o card mostra:
 * 1. o que a pessoa DISSE no vídeo (teses, com o minuto);
 * 2. o que estão falando sobre isso agora (achados, com fonte e data);
 * 3. dados para sustentar, com fonte;
 * 4. o ângulo de cada dia, na ordem que o cliente escolheu.
 *
 * Regra que vale mais que todas: nada inventado. Achado e dado só entram se
 * vieram da pesquisa; sem pesquisa, as listas ficam vazias e o card diz isso.
 * Mora em `video_jobs.radar` porque nasce antes de existir run ou card, e os
 * redatores leem de lá.
 */

export type Radar = {
  tema: string;
  resumo: string;
  teses: Array<{ minuto: string; frase: string }>;
  achados: Array<{ titulo: string; fonte: string; data: string; relacao: string }>;
  dados: Array<{ valor: string; oQueMede: string; fonte: string }>;
  angulos: Array<{ dia: number; formato: string; texto: string }>;
  fontes: Array<{ title: string; url: string }>;
  semPesquisaWeb?: string;
  pesquisadoEm: string;
};

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function mmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * JSON tolerante: o modelo às vezes embrulha em cerca de código ou escreve
 * uma linha antes. Pega do primeiro "{" ao último "}".
 */
function lerJson<T>(bruto: string): T {
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    const a = limpo.indexOf("{");
    const b = limpo.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(limpo.slice(a, b + 1)) as T;
    throw new Error("Resposta sem JSON");
  }
}

const SISTEMA_ROBERTO =
  "Você é Roberto Radar, pesquisador de conteúdo do squad. Você lê a transcrição de uma gravação e prepara o briefing que os redatores usam. " +
  "Você NUNCA inventa dados, estudos, nomes ou citações: o que não está na transcrição nem na pesquisa não existe. " +
  "O briefing é lido pelo DONO do vídeo: fale com ele como \"você\" (\"você defende\", \"o que você disse\"), nunca \"a pessoa\", \"o autor\" ou \"o palestrante\". " +
  "Responda SEMPRE em JSON válido, sem comentário, sem cerca de código, sem quebra de linha dentro de strings. Sem travessão: use vírgula, dois-pontos ou parênteses.";

/**
 * Casa os ângulos que o modelo devolveu com os dias escolhidos.
 *
 * Pela POSIÇÃO quando ele devolveu um ângulo por dia (o prompt pede a mesma
 * ordem da lista): o número do dia que ele escreve não é confiável. Em 02/09,
 * com a lista "terça, quarta, quinta, sábado", ele devolveu 2, 3, 5 e 7, e o
 * briefing saiu com "sexta (Thread)" e "domingo (Carrossel)". Só quando a
 * contagem não bate é que o número dele vale, e mesmo assim só se for um dia
 * escolhido.
 */
function angulosPorDia(
  brutos: Array<{ dia?: unknown; texto?: unknown }>,
  dias: Array<{ dia: number; formato: FormatoDoDia }>
): Radar["angulos"] {
  const comTexto = brutos.filter((a) => typeof a?.texto === "string" && a.texto.trim());
  if (comTexto.length === dias.length) {
    return dias.map((d, i) => ({
      dia: d.dia,
      formato: ROTULO_DO_FORMATO[d.formato],
      texto: String(comTexto[i].texto).trim(),
    }));
  }
  return comTexto.flatMap((a) => {
    const d = dias.find((x) => x.dia === a.dia);
    return d ? [{ dia: d.dia, formato: ROTULO_DO_FORMATO[d.formato], texto: String(a.texto).trim() }] : [];
  });
}

/** O texto que o card do Roberto mostra, nas quatro seções do desenho. */
export function textoDoRadar(radar: Radar): string {
  const partes: string[] = [];
  partes.push(`TEMA: ${radar.tema}\n\n${radar.resumo}`);
  partes.push(
    "O QUE VOCÊ DISSE NO VÍDEO\n" +
      radar.teses.map((t) => `[${t.minuto}] ${t.frase}`).join("\n")
  );
  partes.push(
    "O QUE ESTÃO FALANDO SOBRE ISSO AGORA\n" +
      (radar.achados.length
        ? radar.achados.map((a) => `- ${a.titulo}\n  ${a.fonte}${a.data ? `, ${a.data}` : ""}. ${a.relacao}`).join("\n")
        : radar.semPesquisaWeb ?? "A pesquisa na web não trouxe achado com fonte. Nada foi inventado no lugar.")
  );
  partes.push(
    "DADOS PARA SUSTENTAR, COM FONTE\n" +
      (radar.dados.length
        ? radar.dados.map((d) => `- ${d.valor}: ${d.oQueMede} (${d.fonte})`).join("\n")
        : "Nenhum dado com fonte verificável apareceu na pesquisa. Os textos ficam sem número, e não com número inventado.")
  );
  partes.push(
    "ÂNGULO DE CADA DIA, NA ORDEM QUE VOCÊ ESCOLHEU\n" +
      radar.angulos.map((a) => `${DIAS[a.dia] ?? a.dia} (${a.formato}): ${a.texto}`).join("\n")
  );
  if (radar.fontes.length) {
    partes.push("FONTES\n" + radar.fontes.slice(0, 8).map((f) => `- ${f.title}: ${f.url}`).join("\n"));
  }
  return partes.join("\n\n");
}

/**
 * Faz (ou refaz, com `forcar`) a pesquisa de um vídeo. Idempotente: com radar
 * salvo e sem `forcar`, devolve o que já existe sem gastar nada.
 */
export async function pesquisarDoVideo(videoJobId: string, opts?: { forcar?: boolean }): Promise<Radar | null> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      transcript: true,
      radar: true,
      durationSec: true,
      project: {
        select: {
          name: true,
          niche: true,
          targetAudience: true,
          voice: true,
          videoSemana: true,
        },
      },
    },
  });
  if (!video) return null;
  if (video.radar && !opts?.forcar) return video.radar as unknown as Radar;

  const transcript = video.transcript as {
    text?: string;
    paragraphs?: Array<{ text: string; start: number; end: number }>;
  } | null;
  if (!transcript?.text?.trim()) return null;

  // A semana que o cliente escolheu manda no ângulo por dia. Se o run já
  // existe, a cópia congelada no run vale mais do que a escolha atual do
  // projeto (ele pode ter mudado a semana para a próxima gravação).
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { config: true },
  });
  const semanaBruta = (run?.config as { semana?: unknown } | null)?.semana ?? video.project.videoSemana;
  const dias = diasDaSemana(normalizarSemana(semanaBruta));

  const prefixo = montarPrefixoCacheavel({
    nicho: video.project.niche,
    publico: video.project.targetAudience,
    voz: video.project.voice,
  });
  const usage = { operation: "video_radar", projectId: video.projectId, agentId: "roberto-radar" };

  // Transcrição com o minuto de cada parágrafo, para as teses saírem com
  // marcação de tempo de verdade e não com minuto chutado.
  const paragrafos = transcript.paragraphs ?? [];
  const comTempo = paragrafos.length
    ? paragrafos.map((p) => `[${mmss(p.start)}] ${p.text}`).join("\n")
    : transcript.text;

  // ── 1. As teses, da transcrição ─────────────────────────────────────────
  const brutoTeses = await askClaude(
    SISTEMA_ROBERTO,
    `Leia a transcrição abaixo (cada parágrafo começa com o minuto entre colchetes) e devolva:

{"tema": "o assunto central em até 12 palavras",
 "resumo": "o que você defende no vídeo, em 2 frases, falando com o dono do vídeo como você",
 "teses": [{"minuto": "mm:ss", "frase": "a tese em uma frase forte, com as suas próprias palavras do vídeo quando possível"}],
 "perguntas": ["2 ou 3 perguntas de pesquisa para descobrir o que estão falando sobre isso agora e que dados existem"]}

Entre 3 e 5 teses, cada uma de um trecho diferente, com o minuto do parágrafo de onde saiu.

TRANSCRIÇÃO:
${comTempo.slice(0, 60000)}`,
    { maxTokens: 6000, cachedPrefix: prefixo, usage }
  );
  const teses = lerJson<{ tema?: string; resumo?: string; teses?: Radar["teses"]; perguntas?: string[] }>(brutoTeses);
  const tema = teses.tema?.trim() || "o tema do vídeo";

  // ── 2. A pesquisa na web ────────────────────────────────────────────────
  let resumoWeb = "";
  let fontes: Radar["fontes"] = [];
  let semPesquisaWeb: string | undefined;
  const geminiKey = process.env.GEMINI_API_KEY ?? "";
  if (!geminiKey) {
    semPesquisaWeb = "A pesquisa na web está desligada neste ambiente (sem chave). Nada foi inventado no lugar.";
  } else {
    try {
      const topico = [tema, ...(teses.perguntas ?? []).slice(0, 3)].join(". ");
      const r = await researchTopic(
        topico,
        video.project.niche ?? "negócios",
        video.project.targetAudience ?? "público geral",
        geminiKey
      );
      resumoWeb = r.summary ?? "";
      fontes = (r.sources ?? []).filter((s) => s.url).slice(0, 8);
    } catch (e) {
      console.error(`[radar][${videoJobId}] pesquisa web falhou:`, e);
      semPesquisaWeb = "A pesquisa na web falhou desta vez. Nada foi inventado no lugar; peça para pesquisar de novo.";
    }
  }

  // ── 3. Achados, dados e o ângulo por dia ────────────────────────────────
  const listaDias = dias.length
    ? dias.map((d) => `dia ${d.dia} = ${DIAS[d.dia]} (${ROTULO_DO_FORMATO[d.formato]})`).join(", ")
    : "nenhum dia além do vídeo de segunda";
  const brutoRadar = await askClaude(
    SISTEMA_ROBERTO,
    `TEMA: ${tema}
RESUMO: ${teses.resumo ?? ""}
TESES DO VÍDEO:
${(teses.teses ?? []).map((t) => `[${t.minuto}] ${t.frase}`).join("\n")}

RESULTADO DA PESQUISA NA WEB (a única fonte permitida para achados e dados; se estiver vazio, devolva as listas vazias):
${resumoWeb || "(vazio)"}

FONTES ENCONTRADAS:
${fontes.map((f) => `- ${f.title}: ${f.url}`).join("\n") || "(nenhuma)"}

DIAS DA SEMANA QUE VÃO TER POST, NA ORDEM, COM O FORMATO ESCOLHIDO PELO CLIENTE: ${listaDias}

Devolva:
{"achados": [{"titulo": "o que estão dizendo, em uma frase", "fonte": "veículo, perfil ou instituição", "data": "mês/ano ou data, se souber; vazio se não souber", "relacao": "como conversa com uma tese do vídeo (concorda, discorda, complementa), citando o minuto"}],
 "dados": [{"valor": "o número, como 62%", "oQueMede": "o que o número mede", "fonte": "instituição e ano"}],
 "angulos": [{"dia": 2, "formato": "Texto", "texto": "o ângulo desse dia em uma frase, citando qual tese (minuto) e qual achado ou dado usar"}]}

Até 3 achados e até 3 dados, SOMENTE se estiverem no resultado da pesquisa acima, com a fonte que a pesquisa deu. Um ângulo por dia listado, na mesma ordem e com o mesmo número de dia da lista acima. Cada dia pega uma tese diferente quando possível; carrossel pode juntar as teses.`,
    { maxTokens: 6000, cachedPrefix: prefixo, usage }
  );
  const resto = lerJson<Partial<Pick<Radar, "achados" | "dados" | "angulos">>>(brutoRadar);

  const radar: Radar = {
    tema,
    resumo: teses.resumo?.trim() ?? "",
    teses: (teses.teses ?? []).filter((t) => t?.frase).slice(0, 5),
    achados: resumoWeb ? (resto.achados ?? []).filter((a) => a?.titulo).slice(0, 3) : [],
    dados: resumoWeb ? (resto.dados ?? []).filter((d) => d?.valor).slice(0, 3) : [],
    angulos: angulosPorDia(resto.angulos ?? [], dias),
    fontes,
    ...(semPesquisaWeb ? { semPesquisaWeb } : {}),
    pesquisadoEm: new Date().toISOString(),
  };

  await prisma.videoJob.update({
    where: { id: video.id },
    data: { radar: radar as unknown as Prisma.InputJsonValue },
  });

  // O card do Roberto, se o quadro já existe. Antes do agendar não há run, e
  // aí é o próprio agendar que cria o card lendo daqui.
  await gravarCardDoRadar(video.id).catch((e) => console.error(`[radar][${videoJobId}] card falhou:`, e));

  return radar;
}

/**
 * Cria ou atualiza o card de segunda do Roberto no quadro do vídeo. Sem run
 * ainda, não faz nada (o agendar chama de novo).
 */
export async function gravarCardDoRadar(videoJobId: string): Promise<boolean> {
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: { id: true, projectId: true, radar: true, durationSec: true },
  });
  if (!video) return false;
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, weekStart: true },
  });
  if (!run) return false;

  const radar = video.radar as unknown as Radar | null;
  const minutos = video.durationSec ? Math.max(1, Math.round(video.durationSec / 60)) : null;
  const content = radar
    ? textoDoRadar(radar)
    : `Roberto está pesquisando a partir da transcrição${minutos ? ` do vídeo de ${minutos} min` : ""}: o que você disse, o que estão falando sobre isso agora e dados com fonte. O briefing aparece aqui em instantes.`;

  const existente = await prisma.campaignCard.findFirst({
    where: { runId: run.id, agentId: "roberto-radar" },
    select: { id: true, metadata: true },
  });
  const meta = {
    ...(((existente?.metadata as Record<string, unknown> | null) ?? {})),
    origem: "video",
    videoJobId: video.id,
    ...(radar
      ? {
          tema: radar.tema,
          teses: radar.teses.length,
          fontes: radar.fontes.length,
          pesquisadoEm: radar.pesquisadoEm,
          sources: radar.fontes,
        }
      : { aguardando: true }),
  };
  if (existente) {
    await prisma.campaignCard.update({
      where: { id: existente.id },
      data: { content, status: radar ? "completed" : "pending", metadata: meta as Prisma.InputJsonValue },
    });
    return true;
  }
  const segunda = run.weekStart ?? new Date();
  const data = new Date(segunda);
  data.setUTCHours(9, 0, 0, 0);
  await prisma.campaignCard.create({
    data: {
      runId: run.id,
      projectId: video.projectId,
      agentId: "roberto-radar",
      agentName: "Roberto Radar",
      dayOfWeek: 1,
      scheduledDate: data,
      cardType: "research",
      mediaType: "text",
      content,
      status: radar ? "completed" : "pending",
      metadata: meta as Prisma.InputJsonValue,
    },
  });
  return true;
}
