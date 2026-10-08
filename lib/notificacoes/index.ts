import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { faltaATabela } from "@/lib/avisos/descartes";
import { enviarEmail, type Email } from "@/lib/email";
import { TIPOS_DE_APROVACAO, type NotificacaoNaTela, type TipoDeNotificacao } from "@/lib/notificacoes/tipos";

/**
 * O SINO E O E-MAIL, NUM LUGAR SÓ (02/10/2026).
 *
 * O pedido do Bruno para a segunda dos 10 vendedores: a edição de um vídeo
 * leva meia hora, e o cliente precisa poder fechar a tela sabendo que vai ser
 * chamado de volta. `notificar` é a única porta: grava o fato no sino e, se o
 * fato pede e-mail, manda UMA vez.
 *
 * ## A IDEMPOTÊNCIA É DO BANCO
 *
 * Cada fato tem uma chave por extenso ("roteiro:<video>:<rodada>"), única por
 * dono. O mesmo fato chega por dois caminhos de propósito: o passo que o
 * produziu avisa na hora, e o observador do cron (`observador.ts`) confere
 * depois, para o fato que nasceu num caminho que ninguém lembrou de avisar.
 * Quem ganha o INSERT manda o e-mail; quem perde não manda nada. Assim o
 * cliente nunca recebe dois e-mails do mesmo roteiro, por mais que o passo
 * rode duas vezes.
 *
 * ## NUNCA LANÇA
 *
 * Aviso que falha não pode derrubar o passo que avisou (o roteiro pronto, a
 * troca do completo). A falha vira log.
 */

export type Aviso = {
  userId: string;
  projectId?: string | null;
  tipo: TipoDeNotificacao;
  titulo: string;
  texto: string;
  link?: string | null;
  codigo?: string | null;
  chave: string;
  /**
   * O e-mail do fato, montado só se a notificação for nova (para não ler o
   * banco à toa). Devolve null quando o fato não tem e-mail.
   */
  email?: (dono: { nome: string | null; email: string }) => Email | null | Promise<Email | null>;
};

/** O endereço público da plataforma, sem a barra do fim. */
export function enderecoDaPlataforma(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

/**
 * Trocável nos testes (07/10): o mesmo caminho, com o banco em memória. O
 * comportamento é o de sempre; o descarte dos avisos não muda o notificar
 * (a linha nunca é apagada, e a chave única continua sendo a trava do e-mail).
 */
export type DepositoDoNotificar = {
  /** Grava a linha; lança P2002 quando a chave já existe para o dono. */
  criar(dados: { userId: string; projectId: string | null; tipo: string; titulo: string; texto: string; link: string | null; codigo: string | null; chave: string }): Promise<{ id: string }>;
  dono(userId: string): Promise<{ email: string | null; name: string | null; emailsDeAviso: boolean } | null>;
  enviar(email: Email & { para: string }): Promise<boolean>;
  marcarEmail(id: string): Promise<void>;
};

function depositoDoNotificarPadrao(): DepositoDoNotificar {
  return {
    criar: (data) => prisma.notificacao.create({ data, select: { id: true } }),
    dono: (userId) => prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailsDeAviso: true } }),
    enviar: enviarEmail,
    async marcarEmail(id) {
      await prisma.notificacao.update({ where: { id }, data: { emailEm: new Date() } });
    },
  };
}

/** O P2002 do Prisma (a chave do fato já existe), reconhecido pelo código. */
function chaveJaExiste(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  return Boolean(e && typeof e === "object" && (e as { code?: unknown }).code === "P2002");
}

export async function notificar(aviso: Aviso, dep: DepositoDoNotificar = depositoDoNotificarPadrao()): Promise<{ nova: boolean; emailEnviado: boolean }> {
  try {
    let id: string;
    try {
      const criada = await dep.criar({
        userId: aviso.userId,
        projectId: aviso.projectId ?? null,
        tipo: aviso.tipo,
        titulo: aviso.titulo.slice(0, 200),
        texto: aviso.texto.slice(0, 2000),
        link: aviso.link ?? null,
        codigo: aviso.codigo ?? null,
        chave: aviso.chave.slice(0, 300),
      });
      id = criada.id;
    } catch (e) {
      // P2002: o fato já foi avisado. Não é erro, é a trava funcionando.
      if (chaveJaExiste(e)) return { nova: false, emailEnviado: false };
      throw e;
    }

    if (!aviso.email) return { nova: true, emailEnviado: false };
    const dono = await dep.dono(aviso.userId);
    if (!dono?.email) return { nova: true, emailEnviado: false };
    // Aviso que não pede ação respeita o interruptor de Configurações; pedido
    // de aprovação sai sempre.
    if (!TIPOS_DE_APROVACAO.includes(aviso.tipo) && !dono.emailsDeAviso) return { nova: true, emailEnviado: false };
    const email = await aviso.email({ nome: dono.name, email: dono.email });
    if (!email) return { nova: true, emailEnviado: false };
    const saiu = await dep.enviar({ ...email, para: dono.email });
    if (saiu) await dep.marcarEmail(id).catch(() => {});
    return { nova: true, emailEnviado: saiu };
  } catch (e) {
    console.error(`[notificacoes] "${aviso.chave}" falhou:`, e);
    return { nova: false, emailEnviado: false };
  }
}

