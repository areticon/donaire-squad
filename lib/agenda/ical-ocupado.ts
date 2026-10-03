import { instanteNoFuso, FUSO } from "@/lib/agenda/tempo";

/**
 * O OCUPADO DE UMA AGENDA QUE NÃO É GOOGLE, por endereço iCal (01/10).
 *
 * Serve para a agenda do Outlook (Microsoft 365 publica "somente
 * disponibilidade" num endereço .ics) e para qualquer outra que exporte
 * iCalendar. O que se lê é só QUANDO está ocupado: título e descrição do
 * evento nunca saem daqui.
 *
 * O QUE ENTRA: eventos (VEVENT) não cancelados e não marcados como livres
 * (TRANSP:TRANSPARENT), blocos de VFREEBUSY, e repetição diária e semanal
 * (RRULE com BYDAY, INTERVAL, UNTIL, COUNT e EXDATE), que é o que agenda de
 * trabalho tem. Repetição mensal ou anual conta só a primeira ocorrência: é
 * raro em agenda de reunião e um expansor completo é um projeto à parte.
 *
 * FALHA DE LEITURA DEIXA A PESSOA SEM HORÁRIO (quem chama decide), e não com a
 * agenda inteira livre: marcar por cima de compromisso é pior do que mostrar
 * menos horários.
 */

export type Intervalo = { inicio: Date; fim: Date };

/** Nomes de fuso do Windows que o Outlook escreve no TZID. */
const FUSOS_DO_WINDOWS: Record<string, string> = {
  "E. South America Standard Time": "America/Sao_Paulo",
  "SA Eastern Standard Time": "America/Fortaleza",
  "Central Brazilian Standard Time": "America/Cuiaba",
  "SA Western Standard Time": "America/Manaus",
  "Tocantins Standard Time": "America/Araguaina",
  "Bahia Standard Time": "America/Bahia",
  UTC: "UTC",
  "GMT Standard Time": "Europe/London",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
};

function fusoValido(tzid: string | undefined): string {
  if (!tzid) return FUSO;
  const nome = FUSOS_DO_WINDOWS[tzid] ?? tzid.replace(/^\/+/, "");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: nome });
    return nome;
  } catch {
    return FUSO;
  }
}

type Linha = { nome: string; params: Record<string, string>; valor: string };

/** Desdobra as linhas (continuação começa com espaço) e separa nome, parâmetros e valor. */
function linhas(ics: string): Linha[] {
  const cruas = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: Linha[] = [];
  for (const l of cruas) {
    const i = l.indexOf(":");
    if (i < 0) continue;
    const [nome, ...ps] = l.slice(0, i).split(";");
    const params: Record<string, string> = {};
    for (const p of ps) {
      const [k, v] = p.split("=");
      if (k && v !== undefined) params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
    }
    out.push({ nome: nome.toUpperCase(), params, valor: l.slice(i + 1) });
  }
  return out;
}

/** "20261005T090000Z", "20261005T090000" (com TZID ou flutuante) ou "20261005" (dia inteiro). */
function data(valor: string, params: Record<string, string>): { d: Date; diaInteiro: boolean } | null {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, a, me, di, h, mi, , z] = m;
  if (h === undefined) return { d: instanteNoFuso(`${a}-${me}-${di}`, "00:00", FUSO), diaInteiro: true };
  if (z) return { d: new Date(Date.UTC(+a, +me - 1, +di, +h, +mi)), diaInteiro: false };
  return { d: instanteNoFuso(`${a}-${me}-${di}`, `${h}:${mi}`, fusoValido(params.TZID)), diaInteiro: false };
}

/** "PT30M", "PT1H", "P1D" em milissegundos. */
function duracao(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, , w, d, h, mi, s] = m;
  return ((+(w ?? 0) * 7 + +(d ?? 0)) * 86400 + +(h ?? 0) * 3600 + +(mi ?? 0) * 60 + +(s ?? 0)) * 1000;
}

const DIAS_RRULE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Evento = {
  inicio: Date;
  fim: Date;
  rrule?: Record<string, string>;
  exdates: Set<number>;
  status?: string;
  transp?: string;
  /** RECURRENCE-ID: ocorrência alterada de uma série (vale como evento solto). */
  recorrencia?: boolean;
};

/**
 * Expande uma repetição diária ou semanal dentro de [de, ate]. Anda pelo
 * relógio de parede do fuso do evento? Não: anda em passos de 24 h a partir do
 * instante inicial, o que basta para São Paulo (sem horário de verão) e erra no
 * máximo uma hora em fuso que troca, num evento que já é de outra empresa.
 */
