import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { custoDaMidia } from "@/lib/credits/estimativa";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { generateImage } from "@/lib/media/nano-banana";
import { desenharComFraseEmCodigo, marcaDaArte, promptDaArteSemTexto } from "@/lib/media/arte-com-frase";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { desenharInfografico, extrairConteudoDoInfografico } from "@/lib/media/infographic";
import { desenharCarrossel, laminasPermitidas, redesQueAceitamCarrossel, roteiroDoCarrossel } from "@/lib/media/carrossel";
import { direcaoDaPeca } from "@/lib/media/direcao-de-arte";
import { MENSAGEM_AGUARDANDO } from "@/lib/modelos-de-arte/identidade";
import { estadoDaIdentidade } from "@/lib/modelos-de-arte/identidade-aprovada";
import { chaveDoGrupo, esperaDaIdentidade, marcarFalha, marcarGerando, semEspera as tirarMarcas } from "@/lib/modelos-de-arte/espera-da-identidade";

/**
 * AS ARTES QUE FICARAM AGUARDANDO A IDENTIDADE (05/10/2026).
 *
 * A trava da esteira (lib/pipeline/executar.ts) entrega o dia com os textos e
 * deixa o card da Diana em "aguardando a sua identidade visual", sem gastar.
 * Quando o cliente aperta "Aprovar e gerar" no book de modelos, este módulo
 * desenha exatamente o que ficou esperando, pelo MESMO caminho da esteira
 * (manchete, cena sem letra, frase composta em código no modelo aprovado), e
 * cobra cada arte só depois de ela existir. Uma geração por dia e formato,
 * com as redes do dia juntas, como a esteira faz.
 *
 * Só posts pendentes (rascunho, agendado ou que falhou), de campanha não
 * arquivada, marcados `metadata.aguardandoIdentidade`.
 *
 * 05/10, noite: a marca vem de QUALQUER caminho (esteira, campanha de um
 * post, "pôr algo aqui", semana do vídeo, chat do card, refazer peça; ver
 * lib/modelos-de-arte/espera-da-identidade.ts), inclusive o post avulso sem
 * campanha e o carrossel. A geração roda DEPOIS da resposta ao clique
 * (`after()` na rota): primeiro cada post é marcado "gerando" (o quadro
 * mostra "o squad está fazendo"), depois cada grupo sai ou recebe a falha com
 * o motivo, e o quadro oferece "Tentar de novo".
 */

const PENDENTE = ["draft", "scheduled", "failed"];
const GERA_ARTE = ["image", "infographic", "carousel"];

export interface ArteAguardando {
  postId: string;
  runId: string | null;
  dayOfWeek: number | null;
  platform: string;
  mediaType: string;
}

/**
 * As artes que esperam. `incluirGerando` traz também as que estão sendo
 * desenhadas agora (para a tela contar); sem ele, a lista é o que o próximo
 * "Aprovar e gerar" pega, e a arte em geração fica de fora para o clique
 * repetido não pagar duas vezes a mesma peça.
 */
export async function artesAguardandoIdentidade(projectId: string, opcoes?: { incluirGerando?: boolean }): Promise<ArteAguardando[]> {
  const posts = await prisma.post.findMany({
    where: {
      projectId,
      status: { in: PENDENTE },
      mediaType: { in: GERA_ARTE },
      imageUrl: null,
      metadata: { path: ["aguardandoIdentidade"], equals: true },
      OR: [{ runId: null }, { run: { archived: false } }],
    },
    select: { id: true, runId: true, dayOfWeek: true, platform: true, mediaType: true, metadata: true },
    take: 80,
  });
  return posts
    .filter((p) => opcoes?.incluirGerando || esperaDaIdentidade({ imageUrl: null, metadata: p.metadata })?.estado !== "gerando")
    .map((p) => ({ postId: p.id, runId: p.runId, dayOfWeek: p.dayOfWeek, platform: p.platform, mediaType: p.mediaType ?? "image" }));
}

