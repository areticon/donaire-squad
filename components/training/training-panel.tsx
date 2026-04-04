"use client";

import { useState } from "react";
import {
  BookOpen,
  Shield,
  PenLine,
  Star,
  Lightbulb,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface ProjectContext {
  id: string;
  type: string;
  title: string;
  rawInput: string;
  compiled: string;
  createdAt: string | Date;
}

interface Project {
  id: string;
  name: string;
}

interface TrainingPanelProps {
  project: Project;
  initialContexts: ProjectContext[];
}

const CONTEXT_TYPES = [
  { id: "brand", label: "Manual de Marca", icon: Star, description: "Cores, tipografia, tom de voz, valores, identidade visual" },
  { id: "editorial", label: "Linha Editorial", icon: PenLine, description: "Pilares de conteudo, temas, angulos, narrativa da marca" },
  { id: "references", label: "Referencias", icon: Lightbulb, description: "Perfis inspiradores, posts de referencia, estilo visual desejado" },
  { id: "regulations", label: "Regulamentacoes", icon: Shield, description: "Leis, normas do setor, compliance, restricoes de conteudo" },
  { id: "examples", label: "Exemplos de Posts", icon: BookOpen, description: "Posts que funcionaram bem, formatos preferidos, cases de sucesso" },
];

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const found = CONTEXT_TYPES.find((t) => t.id === type);
  const Icon = found?.icon ?? BookOpen;
  return <Icon className={cn("w-4 h-4", className)} />;
}

