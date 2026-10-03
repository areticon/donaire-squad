"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { OrigemDoClique } from "@/lib/captura/store";
import type { ComponentProps, ReactNode } from "react";

/**
 * O BOTÃO QUE ABRE A JANELA DE CAPTURA.
 *
 * Existe para que a landing continue sendo página de SERVIDOR: só este botão
 * vira cliente, e o resto da página segue estático. Um provider de contexto em
 * volta de tudo obrigaria a transformar a landing inteira em cliente para
 * resolver um clique.
 *
 * `origem` não é enfeite: com cinco CTAs na mesma página, saber qual converte
 * é o que diz onde pôr o próximo. Sem isso, "a landing converteu 3%" é um
 * número que não ensina nada.
 */
export function BotaoDeCaptura({
  origem,
  children,
  ...props
}: { origem: OrigemDoClique; children: ReactNode } & Omit<ComponentProps<typeof Button>, "asChild" | "onClick">) {
  // Desde 27/09/2026 a entrada é a DEMONSTRAÇÃO com os sócios, e não mais a
  // janela de captura que levava ao teste grátis. A origem do clique segue na
  // URL, para o funil saber de qual botão veio o pedido.
  return (
    <Button {...props} asChild>
      <Link href={`/demonstracao?cta=${origem}`}>{children}</Link>
    </Button>
  );
}
