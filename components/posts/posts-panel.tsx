"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Zap,
  Loader2,
  ShieldCheck,
  Bot,
  Download,
  AlertCircle,
  Trash2,
  Archive,
  RotateCcw,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { JanelaDoConteudoPronto } from "@/components/posts/janela-do-conteudo-pronto";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PipelineLive } from "./pipeline-live";
import { CampaignSetupModal, type CampaignConfig } from "./campaign-setup-modal";
import { JanelaDoTikTok } from "@/components/social/janela-do-tiktok";
import { FalhaDaPublicacao } from "@/components/posts/falha-da-publicacao";
import { BotaoDescartar, Descartavel } from "@/components/ui/descartar";
import { chaveDaDica, chaveDaReconexaoDoPost } from "@/lib/avisos/chaves";

/** As dicas fixas da aba Posts (07/10): descarte permanente por pessoa. */
const CHAVE_DA_APROVACAO_OBRIGATORIA = chaveDaDica("posts-aprovacao-obrigatoria");
const CHAVE_DE_SALVAR_A_MIDIA = chaveDaDica("salvar-midia");
import type { CodigoDePublicacao } from "@/lib/publish/codigos";

interface Post {
  id: string;
  platform: string;
  content: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  mediaType: string | null;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  externalUrl: string | null;
  sourcesComment: string | null;
  createdAt: Date;
  socialAccountId: string | null;
  socialAccount: { displayName: string | null; platform: string } | null;
  /** O código PUB-* da falha, já lido no servidor (só em post que falhou). */
  falhaDaPublicacao?: { codigo: CodigoDePublicacao; protocolo: string | null; motivoDaRede: string | null } | null;
  /** A chave do descarte da falha (07/10), montada no servidor. */
  chaveDaFalha?: string | null;
}

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
  accountType: string;
}

/** Uma rede que a propria rede recusou, para o post que falhou poder explicar. */
interface RedeParaReconectar {
  /** A conta (07/10): com o instante, é a chave do descarte do aviso. */
  id?: string;
  platform: string;
  needsReconnectReason: string | null;
  needsReconnectAt?: string | null;
}

function pickSocialAccount(post: Post, accounts: SocialAccount[]): SocialAccount | undefined {
  const same = accounts.filter((a) => a.platform === post.platform);
  if (same.length === 0) return undefined;
  if (post.socialAccountId) {
    const exact = same.find((a) => a.id === post.socialAccountId);
    if (exact) return exact;
  }
  const personal = same.find((a) => a.accountType === "personal");
  return personal ?? same[0];
}

interface Project {
  id: string;
  name: string;
  /**
   * A frequência escolhida no setup ("3x por semana").
   *
   * Estava no objeto que esta tela recebe (a página passa o projeto inteiro do
   * Prisma) e NÃO estava neste tipo, então nunca era passada adiante. Efeito,
   * medido em 18/09: o mesmo assistente montava planos diferentes conforme de
   * onde foi aberto. Pelo Gestor, sete dias alternados; por aqui, cinco dias
   * com "livre" na sexta. Quem confere de um lado e roda do outro vê duas
   * verdades sobre a própria campanha.
   */
  postFrequency?: string | null;
}

interface PostsPanelProps {
  project: Project;
  posts: Post[];
  socialAccounts: SocialAccount[];
  redesParaReconectar?: RedeParaReconectar[];
}

/**
 * A frase do motivo, quando a rede disse o motivo. Gêmea da de
 * social-connect-panel: as duas telas contam a mesma história sobre o mesmo
 * fato, e é o cliente que passa por elas em sequência.
 */
function motivoEmPortugues(codigo: string | null): string {
  switch (codigo) {
    case "REVOKED_ACCESS_TOKEN":
      return "O acesso a esta rede foi retirado nas permissões da sua conta.";
    case "EXPIRED_ACCESS_TOKEN":
      return "O acesso a esta rede expirou.";
    case "invalid_grant":
    case "INVALID_ACCESS_TOKEN":
    case "invalid_token":
      return "A rede não aceita mais este acesso.";
    default:
      return "A rede recusou o acesso.";
  }
}

