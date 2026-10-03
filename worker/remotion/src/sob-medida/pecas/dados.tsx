import React from "react";
import { corDoTexto, corFraca, estiloDoApoio, estiloDoTitulo, limitar, lista, margens, misturar, progressoDoItem, rgba, saiSuave, texto, type Ctx } from "../base";
import { acaso, brilho, Cantoneiras, contagem, Contador, entradaMola, EtiquetaHud, molaFisica, Palco, Regua, TextoCinetico, Vidro } from "../kit";
import { semente, SeloVivo } from "./texto";

/**
 * OS DADOS (03/10, segunda volta): o número dito vira um contador de rolo
 * com desfoque de movimento; barras e linhas crescem com o valor, sobre
 * régua e marcações de HUD; o anel enche com o brilho da marca; o mapa traça
 * a rota com o cometa de luz. Nada de valor inventado: só o que foi dito.
 */

function formatar(v: number, decimais: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}

/** O estilo do número grande: o degradê da marca com brilho (ou tinta, no documental). */
function estiloDoNumero(c: Ctx, tam: number): React.CSSProperties {
  const { tema, u } = c;
  const claro = misturar(tema.acento, "#ffffff", 0.6);
  const base: React.CSSProperties = {
    fontFamily: tema.fonteTitulo === "Playfair Display" ? "Playfair Display" : tema.fonteTitulo === "Geist" ? "Geist" : tema.fonteTitulo,
    fontWeight: tema.fonteTitulo === "Geist" ? 700 : tema.pesoTitulo,
    fontSize: tam * u,
    lineHeight: 1,
    letterSpacing: "-0.03em",
  };
  if (tema.visual === "documental") return { ...base, color: "#fbf3e2", textShadow: `0 ${6 * u}px ${24 * u}px rgba(0,0,0,.5)` };
  return { ...base, background: `linear-gradient(180deg, #ffffff 10%, ${claro} 50%, ${tema.acento} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 0 ${20 * u}px ${rgba(tema.acento, 0.55)})` };
}

/** NÚMERO EM DESTAQUE: no palco, o contador de rolo gigante dentro da mira, com o anel de HUD girando. */
export function NumeroDestaque(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const valor = Number(p.valor) || 0;
  const dec = Number.isFinite(Number(p.decimais)) ? Number(p.decimais) : Number.isInteger(valor) ? 0 : 1;
  const ini = 0.45;
  const { p: prog, vel } = contagem(c.t - ini, c.dur > 2.6 ? 1.3 : 0.7, valor, dec);
  const tam = Number(p.tamanho) || (vertical ? 230 : 280);
  const R = (vertical ? 380 : 360) * u;
  const cy = vertical ? c.H * 0.36 : c.H * 0.47;
  const giro = c.t * 12;
  const chegou = prog >= 1 ? saiSuave((c.t - ini - (c.dur > 2.6 ? 1.3 : 0.7)) / 0.3) : 0;
  return (
    <Palco c={c} semente={semente(c)}>
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <g transform={`translate(${c.W / 2} ${cy})`} opacity={saiSuave(c.t / 0.6)}>
          <circle r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={1.2 * u} />
          <g transform={`rotate(${giro})`}>
            {Array.from({ length: 120 }, (_, i) => {
              const a = (i / 120) * Math.PI * 2;
              const l = (i % 10 === 0 ? 22 : 9) * u;
              return <line key={i} x1={Math.cos(a) * R} y1={Math.sin(a) * R} x2={Math.cos(a) * (R - l)} y2={Math.sin(a) * (R - l)} stroke={i % 10 === 0 ? rgba(tema.acento, 0.9) : "rgba(255,255,255,.3)"} strokeWidth={1.4 * u} />;
            })}
          </g>
          <circle r={R + 26 * u} fill="none" stroke={tema.acento} strokeWidth={3 * u} strokeDasharray={`${2 * Math.PI * (R + 26 * u) * prog} ${4000 * u}`} transform="rotate(-90)" style={{ filter: `drop-shadow(0 0 ${10 * u}px ${tema.acento})` }} />
          <circle r={R * (1 + chegou * 0.4)} fill="none" stroke={rgba(tema.acento, 0.6 * (1 - chegou))} strokeWidth={4 * u} />
        </g>
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} atraso={0.2} estilo={{ marginBottom: 18 * u }} /> : null}
        {p.antes ? <div style={{ ...estiloDoTitulo(c, vertical ? 42 : 46), color: "rgba(230,236,245,.8)", marginBottom: 6 * u }}><TextoCinetico c={c} texto={texto(p.antes)} estilo={{}} inicio={0.25} varrer={false} /></div> : null}
        <div style={{ whiteSpace: "nowrap", transform: `scale(${1 + 0.06 * Math.sin(chegou * Math.PI)})` }}>
          <Contador c={c} id={`n${semente(c)}`} valor={valor} progresso={prog} velocidade={vel} decimais={dec} prefixo={texto(p.prefixo)} sufixo={texto(p.sufixo)} estilo={estiloDoNumero(c, tam)} />
        </div>
        {p.apoio ? (
          <div style={{ ...estiloDoTitulo(c, vertical ? 44 : 50), color: "#f2f6fb", marginTop: 14 * u, maxWidth: c.W * 0.8, textShadow: "0 4px 20px rgba(0,0,0,.6)" }}>
            <TextoCinetico c={c} texto={texto(p.apoio)} estilo={{}} inicio={ini + 0.9} />
          </div>
        ) : null}
        {p.fonte ? <div style={{ ...estiloDoApoio(c, 22), marginTop: 18 * u, color: "rgba(220,230,245,.6)" }}>Fonte: {texto(p.fonte)}</div> : null}
      </div>
    </Palco>
  );
}

