import { AGENTES } from "@/lib/squad/estado-do-squad";

/**
 * A ABERTURA DO APLICATIVO INSTALADO (03/10, pedido do Bruno).
 *
 * O celular ofereceu instalar a demandou, e a abertura era o logo numa tela
 * branca. São duas telas, uma depois da outra:
 *   1. a splash NATIVA do Android, que o navegador monta sozinho a partir do
 *      manifesto (public/manifest.webmanifest): fundo azul-noite e a marca
 *      oficial. Não dá para animar, só escolher a cor e o ícone;
 *   2. esta, dentro do app, já no mesmo azul-noite, para a troca não piscar:
 *      os onze agentes saem do centro para a órbita em volta da marca, com
 *      luz, partículas e o nome, em cerca de 1,5 s.
 *
 * LEVE E SEM TRAVAR A ENTRADA: é HTML e CSS puros, sem JavaScript de React. O
 * script do <head> (app/layout.tsx) decide antes da primeira pintura se ela
 * aparece (só no app instalado, display-mode standalone, e uma vez por sessão);
 * fora disso ela fica em display none e os retratos, com loading lazy, nem são
 * baixados. A página carrega por baixo enquanto isso, e um toque pula.
 * Os retratos são os de public/equipe reduzidos para 144 px (uns 2 KB cada,
 * scripts/tmp/icones-do-app-0310.py): pessoas que NÃO existem, geradas por IA.
 *
 * Para ver no navegador comum: qualquer página com ?abertura=ver.
 */

/** Partículas em posições fixas (sem Math.random, para o servidor e o navegador desenharem igual). */
function particulas(qtd: number, semente: number): string {
  let s = semente;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const lista: string[] = [];
  for (let i = 0; i < qtd; i++) {
    const x = Math.round(r() * 100);
    const y = Math.round(r() * 100);
    const cor = r() > 0.7 ? "rgba(241,116,46,.9)" : "rgba(201,211,224,.75)";
    lista.push(`${x}vw ${y}vh 0 ${r() > 0.85 ? 1 : 0}px ${cor}`);
  }
  return lista.join(",");
}

const SCRIPT_DA_SAIDA = `(function(){var h=document.documentElement;if(!h.classList.contains("abertura"))return;var el=document.getElementById("abertura-app");var feito=false;function fim(){if(feito)return;feito=true;h.classList.add("abertura-saindo");setTimeout(function(){h.classList.remove("abertura","abertura-saindo")},450)}var calma=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;setTimeout(fim,calma?700:1650);if(el)el.addEventListener("click",fim)})();`;

export function AberturaDoApp() {
  const n = AGENTES.length;
  // A gerente no alto, o resto em volta na ordem da equipe.
  const ordem = [...AGENTES.filter((a) => a.id === "vera-veredito"), ...AGENTES.filter((a) => a.id !== "vera-veredito")];
  return (
    <>
      <div id="abertura-app" aria-hidden="true">
        <div className="ab-fundo" />
        <div className="ab-grade" />
        <div className="ab-particulas" style={{ boxShadow: particulas(46, 7) }} />
        <div className="ab-particulas ab-particulas-2" style={{ boxShadow: particulas(30, 41) }} />
        <div className="ab-varredura" />

        <div className="ab-palco">
          <svg className="ab-aneis" viewBox="-160 -160 320 320">
            <defs>
              <radialGradient id="ab-feixe" cx="0" cy="0" r="1">
                <stop offset="0" stopColor="#F1742E" stopOpacity="0.9" />
                <stop offset="1" stopColor="#F1742E" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="ab-anel ab-anel-1" r="150" />
            <circle className="ab-anel ab-anel-2" r="96" />
            <circle className="ab-anel ab-anel-3" r="58" />
          </svg>
          <div className="ab-orbita">
            <svg className="ab-feixes" viewBox="-160 -160 320 320">
              {ordem.map((a, i) => {
                const ang = ((i / n) * 360 - 90) * (Math.PI / 180);
                return (
                  <line
                    key={a.id}
                    x1="0"
                    y1="0"
                    x2={(Math.cos(ang) * 124).toFixed(1)}
                    y2={(Math.sin(ang) * 124).toFixed(1)}
                    style={{ ["--i" as string]: i }}
                  />
                );
              })}
            </svg>
            {ordem.map((a, i) => (
              <span key={a.id} className="ab-agente" style={{ ["--a" as string]: `${(i / n) * 360}deg`, ["--i" as string]: i }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/equipe/abertura/${a.id}.webp`} alt="" width={48} height={48} loading="lazy" decoding="async" />
              </span>
            ))}
          </div>
          <div className="ab-halo" />
          {/* A marca OFICIAL (public/brand-mark-on-dark.png), nunca redesenhada. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ab-marca" src="/brand-mark-on-dark.png" alt="" width={84} height={84} loading="lazy" decoding="async" />
        </div>

        <div className="ab-texto">
          <p className="ab-nome font-mont">demandou</p>
          <p className="ab-frase">Sua equipe de marketing está entrando</p>
          <div className="ab-barra">
            <span />
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DA_SAIDA }} />
    </>
  );
}

/**
 * O script do <head>: liga a abertura antes da primeira pintura, só no app
 * instalado e uma vez por sessão (ou com ?abertura=ver, para conferir).
 */
export const SCRIPT_DA_ABERTURA = `(function(){try{var ver=location.search.indexOf("abertura=ver")>-1;var app=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;if(ver||(app&&!sessionStorage.getItem("demandou-abertura"))){document.documentElement.classList.add("abertura");sessionStorage.setItem("demandou-abertura","1")}}catch(e){}})();`;
