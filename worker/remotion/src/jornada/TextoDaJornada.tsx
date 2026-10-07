import React from "react";
import { limitar, misturar, rgba, saiSuave } from "../sob-medida/base";
import type { ContextoDaPeca as Ctx } from "../sob-medida/tipos";

/**
 * O TEXTO EM CAMADA DA JORNADA (07/10/2026), a receita do vídeo da landing
 * (docs/referencia-landing/v4/montar_pitch4.py) liberada pelo Bruno: o texto é
 * desenhado em código POR CIMA da mídia gerada, nunca dentro dela.
 *
 *   - o título num painel de vidro (fundo escuro 0,9, borda clara, sombra
 *     funda; a gravação atrás desfocada de verdade pela passada "vidro"), com
 *     o trecho de destaque no degradê do acento;
 *   - os itens (até 3) entram cada um NA PALAVRA FALADA (o q() da landing),
 *     subindo 26 px em 0,35 s com esmaecimento de 0,28 s;
 *   - na tela cheia, a cena escurece por trás do texto (a landing escurece e
 *     dessatura toda cena de IA que carrega texto).
 *
 * O que está escrito vem do Claude (só escreve) e se entra, do JEV; o código
 * só desenha. Nenhum número aqui depende de estilo: o tema muda cor e letra.
 */

type Item = { texto: string; t: number };
type Ancora = { x: number; y: number; w: number };

const entrada = (t: number, de: number, u: number) => {
  const p = limitar((t - de) / 0.35);
  return { opacity: limitar((t - de) / 0.28), transform: `translateY(${((1 - saiSuave(p)) * 26 * u).toFixed(1)}px)` };
};

function tituloComDestaque(titulo: string, destaque: string, grad: string): React.ReactNode {
  const i = destaque ? titulo.toLowerCase().indexOf(destaque.toLowerCase()) : -1;
  if (i < 0) return titulo;
  const estilo: React.CSSProperties = { backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" };
  return (
    <>
      {titulo.slice(0, i)}
      <span style={estilo}>{titulo.slice(i, i + destaque.length)}</span>
      {titulo.slice(i + destaque.length)}
    </>
  );
}

export function TextoDaJornada(c: Ctx) {
  const titulo = String(c.props.titulo ?? "").trim();
  const itens = (Array.isArray(c.props.itens) ? (c.props.itens as Item[]) : []).filter((x) => x && String(x.texto ?? "").trim());
  if (!titulo && !itens.length) return null;
  const destaque = String(c.props.destaque ?? "").trim();
  const a = c.props.ancora as Ancora | undefined;
  const ancora: Ancora = a && [a.x, a.y, a.w].every((v) => typeof v === "number" && Number.isFinite(v)) ? a : { x: 0.06, y: c.vertical ? 0.11 : 0.08, w: c.vertical ? 0.86 : 0.5 };
  const escurecer = Boolean(c.props.escurecer);
  const u = c.u;
  const t = c.t;
  const sai = c.fica;
  const acento = c.tema.acento;
  const escuro = c.tema.escuro || "#06111f";
  const claro = "#e8eef6";
  const grad = `linear-gradient(100deg, ${misturar(acento, "#ffffff", 0.55)}, ${acento})`;
  const vidro: React.CSSProperties = {
    background: rgba(misturar(escuro, "#000000", 0.25), 0.9),
    border: `${Math.max(1, u)}px solid rgba(255,255,255,0.13)`,
    borderRadius: 22 * u,
    boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.45)`,
  };
  const tam = (c.vertical ? 50 : 58) * u * (titulo.length > 34 ? 0.84 : 1);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: sai, fontFamily: c.tema.fonteTitulo || "Geist", color: claro }}>
      {escurecer ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: limitar(t / 0.3),
            // A cena fica ATRÁS do texto: escurece inteira um pouco (a landing escurece de 6% a 30%), mais no alto, onde o texto mora, e com vinheta.
            background: `linear-gradient(180deg, ${rgba(escuro, 0.72)} 0%, ${rgba(escuro, 0.3)} 40%, rgba(0,0,0,0) 62%), radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%), ${rgba(escuro, 0.2)}`,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", left: ancora.x * c.W, top: ancora.y * c.H, width: ancora.w * c.W, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 * u }}>
        {titulo ? (
          <div data-vidro="" style={{ ...vidro, ...entrada(t, 0, u), padding: `${22 * u}px ${30 * u}px`, maxWidth: "100%" }}>
            <div style={{ fontWeight: c.tema.pesoTitulo || 600, fontSize: tam, lineHeight: 1.06, letterSpacing: "-0.025em" }}>{tituloComDestaque(titulo, destaque, grad)}</div>
          </div>
        ) : null}
        {itens.slice(0, 3).map((it, k) => (
          <div
            key={k}
            data-vidro=""
            style={{ ...vidro, ...entrada(t, Math.max(0.05, it.t), u), borderRadius: 18 * u, padding: `${14 * u}px ${22 * u}px`, display: "flex", alignItems: "center", gap: 14 * u, opacity: t < it.t ? 0 : entrada(t, it.t, u).opacity }}
          >
            <span style={{ width: 12 * u, height: 12 * u, borderRadius: "50%", background: grad, flex: "0 0 auto", boxShadow: `0 0 ${12 * u}px ${rgba(acento, 0.7)}` }} />
            <span style={{ fontWeight: 600, fontSize: (c.vertical ? 34 : 36) * u, lineHeight: 1.15 }}>{String(it.texto)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
