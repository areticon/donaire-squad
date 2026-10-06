import React from "react";
import { Img } from "remotion";
import { limitar } from "../base";
import { molaFisica } from "../kit";
import type { ContextoDaPeca as Ctx } from "../tipos";

/**
 * O ELEMENTO GERADO POR IA (06/10/2026, regra do Bruno): TODO elemento visual
 * da edição nasce na Higgsfield (ícone, logo das redes, cartões, comparação,
 * tela de edição, título), em fundo liso e recortado no BiRefNet antes de
 * chegar aqui (lib/media/editor-por-comando/elemento-gerado.ts). O código NÃO
 * desenha nada: só POSICIONA a imagem recortada na caixa medida pelo
 * resolvedor (props.caixa, fração do quadro, na área livre) e anima a entrada
 * e a saída. Substitui as cinco peças vetoriais desenhadas em código
 * (pecas/vetoriais.tsx, removido): ícones lucide genéricos no lugar dos logos,
 * ícone quebrado e peça colada na borda no vídeo cmux4417u000004l56g3x5urx.
 *
 * MARGEM SEGURA, a última trava (o resolvedor já mede): nada nos 10% de cima
 * do quadro e nada a menos de 4% da borda. Sem `props.imagem`, não aparece
 * nada (o plano tira o momento antes; aqui é só a guarda).
 */

type Caixa = { x: number; y: number; w: number; h: number };

/** A margem segura em fração do quadro: o topo (10%) e as bordas (4%). */
export const MARGEM_DO_TOPO = 0.1;
export const MARGEM_DA_BORDA = 0.04;

/** A caixa em fração, presa à margem segura (encolhe, nunca encosta). */
export function caixaSegura(cx: Partial<Caixa> | undefined, reserva: Caixa): Caixa {
  const ok = cx && typeof cx === "object" && [cx.x, cx.y, cx.w, cx.h].every((v) => typeof v === "number" && Number.isFinite(v)) && cx.w! > 0.05 && cx.h! > 0.03;
  const f = ok ? (cx as Caixa) : reserva;
  const x0 = Math.max(MARGEM_DA_BORDA, f.x);
  const y0 = Math.max(MARGEM_DO_TOPO, f.y);
  const x1 = Math.min(1 - MARGEM_DA_BORDA, f.x + f.w);
  const y1 = Math.min(1 - MARGEM_DA_BORDA, f.y + f.h);
  return { x: x0, y: y0, w: Math.max(0.05, x1 - x0), h: Math.max(0.03, y1 - y0) };
}

export function ElementoGerado(c: Ctx) {
  const url = typeof c.props.imagem === "string" ? c.props.imagem : "";
  if (!url) return null;
  const reserva = c.vertical ? { x: 0.08, y: 0.58, w: 0.84, h: 0.3 } : { x: 0.54, y: 0.2, w: 0.42, h: 0.56 };
  const f = caixaSegura(c.props.caixa as Partial<Caixa> | undefined, reserva);
  const caixa = { x: f.x * c.W, y: f.y * c.H, w: f.w * c.W, h: f.h * c.H };
  // A imagem cabe inteira na caixa, na proporção dela (props.proporcaoDaImagem = largura / altura).
  const p = Number(c.props.proporcaoDaImagem) > 0 ? Number(c.props.proporcaoDaImagem) : caixa.w / caixa.h;
  const w = Math.min(caixa.w, caixa.h * p);
  const h = w / p;
  const x = caixa.x + (caixa.w - w) / 2;
  // O título fica no alto da caixa; o resto, centrado nela.
  const y = c.props.ancora === "topo" ? caixa.y : caixa.y + (caixa.h - h) / 2;
  // Entrada: mola curta subindo; saída: some e desce um pouco. Nada além disso.
  const e = molaFisica(c.t, 190, 18);
  const opacidade = limitar(c.t / 0.15) * c.fica;
  const dy = ((1 - e) * 36 + (1 - c.fica) * 14) * c.u;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: opacidade, transform: `translateY(${dy}px) scale(${(0.9 + 0.1 * e).toFixed(4)})`, transformOrigin: "50% 60%" }}>
      <Img src={url} style={{ width: "100%", height: "100%", objectFit: "contain", filter: `drop-shadow(0 ${10 * c.u}px ${24 * c.u}px rgba(0,0,0,0.35))` }} />
    </div>
  );
}
