import { prisma } from "@/lib/db/prisma";
import { cicloAtual } from "@/lib/ciclo-de-credito";
import { creditosDoCiclo } from "@/lib/equipe/regras";
import { usoDeGravacoes } from "@/lib/limites-do-plano";
import { PLANS } from "@/lib/stripe";
import { resumoDoSuporte } from "@/lib/suporte/painel";
import { diasParaVencer, grupoDaSituacao, situacaoDoContrato, type GrupoDoGestor, type StatusDoContrato } from "@/lib/contratos/situacao";
import { esperaAprovacao, nomeDoPlano } from "@/lib/contratos/contratos";
import { FORMAS_DA_ENTRADA, FORMAS_DO_RESTANTE, condicaoPorExtenso, ehParcelado, formasDoContrato, portaDoParcelado, restanteDoContrato } from "@/lib/contratos/condicao";
import { linksDoContrato } from "@/lib/contratos/links-de-pagamento";
import { FORMA_DA_PARCELA, FORMA_DO_RESTANTE } from "@/lib/contratos/pagamento";

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
  /** O preço (04/10): tabela, desconto e quem concedeu; null nos contratos de antes. */
  precoTabelaCentavos: number | null;
  descontoCentavos: number;
  descontoPercentual: number;
  descontoMotivo: string | null;
  descontoConcedidoPor: string | null;
  descontoConcedidoEm: string | null;
  esperaAprovacao: boolean;
  fundador: boolean;
  /** Entrada no Pix + parcelas no cartão (05/10). */
  parcelado: boolean;
  /** Uma parcela falhou e ainda não foi paga: a pendência do painel (05/10). */
  parcelaEmAtrasoDesde: string | null;
};

