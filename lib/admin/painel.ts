import { prisma } from "@/lib/db/prisma";
import { planoPublico, type PlanoId } from "@/lib/planos";
import { contaPareceRobo } from "@/lib/anti-robo/regras";
import { contaEhDaEquipe } from "@/lib/admin/tipos-do-uso-de-ia";

/**
 * O PAINEL DE ADMIN, e por que ele deixou de ser opcional.
 *
 * Pedido do Bruno em 21/08 (card 175) e adiado desde então: "hoje toda gestão
 * é feita por consulta direta ao banco pelo Claude, o que não escala e não
 * serve para o Bruno sozinho". Enquanto o único cliente era ele, dava para
 * viver assim. Com cliente de fora, não: quem não consegue ver quem usa o quê
 * descobre o churn pela fatura e a margem pelo susto.
 *
 * A conta que só existe aqui é a MARGEM POR CLIENTE: o que ele paga em plano
 * contra o que a IA custou de verdade no período (`ai_usage`, em dólar, que é
 * o que o fornecedor cobrou). Nenhuma outra tela junta as duas pontas, e é ela
 * que responde se um cliente dá lucro.
 *
 * Este módulo lê o banco, então nunca pode ser importado por componente de
 * tela. A página que o usa é de SERVIDOR.
 */

/** O dólar, para a margem sair em real sem depender de cotação ao vivo. */
const DOLAR = Number(process.env.DOLAR_PARA_REAL ?? "") || 5.4;

/** Quem gerou campanha nos últimos 30 dias conta como ativo. */
const JANELA_DE_ATIVIDADE_DIAS = 30;

export type LinhaDoPainel = {
  id: string;
  email: string;
  nome: string | null;
  plano: string;
  planoNome: string;
  papel: string;
  /**
   * Conta da EQUIPE (05/10; regra única desde 06/10): admin, `contaInterna`
   * ou @demandou.com. Gera custo, nunca receita, e fica fora de pagante e de
   * margem. Conta com desconto que usa como cliente é cliente.
   */
  interna: boolean;
  /** Mensalidade do plano, em reais. 0 para quem não tem plano. É TABELA, não caixa. */
  mensalidade: number;
  creditos: number;
  creditosDeVideo: number;
  /** Créditos consumidos na janela. */
  consumidos: number;
  projetos: number;
  gravacoes: number;
  campanhas: number;
  /** Custo real de IA na janela, em reais. */
  custoIaReais: number;
  /** Mensalidade menos custo de IA. Negativo é prejuízo. */
  margemReais: number;
  armazenamentoGb: number;
  cadastroEm: string;
  /** Cara de robô: ver `pareceRobo`. Não bloqueia nada, só marca. */
  suspeita: boolean;
  /** Última campanha gerada. Null para quem nunca gerou. */
  ultimaCampanha: string | null;
  ativo: boolean;
};

export type ResumoDoPainel = {
  usuarios: number;
  ativos: number;
  /** Contas fora da equipe com plano em vigor. NÃO é pagante: quem pagou de verdade mora em lib/admin/receita-real.ts. */
  pagantes: number;
  /**
   * Mensalidade de tabela somada das contas fora da equipe com plano, em
   * reais. É PROJEÇÃO (05/10): a tela só pode mostrar isto com esse rótulo.
   */
  mrr: number;
  /** Custo de IA na janela, em reais. */
  custoIaReais: number;
  /** Armazenamento somado, em GB. */
  armazenamentoGb: number;
  /** Gerações de vídeo no dia de cota corrente, que é o teto da plataforma. */
  videosHoje: number;
  janelaDias: number;
  /**
   * Contas com cara de robô, e o criterio esta em `pareceRobo`.
   *
   * Entrou em 22/09, no mesmo dia em que o painel mostrou 19 cadastros em 24
   * horas sem um projeto sequer. Nao apaga nada e nao bloqueia ninguem: so
   * conta, porque numero de cadastro que inclui robo e o numero que decide o
   * teste de trafego pago, e decidir com ele e decidir errado.
   */
  suspeitas: number;
  /**
   * Contas de GENTE com e-mail confirmado: o número que entra na conversão
   * (01/10). Exclui robô (marcado ou com o padrão) e conta sem confirmar.
   */
  confirmadas: number;
  /** Contas sem e-mail confirmado que não têm cara de robô. */
  semConfirmar: number;
};

