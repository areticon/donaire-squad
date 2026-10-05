import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { jevLigado, perguntarAoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import { ehEtiqueta, type Etiqueta } from "@/lib/materiais/tipos";

/**
 * QUAL MATERIAL DO CLIENTE SERVE A ESTA PEÇA (03/10/2026).
 *
 * A regra do Bruno: a foto real do negócio vem ANTES da imagem gerada. Então
 * toda arte (post, story, lâmina de carrossel, peça da semana do vídeo)
 * pergunta aqui primeiro; só quando nada serve o desenhista é chamado.
 *
 * - O que entra: fotos prontas, sem qualidade "fraca" e sem "documento".
 * - Campanha com materiais marcados ("use estas fotos nesta campanha"): eles
 *   vêm primeiro; o resto da biblioteca só se nenhum marcado servir.
 * - Distribuição: entre fotos que servem igual, a menos usada (e a usada há
 *   mais tempo). Assim uma campanha de sete dias passeia pela biblioteca em
 *   vez de repetir a mesma foto.
 * - A decisão é do JEV desde 05/10 (regra do Bruno: escolha não é LLM): uma
 *   pergunta de escolha sobre as descrições que a visão já escreveu, primeiro
 *   entre as marcadas na campanha, depois no resto da biblioteca; entre as que
 *   servem igual (probabilidade perto da maior), o código pega a menos usada.
 *   Uma vez por frase: a mesma peça em outra proporção reaproveita. Sem o JEV
 *   no ar, a chamada curta de texto de antes (~US$ 0,003).
 */

export interface MaterialDaMarca {
  id: string;
  url: string;
  etiquetas: Etiqueta[];
  descricao: string;
  palavrasEn: string[];
  luz: string | null;
  orientacao: string | null;
  temRosto: boolean;
  usos: number;
  ultimoUsoEm: number;
  daCampanha: boolean;
}

/** Os materiais marcados na campanha: pelo run, ou pela campanha em andamento do projeto. */
async function marcadosNaCampanha(projectId: string, runId?: string): Promise<string[]> {
  const ler = (c: unknown) => {
    const v = (c as { materiaisDaCampanha?: unknown } | null)?.materiaisDaCampanha;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  };
  if (runId) {
    const r = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { config: true } }).catch(() => null);
    return ler(r?.config);
  }
  // Sem o run (quem chama não o tem à mão): a campanha que está gerando agora.
  const r = await prisma.pipelineRun
    .findFirst({ where: { projectId, status: "running", archived: false, startedAt: { gte: new Date(Date.now() - 10 * 86400_000) } }, orderBy: { startedAt: "desc" }, select: { config: true } })
    .catch(() => null);
  return ler(r?.config);
}

/** As fotos da biblioteca que podem virar arte. Vazio quando não há (ou a tabela ainda não existe). */
export async function materiaisDaMarca(projectId: string, runId?: string): Promise<MaterialDaMarca[]> {
  const [linhas, marcados] = await Promise.all([
    prisma.materialDoCliente
      .findMany({ where: { projectId, tipo: "foto", status: "pronto" }, orderBy: { createdAt: "desc" }, take: 80 })
      .catch(() => []),
    marcadosNaCampanha(projectId, runId),
  ]);
  const marcadosSet = new Set(marcados);
  return linhas
    .filter((m) => m.qualidade !== "fraca" && !m.etiquetas.includes("documento"))
    .map((m) => ({
      id: m.id,
      url: m.url,
      etiquetas: m.etiquetas.filter(ehEtiqueta),
      descricao: m.descricao ?? "",
      palavrasEn: m.palavrasEn,
      luz: m.luz,
      orientacao: m.orientacao,
      temRosto: m.temRosto,
      usos: m.usos,
      ultimoUsoEm: m.ultimoUsoEm?.getTime() ?? 0,
      daCampanha: marcadosSet.has(m.id),
    }));
}

const escolhas = new Map<string, Promise<MaterialDaMarca | null>>();

/**
 * O material desta peça, ou null. `evitar` tira os já usados na mesma peça
 * (lâminas do carrossel); `chave` separa as lâminas que repetem a frase.
 */
