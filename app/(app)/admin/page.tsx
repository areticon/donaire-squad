export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { lerPainel, lerFunil, lerOrigens, lerContatos, lerAssinaturas } from "@/lib/admin/painel";
import { eixoDoTempo, lerGraficos } from "@/lib/admin/graficos-do-painel";
import { periodoDaUrl, reais, numero, soma, type ComparacaoDoPainel, type DadosDosGraficos, type DadosNoTempo } from "@/lib/admin/tipos-do-painel";
import { janelaAnterior, lerComparacao } from "@/lib/admin/comparacao-do-painel";
import { tetoDeVideosPorDia } from "@/lib/media/cota-do-dia";
import { lerUsoDeIa } from "@/lib/admin/uso-de-ia";
import { cotacao, dolares, reaisPorCredito, TETO_DE_CUSTO_POR_CREDITO } from "@/lib/admin/tipos-do-uso-de-ia";
import { lerReceitaReal, type ReceitaReal } from "@/lib/admin/receita-real";
import { NOME_DO_GRUPO as NOME_DO_GRUPO_DO_CONTRATO } from "@/lib/contratos/situacao";
import { FalhasDePublicacao } from "@/components/admin/falhas-de-publicacao";
import { GraficoNoTempo } from "@/components/admin/grafico-no-tempo";
import { AbreDobraPeloEndereco, FunilComparado, GraficoComparado, Indicador, type EtapaDoFunil } from "@/components/admin/painel-stripe";
import {
  ContasDoTime,
  CreditosFuncionando,
  CreditosPorProjeto,
  GastoDeIaPorOrigem,
  MargemPorCliente,
  PorModeloEOperacao,
} from "@/components/admin/uso-de-ia";
import {
  BarraEmpilhada,
  BarrasHorizontais,
  Cartao,
  Dobra,
  Medidor,
  Origens,
  Rosca,
  SeletorDePeriodo,
  Vazio,
} from "@/components/admin/painel-graficos";

