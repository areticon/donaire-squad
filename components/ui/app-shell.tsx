"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main
        className={cn(
          "flex-1 min-h-screen transition-[margin] duration-200 ease-out",
          ready ? (collapsed ? "ml-16" : "ml-60") : "ml-60"
        )}
      >
        {children}
      </main>
    </div>
  );
}
