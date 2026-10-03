import React from "react";
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { ElementoResolvido, Fundo, MontagemResolvida } from "../tipos";
import { FONTES, SOMBRA_DURA, aleatorio, bordaRasgada, contraste, respiro, rgba } from "../util";

/**
 * Os elementos da colagem, TODOS em código: texto na tela nunca é imagem
 * gerada (letra falsa em português é o defeito mais visível da IA). Cada um
 * entra no quadro da sua palavra âncora e SAI no segundo `fim`, os dois já
 * calculados no plano (lib/media/plano-de-montagem.ts, `tempoDosElementos`).
 *
 * Reprovação de 29/09 ("nenhum efeito, legenda pobre, nada de elemento
 * gráfico"): tudo entrava junto e ficava parado até o corte seco. Agora cada
 * elemento entra na sua palavra, respira enquanto está na tela e sai
 * animado (recorte cai, texto encolhe, tarja desliza). Custo: só transform e
 * opacidade por quadro; sombra é dura (sem desfoque) sempre que o elemento se
 * move, porque desfoque grande em camada que mexe é o que pesa no Chrome.
 */

type P = {
  el: ElementoResolvido;
  montagem: MontagemResolvida;
  /** Layout da cena: no sóbrio o texto sobre vídeo é claro, sobre fundo claro é escuro. */
  layout?: string;
  /** Quadros desde a entrada do elemento. */
  q: number;
  fps: number;
  /** Segundo absoluto do vídeo, para sincronizar com as palavras faladas. */
  t: number;
  fundo: Fundo;
};

/** Quadros da animação de saída (o plano usa 0,27 s, DURACAO_DA_SAIDA). */
const QUADROS_DA_SAIDA = 8;

/** Tamanho de fonte que cabe `linhas` de até `letras` caracteres numa caixa. */
function caber(w: number, h: number, letras: number, linhas: number, largura = 0.56, altura = 1.15): number {
  return Math.max(18, Math.min(h / (linhas * altura), w / (Math.max(1, letras) * largura)));
}

/** Entre 1 e `max` linhas, a quebra que deixa a letra maior. */
function melhorQuebra(texto: string, w: number, h: number, largura: number, max = 2): { linhas: string[]; tamanho: number } {
  let melhor = { linhas: [texto], tamanho: 0 };
  for (let n = 1; n <= max; n++) {
    const linhas = quebrar(texto, n);
    const tamanho = caber(w, h, Math.max(...linhas.map((l) => l.length)), linhas.length, largura);
    if (tamanho > melhor.tamanho) melhor = { linhas, tamanho };
  }
  return melhor;
}

/** Quebra em até `max` linhas equilibradas. */
function quebrar(texto: string, max: number): string[] {
  const ps = texto.split(/\s+/).filter(Boolean);
  if (ps.length <= 1 || max <= 1) return [ps.join(" ")];
  const total = texto.length;
  const linhas: string[] = [];
  let atual = "";
  for (const p of ps) {
    const nova = atual ? `${atual} ${p}` : p;
    if (atual && nova.length > total / max + 2 && linhas.length < max - 1) {
      linhas.push(atual);
      atual = p;
    } else atual = nova;
  }
  linhas.push(atual);
  return linhas;
}

/**
 * Papel rasgado COM sombra dura. clip-path corta a box-shadow do próprio
 * elemento (a sombra dos papéis rasgados não aparecia até 29/09), então a
 * sombra é uma cópia do mesmo recorte, escura e deslocada, por trás.
 */
