import { prisma } from "@/lib/db/prisma";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { custoDaMidia } from "@/lib/credits/estimativa";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { generateImage } from "@/lib/media/nano-banana";
import { desenharComFraseEmCodigo, marcaDaArte, promptDaArteSemTexto } from "@/lib/media/arte-com-frase";
import { modeloGravadoNosPosts } from "@/lib/estilo-dos-posts/tipos";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { desenharInfografico, extrairConteudoDoInfografico } from "@/lib/media/infographic";
import { arteDoDia } from "@/lib/media/pecas-da-semana";
import { direcaoDaPeca } from "@/lib/media/direcao-de-arte";
import { formatoDaPeca } from "@/lib/media/formatos-das-redes";
import { frasesDoCarrossel } from "@/lib/media/pedido-do-card";
import { CREDIT_COSTS } from "@/lib/credits/tabela";
import { laminasDaUrl, redesenharLaminas } from "@/lib/vera/laminas";
import type { Escrita } from "@/lib/vera/pedidos";

/**
 * REGERAR AS ARTES PENDENTES DEPOIS DE UMA MUDANÇA DE MARCA (04/10/2026).
 *
 * Pedido do Bruno: "coloquei um vermelho que não gostei, quero um escarlate
 * forte; só que vai precisar regerar as artes todas". Trocar a cor no setup só
 * vale para o que nascer depois; as artes do quadro que ainda não foram ao ar
 * continuam com a cor velha. Aqui elas são desenhadas de novo, com a marca
 * lida NA HORA (a cor nova já gravada), o mesmo texto da peça e o mesmo
 * caminho de arte da esteira (frase em código, cena sem letra, infográfico
 * montado com os dados do texto).
 *
 * Só PENDENTES: rascunho, agendada ou que falhou. O que está no ar não muda.
 * Uma geração por DIA E FORMATO, com as redes do dia juntas: é o mesmo que a
 * esteira faz (cada rede recebe o recorte dela), e cobra uma vez por dia, não
 * uma por rede.
 */

/**
 * Imagem, infográfico e carrossel (05/10/2026: o carrossel entrou). O
 * carrossel NÃO passa pelo caminho da arte única, que trocaria três lâminas
 * por uma imagem: cada lâmina é desenhada de novo com a frase dela, pelo mesmo
 * caminho da esteira (arteDoDia), e o carrossel volta com o mesmo número de
 * lâminas (lib/vera/laminas.ts).
 */
const GERA_ARTE = ["image", "infographic", "carousel"];
const PENDENTE = ["draft", "scheduled", "failed"];

export type ArtePendente = { postId: string; runId: string | null; dayOfWeek: number | null; platform: string; mediaType: string; laminas: number };

export async function artesPendentes(projectId: string): Promise<ArtePendente[]> {
  const posts = await prisma.post.findMany({
    where: {
      projectId,
      status: { in: PENDENTE },
      mediaType: { in: GERA_ARTE },
      imageUrl: { not: null },
      OR: [{ runId: null }, { run: { archived: false } }],
    },
    select: { id: true, runId: true, dayOfWeek: true, platform: true, mediaType: true, imageUrl: true },
    take: 60,
  });
  return posts
    .filter((p) => (p.imageUrl ?? "").length > 10)
    .map((p) => ({
      postId: p.id,
      runId: p.runId,
      dayOfWeek: p.dayOfWeek,
      platform: p.platform,
      mediaType: p.mediaType ?? "image",
      laminas: laminasDaUrl(p.imageUrl).length,
    }))
    // Carrossel com uma lâmina só não tem como ser refeito lâmina a lâmina, e
    // pelo caminho da arte única deixaria de ser carrossel: fica como está.
    .filter((a) => a.mediaType !== "carousel" || a.laminas > 1);
}

