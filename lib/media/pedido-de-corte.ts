import type { Trecho } from "@/lib/media/select-clips";
import type { Word } from "@/lib/media/transcribe";
import {
  detectarPausas,
  duracaoDosIntervalos,
  intervalosDoTrecho,
  montarLegendasDestaque,
  segundosRemovidos,
} from "@/lib/media/edicao";
import {
  detectarHesitacao,
  limpezaParaRemocoes,
  unirRemocoes,
} from "@/lib/media/limpeza";
import { escolherGanchos, ganchosNoTempoEditado } from "@/lib/media/abertura";
import { estiloDoProjeto } from "@/lib/media/estilos";
import {
  legendaDoCorte,
  QUADRO_HORIZONTAL,
  QUADRO_VERTICAL,
} from "@/lib/media/legenda-falada";

/**
 * O pedido que o app manda ao worker, montado num lugar só.
 *
 * ## Por que isto virou um módulo em vez de ficar dentro da rota
 *
 * Porque a mesma lógica já existia em dois lugares e as duas cópias divergiram.
 * O script de teste `rodar-corte` reconstruía o corpo do pedido, e em 23 e 24/08
 * isso custou caro várias vezes, sempre igual: o produto era consertado, o
 * script continuava com o desenho velho, e o teste dizia uma coisa enquanto a
 * produção fazia outra. Passar a IMPORTAR os módulos reais resolveu metade,
 * porque as pausas e os ganchos passaram a ser os de verdade, mas o CORPO do
 * pedido continuou sendo escrito duas vezes.
 *
 * Agora é uma função só. A rota faz o que só ela pode fazer, que é autenticar,
 * tomar o estado no banco e despachar; o script faz o que só ele faz, que é
 * achar o vídeo. O resto é este arquivo.
 *
 * ## O que é decidido AQUI e não no worker, e por quê
 *
 * Tudo que envolve tempo e tudo que envolve IA. A matemática do deslocamento
 * (onde cada instante da gravação vai parar depois da limpeza) mora num lugar
 * só, senão as duas contas divergem; e a conta de custo de IA do projeto
 * também vive num lugar só, além de prompt de agente ser produto, que se edita
 * num lugar só.
 *
 * O worker recebe listas prontas e só executa.
 *
 * ## O que NÃO está aqui, e por quê
 *
 * O fundo gerado dos cortes morava neste arquivo até 24/08 e mudou para a rota
 * `/enquadrar`. A razão é a sacada do Bruno sobre o halo: o fundo precisa ter o
 * brilho da parede da gravação, e para medir esse brilho é preciso saber onde a
 * pessoa está no quadro, o que só o agente de visão diz. Aqui, na hora de
 * despachar, essa informação ainda não existe.
 */

export type VideoParaCortar = {
  id: string;
  blobUrl: string;
  durationSec: number;
  projectId: string;
  trechos: Trecho[];
  palavras: Word[];
  /** O estilo de edição escolhido no projeto. Sem escolha, cai no acelerado. */
  estilo: string | null;
};

export type ResumoDoPedido = {
  trechos: number;
  remocoes: number;
  pausas: number;
  hesitacoes: number;
  ganchos: number;
  segundosRemovidos: number;
  estilo: string;
  comLegenda: number;
};

export async function montarPedidoDeCorte(
  video: VideoParaCortar,
  opcoes: { appUrl: string }
): Promise<{ corpo: string; resumo: ResumoDoPedido }> {
  const { palavras, trechos } = video;
  const estilo = estiloDoProjeto(video.estilo);

  const pausas = detectarPausas(palavras, video.durationSec);

  // A limpeza de fala vem DEPOIS das pausas e junto com elas, porque as duas
  // atacam problemas diferentes: pausa é silêncio, hesitação tem áudio.
  //
  // Falhar aqui não derruba o corte: o vídeo sai com as pausas removidas e a
  // fala como estava, que é pior mas existe.
  let fala: Awaited<ReturnType<typeof detectarHesitacao>> = [];
  try {
    fala = await detectarHesitacao(palavras, { projectId: video.projectId });
  } catch (e) {
    console.error(
      `[${video.id}] limpeza de fala falhou, segue só com as pausas: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
  }

  const remocoes = unirRemocoes(pausas, limpezaParaRemocoes(fala, palavras));
  const legendasAss = montarLegendasDestaque(trechos, remocoes, {
    fonte: estilo.legenda.fonte,
  });

  // Os ganchos da abertura, já convertidos para o tempo DEPOIS da edição.
  //
  // Falhar aqui não derruba o corte: o vídeo sai começando do começo, que
  // retém menos mas existe. O que NÃO pode é seguir calado, que foi o que
  // aconteceu por um tempo: a chamada estourava o teto de tokens em torno de
  // metade das vezes e o vídeo saía sem gancho, sem nada dizendo por quê.
  let ganchos: ReturnType<typeof ganchosNoTempoEditado> = [];
  try {
    ganchos = ganchosNoTempoEditado(
      await escolherGanchos(trechos, { projectId: video.projectId }),
      remocoes
    );
  } catch (e) {
    console.error(
      `[${video.id}] abertura falhou, vídeo sai sem gancho: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
  }

  // Cada trecho leva TRÊS coisas que dependem do tempo, e as três saem da mesma
  // lista de intervalos: o que o worker vai emendar, a legenda vertical e a
  // legenda horizontal. Uma lista só é o que garante que a legenda não ande
  // para fora da fala ao longo do corte.
  //
  // O início vai arredondado para baixo e o fim para cima porque é assim que o
  // worker recorta, e a legenda precisa nascer dos MESMOS números, e não dos
  // fracionários que o agente devolveu.
  const paraOWorker = trechos.map((t, i) => {
    const inicio = Math.floor(t.inicio);
    const fim = Math.ceil(t.fim);
    const manter = intervalosDoTrecho(remocoes, inicio, fim);
    return {
      indice: i,
      inicio,
      fim,
      titulo: t.titulo,
      manter,
      legendaVertical: legendaDoCorte(palavras, inicio, manter, estilo, QUADRO_VERTICAL),
      legendaHorizontal: legendaDoCorte(palavras, inicio, manter, estilo, QUADRO_HORIZONTAL),
      duracaoLimpaSec: Math.round(duracaoDosIntervalos(manter)),
    };
  });

  const corpo = JSON.stringify({
    videoJobId: video.id,
    sourceUrl: video.blobUrl,
    duracaoSec: video.durationSec,
    // O estilo inteiro, e não só o nome: o worker precisa do ritmo para o zoom
    // do fundo, e mandar o objeto evita ter a tabela de estilos nos dois lados.
    estilo: {
      nome: estilo.nome,
      ritmo: estilo.ritmo,
      som: estilo.som,
    },
    trechos: paraOWorker,
    remocoes: remocoes.map((r) => ({ de: r.de, ate: r.ate })),
    ganchos: ganchos.map((g) => ({ inicio: g.inicio, fim: g.fim })),
    legendasAss,
    enquadramentoUrl: `${opcoes.appUrl}/api/videos/${video.id}/enquadrar`,
    callbackUrl: `${opcoes.appUrl}/api/videos/${video.id}/cortar-callback`,
  });

  return {
    corpo,
    resumo: {
      trechos: trechos.length,
      remocoes: remocoes.length,
      pausas: pausas.length,
      hesitacoes: fala.length,
      ganchos: ganchos.length,
      segundosRemovidos: Math.round(segundosRemovidos(remocoes)),
      estilo: estilo.nome,
      comLegenda: paraOWorker.filter((t) => t.legendaVertical).length,
    },
  };
}
