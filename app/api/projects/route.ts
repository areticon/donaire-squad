export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { conferirMarca, fraseDoEstouro } from "@/lib/limites-do-plano";
import { membroAtivo } from "@/lib/equipe/conta";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Membro da equipe não cria projeto (01/10): o dono cria e libera para ele.
  // É também o que mantém a regra "membro ativo não tem projeto próprio", da
  // qual a conta que paga depende (lib/equipe/conta.ts).
  if (await membroAtivo(userId)) {
    return NextResponse.json(
      { error: "Quem cria projetos é quem administra a conta da sua equipe. Peça para liberar um projeto para você." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // A cota de MARCAS do plano, que ate 18/09 era so vitrine: o numero estava na
  // tabela, aparecia no cartao de preco e nenhuma linha de codigo o lia. Ver
  // lib/limites-do-plano.ts para o porque e para a regra do plano sugerido.
  const estouro = await conferirMarca(userId);
  if (estouro) {
    // 402 e nao 403: nao e falta de permissao, e falta de plano. A tela precisa
    // distinguir para oferecer o upgrade em vez de dizer "voce nao pode".
    return NextResponse.json(
      { error: fraseDoEstouro(estouro), limite: estouro },
      { status: 402 }
    );
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name,
      description,
      status: "setup",
      setupStep: 0,
    },
  });

  return NextResponse.json({ project });
}
