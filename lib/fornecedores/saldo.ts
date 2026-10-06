/**
 * O DETECTOR ÚNICO DE "SEM SALDO" (06/10/2026).
 *
 * Pedido do Bruno em 06/10: "estava sem crédito na API da OpenAI. Quando for
 * assim, me avise." Ele só descobriu porque a arte saiu ruim: a falta de saldo
 * da OpenAI caía no Google em silêncio, e o único rastro era uma linha de log.
 *
 * Cada fornecedor avisa que a conta zerou de um jeito, e vários usam o MESMO
 * código HTTP do limite de taxa (429), que é passageiro e não pede recarga.
 * Por isso a regra aqui é pelo TEXTO da resposta, com o código só como apoio:
 *
 *  - Anthropic: HTTP 400, "Your credit balance is too low to access the
 *    Anthropic API. Please go to Plans & Billing...". O 429 é limite de taxa.
 *  - OpenAI: HTTP 429 com `code: "insufficient_quota"` ("You exceeded your
 *    current quota, please check your plan and billing details") ou 400 com
 *    `billing_hard_limit_reached`. O 429 com `rate_limit_exceeded` é taxa.
 *  - Google (Gemini, Imagen, Veo): HTTP 429 RESOURCE_EXHAUSTED com "Your
 *    prepayment credits are depleted" (conta pré-paga do AI Studio) ou 403
 *    com "billing" desligado (BILLING_DISABLED, "requires billing to be
 *    enabled"). O 429 "Quota exceeded for metric ... per minute" é taxa.
 *  - Higgsfield: HTTP 402 ou 403 (o 403 é o saldo da conta da API, visto na
 *    edição: lib/media/higgsfield.ts), ou "Not enough credits". O 401 é
 *    chave recusada, não saldo.
 *  - ElevenLabs: HTTP 401 com `status: "quota_exceeded"` ("This request
 *    exceeds your quota...") ou 402. "voice_limit_reached" é vaga de voz, e
 *    "too_many_concurrent_requests" é taxa: nenhum dos dois é saldo.
 *  - HeyGen: HTTP 402, ou `MOVIO_PAYMENT_INSUFFICIENT_CREDIT` / "insufficient
 *    credit". "resource_limit_reached" é vaga de gêmeo, não saldo.
 *  - fal.ai: HTTP 403 com "User is locked. Reason: Exhausted balance. Top up
 *    your balance at fal.ai/dashboard/billing" (visto em 30/09 e 01/10).
 *  - TypeSafe (o JEV): HTTP 402, ou texto de crédito insuficiente. Formato
 *    real ainda não visto em produção: a regra é a genérica de cobrança.
 *  - Deepgram: HTTP 402 com `err_code: "ASR_PAYMENT_REQUIRED"` ("Project does
 *    not have enough credits...").
 *  - Apify: HTTP 402 / 403 com `not-enough-usage-to-run-paid-actor` ou o
 *    limite mensal de uso estourado.
 *  - Blotato: HTTP 402, ou assinatura vencida ou inativa no texto. O 403 de
 *    conta de rede não vinculada NÃO é cobrança.
 *  - Resend: HTTP 429 com `daily_quota_exceeded` ou `monthly_quota_exceeded`.
 *    O 429 `rate_limit_exceeded` é taxa.
 *  - xAI (Grok): "You have run out of credits", "doesn't have any credits",
 *    ou o limite de gasto atingido.
 *
 * Módulo PURO: não toca banco nem rede. Quem grava e avisa é
 * lib/fornecedores/aviso-de-saldo.ts.
 */

export const IDS_DE_FORNECEDOR = [
  "anthropic",
  "openai",
  "google",
  "higgsfield",
  "elevenlabs",
  "heygen",
  "fal",
  "typesafe",
  "deepgram",
  "apify",
  "blotato",
  "resend",
  "xai",
] as const;

export type Fornecedor = (typeof IDS_DE_FORNECEDOR)[number];

