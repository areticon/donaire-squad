import { spawn } from "node:child_process";

/**
 * A BATIDA DA TRILHA (01/10/2026): os cortes seguem a música.
 *
 * O vídeo de referência do Bruno (edição por IA) manda os cortes caírem na
 * batida. Aqui: o andamento e a FASE da trilha do projeto (envelope de ataques
 * do áudio, autocorrelação entre 60 e 180 batidas por minuto, e a fase que
 * mais coincide com os ataques), e o encaixe da montagem: o corte de cena e o
 * punch que estão a até 0,12 s de uma batida vão para ela. A fala nunca muda
 * (o áudio do narrador é uma trilha só); só a imagem troca um pouco antes ou
 * depois. Trilha calma demais (confiança baixa) não manda em nada.
 *
 * A trilha entra no corte a partir do zero e em laço (worker/src/ffmpeg.mjs,
 * cadeiaDeAudio), então a batida da trilha é a batida do corte.
 */

const TAXA = 11025;
const HOP = 256;

function pcm(arquivo, maxSeg) {
  return new Promise((resolver, rejeitar) => {
    const p = spawn("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-t", String(maxSeg), "-i", arquivo, "-vn", "-ac", "1", "-ar", String(TAXA), "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const partes = [];
    p.stdout.on("data", (d) => partes.push(d));
    p.on("error", rejeitar);
    p.on("close", (c) => {
      if (c !== 0) return rejeitar(new Error(`ffmpeg saiu com ${c} ao ler a trilha`));
      const b = Buffer.concat(partes);
      const x = new Float32Array(Math.floor(b.length / 2));
      for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(i * 2) / 32768;
      resolver(x);
    });
  });
}

/**
 * Envelope de ataques: subida da energia (log) a cada HOP amostras, alisado
 * por uma janela curta. Sem o alisamento, o período de 0,5 s caía entre dois
 * quadros do envelope (21,5) e o pico do andamento certo se perdia na
 * autocorrelação de período inteiro (prova de 01/10).
 */
function envelope(x) {
  const bruto = [];
  let anterior = 0;
  for (let i = 0; i + HOP <= x.length; i += HOP) {
    let s = 0;
    for (let k = i; k < i + HOP; k++) s += x[k] * x[k];
    const e = Math.log(1e-9 + s / HOP);
    bruto.push(Math.max(0, e - anterior));
    anterior = e;
  }
  const pesos = [0.06, 0.24, 0.4, 0.24, 0.06];
  return bruto.map((_, i) => pesos.reduce((s, w, k) => s + w * (bruto[i + k - 2] ?? 0), 0));
}

/**
 * As batidas de uma trilha (segundos, desde o começo dela), o andamento e a
 * confiança. `duracao`: até onde repetir a grade (a trilha toca em laço).
 */
export async function batidasDaTrilha(arquivo, duracao, { maxSeg = 120 } = {}) {
  const x = await pcm(arquivo, maxSeg);
  const env = envelope(x);
  const qps = TAXA / HOP;
  if (env.length < qps * 8) return { bpm: null, confianca: 0, batidas: [] };
  const media = env.reduce((a, b) => a + b, 0) / env.length;
  const c = env.map((v) => v - media);
  let melhor = { periodo: 0, valor: -Infinity, nota: -Infinity };
  let soma = 0;
  let n = 0;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * qps;
    const l = Math.round(lag);
    let s = 0;
    for (let i = l; i < c.length; i++) s += c[i] * c[i - l];
    soma += Math.max(0, s);
    n++;
    // O ERRO DE OITAVA (prova de 01/10: uma trilha a 120 saía 60): a
    // autocorrelação também acerta no dobro do período. Um peso suave em volta
    // de 120 batidas por minuto, como nos detectores de batida clássicos,
    // desempata a favor do andamento que se sente.
    const nota = s * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    if (nota > melhor.nota) melhor = { periodo: lag, valor: s, nota };
  }
  const confianca = Math.max(0, melhor.valor) / (soma / n || 1);
  if (!melhor.periodo) return { bpm: null, confianca: 0, batidas: [] };
  // A fase: o deslocamento dentro de um período que soma mais ataques na grade.
  const passos = Math.max(1, Math.round(melhor.periodo));
  let fase = 0;
  let maior = -Infinity;
  for (let f = 0; f < passos; f++) {
    let s = 0;
    for (let t = f; t < env.length; t += melhor.periodo) s += env[Math.round(t)] ?? 0;
    if (s > maior) {
      maior = s;
      fase = f;
    }
  }
  const periodoSeg = melhor.periodo / qps;
  const faseSeg = fase / qps;
  const batidas = [];
  for (let t = faseSeg; t <= duracao; t += periodoSeg) batidas.push(+t.toFixed(3));
  return { bpm: +(60 / periodoSeg).toFixed(1), confianca: +confianca.toFixed(2), batidas };
}

/** A batida mais perto de t, se estiver a até `tol` segundos. */
function batidaPerto(batidas, t, tol) {
  let lo = 0;
  let hi = batidas.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (batidas[m] < t) lo = m + 1;
    else hi = m;
  }
  const candidatas = [batidas[lo - 1], batidas[lo]].filter((b) => typeof b === "number");
  const b = candidatas.sort((a, c) => Math.abs(a - t) - Math.abs(c - t))[0];
  return b !== undefined && Math.abs(b - t) <= tol ? b : null;
}

/**
 * Encaixa os cortes de cena e os punches da montagem na batida, sem mexer na
 * fala. A cena não fica com menos de 0,6 s e o primeiro corte (0) não muda.
 * Devolve quantos foram encaixados.
 */
export function encaixarNaBatida(m, batidas, { tol = 0.12, confianca = 0, minimo = 1.3 } = {}) {
  if (!batidas?.length || confianca < minimo) return { cortes: 0, punches: 0, movidos: [] };
  let cortes = 0;
  let punches = 0;
  // Os instantes que mudaram (antigo, novo): o som de passagem anda junto.
  const movidos = [];
  for (let i = 1; i < m.cenas.length; i++) {
    const c = m.cenas[i];
    const antes = m.cenas[i - 1];
    const b = batidaPerto(batidas, c.inicio, tol);
    if (b === null || b === c.inicio) continue;
    if (b - antes.inicio < 0.6 || c.fim - b < 0.6) continue;
    movidos.push([c.inicio, b]);
    antes.fim = b;
    c.inicio = b;
    cortes++;
  }
  for (const c of m.cenas) {
    if (c.movimento !== "punch" || typeof c.movimentoEm !== "number") continue;
    const b = batidaPerto(batidas, c.movimentoEm, tol);
    if (b === null || b < c.inicio || b >= c.fim) continue;
    movidos.push([c.movimentoEm, b]);
    c.movimentoEm = b;
    punches++;
  }
  return { cortes, punches, movidos };
}

/** O som que tocava num instante movido vai junto (até 0,2 s de distância). */
export function acompanharSons(sons, movidos) {
  if (!sons?.length || !movidos?.length) return sons;
  return sons.map((s) => {
    const m = movidos.find(([antigo]) => Math.abs(s.t - antigo) <= 0.2);
    return m ? { ...s, t: Math.max(0, +(s.t + (m[1] - m[0])).toFixed(3)) } : s;
  });
}
