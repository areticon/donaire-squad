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
 * no servidor a foto já chega sem cor no pixel, e o filtro não entra. O mesmo
 * vale para `desfoque` (px) e `contraste` (05/10): na prévia, filtro CSS; no
 * servidor, o sharp já fez no pixel (lib/modelos-de-arte/compor.tsx).
 */
export function Imagem({ src, z, pb, raio = 0, posicao = "center", extra = {}, desfoque = 0, contraste = false }: { src: string; z: Zona; pb?: boolean; raio?: number; posicao?: string; extra?: CSSProperties; desfoque?: number; contraste?: boolean }) {
  const filtros: string[] = [];
  if (noNavegador()) {
    if (pb) filtros.push("grayscale(1)", contraste ? "contrast(1.2)" : "contrast(1.08)");
    else if (contraste) filtros.push("contrast(1.12)", "saturate(1.08)");
    if (desfoque > 0) filtros.push(`blur(${desfoque}px)`);
  }
  const filtro = filtros.length ? { filter: filtros.join(" ") } : {};
  // Com desfoque, a imagem cresce um pouco para a borda borrada não aparecer.
  const cresce = desfoque > 0 && noNavegador() ? { transform: "scale(1.05)" } : {};
  return (
    <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, borderRadius: raio, overflow: "hidden", ...extra })}>
      {/* O raio também na imagem: o Satori não recorta a imagem só pelo pai. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={z.w} height={z.h} style={{ width: z.w, height: z.h, objectFit: "cover", objectPosition: posicao, borderRadius: raio, ...filtro, ...cresce }} />
    </div>
  );
}

// ── os efeitos de profundidade e luz (05/10) ─────────────────────────────────

/**
 * OS EFEITOS DOS MODELOS COM FOTO (05/10/2026), pedido do Bruno: "efeitos de
 * profundidade, luz de fundo, sombra, desfoque de fundo", e cada modelo com o
 * seu, nunca o mesmo efeito em todos. Tudo em código, sem IA:
 *
 *   - sombra da pessoa recortada: "dura" (a silhueta deslocada numa cor sólida,
 *     de cartaz ou adesivo; é a própria imagem usada como máscara) ou "suave"
 *     (a silhueta desfocada; na prévia é drop-shadow do CSS, no servidor o
 *     sharp desenha o PNG da sombra e manda em `recorteSombra`);
 *   - luz atrás da pessoa: "aro" (rim light, um anel claro atrás da cabeça e
 *     dos ombros) ou "brilho" (glow largo na cor de destaque);
 *   - fundo: desfoque e vinheta (escurece as bordas);
 *   - contraste de alto impacto na pessoa e na foto (prévia: filtro CSS;
 *     servidor: curva do sharp).
 *
 * As cores são símbolos ("acento", "tinta", "branca", "preta"), resolvidos na
 * hora do desenho com as cores aprovadas do cliente.
 */
export type CorDoEfeito = "acento" | "tinta" | "branca" | "preta";

export interface EfeitoDaPessoa {
  sombra?: "dura" | "suave";
  corDaSombra?: CorDoEfeito;
  luz?: "aro" | "brilho";
  corDaLuz?: CorDoEfeito;
  contraste?: boolean;
}

export interface EfeitoDoModelo {
  pessoa?: EfeitoDaPessoa;
  /** O desfoque do fundo em px (na peça de 1080) e a força da vinheta (0 a 1). */
  fundo?: { desfoque?: number; vinheta?: number };
  /** A curva de contraste na foto inteira. */
  contrasteDaFoto?: boolean;
}

/** O efeito de cada arquétipo. Um diferente por modelo, de propósito. */
export const EFEITOS_DO_MODELO: Record<string, EfeitoDoModelo> = {
  // A pessoa em cores com rim light branca, sombra suave e vinheta no fundo.
  "retrato-bloco": { pessoa: { luz: "aro", corDaLuz: "branca", sombra: "suave", contraste: true }, fundo: { vinheta: 0.35 } },
  // O cartaz em preto e branco: sombra dura na cor de destaque, contraste alto.
  "pb-palavra": { pessoa: { sombra: "dura", corDaSombra: "acento", contraste: true } },
  // Sobre o mapa: glow no destaque atrás da pessoa e sombra suave.
  "mapa-pontilhado": { pessoa: { luz: "brilho", corDaLuz: "acento", sombra: "suave" } },
  // A colagem em papel: a pessoa como adesivo, com sombra dura escura.
  "vox-faixa": { pessoa: { sombra: "dura", corDaSombra: "tinta" } },
  // O jornal: recorte de papel com sombra suave.
  "vox-jornal": { pessoa: { sombra: "suave", contraste: true } },
  // O rosto em pedaços: um aro de luz branca separa a pessoa dos rasgos coloridos.
  "vox-rosto": { pessoa: { luz: "aro", corDaLuz: "branca" } },
  // A capa em papel: sombra suave e contraste.
  "vox-capa": { pessoa: { sombra: "suave", contraste: true } },
  // Os modelos de foto inteira, cada um com um tratamento de fundo.
  "retrato-faixas": { fundo: { vinheta: 0.4 }, contrasteDaFoto: true },
  "foto-escurecida": { fundo: { desfoque: 6 } },
  "foto-pura": { fundo: { vinheta: 0.5 }, contrasteDaFoto: true },
  "papel-pb": { contrasteDaFoto: true },
  "vox-antes-depois": { fundo: { vinheta: 0.3 } },
};

export function efeitoDoModelo(arquetipo: string): EfeitoDoModelo {
  return EFEITOS_DO_MODELO[arquetipo] ?? {};
}

/** A cor de um símbolo do efeito, com as cores da peça. */
export function corDoEfeito(c: CorDoEfeito | undefined, cores: { acento: string; tinta: string }, padrao: CorDoEfeito): string {
  const k = c ?? padrao;
  return k === "acento" ? cores.acento : k === "tinta" ? cores.tinta : k === "branca" ? "#ffffff" : "#000000";
}

/** A vinheta: as bordas escurecem, o centro fica como está. */
export function Vinheta({ W, H, forca }: { W: number; H: number; forca: number }) {
  const a = Math.max(0, Math.min(1, forca));
  return <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(a * 0.55).toFixed(2)}) 80%, rgba(0,0,0,${a.toFixed(2)}) 100%)` })} />;
}

/**
 * A pessoa recortada (PNG do tamanho da peça, alinhado com a foto), deslocada
 * e escalada em frações da peça, com os efeitos do modelo por baixo: a luz,
 * a sombra e, na prévia, o contraste por filtro.
 */
export function Pessoa(p: { src: string; W: number; H: number; desloca?: number; escala?: number; pb?: boolean; efeito?: EfeitoDaPessoa; cores: { acento: string; tinta: string }; sombraSrc?: string | null }) {
  const { W, H, src } = p;
  const desloca = p.desloca ?? 0;
  const escala = p.escala ?? 1;
  const ef = p.efeito ?? {};
  const x = Math.round(W * desloca);
  const y = Math.round(H * (1 - escala));
  const w = Math.round(W * escala);
  const h = Math.round(H * escala);
  const u = Math.min(W, H) / 1080;
  const navegador = noNavegador();
  // A sombra cai para baixo e para a direita, como uma luz alta à esquerda.
  const dx = Math.round(22 * u);
  const dy = Math.round(16 * u);
  const corDaSombra = corDoEfeito(ef.corDaSombra, p.cores, "preta");
  const corDaLuz = corDoEfeito(ef.corDaLuz, p.cores, "branca");
  // A luz fica atrás da cabeça e dos ombros: o terço de cima da caixa da pessoa.
  const cx = Math.round(x + w / 2);
  const cy = Math.round(y + h * 0.32);
  const filtros: string[] = [];
  if (navegador) {
    if (p.pb) filtros.push("grayscale(1)", ef.contraste ? "contrast(1.2)" : "contrast(1.08)");
    else if (ef.contraste) filtros.push("contrast(1.12)", "saturate(1.06)");
    if (ef.sombra === "suave") filtros.push(`drop-shadow(${dx}px ${dy}px ${Math.round(28 * u)}px ${rgba(corDaSombra, 0.55)})`);
  }
  const mascara = { maskImage: `url(${src})`, maskSize: `${w}px ${h}px`, maskRepeat: "no-repeat", maskPosition: "0 0", WebkitMaskImage: `url(${src})`, WebkitMaskSize: `${w}px ${h}px`, WebkitMaskRepeat: "no-repeat" } as CSSProperties;
  return (
    <>
      {ef.luz === "brilho" ? (
        <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `radial-gradient(circle at ${cx}px ${cy}px, ${rgba(corDaLuz, 0.6)} 0%, ${rgba(corDaLuz, 0.22)} ${Math.round(W * 0.22)}px, ${rgba(corDaLuz, 0)} ${Math.round(W * 0.5)}px)` })} />
      ) : null}
      {ef.luz === "aro" ? (
        // O aro: um anel claro, fino, logo atrás do contorno da pessoa.
        <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `radial-gradient(circle at ${cx}px ${cy}px, ${rgba(corDaLuz, 0)} 0%, ${rgba(corDaLuz, 0)} ${Math.round(w * 0.14)}px, ${rgba(corDaLuz, 0.42)} ${Math.round(w * 0.24)}px, ${rgba(corDaLuz, 0.12)} ${Math.round(w * 0.36)}px, ${rgba(corDaLuz, 0)} ${Math.round(w * 0.48)}px)` })} />
      ) : null}
      {ef.sombra === "dura" ? (
        // A silhueta sólida: a própria imagem como máscara de um bloco de cor (o Satori entende mask-image).
        <div style={flex({ position: "absolute", left: x + Math.round(dx * 1.6), top: y + Math.round(dy * 1.4), width: w, height: h, background: corDaSombra, opacity: 0.85, ...mascara })} />
      ) : null}
      {ef.sombra === "suave" && !navegador && p.sombraSrc ? (
        <div style={flex({ position: "absolute", left: x + dx, top: y + dy, width: w, height: h })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.sombraSrc} alt="" width={w} height={h} style={{ width: w, height: h, objectFit: "cover" }} />
        </div>
      ) : null}
      <div style={flex({ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden" })}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={w} height={h} style={{ width: w, height: h, objectFit: "cover", ...(filtros.length ? { filter: filtros.join(" ") } : {}) }} />
      </div>
    </>
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
