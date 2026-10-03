import { spawn } from "node:child_process";
import { join } from "node:path";
import { rodar } from "./ffmpeg.mjs";

/**
 * A CONFERÊNCIA DEPOIS DO RENDER (02/10/2026). Nunca entregar vídeo com
 * trecho vazio.
 *
 * O completo cmuqc9r7z saiu com 3,7 s de tela cinza-escura (uma cartela cujo
 * texto se perdeu no corte da janela), e o MrBeast de 01/10 tinha saído com
 * três quadros laranja só com a legenda. Os dois defeitos passaram porque
 * ninguém olhava o ARQUIVO pronto. Aqui o ffmpeg olha, em duas medidas de uma
 * passada só, a 4 quadros por segundo e num quadro pequeno (barato):
 *
 *   - blackdetect: tela preta ou quase (o cinza-escuro #1e1f22 da marca passa
 *     com pix_th 0,15; com 0,12 não passava, medido no próprio arquivo);
 *   - quadro VAZIO: o quadro inteiro de uma cor só (signalstats, mínimo e
 *     máximo de brilho e de cor quase iguais). Pega a tela de cor chapada de
 *     qualquer cor. E o de POUCO CONTEÚDO (90% de uma cor, com algo pequeno
 *     por cima), que só é relatado: quem julga é a revisão com visão.
 *
 * Trecho que a GRAVAÇÃO também tem (a pessoa apagou a luz, a câmera tapada)
 * não é defeito nosso e não é "consertado": a base é medida no mesmo tempo.
 * O conserto é trocar o trecho pela base (o narrador), com folga de 0,1 s.
 */

const AMOSTRAS_POR_SEGUNDO = 4;
const MINIMO_SEG = 0.45;

/** Mede um arquivo: trechos pretos e lisos, em segundos do próprio arquivo. */
export async function medirVazios(arquivo, { de = 0, ate = null } = {}) {
  const args = [
    "-hide_banner", "-v", "info", "-nostats",
    ...(de > 0 ? ["-ss", de.toFixed(3)] : []),
    "-i", arquivo,
    ...(ate !== null ? ["-t", Math.max(0.1, ate - de).toFixed(3)] : []),
    "-an",
    "-vf", `fps=${AMOSTRAS_POR_SEGUNDO},scale=180:-2:flags=area,blackdetect=d=${MINIMO_SEG}:pix_th=0.15:pic_th=0.97,signalstats,metadata=mode=print:file=-`,
    "-f", "null", "-",
  ];
  const { saida, erro } = await new Promise((resolver, rejeitar) => {
    const p = spawn("ffmpeg", args);
    let s = "";
    let e = "";
    p.stdout.on("data", (d) => (s += d.toString()));
    p.stderr.on("data", (d) => {
      e += d.toString();
      if (e.length > 200_000) e = e.slice(-100_000);
    });
    p.on("error", rejeitar);
    p.on("close", (codigo) => (codigo === 0 ? resolver({ saida: s, erro: e }) : rejeitar(new Error(`medida de vazios saiu com ${codigo}: ${e.slice(-300)}`))));
  });
  const pretos = [...erro.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => ({ de: +m[1] + de, ate: +m[2] + de, tipo: "preto" }));
  // As linhas do metadata: "frame:N pts:... pts_time:T" e depois as chaves.
  const quadros = [];
  let atual = null;
  for (const linha of saida.split(/\r?\n/)) {
    const t = linha.match(/pts_time:([\d.]+)/);
    if (t) {
      atual = { t: +t[1] + de };
      quadros.push(atual);
      continue;
    }
    const kv = linha.match(/lavfi\.signalstats\.(\w+)=([\d.]+)/);
    if (kv && atual) atual[kv[1]] = +kv[2];
  }
  // VAZIO: o quadro inteiro de uma cor só (a faixa de mínimo a máximo quase
  // fechada; medido: 0 no painel vazio, 200+ em qualquer quadro com texto).
  // POUCO CONTEÚDO: 80% do quadro de uma cor só, com algo pequeno por cima
  // (a cartela com uma palavra miúda). Só o vazio é consertado aqui; o pouco
  // conteúdo vai para a revisão com visão, que julga se a palavra basta.
  const vazio = (q) => typeof q.YMAX === "number" && q.YMAX - q.YMIN <= 24 && q.UMAX - q.UMIN <= 16 && q.VMAX - q.VMIN <= 16;
  const liso = (q) => typeof q.YHIGH === "number" && q.YHIGH - q.YLOW <= 10 && q.UHIGH - q.ULOW <= 8 && q.VHIGH - q.VLOW <= 8;
  const corridas = (teste, tipo) => {
    const lista = [];
    let inicio = null;
    quadros.forEach((q, i) => {
      const l = teste(q);
      if (l && inicio === null) inicio = q.t;
      const fecha = inicio !== null && (!l || i === quadros.length - 1);
      if (fecha) {
        const fim = l ? q.t + 1 / AMOSTRAS_POR_SEGUNDO : q.t;
        if (fim - inicio >= MINIMO_SEG) lista.push({ de: +inicio.toFixed(3), ate: +fim.toFixed(3), tipo });
        inicio = null;
      }
    });
    return lista;
  };
  const vazios = corridas(vazio, "vazio");
  const poucos = corridas((q) => liso(q) && !vazio(q), "pouco-conteudo");
  return { trechos: juntar([...pretos, ...vazios]), poucoConteudo: poucos, quadros: quadros.length };
}

