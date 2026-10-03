import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import type { Trecho } from "@/lib/media/select-clips";
import type { Word } from "@/lib/media/transcribe";
import {
  detectarPausas,
  duracaoDosIntervalos,
  emendarNoSilencio,
  intervalosDoTrecho,
  montarLegendasDestaque,
  segundosRemovidos,
} from "@/lib/media/edicao";
import {
  detectarHesitacao,
  detectarFalsosComecos,
  detectarMuletasArrastadas,
  detectarRepeticoes,
  limpezaParaRemocoes,
  unirRemocoes,
  vetarRemocoesLongasDeFala,
} from "@/lib/media/limpeza";
import { escolherGanchos, ganchosNoTempoEditado } from "@/lib/media/abertura";
import { edicaoDaLinguagem } from "@/lib/media/linguagem-da-edicao";
import {
  escolherEfeitos,
  efeitosNoTempo,
  type EfeitoNoTempo,
} from "@/lib/media/efeitos";
import {
  legendaDoCorte,
  noTempoDoCorte,
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
  /** A trilha que o cliente subiu no projeto. Nula, os cortes saem sem música. */
  musicaUrl?: string | null;
  /** Os termos do negócio (Project.videoTerms), para a legenda escrever certo. */
  termos?: string | null;
  /** A escolha completa do catálogo (Project.videoEstiloEscolha). */
  escolha?: unknown;
  /** As cores da marca (Project.colorPalette). */
  colorPalette?: string | null;
  /**
   * As remoções que o cliente viu e aprovou na tela de roteiro (30/09,
   * `completoMontagem.roteiro.remocoes`). Com elas a limpeza por IA NÃO roda
   * de novo: ela não é determinística, e rodar outra vez daria um texto
   * diferente do aprovado (e pagaria duas vezes).
   */
  remocoesProntas?: Array<{ de: number; ate: number; motivo?: string }> | null;
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
  efeitos: number;
};

export { bordasDoCorte } from "@/lib/media/bordas-do-corte";
import { bordasDoCorte } from "@/lib/media/bordas-do-corte";

