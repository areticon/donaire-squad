import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { midiaProduzida } from "@/lib/media/storage";
import { faststart } from "@/lib/media/faststart";
import { pedirVideo, estenderVideo, olharOperacao, baixarVideo, type QualidadeDoVideo, type VozDoNarrador } from "@/lib/media/veo";
import { debitarVideo, creditarVideo, custoDoVideo, saldoDeVideo, jaCreditado as jaEstornado } from "@/lib/credits/video";
import { geracoesDoVideo, creditosPorGeracao, SEGUNDOS_DA_PRIMEIRA_GERACAO } from "@/lib/credits/video-tabela";
import { jaCobrado } from "@/lib/credits";
import { enfileirar, MAX_TENTATIVAS } from "@/lib/fila/trabalhos";
import { tetoDoPlanoEstourado } from "@/lib/fila/cota-do-video";
import { marcarFalhaNaPeca, limparMarcaDoVideo } from "@/lib/media/marca-do-video";
import { passoGuardado, guardarPasso } from "@/lib/media/checkpoint-do-video";

/**
 * O TRABALHO DE VÍDEO POR IA, do débito ao arquivo no ar.
 *
 * Vive na fila, e não na requisição, por dois motivos que se somam: o Veo leva
 * de 60 a 300 segundos, e a plataforma mata a função bem antes disso. Foi esse
 * teto que manteve o vídeo desligado no pipeline mesmo antes do problema de
 * custo (a nota antiga em executar.ts dizia "impossible within the 300s
 * pipeline budget", e era verdade).
 *
 * A ORDEM DAS ETAPAS É O PRODUTO, e não detalhe de implementação:
 *
 *   1. DEBITA ANTES de pedir. Pedir primeiro e cobrar depois deixa o cliente
 *      sem saldo com o custo já gasto na nossa conta;
 *   2. o débito é IDEMPOTENTE por `refId`, porque a fila repete um trabalho
 *      que expirou e cobrar duas vezes pelo mesmo vídeo é a pior falha que
 *      este arquivo pode ter;
 *   3. FALHOU DEPOIS DE COBRAR, DEVOLVE. Um vídeo custa de R$ 6 a R$ 17 de
 *      custo variável; cobrar e não entregar é a reclamação mais cara que o
 *      produto pode gerar.
 *
 * ## A CADEIA, desde 21/09 (o vídeo de até 1 minuto)
 *
 * Nenhum gerador entrega 60 s numa chamada. O Veo 3.1 gera 8 s e ESTENDE em
 * passos de 7 s (até 148 s), cada passo uma geração paga, devolvendo o vídeo
 * inteiro até ali. Uma geração leva de 1 a 5 minutos, e o trabalho da fila
 * tem 1000 s: nove gerações não cabem num trabalho só. Então:
 *
 *   • o trabalho `video-ia` faz a PRIMEIRA geração e, se o vídeo pede mais,
 *     enfileira um `video-ia-extensao` para o passo 2, no mesmo grupo e na
 *     mesma ordem (a fila desempata por ordem de criação);
 *   • cada `video-ia-extensao` estende o vídeo do passo anterior (o arquivo
 *     que o Veo guarda por dois dias) e enfileira o próximo, até o último;
 *   • o mp4 só vai para os posts e para o card no FIM. No meio, os posts de
 *     vídeo continuam com o quadro, e a guarda do publicador os segura ("o
 *     vídeo ainda não existe"), que é o certo: publicar 15 s de um vídeo de
 *     60 s seria entregar metade e cobrar inteiro;
 *   • o débito é UM, da cadeia inteira, antes da primeira geração (o saldo
 *     foi conferido na campanha). Se a cadeia morre no passo k, o que existe
 *     (k menos 1 gerações) vai para os posts, e as gerações que não saíram
 *     são estornadas, uma a uma;
 *   • cada passo tem CHECKPOINT no Blob (lib/media/checkpoint-do-video.ts):
 *     a tentativa seguinte de um trabalho derrubado retoma a operação em vez
 *     de pagar outra. A lição do carrossel, parte 145.
 */

