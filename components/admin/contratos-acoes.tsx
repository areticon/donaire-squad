"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { PLANOS_PUBLICOS } from "@/lib/planos";

/**
 * AS PARTES INTERATIVAS DO GESTOR DE CONTRATOS (02/10/2026): o formulário de
 * contrato novo e os botões de cada contrato. Tudo o que é número e gráfico
 * é desenhado no servidor; aqui só formulário e clique. Não importa nada que
 * toque o banco (lib/planos é a tabela pura).
 */

async function chamar(url: string, corpo: Record<string, unknown> | FormData) {
  const r = await fetch(url, {
    method: "POST",
    ...(corpo instanceof FormData ? { body: corpo } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
  });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
  return d;
}

const campo = "w-full rounded-lg border px-3 py-2 text-sm";
const estiloCampo = { borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" };

export function NovoContrato({ contas, contaInicial }: { contas: Array<{ id: string; rotulo: string; plano: string }>; contaInicial?: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(Boolean(contaInicial));
  const [userId, setUserId] = useState(contaInicial ?? "");
  const conta = contas.find((c) => c.id === userId);
  const [plano, setPlano] = useState(conta?.plano && conta.plano !== "free" ? conta.plano : "pro");
  const valorDoPlano = (id: string) => String(PLANOS_PUBLICOS.find((p) => p.id === id)?.anual ?? "");
  const [valor, setValor] = useState(valorDoPlano(plano));
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      await chamar("/api/admin/contratos", {
        userId,
        plano,
        valorReais: valor,
        inicioVigencia: f.get("inicio"),
        formaDePagamento: f.get("forma"),
        empresa: f.get("empresa"),
        endereco: f.get("endereco"),
        signatarioNome: f.get("nome"),
        signatarioEmail: f.get("email"),
        signatarioDocumento: f.get("documento"),
        renovacaoAutomatica: f.get("renova") === "on",
        observacao: f.get("observacao"),
      });
      toast.success("Contrato criado como rascunho.");
      router.push(`/admin/contratos/${userId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-sm font-semibold text-white">
        Novo contrato
      </button>
    );
  }
  return (
    <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-novo-contrato>
      <label className="sm:col-span-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Conta do cliente
        <select required value={userId} onChange={(e) => setUserId(e.target.value)} className={`${campo} mt-1`} style={estiloCampo}>
          <option value="">Escolha a conta</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Plano
        <select
          value={plano}
          onChange={(e) => {
            setPlano(e.target.value);
            setValor(valorDoPlano(e.target.value));
          }}
          className={`${campo} mt-1`}
          style={estiloCampo}
        >
          {PLANOS_PUBLICOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Valor anual (R$)
        <input required inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Início da vigência (dura um ano)
        <input required type="date" name="inicio" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Forma de pagamento
        <input name="forma" placeholder="Cartão pelo Stripe, PIX, boleto..." className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Empresa (razão social)
        <input name="empresa" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Endereço
        <input name="endereco" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        CNPJ ou CPF
        <input name="documento" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Quem assina (nome)
        <input name="nome" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        E-mail de quem assina
        <input name="email" type="email" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="sm:col-span-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Observação interna
        <input name="observacao" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
        <input type="checkbox" name="renova" defaultChecked />
        Renovação automática
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Fechar
        </button>
        <button type="submit" disabled={enviando || !userId} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? "Criando..." : "Criar rascunho"}
        </button>
      </div>
    </form>
  );
}

export function AcoesDoContrato({ id, status, temProvedor, provedorSituacao }: { id: string; status: string; temProvedor: boolean; provedorSituacao: string | null }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function fazer(acao: string, corpo: Record<string, unknown> | FormData, ok: string) {
    setOcupado(acao);
    try {
      const d = await chamar(`/api/admin/contratos/${id}`, corpo);
      toast.success(d.situacao === "aguardando_provedor" ? "Aguardando provedor: falta ligar a assinatura eletrônica (ZAPSIGN_API_TOKEN)." : ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(null);
    }
  }

  const botao = "rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 hover:bg-[var(--realce-2)]";
  const estilo = { borderColor: "var(--border)", color: "var(--text-primary)" };
  const ativo = status !== "cancelado";
  const assinado = ["assinado", "vigente", "a_vencer", "vencido"].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-2" data-acoes-do-contrato={id}>
      <a href={`/api/admin/contratos/${id}/texto`} target="_blank" rel="noopener noreferrer" className={botao} style={estilo}>
        Ver o texto
      </a>
      {(status === "rascunho" || status === "enviado") && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("enviar", { acao: "enviar" }, "Enviado para assinatura.")}>
          {ocupado === "enviar" ? "Enviando..." : status === "enviado" || provedorSituacao === "aguardando_provedor" ? "Enviar de novo" : "Enviar para assinar"}
        </button>
      )}
      {status === "enviado" && temProvedor && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("sincronizar", { acao: "sincronizar" }, "Situação conferida no provedor.")}>
          Conferir no provedor
        </button>
      )}
      {ativo && !assinado && (
        <label className={`${botao} cursor-pointer`} style={estilo} title="Assinou por fora (papel ou outro serviço): anexe o PDF assinado">
          Marcar assinado (com PDF)
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              const fd = new FormData();
              fd.set("acao", "assinar_manual");
              if (f) fd.set("pdf", f);
              void fazer("assinar", fd, "Contrato marcado como assinado.");
            }}
          />
        </label>
      )}
      {ativo && !assinado && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("assinar", { acao: "assinar_manual" }, "Contrato marcado como assinado.")}>
          Marcar assinado (sem PDF)
        </button>
      )}
      {assinado && (
        <label className={`${botao} cursor-pointer`} style={estilo}>
          Anexar PDF assinado
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.set("acao", "anexar_pdf");
              fd.set("pdf", f);
              void fazer("pdf", fd, "PDF guardado.");
            }}
          />
        </label>
      )}
      {assinado && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("renovar", { acao: "renovar" }, "Renovação criada como rascunho.")}>
          Renovar
        </button>
      )}
      {ativo && (
        <button
          type="button"
          disabled={Boolean(ocupado)}
          className={botao}
          style={{ ...estilo, color: "var(--badge-danger-text)" }}
          onClick={() => {
            const motivo = window.prompt("Motivo do cancelamento (fica na trilha de auditoria):");
            if (motivo) void fazer("cancelar", { acao: "cancelar", motivo }, "Contrato cancelado.");
          }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