export async function montarPedidoDeCorte(
  video: VideoParaCortar,
  opcoes: { appUrl: string }
): Promise<{ corpo: string; resumo: ResumoDoPedido }> {
  const { trechos } = video;
  // Os termos do cliente entram aqui também, e não só na transcrição nova:
  // assim uma gravação já transcrita sai com a legenda certa no próximo corte,
  // sem pagar transcrição de novo.
  const palavras = aplicarTermos(video.palavras, parseTermos(video.termos));
  // A LINGUAGEM inteira que o cliente escolheu (30/09), e não só o perfil de
  // legenda: a legenda sai na linguagem e nas cores da marca, e o tratamento
  // (câmera, look, efeitos) vai ao worker. Ver lib/media/linguagem-da-edicao.ts.
  const { estilo, tratamento, legenda } = edicaoDaLinguagem(video.escolha, video.estilo, video.colorPalette);
  // "Sem legenda" (30/09, lib/media/legenda-escolhida.ts): o pedido sai sem
  // NENHUM arquivo de legenda, nem a fala nem as frases de destaque, que moram
  // no mesmo arquivo. O worker já trata legenda vazia como "nada a queimar",
  // então a escolha vale sem publicar o worker.
  const comLegenda = legenda.mostrar;

  // A limpeza (pausas, muletas, repetições e a limpeza por IA) mora em
  // `remocoesDaGravacao` desde 30/09, porque a tela de roteiro roda a MESMA
  // conta antes da aprovação e guarda o resultado; aqui ele só é reaproveitado.
  const limpeza = video.remocoesProntas?.length
    ? { remocoes: video.remocoesProntas.map((r) => ({ de: r.de, ate: r.ate, motivo: r.motivo ?? "roteiro" })), pausas: 0, hesitacoes: 0 }
    : await remocoesDaGravacao(palavras, video.durationSec, { id: video.id, projectId: video.projectId });
  const { remocoes } = limpeza;
  const pausas = { length: limpeza.pausas };
  const fala = { length: limpeza.hesitacoes };

  // Os ganchos da abertura, já convertidos para o tempo DEPOIS da edição.
  //
  // Falhar aqui não derruba o corte: o vídeo sai começando do começo, que
  // retém menos mas existe. O que NÃO pode é seguir calado, que foi o que
  // aconteceu por um tempo: a chamada estourava o teto de tokens em torno de
  // metade das vezes e o vídeo saía sem gancho, sem nada dizendo por quê.
  // A ABERTURA DE GANCHOS ESTA DESLIGADA, por decisao do Bruno em 24/08 a
  // noite: "olha o inicio do video, comeca comigo falando uma palavra sem
  // contexto, solta, depois trazendo uma frase que nao me ajuda em nada". O
  // corte a frio so funciona com frase que se sustenta sozinha, e a selecao
  // atual nao garante isso. O video completo passa a comecar do comeco, limpo.
  // O codigo de escolher ganchos fica, para religar quando a selecao merecer.
  const ganchos: ReturnType<typeof ganchosNoTempoEditado> = [];
  void escolherGanchos;

  // Cada trecho leva TRÊS coisas que dependem do tempo, e as três saem da mesma
  // lista de intervalos: o que o worker vai emendar, a legenda vertical e a
  // legenda horizontal. Uma lista só é o que garante que a legenda não ande
  // para fora da fala ao longo do corte.
  //
  // O início vai arredondado para baixo e o fim para cima porque é assim que o
  // worker recorta, e a legenda precisa nascer dos MESMOS números, e não dos
  // fracionários que o agente devolveu.
  //
  // Os EFEITOS saem de uma chamada por trecho, e em paralelo. Um trecho de 60
  // segundos rende no máximo sete momentos, então a chamada é curta; o que
  // custaria caro seria fazer as quatro em fila.
  //
  // Falhar aqui não derruba nada: o corte sai com legenda e sem reforço, que é
  // menos vivo mas existe.
  const efeitosPorTrecho = await Promise.all(
    trechos.map(async (t) => {
      try {
        const escolhidos = await escolherEfeitos(
          t.transcricao ?? "",
          bordasDoCorte(t, palavras).fim - bordasDoCorte(t, palavras).inicio,
          { projectId: video.projectId }
        );
        return efeitosNoTempo(escolhidos, palavras, bordasDoCorte(t, palavras).inicio, bordasDoCorte(t, palavras).fim);
      } catch (e) {
        console.error(
          `[${video.id}] efeitos falharam num trecho, ele sai sem reforço: ` +
            (e instanceof Error ? e.message : "motivo desconhecido")
        );
        return [] as EfeitoNoTempo[];
      }
    })
  );

  const paraOWorker = trechos.map((t, i) => {
    const { inicio, fim } = bordasDoCorte(t, palavras);
    // O que o cliente aprovou na tela de roteiro vale EXATAMENTE (30/09): o
    // texto que ele leu e o plano das cenas foram feitos sobre estes
    // intervalos, e a montagem só reaproveita o plano se o corte bater.
    const aprovado = (t as { roteiro?: { inicio: number; fim: number; manter: Array<{ de: number; ate: number }> } | null }).roteiro;
    // Com as palavras, a primeira e a última parte perdem o rabo de palavra de
    // fora do corte ("produtividade." abrindo o corte 1 do teste de 29/09).
    const manter =
      aprovado?.manter?.length && Math.abs(aprovado.inicio - inicio) < 0.01 && Math.abs(aprovado.fim - fim) < 0.01
        ? aprovado.manter
        : intervalosDoTrecho(remocoes, inicio, fim, palavras);
    const efeitos = efeitosPorTrecho[i] ?? [];

    // A frase de destaque vai para o arquivo de legenda, porque é texto e o
    // libass desenha texto. O emoji vai separado, porque o libass deste ffmpeg
    // desenha emoji sem cor, então ele entra como imagem sobreposta no worker.
    const destaques = efeitos
      .filter((e) => e.tipo === "frase")
      .map((e) => ({ segundo: e.segundo, valor: e.valor }));

    return {
      indice: i,
      inicio,
      fim,
      titulo: t.titulo,
      manter,
      // O EMOJI SAIU, por decisao do Bruno em 24/08: "era para ser uma edicao
      // simples". Ele derrubou o mesmo corte tres vezes em producao, com tres
      // construcoes diferentes do overlay, sempre com um erro que nao o
      // menciona. A FRASE de destaque fica, porque viaja dentro do arquivo de
      // legenda e nunca falhou. O worker trata lista vazia como "nada a
      // sobrepor", entao isto desativa o recurso sem deploy do worker.
      emojis: [],
      legendaVertical: comLegenda
        ? legendaDoCorte(palavras, inicio, manter, estilo, QUADRO_VERTICAL, destaques)
        : "",
      legendaHorizontal: comLegenda
        ? legendaDoCorte(palavras, inicio, manter, estilo, QUADRO_HORIZONTAL, destaques)
        : "",
      duracaoLimpaSec: Math.round(duracaoDosIntervalos(manter)),
      // Os momentos fortes da fala, no tempo do CORTE: é onde o worker põe o
      // flash, a luz vazada, o glitch e o zoom de impacto da linguagem.
      momentos: efeitos
        .map((e) => noTempoDoCorte(e.segundo, inicio, manter))
        .filter((x): x is number => x !== null)
        .map((x) => Math.round(x * 100) / 100),
    };
  });

  // O VIDEO COMPLETO leva os mesmos reforços, pelo pedido do Bruno em 24/08 de
  // que os comentários dele valem para o completo também.
  //
  // As FRASES entram no arquivo de legenda de destaque, que já existe, e os
  // EMOJI vão sobrepostos, como no corte. Os dois em tempo do ORIGINAL: quem
  // converte para a linha do tempo editada é `mapearTempo`, do lado do worker
  // não há conta nenhuma.
  //
  // O que NÃO entra é a legenda palavra a palavra, e isso é decisão dele de
  // 23/08, não esquecimento: "legenda em tudo polui o vídeo longo e compete com
  // quem fala". Os reforços aqui são pontuais e não brigam com essa regra.
  const todosOsEfeitos = efeitosPorTrecho.flat();

  // AS FRASES DE DESTAQUE DO COMPLETO SAÍRAM (30/09). No teste do Bruno a frase
  // "doze meses em vinte dias" aparecia fora de hora, em tipografia pobre, no
  // meio de outra fala. Com a montagem do completo ligada, o texto na tela é
  // dela, sincronizado palavra a palavra; a base sai limpa.
  void montarLegendasDestaque;
  const legendasAss = process.env.MONTAGEM_DO_COMPLETO === "1" || !comLegenda ? null : montarLegendasDestaque(trechos, remocoes, {
    fonte: estilo.legenda.fonte,
    frases: todosOsEfeitos
      .filter((e) => e.tipo === "frase")
      .map((e) => ({ segundo: e.segundo, valor: e.valor })),
  });

  const corpo = JSON.stringify({
    videoJobId: video.id,
    // A trilha do projeto. O worker baixa uma vez e mixa em todos os cortes,
    // com o volume e o ducking do estilo. O video COMPLETO fica sem trilha de
    // proposito: video longo de fala no YouTube nao pede musica continua, e
    // por a mesma faixa em 25 minutos cansaria antes do primeiro terco.
    musicaUrl: video.musicaUrl ?? null,
    sourceUrl: video.blobUrl,
    duracaoSec: video.durationSec,
    // O estilo inteiro, e não só o nome: o worker precisa do ritmo para o zoom
    // do fundo, e mandar o objeto evita ter a tabela de estilos nos dois lados.
    estilo: {
      nome: estilo.nome,
      ritmo: estilo.ritmo,
      som: estilo.som,
    },
    tratamento,
    trechos: paraOWorker,
    remocoes: remocoes.map((r) => ({ de: r.de, ate: r.ate })),
    emojisDoCompleto: [],
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
      efeitos: efeitosPorTrecho.reduce((n, e) => n + e.length, 0),
    },
  };
}