const BYTES_POR_GB = 1024 * 1024 * 1024;

/**
 * O PADRAO DE ROBO NO CADASTRO, medido em 22/09 e refeito em 01/10.
 *
 * Em 22/09 o criterio era so o Gmail com tres pontos ou mais (Gmail ignora
 * pontos, e espalhar pontos fabrica mil enderecos para a mesma caixa). Em
 * 01/10 o diagnostico do banco mostrou que isso pegava 30 de 86 robos: o resto
 * usava e-mail de terceiros de verdade, e o que TODOS tinham em comum era o
 * nome de letras sorteadas. A regra mora em lib/anti-robo/regras.ts, a mesma
 * que a porta de entrada usa para recusar, para as duas nunca divergirem.
 *
 * Conta marcada aqui nao perde nada, ela so sai do numero de conversao.
 */
export function pareceRobo(c: {
  email: string;
  name: string | null;
  emailVerified: boolean;
  projetos: number;
  roboEm?: Date | null;
}): boolean {
  return contaPareceRobo({
    email: c.email,
    nome: c.name,
    emailVerificado: c.emailVerified,
    projetos: c.projetos,
    roboEm: c.roboEm ?? null,
  });
}

/**
 * QUEM CONTA COMO CADASTRO NA CONVERSAO (01/10): e-mail confirmado, sem cara
 * de robo e sem ser acesso interno. Conta sem confirmar nao e cadastro, e uma
 * linha no banco: 84 das 86 contas de robo pararam nesse ponto.
 */
export function contaNaConversao(c: Parameters<typeof pareceRobo>[0] & { role: string }): boolean {
  return c.emailVerified && c.role !== "admin" && !pareceRobo(c);
}

function mensalidadeDoPlano(plano: string): number {
  if (!plano || plano === "free") return 0;
  const p = planoPublico(plano as PlanoId);
  return p?.mensal ?? 0;
}

/**
 * Uma linha por usuário, com o que decide conversa de churn e de margem.
 *
 * Feito em poucas consultas agregadas e não em uma por usuário: com dez
 * clientes a diferença não aparece, com cem a tela demora, e tela de gestão
 * que demora não é aberta.
 */