/** GRÁFICO DE BARRAS: no vidro, sobre régua e linhas de grade; as barras crescem com mola e o valor conta junto. */
export function Barras(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const barras = lista<{ rotulo?: string; valor?: number; destaque?: boolean }>(p.barras).slice(0, 6);
  const n = Math.max(1, barras.length);
  const max = Math.max(1e-9, ...barras.map((b) => Math.abs(Number(b.valor) || 0)));
  const m = margens(c);
  const lado = texto(p.lado);
  const larg = vertical ? m.largura : lado ? 900 * u : 1300 * u;
  const altPainel = vertical ? 780 * u : 740 * u;
  const altBarra = altPainel - 320 * u;
  const unidade = texto(p.unidade);
  const dec = barras.some((b) => !Number.isInteger(Number(b.valor))) ? 1 : 0;
  const direita = lado === "direita";
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo : 140 * u, ...(vertical ? { left: m.x } : direita ? { right: m.x } : lado ? { left: m.x } : { left: (c.W - larg) / 2 }), width: larg, height: altPainel, ...entradaMola(c, 0, 30) }}>
      <Vidro c={c} estilo={{ width: "100%", height: "100%", padding: `${32 * u}px ${44 * u}px` }}>
        {p.titulo ? (
          <div style={{ ...estiloDoTitulo(c, vertical ? 48 : 52), color: corDoTexto(c) }}>
            <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.15} />
          </div>
        ) : null}
        <EtiquetaHud c={c} texto={unidade ? `valores em${unidade}` : "dado dito"} estilo={{ position: "absolute", right: 44 * u, top: 40 * u, fontSize: 15 * u }} />
        <div style={{ position: "absolute", left: 80 * u, right: 44 * u, bottom: 84 * u, height: altBarra }}>
          {/* grade */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <div key={f} style={{ position: "absolute", left: 0, right: 0, bottom: f * (altBarra - 70 * u), height: 1 * u, background: "rgba(255,255,255,.1)", transform: `scaleX(${saiSuave((c.t - 0.2) / 0.6)})`, transformOrigin: "left" }} />
          ))}
          <div style={{ position: "absolute", left: -30 * u, bottom: 0 }}>
            <Regua c={c} comprimento={altBarra - 70 * u} marcas={20} vertical progresso={(c.t - 0.2) / 0.6} />
          </div>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 26 * u }}>
            {barras.map((b, k) => {
              const q = progressoDoItem(c, k, 0.14);
              const s = molaFisica(q * 1.1, 140, 13);
              const v = Number(b.valor) || 0;
              const h = (Math.abs(v) / max) * (altBarra - 70 * u) * Math.max(0, s);
              const dest = Boolean(b.destaque);
              const { p: pc, vel } = contagem(q * 1.1, 1, v, dec);
              return (
                <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{ fontFamily: "Geist", fontWeight: 700, fontSize: (dest ? 44 : 34) * u, color: dest ? misturar(tema.acento, "#ffffff", 0.3) : corDoTexto(c), marginBottom: 10 * u, opacity: limitar(q * 3), textShadow: dest ? brilho(tema.acento, u, 0.5) : "none" }}>
                    <Contador c={c} id={`b${k}${semente(c)}`} valor={v} progresso={pc} velocidade={vel} decimais={dec} sufixo={unidade} estilo={{}} />
                  </div>
                  <div style={{ position: "relative", width: "100%", height: h, borderRadius: `${12 * u}px ${12 * u}px ${3 * u}px ${3 * u}px`, overflow: "hidden", background: dest ? `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.3)}, ${tema.acento} 40%, ${misturar(tema.acento, "#000000", 0.4)})` : "linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,.08))", boxShadow: dest ? `${brilho(tema.acento, u, 0.8)}, inset 0 ${2 * u}px 0 rgba(255,255,255,.5)` : "inset 0 1px 0 rgba(255,255,255,.3)" }}>
                    {dest ? <div style={{ position: "absolute", left: 0, right: 0, height: "30%", top: `${110 - limitar((c.t - 1) / 0.8) * 150}%`, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.5), transparent)" }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: -2 * u, height: 2 * u, background: "rgba(255,255,255,.5)" }} />
        </div>
        <div style={{ position: "absolute", left: 80 * u, right: 44 * u, bottom: 26 * u, display: "flex", gap: 26 * u }}>
          {barras.map((b, k) => (
            <div key={k} style={{ flex: 1, textAlign: "center", ...estiloDoApoio(c, n > 4 ? 22 : 26), color: b.destaque ? corDoTexto(c) : corFraca(c), fontWeight: b.destaque ? 600 : 400 }}>{texto(b.rotulo)}</div>
          ))}
        </div>
        {p.fonte ? <div style={{ position: "absolute", right: 44 * u, bottom: 4 * u, ...estiloDoApoio(c, 18) }}>Fonte: {texto(p.fonte)}</div> : null}
      </Vidro>
    </div>
  );
}

/**
 * GRÁFICO DE LINHA: no palco, os eixos de HUD; a linha se desenha passando
 * pelos valores ditos, com a área em degradê embaixo, e o ponto da ponta
 * pulsa com o valor contando ao lado. Cada ponto acende no seu evento.
 */
export function GraficoLinha(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const pts = lista<{ rotulo?: string; valor?: number }>(p.pontos).slice(0, 8);
  const n = Math.max(2, pts.length);
  const vals = pts.map((x) => Number(x.valor) || 0);
  const max = Math.max(1e-9, ...vals);
  const min = Math.min(0, ...vals);
  const m = margens(c);
  const comTitulo = Boolean(p.titulo);
  const x0 = m.x + 90 * u;
  const x1 = c.W - m.x - 60 * u;
  const y0 = (comTitulo ? m.topo + (vertical ? 260 : 220) * u : m.topo + 60 * u) + 30 * u;
  const y1 = vertical ? c.H * 0.68 : c.H - 190 * u;
  const prog = pts.map((_, k) => progressoDoItem(c, k, 0.35));
  let alvo = 0;
  prog.forEach((q, k) => q > 0 && (alvo = Math.max(alvo, k - 1 + saiSuave(Math.min(1, q * 1.3)))));
  alvo = Math.max(0, Math.min(n - 1, alvo));
  const P = pts.map((x, k) => ({ x: x0 + ((x1 - x0) * k) / (n - 1), y: y1 - ((vals[k] - min) / (max - min || 1)) * (y1 - y0) }));
  // A curva até o alvo (com a parte do segmento atual).
  const k0 = Math.floor(alvo);
  const fr = alvo - k0;
  const ate = P.slice(0, k0 + 1);
  if (k0 < n - 1 && fr > 0) ate.push({ x: P[k0].x + (P[k0 + 1].x - P[k0].x) * fr, y: P[k0].y + (P[k0 + 1].y - P[k0].y) * fr });
  const d = ate.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
  const ponta = ate[ate.length - 1];
  const area = ate.length > 1 ? `${d} L${ponta.x} ${y1} L${ate[0].x} ${y1} Z` : "";
  const valorPonta = vals[k0] + (k0 < n - 1 ? (vals[k0 + 1] - vals[k0]) * fr : 0);
  const unidade = texto(p.unidade);
  const dec = vals.some((v) => !Number.isInteger(v)) ? 1 : 0;
  const eixo = saiSuave((c.t - 0.2) / 0.6);
  return (
    <Palco c={c} semente={semente(c)}>
      {comTitulo ? (
        <div style={{ position: "absolute", left: m.x, top: m.topo, maxWidth: m.largura }}>
          {p.rotulo ? <SeloVivo c={c} texto={texto(p.rotulo)} atraso={0.2} estilo={{ marginBottom: 12 * u }} /> : null}
          <div style={{ ...estiloDoTitulo(c, vertical ? 60 : 68), color: "#f4f7fb", textShadow: "0 4px 22px rgba(0,0,0,.6)" }}>
            <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.3} />
          </div>
        </div>
      ) : null}
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`gl-area-${semente(c)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={tema.acento} stopOpacity={0.45} />
            <stop offset="1" stopColor={tema.acento} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* eixos e grade */}
        <line x1={x0} y1={y1} x2={x0 + (x1 - x0) * eixo} y2={y1} stroke="rgba(255,255,255,.6)" strokeWidth={2 * u} />
        <line x1={x0} y1={y1} x2={x0} y2={y1 - (y1 - y0) * eixo} stroke="rgba(255,255,255,.6)" strokeWidth={2 * u} />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={x0} y1={y1 - (y1 - y0) * f} x2={x0 + (x1 - x0) * eixo} y2={y1 - (y1 - y0) * f} stroke="rgba(255,255,255,.08)" strokeWidth={1 * u} strokeDasharray={`${6 * u} ${8 * u}`} />
        ))}
        {Array.from({ length: 41 }, (_, i) => (
          <line key={i} x1={x0 + ((x1 - x0) * i) / 40} y1={y1} x2={x0 + ((x1 - x0) * i) / 40} y2={y1 + (i % 5 ? 6 : 14) * u} stroke="rgba(255,255,255,.35)" strokeWidth={1 * u} opacity={eixo} />
        ))}
        {area ? <path d={area} fill={`url(#gl-area-${semente(c)})`} /> : null}
        {ate.length > 1 ? <path d={d} fill="none" stroke={tema.acento} strokeWidth={6 * u} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${10 * u}px ${tema.acento})` }} /> : null}
        {P.map((q, k) => {
          const s = molaFisica(prog[k] * 0.8, 260, 14);
          if (prog[k] <= 0) return null;
          return <circle key={k} cx={q.x} cy={q.y} r={10 * u * s} fill="#ffffff" stroke={tema.acento} strokeWidth={4 * u} />;
        })}
        {ponta ? <circle cx={ponta.x} cy={ponta.y} r={(18 + 8 * Math.sin(c.t * 6)) * u} fill={rgba(tema.acento, 0.25)} /> : null}
        {ponta ? <line x1={ponta.x} y1={ponta.y} x2={ponta.x} y2={y1} stroke={rgba(tema.acento, 0.6)} strokeWidth={1.5 * u} strokeDasharray={`${4 * u} ${6 * u}`} /> : null}
      </svg>
      {pts.map((x, k) => (
        <div key={k} style={{ position: "absolute", left: P[k].x - 120 * u, width: 240 * u, top: y1 + 22 * u, textAlign: "center", ...estiloDoApoio(c, vertical ? 24 : 26), color: prog[k] > 0.05 ? "#e8eef6" : "rgba(255,255,255,.3)" }}>{texto(x.rotulo)}</div>
      ))}
      {ponta ? (
        <div style={{ position: "absolute", left: ponta.x, top: ponta.y - 40 * u, transform: `translate(${ponta.x > c.W * 0.7 ? "-110%" : "20%"}, -100%)` }}>
          <Vidro c={c} forte raio={14} estilo={{ padding: `${8 * u}px ${18 * u}px`, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: "Geist", fontWeight: 700, fontSize: 40 * u, fontVariantNumeric: "tabular-nums" }}>{formatar(valorPonta, dec)}{unidade}</span>
          </Vidro>
        </div>
      ) : null}
    </Palco>
  );
}

/** CIFRÃO FUTURISTA: no palco, os anéis de luz, a grade e o símbolo em metal com brilho; o valor dito embaixo. */
export function Cifrao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const simbolo = texto(p.simbolo, "R$");
  const e = saiSuave((c.t - 0.3) / 0.8);
  const pop = molaFisica(c.t - 0.4, 180, 12);
  const giro = c.t * 25;
  const tam = vertical ? 620 * u : 580 * u;
  const cx = c.W / 2;
  const cy = vertical ? c.H * 0.32 : c.H * 0.44;
  const claro = misturar(tema.acento, "#ffffff", 0.6);
  return (
    <Palco c={c} semente={semente(c)}>
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
        <circle cx={cx} cy={cy} r={tam * 0.7 * e} fill="url(#cif-brilho)" />
        {[0.52, 0.44, 0.36].map((r, i) => (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${(i % 2 ? -1 : 1) * giro + i * 30})`}>
            <circle r={tam * r * (0.7 + 0.3 * e)} fill="none" stroke={rgba(tema.acento, 0.8 - i * 0.18)} strokeWidth={(3.4 - i * 0.6) * u} strokeDasharray={`${tam * r * 0.9} ${tam * r * 0.35}`} strokeLinecap="round" opacity={e} style={{ filter: `drop-shadow(0 0 ${6 * u}px ${tema.acento})` }} />
          </g>
        ))}
        {Array.from({ length: 24 }, (_, i) => {
          const ang = (i / 24) * Math.PI * 2 + c.t * 0.4;
          const r = tam * (0.46 + acaso(i, 3) * 0.2);
          return <circle key={i} cx={cx + Math.cos(ang) * r * e} cy={cy + Math.sin(ang) * r * 0.9 * e} r={(2 + acaso(i, 5) * 4) * u} fill={i % 3 ? claro : tema.acento} opacity={0.8 * e} />;
        })}
        <g transform={`translate(${cx} ${cy}) scale(${0.3 + 0.7 * pop})`} opacity={limitar((c.t - 0.35) / 0.2)}>
          <text x={0} y={tam * 0.13} textAnchor="middle" fontFamily="Geist" fontWeight={700} fontSize={(simbolo.length > 1 ? 0.36 : 0.5) * tam} fill="url(#cif-metal)" stroke={rgba("#ffffff", 0.5)} strokeWidth={1.5 * u} style={{ filter: `drop-shadow(0 0 ${28 * u}px ${rgba(tema.acento, 0.85)})` }}>
            {simbolo}
          </text>
        </g>
      </svg>
      {p.valor || p.rotulo ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: cy + tam * 0.5, display: "flex", flexDirection: "column", alignItems: "center", opacity: saiSuave((c.t - 0.8) / 0.5) }}>
          {p.valor ? (
            <Vidro c={c} estilo={{ padding: `${14 * u}px ${36 * u}px` }}>
              <span style={estiloDoNumero(c, vertical ? 92 : 86)}>{texto(p.valor)}</span>
            </Vidro>
          ) : null}
          {p.rotulo ? <div style={{ ...estiloDoTitulo(c, 42), color: "#ffffff", marginTop: 16 * u, textShadow: "0 2px 14px rgba(0,0,0,.8)" }}><TextoCinetico c={c} texto={texto(p.rotulo)} estilo={{}} inicio={1} varrer={false} /></div> : null}
        </div>
      ) : null}
    </Palco>
  );
}

