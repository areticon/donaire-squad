import React from "react";
import { escuroDoTema, limitar, misturar, mola, rgba, saiSuave, sobreOAcento, type Ctx } from "./base";

/**
 * O ACABAMENTO DO EDITOR SOB MEDIDA (03/10/2026, segunda volta). O dono viu
 * o vídeo de 20 min e os cortes: "parece um PPT feito pela primeira vez". As
 * peças eram cartões chapados com texto. Este kit é o que faltava entre a
 * peça e o motion design de verdade, e toda peça usa as mesmas partes:
 *
 *   - VIDRO de verdade: a caixa marcada com `data-vidro` vira, numa passada
 *     à parte do Remotion, a máscara que o ffmpeg usa para desfocar a gravação
 *     que está ATRÁS dela (worker/src/edicao-sob-medida.mjs). No palco (a tela
 *     cheia desenhada aqui) o próprio Chrome desfoca com backdrop-filter.
 *   - PROFUNDIDADE: o que leva `data-atras` é desenhado numa passada que vai
 *     por BAIXO da pessoa recortada da gravação (o título grande atrás dela).
 *   - PALCO: o fundo vivo das telas cheias, com câmera virtual (empurrão e
 *     deriva), camadas em paralaxe, linhas topográficas, grade em perspectiva,
 *     poeira de luz e a entrada como transição (íris, luz, zoom).
 *   - TIPOGRAFIA CINÉTICA: palavra a palavra com mola e máscara, o destaque
 *     que se desenha e brilha, e a varredura de luz depois que o texto assenta.
 *   - CONTADOR de rolo com desfoque de movimento, e o HUD de linhas finas.
 */

// ─────────────────────────────── luz ───────────────────────────────

/** Brilho (glow) em volta de texto ou traço da marca. */
export const brilho = (cor: string, u: number, forca = 1) =>
  `0 0 ${6 * u * forca}px ${rgba(cor, 0.75)}, 0 0 ${22 * u * forca}px ${rgba(cor, 0.45)}, 0 0 ${60 * u * forca}px ${rgba(cor, 0.25)}`;

/** Sombra em camadas (contato, meio e ambiente): o que dá peso a uma caixa. */
export const sombraFunda = (u: number, k = 1) =>
  `0 ${2 * u}px ${4 * u}px rgba(0,0,0,${0.22 * k}), 0 ${12 * u}px ${24 * u}px rgba(0,0,0,${0.28 * k}), 0 ${36 * u}px ${90 * u}px rgba(0,0,0,${0.42 * k})`;