// O período do seletor do painel (01/10): 7, 30 ou 90 dias. O padrão segue 30.
export async function lerPainel(
  agora = new Date(),
  dias: number = JANELA_DE_ATIVIDADE_DIAS,
  // O começo exato da janela, quando quem chama já tem um (o painel gráfico
  // começa na meia-noite de São Paulo, e os totais precisam fechar com ele).
  inicio?: Date
): Promise<{
  linhas: LinhaDoPainel[];
  resumo: ResumoDoPainel;
}> {
  const desde = inicio ?? new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      role: true,
      creditsBalance: true,
      videoCredits: true,
      createdAt: true,
      emailVerified: true,
      roboEm: true,
      contaInterna: true,
      projects: { select: { id: true } },
    },
  });
  const robo = (u: (typeof users)[number]) =>
    pareceRobo({ email: u.email, name: u.name, emailVerified: u.emailVerified, projetos: u.projects.length, roboEm: u.roboEm });
  const interna = (u: { email: string; role: string; contaInterna: boolean }) => contaEhDaEquipe(u);

  const projetoDoDono = new Map<string, string>();
  for (const u of users) for (const p of u.projects) projetoDoDono.set(p.id, u.id);

  const [gastos, custos, gravacoes, campanhas, armazenamento] = await Promise.all([
    prisma.creditTransaction.groupBy({
      by: ["userId"],
      where: { amount: { lt: 0 }, createdAt: { gte: desde } },
      _sum: { amount: true },
    }),
    prisma.aiUsage.groupBy({
      by: ["projectId"],
      where: { createdAt: { gte: desde }, projectId: { not: null } },
      _sum: { costUsd: true },
    }),
    prisma.videoJob.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.pipelineRun.groupBy({
      by: ["projectId"],
      _count: { _all: true },
      // `startedAt` e o nascimento da execucao neste modelo: nao existe
      // `createdAt` aqui, e usar `endedAt` deixaria de fora quem tem campanha
      // rodando agora, que e justamente o cliente mais ativo.
      _max: { startedAt: true },
    }),
    prisma.videoJob.groupBy({ by: ["userId"], _sum: { sizeBytes: true } }),
  ]);

  const porUsuario = <T>(lista: Array<{ userId: string } & T>) =>
    new Map(lista.map((l) => [l.userId, l]));
  const mapaGastos = porUsuario(gastos);
  const mapaGravacoes = porUsuario(gravacoes);
  const mapaArmazenamento = porUsuario(armazenamento);

  // Custo e campanhas chegam por PROJETO: viram por dono aqui.
  const custoPorDono = new Map<string, number>();
  for (const c of custos) {
    const dono = c.projectId ? projetoDoDono.get(c.projectId) : undefined;
    if (!dono) continue;
    custoPorDono.set(dono, (custoPorDono.get(dono) ?? 0) + Number(c._sum.costUsd ?? 0));
  }
  const campanhasPorDono = new Map<string, { n: number; ultima: Date | null }>();
  for (const r of campanhas) {
    const dono = projetoDoDono.get(r.projectId);
    if (!dono) continue;
    const atual = campanhasPorDono.get(dono) ?? { n: 0, ultima: null };
    const ultima = r._max?.startedAt ?? null;
    campanhasPorDono.set(dono, {
      n: atual.n + (r._count?._all ?? 0),
      ultima: ultima && (!atual.ultima || ultima > atual.ultima) ? ultima : atual.ultima,
    });
  }

  const linhas: LinhaDoPainel[] = users.map((u) => {
    const mensalidade = mensalidadeDoPlano(u.plan);
    const custoIaReais = (custoPorDono.get(u.id) ?? 0) * DOLAR;
    const camp = campanhasPorDono.get(u.id);
    const ultima = camp?.ultima ?? null;
    return {
      id: u.id,
      email: u.email,
      nome: u.name,
      plano: u.plan,
      planoNome: u.plan === "free" ? "Sem plano" : (planoPublico(u.plan as PlanoId)?.nome ?? u.plan),
      papel: u.role,
      interna: interna(u),
      mensalidade,
      creditos: u.creditsBalance,
      creditosDeVideo: u.videoCredits,
      consumidos: Math.abs(mapaGastos.get(u.id)?._sum.amount ?? 0),
      projetos: u.projects.length,
      gravacoes: mapaGravacoes.get(u.id)?._count._all ?? 0,
      campanhas: camp?.n ?? 0,
      custoIaReais,
      margemReais: mensalidade - custoIaReais,
      armazenamentoGb: Number(mapaArmazenamento.get(u.id)?._sum.sizeBytes ?? 0) / BYTES_POR_GB,
      cadastroEm: u.createdAt.toISOString(),
      suspeita: robo(u),
      ultimaCampanha: ultima ? ultima.toISOString() : null,
      // Ativo e "usou o produto", nao "entrou na conta": login sem campanha e
      // visita, e visita nao paga a fatura nem segura o cliente.
      ativo: !!ultima && ultima >= desde,
    };
  });

  const { inicioDoDiaDeCota } = await import("@/lib/media/cota-do-dia");
  const usosDeHoje = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: inicioDoDiaDeCota(agora) } },
    select: { model: true },
  });

  // Conta da equipe nunca entra aqui (05/10): até então o Gmail do Bruno,
  // com plano Pro e papel "user", somava R$ 3.997 de "receita" por mês.
  const comPlano = linhas.filter((l) => l.mensalidade > 0 && !l.interna);
  const resumo: ResumoDoPainel = {
    usuarios: linhas.length,
    ativos: linhas.filter((l) => l.ativo).length,
    pagantes: comPlano.length,
    mrr: comPlano.reduce((s, l) => s + l.mensalidade, 0),
    custoIaReais: linhas.reduce((s, l) => s + l.custoIaReais, 0),
    armazenamentoGb: linhas.reduce((s, l) => s + l.armazenamentoGb, 0),
    videosHoje: usosDeHoje.filter((u) => /veo/i.test(u.model ?? "")).length,
    janelaDias: dias,
    suspeitas: users.filter(robo).length,
    confirmadas: users.filter((u) => u.emailVerified && !interna(u) && !robo(u)).length,
    semConfirmar: users.filter((u) => !u.emailVerified && !robo(u)).length,
  };

  return { linhas, resumo };
}

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL, DE ONDE VEM E QUEM JA DEIXOU CONTATO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Os passos na ordem em que a pessoa anda, e a taxa entre um e o outro.
 *
 * A taxa que importa nao e "quantos assinaram", e sim ONDE o funil vaza: com
 * 72 visitas e 38 cadastros e 1 checkout, o buraco esta entre cadastro e
 * checkout, e nenhum numero isolado mostra isso.
 *
 * Visitante unico conta por IP com sal, que e o que ja existe. Nao e perfeito
 * (casa com IP compartilhado vira um), e e honesto: e melhor um numero com
 * limite conhecido do que um rastreador novo no meio do lancamento.
 */
