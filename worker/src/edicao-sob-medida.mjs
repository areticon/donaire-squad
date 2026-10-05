import { spawn } from "node:child_process";
import { cp, mkdir, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aoCancelarOTrabalho, emendar, ffprobe, fpsDe, processoDoTrabalho, rodar, trabalhoCancelado } from "./ffmpeg.mjs";
import { bundleDoRemotion, opcoesDoRender } from "./montagem.mjs";
import { esperarMemoria, memoriaLivreMb } from "./memoria.mjs";

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
/**
 * O tamanho do lote (03/10, terceira volta): a memória do ffmpeg cresce com o
 * lote (as filas do grafo guardam quadros até a vez de cada plano). Medido no
 * completo de cmurtv2zg: lote de 60 s em 1080p chegou a 7,4 GB (o OOM do
 * worker); com as listas e as imagens consertadas, 2,4 GB; o de 30 s, 0,8 a
 * 1,2 GB. O final vai em 30 s; a prévia (metade da resolução) segue em 60 s.
 */
const LOTE_SEG_FINAL = Math.max(10, Number(process.env.SOB_MEDIDA_LOTE_SEG ?? 30));
const LOTE_SEG_PREVIA = 60;
const PAR = (v) => Math.max(2, Math.round(v / 2) * 2);

// ─────────────────────────────── 1. a linha condensada ───────────────────────────────

