"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import {
  OPCOES_DE_APROVEITAR,
  REDES_DE_APROVEITAR,
  creditosDoPedido,
  diasDoPedido,
  jaGeradoDoFormato,
  type OQueJaExiste,
  type OpcaoDeAproveitar,
} from "@/lib/media/aproveitar-tipos";
import type { RedeDoPlano } from "@/lib/media/semana-do-video";

/**
 * "QUER APROVEITAR ESTE ROTEIRO PARA GERAR MAIS CONTEÚDO?" (02/10/2026).
 *
 * Aparece quando o vídeo fica pronto (a faixa verde do Gestor, e o link do
 * aviso e do e-mail de vídeo pronto, que abre o Gestor com ?aproveitar=<id>).
 * Não oferece de novo o que o vídeo já gerou: mostra "Já gerado" e deixa
 * marcar só o que falta. O custo aparece antes de confirmar, pela mesma conta
 * da campanha. Componente de cliente puro; quem cobra e escreve é
 * app/api/videos/[id]/aproveitar.
 */
type Resposta = OQueJaExiste & { saldo: number | null; acessoInterno?: boolean };

const NOME_DO_FORMATO: Record<string, [string, string]> = {
  text: ["texto", "textos"],
  image: ["imagem", "imagens"],
  carousel: ["carrossel", "carrosséis"],
  video: ["corte", "cortes"],
  thread: ["thread", "threads"],
  poll: ["enquete", "enquetes"],
  infographic: ["infográfico", "infográficos"],
};
const NOME_DA_REDE: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", twitter: "X", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };

