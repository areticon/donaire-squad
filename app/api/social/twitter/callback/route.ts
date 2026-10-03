import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { exchangeTwitterCode, getTwitterProfile } from "@/lib/oauth/twitter";
import { prisma } from "@/lib/db/prisma";
import { readotarPostsOrfaos } from "@/lib/publish/contas-orfas";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const savedState = req.cookies.get("oauth_state")?.value;
  // userId stored in cookie during connect to avoid Clerk session loss across OAuth redirect
  const cookieUserId = req.cookies.get("oauth_user_id")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const codeVerifier = req.cookies.get("oauth_code_verifier")?.value;
  const returnTo = req.cookies.get("oauth_return_to")?.value;

  // Fall back to Clerk session if cookie is missing (e.g. direct navigation)
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
  const settingsUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}twitter=success`;
  const errorUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}twitter=error`;

  if (error || !code || !state || state !== savedState || !projectId || !codeVerifier) {
    return NextResponse.redirect(errorUrl);
  }

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
    const redirectUri = `${appUrl}/api/social/twitter/callback`;
    const tokens = await exchangeTwitterCode(code, codeVerifier, redirectUri);
    const profile = await getTwitterProfile(tokens.access_token);

    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    await prisma.socialAccount.upsert({
      where: {
        projectId_platform_platformUserId: {
          projectId,
          platform: "twitter",
          platformUserId: profile.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
        // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
        needsReconnectAt: null,
        needsReconnectReason: null,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
        displayName: profile.name,
        username: profile.username,
        isActive: true,
      },
      create: {
        projectId,
        platform: "twitter",
        platformUserId: profile.id,
        accessToken: tokens.access_token,
        // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
        // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
        needsReconnectAt: null,
        needsReconnectReason: null,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiresAt,
        displayName: profile.name,
        username: profile.username,
        isActive: true,
      },
    });
    await readotarPostsOrfaos(projectId, "twitter", profile.id);

    const res = NextResponse.redirect(settingsUrl);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_user_id");
    res.cookies.delete("oauth_project_id");
    res.cookies.delete("oauth_code_verifier");
    res.cookies.delete("oauth_return_to");
    return res;
  } catch (err) {
    console.error("[twitter/callback]", err);
    // O MOTIVO VAI PARA A TELA (28/09). O Bruno viu só "Erro ao conectar X" e o
    // log dizia "unauthorized_client": o segredo do app tinha sido gerado de
    // novo no portal do X e o ambiente continuava com o antigo.
    const msg = err instanceof Error ? err.message : String(err);
    const motivo = /unauthorized_client|authorization header/i.test(msg)
      ? "as credenciais do app no X não batem com as da plataforma"
      : /invalid_grant|code/i.test(msg)
        ? "o código de autorização expirou, tente de novo"
        : "o X recusou a conexão";
    return NextResponse.redirect(`${errorUrl}&motivo=${encodeURIComponent(motivo)}`);
  }
}
