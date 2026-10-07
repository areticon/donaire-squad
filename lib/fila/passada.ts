import {
  reservarProximo,
  ressuscitarMortos,
  concluir,
  falhar,
  estadoDoGrupo,
  MAX_TENTATIVAS,
  type TrabalhoReservado,
} from "@/lib/fila/trabalhos";
import { rodarTrabalhoDaCampanha, fecharCampanha } from "@/lib/pipeline/executar";
import { rodarVideoDaIa, rodarExtensaoDoVideo, type PedidoDeVideoDaFila, type PedidoDeExtensaoDaFila } from "@/lib/media/video-por-ia";
import { ehFaltaDeSaldo, pausarAFila, retomarPausados } from "@/lib/fila/saldo-zerado";
import { avisarCotaPresa } from "@/lib/fila/cota-do-video";
import { ehCotaDeVideo, ehFalhaPassageiraDoVeo, pausarPelaCota, pausasPassageiras, MAX_PAUSAS_PASSAGEIRAS, ESPERAS_PASSAGEIRAS_MIN } from "@/lib/fila/cota-do-video";
import { prisma } from "@/lib/db/prisma";

/**
 * UMA PASSADA DA FILA.
 *
 * Mora aqui, e não dentro da rota, pela regra que a casa já pagou para
 * aprender: enquanto a montagem do pedido de corte tinha uma cópia na rota e
 * outra no script de teste, o produto era consertado, o teste continuava com o
 * desenho velho, e dizia que funcionava. A rota `/api/cron/fila` e a prova de
 * ponta a ponta chamam esta mesma função.
 *
 * A passada faz três coisas, nesta ordem:
 *
 * 1. **Ressuscita os mortos.** Trabalho que passou do prazo volta para a fila.
 *    É o único jeito de enxergar uma função derrubada no teto de tempo, porque
 *    nesse desfecho o `catch` nunca roda e o código não grava o próprio erro.
 *    Sem isto, um morto trava o grupo inteiro, já que o grupo só deixa um
 *    trabalho rodar por vez.
 * 2. **Trabalha enquanto couber no orçamento.** Para de PEGAR trabalho novo
 *    quando falta menos que o dia mais lento medido, para não começar um dia
 *    que a plataforma vai matar no meio.
 * 3. **Fecha o grupo que acabou.** Cobrança e "campanha concluída" são por
 *    campanha, e nenhum dia sozinho sabe se foi o último.
 */
export type ResultadoDaPassada = {
  ressuscitados: number;
  /** Trabalhos devolvidos à fila depois de uma pausa por saldo. */
  retomados: number;
  rodados: number;
  falhados: number;
  /** Quantos ficaram esperando a recarga, se a plataforma ficou sem saldo nesta passada. */
  pausados: number;
  fechados: number;
};

export type OpcoesDaPassada = {
  /** Quanto tempo esta passada tem no total. O padrão é o teto da rota. */
  orcamentoMs?: number;
  /**
   * Sobra mínima para PEGAR mais um trabalho. Precisa ser MAIOR que o dia
   * mais lento medido (326 s em 19/09, um dia de vídeo); o padrão é 420 s.
   * Ver o comentário no corpo de `passadaDaFila`.
   */
  sobraMinimaMs?: number;
  /** Para o script de prova contar o que aconteceu enquanto acontece. */
  aoTerminar?: (t: TrabalhoReservado, ok: boolean, ms: number) => void;
};

