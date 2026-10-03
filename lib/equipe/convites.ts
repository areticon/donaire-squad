import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { membroAtivo, consumoDoMembro } from "@/lib/equipe/conta";
import { acessosDaConta, ACESSOS_INCLUSOS, creditosDoCiclo, fraseDaAssinaturaPausada, gravacoesDoCiclo, type EquipeNaTela } from "@/lib/equipe/regras";
export type { EquipeNaTela, PainelDaEquipe, MembroNoPainel } from "@/lib/equipe/regras";
import { cicloAtual } from "@/lib/ciclo-de-credito";
import { usoDeGravacoes } from "@/lib/limites-do-plano";
import { PLANOS_PUBLICOS } from "@/lib/planos";
import { PLANS } from "@/lib/stripe";

/**
 * O ACESSO DE EQUIPE do lado do DONO (01/10/2026): convidar, ajustar o que o
 * membro vê e pode gastar, remover, e o painel de consumo. E o aceite do
 * convite, do lado de quem foi convidado.
 *
 * As regras de negócio (quantos acessos, quanto rende o acesso extra) moram em
 * lib/equipe/regras.ts, sem banco, porque a tela mostra os mesmos números.
 */

export class RecusaDaEquipe extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RecusaDaEquipe";
  }
}

/** O convite vale 7 dias: o bastante para quem está viajando, curto para link esquecido. */
const VALIDADE_DO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Inteiro positivo ou null (sem teto). Zero vira null: teto zero é remover o acesso. */
function teto(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 10_000_000) throw new RecusaDaEquipe("O teto precisa ser um número inteiro maior que zero, ou vazio para sem teto.");
  return n;
}

/**
 * QUEM PODE ADMINISTRAR UMA EQUIPE: o dono de uma conta com plano (ou acesso
 * interno). Membro não convida ninguém (regra de 01/10), e conta sem plano não
 * tem cota para dividir.
 */
async function donoQuePodeAdministrar(userId: string) {
  if (await membroAtivo(userId)) throw new RecusaDaEquipe("Só quem administra a conta pode mexer na equipe.", 403);
  const dono = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, plan: true, role: true, acessosExtras: true, creditsResetAt: true, creditsBalance: true, videoCredits: true },
  });
  if (!dono) throw new RecusaDaEquipe("Conta não encontrada.", 404);
  const admin = dono.role === "admin";
  if (!admin && (!dono.plan || dono.plan === "free")) throw new RecusaDaEquipe("A equipe faz parte do plano. Escolha um plano para convidar pessoas.", 402);
  return { ...dono, admin };
}

type Leitor = typeof prisma | Prisma.TransactionClient;

/** Acessos ocupados: o dono, os membros ativos e os convites ainda válidos. */
async function acessosOcupados(donoId: string, db: Leitor = prisma, semContar?: string): Promise<number> {
  const agora = new Date();
  const fora = semContar ? { id: { not: semContar } } : {};
  const [ativos, convites] = await Promise.all([
    db.membroDaEquipe.count({ where: { donoId, status: "ativo", ...fora } }),
    db.membroDaEquipe.count({ where: { donoId, status: "convidado", conviteExpiraEm: { gt: agora }, ...fora } }),
  ]);
  return 1 + ativos + convites;
}

/**
 * A TRAVA DA EQUIPE (01/10, acabamento). `SELECT ... FOR UPDATE` na linha do
 * DONO, dentro da transação de quem vai ocupar um acesso (convidar, reenviar
 * convite vencido, aceitar).
 *
 * O porquê: a conta "quantos acessos estão ocupados" e a gravação que ocupa um
 * a mais eram dois passos soltos. Dois aceites (ou dois convites) ao mesmo
 * tempo liam a mesma contagem, os dois viam uma vaga e os dois entravam,
 * passando do que o plano paga. Com a linha do dono travada, o segundo espera
 * o primeiro terminar e conta de novo, já com ele dentro. A trava é da linha do
 * dono, e não da tabela, para equipes diferentes nunca esperarem uma pela outra.
 */
async function travarEquipe(tx: Prisma.TransactionClient, donoId: string): Promise<void> {
  await tx.$queryRaw`select id from users where id = ${donoId} for update`;
}

