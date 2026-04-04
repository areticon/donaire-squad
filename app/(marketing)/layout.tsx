import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opensquad — Seus Agentes de IA Trabalhando por Você",
  description:
    "Gestão de redes sociais com inteligência artificial. Crie, publique e escale sua presença online com uma equipe de agentes autônomos.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