/** Uma cena da cadeia: o que se vê e o que o narrador diz naquele trecho. */
export interface CenaDoVideo {
  /** O que acontece neste trecho, em inglês, na mesma cena do anterior. */
  visual: string;
  /** A frase do narrador neste trecho, em português. Vazio é trecho mudo. */
  narracao?: string;
}

export interface PedidoDeVideoDaFila {
  postId?: string;
  cardId?: string;
  projectId: string;
  runId?: string;
  /**
   * O dia da campanha a que este video pertence.
   *
   * Existe para o mp4 chegar em TODAS as redes daquele dia, e nao so no post
   * que deu nome ao trabalho. Ver o comentario no corpo de `entregarVideo`.
   */
  dayOfWeek?: number;
  /**
   * Os posts exatos deste dia. Entrou em 21/09: numa campanha quinzenal o
   * dia 1 existe na semana 1 e na semana 2, e a chave (runId, dayOfWeek)
   * mandava o mp4 de uma semana para os posts da outra. Com a lista, o
   * vídeo vai só para quem o pediu; sem ela (pedido antigo), cai na chave.
   */
  postIds?: string[];
  userId: string;
  /**
   * Referência própria, para o vídeo REFEITO a pedido (28/09): a do pedido
   * original já tem débito, estorno e checkpoint gravados. Ver regerar-video.ts.
   */
  referencia?: string;
  prompt: string;
  narracao?: string;
  /** A voz escolhida na janela da campanha. A mesma em todas as gerações. */
  voz?: VozDoNarrador;
  /**
   * A duração pedida: 4, 6 ou 8 numa geração só; 15, 30 ou 60 em cadeia.
   * O que sai de fato é `segundosEntregues(segundos)` (8 + 7 por extensão).
   */
  segundos: number;
  qualidade: QualidadeDoVideo;
  proporcao: "16:9" | "9:16";
  /**
   * O roteiro em cenas para vídeo acima de 8 s: a cena 1 é a geração inicial
   * (8 s) e cada cena seguinte é uma extensão de 7 s. Sem roteiro (pedido
   * antigo, ou a Diana falhou em escrevê-lo), a cadeia continua a mesma cena
   * com um prompt genérico e sem narração nova.
   */
  cenas?: CenaDoVideo[];
}

/** O que um trabalho `video-ia-extensao` precisa para rodar sozinho. */
export interface PedidoDeExtensaoDaFila {
  /** A mesma referência do trabalho inicial: é a chave do débito e do checkpoint. */
  referencia: string;
  /** Qual geração esta é (2 em diante) e quantas a cadeia tem. */
  passo: number;
  totalDeGeracoes: number;
  /** O vídeo até aqui: o arquivo no Google (entrada da extensão) e o mp4 no Blob. */
  arquivoUri: string;
  blobUrl: string;
  segundosAteAqui: number;
  /** O pedido original, para a entrega e o estorno. */
  original: PedidoDeVideoDaFila;
}

/** Quanto tempo a fila espera o Veo antes de desistir desta tentativa. */
const ESPERA_MAXIMA_MS = 9 * 60 * 1000;
const INTERVALO_MS = 10_000;

/**
 * O Veo, injetável: a prova da cadeia roda com um Veo de mentira e a fila de
 * verdade, porque cada geração real custa R$ 6 e a lógica de débito, estorno,
 * checkpoint e encadeamento é o que precisa ser provada sem pagar nove vezes.
 */
export interface Gerador {
  pedir: typeof pedirVideo;
  estender: typeof estenderVideo;
  olhar: typeof olharOperacao;
  baixar: typeof baixarVideo;
}
const VEO: Gerador = { pedir: pedirVideo, estender: estenderVideo, olhar: olharOperacao, baixar: baixarVideo };

export interface OpcoesDoTrabalho {
  /** A ordem do trabalho na fila, para a extensão entrar logo atrás. */
  ordem?: number;
  /** Qual tentativa é esta (1 a MAX_TENTATIVAS). Decide se a falha é definitiva. */
  tentativa?: number;
  gerador?: Gerador;
}

function referenciaDoPedido(pedido: PedidoDeVideoDaFila): string {
  return pedido.referencia ?? pedido.postId ?? pedido.cardId ?? `${pedido.projectId}-${pedido.runId ?? "avulso"}`;
}

