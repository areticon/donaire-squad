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
  if (!userId) redirect("/sign-in");

  // O pathname vem carimbado pelo proxy: o App Router não entrega a rota
  // para um layout, e o proxy roda na borda, sem acesso ao banco. Ver
  // lib/onboarding/portao.ts para o porquê do portão existir.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const destino = await destinoDeEntrada(userId, pathname);
  if (destino.tipo === "planos") redirect("/planos?assinar=1");

  return <AppShell>{children}</AppShell>;
}
