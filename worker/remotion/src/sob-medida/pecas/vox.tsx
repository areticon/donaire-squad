import React, { useEffect, useState } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, staticFile } from "remotion";
import { limitar, lista, saiSuave, texto, type Ctx } from "../base";
import { acaso, molaFisica } from "../kit";

/**
 * AS PEÇAS DO ESTILO VOX (04/10/2026). O dono mandou o quadro de treino
 * docs/overlays/referencias/vox/bruno-0410/vox-01.png e disse o que faltava:
 * PROFUNDIDADE, MISTURA DE RECORTES COM FOTOS DE ALTA RESOLUÇÃO, ELEMENTOS
 * POLÊMICOS (a estátua com tarja de censura) e o JORNAL, o papel rasgado.
 * O quadro: papel envelhecido com textura, mapa antigo recortado com o
 * círculo vermelho num lugar, manuscrito ao fundo, recortes de foto de arquivo
 * em P&B (prédio com chaminé, homem de terno) em camadas com sombra, tarja
 * AMARELA sobre os olhos e o título serifado preto na faixa amarela de
 * marca-texto.
 *
 *   colagem       a colagem em camadas com parallax: papel, manuscrito, mapa recortado, 1 a 3 fotos recortadas com borda de papel e sombra, título no marca-texto, fio vermelho entre recortes, carimbo, tarja
 *   jornal        o recorte de jornal rasgado com a manchete, colunas ilegíveis, a foto em meio-tom e o recorte saltando para fora do papel
 *   mapa-antigo   o mapa antigo rasgado, a câmera chegando no lugar e o círculo vermelho que se desenha, com o rótulo em tira de papel
 *   censura       a estátua (ou figura fictícia) grande e a tarja que BATE sobre os olhos, com tremor e carimbo
 *   marca-texto   a frase serifada preta na faixa amarela que corre, sobre a pessoa
 *   carimbo       o carimbo vermelho que bate, sobre a pessoa
 *
 * As fotos vêm da Higgsfield, recortadas no BiRefNet e guardadas no Blob
 * público (lib/media/editor-sob-medida/recortes-vox.ts); sem a foto, a peça
 * usa o recorte de reserva do assunto (worker/fontes/vox). As animações de
 * papel andam a 12 quadros por segundo (o engasgo da Vox); a câmera, contínua.
 */

/**
 * O REALCE (a faixa amarela do marca-texto) e a tinta do CARIMBO: os do Vox, ou
 * os acentos da marca quando o editor por comando manda (tema.vox, 05/10). Cada
 * peça exportada chama `usarAcentos(c)` antes de desenhar; o tema é o mesmo
 * para todas as camadas de um vídeo.
 */
let AMARELO = "#ffe11f";
let TINTA_DO_CARIMBO = "#b8231b";
const HEX6 = /^#[0-9a-f]{6}$/i;
function usarAcentos(c: { tema?: { vox?: { realce?: string; carimbo?: string } } }): void {
  const v = c.tema?.vox;
  AMARELO = v?.realce && HEX6.test(v.realce) ? v.realce : "#ffe11f";
  TINTA_DO_CARIMBO = v?.carimbo && HEX6.test(v.carimbo) ? v.carimbo : "#b8231b";
}
const TINTA = "#16130e";
const VERMELHO = "#b8231b";
const PAPEL = "#d3bf97";
const SERIFA = '"Playfair Display", Georgia, serif';
const CONDENSADA = 'Oswald, "Liberation Sans", sans-serif';

/** O tempo em passos de 12 por segundo: o engasgo do papel animado à mão. */
const doze = (t: number) => Math.floor(t * 12) / 12;
const semAsteriscos = (s: string) => s.replace(/\*\*/g, "");

type Olhos = { x: number; y: number; w: number };
type Foto = { assunto?: string; descricao?: string; url?: string; olhos?: Olhos | null; censura?: boolean };

/** Os recortes de reserva (empacotados no worker) e os olhos medidos neles. */
const RESERVA: Record<string, string> = {
  estatua: "vox/estatua.webp",
  figura: "vox/figura.webp",
  predio: "vox/predio.webp",
  documento: "vox/documento.webp",
  objeto: "vox/documento.webp",
  lugar: "vox/predio.webp",
};
const OLHOS_DA_RESERVA: Record<string, Olhos> = {
  estatua: { x: 0.5, y: 0.27, w: 0.33 },
  figura: { x: 0.47, y: 0.185, w: 0.22 },
};
const comRosto = (a: string) => a === "estatua" || a === "figura";
/** O instante (s da peça) do evento k, ou o padrão quando a peça não tem evento. */
const eventoOu = (c: Ctx, k: number, padrao: number) => c.eventosLocais?.[k] ?? padrao;

// ─────────────────────────────── a foto que pode faltar ───────────────────────────────

const estadoDaFoto = new Map<string, "ok" | "falhou">();

/** Sonda a URL da foto gerada: se não carregar, a peça usa a reserva (nunca derruba o render). */
function useFotoCarregada(src: string | undefined): boolean {
  const [, mexer] = useState(0);
  const [espera] = useState(() => (src && !estadoDaFoto.has(src) ? delayRender(`foto vox ${src.slice(-24)}`, { timeoutInMilliseconds: 45_000 }) : null));
  useEffect(() => {
    if (!src || estadoDaFoto.has(src)) {
      if (espera !== null) continueRender(espera);
      return;
    }
    const im = new Image();
    im.crossOrigin = "anonymous";
    const fim = (ok: boolean) => {
      estadoDaFoto.set(src, ok ? "ok" : "falhou");
      mexer((x) => x + 1);
      requestAnimationFrame(() => requestAnimationFrame(() => espera !== null && continueRender(espera)));
    };
    im.onload = () => fim(true);
    im.onerror = () => fim(false);
    im.src = src;
  }, [src, espera]);
  return Boolean(src) && estadoDaFoto.get(src!) === "ok";
}

function fonteDaFoto(f: Foto | undefined, ok: boolean): { src: string; olhos: Olhos | null; assunto: string } {
  const assunto = String(f?.assunto ?? "objeto");
  if (ok && f?.url) return { src: f.url, olhos: f.olhos ?? null, assunto };
  return { src: staticFile(RESERVA[assunto] ?? RESERVA.objeto), olhos: OLHOS_DA_RESERVA[assunto] ?? null, assunto };
}

// ─────────────────────────────── filtros: borda de papel, tinta, grão ───────────────────────────────

