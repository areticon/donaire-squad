import React from "react";
import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";
import { ICONES } from "./icones";
import type { ContextoDaPeca, Tema } from "./tipos";

/**
 * O kit visual das peças do editor sob medida (03/10/2026): o vidro, o
 * destaque em degradê, o selo em mono e o número no quadrado laranja do
 * vídeo de pitch, parametrizados pela marca do cliente e pelo acabamento do
 * estilo (vidro, impacto, documental). Toda peça é feita destas partes, para
 * o vídeo inteiro falar uma língua só.
 */

// ─────────────────────────────── fontes ───────────────────────────────

let carregadas = false;
export function carregarFontesDoTema(): void {
  if (carregadas || typeof document === "undefined") return;
  carregadas = true;
  const espera = delayRender("fontes do editor sob medida");
  Promise.all([
    loadFont({ family: "Geist", url: staticFile("Geist-Regular.ttf"), weight: "400" }),
    loadFont({ family: "Geist", url: staticFile("Geist-SemiBold.ttf"), weight: "600" }),
    loadFont({ family: "Geist", url: staticFile("Geist-Bold.ttf"), weight: "700" }),
    loadFont({ family: "Geist Mono", url: staticFile("GeistMono-Medium.ttf"), weight: "500" }),
    loadFont({ family: "Playfair Display", url: staticFile("PlayfairDisplay-Variable.ttf"), weight: "400 900" }),
    loadFont({ family: "Oswald", url: staticFile("Oswald-Variable.ttf"), weight: "200 700" }),
    loadFont({ family: "Archivo Black", url: staticFile("ArchivoBlack-Regular.ttf") }),
    loadFont({ family: "Anton", url: staticFile("Anton-Regular.ttf") }),
  ])
    .catch((e) => console.error("fonte do editor sob medida não carregou", e))
    .finally(() => continueRender(espera));
}

// ─────────────────────────────── números ───────────────────────────────

export const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Suave na saída (o "ease out" das entradas). */
export const saiSuave = (p: number) => 1 - Math.pow(1 - limitar(p), 3);
export const suave = (p: number) => {
  const x = limitar(p);
  return x * x * (3 - 2 * x);
};
/** Mola curta, com um leve passo além (o "pop"). */
export const mola = (p: number) => {
  const x = limitar(p);
  if (x >= 1) return 1;
  return 1 - Math.cos(x * Math.PI * 2.2) * Math.exp(-5.2 * x);
};

// ─────────────────────────────── cores ───────────────────────────────

