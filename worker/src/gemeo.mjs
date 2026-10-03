import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { rodar, ffprobe } from "./ffmpeg.mjs";

/**
 * O GÊMEO DIGITAL NO WORKER (01/10/2026).
 *
 * Três trabalhos, todos sem IA paga (quem gera é o fal.ai, chamado pelo app):
 *
 *   fotoDoGerador  a melhor entre as fotos do cliente, recortada num quadrado
 *                  em volta do rosto (gemeo-rosto.py, MediaPipe em CPU);
 *   vozDoGemeo     a amostra de voz gravada no navegador (webm/opus) vira MP3
 *                  limpo, e a duração REAL é medida aqui, não confiada à tela;
 *   juntarPedacos  os pedaços do OmniHuman (cada um abaixo de 30 s, que é o
 *                  teto da alta definição) viram um vídeo só.
 *
 * Mora fora do index.mjs pelo mesmo motivo da montagem: o index é o roteador,
 * e cada trabalho novo ali dentro deixava o arquivo mais difícil de ler.
 * `baixar` e `subir` chegam de fora porque são do index (prazos e stores).
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PYTHON = process.env.PYTHON_DO_RECORTE ?? "python3";
const MODELO_ROSTO = process.env.MODELO_ROSTO ?? "/app/modelos/face_landmarker.task";

function rodarPython(script, config, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(PYTHON, [join(AQUI, script), JSON.stringify(config)]);
    let saida = "";
    let erro = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => {
      erro += d;
      if (erro.length > 8000) erro = erro.slice(-8000);
    });
    const relogio = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${script} passou de ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(relogio);
      reject(e);
    });
    p.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) return reject(new Error(`${script} saiu com ${codigo}: ${erro.slice(-300)}`));
      const linha = saida
        .trim()
        .split(String.fromCharCode(10))
        .reverse()
        .find((l) => l.trim().startsWith("{"));
      if (!linha) return reject(new Error(`${script} não devolveu JSON`));
      try {
        resolve(JSON.parse(linha));
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * A foto do gerador. `pedido`: { fotos: [url], chave }. Devolve a foto
 * recortada (store PRIVADO: rosto do cliente não é mídia publicada) e a
 * avaliação de cada foto, para a tela dizer "esta tem duas pessoas".
 */
export async function fotoDoGerador(pedido, pasta, { baixar, subir }) {
  const fotos = (pedido.fotos ?? []).slice(0, 5);
  if (fotos.length === 0) throw new Error("Nenhuma foto");
  const caminhos = [];
  for (const [i, url] of fotos.entries()) {
    const caminho = join(pasta, `foto-${i}`);
    await baixar(url, caminho);
    caminhos.push(caminho);
  }
  const saida = join(pasta, "foto-do-gerador.jpg");
  const r = await rodarPython(
    "gemeo-rosto.py",
    { fotos: caminhos, saida, modelo_rosto: MODELO_ROSTO, lado_maximo: 1440 },
    // Uma foto leva perto de 1 s na máquina de desenvolvimento; cinco fotos
    // grandes de celular cabem com folga em 2 min.
    120_000
  );
  if (r.escolhida === null || r.escolhida === undefined) {
    return { foto: null, escolhida: null, avaliacoes: r.avaliacoes ?? [] };
  }
  const foto = await subir(saida, pedido.chave, "image/jpeg", { privado: true });
  return { foto, escolhida: r.escolhida, avaliacoes: r.avaliacoes ?? [], lado: r.lado };
}

/**
 * A amostra de voz em MP3. O navegador grava em webm/opus (Chrome) ou mp4/aac
 * (Safari); a clonagem recebe sempre o mesmo formato, mono, 44,1 kHz, com o
 * volume nivelado, e a duração medida aqui é a que o app usa para aceitar ou
 * recusar a amostra (a tela poderia mentir sem querer: um gravador pausado
 * conta tempo sem som).
 */
export async function vozDoGemeo(pedido, pasta, { baixar, subir }) {
  const entrada = join(pasta, "amostra");
  await baixar(pedido.audioUrl, entrada);
  const saida = join(pasta, "voz.mp3");
  await rodar(
    // -t 300: a amostra pode vir de um vídeo longo (aula, live); a clonagem só
    // precisa de até 5 minutos, e mais que isso pesa no envio à ElevenLabs.
    ["-i", entrada, "-t", "300", "-vn", "-ac", "1", "-ar", "44100", "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-c:a", "libmp3lame", "-b:a", "128k", saida],
    { timeoutMs: 5 * 60_000 }
  );
  const info = await ffprobe(saida);
  const voz = await subir(saida, pedido.chave, "audio/mpeg", { privado: true });
  return { voz, duracaoSec: Math.round(info.duracaoSec * 10) / 10 };
}

