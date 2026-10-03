export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { marcarLidas, notificacoesDe } from "@/lib/notificacoes";

/**
 * O SINO (02/10/2026): as últimas notificações de quem está logado e quantas
 * não foram lidas. Consulta curta: o sino pergunta a cada 30 s, ao voltar para
 * a aba e quando a faixa do vídeo vê o estado mudar (o projeto não tem Pusher
 * configurado; ver o comentário de components/notificacoes/sino.tsx).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await notificacoesDe(userId));
  } catch (e) {
    // Sem a tabela (migração ainda não aplicada) o sino fica vazio, e não quebra a barra.
    console.error("[notificacoes] leitura falhou:", e);
    return NextResponse.json({ itens: [], naoLidas: 0 });
  }
}

/** Marca como lidas: `{ ids: [...] }` ou `{ todas: true }`. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown; todas?: unknown };
  const ids = Array.isArray(corpo.ids) ? corpo.ids.filter((i): i is string => typeof i === "string").slice(0, 100) : [];
  if (!ids.length && corpo.todas !== true) return NextResponse.json({ error: "Diga quais (ids) ou todas." }, { status: 400 });
  const marcadas = await marcarLidas(userId, corpo.todas === true ? undefined : ids);
  return NextResponse.json({ ok: true, marcadas });
}
