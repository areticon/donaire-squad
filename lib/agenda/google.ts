import { cifrar, decifrar } from "@/lib/agenda/segredos";
import type { Intervalo } from "@/lib/agenda/ical-ocupado";

/**
 * A AGENDA DO GOOGLE como fonte de disponibilidade (01/10). PRONTA E
 * DESLIGADA: liga quando existirem GOOGLE_AGENDA_CLIENT_ID e
 * GOOGLE_AGENDA_CLIENT_SECRET (o Bruno ainda vai assinar o Google Workspace).
 *
 * CLIENTE OAUTH PRÓPRIO, separado do login e do YouTube, pelo mesmo motivo de
 * lib/oauth/youtube.ts: escopo de agenda é sensível, e misturar faria a tela
 * de login pedir permissão de calendário a quem só quer entrar.
 *
 * ESCOPOS, o mínimo para o trabalho:
 *  - calendar.freebusy: ler SÓ livre e ocupado (nunca título nem convidados);
 *  - calendar.events: criar, mover e cancelar o evento da demonstração, com
 *    Meet e convite ao lead;
 *  - calendar.calendarlist.readonly: listar as agendas da conta, para o admin
 *    escolher quais entram no ocupado (inclusive as de outras empresas
 *    compartilhadas só como livre/ocupado);
 *  - openid e email: saber QUAL conta foi conectada.
 *
 * O TOKEN DE RENOVAÇÃO é guardado cifrado (lib/agenda/segredos.ts). O token
 * de acesso vive uma hora e fica só em memória.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export const ESCOPOS_DA_AGENDA = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export function googleAgendaConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_AGENDA_CLIENT_ID && process.env.GOOGLE_AGENDA_CLIENT_SECRET);
}

export function uriDeRetorno(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  return `${base}/api/admin/agenda/google/callback`;
}

/**
 * prompt=consent e access_type=offline: o Google só entrega o token de
 * renovação na autorização com consentimento, e sem ele a conexão morre em
 * uma hora (mesma lição do YouTube). `login_hint` sugere a conta certa.
 */
export function urlDeAutorizacao(estado: string, dica?: string | null): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_AGENDA_CLIENT_ID!,
    redirect_uri: uriDeRetorno(),
    response_type: "code",
    scope: ESCOPOS_DA_AGENDA.join(" "),
    state: estado,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    ...(dica ? { login_hint: dica } : {}),
  });
  return `${AUTH_URL}?${p.toString()}`;
}

function emailDoIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const corpo = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return corpo.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Troca o código pelo token de renovação (já cifrado) e descobre o e-mail da conta. */
export async function trocarCodigo(codigo: string): Promise<{ email: string; refreshTokenCifrado: string; escopos: string }> {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_AGENDA_CLIENT_ID!,
      client_secret: process.env.GOOGLE_AGENDA_CLIENT_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: uriDeRetorno(),
      code: codigo,
    }),
  });
  const d = (await r.json()) as { refresh_token?: string; id_token?: string; scope?: string; error?: string; access_token?: string; expires_in?: number };
  if (!r.ok) throw new Error(`O Google recusou a troca do código (${d.error ?? r.status}).`);
  if (!d.refresh_token) throw new Error("O Google não devolveu o token de renovação. Remova o acesso da Demandou na conta Google e conecte de novo.");
  const email = emailDoIdToken(d.id_token);
  if (!email) throw new Error("Não consegui saber qual conta Google foi conectada.");
  const faltam = ["calendar.freebusy", "calendar.events"].filter((e) => !(d.scope ?? "").includes(e));
  if (faltam.length) throw new Error(`A autorização veio sem ${faltam.join(" e ")}. Conecte de novo e marque todas as permissões.`);
  const refreshTokenCifrado = cifrar(d.refresh_token);
  if (d.access_token) acessos.set(refreshTokenCifrado, { token: d.access_token, ate: Date.now() + ((d.expires_in ?? 3600) - 120) * 1000 });
  return { email, refreshTokenCifrado, escopos: d.scope ?? "" };
}

const acessos = new Map<string, { token: string; ate: number }>();

async function tokenDeAcesso(refreshTokenCifrado: string): Promise<string> {
  const guardado = acessos.get(refreshTokenCifrado);
  if (guardado && guardado.ate > Date.now()) return guardado.token;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_AGENDA_CLIENT_ID!,
      client_secret: process.env.GOOGLE_AGENDA_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: decifrar(refreshTokenCifrado),
    }),
  });
  const d = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !d.access_token) {
    // invalid_grant = a pessoa revogou o acesso ou trocou a senha: precisa conectar de novo.
    throw new Error(d.error === "invalid_grant" ? "A conta Google revogou o acesso: conecte de novo no /admin/agenda." : `Renovação do token falhou (${d.error ?? r.status}).`);
  }
  acessos.set(refreshTokenCifrado, { token: d.access_token, ate: Date.now() + ((d.expires_in ?? 3600) - 120) * 1000 });
  return d.access_token;
}

