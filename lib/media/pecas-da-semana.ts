import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { generateInfographic } from "@/lib/media/infographic";
import { montarPrefixoCacheavel } from "@/lib/media/write-posts";
import { escreverLegendaDoCarrossel } from "@/lib/media/carrossel-do-video";
import { textoDoRadar, type Radar } from "@/lib/media/radar-do-video";
import {
  diasDaSemana,
  normalizarSemana,
  ROTULO_DO_FORMATO,
  type FormatoDoDia,
} from "@/lib/media/semana-do-video";
import type { Prisma } from "@prisma/client";

/**
 * Os redatores escrevem a semana que o cliente escolheu, a partir do vídeo.
 *
 * Cada dia com formato vira UM post e os cards de quem trabalhou nele: Lucas
 * (texto, enquete e as legendas das peças visuais), Tiago (thread) e Diana
 * (imagem, carrossel, infográfico). Todos recebem a mesma coisa, a
 * transcrição mais o briefing inteiro do Roberto, e nada além disso entra
 * nos textos: quem quer dado com fonte encontra no radar, e quem não encontra
 * escreve sem número.
 *
 * Idempotente por dia: dia que já tem post não é escrito de novo, então rodar
 * duas vezes só completa o que faltou. O card de espera ("Lucas está
 * escrevendo...") que o agendar cria é o mesmo card que recebe o texto.
 */

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const MAX_TWEET = 280;
const MAX_LINKEDIN = 3000;

const AGENTES = {
  lucas: { agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin" },
  tiago: { agentId: "tiago-twitter", agentName: "Tiago Twitter", cardType: "post_twitter" },
  diana: { agentId: "diana-design", agentName: "Diana Design", cardType: "media" },
} as const;

type Agente = { name: string; role: string; persona: string | null; style: string | null };

type VideoParaEscrever = NonNullable<Awaited<ReturnType<typeof carregarVideo>>>;

async function carregarVideo(videoJobId: string) {
  return prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      originalName: true,
      transcript: true,
      radar: true,
      clips: true,
      project: {
        select: {
          name: true,
          niche: true,
          targetAudience: true,
          voice: true,
          colorPalette: true,
          videoSemana: true,
          socialAccounts: { where: { isActive: true }, select: { platform: true, id: true } },
          agents: {
            where: { agentId: { in: ["lucas-linkedin", "tiago-twitter", "diana-design"] } },
            select: { agentId: true, name: true, role: true, persona: true, style: true },
          },
        },
      },
    },
  });
}

function personaDe(agente: Agente | undefined, padrao: string): string {
  if (!agente) return padrao;
  return `Você é ${agente.name}, ${agente.role}.${agente.persona ? `\nPersona: ${agente.persona}` : ""}${agente.style ? `\nEstilo: ${agente.style}` : ""}`;
}

const REGRAS_DE_TEXTO = `REGRAS:
- Português brasileiro natural, na voz da marca, falando com esse público.
- Nada de markdown (sem #, sem **), texto limpo com parágrafos separados por linha em branco.
- Nenhum dado, estudo, nome ou citação que não esteja na transcrição ou no briefing do Roberto. Se usar um dado do briefing, cite a fonte como está lá.
- Sem travessão: use vírgula, dois-pontos ou parênteses.
- Sem clichê motivacional, no máximo 2 emojis, no máximo 3 hashtags e só no fim.`;

/** A rede onde o texto do dia sai: a primeira conectada que faz sentido, ou LinkedIn como rascunho. */
function redeDoTexto(contas: Array<{ platform: string; id: string }>) {
  for (const p of ["linkedin", "facebook", "instagram"]) {
    const c = contas.find((a) => a.platform === p);
    if (c) return c;
  }
  return { platform: "linkedin", id: null as string | null };
}

