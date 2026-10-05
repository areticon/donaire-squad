import { put } from "@vercel/blob";
import type Stripe from "stripe";
import { prisma } from "@/lib/db/prisma";
import { RecusaDoContrato, nomeDoPlano, registrar, type Autor } from "@/lib/contratos/contratos";
import { FORMAS_DE_PAGAMENTO, centavosEmReais, fimDaVigencia, situacaoDoContrato } from "@/lib/contratos/situacao";
import { ehParcelado, portaDoParcelado } from "@/lib/contratos/condicao";
import { midiaPrivada } from "@/lib/media/storage";

/**
 * A PORTA DO PAGAMENTO DO CONTRATO (04/10/2026).
 *
 * Pedido do dono: quem assina um contrato NÃO É CLIENTE enquanto não paga.
 * O pagamento chega por dois caminhos, e os dois terminam na mesma função:
 *
 *  - o admin REGISTRA no gestor (Pix, boleto, transferência ou cartão, com o
 *    comprovante no store privado);
 *  - o link de pagamento do Stripe gerado para o contrato, que o webhook
 *    confirma (idempotente pelo id da sessão).
 *
 * Contrato ASSINADO e PAGO é ativado uma vez só (`ativadoEm`): a conta ganha
 * o plano e os acessos extras do contrato, os créditos do ciclo, o primeiro
 * projeto em setup (o começo da jornada de entrada) e o e-mail de boas-vindas
 * com o link de entrada. A vigência, pela cláusula 5.1, conta da confirmação
 * do pagamento. Tudo vai para a trilha do contrato, com quem fez e quando.
 *
 * Só servidor.
 */

export const COMPROVANTE_MAXIMO = 4 * 1024 * 1024;
export const TIPOS_DE_COMPROVANTE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ASSINADO = ["aguardando_pagamento", "assinado", "vigente", "a_vencer", "vencido"];

export type NovoPagamento = {
  valorCentavos: number;
  pagoEm: Date;
  forma: string;
  comprovante?: File | null;
  observacao?: string | null;
};

export async function guardarComprovante(contratoId: string, arquivo: File): Promise<string> {
  const destino = midiaPrivada();
  const ext = arquivo.type === "application/pdf" ? "pdf" : (arquivo.type.split("/")[1] ?? "bin");
  const blob = await put(`contratos/${contratoId}/comprovantes/comprovante.${ext}`, arquivo, {
    access: destino.access,
    token: destino.token,
    addRandomSuffix: true,
    contentType: arquivo.type,
  });
  return blob.url;
}

/**
 * Quanto já entrou neste contrato, em centavos. O que quita um ADITIVO
 * (04/10) fica fora: é a diferença do aditivo, e não o valor do contrato.
 */
export async function pagoNoContrato(contratoId: string): Promise<number> {
  const r = await prisma.pagamentoDoContrato.aggregate({
    where: { contratoId, aditivoId: null },
    _sum: { valorCentavos: true },
  });
  return r._sum.valorCentavos ?? 0;
}

/**
 * Lança um pagamento e, se o contrato já está assinado, ativa a conta.
 * `referencia` (id da sessão do Stripe) torna o lançamento idempotente.
 */