/**
 * Quanto uma transação da equipe espera pela vez. Com a trava, os aceites
 * simultâneos entram em fila, e cada um leva perto de 2 s contra o banco
 * remoto. No padrão do Prisma (2 s para começar, 5 s para terminar) o terceiro
 * da fila caía com "Unable to start a transaction", e não com a frase da vaga:
 * medido na prova de 01/10, seis aceites juntos num pool de 3 conexões.
 */
const ESPERA_DA_TRAVA = { maxWait: 20_000, timeout: 30_000 } as const;

/** Os projetos pedidos existem e são do dono? Devolve só os ids que valem. */
async function projetosDoDono(donoId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const limpos = ids.filter((i): i is string => typeof i === "string").slice(0, 200);
  if (limpos.length === 0) return [];
  const achados = await prisma.project.findMany({ where: { id: { in: limpos }, userId: donoId }, select: { id: true } });
  return achados.map((p) => p.id);
}

function baseDoApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

async function enviarConvite(args: { donoNome: string; email: string; nome: string | null; token: string; expira: Date }) {
  const { emailDeConviteDaEquipe } = await import("@/lib/email/equipe");
  const { enviarEmail } = await import("@/lib/email");
  const url = `${baseDoApp()}/convite/${args.token}`;
  const enviado = await enviarEmail({
    ...emailDeConviteDaEquipe({ quemConvida: args.donoNome, nome: args.nome, url, validoAte: args.expira }),
    para: args.email,
  });
  return { url, enviado };
}

export type DadosDoMembro = {
  projetos?: unknown;
  todosOsProjetos?: unknown;
  tetoGravacoes?: unknown;
  tetoCreditos?: unknown;
};

/**
 * CONVIDA UMA PESSOA. Devolve o link também, para o dono poder mandar por
 * WhatsApp quando o e-mail não chegar (e para o dev local, que não manda).
 */
export async function convidar(donoId: string, args: { email: unknown; nome?: unknown } & DadosDoMembro) {
  const dono = await donoQuePodeAdministrar(donoId);
  const email = normalizarEmail(String(args.email ?? ""));
  if (!emailValido(email)) throw new RecusaDaEquipe("Escreva um e-mail válido.");
  if (email === dono.email.toLowerCase()) throw new RecusaDaEquipe("Este é o seu e-mail: você já é o dono da conta.");

  const total = acessosDaConta(dono.plan, dono.acessosExtras, dono.admin);
  const projetos = await projetosDoDono(donoId, args.projetos);
  const todos = args.todosOsProjetos === true;
  const nome = typeof args.nome === "string" && args.nome.trim() ? args.nome.trim().slice(0, 120) : null;
  const token = randomBytes(24).toString("base64url");
  const expira = new Date(Date.now() + VALIDADE_DO_CONVITE_MS);

  // Convite vencido ou pendente para o mesmo e-mail é REAPROVEITADO: o índice
  // único (um convite vivo por e-mail) não deixa haver dois, e o link novo
  // invalida o antigo.
  const dados = {
    nome,
    tokenHash: hashDoToken(token),
    conviteExpiraEm: expira,
    todosOsProjetos: todos,
    tetoGravacoes: teto(args.tetoGravacoes),
    tetoCreditos: teto(args.tetoCreditos),
  };
  // Conferir a vaga e ocupar a vaga na MESMA transação, com a equipe travada
  // (ver travarEquipe): dois convites ao mesmo tempo não passam do plano.
  const membro = await prisma.$transaction(async (tx) => {
    await travarEquipe(tx, donoId);
    const ja = await tx.membroDaEquipe.findFirst({
      where: { donoId, email: { equals: email, mode: "insensitive" }, status: { not: "removido" } },
      select: { id: true, status: true, conviteExpiraEm: true },
    });
    if (ja?.status === "ativo") throw new RecusaDaEquipe("Esta pessoa já está na equipe.");

    // Convidar de novo quem tem convite válido não ocupa mais um acesso.
    const jaOcupa = ja?.status === "convidado" && ja.conviteExpiraEm && ja.conviteExpiraEm > new Date();
    if (!jaOcupa && (await acessosOcupados(donoId, tx)) >= total) {
      throw new RecusaDaEquipe(
        `O seu plano libera ${total} acessos, contando o seu, e todos estão em uso. Remova alguém ou peça um acesso extra (R$ 197 por mês cada).`,
        402
      );
    }

    return ja
      ? tx.membroDaEquipe.update({
          where: { id: ja.id },
          data: { ...dados, projetos: { deleteMany: {}, create: projetos.map((projectId) => ({ projectId })) } },
          select: { id: true },
        })
      : tx.membroDaEquipe.create({
          data: { donoId, email, status: "convidado", ...dados, projetos: { create: projetos.map((projectId) => ({ projectId })) } },
          select: { id: true },
        });
  }, ESPERA_DA_TRAVA);

  const envio = await enviarConvite({ donoNome: dono.name || dono.email, email, nome, token, expira });
  return { id: membro.id, link: envio.url, emailEnviado: envio.enviado };
}

