import { put, head } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";
import { gravarCustoDeVideo, type ContextoMidia } from "@/lib/media/usage";
import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";
import { normalizarEscolha, type EscolhaDeEstilo } from "@/lib/media/catalogo-de-estilos";
import { DOLAR_POR_SEGUNDO_DE_VIDEO, DOLAR_POR_SEGUNDO_DE_VIDEO_COM_SOM, geracoesPorCorte } from "@/lib/credits/higgsfield-tabela";

/**
 * A HIGGSFIELD NA EDIÇÃO DOS CORTES (item 9, fase de preparo, 29/09/2026).
 *
 * O que ela faz aqui: abertura de 3 s no começo de cada corte (o quadro real
 * da capa, animado com o movimento de câmera que o cliente escolheu), uma cena
 * de apoio por corte (outro quadro real do corte, com o efeito escolhido) e as
 * transições entre capítulos do completo. As camadas vêm de
 * `Project.videoEstiloEscolha` (lib/media/catalogo-de-estilos.ts).
 *
 * ## DESLIGADO, e por quê
 *
 * `HIGGSFIELD_NA_EDICAO` precisa ser "1" para `pedirGeracao` aceitar pedido.
 * Sem isso, tudo o que é gratuito funciona (catálogo, plano, custo, status,
 * download) e o único caminho que gasta dinheiro recusa. O dono aprova o custo
 * por vídeo antes de ligar (CONTINUAR.md, item 9).
 *
 * ## As três regras que vieram de prejuízo real
 *
 * 1. NUNCA A ESPERA DO SDK. O `subscribe` com polling desiste em 300 s e joga
 *    fora o request_id, e a geração continua (e é cobrada) do lado deles; foi
 *    o que aconteceu em 28/09 (HANDOFF, parte 177). Aqui o pedido devolve o id,
 *    o id vai para o Blob NA HORA, e quem consulta o status é outra chamada,
 *    mais tarde, de um trabalho da fila.
 * 2. SEM RETENTATIVA NO POST. O SDK repete o POST com backoff; um POST que
 *    chegou lá e cuja resposta se perdeu vira DUAS gerações pagas. Aqui é um
 *    fetch só. Falhou, quem decide repetir é o trabalho da fila, e ele passa
 *    antes pelo checkpoint.
 * 3. IDEMPOTENTE POR (referência, chave). Se já existe request_id gravado para
 *    aquele pedaço (ex.: `corte-2/abertura`), `pedirGeracao` devolve o mesmo id
 *    em vez de pagar outro. A lição do Veo e do carrossel.
 *
 * ## Preço (levantado em 29/09/2026, open.higgsfield.ai, páginas de cada modelo)
 *
 * A API cobra em dólar direto, sem crédito, e falha não é cobrada. Os valores
 * abaixo são o preço CHEIO; até 01/10/2026 o Kling 3.0 está com 45% de
 * desconto, e o plano não conta com isso.
 */

const BASE = "https://api.higgsfield.ai";

/**
 * Pedido só com a chave ligada; nunca imprimir o que sai daqui. Exportado
 * (01/10) para a geração de imagem (lib/media/imagem-higgsfield.ts) usar o
 * mesmo cabeçalho, e não uma segunda cópia que um dia diverge.
 */
export function cabecalho(): Record<string, string> {
  const cred = process.env.HF_CREDENTIALS;
  if (!cred) throw new Error("HF_CREDENTIALS ausente no ambiente.");
  // O mesmo User-Agent do SDK oficial, que é o cliente que a API conhece.
  return { Authorization: `Key ${cred}`, "User-Agent": "higgsfield-server-js/2.0", "Content-Type": "application/json" };
}

/** A chave geral. Desligada por padrão: sem ela nenhuma geração paga sai. */
export function higgsfieldNaEdicaoLigada(): boolean {
  return process.env.HIGGSFIELD_NA_EDICAO === "1";
}

// ─────────────────────────────── catálogo ───────────────────────────────

export type ModeloDoCatalogo = {
  slug: string;
  title: string;
  description: string;
  operation_type: string[];
  output_type: string;
  input_schema?: unknown;
};