const STATUS_CONFIG = {
  draft: { label: "Rascunho", variant: "secondary" as const, icon: Clock },
  scheduled: { label: "Agendado", variant: "warning" as const, icon: Clock },
  published: { label: "Publicado", variant: "success" as const, icon: CheckCircle2 },
  failed: { label: "Falhou", variant: "destructive" as const, icon: XCircle },
  rejected: { label: "Rejeitado", variant: "secondary" as const, icon: XCircle },
  cancelled: { label: "Arquivado", variant: "secondary" as const, icon: XCircle },
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/**
 * A caixinha de marcar, com o estado "parcial" para o selecionar todos.
 *
 * É um `<button>` e não um `<input type=checkbox>` porque o visual precisa dos
 * três estados e da cor da marca; o papel de caixa de marcar vai por
 * `role="checkbox"` e `aria-checked`, que é o que o leitor de tela lê.
 */
function Marcador({
  marcado,
  parcial = false,
  onMudar,
  rotulo,
}: {
  marcado: boolean;
  parcial?: boolean;
  onMudar: () => void;
  rotulo: string;
}) {
  const aceso = marcado || parcial;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={parcial ? "mixed" : marcado}
      aria-label={rotulo}
      title={rotulo}
      onClick={onMudar}
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
      style={{
        background: aceso ? "var(--accent-orange)" : "var(--bg-input)",
        borderColor: aceso ? "var(--accent-orange)" : "var(--border)",
      }}
    >
      {parcial ? (
        <span className="h-[2px] w-[9px] rounded-full bg-white" />
      ) : marcado ? (
        <CheckCircle2 className="h-3 w-3 text-white" strokeWidth={3} />
      ) : null}
    </button>
  );
}

