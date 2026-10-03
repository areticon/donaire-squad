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
import { brilho, molaFisica, TextoCinetico, Vidro } from "../kit";

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
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 0 ${8 * u}px ${tema.acento}) drop-shadow(0 ${4 * u}px ${8 * u}px rgba(0,0,0,.55))` }}>
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
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 0 ${8 * u}px ${tema.acento}) drop-shadow(0 ${3 * u}px ${6 * u}px rgba(0,0,0,.5))` }}>
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

/** ÍCONE COM RÓTULO: o objeto numa esfera de vidro com o anel de luz girando, e o rótulo palavra a palavra. */
export function IconeComRotulo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const tam = (vertical ? 200 : 180) * u;
  const s = molaFisica(c.t, 200, 13);
  const pos = texto(p.posicao, vertical ? "topo" : "direita");
  const giro = c.t * 40;
  return (
    <div style={{ ...posicionar(c, pos), opacity: limitar(c.t / 0.12) * c.fica }}>
      <Vidro c={c} estilo={{ padding: `${30 * u}px ${38 * u}px`, display: "flex", alignItems: "center", gap: 30 * u, maxWidth: vertical ? margens(c).largura : 980 * u, transform: `perspective(${1200 * u}px) translateY(${(1 - s) * 30 * u}px) rotateX(${(1 - s) * 18}deg)` }}>
        <div style={{ position: "relative", width: tam, height: tam, flex: "0 0 auto", transform: `scale(${0.4 + 0.6 * s})` }}>
          <svg width={tam} height={tam} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            <circle cx={tam / 2} cy={tam / 2} r={tam * 0.5} fill="none" stroke={rgba(tema.acento, 0.8)} strokeWidth={3 * u} strokeDasharray={`${tam * 0.9} ${tam * 0.5}`} transform={`rotate(${giro} ${tam / 2} ${tam / 2})`} style={{ filter: `drop-shadow(0 0 ${6 * u}px ${tema.acento})` }} />
          </svg>
          <div style={{ position: "absolute", inset: 10 * u, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 35% 28%, ${rgba("#ffffff", 0.35)}, ${rgba(tema.acento, 0.45)} 45%, ${rgba(misturar(tema.acento, "#000000", 0.6), 0.9)})`, boxShadow: `${brilho(tema.acento, u, 0.7)}, inset 0 ${-10 * u}px ${30 * u}px rgba(0,0,0,.35)` }}>
            <Icone nome={texto(p.nome, "estrela")} tam={tam * 0.5} cor="#ffffff" traco={1.9} />
          </div>
        </div>
        {p.rotulo ? (
          <div>
            <div style={{ ...estiloDoTitulo(c, vertical ? 54 : 58), color: corDoTexto(c) }}>
              <TextoCinetico c={c} texto={texto(p.rotulo)} estilo={{}} inicio={0.25} />
            </div>
            {p.apoio ? <div style={{ ...estiloDoApoio(c, 28), marginTop: 10 * u, opacity: saiSuave((c.t - 0.6) / 0.4) }}>{texto(p.apoio)}</div> : null}
          </div>
        ) : null}
      </Vidro>
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
      <div style={{ width: tam, height: tam, clipPath: `circle(${revela * 75}% at 50% 50%)`, transform: `scale(${0.9 + 0.1 * revela})`, filter: `drop-shadow(0 0 ${10 * u}px ${rgba(tema.acento, 0.8)}) drop-shadow(0 ${12 * u}px ${30 * u}px rgba(0,0,0,.55))` }}>
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

/** A MOLDURA DO CARTÃO (automática): a borda de luz do vídeo em cartão, que se acende em volta dele. */
export function MolduraDoCartao(c: Ctx) {
  const { props: p, u, tema } = c;
  const x = Number(p.x) || 0;
  const y = Number(p.y) || 0;
  const w = Number(p.w) || 100;
  const h = Number(p.h) || 100;
  const e = saiSuave(c.t / 0.5);
  const per = 2 * (w + h);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: c.fica }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={28 * u} fill="none" stroke={tema.visual === "documental" ? "rgba(255,255,255,.9)" : rgba(misturar(tema.acento, "#ffffff", 0.4), 0.9)} strokeWidth={2.5 * u} strokeDasharray={per} strokeDashoffset={per * (1 - e)} style={{ filter: `drop-shadow(0 0 ${10 * u}px ${tema.acento})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, borderRadius: 28 * u, boxShadow: `inset 0 0 ${60 * u}px rgba(0,0,0,.35)` }} />
      {p.rotulo ? (
        <div style={{ position: "absolute", left: 22 * u, bottom: 22 * u, padding: `${8 * u}px ${18 * u}px`, borderRadius: 999, background: rgba(tema.acento, 0.95), color: sobreOAcento(tema), fontFamily: tema.fonteMono, fontSize: 20 * u, letterSpacing: "0.12em", textTransform: "uppercase" }}>{texto(p.rotulo)}</div>
      ) : null}
    </div>
  );
}

/** SUBLINHADO: a expressão em letra grande sobre o peito, palavra a palavra, e a faixa de luz da marca que corre por baixo. */
export function Sublinhado(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const m = margens(c);
  const e = saiSuave((c.t - 0.25) / 0.35);
  const tam = Math.min(vertical ? 130 : 96, (c.W - 2 * m.x) / u / Math.max(4, texto(p.texto).length * (tema.caixaAlta ? 0.84 : 0.66)));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: vertical ? m.base - 360 * u : c.H * 0.62, display: "flex", justifyContent: texto(p.lado) === "direita" ? "flex-end" : texto(p.lado) === "esquerda" ? "flex-start" : "center", padding: `0 ${m.x}px`, opacity: c.fica }}>
      <div style={{ position: "relative", ...estiloDoTitulo(c, tam), whiteSpace: "nowrap", color: "#ffffff", textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,.75), 0 0 ${2 * u}px rgba(0,0,0,.6)` }}>
        <span style={{ position: "absolute", left: -12 * u, right: -12 * u, bottom: 2 * u, height: "30%", borderRadius: 6 * u, background: `linear-gradient(90deg, ${rgba(tema.acento, 0.7)}, ${tema.acento})`, boxShadow: brilho(tema.acento, u, 0.8), zIndex: -1, transform: `scaleX(${e})`, transformOrigin: "left" }} />
        <TextoCinetico c={c} texto={texto(p.texto)} estilo={{}} inicio={0} atraso={0.08} semTraco />
      </div>
    </div>
  );
}