const PapelRasgado: React.FC<{ semente: number; cor?: string; dentes?: number; fundo?: number; sombra?: [number, number]; style?: React.CSSProperties; children?: React.ReactNode }> = ({
  semente,
  cor = "#FBFAF5",
  dentes = 22,
  fundo = 1.2,
  sombra = [5, 9],
  style,
  children,
}) => {
  const clip = bordaRasgada(semente, dentes, fundo);
  return (
    <div style={{ position: "relative", ...style }}>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${sombra[0]}px, ${sombra[1]}px)`, background: "rgba(0,0,0,0.3)", clipPath: clip }} />
      <div style={{ position: "relative", background: cor, clipPath: clip }}>{children}</div>
    </div>
  );
};

/** As pontas curtas da fita, picotadas (o comprimento fica reto). */
function pontasPicotadas(semente: number): string {
  const r = aleatorio(semente);
  const pts: string[] = ["2% 0%", "98% 0%"];
  for (let i = 1; i < 6; i++) pts.push(`${(97 + r() * 3).toFixed(1)}% ${(i * 100) / 6}%`);
  pts.push("98% 100%", "2% 100%");
  for (let i = 5; i > 0; i--) pts.push(`${(r() * 3).toFixed(1)}% ${(i * 100) / 6}%`);
  return `polygon(${pts.join(",")})`;
}

/**
 * Fita adesiva translúcida na cor da marca (a da referência é terracota a
 * 80%), com uma faixa mais clara no meio e as pontas picotadas. Entra
 * esticando (scaleX) quando `q` é dado: primeiro o papel pousa, depois a fita.
 */
export const Fita: React.FC<{ x: number; y: number; giro: number; largura: number; cor: string; semente: number; q?: number; fps?: number }> = ({ x, y, giro, largura, cor, semente, q, fps = 30 }) => {
  const s = q === undefined ? 1 : spring({ frame: q, fps, config: { damping: 20, stiffness: 300 }, durationInFrames: 6 });
  if (s <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: largura,
        height: largura * 0.3,
        background: `linear-gradient(180deg, ${rgba(cor, 0.78)} 0%, ${rgba(cor, 0.62)} 45%, ${rgba(cor, 0.78)} 100%)`,
        transform: `rotate(${giro}deg) scaleX(${s})`,
        transformOrigin: giro < 0 ? "left center" : "right center",
        clipPath: pontasPicotadas(semente),
      }}
    />
  );
};

// ─────────────────────────────── recorte ───────────────────────────────

const Recorte: React.FC<P> = ({ el, montagem, q, fps }) => {
  const r = aleatorio(el.semente);
  // O "pop" (ícones de marca) fica quase reto; os objetos de papel giram.
  const giroFinal = el.entrada === "pop" ? el.rotacao + (r() - 0.5) * 0 : el.rotacao * 2 + (r() - 0.5) * 10;
  const lado = r() < 0.5 ? -1 : 1;
  let dx = 0;
  let dy = 0;
  let escala = 1;
  let sx = 1;
  let sy = 1;
  let giro = giroFinal;
  const QUEDA = 9;
  if (el.entrada === "deslizar") {
    const s = spring({ frame: q, fps, config: { damping: 13, stiffness: 150 } });
    dx = interpolate(s, [0, 1], [(el.caixa.x + el.caixa.w / 2 < montagem.largura / 2 ? -1 : 1) * montagem.largura * 0.7, 0]);
    giro = giroFinal + (1 - s) * 18 * lado;
  } else if (el.entrada === "pop") {
    // Estoura: passa de 1,15 e volta (mola com pouco amortecimento).
    escala = spring({ frame: q, fps, config: { damping: 10, stiffness: 380 } });
  } else {
    // CAI COM PESO (29/09): queda de gravidade (acelera, não flutua) até
    // pousar em 9 quadros, depois um quique curto com achatamento. A mola
    // única de antes afundava mole e sem pouso.
    if (q < QUEDA) {
      const u = q / QUEDA;
      dy = -(el.caixa.y + el.caixa.h + 60) * (1 - u * u);
      giro = giroFinal + 40 * lado * (1 - u);
    } else {
      const k = q - QUEDA;
      dy = -el.caixa.h * 0.1 * Math.exp(-k / 4) * Math.abs(Math.sin((k * Math.PI) / 6));
      const amasso = 0.14 * Math.exp(-k / 2.2) * Math.cos(k * 0.9);
      sy = 1 - amasso;
      sx = 1 + amasso * 0.5;
    }
  }
  // Depois de pousar, respira de leve: colagem parada de todo parece print.
  const resp = respiro(q, fps, el.semente, 1.1);
  return (
    <div
      style={{
        position: "absolute",
        left: el.caixa.x + dx,
        top: el.caixa.y + dy + resp.dy,
        width: el.caixa.w,
        height: el.caixa.h,
        transform: `rotate(${giro + resp.giro}deg) scale(${escala}) scale(${sx}, ${sy})`,
        transformOrigin: "50% 100%",
      }}
    >
      <Img
        src={el.url!}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          // Sombra dura e FIXA de adesivo colado (colagem); fora dela, a
          // sombra macia de objeto sobre a imagem. Nenhuma muda por quadro.
          filter: montagem.familia === "colagem" ? "drop-shadow(7px 11px 0 rgba(0,0,0,0.3))" : "drop-shadow(0 14px 18px rgba(0,0,0,0.45))",
        }}
      />
    </div>
  );
};

// ─────────────────────────────── marca-texto ───────────────────────────────

const MarcaTexto: React.FC<P> = ({ el, montagem, q, fps, t }) => {
  // De uma a três linhas: fica a que der a letra MAIOR (numa faixa larga e
  // baixa, uma linha de 34 letras saía com 30 px na prova de 30/09).
  const { linhas, tamanho } = melhorQuebra(el.texto ?? "", el.caixa.w * 0.84, el.caixa.h * 0.7, 0.64, 3);
  const s = spring({ frame: q, fps, config: { damping: 14, stiffness: 200 } });
  const acento = montagem.marca.acento;
  const corNoGrifo = contraste(acento);
  // Cada palavra da tela com o tempo dela na fala (quando o plano trouxe).
  const tempos = el.palavras ?? [];
  let k = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: el.caixa.x,
        top: el.caixa.y,
        width: el.caixa.w,
        height: el.caixa.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `rotate(${el.rotacao * 0.6 + (1 - s) * -5}deg) translateY(${(1 - s) * 60}px)`,
        opacity: Math.min(1, s * 2),
      }}
    >
      <PapelRasgado semente={el.semente} style={{ padding: `${tamanho * 0.26}px ${tamanho * 0.42}px` }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: tamanho * 0.26, fontFamily: FONTES.pesada, fontSize: tamanho, lineHeight: 1.18, color: "#16171a", whiteSpace: "nowrap" }}>
            {l.split(" ").map((palavra, j, todas) => {
              const w = tempos[k++];
              // Sem tempo por palavra (plano antigo): a linha passa inteira,
              // linha a linha, como antes.
              const p = w
                ? interpolate(t, [w.inicio, w.inicio + Math.max(0.1, Math.min(0.22, w.fim - w.inicio))], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) })
                : interpolate(q, [4 + i * 10, 16 + i * 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const falando = w ? t >= w.inicio && t < w.fim + 0.05 : false;
              return (
                <span key={j} style={{ position: "relative", display: "inline-block", transform: `scale(${falando ? 1.07 : 1})` }}>
                  <span
                    style={{
                      position: "absolute",
                      left: -tamanho * 0.1,
                      top: "12%",
                      height: "80%",
                      // O grifo cobre também o espaço até a próxima palavra
                      // da linha: a frase grifada fica contínua, como caneta.
                      width: `calc((100% + ${tamanho * (j < todas.length - 1 ? 0.46 : 0.2)}px) * ${p})`,
                      background: acento,
                      transform: "skewX(-8deg)",
                    }}
                  />
                  <span style={{ position: "relative", color: p > 0.5 ? corNoGrifo : "#16171a" }}>{palavra}</span>
                </span>
              );
            })}
          </div>
        ))}
      </PapelRasgado>
    </div>
  );
};

// ─────────────────────────────── letras de revista ───────────────────────────────

/** As linhas das letras de revista: por palavra, ou a palavra longa partida em duas ou três. */
function linhasDaRevista(texto: string, w: number, h: number): { linhas: string[]; tamanho: number } {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const junto = palavras.join(" ");
  const candidatas: string[][] = [palavras];
  // Várias palavras: agrupadas em duas linhas equilibradas, sem partir
  // palavra (29/09: "CONTEXTO É REI" virou "CONTEX / TOÉREI").
  if (palavras.length > 1) {
    if (palavras.length > 2) candidatas.push(quebrar(junto, 2));
    return melhorDasLinhas(candidatas, w, h, palavras);
  }
  // Uma palavra de 13 letras numa linha só sai com letra de 80 px; partida
  // em duas vira o maior elemento do quadro, como na referência.
  for (const n of [2, 3]) {
    const semEspaco = junto.replace(/\s+/g, "");
    if (semEspaco.length < n * 3) continue;
    const passo = Math.ceil(semEspaco.length / n);
    const partes: string[] = [];
    for (let i = 0; i < semEspaco.length; i += passo) partes.push(semEspaco.slice(i, i + passo));
    candidatas.push(partes);
  }
  return melhorDasLinhas(candidatas, w, h, palavras);
}

function melhorDasLinhas(candidatas: string[][], w: number, h: number, palavras: string[]): { linhas: string[]; tamanho: number } {
  let melhor = { linhas: palavras, tamanho: 0 };
  for (const linhas of candidatas) {
    const maior = Math.max(...linhas.map((l) => l.length));
    // Cada letra ocupa perto de 1 em de largura (papel, folga e vão).
    const tamanho = Math.min((h * 0.9) / (linhas.length * 1.18), w / (maior * 1.0));
    // A palavra inteira numa linha ganha no empate técnico (lê melhor).
    if (tamanho > melhor.tamanho * (linhas === palavras ? 0.9 : 1.08)) melhor = { linhas, tamanho };
  }
  return melhor;
}

const LetrasDeRevista: React.FC<P> = ({ el, montagem, q, fps }) => {
  const r = aleatorio(el.semente);
  const { linhas, tamanho } = linhasDaRevista((el.texto ?? "").toUpperCase(), el.caixa.w, el.caixa.h);
  // Papéis e tipos de revistas diferentes (4.png): branco, preto, azul-papel,
  // creme e a cor da marca; serifa de revista, condensada, máquina de
  // escrever, Anton e grotesca pesada. Nada de fonte de quadrinho.
  const fundos = ["#FBFAF5", "#111111", "#6D8FC3", "#F3EBDB", montagem.marca.acento, "#FBFAF5", "#111111"];
  const familias: [string, number][] = [
    [FONTES.revista, 900],
    [FONTES.condensada, 700],
    [FONTES.maquina, 400],
    [FONTES.titulo, 400],
    [FONTES.pesada, 400],
    [FONTES.serifa, 700],
    [FONTES.revista, 700],
  ];
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tamanho * 0.1 }}>
      {linhas.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: tamanho * 0.05, marginLeft: (r() - 0.5) * tamanho * 0.3 }}>
          {p.split("").map((letra, j) => {
            // O espaço entre palavras é vão, não papel.
            if (letra === " ") return <span key={j} style={{ display: "inline-block", width: tamanho * 0.3 }} />;
            const indice = k++;
            const fundo = fundos[Math.floor(r() * fundos.length)];
            const [familia, peso] = familias[Math.floor(r() * familias.length)];
            const giro = (r() - 0.5) * 14;
            const sobe = (r() - 0.5) * tamanho * 0.14;
            // Duas minúsculas a cada seis letras: bilhete de resgate de verdade.
            const minuscula = r() < 0.33 && /[A-ZÀ-Ý]/.test(letra);
            const escala = 0.86 + r() * 0.16;
            const lado = r() < 0.5 ? -1 : 1;
            // Cada letra CAI de cima girando, uma a cada 2 quadros, e depois
            // respira com fase própria.
            const s = spring({ frame: q - Math.round(indice * 1.5), fps, config: { damping: 12, stiffness: 230, mass: 0.7 } });
            const resp = respiro(q, fps, el.semente + indice * 131, 0.8);
            return (
              <span
                key={j}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: tamanho * 0.74,
                  height: tamanho * 1.08,
                  padding: `0 ${tamanho * 0.08}px`,
                  background: fundo,
                  color: contraste(fundo),
                  // A letra que ainda não caiu ocupa o lugar dela, invisível:
                  // a palavra não muda de largura enquanto é montada.
                  opacity: s <= 0.001 ? 0 : 1,
                  fontFamily: familia,
                  fontWeight: peso,
                  fontSize: tamanho * escala,
                  lineHeight: 1,
                  transform: `translateY(${sobe + resp.dy + (1 - s) * -tamanho * 2.4}px) rotate(${giro + resp.giro + (1 - s) * 35 * lado}deg)`,
                  boxShadow: SOMBRA_DURA,
                }}
              >
                {minuscula ? letra.toLowerCase() : letra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────── título ───────────────────────────────

/** O título de capítulo em serifa grande, sem caixa, direto no papel ("Remotion" em 4.png). */
const Titulo: React.FC<P> = ({ el, montagem, q, fps, fundo }) => {
  const texto = el.texto ?? "";
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.94, el.caixa.h * 0.9, 0.5, 2);
  const s = interpolate(q, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const traco = interpolate(q, [8, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const cor = fundo === "escuro" ? "#F3EBDB" : "#16171a";
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", justifyContent: "center", opacity: s, transform: `translateY(${(1 - s) * 24}px)` }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ fontFamily: FONTES.revista, fontWeight: 600, fontSize: tamanho, lineHeight: 1.05, color: cor, whiteSpace: "nowrap" }}>
          {l}
        </div>
      ))}
      <div style={{ marginTop: tamanho * 0.08, height: Math.max(6, tamanho * 0.07), width: `${traco * 46}%`, background: montagem.marca.acento, transform: "skewX(-12deg)" }} />
    </div>
  );
};

// ─────────────────────────────── carimbo ───────────────────────────────

/** A máscara de tinta falhada do carimbo: ruído fixo, desenhado uma vez. */
const TINTA_FALHADA =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='r'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.4'/></filter><rect width='260' height='260' filter='url(%23r)'/></svg>\")";

const Carimbo: React.FC<P> = ({ el, montagem, q, fundo }) => {
  const texto = (el.texto ?? "").toUpperCase();
  const tamanho = caber(el.caixa.w * 0.9, el.caixa.h * 0.66, texto.length, 1, 0.47);
  // Tinta direto no papel, sem etiqueta por baixo (a etiqueta branca lia
  // como adesivo de software, 29/09). No papel na cor da marca a tinta é
  // escura, senão sumiria.
  const cor = fundo === "papel-marca" ? "#1d1b19" : montagem.marca.acento;
  // Bate de cima: grande e transparente, trava em 6 quadros, um tremor e
  // assenta de 0,97 a 1 sem oscilar.
  const p = interpolate(q, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const assenta = interpolate(q, [6, 20], [0.97, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const escala = q < 6 ? interpolate(p, [0, 1], [2.3, 0.97]) : assenta;
  const tremor = q > 6 && q < 12 ? Math.sin(q * 3) * 3 : 0;
  const giro = -6 - (el.semente % 7);
  const borda = Math.max(4, tamanho * 0.075);
  return (
    <div
      style={{
        position: "absolute",
        left: el.caixa.x,
        top: el.caixa.y,
        width: el.caixa.w,
        height: el.caixa.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `rotate(${giro}deg) scale(${escala}) translateX(${tremor}px)`,
        opacity: interpolate(p, [0, 1], [0, 0.92]),
      }}
    >
      <div
        style={{
          // Borda dupla de carimbo de borracha: a borda e o contorno por fora.
          border: `${borda}px solid ${cor}`,
          outline: `${borda * 0.5}px solid ${cor}`,
          outlineOffset: borda * 0.7,
          borderRadius: 14,
          padding: `${tamanho * 0.04}px ${tamanho * 0.3}px`,
          color: cor,
          fontFamily: FONTES.condensada,
          fontWeight: 700,
          fontSize: tamanho,
          letterSpacing: "0.08em",
          lineHeight: 1.12,
          WebkitMaskImage: TINTA_FALHADA,
          WebkitMaskSize: "260px 260px",
        }}
      >
        {texto}
      </div>
    </div>
  );
};

// ─────────────────────────────── tarja ───────────────────────────────

/** Quantas letras de `> texto` já foram digitadas no segundo `t`, palavra a palavra com a voz. */
function letrasDigitadas(texto: string, palavras: { inicio: number; fim: number }[] | undefined, t: number, q: number): number {
  if (!palavras?.length) return Math.max(0, Math.floor(q * 1.6));
  const partes = texto.split(/\s+/).filter(Boolean);
  let n = 2;
  for (let i = 0; i < partes.length; i++) {
    const w = palavras[i];
    if (!w || t < w.inicio) break;
    const f = Math.min(1, (t - w.inicio) / Math.max(0.08, w.fim - w.inicio));
    n += Math.round(partes[i].length * f);
    if (f < 1) break;
    n += 1;
  }
  return n;
}

const Tarja: React.FC<P> = ({ el, montagem, q, fps, t }) => {
  const texto = el.texto ?? "";
  const { linhas, tamanho: cabe } = melhorQuebra(`> ${texto}`, el.caixa.w * 0.84, el.caixa.h * 0.6, 0.6);
  const tamanho = Math.min(cabe, el.caixa.h * 0.24);
  // Onde cada linha começa no texto, para a digitação atravessar as linhas.
  const inicios = linhas.map((_, i) => linhas.slice(0, i).reduce((s, l) => s + l.length + 1, 0));
  // A digitação acompanha a VOZ: as letras da palavra k aparecem enquanto ela
  // é dita (antes eram 1,6 letras por quadro fixas, descoladas da fala).
  const letras = letrasDigitadas(texto, el.palavras, t, q);
  const cursor = Math.floor(q / (fps / 3)) % 2 === 0;
  const s = spring({ frame: q, fps, config: { damping: 18, stiffness: 200 } });
  const r = aleatorio(el.semente);
  return (
    <div
      style={{
        position: "absolute",
        left: el.caixa.x,
        top: el.caixa.y + el.caixa.h / 2 - tamanho * (0.6 + linhas.length * 0.7),
        width: el.caixa.w,
        transform: `rotate(-1.5deg) scaleY(${s})`,
        transformOrigin: "top",
      }}
    >
      {/* Tira preta reta de papel colado, sem barra de janela (29/09: a barra com bolinhas lia como captura de software). */}
      <div
        style={{
          background: "#141414",
          boxShadow: "6px 10px 0 rgba(0,0,0,0.25)",
          padding: `${tamanho * 0.5}px ${tamanho * 0.8}px`,
          fontFamily: FONTES.maquina,
          fontSize: tamanho,
          lineHeight: 1.3,
          color: "#EDE9E1",
          whiteSpace: "pre",
        }}
      >
        {linhas.map((l, i) => {
          const visivel = l.slice(0, Math.max(0, letras - inicios[i]));
          const ultima = letras >= inicios[i] && (i === linhas.length - 1 || letras < inicios[i + 1]);
          return (
            <div key={i}>
              {i === 0 ? <span style={{ color: montagem.marca.acento }}>{visivel.slice(0, 2)}</span> : null}
              {i === 0 ? visivel.slice(2) : visivel}
              {ultima ? <span style={{ opacity: cursor ? 1 : 0, color: montagem.marca.acento }}>▌</span> : null}
            </div>
          );
        })}
      </div>
      <Fita x={-tamanho * 0.9} y={-tamanho * 0.45} giro={-28 + r() * 8} largura={tamanho * 3.4} cor={montagem.marca.acento} semente={el.semente} q={q - 4} fps={fps} />
    </div>
  );
};

// ─────────────────────────────── número e barras ───────────────────────────────

const Numero: React.FC<P> = ({ el, montagem, q, fps }) => {
  const valor = el.valor ?? 0;
  const p = interpolate(q, [0, Math.round(fps * 0.8)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const atual = Number.isInteger(valor) ? Math.round(valor * p) : (valor * p).toFixed(1);
  const mostrado = `${el.prefixo ?? ""}${atual}${el.sufixo ? ` ${el.sufixo}` : ""}`;
  const tamanho = caber(el.caixa.w * 0.9, el.caixa.h * 0.62, mostrado.length, 1, 0.5);
  const s = spring({ frame: q, fps, config: { damping: 11, stiffness: 260 } });
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${s}) rotate(${el.rotacao * 0.5}deg)` }}>
      <PapelRasgado semente={el.semente} style={{ padding: `${tamanho * 0.1}px ${tamanho * 0.35}px`, textAlign: "center" }}>
        <div style={{ fontFamily: FONTES.titulo, fontSize: tamanho, lineHeight: 1.05, color: montagem.marca.acento }}>{mostrado}</div>
        <div style={{ fontFamily: FONTES.condensada, fontWeight: 700, fontSize: tamanho * 0.26, letterSpacing: "0.06em", textTransform: "uppercase", color: "#16171a", paddingBottom: tamanho * 0.1 }}>{el.rotulo}</div>
      </PapelRasgado>
    </div>
  );
};