/** Número pseudoaleatório estável (o mesmo quadro desenha sempre igual). */
export const acaso = (i: number, s = 1) => {
  const x = Math.sin(i * 127.1 * s + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Mola de verdade (massa, rigidez, amortecimento) no tempo t (s): 0 a 1 com o passo além. */
export function molaFisica(t: number, rigidez = 170, amortece = 15): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(rigidez);
  const z = amortece / (2 * w0);
  if (z >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
}

// ─────────────────────────────── vidro ───────────────────────────────

/**
 * A caixa do acabamento. `data-vidro` marca a área que a gravação atrás
 * desfoca. Vidro: vidro escuro fosco com o fio de luz em cima. Impacto: o
 * bloco preto fosco com a barra da marca (nada de cartão branco chapado).
 * Documental: papel com fibra, luz de mesa e sombra de verdade.
 */
export function Vidro({ c, children, estilo, forte = false, raio, semVidro = false }: { c: Ctx; children?: React.ReactNode; estilo?: React.CSSProperties; forte?: boolean; raio?: number; semVidro?: boolean }) {
  const { tema, u } = c;
  const r = (raio ?? (tema.visual === "documental" ? 8 : tema.visual === "impacto" ? 16 : 28)) * u;
  let st: React.CSSProperties;
  if (tema.visual === "documental") {
    st = {
      background: `radial-gradient(ellipse at 30% 0%, #fffaf0, #f3e9d6 70%, #e9dcc2), ${PAPEL}`,
      backgroundBlendMode: "multiply",
      color: "#1b1a17",
      border: `${1 * u}px solid rgba(80,60,30,.18)`,
      boxShadow: `inset 0 0 ${40 * u}px rgba(140,100,40,.12), ${sombraFunda(u, 1.1)}`,
    };
  } else if (tema.visual === "impacto") {
    st = forte
      ? {
          background: `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.18)}, ${tema.acento} 55%, ${misturar(tema.acento, "#000000", 0.25)})`,
          color: sobreOAcento(tema),
          boxShadow: `inset 0 ${2 * u}px 0 rgba(255,255,255,.35), ${sombraFunda(u)}, 0 0 ${50 * u}px ${rgba(tema.acento, 0.35)}`,
        }
      : {
          background: `linear-gradient(180deg, rgba(28,30,36,.78), rgba(8,9,12,.86))`,
          color: "#ffffff",
          borderTop: `${5 * u}px solid ${tema.acento}`,
          boxShadow: `inset 0 ${1 * u}px 0 rgba(255,255,255,.12), ${sombraFunda(u)}, 0 ${-6 * u}px ${30 * u}px ${rgba(tema.acento, 0.25)}`,
        };
  } else {
    const esc = escuroDoTema(tema);
    st = {
      background: forte
        ? `linear-gradient(150deg, ${rgba(misturar(tema.acento, "#ffffff", 0.2), 0.95)}, ${rgba(misturar(tema.acento, "#000000", 0.3), 0.95)})`
        : `linear-gradient(155deg, rgba(255,255,255,.17), rgba(255,255,255,.05) 38%, ${rgba(esc, 0.3)} 100%), ${rgba(esc, 0.42)}`,
      color: forte ? sobreOAcento(tema) : "#f2f6fb",
      border: `${1.2 * u}px solid rgba(255,255,255,.17)`,
      boxShadow: `inset 0 ${1.5 * u}px 0 rgba(255,255,255,.28), inset 0 ${-1 * u}px 0 rgba(0,0,0,.3), ${sombraFunda(u)}, 0 0 ${70 * u}px ${rgba(tema.acento, forte ? 0.4 : 0.1)}`,
      backdropFilter: `blur(${22 * u}px) saturate(150%)`,
    };
  }
  return (
    <div data-vidro={semVidro ? undefined : "1"} style={{ position: "relative", borderRadius: r, ...st, ...estilo }}>
      {tema.visual === "vidro" && !forte ? (
        // O reflexo de cima: a luz batendo na borda do vidro.
        <div style={{ position: "absolute", left: r * 0.6, right: r * 0.6, top: 0, height: 1.5 * u, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)", pointerEvents: "none" }} />
      ) : null}
      {children}
    </div>
  );
}

/** A fibra do papel (documental), em SVG embutido: ruído fractal fraco. */
const PAPEL = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .45 0 0 0 0 .35 0 0 0 0 .2 0 0 0 .22 0'/></filter><rect width='240' height='240' filter='url(#n)'/></svg>`
)}")`;

// ─────────────────────────────── tipografia cinética ───────────────────────────────

type Pedaco = { palavra: string; destaque: boolean; grupo: number };

function pedacos(textoCru: string): Pedaco[] {
  const saida: Pedaco[] = [];
  String(textoCru ?? "")
    .split(/\*\*(.+?)\*\*/g)
    .forEach((trecho, i) => {
      for (const p of trecho.split(/\s+/).filter(Boolean)) {
        // Pontuação solta (", e não" depois do destaque) gruda na palavra anterior.
        if (/^[,.;:!?)]+$/.test(p) && saida.length) saida[saida.length - 1].palavra += p;
        else if (/^[,.;:!?)]/.test(p) && saida.length && i % 2 === 0 && saida[saida.length - 1].destaque) {
          const m = p.match(/^[,.;:!?)]+/)![0];
          saida[saida.length - 1].palavra += m;
          if (p.slice(m.length)) saida.push({ palavra: p.slice(m.length), destaque: false, grupo: i });
        } else saida.push({ palavra: p, destaque: i % 2 === 1, grupo: i });
      }
    });
  return saida;
}

