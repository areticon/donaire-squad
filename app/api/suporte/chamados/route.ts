export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { RecusaDoChamado, chamadosDoUsuario, criarChamado } from "@/lib/suporte/chamados";
import { ehCategoria, type ContextoDaTela } from "@/lib/suporte/regras";

/**
 * O CHAMADO DE SUPORTE (02/10/2026): a janela "Ajuda" manda para cá, em
 * multipart (o print opcional vai junto). Ver lib/suporte/chamados.ts.
 *
 * ANTIRROBÔ: só entra quem tem sessão; o campo isca ("site", invisível) cheio
 * é robô e recebe um "ok" falso, sem gravar nada (robô que aprende que foi
 * pego tenta de outro jeito); e o limite de 10 por hora é contado no banco.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta para abrir um chamado." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  const campo = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };

  if (campo("site").trim()) return NextResponse.json({ protocolo: "#0000", whatsapp: null });

  const categoria = campo("categoria");
  if (!ehCategoria(categoria)) return NextResponse.json({ error: "Escolha a categoria." }, { status: 400 });

  let contexto: ContextoDaTela = {};
  try {
    const bruto = JSON.parse(campo("contexto") || "{}") as Record<string, unknown>;
    const s = (k: string) => (typeof bruto[k] === "string" ? (bruto[k] as string) : null);
    contexto = { pagina: s("pagina") ?? undefined, projectId: s("projectId"), videoId: s("videoId"), postId: s("postId"), navegador: s("navegador") ?? undefined, tela: s("tela") ?? undefined };
  } catch {
    /* contexto é ajuda, não requisito */
  }
  const print = form.get("print");

  try {
    const r = await criarChamado({
      userId,
      categoria,
      texto: campo("texto"),
      codigo: campo("codigo") || null,
      postId: campo("postId") || null,
      contexto,
      print: print instanceof File && print.size > 0 ? print : null,
    });
    return NextResponse.json({ id: r.id, numero: r.numero, protocolo: r.protocolo, whatsapp: r.whatsapp, respostaDoDev: r.respostaDoDev });
  } catch (e) {
    if (e instanceof RecusaDoChamado) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[suporte] chamado não gravou:", e);
    return NextResponse.json({ error: "Não consegui gravar o chamado. Tente de novo em instantes." }, { status: 500 });
  }
}

/** Os chamados da própria pessoa (a página "Meus chamados" relê por aqui). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ chamados: await chamadosDoUsuario(userId) });
}
