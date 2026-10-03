import React from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { MontagemResolvida } from "../tipos";
import { FONTES, bordaRasgada, contraste } from "../util";

/**
 * A legenda sincronizada palavra a palavra, no estilo da linguagem:
 *
 * - papel (Vox e colagens): cada palavra num pedaço de papel rasgado com
 *   sombra dura, em grotesca pesada; a palavra falada é grifada na cor da
 *   marca por dentro do papel dela;
 * - destaque (Hormozi e retenção): caixa alta grande com contorno, a palavra
 *   falada na cor da marca e um pouco maior;
 * - limpa (sóbrios): branca com sombra, a palavra falada na cor da marca;
 * - caixa (30/09, estilo fixado pelo cliente): a frase inteira numa faixa na
 *   cor escura da marca, texto branco, a palavra falada acende no acento;
 * - marca-texto (30/09, idem): texto branco com sombra, e cada palavra ganha
 *   o grifo na cor da marca quando é dita, e fica grifada até a página sair;
 * - destaque no kit do consórcio (02/10): a legenda que o nicho usa, Anton em
 *   caixa alta BRANCA com sombra macia e contorno fino (nada do contorno
 *   grosso de retenção), a palavra da vez cresce e só ganha a cor da marca
 *   quando a cor lê sobre a gravação. A posição (no meio do quadro) vem da cena.
 *
 * Sem legenda (escolha do cliente) chega com a lista de páginas vazia, e nada
 * é desenhado.
 *
 * Reprovação de 29/09 ("legenda pobre"): Arial numa caixa lisa que re-entrava
 * a cada página e pulava de lugar. Agora:
 * - cada palavra ENTRA quando é dita (escala e subida curtas) e a da vez
 *   cresce; as que ainda não foram ditas ocupam o lugar invisíveis, então a
 *   página não se mexe enquanto é montada (e não sobra caixa vazia, porque
 *   cada palavra tem o papel dela);
 * - a página só anima a entrada depois de um silêncio (mais de 0,3 s sem
 *   legenda), e não a cada página;
 * - na troca de cena a posição DESLIZA da anterior para a nova em 10 quadros.
 *
 * A posição vem da cena (resolvida no app, longe do rosto e da janela do
 * narrador). Custo: um spring por palavra visível, só transform e opacidade.
 */
