import { podeUsarProjeto } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { mencoesDeOutraRede, NOME_DA_REDE } from "@/lib/pipeline/redes";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/stripe";
import { LINKEDIN_MAX_COMMENTARY_CHARS } from "@/lib/oauth/linkedin";
import { formatoValido } from "@/lib/publish/formato-de-destino";

/**
 * O POST QUE JÁ SAIU PODE IR PARA OUTRA REDE.
 *
 * Pedido do Bruno em 21/09. Hoje a campanha decide as redes no dia em que é
 * pedida, e depois disso não há caminho: o post que foi bem no LinkedIn não
 * tem como virar um post de Instagram sem alguém copiar e colar, que é
 * exatamente o trabalho que a plataforma existe para tirar.
 *
 * DUAS COISAS QUE ELE NÃO É, e as duas são de propósito:
 *
 *   1. não é uma CÓPIA. O mesmo texto colado em outra rede é o defeito que a
 *      esteira já corrigiu em 18/09, quando Facebook e Instagram saíram
 *      abrindo com "O LinkedIn não penaliza inteligência artificial". O texto
 *      é adaptado pelo mesmo caminho da campanha: tese, dados e fontes
 *      intactos, formato e menções de rede trocados;
 *   2. não publica sozinho. A peça nasce como RASCUNHO na rede nova, para
 *      quem aprovou o original aprovar também este. Publicar por tabela seria
 *      a plataforma decidindo onde a marca fala.
 *
 * O CUSTO É COBRADO, porque existe: uma chamada de texto no Opus 5 com o post
 * inteiro na entrada. Cobrar como "post de texto" (a linha que já existe em
 * `CREDIT_COSTS`) é a régua honesta, e a alternativa (de graça) seria uma
 * operação de IA fora do extrato, que é a origem do prejuízo do Veo em
 * agosto.
 */

/**
 * O formato de cada rede, e o teto que ela aceita.
 *
 * Exportado desde 21/09 porque refazer UMA peça (lib/pipeline/refazer-peca.ts)
 * precisa exatamente destas instruções: duas tabelas de formato de rede
 * divergem do mesmo jeito que duas tabelas de preço divergiram.
 */
export const FORMATO_DA_REDE: Record<string, { instrucao: string; teto: number }> = {
  linkedin: {
    instrucao:
      "Post de LinkedIn: primeira linha é o gancho, parágrafos curtos, tom profissional e direto, até 2.500 caracteres, sem hashtag no meio do texto.",
    teto: LINKEDIN_MAX_COMMENTARY_CHARS,
  },
  instagram: {
    instrucao:
      "Legenda de Instagram: primeira linha é o gancho, parágrafos curtos, até 1.500 caracteres, no máximo 5 hashtags no fim.",
    teto: 2200,
  },
  facebook: {
    instrucao: "Post de Facebook: tom de conversa, parágrafos curtos, até 1.200 caracteres, sem hashtags.",
    teto: 5000,
  },
  twitter: {
    instrucao:
      "Thread de X: cada tweet com no máximo 270 caracteres, numerados como \"1/\", \"2/\" e assim por diante, um por linha em branco, no máximo 5 tweets. O primeiro é o gancho e o último fecha a ideia.",
    teto: 270,
  },
  // TikTok e YouTube entraram em 29/09 (item 13): o card do dia passou a
  // oferecer as seis redes, e a rede marcada sem texto pede a adaptação ao
  // especialista dela por esta mesma função. O texto aqui é a LEGENDA do
  // vídeo, e os tetos são os das APIs (2.200 no TikTok, 5.000 na descrição
  // do YouTube).
  tiktok: {
    instrucao:
      "Legenda de TikTok: a primeira linha completa o gancho do vídeo, linguagem falada, até 600 caracteres, de 3 a 5 hashtags no fim.",
    teto: 2200,
  },
  youtube: {
    instrucao:
      "Descrição de vídeo do YouTube: primeira linha com a promessa concreta do vídeo (até 60 caracteres, serve de título), depois duas linhas que resumem o valor, até 1.500 caracteres, de 3 a 5 hashtags no fim.",
    teto: 5000,
  },
};

export type FalhaAoLevar =
  | { erro: "rede_desconhecida" }
  | { erro: "sem_conta" }
  | { erro: "ja_existe"; postId: string }
  | { erro: "sem_saldo"; necessario: number; disponivel: number; mensagem?: string }
  | { erro: "texto_recusado"; motivo: string };

