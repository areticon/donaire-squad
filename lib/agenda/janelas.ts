import { minutosDe } from "@/lib/agenda/tempo";

/**
 * AS JANELAS SEMANAIS DE CADA PESSOA DO TIME (01/10), em módulo puro: a tela
 * do admin edita no mesmo formato que o servidor lê.
 *
 * Uma janela é um trecho de um dia da semana em que a pessoa aceita
 * demonstração, no relógio de São Paulo. O padrão (9h às 12h e 14h às 18h, de
 * segunda a sexta) veio do pedido do Bruno e está marcado como "a confirmar".
 */

export type Janela = { dia: number; inicio: string; fim: string };

export const NOMES_DOS_DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export const JANELAS_PADRAO: Janela[] = [1, 2, 3, 4, 5].flatMap((dia) => [
  { dia, inicio: "09:00", fim: "12:00" },
  { dia, inicio: "14:00", fim: "18:00" },
]);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Lê o que veio do banco ou da tela e devolve só janelas válidas, em ordem.
 * Janela torta (fim antes do início, hora inválida) é descartada em vez de
 * derrubar a agenda inteira: uma linha errada no admin não pode tirar todos
 * os horários do ar.
 */
export function janelasValidas(bruto: unknown): Janela[] {
  if (!Array.isArray(bruto)) return [];
  const ok: Janela[] = [];
  for (const j of bruto) {
    if (!j || typeof j !== "object") continue;
    const { dia, inicio, fim } = j as Record<string, unknown>;
    if (typeof dia !== "number" || !Number.isInteger(dia) || dia < 0 || dia > 6) continue;
    if (typeof inicio !== "string" || typeof fim !== "string" || !HHMM.test(inicio) || !HHMM.test(fim)) continue;
    if (minutosDe(fim) <= minutosDe(inicio)) continue;
    ok.push({ dia, inicio, fim });
  }
  return ok.sort((a, b) => a.dia - b.dia || minutosDe(a.inicio) - minutosDe(b.inicio));
}

/** "09:00-12:00, 14:00-18:00" das janelas de um dia, para o campo do admin. */
export function textoDoDia(janelas: Janela[], dia: number): string {
  return janelas
    .filter((j) => j.dia === dia)
    .map((j) => `${j.inicio}-${j.fim}`)
    .join(", ");
}

/**
 * O contrário: "9-12, 14:00-18:00" vira janelas. Aceita hora sem minutos,
 * porque é assim que se digita.
 */
export function janelasDoTexto(texto: string, dia: number): Janela[] {
  const norm = (h: string) => {
    const t = h.trim();
    if (/^\d{1,2}$/.test(t)) return `${t.padStart(2, "0")}:00`;
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, "0");
    return t;
  };
  return janelasValidas(
    texto
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [i, f] = p.split(/\s*(?:-|até|às|a)\s*/);
        return { dia, inicio: norm(i ?? ""), fim: norm(f ?? "") };
      })
  );
}
