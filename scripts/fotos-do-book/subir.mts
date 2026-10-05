// AS FOTOS DO BOOK DE MODELOS (05/10/2026), passo 2: baixa as escolhidas na
// curadoria (a olho, nas folhas de contato do passo 1), reduz e sobe para o
// Blob público, e escreve o manifesto lib/modelos-de-arte/fotos-do-book.json.
// Os termos da Pixabay pedem a imagem no nosso servidor (o link da API expira),
// por isso o Blob. Uso: npx tsx scripts/fotos-do-book/subir.mts <candidatos.json> [pasta-dos-recortes]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

// A curadoria: "consulta.candidato" de cada setor, na ordem das consultas do passo 1.
const ESCOLHA: Record<string, string[]> = {
  saude: ["0.0", "1.3", "2.3", "3.2", "4.3", "5.3"],
  juridico: ["0.3", "1.0", "2.1", "3.1", "4.2", "5.1"],
  fe: ["0.1", "1.0", "2.0", "3.2", "4.2", "5.0"],
  energia: ["0.0", "1.0", "2.1", "3.1", "4.0", "5.2"],
  consorcio: ["0.1", "1.3", "2.2", "3.3", "4.1", "5.0"],
  financas: ["0.0", "1.2", "2.0", "3.0", "4.2", "5.2"],
  educacao: ["0.3", "1.3", "2.2", "3.1", "4.0", "5.3"],
  alimentacao: ["0.0", "1.3", "2.3", "3.0", "4.1", "5.2"],
  beleza: ["0.0", "1.1", "2.2", "3.1", "4.2", "5.0"],
  imoveis: ["0.0", "1.0", "1.3", "3.3", "4.0", "5.3"],
  industria: ["0.0", "1.1", "2.1", "2.3", "5.1", "5.3"],
  agro: ["0.0", "1.3", "2.1", "3.2", "4.3", "5.0"],
  marketing: ["0.3", "1.1", "2.2", "3.2", "4.3", "5.1"],
  tecnologia: ["0.0", "1.1", "2.1", "3.2", "4.3", "1.0"],
  negocios: ["0.1", "1.2", "2.2", "3.1", "4.0", "5.0"],
  reserva: ["0.0", "1.0", "2.3", "3.3", "4.0", "5.2", "6.0", "7.1", "8.3", "9.1", "10.2", "11.3", "12.3", "13.0", "14.1", "15.1", "16.1", "17.1", "18.1", "19.3"],
};
// As pessoas de banco que viram recorte no "Você na frente do título" (setor, "consulta.candidato").
const PESSOAS: Array<[string, string]> = [["reserva", "0.0"], ["alimentacao", "0.0"], ["reserva", "0.3"], ["educacao", "1.1"]];

const candidatos = JSON.parse(readFileSync(process.argv[2], "utf8"));
const pastaRecortes = process.argv[3];

interface FotoDoBook {
  id: number;
  tipo: string;
  /** 1280 px no lado maior: a ficha do modelo. */
  g: string;
  /** 540 px: o cartão da galeria. */
  p: string;
  w: number;
  h: number;
  autor: string;
  pagina: string;
}

const subidas = new Map<number, FotoDoBook>();
const originais = new Map<number, Buffer>();