/** Os intervalos em que a camada se mexe (entrada, cada passo, saída). */
export function movimentosDaCamada(c) {
  // O palco (câmera virtual) e o título que deriva se mexem o tempo todo.
  if (c.continua) return [[c.de, c.ate]];
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

/**
 * AS TRANSIÇÕES ENTRE PLANOS (03/10, segunda volta): em cada troca de plano
 * da gravação (câmera cheia, cartão, inserção) entra uma camada "transicao"
 * de ~0,5 s centrada no corte, que o esconde com luz. O palco das telas
 * cheias tem a própria entrada (íris, cortina de luz, zoom) e não leva.
 */
export function transicoesDaEdicao(ed) {
  const saida = [];
  const bordas = [];
  for (const p of ed.planos ?? []) {
    if (p.tipo === "grafico" && ed.palco) continue;
    // O B-ROLL de banco (03/10, terceira volta) entra e sai no chicote ou na luz, curto.
    const tipo = p.tipo === "insercao" && ed.insercoes?.[p.midia]?.origem === "banco" ? "broll" : p.tipo;
    for (const t of [p.de, p.ate]) if (t > 0.3 && t < ed.duracao - 0.3) bordas.push({ t, tipo });
  }
  bordas.sort((a, b) => a.t - b.t);
  let ultimo = -10;
  bordas.forEach((b, k) => {
    if (b.t - ultimo < 0.5) return;
    ultimo = b.t;
    const tipo = b.tipo === "insercao" ? "flash" : b.tipo === "broll" ? (k % 3 === 2 ? "luz" : "whip") : k % 2 ? "whip" : "luz";
    const meia = tipo === "flash" ? 0.18 : b.tipo === "broll" ? 0.2 : 0.26;
    saida.push({ id: `tr${k}`, peca: "transicao", de: +(b.t - meia).toFixed(3), ate: +(b.t + meia).toFixed(3), entrada: 2 * meia, saida: 0.05, evento: 0.5, eventos: [], props: { tipo }, passes: ["frente"], continua: true });
  });
  return saida;
}

const passesDa = (c) => (Array.isArray(c.passes) && c.passes.length ? c.passes : ["frente"]);

/**
 * As camadas, desenhadas em até três PASSADAS (worker/remotion/src/sob-medida/
 * Camadas.tsx): "frente" (tudo), "atras" (o que vai por baixo da pessoa
 * recortada) e "vidro" (a máscara do desfoque). Cada passada tem a sua linha
 * condensada: só as camadas dela vão ao Chrome.
 */
async function renderizarCamadas(edicao, pasta, escala, aoProgresso) {
  const { renderFrames, renderStill, selectComposition, makeCancelSignal } = await import("@remotion/renderer");
  // O PRAZO DO TRABALHO (04/10): estourado, o Chrome do Remotion é fechado
  // pelo sinal de cancelamento, em vez de deixar a promessa pendurada.
  const { cancelSignal, cancel } = makeCancelSignal();
  const soltarCancelamento = aoCancelarOTrabalho(cancel);
  try {
    return await renderizarCamadasCom({ renderFrames, renderStill, selectComposition, cancelSignal }, edicao, pasta, escala, aoProgresso);
  } finally {
    soltarCancelamento();
  }
}

async function renderizarCamadasCom({ renderFrames, renderStill, selectComposition, cancelSignal }, edicao, pasta, escala, aoProgresso) {
  const serveUrl = await bundleDoRemotion();
  const fps = edicao.fps;
  const opcoes = opcoesDoRender();
  const base = { largura: edicao.largura, altura: edicao.altura, fps, tema: edicao.tema, logoUrl: edicao.logoUrl ?? null };
  const W = PAR(edicao.largura * escala);
  const H = PAR(edicao.altura * escala);
  const todas = [...edicao.camadas, ...transicoesDaEdicao(edicao)];
  const pedidos = ["frente", "atras", "vidro"].map((passe) => [passe, todas.filter((c) => passesDa(c).includes(passe))]).filter(([passe, cs]) => passe === "frente" || cs.length);
  const linhas = pedidos.map(([passe, cs]) => [passe, cs, linhaCondensada(cs, edicao.duracao, fps)]);
  const totalQuadros = linhas.reduce((s, [, , l]) => s + l.quadros, 0);
  let feitos = 0;
  const passadas = {};
  for (const [passe, cs, { trechos, exibir, quadros }] of linhas) {
    const nomeDir = passe === "frente" ? "camadas" : `camadas-${passe}`;
    const dirQ = join(pasta, nomeDir);
    await rm(dirQ, { recursive: true, force: true });
    await mkdir(dirQ, { recursive: true });
    let arquivos = [];
    if (quadros > 0) {
      const inputProps = { ...base, camadas: cs, trechos, passe };
      const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps, chromiumOptions: opcoes.chromiumOptions });
      const antes = feitos;
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
        cancelSignal,
        onStart: () => {},
        onFrameUpdate: (n) => aoProgresso?.((antes + n) / Math.max(1, totalQuadros)),
      });
      feitos += quadros;
      arquivos = (await readdir(dirQ)).filter((a) => /^q-\d+\.png$/.test(a)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      if (arquivos.length !== quadros) throw new Error(`o Remotion devolveu ${arquivos.length} quadros de ${quadros} (passada ${passe})`);
    }
    // O quadro vazio (transparente) do tamanho certo.
    await rodar(["-f", "lavfi", "-i", `color=c=black@0:s=${W}x${H},format=rgba`, "-frames:v", "1", join(dirQ, "vazio.png")]);
    passadas[passe] = { exibir, arquivos, dirQ, nomeDir, quadros, intervalos: cs.map((c) => [c.de, c.ate]) };
  }
  // Os fundos da marca: o liso e um por caixa de cartão.
  const fundos = {};
  const caixas = new Map();
  for (const p of edicao.planos ?? []) if (p.tipo === "cartao" && p.caixa) caixas.set(JSON.stringify(p.caixa), p.caixa);
  const pedidosDeFundo = [["liso", null], ...[...caixas.entries()].map(([k, cx], i) => [`cartao-${i}`, cx, k])];
  for (const [nome, cartao, chave] of pedidosDeFundo) {
    const inputProps = { largura: edicao.largura, altura: edicao.altura, tema: edicao.tema, cartao };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaFundo", inputProps, chromiumOptions: opcoes.chromiumOptions });
    const out = join(pasta, `fundo-${nome}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: out, frame: 0, imageFormat: "png", scale: escala, chromiumOptions: opcoes.chromiumOptions, cancelSignal });
    fundos[chave ?? "liso"] = out;
  }
  return { passadas, fundos, quadros: totalQuadros, todas };
}

/**
 * A PESSOA RECORTADA (03/10, segunda volta): a máscara da linha inteira,
 * segmentada só onde há camada na passada de trás (com folga), pelo
 * MediaPipe do recorte.py. Falhar aqui não derruba nada: sem máscara, o
 * título de trás fica por baixo da gravação inteira e a peça cai para a frente.
 */
async function matteDaPessoa(base, pasta, duracao, fps, intervalos) {
  if (!intervalos?.length) return null;
  const juntos = [];
  for (const [a, b] of intervalos.map(([a, b]) => [Math.max(0, a - 0.3), Math.min(duracao, b + 0.3)]).sort((x, y) => x[0] - y[0])) {
    const ult = juntos[juntos.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else juntos.push([a, b]);
  }
  const saida = join(pasta, "matte-pessoa.mp4");
  const PYTHON = process.env.PYTHON_DO_RECORTE ?? "python3";
  const modelo = process.env.MODELO_SEGMENTACAO ?? "/app/modelos/selfie_segmenter.tflite";
  const config = JSON.stringify({ modo: "linha", video: base, saida, fps, duracao, largura: 512, intervalos: juntos, modelo });
  const texto = await new Promise((resolver) => {
    const p = processoDoTrabalho(spawn(PYTHON, [join(AQUI, "recorte.py"), config], { cwd: pasta }));
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const relogio = setTimeout(() => p.kill("SIGKILL"), Math.max(180_000, duracao * 4000));
    p.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) console.warn(`[sob-medida] recorte da pessoa saiu com ${codigo}: ${err.slice(-300)}`);
      resolver(codigo === 0 ? out : null);
    });
    p.on("error", (e) => {
      clearTimeout(relogio);
      console.warn(`[sob-medida] recorte da pessoa não rodou: ${e.message}`);
      resolver(null);
    });
  });
  const linha = String(texto ?? "").trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  try {
    return linha && JSON.parse(linha).ok && existsSync(saida) ? saida : null;
  } catch {
    return null;
  }
}

/**
 * O SOM DAS PEÇAS (03/10, segunda volta): whoosh na entrada das telas e das
 * transições, impacto no título de trás, riser antes do número que conta,
 * tique nos itens que acendem. Sintetizados em src/sons.mjs, mixados abaixo
 * da voz; no máximo um efeito a cada 0,35 s.
 */
export function efeitosDaEdicao(camadas) {
  const ev = [];
  const TELA = new Set(["frase-impacto", "citacao", "pergaminho", "cartoes", "linha-do-tempo", "escada", "comparacao", "fluxo", "numero", "cifrao", "mapa", "fecho", "passos-foco", "grafico-linha", "palavra-gigante", "busca", "pilha-passos", "notebook", "ilustracao-traco", "chat", "material", "seguir", "ferramentas", "colagem", "jornal", "mapa-antigo", "censura", "cronologia"]);
  const CONTA = new Set(["numero", "progresso", "barras", "grafico-linha", "cifrao"]);
  for (const c of camadas) {
    if (["moldura-do-cartao", "legenda-destaque", "grade-azul", "fundo-colagem"].includes(c.peca)) continue;
    if (c.peca === "transicao") ev.push({ t: c.de + 0.05, som: "whoosh", volume: c.props?.tipo === "flash" ? 0.3 : 0.22 });
    else if (c.peca === "titulo-atras") {
      ev.push({ t: Math.max(0, c.de - 0.45), som: "riser", volume: 0.14 });
      ev.push({ t: c.de + 0.12, som: "impacto", volume: 0.28 });
    } else if (TELA.has(c.peca)) ev.push({ t: Math.max(0, c.de - 0.05), som: "whoosh", volume: 0.24 });
    else if (c.peca === "palavra-chave" || c.peca === "capitulo" || c.peca === "carimbo") ev.push({ t: c.de + 0.02, som: "impacto", volume: 0.18 });
    else ev.push({ t: c.de + 0.05, som: "pop", volume: 0.12 });
    if (CONTA.has(c.peca)) ev.push({ t: c.de + 0.4, som: "riser", volume: 0.1 });
    for (const e of c.eventos ?? []) ev.push({ t: e, som: "tique", volume: 0.16 });
  }
  ev.sort((a, b) => a.t - b.t);
  const saida = [];
  for (const e of ev) if (!saida.length || e.t - saida[saida.length - 1].t >= 0.35 || e.som === "impacto") saida.push(e);
  return saida;
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
      // Com o PALCO (03/10, segunda volta), a tela cheia é desenhada opaca
      // pelo Remotion: por baixo dela a gravação segue, e a entrada do palco
      // (íris, cortina de luz, zoom) revela a pessoa de verdade, não um fundo.
      if (p.tipo === "cheio" || (p.tipo === "grafico" && edicao.palco)) cheio(de, ate);
      else saida.push({ ...p, de, ate, k0: de - p.de });
    }
    t = Math.max(t, ate);
  }
  if (b - t > 1e-3) cheio(t, b);
  return saida.filter((s) => s.ate - s.de > 0.5 / 60);
}

/** O grafo de um lote. Devolve { entradas, grafo }. */
export function grafoDoLote(edicao, lote, ctx) {
  const { W, H, fps, escala, fundos, insercoes } = ctx;
  const dur = lote.ate - lote.de;
  // De que inserção veio cada entrada (índice do -i): quando o ffmpeg falha
  // citando "stream #N:0", é por aqui que a mídia culpada sai do lote (04/10).
  const origens = {};
  const segs = segmentosDoLote(edicao, lote.de, lote.ate);
  const entradas = [
    ["-ss", lote.de.toFixed(4), "-t", dur.toFixed(4), "-i", ctx.base],
    // -reinit_filter 0 (03/10, segunda volta): o Remotion grava o quadro
    // OPACO do palco em rgb24 e o transparente em rgba; a troca no meio da
    // lista reiniciava o grafo inteiro e travava o ffmpeg.
    ["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.lista],
  ];
  const nos = [];
  // O cartão usa a base DUAS vezes (03/10, terceira volta): uma marca o tempo do
  // fundo da marca, a outra é a pessoa no cartão (ver o plano "cartao" abaixo).
  // A foto da inserção e o fundo do gráfico também marcam o tempo pela base (uma vez);
  // só a inserção em VÍDEO tem relógio próprio.
  const usosDaBase = segs.reduce((n, s) => n + (s.tipo === "cheio" ? 1 : s.tipo === "cartao" ? 2 : s.tipo === "insercao" && insercoes[s.midia]?.tipo === "video" ? 0 : 1), 0);
  // As passadas a mais (03/10, segunda volta): atrás da pessoa, a máscara do vidro e a pessoa recortada.
  const iAtras = lote.listaAtras ? entradas.push(["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.listaAtras]) - 1 : -1;
  const iVidro = lote.listaVidro ? entradas.push(["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.listaVidro]) - 1 : -1;
  const iMatte = iAtras >= 0 && ctx.matte ? entradas.push(["-ss", lote.de.toFixed(4), "-t", dur.toFixed(4), "-i", ctx.matte]) - 1 : -1;
  // A PESSOA RECORTADA viaja como o ALFA da própria base: a câmera de cada
  // plano (zoom, empurrão) mexe na imagem e na máscara de uma vez só, e o
  // grafo não ganha uma segunda cadeia (a primeira versão, com a máscara em
  // paralelo, travou o ffmpeg na prova de 03/10).
  const comAlfa = iMatte >= 0;
  const FMT = comAlfa ? "yuva420p" : "yuv420p";
  if (comAlfa) {
    nos.push(`[${iMatte}:v]fps=${fps},scale=${W}:${H}:flags=bicubic,format=gray,lut=y='clip((val-16)*255/219,0,255)',setpts=PTS-STARTPTS[mm]`);
    nos.push(`[0:v]fps=${fps},scale=${W}:${H}:flags=bicubic,setsar=1,format=yuva420p,setpts=PTS-STARTPTS[b0a];[b0a][mm]alphamerge${usosDaBase > 1 ? `,split=${usosDaBase}` : ""}${usosDaBase ? Array.from({ length: usosDaBase }, (_, i) => `[b${i}]`).join("") : ",nullsink"}`);
  } else nos.push(`[0:v]fps=${fps},scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p,setpts=PTS-STARTPTS${usosDaBase > 1 ? `,split=${usosDaBase}` : ""}${usosDaBase ? Array.from({ length: usosDaBase }, (_, i) => `[b${i}]`).join("") : ",nullsink"}`);
  let ib = 0;
  // A IMAGEM PARADA (fundo, máscara, foto) entra como UM quadro só e é repetida
  // pelo overlay ou pelo alphamerge, com o tempo dado por um trecho da base
  // (03/10, terceira volta). Com `-loop 1` (ou o filtro `loop`) o ffmpeg gerava
  // os n quadros no começo do lote e eles esperavam a vez do plano na fila.
  const imagemExtra = (arquivo) => {
    const i = entradas.length;
    entradas.push(["-i", arquivo]);
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
        nos.push(`${ent},scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}:x='max(0,min(iw-iw/zoom,${(s.x ?? 0.5).toFixed(4)}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${(s.y ?? 0.4).toFixed(4)}*ih-ih/zoom/2))',setsar=1,format=${FMT}[${r}]`);
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
      const iF = imagemExtra(fundos[JSON.stringify(s.caixa)] ?? fundos.liso);
      const iM = imagemExtra(ctx.mascara(bw, bh));
      // O FUNDO E A MÁSCARA entram como UM quadro cada, repetidos pelo próprio
      // overlay e pelo alphamerge, e o TEMPO vem da gravação (um segundo trecho
      // da base, coberto pelo fundo). A versão com o fundo em laço gerava os
      // quadros todos no começo do lote e eles esperavam a vez do cartão na
      // fila do overlay: foi o que levou o lote a 2,8 a 7,4 GB (03/10, terceira volta).
      nos.push(`[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,format=yuv420p[ct${k}]`);
      nos.push(`[${iF}:v]scale=${W}:${H},format=yuv420p,setsar=1[cf${k}]`);
      nos.push(`[ct${k}][cf${k}]overlay=0:0,setsar=1[cb${k}]`);
      nos.push(`[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,crop=${cw}:${ch}:${x}:${y},scale=${bw}:${bh}:flags=bicubic,format=yuva420p[cv${k}]`);
      nos.push(`[${iM}:v]format=gray,scale=${bw}:${bh}[cm${k}]`);
      nos.push(`[cv${k}][cm${k}]alphamerge[ca${k}]`);
      nos.push(`[cb${k}][ca${k}]overlay=${bx}:${by}:shortest=1,format=yuv420p,setsar=1[${r}]`);
    } else if (s.tipo === "insercao" && insercoes[s.midia]) {
      const m = insercoes[s.midia];
      if (m.tipo === "video" && m.origem === "banco") {
        // O B-ROLL (03/10, terceira volta): o trecho limpo do arquivo (`inicio`),
        // reenquadrado para o formato (preenche e corta no centro), um empurrão
        // de 8% que nunca para, e a COR CASADA com a gravação (grade).
        const i = entradas.length;
        origens[i] = s.midia;
        // -reinit_filter 0 (04/10): a mídia de fora já vem normalizada
        // (normalizarMidia), e mesmo assim uma troca de propriedade no meio
        // (o laço do -stream_loop, um quadro com outra cor) não reinicia o grafo.
        entradas.push(["-ss", Number(m.inicio ?? 0).toFixed(3), "-stream_loop", "-1", "-t", (d + 0.2).toFixed(4), "-reinit_filter", "0", "-i", m.arquivo]);
        const W2 = PAR(W * 1.1);
        const H2 = PAR(H * 1.1);
        nos.push(`[${i}:v]fps=${fps},scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W2}:${H2},setsar=1,trim=duration=${d.toFixed(4)},setpts=PTS-STARTPTS${m.grade ? `,${m.grade}` : ""},zoompan=z='1+0.08*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      } else if (m.tipo === "video") {
        const i = entradas.length;
        origens[i] = s.midia;
        entradas.push(["-stream_loop", "-1", "-t", d.toFixed(4), "-reinit_filter", "0", "-i", m.arquivo]);
        // O empurrão por cima do vídeo (03/10, segunda volta): mesmo que o
        // Kling devolva a câmera quase parada, a inserção nunca fica imóvel.
        nos.push(`[${i}:v]fps=${fps},scale=${PAR(W * 1.12)}:${PAR(H * 1.12)}:force_original_aspect_ratio=increase:flags=bicubic,crop=${PAR(W * 1.12)}:${PAR(H * 1.12)},setsar=1,trim=duration=${d.toFixed(4)},setpts=PTS-STARTPTS,zoompan=z='1+0.1*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      } else {
        const i = imagemExtra(m.arquivo);
        origens[i] = s.midia;
        const W2 = PAR(W * 1.4);
        const H2 = PAR(H * 1.4);
        // Ken Burns lento (6%), do centro: a foto nunca fica parada. A foto é UM
        // quadro, repetido pelo overlay sobre o trecho da base (que dá o tempo);
        // o zoompan anda quadro a quadro com ela, sem gerar nada adiantado.
        nos.push(`[${i}:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W2}:${H2},format=yuv420p,setsar=1[fi${k}]`);
        nos.push(`[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,scale=${W2}:${H2}:flags=fast_bilinear,format=yuv420p,setsar=1[ft${k}]`);
        nos.push(`[ft${k}][fi${k}]overlay=0:0,zoompan=z='1+0.06*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      }
    } else {
      // "grafico" (e inserção que falhou): o fundo da marca; as camadas desenham o resto.
      const i = imagemExtra(fundos.liso);
      nos.push(`[${i}:v]scale=${W}:${H},format=yuv420p,setsar=1[fg${k}]`);
      nos.push(`[b${ib++}]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,format=yuv420p[gt${k}]`);
      nos.push(`[gt${k}][fg${k}]overlay=0:0,setsar=1,trim=end_frame=${n}[${r}]`);
    }
    // Com o alfa, todo plano entra no mesmo formato (o que não é câmera cheia fica opaco).
    if (comAlfa) {
      nos.push(`[${r}]format=yuva420p[${r}a]`);
      rotulos.push(`[${r}a]`);
    } else rotulos.push(`[${r}]`);
  });
  // ZOOM ATRAVÉS nas inserções (03/10, segunda volta): a câmera mergulha no
  // fim do plano anterior e sai de dentro da inserção (o flash da transição
  // esconde o corte). Uma expressão só, no tempo do lote.
  const bordasDeInsercao = segs
    .filter((s) => s.tipo === "insercao")
    .flatMap((s) => {
      const forca = insercoes[s.midia]?.origem === "banco" ? 0.18 : 0.55;
      return [s.de - lote.de, s.ate - lote.de].map((b) => ({ b, forca }));
    })
    .filter(({ b }) => b > 0.2 && b < dur - 0.2);
  const zoomAtraves = bordasDeInsercao.length
    ? `,zoompan=z='1+${bordasDeInsercao.map(({ b, forca }) => `${forca}*(between(it,${(b - 0.35).toFixed(3)},${b.toFixed(3)})*pow((it-${(b - 0.35).toFixed(3)})/0.35,2)+between(it,${b.toFixed(3)},${(b + 0.45).toFixed(3)})*pow(1-(it-${b.toFixed(3)})/0.45,2))`).join("+")}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1`
    : "";
  nos.push(`${rotulos.join("")}concat=n=${rotulos.length}:v=1:a=0,fps=${fps},setpts=PTS-STARTPTS${zoomAtraves},format=${FMT}[base0]`);
  // SEM `fps` nas listas das camadas (03/10, terceira volta): a camada parada é
  // um PNG com a duração do trecho, e o `fps` o expandia de uma vez em centenas
  // de quadros RGBA de 8 MB na fila do overlay; foi o que levou um lote de 60 s
  // a 7,4 GB e matou o completo de cmurtv2zg no worker. O overlay repete o
  // último quadro sozinho; a saída é a mesma (1800 quadros, conferido).
  const lista = (i, rot) => nos.push(`[${i}:v]format=rgba,scale=${W}:${H},setpts=PTS-STARTPTS[${rot}]`);
  lista(1, "ov");
  let atual = "base0";
  if (iAtras >= 0) {
    lista(iAtras, "atr");
    if (comAlfa) {
      // A pessoa recortada (a base com o alfa) vai POR CIMA do título de trás.
      nos.push(`[${atual}]split=2[bA][pess]`);
      nos.push(`[bA]format=yuv420p[bO];[bO][atr]overlay=0:0:eof_action=pass[x1]`);
      nos.push(`[x1][pess]overlay=0:0:shortest=1,format=yuv420p[x2]`);
      atual = "x2";
    } else {
      nos.push(`[${atual}][atr]overlay=0:0:eof_action=pass[x2]`);
      atual = "x2";
    }
  }
  if (iVidro >= 0) {
    // VIDRO DE VERDADE: a gravação desfocada (em 1/4, barato) entra só onde há caixa de vidro.
    lista(iVidro, "vid");
    nos.push(`[${atual}]split=2[v1][v2]`);
    nos.push(`[v2]scale=${PAR(W / 4)}:${PAR(H / 4)}:flags=bilinear,gblur=sigma=${(5 * Math.max(0.5, escala)).toFixed(1)},scale=${W}:${H}:flags=bicubic,eq=brightness=-0.035:saturation=1.12,format=yuva420p[bl]`);
    nos.push(`[vid]format=rgba,alphaextract,format=gray[vm];[bl][vm]alphamerge[bm]`);
    nos.push(`[v1][bm]overlay=0:0:shortest=1[x3]`);
    atual = "x3";
  }
  // GRÃO E VINHETA leves no fim (a textura de filme que tira o "digital chapado").
  nos.push(`[${atual}][ov]overlay=0:0:eof_action=pass:format=auto,vignette=angle=0.42,noise=c0s=5:c0f=t+u${lote.legenda ? `,subtitles=${lote.legenda}:fontsdir=fontes` : ""},format=yuv420p,trim=duration=${dur.toFixed(4)}[v]`);
  // OS FIOS DOS DECODIFICADORES (04/10): cada -i abre um decodificador com um
  // fio por núcleo, e o lote do sob medida chega a 13 entradas. Medido no WSL
  // com o lote 8 da prévia de cmurtv2zg: 186 fios sem teto, 73 com 2 na base
  // e 1 no resto; dois lotes juntos passavam de 370, e com o teto de processos
  // do contêiner o ffmpeg morria ao abrir o fio seguinte ("Failed to configure
  // output pad on auto_scale_N ... Resource temporarily unavailable", a falha
  // da prévia em produção; reproduzida com `ulimit -u 150`).
  return { entradas: entradas.flatMap((e, k) => ["-threads", k === 0 ? "2" : "1", ...e]), grafo: nos.join(";\n"), origens };
}