/** Quantas artes de cada formato, para a Vera contar ao cliente antes de ele decidir. */
export function resumoDasArtes(grupos: ArtePendente[][]): string {
  let imagens = 0;
  let infograficos = 0;
  let carrosseis = 0;
  let laminas = 0;
  for (const g of grupos) {
    if (g[0].mediaType === "carousel") {
      carrosseis++;
      laminas += Math.max(...g.map((a) => a.laminas));
    } else if (g[0].mediaType === "infographic") infograficos++;
    else imagens++;
  }
  const partes = [
    imagens ? `${imagens} ${imagens === 1 ? "imagem" : "imagens"}` : "",
    infograficos ? `${infograficos} ${infograficos === 1 ? "infográfico" : "infográficos"}` : "",
    carrosseis ? `${carrosseis} ${carrosseis === 1 ? "carrossel" : "carrosséis"} (${laminas} lâminas no total, cada um com o mesmo número de lâminas de hoje)` : "",
  ].filter(Boolean);
  return partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** Um grupo = um dia e um formato; uma geração atende todas as redes dele. */
export function agruparArtes(artes: ArtePendente[]): ArtePendente[][] {
  const grupos = new Map<string, ArtePendente[]>();
  for (const a of artes) {
    const chave = a.runId && a.dayOfWeek ? `${a.runId}:${a.dayOfWeek}:${a.mediaType}` : `solto:${a.postId}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return [...grupos.values()];
}

export function custoDasArtes(grupos: ArtePendente[][]): number {
  return grupos.reduce((s, g) => s + custoDaMidia(g[0].mediaType, Math.max(...g.map((a) => a.laminas))), 0);
}

/** Roda a regeração. Devolve as escritas (para o desfazer) e a frase do que aconteceu. */
export async function regerarArtes(args: { projectId: string; userId: string; postIds: string[] }): Promise<{ escritas: Escrita[]; frase: string }> {
  const todas = await artesPendentes(args.projectId);
  const alvo = todas.filter((a) => args.postIds.includes(a.postId));
  if (!alvo.length) return { escritas: [], frase: "Nenhuma arte pendente para refazer: as peças mudaram de estado." };
  const grupos = agruparArtes(alvo);
  const custo = custoDasArtes(grupos);
  const disponivel = await saldo(args.userId);
  if (disponivel < custo) throw new Error(`faltam ${custo - disponivel} créditos (custa ${custo}, há ${disponivel})`);

  const projeto = await prisma.project.findUniqueOrThrow({ where: { id: args.projectId }, select: { niche: true } });
  const marca = await marcaDaArte(args.projectId);
  const escritas: Escrita[] = [];
  let feitas = 0;
  let falhas = 0;

  // Três de cada vez: cada geração leva até 90 s, e uma fila de uma por vez
  // passaria do teto da função com meia dúzia de dias.
  const fila = [...grupos];
  const trabalhar = async () => {
    for (let g = fila.shift(); g; g = fila.shift()) {
      try {
        escritas.push(...(await regerarGrupo(args, g, marca, projeto.niche)));
        feitas++;
      } catch (e) {
        falhas++;
        console.warn(`[vera][regerar] ${g[0].postId}: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);

  return {
    escritas,
    frase: `${feitas} ${feitas === 1 ? "arte refeita" : "artes refeitas"} com a marca nova${falhas ? `; ${falhas} não ${falhas === 1 ? "saiu" : "saíram"} e ${falhas === 1 ? "ficou" : "ficaram"} como estavam, sem cobrança` : ""}.`,
  };
}

async function regerarGrupo(
  args: { projectId: string; userId: string },
  grupo: ArtePendente[],
  marca: Awaited<ReturnType<typeof marcaDaArte>>,
  nicho: string | null
): Promise<Escrita[]> {
  if (grupo[0].mediaType === "carousel") return regerarCarrossel(args, grupo);
  const ids = grupo.map((a) => a.postId);
  const posts = await prisma.post.findMany({
    where: { id: { in: ids }, projectId: args.projectId },
    select: { id: true, platform: true, content: true, imagePrompt: true, imageUrl: true, mediaType: true, runId: true, dayOfWeek: true },
  });
  if (!posts.length) return [];
  const base = posts[0];
  const ehInfografico = base.mediaType === "infographic";
  const conteudo =
    ehInfografico && process.env.GEMINI_API_KEY
      ? await extrairConteudoDoInfografico(base.content, nicho ?? "negocios", process.env.GEMINI_API_KEY)
      : null;
  const peca = conteudo
    ? null
    : await mancheteDaPeca({
        textoDoPost: base.content,
        estiloVisual: base.imagePrompt ?? "",
        nicho,
        projectId: args.projectId,
        runId: base.runId ?? undefined,
      });
  const arte = await produzirArtePorRede({
    redes: [...new Set(posts.map((p) => p.platform))],
    contentType: ehInfografico ? "infographic" : "image",
    promptBase: peca ? promptDaArteSemTexto({ visual: peca.visual, estilo: base.imagePrompt ?? undefined, marca }) : "",
    textoEsperado: peca ? [peca.manchete] : undefined,
    textoDoPost: base.content,
    projectId: args.projectId,
    runId: base.runId ?? undefined,
    desenhar: conteudo
      ? async (_p, proporcao) => {
          const url = await desenharInfografico(conteudo, "", proporcao, { estilo: "", paleta: "", marca });
          if (!url) throw new Error("o infográfico não foi montado");
          return url;
        }
      : desenharComFraseEmCodigo(peca!.manchete, marca, (prompt, proporcao) => generateImage(prompt, proporcao, "hd")),
  });
  if (!arte.principal && !Object.keys(arte.porRede).length) throw new Error("a arte não saiu");

  // Cobra só depois de a arte existir: arte que não saiu não custa nada.
  try {
    await debitar({
      userId: args.userId,
      quantidade: custoDaMidia(base.mediaType, Math.max(...grupo.map((a) => a.laminas))),
      operation: "vera_regerar_arte",
      projectId: args.projectId,
      refId: `${base.id}:${Date.now()}`,
      note: "Arte refeita com a marca nova, a pedido na conversa com a Vera",
    });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) throw new Error("o saldo acabou no meio");
    throw e;
  }

  const escritas: Escrita[] = [];
  for (const p of posts) {
    const nova = arte.porRede[p.platform] ?? arte.principal;
    if (!nova || nova === p.imageUrl) continue;
    await prisma.post.update({ where: { id: p.id }, data: { imageUrl: nova } });
    escritas.push({ onde: "post", id: p.id, campo: "imageUrl", antes: p.imageUrl, depois: nova });
  }
  // O card da Diana do dia mostra a arte principal no quadro.
  if (base.runId && base.dayOfWeek && arte.principal) {
    const cards = await prisma.campaignCard.findMany({
      where: { projectId: args.projectId, runId: base.runId, dayOfWeek: base.dayOfWeek, cardType: "media" },
      select: { id: true, mediaUrl: true },
    });
    for (const c of cards) {
      if (c.mediaUrl === arte.principal) continue;
      await prisma.campaignCard.update({ where: { id: c.id }, data: { mediaUrl: arte.principal } });
      escritas.push({ onde: "card", id: c.id, campo: "mediaUrl", antes: c.mediaUrl, depois: arte.principal });
    }
  }
  return escritas;
}

