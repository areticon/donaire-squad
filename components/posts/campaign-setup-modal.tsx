"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronRight, ChevronLeft, Zap, Image, Video, LayoutGrid, Type,
  Shuffle, AlertTriangle, CalendarDays, Repeat2, Split, Bot,
  BarChart2, FileText, List, PieChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEDIA_STYLE_OPTIONS, type MediaStyleId } from "@/lib/media/media-style";

export type FunnelStage = "tofu" | "mofu" | "bofu";
export type ContentType = "text" | "image" | "video" | "carousel" | "infographic" | "poll" | "article" | "thread" | "free";
export type CampaignMode = "single" | "weekly" | "biweekly" | "recurring";

export interface WeeklySchedule {
  "1"?: ContentType;
  "2"?: ContentType;
  "3"?: ContentType;
  "4"?: ContentType;
  "5"?: ContentType;
  "6"?: ContentType; // Sábado (opcional)
  "7"?: ContentType; // Domingo (opcional)
}

export interface DayScheduleTime {
  time: string; // "HH:mm"
}

export interface CampaignConfig {
  campaignMode: CampaignMode;
  funnelStage: FunnelStage;
  weeklySchedule: WeeklySchedule;
  // Posting times: key = dayOfWeek (1-7), value = "HH:mm"
  postingTimes: Record<string, string>;
  // Full UTC ISO timestamps computed by the browser (preserves user timezone)
  singleScheduledAt?: string;            // for single mode
  postingTimestamps?: Record<string, string>; // dayOfWeek -> full ISO UTC
  singleDay?: number;
  singleTime?: string; // "HH:mm" for single post
  singleDate?: string; // ISO date for single post (overrides weekStart + singleDay)
  singlePlatform?: "linkedin" | "twitter" | "both";
  singleContentType?: ContentType;
  weekStart: string; // ISO date of the Monday for this campaign
  videoDuration?: 5 | 6 | 8; // seconds
  videoAudio?: boolean; // generate audio/narration in Portuguese
  mediaStyle?: MediaStyleId; // visual style for image / video / carousel
}

interface Props {
  onConfirm: (config: CampaignConfig) => void;
  onClose: () => void;
  defaultWeekStart?: string; // passed by ContentManager
}

// ── Data ──────────────────────────────────────────────────────────────────────

const CAMPAIGN_MODES = [
  {
    id: "single" as CampaignMode,
    label: "Post único",
    icon: CalendarDays,
    description: "Um único post para um dia específico da semana.",
    badge: "1 post",
    color: "border-sky-500/30 hover:border-sky-400",
    activeColor: "border-sky-400 bg-sky-500/10",
    badgeColor: "bg-sky-500/20 text-sky-300",
  },
  {
    id: "weekly" as CampaignMode,
    label: "Semana completa",
    icon: Split,
    description: "Posts de Seg a Dom para a semana selecionada.",
    badge: "7 posts",
    color: "border-orange-500/30 hover:border-orange-400",
    activeColor: "border-orange-400 bg-orange-500/10",
    badgeColor: "bg-orange-500/20 text-orange-300",
  },
  {
    id: "biweekly" as CampaignMode,
    label: "Quinzenal",
    icon: Repeat2,
    description: "Duas semanas consecutivas de conteúdo de uma vez.",
    badge: "14 posts",
    color: "border-purple-500/30 hover:border-purple-400",
    activeColor: "border-purple-400 bg-purple-500/10",
    badgeColor: "bg-purple-500/20 text-purple-300",
  },
  {
    id: "recurring" as CampaignMode,
    label: "Recorrente",
    icon: Bot,
    description: "A IA decide o melhor dia e formato baseado no histórico.",
    badge: "IA decide",
    color: "border-green-500/30 hover:border-green-400",
    activeColor: "border-green-400 bg-green-500/10",
    badgeColor: "bg-green-500/20 text-green-300",
  },
];

const FUNNEL_OPTIONS = [
  {
    id: "tofu" as FunnelStage,
    label: "Topo de funil",
    badge: "ToFu",
    description: "Alcance máximo. Curiosidades, tendências, conteúdo leve e informativo.",
    examples: ["Dados surpreendentes do setor", "Mitos e verdades", "Tendências do mercado"],
    color: "border-blue-500/40 bg-blue-500/5 hover:border-blue-400",
    activeColor: "border-blue-400 bg-blue-500/15",
    badgeColor: "bg-blue-500/20 text-blue-300",
    emoji: "🌱",
  },
  {
    id: "mofu" as FunnelStage,
    label: "Meio de funil",
    badge: "MoFu",
    description: "Aprofundamento. Conteúdo técnico, provocativo e nichado.",
    examples: ["Análises comparativas", "Opiniões polarizadoras", "Casos de uso detalhados"],
    color: "border-orange-500/40 bg-orange-500/5 hover:border-orange-400",
    activeColor: "border-orange-400 bg-orange-500/15",
    badgeColor: "bg-orange-500/20 text-orange-300",
    emoji: "🔥",
  },
  {
    id: "bofu" as FunnelStage,
    label: "Fundo de funil",
    badge: "BoFu",
    description: "Conversão. CTA direto, prova social, urgência e ofertas.",
    examples: ["Cases de sucesso com números", "Comparativo com concorrentes", "Ofertas e CTAs claros"],
    color: "border-green-500/40 bg-green-500/5 hover:border-green-400",
    activeColor: "border-green-400 bg-green-500/15",
    badgeColor: "bg-green-500/20 text-green-300",
    emoji: "🎯",
  },
];

