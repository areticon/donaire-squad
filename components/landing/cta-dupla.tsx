import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoDeCaptura } from "@/components/landing/botao-de-captura";
import type { OrigemDoClique } from "@/lib/captura/store";
import { cn } from "@/lib/utils";

/**
 * OS DOIS BOTÕES DE AÇÃO (02/10, pedido do Matheus: "mais botões de ação").
 *
 * "Agendar reunião" abre a conversa com os sócios (/demonstracao, com a origem
 * do clique na URL); "Contratar" leva a /planos, onde o visitante escolhe o
 * plano e segue para o cadastro e o checkout anual. Um componente só para os
 * pontos de ação ao longo da página falarem igual.
 */
export function CtaDupla({ origem, className, centro = true }: { origem: OrigemDoClique; className?: string; centro?: boolean }) {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-3", centro && "sm:justify-center", className)}>
      <BotaoDeCaptura origem={origem} size="lg" variant="conversao">
        Agendar reunião <ArrowRight className="w-4 h-4" />
      </BotaoDeCaptura>
      <Button size="lg" variant="outline" asChild>
        <Link href="/planos">Contratar</Link>
      </Button>
    </div>
  );
}
