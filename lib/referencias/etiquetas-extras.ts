import { prisma } from "@/lib/db/prisma";
import { askClaude, askClaudeComImagens } from "@/lib/claude";
import { gravarExtrasPeloJev } from "@/lib/referencias/etiquetas-pelo-jev";
import {
  ESTILOS_DE_ARTE,
  RECURSOS,
  TONS,
  type EtiquetasDaArte,
  type EtiquetasExtras,
  type ExtrasDoPost,
} from "@/lib/referencias/tipos-das-analises";

/**
 * AS ETIQUETAS NOVAS DE CADA POST DE REFERÊNCIA (02/10/2026).
 *
 * O Bruno pediu achados do tipo "reels com meme e piada renderam 70% mais" e
 * "o estilo da arte que mais funciona". As etiquetas de 01/10 (padroes.ts)
 * dizem gancho, estrutura e chamada; faltavam o TOM (humor, sério...), o
 * RECURSO (meme, áudio em alta, bordão, POV...), o MOLDE do roteiro em poucas
 * palavras (o que deixa ver "o mesmo roteiro em muitos vídeos") e o ESTILO DA
 * ARTE da capa (foto de pessoa, texto sobre fundo, print...).
 *
 * Mesma regra de 01/10: pela FORMA, nunca pelo conteúdo; o molde não leva
 * nome, frase nem caso de ninguém. Tudo entra dentro de `etiquetas` (JSON),
 * somado ao que já estava, e só para quem ainda não tem: rodar duas vezes não
 * paga duas vezes.
 *
 * Custo medido em 02/10 (Haiku 4.5, US$ 1 e 5 por milhão de tokens): cerca de
 * US$ 0,008 por lote de 12 legendas e US$ 0,015 por lote de 8 capas.
 */

type Etiquetado = { id: string; formato: string; duracaoSeg: number | null; legenda: string | null; etiquetas: unknown; extras: unknown };

const LOTE_DE_TEXTO = 12;
const LOTE_DE_CAPAS = 8;
/** Teto de capas lidas por execução: a leitura de imagem é a parte cara. */
const MAX_CAPAS = 48;

function jsonDaResposta<T>(bruto: string): T | null {
  try {
    return JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as T;
  } catch {
    return null;
  }
}

const daLista = <T extends string>(v: unknown, lista: readonly T[], reserva: T): T => (typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : reserva);
const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ");

/** Tom, recurso e molde, pela legenda, em lotes de 12 (Haiku). */
async function etiquetarTexto(projectId: string, pendentes: Etiquetado[]): Promise<number> {
  let feitos = 0;
  for (let i = 0; i < pendentes.length; i += LOTE_DE_TEXTO) {
    const lote = pendentes.slice(i, i + LOTE_DE_TEXTO);
    // 03/10: tom e recurso são escolha numa lista, e decisão vai ao JEV
    // (etiquetas-pelo-jev.ts; ETIQUETAS_PELO_JEV=0 desliga); o molde segue no
    // Haiku. Null: o lote segue o caminho antigo logo abaixo.
    const peloJev = await gravarExtrasPeloJev(
      projectId,
      lote.map((p) => {
        const ex = (p.extras ?? {}) as ExtrasDoPost;
        const audio = ex.audio ? (ex.audio.original ? "áudio: a própria voz" : `áudio: música "${ex.audio.nome}"`) : undefined;
        return { ...p, audio };
      })
    ).catch(() => null);
    if (peloJev !== null) {
      feitos += peloJev;
      continue;
    }
    const lista = lote
      .map((p, k) => {
        const ex = (p.extras ?? {}) as ExtrasDoPost;
        const audio = ex.audio ? (ex.audio.original ? "áudio: a própria voz" : `áudio: música "${ex.audio.nome}"`) : "";
        return `${k + 1}. [${p.formato}${p.duracaoSeg ? `, ${p.duracaoSeg}s` : ""}${audio ? `, ${audio}` : ""}] ${(p.legenda ?? "").replace(/\s+/g, " ").slice(0, 500)}`;
      })
      .join("\n");
    try {
      const bruto = await askClaude(
        "Você etiqueta posts de redes sociais pela FORMA, nunca pelo conteúdo. Nunca use travessão. Responda só com JSON.",
        `Para cada post, devolva:
- tom: ${TONS.join(", ")}
- recurso (o principal truque de forma): ${RECURSOS.join(", ")}
- molde: o roteiro em até 12 palavras, ABSTRATO, sem nome de pessoa, marca, número ou frase do autor (ex.: "pergunta provocativa, três erros comuns, convite para comentar")

POSTS:
${lista}

Responda {"posts":[{"n":1,"tom":"...","recurso":"...","molde":"..."}]}`,
        { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId, operation: "referencias_etiquetas_extras" } }
      );
      const j = jsonDaResposta<{ posts?: Array<{ n?: number; tom?: string; recurso?: string; molde?: string }> }>(bruto);
      for (const e of j?.posts ?? []) {
        const p = lote[Number(e.n) - 1];
        if (!p) continue;
        const extras: EtiquetasExtras = {
          tom: daLista(e.tom, TONS, "educativo"),
          recurso: daLista(e.recurso, RECURSOS, "nenhum"),
          molde: semTravessao(String(e.molde ?? "")).slice(0, 120),
        };
        const atual = (p.etiquetas ?? {}) as Record<string, unknown>;
        await prisma.referenciaPost.update({ where: { id: p.id }, data: { etiquetas: { ...atual, ...extras } as never } });
        feitos++;
      }
    } catch (e) {
      console.warn(`[referencias][etiquetas-extras] ${e instanceof Error ? e.message : e}`);
    }
  }
  return feitos;
}

