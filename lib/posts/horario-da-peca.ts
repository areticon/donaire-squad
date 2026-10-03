/**
 * O HORÁRIO DE UMA PEÇA, dito do jeito certo antes e depois da aprovação.
 *
 * ## Por que existe (teste do cliente de 29/09)
 *
 * Na Demandou nada sai sem o cliente aprovar no card do Paulo. Mesmo assim as
 * prévias escreviam "Agendado: 02 out., 09:00" sobre rascunho, e o cliente
 * leu que a peça ia ao ar sozinha. Agendado é só o post com status
 * `scheduled`, que é o que "Deixar agendado" grava; antes disso o horário é
 * uma PROPOSTA, e a tela diz "sai 02/10 às 09:00 se você aprovar".
 *
 * No mesmo teste o card do Paulo mostrava três horários: 11:00 no cabeçalho
 * (o `scheduledDate` do card de publicação, que a esteira grava duas horas
 * depois do post para o card cair depois da revisão da Vera), 09:00 na caixa
 * (o `scheduledAt` do post) e "o horário já passou" no rascunho. A fonte é uma
 * só: o `scheduledAt` do post. Tudo aqui formata no fuso de Brasília, também
 * quando o navegador está em outro.
 *
 * Puro de propósito (sem banco): a tela de cliente importa daqui.
 */
import { FUSO_PADRAO, instanteLocalSeguro } from "@/lib/fuso";

const partes = (d: Date) => {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_PADRAO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d)) {
    if (x.type !== "literal") p[x.type] = x.value;
  }
  // Algumas plataformas devolvem "24" na meia-noite.
  if (p.hour === "24") p.hour = "00";
  return p;
};

/** "02/10 às 09:00", em Brasília. */
export function diaEHora(d: Date): string {
  const p = partes(d);
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

/**
 * O que a tela diz sobre o horário de um post.
 *
 * `curto` é para o espaço apertado (cabeçalho da prévia, cartão do
 * calendário): "sai 02/10 09:00 se aprovar".
 */
export function rotuloDoHorario(
  post: { status: string; scheduledAt?: string | Date | null },
  curto = false
): string | null {
  if (!post.scheduledAt) return null;
  const d = new Date(post.scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  const p = partes(d);
  if (post.status === "scheduled" || post.status === "publishing") {
    return curto ? `Agendado: ${p.day}/${p.month} ${p.hour}:${p.minute}` : `Agendado: sai sozinho ${diaEHora(d)}`;
  }
  if (post.status === "published") return null;
  return curto ? `sai ${p.day}/${p.month} ${p.hour}:${p.minute} se aprovar` : `sai ${diaEHora(d)} se você aprovar`;
}

/** Os campos `date` e `time` do formulário, preenchidos no horário de Brasília. */
export function paraCampos(d: Date): { data: string; hora: string } {
  const p = partes(d);
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** O inverso: o que o cliente digitou nos campos, lido como hora de Brasília. */
export function deCampos(data: string, hora: string): Date {
  return instanteLocalSeguro(data, hora, FUSO_PADRAO);
}

// A janela em que faz sentido sugerir publicação: ninguém quer ver a peça
// sair às três da manhã só porque era o próximo horário vago.
const PRIMEIRA_HORA = 8;
const ULTIMA_HORA = 21;
const FOLGA_MS = 30 * 60_000;
const DISTANCIA_MS = 60 * 60_000;

/**
 * O PRÓXIMO HORÁRIO LIVRE para uma peça cuja agenda venceu.
 *
 * Antes a tela só dizia "o horário do dia já passou" e empurrava a peça para
 * o mesmo horário do dia seguinte, que numa campanha diária é justamente o
 * horário da peça seguinte. Aqui a sugestão é a primeira hora cheia a partir
 * de daqui a meia hora, dentro de 08:00 a 21:00 em Brasília, que não fique a
 * menos de uma hora de outra peça do projeto.
 *
 * `ocupados` são os horários das OUTRAS peças (quem chama tira as da própria).
 */
export function proximoHorarioLivre(ocupados: Array<Date | string>, agora: Date = new Date()): Date {
  const outros = ocupados
    .map((o) => new Date(o).getTime())
    .filter((t) => Number.isFinite(t));
  // Primeira hora cheia depois da folga.
  let t = Math.ceil((agora.getTime() + FOLGA_MS) / DISTANCIA_MS) * DISTANCIA_MS;
  // Duas semanas de horas é mais do que qualquer agenda real ocupa; o limite
  // só existe para o laço nunca ser infinito.
  for (let i = 0; i < 24 * 14; i++, t += DISTANCIA_MS) {
    const hora = Number(partes(new Date(t)).hour);
    if (hora < PRIMEIRA_HORA || hora > ULTIMA_HORA) continue;
    if (outros.some((o) => Math.abs(o - t) < DISTANCIA_MS)) continue;
    return new Date(t);
  }
  return new Date(Math.ceil((agora.getTime() + FOLGA_MS) / DISTANCIA_MS) * DISTANCIA_MS);
}

/**
 * O horário em que a peça sai se o cliente aprovar agora: o planejado, quando
 * ainda não chegou; senão o próximo horário livre, com `andou` avisando que
 * mudou.
 */
export function horarioParaAprovar(
  planejado: string | Date | null | undefined,
  ocupados: Array<Date | string> = [],
  agora: Date = new Date()
): { iso: string; andou: boolean } | null {
  if (!planejado) return null;
  const d = new Date(planejado);
  if (Number.isNaN(d.getTime())) return null;
  // Dois minutos de margem: a rota recusa agendar no passado, e o clique
  // leva algum tempo até chegar lá.
  if (d.getTime() > agora.getTime() + 2 * 60_000) return { iso: d.toISOString(), andou: false };
  return { iso: proximoHorarioLivre(ocupados, agora).toISOString(), andou: true };
}
