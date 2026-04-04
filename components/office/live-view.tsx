"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Bot,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Agent {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface Post {
  id: string;
  platform: string;
  content: string;
  status: string;
  imageUrl: string | null;
}

interface Run {
  id: string;
  status: string;
  topic: string | null;
  startedAt: Date;
  endedAt: Date | null;
  logs: unknown[];
  posts: Post[];
}

interface Project {
  id: string;
  name: string;
}

interface LiveViewProps {
  project: Project;
  agents: Agent[];
  latestRun: Run | null;
}

const AGENT_COLORS: Record<string, string> = {
  "roberto-radar": "bg-blue-500",
  "lucas-linkedin": "bg-blue-600",
  "tiago-twitter": "bg-sky-500",
  "daniela-design": "bg-purple-500",
  "vera-veredito": "bg-yellow-500",
  "paulo-publicador": "bg-green-500",
};

type LogEntry = {
  agent?: string;
  message?: string;
  timestamp?: string;
  status?: string;
};

export function LiveView({ project, agents, latestRun }: LiveViewProps) {
  const [run, setRun] = useState<Run | null>(latestRun);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [polling, setPolling] = useState(false);
  const [topic, setTopic] = useState("");

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/status?projectId=${project.id}`);
      const data = await res.json();
      if (data.run) {
        setRun(data.run);
        const runLogs = Array.isArray(data.run.logs) ? data.run.logs : [];
        setLogs(runLogs as LogEntry[]);
        if (runLogs.length > 0) {
          const lastLog = runLogs[runLogs.length - 1] as LogEntry;
          if (lastLog?.agent) setActiveAgent(lastLog.agent);
        }
        if (data.run.status === "completed" || data.run.status === "failed") {
          setPolling(false);
        }
      }
    } catch {
      // silent
    }
  }, [project.id]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [polling, pollStatus]);

  async function startRun() {
    if (!topic.trim()) {
      toast.error("Informe o tópico do conteúdo");
      return;
    }
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRun(data.run);
      setLogs([]);
      setPolling(true);
      toast.success("Pipeline iniciado!");
    } catch {
      toast.error("Erro ao iniciar pipeline");
    }
  }

  const isRunning = run?.status === "running";

  return (
    <div className="p-6 h-screen flex flex-col max-h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className={cn("w-2.5 h-2.5 rounded-full", isRunning ? "bg-green-400 animate-pulse" : "")}
              style={!isRunning ? { background: "var(--border)" } : undefined}
            />
            Live View
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{project.name}</p>
        </div>

        <div className="flex items-center gap-3">
          {run && (
            <Badge
              variant={
                run.status === "completed" ? "success"
                : run.status === "failed" ? "destructive"
                : run.status === "running" ? "default"
                : "secondary"
              }
            >
              {run.status}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={pollStatus} disabled={isRunning}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 flex-1 overflow-hidden min-h-0">
        {/* Left: agents */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
            Agentes
          </h2>

          {agents.map((agent) => {
            const isActive = activeAgent === agent.id;
            return (
              <motion.div
                key={agent.id}
                className={cn("p-3 rounded-xl border transition-all duration-200", isActive ? "border-orange-500 bg-orange-500/5" : "")}
                style={!isActive ? { background: "var(--bg-card)", borderColor: "var(--border)" } : undefined}
                animate={isActive ? { scale: [1, 1.01, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", AGENT_COLORS[agent.id] ?? "bg-gray-500")}>
                    {agent.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                      {agent.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{agent.role}</p>
                  </div>
                  {isActive && <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />}
                </div>
              </motion.div>
            );
          })}

          {agents.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
              <Bot className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--border)" }} />
              Nenhum agente ativo
            </div>
          )}
        </div>

        {/* Center: logs */}
        <div className="flex flex-col overflow-hidden">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 shrink-0" style={{ color: "var(--text-muted)" }}>
            Atividade
          </h2>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {logs.length === 0 && !isRunning && (
              <div className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
                <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--border)" }} />
                Nenhuma atividade ainda
              </div>
            )}

            <AnimatePresence>
              {logs.map((log, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg border"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start gap-2">
                    {log.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                    ) : log.status === "failed" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      {log.agent && (
                        <p className="text-xs font-medium text-orange-500 mb-0.5">{log.agent}</p>
                      )}
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                        {log.message ?? JSON.stringify(log)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isRunning && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-orange-500">Agentes trabalhando...</p>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right: run control + posts */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Run control */}
          <div className="rounded-xl p-4 shrink-0 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              Executar pipeline
            </h2>
            <textarea
              className="w-full rounded-lg p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none mb-3 border"
              style={{
                background: "var(--bg-primary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
              rows={3}
              placeholder="Tópico ou instrução para os agentes..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <Button size="sm" className="w-full" onClick={startRun} disabled={isRunning} loading={isRunning}>
              {isRunning ? (
                <><Square className="w-3.5 h-3.5" />Rodando...</>
              ) : (
                <><Play className="w-3.5 h-3.5" />Iniciar</>
              )}
            </Button>
          </div>

          {/* Generated posts */}
          {run?.posts && run.posts.length > 0 && (
            <div className="flex-1 overflow-y-auto min-h-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                Posts gerados
              </h2>
              <div className="space-y-3">
                {run.posts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3 rounded-xl border"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">{post.platform}</Badge>
                      <Badge
                        variant={post.status === "published" ? "success" : post.status === "draft" ? "secondary" : "warning"}
                        className="text-xs"
                      >
                        {post.status}
                      </Badge>
                    </div>
                    {post.imageUrl && (
                      <img src={post.imageUrl} alt="Post image" className="w-full rounded-lg mb-2 object-cover max-h-24" />
                    )}
                    <p className="text-xs line-clamp-3" style={{ color: "var(--text-primary)" }}>
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run time */}
          {run && (
            <div className="text-xs space-y-1 shrink-0" style={{ color: "var(--text-muted)" }}>
              <div className="flex justify-between">
                <span>Iniciado</span>
                <span>{new Date(run.startedAt).toLocaleTimeString("pt-BR")}</span>
              </div>
              {run.endedAt && (
                <div className="flex justify-between">
                  <span>Finalizado</span>
                  <span>{new Date(run.endedAt).toLocaleTimeString("pt-BR")}</span>
                </div>
              )}
              {run.topic && (
                <div className="flex justify-between gap-2">
                  <span>Tópico</span>
                  <span className="text-right max-w-[150px] truncate" style={{ color: "var(--text-primary)" }}>
                    {run.topic}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
