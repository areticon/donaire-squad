import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { CenaResolvida, MontagemResolvida, PropsDaMontagem } from "./tipos";
import { Fundo, Midia, Narrador, cameraDaCena, transformDaCamera } from "./partes/cena";
import { Elemento } from "./partes/elementos";
import { Legenda } from "./partes/legenda";
import { bordaRasgada, carregarFontes } from "./util";

/**
 * A MONTAGEM: desenha o plano resolvido, cena a cena. Nada aqui decide: o
 * diretor decidiu o quê, o app decidiu onde (lib/media/plano-de-montagem.ts),
 * e este arquivo só pinta.
 *
 * Camadas, de baixo para cima: fundo de papel, mídia, narrador, elementos,
 * legenda, transições. O áudio é UM só, o da gravação limpa: todo vídeo
 * visual entra mudo, e a voz nunca pula na troca de cena.
 */

/** Quadros extras que a cena anterior fica viva para a seguinte deslizar por cima. */
const SOBREPOSICAO_DO_DESLIZE = 8;

const Cena: React.FC<{ cena: CenaResolvida; props: PropsDaMontagem; quadroInicial: number; indice: number; empurrada: boolean }> = ({ cena, props, quadroInicial, indice, empurrada }) => {
  const quadro = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const m = props.montagem;
  const deslize = cena.transicao === "deslize" ? interpolate(quadro, [0, SOBREPOSICAO_DO_DESLIZE], [width, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
  // A FUSÃO dos sóbrios (30/09): a cena nova aparece por cima da anterior,
  // que continua viva os mesmos quadros extras do deslize.
  const fusao = cena.transicao === "fundir" ? interpolate(quadro, [0, SOBREPOSICAO_DO_DESLIZE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) }) : 1;
  // O DESLIZE É EMPURRÃO (29/09): a cena que sai recua um terço da largura e
  // escurece enquanto a nova entra por cima, em vez de ficar parada.
  const durDaCena = Math.round((cena.fim - cena.inicio) * fps);
  const empurrao = empurrada ? interpolate(quadro, [durDaCena, durDaCena + SOBREPOSICAO_DO_DESLIZE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 0;
  const recortadoPronto = props.recortados?.[String(indice)];
  // Sem fundo quando o narrador cobre o quadro inteiro (cheio, B-roll, recortado pronto).
  // O narrador cheio do vertical deixa uma faixa de cima livre desde 30/09
  // (ver GEOMETRIA em lib/media/plano-de-montagem.ts): ali aparece o fundo.
  const cheioDeVerdade = cena.layout === "narrador-cheio" && (!cena.narrador || (cena.narrador.caixa.y <= 0 && cena.narrador.caixa.h >= m.altura));
  const mostraFundo = !cheioDeVerdade && cena.layout !== "broll-cheio" && !recortadoPronto;
  // A câmera (ver cameraDaCena): a cena inteira anda junto em volta do foco;
  // o fundo de papel anda a um terço, que dá profundidade de mural.
  const camera = cameraDaCena(cena, quadro, fps, m.familia);
  const foco = cena.foco ?? { x: m.largura / 2, y: m.altura / 2 };
  const origem = `${foco.x}px ${foco.y}px`;
  // O PIP COM UM TERÇO LIVRE (01/10): a janela entra deslizando do lado dela
  // (direita no deitado, de baixo no vertical) quando a cena anterior não era
  // PIP, e sai do mesmo jeito quando a próxima não é.
  const anterior = props.montagem.cenas[indice - 1];
  const proxima = props.montagem.cenas[indice + 1];
  const pip = cena.layout === "pip-terco";
  const deitado = m.largura > m.altura;
  const entraPip = pip && anterior?.layout !== "pip-terco" ? spring({ frame: quadro, fps, config: { damping: 16, stiffness: 170 }, durationInFrames: 12 }) : 1;
  const saiPip = pip && proxima?.layout !== "pip-terco" ? interpolate(quadro, [durDaCena - 8, durDaCena], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) }) : 0;
  const foraDoPip = (1 - entraPip) + saiPip;
  const deslizePip = pip ? (deitado ? `translateX(${foraDoPip * m.largura * 0.38}px)` : `translateY(${foraDoPip * m.altura * 0.36}px)`) : "";
  return (
    <AbsoluteFill style={{ transform: `translateX(${deslize - empurrao * width * 0.3}px)`, overflow: "hidden", opacity: fusao }}>
      {mostraFundo ? (
        <AbsoluteFill style={{ transform: transformDaCamera(camera, 0.35), transformOrigin: origem }}>
          <Fundo cena={cena} montagem={m} pronto={props.fundos?.[cena.fundo]} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: "#000" }} />
      )}
      <AbsoluteFill style={{ transform: transformDaCamera(camera), transformOrigin: origem }}>
        <Midia cena={cena} montagem={m} duracaoDoVideo={cena.midia ? props.duracaoDasMidias?.[cena.midia.url] : undefined} />
        <AbsoluteFill style={{ transform: deslizePip }}>
          <Narrador
            cena={cena}
            montagem={m}
            narradorUrl={props.narradorUrl}
            recortadoUrl={props.recortadoUrl}
            quadroInicial={quadroInicial}
            cheio={props.cheio}
            recortadoPronto={recortadoPronto}
          />
        </AbsoluteFill>
        {m.familia === "colagem"
          ? cena.elementos.map((el, i) => <Elemento key={i} el={el} montagem={m} inicioDaCena={cena.inicio} fundo={cena.fundo} layout={cena.layout} />)
          : null}
      </AbsoluteFill>
      {/* Fora da colagem o grafismo NÃO anda com a câmera (30/09): tarja de
          telejornal e palavra gigante do Hormozi ficam presas à tela enquanto
          o punch mexe na imagem; na colagem tudo é um mural só e anda junto. */}
      {m.familia !== "colagem" ? (
        <AbsoluteFill>
          {cena.elementos.map((el, i) => (
            <Elemento key={i} el={el} montagem={m} inicioDaCena={cena.inicio} fundo={cena.fundo} layout={cena.layout} />
          ))}
        </AbsoluteFill>
      ) : null}
      {empurrao > 0 ? <AbsoluteFill style={{ background: "#000", opacity: empurrao * 0.35 }} /> : null}
    </AbsoluteFill>
  );
};

