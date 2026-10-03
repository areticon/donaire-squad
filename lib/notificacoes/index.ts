import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
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

export async function notificar(aviso: Aviso): Promise<{ nova: boolean; emailEnviado: boolean }> {
  try {
    let id: string;
    try {
      const criada = await prisma.notificacao.create({
        data: {
          userId: aviso.userId,
          projectId: aviso.projectId ?? null,
          tipo: aviso.tipo,
          titulo: aviso.titulo.slice(0, 200),
          texto: aviso.texto.slice(0, 2000),
          link: aviso.link ?? null,
          codigo: aviso.codigo ?? null,
          chave: aviso.chave.slice(0, 300),
        },
        select: { id: true },
      });
      id = criada.id;
    } catch (e) {
      // P2002: o fato já foi avisado. Não é erro, é a trava funcionando.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { nova: false, emailEnviado: false };
      throw e;
    }

    if (!aviso.email) return { nova: true, emailEnviado: false };
    const dono = await prisma.user.findUnique({ where: { id: aviso.userId }, select: { email: true, name: true, emailsDeAviso: true } });
    if (!dono?.email) return { nova: true, emailEnviado: false };
    // Aviso que não pede ação respeita o interruptor de Configurações; pedido
    // de aprovação sai sempre.
    if (!TIPOS_DE_APROVACAO.includes(aviso.tipo) && !dono.emailsDeAviso) return { nova: true, emailEnviado: false };
    const email = await aviso.email({ nome: dono.name, email: dono.email });
    if (!email) return { nova: true, emailEnviado: false };
    const saiu = await enviarEmail({ ...email, para: dono.email });
    if (saiu) await prisma.notificacao.update({ where: { id }, data: { emailEm: new Date() } }).catch(() => {});
    return { nova: true, emailEnviado: saiu };
  } catch (e) {
    console.error(`[notificacoes] "${aviso.chave}" falhou:`, e);
    return { nova: false, emailEnviado: false };
  }
}

/** As últimas notificações de uma pessoa, e quantas não foram lidas. */
export async function notificacoesDe(userId: string, limite = 30): Promise<{ itens: NotificacaoNaTela[]; naoLidas: number }> {
  const [linhas, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limite,
      select: { id: true, tipo: true, titulo: true, texto: true, link: true, codigo: true, lidaEm: true, createdAt: true },
    }),
    prisma.notificacao.count({ where: { userId, lidaEm: null } }),
  ]);
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
