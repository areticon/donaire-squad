"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Save, Trash2, RefreshCw, Link2, AlertTriangle } from "lucide-react";
import { NOMES_DOS_DIAS, JANELAS_PADRAO, janelasDoTexto, textoDoDia, type Janela } from "@/lib/agenda/janelas";
import { FAIXAS_FATURAMENTO, TAMANHOS_TIME } from "@/lib/calculadora/formulario";
import { dataEmSP, horaEmSP, rotuloDoDia } from "@/lib/agenda/tempo";

/**
 * A AGENDA DO TIME NO ADMIN (01/10). Cliente só para editar: tudo desce pronto
 * do servidor (app/(app)/admin/agenda/page.tsx) e cada ação chama
 * /api/admin/agenda e recarrega a página.
 */

export type PessoaNoAdmin = {
  id: string;
  nome: string;
  emailUsuario: string | null;
  emailAgenda: string | null;
  ativo: boolean;
  fonte: "manual" | "google";
  janelas: Janela[];
  antecedenciaMin: number;
  intervaloMin: number;
  linkSala: string | null;
  /** WhatsApp da pessoa, já na tela (+55 11 98765-4321), para a régua de alertas. */
  whatsapp: string | null;
  temIcal: boolean;
  observacao: string | null;
  ordem: number;
  contas: Array<{ id: string; emailGoogle: string; agendas: string[]; principal: boolean; ultimoErro: string | null; ultimoErroEm: string | null }>;
};

export type ReuniaoNoAdmin = {
  id: string;
  inicio: string;
  status: string;
  escolha: string;
  fonte: string;
  teste: boolean;
  linkReuniao: string | null;
  pessoa: string;
  criadaEm: string;
  comecouEm: string | null;
  leadEntrouEm: string | null;
  /** Os alertas da régua já registrados na sequência atual da reunião. */
  alertas: Array<{ tipo: string; situacao: string; em: string; email: number; whatsapp: number; whatsappSimulado: number; falhas: number }>;
  lead: {
    email: string; nome: string | null; empresa: string | null; telefone: string | null; cargo: string | null;
    setor: string | null; faturamento: string | null; tamanhoTime: string | null; origem: string | null; cta: string | null;
  };
  calculadora: null | {
    plano: string; mensal: number; volume: string; cenarios: Array<{ nome: string; mensal: number }>; economiaTime: number; economiaPct: number;
  };
};

const FAIXA = Object.fromEntries(FAIXAS_FATURAMENTO.map(([v, t]) => [v, t])) as Record<string, string>;
const TIME = Object.fromEntries(TAMANHOS_TIME.map(([v, t]) => [v, t])) as Record<string, string>;
/** O nome de cada alerta da régua (lib/agenda/regua.ts) no cartão da reunião. */
const NOME_DO_ALERTA: Record<string, string> = {
  marcada: "confirmação", remarcada: "remarcação", cancelada: "cancelamento", h24: "véspera", h1: "1 hora",
  m5: "5 min", inicio: "início", atraso: "atraso", depois_lead: "obrigado", depois_time: "resultado",
};
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const campo = "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-orange-500";
const cartao = "rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4";

async function acao(corpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/agenda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Falhou.");
  return d;
}

