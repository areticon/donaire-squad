import type { LeituraDaJornada } from "@/lib/media/jornada/leitura";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import { escreverIdeias, type Redator } from "@/lib/media/jornada/ideias";
import { decidirPlano, momentosComIdeias, type Jev } from "@/lib/media/jornada/decisoes";
import { frasesDaFala, type Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { novaEdicaoId, type AmostraDaJornada, type PlanoDaJornada } from "@/lib/media/jornada/estado";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";

/**
 * OS PASSOS 3 E 4 DA JORNADA, na ordem da jornada (E2): primeiro a LEITURA do
 * vídeo (Gemini descreve), depois as IDEIAS (Sonnet escreve, com a leitura no
 * pedido) e só então as DECISÕES (JEV decide). O plano nasce já sabendo o que
 * o vídeo mostra. As dependências entram por injeção (a prova sem IA paga usa
 * simulações; o servidor passa as de verdade).
 */

export type DependenciasDoPlano = {
  /** O passo 3: a leitura do vídeo (null quando a jornada já tem a leitura gravada). */
  ler: () => Promise<LeituraDaJornada>;
  redator: Redator;
  jev: Jev;
  projectId?: string | null;
};

export type PlanoFeito = {
  plano: PlanoDaJornada;
  leitura: LeituraDoVideo | null;
  amostras: AmostraDaJornada[];
  avisos: string[];
  descartados: Array<{ frase: number; motivo: string }>;
  custoLeituraUsd: number;
  tempos: Record<string, number>;
};

export async function planejarJornada(
  e: { palavras: Palavra[]; contexto: ContextoDaJornada; leituraPronta?: { leitura: LeituraDoVideo | null; amostras: AmostraDaJornada[] } | null },
  deps: DependenciasDoPlano
): Promise<PlanoFeito> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const marcar = (n: string) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const avisos: string[] = [];
  // 1. A LEITURA, antes de tudo (passo 3).
  let leitura: LeituraDoVideo | null = e.leituraPronta?.leitura ?? null;
  let amostras: AmostraDaJornada[] = e.leituraPronta?.amostras ?? [];
  let custoLeituraUsd = 0;
  if (!e.leituraPronta) {
    try {
      const l = await deps.ler();
      leitura = l.leitura;
      amostras = l.amostras;
      custoLeituraUsd = l.custoUsd;
      avisos.push(...l.avisos);
    } catch (err) {
      avisos.push(`leitura do vídeo falhou (${err instanceof Error ? err.message.slice(0, 140) : err}); o plano segue sem ela`);
    }
  }
  marcar("leitura");
  // 2. AS IDEIAS, com a leitura no pedido (passo 4, Sonnet).
  const frases = frasesDaFala(e.palavras);
  const { ideias, erros } = await escreverIdeias({ frases, palavras: e.palavras, contexto: e.contexto, leitura, redator: deps.redator });
  avisos.push(...erros);
  marcar("ideias");
  // 3. AS DECISÕES (passo 4, JEV).
  const edicaoId = novaEdicaoId();
  const momentos = momentosComIdeias(frases, ideias, leitura);
  const d = momentos.length
    ? await decidirPlano(momentos, { contexto: e.contexto, leitura, jev: deps.jev, projectId: deps.projectId, novoId: (k) => `el${k + 1}` })
    : { densidade: { id: "media", faixa: [8, 15] as [number, number], criterio: "" }, elementos: [], descartados: [], custoTotalUsd: 0 };
  marcar("decisoes");
  const plano: PlanoDaJornada = {
    versao: 1,
    edicaoId,
    estiloDoCliente: e.contexto.estiloDoCliente,
    densidade: { segundosEntreElementos: d.densidade.faixa, porque: `escolhida pelo JEV: ${d.densidade.criterio}` },
    elementos: d.elementos,
    custoTotalUsd: d.custoTotalUsd,
    feitoEm: new Date().toISOString(),
    formato: e.contexto.formato,
    duracao: e.contexto.duracao,
  };
  return { plano, leitura, amostras, avisos, descartados: d.descartados, custoLeituraUsd, tempos };
}
