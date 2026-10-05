// Testes de lógica da condição de pagamento em duas partes (05/10/2026):
// a conta da entrada e do restante, a porta de ativação, o texto por extenso,
// os links que fazem sentido e o roteamento do pagamento do Stripe. Sem banco
// e sem Stripe real: só os módulos puros.
// Rodar: npx tsx --test scripts/testes/contratos-condicao-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CONTRATOS_LINK_SECRET = "segredo-de-teste";
process.env.NEXT_PUBLIC_APP_URL = "https://demandou.test";
delete process.env.CONTRATOS_PARCELAMENTO_EMISSOR;

const { calcularParcelamento, condicaoPorExtenso, entradaSugerida, formasDoContrato, portaDoParcelado, restanteDoContrato, rotuloDaCondicao, PARCELAS_PADRAO, CONDICAO_PARCELADA } = await import("@/lib/contratos/condicao");
const { assinaturaDoLink, linkValido, linksDoContrato, linkDoPagamento, ehParteDoPagamento, parcelamentoDoEmissorDisponivel } = await import("@/lib/contratos/links-de-pagamento");
const { condicaoDoCorpo } = await import("@/lib/contratos/formulario");
const { textoDaCondicao } = await import("@/lib/contratos/modelo");
const { linksDoPagamentoParcelado } = await import("@/lib/email/contratos");

// toLocaleString põe um espaço duro (U+00A0) depois do "R$": aqui vira espaço comum, para o teste ler.
const plano = (s: string | undefined) => (s ?? "").replace(/\u00a0/g, " ");

// ─── 1. a conta: entrada, restante e parcelas ───

test("conta: total / 12 é a entrada sugerida e 11 é o padrão de parcelas", () => {
  assert.equal(entradaSugerida(3_596_400), 299_700);
  assert.equal(PARCELAS_PADRAO, 11);
});

test("conta: restante é o total menos a entrada, dividido em 11 iguais, com a sobra de centavos na entrada", () => {
  const p = calcularParcelamento(3_596_400, 299_700, 11);
  assert.ok(!("erro" in p));
  // 3.596.400 - 299.700 = 3.296.700; / 11 = 299.700 exato
  assert.equal(p.parcelaCentavos, 299_700);
  assert.equal(p.restanteCentavos, 3_296_700);
  assert.equal(p.entradaCentavos, 299_700);
  assert.equal(p.ajusteNaEntradaCentavos, 0);
  assert.equal(p.entradaCentavos + p.restanteCentavos, 3_596_400);
});

test("conta: a sobra da divisão vai para a entrada e as parcelas ficam iguais", () => {
  const p = calcularParcelamento(100_000, 10_000, 7);
  assert.ok(!("erro" in p));
  // 90.000 / 7 = 12.857 e sobram 1 centavo
  assert.equal(p.parcelaCentavos, 12_857);
  assert.equal(p.ajusteNaEntradaCentavos, 1);
  assert.equal(p.entradaCentavos, 10_001);
  assert.equal(p.restanteCentavos, 89_999);
  assert.equal(p.entradaCentavos + p.parcelaCentavos * p.parcelas, 100_000);
});

test("conta: restante à vista força uma parcela só, sem sobra", () => {
  const p = calcularParcelamento(100_000, 10_001, 11, "cartao_a_vista");
  assert.ok(!("erro" in p));
  assert.equal(p.parcelas, 1);
  assert.equal(p.parcelaCentavos, 89_999);
  assert.equal(p.ajusteNaEntradaCentavos, 0);
});

test("conta: recusas (entrada zero, entrada maior que o total, parcelas fora de 1 a 12)", () => {
  assert.ok("erro" in calcularParcelamento(100_000, 0, 11));
  assert.ok("erro" in calcularParcelamento(100_000, 100_000, 11));
  assert.ok("erro" in calcularParcelamento(100_000, 10_000, 0));
  assert.ok("erro" in calcularParcelamento(100_000, 10_000, 13));
  assert.ok(!("erro" in calcularParcelamento(100_000, 10_000, 12)));
  assert.ok(!("erro" in calcularParcelamento(100_000, 10_000, 1)));
});

