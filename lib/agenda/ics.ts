/**
 * O CONVITE DE CALENDÁRIO (iCalendar, RFC 5545) que vai no e-mail.
 *
 * METHOD:REQUEST e não um .ics solto: o Outlook novo não abre .ics anexado
 * (lição registrada na memória do Bruno), mas reconhece a parte
 * text/calendar com METHOD:REQUEST como convite e mostra os botões de aceitar.
 * O Gmail faz o mesmo. CANCEL com o mesmo UID e SEQUENCE maior tira o evento
 * da agenda de quem já tinha aceitado; REQUEST com SEQUENCE maior o move.
 */

export type Convite = {
  metodo: "REQUEST" | "CANCEL";
  uid: string;
  sequencia: number;
  inicio: Date;
  fim: Date;
  titulo: string;
  descricao: string;
  local?: string | null;
  url?: string | null;
  organizador: { nome: string; email: string };
  convidados: Array<{ nome: string; email: string }>;
};

/** 20261005T123000Z */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Texto de propriedade: barra, ponto e vírgula, vírgula e quebra escapados. */
function texto(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Parâmetro CN entre aspas, sem aspas dentro. */
function cn(s: string): string {
  return `"${s.replace(/"/g, "'")}"`;
}

/**
 * Dobra a linha em 75 octetos (a regra conta BYTES, não caracteres: "ç" vale
 * dois), sem partir um caractere no meio.
 */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch, "utf8");
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export function montarConvite(c: Convite): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Demandou//Agenda de demonstracao//PT-BR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${c.metodo}`,
    "BEGIN:VEVENT",
    `UID:${c.uid}`,
    `SEQUENCE:${c.sequencia}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(c.inicio)}`,
    `DTEND:${utc(c.fim)}`,
    `SUMMARY:${texto(c.titulo)}`,
    `DESCRIPTION:${texto(c.descricao)}`,
    ...(c.local ? [`LOCATION:${texto(c.local)}`] : []),
    ...(c.url ? [`URL:${c.url}`] : []),
    `ORGANIZER;CN=${cn(c.organizador.nome)}:mailto:${c.organizador.email}`,
    ...c.convidados.map(
      (p) => `ATTENDEE;CN=${cn(p.nome)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${p.email}`
    ),
    `STATUS:${c.metodo === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    ...(c.metodo === "REQUEST"
      ? ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Demonstração da Demandou", "TRIGGER:-PT15M", "END:VALARM"]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