/** Os filtros SVG das peças (a borda de papel rasgada em volta do recorte e a tinta gasta do carimbo). */
function Filtros({ s }: { s: number }) {
  const r = Math.max(4, 9 * s);
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <defs>
        <filter id="vox-borda" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={r} result="d" />
          <feTurbulence type="fractalNoise" baseFrequency={0.05 / s} numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="d" in2="n" scale={r * 1.3} xChannelSelector="R" yChannelSelector="G" result="dd" />
          <feFlood floodColor="#f2ead8" result="cor" />
          <feComposite in="cor" in2="dd" operator="in" result="borda" />
          <feMerge>
            <feMergeNode in="borda" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="vox-tinta" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency={0.09 / s} numOctaves={3} seed={7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/** O grão de filme que respira (muda a 12 por segundo) e a vinheta. */
function Grao({ c, forca = 1 }: { c: Ctx; forca?: number }) {
  const s = Math.min(c.W, c.H) / 1080;
  const semente = Math.floor(c.t * 12) % 9;
  const id = `vox-grao-${semente}`;
  return (
    <>
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", opacity: 0.32 * forca, pointerEvents: "none" }}>
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency={0.78 / Math.max(0.6, s)} numOctaves={2} seed={semente} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 0.9 0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgba(40,24,8,.42) 100%)", pointerEvents: "none" }} />
    </>
  );
}

// ─────────────────────────────── geometria do papel ───────────────────────────────

/** O contorno rasgado de uma folha w x h (px), em polígono para clip-path. */
function rasgado(w: number, h: number, semente: number, amp: number, lados = "trbl"): string {
  const pts: string[] = [];
  const passo = Math.max(8, amp * 1.6);
  const borda = (k: number, lado: string) => (lados.includes(lado) ? (acaso(k + semente * 31, 1.7) - 0.15) * amp : 0);
  let k = 0;
  for (let x = 0; x <= w; x += passo) pts.push(`${x.toFixed(1)}px ${borda(k++, "t").toFixed(1)}px`);
  for (let y = 0; y <= h; y += passo) pts.push(`${(w - borda(k++, "r")).toFixed(1)}px ${y.toFixed(1)}px`);
  for (let x = w; x >= 0; x -= passo) pts.push(`${x.toFixed(1)}px ${(h - borda(k++, "b")).toFixed(1)}px`);
  for (let y = h; y >= 0; y -= passo) pts.push(`${borda(k++, "l").toFixed(1)}px ${y.toFixed(1)}px`);
  return `polygon(${pts.join(",")})`;
}

/** O contorno rasgado em porcentagem (para caixa de tamanho que só o texto decide). */
function rasgadoPct(semente: number, amp: number): string {
  const pts: string[] = [];
  const n = 26;
  const b = (k: number) => (acaso(k + semente * 17, 2.3) * amp).toFixed(2);
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${b(i)}%`);
  for (let i = 0; i <= 8; i++) pts.push(`${(100 - Number(b(i + 40)) * 0.5).toFixed(2)}% ${((i / 8) * 100).toFixed(2)}%`);
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${(100 - Number(b(i + 60))).toFixed(2)}%`);
  for (let i = 8; i >= 0; i--) pts.push(`${(Number(b(i + 90)) * 0.5).toFixed(2)}% ${((i / 8) * 100).toFixed(2)}%`);
  return `polygon(${pts.join(",")})`;
}

/** A câmera da colagem: deriva lenta e aproximação; cada camada anda conforme a profundidade (parallax). */
function camera(c: Ctx, semente = 1) {
  const s = Math.min(c.W, c.H) / 1080;
  const p = c.t / Math.max(1, c.dur);
  const dx = (p - 0.5) * 70 * s * (semente % 2 ? 1 : -1);
  const dy = (p - 0.5) * 22 * s;
  const z = 0.06 * p;
  return (profundidade: number): React.CSSProperties => ({
    transform: `translate(${(-dx * profundidade).toFixed(2)}px, ${(-dy * profundidade).toFixed(2)}px) scale(${(1 + z * profundidade).toFixed(4)})`,
    transformOrigin: "50% 50%",
  });
}

/** O tremor do impacto (tarja, carimbo): forte no instante e some em 0,3 s. */
function tremor(t: number, impacto: number, s: number): { x: number; y: number } {
  const d = t - impacto;
  if (d < 0 || d > 0.3) return { x: 0, y: 0 };
  const a = 16 * s * (1 - d / 0.3);
  return { x: a * Math.sin(d * 95), y: a * Math.cos(d * 71) };
}

/** A queda do recorte no papel, a 12 por segundo: cai grande e torto, assenta. */
function queda(t: number, inicio: number, rot: number, s: number): { visivel: boolean; estilo: React.CSSProperties; sombra: number } {
  const p = saiSuave(limitar((doze(t) - inicio) / 0.34));
  if (doze(t) < inicio) return { visivel: false, estilo: {}, sombra: 0 };
  return {
    visivel: true,
    estilo: { transform: `translateY(${(-46 * s * (1 - p)).toFixed(1)}px) scale(${(1.16 - 0.16 * p).toFixed(3)}) rotate(${(rot + 7 * (1 - p)).toFixed(2)}deg)` },
    sombra: 1 + 1.6 * (1 - p),
  };
}

/** A entrada da tela inteira: a folha de papel varre da esquerda com a borda rasgada. */
function varredura(c: Ctx): React.CSSProperties {
  if (c.entra >= 1) return c.fica < 1 ? { opacity: c.fica } : {};
  const x = c.W * (doze(c.entra * 0.6) / 0.6) * 1.12;
  const pts: string[] = ["0px 0px"];
  const n = 18;
  for (let i = 0; i <= n; i++) pts.push(`${(x + (acaso(i, 3.3) - 0.5) * 60).toFixed(1)}px ${((c.H * i) / n).toFixed(1)}px`);
  pts.push(`0px ${c.H}px`);
  return { clipPath: `polygon(${pts.join(",")})`, opacity: c.fica };
}

// ─────────────────────────────── as partes ───────────────────────────────

