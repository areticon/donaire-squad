"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ExternalLink, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalisesDasReferencias } from "@/components/editorial/analises-das-referencias";
import { Detalhes } from "@/components/editorial/painel-do-estudo";
import {
  MAX_REFERENCIAS_POR_CONTA,
  REDES_DE_REFERENCIA,
  ROTULO_DA_REDE,
  type CartaoDePadrao,
  type EstudoNaTela,
  type PerfilDeReferenciaNaTela,
  type RedeDeReferencia,
} from "@/lib/referencias/tipos";
import { MAX_REFERENCIAS_POR_PROJETO } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * OS PERFIS DE REFERÊNCIA, DENTRO DA LINHA EDITORIAL (01/10).
 *
 * O Roberto sugere perfis famosos e relevantes do nicho; o dono confirma até
 * 3 por projeto (03/10) e 10 por conta; "Estudar agora" coleta os posts deles e acha os MOLDES que
 * rendem (formato, gancho, estrutura, duração). Os cartões de padrão viram
 * uma das fontes das ideias ("padrão de referência"). Molde sim, conteúdo não:
 * o squad nunca recebe o texto de quem fez.
 *
 * PAINEL EXECUTIVO (03/10): aberto, o painel mostra primeiro a faixa do
 * estudo (os perfis e o botão), depois os números, os gráficos e o que fazer
 * (analises-das-referencias.tsx); a gestão dos perfis e os moldes medidos
 * ficam recolhidos em "ver detalhes", com tudo o que já faziam.
 *
 * Só o dono edita (a API responde 403 ao membro, lib/equipe/permissoes.ts);
 * o membro vê em leitura. Com o trilho desligado e nenhum perfil guardado, o
 * painel nem aparece.
 */

type Dados = {
  ligadas: RedeDeReferencia[];
  podeEditar: boolean;
  perfis: PerfilDeReferenciaNaTela[];
  padroes: CartaoDePadrao[];
  gastoDoMesUsd: number;
  confirmadosNaConta: number;
  /** O último "Estudar agora" (andamento, resumo ou motivo da falha). */
  estudo: EstudoNaTela | null;
};

/** De quanto em quanto tempo a tela pergunta pelo andamento do estudo. */
const CONSULTA_DO_ESTUDO_MS = 4000;

function fraseDoAndamento(e: EstudoNaTela): string {
  if (e.etapa === "etiquetando") return "Lendo os posts e achando os padrões que rendem...";
  if (e.etapa === "medindo") return "Medindo os vídeos (ritmo, cortes e visual)...";
  if (e.atual > 0) return `Estudando ${e.atual} de ${e.total}${e.perfil ? `: ${e.perfil}` : ""}...`;
  return "Começando o estudo...";
}

const SIGLA: Record<RedeDeReferencia, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", x: "X" };

function seguidores(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi seguidores`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil seguidores`;
  return `${n} seguidores`;
}