export async function passadaDaFila(
  opcoes: OpcoesDaPassada = {}
): Promise<ResultadoDaPassada> {
  const comeco = Date.now();
  const orcamentoMs = opcoes.orcamentoMs ?? 780_000;
  /**
   * 420 s, e nao 300, desde 19/09.
   *
   * O dia mais lento medido em 09/09 levava 150 s, e 300 era o dobro. Em 19/09
   * um dia de video levou 326 s e um de carrossel 261 s: a passada pegou o dia
   * 2 com 300 s sobrando, a plataforma matou a funcao aos 800 s, e a fila so
   * recuperou o trabalho 830 s depois. Quatorze minutos parados no meio de
   * uma campanha de 14 dias, e o Bruno olhando o quadro sem o segundo post.
   *
   * A sobra tem que ser MAIOR que o dia mais lento, senao ela nao e sobra.
   */
  const sobraMinimaMs = opcoes.sobraMinimaMs ?? 420_000;

  const ressuscitados = await ressuscitarMortos();
  // Os pausados por saldo voltam depois de dez minutos, para UM deles testar
  // se a recarga aconteceu. Ver lib/fila/saldo-zerado.ts.
  const retomados = await retomarPausados();
  /**
   * O aviso de cota presa roda JUNTO da retomada, e nao num cron proprio.
   *
   * Os dois olham a mesma coisa (trabalho pausado) no mesmo ritmo (dez
   * minutos), e dois relogios para o mesmo fato e como eles divergem, que e a
   * licao ja escrita em lib/fila/cota-do-video.ts. Falha de e-mail nao derruba
   * a passada: instrumentacao nunca para a fila.
   */
  await avisarCotaPresa().catch((e) => console.error("[fila] aviso de cota presa falhou:", e));
  let rodados = 0;
  let falhados = 0;
  let pausados = 0;
  const gruposTocados = new Set<string>();

  for (;;) {
    if (Date.now() - comeco > orcamentoMs - sobraMinimaMs) break;

    let trabalho: TrabalhoReservado | null = null;
    try {
      trabalho = await reservarProximo();
    } catch (e) {
      console.error("[fila] não consegui reservar:", e);
      break;
    }
    if (!trabalho) break;

    gruposTocados.add(trabalho.grupo);
    const inicio = Date.now();

    try {
      await executarTrabalho(trabalho, comeco + orcamentoMs);
      await concluir(trabalho.id);
      rodados++;
      opcoes.aoTerminar?.(trabalho, true, Date.now() - inicio);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[fila] trabalho ${trabalho.id} (${trabalho.tipo}) falhou:`, e);
      /**
       * SEM SALDO DE API, A FILA PARA. Não é falha do trabalho, é da
       * plataforma, e insistir só gasta tentativas: em 19/09 sete dias
       * "concluíram" em quatro segundos contra uma conta zerada. Pausa tudo,
       * avisa o dono, e esta passada termina aqui.
       */
      /**
       * COTA DO GERADOR DE VIDEO: o trabalho espera, e nao morre.
       *
       * Medido na campanha de prova de 60 s em 21/09: as sete primeiras
       * geracoes sairam e a oitava levou 429. A fila gastou as tres
       * tentativas em sequencia contra um limite que volta em minutos, e o
       * video saiu com 50 s em vez de 64. So o trabalho de video pausa: o
       * texto e a arte nao dependem do Veo, e parar a campanha inteira por
       * causa de um clipe seria punir sete dias por causa de um.
       */
      if (ehCotaDeVideo(e)) {
        await pausarPelaCota(trabalho.id, e);
        pausados++;
        opcoes.aoTerminar?.(trabalho, false, Date.now() - inicio);
        continue;
      }
      // Falha passageira do Veo ("try again in a few minutes"): espera dez
      // minutos como a cota, até uma hora. Ver `ehFalhaPassageiraDoVeo`.
      if (ehFalhaPassageiraDoVeo(e)) {
        const vezes = await pausasPassageiras(trabalho.id);
        if (vezes < MAX_PAUSAS_PASSAGEIRAS) {
          await pausarPelaCota(trabalho.id, e, { passageiras: vezes + 1 });
          await registrarEsperaNaExecucao(trabalho.grupo, vezes + 1).catch(() => {});
          pausados++;
          opcoes.aoTerminar?.(trabalho, false, Date.now() - inicio);
          continue;
        }
      }
      if (ehFaltaDeSaldo(e)) {
        pausados = await pausarAFila(trabalho.id, e);
        opcoes.aoTerminar?.(trabalho, false, Date.now() - inicio);
        break;
      }
      // A falha volta para a fila enquanto houver tentativa. Erro de rede e de
      // cota melhoram na segunda; erro de programação não melhora na quarta, e
      // por isso existe um teto de tentativas.
      await falhar(trabalho.id, motivo);
      // A TENTATIVA QUE FALHOU ENTRA NO LOG DA EXECUCAO. Em 14/09 uma pesquisa
      // rodou duas vezes (313 s no total) e o log da campanha mostrava as duas
      // sem dizer que a primeira tinha falhado: o `error` do trabalho e
      // sobrescrito quando a segunda tentativa da certo, e some. O cliente viu
      // "demorou muito" sem ter como saber por que. O motivo fica aqui, com a
      // tentativa numerada, onde a tela do Gestor le.
      await registrarFalhaNaExecucao(trabalho.grupo, trabalho.tipo, trabalho.attempts, motivo).catch(() => {});
      falhados++;
      opcoes.aoTerminar?.(trabalho, false, Date.now() - inicio);
    }
  }

  // Fecha os grupos que acabaram nesta passada, MAIS os que ficaram órfãos.
  //
  // Órfão é o grupo que terminou numa passada que morreu antes de fechar: os
  // trabalhos estão todos prontos, ninguém mais vai tocar naquele grupo, e a
  // campanha ficaria "rodando" na tela para sempre. É o mesmo tipo de falha
  // que a fila existe para enxergar, um andar acima: não basta cada trabalho
  // ter prazo, o fecho também precisa de quem o cobre.
  const orfaos = await prisma.pipelineRun.findMany({
    where: { status: "running", startedAt: { lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: 50,
  });
  const candidatos = new Set<string>([...gruposTocados, ...orfaos.map((o) => o.id)]);

  let fechados = 0;
  for (const grupo of candidatos) {
    const estado = await estadoDoGrupo(grupo);
    // Sem trabalho nenhum no grupo não há o que fechar: ou é execução de
    // antes da fila existir, ou o pedido nem chegou a enfileirar.
    if (estado.concluidos + estado.falhados === 0) continue;
    if (!estado.acabou) continue;
    try {
      await fecharCampanha(grupo);
      fechados++;
    } catch (e) {
      console.error(`[fila] não consegui fechar o grupo ${grupo}:`, e);
    }
  }

  return { ressuscitados, retomados, rodados, falhados, pausados, fechados };
}

/** Uma linha no log dizendo que o vídeo espera o Google, e não que falhou. */
async function registrarEsperaNaExecucao(runId: string, vez: number): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { logs: true } });
  if (!run) return;
  const logs = Array.isArray(run.logs) ? (run.logs as unknown[]) : [];
  logs.push({
    agent: "Sistema",
    status: "warning",
    message: `O gerador de vídeo do Google teve uma falha do lado dele. O vídeo não foi perdido: tento de novo em ${ESPERAS_PASSAGEIRAS_MIN[vez - 1] ?? 5} min (tentativa ${vez} de ${MAX_PAUSAS_PASSAGEIRAS}).`,
    timestamp: new Date().toISOString(),
  });
  await prisma.pipelineRun.update({ where: { id: runId }, data: { logs: logs as never } });
}

/** Uma linha no log da execução dizendo que a tentativa falhou e vai repetir. */
async function registrarFalhaNaExecucao(runId: string, tipo: string, tentativa: number, motivo: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { logs: true } });
  if (!run) return;
  const logs = Array.isArray(run.logs) ? (run.logs as unknown[]) : [];
  const etapa = tipo === "campanha-pesquisa" ? "a pesquisa" : tipo.startsWith("video-ia") ? "o vídeo" : "o dia";
  logs.push({
    agent: "Sistema",
    status: "warning",
    // A última tentativa não repete (08/10): o log da campanha do Igor dizia "vai repetir" na
    // terceira, e a fila já tinha marcado o dia como falhou. A frase só promete o que acontece.
    message:
      tentativa >= MAX_TENTATIVAS
        ? `Tentativa ${tentativa} d${etapa} falhou e foi a última, não repete mais: ${motivo.slice(0, 200)}`
        : `Tentativa ${tentativa} d${etapa} falhou e vai repetir: ${motivo.slice(0, 200)}`,
    timestamp: new Date().toISOString(),
  });
  await prisma.pipelineRun.update({ where: { id: runId }, data: { logs: logs as never } });
}

/**
 * Manda o trabalho para quem sabe fazê-lo.
 *
 * `prazoEm` é o instante em que a PLATAFORMA mata esta função, e ele desce
 * junto porque quem trabalha precisa saber quanto tempo tem. Antes de 19/09
 * ninguém sabia: o dia de carrossel desenhava lâminas até ser desligado no
 * meio, e as lâminas já pagas morriam com a função. Ver
 * lib/media/checkpoint-do-carrossel.ts.
 */
async function executarTrabalho(trabalho: TrabalhoReservado, prazoEm?: number): Promise<void> {
  switch (trabalho.tipo) {
    case "campanha-pesquisa":
      await rodarTrabalhoDaCampanha(trabalho.grupo, { fase: "pesquisa" });
      return;
    case "campanha-dia": {
      const dayOfWeek = Number(trabalho.payload.dayOfWeek);
      const weekOffset = Number(trabalho.payload.weekOffset ?? 0);
      if (!Number.isFinite(dayOfWeek)) {
        throw new Error(`Trabalho ${trabalho.id} sem dia no payload.`);
      }
      await rodarTrabalhoDaCampanha(trabalho.grupo, { fase: "dia", dayOfWeek, weekOffset, prazoEm });
      return;
    }
    case "video-ia": {
      // O vídeo por IA (19/09). O payload carrega tudo o que o trabalho precisa
      // para rodar sozinho, como manda a regra da fila: nada é relido daqui.
      const p = trabalho.payload as unknown as PedidoDeVideoDaFila;
      if (!p?.prompt || !p?.userId || !p?.projectId) {
        throw new Error(`Trabalho ${trabalho.id} sem prompt, dono ou projeto no payload.`);
      }
      // A ordem e a tentativa descem junto: a extensão entra logo atrás na fila,
      // e a última tentativa é a que entrega o que existe e estorna o resto.
      await rodarVideoDaIa(p, { ordem: trabalho.ordem, tentativa: trabalho.attempts });
      return;
    }
    case "video-ia-extensao": {
      const p = trabalho.payload as unknown as PedidoDeExtensaoDaFila;
      if (!p?.referencia || !p?.arquivoUri || !p?.original?.userId) {
        throw new Error(`Trabalho ${trabalho.id} sem referência, arquivo ou pedido original no payload.`);
      }
      await rodarExtensaoDoVideo(p, { ordem: trabalho.ordem, tentativa: trabalho.attempts });
      return;
    }
    default:
      // Tipo que este deploy não conhece: falhar dizendo isso é melhor do que
      // ficar rodando para sempre.
      throw new Error(`Tipo de trabalho desconhecido: ${trabalho.tipo}`);
  }
}