/** Um grupo por campanha e dia: as redes do dia recebem a mesma arte, cada uma no recorte dela. O avulso é um grupo só dele. */
export function agruparPorDia(artes: ArteAguardando[]): ArteAguardando[][] {
  const grupos = new Map<string, ArteAguardando[]>();
  for (const a of artes) {
    const chave = chaveDoGrupo(a);
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return [...grupos.values()];
}

/** O custo em créditos de gerar os grupos. */
export function custoDosGrupos(grupos: ArteAguardando[][], laminasDoCarrossel = 5): number {
  return grupos.reduce((s, g) => s + custoDaMidia(g[0].mediaType, g[0].mediaType === "carousel" ? laminasDoCarrossel : undefined), 0);
}

type ConfigDaCampanha = { mediaStyle?: string | null; laminasDoCarrossel?: number | null; funnelStage?: "tofu" | "mofu" | "bofu" } | null;

/** Tira as marcas de espera do metadata do post (e do card). */
function semEspera(meta: Prisma.JsonValue | null): Prisma.InputJsonValue {
  return tirarMarcas(meta) as Prisma.InputJsonValue;
}

/** Os cards da Diana do dia do grupo, que acompanham o estado dos posts. */
async function cardsDoGrupo(projectId: string, base: ArteAguardando) {
  if (!base.runId || !base.dayOfWeek) return [];
  return prisma.campaignCard.findMany({
    where: { projectId, runId: base.runId, dayOfWeek: base.dayOfWeek, cardType: "media" },
    select: { id: true, content: true, metadata: true },
  });
}

/** Marca os posts (e o card da Diana) do grupo como "gerando": o quadro mostra "o squad está fazendo". */
async function marcarGrupoGerando(projectId: string, grupo: ArteAguardando[]): Promise<void> {
  const agora = new Date();
  for (const a of grupo) {
    const p = await prisma.post.findUnique({ where: { id: a.postId }, select: { metadata: true } });
    if (p) await prisma.post.update({ where: { id: a.postId }, data: { metadata: marcarGerando(p.metadata, agora) as Prisma.InputJsonValue } }).catch(() => {});
  }
  for (const c of await cardsDoGrupo(projectId, grupo[0])) {
    await prisma.campaignCard.update({ where: { id: c.id }, data: { metadata: marcarGerando(c.metadata, agora) as Prisma.InputJsonValue } }).catch(() => {});
  }
}

/** Grava a falha com o motivo nos posts e no card: a espera continua, e o quadro oferece "Tentar de novo". */
async function marcarGrupoFalhou(projectId: string, grupo: ArteAguardando[], motivo: string): Promise<void> {
  for (const a of grupo) {
    const p = await prisma.post.findUnique({ where: { id: a.postId }, select: { metadata: true } });
    if (p) await prisma.post.update({ where: { id: a.postId }, data: { metadata: marcarFalha(p.metadata, motivo) as Prisma.InputJsonValue } }).catch(() => {});
  }
  for (const c of await cardsDoGrupo(projectId, grupo[0])) {
    await prisma.campaignCard.update({ where: { id: c.id }, data: { metadata: marcarFalha(c.metadata, motivo) as Prisma.InputJsonValue } }).catch(() => {});
  }
}

async function gerarGrupo(args: { projectId: string; userId: string }, grupo: ArteAguardando[], nicho: string | null): Promise<number> {
  const base = grupo[0];
  const runId = base.runId ?? undefined;
  const posts = await prisma.post.findMany({
    where: { id: { in: grupo.map((a) => a.postId) }, projectId: args.projectId },
    select: { id: true, platform: true, content: true, imagePrompt: true, mediaType: true, metadata: true },
  });
  if (!posts.length) return 0;
  const texto = posts[0].content;
  const redes = [...new Set(posts.map((p) => p.platform))];
  const run = runId ? await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { config: true } }).catch(() => null) : null;
  const config = (run?.config ?? null) as ConfigDaCampanha;
  const direcao =
    runId && base.dayOfWeek
      ? await direcaoDaPeca({ projectId: args.projectId, runId, dayOfWeek: base.dayOfWeek, infografico: base.mediaType === "infographic", preferido: config?.mediaStyle }).catch(() => null)
      : null;
  const estiloVisual = direcao?.styleHint ?? posts[0].imagePrompt ?? "";
  // A marca lida AGORA: letra e papéis recém-aprovados, e a trava aberta.
  const marca = await marcaDaArte(args.projectId, { runId });
  const ctx = { projectId: args.projectId, runId, operation: "campanha_imagem" };

  let principal: string | undefined;
  let porRede: Record<string, string> = {};
  let laminas: number | undefined;

  // O DIA DE VÍDEO (05/10): a peça derivada do vídeo (origem "video") sai pelo
  // MESMO caminho da semana do vídeo (`arteDoDia`): a frase gravada no post
  // (nunca truncada), o quadro do vídeo só como referência, o modelo do book
  // aprovado. Aqui a trava já está aberta.
  const metaDoVideo = posts[0].metadata as { origem?: string; frase?: string; slides?: unknown; videoJobId?: string } | null;
  if (metaDoVideo?.origem === "video") {
    const { arteDoDia, tetoDePalavrasDoModelo } = await import("@/lib/media/pecas-da-semana");
    const { fraseGarantida } = await import("@/lib/media/frase-da-arte");
    const { formatoDaPeca } = await import("@/lib/media/formatos-das-redes");
    const video = { id: metaDoVideo.videoJobId, projectId: args.projectId, project: { niche: nicho } };
    const ctxDoVideo = { projectId: args.projectId, runId: runId ?? "" };
    if (base.mediaType === "carousel") {
      const slides = Array.isArray(metaDoVideo.slides) ? metaDoVideo.slides.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
      if (!slides.length) throw new Error("o carrossel do vídeo não tem as frases das lâminas gravadas");
      const formato = formatoDaPeca(posts[0].platform, "carousel");
      const urls = await Promise.all(slides.map((frase) => arteDoDia(video, frase, estiloVisual, formato, ctxDoVideo, slides[0], marca)));
      principal = urls.join("|");
      porRede = Object.fromEntries(redes.map((r) => [r, principal!]));
      laminas = urls.length;
    } else {
      const bruta = typeof metaDoVideo.frase === "string" && metaDoVideo.frase.trim() ? metaDoVideo.frase : texto.split(/(?<=[.!?])\s/)[0];
      const formatoPrincipal = formatoDaPeca(posts[0].platform, "image");
      const frase = await fraseGarantida({ bruta, maxPalavras: await tetoDePalavrasDoModelo(marca, bruta, formatoPrincipal), contexto: texto, usage: { projectId: args.projectId, runId } });
      // Uma geração por proporção; as redes da mesma proporção recebem a mesma arte.
      const porProporcao = new Map<string, Promise<string>>();
      for (const p of posts) {
        const f = formatoDaPeca(p.platform, "image");
        if (!porProporcao.has(f.proporcao)) porProporcao.set(f.proporcao, arteDoDia(video, frase, estiloVisual, f, ctxDoVideo, undefined, marca));
        porRede[p.platform] = await porProporcao.get(f.proporcao)!;
      }
      principal = porRede[posts[0].platform];
      for (const p of posts) await prisma.post.update({ where: { id: p.id }, data: { metadata: { ...((p.metadata as Record<string, unknown> | null) ?? {}), frase } as Prisma.InputJsonValue } }).catch(() => {});
    }
  } else if (base.mediaType === "carousel") {
    const aceitam = redesQueAceitamCarrossel(redes);
    const teto = laminasPermitidas(aceitam.length ? aceitam : ["instagram"]);
    const pedidas = Math.min(config?.laminasDoCarrossel ?? 5, teto || 5);
    const chave = `${runId ?? "avulso"}-identidade-${base.dayOfWeek ?? 0}`;
    const roteiro = await roteiroDoCarrossel({ textoDoPost: texto, laminas: pedidas, estiloVisual, nicho, projectId: args.projectId, runId, chave });
    const carrossel = await desenharCarrossel({ roteiro, estiloVisual, permitirGemini: true, projectId: args.projectId, runId, chave, marca });
    principal = carrossel.urls.join("|");
    porRede = Object.fromEntries(redes.map((r) => [r, principal!]));
    laminas = carrossel.urls.length;
  } else if (base.mediaType === "infographic") {
    const chave = process.env.GEMINI_API_KEY ?? "";
    const conteudo = await extrairConteudoDoInfografico(texto, nicho ?? "negocios", chave, { funil: config?.funnelStage, projectId: args.projectId });
    const arte = await produzirArtePorRede({
      redes,
      contentType: "infographic",
      promptBase: "",
      textoDoPost: texto,
      projectId: args.projectId,
      runId,
      desenhar: async (_p, proporcao) => {
        const url = await desenharInfografico(conteudo, chave, proporcao, { estilo: direcao?.estilo.prompt ?? "", paleta: direcao?.paleta ?? "", marca });
        if (!url) throw new Error("o infográfico não foi montado");
        return url;
      },
    });
    principal = arte.principal;
    porRede = arte.porRede;
  } else {
    const peca = await mancheteDaPeca({ textoDoPost: texto, estiloVisual, nicho, projectId: args.projectId, runId });
    const arte = await produzirArtePorRede({
      redes,
      contentType: "image",
      promptBase: promptDaArteSemTexto({ visual: peca.visual, estilo: estiloVisual || undefined, marca }),
      textoEsperado: [peca.manchete],
      textoDoPost: texto,
      projectId: args.projectId,
      runId,
      desenhar: desenharComFraseEmCodigo(peca.manchete, { ...marca, contexto: texto }, (prompt, proporcao) => generateImage(prompt, proporcao, "hd", ctx)),
      desenharAlternativo: desenharComFraseEmCodigo(peca.manchete, { ...marca, contexto: texto }, (prompt, proporcao) => generateImage(prompt, proporcao, "hd", ctx, { outroModelo: true })),
    });
    principal = arte.principal;
    porRede = arte.porRede;
  }
  if (!principal && !Object.keys(porRede).length) throw new Error("a arte não saiu");

  // Cobra só depois de a arte existir (o fecho da campanha cobrou só o texto).
  try {
    await debitar({
      userId: args.userId,
      quantidade: custoDaMidia(base.mediaType, laminas),
      operation: "arte_apos_identidade",
      projectId: args.projectId,
      refId: `${base.postId}:${Date.now()}`,
      note: "Arte gerada depois de o cliente aprovar a identidade visual",
    });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) throw new Error("o saldo acabou no meio");
    throw e;
  }

  let gravadas = 0;
  for (const p of posts) {
    const nova = porRede[p.platform] ?? principal;
    if (!nova) continue;
    await prisma.post.update({ where: { id: p.id }, data: { imageUrl: nova, metadata: semEspera(p.metadata) } });
    gravadas++;
  }
  // O card da Diana do dia deixa de esperar e mostra a arte.
  if (principal) {
    for (const c of await cardsDoGrupo(args.projectId, base)) {
      const conteudo = (c.content ?? "").startsWith(MENSAGEM_AGUARDANDO) ? (c.content ?? "").split("\n\nPrompt: ")[1] ?? "" : c.content;
      await prisma.campaignCard.update({ where: { id: c.id }, data: { mediaUrl: principal, content: conteudo, metadata: semEspera(c.metadata) } });
    }
  }
  return gravadas;
}

