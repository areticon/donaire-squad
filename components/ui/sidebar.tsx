"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient, useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
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
  X,
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
  gavetaAberta = false,
  onFecharGaveta,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  /** No celular a barra vira gaveta. Ignorado no computador. */
  gavetaAberta?: boolean;
  onFecharGaveta?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();

  const userInitial =
    session?.user?.name?.trim()?.charAt(0)?.toUpperCase() ??
    session?.user?.email?.charAt(0)?.toUpperCase() ??
    "?";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col",
        "transition-transform duration-200 ease-out lg:transition-[width]",
        // No celular a largura é sempre a cheia: gaveta com ícone sem rótulo
        // seria adivinhação. O `collapsed` só vale do lg para cima.
        "w-60",
        collapsed ? "lg:w-16" : "lg:w-60",
        // Escondida fora da tela por padrão no celular, sempre visível no
        // computador. `translate` e não `hidden` para a gaveta deslizar.
        gavetaAberta ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
      aria-hidden={undefined}
      style={{
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo + recolher */}
      <div
        className={cn(
          "shrink-0",
          // No celular sempre o cabeçalho largo, porque a gaveta é larga.
          collapsed
            ? "h-16 flex items-center px-3 gap-2 justify-between lg:h-auto lg:flex-col lg:items-center lg:gap-2 lg:py-3 lg:px-1"
            : "h-16 flex items-center px-3 gap-2 justify-between",
        )}
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {onToggle && collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="hidden lg:block p-2 rounded-lg transition-colors hover:bg-white/10"
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
          <span
            className={cn(
              "font-mont font-bold text-lg leading-none tracking-tight truncate",
              collapsed ? "lg:hidden" : ""
            )}
            style={{ color: "var(--text-primary)" }}
          >
            demandou
          </span>
        </Link>
        {onFecharGaveta && (
          <button
            type="button"
            onClick={onFecharGaveta}
            className="lg:hidden shrink-0 p-2.5 rounded-lg transition-colors active:bg-white/10"
            style={{ color: "var(--text-muted)" }}
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {onToggle && !collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="hidden lg:block shrink-0 p-2 rounded-lg transition-colors hover:bg-white/10"
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
      <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-3 py-4 lg:px-1.5 lg:py-3 space-y-1" : "px-3 py-4 space-y-1")}>
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
                collapsed ? "gap-3 px-3 py-2.5 lg:justify-center lg:gap-0 lg:px-2" : "gap-3 px-3 py-2.5",
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
              <span className={collapsed ? "lg:hidden" : undefined}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        className={cn("space-y-2 shrink-0", collapsed ? "p-4 lg:p-2" : "p-4")}
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all",
            collapsed ? "gap-2 px-3 py-2 lg:justify-center lg:gap-0 lg:px-2" : "gap-2 px-3 py-2"
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
          <span className={collapsed ? "lg:hidden" : undefined}>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
        </button>

        <div
          className={cn(
            "flex items-center gap-3",
            collapsed ? "flex-row lg:flex-col lg:items-center lg:gap-2" : "flex-row"
          )}
        >
          <div className={cn("flex items-center justify-center", collapsed ? "lg:w-full" : "")}>
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name ?? "Avatar"}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-semibold"
                title={session?.user?.email ?? undefined}
              >
                {userInitial}
              </div>
            )}
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
            className={cn("p-1 rounded-lg hover:bg-white/5", collapsed ? "lg:flex lg:items-center lg:justify-center lg:w-full" : "")}
          >
            <Settings
              className="w-4 h-4 transition-colors"
              style={{ color: "var(--text-muted)" }}
            />
          </Link>
        </div>
        <button
          type="button"
          onClick={() =>
            authClient.signOut({
              fetchOptions: { onSuccess: () => router.push("/") },
            })
          }
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all hover:text-red-400 hover:bg-red-900/10",
            collapsed ? "gap-2 px-3 py-2 lg:justify-center lg:gap-0 lg:px-2" : "gap-2 px-3 py-2"
          )}
          style={{ color: "var(--text-muted)" }}
          title={collapsed ? "Sair" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className={collapsed ? "lg:hidden" : undefined}>Sair</span>
        </button>
      </div>
    </aside>
  );
}
