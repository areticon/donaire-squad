import {
  GERADORES,
  INSTRUCAO_DO_GERADOR,
  MODELO_DO_GERADOR,
  cenarioPorId,
  type IdDoCenario,
  type IdDoGerador,
} from "@/lib/media/gemeo";
import { ErroDoFornecedor, dubleLigado, estadoNoFal, pedirOmniHuman, resultadoNoFal, subirNoFal } from "@/lib/media/gemeo-fornecedores";

/**
 * O GERADOR PLUGÁVEL DO GÊMEO (03/10/2026).
 *
 * O passo do cron (`gemeo-passo.ts`) não sabe mais QUEM gera: ele fala a voz,
 * pede cada pedaço a um `GeradorDoGemeo`, pergunta o estado e busca o vídeo.
 * Dois atrás da interface:
 *
 *   omnihuman  o de 01/10 (fal.ai), a RESERVA. Anima uma imagem: o melhor
 *              quadro do vídeo de treino, ou a pessoa já composta no cenário;
 *   heygen     o RECOMENDADO: o gêmeo treinado a partir do vídeo de treino
 *              (API v3, "digital twin"), com cada cenário como um "look"
 *              gerado por prompt sobre o próprio gêmeo.
 *
 * QUAL VALE: `GEMEO_GERADOR` (padrão "omnihuman"). Com "heygen", o gêmeo
 * treinado só é usado quando HEYGEN_API_KEY existe E o avatar do projeto está
 * pronto (treinado e com o consentimento aceito); até lá, e se a HeyGen
 * recusar o treino, o projeto segue gerando pela reserva, sem o cliente
 * ficar parado.
 *
 * Do SERVIDOR (lê chave de ambiente).
 */

export type PedidoAoGerador = { requestId: string; statusUrl: string; responseUrl: string };

export interface GeradorDoGemeo {
  id: IdDoGerador;
  /** O nome do modelo no registro de custo. */
  modelo: string;
  /** Tem chave para trabalhar? */
  configurado(): boolean;
  /**
   * Leva a imagem do cenário (OmniHuman) para o lado do fornecedor. Na HeyGen
   * o "cenário" já é um look do gêmeo e não há imagem para subir.
   */
  subirImagem?(dados: Buffer, nome: string): Promise<string>;
  /** Leva a fala do pedaço para o lado do fornecedor. */
  subirFala(dados: Buffer, nome: string): Promise<string>;
  /** Pede um pedaço. `imagem` é a URL do fal (OmniHuman) ou o id do look (HeyGen). */
  pedir(args: { imagem: string; fala: string; cenario: IdDoCenario }): Promise<PedidoAoGerador>;
  estado(p: PedidoAoGerador): Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string>;
  resultado(p: PedidoAoGerador): Promise<{ videoUrl: string; duracao: number | null }>;
}

// ─────────────────────────────── OmniHuman (fal.ai), a reserva ───────────────────────────────

export const omnihuman: GeradorDoGemeo = {
  id: "omnihuman",
  modelo: MODELO_DO_GERADOR,
  configurado: () => Boolean(process.env.FAL_KEY) || dubleLigado(),
  subirImagem: (dados, nome) => subirNoFal(dados, "image/jpeg", nome),
  subirFala: (dados, nome) => subirNoFal(dados, "audio/mpeg", nome),
  pedir: ({ imagem, fala, cenario }) =>
    pedirOmniHuman({ imagemUrl: imagem, audioUrl: fala, prompt: cenario === "camera" ? INSTRUCAO_DO_GERADOR : cenarioPorId(cenario).movimento }),
  estado: (p) => estadoNoFal(p.statusUrl),
  resultado: (p) => resultadoNoFal(p.responseUrl),
};

// ─────────────────────────────── HeyGen, o recomendado ───────────────────────────────

const HEYGEN = "https://api.heygen.com";

function chaveHeygen(): string {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new ErroDoFornecedor("heygen", "recusado", 0, "HEYGEN_API_KEY não configurada");
  return k;
}

