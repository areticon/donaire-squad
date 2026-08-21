import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/sign-in/,
  /^\/sign-up/,
  /^\/api\/auth\//,
  /^\/api\/webhooks\//,
  /^\/api\/cron\//,
  /^\/a\//,
  // As páginas legais vivem em /terms e /privacy. As variantes em português
  // ficaram aqui um tempo apontando para rotas que nunca existiram, e o efeito
  // era um visitante deslogado cair no login ao clicar em "Termos" no rodapé.
  // Documento legal atrás de login não cumpre o papel de documento legal.
  /^\/terms/,
  /^\/privacy/,
  // Escolha de plano vem antes do cadastro; visitante deslogado é o público.
  /^\/planos/,
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.some((r) => r.test(pathname))) {
    return NextResponse.next();
  }

  // Rotas de API protegidas fazem sua própria checagem de sessão (retornam 401).
  // O proxy só faz o gate otimista de páginas: sem cookie de sessão → sign-in.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // O layout do app precisa saber em que rota está para decidir o portão de
  // plano, e o App Router não entrega o pathname para um layout. O proxy roda
  // na borda e não alcança o banco, então quem decide é o layout; aqui só
  // carimbamos o caminho no cabeçalho da requisição.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