export async function contratosDoPainel(agora = new Date()): Promise<ContratoNaLista[]> {
  const lista = await prisma.contrato.findMany({
    orderBy: [{ fimVigencia: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: { user: { select: { email: true, name: true } }, pagamentos: { where: { aditivoId: null }, select: { valorCentavos: true } } },
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
    precoTabelaCentavos: c.precoTabelaCentavos,
    descontoCentavos: c.descontoCentavos,
    descontoPercentual: c.precoTabelaCentavos ? (c.descontoCentavos / c.precoTabelaCentavos) * 100 : 0,
    descontoMotivo: c.descontoMotivo,
    descontoConcedidoPor: c.descontoConcedidoPor,
    descontoConcedidoEm: c.descontoConcedidoEm?.toISOString() ?? null,
    esperaAprovacao: c.status !== "cancelado" && esperaAprovacao(c),
    fundador: c.fundador,
    parcelado: ehParcelado(c),
    parcelaEmAtrasoDesde: c.status !== "cancelado" && c.parcelaEmAtraso ? (c.parcelaEmAtrasoDesde?.toISOString() ?? agora.toISOString()) : null,
  }));
}

/**
 * OS DESCONTOS DO MÊS (04/10): quanto foi concedido no mês corrente (horário
 * de Brasília), no total e por vendedor, contando os contratos não cancelados
 * pela data em que o desconto foi concedido. Aditivos ficam fora desta conta.
 */
export function descontosDoMes(lista: ContratoNaLista[], agora = new Date()) {
  const mes = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const atual = mes(agora);
  const doMes = lista.filter((c) => c.situacao !== "cancelado" && c.descontoCentavos > 0 && c.descontoConcedidoEm && mes(new Date(c.descontoConcedidoEm)) === atual);
  const porVendedor = new Map<string, { centavos: number; contratos: number; tabela: number }>();
  for (const c of doMes) {
    const k = c.descontoConcedidoPor ?? "sem registro";
    const v = porVendedor.get(k) ?? { centavos: 0, contratos: 0, tabela: 0 };
    v.centavos += c.descontoCentavos;
    v.contratos += 1;
    v.tabela += c.precoTabelaCentavos ?? 0;
    porVendedor.set(k, v);
  }
  const tabela = doMes.reduce((t, c) => t + (c.precoTabelaCentavos ?? 0), 0);
  const total = doMes.reduce((t, c) => t + c.descontoCentavos, 0);
  return {
    mes: new Date(agora).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" }),
    totalCentavos: total,
    tabelaCentavos: tabela,
    percentualMedio: tabela > 0 ? (total / tabela) * 100 : 0,
    contratos: doMes.length,
    porVendedor: [...porVendedor.entries()].map(([vendedor, v]) => ({ vendedor, ...v, percentual: v.tabela > 0 ? (v.centavos / v.tabela) * 100 : 0 })).sort((a, b) => b.centavos - a.centavos),
    esperandoAprovacao: lista.filter((c) => c.esperaAprovacao),
  };
}

export type FichaDoCliente = Awaited<ReturnType<typeof fichaDoCliente>>;

/**
 * O BLOCO DO PARCELADO na ficha (05/10): a entrada (forma, pago e falta), o
 * restante (forma, parcelas pagas ou pago, cartão cadastrado, pendência) e
 * os links para o vendedor copiar. A porta é a mesma conta do servidor.
 */
function blocoDoParcelado(c: {
  id: string;
  valorCentavos: number;
  entradaCentavos: number | null;
  parcelas: number | null;
  parcelaCentavos: number | null;
  formaDaEntrada: string | null;
  formaDoRestante: string | null;
  primeiraParcelaEm: Date | null;
  assinaturaParcelasId: string | null;
  parcelaEmAtraso: string | null;
  parcelaEmAtrasoDesde: Date | null;
  pagamentos: Array<{ aditivoId: string | null; forma: string; valorCentavos: number }>;
}) {
  const formas = formasDoContrato(c);
  const doContrato = c.pagamentos.filter((p) => !p.aditivoId);
  const entradaPagaCentavos = doContrato.filter((p) => p.forma !== FORMA_DA_PARCELA && p.forma !== FORMA_DO_RESTANTE).reduce((t, p) => t + p.valorCentavos, 0);
  const restantePagoCentavos = doContrato.filter((p) => p.forma === FORMA_DO_RESTANTE).reduce((t, p) => t + p.valorCentavos, 0);
  const restanteCentavos = restanteDoContrato(c);
  const porta = portaDoParcelado({ ...c, entradaPagaCentavos, restantePagoCentavos });
  return {
    porExtenso:
      c.entradaCentavos && c.parcelas && c.parcelaCentavos
        ? condicaoPorExtenso({ entradaCentavos: c.entradaCentavos, restanteCentavos, parcelas: c.parcelas, parcelaCentavos: c.parcelaCentavos, ...formas, primeiraParcelaEm: c.primeiraParcelaEm })
        : "",
    entradaCentavos: c.entradaCentavos ?? 0,
    formaDaEntrada: formas.formaDaEntrada,
    nomeDaFormaDaEntrada: FORMAS_DA_ENTRADA[formas.formaDaEntrada],
    entradaPagaCentavos,
    entradaOk: porta.entradaOk,
    restanteCentavos,
    formaDoRestante: formas.formaDoRestante,
    nomeDaFormaDoRestante: FORMAS_DO_RESTANTE[formas.formaDoRestante],
    restantePagoCentavos,
    restanteOk: porta.restanteOk,
    parcelas: c.parcelas ?? 0,
    parcelaCentavos: c.parcelaCentavos ?? 0,
    parcelasPagas: doContrato.filter((p) => p.forma === FORMA_DA_PARCELA).length,
    cartaoCadastrado: Boolean(c.assinaturaParcelasId),
    parcelaEmAtrasoDesde: c.parcelaEmAtraso ? (c.parcelaEmAtrasoDesde?.toISOString() ?? null) : null,
    links: linksDoContrato({ id: c.id, ...formas }),
  };
}

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
      include: {
        eventos: { orderBy: { createdAt: "desc" }, take: 60 },
        alertas: { orderBy: { createdAt: "desc" } },
        pagamentos: { orderBy: { pagoEm: "desc" } },
        aditivos: { orderBy: { ordem: "desc" } },
      },
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
      // A CONDIÇÃO DE PAGAMENTO (05/10): entrada mais restante, por extenso,
      // com a forma e o estado de cada parte, os links (que não vencem) e a
      // pendência.
      parcelado: ehParcelado(c) ? blocoDoParcelado(c) : null,
      // O que quita aditivo fica com o aditivo (04/10).
      pagoCentavos: c.pagamentos.filter((p) => !p.aditivoId).reduce((s, p) => s + p.valorCentavos, 0),
      precoTabelaCentavos: c.precoTabelaCentavos,
      descontoCentavos: c.descontoCentavos,
      descontoPercentual: c.precoTabelaCentavos ? (c.descontoCentavos / c.precoTabelaCentavos) * 100 : 0,
      descontoMotivo: c.descontoMotivo,
      descontoObservacao: c.descontoObservacao,
      descontoConcedidoPor: c.descontoConcedidoPor,
      descontoAprovadoPor: c.descontoAprovadoPor,
      descontoAprovadoEm: c.descontoAprovadoEm?.toISOString() ?? null,
      descontoTipo: c.descontoTipo,
      descontoValor: c.descontoValor,
      esperaAprovacao: c.status !== "cancelado" && esperaAprovacao(c),
      fundador: c.fundador,
      versao: c.versao,
      inicioIso: c.inicioVigencia?.toISOString().slice(0, 10) ?? null,
      aditivos: c.aditivos.map((a) => {
        const pagos = c.pagamentos.filter((p) => p.aditivoId === a.id);
        const ant = a.anterior as unknown as { plano: string; acessosExtras: number; valorAnualCentavos: number };
        return {
          id: a.id,
          ordem: a.ordem,
          status: a.status,
          de: { plano: nomeDoPlano(ant.plano), acessosExtras: ant.acessosExtras, valorAnualCentavos: ant.valorAnualCentavos },
          plano: nomeDoPlano(a.plano),
          planoId: a.plano,
          acessosExtras: a.acessosExtras,
          precoTabelaCentavos: a.precoTabelaCentavos,
          descontoCentavos: a.descontoCentavos,
          descontoPercentual: a.precoTabelaCentavos ? (a.descontoCentavos / a.precoTabelaCentavos) * 100 : 0,
          descontoMotivo: a.descontoMotivo,
          descontoConcedidoPor: a.descontoConcedidoPor,
          descontoAprovadoPor: a.descontoAprovadoPor,
          esperaAprovacao: a.status !== "cancelado" && esperaAprovacao(a),
          fundador: a.fundador,
          valorAnualCentavos: a.valorAnualCentavos,
          valeDesde: a.valeDesde.toISOString(),
          diferencaCentavos: a.diferencaCentavos,
          diasRestantes: a.diasRestantes,
          tratamento: a.tratamento,
          provedor: a.provedor,
          provedorSituacao: a.provedorSituacao,
          linkDeAssinatura: a.linkDeAssinatura,
          textoHash: a.textoHash,
          assinadoEm: a.assinadoEm?.toISOString() ?? null,
          pagoEm: a.pagoEm?.toISOString() ?? null,
          aplicadoEm: a.aplicadoEm?.toISOString() ?? null,
          linkDePagamento: a.linkDePagamento,
          motivoCancelamento: a.motivoCancelamento,
          pagoCentavos: pagos.reduce((t, p) => t + p.valorCentavos, 0),
          pagamentos: pagos.map((p) => ({ id: p.id, valorCentavos: p.valorCentavos, pagoEm: p.pagoEm.toISOString(), forma: p.forma, autor: p.autor, temComprovante: Boolean(p.comprovanteUrl) })),
        };
      }),
      pagamentos: c.pagamentos.filter((p) => !p.aditivoId).map((p) => ({
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