async function lancar(
  autor: Autor,
  contratoId: string,
  p: {
    valorCentavos: number;
    pagoEm: Date;
    forma: string;
    origem: "manual" | "stripe";
    referencia?: string | null;
    comprovanteUrl?: string | null;
    comprovanteNome?: string | null;
    observacao?: string | null;
    /** O aditivo que o pagamento quita (04/10). */
    aditivoId?: string | null;
  },
) {
  if (p.referencia) {
    const ja = await prisma.pagamentoDoContrato.findUnique({
      where: { referencia: p.referencia },
      select: { id: true },
    });
    if (ja) return { repetido: true as const };
  }
  const pg = await prisma.pagamentoDoContrato.create({
    data: {
      contratoId,
      valorCentavos: p.valorCentavos,
      pagoEm: p.pagoEm,
      forma: p.forma,
      origem: p.origem,
      referencia: p.referencia ?? null,
      comprovanteUrl: p.comprovanteUrl ?? null,
      comprovanteNome: p.comprovanteNome ?? null,
      observacao: p.observacao ?? null,
      autor: typeof autor === "string" ? autor : autor.email,
      aditivoId: p.aditivoId ?? null,
    },
  });
  // O pagamento do ADITIVO (04/10) não mexe na porta do contrato: quita a
  // diferença e, assinado, aplica a mudança na conta.
  if (p.aditivoId) {
    const { pagamentoDoAditivoLancado } = await import("@/lib/contratos/aditivos");
    const r = await pagamentoDoAditivoLancado(autor, p.aditivoId, pg.id, { valorCentavos: p.valorCentavos, pagoEm: p.pagoEm, forma: p.forma, origem: p.origem, comComprovante: Boolean(p.comprovanteUrl) });
    return { repetido: false as const, pagamentoId: pg.id, totalPagoCentavos: r.totalPagoCentavos, ativacao: r.aplicacao };
  }
  // A data do PRIMEIRO pagamento confirmado é a que abre a porta (no
  // parcelado, a da entrada, e só com a assinatura das parcelas criada).
  await abrirPorta(contratoId, p.pagoEm);
  const total = await pagoNoContrato(contratoId);
  await registrar(contratoId, autor, "pagamento_registrado", {
    pagamento: pg.id,
    valor: centavosEmReais(p.valorCentavos),
    pagoEm: p.pagoEm,
    forma: p.forma,
    origem: p.origem,
    comComprovante: Boolean(p.comprovanteUrl),
    totalPago: centavosEmReais(total),
  });
  const ativacao = await ativarSePronto(autor, contratoId);
  return {
    repetido: false as const,
    pagamentoId: pg.id,
    totalPagoCentavos: total,
    ativacao,
  };
}

/** A forma das parcelas cobradas pela assinatura do Stripe (05/10). */
export const FORMA_DA_PARCELA = "cartao_recorrente";
/** A forma do RESTANTE pago de uma vez pelo Stripe (à vista ou parcelado pelo emissor, 05/10). */
export const FORMA_DO_RESTANTE = "cartao_restante";
/** As formas que são do restante, e não da entrada. */
const FORMAS_DO_RESTANTE_PAGO = [FORMA_DA_PARCELA, FORMA_DO_RESTANTE];

/** A forma gravada no pagamento que veio do Stripe, pela parte do link (05/10). */
export function formaDoPagamentoDoStripe(parte: string | null | undefined): string {
  return parte === "restante" ? FORMA_DO_RESTANTE : "stripe";
}

/**
 * O QUE JÁ ENTROU DA ENTRADA de um contrato parcelado (05/10): tudo o que não
 * é do restante (parcela recorrente ou restante pelo Stripe) nem aditivo: o
 * Pix, boleto ou transferência registrados à mão com o comprovante, ou a
 * entrada paga no cartão pelo link do Stripe. `ultimaEm` é quando a entrada
 * se completou.
 */
export async function entradaPaga(contratoId: string): Promise<{ centavos: number; ultimaEm: Date | null }> {
  const pagos = await prisma.pagamentoDoContrato.findMany({
    where: { contratoId, aditivoId: null, forma: { notIn: FORMAS_DO_RESTANTE_PAGO } },
    select: { valorCentavos: true, pagoEm: true },
    orderBy: { pagoEm: "asc" },
  });
  return { centavos: pagos.reduce((s, p) => s + p.valorCentavos, 0), ultimaEm: pagos.at(-1)?.pagoEm ?? null };
}

/** O que já entrou do RESTANTE pago de uma vez pelo Stripe (à vista ou parcelado pelo emissor). */
export async function restantePago(contratoId: string): Promise<number> {
  const r = await prisma.pagamentoDoContrato.aggregate({ where: { contratoId, aditivoId: null, forma: FORMA_DO_RESTANTE }, _sum: { valorCentavos: true } });
  return r._sum.valorCentavos ?? 0;
}

