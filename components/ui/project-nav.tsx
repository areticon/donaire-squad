"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Settings, Radio, Bot, PencilLine, BarChart2, BrainCircuit, Video } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectNav({ projectId, isActive }: { projectId: string; isActive: boolean }) {
  const pathname = usePathname();

  const tabs = [
    {
      href: `/projects/${projectId}/posts`,
      label: "Posts",
      icon: FileText,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/video`,
      label: "Vídeo",
      icon: Video,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/live`,
      label: "Gestor de Conteúdo",
      icon: Radio,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/agents`,
      label: "Agentes",
      icon: Bot,
      show: true,
    },
    {
      href: `/projects/${projectId}/settings`,
      label: "Configurações",
      icon: Settings,
      show: true,
    },
    {
      href: `/projects/${projectId}/analytics`,
      label: "Analytics",
      icon: BarChart2,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/setup`,
      label: "Editar setup",
      icon: PencilLine,
      show: true,
    },
    {
      href: `/projects/${projectId}/training`,
      label: "Treinamento",
      icon: BrainCircuit,
      show: true,
    },
  ].filter((t) => t.show);

  return (
    // Rola por dentro no celular, em vez de empurrar a página.
    //
    // São oito abas: no computador cabem, num telefone de 390px não cabem de
    // jeito nenhum. Sem isto elas alargavam o documento inteiro, e a página
    // ganhava rolagem lateral (medido em 23/08: 556px de conteúdo numa janela
    // de 390). Quebrar em duas linhas seria pior, porque a barra de abas
    // deixaria de ser uma linha e o conteúdo desceria.
    //
    // `scrollbar-none` esconde a barra: em celular ninguém a usa, o gesto é
    // arrastar, e ela ocupa altura de uma linha de texto.
    <div className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href || pathname.startsWith(tab.href + "?");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0",
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all",
              active
                ? "border-orange-500 text-orange-500"
                : "border-transparent hover:border-[var(--border)]"
            )}
            style={active ? undefined : { color: "var(--text-muted)" }}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
