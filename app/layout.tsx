import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { PixelsDeAnuncio } from "@/components/analytics/pixels-de-anuncio";
import { pixelsConfigurados } from "@/lib/pixels";
import { comVersao } from "@/lib/versao-dos-icones";
import "./globals.css";

// As fontes de antes do rebranding, de volta em 01/10 a pedido do Bruno: Inter
// em título e corpo, Montserrat em negrito só no nome "demandou." ao lado da
// marca (a letra mais pesada do logotipo antigo). A Geist da referência saiu;
// as cores do rebranding ficaram.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-mont", weight: ["700", "800"] });

// Ícones com versão no endereço para furar o cache do navegador (01/10):
// ver lib/versao-dos-icones.ts.
const v = comVersao;

export const metadata: Metadata = {
  // Título e descrição reescritos no rebranding de 01/10 para o comprador
  // novo (dono e diretor de empresa acima de R$ 100 mil por mês), sem o
  // "postou" do slogan antigo.
  title: "demandou. O marketing da sua empresa trabalhando 24 horas por dia, sem tomar a agenda do dono.",
  description:
    "O marketing da sua empresa trabalhando todo dia: alguns minutos de vídeo viram uma semana de conteúdo no LinkedIn, no Instagram e nas outras redes, com a voz da empresa e a sua aprovação. Custa menos que um analista e tem a constância de uma agência.",
  metadataBase: new URL("https://demandou.com"),
  icons: {
    // O logo de 25/08, de volta em 01/10 (o Bruno desistiu do logo B). O SVG
    // vem primeiro: é vetorial, e o laranja com contorno branco de adesivo se
    // lê em aba clara e escura, então não precisa de versão por tema. Os PNG
    // de 16/32/48 saem desse mesmo SVG e ficam de reserva para quem não lê
    // SVG; o de 512 e o do iPhone são os arquivos oficiais da época.
    icon: [
      { url: v("/brand-mark.svg"), type: "image/svg+xml" },
      { url: v("/favicon-16.png"), type: "image/png", sizes: "16x16" },
      { url: v("/favicon-32.png"), type: "image/png", sizes: "32x32" },
      { url: v("/favicon-48.png"), type: "image/png", sizes: "48x48" },
      { url: v("/icon.png"), type: "image/png", sizes: "512x512" },
    ],
    // O /favicon.ico (montado com os PNG de 16/32/48 do logo) existe porque o
    // navegador pede esse endereço sozinho, sem ler o HTML; sem ele, o pedido
    // dava 404 e o navegador seguia mostrando o .ico antigo que tinha guardado.
    shortcut: v("/favicon.ico"),
    apple: { url: v("/apple-touch-icon.png"), sizes: "180x180" },
  },
  manifest: v("/manifest.webmanifest"),
  openGraph: {
    title: "demandou. O marketing da sua empresa trabalhando 24 horas por dia, sem tomar a agenda do dono.",
    description:
      "O marketing da sua empresa trabalhando todo dia: alguns minutos de vídeo viram uma semana de conteúdo no LinkedIn, no Instagram e nas outras redes, com a voz da empresa e a sua aprovação. Custa menos que um analista e tem a constância de uma agência.",
    url: "https://demandou.com",
    siteName: "demandou",
    locale: "pt_BR",
    type: "website",
    // A imagem de quando o link é colado no WhatsApp e no LinkedIn (01/10):
    // o logo de volta e o slogan novo, gerada por scripts/tmp/gera-marca-antiga.mts.
    images: [{ url: v("/og.png"), width: 1200, height: 630, alt: "demandou. Sua empresa vira referência. Sem tomar a sua agenda." }],
  },
  twitter: {
    card: "summary_large_image",
    images: [v("/og.png")],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        {/*
          Aplica o tema salvo antes da primeira pintura. Sem isso a página
          nasce clara (o padrão do HTML) e pisca para o escuro só depois que o
          JavaScript carrega. Precisa ser síncrono e inline no head: qualquer
          coisa assíncrona já chega tarde demais para evitar o flash.
          A chave é "tema", e não a "theme" antiga, de propósito: a escolha
          gravada antes de 28/09 foi feita quando o escuro era o padrão, e a
          virada para o claro precisa valer para todo mundo uma vez. Quem
          preferir o escuro troca de novo e a nova chave passa a lembrar.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`,
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
          {/*
            Os pixels de anúncio, e o aviso que os destrava. Lidos no servidor
            e passados prontos: se nenhuma variável estiver configurada, nem o
            aviso aparece. Ver lib/pixels.ts para o porquê do consentimento.
          */}
          <PixelsDeAnuncio pixels={pixelsConfigurados()} />
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
