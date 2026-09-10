/**
 * O MOTOR DA CAMPANHA.
 *
 * Morou dentro de `app/api/pipeline/run/route.ts` até 10/09, e saiu de lá
 * quando cada dia virou um trabalho da fila: agora duas rotas precisam do
 * mesmo motor (a que enfileira e a que executa um trabalho), e motor que mora
 * numa rota só pode ser chamado por ela.
 *
 * A regra que a saída preserva: existe UM caminho para gerar um dia, e ele é
 * este. A casa já pagou pelo desenho contrário, quando a montagem do pedido de
 * corte tinha uma cópia na rota e outra no script de teste: o produto era
 * consertado, o teste continuava com o desenho velho, e dizia que funcionava.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { enfileirar, cutucar, estadoDoGrupo } from "@/lib/fila/trabalhos";
import { debitar, saldo, jaCobrado, SaldoInsuficiente } from "@/lib/credits";
import { custoTotal, estimarCampanha } from "@/lib/credits/pricing";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { generateInfographic } from "@/lib/media/infographic";
import { researchTopic, formatSourcesSection } from "@/lib/research/web-search";
import { newArticlePublicToken, parseLinkedInArticleContent } from "@/lib/articles/linkedin-article";
import {
  getMediaStylePromptFragment,
  maxNarrationWordsForDuration,
  type MediaStyleId,
} from "@/lib/media/media-style";

// O teto de tempo vive nas ROTAS (`/api/cron/fila`), e nao mais aqui: desde
// 10/09 o motor gera UM dia por chamada, e cada dia tem os seus 800 s. Antes,
// a semana inteira dividia um teto so, e a conta media em 09/09 dizia o
// resultado: cada dia com imagem, Vera e correcao leva perto de 2,5 minutos,
// entao cinco dias cabiam e o sexto ficava de fora com o log dizendo
// "concluido parcialmente". Subir o teto so empurrava o mesmo problema.

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
  /** O "hoje" de quem esta na tela (AAAA-MM-DD, fuso do navegador). Ver o wizard. */
  hojeLocal?: string;
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
  topicsPerDay?: Record<string, string>; // dayOfWeek (1-7) -> specific topic for that day
}

/**
 * Que pedaço da campanha este trabalho gera.
 *
 * A pesquisa roda uma vez e fica guardada na execução; cada dia roda sozinho,
 * lendo a mesma pesquisa. É esta separação que permite sete dias com imagem
 * sem nenhum deles esbarrar no teto de tempo.
 */
export type FatiaDaCampanha =
  | { fase: "pesquisa" }
  | { fase: "dia"; dayOfWeek: number; weekOffset: number };

/** A pesquisa guardada na execução, que todo dia da semana lê. */
type PesquisaGuardada = {
  brief: string;
  bruta: string;
  fontes: Array<{ title: string; url: string }>;
};

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
/**
 * Tira o texto de bastidor de uma thread reescrita e apara o que ainda passar
 * do limite.
 *
 * Medido em 09/09 nos posts do X da semana do Bruno: os quatro comecavam com
 * "Segue a thread corrigida, com as quatro falhas apontadas pela Vera..." e
 * tinham tweets de 317 a 606 caracteres. O modelo, ao corrigir, conversa
 * antes de entregar, e a resposta inteira era gravada como post. No X isso
 * vira um primeiro tweet de bastidor e os demais truncados pelo publicador.
 *
 * Aparar aqui e o ultimo recurso, e fica no log: o caminho certo e o
 * reescritor caber no limite, e a Vera reprovar quando nao couber.
 */
function limparThreadReescrita(content: string): { content: string; aparados: number } {
  const linhas = content.split("\n");
  // Tudo antes do primeiro "1/" (ou "1)") e conversa, nao tweet.
  const inicio = linhas.findIndex((l) => /^\s*1[\/\)]\s/.test(l));
  const corpo = inicio > 0 ? linhas.slice(inicio) : linhas;
  const tweets: string[] = [];
  let atual = "";
  for (const l of corpo) {
    if (/^\s*\d+[\/\)]\s/.test(l) && atual) {
      tweets.push(atual.trimEnd());
      atual = l;
    } else {
      atual = atual ? `${atual}\n${l}` : l;
    }
  }
  if (atual.trim()) tweets.push(atual.trimEnd());
  let aparados = 0;
  const limite = PLATFORM_LIMITS.twitter.tweet;
  const prontos = tweets.map((t) => {
    if (t.length <= limite) return t;
    aparados++;
    // Corta na ultima fronteira de palavra antes do limite, sem reticencias:
    // reticencia e o sinal visivel de que a maquina cortou.
    const fatia = t.slice(0, limite);
    const ultimoEspaco = fatia.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? fatia.slice(0, ultimoEspaco) : fatia).trimEnd();
  });
  return { content: prontos.join("\n"), aparados };
}

/**
 * Tira o BASTIDOR do texto: o modelo conversando antes de entregar o post.
 *
 * Medido na prova de 10/09, numa semana de sete dias gerada de ponta a ponta:
 * TRES dos sete posts de LinkedIn comecavam com "Segue o post do LinkedIn
 * corrigido...", um comecava com "Preciso alertar sobre uma inconsistencia
 * antes de reescrever" e um comecava com o rotulo "LINKEDIN". Ou seja, mais da
 * metade da semana iria ao ar com a maquina falando com ela mesma no topo, no
 * lugar da primeira linha, que e a unica que o LinkedIn mostra antes do "ver
 * mais".
 *
 * O X ganhou este conserto em 09/09 (`limparThreadReescrita`, que joga fora
 * tudo antes do "1/"). O LinkedIn nao tinha equivalente porque nao tem uma
 * marca de inicio como o "1/": aqui a marca precisa ser o BLOCO, e o criterio
 * precisa ser apertado, senao a limpeza come a abertura legitima de um post.
 *
 * O criterio tem duas travas ao mesmo tempo, e as duas precisam bater:
 *  1. o bloco COMECA como quem entrega trabalho ("segue", "aqui esta",
 *     "nota sobre", "reescrevi", "corrigi");
 *  2. e o bloco FALA DO PROPRIO TEXTO ("post", "texto", "versao", "correcao",
 *     "Vera", "LinkedIn", "thread").
 *
 * "Segue o post do LinkedIn corrigido" bate nas duas e sai. "Segue uma verdade
 * dura sobre o seu mercado", que e abertura legitima, bate so na primeira e
 * fica. Nunca apaga o texto inteiro: se sobrar nada, devolve o original.
 */
/**
 * O post que o modelo entregou, separado do que ele falou sobre o post.
 *
 * A limpeza por padrao de frase (limparBastidorDoTexto) resolve o caso comum e
 * nao resolve o geral: provada nos sete posts de 10/09, ela tirou os cinco
 * blocos de abertura e ainda sobrou bastidor de outro sabor logo abaixo ("De
 * acordo com o feedback da Vera...", "Problema 1 corrigido: o texto agora..."),
 * porque essas frases nao comecam como quem entrega trabalho. Perseguir padrao
 * a padrao e enxugar gelo, e cada padrao novo aumenta o risco de comer a
 * abertura legitima de um post.
 *
 * A raiz e outra: ninguem tinha dito ao modelo ONDE o post comeca. Com a marca
 * pedida no prompt, a extracao vira determinismo e ele pode conversar a vontade
 * do lado de fora. A limpeza por padrao fica como queda, para o dia em que o
 * modelo esquecer a marca.
 */
function extrairPostEntregue(content: string): { content: string; removidos: number } {
  const m = content.match(/<POST>([\s\S]*?)<\/POST>/i);
  if (m && m[1].trim()) return { content: m[1].trim(), removidos: 0 };
  return limparBastidorDoTexto(content);
}