/**
 * A PORTA DO PAGAMENTO. À vista: abre no primeiro pagamento confirmado. No
 * PARCELADO (05/10, pedido do dono): abre quando a entrada está confirmada E
 * o restante está resolvido (a assinatura das parcelas cadastrada, ou o
 * restante pago de uma vez: à vista ou parcelado pelo emissor), e a data é a
 * da entrada (a vigência conta dela, cláusula 5.1). A conta é a de
 * portaDoParcelado (lib/contratos/condicao.ts). updateMany com pagoEm null é
 * a trava contra dois eventos simultâneos.
 */
async function abrirPorta(contratoId: string, pagoEm: Date) {
  const c = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: { pagoEm: true, condicaoDePagamento: true, entradaCentavos: true, valorCentavos: true, formaDoRestante: true, assinaturaParcelasId: true },
  });
  if (!c || c.pagoEm) return;
  if (!ehParcelado(c)) {
    await prisma.contrato.updateMany({ where: { id: contratoId, pagoEm: null }, data: { pagoEm } });
    return;
  }
  const entrada = await entradaPaga(contratoId);
  const porta = portaDoParcelado({ ...c, entradaPagaCentavos: entrada.centavos, restantePagoCentavos: await restantePago(contratoId) });
  if (!porta.aberta || !entrada.ultimaEm) return;
  await prisma.contrato.updateMany({ where: { id: contratoId, pagoEm: null }, data: { pagoEm: entrada.ultimaEm } });
}

/**
 * Depois que a assinatura das parcelas nasce (webhook), a porta pode abrir
 * mesmo sem pagamento novo: a entrada pode ter chegado antes.
 */
export async function conferirPortaDoParcelado(autor: Autor, contratoId: string) {
  await abrirPorta(contratoId, new Date());
  return ativarSePronto(autor, contratoId);
}

/**
 * Lança uma PARCELA paga pela assinatura do Stripe (05/10), idempotente pelo
 * id da fatura.
 */
export async function lancarParcela(contratoId: string, p: { valorCentavos: number; pagoEm: Date; fatura: string; observacao: string }) {
  return lancar("stripe", contratoId, {
    valorCentavos: p.valorCentavos,
    pagoEm: p.pagoEm,
    forma: FORMA_DA_PARCELA,
    origem: "stripe",
    referencia: p.fatura,
    observacao: p.observacao,
  });
}

/** O admin registra um pagamento recebido por fora do Stripe. */
export async function registrarPagamento(admin: Autor, contratoId: string, n: NovoPagamento & { aditivoId?: string | null }) {
  const c = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: { status: true, assinadoEm: true },
  });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status === "cancelado") throw new RecusaDoContrato("Contrato cancelado não recebe pagamento.");
  if (!c.assinadoEm && !ASSINADO.includes(c.status)) throw new RecusaDoContrato("Registre o pagamento depois da assinatura: até lá o contrato não vale.");
  if (n.aditivoId) {
    const ad = await prisma.aditivoDoContrato.findFirst({ where: { id: n.aditivoId, contratoId }, select: { status: true } });
    if (!ad) throw new RecusaDoContrato("Aditivo não encontrado.", 404);
    if (ad.status !== "aguardando_pagamento") throw new RecusaDoContrato("Registre o pagamento do aditivo depois da assinatura dele, quando há diferença a pagar.");
  }
  if (!Number.isFinite(n.valorCentavos) || n.valorCentavos <= 0) throw new RecusaDoContrato("Informe o valor recebido.");
  if (!(FORMAS_DE_PAGAMENTO as readonly string[]).includes(n.forma)) throw new RecusaDoContrato("Escolha a forma: Pix, boleto, transferência ou cartão.");
  if (Number.isNaN(n.pagoEm.getTime())) throw new RecusaDoContrato("Informe a data do pagamento.");
  if (n.pagoEm.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new RecusaDoContrato("A data do pagamento não pode ser no futuro.");
  const arq = n.comprovante ?? null;
  if (arq && (!TIPOS_DE_COMPROVANTE.includes(arq.type) || arq.size > COMPROVANTE_MAXIMO)) {
    throw new RecusaDoContrato("O comprovante precisa ser PDF ou imagem (PNG, JPG, WebP) de até 4 MB.");
  }
  const url = arq ? await guardarComprovante(contratoId, arq) : null;
  return lancar(admin, contratoId, {
    valorCentavos: Math.round(n.valorCentavos),
    pagoEm: n.pagoEm,
    forma: n.forma,
    origem: "manual",
    comprovanteUrl: url,
    comprovanteNome: arq?.name?.slice(0, 200) ?? null,
    observacao: n.observacao?.trim().slice(0, 500) || null,
    aditivoId: n.aditivoId ?? null,
  });
}

