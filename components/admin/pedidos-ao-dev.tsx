"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { ExemploNoPainel, GrupoNoPainel } from "@/lib/feedback/painel";
import {
  NOME_DA_CLASSIFICACAO,
  NOME_DA_SITUACAO,
  ehClassificacao,
  ehSituacaoDoGrupo,
  fraseDaContagem,
  melhoraOProduto,
} from "@/lib/feedback/regras";

/**
 * A LISTA DO PAINEL DO DEV (06/10/2026): um cartão por grupo com a contagem
 * (clientes e ocorrências na semana e no mês), a classificação do JEV, os
 * exemplos sem nome, e as ações do admin. Recebe dado puro do servidor; não
 * importa nada que toque o banco.
 */

const COR_DA_CLASSE: Record<string, string> = {
  erro_do_produto: "var(--badge-danger-text)",
  pedido_de_gosto: "var(--painel-3)",
  atendido_como_pedido: "var(--painel-2)",
  duvida_de_uso: "var(--painel-1)",
};

const COR_DA_SITUACAO: Record<string, string> = {
  aberto: "var(--painel-2)",
  aprovado: "var(--badge-success-text)",
  nao_e_produto: "var(--text-muted)",
  feito: "var(--painel-1)",
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
      <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  );
}

function Exemplo({ e }: { e: ExemploNoPainel }) {
  return (
    <li className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
        &ldquo;{e.texto}&rdquo;
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {e.origem === "chamado" ? "chamado" : "chat da peça"}
        {e.tipoDePeca ? ` · ${e.tipoDePeca}` : ""} · {quando(e.quando)}
        {e.resultado ? ` · resultado: ${e.resultado}` : ""}
        {typeof e.confianca === "number" ? ` · confiança do JEV ${Math.round(e.confianca * 100)}%` : ""}
      </p>
      {e.resposta && (
        <p className="mt-1 text-[11px] italic" style={{ color: "var(--text-muted)" }}>
          A plataforma respondeu: &ldquo;{e.resposta}&rdquo;
        </p>
      )}
    </li>
  );
}