/** Gera um link novo (o anterior para de valer) e manda de novo. */
export async function reenviarConvite(donoId: string, membroId: string) {
  const dono = await donoQuePodeAdministrar(donoId);
  const token = randomBytes(24).toString("base64url");
  const expira = new Date(Date.now() + VALIDADE_DO_CONVITE_MS);
  const total = acessosDaConta(dono.plan, dono.acessosExtras, dono.admin);
  // Convite VENCIDO não ocupa acesso; reenviar faz ele voltar a ocupar. Sem a
  // conferência, vencer um convite, convidar outra pessoa na vaga e reenviar o
  // primeiro deixava a equipe com um acesso a mais (01/10, acabamento).
  const m = await prisma.$transaction(async (tx) => {
    await travarEquipe(tx, donoId);
    const c = await tx.membroDaEquipe.findFirst({
      where: { id: membroId, donoId, status: "convidado" },
      select: { id: true, email: true, nome: true, conviteExpiraEm: true },
    });
    if (!c) throw new RecusaDaEquipe("Convite não encontrado.", 404);
    const ocupava = Boolean(c.conviteExpiraEm && c.conviteExpiraEm > new Date());
    if (!ocupava && (await acessosOcupados(donoId, tx, c.id)) >= total) {
      throw new RecusaDaEquipe(
        `O seu plano libera ${total} acessos, contando o seu, e todos estão em uso. Remova alguém ou peça um acesso extra (R$ 197 por mês cada).`,
        402
      );
    }
    await tx.membroDaEquipe.update({ where: { id: c.id }, data: { tokenHash: hashDoToken(token), conviteExpiraEm: expira } });
    return c;
  }, ESPERA_DA_TRAVA);
  const envio = await enviarConvite({ donoNome: dono.name || dono.email, email: m.email, nome: m.nome, token, expira });
  return { link: envio.url, emailEnviado: envio.enviado };
}

/** Projetos liberados e tetos de um membro (ou de um convite ainda não aceito). */
export async function atualizarMembro(donoId: string, membroId: string, args: DadosDoMembro) {
  await donoQuePodeAdministrar(donoId);
  const m = await prisma.membroDaEquipe.findFirst({ where: { id: membroId, donoId, status: { not: "removido" } }, select: { id: true } });
  if (!m) throw new RecusaDaEquipe("Membro não encontrado.", 404);
  const data: Record<string, unknown> = {};
  if ("tetoGravacoes" in args) data.tetoGravacoes = teto(args.tetoGravacoes);
  if ("tetoCreditos" in args) data.tetoCreditos = teto(args.tetoCreditos);
  if ("todosOsProjetos" in args) data.todosOsProjetos = args.todosOsProjetos === true;
  if ("projetos" in args) {
    const projetos = await projetosDoDono(donoId, args.projetos);
    data.projetos = { deleteMany: {}, create: projetos.map((projectId) => ({ projectId })) };
  }
  await prisma.membroDaEquipe.update({ where: { id: m.id }, data });
}

/**
 * TIRA O ACESSO. Convite pendente some; membro ativo vira "removido", que
 * guarda o consumo dele no histórico. As sessões dele são encerradas: o acesso
 * a projeto já cairia na próxima requisição, mas tirar a sessão faz a saída
 * valer na hora, inclusive em abas abertas.
 */
