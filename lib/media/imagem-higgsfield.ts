import { createHash } from "node:crypto";
import sharp from "sharp";
import { head, put } from "@vercel/blob";
import { cabecalho } from "@/lib/media/higgsfield";
import { DOLAR_POR_IMAGEM } from "@/lib/credits/higgsfield-tabela";
import { midiaProduzida } from "@/lib/media/storage";
import { gravarCustoDeImagem, type ContextoMidia } from "@/lib/media/usage";
import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";

/**
 * A IMAGEM PELA HIGGSFIELD (01/10/2026), com o Google como RECUO.
 *
 * ## Por que trocou
 *
 * A prova de 30/09 (scripts/tmp/prova-imagem-higgsfield-3009.mts, 18 imagens
 * com o prompt EXATO das montagens já pagas no Google) mostrou modelos mais
 * baratos e iguais ou melhores para cada tipo de imagem, e o Bruno aprovou a
 * troca em 01/10 ("escolha todos mais baratos dentro do aceitável"):
 *
 * - colagem, arte e fundo: GPT Image 2.5 em qualidade baixa (o "Marketing
 *   Studio" da Higgsfield), ~US$ 0,025 contra US$ 0,101 do Nano Banana 2 em
 *   2K. Sem texto inventado nos três casos; o Google desenhou texto falso em um.
 * - elemento recortado: Recraft V4.1 Utility, US$ 0,035, com o fundo verde
 *   pedido como PARÂMETRO (background_color), não só no texto. Recorte limpo
 *   nos três; o Google desenhou água e pedras junto do barco.
 * - cenário sem a pessoa (edição do quadro real): Grok Imagine 2.0, US$ 0,08
 *   contra US$ 0,136 do Nano Banana Pro. O Qwen inventou objetos: ficou fora.
 * - O mais barato de todos (Z-Image Turbo, ~US$ 0,015) caiu na qualidade.
 *
 * ## O seletor
 *
 * Um por tipo, em variável de ambiente: IMAGEM_COLAGEM, IMAGEM_ARTE,
 * IMAGEM_FUNDO, IMAGEM_ELEMENTO, IMAGEM_CENARIO. O valor é um id de
 * `FICHAS`, "openai-gpt-image-2-low", "openai-gpt-image-2-medium" ou
 * "google". Sem a variável vale o `PADRAO` (os aprovados). Voltar um tipo
 * para o caminho antigo é mudar a variável, sem deploy de código (a arte
 * antiga é IMAGEM_ARTE=openai-gpt-image-2-medium).
 *
 * O RECUO da arte (01/10) passa antes pelo GPT Image 2 da OpenAI em qualidade
 * baixa e só depois pelo Google: a frase da arte é composta em código desde
 * 30/09, e o low da OpenAI saiu a US$ 0,0064 na prova de 01/10 (1536x1024),
 * contra US$ 0,101 do Nano Banana 2 em 2K.
 *
 * ## A fila e o recuo
 *
 * A conta da Higgsfield faz só 2 pedidos ao mesmo tempo (10 depois de US$ 25
 * em recargas); o resto espera na fila DELES, e na prova as edições esperaram
 * ~20 min. Uma montagem pede dezenas de imagens. Três defesas, em ordem:
 *
 * 1. VAGA NO NOSSO LADO: no máximo HIGGSFIELD_IMAGENS_SIMULTANEAS (padrão 2)
 *    pedidos em voo por processo. Quem não pega vaga em `ESPERA_POR_VAGA_MS`
 *    vai para o Google, em vez de empilhar na fila deles.
 * 2. A FILA DELES COMO SINAL: a vaga é por processo, e duas funções da Vercel
 *    rodando juntas somam 4 pedidos numa conta que faz 2. Pedido que fica
 *    "queued" mais que `FILA_MAX_MS` é CANCELADO (pedido na fila não começou e
 *    não é cobrado; a API responde 202) e vai para o Google.
 * 3. PRAZO: cada modelo tem um teto do pedido ao resultado, e quem chama pode
 *    passar um `ate` absoluto (a montagem passa, para caber no passo
 *    "dirigindo", que é dado como morto em 10 min). Estourou, cancela se ainda
 *    der e cai no Google.
 *
 * Recusa por saldo ("Not enough credits"), chave inválida ou 402/403 abre um
 * RECUO GERAL de 15 min: nesse tempo nenhuma imagem tenta a Higgsfield, para
 * não pagar a latência de um POST recusado em cada uma. Saldo de API é
 * assunto do Bruno, nunca do cliente: o log grita, a imagem sai do Google.
 *
 * ## As regras do vídeo valem aqui (lib/media/higgsfield.ts)
 *
 * Um POST só, sem retentativa (POST cuja resposta se perdeu é geração paga em
 * dobro); o request_id vai para o Blob ANTES da espera, numa chave que é o
 * hash do pedido: se a função morrer, ou se a imagem estourar o prazo depois
 * de começar (aí já é cobrada), a próxima chamada com o mesmo pedido recupera
 * a imagem paga em vez de pedir outra. Imagem já entregue não é reaproveitada
 * por esse caminho: "refazer" com o mesmo texto tem de dar imagem nova.
 *
 * ## Custo
 *
 * A API não devolve o valor cobrado; vale o preço da página de cada modelo
 * (open.higgsfield.ai, conferido na prova de 30/09). Grava em `ai_usage` no
 * fim, com o id do gerador em `model` (ex.: "higgsfield-gpt-image-2.5-low") e
 * a operação de quem chamou. Falha não é cobrada e não grava.
 */

