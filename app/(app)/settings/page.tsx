export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { assinaturaDoUsuario } from "@/lib/stripe/assinatura";
import { ContaForm } from "@/components/settings/conta-form";
import { PlanoECobranca } from "@/components/settings/plano-e-cobranca";
import { CreditBalance } from "@/components/billing/credit-balance";
import { FolderKanban } from "lucide-react";
import { Equipe } from "@/components/settings/equipe";
import { equipeNaTela } from "@/lib/equipe/convites";
import { projetoVisivel } from "@/lib/equipe/conta";
import { AvisosPorEmail } from "@/components/settings/avisos-por-email";

/**
 * Configurações da CONTA.
 *
 * Até 12/09/2026 esta rota era um redirect para /projects, e a engrenagem da
 * barra lateral apontava para lá também. Quem clicava na engrenagem procurando
 * a própria conta caía numa lista de projetos, que foi exatamente a queixa do
 * Bruno ("a tela de configuração não funciona").
 *
 * A divisão que passou a valer: o que é da PESSOA (nome, plano, cobrança) mora
 * aqui; o que é da MARCA (redes sociais, voz, nicho, estilo de vídeo) mora
 * dentro de cada projeto, porque um cliente pode ter mais de uma marca.
 *
 * Server component de propósito: a assinatura é lida do Stripe no servidor e
 * desce pronta. Ler no cliente exporia a chave ou exigiria mais uma rota, e a
 * tela não pode piscar "nenhum plano" enquanto busca.
 */

// "Equipe" entrou em 01/10 (acesso de equipe). Quem é MEMBRO não vê "Plano
// e cobrança": quem paga é o dono da conta.
const ABAS = [
  { id: "conta", rotulo: "Conta" },
  { id: "plano", rotulo: "Plano e cobrança" },
  { id: "equipe", rotulo: "Equipe" },
  { id: "projetos", rotulo: "Projetos" },
] as const;

const NOME_DO_PROVEDOR: Record<string, string> = {
  google: "Google",
  linkedin: "LinkedIn",
  "credential": "e-mail e senha",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { aba } = await searchParams;
  const equipe = await equipeNaTela(userId);
  const souMembro = equipe.papel === "membro";
  const abas = ABAS.filter((a) => !(souMembro && a.id === "plano"));
  const ativa = abas.some((a) => a.id === aba) ? (aba as string) : "conta";

  const [user, contas, projetos, assinatura] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, image: true, role: true, emailsDeAviso: true },
    }),
    prisma.account.findMany({ where: { userId }, select: { providerId: true } }),
    prisma.project.findMany({
      where: projetoVisivel(userId),
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, _count: { select: { socialAccounts: true } } },
    }),
    // Membro não tem assinatura: nem pergunta ao Stripe.
    souMembro ? null : assinaturaDoUsuario(userId),
  ]);

  const provedor = contas[0]?.providerId
    ? (NOME_DO_PROVEDOR[contas[0].providerId] ?? contas[0].providerId)
    : null;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Configurações
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {souMembro ? "Sua conta e a sua equipe." : "Sua conta, seu plano, sua cobrança e a sua equipe."} As redes
          sociais e a voz de cada marca ficam dentro do projeto.
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
        {abas.map((a) => {
          const atual = a.id === ativa;
          return (
            <Link
              key={a.id}
              href={`/settings?aba=${a.id}`}
              className="shrink-0 px-3.5 py-2.5 text-sm transition-colors"
              style={
                atual
                  ? {
                      color: "var(--accent-orange)",
                      fontWeight: 600,
                      borderBottom: "2px solid var(--accent-orange)",
                      marginBottom: -1,
                    }
                  : { color: "var(--text-muted)", fontWeight: 500 }
              }
            >
              {a.rotulo}
            </Link>
          );
        })}
      </div>

      {ativa === "conta" && (
        <div className="flex flex-col gap-6">
          <ContaForm
            nomeInicial={user.name ?? ""}
            email={user.email}
            provedor={provedor}
            imagem={user.image}
          />
          {/* Os e-mails de aviso (02/10): desligar deixa só os de aprovação. */}
          <AvisosPorEmail inicial={user.emailsDeAviso} />
          {/* O saldo mora na aba Conta porque é consumo da pessoa, não oferta.
              Admin também vê desde 03/10: o extrato dele é onde mora o total
              do consumo simulado do ciclo (o saldo não se move). */}
          <section
            className="rounded-xl border p-6"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <CreditBalance />
          </section>
        </div>
      )}

      {ativa === "plano" && assinatura && <PlanoECobranca assinatura={assinatura} />}

      {ativa === "equipe" && <Equipe inicial={equipe} />}

      {ativa === "projetos" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Redes sociais, voz, nicho, paleta, estilo de vídeo e semana padrão são de cada marca, e
            ficam dentro do projeto.
          </p>
          {projetos.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/settings`}
              className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors hover:border-orange-500/40"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <FolderKanban className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {p._count.socialAccounts} rede(s) conectada(s)
                    {p.status !== "active" ? ", ainda em configuração" : ""}
                  </p>
                </div>
              </div>
              {/* Membro vê as configurações em leitura (01/10, acabamento). */}
              <span className="shrink-0 text-sm font-medium text-orange-400">{souMembro ? "Ver" : "Configurar"}</span>
            </Link>
          ))}
          {projetos.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Você ainda não tem projeto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
