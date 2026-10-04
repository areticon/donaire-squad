import { prisma } from "@/lib/db/prisma";
import { cicloAtual } from "@/lib/ciclo-de-credito";
import { creditosDoCiclo } from "@/lib/equipe/regras";
import { usoDeGravacoes } from "@/lib/limites-do-plano";
import { PLANS } from "@/lib/stripe";
import { resumoDoSuporte } from "@/lib/suporte/painel";
import { diasParaVencer, grupoDaSituacao, situacaoDoContrato, type GrupoDoGestor, type StatusDoContrato } from "@/lib/contratos/situacao";
import { nomeDoPlano } from "@/lib/contratos/contratos";

/**
 * O QUE O PAINEL DE CONTRATOS LÊ (02/10/2026): a lista de todos os contratos e
 * a ficha de um cliente (vigência, uso no ciclo, quanto ele já pagou e os
 * chamados). Só servidor; a tela recebe números prontos.
 */

export type ContratoNaLista = {
  id: string;
  numero: number;
  userId: string;
  cliente: string;
  email: string;
  plano: string;
  valorCentavos: number;
  situacao: StatusDoContrato;
  /** O grupo do gestor (04/10): rascunho, enviado, aguardando pagamento, pago e ativo, vencido, cancelado. */
  grupo: GrupoDoGestor;
  inicio: string | null;
  fim: string | null;
  dias: number | null;
  provedorSituacao: string | null;
  /** Quanto já entrou, em centavos (pagamentos registrados e do Stripe). */
  pagoCentavos: number;
  pagoEm: string | null;
  formaDePagamento: string | null;
};

