"use client";

import { useState, useCallback, useEffect } from "react";
import { LOGO_POR_REDE, type RedeComLogo } from "@/components/social/logos-redes";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrandMarkThemed } from "@/components/brand-mark-client";
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
import { SetupPreview } from "@/components/kanban/setup-preview";
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
  // JsonValue do Prisma: pode ser objeto, mas o tipo não garante.
  config?: unknown;
}

// As redes vêm primeiro, por decisão de produto de 21/08: conectar as contas
// logo na chegada é o que vai permitir à plataforma ler o perfil e
// pré-preencher o resto do assistente, e mesmo antes dessa análise existir,
// pedir a conexão de cara aumenta quantos terminam com rede conectada, sem a
// qual nada publica sozinho.
const STEPS = [
  { id: 0, icon: Share2, label: "Redes Sociais", color: "text-green-400" },
  // Voz ANTES de Ideação, por correção do Bruno em 22/08: pedir ideia antes
  // de conhecer voz, referências e temas de domínio produz ideia genérica,
  // que não conecta com o universo de quem vai publicar.
  { id: 1, icon: Mic2, label: "Voz & Estilo", color: "text-purple-400" },
  { id: 2, icon: Lightbulb, label: "Ideação", color: "text-yellow-400" },
  { id: 3, icon: Users, label: "Time de Agentes", color: "text-blue-400" },
  { id: 4, icon: Palette, label: "Design", color: "text-pink-400" },
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
    colorPalette: project.colorPalette ?? "#F97316,#1e1f22,#dbdee1",
    postFrequency: project.postFrequency ?? "3x por semana",
    timezone: project.timezone ?? "America/Sao_Paulo",
    // Vive dentro de config (Json) para não exigir migration: são os perfis
    // que o cliente quer modelar, e alimentam o pré-preenchimento por IA.
    references: String(
      (typeof project.config === "object" && project.config !== null
        ? (project.config as Record<string, unknown>).references
        : "") ?? ""
    ),
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
          // `references` não é coluna: persiste dentro do config (Json),
          // preservando o que já existir lá.
          config: {
            ...(typeof project.config === "object" && project.config !== null
              ? (project.config as Record<string, unknown>)
              : {}),
            references: form.references,
          },
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

  /**
   * A IA preenche os campos em vez de só sugerir em texto (pedido do Bruno no
   * teste de 21/08: "sugerir e preencher, com opção de pedir ajuste"). Pede um
   * JSON com exatamente as chaves dos campos, aplica o que voltar e deixa a
   * pessoa editar ou pedir refinamento com uma instrução extra.
   */
  const preencherIA = useCallback(
    async (campos: string[], instrucao?: string) => {
      setAiLoading(true);
      setAiReply("");
      try {
        const res = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              `Preencha os campos do projeto com uma proposta concreta e específica, pronta para uso. ` +
              `Responda SOMENTE um objeto JSON válido, sem markdown e sem texto fora dele, com as chaves: ${campos.join(", ")} ` +
              `e opcionalmente "observacao" (uma frase curta explicando as escolhas). ` +
              `Nas strings, não use quebras de linha cruas; se precisar de parágrafos, use \\n. ` +
              (instrucao ? `Leve em conta este pedido do usuário: ${instrucao}. ` : "") +
              `Use o contexto atual do projeto, especialmente as referências e inspirações se houver, e escreva em português.`,
            context: form,
          }),
        });
        const data = await res.json();
        const bruto = String(data.reply ?? "");
        // O modelo desobedece formato de vez em quando (lição da sessão de
        // 18/08): extrai o primeiro bloco {...} e valida em código.
        const bloco = bruto.match(/\{[\s\S]*\}/)?.[0];
        if (!bloco) throw new Error("resposta sem JSON");
        const obj = JSON.parse(bloco) as Record<string, unknown>;
        const aplicados: string[] = [];
        for (const campo of campos) {
          const valor = obj[campo];
          if (typeof valor === "string" && valor.trim()) {
            set(campo, valor.trim());
            aplicados.push(campo);
          }
        }
        if (aplicados.length === 0) throw new Error("JSON sem os campos pedidos");
        setAiReply(
          (typeof obj.observacao === "string" && obj.observacao.trim()) ||
            "Preenchi com uma proposta. Edite à vontade, ou me diga o que considerar e clique em Ajustar."
        );
      } catch {
        setAiReply("Não consegui montar a proposta agora. Tente de novo em instantes.");
      } finally {
        setAiLoading(false);
      }
    },
    [form]
  );

  const progress = Math.round(((currentStep + 1) / STEPS.length) * 100);

  return (
    // Projeto em setup toma a tela inteira, sem a sidebar em volta: usuário
    // novo merece foco total no assistente, padrão Neon/Supabase/Vercel
    // (feedback do teste de jornada de 20/08). Em modo edição (projeto ativo),
    // o layout normal da plataforma continua valendo.
    <div
      className={cn(!editMode && "fixed inset-0 z-40 overflow-y-auto")}
      style={!editMode ? { background: "var(--bg-primary)" } : undefined}
    >
      {!editMode && (
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b backdrop-blur-sm"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-primary) 85%, transparent)" }}
        >
          <div className="flex items-center gap-2">
            <BrandMarkThemed className="h-7 w-7 rounded-md" size={28} />
            <span className="font-bold lowercase text-[var(--text-primary)]">demandou</span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Continuar depois
          </Link>
        </div>
      )}
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
          {currentStep === 0 && <StepNetworks projectId={project.id} />}
          {currentStep === 1 && <StepVoice form={form} set={set} preencherIA={preencherIA} aiLoading={aiLoading} projectId={project.id} />}
          {currentStep === 2 && <StepIdeation form={form} set={set} preencherIA={preencherIA} aiLoading={aiLoading} />}
          {currentStep === 3 && <StepAgents form={form} set={set} askAI={askAI} />}
          {currentStep === 4 && <StepDesign form={form} set={set} askAI={askAI} />}
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
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto pr-2">
                  {limparMarkdown(aiReply ?? "")}
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
    </div>
  );
}

