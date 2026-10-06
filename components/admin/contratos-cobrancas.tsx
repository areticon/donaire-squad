"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { CobrancaNaTela } from "@/lib/contratos/cobrancas";
import { CANAIS_DO_FUP, NOME_DO_CANAL, NOME_DO_MOTIVO, RESULTADOS_DO_FUP, type CanalDoFup } from "@/lib/contratos/fup";

/**
 * A COBRANÇA DE UM CONTRATO NA TELA (05/10/2026): o motivo, o tempo sem
 * resposta, o próximo acompanhamento (FUP, follow-up) e se venceu, o telefone
 * do cliente com os links de ligar e de WhatsApp, o closer responsável e os
 * botões que registram o acompanhamento na trilha. Serve à aba de cobranças
 * e à ficha do cliente. Tudo o que é conta vem pronto do servidor
 * (lib/contratos/cobrancas.ts); aqui só clique e formulário.
 */

async function chamar(url: string, corpo: Record<string, unknown>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
  return d;
}

const campo = "w-full rounded-lg border px-3 py-2 text-sm";
const estiloCampo = { borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" };
const botaoNeutro = "rounded-lg border px-2.5 py-1.5 text-xs font-semibold";
const estiloNeutro = { borderColor: "var(--border)", color: "var(--text-primary)" };

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function CobrancaDoContrato({ cobranca: c, closers, comLinkDaFicha = false }: { cobranca: CobrancaNaTela; closers: Array<{ email: string; nome: string }>; comLinkDaFicha?: boolean }) {
  const router = useRouter();
  const url = `/api/admin/cobrancas/${c.contratoId}`;
  const [form, setForm] = useState<CanalDoFup | null>(null);
  const [contato, setContato] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function agir(fn: () => Promise<void>) {
    setOcupado(true);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  async function registrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await agir(async () => {
      await chamar(url, { acao: "fup", canal: f.get("canal"), resultado: f.get("resultado"), observacao: f.get("observacao") });
      toast.success("Acompanhamento registrado.");
      setForm(null);
    });
  }

  async function salvarContato(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await agir(async () => {
      await chamar(url, { acao: "contato", telefone: f.get("telefone"), closerEmail: f.get("closerEmail") });
      toast.success("Contato guardado.");
      setContato(false);
    });
  }

  const corDoPrazo = c.pausado ? "var(--text-muted)" : c.vencido ? "var(--badge-danger-text)" : "var(--text-primary)";
  const prazo = c.pausado
    ? "acompanhamento automático pausado"
    : c.vencido
      ? `acompanhamento vencido há ${c.diasVencido} ${c.diasVencido === 1 ? "dia" : "dias"} (era ${data(c.proximoFupEm)})`
      : `próximo acompanhamento em ${data(c.proximoFupEm)}${c.passo ? ` (passo ${c.passo} da cadência)` : ""}`;

  return (
    <div className="rounded-xl border p-3 text-xs" style={{ borderColor: c.vencido && !c.pausado ? "var(--badge-danger-text)" : "var(--border)", background: "var(--bg-elevated)" }} data-cobranca={c.numero} data-vencida={c.vencido && !c.pausado ? "1" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {comLinkDaFicha ? (
              <Link href={`/admin/contratos/${c.userId}`} className="hover:underline">
                nº {String(c.numero).padStart(4, "0")} · {c.cliente}
              </Link>
            ) : (
              <>Cobrança: {NOME_DO_MOTIVO[c.motivo].toLowerCase()}</>
            )}
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            {comLinkDaFicha ? `${NOME_DO_MOTIVO[c.motivo]} · ` : ""}
            {c.motivo === "assinatura" ? "enviado" : c.motivo === "entrada" ? "assinado" : "em atraso"} há {c.diasSemResposta} {c.diasSemResposta === 1 ? "dia" : "dias"} ({data(c.baseEm)}) · {c.plano} ·{" "}
            {(c.valorCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por ano
            {c.provedorSituacao === "recusado" ? " · recusou no provedor" : c.provedorSituacao === "aguardando_demandou" ? " · cliente assinou, falta a Demandou" : ""}
          </p>
          <p className="font-semibold" style={{ color: corDoPrazo }} data-prazo-do-fup>
            {prazo}
            {c.ultimoFupEm ? ` · último em ${quando(c.ultimoFupEm)}` : " · nenhum acompanhamento ainda"}
          </p>
        </div>
        <div className="text-right" style={{ color: "var(--text-muted)" }}>
          <p>
            Closer: <strong style={{ color: "var(--text-primary)" }}>{c.closerNome ?? "a definir"}</strong>
          </p>
          <p data-telefone-do-cliente>
            {c.telefone ? (
              <>
                <a href={c.linkDeLigacao ?? "#"} className="underline" style={{ color: "var(--text-primary)" }}>
                  {c.telefoneNaTela}
                </a>
                {c.telefoneOrigem && c.telefoneOrigem !== "contrato" ? ` (do ${c.telefoneOrigem === "lead" ? "cadastro de lead" : "pedido de demonstração"})` : ""}
              </>
            ) : (
              <span style={{ color: "var(--marca-laranja-texto)" }}>sem telefone: informe o contato</span>
            )}
            {" · "}
            {c.email}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {c.linkDeLigacao && (
          <a href={c.linkDeLigacao} onClick={() => setForm("ligacao")} className={botaoNeutro} style={estiloNeutro} data-acao="ligar">
            Ligar
          </a>
        )}
        <button
          type="button"
          disabled={ocupado || !c.telefone}
          title={c.telefone ? "Abre o WhatsApp com a mensagem pronta e registra o acompanhamento" : "Informe o telefone antes"}
          onClick={() =>
            agir(async () => {
              const d = await chamar(url, { acao: "whatsapp" });
              window.open(String(d.link), "_blank", "noopener,noreferrer");
              toast.success("Mensagem pronta no WhatsApp; acompanhamento registrado.");
            })
          }
          className={botaoNeutro}
          style={estiloNeutro}
          data-acao="whatsapp"
        >
          WhatsApp
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (!confirm(`Mandar agora o e-mail de acompanhamento para ${c.email}?`)) return;
            void agir(async () => {
              const d = await chamar(url, { acao: "email" });
              toast[d.ok ? "success" : "error"](d.ok ? `E-mail enviado para ${c.email}.` : "O e-mail não saiu (envio desligado ou recusado).");
            });
          }}
          className={botaoNeutro}
          style={estiloNeutro}
          data-acao="email"
        >
          E-mail agora
        </button>
        <button type="button" onClick={() => setForm(form ? null : "ligacao")} className={botaoNeutro} style={{ ...estiloNeutro, borderColor: "var(--marca-laranja-texto)", color: "var(--marca-laranja-texto)" }} data-acao="registrar">
          Registrar acompanhamento
        </button>
        <button type="button" onClick={() => setContato((v) => !v)} className="text-xs underline" style={{ color: "var(--text-muted)" }} data-acao="contato">
          {c.telefone ? "Editar contato e closer" : "Informar telefone e closer"}
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir(async () => void (await chamar(url, { acao: c.pausado ? "retomar" : "pausar" })))}
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
          data-acao="pausar"
        >
          {c.pausado ? "Retomar o automático" : "Pausar o automático"}
        </button>
      </div>

      {form && (
        <form onSubmit={registrar} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,3fr)_auto]" data-form-de-fup>
          <select name="canal" defaultValue={form} className={campo} style={estiloCampo} aria-label="Canal">
            {CANAIS_DO_FUP.map((k) => (
              <option key={k} value={k}>
                {NOME_DO_CANAL[k]}
              </option>
            ))}
          </select>
          <select name="resultado" required defaultValue="sem_resposta" className={campo} style={estiloCampo} aria-label="Resultado">
            {Object.entries(RESULTADOS_DO_FUP).map(([k, nome]) => (
              <option key={k} value={k}>
                {nome}
              </option>
            ))}
          </select>
          <input name="observacao" placeholder="Observação (opcional)" maxLength={500} className={campo} style={estiloCampo} />
          <button type="submit" disabled={ocupado} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white">
            Gravar
          </button>
        </form>
      )}

      {contato && (
        <form onSubmit={salvarContato} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]" data-form-de-contato>
          <input name="telefone" placeholder="Telefone do cliente, com DDD" defaultValue={c.telefoneOrigem === "contrato" ? c.telefoneNaTela : ""} className={campo} style={estiloCampo} aria-label="Telefone do cliente" />
          <select name="closerEmail" defaultValue={c.closerEmail ?? ""} className={campo} style={estiloCampo} aria-label="Closer responsável">
            <option value="">Closer (quem fechou)</option>
            {closers.map((p) => (
              <option key={p.email} value={p.email}>
                {p.nome}
              </option>
            ))}
          </select>
          <button type="submit" disabled={ocupado} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white">
            Guardar
          </button>
        </form>
      )}

      {c.fups.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold" style={{ color: "var(--text-primary)" }}>
            Acompanhamentos ({c.totalDeFups})
          </summary>
          <ol className="mt-1 space-y-0.5" style={{ color: "var(--text-muted)" }}>
            {c.fups.map((f) => (
              <li key={f.id}>
                <span className="tabular-nums">{quando(f.em)}</span> · {NOME_DO_CANAL[f.canal as CanalDoFup] ?? f.canal} · {f.origem === "automatico" ? "automático" : (f.autor ?? "?")}
                {f.resultado ? ` · ${RESULTADOS_DO_FUP[f.resultado as keyof typeof RESULTADOS_DO_FUP] ?? f.resultado}` : ""}
                {f.observacao ? ` · ${f.observacao}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
