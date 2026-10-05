"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { CamposDoPreco, EditarContrato, NovoAditivo, contaDoPreco, corpoDoPreco } from "@/components/admin/contratos-preco";
import { valorInicialDoPreco, type ValorDoPreco } from "@/lib/contratos/preco";

/**
 * AS PARTES INTERATIVAS DO GESTOR DE CONTRATOS (02/10/2026): o formulário de
 * contrato novo (para conta existente ou novo cliente, 04/10), os botões de
 * cada contrato e o registro de pagamento com o comprovante. Tudo o que é número e gráfico
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

const FORMAS = [
  { id: "pix", nome: "Pix" },
  { id: "boleto", nome: "Boleto" },
  { id: "transferencia", nome: "Transferência" },
  { id: "cartao", nome: "Cartão" },
] as const;

/**
 * O CONTRATO NOVO (04/10): para um NOVO CLIENTE (prospect, sem conta: a conta
 * nasce sem senha e sem acesso até o pagamento) ou para uma conta que já
 * existe. Todo plano é anual; sem data de início, a vigência conta da
 * confirmação do pagamento (cláusula 5.1).
 */
export function NovoContrato({ contas, contaInicial }: { contas: Array<{ id: string; rotulo: string; plano: string }>; contaInicial?: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(Boolean(contaInicial));
  const [modo, setModo] = useState<"prospect" | "conta">(contaInicial ? "conta" : "prospect");
  const [userId, setUserId] = useState(contaInicial ?? "");
  const conta = contas.find((c) => c.id === userId);
  // O VALOR NASCE DA TABELA (04/10): plano e acessos extras pelo preço de
  // tabela, menos o desconto com motivo. Ver components/admin/contratos-preco.
  const [preco, setPreco] = useState<ValorDoPreco>(valorInicialDoPreco(conta?.plano && conta.plano !== "free" ? conta.plano : "pro"));
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const conta = contaDoPreco(preco);
    if (conta.faixa === "bloqueado") return void toast.error("Desconto acima do teto não sai.");
    if (conta.descontoCentavos > 0 && !preco.motivo) return void toast.error("Escolha o motivo do desconto.");
    setEnviando(true);
    try {
      const nome = f.get("nome");
      const email = f.get("email");
      const d = await chamar("/api/admin/contratos", {
        ...(modo === "conta" ? { userId } : { prospectNome: nome, prospectEmail: email }),
        ...corpoDoPreco(preco),
        inicioVigencia: f.get("inicio"),
        formaDePagamento: f.get("forma"),
        empresa: f.get("empresa"),
        endereco: f.get("endereco"),
        signatarioNome: nome,
        signatarioEmail: email,
        signatarioDocumento: f.get("documento"),
        renovacaoAutomatica: f.get("renova") === "on",
        observacao: f.get("observacao"),
      });
      toast.success(
        contaDoPreco(preco).faixa === "aprovacao" ? "Contrato criado como rascunho. O desconto espera a aprovação do dono antes de ir para assinatura." : "Contrato criado como rascunho."
      );
      router.push(`/admin/contratos/${String(d.userId ?? userId)}`);
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
  const rotulo = "text-xs font-medium";
  const corDoRotulo = { color: "var(--text-muted)" };
  return (
    <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-novo-contrato>
      <div className="sm:col-span-2 inline-flex w-fit rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }} role="radiogroup" aria-label="Para quem é o contrato">
        {(
          [
            ["prospect", "Novo cliente"],
            ["conta", "Conta que já existe"],
          ] as const
        ).map(([id, nome]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={modo === id}
            onClick={() => setModo(id)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
            style={modo === id ? { background: "var(--realce-2)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}
          >
            {nome}
          </button>
        ))}
      </div>
      {modo === "conta" ? (
        <label className={`sm:col-span-2 ${rotulo}`} style={corDoRotulo}>
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
      ) : (
        <p className="sm:col-span-2 text-xs" style={corDoRotulo}>
          A conta nasce com este e-mail, sem senha e sem acesso. O acesso só é liberado quando o pagamento for confirmado; aí sai o e-mail de boas-vindas com o link de
          entrada.
        </p>
      )}
      <label className={rotulo} style={corDoRotulo}>
        Nome de quem assina
        <input name="nome" required={modo === "prospect"} autoComplete="off" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        E-mail de quem assina{modo === "prospect" ? " (vira o login)" : ""}
        <input name="email" type="email" required={modo === "prospect"} autoComplete="off" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        Empresa (razão social)
        <input name="empresa" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        CNPJ ou CPF
        <input name="documento" required={modo === "prospect"} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={`sm:col-span-2 ${rotulo}`} style={corDoRotulo}>
        Endereço
        <input name="endereco" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <CamposDoPreco valor={preco} mudar={setPreco} />
      <label className={rotulo} style={corDoRotulo}>
        Forma de pagamento combinada
        <select name="forma" defaultValue="Pix" className={`${campo} mt-1`} style={estiloCampo}>
          {FORMAS.map((f) => (
            <option key={f.id} value={f.nome}>
              {f.nome}
            </option>
          ))}
          <option value="Cartão pelo link do Stripe">Cartão pelo link do Stripe</option>
        </select>
      </label>
      <label className={rotulo} style={corDoRotulo}>
        Início da vigência (opcional: sem data, conta do pagamento)
        <input type="date" name="inicio" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
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
        <button type="submit" disabled={enviando || (modo === "conta" && !userId)} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? "Criando..." : "Criar rascunho"}
        </button>
      </div>
    </form>
  );
}

/**
 * REGISTRAR PAGAMENTO (04/10): valor, data, forma e o comprovante (PDF ou
 * imagem). Confirmado o pagamento de um contrato assinado, a conta é ativada.
 */
function RegistrarPagamento({ id, faltaCentavos, aoFechar }: { id: string; faltaCentavos: number; aoFechar: () => void }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("acao", "pagamento");
    setEnviando(true);
    try {
      const d = await chamar(`/api/admin/contratos/${id}`, fd);
      const ativou = Boolean((d as { ativacao?: unknown }).ativacao);
      toast.success(ativou ? "Pagamento registrado. Conta ativada e boas-vindas enviadas." : "Pagamento registrado.");
      aoFechar();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <form onSubmit={enviar} className="mt-3 grid w-full grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-4" style={{ borderColor: "var(--border)" }} data-registrar-pagamento={id}>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Valor recebido (R$)
        <input name="valorReais" required inputMode="decimal" defaultValue={(faltaCentavos / 100).toFixed(2).replace(".", ",")} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Data do pagamento
        <input name="pagoEm" type="date" required defaultValue={hoje} max={hoje} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Forma
        <select name="forma" required defaultValue="pix" className={`${campo} mt-1`} style={estiloCampo}>
          {FORMAS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Comprovante (PDF ou imagem, até 4 MB)
        <input name="comprovante" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className="sm:col-span-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Observação (opcional)
        <input name="observacao" placeholder="Ex.: Pix do CNPJ da empresa, id da transação" className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <div className="flex items-end justify-end gap-2">
        <button type="button" onClick={aoFechar} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Fechar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {enviando ? "Registrando..." : "Confirmar pagamento"}
        </button>
      </div>
    </form>
  );
}

export function AcoesDoContrato({
  id,
  status,
  temProvedor,
  provedorSituacao,
  faltaCentavos = 0,
  linkDePagamento = null,
  edicao = null,
  aditivo = null,
}: {
  id: string;
  status: string;
  temProvedor: boolean;
  provedorSituacao: string | null;
  /** Quanto falta pagar, em centavos (04/10). */
  faltaCentavos?: number;
  linkDePagamento?: string | null;
  /** Para a versão nova antes de assinar (04/10). */
  edicao?: Omit<React.ComponentProps<typeof EditarContrato>, "id" | "enviado" | "aoFechar"> | null;
  /** Para o aditivo depois de assinado e ativo (04/10); null quando não cabe. */
  aditivo?: Omit<React.ComponentProps<typeof NovoAditivo>, "id" | "aoFechar"> | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [aberto, setAberto] = useState<"editar" | "aditivo" | null>(null);

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
  const assinado = ["aguardando_pagamento", "assinado", "vigente", "a_vencer", "vencido"].includes(status);
  const aguardaPagamento = status === "aguardando_pagamento";

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
      {edicao && (status === "rascunho" || status === "enviado") && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => setAberto((v) => (v === "editar" ? null : "editar"))} data-editar={id}>
          Editar (versão nova)
        </button>
      )}
      {aditivo && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => setAberto((v) => (v === "aditivo" ? null : "aditivo"))} data-abrir-aditivo={id}>
          Novo aditivo
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
      {aguardaPagamento && (
        <button
          type="button"
          disabled={Boolean(ocupado)}
          className="rounded-lg bg-[var(--marca-laranja-botao)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => setPagando((v) => !v)}
          data-abrir-pagamento={id}
        >
          Registrar pagamento
        </button>
      )}
      {assinado && !aguardaPagamento && faltaCentavos > 0 && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => setPagando((v) => !v)}>
          Registrar outro pagamento
        </button>
      )}
      {assinado && faltaCentavos > 0 && (
        <button
          type="button"
          disabled={Boolean(ocupado)}
          className={botao}
          style={estilo}
          title="Sessão de pagamento do Stripe no valor que falta. Vence em 24 horas; gerar de novo troca o link."
          onClick={async () => {
            setOcupado("link");
            try {
              const d = await chamar(`/api/admin/contratos/${id}`, { acao: "link_pagamento" });
              const link = String(d.link ?? "");
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              toast.success("Link de pagamento gerado e copiado.");
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não deu certo.");
            } finally {
              setOcupado(null);
            }
          }}
        >
          {ocupado === "link" ? "Gerando..." : linkDePagamento ? "Gerar novo link do Stripe" : "Gerar link de pagamento (Stripe)"}
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
      {assinado && !aguardaPagamento && (
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
      {pagando && <RegistrarPagamento id={id} faltaCentavos={faltaCentavos} aoFechar={() => setPagando(false)} />}
      {aberto === "editar" && edicao && <EditarContrato id={id} enviado={status === "enviado"} {...edicao} aoFechar={() => setAberto(null)} />}
      {aberto === "aditivo" && aditivo && <NovoAditivo id={id} {...aditivo} aoFechar={() => setAberto(null)} />}
    </div>
  );
}
