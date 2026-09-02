import sharp from "sharp";

/**
 * Normaliza uma capa para o que o YouTube aceita em thumbnails/set: JPEG
 * 16:9, 1280x720, abaixo de 2 MB. O modelo de imagem devolve PNG de tamanho
 * variável, e o YouTube recusa acima de 2 MB.
 *
 * Vive sozinho porque é usado pela geração das capas e pela publicação, e a
 * publicação não pode importar a geração (que importa a publicação).
 */
export async function normalizarCapaParaYouTube(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .resize(1280, 720, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