export type FichaDoFornecedor = {
  /** O nome no aviso ao admin. Nunca aparece para o cliente. */
  nome: string;
  /** Onde recarregar: o painel de cobrança do fornecedor. */
  recarga: string;
  /** O que para (ou piora) enquanto a conta está zerada. */
  oQuePara: string;
};

export const FORNECEDORES: Record<Fornecedor, FichaDoFornecedor> = {
  anthropic: {
    nome: "Anthropic (Claude)",
    recarga: "https://console.anthropic.com/settings/billing",
    oQuePara: "todo texto: campanhas, roteiros, posts, chat do escritório e demonstração. A fila de trabalhos fica pausada até a recarga.",
  },
  openai: {
    nome: "OpenAI (GPT Image)",
    recarga: "https://platform.openai.com/settings/organization/billing/overview",
    oQuePara: "as artes pelo GPT Image. Enquanto isso elas saem por outro gerador, com qualidade menor.",
  },
  google: {
    nome: "Google (Gemini, Imagen e Veo)",
    recarga: "https://console.cloud.google.com/billing",
    oQuePara: "imagens do Google, vídeo por IA (Veo), leitura do vídeo e pesquisa da semana.",
  },
  higgsfield: {
    nome: "Higgsfield",
    recarga: "https://cloud.higgsfield.ai",
    oQuePara: "imagens e vídeos da Higgsfield na montagem. As imagens caem no Google enquanto isso.",
  },
  elevenlabs: {
    nome: "ElevenLabs",
    recarga: "https://elevenlabs.io/app/subscription",
    oQuePara: "a voz do gêmeo digital: os vídeos do gêmeo ficam esperando.",
  },
  heygen: {
    nome: "HeyGen",
    recarga: "https://app.heygen.com/settings?nav=API",
    oQuePara: "o treino e os vídeos do gêmeo digital.",
  },
  fal: {
    nome: "fal.ai",
    recarga: "https://fal.ai/dashboard/billing",
    oQuePara: "o gerador do gêmeo digital, os recortes e o b-roll do editor sob medida.",
  },
  typesafe: {
    nome: "TypeSafe (JEV)",
    recarga: "https://typesafe.ai",
    oQuePara: "as decisões do JEV: diretor, conferência, seleção e classificação na edição.",
  },
  deepgram: {
    nome: "Deepgram",
    recarga: "https://console.deepgram.com",
    oQuePara: "a transcrição dos vídeos: nenhum vídeo novo passa da primeira etapa.",
  },
  apify: {
    nome: "Apify",
    recarga: "https://console.apify.com/billing",
    oQuePara: "a leitura das métricas públicas das redes e a coleta de referências.",
  },
  blotato: {
    nome: "Blotato",
    recarga: "https://my.blotato.com/settings/billing",
    oQuePara: "a publicação automática nas redes.",
  },
  resend: {
    nome: "Resend (e-mail)",
    recarga: "https://resend.com/settings/billing",
    oQuePara: "todos os e-mails da plataforma, inclusive este aviso: por isso ele só aparece no sino e no painel.",
  },
  xai: {
    nome: "xAI (Grok)",
    recarga: "https://console.x.ai",
    oQuePara: "a busca de tendências pelo Grok na pesquisa.",
  },
};

export type RespostaDoFornecedor = {
  /** O código HTTP, quando houve resposta. */
  status?: number | null;
  /** O corpo da resposta (texto ou JSON já lido), ou a mensagem do erro. */
  corpo?: unknown;
};

function comoTexto(corpo: unknown): string {
  if (corpo === undefined || corpo === null) return "";
  if (typeof corpo === "string") return corpo;
  if (corpo instanceof Error) return `${corpo.name} ${corpo.message}`;
  try {
    return JSON.stringify(corpo);
  } catch {
    return String(corpo);
  }
}

/**
 * As frases de cada fornecedor que querem dizer "a conta zerou". Cada uma foi
 * escrita para NÃO casar com a resposta de limite de taxa do mesmo fornecedor
 * (o teste em scripts/testes/aviso-de-saldo-0610.test.mts confere os dois).
 */
