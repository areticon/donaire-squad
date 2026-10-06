import { lerParaAJornada } from "@/lib/media/jornada/leitura";
import { planejarJornada } from "@/lib/media/jornada/planejar";
import { contextoDoProjeto, jevDaJornada, redatorDaJornada } from "@/lib/media/jornada/servidor";
import type { Palavra, Pedaco } from "@/lib/media/jornada/linha-do-tempo";
import type { EstadoDaJornada } from "@/lib/media/jornada/estado";

/**
 * Os passos 3 e 4 da jornada no roteiro (antes do cliente ver a tela): a
 * leitura do vídeo original levada ao tempo editado e o plano por elemento.
 * Devolve o que vai para `roteiro.jornada`.
 */
export async function prepararPlanoDaJornada(p: {
  videoId: string;
  projectId: string;
  url: string;
  palavrasOriginais: Palavra[];
  duracaoOriginal: number;
  manter: Pedaco[];
  fala: { palavras: Palavra[]; duracao: number };
  formato: "9:16" | "16:9";
}): Promise<Pick<EstadoDaJornada, "edicaoId" | "leitura" | "amostras" | "plano" | "avisos" | "custoUsd" | "tempos" | "erro">> {
  const contexto = await contextoDoProjeto(p.projectId, p.formato, p.fala.duracao);
  const feito = await planejarJornada(
    { palavras: p.fala.palavras, contexto },
    {
      ler: () => lerParaAJornada({ url: p.url, palavras: p.palavrasOriginais, duracao: p.duracaoOriginal, manter: p.manter, projectId: p.projectId }),
      redator: redatorDaJornada(p.projectId, "jornada-ideias"),
      jev: jevDaJornada(),
      projectId: p.projectId,
    }
  );
  return {
    edicaoId: feito.plano.edicaoId,
    leitura: feito.leitura,
    amostras: feito.amostras,
    plano: feito.plano,
    avisos: feito.avisos.slice(0, 30),
    custoUsd: +feito.custoLeituraUsd.toFixed(4),
    tempos: feito.tempos,
    erro: feito.plano.elementos.length ? null : "o plano saiu sem elemento",
  };
}