function ContextCard({
  ctx,
  projectId,
  onDelete,
}: {
  ctx: ProjectContext;
  projectId: string;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCompiled, setShowCompiled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const typeInfo = CONTEXT_TYPES.find((t) => t.id === ctx.type);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/context`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextId: ctx.id }),
      });
      if (!res.ok) throw new Error();
      onDelete(ctx.id);
      toast.success("Contexto removido.");
    } catch {
      toast.error("Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div
        className="p-4 cursor-pointer flex items-start gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/10">
          <TypeIcon type={ctx.type} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{ctx.title}</h4>
            <Badge variant="secondary" className="text-[10px]">{typeInfo?.label ?? ctx.type}</Badge>
          </div>
          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>
            {ctx.rawInput.slice(0, 100)}...
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2 pt-3">
            <button
              onClick={() => setShowCompiled(false)}
              className={cn("text-xs px-3 py-1 rounded-lg transition-all", !showCompiled ? "bg-orange-500 text-white" : "")}
              style={showCompiled ? { color: "var(--text-muted)", background: "var(--bg-elevated)" } : undefined}
            >
              Texto original
            </button>
            <button
              onClick={() => setShowCompiled(true)}
              className={cn("text-xs px-3 py-1 rounded-lg transition-all flex items-center gap-1", showCompiled ? "bg-orange-500 text-white" : "")}
              style={!showCompiled ? { color: "var(--text-muted)", background: "var(--bg-elevated)" } : undefined}
            >
              <Sparkles className="w-3 h-3" />
              Compilado pela IA
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
            {showCompiled ? ctx.compiled : ctx.rawInput}
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              loading={deleting}
              className="text-xs text-red-400 border-red-500/20 hover:bg-red-500/10"
            >
              <Trash2 className="w-3 h-3" />
              Remover
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewContextForm({ projectId, onCreated }: { projectId: string; onCreated: (ctx: ProjectContext) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("brand");
  const [title, setTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !rawInput.trim()) {
      toast.error("Preencha o titulo e o conteudo.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, rawInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.context);
      setOpen(false);
      setTitle("");
      setRawInput("");
      toast.success("Contexto criado e compilado pela IA!");
    } catch {
      toast.error("Erro ao criar contexto.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full" variant="outline">
        <Plus className="w-4 h-4" />
        Adicionar contexto de treinamento
      </Button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Novo contexto</h4>
        <button onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>Cancelar</button>
      </div>

      {/* Type selector */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CONTEXT_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={cn("rounded-xl p-3 text-left border transition-all", type === t.id ? "border-orange-500 bg-orange-500/10" : "")}
            style={type !== t.id ? { borderColor: "var(--border)", background: "var(--bg-elevated)" } : undefined}
          >
            <t.icon className={cn("w-4 h-4 mb-1", type === t.id ? "text-orange-400" : "")} style={type !== t.id ? { color: "var(--text-muted)" } : undefined} />
            <p className="text-xs font-medium" style={{ color: type === t.id ? "var(--text-primary)" : "var(--text-muted)" }}>{t.label}</p>
            <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>{t.description}</p>
          </button>
        ))}
      </div>

      {/* Title */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Titulo do documento</label>
        <input
          className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          placeholder="Ex: Manual de Marca Areticon 2025"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Raw input */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }}>
          Conteudo / descricao
          <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
            — cole textos, descreva referencias, liste regras, etc.
          </span>
        </label>
        <textarea
          className="w-full text-sm px-3 py-2 rounded-xl border outline-none resize-none"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          rows={8}
          placeholder={
            type === "brand"
              ? "Ex: Nossa marca usa as cores laranja (#FF6B00) e preto. O tom de voz e direto, sem corporativismo. Nosso logo e minimalista..."
              : type === "editorial"
              ? "Ex: Pilares: Educacao (40%), Cases (30%), Opiniao (30%). Sempre comecar com dado ou pergunta provocadora..."
              : type === "regulations"
              ? "Ex: Somos do setor eletrico. Seguimos as normas ANEEL. Nao podemos fazer promessas de ROI sem dados verificados..."
              : type === "references"
              ? "Ex: Queremos um estilo parecido com @karpathy e @sama no Twitter — tecnico mas acessivel. Imagens clean, sem muito texto..."
              : "Cole exemplos de posts que funcionaram bem, ou descreva o formato ideal..."
          }
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
        />
        <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          A IA vai transformar esse texto em um documento estruturado que sera injetado no contexto de todos os agentes.
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
        <Button size="sm" onClick={handleSubmit} loading={loading}>
          <Sparkles className="w-3 h-3" />
          {loading ? "Compilando com IA..." : "Criar e compilar"}
        </Button>
      </div>
    </div>
  );
}

export function TrainingPanel({ project, initialContexts }: TrainingPanelProps) {
  const [contexts, setContexts] = useState<ProjectContext[]>(initialContexts);

  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>Treinamento da IA</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Adicione contexto de marca, linha editorial, regulamentacoes e referencias. A IA usa essas informacoes em todas as campanhas deste projeto.
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border p-4 flex gap-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <Eye className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Como funciona</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Voce fornece textos descritivos — manuais de marca, regras, posts de referencia, tom de voz. A IA (Claude) compila em um documento estruturado.
            Nas proximas campanhas, esse contexto e injetado automaticamente no prompt de todos os agentes (Roberto, Lucas, Tiago, Diana, Vera, Paulo).
          </p>
        </div>
      </div>

      {/* Existing contexts */}
      {contexts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
            {contexts.length} documento{contexts.length > 1 ? "s" : ""} de contexto
          </h3>
          {contexts.map((ctx) => (
            <ContextCard
              key={ctx.id}
              ctx={ctx}
              projectId={project.id}
              onDelete={(id) => setContexts((prev) => prev.filter((c) => c.id !== id))}
            />
          ))}
        </div>
      )}

      {contexts.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center" style={{ borderColor: "var(--border)" }}>
          <BookOpen className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--border)" }} />
          <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nenhum contexto adicionado</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Adicione documentos de contexto para que a IA entenda seu projeto em profundidade.
          </p>
        </div>
      )}

      {/* Add new */}
      <NewContextForm
        projectId={project.id}
        onCreated={(ctx) => setContexts((prev) => [ctx, ...prev])}
      />
    </div>
  );
}
