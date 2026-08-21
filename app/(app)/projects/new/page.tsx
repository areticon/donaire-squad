"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

/**
 * Esta tela era um formulário de nome e descrição que duplicava a etapa 1 do
 * assistente de setup (feedback do teste de jornada de 20/08). Agora ela cria
 * o projeto direto e joga a pessoa no assistente, que pergunta as mesmas
 * coisas com a ajuda da IA do lado. Menos uma tela entre o clique e o valor.
 */
export default function NewProjectPage() {
  const router = useRouter();
  // O StrictMode monta o componente duas vezes em dev; sem o ref, seriam
  // dois projetos criados por clique.
  const criando = useRef(false);

  useEffect(() => {
    if (criando.current) return;
    criando.current = true;
    (async () => {
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Meu projeto", description: "" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        router.replace(`/projects/${data.project.id}/setup`);
      } catch (err) {
        console.error(err);
        toast.error("Erro ao criar projeto. Tente novamente.");
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center gap-3" style={{ color: "var(--text-muted)" }}>
      <Loader2 className="w-5 h-5 animate-spin" />
      Preparando seu projeto...
    </div>
  );
}
