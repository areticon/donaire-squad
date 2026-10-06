import { prisma } from "@/lib/db/prisma";
import { cadastrosDeGente } from "@/lib/admin/painel";
import { codigoDaFalha } from "@/lib/publish/codigos";
import { traducaoCompleta } from "@/lib/publish/codigos-admin";
import { nomeDaRede } from "@/lib/posts/estado";
import type { Balde, DadosDosGraficos, Periodo, SerieNoTempo } from "@/lib/admin/tipos-do-painel";

/**
 * AS SÉRIES DO PAINEL GRÁFICO (01/10, pedido do Bruno: "o funil, os dados,
 * tudo deve ser gráfico").
 *
 * O painel de antes contava tudo como total da janela. Gráfico precisa do
 * MOVIMENTO, dia a dia (ou semana a semana em 90 dias), e é isso que este
 * módulo devolve, já contado e pronto para descer ao navegador como dado puro.
 *
 * Só leitura. As agregações grandes (custo de IA, créditos, publicações) são
 * SELECT com GROUP BY no Postgres, para não trazer milhares de linhas para a
 * função; as pequenas (contas, leads, reuniões) vêm pelo Prisma. Nenhum SET,
 * nunca: a DATABASE_URL é o pooler em modo transação (ver a Parte 235 do
 * HANDOFF), e um SET grudado derrubou o login da produção.
 *
 * Este módulo lê o banco: só servidor. Os tipos moram em tipos-do-painel.ts.
 */

const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;
const DOLAR = Number(process.env.DOLAR_PARA_REAL ?? "") || 5.4;

