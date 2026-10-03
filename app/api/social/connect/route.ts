export const dynamic = 'force-dynamic'

import { revokeTikTokToken } from "@/lib/oauth/tiktok";
import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { marcarPostsDaConta } from "@/lib/publish/contas-orfas";
import { podeUsarProjeto, projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return ALL accounts (active and inactive) so the Settings panel can show toggles
  const contas = await prisma.socialAccount.findMany({
    where: { projectId },
    select: {
      id: true,
      platform: true,
      displayName: true,
      username: true,
      isActive: true,
      accountType: true,
      organizationId: true,
      avatarUrl: true,
      needsReconnectAt: true,
      needsReconnectReason: true,
      // Só para calcular `assistida` abaixo: nenhum dos dois sai na resposta.
      accessToken: true,
      blotatoAccountId: true,
    },
  });

  // `assistida` (01/10): a conta foi conectada pelo time (conexão assistida) e
  // publica pela ponte, sem token próprio. A tela diz isso em vez de "perfil
  // pessoal", e o token e o número do vínculo nunca descem para o navegador.
  // `needsReconnect*` entram porque o painel já os lia e esta rota não mandava:
  // depois de um "Atualizar", a conta recusada voltava a parecer saudável.
  const storedAccounts = contas.map(({ accessToken, blotatoAccountId, ...c }) => ({
    ...c,
    assistida: !accessToken && Boolean(blotatoAccountId?.trim()),
  }));

  return NextResponse.json({ storedAccounts });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, isActive } = await req.json();
  if (typeof id !== "string" || typeof isActive !== "boolean") {
    return NextResponse.json({ error: "id e isActive são obrigatórios" }, { status: 400 });
  }

  const account = await prisma.socialAccount.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!account || !(await podeUsarProjeto(userId, { id: account.projectId, userId: account.project.userId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // As conexões de rede valem para a equipe inteira: só o dono liga, desliga
  // ou desconecta (01/10, acabamento). O membro publica nas que existem.
  const recusa = await soODono(userId, account.project, "mudar as redes conectadas deste projeto");
  if (recusa) return recusa;

  const updated = await prisma.socialAccount.update({
    where: { id },
    data: { isActive },
    select: { id: true, isActive: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  // A conta precisa ser de um projeto de quem pediu. Até 28/09 esta rota
  // apagava qualquer conta pelo id, de qualquer cliente.
  const conta = await prisma.socialAccount.findFirst({
    where: { id, project: projetoVisivel(userId) },
    select: { id: true, platform: true, accessToken: true, project: { select: { userId: true } } },
  });
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  const recusa = await soODono(userId, conta.project, "desconectar as redes deste projeto");
  if (recusa) return recusa;
  // TikTok: revoga o acesso do lado deles também (ver revokeTikTokToken).
  if (conta.platform === "tiktok" && conta.accessToken) {
    await revokeTikTokToken(conta.accessToken).catch((e) => console.warn("[tiktok] revogação falhou:", e));
  }
  // Os posts desta conta guardam para onde iam, para a reconexão devolvê-los
  // (ver lib/publish/contas-orfas.ts: em 21/09 o post da página saiu no perfil).
  await marcarPostsDaConta(id);
  await prisma.socialAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
