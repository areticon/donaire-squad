import { prisma } from "@/lib/db/prisma";

/**
 * O CLIENTE DO JEV (03/10/2026): o modelo System One da TypeSafe, que NÃO gera
 * texto. Ele responde perguntas estruturadas sobre um estado (texto ou objeto):
 * sim ou não com probabilidade (noul), escolha entre opções com distribuição
 * (choice) e nota em níveis (score). Meia segundo por pedido, dezenas de
 * perguntas num pedido só, e US$ 42 por bilhão de tokens de entrada.
 *
 * Decisão do Bruno (02/10): "tudo que precisa de tomada de decisão vai para o
 * JEV; preciso economizar". O diretor de montagem antigo pedia ao Sonnet um
 * plano cena a cena de 17 mil tokens de saída por bloco (US$ 10,44 e três
 * falhas num vídeo de 19 min). Aqui o código gera os candidatos e o JEV
 * decide por candidato; o Sonnet só escreve o texto curto de uma cartela.
 *
 * ## Regras deste cliente
 * - LOTE: as perguntas vão em pedidos de até `TETO_DE_PERGUNTAS`; quem chama
 *   manda a lista inteira e recebe as respostas pela chave.
 * - BACKOFF: 429 e 529 esperam e tentam de novo (exponencial, até 4 vezes).
 * - CUSTO em `ai_usage`: operation "jev-<etapa>", modelo o que respondeu,
 *   custo = tokens de entrada x US$ 42 por bilhão.
 * - INTERRUPTOR: sem TYPESAFE_API_KEY, ou com JEV_LIGADO=0, `jevLigado()` é
 *   falso e quem chama cai no caminho antigo.
 * - A chave NUNCA sai daqui: não vai para log, erro nem resposta.
 * - "NÃO SEI" É RESPOSTA: `confidence` baixa (ou noul perto de 0,5) vira o
 *   padrão seguro de quem chama (`decidirNoul`, `decidirChoice`).
 */

export type InstrucaoDoJev = string | Record<string, unknown> | unknown[];

export type PerguntaDoJev =
  | { type: "noul"; instructions: InstrucaoDoJev }
  | { type: "choice"; instructions: InstrucaoDoJev; criteria: Record<string, string | null> }
  | { type: "score"; instructions: InstrucaoDoJev; criteria: Array<string | Record<string, unknown>> };

export type RespostaDoJev =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export type UsoDoJev = { pedidos: number; perguntas: number; inputTokens: number; outputTokens: number; custoUsd: number; ms: number };

export type ContextoDoJev = {
  projectId?: string | null;
  /** A etapa, sem o prefixo: vira operation "jev-<etapa>" no ai_usage. */
  etapa: string;
  /** Acumulador de uso de quem chama (a prova mede por aqui). */
  uso?: UsoDoJev;
  /** O estado do pedido (texto ou objeto), o mesmo para todas as perguntas do lote. */
  state: InstrucaoDoJev;
};

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODELO = "jev-latest";
/** US$ 42 por bilhão de tokens de entrada (medido em 02/10: 475 tokens, ~US$ 0,00002). */
export const PRECO_POR_TOKEN_DE_ENTRADA = 42 / 1_000_000_000;
/** Teto de perguntas por pedido: o estado vai repetido em cada pedido, então lote grande economiza tokens. */
export const TETO_DE_PERGUNTAS = Number(process.env.JEV_PERGUNTAS_POR_PEDIDO ?? 40);
/** Pedidos em paralelo por lote (o 429 pede backoff; quatro cabem com folga). */
const PARALELO = 4;
const TENTATIVAS = 4;

export function jevLigado(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY) && process.env.JEV_LIGADO !== "0";
}

export function usoVazio(): UsoDoJev {
  return { pedidos: 0, perguntas: 0, inputTokens: 0, outputTokens: 0, custoUsd: 0, ms: 0 };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** UM pedido ao JEV, com backoff em 429 e 529. */
async function pedir(state: InstrucaoDoJev, questions: Record<string, PerguntaDoJev>): Promise<{ answers: Record<string, RespostaDoJev>; usage: { input_tokens: number; output_tokens: number }; model: string }> {
  const chave = process.env.TYPESAFE_API_KEY;
  if (!chave) throw new Error("JEV sem chave (TYPESAFE_API_KEY)");
  let ultimo: Error | null = null;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, state, questions }),
      signal: AbortSignal.timeout(30_000),
    }).catch((e: unknown) => {
      ultimo = e instanceof Error ? e : new Error(String(e));
      return null;
    });
    if (!r) {
      await dormir(500 * 2 ** tentativa);
      continue;
    }
    if (r.status === 429 || r.status === 529 || r.status >= 500) {
      ultimo = new Error(`JEV respondeu ${r.status}`);
      await dormir(500 * 2 ** tentativa + Math.random() * 200);
      continue;
    }
    if (!r.ok) {
      // O corpo do erro descreve o pedido; a chave nunca está nele.
      const corpo = (await r.text().catch(() => "")).slice(0, 300);
      throw new Error(`JEV respondeu ${r.status}: ${corpo}`);
    }
    return (await r.json()) as { answers: Record<string, RespostaDoJev>; usage: { input_tokens: number; output_tokens: number }; model: string };
  }
  throw ultimo ?? new Error("JEV não respondeu");
}

