import React from "react";
import {
  ComDestaque,
  corDoTexto,
  entradaDoBloco,
  estiloDoApoio,
  estiloDoPainel,
  estiloDoTitulo,
  Icone,
  limitar,
  margens,
  misturar,
  mola,
  posicionar,
  rgba,
  saiSuave,
  sobreOAcento,
  texto,
  type Ctx,
} from "../base";

const ponto = (v: unknown, padrao: number) => limitar(typeof v === "number" ? v : padrao, 0.02, 0.98);

/** SETA: desenhada à mão sobre a gravação, do rótulo até o que está sendo mostrado. */
export function Seta(c: Ctx) {
  const { props: p, u, tema, W, H } = c;
  const de = (p.de ?? {}) as { x?: number; y?: number };
  const para = (p.para ?? {}) as { x?: number; y?: number };
  const ax = ponto(de.x, 0.2) * W;
  const ay = ponto(de.y, 0.3) * H;
  const bx = ponto(para.x, 0.5) * W;
  const by = ponto(para.y, 0.5) * H;
  const dx = bx - ax;
  const dy = by - ay;
  // A curva sai de lado: o controle fica perpendicular ao meio do caminho.
  const mx = (ax + bx) / 2 - dy * 0.25;
  const my = (ay + by) / 2 + dx * 0.25;
  const comp = Math.hypot(dx, dy) * 1.25 + 1;
  const desenho = saiSuave((c.t - 0.15) / 0.5);
  const ang = Math.atan2(by - my, bx - mx);
  const ponta = 34 * u;
  const p1 = [bx - ponta * Math.cos(ang - 0.45), by - ponta * Math.sin(ang - 0.45)];
  const p2 = [bx - ponta * Math.cos(ang + 0.45), by - ponta * Math.sin(ang + 0.45)];
  const cabeca = limitar((desenho - 0.85) / 0.15);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: c.fica }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 ${4 * u}px ${8 * u}px rgba(0,0,0,.55))` }}>
        <path d={`M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`} fill="none" stroke={tema.acento} strokeWidth={9 * u} strokeLinecap="round" strokeDasharray={comp} strokeDashoffset={comp * (1 - desenho)} />
        <path d={`M${p1[0]} ${p1[1]} L${bx} ${by} L${p2[0]} ${p2[1]}`} fill="none" stroke={tema.acento} strokeWidth={9 * u} strokeLinecap="round" strokeLinejoin="round" opacity={cabeca} />
      </svg>
      {p.rotulo ? (
        <div style={{ position: "absolute", left: ax, top: ay, transform: `translate(${ax > W * 0.6 ? "-100%" : "-50%"}, -120%) scale(${0.7 + 0.3 * mola(c.t / 0.45)})`, opacity: limitar(c.t / 0.15) }}>
          <div style={{ ...estiloDoPainel(c, true), padding: `${12 * u}px ${26 * u}px`, whiteSpace: "nowrap" }}>
            <span style={{ ...estiloDoTitulo(c, c.vertical ? 46 : 44) }}>{texto(p.rotulo)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** CÍRCULO À MÃO: o traço da marca em volta do que importa na imagem. */
export function Circulo(c: Ctx) {
  const { props: p, u, tema, W, H } = c;
  const cx = ponto(p.x, 0.5) * W;
  const cy = ponto(p.y, 0.5) * H;
  const rx = limitar(Number(p.raio) || 0.12, 0.03, 0.45) * Math.min(W, H) * 1.15;
  const ry = rx * 0.78;
  // Uma volta e um pouco (o traço passa do começo, como feito à mão).
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = -Math.PI * 0.6 + (i / 64) * Math.PI * 2.15;
    const w = 1 + 0.05 * Math.sin(i * 0.9);
    pts.push(`${cx + Math.cos(a) * rx * w},${cy + Math.sin(a) * ry * (2 - w)}`);
  }
  const comp = 2 * Math.PI * Math.max(rx, ry) * 1.15;
  const d = saiSuave((c.t - 0.05) / 0.55);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: c.fica }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 ${3 * u}px ${6 * u}px rgba(0,0,0,.5))` }}>
        <polyline points={pts.join(" ")} fill="none" stroke={tema.acento} strokeWidth={8 * u} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={comp} strokeDashoffset={comp * (1 - d)} />
      </svg>
      {p.rotulo ? (
        <div style={{ position: "absolute", left: cx, top: cy - ry - 20 * u, transform: `translate(-50%, -100%)`, opacity: limitar((d - 0.6) / 0.4) }}>
          <div style={{ ...estiloDoPainel(c, true), padding: `${10 * u}px ${24 * u}px`, whiteSpace: "nowrap" }}>
            <span style={{ ...estiloDoTitulo(c, c.vertical ? 42 : 40) }}>{texto(p.rotulo)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ÍCONE COM RÓTULO: o objeto do que é dito (relógio, alvo, igreja), grande e limpo. */
export function IconeComRotulo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const tam = (vertical ? 200 : 180) * u;
  const pop = c.tema.visual === "impacto" ? mola(c.entra) : saiSuave(c.entra);
  const pos = texto(p.posicao, vertical ? "topo" : "direita");
  return (
    <div style={{ ...posicionar(c, pos), opacity: limitar(c.entra * 3) * c.fica }}>
      <div style={{ ...estiloDoPainel(c), padding: `${34 * u}px ${40 * u}px`, display: "flex", alignItems: "center", gap: 30 * u, maxWidth: vertical ? margens(c).largura : 980 * u, transform: `scale(${0.85 + 0.15 * pop})` }}>
        <div style={{ width: tam, height: tam, flex: "0 0 auto", borderRadius: 36 * u, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 35% 30%, ${rgba(tema.acento, 0.4)}, ${rgba(tema.acento, 0.1)})`, border: `${2 * u}px solid ${rgba(tema.acento, 0.6)}` }}>
          <Icone nome={texto(p.nome, "estrela")} tam={tam * 0.56} cor={tema.visual === "documental" ? misturar(tema.acento, "#000000", 0.2) : misturar(tema.acento, "#ffffff", 0.35)} traco={1.8} />
        </div>
        {p.rotulo ? (
          <div>
            <div style={{ ...estiloDoTitulo(c, vertical ? 54 : 58), color: corDoTexto(c) }}>
              <ComDestaque c={c} texto={texto(p.rotulo)} />
            </div>
            {p.apoio ? <div style={{ ...estiloDoApoio(c, 28), marginTop: 10 * u }}>{texto(p.apoio)}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * DESENHO SOB MEDIDA: o SVG que o editor desenha para o que não está no
 * catálogo (viewBox 0 0 200 200; ACENTO, ESCURO e CLARO viram as cores da
 * marca). Ele entra se revelando do centro e pode ter rótulo. O app limpa o
 * SVG antes (só formas, sem script, sem link); aqui a limpeza repete.
 */
export function Desenho(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const svg = String(p.svg ?? "")
    .replace(/<\s*(script|foreignObject|image|a|use|style)[\s\S]*?(\/>|<\/\s*\1\s*>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/ACENTO/g, tema.acento)
    .replace(/ESCURO/g, tema.escuro)
    .replace(/CLARO/g, misturar(tema.acento, "#ffffff", 0.6))
    .replace(/BRANCO/g, "#ffffff");
  const tam = Math.min((Number(p.tamanho) || (vertical ? 480 : 520)) * u, vertical ? c.H * 0.36 : c.H * 0.62);
  const revela = saiSuave((c.t - 0.05) / 0.7);
  const pos = texto(p.posicao, "centro");
  const lugar: React.CSSProperties =
    vertical
      ? { position: "absolute", left: (c.W - tam) / 2, top: c.H * 0.12 }
      : pos === "direita"
      ? { position: "absolute", right: margens(c).x, top: (c.H - tam) / 2 - 40 * u }
      : pos === "esquerda"
      ? { position: "absolute", left: margens(c).x, top: (c.H - tam) / 2 - 40 * u }
      : { position: "absolute", left: (c.W - tam) / 2, top: vertical ? c.H * 0.12 : (c.H - tam) / 2 - 60 * u };
  return (
    <div style={{ ...lugar, width: tam, opacity: c.fica, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: tam, height: tam, clipPath: `circle(${revela * 75}% at 50% 50%)`, transform: `scale(${0.9 + 0.1 * revela})`, filter: `drop-shadow(0 ${12 * u}px ${30 * u}px rgba(0,0,0,.55))` }}>
        <svg width={tam} height={tam} viewBox="0 0 200 200" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {p.rotulo ? (
        <div style={{ ...estiloDoPainel(c), marginTop: 18 * u, padding: `${14 * u}px ${28 * u}px`, opacity: limitar((revela - 0.5) * 2), whiteSpace: "nowrap" }}>
          <span style={{ ...estiloDoTitulo(c, vertical ? 48 : 46), color: corDoTexto(c) }}>
            <ComDestaque c={c} texto={texto(p.rotulo)} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A MOLDURA DO CARTÃO (automática): o contorno fino do vídeo em cartão, por cima da gravação. */
export function MolduraDoCartao(c: Ctx) {
  const { props: p, u, tema } = c;
  const x = Number(p.x) || 0;
  const y = Number(p.y) || 0;
  const w = Number(p.w) || 100;
  const h = Number(p.h) || 100;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 28 * u, border: `${2 * u}px solid ${tema.visual === "documental" ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.22)"}`, boxShadow: `inset 0 0 0 ${1 * u}px rgba(0,0,0,.25)`, opacity: c.fica }}>
      {p.rotulo ? (
        <div style={{ position: "absolute", left: 22 * u, bottom: 22 * u, padding: `${8 * u}px ${18 * u}px`, borderRadius: 999, background: rgba(tema.acento, 0.95), color: sobreOAcento(tema), fontFamily: tema.fonteMono, fontSize: 20 * u, letterSpacing: "0.12em", textTransform: "uppercase" }}>{texto(p.rotulo)}</div>
      ) : null}
    </div>
  );
}

/** Uma faixa de destaque que corre embaixo da palavra dita (ênfase leve sobre a pessoa). */
export function Sublinhado(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const e = saiSuave(c.t / 0.35);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: vertical ? m.base - 360 * u : c.H * 0.62, display: "flex", justifyContent: texto(p.lado) === "direita" ? "flex-end" : texto(p.lado) === "esquerda" ? "flex-start" : "center", padding: `0 ${m.x}px`, opacity: c.fica }}>
      <div style={{ position: "relative", ...estiloDoTitulo(c, Math.min(vertical ? 84 : 92, (c.W - 2 * m.x) / u / Math.max(4, texto(p.texto).length * 0.62))), whiteSpace: "nowrap", color: "#ffffff", textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,.7)`, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` }}>
        <span style={{ position: "absolute", left: -10 * u, right: -10 * u, bottom: 4 * u, height: "34%", background: rgba(tema.acento, 0.9), zIndex: -1, transform: `scaleX(${e})`, transformOrigin: "left" }} />
        {texto(p.texto)}
      </div>
    </div>
  );
}
