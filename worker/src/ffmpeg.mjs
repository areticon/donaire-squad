import { spawn } from "node:child_process";

/**
 * As receitas de ffmpeg do produto, num lugar só.
 *
 * Regra que vale para todas: o corte usa `-ss` ANTES do `-i`, que faz o ffmpeg
 * pular direto para perto do ponto em vez de decodificar o vídeo inteiro até
 * chegar lá. Numa gravação de 27 minutos, cortar um trecho do minuto 26 leva
 * segundos em vez de minutos. O `-ss` depois do `-i` é mais preciso ao quadro,
 * mas aqui a precisão ao quadro não vale o custo: os tempos vêm de uma seleção
 * por fala, já arredondada para fronteira de frase.
 */

function rodar(args, { timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let erro = "";
    p.stderr.on("data", (d) => {
      erro += d.toString();
      // Não deixa o buffer crescer sem limite num arquivo longo.
      if (erro.length > 8000) erro = erro.slice(-8000);
    });
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`ffmpeg passou de ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg saiu com ${code}: ${erro.slice(-600)}`));
    });
  });
}

export function ffprobe(caminho) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      caminho,
    ]);
    let saida = "";
    p.stdout.on("data", (d) => (saida += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe saiu com ${code}`));
      try {
        const json = JSON.parse(saida);
        const video = (json.streams ?? []).find((s) => s.codec_type === "video");
        resolve({
          duracaoSec: Number(json.format?.duration ?? 0),
          largura: Number(video?.width ?? 0),
          altura: Number(video?.height ?? 0),
          bytes: Number(json.format?.size ?? 0),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * O vídeo completo, pronto para o canal.
 *
 * `+faststart` move os metadados para o começo do arquivo, que é o que permite
 * o vídeo começar a tocar antes de terminar de baixar. Sem isso o YouTube
 * aceita igual, mas qualquer prévia dentro da nossa plataforma engasga.
 *
 * CRF 20 e não 18: a diferença é invisível em vídeo de pessoa falando, e 18
 * gera arquivo perto de 40% maior. Como transferência é a maior parte do custo
 * do produto, esses 40% saem direto da margem.
 */
export async function prepararCompleto(entrada, saida) {
  await rodar([
    "-i", entrada,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    saida,
  ]);
}

/**
 * Um trecho em 9:16, para Shorts, Reels e TikTok.
 *
 * O tratamento é fundo desfocado, e não barra preta. A receita comum de
 * `scale` mais `pad` deixa duas tarjas pretas enormes em cima e embaixo, que em
 * vídeo de pessoa falando parece erro de exportação e come o alcance dessas
 * plataformas, que privilegiam vídeo que ocupa a tela toda. Aqui o mesmo vídeo
 * entra duas vezes: uma ampliada e borrada como fundo, outra inteira e nítida
 * por cima. Nada da imagem é perdido e a tela fica cheia.
 *
 * Cortar em vez de desfocar cortaria a cabeça ou o corpo de quem fala, porque
 * não temos detecção de rosto para saber onde centralizar.
 */
export async function cortarVertical(entrada, saida, inicio, duracao) {
  const filtro = [
    // Fundo: preenche 1080x1920 cobrindo tudo, corta o excesso e borra forte.
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase," +
      "crop=1080:1920,gblur=sigma=28[fundo]",
    // Frente: o vídeo inteiro, cabendo na largura, sem perder nada.
    "[0:v]scale=1080:-2[frente]",
    "[fundo][frente]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
  ].join(";");

  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(duracao),
    "-filter_complex", filtro,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ]);
}

/**
 * O mesmo trecho em 16:9, para LinkedIn, X e YouTube.
 *
 * Existe separado do vertical porque no LinkedIn e no X o vídeo aparece dentro
 * do feed em caixa larga, e vídeo vertical entra minúsculo no meio da tela.
 */
export async function cortarHorizontal(entrada, saida, inicio, duracao) {
  await rodar([
    "-ss", String(inicio),
    "-i", entrada,
    "-t", String(duracao),
    "-vf",
      "scale=1920:1080:force_original_aspect_ratio=decrease," +
      "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    saida,
  ]);
}

/**
 * A capa do trecho.
 *
 * Pega o quadro alguns segundos DEPOIS do início, e não no início exato:
 * começo de corte costuma cair numa transição, num piscar ou numa boca aberta
 * no meio de uma palavra. Alguns segundos adiante a pessoa já está falando em
 * postura estável.
 */
export async function extrairCapa(entrada, saida, inicio, duracao) {
  const instante = inicio + Math.min(3, Math.max(0.5, duracao * 0.15));
  await rodar([
    "-ss", String(instante),
    "-i", entrada,
    "-frames:v", "1",
    "-vf", "scale=1280:-2",
    "-q:v", "3",
    saida,
  ], { timeoutMs: 2 * 60 * 1000 });
}