const FRASE_SEM_ESPERA = "Nenhuma arte estava esperando: as próximas campanhas já saem com a identidade aprovada.";

/**
 * O PRIMEIRO PASSO do "Aprovar e gerar", síncrono e rápido: confere a
 * identidade e o saldo, e marca tudo o que esperava como "gerando". A rota
 * responde com isto na hora; o desenho (`gerarGruposMarcados`) roda depois da
 * resposta. Devolve os grupos para o segundo passo.
 */
export async function iniciarGeracaoDasArtes(args: { projectId: string; userId: string }): Promise<{ grupos: ArteAguardando[][]; frase: string }> {
  const estado = await estadoDaIdentidade(args.projectId);
  if (!estado.aprovada) throw new Error(`${MENSAGEM_AGUARDANDO}: aprove modelo, letra e cores antes de gerar.`);
  const grupos = agruparPorDia(await artesAguardandoIdentidade(args.projectId));
  if (!grupos.length) return { grupos, frase: FRASE_SEM_ESPERA };
  const disponivel = await saldo(args.userId);
  const custo = custoDosGrupos(grupos);
  if (disponivel < custoDaMidia(grupos[0][0].mediaType)) throw new Error(`faltam créditos: gerar as ${grupos.length} arte(s) custa ${custo} e há ${disponivel}`);
  for (const g of grupos) await marcarGrupoGerando(args.projectId, g);
  return {
    grupos,
    frase: grupos.length === 1 ? "1 arte está sendo gerada e cai no quadro em alguns minutos." : `${grupos.length} artes estão sendo geradas e caem no quadro em alguns minutos.`,
  };
}