export async function removerMembro(donoId: string, membroId: string) {
  await donoQuePodeAdministrar(donoId);
  const m = await prisma.membroDaEquipe.findFirst({ where: { id: membroId, donoId, status: { not: "removido" } }, select: { id: true, status: true, userId: true } });
  if (!m) throw new RecusaDaEquipe("Membro não encontrado.", 404);
  if (m.status === "convidado") {
    await prisma.membroDaEquipe.delete({ where: { id: m.id } });
    return;
  }
  await prisma.$transaction([
    prisma.membroDaEquipe.update({ where: { id: m.id }, data: { status: "removido", removidoEm: new Date(), tokenHash: null } }),
    prisma.acessoAoProjeto.deleteMany({ where: { membroId: m.id } }),
    ...(m.userId ? [prisma.session.deleteMany({ where: { userId: m.userId } })] : []),
  ]);
}

export type ConviteNaTela =
  | { valido: false; motivo: string }
  | { valido: true; email: string; nome: string | null; quemConvida: string; expira: string };

/** O que a página do convite mostra, a partir do token do link. */
export async function lerConvite(token: string): Promise<ConviteNaTela> {
  if (!token || token.length > 200) return { valido: false, motivo: "Este link de convite não é válido." };
  const m = await prisma.membroDaEquipe.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: { email: true, nome: true, status: true, conviteExpiraEm: true, dono: { select: { name: true, email: true } } },
  });
  if (!m || m.status !== "convidado") return { valido: false, motivo: "Este convite já foi usado ou foi cancelado. Peça um novo a quem convidou você." };
  if (!m.conviteExpiraEm || m.conviteExpiraEm <= new Date()) return { valido: false, motivo: "Este convite venceu. Peça um novo a quem convidou você." };
  return { valido: true, email: m.email, nome: m.nome, quemConvida: m.dono.name || m.dono.email, expira: m.conviteExpiraEm.toISOString() };
}

/**
 * O ACEITE. Liga o convite a quem está logado, com quatro travas:
 *
 * 1. o e-mail da sessão é o do convite (o link sozinho não basta: e-mail
 *    encaminhado não pode virar acesso de outra pessoa);
 * 2. quem aceita não tem plano próprio nem é acesso interno: o gasto do membro
 *    sai da conta do dono, e uma conta com plano tem saldo e cobrança próprios;
 * 3. quem aceita não tem projeto próprio: projeto dele usado como membro seria
 *    pago pelo dono (lib/equipe/conta.ts depende disto);
 * 4. não é membro ativo de outra equipe (a conta que paga seria ambígua).
 */
