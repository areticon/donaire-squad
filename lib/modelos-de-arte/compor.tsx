import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { askClaude } from "@/lib/claude";
import { FONTES, type FonteId } from "@/lib/modelos-de-arte/fontes";
import { modeloPorId, modeloDaPeca, formatoPeloTamanho, type ModeloDeArte, type TextosDaArte } from "@/lib/modelos-de-arte/catalogo";
import { desenharModelo, zonaDaFoto, type CoresDoDesenho } from "@/lib/modelos-de-arte/desenho";
import { registrarTextoComposto } from "@/lib/modelos-de-arte/registro";

/**
 * A ARTE DE VERDADE NO MODELO ESCOLHIDO (03/10/2026), no servidor.
 *
 * O desenho é o mesmo da prévia (lib/modelos-de-arte/desenho.tsx); aqui entram
 * só o que o navegador não precisa: as fontes do disco para o Satori, a foto da
 * IA recortada para a zona do modelo, o logo em PNG e os textos extras que o
 * modelo pede (itens, lados, número), escritos a partir do post.
 */

type FonteDoSatori = { name: string; data: Buffer; weight: 400 | 500 | 700 | 800; style: "normal" | "italic" };
let fontesEmCache: FonteDoSatori[] | null = null;

export async function fontesDosModelos(): Promise<FonteDoSatori[]> {
  if (fontesEmCache) return fontesEmCache;
  const pasta = join(process.cwd(), "lib", "media", "fontes-da-capa", "modelos");
  const arquivos = new Set(await readdir(pasta));
  const lista: FonteDoSatori[] = [];
  for (const f of Object.values(FONTES)) {
    const nome = `${f.id}.ttf`;
    if (!arquivos.has(nome)) continue;
    lista.push({ name: f.familia, data: await readFile(join(pasta, nome)), weight: f.peso, style: f.italico ? "italic" : "normal" });
  }
  fontesEmCache = lista;
  return lista;
}

const dataUri = (b: Buffer, tipo = "image/png") => `data:${tipo};base64,${b.toString("base64")}`;

/** O logo pronto para o Satori: PNG com altura limitada, e a proporção. */
export async function logoParaArte(logo: Buffer | null | undefined): Promise<{ src: string; proporcao: number } | null> {
  if (!logo) return null;
  try {
    const png = await sharp(logo, { density: 300 }).resize({ height: 240, withoutEnlargement: false, fit: "inside" }).png().toBuffer();
    const meta = await sharp(png).metadata();
    return { src: dataUri(png), proporcao: (meta.width ?? 1) / (meta.height ?? 1) };
  } catch {
    return null;
  }
}

/** A proporção mais próxima da zona da foto, entre as que os geradores aceitam. */
export function proporcaoDaFotoDoModelo(modelo: ModeloDeArte, largura: number, altura: number): "1:1" | "4:5" | "16:9" | "9:16" | null {
  const z = zonaDaFoto(modelo, largura, altura);
  if (!z || modelo.foto === "nenhuma") return null;
  const r = z.w / z.h;
  const opcoes: Array<["1:1" | "4:5" | "16:9" | "9:16", number]> = [["1:1", 1], ["4:5", 0.8], ["16:9", 16 / 9], ["9:16", 9 / 16]];
  return opcoes.sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0];
}

/**
 * A direção da foto do modelo, colada ao fim do prompt da cena. Sobrepõe o
 * fundo da família (que pedia fundo chapado para a arte se dissolver na peça):
 * no modelo, a foto ocupa a zona dela inteira.
 */
export function direcaoDaFotoDoModelo(modelo: ModeloDeArte): string {
  return `\nART TEMPLATE "${modelo.nome}" (overrides the background line above): ${modelo.fotoPrompt ?? ""} The photo fills its whole frame edge to edge, natural background of the real place, no plain backdrop. No text, no numbers, no logos, no people's faces.`;
}