const BASE = "https://api.higgsfield.ai";

export type TipoDeImagem = "colagem" | "arte" | "fundo" | "elemento" | "cenario";

export type IdDaHiggsfield = "higgsfield-gpt-image-2.5-low" | "higgsfield-gpt-image-2.5-medium" | "higgsfield-recraft-v4.1" | "higgsfield-grok-imagine-2.0";
/** A OpenAI direta (lib/media/gpt-image.ts): o medium era o caminho da arte até 01/10. */
export type IdDaOpenAI = "openai-gpt-image-2-low" | "openai-gpt-image-2-medium";
export type GeradorDeImagem = IdDaHiggsfield | IdDaOpenAI | "google";
const DA_OPENAI: IdDaOpenAI[] = ["openai-gpt-image-2-low", "openai-gpt-image-2-medium"];
export const ehDaOpenAI = (g: GeradorDeImagem): g is IdDaOpenAI => (DA_OPENAI as string[]).includes(g);
export const ehDaHiggsfield = (g: GeradorDeImagem): g is IdDaHiggsfield => g in FICHAS;

type PedidoDeImagem = { prompt: string; proporcao: string; imagemUrl?: string; fundoVerde?: boolean };

type FichaDaImagem = {
  endpoint: string;
  /** Preço cheio por imagem, na configuração que `corpo` pede. */
  precoUsd: number;
  /** Aceita imagem de entrada (edição do quadro real). */
  edita: boolean;
  /** Tamanho máximo do prompt no esquema do GET /models. */
  limiteDoPrompt: number;
  /** Proporções aceitas (esquema do GET /models, 30/09). */
  proporcoes: string[];
  /** Do pedido ao resultado, contando a fila deles. */
  prazoMs: number;
  corpo: (p: PedidoDeImagem & { proporcaoAceita: string }) => Record<string, unknown>;
};

