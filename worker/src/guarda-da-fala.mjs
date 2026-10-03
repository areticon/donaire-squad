import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { ffprobe, opcaoDeFiltro, rodar } from "./ffmpeg.mjs";

/**
 * A GUARDA NA SAÍDA (03/10/2026), o lado do worker.
 *
 * Depois do render FINAL (completo e cada corte), antes de avisar o app: o
 * arquivo já subiu, a URL pública vai ao app (`/api/videos/[id]/guarda-da-fala`,
 * lib/media/guarda-da-fala.ts), que transcreve o PRÓPRIO arquivo na Deepgram e
 * roda o detector de retomadas nessa fala. Se sobrar tentativa errada seguida
 * da tomada refeita, ou gagueira ("E, e, e"), o app devolve os trechos no
 * tempo do arquivo; aqui o arquivo é aparado e sobe de novo, e é ESSE que vai
 * ao cliente.
 *
 * Nada aqui segura uma entrega: app fora do ar, Deepgram falhando ou ffmpeg
 * recusando, o arquivo vai como estava e o motivo fica no relatório.
 *
 * O pedido traz `guardaDaFala: { url, rotulo }` só nos renders finais (o app
 * decide; prévia não passa por aqui).
 */

const FADE = 0.03;

function manterDe(remover, duracao) {
  const ordenadas = [...remover].filter((r) => r.ate > r.de).sort((a, b) => a.de - b.de);
  const fica = [];
  let t = 0;
  for (const r of ordenadas) {
    if (r.de > t + 0.02) fica.push({ de: t, ate: Math.min(r.de, duracao) });
    t = Math.max(t, r.ate);
  }
  if (duracao > t + 0.02) fica.push({ de: t, ate: duracao });
  return fica.filter((m) => m.ate - m.de > 0.04);
}

/**
 * Tira os trechos `remover` do arquivo (trim + concat, um passe, com o mesmo
 * fade de 30 ms das emendas da limpeza). Recodifica no padrão do player
 * (x264 crf 18, GOP 60, faststart): a fatia que sai tem 1 a 3 s e as bordas
 * caem no silêncio, então a emenda é igual às da limpeza.
 */
export async function apararArquivo(entrada, saida, remover, pasta) {
  const dim = await ffprobe(entrada);
  const duracao = dim.duracaoSec;
  if (!duracao) throw new Error("duração do arquivo desconhecida");
  const manter = manterDe(remover, duracao);
  if (!manter.length) throw new Error("a guarda pediu para tirar o arquivo inteiro");
  const partes = [];
  const mapa = [];
  manter.forEach((m, i) => {
    const dur = m.ate - m.de;
    const d = Math.min(FADE, dur / 3).toFixed(3);
    partes.push(
      `[0:v]trim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${m.de.toFixed(3)}:end=${m.ate.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${d},afade=t=out:st=${Math.max(0, dur - Number(d)).toFixed(3)}:d=${d}[a${i}]`
    );
    mapa.push(`[v${i}][a${i}]`);
  });
  const grafo = partes.join(";") + ";" + mapa.join("") + `concat=n=${manter.length}:v=1:a=1[v][a]`;
  const arquivoDeFiltro = join(pasta, "guarda-filtro.txt");
  await writeFile(arquivoDeFiltro, grafo, "utf8");
  await rodar(
    [
      "-i", entrada,
      opcaoDeFiltro(), arquivoDeFiltro,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
      "-maxrate", "6M", "-bufsize", "12M", "-g", "60",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", saida,
    ],
    { timeoutMs: Math.max(30 * 60_000, Math.round(duracao * 2000)) }
  );
  const tirado = remover.reduce((s, r) => s + Math.max(0, r.ate - r.de), 0);
  return { manter: manter.length, segundosTirados: +tirado.toFixed(2), duracaoAntes: duracao };
}

/** Pergunta ao app o que tirar do arquivo publicado em `url`. */
export async function perguntarAGuarda(guarda, url, protegido, assinar) {
  const corpo = JSON.stringify({ url, protegido, rotulo: guarda.rotulo ?? "" });
  const r = await fetch(guarda.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demandou-assinatura": assinar(corpo) },
    body: corpo,
    signal: AbortSignal.timeout(295_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`guarda respondeu ${r.status}: ${texto.slice(0, 200)}`);
  return JSON.parse(texto);
}

/**
 * A guarda inteira: pergunta, apara se for o caso e sobe o aparado, até
 * `guarda.rodadas` vezes (padrão 2). A segunda rodada existe porque a fala do
 * arquivo aparado é transcrita de novo e o que estava colado no que saiu
 * aparece (medido em 03/10 na base de 17 min: a primeira rodada tirou 11
 * trechos e a segunda achou mais 4, entre eles "está trazendo uma promessa
 * pra uma cidade," refeita como "pra uma nação"). Devolve o `montado` que vai
 * ao app (o último, ou o mesmo) e o relatório.
 */
export async function guardarFala({ arquivo, montado, guarda, protegido = [], pasta, chave, subir, assinar }) {
  if (!guarda?.url) return { montado, relatorio: null };
  const t0 = Date.now();
  const rodadas = Math.max(1, Math.min(3, Number(guarda.rodadas) || 2));
  const feitas = [];
  let atual = { arquivo, montado };
  try {
    for (let n = 0; n < rodadas; n++) {
      const resposta = await perguntarAGuarda(guarda, atual.montado.url, protegido, assinar);
      const remover = (resposta.remover ?? []).filter((r) => Number.isFinite(r.de) && Number.isFinite(r.ate) && r.ate > r.de);
      if (!remover.length) break;
      const aparado = join(pasta, `guarda-aparado-${n}.mp4`);
      const medida = await apararArquivo(atual.arquivo, aparado, remover, pasta);
      const novo = await subir(aparado, chave, "video/mp4");
      console.log(`[guarda-da-fala ${chave}] rodada ${n + 1}: ${remover.length} trecho(s) tirado(s), ${medida.segundosTirados}s`);
      feitas.push({ tirados: remover.length, ...medida, sobras: resposta.sobras ?? [], antesUrl: atual.montado.url });
      atual = { arquivo: aparado, montado: novo };
    }
    return {
      montado: atual.montado,
      arquivo: atual.arquivo,
      relatorio: {
        conferido: true,
        tirados: feitas.reduce((s, f) => s + f.tirados, 0),
        sobras: feitas.flatMap((f) => f.sobras),
        rodadas: feitas,
        segundos: Math.round((Date.now() - t0) / 1000),
      },
    };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(`[guarda-da-fala ${chave}] falhou, o arquivo vai como está: ${motivo}`);
    // O que já foi aparado numa rodada anterior vale (já está publicado).
    return { montado: atual.montado, relatorio: { conferido: false, motivo: motivo.slice(0, 300), rodadas: feitas } };
  }
}
