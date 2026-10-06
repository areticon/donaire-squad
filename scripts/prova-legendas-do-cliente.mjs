// Prova visual (06/10/2026, noite; vídeo cmux4417u): cada estilo de legenda que o cliente escolhe na tela, pelo ASS
// do editor por comando (worker/src/edicao-sob-medida.mjs legendaSobMedida), queimado num quadro 1080x1920 com as
// fontes do worker. Sem chamada paga. Rodar: node scripts/prova-legendas-do-cliente.mjs [pasta-de-saida]
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { legendaSobMedida } from "../worker/src/edicao-sob-medida.mjs";

const worker = resolve("worker");
const saida = resolve(process.argv[2] ?? "prova-legendas");
mkdirSync(saida, { recursive: true });
const ws = "consórcio de alto padrão".split(" ").map((texto, i) => ({ texto, inicio: i * 0.5, fim: i * 0.5 + 0.45 }));
const estilos = {
  papel: { posicao: "baixo", tamanho: "medio", letra: "limpa", caixaAlta: false, desenho: "papel" },
  caixa: { posicao: "baixo", tamanho: "medio", letra: "limpa", caixaAlta: false, desenho: "caixa" },
  "marca-texto": { posicao: "baixo", tamanho: "medio", letra: "limpa", caixaAlta: false, desenho: "marca-texto" },
  palavra: { posicao: "centro", tamanho: "grande", letra: "condensada", caixaAlta: true, y: 0.6, desenho: "palavra" },
  limpa: { posicao: "baixo", tamanho: "pequeno", letra: "limpa", caixaAlta: false, desenho: "limpa" },
};
for (const [id, estilo] of Object.entries(estilos)) {
  const pal = id === "palavra" ? ws.slice(2).map((w) => ({ ...w, texto: w.texto.toUpperCase() })) : ws;
  const ed = { tema: { acento: "#C9A227", escuro: "#101828", escuroLegenda: "#06111F" }, legenda: { estilo, paginas: [{ inicio: pal[0].inicio, fim: 3, texto: pal.map((w) => w.texto).join(" "), palavras: pal }] } };
  const nome = `prova-${id}.ass`;
  writeFileSync(join(worker, nome), legendaSobMedida(ed, 1080, 1920, 0, 3), "utf8");
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "gradients=s=1080x1920:c0=0x4a5a6a:c1=0x1a2028:d=3", "-ss", "1.2", "-vf", `subtitles=${nome}:fontsdir=fontes`, "-frames:v", "1", join(saida, `${id}.png`)], { cwd: worker });
  } finally {
    rmSync(join(worker, nome), { force: true });
  }
}
execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...Object.keys(estilos).flatMap((id) => ["-i", join(saida, `${id}.png`)]), "-filter_complex", "[0][1][2][3][4]hstack=inputs=5,scale=1800:-1", join(saida, "folha.png")]);
console.log("ok", saida);
