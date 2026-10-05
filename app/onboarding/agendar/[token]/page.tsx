import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { GerenciarReuniao } from "@/components/agenda/gerenciar-reuniao";
import { AgendarOnboarding } from "@/components/agenda/agendar-onboarding";
import { contratoDoOnboarding, onboardingLiberado, pessoaDoOnboarding, reuniaoDoOnboarding } from "@/lib/agenda/onboarding";
import { tokenDaReuniao } from "@/lib/agenda/segredos";
import { horaEmSP, rotuloLongoDoDia, dataEmSP } from "@/lib/agenda/tempo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agende o seu onboarding na Demandou",
  // O link é pessoal (token do contrato): fora dos buscadores.
  robots: { index: false, follow: false },
};

/**
 * O AGENDAMENTO DO ONBOARDING DO CLIENTE NOVO (05/10/2026), pelo botão
 * "Agendar o meu onboarding" do e-mail de boas-vindas do contrato ativado.
 *
 * É público (o cliente pode ainda não ter escolhido a senha) e o token do
 * contrato na URL é a autorização. Não pede nada: nome, e-mail e empresa
 * vêm do contrato. O calendário é o da demonstração, preso ao Bruno. Quem já
 * marcou vê a reunião, com remarcar e cancelar; "?remarcar=1" (links dos
 * alertas) abre direto no calendário.
 */
export default async function AgendarOnboardingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ remarcar?: string }> }) {
  const { token } = await params;
  const abrirNoCalendario = (await searchParams).remarcar === "1";
  const c = await contratoDoOnboarding(token);
  const meuLink = `/onboarding/agendar/${encodeURIComponent(token)}`;

  let conteudo: React.ReactNode;
  if (!c) {
    conteudo = (
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Link inválido.</h1>
        <p className="text-[var(--text-muted)]">Não encontrei o seu contrato. Confira o link do e-mail de boas-vindas ou escreva para contato@demandou.com.</p>
      </div>
    );
  } else if (!onboardingLiberado(c)) {
    conteudo = (
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">O seu contrato ainda não está ativo.</h1>
        <p className="text-[var(--text-muted)]">
          Assim que o pagamento for confirmado, este mesmo link abre o calendário do onboarding. Qualquer dúvida, responda ao e-mail do contrato.
        </p>
      </div>
    );
  } else {
    const [pessoa, { atual, passou, passada }] = await Promise.all([pessoaDoOnboarding(), reuniaoDoOnboarding(c.id)]);
    const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] || "";
    if (atual) {
      conteudo = (
        <GerenciarReuniao
          tipo="onboarding"
          pessoaFixa={atual.pessoaId}
          linkNovo={meuLink}
          passou={passou}
          abrirNoCalendario={abrirNoCalendario || passou}
          token={tokenDaReuniao(atual.id)}
          atual={{
            id: atual.id,
            inicio: atual.inicio.toISOString(),
            pessoa: atual.pessoa.nome.split(/\s+/)[0],
            linkReuniao: atual.linkReuniao,
            gerenciar: meuLink,
          }}
        />
      );
    } else if (!pessoa) {
      conteudo = (
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">A agenda está sendo configurada.</h1>
          <p className="text-[var(--text-muted)]">Responda ao e-mail de boas-vindas com dois horários que ficam bons para você, e marcamos o onboarding por lá.</p>
        </div>
      );
    } else {
      conteudo = (
        <AgendarOnboarding
          token={token}
          pessoa={pessoa}
          saudacao={primeiro ? `${primeiro}, escolha o horário do seu onboarding` : "Escolha o horário do seu onboarding"}
          aviso={
            passada
              ? `Seu onboarding de ${rotuloLongoDoDia(dataEmSP(passada.inicio))}, às ${horaEmSP(passada.inicio)}, já ${passada.status === "realizada" ? "aconteceu" : "passou"}. Precisa de outra conversa? Escolha um horário.`
              : null
          }
        />
      );
    }
  }

  return (
    <main data-theme="dark" className="min-h-screen bg-[var(--bg-primary)]">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">demandou.</span>
        </Link>
        <Link href="/sign-in" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Entrar na plataforma
        </Link>
      </header>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        {c && onboardingLiberado(c) && (
          <p className="selo mb-4">
            Contrato nº {String(c.numero).padStart(4, "0")}{c.empresa ? `, ${c.empresa}` : ""}
          </p>
        )}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-7">{conteudo}</div>
        {c && onboardingLiberado(c) && (
          <ul className="mt-6 space-y-3 text-sm">
            {[
              ["30 minutos, por vídeo", "Com o Bruno, no horário que você escolher, e o convite direto na sua agenda."],
              ["O seu posicionamento", "Alinhamos o que a sua empresa quer dizer e para quem."],
              ["As primeiras semanas", "O plano do primeiro conteúdo, que nasce do setup do seu projeto na plataforma."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-sm bg-orange-500 shrink-0" />
                <span>
                  <strong className="text-[var(--text-primary)]">{t}.</strong> <span className="text-[var(--text-muted)]">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <IdentificacaoCurta className="pb-10" />
    </main>
  );
}
