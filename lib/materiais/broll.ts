import { prisma } from "@/lib/db/prisma";
import type { MidiaDaInsercao } from "@/lib/media/editor-sob-medida/tipos";

/**
 * O VÍDEO DO CLIENTE COMO B-ROLL (03/10/2026), antes do banco.
 *
 * O editor sob medida pede B-roll por uma consulta curta em inglês ("coffee
 * shop counter", "team meeting office"). Quando a biblioteca do cliente tem um
 * vídeo curto cujas palavras (lidas por visão, em inglês) casam com a
 * consulta, ele entra no lugar do Pexels ou do Pixabay: é o escritório, o
 * produto e a equipe DELE, e custa zero. Vai como `origem: "banco"` para o
 * worker tratar igual (corte de 1,5 a 3 s, cor casada com a gravação), sem
 * mudar o worker.
 *
 * Casamento por palavra, de propósito simples e auditável: pelo menos duas
 * palavras concretas em comum, ou uma quando a consulta é curta (as genéricas, como "person", "shot" ou "slow",
 * não contam). Um vídeo serve no máximo duas vezes por edição, em trechos
 * diferentes.
 */

const GENERICAS = new Set(
  "a an the of in on at to for with and or from by into over under up down close closeup shot view slow motion footage video clip scene background person people man woman someone hand hands detail details shallow depth field light natural real world b roll broll camera push".split(" ")
);

const DA_ETIQUETA: Record<string, string[]> = {
  produto: ["product", "products", "package", "packaging"],
  local: ["office", "store", "shop", "workspace", "building", "room", "desk", "clinic", "storefront"],
  equipe: ["team", "colleagues", "meeting", "working", "coworkers", "staff"],
  bastidor: ["behind", "scenes", "process", "working", "workshop"],
};

function palavras(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERICAS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

export type VideoDoCliente = { id: string; url: string; duracaoSec: number; termos: Set<string>; usos: number };

export async function videosDoCliente(projectId: string): Promise<VideoDoCliente[]> {
  const linhas = await prisma.materialDoCliente
    .findMany({ where: { projectId, tipo: "video", status: "pronto" }, orderBy: { createdAt: "desc" }, take: 60 })
    .catch(() => []);
  return linhas
    .filter((m) => m.qualidade !== "fraca" && !m.etiquetas.includes("documento"))
    .map((m) => ({
      id: m.id,
      url: m.url,
      duracaoSec: m.duracaoSec ?? 10,
      usos: m.usos,
      termos: new Set(palavras([...m.palavrasEn, ...m.etiquetas.flatMap((e) => DA_ETIQUETA[e] ?? [])].join(" "))),
    }));
}

/** A nota de um vídeo para uma consulta: palavras concretas em comum. */
export function notaDoCasamento(consulta: string, v: VideoDoCliente): number {
  return palavras(consulta).filter((w) => v.termos.has(w)).length;
}

/**
 * Os B-rolls que o material do cliente cobre. Devolve as inserções prontas
 * (por id do pedido) e os ids que sobraram para o banco.
 */
export async function brollDoCliente(
  projectId: string | null | undefined,
  pedidos: Array<{ id: string; consulta: string }>
): Promise<{ insercoes: Record<string, MidiaDaInsercao>; usados: string[] }> {
  const insercoes: Record<string, MidiaDaInsercao> = {};
  const usados: string[] = [];
  if (!projectId || !pedidos.length) return { insercoes, usados };
  const videos = await videosDoCliente(projectId);
  if (!videos.length) return { insercoes, usados };
  const vezes = new Map<string, number>();
  for (const p of pedidos) {
    const melhor = videos
      .map((v) => ({ v, nota: notaDoCasamento(p.consulta, v) }))
      // Casa com 2 palavras concretas (1 quando a consulta só tem 1 ou 2):
      // "city skyline at night" não pode cair na sala de reunião por "city".
      .filter((x) => x.nota >= Math.min(2, Math.max(1, palavras(p.consulta).length - 1)) && (vezes.get(x.v.id) ?? 0) < (x.v.duracaoSec >= 8 ? 2 : 1))
      .sort((a, b) => b.nota - a.nota || (vezes.get(a.v.id) ?? 0) - (vezes.get(b.v.id) ?? 0) || a.v.usos - b.v.usos)[0];
    if (!melhor) continue;
    const n = vezes.get(melhor.v.id) ?? 0;
    vezes.set(melhor.v.id, n + 1);
    const d = melhor.v.duracaoSec;
    insercoes[p.id] = { url: melhor.v.url, tipo: "video", origem: "banco", inicio: n === 0 ? Math.min(1, d * 0.1) : Math.max(0, d * 0.5 - 1) };
    usados.push(melhor.v.id);
  }
  if (usados.length) {
    await prisma.materialDoCliente
      .updateMany({ where: { id: { in: [...new Set(usados)] } }, data: { usos: { increment: 1 }, ultimoUsoEm: new Date() } })
      .catch(() => {});
  }
  return { insercoes, usados };
}
