// Mede quadros por segundo do render, por trecho, sem refazer a montagem
// inteira. Uso (a pasta tem narrador.mp4 e, se houver, recortado.webm):
//   node remotion/medir.mjs <pasta> <montagem.json> <de-ate> [<de-ate> ...]
// Serve para achar o que é caro no desenho (30/09: meta do dono de 1,5 min
// de processamento por minuto de vídeo).
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { availableParallelism } from "node:os";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { bundleDoRemotion, servirPasta, opcoesDoRender } from "../src/montagem.mjs";

const [pasta, arquivo, ...faixas] = process.argv.slice(2);
const montagem = JSON.parse(readFileSync(arquivo, "utf8"));
const serveUrl = await bundleDoRemotion({ refazer: true });
const servidor = await servirPasta(pasta);
const inputProps = {
  montagem,
  narradorUrl: `${servidor.base}/narrador.mp4`,
  recortadoUrl: existsSync(join(pasta, "recortado.webm")) ? `${servidor.base}/recortado.webm` : null,
  cheio: existsSync(join(pasta, "narrador-cheio.mp4")) ? { url: `${servidor.base}/narrador-cheio.mp4`, recorte: montagem.cenas.find((c) => c.layout === "narrador-cheio")?.narrador?.recorte } : null,
  recortados: Object.fromEntries(montagem.cenas.map((c, i) => [i, `recortado-${i}.mp4`]).filter(([, a]) => existsSync(join(pasta, a))).map(([i, a]) => [i, `${servidor.base}/${a}`])),
  fundos: existsSync(join(pasta, "fundo-papel.jpg"))
    ? { papel: `${servidor.base}/fundo-papel.jpg`, "papel-marca": `${servidor.base}/fundo-papel-marca.jpg`, escuro: `${servidor.base}/fundo-escuro.jpg` }
    : null,
};
const composition = await selectComposition({ serveUrl, id: "Montagem", inputProps });
console.log(`cpus ${availableParallelism()}, concorrência ${opcoesDoRender().concurrency}`);
for (const f of faixas) {
  const [de, ate] = f.split("-").map(Number);
  const saida = join(pasta, `medida-${de}-${ate}.mp4`);
  const t = Date.now();
  await renderMedia({ ...opcoesDoRender(), composition, serveUrl, inputProps, outputLocation: saida, frameRange: [de, ate] });
  const s = (Date.now() - t) / 1000;
  console.log(`quadros ${de}-${ate}: ${s.toFixed(1)} s, ${((ate - de + 1) / s).toFixed(1)} quadros/s`);
  rmSync(saida, { force: true });
}
await servidor.fechar();