export type PassoDoFunil = {
  passo: string;
  eventos: number;
  pessoas: number;
  /**
   * Quantos por cento do passo anterior chegaram aqui. Null no primeiro.
   *
   * PODE PASSAR DE 100, e isso nao e erro de conta: os passos nao sao uma
   * fila. Medido em 22/09, a tela mostrou "1700% do passo anterior" no
   * cadastro, porque 34 pessoas se cadastraram sem nunca ter deixado contato
   * (a maioria robo, que entra direto na pagina de cadastro). Quem le a tela
   * precisa entender isso na hora, senao o numero vira piada e o painel perde
   * a autoridade inteira.
   */
  taxa: number | null;
  /** Verdadeiro quando mais gente chegou aqui do que passou pelo passo anterior. */
  entrouDireto: boolean;
};

const ORDEM_DO_FUNIL = ["visita", "demo", "contato", "cadastro", "checkout", "assinatura"] as const;

/**
 * AS CONTAS QUE ENTRAM NA CONVERSAO, nascidas na janela (01/10).
 *
 * O passo "cadastro" deixou de vir dos eventos: o evento antigo era mandado
 * pelo navegador antes da confirmacao do e-mail, e o robo roda o mesmo codigo
 * da tela. Lido direto das contas, o numero vale tambem para o passado: as 86
 * contas de robo de setembro saem dele sem precisar reescrever evento nenhum.
 */
export async function cadastrosDeGente(desde: Date, ate?: Date) {
  const contas = await prisma.user.findMany({
    where: { createdAt: ate ? { gte: desde, lt: ate } : { gte: desde }, emailVerified: true },
    select: {
      id: true, email: true, name: true, emailVerified: true, role: true, roboEm: true, createdAt: true,
      origem: true, campanha: true, projects: { select: { id: true } },
    },
  });
  return contas.filter((u) =>
    contaNaConversao({
      email: u.email, name: u.name, emailVerified: u.emailVerified, role: u.role,
      projetos: u.projects.length, roboEm: u.roboEm,
    })
  );
}

/**
 * `ate` (06/10): o fim da janela, para o painel ler o PERÍODO ANTERIOR do
 * mesmo tamanho e comparar o funil, no estilo do Stripe. Sem `ate`, vai até
 * agora, como sempre foi.
 */