const CONTENT_TYPES = [
  { id: "text" as ContentType,    label: "Texto",    icon: Type,      description: "Post escrito sem mídia",         credits: 0,    time: null,    activeColor: "border-orange-500 bg-orange-500/10" },
  { id: "image" as ContentType,   label: "Imagem",   icon: Image,     description: "Imagem gerada por IA",           credits: 8,    time: "~30s",  activeColor: "border-blue-500 bg-blue-500/10" },
  { id: "carousel" as ContentType,    label: "Carrossel",    icon: LayoutGrid, description: "3 imagens com slides navegáveis", credits: 24,   time: "~90s",  activeColor: "border-purple-500 bg-purple-500/10" },
  { id: "infographic" as ContentType, label: "Infográfico",  icon: PieChart,   description: "Visual com dados, texto e gráficos perfeitos", credits: 5, time: "~45s", activeColor: "border-teal-500 bg-teal-500/10" },
  { id: "video" as ContentType,       label: "Vídeo",        icon: Video,      description: "Vídeo com VEO3 (Veo 3 Fast)",   credits: 10,   time: "~3min", activeColor: "border-red-500 bg-red-500/10" },
  { id: "poll" as ContentType,    label: "Enquete",  icon: BarChart2, description: "LinkedIn poll / X poll",         credits: 0,    time: null,    activeColor: "border-cyan-500 bg-cyan-500/10" },
  { id: "article" as ContentType, label: "Artigo",   icon: FileText,  description: "Post longo — LinkedIn Article",  credits: 0,    time: null,    activeColor: "border-emerald-500 bg-emerald-500/10" },
  { id: "thread" as ContentType,  label: "Thread",   icon: List,      description: "Série de tweets encadeados (X)", credits: 0,    time: null,    activeColor: "border-sky-500 bg-sky-500/10" },
  { id: "free" as ContentType,    label: "Livre",    icon: Shuffle,   description: "IA escolhe o melhor formato",    credits: null, time: null,    activeColor: "border-[var(--border-accent)] bg-[var(--bg-elevated)]" },
];

const WEEK_DAYS = [
  { key: "1" as keyof WeeklySchedule, label: "Segunda", short: "Seg", dayNum: 1, isWeekend: false },
  { key: "2" as keyof WeeklySchedule, label: "Terça",   short: "Ter", dayNum: 2, isWeekend: false },
  { key: "3" as keyof WeeklySchedule, label: "Quarta",  short: "Qua", dayNum: 3, isWeekend: false },
  { key: "4" as keyof WeeklySchedule, label: "Quinta",  short: "Qui", dayNum: 4, isWeekend: false },
  { key: "5" as keyof WeeklySchedule, label: "Sexta",   short: "Sex", dayNum: 5, isWeekend: false },
  { key: "6" as keyof WeeklySchedule, label: "Sábado",  short: "Sáb", dayNum: 6, isWeekend: true  },
  { key: "7" as keyof WeeklySchedule, label: "Domingo", short: "Dom", dayNum: 7, isWeekend: true  },
];

function getThisMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function getNextMonday(weeksAhead = 1): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday + (weeksAhead - 1) * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

