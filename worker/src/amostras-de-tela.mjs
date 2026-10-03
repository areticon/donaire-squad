import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * OS PRINTS DA GRAVAÇÃO para a detecção de tela compartilhada (01/10/2026).
 *
 * O app decide ONDE tirar (um a cada ~8 s e logo depois de cada "olha na minha
 * tela" da fala, lib/media/faixas-de-tela.ts) e quem classifica é o Claude com
 * visão, no app. Aqui só se tira cada print do arquivo já baixado: busca
 * rápida (-ss antes do -i) num arquivo local leva ~0,1 s por print, então 200
 * prints saem em poucos segundos, com 4 ffmpeg por vez.
 *
 * 640 px de largura: o bastante para a visão ler o título da janela e
 * reconhecer o aplicativo, e pouco o bastante para a resposta (base64 em
 * JSON) ficar em poucos MB.
 */

const PARALELO = 4;

// Um print leva ~0,1 s; 30 s é sinal de ffmpeg travado. Em 02/10 dois prints
// ficaram 70 minutos parados em produção (sem -nostdin e sem prazo) e
// seguraram a fila de montagem inteira. Agora: sem stdin, e morto no prazo.
const PRAZO_DO_PRINT_MS = 30_000;

function umPrint(arquivo, t, saida, largura) {
  return new Promise((resolver) => {
    const p = spawn("ffmpeg", [
      "-nostdin", "-v", "error", "-y", "-ss", Math.max(0, t).toFixed(3), "-i", arquivo,
      "-frames:v", "1", "-vf", `scale=${largura}:-2:flags=bicubic`, "-q:v", "6", saida,
    ], { stdio: ["ignore", "ignore", "ignore"] });
    const prazo = setTimeout(() => {
      console.error(`[amostras-de-tela] print em ${t.toFixed(2)} s passou de ${PRAZO_DO_PRINT_MS / 1000} s; encerrado`);
      p.kill("SIGKILL");
    }, PRAZO_DO_PRINT_MS);
    p.on("error", () => {
      clearTimeout(prazo);
      resolver(false);
    });
    p.on("close", (codigo) => {
      clearTimeout(prazo);
      resolver(codigo === 0);
    });
  });
}

/** Os prints pedidos, em base64. Print que falhar (instante depois do fim) só não volta. */
export async function amostrarQuadros(arquivo, instantes, pasta, { largura = 640 } = {}) {
  const lista = (instantes ?? []).filter((t) => Number.isFinite(t) && t >= 0).slice(0, 400);
  const saida = new Array(lista.length).fill(null);
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALELO, lista.length) }, async () => {
      while (proximo < lista.length) {
        const k = proximo++;
        const caminho = join(pasta, `amostra-${String(k).padStart(4, "0")}.jpg`);
        if (await umPrint(arquivo, lista[k], caminho, largura)) {
          const dados = await readFile(caminho).catch(() => null);
          if (dados?.length) saida[k] = { t: lista[k], base64: dados.toString("base64") };
          await rm(caminho, { force: true }).catch(() => {});
        }
      }
    })
  );
  return saida.filter(Boolean);
}
