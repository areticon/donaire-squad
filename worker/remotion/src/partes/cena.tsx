import React from "react";
import { AbsoluteFill, Freeze, Img, OffthreadVideo, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { CenaResolvida, MontagemResolvida, Movimento } from "../tipos";
import { cobrir } from "../util";
import { Fita } from "./elementos";

/**
 * A CÂMERA DA CENA (29/09). Antes o movimento era uma escala só no vídeo do
 * narrador, com o punch no primeiro quadro da cena (1 s antes da palavra) e
 * travado em 1,14 até o corte; no canto acontecia dentro de uma janelinha e
 * ninguém via, e a colagem ficava rígida como print. Agora a câmera mexe a
 * cena INTEIRA (mídia, narrador, recortes, títulos) em volta do `foco`:
 *
 * - punch: na palavra forte (`movimentoEm`) sobe a 1,11 em 5 quadros, segura
 *   8 e volta em 14, como o soco de ênfase da referência;
 * - zoom-in-lento: 6% na cena inteira, com um empurrão a mais na palavra forte;
 * - zoom-out: de 1,08 a 1 na cena inteira;
 * - estático: um empurrão pequeno na palavra forte e só;
 * - e sempre uma deriva lenta (poucos px e décimos de grau), porque quadro
 *   parado de todo é slide. A escala base de 1,02 cobre as bordas da deriva.
 *
 * Os números são menores que os da auditoria (1,12 e 8%) porque agora a
 * cena inteira cresce: com 1,11 em volta do meio do quadro, o título do topo
 * ainda cabe; com mais, saía pela borda (prévia de 29/09).
 *
 * Tudo é transform de uma camada: custo quase zero por quadro.
 */
export type Camera = { escala: number; dx: number; dy: number; giro: number };

export const ESCALA_BASE_DA_CAMERA = 1.02;

/**
 * A CÂMERA POR FAMÍLIA (30/09). Os números de cima são os da colagem. No
 * IMPACTO (Hormozi, MrBeast) o punch é o soco de verdade: sobe a 1,2 em 4
 * quadros e SEGURA em 1,12 até o corte, como o zoom de corte seco dos canais
 * de retenção, e o zoom lento anda 10%. No SÓBRIO (BBC, NatGeo) a câmera quase
 * não se nota: aproximação de 3 a 4%, punch vira um empurrão de 4%, e sem giro
 * de deriva (telejornal não balança).
 */
export function cameraDaCena(cena: CenaResolvida, quadro: number, fps: number, familia: MontagemResolvida["familia"] = "colagem"): Camera {
  const dur = Math.max(1, Math.round((cena.fim - cena.inicio) * fps));
  const p = Math.min(1, Math.max(0, quadro / dur));
  const k = quadro - Math.round(((cena.movimentoEm ?? cena.inicio) - cena.inicio) * fps);
  const empurrao = (forca: number) => (k >= 0 ? forca * spring({ frame: k, fps, config: { damping: 20, stiffness: 140 } }) : 0);
  let escala = 1;
  const m: Movimento = cena.movimento;
  const s = quadro / fps + cena.inicio * 0.37;
  if (familia === "impacto") {
    if (m === "punch") {
      if (k >= 0) {
        const sobe = spring({ frame: k, fps, config: { damping: 16, stiffness: 520 }, durationInFrames: 4 });
        const assenta = interpolate(k, [6, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        escala = 1 + 0.2 * sobe - 0.08 * assenta;
      }
    } else if (m === "zoom-in-lento") {
      escala = interpolate(p, [0, 1], [1, 1.1], { easing: Easing.inOut(Easing.sin) }) + empurrao(0.04);
    } else if (m === "zoom-out") {
      escala = interpolate(p, [0, 1], [1.14, 1], { easing: Easing.out(Easing.cubic) });
    } else {
      escala = 1 + empurrao(0.05);
    }
    return { escala: escala * ESCALA_BASE_DA_CAMERA, dx: Math.sin(s * 0.9) * 3, dy: Math.cos(s * 0.7) * 2, giro: 0 };
  }
  if (familia === "sobrio") {
    if (m === "punch") escala = 1 + empurrao(0.04);
    else if (m === "zoom-in-lento") escala = interpolate(p, [0, 1], [1, 1.04], { easing: Easing.inOut(Easing.sin) });
    else if (m === "zoom-out") escala = interpolate(p, [0, 1], [1.05, 1], { easing: Easing.out(Easing.quad) });
    return { escala: escala * ESCALA_BASE_DA_CAMERA, dx: Math.sin(s * 0.5) * 2, dy: Math.cos(s * 0.4) * 1.5, giro: 0 };
  }
  if (m === "punch") {
    if (k >= 0) {
      const sobe = spring({ frame: k, fps, config: { damping: 18, stiffness: 400 }, durationInFrames: 5 });
      const volta = interpolate(k, [13, 27], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
      escala = 1 + 0.11 * sobe - 0.09 * volta;
    }
  } else if (m === "zoom-in-lento") {
    escala = interpolate(p, [0, 1], [1, 1.06], { easing: Easing.inOut(Easing.sin) }) + empurrao(0.025);
  } else if (m === "zoom-out") {
    escala = interpolate(p, [0, 1], [1.08, 1], { easing: Easing.out(Easing.quad) });
  } else {
    escala = 1 + empurrao(0.025);
  }
  // Deriva com fase por cena, para duas cenas seguidas não andarem iguais.
  return {
    escala: escala * ESCALA_BASE_DA_CAMERA,
    dx: Math.sin(s * 0.9) * 6,
    dy: Math.cos(s * 0.7) * 4,
    giro: Math.sin(s * 0.6) * 0.3,
  };
}

/** O transform CSS da câmera, com a força (1 = cena, menos = fundo em paralaxe). */
export function transformDaCamera(c: Camera, forca = 1): string {
  const escala = 1 + (c.escala - 1) * forca;
  return `translate(${c.dx * forca}px, ${c.dy * forca}px) rotate(${c.giro * forca}deg) scale(${escala})`;
}

/**
 * Compatibilidade: a escala do movimento como função do quadro, para quem
 * ainda chama pelo nome antigo (o cálculo novo está em `cameraDaCena`).
 */
export function escalaDoMovimento(m: Movimento, quadro: number, duracaoEmQuadros: number, fps: number): number {
  const p = Math.min(1, Math.max(0, quadro / Math.max(1, duracaoEmQuadros)));
  if (m === "zoom-in-lento") return interpolate(p, [0, 1], [1, 1.08], { easing: Easing.inOut(Easing.sin) });
  if (m === "zoom-out") return interpolate(p, [0, 1], [1.1, 1], { easing: Easing.out(Easing.quad) });
  if (m === "punch") return 1 + 0.12 * spring({ frame: quadro, fps, config: { damping: 18, stiffness: 400 }, durationInFrames: 5 });
  return 1;
}

const COR_DO_PAPEL = "#EEEAE1";

/** As curvas de nível da lousa: anéis deformados em volta de um ponto fora do centro (calculadas uma vez). */
const cacheDaLousa = new Map<string, string[]>();
function linhasDaLousa(W: number, H: number): string[] {
  const chave = `${W}x${H}`;
  const pronto = cacheDaLousa.get(chave);
  if (pronto) return pronto;
  const cx = W * 0.78;
  const cy = H * 0.24;
  const escala = Math.max(W, H) / 1280;
  const linhas: string[] = [];
  for (let k = 0; k < 26; k++) {
    const r = (60 + k * 40) * escala;
    const pts: string[] = [];
    for (let a = 0; a <= 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const d = r + Math.sin(rad * 3 + k * 0.7) * 14 * escala + Math.cos(rad * 5 + k) * 8 * escala;
      pts.push(`${(cx + Math.cos(rad) * d * 1.2).toFixed(1)},${(cy + Math.sin(rad) * d * 0.8).toFixed(1)}`);
    }
    linhas.push(`M${pts.join(" L")}`);
  }
  cacheDaLousa.set(chave, linhas);
  return linhas;
}

/**
 * O fundo da cena. Na família colagem o worker já compôs o fundo em camadas
 * (kraft, folhas rasgadas, jornal, fita; ver partes/fundo-colagem.tsx) e aqui
 * só se pinta o JPEG pronto, sem mistura por quadro.
 */
export const Fundo: React.FC<{ cena: CenaResolvida; montagem: MontagemResolvida; pronto?: string }> = ({ cena, montagem, pronto }) => {
  // "papel" fora da colagem: o claro da marca no sóbrio, o escuro no impacto
  // (as mesmas cores de prepararFundos em worker/src/montagem.mjs).
  const claro = montagem.familia === "colagem" ? COR_DO_PAPEL : montagem.familia === "sobrio" ? montagem.marca.claro : montagem.marca.escuro;
  const cor = cena.fundo === "papel-marca" ? montagem.marca.acento : cena.fundo === "escuro" ? montagem.marca.escuro : claro;
  // A LOUSA (01/10, estilo Dan Martell): o escuro ganha linhas topográficas
  // finas, desenhadas em código (sem imagem gerada), como a lousa medida.
  // Antes do fundo pronto do worker, que é a cor chapada.
  if (montagem.estilo?.kit === "lousa" && cena.fundo === "escuro") {
    return (
      <AbsoluteFill style={{ backgroundColor: montagem.marca.escuro }}>
        <svg width={montagem.largura} height={montagem.altura} style={{ position: "absolute", inset: 0 }}>
          {linhasDaLousa(montagem.largura, montagem.altura).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1.4} />
          ))}
        </svg>
      </AbsoluteFill>
    );
  }
  if (pronto) return <Img src={pronto} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
  return (
    <AbsoluteFill style={{ backgroundColor: cor }}>
      {montagem.papelUrl && montagem.familia === "colagem" ? (
        <Img
          src={montagem.papelUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            mixBlendMode: cena.fundo === "papel" ? "multiply" : "soft-light",
            opacity: cena.fundo === "papel" ? 0.85 : 0.7,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** O narrador: pixel da gravação, nunca imagem gerada. O zoom é da câmera da cena. */
export const Narrador: React.FC<{
  cena: CenaResolvida;
  montagem: MontagemResolvida;
  narradorUrl: string;
  recortadoUrl: string | null;
  quadroInicial: number;
  cheio?: { url: string; recorte: { x: number; y: number; w: number; h: number } } | null;
  recortadoPronto?: string;
}> = ({ cena, montagem, narradorUrl, recortadoUrl, quadroInicial, cheio, recortadoPronto }) => {
  const quadro = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Cena recortada sem o recorte pronto nem o vídeo da pessoa sem fundo (o
  // completo não compõe recortado; a máscara pode falhar): a pessoa em tela
  // cheia da reserva, nunca a cena vazia (01/10).
  const semRecorte = cena.narrador?.modo === "recortado" && !recortadoUrl && !recortadoPronto;
  const n = semRecorte && cena.reserva ? cena.reserva : cena.narrador;
  if (!n) return null;
  const entrada = spring({ frame: quadro, fps, config: { damping: 13, stiffness: 150 }, durationInFrames: 16 });
  const acento = montagem.marca.acento;

  // Cena recortada já composta pelo worker (pessoa, borda e sombra sobre o
  // fundo): um vídeo opaco do quadro inteiro; a câmera mexe nele de fora.
  if (n.modo === "recortado" && recortadoPronto) {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={recortadoPronto} muted style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    );
  }

  // Narrador cheio já enquadrado pelo worker, no tamanho exato do quadro.
  const mesmoRecorte = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  if (n.modo === "video" && n.moldura === "nenhuma" && cheio && cena.layout === "narrador-cheio" && mesmoRecorte(cheio.recorte, n.recorte)) {
    // Na caixa do narrador, que no vertical não começa mais no topo (30/09).
    return (
      <div style={{ position: "absolute", left: n.caixa.x, top: n.caixa.y, width: n.caixa.w, height: n.caixa.h, overflow: "hidden" }}>
        <OffthreadVideo src={cheio.url} muted trimBefore={quadroInicial} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }

  if (n.modo === "recortado") {
    if (!recortadoUrl) return null;
    // A pessoa sem fundo com borda branca de adesivo e sombra de papel: o
    // "recorte" do catálogo, feito com a máscara do MediaPipe, sem IA no rosto.
    const borda = montagem.familia === "colagem" ? 7 : 0;
    return (
      <div
        style={{
          position: "absolute",
          left: n.caixa.x,
          top: n.caixa.y + (1 - entrada) * 80,
          width: n.caixa.w,
          height: n.caixa.h,
          filter: borda
            ? `drop-shadow(${borda}px 0 0 #fff) drop-shadow(-${borda}px 0 0 #fff) drop-shadow(0 ${borda}px 0 #fff) drop-shadow(0 -${borda}px 0 #fff) drop-shadow(0 22px 26px rgba(0,0,0,0.38))`
            : "drop-shadow(0 22px 26px rgba(0,0,0,0.38))",
        }}
      >
        <OffthreadVideo src={recortadoUrl} transparent muted trimBefore={quadroInicial} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }

  // Fora da colagem a janela do canto é LIMPA (30/09): reta, cantos
  // arredondados, sem margem branca de foto impressa e sem fita. No impacto,
  // borda grossa na cor da marca e entrada em estouro; no sóbrio, filete
  // claro e entrada suave.
  const colagem = montagem.familia === "colagem";
  if (!colagem && (n.moldura === "canto" || n.moldura === "foto")) {
    const impacto = montagem.familia === "impacto";
    const aro = impacto ? Math.max(6, Math.round(n.caixa.w * 0.012)) : 2;
    const raio = impacto ? 22 : 10;
    const iw2 = n.caixa.w - 2 * aro;
    const ih2 = n.caixa.h - 2 * aro;
    const pop = impacto ? spring({ frame: quadro, fps, config: { damping: 11, stiffness: 260 }, durationInFrames: 10 }) : 1;
    const aparece = impacto ? 1 : interpolate(quadro, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <div
        style={{
          position: "absolute",
          left: n.caixa.x,
          top: n.caixa.y,
          width: n.caixa.w,
          height: n.caixa.h,
          borderRadius: raio,
          background: impacto ? acento : "rgba(255,255,255,0.85)",
          boxShadow: impacto ? "0 18px 40px rgba(0,0,0,0.45)" : "0 10px 30px rgba(0,0,0,0.35)",
          transform: `scale(${0.85 + 0.15 * pop})`,
          opacity: aparece,
        }}
      >
        <div style={{ position: "absolute", left: aro, top: aro, width: iw2, height: ih2, overflow: "hidden", borderRadius: Math.max(2, raio - aro) }}>
          <OffthreadVideo src={narradorUrl} muted trimBefore={quadroInicial} style={cobrir(montagem.fonte, n.recorte, iw2, ih2)} />
        </div>
      </div>
    );
  }
  const foto = n.moldura === "foto";
  const canto = n.moldura === "canto";
  // A foto tem margem de polaroide; a janela do canto é uma foto impressa de
  // borda fina; o vídeo ocupa o miolo.
  const margem = foto ? Math.round(n.caixa.w * 0.045) : canto ? Math.round(Math.max(10, n.caixa.w * 0.018)) : 0;
  const base = foto ? Math.round(n.caixa.w * 0.14) : margem;
  const iw = n.caixa.w - 2 * margem;
  const ih = n.caixa.h - margem - base;
  const video = cobrir(montagem.fonte, n.recorte, iw, ih);
  // Tela dividida: a metade do narrador sobe de baixo (ou vem da direita no
  // 16:9), 3 quadros depois da mídia, que vem do lado oposto.
  const dividida = cena.layout === "tela-dividida";
  const sDiv = dividida ? spring({ frame: quadro - 3, fps, config: { damping: 16, stiffness: 170 }, durationInFrames: 12 }) : 1;
  const deitado = montagem.largura > montagem.altura;
  const queda = foto ? interpolate(entrada, [0, 1], [-160, 0]) : canto ? interpolate(entrada, [0, 1], [180, 0]) : dividida && !deitado ? (1 - sDiv) * n.caixa.h : 0;
  const lateral = dividida && deitado ? (1 - sDiv) * n.caixa.w : 0;
  const giro = foto || canto ? interpolate(entrada, [0, 1], [n.rotacao - 7, n.rotacao]) : n.rotacao;

  return (
    <div
      style={{
        position: "absolute",
        left: n.caixa.x + lateral,
        top: n.caixa.y + queda,
        width: n.caixa.w,
        height: n.caixa.h,
        transform: `rotate(${giro}deg)`,
        background: foto ? "#FBFAF5" : canto ? "#FBFAF5" : "transparent",
        borderRadius: canto ? 6 : foto ? 3 : 0,
        // Sombra dura de foto colada mais uma curta e suave de contato.
        boxShadow: foto || canto ? "10px 16px 0 rgba(0,0,0,0.26), 0 3px 8px rgba(0,0,0,0.25)" : undefined,
        opacity: foto || canto ? Math.min(1, entrada * 1.6) : 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: margem,
          top: margem,
          width: iw,
          height: ih,
          overflow: "hidden",
          borderRadius: canto ? 3 : 0,
        }}
      >
        <OffthreadVideo src={narradorUrl} muted trimBefore={quadroInicial} style={video} />
      </div>
      {foto || canto ? (
        <>
          <Fita x={-n.caixa.w * 0.06} y={-n.caixa.w * 0.03} giro={-30} largura={n.caixa.w * 0.28} cor={acento} semente={n.caixa.x + 3} q={quadro - 10} fps={fps} />
          <Fita x={n.caixa.w * 0.78} y={-n.caixa.w * 0.03} giro={28} largura={n.caixa.w * 0.28} cor={acento} semente={n.caixa.y + 5} q={quadro - 13} fps={fps} />
        </>
      ) : null}
    </div>
  );
};

/** A imagem ou cena gerada da cena (B-roll, canto, tela dividida). */
export const Midia: React.FC<{ cena: CenaResolvida; montagem: MontagemResolvida; duracaoDoVideo?: number }> = ({ cena, montagem, duracaoDoVideo }) => {
  const quadro = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = cena.midia;
  if (!m) return null;
  const dur = Math.round((cena.fim - cena.inicio) * fps);
  // Ken Burns por dentro (imagem parada de todo é slide): 7% com um passeio
  // lateral de 3%, suave nas pontas. A câmera da cena mexe por fora.
  const p = Math.min(1, quadro / Math.max(1, dur));
  const kb = Easing.inOut(Easing.sin)(p);
  const escala = 1.02 + 0.07 * kb;
  const passeio = (cena.inicio * 7) % 2 < 1 ? -1 : 1;
  const papel = m.moldura === "papel";
  // Janela limpa (impacto e sóbrio): reta, cantos arredondados, sem fita.
  const limpa = m.moldura === "limpa";
  const impacto = montagem.familia === "impacto";
  const entrada = spring({ frame: quadro, fps, config: { damping: 13, stiffness: 120 }, durationInFrames: 16 });
  // A foto impressa: borda branca fina, fitas nos cantos de cima, sombra dura.
  // Sem a margem branca grossa com borda rasgada, que lia como slide (29/09).
  const margem = papel ? Math.round(Math.max(10, m.caixa.w * 0.014)) : m.moldura === "limpa" && montagem.familia === "impacto" ? Math.max(6, Math.round(m.caixa.w * 0.012)) : 0;
  // O VÍDEO GERADO NO TEMPO DA CENA (29/09). Continua de onde a cena
  // anterior parou (`inicioNoVideo`); se sobrou menos de 1 s, recomeça. Mais
  // curto que a cena: desacelera até 0,6 e, se ainda faltar, segura o último
  // quadro (Freeze) em vez de acabar em preto.
  const durCena = Math.max(0.1, cena.fim - cena.inicio);
  let inicioNoVideo = m.inicioNoVideo ?? 0;
  if (duracaoDoVideo && duracaoDoVideo - inicioNoVideo < 1) inicioNoVideo = 0;
  const restante = duracaoDoVideo ? duracaoDoVideo - inicioNoVideo : Infinity;
  const taxa = m.tipo === "video" && Number.isFinite(restante) ? Math.max(0.6, Math.min(1, restante / durCena)) : 1;
  const congelaEm = Number.isFinite(restante) ? Math.floor(((restante - 0.12) / taxa) * fps) : Infinity;
  const dividida = cena.layout === "tela-dividida";
  const deitado = montagem.largura > montagem.altura;
  const sDiv = dividida ? spring({ frame: quadro, fps, config: { damping: 16, stiffness: 170 }, durationInFrames: 12 }) : 1;
  const barra = interpolate(quadro, [4, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const dy = papel ? interpolate(entrada, [0, 1], [-120, 0]) : limpa ? 0 : dividida && !deitado ? (1 - sDiv) * -m.caixa.h : 0;
  const dx = dividida && deitado ? (1 - sDiv) * -m.caixa.w : 0;
  const acento = montagem.marca.acento;
  return (
    <div
      style={{
        position: "absolute",
        left: m.caixa.x + dx,
        top: m.caixa.y + dy,
        width: m.caixa.w,
        height: m.caixa.h,
        transform: limpa
          ? `scale(${impacto ? 0.88 + 0.12 * entrada : 1})`
          : `rotate(${m.rotacao + (papel ? (1 - entrada) * -5 : 0)}deg)`,
        background: papel ? "#FBFAF5" : limpa && impacto ? acento : undefined,
        borderRadius: limpa ? (impacto ? 22 : 10) : undefined,
        boxShadow: papel ? "12px 18px 0 rgba(0,0,0,0.24), 0 3px 8px rgba(0,0,0,0.22)" : limpa ? "0 14px 36px rgba(0,0,0,0.4)" : undefined,
        opacity: papel ? Math.min(1, entrada * 1.8) : limpa && !impacto ? Math.min(1, quadro / 10) : 1,
      }}
    >
      <div style={{ position: "absolute", left: margem, top: margem, right: margem, bottom: margem, overflow: "hidden", borderRadius: limpa ? (impacto ? 16 : 10) : undefined }}>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${passeio * 3 * kb}%) scale(${escala})` }}>
          {m.tipo === "video" ? (
            quadro >= congelaEm ? (
              <Freeze frame={congelaEm}>
                <OffthreadVideo src={m.url} muted playbackRate={taxa} trimBefore={Math.round(inicioNoVideo * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </Freeze>
            ) : (
              <OffthreadVideo src={m.url} muted playbackRate={taxa} trimBefore={Math.round(inicioNoVideo * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )
          ) : (
            <Img src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      </div>
      {papel ? (
        <>
          <Fita x={-m.caixa.w * 0.035} y={-m.caixa.w * 0.02} giro={-24} largura={m.caixa.w * 0.2} cor={acento} semente={m.caixa.w + 11} q={quadro - 8} fps={fps} />
          <Fita x={m.caixa.w * 0.83} y={-m.caixa.w * 0.02} giro={22} largura={m.caixa.w * 0.2} cor={acento} semente={m.caixa.h + 17} q={quadro - 11} fps={fps} />
        </>
      ) : null}
      {dividida ? (
        // A divisão da tela é uma faixa na cor da marca que se estica.
        <div
          style={{
            position: "absolute",
            ...(deitado ? { top: 0, bottom: 0, right: -7, width: 14 } : { left: 0, right: 0, bottom: -7, height: 14 }),
            background: acento,
            boxShadow: "0 4px 0 rgba(0,0,0,0.25)",
            transform: deitado ? `scaleY(${barra})` : `scaleX(${barra})`,
            transformOrigin: deitado ? "center top" : "left center",
          }}
        />
      ) : null}
    </div>
  );
};

export const FundoDaCena: React.FC<{ cena: CenaResolvida; montagem: MontagemResolvida }> = (p) => <Fundo {...p} />;
