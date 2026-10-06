// Testes do detector único de "sem saldo" e do aviso central (06/10/2026).
// Pedido do Bruno: "estava sem crédito na API da OpenAI. Quando for assim, me avise."
//
// Nada aqui chama fornecedor pago nem banco real: as respostas de saldo zerado
// de cada fornecedor são simuladas (o corpo que cada um devolve de verdade), o
// depósito do aviso é em memória e o `fetch` dos clientes HTTP é trocado.
// Rodar: npx tsx --test scripts/testes/aviso-de-saldo-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

const { respostaSemSaldo, fornecedorSemSaldoDoErro, fornecedorDoModeloGravado, FORNECEDORES, IDS_DE_FORNECEDOR, AVISO_NEUTRO_AO_CLIENTE } = await import("@/lib/fornecedores/saldo");
const aviso = await import("@/lib/fornecedores/aviso-de-saldo");
type Deposito = import("@/lib/fornecedores/aviso-de-saldo").Deposito;
type Email = import("@/lib/email").Email;
type Fornecedor = import("@/lib/fornecedores/saldo").Fornecedor;

const HORA = 60 * 60 * 1000;
/** O travessão, montado pelo código do caractere para o arquivo não conter nenhum. */
const TRAVESSAO = new RegExp(String.fromCharCode(0x2014));

// ─── as respostas reais de cada fornecedor ───