/**
 * As remoções da gravação inteira: pausas, falso começo, muleta arrastada,
 * repetição e a limpeza por IA, unidas, com o veto de fala longa e as bordas
 * no silêncio. Extraída de `montarPedidoDeCorte` em 30/09 sem mudar nada da
 * conta: a tela de roteiro roda isto ANTES da aprovação e guarda o resultado,
 * e o pedido ao worker usa o guardado (ver `remocoesProntas`).
 */
export async function remocoesDaGravacao(
  palavras: Word[],
  duracaoSec: number,
  ctx: { id: string; projectId: string; semIA?: boolean }
): Promise<{ remocoes: Array<{ de: number; ate: number; motivo: string }>; pausas: number; hesitacoes: number }> {
  const pausas = detectarPausas(palavras, duracaoSec);

  // A limpeza de fala vem DEPOIS das pausas e junto com elas, porque as duas
  // atacam problemas diferentes: pausa é silêncio, hesitação tem áudio.
  //
  // Falhar aqui não derruba o corte: o vídeo sai com as pausas removidas e a
  // fala como estava, que é pior mas existe.
  let fala: Awaited<ReturnType<typeof detectarHesitacao>> = [];
  try {
    // `semIA`: só o que é determinístico (prova de tela sem gastar, 30/09).
    if (!ctx.semIA) fala = await detectarHesitacao(palavras, { projectId: ctx.projectId });
  } catch (e) {
    console.error(
      `[${ctx.id}] limpeza de fala falhou, segue só com as pausas: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
  }

  // As repetições imediatas entram por CÓDIGO, além do agente. Medido em
  // 24/08: o agente deixou passar 93 palavras e 12 expressões repetidas, 40
  // segundos de cópias, e era o "eu, eu, eu" que o Bruno ouviu nos cortes.
  // O que é garantível por código entra por código: repetições imediatas e
  // hesitações arrastadas e, desde 02/09, o falso começo ("Eu, o, por que
  // existem", o tropeço do poema que o Bruno ouviu no vídeo entregue). O
  // agente continua cuidando do que é julgamento (recomeço de frase, muleta
  // que às vezes é conteúdo).
  // A folga do fade entra por ÚLTIMO, depois de tudo unido: se entrasse antes,
  // a união poderia colar duas remoções vizinhas e a folga do meio sumiria.
  // `emendarNoSilencio` (30/09) no lugar da folga cega: toda borda cai no
  // silêncio e nunca dentro de palavra. O "né" do teste de 29/09 estava marcado
  // e era cortado rente, e a folga do fade devolvia 20 a 30 ms dele.
  // `vetarRemocoesLongasDeFala` (29/09): nenhuma remoção unida tira mais de
  // 1,2 s de FALA; a que tira vira só as pausas que continha. Foi uma remoção
  // de 2,1 s de fala ("você, é delegar, né") que colou duas ideias no corte
  // de Moisés.
  const remocoes = emendarNoSilencio(
    vetarRemocoesLongasDeFala(
      unirRemocoes(
        unirRemocoes(
          unirRemocoes(pausas, detectarFalsosComecos(palavras)),
          detectarMuletasArrastadas(palavras)
        ),
        unirRemocoes(detectarRepeticoes(palavras), limpezaParaRemocoes(fala, palavras))
      ),
      palavras,
      pausas
    ),
    palavras
  );

  return { remocoes, pausas: pausas.length, hesitacoes: fala.length };
}