export async function lerFunil(desde: Date, ate?: Date): Promise<PassoDoFunil[]> {
  const janela = ate ? { gte: desde, lt: ate } : { gte: desde };
  const [eventos, cadastros] = await Promise.all([
    prisma.funnelEvent.findMany({
      where: { createdAt: janela },
      select: { evento: true, ipHash: true, userId: true },
    }),
    cadastrosDeGente(desde, ate),
  ]);

  const linhas: PassoDoFunil[] = [];
  let anterior: number | null = null;
  for (const passo of ORDEM_DO_FUNIL) {
    // O cadastro vem das contas de gente confirmadas, e nao dos eventos.
    const doPasso =
      passo === "cadastro"
        ? cadastros.map((u) => ({ evento: passo as string, ipHash: null as string | null, userId: u.id as string | null }))
        : eventos.filter((e) => e.evento === passo);
    // Pessoa e o usuario quando ele existe, e o IP quando ainda e anonimo: o
    // mesmo visitante que cadastra nao deve contar duas vezes no passo dele.
    const pessoas = new Set(doPasso.map((e) => e.userId ?? e.ipHash ?? Math.random().toString())).size;
    const taxa = anterior && anterior > 0 ? Math.round((pessoas / anterior) * 100) : null;
    linhas.push({
      passo,
      eventos: doPasso.length,
      pessoas,
      taxa,
      entrouDireto: taxa !== null && taxa > 100,
    });
    anterior = pessoas;
  }

  /**
   * A ATIVAÇÃO (01/10, painel gráfico): dos cadastros de gente da janela,
   * quantos USARAM o produto, ou seja, geraram a primeira campanha ou
   * enviaram o primeiro vídeo. Fica depois da assinatura porque é essa a
   * ordem real: sem plano o portão (lib/onboarding/portao.ts) manda para
   * /planos, e ninguém gera nada antes de assinar.
   */
  const ids = cadastros.map((u) => u.id);
  const projetos = cadastros.flatMap((u) => u.projects.map((p) => p.id));
  const [comCampanha, comVideo] = ids.length
    ? await Promise.all([
        prisma.pipelineRun.findMany({
          where: { projectId: { in: projetos } },
          select: { project: { select: { userId: true } } },
          distinct: ["projectId"],
        }),
        prisma.videoJob.findMany({ where: { userId: { in: ids } }, select: { userId: true }, distinct: ["userId"] }),
      ])
    : [[], []];
  const ativados = new Set([...comCampanha.map((r) => r.project.userId), ...comVideo.map((v) => v.userId)]);
  const pessoasAtivas = ids.filter((id) => ativados.has(id)).length;
  const taxaAtiva = anterior && anterior > 0 ? Math.round((pessoasAtivas / anterior) * 100) : null;
  linhas.push({
    passo: "ativação",
    eventos: pessoasAtivas,
    pessoas: pessoasAtivas,
    taxa: taxaAtiva,
    entrouDireto: taxaAtiva !== null && taxaAtiva > 100,
  });
  return linhas;
}

/** De onde as pessoas vieram, e onde cada origem parou. */
export type Origem = {
  origem: string;
  campanha: string | null;
  visitas: number;
  cadastros: number;
  assinaturas: number;
};

export async function lerOrigens(desde: Date): Promise<Origem[]> {
  const [eventos, cadastros] = await Promise.all([
    prisma.funnelEvent.findMany({
      where: { createdAt: { gte: desde } },
      select: { evento: true, origem: true, campanha: true, ipHash: true },
    }),
    cadastrosDeGente(desde),
  ]);
  const mapa = new Map<string, Origem & { ips: Set<string> }>();
  const linha = (origemCrua: string | null, campanha: string | null) => {
    const origem = origemCrua ?? "(direto)";
    const chave = `${origem}|${campanha ?? ""}`;
    const atual =
      mapa.get(chave) ??
      { origem, campanha, visitas: 0, cadastros: 0, assinaturas: 0, ips: new Set<string>() };
    mapa.set(chave, atual);
    return atual;
  };
  for (const e of eventos) {
    const atual = linha(e.origem, e.campanha);
    if (e.evento === "visita") {
      atual.visitas++;
      if (e.ipHash) atual.ips.add(e.ipHash);
    }
    if (e.evento === "assinatura") atual.assinaturas++;
  }
  // Cadastro pela origem carimbada na CONTA (no clique de confirmação), só de
  // gente confirmada: o evento antigo do navegador contava robô (01/10).
  for (const u of cadastros) linha(u.origem, u.campanha).cadastros++;
  return [...mapa.values()]
    .map(({ ips, ...o }) => ({ ...o, visitas: ips.size || o.visitas }))
    .sort((a, b) => b.visitas - a.visitas);
}

