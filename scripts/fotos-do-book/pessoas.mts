// AS PESSOAS FICTÍCIAS DO BOOK (05/10/2026), passo 3: baixa as pessoas
// escolhidas na curadoria (a olho, nas folhas de contato da busca), recorta o
// fundo de graça no computador (rembg, modelo isnet-general-use, via uvx),
// enquadra pessoa e fundo no tamanho do post (1080 x 1350), sobe os dois para
// o Blob público e grava a lista `pessoas` do manifesto
// lib/modelos-de-arte/fotos-do-book.json, somando às que já estavam lá.
//
// A queixa do Bruno (05/10, com print): todas as prévias com a mesma mulher
// (de óculos, lendo um livro). Agora o banco tem 20 ou mais pessoas, variadas
// em sexo, idade, etnia, traje e pose, e a galeria sorteia uma por modelo
// (lib/modelos-de-arte/fotos-do-book.ts). Nada gerado, nada pago.
//
// Uso: npx tsx scripts/fotos-do-book/pessoas.mts <candidatos.json> <pasta-de-trabalho> [--manter=7175038,890885] [--so-recortar]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { put } from "@vercel/blob";

const env = Object.fromEntries(
  readFileSync("C:/Users/devan/opensquad-app/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const token = env.BLOB_PUBLIC_READ_WRITE_TOKEN;
if (!token) throw new Error("sem BLOB_PUBLIC_READ_WRITE_TOKEN");

/**
 * A curadoria: "consulta.candidato" da busca de pessoas, com a pose e o perfil
 * que a pessoa mostra (vai para o manifesto, para o sorteio variar a pose
 * entre vizinhos da galeria). Sem gente famosa, sem obra de arte, sem marca.
 * Ficaram de fora, na conferência da folha de contato, os recortes que o
 * rembg cortou mal (rosto pela metade, óculos sem rosto, mancha solta) e a foto com bicicleta.
 */
const ESCOLHA: Array<[string, string]> = [
  ["homem-apontando.2", "homem rindo de terno"],
  ["homem-oculos.3", "homem sorrindo de blazer"],
  ["homem-negro.1", "homem sério de terno escuro"],
  ["homem-bracos-cruzados.6", "homem de óculos pensando"],
  ["homem-bracos-cruzados.7", "homem de camisa apoiado"],
  ["homem-bracos-cruzados.1", "mulher sorrindo casual"],
  ["homem-apontando.7", "homem de blazer de perfil"],
  ["homem-apontando.0", "homem de casaco com celular"],
  ["homem-celular.3", "mulher de vestido com celular"],
  ["homem-celular.5", "homem de camiseta com celular"],
  ["homem-perfil.0", "homem de camisa no estúdio"],
  ["homem-perfil.2", "mulher de perfil"],
  ["mulher-seria.1", "mulher séria de suéter"],
  ["homem-sorrindo.1", "homem de óculos pensando"],
  ["homem-sorrindo.2", "homem sorrindo com café"],
  ["mulher-sorrindo.7", "mulher madura sorrindo"],
  ["homem-negro.4", "homem de barba casual"],
  ["mulher-negra.4", "mulher sorrindo"],
  ["mulher-negra.7", "mulher de casaco"],
  ["mulher-asiatica.5", "médica de jaleco"],
  ["chef.5", "mulher ruiva séria"],
  ["engenheiro.0", "engenheiro de capacete"],
  ["homem-negro.6", "homem de terno claro"],
  ["homem-serio.4", "homem de barba sério"],
];

interface Candidato {
  id: number;
  largeImageURL: string;
  pageURL: string;
  user: string;
  imageWidth: number;
  imageHeight: number;
}
interface PessoaDoManifesto {
  id: number;
  fundo: string;
  recorte: string;
  w: number;
  h: number;
  autor: string;
  pagina: string;
  rotulo?: string;
  /** "rosto": só cabeça e ombros (o título em cima lê bem); "corpo": meio corpo ou inteiro (serve ao título embaixo). */
  enquadramento?: "rosto" | "corpo";
}

const candidatos = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, { consulta: string; candidatos: Candidato[] }>;
const pasta = process.argv[3];
mkdirSync(pasta, { recursive: true });
const manterArg = process.argv.find((a) => a.startsWith("--manter="));
const manter = new Set((manterArg ? manterArg.slice("--manter=".length) : "").split(",").filter(Boolean).map(Number));

const caminhoDoManifesto = "C:/Users/devan/opensquad-app/lib/modelos-de-arte/fotos-do-book.json";
const manifesto = JSON.parse(readFileSync(caminhoDoManifesto, "utf8")) as { setores: unknown; reserva: unknown; pessoas: PessoaDoManifesto[] };
const antigas = manifesto.pessoas.filter((p) => manter.has(p.id));

/** O recorte de fundo, de graça: rembg pelo uvx (modelo isnet-general-use, já baixado em ~/.u2net). */
function recortarFundo(entrada: string, saida: string) {
  if (existsSync(saida)) return;
  const r = spawnSync("uvx", ["--from", "rembg[cpu,cli]", "rembg", "i", "-m", "isnet-general-use", "-a", "-ae", "15", entrada, saida], { stdio: "inherit", shell: true });
  if (r.status !== 0 || !existsSync(saida)) throw new Error(`rembg falhou em ${entrada}`);
}

const W = 1080;
const H = 1350;
const opc = { access: "public" as const, token, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 };
const novas: PessoaDoManifesto[] = [];

for (const [chave, rotulo] of ESCOLHA) {
  const [q, ci] = chave.split(".");
  const c = candidatos[q]?.candidatos[Number(ci)];
  if (!c) throw new Error(`candidato não achado: ${chave}`);
  const arqBase = `${pasta}/${c.id}.jpg`;
  if (!existsSync(arqBase)) {
    const bruto = Buffer.from(await (await fetch(c.largeImageURL)).arrayBuffer());
    // A base em 1280 no lado maior: o mesmo tamanho das fotos do book.
    writeFileSync(arqBase, await sharp(bruto).rotate().resize({ width: 1280, height: 1280, fit: "inside" }).jpeg({ quality: 90 }).toBuffer());
  }
  const arqRecorte = `${pasta}/${c.id}.png`;
  recortarFundo(arqBase, arqRecorte);

  // Enquadrada já no post: a pessoa centrada, com o pé da foto no pé da peça
  // e o topo da cabeça perto de 32% da altura (a regra de lib/materiais/profundidade.ts).
  const { data: soPessoa, info } = await sharp(readFileSync(arqRecorte)).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
  const alturaAlvo = Math.round(H * 0.68);
  const escala = Math.min(alturaAlvo / info.height, (W * 0.96) / info.width);
  const pw = Math.round(info.width * escala);
  const ph = Math.round(info.height * escala);
  const pessoa = await sharp(soPessoa).resize(pw, ph).png().toBuffer();
  // O enquadramento pela proporção da pessoa recortada: quase quadrada é rosto.
  const enquadramento: "rosto" | "corpo" = info.height / info.width < 1.25 ? "rosto" : "corpo";
  const recorte = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: pessoa, left: Math.round((W - pw) / 2), top: H - ph }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  // O fundo: a própria foto, desfocada e um pouco escura, para o título ler.
  const fundo = await sharp(readFileSync(arqBase)).resize(W, H, { fit: "cover", position: "attention" }).blur(22).modulate({ brightness: 0.85 }).jpeg({ quality: 80 }).toBuffer();
  writeFileSync(`${pasta}/${c.id}-recorte.png`, recorte);
  // "--so-recortar": só recorta e enquadra, para conferir na folha de contato antes de subir.
  if (process.argv.includes("--so-recortar")) continue;
  const [uf, ur] = await Promise.all([
    put(`book-modelos/pessoas/${c.id}-fundo.jpg`, fundo, { ...opc, contentType: "image/jpeg" }),
    put(`book-modelos/pessoas/${c.id}-recorte.png`, recorte, { ...opc, contentType: "image/png" }),
  ]);
  novas.push({ id: c.id, fundo: uf.url, recorte: ur.url, w: W, h: H, autor: c.user, pagina: c.pageURL, rotulo, enquadramento });
  console.log("pessoa", chave, c.id, rotulo);
}

if (process.argv.includes("--so-recortar")) process.exit(0);
manifesto.pessoas = [...antigas, ...novas];
writeFileSync(caminhoDoManifesto, JSON.stringify(manifesto, null, 1));
console.log("manifesto: pessoas =", manifesto.pessoas.length, "(", antigas.length, "mantidas,", novas.length, "novas )");
