/**
 * A PEÇA AINDA ESTÁ SENDO FEITA? (teste do cliente de 29/09)
 *
 * Enquanto o Xavier escrevia a thread, o calendário dizia "esperando você"
 * sobre um card cujo texto era "Xavier está escrevendo a thread deste dia a
 * partir do vídeo e do briefing do Roberto", e o clique não abria nada que
 * desse para aprovar. Pedir decisão sobre o que não existe ainda é o mesmo
 * erro do "Agendado" sem aprovação: a tela promete o que não é.
 *
 * Três sinais, do mais forte para o mais fraco:
 *
 *  1. `metadata.aguardando`: o card de ESPERA que o quadro do vídeo cria
 *     (lib/media/quadro-do-video.ts) nasce com ela, e quem escreve a peça a
 *     apaga ao preencher o card (lib/media/pecas-da-semana.ts);
 *  2. a revisão pedida pelo chat, ainda aberta (lib/pipeline/revisao.ts):
 *     o agente está refazendo a peça agora;
 *  3. o texto de espera ("Lucas está escrevendo...", "Diana está montando..."),
 *     para o card antigo que nasceu antes da marca.
 *
 * Puro, sem banco: a tela de cliente importa daqui.
 */
import { lerRevisao } from "@/lib/pipeline/revisao";
import { lerRevisaoDoCorte, type RevisaoDoCorte } from "@/lib/media/estado-da-revisao-do-corte";
import { squadCorrigindo } from "@/lib/squad/estado-da-correcao";

export type CardParaProducao = {
  content?: string | null;
  metadata?: unknown;
};

// Os verbos que os cards de espera usam hoje. Só no começo do texto: um post
// pronto pode muito bem conter "está escrevendo" no meio de uma frase.
const TEXTO_DE_ESPERA =
  /^\s*[A-ZÀ-Ú][\p{L}]+ (?:[A-ZÀ-Ú][\p{L}]+ )?está (?:escrevendo|criando|montando|pesquisando|gerando|refazendo|cortando|editando)\b/u;

export function cardEmProducao(card: CardParaProducao | null | undefined): boolean {
  if (!card) return false;
  const meta = (card.metadata ?? null) as { aguardando?: unknown; falha?: unknown } | null;
  // Card com falha gravada não está sendo feito: está parado, e é o aviso
  // dele que precisa aparecer, não um "fazendo" eterno.
  if (meta?.falha) return false;
  if (typeof card.content === "string" && card.content.startsWith("AVISO:")) return false;
  if (meta?.aguardando === true) return true;
  // A EDIÇÃO AINDA RODANDO (30/09, pedido do Bruno: "se a peça não está pronta,
  // não leve para o card"): corte ou completo com a montagem em andamento fica
  // "o squad está fazendo", e não com a versão simples como se fosse a final.
  const estadoDaMontagem = (meta as { montagem?: { estado?: string } } | null)?.montagem?.estado;
  if (estadoDaMontagem && ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(estadoDaMontagem)) return true;
  if (lerRevisao(card.metadata)) return true;
  // O dia que a Vera reprovou e o squad está refazendo (29/09): o card dela
  // diz "o squad está corrigindo", e não "reprovado, esperando você".
  if (squadCorrigindo(card.metadata)) return true;
  // O corte que a Vera está revisando, ou que o Vitor está refazendo porque
  // ela reprovou (lib/media/revisao-do-corte.ts): o cliente não tem o que
  // decidir ainda. O prazo vencido já sai daqui como "precisa de você".
  const revisaoDoCorte = (meta as { revisaoDoCorte?: RevisaoDoCorte } | null)?.revisaoDoCorte;
  if (lerRevisaoDoCorte(revisaoDoCorte)?.trabalhando) return true;
  return typeof card.content === "string" && TEXTO_DE_ESPERA.test(card.content);
}
