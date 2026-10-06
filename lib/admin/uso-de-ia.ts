import { prisma } from "@/lib/db/prisma";
import { planoPublico, type PlanoId } from "@/lib/planos";
import {
  emailPareceInterno,
  familiaDaOperacao,
  fornecedorDoModelo,
  grupoDaCobranca,
  grupoDaFamilia,
  GRUPOS_DE_COBRANCA,
  MARGEM_MINIMA_DESENHADA,
  NOME_DO_GRUPO,
  NOME_DO_PERIODO,
  operacaoEhRecarga,
  TETO_DE_CUSTO_DO_PLANO,
  TETO_DE_CUSTO_POR_CREDITO,
  type Categoria,
  type CruzamentoPorGrupo,
  type DadosDoUsoDeIa,
  type Familia,
  type GrupoDeCobranca,
  type LinhaDeConta,
  type LinhaDePlano,
  type LinhaDeProjeto,
  type PeriodoDeIa,
} from "@/lib/admin/tipos-do-uso-de-ia";

/**
 * USO DE IA E MARGEM, a leitura do banco (05/10/2026).
 *
 * O que esta tela responde, e que nenhuma outra respondia:
 *  1. quanto do gasto de IA é de CLIENTE e quanto é do TIME (conta interna,
 *     ou linha sem projeto). Medido em 05/10: US$ 334 em 7 dias, e nenhum
 *     cliente real; sem esta separação a margem do painel compara receita de
 *     cliente com custo de teste;
 *  2. os créditos estão funcionando? Por grupo de cobrança (campanha, roteiro,
 *     completo e cortes, gêmeo, vídeo por IA), o gasto de IA de cada projeto é
 *     cruzado com as linhas do extrato do MESMO projeto na MESMA janela:
 *     gasto sem linha é vazamento, linha sem gasto é cobrança sem entrega;
 *  3. a margem respeita o desenho? Por conta e por plano: receita proporcional
 *     ao período contra o custo real (dólar convertido), com sinal vermelho
 *     abaixo de 70% ou acima de R$ 0,027 de custo por crédito cobrado.
 *
 * SÓ LEITURA, e em poucas consultas agregadas (GROUP BY no Postgres): o
 * `ai_usage` tem milhares de linhas por semana, e trazer linha a linha para
 * classificar em JavaScript é o que faz a tela de gestão deixar de abrir.
 * Nunca um SET: a DATABASE_URL é o pooler em modo transação.
 *
 * Este módulo lê o banco: só servidor. Tipos e classificação pura moram em
 * tipos-do-uso-de-ia.ts.
 */

const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;

/** O dólar, configurável no ambiente; o padrão é o do resto do painel. */
export const DOLAR = Number(process.env.DOLAR_PARA_REAL ?? "") || 5.4;

const diaLocal = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });
const meiaNoiteLocal = (dia: string) => new Date(`${dia}T00:00:00-03:00`);

/**
 * A JANELA: começa na meia-noite de São Paulo e termina agora. Nos 7 e 30 dias
 * o dia de hoje conta inteiro (como no resto do painel); no mês, do dia 1 até
 * agora. `dias` é a base da receita proporcional (mensalidade / 30 por dia).
 */
export function janelaDoPeriodo(periodo: PeriodoDeIa | number, agora = new Date()): { desde: Date; ate: Date; dias: number; rotulo: string } {
  const hoje = diaLocal(agora);
  // Um número de dias (05/10, à noite): o painel inteiro passou a ter UM
  // período só, o do seletor de cima, e esta seção segue a mesma janela que
  // os gráficos (meia-noite de São Paulo do primeiro dia até agora).
  if (typeof periodo === "number") {
    const desde = meiaNoiteLocal(diaLocal(new Date(agora.getTime() - (periodo - 1) * DIA_MS)));
    return { desde, ate: agora, dias: periodo, rotulo: `últimos ${periodo} dias` };
  }
  if (periodo === "mes") {
    const desde = meiaNoiteLocal(`${hoje.slice(0, 7)}-01`);
    const dias = Number(hoje.slice(8, 10));
    const mes = agora.toLocaleDateString("pt-BR", { timeZone: FUSO, month: "long" });
    return { desde, ate: agora, dias, rotulo: `${mes}, do dia 1 ao ${dias}` };
  }
  const n = Number(periodo);
  const desde = meiaNoiteLocal(diaLocal(new Date(agora.getTime() - (n - 1) * DIA_MS)));
  return { desde, ate: agora, dias: n, rotulo: `últimos ${NOME_DO_PERIODO[periodo]}` };
}

