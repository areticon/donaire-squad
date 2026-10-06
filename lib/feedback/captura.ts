import { prisma } from "@/lib/db/prisma";
import { jevLigado } from "@/lib/jev/cliente";
import { classificarFeedback, type GrupoAberto } from "@/lib/feedback/classificar";
import { JANELA_DA_REPESCAGEM_MS, modulosDoTipoDeCard, precisaDeRepescagem, semEmail, tituloDoGrupo, type ContextoDoFeedback, type Origem } from "@/lib/feedback/regras";

/**
 * A CAPTURA DO FEEDBACK (06/10/2026): todo pedido do chat do card e todo
 * chamado de suporte viram uma linha em `feedbacks_do_produto`, classificada
 * e agrupada pelo JEV em seguida.
 *
 * NUNCA TRAVA O CHAT: quem chama dispara `void capturar...()` (ou dentro de
 * `after()`); tudo aqui engole o próprio erro e vira log. Sem a tabela (a
 * migração ainda não aplicada), o chat continua igual.
 *
 * Só servidor: toca o banco e o JEV.
 */

type Captura = {
  origem: Origem;
  userId: string;
  texto: string;
  projectId?: string | null;
  cardId?: string | null;
  postId?: string | null;
  videoJobId?: string | null;
  chamadoId?: string | null;
  contexto?: ContextoDoFeedback | null;
};

/** Os grupos abertos com dois exemplos cada, para o JEV comparar. */
async function gruposAbertos(): Promise<GrupoAberto[]> {
  const grupos = await prisma.grupoDeFeedback.findMany({
    where: { situacao: "aberto" },
    orderBy: { atualizadoEm: "desc" },
    take: 40,
    select: { id: true, titulo: true, classificacao: true, feedbacks: { orderBy: { criadoEm: "desc" }, take: 2, select: { texto: true } } },
  });
  return grupos.map((g) => ({ id: g.id, titulo: g.titulo, classificacao: g.classificacao, exemplos: g.feedbacks.map((f) => f.texto) }));
}

/** Grava o feedback e classifica. Devolve o id, ou null quando não gravou. */
export async function capturarFeedback(c: Captura): Promise<string | null> {
  const texto = c.texto.trim().slice(0, 4000);
  if (!texto || !c.userId) return null;
  let id: string;
  try {
    const criado = await prisma.feedbackDoProduto.create({
      data: {
        origem: c.origem,
        userId: c.userId,
        texto,
        projectId: c.projectId ?? null,
        cardId: c.cardId ?? null,
        postId: c.postId ?? null,
        videoJobId: c.videoJobId ?? null,
        chamadoId: c.chamadoId ?? null,
        contexto: (c.contexto ?? null) as never,
      },
      select: { id: true },
    });
    id = criado.id;
  } catch (e) {
    console.warn("[feedback] não gravou (ignorado):", e instanceof Error ? e.message : e);
    return null;
  }

  await classificarEGravar({ id, texto, origem: c.origem, contexto: c.contexto ?? null, projectId: c.projectId ?? null });
  return id;
}

/**
 * Classifica pelo JEV e grava (classe, confiança, grupo). Com o JEV
 * desligado ou falhando, nada é gravado e `classificadoEm` fica nulo: a
 * repescagem tenta de novo. O "não sei" do JEV grava a hora da tentativa.
 * Devolve a classe gravada, "nao-sei" ou null (não tentou ou falhou).
 */
