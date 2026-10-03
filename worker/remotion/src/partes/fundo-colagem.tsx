import React from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { aleatorio, carregarFontes, rgba } from "../util";

/**
 * O FUNDO DE COLAGEM (29/09, reprovação "nada de elemento gráfico"). Nos
 * quadros de referência (4.png e 5.png) o fundo JÁ é a colagem: kraft, folhas
 * creme rasgadas, tiras de jornal desfocado e fita na cor da marca. O nosso
 * era uma cor lisa com textura sutil e sobrava um vazio escuro em volta da
 * janela do narrador.
 *
 * Tudo aqui é desenhado em código (nenhuma chamada de IA; a textura de papel
 * gerada entra só como grão por cima) e renderizado UMA vez por montagem pelo
 * worker, como JPEG do tamanho do quadro (worker/src/montagem.mjs,
 * `prepararFundos`). Por isso aqui pode filtro, sombra borrada e mistura:
 * nada disso roda por quadro do vídeo.
 *
 * Uma composição de 4 quadros, um fundo por quadro: 0 papel, 1 papel-marca,
 * 2 escuro, 3 folha (a folha lisa que passa na transição).
 */
export type PropsDosFundos = {
  largura: number;
  altura: number;
  marca: { acento: string; escuro: string };
  /** A textura de papel (grão) servida pelo worker, ou null. */
  papelUrl: string | null;
  semente?: number;
};

export const TIPOS_DE_FUNDO = ["papel", "papel-marca", "escuro", "folha"] as const;

type Folha = { x: number; y: number; w: number; h: number; giro: number };

/**
 * Onde ficam as folhas, em fração do quadro. Pensado para o vertical (o meio
 * do quadro é da mídia e do narrador, as folhas aparecem nas margens); no
 * deitado as mesmas frações espalham as folhas pelas bordas.
 */
const FOLHAS_EM_PE: { creme: Folha[]; jornal: Folha[] } = {
  creme: [
    { x: -0.08, y: -0.03, w: 0.7, h: 0.3, giro: -4 },
    { x: -0.12, y: 0.44, w: 0.55, h: 0.36, giro: 3 },
    { x: 0.56, y: 0.6, w: 0.52, h: 0.26, giro: -5 },
  ],
  jornal: [
    { x: 0.64, y: 0.07, w: 0.44, h: 0.44, giro: 3 },
    { x: 0.18, y: 0.82, w: 0.95, h: 0.22, giro: -3 },
  ],
};

const FOLHAS_DEITADO: { creme: Folha[]; jornal: Folha[] } = {
  creme: [
    { x: -0.04, y: -0.06, w: 0.4, h: 0.5, giro: -3 },
    { x: 0.62, y: 0.55, w: 0.42, h: 0.55, giro: 4 },
    { x: 0.4, y: -0.1, w: 0.3, h: 0.28, giro: 2 },
  ],
  jornal: [
    { x: 0.72, y: -0.05, w: 0.32, h: 0.5, giro: 3 },
    { x: -0.05, y: 0.62, w: 0.5, h: 0.45, giro: -2 },
  ],
};

/**
 * Borda de papel rasgado à mão: uma ondulação larga (o rasgo muda de
 * profundidade ao longo da borda) somada ao serrilhado fino da fibra. O
 * `bordaRasgada` de util serrilha por igual, e em folha grande lia como
 * picote de máquina.
 */
function rasgoNatural(semente: number, dentes = 90, amplitude = 2.2): string {
  const r = aleatorio(semente);
  const pts: string[] = [];
  const lado = (de: [number, number], ate: [number, number], normal: [number, number]) => {
    const fase = r() * Math.PI * 2;
    const onda = 1.5 + r() * 2.5;
    for (let i = 0; i < dentes; i++) {
      const t = i / dentes;
      const d = amplitude * (0.55 + 0.45 * Math.sin(t * Math.PI * onda + fase)) * (0.35 + 0.65 * r());
      pts.push(`${(de[0] + (ate[0] - de[0]) * t + normal[0] * d).toFixed(2)}% ${(de[1] + (ate[1] - de[1]) * t + normal[1] * d).toFixed(2)}%`);
    }
  };
  lado([0, 0], [100, 0], [0, 1]);
  lado([100, 0], [100, 100], [-1, 0]);
  lado([100, 100], [0, 100], [0, -1]);
  lado([0, 100], [0, 0], [1, 0]);
  return `polygon(${pts.join(",")})`;
}

