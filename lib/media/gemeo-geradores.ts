import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";
import {
  GERADORES,
  INSTRUCAO_DO_GERADOR,
  MODELO_DO_GERADOR,
  MOVIMENTO_DA_FOTO_NA_HEYGEN,
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
 * Três atrás da interface:
 *
 *   omnihuman    o de 01/10 (fal.ai), a RESERVA. Anima uma imagem: a foto do
 *                cadastro, ou a pessoa já composta no cenário;
 *   heygen       o gêmeo treinado a partir do vídeo de treino (API v3,
 *                "digital twin"); desde 04/10, cada cenário é o próprio gêmeo
 *                recortado e posto sobre um fundo profissional
 *                (`imagemDaHeygen`). Ocupa vaga de gêmeo na conta;
 *   heygen-foto  (05/10) o GÊMEO DE FOTO: `type: photo` no POST /v3/avatars
 *                a partir da foto enviada, e o vídeo pelo Avatar IV com
 *                `motion_prompt` de busto parado e `expressiveness: low`.
 *                Sem treino, sem consentimento gravado, sem vaga.
 *
 * QUAL VALE: `GEMEO_GERADOR` (padrão "omnihuman"). Com "heygen", o gêmeo
 * treinado só é usado quando HEYGEN_API_KEY existe E o avatar do projeto está
 * pronto (treinado e com o consentimento aceito); sem ele, e também com
 * "heygen-foto", vale o gêmeo de foto quando ele existe; e se a HeyGen
 * recusar, o projeto segue gerando pela reserva, sem o cliente ficar parado
 * (ver `geradorDoCadastro` em gemeo-servidor.ts).
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
  /** Leva a fala do pedaço para o lado do fornecedor (MP3 cru ou, desde 04/10, o WAV preparado). */
  subirFala(dados: Buffer, nome: string, contentType?: string): Promise<string>;
  /**
   * Pede um pedaço. `imagem` é a URL do fal (OmniHuman) ou, na HeyGen, o que
   * `imagemDaHeygen` monta: o gêmeo, um look, ou o gêmeo sobre um fundo.
   */
  pedir(args: { imagem: string; fala: string; cenario: IdDoCenario }): Promise<PedidoAoGerador>;
  estado(p: PedidoAoGerador): Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string>;
  /** O vídeo pronto e, quando o gerador dá, um quadro dele (a conferência do cenário olha esse quadro). */
  resultado(p: PedidoAoGerador): Promise<{ videoUrl: string; duracao: number | null; quadroUrl?: string | null }>;
}

// ─────────────────────────────── OmniHuman (fal.ai), a reserva ───────────────────────────────

