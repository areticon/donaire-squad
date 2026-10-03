"use client";

import { useState } from "react";
import { agentePorId, arteDoAgente } from "@/lib/squad/estado-do-squad";
import { cn } from "@/lib/utils";

/**
 * O rosto de um agente, igual em todo o produto.
 *
 * Até 28/09 cada tela desenhava o seu: círculo com iniciais no Gestor e no
 * kanban, ícone de robô na landing, emoji na esteira ao vivo e o robô 3D
 * recolorido no escritório. Com a arte de massinha, o agente passa a ter UM
 * rosto, e quem o vê numa lista reconhece o mesmo na mesa do escritório.
 *
 * O busto fica dentro de um círculo com um fundo claro na cor do agente, como
 * nas referências; se a imagem não carregar, fica a inicial na cor dele.
 */
export function AvatarDoAgente({
  agenteId,
  tamanho = 32,
  className,
  anel = false,
}: {
  agenteId: string;
  /** Em pixels. Abaixo de 96 usa o busto pequeno, que pesa 6 KB. */
  tamanho?: number;
  className?: string;
  /** Anel na cor do agente, para destacar quem está trabalhando agora. */
  anel?: boolean;
}) {
  const agente = agentePorId(agenteId);
  const arte = arteDoAgente(agenteId);
  const [falhou, setFalhou] = useState(false);
  const cor = agente?.cor ?? "#9599a6";
  const inicial = (agente?.primeiroNome ?? agenteId).charAt(0).toUpperCase();

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full", className)}
      style={{
        width: tamanho,
        height: tamanho,
        // Fundo em degradê suave na cor do agente: o busto recortado precisa
        // de um chão, e a cor diz de quem é mesmo quando o rosto está pequeno.
        background: `radial-gradient(circle at 50% 35%, ${cor}33, ${cor}1a 60%, ${cor}26)`,
        boxShadow: anel ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${cor}` : `inset 0 0 0 1px ${cor}33`,
      }}
      title={agente ? `${agente.nome} · ${agente.papel}` : undefined}
    >
      {arte && !falhou ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tamanho < 96 ? arte.avatarPequeno : arte.avatar}
          alt={agente?.nome ?? ""}
          width={tamanho}
          height={tamanho}
          loading="lazy"
          draggable={false}
          onError={() => setFalhou(true)}
          className="h-full w-full object-cover object-bottom"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-bold text-white" style={{ background: cor, fontSize: tamanho * 0.42 }}>
          {inicial}
        </span>
      )}
    </span>
  );
}