/**
 * TEXTO CINÉTICO: cada palavra sobe de dentro da própria máscara com mola,
 * uma depois da outra; o trecho em **destaque** chega na cor da marca, com
 * brilho, e o traço embaixo dele se desenha quando ele assenta; depois uma
 * faixa de luz atravessa o texto (a varredura). `t` é o tempo da peça (s) e
 * `inicio` o instante em que a primeira palavra começa.
 */
export function TextoCinetico({
  c,
  texto: textoCru,
  estilo,
  inicio = 0,
  atraso = 0.06,
  varrer = true,
  corDestaque,
  semTraco = false,
  modo = "subir",
}: {
  c: Ctx;
  texto: string;
  estilo: React.CSSProperties;
  inicio?: number;
  atraso?: number;
  varrer?: boolean;
  corDestaque?: string;
  semTraco?: boolean;
  modo?: "subir" | "estourar";
}) {
  const { tema, u } = c;
  const ps = pedacos(textoCru);
  const doc = tema.visual === "documental";
  const imp = tema.visual === "impacto";
  const acento = corDestaque ?? (doc ? misturar(tema.acento, "#000000", 0.25) : tema.acento);
  const claro = misturar(acento, "#ffffff", doc ? 0.1 : 0.5);
  const fimDasPalavras = inicio + ps.length * atraso + 0.45;
  const grupos = new Map<number, Pedaco[]>();
  ps.forEach((p) => {
    const g = grupos.get(p.grupo) ?? [];
    g.push(p);
    grupos.set(p.grupo, g);
  });
  let indice = 0;
  const palavra = (p: Pedaco, k: number) => {
    const t = c.t - inicio - k * atraso;
    const s = modo === "estourar" ? molaFisica(t, 260, 16) : molaFisica(t, 190, 19);
    const op = limitar(t / 0.12);
    const brilhoT = c.t - fimDasPalavras - k * 0.05;
    const varre = varrer && brilhoT > -0.05 && brilhoT < 0.6 ? saiSuave(brilhoT / 0.55) : brilhoT >= 0.6 ? 1 : 0;
    const corBase: React.CSSProperties = p.destaque
      ? imp
        ? { color: sobreOAcento(tema) }
        : doc
        ? { color: acento, fontStyle: tema.fonteTitulo === "Playfair Display" ? "italic" : "normal" }
        : { background: `linear-gradient(100deg, ${claro}, ${acento})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: `drop-shadow(0 0 ${10 * u}px ${rgba(acento, 0.55)})` }
      : {};
    const transf = modo === "estourar" ? `scale(${0.4 + 0.6 * s}) translateY(${(1 - s) * 30}%)` : `translateY(${(1 - s) * 105}%) rotate(${(1 - s) * 5}deg)`;
    return (
      <span key={k} style={{ display: "inline-block", position: "relative", overflow: modo === "estourar" ? "visible" : "hidden", verticalAlign: "top", padding: "0.06em 0.04em 0.14em", margin: "-0.06em -0.04em -0.14em" }}>
        <span style={{ display: "inline-block", transform: transf, transformOrigin: "50% 90%", opacity: op, ...corBase }}>{p.palavra}</span>
        {varre > 0 && varre < 1 ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "0.04em",
              top: "0.06em",
              display: "inline-block",
              color: "transparent",
              backgroundImage: "linear-gradient(100deg, transparent 0%, transparent 38%, rgba(255,255,255,.95) 50%, transparent 62%, transparent 100%)",
              backgroundSize: "300% 100%",
              backgroundPosition: `${100 - varre * 100}% 0`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              transform: transf,
              transformOrigin: "50% 90%",
            }}
          >
            {p.palavra}
          </span>
        ) : null}
      </span>
    );
  };
  return (
    <span style={{ ...estilo }}>
      {[...grupos.entries()].map(([g, lista], gi) => {
        const nodos = lista.map((p) => {
          const k = indice++;
          return (
            <React.Fragment key={k}>
              {palavra(p, k)}
              {" "}
            </React.Fragment>
          );
        });
        if (!lista[0].destaque) return <React.Fragment key={g}>{nodos}</React.Fragment>;
        // O traço do destaque: corre embaixo do trecho quando ele assenta.
        const kFim = indice - 1;
        const traco = saiSuave((c.t - inicio - kFim * atraso - 0.3) / 0.4);
        return (
          <span key={g} style={{ position: "relative", display: "inline", whiteSpace: "normal" }}>
            {imp ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: "-0.1em",
                  right: "0.12em",
                  top: "0.02em",
                  bottom: "-0.02em",
                  background: `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.15)}, ${tema.acento})`,
                  borderRadius: 8 * u,
                  transform: `scaleX(${saiSuave((c.t - inicio - (kFim - lista.length + 1) * atraso) / 0.35)})`,
                  transformOrigin: "left",
                  boxShadow: `0 0 ${30 * u}px ${rgba(tema.acento, 0.5)}`,
                  zIndex: -1,
                }}
              />
            ) : null}
            {nodos}
            {!imp && !semTraco ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: "0.28em",
                  bottom: doc ? "0.02em" : "-0.04em",
                  height: doc ? "0.32em" : Math.max(3, 5 * u),
                  borderRadius: 4 * u,
                  background: doc ? rgba(tema.acento, 0.32) : `linear-gradient(90deg, ${rgba(acento, 0.1)}, ${acento})`,
                  boxShadow: doc ? "none" : brilho(acento, u, 0.6),
                  transform: `scaleX(${traco})`,
                  transformOrigin: "left",
                  zIndex: doc ? -1 : 0,
                }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** Quanto tempo o texto cinético leva para assentar e varrer (para a ficha da peça). */
export const tempoDoTexto = (textoCru: string, atraso = 0.06) => pedacos(textoCru).length * atraso + 0.45 + 0.7;

// ─────────────────────────────── contador de rolo ───────────────────────────────

/**
 * O CONTADOR de rolo: cada dígito é uma fita que gira até o valor, com
 * desfoque de movimento proporcional à velocidade (o filtro do SVG, só no
 * eixo do giro). Separadores ficam parados; o prefixo e o sufixo entram junto.
 */
export function Contador({ c, valor, progresso, velocidade, decimais = 0, prefixo = "", sufixo = "", estilo, id }: { c: Ctx; valor: number; progresso: number; velocidade: number; decimais?: number; prefixo?: string; sufixo?: string; estilo: React.CSSProperties; id: string }) {
  const alvo = Math.round(Math.abs(valor) * 10 ** decimais);
  const atual = Math.abs(valor) * progresso * 10 ** decimais;
  const final = (alvo / 10 ** decimais).toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
  const blur = Math.min(14, velocidade * 0.9);
  const filtro = `cont-${id.replace(/[^a-z0-9]/gi, "")}`;
  // Os dígitos da direita para a esquerda: a casa k gira (atual / 10^k) mod 10.
  let casa = 0;
  const chars = final.split("").reverse().map((ch) => {
    if (!/\d/.test(ch)) return { ch, casa: -1 };
    return { ch, casa: casa++ };
  });
  const totalCasas = casa;
  // O degradê e o brilho vão em CADA glifo: com background-clip no pai, os
  // dígitos dentro das fitas (transformados) não pintam (galeria de 03/10).
  const { fontFamily, fontWeight, fontSize, lineHeight, letterSpacing, ...pintura } = estilo;
  const caixa: React.CSSProperties = { fontFamily, fontWeight, fontSize, lineHeight, letterSpacing };
  const g = (k: React.Key, conteudo: React.ReactNode, extra?: React.CSSProperties) => (
    <span key={k} style={{ display: "inline-block", ...pintura, ...extra }}>{conteudo}</span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", ...caixa, fontVariantNumeric: "tabular-nums" }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={filtro}>
          <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
        </filter>
      </svg>
      {prefixo ? g("pre", prefixo) : null}
      {chars
        .reverse()
        .map((x, i) => {
          if (x.casa < 0) return g(i, x.ch);
          const pos = atual / 10 ** x.casa;
          const d = pos % 10;
          // A casa de cima some enquanto o número ainda não chegou nela (sem zero à esquerda).
          const visivel = x.casa === 0 || x.casa < decimais + 1 || pos >= 1 || progresso >= 1 ? 1 : limitar(pos);
          const desce = x.casa === totalCasas - 1 && totalCasas > 1 ? 1 : 1;
          void desce;
          return (
            <span key={i} style={{ display: "inline-block", height: "1em", lineHeight: 1, overflow: "hidden", position: "relative", opacity: visivel }}>
              <span style={{ display: "inline-block", visibility: "hidden" }}>0</span>
              <span style={{ position: "absolute", left: 0, top: 0, display: "flex", flexDirection: "column", transform: `translateY(${-(progresso >= 1 ? Number(x.ch) : d)}em)`, filter: blur > 0.3 && progresso < 1 ? `url(#${filtro})` : "none" }}>
                {Array.from({ length: 11 }, (_, k) => (
                  g(k, k % 10, { height: "1em", lineHeight: 1 })
                ))}
              </span>
            </span>
          );
        })}
      {sufixo ? g("suf", sufixo) : null}
    </span>
  );
}

