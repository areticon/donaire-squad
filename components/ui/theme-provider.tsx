"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // O script inline no layout já aplicou o tema no <html> antes da primeira
    // pintura. Aqui só sincronizamos o estado do React com o que está no DOM,
    // para que os componentes que leem useTheme() (o botão de alternar, por
    // exemplo) não pisquem o ícone errado.
    const applied = document.documentElement.getAttribute("data-theme");
    if (applied === "light" || applied === "dark") setTheme(applied);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Mesma chave que o script do layout lê (ver app/layout.tsx para o porquê
    // de não ser mais "theme"). O try cobre modo privado e armazenamento cheio.
    try {
      localStorage.setItem("tema", next);
    } catch {
      /* segue sem lembrar */
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
