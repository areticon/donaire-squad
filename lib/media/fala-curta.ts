import { conferirResposta, marcarChamadaOk } from "@/lib/fornecedores/aviso-de-saldo";

/**
 * A FALA CURTA VIRA TEXTO (05/10/2026, generalizado em 08/10).
 *
 * Nasceu no comando falado do vídeo (app/api/projects/[id]/comando-do-video/
 * voz): o áudio curto que o navegador grava vai à Deepgram (nova-3 em
 * português, a mesma transcrição do app) e volta como texto. Em 08/10 o
 * estilo dos posts também passou a ser criado falando (regra do Bruno: "criar
 * o seu estilo, a partir de um texto ou um áudio"), e as duas rotas passaram
 * a usar esta função, em vez de duas cópias da mesma chamada.
 *
 * O texto que sai daqui entra no MESMO fluxo do texto escrito: quem chama não
 * trata a fala de outro jeito. Sem dependência nova: `fetch` direto na API.
 * `fazerFetch` e `chave` existem para a prova rodar com uma Deepgram de mentira.
 */

/** Até 4 MB, cerca de 2 minutos de áudio comprimido do navegador. */
export const TETO_DA_FALA_BYTES = 4 * 1024 * 1024;
/** Menos que isso é clique sem fala. */
export const PISO_DA_FALA_BYTES = 1000;

export type FalaTranscrita = { ok: true; texto: string } | { ok: false; status: number; erro: string };

type RespostaDaDeepgram = { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };

/** O texto da resposta da Deepgram, sem espaço sobrando. Puro. */
export function textoDaFala(r: unknown): string {
  const d = r as RespostaDaDeepgram | null;
  return String(d?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function transcreverFalaCurta(
  audio: Buffer | Uint8Array,
  contentType: string | null | undefined,
  o: {
    /** O que a pessoa pode fazer no lugar ("Escreva o comando", "Escreva como você quer"). */
    alternativa: string;
    /** Para o aviso de saldo do fornecedor: de onde veio a chamada. */
    onde: string;
    chave?: string | null;
    fazerFetch?: typeof fetch;
  }
): Promise<FalaTranscrita> {
  const chave = o.chave === undefined ? process.env.DEEPGRAM_API_KEY : o.chave;
  if (!chave) return { ok: false, status: 503, erro: `A transcrição de voz não está disponível agora. ${o.alternativa}.` };
  if (audio.length < PISO_DA_FALA_BYTES) return { ok: false, status: 400, erro: "Não ouvi nada. Grave de novo." };
  if (audio.length > TETO_DA_FALA_BYTES) return { ok: false, status: 413, erro: "Áudio longo demais. Fale em até 2 minutos." };
  const chamar = o.fazerFetch ?? fetch;
  const r = await chamar("https://api.deepgram.com/v1/listen?model=nova-3&language=pt-BR&punctuate=true&smart_format=true&mip_opt_out=true", {
    method: "POST",
    headers: { Authorization: `Token ${chave}`, "Content-Type": contentType || "audio/webm" },
    body: audio as unknown as BodyInit,
    signal: AbortSignal.timeout(45_000),
  }).catch(() => null);
  if (r && !r.ok) await conferirResposta("deepgram", { status: r.status, corpo: await r.text().catch(() => "") }, o.onde).catch(() => undefined);
  if (!r?.ok) return { ok: false, status: 502, erro: `Não consegui transcrever. Tente de novo ou ${o.alternativa.charAt(0).toLowerCase()}${o.alternativa.slice(1)}.` };
  marcarChamadaOk("deepgram");
  const texto = textoDaFala(await r.json().catch(() => null));
  if (!texto) return { ok: false, status: 422, erro: "Não entendi o áudio. Grave de novo, mais perto do microfone." };
  return { ok: true, texto };
}