export async function levarParaOutraRede(args: {
  postId: string;
  /** A conta de destino, escolhida na tela: é ela que diz a rede. */
  contaDestinoId: string;
  userId: string;
  /**
   * Onde a peça cai na rede nova (feed, reel, story). Opcional porque o
   * "levar para" do post publicado não pergunta; o card do dia pergunta
   * (item 13), e sem isto a cópia herdaria o formato do original, que é de
   * outra rede.
   */
  formato?: string;
}): Promise<{ ok: true; post: { id: string; platform: string } } | ({ ok: false } & FalhaAoLevar)> {
  const original = await prisma.post.findUnique({
    where: { id: args.postId },
    include: { project: { select: { id: true, userId: true, niche: true } } },
  });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  if (!original || !(await podeUsarProjeto(args.userId, original.project))) return { ok: false, erro: "sem_conta" };

  const destino = await prisma.socialAccount.findUnique({
    where: { id: args.contaDestinoId },
    select: { id: true, platform: true, projectId: true, displayName: true },
  });
  if (!destino || destino.projectId !== original.projectId) return { ok: false, erro: "sem_conta" };

  const formato = FORMATO_DA_REDE[destino.platform];
  if (!formato) return { ok: false, erro: "rede_desconhecida" };

  /**
   * O MESMO POST NÃO VAI DUAS VEZES PARA A MESMA CONTA.
   *
   * Sem esta guarda, dois cliques no botão criariam duas peças iguais, e a
   * segunda é a que o cliente descobre depois de publicada. A marca fica no
   * metadata da cópia, e não numa coluna nova.
   */
  const jaLevado = await prisma.post.findFirst({
    where: {
      projectId: original.projectId,
      socialAccountId: destino.id,
      metadata: { path: ["levadoDe"], equals: args.postId },
    },
    select: { id: true },
  });
  if (jaLevado) return { ok: false, erro: "ja_existe", postId: jaLevado.id };

  const custo = CREDIT_COSTS.post_text;
  const disponivel = await saldo(args.userId);
  if (disponivel < custo) return { ok: false, erro: "sem_saldo", necessario: custo, disponivel };

  // As frases do original que falam da rede ANTIGA, medidas por código e
  // nomeadas no prompt. "Adapte para o Instagram" não basta: foi assim que o
  // Facebook saiu abrindo com uma frase sobre o algoritmo do LinkedIn.
  const mencoes = mencoesDeOutraRede(original.content, destino.platform);
  const avisoDeRede = mencoes.length
    ? `\nATENCAO: estas frases do post original falam de outra rede, e voce esta escrevendo para o ${NOME_DA_REDE[destino.platform] ?? destino.platform}:
${mencoes.map((m) => `   • ${m.frase}`).join("\n")}
   Reescreva cada uma. Quando a rede citada for so o cenario da frase, troque pela rede nova ou por uma forma neutra ("o feed", "as redes"). Quando ela fizer parte de um FATO da pesquisa, mantenha: o fato nao muda de rede.\n`
    : "";

  const bruto = await askClaude(
    "Você é Lucas, redator do squad. Adapta peças entre redes sem inventar nada. Nunca use travessão: use vírgula, dois-pontos ou parênteses.",
    `Adapte o post abaixo para o ${NOME_DA_REDE[destino.platform] ?? destino.platform}, mantendo a tese, os dados e as fontes exatamente como estão.
- ${formato.instrucao}
- Não acrescente fatos, números, fontes nem promessas que não estejam no post original.
- Não prometa mídia que o post não tem: nada de "vídeo nos comentários", "gravei", "link na bio".
- Devolva SÓ o texto adaptado, sem comentário e sem explicar o que mudou.
${avisoDeRede}
POST ORIGINAL (${NOME_DA_REDE[original.platform] ?? original.platform}):
${original.content}`,
    { usage: { projectId: original.projectId, operation: "levar_para_outra_rede" }, maxTokens: 4000 }
  );

  const limpo = pecaPublicavel(bruto);
  if ("recusado" in limpo) return { ok: false, erro: "texto_recusado", motivo: limpo.recusado };

  try {
    await debitar({
      // Quem pediu paga pela conta (01/10): marca o membro e conta no teto dele.
      userId: args.userId,
      quantidade: custo,
      operation: "levar_para_outra_rede",
      projectId: original.projectId,
      refId: `${args.postId}:${destino.id}`,
      note: `Post levado para ${NOME_DA_REDE[destino.platform] ?? destino.platform}`,
    });
  } catch (e) {
    // O teto do membro e a cota da equipe (01/10) chegam com a frase pronta, que diz a quem pedir.
    if (e instanceof SaldoInsuficiente) return { ok: false, erro: "sem_saldo", necessario: custo, disponivel, mensagem: e.equipe ? e.message : undefined };
    throw e;
  }

  /**
   * A MÍDIA VAI JUNTO, e é por isso que a cópia nasce depois de publicar.
   *
   * Ao publicar, a esteira apaga a data URL da arte e guarda o link do Blob
   * (parte 148). Então o que sobra em `imageUrl` do post publicado é um link,
   * que serve para a rede nova sem duplicar bytes no banco. Quando o original
   * não tem mídia nenhuma, a cópia sai como texto: o Instagram não publica
   * texto solto, e a guarda do publicador barra antes de ir ao ar.
   */
  const novo = await prisma.post.create({
    data: {
      projectId: original.projectId,
      runId: original.runId,
      dayOfWeek: original.dayOfWeek,
      // A MESMA DATA DO DIA (30/09): sem ela o post adaptado nascia sem data e
      // não aparecia no card do dia; o cliente via "adaptou" e nada mudava.
      // Original já publicado não empresta a data: aquela hora já passou.
      scheduledAt: original.status === "published" ? null : original.scheduledAt,
      platform: destino.platform,
      socialAccountId: destino.id,
      content: limpo.texto,
      mediaType: original.mediaType,
      imageUrl: original.imageUrl,
      status: "draft",
      metadata: {
        ...((original.metadata as Record<string, unknown> | null) ?? {}),
        // De onde veio, para a tela mostrar e para a guarda de duplicata.
        // O formato vale para a rede NOVA: o do original pode nem existir nela.
        formato: formatoValido(destino.platform, args.formato),
        levadoDe: args.postId,
        levadoEm: new Date().toISOString(),
        // O erro do post original não é erro deste: começar com a mensagem de
        // falha do outro seria a tela mentindo de novo (o caso de 21/09).
        error: undefined,
      } as never,
    },
    select: { id: true, platform: true },
  });

  return { ok: true, post: novo };
}