export async function aceitarConvite(token: string, userId: string): Promise<{ donoId: string }> {
  const hash = hashDoToken(token);
  const m = await prisma.membroDaEquipe.findUnique({
    where: { tokenHash: hash },
    select: { id: true, email: true, status: true, conviteExpiraEm: true, donoId: true },
  });
  if (!m || m.status !== "convidado") throw new RecusaDaEquipe("Este convite já foi usado ou foi cancelado.", 404);
  if (!m.conviteExpiraEm || m.conviteExpiraEm <= new Date()) throw new RecusaDaEquipe("Este convite venceu. Peça um novo a quem convidou você.", 410);
  const eu = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, plan: true, role: true, _count: { select: { projects: true } } } });
  if (!eu) throw new RecusaDaEquipe("Entre na sua conta para aceitar.", 401);
  if (eu.email.toLowerCase() !== m.email.toLowerCase()) {
    throw new RecusaDaEquipe(`Este convite é para ${m.email}. Entre com esse e-mail para aceitar.`, 403);
  }
  if (m.donoId === userId) throw new RecusaDaEquipe("Você já é o dono desta conta.");
  if (eu.role === "admin" || (eu.plan && eu.plan !== "free")) {
    throw new RecusaDaEquipe("Esta conta já tem plano próprio. Para entrar na equipe, use outro e-mail ou fale com o nosso suporte.", 409);
  }
  if (eu._count.projects > 0) {
    throw new RecusaDaEquipe("Esta conta já tem projetos próprios. Para entrar na equipe, use outro e-mail ou fale com o nosso suporte.", 409);
  }
  if (await membroAtivo(userId)) throw new RecusaDaEquipe("Você já faz parte de outra equipe. Saia dela antes de aceitar este convite.", 409);

  /**
   * A VAGA, CONFERIDA E OCUPADA NUMA TRANSAÇÃO SÓ (01/10, acabamento).
   *
   * Até aqui o aceite só trocava o status, confiando que o convite já tinha
   * reservado a vaga. Não bastava: convites vencidos e reenviados, plano que
   * desceu de tamanho e dois aceites no mesmo instante deixavam a equipe com
   * mais acessos ativos do que o plano paga. Agora a linha do dono é travada
   * (travarEquipe), o convite é relido já dentro da trava (outro aceite pode
   * ter usado o mesmo link no meio) e os ATIVOS são contados com ele dentro.
   * O segundo aceite simultâneo espera o primeiro e conta de novo.
   */
  return prisma.$transaction(async (tx) => {
    await travarEquipe(tx, m.donoId);
    const conv = await tx.membroDaEquipe.findUnique({
      where: { id: m.id },
      select: { status: true, tokenHash: true, conviteExpiraEm: true },
    });
    if (!conv || conv.status !== "convidado" || conv.tokenHash !== hash) {
      throw new RecusaDaEquipe("Este convite já foi usado ou foi cancelado.", 404);
    }
    if (!conv.conviteExpiraEm || conv.conviteExpiraEm <= new Date()) {
      throw new RecusaDaEquipe("Este convite venceu. Peça um novo a quem convidou você.", 410);
    }
    const dono = await tx.user.findUniqueOrThrow({
      where: { id: m.donoId },
      select: { name: true, email: true, plan: true, role: true, acessosExtras: true },
    });
    const nomeDoDono = dono.name?.trim() || dono.email;
    const admin = dono.role === "admin";
    if (!admin && (!dono.plan || dono.plan === "free")) {
      throw new RecusaDaEquipe(fraseDaAssinaturaPausada(nomeDoDono), 409);
    }
    const total = acessosDaConta(dono.plan, dono.acessosExtras, admin);
    const ativos = await tx.membroDaEquipe.count({ where: { donoId: m.donoId, status: "ativo" } });
    // O dono, os ativos e quem está aceitando agora.
    if (1 + ativos + 1 > total) {
      throw new RecusaDaEquipe(
        `Todos os ${total} acessos da equipe de ${nomeDoDono} já estão em uso. Peça a ${nomeDoDono} para liberar um acesso e mandar o convite de novo.`,
        409
      );
    }
    if (await membroAtivo(userId, tx)) {
      throw new RecusaDaEquipe("Você já faz parte de outra equipe. Saia dela antes de aceitar este convite.", 409);
    }
    await tx.membroDaEquipe.update({
      where: { id: m.id },
      data: { status: "ativo", userId, aceitoEm: new Date(), tokenHash: null, conviteExpiraEm: null },
    });
    return { donoId: m.donoId };
  }, ESPERA_DA_TRAVA);
}