/** MEDIDOR: o anel de luz enche até a porcentagem dita, com as marcações de HUD e o contador de rolo no meio. */
export function Progresso(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const valor = Number(p.valor) || 0;
  const alvo = limitar(valor / 100);
  const { p: prog, vel } = contagem(c.t - 0.35, 1.1, valor, 0);
  const r = (vertical ? 200 : 190) * u;
  const L = r * 2 + 80 * u;
  const circ = 2 * Math.PI * r;
  const m = margens(c);
  const direita = texto(p.lado) !== "esquerda";
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo + 30 * u : c.H * 0.16, ...(vertical ? { left: 0, right: 0, display: "flex", justifyContent: "center" } : direita ? { right: m.x + 40 * u } : { left: m.x + 40 * u }), ...entradaMola(c, 0, 30) }}>
      <Vidro c={c} estilo={{ padding: `${36 * u}px`, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u }}>
        <div style={{ position: "relative", width: L, height: L }}>
          <svg width={L} height={L} style={{ overflow: "visible" }}>
            <g transform={`translate(${L / 2} ${L / 2})`}>
              {Array.from({ length: 60 }, (_, i) => {
                const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
                const aceso = i / 60 <= alvo * prog;
                const R1 = r + 30 * u;
                const R2 = R1 + (i % 5 ? 8 : 16) * u;
                return <line key={i} x1={Math.cos(a) * R1} y1={Math.sin(a) * R1} x2={Math.cos(a) * R2} y2={Math.sin(a) * R2} stroke={aceso ? tema.acento : "rgba(255,255,255,.22)"} strokeWidth={2 * u} />;
              })}
              <circle r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={28 * u} />
              <circle r={r} fill="none" stroke={tema.acento} strokeWidth={28 * u} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - alvo * prog)} transform="rotate(-90)" style={{ filter: `drop-shadow(0 0 ${16 * u}px ${rgba(tema.acento, 0.8)})` }} />
              {prog > 0 ? (() => {
                const a = alvo * prog * Math.PI * 2 - Math.PI / 2;
                return <circle cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={10 * u} fill="#ffffff" style={{ filter: `drop-shadow(0 0 ${10 * u}px #ffffff)` }} />;
              })() : null}
            </g>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Contador c={c} id={`p${semente(c)}`} valor={valor} progresso={prog} velocidade={vel} sufixo={texto(p.sufixo, "%")} estilo={estiloDoNumero(c, vertical ? 120 : 112)} />
          </div>
        </div>
        {p.rotulo ? (
          <div style={{ ...estiloDoTitulo(c, 40), color: corDoTexto(c), maxWidth: L + 40 * u, textAlign: "center" }}>
            <TextoCinetico c={c} texto={texto(p.rotulo)} estilo={{}} inicio={0.5} varrer={false} />
          </div>
        ) : null}
      </Vidro>
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

