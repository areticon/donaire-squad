"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendario, type ReuniaoMarcada } from "@/components/agenda/calendario";
import { Confirmada } from "@/components/agenda/agendamento";
import { tipoDeReuniao, type TipoDeReuniao } from "@/lib/agenda/tipo";

/**
 * REMARCAR OU CANCELAR (01/10), aberto pelo link do e-mail. O token da URL é
 * a autorização; o calendário é o mesmo da marcação, com o horário antigo
 * contando como livre para a própria reunião.
 *
 * SERVE AOS DOIS TIPOS (05/10): a demonstração e o onboarding. O tipo muda o
 * nome nos textos, prende o calendário à pessoa da reunião e diz para onde
 * "escolher outro horário" volta depois de cancelar.
 */
export function GerenciarReuniao({ token, atual, abrirNoCalendario = false, passou = false, tipo = "demonstracao", pessoaFixa = null, linkNovo = "/demonstracao" }: {
  token: string;
  atual: ReuniaoMarcada;
  /** Links de remarcar dos alertas (01/10) chegam direto no calendário. */
  abrirNoCalendario?: boolean;
  /** A reunião já passou sem começar: só remarcar, sem cancelar e sem "voltar". */
  passou?: boolean;
  tipo?: TipoDeReuniao;
  /** O onboarding remarca só com a mesma pessoa. */
  pessoaFixa?: string | null;
  /** Para onde "escolher outro horário" leva depois de cancelar. */
  linkNovo?: string;
}) {
  const [modo, setModo] = useState<"ver" | "remarcar" | "remarcada" | "cancelada">(abrirNoCalendario ? "remarcar" : "ver");
  const [reuniao, setReuniao] = useState(atual);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const onboarding = tipoDeReuniao(tipo) === "onboarding";
  // "Demonstração" é feminino e "Onboarding" é masculino: as formas vêm prontas.
  const t = onboarding
    ? { confirmar: "Cancelar o onboarding?", cancelada: "Onboarding cancelado.", remarcada: "Onboarding remarcado.", sua: "Seu onboarding", cancelar: "Cancelar o onboarding" }
    : { confirmar: "Cancelar a demonstração?", cancelada: "Demonstração cancelada.", remarcada: "Demonstração remarcada.", sua: "Sua demonstração", cancelar: "Cancelar a demonstração" };

  async function cancelar() {
    if (!window.confirm(t.confirmar)) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/agenda/reunioes/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "cancelar" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui cancelar.");
      setModo("cancelada");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (modo === "cancelada") {
    return (
      <div>
        <h2 className="text-2xl font-black text-[var(--text-primary)] mb-2">{t.cancelada}</h2>
        <p className="text-[var(--text-muted)]">Mandamos a confirmação para o seu e-mail. Quando quiser, escolha outro horário.</p>
        <Link href={linkNovo} className="mt-5 inline-flex rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700">
          Escolher outro horário
        </Link>
      </div>
    );
  }

  if (modo === "remarcar") {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-5">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{passou ? "Não deu certo agora? Escolha outro horário" : "Escolha o novo horário"}</h2>
          {!passou && (
            <button type="button" onClick={() => setModo("ver")} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              Voltar
            </button>
          )}
        </div>
        <Calendario
          enviarPara={`/api/agenda/reunioes/${token}`}
          corpoExtra={{ acao: "remarcar" }}
          rotuloDoBotao="Remarcar para este horário"
          tokenDaReuniao={token}
          pessoaFixa={pessoaFixa}
          onMarcada={(r) => {
            setReuniao(r);
            setModo("remarcada");
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <Confirmada r={reuniao} comGerenciar={false} titulo={modo === "remarcada" ? t.remarcada : t.sua} />
      {erro && <p role="alert" className="mt-4 text-sm text-red-400">{erro}</p>}
      <div className="mt-6 pt-5 border-t border-[var(--border)] flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setModo("remarcar")}
          className="rounded-full bg-marca-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-marca-700"
        >
          Escolher outro horário
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={enviando}
          className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/60 disabled:opacity-50"
        >
          {enviando ? "Cancelando..." : t.cancelar}
        </button>
      </div>
    </div>
  );
}