/** O progresso de uma contagem (suave) e a velocidade (dígitos por quadro, para o desfoque). */
export function contagem(t: number, dur: number, valor: number, decimais = 0) {
  const p = saiSuave(t / Math.max(0.2, dur));
  const p2 = saiSuave((t + 1 / 30) / Math.max(0.2, dur));
  const vel = Math.abs((p2 - p) * valor * 10 ** decimais);
  return { p, vel: Math.min(30, vel) };
}

// ─────────────────────────────── HUD ───────────────────────────────

/** Cantoneiras finas em volta de uma área (a moldura de mira). */
export function Cantoneiras({ c, w, h, cor, abre = 1, tam = 34 }: { c: Ctx; w: number; h: number; cor?: string; abre?: number; tam?: number }) {
  const { u, tema } = c;
  const k = tam * u;
  const cr = cor ?? rgba(tema.acento, 0.9);
  const d = (1 - saiSuave(abre)) * 30 * u;
  const lado = (x: number, y: number, sx: number, sy: number) => (
    <path d={`M${x} ${y + sy * k} L${x} ${y} L${x + sx * k} ${y}`} fill="none" stroke={cr} strokeWidth={2.5 * u} strokeLinecap="round" transform={`translate(${-sx * d} ${-sy * d})`} />
  );
  return (
    <svg width={w + 80 * u} height={h + 80 * u} style={{ position: "absolute", left: -40 * u, top: -40 * u, overflow: "visible", opacity: limitar(abre * 2), filter: `drop-shadow(0 0 ${6 * u}px ${rgba(tema.acento, 0.6)})` }}>
      <g transform={`translate(${40 * u} ${40 * u})`}>
        {lado(0, 0, 1, 1)}
        {lado(w, 0, -1, 1)}
        {lado(0, h, 1, -1)}
        {lado(w, h, -1, -1)}
      </g>
    </svg>
  );
}

