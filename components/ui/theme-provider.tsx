"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

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
    localStorage.setItem("theme", next);
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
