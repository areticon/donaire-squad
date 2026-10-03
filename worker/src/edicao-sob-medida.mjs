import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emendar, ffprobe, fpsDe, rodar } from "./ffmpeg.mjs";
import { bundleDoRemotion, opcoesDoRender } from "./montagem.mjs";

/**
 * O EDITOR SOB MEDIDA NO WORKER (03/10/2026).
 *
 * O vídeo de pitch da landing ficou bom porque um programa escrito para ELE
 * desenhou camadas em HTML e as compôs no ffmpeg sobre o material, e o
 * resultado foi olhado e refeito (scratchpad/pitch/v4/montar_pitch4.py). Este
 * módulo é esse programa, generalizado: o app manda a EDIÇÃO que o agente
 * editor escreveu (lib/media/editor-sob-medida), e aqui:
 *
 *   1. as CAMADAS (títulos, cartões, linhas do tempo, números, mapas) são
 *      desenhadas pelo Remotion, TRANSPARENTES, e só nos quadros em que alguma
 *      coisa se mexe (entrada, passo, saída). Entre um movimento e outro a
 *      camada está parada, e um quadro só basta: o ffmpeg segura. É o que deixa
 *      um completo de 20 min com 80 peças caber em poucos minutos de Chrome;
 *   2. a GRAVAÇÃO passa pelo ffmpeg, plano a plano: cheia com o enquadramento
 *      do momento (médio, fechado, puxado para um lado), em CARTÃO sobre o
 *      fundo da marca, escondida atrás de um GRÁFICO de tela cheia, ou trocada
 *      por uma INSERÇÃO gerada;
 *   3. a LEGENDA pequena e limpa (a do pitch) é queimada no fim, e o áudio da
 *      base nunca é tocado.
 *
 * Em lotes de ~60 s, como o completo editado (worker/src/montagem-do-completo.mjs).
 * `escala` < 1 faz a PRÉVIA (metade da resolução) que o revisor com visão olha.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_DAS_FONTES = resolve(AQUI, "..", "fontes");
const LOTE_SEG = 60;
const PAR = (v) => Math.max(2, Math.round(v / 2) * 2);

// ─────────────────────────────── 1. a linha condensada ───────────────────────────────

/** Os intervalos em que a camada se mexe (entrada, cada passo, saída). */
export function movimentosDaCamada(c) {
  const m = [[c.de, Math.min(c.ate, c.de + c.entrada)]];
  for (const e of c.eventos ?? []) if (e < c.ate) m.push([Math.max(c.de, e), Math.min(c.ate, e + c.evento)]);
  m.push([Math.max(c.de, c.ate - c.saida), c.ate]);
  return m;
}

/**
 * Cada quadro do vídeo (no fps das camadas) é VAZIO (nenhuma camada), ATIVO
 * (alguma se mexe) ou PARADO (camadas visíveis, nenhuma se mexendo). Quadros
 * ativos seguidos viram um trecho que o Remotion desenha inteiro; um trecho
 * parado vira um quadro só (no meio dele); o vazio não vai ao Chrome.
 * Devolve os trechos da linha condensada e a lista de exibição (quadro
 * condensado ou vazio, com a duração em segundos).
 */
