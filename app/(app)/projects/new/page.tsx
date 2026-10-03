"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { PedidoDeUpgrade, type Estouro } from "@/components/planos/pedido-de-upgrade";

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
  // Desde 18/09 a criacao pode ser recusada por limite de MARCAS do plano. A
  // tela para aqui em vez de jogar a pessoa de volta no dashboard com um toast
  // vermelho: quem clicou em "nova marca" queria uma marca, e este e o momento
  // de maior intencao que existe para oferecer o plano que a entrega.
  const [limite, setLimite] = useState<Estouro | null>(null);

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
        if (res.status === 402 && data.limite) {
          setLimite(data.limite as Estouro);
          return;
        }
        // Membro da equipe (01/10): a recusa já vem com a frase certa.
        if (res.status === 403 && data.error) {
          toast.error(data.error);
          router.replace("/projects");
          return;
        }
        if (!res.ok) throw new Error(data.error);
        router.replace(`/projects/${data.project.id}/setup`);
      } catch (err) {
        console.error(err);
        toast.error("Erro ao criar projeto. Tente novamente.");
        router.replace("/dashboard");
      }
    })();
  }, [router]);

  if (limite) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-10">
        <PedidoDeUpgrade estouro={limite} />
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center gap-3" style={{ color: "var(--text-muted)" }}>
      <Loader2 className="w-5 h-5 animate-spin" />
      Preparando seu projeto...
    </div>
  );
}