const Barras: React.FC<P> = ({ el, montagem, q, fps }) => {
  const itens = el.itens ?? [];
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const titulo = el.titulo ? Math.min(el.caixa.w / 11, el.caixa.h * 0.12) : 0;
  const linha = (el.caixa.h * 0.86 - titulo * 1.4) / Math.max(1, itens.length);
  const tamanho = Math.min(linha * 0.26, el.caixa.w / 18);
  const s = spring({ frame: q, fps, config: { damping: 14, stiffness: 170 } });
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, transform: `translateY(${(1 - s) * -el.caixa.h * 0.4}px) rotate(${-1.5 + (1 - s) * -6}deg)`, opacity: Math.min(1, s * 2) }}>
      <PapelRasgado semente={el.semente} dentes={30} fundo={1} sombra={[6, 10]} style={{ width: "100%", height: "100%" }}>
        <div style={{ width: el.caixa.w, height: el.caixa.h, padding: `${tamanho * 1.1}px ${tamanho * 0.9}px`, boxSizing: "border-box" }}>
          {el.titulo ? <div style={{ fontFamily: FONTES.titulo, fontSize: titulo, lineHeight: 1.05, color: "#16171a", textTransform: "uppercase", marginBottom: titulo * 0.4 }}>{el.titulo}</div> : null}
          {itens.map((it, i) => {
            // Cada barra cresce em sequência, do zero ao valor, em 0,6 s.
            const p = interpolate(q, [8 + i * 10, 8 + i * 10 + fps * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
            const cor = i === itens.length - 1 ? montagem.marca.acento : montagem.marca.escuro;
            return (
              <div key={i} style={{ height: linha, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: FONTES.condensada, fontWeight: 700, fontSize: tamanho * 0.95, letterSpacing: "0.04em", color: "#16171a", textTransform: "uppercase" }}>{it.rotulo}</div>
                <div style={{ display: "flex", alignItems: "center", gap: tamanho * 0.4 }}>
                  <div style={{ height: linha * 0.42, width: `${Math.max(2, (it.valor / max) * 62 * p)}%`, background: `linear-gradient(180deg, ${cor} 0%, ${cor} 70%, ${rgba("#000000", 0.25)} 100%), ${cor}`, boxShadow: "3px 5px 0 rgba(0,0,0,0.25)" }} />
                  <div style={{ fontFamily: FONTES.titulo, fontSize: tamanho * 1.8, lineHeight: 1, color: cor, opacity: p, whiteSpace: "nowrap", transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: "left center" }}>{it.texto}</div>
                </div>
              </div>
            );
          })}
        </div>
      </PapelRasgado>
      <Fita x={el.caixa.w * 0.06} y={-el.caixa.w * 0.035} giro={-8} largura={el.caixa.w * 0.24} cor={montagem.marca.acento} semente={el.semente + 1} q={q - 8} fps={fps} />
      <Fita x={el.caixa.w * 0.7} y={-el.caixa.w * 0.035} giro={7} largura={el.caixa.w * 0.24} cor={montagem.marca.acento} semente={el.semente + 2} q={q - 11} fps={fps} />
    </div>
  );
};

const Traco: React.FC<P> = ({ el, montagem, q, fps }) => {
  const p = interpolate(q, [0, fps * 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const circulo = el.tipo === "circulo";
  // Traço "à mão": elipse que não fecha certinho, ou seta com cabeça torta.
  const d = circulo
    ? "M 20 55 C 18 20, 80 8, 92 42 C 100 72, 60 96, 30 86 C 12 80, 8 58, 26 40"
    : "M 10 85 C 30 70, 55 55, 86 22 M 86 22 L 62 26 M 86 22 L 80 46";
  return (
    <svg viewBox="0 0 100 100" style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, overflow: "visible", transform: `rotate(${el.rotacao * 3}deg)` }}>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} transform="translate(1.2 1.8)" />
      <path d={d} fill="none" stroke={montagem.marca.acento} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
    </svg>
  );
};


// ═══════════════════════════ IMPACTO (Hormozi, MrBeast) ═══════════════════════════
//
// 30/09: até aqui toda família era desenhada como colagem (papel rasgado,
// fita, letras de revista). O impacto é tipografia pesada em caixa alta,
// contorno preto, a cor da marca, estouro de escala e nada de papel.

/** Contorno preto grosso de legenda de retenção (texto sobre qualquer imagem). */
const contorno = (tamanho: number) => ({ WebkitTextStroke: `${Math.max(3, tamanho * 0.09)}px #000`, paintOrder: "stroke fill" as const, textShadow: `0 ${tamanho * 0.06}px 0 rgba(0,0,0,0.9), 0 ${tamanho * 0.1}px ${tamanho * 0.25}px rgba(0,0,0,0.5)` });