/**
 * O PAGAMENTO QUE VEIO DO STRIPE, pelo webhook (checkout.session.completed com
 * o pagamento feito, ou async_payment_succeeded no boleto). Devolve false
 * quando a sessão não é de contrato, para o webhook seguir o caminho dele.
 */
export async function pagamentoDoStripe(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.tipo !== "contrato" || !session.metadata.contratoId) return false;
  if (session.payment_status !== "paid") return true; // boleto emitido e não pago: espera o async_payment_succeeded
  const c = await prisma.contrato.findUnique({
    where: { id: session.metadata.contratoId },
    select: { id: true, status: true },
  });
  if (!c) {
    console.error(`[contratos] pagamento do Stripe para contrato inexistente: ${session.metadata.contratoId} (sessão ${session.id})`);
    return true;
  }
  // A PARTE do contrato parcelado (05/10): "entrada" (cartão à vista pelo
  // Stripe) ou "restante" (à vista ou parcelado pelo emissor). Sem parte, é o
  // link do à vista de sempre.
  const parte = session.metadata.parte || null;
  const observacao = parte === "entrada" ? "Entrada no cartão (Stripe)" : parte === "restante" ? (session.metadata.parcelado === "emissor" ? "Restante no cartão, parcelado pelo emissor (Stripe)" : "Restante no cartão à vista (Stripe)") : null;
  await lancar("stripe", c.id, {
    aditivoId: session.metadata.aditivoId || null,
    valorCentavos: session.amount_total ?? 0,
    // A confirmação é agora: no cartão é segundos depois da sessão, e no boleto
    // é o dia da compensação, que é quando o dinheiro existe.
    pagoEm: new Date(),
    forma: formaDoPagamentoDoStripe(parte),
    origem: "stripe",
    referencia: session.id,
    observacao,
  });
  return true;
}

/**
 * O LINK DE PAGAMENTO DO STRIPE para o contrato: uma sessão de checkout de
 * pagamento único, no valor que falta, com o e-mail de quem assina. A sessão
 * do Stripe vence em 24 horas; gerar de novo troca o link.
 */
