import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { askClaude } from "@/lib/claude";
import { FONTES, type FonteId } from "@/lib/modelos-de-arte/fontes";
import { modeloPorId, modeloDaPeca, formatoPeloTamanho, type ModeloDeArte, type TextosDaArte } from "@/lib/modelos-de-arte/catalogo";
import { desenharModelo, zonaDaFoto, type CoresDoDesenho } from "@/lib/modelos-de-arte/desenho";
import { TEXTO_FIXO_DOS_MODELOS_COM_FOTO } from "@/lib/modelos-de-arte/desenho-com-foto";
import { efeitoDoModelo } from "@/lib/modelos-de-arte/pecas-do-desenho";
import { efeitoComAjustes, type AjustesDaPeca } from "@/lib/modelos-de-arte/ajustes-da-peca";
import { registrarTextoComposto } from "@/lib/modelos-de-arte/registro";
import type { LetraId } from "@/lib/modelos-de-arte/identidade";

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
  const fixos = ["Arraste", "Foto ilustrativa", "EDIÇÃO ESPECIAL", "OPINIÃO E ANÁLISE", "DICIONÁRIO", "substantivo", "Escreva sua resposta", "online", "agora", "PASSO", ...TEXTO_FIXO_DOS_MODELOS_COM_FOTO, modelo.id === "manchete-de-jornal" || modelo.arquetipo === "revista" ? marca : ""];
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
  /** A pessoa recortada da foto real do cliente (PNG), para qualquer modelo com foto "recorte". */
  recorte?: Buffer | null;
  /** A letra aprovada pelo cliente (05/10, lib/modelos-de-arte/identidade.ts). */
  letra?: LetraId | null;
  /** O fundo gerado pelo modelo de imagem (modelo por prompt, 05/10): a colagem sem texto, no tamanho da peça. */
  fundoGerado?: Buffer | null;
  /** Os ajustes de layout pedidos pelo cliente (05/10, lib/modelos-de-arte/ajustes-da-peca.ts): título mais para cima, luz atrás da pessoa. */
  ajustes?: AjustesDaPeca | null;
}

/**
 * O PRETO E BRANCO DO MODELO (05/10), no pixel e sem IA: a foto e a pessoa
 * recortada perdem a cor antes de compor, porque o Satori não aplica filtro.
 * O PNG do recorte mantém a transparência. Se falhar, a foto segue em cores:
 * pior sair colorida do que sair sem foto.
 */
async function semCor(foto: Buffer | null | undefined, png: boolean): Promise<Buffer | null> {
  if (!foto) return null;
  try {
    const cinza = sharp(foto).rotate().greyscale().normalise().linear(1.08, -6);
    return png ? await cinza.png().toBuffer() : await cinza.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } catch (e) {
    console.warn("[modelos-de-arte] o preto e branco do modelo não entrou; a foto segue em cores:", e instanceof Error ? e.message : e);
    return foto;
  }
}

/**
 * OS EFEITOS NO PIXEL (05/10), o que o Satori não faz e o sharp faz, pela
 * tabela EFEITOS_DO_MODELO (lib/modelos-de-arte/pecas-do-desenho.tsx): a curva
 * de contraste "alto impacto" (na foto e na pessoa, sem mexer no alfa), o
 * desfoque do fundo e o PNG da sombra suave da pessoa (a silhueta do alfa,
 * desfocada e escurecida). Se algo falhar, a peça segue sem o efeito.
 */
async function contrasteNoPixel(img: Buffer, png: boolean): Promise<Buffer> {
  try {
    if (!png) return await sharp(img).linear(1.12, -14).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    // No PNG, a curva vai só no RGB; o alfa volta como estava.
    const alfa = await sharp(img).ensureAlpha().extractChannel(3).raw().toBuffer();
    const { data, info } = await sharp(img).removeAlpha().linear(1.12, -14).raw().toBuffer({ resolveWithObject: true });
    return await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).joinChannel(alfa, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
  } catch (e) {
    console.warn("[modelos-de-arte] o contraste não entrou:", e instanceof Error ? e.message : e);
    return img;
  }
}

