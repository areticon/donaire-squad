import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { vereditoPedeCorrecao, VALIDADE_DA_CORRECAO_MIN, type CorrecaoDaVera } from "@/lib/squad/estado-da-correcao";
import { parecerDaAprovacao, parecerDaConferencia, veraAprovaPeloJev, veraConfereCorrecaoPeloJev, veraPeloJevLigada, veraPrimeiraPeloJevLigada } from "@/lib/squad/vera-pelo-jev";

/**
 * A Vera revisa os dias de vídeo.
 *
 * Na campanha de texto a Vera roda uma revisão de verdade (tom, qualidade,
 * dados, funil, mídia) e devolve um veredito. Nos dias de vídeo, até 02/09,
 * o card dela nascia com um texto fixo de "prévia do dia" e ela nunca era
 * chamada. O Bruno: "a Vera não está fazendo o trabalho dela, que é analisar
 * o conteúdo e aprovar ou não, recomendar melhorias baseado no nicho, perfil".
 *
 * Aqui ela recebe TODOS os posts do dia (cortes, gravação completa, posts de
 * texto derivados, carrossel), com o nicho, o público e a voz do projeto, e
 * escreve um veredito por dia. O veredito vira o conteúdo do card dela, e a
 * primeira linha é o que aparece no quadro.
 *
 * Desde 29/09 a reprovação não vai mais para o cliente: o dia reprovado volta
 * ao squad (lib/media/correcao-do-dia-do-video.ts), que refaz e pede nova
 * revisão, até 2 vezes. Ver lib/squad/estado-da-correcao.ts.
 */

export const VEREDITOS = ["APROVADO", "APROVADO_COM_RESSALVAS", "REPROVADO"] as const;
export type Veredito = (typeof VEREDITOS)[number];

export const ROTULO_DO_VEREDITO: Record<Veredito, string> = {
  APROVADO: "Aprovado",
  APROVADO_COM_RESSALVAS: "Aprovado com ressalvas",
  REPROVADO: "Reprovado",
};

const NOME_DA_REDE: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
};

const DIAS = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export function extrairVeredito(texto: string): Veredito {
  const m = texto.match(/VEREDITO:\s*(APROVADO_COM_RESSALVAS|APROVADO|REPROVADO)/i);
  if (m) return m[1].toUpperCase() as Veredito;
  if (/reprovad/i.test(texto)) return "REPROVADO";
  if (/ressalva/i.test(texto)) return "APROVADO_COM_RESSALVAS";
  return "APROVADO";
}

async function carregarVideoDaVera(videoJobId: string) {
  return prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      projectId: true,
      clips: true,
      radar: true,
      project: {
        select: {
          id: true,
          name: true,
          niche: true,
          targetAudience: true,
          voice: true,
          agents: { where: { agentId: "vera-veredito", isActive: true }, take: 1 },
        },
      },
    },
  });
}
type VideoDaVera = NonNullable<Awaited<ReturnType<typeof carregarVideoDaVera>>>;

type CardDaVera = { id: string; dayOfWeek: number; scheduledDate: Date | null; metadata: unknown; runId: string };

