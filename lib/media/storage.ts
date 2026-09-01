/**
 * Onde cada arquivo mora, e por quê.
 *
 * A plataforma usa DOIS stores de blob, e a divisão não é detalhe de infra, é
 * a diferença entre o player funcionar e o player travar:
 *
 * - **Store privado** (`BLOB_READ_WRITE_TOKEN`): a gravação ORIGINAL do
 *   cliente e os insumos internos (fundo gerado, quadro-fonte). Ninguém além
 *   da plataforma lê, e cada byte passa pelo proxy com Range da rota de mídia.
 * - **Store público** (`BLOB_PUBLIC_READ_WRITE_TOKEN`): a mídia PRODUZIDA
 *   para publicar, que é justamente a que o navegador do cliente toca e
 *   baixa: cortes, vídeo completo e capas. O player fala direto com o CDN do
 *   storage, que entrega Range, cache e buffering nativos.
 *
 * ## Por que isso existe (a cicatriz de 01/09)
 *
 * O veredito do Bruno foi "os players são ruins, começa e trava, não tem
 * buffering igual YouTube". A causa estava na entrega: cada byte fazia turismo
 * por uma função serverless. A primeira tentativa de conserto pediu
 * `access: "public"` no store que existia, e ele é privado-only: o upload
 * morreu com "Cannot use public access on a private store", derrubou os cortes
 * e ainda queimou as três tentativas do botão. Daí a regra que ficou: mudança
 * de storage se prova com UM upload antes do deploy.
 *
 * Provado em 01/09 no store novo, com um upload de teste: leitura anônima 200,
 * `cache-control: public, max-age=2592000` e Range devolvendo 206 com
 * `content-range`. É o comportamento de CDN que faltava.
 *
 * ## A proteção do arquivo público
 *
 * É a URL não adivinhável (`addRandomSuffix`), que é o padrão do mercado para
 * mídia de cliente. O que o cliente vai PUBLICAR numa rede social não é
 * segredo; o que ele gravou e ainda não aprovou continua privado.
 *
 * ## Sem a variável, nada quebra
 *
 * Se `BLOB_PUBLIC_READ_WRITE_TOKEN` faltar, tudo volta para o store privado e
 * o proxy com Range assume. Pior de performance, idêntico de comportamento.
 */

export type OpcoesDeUpload = {
  access: "public" | "private";
  token: string | undefined;
};

/** O destino da mídia PRODUZIDA: corte, completo, capa. */
export function midiaProduzida(): OpcoesDeUpload {
  const publico = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  return publico
    ? { access: "public", token: publico }
    : { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN };
}

/** O destino do que é do cliente ou insumo interno. */
export function midiaPrivada(): OpcoesDeUpload {
  return { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN };
}

/**
 * Esta URL é servida pelo CDN público?
 *
 * A rota de mídia decide com isto se redireciona (302 para o CDN) ou se
 * proxia com Range. O acervo antigo continua privado e segue pelo proxy, sem
 * migração e sem link quebrado.
 */
export function ehPublica(url: string): boolean {
  return url.includes(".public.blob.vercel-storage.com");
}

/**
 * Lê uma mídia da plataforma, seja ela do store público ou do privado.
 *
 * Existe porque a troca de 01/09 criou um acervo MISTO: o quadro-fonte e as
 * capas antigas estão no store privado, e as novas nascem no público. Quem lê
 * (a composição de capa, o refazer do Vitor) não pode assumir um só caminho.
 * O `get` do SDK com token devolve 403 numa URL pública, e o `fetch` puro
 * devolve 403 numa privada, então o erro seria sempre um 403 confuso em vez
 * de "não achei a mídia".
 */
export async function lerMidia(url: string): Promise<Buffer | null> {
  if (ehPublica(url)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const { get } = await import("@vercel/blob");
  const blob = await get(url, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!blob || blob.statusCode !== 200) return null;
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}

/**
 * Abre uma mídia como FLUXO, dos dois stores.
 *
 * É o que a publicação usa. Fluxo e não buffer porque a gravação completa
 * passa de 800 MB, e materializar isso na memória da função derruba a
 * execução antes de o primeiro byte chegar ao Google (custou uma publicação
 * em produção).
 */
export async function abrirMidia(url: string): Promise<{
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
  size: number;
} | null> {
  if (ehPublica(url)) {
    const res = await fetch(url);
    if (!res.ok || !res.body) return null;
    return {
      stream: res.body,
      mimeType: res.headers.get("content-type") || "video/mp4",
      size: Number(res.headers.get("content-length") ?? 0),
    };
  }
  const { get } = await import("@vercel/blob");
  const blob = await get(url, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!blob || blob.statusCode !== 200) return null;
  return {
    stream: blob.stream,
    mimeType: blob.blob.contentType || "video/mp4",
    size: blob.blob.size,
  };
}