export async function gerarLinkDePagamento(admin: Autor, contratoId: string, base: string, aditivoId?: string | null) {
  const c = await prisma.contrato.findUnique({ where: { id: contratoId } });
  if (!c) throw new RecusaDoContrato("Contrato não encontrado.", 404);
  if (c.status === "cancelado") throw new RecusaDoContrato("Contrato cancelado não recebe pagamento.");
  if (!c.assinadoEm) throw new RecusaDoContrato("Gere o link depois da assinatura.");
  // O PARCELADO (05/10) tem os links dele, que não vencem (o da entrada, se
  // ela é no cartão, e o do restante): um link do total aqui cobraria o ano
  // inteiro de uma vez e quebraria a condição.
  if (!aditivoId && ehParcelado(c)) throw new RecusaDoContrato("Este contrato é de entrada mais restante: use os links da entrada e do restante na ficha do contrato (a entrada por fora é registrada com o comprovante).");
  // O ADITIVO (04/10): o link é da diferença proporcional que falta.
  const ad = aditivoId ? await prisma.aditivoDoContrato.findFirst({ where: { id: aditivoId, contratoId } }) : null;
  if (aditivoId && !ad) throw new RecusaDoContrato("Aditivo não encontrado.", 404);
  if (ad && ad.status !== "aguardando_pagamento") throw new RecusaDoContrato("O link do aditivo sai depois da assinatura, quando há diferença a pagar.");
  const pagoDoAditivo = ad ? ((await prisma.pagamentoDoContrato.aggregate({ where: { aditivoId: ad.id }, _sum: { valorCentavos: true } }))._sum.valorCentavos ?? 0) : 0;
  const falta = ad ? ad.diferencaCentavos - pagoDoAditivo : c.valorCentavos - (await pagoNoContrato(contratoId));
  if (falta <= 0) throw new RecusaDoContrato(ad ? "Este aditivo já está pago." : "Este contrato já está pago.");
  const { getStripe } = await import("@/lib/stripe");
  const n = String(c.numero).padStart(4, "0");
  const meta = { tipo: "contrato", contratoId: c.id, numero: n, ...(ad ? { aditivoId: ad.id } : {}) };
  const s = await getStripe().checkout.sessions.create({
    mode: "payment",
    currency: "brl",
    customer_email: c.signatarioEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: falta,
          product_data: {
            name: ad ? `Aditivo nº ${ad.ordem} ao contrato Demandou nº ${n}, diferença proporcional` : `Contrato Demandou nº ${n}, plano ${nomeDoPlano(c.plano)} (anual)`,
          },
        },
      },
    ],
    metadata: meta,
    payment_intent_data: {
      metadata: meta,
    },
    success_url: `${base}/aguardando-pagamento?pago=1`,
    cancel_url: `${base}/aguardando-pagamento`,
  });
  if (ad) await prisma.aditivoDoContrato.update({ where: { id: ad.id }, data: { linkDePagamento: s.url, stripeSessaoId: s.id } });
  else
    await prisma.contrato.update({
      where: { id: contratoId },
      data: { linkDePagamento: s.url, stripeSessaoId: s.id },
    });
  await registrar(contratoId, admin, ad ? "aditivo_link_de_pagamento" : "link_de_pagamento", {
    ...(ad ? { aditivo: ad.id, ordem: ad.ordem } : {}),
    sessao: s.id,
    valor: centavosEmReais(falta),
    venceEm: s.expires_at ? new Date(s.expires_at * 1000) : null,
  });
  return { link: s.url };
}

/**
 * ATIVA A CONTA quando o contrato está ASSINADO e PAGO, uma vez só. Devolve o
 * que fez, ou null quando ainda falta assinatura ou pagamento.
 */
