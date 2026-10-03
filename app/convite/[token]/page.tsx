import Link from "next/link";
import { currentUser } from "@/lib/auth/server";
import { lerConvite } from "@/lib/equipe/convites";
import { AceitarConvite } from "@/components/equipe/aceitar-convite";

export const dynamic = "force-dynamic";

/**
 * A PÁGINA DO CONVITE DA EQUIPE (01/10/2026).
 *
 * Fica FORA do grupo (app) de propósito: o layout de lá aplica o portão de
 * entrada, que manda quem não tem plano para /planos. Quem foi convidado não
 * tem plano (e não deve ter: quem paga é o dono), então o convite precisa ser
 * aceito antes de a pessoa passar pelo portão.
 *
 * Três situações: sem sessão (entrar ou criar a conta com o e-mail convidado),
 * sessão com outro e-mail (trocar de conta) e sessão certa (aceitar).
 */
export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [convite, eu] = await Promise.all([lerConvite(token), currentUser()]);
  const aqui = `/convite/${token}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* Montserrat negrito, o logotipo de antes (de volta em 01/10). */}
          <span className="font-mont font-bold text-xl lowercase" style={{ color: "var(--text-primary)" }}>
            demandou.
          </span>
        </div>
        <div className="rounded-2xl border p-6 sm:p-8 space-y-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
          <p className="rotulo">Convite para a equipe</p>

          {!convite.valido ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Este convite não vale mais
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {convite.motivo}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-balance" style={{ color: "var(--text-primary)" }}>
                <span className="destaque">{convite.quemConvida}</span> chamou você para a equipe
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Você entra com o seu próprio login e usa os projetos que a equipe liberar para você. O consumo sai da
                conta da empresa: você não paga nada.
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Convite para <strong style={{ color: "var(--text-primary)" }}>{convite.email}</strong>.
              </p>

              {!eu ? (
                <div className="flex flex-col gap-2.5">
                  <Link
                    href={`/sign-up?email=${encodeURIComponent(convite.email)}&redirect=${encodeURIComponent(aqui)}`}
                    className="inline-flex h-12 items-center justify-center rounded-lg bg-marca-600 px-6 text-base font-medium text-white hover:bg-marca-700"
                  >
                    Criar minha conta
                  </Link>
                  <Link
                    href={`/sign-in?email=${encodeURIComponent(convite.email)}&redirect=${encodeURIComponent(aqui)}`}
                    className="inline-flex h-11 items-center justify-center rounded-lg border px-6 text-sm font-medium"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Já tenho conta com este e-mail
                  </Link>
                </div>
              ) : eu.email.toLowerCase() !== convite.email.toLowerCase() ? (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: "var(--marca-laranja-texto)" }}>
                    Você está conectado como {eu.email}. Este convite é para {convite.email}.
                  </p>
                  <Link
                    href={`/sign-in?email=${encodeURIComponent(convite.email)}&redirect=${encodeURIComponent(aqui)}`}
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg border px-6 text-sm font-medium"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Entrar com {convite.email}
                  </Link>
                </div>
              ) : (
                <AceitarConvite token={token} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