/** O dia no relógio de São Paulo, como "2026-10-01". */
const diaLocal = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });
const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`);
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * O EIXO DO TEMPO: um balde por dia em 7 e 30 dias, e por semana em 90.
 *
 * As semanas são contadas de trás para a frente, para a última terminar hoje
 * (a semana corrente é a que o Bruno quer ver); a primeira pode sair mais
 * curta, e o balão diz quais dias ela cobre.
 */
export function eixoDoTempo(dias: Periodo, agora = new Date()) {
  const diasDaJanela: string[] = [];
  for (let i = dias - 1; i >= 0; i--) diasDaJanela.push(diaLocal(new Date(agora.getTime() - i * DIA_MS)));
  const porSemana = dias === 90;
  const sobra = porSemana ? (7 - (dias % 7)) % 7 : 0;
  const indice = new Map(diasDaJanela.map((d, i) => [d, porSemana ? Math.floor((i + sobra) / 7) : i]));
  const total = porSemana ? Math.ceil((dias + sobra) / 7) : dias;

  const baldes: Balde[] = Array.from({ length: total }, (_, b) => {
    const dosBalde = diasDaJanela.filter((d) => indice.get(d) === b);
    const primeiro = dosBalde[0];
    const ultimo = dosBalde[dosBalde.length - 1];
    return porSemana
      ? { rotulo: ddmm(primeiro), dica: `semana de ${ddmm(primeiro)} a ${ddmm(ultimo)}` }
      : {
          rotulo: ddmm(primeiro),
          dica: meioDia(primeiro).toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" }),
        };
  });
  const diasPorBalde = baldes.map((_, b) => diasDaJanela.filter((d) => indice.get(d) === b).length);
  // O começo da janela é a meia-noite de São Paulo do primeiro dia, e não
  // "agora menos N dias": senão o primeiro balde sairia pela metade.
  const desde = new Date(`${diasDaJanela[0]}T00:00:00-03:00`);
  return { baldes, porSemana, desde, diasPorBalde, balde: (dia: string) => indice.get(dia) };
}

/** A mesma conta do dia, feita dentro do Postgres (coluna sem fuso, em UTC). */
const DIA_SQL = (coluna: string) =>
  `to_char(((${coluna} AT TIME ZONE 'UTC') AT TIME ZONE '${FUSO}')::date, 'YYYY-MM-DD')`;

const zeros = (n: number) => Array.from({ length: n }, () => 0);

/**
 * A cor de cada rede é FIXA (a cor segue a rede, não a posição): filtrar o
 * período e sumir uma rede não pode repintar as outras.
 */
const COR_DA_REDE_NO_PAINEL: Record<string, string> = {
  linkedin: "var(--painel-1)",
  instagram: "var(--painel-2)",
  youtube: "var(--painel-3)",
  tiktok: "var(--painel-4)",
  facebook: "var(--painel-5)",
  twitter: "var(--painel-neutro)",
};
const ORDEM_DAS_REDES = ["linkedin", "instagram", "youtube", "tiktok", "facebook", "twitter"];

export async function lerGraficos(
  dias: Periodo,
  /**
   * A RECEITA REAL (05/10, à noite): os pagamentos confirmados do período,
   * cada um no dia em que entrou. Antes a série era a mensalidade de tabela
   * dividida por 30, que desenhava uma receita que ninguém tinha pago.
   */
  pagamentos: Array<{ quando: string; reais: number }>,
  agora = new Date()
): Promise<DadosDosGraficos> {
  const eixo = eixoDoTempo(dias, agora);
  const { desde, baldes } = eixo;
  const n = baldes.length;
  const noBalde = (d: Date) => eixo.balde(diaLocal(d));

  const [cadastros, leads, reunioes, custos, creditos, publicadas, falhas] = await Promise.all([
    cadastrosDeGente(desde),
    prisma.lead.findMany({ where: { createdAt: { gte: desde } }, select: { createdAt: true } }),
    prisma.reuniaoDeDemonstracao.findMany({
      // Reunião de teste (lead de e-mail .invalid) não é demonstração de
      // verdade e fica fora de todo número daqui.
      where: { teste: false, OR: [{ createdAt: { gte: desde } }, { inicio: { gte: desde, lte: agora } }] },
      select: { createdAt: true, inicio: true, status: true },
    }),
    prisma.$queryRawUnsafe<Array<{ dia: string; comProjeto: boolean; usd: number }>>(
      `SELECT ${DIA_SQL('"createdAt"')} AS dia, ("projectId" IS NOT NULL) AS "comProjeto", SUM("costUsd")::float8 AS usd
         FROM ai_usage WHERE "createdAt" >= $1 GROUP BY 1, 2`,
      desde
    ),
    prisma.$queryRawUnsafe<Array<{ dia: string; carteira: string; gastos: number }>>(
      `SELECT ${DIA_SQL('"createdAt"')} AS dia, carteira, (-SUM(amount))::int AS gastos
         FROM credit_transactions WHERE amount < 0 AND "createdAt" >= $1 GROUP BY 1, 2`,
      desde
    ),
    prisma.$queryRawUnsafe<Array<{ dia: string; platform: string; n: number }>>(
      // Sem filtro de status (01/10): post publicado e depois arquivado vira
      // "cancelled" e sumia do gráfico; a data de publicação é o fato.
      `SELECT ${DIA_SQL('"publishedAt"')} AS dia, platform, COUNT(*)::int AS n
         FROM posts WHERE "publishedAt" >= $1 GROUP BY 1, 2`,
      desde
    ),
    prisma.post.findMany({
      where: { status: "failed", updatedAt: { gte: desde } },
      select: { platform: true, metadata: true },
    }),
  ]);

  // ── O movimento: quem chegou, por qual porta ─────────────────────────────
  const somaNoBalde = (lista: Date[]) => {
    const v = zeros(n);
    for (const d of lista) {
      const b = noBalde(d);
      if (b !== undefined) v[b]++;
    }
    return v;
  };
  const realizadas = reunioes.filter((r) => r.status === "realizada" && r.inicio >= desde);
  const marcadasNaJanela = reunioes.filter((r) => r.createdAt >= desde);
  const movimento: SerieNoTempo[] = [
    { chave: "cadastros", nome: "Cadastros confirmados", cor: "var(--painel-1)", valores: somaNoBalde(cadastros.map((u) => u.createdAt)) },
    { chave: "leads", nome: "Leads", cor: "var(--painel-3)", valores: somaNoBalde(leads.map((l) => l.createdAt)) },
    // Marcada conta no dia em que a pessoa marcou (o esforço de venda daquele
    // dia); realizada conta no dia da reunião.
    { chave: "marcadas", nome: "Demonstrações marcadas", cor: "var(--painel-2)", valores: somaNoBalde(marcadasNaJanela.map((r) => r.createdAt)) },
    { chave: "realizadas", nome: "Demonstrações realizadas", cor: "var(--painel-4)", valores: somaNoBalde(realizadas.map((r) => r.inicio)) },
  ];

  // ── O dinheiro: receita real contra o custo de IA ────────────────────────
  // A receita entra no dia em que o pagamento foi confirmado; o custo entra
  // inteiro, com e sem projeto, porque o fornecedor cobra os dois.
  const custoDoDia = zeros(n);
  let custoForaDeProjeto = 0;
  for (const c of custos) {
    const b = eixo.balde(c.dia);
    if (b === undefined) continue;
    custoDoDia[b] += Number(c.usd) * DOLAR;
    if (!c.comProjeto) custoForaDeProjeto += Number(c.usd) * DOLAR;
  }
  const receitaDoDia = zeros(n);
  for (const p of pagamentos) {
    const b = noBalde(new Date(p.quando));
    if (b !== undefined) receitaDoDia[b] += p.reais;
  }
  const dinheiro: SerieNoTempo[] = [
    { chave: "receita", nome: "Receita real", cor: "var(--painel-1)", valores: receitaDoDia },
    { chave: "custo", nome: "Custo de IA", cor: "var(--painel-2)", valores: custoDoDia },
  ];

  // ── Os créditos: as duas carteiras ───────────────────────────────────────
  const plano = zeros(n);
  const video = zeros(n);
  for (const c of creditos) {
    const b = eixo.balde(c.dia);
    if (b === undefined) continue;
    (c.carteira === "video" ? video : plano)[b] += Number(c.gastos);
  }

  // ── As publicações, por rede ─────────────────────────────────────────────
  const porRede = new Map<string, number[]>();
  for (const p of publicadas) {
    const b = eixo.balde(p.dia);
    if (b === undefined) continue;
    const v = porRede.get(p.platform) ?? zeros(n);
    v[b] += Number(p.n);
    porRede.set(p.platform, v);
  }
  const redes = [...porRede.keys()].sort(
    (a, b) => (ORDEM_DAS_REDES.indexOf(a) + 1 || 99) - (ORDEM_DAS_REDES.indexOf(b) + 1 || 99)
  );

  // ── As falhas, por rede e por código ─────────────────────────────────────
  const falhasPorRede = new Map<string, number>();
  const falhasPorCodigo = new Map<string, { titulo: string; n: number }>();
  for (const f of falhas) {
    falhasPorRede.set(f.platform, (falhasPorRede.get(f.platform) ?? 0) + 1);
    const comCodigo = codigoDaFalha(f.metadata);
    const codigo = comCodigo ?? "sem código";
    const titulo = comCodigo ? traducaoCompleta(comCodigo).titulo : "Sem código (falha antiga, só com a frase)";
    const atual = falhasPorCodigo.get(codigo) ?? { titulo, n: 0 };
    atual.n++;
    falhasPorCodigo.set(codigo, atual);
  }

  return {
    dias,
    porSemana: eixo.porSemana,
    movimento: { baldes, series: movimento },
    dinheiro: { baldes, series: dinheiro },
    creditos: {
      baldes,
      series: [
        { chave: "plano", nome: "Créditos do plano", cor: "var(--painel-1)", valores: plano },
        { chave: "video", nome: "Créditos de vídeo", cor: "var(--painel-2)", valores: video },
      ],
    },
    publicacoes: {
      baldes,
      series: redes.map((r) => ({
        chave: r,
        nome: nomeDaRede(r),
        cor: COR_DA_REDE_NO_PAINEL[r] ?? "var(--painel-neutro)",
        valores: porRede.get(r)!,
      })),
    },
    falhas: {
      total: falhas.length,
      porRede: [...falhasPorRede.entries()].map(([rede, q]) => ({ rede: nomeDaRede(rede), n: q })).sort((a, b) => b.n - a.n),
      porCodigo: [...falhasPorCodigo.entries()].map(([codigo, v]) => ({ codigo, ...v })).sort((a, b) => b.n - a.n),
    },
    demonstracoes: {
      marcadas: marcadasNaJanela.length,
      realizadas: realizadas.length,
      faltou: reunioes.filter((r) => r.status === "faltou" && r.inicio >= desde).length,
      canceladas: marcadasNaJanela.filter((r) => r.status === "cancelada").length,
    },
    custoForaDeProjeto,
  };
}