/** A PALAVRA GIGANTE: 1 a 3 palavras ditas, estourando uma a uma no centro. */
const PalavraGigante: React.FC<P> = ({ el, montagem, q, fps, fundo, layout }) => {
  const texto = (el.texto ?? "").toUpperCase();
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.96, el.caixa.h * 0.92, 0.5, 3);
  // Sobre o fundo na cor da marca a palavra-chave não pode ser da mesma cor.
  const acento = fundo === "papel-marca" && layout !== "narrador-cheio" && layout !== "broll-cheio" ? "#ffffff" : montagem.marca.acento;
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: tamanho * 0.22, whiteSpace: "nowrap" }}>
          {l.split(" ").map((palavra, j) => {
            const indice = k++;
            // Cada palavra estoura 3 quadros depois da anterior: passa de 1,35 e assenta.
            const s = spring({ frame: q - indice * 3, fps, config: { damping: 9, stiffness: 420, mass: 0.6 } });
            const ultima = indice === texto.split(/\s+/).length - 1;
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  fontFamily: FONTES.titulo,
                  fontSize: tamanho,
                  lineHeight: 1.02,
                  // A palavra-chave (a última) na cor da marca; as outras brancas.
                  color: ultima ? acento : "#ffffff",
                  opacity: s <= 0.01 ? 0 : 1,
                  transform: `scale(${interpolate(s, [0, 1], [1.6, 1])}) rotate(${(1 - s) * (indice % 2 ? 6 : -6)}deg)`,
                  ...contorno(tamanho),
                }}
              >
                {palavra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * A PALAVRA LIMPA (02/10, reprovação do Bruno no completo MrBeast: as letras
 * gigantes em Anton estourando torto, uma a cada frase, "feio e amador").
 * Tipografia limpa e pesada, a mesma família do destaque que ficou bom (Archivo
 * Black em caixa alta): branca com contorno preto fino e sombra macia, a
 * palavra-chave na cor da marca, entrando inteira com um assentar curto. Sem
 * giro, sem estouro palavra a palavra, e num tamanho que lê sem gritar.
 */
const PalavraLimpa: React.FC<P> = ({ el, montagem, q, fps, fundo, layout }) => {
  const texto = (el.texto ?? "").toUpperCase();
  const { linhas, tamanho: cabe } = melhorQuebra(texto, el.caixa.w * 0.92, el.caixa.h * 0.8, 0.8, 2);
  const tamanho = Math.min(cabe, montagem.largura * 0.12);
  const acento = fundo === "papel-marca" && layout !== "narrador-cheio" && layout !== "broll-cheio" ? "#ffffff" : montagem.marca.acento;
  const s = spring({ frame: q, fps, config: { damping: 18, stiffness: 220 }, durationInFrames: 10 });
  const palavras = texto.split(/\s+/).filter(Boolean);
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${0.92 + 0.08 * s})`, opacity: Math.min(1, s * 1.6) }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: tamanho * 0.24, whiteSpace: "nowrap" }}>
          {l.split(" ").map((palavra, j) => {
            const ultima = k++ === palavras.length - 1;
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  fontFamily: FONTES.pesada,
                  fontSize: tamanho,
                  lineHeight: 1.08,
                  color: ultima && palavras.length > 1 ? acento : "#ffffff",
                  WebkitTextStroke: `${Math.max(3, tamanho * 0.06)}px #0b0b0d`,
                  paintOrder: "stroke fill",
                  textShadow: `0 ${tamanho * 0.05}px ${tamanho * 0.14}px rgba(0,0,0,0.55)`,
                }}
              >
                {palavra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** O DESTAQUE: a frase dita em caixa alta; a palavra da vez ganha a caixa na cor da marca. */
const DestaqueImpacto: React.FC<P> = ({ el, montagem, q, fps, t, fundo, layout }) => {
  const texto = (el.texto ?? "").toUpperCase();
  // Archivo Black em caixa alta ocupa perto de 0,8 em por letra, mais o
  // respiro da caixa de cada palavra (com 0,52 a frase vazava da tela, 30/09).
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.9, el.caixa.h * 0.8, 0.82, 3);
  // A caixa da palavra da vez na cor da marca; sobre fundo da própria cor, escura.
  const acento = fundo === "papel-marca" && layout !== "narrador-cheio" && layout !== "broll-cheio" ? montagem.marca.escuro : montagem.marca.acento;
  const naCaixa = contraste(acento);
  const tempos = el.palavras ?? [];
  const s = spring({ frame: q, fps, config: { damping: 12, stiffness: 300 } });
  let k = 0;
  return (
    // Na cartela a frase já está inteira no PRIMEIRO quadro (02/10): o
    // estouro de entrada começava invisível, e o primeiro quadro da cartela
    // era a tela de uma cor só.
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${layout === "cartela" ? 1 : 0.7 + 0.3 * s})`, opacity: layout === "cartela" ? 1 : Math.min(1, s * 2) }}>
      {linhas.map((l, i) => (
        // O ESPAÇO É FIXO (02/10, "DEPREGAÇÃO"): a caixa da palavra da vez
        // crescia 12% por cima do vão de 0,2 em e colava na vizinha. Vão de
        // 0,32 em e a palavra da vez cresce só 4%, sem girar.
        <div key={i} style={{ display: "flex", gap: tamanho * 0.32, whiteSpace: "nowrap", marginBottom: tamanho * 0.08 }}>
          {l.split(" ").map((palavra, j) => {
            const w = tempos[k++];
            // A frase aparece INTEIRA desde o primeiro quadro (02/10) e só a
            // caixa da palavra anda com a voz: palavra a palavra, o começo do
            // destaque era a faixa ou a cartela vazia de uma cor só.
            const dita = true;
            const falando = w ? t >= w.inicio && t < w.fim + 0.08 : false;
            const pop = w ? spring({ frame: Math.round((t - w.inicio) * fps), fps, config: { damping: 10, stiffness: 380 }, durationInFrames: 6 }) : 1;
            return (
              <span
                key={j}
                style={{
                  position: "relative",
                  display: "inline-block",
                  padding: `0 ${tamanho * 0.12}px`,
                  fontFamily: FONTES.pesada,
                  fontSize: tamanho,
                  lineHeight: 1.12,
                  // A palavra ainda não dita ocupa o lugar dela invisível (a
                  // frase não pula enquanto é montada), como a legenda.
                  color: falando ? naCaixa : "#ffffff",
                  opacity: dita ? 1 : 0,
                  background: falando ? acento : "transparent",
                  borderRadius: tamanho * 0.12,
                  transform: `scale(${falando ? 1 + 0.04 * pop : 1})`,
                  ...(falando ? { textShadow: "none" } : contorno(tamanho)),
                }}
              >
                {palavra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * A FAIXA SOBRE A GRAVAÇÃO (03/10, régua do vídeo de pitch da landing): a
 * frase-chave dita entra numa faixa escura semitransparente de cantos
 * arredondados no terço de baixo, por cima da gravação, e a pessoa continua
 * falando por trás. Letra limpa em caixa normal (não grita), as duas últimas
 * palavras na cor da marca, um filete da marca à esquerda; entra subindo em
 * 8 quadros. Igual em toda família: é o texto do corte limpo.
 */
const FaixaSobreVideo: React.FC<P> = ({ el, montagem, q, fps }) => {
  const bruto = (el.texto ?? "").trim();
  const texto = bruto ? bruto[0].toUpperCase() + bruto.slice(1) : "";
  const palavras = texto.split(/\s+/).filter(Boolean);
  const { linhas, tamanho: cabe } = melhorQuebra(texto, el.caixa.w * 0.86, el.caixa.h * 0.78, 0.5, 2);
  const tamanho = Math.min(cabe, montagem.largura * (montagem.altura > montagem.largura ? 0.088 : 0.042));
  const s = spring({ frame: q, fps, config: { damping: 20, stiffness: 240 }, durationInFrames: 8 });
  const destaque = Math.min(2, Math.max(1, palavras.length - 2));
  const escuro = montagem.marca.escuro || "#111111";
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", alignItems: "center", justifyContent: "center", transform: `translateY(${(1 - s) * 28}px)`, opacity: Math.min(1, s * 1.5) }}>
      <div
        style={{
          position: "relative",
          padding: `${tamanho * 0.42}px ${tamanho * 0.7}px ${tamanho * 0.42}px ${tamanho * 0.85}px`,
          borderRadius: tamanho * 0.42,
          background: rgba(escuro, 0.82),
          boxShadow: `0 ${tamanho * 0.18}px ${tamanho * 0.6}px rgba(0,0,0,0.35)`,
          maxWidth: el.caixa.w,
        }}
      >
        <div style={{ position: "absolute", left: tamanho * 0.32, top: tamanho * 0.42, bottom: tamanho * 0.42, width: Math.max(4, tamanho * 0.1), borderRadius: tamanho, background: montagem.marca.acento }} />
        {linhas.map((l, i) => (
          <div key={i} style={{ whiteSpace: "nowrap", lineHeight: 1.18 }}>
            {l.split(" ").map((palavra, j) => {
              const indice = k++;
              const realce = indice >= palavras.length - destaque;
              return (
                <span key={j} style={{ fontFamily: FONTES.texto, fontWeight: 700, fontSize: tamanho, color: realce ? montagem.marca.acento : "#ffffff", marginRight: tamanho * 0.26 }}>
                  {palavra}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Número enorme que sobe até o valor, na cor da marca, com rótulo branco contornado. */
const NumeroImpacto: React.FC<P> = ({ el, montagem, q, fps, fundo, layout }) => {
  const cor = fundo === "papel-marca" && layout !== "narrador-cheio" && layout !== "broll-cheio" ? "#ffffff" : montagem.marca.acento;
  const valor = el.valor ?? 0;
  const p = interpolate(q, [0, Math.round(fps * 0.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const atual = Number.isInteger(valor) ? Math.round(valor * p) : (valor * p).toFixed(1);
  const mostrado = `${el.prefixo ?? ""}${atual}${el.sufixo ? ` ${el.sufixo}` : ""}`;
  const tamanho = caber(el.caixa.w * 0.95, el.caixa.h * 0.7, mostrado.length, 1, 0.46);
  const s = spring({ frame: q, fps, config: { damping: 9, stiffness: 380, mass: 0.7 } });
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, opacity: Math.min(1, s * 3) }}>
      <div style={{ fontFamily: FONTES.titulo, fontSize: tamanho, lineHeight: 1, color: cor, ...contorno(tamanho) }}>{mostrado}</div>
      {el.rotulo ? <div style={{ fontFamily: FONTES.pesada, fontSize: tamanho * 0.22, color: "#fff", textTransform: "uppercase", marginTop: tamanho * 0.06, ...contorno(tamanho * 0.22) }}>{el.rotulo}</div> : null}
    </div>
  );
};

/** Barras chapadas num cartão escuro de cantos arredondados, sem papel. */
const BarrasLimpas: React.FC<P> = ({ el, montagem, q, fps }) => {
  const itens = el.itens ?? [];
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const sobrio = montagem.familia === "sobrio";
  const titulo = el.titulo ? Math.min(el.caixa.w / 13, el.caixa.h * 0.11) : 0;
  const linha = (el.caixa.h * 0.84 - titulo * 1.5) / Math.max(1, itens.length);
  const tamanho = Math.min(linha * 0.26, el.caixa.w / 18);
  const s = sobrio ? interpolate(q, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : spring({ frame: q, fps, config: { damping: 12, stiffness: 260 } });
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, boxSizing: "border-box", padding: `${tamanho * 1.1}px ${tamanho * 1.1}px`, background: sobrio ? "rgba(12,13,16,0.78)" : "rgba(0,0,0,0.72)", borderRadius: sobrio ? 6 : 18, opacity: Math.min(1, s * 1.5), transform: sobrio ? `translateY(${(1 - s) * 16}px)` : `scale(${0.8 + 0.2 * s})` }}>
      {el.titulo ? <div style={{ fontFamily: sobrio ? FONTES.texto : FONTES.pesada, fontWeight: 700, fontSize: titulo, lineHeight: 1.1, color: "#fff", textTransform: sobrio ? "none" : "uppercase", marginBottom: titulo * 0.5 }}>{el.titulo}</div> : null}
      {itens.map((it, i) => {
        const p = interpolate(q, [6 + i * 8, 6 + i * 8 + fps * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        const cor = i === itens.length - 1 ? montagem.marca.acento : sobrio ? "#9AA0A6" : "#ffffff";
        return (
          <div key={i} style={{ height: linha, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: sobrio ? FONTES.texto : FONTES.condensada, fontWeight: 700, fontSize: tamanho * 0.95, color: "rgba(255,255,255,0.85)", textTransform: sobrio ? "none" : "uppercase" }}>{it.rotulo}</div>
            <div style={{ display: "flex", alignItems: "center", gap: tamanho * 0.5 }}>
              <div style={{ height: linha * 0.36, width: `${Math.max(2, (it.valor / max) * 62 * p)}%`, background: cor, borderRadius: sobrio ? 2 : 8 }} />
              <div style={{ fontFamily: sobrio ? FONTES.condensada : FONTES.titulo, fontWeight: 600, fontSize: tamanho * 1.6, lineHeight: 1, color: cor, opacity: p, whiteSpace: "nowrap" }}>{it.texto}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * ÍCONES POP desenhados em SVG (viewBox 100): sem fonte de emoji e sem IA.
 * Check verde e x vermelho são convenção universal; o resto é na cor da marca.
 */
function desenhoDoIcone(nome: string, acento: string): React.ReactNode {
  const branco = "#ffffff";
  const traco = { stroke: "#000", strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (nome) {
    case "check":
      return (<><circle cx="50" cy="50" r="44" fill="#22C55E" {...traco} /><path d="M28 52 L44 68 L74 34" fill="none" stroke={branco} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" /></>);
    case "x":
      return (<><circle cx="50" cy="50" r="44" fill="#EF4444" {...traco} /><path d="M33 33 L67 67 M67 33 L33 67" stroke={branco} strokeWidth={11} strokeLinecap="round" /></>);
    case "seta-cima":
      return (<><circle cx="50" cy="50" r="44" fill={acento} {...traco} /><path d="M50 76 L50 28 M30 46 L50 26 L70 46" fill="none" stroke={branco} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" /></>);
    case "seta-baixo":
      return (<><circle cx="50" cy="50" r="44" fill="#EF4444" {...traco} /><path d="M50 24 L50 72 M30 54 L50 74 L70 54" fill="none" stroke={branco} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" /></>);
    case "raio":
      return <path d="M58 4 L18 58 L46 58 L38 96 L82 38 L54 38 Z" fill={acento} {...traco} />;
    case "fogo":
      return (<><path d="M50 96 C22 96 12 74 18 54 C22 40 34 34 32 14 C48 22 58 36 56 50 C62 44 64 36 62 28 C80 44 90 62 84 76 C80 88 68 96 50 96 Z" fill={acento} {...traco} /><path d="M50 90 C38 90 34 80 38 70 C42 62 48 60 48 50 C58 58 64 66 62 76 C60 84 56 90 50 90 Z" fill="#FDE047" /></>);
    case "dinheiro":
      return (<><circle cx="50" cy="50" r="44" fill="#22C55E" {...traco} /><text x="50" y="68" textAnchor="middle" fontFamily={FONTES.titulo} fontSize="54" fill={branco} stroke="#000" strokeWidth={2}>$</text></>);
    case "relogio":
      return (<><circle cx="50" cy="50" r="44" fill={branco} {...traco} /><circle cx="50" cy="50" r="36" fill="none" stroke={acento} strokeWidth={6} /><path d="M50 26 L50 52 L66 62" fill="none" stroke="#000" strokeWidth={7} strokeLinecap="round" /></>);
    case "alvo":
      return (<><circle cx="50" cy="50" r="44" fill={branco} {...traco} /><circle cx="50" cy="50" r="30" fill={acento} /><circle cx="50" cy="50" r="17" fill={branco} /><circle cx="50" cy="50" r="7" fill={acento} /></>);
    case "alerta":
      return (<><path d="M50 8 L94 88 L6 88 Z" fill="#FACC15" {...traco} /><path d="M50 36 L50 62" stroke="#000" strokeWidth={10} strokeLinecap="round" /><circle cx="50" cy="75" r="5.5" fill="#000" /></>);
    case "coracao":
      return <path d="M50 88 C20 66 8 50 8 32 C8 18 20 8 33 8 C42 8 48 13 50 20 C52 13 58 8 67 8 C80 8 92 18 92 32 C92 50 80 66 50 88 Z" fill="#EF4444" {...traco} />;
    case "estrela":
    default:
      return <path d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36 Z" fill={acento} {...traco} />;
  }
}

const IconePop: React.FC<P> = ({ el, montagem, q, fps }) => {
  const s = spring({ frame: q, fps, config: { damping: 8, stiffness: 360, mass: 0.6 } });
  // Balanço curto depois do estouro: ícone parado de todo é figurinha colada.
  const balanco = Math.sin((q / fps) * 5 + el.semente) * 4 * Math.exp(-q / (fps * 1.2));
  const lado = Math.min(el.caixa.w, el.caixa.h);
  return (
    <svg
      viewBox="0 0 100 100"
      style={{
        position: "absolute",
        left: el.caixa.x + (el.caixa.w - lado) / 2,
        top: el.caixa.y + (el.caixa.h - lado) / 2,
        width: lado,
        height: lado,
        overflow: "visible",
        transform: `scale(${s}) rotate(${balanco + (1 - s) * -25}deg)`,
        filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.45))",
      }}
    >
      {desenhoDoIcone(el.nome ?? "estrela", montagem.marca.acento)}
    </svg>
  );
};

// ═══════════════════════════ SÓBRIO (BBC, NatGeo, 60 Minutes) ═══════════════════════════
//
// Grafismo de emissora: reto, alinhado, fonte sem serifa limpa, a cor da marca
// só num filete. Entradas por máscara (a barra se abre) e fade, nunca estouro.

/** Fundo claro atrás do texto? Na cartela e nos layouts com fundo "papel" (claro da marca). */
const sobreClaro = (layout: string | undefined, fundo: Fundo) => (layout === "cartela" || layout === "narrador-recortado") && fundo === "papel";

/** A TARJA DE TELEJORNAL (lower third): chapéu na cor da marca e a frase dita. */
const TarjaTelejornal: React.FC<P> = ({ el, montagem, q, fps, t }) => {
  const texto = el.texto ?? "";
  const chapeu = (el.rotulo ?? "").toUpperCase();
  const alturaDaFrase = el.caixa.h * (chapeu ? 0.5 : 0.62);
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.86, alturaDaFrase, 0.5, 2);
  const tam = Math.min(tamanho, el.caixa.h * 0.3);
  const abre = interpolate(q, [0, 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const barra = interpolate(q, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const tempos = el.palavras ?? [];
  const acento = montagem.marca.acento;
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", alignItems: "flex-end" }}>
      <div style={{ display: "flex", alignItems: "stretch", maxWidth: "100%" }}>
        {/* O filete na cor da marca cresce primeiro; o painel se abre da esquerda. */}
        <div style={{ width: Math.max(8, tam * 0.16), background: acento, transform: `scaleY(${barra})`, transformOrigin: "bottom" }} />
        <div style={{ clipPath: `inset(0 ${(1 - abre) * 100}% 0 0)`, background: "rgba(250,250,248,0.96)", padding: `${tam * 0.3}px ${tam * 0.55}px ${tam * 0.34}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          {chapeu ? (
            <div style={{ fontFamily: FONTES.condensada, fontWeight: 700, fontSize: tam * 0.52, letterSpacing: "0.08em", color: acento, lineHeight: 1.1, marginBottom: tam * 0.12 }}>{chapeu}</div>
          ) : null}
          {linhas.map((l, i) => (
            <div key={i} style={{ fontFamily: FONTES.texto, fontWeight: 700, fontSize: tam, lineHeight: 1.15, color: "#15171a", whiteSpace: "nowrap" }}>
              {l.split(" ").map((palavra, j) => {
                const w = tempos[k++];
                // A frase aparece inteira, e a palavra ainda não dita fica mais clara.
                const dita = w ? t >= w.inicio : true;
                return (
                  <span key={j} style={{ opacity: dita ? 1 : 0.45 }}>
                    {palavra}
                    {j < l.split(" ").length - 1 ? " " : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/** A CITAÇÃO: a frase dita em serifa, entre aspas na cor da marca, que se acende com a voz. */
const Citacao: React.FC<P> = ({ el, montagem, q, t, layout, fundo }) => {
  const texto = el.texto ?? "";
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.86, el.caixa.h * 0.8, 0.5, 3);
  const claro = sobreClaro(layout, fundo);
  const cor = claro ? "#15171a" : "#ffffff";
  const aparece = interpolate(q, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tempos = el.palavras ?? [];
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", opacity: aparece, textAlign: "center" }}>
      <div style={{ fontFamily: FONTES.revista, fontWeight: 700, fontSize: tamanho * 1.1, lineHeight: 0.6, color: montagem.marca.acento, height: tamanho * 0.5 }}>{"\u201C"}</div>
      {linhas.map((l, i) => (
        <div key={i} style={{ fontFamily: FONTES.serifa, fontWeight: 700, fontSize: tamanho, lineHeight: 1.2, color: cor, textShadow: claro ? "none" : "0 3px 14px rgba(0,0,0,0.7)", whiteSpace: "nowrap" }}>
          {l.split(" ").map((palavra, j) => {
            const w = tempos[k++];
            const dita = w ? t >= w.inicio : true;
            return (
              <span key={j} style={{ opacity: dita ? 1 : 0.4 }}>
                {palavra}
                {j < l.split(" ").length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Título de capítulo sóbrio: sem serifa, com o filete da marca que se estende embaixo. */
const TituloSobrio: React.FC<P> = ({ el, montagem, q, layout, fundo }) => {
  const texto = el.texto ?? "";
  const { linhas, tamanho } = melhorQuebra(texto.toUpperCase(), el.caixa.w * 0.9, el.caixa.h * 0.8, 0.5, 2);
  const s = interpolate(q, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const traco = interpolate(q, [6, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const claro = sobreClaro(layout, fundo);
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", opacity: s }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ fontFamily: FONTES.condensada, fontWeight: 600, fontSize: tamanho, letterSpacing: "0.06em", lineHeight: 1.1, color: claro ? "#15171a" : "#ffffff", textShadow: claro ? "none" : "0 3px 14px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
          {l}
        </div>
      ))}
      <div style={{ marginTop: tamanho * 0.18, height: Math.max(4, tamanho * 0.06), width: `${traco * 30}%`, background: montagem.marca.acento }} />
    </div>
  );
};

/** Número grande com rótulo e fonte, num cartão escuro reto (tela de dado do telejornal). */
const NumeroSobrio: React.FC<P> = ({ el, montagem, q, fps }) => {
  const valor = el.valor ?? 0;
  const p = interpolate(q, [0, Math.round(fps * 1.1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const atual = Number.isInteger(valor) ? Math.round(valor * p) : (valor * p).toFixed(1);
  const mostrado = `${el.prefixo ?? ""}${typeof atual === "number" ? atual.toLocaleString("pt-BR") : atual.replace(".", ",")}${el.sufixo ? ` ${el.sufixo}` : ""}`;
  const tamanho = caber(el.caixa.w * 0.8, el.caixa.h * 0.5, mostrado.length, 1, 0.5);
  const aparece = interpolate(q, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", alignItems: "center", justifyContent: "center", opacity: aparece, transform: `translateY(${(1 - aparece) * 14}px)` }}>
      <div style={{ background: "rgba(12,13,16,0.8)", borderLeft: `${Math.max(6, tamanho * 0.06)}px solid ${montagem.marca.acento}`, padding: `${tamanho * 0.14}px ${tamanho * 0.3}px`, maxWidth: "100%" }}>
        <div style={{ fontFamily: FONTES.condensada, fontWeight: 600, fontSize: tamanho, lineHeight: 1, color: "#ffffff" }}>{mostrado}</div>
        {el.rotulo ? <div style={{ fontFamily: FONTES.texto, fontWeight: 700, fontSize: tamanho * 0.2, color: "rgba(255,255,255,0.88)", marginTop: tamanho * 0.08 }}>{el.rotulo}</div> : null}
        {el.fonte ? <div style={{ fontFamily: FONTES.texto, fontWeight: 400, fontSize: tamanho * 0.14, color: "rgba(255,255,255,0.6)", marginTop: tamanho * 0.06 }}>Fonte: {el.fonte}</div> : null}
      </div>
    </div>
  );
};

// ═══════════════════════════ KEYNOTE E LOUSA (01/10) ═══════════════════════════

/**
 * O TEXTO DO KEYNOTE: letra limpa (Geist), caixa normal, centralizada, cada
 * palavra surgindo no instante em que é dita (sobe 12 px e acende), a última
 * na cor da marca. Sem caixa, sem contorno, sem estouro: o "motion graphic
 * limpo estilo Apple" do vídeo de referência.
 */
const TextoKeynote: React.FC<P> = ({ el, montagem, q, fps, t, layout, fundo }) => {
  const texto = el.texto ?? "";
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * 0.92, el.caixa.h * 0.86, 0.5, 2);
  const claro = sobreClaro(layout, fundo);
  const cor = claro ? "#111213" : "#ffffff";
  const tempos = el.palavras ?? [];
  const total = texto.split(/\s+/).filter(Boolean).length;
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: tamanho * 0.26, whiteSpace: "nowrap", lineHeight: 1.12 }}>
          {l.split(" ").map((palavra, j) => {
            const indice = k++;
            const w = tempos[indice];
            // Com o tempo da fala, a palavra surge quando é dita; sem ele, em cascata de 4 quadros.
            const desde = w ? Math.round((t - w.inicio) * fps) : q - indice * 4;
            const s = interpolate(desde, [0, 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  fontFamily: FONTES.limpa,
                  fontWeight: 400,
                  fontSize: tamanho,
                  letterSpacing: "-0.01em",
                  color: indice === total - 1 ? montagem.marca.acento : cor,
                  opacity: s,
                  transform: `translateY(${(1 - s) * 12}px)`,
                  textShadow: claro ? "none" : "0 2px 18px rgba(0,0,0,0.35)",
                }}
              >
                {palavra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * O PASSO DA LOUSA (Dan Martell): cartão escuro de cantos arredondados com
 * borda fina e brilho na cor da marca, o número do passo num quadrado da cor
 * da marca e a frase dita em branco, revelada com a voz.
 */
const PassoDaLousa: React.FC<P> = ({ el, montagem, q, fps, t }) => {
  const texto = el.texto ?? "";
  const rotulo = (el.rotulo ?? "").toUpperCase();
  const numero = rotulo.match(/\d+/)?.[0] ?? null;
  const altura = el.caixa.h;
  const { linhas, tamanho } = melhorQuebra(texto, el.caixa.w * (numero ? 0.72 : 0.86), altura * 0.62, 0.52, 2);
  const tam = Math.min(tamanho, altura * 0.3);
  const s = spring({ frame: q, fps, config: { damping: 16, stiffness: 170 }, durationInFrames: 12 });
  const acento = montagem.marca.acento;
  const tempos = el.palavras ?? [];
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tam * 0.6,
          maxWidth: "100%",
          padding: `${tam * 0.45}px ${tam * 0.6}px`,
          borderRadius: tam * 0.5,
          background: "rgba(10,11,13,0.92)",
          border: `2px solid ${acento}`,
          boxShadow: `0 0 ${tam * 0.6}px ${rgba(acento, 0.45)}, 0 10px 30px rgba(0,0,0,0.45)`,
          opacity: Math.min(1, s * 1.4),
          transform: `scale(${0.94 + 0.06 * s})`,
        }}
      >
        {numero ? (
          <div style={{ minWidth: tam * 1.5, height: tam * 1.5, borderRadius: tam * 0.32, background: acento, color: contraste(acento), fontFamily: FONTES.pesada, fontSize: tam * 0.9, display: "flex", alignItems: "center", justifyContent: "center" }}>{numero}</div>
        ) : rotulo ? (
          <div style={{ fontFamily: FONTES.condensada, fontWeight: 700, fontSize: tam * 0.55, letterSpacing: "0.08em", color: acento }}>{rotulo}</div>
        ) : null}
        <div>
          {linhas.map((l, i) => (
            <div key={i} style={{ fontFamily: FONTES.texto, fontWeight: 700, fontSize: tam, lineHeight: 1.15, color: "#ffffff", whiteSpace: "nowrap" }}>
              {l.split(" ").map((palavra, j) => {
                const w = tempos[k++];
                const dita = w ? t >= w.inicio : true;
                return (
                  <span key={j} style={{ opacity: dita ? 1 : 0.28 }}>
                    {palavra}
                    {j < l.split(" ").length - 1 ? " " : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════ CONSÓRCIO (02/10) ═══════════════════════════
//
// A bíblia "Autoridade em consórcio" (lib/media/biblias/consorcio.ts), medida
// nos Reels do nicho: a prova na tela quando ela é dita. Três peças novas e a
// palavra condensada:
// - a FAIXA DE VALOR: o valor ("R$ 120 MIL") ou a palavra da prova
//   ("CONTEMPLADO") numa faixa de papel rasgado na cor da marca, que se abre
//   da esquerda; o número conta até o valor;
// - o SELO: a pílula branca arredondada com o círculo de check na cor da marca
//   e o nome do vendedor ("Pai do Consórcio"); sem check, é o rótulo branco
//   de letra preta com a frase dita ("Não façam isso em casa!");
// - o COMENTÁRIO RESPONDIDO: o cartão branco do adesivo da rede, com o avatar
//   neutro, "Respondendo a @fulano" e a pergunta como foi lida.
// Todo texto é código, com acentuação de verdade (Anton, Archivo Black e
// Liberation Sans têm os acentos do português).

/**
 * As bordas da faixa rasgada: em cima e embaixo o rasgo é fundo e miúdo (papel
 * arrancado), nas pontas é curto. bordaRasgada (util) rasga igual nos quatro
 * lados em porcentagem, e numa faixa larga e baixa o rasgo de cima sumia.
 */
function bordaDaFaixa(semente: number): string {
  const r = aleatorio(semente);
  const pts: string[] = [];
  const dentes = 30;
  for (let i = 0; i <= dentes; i++) pts.push(`${((i * 100) / dentes).toFixed(2)}% ${(r() * 9).toFixed(2)}%`);
  for (let i = 1; i < 5; i++) pts.push(`${(100 - r() * 1.6).toFixed(2)}% ${(i * 20).toFixed(2)}%`);
  for (let i = dentes; i >= 0; i--) pts.push(`${((i * 100) / dentes).toFixed(2)}% ${(100 - r() * 9).toFixed(2)}%`);
  for (let i = 4; i > 0; i--) pts.push(`${(r() * 1.6).toFixed(2)}% ${(i * 20).toFixed(2)}%`);
  return `polygon(${pts.join(",")})`;
}

/** O valor como se lê no Brasil: 120000 vira "120.000", 1.5 vira "1,5". */
function valorEmPortugues(v: number, inteiro: boolean): string {
  if (inteiro) return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return v.toFixed(1).replace(".", ",");
}

/** A FAIXA DE VALOR: a faixa ("R$ 120 MIL", "CONTEMPLADO") e, no kit do consórcio, o número. */
const FaixaDeValor: React.FC<P> = ({ el, montagem, q, fps }) => {
  const acento = montagem.marca.acento;
  const corDoTexto = contraste(acento);
  const ehNumero = el.tipo === "numero";
  const valor = el.valor ?? 0;
  const inteiro = Number.isInteger(valor);
  // "R$" colado no número fica "R$120": o espaço volta aqui.
  const prefixo = el.prefixo ? `${el.prefixo}${/\$$/.test(el.prefixo) ? " " : ""}` : "";
  const sufixo = el.sufixo ? ` ${el.sufixo}` : "";
  const final = ehNumero ? `${prefixo}${valorEmPortugues(valor, inteiro)}${sufixo}`.toUpperCase() : (el.texto ?? "").toUpperCase();
  const p = interpolate(q, [3, 3 + Math.round(fps * 0.6)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const mostrado = ehNumero ? `${prefixo}${valorEmPortugues(valor * p, inteiro)}${sufixo}`.toUpperCase() : final;
  // O tamanho sai do texto FINAL: a faixa não cresce enquanto o número conta.
  const altura = el.caixa.h * (el.rotulo ? 0.66 : 0.82);
  const tamanho = Math.min(caber(el.caixa.w * 0.86, altura * 0.72, final.length, 1, 0.47), montagem.largura * 0.16);
  const largura = Math.min(el.caixa.w, final.length * tamanho * 0.47 + tamanho * 0.9);
  const abre = interpolate(q, [0, 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const pulo = spring({ frame: q - 3, fps, config: { damping: 11, stiffness: 320, mass: 0.6 } });
  const giro = el.semente % 2 ? -2.2 : 1.8;
  const clip = bordaDaFaixa(el.semente);
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: largura, height: tamanho * 1.36, transform: `rotate(${giro}deg)`, clipPath: `inset(-20% ${(1 - abre) * 100}% -20% -5%)` }}>
        {/* A sombra é uma cópia do rasgo, deslocada: clip-path corta a box-shadow. */}
        <div style={{ position: "absolute", inset: 0, transform: "translate(6px, 9px)", background: "rgba(0,0,0,0.35)", clipPath: clip }} />
        <div style={{ position: "absolute", inset: 0, background: acento, clipPath: clip }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONTES.titulo,
            fontSize: tamanho,
            lineHeight: 1,
            letterSpacing: "0.01em",
            color: corDoTexto,
            whiteSpace: "nowrap",
            opacity: Math.min(1, pulo * 2),
            transform: `scale(${interpolate(pulo, [0, 1], [1.25, 1])})`,
          }}
        >
          {mostrado}
        </div>
      </div>
      {el.rotulo ? (
        <div style={{ marginTop: tamanho * 0.2, fontFamily: FONTES.titulo, fontSize: tamanho * 0.34, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.03em", opacity: p, textShadow: "0 3px 10px rgba(0,0,0,0.75)" }}>{el.rotulo}</div>
      ) : null}
    </div>
  );
};

/** O SELO: pílula branca com o check na cor da marca (marca do vendedor) ou o rótulo de letra preta. */
const Selo: React.FC<P> = ({ el, montagem, q, fps }) => {
  const texto = el.texto ?? "";
  const comCheck = el.check !== false;
  const h = el.caixa.h;
  const tamanho = Math.min(h * 0.44, caber(el.caixa.w - h * (comCheck ? 1.4 : 0.8), h * 0.6, texto.length, 1, 0.66));
  const largura = Math.min(el.caixa.w, texto.length * tamanho * 0.66 + h * (comCheck ? 1.45 : 0.85));
  const s = spring({ frame: q, fps, config: { damping: 12, stiffness: 260, mass: 0.7 } });
  const traco = interpolate(q, [5, 13], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const acento = montagem.marca.acento;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: h * 0.22,
          height: h,
          width: largura,
          boxSizing: "border-box",
          padding: `0 ${h * 0.4}px 0 ${comCheck ? h * 0.16 : h * 0.4}px`,
          borderRadius: h / 2,
          background: "#ffffff",
          boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
          opacity: Math.min(1, s * 2),
          transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
        }}
      >
        {comCheck ? (
          <svg viewBox="0 0 100 100" style={{ width: h * 0.72, height: h * 0.72, flex: "none" }}>
            <circle cx="50" cy="50" r="48" fill={acento} />
            <path d="M27 52 L43 68 L74 35" fill="none" stroke={contraste(acento)} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - traco} />
          </svg>
        ) : null}
        <span style={{ fontFamily: FONTES.pesada, fontSize: tamanho, lineHeight: 1, color: "#111213", whiteSpace: "nowrap", overflow: "hidden" }}>{texto}</span>
      </div>
    </div>
  );
};

/** O COMENTÁRIO RESPONDIDO: o cartão branco do adesivo da rede, com a pergunta lida. */
const CardDeComentario: React.FC<P> = ({ el, q, fps, t }) => {
  const texto = el.texto ?? "";
  const cabecalho = el.autor ? `Respondendo a @${el.autor.replace(/^@+/, "")}` : "Respondendo a um comentário";
  const w = el.caixa.w * 0.96;
  const h = el.caixa.h;
  const avatar = Math.min(h * 0.3, w * 0.09);
  const { linhas, tamanho: cabe } = melhorQuebra(texto, w * 0.8, h * 0.56, 0.55, 3);
  const tamanho = Math.min(cabe, h * 0.24);
  const s = spring({ frame: q, fps, config: { damping: 15, stiffness: 210 }, durationInFrames: 12 });
  const tempos = el.palavras ?? [];
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          width: w,
          boxSizing: "border-box",
          padding: `${h * 0.1}px ${h * 0.12}px ${h * 0.12}px`,
          borderRadius: h * 0.12,
          background: "#ffffff",
          boxShadow: "0 12px 30px rgba(0,0,0,0.38)",
          opacity: Math.min(1, s * 1.6),
          transform: `translateY(${(1 - s) * h * 0.5}px) scale(${0.92 + 0.08 * s})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: avatar * 0.4, marginBottom: h * 0.05 }}>
          {/* Avatar neutro: ninguém é retratado, nem o seguidor. */}
          <svg viewBox="0 0 100 100" style={{ width: avatar, height: avatar, flex: "none" }}>
            <circle cx="50" cy="50" r="50" fill="#D9DCE1" />
            <circle cx="50" cy="40" r="18" fill="#ffffff" />
            <path d="M18 88 C24 66 38 60 50 60 C62 60 76 66 82 88 Z" fill="#ffffff" />
          </svg>
          <span style={{ fontFamily: FONTES.texto, fontWeight: 400, fontSize: avatar * 0.5, color: "#6B7078", whiteSpace: "nowrap" }}>{cabecalho}</span>
        </div>
        {linhas.map((l, i) => (
          <div key={i} style={{ fontFamily: FONTES.texto, fontWeight: 700, fontSize: tamanho, lineHeight: 1.18, color: "#111213", whiteSpace: "nowrap" }}>
            {l.split(" ").map((palavra, j) => {
              const tw = tempos[k++];
              // A pergunta inteira aparece; a parte ainda não lida fica mais clara.
              const lida = tw ? t >= tw.inicio : true;
              return (
                <span key={j} style={{ opacity: lida ? 1 : 0.5 }}>
                  {palavra}
                  {j < l.split(" ").length - 1 ? " " : ""}
                </span>
              );
            })}
          </div>
        ))}
        {/* O bico do balão, embaixo à esquerda. */}
        <div style={{ position: "absolute", left: h * 0.3, bottom: -h * 0.08, width: h * 0.18, height: h * 0.18, background: "#ffffff", transform: "rotate(45deg)", borderRadius: 4 }} />
      </div>
    </div>
  );
};

/**
 * A PALAVRA DO CONSÓRCIO: condensada pesada (Anton) em caixa alta, branca,
 * com sombra macia e contorno fino, entrando inteira com um assentar curto.
 * É a letra que o nicho usa ("MOMENTO DO ANO", "BOAS PRÁTICAS"). A última
 * palavra ganha a cor da marca só quando a cor é clara o bastante para ler
 * sobre a gravação; cor escura da marca fica no selo e na faixa.
 */
const PalavraConsorcio: React.FC<P> = ({ el, montagem, q, fps }) => {
  const texto = (el.texto ?? "").toUpperCase();
  const { linhas, tamanho: cabe } = melhorQuebra(texto, el.caixa.w * 0.92, el.caixa.h * 0.8, 0.5, 2);
  const tamanho = Math.min(cabe, montagem.largura * 0.14);
  const acentoLe = contraste(montagem.marca.acento) !== "#ffffff";
  const s = spring({ frame: q, fps, config: { damping: 16, stiffness: 240 }, durationInFrames: 10 });
  const palavras = texto.split(/\s+/).filter(Boolean);
  let k = 0;
  return (
    <div style={{ position: "absolute", left: el.caixa.x, top: el.caixa.y, width: el.caixa.w, height: el.caixa.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${0.9 + 0.1 * s})`, opacity: Math.min(1, s * 1.6) }}>
      {linhas.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: tamanho * 0.22, whiteSpace: "nowrap" }}>
          {l.split(" ").map((palavra, j) => {
            const ultima = k++ === palavras.length - 1;
            return (
              <span
                key={j}
                style={{
                  display: "inline-block",
                  fontFamily: FONTES.titulo,
                  fontSize: tamanho,
                  lineHeight: 1.04,
                  color: ultima && palavras.length > 1 && acentoLe ? montagem.marca.acento : "#ffffff",
                  WebkitTextStroke: `${Math.max(2, tamanho * 0.03)}px rgba(0,0,0,0.85)`,
                  paintOrder: "stroke fill",
                  textShadow: `0 ${tamanho * 0.05}px ${tamanho * 0.16}px rgba(0,0,0,0.7)`,
                }}
              >
                {palavra}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Quem respira no quadro depois de entrar (o recorte e as letras têm o respiro deles). */
const RESPIRA = new Set(["marca-texto", "tarja", "numero", "barras", "titulo"]);

export const Elemento: React.FC<{ el: ElementoResolvido; montagem: MontagemResolvida; inicioDaCena: number; fundo: Fundo; layout?: string }> = ({ el, montagem, inicioDaCena, fundo, layout }) => {
  const quadro = useCurrentFrame();
  const { fps } = useVideoConfig();
  const q = quadro - Math.round((el.inicio - inicioDaCena) * fps);
  if (q < 0) return null;
  // A SAÍDA (29/09): quadros desde o começo dela; passou da animação, some.
  const sai = el.fim !== undefined && el.saida && el.saida !== "fica";
  const qs = sai ? quadro - Math.round((el.fim! - inicioDaCena) * fps) : -1;
  if (qs > QUADROS_DA_SAIDA) return null;
  const t = (Math.round(inicioDaCena * fps) + quadro) / fps;
  const p: P = { el, montagem, q, fps, t, fundo, layout };
  let corpo: React.ReactNode = null;
  // Cada família pinta os mesmos tipos na linguagem dela (30/09); o que não
  // tem desenho próprio aqui cai no da colagem, abaixo.
  const familia = montagem.familia;
  // Os do consórcio (02/10) têm desenho próprio em qualquer família.
  // A faixa sobre a gravação do corte limpo (03/10) vale em qualquer família.
  if (el.tipo === "marca-texto" && el.visual === "faixa") corpo = <FaixaSobreVideo {...p} />;
  else if (el.tipo === "faixa") corpo = <FaixaDeValor {...p} />;
  else if (el.tipo === "selo") corpo = <Selo {...p} />;
  else if (el.tipo === "comentario") corpo = <CardDeComentario {...p} />;
  else if (familia === "impacto") {
    const doConsorcio = montagem.estilo?.kit === "consorcio";
    // No consórcio, o número dito é faixa de valor e a palavra é a condensada do nicho.
    if (doConsorcio && el.tipo === "numero") corpo = <FaixaDeValor {...p} />;
    else if (doConsorcio && (el.tipo === "letras-revista" || el.tipo === "titulo" || el.tipo === "carimbo")) corpo = <PalavraConsorcio {...p} />;
    // O MrBeast (kit "retencao") troca a palavra gigante pela limpa (02/10).
    else if ((el.tipo === "letras-revista" || el.tipo === "titulo" || el.tipo === "carimbo") && montagem.estilo?.kit === "retencao") corpo = <PalavraLimpa {...p} />;
    else if (el.tipo === "letras-revista" || el.tipo === "titulo" || el.tipo === "carimbo") corpo = <PalavraGigante {...p} />;
    else if (el.tipo === "marca-texto" || el.tipo === "tarja") corpo = <DestaqueImpacto {...p} />;
    else if (el.tipo === "numero") corpo = <NumeroImpacto {...p} />;
    else if (el.tipo === "barras") corpo = <BarrasLimpas {...p} />;
  } else if (familia === "sobrio") {
    // Os kits próprios dentro do sóbrio (01/10): o keynote (letra limpa, a
    // frase aparecendo palavra a palavra no instante dito) e a lousa (cartão
    // escuro com borda na cor da marca e o passo numerado).
    const kit = montagem.estilo?.kit;
    if (kit === "keynote" && (el.tipo === "marca-texto" || el.tipo === "titulo" || el.tipo === "letras-revista" || el.tipo === "carimbo")) corpo = <TextoKeynote {...p} />;
    else if (kit === "lousa" && el.tipo === "tarja") corpo = <PassoDaLousa {...p} />;
    else if (el.tipo === "tarja") corpo = <TarjaTelejornal {...p} />;
    else if (el.tipo === "marca-texto") corpo = <Citacao {...p} />;
    else if (el.tipo === "titulo" || el.tipo === "letras-revista" || el.tipo === "carimbo") corpo = <TituloSobrio {...p} />;
    else if (el.tipo === "numero") corpo = <NumeroSobrio {...p} />;
    else if (el.tipo === "barras") corpo = <BarrasLimpas {...p} />;
  }
  if (el.tipo === "icone-pop") corpo = <IconePop {...p} />;
  if (!corpo) switch (el.tipo) {
    case "recorte":
      corpo = el.url ? <Recorte {...p} /> : null;
      break;
    case "marca-texto":
      corpo = <MarcaTexto {...p} />;
      break;
    case "letras-revista":
      corpo = <LetrasDeRevista {...p} />;
      break;
    case "titulo":
      corpo = <Titulo {...p} />;
      break;
    case "carimbo":
      corpo = <Carimbo {...p} />;
      break;
    case "tarja":
      corpo = <Tarja {...p} />;
      break;
    case "numero":
      corpo = <Numero {...p} />;
      break;
    case "barras":
      corpo = <Barras {...p} />;
      break;
    case "seta":
    case "circulo":
      corpo = <Traco {...p} />;
      break;
    default:
      return null;
  }
  if (!corpo) return null;

  // Uma camada do quadro inteiro por elemento, girando em volta do centro
  // dele: o respiro enquanto está na tela e a saída no fim.
  const cx = el.caixa.x + el.caixa.w / 2;
  const cy = el.caixa.y + el.caixa.h / 2;
  const partes: string[] = [];
  let opacidade = 1;
  // Respiro é da colagem (papel colado balança); tarja e número de
  // telejornal ficam firmes.
  if (RESPIRA.has(el.tipo) && familia === "colagem") {
    const r = respiro(q, fps, el.semente, 0.5);
    partes.push(`translateY(${r.dy}px) rotate(${r.giro}deg)`);
  }
  // ENTRADA PELOS LADOS (01/10, vídeo de referência do Bruno: os elementos
  // entram pelos lados e preenchem a tela). Nos kits limpos (keynote,
  // lousa) o elemento chega deslizando do lado mais perto dele, desacelerando.
  if (montagem.estilo?.entradaLateral && q < 16) {
    const s = spring({ frame: q, fps, config: { damping: 18, stiffness: 160 }, durationInFrames: 14 });
    const lado = cx < montagem.largura / 2 ? -1 : 1;
    partes.push(`translateX(${(1 - s) * lado * Math.min(montagem.largura * 0.25, el.caixa.w * 0.6 + 80)}px)`);
    opacidade = Math.min(opacidade, Math.min(1, 0.15 + s));
  }
  if (qs >= 0) {
    const u = Math.min(1, qs / QUADROS_DA_SAIDA);
    if (el.saida === "cair") {
      // Gravidade: sai pela base do quadro em 8 quadros, girando.
      const g = (2 * (montagem.altura - el.caixa.y + el.caixa.h * 0.2)) / (QUADROS_DA_SAIDA * QUADROS_DA_SAIDA);
      partes.push(`translateY(${0.5 * g * qs * qs}px) rotate(${25 * u * (el.semente % 2 ? 1 : -1)}deg)`);
    } else if (el.saida === "deslizar") {
      const e = Easing.in(Easing.cubic)(u);
      partes.push(`translateX(${-(el.caixa.x + el.caixa.w + 40) * e}px)`);
    } else {
      const e = Easing.in(Easing.quad)(Math.min(1, qs / 6));
      partes.push(`scale(${1 - 0.14 * e})`);
      opacidade = 1 - e;
    }
  }
  // Sempre a mesma camada, com ou sem transformação: trocar a árvore no
  // começo da saída remontaria a imagem do recorte.
  return <div style={{ position: "absolute", inset: 0, transform: partes.join(" "), transformOrigin: `${cx}px ${cy}px`, opacity: opacidade }}>{corpo}</div>;
};
