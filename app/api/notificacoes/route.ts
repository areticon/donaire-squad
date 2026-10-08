export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { notificacoesDe } from "@/lib/notificacoes";
import { responderAoSino } from "@/lib/notificacoes/rota-do-sino";

/**
 * O SINO (02/10/2026): as últimas notificações de quem está logado e quantas
 * não foram lidas. Consulta curta: o sino pergunta a cada 30 s, ao voltar para
 * a aba e quando a faixa do vídeo vê o estado mudar (o projeto não tem Pusher
 * configurado; ver o comentário de components/notificacoes/sino.tsx).
 *
 * Desde 07/10 sem as notificações que a pessoa descartou (lib/avisos).
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

/**
 * Marca como lidas (`{ ids }` ou `{ todas: true }`), descarta (`{ descartar: [ids] }`),
 * desfaz o descarte (`{ restaurar: [ids] }`) e limpa as lidas
 * (`{ descartarLidas: true }`). Sempre só nas linhas de quem está logado.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const corpo = await req.json().catch(() => ({}));
  const r = await responderAoSino({ userId, corpo });
  return NextResponse.json(r.corpo, { status: r.status });
}
