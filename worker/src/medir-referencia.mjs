import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A MEDIDA DE UM VÍDEO DE REFERÊNCIA DO NICHO (01/10/2026).
 *
 * Decisão do Bruno: baixar o vídeo de terceiro, medir e apagar na hora. Aqui
 * o vídeo entra numa pasta temporária, sai em NÚMEROS (cortes, duração de
 * cena, quando a fala começa, energia e andamento do áudio) e numa folha de
 * contato pequena (8 quadros) que o app manda à visão para etiquetar e
 * descarta; a pasta é apagada no `finally`, com ou sem erro. Nada do vídeo é
 * guardado, nem aqui nem no Blob.
 *
 * Sem dependência nova: corte pela detecção de cena do ffmpeg, andamento pela
 * autocorrelação do envelope de ataques do áudio (o que o librosa faz, em
 * versão curta), tudo em Node. Só o YouTube precisa do yt-dlp; sem ele, a
 * medida do YouTube volta como "sem-baixador" e o Instagram segue.
 */

const TETO_DE_BYTES = 120 * 1024 * 1024;

function rodarCaptura(cmd, args, { stdout = false, prazoMs = 120_000 } = {}) {
  return new Promise((resolver, rejeitar) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const saida = [];
    let erro = "";
    const prazo = setTimeout(() => p.kill("SIGKILL"), prazoMs);
    p.stdout.on("data", (d) => stdout && saida.push(d));
    p.stderr.on("data", (d) => {
      erro += d.toString();
      if (erro.length > 4_000_000) erro = erro.slice(-2_000_000);
    });
    p.on("error", (e) => {
      clearTimeout(prazo);
      rejeitar(e);
    });
    p.on("close", (codigo) => {
      clearTimeout(prazo);
      resolver({ codigo, stdout: Buffer.concat(saida), stderr: erro });
    });
  });
}

