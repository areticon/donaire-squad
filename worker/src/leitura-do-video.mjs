import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A LEITURA DO VÍDEO no worker (06/10/2026): a ponte para a medição em Python
 * (src/leitura.py: pessoas, rostos, boca, tela, quadro, movimento, por
 * amostra) e o proxy leve que o app manda para a visão (Gemini lendo o vídeo
 * direto, lib/media/leitura-do-video.ts).
 *
 * Mesma regra do recorte e da capa: falhar aqui não derruba nada. A rota
 * devolve o que conseguiu (medida sem proxy, ou proxy sem medida), e o app
 * segue com o que tem e avisa.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON_DO_RECORTE ?? "python3";
const MODELO_ROSTO = process.env.MODELO_ROSTO ?? "/app/modelos/face_landmarker.task";
const MODELO_MULTICLASSE = process.env.MODELO_MULTICLASSE ?? "/app/modelos/selfie_multiclass.tflite";

/** Cadência maior que isto (em s) e a amostragem por quadro-chave fica rala demais: decodifica tudo a 1 fps. */
const CADENCIA_MAXIMA_SEG = 3;

/** Teto do que se mede: além disto a leitura olha só o começo (a visão também recebe só até aqui). */
export const TETO_DA_LEITURA_SEG = 60 * 60;

/**
 * O tempo da medição. Medido local em 06/10 (notebook, venv): 180 s de vídeo
 * em 12,7 s (0,07 x tempo real), com a segmentação levando 75% disso. O
 * contêiner do Railway é bem mais lento e divide a CPU com uma montagem;
 * 0,6 s por segundo de vídeo dá folga de 8 x, com piso de 4 min e teto de
 * 10 min (o prazo do app é 10 min também).
 */
export function prazoDaMedicao(duracaoSeg) {
  return Math.round(Math.min(600_000, Math.max(240_000, (duracaoSeg || 0) * 600)));
}

function rodar(cmd, args, { prazoMs, cwd } = {}) {
  return new Promise((resolver) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    let erro = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (erro += d.toString().slice(-2000)));
    const relogio = prazoMs
      ? setTimeout(() => {
          p.kill("SIGKILL");
          resolver({ codigo: -1, saida, erro: `prazo de ${Math.round(prazoMs / 1000)} s estourado` });
        }, prazoMs)
      : null;
    p.on("error", (e) => {
      if (relogio) clearTimeout(relogio);
      resolver({ codigo: -1, saida, erro: e.message });
    });
    p.on("close", (codigo) => {
      if (relogio) clearTimeout(relogio);
      resolver({ codigo, saida, erro });
    });
  });
}

/** A cadência dos quadros-chave no primeiro minuto, em segundos (2 no completo que o worker gera). */
export async function cadenciaDosQuadrosChave(arquivo) {
  const r = await rodar("ffprobe", [
    "-v", "error", "-skip_frame", "nokey", "-select_streams", "v:0",
    "-show_entries", "frame=pts_time", "-of", "csv=p=0", "-read_intervals", "%+60", arquivo,
  ], { prazoMs: 60_000 });
  // Linha vazia no fim vira Number("") = 0 e zeraria a cadência: só linhas com número.
  const tempos = r.saida
    .split(/\r?\n/)
    .map((l) => l.split(",")[0].trim())
    .filter((l) => /^\d/.test(l))
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (tempos.length < 2) return 10;
  return (tempos[tempos.length - 1] - tempos[0]) / (tempos.length - 1);
}

/**
 * A medição por amostra (leitura.py). Devolve o JSON do Python ou lança com o
 * motivo. `ate` limita ao começo do vídeo (a prova mede 3 min antes de tudo).
 */
export async function medirVideo(arquivo, pasta, { ate = null, duracao = 0, modo = "chave", largura = 480 } = {}) {
  const config = JSON.stringify({
    video: arquivo,
    modelo_rosto: MODELO_ROSTO,
    modelo_segmentacao: MODELO_MULTICLASSE,
    largura,
    modo,
    ate: ate ?? Math.min(duracao || TETO_DA_LEITURA_SEG, TETO_DA_LEITURA_SEG),
    max_pessoas: 6,
  });
  const r = await rodar(PYTHON, [join(AQUI, "leitura.py"), config], { cwd: pasta, prazoMs: prazoDaMedicao(Math.min(ate ?? duracao ?? 0, TETO_DA_LEITURA_SEG)) });
  // O MediaPipe escreve avisos no stdout em algumas versões: a última linha JSON é a resposta.
  const linha = r.saida.trim().split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{"));
  if (!linha) throw new Error(`medição sem resposta (código ${r.codigo}): ${(r.erro || "").slice(-300)}`);
  const j = JSON.parse(linha);
  if (!j.ok) throw new Error(`medição falhou: ${j.erro ?? "sem motivo"}`);
  return j;
}

/**
 * O PROXY PARA A VISÃO: 360p, 1 quadro por segundo, áudio mono 48 kbps.
 * O Gemini amostra o vídeo a 1 fps de qualquer jeito, então mandar mais que
 * isso só custa upload. Medido local em 06/10: 3 min em 3,5 s e 2 MB; 17 min
 * dão ~11 MB. Com quadro-chave a cada 2 s a decodificação é só deles
 * (`-skip_frame nokey`); com GOP longo decodifica tudo.
 */
export async function proxyParaVisao(arquivo, saida, { ate = null, modo = "chave", altura = 360 } = {}) {
  const args = ["-nostdin", "-v", "error", "-y"];
  if (modo !== "fps1") args.push("-skip_frame", "nokey");
  if (ate) args.push("-t", String(ate));
  args.push(
    "-i", arquivo,
    "-vf", `scale=-2:${altura},fps=1`, "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "48k", "-ac", "1", "-ar", "22050",
    "-movflags", "+faststart", saida
  );
  const r = await rodar("ffmpeg", args, { prazoMs: 600_000 });
  if (r.codigo !== 0) throw new Error(`proxy falhou (código ${r.codigo}): ${(r.erro || "").slice(-300)}`);
  return saida;
}

/** Cadência em segundos -> modo da amostragem (o mesmo para a medição e para o proxy). */
export function modoPelaCadencia(cadenciaSeg) {
  return cadenciaSeg > CADENCIA_MAXIMA_SEG ? "fps1" : "chave";
}
