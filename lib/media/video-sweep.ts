import { vigiarEtapas } from "@/lib/media/vigia-das-etapas";

/**
 * A rede de segurança do vigia, na LEITURA da tela.
 *
 * Até 01/10 esta função declarava MORTO (status "failed") todo trabalho que
 * passava do prazo, e só rodava quando alguém abria a tela. Foi o que deixou o
 * corte do Bruno parado mais de uma hora no incidente de 01/10: sem aba aberta
 * ninguém olhava, e com a aba aberta o vídeo só ganharia um "falhou".
 *
 * Agora quem cuida é o vigia (lib/media/vigia-das-etapas.ts), no cron de 1
 * minuto, e ele RETOMA em vez de declarar morto. Aqui ele roda só para este
 * projeto e com 5 minutos de folga além do prazo: se a tela chegou a ver um
 * vídeo parado tanto tempo, o cron falhou, e a tela faz o trabalho dele. Como
 * a retomada é atômica, a tela e o cron juntos nunca retomam duas vezes.
 *
 * Devolve quantos foram retomados ou encerrados, para o chamador saber se vale
 * reler.
 */
export async function varrerExpirados(projectId: string): Promise<number> {
  const r = await vigiarEtapas({ projectId, folgaExtraS: 5 * 60, limite: 5 }).catch(() => null);
  return r ? r.retomados.length + r.desistidos.length : 0;
}