/** A rede da peça visual: Instagram primeiro, que é onde imagem e carrossel vivem. */
function redeDaImagem(contas: Array<{ platform: string; id: string }>) {
  for (const p of ["instagram", "linkedin", "facebook"]) {
    const c = contas.find((a) => a.platform === p);
    if (c) return c;
  }
  return { platform: "instagram", id: null as string | null };
}

function separarTweets(texto: string): string[] {
  const linhas = texto.split("\n");
  const tweets: string[] = [];
  let atual = "";
  for (const linha of linhas) {
    if (/^\d+[/)]\s/.test(linha) && atual) {
      tweets.push(atual.trim());
      atual = linha;
    } else {
      atual += (atual ? "\n" : "") + linha;
    }
  }
  if (atual.trim()) tweets.push(atual.trim());
  return tweets;
}

/** Enquete no formato que o publicador do LinkedIn já lê (parsePollContent da campanha de texto). */
function lerEnquete(texto: string) {
  const linhas = texto.split("\n").map((l) => l.trim());
  const pega = (prefixo: string) => linhas.find((l) => l.startsWith(prefixo))?.replace(prefixo, "").trim() ?? "";
  const intro = pega("TEXTO_INTRO:");
  const question = pega("PERGUNTA:").slice(0, 150);
  const options = [pega("OPCAO_1:"), pega("OPCAO_2:"), pega("OPCAO_3:"), pega("OPCAO_4:")]
    .filter(Boolean)
    .map((o) => o.slice(0, 30));
  return { type: "poll", intro, question, options, duration: "THREE_DAYS" };
}