function grupoDoPedido(pedido: PedidoDeVideoDaFila, referencia: string): string {
  return pedido.runId ?? `video:${referencia}`;
}

export async function rodarVideoDaIa(pedido: PedidoDeVideoDaFila, opcoes: OpcoesDoTrabalho = {}): Promise<string> {
  const gerador = opcoes.gerador ?? VEO;
  const total = geracoesDoVideo(pedido.segundos);
  const custo = custoDoVideo(pedido.segundos, pedido.qualidade);
  const referencia = referenciaDoPedido(pedido);

  /**
   * 0. O TETO DO PLANO, ANTES DO DÉBITO.
   *
   * A janela da campanha já avisa antes da escolha, mas aviso não é guarda:
   * quem entra pela rota, pela retomada da fila ou por um pedido antigo passa
   * por cima dele, e aí UM cliente consome a cota do fornecedor, que é da
   * plataforma inteira. Foi o que aconteceu em 21/09, quando um vídeo de 60 s
   * levou nove das dez gerações do dia.
   *
   * Vem ANTES de cobrar de propósito: debitar e depois pausar deixaria o
   * cliente com crédito preso num trabalho que não roda hoje. O erro sobe, a
   * fila o reconhece como cota (`ehCotaDeVideo`), pausa sem gastar tentativa e
   * tenta de novo a cada dez minutos, até o contador do dia virar.
   */
  const estourou = await tetoDoPlanoEstourado(pedido.userId, total);
  if (estourou) throw new Error(estourou);

  // 1. Debita, uma vez só, da carteira de VÍDEO, a cadeia inteira.
  if (!(await jaCobrado("video_ia", referencia))) {
    await debitarVideo({
      userId: pedido.userId,
      quantidade: custo,
      operation: "video_ia",
      projectId: pedido.projectId,
      refId: referencia,
      note:
        total > 1
          ? `Vídeo de ${pedido.segundos}s no Veo 3.1 ${pedido.qualidade}, ${total} gerações${pedido.narracao || pedido.cenas?.[0]?.narracao ? ", com narração" : ""}`
          : `Vídeo de ${pedido.segundos}s no Veo 3.1 ${pedido.qualidade}${pedido.narracao ? ", com narração" : ""}`,
    });
  }

  try {
    const ctx = { projectId: pedido.projectId, runId: pedido.runId, operation: "video_ia" };
    const cena = pedido.cenas?.[0];
    // A primeira geração aceita 4, 6 ou 8 s; numa cadeia ela é sempre de 8.
    const segundosDaPrimeira = (pedido.segundos <= SEGUNDOS_DA_PRIMEIRA_GERACAO ? pedido.segundos : SEGUNDOS_DA_PRIMEIRA_GERACAO) as 4 | 6 | 8;

    const passo = await gerarPasso({
      referencia,
      passo: 1,
      gerador,
      abrir: () =>
        gerador.pedir({
          prompt: cena?.visual ?? pedido.prompt,
          narracao: cena?.narracao ?? pedido.narracao,
          voz: pedido.voz,
          segundos: segundosDaPrimeira,
          qualidade: pedido.qualidade,
          proporcao: pedido.proporcao,
          ctx,
        }),
      olhar: (operacao) => gerador.olhar(operacao, { segundos: segundosDaPrimeira, qualidade: pedido.qualidade, ctx }),
      projectId: pedido.projectId,
    });

    if (total === 1) {
      await entregarVideo(pedido, passo.blobUrl);
      return passo.blobUrl;
    }

    await registrarNoLog(pedido, `Vídeo de ${pedido.segundos}s: geração 1 de ${total} pronta (${passo.segundos}s). A próxima entra na fila.`);
    await enfileirarExtensao({
      referencia,
      passo: 2,
      totalDeGeracoes: total,
      arquivoUri: passo.arquivoUri,
      blobUrl: passo.blobUrl,
      segundosAteAqui: passo.segundos,
      original: pedido,
    }, opcoes.ordem);
    return passo.blobUrl;
  } catch (erro) {
    /**
     * 4. DEVOLVE O QUE FOI COBRADO, UMA VEZ SO.
     *
     * O `jaCreditado` aqui nao e simetria com o debito: e conserto de um
     * defeito medido em 19/09, na primeira falha de verdade. O debito ja era
     * idempotente, e o estorno nao era. A fila tenta tres vezes; na segunda e
     * na terceira o debito era pulado (ja cobrado) e o estorno rodava mesmo
     * assim, entao cada tentativa DEVOLVIA credito que nunca tinha sido
     * cobrado. O saldo da conta de prova saiu de 400 para 790 depois de tres
     * falhas de um video de 195.
     *
     * Um estorno sem debito correspondente e dinheiro saindo pela porta de
     * quem falhou, e ele so aparece quando algo da errado, que e exatamente
     * quando ninguem esta olhando o extrato.
     *
     * Na cadeia, a falha da PRIMEIRA geração devolve tudo: nada saiu.
     *
     * E SÓ NA ÚLTIMA TENTATIVA (28/09). Antes o estorno saía na primeira falha,
     * e a tentativa seguinte, achando o débito já feito, não cobrava de novo:
     * se ela desse certo, o vídeo saía de graça. Enquanto a fila vai repetir
     * (ou pausar esperando o Google), o crédito fica reservado no trabalho.
     */
    const ultimaTentativa = (opcoes.tentativa ?? MAX_TENTATIVAS) >= MAX_TENTATIVAS;
    if (ultimaTentativa && !(await jaEstornado("estorno_video_ia", referencia))) {
      await creditarVideo({
        userId: pedido.userId,
        quantidade: custo,
        operation: "estorno_video_ia",
        refId: referencia,
        note: `Estorno: ${erro instanceof Error ? erro.message.slice(0, 180) : "falha na geração"}`,
      }).catch(() => {});
    }

    /**
     * 5. A PEÇA PRECISA DIZER QUE O VÍDEO NÃO VEIO (21/09).
     *
     * O estorno sempre funcionou, e era a única coisa que acontecia: a peça
     * ficava `mediaType: video` com o QUADRO dentro e nenhuma palavra na tela.
     * O Bruno reprovou o dia 21 "porque estava sem vídeo", sem ter como saber
     * que o Veo tinha recusado por cobrança do Google, nem que refazer não
     * adiantaria enquanto a conta estivesse assim.
     *
     * Só na ÚLTIMA tentativa: nas anteriores a fila vai repetir, e escrever
     * "não saiu" numa peça que ainda pode sair é a tela mentindo na direção
     * contrária.
     */
    if ((opcoes.tentativa ?? MAX_TENTATIVAS) >= MAX_TENTATIVAS) {
      await marcarFalhaNaPeca(pedido, erro).catch(() => {});
    }
    throw erro;
  }
}