export const Legenda: React.FC<{ montagem: MontagemResolvida }> = ({ montagem }) => {
  const quadro = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = quadro / fps;
  const paginas = montagem.legenda.paginas;
  const indice = paginas.findIndex((p) => t >= p.inicio && t < p.fim);
  if (indice < 0) return null;
  const pagina = paginas[indice];
  // Página escondida: um marca-texto ou tarja já mostra estas palavras.
  if (pagina.oculta) return null;

  const ci = Math.max(0, montagem.cenas.findIndex((c) => t >= c.inicio && t < c.fim));
  const cena = montagem.cenas[ci] ?? montagem.cenas[montagem.cenas.length - 1];
  let { x, y, largura } = cena.legenda;
  const anterior = montagem.cenas[ci - 1];
  if (anterior) {
    const k = (t - cena.inicio) * fps;
    if (k < 10) {
      const p = Easing.out(Easing.cubic)(Math.max(0, k) / 10);
      x = interpolate(p, [0, 1], [anterior.legenda.x, x]);
      y = interpolate(p, [0, 1], [anterior.legenda.y, y]);
      largura = interpolate(p, [0, 1], [anterior.legenda.largura, largura]);
    }
  }

  const estilo = montagem.legenda.estilo;
  const vertical = montagem.altura > montagem.largura;
  const doConsorcio = estilo === "destaque" && montagem.estilo?.kit === "consorcio";
  const letras = pagina.palavras.reduce((s, p) => s + p.texto.length + 1.6, 0);
  // Destaque (impacto) é a legenda GRANDE de retenção, duas palavras por
  // página; limpa (sóbrio) é a de telejornal, menor e sem peso de manchete.
  const base =
    estilo === "destaque"
      ? vertical ? 112 : 80
      : estilo === "limpa"
        ? vertical ? 58 : 44
        : estilo === "caixa" || estilo === "marca-texto"
          ? vertical ? 80 : 56
          : vertical ? 78 : 58;
  // Encolhe para caber em até duas linhas na largura da cena (a grotesca
  // pesada é larga: perto de 0,7 em por letra, mais o papel de cada palavra).
  const tamanho = Math.min(base, (largura * 1.85) / Math.max(8, letras * (estilo === "destaque" ? 0.62 : 0.72)));

  // A página só entra de novo depois de um silêncio visível.
  const previa = paginas[indice - 1];
  const reentra = !previa || previa.oculta || pagina.inicio - previa.fim > 0.3;
  const entrada = reentra ? spring({ frame: quadro - Math.round(pagina.inicio * fps), fps, config: { damping: 14, stiffness: 240 }, durationInFrames: 8 }) : 1;
  const acento = montagem.marca.acento;
  const corNoGrifo = contraste(acento);
  // No consórcio a palavra da vez só ganha a cor da marca se ela lê sobre a gravação.
  const corDaVez = doConsorcio ? (corNoGrifo === "#ffffff" ? "#ffffff" : acento) : acento;

  const palavras = pagina.palavras.map((p, i) => {
    const q0 = Math.round(p.inicio * fps);
    const dita = quadro >= q0;
    // Limpa e caixa: a linha inteira aparece de uma vez e nada pula (legenda
    // de emissora); nas outras, cada palavra entra quando é dita.
    const limpa = estilo === "limpa" || estilo === "caixa";
    const s = limpa ? 1 : dita ? spring({ frame: quadro - q0, fps, config: { damping: 12, stiffness: 320 }, durationInFrames: 7 }) : 0;
    const falando = t >= p.inicio && t < (pagina.palavras[i + 1]?.inicio ?? pagina.fim);
    const texto = estilo === "destaque" ? p.texto.toUpperCase() : p.texto;
    const grifo = falando ? interpolate(quadro - q0, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }) : 0;
    // No consórcio a palavra da vez NÃO cresce (02/10, prova): com três palavras
    // por página, o crescimento colava a palavra na vizinha ("SEUNEGÓCIO").
    const transform = limpa ? "none" : `translateY(${(1 - s) * 16}px) scale(${(0.55 + 0.45 * s) * (falando && !doConsorcio ? (estilo === "destaque" ? 1.14 : 1.08) : 1)})`;
    if (estilo === "papel") {
      // Um papel por palavra, rasgado e levemente torto (fase por palavra).
      const semente = Math.round(p.inicio * 1000) + i * 17;
      const clip = bordaRasgada(semente, 7, 4);
      const giro = ((semente % 7) - 3) * 0.7;
      return (
        <span key={i} style={{ position: "relative", display: "inline-block", opacity: dita ? 1 : 0, transform: `${transform} rotate(${giro}deg)` }}>
          <span style={{ position: "absolute", inset: 0, transform: "translate(4px, 7px)", background: "rgba(0,0,0,0.32)", clipPath: clip }} />
          <span style={{ position: "relative", display: "inline-block", background: "#FBFAF5", clipPath: clip, padding: `${tamanho * 0.04}px ${tamanho * 0.2}px ${tamanho * 0.08}px` }}>
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: acento,
                transform: `scaleX(${grifo})`,
                transformOrigin: "left center",
              }}
            />
            <span style={{ position: "relative", color: grifo > 0.4 ? corNoGrifo : "#16171a" }}>{texto}</span>
          </span>
        </span>
      );
    }
    if (estilo === "marca-texto") {
      // O grifo corre da esquerda quando a palavra é dita e fica; a letra
      // troca para a que lê sobre o acento no meio da passada.
      const grifada = dita ? interpolate(quadro - q0, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) }) : 0;
      return (
        <span key={i} style={{ position: "relative", display: "inline-block", opacity: dita ? 1 : 0.9, transform: `scale(${falando ? 1.06 : 1})` }}>
          <span
            style={{
              position: "absolute",
              left: -tamanho * 0.12,
              right: -tamanho * 0.12,
              top: "8%",
              bottom: "2%",
              background: acento,
              transform: `scaleX(${grifada}) skewX(-6deg)`,
              transformOrigin: "left center",
              borderRadius: tamanho * 0.06,
            }}
          />
          <span
            style={{
              position: "relative",
              fontFamily: FONTES.texto,
              fontWeight: 700,
              fontSize: tamanho,
              lineHeight: 1.15,
              color: grifada > 0.5 ? corNoGrifo : "#ffffff",
              textShadow: grifada > 0.5 ? "none" : "0 3px 8px rgba(0,0,0,0.85), 0 0 14px rgba(0,0,0,0.5)",
            }}
          >
            {texto}
          </span>
        </span>
      );
    }
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          opacity: limpa || dita ? 1 : 0,
          transform,
          fontFamily: estilo === "destaque" ? FONTES.titulo : limpa ? FONTES.texto : FONTES.pesada,
          fontWeight: limpa ? 700 : undefined,
          fontSize: tamanho,
          lineHeight: 1.1,
          color: falando && (!limpa || estilo === "caixa") ? corDaVez : "#ffffff",
          WebkitTextStroke: doConsorcio ? `${Math.max(2, tamanho * 0.035)}px rgba(0,0,0,0.85)` : estilo === "destaque" ? `${tamanho * 0.1}px #000` : undefined,
          paintOrder: "stroke fill",
          textShadow: estilo === "caixa" ? "none" : doConsorcio ? "0 4px 0 rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.75)" : limpa ? "0 2px 3px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.6)" : "0 4px 14px rgba(0,0,0,0.7)",
        }}
      >
        {texto}
      </span>
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x - largura / 2,
        top: y,
        width: largura,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(-50%) scale(${0.8 + 0.2 * entrada})`,
        opacity: Math.min(1, entrada * 2),
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: `${tamanho * 0.12}px ${tamanho * (estilo === "papel" ? 0.1 : estilo === "limpa" || estilo === "caixa" || estilo === "marca-texto" ? 0.22 : doConsorcio ? 0.4 : 0.34)}px`,
          ...(estilo === "papel" ? { fontFamily: FONTES.pesada, fontSize: tamanho, lineHeight: 1.15 } : {}),
          // A faixa da frase em caixa: a cor escura da marca, quase opaca.
          ...(estilo === "caixa"
            ? { background: montagem.marca.escuro, padding: `${tamanho * 0.14}px ${tamanho * 0.34}px`, borderRadius: tamanho * 0.12, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }
            : {}),
        }}
      >
        {palavras}
      </div>
    </div>
  );
};