/** A régua fina com marcações (eixo de HUD). */
export function Regua({ c, comprimento, marcas = 20, vertical = false, progresso = 1, cor }: { c: Ctx; comprimento: number; marcas?: number; vertical?: boolean; progresso?: number; cor?: string }) {
  const { u } = c;
  const cr = cor ?? "rgba(255,255,255,.35)";
  const L = comprimento * saiSuave(progresso);
  return (
    <svg width={vertical ? 20 * u : comprimento} height={vertical ? comprimento : 20 * u} style={{ overflow: "visible", display: "block" }}>
      {vertical ? <line x1={10 * u} y1={comprimento} x2={10 * u} y2={comprimento - L} stroke={cr} strokeWidth={1.2 * u} /> : <line x1={0} y1={10 * u} x2={L} y2={10 * u} stroke={cr} strokeWidth={1.2 * u} />}
      {Array.from({ length: marcas + 1 }, (_, i) => {
        const f = i / marcas;
        if (f * comprimento > L + 0.5) return null;
        const grande = i % 5 === 0;
        const m = (grande ? 10 : 5) * u;
        return vertical ? (
          <line key={i} x1={10 * u - m} y1={comprimento - f * comprimento} x2={10 * u} y2={comprimento - f * comprimento} stroke={cr} strokeWidth={1 * u} />
        ) : (
          <line key={i} x1={f * comprimento} y1={10 * u - m} x2={f * comprimento} y2={10 * u} stroke={cr} strokeWidth={1 * u} />
        );
      })}
    </svg>
  );
}