const FRASES: Record<Fornecedor, RegExp> = {
  anthropic: /credit balance is too low|purchase credits/i,
  openai: /insufficient_quota|billing_hard_limit_reached|no credits remaining|exceeded your current quota/i,
  google: /prepayment credits? (are|is) depleted|credits are depleted|billing_disabled|billing (is )?(not )?(enabled|disabled|account)|requires billing|billing to be enabled|has been suspended for billing/i,
  higgsfield: /not enough credits|insufficient (credits|balance|funds)|no credits|balance is too low|top up/i,
  elevenlabs: /quota_exceeded|exceeds your quota|insufficient[ _](credits|balance)|payment_required/i,
  heygen: /insufficient[ _]credit|movio_payment_insufficient_credit|not enough credits|insufficient balance|out of credits/i,
  fal: /exhausted balance|insufficient balance|top up your balance|locked.*balance/i,
  typesafe: /insufficient[ _](credit|credits|balance|funds)|credit balance|out of credits|no credits|payment required|billing/i,
  deepgram: /asr_payment_required|payment_required|not have enough credits|insufficient credits|insufficient[ _]funds/i,
  apify: /not-enough-usage|usage-hard-limit|monthly usage (hard )?limit|usage limit exceeded|insufficient (credit|credits|balance)/i,
  blotato: /payment required|subscription (has )?(expired|inactive|canceled|cancelled|ended)|no active subscription|upgrade your (plan|subscription)|trial (has )?(expired|ended)/i,
  resend: /daily_quota_exceeded|monthly_quota_exceeded/i,
  xai: /run out of credits|doesn'?t have any credits|no credits|spending limit|insufficient credits|purchase credits/i,
};

/** As frases que só um fornecedor usa, para classificar um erro sem saber de quem é. */
const EXCLUSIVAS: Array<[Fornecedor, RegExp]> = [
  ["anthropic", /credit balance is too low/i],
  // "exceeded your current quota" fica de fora: o Google usa a MESMA frase no limite de taxa do Gemini.
  ["openai", /insufficient_quota|billing_hard_limit_reached/i],
  ["google", /prepayment credits? (are|is) depleted|billing_disabled|requires billing|billing to be enabled/i],
  ["fal", /exhausted balance|top up your balance at fal/i],
  ["heygen", /movio_payment_insufficient_credit/i],
  ["resend", /daily_quota_exceeded|monthly_quota_exceeded/i],
  ["elevenlabs", /quota_exceeded|exceeds your quota/i],
  ["deepgram", /asr_payment_required/i],
  ["apify", /not-enough-usage|usage-hard-limit/i],
];

/** Como cada fornecedor aparece no texto de um erro. */
const NOMES: Record<Fornecedor, RegExp> = {
  anthropic: /anthropic|claude/i,
  openai: /openai|gpt/i,
  google: /google|gemini|imagen|veo/i,
  higgsfield: /higgsfield/i,
  elevenlabs: /elevenlabs|eleven labs/i,
  heygen: /heygen/i,
  fal: /fal\.ai|\bfal\b/i,
  typesafe: /\bjev\b|typesafe/i,
  deepgram: /deepgram/i,
  apify: /apify/i,
  blotato: /blotato/i,
  resend: /resend/i,
  xai: /grok|x\.ai|\bxai\b/i,
};

/** Fornecedores para os quais o 402 (Payment Required) basta, sem texto. */
const PAGAMENTO_BASTA: ReadonlySet<Fornecedor> = new Set<Fornecedor>([
  "higgsfield",
  "elevenlabs",
  "heygen",
  "fal",
  "typesafe",
  "deepgram",
  "apify",
  "blotato",
  "xai",
]);

/**
 * A resposta diz que a conta deste fornecedor está sem saldo?
 *
 * Limite de taxa (429 passageiro) devolve FALSO: ele se resolve sozinho em
 * segundos, e quem trata é a retentativa de quem chamou, não o Bruno.
 */