function semTravessao(t: string): string {
  return t.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

/**
 * Os textos que o modelo pede além da manchete, escritos pelo Claude a partir
 * do post (ou da própria frase, quando não há post). Nunca inventa número nem
 * autoria: o que não está no texto fica de fora e o desenho segue sem.
 */
export async function textosDoModelo(o: { modelo: ModeloDeArte; frase: string; contexto?: string; projectId?: string; runId?: string }): Promise<TextosDaArte> {
  const m = o.modelo;
  const base: TextosDaArte = { titulo: o.frase };
  const precisa = m.campos.filter((c) => c !== "autor" || /["“”]|disse|segundo|afirma|escreveu|\d+:\d+/.test(o.contexto ?? ""));
  if (!precisa.length) return base;
  const fonte = `${o.contexto ?? ""}`.slice(0, 3000);
  const pedidoDe: Record<string, string> = {
    apoio: '"apoio": uma linha de apoio que complementa o título, até 16 palavras',
    itens: '"itens": de 3 a 4 itens curtos (até 7 palavras cada), tirados do conteúdo',
    numero: '"numero": o número exatamente como aparece no texto (ex.: "73%", "R$ 1.200", "3x"); se não houver número no texto, string vazia',
    lados: '"lados": {"rotulos":["...","..."],"esquerda":["..."],"direita":["..."]} com 2 a 3 frases curtas de cada lado (rótulos conforme o modelo)',
    autor: '"autor": quem disse a citação, só se estiver escrito no texto; senão string vazia',
    opcoes: '"opcoes": ["...","..."] duas opções de resposta de até 4 palavras',
    chamada: '"chamada": a chamada do botão, de 2 a 4 palavras, no imperativo',
  };
  const rotulos =
    m.id === "mito-ou-verdade" ? 'Rótulos: ["Mito","Verdade"]; esquerda é o mito (1 frase), direita é a verdade (1 frase).' : m.id === "isso-ou-aquilo" ? 'Rótulos: ["Evite","Faça"].' : m.id === "antes-e-depois" ? 'Rótulos: ["Antes","Depois"].' : "";
  try {
    const bruto = await askClaude(
      "Você completa o texto de uma arte de rede social, em português do Brasil. Responda SÓ com JSON. Nunca use travessão. Nunca invente número, percentual, preço, data, nome ou depoimento que não esteja no texto de origem.",
      `MODELO DA ARTE: ${m.nome} (${m.estrutura})
REGRAS DE TEXTO DO MODELO: ${m.regrasDeTexto}
${rotulos}
TÍTULO JÁ ESCRITO (não mude): "${o.frase}"
TEXTO DE ORIGEM:
${fonte || o.frase}

Devolva um JSON com: ${precisa.map((c) => pedidoDe[c]).join("; ")}.`,
      { maxTokens: 4000, effort: "low", usage: { projectId: o.projectId, runId: o.runId, operation: "texto_do_modelo_de_arte" } }
    );
    const recorte = bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1);
    const j = JSON.parse(recorte) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? semTravessao(v) : "");
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
    const origem = `${o.frase} ${fonte}`;
    const numero = s(j.numero);
    const lados = j.lados as { rotulos?: unknown; esquerda?: unknown; direita?: unknown } | undefined;
    const rot = arr(lados?.rotulos);
    const autor = s(j.autor);
    return {
      titulo: o.frase,
      apoio: s(j.apoio) || undefined,
      itens: arr(j.itens).slice(0, 5),
      // O número só vale se estiver, igual, no texto de origem.
      numero: numero && origem.replace(/\s/g, "").includes(numero.replace(/\s/g, "")) ? numero : undefined,
      lados: lados ? { rotulos: [rot[0] ?? "Antes", rot[1] ?? "Depois"], esquerda: arr(lados.esquerda).slice(0, 3), direita: arr(lados.direita).slice(0, 3) } : undefined,
      autor: autor && origem.includes(autor) ? autor : undefined,
      opcoes: Array.isArray(j.opcoes) && j.opcoes.length >= 2 ? [s(j.opcoes[0]), s(j.opcoes[1])] : undefined,
      chamada: s(j.chamada) || undefined,
    };
  } catch (e) {
    console.warn("[modelos-de-arte] textos extras não vieram; a peça sai só com o título:", e instanceof Error ? e.message : e);
    return base;
  }
}

/** Todo o texto que o desenho vai compor, para a conferência saber que é do código. */
function textoComposto(t: TextosDaArte, marca: string, modelo: ModeloDeArte): string[] {
  const fixos = ["Arraste", "Foto ilustrativa", "EDIÇÃO ESPECIAL", "OPINIÃO E ANÁLISE", "DICIONÁRIO", "substantivo", "Escreva sua resposta", "online", "agora", "PASSO", modelo.id === "manchete-de-jornal" || modelo.arquetipo === "revista" ? marca : ""];
  return [t.apoio ?? "", ...(t.itens ?? []), t.numero ?? "", ...(t.lados ? [...t.lados.rotulos, ...t.lados.esquerda, ...t.lados.direita] : []), t.autor ?? "", ...(t.opcoes ?? []), t.chamada ?? "", marca, ...fixos].filter(Boolean);
}

export interface PedidoDeComposicao {
  modelo: ModeloDeArte;
  textos: TextosDaArte;
  cores: CoresDoDesenho;
  largura: number;
  altura: number;
  foto?: Buffer | null;
  logo?: { src: string; proporcao: number } | null;
  marca: string;
  arroba?: string;
  pagina?: { i: number; total: number } | null;
  /** A pessoa recortada da foto real do cliente (PNG), para o modelo com profundidade. */
  recorte?: Buffer | null;
}

/** Compõe a peça no modelo e devolve JPEG. Sem chamada paga. */
export async function comporNoModelo(p: PedidoDeComposicao): Promise<Buffer> {
  const z = zonaDaFoto(p.modelo, p.largura, p.altura);
  let foto: string | null = null;
  let recorte: string | null = null;
  let fundoDesfocado: string | null = null;
  // PROFUNDIDADE (03/10): foto, pessoa e fundo desfocado no mesmo recorte.
  if (p.foto && p.recorte && p.modelo.foto === "recorte") {
    const { enquadrarComPessoa } = await import("@/lib/materiais/profundidade");
    const e = await enquadrarComPessoa({ foto: p.foto, recorte: p.recorte, largura: p.largura, altura: p.altura }).catch(() => null);
    if (e) {
      foto = dataUri(e.foto, "image/jpeg");
      recorte = dataUri(e.recorte);
      fundoDesfocado = dataUri(e.fundo, "image/jpeg");
    }
  }
  if (!foto && p.foto && z) {
    const ajustada = await sharp(p.foto).resize(Math.max(1, Math.round(z.w)), Math.max(1, Math.round(z.h)), { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toBuffer();
    foto = dataUri(ajustada, "image/jpeg");
  }
  registrarTextoComposto(p.textos.titulo, textoComposto(p.textos, p.marca, p.modelo));
  const elemento = desenharModelo({
    modelo: p.modelo,
    textos: p.textos,
    cores: p.cores,
    largura: p.largura,
    altura: p.altura,
    foto,
    logo: p.logo?.src ?? null,
    logoProporcao: p.logo?.proporcao ?? null,
    marca: p.marca,
    arroba: p.arroba,
    pagina: p.pagina,
    recorte,
    fundoDesfocado,
  });
  const resposta = new ImageResponse(elemento as React.ReactElement, { width: p.largura, height: p.altura, fonts: await fontesDosModelos() });
  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** O modelo que vale para uma peça deste tamanho, dado o que o projeto escolheu. */
export function modeloParaAPeca(o: { ids?: string[]; fixo?: string; largura: number; altura: number; frase: string; contexto?: string; carrossel?: boolean }): ModeloDeArte | null {
  if (o.fixo) {
    const m = modeloPorId(o.fixo);
    if (m) return m;
  }
  if (!o.ids?.length) return null;
  return modeloDaPeca(o.ids, formatoPeloTamanho(o.largura, o.altura, o.carrossel), o.frase, o.contexto ?? "");
}

export type { FonteId };