function expandir(e: Evento, de: Date, ate: Date): Intervalo[] {
  const dur = e.fim.getTime() - e.inicio.getTime();
  if (!e.rrule) return [{ inicio: e.inicio, fim: e.fim }];
  const freq = e.rrule.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY") return [{ inicio: e.inicio, fim: e.fim }];
  const intervalo = Math.max(1, Number(e.rrule.INTERVAL ?? 1));
  const ateRegra = e.rrule.UNTIL ? data(e.rrule.UNTIL, {})?.d : undefined;
  const maximo = e.rrule.COUNT ? Number(e.rrule.COUNT) : Infinity;
  const porDia = e.rrule.BYDAY ? e.rrule.BYDAY.split(",").map((x) => DIAS_RRULE.indexOf(x.replace(/^[+-]?\d+/, ""))) : null;
  const out: Intervalo[] = [];
  const DIA = 86400000;
  const base = e.inicio.getTime();
  // Dia da semana no fuso de São Paulo (deslocamento de três horas basta para o dia).
  const diaSemana = (t: number) => new Date(t - 3 * 3600000).getUTCDay();
  const semanaDe = (t: number) => Math.floor((t - 3 * 3600000 - diaSemana(t) * DIA) / (7 * DIA));
  let contados = 0;
  for (let i = 0; i < 3660; i++) {
    const t = base + i * DIA;
    if (ateRegra && t > ateRegra.getTime()) break;
    if (t > ate.getTime()) break;
    let vale: boolean;
    if (freq === "DAILY") vale = i % intervalo === 0;
    else {
      const dias = porDia ?? [diaSemana(base)];
      vale = dias.includes(diaSemana(t)) && (semanaDe(t) - semanaDe(base)) % intervalo === 0;
    }
    if (!vale) continue;
    contados++;
    if (contados > maximo) break;
    if (e.exdates.has(t)) continue;
    if (t + dur > de.getTime()) out.push({ inicio: new Date(t), fim: new Date(t + dur) });
  }
  return out;
}

/** O ocupado de um texto iCalendar entre `de` e `ate`. */
export function ocupadoDoIcs(ics: string, de: Date, ate: Date): Intervalo[] {
  const out: Intervalo[] = [];
  let atual: (Partial<Evento> & { exdates: Set<number>; durMs?: number }) | null = null;
  let dentroDeFreeBusy = false;

  for (const l of linhas(ics)) {
    if (l.nome === "BEGIN" && l.valor === "VEVENT") {
      atual = { exdates: new Set() };
      continue;
    }
    if (l.nome === "BEGIN" && l.valor === "VFREEBUSY") {
      dentroDeFreeBusy = true;
      continue;
    }
    if (l.nome === "END" && l.valor === "VFREEBUSY") {
      dentroDeFreeBusy = false;
      continue;
    }
    if (dentroDeFreeBusy && l.nome === "FREEBUSY") {
      if ((l.params.FBTYPE ?? "BUSY").toUpperCase() === "FREE") continue;
      for (const per of l.valor.split(",")) {
        const [a, b] = per.split("/");
        const i = data(a, {})?.d;
        if (!i || !b) continue;
        const f = b.startsWith("P") ? new Date(i.getTime() + duracao(b)) : data(b, {})?.d;
        if (f) out.push({ inicio: i, fim: f });
      }
      continue;
    }
    if (!atual) continue;
    if (l.nome === "END" && l.valor === "VEVENT") {
      const e = atual;
      atual = null;
      if (!e.inicio) continue;
      if ((e.status ?? "").toUpperCase() === "CANCELLED") continue;
      if ((e.transp ?? "").toUpperCase() === "TRANSPARENT") continue;
      const fim = e.fim ?? new Date(e.inicio.getTime() + (e.durMs ?? 0));
      if (fim.getTime() <= e.inicio.getTime()) continue;
      out.push(...expandir({ ...(e as Evento), fim }, de, ate));
      continue;
    }
    switch (l.nome) {
      case "DTSTART": {
        const x = data(l.valor, l.params);
        if (x) {
          atual.inicio = x.d;
          if (x.diaInteiro && !atual.fim) atual.durMs = 86400000;
        }
        break;
      }
      case "DTEND": {
        const x = data(l.valor, l.params);
        if (x) atual.fim = x.d;
        break;
      }
      case "DURATION":
        atual.durMs = duracao(l.valor);
        break;
      case "RRULE":
        atual.rrule = Object.fromEntries(l.valor.split(";").map((p) => p.split("=") as [string, string]));
        break;
      case "EXDATE":
        for (const v of l.valor.split(",")) {
          const x = data(v, l.params);
          if (x) atual.exdates.add(x.d.getTime());
        }
        break;
      case "STATUS":
        atual.status = l.valor;
        break;
      case "TRANSP":
        atual.transp = l.valor;
        break;
      case "RECURRENCE-ID":
        atual.recorrencia = true;
        break;
    }
  }
  return out.filter((x) => x.fim > de && x.inicio < ate);
}

const cache = new Map<string, { quando: number; ics: string }>();

/**
 * Lê o endereço (cache de 5 minutos por instância: o calendário da página
 * pede os horários a cada troca de pessoa, e a agenda do Outlook não muda
 * nesse ritmo). `webcal://` vira `https://`.
 */
export async function ocupadoDoEndereco(endereco: string, de: Date, ate: Date): Promise<Intervalo[]> {
  const url = endereco.trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\//i.test(url)) throw new Error("O endereço iCal precisa ser https.");
  const guardado = cache.get(url);
  let ics: string;
  if (guardado && Date.now() - guardado.quando < 300_000) ics = guardado.ics;
  else {
    const r = await fetch(url, { headers: { "User-Agent": "Demandou-Agenda/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`O endereço iCal respondeu ${r.status}.`);
    ics = await r.text();
    if (!ics.includes("BEGIN:VCALENDAR")) throw new Error("O endereço não devolveu um calendário iCal.");
    cache.set(url, { quando: Date.now(), ics });
  }
  return ocupadoDoIcs(ics, de, ate);
}
