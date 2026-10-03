import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODELO_DO_GERADOR, INSTRUCAO_DO_GERADOR, estimarSegundos } from "@/lib/media/gemeo";

/**
 * OS FORNECEDORES DO GÊMEO DIGITAL (01/10/2026): ElevenLabs (voz) e fal.ai
 * (OmniHuman 1.5). Só HTTP, sem SDK, pelo mesmo motivo da Higgsfield: quem
 * espera é o cron, nunca a função. Cada chamada aqui é curta (enviar, perguntar
 * o estado, buscar o resultado); a espera longa é o "olhar de novo daqui a um
 * minuto" do passo em `gemeo-passo.ts`.
 *
 * Do SERVIDOR (lê chave de ambiente). A tela nunca importa daqui.
 *
 * ## O DUBLÊ (GEMEO_DUBLE=1)
 *
 * Decisão do dono em 01/10: nada de gastar dinheiro testando. Com a variável
 * ligada, nenhuma chamada sai para os fornecedores; as respostas vêm do teste
 * gravado em `Documents\Demandou\gemeo-teste` (o registro do fal em
 * `videos/registro.json`, o trecho real da voz do Bruno como fala). O resto do
 * caminho (worker, Blob, banco, créditos, esteira) é o de verdade. Em produção
 * a variável não existe, então o dublê nunca responde por um cliente.
 */

export function dubleLigado(): boolean {
  return process.env.GEMEO_DUBLE === "1";
}

const PASTA_DO_DUBLE = () => process.env.GEMEO_DUBLE_PASTA ?? "C:/Users/devan/Documents/Demandou/gemeo-teste";

/** Erro de fornecedor com o tipo que o passo precisa para decidir o que fazer. */
export class ErroDoFornecedor extends Error {
  constructor(
    readonly fornecedor: "elevenlabs" | "fal" | "heygen",
    readonly tipo: "sem-permissao" | "sem-saldo" | "recusado" | "rede",
    readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroDoFornecedor";
  }
}

// ─────────────────────────────── ElevenLabs ───────────────────────────────

const ELEVEN = "https://api.elevenlabs.io";

/**
 * O modelo da fala: ElevenLabs v4 desde 01/10, a voz que o Bruno aprovou na
 * comparação (a "B": v4 acelerada 7%). O multilingual v2 soou robótico no
 * gêmeo real. O v4 também aceita `previous_text` e `next_text` (testado em
 * 01/10), que fazem a entonação de um pedaço continuar a do anterior. A
 * aceleração de 7% é feita na junção do vídeo, no worker (gemeo.mjs), porque o
 * parâmetro de velocidade da ElevenLabs no v4 quase não muda o ritmo (1,6%).
 */
export const MODELO_DA_VOZ = () => process.env.GEMEO_MODELO_DA_VOZ ?? "eleven_v4";

function chaveEleven(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new ErroDoFornecedor("elevenlabs", "recusado", 0, "ELEVENLABS_API_KEY não configurada");
  return k;
}

async function erroEleven(r: Response, acao: string): Promise<ErroDoFornecedor> {
  const corpo = (await r.text().catch(() => "")).slice(0, 400);
  // A chave criada em 30/09 não tem a permissão de vozes: a ElevenLabs
  // responde 401 com "missing_permissions". É o caso esperado até o Bruno
  // liberar, e o passo trata como espera, não como falha.
  if ((r.status === 401 || r.status === 403) && /permission/i.test(corpo)) {
    return new ErroDoFornecedor("elevenlabs", "sem-permissao", r.status, `ElevenLabs: a chave não tem permissão para ${acao}`);
  }
  if (r.status === 402 || /quota|credits|limit/i.test(corpo)) {
    return new ErroDoFornecedor("elevenlabs", "sem-saldo", r.status, `ElevenLabs sem saldo para ${acao} (${r.status})`);
  }
  return new ErroDoFornecedor("elevenlabs", r.status >= 500 ? "rede" : "recusado", r.status, `ElevenLabs recusou ${acao} (${r.status}): ${corpo}`);
}

