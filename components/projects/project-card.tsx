"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Zap, Users, FolderKanban, Trash2, MoreVertical, Pencil, Archive, ArchiveRestore, X, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUS_LABELS: Record<string, string> = {
  setup: "Configurando",
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
};

const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "secondary"> = {
  setup: "secondary",
  active: "success",
  paused: "warning",
  archived: "secondary",
};

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    niche: string | null;
    updatedAt: Date;
    _count: { agents: number; posts: number };
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(project.description ?? "");
  const menuRef = useRef<HTMLDivElement>(null);
  const isArchived = project.status === "archived";

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handlePatch(data: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await handlePatch({ name: editName.trim(), description: editDescription.trim() || null });
      toast.success("Projeto atualizado.");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(false);
    const newStatus = isArchived ? "paused" : "archived";
    try {
      await handlePatch({ status: newStatus });
      toast.success(isArchived ? "Projeto restaurado." : "Projeto arquivado.");
      router.refresh();
    } catch {
      toast.error("Erro ao arquivar.");
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(false);
    if (!window.confirm(`Deletar "${project.name}"? Esta ação remove todos os posts, agentes e campanhas — não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Projeto deletado.");
      router.refresh();
    } catch {
      toast.error("Erro ao deletar projeto.");
    }
  }

  return (
    <div className={cn("relative group", isArchived && "opacity-60")}>
      {/* Edit modal overlay */}
      {editing && (
        <div
          className="absolute inset-0 z-20 rounded-2xl border"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
        >
          <form onSubmit={handleSaveEdit} className="p-5 flex flex-col h-full gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Editar projeto</p>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditName(project.name); setEditDescription(project.description ?? ""); }}
                className="p-1 rounded-lg hover:bg-white/10"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 flex-1">
              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  placeholder="Nome do projeto"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Descrição</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full text-sm px-3 py-2 rounded-xl border outline-none resize-none"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  placeholder="Descrição opcional"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !editName.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </div>
      )}

      {/* Card */}
      <Link href={`/projects/${project.id}`} tabIndex={editing ? -1 : 0}>
        <Card className={cn("hover:border-orange-500/30 transition-all duration-200 cursor-pointer h-full", isArchived && "border-dashed")}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center border border-orange-500/20">
                <Zap className="w-5 h-5 text-orange-400" />
              </div>
              <Badge variant={STATUS_VARIANTS[project.status] ?? "secondary"}>
                {STATUS_LABELS[project.status] ?? project.status}
              </Badge>
            </div>

            <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>{project.name}</h3>
            {project.description && (
              <p className="text-sm mb-3 line-clamp-2" style={{ color: "var(--text-muted)" }}>
                {project.description}
              </p>
            )}
            {project.niche && (
              <p className="text-[10px] mb-3 font-medium px-2 py-0.5 rounded-full w-fit" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                {project.niche}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {project._count.agents} agentes
              </div>
              <div className="flex items-center gap-1">
                <FolderKanban className="w-3.5 h-3.5" />
                {project._count.posts} posts
              </div>
              <div className="ml-auto">
                {formatDate(project.updatedAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Actions menu — top right, visible on hover */}
      <div
        ref={menuRef}
        className="absolute top-3 right-3 z-10"
        onClick={(e) => e.preventDefault()}
      >
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setMenuOpen((o) => !o); }}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            menuOpen
              ? "opacity-100 bg-white/10"
              : "opacity-0 group-hover:opacity-100"
          )}
          style={{ color: "var(--text-muted)" }}
          title="Ações do projeto"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-8 w-44 rounded-xl border shadow-xl z-30 overflow-hidden py-1"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setMenuOpen(false); setEditing(true); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              <Pencil className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              Editar projeto
            </button>
            <button
              type="button"
              onClick={handleArchive}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              {isArchived
                ? <><ArchiveRestore className="w-3.5 h-3.5 text-blue-400 shrink-0" />Restaurar projeto</>
                : <><Archive className="w-3.5 h-3.5 text-zinc-400 shrink-0" />Arquivar projeto</>
              }
            </button>
            <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
            <button
              type="button"
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-red-500/10 transition-colors text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Deletar projeto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