export function linhaCondensada(camadas, duracao, fps) {
  const total = Math.ceil(duracao * fps);
  const estado = new Uint8Array(total); // 0 vazio, 1 parado, 2 ativo
  const marcar = (a, b, v) => {
    const f0 = Math.max(0, Math.floor(a * fps));
    const f1 = Math.min(total, Math.ceil(b * fps));
    for (let f = f0; f < f1; f++) if (estado[f] < v) estado[f] = v;
  };
  for (const c of camadas) {
    marcar(c.de, c.ate, 1);
    for (const [a, b] of movimentosDaCamada(c)) marcar(a, b, 2);
  }
  // O conjunto visível muda só dentro de um trecho ativo (entrada e saída são
  // movimento), mas por segurança a borda de toda camada vira ativa.
  for (const c of camadas) {
    for (const t of [c.de, c.ate]) {
      const f = Math.round(t * fps);
      for (const g of [f - 1, f]) if (g >= 0 && g < total && estado[g] === 1) estado[g] = 2;
    }
  }
  const trechos = [];
  const exibir = []; // { tipo: "quadro"|"vazio", c?: índice condensado, seg }
  let c0 = 0;
  let f = 0;
  while (f < total) {
    let g = f;
    while (g < total && estado[g] === estado[f]) g++;
    const n = g - f;
    if (estado[f] === 0) exibir.push({ tipo: "vazio", seg: n / fps, de: f / fps });
    else if (estado[f] === 2) {
      trechos.push({ c0, t0: +(f / fps).toFixed(5), n });
      for (let k = 0; k < n; k++) exibir.push({ tipo: "quadro", c: c0 + k, seg: 1 / fps, de: (f + k) / fps });
      c0 += n;
    } else {
      trechos.push({ c0, t0: +((f + n / 2) / fps).toFixed(5), n: 1 });
      exibir.push({ tipo: "quadro", c: c0, seg: n / fps, de: f / fps });
      c0 += 1;
    }
    f = g;
  }
  return { trechos, exibir, quadros: c0 };
}

// ─────────────────────────────── 2. o render das camadas ───────────────────────────────