/**
 * QUEM DEIXOU CONTATO, das duas portas que existem.
 *
 * O formulario de lead e a demo publica guardam contato em tabelas
 * diferentes, e cada uma tem o que a outra nao tem: o lead tem o perfil (o que
 * a pessoa faz, se ja publica, o que quer) e a demo tem o TEXTO que a pessoa
 * pediu, que e a melhor pista de assunto que existe. Juntar as duas numa lista
 * so e o que transforma isso em fila de prospeccao, em vez de duas telas que
 * ninguem abre.
 */
export type Contato = {
  origemDoContato: "formulário" | "demo";
  email: string;
  nome: string | null;
  faz: string | null;
  cria: string | null;
  objetivo: string | null;
  cta: string | null;
  origem: string | null;
  virouConta: boolean;
  quando: string;
};

export async function lerContatos(limite = 50): Promise<Contato[]> {
  const [leads, demos] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: limite }),
    prisma.demoRun.findMany({
      where: { email: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limite,
      // A demo nao guarda origem: quem guarda e o evento de funil, pela
      // mesma visita. Aqui fica null, e a coluna de origem da lista se apoia
      // no formulario, que guarda.
      select: { email: true, nome: true, input: true, convertedUserId: true, createdAt: true },
    }),
  ]);

  const doFormulario: Contato[] = leads.map((l) => ({
    origemDoContato: "formulário" as const,
    email: l.email,
    nome: null,
    faz: l.faz,
    cria: l.cria,
    objetivo: l.objetivo,
    cta: l.cta,
    origem: l.origem,
    virouConta: Boolean(l.convertedUserId),
    quando: l.createdAt.toISOString(),
  }));

  const daDemo: Contato[] = demos.map((d) => ({
    origemDoContato: "demo" as const,
    email: d.email!,
    nome: d.nome,
    // O tema que a pessoa pediu na demo entra no lugar do "o que voce faz":
    // e a mesma informacao, dita de outro jeito e por conta propria.
    faz: d.input.slice(0, 80),
    cria: null,
    objetivo: null,
    cta: "demo",
    origem: null,
    virouConta: Boolean(d.convertedUserId),
    quando: d.createdAt.toISOString(),
  }));

  return [...doFormulario, ...daDemo]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, limite);
}

/**
 * AS ASSINATURAS, lidas do Stripe.
 *
 * Churn nao vira TAXA aqui de proposito. Com um punhado de assinaturas, uma
 * cancelada e 100% de churn, e numero assim nao informa, assusta. O painel
 * mostra as contagens e deixa a taxa para quando a base aguentar uma.
 */
export type Assinaturas = {
  ativas: number;
  emTeste: number;
  canceladas: number;
  /** Ativas que ja pediram para cancelar no fim do periodo. E o churn que VEM. */
  saindo: number;
  /** Null quando o Stripe nao respondeu: numero errado e pior que numero ausente. */
  leu: boolean;
};

export async function lerAssinaturas(): Promise<Assinaturas> {
  try {
    const { getStripe } = await import("@/lib/stripe");
    const lista = await getStripe().subscriptions.list({ status: "all", limit: 100 });
    return {
      ativas: lista.data.filter((a) => a.status === "active").length,
      emTeste: lista.data.filter((a) => a.status === "trialing").length,
      canceladas: lista.data.filter((a) => a.status === "canceled").length,
      saindo: lista.data.filter((a) => a.cancel_at_period_end && a.status !== "canceled").length,
      leu: true,
    };
  } catch (err) {
    console.error("[painel] nao consegui ler as assinaturas", err);
    return { ativas: 0, emTeste: 0, canceladas: 0, saindo: 0, leu: false };
  }
}