export function AproveitarRoteiro({ projectId, videoId, nome, aoFechar }: { projectId: string; videoId: string; nome?: string | null; aoFechar?: () => void }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [formatos, setFormatos] = useState<OpcaoDeAproveitar[]>([]);
  const [redes, setRedes] = useState<RedeDoPlano[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<{ creditos: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await fetch(`/api/videos/${videoId}/aproveitar`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as Resposta & { error?: string };
      if (!vivo) return;
      if (!r.ok) return setErro(d.error ?? "Não consegui ler este vídeo agora.");
      setDados(d);
      // Começa com o que falta marcado e as redes conectadas que aceitam peça escrita.
      setFormatos(OPCOES_DE_APROVEITAR.filter((o) => jaGeradoDoFormato(d, o.id) === 0).map((o) => o.id).slice(0, d.diasLivres.length));
      const conectadas = d.redesConectadas.filter((x) => REDES_DE_APROVEITAR.some((y) => y.id === x));
      setRedes(conectadas.length ? conectadas : ["linkedin", "instagram"]);
    })();
    return () => {
      vivo = false;
    };
  }, [videoId]);

  const dias = useMemo(() => (dados ? diasDoPedido({ formatos, redes }, dados.diasLivres) : []), [dados, formatos, redes]);
  const creditos = useMemo(() => creditosDoPedido(dias.filter((d) => d.plano.redes.length)), [dias]);
  const semRede = dias.find((d) => !d.plano.redes.length);
  const passouDosDias = dados ? formatos.length > dados.diasLivres.length : false;
  const semSaldo = Boolean(dados && !dados.acessoInterno && dados.saldo != null && creditos > dados.saldo);

  async function confirmar() {
    setEnviando(true);
    try {
      const r = await fetch(`/api/videos/${videoId}/aproveitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formatos, redes }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; creditos?: number };
      if (!r.ok) throw new Error(d.error ?? "Não consegui pedir as peças.");
      setPedido({ creditos: d.creditos ?? creditos });
      toast.success("Pedido feito. A equipe começou; as peças caem no quadro.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pedir as peças.");
    } finally {
      setEnviando(false);
    }
  }

  const resumoJaGerado = dados
    ? [
        dados.posts ? `${dados.posts} ${dados.posts === 1 ? "post" : "posts"}` : null,
        dados.cortes ? `${dados.cortes} ${dados.cortes === 1 ? "corte" : "cortes"}` : null,
      ]
        .filter(Boolean)
        .join(" e ")
    : "";
  const detalheJaGerado = dados
    ? Object.entries(dados.porFormato)
        .filter(([f]) => f !== "video")
        .map(([f, n]) => `${n} ${NOME_DO_FORMATO[f]?.[n === 1 ? 0 : 1] ?? f}`)
        .concat(Object.entries(dados.porRede).length ? [`em ${Object.keys(dados.porRede).map((r) => NOME_DA_REDE[r] ?? r).join(", ")}`] : [])
        .join(", ")
    : "";

  return (
    <section className="rounded-2xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--accent-orange)" }} data-aproveitar>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-[34px] h-[34px] rounded-lg border border-orange-500/35 bg-orange-500/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-[17px] h-[17px] text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Quer aproveitar este roteiro para gerar mais conteúdo?
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {nome ? `${nome}: ` : ""}a equipe escreve a partir do mesmo vídeo, na sua voz, e cada peça cai no quadro para você aprovar.
            </p>
          </div>
        </div>
        {aoFechar && (
          <button onClick={aoFechar} title="Fechar" className="p-1 rounded-lg hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-orange-400">{erro}</p>}
      {!dados && !erro && (
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Conferindo o que este vídeo já gerou...
        </p>
      )}

      {dados && pedido && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
          <p className="font-semibold">Pedido feito{pedido.creditos ? `: ${pedido.creditos.toLocaleString("pt-BR")} créditos` : ""}.</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Pode fechar esta tela. Vamos te avisar aqui e por e-mail quando as peças estiverem prontas para aprovar. O que não ficar pronto volta ao seu saldo.
          </p>
        </div>
      )}

      {dados && !pedido && (
        <>
          {resumoJaGerado && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }} data-ja-gerado>
              <span className="font-semibold">Já gerado: {resumoJaGerado}</span>
              {detalheJaGerado ? <span style={{ color: "var(--text-muted)" }}> ({detalheJaGerado})</span> : null}. Ofereço só o que falta.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPCOES_DE_APROVEITAR.map((o) => {
              const ja = jaGeradoDoFormato(dados, o.id);
              const marcado = formatos.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${ja ? "opacity-60" : "cursor-pointer"}`}
                  style={{ borderColor: marcado ? "var(--accent-orange)" : "var(--border)" }}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-orange-500"
                    disabled={Boolean(ja)}
                    checked={marcado}
                    onChange={() => setFormatos((f) => (f.includes(o.id) ? f.filter((x) => x !== o.id) : [...f, o.id]))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {o.rotulo}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                      {ja ? `Já gerado: ${ja}` : o.dica}
                    </span>
                  </span>
                </label>
              );
            })}
            <div className="flex items-start gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
              <Check className="w-4 h-4 mt-1 text-green-500 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Cortes
                </span>
                <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                  Já gerado: {dados.cortes}.{" "}
                  {dados.candidatosSemCorte > 0 ? (
                    <Link href={`/projects/${projectId}/video/${videoId}/roteiro?editar=1`} className="font-semibold text-orange-400 hover:underline">
                      Escolher mais {dados.candidatosSemCorte === 1 ? "1 corte" : `até ${dados.candidatosSemCorte} cortes`} no roteiro
                    </Link>
                  ) : (
                    "Todos os trechos do roteiro já viraram corte."
                  )}
                </span>
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
              Para quais redes
            </p>
            <div className="flex flex-wrap gap-2">
              {REDES_DE_APROVEITAR.map((r) => {
                const marcada = redes.includes(r.id);
                const conectada = dados.redesConectadas.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs cursor-pointer"
                    style={{ borderColor: marcada ? "var(--accent-orange)" : "var(--border)", color: "var(--text-primary)" }}
                    title={conectada ? undefined : "Rede não conectada: a peça nasce em rascunho"}
                  >
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      checked={marcada}
                      onChange={() => setRedes((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))}
                    />
                    {r.nome}
                    {dados.porRede[r.id] ? <span style={{ color: "var(--text-muted)" }}>· já tem {dados.porRede[r.id]}</span> : null}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: semSaldo ? "#f87171" : "var(--text-muted)" }} data-custo>
              {OPCOES_DE_APROVEITAR.every((o) => jaGeradoDoFormato(dados, o.id) > 0)
                ? "Este vídeo já gerou todos estes formatos. Para mais peças sobre o mesmo assunto, use a Nova campanha com o tema dele."
                : dados.diasLivres.length === 0
                  ? "A semana deste vídeo já está cheia. Para mais peças, use a Nova campanha com o tema dele."
                  : !formatos.length
                ? `Marque o que quer gerar (a semana deste vídeo tem ${dados.diasLivres.length} ${dados.diasLivres.length === 1 ? "dia livre" : "dias livres"}).`
                : passouDosDias
                  ? `A semana deste vídeo tem ${dados.diasLivres.length} ${dados.diasLivres.length === 1 ? "dia livre" : "dias livres"}: escolha até ${dados.diasLivres.length}.`
                  : semRede
                    ? "Uma das peças marcadas não sai em nenhuma das redes escolhidas (o X não tem carrossel, o Instagram não publica texto solto)."
                    : (
                      <>
                        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          Custa {creditos.toLocaleString("pt-BR")} créditos
                        </span>{" "}
                        ({dias.length} {dias.length === 1 ? "peça" : "peças"} em {dias.map((d) => d.plano.redes.map((r) => NOME_DA_REDE[r]).join(" e ")).join("; ")}).{" "}
                        {dados.acessoInterno
                          ? "Acesso interno: nada é debitado."
                          : dados.saldo != null
                            ? semSaldo
                              ? `Você tem ${dados.saldo.toLocaleString("pt-BR")}; não cobre.`
                              : `Você tem ${dados.saldo.toLocaleString("pt-BR")}.`
                            : ""}{" "}
                        O que não ficar pronto volta ao saldo.
                      </>
                    )}
            </p>
            <button
              type="button"
              disabled={!formatos.length || !redes.length || passouDosDias || Boolean(semRede) || semSaldo || enviando}
              onClick={() => void confirmar()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {formatos.length && !semRede && !passouDosDias ? `Gerar (${creditos.toLocaleString("pt-BR")} créditos)` : "Gerar"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
