"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Clock, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Log {
  agent: string;
  message: string;
  output?: string;
  status: "running" | "completed";
  timestamp: string;
}

interface PipelineLiveProps {
  runId: string;
  onComplete: () => void;
  onError: () => void;
}

const AGENTS = [
  {
    id: "roberto-radar",
    name: "Roberto Radar",
    role: "Pesquisador",
    emoji: "🔍",
    color: "border-blue-500/40 bg-blue-500/5",
    activeColor: "border-blue-400 bg-blue-500/10",
    textColor: "text-blue-400",
  },
  {
    id: "lucas-linkedin",
    name: "Lucas LinkedIn",
    role: "Redator LinkedIn",
    emoji: "✍️",
    color: "border-indigo-500/40 bg-indigo-500/5",
    activeColor: "border-indigo-400 bg-indigo-500/10",
    textColor: "text-indigo-400",
  },
  {
    id: "tiago-twitter",
    name: "Tiago Twitter",
    role: "Redator X",
    emoji: "🐦",
    color: "border-cyan-500/40 bg-cyan-500/5",
    activeColor: "border-cyan-400 bg-cyan-500/10",
    textColor: "text-cyan-400",
  },
  {
    id: "diana-design",
    name: "Diana Design",
    role: "Designer",
    emoji: "🎨",
    color: "border-pink-500/40 bg-pink-500/5",
    activeColor: "border-pink-400 bg-pink-500/10",
    textColor: "text-pink-400",
  },
  {
    id: "vera-veredito",
    name: "Vera Veredito",
    role: "Revisora",
    emoji: "🔎",
    color: "border-purple-500/40 bg-purple-500/5",
    activeColor: "border-purple-400 bg-purple-500/10",
    textColor: "text-purple-400",
  },
  {
    id: "sistema",
    name: "Sistema",
    role: "Salvando posts",
    emoji: "💾",
    color: "border-orange-500/40 bg-orange-500/5",
    activeColor: "border-orange-400 bg-orange-500/10",
    textColor: "text-orange-400",
  },
];

