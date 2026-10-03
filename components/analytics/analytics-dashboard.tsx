"use client";

import { useMemo, useState } from "react";
import {
  RefreshCw,
  Zap,
  ExternalLink,
  Image,
  Video,
  LayoutGrid,
  Type,
  TrendingUp,
  Archive,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { BarrasPorSemana, BarrasPorRede, COR_DA_REDE } from "@/components/painel/graficos";
import { NOMES_DAS_REDES } from "@/lib/posts/estado";
import { interacoes, rotuloDaFonte, type NumerosLidos } from "@/lib/analytics/fontes-da-leitura";
import {
  ORDEM_DOS_ESTADOS,
  ROTULO_DO_ESTADO,
  type EstadoNaConta,
  type PostNosResultados,
  type ResultadosDoProjeto,
  type ResumoDoPeriodo,
} from "@/lib/analytics/tipos-dos-resultados";

/**
 * A ABA RESULTADOS (reescrita em 01/10 sobre a tela de "Analytics").
 *
 * Relato do Bruno: "arquivei tudo de dois projetos e sumiram as métricas. O
 * que foi publicado, aprovado, cancelado, tudo tem que aparecer". A tela
 * antiga recebia só posts com status "published" e só desenhava post com
 * número; arquivar zerava tudo, e post sem leitura não aparecia.
 *
 * Agora: um resumo por período (semana, mês, tudo) com TODOS os estados, os
 * arquivados contando; dois gráficos no padrão do painel inicial
 * (components/painel/graficos.tsx, SVG sem biblioteca); e a lista dos
 * publicados com os números de cada rede, a fonte ("medido pelo Blotato",
 * "pela API do LinkedIn", "lido do perfil público") e a data da leitura.
 * Sem número ainda é "pendente", com o motivo, e nunca zero.
 */

interface PipelineRun {
  id: string;
  topic: string | null;
  status: string;
  config: unknown;
  startedAt: Date;
  endedAt: Date | null;
  _count: { posts: number };
}

interface Props {
  project: { id: string; name: string };
  resultados: ResultadosDoProjeto;
  recentRuns: PipelineRun[];
}

const MEDIA_TYPE_CONFIG = {
  text: { label: "Texto", icon: Type },
  image: { label: "Imagem", icon: Image },
  video: { label: "Vídeo", icon: Video },
  carousel: { label: "Carrossel", icon: LayoutGrid },
  free: { label: "Livre", icon: Zap },
  article: { label: "Artigo", icon: Type },
  thread: { label: "Fio", icon: Type },
  poll: { label: "Enquete", icon: Type },
};

/** A cor de cada estado, na família da paleta do painel. */
const COR_DO_ESTADO: Record<EstadoNaConta, string> = {
  publicado: "var(--grafico-1)",
  publicando: "var(--grafico-4)",
  agendado: "var(--grafico-2)",
  rascunho: "var(--grafico-5)",
  arquivado: "var(--grafico-6)",
  falhou: "#f87171",
  reprovado: "var(--grafico-3)",
};

const nomeDaRede = (r: string) => NOMES_DAS_REDES[r] ?? r;
const num = (n: number) => n.toLocaleString("pt-BR");
const FUSO = "America/Sao_Paulo";
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: FUSO });