export async function contratosDoPainel(agora = new Date()): Promise<ContratoNaLista[]> {
  const lista = await prisma.contrato.findMany({
    orderBy: [{ fimVigencia: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: { user: { select: { email: true, name: true } }, pagamentos: { select: { valorCentavos: true } } },
  });
  return lista.map((c) => ({
    id: c.id,
    numero: c.numero,
    userId: c.userId,
    cliente: c.empresa ?? c.user.name ?? c.user.email,
    email: c.user.email,
    plano: nomeDoPlano(c.plano),
    valorCentavos: c.valorCentavos,
    situacao: situacaoDoContrato(c, agora),
    grupo: grupoDaSituacao(situacaoDoContrato(c, agora)),
    inicio: c.inicioVigencia?.toISOString() ?? null,
    fim: c.fimVigencia?.toISOString() ?? null,
    dias: diasParaVencer(c, agora),
    provedorSituacao: c.provedorSituacao,
    pagoCentavos: c.pagamentos.reduce((s, p) => s + p.valorCentavos, 0),
    pagoEm: c.pagoEm?.toISOString() ?? null,
    formaDePagamento: c.formaDePagamento,
  }));
}

export type FichaDoCliente = Awaited<ReturnType<typeof fichaDoCliente>>;

/** Soma o valor em reais escrito na nota do extrato ("Pacote x, R$ 197.00"). */
function reaisDaNota(nota: string | null): number {
  const m = nota?.match(/R\$\s*([\d.,]+)/);
  if (!m) return 0;
  const n = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
  return Number.isFinite(n) ? n : 0;
}

export async function fichaDoCliente(userId: string, agora = new Date()) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, plan: true, role: true, creditsBalance: true, videoCredits: true, creditsResetAt: true, acessosExtras: true, stripeCustomerId: true, createdAt: true },
  });
  if (!u) return null;

  const ciclo = cicloAtual(u.creditsResetAt, agora);
  const plano = PLANS[u.plan as keyof typeof PLANS] as { credits?: number } | undefined;
  const cotaDeCreditos = plano?.credits ? creditosDoCiclo(plano.credits, u.acessosExtras) : 0;

  const [contratos, gastoNoCiclo, gravacoes, publicados, publicadosTotal, pacotes, chamados] = await Promise.all([
    prisma.contrato.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { eventos: { orderBy: { createdAt: "desc" }, take: 40 }, alertas: { orderBy: { createdAt: "desc" } }, pagamentos: { orderBy: { pagoEm: "desc" } } },
    }),
    // Consumo da carteira do plano no ciclo: débitos menos estornos, sem
    // contar reposição, recarga, ajuste do admin e compras.
    prisma.creditTransaction.aggregate({
      where: {
        userId,
        carteira: "plano",
        createdAt: { gte: ciclo.inicio },
        operation: { notIn: ["renovacao", "recarga", "ajuste_admin", "acesso_extra", "compra_video", "plano_video"] },
      },
      _sum: { amount: true },
    }),
    usoDeGravacoes(userId),
    prisma.post.count({ where: { status: "published", publishedAt: { gte: ciclo.inicio }, project: { userId } } }),
    prisma.post.count({ where: { status: "published", project: { userId } } }),
    prisma.creditTransaction.findMany({ where: { userId, operation: "compra_video" }, select: { note: true } }),
    resumoDoSuporte(90, agora, userId),
  ]);

  // LTV: o que o Stripe recebeu de verdade (cobranças pagas menos devoluções),
  // com os pacotes de vídeo do extrato separados. Sem Stripe, fica o extrato.
  const pacotesReais = pacotes.reduce((s, p) => s + reaisDaNota(p.note), 0);
  // O que o contrato recebeu POR FORA do Stripe (Pix, boleto, transferência;
  // 04/10): o Stripe não sabe dele, e o LTV sem ele mentiria para baixo.
  const porFora = contratos.flatMap((c) => c.pagamentos).filter((p) => p.origem === "manual").reduce((s, p) => s + p.valorCentavos, 0) / 100;
  let stripeReais: number | null = null;
  if (u.stripeCustomerId) {
    try {
      const { getStripe } = await import("@/lib/stripe");
      const cobrancas = await getStripe().charges.list({ customer: u.stripeCustomerId, limit: 100 });
      stripeReais = cobrancas.data.filter((c) => c.paid && c.status === "succeeded").reduce((s, c) => s + (c.amount_captured - c.amount_refunded), 0) / 100;
    } catch (e) {
      console.error("[contratos] não li as cobranças do Stripe:", e);
    }
  }
  const ltv = {
    leuStripe: stripeReais !== null,
    total: (stripeReais ?? pacotesReais) + porFora,
    pacotes: pacotesReais,
    assinatura: Math.max(0, (stripeReais ?? pacotesReais) - pacotesReais) + porFora,
    porFora,
    // O valor dos contratos assinados, para comparar com o que entrou.
    contratado: contratos.filter((c) => c.status !== "cancelado" && c.assinadoEm).reduce((s, c) => s + c.valorCentavos, 0) / 100,
  };

  return {
    conta: { id: u.id, email: u.email, nome: u.name, plano: nomeDoPlano(u.plan), papel: u.role, desde: u.createdAt.toISOString(), stripe: Boolean(u.stripeCustomerId) },
    uso: {
      cicloDesde: ciclo.inicio.toISOString(),
      renovaEm: ciclo.renovaEm,
      creditosUsados: Math.max(0, -(gastoNoCiclo._sum.amount ?? 0)),
      cotaDeCreditos,
      saldo: u.creditsBalance,
      saldoDeVideo: u.videoCredits,
      gravacoes: gravacoes.usadas,
      cotaDeGravacoes: gravacoes.limite,
      publicadosNoCiclo: publicados,
      publicadosTotal,
    },
    ltv,
    chamados: { porStatus: chamados.porStatus, reclamacoes: chamados.reclamacoes, porCategoria: chamados.porCategoria },
    contratos: contratos.map((c) => ({
      id: c.id,
      numero: c.numero,
      plano: nomeDoPlano(c.plano),
      planoId: c.plano,
      valorCentavos: c.valorCentavos,
      formaDePagamento: c.formaDePagamento,
      status: c.status,
      situacao: situacaoDoContrato(c, agora),
      pagoEm: c.pagoEm?.toISOString() ?? null,
      ativadoEm: c.ativadoEm?.toISOString() ?? null,
      acessosExtras: c.acessosExtras,
      linkDePagamento: c.linkDePagamento,
      pagoCentavos: c.pagamentos.reduce((s, p) => s + p.valorCentavos, 0),
      pagamentos: c.pagamentos.map((p) => ({
        id: p.id,
        valorCentavos: p.valorCentavos,
        pagoEm: p.pagoEm.toISOString(),
        forma: p.forma,
        origem: p.origem,
        autor: p.autor,
        temComprovante: Boolean(p.comprovanteUrl),
        comprovanteNome: p.comprovanteNome,
        observacao: p.observacao,
      })),
      dias: diasParaVencer(c, agora),
      inicio: c.inicioVigencia?.toISOString() ?? null,
      fim: c.fimVigencia?.toISOString() ?? null,
      assinadoEm: c.assinadoEm?.toISOString() ?? null,
      renovacaoAutomatica: c.renovacaoAutomatica,
      renovadoDeId: c.renovadoDeId,
      empresa: c.empresa,
      signatarioNome: c.signatarioNome,
      signatarioEmail: c.signatarioEmail,
      signatarioDocumento: c.signatarioDocumento,
      provedor: c.provedor,
      provedorSituacao: c.provedorSituacao,
      linkDeAssinatura: c.linkDeAssinatura,
      modeloVersao: c.modeloVersao,
      textoHash: c.textoHash,
      temPdf: Boolean(c.pdfAssinadoUrl),
      motivoCancelamento: c.motivoCancelamento,
      observacao: c.observacao,
      eventos: c.eventos.map((e) => ({ id: e.id, tipo: e.tipo, autor: e.autor, detalhe: e.detalhe, em: e.createdAt.toISOString() })),
      alertas: c.alertas.map((a) => ({ tipo: a.tipo, situacao: a.situacao, em: a.createdAt.toISOString() })),
    })),
  };
}
