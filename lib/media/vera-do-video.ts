import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";

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
 */

export const VEREDITOS = ["APROVADO", "APROVADO_COM_RESSALVAS", "REPROVADO"] as const;
export type Veredito = (typeof VEREDITOS)[number];

const ROTULO: Record<Veredito, string> = {
  APROVADO: "Aprovado",
  APROVADO_COM_RESSALVAS: "Aprovado com ressalvas",
  REPROVADO: "Reprovado",
};

const NOME_DA_REDE: Record<string, string> = {
  youtube: "YouTube",
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

/**
 * Roda a Vera em cada card dela do vídeo que ainda não tem veredito. Idempotente:
 * card já revisado é pulado, então pode ser chamada quantas vezes for preciso
 * (no agendar, quando o completo chega, quando o carrossel fica pronto).
 */
export async function revisarDiasDoVideo(videoJobId: string): Promise<number> {
  const video = await prisma.videoJob.findUnique({
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
  if (!video) return 0;
  const vera = video.project.agents[0];

  // As frases dos slides do carrossel, para a Vera saber que os slides são
  // IMAGENS já prontas e o texto do post é a legenda. Sem isso ela pediu, na
  // primeira revisão de 02/09, para "estruturar o texto em slide 1, 2, 3".
  type TrechoComTexto = { texto?: { fraseDaCapa?: string } };
  const frasesDosSlides = ((video.clips as unknown as TrechoComTexto[]) ?? [])
    .map((t) => t.texto?.fraseDaCapa?.trim())
    .filter((f): f is string => Boolean(f))
    .slice(0, 5);

  const cards = await prisma.campaignCard.findMany({
    where: {
      projectId: video.projectId,
      agentId: "vera-veredito",
      metadata: { path: ["videoJobId"], equals: videoJobId },
    },
    select: { id: true, dayOfWeek: true, scheduledDate: true, metadata: true, runId: true },
  });

  let revisados = 0;
  // Um dia não depende do outro: as revisões saem juntas. Em série, a Vera
  // levou 1,2 min na semana de 02/09; em paralelo é o tempo de um dia.
  await Promise.all(cards.map(async (card) => {
    const meta = (card.metadata as Record<string, unknown> | null) ?? {};
    if (!card.scheduledDate) return;

    // Os posts do MESMO dia do card (dia UTC, como a rota by-day faz).
    const inicio = new Date(card.scheduledDate);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(inicio.getTime() + 86400000);
    const posts = await prisma.post.findMany({
      where: {
        projectId: video.projectId,
        scheduledAt: { gte: inicio, lt: fim },
        status: { notIn: ["failed"] },
      },
      select: { platform: true, content: true, mediaType: true, imageUrl: true, metadata: true, createdAt: true },
      orderBy: { scheduledAt: "asc" },
    });
    if (posts.length === 0) return;

    // Já revisado E nada novo desde então: pula. Mas se chegou post depois do
    // veredito (a semana de texto agora termina ANTES dos cortes do Vitor, e
    // o dia ganha o corte depois), a Vera revisa o dia de novo, com tudo.
    if (meta.veredito) {
      const revisadoEm = typeof meta.revisadoEm === "string" ? new Date(meta.revisadoEm).getTime() : 0;
      if (!posts.some((p) => p.createdAt.getTime() > revisadoEm)) return;
    }

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

    const system = vera
      ? `Você é ${vera.name}, ${vera.role}.\nPersona: ${vera.persona ?? ""}\nEstilo: ${vera.style ?? ""}`
      : "Você é Vera Veredito, revisora de qualidade de conteúdo para redes sociais.";

    const tarefa = `Faça a revisão de qualidade COMPLETA e CRÍTICA do conteúdo de ${dia}. São os posts que saíram de um vídeo gravado pelo cliente; o texto de cada um é o título e a descrição ou a legenda que vai para a rede.

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
        usage: { operation: "agent", runId: card.runId, agentId: "vera-veredito", projectId: video.projectId },
      });
    } catch (e) {
      console.error(`[vera][${videoJobId}] revisão de ${dia} falhou:`, e);
      return;
    }

    const veredito = extrairVeredito(saida);
    const corpo = saida.replace(/\n?VEREDITO:.*$/i, "").trim();
    await prisma.campaignCard.update({
      where: { id: card.id },
      data: {
        content: `Veredito: ${ROTULO[veredito]}\n\n${corpo}`,
        metadata: { ...meta, veredito, revisadoEm: new Date().toISOString() },
      },
    });
    revisados++;
  }));
  return revisados;
}
