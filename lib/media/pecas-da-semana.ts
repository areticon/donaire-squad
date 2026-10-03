import { fichaDoAgente } from "@/lib/squad/definicoes-dos-agentes";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { generateImage } from "@/lib/media/nano-banana";
import { direcaoDaPeca, escolherEstilo, paletaDoProjeto } from "@/lib/media/direcao-de-arte";
import { generateInfographic } from "@/lib/media/infographic";
import { cenaDaFrase, layoutDaPeca, marcaDaArte, pecaComFraseEmCodigo } from "@/lib/media/arte-com-frase";
import { conferirArte } from "@/lib/media/conferencia-da-arte";
import type { FormatoDaRede } from "@/lib/media/formatos-das-redes";
import { formatoDaPeca, gruposDeFormato } from "@/lib/media/formatos-das-redes";
import { FORMATO_DA_REDE } from "@/lib/pipeline/levar-para-outra-rede";
import { mencoesDeOutraRede, NOME_DA_REDE } from "@/lib/pipeline/redes";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { ajustarParaFormato } from "@/lib/media/margem-de-seguranca";
import { limparMarcadores, montarPrefixoCacheavel, textoDaRede } from "@/lib/media/write-posts";
import { AberturasDaSemana, aberturaDe } from "@/lib/media/aberturas-da-semana";
import { escreverLegendaDoCarrossel } from "@/lib/media/carrossel-do-video";
import { textoDoRadar, type Radar } from "@/lib/media/radar-do-video";
import {
  dataDoDia,
  diasDaSemana,
  planoDoRun,
  ROTULO_DO_FORMATO,
  type FormatoDoDia,
  type FormatoEscrito,
  type RedeDoPlano,
} from "@/lib/media/semana-do-video";
import type { Prisma } from "@prisma/client";

/**
 * Os redatores escrevem a semana que o cliente escolheu, a partir do vídeo.
 *
 * Cada dia com formato vira UM post por rede marcada (desde 30/09; o redator
 * escreve para a rede principal e as outras recebem a adaptação) e os cards
 * de quem trabalhou nele: Lucas
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
  tiago: { agentId: "xavier-x", agentName: "Xavier X", cardType: "post_twitter" },
  diana: { agentId: "diana-design", agentName: "Diana Design", cardType: "media" },
} as const;

type Agente = { name: string; role: string; persona: string | null; style: string | null };

/** A ficha central como agente, para quem ainda não tem linha no projeto (ver definicoes-dos-agentes). */
function fichaComoAgente(agentId: string): Agente | undefined {
  const f = fichaDoAgente(agentId);
  return f ? { name: f.name, role: f.role, persona: f.persona, style: f.style } : undefined;
}

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
            where: { agentId: { in: ["lucas-linkedin", "xavier-x", "tiago-twitter", "diana-design"] } },
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

export const REGRAS_DE_TEXTO = `REGRAS:
- Português brasileiro natural, na voz da marca, falando com esse público.
- Nada de markdown (sem #, sem **), texto limpo com parágrafos separados por linha em branco.
- Nenhum dado, estudo, nome ou citação que não esteja na transcrição ou no briefing do Roberto. Se usar um dado do briefing, cite a fonte como está lá.
- Sem travessão: use vírgula, dois-pontos ou parênteses.
- Sem clichê motivacional, no máximo 2 emojis, no máximo 3 hashtags e só no fim.`;

export function separarTweets(texto: string): string[] {
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
  const linhas = limparMarcadores(texto).split("\n").map((l) => l.trim());
  const pega = (prefixo: string) => linhas.find((l) => l.startsWith(prefixo))?.replace(prefixo, "").trim() ?? "";
  const intro = pega("TEXTO_INTRO:");
  const question = pega("PERGUNTA:").slice(0, 150);
  const options = [pega("OPCAO_1:"), pega("OPCAO_2:"), pega("OPCAO_3:"), pega("OPCAO_4:")]
    .filter(Boolean)
    .map((o) => o.slice(0, 30));
  return { type: "poll", intro, question, options, duration: "THREE_DAYS" };
}

/**
 * O bloco que TODO redator recebe, idêntico em todas as chamadas deste
 * vídeo, e por isso cacheável: perfil do projeto, briefing do Roberto e a
 * transcrição. É a promessa do desenho: "nada além disto entra nos textos".
 * Sem o formato das três redes: cada redator aqui devolve UM texto, e o
 * "===LINKEDIN===" do prefixo vazava para dentro da peça (sexta, 29/09).
 */
function prefixoDoVideo(video: VideoParaEscrever): string {
  const radar = video.radar as unknown as Radar | null;
  const transcript = video.transcript as { text?: string } | null;
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
  return (
    montarPrefixoCacheavel({ nicho: video.project.niche, publico: video.project.targetAudience, voz: video.project.voice }, { tresRedes: false }) +
    `\n\nBRIEFING DO ROBERTO RADAR (pesquisa feita a partir deste vídeo):\n${radar ? textoDoRadar(radar) : "(o Roberto ainda não pesquisou; escreva só com a transcrição, sem nenhum dado externo)"}` +
    `\n\nTRANSCRIÇÃO DO VÍDEO "${nome}":\n${(transcript?.text ?? "").slice(0, 40000)}`
  );
}