async function subir(c: { id: number; largeImageURL: string; user: string; pageURL: string }, tipo: string): Promise<FotoDoBook> {
  const ja = subidas.get(c.id);
  if (ja) return ja;
  const bruto = Buffer.from(await (await fetch(c.largeImageURL)).arrayBuffer());
  originais.set(c.id, bruto);
  const g = await sharp(bruto).rotate().resize({ width: 1280, height: 1280, fit: "inside" }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const p = await sharp(bruto).rotate().resize({ width: 540, height: 540, fit: "inside" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const meta = await sharp(g).metadata();
  const opc = { access: "public" as const, token, contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 };
  const [ug, up] = await Promise.all([put(`book-modelos/fotos/${c.id}-g.jpg`, g, opc), put(`book-modelos/fotos/${c.id}-p.jpg`, p, opc)]);
  const f: FotoDoBook = { id: c.id, tipo, g: ug.url, p: up.url, w: meta.width ?? 0, h: meta.height ?? 0, autor: c.user, pagina: c.pageURL };
  subidas.set(c.id, f);
  return f;
}

function candidato(setor: string, chave: string) {
  const [qi, ci] = chave.split(".").map(Number);
  const item = candidatos[setor][qi];
  return { c: item.candidatos[ci], tipo: item.tipo as string };
}

const manifesto: { setores: Record<string, FotoDoBook[]>; reserva: FotoDoBook[]; pessoas: Array<{ id: number; fundo: string; recorte: string; w: number; h: number; autor: string; pagina: string }> } = { setores: {}, reserva: [], pessoas: [] };
for (const [setor, chaves] of Object.entries(ESCOLHA)) {
  const lista: FotoDoBook[] = [];
  for (const k of chaves) {
    const { c, tipo } = candidato(setor, k);
    lista.push(await subir(c, tipo));
  }
  if (setor === "reserva") manifesto.reserva = lista;
  else manifesto.setores[setor] = lista;
  console.log(setor, lista.length);
}

// As pessoas: o original vai para o rascunho (o recorte é feito de graça, no
// computador, com o rembg) e, se o recorte já existe, sobem fundo e recorte.
for (const [setor, k] of PESSOAS) {
  const { c } = candidato(setor, k);
  const bruto = originais.get(c.id) ?? Buffer.from(await (await fetch(c.largeImageURL)).arrayBuffer());
  if (!pastaRecortes) continue;
  const base = await sharp(bruto).rotate().resize({ width: 1280, height: 1280, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  writeFileSync(`${pastaRecortes}/${c.id}.jpg`, base);
  const arqRecorte = `${pastaRecortes}/${c.id}.png`;
  if (!existsSync(arqRecorte)) {
    console.log("falta o recorte de", c.id);
    continue;
  }
  // Enquadrada já no post (1080 x 1350): a pessoa centrada, com o pé da foto
  // no pé da peça e o topo da cabeça perto de 32% da altura, onde o título
  // gigante termina (a mesma regra de lib/materiais/profundidade.ts). Nos
  // formatos mais altos a prévia corta as laterais e a pessoa segue no centro.
  const W = 1080;
  const H = 1350;
  const { data: soPessoa, info } = await sharp(readFileSync(arqRecorte)).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
  const alturaAlvo = Math.round(H * 0.68);
  const escala = Math.min(alturaAlvo / info.height, (W * 0.96) / info.width);
  const pw = Math.round(info.width * escala);
  const ph = Math.round(info.height * escala);
  const pessoa = await sharp(soPessoa).resize(pw, ph).png().toBuffer();
  const recorte = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: pessoa, left: Math.round((W - pw) / 2), top: H - ph }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = { width: W, height: H };
  // O fundo: a própria foto, desfocada e um pouco escura, para o título ler.
  const fundo = await sharp(base).resize(W, H, { fit: "cover", position: "attention" }).blur(22).modulate({ brightness: 0.85 }).jpeg({ quality: 80 }).toBuffer();
  const opc = { access: "public" as const, token, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 };
  const [uf, ur] = await Promise.all([
    put(`book-modelos/pessoas/${c.id}-fundo.jpg`, fundo, { ...opc, contentType: "image/jpeg" }),
    put(`book-modelos/pessoas/${c.id}-recorte.png`, recorte, { ...opc, contentType: "image/png" }),
  ]);
  manifesto.pessoas.push({ id: c.id, fundo: uf.url, recorte: ur.url, w: meta.width ?? 0, h: meta.height ?? 0, autor: c.user, pagina: c.pageURL });
}

writeFileSync("C:/Users/devan/opensquad-app/lib/modelos-de-arte/fotos-do-book.json", JSON.stringify(manifesto, null, 1));
console.log("manifesto escrito:", Object.keys(manifesto.setores).length, "setores,", manifesto.reserva.length, "na reserva,", manifesto.pessoas.length, "pessoas");
