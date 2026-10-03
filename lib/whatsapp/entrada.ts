import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O QUE CHEGA PELO WHATSAPP (01/10): as regras do webhook de entrada, num
 * módulo sem banco para a prova testar sem rede.
 */

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * "PARAR" e parecidos. Só a mensagem que É o pedido (curta, começando pela
 * palavra), e não qualquer frase que contenha "sair": "posso sair mais cedo
 * da reunião?" não é pedido de descadastro.
 */
export function ehPedidoDeParar(texto: string | null | undefined): boolean {
  const t = semAcento(texto ?? "").replace(/[.!?,;:]+$/g, "");
  if (!t || t.length > 40) return false;
  // "para" sozinho fica de fora de propósito: é preposição ("para quem é?").
  return /^(parar|pare|para de mandar|sair|stop|cancelar avisos|descadastrar|descadastra|nao quero mais receber|nao quero receber|nao mande mais)\b/.test(t);
}

/** "VOLTAR": desfaz o PARAR. */
export function ehPedidoDeVoltar(texto: string | null | undefined): boolean {
  const t = semAcento(texto ?? "").replace(/[.!?,;:]+$/g, "");
  return t === "voltar" || t === "quero voltar" || t === "voltar a receber";
}

/**
 * A assinatura do webhook (X-Hub-Signature-256): HMAC SHA-256 do corpo CRU com
 * o segredo do aplicativo da Meta. Sem WHATSAPP_APP_SECRET, a rota recusa
 * tudo: webhook aberto deixaria qualquer um bloquear o número de um lead.
 */
export function assinaturaDaMetaValida(corpoCru: string, cabecalho: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperada = Buffer.from(`sha256=${createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex")}`);
  const veio = Buffer.from(cabecalho);
  return esperada.length === veio.length && timingSafeEqual(esperada, veio);
}

export type MensagemDeEntrada = { de: string; texto: string; id: string };

/** As mensagens de texto (e respostas de botão) do corpo do webhook. */
export function mensagensDoWebhook(corpo: unknown): MensagemDeEntrada[] {
  const out: MensagemDeEntrada[] = [];
  const c = corpo as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>> } }> }> };
  for (const e of c?.entry ?? []) {
    for (const ch of e.changes ?? []) {
      for (const m of ch.value?.messages ?? []) {
        const de = typeof m.from === "string" ? m.from : "";
        const texto =
          (m.text as { body?: string } | undefined)?.body ??
          (m.button as { text?: string } | undefined)?.text ??
          (m.interactive as { button_reply?: { title?: string } } | undefined)?.button_reply?.title ??
          "";
        if (de) out.push({ de, texto, id: String(m.id ?? "") });
      }
    }
  }
  return out;
}
