import React, { useLayoutEffect, useRef } from "react";
import type { ContextoDaPeca } from "../sob-medida/tipos";

/**
 * O MOTION ESCRITO NA HORA (08/10/2026, protótipo). Bruno: "porque nosso editor não gera efeitos assim?", com os
 * prompts de motion em código de um post. Até aqui os efeitos eram um cardápio fixo de peças; esta peça desenha
 * o que o Claude ESCREVEU para aquele momento (lib/media/jornada/motion.ts): uma função `criar(raiz, ctx)` que
 * monta o DOM dentro da caixa livre e anima pela Web Animations API (nativa do navegador, sem biblioteca).
 *
 * O tempo é do Remotion, nunca do relógio: a cada quadro toda animação da caixa é pausada e posta no instante
 * exato (currentTime), e o `atualizar(t)` que o código devolve (contagem, traço) recebe o mesmo t. Mesmo quadro,
 * mesma imagem, em qualquer aba do render.
 *
 * A TRAVA DO TEXTO CORTADO: depois de montar, a peça vai ao instante assentado (o meio da vida dela), mede a
 * união das caixas de todo elemento com texto e, se passar da caixa livre, encolhe e recentra o conjunto. O texto
 * nunca sai da área que a montagem mediu (fora do rosto e da legenda).
 *
 * O código roda com os nomes perigosos sombreados (rede, relógio, armazenamento); a validação no app já recusou
 * o que os usa. Se o código quebrar aqui, a peça não desenha nada (a montagem tem a peça de reserva).
 */

type Caixa = { x: number; y: number; w: number; h: number };
type Criado = { atualizar?: (t: number) => void } | void | null;

const SOMBREADOS = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "localStorage", "sessionStorage", "indexedDB", "setTimeout", "setInterval", "requestAnimationFrame", "navigator", "location", "open"];

function semente(texto: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seek(el: HTMLElement, t: number, atualizar?: (t: number) => void) {
  for (const a of el.getAnimations({ subtree: true })) {
    a.pause();
    a.currentTime = Math.max(0, t) * 1000;
  }
  try {
    atualizar?.(t);
  } catch {
    /* o atualizar que falha num quadro não derruba o render */
  }
}

/** A união das caixas dos elementos com texto, relativa à raiz. */
function caixaDoTexto(raiz: HTMLElement): { x0: number; y0: number; x1: number; y1: number } | null {
  const base = raiz.getBoundingClientRect();
  let u: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const todos = raiz.querySelectorAll<HTMLElement>("*");
  for (const el of Array.from(todos)) {
    const temTexto = Array.from(el.childNodes).some((n) => n.nodeType === 3 && String(n.textContent ?? "").trim());
    if (!temTexto) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const c = { x0: r.left - base.left, y0: r.top - base.top, x1: r.right - base.left, y1: r.bottom - base.top };
    u = u ? { x0: Math.min(u.x0, c.x0), y0: Math.min(u.y0, c.y0), x1: Math.max(u.x1, c.x1), y1: Math.max(u.y1, c.y1) } : c;
  }
  return u;
}

export function MotionEscrito(c: ContextoDaPeca) {
  const raiz = useRef<HTMLDivElement>(null);
  const estado = useRef<{ ok: boolean; atualizar?: (t: number) => void; ajuste: string } | null>(null);
  const cx = c.props.caixa as Caixa | undefined;
  const W = Math.max(40, Math.round((cx?.w ?? 0.86) * c.W));
  const H = Math.max(40, Math.round((cx?.h ?? 0.2) * c.H));
  const codigo = String(c.props.codigo ?? "");

  useLayoutEffect(() => {
    const el = raiz.current;
    if (estado.current || !el) return;
    try {
      const dados = (c.props.dados ?? {}) as Record<string, unknown>;
      const ctx = { ...dados, largura: W, altura: H, duracao: c.dur, aleatorio: semente(`${codigo.length}:${W}x${H}`) };
      // eslint-disable-next-line no-new-func
      const criar = new Function("raiz", "ctx", ...SOMBREADOS, `"use strict";\n${codigo}\nreturn typeof criar === "function" ? criar(raiz, ctx) : null;`);
      const r = criar(el, ctx, ...SOMBREADOS.map(() => undefined)) as Criado;
      // A raiz tem o tamanho da caixa, sempre (prova de 08/10: um código pôs position relative e overflow hidden na
      // raiz, ela ficou com altura zero e cortou a peça inteira).
      Object.assign(el.style, { position: "absolute", left: "0px", top: "0px", width: `${W}px`, height: `${H}px` });
      const atualizar = r && typeof r.atualizar === "function" ? r.atualizar : undefined;
      // A trava do texto cortado, no instante assentado.
      const assentado = Math.max(0.6, Math.min(c.dur - 0.45, c.dur * 0.55));
      seek(el, assentado, atualizar);
      const u = caixaDoTexto(el);
      let ajuste = "";
      if (u) {
        const folga = 0.02;
        const lw = u.x1 - u.x0;
        const lh = u.y1 - u.y0;
        const s = Math.min(1, (W * (1 - 2 * folga)) / Math.max(1, lw), (H * (1 - 2 * folga)) / Math.max(1, lh));
        const fora = u.x0 < 0 || u.y0 < 0 || u.x1 > W || u.y1 > H;
        if (s < 1 || fora) {
          // Encolhe em volta do centro do texto e traz o centro para dentro da caixa.
          const cxT = (u.x0 + u.x1) / 2;
          const cyT = (u.y0 + u.y1) / 2;
          const alvoX = Math.min(W - (lw * s) / 2 - W * folga, Math.max((lw * s) / 2 + W * folga, cxT));
          const alvoY = Math.min(H - (lh * s) / 2 - H * folga, Math.max((lh * s) / 2 + H * folga, cyT));
          ajuste = `translate(${(alvoX - cxT).toFixed(1)}px, ${(alvoY - cyT).toFixed(1)}px) scale(${s.toFixed(4)})`;
          el.style.transformOrigin = `${cxT.toFixed(1)}px ${cyT.toFixed(1)}px`;
          el.style.transform = ajuste;
        }
      }
      estado.current = { ok: true, atualizar, ajuste };
    } catch (e) {
      console.error("[motion-escrito] o código quebrou:", e);
      el.innerHTML = "";
      estado.current = { ok: false, ajuste: "" };
    }
  }, []);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || !estado.current?.ok) return;
    seek(el, c.t, estado.current.atualizar);
  });

  if (!codigo) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: Math.round((cx?.x ?? 0.07) * c.W),
        top: Math.round((cx?.y ?? 0.1) * c.H),
        width: W,
        height: H,
        // A saída de segurança: mesmo que o código esqueça de sair, a peça some nos últimos quadros da camada.
        opacity: c.fica,
        fontFamily: c.tema.fonteTitulo || "Geist",
      }}
    >
      <div ref={raiz} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "visible" }} />
    </div>
  );
}