/** Baixa a capa (o endereço expira em dias) e devolve em base64, ou null. */
async function baixarCapa(url: string): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    const mediaType = tipo === "image/png" ? "image/png" : tipo === "image/webp" ? "image/webp" : tipo === "image/jpeg" || tipo === "image/jpg" ? "image/jpeg" : null;
    if (!mediaType) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000 || buf.length > 4_500_000) return null;
    return { base64: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

/** O estilo da arte pela capa, em lotes de 8 imagens (Haiku com visão). A imagem não é guardada. */
async function etiquetarCapas(projectId: string, pendentes: Etiquetado[]): Promise<{ feitos: number; semCapa: number }> {
  let feitos = 0;
  let semCapa = 0;
  for (let i = 0; i < pendentes.length; i += LOTE_DE_CAPAS) {
    const lote: Array<{ p: Etiquetado; img: NonNullable<Awaited<ReturnType<typeof baixarCapa>>> }> = [];
    for (const p of pendentes.slice(i, i + LOTE_DE_CAPAS)) {
      const capa = ((p.extras ?? {}) as ExtrasDoPost).capa;
      const img = capa ? await baixarCapa(capa) : null;
      if (img) lote.push({ p, img });
      else semCapa++;
    }
    if (!lote.length) continue;
    try {
      const bruto = await askClaudeComImagens(
        "Você descreve o ESTILO VISUAL de capas de posts de redes sociais, nunca o conteúdo nem quem aparece. Responda só com JSON.",
        `Para cada imagem numerada, diga só com estas palavras:
- estilo: ${ESTILOS_DE_ARTE.join(" | ")}
- texto (quanto texto escrito há na imagem): muito | pouco | nenhum
- paleta: clara | escura | colorida | neutra
- rosto (aparece rosto de pessoa?): true | false
Responda {"capas":[{"n":1,"estilo":"...","texto":"...","paleta":"...","rosto":false}]}`,
        lote.map((x, k) => ({ base64: x.img.base64, mediaType: x.img.mediaType, rotulo: `Imagem ${k + 1}:` })),
        { model: "claude-haiku-4-5", maxTokens: 3000, usage: { projectId, operation: "referencias_arte" } }
      );
      const j = jsonDaResposta<{ capas?: Array<{ n?: number; estilo?: string; texto?: string; paleta?: string; rosto?: unknown }> }>(bruto);
      for (const c of j?.capas ?? []) {
        const x = lote[Number(c.n) - 1];
        if (!x) continue;
        const arte: EtiquetasDaArte = {
          estilo: daLista(c.estilo, ESTILOS_DE_ARTE, "texto_sobre_fundo"),
          texto: daLista(c.texto, ["muito", "pouco", "nenhum"] as const, "pouco"),
          paleta: daLista(c.paleta, ["clara", "escura", "colorida", "neutra"] as const, "neutra"),
          rosto: c.rosto === true || c.rosto === "true",
        };
        const atual = (x.p.etiquetas ?? {}) as Record<string, unknown>;
        await prisma.referenciaPost.update({ where: { id: x.p.id }, data: { etiquetas: { ...atual, arte } as never } });
        feitos++;
      }
    } catch (e) {
      console.warn(`[referencias][arte] ${e instanceof Error ? e.message : e}`);
    }
  }
  return { feitos, semCapa };
}

/** Custo estimado do que a função vai fazer, para o registro e o relatório. */
export const CUSTO_POR_LOTE_DE_TEXTO_USD = 0.008;
export const CUSTO_POR_LOTE_DE_CAPAS_USD = 0.015;

/**
 * Etiqueta o que falta no projeto: tom, recurso e molde de todo post já
 * etiquetado pelo estudo; estilo da arte das capas de imagem, carrossel e
 * vídeo (as estáticas primeiro), até 48 por execução.
 */
export async function etiquetarExtras(projectId: string): Promise<{ textos: number; capas: number; semCapa: number; custoUsd: number }> {
  const posts = (await prisma.referenciaPost.findMany({
    where: { projectId },
    select: { id: true, formato: true, duracaoSeg: true, legenda: true, etiquetas: true, extras: true },
  })) as Etiquetado[];
  const comBase = posts.filter((p) => p.etiquetas && typeof p.etiquetas === "object");
  const semTom = comBase.filter((p) => !(p.etiquetas as EtiquetasExtras).tom);
  const ordem = (f: string) => (["imagem", "carrossel", "documento"].includes(f) ? 0 : 1);
  const semArte = comBase
    .filter((p) => !(p.etiquetas as EtiquetasExtras).arte && ((p.extras ?? {}) as ExtrasDoPost).capa)
    .sort((a, b) => ordem(a.formato) - ordem(b.formato))
    .slice(0, MAX_CAPAS);
  const textos = await etiquetarTexto(projectId, semTom);
  // As capas leem a etiqueta já com o tom: relê para não sobrescrever.
  const frescos = semArte.length
    ? ((await prisma.referenciaPost.findMany({
        where: { id: { in: semArte.map((p) => p.id) } },
        select: { id: true, formato: true, duracaoSeg: true, legenda: true, etiquetas: true, extras: true },
      })) as Etiquetado[])
    : [];
  const capas = await etiquetarCapas(projectId, frescos.sort((a, b) => ordem(a.formato) - ordem(b.formato)));
  const custoUsd =
    Math.ceil(semTom.length / LOTE_DE_TEXTO) * CUSTO_POR_LOTE_DE_TEXTO_USD + Math.ceil((capas.feitos + capas.semCapa) / LOTE_DE_CAPAS) * CUSTO_POR_LOTE_DE_CAPAS_USD;
  return { textos, capas: capas.feitos, semCapa: capas.semCapa, custoUsd: Math.round(custoUsd * 1000) / 1000 };
}
