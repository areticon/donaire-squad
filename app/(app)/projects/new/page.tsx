"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Zap } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) {
      toast.error("Dê um nome ao projeto");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Projeto criado!");
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      toast.error("Erro ao criar projeto");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center border border-orange-500/20 mb-4">
          <Zap className="w-6 h-6 text-orange-400" />
        </div>
        <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Novo projeto</h1>
        <p className="mt-1" style={{ color: "var(--text-muted)" }}>
          Crie seu squad de agentes de IA para redes sociais
        </p>
      </div>

      <div className="space-y-6">
        <Input
          label="Nome do projeto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Conteúdo LinkedIn — Bruno Donaire"
          autoFocus
        />

        <Textarea
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Objetivo, nicho, público-alvo..."
          className="min-h-[100px]"
        />

        <div className="flex gap-3">
          <Button onClick={() => router.back()} variant="outline">
            Cancelar
          </Button>
          <Button onClick={create} loading={loading} className="flex-1">
            Criar projeto e configurar
          </Button>
        </div>
      </div>
    </div>
  );
}
