import type { Metadata } from "next";
import { CascaDaReuniao } from "@/components/agenda/casca-da-reuniao";
import { prisma } from "@/lib/db/prisma";
import { reuniaoDoComecou } from "@/lib/agenda/segredos";
import { horaEmSP, rotuloLongoDoDia, dataEmSP } from "@/lib/agenda/tempo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marcar que a demonstração começou",
  robots: { index: false, follow: false },
};

/**
 * "MARCAR QUE COMEÇOU", PARA A PESSOA DO TIME (01/10, régua de alertas). Vem
 * do alerta de 5 minutos, no celular, com a reunião começando: sem login (o
 * token assinado do time é a autorização) e com UM botão.
 *
 * O botão é um formulário (POST), e não o próprio link: o filtro de segurança
 * do e-mail "clica" nos links ao receber, e um GET que marcasse a reunião
 * como começada seguraria o aviso de atraso de um lead que nem apareceu.
 */
export default async function ComecouPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const { ok } = await searchParams;
  const id = reuniaoDoComecou(token);
  const r = id ? await prisma.reuniaoDeDemonstracao.findUnique({ where: { id }, include: { lead: { select: { nome: true, empresa: true, email: true } } } }) : null;

  if (!r) {
    return (
      <CascaDaReuniao>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">Link inválido.</h1>
        <p className="text-[var(--text-muted)]">Não encontrei esta reunião.</p>
      </CascaDaReuniao>
    );
  }
  const quem = [r.lead.nome, r.lead.empresa].filter(Boolean).join(", ") || r.lead.email;
  const quando = `${rotuloLongoDoDia(dataEmSP(r.inicio))}, às ${horaEmSP(r.inicio)}`;
  // O tipo (05/10): "o onboarding" ou "a demonstração".
  const a = r.tipo === "onboarding" ? "o onboarding" : "a demonstração";
  return (
    <CascaDaReuniao>
      <h1 className="text-2xl font-black text-[var(--text-primary)] mb-2">
        {r.comecouEm || ok ? `Marcado: ${a} começou.` : `${a.charAt(0).toUpperCase()}${a.slice(1)} começou?`}
      </h1>
      <p className="text-[var(--text-muted)]">
        Com {quem}, {quando} (horário de Brasília).
      </p>
      {r.status === "cancelada" ? (
        <p className="mt-4 text-sm text-red-400">Esta reunião foi cancelada.</p>
      ) : r.comecouEm || ok ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">O lead não vai receber o aviso de atraso. Boa conversa.</p>
      ) : (
        <form method="post" action={`/api/agenda/comecou/${encodeURIComponent(token)}`}>
          <p className="mt-4 text-sm text-[var(--text-muted)]">Marque quando o lead entrar na sala: assim ele não recebe o aviso de atraso dos 10 minutos.</p>
          <button type="submit" className="mt-5 inline-flex rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700">
            O lead entrou, começamos
          </button>
        </form>
      )}
    </CascaDaReuniao>
  );
}
