import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoChamado, criarChamado } from "@/lib/suporte/chamados";

/**
 * O CHAMADO DE UMA PEÇA COM ERRO, pelo caminho antigo (21/09).
 *
 * Desde 02/10 o chamado é um só (lib/suporte/chamados.ts): número sequencial
 * (#0012), histórico, painel do admin e "Meus chamados". O diagnóstico que
 * morava aqui (o código vira explicação técnica, só para o Bruno) foi para
 * lib/suporte/diagnostico.ts. As telas abrem a janela de ajuda preenchida; esta
 * rota fica para quem ainda chamar direto, e cria o mesmo chamado.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { postId, codigo, mensagem } = (await req.json().catch(() => ({}))) as {
    postId?: string;
    codigo?: string;
    mensagem?: string;
  };
  if (!postId) return NextResponse.json({ error: "Peça não informada." }, { status: 400 });

  try {
    const r = await criarChamado({
      userId,
      categoria: "problema",
      texto: mensagem?.trim() || `Abri um chamado pelo código ${codigo ?? "(sem código)"} que apareceu na peça.`,
      codigo: codigo ?? null,
      postId,
    });
    return NextResponse.json({ protocolo: r.protocolo, whatsapp: r.whatsapp });
  } catch (e) {
    if (e instanceof RecusaDoChamado) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
