export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { lerPainel, lerFunil, lerOrigens, lerContatos, lerAssinaturas } from "@/lib/admin/painel";
import { eixoDoTempo, lerGraficos } from "@/lib/admin/graficos-do-painel";
import { periodoDaUrl, reais, soma, type DadosNoTempo } from "@/lib/admin/tipos-do-painel";
import { tetoDeVideosPorDia } from "@/lib/media/cota-do-dia";
import { FalhasDePublicacao } from "@/components/admin/falhas-de-publicacao";
import { GraficoNoTempo } from "@/components/admin/grafico-no-tempo";
import {
  BarraEmpilhada,
  BarrasHorizontais,
  Cartao,
  Funil,
  Medidor,
  Numero,
  Origens,
  Rosca,
  SeletorDePeriodo,
  Vazio,
} from "@/components/admin/painel-graficos";

/**
 * O PAINEL DE ADMIN (card 175, pedido em 21/08 e feito em 22/09).
 *
 * Server component de propósito: as consultas agregadas descem prontas, sem
 * rota nova. Desde 01/10 a tela é GRÁFICA (pedido do Bruno: "o funil, os
 * dados, tudo deve ser gráfico"), com seletor de 7, 30 ou 90 dias na URL. Só
 * os gráficos no tempo são componentes de cliente, e recebem dado puro.
 * Nenhum número que existia na versão em tabela saiu: os totais viraram
 * legenda, nota ou balão, e as listas de pessoas (contatos e contas)
 * continuam em tabela, porque são fila de trabalho e não tendência.
 *
 * QUEM ENTRA: só `role === "admin"`, lido do banco e não de uma lista de
 * e-mails no ambiente. O papel já existe e já manda no débito e no portão de
 * entrada; criar uma segunda definição de "quem é dono" seria garantir que as
 * duas divergissem. Quem não é admin recebe 404 e não 403: a existência da
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
  // Uma janela só para tudo: a meia-noite de São Paulo do primeiro dia. Os
  // totais dos cartões e as somas dos gráficos fecham entre si.
  const { desde } = eixoDoTempo(dias, agora);

  const [painel, funilReal, origensReais, contatos, assinaturasReais] = await Promise.all([
    lerPainel(agora, dias, desde),
    lerFunil(desde),
    lerOrigens(desde),
    lerContatos(40),
    lerAssinaturas(),
  ]);
  const graficosReais = await lerGraficos(dias, painel.resumo.mrr, agora);

  // AS DEMONSTRAÇÕES MARCADAS (01/10): o aviso no topo do painel, para ninguém
  // descobrir a reunião só pelo e-mail. A ficha completa fica em /admin/agenda.
  // A janela é a do número do menu: da última hora até 7 dias à frente.
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
  const origens = ex?.origens ?? origensReais;
  const assinaturas = ex?.assinaturas ?? assinaturasReais;
  const graficos = ex?.graficos ?? graficosReais;

  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "nunca";
  const temDado = (d: DadosNoTempo) => d.series.some((s) => soma(s.valores) > 0);
  const passo = (nome: string) => funil.find((p) => p.passo === nome);
  const visitas = passo("visita")?.pessoas ?? 0;
  const sobreVisitas = (n: number) => (visitas > 0 ? `${Math.round((n / visitas) * 100)}% das visitas` : "pessoas");

  // As contas partidas em quem são. "Internas" é o resto: acesso de admin
  // confirmado, que não entra na conversão nem conta como robô.
  const internas = Math.max(0, resumo.usuarios - resumo.confirmadas - resumo.semConfirmar - resumo.suspeitas);

  // Receita por plano, só de quem paga (conta interna fica fora, como sempre).
  // A cor segue o plano, não a posição: Starter, Pro e Enterprise têm dono.
  const COR_DO_PLANO: Record<string, string> = {
    pro: "var(--painel-3)",
    business: "var(--painel-1)",
    studio: "var(--painel-2)",
  };
  const porPlano = new Map<string, { nome: string; valor: number; contas: number; cor: string }>();
  for (const l of linhas.filter((x) => x.mensalidade > 0 && x.papel !== "admin")) {
    const atual = porPlano.get(l.plano) ?? { nome: l.planoNome, valor: 0, contas: 0, cor: COR_DO_PLANO[l.plano] ?? "var(--painel-5)" };
    atual.valor += l.mensalidade;
    atual.contas += 1;
    porPlano.set(l.plano, atual);
  }

  const custoNoPeriodo = soma(graficos.dinheiro.series.find((s) => s.chave === "custo")?.valores ?? []);
  const receitaNoPeriodo = soma(graficos.dinheiro.series.find((s) => s.chave === "receita")?.valores ?? []);
  const totalPorRede = graficos.publicacoes.series
    .map((s) => ({ nome: s.nome, valor: soma(s.valores), cor: s.cor }))
    .sort((a, b) => b.valor - a.valor);
  const maiorCusto = Math.max(1, ...linhas.map((l) => Math.max(l.custoIaReais, l.mensalidade)));
  const seletorExtra = exemplo ? "&exemplo=1" : "";

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="space-y-3">
        <div>
          <p className="rotulo mb-1">Gestão da plataforma</p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Painel
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Últimos {dias} dias, no horário de São Paulo. Ativo quer dizer gerou campanha na janela, e não entrou na conta.
          </p>
        </div>
        {/* O período à esquerda, os atalhos à direita: numa linha só no
            computador, sem o último botão cair sozinho para baixo. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeletorDePeriodo atual={dias} extra={seletorExtra} />
          <div className="flex flex-wrap items-center gap-2">
          {/* A agenda das demonstrações (01/10), com o número das marcadas. */}
          <Link href="/admin/agenda" className="rounded-lg border border-orange-500/50 px-3 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10">
            Demonstrações{totalDeProximas ? ` (${totalDeProximas})` : ""}
          </Link>
          {/* O suporte e os contratos (02/10). */}
          <Link href="/admin/chamados" className="rounded-lg border border-orange-500/50 px-3 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10">
            Chamados
          </Link>
          <Link href="/admin/contratos" className="rounded-lg border border-orange-500/50 px-3 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10">
            Contratos
          </Link>
          {/* Conexão assistida das redes dos clientes (01/10). */}
          <Link href="/admin/redes" className="rounded-lg border border-orange-500/50 px-3 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10">
            Redes dos clientes
          </Link>
          {/* O CRM tem tela própria: lista por segmento e ficha com ações. */}
          <Link href="/admin/clientes" className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            Clientes e ações
          </Link>
          </div>
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

      {/* A AGENDA À VISTA (01/10): antes a agenda só abria digitando a URL. */}
      <Cartao
        titulo="Demonstrações"
        subtitulo="Marcadas para os próximos 7 dias, e o que aconteceu com as do período. Reunião de teste fica fora das contas."
        acao={
          <Link href="/admin/agenda" className="shrink-0 rounded-lg bg-[var(--acento-forte)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
            Abrir a agenda
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            {demonstracoes.length > 0 ? (
              <>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {totalDeProximas === 1 ? "1 demonstração marcada" : `${totalDeProximas} demonstrações marcadas`}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {demonstracoes.map((d) => (
                    <li key={d.id} className="flex gap-2 text-sm">
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{ background: "var(--realce-2)", color: "var(--text-primary)" }}
                      >
                        {d.inicio.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
                        com {d.pessoa.nome.split(/\s+/)[0]}: {d.lead.empresa || [d.lead.cargo, d.lead.setor].filter(Boolean).join(", ") || d.lead.email}
                        {d.teste ? " (teste)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Vazio
                compacto
                titulo="Nenhuma demonstração nos próximos 7 dias"
                texto="Quando alguém marcar pela página de demonstração, a reunião aparece aqui, no número do menu e no e-mail de quem atende."
              />
            )}
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              Nos últimos {dias} dias
            </p>
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
              marcadas no período (pelo dia em que a pessoa marcou).
            </p>
          </div>
        </div>
      </Cartao>

      {/* OS NÚMEROS DE CABEÇA: cada um com o desenho que o explica. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Numero rotulo="Contas" valor={String(resumo.usuarios)} nota={`${resumo.ativos} ativas no período`}>
          {/* Desde 01/10 as contas se separam em gente confirmada, sem
              confirmar e robô: o total sozinho contava 86 robôs como contas. */}
          <BarraEmpilhada
            rotulo="Contas por situação"
            partes={[
              { nome: "Confirmadas", valor: resumo.confirmadas, cor: "var(--painel-1)" },
              { nome: "Sem confirmar", valor: resumo.semConfirmar, cor: "var(--painel-4)" },
              { nome: "Robôs", valor: resumo.suspeitas, cor: "var(--painel-2)" },
              { nome: "Internas", valor: internas, cor: "var(--painel-neutro)" },
            ]}
          />
        </Numero>
        <Numero rotulo="Pagantes" valor={String(resumo.pagantes)} nota={`${reais(resumo.mrr)} por mês`} />
        <Numero
          rotulo="Custo de IA"
          valor={reais(resumo.custoIaReais)}
          nota={
            <>
              margem{" "}
              <strong style={{ color: resumo.mrr - resumo.custoIaReais < 0 ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}>
                {reais(resumo.mrr - resumo.custoIaReais)}
              </strong>
            </>
          }
        >
          <Medidor valor={resumo.custoIaReais} teto={Math.max(resumo.mrr, resumo.custoIaReais, 1)} rotulo="Custo de IA contra a receita do mês" />
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            {resumo.mrr > 0 ? `${Math.round((resumo.custoIaReais / resumo.mrr) * 100)}% da receita mensal` : "sem receita para comparar"}
          </p>
        </Numero>
        <Numero rotulo="Vídeo hoje" valor={`${resumo.videosHoje} de ${tetoDeVideosPorDia()}`} nota={`${resumo.armazenamentoGb.toFixed(1)} GB guardados`}>
          <Medidor valor={resumo.videosHoje} teto={tetoDeVideosPorDia()} rotulo="Vídeos gerados hoje contra o teto do dia" />
        </Numero>
        <Numero
          rotulo="Assinaturas"
          valor={assinaturas.leu ? `${assinaturas.ativas + assinaturas.emTeste}` : "?"}
          nota={assinaturas.leu ? `${assinaturas.saindo} saindo no fim do período` : "não consegui ler o Stripe"}
        >
          {assinaturas.leu && (
            <BarraEmpilhada
              rotulo="Assinaturas no Stripe"
              partes={[
                { nome: "Ativas", valor: assinaturas.ativas, cor: "var(--painel-1)" },
                { nome: "Em teste", valor: assinaturas.emTeste, cor: "var(--painel-3)" },
                { nome: "Canceladas", valor: assinaturas.canceladas, cor: "var(--painel-neutro)" },
              ]}
            />
          )}
        </Numero>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* O FUNIL. A taxa entre passos mostra ONDE vaza, e nenhum número
            isolado mostra isso. */}
        <Cartao
          className="lg:col-span-3"
          titulo="O funil"
          subtitulo="Pessoas, e não cliques: anônimo conta por IP, quem tem conta conta por conta. Cadastro conta só e-mail confirmado e sem cara de robô. A ativação vem depois da assinatura porque sem plano não se entra na plataforma."
        >
          <Funil
            dias={dias}
            passos={funil}
            portas={[
              { nome: "Testou a demo pública", pessoas: passo("demo")?.pessoas ?? 0, nota: `${passo("demo")?.eventos ?? 0} evento(s), ${sobreVisitas(passo("demo")?.pessoas ?? 0)}` },
              { nome: "Deixou contato", pessoas: passo("contato")?.pessoas ?? 0, nota: sobreVisitas(passo("contato")?.pessoas ?? 0) },
              { nome: "Marcou demonstração", pessoas: graficos.demonstracoes.marcadas, nota: sobreVisitas(graficos.demonstracoes.marcadas) },
            ]}
          />
        </Cartao>

        <Cartao className="lg:col-span-2" titulo="Receita e planos" subtitulo="Mensalidade somada de quem paga, por plano. Conta interna e cortesia ficam fora.">
          <Rosca
            centro={reais(resumo.mrr)}
            rotuloDoCentro="por mês"
            formatar={(n) => reais(n)}
            fatias={[...porPlano.values()].map((p) => ({ nome: p.nome, valor: p.valor, cor: p.cor, nota: `· ${p.contas} conta(s)` }))}
            vazio={{
              titulo: "Ninguém pagando ainda",
              texto: "A rosca se divide por plano quando a primeira assinatura virar cobrança. Teste com cartão ainda não conta como receita.",
            }}
          />
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
            texto="Cada cadastro confirmado, lead deixado na landing ou na calculadora e demonstração marcada vira um ponto aqui, no dia em que aconteceu. Robô e conta interna não entram."
          />
        )}
      </Cartao>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Cartao
          className="lg:col-span-3"
          titulo="Custo de IA e margem"
          subtitulo={`Somas corridas no período: a receita proporcional (mensalidades divididas por 30 a cada dia) contra o que os fornecedores de IA cobraram. A distância entre as linhas é a margem.`}
        >
          {receitaNoPeriodo > 0 || custoNoPeriodo > 0 ? (
            <GraficoNoTempo
              dados={graficos.dinheiro}
              modo="linhas"
              acumulado
              formato="reais"
              rotulo={`Receita proporcional e custo de IA acumulados nos últimos ${dias} dias`}
              diferenca={{ nome: "Margem até aqui", de: "receita", menos: "custo" }}
            />
          ) : (
            <Vazio
              titulo="Nem receita nem custo de IA no período"
              texto="As duas linhas sobem juntas quando houver assinatura paga e campanha gerada. Conta interna gera custo, mas não receita."
            />
          )}
          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            Fora de projeto (demo pública e afins), fora da margem por cliente:{" "}
            <strong style={{ color: "var(--text-primary)" }}>{reais(graficos.custoForaDeProjeto, 2)}</strong>. Dólar a{" "}
            {Number(process.env.DOLAR_PARA_REAL ?? 5.4).toFixed(2)}; não inclui infraestrutura nem imposto.
          </p>
        </Cartao>

        <Cartao className="lg:col-span-2" titulo="Créditos consumidos" subtitulo={`As duas carteiras, somadas ${graficos.porSemana ? "por semana" : "por dia"}. Conta interna debita zero e não aparece aqui.`}>
          {temDado(graficos.creditos) ? (
            <GraficoNoTempo dados={graficos.creditos} modo="barras" rotulo={`Créditos consumidos nos últimos ${dias} dias`} />
          ) : (
            <Vazio
              titulo="Nenhum crédito gasto no período"
              texto="Cada campanha, peça refeita e minuto de vídeo de cliente debita créditos; as barras empilham o plano e o vídeo."
            />
          )}
        </Cartao>
      </div>

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
            <Vazio
              titulo="Nada publicado no período"
              texto="Quando uma peça aprovada for ao ar, ela entra aqui na cor da rede, no dia em que saiu."
            />
          )}
        </Cartao>

        <Cartao
          titulo="Publicações que falharam"
          subtitulo="Por código e por rede. O cliente lê só o título e o código; a explicação técnica está na tabela abaixo e no e-mail do chamado."
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
            <Vazio
              titulo={`Nenhuma falha nos últimos ${dias} dias`}
              texto="Se uma rede recusar uma peça, o código aparece aqui agrupado, e a linha completa na tabela abaixo."
            />
          )}
        </Cartao>
      </div>

      {/* A tabela das falhas fica: é por onde se atende o chamado. */}
      {!exemplo && (
        <details className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            As falhas uma a uma ({graficos.falhas.total} no período, até 30 na lista)
          </summary>
          <div className="mt-3">
            <FalhasDePublicacao dias={dias} comTitulo={false} />
          </div>
        </details>
      )}

      {/* DE ONDE VEM. Sem isto, "converteu 3%" não ensina onde pôr o próximo real. */}
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

      {/* QUEM DEIXOU CONTATO, das duas portas. É fila de prospecção, não relatório. */}
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

      <Cartao
        titulo="As contas"
        subtitulo="Em cada conta, a barra de cima é o custo de IA do período (laranja) e a de baixo é a mensalidade: laranja mais comprida que a de baixo é cliente dando prejuízo."
      >
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr style={{ background: "var(--bg-input)" }}>
                {["Conta", "Plano", "Créditos", "Uso", "Custo e mensalidade", "Margem", "Última campanha"].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2">
                    <span style={{ color: "var(--text-primary)" }}>{l.nome ?? l.email}</span>
                    <br />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {l.email}
                      {l.papel === "admin" ? " · interno" : ""}
                      {l.suspeita ? " · cara de robô" : ""} · desde {data(l.cadastroEm)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                    {l.planoNome}
                    <br />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {l.mensalidade > 0 ? `${reais(l.mensalidade)}/mês` : "não paga"}
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
                      {reais(l.custoIaReais)}
                    </span>
                    <div className="mt-1 space-y-[2px]" title={`Custo ${reais(l.custoIaReais)}, mensalidade ${reais(l.mensalidade)}`}>
                      <div className="h-1.5 rounded-full" style={{ width: `${(l.custoIaReais / maiorCusto) * 100}%`, minWidth: l.custoIaReais > 0 ? 3 : 0, background: "var(--painel-2)" }} />
                      <div className="h-1.5 rounded-full" style={{ width: `${(l.mensalidade / maiorCusto) * 100}%`, minWidth: l.mensalidade > 0 ? 3 : 0, background: "var(--painel-1)" }} />
                    </div>
                  </td>
                  <td
                    className="px-3 py-2 whitespace-nowrap font-medium"
                    style={{ color: l.papel === "admin" ? "var(--text-muted)" : l.margemReais < 0 ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}
                  >
                    {l.papel === "admin" ? "interno" : reais(l.margemReais)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: l.ativo ? "var(--badge-success-text)" : "var(--text-muted)" }}>
                    {data(l.ultimaCampanha)}
                    {l.ativo ? " · ativo" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          A margem compara a mensalidade do plano com o que os fornecedores de IA cobraram de verdade no período
          (registro de uso, em dólar a {Number(process.env.DOLAR_PARA_REAL ?? 5.4).toFixed(2)}). Não inclui
          infraestrutura nem imposto, e conta interna aparece sem margem de propósito.
        </p>
      </Cartao>
    </div>
  );
}
