import { createHash } from "node:crypto";
import sharp from "sharp";
import { SVG_DA_MARCA } from "@/lib/media/icones-de-marca-svg";

/**
 * O ÍCONE DA MARCA COMO RECORTE DE PAPEL (30/09/2026). A marca que o narrador
 * cita (lib/media/marcas-na-fala.ts) entra na montagem como um adesivo: o SVG
 * oficial, renderizado aqui, com a borda branca grossa de papel recortado em
 * volta, igual aos objetos recortados das colagens. O PNG sai transparente e
 * o Remotion desenha como qualquer "recorte" (queda, sombra, giro): o
 * desenhista não precisa saber que é um logo.
 *
 * Custo zero (é código) e determinístico: o mesmo id sai sempre igual, e o
 * arquivo no Blob é um só para todos os projetos.
 */

/** Sobe quando o desenho do adesivo muda, para não reaproveitar o antigo. */
export const VERSAO_DO_ADESIVO = 1;

const LADO = 760;
/** Borda de papel: ~5% do lado, a mesma grossura dos recortes gerados. */
const BORDA = Math.round(LADO * 0.05);
const PAPEL = { r: 251, g: 250, b: 245 };

export function temIcone(marca: string): boolean {
  return Boolean(SVG_DA_MARCA[marca]);
}

/**
 * O adesivo em PNG transparente.
 *
 * A borda é a silhueta do ícone "engordada": o canal alfa desfocado e
 * limiarizado vira uma máscara maior que o desenho, e essa máscara pintada de
 * papel fica por baixo. Isso também tapa os furos pequenos do logo (o miolo do
 * nó da OpenAI), que é como um recorte feito à tesoura ficaria.
 */
export async function adesivoDaMarca(marca: string): Promise<Buffer> {
  const svg = SVG_DA_MARCA[marca];
  if (!svg) throw new Error(`marca sem ícone: ${marca}`);
  const miolo = LADO - 2 * BORDA;
  const desenho = await sharp(Buffer.from(svg), { density: 600 })
    .resize({ width: miolo, height: miolo, fit: "inside" })
    .png()
    .toBuffer();
  const comMargem = await sharp(desenho)
    .extend({ top: BORDA, bottom: BORDA, left: BORDA, right: BORDA, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const { width, height } = await sharp(comMargem).metadata();
  const w = width ?? LADO;
  const h = height ?? LADO;
  // Máscara engordada: desfoca o alfa até a borda e corta num limiar baixo.
  // Um passo por chamada: o sharp aplica as operações numa ordem fixa dele
  // (o limiar antes do desfoque), e encadeadas a borda não aparecia.
  const alfaDesfocado = await sharp(comMargem).extractChannel(3).blur(BORDA * 0.55).png().toBuffer();
  const limiarizado = await sharp(alfaDesfocado).threshold(6).png().toBuffer();
  const mascara = await sharp(limiarizado).blur(1.2).png().toBuffer();
  const papel = await sharp({ create: { width: w, height: h, channels: 3, background: PAPEL } })
    .joinChannel(mascara)
    .png()
    .toBuffer();
  const pronto = await sharp(papel).composite([{ input: comMargem }]).png().toBuffer();
  return sharp(pronto).trim({ threshold: 1 }).png().toBuffer().catch(() => pronto);
}

/** O caminho no Blob: por marca e versão do desenho (e do SVG, se o pacote mudar). */
export function caminhoDoAdesivo(marca: string): string {
  const h = createHash("sha256").update(SVG_DA_MARCA[marca] ?? marca).digest("hex").slice(0, 10);
  return `montagem/icones/${marca}-v${VERSAO_DO_ADESIVO}-${h}.png`;
}
