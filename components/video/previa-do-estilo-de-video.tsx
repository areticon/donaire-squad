"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BarChart3, CalendarDays, Film, MessageCircle } from "lucide-react";
import { acentosParaDesenhar, type AcentosDoVox } from "@/lib/media/acentos-do-vox";
import { LETRAS, type LetraId, type PapeisEscolhidos } from "@/lib/modelos-de-arte/identidade";

/**
 * "SEU VÍDEO VAI FICAR ASSIM" (03/10/2026, book de modelos; refeito em 04/10).
 *
 * Ao tocar num dos três estilos em destaque, o cliente vê a fonte do estilo, as
 * cores da marca dele e quatro quadros de exemplo, desenhados aqui em código
 * (instantâneo e de graça) com o mesmo acabamento das peças do editor sob medida
 * (worker/remotion/src/sob-medida): a lousa com a pilha 3D acesa, a busca de
 * vidro e a palavra gigante; a autoridade high ticket no acabamento de luxo
 * (dourado metálico, serifa, o número com a régua, o selo com o nome, a pilha
 * de ouro); o Vox na colagem da referência do dono (docs/overlays/referencias/vox/
 * bruno-0410/vox-01.png): papel velho, mapa rasgado, manuscrito, recortes P&B com
 * a tarja de censura (estátua genérica e figura fictícia) e o título na faixa.
 *
 * A primeira versão punha uma silhueta preta sobre a foto genérica do setor
 * (um barco ao pôr do sol, para quem era do setor náutico) e o dono achou
 * péssimo: o fundo de cada quadro agora é a foto de um apresentador FICTÍCIO,
 * gerada uma vez por IA no cenário do estilo (public/estilos-de-video/fotos,
 * scripts/tmp/previa-estilos-fotos-0410.mts). Nunca pessoa real.
 *
 * AS CORES DA MARCA DE VERDADE (05/10). O Bruno, com a paleta #B3001B e
 * #111111, viu a faixa do título e o marca-texto do Vox em ROSA: a prévia
 * clareava todo acento escuro (misturava 35% de branco "para ler melhor") e
 * escolhia a cor por conta própria. Agora as peças de papel usam a MESMA
 * conta da montagem (lib/media/acentos-do-vox.ts, a hierarquia da paleta): a
 * faixa, o marca-texto e a tarja no destaque, a letra por cima na cor que
 * contrasta, os títulos e o carimbo na outra cor principal quando ela é
 * escura; a identidade aprovada no book entra na frente, quando existe. E o
 * texto dos quadros é o do próprio roteiro do cliente (a linha editorial),
 * não a frase genérica.
 */

interface Cores {
  acento: string;
  escuro: string;
  claro: string;
}

/** O que a tela sabe da identidade aprovada no book (GET modelos-de-arte, `identidade`). */
interface Identidade {
  letra: LetraId;
  papeis: PapeisEscolhidos;
  paleta: string[];
  aprovada: boolean;
}

/** Os textos de exemplo tirados do roteiro do cliente (a linha editorial), com o genérico de reserva. */
interface TextosDaPrevia {
  /** De onde vieram, para a tela dizer. */
  doRoteiro: boolean;
  titulo1: string;
  titulo2: string;
  citacao: { antes: string; marcado: string };
  pergunta: string;
  resposta: { antes: string; marcado: string };
}

const TEXTOS_GENERICOS: TextosDaPrevia = {
  doRoteiro: false,
  titulo1: "Por que o cliente some",
  titulo2: "O que ninguém te conta",
  citacao: { antes: "Quem é lembrado", marcado: "é escolhido." },
  pergunta: "Sem tempo de gravar?",
  resposta: { antes: "Uma gravação vira a", marcado: "semana" },
};

type RoteiroDaLinha = { titulo?: string; tese?: string | null; gancho?: string | null; status?: string; cenas?: Array<{ papel?: string; fala?: string }> | null };

/** A primeira frase de um texto, até o limite, cortada em palavra inteira. */
function primeiraFrase(t: string | null | undefined, max: number): string {
  const limpo = String(t ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  const frase = limpo.split(/(?<=[.!?])\s+/)[0] ?? limpo;
  if (frase.length <= max) return frase;
  const corte = frase.slice(0, max).replace(/\s+\S*$/, "");
  return `${corte}…`;
}

/** As últimas palavras marcadas (o marca-texto), o resto antes. */
function comMarca(frase: string, palavras = 2): { antes: string; marcado: string } {
  const partes = frase.replace(/[.]+$/, "").split(" ");
  if (partes.length <= palavras) return { antes: "", marcado: frase };
  return { antes: partes.slice(0, -palavras).join(" "), marcado: partes.slice(-palavras).join(" ") + (frase.endsWith(".") ? "." : "") };
}

/** Os textos dos quadros a partir dos roteiros da linha editorial do cliente (o gravado ou pronto na frente). */
function textosDoRoteiro(roteiros: RoteiroDaLinha[]): TextosDaPrevia {
  const ordem = (r: RoteiroDaLinha) => (r.status === "gravado" ? 0 : r.status === "pronto" ? 1 : 2);
  const lista = roteiros.filter((r) => r.titulo?.trim()).sort((a, b) => ordem(a) - ordem(b));
  const r1 = lista[0];
  if (!r1?.titulo) return TEXTOS_GENERICOS;
  const r2 = lista[1];
  const falas = (r1.cenas ?? []).map((c) => String(c.fala ?? "")).filter(Boolean);
  const pergunta = falas.map((f) => primeiraFrase(f, 44)).find((f) => f.endsWith("?")) ?? (r1.titulo.length <= 40 ? `${r1.titulo.replace(/[?.!]+$/, "")}?` : TEXTOS_GENERICOS.pergunta);
  const tese = primeiraFrase(r1.tese, 72) || primeiraFrase(falas[0], 72) || primeiraFrase(r1.gancho, 72);
  const resposta = primeiraFrase(r2?.titulo ?? r1.titulo, 36);
  return {
    doRoteiro: true,
    titulo1: r1.titulo,
    titulo2: r2?.titulo || primeiraFrase(r1.gancho, 40) || TEXTOS_GENERICOS.titulo2,
    citacao: tese ? comMarca(tese) : TEXTOS_GENERICOS.citacao,
    pergunta,
    resposta: resposta ? comMarca(resposta, 1) : TEXTOS_GENERICOS.resposta,
  };
}

/**
 * O título em caixa alta, quebrado em linhas que cabem na faixa (até 3), e
 * o tamanho da letra pelo comprimento da maior linha (a faixa tem ~980 px).
 */
function linhasDaFaixa(titulo: string, maxLinhas = 3, porLinha = 16): { linhas: string[]; tam: number } {
  const palavras = titulo.replace(/[?.!]+$/, "").toUpperCase().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if (atual && (atual + " " + p).length > porLinha) {
      linhas.push(atual);
      atual = p;
    } else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) linhas.push(atual);
  const cabem = linhas.slice(0, maxLinhas);
  if (linhas.length > maxLinhas) cabem[maxLinhas - 1] = `${cabem[maxLinhas - 1]}…`;
  const maior = Math.max(1, ...cabem.map((l) => l.length));
  return { linhas: cabem, tam: Math.max(58, Math.min(96, Math.floor(980 / (maior * 0.66)))) };
}

