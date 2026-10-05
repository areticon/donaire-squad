"use client";

import { useState, useEffect } from "react";
import { LogoFacebook, LogoTikTok, LogoYouTube } from "@/components/social/logos-redes";
import { FotoDaConta } from "@/components/social/selo-da-conta";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Share2, Trash2, ExternalLink, Building2, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ConexaoAssistida } from "@/components/social/conexao-assistida";
import { PaginaDeEmpresaLinkedIn } from "@/components/social/pagina-empresa-linkedin";
import { PAGINA_DO_LINKEDIN, type PedidoDeConexao } from "@/lib/social/textos-da-conexao";

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
  username: string | null;
  isActive: boolean;
  accountType: string;       // "personal" | "organization"
  organizationId: string | null;
  avatarUrl: string | null;
  /// Quando a rede recusou o token numa publicação. Null = nunca recusou.
  needsReconnectAt: string | Date | null;
  needsReconnectReason: string | null;
  /// Conectada pelo time na conexão assistida (01/10), sem token próprio.
  assistida?: boolean;
}

/**
 * A frase do motivo, quando a rede disse o motivo.
 *
 * Existe porque até 14/09 a tela só sabia dizer "expirado", e o LinkedIn tinha
 * dito `REVOKED_ACCESS_TOKEN`: o acesso foi RETIRADO, pelo próprio dono, nas
 * permissões da conta dele. Chamar isso de "expirou" faz a pessoa procurar
 * defeito onde não tem.
 */
function motivoEmPortugues(codigo: string | null): string {
  switch (codigo) {
    case "REVOKED_ACCESS_TOKEN":
      return "O acesso foi retirado nas permissões da sua conta";
    case "EXPIRED_ACCESS_TOKEN":
      return "O acesso expirou";
    case "invalid_grant":
    case "INVALID_ACCESS_TOKEN":
    case "invalid_token":
      return "A rede não aceitou mais este acesso";
    case "OAuthException":
      return "A rede recusou o acesso";
    default:
      return "A rede recusou o acesso";
  }
}

