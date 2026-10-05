import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, readFile } from "node:fs/promises";
import { rodar, ffprobe } from "./ffmpeg.mjs";

/**
 * O GÊMEO DIGITAL NO WORKER (01/10/2026).
 *
 * Quatro trabalhos, todos sem IA paga (quem gera é o fal.ai, chamado pelo app):
 *
 *   fotoDoGerador  a melhor entre as fotos do cliente, recortada num quadrado
 *                  em volta do rosto (gemeo-rosto.py, MediaPipe em CPU);
 *   vozDoGemeo     a amostra de voz gravada no navegador (webm/opus) vira MP3
 *                  limpo, e a duração REAL é medida aqui, não confiada à tela;
 *   juntarPedacos  os pedaços do OmniHuman (cada um abaixo de 30 s, que é o
 *                  teto da alta definição) viram um vídeo só;
 *   treinoDoGemeo  (03/10) o vídeo único de treino vira vídeo normalizado,
 *                  voz, foto, quadro inteiro e as medidas da checagem.
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
  // 04/10: a mesma rota prepara a FALA de um pedaço (ver `prepararFala`), para
  // não mexer no roteador; quem pede manda `fala: true`.
  if (pedido.fala) return prepararFala(pedido, pasta, { baixar, subir });
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

/** O ffmpeg com o stderr de volta (o `rodar` só devolve erro): é onde o loudnorm escreve a medida. */
function ffmpegComRelatorio(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-nostdin", "-hide_banner", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let erro = "";
    p.stderr.on("data", (d) => {
      erro += d;
      if (erro.length > 20000) erro = erro.slice(-20000);
    });
    const relogio = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`ffmpeg passou de ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(relogio);
      reject(e);
    });
    p.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) return reject(new Error(`ffmpeg saiu com ${codigo}: ${erro.slice(-600)}`));
      resolve(erro);
    });
  });
}

/**
 * O alvo do volume da fala: -17 LUFS no mono, que no vídeo final (o mesmo som
 * nos dois canais) mede -14 LUFS, o volume que YouTube e Instagram esperam; o
 * pico real fica em -1,5 dB.
 */
const ALVO_LUFS = -17;
const ALVO_PICO = -1.5;

/**
 * A FALA DE UM PEDAÇO, PRONTA PARA O GERADOR (04/10/2026).
 *
 * O Bruno ouviu o vídeo do gêmeo e disse que o áudio ficou ruim e descasado
 * da boca. Duas causas, medidas no vídeo de 03/10:
 *
 *  - a voz aprovada é a ElevenLabs acelerada 7%, e a aceleração era feita
 *    DEPOIS de o gerador animar a boca, na junção: `setpts` na imagem e
 *    `atempo` no som. O som ficava certo, mas a imagem a 26,75 quadros por
 *    segundo voltava para 25 jogando fora 1 quadro a cada 15, e a boca andava
 *    aos trancos de 40 ms contra uma fala lisa;
 *  - o som passava por três compressões com perda: MP3 da ElevenLabs, AAC do
 *    gerador e AAC de novo na junção, a 44,1 kHz mono virando 48 kHz estéreo
 *    com 3 dB a menos, e o volume ficava em -18 LUFS.
 *
 * Aqui a aceleração acontece ANTES do gerador: a fala sai da ElevenLabs, é
 * acelerada (`atempo`, sem mudar o tom), nivelada em duas passadas (o
 * `loudnorm` linear, que só aplica ganho e não "bombeia") e gravada em WAV
 * 48 kHz mono, sem perda. O gerador anima a boca já na velocidade final, e a
 * junção não mexe mais no tempo de nada. Este WAV também é o som que vai no
 * vídeo final, no lugar do AAC recomprimido do gerador (`juntarPedacos`).
 *
 * Devolve `preparada: true`: o app só confia no arquivo com essa marca (um
 * worker antigo devolveria o MP3 nivelado da amostra de voz, sem acelerar).
 */
export async function prepararFala(pedido, pasta, { baixar, subir }) {
  const entrada = join(pasta, "fala-crua");
  await baixar(pedido.audioUrl, entrada);
  const velocidade = Math.min(1.3, Math.max(0.8, Number(pedido.velocidade ?? 1) || 1));
  const tempo = velocidade === 1 ? "" : `atempo=${velocidade},`;
  const relatorio = await ffmpegComRelatorio(
    ["-i", entrada, "-vn", "-af", `${tempo}loudnorm=I=${ALVO_LUFS}:TP=${ALVO_PICO}:LRA=11:print_format=json`, "-f", "null", "-"],
    2 * 60_000
  );
  const json = relatorio.slice(relatorio.lastIndexOf("{"), relatorio.lastIndexOf("}") + 1);
  let m = null;
  try {
    m = JSON.parse(json);
  } catch {
    m = null;
  }
  const medido =
    m && Number.isFinite(Number(m.input_i)) && Number(m.input_i) > -70
      ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
      : "";
  const saida = join(pasta, "fala.wav");
  await rodar(
    [
      "-i", entrada, "-vn",
      // O loudnorm trabalha a 192 kHz por dentro; o aresample volta a 48 kHz.
      "-af", `${tempo}loudnorm=I=${ALVO_LUFS}:TP=${ALVO_PICO}:LRA=11${medido},aresample=48000`,
      "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", saida,
    ],
    { timeoutMs: 2 * 60_000 }
  );
  const info = await ffprobe(saida);
  const voz = await subir(saida, pedido.chave, "audio/wav", { privado: true });
  return { voz, duracaoSec: Math.round(info.duracaoSec * 1000) / 1000, preparada: true, velocidade, lufs: m ? Number(m.input_i) : null };
}

/**
 * O ÁUDIO MEDIDO (03/10), para a checagem automática do vídeo de treino. Tudo
 * pelo ffmpeg, sem IA, em janelas de 50 ms:
 *
 *   falaDb     o volume das janelas de fala (percentil 90 do RMS);
 *   ruidoDb    o volume das janelas mais quietas (percentil 5): o fundo,
 *              medido nos respiros entre as palavras;
 *   picoDb     o maior pico (perto de 0 dB é voz estourada);
 *   falaPct    quanto do tempo tem som acima de -40 dB.
 *
 * Por janelas curtas, e não o "Noise floor" do astats inteiro: na prova de
 * 03/10, com a gravação de verdade do Bruno, o piso inteiro deu -inf, o que
 * aprovaria qualquer sala; e janelas de meio segundo nunca caem num silêncio
 * de quem fala sem parar (percentil 10 em -28 dB, com fala dentro). Em 50 ms
 * o percentil 5 cai nos respiros: -71 dB na gravação limpa do Bruno, -49 dB
 * com ruído rosa somado, que é o fundo que a clonagem vai ouvir. O app aplica os limites
 * (lib/media/gemeo.ts, conferirTreino); o worker só mede.
 */
export async function medirAudio(arquivo, pasta) {
  // Nome relativo e `cwd` na pasta: o caminho absoluto do Windows tem ":",
  // que no filtro do ffmpeg separa opções.
  await rodar(
    [
      "-i", arquivo, "-vn",
      "-af",
      "asetnsamples=n=2205:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level+Peak_level,ametadata=print:file=janelas.txt",
      "-f", "null", "-",
    ],
    { timeoutMs: 2 * 60_000, cwd: pasta }
  );
  const linhas = (await readFile(join(pasta, "janelas.txt"), "utf8")).split(/\r?\n/);
  const ler = (chave) =>
    linhas
      .filter((l) => l.startsWith(`${chave}=`))
      .map((l) => {
        const v = Number(l.slice(chave.length + 1));
        return Number.isFinite(v) ? Math.max(-120, v) : -120;
      });
  const rms = ler("lavfi.astats.Overall.RMS_level");
  const picos = ler("lavfi.astats.Overall.Peak_level");
  if (!rms.length) return { falaDb: null, ruidoDb: null, picoDb: null, falaPct: 0 };
  const ordenados = [...rms].sort((x, y) => x - y);
  const pct = (p) => ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
  const um = (v) => Math.round(v * 10) / 10;
  return {
    falaDb: um(pct(90)),
    ruidoDb: um(pct(5)),
    picoDb: picos.length ? um(Math.max(...picos)) : null,
    falaPct: Math.round((rms.filter((v) => v > -40).length / rms.length) * 100),
  };
}

/**
 * O VÍDEO DE TREINO DO GÊMEO (03/10/2026): UM vídeo de cerca de 1 minuto, a
 * pessoa lendo o texto da tela (que inclui a autorização), vira as três coisas
 * que antes eram pedidas separadas:
 *
 *   treino.mp4      o vídeo normalizado (H.264, até 1080p, AAC), que é o que
 *                   vai ao fornecedor que treina avatar a partir de vídeo;
 *   referencia.mp4  20 s sem som, 16:9, do meio da gravação: a referência de
 *                   gesto e postura dos geradores que aceitam vídeo de
 *                   referência em vez de foto;
 *   voz.mp3         a amostra de voz (o mesmo tratamento de `vozDoGemeo`);
 *   foto            o melhor quadro, recortado no rosto (o mesmo critério das
 *                   fotos, gemeo-rosto.py), e o quadro INTEIRO, que é a
 *                   referência para compor a pessoa nos cenários.
 *
 * E mede o que a checagem automática precisa: duração real, em quantos dos
 * quadros amostrados aparece um rosto (e se aparece mais de um), e o áudio
 * (`medirAudio`). Quem decide se passou é o app; o worker só mede.
 *
 * Tudo no store PRIVADO: é rosto e voz de uma pessoa.
 */
export async function treinoDoGemeo(pedido, pasta, { baixar, subir }) {
  const entrada = join(pasta, "treino-original");
  await baixar(pedido.videoUrl, entrada);
  const prefixo = String(pedido.prefixo ?? "").replace(/\/$/, "");
  if (!prefixo) throw new Error("Falta o prefixo das chaves");

  // 1. O vídeo normalizado. O webm do MediaRecorder costuma vir sem duração
  // no cabeçalho; depois de reencodar, o ffprobe mede certo.
  const treino = join(pasta, "treino.mp4");
  await rodar(
    [
      "-i", entrada, "-t", "300",
      "-vf", "scale='min(1920,iw)':-2,fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-c:a", "aac", "-b:a", "160k", "-ac", "1", "-ar", "48000",
      "-movflags", "+faststart", treino,
    ],
    { timeoutMs: 10 * 60_000 }
  );
  const info = await ffprobe(treino);
  if (!info.temAudio) throw new Error("O vídeo de treino veio sem som");
  const duracao = info.duracaoSec;

  // 2. A amostra de voz e a medida do áudio (a medida no áudio cru, antes de
  // nivelar: o loudnorm esconderia justamente o volume baixo e o ruído).
  const cru = join(pasta, "audio.wav");
  await rodar(["-i", treino, "-vn", "-ac", "1", "-ar", "44100", cru], { timeoutMs: 3 * 60_000 });
  const audio = await medirAudio(cru, pasta);
  const vozMp3 = join(pasta, "voz.mp3");
  await rodar(
    ["-i", cru, "-af", "loudnorm=I=-18:TP=-2:LRA=11", "-c:a", "libmp3lame", "-b:a", "128k", vozMp3],
    { timeoutMs: 3 * 60_000 }
  );

  // 3. Os quadros: 8, espalhados entre 8% e 92% (o começo e o fim costumam
  // ter a mão indo ao botão de gravar).
  const quadros = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const instante = duracao * (0.08 + (0.84 * i) / (N - 1));
    const q = join(pasta, `quadro-${i}.jpg`);
    // yuvj420p: o ffmpeg 9 recusa gravar JPEG a partir do yuv420p de faixa
    // limitada (achado na prova de 03/10); o do contêiner aceita os dois.
    await rodar(["-ss", instante.toFixed(2), "-i", treino, "-frames:v", "1", "-vf", "format=yuvj420p", "-q:v", "2", q], { timeoutMs: 60_000 });
    quadros.push(q);
  }
  const fotoRecortada = join(pasta, "foto-do-gerador.jpg");
  const quadroInteiro = join(pasta, "quadro-inteiro.jpg");
  const r = await rodarPython(
    "gemeo-rosto.py",
    { fotos: quadros, saida: fotoRecortada, saida_inteira: quadroInteiro, modelo_rosto: MODELO_ROSTO, lado_maximo: 1440 },
    120_000
  );
  const avaliacoes = r.avaliacoes ?? [];
  const comRosto = avaliacoes.filter((a) => a.rosto && !a.varios).length;
  const comVarios = avaliacoes.filter((a) => a.varios).length;
  const virados = avaliacoes.filter((a) => a.rosto && !a.varios && Math.abs(a.giro ?? 0) > 30).length;
  // O ENQUADRAMENTO (05/10): o gêmeo da HeyGen repete o enquadramento do
  // treino, e a API não tem escala nem deslocamento do avatar. A altura do
  // rosto (malha, testa ao queixo) e o topo dele, em fração da altura do
  // quadro, medianos entre os quadros com um rosto só. O app decide.
  const caixas = avaliacoes.filter((a) => a.rosto && !a.varios && a.caixa).map((a) => a.caixa);
  const mediana = (xs) => {
    if (!xs.length) return null;
    const o = [...xs].sort((x, y) => x - y);
    return Math.round(o[Math.floor(o.length / 2)] * 1000) / 1000;
  };
  const alturaDoRosto = mediana(caixas.map((c) => c.h));
  const topoDoRosto = mediana(caixas.map((c) => c.y));

  // 4. A referência de gesto: 20 s do meio, sem som, em 16:9 (o formato que
  // os geradores por referência aceitam), com o rosto centrado pelo pad.
  const referencia = join(pasta, "referencia.mp4");
  const inicioRef = Math.max(0, Math.min(duracao - 20, duracao * 0.25));
  await rodar(
    [
      "-ss", inicioRef.toFixed(2), "-i", treino, "-t", "20", "-an",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", referencia,
    ],
    { timeoutMs: 5 * 60_000 }
  );

  const [videoSubido, vozSubida, refSubida] = [
    await subir(treino, `${prefixo}/treino.mp4`, "video/mp4", { privado: true }),
    await subir(vozMp3, `${prefixo}/voz.mp3`, "audio/mpeg", { privado: true }),
    await subir(referencia, `${prefixo}/referencia.mp4`, "video/mp4", { privado: true }),
  ];
  let foto = null;
  let quadro = null;
  if (r.escolhida !== null && r.escolhida !== undefined) {
    foto = await subir(fotoRecortada, `${prefixo}/foto-do-gerador.jpg`, "image/jpeg", { privado: true });
    quadro = await subir(quadroInteiro, `${prefixo}/quadro-inteiro.jpg`, "image/jpeg", { privado: true });
  }
  return {
    duracaoSec: Math.round(duracao * 10) / 10,
    largura: info.largura,
    altura: info.altura,
    video: videoSubido,
    voz: vozSubida,
    referencia: refSubida,
    foto,
    quadro,
    escolhida: r.escolhida ?? null,
    rosto: { quadros: N, comRosto, comVarios, virados, altura: alturaDoRosto, topo: topoDoRosto },
    audio,
  };
}

/**
 * A SINCRONIA NATURAL: numa gravação real (o vídeo de treino do Bruno, 03/10)
 * o som vem de 8 a 25 ms depois da abertura da boca. É o alvo da correção.
 */
const SINCRONIA_NATURAL_MS = Number(process.env.GEMEO_SINCRONIA_NATURAL_MS ?? 15);
/** Abaixo disto não se mexe (um quadro a 25 fps são 40 ms). */
const SINCRONIA_TOLERANCIA_MS = 35;
/** Acima disto a medida é tratada como engano, não como atraso. */
const SINCRONIA_TETO_MS = 250;
/** A correlação mínima entre boca e som para confiar na medida. */
const SINCRONIA_CORRELACAO_MINIMA = 0.28;
const QUADROS_POR_SEGUNDO = 25;

/**
 * Mede um pedaço (gemeo-sincronia.py). Nunca derruba a junção: sem a medida,
 * o pedaço entra sem correção, como antes de 04/10.
 */
async function medirSincronia(video, fala) {
  try {
    return await rodarPython("gemeo-sincronia.py", { video, fala: fala ?? null, modelo: MODELO_ROSTO }, 4 * 60_000);
  } catch (e) {
    console.warn(`[juntar-gemeo] sem medida de sincronia: ${e instanceof Error ? e.message : e}`);
    return { boca_ms: null, corr: null, fala_ms: null };
  }
}

/** Quanto adiantar o som deste pedaço (ms; negativo atrasa), pela medida da boca. */
function correcaoDaBoca(m) {
  if (m?.boca_ms === null || m?.boca_ms === undefined || (m.corr ?? 0) < SINCRONIA_CORRELACAO_MINIMA) return 0;
  const desvio = m.boca_ms - SINCRONIA_NATURAL_MS;
  if (Math.abs(desvio) < SINCRONIA_TOLERANCIA_MS || Math.abs(m.boca_ms) > SINCRONIA_TETO_MS) return 0;
  return Math.round(desvio);
}

/**
 * Os pedaços do gerador num vídeo só. `pedido.pedacos`: [{ url, segundos,
 * falaUrl? }], na ordem da fala; `segundos` é a duração da FALA daquele
 * pedaço e `falaUrl` (04/10) é a fala preparada (`prepararFala`, WAV).
 *
 * O corte no fim de cada pedaço: o OmniHuman devolve meio segundo a mais que o
 * áudio (27,4 s de vídeo para 26,9 s de fala, medido no teste de 01/10). Sem
 * aparar, cada emenda ganha uma pausa muda, e num vídeo de 6 pedaços isso são
 * 3 segundos de gente parada. Deixamos 0,15 s de respiro.
 *
 * SINCRONIA PERFEITA (04/10/2026), três regras:
 *
 *  1. imagem e som de cada pedaço são cortados no MESMO instante, num número
 *     inteiro de quadros: o vídeo vai até o quadro N e o som é aparado e
 *     completado com silêncio até exatamente N/25 s. Antes, o som de um
 *     pedaço podia ser 40 ms mais curto que a imagem, e a emenda dependia do
 *     concat preencher a diferença;
 *  2. o som que entra é a NOSSA fala (WAV), e não o AAC recomprimido do
 *     gerador: a posição dela é achada pela correlação com o som do pedaço
 *     (a HeyGen atrasa o próprio áudio em ~21 ms, medido em 04/10). Sem a
 *     fala preparada (pedido antigo, worker antigo), vale o som do gerador;
 *  3. a boca é medida contra o som (gemeo-sincronia.py) e, se o som estiver
 *     fora do natural por mais de um quadro, ele é adiantado ou atrasado
 *     naquele pedaço. O OmniHuman entregou o som 70 a 100 ms depois da boca
 *     em todos os pedaços do vídeo de 03/10 (o natural é 15 ms).
 *
 * A aceleração de 7% (a voz aprovada) agora vem na fala preparada, antes do
 * gerador; `velocidade` só continua aqui para os pedidos antigos, com a fala
 * crua (ver `prepararFala`).
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
    let fala = null;
    if (p.falaUrl) {
      fala = join(pasta, `fala-${i}.wav`);
      try {
        await baixar(p.falaUrl, fala);
      } catch (e) {
        console.warn(`[juntar-gemeo] fala ${i + 1} não baixou, vai o som do gerador: ${e instanceof Error ? e.message : e}`);
        fala = null;
      }
    }
    const ate = p.segundos ? Math.min(info.duracaoSec, Number(p.segundos) + 0.15) : info.duracaoSec;
    const quadros = Math.max(1, Math.round(ate * QUADROS_POR_SEGUNDO));
    const medida = await medirSincronia(arq, fala);
    // A nossa fala só entra se a correlação achou onde ela está no pedaço.
    const usarFala = Boolean(fala) && medida.fala_ms !== null && medida.fala_ms !== undefined && Math.abs(medida.fala_ms) < 400;
    arquivos.push({ arq, fala: usarFala ? fala : null, quadros, largura: info.largura, altura: info.altura, medida, correcao: correcaoDaBoca(medida) });
  }
  // O pedaço curto (2 a 3 s) mede com pouca confiança. O atraso é do gerador,
  // e não do pedaço: quem não mediu bem recebe a correção mediana dos que
  // mediram (no vídeo de 03/10, o pedaço de 2,9 s mediu 70 ms com correlação
  // 0,28, e os outros dois, 100 e 80 ms).
  const confiaveis = arquivos.filter((a) => (a.medida.corr ?? 0) >= SINCRONIA_CORRELACAO_MINIMA && a.medida.boca_ms !== null).map((a) => a.correcao);
  if (confiaveis.length) {
    const ordenadas = [...confiaveis].sort((x, y) => x - y);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];
    for (const a of arquivos) {
      if ((a.medida.corr ?? 0) < SINCRONIA_CORRELACAO_MINIMA || a.medida.boca_ms === null) {
        a.correcao = mediana;
        a.correcaoPelaMediana = true;
      }
    }
  }
  // O tamanho do primeiro pedaço manda; os outros entram nele sem esticar.
  const L = arquivos[0].largura - (arquivos[0].largura % 2);
  const A = arquivos[0].altura - (arquivos[0].altura % 2);
  const entradas = [];
  const filtros = [];
  for (const [i, a] of arquivos.entries()) {
    const iv = entradas.length / 2;
    entradas.push("-i", a.arq);
    let ia = iv;
    if (a.fala) {
      ia = entradas.length / 2;
      entradas.push("-i", a.fala);
    }
    const dur = (a.quadros / QUADROS_POR_SEGUNDO).toFixed(3);
    filtros.push(
      `[${iv}:v]fps=${QUADROS_POR_SEGUNDO},trim=end_frame=${a.quadros},setpts=PTS-STARTPTS,` +
        `scale=${L}:${A}:force_original_aspect_ratio=decrease,pad=${L}:${A}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[v${i}]`
    );
    // Quanto ATRASAR o som (ms): a posição da nossa fala no pedaço, menos a
    // correção da boca (que adianta).
    const atraso = (a.fala ? Number(a.medida.fala_ms) : 0) - a.correcao;
    const mover =
      atraso >= 1 ? `adelay=${Math.round(atraso)},` : atraso <= -1 ? `atrim=start=${(-atraso / 1000).toFixed(3)},asetpts=PTS-STARTPTS,` : "";
    filtros.push(
      `[${ia}:a]aformat=channel_layouts=mono,aresample=48000,${mover}apad,atrim=duration=${dur},asetpts=PTS-STARTPTS[a${i}]`
    );
  }
  const velocidade = Number(pedido.velocidade ?? process.env.GEMEO_VELOCIDADE ?? 1.07) || 1;
  const todasPreparadas = arquivos.every((a) => a.fala);
  const posVideo = velocidade === 1 ? "null" : `setpts=PTS/${velocidade},fps=${QUADROS_POR_SEGUNDO}`;
  // A fala preparada já está em -16 LUFS; o som do gerador (pedido antigo) é
  // nivelado aqui, uma vez, no vídeo inteiro.
  const posAudio = [velocidade === 1 ? null : `atempo=${velocidade}`, todasPreparadas ? null : `loudnorm=I=${ALVO_LUFS}:TP=${ALVO_PICO}:LRA=11,aresample=48000`]
    .filter(Boolean)
    .join(",");
  const juncao =
    arquivos.map((_, i) => `[v${i}][a${i}]`).join("") +
    `concat=n=${arquivos.length}:v=1:a=1[vj][aj];` +
    `[vj]${posVideo}[v];` +
    // Mono duplicado nos dois canais, sem os 3 dB que o upmix tirava.
    `[aj]${posAudio ? `${posAudio},` : ""}pan=stereo|c0=c0|c1=c0[a]`;
  const roteiroDoFiltro = join(pasta, "filtro.txt");
  await writeFile(roteiroDoFiltro, `${filtros.join(";")};${juncao}`);
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
      "-r", String(QUADROS_POR_SEGUNDO),
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "48000",
      "-movflags", "+faststart",
      saida,
    ],
    { timeoutMs: 20 * 60_000 }
  );
  const info = await ffprobe(saida);
  const sincronia = arquivos.map((a, i) => ({
    pedaco: i + 1,
    bocaMs: a.medida.boca_ms ?? null,
    correlacao: a.medida.corr ?? null,
    falaMs: a.medida.fala_ms ?? null,
    correcaoMs: a.correcao,
    pelaMediana: Boolean(a.correcaoPelaMediana),
    somDaFala: Boolean(a.fala),
  }));
  console.log(`[juntar-gemeo] ${pedido.chave ?? ""} sincronia ${JSON.stringify(sincronia)}`);
  return { arquivo: saida, duracaoSec: info.duracaoSec, largura: info.largura, altura: info.altura, sincronia };
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