export function PostsPanel({ project, posts: initialPosts, socialAccounts, redesParaReconectar = [] }: PostsPanelProps) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  // O post do TikTok esperando as escolhas da pessoa (ver janela-do-tiktok).
  const [janelaTikTok, setJanelaTikTok] = useState<Post | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [generating, setGenerating] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  /**
   * "NOVO POST COM ARQUIVO PRONTO" (06/10): a mesma janela do quadro, aqui na
   * aba Posts. Ao salvar, a página recarrega do servidor (router.refresh) e a
   * lista acompanha as props novas, que até hoje só valiam na primeira
   * pintura.
   */
  const [conteudoProntoAberto, setConteudoProntoAberto] = useState(false);
  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  // Restore active pipeline run on page load
  useEffect(() => {
    fetch(`/api/pipeline/status?projectId=${project.id}`)
      .then((r) => r.json())
      .then((d) => {
        const run = d.run;
        if (run?.status === "running" && run?.id) {
          setActiveRunId(run.id);
          setGenerating(true);
        }
      })
      .catch(() => {});
  }, [project.id]);
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<Array<{ title: string; description: string; format: string }>>([]);
  /**
   * Os posts marcados. Pedido do Bruno em 18/09: "deve dar para selecionar
   * tudo ou todos de uma vez com flags, vou deletar tudo e gerar de novo".
   * Vinte posts, vinte confirmações e vinte cliques é o tipo de trabalho que
   * a tela devia fazer por ele.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [emMassa, setEmMassa] = useState(false);

  async function suggestTopics() {
    setLoadingTopics(true);
    setSuggestedTopics([]);
    try {
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestedTopics(data.topics ?? []);
    } catch {
      toast.error("Erro ao buscar sugestões. Tente novamente.");
    } finally {
      setLoadingTopics(false);
    }
  }

  function openCampaignModal() {
    if (!topic.trim()) {
      setShowTopicInput(true);
      return;
    }
    setShowCampaignModal(true);
  }

  async function generateCampaign(campaignConfig: CampaignConfig) {
    setShowCampaignModal(false);
    setGenerating(true);
    setShowTopicInput(false);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, topic: topic.trim(), campaignConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const runId = data.run?.id ?? data.runId;
      setActiveRunId(runId);
      // Redireciona para o Gestor de Conteúdo em tempo real
      router.push(`/projects/${project.id}/live`);
    } catch (err) {
      toast.error("Erro ao iniciar campanha");
      console.error(err);
      setGenerating(false);
    }
  }

  async function publishPost(post: Post, escolhasFeitas = false) {
    // TikTok passa pela janela toda vez: as regras de publicação dele pedem
    // que a pessoa escolha privacidade e interações na hora de publicar.
    if (post.platform === "tiktok" && !escolhasFeitas) {
      setJanelaTikTok(post);
      return;
    }
    const account = pickSocialAccount(post, socialAccounts);
    if (!account) {
      toast.error(
        `Nenhuma conta ${PLATFORM_LABELS[post.platform] ?? post.platform} pronta para publicar (token ou permissões). Reconecte em Configurações.`
      );
      return;
    }

    setPublishing(post.id);
    try {
      const res = await fetch(`/api/posts/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      let data: { error?: string; url?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
      }
      if (!res.ok) {
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, status: "published", publishedAt: new Date(), externalUrl: data.url ?? null }
            : p
        )
      );
      toast.success("Post publicado com sucesso!");
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Erro ao publicar. Tente reconectar a rede em Configurações.";
      toast.error(message.length > 220 ? `${message.slice(0, 217)}…` : message);
      console.error(err);
    } finally {
      setPublishing(null);
    }
  }

  async function rejectPost(post: Post) {
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (!res.ok) throw new Error();

      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, status: "rejected" } : p))
      );
      toast.success("Post rejeitado e movido para Arquivados");
    } catch {
      toast.error("Erro ao rejeitar post");
    }
  }

  // "cancelled" entrou em 14/09, e é o mesmo valor que o Gestor já grava ao
  // arquivar. Sem ele aqui, um post arquivado nesta tela sumiria de todas as
  // abas: nem em "todos" (que esconde os cancelados) nem em "cancelados".
  // A FALHA SAIU DAQUI (01/10, pedido do Bruno: "os posts que falham, eu não
  // consigo arquivar"). O post que falhou ficava escondido na aba Cancelados,
  // misturado aos arquivados, e "Todos" não mostrava: quem procurava a falha
  // para arquivar não achava. Agora ela aparece em Todos e na aba "Com falha",
  // e Arquivados é só o que saiu da fila por decisão (arquivado ou recusado).
  const isCanceled = (status: string) => status === "rejected" || status === "cancelled";

  /** Arquivar: sai da fila e tem volta. É o caminho do dia a dia. */
  async function arquivarPost(post: Post) {
    await mudarStatus(post, "cancelled", "Post arquivado.");
  }

  /** Devolve um post recusado para a fila de revisão. */
  async function voltarParaRascunho(post: Post) {
    await mudarStatus(post, "draft", "Post de volta em rascunho.");
  }

  async function mudarStatus(post: Post, status: string, sucesso: string) {
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status } : p)));
      toast.success(sucesso);
    } catch {
      toast.error("Não consegui mudar o post. Tente de novo.");
    }
  }

  /**
   * Apagar de verdade, e é o único caminho sem volta da tela.
   *
   * A confirmação mostra o começo do texto em vez de perguntar "tem certeza?":
   * numa lista de posts parecidos, o que evita o clique errado é ver QUAL post
   * vai sumir, não um aviso genérico.
   */
  async function apagarPost(post: Post) {
    const trecho = post.content.slice(0, 80).replace(/\s+/g, " ");
    if (!window.confirm(`Apagar este post para sempre?\n\n"${trecho}..."\n\nIsso não tem volta.`)) return;
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      // 409: o post já foi ao ar e o servidor recusa apagar (01/10); a frase
      // dele diz o que fazer (arquivar), melhor que "tente de novo".
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "");
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast.success("Post apagado.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não consegui apagar o post. Tente de novo.");
    }
  }

  const filtered =
    filter === "all"
      ? posts.filter((p) => !isCanceled(p.status))
      : filter === "rejected"
      ? posts.filter((p) => isCanceled(p.status))
      : posts.filter((p) => p.status === filter);

  // ── A seleção ──────────────────────────────────────────────────────────────

  /** Só conta o que está À VISTA: marcar "todos" numa aba não pode pegar o que
   *  a outra aba esconde. A pessoa responde pelo que ela vê. */
  const idsVisiveis = filtered.map((p) => p.id);
  const marcadosVisiveis = idsVisiveis.filter((id) => selecionados.has(id));
  const todosMarcados = idsVisiveis.length > 0 && marcadosVisiveis.length === idsVisiveis.length;

  function alternarPost(id: string) {
    setSelecionados((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(idsVisiveis));
  }

  function trocarFiltro(novo: string) {
    // A seleção morre ao trocar de aba, de propósito: manter marcado o que
    // saiu da tela é como a pessoa apaga sem querer o que não estava vendo.
    setFilter(novo);
    setSelecionados(new Set());
  }

  /**
   * A ação em massa, numa chamada só (`/api/posts/em-massa`).
   *
   * Apagar pergunta antes, e a pergunta diz o NÚMERO e as redes, porque é o
   * único caminho sem volta da tela. Arquivar não pergunta: tem volta na aba
   * Cancelados, e confirmação para o que se desfaz só ensina a clicar em "sim"
   * sem ler.
   */
  async function acaoEmMassa(acao: "apagar" | "arquivar" | "rascunho") {
    const ids = marcadosVisiveis;
    if (ids.length === 0) return;

    const alvos = filtered.filter((p) => ids.includes(p.id));
    const publicados = alvos.filter((p) => p.status === "published").length;

    if (acao === "apagar") {
      const vaiApagar = ids.length - publicados;
      if (vaiApagar === 0) {
        toast.error("Só há posts publicados na seleção, e publicado não se apaga.");
        return;
      }
      const redes = [...new Set(alvos.map((p) => PLATFORM_LABELS[p.platform] ?? p.platform))].join(", ");
      const aviso = publicados > 0 ? `\n\n${publicados} já publicado(s) não serão apagados.` : "";
      if (
        !window.confirm(
          `Apagar ${vaiApagar} post(s) para sempre?\n\nRedes: ${redes}${aviso}\n\nIsso não tem volta.`
        )
      )
        return;
    }

    setEmMassa(true);
    try {
      const res = await fetch("/api/posts/em-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao }),
      });
      const dados = (await res.json()) as { feitos?: number; publicadosIgnorados?: number; error?: string };
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);

      const feitos = dados.feitos ?? 0;
      if (acao === "apagar") {
        const apagados = new Set(alvos.filter((p) => p.status !== "published").map((p) => p.id));
        setPosts((prev) => prev.filter((p) => !apagados.has(p.id)));
        toast.success(
          feitos === 1 ? "1 post apagado." : `${feitos} posts apagados.`
        );
      } else {
        const status = acao === "arquivar" ? "cancelled" : "draft";
        const alvo = new Set(ids);
        setPosts((prev) => prev.map((p) => (alvo.has(p.id) ? { ...p, status } : p)));
        toast.success(
          acao === "arquivar"
            ? `${feitos} post(s) arquivados. Eles ficam na aba Arquivados.`
            : `${feitos} post(s) de volta em rascunho.`
        );
      }
      if (dados.publicadosIgnorados) {
        toast(`${dados.publicadosIgnorados} post(s) já publicados ficaram como estavam.`);
      }
      setSelecionados(new Set());
    } catch (err) {
      // Falha silenciosa aqui seria pior que em qualquer outro lugar: a pessoa
      // acha que apagou, gera de novo, e fica com o dobro.
      toast.error(
        `Não consegui ${acao === "apagar" ? "apagar" : "mudar"} os posts. ${err instanceof Error ? err.message : ""}`.trim()
      );
    } finally {
      setEmMassa(false);
    }
  }

  const counts = {
    all: posts.filter((p) => !isCanceled(p.status)).length,
    draft: posts.filter((p) => p.status === "draft").length,
    published: posts.filter((p) => p.status === "published").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    rejected: posts.filter((p) => isCanceled(p.status)).length,
    failed: posts.filter((p) => p.status === "failed").length,
  };

  return (
    <div className="p-6 lg:p-8 w-full">
      {janelaTikTok && (
        <JanelaDoTikTok
          projectId={project.id}
          posts={[{ id: janelaTikTok.id, content: janelaTikTok.content, imageUrl: janelaTikTok.imageUrl }]}
          acao="publicar"
          onConcluir={() => {
            const p = janelaTikTok;
            setJanelaTikTok(null);
            void publishPost(p, true);
          }}
          onCancelar={() => setJanelaTikTok(null)}
        />
      )}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Posts</h1>
            <p className="mt-1" style={{ color: "var(--text-muted)" }}>{project.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setConteudoProntoAberto(true)} data-novo-post-com-arquivo>
              <FileUp className="w-4 h-4" />
              Novo post com arquivo pronto
            </Button>
            <Button onClick={openCampaignModal} loading={generating} disabled={generating}>
              <Zap className="w-4 h-4" />
              {generating ? "Gerando campanha..." : "Gerar campanha da semana"}
            </Button>
          </div>
        </div>
        <JanelaDoConteudoPronto
          aberto={conteudoProntoAberto}
          projectId={project.id}
          contas={socialAccounts}
          onFechar={() => setConteudoProntoAberto(false)}
          onCriado={() => {
            setConteudoProntoAberto(false);
            setFilter("draft");
            router.refresh();
          }}
        />

        {(showTopicInput || topic) && !generating && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && openCampaignModal()}
                placeholder="Qual o tema? Ex: IA no RH, tendências de marketing 2026..."
                className="flex-1 h-10 px-4 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                autoFocus
              />
              <Button onClick={suggestTopics} variant="outline" loading={loadingTopics} disabled={loadingTopics}>
                <Bot className="w-4 h-4" />
                Sugerir com IA
              </Button>
              <Button onClick={openCampaignModal} disabled={!topic.trim()}>
                <Zap className="w-4 h-4" />
                Iniciar
              </Button>
            </div>

            {/* AI topic suggestions */}
            {loadingTopics && (
              <div className="flex items-center gap-2 text-sm py-2" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                Pesquisando tendências e hype para seu nicho...
              </div>
            )}

            {suggestedTopics.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Sugestões da IA, clique para usar:</p>
                {suggestedTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setTopic(t.title); setSuggestedTopics([]); }}
                    className="w-full text-left p-3 rounded-lg border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium group-hover:text-orange-500 transition-colors" style={{ color: "var(--text-primary)" }}>
                          {t.title}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded shrink-0 capitalize" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                        {t.format}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!showTopicInput && !topic && !generating && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Clique no botão acima para gerar posts com IA para aprovação.
          </p>
        )}
      </div>

      {/* Approval notice: uma dica fixa, que se descarta de vez (07/10). A
          regra continua valendo: nada publica sem aprovar. */}
      <Descartavel chave={CHAVE_DA_APROVACAO_OBRIGATORIA}>
        <div className="mb-6 p-4 bg-green-900/10 border border-green-800/30 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-400">Aprovação obrigatória</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Nenhum post será publicado sem sua aprovação explícita. Revise cada post e clique em &quot;Aprovar e publicar&quot; quando estiver pronto.</p>
          </div>
          <BotaoDescartar className="-my-2 -mr-2" />
        </div>
      </Descartavel>

      {/* Pipeline live view */}
      {generating && activeRunId && (
        <PipelineLive
          runId={activeRunId}
          onComplete={() => {
            setGenerating(false);
            setActiveRunId(null);
            toast.success("Campanha gerada! Veja o Gestor de Conteúdo para revisar os cards.");
            window.location.reload();
          }}
          onError={() => {
            setGenerating(false);
            setActiveRunId(null);
            toast.error("Erro ao gerar campanha. Tente novamente.");
          }}
        />
      )}

      {posts.length === 0 && !generating && (
        <div className="mb-6 p-8 border border-dashed rounded-xl text-center" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <Zap className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--border)" }} />
          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nenhum post ainda</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Clique em &quot;Gerar campanha da semana&quot; para seus agentes criarem posts para aprovação.</p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: "all", label: "Todos" },
          { id: "draft", label: "Rascunhos" },
          { id: "scheduled", label: "Agendados" },
          { id: "published", label: "Publicados" },
          { id: "failed", label: "Com falha" },
          { id: "rejected", label: "Arquivados" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => trocarFiltro(tab.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
              filter === tab.id
                ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
                : "border-transparent"
            )}
            style={filter === tab.id ? undefined : { color: "var(--text-muted)" }}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-60">
              ({counts[tab.id as keyof typeof counts] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* A BARRA DE SELECAO.

          Ela ocupa o lugar fixo acima da lista, marcada ou nao, porque uma
          barra que aparece do nada empurra a lista para baixo no exato momento
          em que a pessoa esta clicando nela. */}
      {filtered.length > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
          style={{
            background: marcadosVisiveis.length > 0 ? "var(--bg-elevated)" : "var(--bg-card)",
            borderColor: marcadosVisiveis.length > 0 ? "color-mix(in srgb, var(--acento) 45%, transparent)" : "var(--border)",
          }}
        >
          <Marcador
            marcado={todosMarcados}
            parcial={marcadosVisiveis.length > 0 && !todosMarcados}
            onMudar={alternarTodos}
            rotulo={todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
          />
          <button
            type="button"
            onClick={alternarTodos}
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {marcadosVisiveis.length === 0
              ? `Selecionar todos (${filtered.length})`
              : `${marcadosVisiveis.length} de ${filtered.length} selecionados`}
          </button>

          {marcadosVisiveis.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {filter === "rejected" || filter === "scheduled" ? (
                <Button size="sm" variant="outline" onClick={() => acaoEmMassa("rascunho")} disabled={emMassa}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {filter === "scheduled" ? "Tirar da fila" : "Voltar para rascunho"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => acaoEmMassa("arquivar")} disabled={emMassa}>
                  <Archive className="h-3.5 w-3.5" />
                  Arquivar
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => acaoEmMassa("apagar")} disabled={emMassa}>
                {emMassa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Apagar
              </Button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 && posts.length > 0 ? (
        <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
          <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--border)" }} />
          <p className="text-sm">Nenhum post nesta categoria</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((post) => {
            const statusConfig = STATUS_CONFIG[post.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;
            // A rede deste post foi recusada pela propria rede? E o que permite
            // o post que falhou explicar o motivo em vez de so dizer "falhou".
            const precisaReconectar = redesParaReconectar.find((r) => r.platform === post.platform);
            const StatusIcon = statusConfig.icon;
            const isExpanded = expanded === post.id;

            return (
              <div
                key={post.id}
                className="rounded-xl overflow-hidden border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                {/* Post header */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : post.id)}
                >
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Marcador
                      marcado={selecionados.has(post.id)}
                      onMudar={() => alternarPost(post.id)}
                      rotulo={`Selecionar este post de ${PLATFORM_LABELS[post.platform] ?? post.platform}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </Badge>
                      <Badge
                        variant={statusConfig.variant}
                        className={`text-xs flex items-center gap-1 ${isCanceled(post.status) ? "opacity-60" : ""}`}
                      >
                        <StatusIcon className="w-2.5 h-2.5" />
                        {statusConfig.label}
                      </Badge>
                      {post.imageUrl && (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <ImageIcon className="w-2.5 h-2.5" />
                          Com imagem
                        </Badge>
                      )}
                      {/* Por onde sai. A rede sozinha nao diz, com perfil e pagina no mesmo projeto. */}
                      {(() => {
                        const conta = pickSocialAccount(post, socialAccounts);
                        const nome = post.socialAccount?.displayName ?? conta?.displayName;
                        const tipo = conta?.accountType === "organization" ? "página" : conta ? "perfil" : null;
                        return nome ? (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            · {nome}{tipo ? ` (${tipo})` : ""}
                          </span>
                        ) : null;
                      })()}
                      <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                        {formatDate(post.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {post.content}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 shrink-0 mt-1" style={{ color: "var(--text-muted)" }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 mt-1" style={{ color: "var(--text-muted)" }} />
                  )}
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t pt-4 space-y-4" style={{ borderColor: "var(--border)" }}>
                        {/* Full content */}
                        <div className="rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
                          {post.content}
                        </div>

                        {/* Mídia do post */}
                        {post.imageUrl ? (
                          <div className="space-y-2">
                            {/* Vídeo ganha player, imagem ganha <img>, e os
                                dois passam pela rota autenticada. Antes a URL
                                crua do storage ia direto para o <img>: como o
                                store é privado, o navegador levava 403 e a
                                pessoa via um ícone de imagem quebrada escrito
                                "Post image" sem entender que aquilo era o
                                vídeo dela (relatado em 22/08). */}
                            {post.mediaType === "video" ? (
                              <video
                                src={`/api/posts/${post.id}/media`}
                                controls
                                preload="metadata"
                                className="rounded-lg max-h-64 w-full bg-black"
                              />
                            ) : (
                              <img
                                src={`/api/posts/${post.id}/media`}
                                alt="Imagem do post"
                                className="rounded-lg max-h-48 object-cover w-full"
                              />
                            )}
                            <div className="flex items-center justify-between gap-2">
                              {/* O aviso de mídia expirada vale para IMAGEM
                                  GERADA, que é apagada do servidor depois de
                                  publicada. Não vale para a gravação que a
                                  própria pessoa enviou: ela tem o arquivo, e
                                  mandar "salve antes de publicar" só confunde
                                  (relatado em 22/08: "baixar o vídeo pra quê?
                                  não entendi"). */}
                              {post.mediaType === "video" ? (
                                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>Esta é a sua gravação, do jeito que vai para o canal</span>
                                </div>
                              ) : (
                                <Descartavel chave={CHAVE_DE_SALVAR_A_MIDIA}>
                                  <div className="flex items-center gap-1.5 text-xs text-amber-400/80">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span>Salve a mídia antes de publicar, ela será removida do servidor após publicação</span>
                                    <BotaoDescartar compacto />
                                  </div>
                                </Descartavel>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 text-xs h-7 px-2"
                                onClick={() => {
                                  // Pela rota autenticada, e não pela URL do
                                  // storage: o store é privado e a URL crua
                                  // responde 403 numa aba branca.
                                  const a = document.createElement("a");
                                  a.href = `/api/posts/${post.id}/media?download=1`;
                                  a.click();
                                }}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Baixar
                              </Button>
                            </div>
                          </div>
                        ) : post.imagePrompt && post.status !== "published" ? (
                          <div className="rounded-lg p-3 space-y-1 border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Prompt da imagem (mídia expirada ou falhou):</p>
                            <p className="text-xs italic leading-relaxed" style={{ color: "var(--text-muted)" }}>{post.imagePrompt}</p>
                          </div>
                        ) : null}

                        {/* Sources */}
                        {post.sourcesComment && (
                          <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3">
                            <p className="text-xs text-blue-400 font-medium mb-1.5">
                              Fontes (publicar como 1º comentário):
                            </p>
                            <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                              {post.sourcesComment}
                            </p>
                          </div>
                        )}

                        {/* External link */}
                        {post.externalUrl && (
                          <a
                            href={post.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Ver post publicado
                          </a>
                        )}

                        {/* ── Por que este post falhou ─────────────────────
                            Vem ANTES dos botões de propósito: tentar de novo
                            sem reconectar falha igual, e o cliente ficaria
                            clicando sem entender. A causa é da CONTA, e o
                            banner só aparece quando a rede realmente recusou
                            aquela rede (gravado em needsReconnectAt). */}
                        {post.status === "failed" && precisaReconectar && (
                          // Crítico (07/10): descartado, recolhe e o "Reconectar" fica.
                          // Também continua em Configurações do projeto > Redes.
                          <Descartavel
                            chave={chaveDaReconexaoDoPost(post.id, precisaReconectar.id ?? post.socialAccountId, precisaReconectar.needsReconnectAt)}
                            modo="recolher"
                            compacto={
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2 border" style={{ borderColor: "var(--border)" }} data-reconectar-recolhido>
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>A rede pede reconexão.</span>
                                <a href={`/projects/${project.id}/settings`} className="text-[11px] font-semibold text-orange-400 hover:text-orange-300">
                                  Reconectar {PLATFORM_LABELS[post.platform] ?? post.platform}
                                </a>
                              </div>
                            }
                          >
                          <div
                            className="flex items-start gap-2.5 rounded-xl px-4 py-3 border"
                            style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(185,28,28,0.06)" }}
                          >
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-red-400">
                                {motivoEmPortugues(precisaReconectar.needsReconnectReason)}
                              </p>
                              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                                O post continua aqui, inteiro. Reconecte a rede e publique de novo.
                              </p>
                              <a
                                href={`/projects/${project.id}/settings`}
                                className="inline-block mt-2 text-[11px] font-semibold text-orange-400 hover:text-orange-300"
                              >
                                Reconectar {PLATFORM_LABELS[post.platform] ?? post.platform}
                              </a>
                            </div>
                            <BotaoDescartar compacto />
                          </div>
                          </Descartavel>
                        )}

                        {/* A FALHA COM CÓDIGO (01/10): o que aconteceu, o que
                            fazer e o código, em vez da frase crua. Quando a
                            causa é a conta (banner de cima), ela já explica. */}
                        {post.status === "failed" && !precisaReconectar && post.falhaDaPublicacao && (
                          <FalhaDaPublicacao
                            postId={post.id}
                            codigo={post.falhaDaPublicacao.codigo}
                            protocolo={post.falhaDaPublicacao.protocolo}
                            motivoDaRede={post.falhaDaPublicacao.motivoDaRede}
                            chave={post.chaveDaFalha}
                            rede={PLATFORM_LABELS[post.platform] ?? post.platform}
                          />
                        )}

                        {/* ── Ações, por estado ──────────────────────────────
                            Até 14/09 esta linha só existia para "draft", e um
                            post que falhava virava beco sem saída: sem tentar
                            de novo, sem arquivar e sem apagar. Cada estado
                            ganha o que faz sentido nele, e nada mais.
                            Publicado não ganha nada além do link: apagar ali
                            apagaria o registro de algo que está no ar, e o
                            relatório mensal sai daqui. */}
                        {post.status === "draft" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => publishPost(post)}
                              loading={publishing === post.id}
                              className="flex-1"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Aprovar e publicar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectPost(post)}
                              disabled={publishing === post.id}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => apagarPost(post)} title="Apagar para sempre">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}

                        {post.status === "failed" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => publishPost(post)}
                              loading={publishing === post.id}
                              className="flex-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Tentar publicar de novo
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => arquivarPost(post)}>
                              <Archive className="w-3.5 h-3.5" />
                              Arquivar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => apagarPost(post)} title="Apagar para sempre">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}

                        {(post.status === "rejected" || post.status === "cancelled") && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => voltarParaRascunho(post)} className="flex-1">
                              <RotateCcw className="w-3.5 h-3.5" />
                              Voltar para rascunho
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => apagarPost(post)}>
                              <Trash2 className="w-3.5 h-3.5" />
                              Apagar
                            </Button>
                          </div>
                        )}

                        {post.status === "scheduled" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => publishPost(post)}
                              loading={publishing === post.id}
                              className="flex-1"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Publicar agora
                            </Button>
                            {/* TIRAR DA FILA é o caminho de quem só quer adiar.
                                Até 18/09 o único jeito de desfazer um
                                agendamento aqui era arquivar, que some com a
                                peça: para não sair amanhã, a pessoa perdia o
                                post. */}
                            <Button size="sm" variant="outline" onClick={() => voltarParaRascunho(post)}>
                              <RotateCcw className="w-3.5 h-3.5" />
                              Tirar da fila
                            </Button>
                            {/* Sem apagar aqui: post agendado sumir sem aviso é
                                o tipo de coisa que a pessoa descobre tarde. */}
                            <Button size="sm" variant="outline" onClick={() => arquivarPost(post)}>
                              <Archive className="w-3.5 h-3.5" />
                              Arquivar
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Campaign Setup Modal */}
      <AnimatePresence>
        {showCampaignModal && (
          <CampaignSetupModal
            onConfirm={generateCampaign}
            onClose={() => setShowCampaignModal(false)}
            projectId={project.id}
            // As duas telas passam as MESMAS props desde 19/09. Sem esta linha,
            // o plano sugerido mudava conforme de onde a janela foi aberta.
            postFrequency={project.postFrequency}
            // Sem isto a janela caía num par fixo de LinkedIn e X e oferecia as
            // duas como se estivessem conectadas. A página já entrega só contas
            // que podem publicar (whereSocialAccountCanPublish), então esta
            // lista é a verdade e não uma suposição.
            redesConectadas={socialAccounts.map((a) => a.platform)}
            contasConectadas={socialAccounts}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
