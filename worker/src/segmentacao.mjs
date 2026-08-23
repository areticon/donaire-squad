import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** O recorte.py mora ao lado deste arquivo, e não na pasta temporária. */
const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * A ponte para o recorte da pessoa, que roda em Python.
 *
 * Existe porque segmentação de pessoa precisa de modelo, e o único que roda
 * rápido em CPU sem GPU é o Selfie Segmenter do MediaPipe, com binding maduro só
 * em Python. O `recorte.py` faz o trabalho e devolve duas coisas: um vídeo em
 * tons de cinza, que é a máscara, e a caixa APERTADA em pixels.
 *
 * A caixa apertada importa tanto quanto a máscara. O Node precisa recortar a
 * imagem colorida exatamente onde o Python recortou, senão a máscara fica
 * deslocada da pessoa e o resultado é um recorte torto, que é pior que não
 * recortar.
 *
 * ## Falhar aqui não derruba o corte
 *
 * Mesma regra do agente de visão: sem recorte o vídeo sai na composição antiga,
 * que é pior mas existe. Entregar corte mediano é melhor que não entregar corte
 * porque o modelo de segmentação teve um dia ruim.
 */

const MODELO =
  process.env.MODELO_SEGMENTACAO ?? "/app/modelos/selfie_segmenter.tflite";

/** O tempo que a segmentação pode levar, proporcional ao trecho.
 *
 * Medido em 23/08 no vídeo real: 180 quadros em 11,9 s, ou seja perto de 2x o
 * tempo real, contando a decodificação e a codificação da máscara. Seis vezes a
 * duração dá folga de três, e o piso de dois minutos cobre trecho curto, em que
 * a partida do Python pesa mais que o trabalho.
 */
function prazo(duracaoSec) {
  return Math.max(120_000, Math.round(duracaoSec * 6_000));
}

/**
 * Gera a máscara de recorte de um trecho.
 *
 * Devolve `null` quando não dá para recortar, e quem chama cai na composição
 * antiga.
 */
export async function gerarMatte(entrada, pasta, indice, inicio, duracao, caixa) {
  if (!caixa) return null;

  const saida = join(pasta, `matte-${indice}.mp4`);
  const config = JSON.stringify({
    video: entrada,
    saida,
    inicio,
    duracao,
    fps: 30,
    modelo: MODELO,
    caixa,
  });

  const texto = await new Promise((resolve) => {
    const p = spawn("python3", [join(AQUI, "recorte.py"), config], {
      cwd: pasta,
    });
    let saidaPadrao = "";
    let erro = "";
    p.stdout.on("data", (d) => (saidaPadrao += d));
    p.stderr.on("data", (d) => (erro += d));

    const relogio = setTimeout(() => {
      p.kill("SIGKILL");
      resolve(null);
    }, prazo(duracao));

    p.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) {
        // O stderr do MediaPipe é barulhento mesmo quando dá certo, então só
        // interessa quando o processo morreu.
        console.error(
          `[recorte ${indice}] python saiu com ${codigo}: ${erro.slice(-400)}`
        );
        return resolve(null);
      }
      resolve(saidaPadrao);
    });
    p.on("error", (e) => {
      clearTimeout(relogio);
      console.error(`[recorte ${indice}] não consegui rodar o python: ${e.message}`);
      resolve(null);
    });
  });

  if (!texto) return null;

  try {
    // O MediaPipe escreve avisos no stdout em algumas versões, então pega a
    // última linha que é JSON em vez de assumir que a saída inteira é JSON.
    const linha = texto
      .trim()
      .split(String.fromCharCode(10))
      .reverse()
      .find((l) => l.trim().startsWith("{"));
    if (!linha) return null;

    const r = JSON.parse(linha);
    if (!r.ok || !r.recorte || r.quadros < 1) return null;
    return { arquivo: saida, recorte: r.recorte, quadros: r.quadros };
  } catch {
    return null;
  }
}