/** O tamanho da letra para uma linha única caber na largura dada (serifa pesada, ~0,56 em por letra). */
function tamQueCabe(texto: string, largura: number, max: number, min = 34): number {
  return Math.max(min, Math.min(max, Math.floor(largura / (Math.max(1, texto.length) * 0.56))));
}

const FICHA: Record<string, { fonte: string; peso: number; acabamento: string }> = {
  lousa: { fonte: "Geist", peso: 600, acabamento: "Estúdio tecnológico em azul, como nos quadros do Dan Martell: palavra gigante, busca de vidro digitando, passos em 3D que acendem, legenda com a palavra sublinhada e ferramentas em placas." },
  consorcio: { fonte: "Playfair Display", peso: 700, acabamento: "Acabamento de luxo: preto e marinho, dourado metálico, serifa elegante, o número com régua e o selo com o seu nome." },
  vox: { fonte: "Playfair Display", peso: 700, acabamento: "Colagem em papel velho: mapa antigo rasgado com o círculo, manuscrito ao fundo, recortes em preto e branco com a tarja nos olhos, título serifado na faixa e marca-texto da sua cor." },
};

/** Os estilos com prévia própria; os outros mostram a ficha genérica. */
export function temPreviaDeVideo(estiloId: string): boolean {
  return estiloId in FICHA;
}

function useFontesDoVideo() {
  useEffect(() => {
    if (document.getElementById("fontes-do-video")) return;
    const l = document.createElement("link");
    l.id = "fontes-do-video";
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@500&family=Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,500;1,700&family=UnifrakturMaguntia&display=swap";
    document.head.appendChild(l);
  }, []);
}

// ─────────────────────────────── cores ───────────────────────────────

function hex6(hex: string) {
  const c = hex.replace("#", "");
  return c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6).padEnd(6, "0");
}
function rgb(hex: string): [number, number, number] {
  const f = hex6(hex);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0) as [number, number, number];
}
function rgba(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function misturar(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
/** Sorteio determinístico (os rasgos saem sempre iguais). */
function sorteio(semente: number) {
  let s = semente >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─────────────────────────────── base ───────────────────────────────

const GEIST = "'Geist', system-ui, sans-serif";
const PESADA = "'Geist', 'Liberation Sans', Arial, sans-serif";
const SERIFA = "'Playfair Display', Georgia, serif";
const JORNAL = "Georgia, 'Times New Roman', serif";

/** A foto do apresentador fictício, com enquadramento e tratamento por quadro. */
function Foto({ nome, escala = 1, origem = "50% 100%", filtro, posicao = "50% 50%", desce = 0, estilo }: { nome: string; escala?: number; origem?: string; filtro?: string; posicao?: string; desce?: number; estilo?: CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/estilos-de-video/fotos/${nome}.webp`}
      alt=""
      draggable={false}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: posicao, transform: `translateY(${desce}px) scale(${escala})`, transformOrigin: origem, filter: filtro, ...estilo }}
    />
  );
}

const Camada = ({ fundo, estilo }: { fundo: string; estilo?: CSSProperties }) => <div style={{ position: "absolute", inset: 0, background: fundo, ...estilo }} />;

// ─────────────────────────────── lousa ───────────────────────────────

const brilhoBranco = (k = 1) => `0 0 ${8 * k}px rgba(255,255,255,.7), 0 0 ${24 * k}px rgba(255,255,255,.4), 0 0 ${60 * k}px rgba(255,255,255,.18)`;

/** Um losango da pilha isométrica, como o PilhaPassos do editor. */
function Losango({ n, x, y, dw, aceso, ativo, a, luxo = false }: { n: number; x: number; y: number; dw: number; aceso: boolean; ativo: boolean; a: string; luxo?: boolean }) {
  const lado = dw / Math.SQRT2;
  const dh = dw * 0.52;
  const l = ativo ? 1 : aceso ? 0.55 : 0;
  const quadrado = (extra: CSSProperties, conteudo?: ReactNode) => (
    <div style={{ position: "absolute", left: (dw - lado) / 2, top: (dw - lado) / 2, width: lado, height: lado, borderRadius: lado * 0.2, transform: "scaleY(0.52) rotate(45deg)", transformOrigin: "50% 50%", ...extra }}>{conteudo}</div>
  );
  return (
    <div style={{ position: "absolute", left: x - dw / 2, top: y - dw / 2 - (ativo ? 10 : 0), width: dw, height: dw, zIndex: n }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${dh * 0.1}px)` }}>
        {quadrado({
          background: luxo ? "linear-gradient(135deg, #c9a24a, #6e5017 60%, #2a1f08)" : "linear-gradient(135deg, #b9c0ca, #5d6470 60%, #2a2f37)",
          boxShadow: l ? `0 0 ${50 * l}px ${rgba(a, 0.95 * l)}, 0 0 ${130 * l}px ${rgba(a, 0.65 * l)}, 0 0 ${240 * l}px ${rgba(a, 0.3 * l)}` : "none",
        })}
      </div>
      {quadrado(
        {
          background: luxo
            ? "linear-gradient(145deg, #fff4c8 0%, #9c7426 14%, #f7e7a8 28%, #6e5017 42%, #f3dc94 56%, #8a6a23 72%, #fff1bf 86%, #7a5a1c 100%)"
            : "linear-gradient(135deg, #ffffff, #c9cfd8 40%, #f4f6f9 70%, #9aa2ad)",
          padding: lado * 0.045,
          boxShadow: l ? `0 0 ${30 * l}px ${rgba(misturar(a, "#ffffff", 0.2), l)}, 0 0 ${90 * l}px ${rgba(a, 0.6 * l)}` : "0 0 12px rgba(255,255,255,.22)",
        },
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: lado * 0.17,
            background: luxo ? (aceso ? "radial-gradient(circle at 30% 30%, #1a2a4a, #070c18 75%)" : "radial-gradient(circle at 30% 30%, #121a2c, #05070d 75%)") : aceso ? `radial-gradient(circle at 30% 30%, ${misturar(a, "#0b1a2a", 0.68)}, #071019 75%)` : "radial-gradient(circle at 30% 30%, #1a2230, #06090e 75%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: GEIST, fontWeight: 700, fontSize: lado * 0.46, color: "#ffffff", transform: "rotate(-12deg) scale(1.05, 1.25)", textShadow: aceso ? `0 0 12px ${rgba(a, 0.9)}` : "none", lineHeight: 1, ...(luxo ? { fontFamily: SERIFA, ...tintaDeOuro, textShadow: "none" } : {}) }}>{n}</span>
        </div>
      )}
    </div>
  );
}

function SetaDoMouse({ tam, cor }: { tam: number; cor: string }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ overflow: "visible", filter: `drop-shadow(0 ${tam * 0.06}px ${tam * 0.1}px rgba(0,0,0,.4))` }}>
      <path d="M3 2 L21 10.5 L13 12.6 L9.6 21 Z" fill={cor} stroke={misturar(cor, "#ffffff", 0.5)} strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
  );
}

