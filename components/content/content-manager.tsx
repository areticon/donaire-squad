"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Sparkles, Loader2, CheckCircle2,
  X, Clock, MessageCircle, Send, ThumbsDown, Image as ImageIcon,
  Video, LayoutGrid, AlarmClock, Zap, Ban, RotateCcw, Download, AlertCircle,
  FileText, Search, Pencil, Globe, Bot, ShieldAlert,
  BarChart2, List, BookOpen, Archive, PieChart, Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { PipelineLive } from "@/components/posts/pipeline-live";
import { CampaignSetupModal, type CampaignConfig } from "@/components/posts/campaign-setup-modal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignCard {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  scheduledDate: string | null;
  cardType: string;
  mediaType?: string | null;
  content: string | null;
  mediaUrl: string | null;
  metadata?: unknown;
  status: string;
  postId: string | null;
  chatHistory: ChatMessage[];
  createdAt?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PipelineRun {
  id: string;
  status: string;
  topic: string | null;
  campaignMode: string;
  weekStart: string | null;
}

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
}

interface ContentManagerProps {
  projectId: string;
  projectName: string;
  initialCards: CampaignCard[];
  activeRun: PipelineRun | null;
  lastFailedRun: PipelineRun | null;
  socialAccounts: SocialAccount[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [
  { dayOfWeek: 1, label: "Segunda", short: "Seg" },
  { dayOfWeek: 2, label: "Terça", short: "Ter" },
  { dayOfWeek: 3, label: "Quarta", short: "Qua" },
  { dayOfWeek: 4, label: "Quinta", short: "Qui" },
  { dayOfWeek: 5, label: "Sexta", short: "Sex" },
  { dayOfWeek: 6, label: "Sábado", short: "Sáb" },
  { dayOfWeek: 7, label: "Domingo", short: "Dom" },
];

const AGENT_ROWS = [
  { agentId: "roberto-radar", label: "Roberto Radar", subtitle: "Pesquisa", color: "bg-blue-500", cardType: "research", icon: Search },
  { agentId: "lucas-linkedin", label: "Lucas LinkedIn", subtitle: "Post LinkedIn", color: "bg-blue-700", cardType: "post_linkedin", icon: Globe },
  { agentId: "tiago-twitter", label: "Tiago Twitter", subtitle: "Thread X", color: "bg-sky-500", cardType: "post_twitter", icon: Globe },
  { agentId: "diana-design", label: "Diana Design", subtitle: "Mídia", color: "bg-purple-500", cardType: "media", icon: ImageIcon },
  { agentId: "vera-veredito", label: "Vera Veredito", subtitle: "Preview", color: "bg-yellow-500", cardType: "preview", icon: FileText },
  { agentId: "paulo-publicador", label: "Paulo Publicador", subtitle: "Publicação", color: "bg-green-500", cardType: "publish", icon: Send },
];

const CARD_TYPE_LABELS: Record<string, string> = {
  research: "Pesquisa",
  post_linkedin: "Post LinkedIn",
  post_twitter: "Thread X",
  media: "Mídia",
  preview: "Preview",
  publish: "Publicação",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getUTCDay(); // use UTC day to avoid off-by-one on UTC-3 etc.
  const diff = day === 0 ? -6 : 1 - day;
  // Start from UTC midnight of the input date
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(base.getTime() + diff * 24 * 60 * 60 * 1000);
}

function addDays(d: Date, n: number): Date {
  // Use UTC-based arithmetic to avoid DST / timezone-offset issues
  const r = new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  return r;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function formatDayDate(monday: Date, dayOfWeek: number): string {
  const d = addDays(monday, dayOfWeek - 1);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function formatScheduledAt(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Small Components ──────────────────────────────────────────────────────────

function AgentAvatar({ agentId, color, size = "sm" }: { agentId: string; color: string; size?: "sm" | "md" | "lg" }) {
  const initials = agentId.split("-").map((w) => w[0].toUpperCase()).slice(0, 2).join("");
  return (
    <div className={cn(
      "rounded-full flex items-center justify-center text-white font-bold shrink-0",
      color,
      size === "sm" ? "w-6 h-6 text-[10px]" : size === "md" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"
    )}>
      {initials}
    </div>
  );
}

function CarouselSlider({
  slides,
  large,
  onSlideChange,
}: {
  slides: string[];
  large: boolean;
  onSlideChange?: (index: number) => void;
}) {
  const [current, setCurrent] = useState(0);

  function go(dir: number) {
    const next = (current + dir + slides.length) % slides.length;
    setCurrent(next);
    onSlideChange?.(next);
  }

  return (
    <div className="space-y-2 mt-1">
      {/* Main slide */}
      <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "1/1" }}>
        <img
          key={current}
          src={slides[current]}
          alt={`Slide ${current + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
        />
        {/* Slide number badge */}
        <span className="absolute top-2 right-2 text-xs bg-black/70 text-white px-2 py-0.5 rounded-full font-medium">
          {current + 1} / {slides.length}
        </span>
        {/* Nav arrows */}
        {slides.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Dot navigation + thumbnail strip */}
      <div className="flex items-center gap-1.5">
        {slides.map((src, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); onSlideChange?.(i); }}
            className="relative overflow-hidden rounded flex-shrink-0 transition-all"
            style={{
              width: large ? 56 : 36,
              height: large ? 56 : 36,
              border: i === current ? "2px solid var(--accent)" : "2px solid transparent",
              opacity: i === current ? 1 : 0.5,
            }}
          >
            <img src={src} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
        <span className="text-xs ml-auto flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <LayoutGrid className="w-3 h-3" /> {slides.length} slides
        </span>
      </div>

      {/* Slide label for chat context */}
      {large && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Slide {current + 1} selecionado — use o chat abaixo para pedir ajustes neste slide específico
        </p>
      )}
    </div>
  );
}

function MediaPreview({
  mediaUrl,
  cardType,
  large = false,
  onSlideChange,
}: {
  mediaUrl: string | null;
  cardType: string;
  large?: boolean;
  onSlideChange?: (index: number) => void;
}) {
  const [videoError, setVideoError] = useState(false);

  if (!mediaUrl) {
    if (cardType === "media") {
      return (
        <div className={cn("rounded-lg flex items-center justify-center text-xs gap-1", large ? "h-32" : "h-16")} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <ImageIcon className="w-4 h-4" /> Sem mídia
        </div>
      );
    }
    return null;
  }

  // Only treat as video if MIME type explicitly says so
  const isVideo = mediaUrl.startsWith("data:video/") ||
    (!mediaUrl.startsWith("data:") && (mediaUrl.toLowerCase().endsWith(".mp4") || mediaUrl.toLowerCase().endsWith(".webm")));

  // Carousel: multiple images joined by "|"
  const carouselSlides = mediaUrl.includes("|")
    ? mediaUrl.split("|").filter((s) => s.trim().length > 10)
    : null;

  if (carouselSlides && carouselSlides.length > 1) {
    if (large) {
      return <CarouselSlider slides={carouselSlides} large={large} onSlideChange={onSlideChange} />;
    }
    // Compact view in kanban card: show first slide with overlay
    return (
      <div className="relative overflow-hidden rounded-lg mt-1" style={{ height: 64 }}>
        <img src={carouselSlides[0]} alt="Carrossel" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <LayoutGrid className="w-4 h-4 text-white" />
          <span className="text-white text-xs ml-1">{carouselSlides.length} slides</span>
        </div>
      </div>
    );
  }
  if (isVideo && !videoError) {
    if (large) {
      return (
        <div className="mt-2 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "#000", maxHeight: 520 }}>
          <video
            key={mediaUrl}
            src={mediaUrl}
            controls
            playsInline
            muted
            autoPlay
            loop
            style={{ maxHeight: 520, maxWidth: "100%", width: "auto", display: "block", margin: "0 auto" }}
            onError={() => setVideoError(true)}
          />
        </div>
      );
    }
    return (
      <div className="relative mt-1 rounded-lg overflow-hidden" style={{ height: 64, background: "#000" }}>
        <video
          src={mediaUrl}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setVideoError(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <Video className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }
  if (isVideo && videoError) {
    return (
      <div className={cn("rounded-lg flex flex-col items-center justify-center text-xs gap-1", large ? "h-32" : "h-16")} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        <Video className="w-4 h-4" />
        <span>Vídeo expirado — regenere via chat</span>
      </div>
    );
  }
  if (large) {
    return (
      <div className="relative mt-1 rounded-xl overflow-hidden group cursor-zoom-in"
        onClick={() => {
          // Open image in a new tab using a blob URL (avoids data: navigation block)
          if (mediaUrl.startsWith("data:")) {
            const [header, base64] = mediaUrl.split(",");
            const mime = header.replace("data:", "").replace(";base64", "");
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
          } else {
            window.open(mediaUrl, "_blank");
          }
        }}
      >
        <img src={mediaUrl} alt="Mídia gerada" className="w-full h-auto object-contain rounded-xl" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" style={{ background: "rgba(0,0,0,0.35)" }}>
          <span className="text-white text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.5)" }}>Clique para ampliar</span>
        </div>
      </div>
    );
  }
  return <img src={mediaUrl} alt="Mídia gerada" className="w-full object-cover rounded-lg mt-1 h-16" />;
}

// ── KanbanCard (minimal — opens modal on click) ───────────────────────────────

function KanbanCard({
  card,
  agentRow,
  onOpenModal,
  compact,
}: {
  card: CampaignCard | undefined;
  agentRow: typeof AGENT_ROWS[0];
  onOpenModal: (card: CampaignCard, agentRow: typeof AGENT_ROWS[0]) => void;
  compact?: boolean;
}) {
  if (!card) {
    return (
      <div className="rounded-lg border border-dashed h-16 flex items-center justify-center" style={{ borderColor: "var(--border)" }}>
        <span className="text-[10px]" style={{ color: "var(--border)" }}>Vazio</span>
      </div>
    );
  }

  const isMedia = card.cardType === "media";
  const hasError = card.content?.startsWith("AVISO:");

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        "rounded-lg border cursor-pointer transition-all hover:shadow-md",
        compact ? "text-[9px]" : "",
        card.status === "approved" ? "border-green-500/40" : card.status === "rejected" ? "border-red-500/40" : ""
      )}
      style={{
        background: "var(--bg-card)",
        borderColor: card.status === "approved" ? undefined : card.status === "rejected" ? undefined : "var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
      onClick={() => onOpenModal(card, agentRow)}
    >
      <div className="p-2">
        <div className="flex items-start gap-1.5">
          <AgentAvatar agentId={card.agentId} color={agentRow.color} />
          <div className="flex-1 min-w-0">
            {isMedia && !hasError ? (
              <MediaPreview mediaUrl={card.mediaUrl} cardType="media" />
            ) : isMedia && hasError ? (
              <div className="h-16 rounded-lg flex items-center justify-center gap-1 border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                <ImageIcon className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Clique para gerar imagem</span>
              </div>
            ) : card.mediaType === "infographic" ? (
              <div className="flex items-center gap-1 py-2">
                <PieChart className="w-3 h-3 text-teal-400" />
                <span className="text-[10px] text-teal-400 font-medium">Infográfico</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>clique para ver</span>
              </div>
            ) : card.mediaType === "poll" ? (
              <div className="flex items-center gap-1 py-2">
                <BarChart2 className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-cyan-400 font-medium">Enquete</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.match(/PERGUNTA:\s*(.+)/)?.[1]?.slice(0, 30) ?? card.content?.slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : (card.mediaType === "thread" || card.cardType === "post_twitter") ? (
              <div className="flex items-center gap-1 py-1">
                <List className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] text-sky-400 font-medium">Thread</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.replace(/^\d+[\/\.\)]\s*/, "").slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : card.mediaType === "article" ? (
              <div className="flex items-center gap-1 py-1">
                <BookOpen className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-medium">Artigo</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : card.cardType === "preview" ? (
              <div className="flex items-center gap-1 py-1">
                <Eye className="w-3 h-3 text-yellow-400" />
                <span className="text-[10px] text-yellow-400 font-medium">Preview</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.status === "approved"
                    ? "✓ Aprovado"
                    : card.status === "rejected"
                    ? "✗ Reprovado"
                    : card.status === "needs_revision"
                    ? "⚠ Revisão"
                    : "Aguardando revisão"}
                </span>
              </div>
            ) : (
              <p className="line-clamp-2 leading-relaxed text-[10px]" style={{ color: "var(--text-primary)" }}>
                {card.content ?? "..."}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            {card.status === "approved" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
            {card.status === "rejected" && <X className="w-3 h-3 text-red-400" />}
            {card.cardType === "publish" && card.scheduledDate && (
              <span className="text-[9px] flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}>
                <AlarmClock className="w-2.5 h-2.5" />
                {new Date(card.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── SocialPostPreview ─────────────────────────────────────────────────────────

function SocialPostPreview({
  platform,
  content,
  imageUrl,
  scheduledAt,
}: {
  platform: string | null;
  content: string;
  imageUrl: string | null;
  scheduledAt: string | null;
}) {
  const isLinkedIn = platform === "linkedin";
  const isTwitter = platform === "twitter";

  // Extract links from content
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const links = content.match(urlRegex) ?? [];

  // Character count
  const maxChars = isTwitter ? 280 : 3000;
  const charCount = content.length;
  const overLimit = charCount > maxChars;

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
    >
      {/* Platform header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between text-xs"
        style={{
          background: isLinkedIn ? "rgba(10,102,194,0.15)" : isTwitter ? "rgba(29,155,240,0.15)" : "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          {isLinkedIn && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          )}
          {isTwitter && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1D9BF0">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          )}
          <span className="font-semibold" style={{ color: isLinkedIn ? "#0A66C2" : isTwitter ? "#1D9BF0" : "var(--text-primary)" }}>
            {isLinkedIn ? "LinkedIn" : isTwitter ? "X (Twitter)" : platform ?? "Plataforma"}
          </span>
        </div>
        {scheduledAt && (
          <span style={{ color: "var(--text-muted)" }}>
            Agendado: {new Date(scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Post body */}
      <div className="p-4 space-y-3">
        {/* Avatar + name mock */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: isLinkedIn ? "#0A66C2" : isTwitter ? "#1D9BF0" : "var(--accent)" }}>
            P
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Seu perfil</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {isLinkedIn ? "Profissional · 1ª" : isTwitter ? "@suaconta" : ""}
            </p>
          </div>
        </div>

        {/* Post text */}
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-primary)", maxHeight: 220, overflowY: "auto" }}
        >
          {content}
        </div>

        {/* Media preview (image or video) */}
        {imageUrl && imageUrl.length > 50 && (() => {
          const isVid = imageUrl.startsWith("data:video/") ||
            (!imageUrl.startsWith("data:") && (imageUrl.toLowerCase().includes(".mp4") || imageUrl.toLowerCase().includes(".webm")));
          if (isVid) {
            return (
              <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "#000", border: "1px solid var(--border)" }}>
                <video
                  key={imageUrl}
                  src={imageUrl}
                  controls
                  muted
                  playsInline
                  style={{ maxHeight: 300, maxWidth: "100%", width: "auto", display: "block", margin: "0 auto" }}
                />
              </div>
            );
          }
          return (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <img
                src={imageUrl}
                alt="Mídia do post"
                className="w-full object-cover"
                style={{ maxHeight: 260 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          );
        })()}

        {/* No media notice */}
        {!imageUrl && (
          <div className="rounded-lg p-3 flex items-center gap-2 text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Sem mídia — este post será publicado apenas com texto.</span>
          </div>
        )}

        {/* Links detected */}
        {links.length > 0 && (
          <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Links no post</p>
            {links.map((link, i) => (
              <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:underline truncate"
                style={{ color: isLinkedIn ? "#0A66C2" : isTwitter ? "#1D9BF0" : "var(--accent)" }}>
                <Globe className="w-3 h-3 shrink-0" />
                {link.slice(0, 60)}{link.length > 60 ? "..." : ""}
              </a>
            ))}
          </div>
        )}

        {/* Char count */}
        <div className="flex justify-end">
          <span className={`text-xs ${overLimit ? "text-red-400" : ""}`} style={overLimit ? {} : { color: "var(--text-muted)" }}>
            {charCount}/{maxChars} caracteres{overLimit ? " — EXCEDE O LIMITE" : ""}
          </span>
        </div>

        {/* Platform engagement mock */}
        <div className="flex items-center gap-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          {isLinkedIn && (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>👍 Curtir</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>💬 Comentar</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>🔁 Compartilhar</span>
            </>
          )}
          {isTwitter && (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>🔁 Repostar</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>❤️ Curtir</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>📊 Estatísticas</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PollPreview ────────────────────────────────────────────────────────────────

function PollPreview({
  content,
  metadata,
  platform,
}: {
  content: string;
  metadata?: Record<string, unknown> | null;
  platform?: string;
}) {
  const isLI = platform === "linkedin";

  // Prefer structured metadata, fallback to parsing content
  let question = (metadata?.question as string) ?? "";
  let options: string[] = (metadata?.options as string[]) ?? [];
  let intro = (metadata?.intro as string) ?? "";
  const duration = (metadata?.duration as string) ?? "THREE_DAYS";

  if (!question) {
    const lines = content.split("\n").map((l) => l.trim());
    const getLine = (prefix: string) =>
      lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";
    question = getLine("PERGUNTA:");
    intro = getLine("TEXTO_INTRO:") || getLine("TWEET:");
    options = ["OPCAO_1:", "OPCAO_2:", "OPCAO_3:", "OPCAO_4:"]
      .map((p) => getLine(p))
      .filter(Boolean);
  }

  const durationLabel: Record<string, string> = {
    ONE_DAY: "1 dia",
    THREE_DAYS: "3 dias",
    ONE_WEEK: "1 semana",
    TWO_WEEKS: "2 semanas",
  };

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: isLI ? "rgba(10,102,194,0.3)" : "rgba(29,155,240,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: isLI ? "rgba(10,102,194,0.1)" : "rgba(29,155,240,0.1)", borderColor: "var(--border)" }}>
        <BarChart2 className="w-3.5 h-3.5" style={{ color: isLI ? "#0A66C2" : "#1D9BF0" }} />
        <span className="font-semibold" style={{ color: isLI ? "#0A66C2" : "#1D9BF0" }}>
          Enquete {isLI ? "LinkedIn" : "X"} · dura {durationLabel[duration] ?? duration}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {intro && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{intro}</p>
        )}
        {question ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{question}</p>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="rounded-lg px-3 py-2 text-sm border flex items-center gap-2"
                  style={{ borderColor: isLI ? "rgba(10,102,194,0.4)" : "rgba(29,155,240,0.4)", color: "var(--text-primary)" }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: isLI ? "rgba(10,102,194,0.15)" : "rgba(29,155,240,0.15)", color: isLI ? "#0A66C2" : "#1D9BF0" }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </div>
              ))}
            </div>
          </>
        ) : (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-primary)", fontFamily: "inherit" }}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── ThreadPreview ──────────────────────────────────────────────────────────────

function ThreadPreview({ content }: { content: string }) {
  // Parse tweets from numbered format
  const tweets = content
    .split(/\n(?=\d+[\/\.\)]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = tweets.length >= 2
    ? tweets.map((t) => t.replace(/^\d+[\/\.\)]\s*/, "").trim())
    : content.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(29,155,240,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: "rgba(29,155,240,0.1)", borderColor: "var(--border)" }}>
        <List className="w-3.5 h-3.5 text-[#1D9BF0]" />
        <span className="font-semibold text-[#1D9BF0]">
          Thread X · {parsed.length} tweets
        </span>
      </div>
      <div className="p-3 space-y-0 max-h-80 overflow-y-auto">
        {parsed.map((tweet, i) => (
          <div key={i} className="flex gap-2 pb-3">
            {/* Thread line */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "#1D9BF0", fontSize: 10 }}>P</div>
              {i < parsed.length - 1 && (
                <div className="w-0.5 flex-1 mt-1" style={{ background: "rgba(29,155,240,0.3)", minHeight: 12 }} />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Seu perfil</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>@suaconta</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{i + 1}/{parsed.length}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {tweet.slice(0, 280)}
              </p>
              {tweet.length > 280 && (
                <span className="text-[10px] text-red-400">Excede 280 chars — será truncado</span>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>🔁 💬 ❤️</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ArticlePreview ─────────────────────────────────────────────────────────────

function ArticlePreview({ content }: { content: string }) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(10,102,194,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: "rgba(10,102,194,0.1)", borderColor: "var(--border)" }}>
        <BookOpen className="w-3.5 h-3.5 text-[#0A66C2]" />
        <span className="font-semibold text-[#0A66C2]">Artigo LinkedIn</span>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>{content.length} chars</span>
      </div>
      <div className="p-4 max-h-80 overflow-y-auto">
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
          {content}
        </p>
      </div>
    </div>
  );
}

// ── CardDetailModal (Trello-style) ────────────────────────────────────────────

interface CardDetailModalProps {
  card: CampaignCard;
  agentRow: typeof AGENT_ROWS[0];
  projectId: string;
  socialAccounts: SocialAccount[];
  onClose: () => void;
  onCardUpdate: (card: CampaignCard) => void;
  onWeekRefresh?: () => void;
  onRestartWithTopic?: (topic: string) => void;
}

function CardDetailModal({ card, agentRow, projectId, socialAccounts, onClose, onCardUpdate, onWeekRefresh, onRestartWithTopic }: CardDetailModalProps) {
  const [localCard, setLocalCard] = useState(card);
  const [chatMsg, setChatMsg] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [postScheduledAt, setPostScheduledAt] = useState<string | null>(null);
  const [postPlatform, setPostPlatform] = useState<string | null>(null);
  const [postContent, setPostContent] = useState<string | null>(null);
  const [postImageUrl, setPostImageUrl] = useState<string | null>(null);
  // All platform posts for the same day (linkedin + twitter)
  const [dayPosts, setDayPosts] = useState<Array<{
    id: string; platform: string; content: string;
    imageUrl: string | null; scheduledAt: string | null; status: string;
  }>>([]);
  const [loadingPost, setLoadingPost] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [newScheduleTime, setNewScheduleTime] = useState("09:00");
  const [rescheduling, setRescheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(localCard.content ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0); // for carousel navigation
  const [publishResult, setPublishResult] = useState<{
    platform: string;
    accountName: string;
    publishedAt: string;
    url: string | null;
  }[] | null>(null);

  const isMedia = localCard.cardType === "media";
  const isInfographic = isMedia && localCard.mediaType === "infographic";
  const isPublish = localCard.cardType === "publish";
  const hasError = localCard.content?.startsWith("AVISO:");

  useEffect(() => {
    if (isPublish && localCard.postId) {
      setLoadingPost(true);

      // Fetch the primary post (for scheduling info)
      fetch(`/api/posts/${localCard.postId}`)
        .then((r) => r.json())
        .then((data) => {
          setPostScheduledAt(data.post?.scheduledAt ?? null);
          setPostPlatform(data.post?.platform ?? null);
          setPostContent(data.post?.content ?? null);
          setPostImageUrl(data.post?.imageUrl ?? null);
        })
        .catch(() => {});

      // Fetch all posts for the same day (linkedin + twitter)
      fetch(`/api/posts/by-day?projectId=${projectId}&postId=${localCard.postId}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.posts)) setDayPosts(data.posts);
        })
        .catch(() => {})
        .finally(() => setLoadingPost(false));
    }
  }, [isPublish, localCard.postId, projectId]);

  async function sendChat() {
    if (!chatMsg.trim()) return;
    setChatLoading(true);
    try {
      const isCarousel = localCard.mediaUrl?.includes("|");
      const res = await fetch(`/api/campaign-cards/${localCard.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMsg,
          ...(isCarousel ? { slideIndex: currentSlide } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const updated: CampaignCard = {
        ...localCard,
        content: data.updatedContent ?? localCard.content,
        chatHistory: data.chatHistory,
        // For media cards, update mediaUrl if the API regenerated the image
        ...(data.updatedMediaUrl !== undefined ? { mediaUrl: data.updatedMediaUrl } : {}),
      };
      setLocalCard(updated);
      setEditedContent(updated.content ?? "");
      onCardUpdate(updated);
      setChatMsg("");

      if (data.updatedMediaUrl) {
        toast.success("Imagem regenerada com sucesso!");
      } else if (data.mediaError) {
        toast.error(`Prompt atualizado, mas imagem falhou: ${data.mediaError.slice(0, 80)}`);
      } else {
        toast.success("Ajuste aplicado!");
      }
    } catch {
      toast.error("Erro ao ajustar.");
    } finally {
      setChatLoading(false);
    }
  }

  async function saveEdit() {
    if (!editedContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/campaign-cards/${localCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedContent }),
      });
      if (!res.ok) throw new Error();
      const updated = { ...localCard, content: editedContent };
      setLocalCard(updated);
      onCardUpdate(updated);
      setEditing(false);
      toast.success("Conteúdo salvo!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function refreshDayPosts() {
    if (!localCard.postId) return;
    const r = await fetch(`/api/posts/by-day?projectId=${projectId}&postId=${localCard.postId}`);
    const data = await r.json();
    if (Array.isArray(data.posts)) setDayPosts(data.posts);
    const r2 = await fetch(`/api/posts/${localCard.postId}`);
    const d2 = await r2.json();
    setPostScheduledAt(d2.post?.scheduledAt ?? null);
  }

  function accountFor(platform: string) {
    return socialAccounts.find((a) => a.platform === platform);
  }

  async function publishNowPlatform(platform: "linkedin" | "twitter") {
    const p = dayPosts.find((x) => x.platform === platform);
    if (!p) {
      toast.error(`Não há post para ${platform === "linkedin" ? "LinkedIn" : "X"} neste dia.`);
      return;
    }
    const acc = accountFor(platform);
    if (!acc) {
      toast.error(`Conecte uma conta ${platform === "linkedin" ? "LinkedIn" : "X"} em Configurações.`);
      return;
    }
    setApproving(true);
    try {
      const res = await fetch(`/api/posts/${p.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao publicar");
      await refreshDayPosts();
      const updated = { ...localCard, status: "approved" as const };
      setLocalCard(updated);
      onCardUpdate(updated);
      setPublishResult([
        {
          platform,
          accountName: acc.displayName ?? platform,
          publishedAt: new Date().toISOString(),
          url: data.url ?? null,
        },
      ]);
      toast.success(platform === "linkedin" ? "Publicado no LinkedIn!" : "Publicado no X!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao publicar.");
    } finally {
      setApproving(false);
    }
  }

  async function publishNowBoth() {
    const li = dayPosts.find((x) => x.platform === "linkedin");
    const tw = dayPosts.find((x) => x.platform === "twitter");
    const results: { platform: string; accountName: string; publishedAt: string; url: string | null }[] = [];
    setApproving(true);
    try {
      if (li) {
        const acc = accountFor("linkedin");
        if (!acc) throw new Error("Conecte o LinkedIn.");
        const res = await fetch(`/api/posts/${li.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: acc.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro LinkedIn");
        results.push({
          platform: "linkedin",
          accountName: acc.displayName ?? "LinkedIn",
          publishedAt: new Date().toISOString(),
          url: data.url ?? null,
        });
      }
      if (tw) {
        const acc = accountFor("twitter");
        if (!acc) throw new Error("Conecte o X.");
        const res = await fetch(`/api/posts/${tw.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: acc.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro X");
        results.push({
          platform: "twitter",
          accountName: acc.displayName ?? "X",
          publishedAt: new Date().toISOString(),
          url: data.url ?? null,
        });
      }
      await refreshDayPosts();
      const updated = { ...localCard, status: "approved" as const };
      setLocalCard(updated);
      onCardUpdate(updated);
      setPublishResult(results);
      toast.success("Publicado nas redes!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao publicar.");
    } finally {
      setApproving(false);
    }
  }

  async function queuePlatform(platform: "linkedin" | "twitter") {
    const p = dayPosts.find((x) => x.platform === platform);
    if (!p) {
      toast.error("Post não encontrado para esta plataforma.");
      return;
    }
    setApproving(true);
    try {
      const res = await fetch(`/api/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao agendar");
      await refreshDayPosts();
      toast.success(
        platform === "linkedin"
          ? "LinkedIn aprovado — publicação automática no horário agendado."
          : "X aprovado — publicação automática no horário agendado."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setApproving(false);
    }
  }

  async function queueBoth() {
    setApproving(true);
    try {
      for (const platform of ["linkedin", "twitter"] as const) {
        const p = dayPosts.find((x) => x.platform === platform);
        if (!p) continue;
        const res = await fetch(`/api/posts/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "scheduled" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao agendar");
      }
      await refreshDayPosts();
      toast.success("LinkedIn e X na fila para o horário agendado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro.");
    } finally {
      setApproving(false);
    }
  }

  async function handleRestartCampaign() {
    if (!localCard.runId || !onRestartWithTopic) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/pipeline/status?runId=${localCard.runId}`);
      const data = await res.json();
      const t = data.topic as string | null | undefined;
      if (t) {
        onRestartWithTopic(t);
        onClose();
      } else {
        toast.error("Tema da campanha não encontrado.");
      }
    } catch {
      toast.error("Erro ao carregar o tema.");
    } finally {
      setApproving(false);
    }
  }

  async function handleArchiveCampaign() {
    if (!localCard.runId) return;
    if (!window.confirm("Arquivar esta campanha inteira? Ela some do quadro e vai para o arquivo (pode restaurar depois).")) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/pipeline/runs/${localCard.runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Campanha arquivada.");
      onWeekRefresh?.();
      onClose();
    } catch {
      toast.error("Não foi possível arquivar.");
    } finally {
      setApproving(false);
    }
  }

  async function handleArchivePost(platform: "linkedin" | "twitter") {
    const post = dayPosts.find((p) => p.platform === platform);
    if (!post) {
      toast.error(`Nenhum post de ${platform === "linkedin" ? "LinkedIn" : "X"} encontrado para este dia.`);
      return;
    }
    const label = platform === "linkedin" ? "LinkedIn" : "X (Twitter)";
    if (!window.confirm(`Arquivar o post de ${label} deste dia? Ele será cancelado mas a campanha continua.`)) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Post de ${label} arquivado.`);
      await refreshDayPosts();
    } catch {
      toast.error("Não foi possível arquivar o post.");
    } finally {
      setApproving(false);
    }
  }

  async function handleRejectFlow() {
    if (!localCard.postId) return;
    if (!showRejectForm) {
      setShowRejectForm(true);
      return;
    }
    setApproving(true);
    try {
      const ids = dayPosts.length > 0 ? dayPosts.map((p) => p.id) : [localCard.postId];
      for (const pid of ids) {
        await fetch(`/api/posts/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected" }),
        });
      }
      if (rejectReason.trim()) {
        await fetch(`/api/campaign-cards/${localCard.id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "rejection",
            reason: rejectReason,
            cardType: localCard.cardType,
          }),
        }).catch(() => {});
      }
      const updated = { ...localCard, status: "rejected" };
      setLocalCard(updated);
      onCardUpdate(updated);
      setShowRejectForm(false);
      setRejectReason("");
      toast.success("Post(s) rejeitado(s). Feedback salvo para melhorar próximas campanhas.");
    } catch {
      toast.error("Erro.");
    } finally {
      setApproving(false);
    }
  }

  async function handleCancelSchedule() {
    if (!localCard.postId) return;
    setApproving(true);
    try {
      const ids = dayPosts.length > 0 ? dayPosts.map((p) => p.id) : [localCard.postId];
      for (const pid of ids) {
        await fetch(`/api/posts/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelSchedule: true }),
        });
      }
      setPostScheduledAt(null);
      await refreshDayPosts();
      toast.success("Agendamento cancelado. Posts voltaram para rascunho.");
    } catch {
      toast.error("Erro.");
    } finally {
      setApproving(false);
    }
  }

  async function handleReschedule() {
    if (!newScheduleDate || !newScheduleTime) return;
    setRescheduling(true);
    try {
      const dt = new Date(`${newScheduleDate}T${newScheduleTime}:00`).toISOString();
      const ids = dayPosts.length > 0 ? dayPosts.map((p) => p.id) : localCard.postId ? [localCard.postId] : [];
      for (const pid of ids) {
        const res = await fetch(`/api/posts/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: dt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao reagendar");
      }
      await refreshDayPosts();
      setRescheduleOpen(false);
      toast.success("Reagendado com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reagendar.");
    } finally {
      setRescheduling(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 p-5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
            <AgentAvatar agentId={localCard.agentId} color={agentRow.color} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{localCard.agentName}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                  {CARD_TYPE_LABELS[localCard.cardType] ?? localCard.cardType}
                </span>
                {localCard.scheduledDate && (
                  <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    <AlarmClock className="w-3 h-3" />
                    {formatScheduledAt(localCard.scheduledDate)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {localCard.status === "approved" && <span className="text-xs flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> Aprovado</span>}
                {localCard.status === "rejected" && <span className="text-xs flex items-center gap-1 text-red-400"><X className="w-3 h-3" /> Rejeitado</span>}
                {localCard.status === "pending" && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Aguardando aprovação</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-all hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Content */}
            {isMedia ? (
              <div className="space-y-3">
                <MediaPreview
                  mediaUrl={localCard.mediaUrl}
                  cardType="media"
                  large
                  onSlideChange={setCurrentSlide}
                />
                {isInfographic && !hasError && localCard.mediaUrl ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <PieChart className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="text-teal-400 font-medium">Infográfico gerado pela IA</span>
                    </div>
                    <button
                      onClick={() => {
                        const url = localCard.mediaUrl!;
                        if (url.startsWith("data:")) {
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `infografico-${localCard.id}.png`;
                          a.click();
                        } else {
                          window.open(url, "_blank");
                        }
                      }}
                      className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg border hover:border-teal-500/50 hover:bg-teal-500/5 transition-all"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      <Download className="w-3 h-3" /> Baixar
                    </button>
                  </div>
                ) : hasError ? (
                  <div className="rounded-xl p-4 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--bg-elevated)" }}>
                        {isInfographic ? <PieChart className="w-4 h-4 text-teal-400" /> : <ImageIcon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {isInfographic ? "Infográfico não foi gerado desta vez" : "Imagem não foi gerada desta vez"}
                        </p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {isInfographic
                            ? "Use o chat abaixo para pedir à Diana para regenerar o infográfico com mais detalhes sobre o conteúdo."
                            : "Use o campo de chat abaixo para descrever como você quer a imagem — a Diana vai gerá-la agora mesmo."}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Ex: {isInfographic ? <em>"refaça o infográfico destacando os 3 principais dados do post"</em> : <em>"fundo azul com gráficos modernos, estilo corporativo"</em>}</span>
                    </div>
                  </div>
                ) : localCard.content ? (
                  <div className="rounded-xl p-3 border space-y-1" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Prompt visual</p>
                    <p className="text-sm leading-relaxed italic" style={{ color: "var(--text-primary)" }}>{localCard.content}</p>
                    {localCard.mediaUrl && (
                      <button
                        onClick={() => {
                          const url = localCard.mediaUrl!;
                          const isVid = url.includes("mp4") || url.startsWith("data:video");
                          const ext = isVid ? "mp4" : url.startsWith("data:image/png") ? "png" : "jpg";
                          if (url.startsWith("data:")) {
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `media-${localCard.id}.${ext}`;
                            a.click();
                          } else {
                            window.open(url, "_blank");
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs mt-2 px-3 py-1.5 rounded-lg border hover:border-orange-500/50 transition-all"
                        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                      >
                        <Download className="w-3 h-3" /> Baixar mídia
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Conteúdo</p>
                  {!editing && localCard.cardType !== "preview" && localCard.cardType !== "publish" && (
                    <button
                      onClick={() => { setEditing(true); setEditedContent(localCard.content ?? ""); }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-white/5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={12}
                      className="w-full text-sm px-4 py-3 rounded-xl border outline-none resize-none leading-relaxed"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                      <Button size="sm" onClick={saveEdit} loading={savingEdit}>Salvar</Button>
                    </div>
                  </div>
                ) : localCard.mediaType === "poll" && localCard.content ? (
                  <PollPreview
                    content={localCard.content}
                    metadata={localCard.metadata as Record<string, unknown> | null | undefined}
                    platform={localCard.cardType === "post_linkedin" ? "linkedin" : "twitter"}
                  />
                ) : (localCard.mediaType === "thread" || localCard.cardType === "post_twitter") && localCard.content ? (
                  <ThreadPreview content={localCard.content} />
                ) : localCard.mediaType === "article" && localCard.content ? (
                  <ArticlePreview content={localCard.content} />
                ) : (
                  <div
                    className="rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed"
                    style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: 100 }}
                  >
                    {localCard.content ?? "..."}
                  </div>
                )}
              </div>
            )}

            {/* Full post preview for Paulo's publish card */}
            {isPublish && (
              <div className="space-y-3">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Globe className="w-3.5 h-3.5" />
                  Preview completo do post
                </p>
                {loadingPost ? (
                  <div className="rounded-xl p-6 flex items-center justify-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : dayPosts.length > 0 ? (
                  // Show preview for each platform (linkedin + twitter)
                  <div className="space-y-3">
                    {dayPosts.map((p) => {
                      const mt = (p as { mediaType?: string }).mediaType;
                      if (mt === "poll") return <PollPreview key={p.id} content={p.content} platform={p.platform} />;
                      if (mt === "thread" || p.platform === "twitter") return <ThreadPreview key={p.id} content={p.content} />;
                      if (mt === "article") return <ArticlePreview key={p.id} content={p.content} />;
                      return (
                        <SocialPostPreview
                          key={p.id}
                          platform={p.platform}
                          content={p.content}
                          imageUrl={p.imageUrl}
                          scheduledAt={p.scheduledAt ?? postScheduledAt}
                        />
                      );
                    })}
                  </div>
                ) : postContent ? (
                  <SocialPostPreview
                    platform={postPlatform}
                    content={postContent}
                    imageUrl={postImageUrl}
                    scheduledAt={postScheduledAt}
                  />
                ) : (
                  <div className="rounded-xl p-4 text-sm text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    Posts não encontrados — execute uma nova campanha
                  </div>
                )}
              </div>
            )}

            {/* Publish card actions */}
            {isPublish && (
              <div className="space-y-3">
                {/* Scheduled time banner */}
                <div
                  className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  {loadingPost ? (
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                    </div>
                  ) : postScheduledAt ? (
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Publicação agendada</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatScheduledAt(postScheduledAt)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sem horário definido</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setRescheduleOpen(!rescheduleOpen)}
                    disabled={approving}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:border-blue-500/50 hover:bg-blue-500/8 shrink-0"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reagendar
                  </button>
                </div>

                {localCard.status !== "approved" && localCard.postId && (
                  <div className="space-y-2">
                    {/* ── Banner: campanha rejeitada ── */}
                    {localCard.status === "rejected" && (
                      <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 border border-red-500/30" style={{ background: "rgba(239,68,68,0.06)" }}>
                        <X className="w-4 h-4 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-red-400">Campanha rejeitada</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Use as ações abaixo para recomeçar, arquivar ou ajustar o agendamento.</p>
                        </div>
                      </div>
                    )}

                    {/* ── Aprovar (agendar) — só se não estiver rejeitado ── */}
                    {localCard.status !== "rejected" && <div
                      className="rounded-xl overflow-hidden border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div
                        className="flex items-center gap-2 px-4 py-2.5"
                        style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}
                      >
                        <AlarmClock className="w-3.5 h-3.5 text-orange-400" />
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                          Aprovar — publicar no horário agendado
                        </p>
                      </div>
                      <div className="grid grid-cols-3" style={{ borderTop: "none" }}>
                        {/* LinkedIn */}
                        <button
                          type="button"
                          disabled={approving || !dayPosts.some((p) => p.platform === "linkedin")}
                          onClick={() => void queuePlatform("linkedin")}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all group disabled:opacity-40"
                          style={{ background: "var(--bg-primary)", borderRight: "1px solid var(--border)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(10,102,194,0.08)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-primary)"; }}
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          <span className="text-[10px] font-semibold" style={{ color: "#0A66C2" }}>LinkedIn</span>
                        </button>
                        {/* X */}
                        <button
                          type="button"
                          disabled={approving || !dayPosts.some((p) => p.platform === "twitter")}
                          onClick={() => void queuePlatform("twitter")}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all group disabled:opacity-40"
                          style={{ background: "var(--bg-primary)", borderRight: "1px solid var(--border)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(29,155,240,0.08)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-primary)"; }}
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>X (Twitter)</span>
                        </button>
                        {/* Ambos */}
                        <button
                          type="button"
                          disabled={approving || dayPosts.length === 0}
                          onClick={() => void queueBoth()}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all group disabled:opacity-40"
                          style={{ background: "var(--bg-primary)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(249,115,22,0.08)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-primary)"; }}
                        >
                          <div className="flex -space-x-1.5">
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--text-primary)" }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          </div>
                          <span className="text-[10px] font-semibold text-orange-400">Ambas</span>
                        </button>
                      </div>
                    </div>}

                    {/* ── Publicar agora — só se não estiver rejeitado ── */}
                    {localCard.status !== "rejected" && <div
                      className="rounded-xl overflow-hidden border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div
                        className="flex items-center gap-2 px-4 py-2.5"
                        style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}
                      >
                        <Zap className="w-3.5 h-3.5 text-orange-400" />
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                          Publicar agora — link ao concluir
                        </p>
                      </div>
                      <div className="grid grid-cols-3" style={{ borderColor: "var(--border)" }}>
                        {/* LinkedIn now */}
                        <button
                          type="button"
                          disabled={approving || !dayPosts.some((p) => p.platform === "linkedin") || !accountFor("linkedin")}
                          onClick={() => void publishNowPlatform("linkedin")}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all disabled:opacity-40"
                          style={{ background: "var(--bg-primary)", borderRight: "1px solid var(--border)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(10,102,194,0.12)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-primary)"; }}
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          <span className="text-[10px] font-semibold" style={{ color: "#0A66C2" }}>LinkedIn</span>
                        </button>
                        {/* X now */}
                        <button
                          type="button"
                          disabled={approving || !dayPosts.some((p) => p.platform === "twitter") || !accountFor("twitter")}
                          onClick={() => void publishNowPlatform("twitter")}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all disabled:opacity-40"
                          style={{ background: "var(--bg-primary)", borderRight: "1px solid var(--border)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(29,155,240,0.12)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-primary)"; }}
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>X (Twitter)</span>
                        </button>
                        {/* Ambas now */}
                        <button
                          type="button"
                          disabled={approving || dayPosts.length === 0}
                          onClick={() => void publishNowBoth()}
                          className="flex flex-col items-center gap-2 py-4 px-3 transition-all disabled:opacity-40"
                          style={{ background: "rgba(249,115,22,0.06)" }}
                          onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(249,115,22,0.14)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(249,115,22,0.06)"; }}
                        >
                          <div className="flex -space-x-1.5">
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--text-primary)" }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          </div>
                          <span className="text-[10px] font-semibold text-orange-400">Ambas</span>
                        </button>
                      </div>
                    </div>}

                    {/* ── Ações secundárias — visíveis mesmo quando rejeitado ── */}
                    <div className="space-y-2">
                      {/* Linha 1: Recomeçar */}
                      {onRestartWithTopic && (
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleRestartCampaign()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all hover:border-orange-500/40 hover:bg-orange-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                          Recomeçar com tema
                        </button>
                      )}

                      {/* Linha 2: Arquivar post LinkedIn / Arquivar post X */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleArchivePost("linkedin")}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-blue-500/30 hover:bg-blue-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Archive className="w-3 h-3 text-blue-400" />
                          Arquivar LinkedIn
                        </button>
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleArchivePost("twitter")}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-sky-500/30 hover:bg-sky-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Archive className="w-3 h-3 text-sky-400" />
                          Arquivar X
                        </button>
                      </div>

                      {/* Linha 3: Arquivar campanha + Cancelar agendamento */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleArchiveCampaign()}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-zinc-500/40 hover:bg-zinc-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Archive className="w-3 h-3" />
                          Arquivar campanha
                        </button>
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleCancelSchedule()}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-red-500/40 hover:bg-red-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Ban className="w-3 h-3 text-red-400" />
                          Cancelar agendamento
                        </button>
                      </div>
                    </div>

                    {/* ── Reagendar expandido ── */}
                    <AnimatePresence>
                      {rescheduleOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-xl border p-3 space-y-2"
                          style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                        >
                          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Nova data e horário de publicação</p>
                          <div className="flex gap-2">
                            <input
                              type="date"
                              className="flex-1 text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={newScheduleDate}
                              onChange={(e) => setNewScheduleDate(e.target.value)}
                            />
                            <input
                              type="time"
                              className="w-32 text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={newScheduleTime}
                              onChange={(e) => setNewScheduleTime(e.target.value)}
                            />
                            <Button size="sm" onClick={handleReschedule} loading={rescheduling} disabled={!newScheduleDate}>
                              Salvar
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Rejeitar ── */}
                    {localCard.status === "pending" && (
                      <div className="space-y-2">
                        <AnimatePresence>
                          {showRejectForm && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-xl border p-3 space-y-2"
                              style={{ background: "var(--bg-primary)", borderColor: "rgba(245,158,11,0.3)" }}
                            >
                              <div className="flex items-center gap-2 text-sm text-amber-400">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                <span className="font-medium">Motivo da rejeição</span>
                              </div>
                              <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="Ex: sem imagem, tom muito formal, dados sem fonte, fora do nicho..."
                                className="w-full text-sm px-3 py-2 rounded-xl border outline-none resize-none"
                                style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                              />
                              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                O feedback ajuda a IA a melhorar as próximas campanhas.
                              </p>
                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" className="flex-1" onClick={() => void handleRejectFlow()} loading={approving}>
                                  <ThumbsDown className="w-3.5 h-3.5 mr-1" /> Confirmar rejeição
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason(""); }}>
                                  Cancelar
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {!showRejectForm && (
                          <button
                            type="button"
                            disabled={approving}
                            onClick={() => void handleRejectFlow()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all hover:border-red-500/40 hover:bg-red-500/5 disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
                            Rejeitar posts
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Chat / AI adjustment */}
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
                {isMedia ? "Regenerar mídia via IA" : "Ajustar via IA"}
              </p>
              {isMedia && !localCard.mediaUrl && (
                <div className="text-xs rounded-xl px-3 py-2 flex items-start gap-2 border border-blue-500/20 bg-blue-500/5">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span style={{ color: "var(--text-muted)" }}>
                    Digite abaixo como quer a imagem (estilo, cores, composição) e pressione Enter — a Diana vai gerar a imagem agora.
                  </span>
                </div>
              )}

              {localCard.chatHistory?.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {localCard.chatHistory.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-xs px-3 py-2 rounded-xl leading-relaxed",
                        m.role === "user" ? "ml-6 bg-orange-500/10 text-orange-300" : "mr-6"
                      )}
                      style={m.role === "assistant" ? { background: "var(--bg-elevated)", color: "var(--text-primary)" } : undefined}
                    >
                      <span className="font-medium opacity-60 text-[10px] block mb-0.5">{m.role === "user" ? "Você" : localCard.agentName}</span>
                      {m.content}
                    </div>
                  ))}
                </div>
              )}

              {/* Carousel slide context indicator */}
              {isMedia && localCard.mediaUrl?.includes("|") && (
                <div className="flex items-center gap-1.5 text-xs px-1" style={{ color: "var(--text-muted)" }}>
                  <LayoutGrid className="w-3 h-3" />
                  Pedido de ajuste afetará o slide {currentSlide + 1} selecionado
                </div>
              )}

              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  placeholder={
                    isMedia && localCard.mediaUrl?.includes("|")
                      ? `Ajustar slide ${currentSlide + 1}: mude a composição, cor, estilo...`
                      : isMedia
                      ? "Mude as cores, estilo, composição... (vai regerar a imagem)"
                      : "Melhore o tom, ajuste o CTA, torne mais provocativo..."
                  }
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                />
                <Button onClick={sendChat} loading={chatLoading} disabled={!chatMsg.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── Publish Success Overlay ── */}
          <AnimatePresence>
            {publishResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6 rounded-2xl"
                style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="w-full max-w-md space-y-4"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                      style={{ background: "rgba(34,197,94,0.2)", border: "2px solid rgb(34,197,94)" }}>
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Publicado com sucesso!</h3>
                    <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                      Seu conteúdo está no ar
                    </p>
                  </div>

                  <div className="space-y-3">
                    {publishResult.map((r, i) => (
                      <div key={i} className="rounded-xl p-4 space-y-2"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2">
                          {r.platform === "linkedin" && (
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#0A66C2">
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          )}
                          {r.platform === "twitter" && (
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#1D9BF0">
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                          )}
                          <span className="font-semibold text-white text-sm">{r.accountName}</span>
                        </div>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Publicado em {new Date(r.publishedAt).toLocaleDateString("pt-BR", {
                            day: "2-digit", month: "long", year: "numeric",
                          })} às {new Date(r.publishedAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                            style={{ background: r.platform === "linkedin" ? "#0A66C2" : "#1D9BF0", color: "white" }}
                          >
                            <Globe className="w-3 h-3" /> Ver post publicado
                          </a>
                        ) : (
                          <p className="text-xs text-amber-400">Link não disponível — verifique diretamente na plataforma.</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => { setPublishResult(null); onClose(); }}
                  >
                    Fechar
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ContentManager({ projectId, projectName, initialCards, activeRun, lastFailedRun, socialAccounts }: ContentManagerProps) {
  const [selectedMonday, setSelectedMonday] = useState<Date>(getMonday(new Date()));
  const [cards, setCards] = useState<CampaignCard[]>(initialCards);
  const [loadingCards, setLoadingCards] = useState(false);
  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(activeRun?.status === "running" ? activeRun.id : null);
  const [generating, setGenerating] = useState(activeRun?.status === "running");
  const [showSetupModal, setShowSetupModal] = useState(false);
  // Topic flow state
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<Array<{ title: string; description: string; format: string }>>([]);
  const [modalCard, setModalCard] = useState<CampaignCard | null>(null);
  const [modalAgentRow, setModalAgentRow] = useState<typeof AGENT_ROWS[0] | null>(null);

  const weekStartIso = toIsoDate(selectedMonday);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // pendingConfig is set by the modal; startCampaign uses it + topic
  const [pendingConfig, setPendingConfig] = useState<CampaignConfig | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedRuns, setArchivedRuns] = useState<
    Array<{ id: string; topic: string | null; weekStart: string | null; startedAt: string }>
  >([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [restoreRunId, setRestoreRunId] = useState<string | null>(null);
  const [restoreWeekStart, setRestoreWeekStart] = useState("");
  const [restoreDays, setRestoreDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [restoring, setRestoring] = useState(false);
  // Persist dismissed state in localStorage keyed by run ID so it survives page reloads
  const DISMISSED_KEY = lastFailedRun ? `banner-dismissed-${lastFailedRun.id}` : null;
  const [failedBannerDismissed, setFailedBannerDismissed] = useState<boolean>(() => {
    if (!lastFailedRun) return true;
    try { return localStorage.getItem(`banner-dismissed-${lastFailedRun.id}`) === "1"; } catch { return false; }
  });

  function dismissFailedBanner() {
    setFailedBannerDismissed(true);
    if (DISMISSED_KEY) {
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
    }
  }

  const loadCardsForWeek = useCallback(async (mondayIso: string) => {
    setLoadingCards(true);
    try {
      const res = await fetch(`/api/pipeline/status?projectId=${projectId}&weekStart=${mondayIso}`);
      const data = await res.json();
      setCards(data.cards ?? []);
    } catch {
      // silent
    } finally {
      setLoadingCards(false);
    }
  }, [projectId]);

  // Load on week change
  useEffect(() => {
    loadCardsForWeek(weekStartIso);
  }, [weekStartIso, loadCardsForWeek]);

  // Real-time polling while pipeline is running
  useEffect(() => {
    if (!generating) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    pollingRef.current = setInterval(() => {
      loadCardsForWeek(weekStartIso);
    }, 4000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [generating, weekStartIso, loadCardsForWeek]);

  function prevWeek() { setSelectedMonday((d) => addDays(d, -7)); }
  function nextWeek() { setSelectedMonday((d) => addDays(d, 7)); }
  function goToThisWeek() { setSelectedMonday(getMonday(new Date())); }

  async function suggestTopics() {
    setLoadingTopics(true);
    setSuggestedTopics([]);
    try {
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestedTopics(data.topics ?? []);
    } catch {
      toast.error("Erro ao buscar sugestões.");
    } finally {
      setLoadingTopics(false);
    }
  }

  function openNewCampaign() {
    setShowTopicInput(true);
    setSuggestedTopics([]);
  }

  async function openArchive() {
    setArchiveOpen(true);
    setRestoreRunId(null);
    setLoadingArchive(true);
    try {
      const res = await fetch(`/api/pipeline/runs?projectId=${projectId}&archivedOnly=true`);
      const data = await res.json();
      setArchivedRuns(data.runs ?? []);
    } catch {
      toast.error("Erro ao carregar arquivo.");
    } finally {
      setLoadingArchive(false);
    }
  }

  async function fillLastTopic() {
    try {
      const res = await fetch(`/api/pipeline/runs?projectId=${projectId}`);
      const data = await res.json();
      const run = (data.runs as Array<{ topic: string | null }> | undefined)?.find((r) => r.topic);
      if (run?.topic) {
        setTopic(run.topic);
        setShowTopicInput(true);
        setSuggestedTopics([]);
        toast.success("Tema carregado — ajuste se quiser e configure a campanha.");
      } else {
        toast.error("Nenhuma campanha com tema encontrada.");
      }
    } catch {
      toast.error("Erro ao buscar tema.");
    }
  }

  async function handleArchiveWeek() {
    // Collect unique runIds from all cards visible in the current week
    const runIds = [...new Set(weekCards.map((c) => c.runId).filter(Boolean))] as string[];
    if (runIds.length === 0) {
      toast("Nenhuma campanha para arquivar nesta semana.");
      return;
    }
    const plural = runIds.length > 1 ? `${runIds.length} campanhas` : "1 campanha";
    if (!window.confirm(`Arquivar ${plural} desta semana? Elas saem do quadro e ficam disponíveis em "Arquivo" para restaurar depois.`)) return;

    try {
      await Promise.all(
        runIds.map((id) =>
          fetch(`/api/pipeline/runs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archiveWeek: true, weekStart: weekStartIso }),
          })
        )
      );
      toast.success(`${plural} arquivada${runIds.length > 1 ? "s" : ""}.`);
      dismissFailedBanner();
      await loadCardsForWeek(weekStartIso);
    } catch {
      toast.error("Erro ao arquivar.");
    }
  }

  async function cancelGeneration() {
    if (!runningPipelineId) return;
    if (!window.confirm("Cancelar a geração da campanha? Os posts já criados serão mantidos, mas a IA vai parar agora.")) return;
    try {
      const res = await fetch(`/api/pipeline/runs/${runningPipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Erro ao cancelar.");
        return;
      }
      setGenerating(false);
      setRunningPipelineId(null);
      toast.success("Geração cancelada. Os posts gerados até agora foram salvos.");
      await loadCardsForWeek(weekStartIso);
    } catch {
      toast.error("Erro ao cancelar.");
    }
  }

  function toggleRestoreDay(d: number) {
    setRestoreDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  async function submitRestore() {
    if (!restoreRunId || !restoreWeekStart) {
      toast.error("Escolha a semana e pelo menos um dia.");
      return;
    }
    if (restoreDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana.");
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch(`/api/pipeline/runs/${restoreRunId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archived: false,
          weekStart: restoreWeekStart,
          activeDays: restoreDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast.success("Campanha restaurada no quadro.");
      setArchiveOpen(false);
      setRestoreRunId(null);
      await loadCardsForWeek(weekStartIso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao restaurar.");
    } finally {
      setRestoring(false);
    }
  }

  function handleTopicConfirmed() {
    if (!topic.trim()) {
      toast.error("Digite o tema da campanha.");
      return;
    }
    // Topic is ready → open campaign config modal
    setShowSetupModal(true);
  }

  async function startCampaign(config: CampaignConfig) {
    setShowSetupModal(false);
    setShowTopicInput(false);
    setSuggestedTopics([]);

    const finalConfig: CampaignConfig = { ...config, weekStart: weekStartIso };

    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, topic, campaignConfig: finalConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRunningPipelineId(data.run.id);
      setGenerating(true);
      setPendingConfig(null);
      toast.success("Campanha iniciada!");
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : "tente novamente"}`);
    }
  }

  function handleSetupConfirm(config: CampaignConfig) {
    // Modal closed — start campaign immediately (topic is already set)
    setPendingConfig(config);
    startCampaign(config);
  }

  function handleOpenModal(card: CampaignCard, agentRow: typeof AGENT_ROWS[0]) {
    setModalCard(card);
    setModalAgentRow(agentRow);
  }

  function handleCardUpdate(updatedCard: CampaignCard) {
    setCards((prev) => prev.map((c) => c.id === updatedCard.id ? updatedCard : c));
    setModalCard(updatedCard);
  }

  const todayIso = toIsoDate(new Date()); // UTC date of today
  const isCurrentWeek = toIsoDate(selectedMonday) === toIsoDate(getMonday(new Date()));

  // Filter cards for the selected week
  const weekCards = cards.filter((c) => {
    if (!c.scheduledDate) return false;
    const dIso = toIsoDate(new Date(c.scheduledDate));
    const start = weekStartIso;
    const end = toIsoDate(addDays(selectedMonday, 6));
    return dIso >= start && dIso <= end;
  });

  const activeDays = DAYS;

  return (
    <div className="w-full space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Gestor de Conteúdo</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{projectName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-2 rounded-lg border transition-all hover:border-orange-500" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatWeekLabel(selectedMonday)}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {isCurrentWeek ? "Semana atual" : `Semana ${Math.ceil((selectedMonday.getTime() - new Date(selectedMonday.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`}
            </p>
          </div>
          <button onClick={nextWeek} className="p-2 rounded-lg border transition-all hover:border-orange-500" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && (
            <button onClick={goToThisWeek} className="text-xs px-3 py-1.5 rounded-lg border transition-all" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Hoje
            </button>
          )}
          <Button variant="outline" onClick={() => void fillLastTopic()} disabled={generating} title="Reutiliza o tema da última campanha">
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Último tema</span>
          </Button>
          {/* Archive week — only shown when there are cards in the current view */}
          {weekCards.length > 0 && !generating && (
            <Button
              variant="outline"
              onClick={() => void handleArchiveWeek()}
              title="Arquiva todas as campanhas desta semana (pode restaurar depois)"
              className="border-zinc-600/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
            >
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Limpar semana</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => void openArchive()}
            disabled={generating}
            title="Campanhas arquivadas: restaurar ou só consultar"
            aria-label="Abrir arquivo de campanhas"
          >
            <Archive className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Arquivo</span>
          </Button>
          {generating ? (
            <div className="flex items-center gap-2 ml-0 sm:ml-1">
              <Button disabled className="opacity-70 cursor-not-allowed">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </Button>
              <Button
                variant="outline"
                onClick={() => void cancelGeneration()}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
              >
                <X className="w-4 h-4" />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button onClick={openNewCampaign} className="ml-0 sm:ml-1" disabled={showTopicInput}>
              <Sparkles className="w-4 h-4" />
              Nova campanha
            </Button>
          )}
        </div>
      </div>

      {/* Failed / cancelled run banner */}
      <AnimatePresence>
        {!generating && lastFailedRun && !failedBannerDismissed && (
          <motion.div
            key="failed-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-300">
                {lastFailedRun.status === "cancelled" ? "Geração cancelada" : "Geração interrompida"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {lastFailedRun.status === "cancelled"
                  ? "Você cancelou a geração. Os posts já criados foram mantidos."
                  : "A geração parou (timeout, troca de aba ou erro). Os posts já criados foram mantidos. Você pode gerar novamente com o mesmo tema."}
                {lastFailedRun.topic ? <><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>Tema: {lastFailedRun.topic}</span></> : null}
              </p>
            </div>
            {lastFailedRun.status !== "cancelled" && lastFailedRun.topic && (
              <button
                onClick={() => {
                  setTopic(lastFailedRun.topic ?? "");
                  openNewCampaign();
                }}
                className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            )}
            {/* Dismiss button */}
            <button
              onClick={() => dismissFailedBanner()}
              title="Fechar"
              className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Topic input with AI suggestions (shown BEFORE campaign modal) */}
      <AnimatePresence>
        {showTopicInput && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border p-5 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o tema da campanha?</p>
              <button onClick={() => { setShowTopicInput(false); setSuggestedTopics([]); setTopic(""); }} style={{ color: "var(--text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none"
                style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                placeholder="Ex: O custo real de não automatizar processos em 2025..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && handleTopicConfirmed()}
                autoFocus
              />
              <Button variant="outline" onClick={suggestTopics} loading={loadingTopics} disabled={loadingTopics}>
                <Bot className="w-4 h-4" /> Sugerir
              </Button>
              <Button onClick={handleTopicConfirmed} disabled={!topic.trim()}>
                <Sparkles className="w-3.5 h-3.5" /> Configurar
              </Button>
            </div>

            {loadingTopics && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Buscando temas em alta para seu nicho...
              </div>
            )}

            {suggestedTopics.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Sugestões da IA — clique para usar:</p>
                {suggestedTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setTopic(t.title); setSuggestedTopics([]); }}
                    className="w-full text-left p-3 rounded-xl border hover:border-orange-500/40 hover:bg-orange-500/5 transition-all group"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium group-hover:text-orange-400 transition-colors" style={{ color: "var(--text-primary)" }}>{t.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded shrink-0 capitalize" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{t.format}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanban grid */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${180 + activeDays.length * 160}px` }}>
            {/* Day headers */}
            <div className="grid border-b" style={{ gridTemplateColumns: `180px repeat(${activeDays.length}, 1fr)`, borderColor: "var(--border)" }}>
              <div className="p-3 flex items-center">
                <CalendarDays className="w-4 h-4 mr-2" style={{ color: "var(--text-muted)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Agente</span>
              </div>
              {activeDays.map((day) => {
                const dayDate = addDays(selectedMonday, day.dayOfWeek - 1);
                const isToday = toIsoDate(dayDate) === todayIso;
                const hasCards = weekCards.some((c) => c.scheduledDate && toIsoDate(new Date(c.scheduledDate)) === toIsoDate(dayDate));
                return (
                  <div key={day.dayOfWeek} className={cn("p-3 text-center border-l", isToday ? "bg-orange-500/5" : "")} style={{ borderColor: "var(--border)" }}>
                    <p className={cn("text-xs font-bold", isToday ? "text-orange-400" : "")} style={!isToday ? { color: "var(--text-primary)" } : undefined}>{day.short}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{formatDayDate(selectedMonday, day.dayOfWeek)}</p>
                    {isToday && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mx-auto mt-1" />}
                    {hasCards && !isToday && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mx-auto mt-1" />}
                  </div>
                );
              })}
            </div>

            {/* Agent rows */}
            {loadingCards && !generating ? (
              <div className="flex items-center justify-center py-20 gap-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            ) : (
              AGENT_ROWS.map((agentRow, rowIdx) => {
                const rowCards = weekCards.filter((c) => c.agentId === agentRow.agentId);
                const hasAnyCard = rowCards.length > 0;

                return (
                  <div
                    key={agentRow.agentId}
                    className={cn("grid border-b last:border-b-0 items-start", !hasAnyCard && !generating ? "opacity-40" : "")}
                    style={{
                      gridTemplateColumns: `180px repeat(${activeDays.length}, 1fr)`,
                      borderColor: "var(--border)",
                      background: rowIdx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.02)",
                    }}
                  >
                    <div className="p-3 flex items-center gap-2 border-r" style={{ borderColor: "var(--border)" }}>
                      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0", agentRow.color)}>
                        {agentRow.agentId.split("-").map((w) => w[0].toUpperCase()).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{agentRow.label}</p>
                        <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{agentRow.subtitle}</p>
                      </div>
                    </div>

                    {activeDays.map((day) => {
                      const dayDate = toIsoDate(addDays(selectedMonday, day.dayOfWeek - 1));
                      const dayRowCards = rowCards
                        .filter((c) => c.scheduledDate && toIsoDate(new Date(c.scheduledDate)) === dayDate)
                        .sort((a, b) => {
                          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                          return ta - tb;
                        });
                      const isToday = dayDate === todayIso;
                      const isGeneratingThisAgent = generating && !hasAnyCard;

                      return (
                        <div key={day.dayOfWeek} className={cn("p-2 border-l", isToday ? "bg-orange-500/5" : "")} style={{ borderColor: "var(--border)", minHeight: 64 }}>
                          {isGeneratingThisAgent && dayRowCards.length === 0 ? (
                            <div className="rounded-lg border border-dashed h-16 flex items-center justify-center gap-1" style={{ borderColor: "var(--border)" }}>
                              <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--border)" }} />
                              <span className="text-[10px]" style={{ color: "var(--border)" }}>Gerando...</span>
                            </div>
                          ) : dayRowCards.length === 0 ? (
                            <KanbanCard card={undefined} agentRow={agentRow} onOpenModal={handleOpenModal} />
                          ) : (
                            <div className="space-y-1.5">
                              {dayRowCards.map((c) => (
                                <KanbanCard key={c.id} card={c} agentRow={agentRow} onOpenModal={handleOpenModal} compact={dayRowCards.length > 1} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Empty state */}
        {!loadingCards && weekCards.length === 0 && !generating && (
          <div className="text-center py-12 px-8">
            <CalendarDays className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--border)" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nenhuma campanha nesta semana</p>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              {isCurrentWeek
                ? "Clique em \"Nova campanha\" para gerar conteúdo para essa semana."
                : "Nenhuma campanha foi gerada para a semana selecionada."}
            </p>
            {isCurrentWeek && (
              <Button size="sm" onClick={() => setShowSetupModal(true)}>
                <Sparkles className="w-3 h-3" /> Nova campanha
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] flex-wrap" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" /> Aprovado</span>
        <span className="flex items-center gap-1"><X className="w-3 h-3 text-red-400" /> Rejeitado</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400" /> Com conteúdo</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /> Hoje</span>
        <span className="ml-auto">Clique em qualquer card para abrir e interagir com a IA</span>
      </div>

      {/* Pipeline live — abaixo do Kanban */}
      {generating && runningPipelineId && (
        <PipelineLive
          runId={runningPipelineId}
          onComplete={() => {
            setGenerating(false);
            toast.success("Campanha gerada! Cards atualizados.");
            loadCardsForWeek(weekStartIso);
            setRunningPipelineId(null);
          }}
          onError={() => {
            setGenerating(false);
            setRunningPipelineId(null);
            toast.error("Erro ao gerar campanha.");
          }}
        />
      )}

      {/* Setup modal */}
      <AnimatePresence>
        {showSetupModal && (
          <CampaignSetupModal
            onConfirm={handleSetupConfirm}
            onClose={() => setShowSetupModal(false)}
            defaultWeekStart={weekStartIso}
          />
        )}
      </AnimatePresence>

      {/* Card detail modal */}
      {modalCard && modalAgentRow && (
        <CardDetailModal
          card={modalCard}
          agentRow={modalAgentRow}
          projectId={projectId}
          socialAccounts={socialAccounts}
          onClose={() => { setModalCard(null); setModalAgentRow(null); }}
          onCardUpdate={handleCardUpdate}
          onWeekRefresh={() => { void loadCardsForWeek(weekStartIso); }}
          onRestartWithTopic={(t) => {
            setTopic(t);
            setShowTopicInput(true);
            setModalCard(null);
            setModalAgentRow(null);
          }}
        />
      )}

      <AnimatePresence>
        {archiveOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setArchiveOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border p-6 max-h-[85vh] overflow-y-auto shadow-2xl"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-2 mb-4">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Arquivo de campanhas</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Restaure no quadro escolhendo a semana e os dias (sem datas passadas).</p>
                </div>
                <button type="button" onClick={() => setArchiveOpen(false)} className="p-1 rounded-lg hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {loadingArchive ? (
                <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "var(--text-muted)" }}>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Carregando...</span>
                </div>
              ) : archivedRuns.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>Nenhuma campanha arquivada.</p>
              ) : (
                <ul className="space-y-3">
                  {archivedRuns.map((r) => (
                    <li key={r.id} className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.topic ?? "Sem tema"}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Iniciada em {new Date(r.startedAt).toLocaleString("pt-BR")}
                      </p>
                      {restoreRunId === r.id ? (
                        <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Segunda-feira da semana alvo</p>
                            <input
                              type="date"
                              value={restoreWeekStart}
                              onChange={(e) => setRestoreWeekStart(e.target.value)}
                              className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Dias no quadro</p>
                            <div className="flex flex-wrap gap-2">
                              {DAYS.map((d) => (
                                <label
                                  key={d.dayOfWeek}
                                  className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border"
                                  style={{
                                    borderColor: restoreDays.includes(d.dayOfWeek) ? "rgba(249,115,22,0.5)" : "var(--border)",
                                    background: restoreDays.includes(d.dayOfWeek) ? "rgba(249,115,22,0.08)" : "transparent",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={restoreDays.includes(d.dayOfWeek)}
                                    onChange={() => toggleRestoreDay(d.dayOfWeek)}
                                  />
                                  {d.short}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => void submitRestore()} loading={restoring}>
                              Restaurar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRestoreRunId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="mt-1"
                          onClick={() => {
                            setRestoreRunId(r.id);
                            setRestoreWeekStart(weekStartIso);
                            setRestoreDays([1, 2, 3, 4, 5, 6, 7]);
                          }}
                        >
                          Restaurar no quadro…
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