export function escolherMaterial(o: {
  materiais: MaterialDaMarca[];
  frase: string;
  contexto?: string;
  projectId?: string;
  evitar?: Set<string>;
  chave?: string;
}): Promise<MaterialDaMarca | null> {
  const pool = o.materiais.filter((m) => !o.evitar?.has(m.id));
  if (!pool.length) return Promise.resolve(null);
  const k = `${o.projectId ?? ""}|${o.chave ?? ""}|${o.frase}|${pool.map((m) => m.id).join(",")}`;
  let v = escolhas.get(k);
  if (!v) {
    v = decidir({ ...o, materiais: pool }).catch((e) => {
      console.warn("[materiais] escolha falhou, a peça segue sem material:", e instanceof Error ? e.message : e);
      return null;
    });
    escolhas.set(k, v);
    if (escolhas.size > 300) escolhas.delete(escolhas.keys().next().value as string);
  }
  return v;
}

/** Entre as que o JEV pôs perto do topo, a menos usada ganha (é o que distribui a biblioteca). */
export const FOLGA_DE_EMPATE = 0.1;
/** Abaixo disto o JEV não sabe, e a peça segue sem material (a arte gerada é a reserva). */
export const CONFIANCA_MINIMA = 0.5;

/**
 * Da resposta do JEV à foto, ou null. Puro, para o teste. `lista` está na
 * ordem apresentada ao JEV (ids "1", "2", ...).
 */
export function escolhaDeMaterial(r: RespostaDoJev | undefined, lista: MaterialDaMarca[]): MaterialDaMarca | null {
  if (!r || r.type !== "choice" || !lista.length) return null;
  if ((r.confidence ?? 0) < CONFIANCA_MINIMA) return null;
  if (r.choice === "nenhuma") return null;
  const prob = (i: number) => r.probabilities?.[String(i + 1)] ?? 0;
  const escolhida = Number(r.choice);
  if (!Number.isInteger(escolhida) || escolhida < 1 || escolhida > lista.length) return null;
  const topo = Math.max(prob(escolhida - 1), ...lista.map((_, i) => prob(i)));
  const empatadas = lista.map((m, i) => ({ m, p: prob(i) })).filter((x) => x.p >= topo - FOLGA_DE_EMPATE);
  if (!empatadas.length) return lista[escolhida - 1];
  return empatadas.sort((a, b) => a.m.usos - b.m.usos || a.m.ultimoUsoEm - b.m.ultimoUsoEm)[0].m;
}

