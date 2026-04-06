"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  CreditCard,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMarkThemed } from "@/components/brand-mark-client";
import { useTheme } from "./theme-provider";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projetos", icon: FolderKanban },
  { href: "/schedule", label: "Agenda", icon: Calendar },
  { href: "/billing", label: "Plano", icon: CreditCard },
];

export function Sidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const { theme, toggle } = useTheme();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-60"
      )}
      style={{
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo + recolher */}
      <div
        className={cn(
          "shrink-0",
          collapsed
            ? "flex flex-col items-center gap-2 py-3 px-1"
            : "h-16 flex items-center px-3 gap-2 justify-between",
        )}
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {onToggle && collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
            aria-expanded={false}
            aria-label="Expandir menu lateral"
            title="Expandir menu"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 min-w-0",
            collapsed ? "justify-center" : "flex-1"
          )}
          title="Início"
        >
          <BrandMarkThemed className="w-8 h-8" />
          {!collapsed && (
            <span
              className="font-mont font-bold text-lg leading-none tracking-tight truncate"
              style={{ color: "var(--text-primary)" }}
            >
              demandou
            </span>
          )}
        </Link>
        {onToggle && !collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 p-2 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
            aria-expanded
            aria-label="Recolher menu lateral"
            title="Recolher menu"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-1.5 py-3 space-y-1" : "px-3 py-4 space-y-1")}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                  : "border border-transparent"
              )}
              style={
                active
                  ? undefined
                  : { color: "var(--text-muted)" }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                  (e.currentTarget as HTMLElement).style.background = "";
                }
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        className={cn("space-y-2 shrink-0", collapsed ? "p-2" : "p-4")}
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all",
            collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
          )}
          style={{ color: "var(--text-muted)" }}
          title={collapsed ? (theme === "dark" ? "Modo claro" : "Modo escuro") : undefined}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 shrink-0" />
          ) : (
            <Moon className="w-4 h-4 shrink-0" />
          )}
          {!collapsed && (theme === "dark" ? "Modo claro" : "Modo escuro")}
        </button>

        <div
          className={cn(
            "flex items-center gap-3",
            collapsed ? "flex-col items-center gap-2" : "flex-row"
          )}
        >
          <div className={cn("flex items-center justify-center", collapsed ? "w-full" : "")}>
            <UserButton
              appearance={{
                elements: { avatarBox: "w-8 h-8" },
              }}
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                Minha conta
              </p>
            </div>
          )}
          <Link
            href="/projects"
            title="Projetos — configurações e redes por projeto"
            className={cn("p-1 rounded-lg hover:bg-white/5", collapsed ? "flex items-center justify-center w-full" : "")}
          >
            <Settings
              className="w-4 h-4 transition-colors"
              style={{ color: "var(--text-muted)" }}
            />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/" })}
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all hover:text-red-400 hover:bg-red-900/10",
            collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
          )}
          style={{ color: "var(--text-muted)" }}
          title={collapsed ? "Sair" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "Sair"}
        </button>
      </div>
    </aside>
  );
}