export async function ativarSePronto(autor: Autor, contratoId: string) {
  const c = await prisma.contrato.findUnique({
    where: { id: contratoId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          role: true,
          acessosExtras: true,
        },
      },
    },
  });
  if (!c || c.status === "cancelado" || !c.assinadoEm || !c.pagoEm || c.ativadoEm) return null;

  // A vigência conta da confirmação do pagamento (cláusula 5.1), salvo data
  // combinada mais tarde (pagou adiantado para começar num dia certo).
  const inicio = c.inicioVigencia && c.inicioVigencia > c.pagoEm ? c.inicioVigencia : c.pagoEm;
  const fim = fimDaVigencia(inicio);
  const status = situacaoDoContrato({
    status: "assinado",
    inicioVigencia: inicio,
    fimVigencia: fim,
    pagoEm: c.pagoEm,
  });
  // A trava: só quem muda ativadoEm de null para agora segue.
  const trava = await prisma.contrato.updateMany({
    where: { id: contratoId, ativadoEm: null },
    data: {
      ativadoEm: new Date(),
      inicioVigencia: inicio,
      fimVigencia: fim,
      status,
    },
  });
  if (trava.count !== 1) return null;

  const u = c.user;
  const { PLANS } = await import("@/lib/stripe");
  const plano = (PLANS as Record<string, { credits?: number; videoCredits?: number }>)[c.plano];
  const extras = Math.max(u.acessosExtras, c.acessosExtras);
  // Admin é acesso interno: o plano dele não muda (e ele não paga contrato).
  if (u.role !== "admin") {
    await prisma.user.update({
      where: { id: u.id },
      data: { plan: c.plano, trialEndsAt: null, acessosExtras: extras },
    });
  }
  let creditos = 0;
  if (plano?.credits) {
    const { creditosDoCiclo } = await import("@/lib/equipe/regras");
    const { concederCiclo } = await import("@/lib/credits/ciclo");
    creditos = creditosDoCiclo(plano.credits, extras);
    // Uma vez por contrato, mesmo que a ativação rode duas vezes (05/10).
    await concederCiclo({
      userId: u.id,
      creditos,
      cotaDeVideo: plano.videoCredits ?? 0,
      chave: `contrato:${c.id}:ativacao`,
      note: `Contrato nº ${String(c.numero).padStart(4, "0")}, plano ${nomeDoPlano(c.plano)}${extras > 0 ? ` + ${extras} acesso(s) extra(s)` : ""}`,
      noteVideo: `Vídeo incluído no plano ${nomeDoPlano(c.plano)} (contrato)`,
    });
  }

  // O COMEÇO DA JORNADA DE ENTRADA: o primeiro projeto nasce em setup, e o
  // primeiro acesso cai na etapa "Seu perfil" (o mesmo caminho de quem paga
  // pelo Stripe, que o dashboard abre na primeira visita).
  const { garantirPrimeiroProjeto } = await import("@/lib/onboarding/portao");
  const projeto = await garantirPrimeiroProjeto(u.id).catch((e) => {
    console.error("[contratos] não criei o primeiro projeto:", e);
    return null;
  });

  // O E-MAIL DE BOAS-VINDAS com o link de entrada: quem nunca teve senha
  // recebe o link de escolher a senha (dentro das boas-vindas); quem já tem
  // conta com senha ou login social recebe o link de entrar.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const vinculos = await prisma.account.count({ where: { userId: u.id } });
  // O ONBOARDING (05/10): o e-mail leva o link para o cliente agendar a
  // conversa de entrada com o Bruno, quando CONTRATOS_AGENDA_URL está definida.
  const dados = { numero: c.numero, plano: nomeDoPlano(c.plano), fim, agendaUrl: process.env.CONTRATOS_AGENDA_URL?.trim() || null };
  let email = false;
  try {
    if (vinculos === 0) {
      const { marcarBoasVindas, tirarBoasVindas } = await import("@/lib/contratos/boas-vindas");
      const { auth } = await import("@/lib/auth");
      marcarBoasVindas(u.email, dados);
      try {
        await auth.api.requestPasswordReset({
          body: { email: u.email, redirectTo: "/redefinir-senha" },
        });
        // O recado foi tirado pelo envio; se ainda estiver lá, o e-mail não saiu.
        email = tirarBoasVindas(u.email) === null;
      } finally {
        tirarBoasVindas(u.email);
      }
    } else {
      const { enviarEmail } = await import("@/lib/email");
      const { boasVindasDoContrato } = await import("@/lib/email/contratos");
      email = await enviarEmail({
        ...boasVindasDoContrato({
          nome: c.signatarioNome ?? u.name,
          ...dados,
          url: `${base}/sign-in`,
          definirSenha: false,
        }),
        para: u.email,
      });
    }
  } catch (e) {
    console.error("[contratos] boas-vindas não saiu:", e);
  }

  // O fim do funil: a venda pelo contrato conta como assinatura.
  await import("@/lib/funil/eventos")
    .then(({ registrarPasso }) =>
      registrarPasso("assinatura", {
        userId: u.id,
        valorCents: c.valorCentavos,
        meta: { origem: "contrato", contrato: c.id },
      }),
    )
    .catch(() => undefined);

  await registrar(contratoId, autor, "conta_ativada", {
    plano: c.plano,
    creditos,
    acessosExtras: extras,
    inicio,
    fim,
    projeto,
    boasVindas: email ? "enviado" : "não saiu (e-mail desligado ou falhou)",
  });
  if (projeto)
    await registrar(contratoId, autor, "onboarding_iniciado", {
      projeto,
      etapa: "Seu perfil",
    });
  return { plano: c.plano, creditos, projeto, email, inicio, fim };
}

