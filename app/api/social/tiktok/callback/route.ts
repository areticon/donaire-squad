import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { fotoPermanente } from "@/lib/social/foto-permanente";
import { prisma } from "@/lib/db/prisma";
import { readotarPostsOrfaos } from "@/lib/publish/contas-orfas";
import { exchangeTikTokCode, getTikTokUser, lerInfoDoCriador } from "@/lib/oauth/tiktok";
import { projetoVisivel } from "@/lib/equipe/conta";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const savedState = req.cookies.get("oauth_state")?.value;
  const cookieUserId = req.cookies.get("oauth_user_id")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const returnTo = req.cookies.get("oauth_return_to")?.value;
  const verificador = req.cookies.get("oauth_tiktok_verificador")?.value;

  let userId = cookieUserId;
  if (!userId) {
    const session = await auth();
    userId = session.userId ?? undefined;
  }
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const baseReturn = returnToSeguro(
    returnTo,
    projectId ? `/projects/${projectId}/settings` : "/dashboard"
  );
  const sep = baseReturn.includes("?") ? "&" : "?";
  const successUrl = `${appUrl}${baseReturn}${sep}tiktok=success`;
  const errorUrl = (motivo?: string) =>
    `${appUrl}${baseReturn}${sep}tiktok=error${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ""}`;

  if (error || !code || !state || state !== savedState || !projectId || !verificador) {
    return NextResponse.redirect(errorUrl(error ?? undefined));
  }

  // O projeto precisa ser de quem conectou: o cookie é nosso, mas conferir no
  // banco custa uma consulta e fecha a porta de gravar conta em projeto alheio.
  const projeto = await prisma.project.findFirst({ where: { id: projectId, ...projetoVisivel(userId) }, select: { id: true } });
  if (!projeto) return NextResponse.redirect(errorUrl("projeto"));

  // QUEM VOLTA DO LOGIN DA REDE precisa poder conectar redes NESTE projeto
  // (01/10, acabamento do acesso de equipe). O projeto vem de um cookie, e o
  // cookie sozinho nÃ£o prova nada: conferimos com a sessÃ£o de quem voltou que
  // ela Ã© dona do projeto (membro da equipe nÃ£o conecta rede; ver
  // lib/equipe/permissoes.ts). Sem sessÃ£o, nÃ£o grava conta nenhuma.
  const quemVolta = (await auth()).userId;
  if (!quemVolta) return NextResponse.redirect(new URL("/sign-in", req.url));
  const barrado = await soQuemConectaRedes(quemVolta, projectId);
  if (barrado) return barrado;

  try {
    const redirectUri = `${appUrl}/api/social/tiktok/callback`;
    const tokens = await exchangeTikTokCode(code, redirectUri, verificador);
    const usuario = await getTikTokUser(tokens.accessToken);
    // O @ da conta não vem no escopo básico, mas vem na consulta do criador
    // (escopo de publicar, que acabamos de receber). É com ele que se monta o
    // link do vídeo publicado.
    const criador = await lerInfoDoCriador(tokens.accessToken).catch(() => null);

    const dados = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      displayName: criador?.nome || usuario.nome,
      username: criador?.usuario || null,
      avatarUrl: await fotoPermanente(criador?.avatarUrl ?? usuario.avatarUrl, "tiktok", usuario.openId),
      isActive: true,
      // Reconectar limpa a marca de recusa (ver schema, needsReconnectAt).
      needsReconnectAt: null,
      needsReconnectReason: null,
    };
    await prisma.socialAccount.upsert({
      where: {
        projectId_platform_platformUserId: {
          projectId,
          platform: "tiktok",
          platformUserId: usuario.openId,
        },
      },
      update: dados,
      create: { projectId, platform: "tiktok", platformUserId: usuario.openId, ...dados },
    });
    await readotarPostsOrfaos(projectId, "tiktok", usuario.openId);

    const res = NextResponse.redirect(successUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_user_id");
    res.cookies.delete("oauth_project_id");
    res.cookies.delete("oauth_return_to");
    res.cookies.delete("oauth_tiktok_verificador");
    return res;
  } catch (e) {
    console.error("[tiktok/callback]", e);
    return NextResponse.redirect(errorUrl(e instanceof Error ? e.message.slice(0, 200) : undefined));
  }
}
