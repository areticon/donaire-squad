import React from "react";
import { Img } from "remotion";
import type { ContextoDaPeca as Ctx } from "../sob-medida/tipos";

/**
 * A MÍDIA NA CAIXA (jornada oficial do editor, passo 7; 06/10/2026). A ÚNICA
 * peça da esteira nova: ela NÃO desenha conteúdo nenhum. Só posiciona a mídia
 * gerada por IA (a imagem da janela ou o recorte que entra sobre a gravação)
 * na caixa que o código calculou e o JEV escolheu (fora do rosto, dentro da
 * área segura, fora da faixa da legenda), e anima a entrada e a saída com a
 * animação escolhida pelo JEV. Nada de moldura, cartão, ícone ou texto em
 * código: o que aparece é o que a Higgsfield gerou.
 */

type Caixa = { x: number; y: number; w: number; h: number };

const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Mola amortecida (0 a 1), a mesma física das entradas do vídeo da landing. */
function mola(t: number, rigidez = 190, amortece = 19): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(rigidez);
  const z = amortece / (2 * w0);
  if (z >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  const wd = w0 * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
}

function caixaValida(c: unknown): Caixa | null {
  const x = c as Partial<Caixa> | null;
  return x && [x.x, x.y, x.w, x.h].every((v) => typeof v === "number" && Number.isFinite(v)) && x.w! > 0.02 && x.h! > 0.02 ? (x as Caixa) : null;
}

export function MidiaNaCaixa(c: Ctx) {
  const url = typeof c.props.imagem === "string" ? c.props.imagem : "";
  const cx = caixaValida(c.props.caixa);
  if (!url || !cx) return null;
  const caixa = { x: cx.x * c.W, y: cx.y * c.H, w: cx.w * c.W, h: cx.h * c.H };
  // A mídia inteira dentro da caixa, na proporção dela (a caixa já foi calculada nessa proporção).
  const p = Number(c.props.proporcaoDaImagem) > 0 ? Number(c.props.proporcaoDaImagem) : caixa.w / caixa.h;
  const w = Math.min(caixa.w, caixa.h * p);
  const h = w / p;
  const x = caixa.x + (caixa.w - w) / 2;
  const y = caixa.y + (caixa.h - h) / 2;
  const animacao = String(c.props.animacao ?? "crescer");
  const e = mola(c.t);
  const sai = c.fica;
  let transform = "";
  let filtro = "";
  if (animacao === "deslizar") {
    const lado = c.props.lado === "esquerda" ? -1 : 1;
    transform = `translateX(${((1 - e) * lado * 90 * c.u).toFixed(1)}px) translateY(${((1 - sai) * 10 * c.u).toFixed(1)}px)`;
  } else if (animacao === "desfoque") {
    filtro = `blur(${((1 - limitar(c.t / 0.4)) * 16 * c.u).toFixed(1)}px)`;
    transform = `scale(${(0.97 + 0.03 * e).toFixed(4)})`;
  } else {
    transform = `scale(${(0.6 + 0.4 * e - 0.04 * (1 - sai)).toFixed(4)})`;
  }
  const janela = Boolean(c.props.janela);
  const sombra = `drop-shadow(0 ${12 * c.u}px ${28 * c.u}px rgba(0,0,0,0.38))`;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: limitar(c.t / 0.12) * sai, transform, transformOrigin: "50% 55%", filter: [filtro, sombra].filter(Boolean).join(" ") }}>
      <Img src={url} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: janela ? 18 * c.u : 0, overflow: "hidden" }} />
    </div>
  );
}