/** A palavra com a barra do acento embaixo (a legenda-destaque do editor). */
function Sublinha({ children, fundo, brilho }: { children: ReactNode; fundo: string; brilho: string }) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      <span aria-hidden style={{ position: "absolute", left: "-0.02em", right: "-0.02em", bottom: "-0.16em", height: "0.14em", borderRadius: 999, background: fundo, boxShadow: `0 0 14px ${brilho}` }} />
    </span>
  );
}

function legenda(top: number, conteudo: ReactNode, tam = 62): ReactNode {
  return (
    <div style={{ position: "absolute", left: 64, right: 64, top, textAlign: "center", fontFamily: GEIST, fontWeight: 700, fontSize: tam, lineHeight: 1.2, letterSpacing: "-0.012em", color: "#ffffff", textShadow: "0 3px 18px rgba(0,0,0,.6), 0 0 3px rgba(0,0,0,.4)" }}>
      {conteudo}
    </div>
  );
}

/** O azul vivo do padrão da lousa (o acabamento tecnológico do Dan Martell). */
const AZUL_DA_LOUSA = "#2f7bff";

function quadrosDaLousa(): ReactNode[] {
  const a = AZUL_DA_LOUSA;
  const claro = misturar(a, "#ffffff", 0.35);
  const barra = `linear-gradient(90deg, ${misturar(a, "#ffffff", 0.25)}, ${a})`;
  return [
    // 1. A pilha de passos acesa, ao lado de quem fala.
    <div key="pilha" style={{ position: "absolute", inset: 0, background: "#03050b" }}>
      <Foto nome="lousa-homem" escala={1.22} origem="0% 100%" />
      <Camada fundo="linear-gradient(90deg, rgba(2,4,12,.94) 0%, rgba(2,4,12,.8) 34%, rgba(2,4,12,.15) 64%, transparent 80%)" />
      <Camada fundo="linear-gradient(180deg, rgba(2,4,12,.92) 0%, rgba(2,4,12,.55) 22%, transparent 40%)" />
      <Camada fundo={`radial-gradient(ellipse 40% 35% at 24% 58%, ${rgba(a, 0.22)}, transparent 70%)`} />
      <div style={{ position: "absolute", left: 70, right: 70, top: 150, fontFamily: GEIST, fontWeight: 700, fontSize: 112, lineHeight: 1.02, letterSpacing: "-0.03em", color: "#ffffff", textShadow: brilhoBranco(1) }}>
        Os 4 <span style={{ color: claro, textShadow: `0 0 18px ${rgba(a, 0.8)}, 0 0 60px ${rgba(a, 0.45)}` }}>sistemas</span>
        <div style={{ fontWeight: 500, fontSize: 46, letterSpacing: "-0.01em", color: "#dbe6f5", textShadow: "0 2px 12px rgba(0,0,0,.6)", marginTop: 22 }}>que fazem a empresa crescer sem você</div>
      </div>
      {[1, 2, 3, 4].map((n) => (
        <Losango key={n} n={n} x={250} y={640 + (n - 1) * 250} dw={380} aceso={n <= 2} ativo={n === 2} a={a} />
      ))}
      <div style={{ position: "absolute", left: 452, top: 880, zIndex: 9, display: "flex", alignItems: "center", transform: "translateY(-50%)" }}>
        <span style={{ width: 16, height: 16, borderRadius: "50%", border: "3px solid #fff", boxShadow: `0 0 12px ${a}` }} />
        <span style={{ width: 60, height: 3, background: "#fff" }} />
        <span style={{ marginLeft: 14, padding: "14px 26px", borderRadius: 18, background: "rgba(8,12,22,.62)", border: "1.5px solid rgba(255,255,255,.18)", backdropFilter: "blur(8px)", fontFamily: GEIST, fontWeight: 700, fontSize: 44, color: "#fff", whiteSpace: "nowrap", boxShadow: `0 0 40px ${rgba(a, 0.25)}` }}>Vendas no automático</span>
      </div>
    </div>,

    // 2. A busca de vidro digitando, com a legenda e a palavra sublinhada.
    <div key="busca" style={{ position: "absolute", inset: 0, background: "#03050b" }}>
      <Foto nome="lousa-mulher" />
      <Camada fundo={`linear-gradient(180deg, ${rgba(misturar(a, "#000000", 0.78), 0.94)} 0%, ${rgba(misturar(a, "#000000", 0.7), 0.7)} 20%, transparent 42%)`} />
      <Camada fundo={`radial-gradient(ellipse 60% 16% at 50% 21%, ${rgba(misturar(a, "#bfe8ff", 0.5), 0.5)}, transparent 75%)`} />
      <Camada fundo="linear-gradient(0deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.25) 26%, transparent 40%)" />
      <div style={{ position: "absolute", left: 60, right: 60, top: 300, minHeight: 150, borderRadius: 42, background: "linear-gradient(180deg, #f3f6fb, #dce3ee)", boxShadow: `0 0 30px rgba(255,255,255,.55), 0 0 90px ${rgba(misturar(a, "#ffffff", 0.4), 0.45)}, inset 0 2px 0 rgba(255,255,255,.95)`, display: "flex", alignItems: "center", padding: "0 44px" }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={misturar(a, "#000000", 0.2)} strokeWidth={2} strokeLinecap="round" style={{ flex: "0 0 auto", marginRight: 24 }}>
          <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" />
          <path d="M19 15l.8 2 2 .8-2 .7-.8 2-.7-2-2-.7 2-.8z" />
        </svg>
        <div style={{ flex: 1, fontFamily: GEIST, fontWeight: 700, fontSize: 46, color: "#111318", letterSpacing: "-0.015em", lineHeight: 1.15, whiteSpace: "nowrap" }}>
          como atrair clientes todo mês
          <span style={{ display: "inline-block", width: "0.06em", height: "0.95em", marginLeft: "0.05em", verticalAlign: "-0.12em", background: "#111318" }} />
        </div>
        <svg width={58} height={58} viewBox="0 0 24 24" fill="none" stroke="#111318" strokeWidth={2.4} strokeLinecap="round" style={{ flex: "0 0 auto", marginLeft: 20 }}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 L21 21" />
        </svg>
        <div style={{ position: "absolute", right: 30, bottom: -78 }}>
          <SetaDoMouse tam={86} cor={a} />
        </div>
      </div>
      {legenda(1560, <>A resposta está no <Sublinha fundo={barra} brilho={rgba(a, 0.7)}>método</Sublinha></>)}
    </div>,

    // 3. A palavra gigante: a gravação escurece e desfoca, a palavra chega pesada.
    <div key="palavra" style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      <Foto nome="lousa-homem" escala={1.1} filtro="blur(16px) saturate(1.1)" />
      <Camada fundo="rgba(0,0,0,.62)" />
      <Camada fundo={`radial-gradient(ellipse 70% 30% at 50% 50%, ${rgba(a, 0.16)}, transparent 70%)`} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", marginTop: 60 }}>
          <div style={{ fontFamily: PESADA, fontWeight: 800, fontSize: 310, lineHeight: 0.9, letterSpacing: "-0.05em", color: "#ffffff", textShadow: "0 8px 50px rgba(0,0,0,.35)" }}>TUDO</div>
          <div style={{ position: "absolute", left: 30, top: -88, fontFamily: PESADA, fontWeight: 700, fontSize: 92, letterSpacing: "-0.03em", color: "#ffffff", whiteSpace: "nowrap" }}>isso muda</div>
        </div>
      </div>
    </div>,

    // 4. As ferramentas em placas brancas com moldura cromada, no feixe de luz, e a legenda sublinhada.
    <div key="ferramentas" style={{ position: "absolute", inset: 0, background: "#010205", overflow: "hidden" }}>
      <Foto nome="lousa-mulher" escala={1.1} origem="50% 0%" desce={180} />
      <Camada fundo="linear-gradient(180deg, #010205 0%, rgba(1,2,5,.92) 30%, rgba(1,2,5,.25) 52%, transparent 62%)" />
      <div style={{ position: "absolute", left: 380, top: -300, width: 340, height: 1400, transform: "rotate(18deg)", background: `linear-gradient(90deg, transparent, ${rgba(misturar(misturar(a, "#13c4d8", 0.45), "#000000", 0.2), 0.42)} 35%, ${rgba(misturar(a, "#bff4ff", 0.4), 0.5)} 50%, ${rgba(misturar(misturar(a, "#13c4d8", 0.45), "#000000", 0.2), 0.42)} 65%, transparent)`, filter: "blur(50px)" }} />
      <Camada fundo="linear-gradient(0deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.2) 24%, transparent 36%)" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontFamily: GEIST, fontWeight: 700, fontSize: 70, letterSpacing: "-0.02em", color: "#fff", textShadow: brilhoBranco(0.9) }}>As ferramentas do método</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center", gap: 46 }}>
        {[
          { I: MessageCircle, n: "Conversa" },
          { I: CalendarDays, n: "Agenda" },
          { I: BarChart3, n: "Funil" },
        ].map(({ I, n }, i) => (
          <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, transform: `translateY(${i === 1 ? -26 : 0}px)` }}>
            <div style={{ width: 236, height: 236, borderRadius: 54, padding: 7, background: "linear-gradient(145deg, #ffffff, #9aa2ad 30%, #f4f6f9 55%, #6b737e 80%, #e9edf2)", boxShadow: `0 0 40px ${rgba(misturar(a, "#ffffff", 0.3), 0.55)}, 0 30px 60px rgba(0,0,0,.6)` }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 48, background: "linear-gradient(180deg, #ffffff, #e6ebf2)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 3px 0 rgba(255,255,255,.9), inset 0 -6px 14px rgba(0,0,0,.08)" }}>
                <I size={120} strokeWidth={2} color={misturar(a, "#000000", 0.1)} />
              </div>
            </div>
            <span style={{ fontFamily: GEIST, fontWeight: 600, fontSize: 40, color: "#eef2f7", textShadow: "0 2px 12px rgba(0,0,0,.7)" }}>{n}</span>
          </div>
        ))}
      </div>
      {legenda(1560, <>Três ferramentas, <Sublinha fundo={barra} brilho={rgba(a, 0.7)}>um sistema</Sublinha></>)}
    </div>,
  ];
}

