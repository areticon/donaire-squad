"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Lightbulb,
  Mic2,
  Users,
  Palette,
  Share2,
  Calendar,
  Rocket,
  ChevronRight,
  Bot,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  setupStep: number;
  niche?: string | null;
  targetAudience?: string | null;
  voice?: string | null;
  colorPalette?: string | null;
  postFrequency?: string | null;
  timezone?: string;
  status: string;
}

const STEPS = [
  { id: 0, icon: Lightbulb, label: "Ideação", color: "text-yellow-400" },
  { id: 1, icon: Mic2, label: "Voz & Estilo", color: "text-purple-400" },
  { id: 2, icon: Users, label: "Time de Agentes", color: "text-blue-400" },
  { id: 3, icon: Palette, label: "Design", color: "text-pink-400" },
  { id: 4, icon: Share2, label: "Redes Sociais", color: "text-green-400" },
  { id: 5, icon: Calendar, label: "Agenda", color: "text-cyan-400" },
  { id: 6, icon: Rocket, label: "Ativação", color: "text-orange-400" },
];

interface KanbanBoardProps {
  project: Project;
  editMode?: boolean;
}

export function KanbanBoard({ project, editMode = false }: KanbanBoardProps) {
  const router = useRouter();

  // If returning from OAuth (?step=N), jump to that step
  const initialStep = (() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("step");
      if (s !== null) return Math.min(parseInt(s), STEPS.length - 1);
    }
    return Math.min(project.setupStep, STEPS.length - 1);
  })();

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Show success toast when returning from OAuth and clean up URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin") === "success") {
      toast.success("LinkedIn conectado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("twitter") === "success") {
      toast.success("X (Twitter) conectado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState("");

  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    niche: project.niche ?? "",
    targetAudience: project.targetAudience ?? "",
    voice: project.voice ?? "",
    colorPalette: project.colorPalette ?? "#F97316,#0D0D0D,#F5F5F5",
    postFrequency: project.postFrequency ?? "3x por semana",
    timezone: project.timezone ?? "America/Sao_Paulo",
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const saveAndNext = useCallback(async () => {
    setSaving(true);
    const nextStep = currentStep + 1;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          setupStep: nextStep,
          status: nextStep >= STEPS.length ? "active" : "setup",
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");

      if (nextStep >= STEPS.length) {
        if (editMode) {
          toast.success("Configurações salvas!");
          router.push(`/projects/${project.id}/posts`);
        } else {
          toast.success("Projeto ativado! Vamos gerar sua primeira campanha.");
          router.push(`/projects/${project.id}/posts`);
        }
      } else {
        setCurrentStep(nextStep);
      }
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [currentStep, form, project.id, router, editMode]);

  const askAI = useCallback(
    async (message: string) => {
      setAiLoading(true);
      setAiReply("");
      try {
        const res = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, context: form }),
        });
        const data = await res.json();
        setAiReply(data.reply);
      } catch {
        setAiReply("Erro ao consultar o assistente. Tente novamente.");
      } finally {
        setAiLoading(false);
      }
    },
    [form]
  );

  const progress = Math.round(((currentStep + 1) / STEPS.length) * 100);

  return (
    <div className="p-8 max-w-4xl mx-auto overflow-x-hidden">
      {/* Edit mode warning */}
      {editMode && !warningDismissed && (
        <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-700/40 rounded-xl flex items-start gap-3">
          <span className="text-yellow-400 text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-400 mb-1">Você está editando um projeto ativo</p>
            <p className="text-xs text-[var(--text-muted)]">
              Alterações no nicho, tom de voz ou público-alvo podem afetar a consistência editorial dos próximos posts gerados. Edite com cuidado e salve apenas o que for realmente necessário.
            </p>
          </div>
          <button onClick={() => setWarningDismissed(true)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs shrink-0">
            Entendi
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[var(--text-primary)] mb-1">
          {project.name}
        </h1>
        <p className="text-[var(--text-muted)]">Configure seu projeto em 7 etapas</p>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">
              Etapa {currentStep + 1} de {STEPS.length}
            </span>
            <span className="text-orange-400 font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <button
              key={step.id}
              onClick={() => i <= currentStep && setCurrentStep(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                active
                  ? "bg-orange-500/10 border border-orange-500/30 text-orange-400"
                  : done
                  ? "bg-green-900/20 border border-green-800/30 text-green-400 cursor-pointer hover:bg-green-900/30"
                  : "border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
              )}
              style={!active && !done ? { background: "var(--bg-elevated)" } : undefined}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {step.label}
              {done && <span className="text-green-400">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          className="border rounded-2xl p-8"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          {currentStep === 0 && <StepIdeation form={form} set={set} askAI={askAI} />}
          {currentStep === 1 && <StepVoice form={form} set={set} askAI={askAI} />}
          {currentStep === 2 && <StepAgents form={form} set={set} askAI={askAI} />}
          {currentStep === 3 && <StepDesign form={form} set={set} askAI={askAI} />}
          {currentStep === 4 && <StepNetworks projectId={project.id} />}
          {currentStep === 5 && <StepSchedule form={form} set={set} askAI={askAI} />}
          {currentStep === 6 && <StepActivation project={project} form={form} />}

          {/* AI Assistant reply */}
          {(aiLoading || aiReply) && (
            <div className="mt-6 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2 text-orange-400 text-sm font-medium">
                <Bot className="w-4 h-4" />
                Assistente IA
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pensando...
                </div>
              ) : (
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                  {aiReply}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0 || saving}
        >
          Anterior
        </Button>
        <Button onClick={saveAndNext} loading={saving}>
          {currentStep === STEPS.length - 1 ? (
            <>
              <Rocket className="w-4 h-4" />
              Ativar projeto
            </>
          ) : (
            <>
              Próxima etapa
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Step components ──────────────────────────────────────────────────────────

function StepIdeation({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Ideação — O que é seu projeto?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina o nome, nicho e público-alvo. Nosso assistente pode ajudar.
        </p>
      </div>

      <Input
        label="Nome do projeto"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Ex: Conteúdo Tech LinkedIn"
      />

      <Textarea
        label="Descrição"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Descreva o objetivo deste projeto..."
        className="min-h-[80px]"
      />

      <Input
        label="Nicho"
        value={form.niche}
        onChange={(e) => set("niche", e.target.value)}
        placeholder="Ex: Tecnologia B2B, Startups, Marketing Digital"
      />

      <Textarea
        label="Público-alvo"
        value={form.targetAudience}
        onChange={(e) => set("targetAudience", e.target.value)}
        placeholder="Quem você quer atingir? Cargo, setor, dores..."
        className="min-h-[80px]"
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Com base nessas informações: nicho "${form.niche}", público "${form.targetAudience}", me dê 3 sugestões de estratégia de conteúdo para LinkedIn e X no Brasil.`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Pedir sugestões ao assistente
      </Button>
    </div>
  );
}

function StepVoice({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Voz & Estilo — Como você quer soar?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina o tom de voz dos seus conteúdos. O assistente gera o guia automaticamente.
        </p>
      </div>

      <Textarea
        label="Tom de voz e estilo"
        value={form.voice}
        onChange={(e) => set("voice", e.target.value)}
        placeholder="Ex: Provocativo mas respeitoso. Fala de igual para igual com líderes de tecnologia. Usa dados para argumentar. Nunca condescendente..."
        className="min-h-[160px]"
      />

      <div className="grid grid-cols-2 gap-3">
        {[
          "Autoritário e técnico",
          "Provocativo e direto",
          "Educativo e acessível",
          "Inspiracional e humano",
        ].map((preset) => (
          <button
            key={preset}
            onClick={() => set("voice", `Tom: ${preset}. Linguagem clara, dados como argumento, sem jargão excessivo.`)}
            className="p-3 text-left rounded-lg border text-sm text-[var(--text-muted)] hover:border-orange-500/30 hover:text-orange-400 transition-all"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            {preset}
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Crie um guia de voz e estilo completo para um projeto no nicho "${form.niche}" voltado para "${form.targetAudience}". Inclua: tom, palavras proibidas, exemplos de frases, o que fazer e o que nunca fazer.`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Gerar guia de voz automaticamente
      </Button>
    </div>
  );
}

function StepAgents({
  form,
  set: _set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  const DEFAULT_AGENTS = [
    { name: "Roberto Radar", role: "Pesquisador", desc: "Pesquisa tendências e dados relevantes para o nicho", active: true },
    { name: "Lucas LinkedIn", role: "Redator LinkedIn", desc: "Escreve posts virais para LinkedIn com seu tom de voz", active: true },
    { name: "Tiago Twitter", role: "Redator X", desc: "Cria threads e posts para X/Twitter", active: true },
    { name: "Daniela Design", role: "Visual Designer", desc: "Gera infográficos com Gemini AI", active: true },
    { name: "Paulo Publicador", role: "Publicador", desc: "Distribui conteúdo em todas as redes", active: true },
    { name: "Vera Veredito", role: "Revisora", desc: "Revisa e aprova o conteúdo antes da publicação", active: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Time de Agentes — Sua equipe de IA
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Ative os agentes que vão trabalhar neste projeto. Você pode configurar cada um em detalhes depois.
        </p>
      </div>

      <div className="space-y-3">
        {DEFAULT_AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center gap-4 p-4 rounded-xl border"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20 shrink-0">
              <span className="text-orange-400 text-xs font-bold">
                {agent.name.split(" ").map((n) => n[0]).join("")}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{agent.name}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {agent.role} · {agent.desc}
              </p>
            </div>
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Para um projeto no nicho "${form.niche}", qual seria a configuração ideal de agentes de IA para redes sociais? Quais personas, habilidades e fluxo de trabalho recomenda?`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Recomendar configuração ideal
      </Button>
    </div>
  );
}

function StepDesign({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Design — Identidade visual
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina a paleta de cores e estilo visual dos infográficos gerados.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-[var(--text-primary)] block mb-3">
          Paleta de cores (hex separados por vírgula)
        </label>
        <Input
          value={form.colorPalette}
          onChange={(e) => set("colorPalette", e.target.value)}
          placeholder="#F97316,#0D0D0D,#F5F5F5"
        />
        <div className="flex gap-2 mt-3">
          {form.colorPalette.split(",").map((color, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-md border border-[var(--border)]"
              style={{ backgroundColor: color.trim() }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Presets de paleta
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: "Dark Orange (padrão)", value: "#F97316,#0D0D0D,#F5F5F5" },
            { name: "Midnight Blue", value: "#3B82F6,#0F172A,#E2E8F0" },
            { name: "Emerald", value: "#10B981,#0D1F1A,#F0FDF4" },
            { name: "Purple Pro", value: "#8B5CF6,#0D0D1F,#F5F5FF" },
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => set("colorPalette", preset.value)}
              className="p-2.5 text-left rounded-lg border text-xs text-[var(--text-muted)] hover:border-orange-500/30 flex items-center gap-2"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <div className="flex gap-1">
                {preset.value.split(",").map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </div>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Sugira uma paleta de cores e estilo visual para um projeto no nicho "${form.niche}" voltado para "${form.targetAudience}". Seja específico com códigos hex.`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Sugerir paleta ideal para meu nicho
      </Button>
    </div>
  );
}

function StepNetworks({ projectId }: { projectId: string }) {
  const [connected, setConnected] = useState<string[]>([]);

  // returnTo points back to this wizard so the user returns here after OAuth
  const returnTo = `/projects/${projectId}?step=4`;

  const refresh = () => {
    fetch(`/api/social/connect?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setConnected((d.storedAccounts ?? []).filter((a: { isActive: boolean }) => a.isActive).map((a: { platform: string }) => a.platform)));
  };

  useEffect(() => {
    refresh();
    // If we just returned from OAuth, refresh accounts
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin") === "success" || params.get("twitter") === "success") {
      refresh();
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const NETWORKS = [
    { platform: "linkedin", label: "LinkedIn", icon: "in", color: "bg-blue-600", connectUrl: `/api/social/linkedin/connect?projectId=${projectId}&returnTo=${encodeURIComponent(returnTo)}` },
    { platform: "twitter", label: "X (Twitter)", icon: "𝕏", color: "bg-slate-800", connectUrl: `/api/social/twitter/connect?projectId=${projectId}&returnTo=${encodeURIComponent(returnTo)}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Redes Sociais — Conecte suas contas
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Configure as redes onde seus agentes vão publicar. Você pode pular e conectar depois.
        </p>
      </div>

      <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl text-sm text-orange-400">
        💡 Você pode pular agora e conectar depois. Sem redes conectadas, os agentes criam os posts mas <strong>não publicam automaticamente</strong>.
      </div>

      <div className="grid grid-cols-1 gap-3">
        {NETWORKS.map((net) => {
          const isConnected = connected.includes(net.platform);
          return (
            <div
              key={net.platform}
              className="p-4 rounded-xl border flex items-center gap-4"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <div className={`w-9 h-9 ${net.color} rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {net.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{net.label}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {isConnected ? "Conta conectada ✓" : "Autorize via OAuth — sem senha"}
                </p>
              </div>
              {isConnected ? (
                <span className="text-xs px-3 py-1.5 rounded-lg bg-green-900/20 border border-green-800/40 text-green-400">
                  conectado
                </span>
              ) : (
                <a
                  href={net.connectUrl}
                  className="text-xs px-3 py-1.5 rounded-lg border text-[var(--text-muted)] hover:border-orange-500/40 hover:text-orange-400 transition-all"
                  style={{ borderColor: "var(--border)" }}
                >
                  Conectar
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Também é possível conectar depois em{" "}
        <a href={`/projects/${projectId}/settings`} className="text-orange-400 underline">
          Configurações → Redes Sociais
        </a>.
      </p>
    </div>
  );
}

function StepSchedule({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Agenda — Frequência de publicação
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina com que frequência seus agentes vão criar e publicar conteúdo.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-[var(--text-primary)] block mb-3">
          Frequência de posts
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            "1x por semana",
            "2x por semana",
            "3x por semana",
            "5x por semana",
            "1x por dia",
            "Personalizado",
          ].map((freq) => (
            <button
              key={freq}
              onClick={() => set("postFrequency", freq)}
              className={cn(
                "p-3 text-sm rounded-lg border transition-all",
                form.postFrequency === freq
                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                  : "text-[var(--text-muted)] hover:border-orange-500/30"
              )}
              style={form.postFrequency !== freq ? { background: "var(--bg-primary)", borderColor: "var(--border)" } : undefined}
            >
              {freq}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Fuso horário"
        value={form.timezone}
        onChange={(e) => set("timezone", e.target.value)}
        placeholder="America/Sao_Paulo"
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Qual a melhor frequência e horários de publicação para um projeto no nicho "${form.niche}" no Brasil para LinkedIn e X? Considere o público "${form.targetAudience}".`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Recomendar frequência ideal
      </Button>
    </div>
  );
}

function StepActivation({
  project,
  form,
}: {
  project: Project;
  form: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Ativação — Tudo pronto!
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Revise as configurações e ative seu projeto.
        </p>
      </div>

      <div className="space-y-3">
        {[
          { label: "Nome do projeto", value: form.name },
          { label: "Nicho", value: form.niche || "—" },
          { label: "Público-alvo", value: form.targetAudience || "—" },
          { label: "Frequência", value: form.postFrequency },
          { label: "Fuso horário", value: form.timezone },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-4 p-3 rounded-lg border"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <span className="text-xs text-[var(--text-muted)] min-w-[120px]">
              {item.label}
            </span>
            <span className="text-sm text-[var(--text-primary)] flex-1">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="p-4 bg-green-900/20 border border-green-800/40 rounded-xl">
        <p className="text-sm text-green-400">
          ✓ Ao clicar em &quot;Ativar projeto&quot;, seu squad de agentes estará pronto para criar e publicar conteúdo automaticamente.
        </p>
      </div>
    </div>
  );
}
