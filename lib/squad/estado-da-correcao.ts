/**
 * A CORREÇÃO QUE O SQUAD FAZ SOZINHO DEPOIS DA VERA, do lado que a TELA lê.
 *
 * ## Por que existe (reclamação do Bruno em 29/09, com print)
 *
 * O card do Paulo de 30/09 dizia "REPROVADO PELA VERA > ESPERANDO VOCÊ". O
 * dono não quer receber reprovação: reprovação é conversa entre a gerente e
 * o time. A regra passou a ser esta:
 *
 *   1. a Vera reprova o dia (ou aprova com ressalva que é defeito de verdade);
 *   2. cada peça culpada volta ao agente dono, com o motivo dela;
 *   3. o dono refaz, e a Vera revisa de novo, até 2 tentativas;
 *   4. só chega ao cliente, com o motivo claro e o que fazer, se não houver
 *      conserto depois das 2 tentativas.
 *
 * Enquanto isso o card diz "o squad está corrigindo", que é o estado
 * "fazendo" do calendário, e nunca "reprovado, esperando você".
 *
 * ## Onde mora
 *
 * No `metadata.correcaoDaVera` do card da Vera (o `preview` do dia). Este
 * arquivo é PURO, sem banco, porque o componente cliente precisa ler o estado
 * e componente cliente não importa módulo que toca o banco. A escrita mora em
 * `lib/squad/correcao-da-vera.ts`.
 */

/** Quantas vezes o squad refaz antes de chamar o cliente. Pedido do dono: 2. */
export const MAX_TENTATIVAS_DA_VERA = 2;

/**
 * Depois disto, "corrigindo" é marca de uma função que morreu no meio (a
 * esteira do vídeo roda num `after()` com teto de 300 s). Uma correção leva
 * de 2 a 6 minutos; 20 é folga, e passar disso vira "precisa de você" com o
 * motivo verdadeiro, porque "corrigindo" para sempre seria mentira na tela.
 */
export const VALIDADE_DA_CORRECAO_MIN = 20;

export type EstadoDaCorrecao = "corrigindo" | "corrigido" | "sem_conserto";

export type TentativaDaCorrecao = {
  tentativa: number;
  /** Quem refez, pelo nome que a tela mostra ("Lucas LinkedIn", "Diana Design"). */
  quem: string[];
  /** O que a Vera disse DEPOIS desta tentativa. */
  veredito: string;
  queixa: string;
};

export type CorrecaoDaVera = {
  estado: EstadoDaCorrecao;
  /** A tentativa em andamento (corrigindo) ou a última feita. */
  tentativa: number;
  maxTentativas: number;
  /** ISO do começo da tentativa atual: é o que o prazo mede. */
  desde: string;
  /** O motivo da Vera em uma linha, para a tela e para o cliente. */
  motivo: string;
  /** Só em `sem_conserto`: o que o cliente pode fazer, em linguagem de gente. */
  oQueFazer?: string;
  historico?: TentativaDaCorrecao[];
};

/**
 * A correção deste card, já com o prazo aplicado, ou `null`.
 *
 * "corrigindo" vencida sai como `sem_conserto`, com o motivo dizendo que a
 * correção parou no meio e como pedir de novo: o cliente precisa saber, e o
 * squad não vai voltar sozinho a uma função que morreu.
 */
export function lerCorrecaoDaVera(metadata: unknown, agora = Date.now()): CorrecaoDaVera | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const c = m.correcaoDaVera as CorrecaoDaVera | undefined;
  if (!c || typeof c.estado !== "string" || typeof c.desde !== "string") return null;
  if (c.estado !== "corrigindo") return c;
  const idade = agora - new Date(c.desde).getTime();
  if (Number.isFinite(idade) && idade <= VALIDADE_DA_CORRECAO_MIN * 60_000) return c;
  return {
    ...c,
    estado: "sem_conserto",
    oQueFazer:
      "A correção automática parou no meio e não terminou. Abra a peça e peça o ajuste pelo chat do card, ou mande o squad revisar a semana de novo.",
  };
}

/** Atalho da tela: o squad está corrigindo este dia agora? */
export function squadCorrigindo(metadata: unknown, agora = Date.now()): boolean {
  return lerCorrecaoDaVera(metadata, agora)?.estado === "corrigindo";
}

/**
 * O veredito pede correção do squad?
 *
 * REPROVADO sempre pede. APROVADO_COM_RESSALVAS só quando a ressalva é
 * DEFEITO que não pode ir ao ar (texto cortado, marcador vazado, dado sem
 * fonte, item que ela mesma chamou de bloqueante): a regra de 21/09 continua
 * valendo, gosto não reprova e não gera reescrita paga. Sem esse filtro toda
 * ressalva viraria duas chamadas de Opus a mais.
 */
export function vereditoPedeCorrecao(veredito: string, parecer: string): boolean {
  const v = veredito.toUpperCase();
  if (v.startsWith("REPROVADO")) return true;
  if (v !== "APROVADO_COM_RESSALVAS") return false;
  // A negação sai antes: na revisão depois da correção de 01/10 a Vera
  // escreveu "ressalva, não bloqueio" e "nada bloqueante", e a palavra solta
  // mandou para o cliente um dia que ela tinha acabado de liberar.
  const semNegacao = parecer.replace(/\b(nada|n[aã]o|nenhum[a]?|sem)\s+(é\s+|e\s+)?(bloque\w*|impede\w*)/gi, "");
  return DEFEITO_QUE_NAO_VAI_AO_AR.test(semNegacao);
}

// Só frase de BLOQUEIO. "Truncado", "sem fonte" e "inventado" soltos ficaram
// de fora de propósito: medido nos pareceres de 29/09, a Vera escreve "soa
// truncado" sobre ritmo e "nada inventado" como elogio, e cada falso positivo
// aqui é uma rodada de reescrita paga num dia que ela já aprovou.
const DEFEITO_QUE_NAO_VAI_AO_AR =
  /bloqueante|n[aã]o pode ir ao ar|remo[cç][aã]o obrigat[oó]ria|cortad[ao] no meio|texto quebrado indo ao ar|lixo de processamento|marcador .{0,40}(vazou|colado)|dado inventado|n[uú]mero inventado/i;