/** Etiqueta de HUD em mono ("01 / 03", "DADO DITO"). */
export function EtiquetaHud({ c, texto, estilo }: { c: Ctx; texto: string; estilo?: React.CSSProperties }) {
  const { u, tema } = c;
  return (
    <div style={{ fontFamily: tema.fonteMono, fontSize: 18 * u, letterSpacing: "0.22em", textTransform: "uppercase", color: tema.visual === "documental" ? "rgba(255,240,220,.7)" : "rgba(220,232,245,.62)", display: "flex", alignItems: "center", gap: 10 * u, ...estilo }}>
      <span style={{ width: 8 * u, height: 8 * u, background: tema.acento, boxShadow: brilho(tema.acento, u, 0.5), display: "inline-block", transform: "rotate(45deg)" }} />
      {texto}
    </div>
  );
}

// ─────────────────────────────── o palco ───────────────────────────────

/** A câmera virtual do palco no instante: empurrão lento e deriva (s, dur). */
export function cameraDoPalco(t: number, dur: number, semente: number) {
  const p = limitar(t / Math.max(1, dur));
  const dir = acaso(semente) > 0.5 ? 1 : -1;
  return {
    escala: 1 + 0.07 * saiSuave(p) + 0.01 * Math.sin(t * 0.7),
    x: dir * (p - 0.5) * 40 + Math.sin(t * 0.45 + semente) * 8,
    y: Math.cos(t * 0.38 + semente) * 6 - p * 10,
    giro: dir * (p - 0.5) * 0.8,
  };
}

/** A entrada e a saída do palco como TRANSIÇÃO: íris de luz, cortina de luz ou zoom. */
function mascaraDoPalco(c: Ctx, tipo: number): { estilo: React.CSSProperties; borda: React.ReactNode } {
  const { u, tema, W, H } = c;
  const entra = saiSuave(c.t / 0.55);
  const sai = c.fica;
  if (tipo === 0) {
    // ÍRIS: o círculo abre do centro com um anel de luz na borda; fecha na saída.
    const r = Math.hypot(W, H) * 0.6 * Math.min(entra, saiSuave(sai * 1.2));
    const anel = entra < 1 || sai < 1 ? limitar(1 - Math.min(entra, sai) * 0.9) : 0;
    return {
      estilo: { clipPath: `circle(${r}px at 50% 50%)` },
      borda: anel > 0.02 ? <div style={{ position: "absolute", left: W / 2 - r, top: H / 2 - r, width: 2 * r, height: 2 * r, borderRadius: "50%", boxShadow: `0 0 0 ${3 * u}px ${rgba("#ffffff", 0.8 * anel)}, 0 0 ${40 * u}px ${12 * u}px ${rgba(tema.acento, 0.7 * anel)}`, pointerEvents: "none" }} /> : null,
    };
  }
  if (tipo === 1) {
    // CORTINA DE LUZ: uma faixa inclinada atravessa e deixa o palco atrás dela.
    const p = Math.min(entra, sai);
    const x = -0.25 * W + p * 1.5 * W;
    const ativa = entra < 1 || sai < 1;
    return {
      estilo: { clipPath: `polygon(0 0, ${x + 0.12 * W}px 0, ${x - 0.12 * W}px 100%, 0 100%)` },
      borda: ativa ? <div style={{ position: "absolute", left: x - 0.12 * W - 40 * u, top: -H * 0.1, width: 80 * u, height: H * 1.2, transform: `skewX(${-Math.atan2(0.24 * W, H)}rad)`, transformOrigin: "50% 50%", background: `linear-gradient(90deg, transparent, ${rgba("#ffffff", 0.9)}, ${rgba(tema.acento, 0.6)}, transparent)`, filter: `blur(${6 * u}px)`, pointerEvents: "none" }} /> : null,
    };
  }
  // ZOOM: o palco chega de longe (escala e opacidade) e vai embora passando pela câmera.
  const s = entra < 1 ? 0.6 + 0.4 * saiSuave(entra) : 1 + (1 - sai) * 0.5;
  return { estilo: { transform: `scale(${s})`, opacity: Math.min(limitar(entra * 1.6), sai) }, borda: null };
}