/** MAPA: no palco, a terra em pontos de luz, os pinos que caem com o pulso e a rota com o cometa. */
export function Mapa(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const pontos = lista<{ rotulo?: string; x?: number; y?: number }>(p.pontos).slice(0, 6);
  const m = margens(c);
  const w = vertical ? m.largura : 1500 * u;
  const h = vertical ? 900 * u : 760 * u;
  const x0 = vertical ? m.x : (c.W - w) / 2;
  const y0 = vertical ? m.topo + (p.titulo ? 180 * u : 0) : 150 * u;
  const terra = pontosDoMapa(w, h, 20 * u);
  const prog = pontos.map((_, k) => progressoDoItem(c, k, 0.45));
  const pos = (q: { x?: number; y?: number }) => [limitar(Number(q.x) || 0.5, 0.05, 0.95) * w, limitar(Number(q.y) || 0.5, 0.08, 0.92) * h] as const;
  const revela = saiSuave((c.t - 0.2) / 0.9);
  return (
    <Palco c={c} semente={semente(c)}>
      {p.titulo ? (
        <div style={{ position: "absolute", left: m.x, top: m.topo }}>
          <div style={{ ...estiloDoTitulo(c, vertical ? 58 : 62), color: "#f4f7fb", textShadow: "0 4px 22px rgba(0,0,0,.6)" }}>
            <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.3} />
          </div>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: x0, top: y0, width: w, height: h }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {terra.map(([x, y], i) => {
            const d = Math.hypot(x / w - 0.5, y / h - 0.5);
            return <circle key={i} cx={x} cy={y} r={3 * u} fill={tema.visual === "documental" ? "rgba(240,220,180,.45)" : "rgba(150,190,235,.42)"} opacity={limitar((revela - d) * 3)} />;
          })}
          {pontos.map((q, k) => {
            if (k === 0 || p.rota === false) return null;
            const [ax, ay] = pos(pontos[k - 1]);
            const [bx, by] = pos(q);
            const mx = (ax + bx) / 2;
            const my = Math.min(ay, by) - Math.abs(bx - ax) * 0.3;
            const d = `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`;
            const comp = Math.hypot(bx - ax, by - ay) * 1.3;
            const e = saiSuave(prog[k] * 1.4);
            const tt = e;
            const cxq = (1 - tt) * (1 - tt) * ax + 2 * (1 - tt) * tt * mx + tt * tt * bx;
            const cyq = (1 - tt) * (1 - tt) * ay + 2 * (1 - tt) * tt * my + tt * tt * by;
            return (
              <g key={`r${k}`}>
                <path d={d} fill="none" stroke={tema.acento} strokeWidth={5 * u} strokeDasharray={`${comp}`} strokeDashoffset={comp * (1 - e)} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${8 * u}px ${tema.acento})` }} />
                {e > 0 && e < 1 ? <circle cx={cxq} cy={cyq} r={10 * u} fill="#ffffff" style={{ filter: `drop-shadow(0 0 ${14 * u}px ${tema.acento})` }} /> : null}
              </g>
            );
          })}
        </svg>
        {pontos.map((q, k) => {
          const [x, y] = pos(q);
          const e = molaFisica(prog[k] * 0.8, 240, 13);
          const onda = (c.t * 0.9 + k * 0.3) % 1;
          return (
            <div key={k} style={{ position: "absolute", left: x, top: y, opacity: limitar(prog[k] * 3) }}>
              <div style={{ position: "absolute", left: -40 * u, top: -16 * u, width: 80 * u, height: 32 * u, borderRadius: "50%", border: `${2 * u}px solid ${rgba(tema.acento, 0.7 * (1 - onda))}`, transform: `scale(${0.5 + onda})` }} />
              <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(-50%, -100%) translateY(${(1 - e) * -60 * u}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Vidro c={c} forte raio={12} estilo={{ padding: `${8 * u}px ${18 * u}px`, marginBottom: 8 * u, whiteSpace: "nowrap", fontFamily: c.tema.fonteTexto, fontWeight: 600, fontSize: 30 * u }}>{texto(q.rotulo)}</Vidro>
                <svg width={34 * u} height={44 * u} viewBox="0 0 34 44" style={{ filter: `drop-shadow(0 0 ${10 * u}px ${tema.acento})` }}>
                  <path d="M17 43 C17 43 2 26 2 16 A15 15 0 0 1 32 16 C32 26 17 43 17 43 Z" fill={tema.acento} stroke="#ffffff" strokeWidth={2} />
                  <circle cx={17} cy={16} r={5.5} fill="#ffffff" />
                </svg>
              </div>
            </div>
          );
        })}
        <Cantoneiras c={c} w={w} h={h} abre={(c.t - 0.2) / 0.5} cor="rgba(255,255,255,.35)" />
      </div>
      {p.apoio ? <div style={{ position: "absolute", left: x0, top: y0 + h + 20 * u, ...estiloDoApoio(c, 26), color: "rgba(220,230,245,.7)" }}>{texto(p.apoio)}</div> : null}
    </Palco>
  );
}