export function respostaSemSaldo(fornecedor: Fornecedor, resposta: RespostaDoFornecedor): boolean {
  const status = resposta.status ?? null;
  const texto = comoTexto(resposta.corpo);
  if (status !== null && status >= 200 && status < 300) return false;
  if (FRASES[fornecedor].test(texto)) return true;
  if (status === 402 && PAGAMENTO_BASTA.has(fornecedor)) return true;
  if (status === 403 && fornecedor === "higgsfield") return true;
  return false;
}

/** A marca que os erros de saldo dos clientes carregam (sem `instanceof`, ver lib/media/gpt-image.ts). */
export type ErroComFornecedor = { semSaldo?: boolean; fornecedor?: string; tipo?: string };

function ehFornecedor(x: unknown): x is Fornecedor {
  return typeof x === "string" && (IDS_DE_FORNECEDOR as readonly string[]).includes(x);
}

/**
 * De qual fornecedor é a falta de saldo deste erro, ou null se não é falta de
 * saldo. Serve a quem só tem o erro na mão (a fila, uma rota, um cron).
 *
 * Ordem: a marca explícita (`semSaldo` + `fornecedor`, ou `tipo: "sem-saldo"`
 * do gêmeo), depois o texto da mensagem contra as frases de cada fornecedor.
 */
export function fornecedorSemSaldoDoErro(e: unknown): Fornecedor | null {
  if (e && typeof e === "object") {
    const m = e as ErroComFornecedor;
    if ((m.semSaldo || m.tipo === "sem-saldo") && ehFornecedor(m.fornecedor)) return m.fornecedor;
  }
  const texto = comoTexto(e);
  if (!texto) return null;
  // Primeiro as frases que SÓ um fornecedor usa (a ordem importa: a cota
  // diária do Resend contém "quota_exceeded", que é a frase da ElevenLabs).
  for (const [f, frase] of EXCLUSIVAS) if (frase.test(texto)) return f;
  // Depois as frases genéricas ("not enough credits", "payment required"),
  // que só valem com o nome do fornecedor no texto, para um não roubar o
  // erro do outro.
  for (const f of IDS_DE_FORNECEDOR) if (NOMES[f].test(texto) && FRASES[f].test(texto)) return f;
  // A marca sem fornecedor é das duas classes antigas (Anthropic e OpenAI).
  if (e && typeof e === "object" && (e as ErroComFornecedor).semSaldo) {
    return /openai|gpt/i.test(texto) ? "openai" : "anthropic";
  }
  return null;
}

/**
 * O fornecedor de um modelo gravado em `ai_usage` (a chamada que passou). Usado
 * para fechar o incidente quando a primeira chamada volta a passar.
 */
export function fornecedorDoModeloGravado(model: string): Fornecedor | null {
  const m = model.toLowerCase();
  if (m.startsWith("duble")) return null;
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("higgsfield")) return "higgsfield";
  if (m.startsWith("gpt-") || m.startsWith("openai")) return "openai";
  if (m.startsWith("gemini") || m.startsWith("imagen") || m.startsWith("veo")) return "google";
  if (m.startsWith("fal-ai/") || m.startsWith("kling-video/") || m.includes("omnihuman") || m.includes("birefnet")) return "fal";
  if (m.startsWith("heygen")) return "heygen";
  if (m.startsWith("elevenlabs")) return "elevenlabs";
  if (m.startsWith("nova-")) return "deepgram";
  if (m.startsWith("jev") || m.includes("systemone")) return "typesafe";
  return null;
}

/**
 * O que o CLIENTE lê quando a falta de saldo atrapalha o trabalho dele: nunca
 * o nome do fornecedor, nunca "saldo de API" (regra de 21/09: cliente recebe
 * aviso neutro; saldo é assunto do Bruno).
 */
export const AVISO_NEUTRO_AO_CLIENTE =
  "A geração está temporariamente indisponível. Nada do que você já fez se perdeu, e a equipe já foi avisada.";
