/**
 * Hora local do projeto, convertida para o instante certo.
 *
 * ## O defeito que este módulo conserta, medido em 18/09/2026
 *
 * O projeto tem um campo "Fuso horário" na tela do assistente, com
 * `America/Sao_Paulo` gravado como padrão no banco, no formulário e no
 * placeholder. **E nada no código lia esse campo.** Era o terceiro campo
 * decorativo achado em dois dias, depois de `gravacoesPorMes` e `marcas`.
 *
 * Pior que decorativo: o agendamento fazia `setUTCHours(9, 0)` para uma
 * campanha marcada às 09:00, e a Vercel roda em UTC. O post saía às **06:00 em
 * São Paulo**, três horas antes do que a pessoa pediu, e de madrugada é o pior
 * horário possível para publicar.
 *
 * O caminho do navegador já estava certo: `postingTimestamps` é calculado na
 * máquina da pessoa e chega como ISO absoluto, com o fuso dela embutido. Só o
 * FALLBACK do servidor errava, e ele é justamente quem agenda semana futura,
 * que é o caso que ninguém confere na hora.
 *
 * ## Por que não usar uma biblioteca
 *
 * `Intl` já sabe todos os fusos e já acompanha as regras de horário de verão.
 * O Brasil não tem horário de verão desde 2019, mas um cliente em Lisboa ou
 * Miami tem, e a conta abaixo funciona para os dois sem dependência nova.
 */

/** O fuso da casa. Todo produto lista UTC e mil outros; o nosso padrão é este. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * Quantos milissegundos o fuso está adiantado em relação ao UTC, naquele
 * instante (e é "naquele instante" que faz a conta valer com horário de verão).
 */
function deslocamento(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const p: Record<string, number> = {};
  for (const parte of partes) if (parte.type !== "literal") p[parte.type] = Number(parte.value);

  // `hour` volta como 24 na virada da meia-noite em algumas plataformas, e
  // Date.UTC com 24 rola para o dia seguinte, o que estragaria a conta em uma
  // hora por dia. O módulo resolve sem esconder nada.
  const comoSeFosseUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return comoSeFosseUtc - instante.getTime();
}

/**
 * "2026-09-22" mais "09:00" no fuso do projeto, devolvidos como o instante real.
 *
 * Com `America/Sao_Paulo`, 09:00 vira 12:00 UTC. Era isso que faltava: antes, a
 * mesma entrada virava 09:00 UTC, ou seja 06:00 na casa do cliente.
 */
export function instanteLocal(dataIso: string, hora: string, fuso?: string | null): Date {
  const alvo = fuso?.trim() || FUSO_PADRAO;
  const [h, m] = hora.split(":").map(Number);
  const hh = Number.isFinite(h) ? h : 9;
  const mm = Number.isFinite(m) ? m : 0;

  // Primeiro monta o instante como se a hora fosse UTC, depois desconta o
  // deslocamento medido NAQUELE ponto do calendário.
  const palpite = new Date(`${dataIso}T00:00:00.000Z`);
  palpite.setUTCHours(hh, mm, 0, 0);

  const ajustado = new Date(palpite.getTime() - deslocamento(palpite, alvo));

  // Fuso inválido faz `Intl` lançar; aqui ele já teria lançado. Se a conta
  // saiu NaN por qualquer outro motivo, o palpite cru é melhor que uma data
  // inválida chegando no banco.
  return Number.isNaN(ajustado.getTime()) ? palpite : ajustado;
}

/** O mesmo, tolerando fuso que não existe: cai no padrão da casa em vez de quebrar. */
export function instanteLocalSeguro(dataIso: string, hora: string, fuso?: string | null): Date {
  try {
    return instanteLocal(dataIso, hora, fuso);
  } catch {
    // Fuso digitado errado pelo cliente (o campo é texto livre) não pode
    // derrubar uma campanha inteira. Cai em São Paulo e segue.
    return instanteLocal(dataIso, hora, FUSO_PADRAO);
  }
}
