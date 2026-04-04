import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Montserrat } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ui/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-mont", weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "Demandou — Seus Agentes de IA Trabalhando por Você",
  description:
    "Plataforma de gestão de redes sociais com agentes de IA. Crie, publique e escale sua presença online com automação inteligente.",
  icons: {
    apple: "/logo-mark-light.png",
  },
  openGraph: {
    title: "Demandou — Seus Agentes de IA Trabalhando por Você",
    description:
      "Plataforma de gestão de redes sociais com agentes de IA. Crie, publique e escale sua presença online com automação inteligente.",
    url: "https://demandou.com.br",
    siteName: "Demandou",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="pt-BR" data-theme="dark">
        <body className={`${inter.variable} ${montserrat.variable} ${inter.className}`}>
          <ThemeProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                },
              }}
            />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
