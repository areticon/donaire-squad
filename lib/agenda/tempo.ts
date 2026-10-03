/**
 * O RELÓGIO DO AGENDAMENTO (01/10), num módulo puro: a tela e o servidor
 * desenham o mesmo horário.
 *
 * TUDO É CONTADO NO FUSO DE SÃO PAULO e guardado em UTC. O servidor da Vercel
 * roda em UTC e o navegador do lead pode estar em qualquer lugar; "9h" na
 * janela do Bruno é 9h em São Paulo, e o lead vê o horário de São Paulo
 * escrito por extenso, para não ter "9h" virando "12h" em Lisboa sem aviso.
 *
 * O deslocamento do fuso é perguntado ao Intl a cada data, e não fixado em
 * menos três: o Brasil já teve horário de verão e pode voltar a ter, e uma
 * constante errada marca todas as reuniões uma hora fora.
 */

export const FUSO = "America/Sao_Paulo";
export const DURACAO_MIN = 30;
export const DIAS_UTEIS = 10;

type Partes = { ano: number; mes: number; dia: number; hora: number; minuto: number };

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** As partes do relógio de parede de um instante, no fuso pedido. */
export function partesNoFuso(d: Date, fuso = FUSO): Partes {
  const p: Record<string, string> = {};
  for (const x of formatador(fuso).formatToParts(d)) p[x.type] = x.value;
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour % 24, minuto: +p.minute };
}

/** Quantos minutos o fuso está à frente do UTC naquele instante (São Paulo: -180). */
function deslocamentoMin(d: Date, fuso: string): number {
  const p = partesNoFuso(d, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
  return Math.round((comoUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/**
 * O instante de um relógio de parede ("2026-10-05", "09:30") num fuso. Duas
 * passadas: a primeira acha o deslocamento perto do horário, a segunda corrige
 * se a data cruzou uma troca de horário.
 */
export function instanteNoFuso(dataISO: string, hhmm: string, fuso = FUSO): Date {
  const [a, m, d] = dataISO.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const parede = Date.UTC(a, m - 1, d, h, mi);
  let t = parede - deslocamentoMin(new Date(parede), fuso) * 60000;
  const outro = deslocamentoMin(new Date(t), fuso);
  t = parede - outro * 60000;
  return new Date(t);
}

export function instanteEmSP(dataISO: string, hhmm: string): Date {
  return instanteNoFuso(dataISO, hhmm, FUSO);
}

const dois = (n: number) => String(n).padStart(2, "0");

/** "2026-10-05": a data de São Paulo de um instante. */
export function dataEmSP(d: Date): string {
  const p = partesNoFuso(d);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}

/** "09:30" em São Paulo. */
export function horaEmSP(d: Date): string {
  const p = partesNoFuso(d);
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** Minutos desde a meia-noite de "HH:MM". */
export function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function hhmmDe(min: number): string {
  return `${dois(Math.floor(min / 60))}:${dois(min % 60)}`;
}

/** Dia da semana de uma data ISO (domingo = 0, segunda = 1). */
export function diaDaSemana(dataISO: string): number {
  const [a, m, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
}

export function somarDias(dataISO: string, n: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n, 12));
  return `${x.getUTCFullYear()}-${dois(x.getUTCMonth() + 1)}-${dois(x.getUTCDate())}`;
}

/** Domingo de Páscoa (algoritmo de Meeus), de onde saem os feriados móveis. */
function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

/**
 * Os dias em que o time não atende: feriados nacionais, a Sexta-feira Santa, o
 * Carnaval (segunda e terça, ponto facultativo que o mercado inteiro emenda) e
 * Corpus Christi (feriado na cidade de São Paulo). Demonstração marcada no dia
 * 12 de outubro é reunião com ninguém do outro lado.
 */
export function feriados(ano: number): Set<string> {
  const p = pascoa(ano);
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  return new Set([...fixos, somarDias(p, -48), somarDias(p, -47), somarDias(p, -2), somarDias(p, 60)]);
}

export function diaUtil(dataISO: string): boolean {
  const s = diaDaSemana(dataISO);
  if (s === 0 || s === 6) return false;
  return !feriados(Number(dataISO.slice(0, 4))).has(dataISO);
}

/** Os próximos `n` dias úteis a partir de hoje (inclusive), em São Paulo. */
export function proximosDiasUteis(agora: Date, n = DIAS_UTEIS): string[] {
  const dias: string[] = [];
  let d = dataEmSP(agora);
  while (dias.length < n) {
    if (diaUtil(d)) dias.push(d);
    d = somarDias(d, 1);
  }
  return dias;
}

const rotuloCurto = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const rotuloLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

function meioDia(dataISO: string): Date {
  const [a, m, d] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/** "seg., 5 de out." */
export function rotuloDoDia(dataISO: string): string {
  return rotuloCurto.format(meioDia(dataISO));
}

/** "segunda-feira, 5 de outubro" */
export function rotuloLongoDoDia(dataISO: string): string {
  return rotuloLongo.format(meioDia(dataISO));
}

/**
 * "segunda-feira, 5 de outubro, às 09:30", sem o fuso: o modelo de WhatsApp já
 * diz "horário de Brasília" no texto fixo (01/10, régua de alertas).
 */
export function diaEHora(inicio: Date): string {
  return `${rotuloLongoDoDia(dataEmSP(inicio))}, às ${horaEmSP(inicio)}`;
}

/** "segunda-feira, 5 de outubro, às 09:30 (horário de Brasília)" */
export function quandoPorExtenso(inicio: Date): string {
  return `${rotuloLongoDoDia(dataEmSP(inicio))}, às ${horaEmSP(inicio)} (horário de Brasília)`;
}
