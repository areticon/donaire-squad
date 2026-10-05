"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Loader2, Users } from "lucide-react";
import { FUSO, horaEmSP, rotuloLongoDoDia } from "@/lib/agenda/tempo";

/**
 * O CALENDÁRIO DA DEMONSTRAÇÃO (01/10).
 *
 * Três toques no celular: dia, horário, confirmar. Os dias vêm numa faixa que
 * rola de lado (dez dias úteis não cabem em coluna de celular), os horários
 * numa grade de botões grandes o bastante para o dedo.
 *
 * "QUALQUER PESSOA DO TIME" É O PADRÃO e vem primeiro: mostra a união dos
 * horários de todos, e o servidor escolhe quem atende pelo rodízio. Escolher
 * a pessoa existe para quem já conversou com alguém do time.
 *
 * Os horários são sempre os de Brasília, escritos assim. Quem abre de outro
 * fuso recebe o aviso, em vez de o navegador converter em silêncio e a pessoa
 * aparecer uma hora antes.
 */

export type HorariosDaApi = {
  dias: Array<{ data: string; rotulo: string; horarios: Array<{ inicio: string; pessoas: string[] }> }>;
  pessoas: Array<{ id: string; nome: string }>;
};

export type ReuniaoMarcada = { id: string; inicio: string; pessoa: string; linkReuniao: string | null; gerenciar: string };

