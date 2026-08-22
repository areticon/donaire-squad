import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { destinoDeEntrada } from "@/lib/onboarding/portao";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  const pathnameCedo = (await headers()).get("x-pathname") ?? "";
  if (!userId) {
    // Preservar o destino importa: a volta do Stripe cai aqui se a sessão se
    // perder no caminho, e sem o redirect a pessoa relogava e aterrissava em
    // lugar nenhum (aconteceu no teste de jornada de 21/08).
    redirect(
      pathnameCedo
        ? `/sign-in?redirect=${encodeURIComponent(pathnameCedo)}`
        : "/sign-in"
    );
  }

  // O pathname vem carimbado pelo proxy: o App Router não entrega a rota
  // para um layout, e o proxy roda na borda, sem acesso ao banco. Ver
  // lib/onboarding/portao.ts para o porquê do portão existir.
  const pathname = pathnameCedo;
  const destino = await destinoDeEntrada(userId, pathname);
  if (destino.tipo === "planos") redirect("/planos?assinar=1");

  return <AppShell>{children}</AppShell>;
}
