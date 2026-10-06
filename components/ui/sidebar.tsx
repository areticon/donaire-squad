"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { authClient, useSession } from "@/lib/auth/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  Settings,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck,
  NotebookPen,
  Users,
  CalendarClock,
  LifeBuoy,
  Inbox,
  FileSignature,
  Wrench,
} from "lucide-react";
import { abrirChamado } from "@/lib/suporte/abrir-chamado";
import { cn } from "@/lib/utils";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { BrandMarkThemed } from "@/components/brand-mark-client";
import { useTheme } from "./theme-provider";
import { AvatarDoUsuario } from "@/components/ui/avatar-do-usuario";
import { SinoDeNotificacoes } from "@/components/notificacoes/sino";

// "Plano" saiu daqui em 12/09/2026: plano e cobrança passaram a ser uma aba de
// /settings, que virou configurações da CONTA. Deixar os dois na barra criava
// duas portas para o mesmo assunto, e a engrenagem embaixo já é a porta.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projetos", icon: FolderKanban },
  // A linha editorial (29/09): leva para a do projeto mexido por último.
  { href: "/linha-editorial", label: "Linha editorial", icon: NotebookPen },
  { href: "/schedule", label: "Agenda", icon: Calendar },
  // A equipe (01/10): convites, acessos e o consumo de cada pessoa. Mora numa
  // aba das Configurações; o atalho aqui é porque o dono volta nela toda semana.
  { href: "/settings?aba=equipe", label: "Equipe", icon: Users },
  // Os chamados de suporte da pessoa (02/10): resposta e histórico.
  { href: "/chamados", label: "Meus chamados", icon: LifeBuoy },
];

/**
 * QUAL ITEM ACENDE: o de caminho mais comprido que casa com a rota (01/10).
 *
 * Com "Painel" (/admin) e "Demonstrações" (/admin/agenda) no mesmo menu, a
 * regra antiga de "começa com" acendia os dois em /admin/agenda. Dentro de um
 * projeto, a linha editorial acende o item dela, e não Projetos. O Dashboard só
 * acende na rota exata, e o item com consulta (?aba=equipe) nunca casa por
 * prefixo, como já era.
 */
function itemAtivo(pathname: string, hrefs: string[]): string | null {
  if (pathname.includes("/linha-editorial")) return "/linha-editorial";
  let melhor: string | null = null;
  for (const href of hrefs) {
    if (href.includes("?")) continue;
    const casa = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
    if (casa && (!melhor || href.length > melhor.length)) melhor = href;
  }
  return melhor;
}

