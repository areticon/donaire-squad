/**
 * OS DADOS DOS GRÁFICOS DO PAINEL, só os tipos e as contas puras (01/10).
 *
 * Módulo SEM banco, de propósito: os gráficos com passar do mouse são
 * componentes de cliente e precisam destes tipos, e importar
 * lib/admin/graficos-do-painel.ts no navegador arrastaria o driver do banco
 * para o bundle (a mesma armadilha de lib/admin/segmentos.ts).
 */

/** Os três períodos do seletor. Qualquer outro valor vira 30. */
export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function periodoDaUrl(valor: string | string[] | undefined): Periodo {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/**
 * Um balde do eixo do tempo: um dia (7 e 30 dias) ou uma semana (90 dias).
 * Noventa barras diárias no celular viram uma escova; treze semanas leem.
 */
export type Balde = {
  /** Rótulo curto do eixo: "01/10". */
  rotulo: string;
  /** Rótulo do balão: "qua, 01/10" ou "semana de 24/09 a 30/09". */
  dica: string;
};

export type SerieNoTempo = {
  chave: string;
  nome: string;
  /** Token CSS da cor (var(--painel-1) etc.). */
  cor: string;
  valores: number[];
};

export type DadosNoTempo = {
  baldes: Balde[];
  series: SerieNoTempo[];
};

export type FalhasResumo = {
  total: number;
  porRede: Array<{ rede: string; n: number }>;
  porCodigo: Array<{ codigo: string; titulo: string; n: number }>;
};

/** Tudo o que os gráficos novos precisam, já contado no servidor. */
export type DadosDosGraficos = {
  dias: Periodo;
  porSemana: boolean;
  /** Cadastros de gente, leads, demonstrações marcadas e realizadas. */
  movimento: DadosNoTempo;
  /** Custo de IA e receita proporcional, em reais, por balde. */
  dinheiro: DadosNoTempo;
  /** Créditos consumidos por balde, nas duas carteiras. */
  creditos: DadosNoTempo;
  /** Publicações por balde, uma série por rede. */
  publicacoes: DadosNoTempo;
  falhas: FalhasResumo;
  /** Demonstrações no período, para os números ao lado do gráfico. */
  demonstracoes: { marcadas: number; realizadas: number; faltou: number; canceladas: number };
  /**
   * Custo de IA sem projeto (demo pública e afins), em reais. Fica fora da
   * margem por cliente, como sempre ficou, mas aparece ao lado do gráfico.
   */
  custoForaDeProjeto: number;
};

/** Soma de uma série, para os números que acompanham cada gráfico. */
export const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

/** Acumula uma série: o dia 3 passa a valer dia 1 + dia 2 + dia 3. */
export function acumular(v: number[]): number[] {
  let t = 0;
  return v.map((x) => (t += x));
}

export const reais = (n: number, casas = 0) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: casas, minimumFractionDigits: casas });

export const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// A COMPARAÇÃO COM O PERÍODO ANTERIOR (06/10, painel no estilo do Stripe)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma série no período do seletor e a mesma série no período anterior do
 * mesmo tamanho, balde a balde: o balde 0 de `anterior` é o primeiro dia (ou
 * semana) da janela anterior. É o que desenha a linha tracejada.
 */
export type SerieComparada = { atual: number[]; anterior: number[] };

export type ComparacaoDoPainel = {
  /** Os baldes da janela atual (rótulos do eixo). */
  baldes: Balde[];
  /** Os baldes da janela anterior, para o balão dizer de que dia é o tracejado. */
  baldesAnteriores: Balde[];
  /** "07/09 a 06/10", para a frase "contra 07/09 a 06/10". */
  rotuloAnterior: string;
  /** Custo real de IA, em reais, por balde: tudo, com e sem projeto. */
  custo: SerieComparada;
  /** A parte do custo que é de cliente (projeto de conta fora da equipe). */
  custoDeCliente: SerieComparada;
  /** Receita real (pagamento confirmado), em reais, por balde. */
  receita: SerieComparada;
  /** Créditos consumidos, líquidos de estorno, sem recarga, nas duas carteiras. */
  creditos: SerieComparada;
  /** Cadastros de gente (e-mail confirmado, sem robô, sem admin). */
  cadastros: SerieComparada;
};

/**
 * A variação contra o período anterior, como o Stripe escreve: "+12,4%".
 * Sem base (anterior zero) não existe porcentagem honesta: volta null, e a
 * tela escreve "novo" quando há valor agora, ou nada quando os dois são zero.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / Math.abs(anterior);
}
