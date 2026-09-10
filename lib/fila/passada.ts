import {
  reservarProximo,
  ressuscitarMortos,
  concluir,
  falhar,
  estadoDoGrupo,
  type TrabalhoReservado,
} from "@/lib/fila/trabalhos";
import { rodarTrabalhoDaCampanha, fecharCampanha } from "@/lib/pipeline/executar";
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
  rodados: number;
  falhados: number;
  fechados: number;
};

export type OpcoesDaPassada = {
  /** Quanto tempo esta passada tem no total. O padrão é o teto da rota. */
  orcamentoMs?: number;
  /**
   * Sobra mínima para PEGAR mais um trabalho. O dia mais lento medido em
   * 09/09 leva perto de 150 s; o padrão é o dobro disso.
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
  const sobraMinimaMs = opcoes.sobraMinimaMs ?? 300_000;

  const ressuscitados = await ressuscitarMortos();
  let rodados = 0;
  let falhados = 0;
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
      await executarTrabalho(trabalho);
      await concluir(trabalho.id);
      rodados++;
      opcoes.aoTerminar?.(trabalho, true, Date.now() - inicio);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[fila] trabalho ${trabalho.id} (${trabalho.tipo}) falhou:`, e);
      // A falha volta para a fila enquanto houver tentativa. Erro de rede e de
      // cota melhoram na segunda; erro de programação não melhora na quarta, e
      // por isso existe um teto de tentativas.
      await falhar(trabalho.id, motivo);
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

  return { ressuscitados, rodados, falhados, fechados };
}

/** Manda o trabalho para quem sabe fazê-lo. */
async function executarTrabalho(trabalho: TrabalhoReservado): Promise<void> {
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
      await rodarTrabalhoDaCampanha(trabalho.grupo, { fase: "dia", dayOfWeek, weekOffset });
      return;
    }
    default:
      // Tipo que este deploy não conhece: falhar dizendo isso é melhor do que
      // ficar rodando para sempre.
      throw new Error(`Tipo de trabalho desconhecido: ${trabalho.tipo}`);
  }
}