export function Sidebar({
  ehAdmin = false,
  demonstracoesProximas = 0,
  chamadosAbertos = 0,
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
  /** Mostra o item "Painel" (métricas e CRM). Decidido no servidor. */
  ehAdmin?: boolean;
  /**
   * Demonstrações marcadas para os próximos 7 dias, contadas no servidor (só
   * para admin). Vira o número ao lado de "Demonstrações".
   */
  demonstracoesProximas?: number;
  /** Só admin: chamados de suporte abertos (02/10), o número ao lado de "Chamados". */
  chamadosAbertos?: number;
}) {
  const pathname = usePathname();
  const itens: Array<{ href: string; label: string; icon: typeof LayoutDashboard; contador?: number; dica?: string }> = [
    ...NAV,
    // Só admin vê estes dois, e quem decide é o servidor (layout do app). A
    // agenda das demonstrações só abria digitando /admin/agenda (01/10).
    ...(ehAdmin
      ? [
          { href: "/admin", label: "Painel", icon: ShieldCheck },
          {
            href: "/admin/agenda",
            label: "Demonstrações",
            icon: CalendarClock,
            contador: demonstracoesProximas,
            dica: `${demonstracoesProximas} ${demonstracoesProximas === 1 ? "demonstração marcada" : "demonstrações marcadas"} para os próximos 7 dias`,
          },
          // A fila do suporte (02/10), com o número dos que esperam resposta.
          {
            href: "/admin/chamados",
            label: "Chamados",
            icon: Inbox,
            contador: chamadosAbertos,
            dica: `${chamadosAbertos} ${chamadosAbertos === 1 ? "chamado aberto" : "chamados abertos"} esperando resposta`,
          },
          // O gestor de contratos anuais (02/10).
          { href: "/admin/contratos", label: "Contratos", icon: FileSignature },
          // O Dev da Demandou (06/10): o que os clientes estão pedindo, por grupo, para aprovar a melhoria.
          { href: "/admin/dev", label: "Dev", icon: Wrench, dica: "O que os clientes estão pedindo: o feedback do chat e dos chamados, agrupado" },
        ]
      : []),
  ];
  const hrefAtivo = itemAtivo(pathname, itens.map((i) => i.href));
  const router = useRouter();
  const { data: sessaoAoVivo } = useSession();
  const { theme, toggle } = useTheme();
  /**
   * A SESSÃO SÓ ENTRA NO DESENHO DEPOIS DE MONTAR (01/10/2026).
   *
   * No servidor o `useSession` não tem dado e o avatar sai "?"; no navegador,
   * quando a leitura da sessão volta antes de o React terminar de hidratar
   * (página pesada, como o setup em ?step=0), o primeiro desenho já sai "BD".
   * Os dois HTMLs diferiam e o React acusava erro de hidratação, de vez em
   * quando, conforme a corrida. Esperar a montagem faz o primeiro desenho do
   * navegador igual ao do servidor; as iniciais aparecem logo em seguida.
   */
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const session = montado ? sessaoAoVivo : null;

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
            className="hidden lg:block p-2 rounded-lg transition-colors hover:bg-[var(--realce-2)]"
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
              // O logotipo de antes, de volta em 01/10 com a marca laranja:
              // Montserrat negrito, a letra mais pesada.
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
            className="lg:hidden shrink-0 p-2.5 rounded-lg transition-colors active:bg-[var(--realce-2)]"
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
            className="hidden lg:block shrink-0 p-2 rounded-lg transition-colors hover:bg-[var(--realce-2)]"
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
        {/* Rótulo de seção em mono caixa alta, como a referência do rebranding
            (01/10): diz o que é o grupo antes de a pessoa ler os itens. */}
        <p className={cn("rotulo px-3 pb-2", collapsed ? "lg:hidden" : "")}>Plataforma</p>
        {itens.map(({ href, label, icon: Icon, contador, dica }) => {
          const active = href === hrefAtivo;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-xl text-sm font-medium transition-all duration-150",
                collapsed ? "gap-3 px-3 py-2.5 lg:justify-center lg:gap-0 lg:px-2" : "gap-3 px-3 py-2.5",
                // Item ativo em pílula azul-marinho cheia com texto branco, o
                // desenho da referência (01/10). Antes era um tinte laranja que
                // no claro mal se separava do fundo.
                //
                // O BOTÃO QUE SUMIA (01/10, relato do Bruno: "às vezes, quando
                // mudo de seção, o botão some, fica branco"). O realce de hover
                // era escrito à mão no `style` do elemento (onMouseEnter punha
                // background var(--bg-elevated)), e o React não sabe desse
                // valor: ao clicar, o item virava ativo com o mouse ainda em
                // cima, o onMouseLeave seguinte não limpava nada (só limpa item
                // inativo) e o fundo inline vencia a classe da pílula. No claro
                // --bg-elevated é #ffffff: pílula branca com texto e ícone
                // brancos. Agora o hover é só classe CSS (hover:), que some
                // sozinha quando o item vira ativo, e nada mexe no style.
                active
                  ? "bg-[var(--acento-forte)] text-white font-semibold border border-transparent shadow-[0_6px_16px_-6px_rgba(10,31,59,.45)]"
                  : "border border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--realce-2)]"
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {/* Recolhida, a barra não tem lugar para o número: um ponto
                    laranja no ícone avisa que há reunião chegando. */}
                {contador ? (
                  <span
                    className={cn("absolute -top-1 -right-1 h-2 w-2 rounded-full hidden", collapsed ? "lg:block" : "")}
                    style={{ background: "var(--marca-laranja)" }}
                  />
                ) : null}
              </span>
              <span className={cn("flex-1 min-w-0 truncate", collapsed ? "lg:hidden" : undefined)}>{label}</span>
              {contador ? (
                <span
                  className={cn(
                    "ml-auto min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums",
                    collapsed ? "lg:hidden" : ""
                  )}
                  // Laranja da marca com texto branco nos dois temas: é o único
                  // número do menu, e precisa ler também sobre a pílula ativa.
                  style={{ background: "var(--marca-laranja-botao)", color: "#ffffff" }}
                  title={dica}
                >
                  {contador}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        className={cn("space-y-2 shrink-0", collapsed ? "p-4 lg:p-2" : "p-4")}
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {/* O SINO (02/10): avisos do vídeo e das peças, com contador. Mora
            junto da Ajuda, e não no lugar dela: são duas portas diferentes. */}
        <SinoDeNotificacoes collapsed={collapsed} />

        <button
          type="button"
          onClick={toggle}
          // Hover por classe, pelo mesmo motivo do item do menu (01/10): estilo
          // escrito à mão no elemento fica grudado quando o estado muda.
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--realce-2)]",
            collapsed ? "gap-2 px-3 py-2 lg:justify-center lg:gap-0 lg:px-2" : "gap-2 px-3 py-2"
          )}
          title={collapsed ? (theme === "dark" ? "Modo claro" : "Modo escuro") : undefined}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 shrink-0" />
          ) : (
            <Moon className="w-4 h-4 shrink-0" />
          )}
          <span className={collapsed ? "lg:hidden" : undefined}>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
        </button>

        {/* AJUDA (02/10): abre a janela do chamado, a mesma do botão flutuante. */}
        <button
          type="button"
          onClick={() => {
            onFecharGaveta?.();
            abrirChamado();
          }}
          data-ajuda-menu
          className={cn(
            "w-full flex items-center rounded-lg text-sm transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--realce-2)]",
            collapsed ? "gap-2 px-3 py-2 lg:justify-center lg:gap-0 lg:px-2" : "gap-2 px-3 py-2"
          )}
          title={collapsed ? "Ajuda" : undefined}
        >
          <LifeBuoy className="w-4 h-4 shrink-0" style={{ color: "var(--marca-laranja-botao)" }} />
          <span className={collapsed ? "lg:hidden" : undefined}>Ajuda</span>
        </button>

        <SaldoNoMenu collapsed={collapsed} />

        <div
          className={cn(
            "flex items-center gap-3",
            collapsed ? "flex-row lg:flex-col lg:items-center lg:gap-2" : "flex-row"
          )}
        >
          <div className={cn("flex items-center justify-center", collapsed ? "lg:w-full" : "")}>
            {/*
              A reserva de iniciais mora no componente, e ela reage a FALHA de
              carregamento, nao so a foto ausente. O codigo antigo aqui tratava
              apenas `image` nulo, entao a foto do LinkedIn expirada (URL
              assinada com prazo, 403 medido em 17/09) passava pela condicao e
              virava icone de imagem partida.
            */}
            <AvatarDoUsuario
              src={session?.user?.image}
              nome={session?.user?.name}
              email={session?.user?.email}
              className="w-8 h-8"
            />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                Minha conta
              </p>
            </div>
          )}
          {/*
            Até 12/09/2026 esta engrenagem apontava para /projects, e foi o que
            o Bruno leu como "a tela de configuração não funciona": quem clica
            numa engrenagem ao lado do próprio avatar está procurando a própria
            conta, não uma lista de projetos.
          */}
          <Link
            href="/settings"
            title="Configurações da conta"
            className={cn("p-1 rounded-lg hover:bg-[var(--realce-1)]", collapsed ? "lg:flex lg:items-center lg:justify-center lg:w-full" : "")}
          >
            <Settings
              className="w-4 h-4 transition-colors"
              style={{ color: pathname.startsWith("/settings") ? "var(--accent-orange)" : "var(--text-muted)" }}
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

