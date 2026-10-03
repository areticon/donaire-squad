import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rodar } from "./ffmpeg.mjs";

/**
 * O SOUND DESIGN DA MONTAGEM (01/10/2026).
 *
 * Os efeitos são SINTETIZADOS aqui, em código (decisão do Bruno: nada de
 * biblioteca de terceiro com licença a conferir): whoosh, pop, impacto, ding,
 * tique, papel, riser, marcador e clique. O app manda a lista de eventos já
 * pronta (lib/media/sons-da-montagem.ts, no `montagem.sons`), aqui a trilha de
 * efeitos inteira vira UM arquivo WAV (somada em memória, sem um filtro do
 * ffmpeg por evento) e entra por baixo da voz, com o vídeo copiado.
 */

const TAXA = 48000;

/** Ruído branco determinístico (o mesmo efeito soa igual em toda montagem). */
function ruido(semente = 1) {
  let s = semente >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** Passa-baixa de um polo, para dar cor ao ruído. */
function passaBaixa(x, corte) {
  const a = Math.exp((-2 * Math.PI * corte) / TAXA);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y;
    x[i] = y;
  }
  return x;
}

function amostras(seg) {
  return new Float32Array(Math.max(1, Math.round(seg * TAXA)));
}

const SINTESE = {
  // Ruído filtrado que sobe e desce, com o filtro abrindo no meio.
  whoosh() {
    const n = amostras(0.38);
    const r = ruido(7);
    for (let i = 0; i < n.length; i++) {
      const p = i / n.length;
      n[i] = r() * Math.sin(Math.PI * p) ** 2;
    }
    const baixo = passaBaixa(Float32Array.from(n), 900);
    const alto = passaBaixa(Float32Array.from(n), 3500);
    for (let i = 0; i < n.length; i++) {
      const p = i / n.length;
      n[i] = (baixo[i] * (1 - p) + alto[i] * p) * 1.6;
    }
    return n;
  },
  // Bolha curta: seno que cai de tom.
  pop() {
    const n = amostras(0.11);
    let fase = 0;
    for (let i = 0; i < n.length; i++) {
      const t = i / TAXA;
      const f = 900 * Math.exp(-t * 28) + 260;
      fase += (2 * Math.PI * f) / TAXA;
      n[i] = Math.sin(fase) * Math.exp(-t * 32) * 0.9;
    }
    return n;
  },
  // Batida grave com um estalo na frente.
  impacto() {
    const n = amostras(0.45);
    const r = ruido(3);
    let fase = 0;
    for (let i = 0; i < n.length; i++) {
      const t = i / TAXA;
      const f = 110 * Math.exp(-t * 9) + 42;
      fase += (2 * Math.PI * f) / TAXA;
      n[i] = Math.sin(fase) * Math.exp(-t * 7) + r() * Math.exp(-t * 90) * 0.5;
    }
    return n;
  },
  // Sino curto: duas parciais.
  ding() {
    const n = amostras(0.7);
    for (let i = 0; i < n.length; i++) {
      const t = i / TAXA;
      n[i] = (Math.sin(2 * Math.PI * 1320 * t) * 0.6 + Math.sin(2 * Math.PI * 2640 * t) * 0.2) * Math.exp(-t * 6);
    }
    return n;
  },
  tique() {
    const n = amostras(0.03);
    const r = ruido(11);
    for (let i = 0; i < n.length; i++) n[i] = r() * Math.exp(-(i / TAXA) * 260);
    return passaBaixa(n, 5000);
  },
  clique() {
    const n = amostras(0.04);
    for (let i = 0; i < n.length; i++) {
      const t = i / TAXA;
      n[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 180) * 0.5;
    }
    return n;
  },
  // Papel: ruído em faixa média com crepitar.
  papel() {
    const n = amostras(0.28);
    const r = ruido(5);
    for (let i = 0; i < n.length; i++) {
      const p = i / n.length;
      const crepita = r() > 0.6 ? 1 : 0.35;
      n[i] = r() * crepita * Math.sin(Math.PI * p);
    }
    return passaBaixa(n, 2600);
  },
  // Subida curta antes da revelação.
  riser() {
    const n = amostras(0.6);
    const r = ruido(9);
    let fase = 0;
    for (let i = 0; i < n.length; i++) {
      const p = i / n.length;
      fase += (2 * Math.PI * (200 + 900 * p * p)) / TAXA;
      n[i] = (Math.sin(fase) * 0.4 + r() * 0.3) * p * p;
    }
    return n;
  },
  // Risco de marcador: ruído agudo curto, áspero.
  marcador() {
    const n = amostras(0.2);
    const r = ruido(13);
    for (let i = 0; i < n.length; i++) {
      const p = i / n.length;
      n[i] = r() * (0.6 + 0.4 * Math.sin(p * 40)) * Math.sin(Math.PI * p);
    }
    return passaBaixa(n, 6000);
  },
};