type Caso = { status: number; corpo: unknown };
const SEM_SALDO: Record<Fornecedor, Caso[]> = {
  anthropic: [
    { status: 400, corpo: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } } },
  ],
  openai: [
    { status: 429, corpo: { error: { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota" } } },
    { status: 400, corpo: { error: { message: "Billing hard limit has been reached", type: "invalid_request_error", code: "billing_hard_limit_reached" } } },
  ],
  google: [
    { status: 429, corpo: { error: { code: 429, message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.", status: "RESOURCE_EXHAUSTED" } } },
    { status: 403, corpo: { error: { code: 403, message: "This API method requires billing to be enabled. Please enable billing on project #123 then retry.", status: "PERMISSION_DENIED", details: [{ reason: "BILLING_DISABLED" }] } } },
  ],
  higgsfield: [
    { status: 402, corpo: { detail: "Not enough credits" } },
    { status: 403, corpo: { detail: "Forbidden" } },
  ],
  elevenlabs: [
    { status: 401, corpo: { detail: { status: "quota_exceeded", message: "This request exceeds your quota of 10000. You have 12 credits remaining, while 120 credits are required for this request." } } },
    { status: 402, corpo: { detail: { status: "payment_required", message: "Payment required" } } },
  ],
  heygen: [
    { status: 400, corpo: { error: { code: "MOVIO_PAYMENT_INSUFFICIENT_CREDIT", message: "Insufficient credit." } } },
    { status: 402, corpo: { error: { code: "payment_required", message: "" } } },
  ],
  fal: [{ status: 403, corpo: { detail: "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing." } }],
  typesafe: [
    { status: 402, corpo: { error: "payment required" } },
    { status: 400, corpo: { error: { message: "Insufficient credits on this account" } } },
  ],
  deepgram: [{ status: 402, corpo: { err_code: "ASR_PAYMENT_REQUIRED", err_msg: "Project does not have enough credits for an ASR request and does not have an overage agreement.", request_id: "x" } }],
  apify: [{ status: 402, corpo: { error: { type: "not-enough-usage-to-run-paid-actor", message: "You have exceeded your monthly usage limit." } } }],
  blotato: [
    { status: 402, corpo: { message: "Payment required" } },
    { status: 403, corpo: { message: "Your subscription has expired. Upgrade your plan to continue." } },
  ],
  resend: [{ status: 429, corpo: { name: "daily_quota_exceeded", message: "You have reached your daily email sending quota." } }],
  xai: [{ status: 403, corpo: { code: "The caller does not have permission to execute the specified operation", error: "Your newly created team doesn't have any credits yet. You can purchase credits on https://console.x.ai/team/abc." } }],
};

/** O limite de taxa (passageiro) e outras recusas que NÃO são saldo. */
const NAO_E_SALDO: Record<Fornecedor, Caso[]> = {
  anthropic: [
    { status: 429, corpo: { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit." } } },
    { status: 529, corpo: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } },
  ],
  openai: [{ status: 429, corpo: { error: { message: "Rate limit reached for gpt-image-2 in organization org-x on requests per min (RPM): Limit 5, Used 5.", type: "requests", code: "rate_limit_exceeded" } } }],
  google: [
    { status: 429, corpo: { error: { code: 429, message: "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_requests per minute.", status: "RESOURCE_EXHAUSTED" } } },
    { status: 404, corpo: { error: { code: 404, message: "models/imagen-x is not found" } } },
  ],
  higgsfield: [
    { status: 429, corpo: { detail: "Too many requests" } },
    { status: 401, corpo: { detail: "Invalid credentials" } },
  ],
  elevenlabs: [
    { status: 429, corpo: { detail: { status: "too_many_concurrent_requests", message: "Too many concurrent requests. Your subscription allows 2 concurrent requests." } } },
    { status: 400, corpo: { detail: { status: "voice_limit_reached", message: "You have reached your maximum amount of custom voices" } } },
  ],
  heygen: [
    { status: 400, corpo: { error: { code: "resource_limit_reached", message: "Resource limit reached" } } },
    { status: 429, corpo: { error: { code: "rate_limit_exceeded", message: "Too many requests" } } },
  ],
  fal: [
    { status: 429, corpo: { detail: "Too many requests" } },
    { status: 401, corpo: { detail: "Invalid key" } },
  ],
  typesafe: [{ status: 429, corpo: { error: "rate limited" } }],
  deepgram: [{ status: 429, corpo: { err_code: "TOO_MANY_REQUESTS", err_msg: "Too many requests. Please try again later" } }],
  apify: [{ status: 429, corpo: { error: { type: "rate-limit-exceeded", message: "You have exceeded the rate limit of 30 requests per second" } } }],
  blotato: [
    { status: 403, corpo: { message: "Account does not belong to this user" } },
    { status: 429, corpo: { message: "Too many requests" } },
  ],
  resend: [{ status: 429, corpo: { name: "rate_limit_exceeded", message: "Too many requests. You can only make 2 requests per second." } }],
  xai: [{ status: 429, corpo: { error: "Rate limit exceeded, please slow down" } }],
};

test("cada fornecedor tem ficha com link de recarga e casos de teste", () => {
  for (const f of IDS_DE_FORNECEDOR) {
    assert.match(FORNECEDORES[f].recarga, /^https:\/\//, f);
    assert.ok(FORNECEDORES[f].oQuePara.length > 10, f);
    assert.ok(SEM_SALDO[f].length && NAO_E_SALDO[f].length, `faltam casos de ${f}`);
  }
});

test("a resposta de saldo zerado de cada fornecedor é reconhecida", () => {
  for (const f of IDS_DE_FORNECEDOR) {
    for (const c of SEM_SALDO[f]) assert.equal(respostaSemSaldo(f, c), true, `${f} ${c.status} ${JSON.stringify(c.corpo)}`);
    // O mesmo corpo em texto cru (como os clientes leem com res.text()).
    for (const c of SEM_SALDO[f]) assert.equal(respostaSemSaldo(f, { status: c.status, corpo: JSON.stringify(c.corpo) }), true, `${f} texto`);
  }
});

test("limite de taxa (429 passageiro) e outras recusas NÃO são saldo", () => {
  for (const f of IDS_DE_FORNECEDOR) {
    for (const c of NAO_E_SALDO[f]) assert.equal(respostaSemSaldo(f, c), false, `${f} ${c.status} ${JSON.stringify(c.corpo)}`);
  }
  // Sucesso nunca é saldo, diga o corpo o que disser.
  assert.equal(respostaSemSaldo("openai", { status: 200, corpo: "insufficient_quota" }), false);
});

test("o erro solto é atribuído ao fornecedor certo, e o limite do Google não vira OpenAI", () => {
  assert.equal(fornecedorSemSaldoDoErro(new Error("400 Your credit balance is too low to access the Anthropic API.")), "anthropic");
  assert.equal(fornecedorSemSaldoDoErro(new Error('GPT Image 2 recusou (HTTP 429): {"error":{"code":"insufficient_quota"}}')), "openai");
  assert.equal(fornecedorSemSaldoDoErro(new Error("Deepgram respondeu 402: ASR_PAYMENT_REQUIRED")), "deepgram");
  assert.equal(fornecedorSemSaldoDoErro(new Error("Higgsfield recusou (HTTP 402): Not enough credits")), "higgsfield");
  assert.equal(fornecedorSemSaldoDoErro(new Error("JEV respondeu 402: payment required")), "typesafe");
  assert.equal(fornecedorSemSaldoDoErro({ semSaldo: true, fornecedor: "heygen" }), "heygen");
  assert.equal(fornecedorSemSaldoDoErro({ tipo: "sem-saldo", fornecedor: "elevenlabs", message: "x" }), "elevenlabs");
  // Genérico sem nome de fornecedor: não chuta.
  assert.equal(fornecedorSemSaldoDoErro(new Error("Not enough credits")), null);
  // A frase do limite de taxa do Gemini é igual à do saldo da OpenAI: não pode virar saldo de ninguém.
  assert.equal(fornecedorSemSaldoDoErro(new Error("Gemini respondeu 429: You exceeded your current quota, please check your plan and billing details.")), null);
  assert.equal(fornecedorSemSaldoDoErro(new Error("Request timed out.")), null);
});

test("o modelo gravado em ai_usage aponta o fornecedor que voltou", () => {
  assert.equal(fornecedorDoModeloGravado("claude-opus-5"), "anthropic");
  assert.equal(fornecedorDoModeloGravado("gpt-image-2-low"), "openai");
  assert.equal(fornecedorDoModeloGravado("higgsfield-gpt-image-2.5-low"), "higgsfield");
  assert.equal(fornecedorDoModeloGravado("imagen-4.0-generate-001"), "google");
  assert.equal(fornecedorDoModeloGravado("nova-3-multi"), "deepgram");
  assert.equal(fornecedorDoModeloGravado("elevenlabs/eleven_multilingual_v2"), "elevenlabs");
  assert.equal(fornecedorDoModeloGravado("duble/qualquer"), null);
});

test("o aviso neutro ao cliente não cita fornecedor nem saldo de API", () => {
  assert.doesNotMatch(AVISO_NEUTRO_AO_CLIENTE, /saldo|api|anthropic|openai|google|claude|gpt|cr[eé]dito/i);
  assert.doesNotMatch(AVISO_NEUTRO_AO_CLIENTE, TRAVESSAO);
});

// ─── o aviso central, com depósito em memória ───

type Linha = { id: string; acao: string; alvoEmail: string; createdAt: Date; detalhe: Record<string, unknown> };

function depositoEmMemoria(admins = [{ id: "adm1", email: "bruno@demandou.com" }, { id: "adm2", email: "time@demandou.com" }]) {
  const linhas: Linha[] = [];
  const sino = new Map<string, { tipo: string; titulo: string; texto: string }>();
  let seq = 0;
  let relogio = 0;
  const pausa = () => new Promise((r) => setTimeout(r, 1));
  const dep: Deposito = {
    async incidenteAberto(f) {
      await pausa();
      return aviso.incidentesDasLinhas(linhas.filter((l) => l.alvoEmail === f))[0] ?? null;
    },
    async incidentesAbertos() {
      await pausa();
      return aviso.incidentesDasLinhas(linhas);
    },
    async abrirIncidente(f, o) {
      await pausa();
      const minha: Linha = { id: `inc${++seq}`, acao: "saldo_zerado", alvoEmail: f, createdAt: new Date(o.em.getTime() + relogio++), detalhe: { fornecedor: f, ultimoEm: o.em.toISOString(), ocorrencias: 1, onde: [o.onde], detalhe: o.detalhe ?? null } };
      linhas.push(minha);
      const canonico = (await dep.incidenteAberto(f))!;
      if (canonico.id !== minha.id) {
        linhas.splice(linhas.indexOf(minha), 1);
        await dep.anotarOcorrencia(canonico, o);
      }
      return canonico;
    },
    async anotarOcorrencia(inc, o) {
      const l = linhas.find((x) => x.id === inc.id)!;
      l.detalhe = { ...l.detalhe, ultimoEm: o.em.toISOString(), ocorrencias: inc.ocorrencias + 1, onde: [...new Set([...inc.onde, o.onde])] };
    },
    async fecharIncidente(inc, em) {
      linhas.push({ id: `v${++seq}`, acao: "saldo_voltou", alvoEmail: inc.fornecedor, createdAt: new Date(em.getTime() + relogio++), detalhe: { incidenteId: inc.id } });
    },
    async admins() {
      return admins;
    },
    async avisarNoSino(a) {
      await pausa();
      const k = `${a.userId}|${a.chave}`;
      if (sino.has(k)) return false; // a chave única da notificação
      sino.set(k, { tipo: a.tipo, titulo: a.titulo, texto: a.texto });
      return true;
    },
  };
  const emails: Email[] = [];
  const correio = async (e: Email) => {
    emails.push(e);
    return true;
  };
  return { dep, linhas, sino, emails, correio };
}

test("primeira recusa abre o incidente e avisa cada admin no sino e por e-mail", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const t0 = new Date("2026-10-06T12:00:00Z");
  const r = await aviso.avisarSemSaldo("openai", { onde: "arte pelo GPT Image", detalhe: "HTTP 429: insufficient_quota" }, { deposito: m.dep, correio: m.correio, agora: t0 });
  assert.equal(r.novoIncidente, true);
  assert.equal(r.avisados, 2);
  assert.equal(m.emails.length, 2);
  const e = m.emails[0];
  assert.match(e.assunto, /OpenAI/);
  assert.match(e.texto, /platform\.openai\.com\/settings\/organization\/billing/);
  assert.match(e.texto, /arte pelo GPT Image/);
  assert.match(e.texto, /O que fica parado/);
  for (const em of m.emails) assert.doesNotMatch(`${em.assunto}\n${em.texto}`, TRAVESSAO, "nunca travessão");
  const [s] = [...m.sino.values()];
  assert.equal(s.tipo, "falha");
  assert.doesNotMatch(`${s.titulo} ${s.texto}`, TRAVESSAO);
  const abertos = await aviso.fornecedoresSemSaldo({ deposito: m.dep });
  assert.deepEqual(abertos.map((i) => i.fornecedor), ["openai"]);
});

test("o limite de 6 h: recusas seguidas só somam; depois de 6 h o aviso volta", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const t0 = new Date("2026-10-06T12:00:00Z");
  const op = (agora: Date) => ({ deposito: m.dep, correio: m.correio, agora });
  await aviso.avisarSemSaldo("anthropic", { onde: "campanha" }, op(t0));
  assert.equal(m.emails.length, 2);
  for (const minutos of [1, 30, 120, 359]) {
    const r = await aviso.avisarSemSaldo("anthropic", { onde: "chat do escritório" }, op(new Date(t0.getTime() + minutos * 60_000)));
    assert.equal(r.novoIncidente, false);
    assert.equal(r.avisados, 0, `nada de aviso aos ${minutos} min`);
  }
  assert.equal(m.emails.length, 2, "um aviso por fornecedor a cada 6 h");
  assert.equal(m.linhas.filter((l) => l.acao === "saldo_zerado").length, 1, "um incidente só");
  const inc = (await m.dep.incidenteAberto("anthropic"))!;
  assert.equal(inc.ocorrencias, 5);
  assert.deepEqual(inc.onde, ["campanha", "chat do escritório"]);

  const r6 = await aviso.avisarSemSaldo("anthropic", { onde: "campanha" }, op(new Date(t0.getTime() + 6 * HORA + 60_000)));
  assert.equal(r6.avisados, 2);
  assert.equal(m.emails.length, 4);
  assert.match(m.emails[3].assunto, /continua sem saldo/);
  // Outro fornecedor tem o próprio relógio.
  const g = await aviso.avisarSemSaldo("google", { onde: "imagem pelo Imagen" }, op(new Date(t0.getTime() + 6 * HORA + 120_000)));
  assert.equal(g.avisados, 2);
});

test("dois processos que descobrem juntos mandam um aviso só", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const agora = new Date("2026-10-06T12:00:00Z");
  const op = { deposito: m.dep, correio: m.correio, agora };
  await Promise.all([
    aviso.avisarSemSaldo("deepgram", { onde: "transcrição do vídeo" }, op),
    aviso.avisarSemSaldo("deepgram", { onde: "comando falado do vídeo" }, op),
    aviso.avisarSemSaldo("deepgram", { onde: "transcrição do vídeo completo" }, op),
  ]);
  assert.equal(m.emails.length, 2, "um e-mail por admin, não três");
  assert.equal(m.linhas.filter((l) => l.acao === "saldo_zerado").length, 1);
});

test("a primeira chamada que passa fecha o incidente e avisa que voltou; nova recusa avisa de novo", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const t0 = new Date("2026-10-06T12:00:00Z");
  const op = (agora: Date) => ({ deposito: m.dep, correio: m.correio, agora });
  await aviso.avisarSemSaldo("elevenlabs", { onde: "voz do gêmeo" }, op(t0));
  assert.equal(m.emails.length, 2);

  // Chamada de OUTRO fornecedor passando não fecha nada.
  assert.equal(await aviso.registrarChamadaOk("openai", op(new Date(t0.getTime() + 60_000))), false);

  const t1 = new Date(t0.getTime() + 90 * 60_000);
  assert.equal(await aviso.registrarChamadaOk("elevenlabs", op(t1)), true);
  assert.equal(m.emails.length, 4);
  assert.match(m.emails[2].assunto, /voltou/);
  assert.match(m.emails[2].texto, /1 h 30 min/);
  assert.deepEqual(await aviso.fornecedoresSemSaldo({ deposito: m.dep }), [], "a faixa some");
  // A segunda chamada que passa não repete o aviso.
  assert.equal(await aviso.registrarChamadaOk("elevenlabs", op(new Date(t1.getTime() + 1000))), false);
  assert.equal(m.emails.length, 4);

  // Zerou de novo depois de voltar: o último recado ao Bruno era "voltou", então avisa já.
  const r = await aviso.avisarSemSaldo("elevenlabs", { onde: "voz do gêmeo" }, op(new Date(t1.getTime() + 10 * 60_000)));
  assert.equal(r.novoIncidente, true);
  assert.equal(m.emails.length, 6);
});

test("sem saldo no Resend: avisa no sino e no painel, sem tentar e-mail", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const r = await aviso.avisarSemSaldo("resend", { onde: "envio de e-mail" }, { deposito: m.dep, correio: m.correio, agora: new Date() });
  assert.equal(r.avisados, 2);
  assert.equal(m.emails.length, 0);
});

test("o aviso nunca lança, nem com o banco fora", async () => {
  aviso.zerarMemoriaDoAviso();
  const quebrado = new Proxy({} as Deposito, {
    get: () => async () => {
      throw new Error("banco fora");
    },
  });
  const r = await aviso.avisarSemSaldo("openai", { onde: "x" }, { deposito: quebrado, correio: async () => true });
  assert.equal(r.avisados, 0);
  assert.equal(await aviso.registrarChamadaOk("openai", { deposito: quebrado }), false);
  assert.deepEqual(await aviso.fornecedoresSemSaldo({ deposito: quebrado }), []);
});

test("conferirResposta: só avisa quando é saldo", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  const op = { deposito: m.dep, correio: m.correio, agora: new Date() };
  assert.equal(await aviso.conferirResposta("openai", NAO_E_SALDO.openai[0], "arte", op), false);
  assert.equal(m.emails.length, 0);
  assert.equal(await aviso.conferirResposta("openai", SEM_SALDO.openai[0], "arte", op), true);
  assert.equal(m.emails.length, 2);
});

// ─── de ponta a ponta: o cliente HTTP real, com o fetch trocado ───

async function comFetch<T>(resposta: () => Response, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => resposta()) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("a OpenAI sem saldo no cliente de imagem registra o incidente mesmo que quem chamou caia em outro gerador", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  aviso.usarAvisoDeTeste({ deposito: m.dep, correio: m.correio });
  const chaveAntes = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-teste-sem-chamada";
  try {
    const { gerarImagemOpenAIComCusto, ehSemSaldoDaOpenAI } = await import("@/lib/media/gpt-image");
    const corpo = JSON.stringify(SEM_SALDO.openai[0].corpo);
    const erro = await comFetch(
      () => new Response(corpo, { status: 429 }),
      () => gerarImagemOpenAIComCusto("um teste", "1:1" as never, undefined, "low").then(() => null, (e: unknown) => e)
    );
    assert.ok(ehSemSaldoDaOpenAI(erro), "o erro continua marcado para o caminho de reserva");
    assert.equal(m.emails.length, 2, "o Bruno é avisado");
    assert.deepEqual((await aviso.fornecedoresSemSaldo()).map((i) => i.fornecedor), ["openai"]);

    // O limite de taxa da OpenAI no mesmo cliente não avisa ninguém.
    aviso.zerarMemoriaDoAviso();
    const m2 = depositoEmMemoria();
    aviso.usarAvisoDeTeste({ deposito: m2.dep, correio: m2.correio });
    await comFetch(
      () => new Response(JSON.stringify(NAO_E_SALDO.openai[0].corpo), { status: 429 }),
      () => gerarImagemOpenAIComCusto("um teste", "1:1" as never, undefined, "low").catch(() => null)
    );
    assert.equal(m2.emails.length, 0);
  } finally {
    aviso.usarAvisoDeTeste(null);
    if (chaveAntes === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = chaveAntes;
  }
});

test("o Blotato com pagamento recusado registra o incidente", async () => {
  aviso.zerarMemoriaDoAviso();
  const m = depositoEmMemoria();
  aviso.usarAvisoDeTeste({ deposito: m.dep, correio: m.correio });
  const chaveAntes = process.env.BLOTATO_API_KEY;
  process.env.BLOTATO_API_KEY = "teste-sem-chamada";
  try {
    const { listarContas } = await import("@/lib/blotato");
    await comFetch(
      () => new Response(JSON.stringify(SEM_SALDO.blotato[0].corpo), { status: 402 }),
      () => listarContas().catch(() => null)
    );
    assert.deepEqual((await aviso.fornecedoresSemSaldo()).map((i) => i.fornecedor), ["blotato"]);
    assert.equal(m.emails.length, 2);
  } finally {
    aviso.usarAvisoDeTeste(null);
    if (chaveAntes === undefined) delete process.env.BLOTATO_API_KEY;
    else process.env.BLOTATO_API_KEY = chaveAntes;
  }
});

test("sem depósito injetado, dentro do executor de testes o aviso não toca o banco", async () => {
  aviso.zerarMemoriaDoAviso();
  assert.ok(process.env.NODE_TEST_CONTEXT, "o node --test marca o processo");
  const r = await aviso.avisarSemSaldo("openai", { onde: "x" });
  assert.equal(r.incidente, null);
  assert.equal(await aviso.registrarChamadaOk("openai"), false);
});