/** Snap any date to its Monday */
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/** Format week range like "31 mar – 6 abr" */
function formatWeekRange(mondayIso: string, weeksCount = 1): string {
  const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const start = new Date(mondayIso + "T12:00:00");
  const end = new Date(mondayIso + "T12:00:00");
  end.setDate(end.getDate() + weeksCount * 7 - 1);
  const fmtDay = (d: Date) =>
    `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

function calcTotalCredits(schedule: WeeklySchedule): number {
  return (Object.values(schedule).filter(Boolean) as ContentType[]).reduce((total, type) => {
    const ct = CONTENT_TYPES.find((c) => c.id === type);
    return total + (ct?.credits ?? 0);
  }, 0);
}

function hasVideo(schedule: WeeklySchedule | ContentType): boolean {
  if (typeof schedule === "string") return schedule === "video";
  return (Object.values(schedule).filter(Boolean) as ContentType[]).includes("video");
}

function scheduleHasVisualMedia(ws: WeeklySchedule): boolean {
  return Object.values(ws).some((v) => v === "image" || v === "video" || v === "carousel");
}

function campaignUsesMediaStyle(
  isSingle: boolean,
  singleCt: ContentType,
  ws: WeeklySchedule,
  isRecurring: boolean
): boolean {
  // infographic has its own theme picker, not the media style
  if (isSingle) return ["image", "video", "carousel"].includes(singleCt);
  if (isRecurring) return true;
  return scheduleHasVisualMedia(ws);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CampaignSetupModal({ onConfirm, onClose, defaultWeekStart }: Props) {
  const [step, setStep] = useState(0);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("weekly");
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("tofu");
  // Default: Mon–Fri active, Sat–Sun off (key absent = não postar naquele dia)
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>({
    "1": "text", "2": "image", "3": "text", "4": "image", "5": "free",
  });
  const [singleDay, setSingleDay] = useState<number>(1);
  const [singleDate, setSingleDate] = useState<string>(""); // YYYY-MM-DD
  const [singleTime, setSingleTime] = useState<string>("09:00");
  const [singlePlatform, setSinglePlatform] = useState<"linkedin" | "twitter" | "both">("both");
  const [singleContentType, setSingleContentType] = useState<ContentType>("text");
  const [videoDuration, setVideoDuration] = useState<5 | 6 | 8>(8);
  const [videoAudio, setVideoAudio] = useState<boolean>(false);
  const [mediaStyle, setMediaStyle] = useState<MediaStyleId>("cinematic");
  // Default posting time for all weekdays (can be overridden per-day)
  const [defaultPostTime, setDefaultPostTime] = useState<string>("09:00");
  // Per-day posting times
  const [postingTimes, setPostingTimes] = useState<Record<string, string>>({
    "1": "09:00", "2": "09:00", "3": "09:00", "4": "09:00", "5": "09:00", "6": "09:00", "7": "09:00",
  });

  // Default to next Monday if today is not Monday (to avoid suggesting past days)
  const todayIso = new Date().toISOString().split("T")[0];
  const todayIsMonday = new Date().getDay() === 1;
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
    defaultWeekStart ?? (todayIsMonday ? getThisMonday() : getNextMonday(1))
  );
  const [customDateInput, setCustomDateInput] = useState<string>("");
  const weekStart = selectedWeekStart;

  // total steps depends on mode
  const isSingle = campaignMode === "single";
  const isRecurring = campaignMode === "recurring";
  // step 0: mode, step 1: funnel, step 2: schedule (or single picker), step 2.5: times, step 3: confirm
  const totalSteps = isSingle ? 3 : isRecurring ? 2 : 4;

  function applyDefaultTimeToAll(time: string) {
    setDefaultPostTime(time);
    setPostingTimes({ "1": time, "2": time, "3": time, "4": time, "5": time, "6": time, "7": time });
  }

  function handleConfirm() {
    // Compute full UTC ISO timestamps in the browser to preserve user timezone
    let singleScheduledAt: string | undefined;
    let postingTimestamps: Record<string, string> | undefined;

    if (isSingle && singleDate && singleTime) {
      singleScheduledAt = new Date(`${singleDate}T${singleTime}:00`).toISOString();
    }

    if (!isSingle) {
      postingTimestamps = {};
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      for (const [dayKey, time] of Object.entries(postingTimes)) {
        // Only include days that are active in the weekly schedule
        if (!weeklySchedule[dayKey as keyof WeeklySchedule]) continue;

        const dayNum = parseInt(dayKey);
        const base = new Date(weekStart + "T00:00:00");
        base.setDate(base.getDate() + (dayNum - 1));

        // Skip days that are already in the past
        if (base < todayMidnight) continue;

        const dateStr = base.toISOString().split("T")[0];
        postingTimestamps[dayKey] = new Date(`${dateStr}T${time}:00`).toISOString();
      }
    }

    onConfirm({
      campaignMode,
      funnelStage,
      weeklySchedule,
      postingTimes,
      singleScheduledAt,
      postingTimestamps,
      singleDay: isSingle ? singleDay : undefined,
      singleDate: isSingle && singleDate ? singleDate : undefined,
      singleTime: isSingle ? singleTime : undefined,
      singlePlatform: isSingle ? singlePlatform : undefined,
      singleContentType: isSingle ? singleContentType : undefined,
      weekStart,
      videoDuration: (isSingle ? singleContentType : Object.values(weeklySchedule).find(v => v === "video") ? "video" : undefined) === "video" ? videoDuration : undefined,
      videoAudio: (isSingle ? singleContentType : Object.values(weeklySchedule).find(v => v === "video") ? "video" : undefined) === "video" ? videoAudio : undefined,
      mediaStyle: campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) ? mediaStyle : undefined,
    });
  }

  function nextStep() {
    // single: 0 → 1 → 2(picker) → 3(confirm)
    // recurring: 0 → 1 → 3(confirm)
    // weekly/biweekly: 0 → 1 → 2(schedule) → 3(times) → 4(confirm) but we use step 3=times, 4=confirm mapped to step index
    if (isRecurring && step === 1) { setStep(3); return; }
    setStep((s) => s + 1);
  }

  function prevStep() {
    if (isRecurring && step === 3) { setStep(1); return; }
    if (step === 0) { onClose(); return; }
    setStep((s) => s - 1);
  }

  const totalCredits = calcTotalCredits(weeklySchedule);
  const videoWarning = isSingle ? hasVideo(singleContentType) : hasVideo(weeklySchedule);
  // Last step: single=3, recurring=3, weekly/biweekly=4
  const isLastStep = isSingle ? step === 3 : isRecurring ? step === 3 : step === 4;

  const modeInfo = CAMPAIGN_MODES.find((m) => m.id === campaignMode)!;

  // Determine label for step indicator
  const stepLabels: Record<number, string> = {
    0: "Tipo", 1: "Funil", 2: isSingle ? "Post único" : "Planejamento",
    3: isSingle ? "Confirmar" : isRecurring ? "Confirmar" : "Horários",
    4: "Confirmar",
  };
  const currentLabel = stepLabels[step] ?? "";

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onWheel={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", maxHeight: "92vh" }}
        className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Configurar campanha</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{currentLabel} — Passo {step + 1} de {totalSteps + 1}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps + 1 }).map((_, i) => (
                <div
                  key={i}
                  className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-orange-500" : i < step ? "w-3 bg-orange-500/60" : "w-3")}
                  style={i > step ? { background: "var(--border)" } : undefined}
                />
              ))}
            </div>
            <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content — scrollable */}
        <div className="p-6 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
          <AnimatePresence mode="wait">

            {/* Step 0: Campaign mode */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o formato desta campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha se vai criar um post avulso, uma semana inteira ou um ciclo recorrente.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {CAMPAIGN_MODES.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setCampaignMode(mode.id)}
                        className={cn("text-left p-4 rounded-xl border transition-all duration-200", campaignMode === mode.id ? mode.activeColor : mode.color)}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{mode.label}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", mode.badgeColor)}>{mode.badge}</span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{mode.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 1: Funnel stage */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o propósito desta campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Define o tom, linguagem e tipo de conteúdo que a IA vai gerar.</p>
                </div>
                <div className="grid gap-3">
                  {FUNNEL_OPTIONS.map((opt) => (
                    <button key={opt.id} onClick={() => setFunnelStage(opt.id)} className={cn("w-full text-left p-4 rounded-xl border transition-all", funnelStage === opt.id ? opt.activeColor : opt.color)}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{opt.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</span>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", opt.badgeColor)}>{opt.badge}</span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{opt.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {opt.examples.map((ex) => (
                              <span key={ex} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-muted)" }}>{ex}</span>
                            ))}
                          </div>
                        </div>
                        <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all", funnelStage === opt.id ? "border-orange-500 bg-orange-500" : "border-[var(--border)]")} />
                      </div>
                    </button>
                  ))}
                </div>

                {isRecurring && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        A campanha recorrente inclui posts com imagem — escolha o estilo (também vale para vídeos se adicionar depois).
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Weekly schedule OR single post picker */}
            {step === 2 && !isSingle && !isRecurring && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Planejador {campaignMode === "biweekly" ? "quinzenal" : "semanal"}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {campaignMode === "biweekly"
                      ? "Ative os dias desejados — o planejamento será repetido nas 2 semanas."
                      : "Ative os dias que deseja postar e escolha o tipo de conteúdo."}
                  </p>
                </div>
                <div className="space-y-2">
                  {WEEK_DAYS.map((day) => {
                    const isActive = day.key in weeklySchedule && weeklySchedule[day.key] !== undefined;
                    const selected = weeklySchedule[day.key];
                    const selectedType = selected ? CONTENT_TYPES.find((c) => c.id === selected) : null;
                    return (
                      <div
                        key={day.key}
                        className={cn(
                          "rounded-xl border transition-all",
                          isActive
                            ? "border-[var(--border)]"
                            : "border-dashed border-[var(--border)] opacity-50"
                        )}
                        style={{ background: isActive ? "var(--bg-elevated)" : "var(--bg-primary)" }}
                      >
                        {/* Day header with toggle */}
                        <div className="flex items-center gap-3 px-3 py-2">
                          {/* Toggle switch */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) {
                                // Remove o dia do schedule
                                setWeeklySchedule((s) => {
                                  const next = { ...s };
                                  delete next[day.key];
                                  return next;
                                });
                              } else {
                                // Ativa o dia com tipo padrão
                                const defaultType = day.isWeekend ? "text" : "text";
                                setWeeklySchedule((s) => ({ ...s, [day.key]: defaultType }));
                              }
                            }}
                            className={cn(
                              "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                              isActive ? "bg-orange-500" : "bg-gray-600"
                            )}
                            aria-pressed={isActive}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200",
                                isActive ? "translate-x-3" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span
                            className={cn("text-xs font-semibold w-8 shrink-0", day.isWeekend ? "text-orange-400" : "")}
                            style={day.isWeekend ? undefined : { color: "var(--text-primary)" }}
                          >
                            {day.short}
                          </span>
                          {!isActive && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>não postar</span>
                          )}
                          {isActive && selectedType && (
                            <span className="text-xs ml-auto shrink-0" style={{ color: "var(--text-muted)" }}>
                              {selectedType.time ?? ""}
                            </span>
                          )}
                        </div>
                        {/* Content type picker — only when active */}
                        {isActive && (
                          <div className="flex gap-1.5 flex-wrap px-3 pb-2.5">
                            {CONTENT_TYPES.map((ct) => {
                              const Icon = ct.icon;
                              const isSel = selected === ct.id;
                              return (
                                <button
                                  key={ct.id}
                                  onClick={() => setWeeklySchedule((s) => ({ ...s, [day.key]: ct.id }))}
                                  title={`${ct.label}${ct.credits ? ` (${ct.credits} créditos)` : ""}${ct.time ? ` · ${ct.time}` : ""}`}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
                                    isSel ? ct.activeColor : "border-[var(--border)] hover:border-[var(--border-accent)]",
                                    isSel ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"
                                  )}
                                >
                                  <Icon className="w-3 h-3" />
                                  {ct.label}
                                  {ct.credits && isSel ? <span className="text-[10px] text-[var(--text-muted)]">{ct.credits}cr</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Active days counter */}
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {Object.keys(weeklySchedule).filter((k) => weeklySchedule[k as keyof WeeklySchedule] !== undefined).length} dia(s) ativo(s) esta semana
                </p>

                {scheduleHasVisualMedia(weeklySchedule) && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Vale para todos os dias em que há imagem, vídeo ou carrossel.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2 for single: day + date + time + platform + type */}
            {step === 2 && isSingle && (
              <motion.div key="step2-single" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Configure o post único</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha quando, onde e como publicar.</p>
                </div>

                {/* Date + Time row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Data de publicação</p>
                    <input
                      type="date"
                      className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                      value={singleDate}
                      onChange={(e) => {
                        setSingleDate(e.target.value);
                        if (e.target.value) {
                          const d = new Date(e.target.value + "T00:00:00");
                          const dow = d.getDay() === 0 ? 7 : d.getDay();
                          setSingleDay(dow);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Horário de publicação</p>
                    <input
                      type="time"
                      className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                      value={singleTime}
                      onChange={(e) => setSingleTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Or pick by day of week (if no specific date) */}
                {!singleDate && (
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Ou escolha o dia da semana</p>
                    <div className="flex gap-2 flex-wrap">
                      {WEEK_DAYS.map((d) => (
                        <button key={d.dayNum} onClick={() => setSingleDay(d.dayNum)} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", singleDay === d.dayNum ? "bg-orange-500 border-orange-500 text-white" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]")}>
                          {d.short}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Platform */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Plataforma</p>
                  <div className="flex gap-2">
                    {[{ id: "linkedin" as const, label: "LinkedIn" }, { id: "twitter" as const, label: "X (Twitter)" }, { id: "both" as const, label: "Ambos" }].map((p) => (
                      <button key={p.id} onClick={() => setSinglePlatform(p.id)} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", singlePlatform === p.id ? "bg-orange-500 border-orange-500 text-white" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]")}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content type */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Tipo de conteúdo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTENT_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      const isActive = singleContentType === ct.id;
                      return (
                        <button key={ct.id} onClick={() => setSingleContentType(ct.id)} className={cn("p-3 rounded-xl border text-left transition-all", isActive ? ct.activeColor : "border-[var(--border)] hover:border-[var(--border-accent)]")}>
                          <Icon className="w-4 h-4 mb-1.5" style={{ color: isActive ? undefined : "var(--text-muted)" }} />
                          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{ct.label}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{ct.description}</p>
                          {ct.credits ? <p className="text-[10px] text-orange-400 mt-1">{ct.credits} créditos · {ct.time}</p> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Video duration + cost warning (only for video type) */}
                {singleContentType === "video" && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "#f97316", background: "rgba(249,115,22,0.06)" }}>
                    <div className="flex items-start gap-2">
                      <span className="text-base">⚠️</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "#f97316" }}>Consumo de créditos</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          Vídeos consomem mais créditos que outros formatos.
                          Gerados com <strong style={{ color: "var(--text-primary)" }}>Veo 3 Fast</strong> — o modelo mais econômico disponível.
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Duração do vídeo</p>
                      <div className="flex gap-2">
                        {([5, 6, 8] as const).map((sec) => {
                          // Credit costs from MODELO_DE_NEGOCIO.csv (Section 7)
                          const creditMap: Record<number, { noAudio: number; withAudio: number }> = {
                            5: { noAudio: 50, withAudio: 80 },
                            6: { noAudio: 60, withAudio: 100 },
                            8: { noAudio: 80, withAudio: 130 },
                          };
                          const credits = videoAudio ? creditMap[sec].withAudio : creditMap[sec].noAudio;
                          const isActive = videoDuration === sec;
                          return (
                            <button
                              key={sec}
                              onClick={() => setVideoDuration(sec)}
                              className={cn("flex-1 py-2 rounded-xl border text-xs font-medium transition-all", isActive ? "border-orange-500 bg-orange-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]")}
                              style={{ color: isActive ? "#f97316" : "var(--text-primary)" }}
                            >
                              {sec}s
                              <span className="block text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>{credits} créditos</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Audio narration toggle */}
                    <button
                      onClick={() => setVideoAudio(!videoAudio)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border transition-all"
                      style={{
                        borderColor: videoAudio ? "#3b82f6" : "var(--border)",
                        background: videoAudio ? "rgba(59,130,246,0.08)" : "transparent",
                      }}
                    >
                      <div className="text-left">
                        <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>🎙️ Narração em português</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          Veo 3 gera áudio com narrador em PT-BR sincronizado ao vídeo
                        </p>
                      </div>
                      <div className={cn("w-9 h-5 rounded-full flex items-center transition-all px-0.5 shrink-0", videoAudio ? "justify-end bg-blue-500" : "justify-start bg-[var(--border)]")}>
                        <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </button>

                    <p className="text-[10px] leading-relaxed px-1" style={{ color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text-primary)" }}>Mensagem completa:</strong> a IA planeja o roteiro para caber na duração escolhida — ideia com início, meio e fim, sem cortar no meio da fala ou da cena.
                      {videoAudio ? " Com narração, o texto fica curto o suficiente para terminar antes do fim do clipe." : null}
                    </p>
                  </div>
                )}

                {campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Escolha como imagens, vídeos e carrosséis devem parecer (realismo, charge, reportagem, etc.).
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Start date + Posting times (weekly / biweekly only) */}
            {step === 3 && !isSingle && !isRecurring && (
              <motion.div key="step3-times" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Quando começa a campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha a data de início e os horários de publicação.</p>
                </div>

                {/* Campaign start date picker */}
                {(() => {
                  const thisMonday = getThisMonday();
                  const nextMonday = getNextMonday(1);
                  const in2Weeks = getNextMonday(2);
                  const isThisWeek = selectedWeekStart === thisMonday;
                  const isNextWeek = selectedWeekStart === nextMonday;
                  const isIn2Weeks = selectedWeekStart === in2Weeks;
                  const isCustom = !isThisWeek && !isNextWeek && !isIn2Weeks;
                  const weeksCount = campaignMode === "biweekly" ? 2 : 1;

                  // Calculate how many active scheduled days fall before today
                  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
                  const activeDayKeys = Object.keys(weeklySchedule).filter((k) => weeklySchedule[k as keyof WeeklySchedule]);
                  const pastDaysCount = isThisWeek && !todayIsMonday
                    ? activeDayKeys.filter((k) => {
                        const dayNum = parseInt(k);
                        const d = new Date(thisMonday + "T00:00:00");
                        d.setDate(d.getDate() + (dayNum - 1));
                        return d < todayMidnight;
                      }).length
                    : 0;

                  return (
                    <div className="rounded-xl border p-3 space-y-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {/* Quick presets */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: "Esta semana", value: thisMonday },
                          { label: "Próxima segunda", value: nextMonday },
                          { label: "Em 2 semanas", value: in2Weeks },
                        ].map((opt) => {
                          const isActive = selectedWeekStart === opt.value && !isCustom;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => { setSelectedWeekStart(opt.value); setCustomDateInput(""); }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                isActive
                                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => { setCustomDateInput(selectedWeekStart); }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                            isCustom
                              ? "border-orange-500 bg-orange-500/10 text-orange-400"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          Personalizado
                        </button>
                      </div>

                      {/* Warning: past days will be skipped */}
                      {pastDaysCount > 0 && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-yellow-700/40 bg-yellow-900/10">
                          <span className="text-yellow-400 text-[10px] mt-0.5">⚠</span>
                          <p className="text-[10px] text-yellow-300">
                            {pastDaysCount} {pastDaysCount === 1 ? "dia já passou" : "dias já passaram"} e {pastDaysCount === 1 ? "será pulado" : "serão pulados"}.
                            Apenas os dias a partir de hoje serão gerados. Prefira <strong>Próxima segunda</strong> para uma semana completa.
                          </p>
                        </div>
                      )}

                      {/* Custom date input */}
                      {(isCustom || customDateInput) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>Início:</span>
                          <input
                            type="date"
                            className="flex-1 text-xs px-3 py-1.5 rounded-lg border outline-none"
                            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                            value={customDateInput || selectedWeekStart}
                            min={todayIso}
                            onChange={(e) => {
                              const monday = getMondayOf(e.target.value);
                              setCustomDateInput(e.target.value);
                              setSelectedWeekStart(monday);
                            }}
                          />
                          <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                            (semana de {new Date(getMondayOf(customDateInput || selectedWeekStart) + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })})
                          </span>
                        </div>
                      )}

                      {/* Campaign range preview — show actual first/last posting day */}
                      {(() => {
                        const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                        const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

                        // Find first and last FUTURE active day across all weeks
                        const todayMs = new Date().setHours(0,0,0,0);
                        let firstDate: Date | null = null;
                        let lastDate: Date | null = null;

                        for (let wo = 0; wo < weeksCount; wo++) {
                          for (const [key, ct] of Object.entries(weeklySchedule)) {
                            if (!ct) continue;
                            const d = new Date(selectedWeekStart + "T00:00:00");
                            d.setDate(d.getDate() + (parseInt(key) - 1) + wo * 7);
                            if (d.getTime() < todayMs) continue;
                            if (!firstDate || d < firstDate) firstDate = d;
                            if (!lastDate || d > lastDate) lastDate = d;
                          }
                        }

                        if (!firstDate) return null; // all days in the past — handled elsewhere

                        const label = pastDaysCount > 0
                          ? `Começa em ${fmt(firstDate)}${lastDate && lastDate > firstDate ? ` · termina em ${fmt(lastDate)}` : ""}`
                          : `${fmt(firstDate)}${lastDate && lastDate > firstDate ? ` – ${fmt(lastDate)}` : ""}`;

                        return (
                          <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {pastDaysCount > 0 ? "🗓 Início real:" : "Período:"}
                            </span>
                            <span className="text-[10px] font-semibold" style={{ color: pastDaysCount > 0 ? "var(--accent-orange)" : "var(--text-primary)" }}>
                              {label}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Quick time setter */}
                <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>Aplicar mesma hora a todos:</p>
                  <input
                    type="time"
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none"
                    style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                    value={defaultPostTime}
                    onChange={(e) => applyDefaultTimeToAll(e.target.value)}
                  />
                </div>

                {/* Per-day times — shows "Dia N" + real calendar date */}
                {(() => {
                  const todayMidnightStep3 = new Date(); todayMidnightStep3.setHours(0, 0, 0, 0);
                  // Only show days that will actually be generated (not in the past)
                  const futureDays = WEEK_DAYS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const postDate = new Date(weekStart + "T00:00:00");
                    postDate.setDate(postDate.getDate() + (d.dayNum - 1));
                    return postDate >= todayMidnightStep3;
                  });
                  const skippedCount = WEEK_DAYS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const postDate = new Date(weekStart + "T00:00:00");
                    postDate.setDate(postDate.getDate() + (d.dayNum - 1));
                    return postDate < todayMidnightStep3;
                  }).length;
                  return (
                    <div className="space-y-2">
                      {skippedCount > 0 && (
                        <p className="text-[11px] px-1" style={{ color: "var(--text-muted)" }}>
                          ⚠ {skippedCount} {skippedCount === 1 ? "dia anterior foi omitido" : "dias anteriores foram omitidos"} — apenas os dias abaixo serão gerados.
                        </p>
                      )}
                      {futureDays.map((day, idx) => {
                        const postDate = new Date(weekStart + "T00:00:00");
                        postDate.setDate(postDate.getDate() + (day.dayNum - 1));
                        const dateFmt = postDate.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
                        const contentLabel = CONTENT_TYPES.find((c) => c.id === weeklySchedule[day.key as keyof WeeklySchedule])?.label ?? "";
                        return (
                          <div
                            key={day.dayNum}
                            className="flex items-center gap-3 p-2.5 rounded-xl border"
                            style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
                          >
                            <div className="shrink-0 text-center w-14">
                              <p className="text-[10px] font-bold" style={{ color: "var(--accent-orange)" }}>Dia {idx + 1}</p>
                              <p className="text-[10px] capitalize leading-tight" style={{ color: "var(--text-muted)" }}>{dateFmt}</p>
                            </div>
                            <div className="w-px h-6 shrink-0" style={{ background: "var(--border)" }} />
                            <span className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>{contentLabel}</span>
                            <input
                              type="time"
                              className="text-sm px-2 py-1 rounded-lg border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={postingTimes[String(day.dayNum)] ?? "09:00"}
                              onChange={(e) => setPostingTimes((prev) => ({ ...prev, [String(day.dayNum)]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                      {futureDays.length === 0 && (
                        <div className="p-4 rounded-xl border border-yellow-700/40 bg-yellow-900/10 text-center">
                          <p className="text-xs text-yellow-300">Todos os dias desta semana já passaram.</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Escolha <strong>Próxima segunda</strong> na etapa anterior.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Os posts ficarão agendados nestes horários. Na tela do Gestor de Conteúdo você pode publicar imediatamente ou reagendar qualquer post.
                </p>
              </motion.div>
            )}

            {/* Step 3: Confirmation (single/recurring) or Step 4: Confirmation (weekly/biweekly) */}
            {((step === 3 && (isSingle || isRecurring)) || step === 4) && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Resumo da campanha</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Confirme as configurações antes de iniciar.</p>
                </div>

                {/* Mode summary */}
                {(() => {
                  // Compute real first/last posting day (skipping past days)
                  const MONTHS2 = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                  const fmt2 = (d: Date) => `${d.getDate()} ${MONTHS2[d.getMonth()]}`;
                  const weeksCount2 = campaignMode === "biweekly" ? 2 : 1;
                  const todayMs2 = new Date().setHours(0, 0, 0, 0);
                  let firstPostDate: Date | null = null;
                  let lastPostDate: Date | null = null;
                  let futurePostCount = 0;

                  if (!isSingle && !isRecurring) {
                    for (let wo = 0; wo < weeksCount2; wo++) {
                      for (const [key, ct] of Object.entries(weeklySchedule)) {
                        if (!ct) continue;
                        const d = new Date(selectedWeekStart + "T00:00:00");
                        d.setDate(d.getDate() + (parseInt(key) - 1) + wo * 7);
                        if (d.getTime() < todayMs2) continue;
                        futurePostCount++;
                        if (!firstPostDate || d < firstPostDate) firstPostDate = d;
                        if (!lastPostDate || d > lastPostDate) lastPostDate = d;
                      }
                    }
                  }

                  const periodLabel = firstPostDate
                    ? `${fmt2(firstPostDate)}${lastPostDate && lastPostDate > firstPostDate ? ` – ${fmt2(lastPostDate)}` : ""}`
                    : null;

                  // If some days were skipped, adjust the badge count
                  const badgeLabel = (!isSingle && !isRecurring && futurePostCount > 0 && futurePostCount < totalCredits)
                    ? `${futurePostCount} posts`
                    : modeInfo.badge;

                  return (
                    <div className="p-3 rounded-xl border flex items-center gap-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      <modeInfo.icon className="w-5 h-5 text-orange-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{modeInfo.label}</p>
                        {!isSingle && !isRecurring && periodLabel && (
                          <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--accent-orange)" }}>
                            {periodLabel}
                          </p>
                        )}
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{modeInfo.description}</p>
                      </div>
                      <span className={cn("ml-auto text-[10px] font-bold px-2 py-0.5 rounded shrink-0", modeInfo.badgeColor)}>{badgeLabel}</span>
                    </div>
                  );
                })()}

                {/* Funnel summary */}
                {(() => {
                  const f = FUNNEL_OPTIONS.find((o) => o.id === funnelStage)!;
                  return (
                    <div className="p-3 rounded-xl border flex items-center gap-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      <span className="text-xl">{f.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{f.label}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{f.description}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Single post details */}
                {isSingle && (
                  <div className="p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Post único</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>Dia: <strong className="text-[var(--text-primary)]">{WEEK_DAYS.find((d) => d.dayNum === singleDay)?.label}</strong></span>
                      <span>Plataforma: <strong className="text-[var(--text-primary)]">{singlePlatform === "both" ? "LinkedIn + X" : singlePlatform}</strong></span>
                      <span>Tipo: <strong className="text-[var(--text-primary)]">{CONTENT_TYPES.find((c) => c.id === singleContentType)?.label}</strong></span>
                      {campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) && (
                        <span>Estilo de mídia: <strong className="text-[var(--text-primary)]">{MEDIA_STYLE_OPTIONS.find((m) => m.id === mediaStyle)?.label}</strong></span>
                      )}
                    </div>
                  </div>
                )}

                {/* Weekly grid — only future campaign days */}
                {!isSingle && !isRecurring && (() => {
                  const todayMidnight2 = new Date(); todayMidnight2.setHours(0, 0, 0, 0);
                  // Only show days that will actually be generated
                  const futureDays2 = WEEK_DAYS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const dayDate = new Date(weekStart + "T00:00:00");
                    dayDate.setDate(dayDate.getDate() + (d.dayNum - 1));
                    return dayDate >= todayMidnight2;
                  });
                  const skippedCount2 = WEEK_DAYS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const dayDate = new Date(weekStart + "T00:00:00");
                    dayDate.setDate(dayDate.getDate() + (d.dayNum - 1));
                    return dayDate < todayMidnight2;
                  }).length;
                  const colClass =
                    futureDays2.length <= 3 ? "grid-cols-3" :
                    futureDays2.length === 4 ? "grid-cols-4" :
                    futureDays2.length === 5 ? "grid-cols-5" :
                    futureDays2.length === 6 ? "grid-cols-6" :
                    "grid-cols-7";
                  return (
                    <div className="space-y-2">
                      {skippedCount2 > 0 && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          ⚠ {skippedCount2} {skippedCount2 === 1 ? "dia omitido" : "dias omitidos"} (já passaram) · {futureDays2.length} {futureDays2.length === 1 ? "dia será gerado" : "dias serão gerados"}
                        </p>
                      )}
                      <div className={cn("grid gap-2", colClass)}>
                        {futureDays2.map((day, idx) => {
                          const ct = CONTENT_TYPES.find((c) => c.id === weeklySchedule[day.key])!;
                          const Icon = ct.icon;
                          const dayDate = new Date(weekStart + "T00:00:00");
                          dayDate.setDate(dayDate.getDate() + (day.dayNum - 1));
                          const dateShort = dayDate.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
                          return (
                            <div
                              key={day.key}
                              className="p-2.5 rounded-xl border text-center"
                              style={{
                                background: "var(--bg-primary)",
                                borderColor: day.isWeekend ? "rgba(249,115,22,0.3)" : "var(--border)",
                              }}
                            >
                              <p className="text-[9px] font-bold mb-0.5" style={{ color: "var(--accent-orange)" }}>Dia {idx + 1}</p>
                              <p className="text-[9px] capitalize mb-1 leading-tight" style={{ color: "var(--text-muted)" }}>{dateShort}</p>
                              <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--text-primary)" }} />
                              <p className="text-[9px] font-medium" style={{ color: "var(--text-primary)" }}>{ct.label}</p>
                              {ct.credits && <p className="text-[9px] text-[var(--text-muted)]">{ct.credits}cr</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Credits */}
                {!isSingle && !isRecurring && (
                  <div className="p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Créditos de mídia estimados</span>
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{totalCredits} créditos</span>
                    </div>
                    {campaignMode === "biweekly" && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Total quinzenal</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{totalCredits * 2} créditos</span>
                      </div>
                    )}
                  </div>
                )}

                {videoWarning && !isSingle && (
                  <div className="flex items-start gap-2 p-3 rounded-xl border border-yellow-800/40 bg-yellow-900/10">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-300">Você tem vídeo(s) no planejamento. VEO3 leva 2–5 min por vídeo. Mantenha a aba aberta.</p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <Button variant="ghost" onClick={prevStep} style={{ color: "var(--text-muted)" }}>
            {step === 0 ? "Cancelar" : <><ChevronLeft className="w-4 h-4" />Voltar</>}
          </Button>

          {!isLastStep ? (
            <Button onClick={nextStep}>
              Próximo
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleConfirm} className="bg-orange-500 hover:bg-orange-600">
              <Zap className="w-4 h-4" />
              Gerar campanha
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