/** O yt-dlp está instalado? (só o YouTube precisa) */
function temYtDlp() {
  try {
    return spawnSync("yt-dlp", ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
}

async function baixar(url, origem, destino, maxSeg) {
  if (origem === "youtube") {
    if (!temYtDlp()) {
      const e = new Error("sem-baixador");
      e.codigo = "sem-baixador";
      throw e;
    }
    // Só os primeiros `maxSeg` e em até 480p: o que se mede é ritmo, não nitidez.
    //
    // 02/10: o YouTube passou a exigir um interpretador de JavaScript para
    // liberar os formatos ("YouTube extraction without a JS runtime has been
    // deprecated"), e sem ele TODO vídeo falhava. O Node da imagem serve
    // (`--js-runtimes node`, com o yt-dlp[default] que traz o yt-dlp-ejs). E
    // não existe mais formato com imagem e som juntos: vem vídeo e áudio
    // separados e o ffmpeg junta (o som é medido: fala e batidas). Provado em
    // 02/10 na máquina de desenvolvimento: 20 s de um vídeo do @bemclara em
    // 480p com áudio, em 14,6 s.
    const r = await rodarCaptura(
      "yt-dlp",
      [
        "-q",
        "--no-playlist",
        "--js-runtimes",
        "node",
        "-f",
        "bv*[height<=480][height>=240][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=480]/b",
        "--merge-output-format",
        "mp4",
        "--download-sections",
        `*0-${maxSeg}`,
        "--force-keyframes-at-cuts",
        "-o",
        destino,
        url,
      ],
      { prazoMs: 180_000 }
    );
    if (r.codigo !== 0) {
      // Falha que não depende do vídeo (o YouTube mudou de novo, falta o
      // interpretador): o mesmo código do "sem baixador", para o app parar de
      // tentar o YouTube nesta execução em vez de perder 2 min vídeo a vídeo.
      const geral = /JS runtime|JavaScript runtime|nsig|Requested format is not available|Sign in to confirm|HTTP Error 403/i.test(r.stderr);
      const e = new Error(`${geral ? "sem-baixador: " : ""}yt-dlp saiu com ${r.codigo}: ${r.stderr.slice(-300)}`);
      if (geral) e.codigo = "sem-baixador";
      throw e;
    }
    return;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`o vídeo respondeu ${r.status}`);
  const tamanho = Number(r.headers.get("content-length") ?? 0);
  if (tamanho > TETO_DE_BYTES) throw new Error("vídeo grande demais para medir");
  const dados = Buffer.from(await r.arrayBuffer());
  if (dados.length > TETO_DE_BYTES) throw new Error("vídeo grande demais para medir");
  await writeFile(destino, dados);
}

function sondar(arquivo) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", arquivo], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  return { duracao: Number(j.format?.duration ?? 0), largura: Number(j.streams?.[0]?.width ?? 0), altura: Number(j.streams?.[0]?.height ?? 0) };
}

/** Os instantes de corte (detecção de cena do ffmpeg, limiar 0,32), nos primeiros `maxSeg`. */
async function cortes(arquivo, maxSeg) {
  const r = await rodarCaptura("ffmpeg", ["-hide_banner", "-t", String(maxSeg), "-i", arquivo, "-vf", "scale=320:-2,select='gt(scene,0.32)',showinfo", "-an", "-f", "null", "-"]);
  const tempos = [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.15);
  // Dois cortes a menos de 0,2 s um do outro são o mesmo corte (flash, fusão curta).
  return tempos.filter((t, i) => i === 0 || t - tempos[i - 1] >= 0.2);
}

/** O áudio mono a 11.025 Hz em amostras de 16 bits. */
async function audio(arquivo, maxSeg) {
  const r = await rodarCaptura("ffmpeg", ["-hide_banner", "-t", String(maxSeg), "-i", arquivo, "-vn", "-ac", "1", "-ar", "11025", "-f", "s16le", "-"], { stdout: true });
  const b = r.stdout;
  const n = Math.floor(b.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(i * 2) / 32768;
  return x;
}

const TAXA = 11025;

/** Energia por janela de 50 ms, o início da fala e a fração do tempo com som forte. */
function energia(x) {
  const passo = Math.round(TAXA * 0.05);
  const rms = [];
  for (let i = 0; i + passo <= x.length; i += passo) {
    let s = 0;
    for (let k = i; k < i + passo; k++) s += x[k] * x[k];
    rms.push(Math.sqrt(s / passo));
  }
  if (!rms.length) return { comecaEm: null, ativo: 0 };
  const ordenado = [...rms].sort((a, b) => a - b);
  const p90 = ordenado[Math.floor(ordenado.length * 0.9)] || 0;
  const limiar = Math.max(0.01, p90 * 0.25);
  const primeiro = rms.findIndex((v) => v > limiar);
  return { comecaEm: primeiro < 0 ? null : +(primeiro * 0.05).toFixed(2), ativo: +(rms.filter((v) => v > limiar).length / rms.length).toFixed(2) };
}

/**
 * O andamento: envelope de ataques (subida da energia em janelas de 512
 * amostras) e a autocorrelação dele entre 60 e 180 batidas por minuto. A
 * confiança é o pico contra a média: abaixo de ~1,3 a música é calma demais
 * (ou é só fala), e o número não deve mandar em nada.
 */
function andamento(x) {
  const hop = 512;
  const env = [];
  let anterior = 0;
  for (let i = 0; i + hop <= x.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += x[k] * x[k];
    const e = Math.log(1e-9 + s / hop);
    env.push(Math.max(0, e - anterior));
    anterior = e;
  }
  if (env.length < 200) return { bpm: null, confianca: 0 };
  const media = env.reduce((a, b) => a + b, 0) / env.length;
  const c = env.map((v) => v - media);
  const quadrosPorSeg = TAXA / hop;
  let melhor = { bpm: null, valor: -Infinity };
  const valores = [];
  for (let bpm = 60; bpm <= 180; bpm += 1) {
    const lag = Math.round((60 / bpm) * quadrosPorSeg);
    let s = 0;
    for (let i = lag; i < c.length; i++) s += c[i] * c[i - lag];
    valores.push(s);
    if (s > melhor.valor) melhor = { bpm, valor: s };
  }
  const mediaDosValores = valores.reduce((a, b) => a + Math.max(0, b), 0) / valores.length || 1;
  return { bpm: melhor.bpm, confianca: +(Math.max(0, melhor.valor) / mediaDosValores).toFixed(2) };
}

/** A folha de contato: 8 quadros espalhados, 4 por 2, pequena (só para a visão etiquetar). */
async function folhaDeContato(arquivo, duracao, pasta) {
  const saida = join(pasta, "folha.jpg");
  const taxa = Math.max(0.05, 8 / Math.max(1, duracao));
  const r = await rodarCaptura("ffmpeg", ["-hide_banner", "-y", "-i", arquivo, "-vf", `fps=${taxa.toFixed(4)},scale=240:-2,tile=4x2`, "-frames:v", "1", "-q:v", "6", saida]);
  if (r.codigo !== 0) return null;
  return (await readFile(saida)).toString("base64");
}

/**
 * Mede um vídeo de referência e APAGA tudo. `maxSeg`: quanto do começo medir
 * (o ritmo de um vídeo longo se lê nos primeiros minutos; o gancho, nos
 * primeiros segundos).
 */
export async function medirReferencia({ url, origem = "instagram", maxSeg = 90 }) {
  const pasta = await mkdtemp(join(tmpdir(), "referencia-"));
  try {
    const arquivo = join(pasta, "video.mp4");
    await baixar(url, origem, arquivo, maxSeg);
    const tamanho = (await stat(arquivo)).size;
    const { duracao, largura, altura } = sondar(arquivo);
    const medido = Math.min(duracao || maxSeg, maxSeg);
    if (!medido || medido < 2) throw new Error("vídeo curto demais ou ilegível");
    const [instantes, x] = await Promise.all([cortes(arquivo, maxSeg), audio(arquivo, maxSeg)]);
    const bordas = [0, ...instantes.filter((t) => t < medido), medido];
    const cenas = bordas.slice(1).map((t, i) => t - bordas[i]).filter((d) => d > 0.05);
    const ordenadas = [...cenas].sort((a, b) => a - b);
    const mediana = ordenadas.length ? ordenadas[Math.floor(ordenadas.length / 2)] : medido;
    const som = energia(x);
    const ritmo = andamento(x);
    const folha = await folhaDeContato(arquivo, medido, pasta);
    return {
      duracao: +duracao.toFixed(2),
      medido: +medido.toFixed(2),
      largura,
      altura,
      bytes: tamanho,
      cortes: instantes.length,
      cortesPorSegundo: +(instantes.length / medido).toFixed(3),
      cenaMedia: +(medido / Math.max(1, cenas.length)).toFixed(2),
      cenaMediana: +mediana.toFixed(2),
      primeiroCorte: instantes.length ? +instantes[0].toFixed(2) : null,
      falaComecaEm: som.comecaEm,
      somAtivo: som.ativo,
      batidas: ritmo,
      folha,
    };
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