/** O papel envelhecido, o manuscrito ao fundo e a câmera que deriva. */
function Papel({ c, cam, manuscrito }: { c: Ctx; cam: (d: number) => React.CSSProperties; manuscrito?: { x: number; y: number; w: number; rot: number; opacidade?: number } | null }) {
  return (
    <>
      <AbsoluteFill style={{ background: PAPEL }} />
      <div style={{ position: "absolute", left: -c.W * 0.08, top: -c.H * 0.08, width: c.W * 1.16, height: c.H * 1.16, ...cam(0.25) }}>
        <Img src={staticFile("vox/papel.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "sepia(.25) saturate(1.1) contrast(1.05)" }} />
      </div>
      {manuscrito ? (
        <div style={{ position: "absolute", left: manuscrito.x, top: manuscrito.y, width: manuscrito.w, ...cam(0.4) }}>
          <Img src={staticFile("vox/manuscrito.jpg")} style={{ width: "100%", display: "block", transform: `rotate(${manuscrito.rot}deg)`, mixBlendMode: "multiply", opacity: manuscrito.opacidade ?? 0.62, filter: "sepia(.4) contrast(1.15)" }} />
        </div>
      ) : null}
    </>
  );
}

/** Um recorte de foto de arquivo: P&B de alta resolução, borda de papel rasgada, sombra de verdade; tarja nos olhos quando pedida. */
function Recorte({ foto, altura, s, tarja = 0, sombra = 1 }: { foto: Foto | undefined; altura: number; s: number; tarja?: number; sombra?: number }) {
  const ok = useFotoCarregada(foto?.url);
  const f = fonteDaFoto(foto, ok);
  const olhos = f.olhos;
  const pTarja = limitar(tarja);
  return (
    <div style={{ position: "relative", height: altura, display: "inline-block", filter: `drop-shadow(0 ${10 * s * sombra}px ${14 * s * sombra}px rgba(20,12,4,.5)) drop-shadow(0 ${2 * s}px ${3 * s}px rgba(0,0,0,.35))` }}>
      <Img src={f.src} style={{ height: "100%", width: "auto", display: "block", filter: "grayscale(1) contrast(1.2) brightness(1.04) sepia(.14) url(#vox-borda)" }} />
      {/* O MEIO-TOM da foto impressa (a assinatura da colagem Vox): pontos de tinta só dentro do recorte. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(20,15,8,.9) 0 30%, transparent 36%)",
          backgroundSize: `${Math.max(3, 4.2 * s)}px ${Math.max(3, 4.2 * s)}px`,
          mixBlendMode: "multiply",
          opacity: 0.22,
          WebkitMaskImage: `url(${f.src})`,
          maskImage: `url(${f.src})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
        }}
      />
      {olhos && pTarja > 0 && comRosto(f.assunto) ? (
        <div
          style={{
            position: "absolute",
            left: `${((olhos.x - olhos.w * 0.95) * 100).toFixed(2)}%`,
            top: `${(olhos.y * 100).toFixed(2)}%`,
            width: `${(olhos.w * 1.9 * 100).toFixed(2)}%`,
            aspectRatio: "4.6 / 1",
            background: AMARELO,
            transform: `translateY(-50%) rotate(-5deg) scale(${(2.1 - 1.1 * molaFisica(pTarja * 0.5, 260, 16)).toFixed(3)})`,
            boxShadow: `0 ${4 * s}px ${8 * s}px rgba(0,0,0,.35)`,
          }}
        />
      ) : null}
    </div>
  );
}

/** O título serifado preto na faixa amarela de marca-texto, que corre da esquerda. */
function TituloMarcado({ texto: txt, tam, p, rot = -1.2, largura, caixaAlta = true }: { texto: string; tam: number; p: number; rot?: number; largura: number; caixaAlta?: boolean }) {
  const corre = doze(saiSuave(limitar(p)) * 0.5) / 0.5;
  if (corre <= 0) return null;
  return (
    <div style={{ width: largura, transform: `rotate(${rot}deg)`, filter: `drop-shadow(0 ${tam * 0.06}px ${tam * 0.09}px rgba(20,12,4,.45))` }}>
      <div style={{ clipPath: `inset(-10% ${((1 - corre) * 100).toFixed(1)}% -10% -2%)` }}>
        <span
          style={{
            fontFamily: SERIFA,
            fontWeight: 900,
            fontSize: tam,
            lineHeight: 1.22,
            letterSpacing: "0.01em",
            textTransform: caixaAlta ? "uppercase" : "none",
            color: TINTA,
            background: AMARELO,
            padding: `0.04em 0.22em 0.08em`,
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {semAsteriscos(txt)}
        </span>
      </div>
    </div>
  );
}

/** O carimbo vermelho que bate: tinta gasta, borda dupla, entra grande e assenta com tremor. */
function Carimbo({ txt, tam, p, rot = -9 }: { txt: string; tam: number; p: number; rot?: number }) {
  if (p <= 0) return null;
  const k = saiSuave(limitar(p / 0.4));
  return (
    <div
      style={{
        display: "inline-block",
        fontFamily: CONDENSADA,
        fontWeight: 700,
        fontSize: tam,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: TINTA_DO_CARIMBO,
        border: `${tam * 0.09}px double ${TINTA_DO_CARIMBO}`,
        padding: `0.02em 0.32em`,
        transform: `rotate(${rot}deg) scale(${(2.3 - 1.3 * k).toFixed(3)})`,
        opacity: 0.25 + 0.65 * k,
        filter: "url(#vox-tinta)",
        mixBlendMode: "multiply",
      }}
    >
      {txt}
    </div>
  );
}

/** O mapa antigo recortado, com a borda rasgada branca por baixo e o círculo vermelho que se desenha. */
function MapaRasgado({ w, h, s, semente, alvo, circulo, zoom = 1, raio = 0.16 }: { w: number; h: number; s: number; semente: number; alvo: { x: number; y: number }; circulo: number; zoom?: number; raio?: number }) {
  const r = Math.min(w, h) * raio;
  const cx = alvo.x * w;
  const cy = alvo.y * h;
  const anel: string[] = [];
  for (let a = 0; a <= 64; a++) {
    const ang = (a / 64) * Math.PI * 2.15 - 1.9;
    const rr = r * 1.3 * (1 + 0.05 * Math.sin(a * 0.9 + semente) + 0.03 * Math.sin(a * 2.3));
    anel.push(`${a ? "L" : "M"}${(cx + Math.cos(ang) * rr * 1.08).toFixed(1)} ${(cy + Math.sin(ang) * rr * 0.94).toFixed(1)}`);
  }
  const comp = 2 * Math.PI * r * 1.3 * 1.1;
  const pc = doze(limitar(circulo) * 0.7) / 0.7;
  return (
    <div style={{ position: "relative", width: w, height: h, filter: `drop-shadow(0 ${12 * s}px ${16 * s}px rgba(20,12,4,.5))` }}>
      <div style={{ position: "absolute", inset: -7 * s, background: "#f4ecdb", clipPath: rasgado(w + 14 * s, h + 14 * s, semente + 2, 16 * s) }} />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: rasgado(w, h, semente, 14 * s) }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: `${alvo.x * 100}% ${alvo.y * 100}%` }}>
          <Img src={staticFile("vox/mapa.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "sepia(.35) contrast(1.1) saturate(1.1)" }} />
          <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            {pc > 0 ? <circle cx={cx} cy={cy} r={r * Math.min(1, pc * 1.6)} fill="rgba(165,22,18,.78)" style={{ mixBlendMode: "multiply" }} /> : null}
            {pc > 0 ? <path d={anel.join(" ")} fill="none" stroke="rgba(165,22,18,.9)" strokeWidth={4 * s} strokeLinecap="round" strokeDasharray={comp} strokeDashoffset={comp * (1 - pc)} /> : null}
          </svg>
        </div>
      </div>
    </div>
  );
}

/** A tira de papel com o nome do lugar e o pedaço de fita. */
function TiraDePapel({ txt, tam, p, rot = 2 }: { txt: string; tam: number; p: number; rot?: number }) {
  if (p <= 0) return null;
  const k = saiSuave(limitar(p));
  return (
    <div style={{ position: "relative", display: "inline-block", transform: `rotate(${rot + 5 * (1 - k)}deg) scale(${1.14 - 0.14 * k})`, filter: `drop-shadow(0 ${tam * 0.12}px ${tam * 0.16}px rgba(20,12,4,.45))` }}>
      <div style={{ background: "#f3ebd9", padding: `0.18em 0.5em 0.14em`, fontFamily: SERIFA, fontWeight: 800, fontSize: tam, color: TINTA, letterSpacing: "0.06em", textTransform: "uppercase" }}>{txt}</div>
      <div style={{ position: "absolute", left: "38%", top: -tam * 0.32, width: tam * 1.6, height: tam * 0.55, background: "rgba(236,226,196,.75)", transform: "rotate(-6deg)", boxShadow: "0 1px 2px rgba(0,0,0,.15)" }} />
    </div>
  );
}

/** O fio vermelho entre dois recortes (o quadro de investigação), com os alfinetes. */
function Fio({ a, b, p, s }: { a: { x: number; y: number }; b: { x: number; y: number }; p: number; s: number }) {
  if (p <= 0) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + Math.abs(b.x - a.x) * 0.12;
  const comp = Math.hypot(b.x - a.x, b.y - a.y) * 1.08;
  const k = doze(limitar(p) * 0.6) / 0.6;
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width="100%" height="100%">
      <path d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke={VERMELHO} strokeWidth={3.2 * s} strokeDasharray={comp} strokeDashoffset={comp * (1 - k)} style={{ filter: `drop-shadow(0 ${3 * s}px ${3 * s}px rgba(0,0,0,.35))` }} />
      {[a, ...(k >= 1 ? [b] : [])].map((q, i) => (
        <g key={i}>
          <circle cx={q.x} cy={q.y} r={9 * s} fill={VERMELHO} style={{ filter: `drop-shadow(0 ${3 * s}px ${2 * s}px rgba(0,0,0,.4))` }} />
          <circle cx={q.x - 3 * s} cy={q.y - 3 * s} r={3 * s} fill="rgba(255,255,255,.55)" />
        </g>
      ))}
    </svg>
  );
}

// ─────────────────────────────── as peças ───────────────────────────────

/** Ordem de destaque do recorte (o maior fica com a figura ou a estátua). */
const PESO: Record<string, number> = { figura: 0, estatua: 0, predio: 1, objeto: 2, lugar: 3, documento: 3 };

type Vaga = { esquerda?: number; direita?: number; baixo?: number; topo?: number; altura: number; rot: number; prof: number };

/** COLAGEM: a cena da referência vox-01, em camadas com parallax. */
export function Colagem(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const cam = camera(c, 1);
  const fotos = lista<Foto>(c.props.recortes).slice(0, 3);
  const ordem = fotos.map((f, i) => ({ f, i })).sort((a, b) => (PESO[String(a.f.assunto)] ?? 2) - (PESO[String(b.f.assunto)] ?? 2));
  const mapa = c.props.mapa && typeof c.props.mapa === "object" ? (c.props.mapa as { lugar?: string; x?: number; y?: number }) : null;
  const titulo = texto(c.props.titulo);
  const carimbo = texto(c.props.carimbo);
  const vagas: Vaga[] = vertical
    ? [
        { direita: -0.1 * W, baixo: -0.02 * H, altura: 0.58 * H, rot: 1.5, prof: 1.3 },
        { esquerda: 0.01 * W, baixo: 0.04 * H, altura: 0.3 * H, rot: -2, prof: 0.95 },
        { esquerda: 0.05 * W, topo: 0.6 * H, altura: 0.14 * H, rot: -6, prof: 1.1 },
      ]
    : [
        { direita: -0.02 * W, baixo: -0.04 * H, altura: 0.94 * H, rot: 0.8, prof: 1.3 },
        { esquerda: 0.27 * W, baixo: -0.03 * H, altura: 0.58 * H, rot: -1, prof: 0.95 },
        { esquerda: 0.03 * W, baixo: 0.05 * H, altura: 0.36 * H, rot: -6, prof: 1.1 },
      ];
  // O instante (s da peça) em que o recorte i cai: o evento dele, ou a cascata logo depois da entrada.
  const caiu = (i: number) => ({ inicio: c.eventosLocais?.[i] ?? 0.45 + i * 0.35 });
  const tTitulo = 0.3;
  const largTitulo = vertical ? 0.88 * W : 0.5 * W;
  const tamTitulo = Math.min(vertical ? 138 * s : 108 * s, (largTitulo / Math.max(6, semAsteriscos(titulo).length)) * (vertical ? 2.4 : 1.9));
  const ultimo = Math.max(...fotos.map((_, i) => caiu(i).inicio).filter(Number.isFinite), 0.8);
  const tCarimbo = Math.min(c.dur - 0.6, ultimo + 0.7);
  const impactos = ordem.filter(({ f }) => f.censura && comRosto(String(f.assunto))).map(({ i }) => caiu(i).inicio + 0.45);
  const tr = impactos.map((x) => tremor(c.t, x, s)).concat([tremor(c.t, tCarimbo, s)]).reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y }), { x: 0, y: 0 });
  const centro = (v: Vaga) => ({ x: v.esquerda !== undefined ? v.esquerda + v.altura * 0.35 : W - (v.direita ?? 0) - v.altura * 0.4, y: v.topo !== undefined ? v.topo + v.altura * 0.2 : H - (v.baixo ?? 0) - v.altura * 0.55 });
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...varredura(c) }}>
      <Filtros s={s} />
      <AbsoluteFill style={{ transform: `translate(${tr.x}px, ${tr.y}px)` }}>
        <Papel c={c} cam={cam} manuscrito={vertical ? { x: 0.3 * W, y: 0.16 * H, w: 0.85 * W, rot: 4 } : { x: 0.48 * W, y: -0.08 * H, w: 0.42 * W, rot: 3 }} />
        {mapa ? (
          <div style={{ position: "absolute", left: vertical ? -0.06 * W : -0.03 * W, top: vertical ? 0.02 * H : -0.06 * H, transform: "rotate(-1.5deg)", ...cam(0.55) }}>
            <MapaRasgado w={vertical ? 1.04 * W : 0.54 * W} h={vertical ? 0.3 * H : 0.52 * H} s={s} semente={3} alvo={{ x: limitar(Number(mapa.x ?? 0.5), 0.15, 0.85), y: limitar(Number(mapa.y ?? 0.45), 0.2, 0.8) }} circulo={(c.t - 0.7) / 0.9} />
          </div>
        ) : null}
        {ordem.map(({ f, i }, k) => {
          const v = vagas[k];
          const q = queda(c.t, caiu(i).inicio, v.rot, s);
          if (!q.visivel) return null;
          const tarja = f.censura ? (c.t - caiu(i).inicio - 0.45) / 0.35 : 0;
          return (
            <div key={i} style={{ position: "absolute", left: v.esquerda, right: v.direita, bottom: v.baixo, top: v.topo, height: v.altura, ...cam(v.prof) }}>
              <div style={q.estilo}>
                {/* O LUGAR é foto inteira: vai como cópia em papel fotográfico, não como recorte (prova de 04/10: recortado, cobria a tela). */}
                {String(f.assunto) === "lugar" ? <FotoImpressa foto={f} largura={Math.min(v.altura * 1.15, vertical ? 0.62 * W : 0.34 * W)} s={s} /> : <Recorte foto={f} altura={v.altura} s={s} tarja={tarja} sombra={q.sombra} />}
              </div>
            </div>
          );
        })}
        {c.props.ligar && ordem.length >= 2 ? <Fio a={centro(vagas[1])} b={centro(vagas[0])} p={(c.t - Math.max(caiu(ordem[0].i).inicio, caiu(ordem[1].i).inicio) - 0.4) / 0.6} s={s} /> : null}
        {titulo ? (
          <div style={{ position: "absolute", left: 0.055 * W, top: vertical ? (mapa ? 0.33 * H : 0.16 * H) : mapa ? 0.53 * H : 0.24 * H, ...cam(1.05) }}>
            <TituloMarcado texto={titulo} tam={tamTitulo} p={(c.t - tTitulo) / 0.45} largura={largTitulo} />
          </div>
        ) : null}
        {mapa?.lugar ? (
          <div style={{ position: "absolute", left: vertical ? 0.52 * W : 0.3 * W, top: vertical ? 0.255 * H : 0.4 * H, ...cam(0.7) }}>
            <TiraDePapel txt={texto(mapa.lugar)} tam={34 * s * (vertical ? 1.25 : 1)} p={(c.t - 1.3) / 0.3} rot={-3} />
          </div>
        ) : null}
        {carimbo ? (
          <div style={{ position: "absolute", left: vertical ? 0.07 * W : 0.47 * W, top: vertical ? 0.55 * H : 0.3 * H, ...cam(1.1) }}>
            <Carimbo txt={carimbo} tam={62 * s * (vertical ? 1.2 : 1)} p={c.t - tCarimbo} />
          </div>
        ) : null}
      </AbsoluteFill>
      <Grao c={c} />
    </AbsoluteFill>
  );
}