/** Grão de fibra de papel em SVG (só aqui, no fundo renderizado uma vez). */
const Fibra: React.FC<{ id: string; frequencia: number; opacidade: number; modo?: React.CSSProperties["mixBlendMode"] }> = ({ id, frequencia, opacidade, modo = "multiply" }) => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: opacidade, mixBlendMode: modo }}>
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency={frequencia} numOctaves={3} seed={7} />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter={`url(#${id})`} />
  </svg>
);

/** Colunas de jornal desfocadas: parecem texto impresso e não se leem. */
const Jornal: React.FC<{ w: number; h: number; semente: number; escuro: boolean }> = ({ w, h, semente, escuro }) => {
  const r = aleatorio(semente);
  const colunas = w > h ? 4 : 3;
  const margem = w * 0.06;
  const larguraDaColuna = (w - margem * 2 - (colunas - 1) * margem * 0.5) / colunas;
  const linha = Math.max(8, Math.min(w, h) * 0.022);
  const barras: React.ReactNode[] = [];
  // Manchete: duas barras grossas no topo.
  barras.push(<rect key="m1" x={margem} y={margem} width={(w - margem * 2) * 0.86} height={linha * 2.2} fill="#2b2b2b" opacity={0.75} />);
  barras.push(<rect key="m2" x={margem} y={margem + linha * 2.9} width={(w - margem * 2) * 0.55} height={linha * 2.2} fill="#2b2b2b" opacity={0.75} />);
  const topo = margem + linha * 6.2;
  for (let c = 0; c < colunas; c++) {
    const x = margem + c * (larguraDaColuna + margem * 0.5);
    let y = topo;
    let n = 0;
    while (y < h - margem) {
      const fimDeParagrafo = n > 4 && r() < 0.12;
      const largura = larguraDaColuna * (fimDeParagrafo ? 0.3 + r() * 0.4 : 0.92 + r() * 0.08);
      // A linha é feita de "palavras" (traços curtos com vão), que é o que
      // faz ler como texto impresso desfocado e não como barra de gráfico.
      let px = x;
      let k = 0;
      while (px < x + largura) {
        const palavra = Math.min(x + largura - px, linha * (0.8 + r() * 3.2));
        barras.push(<rect key={`${c}-${n}-${k++}`} x={px} y={y} width={palavra} height={linha * 0.42} fill="#3a3a3a" opacity={0.5} />);
        px += palavra + linha * 0.35;
      }
      y += linha * (fimDeParagrafo ? 1.7 : 0.82);
      n++;
    }
  }
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0, filter: "blur(1.4px)", opacity: escuro ? 0.5 : 0.9 }}>
      {barras}
    </svg>
  );
};

const FolhaDeFundo: React.FC<{ f: Folha; W: number; H: number; cor: string; semente: number; papelUrl: string | null; jornal?: boolean; escuro: boolean }> = ({ f, W, H, cor, semente, papelUrl, jornal, escuro }) => {
  const w = f.w * W;
  const h = f.h * H;
  const clip = rasgoNatural(semente);
  return (
    <div style={{ position: "absolute", left: f.x * W, top: f.y * H, width: w, height: h, transform: `rotate(${f.giro}deg)`, filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.32)) drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }}>
      <div style={{ position: "absolute", inset: 0, background: cor, clipPath: clip, overflow: "hidden" }}>
        {jornal ? <Jornal w={w} h={h} semente={semente} escuro={escuro} /> : null}
        {papelUrl ? <Img src={papelUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.55 }} /> : null}
        {/* Luz desigual na folha: papel colado nunca é chapado. */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.18), rgba(0,0,0,0.08) 80%)" }} />
      </div>
    </div>
  );
};

/** Fita adesiva na cor da marca, translúcida, com pontas picotadas. */
const FitaDeFundo: React.FC<{ x: number; y: number; w: number; giro: number; cor: string; semente: number }> = ({ x, y, w, giro, cor, semente }) => {
  const r = aleatorio(semente);
  const pts = ["2% 0%", "98% 0%"];
  for (let i = 1; i < 6; i++) pts.push(`${(97 + r() * 3).toFixed(1)}% ${(i * 100) / 6}%`);
  pts.push("98% 100%", "2% 100%");
  for (let i = 5; i > 0; i--) pts.push(`${(r() * 3).toFixed(1)}% ${(i * 100) / 6}%`);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: w * 0.28,
        transform: `rotate(${giro}deg)`,
        background: `linear-gradient(180deg, ${rgba(cor, 0.8)} 0%, ${rgba(cor, 0.62)} 45%, ${rgba(cor, 0.8)} 100%)`,
        clipPath: `polygon(${pts.join(",")})`,
        mixBlendMode: "multiply",
      }}
    />
  );
};

