import { marcarLidas } from "@/lib/notificacoes";
import { descartarLidas, descartarNotificacoes, restaurarNotificacoes, type DepositoDosDescartes } from "@/lib/avisos/descartes";

/**
 * O POST DO SINO (02/10, descarte em 07/10), separado da rota para o teste
 * chamar sem sessão nem banco. Sempre só nas linhas do próprio userId:
 *
 * - {ids} e {todas}: marca como lidas, como sempre;
 * - {descartar:[ids]}: tira do sino (a linha fica: é a trava do e-mail) e
 *   devolve as chaves, para a tela tirar a faixa do mesmo fato sem recarregar;
 * - {restaurar:[ids]}: o desfazer do item, pelo id;
 * - {descartarLidas:true}: o "Limpar as lidas".
 */

export type DepositosDoSino = {
  descartes?: DepositoDosDescartes;
  marcar?: (userId: string, ids?: string[]) => Promise<number>;
};

const listaDeIds = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string" && i.length > 0 && i.length <= 100).slice(0, 100) : []);

export async function responderAoSino(
  p: { userId: string | null; corpo: unknown },
  dep: DepositosDoSino = {}
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!p.userId) return { status: 401, corpo: { error: "Unauthorized" } };
  const corpo = (p.corpo && typeof p.corpo === "object" ? p.corpo : {}) as {
    ids?: unknown;
    todas?: unknown;
    descartar?: unknown;
    restaurar?: unknown;
    descartarLidas?: unknown;
  };

  if (corpo.descartar !== undefined) {
    const ids = listaDeIds(corpo.descartar);
    if (!ids.length) return { status: 400, corpo: { error: "Diga quais (descartar)." } };
    const r = await descartarNotificacoes(p.userId, ids, dep.descartes);
    return { status: 200, corpo: { ok: true, chaves: r.chaves, lembrado: r.lembrado } };
  }
  if (corpo.restaurar !== undefined) {
    const ids = listaDeIds(corpo.restaurar);
    if (!ids.length) return { status: 400, corpo: { error: "Diga quais (restaurar)." } };
    const r = await restaurarNotificacoes(p.userId, ids, dep.descartes);
    return { status: 200, corpo: { ok: true, chaves: r.chaves } };
  }
  if (corpo.descartarLidas === true) {
    const r = await descartarLidas(p.userId, dep.descartes);
    return { status: 200, corpo: { ok: true, quantas: r.quantas, lembrado: r.lembrado } };
  }

  const ids = listaDeIds(corpo.ids);
  if (!ids.length && corpo.todas !== true) return { status: 400, corpo: { error: "Diga quais (ids) ou todas." } };
  const marcar = dep.marcar ?? marcarLidas;
  const marcadas = await marcar(p.userId, corpo.todas === true ? undefined : ids);
  return { status: 200, corpo: { ok: true, marcadas } };
}