async function renderizarCamadas(edicao, pasta, escala, aoProgresso) {
  const { renderFrames, renderStill, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await bundleDoRemotion();
  const fps = edicao.fps;
  const { trechos, exibir, quadros } = linhaCondensada(edicao.camadas, edicao.duracao, fps);
  const dirQ = join(pasta, "camadas");
  await rm(dirQ, { recursive: true, force: true });
  await mkdir(dirQ, { recursive: true });
  const opcoes = opcoesDoRender();
  const base = { largura: edicao.largura, altura: edicao.altura, fps, tema: edicao.tema, logoUrl: edicao.logoUrl ?? null };
  let arquivos = [];
  if (quadros > 0) {
    const inputProps = { ...base, camadas: edicao.camadas, trechos };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps, chromiumOptions: opcoes.chromiumOptions });
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      outputDir: dirQ,
      imageFormat: "png",
      imageSequencePattern: "q-[frame].[ext]",
      concurrency: opcoes.concurrency,
      scale: escala,
      chromiumOptions: opcoes.chromiumOptions,
      timeoutInMilliseconds: 120_000,
      onStart: () => {},
      onFrameUpdate: (n) => aoProgresso?.(n / quadros),
    });
    arquivos = (await readdir(dirQ)).filter((a) => /^q-\d+\.png$/.test(a)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    if (arquivos.length !== quadros) throw new Error(`o Remotion devolveu ${arquivos.length} quadros de ${quadros}`);
  }
  // O quadro vazio (transparente) do tamanho certo.
  const W = PAR(edicao.largura * escala);
  const H = PAR(edicao.altura * escala);
  await rodar(["-f", "lavfi", "-i", `color=c=black@0:s=${W}x${H},format=rgba`, "-frames:v", "1", join(dirQ, "vazio.png")]);
  // Os fundos da marca: o liso e um por caixa de cartão.
  const fundos = {};
  const caixas = new Map();
  for (const p of edicao.planos ?? []) if (p.tipo === "cartao" && p.caixa) caixas.set(JSON.stringify(p.caixa), p.caixa);
  const pedidosDeFundo = [["liso", null], ...[...caixas.entries()].map(([k, cx], i) => [`cartao-${i}`, cx, k])];
  for (const [nome, cartao, chave] of pedidosDeFundo) {
    const inputProps = { largura: edicao.largura, altura: edicao.altura, tema: edicao.tema, cartao };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaFundo", inputProps, chromiumOptions: opcoes.chromiumOptions });
    const out = join(pasta, `fundo-${nome}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: out, frame: 0, imageFormat: "png", scale: escala, chromiumOptions: opcoes.chromiumOptions });
    fundos[chave ?? "liso"] = out;
  }
  return { exibir, arquivos, dirQ, fundos, quadros };
}

// ─────────────────────────────── 3. a legenda ───────────────────────────────

const assTempo = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const mi = Math.floor((t % 3600) / 60);
  return `${h}:${String(mi).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
};
const assCor = (hex, alfa = 0) => {
  const h = String(hex || "#000000").replace("#", "").padEnd(6, "0");
  return `&H${alfa.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

/** A legenda pequena e limpa do pitch: frase curta, Geist SemiBold, caixa escura da marca, no terço de baixo. */
export function legendaSobMedida(edicao, W, H, desloc, duracao) {
  const vertical = H > W;
  const ey = H / (vertical ? 1920 : 1080);
  const tam = Math.round((vertical ? 54 : 50) * ey);
  const margemV = Math.round(vertical ? H * 0.2 : 40 * ey);
  const linhas = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Leg,Geist SemiBold,${tam},&H00FFFFFF,&H00FFFFFF,${assCor(edicao.tema?.escuroLegenda ?? "#06111F", 0x28)},&H00000000,0,0,0,0,100,100,0,0,3,${Math.round(14 * ey)},0,2,${Math.round(80 * ey)},${Math.round(80 * ey)},${margemV},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const p of edicao.legenda?.paginas ?? []) {
    if (p.fim <= desloc || p.inicio >= desloc + duracao) continue;
    const texto = String(p.texto).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    linhas.push(`Dialogue: 0,${assTempo(p.inicio - desloc)},${assTempo(Math.min(duracao, p.fim - desloc))},Leg,,0,0,0,,${texto}`);
  }
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 4. a gravação, plano a plano ───────────────────────────────

/** O enquadramento constante: recorte de 1/zoom do quadro, centrado no foco, preso às bordas. */
function recorte(W, H, zoom, fx, fy) {
  const z = Math.max(1, Math.min(2.2, zoom || 1));
  const w = PAR(W / z);
  const h = PAR(H / z);
  const x = Math.round(Math.max(0, Math.min(W - w, (fx ?? 0.5) * W - w / 2)));
  const y = Math.round(Math.max(0, Math.min(H - h, (fy ?? 0.4) * H - h / 2)));
  return { w, h, x, y };
}

/** A câmera (enquadramentos) cortada nos segmentos de um intervalo [a, b). */
function cameraNoIntervalo(camera, a, b) {
  const saida = [];
  let t = a;
  const lista = (camera ?? []).filter((k) => k.ate > a && k.de < b).sort((x, y) => x.de - y.de);
  for (const k of lista) {
    if (k.de > t + 1e-3) saida.push({ de: t, ate: Math.min(b, k.de), zoom: 1, x: 0.5, y: 0.4, movimento: "fixo" });
    const de = Math.max(t, k.de);
    const ate = Math.min(b, k.ate);
    if (ate - de > 1e-3) saida.push({ ...k, de, ate, k0: de - k.de, kn: k.ate - k.de });
    t = Math.max(t, ate);
  }
  if (b - t > 1e-3) saida.push({ de: t, ate: b, zoom: 1, x: 0.5, y: 0.4, movimento: "fixo" });
  return saida;
}

/**
 * Os segmentos de um lote, em ordem: cada um com o tipo de plano e, no cheio,
 * o enquadramento. Tempo absoluto (base).
 */
export function segmentosDoLote(edicao, a, b) {
  const planos = (edicao.planos ?? []).filter((p) => p.ate > a && p.de < b).sort((x, y) => x.de - y.de);
  const saida = [];
  let t = a;
  const cheio = (de, ate) => {
    for (const c of cameraNoIntervalo(edicao.camera, de, ate)) saida.push({ tipo: "cheio", ...c });
  };
  for (const p of planos) {
    const de = Math.max(t, p.de);
    const ate = Math.min(b, p.ate);
    if (de > t + 1e-3) cheio(t, de);
    if (ate - de > 1e-3) {
      if (p.tipo === "cheio") cheio(de, ate);
      else saida.push({ ...p, de, ate, k0: de - p.de });
    }
    t = Math.max(t, ate);
  }
  if (b - t > 1e-3) cheio(t, b);
  return saida.filter((s) => s.ate - s.de > 0.5 / 60);
}

/** O grafo de um lote. Devolve { entradas, grafo }. */
function grafoDoLote(edicao, lote, ctx) {
  const { W, H, fps, escala, fundos, insercoes } = ctx;
  const dur = lote.ate - lote.de;
  const segs = segmentosDoLote(edicao, lote.de, lote.ate);
  const entradas = [
    ["-ss", lote.de.toFixed(4), "-t", dur.toFixed(4), "-i", ctx.base],
    ["-f", "concat", "-safe", "0", "-i", lote.lista],
  ];
  const nos = [];
  const usosDaBase = segs.filter((s) => s.tipo === "cheio" || s.tipo === "cartao").length;
  nos.push(`[0:v]fps=${fps},scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p,setpts=PTS-STARTPTS${usosDaBase > 1 ? `,split=${usosDaBase}` : ""}${usosDaBase ? Array.from({ length: usosDaBase }, (_, i) => `[b${i}]`).join("") : ",nullsink"}`);
  let ib = 0;
  const imagemExtra = (arquivo, segDur, loop = true) => {
    const i = entradas.length;
    entradas.push(loop ? ["-loop", "1", "-framerate", String(fps), "-t", segDur.toFixed(4), "-i", arquivo] : ["-t", segDur.toFixed(4), "-i", arquivo]);
    return i;
  };
  const rotulos = [];
  segs.forEach((s, k) => {
    const a = (s.de - lote.de).toFixed(4);
    const b = (s.ate - lote.de).toFixed(4);
    const d = s.ate - s.de;
    const n = Math.max(1, Math.round(d * fps));
    const r = `s${k}`;
    if (s.tipo === "cheio") {
      const ent = `[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS`;
      if (s.movimento === "empurrao" && d > 0.6) {
        const z0 = Math.max(1, s.zoom || 1);
        const z1 = Math.max(z0, s.zoomFinal || z0 * 1.07);
        const p0 = (s.k0 ?? 0) / Math.max(0.1, s.kn ?? d);
        const pt = `min(1,(${p0.toFixed(4)}+on/${Math.max(1, Math.round((s.kn ?? d) * fps))}))`;
        const z = `${z0}+(${(z1 - z0).toFixed(4)})*${pt}`;
        const W2 = PAR(W * 1.5);
        const H2 = PAR(H * 1.5);
        nos.push(`${ent},scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}:x='max(0,min(iw-iw/zoom,${(s.x ?? 0.5).toFixed(4)}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${(s.y ?? 0.4).toFixed(4)}*ih-ih/zoom/2))',setsar=1,format=yuv420p[${r}]`);
      } else if ((s.zoom ?? 1) > 1.01) {
        const c = recorte(W, H, s.zoom, s.x, s.y);
        nos.push(`${ent},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H}:flags=bicubic,setsar=1[${r}]`);
      } else nos.push(`${ent}[${r}]`);
    } else if (s.tipo === "cartao") {
      const cx = s.caixa;
      const bx = PAR(cx.x * escala);
      const by = PAR(cx.y * escala);
      const bw = PAR(cx.w * escala);
      const bh = PAR(cx.h * escala);
      // O recorte da gravação na proporção da caixa, centrado no foco (o rosto).
      const z = Math.max(1, s.zoom || 1);
      const prop = bw / bh;
      let cw = W / z;
      let ch = cw / prop;
      if (ch > H / z) {
        ch = H / z;
        cw = ch * prop;
      }
      cw = PAR(cw);
      ch = PAR(ch);
      const x = Math.round(Math.max(0, Math.min(W - cw, (s.x ?? 0.5) * W - cw / 2)));
      const y = Math.round(Math.max(0, Math.min(H - ch, (s.y ?? 0.4) * H - ch / 2)));
      const iF = imagemExtra(fundos[JSON.stringify(s.caixa)] ?? fundos.liso, d);
      const iM = imagemExtra(ctx.mascara(bw, bh), d);
      nos.push(`[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,crop=${cw}:${ch}:${x}:${y},scale=${bw}:${bh}:flags=bicubic,format=yuva420p[cv${k}]`);
      nos.push(`[${iM}:v]format=gray,scale=${bw}:${bh}[cm${k}]`);
      nos.push(`[cv${k}][cm${k}]alphamerge[ca${k}]`);
      nos.push(`[${iF}:v]fps=${fps},scale=${W}:${H},format=yuv420p,setsar=1[cf${k}]`);
      nos.push(`[cf${k}][ca${k}]overlay=${bx}:${by}:shortest=1,format=yuv420p,setsar=1[${r}]`);
    } else if (s.tipo === "insercao" && insercoes[s.midia]) {
      const m = insercoes[s.midia];
      if (m.tipo === "video") {
        const i = entradas.length;
        entradas.push(["-stream_loop", "-1", "-t", d.toFixed(4), "-i", m.arquivo]);
        nos.push(`[${i}:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H},setsar=1,format=yuv420p,trim=duration=${d.toFixed(4)},setpts=PTS-STARTPTS[${r}]`);
      } else {
        const i = imagemExtra(m.arquivo, d);
        const W2 = PAR(W * 1.4);
        const H2 = PAR(H * 1.4);
        // Ken Burns lento (6%), do centro: a foto nunca fica parada.
        nos.push(`[${i}:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W2}:${H2},zoompan=z='1+0.06*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      }
    } else {
      // "grafico" (e inserção que falhou): o fundo da marca; as camadas desenham o resto.
      const i = imagemExtra(fundos.liso, d);
      nos.push(`[${i}:v]fps=${fps},scale=${W}:${H},format=yuv420p,setsar=1,trim=end_frame=${n}[${r}]`);
    }
    rotulos.push(`[${r}]`);
  });
  nos.push(`${rotulos.join("")}concat=n=${rotulos.length}:v=1:a=0,fps=${fps},setpts=PTS-STARTPTS[base]`);
  nos.push(`[1:v]fps=${fps},format=rgba,scale=${W}:${H},setpts=PTS-STARTPTS[ov]`);
  nos.push(`[base][ov]overlay=0:0:eof_action=pass:format=auto${lote.legenda ? `,subtitles=${lote.legenda}:fontsdir=fontes` : ""},format=yuv420p,trim=duration=${dur.toFixed(4)}[v]`);
  return { entradas: entradas.flat(), grafo: nos.join(";\n") };
}