/**
 * Os pedaços do gerador num vídeo só. `pedido.pedacos`: [{ url, segundos }],
 * na ordem da fala; `segundos` é a duração da FALA daquele pedaço.
 *
 * O corte no fim de cada pedaço: o OmniHuman devolve meio segundo a mais que o
 * áudio (27,4 s de vídeo para 26,9 s de fala, medido no teste de 01/10). Sem
 * aparar, cada emenda ganha uma pausa muda, e num vídeo de 6 pedaços isso são
 * 3 segundos de gente parada. Deixamos 0,15 s de respiro.
 *
 * Reencoda em vez de copiar: os pedaços vêm do mesmo gerador, mas basta um
 * sair em outra resolução (recuo para 720p) para a cópia direta gerar um
 * arquivo que trava o player. A normalização custa segundos por pedaço.
 */
export async function juntarPedacos(pedido, pasta, { baixar }) {
  const pedacos = pedido.pedacos ?? [];
  if (pedacos.length === 0) throw new Error("Nenhum pedaço para juntar");
  const arquivos = [];
  for (const [i, p] of pedacos.entries()) {
    const arq = join(pasta, `pedaco-${i}.mp4`);
    await baixar(p.url, arq);
    const info = await ffprobe(arq);
    if (!info.temAudio) throw new Error(`O pedaço ${i + 1} veio sem som`);
    const ate = p.segundos ? Math.min(info.duracaoSec, Number(p.segundos) + 0.15) : info.duracaoSec;
    arquivos.push({ arq, ate, largura: info.largura, altura: info.altura });
  }
  // O tamanho do primeiro pedaço manda; os outros entram nele sem esticar.
  const L = arquivos[0].largura - (arquivos[0].largura % 2);
  const A = arquivos[0].altura - (arquivos[0].altura % 2);
  const entradas = arquivos.flatMap((a) => ["-i", a.arq]);
  const filtros = arquivos
    .map(
      (a, i) =>
        `[${i}:v]trim=0:${a.ate.toFixed(3)},setpts=PTS-STARTPTS,scale=${L}:${A}:force_original_aspect_ratio=decrease,` +
        `pad=${L}:${A}:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p,setsar=1[v${i}];` +
        `[${i}:a]atrim=0:${a.ate.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`
    )
    .join(";");
  // VELOCIDADE APROVADA (01/10): a voz que o Bruno escolheu na comparação foi a
  // "B", o modelo v4 acelerado 7% sem mudar o tom. O parâmetro de velocidade da
  // ElevenLabs no v4 quase não mexe no ritmo, então a aceleração é feita aqui,
  // no vídeo inteiro: imagem e som juntos (setpts e atempo), para a boca
  // continuar sincronizada com a fala. 7% não aparece no movimento do corpo.
  const velocidade = Number(pedido.velocidade ?? process.env.GEMEO_VELOCIDADE ?? 1.07) || 1;
  const juncao =
    arquivos.map((_, i) => `[v${i}][a${i}]`).join("") +
    `concat=n=${arquivos.length}:v=1:a=1[vj][aj];` +
    `[vj]setpts=PTS/${velocidade},fps=25[v];[aj]atempo=${velocidade}[a]`;
  const roteiroDoFiltro = join(pasta, "filtro.txt");
  await writeFile(roteiroDoFiltro, `${filtros};${juncao}`);
  const saida = join(pasta, "gemeo.mp4");
  await rodar(
    [
      ...entradas,
      // Filtro em arquivo: com 7 pedaços a linha passa do limite do Windows de
      // desenvolvimento, e o nome da opção mudou entre o ffmpeg 5 e o 7.
      ...(await opcaoDoFiltroEmArquivo(roteiroDoFiltro)),
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "19",
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      saida,
    ],
    { timeoutMs: 20 * 60_000 }
  );
  const info = await ffprobe(saida);
  return { arquivo: saida, duracaoSec: info.duracaoSec, largura: info.largura, altura: info.altura };
}

let opcaoNova = null;
async function opcaoDoFiltroEmArquivo(caminho) {
  if (opcaoNova === null) {
    // Mesma regra do `opcaoDeFiltro` do ffmpeg.mjs (que não é exportado): da
    // versão 7 em diante é "-/filter_complex", antes "-filter_complex_script".
    const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    const m = (r.stdout ?? "").match(/ffmpeg version n?(\d+)/i);
    opcaoNova = (m ? Number(m[1]) : 0) >= 7;
  }
  return opcaoNova ? ["-/filter_complex", caminho] : ["-filter_complex_script", caminho];
}
