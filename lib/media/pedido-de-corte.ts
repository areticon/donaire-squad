import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import type { Trecho } from "@/lib/media/select-clips";
import type { Word } from "@/lib/media/transcribe";
import {
  detectarPausas,
  duracaoDosIntervalos,
  folgaParaEmenda,
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
} from "@/lib/media/limpeza";
import { escolherGanchos, ganchosNoTempoEditado } from "@/lib/media/abertura";
import { estiloDoProjeto } from "@/lib/media/estilos";
import {
  escolherEfeitos,
  efeitosNoTempo,
  type EfeitoNoTempo,
} from "@/lib/media/efeitos";
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
  /** A trilha que o cliente subiu no projeto. Nula, os cortes saem sem música. */
  musicaUrl?: string | null;
  /** Os termos do negócio (Project.videoTerms), para a legenda escrever certo. */
  termos?: string | null;
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

export async function montarPedidoDeCorte(
  video: VideoParaCortar,
  opcoes: { appUrl: string }
): Promise<{ corpo: string; resumo: ResumoDoPedido }> {
  const { trechos } = video;
  // Os termos do cliente entram aqui também, e não só na transcrição nova:
  // assim uma gravação já transcrita sai com a legenda certa no próximo corte,
  // sem pagar transcrição de novo.
  const palavras = aplicarTermos(video.palavras, parseTermos(video.termos));
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
  const remocoes = folgaParaEmenda(
    unirRemocoes(
      unirRemocoes(
        unirRemocoes(pausas, detectarFalsosComecos(palavras)),
        detectarMuletasArrastadas(palavras)
      ),
      unirRemocoes(detectarRepeticoes(palavras), limpezaParaRemocoes(fala, palavras))
    )
  );

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
          Math.ceil(t.fim) - Math.floor(t.inicio),
          { projectId: video.projectId }
        );
        return efeitosNoTempo(escolhidos, palavras, Math.floor(t.inicio), Math.ceil(t.fim));
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
    const inicio = Math.floor(t.inicio);
    const fim = Math.ceil(t.fim);
    const manter = intervalosDoTrecho(remocoes, inicio, fim);
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
      legendaVertical: legendaDoCorte(
        palavras, inicio, manter, estilo, QUADRO_VERTICAL, destaques
      ),
      legendaHorizontal: legendaDoCorte(
        palavras, inicio, manter, estilo, QUADRO_HORIZONTAL, destaques
      ),
      duracaoLimpaSec: Math.round(duracaoDosIntervalos(manter)),
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

  const legendasAss = montarLegendasDestaque(trechos, remocoes, {
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
