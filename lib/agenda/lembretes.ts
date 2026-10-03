import { avancarRegua } from "@/lib/agenda/regua";

/**
 * OS LEMBRETES DA DEMONSTRAÇÃO, 24 horas e 1 hora antes (01/10).
 *
 * Viraram parte da régua de alertas (lib/agenda/regua.ts), que roda no cron de
 * 1 minuto (app/api/cron/fila) com e-mail e WhatsApp para os dois lados e
 * registro por reunião em agenda_alertas. Esta função fica como porta antiga
 * para scripts que ainda a chamam: roda uma passada da régua inteira.
 *
 * As colunas lembrete24hEm e lembrete1hEm continuam valendo: reunião que já
 * recebeu o lembrete pelo código antigo não recebe de novo.
 */
export async function enviarLembretes(agora = new Date()): Promise<{ h24: number; h1: number; pulados: number }> {
  const r = await avancarRegua(agora);
  return { h24: r.enviados.h24 ?? 0, h1: r.enviados.h1 ?? 0, pulados: r.pulados };
}
