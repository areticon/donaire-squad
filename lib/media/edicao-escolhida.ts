import { CUSTO_DAS_INSERCOES_IA, estiloDoCatalogo, normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { resumoDaLegenda } from "@/lib/media/legenda-escolhida";
import { estiloIdDoComando, roteiroDeOutroComando, trechoDoComando, type ComandoComReferencia } from "@/lib/media/estilo-do-comando";

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
  /**
   * O roteiro do completo foi planejado com outro COMANDO (06/10): a tela
   * oferece "Refazer o roteiro no estilo novo". Só no editor por comando.
   */
  refazerRoteiro?: boolean;
  /**
   * Como o diretor edita (03/10): o corte limpo profissional (padrão de todo
   * estilo) ou as inserções de IA ligadas na tela de estilos, com o custo.
   */
  edicao: string;
  insercoesIA: boolean;
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
  /**
   * O COMANDO DO VÍDEO (06/10): quando existe, é ele que manda no estilo (a
   * referência do cartão da galeria). A escolha antiga só vale sem comando.
   */
  comando?: ComandoComReferencia;
  /** O texto do comando com que o roteiro do completo foi planejado (`completo.comando.texto`). */
  comandoDoRoteiro?: string | null;
}): ResumoDaEdicao {
  const escolha = normalizarEscolha(p.videoEstiloEscolha, p.videoStyle);
  const doComando = estiloIdDoComando(p.comando);
  const comandoProprio = Boolean(p.comando?.texto) && !doComando;
  const estiloId = doComando ?? escolha.estiloId;
  const e = estiloDoCatalogo(estiloId);
  const refazer = roteiroDeOutroComando(p.comando, p.comandoDoRoteiro);
  const planejado = refazer
    ? `outro estilo ("${trechoDoComando(p.comandoDoRoteiro)}")`
    : !p.comando && p.estiloDoRoteiro && p.estiloDoRoteiro !== estiloId
      ? estiloDoCatalogo(p.estiloDoRoteiro)?.nome ?? p.estiloDoRoteiro
      : null;
  const nome = comandoProprio ? "comando próprio do projeto" : e?.nome ?? estiloId;
  return {
    estiloId,
    estilo: nome,
    referencia: comandoProprio ? `"${trechoDoComando(p.comando?.texto)}"` : e?.referencia ?? null,
    doPadrao: !p.comando,
    legenda: resumoDaLegenda((p.videoEstiloEscolha as { legenda?: unknown } | null)?.legenda, null),
    trilha: p.videoMusicUrl ? `Trilha nos cortes: ${p.videoMusicName || nomeDoArquivo(p.videoMusicUrl)} (o vídeo completo sai sem trilha)` : "Sem trilha de fundo: os cortes saem só com a voz",
    efeitos: `Efeitos sonoros no estilo ${comandoProprio ? "do comando" : nome} (whoosh, pop, impacto)`,
    planejadoEm: planejado,
    refazerRoteiro: refazer,
    insercoesIA: Boolean(escolha.insercoesIA),
    edicao: escolha.insercoesIA
      ? `Inserções de IA ligadas: imagens e cenas geradas na linguagem do estilo (${CUSTO_DAS_INSERCOES_IA.texto})`
      : "Corte limpo profissional: você na tela, cortes nas pausas, punch-in nas ênfases, poucas cartelas de texto e legenda; sem imagem gerada",
  };
}