/** O que cada dia vai tratar, para que nenhum redator puxe o ângulo do outro. */
function planoDaSemana(dias: Array<{ dia: number; formato: FormatoDoDia; redes?: string[] }>, radar: Radar | null): string {
  return dias
    .map(({ dia: d, formato: f, redes }) => {
      const a = radar?.angulos.find((x) => x.dia === d)?.texto;
      const onde = redes?.length ? `, ${redes.map((r) => NOME_DA_REDE[r] ?? r).join(" e ")}` : "";
      return `- ${DIAS[d]} (${ROTULO_DO_FORMATO[f]}${onde}): ${a ?? "tese própria do dia"}`;
    })
    .join("\n");
}

/**
 * A tese de um dia. A conta era `(dia - 2) % n`, feita quando segunda era só
 * do vídeo; com a segunda virando dia de post (30/09), `dia - 2` dá -1, e o
 * resto negativo em JavaScript não é índice: a segunda saía sem tese.
 */
function teseDoDia(radar: Radar | null, dia: number) {
  const n = radar?.teses.length ?? 0;
  return radar && n ? radar.teses[(((dia - 2) % n) + n) % n] : undefined;
}

/** O pedido do dia: formato, ângulo e tese, mais a semana inteira para o redator não invadir outro dia. */
function contextoDoDia(dia: number, formato: FormatoDoDia, radar: Radar | null, plano: string): string {
  const angulo = radar?.angulos.find((a) => a.dia === dia)?.texto ?? "";
  const tese = teseDoDia(radar, dia);
  return (
    `DIA: ${DIAS[dia]}\nFORMATO ESCOLHIDO PELO CLIENTE: ${ROTULO_DO_FORMATO[formato]}\nÂNGULO DO DIA (do Roberto): ${angulo || "use a tese abaixo"}\nTESE PRINCIPAL DO DIA: ${tese ? `[${tese.minuto}] ${tese.frase}` : "escolha a tese mais forte do vídeo para este dia"}` +
    `\n\nA SEMANA INTEIRA (cada dia é uma peça diferente, com gancho próprio; escreva só o de ${DIAS[dia]} e não puxe o ângulo dos outros):\n${plano}` +
    `\nA frase de abertura do vídeo já é o gancho dos cortes: não abra com ela nem com paráfrase dela.`
  );
}

/** As aberturas que a semana já tem: títulos dos cortes do vídeo e as peças escritas (menos a descrição da arte da Diana). */
function aberturasJaUsadas(
  video: VideoParaEscrever,
  cards: Array<{ agentId: string; dayOfWeek: number; postId: string | null; metadata: unknown; content: string | null }>,
  exceto: number[] = []
): Array<{ dia: string; abertura: string }> {
  const titulosDosCortes = ((video.clips as unknown as Array<{ titulo?: string }> | null) ?? [])
    .map((t) => t?.titulo?.trim() ?? "")
    .filter(Boolean);
  return [
    ...titulosDosCortes.map((t) => ({ dia: "corte do vídeo", abertura: t })),
    ...cards
      .filter(
        (c) =>
          c.postId &&
          !exceto.includes(c.dayOfWeek) &&
          (c.metadata as { derivado?: boolean } | null)?.derivado &&
          c.agentId !== AGENTES.diana.agentId
      )
      .map((c) => ({ dia: DIAS[c.dayOfWeek] ?? "outro dia", abertura: aberturaDe(c.content ?? "") })),
  ];
}

async function escreverEnquete(
  lucas: Agente | undefined,
  prefixo: string,
  contexto: string,
  rede: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
) {
  const bruto = await askClaude(
    personaDe(lucas, "Você é Lucas LinkedIn, redator de posts para LinkedIn."),
    `${contexto}

Escreva uma ENQUETE para ${rede === "linkedin" ? "o LinkedIn" : rede} a partir do ângulo do dia, no formato EXATO abaixo (uma linha por campo, sem nada além disso):

TEXTO_INTRO: [até 600 caracteres apresentando o dilema, na voz da marca, sem dar a resposta]
PERGUNTA: [até 140 caracteres]
OPCAO_1: [até 28 caracteres]
OPCAO_2: [até 28 caracteres]
OPCAO_3: [até 28 caracteres]
OPCAO_4: [até 28 caracteres, opcional]

${REGRAS_DE_TEXTO}`,
    { maxTokens: 4000, cachedPrefix: prefixo, usage }
  );
  return lerEnquete(bruto);
}

const textoDaEnquete = (e: ReturnType<typeof lerEnquete>) =>
  `${e.intro}\n\n${e.question}\n${e.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`.trim();

/**
 * Reescreve SÓ O TEXTO de dias já escritos que repetem a abertura de outro
 * dia, sem refazer arte (29/09: terça, quinta e domingo abriram com a mesma
 * frase). Vale para os formatos só de texto (texto, thread, enquete); os
 * dias pedidos são escritos um depois do outro, e cada um já conhece as
 * aberturas de todos os outros. Atualiza o post e o card do redator no lugar.
 */