/** Clonagem instantânea a partir da amostra (MP3 já convertido pelo worker). */
export async function clonarVoz(args: { nome: string; amostra: Buffer; projeto: string }): Promise<{ voiceId: string }> {
  if (dubleLigado()) return { voiceId: `duble-voz-${Date.now().toString(36)}` };
  const form = new FormData();
  form.append("name", `${args.nome} (Demandou, ${args.projeto})`.slice(0, 100));
  form.append(
    "description",
    `Gêmeo digital de ${args.nome}, clonado com a autorização gravada da própria pessoa na Demandou.`
  );
  // Limpa o ruído da amostra (01/10): o clone aprovado pelo Bruno saiu de uma
  // amostra limpa; ruído de fundo vira "ar" metálico na voz clonada.
  form.append("remove_background_noise", "true");
  form.append("labels", JSON.stringify({ language: "pt", origem: "demandou-gemeo" }));
  form.append("files", new Blob([new Uint8Array(args.amostra)], { type: "audio/mpeg" }), "amostra.mp3");
  const r = await fetch(`${ELEVEN}/v1/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": chaveEleven() },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw await erroEleven(r, "criar vozes");
  const d = (await r.json()) as { voice_id?: string };
  if (!d.voice_id) throw new ErroDoFornecedor("elevenlabs", "recusado", r.status, "ElevenLabs não devolveu o voice_id");
  return { voiceId: d.voice_id };
}

/** Apaga a voz clonada. Já apagada (404) conta como apagada. */
export async function apagarVoz(voiceId: string): Promise<void> {
  if (dubleLigado() || voiceId.startsWith("duble-")) return;
  const r = await fetch(`${ELEVEN}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: "DELETE",
    headers: { "xi-api-key": chaveEleven() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok && r.status !== 404) throw await erroEleven(r, "apagar vozes");
}

/**
 * A fala de um pedaço, em MP3 de 128 kbps (taxa constante, o que deixa medir
 * a duração pelo próprio arquivo, sem ffprobe na função).
 */
export async function falar(args: {
  voiceId: string;
  texto: string;
  anterior?: string | null;
  seguinte?: string | null;
}): Promise<{ mp3: Buffer; caracteres: number; modelo: string }> {
  const modelo = MODELO_DA_VOZ();
  if (dubleLigado()) {
    // O trecho real da voz do Bruno, aparado na duração que o texto teria:
    // o pedaço do dublê tem o tamanho certo para a divisão ser exercitada.
    const inteiro = readFileSync(process.env.GEMEO_DUBLE_AUDIO ?? join(PASTA_DO_DUBLE(), "audio-teste-trecho-real.mp3"));
    const alvo = Math.max(2, estimarSegundos(args.texto) * 1.08);
    return { mp3: cortarMp3(inteiro, alvo), caracteres: args.texto.length, modelo: `duble/${modelo}` };
  }
  // Uma voz do dublê nunca vai à ElevenLabs de verdade (cadastro de teste
  // lido por um servidor sem o dublê ligado).
  if (args.voiceId.startsWith("duble-")) throw new ErroDoFornecedor("elevenlabs", "recusado", 0, "voz de teste (dublê) fora do modo de teste");
  const corpo: Record<string, unknown> = {
    text: args.texto,
    model_id: modelo,
    voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0, use_speaker_boost: true },
  };
  if (args.anterior) corpo.previous_text = args.anterior;
  if (args.seguinte) corpo.next_text = args.seguinte;
  const r = await fetch(`${ELEVEN}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": chaveEleven(), "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw await erroEleven(r, "gerar fala");
  return { mp3: Buffer.from(await r.arrayBuffer()), caracteres: args.texto.length, modelo };
}

// ─────────────────────────────── MP3 sem ffmpeg ───────────────────────────────

const KBPS_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const KBPS_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const AMOSTRAGEM: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

type Quadro = { inicio: number; fim: number; segundos: number };

/**
 * Os quadros de um MP3 (camada III). Existe para medir a fala na própria
 * função: a duração decide se o pedaço passou do teto de 30 s do gerador e
 * quanto se cobra, e chamar o worker só para um ffprobe custaria uma ida e
 * volta por pedaço.
 */
function quadrosDoMp3(buf: Buffer): Quadro[] {
  let i = 0;
  if (buf.length > 10 && buf.toString("latin1", 0, 3) === "ID3") {
    const tamanho = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + tamanho + (buf[5] & 0x10 ? 10 : 0);
  }
  const quadros: Quadro[] = [];
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versao = (buf[i + 1] >> 3) & 3;
    const camada = (buf[i + 1] >> 1) & 3;
    const indiceKbps = (buf[i + 2] >> 4) & 0xf;
    const indiceAmostragem = (buf[i + 2] >> 2) & 3;
    const enchimento = (buf[i + 2] >> 1) & 1;
    if (camada !== 1 || versao === 1 || indiceKbps === 0 || indiceKbps === 15 || indiceAmostragem === 3) {
      i++;
      continue;
    }
    const kbps = (versao === 3 ? KBPS_V1 : KBPS_V2)[indiceKbps];
    const amostragem = AMOSTRAGEM[versao][indiceAmostragem];
    const amostras = versao === 3 ? 1152 : 576;
    const tamanho = Math.floor(((versao === 3 ? 144 : 72) * kbps * 1000) / amostragem) + enchimento;
    if (tamanho < 4) {
      i++;
      continue;
    }
    quadros.push({ inicio: i, fim: Math.min(buf.length, i + tamanho), segundos: amostras / amostragem });
    i += tamanho;
  }
  return quadros;
}

export function duracaoDoMp3(buf: Buffer): number {
  return Math.round(quadrosDoMp3(buf).reduce((s, q) => s + q.segundos, 0) * 100) / 100;
}

/** Os primeiros `segundos` de um MP3, cortado em quadro inteiro (só o dublê usa). */
export function cortarMp3(buf: Buffer, segundos: number): Buffer {
  const partes: Buffer[] = [];
  let soma = 0;
  for (const q of quadrosDoMp3(buf)) {
    if (soma >= segundos) break;
    partes.push(buf.subarray(q.inicio, q.fim));
    soma += q.segundos;
  }
  return Buffer.concat(partes);
}

// ─────────────────────────────── fal.ai ───────────────────────────────

function chaveFal(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new ErroDoFornecedor("fal", "recusado", 0, "FAL_KEY não configurada");
  return k;
}

async function erroFal(r: Response, acao: string): Promise<ErroDoFornecedor> {
  const corpo = (await r.text().catch(() => "")).slice(0, 400);
  // "User is locked: Exhausted balance" (visto em 30/09 e 01/10): saldo do fal
  // acabou. Não é culpa do pedido; o passo espera em vez de desistir.
  if (r.status === 403 && /locked|balance/i.test(corpo)) {
    return new ErroDoFornecedor("fal", "sem-saldo", r.status, "fal.ai sem saldo (conta travada por saldo esgotado)");
  }
  if (r.status === 401 || r.status === 403) {
    return new ErroDoFornecedor("fal", "sem-permissao", r.status, `fal.ai recusou a chave ao ${acao} (${r.status})`);
  }
  return new ErroDoFornecedor("fal", r.status >= 500 || r.status === 429 ? "rede" : "recusado", r.status, `fal.ai recusou ${acao} (${r.status}): ${corpo}`);
}

/**
 * Sobe um arquivo para o armazenamento do fal. O gerador só lê de URL pública,
 * e a foto e a voz do cliente vivem no nosso store PRIVADO: em vez de abrir o
 * nosso arquivo para o mundo, entregamos uma cópia ao fal (o mesmo caminho do
 * script que funcionou no teste, `fal_gerar.py`).
 */
export async function subirNoFal(dados: Buffer, contentType: string, nome: string): Promise<string> {
  if (dubleLigado()) return `https://duble.fal.media/${Date.now().toString(36)}-${nome}`;
  const h = { Authorization: `Key ${chaveFal()}`, "content-type": "application/json" };
  const r = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ content_type: contentType, file_name: nome }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw await erroFal(r, "preparar o envio");
  const d = (await r.json()) as { upload_url?: string; file_url?: string };
  if (!d.upload_url || !d.file_url) throw new ErroDoFornecedor("fal", "recusado", r.status, "fal.ai não devolveu a URL de envio");
  const p = await fetch(d.upload_url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(dados),
    signal: AbortSignal.timeout(300_000),
  });
  if (!p.ok) throw await erroFal(p, "enviar o arquivo");
  return d.file_url;
}

