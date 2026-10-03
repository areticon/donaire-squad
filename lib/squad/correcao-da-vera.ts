import { prisma } from "@/lib/db/prisma";
import type { CorrecaoDaVera } from "@/lib/squad/estado-da-correcao";

/**
 * A ESCRITA da correção que o squad faz sozinho depois da Vera (29/09).
 *
 * A regra e o estado lido pela tela moram em `estado-da-correcao.ts`, sem
 * banco. Aqui ficam as peças que as duas esteiras usam do mesmo jeito: a da
 * campanha de texto (lib/pipeline/executar.ts) e a da semana do vídeo
 * (lib/media/correcao-do-dia-do-video.ts). Uma cópia desta leitura em cada
 * esteira é como as duas passariam a discordar sobre o que é "o motivo".
 */

/** Grava o estado da correção no card da Vera, e o texto novo quando vier. */
export async function gravarCorrecaoNoCard(
  cardId: string,
  correcao: CorrecaoDaVera,
  extra: { content?: string; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  const card = await prisma.campaignCard.findUnique({ where: { id: cardId }, select: { metadata: true } });
  if (!card) return;
  const metadata = {
    ...((card.metadata as Record<string, unknown> | null) ?? {}),
    ...(extra.metadata ?? {}),
    correcaoDaVera: correcao,
  };
  await prisma.campaignCard.update({
    where: { id: cardId },
    data: { metadata: metadata as never, ...(extra.content !== undefined ? { content: extra.content } : {}) },
  });
}

/**
 * O parecer da Vera fatiado por peça: "Post 1", "## Post 2 (X, thread)",
 * "**Post 3**". A chave é o número da peça, na ordem em que ela recebeu.
 *
 * Existe porque devolver o parecer INTEIRO a cada redator faz o Xavier
 * "corrigir" a legenda do Instagram: foi a lição do parecer colado na peça em
 * 18/09. Cada dono recebe a parte dele, mais a leitura geral do dia.
 */
export function secoesPorPeca(parecer: string): Map<number, string> {
  const linhas = parecer.split("\n");
  const secoes = new Map<number, string>();
  let atual: number | null = null;
  let buffer: string[] = [];
  const fechar = () => {
    if (atual !== null) secoes.set(atual, buffer.join("\n").trim());
    buffer = [];
  };
  for (const linha of linhas) {
    const m = linha.match(/^\s*(?:#{1,6}\s*)?\**\s*Post\s+(\d+)\b/i);
    if (m) {
      fechar();
      atual = Number(m[1]);
      buffer.push(linha);
      continue;
    }
    // "Recomendações" (ou outro título de nível 2) fecha a última peça.
    if (atual !== null && /^\s*(?:#{1,3}\s*)?\**\s*Recomenda/i.test(linha)) {
      fechar();
      atual = null;
      continue;
    }
    if (atual !== null) buffer.push(linha);
  }
  fechar();
  return secoes;
}

/** O que vem antes da primeira peça: a leitura geral do dia, sem o cabeçalho do veredito. */
export function leituraGeralDoParecer(parecer: string): string {
  const i = parecer.search(/^\s*(?:#{1,6}\s*)?\**\s*Post\s+1\b/im);
  const antes = i >= 0 ? parecer.slice(0, i) : parecer.slice(0, 1200);
  return antes.replace(/^Veredito:.*$/im, "").replace(/^-{3,}\s*$/gm, "").trim();
}

/** As recomendações do fim do parecer, que valem para todas as peças. */
export function recomendacoesDoParecer(parecer: string): string {
  const i = parecer.search(/^\s*(?:#{1,3}\s*)?\**\s*Recomenda/im);
  return i >= 0 ? parecer.slice(i).trim() : "";
}

/**
 * A seção pede mudança? "O que precisa mudar" com pelo menos um item, ou um
 * item numerado qualquer. Seção só de elogio não manda a peça de volta: é
 * reescrita paga para mexer no que estava bom.
 */
export function secaoPedeMudanca(secao: string | undefined): boolean {
  if (!secao) return false;
  const i = secao.search(/precisa mudar/i);
  const resto = i >= 0 ? secao.slice(i) : secao;
  return /^\s*\d+[.)]\s+\S/m.test(resto) || /^\s*[-•*]\s+\S/m.test(resto.slice(20));
}

/** Os itens que a Vera pediu, em uma linha cada, para o log e para o cliente. */
export function itensDoParecer(parecer: string, max = 3): string[] {
  const itens: string[] = [];
  for (const linha of parecer.split("\n")) {
    const m = linha.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!m) continue;
    const limpo = m[1].replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    if (limpo.length < 12) continue;
    itens.push(limpo.length > 170 ? `${limpo.slice(0, 170)}…` : limpo);
    if (itens.length >= max) break;
  }
  return itens;
}

/** A queixa principal em uma linha: o primeiro item pedido, ou a primeira frase útil. */
export function motivoDoParecer(parecer: string): string {
  const [primeiro] = itensDoParecer(parecer, 1);
  if (primeiro) return primeiro;
  const linha = leituraGeralDoParecer(parecer)
    .split("\n")
    .map((l) => l.replace(/^[#\s\-*•]+/, "").trim())
    .find((l) => l.length > 25);
  if (!linha) return "a Vera pediu correção no texto do dia.";
  return linha.length > 170 ? `${linha.slice(0, 170)}…` : linha;
}

/**
 * O que o cliente lê quando o squad NÃO conseguiu consertar em 2 tentativas.
 *
 * O motivo vem das palavras da Vera, e as saídas são as três que a tela
 * realmente oferece: pedir pelo chat da peça, editar e aprovar, ou rejeitar.
 * "Reprovado, esperando você" sem isso é o que o Bruno recusou.
 */
export function oQueFazerDoCliente(parecer: string, tentativas: number): string {
  const itens = itensDoParecer(parecer, 3);
  const falta = itens.length ? `O que ainda falta, nas palavras da Vera:\n${itens.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n` : "";
  return (
    (tentativas > 0
      ? `O squad refez ${tentativas === 1 ? "1 vez" : `${tentativas} vezes`} e a Vera ainda não liberou este dia.\n\n`
      : "O squad não tinha como refazer este dia sozinho (o conserto pede algo que só você decide ou fornece).\n\n") +
    falta +
    "Você pode: pedir o ajuste pelo chat da peça (o agente refaz com o seu pedido), editar o texto você mesmo e aprovar, ou rejeitar o dia para ele não sair."
  );
}
