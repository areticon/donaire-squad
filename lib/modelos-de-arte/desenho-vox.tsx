import type { ReactNode } from "react";
import { estiloDaFonte, type FonteId } from "@/lib/modelos-de-arte/fontes";
import type { ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import type { EntradaDoDesenho, Zona } from "@/lib/modelos-de-arte/desenho";
import { Assinatura, Imagem, Pessoa, Seta, Texto, Vazio, Vinheta, base, contrasteEntre, efeitoDoModelo, flex, misturar, rgba, sobre } from "@/lib/modelos-de-arte/pecas-do-desenho";
import { CONTRASTE_MINIMO_DO_TEXTO } from "@/lib/modelos-de-arte/identidade";
import { efeitoComAjustes } from "@/lib/modelos-de-arte/ajustes-da-peca";

/**
 * A FAMÍLIA "VOX / COLAGEM EDITORIAL" DO BOOK (05/10/2026), para posts.
 *
 * O Bruno não achou o estilo Vox no book. A régua é o feed dele
 * (docs/overlays/referencias/vox-posts/bruno-0510): papel cinza-claro com
 * textura, título em condensada preta muito grande com UMA palavra na cor de
 * destaque, foto preto e branco em meio-tom (halftone) recortada, uma faixa de
 * papel rasgado na cor de destaque, infográfico em papel com ícones a traço. E
 * a colagem Vox clássica: jornal amarelado, marca-texto, recortes com borda de
 * papel, setas tracejadas, círculo à mão, carimbo, rosto em pedaços de jornal e
 * o logotipo num selo.
 *
 * Tudo aqui é desenhado em código e SVG (data URI): a textura do papel são
 * fibras e pintas semeadas; o jornal são colunas de linhas cinzas sem letra
 * (nada legível, para a conferência da arte não achar palavra estranha); o
 * meio-tom é uma trama de pontos por cima da foto. Nada pago, nada de IA e
 * nenhuma pessoa real: a foto do cliente quando ele tem, senão as pessoas
 * fictícias do banco. O preto e branco segue a regra dos modelos com foto
 * (filtro CSS na prévia, sharp no servidor, por `fotoPretoEBranco`).
 *
 * As cores vêm da identidade aprovada: o destaque entra no lugar do amarelo
 * Vox; sem destaque nenhum, vale o amarelo. O papel e o jornal são o desenho
 * (como o "papel" dos modelos de jornal e verbete) e ficam.
 *
 * Mesma regra do desenho principal: uma função para a prévia e para o Satori.
 * Puro: sem banco, sem fs, sem sharp. Componente de cliente pode importar.
 */

export const ARQUETIPOS_VOX: ReadonlySet<ModeloDeArte["arquetipo"]> = new Set<ModeloDeArte["arquetipo"]>([
  "vox-faixa",
  "vox-foto-rasgada",
  "vox-jornal",
  "vox-antes-depois",
  "vox-rosto",
  "vox-capa",
  "vox-infografico",
  "vox-carimbo",
]);

/** O texto fixo que estes modelos desenham, para a conferência saber que é do código. */
export const TEXTO_FIXO_DOS_MODELOS_VOX = ["Antes", "Depois"];

/** O amarelo Vox, só quando a marca não tem cor de destaque nenhuma. */
export const AMARELO_VOX = "#ffd400";
/** O papel cinza-claro do feed do Bruno e o jornal amarelado da colagem Vox. */
export const PAPEL_CINZA = "#d9d7d2";
export const PAPEL_JORNAL = "#e8dec3";

// ── sementes e SVG ───────────────────────────────────────────────────────────

/** Um gerador de números estável: a mesma semente dá a mesma textura na prévia e na arte. */
function semeador(semente: number) {
  let s = semente >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const n1 = (v: number) => Math.round(v * 10) / 10;

/** O papel com textura: fibras curtas e pintas escuras e claras, semeadas. */
function papelDataUri(W: number, H: number, cor: string, semente = 7): string {
  const r = semeador(semente);
  const partes: string[] = [];
  for (let i = 0; i < 520; i++) {
    const x = n1(r() * W);
    const y = n1(r() * H);
    const escura = r() > 0.4;
    partes.push(`<circle cx="${x}" cy="${y}" r="${n1(0.6 + r() * 1.6)}" fill="${escura ? "#000" : "#fff"}" opacity="${n1(0.05 + r() * 0.1)}"/>`);
  }
  for (let i = 0; i < 140; i++) {
    const x = n1(r() * W);
    const y = n1(r() * H);
    const a = r() * Math.PI;
    const c = 6 + r() * 26;
    partes.push(`<line x1="${x}" y1="${y}" x2="${n1(x + Math.cos(a) * c)}" y2="${n1(y + Math.sin(a) * c)}" stroke="#000" stroke-width="0.8" opacity="${n1(0.04 + r() * 0.06)}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.14"/></radialGradient></defs><rect width="${W}" height="${H}" fill="${cor}"/><rect width="${W}" height="${H}" fill="url(#v)"/>${partes.join("")}</svg>`;
  return svgUri(svg);
}

/** O jornal antigo: colunas de linhas cinzas (sem letra), títulos mais grossos e fios de coluna. */
function jornalDataUri(W: number, H: number, semente = 3, colunas = 3): string {
  const r = semeador(semente);
  const partes: string[] = [];
  const margem = Math.round(W * 0.04);
  const vao = Math.round(W * 0.03);
  const colW = (W - 2 * margem - vao * (colunas - 1)) / colunas;
  const passo = Math.max(6, Math.round(W / 90));
  for (let c = 0; c < colunas; c++) {
    const x = margem + c * (colW + vao);
    let y = margem + r() * passo * 4;
    while (y < H - margem) {
      if (r() < 0.08) {
        const h = passo * 2.2;
        partes.push(`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(colW * (0.6 + r() * 0.4))}" height="${n1(h)}" fill="#2a2520" opacity="0.8"/>`);
        y += h + passo * 1.2;
        continue;
      }
      const w = colW * (r() < 0.12 ? 0.35 + r() * 0.4 : 0.88 + r() * 0.12);
      partes.push(`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(passo * 0.5)}" fill="#2a2520" opacity="${n1(0.35 + r() * 0.3)}"/>`);
      y += passo;
      if (r() < 0.1) y += passo * 0.8;
    }
    if (c < colunas - 1) partes.push(`<line x1="${n1(x + colW + vao / 2)}" y1="${margem}" x2="${n1(x + colW + vao / 2)}" y2="${H - margem}" stroke="#2a2520" stroke-width="1" opacity="0.35"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="v" cx="50%" cy="50%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#6b4f1d" stop-opacity="0.28"/></radialGradient></defs><rect width="${W}" height="${H}" fill="${PAPEL_JORNAL}"/><rect width="${W}" height="${H}" fill="url(#v)"/>${partes.join("")}</svg>`;
  return svgUri(svg);
}

/** Um pedaço de papel rasgado: polígono com as bordas de cima e de baixo irregulares. */
function rasgoDataUri(w: number, h: number, cor: string, semente = 11, lados = false): string {
  const r = semeador(semente);
  const dente = Math.max(4, h * 0.09);
  const n = Math.max(8, Math.round(w / 26));
  const topo: string[] = [];
  const fundo: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n;
    topo.push(`${n1(x)},${n1(dente * r())}`);
    fundo.push(`${n1(x)},${n1(h - dente * r())}`);
  }
  const esq = lados ? `${n1(dente * r())},${n1(h * 0.5)}` : `0,${n1(h * 0.5)}`;
  const dir = lados ? `${n1(w - dente * r())},${n1(h * 0.5)}` : `${w},${n1(h * 0.5)}`;
  const pontos = [...topo, dir, ...fundo.reverse(), esq].join(" ");
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${pontos}" fill="${cor}"/></svg>`);
}

/** A trama de meio-tom: pontos escuros em grade, por cima da foto. */
function meioTomDataUri(w: number, h: number, passo: number, cor = "#000"): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><pattern id="p" width="${passo}" height="${passo}" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><circle cx="${passo / 2}" cy="${passo / 2}" r="${n1(passo * 0.22)}" fill="${cor}"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#p)"/></svg>`
  );
}

/** Uma seta tracejada curva, desenhada à mão. */
function setaTracejadaDataUri(w: number, h: number, cor: string, espelho = false): string {
  const d = espelho ? `M${w - 6} ${h * 0.15} C ${w * 0.6} ${h * 0.05}, ${w * 0.3} ${h * 0.5}, 10 ${h * 0.9}` : `M6 ${h * 0.15} C ${w * 0.4} ${h * 0.05}, ${w * 0.7} ${h * 0.5}, ${w - 10} ${h * 0.9}`;
  const px = espelho ? 10 : w - 10;
  const ponta = `M${px} ${h * 0.9} l${espelho ? 18 : -18} -6 M${px} ${h * 0.9} l${espelho ? 6 : -6} -18`;
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${d}" stroke="${cor}" stroke-width="5" fill="none" stroke-dasharray="16 12" stroke-linecap="round"/><path d="${ponta}" stroke="${cor}" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`
  );
}

/** O círculo feito à mão: duas voltas de caneta, levemente fora uma da outra. */
function circuloAMaoDataUri(w: number, h: number, cor: string): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.46;
  const ry = h * 0.42;
  const volta = (dx: number, dy: number, k: number) => `M${cx - rx + dx} ${cy + dy} a${rx * k} ${ry} 0 1 0 ${rx * 2 * k} 0 a${rx} ${ry * k} 0 1 0 ${-rx * 2} 6`;
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="${volta(0, 0, 1)}" stroke="${cor}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="${volta(10, -6, 0.97)}" stroke="${cor}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.8"/></svg>`
  );
}