// ─────────────────────────────── luxo (autoridade high ticket) ───────────────────────────────

const OURO = "#d4af37";
const OURO_METAL = "linear-gradient(100deg, #7a5a1c 0%, #f7e7a8 26%, #c9a24a 48%, #fff4c8 64%, #9c7426 100%)";
const tintaDeOuro: CSSProperties = { background: OURO_METAL, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };
const brilhoDeOuro = (k = 1) => `drop-shadow(0 0 ${8 * k}px rgba(212,175,55,.45)) drop-shadow(0 4px 14px rgba(0,0,0,.65))`;
const filete = (largura: number): CSSProperties => ({ width: largura, height: 2, background: "linear-gradient(90deg, transparent, #c9a24a 30%, #f7e7a8 50%, #c9a24a 70%, transparent)" });
const rotuloLuxo: CSSProperties = { fontFamily: GEIST, fontWeight: 400, letterSpacing: "0.34em", textTransform: "uppercase", color: "#efe3c4" };

function Selo({ nome, papel, largura }: { nome: string; papel: string; largura: number }) {
  const inicial = (nome.trim()[0] ?? "S").toUpperCase();
  return (
    <div style={{ width: largura, display: "flex", alignItems: "center", gap: 30, padding: "30px 40px", borderRadius: 18, background: "linear-gradient(180deg, rgba(16,20,36,.9), rgba(5,7,14,.94))", border: "1.5px solid rgba(212,175,55,.75)", boxShadow: "0 0 30px rgba(212,175,55,.2), 0 24px 60px rgba(0,0,0,.6), inset 0 1.5px 0 rgba(255,244,200,.22)" }}>
      <div style={{ width: 104, height: 104, flex: "0 0 auto", borderRadius: "50%", padding: 3, background: "linear-gradient(145deg, #fff4c8, #9c7426 30%, #f7e7a8 55%, #6e5017 80%, #f3dc94)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #1a2a4a, #070c18 75%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: SERIFA, fontWeight: 700, fontSize: 58, ...tintaDeOuro }}>{inicial}</span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: SERIFA, fontWeight: 700, fontSize: 60, lineHeight: 1.08, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...tintaDeOuro, filter: brilhoDeOuro(0.6), paddingBottom: 4 }}>{nome}</div>
        <div style={{ ...rotuloLuxo, fontSize: 24, marginTop: 8 }}>{papel}</div>
      </div>
    </div>
  );
}

function quadrosDoLuxo(nome: string): ReactNode[] {
  return [
    // 1. O número com a régua dourada (o contador parado no valor final).
    <div key="numero" style={{ position: "absolute", inset: 0, background: "#020206" }}>
      <Foto nome="luxo-homem" escala={1.08} origem="50% 0%" desce={300} />
      <Camada fundo="linear-gradient(180deg, rgba(3,6,16,.94) 0%, rgba(3,6,16,.78) 26%, rgba(3,6,16,.2) 46%, transparent 56%)" />
      <Camada fundo="radial-gradient(ellipse 60% 22% at 50% 22%, rgba(212,175,55,.16), transparent 70%)" />
      <Camada fundo="linear-gradient(0deg, rgba(0,0,0,.5), transparent 25%)" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span style={filete(120)} />
          <span style={{ ...rotuloLuxo, fontSize: 30 }}>Carta de crédito</span>
          <span style={filete(120)} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 18, filter: brilhoDeOuro(1.4) }}>
          <span style={{ fontFamily: SERIFA, fontWeight: 700, fontSize: 80, marginRight: 14, ...tintaDeOuro }}>R$</span>
          <span style={{ fontFamily: SERIFA, fontWeight: 800, fontSize: 210, lineHeight: 1.05, letterSpacing: "-0.01em", ...tintaDeOuro, fontVariantNumeric: "lining-nums" }}>300</span>
          <span style={{ fontFamily: SERIFA, fontWeight: 700, fontStyle: "italic", fontSize: 92, marginLeft: 18, ...tintaDeOuro }}>mil</span>
        </div>
        {/* A régua do contador: corre do zero ao valor. */}
        <div style={{ position: "relative", width: 760, height: 46, marginTop: 14 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 22, height: 2, background: "rgba(239,227,196,.22)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 21, height: 4, background: OURO_METAL, boxShadow: "0 0 14px rgba(212,175,55,.6)" }} />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} style={{ position: "absolute", left: (i * 760) / 30 - 1, top: i % 5 === 0 ? 8 : 14, width: 2, height: i % 5 === 0 ? 30 : 18, background: i % 5 === 0 ? "#e9cf7a" : "rgba(233,207,122,.55)" }} />
          ))}
          <span style={{ position: "absolute", right: -11, top: 12, width: 22, height: 22, transform: "rotate(45deg)", background: "linear-gradient(135deg, #fff4c8, #c9a24a)", boxShadow: "0 0 18px rgba(247,231,168,.9)" }} />
        </div>
        <div style={{ fontFamily: GEIST, fontWeight: 300, fontSize: 40, color: "#f3ead4", marginTop: 26, letterSpacing: "0.01em" }}>planejados, sem pagar juros de banco</div>
      </div>
    </div>,

    // 2. O selo com o nome, no terço de baixo.
    <div key="selo" style={{ position: "absolute", inset: 0, background: "#020206" }}>
      <Foto nome="luxo-mulher" escala={1.06} origem="50% 30%" />
      <Camada fundo="linear-gradient(0deg, rgba(3,6,16,.9) 0%, rgba(3,6,16,.55) 20%, transparent 38%)" />
      <Camada fundo="radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)" />
      <div style={{ position: "absolute", left: 70, top: 1440 }}>
        <Selo nome={nome} papel="Especialista · alto padrão" largura={940} />
      </div>
      <div style={{ position: "absolute", left: 70, top: 1400, ...filete(300) }} />
    </div>,

    // 3. A palavra gigante em ouro sobre a gravação escurecida.
    <div key="palavra" style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      <Foto nome="luxo-homem" escala={1.12} filtro="blur(16px)" />
      <Camada fundo="rgba(3,6,16,.76)" />
      <Camada fundo="radial-gradient(ellipse 60% 26% at 50% 52%, rgba(212,175,55,.2), transparent 72%)" />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <div style={{ ...rotuloLuxo, fontSize: 40 }}>Sua chave,</div>
        <div style={{ fontFamily: SERIFA, fontWeight: 800, fontStyle: "italic", fontSize: 200, lineHeight: 1.05, ...tintaDeOuro, filter: brilhoDeOuro(1.6), paddingBottom: 18 }}>planejada.</div>
        <span style={filete(520)} />
      </div>
    </div>,

    // 4. A pilha de passos no acabamento de luxo: losangos de ouro, o passo dito aceso.
    <div key="pilha" style={{ position: "absolute", inset: 0, background: "#020206" }}>
      <Foto nome="luxo-homem" escala={1.25} origem="0% 100%" />
      <Camada fundo="linear-gradient(90deg, rgba(3,6,16,.95) 0%, rgba(3,6,16,.82) 36%, rgba(3,6,16,.2) 64%, transparent 80%)" />
      <Camada fundo="linear-gradient(180deg, rgba(3,6,16,.94) 0%, rgba(3,6,16,.6) 22%, transparent 40%)" />
      <Camada fundo="radial-gradient(ellipse 40% 35% at 24% 58%, rgba(212,175,55,.16), transparent 70%)" />
      <div style={{ position: "absolute", left: 70, right: 70, top: 150 }}>
        <div style={{ ...rotuloLuxo, fontSize: 28 }}>O caminho até a chave</div>
        <div style={{ fontFamily: SERIFA, fontWeight: 800, fontSize: 104, lineHeight: 1.05, marginTop: 14, ...tintaDeOuro, filter: brilhoDeOuro(1.2), paddingBottom: 8 }}>3 passos</div>
      </div>
      {[1, 2, 3].map((n) => (
        <Losango key={n} n={n} x={250} y={700 + (n - 1) * 270} dw={400} aceso={n <= 2} ativo={n === 2} a={OURO} luxo />
      ))}
      <div style={{ position: "absolute", left: 462, top: 960, zIndex: 9, display: "flex", alignItems: "center", transform: "translateY(-50%)" }}>
        <span style={{ width: 16, height: 16, borderRadius: "50%", border: `3px solid ${OURO}` }} />
        <span style={{ width: 60, height: 3, background: OURO_METAL }} />
        <span style={{ marginLeft: 14, padding: "14px 26px", borderRadius: 14, background: "linear-gradient(180deg, rgba(16,20,36,.9), rgba(5,7,14,.94))", border: "1.5px solid rgba(212,175,55,.7)", fontFamily: GEIST, fontWeight: 400, fontSize: 42, color: "#f6efdc", whiteSpace: "nowrap", boxShadow: "0 0 26px rgba(212,175,55,.2)" }}>O lance planejado</span>
      </div>
    </div>,
  ];
}