async function chamar<T>(refreshTokenCifrado: string, caminho: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenDeAcesso(refreshTokenCifrado);
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (r.status === 204) return undefined as T;
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google Agenda ${r.status}: ${d.error?.message ?? "sem detalhe"}`);
  return d;
}

/**
 * O OCUPADO DE UMA LISTA DE AGENDAS numa chamada só (freeBusy). Agenda que o
 * Google não deixa ler (não compartilhada) volta com erro por agenda: isso
 * LANÇA, porque contar como livre uma agenda que não foi lida é marcar por
 * cima do compromisso do Matheus na outra empresa.
 */
export async function ocupadoNoGoogle(refreshTokenCifrado: string, agendas: string[], de: Date, ate: Date): Promise<Intervalo[]> {
  if (!agendas.length) return [];
  const d = await chamar<{ calendars: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }> }>(
    refreshTokenCifrado,
    "/freeBusy",
    { method: "POST", body: JSON.stringify({ timeMin: de.toISOString(), timeMax: ate.toISOString(), items: agendas.map((id) => ({ id })) }) }
  );
  const out: Intervalo[] = [];
  for (const [id, c] of Object.entries(d.calendars ?? {})) {
    if (c.errors?.length) throw new Error(`A agenda ${id} não pôde ser lida (${c.errors.map((e) => e.reason).join(", ")}). Confira o compartilhamento.`);
    for (const b of c.busy ?? []) out.push({ inicio: new Date(b.start), fim: new Date(b.end) });
  }
  return out;
}

/** As agendas que a conta enxerga, para o admin escolher. */
export async function listarAgendas(refreshTokenCifrado: string): Promise<Array<{ id: string; nome: string; acesso: string }>> {
  const d = await chamar<{ items?: Array<{ id: string; summary?: string; summaryOverride?: string; accessRole: string }> }>(
    refreshTokenCifrado,
    "/users/me/calendarList?maxResults=250&minAccessRole=freeBusyReader"
  );
  return (d.items ?? []).map((c) => ({ id: c.id, nome: c.summaryOverride ?? c.summary ?? c.id, acesso: c.accessRole }));
}

export type EventoGoogle = {
  id: string;
  iCalUID: string;
  hangoutLink?: string;
  htmlLink?: string;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

/**
 * O LINK DO MEET DE UM EVENTO (01/10, régua de alertas). O Google entrega em
 * dois lugares: `hangoutLink` (o atalho de sempre) e a entrada "video" de
 * `conferenceData.entryPoints` (o formato novo, que vale também para sala
 * criada por outro serviço de conferência). Lê os dois.
 */
export function linkDoMeet(ev: EventoGoogle | null | undefined): string | null {
  if (!ev) return null;
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video" && e.uri);
  return video?.uri ?? null;
}

/**
 * A sala do Meet pode nascer "pendente": o Google cria o evento na hora e a
 * conferência um instante depois (createRequest.status = "pending"). Quem
 * precisa do link lê o evento de novo.
 */
export async function buscarEvento(refreshTokenCifrado: string, eventoId: string): Promise<EventoGoogle> {
  return chamar<EventoGoogle>(refreshTokenCifrado, `/calendars/primary/events/${encodeURIComponent(eventoId)}`);
}

/**
 * Cria o evento com Meet e convida o lead. `iCalUID` é o UID do nosso convite:
 * o Google manda o convite dele (sendUpdates=all) e o nosso e-mail leva o
 * mesmo UID, então a agenda do lead mostra UM evento, e não dois.
 */
export async function criarEvento(refreshTokenCifrado: string, e: {
  uid: string; inicio: Date; fim: Date; titulo: string; descricao: string; convidados: Array<{ email: string; nome?: string }>;
}): Promise<EventoGoogle> {
  return chamar<EventoGoogle>(refreshTokenCifrado, "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    body: JSON.stringify({
      iCalUID: e.uid,
      summary: e.titulo,
      description: e.descricao,
      start: { dateTime: e.inicio.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: e.fim.toISOString(), timeZone: "America/Sao_Paulo" },
      attendees: e.convidados.map((c) => ({ email: c.email, displayName: c.nome })),
      conferenceData: { createRequest: { requestId: e.uid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 60), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: true },
      guestsCanModify: false,
    }),
  });
}

export async function moverEvento(refreshTokenCifrado: string, eventoId: string, inicio: Date, fim: Date): Promise<EventoGoogle> {
  // conferenceDataVersion=1 para a resposta trazer a sala (e não perder o Meet no PATCH).
  return chamar<EventoGoogle>(refreshTokenCifrado, `/calendars/primary/events/${encodeURIComponent(eventoId)}?sendUpdates=all&conferenceDataVersion=1`, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
    }),
  });
}

export async function cancelarEvento(refreshTokenCifrado: string, eventoId: string): Promise<void> {
  await chamar<void>(refreshTokenCifrado, `/calendars/primary/events/${encodeURIComponent(eventoId)}?sendUpdates=all`, { method: "DELETE" });
}
