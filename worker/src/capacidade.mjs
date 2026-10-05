import { AsyncLocalStorage } from "node:async_hooks";
import { availableParallelism } from "node:os";
import { memoriaDoConteiner } from "./ffmpeg.mjs";

/**
 * A CAPACIDADE DA MÁQUINA (05/10). Até aqui os números de paralelismo eram
 * fixos para o contêiner do plano Hobby (8 vCPU, 7629 MB medidos no /saude):
 * uma montagem por vez, 4 abas do Chrome, 3 fios de ffmpeg, 3 trechos, 2 lotes.
 * No plano Pro a réplica pode ter até 32 vCPU e 32 GB, e com os números fixos
 * a máquina maior ficaria ociosa.
 *
 * Agora tudo sai de uma conta só, lida na subida a partir de
 * `availableParallelism()` e do teto de memória do cgroup:
 *
 *   UNIDADES = quantas "máquinas de hoje" cabem nesta: 1 por cada 8 vCPU E
 *   7 GB (o que for menor), mínimo 1. 8 vCPU / 7629 MB dá 1; 32 vCPU / 32 GB
 *   dá 4. Sem cgroup (máquina de desenvolvimento) fica 1.
 *
 * Cada render pesado da fila de montagem reserva uma FATIA de unidades (o
 * corte, 1; o completo, todas menos uma, para os cortes seguirem andando ao
 * lado) e os números dele saem do tamanho da fatia: abas do Chrome, fios do
 * ffmpeg, lotes e renders do completo. Com 1 unidade a conta devolve
 * EXATAMENTE os números de antes, e a fila continua serial.
 *
 * As variáveis de ambiente de antes continuam valendo:
 *   REMOTION_CONCORRENCIA        só abaixa (nunca passa do calculado, como o teto de 4 de antes)
 *   MONTAGEM_FFMPEG_THREADS      fios de cada ffmpeg da montagem
 *   MONTAGEM_COMPLETO_LOTES      lotes do acabamento do completo editado
 *   MONTAGEM_COMPLETO_RENDERS    renders do Remotion nas janelas do completo
 *   WORKER_UNIDADES              (nova) força o número de unidades
 */

/** Memória de uma "máquina de hoje" para a conta das unidades (7629 MB medidos cabem em 1). */
const MB_POR_UNIDADE = 7000;
/** vCPU de uma "máquina de hoje". */
const CPUS_POR_UNIDADE = 8;
/** Memória por aba do Chrome: 4 abas em 7629 MB foi o que sobreviveu em produção (30/09). */
const MB_POR_ABA = 1900;

/** O teto de memória do contêiner em MB, ou null fora de contêiner. */
export function limiteDeMemoriaMb() {
  const limite = memoriaDoConteiner().limite;
  return typeof limite === "string" && /MB$/.test(limite) ? Number(limite.replace(/\D/g, "")) || null : null;
}

/**
 * A conta, pura (testável sem contêiner). `mb` null = memória desconhecida.
 * Devolve os números da máquina inteira e a função `fatia(k)` com os de um
 * render que reservou `k` unidades.
 */
export function calcularCapacidade({ cpus, mb, env = {} }) {
  const porConta = mb ? Math.max(1, Math.min(Math.floor(cpus / CPUS_POR_UNIDADE), Math.floor(mb / MB_POR_UNIDADE))) : 1;
  const unidades = Math.max(1, Math.floor(Number(env.WORKER_UNIDADES)) || porConta);

  // Os TRABALHOS (cortes e o completo de base, fora da fila de montagem) ficam
  // com metade das unidades quando há montagem ao lado; com 1 unidade, a
  // única, como antes (a fila espera por eles).
  const unidadesDosTrabalhos = Math.ceil(unidades / 2);
  // Um trecho no pior caso: ffmpeg em 1440p mais o Python da segmentação,
  // perto de 1,5 GB. Antes: até 3, um por 1,8 GB, nunca mais que os núcleos.
  const trechos = Math.max(1, Math.min(3 * unidadesDosTrabalhos, Math.floor((mb || 3000) / 1800), cpus));
  // Um lote do completo com fios automáticos, perto de 1,2 GB. Antes: 2 com
  // 6 GB e 4 núcleos. Os fios do x264 crescem com os núcleos, então o teto
  // fica em 2 por unidade dos trabalhos.
  const lotes = mb >= 6000 && cpus >= 4 ? 2 * unidadesDosTrabalhos : 1;

  // O completo reserva todas as unidades menos uma: o corte que chega depois
  // não espera o completo inteiro (dezenas de minutos) para começar.
  const unidadesDoCompleto = Math.max(1, unidades - 1);

  const fatia = (k = 1) => {
    const u = Math.max(1, Math.min(unidades, Math.floor(k) || 1));
    const cpusDaFatia = (cpus * u) / unidades;
    const mbDaFatia = mb ? (mb * u) / unidades : null;
    // 4 abas por unidade, nunca mais que os núcleos da fatia nem que a memória dela.
    const remotionCalculado = Math.max(
      1,
      Math.min(4 * u, Math.floor(cpusDaFatia), mbDaFatia ? Math.floor(mbDaFatia / MB_POR_ABA) : Infinity)
    );
    const remotionEnv = Number(env.REMOTION_CONCORRENCIA);
    return {
      unidades: u,
      remotion: remotionEnv > 0 ? Math.min(remotionEnv, remotionCalculado) : remotionCalculado,
      ffmpegFios: String(env.MONTAGEM_FFMPEG_THREADS || Math.min(3 * u, 12)),
      lotesDoCompleto: Math.max(1, Number(env.MONTAGEM_COMPLETO_LOTES ?? 2 * u)),
      rendersDoCompleto: Math.max(1, Math.min(4, Number(env.MONTAGEM_COMPLETO_RENDERS ?? Math.min(4, 2 * u)))),
    };
  };

  return {
    cpus,
    memoriaMb: mb,
    unidades,
    rendersJuntos: unidades,
    unidadesDoCompleto,
    unidadesDosTrabalhos,
    trechos,
    lotes,
    fatia,
  };
}

/** A capacidade desta máquina, lida uma vez na subida. */
export const CAPACIDADE = calcularCapacidade({ cpus: availableParallelism(), mb: limiteDeMemoriaMb(), env: process.env });

/** O resumo para o /saude e o log: a máquina, o corte (1 unidade) e o completo. */
export function resumoDaCapacidade(c = CAPACIDADE) {
  const { fatia, ...resto } = c;
  return { ...resto, corte: fatia(1), completo: fatia(c.unidadesDoCompleto) };
}

const orcamentoDoRender = new AsyncLocalStorage();

/** Roda `fn` com a fatia de `k` unidades: tudo que ele chamar lê os números dela. */
export function comFatia(k, fn) {
  return orcamentoDoRender.run(CAPACIDADE.fatia(k), fn);
}

/** Os números do render em andamento; fora da fila, a fatia de 1 unidade (a de antes). */
export function fatiaAtual() {
  return orcamentoDoRender.getStore() ?? CAPACIDADE.fatia(1);
}