export const omnihuman: GeradorDoGemeo = {
  id: "omnihuman",
  modelo: MODELO_DO_GERADOR,
  configurado: () => Boolean(process.env.FAL_KEY) || dubleLigado(),
  subirImagem: (dados, nome) => subirNoFal(dados, "image/jpeg", nome),
  subirFala: (dados, nome, contentType) => subirNoFal(dados, contentType ?? "audio/mpeg", nome),
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
  const bruto = (await r.text().catch(() => "")).slice(0, 400);
  // 05/10: o corpo vem em `{ error: { code, message } }`; a mensagem guarda o
  // código e o texto, e não o JSON cru (que chegou a aparecer na tela).
  let codigo = "";
  let corpo = bruto;
  try {
    const e = (JSON.parse(bruto) as { error?: { code?: string; message?: string } | string | null }).error;
    if (e && typeof e === "object") {
      codigo = e.code ?? "";
      corpo = [e.code, e.message].filter(Boolean).join(": ") || bruto;
    } else if (typeof e === "string") corpo = e;
  } catch {
    // não era JSON: fica o texto como veio
  }
  // O LIMITE DA CONTA (05/10): "resource_limit_reached" (HTTP 400) é a conta
  // da Demandou na HeyGen sem vaga de gêmeo (ou de voz). Não é o vídeo da
  // pessoa que está errado: quem resolve é a equipe, liberando ou comprando vaga.
  if (codigo === "resource_limit_reached" || /resource_limit_reached/i.test(bruto)) {
    return new ErroDoFornecedor("heygen", "limite", r.status, `HeyGen sem vaga para ${acao} (resource_limit_reached): ${corpo}`);
  }
  const semSaldo = await conferirResposta("heygen", { status: r.status, corpo: bruto }, `gêmeo digital na HeyGen (${acao})`);
  if (semSaldo || r.status === 402 || /insufficient|balance|credit|quota/i.test(bruto)) {
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

/**
 * CRIA O GÊMEO DE FOTO (05/10/2026): `type: photo` com a foto recortada do
 * cadastro (busto, 1440 px). A HeyGen devolve o look em "processing" e o
 * passo pergunta o estado (`estadoDoLook`) até "completed". Custa US$ 1,00
 * por criação na tabela da API; não pede consentimento e não ocupa a vaga de
 * gêmeo treinado (é um "photo avatar", não um "digital twin").
 */
export async function criarGemeoDeFotoNaHeygen(args: { nome: string; foto: Buffer; contentType?: string }): Promise<{ lookId: string; grupoId: string }> {
  if (dubleLigado()) {
    const id = Date.now().toString(36);
    return { lookId: `duble-foto-${id}`, grupoId: `duble-grupo-foto-${id}` };
  }
  const { assetId } = await subirNaHeygen(args.foto, args.contentType ?? "image/jpeg", "foto.jpg");
  const d = await heygen<{ avatar_item?: { id?: string; group_id?: string }; avatar_group?: { id?: string } }>("/v3/avatars", {
    method: "POST",
    body: JSON.stringify({ type: "photo", name: args.nome.slice(0, 80), file: { type: "asset_id", asset_id: assetId } }),
    acao: "criar o gêmeo de foto",
    timeoutMs: 120_000,
  });
  const lookId = d.avatar_item?.id;
  const grupoId = d.avatar_group?.id ?? d.avatar_item?.group_id;
  if (!lookId || !grupoId) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o avatar de foto");
  return { lookId, grupoId };
}

/** O estado de um look (o gêmeo ou um cenário): processing, pending_consent, completed, failed. */
export async function estadoDoLook(lookId: string): Promise<{ estado: string; motivo: string | null; previa: string | null }> {
  if (lookId.startsWith("duble-")) return { estado: "completed", motivo: null, previa: null };
  const d = await heygen<{ status?: string; preview_image_url?: string; error?: { message?: string } }>(`/v3/avatars/looks/${encodeURIComponent(lookId)}`, {
    method: "GET",
    acao: "consultar o gêmeo",
  });
  return { estado: d.status ?? "processing", motivo: d.error?.message ?? null, previa: d.preview_image_url ?? null };
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
 * UM CENÁRIO NA HEYGEN POR PROMPT: um look novo do mesmo gêmeo (a imagem do
 * gêmeo condiciona a geração; a pessoa continua reconhecível e o prompt muda
 * o resto). Fica salvo no gêmeo e vale para todos os vídeos. Desde 04/10 é a
 * alternativa (GEMEO_HEYGEN_CENARIO=look): o padrão é o gêmeo treinado sobre
 * um fundo nosso, que não inventa roupa. O look só é usado depois da
 * conferência por visão da prévia.
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
 * O QUE VAI NO `imagem` DE UM PEDAÇO DA HEYGEN (04/10/2026):
 *
 *   gemeo:<avatar>            o gêmeo treinado com o fundo do vídeo de treino;
 *   fundo:<avatar>:<asset>    o gêmeo treinado, recortado do fundo original
 *                             (`remove_background`) e posto sobre a imagem do
 *                             cenário (asset na HeyGen). A pessoa, a roupa e
 *                             os gestos são os do treino; só o fundo muda.
 *                             É o caminho padrão dos cenários;
 *   look:<look>               um look gerado por prompt (GEMEO_HEYGEN_CENARIO=look).
 *
 * Os pedidos de antes de 04/10 guardaram só o id (o gêmeo no close, o look
 * nos outros cenários), e continuam valendo.
 */
export type ImagemDaHeygen = { tipo: "gemeo"; avatarId: string } | { tipo: "fundo"; avatarId: string; assetId: string } | { tipo: "look"; lookId: string };

export function imagemDaHeygen(i: ImagemDaHeygen): string {
  return i.tipo === "gemeo" ? `gemeo:${i.avatarId}` : i.tipo === "fundo" ? `fundo:${i.avatarId}:${i.assetId}` : `look:${i.lookId}`;
}

export function lerImagemDaHeygen(imagem: string, cenario: IdDoCenario): ImagemDaHeygen {
  const [tipo, a, b] = imagem.split(":");
  if (tipo === "gemeo" && a) return { tipo: "gemeo", avatarId: a };
  if (tipo === "fundo" && a && b) return { tipo: "fundo", avatarId: a, assetId: b };
  if (tipo === "look" && a) return { tipo: "look", lookId: a };
  return cenario === "camera" ? { tipo: "gemeo", avatarId: imagem } : { tipo: "look", lookId: imagem };
}

/**
 * O MOTOR (04/10): Avatar V, o de melhor boca e movimento da HeyGen, para o
 * gêmeo treinado e para os looks (que usam o gêmeo treinado como referência
 * de movimento). GEMEO_HEYGEN_MOTOR=avatar_iv volta ao anterior.
 */
const MOTOR = () => process.env.GEMEO_HEYGEN_MOTOR ?? "avatar_v";

/**
 * O CORPO DO PEDIDO DE UM PEDAÇO na HeyGen. Exportado para a prova.
 *
 * `motion_prompt` só vai para o LOOK: a HeyGen recusa com 400 ("motion_prompt
 * is not supported for video avatars") no gêmeo treinado com Avatar IV, e foi
 * por isso que o primeiro vídeo do Bruno pela HeyGen (03/10) falhou e o que
 * ele viu saiu pela reserva. No gêmeo, o movimento é o do próprio treino.
 */
export function pedidoDaHeygen(args: { imagem: string; fala: string; cenario: IdDoCenario }): Record<string, unknown> {
  const i = lerImagemDaHeygen(args.imagem, args.cenario);
  const corpo: Record<string, unknown> = {
    type: "avatar",
    avatar_id: i.tipo === "look" ? i.lookId : i.avatarId,
    audio_asset_id: args.fala,
    aspect_ratio: PROPORCAO(),
    resolution: "1080p",
    engine: { type: MOTOR() },
    title: "Demandou gêmeo",
  };
  if (i.tipo === "fundo") {
    corpo.remove_background = true;
    corpo.background = { type: "image", asset_id: i.assetId };
    // O quadro inteiro preenchido: com "contain" num quadrado, a prova de
    // 04/10 saiu com faixas BRANCAS dos lados (o fundo só cobre a área da
    // pessoa). Com a proporção do treino (9:16), "cover" não corta nada.
    corpo.fit = "cover";
  }
  if (i.tipo === "look") corpo.motion_prompt = cenarioPorId(args.cenario).movimento;
  return corpo;
}

/**
 * A PROPORÇÃO do vídeo do gêmeo na HeyGen (04/10/2026): 9:16, a do vídeo de
 * treino (gravado em pé no celular). Era 1:1, igual à da reserva, e no
 * quadrado o gêmeo saía com a cabeça cortada ("cover") ou com faixas brancas
 * dos lados ("contain", prova de 04/10). Todos os pedaços de um vídeo saem
 * do mesmo gerador, então a junção recebe sempre o mesmo formato; a esteira
 * aceita qualquer proporção (é o formato dos cortes verticais).
 */
const PROPORCAO = () => process.env.GEMEO_PROPORCAO ?? "9:16";

export const heygenGerador: GeradorDoGemeo = {
  id: "heygen",
  modelo: "heygen/avatar-iv-digital-twin",
  configurado: () => Boolean(process.env.HEYGEN_API_KEY) || dubleLigado(),
  subirFala: async (dados, nome, contentType) => (await subirNaHeygen(dados, contentType ?? "audio/mpeg", nome)).assetId,
  async pedir({ imagem, fala, cenario }) {
    if (dubleLigado()) {
      const id = `duble-heygen-${Math.random().toString(36).slice(2, 10)}`;
      return { requestId: id, statusUrl: `duble://status/${id}?em=${Date.now()}`, responseUrl: `duble://resposta/${id}` };
    }
    const d = await heygen<{ video_id?: string }>("/v3/videos", {
      method: "POST",
      body: JSON.stringify(pedidoDaHeygen({ imagem, fala, cenario })),
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
    const d = await heygen<{ status?: string; video_url?: string; thumbnail_url?: string; duration?: number; error?: { message?: string } }>(
      `/v3/videos/${encodeURIComponent(p.requestId)}`,
      { method: "GET", acao: "buscar o vídeo" }
    );
    if (d.status === "failed" || !d.video_url) {
      throw new ErroDoFornecedor("heygen", "recusado", 200, `HeyGen não gerou o vídeo: ${d.error?.message ?? d.status ?? "sem vídeo"}`);
    }
    return { videoUrl: d.video_url, duracao: typeof d.duration === "number" ? d.duration : null, quadroUrl: d.thumbnail_url ?? null };
  },
};

// ─────────────────────────────── HeyGen, o gêmeo de foto (05/10) ───────────────────────────────

/**
 * O `imagem` de um pedaço do gêmeo de foto é `foto:<look>`: o avatar de foto
 * do cadastro. Não há cenário: o busto da foto é o quadro de todos os pedaços
 * (`geradorTemCenarios`), e é isso que evita mão inventada e fundo trocado.
 */
export function imagemDaFotoNaHeygen(lookId: string): string {
  return `foto:${lookId}`;
}

export function lerImagemDaFotoNaHeygen(imagem: string): string {
  return imagem.startsWith("foto:") ? imagem.slice(5) : imagem;
}

/**
 * A PROPORÇÃO do gêmeo de foto: "auto" (a da própria foto, o quadrado do
 * recorte), como a HeyGen recomenda para o Avatar IV. É o mesmo formato que o
 * OmniHuman entregava (1440 x 1440) e a esteira aceita. GEMEO_PROPORCAO_FOTO
 * troca (16:9, 9:16, 4:5, 1:1).
 */
const PROPORCAO_DA_FOTO = () => process.env.GEMEO_PROPORCAO_FOTO ?? "auto";

/**
 * O CORPO DO PEDIDO de um pedaço pelo gêmeo de foto. Exportado para a prova.
 *
 * Avatar IV, e não V: a tabela da HeyGen diz que `expressiveness` só existe no
 * IV e que o `motion_prompt` em foto no V exige referência de animação. O
 * movimento pedido é o busto parado com as mãos fora do quadro; a
 * expressividade baixa é a padrão deles e a que menos inventa gesto.
 */
export function pedidoDaFotoNaHeygen(args: { imagem: string; fala: string }): Record<string, unknown> {
  return {
    type: "avatar",
    avatar_id: lerImagemDaFotoNaHeygen(args.imagem),
    audio_asset_id: args.fala,
    aspect_ratio: PROPORCAO_DA_FOTO(),
    resolution: "1080p",
    engine: { type: process.env.GEMEO_HEYGEN_MOTOR_FOTO ?? "avatar_iv" },
    motion_prompt: MOVIMENTO_DA_FOTO_NA_HEYGEN,
    expressiveness: process.env.GEMEO_HEYGEN_EXPRESSIVIDADE ?? "low",
    title: "Demandou gêmeo de foto",
  };
}

export const heygenFotoGerador: GeradorDoGemeo = {
  id: "heygen-foto",
  modelo: "heygen/avatar-iv-photo-avatar",
  configurado: () => Boolean(process.env.HEYGEN_API_KEY) || dubleLigado(),
  subirFala: async (dados, nome, contentType) => (await subirNaHeygen(dados, contentType ?? "audio/mpeg", nome)).assetId,
  async pedir({ imagem, fala }) {
    if (dubleLigado()) {
      const id = `duble-heygen-foto-${Math.random().toString(36).slice(2, 10)}`;
      return { requestId: id, statusUrl: `duble://status/${id}?em=${Date.now()}`, responseUrl: `duble://resposta/${id}` };
    }
    const d = await heygen<{ video_id?: string }>("/v3/videos", {
      method: "POST",
      body: JSON.stringify(pedidoDaFotoNaHeygen({ imagem, fala })),
      acao: "pedir o vídeo",
    });
    if (!d.video_id) throw new ErroDoFornecedor("heygen", "recusado", 200, "HeyGen não devolveu o video_id");
    return { requestId: d.video_id, statusUrl: `heygen://video/${d.video_id}`, responseUrl: `heygen://video/${d.video_id}` };
  },
  estado: (p) => heygenGerador.estado(p),
  resultado: (p) => heygenGerador.resultado(p),
};

// ─────────────────────────────── qual vale ───────────────────────────────

export const GERADORES_DO_GEMEO: Record<IdDoGerador, GeradorDoGemeo> = { omnihuman, heygen: heygenGerador, "heygen-foto": heygenFotoGerador };

/** O gerador escolhido pelo ambiente (GEMEO_GERADOR), se tiver chave. */
export function geradorPreferido(): IdDoGerador {
  const pedido = (process.env.GEMEO_GERADOR ?? "omnihuman") as IdDoGerador;
  return pedido in GERADORES && GERADORES_DO_GEMEO[pedido].configurado() ? pedido : "omnihuman";
}

/** O ambiente pede a HeyGen (treinado ou de foto) e há chave: o gêmeo de foto é criado para o projeto. */
export function gemeoDeFotoLigado(): boolean {
  const p = geradorPreferido();
  return p === "heygen" || p === "heygen-foto";
}

/** O gerador de um pedido já gravado (os antigos não têm o campo). */
export function geradorDoPedido(id?: IdDoGerador | null): GeradorDoGemeo {
  return GERADORES_DO_GEMEO[id ?? "omnihuman"] ?? omnihuman;
}

/** O pedido de um pedaço gravado, de volta na forma da interface. */
export function pedidoDoPedaco(p: { requestId?: string | null; statusUrl?: string | null; responseUrl?: string | null }): PedidoAoGerador {
  return { requestId: p.requestId ?? "", statusUrl: p.statusUrl ?? "", responseUrl: p.responseUrl ?? "" };
}