/** Os corpos são os da prova de 30/09, conferidos no esquema de cada modelo. */
export const FICHAS: Record<IdDaHiggsfield, FichaDaImagem> = {
  // "low" e 2K: a qualidade baixa foi a aprovada na prova, e 2K é o tamanho
  // que dispensa ampliação para 1080x1920 (a mesma conta do "hd" do Google).
  // enhance_prompt desligado: o prompt da montagem é exato de propósito (as
  // proibições de texto e de gente), e reescrita automática as dilui.
  "higgsfield-gpt-image-2.5-low": {
    endpoint: "marketing-studio/image/sunburst",
    precoUsd: DOLAR_POR_IMAGEM["higgsfield-gpt-image-2.5-low"],
    edita: true,
    limiteDoPrompt: 5000,
    proporcoes: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
    prazoMs: 150_000,
    corpo: (p) => ({
      prompt: p.prompt,
      resolution: "2k",
      quality: "low",
      aspect_ratio: p.proporcaoAceita,
      enhance_prompt: false,
      ...(p.imagemUrl ? { image_urls: [p.imagemUrl] } : {}),
    }),
  },
  /**
   * MEDIUM (02/10, prova A/B em scripts/tmp/ab-0210): a imagem da montagem
   * sai como fotografia em "medium" (23 a 24 de 25 no juiz por visão), e o
   * "high", padrão da ferramenta, acrescentou 1 ponto por 2,8x o preço. O
   * preço do medium NÃO está na API nem no HTML da página de preços (carrega
   * por script): US$ 0,06 é estimativa pela razão do GPT Image 2 da OpenAI
   * (low 0,0096 medido, medium 0,045 medido), A CONFERIR no painel da conta.
   */
  "higgsfield-gpt-image-2.5-medium": {
    endpoint: "marketing-studio/image/sunburst",
    precoUsd: DOLAR_POR_IMAGEM["higgsfield-gpt-image-2.5-medium"],
    edita: true,
    limiteDoPrompt: 5000,
    proporcoes: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
    prazoMs: 150_000,
    corpo: (p) => ({
      prompt: p.prompt,
      resolution: "2k",
      quality: "medium",
      aspect_ratio: p.proporcaoAceita,
      enhance_prompt: false,
      ...(p.imagemUrl ? { image_urls: [p.imagemUrl] } : {}),
    }),
  },
  // Utility em 1K: o adesivo ocupa um terço do quadro e o recorte reduz para
  // 1024 de qualquer forma (recortarPorCor). O verde vai como parâmetro: na
  // prova, só com o texto, um modelo devolveu fundo cáqui (30/09).
  "higgsfield-recraft-v4.1": {
    endpoint: "recraft/v4.1/utility/text-to-image",
    precoUsd: DOLAR_POR_IMAGEM["higgsfield-recraft-v4.1"],
    edita: false,
    limiteDoPrompt: 10000,
    proporcoes: ["1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16"],
    prazoMs: 120_000,
    corpo: (p) => ({
      prompt: p.prompt,
      resolution: "1k",
      aspect_ratio: p.proporcaoAceita,
      output_format: "png",
      ...(p.fundoVerde ? { background_color: { rgb: [0, 255, 0] } } : {}),
    }),
  },
  // Edição do quadro: o mesmo endpoint, com a imagem em `image_urls`.
  "higgsfield-grok-imagine-2.0": {
    endpoint: "xai/grok-imagine-image-2.0",
    precoUsd: DOLAR_POR_IMAGEM["higgsfield-grok-imagine-2.0"],
    edita: true,
    limiteDoPrompt: 8000,
    proporcoes: ["1:1", "1:2", "2:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
    prazoMs: 180_000,
    corpo: (p) => ({
      prompt: p.prompt,
      resolution: "2k",
      quality: "medium",
      aspect_ratio: p.proporcaoAceita,
      ...(p.imagemUrl ? { image_urls: [p.imagemUrl] } : {}),
    }),
  },
};

/**
 * Os aprovados na prova de 30/09, revistos na prova A/B de 02/10: a colagem
 * da montagem sobe para medium e a arte de campanha vai ao GPT Image 2 da
 * OpenAI em medium (US$ 0,045 medido por arte, contra 0,0096 do low; o juiz
 * deu 23 a 24 de 25 contra 17 a 22). O fundo do corte fica no low: não
 * passou por prova. IMAGEM_ARTE na Vercel precisa acompanhar (ou sair) para
 * o padrão valer lá.
 */
const PADRAO: Record<TipoDeImagem, GeradorDeImagem> = {
  colagem: "higgsfield-gpt-image-2.5-medium",
  arte: "openai-gpt-image-2-medium",
  fundo: "higgsfield-gpt-image-2.5-low",
  elemento: "higgsfield-recraft-v4.1",
  cenario: "higgsfield-grok-imagine-2.0",
};

const VARIAVEL: Record<TipoDeImagem, string> = {
  colagem: "IMAGEM_COLAGEM",
  arte: "IMAGEM_ARTE",
  fundo: "IMAGEM_FUNDO",
  elemento: "IMAGEM_ELEMENTO",
  cenario: "IMAGEM_CENARIO",
};

/** Quem gera este tipo agora: a variável, ou o padrão aprovado. */
export function geradorDoTipo(tipo: TipoDeImagem): GeradorDeImagem {
  const v = process.env[VARIAVEL[tipo]]?.trim();
  if (!v) return PADRAO[tipo];
  if (v === "google" || v in FICHAS || (DA_OPENAI as string[]).includes(v)) return v as GeradorDeImagem;
  console.warn(`[imagem] ${VARIAVEL[tipo]}="${v}" não é um gerador conhecido; sigo com ${PADRAO[tipo]}.`);
  return PADRAO[tipo];
}

/**
 * O tipo pela operação gravada em `ai_usage`, que todo chamador já manda.
 * O que não é montagem nem fundo é arte (peça do dia, campanha, carrossel),
 * e arte é o tipo que a prova aprovou para o GPT Image 2.5.
 */
export function tipoDaOperacao(operation?: string): TipoDeImagem {
  if (operation === "montagem-elemento") return "elemento";
  if (operation === "montagem-colagem" || operation === "montagem-papel") return "colagem";
  if (operation === "montagem-cenario") return "cenario";
  if (operation === "video_fundo_corte" || operation === "video_capa_fundo") return "fundo";
  return "arte";
}

// ─────────────────────────────── vaga, fila e recuo ───────────────────────────────

/** Quanto um pedido espera por vaga no nosso lado antes de ir para o Google. */
const ESPERA_POR_VAGA_MS = 60_000;
/** Quanto um pedido pode ficar "queued" lá (conta cheia) antes de cancelar. */
const FILA_MAX_MS = 45_000;
/** Recuo geral depois de recusa por saldo ou chave. */
const RECUO_POR_SALDO_MS = 15 * 60_000;
/** Recuo curto depois de 429 (limite de taxa): passa sozinho. */
const RECUO_POR_TAXA_MS = 60_000;
const INTERVALO_DA_CONSULTA_MS = 3_000;

function limiteDeVagas(): number {
  const n = Number(process.env.HIGGSFIELD_IMAGENS_SIMULTANEAS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

const vagas = { ocupadas: 0, esperando: [] as Array<() => void> };

/** Pega uma vaga, ou devolve false se não abrir uma em `esperaMs`. */
function pegarVaga(esperaMs: number): Promise<boolean> {
  if (vagas.ocupadas < limiteDeVagas()) {
    vagas.ocupadas++;
    return Promise.resolve(true);
  }
  if (esperaMs <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const entrar = () => {
      clearTimeout(relogio);
      vagas.ocupadas++;
      resolve(true);
    };
    const relogio = setTimeout(() => {
      const i = vagas.esperando.indexOf(entrar);
      if (i >= 0) vagas.esperando.splice(i, 1);
      resolve(false);
    }, esperaMs);
    vagas.esperando.push(entrar);
  });
}

function soltarVaga(): void {
  vagas.ocupadas = Math.max(0, vagas.ocupadas - 1);
  if (vagas.ocupadas < limiteDeVagas()) vagas.esperando.shift()?.();
}

let recuoAte = 0;
let motivoDoRecuo = "";

function abrirRecuo(motivo: string, ms: number): void {
  const novo = Date.now() + ms;
  if (novo <= recuoAte) return;
  recuoAte = novo;
  motivoDoRecuo = motivo;
  // Uma linha por recuo aberto, e não uma por imagem: o log tem de ser lido.
  console.error(`[imagem-higgsfield] RECUO PARA O GOOGLE por ${Math.round(ms / 60_000) || 1} min: ${motivo}`);
}

/** O motivo do recuo geral em vigor, ou null. */
export function higgsfieldEmRecuo(): string | null {
  return Date.now() < recuoAte ? motivoDoRecuo : null;
}

/** Erro que manda a imagem para o Google. Nunca chega ao cliente. */
export class RecuoParaOGoogle extends Error {}

// ─────────────────────────────── checkpoint no Blob ───────────────────────────────

type PedidoGuardado = {
  requestId: string;
  gerador: IdDaHiggsfield;
  precoUsd: number;
  pedidoEm: string;
  status?: string;
  custoGravado?: boolean;
  /** Já devolvida a quem pediu: não serve mais de recuperação. */
  entregue?: boolean;
};

const caminhoDoPonto = (chave: string) => `higgsfield-imagem/${chave}.json`;

async function lerPonto(chave: string): Promise<PedidoGuardado | null> {
  try {
    const { token } = midiaProduzida();
    const meta = await head(caminhoDoPonto(chave), { token });
    const r = await fetch(meta.url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return r.ok ? ((await r.json()) as PedidoGuardado) : null;
  } catch {
    // `head` estoura quando não existe, que é o normal.
    return null;
  }
}

async function gravarPonto(chave: string, dados: PedidoGuardado): Promise<void> {
  try {
    await put(caminhoDoPonto(chave), JSON.stringify(dados), {
      ...midiaProduzida(),
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch (e) {
    // Sem checkpoint a imagem ainda sai; só perde a recuperação.
    console.warn(`[imagem-higgsfield] não gravei o checkpoint ${chave}: ${e instanceof Error ? e.message : e}`);
  }
}

/** Custos já gravados neste processo: duas esperas no mesmo pedido gravam uma vez. */
const custosGravados = new Set<string>();

function gravarCustoUmaVez(p: PedidoGuardado, ctx: ContextoMidia): void {
  if (p.custoGravado || custosGravados.has(p.requestId)) return;
  custosGravados.add(p.requestId);
  gravarCustoDeImagem(p.gerador, p.precoUsd, ctx);
}

// ─────────────────────────────── a geração ───────────────────────────────

const PROPORCAO_INTERNA: Record<string, string> = {
  "linkedin-landscape": "16:9",
  "twitter-landscape": "16:9",
};
/** Quando o modelo não tem a proporção: a mais próxima, sempre mais alta (o corte final é "cover"). */
const PROPORCAO_VIZINHA: Record<string, string> = { "4:5": "3:4", "5:4": "4:3" };

function proporcaoAceita(ficha: FichaDaImagem, proporcao: string): string {
  const base = PROPORCAO_INTERNA[proporcao] ?? proporcao;
  if (ficha.proporcoes.includes(base)) return base;
  const vizinha = PROPORCAO_VIZINHA[base];
  return vizinha && ficha.proporcoes.includes(vizinha) ? vizinha : "1:1";
}

export type ImagemGerada = { dataUrl: string; modelo: string; custoUsd: number };

const FINAIS_SEM_IMAGEM = ["failed", "nsfw", "canceled", "cancelled"];
/** Terminou sem imagem, ou a consulta respondeu 4xx (pedido que não existe mais). */
const encerradoSemImagem = (status?: string) => FINAIS_SEM_IMAGEM.includes(status ?? "") || (status ?? "").startsWith("http-");

type Status = { status: string; url?: string };

async function consultar(requestId: string): Promise<Status | null> {
  try {
    const r = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/status`, {
      headers: cabecalho(),
      signal: AbortSignal.timeout(20_000),
    });
    // 5xx e rede são instabilidade deles; o pedido segue lá.
    if (!r.ok) return r.status >= 500 ? null : { status: `http-${r.status}` };
    const c = (await r.json()) as Record<string, unknown>;
    const lista = (c.images ?? c.outputs) as Array<{ url?: string }> | undefined;
    const uma = c.image as { url?: string } | string | undefined;
    const url = (Array.isArray(lista) ? lista[0]?.url : undefined) ?? (typeof uma === "string" ? uma : uma?.url);
    return { status: String(c.status ?? "desconhecido"), url };
  } catch {
    return null;
  }
}

/** POST /requests/{id}/cancel: 202 cancelou (não cobra), 400 já começou (vai cobrar). */
async function cancelar(requestId: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/requests/${encodeURIComponent(requestId)}/cancel`, {
      method: "POST",
      headers: cabecalho(),
      signal: AbortSignal.timeout(15_000),
    });
    return r.status === 202 || r.ok;
  } catch {
    return false;
  }
}

/**
 * Baixa o resultado (a URL deles é temporária). PNG vira JPEG 92 quando não
 * há recorte depois (01/10): na prova o GPT Image 2.5 devolveu 9 MB em
 * 2048x2048 e o Grok 6,5 MB, contra ~1 MB em JPEG sem diferença visível, e a
 * imagem anda como data URL pela memória de quem chamou. O elemento fica PNG:
 * o recorte do verde quer o pixel sem perda.
 */
async function baixar(url: string, manterPng: boolean): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`download da imagem respondeu HTTP ${r.status}`);
  const tipo = (r.headers.get("content-type") ?? "").split(";")[0];
  const mime = tipo.startsWith("image/") ? tipo : /\.jpe?g(\?|$)/i.test(url) ? "image/jpeg" : /\.webp(\?|$)/i.test(url) ? "image/webp" : "image/png";
  const bruto = Buffer.from(await r.arrayBuffer());
  if (mime === "image/png" && !manterPng) {
    const jpeg = await sharp(bruto).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer().catch(() => null);
    if (jpeg) return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }
  return `data:${mime};base64,${bruto.toString("base64")}`;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uma imagem pela Higgsfield, esperando o resultado. Lança `RecuoParaOGoogle`
 * em qualquer caso em que a imagem não saiu daqui (sem vaga, fila, prazo,
 * saldo, recusa, falha); quem chama cai no Google.
 */
export async function gerarNaHiggsfield(p: {
  gerador: IdDaHiggsfield;
  prompt: string;
  /** A proporção interna (AspectRatio de nano-banana.ts). */
  proporcao: string;
  /** Quadro de entrada, URL pública: só para modelo que edita. */
  imagemUrl?: string;
  /** Elemento para recorte: pede o verde chapado como parâmetro, quando o modelo aceita. */
  fundoVerde?: boolean;
  ctx: ContextoMidia;
  /** Epoch em ms: depois disto, nem pede nem espera (o prazo de quem chama). */
  ate?: number;
}): Promise<ImagemGerada> {
  if (!process.env.HF_CREDENTIALS) throw new RecuoParaOGoogle("HF_CREDENTIALS ausente");
  const emRecuo = higgsfieldEmRecuo();
  if (emRecuo) throw new RecuoParaOGoogle(`recuo geral em vigor (${emRecuo})`);
  const ficha = FICHAS[p.gerador];
  if (p.imagemUrl && !ficha.edita) throw new RecuoParaOGoogle(`${p.gerador} não edita imagem`);
  if (p.prompt.length > ficha.limiteDoPrompt) throw new RecuoParaOGoogle(`prompt de ${p.prompt.length} caracteres passa do limite de ${ficha.limiteDoPrompt}`);

  const inicio = Date.now();
  const prazo = Math.min(inicio + ficha.prazoMs, p.ate ?? Infinity);
  // Menos de 20 s não dá para uma imagem; melhor ir direto ao Google.
  if (prazo - inicio < 20_000) throw new RecuoParaOGoogle("sem tempo no prazo de quem chamou");

  const corpo = ficha.corpo({ ...p, proporcaoAceita: proporcaoAceita(ficha, p.proporcao) });
  const chave = createHash("sha256").update(ficha.endpoint + JSON.stringify(corpo)).digest("hex").slice(0, 24);

  const temVaga = await pegarVaga(Math.min(ESPERA_POR_VAGA_MS, prazo - Date.now() - 20_000));
  if (!temVaga) throw new RecuoParaOGoogle(`sem vaga em ${Math.round((Date.now() - inicio) / 1000)} s (${limiteDeVagas()} simultâneas)`);

  try {
    // Pedido pago e nunca entregue (função morta, prazo estourado depois de
    // começar): recupera em vez de pagar outro.
    const anterior = await lerPonto(chave);
    let pedido: PedidoGuardado;
    if (anterior?.requestId && !anterior.entregue && !encerradoSemImagem(anterior.status)) {
      pedido = anterior;
      console.log(`[imagem-higgsfield] recupero o pedido ${pedido.requestId} (${p.gerador}) em vez de pedir outro`);
    } else {
      let r: Response;
      try {
        r = await fetch(`${BASE}/${ficha.endpoint}`, {
          method: "POST",
          headers: cabecalho(),
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e) {
        // Sem resposta não há request_id; se o pedido chegou lá, a cobrança
        // só acontece se ele completar, e não há como recuperar. Raro, e não
        // compensa repetir o POST (seria pagar em dobro no caso comum).
        throw new RecuoParaOGoogle(`POST sem resposta: ${e instanceof Error ? e.message : e}`);
      }
      const resposta = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok || !resposta.request_id) {
        const detalhe = String(resposta.detail ?? resposta.message ?? JSON.stringify(resposta)).slice(0, 200);
        // Saldo zerado vira incidente e aviso ao admin (06/10); chave recusada
        // (401/403 sem texto de saldo) só abre o recuo, como antes.
        const semSaldo = await conferirResposta("higgsfield", { status: r.status, corpo: resposta }, `imagem da Higgsfield (${p.gerador})`);
        if (semSaldo || [401, 402, 403].includes(r.status) || /credit|balance|insufficient|saldo/i.test(detalhe)) {
          abrirRecuo(`HTTP ${r.status}: ${detalhe}`, RECUO_POR_SALDO_MS);
        } else if (r.status === 429) {
          abrirRecuo(`HTTP 429: ${detalhe}`, RECUO_POR_TAXA_MS);
        }
        throw new RecuoParaOGoogle(`Higgsfield recusou (HTTP ${r.status}): ${detalhe}`);
      }
      pedido = {
        requestId: String(resposta.request_id),
        gerador: p.gerador,
        precoUsd: ficha.precoUsd,
        pedidoEm: new Date().toISOString(),
        status: String(resposta.status ?? "queued"),
      };
      // ANTES da espera: daqui em diante o id pago é recuperável.
      await gravarPonto(chave, pedido);
    }

    const pedidoEm = Date.parse(pedido.pedidoEm) || Date.now();
    let comecou = false;
    for (;;) {
      await dormir(INTERVALO_DA_CONSULTA_MS);
      const s = await consultar(pedido.requestId);
      if (s) {
        if (s.status !== "queued") comecou = true;
        if (s.status === "completed" && s.url) {
          const dataUrl = await baixar(s.url, !!p.fundoVerde);
          gravarCustoUmaVez(pedido, p.ctx);
          await gravarPonto(chave, { ...pedido, status: "completed", custoGravado: true, entregue: true });
          return { dataUrl, modelo: p.gerador, custoUsd: pedido.custoGravado ? 0 : pedido.precoUsd };
        }
        if (encerradoSemImagem(s.status)) {
          await gravarPonto(chave, { ...pedido, status: s.status });
          throw new RecuoParaOGoogle(`pedido ${pedido.requestId} terminou como ${s.status}`);
        }
        // A conta está cheia (outras funções usando as vagas): cancelar na
        // fila é de graça, e o Google entrega agora.
        if (s.status === "queued" && Date.now() - pedidoEm > FILA_MAX_MS) {
          if (await cancelar(pedido.requestId)) {
            await gravarPonto(chave, { ...pedido, status: "canceled" });
            throw new RecuoParaOGoogle(`${Math.round((Date.now() - pedidoEm) / 1000)} s na fila da Higgsfield; cancelado sem custo`);
          }
          comecou = true; // o cancelamento perdeu a corrida: já começou
        }
      }
      if (Date.now() >= prazo) {
        if (!comecou && (await cancelar(pedido.requestId))) {
          await gravarPonto(chave, { ...pedido, status: "canceled" });
          throw new RecuoParaOGoogle("prazo estourado na fila; cancelado sem custo");
        }
        // Já começou: vai ser cobrado, e o custo é real mesmo sem uso. Grava
        // agora (é o dinheiro que sai) e deixa o checkpoint para a próxima
        // chamada igual recuperar a imagem sem pagar de novo.
        gravarCustoUmaVez(pedido, p.ctx);
        await gravarPonto(chave, { ...pedido, status: s?.status ?? pedido.status, custoGravado: true });
        throw new RecuoParaOGoogle(`prazo de ${Math.round((prazo - inicio) / 1000)} s estourado com o pedido ${pedido.requestId} em andamento (custo gravado)`);
      }
    }
  } finally {
    soltarVaga();
  }
}
