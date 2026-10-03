"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const campo =
  "w-full bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors";
const botao =
  "w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-60";

/**
 * PEDIR O LINK DE TROCA DE SENHA.
 *
 * A resposta é a mesma exista ou não a conta, e isso é do better-auth: dizer
 * "esse e-mail não tem conta" aqui viraria um verificador de e-mail para
 * qualquer um. Quem se cadastrou e não lembra o e-mail tem o cadastro, que
 * avisa quando o endereço já existe.
 */
export function PedirLink() {
  const sp = useSearchParams();
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" });
    setEnviando(false);
    if (error) {
      setErro("Não consegui mandar o link agora. Tente de novo em um minuto.");
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Confira seu e-mail</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Se <span className="text-[var(--text-primary)] font-medium break-all">{email}</span> tem conta na Demandou, o link para
          trocar a senha chega em instantes. Ele vale por 1 hora. Olhe também a caixa de spam.
        </p>
        <a href="/sign-in" className="mt-5 inline-block text-sm text-orange-400 hover:text-orange-300">
          Voltar para a entrada
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-[var(--text-muted)] mb-1.5">
          E-mail da conta
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={campo}
          placeholder="voce@empresa.com"
        />
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <button type="submit" disabled={enviando} className={botao}>
        {enviando ? "Enviando..." : "Mandar o link"}
      </button>
      <p className="text-center text-sm text-[var(--text-muted)]">
        Lembrou?{" "}
        <a href="/sign-in" className="text-orange-400 hover:text-orange-300">
          Entrar
        </a>
      </p>
    </form>
  );
}

/**
 * ESCOLHER A SENHA, pelo link do e-mail.
 *
 * Serve às duas situações, e a tela não precisa saber qual é: quem esqueceu a
 * senha e quem recebeu convite do admin chegam aqui com o mesmo token.
 */
export function EscolherSenha() {
  const sp = useSearchParams();
  const token = sp.get("token");
  const erroDoLink = sp.get("error");
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!token || erroDoLink) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Este link não vale mais</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          O link de senha vale por 1 hora e só pode ser usado uma vez. Peça outro e ele chega em instantes.
        </p>
        <a href="/esqueci-a-senha" className={`${botao} mt-5 inline-block`}>
          Pedir outro link
        </a>
      </div>
    );
  }

  if (pronto) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Senha salva</h2>
        <p className="text-sm text-[var(--text-muted)]">Agora é só entrar com o seu e-mail e a senha nova.</p>
        <a href="/sign-in" className={`${botao} mt-5 inline-block`}>
          Entrar
        </a>
      </div>
    );
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== repetida) {
      setErro("As duas senhas estão diferentes.");
      return;
    }
    setSalvando(true);
    const { error } = await authClient.resetPassword({ newPassword: senha, token: token! });
    setSalvando(false);
    if (error) {
      setErro(
        error.code === "INVALID_TOKEN"
          ? "Este link expirou ou já foi usado. Peça outro na tela de entrada."
          : "Não consegui salvar a senha. Tente de novo."
      );
      return;
    }
    setPronto(true);
  }

  return (
    <form onSubmit={salvar} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 space-y-4">
      <div>
        <label htmlFor="senha" className="block text-sm text-[var(--text-muted)] mb-1.5">
          Nova senha
        </label>
        <input
          id="senha"
          type="password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          className={campo}
          placeholder="Mínimo 8 caracteres"
        />
      </div>
      <div>
        <label htmlFor="repetida" className="block text-sm text-[var(--text-muted)] mb-1.5">
          Repita a senha
        </label>
        <input
          id="repetida"
          type="password"
          required
          minLength={8}
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
          className={campo}
        />
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <button type="submit" disabled={salvando} className={botao}>
        {salvando ? "Salvando..." : "Salvar a senha"}
      </button>
    </form>
  );
}
