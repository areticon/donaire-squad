/**
 * FASTSTART: o índice do mp4 vai para o COMEÇO do arquivo (28/09).
 *
 * O Bruno tentou ver o vídeo de 29 s do dia 28 e "fica travando, está
 * horrível". O arquivo estava perfeito (h264, 720x1280, 3,6 Mbps), e o
 * defeito era a ordem das caixas: o Veo devolve o `moov` (o índice que diz
 * onde está cada quadro) no FIM, depois dos 13 MB de `mdat`. O navegador não
 * toca nada sem o índice, então precisa buscar o fim do arquivo antes, e
 * pula, para e retoma a cada salto.
 *
 * Aqui é o que o `qt-faststart` faz, sem ffmpeg (o servidor web não tem):
 * reordena as caixas do topo para ftyp, moov, mdat, e soma o tamanho do moov
 * a cada endereço de pedaço (`stco` e `co64`), porque os dados andaram para
 * frente exatamente esse tanto. Nenhum quadro é recodificado.
 */

type Caixa = { tipo: string; inicio: number; tamanho: number };

function lerCaixas(buf: Buffer, inicio: number, fim: number): Caixa[] {
  const caixas: Caixa[] = [];
  let pos = inicio;
  while (pos + 8 <= fim) {
    let tamanho = buf.readUInt32BE(pos);
    const tipo = buf.toString("latin1", pos + 4, pos + 8);
    if (tamanho === 1) {
      // Tamanho de 64 bits, logo depois do tipo.
      const alto = buf.readUInt32BE(pos + 8);
      const baixo = buf.readUInt32BE(pos + 12);
      tamanho = alto * 2 ** 32 + baixo;
    } else if (tamanho === 0) {
      tamanho = fim - pos; // vai até o fim do arquivo
    }
    if (tamanho < 8 || pos + tamanho > fim) throw new Error(`caixa ${tipo} com tamanho inválido`);
    caixas.push({ tipo, inicio: pos, tamanho });
    pos += tamanho;
  }
  return caixas;
}

const CONTEINERES = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex"]);

/** Soma `delta` a todo endereço de pedaço dentro do moov (já copiado). */
function corrigirEnderecos(moov: Buffer, inicio: number, fim: number, delta: number): void {
  for (const c of lerCaixas(moov, inicio, fim)) {
    const corpo = c.inicio + 8;
    if (CONTEINERES.has(c.tipo)) {
      corrigirEnderecos(moov, corpo, c.inicio + c.tamanho, delta);
    } else if (c.tipo === "stco") {
      const n = moov.readUInt32BE(corpo + 4);
      for (let i = 0; i < n; i++) {
        const p = corpo + 8 + i * 4;
        const novo = moov.readUInt32BE(p) + delta;
        if (novo > 0xffffffff) throw new Error("endereço passou de 32 bits: precisaria converter stco em co64");
        moov.writeUInt32BE(novo, p);
      }
    } else if (c.tipo === "co64") {
      const n = moov.readUInt32BE(corpo + 4);
      for (let i = 0; i < n; i++) {
        const p = corpo + 8 + i * 8;
        moov.writeBigUInt64BE(moov.readBigUInt64BE(p) + BigInt(delta), p);
      }
    }
  }
}

/**
 * Devolve o mp4 com o índice no começo. Se ele já estiver lá, ou se o arquivo
 * não tiver a forma esperada, devolve o próprio arquivo: tocar travando é
 * ruim, e não tocar nada seria pior.
 */
export function faststart(entrada: Buffer): Buffer {
  try {
    const topo = lerCaixas(entrada, 0, entrada.length);
    const moov = topo.find((c) => c.tipo === "moov");
    const mdat = topo.find((c) => c.tipo === "mdat");
    if (!moov || !mdat || moov.inicio < mdat.inicio) return entrada;

    const copia = Buffer.from(entrada.subarray(moov.inicio, moov.inicio + moov.tamanho));
    corrigirEnderecos(copia, 0, copia.length, moov.tamanho);

    // Tudo o que vinha antes do mdat, depois o moov, depois o resto sem o moov.
    const antes = topo.filter((c) => c.inicio < mdat.inicio && c.tipo !== "moov");
    const depois = topo.filter((c) => c.inicio >= mdat.inicio && c.tipo !== "moov");
    const parte = (c: Caixa) => entrada.subarray(c.inicio, c.inicio + c.tamanho);
    return Buffer.concat([...antes.map(parte), copia, ...depois.map(parte)]);
  } catch {
    return entrada;
  }
}