// ─────────────────────────────── Vox (documental) ───────────────────────────────

const FIBRA = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .22 0 0 0 .55 0'/></filter><rect width='400' height='400' filter='url(#f)'/></svg>"
)}")`;
const MANCHA = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'><filter id='m'><feTurbulence type='fractalNoise' baseFrequency='.006' numOctaves='4' seed='9'/><feColorMatrix values='0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .3 0 0 0 .5 0'/></filter><rect width='900' height='900' filter='url(#m)'/></svg>"
)}")`;
const texturaDePapel = (cor: string): CSSProperties => ({ backgroundColor: cor, backgroundImage: `${FIBRA}, ${MANCHA}`, backgroundSize: "400px 400px, 900px 900px", backgroundBlendMode: "multiply" });

/** O contorno rasgado de um papel w x h: as bordas pedidas tremem, as outras ficam retas. */
function rasgo(w: number, h: number, semente: number, bordas: { topo?: boolean; base?: boolean; esq?: boolean; dir?: boolean }, amp = 10): string {
  const r = sorteio(semente);
  const pts: string[] = [];
  const passo = 14;
  const borda = (de: [number, number], para: [number, number], treme: boolean, normal: [number, number]) => {
    const dx = para[0] - de[0];
    const dy = para[1] - de[1];
    const len = Math.hypot(dx, dy);
    const n = treme ? Math.max(2, Math.round(len / passo)) : 1;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = treme && i > 0 ? (r() * 0.75 + (r() > 0.85 ? 0.25 : 0)) * amp : 0;
      pts.push(`${(de[0] + dx * t + normal[0] * j).toFixed(1)}px ${(de[1] + dy * t + normal[1] * j).toFixed(1)}px`);
    }
  };
  borda([0, 0], [w, 0], !!bordas.topo, [0, 1]);
  borda([w, 0], [w, h], !!bordas.dir, [-1, 0]);
  borda([w, h], [0, h], !!bordas.base, [0, -1]);
  borda([0, h], [0, 0], !!bordas.esq, [1, 0]);
  return `polygon(${pts.join(", ")})`;
}

/** Um pedaço de papel rasgado, com a fibra branca na borda e a sombra no chão. */
function Papel({ x, y, w, h, giro = 0, cor = "#f2ecdf", semente = 1, bordas = { topo: true, base: true, esq: true, dir: true }, amp = 10, sombra = true, children, estilo }: { x: number; y: number; w: number; h: number; giro?: number; cor?: string; semente?: number; bordas?: { topo?: boolean; base?: boolean; esq?: boolean; dir?: boolean }; amp?: number; sombra?: boolean; children?: ReactNode; estilo?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `rotate(${giro}deg)`, filter: sombra ? "drop-shadow(0 10px 14px rgba(40,28,10,.35)) drop-shadow(0 2px 3px rgba(40,28,10,.3))" : undefined }}>
      <div style={{ position: "absolute", inset: 0, background: "#fbf8f1", clipPath: rasgo(w, h, semente + 7, bordas, amp * 0.55) }} />
      <div style={{ position: "absolute", inset: 0, ...texturaDePapel(cor), clipPath: rasgo(w, h, semente, bordas, amp), overflow: "hidden", ...estilo }}>{children}</div>
    </div>
  );
}

