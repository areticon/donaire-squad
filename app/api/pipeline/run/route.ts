export const dynamic = 'force-dynamic'

import { auth } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { generateVideo, VeoUnavailableError } from "@/lib/media/veo3";
import { generateInfographic } from "@/lib/media/infographic";
import { researchTopic, formatSourcesSection } from "@/lib/research/web-search";
import { newArticlePublicToken, parseLinkedInArticleContent } from "@/lib/articles/linkedin-article";
import {
  getMediaStylePromptFragment,
  maxNarrationWordsForDuration,
  type MediaStyleId,
} from "@/lib/media/media-style";

export const maxDuration = 300;

type FunnelStage = "tofu" | "mofu" | "bofu";
type ContentType = "text" | "image" | "video" | "carousel" | "infographic" | "poll" | "article" | "thread" | "free";
type CampaignMode = "single" | "weekly" | "biweekly" | "recurring";

interface WeeklySchedule {
  "1": ContentType;
  "2": ContentType;
  "3": ContentType;
  "4": ContentType;
  "5": ContentType;
}

interface CampaignConfig {
  campaignMode: CampaignMode;
  funnelStage: FunnelStage;
  weeklySchedule: WeeklySchedule;
  postingTimes?: Record<string, string>; // dayOfWeek -> "HH:mm"
  singleScheduledAt?: string;            // full UTC ISO computed by browser
  postingTimestamps?: Record<string, string>; // dayOfWeek -> full UTC ISO
  singleDay?: number;
  singleDate?: string; // YYYY-MM-DD (overrides weekStart + singleDay)
  singleTime?: string; // "HH:mm"
  singlePlatform?: "linkedin" | "twitter" | "both";
  singleContentType?: ContentType;
  weekStart?: string; // ISO date string of Monday
  videoDuration?: 5 | 6 | 8; // seconds — Veo supported values
  videoAudio?: boolean; // generate Portuguese narration via Veo 3 audio
  mediaStyle?: MediaStyleId; // visual style for image / video / carousel
}

interface AgentStep {
  agentId: string;
  name: string;
  role: string;
  persona: string;
  style: string;
}

const FUNNEL_INSTRUCTIONS: Record<FunnelStage, string> = {
  tofu: "Escreva para atrair curiosidade e alcance máximo. Não assuma conhecimento prévio do leitor. Seja leve, informativo e surpreendente.",
  mofu: "Escreva para quem já conhece o nicho. Seja provocativo, técnico e aprofundado. Gere debate e reflexão.",
  bofu: "Inclua CTA claro e urgência. Use prova social, números e benefícios diretos. Foco total em conversão.",
};

const DAY_NAMES: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  7: "Domingo",
};

/**
 * Extrai URLs da seção "FONTES:" do brief de pesquisa e retorna texto formatado
 * para ser publicado como primeiro comentário no LinkedIn.
 */
function extractFirstComment(researchBrief: string): string | undefined {
  const sourcesMatch = researchBrief.match(/FONTES:\s*([\s\S]+?)(?:\n\n|\n(?=[A-Z])|$)/i);
  if (!sourcesMatch) return undefined;

  const lines = sourcesMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && (l.startsWith("-") || l.startsWith("•") || l.match(/^\d+\./)));

  if (lines.length === 0) return undefined;

  const formatted = lines
    .slice(0, 5)
    .map((l) => l.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .join("\n");

  return `📚 Fontes e referências:\n\n${formatted}`;
}

/** Returns the Date for a given dayOfWeek (1=Mon) relative to weekStart (a Monday ISO string) */
function getScheduledDate(weekStartIso: string, dayOfWeek: number): Date {
  const base = new Date(weekStartIso);
  base.setDate(base.getDate() + (dayOfWeek - 1));
  return base;
}

/** Merges a date with a time string "HH:mm" into a DateTime */
function mergeDateTime(dateIso: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(dateIso + "T00:00:00.000Z");
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

/** Returns Monday of the current week as ISO date string */
function currentMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

async function appendLog(runId: string, entry: object) {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  const current = Array.isArray(run?.logs) ? run.logs : [];
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { logs: [...current, { ...entry, timestamp: new Date().toISOString() }] },
  });
}

// ── Platform limits (official API constraints) ───────────────────────────────
const PLATFORM_LIMITS = {
  linkedin: {
    post: 3000,        // ShareCommentary max chars
    pollIntro: 3000,   // Poll intro text max chars
    pollQuestion: 150, // Poll question max chars
    pollOption: 30,    // Poll option max chars
    articleTitle: 200,
    articleTeaser: 400,
    articleBodyTarget: 4000,
    postTarget: 1300,    // Regular post target (comfortable under cap)
  },
  twitter: {
    tweet: 280,        // Single tweet max chars
    tweetTarget: 270,  // Thread tweet target (buffer for numbering)
    pollOption: 25,    // Poll option max chars
  },
} as const;

/**
 * Returns the LinkedIn rules block to embed in every Lucas prompt.
 * This ensures the agent always knows the constraints regardless of post type.
 */
function linkedinRules(type: "post" | "article" | "poll"): string {
  if (type === "poll") {
    return `
📋 REGRAS OBRIGATÓRIAS DO LINKEDIN — ENQUETE:
• TEXTO_INTRO: máximo ${PLATFORM_LIMITS.linkedin.pollIntro} chars (ideal: até 200)
• PERGUNTA: máximo ${PLATFORM_LIMITS.linkedin.pollQuestion} chars
• Cada OPCAO_X: máximo ${PLATFORM_LIMITS.linkedin.pollOption} chars
• Não use hashtags nas opções
• Siga o formato exato — qualquer campo fora do formato causa falha na publicação`;
  }
  if (type === "article") {
    return `
📋 REGRAS OBRIGATÓRIAS — ARTIGO LINKEDIN (texto completo + card no feed):
O LinkedIn exibirá um CARD com título e resumo; ao clicar, abre a página com o texto INTEIRO (CORPO).
Formato OBRIGATÓRIO (três blocos, nesta ordem):

TITULO: [uma linha, máx ${PLATFORM_LIMITS.linkedin.articleTitle} caracteres — título editorial forte]

RESUMO_CARD: [uma linha, máx ${PLATFORM_LIMITS.linkedin.articleTeaser} caracteres — gancho para o card no feed; sem hashtags]

CORPO:
[texto completo do artigo a partir daqui — alvo ${PLATFORM_LIMITS.linkedin.articleBodyTarget}+ caracteres, bem desenvolvido]
• Parágrafos separados por linha em branco
• Pode incluir menções a fontes com link quando fizer sentido (URL completa em linha própria)
• Sem markdown (# ** *). Texto limpo.
• Não truncar o CORPO artificialmente — o leitor vê tudo na página do artigo`;
  }
  return `
📋 REGRAS OBRIGATÓRIAS DO LINKEDIN — POST:
• Comprimento alvo: até ${PLATFORM_LIMITS.linkedin.postTarget} chars
• LIMITE ABSOLUTO: ${PLATFORM_LIMITS.linkedin.post} chars — nunca exceda
• Hashtags e emojis contam no total de chars
• Use no máximo 5 hashtags
• Não invente dados ou estatísticas`;
}

/**
 * Returns the Twitter rules block to embed in every Tiago prompt.
 */