function limparBastidorDoTexto(content: string): { content: string; removidos: number } {
  const ENTREGA = /^\s*(segue|aqui (esta|est\u00e1|vai|v\u00e3o)|abaixo|nota sobre|obs(erva\u00e7\u00e3o)?:|vers\u00e3o corrigida|post corrigido|texto corrigido|reescrevi|corrigi|preciso alertar|antes de reescrever)/i;
  const FALA_DO_TEXTO = /(post|texto|vers\u00e3o|corre\u00e7\u00f5es|corre\u00e7\u00e3o|corrigid|reescrev|vera|linkedin|thread|problema[s]? (apontado|identificado))/i;
  // Rotulo solto que o modelo deixa como cabecalho da resposta.
  const ROTULO = /^\s*(linkedin|post|texto|x|twitter)\s*:?\s*$/i;

  const blocos = content.split(/\n\s*\n/);
  let inicio = 0;
  let removidos = 0;

  while (inicio < blocos.length - 1) {
    const bloco = blocos[inicio].trim();
    const ehRotulo = ROTULO.test(bloco);
    const ehBastidor = ENTREGA.test(bloco) && FALA_DO_TEXTO.test(bloco);
    if (!ehRotulo && !ehBastidor) break;
    inicio++;
    removidos++;
  }

  // Nota de rodape do tipo "Nota sobre as correcoes: removi a frase...".
  let fim = blocos.length;
  while (fim - 1 > inicio) {
    const bloco = blocos[fim - 1].trim();
    if (!(ENTREGA.test(bloco) && FALA_DO_TEXTO.test(bloco))) break;
    fim--;
    removidos++;
  }

  const limpo = blocos.slice(inicio, fim).join("\n\n").trim();
  // Cinto de seguranca: limpeza que esvazia o post e pior que o bastidor.
  if (!limpo) return { content, removidos: 0 };
  return { content: limpo, removidos };
}

/**
 * LASTRO: toda frase com numero precisa de fonte.
 *
 * Em 09/09 um post saiu com "a Fitch atribuiu perspectiva negativa a 11
 * financiamentos, citando taxas entre 15% e 25% no segundo trimestre". A Fitch
 * publicou "mais de 30% do portfolio"; o 11, o 15 e o 25 nao existem em fonte
 * nenhuma. O Roberto deu forma de numero exato a um dado vago, o Lucas copiou,
 * e a Vera aprovou porque conferiu o post contra o brief que o proprio modelo
 * escreveu. O Bruno chamou isso de inaceitavel, e e.
 *
 * A regua e de codigo, nao de prompt: cada numero do texto precisa aparecer,
 * com os mesmos digitos, na PESQUISA BRUTA (o que a busca devolveu) ou nas
 * fontes. Frase com numero sem lastro e devolvida a quem escreveu e, se
 * voltar, e removida antes de gravar. Preferimos um post com menos numeros a
 * um post com numero inventado em nome do cliente.
 *
 * O que fica de fora da conta: numeracao de tweet ("1/"), anos sozinhos
 * (1900 a 2100) e horas ("10h"), que aparecem em qualquer texto e nao sao
 * "dado".
 */