/**
 * O SALDO, SEMPRE À VISTA.
 *
 * Pedido do Bruno em 19/09: "precisa estar mostrando os créditos sempre, para
 * o usuário saber quanto tem e quanto a campanha vai cobrar, se não fica
 * ruim". Ele descobriu o saldo de vídeo zerado quando o dia de vídeo saiu sem
 * vídeo: a janela da campanha dizia o custo e nunca o saldo.
 *
 * Duas carteiras, porque são dois dinheiros: o do plano (texto, imagem,
 * carrossel) e o de vídeo, comprado à parte. Mostrar uma só esconderia
 * justamente a que zera primeiro. Clicar leva para a conta, onde se compra.
 *
 * Busca uma vez ao montar e a cada 60 s: o saldo muda quando uma campanha
 * roda, e a pessoa fica com o menu aberto o tempo inteiro.
 */
function SaldoNoMenu({ collapsed }: { collapsed: boolean }) {
  const [saldos, setSaldos] = useState<{ plano: number; video: number; admin: boolean; brl30d: number; brlCampanha: number; dono: string | null; simulado: number | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = () =>
      fetch("/api/credits")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (vivo && d)
            setSaldos({
              plano: Number(d.saldo ?? 0),
              video: Number(d.saldoDeVideo ?? 0),
              admin: Boolean(d.admin),
              brl30d: Number(d.consumo?.brl30d ?? 0),
              brlCampanha: Number(d.consumo?.ultimaCampanha?.brl ?? 0),
              dono: typeof d.equipe?.dono === "string" ? d.equipe.dono : null,
              simulado: typeof d.consumoSimulado?.total === "number" ? d.consumoSimulado.total : null,
            });
        })
        .catch(() => {});
    ler();
    const t = setInterval(ler, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  // Aparece para TODO MUNDO, admin inclusive. A primeira versão escondia
  // para admin (a lógica de /settings, que não desenha barra de consumo para
  // acesso interno), e o Bruno é admin: o dono da plataforma era o único que
  // não via o saldo que ele mesmo pediu para ficar sempre à vista.
  if (!saldos) return null;

  const baixo = saldos.plano < 100;
  const semVideo = saldos.video <= 0;

  return (
    <Link
      // Membro da equipe (01/10, acabamento) não compra: o atalho leva ao
      // consumo dele na aba Equipe, e o título diz de quem é o saldo.
      href={saldos.dono ? "/settings?aba=equipe" : "/settings"}
      title={
        saldos.dono
          ? saldos.plano <= 0
            ? fraseDosCreditosDaEquipe(saldos.dono)
            : `Créditos da equipe, na conta de ${saldos.dono}`
          : "Ver e comprar créditos"
      }
      className={cn(
        "block rounded-lg border px-2.5 py-2 mb-2 transition-colors hover:bg-[var(--realce-1)]",
        collapsed ? "lg:px-1.5 lg:text-center" : ""
      )}
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      <div className={cn("flex items-center justify-between gap-2", collapsed ? "lg:flex-col lg:gap-0.5" : "")}>
        <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", collapsed ? "lg:hidden" : "")} style={{ color: "var(--text-muted)" }}>
          Créditos
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: baixo ? "#f87171" : "var(--text-primary)" }}>
          {saldos.plano}
        </span>
      </div>
      <div className={cn("flex items-center justify-between gap-2 mt-0.5", collapsed ? "lg:flex-col lg:gap-0.5" : "")}>
        <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", collapsed ? "lg:hidden" : "")} style={{ color: "var(--text-muted)" }}>
          Vídeo
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: semVideo ? "#f87171" : "var(--text-primary)" }}>
          {saldos.video}
        </span>
      </div>
      {/* O CUSTO REAL, só para quem tem bypass de admin.
          Para ele o saldo não se move (o débito sai com amount 0), então o
          número que diz alguma coisa é o que a IA custou de verdade. Ver o
          comentário de `consumo` em app/api/credits/route.ts. */}
      {saldos.admin && (
        <div className={cn("mt-1 pt-1", collapsed ? "lg:text-center" : "")} style={{ borderTop: "1px solid var(--border)" }}>
          {/* O CONSUMO SIMULADO (03/10, pedido do Bruno): o saldo do admin
              não se move, e este é o número que ele teria gastado no ciclo. */}
          {saldos.simulado !== null && (
            <p
              data-consumo-simulado
              className={cn("mb-1 text-[10.5px] leading-snug", collapsed ? "lg:hidden" : "")}
              style={{ color: "var(--text-muted)" }}
              title="Admin não desconta do saldo. Esta é a soma do que o ciclo teria cobrado."
            >
              Consumido no ciclo (simulado):{" "}
              <b className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                {saldos.simulado.toLocaleString("pt-BR")} créditos
              </b>
            </p>
          )}
          <div className={cn("flex items-center justify-between gap-2", collapsed ? "lg:flex-col lg:gap-0.5" : "")}>
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", collapsed ? "lg:hidden" : "")} style={{ color: "var(--text-muted)" }}>
              Custo 30d
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {saldos.brl30d.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={cn("flex items-center justify-between gap-2 mt-0.5", collapsed ? "lg:flex-col lg:gap-0.5" : "")}>
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", collapsed ? "lg:hidden" : "")} style={{ color: "var(--text-muted)" }}>
              Última camp.
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {saldos.brlCampanha.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
