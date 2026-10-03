import React from "react";
import {
  ComDestaque,
  corDoTexto,
  corFraca,
  entradaDoBloco,
  escuroDoTema,
  estiloDoApoio,
  estiloDoPainel,
  estiloDoTitulo,
  limitar,
  lista,
  margens,
  misturar,
  mola,
  progressoDoItem,
  rgba,
  saiSuave,
  Selo,
  texto,
  type Ctx,
} from "../base";

/** Número no jeito brasileiro (1.500; 3,5). */
function formatar(v: number, decimais: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

/** O número grande no degradê da marca (ou no bloco, no impacto). */
function NumeroGrande({ c, valor, tam }: { c: Ctx; valor: string; tam: number }) {
  const { tema, u } = c;
  const claro = misturar(tema.acento, "#ffffff", 0.55);
  const estilo: React.CSSProperties = {
    fontFamily: tema.fonteTitulo === "Playfair Display" ? "Playfair Display" : tema.fonteTitulo === "Geist" ? "Geist" : tema.fonteTitulo,
    fontWeight: tema.fonteTitulo === "Geist" ? 700 : tema.pesoTitulo,
    fontSize: tam * u,
    lineHeight: 1,
    letterSpacing: "-0.03em",
    fontVariantNumeric: "tabular-nums",
  };
  if (tema.visual === "documental") return <span style={{ ...estilo, color: misturar(tema.acento, "#000000", 0.2) }}>{valor}</span>;
  return <span style={{ ...estilo, background: `linear-gradient(100deg, ${claro}, ${tema.acento})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{valor}</span>;
}

/** NÚMERO EM DESTAQUE: o cartão grande com o número que conta até o dito (o 88% do pitch). */
export function NumeroDestaque(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const valor = Number(p.valor) || 0;
  const dec = Number.isFinite(Number(p.decimais)) ? Number(p.decimais) : Number.isInteger(valor) ? 0 : 1;
  const conta = saiSuave((c.t - 0.15) / Math.max(0.4, c.dur > 2.6 ? 1.1 : 0.6));
  const mostrado = `${texto(p.prefixo)}${formatar(valor * conta, dec)}${texto(p.sufixo)}`;
  const larg = vertical ? c.W - 120 * u : 1500 * u;
  const tam = Number(p.tamanho) || (vertical ? 210 : 250);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...entradaDoBloco(c, c.entra, 30) }}>
      <div
        style={{
          position: "relative",
          width: larg,
          marginTop: vertical ? -300 * u : -20 * u,
          padding: `${60 * u}px ${70 * u}px`,
          borderRadius: (tema.visual === "documental" ? 8 : 36) * u,
          overflow: "hidden",
          background: tema.visual === "documental" ? "#f7f2e6" : `linear-gradient(135deg, ${misturar(escuroDoTema(tema), "#2b4f86", 0.35)}, ${escuroDoTema(tema)})`,
          border: `${1 * u}px solid ${tema.visual === "documental" ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.10)"}`,
          boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,.5)`,
        }}
      >
        {tema.visual !== "documental" ? (
          <div style={{ position: "absolute", right: -160 * u, top: -220 * u, width: 760 * u, height: 760 * u, borderRadius: "50%", background: `radial-gradient(circle, ${rgba(tema.acento, 0.3)}, ${rgba(tema.acento, 0)} 65%)` }} />
        ) : null}
        {p.rotulo ? <Selo c={c} texto={texto(p.rotulo)} /> : null}
        {p.antes ? <div style={{ ...estiloDoTitulo(c, vertical ? 40 : 44), marginTop: 28 * u, color: corFraca(c) }}>{texto(p.antes)}</div> : null}
        <div style={{ marginTop: 10 * u, whiteSpace: "nowrap" }}>
          <NumeroGrande c={c} valor={mostrado} tam={tam} />
        </div>
        {p.apoio ? (
          <div style={{ ...estiloDoTitulo(c, vertical ? 42 : 48), color: corDoTexto(c), marginTop: 12 * u, opacity: saiSuave((c.t - 0.6) / 0.5) }}>
            <ComDestaque c={c} texto={texto(p.apoio)} />
          </div>
        ) : null}
        {p.fonte ? <div style={{ ...estiloDoApoio(c, 22), marginTop: 22 * u }}>Fonte: {texto(p.fonte)}</div> : null}
      </div>
    </div>
  );
}

/** GRÁFICO DE BARRAS: as barras crescem, a dita em destaque, com o valor contando. */
export function Barras(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const barras = lista<{ rotulo?: string; valor?: number; destaque?: boolean }>(p.barras).slice(0, 6);
  const n = Math.max(1, barras.length);
  const max = Math.max(1e-9, ...barras.map((b) => Math.abs(Number(b.valor) || 0)));
  const m = margens(c);
  const lado = texto(p.lado);
  const larg = vertical ? m.largura : lado ? 860 * u : 1240 * u;
  const altPainel = vertical ? 760 * u : 700 * u;
  const altBarra = altPainel - 300 * u;
  const unidade = texto(p.unidade);
  const dec = barras.some((b) => !Number.isInteger(Number(b.valor))) ? 1 : 0;
  const direita = lado === "direita";
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo : 150 * u, ...(vertical ? { left: m.x } : direita ? { right: m.x } : lado ? { left: m.x } : { left: (c.W - larg) / 2 }), width: larg, height: altPainel, ...estiloDoPainel(c), padding: `${34 * u}px ${44 * u}px`, ...entradaDoBloco(c, c.entra, 24) }}>
      {p.titulo ? (
        <div style={{ ...estiloDoTitulo(c, vertical ? 48 : 50), color: corDoTexto(c) }}>
          <ComDestaque c={c} texto={texto(p.titulo)} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 44 * u, right: 44 * u, bottom: 80 * u, height: altBarra, display: "flex", alignItems: "flex-end", gap: 26 * u }}>
        {barras.map((b, k) => {
          const q = progressoDoItem(c, k, 0.12);
          const e = saiSuave(q / 0.9);
          const v = Number(b.valor) || 0;
          const h = (Math.abs(v) / max) * (altBarra - 70 * u) * e;
          const dest = Boolean(b.destaque);
          return (
            <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontFamily: "Geist", fontWeight: 700, fontSize: (dest ? 42 : 34) * u, color: dest ? tema.acento : corDoTexto(c), marginBottom: 10 * u, opacity: limitar(e * 3), fontVariantNumeric: "tabular-nums" }}>
                {formatar(v * e, dec)}
                {unidade}
              </div>
              <div
                style={{
                  width: "100%",
                  height: h,
                  borderRadius: `${12 * u}px ${12 * u}px ${4 * u}px ${4 * u}px`,
                  background: dest ? `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.15)}, ${misturar(tema.acento, "#000000", 0.3)})` : tema.visual === "documental" ? "rgba(27,26,23,.25)" : "linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.10))",
                  boxShadow: dest ? `0 0 ${36 * u}px ${rgba(tema.acento, 0.45)}` : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 44 * u, right: 44 * u, bottom: 24 * u, display: "flex", gap: 26 * u }}>
        {barras.map((b, k) => (
          <div key={k} style={{ flex: 1, textAlign: "center", ...estiloDoApoio(c, n > 4 ? 22 : 26), color: b.destaque ? corDoTexto(c) : corFraca(c), fontWeight: b.destaque ? 600 : 400 }}>
            {texto(b.rotulo)}
          </div>
        ))}
      </div>
      {p.fonte ? <div style={{ position: "absolute", right: 44 * u, top: 40 * u, ...estiloDoApoio(c, 20) }}>Fonte: {texto(p.fonte)}</div> : null}
    </div>
  );
}

/**
 * CIFRÃO FUTURISTA: dinheiro num vídeo de tecnologia. Anéis de luz, grade em
 * perspectiva, o símbolo em metal com o brilho da marca e o valor dito embaixo.
 */
export function Cifrao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const simbolo = texto(p.simbolo, "R$");
  const e = saiSuave(c.entra);
  const pop = mola((c.t - 0.1) / 0.6);
  const giro = 40 * saiSuave(c.t / 1.2);
  const tam = vertical ? 620 * u : 560 * u;
  const cx = vertical ? c.W / 2 : texto(p.lado) === "esquerda" ? c.W * 0.3 : texto(p.lado) === "direita" ? c.W * 0.7 : c.W / 2;
  const cy = vertical ? c.H * 0.3 : c.H * 0.44;
  const claro = misturar(tema.acento, "#ffffff", 0.6);
  const particulas = Array.from({ length: 18 }, (_, i) => {
    const ang = (i / 18) * Math.PI * 2 + i * 0.7;
    const r = tam * (0.42 + ((i * 37) % 10) / 40);
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.9, s: 3 + ((i * 13) % 5) };
  });
  return (
    <div style={{ position: "absolute", inset: 0, opacity: c.fica }}>
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="cif-brilho">
            <stop offset="0" stopColor={tema.acento} stopOpacity={0.55} />
            <stop offset="1" stopColor={tema.acento} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="cif-metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" stopColor={claro} />
            <stop offset="0.55" stopColor={tema.acento} />
            <stop offset="1" stopColor={misturar(tema.acento, "#000000", 0.45)} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={tam * 0.62 * e} fill="url(#cif-brilho)" />
        {/* grade em perspectiva embaixo do símbolo */}
        <g opacity={0.55 * e} stroke={rgba(tema.acento, 0.55)} strokeWidth={1.4 * u}>
          {Array.from({ length: 11 }, (_, i) => {
            const x = cx + (i - 5) * tam * 0.14;
            return <line key={`v${i}`} x1={cx + (i - 5) * tam * 0.04} y1={cy + tam * 0.42} x2={x} y2={cy + tam * 0.72} />;
          })}
          {Array.from({ length: 5 }, (_, i) => {
            const y = cy + tam * (0.42 + i * i * 0.018);
            const w = tam * (0.22 + i * 0.12);
            return <line key={`h${i}`} x1={cx - w} y1={y} x2={cx + w} y2={y} />;
          })}
        </g>
        {/* anéis */}
        {[0.5, 0.42, 0.34].map((r, i) => (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${(i % 2 ? -1 : 1) * giro + i * 30})`}>
            <circle r={tam * r * (0.7 + 0.3 * e)} fill="none" stroke={rgba(tema.acento, 0.75 - i * 0.18)} strokeWidth={(3 - i * 0.6) * u} strokeDasharray={`${tam * r * 0.9} ${tam * r * 0.35}`} strokeLinecap="round" opacity={e} />
          </g>
        ))}
        {particulas.map((q, i) => (
          <circle key={i} cx={cx + q.x * e} cy={cy + q.y * e} r={q.s * u} fill={i % 3 ? claro : tema.acento} opacity={0.8 * e} />
        ))}
        <g transform={`translate(${cx} ${cy}) scale(${0.4 + 0.6 * pop})`} opacity={limitar(c.t / 0.2)}>
          <text x={0} y={tam * 0.13} textAnchor="middle" fontFamily="Geist" fontWeight={700} fontSize={(simbolo.length > 1 ? 0.36 : 0.5) * tam} fill="url(#cif-metal)" stroke={rgba("#ffffff", 0.5)} strokeWidth={1.5 * u} style={{ filter: `drop-shadow(0 0 ${24 * u}px ${rgba(tema.acento, 0.8)})` }}>
            {simbolo}
          </text>
        </g>
      </svg>
      {p.valor || p.rotulo ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: cy + tam * (vertical ? 0.5 : 0.48), display: "flex", flexDirection: "column", alignItems: "center", opacity: saiSuave((c.t - 0.45) / 0.5) }}>
          {p.valor ? (
            <div style={{ ...estiloDoPainel(c), padding: `${14 * u}px ${34 * u}px` }}>
              <NumeroGrande c={c} valor={texto(p.valor)} tam={vertical ? 92 : 84} />
            </div>
          ) : null}
          {p.rotulo ? <div style={{ ...estiloDoTitulo(c, vertical ? 40 : 40), color: "#ffffff", marginTop: 16 * u, textShadow: "0 2px 14px rgba(0,0,0,.8)" }}>{texto(p.rotulo)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** MEDIDOR: o anel que enche até a porcentagem dita. */
export function Progresso(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const valor = limitar((Number(p.valor) || 0) / 100);
  const e = saiSuave((c.t - 0.1) / 1.0);
  const r = (vertical ? 200 : 190) * u;
  const circ = 2 * Math.PI * r;
  const m = margens(c);
  const direita = texto(p.lado) !== "esquerda";
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo + 40 * u : c.H * 0.2, ...(vertical ? { left: 0, right: 0, display: "flex", justifyContent: "center" } : direita ? { right: m.x + 60 * u } : { left: m.x + 60 * u }), ...entradaDoBloco(c, c.entra, 24) }}>
      <div style={{ ...estiloDoPainel(c), padding: `${40 * u}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * u }}>
        <div style={{ position: "relative", width: r * 2 + 40 * u, height: r * 2 + 40 * u }}>
          <svg width={r * 2 + 40 * u} height={r * 2 + 40 * u}>
            <circle cx={r + 20 * u} cy={r + 20 * u} r={r} fill="none" stroke={tema.visual === "documental" ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.12)"} strokeWidth={26 * u} />
            <circle cx={r + 20 * u} cy={r + 20 * u} r={r} fill="none" stroke={tema.acento} strokeWidth={26 * u} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - valor * e)} transform={`rotate(-90 ${r + 20 * u} ${r + 20 * u})`} style={{ filter: `drop-shadow(0 0 ${14 * u}px ${rgba(tema.acento, 0.6)})` }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <NumeroGrande c={c} valor={`${formatar((Number(p.valor) || 0) * e, 0)}${texto(p.sufixo, "%")}`} tam={vertical ? 120 : 110} />
          </div>
        </div>
        {p.rotulo ? <div style={{ ...estiloDoTitulo(c, 40), color: corDoTexto(c), maxWidth: r * 2 + 80 * u, textAlign: "center" }}>{texto(p.rotulo)}</div> : null}
      </div>
    </div>
  );
}

/** Uma "terra" de pontos determinística (o mapa simples não depende de dado geográfico). */
function pontosDoMapa(w: number, h: number, passo: number): Array<[number, number]> {
  const saida: Array<[number, number]> = [];
  const blobs = [
    [0.22, 0.38, 0.2, 0.26],
    [0.3, 0.72, 0.1, 0.2],
    [0.52, 0.34, 0.11, 0.16],
    [0.55, 0.62, 0.12, 0.22],
    [0.74, 0.36, 0.2, 0.2],
    [0.84, 0.74, 0.08, 0.08],
  ];
  for (let y = passo / 2; y < h; y += passo) {
    for (let x = passo / 2; x < w; x += passo) {
      const fx = x / w;
      const fy = y / h;
      const dentro = blobs.some(([cx, cy, rx, ry]) => ((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2 < 1 - 0.18 * Math.sin(fx * 31 + fy * 17));
      if (dentro) saida.push([x, y]);
    }
  }
  return saida;
}

/** MAPA SIMPLES: a terra em pontos, os lugares ditos como pinos que caem e a rota que se desenha entre eles. */
export function Mapa(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const pontos = lista<{ rotulo?: string; x?: number; y?: number }>(p.pontos).slice(0, 6);
  const m = margens(c);
  const w = vertical ? m.largura : 1400 * u;
  const h = vertical ? 900 * u : 720 * u;
  const x0 = vertical ? m.x : (c.W - w) / 2;
  const y0 = vertical ? m.topo + (p.titulo ? 150 * u : 0) : 150 * u;
  const terra = pontosDoMapa(w, h, 22 * u);
  const prog = pontos.map((_, k) => progressoDoItem(c, k, 0.4));
  const pos = (q: { x?: number; y?: number }) => [limitar(Number(q.x) || 0.5, 0.05, 0.95) * w, limitar(Number(q.y) || 0.5, 0.08, 0.92) * h] as const;
  return (
    <div style={{ position: "absolute", left: x0, top: y0, width: w, ...entradaDoBloco(c, c.entra, 20) }}>
      {p.titulo ? (
        <div style={{ ...estiloDoPainel(c), display: "inline-block", padding: `${18 * u}px ${28 * u}px`, marginBottom: 18 * u, ...(vertical ? { position: "absolute", top: -150 * u } : {}) }}>
          <div style={{ ...estiloDoTitulo(c, vertical ? 52 : 52), color: corDoTexto(c) }}>
            <ComDestaque c={c} texto={texto(p.titulo)} />
          </div>
        </div>
      ) : null}
      <div style={{ position: "relative", width: w, height: h, ...estiloDoPainel(c), overflow: "hidden" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          {terra.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3.4 * u} fill={tema.visual === "documental" ? "rgba(60,50,40,.28)" : "rgba(160,185,215,.30)"} />
          ))}
          {pontos.map((q, k) => {
            if (k === 0 || p.rota === false) return null;
            const [ax, ay] = pos(pontos[k - 1]);
            const [bx, by] = pos(q);
            const mx = (ax + bx) / 2;
            const my = Math.min(ay, by) - Math.abs(bx - ax) * 0.28;
            const d = `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`;
            const comp = Math.hypot(bx - ax, by - ay) * 1.3;
            const e = saiSuave(prog[k] * 1.4);
            return <path key={`r${k}`} d={d} fill="none" stroke={tema.acento} strokeWidth={4 * u} strokeDasharray={`${comp}`} strokeDashoffset={comp * (1 - e)} strokeLinecap="round" />;
          })}
        </svg>
        {pontos.map((q, k) => {
          const [x, y] = pos(q);
          const e = mola(prog[k]);
          return (
            <div key={k} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) translateY(${(1 - e) * -40 * u}px)`, opacity: limitar(prog[k] * 3), display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ ...estiloDoPainel(c, true), padding: `${8 * u}px ${18 * u}px`, marginBottom: 8 * u, whiteSpace: "nowrap", fontFamily: c.tema.fonteTexto, fontWeight: 600, fontSize: 28 * u }}>{texto(q.rotulo)}</div>
              <svg width={34 * u} height={44 * u} viewBox="0 0 34 44">
                <path d="M17 43 C17 43 2 26 2 16 A15 15 0 0 1 32 16 C32 26 17 43 17 43 Z" fill={tema.acento} stroke="#ffffff" strokeWidth={2} />
                <circle cx={17} cy={16} r={5.5} fill="#ffffff" />
              </svg>
            </div>
          );
        })}
      </div>
      {p.apoio ? <div style={{ ...estiloDoApoio(c, 26), marginTop: 14 * u, color: corFraca(c) }}>{texto(p.apoio)}</div> : null}
    </div>
  );
}