const MIUDO =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. ";

/**
 * As colunas do jornal: texto miúdo de verdade (ilegível de propósito, só a
 * manchete e o trecho grifado se leem), em serifa cinza justificada, com o
 * TRECHO do apoio no meio da primeira coluna e o marcador amarelo correndo
 * sobre ele (o documento grifado da Vox).
 */
function Colunas({ w, h, s, colunas = 2, trecho, grifo }: { w: number; h: number; s: number; semente?: number; colunas?: number; trecho?: string; grifo?: number }) {
  const corpo = Math.max(9, 10.5 * s);
  const gap = 22 * s;
  const lc = (w - (colunas - 1) * gap) / colunas;
  const corre = doze(saiSuave(limitar(grifo ?? 0)) * 0.5) / 0.5;
  const estilo: React.CSSProperties = { width: lc, height: h, overflow: "hidden", fontFamily: SERIFA, fontSize: corpo, lineHeight: 1.32, color: "rgba(28,24,18,.62)", textAlign: "justify", hyphens: "auto", filter: `blur(${0.25 * s}px)` };
  return (
    <div style={{ display: "flex", gap, width: w, height: h }}>
      {Array.from({ length: colunas }, (_, k) => (
        <div key={k} style={estilo}>
          {k === 0 && trecho ? (
            <>
              {MIUDO.slice(0, 180)}
              <span style={{ display: "block", margin: `${0.5 * corpo}px 0`, fontSize: corpo * 3.2, lineHeight: 1.15, color: TINTA, fontWeight: 700, filter: "none", textAlign: "left" }}>
                <span style={{ backgroundImage: `linear-gradient(${AMARELO}, ${AMARELO})`, backgroundRepeat: "no-repeat", backgroundSize: `${(corre * 100).toFixed(1)}% 80%`, backgroundPosition: "0 75%", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{semAsteriscos(trecho)}</span>
              </span>
            </>
          ) : null}
          {(MIUDO + MIUDO + MIUDO).slice(k * 97)}
        </div>
      ))}
    </div>
  );
}

/** A manchete com o marca-texto no destaque (corre no evento). */
function Manchete({ txt, tam, p }: { txt: string; tam: number; p: number }) {
  const partes = String(txt).split(/\*\*(.+?)\*\*/g);
  const corre = doze(saiSuave(limitar(p)) * 0.5) / 0.5;
  return (
    <div style={{ fontFamily: SERIFA, fontWeight: 900, fontSize: tam, lineHeight: 1.08, color: TINTA, letterSpacing: "-0.01em" }}>
      {partes.map((x, i) =>
        i % 2 === 0 ? (
          <React.Fragment key={i}>{x}</React.Fragment>
        ) : (
          <span key={i} style={{ backgroundImage: `linear-gradient(${AMARELO}, ${AMARELO})`, backgroundRepeat: "no-repeat", backgroundSize: `${(corre * 100).toFixed(1)}% 78%`, backgroundPosition: "0 70%", padding: "0 0.06em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", mixBlendMode: "multiply" }}>
            {x}
          </span>
        )
      )}
    </div>
  );
}

/** JORNAL: o recorte de jornal rasgado com a manchete; a foto salta do papel para a frente. */
export function Jornal(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const cam = camera(c, 2);
  const manchete = texto(c.props.manchete, "");
  const apoio = texto(c.props.apoio);
  const data = texto(c.props.data);
  const foto = c.props.foto && typeof c.props.foto === "object" ? (c.props.foto as Foto) : null;
  const jw = vertical ? 0.94 * W : 0.6 * W;
  const jh = vertical ? 0.6 * H : 0.84 * H;
  const pad = 40 * s;
  const tam = Math.min(vertical ? 104 * s : 112 * s, (jw - 2 * pad) / Math.max(6, semAsteriscos(manchete).length * 0.27));
  const tEvento = eventoOu(c, 0, 1.0);
  const q = foto ? queda(c.t, 0.7, vertical ? 3 : 4, s) : null;
  // A foto salta do papel para a frente (a profundidade); dentro do jornal, só o texto.
  const fotoNoJornal: Foto | null = null;
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...varredura(c) }}>
      <Filtros s={s} />
      <Papel c={c} cam={cam} manuscrito={vertical ? { x: -0.2 * W, y: 0.55 * H, w: 0.9 * W, rot: -5, opacidade: 0.45 } : { x: 0.62 * W, y: 0.05 * H, w: 0.4 * W, rot: 4, opacidade: 0.5 }} />
      <div style={{ position: "absolute", left: vertical ? 0.03 * W : 0.06 * W, top: vertical ? 0.07 * H : 0.08 * H, transform: "rotate(-2.2deg)", ...cam(0.75) }}>
        <div style={{ position: "relative", width: jw, height: jh, filter: `drop-shadow(0 ${14 * s}px ${18 * s}px rgba(20,12,4,.5))` }}>
          <div style={{ position: "absolute", inset: -6 * s, background: "#f6f0e2", clipPath: rasgado(jw + 12 * s, jh + 12 * s, 8, 18 * s) }} />
          <div style={{ position: "absolute", inset: 0, clipPath: rasgado(jw, jh, 6, 16 * s), background: "#e9e0cb", overflow: "hidden" }}>
            <Img src={staticFile("vox/papel.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, mixBlendMode: "multiply", filter: "grayscale(.6)" }} />
            <div style={{ position: "absolute", left: pad, right: pad, top: pad * 0.9 }}>
              <div style={{ borderTop: `${3 * s}px solid ${TINTA}`, borderBottom: `${1 * s}px solid ${TINTA}`, height: 7 * s, opacity: 0.8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SERIFA, fontSize: 18 * s * (vertical ? 1.3 : 1), color: "rgba(22,19,14,.7)", padding: `${6 * s}px 0`, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                <span>{data || "✦ ✦ ✦"}</span>
                <span>{data ? "✦ ✦ ✦" : ""}</span>
              </div>
              <div style={{ borderTop: `${1 * s}px solid ${TINTA}`, opacity: 0.8, marginBottom: 18 * s }} />
              <Manchete txt={manchete} tam={tam} p={(c.t - tEvento) / 0.5} />

              <div style={{ display: "flex", gap: 22 * s, marginTop: 22 * s }}>
                <Colunas w={(jw - 2 * pad) * (fotoNoJornal ? 0.52 : 1)} h={jh * (vertical ? 0.5 : 0.46)} s={s * (vertical ? 1.2 : 1)} colunas={vertical ? 2 : 3} trecho={apoio} grifo={(c.t - tEvento - 0.6) / 0.5} />
                {fotoNoJornal ? (
                  <div style={{ width: (jw - 2 * pad) * 0.45, height: jh * 0.36, overflow: "hidden", background: "#cfc6b2", position: "relative" }}>
                    <FotoMeioTom foto={fotoNoJornal} s={s} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      {foto && q?.visivel ? (
        <div style={{ position: "absolute", right: vertical ? -0.04 * W : 0.0 * W, bottom: vertical ? 0.02 * H : -0.04 * H, height: vertical ? 0.36 * H : 0.78 * H, ...cam(1.3) }}>
          <div style={q.estilo}>
            <Recorte foto={foto} altura={vertical ? 0.36 * H : 0.78 * H} s={s} sombra={q.sombra} tarja={foto.censura ? (c.t - 1.3) / 0.35 : 0} />
          </div>
        </div>
      ) : null}
      <Grao c={c} />
    </AbsoluteFill>
  );
}

/** A foto impressa no jornal: meio-tom (pontos) e tinta. */
function FotoMeioTom({ foto, s }: { foto: Foto; s: number }) {
  const ok = useFotoCarregada(foto.url);
  const f = fonteDaFoto(foto, ok);
  return (
    <>
      <Img src={f.src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", filter: "grayscale(1) contrast(1.5) brightness(.95)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(rgba(233,224,203,.7) 32%, transparent 36%)`, backgroundSize: `${5 * s}px ${5 * s}px`, mixBlendMode: "screen" }} />
    </>
  );
}

/** MAPA ANTIGO: o mapa rasgado ocupa a tela, a câmera chega no lugar e o círculo vermelho se desenha no evento. */
export function MapaAntigo(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const cam = camera(c, 3);
  const alvo = { x: limitar(Number(c.props.x ?? 0.55), 0.15, 0.85), y: limitar(Number(c.props.y ?? 0.45), 0.2, 0.8) };
  const lugar = texto(c.props.lugar);
  const titulo = texto(c.props.titulo);
  const foto = c.props.foto && typeof c.props.foto === "object" ? ({ assunto: "lugar", ...(c.props.foto as Foto) } as Foto) : null;
  const tEvento = eventoOu(c, 0, 0.8);
  const mw = vertical ? 1.06 * W : 0.8 * W;
  const mh = vertical ? 0.56 * H : 0.9 * H;
  const zoom = 1 + 0.22 * saiSuave(limitar(c.t / Math.max(1, c.dur)));
  const ml = vertical ? -0.03 * W : 0.03 * W;
  const mt = vertical ? 0.05 * H : 0.04 * H;
  const qf = foto ? queda(c.t, Math.min(c.dur - 1, tEvento + 0.6), 4, s) : null;
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...varredura(c) }}>
      <Filtros s={s} />
      <Papel c={c} cam={cam} manuscrito={vertical ? { x: 0.1 * W, y: 0.6 * H, w: 0.9 * W, rot: -3 } : { x: 0.7 * W, y: 0.35 * H, w: 0.34 * W, rot: 5 }} />
      <div style={{ position: "absolute", left: ml, top: mt, transform: "rotate(-1deg)", ...cam(0.6) }}>
        <MapaRasgado w={mw} h={mh} s={s} semente={9} alvo={alvo} circulo={(c.t - tEvento) / 0.9} zoom={zoom} raio={0.1} />
      </div>
      {lugar ? (
        <div style={{ position: "absolute", left: ml + mw * alvo.x + Math.min(mw, mh) * 0.16, top: mt + mh * (alvo.y + (alvo.y - 0.5) * (zoom - 1)) - 20 * s, ...cam(0.8) }}>
          <TiraDePapel txt={lugar} tam={40 * s * (vertical ? 1.3 : 1)} p={(c.t - tEvento - 0.5) / 0.3} rot={-3} />
        </div>
      ) : null}
      {titulo ? (
        <div style={{ position: "absolute", left: 0.06 * W, top: vertical ? 0.6 * H : 0.08 * H, ...cam(1) }}>
          <TituloMarcado texto={titulo} tam={vertical ? 104 * s : 78 * s} p={(c.t - 0.35) / 0.45} largura={vertical ? 0.86 * W : 0.5 * W} />
        </div>
      ) : null}
      {foto && qf?.visivel ? (
        <div style={{ position: "absolute", right: vertical ? 0.06 * W : 0.04 * W, top: vertical ? 0.76 * H : 0.42 * H, ...cam(1.25) }}>
          <div style={qf.estilo}>
            <FotoImpressa foto={foto} largura={vertical ? 0.52 * W : 0.3 * W} s={s} />
          </div>
        </div>
      ) : null}
      <Grao c={c} />
    </AbsoluteFill>
  );
}

/** A foto de lugar como cópia em papel fotográfico, borda branca e fita. */
function FotoImpressa({ foto, largura, s }: { foto: Foto; largura: number; s: number }) {
  const ok = useFotoCarregada(foto.url);
  const f = fonteDaFoto(foto, ok);
  return (
    <div style={{ width: largura, background: "#f4eee0", padding: largura * 0.04, paddingBottom: largura * 0.1, boxShadow: `0 ${14 * s}px ${26 * s}px rgba(20,12,4,.5), 0 ${2 * s}px ${4 * s}px rgba(0,0,0,.3)`, position: "relative" }}>
      <Img src={f.src} style={{ width: "100%", display: "block", aspectRatio: "4 / 3", objectFit: "cover", filter: "grayscale(1) contrast(1.15) sepia(.2)" }} />
      <div style={{ position: "absolute", left: "35%", top: -12 * s, width: largura * 0.3, height: 30 * s, background: "rgba(236,226,196,.78)", transform: "rotate(-4deg)" }} />
    </div>
  );
}

/** CENSURA: a estátua (ou figura fictícia) grande e a tarja amarela que bate sobre os olhos. */
export function Censura(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const cam = camera(c, 4);
  const figura: Foto = { assunto: "estatua", ...(c.props.figura && typeof c.props.figura === "object" ? (c.props.figura as Foto) : {}) };
  if (!comRosto(String(figura.assunto))) figura.assunto = "estatua";
  const palavra = texto(c.props.palavra);
  const titulo = texto(c.props.titulo);
  const tEvento = eventoOu(c, 0, Math.min(c.dur * 0.4, 1.4));
  const q = queda(c.t, 0.25, vertical ? 0 : -1, s);
  const tr = tremor(c.t, tEvento + 0.12, s);
  const tr2 = tremor(c.t, tEvento + 0.55, s * 0.6);
  const alt = vertical ? 0.66 * H : 1.02 * H;
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...varredura(c) }}>
      <Filtros s={s} />
      <AbsoluteFill style={{ transform: `translate(${tr.x + tr2.x}px, ${tr.y + tr2.y}px)` }}>
        <Papel c={c} cam={cam} manuscrito={vertical ? { x: -0.1 * W, y: 0.02 * H, w: 1.15 * W, rot: -3, opacidade: 0.55 } : { x: 0.02 * W, y: -0.1 * H, w: 0.55 * W, rot: -4, opacidade: 0.6 }} />
        {q.visivel ? (
          <div style={{ position: "absolute", ...(vertical ? { left: 0, right: 0, display: "flex", justifyContent: "center" } : { right: 0.06 * W }), bottom: vertical ? -0.01 * H : -0.04 * H, height: alt, ...cam(1.25) }}>
            <div style={q.estilo}>
              <Recorte foto={figura} altura={alt} s={s} tarja={(c.t - tEvento) / 0.35} sombra={q.sombra} />
            </div>
          </div>
        ) : null}
        {titulo ? (
          <div style={{ position: "absolute", left: 0.06 * W, top: vertical ? 0.1 * H : 0.3 * H, ...cam(1) }}>
            <TituloMarcado texto={titulo} tam={vertical ? 96 * s : 88 * s} p={(c.t - 0.45) / 0.45} largura={vertical ? 0.88 * W : 0.44 * W} />
          </div>
        ) : null}
        {palavra ? (
          <div style={{ position: "absolute", left: vertical ? 0.1 * W : 0.08 * W, top: vertical ? 0.7 * H : 0.62 * H, ...cam(1.1) }}>
            <Carimbo txt={palavra} tam={vertical ? 84 * s : 74 * s} p={c.t - tEvento - 0.55} />
          </div>
        ) : null}
      </AbsoluteFill>
      <Grao c={c} />
    </AbsoluteFill>
  );
}

/**
 * MARCA-TEXTO: a frase serifada preta na faixa amarela, sobre a pessoa, num
 * pedaço de papel rasgado com sombra (a profundidade que o juiz pediu na
 * prova de 04/10: a faixa sozinha parecia cartão colado). No 9:16 nunca na
 * altura do rosto: "topo" fica acima da cabeça e "centro" desce para o peito.
 */
export function MarcaTexto(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical, u } = c;
  const s = Math.min(W, H) / 1080;
  const txt = texto(c.props.texto);
  const pos = texto(c.props.posicao, "topo");
  const larg = vertical ? 0.86 * W : 0.44 * W;
  const tam = Math.min(vertical ? 74 * u : 88 * u, (larg / Math.max(6, semAsteriscos(txt).length)) * 2.9);
  const topo = pos === "centro" ? (vertical ? 0.63 : 0.58) * H : (vertical ? 0.1 : 0.09) * H;
  const papel = saiSuave(limitar(doze(c.t) / 0.25));
  return (
    <AbsoluteFill style={{ opacity: c.fica }}>
      <div style={{ position: "absolute", left: vertical ? 0.06 * W : 0.05 * W, top: topo, maxWidth: larg + 90 * s }}>
        <div style={{ position: "relative", padding: `${26 * s}px ${34 * s}px ${30 * s}px`, opacity: papel > 0 ? 1 : 0, transform: `rotate(${(1.6 - 2 * (1 - papel)).toFixed(2)}deg) scale(${(1.08 - 0.08 * papel).toFixed(3)})` }}>
          <div style={{ position: "absolute", inset: 0, filter: `drop-shadow(0 ${12 * s}px ${16 * s}px rgba(15,10,4,.55))` }}>
            <div style={{ position: "absolute", inset: 0, clipPath: rasgadoPct(5, 6), overflow: "hidden", background: "#d9c7a0" }}>
              <Img src={staticFile("vox/papel.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "sepia(.3)" }} />
              <Img src={staticFile("vox/manuscrito.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.35 }} />
            </div>
          </div>
          <TituloMarcado texto={txt} tam={tam} p={(c.t - 0.12) / 0.45} largura={larg} rot={-1.6} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** CARIMBO: o carimbo vermelho batendo sobre a pessoa. */
export function CarimboSobre(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical, u } = c;
  const s = Math.min(W, H) / 1080;
  const lado = texto(c.props.lado, "direita");
  return (
    <AbsoluteFill style={{ opacity: c.fica }}>
      <Filtros s={s} />
      <div style={{ position: "absolute", top: (vertical ? 0.2 : 0.14) * H, ...(lado === "esquerda" ? { left: 0.07 * W } : { right: 0.07 * W }) }}>
        <div style={{ background: "rgba(242,234,216,.0)" }}>
          <Carimbo txt={texto(c.props.texto)} tam={vertical ? 96 * u : 110 * u} p={c.t - 0.05} rot={lado === "esquerda" ? -9 : 8} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/**
 * CRONOLOGIA: a linha do tempo da Vox em papel. Uma tira rasgada com a régua
 * de tinta atravessa a tela; a câmera anda até o marco dito (um evento por
 * marco), o ano grande ganha o marcador amarelo, a etiqueta de papel traz o
 * que aconteceu e a foto de arquivo do marco cai pendurada por fita.
 */
export function Cronologia(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const marcos = lista<{ ano?: string | number; rotulo?: string; foto?: Foto }>(c.props.marcos).slice(0, 5);
  const titulo = texto(c.props.titulo);
  const n = Math.max(1, marcos.length);
  const passo = vertical ? 0.62 * W : 0.36 * W;
  const ev = (i: number) => c.eventosLocais?.[i] ?? 0.5 + i * 0.9;
  // O marco atual (o último que já foi dito) e o deslizar da câmera até ele.
  let atual = 0;
  for (let i = 0; i < n; i++) if (c.t >= ev(i)) atual = i;
  const anterior = Math.max(0, atual - 1);
  const p = saiSuave(limitar((c.t - ev(atual)) / 0.7));
  const foco = atual === 0 ? 0 : anterior + (atual - anterior) * p;
  const yFaixa = vertical ? 0.56 * H : 0.6 * H;
  const hFaixa = vertical ? 0.09 * H : 0.13 * H;
  const x0 = W * 0.5 - foco * passo;
  const comp = passo * (n - 1) + W * 1.4;
  const cam = camera(c, 5);
  return (
    <AbsoluteFill style={{ overflow: "hidden", ...varredura(c) }}>
      <Filtros s={s} />
      <Papel c={c} cam={cam} manuscrito={vertical ? { x: -0.1 * W, y: 0.62 * H, w: 1.1 * W, rot: -3, opacidade: 0.5 } : { x: 0.55 * W, y: -0.1 * H, w: 0.45 * W, rot: 4, opacidade: 0.55 }} />
      {titulo ? (
        <div style={{ position: "absolute", left: 0.06 * W, top: vertical ? 0.08 * H : 0.05 * H, ...cam(1) }}>
          <TituloMarcado texto={titulo} tam={vertical ? 92 * s : 80 * s} p={(c.t - 0.3) / 0.45} largura={vertical ? 0.86 * W : 0.6 * W} />
        </div>
      ) : null}
      <div style={{ position: "absolute", left: x0 - W * 0.7, top: yFaixa, width: comp, height: hFaixa, filter: `drop-shadow(0 ${10 * s}px ${14 * s}px rgba(20,12,4,.45))` }}>
        <div style={{ position: "absolute", inset: 0, background: "#efe6cf", clipPath: rasgado(comp, hFaixa, 21, 12 * s, "tb") }}>
          <Img src={staticFile("vox/papel.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55, mixBlendMode: "multiply" }} />
          <svg width={comp} height={hFaixa} style={{ position: "absolute", inset: 0 }}>
            <line x1={0} y1={hFaixa * 0.5} x2={comp} y2={hFaixa * 0.5} stroke={TINTA} strokeWidth={3 * s} />
            {Array.from({ length: Math.floor(comp / (passo / 10)) }, (_, k) => (
              <line key={k} x1={k * (passo / 10) + (W * 0.7) % (passo / 10)} x2={k * (passo / 10) + (W * 0.7) % (passo / 10)} y1={hFaixa * 0.5} y2={hFaixa * (k % 10 === 0 ? 0.2 : 0.36)} stroke={TINTA} strokeWidth={(k % 5 === 0 ? 2.4 : 1.2) * s} opacity={0.8} />
            ))}
          </svg>
        </div>
      </div>
      {marcos.map((m, i) => {
        const x = x0 + i * passo;
        const dito = c.t >= ev(i);
        const pm = limitar((c.t - ev(i)) / 0.5);
        const q = m.foto ? queda(c.t, ev(i) + 0.15, i % 2 ? 4 : -4, s) : null;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: x, top: yFaixa + hFaixa * 0.5, width: 18 * s, height: 18 * s, marginLeft: -9 * s, marginTop: -9 * s, borderRadius: "50%", background: dito ? VERMELHO : TINTA, boxShadow: "0 2px 3px rgba(0,0,0,.4)" }} />
            <div style={{ position: "absolute", left: x, top: yFaixa - (vertical ? 0.085 : 0.13) * H, transform: "translateX(-50%)", whiteSpace: "nowrap", fontFamily: SERIFA, fontWeight: 900, fontSize: (vertical ? 88 : 100) * s, color: dito ? TINTA : "rgba(22,19,14,.35)", lineHeight: 1 }}>
              <span style={{ backgroundImage: `linear-gradient(${AMARELO}, ${AMARELO})`, backgroundRepeat: "no-repeat", backgroundSize: `${(i === atual && dito ? doze(saiSuave(pm) * 0.5) / 0.5 : 0) * 100}% 70%`, backgroundPosition: "0 80%", padding: "0 0.12em" }}>{String(m.ano ?? "")}</span>
            </div>
            {m.rotulo ? (
              <div style={{ position: "absolute", left: x, top: yFaixa + hFaixa * 1.15, transform: "translateX(-50%)", opacity: dito ? 1 : 0.35, maxWidth: passo * 0.9 }}>
                <TiraDePapel txt={texto(m.rotulo)} tam={(vertical ? 38 : 34) * s} p={dito ? 1 : 1} rot={i % 2 ? 2 : -2} />
              </div>
            ) : null}
            {m.foto && q?.visivel ? (
              <div style={{ position: "absolute", left: x, bottom: H - yFaixa + (vertical ? 0.1 : 0.14) * H, transform: "translateX(-50%)" }}>
                <div style={q.estilo}>
                  <Recorte foto={m.foto} altura={(vertical ? 0.17 : 0.22) * H} s={s} sombra={q.sombra} />
                </div>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      <Grao c={c} />
    </AbsoluteFill>
  );
}

/**
 * FUNDO DE COLAGEM (04/10, segunda volta da prova): o juiz derrubava o Vox
 * nos trechos de "cabeça falando" (nota 3 a 4 contra 8 nas telas de papel).
 * No Vox a pessoa vive DENTRO da colagem, como no quadro de treino: esta
 * camada vai na passada "atras" (por baixo da pessoa recortada) e troca a
 * parede da gravação por papel envelhecido, manuscrito, um pedaço de mapa e
 * dois recortes de arquivo nas bordas, atrás da pessoa. O resolvedor põe
 * sozinho em todo trecho com a pessoa cheia (camada de apoio).
 */
export function FundoColagem(c: Ctx) {
  usarAcentos(c);
  const { W, H, vertical } = c;
  const s = Math.min(W, H) / 1080;
  const k = Math.round(Number(c.props.semente ?? 0));
  const fotos = lista<Foto>(c.props.recortes);
  const f1: Foto = fotos[k % Math.max(1, fotos.length)] ?? { assunto: ["predio", "estatua", "documento"][k % 3] };
  const f2: Foto = fotos[(k + 1) % Math.max(1, fotos.length)] ?? { assunto: ["documento", "predio", "figura"][k % 3] };
  const esquerdaMapa = k % 2 === 0;
  const parado = () => ({}) as React.CSSProperties;
  return (
    // data-atras: a passada "atras" só mostra o que leva a marca (Camadas.tsx).
    <AbsoluteFill data-atras="" style={{ overflow: "hidden" }}>
      <Filtros s={s} />
      <Papel c={c} cam={parado} manuscrito={vertical ? { x: (esquerdaMapa ? 0.25 : -0.15) * W, y: 0.12 * H, w: 0.95 * W, rot: esquerdaMapa ? 4 : -4, opacidade: 0.7 } : { x: (esquerdaMapa ? 0.5 : 0.02) * W, y: -0.05 * H, w: 0.45 * W, rot: 3, opacidade: 0.7 }} />
      <div style={{ position: "absolute", left: esquerdaMapa ? -0.08 * W : undefined, right: esquerdaMapa ? undefined : -0.08 * W, top: vertical ? 0.03 * H : -0.06 * H, transform: `rotate(${esquerdaMapa ? -3 : 3}deg)` }}>
        <MapaRasgado w={vertical ? 0.62 * W : 0.42 * W} h={vertical ? 0.2 * H : 0.46 * H} s={s} semente={k + 11} alvo={{ x: 0.5, y: 0.5 }} circulo={0} />
      </div>
      <div style={{ position: "absolute", left: -0.06 * W, bottom: vertical ? 0.06 * H : -0.04 * H, height: (vertical ? 0.3 : 0.62) * H, transform: "rotate(-3deg)" }}>
        {String(f1.assunto) === "lugar" ? <FotoImpressa foto={f1} largura={(vertical ? 0.5 : 0.3) * W} s={s} /> : <Recorte foto={f1} altura={(vertical ? 0.3 : 0.62) * H} s={s} />}
      </div>
      <div style={{ position: "absolute", ...(esquerdaMapa ? { right: 0.02 * W } : { left: 0.02 * W }), top: vertical ? 0.03 * H : 0.06 * H, height: (vertical ? 0.22 : 0.48) * H, transform: `rotate(${esquerdaMapa ? 4 : -4}deg)` }}>
        {String(f2.assunto) === "lugar" ? <FotoImpressa foto={f2} largura={(vertical ? 0.38 : 0.24) * W} s={s} /> : <Recorte foto={f2} altura={(vertical ? 0.22 : 0.48) * H} s={s} />}
      </div>
      <Grao c={c} forca={0.8} />
    </AbsoluteFill>
  );
}