const cache = new Map();
function efeito(nome) {
  if (!cache.has(nome)) {
    const f = SINTESE[nome];
    cache.set(nome, f ? f() : null);
  }
  return cache.get(nome);
}

/** Float32 mono em WAV PCM 16 bits. */
function wav(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(TAXA, 24);
  b.writeUInt32LE(TAXA * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}

/** A trilha de efeitos do vídeo inteiro: cada evento somado no seu instante. */
export function trilhaDeEfeitos(eventos, duracao) {
  const x = new Float32Array(Math.ceil(duracao * TAXA) + TAXA);
  for (const e of eventos ?? []) {
    const s = efeito(e.som);
    if (!s || !(e.t >= 0)) continue;
    const ini = Math.round(e.t * TAXA);
    const v = Math.max(0, Math.min(1, e.volume ?? 0.5));
    for (let i = 0; i < s.length && ini + i < x.length; i++) x[ini + i] += s[i] * v;
  }
  // Teto suave: soma que estoura vira saturação macia, não estalo.
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i]);
  return wav(x);
}

/**
 * Mistura a trilha de efeitos no vídeo (o vídeo é copiado; o áudio, refeito).
 * Sem eventos, não faz nada e devolve o próprio arquivo.
 */
export async function misturarEfeitos(video, eventos, duracao, pasta, saida) {
  return misturarAudio(video, { eventos }, duracao, pasta, saida);
}

/**
 * A voz, a TRILHA do projeto e os efeitos (01/10). A montagem do corte nasce
 * da gravação limpa, sem a música que o corte simples tinha (a trilha ficava
 * no corte simples e sumia no montado); aqui ela volta, do mesmo jeito do
 * corte simples (worker/src/ffmpeg.mjs, cadeiaDeAudio): no volume do estilo,
 * abaixando sob a voz pelo sidechain, com fade na entrada e na saída, em laço.
 * `trilha`: { arquivo, volume, abaixar } ou null.
 */
export async function misturarAudio(video, { eventos = [], trilha = null } = {}, duracao, pasta, saida) {
  if (!eventos?.length && !trilha?.arquivo) return video;
  const efeitos = join(pasta, "efeitos.wav");
  await writeFile(efeitos, trilhaDeEfeitos(eventos, duracao));
  // A mesma taxa e os mesmos canais do áudio de entrada: o completo depois
  // recebe a abertura EMENDADA POR CÓPIA, que exige parâmetros iguais.
  const sonda = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels", "-of", "csv=p=0", video], { encoding: "utf8" });
  const [taxa, canais] = String(sonda.stdout ?? "").trim().split(",").map(Number);
  if (!(taxa > 0)) throw new Error("o vídeo não tem áudio para misturar os efeitos");
  const layout = canais === 1 ? "mono" : "stereo";
  const fmt = `aresample=${taxa},aformat=sample_fmts=fltp:channel_layouts=${layout}`;
  let grafo;
  const entradas = ["-i", video, "-i", efeitos];
  if (trilha?.arquivo) {
    entradas.push("-stream_loop", "-1", "-i", trilha.arquivo);
    const volume = Math.max(0.05, Math.min(0.6, trilha.volume ?? 0.22));
    const razao = Math.max(2, Math.min(20, 1 / Math.max(0.05, 1 - (trilha.abaixar ?? 0.55))));
    const fimDoFade = Math.max(0, duracao - 1).toFixed(3);
    grafo =
      `[0:a]${fmt},asplit=2[voz][vozLado];` +
      `[2:a]atrim=0:${duracao.toFixed(3)},asetpts=PTS-STARTPTS,${fmt},volume=${volume.toFixed(2)},afade=t=in:st=0:d=0.6,afade=t=out:st=${fimDoFade}:d=1[tr];` +
      `[tr][vozLado]sidechaincompress=threshold=0.02:ratio=${razao.toFixed(1)}:attack=25:release=400[trBaixa];` +
      `[1:a]${fmt}[ef];` +
      `[voz][trBaixa][ef]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[a]`;
  } else {
    grafo = `[0:a]${fmt}[voz];[1:a]${fmt}[ef];[voz][ef]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
  }
  await rodar(
    [
      ...entradas,
      "-filter_complex", grafo,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", String(taxa), "-ac", String(canais > 0 ? canais : 2), "-t", duracao.toFixed(3), "-movflags", "+faststart", saida,
    ],
    { cwd: pasta }
  );
  return saida;
}