/** Um pedaço de fita adesiva, translúcido e com as pontas serrilhadas. */
function Fita({ x, y, w = 170, giro = 0 }: { x: number; y: number; w?: number; giro?: number }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: 52, transform: `rotate(${giro}deg)`, background: "linear-gradient(180deg, rgba(244,236,210,.82), rgba(226,214,180,.78))", clipPath: rasgo(w, 52, Math.round(x + y), { esq: true, dir: true }, 7), boxShadow: "0 2px 6px rgba(0,0,0,.15)", zIndex: 6 }} />;
}

/** O marca-texto no destaque da marca, com a ponta irregular e a letra na cor que contrasta (a mesma conta da montagem). */
function MarcaTexto({ children, cor, tinta }: { children: ReactNode; cor: string; tinta: string }) {
  return (
    <span style={{ backgroundImage: `linear-gradient(100deg, ${rgba(cor, 0)} 0.4%, ${rgba(cor, 0.92)} 2%, ${rgba(cor, 0.86)} 96%, ${rgba(cor, 0)} 99.6%)`, backgroundSize: "100% 74%", backgroundPosition: "0 70%", backgroundRepeat: "no-repeat", padding: "0 0.12em", margin: "0 -0.05em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", color: tinta }}>
      {children}
    </span>
  );
}

/** O círculo feito à mão (duas voltas que não fecham certinho). */
function Circulo({ x, y, w, h, cor, giro = -4 }: { x: number; y: number; w: number; h: number; cor: string; giro?: number }) {
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2 * 1.12 - 0.4;
    const k = 1 + 0.04 * Math.sin(t * 3) + (i / 64) * 0.06;
    pts.push(`${(w / 2 + Math.cos(t) * (w / 2 - 8) * k).toFixed(1)},${(h / 2 + Math.sin(t) * (h / 2 - 8) * k).toFixed(1)}`);
  }
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: x, top: y, overflow: "visible", transform: `rotate(${giro}deg)`, zIndex: 7 }}>
      <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
    </svg>
  );
}

const TEXTO_DO_JORNAL =
  "O comportamento de compra mudou mais nos últimos cinco anos do que nas duas décadas anteriores. Antes de falar com qualquer vendedor, o cliente já assistiu a vídeos, comparou preços e leu o que outros compradores dizem. Quando finalmente pede um orçamento, a decisão está quase tomada. Para as empresas, a consequência é direta: quem não aparece nessa fase silenciosa simplesmente deixa de ser considerado. Especialistas ouvidos pela reportagem apontam a constância como o fator que mais pesa na lembrança da marca. ";

/** As colunas de um jornal, com o texto corrido e justificado. */
function Colunas({ n, tam = 19, cor = "#2b2620", altura, destaque }: { n: number; tam?: number; cor?: string; altura: number; destaque?: ReactNode }) {
  return (
    <div style={{ columnCount: n, columnGap: 22, columnRule: "1px solid rgba(40,30,20,.25)", height: altura, overflow: "hidden", fontFamily: JORNAL, fontSize: tam, lineHeight: 1.32, color: cor, textAlign: "justify", hyphens: "auto" }} lang="pt-BR">
      {TEXTO_DO_JORNAL}
      {destaque}
      {TEXTO_DO_JORNAL}
      {TEXTO_DO_JORNAL}
    </div>
  );
}


/** O grão de papel e o tom quente que o Vox põe por cima da gravação. */
const GraoDoVox = () => (
  <>
    <Camada fundo="rgba(214,170,100,.08)" estilo={{ mixBlendMode: "multiply" }} />
    <div style={{ position: "absolute", inset: 0, backgroundImage: FIBRA, backgroundSize: "400px 400px", opacity: 0.35, mixBlendMode: "multiply", pointerEvents: "none" }} />
  </>
);

/** O fundo de papel velho da colagem (a foto do papel, gerada uma vez). */
const FUNDO_VELHO: CSSProperties = { backgroundColor: "#d9c7a0", backgroundImage: "url(/estilos-de-video/fotos/vox-papel.webp)", backgroundSize: "cover", backgroundPosition: "center" };

/** Uma imagem (mapa, manuscrito, papel) como o miolo de um Papel rasgado. */
const imagemDePapel = (nome: string, opacidade: number, posicao = "center"): CSSProperties => ({
  backgroundColor: "#e6d8b8",
  backgroundImage: `url(/estilos-de-video/fotos/${nome}.webp)`,
  backgroundSize: "cover",
  backgroundPosition: posicao,
  opacity: opacidade,
});

/** O círculo cheio translúcido sobre o mapa, com o aro (o "aqui" do Vox). */
function CirculoCheio({ x, y, r, cor }: { x: number; y: number; r: number; cor: string }) {
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: rgba(cor, 0.55), boxShadow: `0 0 0 10px ${rgba(cor, 0.35)}, inset 0 0 0 4px ${rgba(misturar(cor, "#000000", 0.3), 0.6)}`, mixBlendMode: "multiply" }} />;
}

