/**
 * Gera a versao publicavel do prototipo, com o robo.glb embutido em base64.
 * O artefato do Claude so serve tipos web padrao, e model/gltf-binary nao e um.
 *
 *   node docs/design/escritorio-3d/montar.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(aqui, "escritorio.html"), "utf8");
const glb = readFileSync(join(aqui, "robo.glb")).toString("base64");
const saida = html
  .replace('<script type="importmap">', `<script>window.ROBO_DATA = "data:model/gltf-binary;base64,${glb}";</script>\n<script type="importmap">`)
  .replace('loader.load("robo.glb"', "loader.load(window.ROBO_DATA");
writeFileSync(join(aqui, "escritorio-publicado.html"), saida);
console.log("escritorio-publicado.html:", (saida.length / 1024).toFixed(0), "KB");
