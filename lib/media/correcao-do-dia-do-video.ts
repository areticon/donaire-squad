import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";
import { direcaoDaPeca } from "@/lib/media/direcao-de-arte";
import { midiaProduzida } from "@/lib/media/storage";
import { limparMarcadores } from "@/lib/media/write-posts";
import { textoDoRadar, type Radar } from "@/lib/media/radar-do-video";
import { REGRAS_DE_TEXTO, separarTweets, fraseDaArte, arteDoDia } from "@/lib/media/pecas-da-semana";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { arteCoerenteComOTexto } from "@/lib/squad/coerencia-da-arte";
import { formatoDaPeca as formatoDaRede } from "@/lib/media/formatos-das-redes";
import { revisarDiaDoVideo, postsDoDiaDaVera, ROTULO_DO_VEREDITO, STATUS_FORA_DA_REVISAO, type RevisaoDoDia } from "@/lib/media/vera-do-video";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { marcarEmRevisao, encerrarRevisao } from "@/lib/pipeline/revisao-do-card";
import { fichaDoAgente } from "@/lib/squad/definicoes-dos-agentes";
import { agentePorId } from "@/lib/squad/estado-do-squad";
import { gravarLicao } from "@/lib/squad/licoes-da-vera";
import {
  MAX_TENTATIVAS_DA_VERA,
  vereditoPedeCorrecao,
  type CorrecaoDaVera,
  type TentativaDaCorrecao,
} from "@/lib/squad/estado-da-correcao";
import {
  gravarCorrecaoNoCard,
  leituraGeralDoParecer,
  motivoDoParecer,
  oQueFazerDoCliente,
  recomendacoesDoParecer,
  secaoPedeMudanca,
  secoesPorPeca,
} from "@/lib/squad/correcao-da-vera";
import type { Prisma } from "@prisma/client";

/**
 * A SEMANA DO VÍDEO SE CORRIGE SOZINHA DEPOIS DA VERA (29/09).
 *
 * O dia que a Vera reprova não vai para o cliente: cada peça que ela apontou
 * volta ao agente dono, com o trecho do parecer que é dela, e a Vera revisa o
 * dia de novo. Até 2 tentativas; só depois disso, e só se não houver
 * conserto, o dia chega ao cliente com o motivo e o que fazer.
 *
 * QUEM É O DONO DE CADA PEÇA:
 *   - thread do X: Xavier;
 *   - título e descrição de corte e de vídeo completo: Vitor (só o TEXTO, o
 *     vídeo não é refeito aqui; o corte tem a revisão própria em
 *     lib/media/revisao-do-corte.ts);
 *   - post e legenda de imagem, carrossel e infográfico: o redator do card
 *     (Lucas, na semana do vídeo);
 *   - a FRASE escrita na imagem: Diana, que refaz a arte quando a Vera
 *     aponta a frase (a quarta de 30/09 saiu com a frase cortada no meio).
 *
 * Enquete fica fora da reescrita: o texto dela é derivado das opções gravadas
 * no metadata, e reescrever o texto solto quebraria a enquete que o LinkedIn
 * recebe.
 */

type PostDoDia = {
  id: string;
  platform: string;
  content: string;
  mediaType: string | null;
  imageUrl: string | null;
  metadata: unknown;
  runId: string | null;
  dayOfWeek: number | null;
};

type CardProdutor = { id: string; agentId: string; cardType: string; postId: string | null; content: string | null; metadata: unknown; mediaUrl: string | null };

/** Tempo que uma tentativa precisa: reescritas em paralelo, arte e a nova revisão. */
const TEMPO_DE_UMA_TENTATIVA_MS = 150_000;

function donoDaPeca(post: PostDoDia, produtores: CardProdutor[]): string {
  if (post.platform === "twitter" || post.mediaType === "thread") return "xavier-x";
  if (post.mediaType === "video") return "vitor-video";
  const redator = produtores.find((c) => c.postId === post.id && c.agentId !== "diana-design" && c.cardType !== "media");
  return redator?.agentId ?? "lucas-linkedin";
}