/** A lista de exibição das camadas recortada no lote, no formato do demuxer de concatenação. */
function listaDoLote(exibir, arquivos, a, b) {
  const linhas = ["ffconcat version 1.0"];
  let ultimo = null;
  for (const e of exibir) {
    const fim = e.de + e.seg;
    if (fim <= a + 1e-6 || e.de >= b - 1e-6) continue;
    const seg = Math.min(fim, b) - Math.max(e.de, a);
    if (seg <= 1e-6) continue;
    const arq = e.tipo === "vazio" ? "camadas/vazio.png" : `camadas/${arquivos[e.c]}`;
    linhas.push(`file '${arq}'`, `duration ${seg.toFixed(5)}`);
    ultimo = arq;
  }
  if (ultimo) linhas.push(`file '${ultimo}'`);
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 5. a montagem ───────────────────────────────

/**
 * pedido:
 *   edicao        EdicaoResolvida (lib/media/editor-sob-medida/tipos.ts)
 *   completoUrl | baseArquivo
 *   escala        1 (final) ou 0,5 (prévia)
 *   abertura      { momentos, familia, acento, passagem } (opcional, só no final)
 */
export async function montarSobMedida(pedido, pasta, { baixar, aoProgresso } = {}) {
  const tempos = {};
  let t = Date.now();
  const t0 = t;
  const marcar = (n) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const ed = pedido.edicao;
  if (!ed || ed.versao !== 1) throw new Error("edição sob medida ausente ou de versão desconhecida");
  const escala = Math.min(1, Math.max(0.25, Number(pedido.escala) || 1));
  await mkdir(pasta, { recursive: true });
  let base = join(pasta, "base.mp4");
  if (pedido.baseArquivo) base = pedido.baseArquivo;
  else if (pedido.trecho?.sourceUrl) {
    // O CORTE (9:16): a base é o trecho limpo e enquadrado, como o narrador do
    // /montar (prepararTrecho), sem legenda nem efeito.
    const { prepararTrecho } = await import("./ffmpeg.mjs");
    const original = join(pasta, "original.mp4");
    await baixar(pedido.trecho.sourceUrl, original);
    await prepararTrecho(original, base, pedido.trecho.inicio, pedido.trecho.duracao, pedido.trecho.manter, pedido.trecho.pessoa ?? null);
    await rm(original, { force: true }).catch(() => {});
  } else await baixar(pedido.completoUrl, base);
  const dim = await ffprobe(base);
  const fps = fpsDe(base);
  const W = PAR(ed.largura * escala);
  const H = PAR(ed.altura * escala);
  if (Math.abs(dim.largura / dim.altura / (ed.largura / ed.altura) - 1) > 0.03) throw new Error(`base ${dim.largura}x${dim.altura} com edição ${ed.largura}x${ed.altura}: proporções diferentes`);
  const duracao = Math.min(ed.duracao, dim.duracaoSec);
  marcar("base");

  // As inserções geradas, baixadas.
  const insercoes = {};
  for (const [id, m] of Object.entries(ed.insercoes ?? {})) {
    if (!m?.url) continue;
    const ext = m.tipo === "video" ? "mp4" : (m.url.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] ?? "jpg");
    const arq = join(pasta, `insercao-${id.replace(/[^a-z0-9-]/gi, "")}.${ext}`);
    try {
      if (!existsSync(arq)) {
        if (/^https?:/i.test(m.url)) await baixar(m.url, arq);
        else await copyFile(m.url, arq);
      }
      insercoes[id] = { tipo: m.tipo, arquivo: arq };
    } catch (e) {
      console.warn(`[sob-medida] inserção ${id} não baixou: ${e?.message ?? e}`);
    }
  }
  marcar("insercoes");

  const camadas = await renderizarCamadas({ ...ed, duracao }, pasta, escala, (p) => aoProgresso?.(0.6 * p));
  tempos.quadrosDeCamada = camadas.quadros;
  tempos.quadrosDoVideo = Math.round(duracao * ed.fps);
  marcar("camadas");

  await cp(PASTA_DAS_FONTES, join(pasta, "fontes"), { recursive: true });
  const mascaras = new Map();
  const mascara = (w, h) => {
    const k = `${w}x${h}`;
    if (!mascaras.has(k)) mascaras.set(k, join(pasta, `mascara-${k}.png`));
    return mascaras.get(k);
  };
  // As máscaras dos cartões, antes dos lotes (cantos arredondados de 28 px).
  for (const p of ed.planos ?? []) {
    if (p.tipo !== "cartao" || !p.caixa) continue;
    const bw = PAR(p.caixa.w * escala);
    const bh = PAR(p.caixa.h * escala);
    const arq = mascara(bw, bh);
    if (existsSync(arq)) continue;
    const r = Math.round(28 * escala * (Math.min(ed.largura, ed.altura) / 1080));
    await rodar(["-f", "lavfi", "-i", `color=c=white:s=${bw}x${bh},format=gray`, "-vf", `geq=lum='if(lte(hypot(max(0,max(${r}-X,X-(W-1-${r}))),max(0,max(${r}-Y,Y-(H-1-${r})))),${r}),255,0)'`, "-frames:v", "1", arq]);
  }

  // Lotes cortados em quadro inteiro.
  const lotes = [];
  const passo = Math.round(LOTE_SEG * fps) / fps;
  for (let a = 0; a < duracao - 1e-3; a += passo) lotes.push({ de: +a.toFixed(5), ate: +Math.min(duracao, a + passo).toFixed(5) });
  const partes = [];
  const comLegenda = Boolean(ed.legenda?.paginas?.length);
  let feitos = 0;
  const ffmpegVersao = await new Promise((r) => {
    const p = spawn("ffmpeg", ["-version"]);
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.on("close", () => r(Number((s.match(/ffmpeg version n?(\d+)/i) ?? [])[1] ?? 0)));
    p.on("error", () => r(0));
  });
  const opcaoDoGrafo = ffmpegVersao >= 7 ? "-/filter_complex" : "-filter_complex_script";
  const fazerLote = async (lote, i) => {
    lote.lista = `lista-${i}.txt`;
    await writeFile(join(pasta, lote.lista), listaDoLote(camadas.exibir, camadas.arquivos, lote.de, lote.ate), "utf8");
    if (comLegenda) {
      lote.legenda = `legenda-${i}.ass`;
      await writeFile(join(pasta, lote.legenda), legendaSobMedida(ed, W, H, lote.de, lote.ate - lote.de), "utf8");
    }
    const { entradas, grafo } = grafoDoLote(ed, lote, { W, H, fps, escala, fundos: camadas.fundos, insercoes, base, mascara });
    await writeFile(join(pasta, `grafo-${i}.txt`), grafo, "utf8");
    const saida = join(pasta, `lote-${String(i).padStart(3, "0")}.mp4`);
    await rodar(
      [
        ...entradas,
        opcaoDoGrafo, `grafo-${i}.txt`,
        "-map", "[v]", "-an", "-fps_mode", "cfr", "-r", String(fps),
        "-c:v", "libx264", "-preset", escala < 1 ? "ultrafast" : "veryfast", "-crf", escala < 1 ? "26" : "18", "-pix_fmt", "yuv420p",
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-maxrate", "6M", "-bufsize", "12M", "-threads", "4",
        saida,
      ],
      { cwd: pasta, timeoutMs: 40 * 60_000 }
    );
    feitos++;
    aoProgresso?.(0.6 + 0.35 * (feitos / lotes.length));
    return saida;
  };
  const juntos = Math.max(1, Number(process.env.SOB_MEDIDA_LOTES ?? 2));
  const fila = lotes.map((l, i) => [l, i]);
  const res = new Array(lotes.length);
  await Promise.all(
    Array.from({ length: Math.min(juntos, lotes.length) }, async () => {
      while (fila.length) {
        const [l, i] = fila.shift();
        res[i] = await fazerLote(l, i);
      }
    })
  );
  partes.push(...res);
  marcar("lotes");

  const soVideo = join(pasta, "so-video.mp4");
  if (partes.length === 1) await copyFile(partes[0], soVideo);
  else await emendar(partes, soVideo, pasta);
  let saida = join(pasta, escala < 1 ? "previa.mp4" : "sob-medida.mp4");
  await rodar(["-i", soVideo, "-i", base, "-map", "0:v", "-map", "1:a?", "-t", duracao.toFixed(4), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida], { cwd: pasta });
  marcar("emenda");

  // A abertura com os melhores momentos (o gancho do JEV), só no final.
  let aberturaSeg = 0;
  if (escala >= 1 && pedido.abertura?.momentos?.length) {
    try {
      const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
      const abertura = await montarAberturaDeImpacto(base, pedido.abertura.momentos, pasta, {
        familia: pedido.abertura.familia ?? "sobrio",
        acento: pedido.abertura.acento ?? ed.tema?.acento,
        passagem: pedido.abertura.passagem ?? "corte-seco",
      });
      if (abertura) {
        const final = join(pasta, "sob-medida-com-abertura.mp4");
        await prefixarAbertura(abertura, saida, final, pasta, { copiar: false });
        aberturaSeg = (await ffprobe(abertura)).duracaoSec || 0;
        saida = final;
      }
    } catch (e) {
      console.warn(`[sob-medida] abertura falhou, segue sem: ${e?.message ?? e}`);
    }
    marcar("abertura");
  }
  // Limpeza do que pesa (os quadros das camadas e os lotes).
  if (!process.env.SOB_MEDIDA_GUARDAR) {
    await rm(camadas.dirQ, { recursive: true, force: true }).catch(() => {});
    for (const p of partes) await rm(p, { force: true }).catch(() => {});
  }
  tempos.total = +((Date.now() - t0) / 1000).toFixed(1);
  return { arquivo: saida, tempos, aberturaSeg, largura: W, altura: H, fps };
}

export { basename };
