"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

const showGoogle = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

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

  async function handleGoogle() {
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: redirect,
    });
  }

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6">
      {showGoogle && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] text-[#f5f5f5] hover:bg-[#242424] rounded-lg py-2.5 text-sm font-medium transition-colors"
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
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#2a2a2a]" />
            <span className="text-xs text-[#9ca3af]">ou</span>
            <div className="flex-1 h-px bg-[#2a2a2a]" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "sign-up" && (
          <div>
            <label htmlFor="name" className="block text-sm text-[#9ca3af] mb-1.5">
              Nome
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f5f5f5] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Seu nome"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm text-[#9ca3af] mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f5f5f5] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="voce@empresa.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm text-[#9ca3af] mb-1.5">
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
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#f5f5f5] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
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

      <p className="text-sm text-[#9ca3af] text-center mt-5">
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