/**
 * A coluna `contaInterna` existe? A migração de 05/10 é aditiva e pode ainda
 * não ter rodado em produção; enquanto não roda, a classificação usa a mesma
 * lista de e-mails que a migração marca. A tela avisa qual das duas está em uso.
 */
async function temColunaDeInterna(): Promise<boolean> {
  try {
    const r = await prisma.$queryRawUnsafe<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'contaInterna'`
    );
    return r.length > 0;
  } catch {
    return false;
  }
}

type Conta = { id: string; email: string; name: string | null; plan: string; role: string; interna: boolean; creditsResetAt: Date | null };

export async function lerUsoDeIa(
  periodo: PeriodoDeIa | number,
  agora = new Date(),
  opcoes: {
    /**
     * A RECEITA REAL por conta no período (05/10, à noite): pagamento
     * confirmado, lido por lib/admin/receita-real.ts. Sem ela, a receita de
     * toda conta é zero, porque mensalidade de tabela não é receita.
     */
    receitaRealPorConta?: Record<string, number>;
  } = {}
): Promise<DadosDoUsoDeIa> {
  const janela = janelaDoPeriodo(periodo, agora);
  const { desde, ate, dias } = janela;
  const colunaDeInterna = await temColunaDeInterna();
  const expressaoInterna = colunaDeInterna ? `("contaInterna" OR role = 'admin')` : `(role = 'admin')`;
  const receitaReal = opcoes.receitaRealPorConta ?? {};

  const [contasCruas, projetos, usos, extrato, contratos] = await Promise.all([
    // As contas inteiras cabem numa consulta: são dezenas, não milhares.
    prisma.$queryRawUnsafe<Conta[]>(
      `SELECT id, email, name, plan, role, ${expressaoInterna} AS interna, "creditsResetAt" FROM users`
    ),
    prisma.project.findMany({ select: { id: true, name: true, userId: true } }),
    // O gasto, agregado por projeto, operação e modelo: é o menor grão que
    // responde "por fornecedor", "por operação" e "por projeto" de uma vez.
    prisma.$queryRawUnsafe<Array<{ projectId: string | null; operation: string; model: string; usd: number; n: number }>>(
      `SELECT "projectId", operation, model, SUM("costUsd")::float8 AS usd, COUNT(*)::int AS n
         FROM ai_usage
        WHERE "createdAt" >= $1 AND "createdAt" < $2
        GROUP BY 1, 2, 3`,
      desde,
      ate
    ),
    // O extrato, agregado por conta, projeto e operação. "custaria" é o que a
    // conta interna teria pago: fica escrito na nota da linha a zero.
    prisma.$queryRawUnsafe<
      Array<{ userId: string; projectId: string | null; operation: string; carteira: string; n: number; liquido: number; custaria: number }>
    >(
      `SELECT "userId", "projectId", operation, carteira,
              COUNT(*)::int AS n,
              (-SUM(amount))::int AS liquido,
              COALESCE(SUM(CASE WHEN amount = 0
                                THEN NULLIF(replace(substring(note from 'custaria ([0-9.]+) cr'), '.', ''), '')::int
                                ELSE 0 END), 0)::int AS custaria
         FROM credit_transactions
        WHERE "createdAt" >= $1 AND "createdAt" < $2
        GROUP BY 1, 2, 3, 4`,
      desde,
      ate
    ),
    // Receita de contrato, quando existe: vale mais que a tabela do plano.
    prisma.contrato
      .findMany({
        where: { status: { in: ["assinado", "vigente", "a_vencer"] } },
        select: { userId: true, valorCentavos: true, plano: true },
      })
      .catch(() => [] as Array<{ userId: string; valorCentavos: number; plano: string }>),
  ]);

  // A lista de e-mails da migração vale sempre, com ou sem a coluna: a
  // conta do Bruno no Gmail é da equipe mesmo que alguém desmarque a coluna.
  const contas = new Map<string, Conta>(
    contasCruas.map((c) => [c.id, { ...c, interna: c.interna || emailPareceInterno(c.email) }])
  );
  const donoDoProjeto = new Map(projetos.map((p) => [p.id, p]));
  const categoriaDoProjeto = (projectId: string | null): { categoria: Categoria; conta: Conta | null; projeto: string } => {
    const p = projectId ? donoDoProjeto.get(projectId) : undefined;
    if (!p) return { categoria: "orfao", conta: null, projeto: projectId ? `projeto apagado (${projectId.slice(-6)})` : "sem projeto" };
    const conta = contas.get(p.userId) ?? null;
    return { categoria: conta?.interna ? "dev" : "cliente", conta, projeto: p.name };
  };

  // ── Os totais por categoria, fornecedor, modelo, família e operação ──────
  const somar = <K extends string>(mapa: Map<K, { usd: number; n: number; cliente: number; dev: number }>, chave: K, usd: number, n: number, cat: Categoria) => {
    const atual = mapa.get(chave) ?? { usd: 0, n: 0, cliente: 0, dev: 0 };
    atual.usd += usd;
    atual.n += n;
    if (cat === "cliente") atual.cliente += usd;
    else atual.dev += usd;
    mapa.set(chave, atual);
  };
  const porCategoria = new Map<Categoria, { usd: number; n: number; cliente: number; dev: number }>();
  const porFornecedor = new Map<string, { usd: number; n: number; cliente: number; dev: number }>();
  const porModelo = new Map<string, { usd: number; n: number; cliente: number; dev: number }>();
  const porFamilia = new Map<Familia, { usd: number; n: number; cliente: number; dev: number }>();
  const porOperacao = new Map<string, { usd: number; n: number; cliente: number; dev: number }>();
  // Por conta e por projeto/grupo, para a margem e o cruzamento.
  const custoPorConta = new Map<string, { usd: number; n: number }>();
  const custoPorProjetoEGrupo = new Map<string, { usd: number; projectId: string }>();
  let orfao = { usd: 0, n: 0 };
  let totalUsd = 0;

  for (const u of usos) {
    const usd = Number(u.usd);
    const n = Number(u.n);
    const { categoria, conta } = categoriaDoProjeto(u.projectId);
    const familia = familiaDaOperacao(u.operation);
    totalUsd += usd;
    somar(porCategoria, categoria, usd, n, categoria);
    somar(porFornecedor, fornecedorDoModelo(u.model), usd, n, categoria);
    somar(porModelo, u.model, usd, n, categoria);
    somar(porFamilia, familia, usd, n, categoria);
    somar(porOperacao, u.operation, usd, n, categoria);
    if (conta) {
      const c = custoPorConta.get(conta.id) ?? { usd: 0, n: 0 };
      c.usd += usd;
      c.n += n;
      custoPorConta.set(conta.id, c);
    } else {
      orfao = { usd: orfao.usd + usd, n: orfao.n + n };
    }
    const grupo = grupoDaFamilia(familia);
    if (grupo && u.projectId) {
      const chave = `${u.projectId}|${grupo}`;
      const atual = custoPorProjetoEGrupo.get(chave) ?? { usd: 0, projectId: u.projectId };
      atual.usd += usd;
      custoPorProjetoEGrupo.set(chave, atual);
    }
  }

  // ── O extrato: créditos cobrados por conta e por projeto/grupo ───────────
  const creditosPorConta = new Map<string, { cobrados: number; custariam: number }>();
  const cobrancaPorProjetoEGrupo = new Map<string, { cobrancas: number; creditos: number; custariam: number; projectId: string }>();
  // Por conta E projeto, com as duas carteiras (05/10, à noite): é a resposta
  // a "quantos créditos o Fé & Gestão consumiu, e quanto isso custou de IA".
  const creditosPorContaEProjeto = new Map<string, { userId: string; projectId: string | null; plano: number; video: number; custariam: number; linhas: number }>();
  for (const e of extrato) {
    if (operacaoEhRecarga(e.operation)) continue;
    const c = creditosPorConta.get(e.userId) ?? { cobrados: 0, custariam: 0 };
    c.cobrados += Number(e.liquido);
    c.custariam += Number(e.custaria);
    creditosPorConta.set(e.userId, c);
    const chaveCP = `${e.userId}|${e.projectId ?? ""}`;
    const cp = creditosPorContaEProjeto.get(chaveCP) ?? { userId: e.userId, projectId: e.projectId, plano: 0, video: 0, custariam: 0, linhas: 0 };
    if (e.carteira === "video") cp.video += Number(e.liquido);
    else cp.plano += Number(e.liquido);
    cp.custariam += Number(e.custaria);
    cp.linhas += Number(e.n);
    creditosPorContaEProjeto.set(chaveCP, cp);
    const grupo = grupoDaCobranca(e.operation);
    if (grupo && e.projectId) {
      const chave = `${e.projectId}|${grupo}`;
      const atual = cobrancaPorProjetoEGrupo.get(chave) ?? { cobrancas: 0, creditos: 0, custariam: 0, projectId: e.projectId };
      atual.cobrancas += Number(e.n);
      atual.creditos += Number(e.liquido);
      atual.custariam += Number(e.custaria);
      cobrancaPorProjetoEGrupo.set(chave, atual);
    }
  }

  // ── A margem por conta ───────────────────────────────────────────────────
  const contratoPorConta = new Map<string, number>();
  for (const c of contratos) contratoPorConta.set(c.userId, (contratoPorConta.get(c.userId) ?? 0) + c.valorCentavos / 100 / 12);
  const mensalidade = (conta: Conta) => {
    const doContrato = contratoPorConta.get(conta.id);
    if (doContrato) return doContrato;
    if (!conta.plan || conta.plan === "free") return 0;
    return planoPublico(conta.plan as PlanoId)?.mensal ?? 0;
  };

  const linhaDaConta = (conta: Conta): LinhaDeConta => {
    const custo = custoPorConta.get(conta.id) ?? { usd: 0, n: 0 };
    const cred = creditosPorConta.get(conta.id) ?? { cobrados: 0, custariam: 0 };
    const custoReais = custo.usd * DOLAR;
    // Receita é só o que entrou confirmado (05/10, à noite). A mensalidade do
    // plano ou do contrato, proporcional aos dias, fica como projeção.
    const receitaReais = conta.interna ? 0 : (receitaReal[conta.id] ?? 0);
    const receitaProjetadaReais = conta.interna ? 0 : (mensalidade(conta) * dias) / 30;
    const margemReais = receitaReais - custoReais;
    const margemPct = receitaReais > 0 ? margemReais / receitaReais : null;
    const custoPorCredito = cred.cobrados > 0 ? custoReais / cred.cobrados : null;
    let alerta: string | null = null;
    if (!conta.interna) {
      if (margemPct !== null && margemPct < MARGEM_MINIMA_DESENHADA)
        alerta = `margem de ${Math.round(margemPct * 100)}%, abaixo dos ${Math.round(MARGEM_MINIMA_DESENHADA * 100)}% desenhados`;
      else if (receitaReais === 0 && custoReais > 0) alerta = "custo sem pagamento confirmado no período";
      else if (custoPorCredito !== null && custoPorCredito > TETO_DE_CUSTO_POR_CREDITO)
        alerta = `R$ ${custoPorCredito.toFixed(3)} de IA por crédito, acima da régua de R$ ${TETO_DE_CUSTO_POR_CREDITO.toFixed(3)}`;
    }
    return {
      id: conta.id,
      email: conta.email,
      nome: conta.name,
      plano: conta.plan,
      planoNome: conta.plan === "free" || !conta.plan ? "Sem plano" : (planoPublico(conta.plan as PlanoId)?.nome ?? conta.plan),
      categoria: conta.interna ? "dev" : "cliente",
      chamadas: custo.n,
      custoUsd: custo.usd,
      custoReais,
      creditosCobrados: cred.cobrados,
      creditosQueCustariam: cred.custariam,
      custoDesenhadoReais: cred.cobrados * TETO_DE_CUSTO_POR_CREDITO,
      custoPorCredito,
      receitaReais,
      receitaProjetadaReais,
      margemReais,
      margemPct,
      alerta,
    };
  };

  // ── Os créditos por conta e projeto, com o custo real do mesmo projeto ───
  const custoPorProjeto = new Map<string, { usd: number; n: number }>();
  for (const u of usos) {
    if (!u.projectId) continue;
    const atual = custoPorProjeto.get(u.projectId) ?? { usd: 0, n: 0 };
    atual.usd += Number(u.usd);
    atual.n += Number(u.n);
    custoPorProjeto.set(u.projectId, atual);
  }
  const porProjeto: LinhaDeProjeto[] = [];
  const projetosComExtrato = new Set<string>();
  for (const cp of creditosPorContaEProjeto.values()) {
    const conta = contas.get(cp.userId);
    const p = cp.projectId ? donoDoProjeto.get(cp.projectId) : undefined;
    const custo = cp.projectId ? (custoPorProjeto.get(cp.projectId) ?? { usd: 0, n: 0 }) : { usd: 0, n: 0 };
    if (cp.projectId) projetosComExtrato.add(cp.projectId);
    const creditos = cp.plano + cp.video;
    const naRegua = creditos + cp.custariam;
    porProjeto.push({
      projectId: cp.projectId,
      projeto: p?.name ?? (cp.projectId ? `projeto apagado (${cp.projectId.slice(-6)})` : "sem projeto"),
      contaId: cp.userId,
      email: conta?.email ?? "conta apagada",
      nome: conta?.name ?? null,
      categoria: conta?.interna ? "dev" : "cliente",
      creditosPlano: cp.plano,
      creditosVideo: cp.video,
      creditosQueCustariam: cp.custariam,
      linhas: cp.linhas,
      chamadas: custo.n,
      custoUsd: custo.usd,
      custoReais: custo.usd * DOLAR,
      custoPorCredito: naRegua > 0 ? (custo.usd * DOLAR) / naRegua : null,
    });
  }
  // Projeto que gastou IA sem nenhuma linha no extrato também aparece: é o
  // crédito que não foi cobrado, e esconder isso seria esconder o vazamento.
  for (const [projectId, custo] of custoPorProjeto) {
    if (projetosComExtrato.has(projectId) || custo.usd <= 0) continue;
    const p = donoDoProjeto.get(projectId);
    const conta = p ? contas.get(p.userId) : undefined;
    porProjeto.push({
      projectId,
      projeto: p?.name ?? `projeto apagado (${projectId.slice(-6)})`,
      contaId: conta?.id ?? null,
      email: conta?.email ?? "sem dono",
      nome: conta?.name ?? null,
      categoria: !p ? "orfao" : conta?.interna ? "dev" : "cliente",
      creditosPlano: 0,
      creditosVideo: 0,
      creditosQueCustariam: 0,
      linhas: 0,
      chamadas: custo.n,
      custoUsd: custo.usd,
      custoReais: custo.usd * DOLAR,
      custoPorCredito: null,
    });
  }
  porProjeto.sort((a, b) => b.creditosPlano + b.creditosVideo + b.creditosQueCustariam - (a.creditosPlano + a.creditosVideo + a.creditosQueCustariam) || b.custoUsd - a.custoUsd);

  // Entra na lista quem gastou IA ou foi cobrado no período, ou quem paga
  // plano (cliente pagante sem uso é margem de 100%, e isso também é informação).
  const comMovimento = (c: Conta) => custoPorConta.has(c.id) || creditosPorConta.has(c.id) || (!c.interna && mensalidade(c) > 0);
  const linhas = [...contas.values()].filter(comMovimento).map(linhaDaConta);
  const clientes = linhas.filter((l) => l.categoria === "cliente").sort((a, b) => b.custoReais - a.custoReais);
  const internas = linhas.filter((l) => l.categoria === "dev").sort((a, b) => b.custoReais - a.custoReais);

  // ── A margem por plano, só de cliente ────────────────────────────────────
  const porPlanoMapa = new Map<string, LinhaDePlano>();
  for (const l of clientes) {
    if (!l.plano || l.plano === "free") continue;
    const atual = porPlanoMapa.get(l.plano) ?? {
      plano: l.plano,
      planoNome: l.planoNome,
      contas: 0,
      receitaReais: 0,
      custoReais: 0,
      creditosCobrados: 0,
      margemReais: 0,
      margemPct: null,
      tetoDeCustoReais: 0,
      alerta: null,
    };
    atual.contas += 1;
    atual.receitaReais += l.receitaReais;
    atual.custoReais += l.custoReais;
    atual.creditosCobrados += l.creditosCobrados;
    porPlanoMapa.set(l.plano, atual);
  }
  const porPlano = [...porPlanoMapa.values()].map((p) => {
    const teto = TETO_DE_CUSTO_DO_PLANO[p.plano] ?? 1 - MARGEM_MINIMA_DESENHADA;
    p.margemReais = p.receitaReais - p.custoReais;
    p.margemPct = p.receitaReais > 0 ? p.margemReais / p.receitaReais : null;
    p.tetoDeCustoReais = p.receitaReais * teto;
    p.alerta = p.custoReais > p.tetoDeCustoReais ? `custo acima do teto de ${Math.round(teto * 100)}% da receita` : null;
    return p;
  });

  // ── O cruzamento: créditos cobrados contra gasto de IA, por projeto e grupo ─
  const cruzamento: CruzamentoPorGrupo[] = GRUPOS_DE_COBRANCA.map((grupo) => ({
    grupo,
    nome: NOME_DO_GRUPO[grupo],
    usd: 0,
    cobrancas: 0,
    creditos: 0,
    creditosQueCustariam: 0,
    vazamentos: [],
    semGasto: [],
  }));
  const doGrupo = (g: GrupoDeCobranca) => cruzamento.find((c) => c.grupo === g)!;
  for (const [chave, custo] of custoPorProjetoEGrupo) {
    const grupo = chave.split("|")[1] as GrupoDeCobranca;
    const linha = doGrupo(grupo);
    linha.usd += custo.usd;
    const cobranca = cobrancaPorProjetoEGrupo.get(chave);
    if (!cobranca && custo.usd > 0) {
      const { categoria, conta, projeto } = categoriaDoProjeto(custo.projectId);
      linha.vazamentos.push({ projeto, conta: conta?.email ?? "sem dono", categoria, usd: custo.usd });
    }
  }
  for (const [chave, cobranca] of cobrancaPorProjetoEGrupo) {
    const grupo = chave.split("|")[1] as GrupoDeCobranca;
    const linha = doGrupo(grupo);
    linha.cobrancas += cobranca.cobrancas;
    linha.creditos += cobranca.creditos;
    linha.creditosQueCustariam += cobranca.custariam;
    const custo = custoPorProjetoEGrupo.get(chave);
    if (!custo || custo.usd <= 0) {
      const { categoria, conta, projeto } = categoriaDoProjeto(cobranca.projectId);
      linha.semGasto.push({ projeto, conta: conta?.email ?? "sem dono", categoria, creditos: cobranca.creditos, cobrancas: cobranca.cobrancas });
    }
  }
  for (const c of cruzamento) {
    c.vazamentos.sort((a, b) => b.usd - a.usd);
    c.semGasto.sort((a, b) => b.creditos - a.creditos);
  }

  const lista = <K extends string>(mapa: Map<K, { usd: number; n: number; cliente: number; dev: number }>) =>
    [...mapa.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.usd - a.usd);

  return {
    periodo,
    rotuloDoPeriodo: janela.rotulo,
    dias,
    dolar: DOLAR,
    colunaDeInterna,
    totalUsd,
    porCategoria: (["cliente", "dev", "orfao"] as Categoria[]).map((categoria) => ({
      categoria,
      usd: porCategoria.get(categoria)?.usd ?? 0,
      n: porCategoria.get(categoria)?.n ?? 0,
    })),
    porFornecedor: lista(porFornecedor),
    porModelo: lista(porModelo).map((m) => ({ ...m, fornecedor: fornecedorDoModelo(m.nome) })),
    porFamilia: lista(porFamilia).map(({ nome, ...v }) => ({ familia: nome, ...v })),
    porOperacao: lista(porOperacao).map((o) => ({ ...o, familia: familiaDaOperacao(o.nome) })),
    clientes,
    internas,
    orfao,
    porPlano,
    cruzamento,
    porProjeto,
  };
}
