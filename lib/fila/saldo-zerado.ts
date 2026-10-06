import { prisma } from "@/lib/db/prisma";
import { ehErroDeSaldo } from "@/lib/claude";
import { ehSemSaldoDaOpenAI } from "@/lib/media/gpt-image";
import { avisarSemSaldo } from "@/lib/fornecedores/aviso-de-saldo";
import { fornecedorSemSaldoDoErro, type Fornecedor } from "@/lib/fornecedores/saldo";

/**
 * A FILA PARA QUANDO A PLATAFORMA FICA SEM SALDO DE API.
 *
 * O que aconteceu em 19/09 à tarde, medido: a conta da Anthropic zerou no meio
 * de uma campanha semanal. Cada redator falhou como aviso, cada dia terminou
 * vazio e se marcou concluído, e a campanha fechou como "concluída! 0 posts"
 * em quatro segundos. A fila gastou tentativas contra um saldo que não volta
 * sozinho, e ninguém foi avisado: o erro só ia para o log do servidor.
 *
 * Três regras, e as três são o mesmo princípio: uma dependência que zera
 * precisa PARAR a fila, não passar por ela.
 *
 * 1. **Pausa tudo, e não só o trabalho.** Saldo é da plataforma, não do
 *    cliente. Se um trabalho descobriu que acabou, todos os outros vão
 *    descobrir a mesma coisa, cada um queimando uma tentativa. Então o
 *    trabalho que achou o problema e TODOS os pendentes viram `pausado`, e a
 *    tentativa dele não conta: a falha não é dele.
 * 2. **Retoma sozinha.** A cada dez minutos a fila devolve os pausados para
 *    pendente e tenta UM. Se o saldo voltou, a campanha segue de onde parou;
 *    se não voltou, o primeiro erro pausa tudo de novo. Uma chamada recusada
 *    por saldo não custa nada, então a sondagem é de graça. Não existe botão
 *    de "retomar" para o Bruno esquecer de apertar.
 * 3. **Avisa quem paga a conta.** Desde 06/10 pelo aviso central
 *    (lib/fornecedores/aviso-de-saldo.ts): sino e e-mail para os admins, um
 *    por fornecedor a cada seis horas, e o aviso de que voltou quando a
 *    primeira chamada passa. O cliente lê só um aviso neutro no log da
 *    campanha, sem nome de fornecedor nem "saldo de API".
 *
 * O estado vive nos próprios trabalhos (`status: pausado`, com o motivo em
 * `error` como JSON), sem tabela nova: o que a fila precisa saber para
 * retomar é quando pausou, e isso cabe na linha que ela já tem.
 */

/** Quanto tempo a fila espera antes de tentar de novo. */
export const PAUSA_MS = 10 * 60 * 1000;
export type Provedor = "Anthropic" | "OpenAI";

/** Este erro é falta de saldo em algum provedor de IA? */
export function ehFaltaDeSaldo(e: unknown): boolean {
  return ehErroDeSaldo(e) || ehSemSaldoDaOpenAI(e);
}

/**
 * De qual conta o saldo acabou.
 *
 * NÃO pela marca `semSaldo`: as duas classes de erro (lib/claude e
 * lib/media/gpt-image) carregam a mesma marca de propósito, para o `catch` as
 * reconhecer sem `instanceof`. A prova de 19/09 pegou o efeito colateral: um
 * erro da Anthropic lia como OpenAI, e o e-mail mandava o Bruno recarregar a
 * conta errada. O nome e a mensagem dizem de quem é.
 */
export function provedorDoErro(e: unknown): Provedor {
  return fornecedorDoErroDaFila(e) === "openai" ? "OpenAI" : "Anthropic";
}

function fornecedorDoErroDaFila(e: unknown): Fornecedor {
  return fornecedorSemSaldoDoErro(e) ?? "anthropic";
}

type Ledger = { saldoZerado: true; provedor: Provedor; em: string; avisadoEm: string | null };

function lerLedger(error: string | null): Ledger | null {
  if (!error || !error.startsWith("{")) return null;
  try {
    const l = JSON.parse(error) as Partial<Ledger>;
    return l.saldoZerado ? (l as Ledger) : null;
  } catch {
    return null;
  }
}

/**
 * Pausa a fila inteira e avisa. Chamado pela passada quando um trabalho cai
 * por falta de saldo.
 *
 * Devolve quantos trabalhos foram pausados, para o log da passada.
 */
