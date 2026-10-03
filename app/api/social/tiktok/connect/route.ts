import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getTikTokAuthUrl, novoPkce, tiktokConfigured } from "@/lib/oauth/tiktok";

// Mesmo desenho das outras redes (ver youtube/connect): o estado e o projeto
// viajam em cookie curto, e a volta confere o estado antes de trocar o código.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!tiktokConfigured()) {
    return NextResponse.json(
      { error: "TikTok ainda não configurado (chaves do sandbox ou de produção ausentes)" },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  // Conectar rede é configuração do projeto: só o dono, e só em projeto que
  // ele vê (01/10, acabamento). Ver lib/equipe/permissoes.ts.
  const barrado = await soQuemConectaRedes(userId, projectId);
  if (barrado) return barrado;

  const state = crypto.randomBytes(16).toString("hex");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  // O redirect precisa ser idêntico ao cadastrado no portal do TikTok
  // (https://demandou.com/api/social/tiktok/callback). No dev local o TikTok
  // não aceita localhost, então a conexão só se prova em produção.
  const redirectUri = `${appUrl}/api/social/tiktok/callback`;

  const returnTo = returnToSeguro(
    req.nextUrl.searchParams.get("returnTo"),
    `/projects/${projectId}/settings`
  );

  const pkce = novoPkce();
  const res = NextResponse.redirect(getTikTokAuthUrl(redirectUri, state, pkce.desafio));
  const cookieOpts = { httpOnly: true, maxAge: 600, path: "/" } as const;
  // O verificador do PKCE só sai do servidor neste cookie, e volta na troca.
  res.cookies.set("oauth_tiktok_verificador", pkce.verificador, { ...cookieOpts, secure: true, sameSite: "lax" });
  res.cookies.set("oauth_state", state, cookieOpts);
  res.cookies.set("oauth_user_id", userId, cookieOpts);
  res.cookies.set("oauth_project_id", projectId, cookieOpts);
  res.cookies.set("oauth_return_to", returnTo, cookieOpts);
  return res;
}
