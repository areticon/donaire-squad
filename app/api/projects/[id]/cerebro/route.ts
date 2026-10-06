import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { carregarFontes } from "@/lib/cerebro/carregar";
import { cerebroEmMarkdown, montarCerebro } from "@/lib/cerebro/montagem";

/**
 * GET: o segundo cérebro do projeto (notas e ligações) para a tela do grafo.
 * GET ?baixar=md | json: a CÓPIA da memória inteira, sem o teto da tela, como
 * arquivo (os termos: o cliente pede cópia). Só admin gera; entrega pelo suporte.
 *
 * Só leitura: nada aqui grava.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true, name: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baixar = req.nextUrl.searchParams.get("baixar");
  if (baixar) {
    // A cópia sai SÓ PELA EQUIPE (06/10, decisão do Bruno): a memória é o custo
    // de saída do cliente, então não há botão de autoatendimento. O direito de
    // pedir cópia (LGPD, art. 18; termos 11.6) é atendido pelo suporte: o
    // cliente pede, um admin gera aqui e entrega.
    const eu = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (eu?.role !== "admin") return NextResponse.json({ error: "A cópia da memória é enviada pelo suporte: abra um chamado pedindo a cópia." }, { status: 403 });
  }

  const fontes = await carregarFontes(id);
  if (!fontes) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (baixar === "md" || baixar === "json") {
    const cerebro = montarCerebro(fontes, { teto: Number.POSITIVE_INFINITY });
    const nome = `segundo-cerebro-${projeto.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projeto"}`;
    const corpo = baixar === "md" ? cerebroEmMarkdown(cerebro) : JSON.stringify(cerebro, null, 2);
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": baixar === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}.${baixar}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ cerebro: montarCerebro(fontes), souDono: projeto.userId === userId }, { headers: { "Cache-Control": "no-store" } });
}