function Cartao({ titulo, sub, children, className = "" }: { titulo: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${className}`} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{titulo}</h2>
      {sub && <p className="text-[11px] mt-0.5 mb-3" style={{ color: "var(--text-muted)" }}>{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: "var(--text-primary)" }}>{valor}</p>
      {nota && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{nota}</p>}
    </div>
  );
}

/** Uma barra horizontal com todos os estados do período, e a legenda com os números. */
function BarraDeEstados({ r }: { r: ResumoDoPeriodo }) {
  const total = ORDEM_DOS_ESTADOS.reduce((s, e) => s + r.porEstado[e], 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }} role="img" aria-label="Peças do período por estado">
        {total > 0 &&
          ORDEM_DOS_ESTADOS.filter((e) => r.porEstado[e] > 0).map((e) => (
            <div key={e} style={{ width: `${(r.porEstado[e] / total) * 100}%`, background: COR_DO_ESTADO[e] }} title={`${ROTULO_DO_ESTADO[e]}: ${r.porEstado[e]}`} />
          ))}
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {ORDEM_DOS_ESTADOS.filter((e) => e !== "publicando" || r.porEstado.publicando > 0).map((e) => (
          <div key={e} className="flex items-center gap-2 text-xs min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COR_DO_ESTADO[e] }} />
            <span className="truncate" style={{ color: "var(--text-muted)" }}>{ROTULO_DO_ESTADO[e]}</span>
            <strong className="ml-auto tabular-nums" style={{ color: "var(--text-primary)" }}>{r.porEstado[e]}</strong>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text-primary)" }}>{r.aprovados}</strong> aprovadas (publicadas, saindo ou agendadas) de {total} peças
        {r.publicadosArquivados > 0 && (
          <>; {r.publicadosArquivados} dos publicados estão arquivados na tela e continuam contando aqui</>
        )}
        .
      </p>
    </div>
  );
}

/** A curva de interações de um post ao longo das leituras (só com 2 pontos ou mais). */
function Curva({ pontos }: { pontos: PostNosResultados["historico"] }) {
  const v = pontos.map((p) => p.interacoes).filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const L = 64, A = 18, max = Math.max(1, ...v);
  const d = v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * (L - 2) + 1).toFixed(1)},${(A - 2 - (y / max) * (A - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} aria-label={`Interações nas ${v.length} leituras: ${v.join(", ")}`}>
      <title>{`Interações nas leituras: ${v.join(" → ")}`}</title>
      <path d={d} fill="none" stroke="var(--grafico-2)" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** Os números de um post, só os que a fonte mede (nulo não aparece como zero). */
function NumerosDoPost({ n }: { n: NumerosLidos }) {
  const itens: Array<[string, number | null | undefined]> = [
    ["visualizações", n.visualizacoes],
    ["impressões", n.impressoes],
    ["alcance", n.alcance],
    ["curtidas", n.curtidas],
    ["comentários", n.comentarios],
    ["compartilh.", n.compartilhamentos],
    ["salvos", n.salvamentos],
    ["cliques", n.cliques],
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {itens
        .filter(([, v]) => typeof v === "number")
        .map(([r, v]) => (
          <span key={r} className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{num(v as number)}</strong> {r}
          </span>
        ))}
    </div>
  );
}

function LinhaDoPost({ p }: { p: PostNosResultados }) {
  return (
    <div className="py-3 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COR_DA_REDE[p.rede] ?? "var(--grafico-3)" }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{nomeDaRede(p.rede)}</span>
            {p.conta && <span>{p.conta}</span>}
            <span>· {dia(p.publicadoEm)}</span>
            {p.arquivado && (
              <span className="inline-flex items-center gap-1 rounded-full border px-1.5" style={{ borderColor: "var(--border)" }}>
                <Archive className="w-3 h-3" /> arquivado
              </span>
            )}
            {p.link && (
              <a href={p.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                ver na rede <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-sm mt-0.5 line-clamp-2 break-words" style={{ color: "var(--text-primary)" }}>{p.titulo || "(sem texto)"}</p>
          <div className="mt-1.5">
            {p.numeros ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <NumerosDoPost n={p.numeros} />
                <Curva pontos={p.historico} />
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {rotuloDaFonte(p.fonte ?? "")}
                  {p.lidoEm ? `, lido em ${quando(p.lidoEm)}` : ""}
                  {p.historico.length > 1 ? ` (${p.historico.length} leituras)` : ""}
                </span>
              </div>
            ) : (
              <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-muted)" }}>
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong style={{ color: "var(--text-primary)" }}>Pendente.</strong> {p.pendente}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsDashboard({ project, resultados, recentRuns }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "tudo">("mes");
  const [rede, setRede] = useState<string>("todas");
  const [quantos, setQuantos] = useState(30);

  const r = resultados[periodo];
  const redes = useMemo(() => [...new Set(resultados.posts.map((p) => p.rede))], [resultados.posts]);
  const lista = resultados.posts.filter((p) => rede === "todas" || p.rede === rede);
  const medidos = resultados.posts.filter((p) => p.numeros);

  // Desempenho por tipo de conteúdo (a seção que já existia), só com medidos.
  const porTipo = useMemo(() => {
    const m = new Map<string, { posts: number; interacoes: number }>();
    for (const p of medidos) {
      const t = p.mediaType ?? "text";
      const x = m.get(t) ?? { posts: 0, interacoes: 0 };
      x.posts++;
      x.interacoes += interacoes(p.numeros) ?? 0;
      m.set(t, x);
    }
    return [...m.entries()].map(([t, x]) => ({ t, ...x, media: x.interacoes / x.posts })).sort((a, b) => b.media - a.media);
  }, [medidos]);

  async function syncMetrics() {
    setSyncing(true);
    try {
      const res = await fetch("/api/analytics/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // POR REDE, e com o motivo do que não veio (28/09).
      const porRede = (data.porRede ?? {}) as Record<string, { ok: number; falhou: number; motivo: string | null }>;
      const vieram = Object.entries(porRede).filter(([, x]) => x.ok > 0).map(([k, x]) => `${nomeDaRede(k)}: ${x.ok}`);
      if (vieram.length) toast.success(`Números atualizados. ${vieram.join(", ")}.`);
      else toast(data.message ?? "Nenhum número novo veio das redes.");
      for (const [k, x] of Object.entries(porRede)) {
        if (x.falhou > 0 && x.motivo) toast(`${nomeDaRede(k)}: ${x.falhou} pendente${x.falhou > 1 ? "s" : ""}. ${x.motivo}`, { duration: 9000 });
      }
      setTimeout(() => window.location.reload(), vieram.length ? 2500 : 9000);
    } catch {
      toast.error("Erro ao sincronizar os números");
    } finally {
      setSyncing(false);
    }
  }

  async function getAiInsight() {
    setLoadingInsight(true);
    try {
      const res = await fetch("/api/analytics/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiInsight(data.insight);
    } catch {
      toast.error("Erro ao gerar insight");
    } finally {
      setLoadingInsight(false);
    }
  }

  const BOTOES_DE_PERIODO: Array<["semana" | "mes" | "tudo", string]> = [["semana", "Semana"], ["mes", "Mês"], ["tudo", "Tudo"]];

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Resultados</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {project.name}
            {resultados.ultimaLeitura ? ` · última leitura ${quando(resultados.ultimaLeitura)}` : " · ainda sem leitura"}
          </p>
        </div>
        <Button onClick={syncMetrics} variant="outline" loading={syncing} disabled={syncing}>
          <RefreshCw className="w-4 h-4" />
          Sincronizar números
        </Button>
      </div>

      {/* Período */}
      <div className="inline-flex rounded-xl border p-0.5 mb-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }} role="tablist" aria-label="Período do resumo">
        {BOTOES_DE_PERIODO.map(([k, rotulo]) => (
          <button
            key={k}
            role="tab"
            aria-selected={periodo === k}
            onClick={() => setPeriodo(k)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={periodo === k ? { background: "var(--grafico-1)", color: "var(--bg-card)" } : { color: "var(--text-muted)" }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Numero rotulo="Publicados" valor={num(r.porEstado.publicado)} nota={r.publicadosArquivados ? `${r.publicadosArquivados} arquivados na tela` : r.rotulo.toLowerCase()} />
        <Numero rotulo="Interações" valor={num(r.interacoes)} nota={`curtidas, comentários e compartilhamentos em ${r.medidos} post${r.medidos === 1 ? "" : "s"} medidos`} />
        <Numero rotulo="Visualizações e impressões" valor={num(r.vistos)} nota="onde a rede mostra" />
        <Numero rotulo="Pendentes" valor={num(r.pendentes)} nota="publicados ainda sem número (não é zero)" />
      </div>

      <Cartao titulo={`Todas as peças, ${r.rotulo.toLowerCase()}`} sub="Publicadas, aprovadas, agendadas, canceladas ou arquivadas, com falha e reprovadas. Arquivar tira da tela, não da conta." className="mb-6">
        <BarraDeEstados r={r} />
      </Cartao>

      <div className="grid lg:grid-cols-5 gap-6 mb-6">
        <Cartao titulo="Publicados por semana" sub="Últimas 8 semanas, por rede, arquivados inclusos. Passe o mouse numa barra para ver o número." className="lg:col-span-3">
          <BarrasPorSemana semanas={resultados.semanas} />
        </Cartao>
        <Cartao titulo="Interações por rede" sub={`${r.rotulo}. Soma dos posts medidos.`} className="lg:col-span-2">
          {r.porRede.length ? (
            <BarrasPorRede
              linhas={r.porRede.map((x) => ({
                rede: x.rede,
                valor: x.interacoes,
                nota: `em ${x.medidos} de ${x.publicados} post${x.publicados === 1 ? "" : "s"}${x.vistos ? ` · ${num(x.vistos)} vistos` : ""}`,
              }))}
            />
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Nada publicado neste período.</p>
          )}
        </Cartao>
      </div>

      {resultados.fontes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>De onde vêm os números:</span>
          {resultados.fontes.map((f) => (
            <span key={f.fonte} className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)" }}>
              {f.rotulo}: <strong style={{ color: "var(--text-primary)" }}>{f.posts}</strong>
            </span>
          ))}
        </div>
      )}

      <Cartao titulo="Post a post" sub={`${resultados.posts.length} publicados, ${medidos.length} com número. Cada número diz a fonte e quando foi lido.`} className="mb-6">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {["todas", ...redes].map((x) => (
            <button
              key={x}
              onClick={() => { setRede(x); setQuantos(30); }}
              className="rounded-full border px-2.5 py-0.5 text-xs"
              style={rede === x ? { background: "var(--grafico-1)", color: "var(--bg-card)", borderColor: "var(--grafico-1)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {x === "todas" ? "Todas" : nomeDaRede(x)} ({x === "todas" ? resultados.posts.length : resultados.posts.filter((p) => p.rede === x).length})
            </button>
          ))}
        </div>
        {lista.length === 0 ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>Nenhum post publicado ainda. Quando sair o primeiro, os números aparecem aqui 2 horas depois.</p>
        ) : (
          <>
            {lista.slice(0, quantos).map((p) => <LinhaDoPost key={p.id} p={p} />)}
            {lista.length > quantos && (
              <button onClick={() => setQuantos((q) => q + 30)} className="mt-3 text-xs font-semibold underline-offset-2 hover:underline" style={{ color: "var(--text-primary)" }}>
                Mostrar mais {Math.min(30, lista.length - quantos)} de {lista.length - quantos}
              </button>
            )}
          </>
        )}
      </Cartao>

      {porTipo.length > 0 && (
        <Cartao titulo="Interações por tipo de conteúdo" sub="Média por post medido, desde o início." className="mb-6">
          <div className="space-y-2.5">
            {porTipo.map((x) => {
              // Tipo sem rótulo aparece pelo próprio nome, para não virar um segundo "Texto".
              const cfg = MEDIA_TYPE_CONFIG[x.t as keyof typeof MEDIA_TYPE_CONFIG] ?? { label: x.t, icon: Type };
              const Icone = cfg.icon;
              const max = Math.max(1, ...porTipo.map((y) => y.media));
              return (
                <div key={x.t}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-primary)" }}>
                      <Icone className="w-3.5 h-3.5" /> {cfg.label}
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text-primary)" }}>{x.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong> por post · {x.posts} post{x.posts === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(x.media / max) * 100}%`, background: "var(--grafico-2)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      <Cartao titulo="Insight da IA" className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {aiInsight ? (
            <p className="text-sm leading-relaxed flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>{aiInsight}</p>
          ) : (
            <p className="text-xs flex-1 min-w-0" style={{ color: "var(--text-muted)" }}>
              A IA lê os números dos posts publicados (arquivados inclusos) e sugere o que priorizar na próxima campanha. O insight fica na memória do projeto.
            </p>
          )}
          <Button variant="outline" onClick={getAiInsight} loading={loadingInsight} disabled={loadingInsight || medidos.length === 0}>
            <TrendingUp className="w-4 h-4" />
            {aiInsight ? "Atualizar" : "Gerar insight"}
          </Button>
        </div>
      </Cartao>

      {recentRuns.length > 0 && (
        <Cartao titulo="Campanhas recentes">
          <div className="space-y-2">
            {recentRuns.map((run) => {
              const cfg = run.config as { funnelStage?: string } | null;
              const funnelLabels: Record<string, string> = { tofu: "Topo do funil", mofu: "Meio do funil", bofu: "Fundo do funil" };
              const status: Record<string, string> = { completed: "concluída", failed: "falhou", cancelled: "cancelada", running: "rodando" };
              return (
                <div key={run.id} className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{run.topic ?? "Sem tema"}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(run.startedAt).toLocaleDateString("pt-BR")} · {run._count.posts} posts
                      {cfg?.funnelStage ? ` · ${funnelLabels[cfg.funnelStage] ?? cfg.funnelStage}` : ""}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    {status[run.status] ?? run.status}
                  </span>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}
    </div>
  );
}