export async function reescreverAberturasRepetidas(
  videoJobId: string,
  diasPedidos: number[]
): Promise<Array<{ dia: number; antes: string; depois: string }>> {
  const video = await carregarVideo(videoJobId);
  if (!video) return [];
  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, config: true },
  });
  if (!run) return [];
  const dias = diasDaSemana(planoDoRun(run.config, video.project.videoSemana));
  const radar = video.radar as unknown as Radar | null;
  const prefixo = prefixoDoVideo(video);
  const plano = planoDaSemana(dias, radar);
  const lucas = video.project.agents.find((a) => a.agentId === "lucas-linkedin");
  const tiago = video.project.agents.find((a) => a.agentId === "xavier-x") ?? fichaComoAgente("xavier-x");
  const cards = await prisma.campaignCard.findMany({
    where: { runId: run.id, metadata: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, agentId: true, dayOfWeek: true, postId: true, metadata: true, content: true },
  });
  const aberturas = new AberturasDaSemana(aberturasJaUsadas(video, cards, diasPedidos));
  const usage = (agentId: string) => ({ operation: "agent", runId: run.id, agentId, projectId: video.projectId });

  const feitos: Array<{ dia: number; antes: string; depois: string }> = [];
  for (const dia of diasPedidos) {
    const formato = dias.find((d) => d.dia === dia)?.formato;
    const card = cards.find(
      (c) => c.dayOfWeek === dia && c.postId && (c.metadata as { derivado?: boolean } | null)?.derivado && c.agentId !== AGENTES.diana.agentId
    );
    if (!formato || !card?.postId) continue;
    const contexto = contextoDoDia(dia, formato, radar, plano);
    const antes = aberturaDe(card.content ?? "");
    if (formato === "thread") {
      const texto = await aberturas.escrever(DIAS[dia], (p) => escreverThread(tiago, prefixo, contexto + p, usage(AGENTES.tiago.agentId)), (t) => t);
      await prisma.post.update({ where: { id: card.postId }, data: { content: texto } });
      const meta = { ...((card.metadata as Record<string, unknown> | null) ?? {}), tweets: separarTweets(texto).length };
      await prisma.campaignCard.update({ where: { id: card.id }, data: { content: texto, metadata: meta as Prisma.InputJsonValue } });
      feitos.push({ dia, antes, depois: aberturaDe(texto) });
    } else if (formato === "poll") {
      const post = await prisma.post.findUnique({ where: { id: card.postId }, select: { platform: true, metadata: true } });
      const enquete = await aberturas.escrever(DIAS[dia], (p) => escreverEnquete(lucas, prefixo, contexto + p, post?.platform ?? "linkedin", usage(AGENTES.lucas.agentId)), (e) => e.intro);
      const legivel = textoDaEnquete(enquete);
      await prisma.post.update({
        where: { id: card.postId },
        data: { content: legivel, metadata: { ...((post?.metadata as Record<string, unknown> | null) ?? {}), ...enquete } as Prisma.InputJsonValue },
      });
      await prisma.campaignCard.update({
        where: { id: card.id },
        data: { content: legivel, metadata: { ...((card.metadata as Record<string, unknown> | null) ?? {}), ...enquete } as Prisma.InputJsonValue },
      });
      feitos.push({ dia, antes, depois: aberturaDe(enquete.intro) });
    } else if (formato === "text") {
      const post = await prisma.post.findUnique({ where: { id: card.postId }, select: { platform: true } });
      const texto = await aberturas.escrever(
        DIAS[dia],
        (p) => escreverTexto(lucas, prefixo, contexto + p, post?.platform ?? "linkedin", usage(AGENTES.lucas.agentId)),
        (t) => t,
        { ajustar: (t, tirar) => tirar(t) }
      );
      await prisma.post.update({ where: { id: card.postId }, data: { content: texto } });
      await prisma.campaignCard.update({ where: { id: card.id }, data: { content: texto } });
      feitos.push({ dia, antes, depois: aberturaDe(texto) });
    }
  }
  return feitos;
}

/**
 * A REDE PRINCIPAL de cada formato (30/09): é para ela que o redator escreve,
 * e as outras redes marcadas no dia recebem a adaptação desse texto. Imagem e
 * carrossel começam no Instagram, onde a peça visual vive; texto e
 * infográfico no LinkedIn. O X só é principal quando é a única rede do dia.
 */
const PRINCIPAL: Record<FormatoEscrito, RedeDoPlano[]> = {
  text: ["linkedin", "facebook", "twitter"],
  poll: ["linkedin"],
  thread: ["twitter"],
  image: ["instagram", "linkedin", "facebook", "twitter"],
  carousel: ["instagram", "linkedin", "facebook"],
  infographic: ["linkedin", "instagram", "facebook", "twitter"],
};

export function principalDoDia(formato: FormatoEscrito, redes: RedeDoPlano[]): RedeDoPlano {
  return PRINCIPAL[formato].find((r) => redes.includes(r)) ?? redes[0] ?? PRINCIPAL[formato][0];
}

/**
 * As peças de um dia, rede por rede, SEM IA e sem banco: qual rede recebe o
 * texto do redator, quais recebem a adaptação e em que tamanho sai a arte de
 * cada uma. Separado da escrita para o teste provar o plano em memória
 * (scripts/tmp/prova-semana-do-video-3009.mts).
 */
export function pecasDoDia(formato: FormatoEscrito, redes: RedeDoPlano[]) {
  const principal = principalDoDia(formato, redes);
  const outras = redes.filter((r) => r !== principal);
  const comArte = formato === "image" || formato === "infographic" || formato === "carousel";
  // Uma geração por PROPORÇÃO, e o recorte local para o pixel exato de cada
  // rede do grupo (formatos-das-redes.ts). A principal vai primeiro, para a
  // arte do grupo dela sair no tamanho dela.
  const grupos = comArte ? gruposDeFormato([principal, ...outras], formato) : [];
  return { principal, outras, grupos };
}

