import { decidirNoul, jevLigado, perguntarAoJev, type PerguntaDoJev } from "@/lib/jev/cliente";
import { semTravessao, TETO } from "@/lib/biblioteca-de-design/tipos";

/**
 * O QUE É DO CLIENTE NÃO VAI PARA A GALERIA (06/10/2026, vazamento).
 *
 * A biblioteca é pública: o que um cliente pede aparece para os outros, e
 * escolher um design copia o texto dele para o comando de quem escolheu. Um
 * pedido como "visual claro com o logo da Clínica Sorriso e o meu WhatsApp"
 * levava marca e contato de um cliente para outro.
 *
 * Quem decide o que é DESCRIÇÃO DO VISUAL e o que é DADO DO CLIENTE é o JEV
 * (regra do Bruno: decisão é do JEV; o LLM só reescreve o texto):
 *   1. o código corta o pedido em trechos (frase, oração);
 *   2. o JEV responde, por trecho, se ele descreve SÓ o visual, sem marca,
 *      empresa, produto, pessoa, rosto específico, contato nem texto que o
 *      cliente quer escrito na peça. "Não sei" conta como dado do cliente;
 *   3. o redator (Claude) escreve a ficha pública SÓ com os trechos visuais;
 *   4. o JEV confere a ficha escrita (`fichaEstaLimpa`): se ela ainda cita
 *      algo do cliente, a entrada fica só no projeto.
 * Sem o JEV (chave fora, JEV_LIGADO=0, erro), nada é público: a entrada fica
 * só no projeto de quem pediu. O padrão seguro é não publicar.
 */

/** O máximo de trechos perguntados (um pedido tem até 1.500 caracteres). */
const TETO_DE_TRECHOS = 30;

/** Corta o pedido em trechos: frases e orações (vírgula, ponto e vírgula, quebra de linha). */
export function trechosDoPedido(pedido: string): string[] {
  return semTravessao(pedido)
    .slice(0, TETO.pedido)
    .split(/(?<=[.!?;])\s+|\n+|,\s+/)
    .map((t) => t.replace(/^[\s,;.]+|[\s,;]+$/g, "").trim())
    .filter((t) => t.length >= 3)
    .slice(0, TETO_DE_TRECHOS);
}

const O_QUE_E_DO_CLIENTE =
  "nome de marca, empresa, loja, produto ou serviço com nome próprio; nome de pessoa; o rosto, a foto ou o corpo de alguém específico (o próprio cliente, um sócio, um funcionário); contato (telefone, WhatsApp, e-mail, @, site, endereço, cidade do negócio); preço, promoção ou dado do negócio; ou uma frase que o cliente quer escrita na peça";

export type SeparacaoDoPedido = {
  /** Os trechos que o JEV disse que são só visual, na ordem do pedido. */
  visual: string[];
  /** Quantos trechos ficaram de fora (dado do cliente ou dúvida). */
  doCliente: number;
  /** O JEV respondeu; falso quando ele não estava disponível (nada é público). */
  peloJev: boolean;
};

/** O JEV separa, trecho a trecho, o que é descrição do visual do que é dado do cliente. */
export async function separarVisualDoCliente(e: { pedido: string; projectId?: string | null }): Promise<SeparacaoDoPedido> {
  const trechos = trechosDoPedido(e.pedido);
  if (!trechos.length || !jevLigado()) return { visual: [], doCliente: trechos.length, peloJev: false };
  const perguntas: Record<string, PerguntaDoJev> = Object.fromEntries(
    trechos.map((t, i) => [
      `t${i}`,
      {
        type: "noul",
        instructions: `Trecho ${i + 1} do pedido: "${t}". Este trecho descreve SÓ o visual (estilo, cor, material, luz, textura, ritmo, enquadramento, composição, tipo de elemento gráfico) e pode ser mostrado a OUTROS clientes sem expor quem pediu? Responda NÃO se o trecho tiver ${O_QUE_E_DO_CLIENTE}.`,
      } satisfies PerguntaDoJev,
    ])
  );
  try {
    const r = await perguntarAoJev({ projectId: e.projectId ?? null, etapa: "biblioteca-de-design-privacidade", state: { pedido: semTravessao(e.pedido).slice(0, TETO.pedido) } }, perguntas);
    // "Não sei" (noul no meio) cai em "do cliente": só o sim firme publica.
    const visual = trechos.filter((_, i) => decidirNoul(r[`t${i}`], false, 0.5, 0.75));
    return { visual, doCliente: trechos.length - visual.length, peloJev: true };
  } catch (err) {
    console.warn("[biblioteca-de-design] o JEV não separou o pedido; a entrada fica só no projeto:", err instanceof Error ? err.message : err);
    return { visual: [], doCliente: trechos.length, peloJev: false };
  }
}

/**
 * A CONFERÊNCIA DA FICHA ESCRITA, pelo JEV: o nome, a descrição e a
 * linguagem que vão para a galeria ainda citam algo do cliente? Falso (não
 * publica) quando o JEV não responde ou fica em dúvida.
 */
export async function fichaEstaLimpa(e: { nome: string; descricao: string; linguagem: string; projectId?: string | null }): Promise<boolean> {
  if (!jevLigado()) return false;
  const perguntas: Record<string, PerguntaDoJev> = {
    limpa: {
      type: "noul",
      instructions: `Esta ficha de design vai para uma galeria pública vista por outros clientes. Ela está LIMPA, isto é, NÃO tem ${O_QUE_E_DO_CLIENTE}? Estilo descrito por técnica, material e luz é limpo; nome de estilo famoso genérico também.`,
    },
  };
  try {
    const r = await perguntarAoJev({ projectId: e.projectId ?? null, etapa: "biblioteca-de-design-privacidade", state: { nome: e.nome, descricao: e.descricao, linguagem: e.linguagem } }, perguntas);
    return decidirNoul(r.limpa, false, 0.5, 0.75);
  } catch (err) {
    console.warn("[biblioteca-de-design] o JEV não conferiu a ficha; a entrada fica só no projeto:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** A ficha de reserva (sem o redator) copia o pedido cru: nunca é pública. Mora em tipos.ts (08/10), para a regra pura da entrada. */
export { MARCA_DA_RESERVA } from "@/lib/biblioteca-de-design/tipos";
