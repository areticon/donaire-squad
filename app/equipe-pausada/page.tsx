import { redirect } from "next/navigation";
import { PauseCircle } from "lucide-react";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { membroAtivo, nomeDoDono } from "@/lib/equipe/conta";
import { fraseDaAssinaturaPausada } from "@/lib/equipe/regras";
import { SairDaConta } from "@/components/equipe/sair-da-conta";

export const dynamic = "force-dynamic";

/**
 * A EQUIPE COM A ASSINATURA PAUSADA (01/10, acabamento do acesso de equipe).
 *
 * Até aqui, quando a assinatura do dono caía, o portão de entrada mandava o
 * MEMBRO para /planos: o vendedor convidado via preços e um botão de assinar
 * que não é dele, e assinar ali criaria uma conta paga separada da equipe.
 * Esta tela diz o que aconteceu e com quem falar, sem preço e sem plano.
 *
 * Fica FORA do grupo (app) pelo mesmo motivo do convite: o layout de lá roda o
 * portão, que mandaria para cá de novo. E se a pessoa chegar aqui sem ser
 * membro de uma equipe pausada (o dono reativou, ou o link foi colado), volta
 * para o painel, em vez de mostrar um aviso que não é verdade.
 */
export default async function EquipePausadaPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect=%2Fequipe-pausada");

  const membro = await membroAtivo(userId);
  if (!membro) redirect("/dashboard");
  const dono = await prisma.user.findUnique({ where: { id: membro.donoId }, select: { plan: true, role: true } });
  const pausada = !dono || (dono.role !== "admin" && (!dono.plan || dono.plan === "free"));
  if (!pausada) redirect("/dashboard");

  const nome = await nomeDoDono(membro.donoId);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="font-semibold tracking-[-0.04em] text-xl lowercase" style={{ color: "var(--text-primary)" }}>
            demandou<span style={{ color: "var(--marca-laranja)" }}>.</span>
          </span>
        </div>
        <div
          className="rounded-2xl border p-6 sm:p-8 space-y-5"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          <p className="rotulo">Acesso de equipe</p>
          <div className="flex items-start gap-3">
            <PauseCircle className="mt-1 h-6 w-6 shrink-0" style={{ color: "var(--marca-laranja)" }} aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight text-balance" style={{ color: "var(--text-primary)" }}>
              {fraseDaAssinaturaPausada(nome)}
            </h1>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Os seus projetos, posts e vídeos continuam guardados. Assim que a assinatura voltar, você entra de novo por aqui e
            segue de onde parou.
          </p>
          <div className="flex flex-col gap-2.5">
            <a
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-marca-600 px-6 text-base font-medium text-white hover:bg-marca-700"
            >
              Já foi reativada? Entrar
            </a>
            <SairDaConta />
          </div>
        </div>
      </div>
    </div>
  );
}