function afirmacoesSemLastro(texto: string, lastro: string): string[] {
  // Tira separador de milhar (1.234 e 1,234 viram 1234) e unifica a virgula
  // decimal em ponto (6,5 vira 6.5), dos dois lados da comparacao.
  const normalizar = (t: string) => t.replace(/[.,](?=\d{3}(?!\d))/g, "").replace(/(\d),(\d)/g, "$1.$2");
  const lastroNorm = normalizar(lastro);
  const lastroBaixo = lastroNorm.toLowerCase();
  const frases = texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  // Palavras de conteudo da frase: 5 letras ou mais, sem as que aparecem em
  // qualquer texto. E o que liga o numero ao assunto.
  const VAZIAS = new Set(["entre", "sobre", "quando", "porque", "ainda", "sendo", "mesmo", "desde", "todos", "todas", "outro", "outra", "muito", "menos", "apenas", "nesta", "neste", "dessa", "desse", "cada", "como", "para", "pelo", "pela", "essa", "esse", "isso", "aqui", "hoje", "agora", "assim", "depois", "antes", "segundo", "primeiro", "milhoes", "milhao", "bilhoes", "bilhao", "reais", "vezes", "anos", "meses", "dias"]);
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const palavrasDeConteudo = (frase: string) =>
    [...new Set(semAcento(frase.toLowerCase()).match(/[a-z]{5,}/g) ?? [])].filter((w) => !VAZIAS.has(w));

  // Um numero so conta como lastreado se aparece na pesquisa PERTO de uma
  // palavra de conteudo da frase. Sem isto, "entre 5 e 15 ferramentas" passava
  // porque "5" batia com "5 de agosto" e "15" com "15 ideias" em outro lugar da
  // pesquisa (visto na prova de 09/09). Numero solto nao e fonte; numero com
  // contexto e.
  const temLastro = (n: string, palavras: string[]): boolean => {
    const re = new RegExp(`(?<![\d\.])${n.replace(".", "\\.")}(?![\d\.])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lastroNorm)) !== null) {
      const janela = semAcento(lastroBaixo.slice(Math.max(0, m.index - 160), m.index + n.length + 160));
      if (palavras.length === 0) return true; // frase so com numero e sem assunto: nao da para cobrar contexto
      if (palavras.some((w) => janela.includes(w))) return true;
    }
    return false;
  };

  const semLastro: string[] = [];
  for (const frase of frases) {
    const corpo = frase.replace(/^\d+[\/\)]\s*/, ""); // tira a numeracao de tweet
    const numeros = [...normalizar(corpo).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    const palavras = palavrasDeConteudo(corpo);
    const suspeitos = numeros.filter((n) => {
      if (/^(19|20)\d{2}$/.test(n)) return false; // ano sozinho
      if (new RegExp(`${n}\\s*h(?:\\b|\\d)`).test(corpo)) return false; // hora (10h)
      return !temLastro(n, palavras);
    });
    if (suspeitos.length) semLastro.push(frase);
  }
  return semLastro;
}

/** Tira do texto as frases listadas, preservando o resto. Ultimo recurso. */
function removerFrases(texto: string, frases: string[]): string {
  let saida = texto;
  for (const f of frases) saida = saida.replace(f, "");
  return saida.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

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

/**
 * Regras que valem para todo agente, de todo projeto. Ficam separadas e
 * imutáveis de propósito: é o começo do prefixo cacheável, e qualquer byte
 * diferente aqui invalida o cache de todas as chamadas seguintes.
 */
const REGRAS_GLOBAIS = `Você está trabalhando em um projeto de conteúdo para redes sociais.
Responda sempre em português, com qualidade profissional e acentos corretos.
IMPORTANTE: Não use markdown (sem #, sem **, sem *). Escreva texto limpo com parágrafos separados por linha em branco.

REGRA DE OURO - INTEGRIDADE DE DADOS (obrigatório):
Você NUNCA pode inventar estatísticas, nomes de pessoas reais, nomes de empresas, estudos, pesquisas ou indicadores de mercado.
Se precisar citar um número, um estudo, uma empresa ou indicador, use SOMENTE dados reais e verificáveis, indicando sempre a fonte (ex: "segundo a McKinsey, 2024" ou "de acordo com o IBGE, 2025").
Apenas a redação, argumentação e estrutura textual devem ser criativas: os fatos devem ser sempre reais.
Se não tiver dados reais sobre um ponto específico, deixe em aberto para o usuário preencher com dados reais, não invente.`;

/**
 * Monta o prefixo cacheável de um projeto: regras globais mais os documentos
 * de contexto. Idêntico em todas as chamadas de agente do mesmo projeto, que é
 * exatamente o que o cache exige. Numa campanha de 5 dias são mais de 20
 * chamadas compartilhando esse mesmo bloco.
 */
function buildCachedPrefix(contextDocs: string): string {
  return REGRAS_GLOBAIS + contextDocs;
}

async function runAgent(
  agent: AgentStep,
  task: string,
  context: string,
  runId: string,
  funnelInstruction: string,
  cachedPrefix: string,
  projectId: string,
  agentOptions?: { maxTokens?: number }
): Promise<string> {
  await appendLog(runId, {
    agent: agent.name,
    message: `Iniciando: ${task.slice(0, 80)}...`,
    status: "running",
  });

  // A parte variável (quem é o agente, qual a tarefa) fica no system normal.
  // A parte estável vai em cachedPrefix, logo antes, e é o que a API cacheia.
  const system = `Você é ${agent.name}, ${agent.role}.
Persona: ${agent.persona}
Estilo: ${agent.style}

Diretriz de funil: ${funnelInstruction}`;

  const result = await askClaude(system, `${task}\n\nContexto:\n${context}`, {
    // 16.000, e nao 8192, e antes disso nao 2048. A REGRA DA CASA desde 22/08
    // e que nenhuma chamada que faz trabalho de verdade fica abaixo de 4000,
    // porque o teto inclui os tokens de PENSAMENTO: teto apertado nao gera
    // resposta curta, gera resposta VAZIA. A campanha de tema ficou fora dessa
    // regra e cobrou o preco duas vezes. Em 09/09, com 2048: o Tiago morreu
    // dizendo "gastou o limite de 2048 tokens pensando e nao chegou a
    // responder" e a Vera derrubou a semana inteira pelo mesmo motivo. Em
    // 10/09, ja com 8192 e na prova de sete dias: o Tiago morreu de novo, com
    // a mesma frase e o numero novo, e o sabado saiu sem post do X.
    //
    // O padrao passa a ser o mesmo teto que a Vera ganhou em 09/09. Subir o
    // teto nao encarece por si: o cobrado e o que o modelo escreve, e o teto
    // so decide quando ele morre no meio do proprio raciocinio.
    maxTokens: agentOptions?.maxTokens ?? 16_000,
    cachedPrefix,
    usage: { operation: "agent", runId, agentId: agent.agentId, projectId },
  });

  await appendLog(runId, {
    agent: agent.name,
    message: `Tarefa concluída.`,
    output: result,
    status: "completed",
  });

  return result;
}

export type PedidoDeCampanha = {
  userId: string;
  projectId: string;
  topic: string;
  campaignConfig?: CampaignConfig;
};

export type RespostaDoPedido =
  | {
      ok: true;
      /** A execução inteira, e não só o id: a tela lê `run.status` dela. */
      run: Awaited<ReturnType<typeof prisma.pipelineRun.create>>;
      dias: number;
    }
  | { ok: false; status: number; error: string; necessario?: number; disponivel?: number };

/**
 * Aceita o pedido de campanha, cria a execução e PÕE OS DIAS NA FILA.
 *
 * Até 10/09 esta função gerava a semana inteira ali mesmo, dentro do `after`
 * da requisição do cliente, e por isso o teto da plataforma decidia quantos
 * dias o produto entregava. Agora ela só valida, cobra a entrada (saldo),
 * abre a execução e enfileira: um trabalho para a pesquisa do Roberto e um
 * para cada dia. Quem trabalha é a fila, e a tela só acompanha.
 *
 * Continua respondendo em segundos, e é isso que o cliente vê.
 */
export async function agendarCampanha({
  userId,
  projectId,
  topic,
  campaignConfig,
}: PedidoDeCampanha): Promise<RespostaDoPedido> {
  if (!projectId || !topic) {
    return { ok: false, status: 400, error: "projectId and topic required" };
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
    return { ok: false, status: 404, error: "Not found" };
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

  // Verificação de saldo antes de qualquer chamada paga. A estimativa
  // superestima de propósito: barrar quem não tem saldo é o objetivo, e a
  // cobrança real acontece no fim, pelo que foi entregue. Rodar a campanha
  // inteira para descobrir no fim que o cliente não podia pagar seria gastar
  // com a API e não receber.
  const estimativa = estimarCampanha(
    Object.values(config.weeklySchedule ?? {}),
    Math.max(1, project.socialAccounts.length)
  );
  const disponivel = await saldo(userId);
  if (disponivel < estimativa) {
    return {
      ok: false,
      status: 402,
      error: `Essa campanha custa cerca de ${estimativa} créditos e você tem ${disponivel}. Recarregue ou reduza os dias da semana.`,
      necessario: estimativa,
      disponivel,
    };
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

  // ── A fila ────────────────────────────────────────────────────────────────
  // A pesquisa é a ordem 0 e cada dia vem depois, na ordem da semana. A fila
  // roda um trabalho por grupo de cada vez, então esta numeração é o que
  // garante que nenhum dia comece antes de a pesquisa existir.
  const dias = diasDaCampanha(config);
  if (dias.length === 0) {
    await appendLog(run.id, {
      agent: "Sistema",
      message:
        "Nenhum dia para gerar (todos os dias configurados já passaram ou não há agendamento).",
      status: "failed",
    });
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "failed", endedAt: new Date() },
    });
    return { ok: false, status: 400, error: "Nenhum dia para gerar." };
  }

  await enfileirar([
    {
      tipo: "campanha-pesquisa",
      grupo: run.id,
      ordem: 0,
      userId: project.userId,
      projectId: project.id,
    },
    ...dias.map((d, i) => ({
      tipo: "campanha-dia" as const,
      grupo: run.id,
      // A pesquisa é a 0, então os dias começam em 1.
      ordem: i + 1,
      userId: project.userId,
      projectId: project.id,
      payload: { dayOfWeek: d.dayOfWeek, weekOffset: d.weekOffset, contentType: d.contentType },
    })),
  ]);

  await appendLog(run.id, {
    agent: "Sistema",
    message: `${dias.length} dia(s) na fila: ${dias.map((d) => DAY_NAMES[d.dayOfWeek]).join(", ")}. A pesquisa começa agora.`,
    status: "running",
  });

  // Acorda a fila sem esperar o cron: quem acabou de pedir não deve esperar
  // até um minuto para a pesquisa começar.
  cutucar();

  return { ok: true, run, dias: dias.length };
}

/**
 * Roda UM trabalho da campanha, que é o que a fila chama.
 *
 * Recarrega projeto e execução do banco em vez de receber o estado pronto, de
 * propósito: entre um trabalho e o seguinte pode ter passado meia hora, o
 * cliente pode ter cancelado, e payload que carrega estado vira cópia que
 * envelhece.
 */
export async function rodarTrabalhoDaCampanha(
  runId: string,
  fatia: FatiaDaCampanha
): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, topic: true, config: true, projectId: true },
  });
  if (!run) throw new Error(`Execução ${runId} não existe mais.`);
  if (run.status === "cancelled") return;

  const project = await prisma.project.findUnique({
    where: { id: run.projectId },
    include: {
      agents: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      socialAccounts: { where: { isActive: true } },
      contexts: true,
    },
  });
  if (!project) throw new Error(`Projeto da execução ${runId} não existe mais.`);

  const config = (run.config ?? {}) as unknown as CampaignConfig;
  await runPipeline(runId, project, run.topic ?? "", config, fatia);
}

/**
 * Fecha a campanha: cobra pelo que foi entregue e marca a execução.
 *
 * Roda quando o último trabalho do grupo termina, e não no fim de cada dia,
 * porque a cobrança é por campanha e é idempotente pelo id da execução.
 *
 * Cobra pelo que foi ENTREGUE, não pelo que foi planejado: se a geração de
 * imagem falhou e o post saiu só com texto, o cliente paga texto. Os posts são
 * lidos do banco pelo `runId`, e não de uma lista em memória, porque agora
 * cada dia rodou numa função diferente e nenhuma delas viu a semana inteira.
 */
export async function fecharCampanha(runId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, config: true, project: { select: { id: true, userId: true } } },
  });
  if (!run || run.status === "cancelled") return;
  // Já fechada: o cron pode chamar duas vezes se dois trabalhos terminarem
  // quase juntos, e fechar duas vezes não pode cobrar duas vezes.
  if (run.status === "completed" || run.status === "failed") return;

  const config = (run.config ?? {}) as unknown as CampaignConfig;
  const postsDaCampanha = await prisma.post.findMany({
    where: { runId },
    select: { id: true, mediaType: true, platform: true, sourcesComment: true },
  });

  let creditosCobrados = 0;
  if (postsDaCampanha.length > 0 && !(await jaCobrado("campanha", runId))) {
    creditosCobrados = custoTotal(
      postsDaCampanha.map((p) => ({
        mediaType: p.mediaType,
        platform: p.platform,
        temLink: Boolean(p.sourcesComment),
      }))
    );
    try {
      await debitar({
        userId: run.project.userId,
        quantidade: creditosCobrados,
        operation: "campanha",
        projectId: run.project.id,
        refId: runId,
        note: `${postsDaCampanha.length} posts`,
      });
    } catch (err) {
      // O trabalho já foi feito e entregue. Cobrar não pode apagar a entrega,
      // então o saldo insuficiente aqui vira registro, não erro para o cliente.
      // A estimativa na entrada existe justamente para isso quase nunca cair
      // aqui.
      if (err instanceof SaldoInsuficiente) {
        creditosCobrados = 0;
        console.error(`[pipeline] run ${runId} entregue sem cobrar: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  const { falhados } = await estadoDoGrupo(runId);

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      endedAt: new Date(),
      output: {
        campaignMode: config.campaignMode,
        funnelStage: config.funnelStage,
        weeklySchedule: config.weeklySchedule,
        postsCreated: postsDaCampanha.map((p) => p.id),
        totalPosts: postsDaCampanha.length,
        diasQueFalharam: falhados,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await appendLog(runId, {
    agent: "Sistema",
    creditsCharged: creditosCobrados,
    message: falhados
      ? `Campanha ${config.campaignMode} concluída com ${falhados} dia(s) que não deram certo. ${postsDaCampanha.length} posts criados para aprovação.`
      : `Campanha ${config.campaignMode} concluída! ${postsDaCampanha.length} posts criados para aprovação.`,
    status: "completed",
  });
}

/**
 * Quais dias esta campanha gera, lidos so da configuracao.
 *
 * Vive no nivel do modulo porque quem ENFILEIRA precisa da lista antes de
 * qualquer dia rodar: e ela que vira um trabalho por dia. Enquanto morou
 * dentro do motor, so quem ja estava gerando sabia quantos dias existiam.
 */
export function diasDaCampanha(
  config: CampaignConfig
): Array<{ dayOfWeek: number; contentType: ContentType; weekOffset: number }> {
  const weeksToGenerate: number[] = config.campaignMode === "biweekly" ? [0, 1] : [0];
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

  // Cutoff: yesterday midnight UTC.
  // Using "yesterday" instead of "today" gives a 24h buffer so that a user in UTC-3
  // who is generating at 9pm local time (= midnight UTC next day) doesn't lose "today".
  // A MESMA regra da tela, e nao uma parecida. A tela omite todo dia anterior
  // a "hoje" no fuso da pessoa, e diz isso a ela ("1 dia omitido"). Aqui o
  // corte era "ontem, meia-noite UTC", que deixa passar o dia anterior
  // inteiro: em 09/09 a terca foi gerada numa quarta, empurrada para "agora"
  // e apareceu na coluna de quarta com rotulo de terca. Duas regras para a
  // mesma pergunta e o que produz esse tipo de defeito.
  //
  // O "hoje" vem do navegador (`hojeLocal`). Sem ele (pedido antigo), cai no
  // Brasil, UTC-3, que e onde o produto vende.
  const hojeLocal = /^\d{4}-\d{2}-\d{2}$/.test(config.hojeLocal ?? "")
    ? config.hojeLocal!
    : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cutoffUtc = new Date(hojeLocal + "T00:00:00.000Z");

  for (const weekOffset of weeksToGenerate) {
    for (const [dayKey, contentType] of Object.entries(config.weeklySchedule)) {
      if (!contentType) continue; // skip days without content type (= off)

      const dayOfWeek = parseInt(dayKey);

      if (weekOffset === 0) {
        // Skip days that are clearly in the past (more than 1 full day ago in UTC).
        // The 24h buffer handles users in UTC-3 (Brazil): at 9pm local time the UTC
        // clock already shows "tomorrow", so without buffer "today" would be skipped.
        const dayDate = new Date(config.weekStart + "T00:00:00.000Z");
        dayDate.setUTCDate(dayDate.getUTCDate() + (dayOfWeek - 1));
        if (dayDate < cutoffUtc) continue;
        // postingTimestamps are used only by getScheduledAt for the exact posting time.
        // Never skip a day just because its timestamp is absent — the user explicitly
        // requested this week and getScheduledAt will schedule past slots for +10min.
      }

      result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset });
    }
  }
  return result;
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
  config: CampaignConfig,
  fatia: FatiaDaCampanha
) {
  if (!project) return;

  const funnelInstruction = FUNNEL_INSTRUCTIONS[config.funnelStage];
  const weekStartIso = config.weekStart ?? currentMonday();

  /** Get scheduledAt datetime for a given dayOfWeek + weekOffset, including time from config */
  function getScheduledAt(dayOfWeek: number, weekOffset: number): Date {
    const now = new Date();

    // Prefer pre-computed UTC ISO from the browser (timezone-correct)
    if (config.campaignMode === "single" && config.singleScheduledAt) {
      const d = new Date(config.singleScheduledAt);
      // Never schedule in the past — bump to 10 min from now
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
    }
    if (weekOffset === 0 && config.postingTimestamps?.[String(dayOfWeek)]) {
      const d = new Date(config.postingTimestamps[String(dayOfWeek)]);
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
    }
    // Fallback: compute server-side (always use UTC to avoid local-timezone drift)
    if (config.campaignMode === "single" && config.singleDate) {
      const time = config.singleTime ?? "09:00";
      const d = mergeDateTime(config.singleDate, time);
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
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
    // If the computed date is in the past, schedule for +10min (don't advance to next week —
    // the user explicitly requested this week's campaign and wants today's content generated)
    if (d <= now) return new Date(now.getTime() + 10 * 60 * 1000);
    return d;
  }


  // Só o dia desta fatia. A lista inteira já foi decidida na hora de
  // enfileirar, e é relida aqui a partir da MESMA função, para o dia de um
  // trabalho velho não sair de uma regra diferente da que o criou.
  const daysList =
    fatia.fase === "dia"
      ? diasDaCampanha(config).filter(
          (d) => d.dayOfWeek === fatia.dayOfWeek && d.weekOffset === fatia.weekOffset
        )
      : [];

  if (fatia.fase === "dia" && daysList.length === 0) {
    // O dia saiu da lista entre o pedido e a execução: a semana virou, ou a
    // configuração mudou. Não é falha, é trabalho que perdeu a razão de ser.
    await appendLog(runId, {
      agent: "Sistema",
      message: `O dia ${DAY_NAMES[fatia.dayOfWeek] ?? fatia.dayOfWeek} não está mais na semana pedida e foi dispensado.`,
      status: "warning",
    });
    return;
  }

  // Build context block from ProjectContext
  const contextDocs = project.contexts.length > 0
    ? "\n\n--- CONTEXTO DO PROJETO ---\n" + project.contexts.map((c) => `## ${c.title}\n${c.compiled}`).join("\n\n")
    : "";

  // Prefixo cacheável: idêntico em todas as chamadas de agente deste run.
  // Numa campanha de 5 dias isso é reaproveitado por mais de 20 chamadas.
  const cachedPrefix = buildCachedPrefix(contextDocs);

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
  // Projeto sem squad nao gera nada, e ate 09/09 isso saia como "campanha
  // concluida, 0 posts" em 130 ms, sem aviso. Um projeto criado fora do fluxo
  // normal (script, migracao, importacao) chega aqui sem `ProjectAgent`, e a
  // resposta certa e dizer isso, nao fingir que a semana foi feita.
  if (!project.agents.length) {
    await appendLog(runId, {
      agent: "Sistema",
      message: "Este projeto está sem squad (nenhum agente cadastrado), então nada pôde ser escrito. Refaça o setup do projeto ou fale com o suporte.",
      status: "failed",
    });
    await prisma.pipelineRun.update({ where: { id: runId }, data: { status: "failed", endedAt: new Date() } });
    return;
  }

  const researcher = makeAgent("roberto-radar");
  let researchBrief = "";
  let webSourcesGlobal: Array<{ title: string; url: string }> = [];
  let webSearchDataGlobal = "";

  if (fatia.fase === "dia") {
    // O dia NÃO pesquisa: lê a pesquisa que a ordem 0 guardou na execução.
    // Pesquisar de novo custaria uma busca e um brief por dia, daria uma
    // semana sem fio condutor, e faria a régua de lastro medir cada dia contra
    // uma pesquisa diferente da do dia anterior.
    const guardada = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { pesquisa: true },
    });
    const p = (guardada?.pesquisa ?? null) as PesquisaGuardada | null;
    if (p) {
      researchBrief = p.brief ?? "";
      webSearchDataGlobal = p.bruta ?? "";
      webSourcesGlobal = p.fontes ?? [];
    }
  }

  if (fatia.fase === "pesquisa" && researcher) {
    await appendLog(runId, { agent: "Sistema", message: "Iniciando pesquisa...", status: "running" });
    // 1a. Busca web em tempo real — Grok (xAI) com live X/news/web, fallback Gemini
    let webSearchData = "";
    let webSources: Array<{ title: string; url: string }> = [];
    const geminiKey = process.env.GEMINI_API_KEY;

    try {
      await appendLog(runId, { agent: "Roberto Radar", message: "Buscando dados em tempo real no X e web...", status: "running" });
      const searchResult = await researchTopic(
        topic,
        project.niche ?? "geral",
        project.targetAudience ?? "profissionais",
        geminiKey ?? ""
      );
      webSearchData = searchResult.summary;
      webSources = searchResult.sources;
      webSourcesGlobal = searchResult.sources;
      webSearchDataGlobal = searchResult.summary;
      await appendLog(runId, {
        agent: "Roberto Radar",
        message: `Pesquisa concluída — ${webSources.length} fontes encontradas.`,
        status: "running",
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await appendLog(runId, { agent: "Roberto Radar", message: `Aviso: busca falhou — ${errMsg.slice(0, 300)}`, status: "warning" });
    }

    // 1b. Roberto estrutura os dados reais em um brief — SEM inventar nada
    const sourcesSection = formatSourcesSection(webSources);

    if (!webSearchData) {
      // Sem dados reais, brief mínimo sem alucinar fontes
      researchBrief = `AVISO: Busca em tempo real não retornou dados. Brief baseado apenas no tema: "${topic}".
Nicho: ${project.niche ?? "geral"}. Público: ${project.targetAudience ?? "profissionais"}.
Gere o conteúdo com base no conhecimento do nicho, sem citar fontes ou números que não puder verificar.`;
    } else {
      const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

      researchBrief = await runAgent(
        researcher,
        `Você é o Roberto Radar. Sua função é estruturar e apresentar os dados reais encontrados agora na internet — NÃO inventar nada.

DADOS REAIS COLETADOS AGORA (${today}) via busca live no X, notícias e web:
═══════════════════════════════════════════════════════════
${webSearchData}
═══════════════════════════════════════════════════════════

⚠️ REGRAS ABSOLUTAS:
- Use APENAS os dados acima. Não adicione fontes, números, pesquisas ou casos que não estejam nos dados acima.
- Se os dados citam posts do X, cite-os. Se citam notícias, cite-as. Se não há dados suficientes sobre um ponto, diga "não encontrado nos dados desta pesquisa".
- NUNCA invente percentuais, estatísticas, relatórios (McKinsey, Gartner, etc.) que não estejam explicitamente nos dados acima.
- Se os dados acima forem ricos em posts do X e notícias do dia, isso é ouro — use tudo.

ESTRUTURA DO BRIEF (organize os dados acima nesta ordem):
1. O QUE ESTÁ ACONTECENDO AGORA: posts do X, notícias do dia, debates de hoje (use os dados acima)
2. NÚMEROS E FATOS REAIS: apenas os dados e estatísticas que aparecem nos resultados acima
3. QUEM ESTÁ FALANDO E O QUE ESTÁ DIZENDO: influenciadores, empresas, pessoas mencionadas nos dados
4. OPORTUNIDADE DE CONTEÚDO: ângulos para o criador de conteúdo explorar ESTE tema AGORA

Tema: "${topic}" | Nicho: ${project.niche ?? "geral"} | Público: ${project.targetAudience ?? "profissionais"}
${sourcesSection ? `\nFONTES REAIS ENCONTRADAS (inclua ao final):\n${sourcesSection}` : ""}`,
        baseContext,
        runId,
        funnelInstruction,
        cachedPrefix,
        project.id,
        // 4096 levava 60-70s e causava timeout: 2048 é suficiente para um brief
        { maxTokens: 6000 },
      );

      // O brief passa pela regua do lastro contra a pesquisa BRUTA. Uma chance
      // de o Roberto tirar o que inventou; o que sobrar sai na tesoura.
      const lastroDoBrief = `${webSearchData}\n${sourcesSection}\n${topic}`;
      let semLastro = afirmacoesSemLastro(researchBrief, lastroDoBrief);
      if (semLastro.length) {
        await appendLog(runId, {
          agent: "Roberto Radar",
          message: `${semLastro.length} afirmação(ões) com número sem fonte na pesquisa. Devolvendo para tirar: ${semLastro.map((f) => f.slice(0, 90)).join(" | ")}`,
          status: "warning",
        });
        researchBrief = await runAgent(
          researcher,
          `Seu brief tem afirmações com números que NÃO aparecem nos dados da pesquisa. Isso não pode ir para o cliente.

AFIRMAÇÕES SEM LASTRO (remova cada uma; NÃO substitua por outro número, NÃO arredonde, NÃO estime):
${semLastro.map((f) => `- ${f}`).join("\n")}

Reescreva o brief inteiro sem elas. Todo número que ficar precisa estar, com os mesmos dígitos, nos dados abaixo.

DADOS DA PESQUISA (a única fonte permitida):
${webSearchData.slice(0, 12_000)}

BRIEF ATUAL:
${researchBrief}`,
          baseContext, runId, funnelInstruction, cachedPrefix, project.id, { maxTokens: 6000 },
        );
        semLastro = afirmacoesSemLastro(researchBrief, lastroDoBrief);
        if (semLastro.length) {
          researchBrief = removerFrases(researchBrief, semLastro);
          await appendLog(runId, {
            agent: "Roberto Radar",
            message: `${semLastro.length} afirmação(ões) removida(s) do brief por não ter fonte: ${semLastro.map((f) => f.slice(0, 90)).join(" | ")}`,
            status: "warning",
          });
        }
      }
    }

    // Research card is saved inside the day loop (one per day, at the start of each day)
    // so the sequence Roberto → Lucas → Tiago → Diana → Vera → Paulo is visible per day.
  }

  if (fatia.fase === "pesquisa") {
    // A pesquisa acabou aqui, e é tudo o que este trabalho tinha para fazer.
    // Guardar a BRUTA junto com o brief não é luxo: é o que a régua de lastro
    // mede, e foi a falta dela que deixou passar "a Fitch atribuiu perspectiva
    // negativa a 11 financiamentos", número que não existia em fonte nenhuma.
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        pesquisa: {
          brief: researchBrief,
          // Mesmo teto do card do Roberto, para não guardar duas medidas
          // diferentes da mesma coisa.
          bruta: webSearchDataGlobal.slice(0, 20_000),
          fontes: webSourcesGlobal,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await appendLog(runId, {
      agent: "Roberto Radar",
      message: `Pesquisa guardada: ${webSourcesGlobal.length} fonte(s). Os dias começam agora.`,
      status: "running",
    });
    return;
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

  // A MEMÓRIA DE NÃO REPETIR, relida do banco.
  //
  // Ela existe para o Lucas e o Tiago não repetirem ângulo, dado, abertura e
  // CTA de um dia para o outro. Enquanto a semana inteira rodava numa função
  // só, essa memória era uma lista em memória que os dias herdavam de graça.
  // Com um dia por trabalho, cada dia roda numa função que nunca viu os
  // outros: sem esta leitura, a quinta-feira escreveria de novo o post da
  // quarta sem saber. Ler do banco é melhor que a lista antiga também porque
  // sobrevive a retentativa.
  const jaEscritos = await prisma.post.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    select: { platform: true, content: true, dayOfWeek: true },
  });
  const writtenPostsLog: string[] = jaEscritos.map((p) => {
    const dia = DAY_NAMES[p.dayOfWeek ?? 0] ?? "Dia";
    const rede = p.platform === "linkedin" ? "LinkedIn" : "X";
    const limite = p.platform === "linkedin" ? 120 : 100;
    return `[${dia} - ${rede}] ${p.content.slice(0, limite).replace(/\n/g, " ")}…`;
  });
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
    // O que da para medir, mede-se ANTES de pedir opiniao. Em 09/09 a Vera
    // aprovou threads com tweets de 317 a 606 caracteres e com "Segue a thread
    // corrigida" como primeiro tweet: ela nao tinha o limite no checklist e nao
    // conta caractere. O numero vai pronto para ela, e a regra de reprovar
    // fica escrita.
    const violacoesMedidas: string[] = [];
    if (twC) {
      violacoesMedidas.push(...validateTwitterThread(twC).violations);
      if (/^\s*(segue|aqui est[aá]|abaixo|a thread foi)/i.test(twC)) {
        violacoesMedidas.push("A thread do X começa com texto de bastidor, e não com o tweet 1/");
      }
    }
    if (liC && liC.length > PLATFORM_LIMITS.linkedin.post) {
      violacoesMedidas.push(`Post do LinkedIn tem ${liC.length} chars (limite: ${PLATFORM_LIMITS.linkedin.post})`);
    }
    // LASTRO: frase com numero que nao esta na pesquisa bruta nem nas fontes.
    // Contra a pesquisa BRUTA, e nao contra o brief: o brief e escrito pelo
    // mesmo tipo de modelo que escreve o post, e "bate com o brief" e conferir a
    // copia contra a copia (foi assim que o "11 financiamentos" passou).
    const lastroDaVera = `${webSearchDataGlobal}\n${webSourcesGlobal.map((f) => `${f.title} ${f.url}`).join("\n")}\n${topic}`;
    const semLastroVera = [
      ...(liC ? afirmacoesSemLastro(liC, lastroDaVera).map((f) => `LinkedIn: ${f}`) : []),
      ...(twC ? afirmacoesSemLastro(twC, lastroDaVera).map((f) => `X: ${f}`) : []),
    ];
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
7. LIMITES DA REDE, medidos por código antes desta revisão (não são opinião):
${violacoesMedidas.length ? violacoesMedidas.map((v) => `   • ${v}`).join("\n") : "   • nenhuma violação medida"}
   Se houver qualquer violação acima, o veredito é REPROVADO_TEXTO: tweet acima de ${PLATFORM_LIMITS.twitter.tweet} caracteres sai TRUNCADO no X, e texto de bastidor ("segue a thread corrigida", "aqui está") vai ao ar como primeiro tweet.
8. LASTRO DOS NÚMEROS, medido por código contra a PESQUISA BRUTA (não contra o brief):
${semLastroVera.length ? semLastroVera.map((f) => `   • ${f.slice(0, 220)}`).join("\n") : "   • todos os números do texto aparecem na pesquisa"}
   Se houver qualquer frase acima, o veredito é REPROVADO_TEXTO e a correção é REMOVER a frase, nunca trocar o número por outro. A plataforma não publica número que não tem fonte, em hipótese nenhuma.

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

  const robertoCardSavedForDays = new Set<string>();

  for (const { dayOfWeek, contentType, weekOffset } of daysList) {
   // O DIA E A UNIDADE DE FALHA, e nao a campanha.
   //
   // Em 09/09 a Vera falhou na terca e levou junto quarta, quinta, sexta,
   // sabado e domingo: o erro subiu ate o `catch` de fora, que marca a
   // execucao inteira como falha. O cliente pediu seis dias, pagou a espera de
   // seis, e recebeu um. Entregar cinco de seis e ruim; entregar um de seis
   // porque o sexto tropecou e outra coisa.
   try {
    // ── Cancellation check ────────────────────────────────────────────────────
    const runCheck = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (runCheck?.status === "cancelled") {
      await appendLog(runId, { agent: "Sistema", message: "Geração cancelada pelo usuário.", status: "error" });
      return;
    }

    const dayName = DAY_NAMES[dayOfWeek];
    const scheduledDate = getScheduledAt(dayOfWeek, weekOffset);
    const dayKey = `${dayOfWeek}-${weekOffset}`;
    // Use per-day topic if provided (from modal).
    // If not, add a day-specific angle so each day's content has a distinct focus
    // even when the global topic is the same — prevents Twitter threads from repeating.
    const DAY_ANGLES: Record<number, string> = {
      1: "(ângulo: o PROBLEMA — dores e desafios que o público enfrenta)",
      2: "(ângulo: a SOLUÇÃO — estratégias práticas e como superar os obstáculos)",
      3: "(ângulo: DADOS e evidências — pesquisas e tendências reais)",
      4: "(ângulo: CASOS REAIS — exemplos concretos e situações que o público reconhece)",
      5: "(ângulo: FUTURO — oportunidades, riscos e próximos passos para agir agora)",
      6: "(ângulo: MITOS — derrube uma crença comum ou questione o senso comum)",
      7: "(ângulo: IMPACTO HUMANO — o lado humano, efeitos nas pessoas e nas equipes)",
    };
    const dayTopic = config.topicsPerDay?.[String(dayOfWeek)]?.trim()
      || `${topic} ${DAY_ANGLES[dayOfWeek] ?? ""}`;
    let dianaCardId: string | undefined;

    // ── Step 1 (per day): Save Roberto's research card at the START of each day ──
    // This preserves the sequence Roberto → Lucas → Tiago → Diana → Vera → Paulo per day.
    if (researchBrief && researcher && !robertoCardSavedForDays.has(dayKey)) {
      robertoCardSavedForDays.add(dayKey);
      await saveCard({
        runId,
        projectId: project.id,
        agentId: "roberto-radar",
        agentName: researcher.name,
        dayOfWeek,
        scheduledDate,
        cardType: "research",
        content: researchBrief,
        // PROVENIENCIA. Em 09/09 um post saiu com "a Fitch atribuiu perspectiva
        // negativa a 11 financiamentos", numero que nao existe em fonte nenhuma:
        // a Fitch publicou "mais de 30% do portfolio", e o modelo inventou o 11
        // ao estruturar. Sem a pesquisa bruta guardada nao havia como saber onde
        // a distorcao entrou. O card do Roberto leva o que a busca devolveu e as
        // fontes, para auditar.
        metadata: { pesquisaBruta: webSearchDataGlobal.slice(0, 20_000), fontes: webSourcesGlobal },
      });
    }

    const resolvedType: ContentType =
      contentType === "free"
        ? (["text", "image", "poll", "image", "article"][((dayOfWeek - 1) % 5)] as ContentType)
        : contentType;

    // Build uniqueness guard ONCE per day — shared by LinkedIn and Twitter prompts
    const uniquenessBlock = writtenPostsLog.length > 0
      ? `\n\n⛔ POSTS JÁ ESCRITOS NESTA CAMPANHA (NUNCA repita o mesmo ângulo, dado, frase de abertura, conclusão ou CTA):\n${writtenPostsLog.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    // ── Lucas (LinkedIn) + Tiago (Twitter) em paralelo ───────────────────────
    // Os dois redatores são independentes — usam o mesmo brief de pesquisa e o
    // mesmo snapshot do uniquenessBlock. Rodar em paralelo poupa ~20-30s por dia.
    const [liResult, twResult] = await Promise.allSettled([
      // ── Lucas — LinkedIn ──────────────────────────────────────────────────
      (async () => {
        if (!shouldWriteLinkedin || !linkedinWriter) return null;
        let linkedinContent: string;
        let linkedinMetadata: Record<string, unknown> | undefined;

        if (resolvedType === "poll") {
          linkedinContent = await runAgent(
            linkedinWriter,
            `Crie uma ENQUETE (poll) para LinkedIn para ${dayName} sobre: "${dayTopic}".
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
            funnelInstruction,
            cachedPrefix,
            project.id,
          );
          linkedinMetadata = parsePollContent(linkedinContent);

        } else if (resolvedType === "article") {
          linkedinContent = await runAgent(
            linkedinWriter,
            `Escreva um ARTIGO COMPLETO para LinkedIn para ${dayName} sobre: "${dayTopic}".
Tom de voz: ${project.voice || "especialista e reflexivo"}.
Estrutura sugerida no CORPO: abertura forte → desenvolvimento com dados reais e fontes → conclusão com CTA.
${linkedinRules("article")}
Use os dados da pesquisa. Não invente fatos.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            cachedPrefix,
            project.id,
            { maxTokens: 8192 },
          );
          const parsedArt = parseLinkedInArticleContent(linkedinContent);
          linkedinMetadata = {
            type: "linkedin_article",
            articleTitle: parsedArt.title,
            articleTeaser: parsedArt.teaser,
          };

        } else {
          const formatHint = resolvedType === "text"
            ? "apenas texto"
            : resolvedType === "image" || resolvedType === "carousel" || resolvedType === "infographic"
            ? "acompanha imagem/infográfico — o texto deve ser auto-suficiente sem ver a imagem"
            : resolvedType === "video"
            ? "acompanha vídeo — apresente o tema e chame para assistir"
            : "conteúdo rico";

          linkedinContent = await runAgent(
            linkedinWriter,
            `Escreva um post de LinkedIn para ${dayName} sobre: "${dayTopic}".
Tom de voz: ${project.voice || "provocativo e direto, usa dados"}.
Formato: ${formatHint}.
${linkedinRules("post")}
Aborde um ÂNGULO DIFERENTE dos posts anteriores — perspectiva nova, dado diferente, CTA distinto.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            cachedPrefix,
            project.id,
          );
        }

        // ── LinkedIn character limit enforcement ────────────────────────────
        // Bastidor fora ANTES de qualquer conta de tamanho: o rotulo
        // "LINKEDIN" sozinho no topo, visto na prova de 10/09, nasce aqui e
        // nao na correcao da Vera. Contar caractere de bastidor tambem
        // falsearia a conta do limite.
        {
          const limpo = limparBastidorDoTexto(linkedinContent);
          if (limpo.removidos) {
            linkedinContent = limpo.content;
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `${limpo.removidos} bloco(s) de bastidor removido(s) do rascunho de ${dayName}.`,
              status: "warning",
            });
          }
        }

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
            funnelInstruction,
            cachedPrefix,
            project.id,
          );
          if (rewritten.length <= LI_LIMIT) {
            // A reescrita por tamanho tem a mesma doenca da reescrita da Vera.
            linkedinContent = limparBastidorDoTexto(rewritten).content;
            await appendLog(runId, { agent: "Lucas LinkedIn", message: `Reescrito com ${linkedinContent.length} chars ✓`, status: "running" });
          } else {
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `⚠ Segunda tentativa ainda acima do limite (${rewritten.length} chars). Usando versão original — publicação pode falhar.`,
              status: "warning",
            });
          }
        }

        // Primeiro comentário com fontes da pesquisa
        if (resolvedType !== "article" && resolvedType !== "poll") {
          let firstComment = extractFirstComment(researchBrief);
          if (!firstComment && webSourcesGlobal.length > 0) {
            const lines = webSourcesGlobal
              .slice(0, 5)
              .map((s) => `- ${s.title}: ${s.url}`)
              .join("\n");
            firstComment = `📚 Fontes e referências:\n\n${lines}`;
          }
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

        return { content: linkedinContent, metadata: linkedinMetadata, card };
      })(),

      // ── Tiago — Twitter ───────────────────────────────────────────────────
      (async () => {
        if (!shouldWriteTwitter || !twitterWriter) return null;
        let twitterContent: string;
        let twitterMetadata: Record<string, unknown> | undefined;

        if (resolvedType === "poll") {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma ENQUETE para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("poll")}

Formato OBRIGATÓRIO (siga exatamente):
TWEET: [texto apresentando a enquete, máx ${PLATFORM_LIMITS.twitter.tweet} chars]
OPCAO_1: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
OPCAO_2: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
DURACAO_HORAS: 1440

Seja direto e provocativo.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva sem números.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            cachedPrefix,
            project.id,
          );
          twitterMetadata = parseTwitterPollContent(twitterContent);

        } else if (resolvedType === "thread") {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma THREAD para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("thread")}
