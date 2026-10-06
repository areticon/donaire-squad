import React from "react";
import { Img } from "remotion";
import { corPedida, estiloDoTitulo, limitar, margens, misturar, rgba, saiSuave, texto, type Ctx } from "../base";
import { brilho, molaFisica, sombraFunda } from "../kit";

/**
 * A IMAGEM EM JANELA (05/10/2026, noite: o editor por comando em dois eixos).
 * A imagem gerada na Higgsfield para ESTE momento entra numa janela ao lado
 * da pessoa, com a moldura da LINGUAGEM do vídeo (o tema): papel com fita e
 * borda branca (documental), vidro com fio de luz (vidro), bloco com a barra
 * da marca (impacto), filete dourado (luxo) e brilho de neon (neon). É o
 * componente GENÉRICO da imagem: toda linguagem sem janela própria usa este,
 * com o tema dela.
 *
 * Props: url (posta pelo app a partir da inserção gerada), legenda?, lado?
 * ("direita" | "esquerda" | "topo").
 */
export function ImagemJanela(c: Ctx) {
  const { props: p, u, tema, vertical, W, H } = c;
  const url = texto(p.url);
  if (!url) return null;
  const m = margens(c);
  const lado = texto(p.lado, vertical ? "topo" : "direita");
  // A CAIXA DA LEITURA (06/10): o resolvedor mede a área livre do trecho (props.caixa, fração do quadro) e a janela
  // cabe nela, nunca sobre rosto, tela ou quadro; sem a caixa, o lado pedido com as medidas de sempre. No "centro"
  // (pedido do cliente), a caixa vem centrada do resolvedor e a janela fica no meio dela.
  const cx = p.caixa as { x?: number; y?: number; w?: number; h?: number } | undefined;
  const medida = cx && typeof cx === "object" && [cx.x, cx.y, cx.w, cx.h].every((v) => typeof v === "number" && Number.isFinite(v)) && cx.w! > 0.05 && cx.h! > 0.05 ? cx : null;
  const legenda = texto(p.legenda);
  // O espaço da legenda embaixo da imagem (só quando há legenda: sem ela, a imagem ocupa a caixa toda).
  const espacoDaLegenda = legenda ? (vertical ? 46 : 40) * u * 1.25 + 16 * u : 0;
  // O TAMANHO MÍNIMO relativo ao quadro (06/10, cmux0hoxk: a janela virou miniatura no topo do vertical): a janela
  // ocupa a caixa medida inteira na largura, com a altura dela, numa proporção entre a faixa larga e o quadrado
  // (vertical) ou entre 2:1 e 5:4 (horizontal); nunca abaixo de 70% (vertical) ou 34% (horizontal) da largura do
  // quadro, a menos que a própria caixa seja menor.
  const minimo = (vertical ? 0.7 : 0.34) * W;
  const [razaoMin, razaoMax] = vertical ? [0.42, 1] : [0.5, 0.8];
  let largura: number;
  let altura: number;
  if (medida) {
    const bw = medida.w! * W;
    const bh = Math.max(0, medida.h! * H - espacoDaLegenda);
    largura = bw;
    altura = Math.min(bh, largura * razaoMax);
    if (altura < largura * razaoMin) largura = Math.max(Math.min(bw, minimo), altura / razaoMin);
    // No vertical, a caixa estreita de edição antiga (a de 22% que virou miniatura) se abre para os lados até o
    // mínimo: a caixa medida fica acima ou abaixo do rosto, e abrir na horizontal não desce sobre ele.
    if (vertical && largura < minimo) {
      largura = minimo;
      altura = Math.max(altura, Math.min(bh, largura * razaoMin));
    }
  } else {
    largura = vertical ? Math.max(Math.min(m.largura, W * 0.86), minimo) : W * 0.4;
    altura = largura * (vertical ? 0.72 : 0.66);
  }
  const blocoH = altura + espacoDaLegenda;
  const x = medida ? limitar(medida.x! * W + (medida.w! * W - largura) / 2, Math.min(W * 0.05, (W - largura) / 2), Math.max(W * 0.95 - largura, (W - largura) / 2)) : vertical || lado === "topo" || lado === "centro" ? (W - largura) / 2 : lado === "esquerda" ? m.x : W - m.x - largura;
  // Nunca colada na borda de cima do quadro (a caixa medida pode começar em 0): pelo menos 2,5% de respiro.
  const y = medida ? Math.max(H * 0.025, medida.y! * H + Math.max(0, (medida.h! * H - blocoH) / 2)) : lado === "centro" ? (H - blocoH) / 2 : vertical || lado === "topo" ? m.topo : Math.max(m.topo, H * 0.16);
  // A cor pedida pelo cliente (06/10) vai nas letras da legenda e na moldura que leva o acento.
  const pedida = corPedida(c);
  const s = molaFisica(c.t, 190, 14);
  const opacidade = limitar(c.t / 0.15) * c.fica;
  // O movimento lento da imagem (Ken Burns): a janela nunca fica parada.
  const zoom = 1.04 + 0.08 * limitar(c.t / Math.max(1, c.dur));
  const papel = tema.visual === "documental";
  const luxo = tema.acabamento === "luxo";
  const neon = tema.linguagem === "neon";
  const ouro = "#C9A24A";
  const moldura: React.CSSProperties = papel
    ? { padding: 14 * u, background: misturar(tema.claro, "#ffffff", 0.7), borderRadius: 3 * u, boxShadow: sombraFunda(u, 0.9), transform: `rotate(${lado === "esquerda" ? -2.2 : 1.8}deg)` }
    : luxo
      ? { padding: 3 * u, background: `linear-gradient(135deg, ${ouro}, ${misturar(ouro, "#ffffff", 0.35)}, ${ouro})`, borderRadius: 6 * u, boxShadow: sombraFunda(u, 1) }
      : neon
        ? { padding: 3 * u, background: tema.acento, borderRadius: 18 * u, boxShadow: `${brilho(tema.acento, u, 1.2)}, ${sombraFunda(u, 0.8)}` }
        : tema.visual === "impacto"
          ? { padding: 8 * u, background: "#0b0c0f", borderRadius: 14 * u, boxShadow: sombraFunda(u, 1), borderBottom: `${10 * u}px solid ${tema.acento}` }
          : { padding: 4 * u, background: rgba("#ffffff", 0.1), border: `${Math.max(1, 1.5 * u)}px solid ${rgba("#ffffff", 0.55)}`, borderRadius: 24 * u, boxShadow: sombraFunda(u, 0.7) };
  const raioDaFoto = papel ? 1 * u : luxo ? 4 * u : neon ? 15 * u : tema.visual === "impacto" ? 8 * u : 20 * u;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: largura, opacity: opacidade, transform: `translateY(${(1 - s) * 50 * u}px) scale(${0.9 + 0.1 * s})`, transformOrigin: "center top" }}>
      <div style={moldura}>
        <div style={{ width: "100%", height: altura, overflow: "hidden", borderRadius: raioDaFoto, position: "relative" }}>
          <Img src={url} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, filter: papel ? "sepia(.12) contrast(1.04)" : undefined }} />
          {papel ? (
            // A fita adesiva no canto: a janela de papel colada na tela.
            <div style={{ position: "absolute", left: "38%", top: -18 * u, width: 150 * u, height: 40 * u, background: rgba("#f3ead2", 0.82), transform: "rotate(-4deg)", boxShadow: `0 ${2 * u}px ${6 * u}px rgba(0,0,0,.18)` }} />
          ) : null}
        </div>
      </div>
      {legenda ? (
        <div
          style={{
            ...estiloDoTitulo(c, vertical ? 46 : 40),
            marginTop: 16 * u,
            textAlign: vertical || lado === "topo" || lado === "centro" ? "center" : "left",
            color: pedida ?? (papel ? (tema.vox?.tinta ?? "#1b1a17") : "#ffffff"),
            background: papel && !pedida ? (tema.vox?.realce ?? rgba(tema.acento, 0.85)) : "transparent",
            display: papel ? "inline-block" : "block",
            padding: papel ? `${4 * u}px ${12 * u}px` : 0,
            textShadow: papel ? "none" : neon ? brilho(tema.acento, u, 0.7) : `0 ${3 * u}px ${14 * u}px rgba(0,0,0,.6)`,
            opacity: saiSuave((c.t - 0.35) / 0.4),
          }}
        >
          {legenda}
        </div>
      ) : null}
    </div>
  );
}
