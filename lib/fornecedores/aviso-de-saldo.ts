import type { Email } from "@/lib/email";
import {
  FORNECEDORES,
  IDS_DE_FORNECEDOR,
  fornecedorSemSaldoDoErro,
  respostaSemSaldo,
  type Fornecedor,
  type RespostaDoFornecedor,
} from "@/lib/fornecedores/saldo";

/**
 * O AVISO CENTRAL DE "SEM SALDO" (06/10/2026).
 *
 * Antes dele, só a fila de trabalhos avisava (lib/fila/saldo-zerado.ts), e só
 * da Anthropic e da OpenAI. A arte que caía da OpenAI para o Google, o vídeo
 * do gêmeo que esperava a ElevenLabs, a transcrição recusada pela Deepgram:
 * tudo isso acontecia fora da fila e ficava no log. O Bruno descobriu a OpenAI
 * zerada em 06/10 porque a arte saiu ruim.
 *
 * Agora quem fala com o fornecedor chama este módulo NO PONTO em que lê a
 * recusa (o cliente HTTP de cada um). Assim qualquer caminho fica coberto, da
 * fila, de uma rota, de um cron ou do retorno do worker, sem cada chamador ter
 * de lembrar.
 *
 * ## O que acontece
 *
 * 1. O incidente é gravado em `admin_acoes` (acao "saldo_zerado", alvoEmail =
 *    o fornecedor, alvoId nulo), sem tabela nova. Ocorrências seguintes do
 *    mesmo incidente só somam no detalhe (onde bateu, quantas vezes).
 * 2. Cada admin recebe no sino e por e-mail: qual fornecedor, onde recarregar
 *    e o que ficou parado. UM aviso por fornecedor a cada 6 h: a trava é a
 *    chave única da notificação ("saldo:<fornecedor>:<incidente>:<janela de
 *    6 h>"), então dois processos que descobrem juntos mandam um e-mail só.
 * 3. A primeira chamada que passa de novo (gravada em `ai_usage`, ou o
 *    sucesso do cliente HTTP) fecha o incidente ("saldo_voltou") e manda o
 *    aviso de que voltou.
 * 4. O painel de admin mostra a faixa enquanto houver incidente aberto
 *    (components/admin/faixa-de-saldo.tsx).
 *
 * WhatsApp: o envio existe (lib/whatsapp) mas só manda modelo aprovado pela
 * Meta, e nenhum dos modelos aprovados serve para este aviso. Fica no sino e
 * no e-mail até existir um modelo de alerta interno.
 *
 * ## Nunca lança, e nunca segura o chamador
 *
 * O aviso é acessório da chamada que falhou: um banco lento não pode
 * transformar "sem saldo" em "travou". Tudo tem teto de tempo e vira log.
 */

const ZERADO = "saldo_zerado";
const VOLTOU = "saldo_voltou";
/** Intervalo entre dois avisos do mesmo fornecedor com a conta ainda zerada. */
export const INTERVALO_DO_AVISO_MS = 6 * 60 * 60 * 1000;
/** De quanto em quanto tempo um processo relê quais fornecedores estão zerados. */
const RELEITURA_MS = 60 * 1000;
/** Teto de tempo do aviso inteiro, para nunca segurar quem chamou. */
const TETO_MS = 10_000;

export type Incidente = {
  id: string;
  fornecedor: Fornecedor;
  desde: Date;
  ultimoEm: Date;
  ocorrencias: number;
  onde: string[];
  detalhe: string | null;
};

export type Ocorrencia = { onde: string; detalhe?: string | null; em: Date };

/** Onde o aviso guarda o estado. O padrão é o Prisma; os testes passam um em memória. */
export type Deposito = {
  incidenteAberto(f: Fornecedor): Promise<Incidente | null>;
  incidentesAbertos(): Promise<Incidente[]>;
  /** Abre e devolve o incidente canônico (se dois abriram juntos, o mais antigo). */
  abrirIncidente(f: Fornecedor, o: Ocorrencia): Promise<Incidente>;
  anotarOcorrencia(inc: Incidente, o: Ocorrencia): Promise<void>;
  fecharIncidente(inc: Incidente, em: Date): Promise<void>;
  admins(): Promise<Array<{ id: string; email: string | null }>>;
  /** Grava no sino de um admin. Devolve true só para quem ganhou a chave (fato novo). */
  avisarNoSino(a: { userId: string; chave: string; tipo: "falha" | "completo"; titulo: string; texto: string }): Promise<boolean>;
};