async function erroHeygen(r: Response, acao: string): Promise<ErroDoFornecedor> {
  const corpo = (await r.text().catch(() => "")).slice(0, 400);
  if (r.status === 402 || /insufficient|balance|credit|quota/i.test(corpo)) {
    return new ErroDoFornecedor("heygen", "sem-saldo", r.status, `HeyGen sem saldo para ${acao}`);
  }
  if (r.status === 401 || r.status === 403) return new ErroDoFornecedor("heygen", "sem-permissao", r.status, `HeyGen recusou a chave ao ${acao} (${r.status})`);
  return new ErroDoFornecedor("heygen", r.status >= 500 || r.status === 429 ? "rede" : "recusado", r.status, `HeyGen recusou ${acao} (${r.status}): ${corpo}`);
}

/** As respostas da v3 vêm em `{ data }`; os erros, em `{ error }`. */
async function heygen<T>(caminho: string, init: RequestInit & { acao: string; timeoutMs?: number }): Promise<T> {
  const r = await fetch(`${HEYGEN}${caminho}`, {
    ...init,
    headers: { "x-api-key": chaveHeygen(), ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
  });
  if (!r.ok) throw await erroHeygen(r, init.acao);
  const d = (await r.json().catch(() => ({}))) as { data?: T };
  return (d.data ?? d) as T;
}

/**
 * Sobe um arquivo como "asset" (até 32 MB; mp4, webm, mp3, jpeg, png). É por
 * aqui que o vídeo de treino e as falas chegam: o nosso store é privado, e a
 * HeyGen não lê URL com token.
 */
export async function subirNaHeygen(dados: Buffer, contentType: string, nome: string): Promise<{ assetId: string; url: string | null }> {
  if (dubleLigado()) return { assetId: `duble-asset-${Date.now().toString(36)}`, url: null };
  if (dados.length > 32 * 1024 * 1024) throw new ErroDoFornecedor("heygen", "recusado", 413, `o arquivo ${nome} passa de 32 MB`);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(dados)], { type: contentType }), nome);
  const d = await heygen<{ asset_id?: string; id?: string; url?: string }>("/v3/assets", { method: "POST", body: form, acao: "subir o arquivo", timeoutMs: 300_000 });
  const assetId = d.asset_id ?? d.id;
  if (!assetId) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o asset_id");
  return { assetId, url: d.url ?? null };
}

type AvatarCriado = { avatarId: string; grupoId: string; vozId: string | null };

/**
 * CRIA O GÊMEO TREINADO a partir do vídeo de treino (`type: digital_twin`).
 * A HeyGen clona a voz do mesmo vídeo (`default_voice_id`), mas o vídeo do
 * gêmeo continua falando com a voz ElevenLabs que o Bruno aprovou (é o que a
 * reserva usa, e o cliente não pode ouvir duas vozes diferentes conforme o
 * gerador do dia).
 */
export async function criarGemeoNaHeygen(args: { nome: string; video: Buffer }): Promise<AvatarCriado> {
  if (dubleLigado()) {
    const id = Date.now().toString(36);
    return { avatarId: `duble-look-${id}`, grupoId: `duble-grupo-${id}`, vozId: null };
  }
  const { assetId } = await subirNaHeygen(args.video, "video/mp4", "treino.mp4");
  const d = await heygen<{ avatar_item?: { id?: string; default_voice_id?: string }; avatar_group?: { id?: string } }>("/v3/avatars", {
    method: "POST",
    body: JSON.stringify({ type: "digital_twin", name: args.nome.slice(0, 80), file: { type: "asset_id", asset_id: assetId } }),
    acao: "criar o gêmeo",
    timeoutMs: 120_000,
  });
  if (!d.avatar_item?.id || !d.avatar_group?.id) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o avatar");
  return { avatarId: d.avatar_item.id, grupoId: d.avatar_group.id, vozId: d.avatar_item.default_voice_id ?? null };
}

