"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  // Quem sabe se o provedor está de pé é o servidor, que enxerga as
  // credenciais. Flag de build (NEXT_PUBLIC_*) exigia rebuild depois de
  // gravar a credencial, e falhava em silêncio quando esquecido.
  const [provedores, setProvedores] = useState<{ google: boolean; linkedin: boolean }>({
    google: false,
    linkedin: false,
  });
  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setProvedores({ google: Boolean(d.google), linkedin: Boolean(d.linkedin) }))
      .catch(() => undefined);
  }, []);
  const showGoogle = provedores.google;
  const showLinkedIn = provedores.linkedin;

  const router = useRouter();
  const searchParams = useSearchParams();

  // Quem chegou por um card de preço traz ?plan= (e ?ciclo=anual no anual).
  // Nesse caso o destino depois da conta criada é o checkout daquele plano,
  // não o dashboard: a pessoa já decidiu, o caminho não pode soltá-la no meio.
  const plan = searchParams.get("plan");
  const ciclo = searchParams.get("ciclo");
  const planRedirect = plan
    ? `/billing/start?plan=${encodeURIComponent(plan)}${ciclo ? `&ciclo=${encodeURIComponent(ciclo)}` : ""}`
    : null;
  const redirect = planRedirect ?? searchParams.get("redirect") ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });

    setLoading(false);

    if (error) {
      setError(
        error.message === "Invalid email or password"
          ? "Email ou senha inválidos"
          : error.message ?? "Algo deu errado. Tente novamente."
      );
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  // Erro do provedor social volta como query param. Sem tratar, a pessoa é
  // jogada na home com "?error=account_not_linked" na barra e nenhuma pista
  // do que fazer (achado do teste de jornada de 21/08).
  const erroSocial = searchParams.get("error");
  useEffect(() => {
    if (!erroSocial) return;
    setError(
      erroSocial === "account_not_linked"
        ? "Já existe uma conta com esse e-mail criada com senha. Entre com a senha abaixo, ou peça a redefinição por e-mail."
        : "Não consegui concluir o login pelo provedor. Tente de novo ou use e-mail e senha."
    );
  }, [erroSocial]);

  async function handleSocial(provider: "google" | "linkedin") {
    setError(null);
    await authClient.signIn.social({
      provider,
      callbackURL: redirect,
      // Sem isto o erro cai na home, longe do formulário que resolve.
      errorCallbackURL: mode === "sign-in" ? "/sign-in" : "/sign-up",
      // Decisão de 21/08: quem entra pelo LinkedIn já sai conectado para
      // publicar. Publicar exige `w_member_social`, que é escopo separado do
      // login, então o token da sessão não serviria para postar e a pessoa
      // teria que autorizar de novo na etapa 1. Pedindo aqui, é uma tela de
      // consentimento só.
      //
      // ATENÇÃO à semântica: `scopes` SUBSTITUI os padrões, não soma (está
      // na descrição do parâmetro no better-auth). A primeira versão passou
      // só w_member_social, o openid saiu do pedido, o LinkedIn não devolveu
      // identidade e o login inteiro quebrou em produção. A lista tem que
      // ser completa: os três do OIDC mais o de publicar.
      //
      // O custo é honesto e está assumido: a tela do LinkedIn avisa no
      // cadastro que a Demandou vai criar posts em nome da pessoa. É
      // exatamente o que o produto faz.
      ...(provider === "linkedin"
        ? { scopes: ["openid", "profile", "email", "w_member_social"] }
        : {}),
    });
  }

  const socialBtnClass =
    "w-full flex items-center justify-center gap-2 bg-[#313338] border border-[#3f4147] text-[#dbdee1] hover:bg-[#2b2d31] rounded-lg py-2.5 text-sm font-medium transition-colors";

  return (
    <div className="bg-[#111] border border-[#3f4147] rounded-xl p-6">
      {(showGoogle || showLinkedIn) && (
        <div className="space-y-2">
        {showGoogle && (
          <button
            type="button"
            onClick={() => handleSocial("google")}
            className={socialBtnClass}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
              />
            </svg>
            Continuar com Google
          </button>
        )}
        {showLinkedIn && (
          <button
            type="button"
            onClick={() => handleSocial("linkedin")}
            className={socialBtnClass}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#0A66C2"
                d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"
              />
            </svg>
            Continuar com LinkedIn
          </button>
        )}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#3f4147]" />
            <span className="text-xs text-[#949ba4]">ou</span>
            <div className="flex-1 h-px bg-[#3f4147]" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "sign-up" && (
          <div>
            <label htmlFor="name" className="block text-sm text-[#949ba4] mb-1.5">
              Nome
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full bg-[#313338] border border-[#3f4147] text-[#dbdee1] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Seu nome"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm text-[#949ba4] mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full bg-[#313338] border border-[#3f4147] text-[#dbdee1] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="voce@empresa.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm text-[#949ba4] mb-1.5">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="w-full bg-[#313338] border border-[#3f4147] text-[#dbdee1] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder={mode === "sign-up" ? "Mínimo 8 caracteres" : "Sua senha"}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-semibold transition-colors"
        >
          {loading
            ? "Aguarde..."
            : mode === "sign-in"
              ? "Entrar"
              : "Criar conta"}
        </button>
      </form>

      <p className="text-sm text-[#949ba4] text-center mt-5">
        {mode === "sign-in" ? (
          <>
            Não tem conta?{" "}
            <a href="/sign-up" className="text-orange-400 hover:text-orange-300">
              Criar conta
            </a>
          </>
        ) : (
          <>
            Já tem conta?{" "}
            <a href="/sign-in" className="text-orange-400 hover:text-orange-300">
              Entrar
            </a>
          </>
        )}
      </p>
    </div>
  );
}
