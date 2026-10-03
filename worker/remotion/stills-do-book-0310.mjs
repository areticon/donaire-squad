// Quadros de exemplo dos 3 estilos em destaque (03/10, book de modelos): cada
// peça do editor sob medida parada no meio da camada, em 1080x1920, sobre um
// quadro neutro, salva em public/estilos-de-video/<estilo>/. Roda uma vez, à
// mão; não faz parte do worker. Cores de exemplo: as da Demandou.
// Uso (na pasta worker): node remotion/stills-do-book-0310.mjs <quadro-base-9x16.jpg> <pasta-de-saida>
import { renderStill, selectComposition } from "@remotion/renderer";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bundleDoRemotion } from "../src/montagem.mjs";

const [base, saida] = process.argv.slice(2);
const ESTILOS = {
  lousa: { visual: "vidro", fonte: ["Geist", 600, false], pecas: [
    ["titulo", { rotulo: "Capítulo 1", titulo: "Conteúdo constante **vende mais**", apoio: "Uma gravação por semana vira a semana inteira." }],
    ["escada", { titulo: "Do zero ao **primeiro cliente**", degraus: [{ rotulo: "Gravar" }, { rotulo: "Cortar" }, { rotulo: "Publicar" }, { rotulo: "Vender" }] }, [0.1, 0.3, 0.5, 0.7]],
    ["numero", { rotulo: "Decisão", antes: "Antes do vendedor,", valor: 70, sufixo: "%", apoio: "da compra **já foi decidida**" }],
    ["checklist", { titulo: "Antes de gravar", itens: [{ texto: "Um tema por vídeo" }, { texto: "Gancho nos 3 segundos" }, { texto: "Uma chamada no fim" }] }, [0.1, 0.3, 4]],
  ] },
  consorcio: { visual: "impacto", fonte: ["Oswald", 700, true], pecas: [
    ["cifrao", { simbolo: "R$", valor: "R$ 300 mil", rotulo: "de carta de crédito" }],
    ["frase-impacto", { texto: "Sua chave, **planejada**." }],
    ["comparacao", { titulo: "Aluguel ou **consórcio**", esquerda: { titulo: "Aluguel", itens: ["Paga e não fica", "Reajuste todo ano"] }, direita: { titulo: "Consórcio", itens: ["Parcela vira patrimônio", "Sem juros"] } }, [0.3]],
    ["rotulo-inferior", { nome: "Seu **nome**", descricao: "Consultor de consórcio" }],
  ] },
  vox: { visual: "documental", fonte: ["Playfair Display", 700, false], pecas: [
    ["citacao", { texto: "Quem é lembrado **é escolhido**.", autor: "Equipe de conteúdo" }],
    ["linha-do-tempo", { titulo: "Como a venda **acontece**", passos: [{ rotulo: "Conteúdo", texto: "você aparece" }, { rotulo: "Conversa", texto: "o cliente pergunta" }, { rotulo: "Venda", texto: "ele já confia" }] }, [0.1, 0.3, 0.5]],
    ["sublinhado", { texto: "Constância" }],
    ["pergunta-resposta", { pergunta: "Sem tempo de gravar?", resposta: "Uma gravação vira a semana." }, [0.2]],
  ] },
};
const serveUrl = await bundleDoRemotion({ refazer: true });
const W = 1080, H = 1920;
for (const [id, est] of Object.entries(ESTILOS)) {
  const pasta = join(saida, id);
  mkdirSync(pasta, { recursive: true });
  const tema = { acento: "#F97316", acentoMarca: "#F97316", escuro: "#1e1f22", claro: "#dbdee1", fonteTitulo: est.fonte[0], pesoTitulo: est.fonte[1], fonteTexto: "Geist", fonteMono: "Geist Mono", visual: est.visual, caixaAlta: est.fonte[2] };
  for (const [k, [peca, props, ev]] of est.pecas.entries()) {
    const camada = { id: "c", peca, de: 0, ate: 10, entrada: 1.3, saida: 0.3, evento: 0.7, eventos: ev ?? [], props };
    const inputProps = { largura: W, altura: H, fps: 30, tema, camadas: [camada], trechos: [{ c0: 0, t0: 8.5, n: 1 }], logoUrl: null };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps });
    const png = join(pasta, `${k}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: png, frame: 0, imageFormat: "png" });
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", base, "-i", png, "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay,scale=540:960`, "-q:v", "4", join(pasta, `${k + 1}.jpg`)], { stdio: "inherit" });
    console.log(id, peca);
  }
}
console.log("ok");
process.exit(0);
