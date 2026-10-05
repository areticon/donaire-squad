import type { CSSProperties, ReactNode } from "react";
import { encaixar, larguraDoTexto, palavraDeDestaque, type Encaixe } from "@/lib/modelos-de-arte/encaixe";
import { estiloDaFonte, type FonteId } from "@/lib/modelos-de-arte/fontes";
import type { ModeloDeArte, TextosDaArte } from "@/lib/modelos-de-arte/catalogo";
import { CONTRASTE_MINIMO_DO_TEXTO, tipografiaDaLetra, type LetraId, type PapeisEscolhidos } from "@/lib/modelos-de-arte/identidade";
import type { TratamentoDaFoto } from "@/lib/modelos-de-arte/tratamento";

/**
 * O DESENHO DE CADA MODELO, UM SÓ PARA A PRÉVIA E PARA A ARTE (03/10/2026).
 *
 * A mesma função devolve o JSX que o navegador mostra na galeria ("sua arte vai
 * ficar assim") e que o Satori transforma na peça de verdade no servidor
 * (lib/modelos-de-arte/compor.tsx). Por isso o estilo segue o que o Satori
 * entende: toda div com display flex, posição absoluta, sem grid, sem filtro,
 * medidas em pixel calculadas aqui. As linhas do texto também saem daqui
 * (encaixe pela largura real de cada letra), então a arte quebra a frase onde a
 * prévia quebrou.
 *
 * Puro: sem banco, sem fs, sem sharp. Componente de cliente pode importar.
 */

export interface CoresDoDesenho {
  acento: string;
  escuro: string;
  claro: string;
  /**
   * OS PAPÉIS APROVADOS PELO CLIENTE (05/10, lib/modelos-de-arte/identidade.ts):
   * com eles, o fundo da peça é `papeis.fundo`, o título é `papeis.titulo` e o
   * destaque é `papeis.destaque`, exatamente como ele viu na prévia. Sem eles,
   * vale a conta de antes (fundo claro ou escuro pelo modelo).
   */
  papeis?: PapeisEscolhidos;
}

export interface EntradaDoDesenho {
  modelo: ModeloDeArte;
  textos: TextosDaArte;
  cores: CoresDoDesenho;
  /** A letra aprovada pelo cliente (05/10); sem ela, a tipografia do modelo. */
  letra?: LetraId | null;
  largura: number;
  altura: number;
  /** A foto (URL ou data URI). Sem ela, o lugar da foto fica num tom da marca. */
  foto?: string | null;
  /** O logo (URL ou data URI) e a proporção dele (largura / altura). */
  logo?: string | null;
  logoProporcao?: number | null;
  /** O nome da marca, para assinatura, cabeçalho e o print. */
  marca: string;
  arroba?: string;
  /** Lâmina de carrossel (0 = capa). */
  pagina?: { i: number; total: number } | null;
  /**
   * PROFUNDIDADE (03/10, biblioteca de materiais): a pessoa recortada da foto
   * real (PNG com transparência, no tamanho da peça, alinhada com `foto`) e o
   * fundo desfocado da mesma foto. Com os dois, o título passa atrás da pessoa.
   */
  recorte?: string | null;
  fundoDesfocado?: string | null;
  /**
   * O TRATAMENTO DA FOTO NA PRÉVIA (05/10, lib/modelos-de-arte/tratamento.ts),
   * SÓ NO NAVEGADOR: a galeria mostra a foto em preto e branco ou em duotone
   * com filtro CSS e um véu em multiply. O servidor NUNCA passa isto: lá a
   * foto já chega tratada no pixel (lib/media/tratamento-da-foto.ts), porque
   * o Satori não entende filter nem mix-blend-mode.
   */
  tratamento?: TratamentoDaFoto | null;
}

