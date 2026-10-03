"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Film } from "lucide-react";

/**
 * "SEU VÍDEO VAI FICAR ASSIM" (03/10/2026, book de modelos).
 *
 * Ao tocar num estilo de edição, o cliente vê a fonte do estilo, as cores da
 * marca dele aplicadas e quatro quadros de exemplo das peças daquele estilo,
 * desenhados aqui em código (instantâneo e de graça), com uma silhueta neutra
 * no lugar da pessoa (nunca uma pessoa real). Para os três estilos em destaque
 * há também quadros REAIS do editor sob medida (peças Remotion de
 * worker/remotion/src/sob-medida, renderizadas uma vez, em public/estilos-de-video,
 * nas cores de exemplo da Demandou).
 *
 * A fonte e o acabamento de cada estilo são os do editor
 * (lib/media/editor-sob-medida/resolver.ts, temaDoEstilo): lousa em Geist com
 * vidro, autoridade high ticket em Oswald caixa alta com bloco, Vox em
 * Playfair Display sobre papel.
 */

interface Cores {
  acento: string;
  escuro: string;
  claro: string;
}

const FICHA: Record<string, { fonte: string; peso: number; caixaAlta: boolean; acabamento: string; reais: number }> = {
  lousa: { fonte: "Geist", peso: 600, caixaAlta: false, acabamento: "Lousa escura, cartões de vidro, a palavra-chave na sua cor e passos revelados um a um.", reais: 3 },
  consorcio: { fonte: "Oswald", peso: 700, caixaAlta: true, acabamento: "Letra condensada em caixa alta, o número numa faixa da sua cor, selo com o seu nome.", reais: 4 },
  vox: { fonte: "Playfair Display", peso: 700, caixaAlta: false, acabamento: "Papel, recortes em preto e branco e marca-texto da sua cor nas palavras-chave.", reais: 2 },
};

/** Os estilos com prévia própria; os outros mostram a ficha genérica. */
export function temPreviaDeVideo(estiloId: string): boolean {
  return estiloId in FICHA;
}

function useFontesDoVideo() {
  useEffect(() => {
    if (document.getElementById("fontes-do-video")) return;
    const l = document.createElement("link");
    l.id = "fontes-do-video";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Oswald:wght@500;700&family=Playfair+Display:ital,wght@0,700;1,400&display=swap";
    document.head.appendChild(l);
  }, []);
}

function rgba(hex: string, a: number) {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  return `rgba(${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)},${a})`;
}

function sobre(hex: string) {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#141414" : "#ffffff";
}

/** Uma silhueta neutra de quem fala (ombros e cabeça), nunca um rosto. */
function Silhueta({ cor = "#0b0b0d", escala = 1, x = 540 }: { cor?: string; escala?: number; x?: number }) {
  return (
    <svg width={760 * escala} height={900 * escala} viewBox="0 0 760 900" style={{ position: "absolute", left: x - 380 * escala, bottom: 0 }}>
      <ellipse cx="380" cy="270" rx="150" ry="180" fill={cor} />
      <path d="M40 900 C60 620 200 500 380 500 C560 500 700 620 720 900 Z" fill={cor} />
    </svg>
  );
}

/** O quadro de uma gravação (foto do setor desfocada e a silhueta), base dos quadros com você na tela. */
function Gravacao({ setor, children, escurecer = 0.25 }: { setor: string; children?: ReactNode; escurecer?: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/modelos-de-arte/fotos/${setor}.jpg`} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(10px) saturate(0.9)", transform: "scale(1.08)" }} />
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${escurecer})` }} />
      <Silhueta cor="#121214" />
      {children}
    </div>
  );
}