/** Convert markdown to clean readable text */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Blank line → spacer
    if (raw.trim() === "") {
      result.push(<div key={key++} className="h-3" />);
      continue;
    }

    // Headings: # ## ###
    const headingMatch = raw.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = stripInline(headingMatch[2]);
      const cls =
        level === 1
          ? "text-sm font-bold mt-2 mb-1"
          : level === 2
          ? "text-xs font-bold mt-2 mb-0.5"
          : "text-xs font-semibold mt-1";
      result.push(
        <p key={key++} className={cls} style={{ color: "var(--text-primary)" }}>
          {content}
        </p>
      );
      continue;
    }

    // Bullet list: - or * or •
    const bulletMatch = raw.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      result.push(
        <div key={key++} className="flex gap-2 text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <span className="text-orange-400 shrink-0 mt-0.5">•</span>
          <span>{stripInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    // Numbered list: 1/ 1. 1)
    const numberedMatch = raw.match(/^(\d+)[/.)]\s+(.+)/);
    if (numberedMatch) {
      result.push(
        <div key={key++} className="flex gap-2 text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <span className="text-orange-400 font-medium shrink-0 min-w-[18px]">{numberedMatch[1]}.</span>
          <span>{stripInline(numberedMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Bold-only line (e.g., **Título**)
    const boldLine = raw.match(/^\*\*(.+)\*\*\s*$/);
    if (boldLine) {
      result.push(
        <p key={key++} className="text-xs font-semibold mt-2 mb-0.5" style={{ color: "var(--text-primary)" }}>
          {boldLine[1]}
        </p>
      );
      continue;
    }

    // Normal paragraph
    result.push(
      <p key={key++} className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {stripInline(raw)}
      </p>
    );
  }

  return result;
}

/** Strip inline markdown: bold, italic, code */
function stripInline(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function PipelineLive({ runId, onComplete, onError }: PipelineLiveProps) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/status?runId=${runId}`);
        const data = await res.json();
        if (Array.isArray(data.logs)) setLogs(data.logs);
        if (data.status) setStatus(data.status);
        if (data.status === "completed" || data.status === "done") {
          clearInterval(poll);
          setTimeout(onComplete, 1500);
        } else if (data.status === "failed" || data.status === "error") {
          clearInterval(poll);
          onError();
        }
      } catch {
        // ignore network errors, keep polling
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [runId, onComplete, onError]);

  const activeAgentName = logs.filter((l) => l.status === "running").at(-1)?.agent ?? "";
  const completedLogs = logs.filter((l) => l.status === "completed");
  const completedAgents = new Set(completedLogs.map((l) => l.agent));
  const activeLog = logs.filter((l) => l.status === "running").at(-1);
  const isFinished = status === "completed" || status === "done";

  function getAgentState(agent: (typeof AGENTS)[0]) {
    const nameMatch = (n: string) =>
      agent.name.toLowerCase().includes(n.split(" ")[0].toLowerCase()) ||
      n.toLowerCase().includes(agent.name.split(" ")[0].toLowerCase());

    const isActive = nameMatch(activeAgentName);
    const isDone = [...completedAgents].some((n) => nameMatch(n));
    const log = completedLogs.find((l) => nameMatch(l.agent));
    return { isActive, isDone, output: log?.output ?? null };
  }

  return (
    <div className="my-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {isFinished ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : (
          <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
        )}
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {isFinished ? "Campanha gerada com sucesso!" : "Squad trabalhando na sua campanha..."}
        </span>
      </div>

      {/* Agent pipeline */}
      <div className="flex items-start gap-1 flex-wrap">
        {AGENTS.map((agent, idx) => {
          const { isActive, isDone, output } = getAgentState(agent);
          const isExpanded = expandedAgent === agent.id;

          return (
            <div key={agent.id} className="flex items-start gap-1">
              <motion.div
                animate={isActive ? { scale: [1, 1.02, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
                onClick={() => isDone && output && setExpandedAgent(isExpanded ? null : agent.id)}
                className={cn(
                  "relative p-3 rounded-xl border transition-all duration-500 min-w-[110px]",
                  isDone
                    ? "border-green-800/40 bg-green-900/10 cursor-pointer hover:border-green-600/50 hover:bg-green-900/20"
                    : isActive
                    ? agent.activeColor
                    : agent.color,
                  !isDone && !isActive && "opacity-50"
                )}
              >
                {/* Status indicator */}
                <div className="absolute -top-1.5 -right-1.5">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400 rounded-full" style={{ background: "var(--bg-primary)" }} />
                  ) : isActive ? (
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-3 h-3 rounded-full bg-orange-400 border-2"
                      style={{ borderColor: "var(--bg-primary)" }}
                    />
                  ) : (
                    <Clock className="w-3.5 h-3.5 rounded-full" style={{ color: "var(--text-muted)", background: "var(--bg-primary)" }} />
                  )}
                </div>

                <div className="text-lg mb-1">{agent.emoji}</div>
                <p className={cn("text-xs font-semibold leading-tight", isDone ? "text-green-400" : isActive ? agent.textColor : "")}>
                  <span style={!isDone && !isActive ? { color: "var(--text-muted)" } : undefined}>{agent.name.split(" ")[0]}</span>
                </p>
                <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{agent.role}</p>

                {/* Expand hint */}
                {isDone && output && (
                  <div className="mt-1.5 flex items-center gap-0.5">
                    {isExpanded
                      ? <ChevronUp className="w-3 h-3 text-green-400" />
                      : <ChevronDown className="w-3 h-3 text-green-400" />}
                    <span className="text-[9px] text-green-400">ver</span>
                  </div>
                )}

                {/* Active typing animation */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-0.5 mt-1.5"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        animate={{ y: [0, -3, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                        className="w-1 h-1 rounded-full bg-orange-400"
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {idx < AGENTS.length - 1 && (
                <ChevronRight className={cn("w-4 h-4 mt-4 shrink-0 transition-colors", isDone ? "text-green-500" : "")}
                  style={!isDone ? { color: "var(--border)" } : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Active agent current task */}
      <AnimatePresence mode="wait">
        {activeLog && !isFinished && (
          <motion.div
            key={activeLog.message}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="p-3 rounded-lg border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="text-orange-400 font-medium">{activeLog.agent}: </span>
              {activeLog.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded agent output */}
      <AnimatePresence>
        {expandedAgent && (() => {
          const agent = AGENTS.find((a) => a.id === expandedAgent)!;
          const { output } = getAgentState(agent);
          if (!output) return null;
          return (
            <motion.div
              key={expandedAgent}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{agent.emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{agent.name}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>— {agent.role}</span>
                  </div>
                  <button
                    onClick={() => setExpandedAgent(null)}
                    className="text-xs transition-colors hover:text-orange-500"
                    style={{ color: "var(--text-muted)" }}
                  >
                    fechar ✕
                  </button>
                </div>
                {/* Content */}
                <div className="p-4 max-h-[600px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#2a2a2a]">
                  {renderMarkdown(output)}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Completed agents summary */}
      {completedLogs.length > 0 && !expandedAgent && (
        <div className="space-y-1">
          {completedLogs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
              <span>
                <span className="text-green-400">{log.agent}</span> — concluído
                {log.output && (
                  <button
                    onClick={() => {
                      const a = AGENTS.find(
                        (ag) =>
                          ag.name.toLowerCase().includes(log.agent.split(" ")[0].toLowerCase()) ||
                          log.agent.toLowerCase().includes(ag.name.split(" ")[0].toLowerCase())
                      );
                      if (a) setExpandedAgent(a.id);
                    }}
                    className="ml-2 hover:text-orange-400 underline underline-offset-2 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ver resposta
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