export interface Zona {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── cor ──────────────────────────────────────────────────────────────────────

function rgb(hex: string): [number, number, number] {
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

function misturar(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Contraste WCAG entre duas cores (1 a 21). */
function contrasteEntre(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A letra que dá contraste sobre um fundo. */
function sobre(fundo: string): string {
  return luminancia(fundo) > 0.42 ? "#141414" : "#ffffff";
}

// ── geometria comum ──────────────────────────────────────────────────────────

function medidas(e: EntradaDoDesenho) {
  const W = e.largura;
  const H = e.altura;
  const u = Math.min(W, H) / 1080;
  const m = Math.round(Math.min(W, H) * 0.075);
  return { W, H, u, m, deitada: W / H > 1.2, alta: H / W > 1.6 };
}

/**
 * Onde a foto do modelo fica (a principal, na colagem). O servidor recorta a
 * foto da IA para esta zona e pede a proporção mais próxima dela.
 */
export function zonaDaFoto(modelo: ModeloDeArte, largura: number, altura: number): Zona | null {
  const W = largura;
  const H = altura;
  const u = Math.min(W, H) / 1080;
  const m = Math.round(Math.min(W, H) * 0.075);
  const deitada = W / H > 1.2;
  const alta = H / W > 1.6;
  switch (modelo.arquetipo) {
    case "foto-topo":
      if (modelo.id === "manchete-de-jornal") return { x: m, y: Math.round(H * 0.56), w: W - 2 * m, h: Math.round(H * 0.44) - m - Math.round(40 * u) };
      if (deitada) return { x: 0, y: 0, w: Math.round(W * 0.5), h: H };
      if (modelo.fundo === "claro") return { x: m, y: m, w: W - 2 * m, h: Math.round(H * 0.56) - m };
      return { x: 0, y: 0, w: W, h: Math.round(H * 0.6) };
    case "foto-inteira":
    case "revista":
    case "foto-profundidade":
      return { x: 0, y: 0, w: W, h: H };
    case "foto-lado":
      if (alta) return { x: 0, y: 0, w: W, h: Math.round(H * 0.5) };
      return { x: 0, y: 0, w: Math.round(W * 0.46), h: H };
    case "polaroid": {
      const lado = Math.round(Math.min(W * 0.66, H * 0.5));
      return { x: Math.round((W - lado) / 2), y: Math.round(H * (alta ? 0.24 : 0.14)), w: lado, h: lado };
    }
    case "colagem":
      return { x: m, y: Math.round(m * 1.2), w: Math.round(W * (deitada ? 0.4 : 0.6)), h: Math.round(H * (deitada ? 0.62 : 0.36)) };
    default:
      return null;
  }
}

// ── peças pequenas ───────────────────────────────────────────────────────────

/** Toda div em flex (o Satori exige), sem chave indefinida (o Satori quebra com elas). */
const flex = (s: CSSProperties = {}): CSSProperties => {
  const limpo: Record<string, unknown> = { display: "flex" };
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== null) limpo[k] = v;
  return limpo as CSSProperties;
};

/**
 * A foto tratada na PRÉVIA (navegador): a imagem em cinza e, no duotone, um
 * véu na cor do destaque em multiply (luz vira a cor, sombra fica escura). Sem
 * tratamento, devolve a imagem como está. O Satori nunca recebe `tratamento`.
 */
function imagemTratada(img: ReactNode, tratamento: TratamentoDaFoto | null | undefined, destaque: string): ReactNode {
  if (!tratamento) return img;
  return (
    <div style={flex({ position: "relative", width: "100%", height: "100%", overflow: "hidden" })}>
      <div style={flex({ width: "100%", height: "100%", filter: "grayscale(1) contrast(1.12)" })}>{img}</div>
      {tratamento === "duotone" && <div style={flex({ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", background: destaque, mixBlendMode: "multiply" })} />}
    </div>
  );
}

function Foto({ src, z, raio = 0, cor, extra = {}, tratamento, destaque = "#000000" }: { src?: string | null; z: Zona; raio?: number; cor: string; extra?: CSSProperties; tratamento?: TratamentoDaFoto | null; destaque?: string }) {
  return (
    <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, borderRadius: raio, overflow: "hidden", background: cor, ...extra })}>
      {src
        ? imagemTratada(
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" width={z.w} height={z.h} style={{ width: z.w, height: z.h, objectFit: "cover" }} />,
            tratamento,
            destaque
          )
        : null}
    </div>
  );
}

/** O logo (numa pastilha clara quando o fundo é escuro) ou o nome da marca. */
function Assinatura({ e, fundo, altura, alinhar = "flex-start" }: { e: EntradaDoDesenho; fundo: string; altura: number; alinhar?: "flex-start" | "center" | "flex-end" }) {
  const escuro = luminancia(fundo) < 0.35;
  if (e.logo) {
    const prop = e.logoProporcao && e.logoProporcao > 0 ? Math.min(e.logoProporcao, 6) : 1;
    const h = altura;
    const w = Math.round(h * prop);
    const pad = Math.round(altura * 0.28);
    return (
      <div style={flex({ justifyContent: alinhar })}>
        <div style={flex({ padding: escuro ? pad : 0, background: escuro ? "#ffffff" : "transparent", borderRadius: Math.round(altura * 0.35) })}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.logo} alt="" width={w} height={h} style={{ width: w, height: h, objectFit: "contain" }} />
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

type ModoDestaque = "cor" | "bloco" | "marca-texto" | "sublinhado" | "nenhum";

/** As linhas encaixadas, palavra a palavra, com o destaque do modelo. */
function Linhas(p: {
  enc: Encaixe;
  fonte: FonteId;
  cor: string;
  entrelinha: number;
  alinhar?: "left" | "center";
  destaque?: ModoDestaque;
  corDestaque?: string;
  /** As palavras destacadas (já na mesma caixa do texto). */
  palavras?: string[];
  espacamento?: number;
  sombra?: boolean;
}) {
  const s = p.enc.corpo;
  const espaco = larguraDoTexto(" ", p.fonte) * s;
  const marcadas = new Set((p.palavras ?? []).map((w) => w.toLowerCase()));
  const corD = p.corDestaque ?? p.cor;
  const modo = p.destaque ?? "nenhum";
  const palavra = (w: string, k: number, ultima: boolean) => {
    const mr = ultima ? 0 : espaco;
    const em = marcadas.has(w.toLowerCase());
    if (!em || modo === "nenhum") return (
      <span key={k} style={{ marginRight: mr }}>
        {w}
      </span>
    );
    if (modo === "cor") {
      // Acento que não dá contraste com a letra vira sublinhado.
      return (
        <span key={k} style={{ marginRight: mr, color: corD }}>
          {w}
        </span>
      );
    }
    if (modo === "bloco") {
      return (
        <div key={k} style={flex({ marginRight: mr, background: corD, color: sobre(corD), padding: `0 ${Math.round(s * 0.12)}px`, transform: "rotate(-2deg)" })}>
          {w}
        </div>
      );
    }
    if (modo === "marca-texto") {
      return (
        <div key={k} style={flex({ position: "relative", marginRight: mr })}>
          <div style={flex({ position: "absolute", left: -s * 0.08, right: -s * 0.08, top: s * 0.38, bottom: s * 0.04, background: corD, opacity: 0.85, transform: "rotate(-1.2deg)", borderRadius: Math.round(s * 0.06) })} />
          <span style={{ position: "relative" }}>{w}</span>
        </div>
      );
    }
    return (
      <div key={k} style={flex({ flexDirection: "column", marginRight: mr })}>
        <span>{w}</span>
        <div style={flex({ height: Math.max(4, Math.round(s * 0.08)), background: corD, marginTop: -Math.round(s * 0.04) })} />
      </div>
    );
  };
  return (
    <div style={flex({ flexDirection: "column", alignItems: p.alinhar === "center" ? "center" : "flex-start" })}>
      {p.enc.linhas.map((l, li) => {
        const ws = l.split(" ");
        return (
          <div
            key={li}
            style={flex({
              ...estiloDaFonte(p.fonte),
              fontSize: s,
              lineHeight: p.entrelinha,
              color: p.cor,
              whiteSpace: "nowrap",
              letterSpacing: p.espacamento ? p.espacamento * s : undefined,
              textShadow: p.sombra ? "0 3px 18px rgba(0,0,0,0.45)" : undefined,
              justifyContent: p.alinhar === "center" ? "center" : "flex-start",
            })}
          >
            {ws.map((w, wi) => palavra(w, li * 40 + wi, wi === ws.length - 1))}
          </div>
        );
      })}
    </div>
  );
}

/** Texto encaixado numa caixa, pronto para desenhar. */
function Texto(p: {
  texto: string;
  fonte: FonteId;
  largura: number;
  altura: number;
  corpoMaximo: number;
  corpoMinimo?: number;
  entrelinha?: number;
  cor: string;
  alinhar?: "left" | "center";
  caixaAlta?: boolean;
  destaque?: ModoDestaque;
  corDestaque?: string;
  palavras?: string[];
  maxLinhas?: number;
  espacamento?: number;
  sombra?: boolean;
}) {
  const texto = p.caixaAlta ? p.texto.toUpperCase() : p.texto;
  const entrelinha = p.entrelinha ?? 1.15;
  const folga = p.destaque === "bloco" ? 0.4 : p.destaque === "marca-texto" ? 0.2 : 0;
  const enc = encaixar({ texto, fonte: p.fonte, largura: p.largura, altura: p.altura, entrelinha, corpoMaximo: p.corpoMaximo, corpoMinimo: p.corpoMinimo, folga, maxLinhas: p.maxLinhas, espacamento: p.espacamento });
  const palavras = (p.palavras ?? []).map((w) => (p.caixaAlta ? w.toUpperCase() : w));
  return <Linhas enc={enc} fonte={p.fonte} cor={p.cor} entrelinha={entrelinha} alinhar={p.alinhar} destaque={p.destaque} corDestaque={p.corDestaque} palavras={palavras} espacamento={p.espacamento} sombra={p.sombra} />;
}

/** As palavras do destaque: a principal e, no marca-texto, a vizinha. */
function palavrasDoDestaque(frase: string, modo: ModoDestaque): string[] {
  const ws = frase.split(/\s+/).filter(Boolean);
  const p = palavraDeDestaque(frase);
  if (modo !== "marca-texto") return [p];
  const i = ws.indexOf(p);
  const viz = ws[i + 1] && ws[i + 1].replace(/[^\p{L}]/gu, "").length > 2 ? ws[i + 1] : ws[i - 1];
  return viz ? [p, viz] : [p];
}

function Icone({ tipo, cor, tam }: { tipo: "check" | "x" | "seta" | "estrela"; cor: string; tam: number }) {
  if (tipo === "estrela")
    return (
      <svg width={tam} height={tam} viewBox="0 0 24 24">
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.2l7.1-.6z" fill={cor} />
      </svg>
    );
  if (tipo === "seta")
    return (
      <svg width={tam * 2} height={tam} viewBox="0 0 48 24">
        <path d="M2 12h40M32 3l10 9-10 9" stroke={cor} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tipo === "x")
    return (
      <svg width={tam} height={tam} viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6L6 18" stroke={cor} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24">
      <path d="M4 12.5l5 5L20 6.5" stroke={cor} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pontos({ e, cor, apagado, u }: { e: EntradaDoDesenho; cor: string; apagado: string; u: number }) {
  const total = e.pagina?.total ?? 5;
  const atual = e.pagina?.i ?? 0;
  return (
    <div style={flex({ alignItems: "center" })}>
      {Array.from({ length: Math.min(total, 10) }, (_, i) => (
        <div key={i} style={flex({ width: i === atual ? 34 * u : 14 * u, height: 14 * u, borderRadius: 999, background: i === atual ? cor : apagado, marginRight: 10 * u })} />
      ))}
    </div>
  );
}

// ── o desenho ────────────────────────────────────────────────────────────────

export function desenharModelo(e: EntradaDoDesenho): ReactNode {
  const { W, H, u, m, deitada, alta } = medidas(e);
  const { escuro, claro, papeis } = e.cores;
  // O destaque aprovado manda; sem papéis, o acento da marca.
  const acento = papeis?.destaque ?? e.cores.acento;
  const md = e.modelo;
  const t = e.textos;
  // A letra aprovada por cima da do modelo (05/10); modelo de caráter (à mão,
  // pincel, código) mantém a dele.
  const tipografia = tipografiaDaLetra(e.letra, md);
  const tf = tipografia.titulo;
  const xf = tipografia.texto;
  const caixaAlta = tipografia.caixaAlta;
  const papel = misturar(claro, "#f3ede1", 0.55);
  // Com os papéis aprovados, o fundo do modelo (claro, escuro ou na cor) é a
  // cor que o cliente chamou de fundo; branco e papel são o desenho do modelo
  // (print, jornal) e ficam.
  const fundoDe = (f: typeof md.fundo) =>
    papeis && (f === "escuro" || f === "acento" || f === "claro") ? papeis.fundo : f === "escuro" ? escuro : f === "acento" ? acento : f === "branco" ? "#ffffff" : f === "papel" ? papel : claro;
  const fundo = fundoDe(md.fundo);
  // O título na cor aprovada quando ela lê sobre o fundo (4,5:1); senão a
  // tinta que contrasta, para a peça nunca sair ilegível.
  const tinta = papeis && fundo === papeis.fundo && contrasteEntre(papeis.titulo, fundo) >= CONTRASTE_MINIMO_DO_TEXTO ? papeis.titulo : sobre(fundo);
  // O apoio na mesma tinta do título, mais fraca (com o título numa cor da
  // marca, o apoio segue a cor dela, e não um cinza de outra família).
  const tintaFraca = rgba(tinta, 0.68);
  // Destaque legível: acento sobre fundo de baixo contraste vira sublinhado.
  const contrasteAcento = Math.abs(luminancia(acento) - luminancia(fundo));
  const modoDestaque: ModoDestaque = md.destaque === "cor" && contrasteAcento < 0.18 ? "sublinhado" : md.destaque;
  const palavras = palavrasDoDestaque(t.titulo, modoDestaque);
  const logoH = Math.round(54 * u);
  const raiz = (filhos: ReactNode, bg = fundo) => (
    <div style={flex({ width: W, height: H, position: "relative", overflow: "hidden", background: bg })}>{filhos}</div>
  );
  const tomDaFoto = misturar(escuro, acento, 0.25);
  const rodape = (bg: string, alinhar: "flex-start" | "center" | "flex-end" = "flex-start", y?: number) => (
    <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: y ?? H - m - logoH - (luminancia(bg) < 0.35 ? logoH * 0.56 : 0), justifyContent: alinhar })}>
      <Assinatura e={e} fundo={bg} altura={logoH} alinhar={alinhar} />
    </div>
  );
  const larguraUtil = W - 2 * m;

  switch (md.arquetipo) {
    case "foto-topo": {
      const z = zonaDaFoto(md, W, H)!;
      if (md.id === "manchete-de-jornal") {
        const tinta2 = "#151515";
        return raiz(
          <>
            <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: m, flexDirection: "column", alignItems: "center" })}>
              <div style={flex({ width: larguraUtil, height: 4 * u, background: tinta2 })} />
              <div style={flex({ ...estiloDaFonte("PlayfairDisplay-700"), fontSize: 74 * u, lineHeight: 1.25, color: tinta2, marginTop: 10 * u })}>{e.marca}</div>
              <div style={flex({ width: larguraUtil, height: 2 * u, background: tinta2, marginTop: 8 * u })} />
              <div style={flex({ width: larguraUtil, justifyContent: "space-between", ...estiloDaFonte("Inter-400"), fontSize: 22 * u, color: "#555555", marginTop: 8 * u, letterSpacing: 2 * u })}>
                <span>EDIÇÃO ESPECIAL</span>
                <div style={flex({ width: 14 * u, height: 14 * u, background: acento })} />
                <span>OPINIÃO E ANÁLISE</span>
              </div>
              <div style={flex({ width: larguraUtil, height: 6 * u, background: acento, marginTop: 8 * u })} />
            </div>
            <div style={flex({ position: "absolute", left: m, top: Math.round(260 * u), width: larguraUtil, flexDirection: "column" })}>
              <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={Math.round(H * 0.56) - Math.round(260 * u) - (t.apoio ? 110 * u : 30 * u)} corpoMaximo={86 * u} entrelinha={1.1} cor={tinta2} />
              {t.apoio ? (
                <div style={flex({ marginTop: 14 * u })}>
                  <Texto texto={t.apoio} fonte={xf} largura={larguraUtil} altura={90 * u} corpoMaximo={32 * u} entrelinha={1.3} cor="#444444" maxLinhas={2} />
                </div>
              ) : null}
            </div>
            <Foto src={e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
            <div style={flex({ position: "absolute", left: m, top: z.y + z.h + 8 * u, ...estiloDaFonte("Inter-400"), fontSize: 20 * u, color: "#666666" })}>Foto ilustrativa</div>
          </>,
          papel
        );
      }
      const clara = md.fundo === "claro";
      const tx = deitada ? z.w + m : m;
      const ty = deitada ? m : z.y + z.h + Math.round(m * (clara ? 0.7 : 0.75));
      const tw = deitada ? W - z.w - 2 * m : larguraUtil;
      const th = (deitada ? H - 2 * m : H - ty - m) - logoH - 20 * u - (t.apoio ? 100 * u : 0);
      return raiz(
        <>
          <Foto src={e.foto} z={z} raio={clara ? Math.round(28 * u) : 0} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
          <div style={flex({ position: "absolute", left: tx, top: ty, width: tw, flexDirection: "column" })}>
            {!clara && <div style={flex({ width: 110 * u, height: 10 * u, background: acento, marginBottom: 22 * u })} />}
            <Texto texto={t.titulo} fonte={tf} largura={tw} altura={th} corpoMaximo={(clara ? 72 : 80) * u} entrelinha={1.12} cor={tinta} destaque={modoDestaque} corDestaque={acento} palavras={palavras} caixaAlta={caixaAlta} />
            {t.apoio ? (
              <div style={flex({ marginTop: 16 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={tw} altura={90 * u} corpoMaximo={34 * u} entrelinha={1.3} cor={tintaFraca} maxLinhas={2} />
              </div>
            ) : null}
          </div>
          {rodape(fundo, deitada ? "flex-start" : "flex-end")}
        </>
      );
    }

    case "foto-inteira": {
      const caixa = md.id === "capa-reels-com-foto";
      const z = { x: 0, y: 0, w: W, h: H };
      if (caixa) {
        const bw = larguraUtil;
        return raiz(
          <>
            <Foto src={e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
            <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, background: "rgba(0,0,0,0.18)" })} />
            <div style={flex({ position: "absolute", left: m, top: Math.round(H * 0.5 - H * 0.11), width: bw, height: Math.round(H * 0.22), background: acento, alignItems: "center", justifyContent: "center", borderRadius: 18 * u, padding: 30 * u })}>
              <Texto texto={t.titulo} fonte={tf} largura={bw - 60 * u} altura={H * 0.22 - 60 * u} corpoMaximo={150 * u} entrelinha={1.0} cor={sobre(acento)} caixaAlta alinhar="center" />
            </div>
            {rodape("#000000", "center", H - m - logoH * 1.6)}
          </>
        );
      }
      const th = Math.round(H * (alta ? 0.3 : 0.38));
      return raiz(
        <>
          <Foto src={e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 38%, rgba(0,0,0,0) 72%)" })} />
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil })}>
            <Assinatura e={e} fundo="#000000" altura={logoH} />
          </div>
          <div style={flex({ position: "absolute", left: m, bottom: m + (alta ? H * 0.12 : 0), width: larguraUtil, flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={th} corpoMaximo={130 * u} entrelinha={1.05} cor="#ffffff" destaque={modoDestaque} corDestaque={acento} palavras={palavras} caixaAlta={caixaAlta} sombra />
          </div>
        </>,
        "#000000"
      );
    }

    case "foto-profundidade": {
      // O TÍTULO ATRÁS DA PESSOA (03/10). Camadas, de baixo para cima: a foto
      // (desfocada quando há recorte), o tom da marca, a luz de destaque atrás
      // da pessoa, o título gigante, a pessoa recortada e o rodapé. Na prévia
      // (05/10) entra a foto real do cliente já recortada ou uma pessoa de
      // banco recortada; a silhueta preta saiu a pedido do Bruno. O recorte usa
      // "cover", como a foto, para continuar alinhado em qualquer formato.
      const z = { x: 0, y: 0, w: W, h: H };
      const [ar, ag, ab] = rgb(acento);
      const temRecorte = Boolean(e.recorte);
      const tituloTop = Math.round(m * 1.1);
      const tituloAltura = Math.round(H * (alta ? 0.3 : 0.36));
      const baseH = Math.round(H * (alta ? 0.22 : 0.26));
      return raiz(
        <>
          {e.fundoDesfocado || e.foto ? <Foto src={e.fundoDesfocado ?? e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} /> : null}
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `linear-gradient(180deg, ${rgba(escuro, 0.82)} 0%, ${rgba(escuro, 0.35)} 42%, ${rgba(escuro, 0.25)} 62%, ${rgba(escuro, 0.9)} 100%)` })} />
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: `radial-gradient(circle at 50% ${alta ? 52 : 58}%, rgba(${ar},${ag},${ab},0.55) 0%, rgba(${ar},${ag},${ab},0.18) 30%, rgba(${ar},${ag},${ab},0) 55%)` })} />
          <div style={flex({ position: "absolute", left: m * 0.6, top: tituloTop, width: W - m * 1.2, justifyContent: "center" })}>
            <Texto texto={t.titulo} fonte={tf} largura={W - m * 1.2} altura={tituloAltura} corpoMaximo={250 * u} corpoMinimo={60 * u} entrelinha={0.98} cor="#ffffff" destaque={modoDestaque === "sublinhado" ? "cor" : modoDestaque} corDestaque={acento} palavras={palavras} caixaAlta={caixaAlta} alinhar="center" maxLinhas={3} />
          </div>
          {temRecorte ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.recorte!} alt="" width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" }} />
          ) : null}
          <div style={flex({ position: "absolute", left: 0, top: H - baseH, width: W, height: baseH, backgroundImage: `linear-gradient(180deg, ${rgba(escuro, 0)} 0%, ${rgba(escuro, 0.92)} 70%)` })} />
          <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 1.6 - (t.apoio ? 110 * u : 0) - (alta ? H * 0.08 : 0), width: larguraUtil, flexDirection: "column", alignItems: "center" })}>
            {t.apoio ? (
              <div style={flex({ marginBottom: 22 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={larguraUtil} altura={96 * u} corpoMaximo={38 * u} entrelinha={1.25} cor="#ffffff" maxLinhas={2} alinhar="center" sombra />
              </div>
            ) : null}
            <Assinatura e={e} fundo="#000000" altura={logoH} alinhar="center" />
          </div>
          {e.pagina && e.pagina.total > 1 ? (
            <div style={flex({ position: "absolute", left: m, top: m * 0.45 })}>
              <Pontos e={e} cor={acento} apagado="rgba(255,255,255,0.35)" u={u} />
            </div>
          ) : null}
        </>,
        escuro
      );
    }

    case "foto-lado": {
      const z = zonaDaFoto(md, W, H)!;
      const vertical = alta;
      const tx = vertical ? m : z.w + m * 0.8;
      const ty = vertical ? z.h + m : m;
      const tw = vertical ? larguraUtil : W - z.w - m * 1.8;
      const th = (vertical ? H - z.h - 2 * m : H - 2 * m) - logoH - 40 * u - (t.apoio ? 150 * u : 0);
      return raiz(
        <>
          <Foto src={e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
          <div style={flex({ position: "absolute", left: tx, top: ty, width: tw, height: vertical ? H - z.h - 2 * m : H - 2 * m, flexDirection: "column", justifyContent: "center" })}>
            <div style={flex({ width: 90 * u, height: 8 * u, background: acento, marginBottom: 26 * u })} />
            <Texto texto={t.titulo} fonte={tf} largura={tw} altura={th} corpoMaximo={78 * u} entrelinha={1.12} cor={tinta} destaque={modoDestaque} corDestaque={acento} palavras={palavras} />
            {t.apoio ? (
              <div style={flex({ marginTop: 22 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={tw} altura={140 * u} corpoMaximo={32 * u} entrelinha={1.35} cor={tintaFraca} maxLinhas={4} />
              </div>
            ) : null}
          </div>
          <div style={flex({ position: "absolute", left: tx, top: H - m - logoH })}>
            <Assinatura e={e} fundo={fundo} altura={logoH} />
          </div>
        </>
      );
    }

    case "frase":
    case "marca-texto":
    case "tipografia":
    case "capa-tipografica": {
      const centro = md.id === "frase-fundo-escuro" || md.id === "frase-fundo-cor" || md.arquetipo === "capa-tipografica";
      const tipo = md.arquetipo === "tipografia" || md.arquetipo === "capa-tipografica";
      const corpo = tipo ? 300 * u : md.arquetipo === "marca-texto" ? 92 * u : 96 * u;
      const altura = alta && md.arquetipo === "capa-tipografica" ? Math.round(H * 0.4) : H - 2 * m - logoH * 2.6;
      const top = alta && md.arquetipo === "capa-tipografica" ? Math.round(H * 0.3) : m + logoH * 0.6;
      const corDest = md.id === "frase-fundo-cor" ? tinta : acento;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top, width: larguraUtil, height: altura, flexDirection: "column", justifyContent: "center", alignItems: centro ? "center" : "flex-start" })}>
            {md.id === "quadro-branco-minimalista" && <div style={flex({ width: 90 * u, height: 8 * u, background: acento, marginBottom: 40 * u })} />}
            <Texto
              texto={t.titulo}
              fonte={tf}
              largura={larguraUtil}
              altura={altura - (md.id === "quadro-branco-minimalista" ? 50 * u : 0)}
              corpoMaximo={corpo}
              entrelinha={tipo ? 1.02 : 1.16}
              cor={tinta}
              alinhar={centro ? "center" : "left"}
              caixaAlta={caixaAlta}
              destaque={modoDestaque}
              corDestaque={corDest}
              palavras={palavras}
            />
          </div>
          {md.arquetipo === "capa-tipografica" && (
            <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: m, justifyContent: "center", ...estiloDaFonte(xf), fontSize: 30 * u, color: tintaFraca, letterSpacing: 6 * u })}>{e.marca.toUpperCase()}</div>
          )}
          {rodape(fundo, centro ? "center" : "flex-start")}
        </>
      );
    }

    case "caderno": {
      const passo = Math.round(84 * u);
      const linhas = Math.ceil(H / passo);
      const tinta2 = misturar(escuro, "#1d2b53", 0.3);
      const topo = Math.round(m * 1.6);
      const enc = encaixar({ texto: t.titulo, fonte: tf, largura: larguraUtil - 60 * u, altura: H - topo - m - logoH * 2, entrelinha: 1, corpoMaximo: passo * 1.05, corpoMinimo: Math.round(passo * 0.5) });
      // A letra assenta na pauta: a entrelinha é a própria pauta.
      const entrelinha = (passo * Math.max(1, Math.round(enc.corpo / passo + 0.4))) / enc.corpo;
      return raiz(
        <>
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} style={flex({ position: "absolute", left: 0, top: topo + i * passo + passo - 6 * u, width: W, height: 2 * u, background: "rgba(70,110,170,0.22)" })} />
          ))}
          <div style={flex({ position: "absolute", left: m - 22 * u, top: 0, width: 3 * u, height: H, background: rgba(acento, 0.55) })} />
          <div style={flex({ position: "absolute", left: m + 20 * u, top: topo + 4 * u, width: larguraUtil - 40 * u, flexDirection: "column" })}>
            <Linhas enc={enc} fonte={tf} cor={tinta2} entrelinha={entrelinha} destaque="sublinhado" corDestaque={acento} palavras={palavras} />
          </div>
          {rodape("#ffffff", "flex-end")}
        </>,
        "#ffffff"
      );
    }

    case "citacao": {
      const escura = md.fundo === "escuro";
      const centro = escura;
      const aspa = Math.round(260 * u);
      const alturaTexto = H - 2 * m - aspa * 0.6 - 160 * u;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: H - 2 * m, flexDirection: "column", justifyContent: "center", alignItems: centro ? "center" : "flex-start" })}>
            <div style={flex({ ...estiloDaFonte("PlayfairDisplay-700"), fontSize: aspa, lineHeight: 0.8, height: aspa * 0.55, color: acento })}>“</div>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={alturaTexto} corpoMaximo={76 * u} entrelinha={1.22} cor={tinta} alinhar={centro ? "center" : "left"} />
            <div style={flex({ width: 80 * u, height: 5 * u, background: acento, marginTop: 36 * u, marginBottom: 18 * u })} />
            {t.autor ? <div style={flex({ ...estiloDaFonte(xf), fontSize: 28 * u, letterSpacing: 4 * u, color: escura ? acento : tintaFraca })}>{t.autor.toUpperCase()}</div> : null}
          </div>
          {rodape(fundo, "flex-end", H - m * 0.7 - logoH)}
        </>
      );
    }

    case "verbete": {
      const tinta2 = "#1a1a1a";
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: m, justifyContent: "space-between", alignItems: "center", ...estiloDaFonte("Inter-400"), fontSize: 24 * u, color: "#6b6b6b", letterSpacing: 3 * u })}>
            <span>{e.marca.toUpperCase()}</span>
            <span>DICIONÁRIO</span>
          </div>
          <div style={flex({ position: "absolute", left: m, top: m + 46 * u, width: larguraUtil, height: 2 * u, background: "#2a2a2a" })} />
          <div style={flex({ position: "absolute", left: m, top: Math.round(H * 0.22), width: larguraUtil, flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={260 * u} corpoMaximo={130 * u} entrelinha={1.05} cor={tinta2} maxLinhas={2} />
            <div style={flex({ marginTop: 18 * u, alignItems: "baseline" })}>
              <span style={{ ...estiloDaFonte("PlayfairDisplay-400i"), fontSize: 38 * u, color: "#6b6b6b", marginRight: 22 * u }}>substantivo</span>
            </div>
            <div style={flex({ marginTop: 40 * u })}>
              <div style={flex({ ...estiloDaFonte("PlayfairDisplay-700"), fontSize: 48 * u, color: acento, marginRight: 22 * u, lineHeight: 1.2 })}>1.</div>
              <Texto texto={t.apoio ?? ""} fonte={xf} largura={larguraUtil - 70 * u} altura={H * 0.4} corpoMaximo={46 * u} entrelinha={1.38} cor={tinta2} />
            </div>
          </div>
          {rodape(papel, "flex-start")}
        </>,
        papel
      );
    }

    case "lista":
    case "checklist":
    case "passos": {
      const itens = (t.itens ?? []).slice(0, md.arquetipo === "passos" ? 4 : 5);
      const n = Math.max(1, itens.length);
      const tituloH = Math.round(H * (alta ? 0.2 : 0.24));
      const topoItens = m + tituloH + 30 * u;
      const espacoItens = H - topoItens - m - logoH * 1.8;
      const altItem = espacoItens / n;
      const card = md.arquetipo === "checklist";
      const larguraItem = larguraUtil - (card ? 180 * u : 140 * u);
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: tituloH, alignItems: "flex-end" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={72 * u} entrelinha={1.1} cor={tinta} caixaAlta={caixaAlta} />
          </div>
          {card && <div style={flex({ position: "absolute", left: m, top: topoItens - 20 * u, width: larguraUtil, height: espacoItens + 20 * u, background: "#ffffff", borderRadius: 32 * u, boxShadow: "0 18px 50px rgba(0,0,0,0.10)" })} />}
          {md.arquetipo === "passos" && n > 1 && (
            <div style={flex({ position: "absolute", left: m + 28 * u, top: topoItens + altItem * 0.3, width: 4 * u, height: altItem * (n - 1), background: rgba(acento, 0.6) })} />
          )}
          {itens.map((it, i) => {
            const y = topoItens + i * altItem;
            const marcador =
              md.arquetipo === "lista" ? (
                <div style={flex({ width: 120 * u, ...estiloDaFonte(tf), fontSize: 76 * u, lineHeight: 1, color: acento })}>{String(i + 1).padStart(2, "0")}</div>
              ) : md.arquetipo === "checklist" ? (
                <div style={flex({ width: 64 * u, height: 64 * u, borderRadius: 14 * u, background: acento, alignItems: "center", justifyContent: "center", marginLeft: 36 * u, marginRight: 40 * u })}>
                  <Icone tipo="check" cor={sobre(acento)} tam={44 * u} />
                </div>
              ) : (
                <div style={flex({ width: 60 * u, height: 60 * u, borderRadius: 999, background: acento, alignItems: "center", justifyContent: "center", marginRight: 50 * u, ...estiloDaFonte("SpaceGrotesk-700"), fontSize: 30 * u, color: sobre(acento) })}>{i + 1}</div>
              );
            return (
              <div key={i} style={flex({ position: "absolute", left: m, top: y, width: larguraUtil, height: altItem, alignItems: "center" })}>
                {marcador}
                <div style={flex({ flexDirection: "column" })}>
                  {md.arquetipo === "passos" && <div style={flex({ ...estiloDaFonte("SpaceGrotesk-700"), fontSize: 24 * u, color: acento, letterSpacing: 3 * u, marginBottom: 6 * u })}>{`PASSO ${i + 1}`}</div>}
                  <Texto texto={it} fonte={xf} largura={larguraItem} altura={altItem * 0.8} corpoMaximo={44 * u} entrelinha={1.2} cor={card ? "#1c1c1c" : tinta} maxLinhas={2} />
                </div>
                {md.arquetipo === "lista" && i < n - 1 && <div style={flex({ position: "absolute", left: 0, right: 0, bottom: 0, height: 2 * u, background: rgba(tinta, 0.12) })} />}
              </div>
            );
          })}
          {rodape(fundo, "flex-end")}
        </>
      );
    }

    case "dois-lados": {
      const l = t.lados ?? { rotulos: ["Antes", "Depois"] as [string, string], esquerda: [], direita: [] };
      if (md.id === "mito-ou-verdade") {
        const bloco = (rot: string, texto: string, y: number, h: number, ativo: boolean) => (
          <div style={flex({ position: "absolute", left: m, top: y, width: larguraUtil, height: h, flexDirection: "column", justifyContent: "center" })}>
            <div style={flex({ alignItems: "center", marginBottom: 22 * u })}>
              <div style={flex({ padding: `${10 * u}px ${26 * u}px`, borderRadius: 999, background: ativo ? acento : "rgba(255,255,255,0.16)", color: ativo ? sobre(acento) : "#d0d0d0", ...estiloDaFonte(tf), fontSize: 34 * u, letterSpacing: 2 * u })}>{rot.toUpperCase()}</div>
              <div style={flex({ marginLeft: 18 * u })}>
                <Icone tipo={ativo ? "check" : "x"} cor={ativo ? acento : "#9a9a9a"} tam={48 * u} />
              </div>
            </div>
            <Texto texto={texto} fonte={ativo ? tf : xf} largura={larguraUtil} altura={h - 90 * u} corpoMaximo={(ativo ? 70 : 52) * u} entrelinha={1.15} cor={ativo ? "#ffffff" : "#a9a9a9"} />
          </div>
        );
        const meio = Math.round(H * 0.48);
        return raiz(
          <>
            <div style={flex({ position: "absolute", left: m, top: m, ...estiloDaFonte(tf), fontSize: 44 * u, color: "#ffffff" })}>{t.titulo}</div>
            {bloco(l.rotulos[0], l.esquerda.join(" "), m + 90 * u, meio - m - 110 * u, false)}
            <div style={flex({ position: "absolute", left: m, top: meio, width: larguraUtil, height: 2 * u, background: "rgba(255,255,255,0.18)" })} />
            {bloco(l.rotulos[1], l.direita.join(" "), meio + 30 * u, H - meio - m - logoH * 2 - 30 * u, true)}
            {rodape(fundo, "flex-end")}
          </>
        );
      }
      const empilhar = alta;
      const tituloH = Math.round(H * 0.18);
      const topo = m + tituloH + 30 * u;
      const areaH = H - topo - m - logoH * 1.8;
      const gap = 24 * u;
      const colW = empilhar ? larguraUtil : (larguraUtil - gap) / 2;
      const colH = empilhar ? (areaH - gap) / 2 : areaH;
      const coluna = (i: 0 | 1) => {
        const ativo = i === 1;
        const itens = (i === 0 ? l.esquerda : l.direita).slice(0, 3);
        const evite = md.id === "isso-ou-aquilo";
        const bg = evite ? (ativo ? rgba(acento, 0.1) : "#f2f2f2") : ativo ? acento : misturar(claro, "#bdbdbd", 0.35);
        const cor = evite ? "#1c1c1c" : ativo ? sobre(acento) : "#555555";
        const x = m + (empilhar ? 0 : i * (colW + gap));
        const y = topo + (empilhar ? i * (colH + gap) : 0);
        const itemH = (colH - 130 * u) / Math.max(1, itens.length);
        return (
          <div key={i} style={flex({ position: "absolute", left: x, top: y, width: colW, height: colH, background: bg, borderRadius: 28 * u, padding: 36 * u, flexDirection: "column", border: evite && ativo ? `${3 * u}px solid ${acento}` : undefined })}>
            <div style={flex({ ...estiloDaFonte(tf), fontSize: 40 * u, color: evite ? (ativo ? acento : "#6b6b6b") : cor, letterSpacing: 2 * u, marginBottom: 26 * u })}>{l.rotulos[i].toUpperCase()}</div>
            {itens.map((it, k) => (
              <div key={k} style={flex({ alignItems: "flex-start", height: itemH })}>
                <div style={flex({ marginRight: 14 * u, marginTop: 4 * u })}>
                  <Icone tipo={ativo ? "check" : "x"} cor={evite ? (ativo ? acento : "#8a8a8a") : cor} tam={36 * u} />
                </div>
                <Texto texto={it} fonte={xf} largura={colW - 72 * u - 50 * u} altura={itemH} corpoMaximo={46 * u} entrelinha={1.2} cor={cor} maxLinhas={3} />
              </div>
            ))}
          </div>
        );
      };
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: tituloH, alignItems: "flex-end" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={80 * u} entrelinha={1.08} cor={tinta} />
          </div>
          {coluna(0)}
          {coluna(1)}
          {!empilhar && (
            <div style={flex({ position: "absolute", left: W / 2 - 36 * u, top: topo + areaH / 2 - 36 * u, width: 72 * u, height: 72 * u, borderRadius: 999, background: "#ffffff", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" })}>
              <Icone tipo="seta" cor={acento} tam={22 * u} />
            </div>
          )}
          {rodape(fundo, "flex-end")}
        </>
      );
    }

    case "dado": {
      const numero = t.numero ?? palavraDeDestaque(t.titulo);
      const numAlt = Math.round(H * 0.34);
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: H - 2 * m - logoH * 1.5, flexDirection: "column", justifyContent: "center" })}>
            <Texto texto={numero} fonte={tf} largura={larguraUtil} altura={numAlt} corpoMaximo={420 * u} entrelinha={1.0} cor={acento} maxLinhas={1} />
            <div style={flex({ width: 120 * u, height: 8 * u, background: "#ffffff", marginTop: 24 * u, marginBottom: 34 * u })} />
            <Texto texto={t.titulo} fonte={xf} largura={larguraUtil} altura={H * 0.28} corpoMaximo={58 * u} entrelinha={1.2} cor="#ffffff" />
          </div>
          {rodape(fundo, "flex-start")}
        </>
      );
    }

    case "dado-barra": {
      const numero = t.numero ?? (t.titulo.match(/\d+[.,]?\d*\s*%/)?.[0] ?? "");
      const pct = Math.max(2, Math.min(100, parseFloat(numero.replace(",", ".")) || 0));
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil, height: H - 2 * m - logoH * 1.5, flexDirection: "column", justifyContent: "center" })}>
            <Texto texto={numero} fonte={tf} largura={larguraUtil} altura={H * 0.26} corpoMaximo={300 * u} entrelinha={1.0} cor={escuro} maxLinhas={1} />
            <div style={flex({ width: larguraUtil, height: 56 * u, borderRadius: 999, background: rgba(escuro, 0.1), marginTop: 30 * u, marginBottom: 44 * u })}>
              <div style={flex({ width: (larguraUtil * pct) / 100, height: 56 * u, borderRadius: 999, background: acento })} />
            </div>
            <Texto texto={t.titulo} fonte={xf} largura={larguraUtil} altura={H * 0.26} corpoMaximo={54 * u} entrelinha={1.25} cor={tinta} />
          </div>
          {rodape(fundo, "flex-start")}
        </>
      );
    }

    case "print-post": {
      const cw = larguraUtil;
      const avatar = 96 * u;
      const pad = 48 * u;
      const corpoH = H * (alta ? 0.4 : 0.42);
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: 0, width: cw, height: H, alignItems: "center" })}>
            <div style={flex({ width: cw, background: "#ffffff", borderRadius: 36 * u, padding: pad, flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.22)" })}>
              <div style={flex({ alignItems: "center", marginBottom: 32 * u })}>
                <div style={flex({ width: avatar, height: avatar, borderRadius: 999, background: e.logo ? "#ffffff" : acento, border: `${2 * u}px solid #e6e6e6`, alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 24 * u })}>
                  {e.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.logo} alt="" width={avatar * 0.72} height={avatar * 0.72} style={{ width: avatar * 0.72, height: avatar * 0.72, objectFit: "contain" }} />
                  ) : (
                    <span style={{ ...estiloDaFonte("Inter-700"), fontSize: 44 * u, color: sobre(acento) }}>{e.marca.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div style={flex({ flexDirection: "column" })}>
                  <div style={flex({ ...estiloDaFonte(xf), fontSize: 36 * u, color: "#111111" })}>{e.marca}</div>
                  <div style={flex({ ...estiloDaFonte("Inter-400"), fontSize: 30 * u, color: "#71767b" })}>{e.arroba ?? `@${e.marca.toLowerCase().replace(/[^a-z0-9]/g, "")}`}</div>
                </div>
              </div>
              <Texto texto={t.titulo} fonte={tf} largura={cw - 2 * pad} altura={corpoH} corpoMaximo={54 * u} entrelinha={1.32} cor="#0f1419" />
              <div style={flex({ height: 2 * u, background: "#eff3f4", marginTop: 34 * u, marginBottom: 22 * u })} />
              <div style={flex({ ...estiloDaFonte("Inter-400"), fontSize: 26 * u, color: "#71767b" })}>agora</div>
            </div>
          </div>
        </>
      );
    }

    case "print-conversa": {
      const bw = larguraUtil * 0.8;
      const balao = (texto: string, minha: boolean, y: number, h: number) => (
        <div style={flex({ position: "absolute", top: y, left: minha ? W - m - bw : m, width: bw, justifyContent: minha ? "flex-end" : "flex-start" })}>
          <div style={flex({ background: minha ? acento : "#ffffff", borderRadius: 34 * u, borderBottomRightRadius: minha ? 8 * u : 34 * u, borderBottomLeftRadius: minha ? 34 * u : 8 * u, padding: `${30 * u}px ${36 * u}px`, boxShadow: "0 8px 22px rgba(0,0,0,0.08)" })}>
            <Texto texto={texto} fonte={minha ? tf : tf} largura={bw - 72 * u} altura={h} corpoMaximo={44 * u} entrelinha={1.3} cor={minha ? sobre(acento) : "#1c1c1c"} />
          </div>
        </div>
      );
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: 150 * u, background: escuro, alignItems: "center", paddingLeft: m })}>
            <div style={flex({ width: 84 * u, height: 84 * u, borderRadius: 999, background: "#ffffff", alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 22 * u })}>
              {e.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.logo} alt="" width={60 * u} height={60 * u} style={{ width: 60 * u, height: 60 * u, objectFit: "contain" }} />
              ) : (
                <span style={{ ...estiloDaFonte("Inter-700"), fontSize: 38 * u, color: escuro }}>{e.marca.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div style={flex({ flexDirection: "column" })}>
              <div style={flex({ ...estiloDaFonte(xf), fontSize: 34 * u, color: "#ffffff" })}>{e.marca}</div>
              <div style={flex({ ...estiloDaFonte("Inter-400"), fontSize: 24 * u, color: "rgba(255,255,255,0.7)" })}>online</div>
            </div>
          </div>
          {balao(t.titulo, false, 230 * u, H * 0.22)}
          {balao(t.apoio ?? "", true, Math.round(H * 0.46), H * 0.32)}
        </>,
        misturar(claro, "#e9e4dc", 0.4)
      );
    }

    case "depoimento": {
      const cw = larguraUtil;
      const pad = 56 * u;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: 0, width: cw, height: H - logoH * 1.4, alignItems: "center" })}>
            <div style={flex({ width: cw, background: "#ffffff", borderRadius: 36 * u, padding: pad, flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.10)" })}>
              <div style={flex({ marginBottom: 30 * u })}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} style={flex({ marginRight: 8 * u })}>
                    <Icone tipo="estrela" cor={acento} tam={56 * u} />
                  </div>
                ))}
              </div>
              <Texto texto={`“${t.titulo}”`} fonte={tf} largura={cw - 2 * pad} altura={H * 0.42} corpoMaximo={52 * u} entrelinha={1.35} cor="#1c1c1c" />
              {t.autor ? <div style={flex({ marginTop: 30 * u, ...estiloDaFonte(xf), fontSize: 30 * u, color: acento })}>{t.autor}</div> : null}
            </div>
          </div>
          {rodape(fundo, "center")}
        </>
      );
    }

    case "oferta": {
      const tituloH = H * 0.36;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil })}>
            <Assinatura e={e} fundo={fundo} altura={logoH} />
          </div>
          <div style={flex({ position: "absolute", left: m, top: 0, width: larguraUtil, height: H, flexDirection: "column", justifyContent: "center" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={92 * u} entrelinha={1.08} cor="#ffffff" destaque={modoDestaque} corDestaque={acento} palavras={palavras} />
            {t.apoio ? (
              <div style={flex({ marginTop: 26 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={larguraUtil} altura={120 * u} corpoMaximo={36 * u} entrelinha={1.3} cor="rgba(255,255,255,0.75)" maxLinhas={3} />
              </div>
            ) : null}
            {t.chamada ? (
              <div style={flex({ marginTop: 56 * u })}>
                <div style={flex({ background: acento, borderRadius: 999, padding: `${26 * u}px ${48 * u}px`, alignItems: "center" })}>
                  <span style={{ ...estiloDaFonte(tf), fontSize: 40 * u, color: sobre(acento), marginRight: 22 * u }}>{t.chamada}</span>
                  <Icone tipo="seta" cor={sobre(acento)} tam={24 * u} />
                </div>
              </div>
            ) : null}
          </div>
        </>
      );
    }

    case "caixa-pergunta": {
      const cw = Math.round(W * 0.8);
      const x = (W - cw) / 2;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: x, top: 0, width: cw, height: H, alignItems: "center" })}>
            <div style={flex({ width: cw, background: "#ffffff", borderRadius: 40 * u, flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" })}>
              <div style={flex({ background: escuro, padding: 48 * u, justifyContent: "center" })}>
                <Texto texto={t.titulo} fonte={tf} largura={cw - 96 * u} altura={H * 0.24} corpoMaximo={96 * u} entrelinha={1.15} cor="#ffffff" alinhar="center" />
              </div>
              <div style={flex({ padding: 40 * u })}>
                <div style={flex({ width: cw - 80 * u, background: "#f1f1f1", borderRadius: 24 * u, padding: `${34 * u}px ${30 * u}px`, ...estiloDaFonte(xf), fontSize: 44 * u, color: "#8a8a8a", justifyContent: "center" })}>Escreva sua resposta</div>
              </div>
            </div>
          </div>
          {rodape(acento, "center", H - m - logoH * 2.2)}
        </>
      );
    }

    case "enquete": {
      const opcoes = t.opcoes ?? ["Sim", "Não"];
      const top = Math.round(H * (alta ? 0.28 : 0.2));
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top, width: larguraUtil, flexDirection: "column", alignItems: "center" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={H * 0.26} corpoMaximo={84 * u} entrelinha={1.1} cor="#ffffff" alinhar="center" />
            {opcoes.map((o, i) => (
              <div key={i} style={flex({ width: larguraUtil, marginTop: (i ? 26 : 70) * u, padding: `${34 * u}px ${44 * u}px`, borderRadius: 999, background: i === 0 ? acento : "#ffffff", justifyContent: "center", ...estiloDaFonte(xf), fontSize: 42 * u, color: i === 0 ? sobre(acento) : "#1c1c1c" })}>
                {o}
              </div>
            ))}
          </div>
          {rodape(fundo, "center")}
        </>
      );
    }

    case "capa-carrossel": {
      const capa = !e.pagina || e.pagina.i === 0;
      const tituloH = H * 0.46;
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: m, top: m, width: larguraUtil })}>
            <Assinatura e={e} fundo={fundo} altura={logoH} />
          </div>
          <div style={flex({ position: "absolute", left: m, top: m + logoH + 60 * u, width: larguraUtil, flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tituloH} corpoMaximo={104 * u} entrelinha={1.1} cor={tinta} destaque={modoDestaque} corDestaque={acento} palavras={palavras} />
            {t.apoio ? (
              <div style={flex({ marginTop: 30 * u })}>
                <Texto texto={t.apoio} fonte={xf} largura={larguraUtil} altura={120 * u} corpoMaximo={36 * u} entrelinha={1.3} cor={tintaFraca} maxLinhas={3} />
              </div>
            ) : null}
          </div>
          <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: H - m - 60 * u, justifyContent: "space-between", alignItems: "center" })}>
            <Pontos e={e} cor={acento} apagado={rgba(tinta, 0.18)} u={u} />
            <div style={flex({ alignItems: "center", ...estiloDaFonte(xf), fontSize: 32 * u, color: tinta })}>
              <span style={{ marginRight: 16 * u }}>{capa ? "Arraste" : `${(e.pagina?.i ?? 0) + 1}/${e.pagina?.total ?? 1}`}</span>
              <Icone tipo="seta" cor={acento} tam={28 * u} />
            </div>
          </div>
        </>
      );
    }

    case "polaroid": {
      const z = zonaDaFoto(md, W, H)!;
      const pad = Math.round(30 * u);
      const base = Math.round(z.h * 0.42);
      return raiz(
        <>
          <div style={flex({ position: "absolute", left: z.x - pad, top: z.y - pad, width: z.w + 2 * pad, height: z.h + pad + base, background: "#ffffff", transform: "rotate(-3deg)", boxShadow: "0 30px 60px rgba(0,0,0,0.30)", flexDirection: "column", alignItems: "center", padding: pad })}>
            <div style={flex({ width: z.w, height: z.h, background: tomDaFoto, overflow: "hidden" })}>
              {e.foto
                ? imagemTratada(
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.foto} alt="" width={z.w} height={z.h} style={{ width: z.w, height: z.h, objectFit: "cover" }} />,
                    e.tratamento,
                    acento
                  )
                : null}
            </div>
            <div style={flex({ marginTop: 18 * u, width: z.w, height: base - pad - 18 * u, alignItems: "center", justifyContent: "center" })}>
              <Texto texto={t.titulo} fonte={tf} largura={z.w} altura={base - pad - 30 * u} corpoMaximo={80 * u} entrelinha={1.05} cor="#222222" alinhar="center" />
            </div>
          </div>
          {rodape(acento, "flex-end")}
        </>,
        acento
      );
    }

    case "colagem": {
      const z = zonaDaFoto(md, W, H)!;
      const borda = Math.round(16 * u);
      const z2 = deitada
        ? { x: Math.round(W * 0.3), y: Math.round(H * 0.3), w: Math.round(W * 0.26), h: Math.round(H * 0.5) }
        : { x: Math.round(W * 0.42), y: Math.round(H * 0.3), w: Math.round(W * 0.48), h: Math.round(H * 0.26) };
      const fita = (x: number, y: number, rot: number) => (
        <div style={flex({ position: "absolute", left: x, top: y, width: 150 * u, height: 46 * u, background: rgba(misturar(acento, "#ffffff", 0.55), 0.8), transform: `rotate(${rot}deg)` })} />
      );
      const foto = (zz: Zona, rot: number, pos: string) => (
        <div style={flex({ position: "absolute", left: zz.x - borda, top: zz.y - borda, padding: borda, background: "#ffffff", transform: `rotate(${rot}deg)`, boxShadow: "0 16px 36px rgba(0,0,0,0.25)" })}>
          <div style={flex({ width: zz.w, height: zz.h, overflow: "hidden", background: tomDaFoto })}>
            {e.foto
              ? imagemTratada(
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.foto} alt="" width={zz.w} height={zz.h} style={{ width: zz.w, height: zz.h, objectFit: "cover", objectPosition: pos }} />,
                  e.tratamento,
                  acento
                )
              : null}
          </div>
        </div>
      );
      const textoTop = deitada ? m : Math.round(H * 0.62);
      const textoX = deitada ? Math.round(W * 0.6) : m;
      const textoW = deitada ? W - textoX - m : larguraUtil;
      const enc = encaixar({ texto: t.titulo.toUpperCase(), fonte: tf, largura: textoW - 40 * u, altura: (deitada ? H - 2 * m : H - textoTop - m - logoH) - 40 * u, entrelinha: 1.4, corpoMaximo: 78 * u, folga: 0.5 });
      const marcadas = new Set(palavras.map((w) => w.toUpperCase()));
      return raiz(
        <>
          {foto(z, -4, "center")}
          {foto(z2, 5, "right")}
          {fita(z.x + z.w * 0.35, z.y - 34 * u, -6)}
          {fita(z2.x + z2.w * 0.5, z2.y + z2.h - 4 * u, 8)}
          <div style={flex({ position: "absolute", left: textoX, top: textoTop, width: textoW, flexDirection: "column", alignItems: "flex-start" })}>
            {enc.linhas.map((l, li) => (
              <div key={li} style={flex({ background: "#ffffff", padding: `${4 * u}px ${18 * u}px`, marginBottom: 12 * u, transform: `rotate(${li % 2 ? 0.9 : -0.9}deg)`, boxShadow: "0 6px 16px rgba(0,0,0,0.14)", whiteSpace: "nowrap", ...estiloDaFonte(tf), fontSize: enc.corpo, lineHeight: 1.25, color: "#151515" })}>
                {l.split(" ").map((w, wi, arr) =>
                  marcadas.has(w) ? (
                    <span key={wi} style={{ ...estiloDaFonte(md.tipografia.texto), color: acento, marginRight: wi < arr.length - 1 ? larguraDoTexto(" ", tf) * enc.corpo : 0 }}>
                      {w}
                    </span>
                  ) : (
                    <span key={wi} style={{ marginRight: wi < arr.length - 1 ? larguraDoTexto(" ", tf) * enc.corpo : 0 }}>
                      {w}
                    </span>
                  )
                )}
              </div>
            ))}
          </div>
          {rodape(papel, "flex-end")}
        </>,
        papel
      );
    }

    case "revista": {
      const z = { x: 0, y: 0, w: W, h: H };
      const itens = (t.itens ?? []).slice(0, 2);
      return raiz(
        <>
          <Foto src={e.foto} z={z} cor={tomDaFoto} tratamento={e.tratamento} destaque={acento} />
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.85) 100%)" })} />
          <div style={flex({ position: "absolute", left: m, top: m * 0.8, width: larguraUtil, justifyContent: "center" })}>
            <Texto texto={e.marca} fonte={tf} largura={larguraUtil} altura={220 * u} corpoMaximo={210 * u} entrelinha={1.0} cor={acento} maxLinhas={1} alinhar="center" />
          </div>
          <div style={flex({ position: "absolute", left: m, bottom: m + (alta ? H * 0.1 : 0), width: larguraUtil, flexDirection: "column" })}>
            {itens.map((it, i) => (
              <div key={i} style={flex({ alignItems: "center", marginBottom: 14 * u })}>
                <div style={flex({ width: 36 * u, height: 8 * u, background: acento, marginRight: 16 * u })} />
                <div style={flex({ ...estiloDaFonte(xf), fontSize: 32 * u, color: "#ffffff", textShadow: "0 2px 10px rgba(0,0,0,0.5)" })}>{it}</div>
              </div>
            ))}
            <div style={flex({ marginTop: 18 * u })}>
              <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={H * 0.26} corpoMaximo={96 * u} entrelinha={1.06} cor="#ffffff" sombra />
            </div>
          </div>
        </>,
        "#000000"
      );
    }
  }
  return raiz(null);
}
