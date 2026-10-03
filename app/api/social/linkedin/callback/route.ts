import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { fotoPermanente } from "@/lib/social/foto-permanente";
import {
  exchangeLinkedInCode,
  exchangeLinkedInCodeForPages,
  getLinkedInProfile,
  getLinkedInAdminPages,
} from "@/lib/oauth/linkedin";
import { prisma } from "@/lib/db/prisma";
import { readotarPostsOrfaos } from "@/lib/publish/contas-orfas";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const errorDesc = req.nextUrl.searchParams.get("error_description");

  const savedState = req.cookies.get("oauth_state")?.value;
  const projectId = req.cookies.get("oauth_project_id")?.value;
  const forPages = req.cookies.get("oauth_for_pages")?.value === "1";
  const returnTo = req.cookies.get("oauth_return_to")?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const baseReturn = returnToSeguro(
    returnTo,
    projectId ? `/projects/${projectId}/settings` : "/dashboard"
  );
  const settingsUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}linkedin=success`;
  const errorUrl = `${appUrl}${baseReturn}${baseReturn.includes("?") ? "&" : "?"}linkedin=error`;

  if (error || !code || !state || state !== savedState || !projectId) {
    console.error("[linkedin/callback] OAuth error:", error, errorDesc);
    return NextResponse.redirect(new URL(errorUrl));
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
    const redirectUri = `${appUrl}/api/social/linkedin/callback`;

    if (forPages) {
      // ── Pages app (Community Management API) ────────────────────────────────
      const tokens = await exchangeLinkedInCodeForPages(code, redirectUri);
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Sem `userinfo` aqui: o app de paginas nao tem o escopo `openid` (o
      // LinkedIn nao deixa a Community Management API conviver com o Sign In
      // no mesmo app), e o perfil de quem conectou so servia para o log.
      const orgPages = await getLinkedInAdminPages(tokens.access_token);
      console.log(`[linkedin/callback] pages app: ${orgPages.length} page(s) for project ${projectId}`);

      for (const page of orgPages) {
        await prisma.socialAccount.upsert({
          where: {
            projectId_platform_platformUserId: {
              projectId,
              platform: "linkedin",
              platformUserId: page.organizationId,
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
            displayName: page.name,
            username: page.vanityName ?? null,
            accountType: "organization",
            organizationId: page.organizationId,
            isActive: false,
          },
          create: {
            projectId,
            platform: "linkedin",
            platformUserId: page.organizationId,
            accountType: "organization",
            organizationId: page.organizationId,
            accessToken: tokens.access_token,
            // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
            // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
            needsReconnectAt: null,
            needsReconnectReason: null,
            refreshToken: tokens.refresh_token ?? null,
            tokenExpiresAt,
            displayName: page.name,
            username: page.vanityName ?? null,
            isActive: false,
          },
        });
        await readotarPostsOrfaos(projectId, "linkedin", page.organizationId);
      }

      // VOLTA PARA ONDE SAIU, e não sempre para /settings.
      //
      // O `returnTo` já era gravado no cookie pelo connect e este ramo o
      // ignorava, mandando todo mundo para as Configurações. Enquanto a única
      // porta para páginas estava nas Configurações, o efeito era invisível.
      // Em 18/09 a porta entrou na ETAPA 1 do assistente, e sem isto quem
      // conectasse a página no meio do setup seria cuspido para fora da
      // jornada, numa tela que ele ainda nem sabia que existia.
      const voltarPara = req.cookies.get("oauth_return_to")?.value;
      const destino = voltarPara ?? (projectId ? `/projects/${projectId}/settings` : "/dashboard");
      const juntar = destino.includes("?") ? "&" : "?";
      const pagesSuccessUrl = `${appUrl}${destino}${juntar}linkedin=pages_success&pages_count=${orgPages.length}`;

      const res = NextResponse.redirect(new URL(pagesSuccessUrl));
      res.cookies.delete("oauth_state");
      res.cookies.delete("oauth_project_id");
      res.cookies.delete("oauth_for_pages");
      res.cookies.delete("oauth_return_to");
      return res;

    } else {
      // ── Personal app (Share on LinkedIn) ────────────────────────────────────
      const tokens = await exchangeLinkedInCode(code, redirectUri);
      const profile = await getLinkedInProfile(tokens.access_token);
      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await prisma.socialAccount.upsert({
        where: {
          projectId_platform_platformUserId: {
            projectId,
            platform: "linkedin",
            platformUserId: profile.sub,
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
          username: profile.email,
          avatarUrl: await fotoPermanente(profile.picture, "linkedin", profile.sub),
          accountType: "personal",
          isActive: true,
        },
        create: {
          projectId,
          platform: "linkedin",
          platformUserId: profile.sub,
          accountType: "personal",
          accessToken: tokens.access_token,
          // Reconectar limpa a marca de recusa: a conta volta a poder publicar e some
          // do estado "reconectar" na tela. Sem isto ela ficaria presa nele.
          needsReconnectAt: null,
          needsReconnectReason: null,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiresAt,
          displayName: profile.name,
          username: profile.email,
          avatarUrl: await fotoPermanente(profile.picture, "linkedin", profile.sub),
          isActive: true,
        },
      });
      await readotarPostsOrfaos(projectId, "linkedin", profile.sub);

      const res = NextResponse.redirect(new URL(settingsUrl));
      res.cookies.delete("oauth_state");
      res.cookies.delete("oauth_project_id");
      res.cookies.delete("oauth_for_pages");
      res.cookies.delete("oauth_return_to");
      return res;
    }
  } catch (err) {
    console.error("[linkedin/callback]", err);
    return NextResponse.redirect(new URL(errorUrl));
  }
}
