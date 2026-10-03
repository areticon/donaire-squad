import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";

/**
 * Pede ao worker a pessoa recortada de um quadro JÁ guardado (30/09).
 *
 * Os cortes feitos a partir de hoje já chegam com o recorte (`midia.recorte`);
 * este caminho serve aos quadros antigos (a capa-fonte dos vídeos de antes, o
 * refazer pelo chat) sem obrigar a recortar o vídeo inteiro de novo. O worker
 * responde na hora, em poucos segundos: é uma imagem só.
 *
 * Devolve null em qualquer falha, e a capa segue sem recorte (o quadro inteiro
 * como fundo). Nunca volta a pedir ao modelo de imagem para mexer no rosto.
 */
export async function recortarQuadro(
  imagemUrl: string,
  chave: string
): Promise<{ url: string; rosto?: { x: number; y: number; w: number; h: number } | null } | null> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) return null;
  const corpo = JSON.stringify({ imagemUrl, chave });
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/recortar`, {
      method: "POST",
      headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      console.warn(`[recorte] worker respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return null;
    }
    const dados = (await r.json()) as { recorte?: { url: string; rosto?: { x: number; y: number; w: number; h: number } | null } };
    return dados.recorte?.url ? dados.recorte : null;
  } catch (e) {
    console.warn(`[recorte] falhou: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
