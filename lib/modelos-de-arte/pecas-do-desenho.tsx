import type { CSSProperties, ReactNode } from "react";
import { encaixar, larguraDoTexto, palavraDeDestaque } from "@/lib/modelos-de-arte/encaixe";
import { estiloDaFonte, type FonteId } from "@/lib/modelos-de-arte/fontes";
import { CONTRASTE_MINIMO_DO_TEXTO, tipografiaDaLetra } from "@/lib/modelos-de-arte/identidade";
import type { EntradaDoDesenho, Zona } from "@/lib/modelos-de-arte/desenho";

/**
 * AS PEÇAS DOS DESENHOS NOVOS DO BOOK (05/10/2026): cor, texto encaixado,
 * assinatura, imagem, selo de arrastar e a base comum (medidas e cores pela
 * identidade aprovada). Servem aos modelos com foto
 * (lib/modelos-de-arte/desenho-com-foto.tsx) e à família Vox
 * (lib/modelos-de-arte/desenho-vox.tsx), que não se importam entre si.
 *
 * Mesma regra do desenho principal: uma função só para a prévia e para o
 * Satori, tudo em flex e pixel. Puro: sem banco, sem fs, sem sharp.
 */

// ── cor ──────────────────────────────────────────────────────────────────────

export function rgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const f = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}

export function luminancia(hex: string): number {
  const canal = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function misturar(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function contrasteEntre(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A letra que dá contraste sobre um fundo. */
export function sobre(fundo: string): string {
  return luminancia(fundo) > 0.42 ? "#141414" : "#ffffff";
}

// ── peças ────────────────────────────────────────────────────────────────────

/** Toda div em flex (o Satori exige), sem chave indefinida (o Satori quebra com elas). */
export const flex = (s: CSSProperties = {}): CSSProperties => {
  const limpo: Record<string, unknown> = { display: "flex" };
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== null) limpo[k] = v;
  return limpo as CSSProperties;
};

/** Estamos no navegador (prévia)? Só lá o filtro CSS faz o preto e branco. */
export const noNavegador = () => typeof window !== "undefined";

/**
 * A imagem numa zona, cobrindo. Com `pb`, a prévia aplica o filtro de cinza;
 * no servidor a foto já chega sem cor no pixel, e o filtro não entra.
 */
export function Imagem({ src, z, pb, raio = 0, posicao = "center", extra = {} }: { src: string; z: Zona; pb?: boolean; raio?: number; posicao?: string; extra?: CSSProperties }) {
  const filtro = pb && noNavegador() ? { filter: "grayscale(1) contrast(1.08)" } : {};
  return (
    <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, borderRadius: raio, overflow: "hidden", ...extra })}>
      {/* O raio também na imagem: o Satori não recorta a imagem só pelo pai. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={z.w} height={z.h} style={{ width: z.w, height: z.h, objectFit: "cover", objectPosition: posicao, borderRadius: raio, ...filtro }} />
    </div>
  );
}

/** O lugar da foto quando não há foto: um tom da marca. */
export function Vazio({ z, cor, raio = 0 }: { z: Zona; cor: string; raio?: number }) {
  return <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, background: cor, borderRadius: raio })} />;
}

/** O logo (numa pastilha clara quando o fundo é escuro) ou o nome da marca. */
export function Assinatura({ e, fundo, altura, alinhar = "flex-start" }: { e: EntradaDoDesenho; fundo: string; altura: number; alinhar?: "flex-start" | "center" | "flex-end" }) {
  const escuro = luminancia(fundo) < 0.35;
  if (e.logo) {
    const prop = e.logoProporcao && e.logoProporcao > 0 ? Math.min(e.logoProporcao, 6) : 1;
    const w = Math.round(altura * prop);
    const pad = Math.round(altura * 0.28);
    return (
      <div style={flex({ justifyContent: alinhar })}>
        <div style={flex({ padding: escuro ? pad : 0, background: escuro ? "#ffffff" : "transparent", borderRadius: Math.round(altura * 0.35) })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.logo} alt="" width={w} height={altura} style={{ width: w, height: altura, objectFit: "contain" }} />
        </div>
      </div>
    );
  }
  return (
    <div style={flex({ justifyContent: alinhar, ...estiloDaFonte("Montserrat-800"), fontSize: Math.round(altura * 0.62), color: sobre(fundo), letterSpacing: Math.round(altura * 0.02), lineHeight: 1.1 })}>
      {e.marca}
    </div>
  );
}

export type Destaque = "cor" | "bloco" | "pincel" | "nenhum";

/**
 * O texto encaixado na caixa (mesma conta da prévia e da arte), palavra a
 * palavra, com a palavra-chave em cor, em bloco sólido ou em pincel.
 */