export function AgendaDoTime({ pessoas, reunioes, google, aviso, whatsappLigado = false }: {
  pessoas: PessoaNoAdmin[];
  reunioes: ReuniaoNoAdmin[];
  google: { configurado: boolean; uriDeRetorno: string };
  aviso: string | null;
  whatsappLigado?: boolean;
}) {
  const [aba, setAba] = useState<"proximas" | "passadas">("proximas");
  const agora = Date.now();
  const proximas = reunioes.filter((r) => r.status === "marcada" && new Date(r.inicio).getTime() > agora - 3600000);
  const passadas = reunioes.filter((r) => !proximas.includes(r)).reverse();

  return (
    <div className="space-y-10">
      {aviso && (
        <p className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-[var(--text-primary)]">{aviso}</p>
      )}

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mr-3 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-orange-400" /> Reuniões
          </h2>
          {(["proximas", "passadas"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className={`rounded-full border px-3 py-1 text-sm ${aba === a ? "border-orange-500 bg-orange-500/15 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)]"}`}
            >
              {a === "proximas" ? `Marcadas (${proximas.length})` : `Passadas e canceladas (${passadas.length})`}
            </button>
          ))}
        </div>
        {(aba === "proximas" ? proximas : passadas).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{aba === "proximas" ? "Nenhuma demonstração marcada." : "Nada nos últimos 14 dias."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(aba === "proximas" ? proximas : passadas).map((r) => <CartaoReuniao key={r.id} r={r} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Quem atende e quando</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Horários de 30 minutos nos próximos 10 dias úteis (sem feriados), dentro das janelas, menos a antecedência,
          o que já está marcado e o ocupado das agendas ligadas. Fonte <strong>manual</strong>: só as janelas e o banco.
          Fonte <strong>google</strong>: as janelas menos o ocupado de todas as agendas das contas conectadas.
          Em qualquer fonte, quem tem conta Google conectada recebe a reunião como evento com Meet na conta principal;
          a sala fixa só entra quando o Meet não vem.
        </p>
        <CaixaGoogle google={google} />
        <p className={`${cartao} text-sm mt-3`}>
          <span className="font-semibold text-[var(--text-primary)]">Alertas por WhatsApp: </span>
          {whatsappLigado ? (
            <span className="text-green-400">ligados</span>
          ) : (
            <span className="text-[var(--text-muted)]">
              desligados neste ambiente (faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID). Até lá, a régua inteira sai só por e-mail.
            </span>
          )}
        </p>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
          {pessoas.map((p) => <EditorDePessoa key={p.id} p={p} googleConfigurado={google.configurado} />)}
          <NovaPessoa ordem={pessoas.length} />
        </div>
      </section>
    </div>
  );
}

function CartaoReuniao({ r }: { r: ReuniaoNoAdmin }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const inicio = new Date(r.inicio);
  const passou = inicio.getTime() < Date.now();
  const zap = (r.lead.telefone ?? "").replace(/\D/g, "");
  async function fazer(corpo: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    try {
      await acao(corpo);
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  // "Começou" vale de 10 minutos antes até o fim: segura o aviso de atraso.
  const t = Date.now();
  const podeComecar = r.status === "marcada" && !r.comecouEm && t > inicio.getTime() - 10 * 60_000 && t < inicio.getTime() + 30 * 60_000;
  const corStatus = r.status === "marcada" ? "text-green-400" : r.status === "cancelada" ? "text-red-400" : "text-[var(--text-muted)]";
  return (
    <div className={cartao} data-reuniao={r.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-[var(--text-primary)]">
          {rotuloDoDia(dataEmSP(inicio))}, {horaEmSP(inicio)}
          <span className="font-normal text-[var(--text-muted)]"> com {r.pessoa}</span>
        </p>
        <span className={`text-xs font-semibold uppercase ${corStatus}`}>
          {r.status}{r.teste ? " (teste)" : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {r.escolha === "pessoa" ? "O lead escolheu a pessoa" : "Rodízio"} · fonte {r.fonte} · marcada em {new Date(r.criadaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
      </p>
      {r.alertas.length > 0 && (
        <p className="mt-1 text-xs text-[var(--text-muted)]" title="Régua de alertas: e-mail e WhatsApp já registrados nesta reunião">
          Alertas: {r.alertas.map((a) => `${NOME_DO_ALERTA[a.tipo] ?? a.tipo}${a.situacao === "pulado" ? " (pulado)" : a.whatsapp ? " (e-mail e WhatsApp)" : a.whatsappSimulado ? " (e-mail; WhatsApp desligado)" : ""}${a.falhas ? ` (${a.falhas} falha${a.falhas > 1 ? "s" : ""})` : ""}`).join(" · ")}
        </p>
      )}
      {(r.comecouEm || r.leadEntrouEm) && (
        <p className="mt-1 text-xs text-green-400">
          {r.comecouEm ? `Começou às ${horaEmSP(new Date(r.comecouEm))}` : ""}
          {r.comecouEm && r.leadEntrouEm ? " · " : ""}
          {r.leadEntrouEm ? `lead abriu a sala às ${horaEmSP(new Date(r.leadEntrouEm))}` : ""}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-[var(--text-muted)]">E-mail</dt><dd className="text-[var(--text-primary)] break-all">{r.lead.email}</dd>
        {r.lead.nome && (<><dt className="text-[var(--text-muted)]">Nome</dt><dd className="text-[var(--text-primary)]">{r.lead.nome}</dd></>)}
        {r.lead.empresa && (<><dt className="text-[var(--text-muted)]">Empresa</dt><dd className="text-[var(--text-primary)]">{r.lead.empresa}</dd></>)}
        <dt className="text-[var(--text-muted)]">WhatsApp</dt>
        <dd>{zap ? <a className="text-orange-400 hover:text-orange-300" href={`https://wa.me/${zap.startsWith("55") ? zap : `55${zap}`}`} target="_blank" rel="noopener noreferrer">{r.lead.telefone}</a> : "não informado"}</dd>
        <dt className="text-[var(--text-muted)]">Cargo</dt><dd className="text-[var(--text-primary)]">{r.lead.cargo ?? "não informado"}</dd>
        <dt className="text-[var(--text-muted)]">Setor</dt><dd className="text-[var(--text-primary)]">{r.lead.setor ?? "não informado"}</dd>
        <dt className="text-[var(--text-muted)]">Faturamento</dt><dd className="text-[var(--text-primary)]">{(r.lead.faturamento && FAIXA[r.lead.faturamento]) ?? "não informado"}</dd>
        <dt className="text-[var(--text-muted)]">Time</dt><dd className="text-[var(--text-primary)]">{(r.lead.tamanhoTime && TIME[r.lead.tamanhoTime]) ?? "não informado"}</dd>
        <dt className="text-[var(--text-muted)]">Veio de</dt><dd className="text-[var(--text-primary)]">{[r.lead.cta, r.lead.origem].filter(Boolean).join(", ") || "direto"}</dd>
      </dl>
      {r.calculadora && (
        <div className="mt-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">Calculadora</p>
          <p className="text-[var(--text-muted)]">{r.calculadora.volume}</p>
          <p className="text-[var(--text-muted)]">
            {r.calculadora.cenarios.map((c) => `${c.nome}: ${reais(c.mensal)}`).join(" · ")}
          </p>
          <p className="text-[var(--text-primary)]">
            Demandou {r.calculadora.plano}: {reais(r.calculadora.mensal)} por mês ·{" "}
            <span className="text-green-400">{reais(r.calculadora.economiaTime)} a menos que o time próprio ({r.calculadora.economiaPct}%)</span>
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.linkReuniao && (
          <a href={r.linkReuniao} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] inline-flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5" /> Sala
          </a>
        )}
        {podeComecar && (
          <button type="button" disabled={ocupado} onClick={() => fazer({ acao: "comecou", id: r.id })}
            className="rounded-lg border border-green-500/50 px-3 py-1.5 text-xs text-green-400 disabled:opacity-50">
            Começou
          </button>
        )}
        {r.status === "marcada" && !passou && (
          <button type="button" disabled={ocupado} onClick={() => fazer({ acao: "cancelarReuniao", id: r.id }, "Cancelar e avisar o lead por e-mail?")}
            className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-400 disabled:opacity-50">
            Cancelar e avisar o lead
          </button>
        )}
        {passou && r.status !== "cancelada" && (
          <>
            <button type="button" disabled={ocupado} onClick={() => fazer({ acao: "statusReuniao", id: r.id, status: "realizada" })}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] disabled:opacity-50">Aconteceu</button>
            <button type="button" disabled={ocupado} onClick={() => fazer({ acao: "statusReuniao", id: r.id, status: "faltou" })}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-primary)] disabled:opacity-50">Lead faltou</button>
          </>
        )}
      </div>
    </div>
  );
}

function CaixaGoogle({ google }: { google: { configurado: boolean; uriDeRetorno: string } }) {
  return (
    <div className={`${cartao} text-sm`}>
      <p className="font-semibold text-[var(--text-primary)]">
        Fonte Google: {google.configurado ? <span className="text-green-400">pronta para conectar</span> : <span className="text-[var(--text-muted)]">desligada neste ambiente</span>}
      </p>
      {!google.configurado && (
        <p className="text-[var(--text-muted)] mt-1">
          Liga quando existirem GOOGLE_AGENDA_CLIENT_ID e GOOGLE_AGENDA_CLIENT_SECRET (cliente OAuth do Google Cloud com a
          URI de retorno <code className="break-all">{google.uriDeRetorno}</code>). Até lá, todos atendem pela fonte manual.
        </p>
      )}
    </div>
  );
}

function NovaPessoa({ ordem }: { ordem: number }) {
  const [abrir, setAbrir] = useState(false);
  if (!abrir) {
    return (
      <button type="button" onClick={() => setAbrir(true)} className={`${cartao} border-dashed flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] min-h-24`}>
        <Plus className="w-4 h-4" /> Adicionar pessoa do time (vendedor)
      </button>
    );
  }
  return (
    <EditorDePessoa
      googleConfigurado={false}
      p={{
        id: "", nome: "", emailUsuario: null, emailAgenda: null, ativo: true, fonte: "manual", janelas: JANELAS_PADRAO,
        antecedenciaMin: 180, intervaloMin: 15, linkSala: null, whatsapp: null, temIcal: false, observacao: null, ordem, contas: [],
      }}
    />
  );
}

function EditorDePessoa({ p, googleConfigurado }: { p: PessoaNoAdmin; googleConfigurado: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({
    nome: p.nome,
    emailUsuario: p.emailUsuario ?? "",
    emailAgenda: p.emailAgenda ?? "",
    ativo: p.ativo,
    fonte: p.fonte,
    antecedenciaH: String(p.antecedenciaMin / 60),
    intervaloMin: String(p.intervaloMin),
    linkSala: p.linkSala ?? "",
    whatsapp: p.whatsapp ?? "",
    observacao: p.observacao ?? "",
    ordem: String(p.ordem),
  });
  const [dias, setDias] = useState<string[]>(() => [0, 1, 2, 3, 4, 5, 6].map((d) => textoDoDia(p.janelas, d)));
  const [ical, setIcal] = useState<string | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const janelas = useMemo(() => dias.flatMap((t, d) => janelasDoTexto(t, d)), [dias]);

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    try {
      await acao({
        acao: "salvarPessoa", id: p.id || undefined, ...f,
        antecedenciaMin: Math.round(Number(f.antecedenciaH.replace(",", ".")) * 60),
        intervaloMin: Number(f.intervaloMin), ordem: Number(f.ordem), janelas,
        ...(ical !== undefined ? { ical } : {}),
      });
      setMsg("Salvo.");
      setIcal(undefined);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function testarIcal() {
    setMsg(null);
    try {
      const d = await acao({ acao: "testarIcal", pessoaId: p.id });
      setMsg(`iCal lido: ${d.blocos} blocos ocupados nos próximos 10 dias úteis.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const rotulo = "block text-xs text-[var(--text-muted)]";
  return (
    <div className={cartao} data-pessoa={p.id || "nova"}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="font-semibold text-[var(--text-primary)]">{p.id ? p.nome : "Nova pessoa"}</p>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} className="accent-orange-500" />
          Atendendo
        </label>
      </div>
      {p.observacao && (
        <p className="mb-3 text-xs rounded-md bg-orange-500/10 border border-orange-500/30 px-2 py-1.5 text-[var(--text-primary)] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-orange-400 shrink-0" /> {p.observacao}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={rotulo}>Nome<input className={`${campo} mt-1`} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label className={rotulo}>Fonte
          <select className={`${campo} mt-1`} value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value as "manual" | "google" })}>
            <option value="manual">Manual (janelas e banco)</option>
            <option value="google">Google (janelas menos o ocupado)</option>
          </select>
        </label>
        <label className={rotulo}>E-mail de login na Demandou<input className={`${campo} mt-1`} value={f.emailUsuario} onChange={(e) => setF({ ...f, emailUsuario: e.target.value })} /></label>
        <label className={rotulo}>E-mail que recebe o convite<input className={`${campo} mt-1`} placeholder="vazio = lista da demonstração" value={f.emailAgenda} onChange={(e) => setF({ ...f, emailAgenda: e.target.value })} /></label>
        <label className={rotulo}>Antecedência mínima (horas)<input className={`${campo} mt-1`} inputMode="decimal" value={f.antecedenciaH} onChange={(e) => setF({ ...f, antecedenciaH: e.target.value })} /></label>
        <label className={rotulo}>Intervalo entre reuniões (min)<input className={`${campo} mt-1`} inputMode="numeric" value={f.intervaloMin} onChange={(e) => setF({ ...f, intervaloMin: e.target.value })} /></label>
        <label className={rotulo}>WhatsApp para os alertas<input className={`${campo} mt-1`} inputMode="tel" placeholder="(11) 98765-4321; vazio = só e-mail" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></label>
        <label className={rotulo}>
          {/*
            Com conta Google conectada, o evento nasce com Meet e a reunião usa o
            link do Meet (lib/agenda/reunioes.ts, sincronizarGoogle): a sala fixa
            vira reserva. Sem conta, ela é o único link que a reunião tem.
          */}
          {p.contas.length
            ? "Sala fixa (opcional: só usada se a agenda Google estiver desligada ou o Meet falhar)"
            : "Sala fixa de videochamada (sem conta Google, é o único link da reunião)"}
          <input className={`${campo} mt-1`} placeholder="https://meet.google.com/..." value={f.linkSala} onChange={(e) => setF({ ...f, linkSala: e.target.value })} />
        </label>
      </div>

      <p className="mt-4 mb-1 text-xs font-semibold text-[var(--text-primary)]">Janelas (horário de Brasília, ex.: 09:00-12:00, 14:00-18:00)</p>
      <div className="grid gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs text-[var(--text-muted)]">
            {NOMES_DOS_DIAS[d]}
            <input className={campo} value={dias[d]} placeholder="sem atendimento" onChange={(e) => setDias(dias.map((x, i) => (i === d ? e.target.value : x)))} />
          </label>
        ))}
      </div>

      <p className="mt-4 mb-1 text-xs font-semibold text-[var(--text-primary)]">Agenda que não é Google (endereço iCal de livre/ocupado)</p>
      <div className="flex gap-2">
        <input className={campo} value={ical ?? ""} placeholder={p.temIcal ? "configurado (cole outro para trocar)" : "https://outlook.office365.com/owa/calendar/.../calendar.ics"} onChange={(e) => setIcal(e.target.value)} />
        {p.temIcal && (
          <>
            <button type="button" onClick={testarIcal} className="rounded-lg border border-[var(--border)] px-2 text-xs text-[var(--text-primary)]" title="Ler agora">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setIcal("")} className="rounded-lg border border-[var(--border)] px-2 text-xs text-red-400" title="Remover ao salvar">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      <label className={`${rotulo} mt-3`}>Observação<input className={`${campo} mt-1`} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></label>

      {p.id && <ContasGoogle p={p} googleConfigurado={googleConfigurado} />}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={salvar} disabled={ocupado} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Save className="w-4 h-4" /> {ocupado ? "Salvando..." : "Salvar"}
        </button>
        {msg && <span className="text-xs text-[var(--text-muted)]">{msg}</span>}
      </div>
    </div>
  );
}

function ContasGoogle({ p, googleConfigurado }: { p: PessoaNoAdmin; googleConfigurado: boolean }) {
  const router = useRouter();
  const [listas, setListas] = useState<Record<string, string>>(() => Object.fromEntries(p.contas.map((c) => [c.id, c.agendas.join("\n")])));
  const [disponiveis, setDisponiveis] = useState<Record<string, Array<{ id: string; nome: string; acesso: string }>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function fazer(corpo: Record<string, unknown>) {
    setMsg(null);
    try {
      const d = await acao(corpo);
      if (corpo.acao === "listarAgendas") setDisponiveis((x) => ({ ...x, [String(corpo.contaId)]: d.agendas }));
      else router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-[var(--border)]">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">Contas Google (todas entram no ocupado; o evento nasce na principal)</p>
      {p.contas.map((c) => (
        <div key={c.id} className="mb-3 rounded-lg border border-[var(--border)] p-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--text-primary)] font-semibold">{c.emailGoogle}{c.principal ? " (principal)" : ""}</span>
            <span className="flex gap-2">
              {!c.principal && <button type="button" className="text-orange-400" onClick={() => fazer({ acao: "salvarConta", contaId: c.id, agendas: listas[c.id].split(/\s+/), principal: true })}>Tornar principal</button>}
              <button type="button" className="text-orange-400" onClick={() => fazer({ acao: "listarAgendas", contaId: c.id })}>Ver agendas</button>
              <button type="button" className="text-red-400" onClick={() => window.confirm("Desconectar esta conta?") && fazer({ acao: "removerConta", contaId: c.id })}>Desconectar</button>
            </span>
          </div>
          {c.ultimoErro && <p className="mt-1 text-red-400">Erro: {c.ultimoErro}</p>}
          <label className="block mt-2 text-[var(--text-muted)]">
            Agendas consultadas no livre/ocupado (uma por linha; "primary" é a da própria conta)
            <textarea className={`${campo} mt-1 font-mono text-xs`} rows={3} value={listas[c.id] ?? ""} onChange={(e) => setListas({ ...listas, [c.id]: e.target.value })} />
          </label>
          {disponiveis[c.id] && (
            <p className="mt-1 text-[var(--text-muted)]">
              Visíveis: {disponiveis[c.id].map((a) => (
                <button key={a.id} type="button" className="underline mr-2" onClick={() => setListas({ ...listas, [c.id]: [...new Set([...(listas[c.id] ?? "").split(/\s+/).filter(Boolean), a.id])].join("\n") })}>
                  {a.nome} ({a.acesso === "freeBusyReader" ? "só livre/ocupado" : a.acesso})
                </button>
              ))}
            </p>
          )}
          <button type="button" className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[var(--text-primary)]" onClick={() => fazer({ acao: "salvarConta", contaId: c.id, agendas: (listas[c.id] ?? "").split(/\s+/) })}>
            Salvar agendas
          </button>
        </div>
      ))}
      {googleConfigurado ? (
        <a href={`/api/admin/agenda/google/conectar?pessoa=${p.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/50 px-3 py-1.5 text-xs font-semibold text-orange-400">
          <Plus className="w-3.5 h-3.5" /> Conectar conta Google
        </a>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">Conectar conta Google fica disponível quando a fonte Google for ligada.</p>
      )}
      {msg && <p className="mt-2 text-xs text-red-400">{msg}</p>}
    </div>
  );
}