export async function pausarAFila(trabalhoId: string, erro: unknown): Promise<number> {
  const provedor = provedorDoErro(erro);
  const agora = new Date();

  // O controle das seis horas mora no aviso central; o ledger só guarda
  // quando a fila pausou (é o que a retomada precisa).
  const ledger: Ledger = { saldoZerado: true, provedor, em: agora.toISOString(), avisadoEm: null };
  const motivo = JSON.stringify(ledger);

  // 1. O trabalho que descobriu: volta para pausado, e a tentativa não conta.
  await prisma.trabalho.updateMany({
    where: { id: trabalhoId, status: "rodando" },
    data: { status: "pausado", error: motivo, startedAt: null, attempts: { decrement: 1 } },
  });
  // 2. Todos os pendentes, de qualquer grupo: o saldo é da plataforma.
  const { count } = await prisma.trabalho.updateMany({
    where: { status: "pendente" },
    data: { status: "pausado", error: motivo },
  });

  // 3. As execuções desses grupos ficam "paused", com a explicação no log, que
  //    é onde a tela do cliente lê o que está acontecendo.
  const grupos = await prisma.trabalho.findMany({
    where: { status: "pausado" },
    select: { grupo: true },
    distinct: ["grupo"],
  });
  for (const { grupo } of grupos) {
    const run = await prisma.pipelineRun.findUnique({ where: { id: grupo }, select: { status: true, logs: true } });
    if (!run || run.status !== "running") continue;
    const logs = Array.isArray(run.logs) ? (run.logs as unknown[]) : [];
    logs.push({
      agent: "Sistema",
      status: "warning",
      // Neutro: o cliente nunca lê nome de fornecedor nem "saldo de API" (06/10).
      message:
        "Pausado: uma etapa da geração está temporariamente indisponível. Não é nada da sua campanha, e ela " +
        "continua de onde parou assim que voltar. A equipe já foi avisada.",
      timestamp: agora.toISOString(),
    });
    await prisma.pipelineRun.update({ where: { id: grupo }, data: { status: "paused", logs: logs as never } });
  }

  console.error(`[fila] PAUSADA: ${provedor} sem saldo. ${count + 1} trabalho(s) esperando a recarga.`);
  await avisarSemSaldo(fornecedorDoErroDaFila(erro), {
    onde: `fila de trabalhos: ${count + 1} trabalho(s) de campanha pausado(s), nenhum cliente cobrado por eles`,
    detalhe: erro instanceof Error ? erro.message : String(erro),
  });
  return count + 1;
}

/**
 * Devolve os pausados para a fila quando a pausa já durou o bastante.
 *
 * Chamado no início de cada passada. Se o saldo ainda não voltou, o primeiro
 * trabalho a rodar cai de novo e pausa tudo de novo: custo zero, porque a
 * chamada recusada não é cobrada.
 */
export async function retomarPausados(agora = new Date()): Promise<number> {
  const pausados = await prisma.trabalho.findMany({
    where: { status: "pausado" },
    select: { id: true, grupo: true, error: true },
  });
  if (pausados.length === 0) return 0;

  /**
   * O ENGASGO DO GERADOR TEM HORA PRÓPRIA (28/09). A pausa guarda `proximaEm`
   * (1, 2, 3, 5 minutos, ver lib/fila/cota-do-video.ts), e cada um volta na
   * hora dele, sozinho. Os demais (saldo zerado, cota) seguem o relógio geral
   * de dez minutos, e o engasgo fica fora dessa conta para não atrasá-la.
   */
  const horaPropria = (erro: string | null): number | null => {
    try {
      const l = JSON.parse(erro ?? "{}") as { proximaEm?: string };
      return l.proximaEm ? new Date(l.proximaEm).getTime() : null;
    } catch {
      return null;
    }
  };
  const comHora = pausados.filter((t) => horaPropria(t.error) !== null);
  const vencidos = comHora.filter((t) => (horaPropria(t.error) ?? 0) <= agora.getTime()).map((t) => t.id);
  let devolvidosNaHora = 0;
  if (vencidos.length) {
    const r = await prisma.trabalho.updateMany({ where: { id: { in: vencidos }, status: "pausado" }, data: { status: "pendente" } });
    devolvidosNaHora = r.count;
  }
  const doRelogio = pausados.filter((t) => horaPropria(t.error) === null);
  if (doRelogio.length === 0) return devolvidosNaHora;

  const maisRecente = Math.max(...doRelogio.map((t) => new Date(lerLedger(t.error)?.em ?? 0).getTime()));
  if (agora.getTime() - maisRecente < PAUSA_MS) return devolvidosNaHora;

  const r = await prisma.trabalho.updateMany({
    where: { id: { in: doRelogio.map((t) => t.id) }, status: "pausado" },
    data: { status: "pendente" },
  });
  const count = r.count + devolvidosNaHora;
  for (const grupo of new Set(doRelogio.map((t) => t.grupo))) {
    const run = await prisma.pipelineRun.findUnique({ where: { id: grupo }, select: { status: true, logs: true } });
    if (!run || run.status !== "paused") continue;
    const logs = Array.isArray(run.logs) ? (run.logs as unknown[]) : [];
    logs.push({
      agent: "Sistema",
      status: "running",
      message: "Tentando de novo: a fila voltou da pausa para ver se a geração já está disponível.",
      timestamp: agora.toISOString(),
    });
    await prisma.pipelineRun.update({ where: { id: grupo }, data: { status: "running", logs: logs as never } });
  }
  console.warn(`[fila] retomando ${count} trabalho(s) pausado(s) por saldo.`);
  return count;
}

/** Quantos trabalhos estão esperando a recarga. Para a tela e para os testes. */
export async function pausadosPorSaldo(): Promise<number> {
  return prisma.trabalho.count({ where: { status: "pausado" } });
}
