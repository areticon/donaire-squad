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

export async function artesAguardandoIdentidade(projectId: string): Promise<ArteAguardando[]> {
  const posts = await prisma.post.findMany({
    where: {
      projectId,
      status: { in: PENDENTE },
      mediaType: { in: GERA_ARTE },
      imageUrl: null,
      metadata: { path: ["aguardandoIdentidade"], equals: true },
      OR: [{ runId: null }, { run: { archived: false } }],
    },
    select: { id: true, runId: true, dayOfWeek: true, platform: true, mediaType: true },
    take: 80,
  });
  return posts.map((p) => ({ postId: p.id, runId: p.runId, dayOfWeek: p.dayOfWeek, platform: p.platform, mediaType: p.mediaType ?? "image" }));
}

/** Um grupo por campanha e dia: as redes do dia recebem a mesma arte, cada uma no recorte dela. */
export function agruparPorDia(artes: ArteAguardando[]): ArteAguardando[][] {
  const grupos = new Map<string, ArteAguardando[]>();
  for (const a of artes) {
    const chave = `${a.runId ?? "sem-run"}:${a.dayOfWeek ?? 0}:${a.mediaType}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return [...grupos.values()];
}

/** O custo em créditos de gerar os grupos. */
export function custoDosGrupos(grupos: ArteAguardando[][], laminasDoCarrossel = 5): number {
  return grupos.reduce((s, g) => s + custoDaMidia(g[0].mediaType, g[0].mediaType === "carousel" ? laminasDoCarrossel : undefined), 0);
}

type ConfigDaCampanha = { mediaStyle?: string | null; laminasDoCarrossel?: number | null; funnelStage?: "tofu" | "mofu" | "bofu" } | null;

/** Tira a marca de espera do metadata do post. */
function semEspera(meta: Prisma.JsonValue | null): Prisma.InputJsonValue {
  const m = (meta && typeof meta === "object" && !Array.isArray(meta) ? { ...(meta as Record<string, unknown>) } : {}) as Record<string, unknown>;
  delete m.aguardandoIdentidade;
  return m as Prisma.InputJsonValue;
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

  if (base.mediaType === "carousel") {
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
    const conteudo = await extrairConteudoDoInfografico(texto, nicho ?? "negocios", chave, { funil: config?.funnelStage });
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
  if (runId && base.dayOfWeek && principal) {
    const cards = await prisma.campaignCard.findMany({
      where: { projectId: args.projectId, runId, dayOfWeek: base.dayOfWeek, cardType: "media" },
      select: { id: true, content: true, metadata: true },
    });
    for (const c of cards) {
      const conteudo = (c.content ?? "").startsWith(MENSAGEM_AGUARDANDO) ? (c.content ?? "").split("\n\nPrompt: ")[1] ?? "" : c.content;
      await prisma.campaignCard.update({ where: { id: c.id }, data: { mediaUrl: principal, content: conteudo, metadata: semEspera(c.metadata) } });
    }
  }
  return gravadas;
}

/**
 * Gera tudo o que esperava. Exige a identidade aprovada (a trava continua
 * valendo aqui) e saldo para pelo menos o primeiro grupo. Devolve a frase
 * para a tela.
 */
export async function gerarArtesAguardando(args: { projectId: string; userId: string }): Promise<{ feitas: number; falhas: number; total: number; frase: string }> {
  const estado = await estadoDaIdentidade(args.projectId);
  if (!estado.aprovada) throw new Error(`${MENSAGEM_AGUARDANDO}: aprove modelo, letra e cores antes de gerar.`);
  const grupos = agruparPorDia(await artesAguardandoIdentidade(args.projectId));
  if (!grupos.length) return { feitas: 0, falhas: 0, total: 0, frase: "Nenhuma arte estava esperando: as próximas campanhas já saem com a identidade aprovada." };
  const disponivel = await saldo(args.userId);
  const custo = custoDosGrupos(grupos);
  if (disponivel < custoDaMidia(grupos[0][0].mediaType)) throw new Error(`faltam créditos: gerar as ${grupos.length} arte(s) custa ${custo} e há ${disponivel}`);

  const projeto = await prisma.project.findUniqueOrThrow({ where: { id: args.projectId }, select: { niche: true } });
  let feitas = 0;
  let falhas = 0;
  // Duas de cada vez: cada arte leva até 90 s, e a rota tem 800 s.
  const fila = [...grupos];
  const trabalhar = async () => {
    for (let g = fila.shift(); g; g = fila.shift()) {
      try {
        await gerarGrupo(args, g, projeto.niche);
        feitas++;
      } catch (e) {
        falhas++;
        console.warn(`[identidade][gerar] ${g[0].postId}: ${e instanceof Error ? e.message : e}`);
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