/** Uma linha do sino, do jeito que o banco devolve. */
export type LinhaDoSino = {
  id: string;
  tipo: string;
  titulo: string;
  texto: string;
  link: string | null;
  codigo: string | null;
  lidaEm: Date | null;
  createdAt: Date;
};

/**
 * Trocável nos testes (07/10). `comDescartes` é a consulta crua com o NOT
 * EXISTS em avisos_descartados (lista e contagem); `semDescartes` é a de
 * sempre, para quando a crua falha por qualquer motivo.
 */
export type DepositoDoSino = {
  comDescartes(userId: string, limite: number): Promise<{ linhas: LinhaDoSino[]; naoLidas: number }>;
  semDescartes(userId: string, limite: number): Promise<{ linhas: LinhaDoSino[]; naoLidas: number }>;
};

function depositoDoSinoPadrao(): DepositoDoSino {
  return {
    async comDescartes(userId, limite) {
      // O NOT EXISTS usa o índice único (userId, chave) de avisos_descartados,
      // e cobre o "descartei a faixa antes de o cron criar a notificação": a
      // notificação que nasce depois do descarte já nasce fora da lista.
      const [linhas, contagem] = await Promise.all([
        prisma.$queryRaw<LinhaDoSino[]>`
          SELECT n."id", n."tipo", n."titulo", n."texto", n."link", n."codigo", n."lidaEm", n."createdAt"
          FROM "notificacoes" n
          WHERE n."userId" = ${userId}
            AND NOT EXISTS (SELECT 1 FROM "avisos_descartados" d WHERE d."userId" = n."userId" AND d."chave" = n."chave")
          ORDER BY n."createdAt" DESC
          LIMIT ${limite}`,
        prisma.$queryRaw<{ n: number }[]>`
          SELECT COUNT(*)::int AS n
          FROM "notificacoes" n
          WHERE n."userId" = ${userId} AND n."lidaEm" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "avisos_descartados" d WHERE d."userId" = n."userId" AND d."chave" = n."chave")`,
      ]);
      return { linhas, naoLidas: Number(contagem[0]?.n ?? 0) };
    },
    async semDescartes(userId, limite) {
      const [linhas, naoLidas] = await Promise.all([
        prisma.notificacao.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: limite,
          select: { id: true, tipo: true, titulo: true, texto: true, link: true, codigo: true, lidaEm: true, createdAt: true },
        }),
        prisma.notificacao.count({ where: { userId, lidaEm: null } }),
      ]);
      return { linhas, naoLidas };
    },
  };
}

let jaAvisouDoSino = false;

/**
 * As últimas notificações de uma pessoa, e quantas não foram lidas, SEM as que
 * ela descartou (07/10). Em QUALQUER erro da consulta crua (a tabela dos
 * descartes ainda não existe, SQL recusado, pooler), registra e volta às duas
 * consultas de sempre: o sino nunca fica vazio por causa do descarte.
 */
export async function notificacoesDe(userId: string, limite = 30, dep: DepositoDoSino = depositoDoSinoPadrao()): Promise<{ itens: NotificacaoNaTela[]; naoLidas: number }> {
  let lido: { linhas: LinhaDoSino[]; naoLidas: number };
  try {
    lido = await dep.comDescartes(userId, limite);
  } catch (e) {
    if (faltaATabela(e)) {
      if (!jaAvisouDoSino) {
        jaAvisouDoSino = true;
        console.warn("[notificacoes] avisos_descartados ainda não existe; o sino segue sem o filtro dos descartes.");
      }
    } else {
      console.error("[notificacoes] a leitura com os descartes falhou; voltando à de sempre:", e instanceof Error ? e.message : e);
    }
    lido = await dep.semDescartes(userId, limite);
  }
  const { linhas, naoLidas } = lido;
  return {
    itens: linhas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      texto: n.texto,
      link: n.link,
      codigo: n.codigo,
      lida: Boolean(n.lidaEm),
      criadaEm: n.createdAt.toISOString(),
    })),
    naoLidas,
  };
}

/** Marca como lidas: uma (por id) ou todas da pessoa. Só as dela. */
export async function marcarLidas(userId: string, ids?: string[]): Promise<number> {
  const r = await prisma.notificacao.updateMany({
    where: { userId, lidaEm: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { lidaEm: new Date() },
  });
  return r.count;
}