export const Fundos: React.FC<PropsDosFundos> = ({ largura: W, altura: H, marca, papelUrl, semente = 7 }) => {
  carregarFontes();
  const quadro = useCurrentFrame();
  const tipo = TIPOS_DE_FUNDO[Math.min(TIPOS_DE_FUNDO.length - 1, quadro)];

  if (tipo === "folha") {
    return (
      <AbsoluteFill style={{ background: "#F1EDE4" }}>
        <Fibra id="fibra-folha" frequencia={0.85} opacidade={0.16} />
        {papelUrl ? <Img src={papelUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.85 }} /> : null}
      </AbsoluteFill>
    );
  }

  const escuro = tipo === "escuro";
  const deitado = W > H;
  const folhas = deitado ? FOLHAS_DEITADO : FOLHAS_EM_PE;
  // Kraft de caixa de papelão; no escuro, kraft queimado (nunca preto chapado).
  const kraft = escuro ? "#5B4632" : "#C4A57B";
  // No escuro as folhas são papel preto e cinza-grafite: contraste com o
  // kraft queimado sem virar o vazio preto de antes.
  const cremes = escuro ? ["#1f1d1b", "#34302b", "#262320"] : ["#F3EBDB", "#EFE6D2", "#F7F1E3"];
  // No papel-marca a maior folha é da cor da marca: a troca de fundo continua
  // lendo como "cor da marca", mas dentro da colagem.
  if (tipo === "papel-marca") cremes[0] = marca.acento;
  const jornal = escuro ? "#8d877c" : "#E6E0D2";
  const S = Math.min(W, H);

  return (
    <AbsoluteFill style={{ background: kraft, overflow: "hidden" }}>
      {/* Manchas largas e fibra fina do kraft. */}
      <Fibra id="manchas" frequencia={0.006} opacidade={escuro ? 0.35 : 0.28} />
      <Fibra id="fibra" frequencia={0.9} opacidade={escuro ? 0.3 : 0.22} />
      {papelUrl ? <Img src={papelUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply", opacity: 0.45 }} /> : null}

      {folhas.jornal.map((f, i) => (
        <FolhaDeFundo key={`j${i}`} f={f} W={W} H={H} cor={jornal} semente={semente * 31 + i * 7 + 101} papelUrl={papelUrl} jornal escuro={escuro} />
      ))}
      {folhas.creme.map((f, i) => (
        <FolhaDeFundo key={`c${i}`} f={f} W={W} H={H} cor={cremes[i % cremes.length]} semente={semente * 17 + i * 13 + 5} papelUrl={papelUrl} escuro={escuro} />
      ))}

      {/* Fitas nos cantos das folhas, na cor da marca. */}
      <FitaDeFundo x={folhas.creme[0].x * W + folhas.creme[0].w * W * 0.78} y={folhas.creme[0].y * H + folhas.creme[0].h * H * 0.86} w={S * 0.24} giro={-32} cor={marca.acento} semente={semente + 1} />
      <FitaDeFundo x={folhas.creme[1].x * W + folhas.creme[1].w * W * 0.72} y={folhas.creme[1].y * H - S * 0.02} w={S * 0.22} giro={24} cor={marca.acento} semente={semente + 2} />
      <FitaDeFundo x={folhas.creme[2].x * W - S * 0.05} y={folhas.creme[2].y * H + folhas.creme[2].h * H * 0.4} w={S * 0.2} giro={-70} cor={marca.acento} semente={semente + 3} />
      <FitaDeFundo x={folhas.jornal[0].x * W + S * 0.02} y={folhas.jornal[0].y * H + folhas.jornal[0].h * H * 0.9} w={S * 0.18} giro={12} cor={marca.acento} semente={semente + 4} />

      {/* Vinheta leve: puxa o olho para o meio, onde estão o narrador e a mídia. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${escuro ? 0.35 : 0.2}) 100%)` }} />
    </AbsoluteFill>
  );
};
