import React from "react";
import { escuroDoTema, limitar, luz, misturar, rgba, saiSuave, texto, type Ctx } from "../base";
import { brilho, molaFisica, sombraFunda } from "../kit";

/**
 * CURTIR E SE INSCREVER (05/10/2026, noite; regra 3 do Bruno): a chamada
 * animada do YouTube, sobre a gravação, perto de um momento forte. O JEV
 * escolhe os momentos (lib/media/editor-por-comando/plano-pelo-jev.ts,
 * `decidirInscrever`); aqui é só o desenho, em código, na LINGUAGEM do vídeo
 * (o tema diz como: papel rasgado no documental, vidro no tecnológico, bloco
 * no impacto, filete dourado no luxo, brilho no neon). Nenhum nome de estilo
 * decide se a peça entra; o tema só muda a aparência. As cores da marca
 * ficam nos detalhes: o polegar que acende e o botão depois do clique.
 *
 *   entra  a etiqueta sobe do canto com mola
 *   evento o CLIQUE: o cursor toca, o polegar enche com a cor da marca e salta;
 *          o botão "Inscrever-se" vira cheio com o sino que balança
 *   sai    desce de volta
 *
 * Props: chamada? (até 4 palavras), lado? ("direita" | "esquerda" no 16:9;
 * "topo" | "baixo" no 9:16).
 */