function quando(data: string | Date | null): string {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface Project {
  id: string;
  name: string;
}

const PLATFORM_CONFIG = {
  linkedin: {
    label: "LinkedIn",
    icon: "in",
    color: "bg-blue-600",
    description: "Posts, artigos e atualizações profissionais",
  },
  twitter: {
    label: "X (Twitter)",
    icon: "𝕏",
    color: "bg-[#1a1a2e]",
    description: "Posts, threads e conversas",
  },
  instagram: {
    label: "Instagram",
    icon: "IG",
    color: "bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600",
    description: "Posts com imagem e carrosséis no feed",
  },
};

export function SocialConnectPanel({
  project,
  initialAccounts,
}: {
  project: Project;
  initialAccounts: SocialAccount[];
}) {
  const [accounts, setAccounts] = useState<SocialAccount[]>(initialAccounts);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  /**
   * CONEXÃO ASSISTIDA (01/10). As redes em que o cliente de fora ainda não
   * conecta sozinho (app da rede sem aprovação) trocam "Conectar" pela caixa
   * que pede a conexão ao time. Lido do servidor, porque depende de variável
   * de ambiente que muda sem build. Ver lib/social/conexao-assistida.ts.
   */
  const [assistidas, setAssistidas] = useState<string[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeConexao[]>([]);
  const [conectarDireto, setConectarDireto] = useState(false);
  useEffect(() => {
    fetch(`/api/social/conexao-assistida?projectId=${project.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { assistidas?: string[]; pedidos?: PedidoDeConexao[]; conectarDireto?: boolean } | null) => {
        setAssistidas(d?.assistidas ?? []);
        setPedidos(d?.pedidos ?? []);
        setConectarDireto(d?.conectarDireto === true);
      })
      .catch(() => undefined);
  }, [project.id]);
  const ehAssistida = (rede: string) => assistidas.includes(rede);
  const [paginasLinkedIn, setPaginasLinkedIn] = useState<"nenhuma" | "erro" | null>(null);
  const caixaAssistida = (rede: string, temConta: boolean, urlDireta: string) =>
    ehAssistida(rede) ? (
      <ConexaoAssistida
        projectId={project.id}
        rede={rede}
        temConta={temConta}
        pedido={pedidos.find((p) => p.rede === rede) ?? null}
        conectarDiretoUrl={conectarDireto ? urlDireta : null}
        onPedido={(p) => setPedidos((prev) => [p, ...prev.filter((x) => x.rede !== p.rede)])}
      />
    ) : null;

  useEffect(() => {
    if (searchParams.get("linkedin") === "success") {
      toast.success("LinkedIn pessoal conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("linkedin") === "pages_success") {
      const count = Number.parseInt(searchParams.get("pages_count") ?? "0", 10) || 0;
      // Zero páginas não é sucesso (04/10): a tela explica e oferece a
      // conexão assistida, em vez de comemorar "0 página(s) importada(s)".
      if (count > 0) toast.success(`${count} página(s) de empresa importada(s)! Ative as que quiser usar.`);
      else setPaginasLinkedIn("nenhuma");
      refreshAccounts();
    } else if (searchParams.get("linkedin") === "error" && searchParams.get("pages") === "1") {
      setPaginasLinkedIn("erro");
    } else if (searchParams.get("linkedin") === "error") {
      toast.error("Erro ao conectar LinkedIn. Verifique as permissões do app e tente novamente.");
    } else if (searchParams.get("twitter") === "success") {
      toast.success("X (Twitter) conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("twitter") === "error") {
      const motivoX = searchParams.get("motivo");
      toast.error(motivoX ? `Erro ao conectar X: ${motivoX}.` : "Erro ao conectar X. Tente novamente.");
    } else if (searchParams.get("instagram") === "success") {
      toast.success("Instagram conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("facebook") === "success") {
      toast.success("Facebook conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("facebook") === "error") {
      toast.error(
        searchParams.get("motivo") === "sem-pagina"
          ? "Nenhuma página foi liberada. Na tela da Meta, escolha Editar configurações e marque a página."
          : "Erro ao conectar Facebook. Tente novamente."
      );
    } else if (searchParams.get("youtube") === "success") {
      toast.success("YouTube conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("youtube") === "error") {
      toast.error("Erro ao conectar YouTube. A conta do Google precisa ter um canal.");
    } else if (searchParams.get("tiktok") === "success") {
      toast.success("TikTok conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("tiktok") === "error") {
      // O motivo vem do retorno do TikTok ou da nossa conferência (a pessoa
      // desmarcou a permissão de publicar, por exemplo), e ajuda mais que
      // um "tente novamente" genérico.
      const motivo = searchParams.get("motivo");
      toast.error(motivo ? `Erro ao conectar TikTok: ${motivo}` : "Erro ao conectar TikTok. Tente novamente.");
    } else if (searchParams.get("instagram") === "error") {
      toast.error("Erro ao conectar Instagram. A conta precisa ser profissional (Business ou Creator).");
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // O OAuth abre em aba nova; quando esta aba volta ao foco, a lista precisa
  // refletir a conexão feita lá sem recarregar na mão.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") refreshAccounts();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshAccounts() {
    try {
      const res = await fetch(`/api/social/connect?projectId=${project.id}`);
      const data = await res.json();
      setAccounts(data.storedAccounts ?? []);
    } catch {
      // ignore
    }
  }

  async function toggleActive(account: SocialAccount) {
    setTogglingId(account.id);
    try {
      const res = await fetch("/api/social/connect", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, isActive: !account.isActive }),
      });
      if (!res.ok) throw new Error();
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, isActive: !a.isActive } : a))
      );
      toast.success(account.isActive ? "Conta desativada para este projeto" : "Conta ativada para este projeto");
    } catch {
      toast.error("Erro ao atualizar conta");
    } finally {
      setTogglingId(null);
    }
  }

  async function disconnectAccount(account: SocialAccount) {
    try {
      const res = await fetch("/api/social/connect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      if (!res.ok) throw new Error();
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      toast.success("Conta removida");
    } catch {
      toast.error("Erro ao desconectar");
    }
  }

  // Group accounts by platform, then by type
  const linkedinAccounts = accounts.filter((a) => a.platform === "linkedin");
  const twitterAccounts = accounts.filter((a) => a.platform === "twitter");
  const instagramAccounts = accounts.filter((a) => a.platform === "instagram");
  // Facebook e YouTube entraram na etapa 1 do assistente em 22/08 mas não
  // nesta tela, então não havia como gerenciar nem desconectar (achado do
  // Bruno ao preparar a gravação).
  const facebookAccounts = accounts.filter((a) => a.platform === "facebook");
  const youtubeAccounts = accounts.filter((a) => a.platform === "youtube");
  const tiktokAccounts = accounts.filter((a) => a.platform === "tiktok");
  const hasLinkedIn = linkedinAccounts.length > 0;
  const hasTwitter = twitterAccounts.length > 0;
  const hasInstagram = instagramAccounts.length > 0;
  const hasFacebook = facebookAccounts.length > 0;
  const hasYouTube = youtubeAccounts.length > 0;
  const hasTikTok = tiktokAccounts.length > 0;

  const linkedinPersonal = linkedinAccounts.filter((a) => a.accountType === "personal");
  const linkedinPages = linkedinAccounts.filter((a) => a.accountType === "organization");
  // A página de empresa conecta pela conexão assistida (05/10): o app de
  // páginas próprio só autoriza administradores do app.
  const paginaAssistida = ehAssistida(PAGINA_DO_LINKEDIN);

  // Whether the "pages" app credentials are configured in env (we detect via a feature flag endpoint)
  const [hasPagesApp, setHasPagesApp] = useState(false);
  useEffect(() => {
    fetch("/api/social/linkedin/pages-available")
      .then((r) => r.json())
      .then((d) => setHasPagesApp(d.available === true))
      .catch(() => setHasPagesApp(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">

      {/* ── LinkedIn section ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              in
            </div>
            LinkedIn
          </h2>
          {hasLinkedIn && (
            <button
              onClick={refreshAccounts}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
              style={{ color: "var(--text-muted)" }}
            >
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          )}
        </div>

        {/* Connect buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {/* Personal profile connect */}
          <div className="rounded-xl border p-3 flex items-center gap-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Perfil pessoal</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>App "Share on LinkedIn"</p>
            </div>
            {linkedinPersonal.length > 0 ? (
              <Badge variant="success" className="text-[10px] shrink-0">conectado</Badge>
            ) : ehAssistida("linkedin") ? null : (
              <Button size="sm" variant="outline" className="text-xs shrink-0" asChild>
                <a href={`/api/social/linkedin/connect?projectId=${project.id}`}>Conectar</a>
              </Button>
            )}
          </div>

          {/* Company pages connect */}
          <div className="rounded-xl border p-3 flex items-center gap-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Páginas de empresa</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {linkedinPages.length > 0
                  ? `${linkedinPages.length} página(s) importada(s)`
                  : paginaAssistida
                    ? "Conexão assistida, logo abaixo"
                    : hasPagesApp
                      ? "Conecte para importar suas páginas"
                      : "Disponível em breve"}
              </p>
            </div>
            {linkedinPages.length > 0 ? (
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="success" className="text-[10px] shrink-0">{linkedinPages.length} página(s)</Badge>
                {hasPagesApp && !ehAssistida("linkedin") && !paginaAssistida && (
                  <Button size="sm" variant="outline" className="text-xs shrink-0" asChild>
                    <a href={`/api/social/linkedin/connect?projectId=${project.id}&pages=1`}>Buscar outras</a>
                  </Button>
                )}
              </div>
            ) : paginaAssistida ? null : hasPagesApp && !ehAssistida("linkedin") ? (
              <Button size="sm" variant="outline" className="text-xs shrink-0" asChild>
                <a href={`/api/social/linkedin/connect?projectId=${project.id}&pages=1`}>Conectar</a>
              </Button>
            ) : (
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>Em breve</span>
            )}
          </div>
        </div>

        {caixaAssistida("linkedin", hasLinkedIn, `/api/social/linkedin/connect?projectId=${project.id}`)}

        {/* Os becos da página de empresa (04/10): app de páginas não liberado ou
            nenhuma página administrada. Explica e oferece a conexão assistida. */}
        {paginaAssistida && (
          <div className="mb-4">
            <PaginaDeEmpresaLinkedIn
              assistida
              projectId={project.id}
              appLiberado={hasPagesApp}
              urlDoApp={`/api/social/linkedin/connect?projectId=${project.id}&pages=1`}
              conectarDiretoUrl={conectarDireto && hasPagesApp ? `/api/social/linkedin/connect?projectId=${project.id}&pages=1` : null}
              paginas={linkedinPages.length}
              resultado={paginasLinkedIn}
              pedido={pedidos.find((p) => p.rede === PAGINA_DO_LINKEDIN) ?? null}
              onPedido={(p) => setPedidos((prev) => [p, ...prev.filter((x) => x.rede !== p.rede)])}
            />
          </div>
        )}
        {!paginaAssistida && !ehAssistida("linkedin") && (paginasLinkedIn !== null || !hasPagesApp) && (
          <div className="mb-4">
            <PaginaDeEmpresaLinkedIn
              projectId={project.id}
              appLiberado={hasPagesApp}
              urlDoApp={`/api/social/linkedin/connect?projectId=${project.id}&pages=1`}
              paginas={linkedinPages.length}
              resultado={paginasLinkedIn}
              pedido={pedidos.find((p) => p.rede === "linkedin") ?? null}
              onPedido={(p) => setPedidos((prev) => [p, ...prev.filter((x) => x.rede !== p.rede)])}
            />
          </div>
        )}

        {/* Connected accounts list */}
        {hasLinkedIn && (
          <div className="space-y-2">
            {linkedinPersonal.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="personal"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}

            {linkedinPages.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                  <Building2 className="w-3.5 h-3.5" />
                  Páginas de empresas ({linkedinPages.length})
                </p>
                <div className="space-y-2 pl-2 border-l-2" style={{ borderColor: "var(--border)" }}>
                  {linkedinPages.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      type="organization"
                      toggling={togglingId === account.id}
                      onToggle={toggleActive}
                      onDisconnect={disconnectAccount}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!hasLinkedIn && !ehAssistida("linkedin") && (
          <div className="text-center py-6 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-7 h-7 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma conta LinkedIn conectada ainda</p>
          </div>
        )}
      </div>

      {/* ── X (Twitter) section ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className="w-7 h-7 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-xs font-bold shrink-0">
              𝕏
            </div>
            X (Twitter)
          </h2>
          {!hasTwitter && !ehAssistida("twitter") && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/twitter/connect?projectId=${project.id}`}>Conectar</a>
            </Button>
          )}
        </div>
        {caixaAssistida("twitter", hasTwitter, `/api/social/twitter/connect?projectId=${project.id}`)}

        {!hasTwitter ? (ehAssistida("twitter") ? null :
          <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>X (Twitter) não conectado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {twitterAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="personal"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Instagram section ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              IG
            </div>
            Instagram
          </h2>
          {/*
            O botão fica SEMPRE, e não só quando a lista está vazia.

            Quem gerencia várias contas (o caso normal de agência, e o do
            Bruno em 19/09) conectava o perfil pessoal na primeira tentativa e
            depois não tinha mais onde clicar para conectar a conta certa: o
            botão sumia. O banco nunca foi o limite, ele guarda uma linha por
            `platformUserId` e o callback faz upsert por essa chave, ou seja
            uma segunda conta VIRA linha nova. Quem impedia era esta tela.
          */}
          {!ehAssistida("instagram") && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/instagram/connect?projectId=${project.id}`}>
                {hasInstagram ? "Conectar outra" : "Conectar"}
              </a>
            </Button>
          )}
        </div>
        {caixaAssistida("instagram", hasInstagram, `/api/social/instagram/connect?projectId=${project.id}`)}

        {!hasInstagram ? (ehAssistida("instagram") ? null :
          <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Instagram não conectado</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              A conta precisa ser profissional (Business ou Creator)
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {instagramAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="personal"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}
          </div>
        )}

        {/*
          O aviso existe porque o comportamento é contraintuitivo e a culpa
          parece ser nossa. O Instagram NÃO mostra lista de contas no diálogo
          de autorização: ele conecta a conta que estiver logada no navegador,
          e pronto. Quem tem o perfil pessoal logado conecta o perfil pessoal
          achando que escolheu errado em algum lugar.
        */}
        {!ehAssistida("instagram") && <p className="text-xs mt-3 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          O Instagram conecta a conta que estiver logada neste navegador e não oferece lista para
          escolher. Para conectar outra, abra uma janela anônima (ou saia do Instagram) e entre com a
          conta que você quer conectar antes de clicar.
        </p>}
      </div>

      {/* ── Facebook ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <LogoFacebook className="!w-7 !h-7" />
            Facebook
          </h2>
          {/*
            Mesmo motivo do Instagram, com um agravante próprio: o callback do
            Facebook grava UMA LINHA POR PÁGINA que o usuário administra, lidas
            de /me/accounts na hora da conexão. Uma página criada depois (ou um
            acesso de admin recebido depois) não existe em lugar nenhum até
            alguém refazer o OAuth, e com o botão escondido não havia como.
          */}
          {!ehAssistida("facebook") && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/facebook/connect?projectId=${project.id}`}>
                {hasFacebook ? "Buscar páginas de novo" : "Conectar"}
              </a>
            </Button>
          )}
        </div>
        {caixaAssistida("facebook", hasFacebook, `/api/social/facebook/connect?projectId=${project.id}`)}

        {!hasFacebook ? (ehAssistida("facebook") ? null :
          <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Facebook não conectado</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              A publicação acontece na sua página, não no perfil pessoal
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {facebookAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="organization"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── YouTube ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <LogoYouTube className="!w-7 !h-7" />
            YouTube
          </h2>
          {!hasYouTube && !ehAssistida("youtube") && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/youtube/connect?projectId=${project.id}`}>Conectar</a>
            </Button>
          )}
        </div>
        {caixaAssistida("youtube", hasYouTube, `/api/social/youtube/connect?projectId=${project.id}`)}

        {!hasYouTube ? (ehAssistida("youtube") ? null :
          <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>YouTube não conectado</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              A conta do Google precisa ter um canal
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {youtubeAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="personal"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── TikTok ───────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <LogoTikTok className="!w-7 !h-7" />
            TikTok
          </h2>
          {!hasTikTok && !ehAssistida("tiktok") && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/tiktok/connect?projectId=${project.id}`}>Conectar</a>
            </Button>
          )}
        </div>
        {caixaAssistida("tiktok", hasTikTok, `/api/social/tiktok/connect?projectId=${project.id}`)}

        {!hasTikTok ? (ehAssistida("tiktok") ? null :
          <div className="text-center py-8 border border-dashed rounded-xl" style={{ borderColor: "var(--border)" }}>
            <Share2 className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>TikTok não conectado</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Publica os seus vídeos verticais (cortes e vídeos por IA) no seu perfil
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tiktokAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                type="personal"
                toggling={togglingId === account.id}
                onToggle={toggleActive}
                onDisconnect={disconnectAccount}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border text-xs space-y-2" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Como funciona:</p>
        <p>• Você autoriza via OAuth: nunca pedimos sua senha.</p>
        {assistidas.length > 0 && (
          <p>• Nas redes com conexão assistida, conectamos junto com você numa chamada curta. Você mesmo entra na sua conta, e a publicação funciona igual.</p>
        )}
        <p>• Ao conectar o LinkedIn, seu perfil pessoal <strong>e</strong> todas as páginas que você administra são importados.</p>
        <p>• Pages de empresa iniciam <strong>inativas</strong>: ative apenas as que quer usar neste projeto.</p>
        <p>• Cada projeto pode publicar em uma entidade diferente (ex: projeto Areticon → página Areticon).</p>
        <p>• Nenhum post é publicado sem sua aprovação explícita.</p>
      </div>
    </div>
  );
}

// ── Sub-component: individual account row ─────────────────────────────────────

function AccountRow({
  account,
  type,
  toggling,
  onToggle,
  onDisconnect,
}: {
  account: SocialAccount;
  type: "personal" | "organization";
  toggling: boolean;
  onToggle: (a: SocialAccount) => void;
  onDisconnect: (a: SocialAccount) => void;
}) {
  // A rede recusou o token na última publicação. É um fato da rede, não a
  // chave liga e desliga: por isso tem borda própria e não mexe no `isActive`.
  const precisaReconectar = Boolean(account.needsReconnectAt);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all",
        !account.isActive && !precisaReconectar && "opacity-60"
      )}
      style={{
        background: "var(--bg-card)",
        borderColor: precisaReconectar ? "rgba(248,113,113,0.35)" : "var(--border)",
      }}
    >
      {/* Avatar / icon */}
      {/* A mesma foto do Gestor: quando o link do CDN da rede expira, fica a
          inicial na cor da rede, e não a imagem quebrada com o texto
          alternativo cortado (visto em 28/09 no Instagram e no Facebook). */}
      <FotoDaConta
        conta={{ platform: account.platform, displayName: account.displayName ?? account.username ?? null, accountType: account.accountType ?? type, avatarUrl: account.avatarUrl }}
        tamanho={36}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {account.displayName ?? account.username ?? account.platform}
        </p>
        {precisaReconectar ? (
          <p className="text-xs truncate text-red-400">
            {motivoEmPortugues(account.needsReconnectReason)}
            {quando(account.needsReconnectAt) && `, em ${quando(account.needsReconnectAt)}`}
          </p>
        ) : (
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            {type === "organization" ? "Página de empresa" : "Perfil pessoal"}
            {account.username && ` · ${account.username}`}
            {/* Conectada pelo time na conexão assistida (01/10). */}
            {account.assistida && " · conectada com o time"}
          </p>
        )}
      </div>

      {/* Active toggle */}
      <button
        onClick={() => onToggle(account)}
        disabled={toggling}
        className={cn(
          "relative w-10 h-5 rounded-full transition-all shrink-0",
          account.isActive ? "bg-green-500" : "bg-gray-500/40",
          toggling && "opacity-50 cursor-not-allowed"
        )}
        title={account.isActive ? "Desativar para este projeto" : "Ativar para este projeto"}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
            account.isActive ? "left-5" : "left-0.5"
          )}
        />
      </button>

      {/* Status badge. "reconectar" ganha de "ativa" porque conta que a rede
          recusou não publica, esteja a chave ligada ou não: mostrar "ativa" ali
          é a mentira que este trabalho inteiro existe para tirar da tela. */}
      <Badge
        variant={precisaReconectar ? "destructive" : account.isActive ? "success" : "outline"}
        className="text-[10px] shrink-0"
      >
        {precisaReconectar ? "reconectar" : account.isActive ? "ativa" : "inativa"}
      </Badge>

      {/* Remove */}
      <button
        onClick={() => onDisconnect(account)}
        className="text-red-400 hover:text-red-300 transition-colors shrink-0"
        title="Remover conta"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
