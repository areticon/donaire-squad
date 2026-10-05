import type { Metadata } from "next";
import Link from "next/link";
import { CascaDaReuniao } from "@/components/agenda/casca-da-reuniao";
import { AbrirSala } from "@/components/agenda/abrir-sala";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoToken } from "@/lib/agenda/segredos";
import { horaEmSP, rotuloLongoDoDia, dataEmSP } from "@/lib/agenda/tempo";
import { linkGerenciarDe } from "@/lib/agenda/envio";
import { nomeDaReuniao } from "@/lib/agenda/tipo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sala da reunião da Demandou",
  robots: { index: false, follow: false },
};

/**
 * A SALA PELO ENDEREÇO DA DEMANDOU (01/10, régua de alertas). Os alertas do
 * lead apontam para cá em vez de para o Meet direto, por dois motivos: saber
 * que o lead abriu a sala (o sinal de presença que segura o aviso de atraso) e
 * poder trocar o link sem reenviar nada, se o Meet do evento mudar.
 */
export default async function SalaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = reuniaoDoToken(token);
  const r = id ? await prisma.reuniaoDeDemonstracao.findUnique({ where: { id }, include: { pessoa: { select: { nome: true } } } }) : null;

  let conteudo: React.ReactNode;
  if (!r) {
    conteudo = (
      <>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Link inválido.</h1>
        <p className="text-[var(--text-muted)]">Não encontrei esta reunião. Confira o link da mensagem.</p>
      </>
    );
  } else if (r.status === "cancelada") {
    // O tipo (05/10) decide o texto e para onde "escolher um horário" leva.
    const onboarding = r.tipo === "onboarding";
    conteudo = (
      <>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">{onboarding ? "Este onboarding foi cancelado." : "Esta demonstração foi cancelada."}</h1>
        <Link href={onboarding ? linkGerenciarDe(r) : "/demonstracao"} className="mt-4 inline-flex rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700">
          Escolher um horário
        </Link>
      </>
    );
  } else if (!r.linkReuniao) {
    conteudo = (
      <>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">A sala ainda está sem link.</h1>
        <p className="text-[var(--text-muted)]">
          {r.tipo === "onboarding" ? "O onboarding" : "A demonstração"} é {rotuloLongoDoDia(dataEmSP(r.inicio))}, às {horaEmSP(r.inicio)} (horário de Brasília), com {r.pessoa.nome}.
          O link da videochamada chega por e-mail em instantes.
        </p>
      </>
    );
  } else {
    conteudo = <AbrirSala token={token} link={r.linkReuniao} pessoa={r.pessoa.nome.split(/\s+/)[0]} nome={nomeDaReuniao(r.tipo)} />;
  }
  return <CascaDaReuniao>{conteudo}</CascaDaReuniao>;
}