/**
 * O TEXTO DO DIA LEVADO PARA OUTRA REDE DO MESMO DIA (30/09).
 *
 * Com mais de uma rede marcada no dia, o redator escreve uma vez, para a
 * principal, e as outras recebem a adaptação pelo mesmo pedido do "levar
 * para outra rede" (lib/pipeline/levar-para-outra-rede.ts): tese, dados e
 * fontes intactos, formato e menções de rede trocados. Colar o mesmo texto
 * foi o defeito de 18/09 (o Facebook abrindo com uma frase sobre o
 * algoritmo do LinkedIn). É uma chamada de texto por rede a mais, sem
 * cobrança à parte, como o resto da redação da semana.
 */
async function adaptarParaRede(
  texto: string,
  de: string,
  para: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
): Promise<{ content: string; tweets: number }> {
  const formato = FORMATO_DA_REDE[para];
  if (!formato) throw new Error(`sem formato de texto para ${para}`);
  const nome = NOME_DA_REDE[para] ?? para;
  const mencoes = mencoesDeOutraRede(texto, para);
  const aviso = mencoes.length
    ? `\nATENÇÃO: estas frases do post original falam de outra rede, e você está escrevendo para o ${nome}:\n${mencoes.map((m) => `   . ${m.frase}`).join("\n")}\n   Reescreva cada uma. Quando a rede citada for só o cenário da frase, troque pela rede nova ou por uma forma neutra. Quando ela fizer parte de um FATO da pesquisa, mantenha.\n`
    : "";
  const bruto = await askClaude(
    "Você é Lucas, redator do squad. Adapta peças entre redes sem inventar nada. Nunca use travessão: use vírgula, dois-pontos ou parênteses.",
    `Adapte o post abaixo para o ${nome}, mantendo a tese, os dados e as fontes exatamente como estão.
- ${formato.instrucao}
- Não acrescente fatos, números, fontes nem promessas que não estejam no post original.
- Não prometa mídia que o post não tem: nada de "vídeo nos comentários", "gravei", "link na bio".
- Devolva SÓ o texto adaptado, sem comentário e sem explicar o que mudou.
${aviso}
POST ORIGINAL (${NOME_DA_REDE[de] ?? de}):
${texto}`,
    { maxTokens: 4000, usage }
  );
  const limpo = pecaPublicavel(textoDaRede(bruto, para));
  if ("recusado" in limpo) throw new Error(`a adaptação para ${nome} não passou na guarda: ${limpo.recusado}`);
  if (para === "twitter") {
    // O mesmo corte duro da thread do Xavier: o X recusa tweet acima de 280.
    const tweets = separarTweets(limparMarcadores(limpo.texto)).map((t) =>
      t.length > MAX_TWEET ? t.slice(0, MAX_TWEET - 1).trimEnd() + "…" : t
    );
    return { content: tweets.join("\n\n"), tweets: tweets.length };
  }
  return { content: limpo.texto.slice(0, formato.teto), tweets: 0 };
}