/**
 * O PORTÃO: a conta tem contrato esperando assinatura ou pagamento, e nenhum
 * contrato pago? Então ela vai para /aguardando-pagamento, e não para /planos.
 */
export async function contratoPendenteDaConta(userId: string) {
  const pendente = await prisma.contrato.findFirst({
    where: {
      userId,
      status: { in: ["enviado", "aguardando_pagamento", "assinado"] },
      pagoEm: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      numero: true,
      plano: true,
      valorCentavos: true,
      status: true,
      assinadoEm: true,
      linkDePagamento: true,
      stripeSessaoId: true,
      formaDePagamento: true,
      empresa: true,
      // O parcelado (05/10): a página do cliente mostra a condição e os links.
      condicaoDePagamento: true,
      formaDaEntrada: true,
      formaDoRestante: true,
      entradaCentavos: true,
      parcelas: true,
      parcelaCentavos: true,
      primeiraParcelaEm: true,
      assinaturaParcelasId: true,
    },
  });
  return pendente;
}

/**
 * OS CRÉDITOS MENSAIS DE QUEM PAGOU POR CONTRATO. O cron anual
 * (/api/cron/annual-credits) só enxerga assinatura do Stripe; a conta ativada
 * por contrato pago por fora ficaria com o crédito do primeiro mês e nada até
 * o ano seguinte. Aqui, a cada 30 dias da última reposição, enquanto o
 * contrato vale. Repor é idempotente no efeito (completa até o teto).
 */
export async function reporCreditosDosContratos(agora = new Date()): Promise<number> {
  const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;
  const vivos = await prisma.contrato.findMany({
    where: {
      status: { in: ["vigente", "a_vencer"] },
      pagoEm: { not: null },
      ativadoEm: { not: null },
      fimVigencia: { gt: agora },
      user: {
        OR: [{ creditsResetAt: null }, { creditsResetAt: { lt: new Date(agora.getTime() - TRINTA_DIAS) } }],
      },
    },
    include: {
      user: { select: { id: true, plan: true, acessosExtras: true } },
    },
    take: 100,
  });
  if (!vivos.length) return 0;
  const { PLANS } = await import("@/lib/stripe");
  const { creditosDoCiclo } = await import("@/lib/equipe/regras");
  const { concederCiclo } = await import("@/lib/credits/ciclo");
  // A régua roda em mais de uma instância às vezes: a chave do dia e o guarda
  // dos 30 dias, conferidos dentro da trava, concedem uma vez só (05/10).
  const dia = agora.toISOString().slice(0, 10);
  let repostos = 0;
  const vistos = new Set<string>();
  for (const c of vivos) {
    if (vistos.has(c.user.id)) continue;
    vistos.add(c.user.id);
    const plano = (PLANS as Record<string, { credits?: number; videoCredits?: number }>)[c.user.plan];
    if (!plano?.credits) continue;
    const r = await concederCiclo({
      userId: c.user.id,
      creditos: creditosDoCiclo(plano.credits, c.user.acessosExtras),
      cotaDeVideo: plano.videoCredits ?? 0,
      chave: `contrato:${c.id}:ciclo:${dia}`,
      desde: new Date(agora.getTime() - TRINTA_DIAS),
      note: `Ciclo do contrato nº ${String(c.numero).padStart(4, "0")}`,
      noteVideo: "Vídeo incluído no plano (contrato)",
    });
    if (!r.concedido) continue;
    await registrar(c.id, "sistema", "creditos_repostos", {
      plano: c.user.plan,
    });
    repostos++;
  }
  return repostos;
}
