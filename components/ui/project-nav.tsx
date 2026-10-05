"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FileText, Settings, Radio, PencilLine, BarChart2, BrainCircuit, Plus, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectNav({
  projectId,
  isActive,
  souMembro = false,
}: {
  projectId: string;
  isActive: boolean;
  /**
   * MEMBRO DA EQUIPE (01/10, acabamento): "Editar setup" some, porque o setup é
   * do dono. Configurações e Treinamento ficam, em leitura com o aviso.
   */
  souMembro?: boolean;
}) {
  const pathname = usePathname();
  const trilho = useRef<HTMLDivElement>(null);
  // Quais bordas têm aba escondida além delas. Começa sem esmaecer nada, que
  // é o que vale no computador, onde as abas cabem.
  const [sobra, setSobra] = useState({ esquerda: false, direita: false });

  const medir = useCallback(() => {
    const el = trilho.current;
    if (!el) return;
    const esquerda = el.scrollLeft > 2;
    const direita = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setSobra((s) => (s.esquerda === esquerda && s.direita === direita ? s : { esquerda, direita }));
  }, []);

  // A ORDEM conta a jornada (29/09): criar, acompanhar, ver o que saiu, medir.
  // "Criar" abre o projeto e junta as três portas de entrada; antes o projeto
  // abria na lista de Posts, que mostra o que já saiu e não por onde começar.
  const tabs = [
    {
      href: `/projects/${projectId}/criar`,
      label: "Criar",
      icon: Plus,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/linha-editorial`,
      label: "Linha editorial",
      icon: NotebookPen,
      show: isActive,
    },
    // A aba "Vídeo" saiu daqui em 02/09. O processo inteiro (envio, estilo,
    // trilha, termos e o piloto automático) passou a acontecer no Gestor de
    // Conteúdo, que é onde o resultado sempre esteve: o pedido do Bruno foi
    // exatamente esse, e a queixa de "sumiu o vídeo completo" vinha de o
    // processo morar numa tela e a entrega em outra. A rota /video continua
    // existindo por enquanto, redirecionando para cá.
    {
      href: `/projects/${projectId}/live`,
      label: "Gestor",
      icon: Radio,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/posts`,
      label: "Posts",
      icon: FileText,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/analytics`,
      label: "Resultados",
      icon: BarChart2,
      show: isActive,
    },
    {
      href: `/projects/${projectId}/settings`,
      label: "Configurações",
      icon: Settings,
      show: true,
    },
    {
      href: `/projects/${projectId}/setup`,
      label: "Editar setup",
      icon: PencilLine,
      show: !souMembro,
    },
    {
      href: `/projects/${projectId}/training`,
      label: "Treinamento",
      icon: BrainCircuit,
      show: true,
    },
  ].filter((t) => t.show);

  // Subrota conta como a aba (o roteiro do vídeo, por exemplo); o "?" de antes
  // nunca casava, porque o pathname não traz a busca.
  const ativa = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const hrefAtivo = tabs.find((t) => ativa(t.href))?.href;

  // A ABA ATIVA ROLADA PARA A VISTA (05/10). No celular só as três ou quatro
  // primeiras aparecem; quem abria Configurações ou Treinamento via a barra
  // parada no começo, sem nenhuma aba marcada, e não sabia onde estava.
  // `scrollLeft` direto no trilho, e não `scrollIntoView`, que também mexeria
  // na rolagem vertical da página.
  useLayoutEffect(() => {
    const el = trilho.current;
    const aba = el?.querySelector<HTMLElement>("[data-ativa=true]");
    if (el && aba) {
      el.scrollLeft = aba.offsetLeft - (el.clientWidth - aba.offsetWidth) / 2;
    }
    medir();
  }, [hrefAtivo, medir]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  // O ESMAECIDO NAS BORDAS diz "tem mais aba para lá" sem barra de rolagem:
  // a aba cortada seca na borda parecia defeito, não continuação.
  const mascara =
    sobra.esquerda || sobra.direita
      ? `linear-gradient(to right, ${sobra.esquerda ? "transparent 0, #000 28px" : "#000 0"}, ${sobra.direita ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%"})`
      : undefined;

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
    //
    // `relative` para o `offsetLeft` das abas ser medido a partir do trilho.
    <div
      ref={trilho}
      onScroll={medir}
      className="relative flex items-center gap-0.5 sm:gap-1 -mb-px overflow-x-auto overscroll-x-contain scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0"
      style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.href === hrefAtivo;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-ativa={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap",
              // Um pouco menos de folga lateral no celular: cabe uma aba a mais
              // na primeira tela sem apertar o alvo do dedo.
              "flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-sm font-medium border-b-2 transition-all",
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