export function PedidosAoDevLista({ grupos, semClasse, exemplo }: { grupos: GrupoNoPainel[]; semClasse: ExemploNoPainel[]; exemplo: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "aguardando" | "aprovados" | "descartados">("todos");

  async function acao(grupoId: string, corpo: Record<string, unknown>, ok: string) {
    if (exemplo) return toast("Tela de exemplo: as ações não gravam.");
    setOcupado(grupoId);
    try {
      const r = await fetch(`/api/admin/dev/${grupoId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const d = (await r.json().catch(() => ({}))) as { error?: string; briefing?: string | null };
      if (!r.ok) throw new Error(d.error ?? "Não deu.");
      toast.success(corpo.acao === "aprovar" && d.briefing === null ? "Aprovado. O briefing não saiu agora; peça de novo em 'Reescrever briefing'." : ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu.");
    } finally {
      setOcupado(null);
    }
  }

  const visiveis = grupos.filter((g) =>
    filtro === "todos" ? true : filtro === "aguardando" ? g.situacao === "aberto" : filtro === "aprovados" ? g.situacao === "aprovado" || g.situacao === "feito" : g.situacao === "nao_e_produto"
  );

  return (
    <section className="space-y-3" data-pedidos-ao-dev>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["todos", "Todos"],
            ["aguardando", "Aguardando o admin"],
            ["aprovados", "Aprovados"],
            ["descartados", "Não é produto"],
          ] as const
        ).map(([k, rotulo]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(k)}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: filtro === k ? "transparent" : "var(--border)",
              background: filtro === k ? "var(--acento-forte)" : "var(--bg-input)",
              color: filtro === k ? "#fff" : "var(--text-primary)",
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {visiveis.length === 0 && (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Nenhum grupo aqui
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Cada pedido no chat de uma peça e cada chamado viram um feedback; o JEV agrupa os parecidos e eles aparecem aqui.
          </p>
        </div>
      )}

      {visiveis.map((g) => {
        const classe = ehClassificacao(g.classificacao) ? NOME_DA_CLASSIFICACAO[g.classificacao] : g.classificacao;
        const situacao = ehSituacaoDoGrupo(g.situacao) ? NOME_DA_SITUACAO[g.situacao] : g.situacao;
        const produto = melhoraOProduto(g.classificacao);
        return (
          <article
            key={g.id}
            data-grupo={g.id}
            className="rounded-2xl border p-4 sm:p-5"
            style={{ borderColor: produto && g.situacao === "aberto" ? "color-mix(in srgb, var(--badge-danger-text) 45%, transparent)" : "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                  {g.titulo}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <Etiqueta texto={classe} cor={COR_DA_CLASSE[g.classificacao] ?? "var(--text-muted)"} />
                  <Etiqueta texto={situacao} cor={COR_DA_SITUACAO[g.situacao] ?? "var(--text-muted)"} />
                  {g.aprovadoEm && (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      aprovado em {quando(g.aprovadoEm)}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right">
                <div>
                  <p className="rotulo">Esta semana</p>
                  <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                    {g.semana.clientes}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {fraseDaContagem(g.semana)}
                  </p>
                </div>
                <div>
                  <p className="rotulo">No mês</p>
                  <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                    {g.mes.clientes}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {fraseDaContagem(g.mes)}
                  </p>
                </div>
              </div>
            </div>

            {g.exemplos.length > 0 && (
              <ul className="mt-3 space-y-2">
                {g.exemplos.map((e) => (
                  <Exemplo key={e.id} e={e} />
                ))}
              </ul>
            )}

            {g.modulos.length > 0 && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Por onde a peça passou: <span className="font-mono">{g.modulos.join(", ")}</span>
              </p>
            )}

            {g.briefing && (
              <details className="mt-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }} open>
                <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  Briefing de desenvolvimento (escrito pelo Davi Dev; o time executa)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed font-sans" style={{ color: "var(--text-primary)" }}>
                  {g.briefing}
                </pre>
              </details>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {g.situacao === "aberto" && (
                <>
                  <button
                    type="button"
                    disabled={ocupado === g.id}
                    onClick={() => acao(g.id, { acao: "aprovar" }, "Melhoria aprovada. O Davi escreveu o briefing.")}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: "var(--marca-laranja-botao)" }}
                    title={produto ? "Grava a sua aprovação e o Davi escreve o briefing" : "Classificado como não sendo erro do produto; aprovar mesmo assim gera briefing"}
                  >
                    {ocupado === g.id ? "Gravando..." : "Aprovar melhoria"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === g.id}
                    onClick={() => acao(g.id, { acao: "descartar" }, "Descartado: não é produto.")}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60 hover:bg-[var(--realce-2)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Não é produto
                  </button>
                </>
              )}
              {g.situacao === "aprovado" && (
                <>
                  <button
                    type="button"
                    disabled={ocupado === g.id}
                    onClick={() => acao(g.id, { acao: "briefing" }, "Briefing reescrito.")}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60 hover:bg-[var(--realce-2)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    {g.briefing ? "Reescrever briefing" : "Escrever briefing"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === g.id}
                    onClick={() => acao(g.id, { acao: "feito" }, "Marcado como feito.")}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-60 hover:bg-[var(--realce-2)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Marcar como feito
                  </button>
                </>
              )}
              {(g.situacao === "nao_e_produto" || g.situacao === "feito") && (
                <button
                  type="button"
                  disabled={ocupado === g.id}
                  onClick={() => acao(g.id, { acao: "reabrir" }, "Reaberto.")}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Reabrir
                </button>
              )}
            </div>
          </article>
        );
      })}

      {semClasse.length > 0 && (
        <article className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            O JEV não teve certeza ({semClasse.length})
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Confiança abaixo de 50%: ficam sem classe e sem grupo, nunca viram erro do produto por padrão.
          </p>
          <ul className="mt-3 space-y-2">
            {semClasse.map((e) => (
              <Exemplo key={e.id} e={e} />
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