/**
 * Escreve o motivo da falha nas peças do dia e no card da Diana.
 *
 * Fica no `metadata` do post, em `videoFalhou`, e não numa coluna nova: é o
 * mesmo lugar onde o erro de publicação já mora. E some sozinho quando o vídeo
 * finalmente chega, porque `entregarVideo` limpa a marca: estado que sobrevive
 * ao fato vira mentira, que é a lição de 21/09.
 */
/**
 * Um passo da cadeia (2 em diante): estende o vídeo do passo anterior em 7 s.
 *
 * A falha aqui é diferente da falha do passo 1: já existe vídeo pago e
 * entregável. Na ÚLTIMA tentativa, o que existe vai para os posts, e só as
 * gerações que não saíram são estornadas. Nas tentativas anteriores, o erro
 * sobe e a fila repete, com o checkpoint impedindo pagar de novo.
 */
export async function rodarExtensaoDoVideo(pedido: PedidoDeExtensaoDaFila, opcoes: OpcoesDoTrabalho = {}): Promise<string> {
  const gerador = opcoes.gerador ?? VEO;
  const { original, referencia, passo: numero, totalDeGeracoes } = pedido;
  const ctx = { projectId: original.projectId, runId: original.runId, operation: "video_ia" };
  const cena = original.cenas?.[numero - 1];

  try {
    const passo = await gerarPasso({
      referencia,
      passo: numero,
      gerador,
      abrir: () =>
        gerador.estender({
          videoUri: pedido.arquivoUri,
          prompt: cena?.visual ?? CONTINUACAO_GENERICA,
          narracao: cena?.narracao,
          voz: original.voz,
          qualidade: original.qualidade,
          proporcao: original.proporcao,
          ctx,
        }),
      olhar: (operacao) =>
        gerador.olhar(operacao, { segundos: 7, qualidade: original.qualidade, ctx, segundosDeEntrada: pedido.segundosAteAqui }),
      projectId: original.projectId,
    });

    if (numero >= totalDeGeracoes) {
      await entregarVideo(original, passo.blobUrl);
      await registrarNoLog(original, `Vídeo de ${original.segundos}s pronto: ${totalDeGeracoes} gerações, ${passo.segundos}s no total.`);
      return passo.blobUrl;
    }

    await registrarNoLog(original, `Vídeo de ${original.segundos}s: geração ${numero} de ${totalDeGeracoes} pronta (${passo.segundos}s).`);
    await enfileirarExtensao({ ...pedido, passo: numero + 1, arquivoUri: passo.arquivoUri, blobUrl: passo.blobUrl, segundosAteAqui: passo.segundos }, opcoes.ordem);
    return passo.blobUrl;
  } catch (erro) {
    const tentativa = opcoes.tentativa ?? MAX_TENTATIVAS;
    if (tentativa < MAX_TENTATIVAS) throw erro;

    /**
     * A CADEIA MORREU NO PASSO k, NA ÚLTIMA TENTATIVA. O vídeo até o passo
     * k-1 existe, foi pago e é um vídeo de verdade: vai para os posts, com o
     * aviso no log. As gerações de k até o fim não saíram e são devolvidas,
     * uma vez só, pela referência do passo.
     */
    const faltaram = totalDeGeracoes - (numero - 1);
    const estorno = faltaram * creditosPorGeracao(original.qualidade);
    const refDoEstorno = `${referencia}:sobra`;
    if (!(await jaEstornado("estorno_video_ia", refDoEstorno))) {
      await creditarVideo({
        userId: original.userId,
        quantidade: estorno,
        operation: "estorno_video_ia",
        refId: refDoEstorno,
        note: `Estorno de ${faltaram} geração(ões) que não saíram: ${erro instanceof Error ? erro.message.slice(0, 140) : "falha na extensão"}`,
      }).catch(() => {});
    }
    await entregarVideo(original, pedido.blobUrl).catch(() => {});
    await registrarNoLog(
      original,
      `O vídeo saiu com ${pedido.segundosAteAqui}s em vez de ${original.segundos}s: a geração ${numero} falhou nas ${MAX_TENTATIVAS} tentativas. ${estorno} créditos de vídeo devolvidos.`,
      "warning"
    );
    throw erro;
  }
}

