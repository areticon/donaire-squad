import { prisma } from "@/lib/db/prisma";
import { enviarEmail, type Email } from "@/lib/email";
import { notificar } from "@/lib/notificacoes";

/**
 * O AVISO À EQUIPE, UMA VEZ POR FATO (08/10/2026).
 *
 * O desenho é o do aviso de saldo (lib/fornecedores/aviso-de-saldo.ts): cada
 * admin ganha uma linha no sino com a chave do fato, e só quem GANHOU a linha
 * (fato novo) recebe o e-mail. O mesmo fato chega por dois caminhos de
 * propósito (o passo que falhou avisa na hora; o observador do cron confere
 * depois), e a chave única do sino é o que garante um e-mail só.
 *
 * Nasceu das falhas caladas de 07/10 no projeto Igor: a campanha fechou com
 * zero peças, o dia da semana do vídeo ficou em "AVISO:" para sempre, o vídeo
 * em "failed" esperava um clique. Nenhum desses caminhos avisava a equipe.
 *
 * Nunca lança: aviso que falha não derruba o passo que avisou.
 */

export type AvisoAosAdmins = {
  /** A chave do fato ("campanha-falhou:<run>"). A mesma chave nunca avisa duas vezes. */
  chave: string;
  /** O que o sino do admin mostra. */
  titulo: string;
  texto: string;
  /** Padrão: o painel do admin (o projeto do cliente não abre para o admin, lib/equipe/conta.ts). */
  link?: string | null;
  /** O e-mail: assunto e corpo em texto puro, com o detalhe técnico. */
  assunto: string;
  corpo: string;
};

/** Trocável nos testes: nada aqui pode tocar o banco nem mandar e-mail de verdade numa prova. */
export type DepositoDosAdmins = {
  admins(): Promise<Array<{ id: string; email: string | null }>>;
  /** Grava no sino de um admin. Devolve true só para quem ganhou a chave (fato novo). */
  sino(a: { userId: string; chave: string; titulo: string; texto: string; link: string | null }): Promise<boolean>;
  correio(e: Email): Promise<boolean>;
};

function depositoPadrao(): DepositoDosAdmins {
  return {
    admins: () => prisma.user.findMany({ where: { role: "admin" }, select: { id: true, email: true } }),
    async sino(a) {
      const r = await notificar({ userId: a.userId, tipo: "falha", titulo: a.titulo, texto: a.texto, link: a.link, chave: a.chave });
      return r.nova;
    },
    correio: enviarEmail,
  };
}

export async function avisarAdmins(aviso: AvisoAosAdmins, dep: DepositoDosAdmins = depositoPadrao()): Promise<{ avisados: number; emails: number }> {
  let avisados = 0;
  let emails = 0;
  try {
    for (const a of await dep.admins()) {
      const ganhou = await dep.sino({ userId: a.id, chave: `admin:${aviso.chave}`, titulo: aviso.titulo, texto: aviso.texto, link: aviso.link ?? "/admin" });
      if (!ganhou) continue;
      avisados++;
      if (!a.email) continue;
      if (await dep.correio({ para: a.email, assunto: aviso.assunto, texto: aviso.corpo }).catch(() => false)) emails++;
    }
  } catch (e) {
    console.error(`[aviso-aos-admins] "${aviso.chave}" falhou:`, e instanceof Error ? e.message : e);
  }
  return { avisados, emails };
}