6-8 tweets no total. Numere como 1/ 2/ 3/ etc.
→ Tweet 1: abertura impactante que gere curiosidade imediata
→ Tweets 2-N: desenvolvimento com dados e argumentos
→ Último tweet: CTA claro + hashtags (máx 2)
Aborde um ângulo diferente dos posts anteriores.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            cachedPrefix,
            project.id,
          );

        } else {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma thread para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("thread")}
5-7 tweets no total. Numere como 1/ 2/ etc.
→ Tweet 1: abertura impactante
→ Tweets intermediários: conteúdo de valor
→ Último tweet: CTA claro
Aborde um ângulo diferente dos posts anteriores.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            cachedPrefix,
            project.id,
          );
        }

        // ── Twitter thread validation ───────────────────────────────────────
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
              funnelInstruction,
              cachedPrefix,
              project.id,
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

        return { content: twitterContent, metadata: twitterMetadata, card };
      })(),
    ]);

    // Collect results into dayPosts and uniqueness log
    if (liResult.status === "fulfilled" && liResult.value) {
      const { content, metadata, card } = liResult.value;
      dayPosts.push({ day: dayName, platform: "linkedin", content, mediaType: resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata });
      writtenPostsLog.push(`[${dayName} - LinkedIn] ${content.slice(0, 120).replace(/\n/g, " ")}…`);
    } else if (liResult.status === "rejected") {
      await appendLog(runId, { agent: "Lucas LinkedIn", message: `Erro ao gerar post: ${liResult.reason instanceof Error ? liResult.reason.message : String(liResult.reason)}`, status: "warning" });
    }
    if (twResult.status === "fulfilled" && twResult.value) {
      const { content, metadata, card } = twResult.value;
      dayPosts.push({ day: dayName, platform: "twitter", content, mediaType: resolvedType === "thread" ? "thread" as ContentType : resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata });
      writtenPostsLog.push(`[${dayName} - X] ${content.slice(0, 100).replace(/\n/g, " ")}…`);
    } else if (twResult.status === "rejected") {
      await appendLog(runId, { agent: "Tiago Twitter", message: `Erro ao gerar post: ${twResult.reason instanceof Error ? twResult.reason.message : String(twResult.reason)}`, status: "warning" });
    }

    // Look up what was just generated for this day (used by Diana, Vera, Paulo below)
    const liPost = dayPosts.find((p) => p.platform === "linkedin" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());
    const twPost = dayPosts.find((p) => p.platform === "twitter" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());

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
            // Wrap with 80s hard cap so Diana never hangs the entire pipeline
            const infographicWithTimeout = Promise.race([
              generateInfographic(visualPromptSource, project.niche ?? "business", process.env.GEMINI_API_KEY!, infoPlatform),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout: infographic > 80s")), 80_000)),
            ]);
            dianaFinalUrl = await infographicWithTimeout;
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
          funnelInstruction,
          cachedPrefix,
          project.id,
        );

        if (hasApiKey) {
          // Hard cap: Diana media generation must finish within 70s
          const withDianaCap = <T>(p: Promise<T>): Promise<T> =>
            Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout: media > 70s")), 70_000))]);

          try {
            if (isVideoType) {
              // Veo takes 60-300s to generate — impossible within the 300s pipeline budget.
              // Generate a cinematic still image instead; the video prompt is saved so the
              // user can manually regenerate the actual video from the card later.
              await appendLog(runId, { agent: "Diana Design", message: `Gerando imagem cinematográfica para ${dayName} (vídeo gerado separadamente após a campanha).`, status: "running" });
              try {
                const fallbackUrl = await withDianaCap(generateImage(`${visualPrompt} — cinematic still frame, 16:9`, "16:9", "standard", { projectId: project.id, runId, operation: "campanha_imagem" }));
                mediaByDayKey[dayKey] = { imageUrl: fallbackUrl, imagePrompt: visualPrompt };
                dianaFinalUrl = fallbackUrl;
                await appendLog(runId, { agent: "Diana Design", message: `Imagem gerada para ${dayName}. Clique no card para gerar o vídeo final.`, status: "completed" });
              } catch {
                mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
                await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar imagem para ${dayName}. Prompt salvo.`, status: "warning" });
              }
            } else if (resolvedType === "carousel") {
              const imageUrl = await withDianaCap(generateImage(visualPrompt, "1:1", "standard", { projectId: project.id, runId, operation: "campanha_imagem" }));
              const slide2 = await withDianaCap(generateImage(`${visualPrompt} — slide 2, continuation`, "1:1", "standard", { projectId: project.id, runId, operation: "campanha_imagem" }));
              const slide3 = await withDianaCap(generateImage(`${visualPrompt} — slide 3, call to action`, "1:1", "standard", { projectId: project.id, runId, operation: "campanha_imagem" }));
              dianaFinalUrl = [imageUrl, slide2, slide3].join("|");
              mediaByDayKey[dayKey] = { imageUrl: dianaFinalUrl, imagePrompt: visualPrompt };
              await appendLog(runId, { agent: "Diana Design", message: `Carrossel (3 slides) gerado para ${dayName}.`, status: "completed" });
            } else {
              const imageUrl = await withDianaCap(generateImage(visualPrompt, "linkedin-landscape", "standard", { projectId: project.id, runId, operation: "campanha_imagem" }));
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
        funnelInstruction,
        cachedPrefix,
        project.id,
        // 16000 para a Vera, e nao os 8192 do padrao: o checklist dela cresceu com
        // as duas reguas medidas (limites da rede e lastro dos numeros), e em
        // 09/09 ela gastou o teto inteiro pensando na quarta e derrubou o dia.
        // O padrao ja e 16.000 desde 10/09; a Vera foi a primeira a precisar.
      );

      const { approved, verdict, needsTextRetry } = parseVeraVerdict(firstOutput);

      // ── Auto-correction: if Vera rejected text, ask the writers to fix it once ──
      let liContentFinal = liPost?.content;
      let twContentFinal = twPost?.content;

      if (needsTextRetry) {
        await appendLog(runId, {
          agent: "Vera Veredito",
          message: `Problemas detectados em ${dayName} — iniciando correção automática...`,
          status: "running",
        });

        const [liFixed, twFixed] = await Promise.allSettled([
          // LinkedIn: retry only if Vera's output mentions linkedin-specific issues
          (async () => {
            if (!liPost?.cardId || !linkedinWriter) return null;
            const veraLower = firstOutput.toLowerCase();
            const liMentionedBad = /linkedin[\s\S]{0,400}(violação|invent|problem|reprovad|errad|incorret)/i.test(firstOutput);
            if (!liMentionedBad) return null; // LinkedIn was OK — don't touch it
            const fixed = await runAgent(
              linkedinWriter,
              `A Vera reprovou o post do LinkedIn. Corrija os problemas identificados e reescreva.

REGRA QUE NÃO SE NEGOCIA: toda frase que a Vera listou em "LASTRO DOS NÚMEROS" sai do texto. Não troque o número por outro, não arredonde, não estime. Um post com menos números é aceitável; um número sem fonte, não.

FEEDBACK DA VERA:
${firstOutput.slice(0, 2000)}

⚠ NUNCA invente estatísticas, percentuais ou dados — use APENAS fatos do brief de pesquisa acima.

COMO ENTREGAR: escreva o post final entre <POST> e </POST>. O que estiver fora dessas marcas nao vai para o ar, entao comente o que quiser la fora; dentro delas vai SO o texto que o cliente publica, comecando pela primeira palavra do post.

POST ATUAL:
${liPost.content}`,
              contextWithResearch, runId, funnelInstruction,
              cachedPrefix,
              project.id,
            );
            await prisma.campaignCard.update({ where: { id: liPost.cardId }, data: { content: fixed } });
            return fixed;
          })(),
          // Twitter: always retry when REPROVADO_TEXTO (Tiago is the main offender for invented stats)
          (async () => {
            if (!twPost?.cardId || !twitterWriter) return null;
            const fixed = await runAgent(
              twitterWriter,
              `A Vera reprovou a thread do Twitter. Corrija os problemas identificados e reescreva.

REGRA QUE NÃO SE NEGOCIA: toda frase que a Vera listou em "LASTRO DOS NÚMEROS" sai do texto. Não troque o número por outro, não arredonde, não estime. Um post com menos números é aceitável; um número sem fonte, não.

FEEDBACK DA VERA:
${firstOutput.slice(0, 2000)}

⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos do brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.

THREAD ATUAL:
${twPost.content}`,
              contextWithResearch, runId, funnelInstruction,
              cachedPrefix,
              project.id,
            );
            // A reescrita passa pela MESMA regua do primeiro rascunho. Ate 09/09
            // ela era gravada crua, e foi assim que "Segue a thread corrigida"
            // virou o primeiro tweet de quatro posts.
            const limpa = limparThreadReescrita(fixed);
            const { violations: sobras } = validateTwitterThread(limpa.content);
            if (limpa.aparados > 0 || sobras.length > 0) {
              await appendLog(runId, {
                agent: "Tiago Twitter",
                message: `Thread corrigida veio fora do limite (${limpa.aparados} tweet(s) aparados${sobras.length ? `; ainda: ${sobras.join("; ")}` : ""}).`,
                status: "warning",
              });
            }
            await prisma.campaignCard.update({ where: { id: twPost.cardId }, data: { content: limpa.content } });
            return limpa.content;
          })(),
        ]);

        if (liFixed.status === "fulfilled" && liFixed.value) {
          // A REESCRITA E O LUGAR MAIS SUJO DO FLUXO: o modelo acabou de ser
          // reprovado, entao ele explica o que corrigiu antes de entregar. Na
          // prova de 10/09 tres dos sete posts da semana comecavam com essa
          // explicacao, que e a primeira linha que o LinkedIn mostra.
          const limpo = extrairPostEntregue(liFixed.value);
          liContentFinal = limpo.content;
          const idx = dayPosts.findIndex(p => p.cardId === liPost!.cardId);
          if (idx >= 0) dayPosts[idx].content = limpo.content;
          await appendLog(runId, { agent: "Lucas LinkedIn", message: `Post de ${dayName} corrigido automaticamente ✓`, status: "running" });
          if (limpo.removidos) {
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `${limpo.removidos} bloco(s) de bastidor removido(s) do post de ${dayName} antes de gravar.`,
              status: "warning",
            });
          }
        }
        if (twFixed.status === "fulfilled" && twFixed.value) {
          twContentFinal = twFixed.value;
          const idx = dayPosts.findIndex(p => p.cardId === twPost!.cardId);
          if (idx >= 0) dayPosts[idx].content = twFixed.value;
          await appendLog(runId, { agent: "Tiago Twitter", message: `Thread de ${dayName} corrigida automaticamente ✓`, status: "running" });
        }
      }

      if (!approved) {
        await appendLog(runId, {
          agent: "Vera Veredito",
          message: needsTextRetry
            ? `Conteúdo de ${dayName} corrigido automaticamente. Veja o card da Vera para o veredito original.`
            : `Conteúdo de ${dayName} marcado para revisão. Veja o card da Vera para detalhes.`,
          status: needsTextRetry ? "running" : "warning",
        });
      }

      const hasMediaError = getMediaStatus().startsWith("FALHOU");
      // After auto-correction, mark as pending (reviewer approved the intent, writers fixed the issues)
      const cardStatus = (approved || needsTextRetry) ? "pending" : "needs_revision";
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
          needsTextRetry ? "✅ Correção automática aplicada com base no feedback da Vera.\n" : "",
          `LinkedIn:\n${liContentFinal ?? "—"}\n\nX (Twitter):\n${twContentFinal ?? "—"}\n\nVeredito da Vera:\n${firstOutput}`,
        ].filter(Boolean).join("\n"),
        ...(cardStatus === "needs_revision" ? { status: "needs_revision" } : {}),
      });

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
        // Ultima regua antes do banco: se depois da Vera e da reescrita ainda
        // sobrou numero sem fonte, a frase sai. O cliente ve o aviso no card.
        const lastroFinal = `${webSearchDataGlobal}\n${webSourcesGlobal.map((f) => `${f.title} ${f.url}`).join("\n")}\n${topic}`;
        const semLastroFinal = afirmacoesSemLastro(dp.content, lastroFinal);
        if (semLastroFinal.length) {
          dp.content = removerFrases(dp.content, semLastroFinal);
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `${dp.platform}: ${semLastroFinal.length} frase(s) removida(s) antes de gravar por número sem fonte: ${semLastroFinal.map((f) => f.slice(0, 90)).join(" | ")}`,
            status: "warning",
          });
        }
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
   } catch (erroDoDia) {
     // Segue para o proximo dia. O que falhou fica escrito no log da execucao,
     // que e onde o cliente ve o que aconteceu com a semana dele.
     const motivo = erroDoDia instanceof Error ? erroDoDia.message : String(erroDoDia);
     console.error(`[pipeline] run ${runId} dia ${dayOfWeek} falhou:`, erroDoDia);
     await appendLog(runId, {
       agent: "Sistema",
       message: `O dia ${DAY_NAMES[dayOfWeek] ?? dayOfWeek} não pôde ser gerado (${motivo.slice(0, 160)}).`,
       status: "warning",
     });
     // O erro SOBE, e isso mudou em 10/09. Enquanto a semana rodava numa
     // função só, engolir o erro aqui era a única forma de o dia seguinte
     // acontecer. Agora quem garante isso é a fila, que trata cada dia como um
     // trabalho: engolir aqui faria o trabalho terminar dizendo que deu certo,
     // e o dia nunca seria tentado de novo.
     throw erroDoDia;
   }
  }

  // Aqui o dia acabou. Quem cobra e quem marca a campanha como concluida e a
  // fila, em fecharCampanha, quando o ultimo trabalho do grupo termina: a
  // cobranca e por campanha, e nenhum dia sozinho sabe se foi o ultimo.
}