/**
 * O prompt manda o modelo responder em texto puro, mas modelo desobedece de
 * vez em quando (lição da sessão de 18/08: valide em código o que você pediu
 * na instrução). Isto tira o Markdown residual antes de exibir.
 */
function limparMarkdown(texto: string): string {
  return texto
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`{1,3}/g, "");
}

// ── Step components ──────────────────────────────────────────────────────────

const CAMPOS_IDEACAO = ["name", "description", "niche", "targetAudience"];

function StepIdeation({
  form,
  set,
  preencherIA,
  aiLoading,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  preencherIA: (campos: string[], instrucao?: string) => void;
  aiLoading: boolean;
}) {
  const [ajuste, setAjuste] = useState("");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Ideação — O que é seu projeto?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Conte suas referências e deixe a IA propor o resto; tudo fica
          editável.
        </p>
      </div>

      <Textarea
        label="Referências e inspirações"
        value={form.references}
        onChange={(e) => set("references", e.target.value)}
        placeholder="Perfis de influenciadores e autoridades da sua área que você quer modelar. Ex: @fulano no LinkedIn, @beltrano no Instagram, canal Sicrano no YouTube..."
        className="min-h-[80px]"
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          size="sm"
          loading={aiLoading}
          onClick={() => preencherIA(CAMPOS_IDEACAO)}
        >
          <Bot className="w-3.5 h-3.5" />
          Preencher com IA
        </Button>
        <div className="flex flex-1 gap-2">
          <Input
            value={ajuste}
            onChange={(e) => setAjuste(e.target.value)}
            placeholder="Quer ajustar? Diga o que a IA deve considerar..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={aiLoading || !ajuste.trim()}
            onClick={() => preencherIA(CAMPOS_IDEACAO, ajuste.trim())}
          >
            Ajustar
          </Button>
        </div>
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
    </div>
  );
}

function StepVoice({
  form,
  set,
  preencherIA,
  aiLoading,
  projectId,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  preencherIA: (campos: string[], instrucao?: string) => void;
  aiLoading: boolean;
  projectId: string;
}) {
  const [ajuste, setAjuste] = useState("");
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

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          size="sm"
          loading={aiLoading}
          onClick={() =>
            preencherIA(
              ["voice"],
              "o campo voice deve ser um guia de voz completo: tom, palavras proibidas, exemplos de frases, o que fazer e o que nunca fazer"
            )
          }
        >
          <Bot className="w-3.5 h-3.5" />
          Gerar e preencher o guia de voz
        </Button>
        <div className="flex flex-1 gap-2">
          <Input
            value={ajuste}
            onChange={(e) => setAjuste(e.target.value)}
            placeholder="Quer ajustar? Ex: mais provocativo, sem emojis..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={aiLoading || !ajuste.trim()}
            onClick={() =>
              preencherIA(
                ["voice"],
                `o campo voice deve ser um guia de voz completo (tom, palavras proibidas, exemplos, o que fazer e o que nunca fazer). Pedido do usuário: ${ajuste.trim()}`
              )
            }
          >
            Ajustar
          </Button>
        </div>
      </div>

      {/* A prova de que funciona vem aqui, no passo 2 de 7, e não no 7.
          Sem isto o cliente paga o cartão e só vê o produto no último passo. */}
      <SetupPreview
        projectId={projectId}
        pronto={Boolean(form.voice && form.voice.trim().length > 20 && form.niche)}
      />
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
          placeholder="#F97316,#1e1f22,#dbdee1"
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
            { name: "Dark Orange (padrão)", value: "#F97316,#1e1f22,#dbdee1" },
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
  const returnTo = `/projects/${projectId}?step=0`;

  const refresh = () => {
    fetch(`/api/social/connect?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setConnected((d.storedAccounts ?? []).filter((a: { isActive: boolean }) => a.isActive).map((a: { platform: string }) => a.platform)));
  };

  // Quais redes tem credencial no servidor. Perguntado em runtime de
  // proposito: ver app/api/social/providers/route.ts.
  const [prontas, setProntas] = useState<Record<string, boolean>>({});

  // A conexão acontece em outra aba; quando esta volta ao foco, o status
  // verde precisa aparecer sem recarregar na mão.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
    fetch("/api/social/providers")
      .then((r) => r.json())
      .then(setProntas)
      .catch(() => setProntas({}));

    // Retorno do OAuth. Antes só LinkedIn e X eram lidos aqui, então uma
    // conexão de Facebook que falhava voltava para uma tela que não dizia
    // absolutamente nada (achado do teste de 21/08: o Facebook não conectou
    // e a plataforma ficou muda, com o Bruno recarregando à toa).
    const params = new URLSearchParams(window.location.search);
    const REDES = ["linkedin", "twitter", "instagram", "facebook", "youtube"] as const;
    const NOMES: Record<string, string> = {
      linkedin: "LinkedIn",
      twitter: "X (Twitter)",
      instagram: "Instagram",
      facebook: "Facebook",
      youtube: "YouTube",
    };
    const MOTIVOS: Record<string, string> = {
      "sem-pagina":
        "Nenhuma página foi liberada. Na tela da Meta, escolha Editar configurações e marque a página que o squad vai usar.",
    };

    for (const rede of REDES) {
      const estado = params.get(rede);
      if (!estado) continue;
      if (estado === "success") {
        toast.success(`${NOMES[rede]} conectado com sucesso.`);
        refresh();
      } else if (estado === "error") {
        const motivo = params.get("motivo");
        toast.error(
          motivo && MOTIVOS[motivo]
            ? MOTIVOS[motivo]
            : `Não consegui conectar o ${NOMES[rede]}. Tente de novo.`,
          { duration: 8000 }
        );
      }
      // Limpa a URL para o aviso não repetir a cada recarga.
      const limpa = new URL(window.location.href);
      REDES.forEach((r) => limpa.searchParams.delete(r));
      limpa.searchParams.delete("motivo");
      window.history.replaceState({}, "", limpa.toString());
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Logos oficiais em SVG, não texto dentro de um círculo. Ver
  // components/social/logos-redes.tsx.
  const conectar = (rede: string) =>
    `/api/social/${rede}/connect?projectId=${projectId}&returnTo=${encodeURIComponent(returnTo)}`;

  const NETWORKS: Array<{
    platform: RedeComLogo;
    label: string;
    descricao: string;
    connectUrl: string;
  }> = [
    { platform: "linkedin", label: "LinkedIn", descricao: "Autorize via OAuth, sem senha", connectUrl: conectar("linkedin") },
    { platform: "instagram", label: "Instagram", descricao: "Conta profissional, autorize via OAuth", connectUrl: conectar("instagram") },
    { platform: "twitter", label: "X (Twitter)", descricao: "Autorize via OAuth, sem senha", connectUrl: conectar("twitter") },
    { platform: "facebook", label: "Facebook", descricao: "Publica na sua página, autorize via OAuth", connectUrl: conectar("facebook") },
    { platform: "youtube", label: "YouTube", descricao: "Publica os vídeos do seu canal", connectUrl: conectar("youtube") },
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
              {(() => {
                const Logo = LOGO_POR_REDE[net.platform];
                return <Logo />;
              })()}
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{net.label}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {isConnected ? "Conta conectada ✓" : net.descricao}
                </p>
              </div>
              {isConnected ? (
                <span className="text-xs px-3 py-1.5 rounded-lg bg-green-900/20 border border-green-800/40 text-green-400">
                  conectado
                </span>
              ) : prontas[net.platform] ? (
                <a
                  href={net.connectUrl}
                  // Aba nova por pedido do Bruno (21/08): o OAuth de serviço em
                  // que a pessoa ainda não está logada vira um vai e vem que
                  // destrói a aba do assistente. A aba original se atualiza
                  // sozinha ao receber o foco de volta.
                  target="_blank"
                  rel="noopener"
                  className="text-xs px-3 py-1.5 rounded-lg border text-[var(--text-muted)] hover:border-orange-500/40 hover:text-orange-400 transition-all"
                  style={{ borderColor: "var(--border)" }}
                >
                  Conectar
                </a>
              ) : (
                <span
                  className="text-xs px-3 py-1.5 rounded-lg border text-[var(--text-muted)] opacity-60"
                  style={{ borderColor: "var(--border)" }}
                >
                  em breve
                </span>
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
