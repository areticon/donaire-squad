import { prisma } from "@/lib/db/prisma";
import { cortar, dataCurta } from "@/lib/cerebro/montagem";
import { TIPO_DO_REGISTRO, type Esfera, type RegistroDoCerebro, type Tema } from "@/lib/cerebro/tipos";

/**
 * A MEMÓRIA DO CLIENTE NO PROMPT DOS AGENTES (06/10/2026).
 *
 * O cérebro só vale se os agentes LEEM o que o cliente já disse. Mas um ajuste
 * pontual ("troque esta palavra neste post") que vira regra para toda campanha
 * estraga mais do que ajuda. Por isso:
 *
 *   campanha, roteiro e pauta  leem só o que o JEV marcou como DURADOURO (a
 *                              preferência que vale para as próximas peças),
 *                              do tema de quem escreve;
 *   chat da peça               lê o mesmo, MAIS os últimos pedidos do chat
 *                              (o que ele já lia antes, agora com teto).
 *
 * Quem escolhe o que entra é a leitura do JEV gravada no registro (decisão
 * tomada uma vez, na captura); aqui é só filtro e formatação, sem chamada a
 * modelo nenhum. As regras aprovadas NÃO entram aqui: elas têm o bloco delas
 * (lib/referencias/regras.ts) e repetir confunde o modelo.
 */

export type AlvoDaMemoria = "texto" | "arte" | "video" | "todos";

const TEMAS_DO_ALVO: Record<AlvoDaMemoria, Array<Tema | null>> = {
  texto: ["texto", "tom", "marca", "publicacao", null],
  arte: ["arte", "marca", "tom", null],
  video: ["video", "tom", "marca", null],
  todos: ["texto", "arte", "video", "tom", "marca", "publicacao", null],
};

const VERBO: Partial<Record<Esfera, string>> = {
  pedidos: "Pediu",
  recusas: "Recusou",
  decisoes: "Decidiu",
  aprovacoes: "Aprovou",
  feedback: "Disse",
};

const MAX_DURADOURAS = 8;
const MAX_PEDIDOS_DO_CHAT = 6;
const MAX_POR_ITEM = 240;

export type PedidoDoChat = { instrucao: string; quando: string | null };

const chave = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 80);

/** O bloco, puro, para a prova. Vazio quando não há nada que valha. */
export function blocoDaMemoria(p: { registros: RegistroDoCerebro[]; alvo: AlvoDaMemoria; pedidosDoChat?: PedidoDoChat[] }): string {
  const temas = new Set(TEMAS_DO_ALVO[p.alvo]);
  const vistos = new Set<string>();
  const linhas: string[] = [];

  const duradouras = p.registros
    .filter((r) => r.duradoura === true && typeof r.resumo === "string" && r.resumo.trim() && temas.has(r.tema ?? null))
    .sort((a, b) => (b.corrigidaEm ?? b.quando).localeCompare(a.corrigidaEm ?? a.quando))
    .slice(0, MAX_DURADOURAS);
  for (const r of duradouras) {
    const texto = cortar(r.correcao?.trim() || r.resumo!, MAX_POR_ITEM);
    const k = chave(texto);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const verbo = (r.esfera && VERBO[r.esfera]) || "Registrou";
    linhas.push(`- ${verbo}${r.quando ? ` (${dataCurta(r.quando).slice(0, 5)})` : ""}: ${texto}`);
  }

  for (const ped of (p.pedidosDoChat ?? []).slice(0, MAX_PEDIDOS_DO_CHAT)) {
    const texto = cortar(ped.instrucao, MAX_POR_ITEM);
    const k = chave(texto);
    if (!texto || !k || [...vistos].some((v) => v.includes(k) || k.includes(v))) continue;
    vistos.add(k);
    linhas.push(`- Pediu no chat de uma peça${ped.quando ? ` (${dataCurta(ped.quando).slice(0, 5)})` : ""}: ${texto}`);
  }

  if (!linhas.length) return "";
  return `\n\nMEMÓRIA DO CLIENTE (o que ele já pediu, recusou e decidiu nesta plataforma; siga como preferência dele, abaixo das regras do projeto e nunca acima da verdade dos fatos):\n${linhas.join("\n")}`;
}

/**
 * O bloco de um projeto, lido do banco. Falha de leitura vira bloco vazio:
 * a memória nunca derruba agente.
 */
export async function blocoDaMemoriaDoCliente(projectId: string | null | undefined, alvo: AlvoDaMemoria, opcoes: { comPedidosDoChat?: boolean } = {}): Promise<string> {
  if (!projectId) return "";
  try {
    const [linhas, preferencias] = await Promise.all([
      prisma.projectMemory.findMany({ where: { projectId, type: TIPO_DO_REGISTRO }, orderBy: { updatedAt: "desc" }, take: 400, select: { value: true } }),
      opcoes.comPedidosDoChat
        ? prisma.projectMemory.findMany({ where: { projectId, type: "preference" }, orderBy: { createdAt: "desc" }, take: MAX_PEDIDOS_DO_CHAT, select: { value: true, createdAt: true } })
        : Promise.resolve([]),
    ]);
    const registros = linhas.map((l) => l.value as unknown as RegistroDoCerebro).filter((r) => r && r.v === 1);
    const pedidosDoChat: PedidoDoChat[] = preferencias
      .map((m) => {
        const v = (m.value ?? {}) as { instruction?: unknown };
        return { instrucao: typeof v.instruction === "string" ? v.instruction : "", quando: m.createdAt.toISOString() };
      })
      .filter((x) => x.instrucao.trim());
    return blocoDaMemoria({ registros, alvo, pedidosDoChat });
  } catch (e) {
    console.warn(`[cerebro] memória do cliente ${projectId}: ${e instanceof Error ? e.message : e}`);
    return "";
  }
}
