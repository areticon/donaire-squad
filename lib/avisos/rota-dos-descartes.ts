import { ehChaveDeAviso } from "@/lib/avisos/chaves";
import { descartadasEntre, descartar, desfazerDescarte, type DepositoDosDescartes } from "@/lib/avisos/descartes";

/**
 * A REGRA DA ROTA /api/avisos/descartes (07/10/2026), separada da rota para o
 * teste chamar sem sessão nem banco. A rota só lê a sessão (auth()) e repassa.
 *
 * - POST {chaves}: de 1 a 50 chaves válidas (ehChaveDeAviso), corpo JSON.
 *   200 {ok, lembrado:true}; 202 {ok, lembrado:false} quando não gravou
 *   (a tabela ainda não existe): a tela esconde só nesta visita.
 * - DELETE {chaves}: desfaz, com a mesma validação.
 * - GET ?c=..&c=..: a consulta exata (o parâmetro repetido, porque a chave
 *   pode ter vírgula).
 *
 * O userId vem SEMPRE da sessão de quem chama, nunca do corpo: o membro da
 * equipe descarta para ele, e o aviso do dono fica.
 */

export const MAXIMO_DE_CHAVES = 50;

export type PedidoDosDescartes = {
  metodo: "GET" | "POST" | "DELETE";
  userId: string | null;
  contentType?: string | null;
  /** O corpo já lido (POST e DELETE). */
  corpo?: () => Promise<unknown>;
  /** Os valores do parâmetro `c` (GET). */
  consulta?: string[];
};

export type RespostaDosDescartes = { status: number; corpo: Record<string, unknown> };

const ehJson = (ct: string | null | undefined) => Boolean(ct && /^application\/json\b/i.test(ct.trim()));

function validar(lista: unknown): { chaves: string[] } | { erro: string } {
  if (!Array.isArray(lista) || !lista.length) return { erro: "Diga quais avisos (chaves)." };
  if (lista.length > MAXIMO_DE_CHAVES) return { erro: `No máximo ${MAXIMO_DE_CHAVES} avisos por vez.` };
  if (!lista.every(ehChaveDeAviso)) return { erro: "Aviso desconhecido." };
  return { chaves: [...new Set(lista as string[])] };
}

export async function responderAosDescartes(p: PedidoDosDescartes, dep?: DepositoDosDescartes): Promise<RespostaDosDescartes> {
  if (!p.userId) return { status: 401, corpo: { error: "Unauthorized" } };

  if (p.metodo === "GET") {
    const v = validar(p.consulta ?? []);
    if ("erro" in v) return { status: 400, corpo: { error: v.erro } };
    const descartadas = await descartadasEntre(p.userId, v.chaves, dep);
    return { status: 200, corpo: { descartadas: [...descartadas] } };
  }

  if (!ehJson(p.contentType)) return { status: 400, corpo: { error: "Mande o corpo em JSON." } };
  const corpo = (await (p.corpo?.() ?? Promise.resolve(null)).catch(() => null)) as { chaves?: unknown } | null;
  const v = validar(corpo?.chaves);
  if ("erro" in v) return { status: 400, corpo: { error: v.erro } };

  const r = p.metodo === "POST" ? await descartar(p.userId, v.chaves, dep) : await desfazerDescarte(p.userId, v.chaves, dep);
  return { status: r.lembrado ? 200 : 202, corpo: { ok: true, lembrado: r.lembrado } };
}