/**
 * A peça de que a seção fala. A Vera numera na ordem que recebeu, e o
 * cabeçalho dela costuma dizer a rede ("Post 1 (X, thread)"): quando a rede
 * do cabeçalho não bate com a peça daquela posição, vale a rede. Dois posts
 * no mesmo horário já trocaram de lugar entre uma consulta e outra.
 */
function pecaDaSecao(secao: string, naPosicao: PostDoDia, todas: PostDoDia[]): PostDoDia {
  const cabecalho = secao.split("\n")[0] ?? "";
  const redes: Array<[string, RegExp]> = [
    ["twitter", /\b(X|twitter|thread)\b/i],
    ["youtube", /youtube/i],
    ["instagram", /instagram/i],
    ["linkedin", /linkedin/i],
    ["facebook", /facebook/i],
    ["tiktok", /tiktok/i],
  ];
  const rede = redes.find(([, re]) => re.test(cabecalho))?.[0];
  if (!rede || naPosicao.platform === rede) return naPosicao;
  const daRede = todas.filter((p) => p.platform === rede);
  return daRede.length === 1 ? daRede[0] : naPosicao;
}

/** A Vera apontou a FRASE escrita na arte? Aí o conserto é da Diana. */
function arteApontada(secao: string): boolean {
  // Frase cortada ou quebrada (30/09), e desde 05/10 (noite) também a frase
  // que não conversa com o texto: o critério "coerencia" da Vera pelo JEV.
  return (
    /(frase da (imagem|arte|capa)|imagem|arte)[\s\S]{0,240}(cortad|quebrad|trunc|incomplet|no meio de uma palavra|ileg[ií]vel|erro de escrita)/i.test(secao) ||
    /frase da imagem[\s\S]{0,160}(não conversa|não combina|outro assunto|não fala da mesma|descasad|coerên|coeren)/i.test(secao)
  );
}

function nomeDoAgente(agentId: string): string {
  return agentePorId(agentId)?.nome ?? fichaDoAgente(agentId)?.name ?? agentId;
}

/** O que a peça é, em uma linha, para o redator saber o formato que devolve. */
function formatoDaPeca(post: PostDoDia): string {
  const meta = (post.metadata as Record<string, unknown> | null) ?? {};
  if (post.mediaType === "thread") return "THREAD do X: de 5 a 8 tweets numerados (1/ 2/ 3/), um por parágrafo, cada um com no máximo 270 caracteres contando o número.";
  if (post.mediaType === "video")
    return `${meta.gravacaoCompleta ? "VÍDEO COMPLETO" : "CORTE DE VÍDEO"} no ${post.platform}: a PRIMEIRA LINHA é o título do vídeo (mantenha igual, a não ser que a Vera tenha pedido para mudar o título), depois uma linha em branco e a descrição. O vídeo em si não muda, só o texto.`;
  if (post.mediaType === "image") return `LEGENDA de uma imagem no ${post.platform}. A imagem tem uma frase escrita; a legenda desenvolve a ideia.`;
  if (post.mediaType === "carousel") return `LEGENDA de um carrossel no ${post.platform}. As lâminas já estão prontas; escreva só a legenda.`;
  if (post.mediaType === "infographic") return `LEGENDA de um infográfico no ${post.platform}.`;
  return `POST de texto no ${post.platform}.`;
}

type ContextoDaCorrecao = {
  video: { id: string; projectId: string; radar: unknown; project: { name: string; niche: string | null; targetAudience: string | null; voice: string | null; colorPalette: string | null; agents: Array<{ agentId: string; name: string; role: string; persona: string | null; style: string | null }> } };
  runId: string;
  mediaStyle?: string;
  dia: number;
};

function personaDoDono(ctx: ContextoDaCorrecao, agentId: string): string {
  const doProjeto = ctx.video.project.agents.find((a) => a.agentId === agentId);
  const a = doProjeto ?? fichaDoAgente(agentId);
  if (!a) return `Você é ${nomeDoAgente(agentId)}, redator de redes sociais.`;
  return `Você é ${a.name}, ${a.role}.${a.persona ? `\nPersona: ${a.persona}` : ""}${a.style ? `\nEstilo: ${a.style}` : ""}`;
}

/**
 * O dono refaz a peça com o motivo da Vera. Devolve o texto novo e, quando a
 * arte foi apontada, a frase nova para a Diana desenhar.
 */
