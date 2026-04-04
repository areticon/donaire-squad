"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  agentId: string;
  name: string;
  role: string;
  persona: string | null;
  style: string | null;
  skills: unknown[];
  tasks: unknown[];
  isActive: boolean;
}

interface Project {
  id: string;
  name: string;
}

interface AgentsConfigProps {
  project: Project;
  agents: Agent[];
}

const DEFAULT_AGENTS = [
  {
    agentId: "roberto-radar",
    name: "Roberto Radar",
    role: "Pesquisador",
    persona: "Analista sênior de tendências, meticuloso e orientado a dados. Cita fontes verificáveis.",
    style: "Objetivo, factual, usa dados como argumento principal.",
    skills: ["web-search", "data-analysis"],
  },
  {
    agentId: "lucas-linkedin",
    name: "Lucas LinkedIn",
    role: "Redator LinkedIn",
    persona: "Redator especialista em LinkedIn B2B, mestre em hooks virais e storytelling profissional.",
    style: "Provocativo mas respeitoso, direto ao ponto, usa dados para gerar insight.",
    skills: ["content-writing", "linkedin-optimization"],
  },
  {
    agentId: "tiago-twitter",
    name: "Tiago Twitter",
    role: "Redator X",
    persona: "Especialista em threads e posts curtos para X/Twitter. Criativo e ágil.",
    style: "Conciso, impactante, sabe quando usar threads e quando posts únicos batem mais.",
    skills: ["content-writing", "twitter-optimization"],
  },
  {
    agentId: "daniela-design",
    name: "Daniela Design",
    role: "Visual Designer",
    persona: "Designer de conteúdo com foco em infográficos de dados para redes sociais.",
    style: "Estética industrial, dark mode, infográficos limpos e autorais com Gemini AI.",
    skills: ["image-generator"],
  },
  {
    agentId: "vera-veredito",
    name: "Vera Veredito",
    role: "Revisora",
    persona: "Revisora crítica que verifica tom, dados, aderência à voz da marca e qualidade geral.",
    style: "Rigorosa, construtiva, foca em melhoria contínua.",
    skills: ["review", "quality-control"],
  },
  {
    agentId: "paulo-publicador",
    name: "Paulo Publicador",
    role: "Publicador",
    persona: "Especialista em publicação multicanal e timing estratégico.",
    style: "Eficiente e preciso na publicação nas redes corretas no momento certo.",
    skills: ["blotato"],
  },
];

export function AgentsConfig({ project, agents: initialAgents }: AgentsConfigProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, Partial<Agent>>>({});

  function startEdit(agent: Agent) {
    setEditForm((prev) => ({
      ...prev,
      [agent.id]: {
        name: agent.name,
        role: agent.role,
        persona: agent.persona ?? "",
        style: agent.style ?? "",
      },
    }));
    setExpanded(agent.id);
  }

  function setField(agentId: string, field: string, value: string) {
    setEditForm((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], [field]: value },
    }));
  }

  async function saveAgent(agent: Agent) {
    setSaving(agent.id);
    const updates = editForm[agent.id] ?? {};
    try {
      const res = await fetch(
        `/api/projects/${project.id}/agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...agent, ...updates }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, ...updates } : a))
      );
      toast.success(`${agent.name} atualizado`);
    } catch {
      toast.error("Erro ao salvar agente");
    } finally {
      setSaving(null);
    }
  }

  async function toggleAgent(agent: Agent) {
    try {
      const res = await fetch(
        `/api/projects/${project.id}/agents/${agent.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...agent, isActive: !agent.isActive }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id ? { ...a, isActive: !a.isActive } : a
        )
      );
    } catch {
      toast.error("Erro ao atualizar agente");
    }
  }

  async function addDefaultAgents() {
    const missing = DEFAULT_AGENTS.filter(
      (d) => !agents.some((a) => a.agentId === d.agentId)
    );

    for (const agent of missing) {
      try {
        const res = await fetch(`/api/projects/${project.id}/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(agent),
        });
        const data = await res.json();
        if (res.ok) setAgents((prev) => [...prev, data.agent]);
      } catch {
        // continue
      }
    }
    toast.success("Agentes padrão adicionados");
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>
            Agentes de IA
          </h1>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>{project.name}</p>
        </div>
        {agents.length === 0 && (
          <Button onClick={addDefaultAgents}>
            <Plus className="w-4 h-4" />
            Adicionar squad padrão
          </Button>
        )}
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-20">
          <Bot className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--border)" }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            Nenhum agente configurado
          </h2>
          <p className="mb-6" style={{ color: "var(--text-muted)" }}>
            Adicione o squad padrão ou crie agentes customizados
          </p>
          <Button onClick={addDefaultAgents}>
            <Zap className="w-4 h-4" />
            Adicionar squad padrão
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const form = editForm[agent.id] ?? {};
            const isExpanded = expanded === agent.id;

            return (
              <div
                key={agent.id}
                className={cn("border rounded-xl transition-all duration-200", !agent.isActive && "opacity-60")}
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                {/* Header */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => {
                    if (isExpanded) setExpanded(null);
                    else startEdit(agent);
                  }}
                >
                  <div className="w-10 h-10 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20 shrink-0">
                    <span className="text-orange-400 text-xs font-bold">
                      {agent.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                        {agent.name}
                      </span>
                      <Badge variant={agent.isActive ? "success" : "secondary"}>
                        {agent.isActive ? "ativo" : "inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{agent.role}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAgent(agent);
                      }}
                      className={cn(
                        "text-xs px-3 py-1 rounded-full border transition-all",
                        agent.isActive
                          ? "border-red-800/50 text-red-400 hover:bg-red-900/20"
                          : "border-green-800/50 text-green-400 hover:bg-green-900/20"
                      )}
                    >
                      {agent.isActive ? "Desativar" : "Ativar"}
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    ) : (
                      <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    )}
                  </div>
                </div>

                {/* Edit form */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Nome"
                            value={(form.name as string) ?? agent.name}
                            onChange={(e) => setField(agent.id, "name", e.target.value)}
                          />
                          <Input
                            label="Função"
                            value={(form.role as string) ?? agent.role}
                            onChange={(e) => setField(agent.id, "role", e.target.value)}
                          />
                        </div>

                        <Textarea
                          label="Persona (quem é este agente?)"
                          value={(form.persona as string) ?? agent.persona ?? ""}
                          onChange={(e) => setField(agent.id, "persona", e.target.value)}
                          className="min-h-[80px]"
                          placeholder="Descreva a personalidade, background e especialidade..."
                        />

                        <Textarea
                          label="Estilo de trabalho"
                          value={(form.style as string) ?? agent.style ?? ""}
                          onChange={(e) => setField(agent.id, "style", e.target.value)}
                          className="min-h-[80px]"
                          placeholder="Como este agente trabalha, tom de voz, abordagem..."
                        />

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveAgent(agent)}
                            loading={saving === agent.id}
                          >
                            <Save className="w-3.5 h-3.5" />
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setExpanded(null);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