export function PerfisDeReferencia({ projectId }: { projectId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<null | "sugerir" | "estudar" | "adicionar">(null);
  const [rede, setRede] = useState<RedeDeReferencia>("instagram");
  const [perfil, setPerfil] = useState("");
  const [estudo, setEstudo] = useState<EstudoNaTela | null>(null);
  // O estado anterior da consulta, para avisar só na virada de "estudando" para o fim.
  const estavaEstudando = useRef(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/referencias`);
    if (!r.ok) return;
    const d = (await r.json()) as Dados;
    setDados(d);
    setEstudo(d.estudo ?? null);
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O ESTUDO RODA NO SERVIDOR DEPOIS DO CLIQUE (01/10): enquanto ele estuda, a
  // tela pergunta só o andamento a cada 4 s. Vale também para quem recarrega a
  // página no meio: o estado vem do GET e a consulta retoma sozinha.
  const estudando = estudo?.estado === "estudando";
  useEffect(() => {
    if (estavaEstudando.current && estudo && !estudando) {
      if (estudo.estado === "pronto") toast.success(estudo.resumo ?? "Estudo concluído.");
      else toast.error(estudo.erro ?? "O estudo não terminou.");
      void carregar();
    }
    estavaEstudando.current = estudando;
    if (!estudando) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/projects/${projectId}/referencias?estudo=1`).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json().catch(() => ({}))) as { estudo?: EstudoNaTela | null };
      if (d.estudo) setEstudo(d.estudo);
    }, CONSULTA_DO_ESTUDO_MS);
    return () => clearInterval(t);
  }, [estudando, estudo, projectId, carregar]);

  async function acao(nome: "sugerir" | "estudar" | "adicionar", extra?: Record<string, unknown>) {
    setOcupado(nome);
    try {
      const r = await fetch(`/api/projects/${projectId}/referencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: nome, ...extra }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; sugeridos?: number; estudo?: EstudoNaTela | null };
      if (!r.ok) throw new Error(d.error);
      if (nome === "sugerir") toast.success(d.sugeridos ? `${d.sugeridos} perfis sugeridos. Confirme os que fazem sentido.` : "Não achei perfis novos agora.");
      if (nome === "estudar") {
        // O servidor só aceitou: o andamento aparece no painel e a consulta acompanha.
        setEstudo(d.estudo ?? null);
        return;
      }
      if (nome === "adicionar") setPerfil("");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não consegui agora.");
    } finally {
      setOcupado(null);
    }
  }

  async function mudar(id: string, status: "confirmado" | "recusado" | "sugerido") {
    const r = await fetch(`/api/projects/${projectId}/referencias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) toast.error(d.error ?? "Não consegui mudar agora.");
    await carregar();
  }

  if (!dados || (dados.ligadas.length === 0 && dados.perfis.length === 0)) return null;
  const confirmados = dados.perfis.filter((p) => p.status === "confirmado");
  const sugeridos = dados.perfis.filter((p) => p.status === "sugerido");
  const ligado = dados.ligadas.length > 0;

  return (
    <section className="mb-6 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-3 p-4 text-left">
        <Search className="h-5 w-5 shrink-0 text-pink-500" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold" style={{ color: "var(--text-primary)" }}>
            Perfis de referência do seu nicho
          </span>
          <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
            {confirmados.length} de {MAX_REFERENCIAS_POR_PROJETO} confirmados neste projeto ({dados.confirmadosNaConta} de {MAX_REFERENCIAS_POR_CONTA} na conta)
            {sugeridos.length ? `, ${sugeridos.length} sugestões do Roberto` : ""}
            {dados.padroes.length ? `, ${dados.padroes.length} padrões medidos` : ""}
            {estudando ? ", estudando agora" : ""}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", aberto && "rotate-180")} style={{ color: "var(--text-muted)" }} />
      </button>

      {aberto && (
        <div className="space-y-4 border-t p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
          {!ligado && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              O estudo de referências está desligado nesta conta. Os perfis ficam guardados até ele ser ligado.
            </p>
          )}

          {/* A FAIXA DO ESTUDO (03/10): os perfis estudados, o último estudo numa linha e o botão. O resto da gestão fica nos detalhes. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {confirmados.map((p) => (
                <a
                  key={p.id}
                  href={p.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:border-orange-500/50"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  title={p.ultimoErro ? `Última coleta: ${p.ultimoErro}` : p.ultimaColeta ? `Estudado em ${new Date(p.ultimaColeta).toLocaleDateString("pt-BR")}` : "Ainda não estudado"}
                >
                  <span className="shrink-0 text-[10px] font-semibold text-pink-600 dark:text-pink-400">{SIGLA[p.rede]}</span>
                  <span className="truncate font-medium">{p.rede === "linkedin" ? (p.nome ?? "página") : p.perfil.startsWith("@") ? p.perfil : `@${p.perfil}`}</span>
                  {p.seguidores ? <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{seguidores(p.seguidores).replace(" seguidores", "")}</span> : null}
                  {p.ultimoErro && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
                </a>
              ))}
              {!confirmados.length && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Nenhum perfil confirmado ainda. Confirme até {MAX_REFERENCIAS_POR_PROJETO} nos detalhes abaixo.
                </span>
              )}
            </div>
            {dados.podeEditar && ligado && (
              <button
                type="button"
                disabled={ocupado !== null || estudando || confirmados.length === 0}
                onClick={() => void acao("estudar")}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {ocupado === "estudar" || estudando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {estudando && estudo ? `Estudando ${Math.max(estudo.atual, 1)} de ${estudo.total}...` : ocupado === "estudar" ? "Começando..." : "Estudar agora"}
              </button>
            )}
          </div>

          {estudo && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-xs",
                estudo.estado === "falhou"
                  ? "bg-red-500/10 text-red-700 dark:text-red-400"
                  : estudo.estado === "pronto"
                    ? "text-[var(--text-muted)]"
                    : "bg-orange-500/10 text-orange-700 dark:text-orange-300"
              )}
              style={estudo.estado === "pronto" ? { background: "var(--bg-input)" } : undefined}
            >
              <p className="flex items-start gap-2">
                {estudo.estado === "estudando" ? (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : estudo.estado === "falhou" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                )}
                <span>
                  {estudo.estado === "estudando"
                    ? `${fraseDoAndamento(estudo)} Leva alguns minutos; pode sair desta tela, o resultado aparece aqui.`
                    : estudo.estado === "falhou"
                      ? estudo.erro
                      : `Último estudo${estudo.terminadoEm ? ` (${new Date(estudo.terminadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}: ${estudo.resumo ?? "concluído."}`}
                </span>
              </p>
            </div>
          )}

          {/* O PAINEL EXECUTIVO: números, gráficos, o que fazer e os detalhes (regras, tendências, achados). */}
          <AnalisesDasReferencias projectId={projectId} />

          {/* A gestão dos perfis e os moldes medidos, recolhidos. */}
          <div className="space-y-2">
            <Detalhes
              titulo="Perfis estudados e sugestões do Roberto"
              resumo={`${confirmados.length} de ${MAX_REFERENCIAS_POR_PROJETO} confirmados neste projeto (${dados.confirmadosNaConta} de ${MAX_REFERENCIAS_POR_CONTA} na conta)${sugeridos.length ? `, ${sugeridos.length} sugestões` : ""}`}
            >
              <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                O Roberto estuda o <b>formato</b> do que dá certo nesses perfis (gancho, estrutura, duração, tipo de post) e usa como uma das fontes das suas
                ideias. Molde sim, conteúdo não: o squad nunca recebe o texto, o caso ou o visual de quem fez.
              </p>
              {dados.podeEditar && ligado && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => void acao("sugerir")}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    {ocupado === "sugerir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {ocupado === "sugerir" ? "Procurando perfis do nicho..." : "Pedir sugestões ao Roberto"}
                  </button>
                  <form
                    className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (perfil.trim()) void acao("adicionar", { rede, perfil });
                    }}
                  >
                    <select
                      value={rede}
                      onChange={(e) => setRede(e.target.value as RedeDeReferencia)}
                      className="rounded-lg border px-2 py-2 text-sm"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {REDES_DE_REFERENCIA.filter((r) => dados.ligadas.includes(r)).map((r) => (
                        <option key={r} value={r}>
                          {ROTULO_DA_REDE[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={perfil}
                      onChange={(e) => setPerfil(e.target.value)}
                      placeholder={rede === "linkedin" ? "link da página de empresa" : "@perfil ou link"}
                      className="w-44 min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                    <button type="submit" disabled={ocupado !== null} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      <Plus className="h-4 w-4" /> Indicar
                    </button>
                  </form>
                </div>
              )}
              {estudo && estudo.estado !== "estudando" && estudo.avisos.length > 0 && (
                <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {estudo.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              <div className="space-y-3">
                {[
                  { titulo: "Confirmados", lista: confirmados },
                  { titulo: "Sugestões do Roberto", lista: sugeridos },
                ].map(
                  (grupo) =>
                    grupo.lista.length > 0 && (
                      <div key={grupo.titulo}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          {grupo.titulo}
                        </p>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {grupo.lista.map((p) => (
                            <div key={p.id} className="flex min-w-0 items-start gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                              <span className="mt-0.5 rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-semibold text-pink-600 dark:text-pink-400">{SIGLA[p.rede]}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                  {p.nome ?? p.perfil}
                                  {p.url && (
                                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex text-orange-500">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </p>
                                <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                                  {p.rede === "linkedin" ? "página de empresa" : p.perfil.startsWith("@") ? p.perfil : `@${p.perfil}`}
                                  {p.seguidores ? `, ${seguidores(p.seguidores)}` : ""}
                                </p>
                                {p.motivo && (
                                  <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
                                    {p.motivo}
                                  </p>
                                )}
                                {p.status === "confirmado" && (p.ultimaColeta || p.ultimoErro) && (
                                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                                    {p.ultimoErro ? `Última coleta: ${p.ultimoErro}` : `Estudado em ${new Date(p.ultimaColeta as string).toLocaleDateString("pt-BR")}`}
                                  </p>
                                )}
                              </div>
                              {dados.podeEditar && (
                                <div className="flex shrink-0 gap-1">
                                  {p.status === "sugerido" && confirmados.length < MAX_REFERENCIAS_POR_PROJETO && (
                                    <button type="button" title="Confirmar" onClick={() => void mudar(p.id, "confirmado")} className="rounded p-1 text-green-600 hover:bg-green-500/10">
                                      <Check className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    title={p.status === "confirmado" ? "Tirar dos confirmados" : "Recusar (não volta nas sugestões)"}
                                    onClick={() => void mudar(p.id, p.status === "confirmado" ? "sugerido" : "recusado")}
                                    className="rounded p-1 hover:bg-[var(--bg-elevated)]"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                )}
              </div>
            </Detalhes>

            {dados.padroes.length > 0 && (
              <Detalhes titulo="Moldes que viram ideia" resumo={`${dados.padroes.length} padrões medidos nas referências, usados como fonte das suas ideias`}>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {dados.padroes.map((c) => (
                    <div key={c.chave} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {c.oQueE}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {c.prova.ganho.toLocaleString("pt-BR")} vezes a mediana do próprio perfil, em {c.prova.posts} posts de {c.prova.perfis} perfis
                        {c.rede !== "todas" ? ` (${SIGLA[c.rede]})` : ""}.
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <b>Como usar:</b> {c.comoAplicar}
                      </p>
                    </div>
                  ))}
                </div>
              </Detalhes>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
