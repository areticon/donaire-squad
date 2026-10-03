// Empacota a composição do Remotion em worker/remotion/build, na construção
// da imagem Docker: o bundle leva de 15 a 30 s e não pode cair no tempo de
// quem espera a montagem. src/montagem.mjs usa esta pasta quando ela existe.
import { bundle } from "@remotion/bundler";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const saida = await bundle({
  entryPoint: join(aqui, "src", "index.ts"),
  publicDir: resolve(aqui, "..", "fontes"),
  outDir: join(aqui, "build"),
});
console.log("bundle do remotion em", saida);