/** O PAINEL DE CONSUMO do dono, ou o resumo de quem é membro. */
export async function equipeNaTela(userId: string): Promise<EquipeNaTela> {
  const souMembro = await membroAtivo(userId);
  if (souMembro) {
    const dono = await prisma.user.findUniqueOrThrow({ where: { id: souMembro.donoId }, select: { name: true, email: true, creditsResetAt: true } });
    const consumo = await consumoDoMembro(souMembro.donoId, userId, cicloAtual(dono.creditsResetAt).inicio);
    return { papel: "membro", dono: dono.name || dono.email, tetoGravacoes: souMembro.tetoGravacoes, tetoCreditos: souMembro.tetoCreditos, consumo };
  }

  const dono = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, plan: true, role: true, acessosExtras: true, creditsResetAt: true, creditsBalance: true, videoCredits: true },
  });
  const admin = dono.role === "admin";
  const ciclo = cicloAtual(dono.creditsResetAt);
  const [membros, projetos, uso] = await Promise.all([
    prisma.membroDaEquipe.findMany({
      where: { donoId: userId, status: { in: ["ativo", "convidado"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        nome: true,
        status: true,
        userId: true,
        conviteExpiraEm: true,
        todosOsProjetos: true,
        tetoGravacoes: true,
        tetoCreditos: true,
        projetos: { select: { projectId: true } },
        usuario: { select: { name: true } },
      },
    }),
    prisma.project.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    usoDeGravacoes(userId),
  ]);

  // O consumo de todos de uma vez, agrupado por quem fez: uma consulta por
  // painel, e não uma por membro.
  const [porAutor, gravPorAutor] = await Promise.all([
    prisma.creditTransaction.groupBy({
      by: ["autorId"],
      where: { userId, carteira: "plano", createdAt: { gte: ciclo.inicio } },
      _sum: { amount: true },
    }),
    prisma.creditTransaction.groupBy({
      by: ["autorId"],
      where: { userId, operation: "gravacao_enviada", createdAt: { gte: ciclo.inicio } },
      _count: { _all: true },
    }),
  ]);
  // Do dono: só débitos e estornos (renovação e recarga não são consumo).
  const somaDoDono = await prisma.creditTransaction.aggregate({
    where: { userId, autorId: null, carteira: "plano", createdAt: { gte: ciclo.inicio }, operation: { notIn: ["renovacao", "recarga", "ajuste_admin", "acesso_extra", "compra_video", "plano_video"] } },
    _sum: { amount: true },
  });
  const creditosDe = (autor: string | null) => Math.max(0, -(porAutor.find((p) => p.autorId === autor)?._sum.amount ?? 0));
  const gravacoesDe = (autor: string | null) => gravPorAutor.find((p) => p.autorId === autor)?._count._all ?? 0;

  const temPlano = Boolean(dono.plan && dono.plan !== "free");
  const publico = PLANOS_PUBLICOS.find((p) => p.id === dono.plan);
  const agora = new Date();
  return {
    papel: "dono",
    plano: admin ? "Acesso interno" : (publico?.nome ?? null),
    acessos: {
      inclusos: admin ? 50 : temPlano ? (ACESSOS_INCLUSOS[dono.plan] ?? 1) : 1,
      extras: dono.acessosExtras,
      total: acessosDaConta(dono.plan, dono.acessosExtras, admin),
      ocupados: await acessosOcupados(userId),
    },
    conta: {
      nome: dono.name || dono.email,
      creditos: dono.creditsBalance,
      creditosDoCiclo: creditosDoCiclo(PLANS[dono.plan as keyof typeof PLANS]?.credits ?? 0, dono.acessosExtras),
      creditosDeVideo: dono.videoCredits,
      gravacoesUsadas: uso.usadas,
      gravacoesDoCiclo: uso.limite || gravacoesDoCiclo(publico?.gravacoesPorMes ?? 0, dono.acessosExtras),
      renovaEm: uso.renovaEm,
      consumoDoDono: { creditos: Math.max(0, -(somaDoDono._sum.amount ?? 0)), gravacoes: gravacoesDe(null) },
      // Quem saiu da equipe neste ciclo continua tendo gastado da conta: a
      // soma aparece numa linha só, para o painel fechar com a cota (01/10).
      consumoDeQuemSaiu: (() => {
        const vivos = new Set(membros.map((m) => m.userId).filter(Boolean) as string[]);
        const autores = new Set([...porAutor.map((p) => p.autorId), ...gravPorAutor.map((p) => p.autorId)].filter((a): a is string => Boolean(a) && !vivos.has(a as string)));
        let creditos = 0;
        let gravacoes = 0;
        for (const a of autores) {
          creditos += creditosDe(a);
          gravacoes += gravacoesDe(a);
        }
        return { creditos, gravacoes };
      })(),
    },
    projetos: projetos.map((p) => ({ id: p.id, nome: p.name })),
    membros: membros.map((m) => ({
      id: m.id,
      email: m.email,
      nome: m.usuario?.name ?? m.nome,
      status: m.status as "convidado" | "ativo",
      convitevencido: m.status === "convidado" && (!m.conviteExpiraEm || m.conviteExpiraEm <= agora),
      todosOsProjetos: m.todosOsProjetos,
      projetos: m.projetos.map((p) => p.projectId),
      tetoGravacoes: m.tetoGravacoes,
      tetoCreditos: m.tetoCreditos,
      consumo: m.userId ? { creditos: creditosDe(m.userId), gravacoes: gravacoesDe(m.userId) } : { creditos: 0, gravacoes: 0 },
    })),
  };
}