/**
 * A folha de papel que passa pela frente e esconde o corte (29/09: passa
 * GIRANDO, com a sombra crescendo no meio do trajeto e uma segunda folha
 * menor logo atrás, em vez de uma folha reta de rotação fixa). A sombra é uma
 * cópia escura da folha (clip-path cortaria uma box-shadow).
 */
const FolhaDePapel: React.FC<{ montagem: MontagemResolvida; semente: number; papelPronto?: string }> = ({ montagem, semente, papelPronto }) => {
  const quadro = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const dur = Math.round(fps * 0.6);
  const w = Math.hypot(width, height) * 1.15;
  const folha = (atraso: number, tamanho: number, s: number, opacidade: number) => {
    const p = interpolate(quadro - atraso, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    if (p <= 0 || p >= 1) return null;
    const lado = w * tamanho;
    // Entra por baixo e à direita, cobre o quadro inteiro no meio (o corte
    // acontece por trás dela) e sai por cima e à esquerda, girando.
    const x = interpolate(p, [0, 1], [width * 1.1, -lado * 1.05]);
    const y = interpolate(p, [0, 1], [height * 0.5, -height * 0.35]);
    const giro = interpolate(p, [0, 1], [-22, -8]);
    const sombra = 30 + 60 * Math.sin(p * Math.PI);
    const clip = bordaRasgada(s, 40, 1.1);
    return (
      <>
        <div style={{ position: "absolute", left: x - sombra, top: y - lado / 2 + sombra * 0.4, width: lado, height: lado, transform: `rotate(${giro}deg)`, background: "rgba(0,0,0,0.28)", clipPath: clip, opacity: opacidade }} />
        <div style={{ position: "absolute", left: x, top: y - lado / 2, width: lado, height: lado, transform: `rotate(${giro}deg)`, background: "#F1EDE4", clipPath: clip, opacity: opacidade }}>
          {papelPronto ? (
            <Img src={papelPronto} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : montagem.papelUrl ? (
            <Img src={montagem.papelUrl} style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.9 }} />
          ) : null}
        </div>
      </>
    );
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {folha(4, 0.55, semente + 1, 0.9)}
      {folha(0, 1, semente, 1)}
    </AbsoluteFill>
  );
};

const Flash: React.FC = () => {
  const quadro = useCurrentFrame();
  return <AbsoluteFill style={{ background: "#fff", opacity: interpolate(quadro, [0, 2, 9], [0, 0.95, 0], { extrapolateRight: "clamp" }) }} />;
};

export const Montagem: React.FC<PropsDaMontagem> = (props) => {
  carregarFontes();
  const { fps } = useVideoConfig();
  const m = props.montagem;
  const q = (s: number) => Math.round(s * fps);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Audio src={props.narradorUrl} />
      {m.cenas.map((c, i) => {
        const de = q(c.inicio);
        const proxima = m.cenas[i + 1];
        const extra = proxima?.transicao === "deslize" || proxima?.transicao === "fundir" ? SOBREPOSICAO_DO_DESLIZE : 0;
        return (
          <Sequence key={i} from={de} durationInFrames={Math.max(1, q(c.fim) - de + extra)} name={`${i + 1} ${c.layout}`}>
            <Cena cena={c} props={props} quadroInicial={de} indice={i} empurrada={proxima?.transicao === "deslize"} />
          </Sequence>
        );
      })}
      <Legenda montagem={m} />
      {m.marca.logoUrl ? <Img src={m.marca.logoUrl} style={{ position: "absolute", left: 48, top: 48, width: m.largura * 0.14, opacity: 0.92 }} /> : null}
      {m.cenas.map((c, i) =>
        c.transicao === "folha-de-papel" ? (
          <Sequence key={`t${i}`} from={Math.max(0, q(c.inicio) - Math.round(fps * 0.3))} durationInFrames={Math.round(fps * 0.6)} name={`folha ${i + 1}`}>
            <FolhaDePapel montagem={m} semente={i * 97 + 13} papelPronto={props.fundos?.folha ?? props.fundos?.papel} />
          </Sequence>
        ) : c.transicao === "flash" ? (
          <Sequence key={`t${i}`} from={q(c.inicio)} durationInFrames={10} name={`flash ${i + 1}`}>
            <Flash />
          </Sequence>
        ) : null
      )}
    </AbsoluteFill>
  );
};