export function rgb(hex: string): [number, number, number] {
  let h = String(hex || "#000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6).padEnd(6, "0"), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function misturar(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const m = x.map((v, i) => Math.round(v + (y[i] - v) * k));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
/**
 * O acento VIVO (03/10; terceira volta no mesmo dia): o mesmo matiz da marca,
 * com saturação de pelo menos 0,85 e luz entre 0,58 e 0,64, quando a cor da
 * marca está apagada (#6b94b3 vira #39a1ef). Vale para todo acabamento. O app
 * já manda o acento avivado (lib/media/editor-sob-medida/cor.ts, o ESPELHO
 * desta conta); aplicar de novo não muda nada.
 */
export function vivo(hex: string): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  const d = mx - mn;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const l0 = (mx + mn) / 2;
  const s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
  if (s0 < 0.08) return hex; // cinza é cinza: não inventa cor
  if (s0 >= 0.7 && l0 >= 0.5 && l0 <= 0.7) return hex; // já vivo
  const s = Math.min(1, Math.max(s0, 0.85));
  const l = Math.min(0.64, Math.max(l0, 0.58));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
export const luz = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
/** O fundo escuro das peças: o escuro da marca, puxado para o quase preto se for claro demais. */
export const escuroDoTema = (t: Tema) => (luz(t.escuro) > 0.35 ? "#0b1220" : misturar(t.escuro, "#05070c", 0.35));
export const sobreOAcento = (t: Tema) => (luz(t.acento) > 0.62 ? "#111318" : "#ffffff");

// ─────────────────────────────── o kit ───────────────────────────────

export type Ctx = ContextoDaPeca;

/** A caixa de vidro (ou o bloco, ou o papel), conforme o acabamento do estilo. */
export function estiloDoPainel(c: Ctx, forte = false): React.CSSProperties {
  const { tema, u } = c;
  if (tema.visual === "documental") {
    return {
      background: rgba(misturar(tema.claro, "#ffffff", 0.35), 0.97),
      color: "#1b1a17",
      border: `${1.5 * u}px solid ${rgba("#1b1a17", 0.12)}`,
      borderRadius: 6 * u,
      boxShadow: `0 ${18 * u}px ${46 * u}px rgba(0,0,0,.32)`,
    };
  }
  if (tema.visual === "impacto") {
    // Alta retenção (MrBeast, Hormozi): até 03/10 era o cartão BRANCO chapado;
    // na segunda volta virou o bloco preto fosco, com o acento em bloco.
    return {
      background: forte ? tema.acento : "linear-gradient(180deg, rgba(28,30,36,.82), rgba(8,9,12,.9))",
      color: forte ? sobreOAcento(tema) : "#ffffff",
      borderRadius: 12 * u,
      boxShadow: `0 ${16 * u}px ${40 * u}px rgba(0,0,0,.45)`,
    };
  }
  return {
    background: rgba(escuroDoTema(tema), 0.94),
    color: "#eef2f7",
    border: `${1 * u}px solid rgba(255,255,255,.12)`,
    borderRadius: 22 * u,
    boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,.45)`,
  };
}

// O impacto passou ao bloco preto fosco (03/10, segunda volta): letra branca, apoio cinza claro.
export const corDoTexto = (c: Ctx) => (c.tema.visual === "documental" ? "#1b1a17" : c.tema.visual === "impacto" ? "#ffffff" : "#eef2f7");
export const corFraca = (c: Ctx) => (c.tema.visual === "documental" ? "#5b5650" : c.tema.visual === "impacto" ? "#c4c9d2" : "#9fb0c6");

export function estiloDoTitulo(c: Ctx, tamanho: number): React.CSSProperties {
  const { tema, u } = c;
  return {
    fontFamily: tema.fonteTitulo,
    fontWeight: tema.pesoTitulo,
    fontSize: tamanho * u,
    lineHeight: tema.fonteTitulo === "Oswald" || tema.fonteTitulo === "Anton" ? 1.02 : 1.06,
    letterSpacing: tema.fonteTitulo === "Geist" ? "-0.025em" : tema.fonteTitulo === "Oswald" ? "0.005em" : "-0.01em",
    textTransform: tema.caixaAlta ? "uppercase" : "none",
  };
}

export function estiloDoApoio(c: Ctx, tamanho: number): React.CSSProperties {
  return { fontFamily: c.tema.fonteTexto, fontWeight: 400, fontSize: tamanho * c.u, lineHeight: 1.32, color: corFraca(c) };
}

/**
 * Texto com DESTAQUE: o trecho entre **asteriscos** sai no degradê da marca
 * (vidro), num bloco do acento (impacto) ou em itálico sublinhado (documental).
 */
export function ComDestaque({ c, texto }: { c: Ctx; texto: string }) {
  const partes = String(texto ?? "").split(/\*\*(.+?)\*\*/g);
  const claro = misturar(c.tema.acento, "#ffffff", 0.55);
  return (
    <>
      {partes.map((p, i) => {
        if (i % 2 === 0) return <React.Fragment key={i}>{p}</React.Fragment>;
        if (c.tema.visual === "impacto") {
          return (
            <span key={i} style={{ background: c.tema.acento, color: sobreOAcento(c.tema), padding: `0 ${0.14}em`, borderRadius: 6 * c.u, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
              {p}
            </span>
          );
        }
        if (c.tema.visual === "documental") {
          return (
            <span key={i} style={{ color: misturar(c.tema.acento, "#000000", 0.25), fontStyle: c.tema.fonteTitulo === "Playfair Display" ? "italic" : "normal", borderBottom: `${4 * c.u}px solid ${rgba(c.tema.acento, 0.55)}` }}>
              {p}
            </span>
          );
        }
        return (
          <span key={i} style={{ background: `linear-gradient(100deg, ${claro}, ${c.tema.acento})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            {p}
          </span>
        );
      })}
    </>
  );
}

/** O selo em mono com a bolinha da marca (o "rótulo" da hierarquia). */
export function Selo({ c, texto, estilo }: { c: Ctx; texto: string; estilo?: React.CSSProperties }) {
  const { u, tema } = c;
  const doc = tema.visual === "documental";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12 * u,
        fontFamily: tema.fonteMono,
        fontWeight: 500,
        fontSize: 20 * u,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: doc ? "#3b3832" : "#dfe6ef",
        padding: `${10 * u}px ${20 * u}px`,
        borderRadius: 999,
        background: doc ? rgba("#ffffff", 0.75) : tema.visual === "impacto" ? rgba("#000000", 0.55) : "linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.03))",
        border: `${1 * u}px solid ${doc ? rgba("#000000", 0.12) : "rgba(255,255,255,.16)"}`,
        ...estilo,
      }}
    >
      <i style={{ width: 10 * u, height: 10 * u, borderRadius: "50%", background: tema.acento, display: "inline-block" }} />
      {texto}
    </div>
  );
}