/**
 * O PALCO: o fundo vivo das peças de tela cheia, opaco (cobre a gravação
 * enquanto dura), com a câmera virtual e três profundidades em paralaxe. A
 * peça entrega o conteúdo em `children` (o plano do meio) e recebe a câmera.
 */
export function Palco({ c, children, semente = 1, transicao }: { c: Ctx; children?: React.ReactNode; semente?: number; transicao?: number }) {
  const { u, tema, W, H, t } = c;
  const cam = cameraDoPalco(t, c.dur, semente);
  const doc = tema.visual === "documental";
  const imp = tema.visual === "impacto";
  const esc = doc ? "#16130f" : imp ? "#070709" : escuroDoTema(tema);
  const acento = tema.acento;
  const tipo = transicao ?? Math.floor(acaso(semente, 3) * 3);
  const m = mascaraDoPalco(c, tipo);
  // As profundidades: o fundo anda menos que a câmera, a poeira da frente anda mais.
  const plano = (k: number): React.CSSProperties => ({ position: "absolute", inset: 0, transform: `translate(${cam.x * k * u}px, ${cam.y * k * u}px) scale(${1 + (cam.escala - 1) * k}) rotate(${cam.giro * k}deg)`, transformOrigin: "50% 45%" });
  const topo = Array.from({ length: 16 }, (_, i) => i);
  const poeira = Array.from({ length: 46 }, (_, i) => i);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...m.estilo }}>
      <div style={{ position: "absolute", inset: 0, background: esc }} />
      {/* LONGE: as manchas de luz que derivam (gradiente animado) e as linhas topográficas. */}
      <div style={plano(0.35)}>
        <div style={{ position: "absolute", inset: -200 * u, background: `radial-gradient(ellipse 55% 45% at ${30 + 10 * Math.sin(t * 0.3 + semente)}% ${25 + 8 * Math.cos(t * 0.25)}%, ${rgba(misturar(acento, esc, 0.2), doc ? 0.22 : 0.32)}, transparent 70%), radial-gradient(ellipse 50% 50% at ${78 + 8 * Math.cos(t * 0.27 + semente)}% ${72 + 6 * Math.sin(t * 0.31)}%, ${rgba(doc ? "#a87a3c" : "#2a5aa8", doc ? 0.22 : 0.3)}, transparent 70%)` }} />
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, opacity: doc ? 0.16 : 0.22 }}>
          {topo.map((i) => {
            const cx = W * (0.62 + 0.1 * acaso(semente + 7));
            const cy = H * (0.48 + 0.1 * acaso(semente + 9));
            const r0 = (60 + i * 58) * u;
            const pts: string[] = [];
            for (let a = 0; a <= 72; a++) {
              const ang = (a / 72) * Math.PI * 2;
              const w = 1 + 0.16 * Math.sin(ang * 3 + i * 0.6 + semente) + 0.08 * Math.sin(ang * 7 - i * 0.3) + 0.02 * Math.sin(t * 0.5 + i);
              pts.push(`${(cx + Math.cos(ang) * r0 * w * 1.25).toFixed(1)},${(cy + Math.sin(ang) * r0 * w * 0.85).toFixed(1)}`);
            }
            return <polygon key={i} points={pts.join(" ")} fill="none" stroke={i % 4 === 0 ? rgba(acento, 0.9) : "rgba(255,255,255,.7)"} strokeWidth={(i % 4 === 0 ? 1.4 : 0.9) * u} />;
          })}
        </svg>
      </div>
      {/* CHÃO: a grade em perspectiva que corre na direção da câmera (o HUD). */}
      {!doc ? (
        <div style={{ ...plano(0.6), perspective: 900 * u }}>
          <div
            style={{
              position: "absolute",
              left: -W * 0.5,
              width: W * 2,
              top: H * 0.62,
              height: H * 1.1,
              transform: "rotateX(72deg)",
              transformOrigin: "50% 0",
              backgroundImage: `linear-gradient(to right, ${rgba(acento, 0.35)} ${1.2 * u}px, transparent ${1.2 * u}px), linear-gradient(to bottom, ${rgba(acento, 0.35)} ${1.2 * u}px, transparent ${1.2 * u}px)`,
              backgroundSize: `${90 * u}px ${90 * u}px`,
              backgroundPosition: `0 ${(t * 40 * u) % (90 * u)}px`,
              maskImage: "linear-gradient(180deg, transparent, #000 35%, transparent 95%)",
              WebkitMaskImage: "linear-gradient(180deg, transparent, #000 35%, transparent 95%)",
              opacity: 0.55,
            }}
          />
        </div>
      ) : null}
      {/* RAIO DE LUZ de cima (volume) */}
      <div style={{ ...plano(0.5), background: `conic-gradient(from ${200 + 6 * Math.sin(t * 0.4)}deg at 20% -10%, transparent 0deg, ${rgba(misturar(acento, "#ffffff", 0.5), 0.08)} 18deg, transparent 34deg, ${rgba("#ffffff", 0.05)} 52deg, transparent 70deg)` }} />
      {/* MEIO: o conteúdo, com a câmera. */}
      <div style={plano(1)}>{children}</div>
      {/* PERTO: poeira de luz, maior e mais rápida (a profundidade). */}
      <div style={plano(1.8)}>
        {poeira.map((i) => {
          const z = acaso(i, 2);
          const x = (acaso(i, 5) * W + t * (8 + z * 26) * u) % W;
          const y = (acaso(i, 7) * H - t * (4 + z * 14) * u + H) % H;
          const s = (1.5 + z * 4.5) * u;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: i % 5 === 0 ? acento : "#ffffff", opacity: 0.12 + z * 0.35, boxShadow: z > 0.7 ? `0 0 ${8 * u}px ${rgba(i % 5 === 0 ? acento : "#ffffff", 0.6)}` : "none", filter: z > 0.85 ? `blur(${1.5 * u}px)` : "none" }} />;
        })}
      </div>
      {/* Vinheta do palco. */}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)`, pointerEvents: "none" }} />
      {m.borda}
    </div>
  );
}

// ─────────────────────────────── entradas ───────────────────────────────

/** A entrada de um bloco com mola e um pouco de profundidade (sobe, gira de leve e assenta). */
export function entradaMola(c: Ctx, atraso = 0, deslocamento = 40): React.CSSProperties {
  const { u, tema } = c;
  const s = molaFisica(c.t - atraso, tema.visual === "impacto" ? 240 : 170, tema.visual === "impacto" ? 14 : 18);
  const sai = c.fica;
  const z = (1 - s) * (tema.visual === "impacto" ? -0.18 : -0.06);
  return {
    opacity: limitar((c.t - atraso) / 0.14) * sai,
    transform: `perspective(${1400 * u}px) translateY(${(1 - s) * deslocamento * u + (1 - sai) * 12 * u}px) scale(${1 + z - (1 - sai) * 0.04}) rotateX(${(1 - s) * 12}deg)`,
    transformOrigin: "50% 100%",
  };
}

/** Item que entra no seu evento: mola, desfoque que some e um pulso de luz quando acende. */
export function itemAceso(q: number): { e: number; desfoque: number; pulso: number } {
  const e = mola(q);
  return { e, desfoque: (1 - limitar(q * 1.6)) * 8, pulso: q > 0 && q < 1 ? Math.sin(q * Math.PI) : 0 };
}
