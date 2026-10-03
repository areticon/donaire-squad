import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { Rastro } from "@/components/landing/rastro";
import { Agendamento, Confirmada } from "@/components/agenda/agendamento";
import { prisma } from "@/lib/db/prisma";
import { FAIXAS_ATENDIDAS, leadAtual } from "@/lib/agenda/lead";
import { leadDoToken, tokenDaReuniao } from "@/lib/agenda/segredos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agende uma demonstração da Demandou",
  description:
    "Veja a Demandou produzindo e publicando o conteúdo de uma empresa de verdade. Para empresas que faturam acima de R$ 100 mil por mês.",
};

/** "br***@empresa.com.br": o bastante para a pessoa se reconhecer, pouco para quem olha a tela. */
function mascarar(email: string): string {
  const [u, d] = email.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(4, u.length - 2)))}@${d}`;
}

/**
 * A ENTRADA DA DEMANDOU desde 27/09/2026: uma conversa com os sócios, e não
 * mais um teste grátis. Público: empresas que faturam acima de R$ 100 mil por
 * mês, em contrato anual.
 *
 * DESDE 01/10 A CONVERSA É MARCADA AQUI, NUM CALENDÁRIO, e a página não pede
 * de novo o que o lead já deu. O servidor lê o cookie do lead (gravado pela
 * calculadora, pela captura ou pelo próprio formulário daqui) e decide o
 * primeiro passo:
 *  - lead completo e dentro do público: calendário direto, nenhum campo;
 *  - lead conhecido com campo faltando: só os campos que faltam;
 *  - lead desconhecido: os mesmos campos do portão da calculadora, uma vez;
 *  - lead que já tem reunião marcada: a reunião, com remarcar e cancelar.
 */
export default async function DemonstracaoPage({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  const { l } = await searchParams;
  const lead = await leadAtual(l ?? null);
  const tokenDaUrl = leadDoToken(l) ? l! : null;

  const jaMarcada = lead
    ? await prisma.reuniaoDeDemonstracao.findFirst({
        where: { leadId: lead.id, status: "marcada", inicio: { gt: new Date() } },
        orderBy: { inicio: "asc" },
        include: { pessoa: { select: { nome: true } } },
      })
    : null;

  const inicial: "formulario" | "calendario" | "fora" = !lead || lead.faltam.length
    ? "formulario"
    : FAIXAS_ATENDIDAS.has(lead.faturamento ?? "")
      ? "calendario"
      : "fora";

  return (
    <main data-theme="dark" className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      <Rastro />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--bg-elevated)_1px,transparent_1px),linear-gradient(to_bottom,var(--bg-elevated)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
      <header className="relative max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          <span className="flex flex-col justify-center">
            {/* Montserrat negrito, o logotipo de antes (de volta em 01/10). */}
            <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
            {/* O "postou." saiu do lockup no rebranding de 01/10: o slogan falava
                com quem quer postar, e o comprador agora é o dono da empresa. */}
          </span>
        </Link>
        <Link href="/sign-in" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Já sou cliente
        </Link>
      </header>

      {/* No celular a ordem é título, calendário e só depois os detalhes: quem
          chega do botão "Agendar" quer o horário, não rolar a página. */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-16 grid lg:grid-cols-2 gap-x-12 gap-y-8 items-start">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="selo mb-6">
            Para empresas que faturam acima de R$ 100 mil por mês
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[var(--text-primary)] leading-[1.05] mb-5">
            Veja a sua empresa publicando <span className="text-orange-500">toda semana</span>, sem montar equipe.
          </h1>
          <p className="text-lg text-[var(--text-muted)] max-w-xl">
            Na demonstração, um dos sócios mostra a Demandou produzindo o conteúdo de uma empresa de verdade: pesquisa,
            texto, arte, vídeo e publicação nas redes. E monta com você o plano que faz sentido para a sua.
          </p>
        </div>

        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          {jaMarcada ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-7">
              <Confirmada
                titulo="Você já tem uma demonstração marcada."
                r={{
                  id: jaMarcada.id,
                  inicio: jaMarcada.inicio.toISOString(),
                  pessoa: jaMarcada.pessoa.nome.split(/\s+/)[0],
                  linkReuniao: jaMarcada.linkReuniao,
                  gerenciar: `/demonstracao/reuniao/${tokenDaReuniao(jaMarcada.id)}`,
                }}
              />
            </div>
          ) : (
            <Agendamento
              inicial={inicial}
              emailConhecido={lead ? mascarar(lead.email) : null}
              faltam={lead ? lead.faltam : null}
              tokenDaUrl={tokenDaUrl}
            />
          )}
        </div>

        <ul className="space-y-4 max-w-xl lg:col-start-1 lg:row-start-2">
          {[
            ["30 minutos, por vídeo", "No horário que você escolher, com o convite direto na sua agenda."],
            ["Com o seu setor", "Mostramos peças do jeito que sairiam para a sua empresa."],
            ["Plano anual, sob medida", "Starter, Pro ou Enterprise, conforme o número de marcas e porta-vozes."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-1.5 w-2 h-2 rounded-sm bg-orange-500 shrink-0" />
              <span>
                <strong className="text-[var(--text-primary)]">{t}.</strong>{" "}
                <span className="text-[var(--text-muted)]">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <IdentificacaoCurta className="relative pb-10" />
    </main>
  );
}