async function reescreverPeca(
  ctx: ContextoDaCorrecao,
  post: PostDoDia,
  dono: string,
  parecer: { geral: string; secao: string; recomendacoes: string },
  pedirFrase: boolean
): Promise<{ texto: string; frase?: string } | null> {
  const radar = ctx.video.radar as Radar | null;
  const meta = (post.metadata as Record<string, unknown> | null) ?? {};
  const fraseAtual = typeof meta.frase === "string" ? meta.frase : null;
  // Sem a transcrição inteira de propósito: reescrever um texto pronto não
  // precisa dos 40 mil caracteres do vídeo, e eles custavam US$ 0,06 por
  // peça sem cache. O briefing do Roberto fica, porque é dele que sai o dado
  // com fonte que a peça pode (e só ela pode) citar.
  const pedido = `A Vera, gerente do time, reprovou o dia e mandou esta peça de volta para você. Refaça a peça resolvendo o que ela apontou.

PROJETO: ${ctx.video.project.name}
NICHO: ${ctx.video.project.niche ?? "não informado"}
PÚBLICO: ${ctx.video.project.targetAudience ?? "não informado"}
VOZ DA MARCA: ${ctx.video.project.voice ?? "não informada"}

BRIEFING DO ROBERTO (a única fonte de dado que a peça pode citar):
${radar ? textoDoRadar(radar).slice(0, 6000) : "(sem pesquisa: não cite número nenhum)"}

O QUE A VERA DISSE DO DIA:
${parecer.geral.slice(0, 1500)}

O QUE A VERA DISSE DESTA PEÇA:
${parecer.secao.slice(0, 3500)}
${parecer.recomendacoes ? `\n${parecer.recomendacoes.slice(0, 1200)}\n` : ""}
FORMATO: ${formatoDaPeca(post)}
${fraseAtual ? `\nFRASE ESCRITA NA IMAGEM HOJE: "${fraseAtual}"` : ""}

COMO REFAZER:
- Resolva cada item que a Vera pediu nesta peça. Pode usar as sugestões de texto dela, adaptando à peça.
- Mantenha o que ela disse que está bom. Não troque o assunto da peça nem invente fato novo.
- A peça é falada na primeira pessoa de quem gravou o vídeo; mantenha a voz dele.

${REGRAS_DE_TEXTO}

COMO ENTREGAR: a peça final entre <POST> e </POST>, só o texto que vai ao ar, começando pela primeira palavra.${
    pedirFrase
      ? `\nA Vera apontou a FRASE DA IMAGEM: escreva também a frase nova entre <FRASE> e </FRASE>, uma frase fechada, com ponto final, de no máximo 110 caracteres, sem aspas.`
      : ""
  } Fora das marcas pode comentar o que quiser; nada de fora vai ao ar.

<PECA_ATUAL>
${post.content}
</PECA_ATUAL>`;

  const bruto = await askClaude(personaDoDono(ctx, dono), pedido, {
    maxTokens: 4000,
    // Reescrever com a lista da Vera na mão é trabalho de execução, não de
    // descoberta: esforço médio entrega o mesmo texto por um terço do custo.
    effort: "medium",
    usage: { operation: "agent", runId: ctx.runId, agentId: dono, projectId: ctx.video.projectId },
  });

  const dentro = bruto.match(/<POST>([\s\S]*?)<\/POST>/i)?.[1] ?? bruto;
  let texto = limparMarcadores(dentro.trim());
  if (post.mediaType === "thread") {
    texto = separarTweets(texto)
      .map((t) => (t.length > 280 ? `${t.slice(0, 279).trimEnd()}…` : t))
      .join("\n\n");
  }
  // A última peneira antes do banco: parecer ou changelog colado na peça é
  // pior que a peça antiga, e aí ela fica como estava.
  const peca = pecaPublicavel(texto);
  if ("recusado" in peca) {
    console.warn(`[correcao][${ctx.video.id}] recusei a reescrita de ${dono}: ${peca.recusado}`);
    return null;
  }
  const fraseBruta = pedirFrase ? bruto.match(/<FRASE>([\s\S]*?)<\/FRASE>/i)?.[1]?.replace(/["“”]/g, "").trim() : undefined;
  return { texto: peca.texto, frase: fraseBruta ? fraseDaArte(fraseBruta, 120) : undefined };
}

/** A Diana redesenha a imagem com a frase nova, no mesmo formato e direção de arte. */
async function refazerArte(ctx: ContextoDaCorrecao, post: PostDoDia, frase: string): Promise<string> {
  const direcao = await direcaoDaPeca({ projectId: ctx.video.projectId, runId: ctx.runId, dayOfWeek: ctx.dia, infografico: false, preferido: ctx.mediaStyle });
  // O mesmo caminho da semana desde 30/09: arte sem texto nem gente, frase
  // composta em código no formato da rede (lib/media/arte-com-frase.tsx).
  const bruta = await arteDoDia(ctx.video, frase, direcao.styleHint, formatoDaRede(post.platform, "image"), {
    projectId: ctx.video.projectId,
    runId: ctx.runId,
  });
  // Data URI de 1,7 MB no post pesa em toda leitura do quadro; com o store
  // público configurado, a arte vai para ele como as demais artes da semana.
  if (!bruta.startsWith("data:") || !process.env.BLOB_PUBLIC_READ_WRITE_TOKEN) return bruta;
  const { url } = await put(`campanhas/${ctx.runId}/correcao-dia${ctx.dia}.jpg`, dataUrlToBuffer(bruta), {
    ...midiaProduzida(),
    contentType: bruta.startsWith("data:image/png") ? "image/png" : "image/jpeg",
    addRandomSuffix: true,
  });
  return url;
}

/** O conteúdo do card da Vera enquanto o squad trabalha: a razão continua lá, embaixo. */
function cardCorrigindo(tentativa: number, quem: string[], motivo: string, corpo: string): string {
  return (
    `Veredito: O squad está corrigindo (tentativa ${tentativa} de ${MAX_TENTATIVAS_DA_VERA})\n\n` +
    `A Vera pediu correção e a peça voltou para ${quem.join(", ")}. Motivo: ${motivo}\n\n` +
    `Depois da correção ela revisa o dia de novo. Você não precisa fazer nada agora.\n\n---\n\n${corpo.replace(/^Veredito:.*\n*/i, "")}`
  );
}

function historicoEmTexto(historico: TentativaDaCorrecao[]): string {
  return historico
    .map((h) => `- Tentativa ${h.tentativa}: ${h.quem.join(", ")} refez. A Vera, depois: ${ROTULO_DO_VEREDITO[h.veredito as keyof typeof ROTULO_DO_VEREDITO] ?? h.veredito}.`)
    .join("\n");
}

/**
 * O laço inteiro de UM dia. `primeira` é a revisão que acabou de reprovar;
 * sem ela (retomada), vale o que está gravado no card.
 */
export async function corrigirDiaDoVideo(args: {
  videoJobId: string;
  cardId: string;
  primeira?: RevisaoDoDia;
  prazoEm?: number;
  /** Conferido antes de cada tentativa: o script de teste passa o teto de custo aprovado. */
  podeGastar?: () => Promise<boolean>;
}): Promise<{ estado: CorrecaoDaVera["estado"]; tentativas: number; veredito: string } | null> {
  const card = await prisma.campaignCard.findUnique({
    where: { id: args.cardId },
    select: { id: true, runId: true, dayOfWeek: true, scheduledDate: true, content: true, metadata: true },
  });
  const video = await prisma.videoJob.findUnique({
    where: { id: args.videoJobId },
    select: {
      id: true,
      projectId: true,
      radar: true,
      project: {
        select: {
          name: true,
          niche: true,
          targetAudience: true,
          voice: true,
          colorPalette: true,
          agents: { select: { agentId: true, name: true, role: true, persona: true, style: true } },
        },
      },
    },
  });
  if (!card || !video || !card.scheduledDate) return null;
  const run = await prisma.pipelineRun.findUnique({ where: { id: card.runId }, select: { config: true } });
  const ctx: ContextoDaCorrecao = {
    video,
    runId: card.runId,
    mediaStyle: (run?.config as { mediaStyle?: string } | null)?.mediaStyle,
    dia: card.dayOfWeek,
  };

  const meta0 = (card.metadata as Record<string, unknown> | null) ?? {};
  let parecer = args.primeira?.corpo ?? (card.content ?? "").replace(/^Veredito:.*\n*/i, "");
  let veredito: string = args.primeira?.veredito ?? (typeof meta0.veredito === "string" ? meta0.veredito : "REPROVADO");
  let ordem: string[] = args.primeira?.postIds ?? (Array.isArray(meta0.pecasRevisadas) ? (meta0.pecasRevisadas as string[]) : []);
  // Card revisado antes de 29/09 não guardou a ordem: ela é refeita pela
  // mesma consulta que a Vera usou para numerar as peças.
  if (!ordem.length) ordem = (await postsDoDiaDaVera(video.projectId, card.scheduledDate, card.runId)).map((p) => p.id);
  const motivoInicial = motivoDoParecer(parecer);
  const historico: TentativaDaCorrecao[] = [];
  let tentativa = 0;

  while (tentativa < MAX_TENTATIVAS_DA_VERA && vereditoPedeCorrecao(veredito, parecer)) {
    // Tentativa que não cabe no tempo da função não começa: começar e morrer
    // no meio deixaria peça meio reescrita e o card "corrigindo" sem dono.
    if (args.prazoEm && args.prazoEm - Date.now() < TEMPO_DE_UMA_TENTATIVA_MS) {
      console.warn(`[correcao][${video.id}] dia ${card.dayOfWeek}: sem tempo para a tentativa ${tentativa + 1}; a próxima passada da esteira retoma.`);
      if (tentativa === 0) {
        // Marca para a retomada; o prazo do leitor transforma em "precisa de
        // você" se ninguém retomar, em vez de "corrigindo" para sempre.
        await gravarCorrecaoNoCard(card.id, {
          estado: "corrigindo",
          tentativa: 0,
          maxTentativas: MAX_TENTATIVAS_DA_VERA,
          desde: new Date().toISOString(),
          motivo: motivoInicial,
          historico,
        });
      }
      return { estado: "corrigindo", tentativas: tentativa, veredito };
    }
    if (args.podeGastar && !(await args.podeGastar())) {
      console.warn(`[correcao][${video.id}] dia ${card.dayOfWeek}: teto de custo atingido antes da tentativa ${tentativa + 1}.`);
      break;
    }
    tentativa++;

    // SÓ AS PEÇAS DO RUN DO CARD, e só as que ainda podem mudar (05/10): a
    // ordem gravada por uma Vera antiga pode trazer ids de outros runs (até
    // post publicado), e reescrever esses é mexer no que não é desta campanha.
    const posts: PostDoDia[] = await prisma.post.findMany({
      where: { id: { in: ordem }, runId: card.runId, status: { notIn: [...STATUS_FORA_DA_REVISAO] } },
      select: { id: true, platform: true, content: true, mediaType: true, imageUrl: true, metadata: true, runId: true, dayOfWeek: true },
    });
    const porId = new Map(posts.map((p) => [p.id, p]));
    const ordenados = ordem.map((id) => porId.get(id)).filter((p): p is PostDoDia => Boolean(p));
    const produtores: CardProdutor[] = await prisma.campaignCard.findMany({
      where: { postId: { in: ordenados.map((p) => p.id) }, runId: card.runId },
      select: { id: true, agentId: true, cardType: true, postId: true, content: true, metadata: true, mediaUrl: true },
    });

    const secoes = secoesPorPeca(parecer);
    let alvos = ordenados
      .map((post, i) => ({ post: pecaDaSecao(secoes.get(i + 1) ?? "", post, ordenados), secao: secoes.get(i + 1) ?? "" }))
      .filter((a) => secaoPedeMudanca(a.secao) && a.post.mediaType !== "poll");
    // Parecer sem seção por peça (a Vera às vezes escreve corrido): todas as
    // peças de texto voltam com o parecer inteiro, que é o único motivo que há.
    if (!alvos.length) alvos = ordenados.filter((p) => p.mediaType !== "poll").map((post) => ({ post, secao: parecer }));
    if (!alvos.length) break;

    const tarefas = alvos.map((a) => {
      const dono = donoDaPeca(a.post, produtores);
      const diana = a.post.mediaType === "image" && arteApontada(a.secao);
      return { ...a, dono, diana };
    });
    const quem = [...new Set(tarefas.flatMap((t) => [nomeDoAgente(t.dono), ...(t.diana ? [nomeDoAgente("diana-design")] : [])]))];
    const motivo = motivoDoParecer(parecer);

    await gravarCorrecaoNoCard(
      card.id,
      { estado: "corrigindo", tentativa, maxTentativas: MAX_TENTATIVAS_DA_VERA, desde: new Date().toISOString(), motivo, historico },
      { content: cardCorrigindo(tentativa, quem, motivo, parecer) }
    );
    // Os cards de quem está refazendo entram em revisão: é o que põe a peça
    // em "fazendo" no calendário (lib/squad/peca-em-producao.ts).
    const idsEmRevisao: string[] = [];
    for (const t of tarefas) {
      const ids = produtores.filter((c) => c.postId === t.post.id).map((c) => c.id);
      idsEmRevisao.push(...ids);
      await marcarEmRevisao({
        cardIds: ids,
        pedido: `A Vera pediu correção: ${motivo}`,
        porNome: "Vera Veredito",
        porImagem: null,
        agenteId: t.dono,
        agenteNome: nomeDoAgente(t.dono),
      });
      // O retreino: a lição fica para a próxima campanha do agente, uma vez
      // por dia reprovado (a segunda volta é o mesmo erro, não um novo).
      if (tentativa === 1) {
        await gravarLicao(video.projectId, { agentId: t.dono, motivo: motivoDoParecer(t.secao || parecer), rede: t.post.platform, runId: card.runId });
        if (t.diana) await gravarLicao(video.projectId, { agentId: "diana-design", motivo: "frase da arte saiu cortada ou quebrada", rede: t.post.platform, runId: card.runId });
      }
    }

    const geral = leituraGeralDoParecer(parecer);
    const recomendacoes = recomendacoesDoParecer(parecer);
    try {
      await Promise.allSettled(
        tarefas.map(async (t) => {
          const novo = await reescreverPeca(ctx, t.post, t.dono, { geral, secao: t.secao, recomendacoes }, t.diana);
          if (!novo) return;
          const postMeta = { ...((t.post.metadata as Record<string, unknown> | null) ?? {}) };
          let imageUrl: string | undefined;
          // A FRASE DA IMAGEM ACOMPANHA O TEXTO NOVO (05/10, noite): mesmo quando
          // a Vera não apontou a arte, a reescrita pode ter mudado o assunto da
          // legenda. O JEV confere; se não conversa mais, a frase nasce do texto
          // novo (uma chamada curta) e a Diana refaz a arte.
          let refazer = t.diana;
          let fraseNova: string | null = novo.frase ?? null;
          if (!refazer && t.post.mediaType === "image" && typeof postMeta.frase === "string" && postMeta.frase.trim()) {
            const c = await arteCoerenteComOTexto({
              projectId: video.projectId,
              texto: novo.texto,
              arte: { frase: postMeta.frase },
              projeto: { nicho: video.project.niche, marca: video.project.name },
              etapa: "arte-coerencia",
            });
            if (c.coerente === false) {
              console.warn(`[correcao][${video.id}] dia ${card.dayOfWeek}: a frase da imagem não conversa mais com o texto (${c.nota?.toFixed(2)}); a frase nasce de novo.`);
              refazer = true;
            }
          }
          if (refazer && !fraseNova) {
            try {
              const manchete = await mancheteDaPeca({ textoDoPost: novo.texto, estiloVisual: "editorial, one scene", nicho: video.project.niche, projectId: video.projectId, runId: ctx.runId });
              fraseNova = fraseDaArte(manchete.manchete, 110);
            } catch (e) {
              console.error(`[correcao][${video.id}] a frase nova da imagem não saiu:`, e instanceof Error ? e.message : e);
            }
          }
          if (refazer) {
            const frase = fraseNova ?? (typeof postMeta.frase === "string" ? fraseDaArte(postMeta.frase, 110) : null);
            if (frase) {
              try {
                imageUrl = await refazerArte(ctx, t.post, frase);
                postMeta.frase = frase;
              } catch (e) {
                console.error(`[correcao][${video.id}] a Diana não refez a arte do dia ${card.dayOfWeek}:`, e);
              }
            }
          }
          if (t.post.mediaType === "thread") postMeta.tweets = separarTweets(novo.texto).length;
          await prisma.post.update({
            where: { id: t.post.id },
            data: { content: novo.texto, ...(imageUrl ? { imageUrl } : {}), metadata: postMeta as Prisma.InputJsonValue },
          });
          for (const c of produtores.filter((x) => x.postId === t.post.id)) {
            const cMeta = { ...((c.metadata as Record<string, unknown> | null) ?? {}) };
            if (c.agentId === "diana-design") {
              if (!imageUrl) continue;
              cMeta.frase = postMeta.frase;
              await prisma.campaignCard.update({
                where: { id: c.id },
                data: { mediaUrl: imageUrl, content: `Imagem com a frase: "${postMeta.frase}"`, metadata: cMeta as Prisma.InputJsonValue },
              });
            } else {
              if (t.post.mediaType === "thread") cMeta.tweets = postMeta.tweets;
              await prisma.campaignCard.update({ where: { id: c.id }, data: { content: novo.texto, metadata: cMeta as Prisma.InputJsonValue } });
            }
          }
        })
      );
    } finally {
      await encerrarRevisao(idsEmRevisao);
    }

    const nova = await revisarDiaDoVideo(video.id, card.id, { parecerAnterior: parecer, tentativa });
    if (!nova) break;
    historico.push({ tentativa, quem, veredito: nova.veredito, queixa: motivoDoParecer(nova.corpo) });
    parecer = nova.corpo;
    veredito = nova.veredito;
    ordem = nova.postIds;
  }

  const agora = new Date().toISOString();
  // Só REPROVADO que sobrou chega ao cliente como pendência. Ressalva que
  // sobrou (inclusive quando o tempo ou o teto de custo cortou a segunda volta)
  // é aprovação com sugestão, a mesma regra da campanha de texto.
  const resolvido = !veredito.toUpperCase().startsWith("REPROVADO");
  if (resolvido) {
    const correcao: CorrecaoDaVera = {
      estado: "corrigido",
      tentativa,
      maxTentativas: MAX_TENTATIVAS_DA_VERA,
      desde: agora,
      motivo: motivoInicial,
      historico,
    };
    const rotulo = ROTULO_DO_VEREDITO[veredito as keyof typeof ROTULO_DO_VEREDITO] ?? veredito;
    await gravarCorrecaoNoCard(card.id, correcao, {
      content:
        `Veredito: ${rotulo}${tentativa ? ` (depois de ${tentativa === 1 ? "1 correção" : `${tentativa} correções`} do squad)` : ""}\n\n${parecer}` +
        (historico.length ? `\n\n## O que o squad corrigiu sozinho\nMotivo da Vera na primeira revisão: ${motivoInicial}\n${historicoEmTexto(historico)}` : ""),
      metadata: { veredito, revisadoEm: agora, pecasRevisadas: ordem },
    });
    return { estado: "corrigido", tentativas: tentativa, veredito };
  }

  // Sem conserto em 2 tentativas: agora sim o cliente, com o porquê e o que fazer.
  const oQueFazer = oQueFazerDoCliente(parecer, tentativa);
  const motivo = motivoDoParecer(parecer);
  await gravarCorrecaoNoCard(
    card.id,
    { estado: "sem_conserto", tentativa, maxTentativas: MAX_TENTATIVAS_DA_VERA, desde: agora, motivo, oQueFazer, historico },
    {
      content:
        `Veredito: Precisa de você\n\n## Por que chegou até você\n${motivo}\n\n## O que fazer\n${oQueFazer}` +
        (historico.length ? `\n\n## O que o squad já tentou\n${historicoEmTexto(historico)}` : "") +
        `\n\n---\n\n${parecer}`,
      metadata: { veredito, revisadoEm: agora, pecasRevisadas: ordem },
    }
  );
  return { estado: "sem_conserto", tentativas: tentativa, veredito };
}
