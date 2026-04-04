"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { CheckCircle2, Share2, Trash2, ExternalLink, Building2, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
  username: string | null;
  isActive: boolean;
  accountType: string;       // "personal" | "organization"
  organizationId: string | null;
  avatarUrl: string | null;
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

  useEffect(() => {
    if (searchParams.get("linkedin") === "success") {
      toast.success("LinkedIn pessoal conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("linkedin") === "pages_success") {
      const count = searchParams.get("pages_count") ?? "0";
      toast.success(`${count} página(s) de empresa importada(s)! Ative as que quiser usar.`);
      refreshAccounts();
    } else if (searchParams.get("linkedin") === "error") {
      toast.error("Erro ao conectar LinkedIn. Verifique as permissões do app e tente novamente.");
    } else if (searchParams.get("twitter") === "success") {
      toast.success("X (Twitter) conectado com sucesso!");
      refreshAccounts();
    } else if (searchParams.get("twitter") === "error") {
      toast.error("Erro ao conectar X. Tente novamente.");
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const hasLinkedIn = linkedinAccounts.length > 0;
  const hasTwitter = twitterAccounts.length > 0;

  const linkedinPersonal = linkedinAccounts.filter((a) => a.accountType === "personal");
  const linkedinPages = linkedinAccounts.filter((a) => a.accountType === "organization");

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
            ) : (
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
                {linkedinPages.length > 0 ? `${linkedinPages.length} página(s) importada(s)` : hasPagesApp ? "Conecte para importar suas páginas" : "Disponível em breve"}
              </p>
            </div>
            {linkedinPages.length > 0 ? (
              <Badge variant="success" className="text-[10px] shrink-0">{linkedinPages.length} página(s)</Badge>
            ) : hasPagesApp ? (
              <Button size="sm" variant="outline" className="text-xs shrink-0" asChild>
                <a href={`/api/social/linkedin/connect?projectId=${project.id}&pages=1`}>Conectar</a>
              </Button>
            ) : (
              <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>Em breve</span>
            )}
          </div>
        </div>

        {/* Pages button only shows when the pages app is configured — no user-visible warning */}

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

        {!hasLinkedIn && (
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
          {!hasTwitter && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/social/twitter/connect?projectId=${project.id}`}>Conectar</a>
            </Button>
          )}
        </div>

        {!hasTwitter ? (
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

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border text-xs space-y-2" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Como funciona:</p>
        <p>• Você autoriza via OAuth — nunca pedimos sua senha.</p>
        <p>• Ao conectar o LinkedIn, seu perfil pessoal <strong>e</strong> todas as páginas que você administra são importados.</p>
        <p>• Pages de empresa iniciam <strong>inativas</strong> — ative apenas as que quer usar neste projeto.</p>
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
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all",
        !account.isActive && "opacity-60"
      )}
      style={{ background: "var(--bg-card)", borderColor: account.isActive ? "var(--border)" : "var(--border)" }}
    >
      {/* Avatar / icon */}
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: "var(--bg-surface)" }}>
        {account.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.avatarUrl} alt={account.displayName ?? ""} className="w-full h-full object-cover" />
        ) : type === "organization" ? (
          <Building2 className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        ) : (
          <User className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {account.displayName ?? account.username ?? account.platform}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {type === "organization" ? "Página de empresa" : "Perfil pessoal"}
          {account.username && ` · ${account.username}`}
        </p>
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

      {/* Status badge */}
      <Badge variant={account.isActive ? "success" : "outline"} className="text-[10px] shrink-0">
        {account.isActive ? "ativa" : "inativa"}
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
