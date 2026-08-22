import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança, acrescentados em 21/08/2026.
 *
 * Motivo: o demandou.com foi marcado pelo Google como "página enganosa" e o
 * site respondia só com o HSTS que a Vercel põe sozinha. Sem
 * X-Frame-Options qualquer site consegue embutir a nossa tela de login dentro
 * de uma página de golpe, que é a mecânica exata da categoria em que fomos
 * marcados.
 *
 * Verificado antes de travar: o projeto não usa getUserMedia nem MediaRecorder
 * (o vídeo é enviado por upload, não gravado no navegador) e não existe um
 * único iframe no código, então negar enquadramento, câmera e microfone não
 * quebra nada.
 *
 * CSP completa ficou de fora de propósito: o Next injeta script inline e a
 * política precisa de nonce para não quebrar a aplicação inteira. Aqui vai só
 * o `frame-ancestors`, que não depende de nonce e é o que fecha o buraco.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /**
   * www redireciona para o apex, permanente. Descoberto em 21/08 da pior
   * forma: os dois hosts serviam o site inteiro, cookie e host-only, e o
   * callback de OAuth chega sempre no apex (BETTER_AUTH_URL). Quem navegava
   * pelo www iniciava o login com o cookie de estado gravado no www e o
   * retorno caia no apex sem cookie nenhum: state_mismatch para qualquer
   * provedor, e sessao "sumindo" depois de logar. Um host so elimina a
   * classe inteira, e de quebra consolida o SEO.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: "www.demandou.com" }],
        destination: "https://demandou.com/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.vercel-storage.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "**.blotato.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
