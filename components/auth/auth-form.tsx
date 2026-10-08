"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { BotaoDescartar } from "@/components/ui/descartar";
import { useAntiRobo } from "@/components/anti-robo/use-anti-robo";
import { CABECALHO_DA_PROVA } from "@/lib/anti-robo/regras";

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
  // A defesa contra robô (01/10): isca invisível, tempo mínimo e Turnstile
  // quando ligado. Só o cadastro usa; no login ela não pesa em nada.
  const antiRobo = useAntiRobo();

  // Quem chegou por um card de preço traz ?plan= (e ?ciclo=anual no anual).
  // Nesse caso o destino depois da conta criada é o checkout daquele plano,
  // não o dashboard: a pessoa já decidiu, o caminho não pode soltá-la no meio.
  const plan = searchParams.get("plan");
  const ciclo = searchParams.get("ciclo");
  const planRedirect = plan
    ? `/billing/start?plan=${encodeURIComponent(plan)}${ciclo ? `&ciclo=${encodeURIComponent(ciclo)}` : ""}`
    : null;
  const redirect = planRedirect ?? searchParams.get("redirect") ?? "/dashboard";

  /**
   * O CADASTRO NAO LEVA A LUGAR NENHUM, e por isso ele fala.
   *
   * Achado pelo Bruno em 23/09, entrando por uma guia anonima: ele preencheu
   * tudo, confirmou, "nao aparece nada" e caiu de volta na tela de login.
   *
   * A causa: com a confirmacao de e-mail obrigatoria, `signUp.email` cria a
   * conta e manda o e-mail, mas NAO abre sessao. O `router.push` seguinte
   * batia no layout do app, que nao encontrava sessao e devolvia para o
   * login. Do lado de quem se cadastrou, o produto engoliu o cadastro.
   *
   * Agora o formulario nao navega: ele vira um aviso dizendo para onde o
   * e-mail foi. **Navegar depois de cadastrar era a propria mentira**, porque
   * nao ha para onde ir antes de confirmar.
   */
  const [cadastrado, setCadastrado] = useState<string | null>(null);
  /** E-mail que JA tem conta: a pessoa precisa entrar, e nao se cadastrar. */
  const [jaTemConta, setJaTemConta] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  const [name, setName] = useState("");
  // O convite da equipe (01/10) traz o e-mail convidado: a pessoa entra ou se
  // cadastra com ele, e o aceite confere que é o mesmo.
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setJaTemConta(false);
    setLoading(true);

    /**
     * O LINK DO E-MAIL CAI NO CHECKOUT, e nao no painel.
     *
     * Pedido do Bruno em 23/09: "precisa confirmar o email e ja cair no
     * checkout". Faz sentido alem da conversao: quem confirma o e-mail ainda
     * nao tem plano, e sem plano o portao de entrada devolve essa pessoa para
     * a pagina de planos de qualquer jeito. Mandar direto poupa um salto e
     * uma tela que parece erro.
     *
     * Quem chegou por um card de preco ja traz o destino no `redirect`, e
     * nesse caso ele vence: a pessoa ja escolheu o plano.
     */
    // Quem veio do convite da equipe (01/10) volta para o convite, e não para
    // os planos: quem paga é o dono da conta, não ele.
    const destinoDoEmail = planRedirect ?? (redirect.startsWith("/convite/") ? redirect : "/planos?assinar=1");

    /**
     * O E-MAIL JA EXISTE? A PERGUNTA VEM ANTES DO CADASTRO.
     *
     * Medido em 23/09: o `sign-up` responde 200 com um objeto de usuario
     * quando o e-mail ja tem conta. Nao cria, nao manda e-mail, nao altera
     * nada, e a resposta e indistinguivel da verdadeira. Sem esta pergunta, a
     * tela dizia "sua conta foi criada" para quem ja tinha conta, nenhum
     * e-mail chegava, e a pessoa ficava presa sem saber que bastava entrar.
     *
     * O porque da rota, e a troca de enumeracao que ela assume, esta em
     * app/api/auth/email-existe.
     */
    // A PROVA DE QUE É GENTE vem antes de tudo no cadastro (01/10). Ela espera
    // em silêncio o tempo mínimo desde que a tela abriu, então quem preenche
    // rápido vê "Aguarde..." por um instante, e não um erro.
    const provaDoCadastro = mode === "sign-up" ? await antiRobo.prova() : null;

    if (mode === "sign-up") {
      const existe = await fetch("/api/auth/email-existe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
        .then((r) => r.json())
        .then((d: { existe?: boolean }) => Boolean(d.existe))
        .catch(() => false);
      if (existe) {
        setLoading(false);
        setJaTemConta(true);
        return;
      }
    }

    const { error } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email(
            {
              email,
              password,
              name,
              callbackURL: destinoDoEmail,
            },
            // A prova vai no cabeçalho: o corpo do cadastro do better-auth tem
            // formato fixo. Quem confere é o gancho em lib/auth/index.ts.
            { headers: { [CABECALHO_DA_PROVA]: JSON.stringify(provaDoCadastro ?? {}) } }
          );

    setLoading(false);

    if (error) {
      setError(
        error.message === "Invalid email or password"
          ? "Email ou senha inválidos"
          : error.message ?? "Algo deu errado. Tente novamente."
      );
      return;
    }

    // O PASSO `cadastro` DO FUNIL SAIU DAQUI em 01/10. Ele era disparado pelo
    // navegador logo depois do cadastro, ANTES de o e-mail ser confirmado, e o
    // robô roda este mesmo código: 97 "cadastros" em 30 dias, quase todos de
    // robô, nenhum com usuário ligado. Agora quem registra é o servidor, no
    // instante em que o e-mail é confirmado (lib/auth/index.ts), que é quando
    // existe uma pessoa do outro lado.

    /**
     * Cadastro NAO navega: a conta existe e a sessao nao. Ver o comentario do
     * estado `cadastrado`.
     */
    if (mode === "sign-up") {
      setCadastrado(email);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  /** Pede outro e-mail de confirmacao, para quem nao recebeu ou deixou vencer. */
  async function reenviar() {
    if (!cadastrado) return;
    setReenviando(true);
    setReenviado(false);
    await authClient
      .sendVerificationEmail({ email: cadastrado, callbackURL: planRedirect ?? (redirect.startsWith("/convite/") ? redirect : "/planos?assinar=1") })
      .catch(() => undefined);
    setReenviando(false);
    setReenviado(true);
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
        : // Conta social com e-mail ainda não confirmado pelo provedor (01/10):
          // a sessão só abre depois da confirmação, e o link já foi enviado.
          erroSocial === "unable_to_create_session"
          ? "Falta confirmar o seu e-mail. Enviamos um link para a sua caixa: clique nele e depois entre de novo."
          : // O código cru vai junto de propósito: sem ele, um erro de provedor
          // vira "não consegui" e ninguém descobre a causa (aconteceu em
          // 21/08, e o diagnóstico ficou às cegas).
          `Não consegui concluir o login pelo provedor (código: ${erroSocial}). Tente de novo ou use e-mail e senha.`
    );
  }, [erroSocial]);

  async function handleSocial(provider: "google" | "linkedin") {
    setError(null);
    await authClient.signIn.social({
      provider,
      callbackURL: redirect,
      // Sem isto o erro cai na home, longe do formulário que resolve.
      errorCallbackURL: mode === "sign-in" ? "/sign-in" : "/sign-up",
      // O escopo extra do LinkedIn (w_member_social) vive na configuração do
      // provedor em lib/auth/index.ts, não aqui. Ver o comentário de lá.
    });
  }

  const socialBtnClass =
    "w-full flex items-center justify-center gap-2 bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--realce-2)] rounded-lg py-2.5 text-sm font-medium transition-colors";

  if (jaTemConta) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Esse e-mail já tem conta</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          <span className="text-[var(--text-primary)] font-medium">{email}</span> já está cadastrado na Demandou.
          Entre com a sua senha, ou{" "}
          <a href={`/esqueci-a-senha?email=${encodeURIComponent(email)}`} className="text-orange-400 hover:text-orange-300">
            troque a senha
          </a>{" "}
          se não lembrar dela.
        </p>
        <a
          href={`/sign-in?email=${encodeURIComponent(email)}${redirect.startsWith("/convite/") ? `&redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="mt-5 inline-block w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          Entrar com esse e-mail
        </a>
        <button
          type="button"
          onClick={() => setJaTemConta(false)}
          className="mt-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Usar outro e-mail
        </button>
      </div>
    );
  }

  if (cadastrado) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-orange-500/15 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ color: "var(--acento)" }}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Sua conta foi criada</h2>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          Enviamos um e-mail de confirmação para{" "}
          <span className="text-[var(--text-primary)] font-medium">{cadastrado}</span>. Abra e clique no botão para
          ativar a conta e escolher o seu plano.
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-4 leading-relaxed">
          O link vale por 1 hora. Não achou? Veja no spam ou nas promoções.
        </p>
        <button
          type="button"
          onClick={reenviar}
          disabled={reenviando || reenviado}
          className="mt-4 text-sm font-medium text-orange-400 hover:text-orange-300 disabled:opacity-60"
        >
          {reenviado ? "E-mail reenviado" : reenviando ? "Reenviando..." : "Reenviar o e-mail"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-[var(--shadow)] p-6">
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
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]">ou</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative space-y-4">
        {mode === "sign-up" && antiRobo.campos}
        {mode === "sign-up" && (
          <div>
            <label htmlFor="name" className="block text-sm text-[var(--text-muted)] mb-1.5">
              Nome
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Seu nome"
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm text-[var(--text-muted)] mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="voce@empresa.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm text-[var(--text-muted)]">
              Senha
            </label>
            {/* Não existia até 23/09: quem esquecia a senha não tinha saída. */}
            {mode === "sign-in" && (
              <a
                href={`/esqueci-a-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="text-xs text-orange-400 hover:text-orange-300"
              >
                Esqueci a senha
              </a>
            )}
          </div>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder={mode === "sign-up" ? "Mínimo 8 caracteres" : "Sua senha"}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" role="alert">
            <span className="flex-1">{error}</span>
            {/* X só local (07/10): fecha o erro e tira o ?error= da URL, para
                recarregar não trazer de volta o erro do login social. */}
            <BotaoDescartar
              compacto
              className="-my-0.5"
              aoDescartar={() => {
                setError(null);
                const u = new URL(window.location.href);
                if (u.searchParams.has("error")) {
                  u.searchParams.delete("error");
                  window.history.replaceState(window.history.state, "", u.toString());
                }
              }}
            />
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

      <p className="text-sm text-[var(--text-muted)] text-center mt-5">
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
