"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import {
  CHAVE_DE_CONSENTIMENTO,
  algumPixelConfigurado,
  lerConsentimento,
  type Consentimento,
  type Pixels,
} from "@/lib/pixels";

/**
 * Carrega os pixels de anúncio, e só depois do sim.
 *
 * O aviso aparece uma vez, fica no rodapé e não tranca a página: banner modal
 * que bloqueia a leitura derruba a conversão da landing, que é justamente o
 * número que o card 288 diz ser a parede mestra do modelo. Recusar é um clique
 * do mesmo tamanho que aceitar, porque consentimento obtido por cansaço não é
 * consentimento e a ANPD trata como inválido.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq?: any;
    _linkedin_data_partner_ids?: string[];
  }
}

/**
 * O consentimento vive fora do React, no localStorage, então é lido por
 * `useSyncExternalStore` e não por estado com efeito. A diferença que importa:
 * o servidor renderiza com a resposta "ainda não sei" e o cliente corrige na
 * primeira pintura, sem passo intermediário em que o aviso pisca para quem já
 * respondeu, e sem setState dentro de efeito.
 */
const ouvintes = new Set<() => void>();

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => ouvintes.delete(aviso);
}

/** No servidor não existe localStorage, e sem resposta nada carrega. */
const noServidor = (): Consentimento => null;

function gravarConsentimento(resposta: Exclude<Consentimento, null>) {
  try {
    localStorage.setItem(CHAVE_DE_CONSENTIMENTO, resposta);
  } catch {
    // Armazenamento bloqueado: a escolha vale só para esta visita. O aviso
    // volta na próxima, e a resposta continua sendo respeitada agora.
    memoria = resposta;
  }
  for (const avisar of ouvintes) avisar();
}

/** Reserva para quando o navegador recusa armazenamento. */
let memoria: Consentimento = null;

export function PixelsDeAnuncio({ pixels }: { pixels: Pixels }) {
  const consentimento = useSyncExternalStore(
    assinar,
    () => lerConsentimento() ?? memoria,
    noServidor
  );

  // Sem pixel configurado não há o que consentir, e pedir consentimento para
  // nada é ruído que custa conversão.
  if (!algumPixelConfigurado(pixels)) return null;

  const aceitou = consentimento === "aceito";

  return (
    <>
      {aceitou && pixels.meta && (
        <Script id="pixel-meta" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixels.meta}');fbq('track','PageView');`}
        </Script>
      )}

      {aceitou && pixels.google && (
        <>
          <Script
            id="pixel-google-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${pixels.google}`}
          />
          <Script id="pixel-google" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${pixels.google}');`}
          </Script>
        </>
      )}

      {aceitou && pixels.linkedin && (
        <Script id="pixel-linkedin" strategy="afterInteractive">
          {`window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
window._linkedin_data_partner_ids.push('${pixels.linkedin}');
(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
var s=document.getElementsByTagName('script')[0];var b=document.createElement('script');
b.type='text/javascript';b.async=true;
b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';
s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      )}

      {aceitou && pixels.tiktok && (
        <Script id="pixel-tiktok" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;
var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${pixels.tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}

      {consentimento === null && (
        <div
          className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
          role="region"
          aria-label="Aviso de cookies"
        >
          <div
            className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Usamos cookies de anúncio para medir de onde vêm as pessoas que chegam aqui. Sem eles
              o site funciona igual.{" "}
              <a href="/privacy" className="font-semibold text-orange-400">
                Como tratamos seus dados
              </a>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => gravarConsentimento("recusado")}
                className="h-9 rounded border px-4 text-sm font-semibold transition-colors hover:border-orange-500"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                Recusar
              </button>
              <button
                onClick={() => gravarConsentimento("aceito")}
                className="h-9 rounded bg-orange-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
              >
                Aceitar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