/** Um recorte com fundo transparente, a sombra no papel e, se pedir, a tarja de censura nos olhos. */
function Recorte({ nome, x, y, w, giro = 0, tarja, cor, sombra }: { nome: string; x: number; y: number; w: number; giro?: number; tarja?: { topo: number; esq: number; larg: number }; cor?: string; sombra?: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `rotate(${giro}deg)`, filter: sombra ?? "drop-shadow(0 18px 22px rgba(30,20,8,.45)) drop-shadow(0 3px 4px rgba(30,20,8,.35))", zIndex: 4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/estilos-de-video/fotos/${nome}.webp`} alt="" draggable={false} style={{ display: "block", width: "100%", height: "auto", filter: nome.includes("apresentadora") ? undefined : "sepia(.18) contrast(1.08)" }} />
      {tarja && cor ? <div style={{ position: "absolute", top: `${tarja.topo}%`, left: `${tarja.esq}%`, width: `${tarja.larg}%`, height: "6.2%", background: cor, transform: "rotate(-4deg)", boxShadow: "0 4px 10px rgba(0,0,0,.25)" }} /> : null}
    </div>
  );
}

/** O título serifado em caixa alta, cada linha na sua faixa do destaque da marca, com a letra na cor que contrasta. */
function TituloNaFaixa({ x, y, linhas, cor, tinta, tam }: { x: number; y: number; linhas: string[]; cor: string; tinta: string; tam: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 8, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, transform: "rotate(-1.5deg)" }}>
      {linhas.map((l) => (
        <span key={l} style={{ background: cor, padding: "4px 24px 0", fontFamily: SERIFA, fontWeight: 900, fontSize: tam, lineHeight: 1.08, letterSpacing: "0.01em", color: tinta, boxShadow: "0 8px 18px rgba(30,20,8,.3)" }}>{l}</span>
      ))}
    </div>
  );
}

/** O grão e a vinheta do papel velho por cima de tudo. */
const GraoDoPapel = () => (
  <>
    <div style={{ position: "absolute", inset: 0, backgroundImage: FIBRA, backgroundSize: "400px 400px", opacity: 0.4, mixBlendMode: "multiply", pointerEvents: "none", zIndex: 9 }} />
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 60%, rgba(60,40,15,.35) 100%)", pointerEvents: "none", zIndex: 9 }} />
  </>
);

/**
 * Os quatro quadros do Vox nos acentos da MARCA (a conta de acentos-do-vox.ts):
 * a faixa, o marca-texto, a tarja e o círculo no destaque; a letra por cima no
 * que contrasta; os títulos, as aspas e o círculo à mão na tinta/carimbo. Os
 * textos vêm do roteiro do cliente.
 */
function quadrosDoVox(a: Required<AcentosDoVox>, t: TextosDaPrevia): ReactNode[] {
  const PAPEL = "#ece4d2";
  const t1 = linhasDaFaixa(t.titulo1);
  const t2 = linhasDaFaixa(t.titulo2, 2, 15);
  return [
    // 1. A colagem do Vox (referência do dono, vox-01): papel envelhecido, mapa antigo rasgado com o
    //    círculo, manuscrito ao fundo, recortes P&B em camadas com sombra, a tarja de censura nos olhos
    //    da estátua e o título serifado na faixa do destaque da marca; a apresentadora recortada, em cor.
    <div key="colagem" style={{ position: "absolute", inset: 0, overflow: "hidden", ...FUNDO_VELHO }}>
      <Papel x={430} y={90} w={720} h={700} giro={3} semente={5} amp={14} estilo={imagemDePapel("vox-manuscrito", 0.9)} />
      <Papel x={-60} y={-40} w={720} h={640} giro={-4} semente={9} amp={18} estilo={imagemDePapel("vox-mapa", 1)}>
        <CirculoCheio x={300} y={300} r={105} cor={a.realce} />
      </Papel>
      <Recorte nome="vox-recorte-estatua" x={-40} y={880} w={520} giro={-2} tarja={{ topo: 22.6, esq: 36, larg: 40 }} cor={a.realce} />
      <Recorte nome="vox-recorte-fabrica" x={-30} y={1450} w={640} />
      <Recorte nome="vox-recorte-apresentadora" x={430} y={960} w={700} sombra="drop-shadow(0 24px 30px rgba(30,20,8,.45))" />
      <TituloNaFaixa x={50} y={t1.linhas.length > 2 ? 560 : 640} cor={a.realce} tinta={a.tintaNoRealce} linhas={t1.linhas} tam={t1.tam} />
      <GraoDoPapel />
    </div>,

    // 2. A manchete no papel rasgado sobre a gravação: o recorte do homem de arquivo com a tarja, o mapa e o título na faixa.
    <div key="manchete" style={{ position: "absolute", inset: 0, background: "#1a1510", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 860, bottom: 0, overflow: "hidden" }}>
        <Foto nome="vox-homem" posicao="50% 30%" />
        <GraoDoVox />
      </div>
      <Papel x={-30} y={-30} w={1140} h={960} cor={PAPEL} semente={3} bordas={{ base: true }} amp={22} estilo={imagemDePapel("vox-papel", 1)}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 620, height: 520, opacity: 0.55, backgroundImage: "url(/estilos-de-video/fotos/vox-manuscrito.webp)", backgroundSize: "cover", mixBlendMode: "multiply" }} />
      </Papel>
      <Papel x={30} y={420} w={500} h={400} giro={-5} semente={14} amp={14} estilo={imagemDePapel("vox-mapa", 1, "70% 60%")}>
        <CirculoCheio x={250} y={190} r={80} cor={a.realce} />
      </Papel>
      <Recorte nome="vox-recorte-homem" x={600} y={330} w={480} giro={2} tarja={{ topo: 18.5, esq: 22, larg: 40 }} cor={a.realce} />
      <TituloNaFaixa x={50} y={120} cor={a.realce} tinta={a.tintaNoRealce} linhas={t2.linhas} tam={Math.min(84, t2.tam)} />
      <GraoDoPapel />
    </div>,
    // 3. A citação do roteiro no papel, com as aspas grandes na tinta da marca e o marca-texto no destaque.
    <div key="citacao" style={{ position: "absolute", inset: 0, background: "#1a1510", overflow: "hidden" }}>
      <Foto nome="vox-mulher" escala={1.12} origem="50% 0%" />
      <GraoDoVox />
      <Camada fundo="linear-gradient(0deg, rgba(20,14,6,.45), transparent 40%)" />
      <Papel x={-20} y={1200} w={1120} h={760} giro={-1.5} cor={PAPEL} semente={44} bordas={{ topo: true }} amp={20}>
        <div style={{ padding: "60px 90px" }}>
          <div style={{ fontFamily: SERIFA, fontWeight: 900, fontSize: 220, lineHeight: 0.6, height: 110, color: a.carimbo }}>“</div>
          <div style={{ fontFamily: SERIFA, fontStyle: "italic", fontWeight: 500, fontSize: t.citacao.antes.length + t.citacao.marcado.length > 48 ? 66 : 84, lineHeight: 1.12, color: a.tinta }}>
            {t.citacao.antes ? `${t.citacao.antes} ` : ""}
            <MarcaTexto cor={a.realce} tinta={a.tintaNoRealce}>{t.citacao.marcado}</MarcaTexto>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 34 }}>
            <span style={{ width: 60, height: 3, background: a.tinta }} />
            <span style={{ fontFamily: GEIST, fontWeight: 500, fontSize: 28, letterSpacing: "0.22em", color: "#4a4136" }}>{t.doRoteiro ? "DO SEU ROTEIRO" : "EQUIPE DE CONTEÚDO"}</span>
          </div>
        </div>
      </Papel>
      <Fita x={130} y={1170} w={160} giro={-6} />
    </div>,

    // 4. Pergunta e resposta em tiras de papel, com o recorte de jornal e o círculo à mão.
    <div key="pergunta" style={{ position: "absolute", inset: 0, background: "#1a1510", overflow: "hidden" }}>
      <Foto nome="vox-homem" escala={1.32} origem="50% 0%" />
      <GraoDoVox />
      <Camada fundo="linear-gradient(180deg, rgba(20,14,6,.4), transparent 38%)" />
      <Papel x={650} y={130} w={380} h={300} giro={7} cor="#e7e0cd" semente={55}>
        <div style={{ padding: "18px 22px" }}>
          <div style={{ fontFamily: SERIFA, fontWeight: 900, fontSize: 30, lineHeight: 1.05, color: a.tinta }}>{t.doRoteiro ? primeiraFrase(t.titulo1, 40) : "A semana inteira com uma gravação"}</div>
          <div style={{ marginTop: 10 }}>
            <Colunas n={2} tam={13} altura={190} />
          </div>
        </div>
      </Papel>
      <Papel x={50} y={260} w={760} h={150} giro={-2.5} cor="#fbf8f1" semente={66} amp={8}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 40px", fontFamily: SERIFA, fontWeight: 800, fontSize: tamQueCabe(t.pergunta, 680, 70), color: a.tinta, whiteSpace: "nowrap" }}>{t.pergunta}</div>
      </Papel>
      <Papel x={110} y={440} w={900} h={140} giro={1.5} cor={PAPEL} semente={77} amp={8}>
        <div style={{ height: "100%", display: "flex", alignItems: "center", padding: "0 40px", fontFamily: SERIFA, fontWeight: 700, fontSize: tamQueCabe(`${t.resposta.antes} ${t.resposta.marcado}`, 820, 60), color: a.tinta, whiteSpace: "nowrap" }}>
          {t.resposta.antes ? `${t.resposta.antes} ` : ""}
          <MarcaTexto cor={a.realce} tinta={a.tintaNoRealce}>{t.resposta.marcado}</MarcaTexto>
          {t.resposta.marcado.endsWith(".") ? "" : "."}
        </div>
      </Papel>
      <Circulo x={640} y={430} w={300} h={160} cor={a.carimbo} giro={3} />
      <Fita x={60} y={240} w={140} giro={-20} />
    </div>,
  ];
}

/**
 * A paleta que a conta do Vox lê: a identidade APROVADA no book vem na
 * frente (destaque, fundo, título, na ordem dos papéis), seguida da paleta
 * do projeto; sem aprovação, a paleta na ordem que o cliente gravou (a mesma
 * hierarquia que a montagem usa).
 */
function paletaDoVox(marca: Cores, identidade: Identidade | null): string[] {
  const base = identidade?.paleta?.length ? identidade.paleta : [marca.acento, marca.escuro, marca.claro];
  if (!identidade?.aprovada) return base;
  const p = identidade.papeis;
  return [...new Set([p.destaque, p.fundo, p.titulo, ...base].map((c) => c.toLowerCase()))];
}

function quadros(estilo: string, c: Cores, nome: string, identidade: Identidade | null, textos: TextosDaPrevia): ReactNode[] {
  if (estilo === "lousa") return quadrosDaLousa();
  if (estilo === "consorcio") return quadrosDoLuxo(nome);
  return quadrosDoVox(acentosParaDesenhar(paletaDoVox(c, identidade)), textos);
}

function Quadro({ children, largura }: { children: ReactNode; largura: number }) {
  const escala = largura / 1080;
  return (
    <div style={{ width: largura, height: 1920 * escala, position: "relative", overflow: "hidden", borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.2)", flexShrink: 0 }}>
      <div style={{ width: 1080, height: 1920, transform: `scale(${escala})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

export function PreviaDoEstiloDeVideo({ projectId, estiloId, nomeDoEstilo }: { projectId: string; estiloId: string; nomeDoEstilo: string }) {
  useFontesDoVideo();
  const [marca, setMarca] = useState<{ cores: Cores; nome: string; identidade: Identidade | null } | null>(null);
  const [textos, setTextos] = useState<TextosDaPrevia>(TEXTOS_GENERICOS);
  const caixa = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    let vivo = true;
    // A marca e a identidade aprovada no book (o mesmo GET da galeria).
    fetch(`/api/projects/${projectId}/modelos-de-arte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.marca) return;
        const i = d.identidade as Partial<Identidade> | undefined;
        const identidade: Identidade | null =
          i && typeof i.letra === "string" && i.papeis && Array.isArray(i.paleta) ? { letra: i.letra as LetraId, papeis: i.papeis as PapeisEscolhidos, paleta: i.paleta as string[], aprovada: Boolean(i.aprovada) } : null;
        setMarca({ cores: d.marca.cores, nome: d.marca.nome, identidade });
      })
      .catch(() => {});
    // O texto dos quadros é o do roteiro do cliente (a linha editorial), quando ele já tem um.
    fetch(`/api/projects/${projectId}/linha-editorial`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => vivo && Array.isArray(d?.roteiros) && setTextos(textosDoRoteiro(d.roteiros as RoteiroDaLinha[])))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId]);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [marca]);
  const ficha = FICHA[estiloId];
  if (!ficha || !marca) return null;
  // Quatro por linha no computador, dois no celular.
  const porLinha = w < 520 ? 2 : 4;
  const larguraDoQuadro = Math.max(80, Math.floor((w - (porLinha - 1) * 10) / porLinha));
  // Os acentos do Vox, ditos na tela com o hex de cada papel: o cliente confere que são as cores dele.
  const acentos = estiloId === "vox" ? acentosParaDesenhar(paletaDoVox(marca.cores, marca.identidade)) : null;
  const papeis: Array<{ nome: string; cor: string }> = acentos
    ? [
        { nome: "faixa, marca-texto e tarja", cor: acentos.realce },
        { nome: "letra sobre a faixa", cor: acentos.tintaNoRealce },
        { nome: "títulos", cor: acentos.tinta },
        ...(acentos.carimbo.toLowerCase() !== acentos.tinta.toLowerCase() ? [{ nome: "carimbo e círculo", cor: acentos.carimbo }] : []),
      ]
    : [];
  const letraAprovada = marca.identidade?.aprovada ? LETRAS[marca.identidade.letra] : null;
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--brand)", background: "var(--bg-elevated)" }} aria-labelledby="previa-video">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p id="previa-video" className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <Film className="h-4 w-4 text-orange-500" /> Seu vídeo vai ficar assim: {nomeDoEstilo}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {ficha.acabamento} Fonte <b style={{ fontFamily: `'${ficha.fonte}'`, fontWeight: ficha.peso }}>{ficha.fonte}</b>
            {estiloId === "consorcio" ? ", com o dourado do estilo." : estiloId === "lousa" ? ", no azul do estilo." : "."}
            {acentos && (
              <>
                {" "}
                As peças de papel saem nas cores da sua marca, na ordem em que você as gravou
                {marca.identidade?.aprovada ? ", com a identidade aprovada no book na frente" : ""}:{" "}
                {papeis.map((p, i) => (
                  <span key={p.nome}>
                    {i > 0 ? (i === papeis.length - 1 ? " e " : ", ") : ""}
                    {p.nome} em <b style={{ color: "var(--text-primary)" }}>{p.cor.toLowerCase()}</b>
                  </span>
                ))}
                .{letraAprovada ? ` A letra ${letraAprovada.nome.toLowerCase()} aprovada no book vale para as artes dos posts; no vídeo deste estilo, o título é na ${ficha.fonte}.` : ""}
              </>
            )}
          </p>
        </div>
        {acentos && (
          <div className="flex items-center gap-1.5" aria-hidden>
            {papeis.map((p) => (
              <span key={p.nome} title={`${p.nome}: ${p.cor}`} className="h-5 w-5 rounded-full border" style={{ background: p.cor, borderColor: "var(--border)" }} />
            ))}
          </div>
        )}
      </div>
      <div ref={caixa} className="mt-3 flex flex-wrap gap-[10px]">
        {w > 0 && quadros(estiloId, marca.cores, marca.nome, marca.identidade, textos).map((q, i) => <Quadro key={i} largura={larguraDoQuadro}>{q}</Quadro>)}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Quadros de exemplo com apresentadores fictícios, criados por IA; no vídeo de verdade é você, com a sua fala
        {estiloId === "vox" && textos.doRoteiro ? ". Os textos são do seu roteiro na linha editorial." : " e o seu texto."}
      </p>
    </section>
  );
}