export type PedidoNoFal = { requestId: string; statusUrl: string; responseUrl: string };

/**
 * Pede um pedaço ao OmniHuman 1.5, em alta definição (fala abaixo de 30 s).
 * `prompt` (03/10): o movimento do cenário ("sentada à mesa, gestos sobre a
 * mesa"); sem ele, a instrução neutra de sempre.
 */
export async function pedirOmniHuman(args: { imagemUrl: string; audioUrl: string; prompt?: string }): Promise<PedidoNoFal> {
  if (dubleLigado()) {
    const id = `${registroDoDuble().request_id}-${Math.random().toString(36).slice(2, 8)}`;
    return { requestId: id, statusUrl: `duble://status/${id}?em=${Date.now()}`, responseUrl: `duble://resposta/${id}` };
  }
  const r = await fetch(`https://queue.fal.run/${MODELO_DO_GERADOR}`, {
    method: "POST",
    headers: { Authorization: `Key ${chaveFal()}`, "content-type": "application/json" },
    body: JSON.stringify({ image_url: args.imagemUrl, audio_url: args.audioUrl, prompt: args.prompt ?? INSTRUCAO_DO_GERADOR, resolution: "1080p" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw await erroFal(r, "pedir o vídeo");
  const d = (await r.json()) as { request_id?: string; status_url?: string; response_url?: string };
  if (!d.request_id || !d.status_url || !d.response_url) {
    throw new ErroDoFornecedor("fal", "recusado", r.status, "fal.ai não devolveu o request_id");
  }
  return { requestId: d.request_id, statusUrl: d.status_url, responseUrl: d.response_url };
}

/** IN_QUEUE, IN_PROGRESS ou COMPLETED (o erro só aparece ao buscar o resultado). */
export async function estadoNoFal(statusUrl: string): Promise<string> {
  if (statusUrl.startsWith("duble://")) {
    const em = Number(new URL(statusUrl.replace("duble://", "https://duble/")).searchParams.get("em") ?? 0);
    const espera = Number(process.env.GEMEO_DUBLE_ESPERA_MS ?? 20_000);
    return Date.now() - em >= espera ? "COMPLETED" : "IN_PROGRESS";
  }
  const r = await fetch(statusUrl, { headers: { Authorization: `Key ${chaveFal()}` }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw await erroFal(r, "consultar o estado");
  const d = (await r.json()) as { status?: string };
  return d.status ?? "DESCONHECIDO";
}

/** O vídeo de um pedido COMPLETED. Lança ErroDoFornecedor "recusado" quando a geração falhou. */
export async function resultadoNoFal(responseUrl: string): Promise<{ videoUrl: string; duracao: number | null }> {
  if (responseUrl.startsWith("duble://")) {
    const url = process.env.GEMEO_DUBLE_VIDEO_URL;
    if (!url) throw new ErroDoFornecedor("fal", "recusado", 0, "GEMEO_DUBLE_VIDEO_URL não configurada para o dublê");
    return { videoUrl: url, duracao: registroDoDuble().resposta?.duration ?? null };
  }
  const r = await fetch(responseUrl, { headers: { Authorization: `Key ${chaveFal()}` }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw await erroFal(r, "buscar o vídeo");
  const d = (await r.json()) as { video?: { url?: string }; duration?: number };
  if (!d.video?.url) throw new ErroDoFornecedor("fal", "recusado", r.status, "fal.ai respondeu sem vídeo");
  return { videoUrl: d.video.url, duracao: typeof d.duration === "number" ? d.duration : null };
}

type RegistroDoTeste = { apelido: string; request_id: string; resposta?: { duration?: number } };

/** A resposta gravada do OmniHuman no teste de 01/10 (registro.json). */
function registroDoDuble(): RegistroDoTeste {
  try {
    const lista = JSON.parse(readFileSync(join(PASTA_DO_DUBLE(), "videos", "registro.json"), "utf8")) as RegistroDoTeste[];
    return lista.find((r) => r.apelido === "omnihuman") ?? { apelido: "omnihuman", request_id: "duble" };
  } catch {
    return { apelido: "omnihuman", request_id: "duble" };
  }
}