/**
 * O PAINEL DE ADMIN (card 175, pedido em 21/08 e feito em 22/09; gráfico
 * desde 01/10; EXECUTIVO desde a noite de 05/10).
 *
 * A regra do Bruno em 05/10, à noite, que manda nesta tela:
 *  1. a primeira dobra tem POUCOS números, os que mandam: receita real, custo
 *     real de IA, margem, créditos consumidos, clientes pagantes e contratos
 *     em aberto. O resto é drill down (as dobras), fechado por padrão;
 *  2. RECEITA SÓ REAL: pagamento confirmado (Stripe pago, Pix ou
 *     transferência com comprovante). Conta da equipe, desconto de 100% ou
 *     plano sem pagamento é receita zero. Hoje nenhum cliente é pagante, e a
 *     tela mostra zero; antes mostrava a mensalidade de tabela do Gmail do
 *     Bruno como se fosse caixa;
 *  3. custo é sempre real (ai_usage, dólar convertido); projeção, quando
 *     existe, tem rótulo de projeção e fica separada;
 *  4. o período é UM só, o do seletor de cima, para a tela inteira.
 *
 * Server component de propósito: as consultas agregadas descem prontas, sem
 * rota nova. Só os gráficos no tempo são componentes de cliente.
 *
 * O ESTILO DO STRIPE (06/10): cada número da primeira dobra vem com a
 * variação contra o período anterior do mesmo tamanho e uma linha pequena com
 * o anterior tracejado; logo abaixo, os gráficos grandes com o mesmo
 * tracejado e o FUNIL de volta à vista, com a conversão entre as etapas e a
 * do período anterior. Clicar num número abre a dobra do detalhe.
 *
 * QUEM ENTRA: só `role === "admin"`, lido do banco e não de uma lista de
 * e-mails no ambiente. Quem não é admin recebe 404 e não 403: a existência da
 * rota não é assunto de quem não pode entrar.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; exemplo?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) notFound();
  const eu = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (eu?.role !== "admin") notFound();

  const sp = await searchParams;
  const dias = periodoDaUrl(sp.dias);
  // Dados de exemplo só no `next dev` (ver lib/admin/exemplo-do-painel.ts):
  // em produção o parâmetro não faz nada.
  const exemplo = process.env.NODE_ENV === "development" && sp.exemplo === "1";
  const agora = new Date();
  // Uma janela só para tudo: a meia-noite de São Paulo do primeiro dia.
  const { desde } = eixoDoTempo(dias, agora);

  // O período anterior, do mesmo tamanho, encostado no atual (06/10).
  const { desdeAnterior } = janelaAnterior(dias, agora);

  // A receita real vem primeiro porque a margem por conta precisa dela.
  const [receita, receitaAnterior] = await Promise.all([
    lerReceitaReal(desde, agora, agora),
    lerReceitaReal(desdeAnterior, desde, agora),
  ]);
  const [painel, funilReal, funilAnteriorReal, comparacaoReal, origensReais, contatos, assinaturasReais, usoDeIa, graficosReais] = await Promise.all([
    lerPainel(agora, dias, desde),
    lerFunil(desde),
    lerFunil(desdeAnterior, desde),
    lerComparacao(dias, agora, { atuais: receita.pagamentos, anteriores: receitaAnterior.pagamentos }),
    lerOrigens(desde),
    lerContatos(40),
    lerAssinaturas(),
    lerUsoDeIa(dias, agora, { receitaRealPorConta: receita.porConta }),
    lerGraficos(dias, receita.pagamentos, agora),
  ]);

  // As demonstrações marcadas: da última hora até 7 dias à frente.
  const janelaDasProximas = {
    status: "marcada",
    inicio: { gt: new Date(agora.getTime() - 3600000), lt: new Date(agora.getTime() + 7 * 86400000) },
  };
  const [demonstracoes, totalDeProximas] = await Promise.all([
    prisma.reuniaoDeDemonstracao
      .findMany({
        where: janelaDasProximas,
        orderBy: { inicio: "asc" },
        take: 5,
        include: { lead: { select: { email: true, empresa: true, cargo: true, setor: true } }, pessoa: { select: { nome: true } } },
      })
      .catch(() => []),
    prisma.reuniaoDeDemonstracao.count({ where: janelaDasProximas }).catch(() => 0),
  ]);

  const ex = exemplo ? (await import("@/lib/admin/exemplo-do-painel")).painelDeExemplo(dias, agora) : null;
  const { linhas, resumo } = ex ? { linhas: ex.linhas, resumo: ex.resumo } : painel;
  const funil = ex?.funil ?? funilReal;
  // Em exemplo, o período anterior é o próprio exemplo um pouco menor: dado
  // inventado não compara com o banco de verdade.
  const funilAnterior = ex ? ex.funil.map((p) => ({ ...p, pessoas: Math.round(p.pessoas * 0.8), eventos: Math.round(p.eventos * 0.8) })) : funilAnteriorReal;
  const comparacao: ComparacaoDoPainel = ex ? comparacaoDeExemplo(ex.graficos, comparacaoReal) : comparacaoReal;
  const origens = ex?.origens ?? origensReais;
  const assinaturas = ex?.assinaturas ?? assinaturasReais;
  const graficos = ex?.graficos ?? graficosReais;

  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" }) : "nunca";
  const dataHora = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const temDado = (d: DadosNoTempo) => d.series.some((s) => soma(s.valores) > 0);
  const passo = (nome: string) => funil.find((p) => p.passo === nome);
  const passoAnterior = (nome: string) => funilAnterior.find((p) => p.passo === nome);
  const etapasDoFunil: EtapaDoFunil[] = ETAPAS_DO_FUNIL.map((e) => ({
    ...e,
    pessoas: passo(e.chave)?.pessoas ?? 0,
    anterior: passoAnterior(e.chave)?.pessoas ?? 0,
  }));
  const visitas = passo("visita")?.pessoas ?? 0;
  const sobreVisitas = (n: number) => (visitas > 0 ? `${Math.round((n / visitas) * 100)}% das visitas` : "pessoas");
  const dolar = usoDeIa.dolar;

  // ── OS NÚMEROS QUE MANDAM ────────────────────────────────────────────────
  // Receita real: só pagamento confirmado. Em exemplo, a receita do exemplo.
  const receitaReal = ex ? soma(ex.graficos.dinheiro.series.find((s) => s.chave === "receita")?.valores ?? []) : receita.totalReais;
  // Custo real: tudo o que os fornecedores cobraram no período, com e sem projeto.
  const custoUsd = usoDeIa.totalUsd;
  const custoReal = ex ? soma(ex.graficos.dinheiro.series.find((s) => s.chave === "custo")?.valores ?? []) : custoUsd * dolar;
  const custoDeCliente = (usoDeIa.porCategoria.find((c) => c.categoria === "cliente")?.usd ?? 0) * dolar;
  const custoDaEquipe = custoReal - custoDeCliente;
  const margem = receitaReal - custoReal;
  // O período anterior, com as mesmas definições (06/10).
  const receitaAnteriorReal = ex ? soma(comparacao.receita.anterior) : receitaAnterior.totalReais;
  const custoAnterior = soma(comparacao.custo.anterior);
  const margemAnterior = receitaAnteriorReal - custoAnterior;
  const creditosConsumidos = usoDeIa.porProjeto.reduce((s, p) => s + p.creditosPlano + p.creditosVideo, 0);
  const creditosQueCustariam = usoDeIa.porProjeto.reduce((s, p) => s + p.creditosQueCustariam, 0);
  const custoComProjeto = usoDeIa.porProjeto.reduce((s, p) => s + p.custoReais, 0);
  const custoPorCredito = creditosConsumidos + creditosQueCustariam > 0 ? custoComProjeto / (creditosConsumidos + creditosQueCustariam) : null;
  const contasComCredito = new Set(usoDeIa.porProjeto.filter((p) => p.creditosPlano + p.creditosVideo + p.creditosQueCustariam > 0).map((p) => p.contaId)).size;
  const projetosComCredito = usoDeIa.porProjeto.filter((p) => p.creditosPlano + p.creditosVideo + p.creditosQueCustariam > 0).length;
  const pagantes = ex ? resumo.pagantes : receita.pagantes;
  const contratos = receita.contratos;
  const sinais =
    usoDeIa.clientes.filter((c) => c.alerta).length +
    usoDeIa.porPlano.filter((p) => p.alerta).length +
    usoDeIa.cruzamento.reduce((s, c) => s + c.vazamentos.length + c.semGasto.length, 0);

  // As contas partidas em quem são. "Equipe" é o resto.
  const internas = Math.max(0, resumo.usuarios - resumo.confirmadas - resumo.semConfirmar - resumo.suspeitas);
  const totalPorRede = graficos.publicacoes.series
    .map((s) => ({ nome: s.nome, valor: soma(s.valores), cor: s.cor }))
    .sort((a, b) => b.valor - a.valor);
  const maiorCusto = Math.max(1, ...linhas.map((l) => Math.max(l.custoIaReais, l.mensalidade)));
  const seletorExtra = exemplo ? "&exemplo=1" : "";

  const COR_DO_PLANO: Record<string, string> = {
    pro: "var(--painel-3)",
    business: "var(--painel-1)",
    studio: "var(--painel-2)",
  };
  const porPlano = new Map<string, { nome: string; valor: number; contas: number; cor: string }>();
  for (const l of linhas.filter((x) => x.mensalidade > 0 && !x.interna)) {
    const atual = porPlano.get(l.plano) ?? { nome: l.planoNome, valor: 0, contas: 0, cor: COR_DO_PLANO[l.plano] ?? "var(--painel-5)" };
    atual.valor += l.mensalidade;
    atual.contas += 1;
    porPlano.set(l.plano, atual);
  }

  const foraDaReceita = (motivo: ReceitaReal["fora"][number]["motivo"]) =>
    ({ equipe: "conta da equipe", sem_comprovante: "por fora, sem comprovante", sem_conta: "sem conta ligada" })[motivo];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <AbreDobraPeloEndereco />
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="rotulo mb-1">Gestão da plataforma</p>
            <h1 className="text-[1.75rem] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Painel
            </h1>
          </div>
          <nav aria-label="Telas de gestão" className="flex flex-wrap items-center gap-2">
            {[
              { href: "/admin/agenda", nome: `Demonstrações${totalDeProximas ? ` (${totalDeProximas})` : ""}` },
              { href: "/admin/chamados", nome: "Chamados" },
              { href: "/admin/contratos", nome: "Contratos" },
              { href: "/admin/redes", nome: "Redes dos clientes" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--realce-2)]"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-elevated)" }}
              >
                {l.nome}
              </Link>
            ))}
            <Link href="/admin/clientes" className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600">
              Clientes e ações
            </Link>
          </nav>
        </div>
        {/* O filtro manda na tela inteira, numa linha só, acima de tudo. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SeletorDePeriodo atual={dias} extra={seletorExtra} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Comparado com {comparacao.rotuloAnterior}, os {dias} dias anteriores. Horário de São Paulo; dólar a {cotacao(dolar)}.
          </p>
        </div>
      </header>

      {exemplo && (
        <p
          className="rounded-xl border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: "var(--marca-laranja)", color: "var(--marca-laranja-texto)", background: "var(--bg-elevated)" }}
        >
          Dados de exemplo, só no ambiente local: números inventados em memória, nada vem do banco nem vai para ele.
        </p>
      )}

      {!receita.leuStripe && !exemplo && (
        <p className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--badge-danger-text)", color: "var(--badge-danger-text)", background: "var(--bg-elevated)" }}>
          Não consegui ler o Stripe: a receita de cartão deste período está desconhecida, e o número abaixo só tem o que entrou por fora com comprovante.
        </p>
      )}

      {/* A PRIMEIRA DOBRA: os seis números que mandam, cada um com a variação
          contra o período anterior; o clique abre o detalhe. */}
      <section aria-label="Visão executiva" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Indicador
          destaque
          rotulo="Receita real"
          valor={reais(receitaReal, 2)}
          atual={receitaReal}
          anterior={receitaAnteriorReal}
          serie={comparacao.receita.atual}
          serieAnterior={comparacao.receita.anterior}
          acumulado
          dobra="receita"
          nota={
            exemplo
              ? "exemplo"
              : receita.pagamentos.length > 0
                ? `${receita.pagamentos.length} pagamento(s) confirmado(s); antes ${reais(receitaAnteriorReal, 2)}`
                : `nenhum pagamento confirmado no período; antes ${reais(receitaAnteriorReal, 2)}`
          }
        />
        <Indicador
          destaque
          rotulo="Custo real de IA"
          valor={reais(custoReal, 2)}
          atual={custoReal}
          anterior={custoAnterior}
          subirEhBom={false}
          serie={comparacao.custo.atual}
          serieAnterior={comparacao.custo.anterior}
          acumulado
          dobra="custo"
          nota={`${dolares(custoUsd)}; antes ${reais(custoAnterior, 2)}`}
          detalhe={
            <BarraEmpilhada
              rotulo="Custo por quem gastou"
              formatar={(v) => reais(v)}
              partes={[
                { nome: "Clientes", valor: custoDeCliente, cor: "var(--painel-1)" },
                { nome: "Equipe", valor: custoDaEquipe, cor: "var(--painel-2)" },
              ]}
            />
          }
        />
        <Indicador
          destaque
          rotulo="Margem"
          valor={reais(margem, 2)}
          atual={margem}
          anterior={margemAnterior}
          dobra="margem"
          nota={
            <span style={{ color: margem < 0 ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}>
              {receitaReal > 0 ? `${Math.round((margem / receitaReal) * 100)}% da receita real` : margem < 0 ? "prejuízo: custo sem receita" : "sem receita nem custo"}
            </span>
          }
          detalhe={
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Receita real menos custo real de IA, sem infraestrutura nem imposto. Antes: {reais(margemAnterior, 2)}.
            </p>
          }
        />
        <Indicador
          rotulo="Créditos consumidos"
          valor={numero(creditosConsumidos)}
          atual={soma(comparacao.creditos.atual)}
          anterior={soma(comparacao.creditos.anterior)}
          serie={comparacao.creditos.atual}
          serieAnterior={comparacao.creditos.anterior}
          dobra="creditos"
          nota={`${contasComCredito} conta(s) e ${projetosComCredito} projeto(s)${creditosQueCustariam > 0 ? `; mais ${numero(creditosQueCustariam)} simulados na conta de admin` : ""}`}
          detalhe={
            <p className="text-[11px] tabular-nums" style={{ color: custoPorCredito !== null && custoPorCredito > TETO_DE_CUSTO_POR_CREDITO ? "var(--badge-danger-text)" : "var(--text-muted)" }}>
              {custoPorCredito === null
                ? "Sem crédito consumido para medir o custo por crédito."
                : `${reaisPorCredito(custoPorCredito)} de IA por crédito, contra a régua de ${reaisPorCredito(TETO_DE_CUSTO_POR_CREDITO)}.`}
            </p>
          }
        />
        <Indicador
          rotulo="Clientes pagantes"
          valor={String(pagantes)}
          atual={pagantes}
          dobra="margem"
          nota="fora da equipe, com plano em vigor e pagamento confirmado"
          detalhe={
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {assinaturas.leu
                ? `No Stripe: ${assinaturas.ativas} assinatura(s) ativa(s), ${assinaturas.emTeste} em teste, ${assinaturas.saindo} saindo.`
                : "Não consegui ler as assinaturas do Stripe."}
            </p>
          }
        />
        <Indicador
          rotulo="Contratos em aberto"
          valor={String(contratos.emAberto)}
          atual={contratos.emAberto}
          dobra="receita"
          nota={`${contratos.enviados} enviado(s) · ${contratos.aguardandoPagamento} aguardando pagamento · ${contratos.rascunhos} rascunho(s)`}
          detalhe={
            <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {reais(contratos.emAbertoCentavos / 100)} contratados sem pagamento (projeção, não é caixa) · {contratos.ativos} pago(s) e ativo(s)
              {contratos.daEquipe > 0 ? ` · ${contratos.daEquipe} de conta da equipe fora da conta` : ""}.
            </p>
          }
        />
      </section>

      {/* OS GRÁFICOS GRANDES, com o período anterior tracejado. */}
      <section aria-label="Tendências do período" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoComparado
          titulo="Custo de IA, somado no período"
          atual={comparacao.custo.atual}
          anterior={comparacao.custo.anterior}
          baldes={comparacao.baldes}
          baldesAnteriores={comparacao.baldesAnteriores}
          rotuloAnterior={comparacao.rotuloAnterior}
          formato="reais"
          acumulado
          subirEhBom={false}
          cor="var(--painel-2)"
          nomeDaLinha="Total (clientes e equipe)"
          partes={{ nome: "Clientes", valores: comparacao.custoDeCliente.atual, cor: "var(--painel-1)", nomeDoResto: "Equipe e sem projeto" }}
          dobra="custo"
          nota={`Clientes no período: ${reais(soma(comparacao.custoDeCliente.atual), 2)}; antes ${reais(soma(comparacao.custoDeCliente.anterior), 2)}. Cliente é quem usa como cliente, com ou sem desconto; equipe é papel de admin, conta marcada como da equipe ou e-mail da casa.`}
        />
        <GraficoComparado
          titulo="Receita real, somada no período"
          atual={comparacao.receita.atual}
          anterior={comparacao.receita.anterior}
          baldes={comparacao.baldes}
          baldesAnteriores={comparacao.baldesAnteriores}
          rotuloAnterior={comparacao.rotuloAnterior}
          formato="reais"
          acumulado
          dobra="receita"
          nota="Só pagamento confirmado: cartão pago no Stripe, Pix e transferência com comprovante. Plano e contrato sem pagamento ficam na projeção, dentro do detalhe."
        />
        <GraficoComparado
          titulo={graficos.porSemana ? "Créditos consumidos por semana" : "Créditos consumidos por dia"}
          atual={comparacao.creditos.atual}
          anterior={comparacao.creditos.anterior}
          baldes={comparacao.baldes}
          baldesAnteriores={comparacao.baldesAnteriores}
          rotuloAnterior={comparacao.rotuloAnterior}
          altura={170}
          dobra="creditos"
          nota="As duas carteiras, plano e vídeo, líquidas de estorno e sem recarga. A conta de admin debita zero e não aparece aqui."
        />
        <GraficoComparado
          titulo={graficos.porSemana ? "Cadastros confirmados por semana" : "Cadastros confirmados por dia"}
          atual={comparacao.cadastros.atual}
          anterior={comparacao.cadastros.anterior}
          baldes={comparacao.baldes}
          baldesAnteriores={comparacao.baldesAnteriores}
          rotuloAnterior={comparacao.rotuloAnterior}
          altura={170}
          dobra="vendas"
          nota="E-mail confirmado, sem cara de robô e sem acesso de admin."
        />
      </section>

      {/* O FUNIL, de volta à vista (06/10). */}
      <Cartao
        titulo="Funil de vendas"
        subtitulo={`Pessoas, e não cliques: anônimo conta por endereço de internet (IP), quem tem conta conta pela conta. Cada etapa comparada com ${comparacao.rotuloAnterior}.`}
      >
        <FunilComparado etapas={etapasDoFunil} rotuloAnterior={comparacao.rotuloAnterior} />
        {/* As portas laterais não são fila: a pessoa pode testar a demo e
            nunca visitar, ou pedir demonstração sem deixar contato. */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { nome: "Testou a demo pública", agora: passo("demo")?.pessoas ?? 0, antes: passoAnterior("demo")?.pessoas ?? 0 },
            { nome: "Deixou contato", agora: passo("contato")?.pessoas ?? 0, antes: passoAnterior("contato")?.pessoas ?? 0 },
            { nome: "Marcou demonstração", agora: graficos.demonstracoes.marcadas, antes: null },
          ].map((porta) => (
            <div key={porta.nome} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {porta.nome}
              </p>
              <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {numero(porta.agora)}
              </p>
              <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {sobreVisitas(porta.agora)}
                {porta.antes !== null ? ` · antes ${numero(porta.antes)}` : ""}
              </p>
            </div>
          ))}
        </div>
      </Cartao>

      {/* A OPERAÇÃO DE HOJE, numa linha leve: o que precisa de olho agora,
          sem competir com os seis números de cima. */}
      <section
        aria-label="Operação de hoje"
        className="rounded-2xl border px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="min-w-0">
          <p className="rotulo">Vídeo hoje</p>
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {resumo.videosHoje} de {tetoDeVideosPorDia()}
          </p>
          <Medidor valor={resumo.videosHoje} teto={tetoDeVideosPorDia()} rotulo="Vídeos gerados hoje contra o teto do dia" />
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            {resumo.armazenamentoGb.toFixed(1)} GB guardados
          </p>
        </div>
        <div className="min-w-0">
          <p className="rotulo">Demonstrações nos próximos 7 dias</p>
          <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {totalDeProximas}
          </p>
          {demonstracoes.length > 0 ? (
            <ul className="space-y-1">
              {demonstracoes.slice(0, 3).map((d) => (
                <li key={d.id} className="flex gap-2 text-xs">
                  <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: "var(--realce-2)", color: "var(--text-primary)" }}>
                    {d.inicio.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
                    {d.lead.empresa || [d.lead.cargo, d.lead.setor].filter(Boolean).join(", ") || d.lead.email}
                    {d.teste ? " (teste)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Nenhuma marcada. Quem marcar pela página de demonstração aparece aqui e no e-mail de quem atende.
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="rotulo">Sinais a conferir</p>
          <p className="text-lg font-semibold tabular-nums" style={{ color: sinais > 0 ? "var(--badge-warning-text)" : "var(--text-primary)" }}>
            {sinais}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Margem fora do desenho, vazamento de crédito ou cobrança sem gasto. {sinais > 0 ? "Detalhe na dobra de margem, abaixo." : "Nada a conferir no período."}
          </p>
        </div>
      </section>

      {/* AS DOBRAS: o detalhe, fechado por padrão. */}

      <Dobra
        id="receita"
        titulo="Receita: cada pagamento, o que ficou fora e a projeção"
        resumo={`${reais(receitaReal, 2)} confirmados · ${receita.fora.length} lançamento(s) fora da receita · projeção de ${reais(receita.projecao.contratosPorMes + receita.projecao.mensalidadesEmVigor)} por mês`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <Cartao className="lg:col-span-3" titulo="Pagamentos confirmados no período" subtitulo="Do mais recente ao mais antigo. Cartão vem do Stripe (checkout concluído e fatura paga); Pix, boleto e transferência vêm do gestor de contratos, só com comprovante.">
            {receita.pagamentos.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-input)" }}>
                      {["Quando", "Conta", "Forma", "Valor"].map((h) => (
                        <th key={h} className="text-left font-medium px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {receita.pagamentos.map((p) => (
                      <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2 text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {dataHora(p.quando)}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: "var(--text-primary)" }}>
                          {p.conta}
                          <br />
                          <span style={{ color: "var(--text-muted)" }}>{p.descricao}</span>
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          {p.forma}
                          {p.moeda !== "brl" ? ` (${p.moeda.toUpperCase()}, convertido)` : ""}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap tabular-nums font-medium" style={{ color: "var(--badge-success-text)" }}>
                          {reais(p.reais, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vazio
                titulo="Nenhum pagamento confirmado no período"
                texto="O primeiro cliente pagante entra aqui no dia em que o cartão for cobrado ou o comprovante do Pix for aceito no gestor de contratos."
              />
            )}
            {receita.fora.length > 0 && (
              <div className="mt-3">
                <p className="rotulo mb-1">Fora da receita, de propósito</p>
                <ul className="space-y-0.5">
                  {receita.fora.slice(0, 10).map((f, i) => (
                    <li key={i} className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {dataHora(f.quando)} · {f.conta} · {reais(f.reais, 2)} · {foraDaReceita(f.motivo)} ({f.descricao})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Cartao>

          <Cartao
            className="lg:col-span-2"
            titulo="Projeção, não é caixa"
            subtitulo="O que os contratos e os planos em vigor prometem por mês. Entra na receita real só quando o pagamento for confirmado."
          >
            <div className="space-y-3">
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Contratos pagos e ativos, por mês (valor do ano dividido por 12)
                </p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {reais(receita.projecao.contratosPorMes)}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {contratos.ativos} contrato(s), {reais(contratos.ativosCentavos / 100)} no ano
                </p>
              </div>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Contratos em aberto (enviados, aguardando pagamento, rascunhos)
                </p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {reais(contratos.emAbertoCentavos / 100)}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {contratos.lista
                    .filter((c) => c.grupo === "rascunho" || c.grupo === "enviado" || c.grupo === "aguardando_pagamento")
                    .slice(0, 8)
                    .map((c) => (
                      <li key={c.id} className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                        <Link href={`/admin/contratos/${c.userId}`} className="underline-offset-2 hover:underline" style={{ color: "var(--text-primary)" }}>
                          nº {c.numero} · {c.cliente}
                        </Link>{" "}
                        · {c.plano} · {reais(c.valorCentavos / 100)} · {NOME_DO_GRUPO_DO_CONTRATO[c.grupo].toLowerCase()}
                        {c.descontoPercentual > 0 ? ` · ${Math.round(c.descontoPercentual)}% de desconto` : ""}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Mensalidade de tabela das contas com plano, fora da equipe
                </p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {reais(resumo.mrr)}
                </p>
                {porPlano.size > 0 ? (
                  <Rosca
                    centro={reais(resumo.mrr)}
                    rotuloDoCentro="de tabela"
                    formatar={(n) => reais(n)}
                    fatias={[...porPlano.values()].map((p) => ({ nome: p.nome, valor: p.valor, cor: p.cor, nota: `· ${p.contas} conta(s)` }))}
                  />
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Nenhuma conta fora da equipe tem plano hoje. As contas da equipe (admin, marcadas como da equipe ou com e-mail @demandou.com) têm plano e não contam.
                  </p>
                )}
              </div>
            </div>
          </Cartao>
        </div>

        <Cartao
          titulo="Receita real e custo de IA, dia a dia"
          subtitulo="Somas corridas no período: o que entrou confirmado contra o que os fornecedores cobraram. A distância entre as linhas é a margem."
        >
          {receitaReal > 0 || custoReal > 0 ? (
            <GraficoNoTempo
              dados={graficos.dinheiro}
              modo="linhas"
              acumulado
              formato="reais"
              rotulo={`Receita real e custo de IA acumulados nos últimos ${dias} dias`}
              diferenca={{ nome: "Margem até aqui", de: "receita", menos: "custo" }}
            />
          ) : (
            <Vazio titulo="Nem receita nem custo de IA no período" texto="As duas linhas sobem quando houver pagamento confirmado e campanha gerada." />
          )}
        </Cartao>
      </Dobra>

      <Dobra
        id="creditos"
        titulo="Créditos consumidos por conta e projeto, com o custo real ao lado"
        resumo={`${numero(creditosConsumidos)} créditos em ${projetosComCredito} projeto(s)${creditosQueCustariam > 0 ? `, mais ${numero(creditosQueCustariam)} que a equipe teria pago` : ""} · ${reais(custoComProjeto, 2)} de IA nesses projetos`}
      >
        <CreditosPorProjeto linhas={usoDeIa.porProjeto} dolar={dolar} />
        <Cartao titulo="Créditos consumidos no tempo" subtitulo={`As duas carteiras, somadas ${graficos.porSemana ? "por semana" : "por dia"}. Conta de admin debita zero e não aparece aqui.`}>
          {temDado(graficos.creditos) ? (
            <GraficoNoTempo dados={graficos.creditos} modo="barras" rotulo={`Créditos consumidos nos últimos ${dias} dias`} />
          ) : (
            <Vazio compacto titulo="Nenhum crédito gasto no período" texto="Cada campanha, peça refeita e minuto de vídeo debita créditos; as barras empilham o plano e o vídeo." />
          )}
        </Cartao>
      </Dobra>

      <Dobra
        id="custo"
        titulo="Custo de IA: de quem é, por fornecedor, família, modelo e operação"
        resumo={`${dolares(custoUsd)} em ${numero(usoDeIa.porCategoria.reduce((s, c) => s + c.n, 0))} chamadas · ${usoDeIa.porFornecedor
          .slice(0, 3)
          .map((f) => `${f.nome} ${dolares(f.usd)}`)
          .join(" · ")}`}
      >
        <GastoDeIaPorOrigem dados={usoDeIa} />
        <PorModeloEOperacao dados={usoDeIa} />
      </Dobra>

      <Dobra
        id="margem"
        titulo="Margem por cliente, contas da equipe e os créditos estão funcionando"
        resumo={`${usoDeIa.clientes.length} cliente(s) com uso ou plano · ${usoDeIa.internas.length} conta(s) da equipe · ${sinais} sinal(is) a conferir`}
      >
        <MargemPorCliente dados={usoDeIa} />
        <ContasDoTime dados={usoDeIa} />
        <CreditosFuncionando dados={usoDeIa} />
      </Dobra>

      <Dobra
        id="vendas"
        titulo="Vendas: contas, quem chegou, de onde veio e quem deixou contato"
        resumo={`${visitas} visita(s) · ${passo("cadastro")?.pessoas ?? 0} cadastro(s) confirmado(s) · ${graficos.demonstracoes.marcadas} demonstração(ões) marcada(s) · ${contatos.length} contato(s) na fila`}
      >
        <div className="grid grid-cols-1 gap-5">
          <Cartao titulo="Contas e demonstrações" subtitulo="As contas por situação, e o que aconteceu com as demonstrações do período.">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {resumo.usuarios} conta(s), {resumo.ativos} ativa(s) no período
            </p>
            <BarraEmpilhada
              rotulo="Contas por situação"
              partes={[
                { nome: "Confirmadas", valor: resumo.confirmadas, cor: "var(--painel-1)" },
                { nome: "Sem confirmar", valor: resumo.semConfirmar, cor: "var(--painel-4)" },
                { nome: "Robôs", valor: resumo.suspeitas, cor: "var(--painel-2)" },
                { nome: "Equipe", valor: internas, cor: "var(--painel-neutro)" },
              ]}
            />
            <div className="mt-4">
              <BarraEmpilhada
                rotulo="Demonstrações do período"
                partes={[
                  { nome: "Realizadas", valor: graficos.demonstracoes.realizadas, cor: "var(--painel-1)" },
                  { nome: "Faltou", valor: graficos.demonstracoes.faltou, cor: "var(--painel-2)" },
                  { nome: "Canceladas", valor: graficos.demonstracoes.canceladas, cor: "var(--painel-neutro)" },
                ]}
              />
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {graficos.demonstracoes.marcadas}
                </strong>{" "}
                marcadas no período (pelo dia em que a pessoa marcou).{" "}
                <Link href="/admin/agenda" className="underline-offset-2 hover:underline" style={{ color: "var(--text-primary)" }}>
                  Abrir a agenda
                </Link>
              </p>
            </div>
          </Cartao>
        </div>

        <Cartao
          titulo={graficos.porSemana ? "Quem chegou, semana a semana" : "Quem chegou, dia a dia"}
          subtitulo={`Cadastros confirmados, leads e demonstrações ${graficos.porSemana ? "por semana" : "por dia"}. Passe o mouse (ou o dedo) para ver cada ${graficos.porSemana ? "semana" : "dia"}.`}
        >
          {temDado(graficos.movimento) ? (
            <GraficoNoTempo dados={graficos.movimento} modo="linhas" rotulo={`Cadastros, leads e demonstrações nos últimos ${dias} dias`} />
          ) : (
            <Vazio
              titulo={`Ninguém chegou nos últimos ${dias} dias`}
              texto="Cada cadastro confirmado, lead deixado na landing ou na calculadora e demonstração marcada vira um ponto aqui, no dia em que aconteceu. Robô e conta da equipe não entram."
            />
          )}
        </Cartao>

        <Cartao titulo="De onde vêm" subtitulo="Por origem e campanha da primeira visita. As três barras de cada linha usam a mesma escala.">
          {origens.length > 0 ? (
            <Origens linhas={origens} />
          ) : (
            <Vazio
              titulo="Nenhuma visita registrada no período"
              texto="A origem vem do link (utm_source e utm_campaign) da primeira visita. Anúncio, post e e-mail com link marcado aparecem aqui separados."
            />
          )}
        </Cartao>

        <Cartao
          titulo="Quem deixou contato"
          subtitulo="O formulário guarda o perfil; a demo guarda o tema que a pessoa pediu, que é a melhor pista de assunto que existe. As duas portas na mesma lista."
        >
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr style={{ background: "var(--bg-input)" }}>
                  {["Contato", "O que faz, ou o que pediu", "Publica", "Quer", "Veio de", "Virou conta"].map((h) => (
                    <th key={h} className="text-left font-medium px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contatos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      Ninguém deixou contato ainda.
                    </td>
                  </tr>
                )}
                {contatos.map((c) => (
                  <tr key={`${c.origemDoContato}-${c.email}-${c.quando}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <span style={{ color: "var(--text-primary)" }}>{c.nome ?? c.email}</span>
                      <br />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {c.nome ? `${c.email} · ` : ""}
                        {c.origemDoContato} · {data(c.quando)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[320px]" style={{ color: "var(--text-muted)" }}>
                      {c.faz ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.cria ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.objetivo ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {c.origem ?? "-"}
                      {c.cta ? ` · ${c.cta}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold" style={{ color: c.virouConta ? "var(--badge-success-text)" : "var(--text-muted)" }}>
                      {c.virouConta ? "sim" : "não"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      </Dobra>

      <Dobra
        id="publicacoes"
        titulo="Publicações por rede e as que falharam"
        resumo={`${numero(totalPorRede.reduce((s, r) => s + r.valor, 0))} publicação(ões) no ar · ${graficos.falhas.total} falha(s)`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Cartao titulo="Publicações por rede" subtitulo="O que foi ao ar de verdade, de todas as contas, pela data da publicação.">
            {temDado(graficos.publicacoes) ? (
              <>
                <GraficoNoTempo dados={graficos.publicacoes} modo="barras" altura={190} rotulo={`Publicações por rede nos últimos ${dias} dias`} />
                <div className="mt-3">
                  <BarrasHorizontais linhas={totalPorRede.map((r) => ({ nome: r.nome, valor: r.valor, cor: r.cor, nota: "no período" }))} />
                </div>
              </>
            ) : (
              <Vazio titulo="Nada publicado no período" texto="Quando uma peça aprovada for ao ar, ela entra aqui na cor da rede, no dia em que saiu." />
            )}
          </Cartao>

          <Cartao
            titulo="Publicações que falharam"
            subtitulo="Por código e por rede. O cliente lê só o título e o código; a explicação técnica está na lista abaixo e no e-mail do chamado."
          >
            {graficos.falhas.total > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="rotulo mb-2">Por código</p>
                  <BarrasHorizontais
                    cor="var(--badge-danger-text)"
                    linhas={graficos.falhas.porCodigo.map((c) => ({ nome: c.codigo === "sem código" ? c.titulo : `${c.codigo} · ${c.titulo}`, valor: c.n }))}
                  />
                </div>
                <div>
                  <p className="rotulo mb-2">Por rede</p>
                  <BarrasHorizontais cor="var(--badge-danger-text)" linhas={graficos.falhas.porRede.map((r) => ({ nome: r.rede, valor: r.n }))} />
                </div>
              </div>
            ) : (
              <Vazio titulo={`Nenhuma falha nos últimos ${dias} dias`} texto="Se uma rede recusar uma peça, o código aparece aqui agrupado, e a linha completa na lista abaixo." />
            )}
          </Cartao>
        </div>
        {!exemplo && (
          <div>
            <p className="rotulo mb-2">As falhas uma a uma ({graficos.falhas.total} no período, até 30 na lista)</p>
            <FalhasDePublicacao dias={dias} comTitulo={false} />
          </div>
        )}
      </Dobra>

      <Dobra
        id="contas"
        titulo="As contas, uma a uma"
        resumo={`${resumo.usuarios} conta(s) · ${resumo.confirmadas} confirmada(s) · ${resumo.suspeitas} com cara de robô · ${internas} da equipe`}
      >
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Em cada conta, a barra de cima é o custo de IA do período (laranja) e a de baixo é a mensalidade de TABELA do plano, que não é receita: serve para ver quanto da mensalidade o custo come. Margem só aparece para quem pagou de verdade no período.
        </p>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr style={{ background: "var(--bg-input)" }}>
                {["Conta", "Plano", "Créditos", "Uso", "Custo e tabela", "Receita real e margem", "Última campanha"].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const recebido = ex ? l.mensalidade : (receita.porConta[l.id] ?? 0);
                const margemDaConta = recebido - l.custoIaReais;
                return (
                  <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <span style={{ color: "var(--text-primary)" }}>{l.nome ?? l.email}</span>
                      <br />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {l.email}
                        {l.interna ? " · equipe" : ""}
                        {l.suspeita ? " · cara de robô" : ""} · desde {data(l.cadastroEm)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                      {l.planoNome}
                      <br />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {l.mensalidade > 0 ? `${reais(l.mensalidade)}/mês de tabela` : "sem plano"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
                      {l.creditos} em conta
                      <br />
                      {l.consumidos} gastos · {l.creditosDeVideo} de vídeo
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
                      {l.projetos} marca(s) · {l.campanhas} campanha(s)
                      <br />
                      {l.gravacoes} gravação(ões) · {l.armazenamentoGb.toFixed(1)} GB
                    </td>
                    <td className="px-3 py-2 min-w-[150px]">
                      <span className="text-xs tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {reais(l.custoIaReais, 2)}
                      </span>
                      <div className="mt-1 space-y-[2px]" title={`Custo ${reais(l.custoIaReais, 2)}, tabela ${reais(l.mensalidade)}`}>
                        <div className="h-1.5 rounded-full" style={{ width: `${(l.custoIaReais / maiorCusto) * 100}%`, minWidth: l.custoIaReais > 0 ? 3 : 0, background: "var(--painel-2)" }} />
                        <div className="h-1.5 rounded-full" style={{ width: `${(l.mensalidade / maiorCusto) * 100}%`, minWidth: l.mensalidade > 0 ? 3 : 0, background: "var(--painel-1)" }} />
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap text-xs font-medium"
                      style={{ color: l.interna ? "var(--text-muted)" : margemDaConta < 0 ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}
                    >
                      {l.interna ? (
                        "equipe, sem receita"
                      ) : (
                        <>
                          {reais(recebido, 2)} recebidos
                          <br />
                          margem {reais(margemDaConta, 2)}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: l.ativo ? "var(--badge-success-text)" : "var(--text-muted)" }}>
                      {data(l.ultimaCampanha)}
                      {l.ativo ? " · ativo" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Custo de IA pelo registro de uso dos fornecedores, em dólar a {cotacao(dolar)}. Não inclui infraestrutura nem imposto.
        </p>
      </Dobra>
    </div>
  );
}

/** As etapas principais do funil, na ordem real (sem plano não se entra na plataforma). */
const ETAPAS_DO_FUNIL: Array<Pick<EtapaDoFunil, "chave" | "nome" | "explica">> = [
  { chave: "visita", nome: "Visitas", explica: "pessoas diferentes na página inicial" },
  { chave: "cadastro", nome: "Cadastro confirmado", explica: "e-mail confirmado, sem robô e sem admin" },
  { chave: "checkout", nome: "Abriu o pagamento", explica: "chegaram à tela de pagamento" },
  { chave: "assinatura", nome: "Assinatura", explica: "assinaram (teste com cartão conta)" },
  { chave: "ativação", nome: "Ativação", explica: "1ª campanha gerada ou 1º vídeo enviado" },
];

/**
 * A comparação em modo de exemplo: as séries do próprio exemplo, e o período
 * anterior como 80% delas. Só no `next dev` com ?exemplo=1.
 */
function comparacaoDeExemplo(g: DadosDosGraficos, base: ComparacaoDoPainel): ComparacaoDoPainel {
  const da = (d: DadosNoTempo, chave?: string) =>
    chave ? (d.series.find((s) => s.chave === chave)?.valores ?? []) : d.baldes.map((_, i) => d.series.reduce((t, s) => t + s.valores[i], 0));
  const par = (v: number[]) => ({ atual: v, anterior: v.map((x, i) => x * (0.65 + 0.3 * Math.abs(Math.sin(i + 1)))) });
  const custo = da(g.dinheiro, "custo");
  return {
    ...base,
    baldes: g.dinheiro.baldes,
    custo: par(custo),
    custoDeCliente: par(custo.map((v) => v * 0.6)),
    receita: par(da(g.dinheiro, "receita")),
    creditos: par(da(g.creditos)),
    cadastros: par(da(g.movimento, "cadastros")),
  };
}
