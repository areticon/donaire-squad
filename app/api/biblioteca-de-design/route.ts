export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { bibliotecaDeExemplo } from "@/lib/biblioteca-de-design/exemplo";
import { listarBiblioteca } from "@/lib/biblioteca-de-design/registro";
import { filtrarGaleria, tipoValido } from "@/lib/biblioteca-de-design/tipos";

/**
 * A GALERIA DA BIBLIOTECA DE DESIGN (06/10/2026): GET devolve as entradas do
 * mais usado ao menos, com filtro por tipo (?tipo=video|imagem) e busca
 * (?busca=), e marca as que o projeto já usa (?projectId=). O nome de quem
 * criou nunca sai. `ehAdmin` diz à tela se mostra a ação "gerar prévias
 * pendentes".
 *
 * `?exemplo=1` só no `next dev`: a biblioteca de exemplo em memória
 * (lib/biblioteca-de-design/exemplo.ts), sem banco e sem sessão, para olhar
 * a tela sem aplicar a migração no banco compartilhado com a produção.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = tipoValido(sp.get("tipo")) ? (sp.get("tipo") as "video" | "imagem") : "todos";
  const busca = (sp.get("busca") ?? "").slice(0, 80);
  if (process.env.NODE_ENV === "development" && sp.get("exemplo") === "1") {
    return NextResponse.json({ designs: filtrarGaleria(bibliotecaDeExemplo(), tipo, busca), ehAdmin: sp.get("admin") === "1", exemplo: true });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = sp.get("projectId");
  try {
    const [designs, eu] = await Promise.all([
      listarBiblioteca({ tipo, busca, projectId, userId }),
      prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ]);
    return NextResponse.json({ designs, ehAdmin: eu?.role === "admin", exemplo: false });
  } catch (e) {
    console.error("[biblioteca-de-design] galeria:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "A biblioteca ainda não está disponível." }, { status: 503 });
  }
}