/**
 * A edição sem as mídias `ids`: o plano de inserção delas vira câmera cheia
 * (a pessoa), em vez do fundo liso da marca que a inserção ausente mostrava.
 */
export function semMidias(ed, ids) {
  if (!ids?.size) return ed;
  return { ...ed, planos: (ed.planos ?? []).map((p) => (p.tipo === "insercao" && ids.has(p.midia) ? { ...p, tipo: "cheio" } : p)) };
}

/** A lista de exibição das camadas recortada no lote, no formato do demuxer de concatenação. */
function listaDoLote(exibir, arquivos, a, b, dir = "camadas") {
  const linhas = ["ffconcat version 1.0"];
  let ultimo = null;
  for (const e of exibir) {
    const fim = e.de + e.seg;
    if (fim <= a + 1e-6 || e.de >= b - 1e-6) continue;
    const seg = Math.min(fim, b) - Math.max(e.de, a);
    if (seg <= 1e-6) continue;
    const arq = e.tipo === "vazio" ? `${dir}/vazio.png` : `${dir}/${arquivos[e.c]}`;
    linhas.push(`file '${arq}'`, `duration ${seg.toFixed(5)}`);
    ultimo = arq;
  }
  if (ultimo) linhas.push(`file '${ultimo}'`);
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 4a. a mídia de fora, normalizada ───────────────────────────────

/**
 * A MÍDIA DE FORA NORMALIZADA AO BAIXAR (04/10). Cada B-roll do Pixabay vem de
 * um autor, com resolução (1440x1080, 1920x1080...), fps (24 a 60), faixa de
 * cor e metadados próprios, e as fotos geradas chegam como JPEG 2752x1536 em
 * faixa cheia com nome de .png. Tudo isso era decodificado em tamanho cheio
 * dentro do lote e convertido no meio do grafo. Aqui cada B-roll, vídeo
 * gerado e foto vira um arquivo NOSSO, todo igual (e pequeno de decodificar): o tamanho do alvo (com folga para o empurrão),
 * yuv420p (rgb24 na foto), fps da base, SAR 1, cor bt709 faixa limitada, sem
 * áudio, sem rotação (aplicada) e sem metadado; o vídeo só no trecho usado. O
 * que não normaliza sai da edição (o plano vira câmera cheia), e o render segue.
 */
export async function normalizarMidia(m, { W, H, fps, segundos = 8 }) {
  const PARn = (v) => Math.max(2, Math.round(v / 2) * 2);
  if (m.tipo === "video") {
    const WN = PARn(W * 1.12);
    const HN = PARn(H * 1.12);
    const saida = m.arquivo.replace(/\.[a-z0-9]+$/i, "") + `-norm-${WN}x${HN}.mp4`;
    const dim = await ffprobe(m.arquivo);
    let inicio = Math.max(0, Number(m.inicio) || 0);
    if (!(dim.duracaoSec > 0.3)) throw new Error("vídeo sem duração");
    if (inicio > dim.duracaoSec - 1) inicio = 0;
    const dur = Math.max(1, Math.min(dim.duracaoSec - inicio, segundos + 1));
    await rodar(
      [
        "-ss", inicio.toFixed(3), "-t", dur.toFixed(3), "-i", m.arquivo,
        "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
        "-vf", `scale=${WN}:${HN}:force_original_aspect_ratio=increase:flags=bicubic,crop=${WN}:${HN},setsar=1,fps=${fps},format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-g", String(Math.max(1, Math.round(fps))), "-movflags", "+faststart",
        saida,
      ],
      { timeoutMs: 5 * 60_000 }
    );
    const conferido = await ffprobe(saida);
    if (!(conferido.duracaoSec > 0.3) || conferido.largura !== WN || conferido.altura !== HN) throw new Error(`normalizado saiu ${conferido.largura}x${conferido.altura} com ${conferido.duracaoSec}s`);
    return { ...m, arquivo: saida, inicio: 0 };
  }
  const WI = PARn(W * 1.4);
  const HI = PARn(H * 1.4);
  const saida = m.arquivo.replace(/\.[a-z0-9]+$/i, "") + `-norm-${WI}x${HI}.png`;
  await rodar(["-i", m.arquivo, "-map", "0:v:0", "-frames:v", "1", "-map_metadata", "-1", "-vf", `scale=${WI}:${HI}:force_original_aspect_ratio=increase:flags=bicubic,crop=${WI}:${HI},setsar=1,format=rgb24`, saida], { timeoutMs: 2 * 60_000 });
  if (!existsSync(saida)) throw new Error("foto não normalizou");
  return { ...m, arquivo: saida };
}

// ─────────────────────────────── 4b. a cor casada do B-roll ───────────────────────────────

/** A cor média (RGB 0 a 255) de um vídeo nos instantes pedidos, pelo ffmpeg reduzindo o quadro a 1 pixel. */
export async function corMedia(arquivo, instantes) {
  const somas = [0, 0, 0];
  let n = 0;
  for (const t of instantes) {
    const buf = await new Promise((ok, falha) => {
      const p = processoDoTrabalho(spawn("ffmpeg", ["-nostdin", "-v", "error", "-ss", Math.max(0, t).toFixed(3), "-i", arquivo, "-frames:v", "1", "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "ignore"] }));
      const pedacos = [];
      const relogio = setTimeout(() => p.kill("SIGKILL"), 60_000);
      p.stdout.on("data", (d) => pedacos.push(d));
      p.on("close", (c) => {
        clearTimeout(relogio);
        c === 0 ? ok(Buffer.concat(pedacos)) : falha(new Error(`ffmpeg ${c}`));
      });
      p.on("error", falha);
    });
    if (buf.length >= 3) {
      somas[0] += buf[0];
      somas[1] += buf[1];
      somas[2] += buf[2];
      n++;
    }
  }
  return n ? somas.map((x) => x / n) : null;
}

/**
 * O filtro que leva a cor do B-roll metade do caminho até a da gravação
 * (ganho por canal entre 0,85 e 1,18), com contraste 1,04 e saturação 0,9.
 * Sem medida, só o contraste e a saturação.
 */
export function gradeParaCasar(cor, alvo) {
  const eq = "eq=contrast=1.04:saturation=0.9:gamma=0.98";
  if (!cor || !alvo) return eq;
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  // Só a TINTA: a luz do B-roll fica (uma cena clara não vira escura).
  const k = lum(cor) / Math.max(1, lum(alvo));
  const ganho = [0, 1, 2].map((i) => {
    const g = (alvo[i] * k) / Math.max(8, cor[i]);
    return Math.min(1.18, Math.max(0.85, 1 + 0.5 * (g - 1)));
  });
  return `colorchannelmixer=rr=${ganho[0].toFixed(3)}:gg=${ganho[1].toFixed(3)}:bb=${ganho[2].toFixed(3)},${eq}`;
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
    const q = pedido.trecho.quadro;
    const emendado = q ? join(pasta, "trecho.mp4") : base;
    await prepararTrecho(original, emendado, pedido.trecho.inicio, pedido.trecho.duracao, pedido.trecho.manter, pedido.trecho.pessoa ?? null);
    await rm(original, { force: true }).catch(() => {});
    // O QUADRO 9:16 do corte (fração da gravação, o app decide em
    // lib/media/editor-sob-medida/corte.ts): a gravação deitada vira a faixa em
    // pé em volta da pessoa. O rosto que a edição segue já vem nesse quadro.
    if (q) {
      const par = (n) => `floor(${n}/2)*2`;
      await rodar([
        "-i", emendado,
        "-vf", `crop=${par(`iw*${Number(q.w).toFixed(5)}`)}:${par(`ih*${Number(q.h).toFixed(5)}`)}:${par(`iw*${Number(q.x).toFixed(5)}`)}:${par(`ih*${Number(q.y).toFixed(5)}`)},setsar=1`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "copy", base,
      ]);
      await rm(emendado, { force: true }).catch(() => {});
    }
  } else await baixar(pedido.completoUrl, base);
  const dim = await ffprobe(base);
  const fps = fpsDe(base);
  const W = PAR(ed.largura * escala);
  const H = PAR(ed.altura * escala);
  if (Math.abs(dim.largura / dim.altura / (ed.largura / ed.altura) - 1) > 0.03) throw new Error(`base ${dim.largura}x${dim.altura} com edição ${ed.largura}x${ed.altura}: proporções diferentes`);
  const duracao = Math.min(ed.duracao, dim.duracaoSec);
  marcar("base");

  // As inserções geradas e o B-roll, baixados e normalizados.
  const insercoes = {};
  const midiasTiradas = [];
  for (const [id, m] of Object.entries(ed.insercoes ?? {})) {
    if (!m?.url) continue;
    const ext = m.tipo === "video" ? "mp4" : (m.url.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] ?? "jpg");
    const arq = join(pasta, `insercao-${id.replace(/[^a-z0-9-]/gi, "")}.${ext}`);
    try {
      if (!existsSync(arq)) {
        if (/^https?:/i.test(m.url)) await baixar(m.url, arq);
        else await copyFile(m.url, arq);
      }
      const usado = (ed.planos ?? []).filter((p) => p.tipo === "insercao" && p.midia === id).reduce((mx, p) => Math.max(mx, p.ate - p.de), 0);
      insercoes[id] = await normalizarMidia({ tipo: m.tipo, arquivo: arq, origem: m.origem ?? null, inicio: Number(m.inicio) || 0 }, { W, H, fps, segundos: Math.max(3, usado) });
    } catch (e) {
      delete insercoes[id];
      midiasTiradas.push(`${id}: ${String(e?.message ?? e).slice(-200)}`);
      console.warn(`[sob-medida] inserção ${id} fora da edição (não baixou ou não normalizou): ${e?.message ?? e}`);
    }
  }
  // A COR CASADA (03/10, terceira volta): o B-roll de banco vem com a cor do
  // autor; aqui ele anda metade do caminho até a cor média da gravação, com o
  // contraste e a saturação um pouco abaixo (o "look" do resto do vídeo).
  const brolls = Object.values(insercoes).filter((m) => m.origem === "banco" && m.tipo === "video");
  if (brolls.length) {
    const corDaBase = await corMedia(base, [0.2, 0.5, 0.8].map((f) => f * Math.min(ed.duracao, dim.duracaoSec))).catch(() => null);
    for (const m of brolls) {
      const cor = await corMedia(m.arquivo, [m.inicio + 0.3, m.inicio + 1.2]).catch(() => null);
      m.grade = gradeParaCasar(cor, corDaBase);
    }
  }
  marcar("insercoes");

  const camadas = await renderizarCamadas({ ...ed, duracao }, pasta, escala, (p) => aoProgresso?.(0.6 * p));
  tempos.quadrosDeCamada = camadas.quadros;
  tempos.quadrosDoVideo = Math.round(duracao * ed.fps);
  tempos.passadas = Object.fromEntries(Object.entries(camadas.passadas).map(([k, v]) => [k, v.quadros]));
  marcar("camadas");
  // A pessoa recortada, só se há peça atrás dela.
  const matte = camadas.passadas.atras ? await matteDaPessoa(base, pasta, duracao, fps, camadas.passadas.atras.intervalos).catch(() => null) : null;
  tempos.recorte = Boolean(matte);
  if (camadas.passadas.atras) marcar("recorte");

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
  const passo = Math.round((escala < 1 ? LOTE_SEG_PREVIA : LOTE_SEG_FINAL) * fps) / fps;
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
  // A MEMÓRIA (03/10, terceira volta): o lote de 30 s em 1080p segurou até 1,2 GB
  // de ffmpeg na medida local; conta 1,5 GB por lote (proporcional aos pixels e à duração).
  const MB_POR_LOTE = Math.max(400, Math.round(1500 * ((W * H) / (1920 * 1080)) * (passo / 30)));
  const renderLote = async (lote, i) => {
    lote.lista = `lista-${i}.txt`;
    const { frente, atras, vidro } = camadas.passadas;
    await writeFile(join(pasta, lote.lista), listaDoLote(frente.exibir, frente.arquivos, lote.de, lote.ate, frente.nomeDir), "utf8");
    // As passadas a mais entram no lote só se têm camada dentro dele.
    const temNoLote = (ps) => ps && ps.intervalos.some(([a, b]) => b > lote.de && a < lote.ate);
    if (temNoLote(atras) && !lote.simples) {
      lote.listaAtras = `lista-atras-${i}.txt`;
      await writeFile(join(pasta, lote.listaAtras), listaDoLote(atras.exibir, atras.arquivos, lote.de, lote.ate, atras.nomeDir), "utf8");
    }
    if (temNoLote(vidro) && !lote.simples) {
      lote.listaVidro = `lista-vidro-${i}.txt`;
      await writeFile(join(pasta, lote.listaVidro), listaDoLote(vidro.exibir, vidro.arquivos, lote.de, lote.ate, vidro.nomeDir), "utf8");
    }
    if (comLegenda) {
      lote.legenda = `legenda-${i}.ass`;
      await writeFile(join(pasta, lote.legenda), legendaSobMedida(ed, W, H, lote.de, lote.ate - lote.de), "utf8");
    }
    // As mídias que ficaram fora (não normalizaram, ou quebraram este lote) viram câmera cheia.
    const fora = new Set([...Object.keys(ed.insercoes ?? {}).filter((id) => !insercoes[id]), ...(lote.ruins ?? [])]);
    const insercoesDoLote = Object.fromEntries(Object.entries(insercoes).filter(([id]) => !fora.has(id)));
    const { entradas, grafo, origens } = grafoDoLote(semMidias(ed, fora), lote, { W, H, fps, escala, fundos: camadas.fundos, insercoes: insercoesDoLote, base, mascara, matte });
    lote.origens = origens;
    await writeFile(join(pasta, `grafo-${i}.txt`), grafo, "utf8");
    await writeFile(join(pasta, `entradas-${i}.json`), JSON.stringify(entradas), "utf8");
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
    return saida;
  };
  /**
   * Um lote com a guarda de memória: só começa com memória para ele; se o
   * ffmpeg morrer por SINAL (o OOM do contêiner), registra o sinal, espera a
   * memória voltar e refaz o lote em DUAS METADES, uma depois da outra (até
   * dois níveis, lotes de 15 s), emendadas no mesmo arquivo. Outro erro
   * (04/10): falta de recurso refaz igual uma vez; depois sai a mídia de fora
   * culpada (ou todas as do lote); sem mídia, sai o que vai atrás e o vidro.
   * Só então sobe.
   */
  const fazerLote = async (lote, i, nivel = 0) => {
    const nome = String(i);
    if (!(await esperarMemoria(MB_POR_LOTE, { ateMs: 10 * 60_000, rotulo: `lote ${nome}` }))) console.warn(`[sob-medida] lote ${nome} começa com ${memoriaLivreMb()} MB livres (pedia ${MB_POR_LOTE})`);
    try {
      return await renderLote(lote, nome);
    } catch (e) {
      if (trabalhoCancelado()) throw e;
      const dur = lote.ate - lote.de;
      if (!e?.sinal) {
        // A MÍDIA QUE QUEBROU SAI E O LOTE SEGUE (04/10): o ffmpeg diz o
        // "stream #N" que falhou; sendo uma inserção, ela sai deste lote (o
        // plano vira câmera cheia) e o lote é refeito. Sem culpada achada,
        // saem todas as mídias de fora do lote, de uma vez.
        const ruins = lote.ruins ?? new Set();
        // Falta de recurso passageira (fios, memória): o mesmo lote, igual, mais uma vez.
        if (/Resource temporarily unavailable|Cannot allocate memory/i.test(String(e?.message)) && !lote.repetido) {
          midiasTiradas.push(`lote ${nome}: refeito por falta de recurso`);
          console.warn(`[sob-medida] lote ${nome} sem recurso (${memoriaLivreMb()} MB livres); refaz igual`);
          await new Promise((r) => setTimeout(r, 5_000));
          return await fazerLote({ de: lote.de, ate: lote.ate, ruins, repetido: true }, `${nome}r`, nivel);
        }
        const n = Number((String(e?.message ?? "").match(/stream #(\d+):\d+/i) ?? [])[1]);
        const culpada = Number.isFinite(n) ? lote.origens?.[n] : null;
        const doLote = [...new Set(Object.values(lote.origens ?? {}))].filter((id) => !ruins.has(id));
        const tirar = culpada && !ruins.has(culpada) ? [culpada] : doLote;
        if (!tirar.length) {
          // Sem mídia de fora para tirar: o último recurso é o lote SÓ com a
          // passada da frente (sem o título atrás da pessoa e sem o vidro).
          if (!lote.simples && (lote.listaAtras || lote.listaVidro)) {
            midiasTiradas.push(`lote ${nome}: sem as passadas de trás e do vidro (${String(e?.message ?? e).replace(/\s+/g, " ").slice(-160)})`);
            console.warn(`[sob-medida] lote ${nome} falhou sem mídia culpada; refaz só com a frente`);
            return await fazerLote({ de: lote.de, ate: lote.ate, ruins, repetido: lote.repetido, simples: true }, `${nome}s`, nivel);
          }
          throw e;
        }
        midiasTiradas.push(`lote ${nome}: ${tirar.join(", ")} (${String(e?.message ?? e).replace(/\s+/g, " ").slice(-160)})`);
        console.warn(`[sob-medida] lote ${nome} falhou; refaz sem ${tirar.join(", ")}`);
        return await fazerLote({ de: lote.de, ate: lote.ate, ruins: new Set([...ruins, ...tirar]), repetido: lote.repetido, simples: lote.simples }, `${nome}m`, nivel);
      }
      if (nivel >= 2 || dur < 8) throw e;
      sinais.push(`lote ${nome} (${dur.toFixed(0)} s) morto por ${e.sinal} com ${memoriaLivreMb()} MB livres`);
      console.warn(`[sob-medida] ${sinais.at(-1)}; refaz em duas metades`);
      await esperarMemoria(Math.round(MB_POR_LOTE * 1.2), { ateMs: 10 * 60_000, rotulo: `lote ${nome} de novo` });
      const meio = +(Math.round(((lote.de + lote.ate) / 2) * fps) / fps).toFixed(5);
      const a = await fazerLote({ de: lote.de, ate: meio, ruins: lote.ruins }, `${nome}a`, nivel + 1);
      const b = await fazerLote({ de: meio, ate: lote.ate, ruins: lote.ruins }, `${nome}b`, nivel + 1);
      const saida = join(pasta, `lote-${nome.padStart(3, "0")}-junto.mp4`);
      await emendar([a, b], saida, pasta);
      await rm(a, { force: true }).catch(() => {});
      await rm(b, { force: true }).catch(() => {});
      return saida;
    }
  };
  const sinais = [];
  // Lotes em paralelo só com memória para eles (o padrão continua 2).
  const pedidosJuntos = Math.max(1, Number(process.env.SOB_MEDIDA_LOTES ?? 2));
  const livreNoInicio = memoriaLivreMb();
  const juntos = Math.max(1, Math.min(pedidosJuntos, Math.floor((livreNoInicio - 600) / MB_POR_LOTE)));
  tempos.memoria = { livreNoInicioMb: livreNoInicio, mbPorLote: MB_POR_LOTE, lotesJuntos: juntos };
  const fila = lotes.map((l, i) => [l, i]);
  const res = new Array(lotes.length);
  // O PRIMEIRO ERRO PARA A PISCINA (04/10): antes o outro laço seguia
  // pegando lotes enquanto o erro já subia e a pasta era apagada por baixo dele.
  let primeiroErro = null;
  await Promise.all(
    Array.from({ length: Math.min(juntos, lotes.length) }, async () => {
      while (fila.length && !primeiroErro && !trabalhoCancelado()) {
        const [l, i] = fila.shift();
        try {
          res[i] = await fazerLote(l, i);
        } catch (e) {
          primeiroErro ??= e;
          return;
        }
        feitos++;
        aoProgresso?.(0.6 + 0.35 * (feitos / lotes.length));
      }
    })
  );
  if (primeiroErro) throw primeiroErro;
  if (trabalhoCancelado()) throw new Error("render cancelado pelo prazo do trabalho");
  partes.push(...res);
  if (sinais.length) tempos.sinais = sinais;
  if (midiasTiradas.length) tempos.midiasTiradas = midiasTiradas.slice(0, 20);
  marcar("lotes");

  const soVideo = join(pasta, "so-video.mp4");
  if (partes.length === 1) await copyFile(partes[0], soVideo);
  else await emendar(partes, soVideo, pasta);
  let saida = join(pasta, escala < 1 ? "previa.mp4" : "sob-medida.mp4");
  await rodar(["-i", soVideo, "-i", base, "-map", "0:v", "-map", "1:a?", "-t", duracao.toFixed(4), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida], { cwd: pasta });
  marcar("emenda");

  // A TRILHA do projeto no corte (03/10), só no final: o mesmo `misturarAudio`
  // do /montar (src/sons.mjs), no volume do estilo e abaixando sob a voz.
  // Falhar aqui não derruba nada: o corte sai com a voz só.
  // O SOM DAS PEÇAS (03/10, segunda volta) vai junto, com ou sem trilha:
  // whoosh, impacto, riser e tique no instante de cada entrada, abaixo da voz.
  const eventos = escala >= 1 && pedido.efeitos !== false ? efeitosDaEdicao(camadas.todas) : [];
  tempos.efeitos = eventos.length;
  if (escala >= 1 && (pedido.trilha?.url || eventos.length)) {
    try {
      let trilha = null;
      if (pedido.trilha?.url) {
        const arquivoDaTrilha = join(pasta, "trilha" + (String(pedido.trilha.url).match(/\.[a-z0-9]{2,4}(?=\?|$)/i)?.[0] ?? ".mp3"));
        await baixar(pedido.trilha.url, arquivoDaTrilha);
        trilha = { arquivo: arquivoDaTrilha, volume: pedido.trilha.volume, abaixar: pedido.trilha.abaixar };
      }
      const { misturarAudio } = await import("./sons.mjs");
      saida = await misturarAudio(saida, { eventos, trilha }, duracao, pasta, join(pasta, "sob-medida-com-trilha.mp4"));
      tempos.trilha = Boolean(trilha);
    } catch (e) {
      console.warn(`[sob-medida] trilha e efeitos falharam, segue sem: ${e?.message ?? e}`);
    }
    marcar("trilha");
  }

  // O GANCHO do corte curto (03/10, o mesmo do /montar): a frase forte que o
  // cliente aprovou, tirada do corte já editado, toca antes do começo com
  // zoom, flash e o texto de soco. Falhar aqui não derruba a edição.
  const g = pedido.gancho;
  let ganchoSeg = 0;
  if (escala >= 1 && g && Number.isFinite(g.inicio) && Number.isFinite(g.fim) && g.fim - g.inicio >= 1.5 && g.fim <= duracao + 0.5) {
    try {
      const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
      const abertura = await montarAberturaDeImpacto(saida, [{ inicio: g.inicio, fim: g.fim, soco: g.soco }], pasta, {
        familia: g.familia ?? "sobrio",
        acento: g.acento ?? ed.tema?.acento,
        foco: { x: 0.5, y: 0.4 },
        passagem: g.passagem ?? null,
      });
      if (abertura) {
        const comGancho = join(pasta, "sob-medida-com-gancho.mp4");
        await prefixarAbertura(abertura, saida, comGancho, pasta, { copiar: false });
        saida = comGancho;
        ganchoSeg = (await ffprobe(abertura).catch(() => null))?.duracaoSec ?? 0;
      }
    } catch (e) {
      console.warn(`[sob-medida] gancho falhou, segue sem: ${e?.message ?? e}`);
    }
    marcar("gancho");
  }

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
        // Por cópia: os lotes saem com os mesmos parâmetros da abertura (fps da base,
        // x264 veryfast crf 18, GOP 60), como no completo editado; recodificar
        // 20 min só para emendar custava 5 min (prova de 03/10).
        await prefixarAbertura(abertura, saida, final, pasta, { copiar: true });
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
    for (const ps of Object.values(camadas.passadas)) await rm(ps.dirQ, { recursive: true, force: true }).catch(() => {});
    for (const p of partes) await rm(p, { force: true }).catch(() => {});
  }
  tempos.total = +((Date.now() - t0) / 1000).toFixed(1);
  return { arquivo: saida, tempos, aberturaSeg, ganchoSeg, largura: W, altura: H, fps };
}

export { basename };