async function classificarEGravar(f: { id: string; texto: string; origem: Origem; contexto: ContextoDoFeedback | null; projectId: string | null }): Promise<string | "nao-sei" | null> {
  try {
    if (!jevLigado()) return null;
    const abertos = await gruposAbertos();
    const r = await classificarFeedback({ feedback: { texto: f.texto, origem: f.origem, contexto: f.contexto }, gruposAbertos: abertos, projectId: f.projectId });
    if (!r.classificacao) {
      // Sem confiança é "não sei" de verdade; confiança nula é o JEV que não respondeu (fica para a repescagem).
      if (r.confianca === null) return null;
      await prisma.feedbackDoProduto.update({ where: { id: f.id }, data: { confianca: r.confianca, classificadoEm: new Date() } });
      return "nao-sei";
    }
    let grupoId: string | null = null;
    if (r.grupo === "novo" || !r.grupo) {
      const g = await prisma.grupoDeFeedback.create({ data: { titulo: tituloDoGrupo(f.texto), classificacao: r.classificacao }, select: { id: true } });
      grupoId = g.id;
    } else {
      grupoId = r.grupo;
      await prisma.grupoDeFeedback.update({ where: { id: grupoId }, data: { atualizadoEm: new Date() } }).catch(() => {});
    }
    await prisma.feedbackDoProduto.update({
      where: { id: f.id },
      data: { classificacao: r.classificacao, confianca: r.confianca, grupoId, classificadoEm: new Date() },
    });
    return r.classificacao;
  } catch (e) {
    console.warn("[feedback] classificação não gravou (fica para a repescagem):", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * A REPESCAGEM DO FEEDBACK SEM CLASSE (06/10, tarde): o feedback que ficou
 * sem classificação volta para o JEV (nunca para o Claude). Quem entra está
 * em `precisaDeRepescagem` (regras.ts): o que o JEV nunca classificou (estava
 * desligado ou falhou) e o "não sei" da captura, uma vez, depois que os
 * grupos cresceram. Roda no cron de 5 min, com teto por passada.
 */
export async function repescarFeedbacksSemClasse(o: { teto?: number; agora?: Date } = {}): Promise<{ tentados: number; classificados: number; naoSei: number; falhas: number }> {
  const agora = o.agora ?? new Date();
  const saida = { tentados: 0, classificados: 0, naoSei: 0, falhas: 0 };
  if (!jevLigado()) return saida;
  const candidatos = await prisma.feedbackDoProduto
    .findMany({
      where: { classificacao: null, criadoEm: { gte: new Date(agora.getTime() - JANELA_DA_REPESCAGEM_MS) } },
      orderBy: { criadoEm: "asc" },
      take: 100,
      select: { id: true, texto: true, origem: true, contexto: true, projectId: true, criadoEm: true, classificadoEm: true },
    })
    .catch((e) => {
      console.warn("[feedback] repescagem não leu a fila (ignorado):", e instanceof Error ? e.message : e);
      return [];
    });
  for (const f of candidatos.filter((x) => precisaDeRepescagem(x, agora)).slice(0, o.teto ?? 20)) {
    saida.tentados++;
    const r = await classificarEGravar({ id: f.id, texto: f.texto, origem: f.origem === "chamado" ? "chamado" : "chat", contexto: (f.contexto as ContextoDoFeedback | null) ?? null, projectId: f.projectId });
    if (r === "nao-sei") {
      saida.naoSei++;
    } else if (r) {
      saida.classificados++;
    } else {
      saida.falhas++;
      // A hora da tentativa fica gravada: o mesmo feedback só volta depois do intervalo (nada de laço a cada 5 min).
      await prisma.feedbackDoProduto.update({ where: { id: f.id }, data: { classificadoEm: agora } }).catch(() => {});
    }
  }
  return saida;
}

type Mensagem = { role: string; content: string; timestamp?: string };

/**
 * O GANCHO DO CHAT DO CARD. Lê do card o que o cliente tinha aprovado antes
 * (texto da peça, frase da arte, lâminas, cor da marca, estilo de vídeo) e o
 * tipo da peça, e grava o pedido com a resposta da plataforma. Sem
 * `resposta`, usa a última mensagem do assistente gravada no chat depois de
 * `desde` (a rota chama assim para os caminhos que respondem na hora).
 */
export async function capturarFeedbackDoChatDoCard(a: {
  cardId: string;
  userId: string;
  mensagem: string;
  resposta?: string | null;
  resultado?: "feito" | "parte" | "falhou" | null;
  acoes?: string[] | null;
  /** ISO: só conta resposta do assistente gravada depois disto. */
  desde?: string | null;
}): Promise<void> {
  try {
    const card = await prisma.campaignCard.findUnique({
      where: { id: a.cardId },
      select: {
        id: true,
        projectId: true,
        postId: true,
        cardType: true,
        mediaType: true,
        content: true,
        metadata: true,
        chatHistory: true,
        project: { select: { colorPalette: true, videoStyle: true } },
      },
    });
    if (!card) return;
    const meta = (card.metadata as Record<string, unknown> | null) ?? {};
    const historico = Array.isArray(card.chatHistory) ? (card.chatHistory as Mensagem[]) : [];
    let resposta = a.resposta ?? null;
    if (resposta === null) {
      const ultima = [...historico].reverse().find((m) => m.role === "assistant" && (!a.desde || !m.timestamp || m.timestamp >= a.desde));
      resposta = ultima?.content ?? null;
    }
    const videoJobId = typeof meta.videoJobId === "string" ? meta.videoJobId : null;
    // O PLANO DO VÍDEO QUE O CLIENTE APROVOU (06/10): as linhas da tela de
    // roteiro do completo ou do corte deste card. É o que separa "a letra saiu
    // vermelha e eu queria rosa" com a linha dizendo vermelho (atendido como
    // pedido) de um erro do produto. Import tardio: o roteiro puxa a esteira
    // inteira e não pode entrar no ciclo do chat.
    let planoDoVideo: string | null = null;
    if (videoJobId) {
      try {
        const { planoAprovadoDoVideo } = await import("@/lib/media/roteiro-da-edicao");
        planoDoVideo = await planoAprovadoDoVideo(videoJobId, {
          completo: meta.completo === true || card.cardType === "video_completo",
          trechoIndice: typeof meta.trechoIndice === "number" ? meta.trechoIndice : null,
        });
      } catch (e) {
        console.warn("[feedback] plano do vídeo não lido (segue sem):", e instanceof Error ? e.message : e);
      }
    }
    const slides = Array.isArray(meta.slides) ? (meta.slides as unknown[]).filter((s): s is string => typeof s === "string") : [];
    const tipoDePeca =
      card.cardType === "video_clip" ? "corte de vídeo"
      : card.cardType === "video_completo" ? "vídeo completo"
      : card.mediaType === "video" ? "vídeo"
      : card.cardType === "media" ? (slides.length > 1 ? "carrossel" : "imagem")
      : card.cardType === "publish" ? "publicação do dia"
      : "post de texto";
    const contexto: ContextoDoFeedback = {
      tipoDePeca,
      rede: typeof meta.platform === "string" ? meta.platform : null,
      estilo: (typeof meta.modeloDaArte === "string" ? meta.modeloDaArte : null) ?? card.project?.videoStyle ?? null,
      oQueAPlataformaFez: a.acoes ?? null,
      respostaDaPlataforma: resposta ? semEmail(resposta).slice(0, 1200) : null,
      resultado: a.resultado ?? null,
      aprovadoAntes: {
        textoDaPeca: card.content ? semEmail(card.content).slice(0, 600) : null,
        fraseDaArte: typeof meta.frase === "string" ? meta.frase : null,
        laminas: slides.length ? slides.join(" | ").slice(0, 600) : null,
        corDaMarca: card.project?.colorPalette ?? null,
        estiloDeVideo: card.project?.videoStyle ?? null,
        planoDoVideo: planoDoVideo ? semEmail(planoDoVideo) : null,
      },
      modulos: modulosDoTipoDeCard(card.cardType, card.mediaType),
    };
    await capturarFeedback({
      origem: "chat",
      userId: a.userId,
      texto: a.mensagem,
      projectId: card.projectId,
      cardId: card.id,
      postId: card.postId,
      videoJobId,
      contexto,
    });
  } catch (e) {
    console.warn("[feedback] gancho do chat falhou (ignorado):", e instanceof Error ? e.message : e);
  }
}

/** O GANCHO DO CHAMADO: todo chamado vira feedback; o de "melhoria" é o chamado direto no Dev. */
export async function capturarFeedbackDoChamado(a: {
  chamadoId: string;
  userId: string;
  texto: string;
  categoria: string;
  codigo?: string | null;
  projectId?: string | null;
  postId?: string | null;
  videoId?: string | null;
  pagina?: string | null;
}): Promise<void> {
  try {
    await capturarFeedback({
      origem: "chamado",
      userId: a.userId,
      texto: a.texto,
      projectId: a.projectId ?? null,
      postId: a.postId ?? null,
      videoJobId: a.videoId ?? null,
      chamadoId: a.chamadoId,
      contexto: {
        tipoDePeca: "chamado",
        categoriaDoChamado: a.categoria,
        codigo: a.codigo ?? null,
        oQueAPlataformaFez: a.pagina ? [`tela: ${a.pagina}`] : null,
        modulos: a.videoId ? modulosDoTipoDeCard("video_clip") : a.postId ? modulosDoTipoDeCard("media") : ["app/(app)", "lib/suporte"],
      },
    });
  } catch (e) {
    console.warn("[feedback] gancho do chamado falhou (ignorado):", e instanceof Error ? e.message : e);
  }
}
