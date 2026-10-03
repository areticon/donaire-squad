import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { enviarEmail, type Email } from "@/lib/email";
import type { DadosDaReuniao } from "@/lib/email/agenda";
import { tokenDaReuniao, tokenDoComecou } from "@/lib/agenda/segredos";
import { numeroDoWhatsapp } from "@/lib/whatsapp/numero";

/**
 * O QUE OS AVISOS DA AGENDA PRECISAM (01/10): links assinados, destinos e o
 * envio de e-mail com o modo de teste. Saiu de lib/agenda/reunioes.ts quando a
 * régua de alertas nasceu (lib/agenda/regua.ts), para a régua e a marcação
 * usarem o mesmo código sem um importar o outro em círculo. reunioes.ts
 * reexporta tudo, então quem importava de lá continua funcionando.
 */

export function base(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

export function linkGerenciar(reuniaoId: string): string {
  return `${base()}/demonstracao/reuniao/${tokenDaReuniao(reuniaoId)}`;
}

/** Remarcar com um toque: abre direto no calendário (alerta de atraso). */
export function linkRemarcar(reuniaoId: string): string {
  return `${base()}/demonstracao/remarcar/${tokenDaReuniao(reuniaoId)}`;
}

/**
 * A sala pelo nosso endereço: registra que o lead abriu (sinal de presença) e
 * leva ao Meet. Ver app/demonstracao/sala/[token].
 */
export function linkSalaDoLead(reuniaoId: string): string {
  return `${base()}/demonstracao/sala/${tokenDaReuniao(reuniaoId)}`;
}

export function linkComecou(reuniaoId: string): string {
  return `${base()}/demonstracao/comecou/${tokenDoComecou(reuniaoId)}`;
}

export function linkAdmin(): string {
  return `${base()}/admin/agenda`;
}

/** Para onde vai o aviso do time: o e-mail da pessoa, ou a lista da demonstração enquanto ele não existe. */
export function destinosDoTime(emailAgenda: string | null): string[] {
  if (emailAgenda) return [emailAgenda];
  return (process.env.DEMONSTRACAO_AVISAR ?? "contato@demandou.com").split(",").map((e) => e.trim()).filter(Boolean);
}

/**
 * O envio da agenda. Reunião de TESTE (lead .invalid) não manda nada: grava o
 * HTML e o convite em AGENDA_PREVIA_DIR quando existe (dev local), para a
 * prova conferir o e-mail sem ninguém receber.
 */
export async function enviarDaAgenda(email: Email, teste: boolean): Promise<boolean> {
  if (!teste) return enviarEmail(email);
  const dir = process.env.AGENDA_PREVIA_DIR;
  if (dir && process.env.NODE_ENV !== "production") {
    await mkdir(dir, { recursive: true });
    const nome = `${Date.now()}-${email.assunto.normalize("NFD").replace(/[^\w]+/g, "-").slice(0, 60)}`;
    await writeFile(path.join(dir, `${nome}.html`), email.html ?? email.texto, "utf8");
    await writeFile(path.join(dir, `${nome}.txt`), `Para: ${email.para}\nAssunto: ${email.assunto}\n\n${email.texto}`, "utf8");
    for (const a of email.anexos ?? []) await writeFile(path.join(dir, `${nome}-${a.nome}`), a.conteudo, "utf8");
  }
  console.log(`[agenda] reunião de teste: "${email.assunto}" para ${email.para} NÃO enviado`);
  return false;
}

export type DadosCompletos = {
  d: DadosDaReuniao;
  teste: boolean;
  emailAgenda: string | null;
  status: string;
  sequencia: number;
  comecouEm: Date | null;
  leadEntrouEm: Date | null;
  createdAt: Date;
  eventoGoogleId: string | null;
  contaGoogleId: string | null;
  linkSalaFixa: string | null;
  pessoaId: string;
};

/** Carrega o que os e-mails e o WhatsApp precisam. */
export async function dadosDaReuniao(reuniaoId: string): Promise<DadosCompletos | null> {
  const r = await prisma.reuniaoDeDemonstracao.findUnique({
    where: { id: reuniaoId },
    include: { lead: true, pessoa: true },
  });
  if (!r) return null;
  return {
    teste: r.teste,
    emailAgenda: r.pessoa.emailAgenda,
    status: r.status,
    sequencia: r.sequencia,
    comecouEm: r.comecouEm,
    leadEntrouEm: r.leadEntrouEm,
    createdAt: r.createdAt,
    eventoGoogleId: r.eventoGoogleId,
    contaGoogleId: r.contaGoogleId,
    linkSalaFixa: r.pessoa.linkSala,
    pessoaId: r.pessoaId,
    d: {
      inicio: r.inicio,
      fim: r.fim,
      uid: r.uid,
      sequencia: r.sequencia,
      linkReuniao: r.linkReuniao,
      pessoa: { nome: r.pessoa.nome, email: r.pessoa.emailAgenda, whatsapp: numeroDoWhatsapp(r.pessoa.whatsapp) },
      lead: {
        email: r.lead.email, nome: r.lead.nome, telefone: r.lead.telefone, cargo: r.lead.cargo, setor: r.lead.setor,
        faturamento: r.lead.faturamento, tamanhoTime: r.lead.tamanhoTime, empresa: r.lead.empresa, origem: r.lead.origem,
        calculadora: r.lead.calculadora,
        whatsapp: numeroDoWhatsapp(r.lead.telefone),
      },
      linkGerenciar: linkGerenciar(r.id),
      linkRemarcar: linkRemarcar(r.id),
      linkSalaDoLead: linkSalaDoLead(r.id),
      linkComecou: linkComecou(r.id),
      linkAdmin: linkAdmin(),
    },
  };
}