export function Inscrever(c: Ctx) {
  const { props: p, u, tema, vertical, W, H } = c;
  const lado = texto(p.lado, vertical ? "baixo" : "direita");
  const chamada = texto(p.chamada, "Curtir e se inscrever");
  const papel = tema.visual === "documental";
  const luxo = tema.acabamento === "luxo";
  const neon = tema.linguagem === "neon";
  const impacto = tema.visual === "impacto";
  const marca = tema.acentoMarca ?? tema.acento;
  const acento = luxo ? "#C9A24A" : marca;
  const entra = molaFisica(c.t, 180, 16);
  const clique = c.passos[0] ?? limitar((c.t - 1.1) / 0.6);
  const bate = molaFisica(clique, 260, 12);
  const k = saiSuave(clique);
  const sai = c.fica;
  const esc = tema.vox?.tinta ?? escuroDoTema(tema);
  const tintaNoRealce = tema.vox?.tintaNoRealce ?? (luz(acento) > 0.62 ? "#111318" : "#ffffff");
  // A etiqueta: o acabamento da linguagem.
  const caixa: React.CSSProperties = papel
    ? { background: "#f3ecd9", color: esc, boxShadow: sombraFunda(u, 0.9), clipPath: "polygon(1% 4%, 30% 0, 62% 3%, 100% 1%, 99% 40%, 100% 72%, 98% 100%, 60% 97%, 28% 100%, 0 98%, 2% 60%)", padding: `${18 * u}px ${30 * u}px` }
    : luxo
      ? { background: "#0b0b0e", color: "#f3ecd9", border: `${2 * u}px solid ${acento}`, borderRadius: 14 * u, boxShadow: sombraFunda(u, 1), padding: `${16 * u}px ${28 * u}px` }
      : neon
        ? { background: "rgba(8,8,14,.78)", color: "#ffffff", border: `${2 * u}px solid ${rgba(tema.acento, 0.9)}`, borderRadius: 999, boxShadow: `${brilho(tema.acento, u, 1.1)}, ${sombraFunda(u, 0.8)}`, padding: `${16 * u}px ${28 * u}px` }
        : impacto
          ? { background: "#0b0c0f", color: "#ffffff", borderRadius: 16 * u, boxShadow: sombraFunda(u, 1), borderLeft: `${10 * u}px solid ${tema.acento}`, padding: `${16 * u}px ${28 * u}px` }
          : { background: rgba("#ffffff", 0.16), color: "#ffffff", border: `${1.5 * u}px solid ${rgba("#ffffff", 0.35)}`, borderRadius: 999, boxShadow: sombraFunda(u, 0.9), backdropFilter: `blur(${14 * u}px)`, padding: `${16 * u}px ${28 * u}px` };
  const fonte = papel ? '"Playfair Display", Georgia, serif' : tema.fonteTitulo;
  const tam = (vertical ? 44 : 42) * u;
  const icone = tam * 1.25;
  // Onde: no 16:9, embaixo no lado livre do rosto; no 9:16, na faixa livre, centrado.
  const pos: React.CSSProperties = vertical
    ? { left: 0, right: 0, display: "flex", justifyContent: "center", ...(lado === "topo" ? { top: 0.08 * H } : { bottom: 0.1 * H }) }
    : { bottom: 0.09 * H, ...(lado === "esquerda" ? { left: 0.05 * W } : { right: 0.05 * W }) };
  const deslocamento = (1 - entra) * 80 * u + (1 - sai) * 60 * u;
  const cheio = acento;
  return (
    <div style={{ position: "absolute", ...pos, opacity: limitar(c.t / 0.12) * sai }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 22 * u, transform: `translateY(${deslocamento.toFixed(1)}px) rotate(${papel ? -1.5 : 0}deg) scale(${(0.96 + 0.04 * entra).toFixed(3)})`, ...caixa }}>
        {/* O polegar: contorno; no clique, enche com a cor da marca e salta. */}
        <div style={{ position: "relative", width: icone, height: icone, transform: `scale(${(1 + 0.35 * Math.sin(Math.PI * limitar(bate))).toFixed(3)}) rotate(${(-12 * (1 - k)).toFixed(1)}deg)` }}>
          <svg viewBox="0 0 24 24" width={icone} height={icone} fill={k > 0.5 ? cheio : "none"} stroke={k > 0.5 ? cheio : "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
          {/* As faíscas do clique. */}
          {clique > 0 && clique < 1
            ? [0, 1, 2, 3, 4, 5].map((i) => {
                const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
                const r = icone * (0.55 + 0.6 * saiSuave(clique));
                return <i key={i} style={{ position: "absolute", left: icone / 2 + Math.cos(a) * r - 3 * u, top: icone / 2 + Math.sin(a) * r - 3 * u, width: 6 * u, height: 6 * u, borderRadius: "50%", background: cheio, opacity: 1 - clique }} />;
              })
            : null}
        </div>
        <span style={{ fontFamily: fonte, fontWeight: 700, fontSize: tam, letterSpacing: papel ? "0.01em" : "0.02em", whiteSpace: "nowrap", textTransform: tema.caixaAlta ? "uppercase" : "none" }}>{chamada}</span>
        {/* O botão "Inscrever-se": contorno; depois do clique, cheio na cor da marca, com o sino que balança. */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10 * u,
            padding: `${10 * u}px ${20 * u}px`,
            borderRadius: papel ? 6 * u : 999,
            border: `${2 * u}px solid ${cheio}`,
            background: k > 0.5 ? cheio : "transparent",
            color: k > 0.5 ? tintaNoRealce : "currentColor",
            fontFamily: fonte,
            fontWeight: 700,
            fontSize: tam * 0.78,
            whiteSpace: "nowrap",
            transform: `scale(${(1 + 0.08 * Math.sin(Math.PI * limitar(bate))).toFixed(3)})`,
            boxShadow: k > 0.5 && !papel ? brilho(cheio, u, 0.5) : "none",
          }}
        >
          <svg viewBox="0 0 24 24" width={tam * 0.8} height={tam * 0.8} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ transformOrigin: "50% 15%", transform: `rotate(${(k > 0.5 ? 18 * Math.sin((c.t - 1.1) * 14) * Math.max(0, 1 - (c.t - 1.1) / 1.4) : 0).toFixed(1)}deg)` }}>
            <path d="M10.268 21a2 2 0 0 0 3.464 0" />
            <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
          </svg>
          {k > 0.5 ? "Inscrito" : "Inscrever-se"}
        </div>
        {/* O cursor que vem clicar (some depois). */}
        {clique > 0 && clique < 1 ? (
          <svg viewBox="0 0 24 24" width={tam * 0.9} height={tam * 0.9} fill="#ffffff" stroke="#111" strokeWidth={1.2} style={{ position: "absolute", right: -tam * 0.2 + (1 - clique) * 60 * u, bottom: -tam * 0.5 + (1 - clique) * 60 * u, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))" }}>
            <path d="M5 3l14 8-6 2-3 6z" />
          </svg>
        ) : null}
      </div>
      {luxo ? <div style={{ position: "absolute", inset: -2 * u, borderRadius: 16 * u, background: `linear-gradient(135deg, ${misturar(acento, "#ffffff", 0.3)}, transparent 40%)`, opacity: 0.25, pointerEvents: "none" }} /> : null}
    </div>
  );
}
