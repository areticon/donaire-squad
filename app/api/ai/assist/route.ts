export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { askClaude, KANBAN_SYSTEM_PROMPT } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, context } = await req.json();

  const systemWithContext = context
    ? `${KANBAN_SYSTEM_PROMPT}\n\nContexto atual do projeto:\n${JSON.stringify(context, null, 2)}`
    : KANBAN_SYSTEM_PROMPT;

  // 1024 cortava respostas no meio (visto no teste de 20/08). O prompt agora
  // pede no máximo 200 palavras, e a folga aqui é para nunca truncar.
  const response = await askClaude(systemWithContext, message, {
    maxTokens: 6000,
  });

  return NextResponse.json({ reply: response });
}
