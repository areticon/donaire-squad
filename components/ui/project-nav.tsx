"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Settings, Radio, Bot, PencilLine, BarChart2, BrainCircuit } from "lucide-react";
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
    <div className="flex items-center gap-1 -mb-px">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href || pathname.startsWith(tab.href + "?");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
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