/** Os posts do MESMO dia do card (dia UTC, como a rota by-day faz), na ordem em que a Vera os numera. */
export async function postsDoDiaDaVera(projectId: string, scheduledDate: Date) {
  const inicio = new Date(scheduledDate);
  inicio.setUTCHours(0, 0, 0, 0);
  const fim = new Date(inicio.getTime() + 86400000);
  return prisma.post.findMany({
    where: {
      projectId,
      scheduledAt: { gte: inicio, lt: fim },
      status: { notIn: ["failed"] },
    },
    select: { id: true, platform: true, content: true, mediaType: true, imageUrl: true, metadata: true, createdAt: true },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
}

export type RevisaoDoDia = {
  veredito: Veredito;
  /** A resposta inteira dela, com a linha do VEREDITO. */
  saida: string;
  /** O parecer sem a linha do VEREDITO, que é o que vai para o card. */
  corpo: string;
  /** Os posts na ordem em que ela os numerou ("Post 1" é o primeiro). */
  postIds: string[];
};

/**
 * Uma revisão de UM dia, sem gravar nada. Quem chama decide o que fazer com
 * ela: a primeira revisão grava no card; a revisão depois de uma correção
 * entra no laço da correção.
 *
 * `parecerAnterior` liga o modo SEGUNDA REVISÃO: a Vera recebe o que ela
 * mesma pediu e confere se foi feito, em vez de começar do zero e achar
 * gosto novo para reprovar a cada volta (o laço nunca fecharia).
 */
async function revisarUmDia(
  video: VideoDaVera,
  card: CardDaVera,
  opcoes: { parecerAnterior?: string; tentativa?: number } = {}
): Promise<RevisaoDoDia | null> {
  if (!card.scheduledDate) return null;
  const vera = video.project.agents[0];

  // As frases dos slides do carrossel, para a Vera saber que os slides são
  // IMAGENS já prontas e o texto do post é a legenda. Sem isso ela pediu, na
  // primeira revisão de 02/09, para "estruturar o texto em slide 1, 2, 3".
  type TrechoComTexto = { texto?: { fraseDaCapa?: string } };
  const frasesDosSlides = ((video.clips as unknown as TrechoComTexto[]) ?? [])
    .map((t) => t.texto?.fraseDaCapa?.trim())
    .filter((f): f is string => Boolean(f))
    .slice(0, 5);

  const posts = await postsDoDiaDaVera(video.projectId, card.scheduledDate);
  if (posts.length === 0) return null;

  const dia = DIAS[card.dayOfWeek] ?? "o dia";
  const lista = posts
    .map((p, i) => {
      const pm = (p.metadata as Record<string, unknown> | null) ?? {};
      const tipo =
        p.mediaType === "video"
          ? pm.gravacaoCompleta
            ? "vídeo completo"
            : "corte de vídeo"
          : p.mediaType === "carousel"
            ? `carrossel de ${(p.imageUrl ?? "").split("|").filter(Boolean).length} slides`
            : p.mediaType === "image"
              ? "imagem com legenda"
              : p.mediaType === "infographic"
                ? "infográfico com legenda"
                : p.mediaType === "thread"
                  ? "thread"
                  : p.mediaType === "poll"
                    ? "enquete"
                    : "post de texto";
      // As frases dos slides vêm do post desde a parte 90 (a Diana escolhe
      // a partir das teses do Roberto); o carrossel antigo, das capas dos
      // cortes, continua lendo dos cortes.
      const frasesDestePost = Array.isArray(pm.slides)
        ? (pm.slides as unknown[]).filter((f): f is string => typeof f === "string")
        : frasesDosSlides;
      const slides =
        p.mediaType === "carousel" && frasesDestePost.length > 0
          ? `\nSLIDES (imagens já prontas, cada uma com esta frase escrita): ` +
            frasesDestePost.map((f, k) => `${k + 1}. "${f}"`).join(" ") +
            `\nLEGENDA:`
          : p.mediaType === "image" && typeof pm.frase === "string"
            ? `\nIMAGEM (já pronta, com esta frase escrita): "${pm.frase}"\nLEGENDA:`
            : "";
      return `POST ${i + 1} (${NOME_DA_REDE[p.platform] ?? p.platform}, ${tipo}):${slides}\n${p.content}`;
    })
    .join("\n\n---\n\n");

  // A Vera não sabe que dia é hoje: em 02/09/2026 reprovou um post por
  // citar um congresso de "2026" como "data futura". A data e os dados
  // que o Roberto pesquisou (com fonte) entram no prompt por isso.
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const radar = video.radar as { dados?: Array<{ valor?: string; oQueMede?: string; fonte?: string }>; achados?: Array<{ titulo?: string; fonte?: string; data?: string }> } | null;
  const dadosDoRoberto =
    [
      ...(radar?.dados ?? []).map((d) => `- ${d.valor}: ${d.oQueMede} (${d.fonte})`),
      ...(radar?.achados ?? []).map((a) => `- ${a.titulo} (${a.fonte}${a.data ? `, ${a.data}` : ""})`),
    ].join("\n") || "(o Roberto não pesquisou este vídeo)";

  // A VERA DECIDE PELO JEV (03/10, lib/squad/vera-pelo-jev.ts). Na segunda
  // revisão ela só confere o que pediu: o JEV responde pedido a pedido e, tudo
  // atendido com folga, ela aprova sem o Claude (não há motivo a escrever). A
  // primeira revisão pelo JEV existe e fica desligada por padrão (a medição
  // está no arquivo). Qualquer dúvida ou falha segue para o Claude, como antes.
  const pecasDaVera = posts.map((p, i) => ({ id: `post${i + 1}`, rede: p.platform, tipo: p.mediaType ?? "texto", texto: p.content ?? "" }));
  try {
    const jev = opcoes.parecerAnterior
      ? veraPeloJevLigada()
        ? await veraConfereCorrecaoPeloJev({ projectId: video.projectId, parecerAnterior: opcoes.parecerAnterior, pecas: pecasDaVera })
        : null
      : veraPrimeiraPeloJevLigada()
        ? await veraAprovaPeloJev({
            projectId: video.projectId,
            projeto: { nome: video.project.name, nicho: video.project.niche, publico: video.project.targetAudience, voz: video.project.voice },
            pecas: pecasDaVera,
            dadosPesquisados: dadosDoRoberto,
          })
        : null;
    if (jev?.decisao === "aprova") {
      const saidaDoJev =
        "itens" in jev && Array.isArray(jev.itens) ? parecerDaConferencia(jev.itens as string[]) : parecerDaAprovacao(pecasDaVera);
      return { veredito: "APROVADO", saida: saidaDoJev, corpo: saidaDoJev.replace(/\n?VEREDITO:.*$/i, "").trim(), postIds: posts.map((p) => p.id) };
    }
  } catch (e) {
    console.error(`[vera][${video.id}] JEV falhou, segue o Claude:`, e instanceof Error ? e.message : e);
  }

  const system = vera
    ? `Você é ${vera.name}, ${vera.role}.\nPersona: ${vera.persona ?? ""}\nEstilo: ${vera.style ?? ""}`
    : "Você é Vera Veredito, revisora de qualidade de conteúdo para redes sociais.";

  // A SEGUNDA REVISÃO confere o pedido, e não inventa pedido novo. Sem isto
  // a Vera acha outra coisa de gosto a cada volta e o laço de 2 tentativas
  // termina sempre no cliente, que é justamente o que a regra quer evitar.
  const segunda = opcoes.parecerAnterior
    ? `⟳ REVISÃO DEPOIS DA CORREÇÃO ${opcoes.tentativa ?? 1} DO SQUAD. Você reprovou este dia e cada peça voltou ao agente dono com o seu parecer. Abaixo está o que você pediu; confira se foi resolvido.
- O que foi resolvido não volta como problema.
- Só REPROVE de novo se sobrou algo que NÃO PODE ir ao ar (dado sem fonte, texto quebrado, marcador vazado, conteúdo fora do nicho do projeto, erro de fato). Gosto, ritmo e escolha de palavra são APROVADO_COM_RESSALVAS.
- Não peça de novo o que já foi feito de outro jeito razoável.

O SEU PARECER ANTERIOR:
${opcoes.parecerAnterior.slice(0, 5000)}

`
    : "";

  const tarefa = `${segunda}Faça a revisão de qualidade COMPLETA e CRÍTICA do conteúdo de ${dia}. São os posts que saíram de um vídeo gravado pelo cliente; o texto de cada um é o título e a descrição ou a legenda que vai para a rede.

HOJE É ${hoje}. Fonte com este ano ou com o ano passado é fonte recente, não é "data futura".

PROJETO: ${video.project.name}
NICHO: ${video.project.niche ?? "não informado"}
PÚBLICO: ${video.project.targetAudience ?? "não informado"}
VOZ DA MARCA: ${video.project.voice ?? "não informada"}

CONTEÚDO PARA REVISAR:

${lista}

CRITÉRIOS, reprove se algum falhar de forma grave:
1. NICHO E PÚBLICO: o conteúdo fala com esse público, nesse nicho, ou é genérico?
2. TOM DE VOZ: está alinhado à voz da marca? Em português brasileiro natural?
3. QUALIDADE DO TEXTO: coesão, ortografia, sem frase quebrada, sem lixo de transcrição.
4. GANCHO E TÍTULO: a primeira linha prende? Serve de título na rede?
5. DADOS: nenhuma estatística ou afirmação factual sem fonte. Dado inventado é reprovação. Os dados abaixo foram pesquisados pelo Roberto Radar e TÊM fonte; se o post usa um deles com a fonte, está correto.
${dadosDoRoberto}
6. ADEQUAÇÃO À REDE: tamanho, hashtags, chamada para ação fazem sentido na rede de destino?

O que NÃO é problema: em carrossel, imagem e infográfico, a peça visual já está feita e o texto é a legenda; não peça para dividir a legenda em slides nem para descrever a imagem. Em thread, os tweets numerados (1/, 2/) são o formato certo. Em enquete, o texto é a introdução mais a pergunta e as opções. Em corte de vídeo e vídeo completo, o texto é título e descrição; o vídeo em si você não vê, avalie só o texto.

ESCREVA NESTA ORDEM:
- Um parágrafo curto com a leitura geral do dia.
- Para cada post: "Post N": o que está bom, o que precisa mudar, com a sugestão de texto quando for o caso.
- "Recomendações": até 3 melhorias concretas para esse nicho e público.
- Última linha, exatamente uma destas: VEREDITO: APROVADO | VEREDITO: APROVADO_COM_RESSALVAS | VEREDITO: REPROVADO

Sem travessão no texto: use vírgula, dois-pontos ou parênteses.`;

  let saida: string;
  try {
    saida = await askClaude(system, tarefa, {
      maxTokens: 4000,
      // A conferência depois da correção é leitura contra uma lista que ela
      // mesma escreveu: esforço médio basta e corta o custo da volta, que é
      // a chamada mais cara do laço (US$ 0,10 por revisão no esforço alto).
      ...(opcoes.parecerAnterior ? { effort: "medium" as const } : {}),
      usage: { operation: "agent", runId: card.runId, agentId: "vera-veredito", projectId: video.projectId },
    });
  } catch (e) {
    console.error(`[vera][${video.id}] revisão de ${dia} falhou:`, e);
    return null;
  }

  const veredito = extrairVeredito(saida);
  const corpo = saida.replace(/\n?VEREDITO:.*$/i, "").trim();
  return { veredito, saida, corpo, postIds: posts.map((p) => p.id) };
}

/** Revisão de um dia pelo id do card da Vera, para o laço da correção. */
export async function revisarDiaDoVideo(
  videoJobId: string,
  cardId: string,
  opcoes: { parecerAnterior?: string; tentativa?: number } = {}
): Promise<RevisaoDoDia | null> {
  const video = await carregarVideoDaVera(videoJobId);
  const card = await prisma.campaignCard.findUnique({
    where: { id: cardId },
    select: { id: true, dayOfWeek: true, scheduledDate: true, metadata: true, runId: true },
  });
  if (!video || !card) return null;
  return revisarUmDia(video, card, opcoes);
}

/**
 * O card precisa (ainda) da correção do squad?
 *
 * Sim quando o veredito pede e a correção nunca rodou, ou quando ela ficou
 * "corrigindo" além do prazo (a função morreu no meio): rodar a esteira de
 * novo retoma. `corrigido` e `sem_conserto` são finais e não repetem, senão
 * cada passada da esteira pagaria outra rodada de reescritas.
 */
function precisaDaCorrecao(meta: Record<string, unknown>, corpo: string): boolean {
  const veredito = typeof meta.veredito === "string" ? meta.veredito : "";
  if (!vereditoPedeCorrecao(veredito, corpo)) return false;
  const c = meta.correcaoDaVera as CorrecaoDaVera | undefined;
  if (!c) return true;
  if (c.estado !== "corrigindo") return false;
  return Date.now() - new Date(c.desde).getTime() > VALIDADE_DA_CORRECAO_MIN * 60_000;
}

/**
 * Roda a Vera em cada card dela do vídeo que ainda não tem veredito. Idempotente:
 * card já revisado é pulado, então pode ser chamada quantas vezes for preciso
 * (no agendar, quando o completo chega, quando o carrossel fica pronto).
 *
 * O dia que ela reprova entra na correção do squad logo em seguida, no mesmo
 * paralelo: o cliente só vê o dia depois que o squad tentou consertar.
 * `prazoEm` é o instante em que a função vai ser morta; a correção não começa
 * uma tentativa que não cabe nele.
 */
export async function revisarDiasDoVideo(videoJobId: string, opcoes: { prazoEm?: number } = {}): Promise<number> {
  const video = await carregarVideoDaVera(videoJobId);
  if (!video) return 0;

  const cards = await prisma.campaignCard.findMany({
    where: {
      projectId: video.projectId,
      agentId: "vera-veredito",
      metadata: { path: ["videoJobId"], equals: videoJobId },
    },
    select: { id: true, dayOfWeek: true, scheduledDate: true, metadata: true, runId: true, content: true },
  });

  let revisados = 0;
  // Um dia não depende do outro: as revisões saem juntas. Em série, a Vera
  // levou 1,2 min na semana de 02/09; em paralelo é o tempo de um dia.
  await Promise.all(cards.map(async (card) => {
    const meta = (card.metadata as Record<string, unknown> | null) ?? {};
    if (!card.scheduledDate) return;

    // Já revisado E nada novo desde então: pula a revisão. Mas se chegou post
    // depois do veredito (a semana de texto agora termina ANTES dos cortes do
    // Vitor, e o dia ganha o corte depois), a Vera revisa o dia de novo.
    if (meta.veredito) {
      const revisadoEm = typeof meta.revisadoEm === "string" ? new Date(meta.revisadoEm).getTime() : 0;
      const posts = await postsDoDiaDaVera(video.projectId, card.scheduledDate);
      if (!posts.some((p) => p.createdAt.getTime() > revisadoEm)) {
        // Revisado e parado: só retoma a correção que ficou devendo.
        if (precisaDaCorrecao(meta, card.content ?? "")) {
          const { corrigirDiaDoVideo } = await import("@/lib/media/correcao-do-dia-do-video");
          await corrigirDiaDoVideo({ videoJobId, cardId: card.id, prazoEm: opcoes.prazoEm }).catch((e) =>
            console.error(`[vera][${videoJobId}] correção do dia ${card.dayOfWeek} falhou:`, e)
          );
        }
        return;
      }
    }

    const revisao = await revisarUmDia(video, card);
    if (!revisao) return;

    // Uma revisão nova zera a correção anterior: é outro conjunto de peças.
    const { correcaoDaVera: _antiga, ...resto } = meta;
    void _antiga;
    await prisma.campaignCard.update({
      where: { id: card.id },
      data: {
        content: `Veredito: ${ROTULO_DO_VEREDITO[revisao.veredito]}\n\n${revisao.corpo}`,
        metadata: { ...resto, veredito: revisao.veredito, revisadoEm: new Date().toISOString(), pecasRevisadas: revisao.postIds },
      },
    });
    revisados++;

    if (vereditoPedeCorrecao(revisao.veredito, revisao.corpo)) {
      // Import tardio: a correção importa daqui (revisarDiaDoVideo), e o
      // ciclo de módulos resolvido na carga quebra no bundle do Next.
      const { corrigirDiaDoVideo } = await import("@/lib/media/correcao-do-dia-do-video");
      await corrigirDiaDoVideo({ videoJobId, cardId: card.id, primeira: revisao, prazoEm: opcoes.prazoEm }).catch((e) =>
        console.error(`[vera][${videoJobId}] correção do dia ${card.dayOfWeek} falhou:`, e)
      );
    }
  }));
  return revisados;
}
