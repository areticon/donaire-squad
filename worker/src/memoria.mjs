import { readFileSync } from "node:fs";
import { freemem, totalmem } from "node:os";

/**
 * A MEMÓRIA DO CONTÊINER (03/10/2026, terceira volta). O completo de
 * cmurtv2zg morreu no render final com "ffmpeg saiu com null" e stderr vazio:
 * processo morto por sinal de fora, o OOM do contêiner (7,6 GB no Railway),
 * com os cortes renderizando ao mesmo tempo. Medido local: cada lote do sob
 * medida em 1080p segura de 1,2 a 1,6 GB de ffmpeg, dois em paralelo, mais o
 * Chrome do Remotion quando ele está aberto.
 *
 * `os.freemem()` dentro do contêiner devolve a memória da MÁQUINA, não o teto
 * do contêiner; aqui vale o cgroup (v2: memory.max e memory.current; v1:
 * memory.limit_in_bytes e memory.usage_in_bytes). Fora do contêiner (o
 * Windows do desenvolvimento), a do sistema.
 */

function lerNumero(arquivo) {
  try {
    const t = readFileSync(arquivo, "utf8").trim();
    if (!t || t === "max") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Memória livre para o worker, em MB: teto do cgroup menos o uso dele (sem cache de página), ou a livre do sistema. */
export function memoriaLivreMb() {
  const teto = lerNumero("/sys/fs/cgroup/memory.max") ?? lerNumero("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const uso = lerNumero("/sys/fs/cgroup/memory.current") ?? lerNumero("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  if (teto && uso !== null && teto < totalmem() * 4) {
    // O cache de arquivo conta no uso do cgroup mas é devolvido sob pressão: desconta o "inactive_file".
    let cache = 0;
    try {
      const stat = readFileSync("/sys/fs/cgroup/memory.stat", "utf8");
      cache = Number(stat.match(/^inactive_file (\d+)/m)?.[1] ?? 0);
    } catch {
      try {
        cache = Number(readFileSync("/sys/fs/cgroup/memory/memory.stat", "utf8").match(/^total_inactive_file (\d+)/m)?.[1] ?? 0);
      } catch {
        cache = 0;
      }
    }
    return Math.round((teto - Math.max(0, uso - cache)) / 1048576);
  }
  return Math.round(freemem() / 1048576);
}

/**
 * Espera haver `mb` livres (de 5 em 5 s) até `ateMs`. Devolve true se houve,
 * false se o prazo passou (quem chamou decide: lote menor, ou seguir).
 */
export async function esperarMemoria(mb, { ateMs = 10 * 60_000, rotulo = "" } = {}) {
  const limite = Date.now() + ateMs;
  let avisou = false;
  for (;;) {
    const livre = memoriaLivreMb();
    if (livre >= mb) return true;
    if (!avisou) {
      console.warn(`[memoria] ${rotulo} espera ${mb} MB livres (há ${livre} MB)`);
      avisou = true;
    }
    if (Date.now() > limite) return false;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