export async function escreverSemanaDoVideo(videoJobId: string): Promise<{ escritos: number; falhas: number }> {
  const video = await carregarVideo(videoJobId);
  if (!video) return { escritos: 0, falhas: 0 };

  const run = await prisma.pipelineRun.findFirst({
    where: { projectId: video.projectId, archived: false, config: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, weekStart: true, config: true },
  });
  if (!run) return { escritos: 0, falhas: 0 };

  const semana = planoDoRun(run.config, video.project.videoSemana);
  const dias = diasDaSemana(semana);
  if (!dias.length) return { escritos: 0, falhas: 0 };

  const radar = video.radar as unknown as Radar | null;
  const nome = (video.originalName ?? "Gravação").replace(/\.[^.]+$/, "");
  const prefixo = prefixoDoVideo(video);

  const agentes = video.project.agents;
  const lucas = agentes.find((a) => a.agentId === "lucas-linkedin");
  // O X é do Xavier desde 29/09; a linha antiga do Tiago no X ainda vale como reserva.
  const tiago = agentes.find((a) => a.agentId === "xavier-x") ?? fichaComoAgente("xavier-x");
  const diana = agentes.find((a) => a.agentId === "diana-design");

  const cardsDoVideo = await prisma.campaignCard.findMany({
    where: { runId: run.id, metadata: { path: ["videoJobId"], equals: video.id } },
    select: { id: true, agentId: true, dayOfWeek: true, postId: true, metadata: true, content: true },
  });

  // As aberturas que a semana já tem antes de escrever: os títulos dos cortes
  // do mesmo vídeo (que saem na mesma semana) e os dias já escritos numa
  // rodada anterior. Cada dia novo é proibido de repetir qualquer uma delas.
  const aberturas = new AberturasDaSemana(aberturasJaUsadas(video, cardsDoVideo));
  const plano = planoDaSemana(dias, radar);

  // A DATA de cada dia sai do início congelado no run (30/09), e não mais da
  // segunda da semana: com a campanha começando na quarta, a terça é a da
  // semana seguinte. Run de antes de 30/09 não tem início e segue na segunda.
  const alvo = { inicio: semana.inicio, weekStart: run.weekStart };
  const contaDe = (rede: string) => video.project.socialAccounts.find((a) => a.platform === rede)?.id ?? null;
  let escritos = 0;
  let falhas = 0;

  // Os dias saem EM PARALELO: cada um é um redator diferente (ou o mesmo com
  // outro pedido), e nenhum depende do outro. Em série, a semana de 02/09
  // levou 1,8 min só de redação (14,9 aos 16,7); em paralelo é o tempo do dia
  // mais lento, e o prefixo cacheado (perfil, briefing, transcrição) é o
  // mesmo em todas as chamadas, então o custo não muda.
  await Promise.all(dias.map(async ({ dia, formato, escolhido, redes }) => {
    const derivadosDoDia = cardsDoVideo.filter(
      (c) => c.dayOfWeek === dia && (c.metadata as { derivado?: boolean } | null)?.derivado
    );
    // Dia já escrito: algum card derivado aponta para um post OU já tem texto
    // de verdade. Só o post não basta (30/09): quando o cliente APAGA o
    // rascunho, o card fica sem post, e a esteira reescrevia o dia (pago),
    // desfazendo a exclusão. Card de espera ("Lucas está escrevendo...") é o
    // único sinal de dia por escrever.
    const ESPERA = /^\S+ está (escrevendo|criando|montando)/;
    if (derivadosDoDia.some((c) => c.postId || (c.content && !ESPERA.test(c.content.trim())))) return;

    const data = dataDoDia(alvo, dia);
    const angulo = radar?.angulos.find((a) => a.dia === dia)?.texto ?? "";
    const tese = teseDoDia(radar, dia);
    // As redes do dia: a principal recebe o texto do redator, as outras a
    // adaptação, e a arte sai uma vez por proporção (ver `pecasDoDia`).
    const { principal, outras, grupos } = pecasDoDia(formato, redes);

    const usage = (agentId: string) => ({ operation: "agent", runId: run.id, agentId, projectId: video.projectId });
    // `formatoRotulo` é o que o cabeçalho do quadro mostra; sem ele o chip
    // do dia sumia assim que o card de espera virava peça (visto em 02/09).
    const metaBase = { origem: "video", videoJobId: video.id, derivado: true, formato: escolhido, formatoRotulo: ROTULO_DO_FORMATO[escolhido], dia, redes };

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

    /**
     * As OUTRAS redes do dia, em paralelo: a adaptação do texto principal e a
     * mídia da rede. Uma rede que falha não derruba o dia (a peça principal já
     * existe); fica no log, e o card do dia oferece pedir ao especialista.
     */
    const levarParaAsOutras = async (
      postPrincipal: string,
      texto: string,
      midia: (rede: RedeDoPlano) => { mediaType: string; imageUrl?: string | null; extra?: Record<string, unknown> }
    ) => {
      await Promise.all(
        outras.map(async (rede) => {
          try {
            const adaptado = await adaptarParaRede(texto, principal, rede, usage(AGENTES.lucas.agentId));
            const m = midia(rede);
            await criarPost({
              platform: rede,
              socialAccountId: contaDe(rede),
              content: adaptado.content,
              // Texto que virou thread no X sai como thread; com mídia, o
              // publicador do X põe a arte no primeiro tweet.
              mediaType: m.mediaType === "text" && adaptado.tweets > 1 ? "thread" : m.mediaType,
              imageUrl: m.imageUrl ?? null,
              extra: { ...(m.extra ?? {}), adaptadoDe: postPrincipal, rede },
            });
          } catch (e) {
            console.error(`[semana][${videoJobId}] ${DIAS[dia]}: adaptação para ${rede} falhou:`, e);
          }
        })
      );
    };

    /** A arte de cada rede: uma geração por proporção, o recorte local para as outras do grupo. */
    const artesPorRede = async (gerar: (formato: FormatoDaRede) => Promise<string>) => {
      const artes = new Map<string, string>();
      await Promise.all(
        grupos.map(async (g) => {
          const base = await gerar(g.redes[0].formato);
          artes.set(g.redes[0].platform, base);
          for (const r of g.redes.slice(1)) artes.set(r.platform, (await ajustarParaFormato(base, r.formato)).dataUri);
        })
      );
      return artes;
    };

    const contexto = contextoDoDia(dia, formato, radar, plano);
    // Cada peça passa pela fila de aberturas: se abrir igual a outro dia, é
    // escrita de novo sabendo quais ganchos estão tomados (ver aberturas-da-semana.ts).
    const semTopo = (t: string, tirar: (x: string) => string | null) => tirar(t);

    try {
      if (formato === "text" && principal === "twitter") {
        // Só o X marcado num dia de texto: o texto do dia é a thread do Xavier.
        const texto = await aberturas.escrever(
          DIAS[dia],
          (proibidas) => escreverThread(tiago, prefixo, contexto + proibidas, usage(AGENTES.tiago.agentId)),
          (t) => t
        );
        const postId = await criarPost({ platform: "twitter", socialAccountId: contaDe("twitter"), content: texto, mediaType: "thread" });
        await gravarCard(AGENTES.tiago, { content: texto, mediaType: "thread", postId, extra: { rede: "twitter", tweets: separarTweets(texto).length } });
      } else if (formato === "text") {
        const texto = await aberturas.escrever(
          DIAS[dia],
          (proibidas) => escreverTexto(lucas, prefixo, contexto + proibidas, principal, usage(AGENTES.lucas.agentId)),
          (t) => t,
          { ajustar: semTopo }
        );
        const postId = await criarPost({ platform: principal, socialAccountId: contaDe(principal), content: texto, mediaType: "text" });
        await gravarCard(AGENTES.lucas, { content: texto, mediaType: "text", postId, extra: { rede: principal } });
        await levarParaAsOutras(postId, texto, () => ({ mediaType: "text" }));
      } else if (formato === "poll") {
        const enquete = await aberturas.escrever(
          DIAS[dia],
          (proibidas) => escreverEnquete(lucas, prefixo, contexto + proibidas, principal, usage(AGENTES.lucas.agentId)),
          (e) => e.intro
        );
        const legivel = textoDaEnquete(enquete);
        const postId = await criarPost({ platform: principal, socialAccountId: contaDe(principal), content: legivel, mediaType: "poll", extra: enquete });
        await gravarCard(AGENTES.lucas, { content: legivel, mediaType: "poll", postId, extra: { rede: principal, ...enquete } });
      } else if (formato === "thread") {
        const texto = await aberturas.escrever(
          DIAS[dia],
          (proibidas) => escreverThread(tiago, prefixo, contexto + proibidas, usage(AGENTES.tiago.agentId)),
          (t) => t
        );
        const postId = await criarPost({ platform: "twitter", socialAccountId: contaDe("twitter"), content: texto, mediaType: "thread" });
        await gravarCard(AGENTES.tiago, { content: texto, mediaType: "thread", postId, extra: { rede: "twitter", tweets: separarTweets(texto).length } });
      } else if (formato === "image") {
        // NUNCA o nome do arquivo (30/09): sem tese para o dia, a arte de quarta
        // saiu com "2026-09-29 11-04-24" escrito em letras enormes. A reserva é
        // outra tese do vídeo, o tema ou o resumo; o nome só se não parecer
        // nome de arquivo (data, hora, extensão).
        const pareceArquivo = /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{2}|^(img|vid|mov|dsc|gravacao)[_-]?\d/i.test(nome);
        const radarDoDia = radar as { teses?: Array<{ frase?: string }>; resumo?: string } | null | undefined;
        const frase = fraseDaArte(
          tese?.frase ?? radarDoDia?.teses?.find((t) => t?.frase)?.frase ?? radar?.tema ?? radarDoDia?.resumo?.split(/(?<=[.!?])\s/)[0] ?? (pareceArquivo ? "O que ninguém te contou sobre isso" : nome)
        );
        const legenda = await aberturas.escrever(
          DIAS[dia],
          (proibidas) =>
            escreverTexto(lucas, prefixo, `${contexto}${proibidas}\n\nEsta legenda acompanha uma IMAGEM com a frase "${frase}" escrita nela. Não repita a frase literalmente na primeira linha; desenvolva a ideia.`, principal, usage(AGENTES.lucas.agentId)),
          (t) => t,
          { ajustar: semTopo }
        );
        // A direcao de arte do projeto (linguagem do video, estilo proprio),
        // igual a esteira; sem ela a imagem saia "bold typographic" fixo.
        const direcao = await direcaoDaPeca({ projectId: video.projectId, runId: run.id, dayOfWeek: dia, infografico: false, preferido: (run.config as { mediaStyle?: string } | null)?.mediaStyle });
        // A FRASE ENTRA EM CÓDIGO (30/09): o modelo desenha só a arte, sem
        // letra e sem gente, e a frase é composta por cima no tamanho da rede.
        // Ver lib/media/arte-com-frase.tsx para a quarta que originou a regra.
        const artes = await artesPorRede((f) => arteDoDia(video, frase, direcao.styleHint, f, { projectId: video.projectId, runId: run.id }));
        const url = artes.get(principal) ?? [...artes.values()][0];
        const postId = await criarPost({ platform: principal, socialAccountId: contaDe(principal), content: legenda, mediaType: "image", imageUrl: url, extra: { frase } });
        await gravarCard(AGENTES.lucas, { content: legenda, mediaType: "text", postId, extra: { rede: principal } });
        await gravarCard(AGENTES.diana, { content: `Imagem com a frase: "${frase}"`, mediaType: "image", mediaUrl: url, postId, extra: { rede: principal, frase } });
        await levarParaAsOutras(postId, legenda, (rede) => ({ mediaType: "image", imageUrl: artes.get(rede) ?? url, extra: { frase } }));
      } else if (formato === "carousel") {
        const contextoDaLegenda = [
          radar ? `Tema: ${radar.tema}. ${radar.resumo}` : "",
          ...(radar?.teses.map((t) => `[${t.minuto}] ${t.frase}`) ?? []),
          angulo ? `Ângulo do dia: ${angulo}` : "",
        ].filter(Boolean);
        // Frases e legenda saem juntas pela fila de aberturas, ANTES das
        // lâminas: se a legenda repetir o gancho de outro dia, reescrever as
        // duas custa centavos, e as imagens ainda não foram pagas.
        const { frases, legenda } = await aberturas.escrever(
          DIAS[dia],
          async (proibidas) => {
            const frases = await frasesDosSlides(diana, prefixo, contexto + proibidas, usage(AGENTES.diana.agentId));
            const legenda = await escreverLegendaDoCarrossel({
              frases,
              contexto: contextoDaLegenda,
              projeto: video.project,
              rede: principal,
              usage: { runId: run.id, projectId: video.projectId },
              proibicoes: proibidas,
            });
            return { frases, legenda: textoDaRede(legenda, principal) };
          },
          (p) => p.legenda,
          { ajustar: (p, tirar) => { const l = tirar(p.legenda); return l ? { ...p, legenda: l } : null; } }
        );
        // Os slides não dependem um do outro: três chamadas ao mesmo tempo.
        // Uma direcao so para as tres laminas: carrossel com cara diferente
        // por lamina parece tres posts colados.
        const direcao = await direcaoDaPeca({ projectId: video.projectId, runId: run.id, dayOfWeek: dia, infografico: false, preferido: (run.config as { mediaStyle?: string } | null)?.mediaStyle });
        // Cada lâmina: arte sem texto do modelo e a frase composta em código,
        // no formato do carrossel (1080x1350), como a imagem do dia. O
        // carrossel é 4:5 em todas as redes, então as lâminas servem a todas.
        const urls = await Promise.all(
          frases.map((frase) => arteDoDia(video, frase, direcao.styleHint, formatoDaPeca(principal, "carousel"), { projectId: video.projectId, runId: run.id }, frases[0]))
        );
        const postId = await criarPost({ platform: principal, socialAccountId: contaDe(principal), content: legenda, mediaType: "carousel", imageUrl: urls.join("|"), extra: { carrossel: true, slides: frases } });
        // A legenda também ganha o card do redator, como no dia de imagem.
        // Sem ele, o quadro não tinha de onde tirar o título da peça e o
        // sábado de 29/09 apareceu só como "Post" (a tela titula pelo redator).
        await gravarCard(AGENTES.lucas, { content: legenda, mediaType: "text", postId, extra: { rede: principal } });
        await gravarCard(AGENTES.diana, {
          content: `Carrossel de ${frases.length} lâminas:\n${frases.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
          mediaType: "carousel",
          mediaUrl: urls.join("|"),
          postId,
          extra: { rede: principal, slides: frases },
        });
        await levarParaAsOutras(postId, legenda, () => ({ mediaType: "carousel", imageUrl: urls.join("|"), extra: { carrossel: true, slides: frases } }));
      } else if (formato === "infographic") {
        const legenda = await aberturas.escrever(
          DIAS[dia],
          (proibidas) =>
            escreverTexto(lucas, prefixo, `${contexto}${proibidas}\n\nEsta legenda acompanha um INFOGRÁFICO com os dados do briefing (se o briefing não tem dado com fonte, o infográfico organiza as teses do vídeo). Cite no texto só o que está no briefing.`, principal, usage(AGENTES.lucas.agentId)),
          (t) => t,
          { ajustar: semTopo }
        );
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error("GEMINI_API_KEY não configurada para o infográfico");
        const fonte = [radar ? textoDoRadar(radar) : "", "\n\nTEXTO DO POST:\n", legenda].join("");
        // Direcao de arte por peca: `escritos` conta as pecas da semana, e e o
        // que faz o estilo alternar de uma para a outra dentro do mesmo video.
        const estilo = await escolherEstilo({
          projectId: video.projectId,
          runId: run.id,
          dayOfWeek: escritos,
          infografico: true,
          // O estilo que o cliente escolheu para o projeto de vídeo manda aqui
          // também, pela mesma razão da esteira (18/09).
          preferido: (run.config as { mediaStyle?: string } | null)?.mediaStyle,
        });
        const marca = await marcaDaArte(video.projectId);
        // O formato sai da tabela das redes desde 19/09, e desde 30/09 é um
        // infográfico por PROPORÇÃO das redes do dia (Instagram em retrato, o
        // resto em paisagem); o recorte final deixa cada um no tamanho exato.
        const artes = await artesPorRede(async (formatoDaRede) => {
          const bruta = await Promise.race([
            // `marca` decide o infográfico desde 30/09: ele é montado em código
            // com a família da linguagem e as cores do projeto (infographic.ts).
            generateInfographic(fonte, video.project.niche ?? "negocios", geminiKey, formatoDaRede.proporcao, { estilo: estilo.prompt, paleta: paletaDoProjeto(video.project.colorPalette), marca }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Infografico passou de 120s")), 120_000)),
          ]);
          return (await ajustarParaFormato(bruta, formatoDaRede)).dataUri;
        });
        const url = artes.get(principal) ?? [...artes.values()][0];
        const postId = await criarPost({ platform: principal, socialAccountId: contaDe(principal), content: legenda, mediaType: "infographic", imageUrl: url });
        await gravarCard(AGENTES.lucas, { content: legenda, mediaType: "text", postId, extra: { rede: principal } });
        await gravarCard(AGENTES.diana, { content: "Infográfico com os dados do briefing do Roberto.", mediaType: "infographic", mediaUrl: url, postId, extra: { rede: principal } });
        await levarParaAsOutras(postId, legenda, (rede) => ({ mediaType: "infographic", imageUrl: artes.get(rede) ?? url }));
      }
      escritos++;
    } catch (e) {
      falhas++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[semana][${videoJobId}] ${DIAS[dia]} (${formato}) falhou:`, e);
      // O card fica com o aviso, e não some: sumir é o que o Bruno leu como
      // "travou" no sábado de 02/09. Rodar de novo tenta outra vez.
      const dono = formato === "thread" || (formato === "text" && principal === "twitter") ? AGENTES.tiago : formato === "carousel" ? AGENTES.diana : AGENTES.lucas;
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
  // Marcador de seção nunca chega à peça, nem as versões das outras redes
  // quando o modelo devolve as três (a sexta de 29/09 saiu com "===LINKEDIN===").
  return textoDaRede(saida, rede).slice(0, MAX_LINKEDIN);
}

async function escreverThread(
  tiago: Agente | undefined,
  prefixo: string,
  contexto: string,
  usage: { operation: string; runId: string; agentId: string; projectId: string }
): Promise<string> {
  const sistema = personaDe(tiago, "Você é Xavier X, especialista em threads para o X.");
  const pedido = `${contexto}

Escreva uma THREAD para o X (Twitter) deste dia a partir do vídeo e do briefing.
- Entre 5 e 8 tweets, numerados como 1/ 2/ 3/ (o número conta nos caracteres), um por parágrafo.
- Cada tweet com NO MÁXIMO 270 caracteres. Conte antes de fechar.
- O primeiro tweet é o gancho e precisa se sustentar sozinho. O último fecha com uma pergunta ou chamada.
- Se o ângulo pede um achado ou dado do briefing, use com a fonte. Se não há, não invente.
- Devolva SÓ a thread.

${REGRAS_DE_TEXTO}`;
  let texto = textoDaRede(await askClaude(sistema, pedido, { maxTokens: 4000, cachedPrefix: prefixo, usage }), "twitter");

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
  return separarTweets(limparMarcadores(texto))
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

/**
 * A frase que vai ESCRITA na imagem, fechada.
 *
 * Era `.slice(0, 140)` cru, e a quarta de 30/09 saiu com a arte terminando
 * em "a IA nunca precisa perguntar quem vo": a Vera reprovou o dia por texto
 * quebrado indo ao ar. Frase longa agora corta no fim da última frase
 * completa que cabe, ou na última palavra inteira, e nunca no meio dela.
 */
export function fraseDaArte(bruta: string, max = 140): string {
  const t = bruta.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fimDeFrase = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
  if (fimDeFrase > max * 0.4) return corte.slice(0, fimDeFrase + 1).trim();
  const virgula = corte.lastIndexOf(", ");
  if (virgula > max * 0.5) return corte.slice(0, virgula).trim() + ".";
  return corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:]$/, "").trim() + "…";
}

/**
 * A arte de uma peça da semana (imagem do dia ou lâmina), com a regra de
 * 30/09: o modelo de imagem desenha SÓ a cena, sem letra, número nem pessoa,
 * e a frase entra composta em código, nas cores e na família da linguagem do
 * projeto, já no pixel exato da rede. Exportada para o script que refaz as
 * artes do teste usar exatamente o mesmo caminho.
 */
export async function arteDoDia(
  video: { projectId: string; project: { niche?: string | null } },
  frase: string,
  estilo: string,
  formato: FormatoDaRede,
  ctx: { projectId: string; runId: string },
  /**
   * A frase que decide o layout (01/10). O carrossel passa a da primeira
   * lâmina para todas: o layout varia de peça para peça, mas lâminas do mesmo
   * carrossel com layouts diferentes parecem posts colados.
   */
  layoutDe?: string
): Promise<string> {
  const base = await marcaDaArte(video.projectId);
  const marca = layoutDe ? { ...base, variante: layoutDaPeca(base, layoutDe).variante } : base;
  // A cena nasce do mundo, do público e do tom do projeto (01/10), e não só do nicho.
  const visual = await cenaDaFrase(frase, video.project.niche, ctx, base.identidade);
  const desenhar = (correcao?: string) =>
    pecaComFraseEmCodigo({
      frase,
      marca,
      largura: formato.largura,
      altura: formato.altura,
      visual: correcao ? `${visual}\n${correcao}` : visual,
      estilo,
      desenhista: (prompt, proporcao) => generateImage(prompt, proporcao, "hd", { ...ctx, operation: "campanha_imagem" }),
    });
  // A conferência olha a peça pronta: só a frase pode estar escrita, e
  // ninguém pode aparecer. Reprovada, sai de novo UMA vez com o motivo.
  let peca = await desenhar();
  const veredito = await conferirArte(peca, { formato, textoEsperado: [frase], usarRegua: false, projectId: ctx.projectId, runId: ctx.runId });
  if (!veredito.aprovada) {
    console.warn(`[semana] arte reprovada, refazendo uma vez: ${veredito.motivo}`);
    peca = await desenhar(`PREVIOUS ATTEMPT WAS REJECTED: ${veredito.motivo}. Remove every letter, number and person from the scene.`);
  }
  return peca;
}

/**
 * O prompt da imagem e das laminas. `direcao` (30/09, item 10) e o styleHint
 * de direcaoDaPeca: linguagem do video do catalogo, estilo proprio e cores da
 * marca por nome. Sem ela vale o texto antigo, que so tinha a paleta em hex
 * e por isso o modelo chegava a escrever o codigo da cor na arte.
 * Exportado para o script que refaz as artes da semana usar o mesmo prompt.
 */
export function promptDaImagem(video: { project: { colorPalette?: string | null; niche?: string | null } }, frase: string, direcao?: string): string {
  if (direcao) {
    return (
      `Social media graphic in Brazilian Portuguese, one short sentence as the hero text, generous margins, niche: ${video.project.niche ?? "business"}. ` +
      `${direcao} No watermark, no logo, no extra readable text besides the sentence. ` +
      `The text on the image must read exactly: "${frase}"`
    );
  }
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
