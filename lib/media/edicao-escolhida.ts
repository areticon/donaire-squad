import { estiloDoCatalogo, normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { resumoDaLegenda } from "@/lib/media/legenda-escolhida";

/**
 * COMO ESTE VÍDEO VAI SER EDITADO, em uma linha honesta (02/10/2026).
 *
 * O Bruno gerou um vídeo do gêmeo e perguntou: "como ele vai editar? baseado
 * em quê?". O fluxo do gêmeo nunca mostrava estilo, legenda nem trilha: usava
 * o padrão salvo no projeto, calado. Aqui mora o resumo que a página do gêmeo
 * e a tela de roteiro mostram no topo, com "Trocar". Módulo PURO: a página do
 * servidor monta com os campos do projeto, a tela só desenha.
 *
 * De onde vem o som, conferido no código (02/10):
 *   - a TRILHA é o arquivo que o cliente subiu no projeto (`videoMusicUrl`).
 *     Toca nos CORTES, no volume do estilo e abaixando sob a voz
 *     (lib/media/pedido-de-corte.ts, worker/src/montagem.mjs). O vídeo
 *     COMPLETO sai sem trilha, de propósito (fala longa no YouTube);
 *   - os EFEITOS SONOROS (whoosh, pop, impacto) vêm do estilo, sintetizados
 *     no worker (lib/media/sons-da-montagem.ts), no completo e nos cortes;
 *   - a BATIDA só existe com trilha: os cortes de cena encaixam nela.
 */
export type ResumoDaEdicao = {
  estiloId: string;
  estilo: string;
  referencia: string | null;
  /** O estilo veio do padrão salvo no projeto (ninguém escolheu neste vídeo). */
  doPadrao: boolean;
  legenda: string;
  trilha: string;
  efeitos: string;
  /** O roteiro foi planejado em outro estilo (o nome dele), quando difere do de agora. */
  planejadoEm?: string | null;
};

const nomeDoArquivo = (url: string) => {
  try {
    const ultimo = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return ultimo.replace(/-[A-Za-z0-9]{20,}(?=\.[a-z0-9]+$)/, "") || "faixa do projeto";
  } catch {
    return "faixa do projeto";
  }
};

export function resumoDaEdicao(p: {
  videoEstiloEscolha: unknown;
  videoStyle: string | null;
  videoMusicUrl?: string | null;
  /** O nome do arquivo que o cliente subiu (Project.videoMusicName). */
  videoMusicName?: string | null;
  /** O estilo em que o roteiro deste vídeo foi planejado, se já existe. */
  estiloDoRoteiro?: string | null;
}): ResumoDaEdicao {
  const escolha = normalizarEscolha(p.videoEstiloEscolha, p.videoStyle);
  const e = estiloDoCatalogo(escolha.estiloId);
  const planejado = p.estiloDoRoteiro && p.estiloDoRoteiro !== escolha.estiloId ? estiloDoCatalogo(p.estiloDoRoteiro)?.nome ?? p.estiloDoRoteiro : null;
  return {
    estiloId: escolha.estiloId,
    estilo: e?.nome ?? escolha.estiloId,
    referencia: e?.referencia ?? null,
    doPadrao: true,
    legenda: resumoDaLegenda((p.videoEstiloEscolha as { legenda?: unknown } | null)?.legenda, null),
    trilha: p.videoMusicUrl ? `Trilha nos cortes: ${p.videoMusicName || nomeDoArquivo(p.videoMusicUrl)} (o vídeo completo sai sem trilha)` : "Sem trilha de fundo: os cortes saem só com a voz",
    efeitos: "Efeitos sonoros do estilo (whoosh, pop, impacto)",
    planejadoEm: planejado,
  };
}
