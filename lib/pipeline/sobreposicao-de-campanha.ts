/**
 * SOBREPOSIÇÃO DE CAMPANHAS NO MESMO PERÍODO (05/10/2026).
 *
 * Até 05/10 toda campanha nova arquivava, sozinha, qualquer rascunho do
 * projeto que caísse nos dias dela (lib/pipeline/executar.ts). O critério era
 * "rascunho é proposta não aprovada, a nova substitui a antiga". Na prática,
 * em 05/10, um POST ÚNICO de segunda-feira cancelou os seis posts da semana
 * que o vídeo tinha acabado de gerar, porque a janela do único é a semana
 * inteira e o filtro não olhava run nem modo da campanha.
 *
 * A regra agora é a do Bruno: uma campanha NUNCA arquiva peça de outra
 * campanha por conta própria. O quadro aceita várias peças por dia, então a
 * campanha nova é SOMADA ao dia. O máximo que acontece é a tela avisar "já
 * existe peça neste dia" e oferecer a substituição, e só com essa escolha
 * explícita (`substituirRascunhos: true`) a esteira arquiva o que estava lá.
 * Post único e "pôr algo aqui" nunca substituem, nem com a opção marcada.
 *
 * Nada aqui toca o banco: é a regra pura, provada em
 * scripts/testes/sobreposicao-de-campanha-0510.test.mts.
 */

export type ConfigDeSobreposicao = {
  campaignMode: string;
  /** Segunda-feira da campanha (AAAA-MM-DD). */
  weekStart?: string;
  /** A escolha explícita da pessoa na janela "Nova campanha". */
  substituirRascunhos?: boolean;
};

/** A janela de dias que a campanha ocupa: [inicio, fim), em UTC a partir do weekStart. */
export function janelaDaCampanha(config: Pick<ConfigDeSobreposicao, "campaignMode" | "weekStart">): { inicio: Date; fim: Date } {
  const inicio = new Date(`${config.weekStart}T00:00:00.000Z`);
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + (config.campaignMode === "biweekly" ? 14 : 7));
  return { inicio, fim };
}

/**
 * A campanha pode arquivar os rascunhos de outras campanhas nos dias dela?
 * Só a campanha de semana (weekly e biweekly), e só com a escolha explícita.
 * Post único e recorrente nunca; o padrão (sem escolha) é somar ao dia.
 */
export function substituiRascunhos(config: ConfigDeSobreposicao): boolean {
  if (config.substituirRascunhos !== true) return false;
  return config.campaignMode === "weekly" || config.campaignMode === "biweekly";
}

export type PecaExistente = {
  runId: string | null;
  status: string;
  scheduledAt: Date | null;
};

export type DiaComPeca = { data: string; quantas: number };

/** Status que contam como "peça viva no dia" para o aviso da tela. */
const VIVA = new Set(["draft", "scheduled", "pending", "rejected"]);

/**
 * Os dias da campanha nova que já têm peça viva de OUTRA campanha. `datas`
 * são os dias que a campanha nova vai gerar (AAAA-MM-DD); peça fora deles não
 * entra, porque não há sobreposição.
 */
export function diasComPecaExistente(pecas: PecaExistente[], datas: string[], runAtual: string | null = null): DiaComPeca[] {
  const porData = new Map<string, number>();
  const quer = new Set(datas);
  for (const p of pecas) {
    if (!p.scheduledAt || !VIVA.has(p.status)) continue;
    if (runAtual && p.runId === runAtual) continue;
    const data = p.scheduledAt.toISOString().slice(0, 10);
    if (!quer.has(data)) continue;
    porData.set(data, (porData.get(data) ?? 0) + 1);
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, quantas]) => ({ data, quantas }));
}

/** As datas (AAAA-MM-DD) que a campanha vai gerar: weekStart mais os dias escolhidos, em uma ou duas semanas. */
export function datasDaCampanha(weekStart: string, dias: number[], semanas: 1 | 2): string[] {
  const base = new Date(`${weekStart}T00:00:00.000Z`);
  const datas: string[] = [];
  for (let s = 0; s < semanas; s++) {
    for (const dia of [...new Set(dias)].sort((a, b) => a - b)) {
      if (dia < 1 || dia > 7) continue;
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + s * 7 + (dia - 1));
      datas.push(d.toISOString().slice(0, 10));
    }
  }
  return datas;
}

function diaCurto(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

/** A frase do aviso na tela. Sem sobreposição, nada a dizer. */
export function avisoDeSobreposicao(dias: DiaComPeca[]): string | null {
  if (!dias.length) return null;
  const total = dias.reduce((n, d) => n + d.quantas, 0);
  const lista = dias.map((d) => diaCurto(d.data)).join(", ");
  return dias.length === 1
    ? `Já existe ${total === 1 ? "1 peça" : `${total} peças`} em ${lista}. A campanha nova é somada ao dia; nada do que está lá é tocado.`
    : `Já existem peças em ${lista} (${total} no total). A campanha nova é somada a esses dias; nada do que está lá é tocado.`;
}
