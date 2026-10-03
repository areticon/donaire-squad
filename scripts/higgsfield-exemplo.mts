/**
 * PRIMEIRA GERAÇÃO PELA API DA HIGGSFIELD (Seedance 2.5, texto para vídeo).
 *
 *   npx tsx --env-file=.env.local scripts/higgsfield-exemplo.mts
 *
 * Existe para provar a conta e a chave antes de a Higgsfield entrar no editor
 * de vídeo nível estúdio (decisão de 27/09/2026). A chamada é COBRADA: um vídeo
 * de 5 s em 720p.
 *
 * A credencial vem de HF_CREDENTIALS ("id:segredo") no .env.local, que o Git
 * ignora, e nunca é impressa. O cliente v2 do SDK só roda no servidor, que é
 * onde a credencial pode ficar.
 *
 * Só declara sucesso com status "completed" e uma URL de vídeo na mão; falha,
 * cancelamento e moderação saem como erro, com o código de saída 1.
 */
import { config, higgsfield } from "@higgsfield/client/v2";

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS ausente no ambiente (.env.local).");
  process.exit(1);
}
config({ credentials: process.env.HF_CREDENTIALS });

const inicio = Date.now();
try {
  // Sem a espera do SDK: o subscribe com withPolling desiste em 5 minutos e
  // joga fora o request_id, e o vídeo continua sendo gerado (e cobrado) do
  // lado deles, sem ter como buscar depois. Foi o que aconteceu na primeira
  // rodada paga, em 28/09. Aqui o id é impresso assim que o pedido é aceito, e
  // a espera é nossa, com teto de 20 minutos.
  const pedido = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
    },
    withPolling: false,
  })) as unknown as Record<string, unknown>;
  const requestId = String(pedido.request_id ?? "");
  console.log(`Pedido aceito. request_id: ${requestId || "(sem id)"}`);
  if (!requestId) throw new Error("A Higgsfield não devolveu request_id.");

  let resultado: Record<string, unknown> = pedido;
  const cabecalho = { Authorization: `Key ${process.env.HF_CREDENTIALS}`, "User-Agent": "higgsfield-server-js/2.0" };
  while (Date.now() - inicio < 20 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 10_000));
    const r = await fetch(`https://api.higgsfield.ai/requests/${requestId}/status`, { headers: cabecalho });
    if (r.status >= 500) continue;
    resultado = (await r.json()) as Record<string, unknown>;
    if (["completed", "failed", "nsfw", "canceled", "cancelled"].includes(String(resultado.status))) break;
  }

  const status = String(resultado.status ?? "desconhecido");
  const video = resultado.video as { url?: string } | string | undefined;
  const url = typeof video === "string" ? video : video?.url;
  const segundos = Math.round((Date.now() - inicio) / 1000);

  if (status === "completed" && url) {
    console.log(`OK em ${segundos} s. Vídeo: ${url}`);
    console.log(`request_id: ${String(resultado.request_id ?? resultado.id ?? "?")}`);
  } else {
    console.error(`NÃO concluiu (status: ${status}) depois de ${segundos} s.`);
    console.error("Campos devolvidos:", Object.keys(resultado).join(", "));
    process.exit(1);
  }
} catch (err) {
  console.error("A chamada falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
}