/** Junta trechos que se tocam (o preto também é vazio). */
function juntar(trechos) {
  const saida = [];
  for (const t of [...trechos].sort((a, b) => a.de - b.de)) {
    const u = saida[saida.length - 1];
    if (u && t.de <= u.ate + 0.15) {
      u.ate = Math.max(u.ate, t.ate);
      if (u.tipo !== t.tipo) u.tipo = "preto";
    } else saida.push({ ...t });
  }
  return saida;
}

/**
 * Os trechos vazios do VÍDEO EDITADO que a gravação não tem. `base` está no
 * mesmo tempo do editado (o completo antes da abertura).
 */
export async function vaziosDoEditado(editado, base) {
  const e = await medirVazios(editado);
  if (!e.trechos.length) return { defeitos: [], medidos: e.trechos, poucoConteudo: e.poucoConteudo, quadros: e.quadros };
  const defeitos = [];
  for (const t of e.trechos) {
    const b = await medirVazios(base, { de: Math.max(0, t.de - 0.2), ate: t.ate + 0.2 }).catch(() => ({ trechos: [] }));
    const daGravacao = b.trechos.reduce((s, x) => s + Math.max(0, Math.min(t.ate, x.ate) - Math.max(t.de, x.de)), 0);
    if (daGravacao < (t.ate - t.de) * 0.5) defeitos.push(t);
  }
  return { defeitos, medidos: e.trechos, poucoConteudo: e.poucoConteudo, quadros: e.quadros };
}

/**
 * O CONSERTO: nos trechos com defeito, o quadro do editado é trocado pelo da
 * base (o narrador em tela cheia), com 0,1 s de folga de cada lado. Uma
 * passada de ffmpeg no vídeo sem áudio; só roda quando há defeito.
 */
export async function consertarComABase(soVideo, base, defeitos, pasta, { fps, largura, altura, fios = "4" } = {}) {
  if (!defeitos.length) return soVideo;
  const janelas = defeitos.map((d) => `between(t,${Math.max(0, d.de - 0.1).toFixed(3)},${(d.ate + 0.1).toFixed(3)})`).join("+");
  const saida = join(pasta, "so-video-consertado.mp4");
  await rodar(
    [
      "-i", soVideo, "-i", base,
      "-filter_complex", `[1:v]setpts=PTS-STARTPTS,scale=${largura}:${altura}:flags=bicubic,format=yuv420p,setsar=1[b];[0:v]setpts=PTS-STARTPTS,scale=${largura}:${altura}:flags=bicubic,format=yuv420p,setsar=1[e];[e][b]overlay=0:0:enable='${janelas}':shortest=1,format=yuv420p[v]`,
      "-filter_complex_threads", "1",
      "-map", "[v]", "-an", "-fps_mode", "cfr", ...(fps ? ["-r", String(fps)] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
      "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-maxrate", "6M", "-bufsize", "12M",
      "-threads", fios,
      saida,
    ],
    { cwd: pasta, timeoutMs: 60 * 60_000 }
  );
  return saida;
}
