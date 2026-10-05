export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { googleAgendaConfigurado, uriDeRetorno } from "@/lib/agenda/google";
import { janelasValidas } from "@/lib/agenda/janelas";
import { whatsappLigado } from "@/lib/whatsapp/enviar";
import { numeroNaTela } from "@/lib/whatsapp/numero";
import { AgendaDoTime, type ReuniaoNoAdmin, type PessoaNoAdmin } from "@/components/admin/agenda-do-time";
import type { Resultado } from "@/lib/calculadora/custos";

/**
 * A AGENDA DO TIME NO ADMIN (01/10): as demonstrações marcadas, com a ficha
 * do lead e o resultado da calculadora, e a configuração de quem atende
 * (janelas, antecedência, intervalo, sala, iCal e contas Google).
 *
 * Server component: a leitura desce pronta e sem segredo nenhum (o token do
 * Google e o endereço iCal ficam no servidor); o componente de cliente só
 * edita e chama /api/admin/agenda.
 */
export default async function AgendaAdminPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const { google } = await searchParams;
  const desde = new Date(Date.now() - 14 * 86400000);

  const [pessoas, reunioes] = await Promise.all([
    prisma.pessoaDoTime.findMany({ orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { contasGoogle: { orderBy: { createdAt: "asc" } } } }),
    prisma.reuniaoDeDemonstracao.findMany({
      where: { OR: [{ inicio: { gte: desde } }, { status: "marcada" }] },
      orderBy: { inicio: "asc" },
      include: {
        lead: true,
        pessoa: { select: { nome: true } },
        // A régua de alertas (01/10): o que já saiu para cada reunião.
        alertas: { orderBy: { createdAt: "asc" }, select: { tipo: true, situacao: true, sequencia: true, detalhe: true, createdAt: true } },
      },
      take: 200,
    }),
  ]);

  const paraTela: PessoaNoAdmin[] = pessoas.map((p) => ({
    id: p.id,
    nome: p.nome,
    emailUsuario: p.emailUsuario,
    emailAgenda: p.emailAgenda,
    ativo: p.ativo,
    fonte: p.fonte === "google" ? "google" : "manual",
    janelas: janelasValidas(p.janelas),
    antecedenciaMin: p.antecedenciaMin,
    intervaloMin: p.intervaloMin,
    linkSala: p.linkSala,
    whatsapp: p.whatsapp ? numeroNaTela(p.whatsapp) : null,
    temIcal: Boolean(p.icalCifrado),
    observacao: p.observacao,
    ordem: p.ordem,
    contas: p.contasGoogle.map((c) => ({
      id: c.id,
      emailGoogle: c.emailGoogle,
      agendas: Array.isArray(c.agendas) ? (c.agendas as unknown[]).filter((x): x is string => typeof x === "string") : [],
      principal: c.principal,
      ultimoErro: c.ultimoErro,
      ultimoErroEm: c.ultimoErroEm?.toISOString() ?? null,
    })),
  }));

  // O onboarding (05/10) mostra o número do contrato no cartão: a reunião
  // guarda só o id, sem relação, então o número vem numa leitura à parte.
  const idsDeContrato = [...new Set(reunioes.map((r) => r.contratoId).filter((x): x is string => Boolean(x)))];
  const contratos = idsDeContrato.length
    ? await prisma.contrato.findMany({ where: { id: { in: idsDeContrato } }, select: { id: true, numero: true, userId: true } })
    : [];
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]));

  const reunioesNaTela: ReuniaoNoAdmin[] = reunioes.map((r) => {
    const calc = r.lead.calculadora as Resultado | null;
    const contrato = r.contratoId ? contratoPorId.get(r.contratoId) : null;
    return {
      id: r.id,
      inicio: r.inicio.toISOString(),
      status: r.status,
      tipo: r.tipo === "onboarding" ? "onboarding" : "demonstracao",
      contrato: contrato ? { numero: contrato.numero, userId: contrato.userId } : null,
      escolha: r.escolha,
      fonte: r.fonte,
      teste: r.teste,
      linkReuniao: r.linkReuniao,
      pessoa: r.pessoa.nome,
      criadaEm: r.createdAt.toISOString(),
      comecouEm: r.comecouEm?.toISOString() ?? null,
      leadEntrouEm: r.leadEntrouEm?.toISOString() ?? null,
      alertas: r.alertas
        .filter((a) => a.sequencia === r.sequencia)
        .map((a) => {
          const envios = ((a.detalhe as { envios?: Array<{ canal: string; ok: boolean; simulado?: boolean; bloqueado?: boolean }> } | null)?.envios ?? []);
          return {
            tipo: a.tipo,
            situacao: a.situacao,
            em: a.createdAt.toISOString(),
            email: envios.filter((e) => e.canal === "email" && e.ok).length,
            whatsapp: envios.filter((e) => e.canal === "whatsapp" && e.ok && !e.simulado).length,
            whatsappSimulado: envios.filter((e) => e.canal === "whatsapp" && e.simulado).length,
            falhas: envios.filter((e) => !e.ok && !e.bloqueado).length,
          };
        }),
      lead: {
        email: r.lead.email,
        nome: r.lead.nome,
        empresa: r.lead.empresa,
        telefone: r.lead.telefone,
        cargo: r.lead.cargo,
        setor: r.lead.setor,
        faturamento: r.lead.faturamento,
        tamanhoTime: r.lead.tamanhoTime,
        origem: r.lead.origem,
        cta: r.lead.cta,
      },
      calculadora:
        calc && calc.demandou && Array.isArray(calc.cenarios)
          ? {
              plano: calc.demandou.nome,
              mensal: calc.demandou.mensal,
              volume: `${calc.volume.textos} textos, ${calc.volume.artes} artes, ${calc.volume.cortes} vídeos curtos, ${calc.volume.longos} longos por mês`,
              cenarios: calc.cenarios.map((c) => ({ nome: c.nome, mensal: c.mensal })),
              economiaTime: calc.economia[0]?.reais ?? 0,
              economiaPct: calc.economia[0]?.porcento ?? 0,
            }
          : null,
    };
  });

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Agenda do time
        </h1>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Demonstrações: o lead escolhe o horário em /demonstracao e o sistema escolhe quem atende pelo rodízio entre quem está livre.
        Onboardings: o cliente do contrato ativado escolhe o horário pelo link do e-mail de boas-vindas, sempre com o Bruno.
      </p>
      <AgendaDoTime
        pessoas={paraTela}
        reunioes={reunioesNaTela}
        google={{ configurado: googleAgendaConfigurado(), uriDeRetorno: uriDeRetorno() }}
        whatsappLigado={whatsappLigado()}
        aviso={google ?? null}
      />
    </div>
  );
}
