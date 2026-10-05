import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import { assinarEstado } from "@/lib/oauth/estado-assinado";
import { getFacebookAuthUrl, facebookConfigured } from "@/lib/oauth/facebook";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!facebookConfigured()) {
    return NextResponse.json(
      { error: "Facebook ainda não configurado (FACEBOOK_APP_ID/SECRET ausentes)" },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  // Conectar rede é configuração do projeto: só o dono, e só em projeto que
  // ele vê (01/10, acabamento). Ver lib/equipe/permissoes.ts.
  const barrado = await soQuemConectaRedes(userId, projectId);
  if (barrado) return barrado;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const redirectUri = `${appUrl}/api/social/facebook/callback`;

  const defaultReturn = `/projects/${projectId}/settings`;
  const returnTo = returnToSeguro(
    req.nextUrl.searchParams.get("returnTo"),
    defaultReturn
  );
  // O state leva, assinado, quem pediu, o projeto e a volta: o callback pode
  // cair no navegador de dentro do app do Instagram/Facebook, sem os cookies
  // daqui. Ver lib/oauth/estado-assinado.ts.
  const state = assinarEstado({ userId, projectId, returnTo });

  const res = NextResponse.redirect(getFacebookAuthUrl(redirectUri, state));
  const cookieOpts = { httpOnly: true, maxAge: 600, path: "/" } as const;
  res.cookies.set("oauth_state", state, cookieOpts);
  res.cookies.set("oauth_user_id", userId, cookieOpts);
  res.cookies.set("oauth_project_id", projectId, cookieOpts);
  res.cookies.set("oauth_return_to", returnTo, cookieOpts);
  return res;
}