/** O estado de um look (o gêmeo ou um cenário): processing, pending_consent, completed, failed. */
export async function estadoDoLook(lookId: string): Promise<{ estado: string; motivo: string | null }> {
  if (lookId.startsWith("duble-")) return { estado: "completed", motivo: null };
  const d = await heygen<{ status?: string; error?: { message?: string } }>(`/v3/avatars/looks/${encodeURIComponent(lookId)}`, { method: "GET", acao: "consultar o gêmeo" });
  return { estado: d.status ?? "processing", motivo: d.error?.message ?? null };
}

/**
 * O CONSENTIMENTO DA HEYGEN. Na conta avulsa (nível 1), a HeyGen devolve um
 * link de 24 h onde a própria pessoa grava uma frase pela webcam; o nosso
 * vídeo de treino já é a autorização para a Demandou, mas a HeyGen exige a
 * dela. No Enterprise (nível 2) dá para mandar um vídeo pronto, e no nível 3
 * (acordo de indenização) nem existe: GEMEO_HEYGEN_CONSENTIMENTO=dispensado.
 */
export async function pedirConsentimento(grupoId: string, voltaPara: string): Promise<{ url: string }> {
  if (grupoId.startsWith("duble-")) return { url: `${voltaPara}#duble-consentimento` };
  const d = await heygen<{ url?: string }>(`/v3/avatars/${encodeURIComponent(grupoId)}/consent`, {
    method: "POST",
    body: JSON.stringify({ reroute_url: voltaPara }),
    acao: "pedir o consentimento",
  });
  if (!d.url) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o link de consentimento");
  return { url: d.url };
}

/** pending, accepted, rejected ou null (ainda não pedido). */
export async function estadoDoConsentimento(grupoId: string): Promise<string | null> {
  if (grupoId.startsWith("duble-")) return "accepted";
  const d = await heygen<{ consent_status?: string | null }>(`/v3/avatars/${encodeURIComponent(grupoId)}`, { method: "GET", acao: "consultar o consentimento" });
  return d.consent_status ?? null;
}

/**
 * UM CENÁRIO NA HEYGEN: um look novo do mesmo gêmeo, gerado por prompt (a
 * imagem do gêmeo condiciona a geração; a pessoa continua reconhecível e o
 * prompt muda o resto). Fica salvo no gêmeo e vale para todos os vídeos.
 */
export async function criarLookNaHeygen(avatarId: string, cenario: IdDoCenario, nome: string): Promise<{ lookId: string }> {
  if (avatarId.startsWith("duble-")) return { lookId: `duble-look-${cenario}-${Date.now().toString(36)}` };
  const c = cenarioPorId(cenario);
  const d = await heygen<{ avatar_item?: { id?: string } }>("/v3/avatars", {
    method: "POST",
    body: JSON.stringify({ type: "prompt", name: `${nome} - ${c.nome}`.slice(0, 80), prompt: c.prompt.slice(0, 1000), avatar_id: avatarId }),
    acao: "criar o cenário",
    timeoutMs: 120_000,
  });
  if (!d.avatar_item?.id) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o look do cenário");
  return { lookId: d.avatar_item.id };
}