/** GET /models, gratuito. `comEsquema` traz os parâmetros aceitos de cada modelo. */
export async function listarModelos(comEsquema = false): Promise<ModeloDoCatalogo[]> {
  const r = await fetch(`${BASE}/models${comEsquema ? "?include_schema=true" : ""}`, {
    headers: cabecalho(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Catálogo da Higgsfield respondeu HTTP ${r.status}.`);
  const corpo = (await r.json()) as { items?: ModeloDoCatalogo[] };
  return corpo.items ?? [];
}

// ─────────────────────────────── modelos e preço ───────────────────────────────

export type IdDoModelo = "kling-std" | "kling-pro" | "seedance-25";

type FichaDoModelo = {
  /** Endpoint de imagem para vídeo (o quadro real do corte). */
  imagemParaVideo: string;
  /** Endpoint de texto para vídeo; só para quando não há quadro. */
  textoParaVideo: string;
  resolucao: "720p" | "1080p";
  /** Faixa de duração aceita pela API (conferida no esquema do GET /models). */
  minSeg: number;
  maxSeg: number;
  /** US$ por segundo, SEM som gerado (preço cheio). */
  dolarPorSegundo: number;
  /** US$ por segundo com som gerado; a edição não usa, fica para comparar. */
  dolarPorSegundoComSom: number;
};

/**
 * Por que Kling e não Seedance na edição: a abertura tem 3 s, e o Seedance 2.5
 * só aceita de 4 a 30 s (esquema do GET /models); pagar 4 s para usar 3 é
 * jogar 25% fora, a US$ 0,46 por segundo. O Kling 3.0 aceita de 3 a 15 s, tem
 * `last_image_url` (serve para transição: quadro final de um capítulo até o
 * inicial do seguinte) e custa um quarto. O som vai desligado porque o corte já
 * tem voz e trilha; som gerado custaria 50% a mais para ser abafado na mixagem.
 *
 * Kling Pro sai em 1080p, Std em 720p. O corte é 1080x1920, e a abertura é o
 * primeiro segundo que o espectador vê: por isso o padrão é o Pro.
 */
export const MODELOS: Record<IdDoModelo, FichaDoModelo> = {
  "kling-std": {
    imagemParaVideo: "kling-video/v3.0/std/image-to-video",
    textoParaVideo: "kling-video/v3.0/std/text-to-video",
    resolucao: "720p",
    minSeg: 3,
    maxSeg: 15,
    dolarPorSegundo: DOLAR_POR_SEGUNDO_DE_VIDEO["kling-std"],
    dolarPorSegundoComSom: DOLAR_POR_SEGUNDO_DE_VIDEO_COM_SOM["kling-std"],
  },
  "kling-pro": {
    imagemParaVideo: "kling-video/v3.0/pro/image-to-video",
    textoParaVideo: "kling-video/v3.0/pro/text-to-video",
    resolucao: "1080p",
    minSeg: 3,
    maxSeg: 15,
    dolarPorSegundo: DOLAR_POR_SEGUNDO_DE_VIDEO["kling-pro"],
    dolarPorSegundoComSom: DOLAR_POR_SEGUNDO_DE_VIDEO_COM_SOM["kling-pro"],
  },
  // Seedance 2.5 cobra por token de vídeo: ceil(alt x larg x seg x 24 / 1024)
  // tokens, a US$ 0,0214 por mil em 720p. Em 1280x720 dá US$ 0,4622 por
  // segundo; a imagem de referência não conta como entrada. A página não diz
  // se som gerado muda o preço; a edição pede sem som, então não importa aqui.
  "seedance-25": {
    imagemParaVideo: "bytedance/seedance-2.5/image-to-video",
    textoParaVideo: "bytedance/seedance-2.5/text-to-video",
    resolucao: "720p",
    minSeg: 4,
    maxSeg: 30,
    dolarPorSegundo: DOLAR_POR_SEGUNDO_DE_VIDEO["seedance-25"],
    dolarPorSegundoComSom: DOLAR_POR_SEGUNDO_DE_VIDEO_COM_SOM["seedance-25"],
  },
};

export const MODELO_PADRAO: IdDoModelo = "kling-pro";

/** Segundos que a API de fato cobra (arredonda para dentro da faixa aceita). */
export function segundosCobrados(modelo: IdDoModelo, segundos: number): number {
  const f = MODELOS[modelo];
  return Math.min(f.maxSeg, Math.max(f.minSeg, Math.ceil(segundos)));
}

export function custoDaGeracao(modelo: IdDoModelo, segundos: number): number {
  return +(segundosCobrados(modelo, segundos) * MODELOS[modelo].dolarPorSegundo).toFixed(4);
}

// ─────────────────────────────── camadas no prompt ───────────────────────────────

/**
 * Cada movimento do catálogo, na língua que o modelo entende. Em inglês porque
 * os dois modelos foram treinados com a nomenclatura de set (dolly, crane,
 * whip pan), e o nome em português só confunde. O sujeito é sempre "the
 * subject": o prompt não descreve a pessoa, quem mostra é o quadro real.
 */
export const CAMERA_NO_PROMPT: Record<string, string> = {
  "dolly-in": "slow dolly in toward the subject, smooth and steady",
  "dolly-out": "slow dolly out away from the subject, revealing the surroundings",
  "crash-zoom": "fast crash zoom into the subject's face",
  vertigo: "dolly zoom (vertigo effect): the subject stays the same size while the background stretches",
  "grua-sobe": "crane shot rising up and opening the frame",
  "grua-desce": "crane shot descending down to the subject",
  orbita: "360 degree orbit around the subject",
  arco: "half arc camera move around the subject, adding depth",
  pan: "slow horizontal pan across the scene",
  "whip-pan": "fast whip pan with motion blur",
  "na-mao": "handheld camera with subtle natural shake",
  "drone-fpv": "fast low FPV drone flight through the space",
  "recuo-aereo": "aerial pull back rising until the whole place is visible",
  "de-cima": "top-down overhead shot, like a map",
  "bullet-time": "bullet time: the moment freezes and the camera rotates around the subject",
  timelapse: "timelapse: light and background pass hours in seconds while the subject stays still",
  hiperlapso: "hyperlapse with the camera moving forward",
  foco: "rack focus shifting from foreground to the subject",
  atraves: "camera passes through an object in the foreground and comes out the other side",
  estatica: "static locked-off camera, only the subject moves",
};

/**
 * Os efeitos. Três deles o ffmpeg faz de graça e melhor (clarão, falha digital,
 * vazamento de luz são sobreposições de 0,3 a 0,6 s): pagar IA por isso seria
 * gastar em algo que o worker já sabe desenhar. Esses ficam marcados e o plano
 * não conta custo para eles.
 */
export const EFEITO_NO_PROMPT: Record<string, { prompt: string; noFfmpeg?: true }> = {
  "mundo-congelado": { prompt: "everything around freezes in time, only the subject keeps moving" },
  clones: { prompt: "several copies of the subject appear in the same scene" },
  sumir: { prompt: "the subject dissolves into particles and disappears" },
  derreter: { prompt: "the scene melts and drips into the next scene" },
  lidar: { prompt: "the scene turns into a lidar point cloud and rebuilds itself" },
  "zoom-da-terra": { prompt: "zoom from outer space down to the city and the exact place" },
  particulas: { prompt: "soft glowing particles floating in the air" },
  colagem: { prompt: "paper cut-out collage look, torn paper edges, soft shadows and magazine texture" },
  quadrinho: { prompt: "the frame turns into a comic book page panel" },
  recorte: { prompt: "the subject as a paper cut-out over a textured paper background" },
  glitch: { prompt: "short digital glitch", noFfmpeg: true },
  flash: { prompt: "short white flash", noFfmpeg: true },
  "luz-vazada": { prompt: "warm film light leak", noFfmpeg: true },
};

export const LOOK_NO_PROMPT: Record<string, string> = {
  natural: "natural balanced color",
  "cinema-quente": "warm cinematic film grade, earthy tones",
  "frio-escuro": "cool dark grade, strong shadows",
  pastel: "soft pastel colors",
  "pb-destaque": "black and white with a single accent color",
  "filme-16mm": "16mm film grain, soft edges",
  vhs: "VHS tape look, scan lines, faded magenta and cyan",
  ilustrado: "illustrated line-art look over the real image",
  papel: "paper texture over the scene",
  pintura: "painterly brush strokes",
  "alto-contraste": "high contrast, saturated",
};

export type PapelDaGeracao = "abertura" | "apoio" | "transicao";

/**
 * Monta o prompt de uma geração. Regras fixas no fim de todo prompt: a pessoa
 * do quadro não muda de rosto (é o cliente, e um rosto diferente seria mentir
 * sobre quem fala), nada de texto na tela (a legenda é nossa) e nada de logo.
 */
export function montarPrompt(p: {
  papel: PapelDaGeracao;
  camera?: string | null;
  efeito?: string | null;
  look?: string | null;
  /** Uma linha sobre o assunto do corte, em inglês, sem nome próprio. */
  assunto?: string;
}): string {
  const partes: string[] = [];
  if (p.papel === "abertura") partes.push("Cinematic 3 second opening shot of this exact frame.");
  if (p.papel === "apoio") partes.push("Short cinematic cutaway shot based on this exact frame.");
  if (p.papel === "transicao") partes.push("Seamless cinematic transition from the first frame to the last frame.");
  if (p.camera && CAMERA_NO_PROMPT[p.camera]) partes.push(`Camera: ${CAMERA_NO_PROMPT[p.camera]}.`);
  if (p.efeito && EFEITO_NO_PROMPT[p.efeito] && !EFEITO_NO_PROMPT[p.efeito].noFfmpeg) {
    partes.push(`Effect: ${EFEITO_NO_PROMPT[p.efeito].prompt}.`);
  }
  if (p.look && LOOK_NO_PROMPT[p.look]) partes.push(`Look: ${LOOK_NO_PROMPT[p.look]}.`);
  if (p.assunto) partes.push(`Context: ${p.assunto.slice(0, 200)}.`);
  partes.push("Keep the person's face and identity exactly as in the image. No text, no captions, no logos, no watermark.");
  return partes.join(" ");
}

/** A linguagem do catálogo como direção de arte da cena gerada (sem gente). */
const CENA_DA_LINGUAGEM: Record<string, string> = {
  vox: "animated editorial paper collage in the style of an explainer video: torn paper cut-outs, black-and-white halftone photo clippings, hand-drawn arrows and circles, one vivid orange highlighter accent, paper texture",
  "johnny-harris": "animated maps and handwritten annotations over old photos, paper and pen texture",
  "crime-real": "dark investigation board with documents, red strings and hard light",
  kurzgesagt: "flat vector animation with soft gradients and simple icons",
  "quadro-branco": "whiteboard line drawing being sketched, black ink with one orange accent",
  hormozi: "bold high-contrast motion graphics with big shapes and punchy light",
  mrbeast: "bright saturated dynamic motion graphics",
  natgeo: "cinematic documentary b-roll with rich warm light",
  bbc: "sober newsroom b-roll with clean graphics",
};

/**
 * A cena gerada SEM PESSOA (30/09): abertura e apoio dos cortes. Nenhuma
 * gente, nenhum rosto, nenhum texto: o rosto do cliente só aparece como pixel
 * da gravação, e texto gerado por IA sai errado em português.
 */
export function promptDeCenaSemPessoa(p: {
  papel: PapelDaGeracao;
  camera?: string | null;
  efeito?: string | null;
  look?: string | null;
  estiloId?: string | null;
  assunto?: string;
}): string {
  const partes: string[] = [];
  partes.push(p.papel === "abertura" ? "3 second vertical opening shot for a short video." : "3 second vertical cutaway b-roll shot.");
  partes.push(`Style: ${CENA_DA_LINGUAGEM[p.estiloId ?? ""] ?? "cinematic b-roll with soft light"}.`);
  if (p.assunto) partes.push(`Visual metaphor for this idea (Brazilian Portuguese): "${p.assunto.slice(0, 180)}".`);
  if (p.camera && CAMERA_NO_PROMPT[p.camera]) partes.push(`Camera: ${CAMERA_NO_PROMPT[p.camera]}.`);
  if (p.efeito && EFEITO_NO_PROMPT[p.efeito] && !EFEITO_NO_PROMPT[p.efeito].noFfmpeg) partes.push(`Effect: ${EFEITO_NO_PROMPT[p.efeito].prompt}.`);
  if (p.look && LOOK_NO_PROMPT[p.look]) partes.push(`Look: ${LOOK_NO_PROMPT[p.look]}.`);
  partes.push("Absolutely no people, no faces, no hands, no bodies. No text, no letters, no captions, no logos, no watermark.");
  return partes.join(" ");
}

// ─────────────────────────────── pedido e checkpoint ───────────────────────────────

export type PedidoGuardado = {
  requestId: string;
  modelo: IdDoModelo;
  endpoint: string;
  segundos: number;
  custoEstimadoUsd: number;
  pedidoEm: string;
  status?: string;
  /** URL do mp4 na Higgsfield (temporária) e a cópia no nosso Blob. */
  urlHiggsfield?: string;
  blobUrl?: string;
  custoGravado?: boolean;
};

function caminhoDoPedido(referencia: string, chave: string): string {
  const limpo = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  return `higgsfield/${limpo(referencia)}/${limpo(chave)}.json`;
}

/** O que já foi pedido para este pedaço, ou null. Sem validade: id pago não expira para nós. */
export async function pedidoGuardado(referencia: string, chave: string): Promise<PedidoGuardado | null> {
  const { token } = midiaProduzida();
  try {
    const meta = await head(caminhoDoPedido(referencia, chave), { token });
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PedidoGuardado;
  } catch {
    // `head` estoura quando não existe, que é o normal antes do primeiro pedido.
    return null;
  }
}

async function guardarPedido(referencia: string, chave: string, dados: PedidoGuardado): Promise<void> {
  await put(caminhoDoPedido(referencia, chave), JSON.stringify(dados), {
    ...midiaProduzida(),
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export type NovoPedido = {
  modelo?: IdDoModelo;
  /** Quadro real do corte (URL pública). Sem ele, texto para vídeo. */
  imagemUrl?: string;
  /** Quadro final, para transição (Kling `last_image_url`, Seedance `end_image_url`). */
  imagemFinalUrl?: string;
  prompt: string;
  segundos: number;
  /** Só texto para vídeo; imagem para vídeo segue a proporção do quadro. */
  proporcao?: "9:16" | "16:9";
  /** Ex.: o id do VideoJob. */
  referencia: string;
  /** Ex.: "corte-2-abertura". Junto com a referência, é a chave de idempotência. */
  chave: string;
};

/** O corpo exato de cada família, conferido no esquema do GET /models em 29/09. */
function corpoDoPedido(p: NovoPedido, modelo: IdDoModelo): Record<string, unknown> {
  const duration = segundosCobrados(modelo, p.segundos);
  if (modelo === "seedance-25") {
    return {
      prompt: p.prompt,
      duration,
      resolution: MODELOS[modelo].resolucao,
      generate_audio: false,
      ...(p.imagemUrl ? { image_url: p.imagemUrl } : { aspect_ratio: p.proporcao ?? "9:16" }),
      ...(p.imagemUrl && p.imagemFinalUrl ? { end_image_url: p.imagemFinalUrl } : {}),
    };
  }
  return {
    prompt: p.prompt,
    duration,
    sound: "off",
    ...(p.imagemUrl ? { image_url: p.imagemUrl } : { aspect_ratio: p.proporcao ?? "9:16" }),
    ...(p.imagemUrl && p.imagemFinalUrl ? { last_image_url: p.imagemFinalUrl } : {}),
  };
}

/**
 * O ÚNICO caminho que gasta dinheiro. Devolve o request_id já gravado no Blob.
 * Não espera o vídeo: quem espera é `concluirSePronto`, chamado depois.
 */
export async function pedirGeracao(p: NovoPedido): Promise<PedidoGuardado> {
  const existente = await pedidoGuardado(p.referencia, p.chave);
  if (existente?.requestId) return existente;

  if (!higgsfieldNaEdicaoLigada()) {
    throw new Error("Higgsfield desligada na edição (HIGGSFIELD_NA_EDICAO diferente de 1). Nenhum pedido feito.");
  }

  const modelo = p.modelo ?? MODELO_PADRAO;
  const endpoint = p.imagemUrl ? MODELOS[modelo].imagemParaVideo : MODELOS[modelo].textoParaVideo;
  const r = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: cabecalho(),
    body: JSON.stringify(corpoDoPedido(p, modelo)),
    signal: AbortSignal.timeout(60_000),
  });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    // 403 é saldo da conta da API; é assunto do Bruno, não do cliente. Desde
    // 06/10 vira incidente e aviso ao admin (lib/fornecedores/aviso-de-saldo.ts).
    await conferirResposta("higgsfield", { status: r.status, corpo }, "vídeo da Higgsfield na edição");
    throw new Error(`Higgsfield recusou o pedido (HTTP ${r.status}): ${String(corpo.detail ?? "").slice(0, 200)}`);
  }
  const requestId = String(corpo.request_id ?? "");
  if (!requestId) throw new Error("A Higgsfield aceitou mas não devolveu request_id.");

  const guardado: PedidoGuardado = {
    requestId,
    modelo,
    endpoint,
    segundos: segundosCobrados(modelo, p.segundos),
    custoEstimadoUsd: custoDaGeracao(modelo, p.segundos),
    pedidoEm: new Date().toISOString(),
    status: String(corpo.status ?? "queued"),
  };
  // Gravar ANTES de qualquer outra coisa: se a função morrer daqui para
  // frente, o id pago continua recuperável.
  await guardarPedido(p.referencia, p.chave, guardado);
  return guardado;
}

// ─────────────────────────────── status e resultado ───────────────────────────────

export type EstadoDoPedido = {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled" | string;
  videoUrl?: string;
  final: boolean;
};

/** GET /requests/{id}/status, gratuito. */
export async function consultarPedido(requestId: string): Promise<EstadoDoPedido> {
  const r = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/status`, {
    headers: cabecalho(),
    signal: AbortSignal.timeout(30_000),
  });
  // 5xx é instabilidade deles; o pedido segue lá. Quem chamou tenta mais tarde.
  if (r.status >= 500) return { status: "in_progress", final: false };
  if (!r.ok) throw new Error(`Status da Higgsfield respondeu HTTP ${r.status}.`);
  const c = (await r.json()) as Record<string, unknown>;
  const status = String(c.status ?? "desconhecido");
  // O Seedance devolveu `video.url` em 28/09; as outras famílias podem vir
  // como lista. Aceitar as duas formas custa uma linha e evita tratar um vídeo
  // pronto (e pago) como "sem URL".
  const video = c.video as { url?: string } | string | undefined;
  const lista = (c.videos ?? c.outputs) as Array<{ url?: string }> | undefined;
  const videoUrl = (typeof video === "string" ? video : video?.url) ?? (Array.isArray(lista) ? lista[0]?.url : undefined);
  return { status, videoUrl, final: ["completed", "failed", "nsfw", "canceled", "cancelled"].includes(status) };
}

export async function baixarResultado(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`Não consegui baixar o vídeo da Higgsfield (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Chamado pelo trabalho da fila, de tempos em tempos, até o pedido fechar.
 * Quando fecha com vídeo: copia para o nosso Blob (a URL deles é temporária)
 * e grava o custo em `ai_usage` uma vez só. Falha não é cobrada pela
 * Higgsfield, e por isso não grava custo.
 */
export async function concluirSePronto(
  referencia: string,
  chave: string,
  ctx: ContextoMidia
): Promise<PedidoGuardado | null> {
  const guardado = await pedidoGuardado(referencia, chave);
  if (!guardado) return null;
  if (guardado.blobUrl || ["failed", "nsfw", "canceled", "cancelled"].includes(guardado.status ?? "")) return guardado;

  const estado = await consultarPedido(guardado.requestId);
  const novo: PedidoGuardado = { ...guardado, status: estado.status, urlHiggsfield: estado.videoUrl ?? guardado.urlHiggsfield };
  if (estado.status === "completed" && estado.videoUrl) {
    const mp4 = await baixarResultado(estado.videoUrl);
    const blob = await put(`higgsfield/${referencia.replace(/[^a-zA-Z0-9_-]/g, "")}/${chave.replace(/[^a-zA-Z0-9_-]/g, "")}.mp4`, mp4, {
      ...midiaProduzida(),
      contentType: "video/mp4",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    novo.blobUrl = blob.url;
    if (!novo.custoGravado) {
      gravarCustoDeVideo(guardado.endpoint, guardado.custoEstimadoUsd, ctx);
      novo.custoGravado = true;
    }
  }
  await guardarPedido(referencia, chave, novo);
  return novo;
}

// ─────────────────────────────── o plano por vídeo ───────────────────────────────

export type GeracaoPlanejada = {
  chave: string;
  papel: PapelDaGeracao;
  alvo: "corte" | "completo";
  indice: number;
  modelo: IdDoModelo;
  segundos: number;
  camera: string | null;
  efeito: string | null;
  /** De onde vem o quadro real. */
  quadro: "capa do corte" | "meio do corte" | "capa do completo" | "fim e começo de capítulo";
  prompt: string;
  custoUsd: number;
};

export type PlanoDaEdicao = {
  geracoes: GeracaoPlanejada[];
  /** Efeitos que o worker desenha sem custo (clarão, falha, luz vazada). */
  efeitosNoFfmpeg: string[];
  custoPorCorteUsd: number;
  custoDoCompletoUsd: number;
  custoTotalUsd: number;
};

/**
 * O plano de uso, puro (não chama nada). Por corte: 1 abertura de 3 s a
 * partir do quadro da capa, com um movimento de câmera escolhido, e 1 cena de
 * apoio de 3 s a partir de um quadro do meio do corte, com um efeito
 * escolhido. No completo: 1 abertura de 3 s e até 3 transições de 3 s entre
 * capítulos. Os movimentos e efeitos giram entre os cortes para o cliente ver
 * tudo o que escolheu, e não o primeiro da lista repetido.
 *
 * Por que a cena de apoio parte de um quadro REAL e não de texto: a regra de
 * 23/08 (lib/media/efeitos.ts) é que só entra o que sai da gravação. Cena
 * inventada do zero seria imagem de acervo com outro nome.
 */
export function planejarEdicao(
  escolhaBruta: unknown,
  o: { cortes: number; comCompleto: boolean; capitulosDoCompleto?: number; modelo?: IdDoModelo }
): PlanoDaEdicao {
  const escolha: EscolhaDeEstilo = normalizarEscolha(escolhaBruta);
  const modelo = o.modelo ?? MODELO_PADRAO;
  const cameras = escolha.camera.length ? escolha.camera : ["dolly-in"];
  const efeitosIa = escolha.efeitos.filter((e) => !EFEITO_NO_PROMPT[e]?.noFfmpeg);
  const efeitosNoFfmpeg = escolha.efeitos.filter((e) => EFEITO_NO_PROMPT[e]?.noFfmpeg);
  const SEG = 3;
  const geracoes: GeracaoPlanejada[] = [];
  const add = (g: Omit<GeracaoPlanejada, "prompt" | "custoUsd" | "modelo" | "segundos">) =>
    geracoes.push({
      ...g,
      modelo,
      segundos: segundosCobrados(modelo, SEG),
      prompt: montarPrompt({ papel: g.papel, camera: g.camera, efeito: g.efeito, look: escolha.look }),
      custoUsd: custoDaGeracao(modelo, SEG),
    });

  // A mesma regra que a cobrança usa (lib/credits/higgsfield-tabela.ts).
  const porCorte = geracoesPorCorte(escolha);
  for (let i = 0; i < o.cortes; i++) {
    if (porCorte.abertura) {
      add({ chave: `corte-${i}-abertura`, papel: "abertura", alvo: "corte", indice: i, camera: cameras[i % cameras.length], efeito: null, quadro: "capa do corte" });
    }
    if (porCorte.apoio) add({
      chave: `corte-${i}-apoio`,
      papel: "apoio",
      alvo: "corte",
      indice: i,
      camera: cameras[(i + 1) % cameras.length],
      efeito: efeitosIa.length ? efeitosIa[i % efeitosIa.length] : null,
      quadro: "meio do corte",
    });
  }
  if (o.comCompleto) {
    add({ chave: "completo-abertura", papel: "abertura", alvo: "completo", indice: 0, camera: cameras[0], efeito: null, quadro: "capa do completo" });
    const transicoes = Math.min(3, Math.max(0, (o.capitulosDoCompleto ?? 4) - 1));
    for (let t = 0; t < transicoes; t++) {
      add({
        chave: `completo-transicao-${t}`,
        papel: "transicao",
        alvo: "completo",
        indice: t,
        camera: cameras[(t + 1) % cameras.length],
        efeito: efeitosIa.length ? efeitosIa[t % efeitosIa.length] : null,
        quadro: "fim e começo de capítulo",
      });
    }
  }
  const soma = (xs: GeracaoPlanejada[]) => +xs.reduce((s, g) => s + g.custoUsd, 0).toFixed(4);
  const doCorte = geracoes.filter((g) => g.alvo === "corte");
  return {
    geracoes,
    efeitosNoFfmpeg,
    custoPorCorteUsd: o.cortes ? +(soma(doCorte) / o.cortes).toFixed(4) : 0,
    custoDoCompletoUsd: soma(geracoes.filter((g) => g.alvo === "completo")),
    custoTotalUsd: soma(geracoes),
  };
}