// ── peças ────────────────────────────────────────────────────────────────────

function Fundo({ src, W, H }: { src: string; W: number; H: number }) {
  return (
    <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={W} height={H} style={{ width: W, height: H }} />
    </div>
  );
}

/** Uma figura SVG (rasgo, seta, círculo, trama) numa posição, com rotação opcional. */
function Figura({ src, x, y, w, h, rot = 0, opacidade = 1 }: { src: string; x: number; y: number; w: number; h: number; rot?: number; opacidade?: number }) {
  return (
    <div style={flex({ position: "absolute", left: x, top: y, width: w, height: h, transform: rot ? `rotate(${rot}deg)` : undefined, opacity: opacidade })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={w} height={h} style={{ width: w, height: h }} />
    </div>
  );
}

/** A trama de meio-tom por cima de uma zona de foto. */
function MeioTom({ z, u }: { z: Zona; u: number }) {
  return <Figura src={meioTomDataUri(z.w, z.h, Math.max(4, Math.round(7 * u)))} x={z.x} y={z.y} w={z.w} h={z.h} opacidade={0.28} />;
}

/** O selo redondo com o nome da marca (ou o logo), na cor de destaque. */
function Selo({ e, cor, tam, rot = -8, fonte }: { e: EntradaDoDesenho; cor: string; tam: number; rot?: number; fonte: FonteId }) {
  const texto = sobre(cor);
  return (
    <div style={flex({ width: tam, height: tam, borderRadius: tam / 2, background: cor, alignItems: "center", justifyContent: "center", transform: `rotate(${rot}deg)`, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", overflow: "hidden", padding: tam * 0.14 })}>
      {e.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.logo} alt="" width={tam * 0.7} height={tam * 0.5} style={{ width: tam * 0.7, height: tam * 0.5, objectFit: "contain" }} />
      ) : (
        <span style={{ ...estiloDaFonte(fonte), fontSize: Math.round(tam * (e.marca.length > 10 ? 0.14 : 0.2)), color: texto, textAlign: "center", lineHeight: 1.05 }}>{e.marca.toUpperCase()}</span>
      )}
    </div>
  );
}

/** O carimbo: moldura dupla e texto, levemente torto. */
function Carimbo({ texto, cor, fonte, u, rot = -6 }: { texto: string; cor: string; fonte: FonteId; u: number; rot?: number }) {
  return (
    <div style={flex({ border: `${6 * u}px solid ${cor}`, borderRadius: 14 * u, padding: 6 * u, transform: `rotate(${rot}deg)`, opacity: 0.9 })}>
      <div style={flex({ border: `${3 * u}px solid ${cor}`, borderRadius: 8 * u, padding: `${14 * u}px ${28 * u}px`, ...estiloDaFonte(fonte), fontSize: 42 * u, color: cor, letterSpacing: 4 * u, whiteSpace: "nowrap" })}>{texto.toUpperCase()}</div>
    </div>
  );
}

/** Um pedaço de fita adesiva na cor de destaque. */
function Fita({ x, y, w, rot, cor, u }: { x: number; y: number; w: number; rot: number; cor: string; u: number }) {
  return <div style={flex({ position: "absolute", left: x, top: y, width: w, height: 44 * u, background: rgba(cor, 0.85), transform: `rotate(${rot}deg)` })} />;
}

/** Os ícones a traço do infográfico, pela ordem do item. */
function IconeATraco({ i, cor, tam }: { i: number; cor: string; tam: number }) {
  const comum = { stroke: cor, strokeWidth: 2.4, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const desenhos = [
    // Lâmpada
    <g key="l" {...comum}>
      <path d="M20 4a9 9 0 0 0-5 16.5V25h10v-4.5A9 9 0 0 0 20 4z" />
      <path d="M16 29h8M17 33h6" />
    </g>,
    // Engrenagem
    <g key="e" {...comum}>
      <circle cx="20" cy="20" r="5" />
      <path d="M20 5v5M20 30v5M5 20h5M30 20h5M9.4 9.4l3.5 3.5M27.1 27.1l3.5 3.5M9.4 30.6l3.5-3.5M27.1 12.9l3.5-3.5" />
      <circle cx="20" cy="20" r="11" />
    </g>,
    // Alvo
    <g key="a" {...comum}>
      <circle cx="20" cy="20" r="14" />
      <circle cx="20" cy="20" r="8" />
      <circle cx="20" cy="20" r="2.5" fill={cor} />
      <path d="M20 6V2M34 20h4" />
    </g>,
    // Caixa marcada
    <g key="c" {...comum}>
      <rect x="6" y="6" width="28" height="28" rx="4" />
      <path d="M12 20l6 6 11-12" />
    </g>,
    // Gráfico subindo
    <g key="g" {...comum}>
      <path d="M5 33h30M8 28l8-9 6 5 11-13" />
      <path d="M27 11h6v6" />
    </g>,
  ];
  return (
    <svg width={tam} height={tam} viewBox="0 0 40 40">
      {desenhos[i % desenhos.length]}
    </svg>
  );
}

// ── zonas ────────────────────────────────────────────────────────────────────

/** A zona da foto dos modelos Vox (o servidor recorta a foto da IA para ela). */
export function zonaDaFotoVox(modelo: ModeloDeArte, W: number, H: number): Zona | null {
  const m = Math.round(Math.min(W, H) * 0.075);
  const alta = H / W > 1.6;
  switch (modelo.arquetipo) {
    case "vox-faixa":
    case "vox-jornal":
    case "vox-rosto":
    case "vox-capa":
    case "vox-antes-depois":
      return { x: 0, y: 0, w: W, h: H };
    case "vox-foto-rasgada":
      return { x: m, y: Math.round(H * (alta ? 0.5 : 0.47)), w: W - 2 * m, h: Math.round(H * (alta ? 0.34 : 0.4)) };
    case "vox-carimbo": {
      const lado = Math.round(W * 0.42);
      return { x: m, y: Math.round(H * (alta ? 0.58 : 0.55)), w: lado, h: lado };
    }
    default:
      return null;
  }
}

// ── o desenho ────────────────────────────────────────────────────────────────

/** O desenho de um modelo Vox; null quando o arquétipo não é daqui. */
export function desenharModeloVox(e: EntradaDoDesenho): ReactNode | null {
  if (!ARQUETIPOS_VOX.has(e.modelo.arquetipo)) return null;
  const b = base(e);
  const { W, H, u, m, md, tf, xf, caixaAlta, palavra, logoH, larguraUtil, alta, tomDaFoto, capaDoCarrossel, raiz, t } = b;
  const papeis = e.cores.papeis;
  // O destaque entra no lugar do amarelo Vox; sem destaque nenhum, o amarelo.
  const destaque = papeis?.destaque || e.cores.acento || AMARELO_VOX;
  const papel = PAPEL_CINZA;
  // A tinta sobre o papel: a cor de título aprovada quando lê sobre ele; senão quase preto.
  const tinta = papeis && contrasteEntre(papeis.titulo, papel) >= CONTRASTE_MINIMO_DO_TEXTO ? papeis.titulo : "#141414";
  // O destaque como letra sobre o papel precisa ler; senão a palavra vai em bloco.
  const destaqueLeNoPapel = contrasteEntre(destaque, papel) >= 3;
  const modoDaPalavra = destaqueLeNoPapel ? "cor" : "bloco";
  const semente = e.textos.titulo.length * 7 + W;
  const pb = Boolean(md.fotoPretoEBranco);
  // Os efeitos do modelo (05/10): sombra, luz, vinheta, contraste; um por modelo.
  // Com os ajustes da peça por cima (a luz e a sombra que o cliente pediu, 05/10).
  const efeito = efeitoComAjustes(efeitoDoModelo(md.arquetipo), e.ajustes);
  const coresDoEfeito = { acento: destaque, tinta };
  const inteira: Zona = { x: 0, y: 0, w: W, h: H };

  const Papel = () => <Fundo src={papelDataUri(W, H, papel, semente)} W={W} H={H} />;
  const assinatura = (alinhar: "flex-start" | "flex-end" | "center" = "flex-start", bg = papel) => (
    <div style={flex({ position: "absolute", left: m, width: larguraUtil, top: H - m - logoH, justifyContent: alinhar })}>
      <Assinatura e={e} fundo={bg} altura={logoH} alinhar={alinhar} />
    </div>
  );
  /** A pessoa recortada, em preto e branco, deslocada e escalada (frações da peça), com o efeito do modelo. */
  const pessoa = (desloca: number, escala: number) =>
    e.recorte ? <Pessoa src={e.recorte} W={W} H={H} desloca={desloca} escala={escala} pb={pb} efeito={efeito.pessoa} cores={coresDoEfeito} sombraSrc={e.recorteSombra} /> : null;
  /** A foto num pedaço de papel rasgado, com meio-tom; o que entra quando não há pessoa recortada. */
  const fotoRasgada = (z: Zona, rot: number) => {
    const borda = Math.round(22 * u);
    return (
      <>
        <Figura src={rasgoDataUri(z.w + 2 * borda, z.h + 2 * borda, "#f4f2ec", semente + 1, true)} x={z.x - borda} y={z.y - borda} w={z.w + 2 * borda} h={z.h + 2 * borda} rot={rot} />
        <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, transform: `rotate(${rot}deg)`, overflow: "hidden" })}>
          {e.foto ? <Imagem src={e.foto} z={{ x: 0, y: 0, w: z.w, h: z.h }} pb={pb} /> : <Vazio z={{ x: 0, y: 0, w: z.w, h: z.h }} cor={tomDaFoto} />}
          <MeioTom z={{ x: 0, y: 0, w: z.w, h: z.h }} u={u} />
        </div>
      </>
    );
  };
  const titulo = (p: { top: number; altura: number; largura?: number; corpo?: number; alinhar?: "left" | "center"; cor?: string; linhas?: number; fonte?: FonteId }) => (
    <div style={flex({ position: "absolute", left: m, top: p.top, width: p.largura ?? larguraUtil, height: p.altura, flexDirection: "column", justifyContent: "flex-start" })}>
      <Texto texto={t.titulo} fonte={p.fonte ?? tf} largura={p.largura ?? larguraUtil} altura={p.altura} corpoMaximo={(p.corpo ?? 150) * u} corpoMinimo={44 * u} entrelinha={0.98} cor={p.cor ?? tinta} caixaAlta={caixaAlta} alinhar={p.alinhar} destaque={modoDaPalavra} corDestaque={destaque} palavras={[palavra]} maxLinhas={p.linhas ?? 4} />
    </div>
  );

  // ── O MODO "FUNDO GERADO" (05/10): o modelo por prompt ──
  // A colagem inteira veio do modelo de imagem (lib/modelos-de-arte/prompts-vox.ts),
  // sem texto, com a zona do título deixada quieta. Aqui entram SÓ a
  // tipografia (título com a palavra no destaque), a assinatura e as peças
  // que carregam texto da marca (selo, carimbo, "arraste", Antes e Depois).
  // Um pedaço de papel rasgado, quase opaco, fica atrás do título: lê mesmo
  // se o gerador encheu a zona, e parece colado como o resto da colagem.
  if (e.fundoGerado) {
    const fundo = <Imagem src={e.fundoGerado} z={inteira} />;
    const papelDoTitulo = (z: Zona) => (
      <Figura src={rasgoDataUri(z.w + 60 * u, z.h + 50 * u, "#ecebe6", semente + 21, true)} x={z.x - 30 * u} y={z.y - 25 * u} w={z.w + 60 * u} h={z.h + 50 * u} rot={-1} opacidade={0.9} />
    );
    const tituloNoPapel = (fracao: number, p: { corpo?: number; linhas?: number; largura?: number } = {}) => {
      const z: Zona = { x: m, y: m, w: p.largura ?? larguraUtil, h: Math.round(H * fracao) - m };
      return (
        <>
          {papelDoTitulo(z)}
          {titulo({ top: z.y, altura: z.h, largura: z.w, corpo: p.corpo ?? 150, linhas: p.linhas })}
        </>
      );
    };
    switch (md.arquetipo) {
      case "vox-faixa":
        return raiz(<>{fundo}{tituloNoPapel(0.42, { corpo: 170 })}{assinatura("flex-start")}</>, papel);
      case "vox-foto-rasgada":
        return raiz(<>{fundo}{tituloNoPapel(0.4)}{assinatura("flex-end")}</>, papel);
      case "vox-jornal":
        return raiz(
          <>
            {fundo}
            {tituloNoPapel(alta ? 0.3 : 0.42, { largura: Math.round(W * (alta ? 0.9 : 0.6)), linhas: 5 })}
            <div style={flex({ position: "absolute", left: m, top: H - m - 190 * u })}>
              <Selo e={e} cor={destaque} tam={170 * u} fonte={tf} />
            </div>
          </>,
          PAPEL_JORNAL
        );
      case "vox-antes-depois": {
        const rot = t.lados?.rotulos ?? (["Antes", "Depois"] as [string, string]);
        const tiraH = Math.round(H * (alta ? 0.2 : 0.24));
        const rotuloY = Math.round(H * (alta ? 0.66 : 0.64));
        const rotulo = (texto: string, x: number, alinhar: "flex-start" | "flex-end") => (
          <div style={flex({ position: "absolute", left: x, top: rotuloY, width: Math.round(W / 2 - 30 * u), justifyContent: alinhar, ...estiloDaFonte("PlayfairDisplay-400i"), fontSize: 96 * u, color: "#ffffff", textShadow: "0 4px 18px rgba(0,0,0,0.6)" })}>{texto}</div>
        );
        return raiz(
          <>
            {fundo}
            {rotulo(rot[0], 0, "flex-end")}
            {rotulo(rot[1], Math.round(W / 2 + 30 * u), "flex-start")}
            <Figura src={rasgoDataUri(W + 40 * u, tiraH, papel, semente + 3)} x={-20 * u} y={-Math.round(tiraH * 0.12)} w={W + 40 * u} h={tiraH} opacidade={0.94} />
            <div style={flex({ position: "absolute", left: m, top: Math.round(m * 0.6), width: larguraUtil, height: tiraH - m, flexDirection: "column", justifyContent: "center" })}>
              <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tiraH - m * 1.2} corpoMaximo={92 * u} corpoMinimo={36 * u} entrelinha={1.0} cor={tinta} caixaAlta={caixaAlta} destaque={modoDaPalavra} corDestaque={destaque} palavras={[palavra]} maxLinhas={3} />
            </div>
            <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 1.4, width: larguraUtil, justifyContent: "center" })}>
              <Assinatura e={e} fundo="#000000" altura={logoH} alinhar="center" />
            </div>
          </>,
          "#000000"
        );
      }
      case "vox-rosto":
        return raiz(<>{fundo}{tituloNoPapel(0.3, { linhas: 2 })}{assinatura("flex-end")}</>, papel);
      case "vox-capa": {
        const seloTam = Math.round(200 * u);
        const seloX = Math.round(W - m - seloTam);
        const seloY = Math.round(H * (alta ? 0.5 : 0.47));
        const tiraW = Math.round(W * 0.56);
        const tiraH = Math.round(110 * u);
        return raiz(
          <>
            {fundo}
            {tituloNoPapel(0.45, { corpo: 190 })}
            <div style={flex({ position: "absolute", left: seloX, top: seloY })}>
              <Selo e={e} cor={destaque} tam={seloTam} fonte={tf} rot={8} />
            </div>
            <Figura src={circuloAMaoDataUri(seloTam * 1.5, seloTam * 1.3, tinta)} x={seloX - seloTam * 0.25} y={seloY - seloTam * 0.15} w={seloTam * 1.5} h={seloTam * 1.3} rot={-6} />
            {capaDoCarrossel ? (
              <>
                <Figura src={rasgoDataUri(tiraW, tiraH, "#f4f2ec", semente + 4)} x={m - 10 * u} y={H - m - tiraH} w={tiraW} h={tiraH} rot={-2} />
                <div style={flex({ position: "absolute", left: m + 20 * u, top: H - m - tiraH + 28 * u, alignItems: "center", transform: "rotate(-2deg)" })}>
                  <span style={{ ...estiloDaFonte(xf), fontSize: 34 * u, color: "#141414", marginRight: 18 * u }}>Arraste para o lado</span>
                  <Seta cor={destaque} tam={26 * u} />
                </div>
              </>
            ) : (
              assinatura("flex-start")
            )}
          </>,
          papel
        );
      }
      case "vox-infografico": {
        const itens = (t.itens ?? []).slice(0, 4);
        const n = Math.max(1, itens.length);
        const topo = Math.round(H * 0.3);
        const espaco = H - topo - m - logoH * 1.6;
        const altItem = espaco / n;
        const icone = Math.round(110 * u);
        const esq = Math.round(W * 0.15);
        const larg = Math.round(W * 0.7);
        return raiz(
          <>
            {fundo}
            {tituloNoPapel(0.28, { corpo: 110, linhas: 3 })}
            {itens.map((it, i) => (
              <div key={i} style={flex({ position: "absolute", left: esq, top: topo + i * altItem, width: larg, height: altItem, alignItems: "center" })}>
                <div style={flex({ width: icone, height: icone, borderRadius: icone / 2, background: "#f4f2ec", border: `${3 * u}px solid ${tinta}`, alignItems: "center", justifyContent: "center", marginRight: 30 * u, boxShadow: "0 6px 14px rgba(0,0,0,0.18)" })}>
                  <IconeATraco i={i} cor={tinta} tam={Math.round(icone * 0.6)} />
                </div>
                <div style={flex({ ...estiloDaFonte(tf), fontSize: 64 * u, lineHeight: 1, color: destaqueLeNoPapel ? destaque : tinta, marginRight: 22 * u, width: 90 * u })}>{String(i + 1).padStart(2, "0")}</div>
                <div style={flex({ background: rgba("#ecebe6", 0.86), padding: `${8 * u}px ${14 * u}px` })}>
                  <Texto texto={it} fonte={xf} largura={larg - icone - 170 * u} altura={altItem * 0.7} corpoMaximo={42 * u} entrelinha={1.2} cor={tinta} maxLinhas={2} />
                </div>
              </div>
            ))}
            {assinatura("flex-end")}
          </>,
          papel
        );
      }
      case "vox-carimbo":
        return raiz(
          <>
            {fundo}
            {tituloNoPapel(0.48)}
            <div style={flex({ position: "absolute", left: Math.round(W * 0.55), top: Math.round(H * (alta ? 0.7 : 0.66)) })}>
              <Carimbo texto={e.marca} cor={destaqueLeNoPapel ? destaque : misturar(tinta, destaque, 0.3)} fonte={tf} u={u} />
            </div>
            {assinatura("flex-end")}
          </>,
          papel
        );
    }
  }

  switch (md.arquetipo) {
    case "vox-faixa": {
      // O post do feed do Bruno: título enorme com uma palavra no destaque, a
      // pessoa em preto e branco e a faixa de papel rasgado no destaque.
      const tituloH = Math.round(H * (alta ? 0.3 : 0.4));
      const faixaW = Math.round(W * 0.52);
      const faixaH = Math.round(96 * u);
      const z: Zona = { x: m, y: Math.round(H * 0.5), w: larguraUtil, h: Math.round(H * 0.36) };
      return raiz(
        <>
          <Papel />
          {titulo({ top: m, altura: tituloH, corpo: 170 })}
          {e.recorte ? pessoa(alta ? 0.12 : 0.18, alta ? 0.6 : 0.72) : fotoRasgada(z, -2)}
          <Figura src={rasgoDataUri(faixaW, faixaH, destaque, semente + 2)} x={Math.round(W * (e.recorte ? 0.4 : 0.36))} y={Math.round(H * (e.recorte ? (alta ? 0.74 : 0.7) : 0.78))} w={faixaW} h={faixaH} rot={-7} />
          {assinatura("flex-start")}
        </>,
        papel
      );
    }

    case "vox-foto-rasgada": {
      // A planilha rasgada: a foto num papel rasgado, meio-tom, e um retângulo
      // do destaque marcando um ponto dela.
      const z = zonaDaFotoVox(md, W, H)!;
      const tituloH = Math.round(z.y - m - 40 * u);
      return raiz(
        <>
          <Papel />
          {titulo({ top: m, altura: tituloH, corpo: 150 })}
          {fotoRasgada(z, 2)}
          <div style={flex({ position: "absolute", left: z.x + z.w * 0.56, top: z.y + z.h * 0.58, width: z.w * 0.3, height: z.h * 0.22, border: `${7 * u}px solid ${destaque}`, transform: "rotate(2deg)" })} />
          <Fita x={z.x + z.w * 0.06} y={z.y - 34 * u} w={170 * u} rot={-8} cor={destaque} u={u} />
          {assinatura("flex-end")}
        </>,
        papel
      );
    }

    case "vox-jornal": {
      // A colagem Vox: jornal amarelado, título com marca-texto no destaque, a
      // pessoa recortada à direita, a seta tracejada e o selo com a marca.
      const tituloW = Math.round(W * (alta ? 0.9 : 0.6));
      const tituloH = Math.round(H * (alta ? 0.26 : 0.46));
      const tintaJornal = papeis && contrasteEntre(papeis.titulo, PAPEL_JORNAL) >= CONTRASTE_MINIMO_DO_TEXTO ? papeis.titulo : "#1a1612";
      const z: Zona = { x: Math.round(W * 0.5), y: Math.round(H * 0.46), w: Math.round(W * 0.42), h: Math.round(H * 0.4) };
      return raiz(
        <>
          <Fundo src={jornalDataUri(W, H, semente, alta ? 2 : 3)} W={W} H={H} />
          <div style={flex({ position: "absolute", left: 0, top: 0, width: W, height: H, background: "rgba(255,255,255,0.18)" })} />
          <div style={flex({ position: "absolute", left: m, top: m * 1.2, width: tituloW, height: tituloH, flexDirection: "column" })}>
            <Texto texto={t.titulo} fonte={tf} largura={tituloW} altura={tituloH} corpoMaximo={128 * u} corpoMinimo={44 * u} entrelinha={1.02} cor={tintaJornal} caixaAlta={caixaAlta} destaque="bloco" corDestaque={destaque} palavras={[palavra]} maxLinhas={5} />
          </div>
          {e.recorte ? pessoa(alta ? 0.1 : 0.26, alta ? 0.62 : 0.8) : fotoRasgada(z, 3)}
          <Figura src={setaTracejadaDataUri(Math.round(W * 0.3), Math.round(H * 0.16), destaque)} x={Math.round(W * 0.34)} y={Math.round(H * (alta ? 0.3 : 0.5))} w={Math.round(W * 0.3)} h={Math.round(H * 0.16)} />
          <div style={flex({ position: "absolute", left: m, top: H - m - 190 * u })}>
            <Selo e={e} cor={destaque} tam={170 * u} fonte={tf} />
          </div>
        </>,
        PAPEL_JORNAL
      );
    }

    case "vox-antes-depois": {
      // Antes e depois: a foto sem cor, a metade direita em meio-tom, a barra
      // do destaque no meio e os rótulos em itálico; o título numa tira de papel.
      const rot = t.lados?.rotulos ?? (["Antes", "Depois"] as [string, string]);
      const barra = Math.round(16 * u);
      const tiraH = Math.round(H * (alta ? 0.2 : 0.26));
      const direita: Zona = { x: Math.round(W / 2), y: 0, w: Math.round(W / 2), h: H };
      const rotuloY = Math.round(H * (alta ? 0.66 : 0.64));
      const rotulo = (texto: string, x: number, alinhar: "flex-start" | "flex-end") => (
        <div style={flex({ position: "absolute", left: x, top: rotuloY, width: Math.round(W / 2 - barra - 20 * u), justifyContent: alinhar, ...estiloDaFonte("PlayfairDisplay-400i"), fontSize: 96 * u, color: "#ffffff", textShadow: "0 4px 18px rgba(0,0,0,0.6)" })}>{texto}</div>
      );
      return raiz(
        <>
          {e.foto ? <Imagem src={e.foto} z={inteira} pb={pb} /> : <Vazio z={inteira} cor={tomDaFoto} />}
          {efeito.fundo?.vinheta ? <Vinheta W={W} H={H} forca={efeito.fundo.vinheta} /> : null}
          <MeioTom z={direita} u={u} />
          <div style={flex({ position: "absolute", left: Math.round(W / 2 - barra / 2), top: 0, width: barra, height: H, background: destaque })} />
          {rotulo(rot[0], 0, "flex-end")}
          {rotulo(rot[1], Math.round(W / 2 + barra + 20 * u), "flex-start")}
          <Figura src={rasgoDataUri(W + 40 * u, tiraH, papel, semente + 3)} x={-20 * u} y={-Math.round(tiraH * 0.12)} w={W + 40 * u} h={tiraH} />
          <div style={flex({ position: "absolute", left: m, top: Math.round(m * 0.6), width: larguraUtil, height: tiraH - m, flexDirection: "column", justifyContent: "center" })}>
            <Texto texto={t.titulo} fonte={tf} largura={larguraUtil} altura={tiraH - m * 1.2} corpoMaximo={92 * u} corpoMinimo={36 * u} entrelinha={1.0} cor={tinta} caixaAlta={caixaAlta} destaque={modoDaPalavra} corDestaque={destaque} palavras={[palavra]} maxLinhas={3} />
          </div>
          <div style={flex({ position: "absolute", left: m, top: H - m - logoH * 1.4, width: larguraUtil, justifyContent: "center" })}>
            <Assinatura e={e} fundo="#000000" altura={logoH} alinhar="center" />
          </div>
        </>,
        "#000000"
      );
    }

    case "vox-rosto": {
      // O rosto em pedaços de jornal: blocos de papel rasgado nas cores da
      // marca, a pessoa sem cor e recortes de jornal colados por cima.
      const fundoDaMarca = papeis?.fundo ?? e.cores.escuro;
      const r = semeador(semente + 5);
      const pedacos = Array.from({ length: 6 }, (_, i) => {
        const w = Math.round((150 + r() * 160) * u);
        const h = Math.round((70 + r() * 90) * u);
        return { w, h, x: Math.round(W * (0.3 + r() * 0.4) - w / 2), y: Math.round(H * (0.3 + r() * 0.32) - h / 2), rot: Math.round(-22 + r() * 44), i };
      });
      const z: Zona = { x: Math.round(W * 0.2), y: Math.round(H * 0.3), w: Math.round(W * 0.6), h: Math.round(H * 0.5) };
      return raiz(
        <>
          <Papel />
          <Figura src={rasgoDataUri(Math.round(W * 0.62), Math.round(H * 0.62), destaque, semente + 6, true)} x={Math.round(W * 0.04)} y={Math.round(H * 0.18)} w={Math.round(W * 0.62)} h={Math.round(H * 0.62)} rot={-4} />
          <Figura src={rasgoDataUri(Math.round(W * 0.5), Math.round(H * 0.5), fundoDaMarca, semente + 7, true)} x={Math.round(W * 0.48)} y={Math.round(H * 0.4)} w={Math.round(W * 0.5)} h={Math.round(H * 0.5)} rot={5} />
          {e.recorte ? pessoa(0, alta ? 0.78 : 0.92) : fotoRasgada(z, -3)}
          {pedacos.map((p) => (
            <Figura key={p.i} src={jornalDataUri(p.w, p.h, semente + 10 + p.i, 1)} x={p.x} y={p.y} w={p.w} h={p.h} rot={p.rot} opacidade={0.92} />
          ))}
          {titulo({ top: m, altura: Math.round(H * 0.22), corpo: 150, linhas: 2 })}
          {assinatura("flex-end")}
        </>,
        papel
      );
    }

    case "vox-capa": {
      // A capa de carrossel em papel: o título com a palavra no destaque, o
      // círculo à mão no selo, a seta tracejada e o "arraste" numa tira de papel.
      const tituloH = Math.round(H * (alta ? 0.34 : 0.44));
      const seloTam = Math.round(200 * u);
      const seloX = Math.round(W - m - seloTam);
      const seloY = Math.round(H * (alta ? 0.5 : 0.56));
      const tiraW = Math.round(W * 0.56);
      const tiraH = Math.round(110 * u);
      return raiz(
        <>
          <Papel />
          {titulo({ top: m, altura: tituloH, corpo: 190 })}
          {pessoa(alta ? 0.18 : 0.3, alta ? 0.5 : 0.56)}
          <div style={flex({ position: "absolute", left: seloX, top: seloY })}>
            <Selo e={e} cor={destaque} tam={seloTam} fonte={tf} rot={8} />
          </div>
          <Figura src={circuloAMaoDataUri(seloTam * 1.5, seloTam * 1.3, tinta)} x={seloX - seloTam * 0.25} y={seloY - seloTam * 0.15} w={seloTam * 1.5} h={seloTam * 1.3} rot={-6} />
          {capaDoCarrossel ? (
            <>
              <Figura src={setaTracejadaDataUri(Math.round(W * 0.22), Math.round(H * 0.14), destaque, true)} x={Math.round(W * 0.3)} y={H - m - tiraH - Math.round(H * 0.15)} w={Math.round(W * 0.22)} h={Math.round(H * 0.14)} />
              <Figura src={rasgoDataUri(tiraW, tiraH, "#f4f2ec", semente + 4)} x={m - 10 * u} y={H - m - tiraH} w={tiraW} h={tiraH} rot={-2} />
              <div style={flex({ position: "absolute", left: m + 20 * u, top: H - m - tiraH + 28 * u, alignItems: "center", transform: "rotate(-2deg)" })}>
                <span style={{ ...estiloDaFonte(xf), fontSize: 34 * u, color: "#141414", marginRight: 18 * u }}>Arraste para o lado</span>
                <Seta cor={destaque} tam={26 * u} />
              </div>
            </>
          ) : (
            assinatura("flex-start")
          )}
        </>,
        papel
      );
    }

    case "vox-infografico": {
      // O infográfico em papel: itens com ícone a traço, número no destaque e
      // uma linha tracejada ligando tudo.
      const itens = (t.itens ?? []).slice(0, 4);
      const n = Math.max(1, itens.length);
      const tituloH = Math.round(H * (alta ? 0.18 : 0.22));
      const topo = m + tituloH + 40 * u;
      const espaco = H - topo - m - logoH * 1.6;
      const altItem = espaco / n;
      const icone = Math.round(110 * u);
      return raiz(
        <>
          <Papel />
          {titulo({ top: m, altura: tituloH, corpo: 110, linhas: 3 })}
          <div style={flex({ position: "absolute", left: m + icone / 2 - 2 * u, top: topo + altItem * 0.3, width: 4 * u, height: altItem * (n - 1), borderLeft: `${4 * u}px dashed ${destaque}` })} />
          {itens.map((it, i) => (
            <div key={i} style={flex({ position: "absolute", left: m, top: topo + i * altItem, width: larguraUtil, height: altItem, alignItems: "center" })}>
              <div style={flex({ width: icone, height: icone, borderRadius: icone / 2, background: "#f4f2ec", border: `${3 * u}px solid ${tinta}`, alignItems: "center", justifyContent: "center", marginRight: 34 * u, boxShadow: "0 6px 14px rgba(0,0,0,0.12)" })}>
                <IconeATraco i={i} cor={tinta} tam={Math.round(icone * 0.6)} />
              </div>
              <div style={flex({ ...estiloDaFonte(tf), fontSize: 64 * u, lineHeight: 1, color: destaqueLeNoPapel ? destaque : tinta, marginRight: 26 * u, width: 90 * u })}>{String(i + 1).padStart(2, "0")}</div>
              <Texto texto={it} fonte={xf} largura={larguraUtil - icone - 150 * u} altura={altItem * 0.8} corpoMaximo={42 * u} entrelinha={1.2} cor={tinta} maxLinhas={2} />
            </div>
          ))}
          {assinatura("flex-end")}
        </>,
        papel
      );
    }

    case "vox-carimbo": {
      // A frase carimbada: título, o carimbo torto com a marca e uma foto
      // pequena sem cor, colada com fita.
      const z = zonaDaFotoVox(md, W, H)!;
      const tituloH = Math.round(z.y - m - 60 * u);
      const borda = Math.round(18 * u);
      return raiz(
        <>
          <Papel />
          {titulo({ top: m, altura: tituloH, corpo: 150 })}
          <div style={flex({ position: "absolute", left: z.x - borda, top: z.y - borda, width: z.w + 2 * borda, height: z.h + 2 * borda, background: "#f4f2ec", transform: "rotate(-4deg)", boxShadow: "0 18px 40px rgba(0,0,0,0.25)" })} />
          <div style={flex({ position: "absolute", left: z.x, top: z.y, width: z.w, height: z.h, transform: "rotate(-4deg)", overflow: "hidden" })}>
            {e.foto ? <Imagem src={e.foto} z={{ x: 0, y: 0, w: z.w, h: z.h }} pb={pb} /> : <Vazio z={{ x: 0, y: 0, w: z.w, h: z.h }} cor={tomDaFoto} />}
            <MeioTom z={{ x: 0, y: 0, w: z.w, h: z.h }} u={u} />
          </div>
          <Fita x={z.x + z.w * 0.3} y={z.y - 40 * u} w={180 * u} rot={-6} cor={destaque} u={u} />
          <div style={flex({ position: "absolute", left: z.x + z.w + 50 * u, top: z.y + z.h * 0.3 })}>
            <Carimbo texto={e.marca} cor={destaqueLeNoPapel ? destaque : misturar(tinta, destaque, 0.3)} fonte={tf} u={u} />
          </div>
          {assinatura("flex-end")}
        </>,
        papel
      );
    }
  }
  return null;
}