async function gravarUso(ctx: ContextoDoJev, model: string, usage: { input_tokens: number; output_tokens: number }): Promise<void> {
  const custo = (usage.input_tokens ?? 0) * PRECO_POR_TOKEN_DE_ENTRADA;
  if (ctx.uso) {
    ctx.uso.pedidos++;
    ctx.uso.inputTokens += usage.input_tokens ?? 0;
    ctx.uso.outputTokens += usage.output_tokens ?? 0;
    ctx.uso.custoUsd += custo;
  }
  try {
    await prisma.aiUsage.create({
      data: {
        projectId: ctx.projectId ?? null,
        operation: `jev-${ctx.etapa}`,
        model,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        costUsd: custo,
      },
    });
  } catch (e) {
    // Instrumentação nunca derruba a esteira.
    console.error("[jev] falha ao gravar o uso (ignorado):", e instanceof Error ? e.message : e);
  }
}

/**
 * Perguntas em LOTE sobre um mesmo estado. Devolve as respostas pela chave;
 * pergunta que o JEV não respondeu fica de fora (quem chama trata como "não
 * sei"). Um pedido que falhou depois do backoff derruba o lote inteiro: quem
 * chama decide se cai no padrão seguro ou lança.
 */
export async function perguntarAoJev(ctx: ContextoDoJev, perguntas: Record<string, PerguntaDoJev>): Promise<Record<string, RespostaDoJev>> {
  const chaves = Object.keys(perguntas);
  const saida: Record<string, RespostaDoJev> = {};
  if (!chaves.length) return saida;
  const t0 = Date.now();
  const lotes: string[][] = [];
  for (let i = 0; i < chaves.length; i += TETO_DE_PERGUNTAS) lotes.push(chaves.slice(i, i + TETO_DE_PERGUNTAS));
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < lotes.length) {
      const lote = lotes[proximo++];
      const questions = Object.fromEntries(lote.map((k) => [k, perguntas[k]]));
      const r = await pedir(ctx.state, questions);
      if (ctx.uso) ctx.uso.perguntas += lote.length;
      void gravarUso(ctx, r.model ?? MODELO, r.usage ?? { input_tokens: 0, output_tokens: 0 });
      for (const k of lote) if (r.answers?.[k]) saida[k] = r.answers[k];
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALELO, lotes.length) }, trabalhador));
  if (ctx.uso) ctx.uso.ms += Date.now() - t0;
  return saida;
}

/** Sim ou não com margem: entre `piso` e `teto` é "não sei" e vale o padrão. */
export function decidirNoul(r: RespostaDoJev | undefined, padrao: boolean, piso = 0.35, teto = 0.65): boolean {
  if (!r || r.type !== "noul" || typeof r.noul !== "number") return padrao;
  if (r.noul >= teto) return true;
  if (r.noul <= piso) return false;
  return padrao;
}

/** A probabilidade de "sim", ou null quando não há resposta. */
export function probabilidadeDeSim(r: RespostaDoJev | undefined): number | null {
  return r && r.type === "noul" && typeof r.noul === "number" ? r.noul : null;
}

/** A escolha, ou o padrão quando a confiança é baixa. */
export function decidirChoice<T extends string>(r: RespostaDoJev | undefined, opcoes: readonly T[], padrao: T, confiancaMinima = 0.5): T {
  if (!r || r.type !== "choice") return padrao;
  if ((r.confidence ?? 0) < confiancaMinima) return padrao;
  return (opcoes as readonly string[]).includes(r.choice) ? (r.choice as T) : padrao;
}

/** A nota (índice do nível, com casas decimais), ou null sem resposta. */
export function notaDoScore(r: RespostaDoJev | undefined): number | null {
  return r && r.type === "score" && typeof r.score === "number" ? r.score : null;
}