export type Correio = (e: Email) => Promise<boolean>;

export type OpcoesDoAviso = { deposito?: Deposito; correio?: Correio; agora?: Date };

// ─────────────────────────────── os textos ───────────────────────────────

function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function duracao(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

export function emailDeSemSaldo(inc: Incidente, para: string, agora: Date): Email {
  const f = FORNECEDORES[inc.fornecedor];
  const repetido = agora.getTime() - inc.desde.getTime() >= INTERVALO_DO_AVISO_MS;
  return {
    para,
    assunto: repetido
      ? `Demandou: a conta da ${f.nome} continua sem saldo`
      : `Demandou: a conta da ${f.nome} ficou sem saldo`,
    texto: [
      repetido
        ? `A conta da ${f.nome} continua sem saldo desde ${dataHora(inc.desde)} (há ${duracao(agora.getTime() - inc.desde.getTime())}).`
        : `A conta da ${f.nome} ficou sem saldo (${dataHora(inc.desde)}).`,
      "",
      `Recarregue aqui: ${f.recarga}`,
      "",
      `O que fica parado enquanto isso: ${f.oQuePara}`,
      "",
      `Onde bateu: ${inc.onde.join("; ") || "não informado"} (${inc.ocorrencias} vez(es) até agora).`,
      "",
      "Se continuar zerada, este aviso volta em 6 horas. Quando a primeira chamada passar de novo, chega o aviso de que voltou.",
      ...(inc.detalhe ? ["", `A resposta do fornecedor, para conferência: ${inc.detalhe.slice(0, 300)}`] : []),
    ].join("\n"),
  };
}

export function emailDeVolta(inc: Incidente, para: string, agora: Date): Email {
  const f = FORNECEDORES[inc.fornecedor];
  return {
    para,
    assunto: `Demandou: a ${f.nome} voltou a responder`,
    texto: [
      `A primeira chamada à ${f.nome} passou de novo (${dataHora(agora)}).`,
      "",
      `A conta ficou zerada por ${duracao(agora.getTime() - inc.desde.getTime())}, desde ${dataHora(inc.desde)}, com ${inc.ocorrencias} recusa(s) registrada(s).`,
      "",
      "O que tinha parado volta na próxima tentativa; a fila de trabalhos retoma os pausados em até dez minutos.",
    ].join("\n"),
  };
}

function tituloDoSino(inc: Incidente): string {
  return `${FORNECEDORES[inc.fornecedor].nome} sem saldo`;
}

function textoDoSino(inc: Incidente): string {
  const f = FORNECEDORES[inc.fornecedor];
  return `Recarregue em ${f.recarga}. Parado: ${f.oQuePara}`;
}

// ─────────────────────────────── o depósito padrão (Prisma) ───────────────────────────────

type DetalheDoIncidente = { fornecedor: Fornecedor; ultimoEm: string; ocorrencias: number; onde: string[]; detalhe: string | null };

type LinhaDeAcao = { id: string; acao: string; alvoEmail: string; createdAt: Date; detalhe: unknown };

function ehFornecedor(x: string): x is Fornecedor {
  return (IDS_DE_FORNECEDOR as readonly string[]).includes(x);
}

/**
 * O incidente aberto de cada fornecedor, a partir das linhas em ordem
 * decrescente: tudo antes do primeiro "voltou" é o incidente aberto, e o
 * canônico é o "zerado" mais antigo desse trecho (dois processos podem ter
 * aberto juntos).
 */
export function incidentesDasLinhas(linhas: LinhaDeAcao[]): Incidente[] {
  const porFornecedor = new Map<string, LinhaDeAcao[]>();
  for (const l of linhas) {
    const lista = porFornecedor.get(l.alvoEmail) ?? [];
    lista.push(l);
    porFornecedor.set(l.alvoEmail, lista);
  }
  const abertos: Incidente[] = [];
  for (const [f, lista] of porFornecedor) {
    if (!ehFornecedor(f)) continue;
    const ordenada = [...lista].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const trecho: LinhaDeAcao[] = [];
    for (const l of ordenada) {
      if (l.acao === VOLTOU) break;
      if (l.acao === ZERADO) trecho.push(l);
    }
    if (!trecho.length) continue;
    const canonica = trecho[trecho.length - 1];
    const d = (canonica.detalhe ?? {}) as Partial<DetalheDoIncidente>;
    const extras = trecho.length - 1;
    abertos.push({
      id: canonica.id,
      fornecedor: f,
      desde: canonica.createdAt,
      ultimoEm: d.ultimoEm ? new Date(d.ultimoEm) : canonica.createdAt,
      ocorrencias: (d.ocorrencias ?? 1) + extras,
      onde: Array.isArray(d.onde) ? d.onde : [],
      detalhe: d.detalhe ?? null,
    });
  }
  return abertos;
}

function juntarOnde(onde: string[], novo: string): string[] {
  return [...new Set([...onde, novo].filter(Boolean))].slice(-10);
}

async function depositoDoPrisma(): Promise<Deposito> {
  const { prisma } = await import("@/lib/db/prisma");
  const { notificar } = await import("@/lib/notificacoes");
  const SISTEMA = { adminId: "sistema", adminEmail: "sistema@demandou.com" };
  const sel = { id: true, acao: true, alvoEmail: true, createdAt: true, detalhe: true } as const;

  const linhasDe = (f?: Fornecedor) =>
    prisma.acaoDeAdmin.findMany({
      where: { acao: { in: [ZERADO, VOLTOU] }, alvoId: null, ...(f ? { alvoEmail: f } : {}) },
      orderBy: { createdAt: "desc" },
      take: f ? 50 : 500,
      select: sel,
    });

  const dep: Deposito = {
    async incidenteAberto(f) {
      return incidentesDasLinhas(await linhasDe(f))[0] ?? null;
    },
    async incidentesAbertos() {
      return incidentesDasLinhas(await linhasDe());
    },
    async abrirIncidente(f, o) {
      const detalhe: DetalheDoIncidente = { fornecedor: f, ultimoEm: o.em.toISOString(), ocorrencias: 1, onde: [o.onde], detalhe: o.detalhe ?? null };
      const minha = await prisma.acaoDeAdmin.create({
        data: { ...SISTEMA, alvoId: null, alvoEmail: f, acao: ZERADO, detalhe: detalhe as object },
        select: { id: true },
      });
      const canonico = await dep.incidenteAberto(f);
      if (canonico && canonico.id !== minha.id) {
        // Outro processo abriu antes: a minha linha some e a ocorrência soma no dele.
        await prisma.acaoDeAdmin.delete({ where: { id: minha.id } }).catch(() => {});
        await dep.anotarOcorrencia(canonico, o);
        return canonico;
      }
      return canonico ?? { id: minha.id, fornecedor: f, desde: o.em, ultimoEm: o.em, ocorrencias: 1, onde: [o.onde], detalhe: o.detalhe ?? null };
    },
    async anotarOcorrencia(inc, o) {
      const detalhe: DetalheDoIncidente = {
        fornecedor: inc.fornecedor,
        ultimoEm: o.em.toISOString(),
        ocorrencias: inc.ocorrencias + 1,
        onde: juntarOnde(inc.onde, o.onde),
        detalhe: o.detalhe ?? inc.detalhe,
      };
      await prisma.acaoDeAdmin.update({ where: { id: inc.id }, data: { detalhe: detalhe as object } });
    },
    async fecharIncidente(inc, em) {
      await prisma.acaoDeAdmin.create({
        data: {
          ...SISTEMA,
          alvoId: null,
          alvoEmail: inc.fornecedor,
          acao: VOLTOU,
          detalhe: { incidenteId: inc.id, desde: inc.desde.toISOString(), voltouEm: em.toISOString(), ocorrencias: inc.ocorrencias },
        },
      });
    },
    async admins() {
      return prisma.user.findMany({ where: { role: "admin" }, select: { id: true, email: true } });
    },
    async avisarNoSino(a) {
      const r = await notificar({ userId: a.userId, tipo: a.tipo, titulo: a.titulo, texto: a.texto, link: "/admin", chave: a.chave });
      return r.nova;
    },
  };
  return dep;
}

async function correioPadrao(e: Email): Promise<boolean> {
  const { enviarEmail } = await import("@/lib/email");
  return enviarEmail(e);
}

/**
 * Sem depósito injetado, o aviso fica desligado dentro do executor de testes
 * do Node (NODE_TEST_CONTEXT) e com AVISO_DE_SALDO=0: teste de outro módulo
 * que passa por um cliente HTTP nunca escreve no banco de verdade.
 */
function desligado(op?: OpcoesDoAviso): boolean {
  if (op?.deposito || opcoesDeTeste?.deposito) return false;
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.env.AVISO_DE_SALDO === "0";
}

/**
 * Para os testes de ponta a ponta: um depósito e um correio que valem para
 * TODA chamada sem opções (é como os clientes HTTP chamam). Null desliga.
 */
let opcoesDeTeste: OpcoesDoAviso | null = null;
export function usarAvisoDeTeste(op: OpcoesDoAviso | null): void {
  opcoesDeTeste = op;
}

function comPadrao(op?: OpcoesDoAviso): OpcoesDoAviso | undefined {
  return op ?? opcoesDeTeste ?? undefined;
}

function comTeto<T>(p: Promise<T>, padrao: T, rotulo: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[aviso-de-saldo] ${rotulo} passou de ${TETO_MS / 1000} s; sigo sem esperar.`);
      resolve(padrao);
    }, TETO_MS);
  });
  return Promise.race([p, teto]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────── o estado do processo ───────────────────────────────

const estado: { lidoEm: number; abertos: Set<Fornecedor> } = { lidoEm: 0, abertos: new Set() };

/** Para os testes: esquece o que este processo sabia. */
export function zerarMemoriaDoAviso(): void {
  estado.lidoEm = 0;
  estado.abertos.clear();
}

// ─────────────────────────────── as portas ───────────────────────────────

export type ResultadoDoAviso = { incidente: Incidente | null; novoIncidente: boolean; avisados: number; emails: number };

/**
 * Registra que a conta do fornecedor está sem saldo e avisa os admins (no
 * máximo uma vez a cada 6 h por fornecedor). `onde` é o caminho que bateu
 * ("arte do post pelo GPT Image", "transcrição do vídeo"), para o Bruno saber
 * o que ficou parado.
 */
export async function avisarSemSaldo(
  fornecedor: Fornecedor,
  contexto: { onde: string; detalhe?: string | null },
  op?: OpcoesDoAviso
): Promise<ResultadoDoAviso> {
  op = comPadrao(op);
  const vazio: ResultadoDoAviso = { incidente: null, novoIncidente: false, avisados: 0, emails: 0 };
  const nome = FORNECEDORES[fornecedor].nome;
  console.error(`[aviso-de-saldo] ${nome.toUpperCase()} SEM SALDO em "${contexto.onde}". Recarga: ${FORNECEDORES[fornecedor].recarga}`);
  if (desligado(op)) return vazio;
  return comTeto(
    (async () => {
      try {
        const dep = op?.deposito ?? (await depositoDoPrisma());
        const correio = op?.correio ?? correioPadrao;
        const agora = op?.agora ?? new Date();
        const ocorrencia: Ocorrencia = { onde: contexto.onde, detalhe: contexto.detalhe?.slice(0, 500) ?? null, em: agora };

        let inc = await dep.incidenteAberto(fornecedor);
        const novoIncidente = !inc;
        if (inc) {
          await dep.anotarOcorrencia(inc, ocorrencia);
          inc = { ...inc, ultimoEm: agora, ocorrencias: inc.ocorrencias + 1, onde: juntarOnde(inc.onde, contexto.onde) };
        } else {
          inc = await dep.abrirIncidente(fornecedor, ocorrencia);
        }
        estado.abertos.add(fornecedor);

        const janela = Math.floor(Math.max(0, agora.getTime() - inc.desde.getTime()) / INTERVALO_DO_AVISO_MS);
        const chave = `saldo:${fornecedor}:${inc.id}:${janela}`;
        let avisados = 0;
        let emails = 0;
        for (const a of await dep.admins()) {
          const ganhou = await dep.avisarNoSino({ userId: a.id, chave, tipo: "falha", titulo: tituloDoSino(inc), texto: textoDoSino(inc) });
          if (!ganhou) continue;
          avisados++;
          // Sem saldo no Resend, o e-mail não sai: o aviso fica no sino e no painel.
          if (fornecedor === "resend" || !a.email) continue;
          if (await correio(emailDeSemSaldo(inc, a.email, agora))) emails++;
        }
        return { incidente: inc, novoIncidente, avisados, emails };
      } catch (e) {
        console.error("[aviso-de-saldo] não consegui registrar o incidente:", e instanceof Error ? e.message : e);
        return vazio;
      }
    })(),
    vazio,
    `o aviso da ${nome}`
  );
}

/**
 * Confere a resposta de um fornecedor e, se for falta de saldo, avisa.
 * Devolve se era falta de saldo, para quem chamou decidir o caminho.
 */
export async function conferirResposta(
  fornecedor: Fornecedor,
  resposta: RespostaDoFornecedor,
  onde: string,
  op?: OpcoesDoAviso
): Promise<boolean> {
  if (!respostaSemSaldo(fornecedor, resposta)) return false;
  const corpo = typeof resposta.corpo === "string" ? resposta.corpo : JSON.stringify(resposta.corpo ?? "");
  await avisarSemSaldo(fornecedor, { onde, detalhe: `HTTP ${resposta.status ?? "?"}: ${corpo}` }, op);
  return true;
}

/**
 * Para quem só tem o erro na mão (a fila, uma rota, um cron, o catch de um
 * caminho de reserva): se o erro é falta de saldo de algum fornecedor, avisa.
 * Devolve o fornecedor, ou null.
 */
export async function avisarSeForSemSaldo(e: unknown, onde: string, op?: OpcoesDoAviso): Promise<Fornecedor | null> {
  const f = fornecedorSemSaldoDoErro(e);
  if (!f) return null;
  await avisarSemSaldo(f, { onde, detalhe: e instanceof Error ? e.message : String(e) }, op);
  return f;
}

/**
 * Uma chamada a este fornecedor PASSOU. Se havia incidente aberto, fecha e
 * manda o aviso de que voltou. Custa uma leitura do banco por minuto por
 * processo (a lista de abertos fica em memória), e nada no caso comum.
 */
export async function registrarChamadaOk(fornecedor: Fornecedor, op?: OpcoesDoAviso): Promise<boolean> {
  op = comPadrao(op);
  if (desligado(op)) return false;
  return comTeto(
    (async () => {
      try {
        const dep = op?.deposito ?? (await depositoDoPrisma());
        const agora = op?.agora ?? new Date();
        if (agora.getTime() - estado.lidoEm > RELEITURA_MS) {
          const abertos = await dep.incidentesAbertos();
          estado.abertos = new Set(abertos.map((i) => i.fornecedor));
          estado.lidoEm = agora.getTime();
        }
        if (!estado.abertos.has(fornecedor)) return false;
        estado.abertos.delete(fornecedor);
        const inc = await dep.incidenteAberto(fornecedor);
        if (!inc) return false;
        await dep.fecharIncidente(inc, agora);
        console.warn(`[aviso-de-saldo] ${FORNECEDORES[fornecedor].nome} voltou a responder.`);
        const correio = op?.correio ?? correioPadrao;
        const chave = `saldo-voltou:${fornecedor}:${inc.id}`;
        for (const a of await dep.admins()) {
          const ganhou = await dep.avisarNoSino({
            userId: a.id,
            chave,
            tipo: "completo",
            titulo: `${FORNECEDORES[fornecedor].nome} voltou`,
            texto: `A primeira chamada passou de novo depois de ${duracao(agora.getTime() - inc.desde.getTime())} sem saldo.`,
          });
          if (ganhou && a.email && fornecedor !== "resend") await correio(emailDeVolta(inc, a.email, agora));
        }
        return true;
      } catch (e) {
        console.error("[aviso-de-saldo] não consegui registrar a volta:", e instanceof Error ? e.message : e);
        return false;
      }
    })(),
    false,
    "o registro da volta"
  );
}

/** A versão de "disparar e esquecer", para o caminho de sucesso não ganhar latência. */
export function marcarChamadaOk(fornecedor: Fornecedor | null | undefined): void {
  if (!fornecedor) return;
  void registrarChamadaOk(fornecedor).catch(() => {});
}

/** Os fornecedores sem saldo agora, para a faixa do painel. Nunca lança. */
export async function fornecedoresSemSaldo(op?: OpcoesDoAviso): Promise<Incidente[]> {
  op = comPadrao(op);
  try {
    const dep = op?.deposito ?? (await depositoDoPrisma());
    return await dep.incidentesAbertos();
  } catch (e) {
    console.error("[aviso-de-saldo] não consegui ler os incidentes:", e instanceof Error ? e.message : e);
    return [];
  }
}
