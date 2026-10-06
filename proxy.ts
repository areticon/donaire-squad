import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/sign-in/,
  /^\/sign-up/,
  // Recuperar a senha é, por definição, coisa de quem não consegue entrar.
  /^\/esqueci-a-senha/,
  /^\/redefinir-senha/,
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
  // A demonstração é a entrada da Demandou desde 27/09/2026 (plano anual,
  // empresas acima de R$ 100 mil por mês): é página de visitante.
  /^\/demonstracao/,
  // O agendamento do onboarding (05/10) chega pelo e-mail de boas-vindas do
  // contrato, e o cliente pode ainda não ter escolhido a senha: o token do
  // contrato na URL é a autorização.
  /^\/onboarding\/agendar\//,
  // O convite da equipe (01/10) é aberto por quem ainda não tem conta: a
  // própria página pede para entrar ou criar a conta com o e-mail convidado.
  /^\/convite\//,
  // A volta do login da rede (04/10): no celular ela cai no navegador de
  // dentro do app do Instagram/Facebook, sem sessão. Ver app/conectado/page.tsx.
  /^\/conectado/,
  // As telas de exemplo (06/10, biblioteca de design) só existem no `next dev`
  // (a página responde 404 fora dele) e mostram dados em memória, sem sessão.
  /^\/exemplos\//,
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
    // O destino leva a QUERY junto. Sem ela, /billing/start?plan=business&
    // ciclo=anual voltava do login como /billing/start e abria o checkout do
    // plano padrão, ou seja cobrava outro plano do que a pessoa escolheu.
    signInUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
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
    // `glb` entrou em 18/09: o modelo do escritorio 3D e estatico e publico
    // (CC0), e sem ele aqui o proxy mandava o arquivo para o /sign-in.
    //
    // `mp4` e `webm` entraram em 19/09, pela MESMA armadilha e com um dia de
    // diferenca: o clipe do hero e estatico e publico, e sem eles nesta lista o
    // proxy devolvia a PAGINA DE LOGIN no lugar do video. O sintoma engana,
    // porque o arquivo responde 200: o que vem no corpo e HTML, e o navegador
    // so mostra um retangulo preto.
    //
    // A licao e a lista, e nao a extensao: toda vez que o produto passa a
    // servir um tipo de arquivo novo de `public/`, ele precisa entrar aqui.
    //
    // `txt` entrou em 28/09: o TikTok verifica a posse do site lendo um arquivo
    // de assinatura (public/tiktok*.txt), e o robo dele nao tem sessao.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|glb|mp4|webm|mov|txt)).*)",
    "/(api|trpc)(.*)",
  ],
};
