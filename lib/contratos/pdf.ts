import { put } from "@vercel/blob";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { htmlDoContrato, rodapeDoContrato, type CapaDoContrato } from "@/lib/contratos/html";
import { midiaPrivada } from "@/lib/media/storage";

/**
 * O PDF DO CONTRATO (05/10/2026): a página HTML de lib/contratos/html.ts
 * impressa pelo Chrome do worker do Railway (endpoint /contrato-pdf, em
 * worker/src/contrato-pdf.mjs). O worker já tem o Chrome do Remotion e as
 * fontes instaladas; a função da Vercel não teria nem um nem outro.
 *
 * NADA QUEBRA SEM O WORKER: `imprimirContrato` devolve null quando o worker
 * não está configurado, não responde ou falha, e quem chama segue pelo
 * Markdown (o caminho de antes, agora sem as anotações). O envio nunca fica
 * preso num PDF.
 *
 * Só servidor: assina o pedido com o segredo do worker.
 */

export type PedidoDePdf = {
  html: string;
  cabecalho: string;
  rodape: string;
};

/** Imprime a página no worker. Null em qualquer falha (quem chama usa o Markdown). */
export async function imprimirContrato(pedido: PedidoDePdf): Promise<Buffer | null> {
  const base = process.env.VIDEO_WORKER_URL?.replace(/\/$/, "");
  if (!base || !process.env.VIDEO_WORKER_SECRET) return null;
  const corpo = JSON.stringify(pedido);
  try {
    const r = await fetch(`${base}/contrato-pdf`, {
      method: "POST",
      headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
      body: corpo,
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      console.warn(`[contrato-pdf] worker respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return null;
    }
    const pdf = Buffer.from(await r.arrayBuffer());
    // Um PDF começa com "%PDF-"; qualquer outra coisa é erro disfarçado.
    if (pdf.length < 1000 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      console.warn(`[contrato-pdf] o worker devolveu algo que não é PDF (${pdf.length} bytes)`);
      return null;
    }
    return pdf;
  } catch (e) {
    console.warn(`[contrato-pdf] falhou: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** O pedido de impressão de um contrato: a página e o rodapé com "página N de M". */
export function pedidoDoContrato(capa: CapaDoContrato, markdown: string): PedidoDePdf {
  return { html: htmlDoContrato(capa, markdown), ...rodapeDoContrato(capa) };
}

/** O PDF de um contrato, pronto, ou null quando o worker não imprimiu. */
export async function pdfDoContrato(capa: CapaDoContrato, markdown: string): Promise<Buffer | null> {
  return imprimirContrato(pedidoDoContrato(capa, markdown));
}

/**
 * Guarda o PDF que foi para assinatura no store PRIVADO, ao lado do assinado
 * (contratos/<id>/). A URL fica na trilha do envio: é a cópia exata do que o
 * cliente recebeu, mesmo que o modelo mude depois.
 */
export async function guardarPdfEnviado(contratoId: string, versao: number, hash: string, pdf: Buffer): Promise<string | null> {
  const destino = midiaPrivada();
  if (!destino.token) return null;
  try {
    const blob = await put(`contratos/${contratoId}/enviado-v${versao}-${hash.slice(0, 12)}.pdf`, pdf, {
      access: destino.access,
      token: destino.token,
      addRandomSuffix: true,
      contentType: "application/pdf",
    });
    return blob.url;
  } catch (e) {
    console.warn(`[contrato-pdf] não guardei o PDF enviado: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