/**
 * O carrossel do dia, lâmina por lâmina, com a marca de agora. Mesmas frases,
 * mesma ordem, mesmo número de lâminas; a lâmina que não sai fica a antiga.
 * As mesmas lâminas servem a todas as redes do dia (o carrossel é 4:5 em
 * todas), como na esteira e no chat do card. O formato do post não muda.
 */
async function regerarCarrossel(args: { projectId: string; userId: string }, grupo: ArtePendente[]): Promise<Escrita[]> {
  const posts = await prisma.post.findMany({
    where: { id: { in: grupo.map((a) => a.postId) }, projectId: args.projectId },
    select: { id: true, platform: true, imageUrl: true, metadata: true, runId: true, dayOfWeek: true },
  });
  const base = posts.find((p) => laminasDaUrl(p.imageUrl).length > 1);
  if (!base) return [];
  const runId = base.runId;
  const dia = base.dayOfWeek;
  if (!runId || !dia) throw new Error("carrossel fora de campanha, sem direção de arte para refazer");
  const atuais = laminasDaUrl(base.imageUrl);

  // As frases das lâminas: no post (slides); se não estiverem lá, no card da Diana do dia.
  const cards = await prisma.campaignCard.findMany({
    where: { projectId: args.projectId, runId, dayOfWeek: dia, cardType: "media" },
    select: { id: true, mediaUrl: true, content: true, metadata: true },
  });
  let frases = frasesDoCarrossel(base.metadata as Record<string, unknown> | null, null);
  for (const c of cards) {
    if (frases.length >= atuais.length) break;
    frases = frasesDoCarrossel(c.metadata as Record<string, unknown> | null, c.content);
  }

  const projeto = await prisma.project.findUniqueOrThrow({ where: { id: args.projectId }, select: { niche: true } });
  // A marca lida agora (a cor nova já gravada) e a direção de arte do dia, que também lê a paleta de agora.
  // O modelo escolhido para o post (08/10) continua mandando no redesenho.
  const marca = await marcaDaArte(args.projectId, { runId, modeloDoPost: modeloGravadoNosPosts([base]) });
  const direcao = await direcaoDaPeca({ projectId: args.projectId, runId, dayOfWeek: dia, infografico: false, preferido: null }).catch(() => ({ styleHint: "" }));
  const formato = formatoDaPeca(base.platform, "carousel");
  const { urls, feitas } = await redesenharLaminas(frases, atuais, (frase) =>
    arteDoDia({ projectId: args.projectId, project: { niche: projeto.niche } }, frase, direcao.styleHint, formato, { projectId: args.projectId, runId }, frases[0], marca)
  );
  if (!feitas) throw new Error("nenhuma lâmina saiu");

  // Cobra só o que saiu: o carrossel inteiro pelo preço de tabela, ou por lâmina se faltou alguma.
  try {
    await debitar({
      userId: args.userId,
      quantidade: feitas === atuais.length ? custoDaMidia("carousel", atuais.length) : CREDIT_COSTS.carousel_lamina * feitas,
      operation: "vera_regerar_arte",
      projectId: args.projectId,
      refId: `${base.id}:${Date.now()}`,
      note: `Carrossel refeito com a marca nova (${feitas} de ${atuais.length} lâminas), a pedido na conversa com a Vera`,
    });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) throw new Error("o saldo acabou no meio");
    throw e;
  }

  const mediaUrl = urls.join("|");
  const escritas: Escrita[] = [];
  // Só recebe as lâminas novas quem já tinha um carrossel do mesmo tamanho.
  for (const p of posts) {
    if (laminasDaUrl(p.imageUrl).length !== atuais.length || p.imageUrl === mediaUrl) continue;
    await prisma.post.update({ where: { id: p.id }, data: { imageUrl: mediaUrl } });
    escritas.push({ onde: "post", id: p.id, campo: "imageUrl", antes: p.imageUrl, depois: mediaUrl });
  }
  for (const c of cards) {
    if (laminasDaUrl(c.mediaUrl).length !== atuais.length || c.mediaUrl === mediaUrl) continue;
    await prisma.campaignCard.update({ where: { id: c.id }, data: { mediaUrl } });
    escritas.push({ onde: "card", id: c.id, campo: "mediaUrl", antes: c.mediaUrl, depois: mediaUrl });
  }
  return escritas;
}
