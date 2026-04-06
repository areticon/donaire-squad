"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Zap,
  Loader2,
  ShieldCheck,
  Bot,
  Download,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PipelineLive } from "./pipeline-live";
import { CampaignSetupModal, type CampaignConfig } from "./campaign-setup-modal";

interface Post {
  id: string;
  platform: string;
  content: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  mediaType: string | null;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  sourcesComment: string | null;
  createdAt: Date;
  socialAccountId: string | null;
  socialAccount: { displayName: string | null; platform: string } | null;
}

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
  accountType: string;
}

function pickSocialAccount(post: Post, accounts: SocialAccount[]): SocialAccount | undefined {
  const same = accounts.filter((a) => a.platform === post.platform);
  if (same.length === 0) return undefined;
  if (post.socialAccountId) {
    const exact = same.find((a) => a.id === post.socialAccountId);
    if (exact) return exact;
  }
  const personal = same.find((a) => a.accountType === "personal");
  return personal ?? same[0];
}

interface Project {
  id: string;
  name: string;
}

interface PostsPanelProps {
  project: Project;
  posts: Post[];
  socialAccounts: SocialAccount[];
}

const STATUS_CONFIG = {
  draft: { label: "Rascunho", variant: "secondary" as const, icon: Clock },
  scheduled: { label: "Agendado", variant: "warning" as const, icon: Clock },
  published: { label: "Publicado", variant: "success" as const, icon: CheckCircle2 },
  failed: { label: "Falhou", variant: "destructive" as const, icon: XCircle },
  rejected: { label: "Rejeitado", variant: "secondary" as const, icon: XCircle },
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function PostsPanel({ project, posts: initialPosts, socialAccounts }: PostsPanelProps) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [generating, setGenerating] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  // Restore active pipeline run on page load
  useEffect(() => {
    fetch(`/api/pipeline/status?projectId=${project.id}`)
      .then((r) => r.json())
      .then((d) => {
        const run = d.run;
        if (run?.status === "running" && run?.id) {
          setActiveRunId(run.id);
          setGenerating(true);
        }
      })
      .catch(() => {});
  }, [project.id]);
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<Array<{ title: string; description: string; format: string }>>([]);

  async function suggestTopics() {
    setLoadingTopics(true);
    setSuggestedTopics([]);
    try {
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestedTopics(data.topics ?? []);
    } catch {
      toast.error("Erro ao buscar sugestões. Tente novamente.");
    } finally {
      setLoadingTopics(false);
    }
  }

  function openCampaignModal() {
    if (!topic.trim()) {
      setShowTopicInput(true);
      return;
    }
    setShowCampaignModal(true);
  }

  async function generateCampaign(campaignConfig: CampaignConfig) {
    setShowCampaignModal(false);
    setGenerating(true);
    setShowTopicInput(false);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, topic: topic.trim(), campaignConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const runId = data.run?.id ?? data.runId;
      setActiveRunId(runId);
      // Redireciona para o Gestor de Conteúdo em tempo real
      router.push(`/projects/${project.id}/live`);
    } catch (err) {
      toast.error("Erro ao iniciar campanha");
      console.error(err);
      setGenerating(false);
    }
  }

  async function publishPost(post: Post) {
    const account = pickSocialAccount(post, socialAccounts);
    if (!account) {
      toast.error(
        `Nenhuma conta ${PLATFORM_LABELS[post.platform] ?? post.platform} pronta para publicar (token ou permissões). Reconecte em Configurações.`
      );
      return;
    }

    setPublishing(post.id);
    try {
      const res = await fetch(`/api/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      let data: { error?: string; url?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
      }
      if (!res.ok) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, status: "published", publishedAt: new Date(), externalUrl: data.url ?? null }
            : p
        )
      );
      toast.success("Post publicado com sucesso!");
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Erro ao publicar. Tente reconectar a rede em Configurações.";
      toast.error(message.length > 220 ? `${message.slice(0, 217)}…` : message);
      console.error(err);
    } finally {
      setPublishing(null);
    }
  }

  async function rejectPost(post: Post) {
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (!res.ok) throw new Error();

      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, status: "rejected" } : p))
      );
      toast.success("Post rejeitado e movido para Cancelados");
    } catch {
      toast.error("Erro ao rejeitar post");
    }
  }

  const isCanceled = (status: string) => status === "rejected" || status === "failed";

  const filtered =
    filter === "all"
      ? posts.filter((p) => !isCanceled(p.status))
      : filter === "rejected"
      ? posts.filter((p) => isCanceled(p.status))
      : posts.filter((p) => p.status === filter);

  const counts = {
    all: posts.filter((p) => !isCanceled(p.status)).length,
    draft: posts.filter((p) => p.status === "draft").length,
    published: posts.filter((p) => p.status === "published").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    rejected: posts.filter((p) => isCanceled(p.status)).length,
  };

  return (
    <div className="p-6 lg:p-8 w-full">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Posts</h1>
            <p className="mt-1" style={{ color: "var(--text-muted)" }}>{project.name}</p>
          </div>
          <Button onClick={openCampaignModal} loading={generating} disabled={generating}>
            <Zap className="w-4 h-4" />
            {generating ? "Gerando campanha..." : "Gerar campanha da semana"}
          </Button>
        </div>

        {(showTopicInput || topic) && !generating && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && openCampaignModal()}
                placeholder="Qual o tema? Ex: IA no RH, tendências de marketing 2026..."
                className="flex-1 h-10 px-4 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                autoFocus
              />
              <Button onClick={suggestTopics} variant="outline" loading={loadingTopics} disabled={loadingTopics}>
                <Bot className="w-4 h-4" />
                Sugerir com IA
              </Button>
              <Button onClick={openCampaignModal} disabled={!topic.trim()}>
                <Zap className="w-4 h-4" />
                Iniciar
              </Button>
            </div>

            {/* AI topic suggestions */}
            {loadingTopics && (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                Pesquisando tendências e hype para seu nicho...
              </div>
            )}

            {suggestedTopics.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Sugestões da IA — clique para usar:</p>
                {suggestedTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setTopic(t.title); setSuggestedTopics([]); }}
                    className="w-full text-left p-3 rounded-lg border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium group-hover:text-orange-500 transition-colors" style={{ color: "var(--text-primary)" }}>
                          {t.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded shrink-0 capitalize" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                        {t.format}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!showTopicInput && !topic && !generating && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Clique no botão acima para gerar posts com IA para aprovação.
          </p>
        )}
      </div>

      {/* Approval notice */}
      <div className="mb-6 p-4 bg-green-900/10 border border-green-800/30 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-green-400">Aprovação obrigatória</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Nenhum post será publicado sem sua aprovação explícita. Revise cada post e clique em &quot;Aprovar e publicar&quot; quando estiver pronto.</p>
        </div>
      </div>

      {/* Pipeline live view */}
      {generating && activeRunId && (
        <PipelineLive
          runId={activeRunId}
          onComplete={() => {
            setGenerating(false);
            setActiveRunId(null);
            toast.success("Campanha gerada! Veja o Gestor de Conteúdo para revisar os cards.");
            window.location.reload();
          }}
          onError={() => {
            setGenerating(false);
            setActiveRunId(null);
            toast.error("Erro ao gerar campanha. Tente novamente.");
          }}
        />
      )}

      {posts.length === 0 && !generating && (
        <div className="mb-6 p-8 border border-dashed rounded-xl text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--border)" }} />
          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nenhum post ainda</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Clique em &quot;Gerar campanha da semana&quot; para seus agentes criarem posts para aprovação.</p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: "all", label: "Todos" },
          { id: "draft", label: "Rascunhos" },
          { id: "scheduled", label: "Agendados" },
          { id: "published", label: "Publicados" },
          { id: "rejected", label: "Cancelados" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
              filter === tab.id
                ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                : "border-transparent"
            )}
            style={filter === tab.id ? undefined : { color: "var(--text-muted)" }}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-60">
              ({counts[tab.id as keyof typeof counts] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && posts.length > 0 ? (
        <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
          <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--border)" }} />
          <p className="text-sm">Nenhum post nesta categoria</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((post) => {
            const statusConfig = STATUS_CONFIG[post.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;
            const StatusIcon = statusConfig.icon;
            const isExpanded = expanded === post.id;

            return (
              <div
                key={post.id}
                className="rounded-xl overflow-hidden border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                {/* Post header */}
                <div
                  className="flex items-start gap-4 p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : post.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </Badge>
                      <Badge
                        variant={statusConfig.variant}
                        className={`text-xs flex items-center gap-1 ${isCanceled(post.status) ? "opacity-60" : ""}`}
                      >
                        <StatusIcon className="w-2.5 h-2.5" />
                        {statusConfig.label}
                      </Badge>
                      {post.imageUrl && (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <ImageIcon className="w-2.5 h-2.5" />
                          Com imagem
                        </Badge>
                      )}
                      <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                        {formatDate(post.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {post.content}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 shrink-0 mt-1" style={{ color: "var(--text-muted)" }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 mt-1" style={{ color: "var(--text-muted)" }} />
                  )}
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t pt-4 space-y-4" style={{ borderColor: "var(--border)" }}>
                        {/* Full content */}
                        <div className="rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                          {post.content}
                        </div>

                        {/* Image */}
                        {post.imageUrl ? (
                          <div className="space-y-2">
                            <img
                              src={post.imageUrl}
                              alt="Post image"
                              className="rounded-lg max-h-48 object-cover w-full"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Salve a mídia antes de publicar — ela será removida do servidor após publicação</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 text-xs h-7 px-2"
                                onClick={() => {
                                  const a = document.createElement("a");
                                  a.href = post.imageUrl!;
                                  const ext = post.mediaType === "video" ? "mp4" : "jpg";
                                  a.download = `post-${post.id}.${ext}`;
                                  a.click();
                                }}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Baixar
                              </Button>
                            </div>
                          </div>
                        ) : post.imagePrompt && post.status !== "published" ? (
                          <div className="rounded-lg p-3 space-y-1 border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Prompt da imagem (mídia expirada ou falhou):</p>
                            <p className="text-xs italic leading-relaxed" style={{ color: "var(--text-muted)" }}>{post.imagePrompt}</p>
                          </div>
                        ) : null}

                        {/* Sources */}
                        {post.sourcesComment && (
                          <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3">
                            <p className="text-xs text-blue-400 font-medium mb-1.5">
                              Fontes (publicar como 1º comentário):
                            </p>
                            <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                              {post.sourcesComment}
                            </p>
                          </div>
                        )}

                        {/* External link */}
                        {post.externalUrl && (
                          <a
                            href={post.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Ver post publicado
                          </a>
                        )}

                        {/* Actions */}
                        {post.status === "draft" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => publishPost(post)}
                              loading={publishing === post.id}
                              className="flex-1"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Aprovar e publicar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectPost(post)}
                              disabled={publishing === post.id}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Campaign Setup Modal */}
      <AnimatePresence>
        {showCampaignModal && (
          <CampaignSetupModal
            onConfirm={generateCampaign}
            onClose={() => setShowCampaignModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
