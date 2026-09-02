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
  for (const card of cards) {
    const meta = (card.metadata as Record<string, unknown> | null) ?? {};
    if (meta.veredito || !card.scheduledDate) continue;

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
      select: { platform: true, content: true, mediaType: true, imageUrl: true, metadata: true },
      orderBy: { scheduledAt: "asc" },
    });
    if (posts.length === 0) continue;

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
              : "post de texto";
        const slides =
          p.mediaType === "carousel" && frasesDosSlides.length > 0
            ? `\nSLIDES (imagens já prontas, cada uma com esta frase escrita): ` +
              frasesDosSlides.map((f, k) => `${k + 1}. "${f}"`).join(" ") +
              `\nLEGENDA:`
            : "";
        return `POST ${i + 1} (${NOME_DA_REDE[p.platform] ?? p.platform}, ${tipo}):${slides}\n${p.content}`;
      })
      .join("\n\n---\n\n");

    const system = vera
      ? `Você é ${vera.name}, ${vera.role}.\nPersona: ${vera.persona ?? ""}\nEstilo: ${vera.style ?? ""}`
      : "Você é Vera Veredito, revisora de qualidade de conteúdo para redes sociais.";

    const tarefa = `Faça a revisão de qualidade COMPLETA e CRÍTICA do conteúdo de ${dia}. São os posts que saíram de um vídeo gravado pelo cliente; o texto de cada um é o título e a descrição ou a legenda que vai para a rede.

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
5. DADOS: nenhuma estatística ou afirmação factual sem fonte. Dado inventado é reprovação.
6. ADEQUAÇÃO À REDE: tamanho, hashtags, chamada para ação fazem sentido na rede de destino?

O que NÃO é problema: em carrossel, os slides são imagens já feitas e o texto é a legenda; não peça para dividir a legenda em slides. Em corte de vídeo e vídeo completo, o texto é título e descrição; o vídeo em si você não vê, avalie só o texto.

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
      continue;
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
  }
  return revisados;
}
