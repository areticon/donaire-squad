export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { chamadosDoUsuario, numeroDoSuporte } from "@/lib/suporte/chamados";
import { MeusChamados } from "@/components/suporte/meus-chamados";

/**
 * MEUS CHAMADOS (02/10/2026): o que a pessoa pediu, a resposta do suporte e o
 * histórico, com o botão de abrir outro. O diagnóstico interno e as notas do
 * time nunca descem para cá (ver chamadosDoUsuario).
 */
export default async function MeusChamadosPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect=/chamados");
  const chamados = await chamadosDoUsuario(userId);
  return (
    <div className="p-4 sm:p-6 max-w-[960px] mx-auto">
      <p className="rotulo mb-1">Suporte</p>
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Meus chamados
      </h1>
      <p className="text-sm mt-1 mb-5" style={{ color: "var(--text-muted)" }}>
        Cada pedido de ajuda tem um número. A resposta chega por e-mail e fica aqui, com o histórico.
      </p>
      <MeusChamados chamados={chamados} whatsapp={numeroDoSuporte()} />
    </div>
  );
}
