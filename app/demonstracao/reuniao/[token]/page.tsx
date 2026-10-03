import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkAnimated } from "@/components/brand-mark-animated";
import { IdentificacaoCurta } from "@/components/identificacao-legal";
import { GerenciarReuniao } from "@/components/agenda/gerenciar-reuniao";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoToken } from "@/lib/agenda/segredos";
import { horaEmSP, rotuloLongoDoDia, dataEmSP } from "@/lib/agenda/tempo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sua demonstração da Demandou",
  // O link é pessoal (token da reunião): fora dos buscadores.
  robots: { index: false, follow: false },
};

/**
 * REMARCAR OU CANCELAR A DEMONSTRAÇÃO (01/10), pelo link que vai em todo
 * e-mail da reunião. Mora embaixo de /demonstracao, que já é rota pública no
 * proxy, porque o lead não tem conta.
 */
export default async function ReuniaoPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ remarcar?: string }> }) {
  const { token } = await params;
  // "?remarcar=1" (links de remarcar dos alertas, 01/10): abre direto no calendário.
  const abrirNoCalendario = (await searchParams).remarcar === "1";
  const id = reuniaoDoToken(token);
  const r = id
    ? await prisma.reuniaoDeDemonstracao.findUnique({ where: { id }, include: { pessoa: { select: { nome: true } } } })
    : null;

  let conteudo: React.ReactNode;
  if (!r) {
    conteudo = (
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Link inválido.</h1>
        <p className="text-[var(--text-muted)]">Não encontrei esta reunião. Confira o link do e-mail ou marque uma nova.</p>
      </div>
    );
  } else if (r.status !== "marcada") {
    conteudo = (
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Esta demonstração foi cancelada.</h1>
        <p className="text-[var(--text-muted)]">
          Era em {rotuloLongoDoDia(dataEmSP(r.inicio))}, às {horaEmSP(r.inicio)}. Quando quiser, escolha outro horário.
        </p>
      </div>
    );
  } else if (r.inicio.getTime() < Date.now() && (r.comecouEm || r.inicio.getTime() < Date.now() - 24 * 3600_000)) {
    // Já passou e começou (ou passou há mais de um dia): não há o que remarcar
    // nesta reunião; o lead marca uma nova.
    conteudo = (
      <div>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Este horário já passou.</h1>
        <p className="text-[var(--text-muted)]">Se não conseguiu participar, escolha outro horário.</p>
      </div>
    );
  } else {
    // Marcada, inclusive a que passou há pouco sem começar (o lead não
    // conseguiu entrar e veio pelo aviso de atraso): remarcar está aberto.
    const passou = r.inicio.getTime() < Date.now();
    conteudo = (
      <GerenciarReuniao
        passou={passou}
        abrirNoCalendario={abrirNoCalendario || passou}
        token={token}
        atual={{
          id: r.id,
          inicio: r.inicio.toISOString(),
          pessoa: r.pessoa.nome.split(/\s+/)[0],
          linkReuniao: r.linkReuniao,
          gerenciar: `/demonstracao/reuniao/${token}`,
        }}
      />
    );
  }
  const terminal = !r || r.status !== "marcada" || (r.inicio.getTime() < Date.now() && (Boolean(r.comecouEm) || r.inicio.getTime() < Date.now() - 24 * 3600_000));

  return (
    <main data-theme="dark" className="min-h-screen bg-[var(--bg-primary)]">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <BrandMarkAnimated size={30} />
          {/* Montserrat negrito, o logotipo de antes (de volta em 01/10). */}
          <span className="font-mont font-bold text-[var(--text-primary)] text-lg lowercase leading-none">
            demandou.
          </span>
        </Link>
      </header>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 sm:p-7">
          {conteudo}
          {terminal && (
            <Link href="/demonstracao" className="mt-5 inline-flex rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700">
              Escolher um horário
            </Link>
          )}
        </div>
      </div>
      <IdentificacaoCurta className="pb-10" />
    </main>
  );
}