/** O que o Veo recebe quando a cadeia não tem roteiro para este passo. */
const CONTINUACAO_GENERICA =
  "Continue the same scene without a cut: the camera keeps slowly moving through the same space, same light, same color palette, same mood. A new detail is revealed.";

interface PassoPronto {
  arquivoUri: string;
  blobUrl: string;
  segundos: number;
}

/**
 * Uma geração, com checkpoint em dois momentos: a operação aberta e o
 * resultado. É o que faz a tentativa seguinte de um trabalho derrubado
 * retomar em vez de pagar de novo.
 */
async function gerarPasso(args: {
  referencia: string;
  passo: number;
  gerador: Gerador;
  abrir: () => Promise<string>;
  olhar: (operacao: string) => ReturnType<typeof olharOperacao>;
  projectId: string;
}): Promise<PassoPronto> {
  const guardado = await passoGuardado(args.referencia, args.passo);
  if (guardado?.arquivoUri && guardado.blobUrl && guardado.segundos) {
    console.log(`[video-ia] passo ${args.passo} de ${args.referencia} já estava pronto (checkpoint)`);
    return { arquivoUri: guardado.arquivoUri, blobUrl: guardado.blobUrl, segundos: guardado.segundos };
  }

  let operacao = guardado?.operacao;
  if (!operacao) {
    operacao = await args.abrir();
    await guardarPasso(args.referencia, args.passo, { operacao });
  } else {
    console.log(`[video-ia] passo ${args.passo} de ${args.referencia}: retomando a operação ${operacao}`);
  }

  // 2. Espera. O laço vive AQUI e não dentro de `olharOperacao`, porque um
  //    laço escondido numa função é como um trabalho de nove minutos vira um
  //    timeout de plataforma que ninguém consegue depurar.
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let pronto = null as Awaited<ReturnType<typeof olharOperacao>>;
  while (Date.now() < limite) {
    try {
      pronto = await args.olhar(operacao);
    } catch (erro) {
      /**
       * A OPERAÇÃO QUE FALHOU SAI DO CHECKPOINT (28/09).
       *
       * O checkpoint guarda a operação aberta para a tentativa seguinte de um
       * trabalho DERRUBADO retomar em vez de pagar de novo. Só que uma operação
       * que o Veo terminou com erro está morta: guardada, ela fazia a tentativa
       * 2 e a 3 relerem o mesmo erro, cada uma em um segundo, sem pedir vídeo
       * nenhum. Foi assim que o vídeo do dia 28 virou imagem: "internal server
       * issue, try again in a few minutes", e as três tentativas se gastaram em
       * três segundos. Apagada, a próxima tentativa abre uma operação nova.
       */
      if (erro instanceof Error && erro.message.startsWith("O Veo falhou")) {
        await guardarPasso(args.referencia, args.passo, { operacao: undefined });
      }
      throw erro;
    }
    if (pronto) break;
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  if (!pronto) throw new Error(`O Veo não terminou em ${Math.round(ESPERA_MAXIMA_MS / 60000)} minutos.`);

  // 3. Traz para a nossa casa. A URI do Google exige a nossa chave para
  //    baixar, ou seja ela não serve como url de post: quem abrisse o card
  //    veria 403.
  // Com o índice no começo (faststart): o Veo entrega o `moov` no fim, e o
  // navegador travava ao tocar (28/09). Ver lib/media/faststart.ts.
  const bytes = faststart(Buffer.from(await args.gerador.baixar(pronto.uri)));
  const { url } = await put(`videos-ia/${args.projectId}/${args.referencia}-g${args.passo}-${Date.now()}.mp4`, bytes, {
    ...midiaProduzida(),
    contentType: "video/mp4",
    addRandomSuffix: false,
  });
  await guardarPasso(args.referencia, args.passo, {
    operacao,
    arquivoUri: pronto.arquivoUri,
    blobUrl: url,
    segundos: pronto.segundos,
    custoUsd: pronto.custoUsd,
  });
  return { arquivoUri: pronto.arquivoUri, blobUrl: url, segundos: pronto.segundos };
}

async function enfileirarExtensao(pedido: PedidoDeExtensaoDaFila, ordem?: number): Promise<void> {
  const referencia = pedido.referencia;
  await enfileirar([
    {
      tipo: "video-ia-extensao",
      grupo: grupoDoPedido(pedido.original, referencia),
      // A mesma ordem do trabalho que a pediu: a fila desempata pela criação,
      // então a extensão entra logo atrás, antes do dia seguinte da campanha.
      ordem: ordem ?? 100 + (pedido.original.dayOfWeek ?? 0),
      userId: pedido.original.userId,
      projectId: pedido.original.projectId,
      payload: pedido as unknown as Record<string, unknown>,
    },
  ]);
}

/**
 * O VIDEO VAI PARA TODOS OS POSTS DO DIA, e nao so para um.
 *
 * Medido em 19/09, no primeiro dia de video com saldo: cada rede e um
 * POST proprio (quatro linhas para o mesmo dia), e este trabalho carrega
 * UM `postId`. O mp4 chegou so no post do LinkedIn; X, Facebook e
 * Instagram ficaram com o JPEG do quadro e a guarda de publicacao barrou
 * os tres com "o video ainda nao existe". O cliente viu tres erros e um
 * post publicado sem video.
 *
 * A chave do dia e (runId, dayOfWeek): e assim que a esteira agrupa as
 * pecas de um dia. Sem `runId` ou sem `dayOfWeek` (pedido antigo), cai no
 * comportamento de antes, que e atualizar so o post nomeado.
 */
export async function entregarVideo(pedido: PedidoDeVideoDaFila, url: string): Promise<void> {
  /**
   * O AVISO DE FALHA SAI QUANDO O VÍDEO ENTRA (21/09).
   *
   * Uma tentativa pode falhar e a seguinte entregar, e nesse caso a peça
   * ficaria com o mp4 no lugar certo e um "o vídeo não foi gerado" embaixo.
   * É o mesmo defeito do erro de publicação que sobrevivia ao sucesso
   * seguinte: estado que sobrevive ao fato vira mentira na tela.
   */
  await limparMarcaDoVideo(pedido).catch(() => {});

  if (pedido.postIds && pedido.postIds.length > 0) {
    const { count } = await prisma.post.updateMany({
      where: { id: { in: pedido.postIds } },
      data: { imageUrl: url, mediaType: "video" },
    });
    console.log(`[video-ia] mp4 aplicado em ${count} post(s) do dia ${pedido.dayOfWeek ?? "?"} (por id)`);
  } else if (pedido.runId && pedido.dayOfWeek) {
    const { count } = await prisma.post.updateMany({
      where: { runId: pedido.runId, dayOfWeek: pedido.dayOfWeek, mediaType: "video" },
      data: { imageUrl: url, mediaType: "video" },
    });
    console.log(`[video-ia] mp4 aplicado em ${count} post(s) do dia ${pedido.dayOfWeek}`);
  } else if (pedido.postId) {
    await prisma.post.update({
      where: { id: pedido.postId },
      data: { imageUrl: url, mediaType: "video" },
    }).catch(() => {});
  }
  /**
   * O CARD DA DIANA TAMBÉM RECEBE O MP4, e o quadro vira a capa.
   *
   * Até 19/09 o pedido chegava sem `cardId` (a fila era enfileirada antes
   * de o card existir), então o card da Diana ficava com o JPEG 9:16 para
   * sempre: na ficha dela o "vídeo" abria como uma imagem comprida. O card
   * do dia é achado pela mesma chave dos posts, e o quadro que ele tinha
   * vai para `metadata.thumb`, que é o poster do player.
   */
  const cardsDoDia = await prisma.campaignCard.findMany({
    where: pedido.cardId
      ? { id: pedido.cardId }
      : pedido.runId && pedido.dayOfWeek
        ? { runId: pedido.runId, dayOfWeek: pedido.dayOfWeek, cardType: "media" }
        : { id: "__nenhum__" },
    select: { id: true, mediaUrl: true, metadata: true },
  });
  for (const card of cardsDoDia) {
    const quadro = card.mediaUrl && card.mediaUrl !== url && !/\.mp4(\?|$)/i.test(card.mediaUrl) ? card.mediaUrl : null;
    const metadata = { ...((card.metadata as Record<string, unknown> | null) ?? {}), ...(quadro ? { thumb: quadro } : {}) };
    await prisma.campaignCard
      .update({ where: { id: card.id }, data: { mediaUrl: url, mediaType: "video", metadata } })
      .catch(() => {});
  }
}

/** Uma linha no log da execução, onde o cliente acompanha a campanha. */
async function registrarNoLog(pedido: PedidoDeVideoDaFila, mensagem: string, status: "running" | "completed" | "warning" = "running"): Promise<void> {
  if (!pedido.runId) return;
  try {
    const run = await prisma.pipelineRun.findUnique({ where: { id: pedido.runId }, select: { logs: true } });
    if (!run) return;
    const logs = Array.isArray(run.logs) ? (run.logs as unknown[]) : [];
    logs.push({ agent: "Diana Design", status, message: mensagem, timestamp: new Date().toISOString() });
    await prisma.pipelineRun.update({ where: { id: pedido.runId }, data: { logs: logs as never } });
  } catch {
    // Log é bônus.
  }
}

/**
 * O vídeo cabe no saldo?
 *
 * Perguntado ANTES de a campanha rodar, e não no meio: descobrir que não cabe
 * depois de escrever o post é gastar com a API e não entregar. Devolve o que
 * falta, para a tela dizer o número em vez de "saldo insuficiente".
 */
export async function cabeNoSaldoDeVideo(
  userId: string,
  segundos: number,
  qualidade: QualidadeDoVideo
): Promise<{ cabe: boolean; custo: number; disponivel: number }> {
  const custo = custoDoVideo(segundos, qualidade);
  const disponivel = await saldoDeVideo(userId);
  return { cabe: disponivel >= custo, custo, disponivel };
}
