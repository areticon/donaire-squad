"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  MousePointer,
  TrendingUp,
  RefreshCw,
  Loader2,
  Trophy,
  BarChart2,
  Zap,
  Image,
  Video,
  LayoutGrid,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface PostMetric {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  videoViews: number;
  syncedAt: Date;
}

interface Post {
  id: string;
  platform: string;
  mediaType: string | null;
  dayOfWeek: number | null;
  content: string;
  publishedAt: Date | null;
  metrics: PostMetric | null;
}

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
  posts: Post[];
  recentRuns: PipelineRun[];
}

const MEDIA_TYPE_CONFIG = {
  text: { label: "Texto", icon: Type, color: "text-[var(--text-muted)]", bg: "bg-[#222]" },
  image: { label: "Imagem", icon: Image, color: "text-blue-400", bg: "bg-blue-500/10" },
  video: { label: "Vídeo", icon: Video, color: "text-red-400", bg: "bg-red-500/10" },
  carousel: { label: "Carrossel", icon: LayoutGrid, color: "text-purple-400", bg: "bg-purple-500/10" },
  free: { label: "Livre", icon: Zap, color: "text-orange-400", bg: "bg-orange-500/10" },
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "text-blue-400",
  twitter: "text-cyan-400",
};

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-orange-400" />
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="text-2xl font-black text-[var(--text-primary)]">{value.toLocaleString("pt-BR")}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export function AnalyticsDashboard({ project, posts, recentRuns }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [localPosts, setLocalPosts] = useState(posts);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const publishedWithMetrics = localPosts.filter((p) => p.metrics);
  const hasData = publishedWithMetrics.length > 0;

  const totals = publishedWithMetrics.reduce(
    (acc, p) => {
      const m = p.metrics!;
      return {
        impressions: acc.impressions + m.impressions,
        likes: acc.likes + m.likes,
        comments: acc.comments + m.comments,
        shares: acc.shares + m.shares,
        clicks: acc.clicks + m.clicks,
        videoViews: acc.videoViews + m.videoViews,
      };
    },
    { impressions: 0, likes: 0, comments: 0, shares: 0, clicks: 0, videoViews: 0 }
  );

  // Performance by media type
  const byMediaType = Object.entries(
    publishedWithMetrics.reduce<Record<string, { impressions: number; likes: number; comments: number; count: number }>>(
      (acc, p) => {
        const type = p.mediaType ?? "text";
        if (!acc[type]) acc[type] = { impressions: 0, likes: 0, comments: 0, count: 0 };
        acc[type].impressions += p.metrics!.impressions;
        acc[type].likes += p.metrics!.likes;
        acc[type].comments += p.metrics!.comments;
        acc[type].count++;
        return acc;
      },
      {}
    )
  ).sort((a, b) => b[1].impressions - a[1].impressions);

  // Performance by platform
  const byPlatform = Object.entries(
    publishedWithMetrics.reduce<Record<string, { impressions: number; likes: number; count: number }>>(
      (acc, p) => {
        if (!acc[p.platform]) acc[p.platform] = { impressions: 0, likes: 0, count: 0 };
        acc[p.platform].impressions += p.metrics!.impressions;
        acc[p.platform].likes += p.metrics!.likes;
        acc[p.platform].count++;
        return acc;
      },
      {}
    )
  );

  // Best post (score = likes*3 + comments*5 + impressions)
  const bestPost = publishedWithMetrics.sort((a, b) => {
    const sa = a.metrics!.likes * 3 + a.metrics!.comments * 5 + a.metrics!.impressions;
    const sb = b.metrics!.likes * 3 + b.metrics!.comments * 5 + b.metrics!.impressions;
    return sb - sa;
  })[0];

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
      toast.success(`${data.synced} post${data.synced !== 1 ? "s" : ""} sincronizado${data.synced !== 1 ? "s" : ""}!`);
      // Reload to get fresh data
      window.location.reload();
    } catch {
      toast.error("Erro ao sincronizar métricas");
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

  void setLocalPosts;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-3xl font-black text-[var(--text-primary)]">Analytics</h1>
          <p className="text-[var(--text-muted)] mt-1">{project.name}</p>
        </div>
        <Button onClick={syncMetrics} variant="outline" loading={syncing} disabled={syncing}>
          <RefreshCw className="w-4 h-4" />
            Sincronizar métricas
        </Button>
      </div>

      {!hasData ? (
        <div className="text-center py-20">
          <BarChart2 className="w-12 h-12 mx-auto text-[#2a2a2a] mb-4" />
          <h2 className="text-lg font-semibold text-[var(--text-muted)] mb-2">Nenhum dado ainda</h2>
          <p className="text-sm text-[#666] max-w-md mx-auto mb-6">
            Publique posts e clique em &quot;Sincronizar métricas&quot; para ver o desempenho por tipo de conteúdo, plataforma e mais.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <Eye className="w-3.5 h-3.5" />
            <span>{localPosts.filter((p) => p.publishedAt).length} posts publicados aguardando métricas</span>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard icon={Eye} label="Impressões" value={totals.impressions} />
            <MetricCard icon={Heart} label="Likes" value={totals.likes} />
            <MetricCard icon={MessageCircle} label="Comentários" value={totals.comments} sub="15x peso no algoritmo" />
            <MetricCard icon={Share2} label="Shares" value={totals.shares} />
            <MetricCard icon={MousePointer} label="Cliques" value={totals.clicks} />
            <MetricCard icon={Video} label="Video Views" value={totals.videoViews} />
          </div>

          {/* By media type */}
          {byMediaType.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                Performance por tipo de conteúdo
              </h2>
              <div className="grid gap-2">
                {byMediaType.map(([type, stats]) => {
                  const cfg = MEDIA_TYPE_CONFIG[type as keyof typeof MEDIA_TYPE_CONFIG] ?? MEDIA_TYPE_CONFIG.text;
                  const Icon = cfg.icon;
                  const maxImpressions = Math.max(...byMediaType.map((b) => b[1].impressions), 1);
                  const pct = Math.round((stats.impressions / maxImpressions) * 100);
                  return (
                    <div key={type} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                      <div className={cn("p-1.5 rounded-lg", cfg.bg)}>
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-[var(--text-primary)]">{cfg.label}</span>
                          <span className="text-xs text-[var(--text-muted)]">{stats.count} post{stats.count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="w-full bg-[var(--bg-elevated)] rounded-full h-1.5">
                          <div
                            className="bg-orange-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{stats.impressions.toLocaleString("pt-BR")}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">impressões</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-green-400">{stats.likes + stats.comments}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">engaj.</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Platform + Best post */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* By platform */}
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Performance por plataforma</h2>
              <div className="space-y-2">
                {byPlatform.map(([platform, stats]) => (
                  <div key={platform} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <div>
                      <p className={cn("text-sm font-semibold capitalize", PLATFORM_COLORS[platform] ?? "text-[var(--text-primary)]")}>
                        {platform === "twitter" ? "X (Twitter)" : platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{stats.count} posts</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{stats.impressions.toLocaleString("pt-BR")}</p>
                      <p className="text-xs text-[var(--text-muted)]">{stats.likes} likes Â· {((stats.likes / Math.max(stats.impressions, 1)) * 100).toFixed(1)}% taxa</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best post */}
            {bestPost && (
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Melhor post
                </h2>
                <div className="p-4 rounded-xl border border-yellow-800/30 bg-yellow-900/5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn("text-xs font-semibold capitalize", PLATFORM_COLORS[bestPost.platform] ?? "text-[var(--text-primary)]")}>
                      {bestPost.platform === "twitter" ? "X" : "LinkedIn"}
                    </span>
                    {bestPost.mediaType && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full text-[var(--text-muted)]">
                        {MEDIA_TYPE_CONFIG[bestPost.mediaType as keyof typeof MEDIA_TYPE_CONFIG]?.label ?? bestPost.mediaType}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#d1d5db] leading-relaxed line-clamp-4 mb-3">{bestPost.content}</p>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{bestPost.metrics!.impressions.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">impressões</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{bestPost.metrics!.likes}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">likes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{bestPost.metrics!.comments}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">comentários</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Insight */}
          <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                Insight da IA
              </h2>
              <Button variant="outline" onClick={getAiInsight} loading={loadingInsight} disabled={loadingInsight}>
                {aiInsight ? "Atualizar" : "Gerar insight"}
              </Button>
            </div>
            {aiInsight ? (
              <p className="text-sm text-[#d1d5db] leading-relaxed">{aiInsight}</p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                A IA analisa seus dados de performance e sugere qual tipo de conteúdo priorizar na próxima campanha.
                Os insights são salvos na memória do projeto para melhorar campanhas futuras.
              </p>
            )}
          </div>

          {/* Recent campaigns */}
          {recentRuns.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Campanhas recentes</h2>
              <div className="space-y-2">
                {recentRuns.map((run) => {
                  const cfg = run.config as { funnelStage?: string } | null;
                  const funnelLabels: Record<string, string> = { tofu: "ToFu", mofu: "MoFu", bofu: "BoFu" };
                  return (
                    <div key={run.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-primary)] truncate">{run.topic ?? "Sem tema"}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {new Date(run.startedAt).toLocaleDateString("pt-BR")} Â· {run._count.posts} posts
                          {cfg?.funnelStage && (
                            <span className="ml-2 px-1.5 py-0.5 bg-orange-500/10 text-orange-300 rounded text-[10px]">
                              {funnelLabels[cfg.funnelStage] ?? cfg.funnelStage}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        run.status === "completed" ? "bg-green-900/30 text-green-400" :
                        run.status === "failed" ? "bg-red-900/30 text-red-400" :
                        "bg-orange-900/30 text-orange-400"
                      )}>
                        {run.status === "completed" ? "concluída" : run.status === "failed" ? "falhou" : "rodando"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