export function Calendario({
  enviarPara,
  corpoExtra = {},
  rotuloDoBotao = "Confirmar este horário",
  onMarcada,
  onSemLead,
  tokenDaReuniao = null,
  pessoaFixa = null,
}: {
  /** Rota que marca (ou remarca) a reunião. */
  enviarPara: string;
  corpoExtra?: Record<string, unknown>;
  rotuloDoBotao?: string;
  onMarcada: (r: ReuniaoMarcada) => void;
  onSemLead?: () => void;
  /** Na remarcação: o horário antigo não conta como ocupado para ela mesma. */
  tokenDaReuniao?: string | null;
  /**
   * O onboarding (05/10) é sempre com a mesma pessoa (o Bruno): o calendário
   * mostra só os horários dela e não oferece "com quem".
   */
  pessoaFixa?: string | null;
}) {
  const [pessoa, setPessoa] = useState(pessoaFixa ?? "qualquer");
  const [dados, setDados] = useState<HorariosDaApi | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horario, setHorario] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [outroFuso, setOutroFuso] = useState(false);

  useEffect(() => {
    try {
      setOutroFuso(Intl.DateTimeFormat().resolvedOptions().timeZone !== FUSO && new Date().getTimezoneOffset() !== 180);
    } catch {
      /* sem Intl completo: não avisa, e o rótulo já diz "horário de Brasília" */
    }
  }, []);

  const carregar = useCallback(async (quem: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const q = new URLSearchParams({ pessoa: quem, ...(tokenDaReuniao ? { r: tokenDaReuniao } : {}) });
      const r = await fetch(`/api/agenda/horarios?${q.toString()}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui carregar os horários.");
      setDados(d);
      // Mantém o dia escolhido se ele ainda tem horário; senão, o primeiro que tem.
      setDia((atual) => {
        const comHorario = (d as HorariosDaApi).dias.filter((x) => x.horarios.length);
        return comHorario.some((x) => x.data === atual) ? atual : comHorario[0]?.data ?? null;
      });
      setHorario(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [tokenDaReuniao]);

  useEffect(() => {
    void carregar(pessoa);
  }, [pessoa, carregar]);

  const doDia = useMemo(() => dados?.dias.find((d) => d.data === dia) ?? null, [dados, dia]);
  const nomeDaPessoa = pessoa === "qualquer" ? "qualquer pessoa do time" : dados?.pessoas.find((p) => p.id === pessoa)?.nome ?? "";

  async function confirmar() {
    if (!horario) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(enviarPara, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpoExtra, inicio: horario, pessoaId: pessoa }),
      });
      const d = await r.json();
      if (r.status === 401 && d.semLead) return onSemLead?.();
      if (!r.ok) {
        if (d.gerenciar) {
          window.location.href = d.gerenciar;
          return;
        }
        if (d.recarregar) void carregar(pessoa);
        throw new Error(d.error ?? "Não consegui marcar agora.");
      }
      onMarcada(d.reuniao);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const pessoas = dados?.pessoas ?? [];
  return (
    <div>
      {!pessoaFixa && pessoas.length > 1 && (
        <div className="mb-5">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-400" /> Com quem
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Com quem">
            {[{ id: "qualquer", nome: "Qualquer pessoa do time" }, ...pessoas].map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pessoa === p.id}
                onClick={() => setPessoa(p.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  pessoa === p.id
                    ? "border-orange-500 bg-orange-500/15 text-[var(--text-primary)] font-semibold"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-orange-400" /> Dia
      </p>
      {carregando && !dados ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Buscando os horários livres...
        </div>
      ) : (
        <>
          <div className="-mx-1 px-1 flex gap-2 overflow-x-auto pb-2 snap-x" role="listbox" aria-label="Dias">
            {(dados?.dias ?? []).map((d) => {
              const n = d.horarios.length;
              const ativo = d.data === dia;
              const [semana, ...resto] = d.rotulo.split(" ");
              return (
                <button
                  key={d.data}
                  type="button"
                  role="option"
                  aria-selected={ativo}
                  disabled={n === 0}
                  onClick={() => {
                    setDia(d.data);
                    setHorario(null);
                  }}
                  className={`snap-start shrink-0 w-[5.4rem] rounded-xl border px-2 py-2.5 text-center transition-colors ${
                    ativo
                      ? "border-orange-500 bg-orange-500/15"
                      : n === 0
                        ? "border-[var(--border)] opacity-40 cursor-not-allowed"
                        : "border-[var(--border)] hover:border-orange-500/60"
                  }`}
                >
                  <span className="block text-xs uppercase tracking-wide text-[var(--text-muted)]">{semana.replace(",", "")}</span>
                  <span className="block text-sm font-bold text-[var(--text-primary)] leading-tight whitespace-nowrap">{resto.join(" ")}</span>
                  <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{n === 0 ? "lotado" : `${n} ${n === 1 ? "horário" : "horários"}`}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-sm font-semibold text-[var(--text-primary)] mb-2">
            Horário <span className="font-normal text-[var(--text-muted)]">(de Brasília)</span>
          </p>
          {outroFuso && (
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              Você está em outro fuso: os horários abaixo são os de Brasília.
            </p>
          )}
          <div className={`grid grid-cols-3 sm:grid-cols-4 gap-2 ${carregando ? "opacity-50" : ""}`} aria-busy={carregando}>
            {doDia?.horarios.map((h) => {
              const ativo = horario === h.inicio;
              return (
                <button
                  key={h.inicio}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setHorario(h.inicio)}
                  className={`rounded-lg border py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                    ativo
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-[var(--border)] text-[var(--text-primary)] hover:border-orange-500/60"
                  }`}
                >
                  {horaEmSP(new Date(h.inicio))}
                </button>
              );
            })}
          </div>
          {dados && !dados.dias.some((d) => d.horarios.length) && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Sem horário livre nos próximos 10 dias úteis{pessoa !== "qualquer" ? " com essa pessoa. Tente qualquer pessoa do time" : ""}. Escreva para contato@demandou.com que encaixamos você.
            </p>
          )}
        </>
      )}

      {erro && <p role="alert" className="mt-4 text-sm text-red-400">{erro}</p>}

      <div className="mt-5 pt-4 border-t border-[var(--border)]">
        {horario ? (
          <p className="text-sm text-[var(--text-muted)] mb-3">
            <strong className="text-[var(--text-primary)]">
              {rotuloLongoDoDia(dia ?? "")}, às {horaEmSP(new Date(horario))}
            </strong>{" "}
            (horário de Brasília), 30 minutos por vídeo, com {nomeDaPessoa}.
          </p>
        ) : (
          <p className="text-sm text-[var(--text-muted)] mb-3">Escolha um dia e um horário. São 30 minutos, por vídeo.</p>
        )}
        <button
          type="button"
          onClick={confirmar}
          disabled={!horario || enviando}
          className="w-full rounded-full bg-marca-600 py-3.5 text-base font-bold text-white hover:bg-marca-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {enviando ? "Marcando..." : rotuloDoBotao}
          {!enviando && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