function quadros(estilo: string, c: Cores, setor: string, nome: string): ReactNode[] {
  const f = FICHA[estilo];
  const titulo: CSSProperties = { fontFamily: `'${f.fonte}'`, fontWeight: f.peso, textTransform: f.caixaAlta ? "uppercase" : "none", lineHeight: 1.05 };
  const geist: CSSProperties = { fontFamily: "'Geist'", fontWeight: 400 };
  if (estilo === "lousa") {
    const lousa: CSSProperties = { position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 20%, #1d2430 0%, #0d1117 70%)` };
    const vidro: CSSProperties = { background: "linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04))", border: "2px solid rgba(255,255,255,.14)", borderRadius: 28, boxShadow: `0 0 60px ${rgba(c.acento, 0.18)}` };
    return [
      <div key={1} style={lousa}>
        <div style={{ position: "absolute", left: 80, right: 80, top: 260, color: "#eef2f7", fontSize: 108, ...titulo }}>
          Três passos para <span style={{ color: c.acento }}>vender mais</span>
          <div style={{ height: 12, width: 420, background: c.acento, marginTop: 24, boxShadow: `0 0 30px ${c.acento}` }} />
        </div>
        {["Gravar", "Cortar", "Publicar"].map((p, i) => (
          <div key={p} style={{ position: "absolute", left: 80, right: 80, top: 820 + i * 230, padding: "40px 48px", display: "flex", alignItems: "center", gap: 36, ...vidro, ...(i === 1 ? { borderColor: c.acento, boxShadow: `0 0 80px ${rgba(c.acento, 0.45)}` } : { opacity: 0.55 }) }}>
            <span style={{ ...titulo, fontSize: 72, color: c.acento }}>{i + 1}</span>
            <span style={{ ...titulo, fontSize: 70, color: "#eef2f7" }}>{p}</span>
          </div>
        ))}
      </div>,
      <Gravacao key={2} setor={setor} escurecer={0.35}>
        <div style={{ position: "absolute", left: 70, right: 70, top: 220, padding: 56, ...vidro, background: "rgba(15,18,24,.72)" }}>
          <div style={{ ...geist, fontSize: 36, letterSpacing: 6, color: c.acento }}>● DECISÃO</div>
          <div style={{ ...titulo, fontSize: 260, color: c.acento, marginTop: 20, textShadow: `0 0 50px ${rgba(c.acento, 0.6)}` }}>70%</div>
          <div style={{ ...geist, fontSize: 52, color: "#eef2f7", marginTop: 16 }}>da compra já foi decidida antes do vendedor</div>
        </div>
      </Gravacao>,
      <Gravacao key={3} setor={setor} escurecer={0.3}>
        <div style={{ position: "absolute", left: 70, right: 70, top: 160, padding: 56, ...vidro, background: "rgba(15,18,24,.7)" }}>
          <div style={{ ...titulo, fontSize: 70, color: "#eef2f7", marginBottom: 30 }}>Antes de gravar</div>
          {["Um tema por vídeo", "Gancho nos 3 segundos", "Uma chamada no fim"].map((t, i) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 26, opacity: i === 2 ? 1 : 0.6 }}>
              <span style={{ width: 58, height: 58, borderRadius: 14, background: c.acento, color: sobre(c.acento), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>✓</span>
              <span style={{ ...geist, fontSize: 50, color: "#eef2f7" }}>{t}</span>
            </div>
          ))}
        </div>
      </Gravacao>,
      <Gravacao key={4} setor={setor} escurecer={0.2}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 640, textAlign: "center", ...titulo, fontSize: 120, color: "#fff", textShadow: "0 6px 30px rgba(0,0,0,.6)" }}>
          isso <span style={{ color: c.acento }}>muda tudo</span>
        </div>
      </Gravacao>,
    ];
  }
  if (estilo === "consorcio") {
    const faixa = (txt: string, tam: number): ReactNode => (
      <span style={{ display: "inline-block", background: c.acento, color: sobre(c.acento), padding: "6px 28px", transform: "rotate(-2deg)", clipPath: "polygon(0 6%, 100% 0, 98% 94%, 2% 100%)", ...titulo, fontSize: tam }}>{txt}</span>
    );
    return [
      <Gravacao key={1} setor={setor} escurecer={0.15}>
        <div style={{ position: "absolute", left: 70, right: 70, top: 300, ...titulo, fontSize: 96, color: "#fff", textShadow: "0 4px 20px rgba(0,0,0,.6)" }}>
          Carta de crédito de
          <div style={{ marginTop: 26 }}>{faixa("R$ 300 mil", 180)}</div>
        </div>
      </Gravacao>,
      <Gravacao key={2} setor={setor} escurecer={0.2}>
        <div style={{ position: "absolute", left: 70, bottom: 640, display: "flex", alignItems: "center", gap: 22, background: "#fff", borderRadius: 999, padding: "22px 40px 22px 22px", boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
          <span style={{ width: 70, height: 70, borderRadius: 999, background: c.acento, color: sobre(c.acento), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>✓</span>
          <span style={{ ...titulo, fontSize: 54, color: "#111" }}>{nome}</span>
        </div>
      </Gravacao>,
      <div key={3} style={{ position: "absolute", inset: 0, background: c.escuro, display: "flex", alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
        <div style={{ ...titulo, fontSize: 150, color: "#fff" }}>
          Sua chave,
          <div style={{ marginTop: 20 }}>{faixa("planejada.", 150)}</div>
        </div>
      </div>,
      <Gravacao key={4} setor={setor} escurecer={0.25}>
        <div style={{ position: "absolute", left: 60, right: 60, top: 200, background: "#fff", borderRadius: 30, padding: 44, boxShadow: "0 16px 50px rgba(0,0,0,.35)" }}>
          <div style={{ ...geist, fontSize: 34, color: "#666" }}>Comentário</div>
          <div style={{ ...geist, fontSize: 50, color: "#111", marginTop: 12 }}>Dá para usar o FGTS?</div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 620, textAlign: "center", ...titulo, fontSize: 110, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,.7)" }}>
          dá, <span style={{ color: c.acento }}>no lance</span>
        </div>
      </Gravacao>,
    ];
  }
  // vox
  const papel = "#efe9dd";
  const marca = (t: string): ReactNode => <span style={{ background: `linear-gradient(transparent 38%, ${rgba(c.acento, 0.85)} 38%, ${rgba(c.acento, 0.85)} 92%, transparent 92%)`, padding: "0 6px" }}>{t}</span>;
  return [
    <div key={1} style={{ position: "absolute", inset: 0, background: papel }}>
      <div style={{ position: "absolute", left: 120, top: 260, width: 640, height: 760, background: "#fff", padding: 22, transform: "rotate(-4deg)", boxShadow: "0 16px 40px rgba(0,0,0,.25)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/modelos-de-arte/fotos/${setor}.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.15)" }} />
      </div>
      <div style={{ position: "absolute", left: 470, top: 940, width: 520, height: 130, background: c.acento, transform: "rotate(6deg)", opacity: 0.9 }} />
      <div style={{ position: "absolute", left: 80, right: 80, top: 1180, ...titulo, fontSize: 112, color: "#151515" }}>
        Por que o {marca("cliente some")}
      </div>
    </div>,
    <div key={2} style={{ position: "absolute", inset: 0, background: papel, padding: 90, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ ...titulo, fontSize: 300, color: c.acento, lineHeight: 0.6, height: 150 }}>“</div>
      <div style={{ fontFamily: "'Playfair Display'", fontStyle: "italic", fontSize: 110, color: "#151515", lineHeight: 1.15 }}>Quem é lembrado {marca("é escolhido")}.</div>
      <div style={{ ...geist, fontSize: 38, letterSpacing: 6, color: "#555", marginTop: 50 }}>EQUIPE DE CONTEÚDO</div>
    </div>,
    <Gravacao key={3} setor={setor} escurecer={0.1}>
      <div style={{ position: "absolute", left: 60, right: 60, top: 180, background: papel, padding: "36px 44px", transform: "rotate(-1.5deg)", boxShadow: "0 10px 30px rgba(0,0,0,.3)", ...titulo, fontSize: 82, color: "#151515" }}>
        Sem tempo de {marca("gravar?")}
      </div>
      <div style={{ position: "absolute", left: 120, right: 60, top: 470, background: "#fff", padding: "26px 40px", transform: "rotate(1deg)", ...titulo, fontSize: 58, color: "#151515" }}>Uma gravação vira a semana.</div>
    </Gravacao>,
    <div key={4} style={{ position: "absolute", inset: 0, background: papel }}>
      <div style={{ position: "absolute", left: 80, right: 80, top: 230, ...titulo, fontSize: 96, color: "#151515" }}>Como a venda {marca("acontece")}</div>
      {["Conteúdo", "Conversa", "Venda"].map((p, i) => (
        <div key={p} style={{ position: "absolute", left: 140, top: 720 + i * 330, display: "flex", alignItems: "center", gap: 40 }}>
          <span style={{ width: 90, height: 90, borderRadius: 999, border: `6px solid ${c.acento}`, display: "flex", alignItems: "center", justifyContent: "center", ...titulo, fontSize: 50, color: c.acento }}>{i + 1}</span>
          <span style={{ background: "#fff", padding: "16px 34px", boxShadow: "0 8px 20px rgba(0,0,0,.15)", ...titulo, fontSize: 70, color: "#151515" }}>{p}</span>
        </div>
      ))}
      <div style={{ position: "absolute", left: 182, top: 810, width: 6, height: 480, background: c.acento }} />
    </div>,
  ];
}

function Quadro({ children, largura }: { children: ReactNode; largura: number }) {
  const escala = largura / 1080;
  return (
    <div style={{ width: largura, height: 1920 * escala, position: "relative", overflow: "hidden", borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.2)", flexShrink: 0 }}>
      <div style={{ width: 1080, height: 1920, transform: `scale(${escala})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>{children}</div>
    </div>
  );
}

export function PreviaDoEstiloDeVideo({ projectId, estiloId, nomeDoEstilo }: { projectId: string; estiloId: string; nomeDoEstilo: string }) {
  useFontesDoVideo();
  const [marca, setMarca] = useState<{ cores: Cores; setor: string; nome: string } | null>(null);
  const caixa = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/modelos-de-arte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && d?.marca && setMarca({ cores: d.marca.cores, setor: d.marca.setor, nome: d.marca.nome }))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [marca]);
  const ficha = FICHA[estiloId];
  if (!ficha || !marca) return null;
  // Quatro por linha no computador, dois no celular.
  const porLinha = w < 520 ? 2 : 4;
  const larguraDoQuadro = Math.max(80, Math.floor((w - (porLinha - 1) * 10) / porLinha));
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--brand)", background: "var(--bg-elevated)" }} aria-labelledby="previa-video">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p id="previa-video" className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <Film className="h-4 w-4 text-orange-500" /> Seu vídeo vai ficar assim: {nomeDoEstilo}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {ficha.acabamento} Fonte <b style={{ fontFamily: `'${ficha.fonte}'`, fontWeight: ficha.peso }}>{ficha.fonte}</b>, nas cores da sua marca.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[marca.cores.acento, marca.cores.escuro, marca.cores.claro].map((cor) => (
            <span key={cor} className="h-5 w-5 rounded-full border" style={{ background: cor, borderColor: "var(--border)" }} />
          ))}
        </div>
      </div>
      <div ref={caixa} className="mt-3 flex flex-wrap gap-[10px]">
        {w > 0 && quadros(estiloId, marca.cores, marca.setor, marca.nome).map((q, i) => <Quadro key={i} largura={larguraDoQuadro}>{q}</Quadro>)}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Quadros de exemplo com uma silhueta no seu lugar; no vídeo de verdade é você, com a sua fala e o seu texto.
      </p>
      {ficha.reais > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            Ver quadros reais do nosso editor neste estilo (cores de exemplo)
          </summary>
          <div className="mt-2 flex flex-wrap gap-[10px]">
            {Array.from({ length: ficha.reais }, (_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={`/estilos-de-video/${estiloId}/${i + 1}.jpg`} alt={`Quadro real ${i + 1} do estilo ${nomeDoEstilo}`} loading="lazy" style={{ width: larguraDoQuadro, height: (larguraDoQuadro * 16) / 9, objectFit: "cover", borderRadius: 10 }} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
