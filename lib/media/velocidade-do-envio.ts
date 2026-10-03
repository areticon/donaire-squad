/**
 * A velocidade real do envio e quanto falta (item 14, 29/09).
 *
 * ## Por que existe
 *
 * O Bruno subiu 1,29 GB pela Starlink (parte 195) olhando só "Enviando, 37%".
 * Porcentagem sem ritmo não responde a pergunta que a pessoa tem na cabeça:
 * "dá tempo de tomar um café ou eu fico aqui?". E quem está no celular com
 * dados móveis não sabe que vai gastar a franquia inteira até o fim.
 *
 * A medida é a do PRÓPRIO envio: bytes que já saíram do navegador por segundo,
 * numa janela móvel. Nenhum teste de velocidade externo (seria mais um serviço,
 * e mediria o download, que não é o que importa aqui). Sem React e sem banco,
 * para dar para testar por script.
 */

export type Amostra = { t: number; enviados: number };

/** A janela da média móvel. Curta demais pula a cada parte; longa demais demora a reagir. */
export const JANELA_MS = 8000;
/** Antes disso a conta é ruído: as primeiras partes saem em rajada do buffer. */
export const MEDIDA_MINIMA_MS = 1500;

/** Acrescenta a amostra e joga fora o que saiu da janela (guardando uma na borda). */
export function registrar(amostras: Amostra[], nova: Amostra): Amostra[] {
  const lista = [...amostras, nova];
  const limite = nova.t - JANELA_MS;
  // Mantém a última amostra ANTES da janela: é ela que dá o ponto de partida
  // quando o progresso chega em saltos espaçados (envio em partes).
  let corte = 0;
  while (corte < lista.length - 2 && lista[corte + 1].t <= limite) corte++;
  return lista.slice(corte);
}

/** Bytes por segundo na janela, ou nulo enquanto ainda não dá para medir. */
export function bytesPorSegundo(amostras: Amostra[]): number | null {
  if (amostras.length < 2) return null;
  const a = amostras[0];
  const b = amostras[amostras.length - 1];
  const dt = b.t - a.t;
  if (dt < MEDIDA_MINIMA_MS) return null;
  const db = b.enviados - a.enviados;
  if (db <= 0) return 0;
  return (db * 1000) / dt;
}

/** Segundos para o que falta, na velocidade medida. Nulo sem medida. */
export function segundosQueFaltam(total: number, enviados: number, bps: number | null): number | null {
  if (!bps || bps <= 0) return null;
  return Math.max(0, (total - enviados) / bps);
}

/** "12,4 Mbps": é a unidade que o plano de internet da pessoa usa. */
export function velocidadePorExtenso(bps: number): string {
  const mbps = (bps * 8) / 1_000_000;
  if (mbps < 1) return `${Math.round(mbps * 1000)} kbps`;
  return `${mbps.toLocaleString("pt-BR", { maximumFractionDigits: mbps < 10 ? 1 : 0 })} Mbps`;
}

/** "cerca de 14 min", "cerca de 1 h 20 min", "menos de 1 min". */
export function tempoPorExtenso(segundos: number): string {
  if (segundos < 60) return "menos de 1 min";
  const min = Math.round(segundos / 60);
  if (min < 60) return `cerca de ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `cerca de ${h} h ${m} min` : `cerca de ${h} h`;
}

/** Arquivo que merece o aviso de wi-fi antes de começar. */
export const ARQUIVO_GRANDE_BYTES = 500 * 1024 * 1024;
/** Envio que, medido, vai passar disso também merece o aviso. */
export const ENVIO_LONGO_S = 10 * 60;

/**
 * A pessoa está em dados móveis?
 *
 * `navigator.connection` só existe no Chrome e derivados (no Android diz
 * "cellular"; no computador, em geral, não diz o tipo). Safari e Firefox não
 * têm: aí a resposta é "não sei", e o aviso vira conselho em vez de alerta.
 */
export function emDadosMoveis(): boolean | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection;
  if (!c || !c.type) return null;
  return c.type === "cellular";
}