test("conta: restante gravado é o total menos a entrada", () => {
  assert.equal(restanteDoContrato({ valorCentavos: 100_000, entradaCentavos: 10_001 }), 89_999);
  assert.equal(restanteDoContrato({ valorCentavos: 100_000, entradaCentavos: null }), 100_000);
});

// ─── 2. as formas e o padrão do contrato antigo ───

test("formas: contrato parcelado sem as colunas novas vale Pix + cartão com recorrência", () => {
  assert.deepEqual(formasDoContrato({}), { formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente" });
  assert.deepEqual(formasDoContrato({ formaDaEntrada: "boleto", formaDoRestante: "cartao_a_vista" }), { formaDaEntrada: "boleto", formaDoRestante: "cartao_a_vista" });
  assert.deepEqual(formasDoContrato({ formaDaEntrada: "inventada", formaDoRestante: "outra" }), { formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente" });
});

test("formulário: o corpo traz as duas formas, e sem o campo da condição fica undefined", () => {
  const c = condicaoDoCorpo({ condicaoDePagamento: CONDICAO_PARCELADA, entradaReais: "2.997,00", formaDaEntrada: "cartao_stripe", parcelas: "11", formaDoRestante: "cartao_parcelado_emissor" });
  assert.deepEqual(c, { tipo: CONDICAO_PARCELADA, entradaCentavos: 299_700, formaDaEntrada: "cartao_stripe", parcelas: 11, formaDoRestante: "cartao_parcelado_emissor", primeiraParcelaEm: null });
  assert.deepEqual(condicaoDoCorpo({ condicaoDePagamento: "a_vista" }), { tipo: "a_vista" });
  assert.equal(condicaoDoCorpo({}), undefined);
});

test("rótulo curto da condição para o campo de forma de pagamento", () => {
  assert.equal(rotuloDaCondicao("pix", "cartao_recorrente", 11), "Entrada em Pix, restante em 11x no cartão (crédito recorrente)");
  assert.equal(rotuloDaCondicao("cartao_stripe", "cartao_a_vista", 1), "Entrada no cartão (Stripe), restante no cartão à vista (Stripe)");
});

// ─── 3. a porta de ativação ───

const base = { entradaCentavos: 10_000, valorCentavos: 100_000, assinaturaParcelasId: null as string | null, entradaPagaCentavos: 0, restantePagoCentavos: 0 };

test("porta (recorrência): abre só com a entrada paga E a assinatura cadastrada", () => {
  assert.equal(portaDoParcelado({ ...base, formaDoRestante: "cartao_recorrente" }).aberta, false);
  assert.equal(portaDoParcelado({ ...base, formaDoRestante: "cartao_recorrente", entradaPagaCentavos: 10_000 }).aberta, false);
  assert.equal(portaDoParcelado({ ...base, formaDoRestante: "cartao_recorrente", assinaturaParcelasId: "sub_1" }).aberta, false);
  const ok = portaDoParcelado({ ...base, formaDoRestante: "cartao_recorrente", entradaPagaCentavos: 10_000, assinaturaParcelasId: "sub_1" });
  assert.deepEqual(ok, { entradaOk: true, restanteOk: true, aberta: true });
  // O restante pago de uma vez não substitui a assinatura na recorrência.
  assert.equal(portaDoParcelado({ ...base, formaDoRestante: "cartao_recorrente", entradaPagaCentavos: 10_000, restantePagoCentavos: 90_000 }).aberta, false);
});

test("porta (à vista e emissor): abre com a entrada paga E o restante pago inteiro", () => {
  for (const forma of ["cartao_a_vista", "cartao_parcelado_emissor"] as const) {
    assert.equal(portaDoParcelado({ ...base, formaDoRestante: forma, entradaPagaCentavos: 10_000 }).aberta, false);
    assert.equal(portaDoParcelado({ ...base, formaDoRestante: forma, entradaPagaCentavos: 10_000, restantePagoCentavos: 89_999 }).aberta, false);
    assert.equal(portaDoParcelado({ ...base, formaDoRestante: forma, entradaPagaCentavos: 10_000, restantePagoCentavos: 90_000 }).aberta, true);
    // A assinatura não conta nessas formas.
    assert.equal(portaDoParcelado({ ...base, formaDoRestante: forma, entradaPagaCentavos: 10_000, assinaturaParcelasId: "sub_1" }).aberta, false);
  }
});

test("porta: a entrada paga em parte não abre; a paga a mais abre", () => {
  assert.equal(portaDoParcelado({ ...base, entradaPagaCentavos: 9_999, assinaturaParcelasId: "sub_1" }).entradaOk, false);
  assert.equal(portaDoParcelado({ ...base, entradaPagaCentavos: 10_500, assinaturaParcelasId: "sub_1" }).aberta, true);
});

// ─── 4. o roteamento: links e a forma do pagamento que vem do Stripe ───

test("links: a entrada por fora não tem link; no cartão tem; o restante sempre tem", () => {
  const porFora = linksDoContrato({ id: "c1", formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente" });
  assert.equal(porFora.entrada, null);
  assert.match(porFora.restante, /^https:\/\/demandou\.test\/api\/contratos\/pagar\/c1\/restante\?t=[0-9a-f]{32}$/);
  const noCartao = linksDoContrato({ id: "c1", formaDaEntrada: "cartao_stripe", formaDoRestante: "cartao_a_vista" });
  assert.match(noCartao.entrada!, /\/pagar\/c1\/entrada\?t=[0-9a-f]{32}$/);
  assert.equal(linksDoContrato({ id: "c1", formaDaEntrada: "boleto" }).entrada, null);
  assert.equal(linksDoContrato({ id: "c1", formaDaEntrada: "transferencia" }).entrada, null);
});

test("links: a assinatura é por contrato e por parte, e a parte inválida não passa", () => {
  const t = assinaturaDoLink("c1", "entrada");
  assert.equal(linkValido("c1", "entrada", t), true);
  assert.equal(linkValido("c1", "restante", t), false);
  assert.equal(linkValido("c2", "entrada", t), false);
  assert.equal(linkValido("c1", "entrada", t.slice(0, 31)), false);
  assert.equal(ehParteDoPagamento("parcelas"), false);
  assert.equal(ehParteDoPagamento("restante"), true);
  assert.equal(linkDoPagamento("c1", "restante", "https://x"), `https://x/api/contratos/pagar/c1/restante?t=${assinaturaDoLink("c1", "restante")}`);
});

test("parcelamento pelo emissor: indisponível sem a variável, disponível com ela", () => {
  assert.equal(parcelamentoDoEmissorDisponivel(), false);
  process.env.CONTRATOS_PARCELAMENTO_EMISSOR = "1";
  assert.equal(parcelamentoDoEmissorDisponivel(), true);
  delete process.env.CONTRATOS_PARCELAMENTO_EMISSOR;
});

test("roteamento do webhook: a parte 'restante' vira a forma do restante; a entrada e o à vista ficam como 'stripe'", async () => {
  // pagamento.ts importa o prisma; aqui só a função pura, importada depois dos mocks de ambiente.
  const { formaDoPagamentoDoStripe, FORMA_DO_RESTANTE, FORMA_DA_PARCELA } = await import("@/lib/contratos/pagamento");
  assert.equal(formaDoPagamentoDoStripe("restante"), FORMA_DO_RESTANTE);
  assert.equal(formaDoPagamentoDoStripe("entrada"), "stripe");
  assert.equal(formaDoPagamentoDoStripe(null), "stripe");
  assert.notEqual(FORMA_DO_RESTANTE, FORMA_DA_PARCELA);
});

// ─── 5. o texto por extenso, o contrato e o e-mail ───

const condicao = { entradaCentavos: 299_700, restanteCentavos: 3_296_700, parcelas: 11, parcelaCentavos: 299_700, primeiraParcelaEm: null };

test("por extenso: cada combinação de formas", () => {
  assert.equal(
    plano(condicaoPorExtenso({ ...condicao, formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente" })),
    "Entrada de R$ 2.997,00 via Pix, mais 11 parcelas mensais de R$ 2.997,00 no cartão de crédito em cobrança recorrente, a primeira delas um mês depois da entrada, sem comprometer o limite total do cartão",
  );
  assert.equal(
    plano(condicaoPorExtenso({ ...condicao, formaDaEntrada: "boleto", formaDoRestante: "cartao_parcelado_emissor" })),
    "Entrada de R$ 2.997,00 por boleto, mais o restante de R$ 32.967,00 no cartão de crédito, parcelado pelo emissor em até 11 vezes de R$ 2.997,00",
  );
  assert.equal(
    plano(condicaoPorExtenso({ ...condicao, formaDaEntrada: "cartao_stripe", formaDoRestante: "cartao_a_vista", parcelas: 1, parcelaCentavos: 3_296_700 })),
    "Entrada de R$ 2.997,00 no cartão de crédito à vista, pelo link do Stripe, mais o restante de R$ 32.967,00 no cartão de crédito à vista, pelo link do Stripe",
  );
  assert.match(plano(condicaoPorExtenso({ ...condicao, formaDaEntrada: "transferencia", primeiraParcelaEm: "2026-11-05T12:00:00-03:00" })), /por transferência bancária, mais 11 parcelas .* a primeira delas em 05\/11\/2026/);
});

test("texto do contrato: as duas partes, as formas e só os links que existem", () => {
  const links = { entrada: null, restante: "https://demandou.test/r" };
  const t1 = plano(textoDaCondicao({ ...condicao, formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente", links, chavePix: "contratos@demandou.com" }));
  assert.match(t1, /chave Pix contratos@demandou\.com/);
  assert.match(t1, /Cadastrar o cartão das parcelas \(restante\): https:\/\/demandou\.test\/r/);
  assert.doesNotMatch(t1, /Pagar a entrada/);
  assert.match(t1, /R\$ 2\.997,00\) mais o restante \(R\$ 32\.967,00\) somam/);
  const t2 = plano(textoDaCondicao({ ...condicao, formaDaEntrada: "cartao_stripe", formaDoRestante: "cartao_parcelado_emissor", links: { entrada: "https://demandou.test/e", restante: "https://demandou.test/r" }, chavePix: null }));
  assert.match(t2, /Pagar a entrada: https:\/\/demandou\.test\/e/);
  assert.match(t2, /Pagar o restante: https:\/\/demandou\.test\/r/);
  assert.match(t2, /parcelamento do emissor do cartão \(cláusula 6\.3\) em até 11 vezes/);
  assert.doesNotMatch(t2, /chave Pix/);
});

test("e-mail depois da assinatura: instruções e links certos para cada forma", () => {
  const comum = { nome: "Ana Souza", numero: 12, plano: "Autoridade", ...condicao };
  const pix = linksDoPagamentoParcelado({ ...comum, formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente", chavePix: "contratos@demandou.com", links: { entrada: null, restante: "https://demandou.test/r" } });
  assert.match(plano(pix.texto), /pelo Pix na chave contratos@demandou\.com/);
  assert.match(plano(pix.texto), /Cadastre o cartão das 11 parcelas/);
  assert.match(plano(pix.html), /Cadastrar o cartão das parcelas/);
  assert.doesNotMatch(plano(pix.html), /Pagar a entrada/);
  const cartao = linksDoPagamentoParcelado({ ...comum, formaDaEntrada: "cartao_stripe", formaDoRestante: "cartao_a_vista", chavePix: null, links: { entrada: "https://demandou.test/e", restante: "https://demandou.test/r" } });
  assert.match(plano(cartao.texto), /Pague a entrada \(R\$ 2\.997,00\) no cartão de crédito pelo link abaixo\.\nhttps:\/\/demandou\.test\/e/);
  assert.match(plano(cartao.texto), /Pague o restante \(R\$ 32\.967,00\) no cartão de crédito, à vista/);
  assert.match(plano(cartao.html), /Pagar a entrada/);
  assert.match(plano(cartao.html), /Pagar o restante/);
  const boleto = linksDoPagamentoParcelado({ ...comum, formaDaEntrada: "boleto", formaDoRestante: "cartao_parcelado_emissor", chavePix: null, links: { entrada: null, restante: "https://demandou.test/r" } });
  assert.match(plano(boleto.texto), /pelo boleto/);
  assert.match(plano(boleto.texto), /em quantas vezes parcelar \(até 11x/);
});