async function sombraSuaveDaPessoa(recorte: Buffer, u: number): Promise<Buffer | null> {
  try {
    const meta = await sharp(recorte).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return null;
    const alfa = await sharp(recorte).ensureAlpha().extractChannel(3).blur(Math.max(4, 14 * u)).linear(0.6, 0).raw().toBuffer();
    const preto = Buffer.alloc(W * H * 3, 0);
    return await sharp(preto, { raw: { width: W, height: H, channels: 3 } }).joinChannel(alfa, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
  } catch (e) {
    console.warn("[modelos-de-arte] a sombra suave não entrou:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Compõe a peça no modelo e devolve JPEG. Sem chamada paga. */
export async function comporNoModelo(p: PedidoDeComposicao): Promise<Buffer> {
  if (p.modelo.fotoPretoEBranco) {
    p = { ...p, foto: await semCor(p.foto, false), recorte: await semCor(p.recorte, true) };
  }
  // O efeito do modelo com os ajustes da peça por cima (a luz e a sombra que o cliente pediu).
  const efeito = efeitoComAjustes(efeitoDoModelo(p.modelo.arquetipo), p.ajustes);
  const u = Math.min(p.largura, p.altura) / 1080;
  if (p.foto && efeito.contrasteDaFoto) p = { ...p, foto: await contrasteNoPixel(p.foto, false) };
  if (p.recorte && efeito.pessoa?.contraste) p = { ...p, recorte: await contrasteNoPixel(p.recorte, true) };
  const z = zonaDaFoto(p.modelo, p.largura, p.altura);
  let foto: string | null = null;
  let recorte: string | null = null;
  let fundoDesfocado: string | null = null;
  let recorteSombra: string | null = null;
  // PROFUNDIDADE (03/10): foto, pessoa e fundo desfocado no mesmo recorte, em
  // qualquer modelo com foto "recorte" (05/10: não só o "Você na frente do título").
  if (p.foto && p.recorte && p.modelo.foto === "recorte") {
    const { enquadrarComPessoa } = await import("@/lib/materiais/profundidade");
    const e = await enquadrarComPessoa({ foto: p.foto, recorte: p.recorte, largura: p.largura, altura: p.altura }).catch(() => null);
    if (e) {
      foto = dataUri(e.foto, "image/jpeg");
      recorte = dataUri(e.recorte);
      fundoDesfocado = dataUri(e.fundo, "image/jpeg");
      if (efeito.pessoa?.sombra === "suave") {
        const sombra = await sombraSuaveDaPessoa(e.recorte, u);
        if (sombra) recorteSombra = dataUri(sombra);
      }
    }
  }
  if (!foto && p.foto && z) {
    let ajustada = sharp(p.foto).resize(Math.max(1, Math.round(z.w)), Math.max(1, Math.round(z.h)), { fit: "cover", position: "attention" });
    // O desfoque do fundo do modelo, no pixel (a prévia faz por filtro CSS).
    if (efeito.fundo?.desfoque) ajustada = ajustada.blur(Math.max(1, efeito.fundo.desfoque * u));
    foto = dataUri(await ajustada.jpeg({ quality: 90 }).toBuffer(), "image/jpeg");
  }
  // O MODELO POR PROMPT (05/10): a colagem gerada vira o fundo inteiro da peça,
  // no pixel exato; a tipografia entra por cima no desenho.
  let fundoGerado: string | null = null;
  if (p.fundoGerado) {
    const inteiro = await sharp(p.fundoGerado).resize(p.largura, p.altura, { fit: "cover", position: "centre" }).jpeg({ quality: 92 }).toBuffer();
    fundoGerado = dataUri(inteiro, "image/jpeg");
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
    fundoGerado,
    recorteSombra,
    letra: p.letra ?? null,
    ajustes: p.ajustes ?? null,
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
