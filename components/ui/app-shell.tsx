"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import { BrandMarkThemed } from "@/components/brand-mark-client";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sidebar-collapsed";

/**
 * A preferência de barra recolhida, lida como o que ela é: um armazenamento
 * externo ao React.
 *
 * Ler no `useEffect` e chamar `setState` funciona, mas provoca uma renderização
 * extra em toda montagem e é o que o lint do projeto reprova. `useSyncExternalStore`
 * existe exatamente para isto, e resolve de quebra o servidor: o terceiro
 * argumento é a resposta durante a renderização no servidor, onde `localStorage`
 * não existe.
 */
const ouvintes = new Set<() => void>();

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  // Outra aba mudou a preferência: o evento `storage` só dispara em ABAS
  // DIFERENTES, então ele complementa a notificação local em vez de substituir.
  const aoStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) aoMudar();
  };
  window.addEventListener("storage", aoStorage);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoStorage);
  };
}

function lerLocal(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** No servidor não existe preferência, e a barra aberta é o padrão. */
function lerNoServidor(): boolean {
  return false;
}

function gravar(valor: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, valor ? "1" : "0");
  } catch {
    /* modo privado, ou armazenamento cheio: a sessão segue sem lembrar */
  }
  ouvintes.forEach((f) => f());
}

/**
 * O esqueleto da plataforma, com dois comportamentos diferentes por tamanho de
 * tela.
 *
 * Até 23/08 existia um só: barra lateral fixa de 240px empurrando o conteúdo
 * com `ml-60`, sem nenhuma regra de tela pequena. Num celular de 390px isso
 * comia 240 e deixava 150 para o conteúdo, o que torna a plataforma inutilizável
 * no telefone (relatado pelo Bruno ao entrar pelo celular).
 *
 * No computador nada muda: a barra continua fixa, com o recolher que já existia.
 * No celular ela vira GAVETA, escondida por padrão, aberta por um botão numa
 * barra superior. Gaveta e não barra encolhida porque ícone sem rótulo em tela
 * pequena vira adivinhação, e o espaço que sobra é o que importa.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(assinar, lerLocal, lerNoServidor);
  const [gaveta, setGaveta] = useState(false);
  const pathname = usePathname();

  // Navegou, fecha a gaveta. Sem isto, quem toca num item do menu vê a página
  // trocar atrás de uma gaveta que continua aberta, e precisa fechar na mão.
  //
  // Ajustado DURANTE a renderização, e não num efeito: é o padrão do React para
  // "uma prop mudou, corrija o estado derivado", e fazer num efeito provoca uma
  // renderização a mais a cada navegação.
  const [rotaAnterior, setRotaAnterior] = useState(pathname);
  if (rotaAnterior !== pathname) {
    setRotaAnterior(pathname);
    setGaveta(false);
  }

  // Tecla Esc fecha, que é o que qualquer pessoa tenta primeiro.
  useEffect(() => {
    if (!gaveta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGaveta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [gaveta]);

  const toggle = useCallback(() => {
    gravar(!lerLocal());
  }, []);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        gavetaAberta={gaveta}
        onFecharGaveta={() => setGaveta(false)}
      />

      {/* Fundo que fecha a gaveta ao tocar fora. Só existe no celular. */}
      {gaveta && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setGaveta(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div
        className={cn(
          "flex-1 min-w-0 min-h-screen flex flex-col transition-[margin] duration-200 ease-out",
          // A margem só existe no computador. No celular a gaveta flutua por
          // cima e o conteúdo usa a largura inteira.
          "ml-0",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        {/* Barra superior do celular. `sticky` e não `fixed` para não precisar
            reservar altura no conteúdo de cada página. */}
        <header
          className="lg:hidden sticky top-0 z-20 flex items-center gap-3 h-14 px-4 border-b"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={() => setGaveta(true)}
            aria-label="Abrir menu"
            aria-expanded={gaveta}
            // 44px de alvo é o mínimo confortável para o dedo.
            className="-ml-2 p-2.5 rounded-lg transition-colors active:bg-white/10"
            style={{ color: "var(--text-primary)" }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <BrandMarkThemed className="w-7 h-7" />
          <span
            className="font-mont font-bold text-base leading-none tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            demandou
          </span>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