/** O SEGUNDO PASSO: desenha os grupos já marcados, dois de cada vez. Falha vira motivo gravado, nunca "fazendo" eterno. */
export async function gerarGruposMarcados(args: { projectId: string; userId: string }, grupos: ArteAguardando[][]): Promise<{ feitas: number; falhas: number; total: number; frase: string }> {
  if (!grupos.length) return { feitas: 0, falhas: 0, total: 0, frase: FRASE_SEM_ESPERA };
  const projeto = await prisma.project.findUniqueOrThrow({ where: { id: args.projectId }, select: { niche: true } });
  let feitas = 0;
  let falhas = 0;
  // Duas de cada vez: cada arte leva até 90 s.
  const fila = [...grupos];
  const trabalhar = async () => {
    for (let g = fila.shift(); g; g = fila.shift()) {
      try {
        await gerarGrupo(args, g, projeto.niche);
        feitas++;
      } catch (e) {
        falhas++;
        const motivo = e instanceof Error ? e.message : String(e);
        console.warn(`[identidade][gerar] ${g[0].postId}: ${motivo}`);
        await marcarGrupoFalhou(args.projectId, g, motivo).catch(() => {});
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar()]);
  return {
    feitas,
    falhas,
    total: grupos.length,
    frase: `${feitas} ${feitas === 1 ? "arte gerada" : "artes geradas"} com a identidade aprovada${falhas ? `; ${falhas} não ${falhas === 1 ? "saiu" : "saíram"} e ${falhas === 1 ? "continua" : "continuam"} aguardando, sem cobrança` : ""}.`,
  };
}

/**
 * Os dois passos de uma vez, para quem pode esperar (scripts, testes de
 * ponta a ponta). A rota não usa: ela responde depois do primeiro passo.
 */
export async function gerarArtesAguardando(args: { projectId: string; userId: string }): Promise<{ feitas: number; falhas: number; total: number; frase: string }> {
  const { grupos } = await iniciarGeracaoDasArtes(args);
  return gerarGruposMarcados(args, grupos);
}
