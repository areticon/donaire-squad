import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ui/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-mont", weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "demandou. postou. Você grava um vídeo, seu squad de IA publica.",
  description:
    "Plataforma de gestão de redes sociais com agentes de IA. Crie, publique e escale sua presença online com automação inteligente.",
  icons: {
    // O SVG vem primeiro porque a marca é vetorial e fica nítida em qualquer
    // densidade de tela; o PNG fica de reserva para quem não suporta SVG.
    // O laranja tem contraste nos dois temas, então não há versão por tema.
    icon: [
      { url: "/brand-mark.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "demandou. postou. Você grava um vídeo, seu squad de IA publica.",
    description:
      "Plataforma de gestão de redes sociais com agentes de IA. Crie, publique e escale sua presença online com automação inteligente.",
    url: "https://demandou.com",
    siteName: "demandou",
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
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        {/*
          Aplica o tema salvo antes da primeira pintura. Sem isso a página
          nasce escura (o padrão do HTML) e pisca para o claro só depois que o
          JavaScript carrega. Precisa ser síncrono e inline no head: qualquer
          coisa assíncrona já chega tarde demais para evitar o flash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`,
          }}
        />
      </head>
      {/*
        suppressHydrationWarning aqui porque extensões de navegador (ColorZilla,
        Grammarly, LastPass) injetam atributos no body antes do React hidratar,
        gerando um aviso de hydration mismatch que não vem do nosso código.
        O efeito é limitado aos atributos deste elemento: diferenças reais em
        qualquer componente filho continuam sendo reportadas normalmente.
      */}
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${montserrat.variable} ${inter.className}`}
      >
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
  );
}
