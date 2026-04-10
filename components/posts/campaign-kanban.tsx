"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Video,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Send,
  X,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface CampaignCard {
  id: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  cardType: string;
  content: string | null;
  mediaUrl: string | null;
  status: string;
  postId: string | null;
  chatHistory: ChatMessage[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface CampaignKanbanProps {
  cards: CampaignCard[];
  runId: string;
  projectId: string;
  onCardUpdated?: (cardId: string, newContent: string) => void;
}

const DAYS = [
  { key: 1, label: "Segunda", short: "Seg" },
  { key: 2, label: "Terça", short: "Ter" },
  { key: 3, label: "Quarta", short: "Qua" },
  { key: 4, label: "Quinta", short: "Qui" },
  { key: 5, label: "Sexta", short: "Sex" },
];

const AGENT_ROWS = [
  { agentId: "roberto-radar", label: "Roberto Radar", subtitle: "Pesquisa", color: "bg-blue-500", cardType: "research" },
  { agentId: "lucas-linkedin", label: "Lucas LinkedIn", subtitle: "Post LinkedIn", color: "bg-blue-700", cardType: "post_linkedin" },
  { agentId: "tiago-twitter", label: "Tiago Twitter", subtitle: "Thread X", color: "bg-sky-500", cardType: "post_twitter" },
  { agentId: "diana-design", label: "Diana Design", subtitle: "Mídia", color: "bg-purple-500", cardType: "media" },
  { agentId: "vera-veredito", label: "Vera Veredito", subtitle: "Preview", color: "bg-yellow-500", cardType: "preview" },
  { agentId: "paulo-publicador", label: "Paulo Publicador", subtitle: "Publicação", color: "bg-green-500", cardType: "publish" },
];

function AgentAvatar({ agentId, color, size = "sm" }: { agentId: string; color: string; size?: "sm" | "md" }) {
  const initials = agentId.split("-").map((w) => w[0].toUpperCase()).slice(0, 2).join("");
  return (
    <div className={cn("rounded-full flex items-center justify-center text-white font-bold shrink-0", color, size === "sm" ? "w-6 h-6 text-[10px]" : "w-8 h-8 text-xs")}>
      {initials}
    </div>
  );
}

function MediaPreview({ mediaUrl, cardType }: { mediaUrl: string | null; cardType: string }) {
  if (!mediaUrl) {
    if (cardType === "media") {
      return (
        <div className="w-full h-20 rounded-lg flex items-center justify-center text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <ImageIcon className="w-4 h-4 mr-1" /> Sem mídia gerada
        </div>
      );
    }
    return null;
  }

  const isVideo = mediaUrl.startsWith("data:video") || mediaUrl.includes("mp4");
  const isCarousel = mediaUrl.includes("|");

  if (isCarousel) {
    const slides = mediaUrl.split("|").slice(0, 3);
    return (
      <div className="flex gap-1 mt-2">
        {slides.map((src, i) => (
          <img key={i} src={src} alt={`Slide ${i + 1}`} className="flex-1 h-14 object-cover rounded" />
        ))}
        <div className="flex items-center justify-center w-6 shrink-0">
          <LayoutGrid className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative mt-2">
        <video src={mediaUrl} className="w-full h-20 object-cover rounded-lg" muted />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <Video className="w-5 h-5 text-white" />
        </div>
      </div>
    );
  }

  return <img src={mediaUrl} alt="Mídia gerada" className="w-full h-20 object-cover rounded-lg mt-2" />;
}

function SocialPreview({ content, platform, mediaUrl }: { content: string; platform: string; mediaUrl?: string | null }) {
  const isLinkedIn = platform === "post_linkedin";
  return (
    <div className="rounded-xl overflow-hidden border text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      {/* Profile header */}
      <div className="p-3 flex items-start gap-2">
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", isLinkedIn ? "bg-blue-600" : "bg-slate-800")}>
          {isLinkedIn ? "in" : "𝕏"}
        </div>
        <div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Seu Perfil</p>
          <p style={{ color: "var(--text-muted)" }}>{isLinkedIn ? "LinkedIn • Agora" : "@seuperfil · agora"}</p>
        </div>
      </div>
      {/* Content */}
      <div className="px-3 pb-2">
        <p className="leading-relaxed line-clamp-4" style={{ color: "var(--text-primary)" }}>{content}</p>
      </div>
      {mediaUrl && <MediaPreview mediaUrl={mediaUrl} cardType="media" />}
      {/* Engagement bar */}
      <div className="px-3 py-2 flex gap-4 border-t text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <span>👍 Curtir</span>
        <span>💬 Comentar</span>
        <span>↗️ Compartilhar</span>
      </div>
    </div>
  );
}

function KanbanCard({
  card,
  agentRow,
  allCards,
  projectId,
  onUpdate,
}: {
  card: CampaignCard | undefined;
  agentRow: typeof AGENT_ROWS[0];
  allCards: CampaignCard[];
  projectId: string;
  onUpdate: (cardId: string, content: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [localCard, setLocalCard] = useState(card);
  const [approving, setApproving] = useState(false);
  // Sync when the card prop changes — navigating between days reuses this component instance
  // without this, localCard keeps the previous day's dayOfWeek and shows the wrong image
  useEffect(() => { setLocalCard(card); }, [card]);

  if (!localCard) {
    return (
      <div className="rounded-xl border border-dashed h-24 flex items-center justify-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <Clock className="w-3 h-3 mr-1" /> Aguardando...
      </div>
    );
  }

  const mediaCard = allCards.find(
    (c) => c.cardType === "media" && c.dayOfWeek === localCard.dayOfWeek
  );

  async function sendChat() {
    if (!chatMsg.trim() || !localCard) return;
    setChatLoading(true);
    try {
      const res = await fetch(`/api/campaign-cards/${localCard.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatMsg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLocalCard((prev) => prev ? { ...prev, content: data.updatedContent ?? prev.content, chatHistory: data.chatHistory } : prev);
      onUpdate(localCard.id, data.updatedContent ?? localCard.content ?? "");
      setChatMsg("");
      toast.success("Post atualizado!");
    } catch {
      toast.error("Erro ao ajustar. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleApprove(approved: boolean) {
    if (!localCard?.postId) return;
    setApproving(true);
    try {
      const endpoint = approved ? `/api/posts/${localCard.postId}/publish` : `/api/posts/${localCard.postId}`;
      const method = approved ? "POST" : "PATCH";
      const body = approved ? undefined : JSON.stringify({ status: "rejected" });
      await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body });
      setLocalCard((prev) => prev ? { ...prev, status: approved ? "approved" : "rejected" } : prev);
      toast.success(approved ? "Post aprovado para publicação!" : "Post rejeitado.");
    } catch {
      toast.error("Erro. Tente novamente.");
    } finally {
      setApproving(false);
    }
  }

  const isPublish = localCard.cardType === "publish";
  const isPreview = localCard.cardType === "preview";
  const isMedia = localCard.cardType === "media";

  return (
    <div className="rounded-xl border overflow-hidden transition-all" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {/* Card header */}
      <div
        className="p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <AgentAvatar agentId={localCard.agentId} color={agentRow.color} />
          <div className="flex-1 min-w-0">
            {isMedia && localCard.mediaUrl ? (
              <MediaPreview mediaUrl={localCard.mediaUrl} cardType="media" />
            ) : (
              <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {localCard.content ?? "..."}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {localCard.status === "approved" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {localCard.status === "rejected" && <X className="w-3.5 h-3.5 text-red-400" />}
            {expanded ? <ChevronUp className="w-3 h-3" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
              {/* Full content */}
              {isPreview ? (
                <SocialPreview
                  content={localCard.content?.split("\n\n")[0]?.replace("LinkedIn:\n", "") ?? ""}
                  platform={localCard.cardType}
                  mediaUrl={mediaCard?.mediaUrl}
                />
              ) : isMedia ? (
                <div className="space-y-2 pt-2">
                  <MediaPreview mediaUrl={localCard.mediaUrl} cardType="media" />
                  {localCard.content && (
                    <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>
                      Prompt: {localCard.content.slice(0, 120)}...
                    </p>
                  )}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto pt-2">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
                    {localCard.content}
                  </p>
                </div>
              )}

              {/* Publish actions for Paulo's card */}
              {isPublish && localCard.postId && localCard.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleApprove(true)}
                    loading={approving}
                  >
                    <ThumbsUp className="w-3 h-3" />
                    Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleApprove(false)}
                    disabled={approving}
                  >
                    <ThumbsDown className="w-3 h-3" />
                    Rejeitar
                  </Button>
                </div>
              )}

              {/* Chat adjustment button */}
              {!isPublish && (
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-all"
                  style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
                >
                  <MessageCircle className="w-3 h-3" />
                  {chatOpen ? "Fechar ajuste" : `Pedir ajuste à IA${localCard.chatHistory?.length ? ` (${localCard.chatHistory.length / 2 | 0})` : ""}`}
                </button>
              )}

              {/* Chat panel */}
              <AnimatePresence>
                {chatOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="rounded-xl border overflow-hidden"
                    style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
                  >
                    {/* Chat history */}
                    {localCard.chatHistory && localCard.chatHistory.length > 0 && (
                      <div className="max-h-32 overflow-y-auto p-2 space-y-2 border-b" style={{ borderColor: "var(--border)" }}>
                        {localCard.chatHistory.map((msg, i) => (
                          <div key={i} className={cn("text-[10px] rounded px-2 py-1", msg.role === "user" ? "ml-4 bg-orange-500/10 text-orange-400" : "mr-4")} style={msg.role === "assistant" ? { color: "var(--text-primary)", background: "var(--bg-elevated)" } : undefined}>
                            {msg.content.slice(0, 200)}{msg.content.length > 200 ? "..." : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Input */}
                    <div className="flex items-center gap-2 p-2">
                      <input
                        className="flex-1 text-xs rounded-lg px-2 py-1.5 outline-none border"
                        style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        placeholder="Ex: Deixe mais direto, mude o tom..."
                        value={chatMsg}
                        onChange={(e) => setChatMsg(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                      />
                      <button
                        onClick={sendChat}
                        disabled={chatLoading || !chatMsg.trim()}
                        className="p-1.5 rounded-lg bg-orange-500 text-white disabled:opacity-50"
                      >
                        {chatLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CampaignKanban({ cards, runId, projectId, onCardUpdated }: CampaignKanbanProps) {
  const [localCards, setLocalCards] = useState(cards);

  function handleCardUpdate(cardId: string, content: string) {
    setLocalCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, content } : c)));
    onCardUpdated?.(cardId, content);
  }

  // Only show days that have cards
  const activeDays = DAYS.filter((d) => localCards.some((c) => c.dayOfWeek === d.key));

  if (activeDays.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Column headers */}
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: `180px repeat(${activeDays.length}, 1fr)` }}>
          <div /> {/* Agent label column */}
          {activeDays.map((day) => (
            <div key={day.key} className="text-center">
              <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
                {day.label}
              </span>
            </div>
          ))}
        </div>

        {/* Rows per agent */}
        <div className="space-y-2">
          {AGENT_ROWS.map((agentRow) => {
            const rowCards = localCards.filter((c) => c.agentId === agentRow.agentId);
            if (rowCards.length === 0) return null;

            return (
              <div key={agentRow.agentId} className="grid gap-2 items-start" style={{ gridTemplateColumns: `180px repeat(${activeDays.length}, 1fr)` }}>
                {/* Agent label */}
                <div className="flex items-center gap-2 py-2 pr-3">
                  <AgentAvatar agentId={agentRow.agentId} color={agentRow.color} size="md" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{agentRow.label}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{agentRow.subtitle}</p>
                  </div>
                </div>

                {/* Cards per day */}
                {activeDays.map((day) => {
                  const card = rowCards.find((c) => c.dayOfWeek === day.key);
                  return (
                    <KanbanCard
                      key={`${agentRow.agentId}-${day.key}`}
                      card={card}
                      agentRow={agentRow}
                      allCards={localCards}
                      projectId={projectId}
                      onUpdate={handleCardUpdate}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" /> Aprovado</span>
          <span className="flex items-center gap-1"><X className="w-3 h-3 text-red-400" /> Rejeitado</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Aguardando</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Clique no card para pedir ajustes via IA</span>
        </div>
      </div>
    </div>
  );
}
