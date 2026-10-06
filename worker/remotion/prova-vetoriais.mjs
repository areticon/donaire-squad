// Prova das peças vetoriais (06/10, tarefa D): cada peça parada em alguns instantes, sobre um quadro real
// 9:16, com a caixa abaixo do rosto (o que o resolvedor mede). Só para conferir o desenho; nada pago.
// Uso (de worker/): node remotion/prova-vetoriais.mjs <pasta> <quadro-9x16.jpg> [visual] [acento]
import { renderStill, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bundleDoRemotion } from "../src/montagem.mjs";

const [pasta, quadro, visual = "vidro", acento = "#F97316"] = process.argv.slice(2);
mkdirSync(pasta, { recursive: true });
const fontes = { vidro: ["Geist", 600, false], impacto: ["Archivo Black", 400, true], documental: ["Playfair Display", 700, false] }[visual];
const tema = { acento, escuro: "#1e1f22", claro: "#dbdee1", fonteTitulo: fontes[0], pesoTitulo: fontes[1], fonteTexto: "Geist", fonteMono: "Geist Mono", visual, caixaAlta: fontes[2] };
const ABAIXO = { x: 0.06, y: 0.735, w: 0.88, h: 0.22 };
const PECAS = [
  ["titulo-em-caixa", { texto: "Hábitos que **ninguém** te ensina", caixa: { x: 0.1, y: 0.1, w: 0.8, h: 0.11 } }, [], [0.2, 1.5]],
  ["icone-com-frase", { rotulo: "Regra 01", icone: "despertador", frase: "Ponha um alarme para dormir", caixa: ABAIXO }, [], [0.5, 2]],
  ["icone-com-frase", { rotulo: "Regra 02", icone: "tv-desligada", frase: "Desligue a TV às **22h**", caixa: ABAIXO }, [], [2]],
  ["comparacao-lado-a-lado", { rotuloNao: "Não diga", rotuloSim: "Diga", pares: [{ nao: "Preço", sim: "Investimento" }, { nao: "Custo", sim: "Retorno" }, { nao: "Contrato", sim: "Acordo" }], caixa: ABAIXO }, [0.3, 1.1, 1.9], [1.3, 3]],
  ["cartoes-em-linha", { itens: [{ titulo: "Gravar", icone: "claquete" }, { titulo: "Editar", icone: "tesoura" }, { titulo: "Publicar", icone: "foguete" }], caixa: { x: 0.06, y: 0.76, w: 0.88, h: 0.17 } }, [0.2, 0.6, 1.0], [0.7, 2.5]],
  ["interface-de-edicao", { titulo: "meu-video-final.mp4", legenda: "a edição sai sozinha enquanto você grava", etapas: ["corte", "legenda", "zoom"], caixa: { x: 0.06, y: 0.72, w: 0.88, h: 0.26 } }, [0.6, 1.4, 2.2], [1.2, 2.6, 4]],
];
const serveUrl = await bundleDoRemotion({ refazer: true });
const saidas = [];
for (const [k, [peca, props, ev, instantes]] of PECAS.entries()) {
  for (const t of instantes) {
    const camada = { id: "c", peca, de: 0, ate: 6, entrada: 0.8, saida: 0.3, evento: 0.6, eventos: ev, props };
    const inputProps = { largura: 1080, altura: 1920, fps: 30, tema, camadas: [camada], trechos: [{ c0: 0, t0: t, n: 1 }], logoUrl: null };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps });
    const nome = `${visual}-${String(k).padStart(2, "0")}-${peca}-t${t}`;
    const png = join(pasta, `${nome}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: png, frame: 0, imageFormat: "png" });
    const jpg = join(pasta, `${nome}.jpg`);
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", quadro, "-i", png, "-filter_complex", "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[b];[b][1:v]overlay,format=yuvj420p", "-q:v", "3", jpg]);
    saidas.push(jpg);
    console.log(jpg);
  }
}
console.log("ok", saidas.length);