/** O número no quadrado da marca (capítulos, passos). */
export function Numero({ c, n, tam = 74 }: { c: Ctx; n: string | number; tam?: number }) {
  const { u, tema } = c;
  return (
    <span
      style={{
        display: "inline-flex",
        flex: "0 0 auto",
        width: tam * u,
        height: tam * u,
        borderRadius: (tema.visual === "documental" ? 999 : 18) * u * (tam / 74),
        alignItems: "center",
        justifyContent: "center",
        fontFamily: tema.fonteTitulo === "Playfair Display" ? "Playfair Display" : "Geist",
        fontWeight: 700,
        fontSize: tam * 0.58 * u,
        color: sobreOAcento(tema),
        background: `linear-gradient(135deg, ${misturar(tema.acento, "#ffffff", 0.12)}, ${misturar(tema.acento, "#000000", 0.22)})`,
        boxShadow: `0 ${10 * u}px ${24 * u}px ${rgba(tema.acento, 0.3)}`,
      }}
    >
      {n}
    </span>
  );
}

/** Um ícone do catálogo, em traço, na cor pedida. */
export function Icone({ nome, tam, cor, traco = 2 }: { nome: string; tam: number; cor: string; traco?: number }) {
  const nos = ICONES[nome] ?? ICONES.estrela;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round">
      {nos.map(([tag, at], i) => React.createElement(tag, { key: i, ...at }))}
    </svg>
  );
}

/** O ícone dentro do quadradinho tingido (cartões, linha do tempo). */
export function IconeNaCaixa({ c, nome, tam = 56, aceso = true }: { c: Ctx; nome: string; tam?: number; aceso?: boolean }) {
  const { u, tema } = c;
  return (
    <span
      style={{
        width: tam * u,
        height: tam * u,
        flex: "0 0 auto",
        borderRadius: 14 * u * (tam / 56),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: aceso ? rgba(tema.acento, tema.visual === "documental" ? 0.14 : 0.18) : "rgba(255,255,255,.06)",
      }}
    >
      <Icone nome={nome} tam={tam * 0.56 * u} cor={aceso ? tema.acento : corFraca(c)} traco={2.2} />
    </span>
  );
}

// ─────────────────────────────── movimento ───────────────────────────────

/**
 * A entrada e a saída de um bloco, pelo acabamento: o vidro sobe 26 px e
 * aparece (o pitch), o impacto estoura com mola, o documental surge devagar.
 * `p` é o progresso da entrada (0 a 1, cru) e `fica` o da saída.
 */
export function entradaDoBloco(c: Ctx, p: number, deslocamento = 26): React.CSSProperties {
  const { tema, u } = c;
  const sai = c.fica;
  if (tema.visual === "impacto") {
    const s = 0.82 + 0.18 * mola(p);
    return { opacity: limitar(p * 3) * sai, transform: `scale(${s * (0.96 + 0.04 * sai)})` };
  }
  const e = saiSuave(p);
  const dy = (1 - e) * deslocamento * u * (tema.visual === "documental" ? 0.6 : 1);
  return { opacity: e * sai, transform: `translateY(${dy + (1 - sai) * 8 * u}px)` };
}

/** Progresso de um item que entra no evento k (ou junto com a camada, sem eventos). */
export function progressoDoItem(c: Ctx, k: number, atraso = 0.12): number {
  if (c.passos.length > k) return c.passos[k];
  // Sem evento: entram em cascata na entrada da camada.
  return limitar((c.t - k * atraso) / Math.max(0.2, 0.45));
}

/** Margens seguras (formato e legenda): onde as peças podem ficar. */
export function margens(c: Ctx) {
  const { W, H, vertical, u } = c;
  return vertical
    ? { x: 56, topo: 0.13 * H, base: 0.76 * H, largura: W - 112 }
    : { x: 80 * u, topo: 70 * u, base: H - 150 * u, largura: W - 160 * u };
}

/** A posição de um bloco pelo nome que o editor escreve. */
export function posicionar(c: Ctx, posicao: string | undefined, largura?: number): React.CSSProperties {
  const m = margens(c);
  const w = largura ? { width: largura } : {};
  switch (posicao) {
    case "centro":
      return { position: "absolute", left: 0, right: 0, top: c.vertical ? c.H * 0.36 : c.H * 0.36, display: "flex", justifyContent: "center", ...w };
    case "topo":
      return { position: "absolute", left: 0, right: 0, top: m.topo, display: "flex", justifyContent: "center" };
    case "direita":
      return { position: "absolute", right: m.x, top: m.topo, display: "flex", justifyContent: "flex-end", ...w };
    case "baixo":
      return { position: "absolute", left: m.x, right: m.x, top: m.base - (c.vertical ? 260 : 220) * c.u, display: "flex", justifyContent: "flex-start" };
    case "esquerda-meio":
      return { position: "absolute", left: m.x, top: c.H * 0.3, ...w };
    default:
      return { position: "absolute", left: m.x, top: m.topo, ...w };
  }
}

export function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : padrao;
}
export function lista<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
