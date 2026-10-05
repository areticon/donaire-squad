import Link from "next/link";
import { returnToSeguro } from "@/lib/oauth/return-to";

export const dynamic = "force-dynamic";

const NOMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X (Twitter)",
};

const MOTIVOS: Record<string, string> = {
  cancelado: "A autorização foi cancelada na tela da rede.",
  "sem-pagina": "Nenhuma página foi liberada na tela da Meta. Tente de novo e marque a página em Editar configurações.",
  "sem-permissao": "Só o dono do projeto pode conectar as redes dele.",
};

/**
 * A VOLTA DO LOGIN DA REDE FORA DA SESSÃO (04/10).
 *
 * Público de propósito (proxy.ts): no celular, o app do Instagram ou do
 * Facebook devolve a pessoa no navegador DE DENTRO DO APP, onde a Demandou não
 * está logada. Mandar para /projects/... ali dava o /sign-in, e a pessoa
 * ficava presa no Instagram (achado do dono em 04/10). A conta já foi gravada
 * pelo callback; esta página só diz isso e manda voltar. A aba original da
 * Demandou consulta as contas de tempos em tempos e avança sozinha.
 */
export default async function ConectadoPage({
  searchParams,
}: {
  searchParams: Promise<{ rede?: string; erro?: string; volta?: string }>;
}) {
  const q = await searchParams;
  const nome = NOMES[q.rede ?? ""] ?? "A rede";
  const volta = returnToSeguro(q.volta, "/dashboard");
  const deuErro = Boolean(q.erro);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="font-mont font-bold text-xl lowercase" style={{ color: "var(--text-primary)" }}>
            demandou.
          </span>
        </div>
        <div
          className="rounded-2xl border p-6 sm:p-8 space-y-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          {deuErro ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {nome} não foi conectado
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {MOTIVOS[q.erro ?? ""] ?? "A rede não confirmou a autorização."} Volte para a Demandou e toque em Conectar de
                novo.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {nome} conectado
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Pronto, a conta já está ligada ao seu projeto. Pode fechar esta tela e voltar para a aba ou o navegador
                onde a Demandou está aberta: ela atualiza sozinha em alguns segundos.
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Se você abriu o login pelo app do {nome}, feche o app e volte para o navegador.
              </p>
            </>
          )}
          <Link
            href={volta}
            className="inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "#F97316" }}
          >
            Voltar para a Demandou
          </Link>
        </div>
      </div>
    </div>
  );
}