/** Apaga o gêmeo inteiro (todos os looks). Já apagado conta como apagado. */
export async function apagarGemeoNaHeygen(grupoId: string): Promise<void> {
  if (grupoId.startsWith("duble-") || !process.env.HEYGEN_API_KEY) return;
  const r = await fetch(`${HEYGEN}/v3/avatars/${encodeURIComponent(grupoId)}`, {
    method: "DELETE",
    headers: { "x-api-key": chaveHeygen() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok && r.status !== 404) throw await erroHeygen(r, "apagar o gêmeo");
}

/**
 * A PROPORÇÃO do vídeo do gêmeo: quadrada, igual à da reserva (a foto
 * recortada do OmniHuman é quadrada), para que a junção e a esteira recebam
 * sempre o mesmo formato, troque o gerador ou não.
 */
const PROPORCAO = () => process.env.GEMEO_PROPORCAO ?? "1:1";

export const heygenGerador: GeradorDoGemeo = {
  id: "heygen",
  modelo: "heygen/avatar-iv-digital-twin",
  configurado: () => Boolean(process.env.HEYGEN_API_KEY) || dubleLigado(),
  subirFala: async (dados, nome) => (await subirNaHeygen(dados, "audio/mpeg", nome)).assetId,
  async pedir({ imagem, fala, cenario }) {
    if (dubleLigado()) {
      const id = `duble-heygen-${Math.random().toString(36).slice(2, 10)}`;
      return { requestId: id, statusUrl: `duble://status/${id}?em=${Date.now()}`, responseUrl: `duble://resposta/${id}` };
    }
    const d = await heygen<{ video_id?: string }>("/v3/videos", {
      method: "POST",
      body: JSON.stringify({
        type: "avatar",
        avatar_id: imagem,
        audio_asset_id: fala,
        aspect_ratio: PROPORCAO(),
        resolution: "1080p",
        // Avatar IV serve o gêmeo e os looks gerados por prompt; o V é só do
        // look original (GEMEO_HEYGEN_MOTOR=avatar_v para testar no close).
        engine: { type: cenario === "camera" ? (process.env.GEMEO_HEYGEN_MOTOR ?? "avatar_iv") : "avatar_iv" },
        motion_prompt: cenarioPorId(cenario).movimento,
        title: "Demandou gêmeo",
      }),
      acao: "pedir o vídeo",
    });
    if (!d.video_id) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o video_id");
    return { requestId: d.video_id, statusUrl: `heygen://video/${d.video_id}`, responseUrl: `heygen://video/${d.video_id}` };
  },
  async estado(p) {
    if (p.statusUrl.startsWith("duble://")) return estadoNoFal(p.statusUrl);
    const d = await heygen<{ status?: string }>(`/v3/videos/${encodeURIComponent(p.requestId)}`, { method: "GET", acao: "consultar o vídeo" });
    const s = d.status ?? "processing";
    return s === "completed" ? "COMPLETED" : s === "failed" ? "FAILED" : s === "pending" || s === "waiting" ? "IN_QUEUE" : "IN_PROGRESS";
  },
  async resultado(p) {
    if (p.responseUrl.startsWith("duble://")) return resultadoNoFal(p.responseUrl);
    const d = await heygen<{ status?: string; video_url?: string; duration?: number; error?: { message?: string } }>(
      `/v3/videos/${encodeURIComponent(p.requestId)}`,
      { method: "GET", acao: "buscar o vídeo" }
    );
    if (d.status === "failed" || !d.video_url) {
      throw new ErroDoFornecedor("heygen", "recusado", 200, `HeyGen não gerou o vídeo: ${d.error?.message ?? d.status ?? "sem vídeo"}`);
    }
    return { videoUrl: d.video_url, duracao: typeof d.duration === "number" ? d.duration : null };
  },
};

// ─────────────────────────────── qual vale ───────────────────────────────

export const GERADORES_DO_GEMEO: Record<IdDoGerador, GeradorDoGemeo> = { omnihuman, heygen: heygenGerador };

/** O gerador escolhido pelo ambiente (GEMEO_GERADOR), se tiver chave. */
export function geradorPreferido(): IdDoGerador {
  const pedido = (process.env.GEMEO_GERADOR ?? "omnihuman") as IdDoGerador;
  return pedido in GERADORES && GERADORES_DO_GEMEO[pedido].configurado() ? pedido : "omnihuman";
}

/** O gerador de um pedido já gravado (os antigos não têm o campo). */
export function geradorDoPedido(id?: IdDoGerador | null): GeradorDoGemeo {
  return GERADORES_DO_GEMEO[id ?? "omnihuman"] ?? omnihuman;
}

/** O pedido de um pedaço gravado, de volta na forma da interface. */
export function pedidoDoPedaco(p: { requestId?: string | null; statusUrl?: string | null; responseUrl?: string | null }): PedidoAoGerador {
  return { requestId: p.requestId ?? "", statusUrl: p.statusUrl ?? "", responseUrl: p.responseUrl ?? "" };
}