/** A escolha pelo JEV: marcadas na campanha primeiro, o resto da biblioteca depois. */
export async function decidirPeloJev(
  o: { materiais: MaterialDaMarca[]; frase: string; contexto?: string; projectId?: string },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<MaterialDaMarca | null> {
  const ordem = [...o.materiais].sort((a, b) => a.usos - b.usos || a.ultimoUsoEm - b.ultimoUsoEm).slice(0, 24);
  const escolher = async (lista: MaterialDaMarca[]): Promise<MaterialDaMarca | null> => {
    if (!lista.length) return null;
    const state = {
      contexto:
        "Um pequeno negócio vai publicar um post e tem uma biblioteca de fotos REAIS (o dono, a equipe, o lugar, o produto). Foto real do próprio negócio quase sempre vale mais que imagem genérica gerada. Escolha a foto que serve de imagem do post: combina com o assunto, ou mostra quem fala num post de opinião, bastidor ou autoridade.",
      manchete_do_post: o.frase,
      texto_do_post: o.contexto ? o.contexto.slice(0, 1200) : "(não informado)",
      fotos: lista.map((m, i) => ({ id: String(i + 1), etiquetas: m.etiquetas, usada_vezes: m.usos, descricao: m.descricao || "(sem descrição)" })),
    };
    const criteria: Record<string, string> = Object.fromEntries(lista.map((m, i) => [String(i + 1), `${m.descricao || "(sem descrição)"}${m.etiquetas.length ? ` [${m.etiquetas.join(", ")}]` : ""}`.slice(0, 300)]));
    criteria.nenhuma = "nenhuma foto tem relação com o post, ou todas contradizem o post (produto errado, clima oposto)";
    const r = await perguntar(
      { projectId: o.projectId, etapa: "material-escolha", state },
      { foto: { type: "choice", instructions: "Qual foto de `fotos` serve de imagem para este post? \"nenhuma\" se nenhuma tiver relação ou se a foto contradisser o post.", criteria } }
    );
    return escolhaDeMaterial(r.foto, lista);
  };
  const marcadas = ordem.filter((m) => m.daCampanha);
  if (marcadas.length) {
    const m = await escolher(marcadas);
    if (m) return m;
  }
  return escolher(ordem.filter((m) => !m.daCampanha));
}

async function decidir(o: { materiais: MaterialDaMarca[]; frase: string; contexto?: string; projectId?: string }): Promise<MaterialDaMarca | null> {
  if (jevLigado() && process.env.MATERIAL_PELO_JEV !== "0") return decidirPeloJev(o);
  // Marcados na campanha primeiro; menos usados antes; até 24 na lista.
  const ordem = [...o.materiais].sort((a, b) => Number(b.daCampanha) - Number(a.daCampanha) || a.usos - b.usos || a.ultimoUsoEm - b.ultimoUsoEm).slice(0, 24);
  const temMarcados = ordem.some((m) => m.daCampanha);
  const lista = ordem
    .map((m, i) => `${i + 1}. [${m.etiquetas.join(", ") || "sem etiqueta"}]${m.daCampanha ? " [MARCADA PARA ESTA CAMPANHA]" : ""} usada ${m.usos}x: ${m.descricao || "(sem descrição)"}`)
    .join("\n");
  const bruto = await askClaude(
    "Você é o diretor de arte de um pequeno negócio e escolhe, na biblioteca de fotos REAIS do cliente, a que vai como imagem de um post. Foto real do próprio negócio (o dono, a equipe, o lugar, o produto) quase sempre vale mais que imagem genérica gerada. Responda SÓ com JSON.",
    `POST (a manchete da arte): "${o.frase}"
${o.contexto ? `TEXTO DO POST: ${o.contexto.slice(0, 1200)}\n` : ""}
FOTOS DO CLIENTE:
${lista}

Escolha UMA foto que sirva de imagem para este post: combina com o assunto, ou mostra quem fala (o dono, a equipe, o lugar) num post de opinião, bastidor ou autoridade. Devolva null só se nenhuma tiver relação ou se a foto contradisser o post (ex.: produto errado, clima oposto).${temMarcados ? " O cliente marcou fotos para esta campanha: prefira uma delas sempre que servir." : ""} Entre fotos que servem igual, a menos usada.
JSON: {"foto": número da lista ou null, "porque": "até 12 palavras"}`,
    { maxTokens: 4000, effort: "low", usage: { projectId: o.projectId, operation: "material_escolha" } }
  );
  const i = bruto.indexOf("{");
  const j = JSON.parse(bruto.slice(i, bruto.lastIndexOf("}") + 1)) as { foto?: number | null };
  const n = Number(j.foto);
  if (!Number.isInteger(n) || n < 1 || n > ordem.length) return null;
  return ordem[n - 1];
}

// ───────────────── a peça que usou material, para a conferência ─────────────────

const PECAS_COM_MATERIAL = new Map<string, number>();

/** Registra que a peça desta manchete saiu de uma foto real do cliente. */
export function registrarPecaComMaterial(manchete: string): void {
  PECAS_COM_MATERIAL.set(manchete.trim(), Date.now());
  if (PECAS_COM_MATERIAL.size > 300) PECAS_COM_MATERIAL.delete(PECAS_COM_MATERIAL.keys().next().value as string);
}

/**
 * A peça é foto real do cliente? A conferência por visão então não roda:
 * ela reprova gente e texto que ninguém pediu, e na foto do cliente a gente e
 * a placa da loja SÃO o material dele. O texto da arte continua todo em código.
 */
export function pecaUsaMaterial(manchetes: string[] | undefined): boolean {
  return Boolean(manchetes?.some((m) => PECAS_COM_MATERIAL.has(m.trim())));
}