export async function escreverSemanaDoVideo(videoJobId: string): Promise<{ escritos: number; falhas: number }> {
  const video = await carregarVideo(videoJobId);
  if (!video) return { escritos: 0, falhas: 0 };

  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, weekStart: true, config: true },
  });
  if (!run) return { escritos: 0, falhas: 0 };

  const semana = normalizarSemana((run.config as { semana?: unknown } | null)?.semana ?? video.project.videoSemana);
  const dias = diasDaSemana(semana);
  if (!dias.length) return { escritos: 0, falhas: 0 };

  const radar = video.radar as unknown as Radar | null;
  const transcript = video.transcript as { text?: string } | null;
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");

  // O bloco que TODO redator recebe, idêntico em todas as chamadas deste
  // vídeo, e por isso cacheável: perfil do projeto, briefing do Roberto e a
  // transcrição. É a promessa do desenho: "nada além disto entra nos textos".
  const prefixo =
    montarPrefixoCacheavel({ nicho: video.project.niche, publico: video.project.targetAudience, voz: video.project.voice }) +
    `\n\nBRIEFING DO ROBERTO RADAR (pesquisa feita a partir deste vídeo):\n${radar ? textoDoRadar(radar) : "(o Roberto ainda não pesquisou; escreva só com a transcrição, sem nenhum dado externo)"}` +
    `\n\nTRANSCRIÇÃO DO VÍDEO "${nome}":\n${(transcript?.text ?? "").slice(0, 40000)}`;

  const agentes = video.project.agents;
  const lucas = agentes.find((a) => a.agentId === "lucas-linkedin");
  const tiago = agentes.find((a) => a.agentId === "tiago-twitter");
  const diana = agentes.find((a) => a.agentId === "diana-design");

  const cardsDoVideo = await prisma.campaignCard.findMany({
    where: { runId: run.id, metadata: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, agentId: true, dayOfWeek: true, postId: true, metadata: true },
  });

  const segunda = run.weekStart ?? new Date();
  let escritos = 0;
  let falhas = 0;

  // Os dias saem EM PARALELO: cada um é um redator diferente (ou o mesmo com
  // outro pedido), e nenhum depende do outro. Em série, a semana de 02/09
  // levou 1,8 min só de redação (14,9 aos 16,7); em paralelo é o tempo do dia
  // mais lento, e o prefixo cacheado (perfil, briefing, transcrição) é o
  // mesmo em todas as chamadas, então o custo não muda.
  await Promise.all(dias.map(async ({ dia, formato, escolhido }) => {
    const derivadosDoDia = cardsDoVideo.filter(
      (c) => c.dayOfWeek === dia && (c.metadata as { derivado?: boolean } | null)?.derivado
    );
    // Dia já escrito: algum card derivado do dia aponta para um post.
    if (derivadosDoDia.some((c) => c.postId)) return;

    const data = new Date(segunda.getTime() + (dia - 1) * 86400000);
    data.setUTCHours(12, 0, 0, 0);
    const angulo = radar?.angulos.find((a) => a.dia === dia)?.texto ?? "";
    const tese = radar?.teses[(dia - 2) % Math.max(1, radar.teses.length)];

    const usage = (agentId: string) => ({ operation: "agent", runId: run.id, agentId, projectId: video.projectId });
    // `formatoRotulo` é o que o cabeçalho do quadro mostra; sem ele o chip
    // do dia sumia assim que o card de espera virava peça (visto em 02/09).
    const metaBase = { origem: "video", videoJobId: video.id, derivado: true, formato: escolhido, formatoRotulo: ROTULO_DO_FORMATO[escolhido], dia };

    /** Cria ou preenche o card de um agente neste dia. */
    const gravarCard = async (
      agente: (typeof AGENTES)[keyof typeof AGENTES],
      dados: { content: string; mediaType: string; mediaUrl?: string | null; postId?: string | null; extra?: Record<string, unknown>; status?: string }
    ) => {
      const existente = derivadosDoDia.find((c) => c.agentId === agente.agentId);
      const metadata = { ...((existente?.metadata as Record<string, unknown> | null) ?? {}), ...metaBase, ...(dados.extra ?? {}) };
      delete (metadata as { aguardando?: boolean }).aguardando;
      const base = {
        content: dados.content,
        mediaType: dados.mediaType,
        mediaUrl: dados.mediaUrl ?? null,
        postId: dados.postId ?? null,
        status: dados.status ?? "pending",
        metadata: metadata as Prisma.InputJsonValue,
      };
      if (existente) {
        await prisma.campaignCard.update({ where: { id: existente.id }, data: base });
        return existente.id;
      }
      const criado = await prisma.campaignCard.create({
        data: {
          runId: run.id,
          projectId: video.projectId,
          agentId: agente.agentId,
          agentName: agente.agentName,
          dayOfWeek: dia,
          scheduledDate: data,
          cardType: agente.cardType,
          ...base,
        },
        select: { id: true },
      });
      return criado.id;
    };

    const criarPost = async (dados: {
      platform: string;
      socialAccountId: string | null;
      content: string;
      mediaType: string;
      imageUrl?: string | null;
      extra?: Record<string, unknown>;
    }) => {
      const post = await prisma.post.create({
        data: {
          projectId: video.projectId,
          platform: dados.platform,
          socialAccountId: dados.socialAccountId,
          content: dados.content,
          mediaType: dados.mediaType,
          imageUrl: dados.imageUrl ?? null,
          status: "draft",
          dayOfWeek: dia,
          scheduledAt: data,
          runId: run.id,
          metadata: { ...metaBase, ...(dados.extra ?? {}) } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return post.id;
    };

    const contexto = `DIA: ${DIAS[dia]}\nFORMATO ESCOLHIDO PELO CLIENTE: ${ROTULO_DO_FORMATO[formato]}\nÂNGULO DO DIA (do Roberto): ${angulo || "use a tese abaixo"}\nTESE PRINCIPAL DO DIA: ${tese ? `[${tese.minuto}] ${tese.frase}` : "escolha a tese mais forte do vídeo para este dia"}`;

    try {
      if (formato === "text") {
        const rede = redeDoTexto(video.project.socialAccounts);
        const texto = await escreverTexto(lucas, prefixo, contexto, rede.platform, usage(AGENTES.lucas.agentId));
        const postId = await criarPost({ platform: rede.platform, socialAccountId: rede.id, content: texto, mediaType: "text" });
        await gravarCard(AGENTES.lucas, { content: texto, mediaType: "text", postId, extra: { rede: rede.platform } });
      } else if (formato === "poll") {
        const rede = redeDoTexto(video.project.socialAccounts);
        const bruto = await askClaude(
          personaDe(lucas, "Você é Lucas LinkedIn, redator de posts para LinkedIn."),
          `${contexto}

Escreva uma ENQUETE para ${rede.platform === "linkedin" ? "o LinkedIn" : rede.platform} a partir do ângulo do dia, no formato EXATO abaixo (uma linha por campo, sem nada além disso):

TEXTO_INTRO: [até 600 caracteres apresentando o dilema, na voz da marca, sem dar a resposta]
PERGUNTA: [até 140 caracteres]
OPCAO_1: [até 28 caracteres]
OPCAO_2: [até 28 caracteres]
OPCAO_3: [até 28 caracteres]
OPCAO_4: [até 28 caracteres, opcional]

${REGRAS_DE_TEXTO}`,
          { maxTokens: 4000, cachedPrefix: prefixo, usage: usage(AGENTES.lucas.agentId) }
        );
        const enquete = lerEnquete(bruto);
        const legivel = `${enquete.intro}\n\n${enquete.question}\n${enquete.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`.trim();
        const postId = await criarPost({ platform: rede.platform, socialAccountId: rede.id, content: legivel, mediaType: "poll", extra: enquete });
        await gravarCard(AGENTES.lucas, { content: legivel, mediaType: "poll", postId, extra: { rede: rede.platform, ...enquete } });
      } else if (formato === "thread") {
        const conta = video.project.socialAccounts.find((a) => a.platform === "twitter");
        const texto = await escreverThread(tiago, prefixo, contexto, usage(AGENTES.tiago.agentId));
        const postId = await criarPost({ platform: "twitter", socialAccountId: conta?.id ?? null, content: texto, mediaType: "thread" });
        await gravarCard(AGENTES.tiago, { content: texto, mediaType: "thread", postId, extra: { rede: "twitter", tweets: separarTweets(texto).length } });
      } else if (formato === "image") {
        const rede = redeDaImagem(video.project.socialAccounts);
        const frase = (tese?.frase ?? radar?.tema ?? nome).slice(0, 140);
        const legenda = await escreverTexto(lucas, prefixo, `${contexto}\n\nEsta legenda acompanha uma IMAGEM com a frase "${frase}" escrita nela. Não repita a frase literalmente na primeira linha; desenvolva a ideia.`, rede.platform, usage(AGENTES.lucas.agentId));
        const url = await generateImage(promptDaImagem(video, frase), rede.platform === "instagram" ? "1:1" : "linkedin-landscape", "standard", {
          projectId: video.projectId,
          runId: run.id,
          operation: "campanha_imagem",
        });
        const postId = await criarPost({ platform: rede.platform, socialAccountId: rede.id, content: legenda, mediaType: "image", imageUrl: url, extra: { frase } });
        await gravarCard(AGENTES.lucas, { content: legenda, mediaType: "text", postId, extra: { rede: rede.platform } });
        await gravarCard(AGENTES.diana, { content: `Imagem com a frase: "${frase}"`, mediaType: "image", mediaUrl: url, postId, extra: { rede: rede.platform, frase } });
      } else if (formato === "carousel") {
        const rede = redeDaImagem(video.project.socialAccounts);
        const frases = await frasesDosSlides(diana, prefixo, contexto, usage(AGENTES.diana.agentId));
        // Os slides não dependem um do outro: três chamadas ao mesmo tempo.
        const urls = await Promise.all(
          frases.map((frase, i) =>
            generateImage(`${promptDaImagem(video, frase)} Slide ${i + 1} of ${frases.length}.`, "1:1", "standard", {
              projectId: video.projectId,
              runId: run.id,
              operation: "campanha_imagem",
            })
          )
        );
        const contextoDaLegenda = [
          radar ? `Tema: ${radar.tema}. ${radar.resumo}` : "",
          ...(radar?.teses.map((t) => `[${t.minuto}] ${t.frase}`) ?? []),
          angulo ? `Ângulo do dia: ${angulo}` : "",
        ].filter(Boolean);
        const legenda = await escreverLegendaDoCarrossel({
          frases,
          contexto: contextoDaLegenda,
          projeto: video.project,
          rede: rede.platform,
          usage: { runId: run.id, projectId: video.projectId },
        });
        const postId = await criarPost({ platform: rede.platform, socialAccountId: rede.id, content: legenda, mediaType: "carousel", imageUrl: urls.join("|"), extra: { carrossel: true, slides: frases } });
        await gravarCard(AGENTES.diana, { content: legenda, mediaType: "carousel", mediaUrl: urls.join("|"), postId, extra: { rede: rede.platform, slides: frases } });
      } else if (formato === "infographic") {
        const rede = redeDoTexto(video.project.socialAccounts);
        const legenda = await escreverTexto(lucas, prefixo, `${contexto}\n\nEsta legenda acompanha um INFOGRÁFICO com os dados do briefing (se o briefing não tem dado com fonte, o infográfico organiza as teses do vídeo). Cite no texto só o que está no briefing.`, rede.platform, usage(AGENTES.lucas.agentId));
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error("GEMINI_API_KEY não configurada para o infográfico");
        const fonte = [radar ? textoDoRadar(radar) : "", "\n\nTEXTO DO POST:\n", legenda].join("");
        const url = await Promise.race([
          generateInfographic(fonte, video.project.niche ?? "negócios", geminiKey, rede.platform === "linkedin" ? "linkedin" : "both"),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Infográfico passou de 120s")), 120_000)),
        ]);
        const postId = await criarPost({ platform: rede.platform, socialAccountId: rede.id, content: legenda, mediaType: "infographic", imageUrl: url });
        await gravarCard(AGENTES.lucas, { content: legenda, mediaType: "text", postId, extra: { rede: rede.platform } });
        await gravarCard(AGENTES.diana, { content: "Infográfico com os dados do briefing do Roberto.", mediaType: "infographic", mediaUrl: url, postId, extra: { rede: rede.platform } });
      }
      escritos++;
    } catch (e) {
      falhas++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[semana][${videoJobId}] ${DIAS[dia]} (${formato}) falhou:`, e);
      // O card fica com o aviso, e não some: sumir é o que o Bruno leu como
      // "travou" no sábado de 02/09. Rodar de novo tenta outra vez.
      const dono = formato === "thread" ? AGENTES.tiago : formato === "carousel" ? AGENTES.diana : AGENTES.lucas;
      await gravarCard(dono, {
        content: `AVISO: não consegui montar ${ROTULO_DO_FORMATO[formato].toLowerCase()} de ${DIAS[dia]} (${msg.slice(0, 160)}). A esteira tenta de novo sozinha; se persistir, peça pelo chat deste card.`,
        mediaType: "text",
        extra: { falha: msg.slice(0, 300) },
      }).catch(() => {});
    }
  }));

  return { escritos, falhas };
}

async function escreverTexto(
  lucas: Agente | undefined,
  prefixo: string,
  contexto: string,
  rede: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
): Promise<string> {
  const nomeDaRede = rede === "linkedin" ? "LinkedIn" : rede === "instagram" ? "Instagram" : rede === "facebook" ? "Facebook" : rede;
  const saida = await askClaude(
    personaDe(lucas, "Você é Lucas LinkedIn, redator de posts para redes profissionais."),
    `${contexto}

Escreva o post de ${nomeDaRede} deste dia a partir do vídeo e do briefing.
- Primeira linha: um gancho de até 90 caracteres que faça parar a rolagem.
- Desenvolva a tese do dia com o que a pessoa disse no vídeo, na primeira pessoa dela.
- Se o ângulo pede um achado ou um dado do briefing, use com a fonte. Se não há, não invente.
- Feche com uma pergunta ou chamada para ação de uma linha.
- Entre 700 e 1300 caracteres. Devolva SÓ o texto do post.

${REGRAS_DE_TEXTO}`,
    { maxTokens: 4000, cachedPrefix: prefixo, usage }
  );
  return saida.trim().slice(0, MAX_LINKEDIN);
}

async function escreverThread(
  tiago: Agente | undefined,
  prefixo: string,
  contexto: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
): Promise<string> {
  const sistema = personaDe(tiago, "Você é Tiago Twitter, redator de threads para o X.");
  const pedido = `${contexto}

Escreva uma THREAD para o X (Twitter) deste dia a partir do vídeo e do briefing.
- Entre 5 e 8 tweets, numerados como 1/ 2/ 3/ (o número conta nos caracteres), um por parágrafo.
- Cada tweet com NO MÁXIMO 270 caracteres. Conte antes de fechar.
- O primeiro tweet é o gancho e precisa se sustentar sozinho. O último fecha com uma pergunta ou chamada.
- Se o ângulo pede um achado ou dado do briefing, use com a fonte. Se não há, não invente.
- Devolva SÓ a thread.

${REGRAS_DE_TEXTO}`;
  let texto = (await askClaude(sistema, pedido, { maxTokens: 4000, cachedPrefix: prefixo, usage })).trim();

  const estourados = separarTweets(texto).filter((t) => t.length > MAX_TWEET);
  if (estourados.length) {
    // Uma correção pedida ao modelo, como a campanha de texto faz; depois o
    // corte duro por tweet, para nunca mandar ao X um tweet que ele recusa.
    texto = (
      await askClaude(
        sistema,
        `A thread abaixo tem ${estourados.length} tweet(s) acima de ${MAX_TWEET} caracteres. Reescreva a thread inteira mantendo a numeração e o conteúdo, com CADA tweet em no máximo 260 caracteres. Devolva só a thread.\n\n${texto}`,
        { maxTokens: 4000, cachedPrefix: prefixo, usage }
      )
    ).trim();
  }
  return separarTweets(texto)
    .map((t) => (t.length > MAX_TWEET ? t.slice(0, MAX_TWEET - 1).trimEnd() + "…" : t))
    .join("\n\n");
}

async function frasesDosSlides(
  diana: Agente | undefined,
  prefixo: string,
  contexto: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
): Promise<string[]> {
  const bruto = await askClaude(
    personaDe(diana, "Você é Diana Design, redatora visual de conteúdo para redes sociais."),
    `${contexto}

Escolha as frases dos slides de um CARROSSEL de 3 slides a partir do vídeo e do briefing: uma ideia por slide, na ordem que conta uma história (a última fecha com o dado ou a conclusão). Cada frase com no máximo 12 palavras, sem aspas, sem numeração, sem travessão. Devolva SÓ as três frases, uma por linha.`,
    { maxTokens: 4000, cachedPrefix: prefixo, usage }
  );
  const frases = bruto
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 3);
  if (frases.length < 2) throw new Error("A Diana não devolveu frases para os slides");
  return frases;
}

function promptDaImagem(video: VideoParaEscrever, frase: string): string {
  const paleta = video.project.colorPalette?.trim();
  return (
    `Social media graphic, bold typographic design, one short sentence in Brazilian Portuguese as the hero text, ` +
    `large clean sans-serif typography, high contrast, generous margins, minimal abstract background, ` +
    (paleta ? `brand color palette: ${paleta}, ` : "") +
    `niche: ${video.project.niche ?? "business"}. No watermark, no logo, no extra text besides the sentence. ` +
    `The text on the image must read exactly: "${frase}"`
  );
}

export type { FormatoDoDia };