function twitterRules(type: "thread" | "poll" | "single"): string {
  if (type === "poll") {
    return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — ENQUETE:
• TWEET: máximo ${PLATFORM_LIMITS.twitter.tweet} chars (incluindo espaços e emojis)
• Cada OPCAO_X: máximo ${PLATFORM_LIMITS.twitter.pollOption} chars
• Não inclua hashtags nas opções
• Formato exato obrigatório — desvio causa falha na publicação`;
  }
  if (type === "single") {
    return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — TWEET:
• LIMITE ABSOLUTO: ${PLATFORM_LIMITS.twitter.tweet} chars — nunca exceda
• Emojis e URLs contam no total`;
  }
  return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — THREAD:
• Cada tweet individualmente: máximo ${PLATFORM_LIMITS.twitter.tweet} chars
• Alvo por tweet: até ${PLATFORM_LIMITS.twitter.tweetTarget} chars (10 chars de folga para formatação)
• Numere como: 1/ 2/ 3/ ... (o número e a barra contam nos chars)
• Conte os chars de cada tweet antes de finalizar
• Emojis e URLs encurtadas contam como chars`;
}

/**
 * Validate and auto-fix Twitter thread tweets exceeding the char limit.
 * Returns { content, fixedCount } where fixedCount > 0 means some tweets needed trimming.
 */
function validateTwitterThread(content: string): { content: string; violations: string[] } {
  const lines = content.split("\n");
  const tweets: string[] = [];
  let currentTweet = "";

  for (const line of lines) {
    if (/^\d+[\/\)]\s/.test(line) && currentTweet) {
      tweets.push(currentTweet.trim());
      currentTweet = line;
    } else {
      currentTweet += (currentTweet ? "\n" : "") + line;
    }
  }
  if (currentTweet.trim()) tweets.push(currentTweet.trim());

  const violations: string[] = [];
  for (let i = 0; i < tweets.length; i++) {
    if (tweets[i].length > PLATFORM_LIMITS.twitter.tweet) {
      violations.push(`Tweet ${i + 1} tem ${tweets[i].length} chars (limite: ${PLATFORM_LIMITS.twitter.tweet})`);
    }
  }
  return { content, violations };
}

async function saveCard(data: {
  runId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  scheduledDate?: Date;
  cardType: string;
  mediaType?: string;
  content?: string;
  mediaUrl?: string;
  postId?: string;
  metadata?: Record<string, unknown>;
  status?: string;
}) {
  const { metadata, ...rest } = data;
  return prisma.campaignCard.create({
    data: {
      ...rest,
      ...(metadata !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

/** Parse poll content from structured agent output */
function parsePollContent(content: string): Record<string, unknown> {
  const lines = content.split("\n").map((l) => l.trim());
  const get = (prefix: string) =>
    lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";

  const intro = get("TEXTO_INTRO:");
  const question = get("PERGUNTA:");
  const opt1 = get("OPCAO_1:");
  const opt2 = get("OPCAO_2:");
  const opt3 = get("OPCAO_3:");
  const opt4 = get("OPCAO_4:");
  const duration = (get("DURACAO:") || "THREE_DAYS") as string;
  const options = [opt1, opt2, opt3, opt4].filter(Boolean);

  return { type: "poll", intro, question, options, duration };
}

/** Parse Twitter poll content from structured agent output */
function parseTwitterPollContent(content: string): Record<string, unknown> {
  const lines = content.split("\n").map((l) => l.trim());
  const get = (prefix: string) =>
    lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";

  const tweet = get("TWEET:");
  const opt1 = get("OPCAO_1:");
  const opt2 = get("OPCAO_2:");
  const durationHours = parseInt(get("DURACAO_HORAS:") || "1440");
  const options = [opt1, opt2].filter(Boolean);

  return { type: "twitter_poll", tweet, options, durationHours };
}

async function runAgent(
  agent: AgentStep,
  task: string,
  context: string,
  runId: string,
  funnelInstruction: string,
  agentOptions?: { maxTokens?: number }
): Promise<string> {
  await appendLog(runId, {
    agent: agent.name,
    message: `Iniciando: ${task.slice(0, 80)}...`,
    status: "running",
  });

  const system = `Você é ${agent.name}, ${agent.role}.
Persona: ${agent.persona}
Estilo: ${agent.style}

Diretriz de funil: ${funnelInstruction}

Você está trabalhando em um projeto de conteúdo para redes sociais.
Responda sempre em português, com qualidade profissional e acentos corretos.
IMPORTANTE: Não use markdown (sem #, sem **, sem *). Escreva texto limpo com parágrafos separados por linha em branco.

REGRA DE OURO — INTEGRIDADE DE DADOS (obrigatório):
Você NUNCA pode inventar estatísticas, nomes de pessoas reais, nomes de empresas, estudos, pesquisas ou indicadores de mercado.
Se precisar citar um número, um estudo, uma empresa ou indicador, use SOMENTE dados reais e verificáveis, indicando sempre a fonte (ex: "segundo a McKinsey, 2024" ou "de acordo com o IBGE, 2025").
Apenas a redação, argumentação e estrutura textual devem ser criativas — os fatos devem ser sempre reais.
Se não tiver dados reais sobre um ponto específico, deixe em aberto para o usuário preencher com dados reais — não invente.`;

  const result = await askClaude(system, `${task}\n\nContexto:\n${context}`, {
    maxTokens: agentOptions?.maxTokens ?? 2048,
  });

  await appendLog(runId, {
    agent: agent.name,
    message: `Tarefa concluída.`,
    output: result,
    status: "completed",
  });

  return result;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, topic, campaignConfig } = await req.json();
  if (!projectId || !topic) {
    return NextResponse.json({ error: "projectId and topic required" }, { status: 400 });
  }

  const config: CampaignConfig = campaignConfig ?? {
    campaignMode: "weekly",
    funnelStage: "tofu",
    weeklySchedule: { "1": "text", "2": "image", "3": "text", "4": "image", "5": "free" }, // Sáb/Dom ausentes = não gerar
    weekStart: currentMonday(),
  };

  // Ensure weekStart is set
  if (!config.weekStart) config.weekStart = currentMonday();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      agents: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      socialAccounts: { where: { isActive: true } },
      contexts: true,
    },
  });

  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clean old media from drafts
  const oldRuns = await prisma.pipelineRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { startedAt: "desc" },
    skip: 2,
    select: { id: true },
  });
  if (oldRuns.length > 0) {
    await prisma.post.updateMany({
      where: {
        projectId,
        runId: { in: oldRuns.map((r) => r.id) },
        imageUrl: { not: null },
        status: { in: ["draft", "failed"] },
      },
      data: { imageUrl: null },
    });
  }

  const weekStartDate = new Date(config.weekStart + "T00:00:00.000Z");

  const run = await prisma.pipelineRun.create({
    data: {
      projectId,
      status: "running",
      topic,
      campaignMode: config.campaignMode,
      weekStart: weekStartDate,
      config: config as unknown as Prisma.InputJsonValue,
      logs: [],
    },
  });

  // `after()` keeps the serverless function alive until the pipeline finishes,
  // even after the HTTP response has already been sent to the client.
  // Without this, changing browser tabs or closing the window could kill the generation.
  after(async () => {
    try {
      await runPipeline(run.id, project, topic, config);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[pipeline]", err);
      await appendLog(run.id, {
        agent: "Sistema",
        message: `Erro no pipeline: ${message}`,
        status: "failed",
      });
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { status: "failed", endedAt: new Date() },
      });
    }
  });

  return NextResponse.json({ run });
}

async function runPipeline(
  runId: string,
  project: Awaited<ReturnType<typeof prisma.project.findUnique>> & {
    agents: Array<{
      id: string;
      agentId: string;
      name: string;
      role: string;
      persona: string | null;
      style: string | null;
    }>;
    socialAccounts: Array<{ id: string; platform: string; blotatoAccountId: string | null }>;
    contexts: Array<{ id: string; type: string; title: string; compiled: string }>;
  },
  topic: string,
  config: CampaignConfig
) {
  if (!project) return;

  const funnelInstruction = FUNNEL_INSTRUCTIONS[config.funnelStage];
  const weekStartIso = config.weekStart ?? currentMonday();

  // Determine which weeks and days to generate for
  const weeksToGenerate: number[] = config.campaignMode === "biweekly" ? [0, 1] : [0];

  /** Get scheduledAt datetime for a given dayOfWeek + weekOffset, including time from config */
  function getScheduledAt(dayOfWeek: number, weekOffset: number): Date {
    // Prefer pre-computed UTC ISO from the browser (timezone-correct)
    if (config.campaignMode === "single" && config.singleScheduledAt) {
      return new Date(config.singleScheduledAt);
    }
    if (weekOffset === 0 && config.postingTimestamps?.[String(dayOfWeek)]) {
      return new Date(config.postingTimestamps[String(dayOfWeek)]);
    }
    // Fallback: compute server-side (always use UTC to avoid local-timezone drift)
    if (config.campaignMode === "single" && config.singleDate) {
      const time = config.singleTime ?? "09:00";
      return mergeDateTime(config.singleDate, time);
    }
    const offsetDays = weekOffset * 7;
    const d = new Date(weekStartIso + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + (dayOfWeek - 1) + offsetDays); // UTC-safe
    const timeStr =
      config.campaignMode === "single"
        ? (config.singleTime ?? "09:00")
        : (config.postingTimes?.[String(dayOfWeek)] ?? "09:00");
    const [hours, minutes] = timeStr.split(":").map(Number);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  // Build day list from config
  function getDaysList(): Array<{ dayOfWeek: number; contentType: ContentType; weekOffset: number }> {
    if (config.campaignMode === "single") {
      // Derive actual dayOfWeek from the scheduled date/timestamp (not the stale singleDay field)
      let day = config.singleDay ?? 1;
      if (config.singleScheduledAt) {
        const utcDay = new Date(config.singleScheduledAt).getUTCDay(); // 0=Sun
        day = utcDay === 0 ? 7 : utcDay; // convert to 1=Mon…7=Sun
      } else if (config.singleDate) {
        const utcDay = new Date(config.singleDate + "T12:00:00.000Z").getUTCDay();
        day = utcDay === 0 ? 7 : utcDay;
      }
      const ct = config.singleContentType ?? "text";
      return [{ dayOfWeek: day, contentType: ct, weekOffset: 0 }];
    }

    if (config.campaignMode === "recurring") {
      // Agent decides — Mon(text), Wed(image or carousel), Fri(poll or article)
      return [
        { dayOfWeek: 1, contentType: "text" as ContentType, weekOffset: 0 },
        { dayOfWeek: 3, contentType: "image" as ContentType, weekOffset: 0 },
        { dayOfWeek: 5, contentType: "poll" as ContentType, weekOffset: 0 },
      ];
    }

    const result: Array<{ dayOfWeek: number; contentType: ContentType; weekOffset: number }> = [];

    // Today midnight (UTC) — used to skip past days when no explicit timestamp is provided
    const nowUtc = new Date();
    nowUtc.setUTCHours(0, 0, 0, 0);

    for (const weekOffset of weeksToGenerate) {
      for (const [dayKey, contentType] of Object.entries(config.weeklySchedule)) {
        if (!contentType) continue; // skip days without content type (= off)

        const dayOfWeek = parseInt(dayKey);

        if (weekOffset === 0) {
          // If the frontend provided explicit timestamps, only generate days that are included.
          // Missing days were intentionally excluded (e.g. they fall in the past).
          if (config.postingTimestamps && !(dayKey in config.postingTimestamps)) {
            continue;
          }

          // Safety net: even without explicit timestamps, skip days whose calendar date
          // is strictly before today (handles edge cases / old clients).
          if (!config.postingTimestamps) {
            const dayDate = new Date(config.weekStart + "T00:00:00.000Z");
            dayDate.setUTCDate(dayDate.getUTCDate() + (dayOfWeek - 1));
            if (dayDate < nowUtc) continue;
          }
        }

        result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset });
      }
    }
    return result;
  }

  const daysList = getDaysList();

  // Build context block from ProjectContext
  const contextDocs = project.contexts.length > 0
    ? "\n\n--- CONTEXTO DO PROJETO ---\n" + project.contexts.map((c) => `## ${c.title}\n${c.compiled}`).join("\n\n")
    : "";

  function makeAgent(agentId: string): AgentStep | null {
    const a = project!.agents.find((x) => x.agentId === agentId);
    if (!a) return null;
    return {
      agentId: a.agentId,
      name: a.name,
      role: a.role,
      persona: a.persona ?? "",
      style: a.style ?? "",
    };
  }

  const baseContext = JSON.stringify({
    topic,
    projectName: project.name,
    niche: project.niche ?? "",
    targetAudience: project.targetAudience ?? "",
    voice: project.voice ?? "",
    funnelStage: config.funnelStage,
    campaignMode: config.campaignMode,
  }) + contextDocs;

  // ── Step 1: Research (Roberto) ────────────────────────────────────────────
  await appendLog(runId, { agent: "Sistema", message: "Iniciando pesquisa...", status: "running" });
  const researcher = makeAgent("roberto-radar");
  let researchBrief = "";

  if (researcher) {
    // 1a. Busca web em tempo real via Gemini + Google Search Grounding
    let webSearchData = "";
    let webSources: Array<{ title: string; url: string }> = [];
    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        await appendLog(runId, { agent: "Roberto Radar", message: "Buscando dados em tempo real (Google Search)...", status: "running" });
        const searchResult = await researchTopic(
          topic,
          project.niche ?? "geral",
          project.targetAudience ?? "profissionais",
          geminiKey
        );
        webSearchData = searchResult.summary;
        webSources = searchResult.sources;
        await appendLog(runId, {
          agent: "Roberto Radar",
          message: `Pesquisa web concluída — ${webSources.length} fontes encontradas.`,
          status: "running",
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await appendLog(runId, { agent: "Roberto Radar", message: `Aviso: busca web falhou (${errMsg.slice(0, 120)}). Usando conhecimento interno.`, status: "warning" });
      }
    }

    // 1b. Roberto sintetiza os dados reais em um brief estruturado
    const sourcesSection = formatSourcesSection(webSources);
    const webContext = webSearchData
      ? `\n\n=== DADOS REAIS ENCONTRADOS NA WEB (use estes dados — são atuais e verificados) ===\n\n${webSearchData}\n\n=== FIM DOS DADOS WEB ===`
      : "";

    researchBrief = await runAgent(
      researcher,
      `Compile um brief de pesquisa completo sobre: "${topic}".
Nicho: ${project.niche ?? "geral"}. Público: ${project.targetAudience ?? "profissionais"}.
${webSearchData ? `\nVocê tem acesso aos dados reais mais recentes encontrados na web (veja abaixo). Use-os como base principal do brief.` : ""}

ESTRUTURA DO BRIEF (siga esta ordem):
1. Contexto atual: o que está acontecendo AGORA com este tema (últimas semanas/meses)
2. Dados e estatísticas: números reais com fonte explícita
3. Tendências quentes: o que está em alta no LinkedIn, X e Google
4. Insights acionáveis: o que o público-alvo precisa saber/fazer
5. Ângulos de conteúdo: 3 perspectivas diferentes para abordar o tema${sourcesSection ? `\n\nAo final, inclua a seção de fontes abaixo exatamente como está:\n${sourcesSection}` : `\n\nAo final do brief, adicione:\nFONTES:\n- [Nome da fonte com URL real]`}`,
      baseContext + webContext,
      runId,
      funnelInstruction,
      { maxTokens: 4096 }
    );

    // Save research card for each unique day
    for (const { dayOfWeek, weekOffset } of daysList.filter((v, i, a) => a.findIndex((x) => x.dayOfWeek === v.dayOfWeek && x.weekOffset === v.weekOffset) === i)) {
      const scheduledDate = getScheduledAt(dayOfWeek, weekOffset);

      await saveCard({
        runId,
        projectId: project.id,
        agentId: "roberto-radar",
        agentName: researcher.name,
        dayOfWeek,
        scheduledDate,
        cardType: "research",
        content: researchBrief,
      });
    }
  }

  const contextWithResearch = JSON.stringify({
    ...JSON.parse(baseContext.split("\n\n---")[0]),
    researchBrief
  }) + contextDocs;

  // ── Steps 2–6: Process each day completely (Lucas → Tiago → Diana → Vera → Paulo) ──────────
  // This way Day 1 is fully ready for review before Day 2 starts.
  const linkedinWriter = makeAgent("lucas-linkedin");
  const twitterWriter = makeAgent("tiago-twitter");
  const designer = makeAgent("diana-design");
  const reviewer = makeAgent("vera-veredito");

  const shouldWriteLinkedin =
    config.campaignMode !== "single" ||
    config.singlePlatform === "linkedin" ||
    config.singlePlatform === "both";
  const shouldWriteTwitter =
    config.campaignMode !== "single" ||
    config.singlePlatform === "twitter" ||
    config.singlePlatform === "both";

  interface DayPost {
    day: string;
    platform: string;
    content: string;
    mediaType: ContentType;
    dayOfWeek: number;
    scheduledDate: Date;
    cardId?: string;
    metadata?: Record<string, unknown>;
  }

  const dayPosts: DayPost[] = [];
  const writtenPostsLog: string[] = [];
  const agentRetries: Record<string, number> = {};
  const mediaByDayKey: Record<string, { imageUrl?: string; videoUrl?: string; imagePrompt?: string }> = {};
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  const liAccount = project.socialAccounts.find((a) => a.platform === "linkedin");
  const twAccount = project.socialAccounts.find((a) => a.platform === "twitter");
  const createdPostIds: string[] = [];

  /** Build Vera's review task string for a given day */
  function buildVeraTask(
    dow: number,
    liC: string | undefined,
    twC: string | undefined,
    mediaSt: string,
    isRetryRound: boolean
  ): string {
    return `${isRetryRound ? "⟳ SEGUNDA REVISÃO (após correção solicitada)\n\n" : ""}Faça uma revisão de qualidade COMPLETA e CRÍTICA do conteúdo para ${DAY_NAMES[dow]}.

CONTEÚDO PARA REVISAR:
LinkedIn: ${liC ?? "Não gerado"}

X (Twitter): ${twC ?? "Não gerado"}

STATUS DA MÍDIA (Diana Design): ${mediaSt}

CRITÉRIOS DE ACEITE OBRIGATÓRIOS — reprove se qualquer um falhar:
1. TOM DE VOZ: está alinhado ao projeto? Tom profissional e adequado ao nicho?
2. QUALIDADE DO TEXTO: coesão, coerência, ortografia correta, sem frases quebradas
3. DADOS REAIS: NENHUM dado inventado — se houver estatística sem fonte mencionável, é reprovação imediata
4. ADERÊNCIA AO FUNIL: segue a diretriz "${funnelInstruction}"?
5. MÍDIA OBRIGATÓRIA: se o tipo de conteúdo requer imagem/vídeo e o STATUS DA MÍDIA for "FALHOU", REPROVE — não aceite post sem mídia quando ela foi solicitada
6. COMPLETUDE: o post está finalizado e pronto para publicação sem edições manuais?

FORMATO DO VEREDITO (escreva exatamente uma das opções abaixo na última linha):
VEREDITO: APROVADO
VEREDITO: APROVADO_COM_RESSALVAS
VEREDITO: REPROVADO_TEXTO (se o problema é no conteúdo escrito — Lucas deve reescrever)
VEREDITO: REPROVADO_MIDIA (se o problema é na imagem/vídeo ausente ou incorreta — Diana deve regenerar)
VEREDITO: REPROVADO_AMBOS (se há problemas em texto E mídia)

Antes do veredito, liste os problemas encontrados de forma objetiva.`;
  }

  /** Parse Vera's structured verdict */
  function parseVeraVerdict(output: string): {
    verdict: "APROVADO" | "APROVADO_COM_RESSALVAS" | "REPROVADO_TEXTO" | "REPROVADO_MIDIA" | "REPROVADO_AMBOS";
    needsTextRetry: boolean;
    needsMediaRetry: boolean;
    approved: boolean;
  } {
    const lower = output.toLowerCase();
    const match = output.match(/VEREDITO:\s*(APROVADO_COM_RESSALVAS|APROVADO|REPROVADO_TEXTO|REPROVADO_MIDIA|REPROVADO_AMBOS)/i);
    if (match) {
      const v = match[1].toUpperCase() as ReturnType<typeof parseVeraVerdict>["verdict"];
      return {
        verdict: v,
        needsTextRetry: v === "REPROVADO_TEXTO" || v === "REPROVADO_AMBOS",
        needsMediaRetry: v === "REPROVADO_MIDIA" || v === "REPROVADO_AMBOS",
        approved: v === "APROVADO" || v === "APROVADO_COM_RESSALVAS",
      };
    }
    const isReprovado = lower.includes("reprovado");
    const mediaFailed = lower.includes("mídia") || lower.includes("imagem") || lower.includes("diana");
    const textFailed = lower.includes("texto") || lower.includes("lucas") || lower.includes("reescrever");
    return {
      verdict: isReprovado ? (mediaFailed && textFailed ? "REPROVADO_AMBOS" : mediaFailed ? "REPROVADO_MIDIA" : "REPROVADO_TEXTO") : "APROVADO",
      needsTextRetry: isReprovado && (textFailed || (!mediaFailed)),
      needsMediaRetry: isReprovado && mediaFailed,
      approved: !isReprovado,
    };
  }

  for (const { dayOfWeek, contentType, weekOffset } of daysList) {
    // ── Cancellation check ────────────────────────────────────────────────────
    const runCheck = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (runCheck?.status === "cancelled") {
      await appendLog(runId, { agent: "Sistema", message: "Geração cancelada pelo usuário.", status: "error" });
      return;
    }

    const dayName = DAY_NAMES[dayOfWeek];
    const scheduledDate = getScheduledAt(dayOfWeek, weekOffset);
    const dayKey = `${dayOfWeek}-${weekOffset}`;
    let dianaCardId: string | undefined;

    const resolvedType: ContentType =
      contentType === "free"
        ? (["text", "image", "poll", "image", "article"][((dayOfWeek - 1) % 5)] as ContentType)
        : contentType;

    // Build uniqueness guard ONCE per day — shared by LinkedIn and Twitter prompts
    const uniquenessBlock = writtenPostsLog.length > 0
      ? `\n\n⛔ POSTS JÁ ESCRITOS NESTA CAMPANHA (NUNCA repita o mesmo ângulo, dado, frase de abertura, conclusão ou CTA):\n${writtenPostsLog.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    // LinkedIn
    if (shouldWriteLinkedin && linkedinWriter) {
      let linkedinContent: string;
      let linkedinMetadata: Record<string, unknown> | undefined;

      if (resolvedType === "poll") {
        // Poll: generate structured question + 4 options
        linkedinContent = await runAgent(
          linkedinWriter,
          `Crie uma ENQUETE (poll) para LinkedIn para ${dayName} sobre: "${topic}".
${linkedinRules("poll")}

Formato OBRIGATÓRIO (siga exatamente, sem acrescentar campos extras):
TEXTO_INTRO: [1-2 frases instigantes, máx 200 chars]
PERGUNTA: [pergunta clara e direta, máx ${PLATFORM_LIMITS.linkedin.pollQuestion} chars]
OPCAO_1: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_2: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_3: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_4: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
DURACAO: THREE_DAYS

Use os dados da pesquisa. Não invente estatísticas.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );

        // Parse poll structure from the output
        linkedinMetadata = parsePollContent(linkedinContent);

      } else if (resolvedType === "article") {
        linkedinContent = await runAgent(
          linkedinWriter,
          `Escreva um ARTIGO COMPLETO para LinkedIn para ${dayName} sobre: "${topic}".
Tom de voz: ${project.voice || "especialista e reflexivo"}.
Estrutura sugerida no CORPO: abertura forte → desenvolvimento com dados reais e fontes → conclusão com CTA.
${linkedinRules("article")}
Use os dados da pesquisa. Não invente fatos.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction,
          { maxTokens: 8192 }
        );
        const parsedArt = parseLinkedInArticleContent(linkedinContent);
        linkedinMetadata = {
          type: "linkedin_article",
          articleTitle: parsedArt.title,
          articleTeaser: parsedArt.teaser,
        };

      } else {
        // Default: text, image, video, carousel, infographic
        const formatHint = resolvedType === "text"
          ? "apenas texto"
          : resolvedType === "image" || resolvedType === "carousel" || resolvedType === "infographic"
          ? "acompanha imagem/infográfico — o texto deve ser auto-suficiente sem ver a imagem"
          : resolvedType === "video"
          ? "acompanha vídeo — apresente o tema e chame para assistir"
          : "conteúdo rico";

        linkedinContent = await runAgent(
          linkedinWriter,
          `Escreva um post de LinkedIn para ${dayName} sobre: "${topic}".
Tom de voz: ${project.voice || "provocativo e direto, usa dados"}.
Formato: ${formatHint}.
${linkedinRules("post")}
Aborde um ÂNGULO DIFERENTE dos posts anteriores — perspectiva nova, dado diferente, CTA distinto.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );
      }

      // ── LinkedIn character limit enforcement ──────────────────────────────
      // If Lucas generated content over 3000 chars, ask him to rewrite it
      const LI_LIMIT = 3000;
      if (linkedinContent.length > LI_LIMIT && resolvedType !== "poll" && resolvedType !== "article") {
        await appendLog(runId, {
          agent: "Lucas LinkedIn",
          message: `Post gerado com ${linkedinContent.length} chars (limite: ${LI_LIMIT}). Solicitando reescrita...`,
          status: "warning",
        });
        const overLimitType = "post" as const;
        const rewritten = await runAgent(
          linkedinWriter,
          `O post abaixo ultrapassou o limite de ${LI_LIMIT} caracteres do LinkedIn (gerado com ${linkedinContent.length} chars).
Reescreva-o mantendo as ideias principais, mas OBRIGATORIAMENTE dentro de ${LI_LIMIT} caracteres. Não corte abruptamente — conclua com CTA.
${linkedinRules(overLimitType)}

POST ORIGINAL:
${linkedinContent}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );
        if (rewritten.length <= LI_LIMIT) {
          linkedinContent = rewritten;
          await appendLog(runId, { agent: "Lucas LinkedIn", message: `Reescrito com ${linkedinContent.length} chars ✓`, status: "running" });
        } else {
          // Second attempt failed too — hard-cap at generation level to avoid publish failure
          await appendLog(runId, {
            agent: "Lucas LinkedIn",
            message: `⚠ Segunda tentativa ainda acima do limite (${rewritten.length} chars). Usando versão original — publicação pode falhar.`,
            status: "warning",
          });
        }
      }

      // Adiciona primeiro comentário com fontes da pesquisa (exceto artigos, que já têm link)
      if (resolvedType !== "article" && resolvedType !== "poll") {
        const firstComment = extractFirstComment(researchBrief);
        if (firstComment) {
          linkedinMetadata = { ...(linkedinMetadata ?? {}), firstComment };
        }
      }

      const card = await saveCard({
        runId,
        projectId: project.id,
        agentId: "lucas-linkedin",
        agentName: linkedinWriter.name,
        dayOfWeek,
        scheduledDate,
        cardType: "post_linkedin",
        mediaType: resolvedType,
        content: linkedinContent,
        ...(linkedinMetadata ? { metadata: linkedinMetadata } : {}),
      });

      dayPosts.push({ day: dayName, platform: "linkedin", content: linkedinContent, mediaType: resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata: linkedinMetadata });

      // Register this post in the uniqueness log (first 120 chars as summary)
      writtenPostsLog.push(`[${dayName} - LinkedIn] ${linkedinContent.slice(0, 120).replace(/\n/g, " ")}…`);
    }

    // Twitter
    if (shouldWriteTwitter && twitterWriter) {
      let twitterContent: string;
      let twitterMetadata: Record<string, unknown> | undefined;

      if (resolvedType === "poll") {
        // Twitter poll: single tweet with question + 2 options
        twitterContent = await runAgent(
          twitterWriter,
          `Crie uma ENQUETE para X (Twitter) para ${dayName} sobre: "${topic}".
${twitterRules("poll")}

Formato OBRIGATÓRIO (siga exatamente):
TWEET: [texto apresentando a enquete, máx ${PLATFORM_LIMITS.twitter.tweet} chars]
OPCAO_1: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
OPCAO_2: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
DURACAO_HORAS: 1440

Seja direto e provocativo.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );
        twitterMetadata = parseTwitterPollContent(twitterContent);

      } else if (resolvedType === "thread") {
        // Explicit thread
        twitterContent = await runAgent(
          twitterWriter,
          `Crie uma THREAD para X (Twitter) para ${dayName} sobre: "${topic}".
${twitterRules("thread")}
6-8 tweets no total. Numere como 1/ 2/ 3/ etc.
→ Tweet 1: abertura impactante que gere curiosidade imediata
→ Tweets 2-N: desenvolvimento com dados e argumentos
→ Último tweet: CTA claro + hashtags (máx 2)
Aborde um ângulo diferente dos posts anteriores.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );

      } else {
        // Default: thread format (Twitter's default for all other content types)
        twitterContent = await runAgent(
          twitterWriter,
          `Crie uma thread para X (Twitter) para ${dayName} sobre: "${topic}".
${twitterRules("thread")}
5-7 tweets no total. Numere como 1/ 2/ etc.
→ Tweet 1: abertura impactante
→ Tweets intermediários: conteúdo de valor
→ Último tweet: CTA claro
Aborde um ângulo diferente dos posts anteriores.${uniquenessBlock}`,
          contextWithResearch,
          runId,
          funnelInstruction
        );
      }

      // ── Twitter thread validation ─────────────────────────────────────────
      if (resolvedType === "thread" || resolvedType !== "poll") {
        const { violations } = validateTwitterThread(twitterContent);
        if (violations.length > 0) {
          await appendLog(runId, {
            agent: "Tiago Twitter",
            message: `Thread com tweets acima do limite: ${violations.join("; ")}. Solicitando correção...`,
            status: "warning",
          });
          const fixed = await runAgent(
            twitterWriter,
            `A thread abaixo tem tweets que ultrapassam o limite de ${PLATFORM_LIMITS.twitter.tweet} chars do X/Twitter.
Problemas encontrados: ${violations.join("; ")}.

Reescreva APENAS os tweets problemáticos, mantendo o conteúdo e a numeração dos demais.
CADA tweet deve ter NO MÁXIMO ${PLATFORM_LIMITS.twitter.tweet} chars — conte os chars antes de finalizar.

THREAD ORIGINAL:
${twitterContent}`,
            contextWithResearch,
            runId,
            funnelInstruction
          );
          const { violations: remaining } = validateTwitterThread(fixed);
          if (remaining.length === 0) {
            twitterContent = fixed;
            await appendLog(runId, { agent: "Tiago Twitter", message: "Thread corrigida ✓", status: "running" });
          } else {
            await appendLog(runId, {
              agent: "Tiago Twitter",
              message: `⚠ Thread ainda com problemas após correção (${remaining.join("; ")}). Publicador aplicará limite por tweet.`,
              status: "warning",
            });
          }
        }
      }

      const card = await saveCard({
        runId,
        projectId: project.id,
        agentId: "tiago-twitter",
        agentName: twitterWriter.name,
        dayOfWeek,
        scheduledDate,
        cardType: "post_twitter",
        mediaType: resolvedType === "thread" || resolvedType === "free" ? "thread" : resolvedType,
        content: twitterContent,
        ...(twitterMetadata ? { metadata: twitterMetadata } : {}),
      });

      dayPosts.push({
        day: dayName,
        platform: "twitter",
        content: twitterContent,
        mediaType: resolvedType === "thread" ? "thread" as ContentType : resolvedType,
        dayOfWeek,
        scheduledDate,
        cardId: card.id,
        metadata: twitterMetadata,
      });

      // Register Twitter post in uniqueness log
      writtenPostsLog.push(`[${dayName} - X] ${twitterContent.slice(0, 100).replace(/\n/g, " ")}…`);
    }

    // Look up what was just generated for this day (used by Diana, Vera, Paulo below)
    let liPost = dayPosts.find((p) => p.platform === "linkedin" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());
    let twPost = dayPosts.find((p) => p.platform === "twitter" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());

    // ── Diana — Media (inclui capa para artigos LinkedIn) ────────────────────
    const needsMedia = designer && liPost && !["text", "poll", "thread"].includes(resolvedType);
    const visualPromptSource =
      resolvedType === "article" && liPost
        ? parseLinkedInArticleContent(liPost.content).body.slice(0, 2800)
        : liPost?.content ?? "";

    if (needsMedia && designer && liPost) {
      if (!hasApiKey) {
        await appendLog(runId, {
          agent: "Diana Design",
          message: "GEMINI_API_KEY não configurada — gerando apenas prompts visuais.",
          status: "warning",
        });
      }

      const isInfographicType = resolvedType === "infographic";
      const isVideoType = resolvedType === "video";
      const videoDuration = config.videoDuration ?? 8;
      const videoAudio = config.videoAudio ?? false;
      const mediaStyle = config.mediaStyle ?? "cinematic";
      const styleHintEn = getMediaStylePromptFragment(mediaStyle);
      const maxNarrWords = maxNarrationWordsForDuration(videoDuration);
      const mediaTypeLabel = isVideoType
        ? "vídeo"
        : isInfographicType
          ? "infográfico"
          : resolvedType === "article"
            ? "capa do artigo"
            : "imagem";

      await appendLog(runId, {
        agent: "Diana Design",
        message: `Criando ${mediaTypeLabel} para ${dayName}${weekOffset > 0 ? ` (semana ${weekOffset + 1})` : ""}...`,
        status: "running",
      });

      let dianaFinalUrl: string | undefined;
      let dianaMediaError: string | undefined;

      if (isInfographicType) {
        const infoPlatform: "linkedin" | "twitter" | "both" = config.singlePlatform ?? "both";
        if (hasApiKey) {
          try {
            dianaFinalUrl = await generateInfographic(visualPromptSource, project.niche ?? "business", process.env.GEMINI_API_KEY!, infoPlatform);
            mediaByDayKey[dayKey] = { imageUrl: dianaFinalUrl, imagePrompt: "infographic" };
            await appendLog(runId, { agent: "Diana Design", message: `Infográfico gerado para ${dayName}.`, status: "completed" });
          } catch (err) {
            dianaMediaError = err instanceof Error ? err.message : "Erro desconhecido";
            mediaByDayKey[dayKey] = { imagePrompt: "infographic" };
            await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar infográfico: ${dianaMediaError}.`, status: "warning" });
          }
        } else {
          mediaByDayKey[dayKey] = { imagePrompt: "infographic" };
        }
        const dc = await saveCard({ runId, projectId: project.id, agentId: "diana-design", agentName: designer.name, dayOfWeek, scheduledDate, cardType: "media", mediaType: "infographic", content: dianaMediaError ? `AVISO: ${dianaMediaError}\n\nPrompt: infographic` : "infographic", mediaUrl: dianaFinalUrl });
        dianaCardId = dc.id;
      } else {
        const visualPrompt = await runAgent(
          designer,
          isVideoType
            ? `Crie um prompt para geração de vídeo ${videoAudio ? "com narração em português" : "sem fala (B-roll ou mudo)"} baseado neste conteúdo de post:

${visualPromptSource}

ESTILO VISUAL ESCOLHIDO PELO USUÁRIO (obrigatório refletir no prompt em inglês):
${styleHintEn}

INTEGRIDADE DA MENSAGEM — OBRIGATÓRIO (o clipe tem exatamente ${videoDuration} segundos):
- O vídeo deve contar UMA ideia completa do início ao fim: abertura clara, meio e fechamento satisfatório — nunca cortar no meio de uma frase, gesto, fala ou cena.
- Planeje o roteiro visual (e a narração, se houver) para que o último segundo seja um desfecho natural (fade, gesto final, plano de encerramento), nunca abrupto.
${videoAudio
  ? `- NARRAÇÃO EM PORTUGUÊS BRASILEIRO: escreva no prompt o texto exato que o narrador dirá, com no máximo ${maxNarrWords} palavras no total — uma ou duas frases completas que terminem antes do fim do clipe.
- A narração deve ser autocontida: uma mensagem completa, não um trecho de frase maior.
- Tom: profissional, claro, envolvente. Imagens de apoio (B-roll, produto, ambiente, motion graphics) que ilustrem o que é dito — sem depender de sincronia labial.
- EVITE pessoas falando em câmera ou diálogos com boca visível: em clipes curtos (${videoDuration}s) isso gera dessincronia de voz. Prefira voice-over + imagens abstratas, cenários ou mãos/objetos.
- Inclua no prompt final: "Brazilian Portuguese voice-over only, no on-camera dialogue, no visible lip-sync, narrator speaking Brazilian Portuguese, voice-over in pt-BR"`
  : `- Sem fala humana: apenas imagem e música/ambiente se o modelo permitir; sem diálogo, sem legendas.
- Use cenas que completem um arco visual mínimo (ex.: revelação → detalhe → conclusão) dentro de ${videoDuration} segundos.`}
- Duração fixa do modelo: ${videoDuration} segundos — não assuma mais tempo.
- Contexto brasileiro quando fizer sentido. Nicho: ${project.niche ?? "business"}.

Formato: descrição contínua em INGLÊS (compatível com Veo), sem marcadores nem listas numeradas. Inclua: sequência de cenas, movimento de câmera, luz, paleta, mood, e como o último quadro fecha a ideia.
${videoAudio
  ? `Feche o prompt com: Brazilian Portuguese voice-over, B-roll visuals, no on-camera speaking, complete thought within ${videoDuration} seconds, cinematic`
  : `Feche o prompt com: no dialogue, no speech, no text overlay, no subtitles, complete visual arc, cinematic b-roll`}`
            : `Crie um prompt visual profissional em INGLÊS para imagem baseado neste conteúdo:

${visualPromptSource}

ESTILO VISUAL ESCOLHIDO PELO USUÁRIO (obrigatório):
${styleHintEn}

O prompt deve ser específico: composição, iluminação, materiais, mood.
Paleta alinhada ao nicho: ${project.niche ?? "business"}.
Formato: uma descrição detalhada em inglês, sem marcadores, sem listas.`,
          contextWithResearch,
          runId,
          funnelInstruction
        );

        if (hasApiKey) {
          try {
            if (isVideoType) {
              try {
                const videoUrl = await generateVideo(visualPrompt, "9:16", "720p", 150_000, videoDuration, false, videoAudio);
                mediaByDayKey[dayKey] = { videoUrl, imagePrompt: visualPrompt };
                dianaFinalUrl = videoUrl;
                await appendLog(runId, { agent: "Diana Design", message: `Vídeo gerado para ${dayName}.`, status: "completed" });
              } catch (veoErr) {
                const isUnavailable = veoErr instanceof VeoUnavailableError;
                const reason = veoErr instanceof Error ? veoErr.message : "erro desconhecido";
                console.warn(`[diana] VEO 3 indisponível (${reason}) — gerando imagem substituta`);
                await appendLog(runId, { agent: "Diana Design", message: `VEO 3 não disponível: ${reason}. Gerando imagem estática como alternativa.`, status: "warning" });
                try {
                  const fallbackUrl = await generateImage(`${visualPrompt} — still frame for video`, "16:9");
                  mediaByDayKey[dayKey] = { imageUrl: fallbackUrl, imagePrompt: visualPrompt };
                  dianaFinalUrl = fallbackUrl;
                  await appendLog(runId, { agent: "Diana Design", message: `Imagem substituta gerada para ${dayName}.`, status: "completed" });
                } catch {
                  mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
                  await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar imagem substituta.`, status: "warning" });
                }
                if (!isUnavailable) throw veoErr;
              }
            } else if (resolvedType === "carousel") {
              const imageUrl = await generateImage(visualPrompt, "1:1");
              const slide2 = await generateImage(`${visualPrompt} — slide 2, continuation`, "1:1");
              const slide3 = await generateImage(`${visualPrompt} — slide 3, call to action`, "1:1");
              dianaFinalUrl = [imageUrl, slide2, slide3].join("|");
              mediaByDayKey[dayKey] = { imageUrl: dianaFinalUrl, imagePrompt: visualPrompt };
              await appendLog(runId, { agent: "Diana Design", message: `Carrossel (3 slides) gerado para ${dayName}.`, status: "completed" });
            } else {
              const imageUrl = await generateImage(visualPrompt, "linkedin-landscape");
              mediaByDayKey[dayKey] = { imageUrl, imagePrompt: visualPrompt };
              dianaFinalUrl = imageUrl;
              await appendLog(runId, { agent: "Diana Design", message: `Imagem gerada para ${dayName}.`, status: "completed" });
            }
          } catch (err) {
            dianaMediaError = err instanceof Error ? err.message : "Erro desconhecido";
            console.error(`[diana] media generation failed for day ${dayOfWeek}:`, err);
            mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
            await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar mídia para ${dayName}: ${dianaMediaError}. Prompt salvo para regeneração manual.`, status: "warning" });
          }
        } else {
          mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
        }

        const dc = await saveCard({ runId, projectId: project.id, agentId: "diana-design", agentName: designer.name, dayOfWeek, scheduledDate, cardType: "media", mediaType: resolvedType, content: dianaMediaError ? `AVISO: ${dianaMediaError}\n\nPrompt: ${visualPrompt}` : visualPrompt, mediaUrl: dianaFinalUrl });
        dianaCardId = dc.id;
      }
    }

    // ── Vera — Review ─────────────────────────────────────────────────────────
    if (reviewer && (liPost || twPost)) {
      const dayMedia = mediaByDayKey[dayKey];

      function getMediaStatus(): string {
        if (dayMedia?.imageUrl || dayMedia?.videoUrl) return "GERADA com sucesso";
        if (dayMedia?.imagePrompt) return "FALHOU — apenas prompt salvo, sem imagem/vídeo real";
        return "NAO SOLICITADA (post de texto)";
      }

      const firstOutput = await runAgent(
        reviewer,
        buildVeraTask(dayOfWeek, liPost?.content, twPost?.content, getMediaStatus(), false),
        `${contextWithResearch}\n\nTema da campanha: ${topic}`,
        runId,
        funnelInstruction
      );

      let { needsTextRetry, needsMediaRetry, approved, verdict } = parseVeraVerdict(firstOutput);
      let finalOutput = firstOutput;
      let didRetry = false;

      if (!approved) {
        const lucasKey = `lucas-${dayOfWeek}-${weekOffset}`;
        const dianaKey = `diana-${dayOfWeek}-${weekOffset}`;
        const lucasRetries = agentRetries[lucasKey] ?? 0;
        const dianaRetries = agentRetries[dianaKey] ?? 0;
        const canRetryText = needsTextRetry && lucasRetries < 1 && linkedinWriter;
        const canRetryMedia = needsMediaRetry && dianaRetries < 1 && designer;
        const blockedAgents: string[] = [];

        // Retry Lucas (text)
        if (canRetryText && linkedinWriter) {
          agentRetries[lucasKey] = lucasRetries + 1;
          await appendLog(runId, { agent: "Sistema", message: `Vera reprovou o texto de ${dayName}. Pedindo ao Lucas para reescrever...`, status: "running" });
          const retryType = (liPost?.mediaType === "article" ? "article" : "post") as "post" | "article";
          const newContent = await runAgent(
            linkedinWriter,
            `REESCRITA SOLICITADA PELA VERA — corrija os problemas apontados e reescreva o post de LinkedIn para ${dayName}:

PROBLEMAS IDENTIFICADOS PELA VERA:
${firstOutput.slice(0, 600)}

CONTEÚDO ANTERIOR (melhore, não copie):
${liPost?.content ?? ""}

${liPost?.mediaType === "article" ? "Mantenha obrigatoriamente o formato TITULO:, RESUMO_CARD: e CORPO:.\n\n" : ""}Reescreva do zero se necessário. Tom: ${project.voice || "profissional e direto"}.
${linkedinRules(retryType)}
Use os dados da pesquisa. Não invente fatos.`,
            contextWithResearch,
            runId,
            funnelInstruction,
            liPost?.mediaType === "article" ? { maxTokens: 8192 } : undefined
          );
          if (liPost?.cardId) {
            await prisma.campaignCard.update({
              where: { id: liPost.cardId },
              data: { content: newContent, metadata: { retried: true, veraFeedback: firstOutput.slice(0, 400) } as unknown as import("@prisma/client").Prisma.InputJsonValue },
            });
          }
          const liIdx = dayPosts.findIndex((p) => p.platform === "linkedin" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());
          if (liIdx >= 0) dayPosts[liIdx] = { ...dayPosts[liIdx], content: newContent };
          liPost = dayPosts.find(
            (p) => p.platform === "linkedin" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString()
          );
          didRetry = true;
        } else if (needsTextRetry && lucasRetries >= 1) {
          blockedAgents.push("Lucas (texto)");
        }

        // Retry Diana (media)
        if (canRetryMedia && designer) {
          agentRetries[dianaKey] = dianaRetries + 1;
          await appendLog(runId, { agent: "Sistema", message: `Vera reprovou a mídia de ${dayName}. Pedindo à Diana para regenerar...`, status: "running" });
          const liContentForRetry = liPost?.content ?? "";
          const resolvedMediaType: ContentType = liPost?.mediaType ?? "image";
          const newPrompt = await runAgent(
            designer,
            `REMEDIAÇÃO DE MÍDIA — a Vera reprovou a mídia anterior. Crie um NOVO prompt visual em inglês para ${dayName} baseado neste post:

${liContentForRetry}

Problemas apontados: ${firstOutput.slice(0, 400)}

O prompt deve ser específico: composição, iluminação, materiais, mood. Paleta alinhada ao nicho: ${project.niche ?? "business"}.`,
            contextWithResearch,
            runId,
            funnelInstruction
          );

          let newMediaUrl: string | undefined;
          const apiKey = process.env.GEMINI_API_KEY;
          if (apiKey) {
            try {
              if (resolvedMediaType === "infographic") {
                const retryPlatform: "linkedin" | "twitter" | "both" = config.singlePlatform ?? "both";
                newMediaUrl = await generateInfographic(liContentForRetry, project.niche ?? "business", apiKey, retryPlatform);
              } else {
                newMediaUrl = await generateImage(newPrompt, "linkedin-landscape");
              }
              mediaByDayKey[dayKey] = { imageUrl: newMediaUrl, imagePrompt: newPrompt };
              await appendLog(runId, { agent: "Diana Design", message: `Mídia regenerada com sucesso para ${dayName}.`, status: "completed" });
            } catch (err) {
              await appendLog(runId, { agent: "Diana Design", message: `Segunda tentativa de geração de mídia também falhou: ${err instanceof Error ? err.message : "erro"}`, status: "warning" });
            }
          }
          // Update Diana card (use dianaCardId if available, otherwise query)
          const dianaCardToUpdate = (dianaCardId ? { id: dianaCardId } : null) ?? await prisma.campaignCard.findFirst({ where: { runId, agentId: "diana-design", dayOfWeek, scheduledDate } });
          if (dianaCardToUpdate) {
            await prisma.campaignCard.update({
              where: { id: dianaCardToUpdate.id },
              data: { content: newPrompt, ...(newMediaUrl ? { mediaUrl: newMediaUrl } : {}), metadata: { retried: true, veraFeedback: firstOutput.slice(0, 400) } as unknown as import("@prisma/client").Prisma.InputJsonValue },
            });
          }
          didRetry = true;
        } else if (needsMediaRetry && dianaRetries >= 1) {
          blockedAgents.push("Diana (mídia)");
        }

        // Second review if anything was retried
        if (didRetry) {
          await appendLog(runId, { agent: "Vera Veredito", message: `Revisando novamente ${dayName} após correções...`, status: "running" });
          const secondOutput = await runAgent(
            reviewer,
            buildVeraTask(dayOfWeek, liPost?.content, twPost?.content, getMediaStatus(), true),
            `${contextWithResearch}\n\nTema da campanha: ${topic}`,
            runId,
            funnelInstruction
          );
          finalOutput = secondOutput;
          const secondParsed = parseVeraVerdict(secondOutput);
          approved = secondParsed.approved;
          verdict = secondParsed.verdict;
          if (!approved) {
            const blockedFrom = [
              ...(secondParsed.needsTextRetry ? ["Lucas (texto)"] : []),
              ...(secondParsed.needsMediaRetry ? ["Diana (mídia)"] : []),
            ];
            blockedAgents.push(...blockedFrom.filter((a) => !blockedAgents.includes(a)));
          }
        }

        if (blockedAgents.length > 0) {
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `🚨 ATENÇÃO: A campanha para ${dayName} não passou na revisão após 2 tentativas. Agentes com problema: ${blockedAgents.join(", ")}. Acesse o card e ajuste manualmente ou use o chat para pedir correções.`,
            status: "error",
          });
          await prisma.pipelineRun.update({ where: { id: runId }, data: { status: "needs_attention" } }).catch(() => {});
        }
      }

      const hasMediaError = getMediaStatus().startsWith("FALHOU");
      const cardStatus = approved ? "pending" : "needs_revision";
      await saveCard({
        runId,
        projectId: project.id,
        agentId: "vera-veredito",
        agentName: reviewer.name,
        dayOfWeek,
        scheduledDate,
        cardType: "preview",
        content: [
          hasMediaError ? "⚠ ATENÇÃO: Mídia não gerada — deve ser corrigida antes de publicar.\n" : "",
          didRetry ? "↺ Este conteúdo passou por revisão e correção automática.\n" : "",
          `LinkedIn:\n${liPost?.content ?? "—"}\n\nX (Twitter):\n${twPost?.content ?? "—"}\n\nVeredito da Vera:\n${finalOutput}`,
        ].filter(Boolean).join("\n"),
        ...(cardStatus === "needs_revision" ? { status: "needs_revision" } : {}),
      });

      // suppress unused warning
      void verdict;
    }

    // ── Paulo — Publish Card ──────────────────────────────────────────────────
    {
      const postsForDay = dayPosts.filter(
        (p) => p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString()
      );
      const postIds: string[] = [];
      const dayMedia = mediaByDayKey[dayKey];
      const imageUrl = dayMedia?.imageUrl || dayMedia?.videoUrl || undefined;

      for (const dp of postsForDay) {
        const account = dp.platform === "linkedin" ? liAccount : twAccount;
        const post = await prisma.post.create({
          data: {
            projectId: project.id,
            runId,
            platform: dp.platform,
            content: dp.content,
            imageUrl,
            imagePrompt: dayMedia?.imagePrompt ?? null,
            mediaType: dp.mediaType,
            metadata: (dp.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            dayOfWeek: dp.dayOfWeek,
            status: "draft",
            socialAccountId: account?.id,
            scheduledAt: scheduledDate,
            articlePublicToken:
              dp.platform === "linkedin" && dp.mediaType === "article" ? newArticlePublicToken() : null,
          },
        });
        postIds.push(post.id);
        createdPostIds.push(post.id);
        if (dp.cardId) {
          await prisma.campaignCard.update({ where: { id: dp.cardId }, data: { postId: post.id } }).catch(() => {});
        }
      }

      if (postIds.length > 0) {
        await saveCard({
          runId,
          projectId: project.id,
          agentId: "paulo-publicador",
          agentName: "Paulo Publicador",
          dayOfWeek,
          scheduledDate,
          cardType: "publish",
          content: `${postsForDay.length} post(s) prontos para publicação na ${dayName}.`,
          postId: postIds[0],
        });
      }
    }
  }

  // ── Complete ──────────────────────────────────────────────────────────────
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      endedAt: new Date(),
      output: {
        campaignMode: config.campaignMode,
        funnelStage: config.funnelStage,
        weeklySchedule: config.weeklySchedule,
        postsCreated: createdPostIds,
        totalPosts: createdPostIds.length,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await appendLog(runId, {
    agent: "Sistema",
    message: `Campanha ${config.campaignMode} concluída! ${createdPostIds.length} posts criados para aprovação.`,
    status: "completed",
  });
}