export function Texto(p: {
  texto: string;
  fonte: FonteId;
  largura: number;
  altura: number;
  corpoMaximo: number;
  corpoMinimo?: number;
  entrelinha?: number;
  cor: string;
  alinhar?: "left" | "center" | "right";
  caixaAlta?: boolean;
  destaque?: Destaque;
  corDestaque?: string;
  fonteDoDestaque?: FonteId;
  palavras?: string[];
  maxLinhas?: number;
  sombra?: boolean;
}) {
  const texto = p.caixaAlta ? p.texto.toUpperCase() : p.texto;
  const entrelinha = p.entrelinha ?? 1.15;
  const modo = p.destaque ?? "nenhum";
  const enc = encaixar({ texto, fonte: p.fonte, largura: p.largura, altura: p.altura, entrelinha, corpoMaximo: p.corpoMaximo, corpoMinimo: p.corpoMinimo, folga: modo === "bloco" ? 0.4 : 0, maxLinhas: p.maxLinhas });
  const s = enc.corpo;
  const espaco = larguraDoTexto(" ", p.fonte) * s;
  const marcadas = new Set((p.palavras ?? []).map((w) => (p.caixaAlta ? w.toUpperCase() : w).toLowerCase()));
  const corD = p.corDestaque ?? p.cor;
  const alinhar = p.alinhar === "center" ? "center" : p.alinhar === "right" ? "flex-end" : "flex-start";
  const palavra = (w: string, k: number, ultima: boolean) => {
    const mr = ultima ? 0 : espaco;
    if (!marcadas.has(w.toLowerCase()) || modo === "nenhum")
      return (
        <span key={k} style={{ marginRight: mr }}>
          {w}
        </span>
      );
    if (modo === "cor")
      return (
        <span key={k} style={{ marginRight: mr, color: corD }}>
          {w}
        </span>
      );
    if (modo === "pincel")
      return (
        <span key={k} style={{ marginRight: mr, color: corD, ...estiloDaFonte(p.fonteDoDestaque ?? p.fonte), fontSize: s * 1.08 }}>
          {w}
        </span>
      );
    return (
      <div key={k} style={flex({ marginRight: mr, background: corD, color: sobre(corD), padding: `0 ${Math.round(s * 0.14)}px` })}>
        {w}
      </div>
    );
  };
  return (
    <div style={flex({ flexDirection: "column", alignItems: alinhar })}>
      {enc.linhas.map((l, li) => {
        const ws = l.split(" ");
        return (
          <div
            key={li}
            style={flex({
              ...estiloDaFonte(p.fonte),
              fontSize: s,
              lineHeight: entrelinha,
              color: p.cor,
              whiteSpace: "nowrap",
              textShadow: p.sombra ? "0 3px 18px rgba(0,0,0,0.45)" : undefined,
              justifyContent: alinhar,
            })}
          >
            {ws.map((w, wi) => palavra(w, li * 40 + wi, wi === ws.length - 1))}
          </div>
        );
      })}
    </div>
  );
}

export function Seta({ cor, tam }: { cor: string; tam: number }) {
  return (
    <svg width={tam * 2} height={tam} viewBox="0 0 48 24">
      <path d="M2 12h40M32 3l10 9-10 9" stroke={cor} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** O selo "arraste para o lado", só na capa do carrossel. */
export function Arraste({ cor, tinta, fonte, u }: { cor: string; tinta: string; fonte: FonteId; u: number }) {
  return (
    <div style={flex({ alignItems: "center", border: `${3 * u}px solid ${cor}`, borderRadius: 999, padding: `${16 * u}px ${30 * u}px` })}>
      <span style={{ ...estiloDaFonte(fonte), fontSize: 28 * u, color: tinta, marginRight: 16 * u, letterSpacing: 1 * u }}>Arraste para o lado</span>
      <Seta cor={cor} tam={22 * u} />
    </div>
  );
}

// ── a base comum ─────────────────────────────────────────────────────────────

/** As medidas e as cores que todo modelo daqui usa, pela identidade aprovada. */
export function base(e: EntradaDoDesenho) {
  const W = e.largura;
  const H = e.altura;
  const u = Math.min(W, H) / 1080;
  const m = Math.round(Math.min(W, H) * 0.075);
  const md = e.modelo;
  const { escuro, claro, papeis } = e.cores;
  const acento = papeis?.destaque ?? e.cores.acento;
  // O fundo do modelo (claro ou escuro) é a cor que o cliente chamou de fundo.
  const fundo = papeis ? papeis.fundo : md.fundo === "claro" ? claro : escuro;
  // O título na cor aprovada quando ela lê sobre o fundo; senão a tinta que contrasta.
  const tinta = papeis && contrasteEntre(papeis.titulo, fundo) >= CONTRASTE_MINIMO_DO_TEXTO ? papeis.titulo : sobre(fundo);
  const tintaFraca = rgba(tinta, 0.68);
  // O destaque como letra precisa ler sobre o fundo; senão vira a própria tinta.
  const acentoLegivel = contrasteEntre(acento, fundo) >= 3 ? acento : tinta;
  const tipografia = tipografiaDaLetra(e.letra, md);
  const palavra = palavraDeDestaque(e.textos.titulo);
  const logoH = Math.round(54 * u);
  const larguraUtil = W - 2 * m;
  const alta = H / W > 1.6;
  const deitada = W / H > 1.2;
  const tomDaFoto = misturar(escuro, acento, 0.25);
  const capaDoCarrossel = Boolean(e.pagina && e.pagina.i === 0 && e.pagina.total > 1);
  const raiz = (filhos: ReactNode, bg = fundo) => <div style={flex({ width: W, height: H, position: "relative", overflow: "hidden", background: bg })}>{filhos}</div>;
  return { W, H, u, m, md, acento, acentoLegivel, fundo, tinta, tintaFraca, tf: tipografia.titulo, xf: tipografia.texto, caixaAlta: tipografia.caixaAlta, palavra, logoH, larguraUtil, alta, deitada, tomDaFoto, capaDoCarrossel, raiz, t: e.textos };
}
