"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Sparkles, Loader2, CheckCircle2, PencilLine, ArrowRight,
  X, Clock, MessageCircle, Send, ThumbsDown, Image as ImageIcon,
  Video, LayoutGrid, AlarmClock, Zap, Ban, RotateCcw, Download, AlertCircle,
  FileText, Search, Pencil, Globe, Bot, ShieldAlert,
  BarChart2, List, BookOpen, Archive, PieChart, Eye, MoreVertical, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RedeIcone } from "@/components/social/rede-icone";
import { FotoDaConta } from "@/components/social/selo-da-conta";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { FUSO_PADRAO } from "@/lib/fuso";
import { lerRevisao, type RevisaoEmAndamento } from "@/lib/pipeline/revisao";

// Sem SSR: o escritorio decide WebGL e tema no primeiro render, e isso so
// existe no navegador. O three.js so e baixado nesta aba, e so aqui.
const Escritorio = dynamic(() => import("@/components/escritorio/escritorio").then((m) => m.Escritorio), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border" style={{ borderColor: "var(--border)", height: "min(52vw, 400px)", minHeight: 260, background: "var(--bg-card)" }} />
  ),
});
import { CampaignSetupModal, type CampaignConfig } from "@/components/posts/campaign-setup-modal";
import { EscolhaDeOrigem } from "@/components/posts/escolha-de-origem";
import { EsteiraDoVideo, type VideoAoVivo, type CorteGuardado } from "@/components/video/esteira-do-video";
import { faltamAteOFim } from "@/lib/media/linha-do-tempo";
import { EnviarGravacao } from "@/components/video/enviar-gravacao";
import { estadoDoPost, resumoDoDia, horaCurta, CORES, type PostParaEstado, type ResumoDoDia } from "@/lib/posts/estado";
import { horarioParaAprovar, rotuloDoHorario, diaEHora, paraCampos, deCampos } from "@/lib/posts/horario-da-peca";
import { cardEmProducao } from "@/lib/squad/peca-em-producao";
import { lerRevisaoDoCorte, type RevisaoDoCorte } from "@/lib/media/estado-da-revisao-do-corte";
import { lerAberturaIa } from "@/lib/media/estado-da-abertura-ia";
import { lerMontagem } from "@/lib/media/estado-da-montagem";
import { TentarMontagem } from "@/components/video/tentar-montagem";
import { AvisoDaMontagem, type FalhaDaMontagem } from "@/components/video/aviso-da-montagem";
import { alcanceDaReprovacao, rotuloDaReprovacao, avisoDaReprovacao, ESTADOS_MORTOS } from "@/lib/content/reprovacao";
import { etiquetaDaPeca } from "@/lib/posts/etiqueta-da-peca";
import { cardsDaPeca, chaveDaPeca, familiaDaChave } from "@/lib/posts/cards-da-peca";
import { custoDeRefazerPeca } from "@/lib/credits/estimativa";
import { formatoDoPost } from "@/lib/publish/formato-de-destino";
import { DestinosDoDia } from "@/components/posts/destinos-do-dia";
import { FalhaDaPublicacao } from "@/components/posts/falha-da-publicacao";
import { TRADUCAO_DOS_CODIGOS, chamadoDaFalha, codigoDaFalha, motivoDaRedeNaFrase } from "@/lib/publish/codigos";
import { abrirChamado as abrirJanelaDeChamado } from "@/lib/suporte/abrir-chamado";
import { SemanaDoQuadro, proximaPeca, type DiaDaSemana, type PecaDoDia, type EstadoDaPeca } from "@/components/content/semana-do-quadro";
import { andamentoDosDias } from "@/lib/pipeline/andamento-dos-dias";
import { FichaDoAgente, type TrabalhoDoAgente } from "@/components/escritorio/ficha-do-agente";
import { LinhaDoTempoDoParecer } from "@/components/escritorio/linha-do-tempo-do-parecer";
import type { EtapaDoParecer } from "@/lib/squad/parecer-da-peca";
import { JornadaDaCampanha } from "@/components/posts/jornada-da-campanha";
import { CorteGuardadoModal } from "@/components/video/corte-guardado";
import { CapaDoCompleto } from "@/components/video/capa-do-completo";
import { JanelaDoTikTok, type PostParaTikTok } from "@/components/social/janela-do-tiktok";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import { useUmaAUma } from "@/components/escritorio/pecas-uma-a-uma";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignCard {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  scheduledDate: string | null;
  cardType: string;
  mediaType?: string | null;
  content: string | null;
  mediaUrl: string | null;
  metadata?: unknown;
  status: string;
  postId: string | null;
  chatHistory: ChatMessage[];
  createdAt?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PipelineRun {
  id: string;
  status: string;
  topic: string | null;
  campaignMode: string;
  weekStart: string | null;
}

interface SocialAccount {
  id: string;
  platform: string;
  displayName: string | null;
  accountType: string;
  /** A foto da conta: a logo da página ou o rosto do perfil. */
  avatarUrl?: string | null;
  /** Opcional porque nem toda tela que monta este tipo seleciona o campo. */
  isActive?: boolean;
}

interface ContentManagerProps {
  projectId: string;
  projectName: string;
  initialCards: CampaignCard[];
  activeRun: PipelineRun | null;
  lastFailedRun: PipelineRun | null;
  socialAccounts: SocialAccount[];
  /**
   * O estado das gravações do projeto, para a faixa do piloto abrir já
   * preenchida. Desde 02/09 o processo de vídeo acontece nesta tela, e não numa
   * tela própria: ver `EsteiraDoVideo`.
   */
  videos: VideoAoVivo[];
  /** A frequencia escolhida no setup ("3x por semana"): e o que o wizard usa
   *  como dias pre-marcados, em vez de perguntar de novo do zero. */
  postFrequency?: string | null;
  /** Os posts da semana aberta: e deles que o card do Paulo no quadro deriva o
   *  estado (publicado, agendado, rascunho, falhou). Ver lib/posts/estado.ts. */
  postsDaSemana?: PostParaEstado[];
  /** As três escolhas que decidem como o corte é editado, para o painel de envio. */
  videoEstilo: string | null;
  videoMusica: string | null;
  videoTermos: string | null;
  /** Project.videoSemana: o formato de cada dia a partir do vídeo. */
  videoSemana: unknown;
  /**
   * As montagens de efeitos que DESISTIRAM por erro técnico (01/10, parte
   * 240), para o aviso acima do quadro: a faixa do vídeo dizia "pronto" e o
   * cliente achava que a edição tinha terminado.
   */
  falhasDaMontagem?: FalhaDaMontagem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = [
  { dayOfWeek: 1, label: "Segunda", short: "Seg" },
  { dayOfWeek: 2, label: "Terça", short: "Ter" },
  { dayOfWeek: 3, label: "Quarta", short: "Qua" },
  { dayOfWeek: 4, label: "Quinta", short: "Qui" },
  { dayOfWeek: 5, label: "Sexta", short: "Sex" },
  { dayOfWeek: 6, label: "Sábado", short: "Sáb" },
  { dayOfWeek: 7, label: "Domingo", short: "Dom" },
];

const AGENT_ROWS = [
  { agentId: "roberto-radar", label: "Roberto Radar", subtitle: "Pesquisa", color: "bg-blue-500", cardType: "research", icon: Search },
  { agentId: "lucas-linkedin", label: "Lucas LinkedIn", subtitle: "Post LinkedIn", color: "bg-blue-700", cardType: "post_linkedin", icon: Globe },
  { agentId: "xavier-x", label: "Xavier X", subtitle: "Thread X", color: "bg-slate-600", cardType: "post_twitter", icon: Globe },
  // Os especialistas de 29/09 gravam peças do tipo do Lucas; o que os separa é o agentId.
  { agentId: "igor-instagram", label: "Igor Instagram", subtitle: "Instagram", color: "bg-pink-600", cardType: "post_instagram", icon: Globe },
  { agentId: "fernanda-facebook", label: "Fernanda Facebook", subtitle: "Facebook", color: "bg-indigo-500", cardType: "post_facebook", icon: Globe },
  { agentId: "tiago-tiktok", label: "Tiago TikTok", subtitle: "TikTok", color: "bg-sky-500", cardType: "post_tiktok", icon: Globe },
  { agentId: "yan-youtube", label: "Yan YouTube", subtitle: "YouTube", color: "bg-red-600", cardType: "post_youtube", icon: Video },
  { agentId: "diana-design", label: "Diana Design", subtitle: "Mídia", color: "bg-purple-500", cardType: "media", icon: ImageIcon },
  // A linha do vídeo existe porque o squad EDITA vídeo desde 23/08, e sem ela
  // os cortes cairiam na linha da Diana, misturados com imagem gerada. Quem
  // olha o quadro precisa ver que houve trabalho de vídeo.
  { agentId: "vitor-video", label: "Vitor Vídeo", subtitle: "Cortes", color: "bg-rose-500", cardType: "video_clip", icon: Video },
  { agentId: "vera-veredito", label: "Vera Veredito", subtitle: "Gerente do time", color: "bg-yellow-500", cardType: "preview", icon: FileText },
  { agentId: "paulo-publicador", label: "Paulo Publicador", subtitle: "Publicação", color: "bg-green-500", cardType: "publish", icon: Send },
];

/** A ordem em que as redes aparecem, e ela e a mesma no card e no calendario. */
const ORDEM_DA_REDE = ["youtube", "tiktok", "linkedin", "instagram", "facebook", "twitter"];

const CARD_TYPE_LABELS: Record<string, string> = {
  video_clip: "Corte de vídeo",
  research: "Pesquisa",
  post_linkedin: "Post LinkedIn",
  post_twitter: "Thread X",
  media: "Mídia",
  preview: "Preview",
  publish: "Publicação",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getUTCDay(); // use UTC day to avoid off-by-one on UTC-3 etc.
  const diff = day === 0 ? -6 : 1 - day;
  // Start from UTC midnight of the input date
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(base.getTime() + diff * 24 * 60 * 60 * 1000);
}

function addDays(d: Date, n: number): Date {
  // Use UTC-based arithmetic to avoid DST / timezone-offset issues
  const r = new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
  return r;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function formatDayDate(monday: Date, dayOfWeek: number): string {
  const d = addDays(monday, dayOfWeek - 1);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * O horário em que um post entra na fila. Quando o horário do dia já passou
 * (o cliente escolheu a semana atual e abriu o card depois da hora, ou dias
 * depois), a fila NÃO pode receber o horário original: a API recusa com
 * "Não é possível agendar no passado", que foi o toast do teste do Bruno de
 * 04/09. Aqui a fila anda para o próximo horário livre, e a tela avisa antes
 * de o cliente clicar.
 *
 * Até 29/09 ela andava para o MESMO horário do dia seguinte, que numa
 * campanha diária é o horário da peça seguinte. A conta agora mora em
 * lib/posts/horario-da-peca.ts e recebe os horários das outras peças.
 */
function horarioParaFila(
  isoDate: string | null | undefined,
  ocupados: string[] = []
): { iso: string; andou: boolean } | null {
  return horarioParaAprovar(isoDate, ocupados);
}

// Sempre em Brasília: sem o fuso, quem abria a tela num navegador fora do
// Brasil via outro horário no cabeçalho e na caixa do Paulo.
function formatScheduledAt(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: FUSO_PADRAO });
}

// ── Small Components ──────────────────────────────────────────────────────────

// O rosto do agente (arte de massinha, 28/09). A assinatura antiga fica para
// não mexer nas chamadas; a cor agora vem do próprio agente.
function AgentAvatar({ agentId, size = "sm" }: { agentId: string; color?: string; size?: "sm" | "md" | "lg" }) {
  return <AvatarDoAgente agenteId={agentId} tamanho={size === "sm" ? 28 : size === "md" ? 36 : 48} />;
}

/**
 * O AVATAR DE QUEM PEDIU A REVISÃO, com o ícone do pedido por cima.
 *
 * Pedido do Bruno em 21/09: "o usuário precisa saber que o comando foi
 * entendido e que seu pedido está sendo realizado", e o elemento que carrega
 * essa informação é o avatar DELE indo para o agente que vai trabalhar. O
 * ícone é um LÁPIS, e não o círculo pulsante: o pulsante já quer dizer "o
 * squad está gerando a peça", e dois estados diferentes com o mesmo símbolo
 * é o mesmo defeito do selo da Vera na parte 148, a tela contando uma coisa
 * e o banco outra.
 */
function AvatarDeQuemPediu({ nome, imagem, size = "sm" }: { nome: string | null; imagem: string | null; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-8 h-8 text-[11px]" : "w-5 h-5 text-[8px]";
  const iniciais = (nome ?? "Você")
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  if (imagem) {
    return <img src={imagem} alt={nome ?? "você"} className={cn("rounded-full object-cover shrink-0 border", dim)} style={{ borderColor: "var(--border)" }} />;
  }
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0 border", dim)}
      style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", borderColor: "var(--border)" }}>
      {iniciais}
    </div>
  );
}

/**
 * O SELO DE "EM REVISÃO PELO TIME", lido do card e não do componente aberto.
 *
 * Aparece na célula do calendário e no card aberto, com a mesma leitura
 * (`lerRevisao`), porque duas telas contando a mesma história de dois jeitos
 * é como o defeito nasce. Mostra quem pediu, quem está fazendo e o pedido em
 * uma linha: sem o pedido, o cliente não tem como saber se foi o dele.
 */
export function SeloDeRevisao({ revisao, grande = false }: { revisao: RevisaoEmAndamento; grande?: boolean }) {
  return (
    <div
      className={cn("flex items-center gap-1.5 rounded-md border px-1.5", grande ? "py-1.5 gap-2" : "py-1")}
      style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.10)" }}
    >
      <AvatarDeQuemPediu nome={revisao.porNome} imagem={revisao.porImagem} size={grande ? "lg" : "sm"} />
      <ArrowRight className={cn("shrink-0", grande ? "w-4 h-4" : "w-3 h-3")} style={{ color: "#f59e0b" }} />
      <PencilLine className={cn("shrink-0 animate-pulse", grande ? "w-4 h-4" : "w-3 h-3")} style={{ color: "#f59e0b" }} />
      <div className="min-w-0">
        <p className={cn("font-semibold leading-tight truncate", grande ? "text-xs" : "text-[9px]")} style={{ color: "#b45309" }}>
          {revisao.agenteNome} está revisando
        </p>
        <p className={cn("leading-tight truncate", grande ? "text-[11px]" : "text-[9px]")} style={{ color: "var(--text-muted)" }}>
          {`"${revisao.pedido}"`}
        </p>
      </div>
    </div>
  );
}

function CarouselSlider({
  slides,
  large,
  onSlideChange,
}: {
  slides: string[];
  large: boolean;
  onSlideChange?: (index: number) => void;
}) {
  const [current, setCurrent] = useState(0);

  function go(dir: number) {
    const next = (current + dir + slides.length) % slides.length;
    setCurrent(next);
    onSlideChange?.(next);
  }

  return (
    <div className="space-y-2 mt-1">
      {/* Main slide */}
      <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "1/1" }}>
        <img
          key={current}
          src={slides[current]}
          alt={`Slide ${current + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
        />
        {/* Slide number badge */}
        <span className="absolute top-2 right-2 text-xs bg-black/70 text-white px-2 py-0.5 rounded-full font-medium">
          {current + 1} / {slides.length}
        </span>
        {/* Nav arrows */}
        {slides.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Dot navigation + thumbnail strip */}
      <div className="flex items-center gap-1.5">
        {slides.map((src, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); onSlideChange?.(i); }}
            className="relative overflow-hidden rounded flex-shrink-0 transition-all"
            style={{
              width: large ? 56 : 36,
              height: large ? 56 : 36,
              border: i === current ? "2px solid var(--accent)" : "2px solid transparent",
              opacity: i === current ? 1 : 0.5,
            }}
          >
            <img src={src} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
        <span className="text-xs ml-auto flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          <LayoutGrid className="w-3 h-3" /> {slides.length} slides
        </span>
      </div>

      {/* Slide label for chat context */}
      {large && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Slide {current + 1} selecionado: use o chat abaixo para pedir ajustes neste slide específico
        </p>
      )}
    </div>
  );
}

function MediaPreview({
  mediaUrl,
  cardType,
  large = false,
  onSlideChange,
  poster,
}: {
  mediaUrl: string | null;
  cardType: string;
  large?: boolean;
  onSlideChange?: (index: number) => void;
  /**
   * O quadro que aparece ANTES de tocar. Sem ele o player abre um retângulo
   * preto, e um retângulo preto de 520px de altura lê como coisa quebrada,
   * mesmo com o vídeo carregado (o Bruno reclamou disso em 02/09). A capa do
   * corte já existe, então o poster sai de graça.
   */
  poster?: string | null;
}) {
  const [videoError, setVideoError] = useState(false);

  if (!mediaUrl) {
    if (cardType === "media") {
      return (
        <div className={cn("rounded-lg flex items-center justify-center text-xs gap-1", large ? "h-32" : "h-16")} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <ImageIcon className="w-4 h-4" /> Sem mídia
        </div>
      );
    }
    return null;
  }

  // Only treat as video if MIME type explicitly says so.
  //
  // A rota de mídia do vídeo entra na lista porque ela serve o arquivo por
  // consulta (`?tipo=vertical`) e não termina em .mp4: o storage é privado e a
  // URL crua responde 403, então o caminho tem que passar pela nossa rota
  // autenticada. Sem esta linha, o corte apareceria como imagem quebrada
  // dentro do quadro.
  const isVideo = mediaUrl.startsWith("data:video/") ||
    /\/api\/videos\/[^/]+\/midia\?.*tipo=(vertical|horizontal|completo)/.test(mediaUrl) ||
    (!mediaUrl.startsWith("data:") && (mediaUrl.toLowerCase().endsWith(".mp4") || mediaUrl.toLowerCase().endsWith(".webm")));

  // Carousel: multiple images joined by "|"
  const carouselSlides = mediaUrl.includes("|")
    ? mediaUrl.split("|").filter((s) => s.trim().length > 10)
    : null;

  if (carouselSlides && carouselSlides.length > 1) {
    if (large) {
      return <CarouselSlider slides={carouselSlides} large={large} onSlideChange={onSlideChange} />;
    }
    // Compact view in kanban card: show first slide with overlay
    return (
      <div className="relative overflow-hidden rounded-lg mt-1" style={{ height: 64 }}>
        <img src={carouselSlides[0]} alt="Carrossel" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <LayoutGrid className="w-4 h-4 text-white" />
          <span className="text-white text-xs ml-1">{carouselSlides.length} slides</span>
        </div>
      </div>
    );
  }
  if (isVideo && !videoError) {
    if (large) {
      return (
        <div className="mt-2 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "#000", maxHeight: 520 }}>
          <video
            key={mediaUrl}
            src={mediaUrl}
            poster={poster ?? undefined}
            controls
            playsInline
            muted
            autoPlay
            loop
            style={{ maxHeight: 520, maxWidth: "100%", width: "auto", display: "block", margin: "0 auto" }}
            onError={() => setVideoError(true)}
          />
        </div>
      );
    }
    return (
      <div className="relative mt-1 rounded-lg overflow-hidden" style={{ height: 64, background: "#000" }}>
        <video
          src={mediaUrl}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setVideoError(true)}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <Video className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }
  if (isVideo && videoError) {
    return (
      <div className={cn("rounded-lg flex flex-col items-center justify-center text-xs gap-1", large ? "h-32" : "h-16")} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        <Video className="w-4 h-4" />
        <span>Vídeo expirado: regenere via chat</span>
      </div>
    );
  }
  if (large) {
    return (
      <div className="relative mt-1 rounded-xl overflow-hidden group cursor-zoom-in"
        onClick={() => {
          // Open image in a new tab using a blob URL (avoids data: navigation block)
          if (mediaUrl.startsWith("data:")) {
            const [header, base64] = mediaUrl.split(",");
            const mime = header.replace("data:", "").replace(";base64", "");
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
          } else {
            window.open(mediaUrl, "_blank");
          }
        }}
      >
        <img src={mediaUrl} alt="Mídia gerada" className="w-full h-auto object-contain rounded-xl" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" style={{ background: "rgba(0,0,0,0.35)" }}>
          <span className="text-white text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(0,0,0,0.5)" }}>Clique para ampliar</span>
        </div>
      </div>
    );
  }
  return <img src={mediaUrl} alt="Mídia gerada" className="w-full object-cover rounded-lg mt-1 h-16" />;
}

// ── KanbanCard (minimal — opens modal on click) ───────────────────────────────

// Exportados para a prova de renderToString: o quadro inteiro so monta as
// celulas depois de escolher a semana no cliente, entao o SSR da pagina nunca
// desenha um card. Provar o componente que desenha e o que pega o defeito.
export function KanbanCard({
  card,
  agentRow,
  onOpenModal,
  compact,
  resumo,
}: {
  card: CampaignCard | undefined;
  agentRow: typeof AGENT_ROWS[0];
  onOpenModal: (card: CampaignCard, agentRow: typeof AGENT_ROWS[0]) => void;
  compact?: boolean;
  /** So no card do Paulo: o estado do dia, derivado dos posts. */
  resumo?: ResumoDoDia | null;
}) {
  if (!card) {
    return (
      <div className="rounded-lg border border-dashed h-16 flex items-center justify-center" style={{ borderColor: "var(--border)" }}>
        <span className="text-[10px]" style={{ color: "var(--border)" }}>Vazio</span>
      </div>
    );
  }

  const isMedia = card.cardType === "media";
  const hasError = card.content?.startsWith("AVISO:");
  // O pedido de ajuste em andamento, lido do proprio card: e o que faz o
  // calendario mostrar a revisao sem depender do card estar aberto.
  const revisao = lerRevisao(card.metadata);
  const virtual = (card.metadata as { virtual?: string; rotulo?: string } | null)?.virtual;

  // O lugar guardado do vídeo completo: traço pontilhado, porque é uma reserva
  // e não uma entrega. Sem clique, porque ainda não há nada para abrir.
  if (virtual === "completo") {
    const rotulo = (card.metadata as { rotulo?: string } | null)?.rotulo ?? "A caminho";
    return (
      <div
        className="rounded-lg border border-dashed p-2 flex flex-col gap-1.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
          <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
            {rotulo}
          </span>
        </div>
        <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
          {card.content}
        </p>
      </div>
    );
  }

  // Um corte que existe e não vai ao ar. Apagado, mas presente e clicável: some
  // do quadro era o que fazia parecer que o corte tinha se perdido.
  if (virtual === "guardado") {
    return (
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="rounded-lg border border-dashed cursor-pointer transition-all p-2 flex gap-1.5 opacity-60 hover:opacity-100"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        onClick={() => onOpenModal(card, agentRow)}
      >
        <AgentAvatar agentId={card.agentId} color={agentRow.color} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Uma palavra só: numa célula de 140px, "Guardado, não vai ao ar"
              quebrava em três linhas e empurrava o card para o dobro da altura
              (visto na tela em 02/09). O resto é explicado ao abrir. */}
          <span
            className="text-[9px] font-semibold uppercase tracking-wide truncate"
            style={{ color: "var(--text-muted)" }}
          >
            Guardado
          </span>
          <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "var(--text-muted)" }}>
            {card.content}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        "rounded-lg border cursor-pointer transition-all hover:shadow-md overflow-hidden",
        compact ? "text-[9px]" : "",
        // A REVISÃO GANHA A COR, e ela vem antes de aprovado e rejeitado: um
        // card que está sendo mexido agora não é mais o que o selo anterior
        // dizia, e é isso que o cliente precisa ver primeiro.
        revisao ? "border-amber-500" : card.status === "approved" ? "border-green-500/40" : card.status === "rejected" ? "border-red-500/40" : ""
      )}
      style={{
        background: revisao ? "rgba(245,158,11,0.06)" : "var(--bg-card)",
        borderColor: revisao ? undefined : card.status === "approved" ? undefined : card.status === "rejected" ? undefined : "var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
      onClick={() => onOpenModal(card, agentRow)}
    >
      <div className="p-2">
        {revisao && (
          <div className="mb-1.5">
            <SeloDeRevisao revisao={revisao} />
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <AgentAvatar agentId={card.agentId} color={agentRow.color} />
          <div className="flex-1 min-w-0">
            {isMedia && !hasError ? (
              <MediaPreview mediaUrl={card.mediaUrl} cardType="media" />
            ) : isMedia && hasError ? (
              <div className="h-16 rounded-lg flex items-center justify-center gap-1 border" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                <ImageIcon className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Clique para gerar imagem</span>
              </div>
            ) : card.cardType === "video_clip" ? (
              (() => {
                const m = card.metadata as { destino?: string; destinoRotulo?: string } | null;
                const plat = m?.destino === "youtube_shorts" || m?.destino === "youtube"
                  ? "youtube"
                  : m?.destino === "instagram_reels"
                    ? "instagram"
                    : m?.destino === "x"
                      ? "twitter"
                      : m?.destino ?? null;
                return (
                  <div className="flex items-center gap-1.5 py-1 min-w-0">
                    {plat && <RedeIcone plataforma={plat} className="w-3.5 h-3.5 shrink-0" />}
                    <span className="text-[10px] line-clamp-2" style={{ color: "var(--text-primary)" }}>
                      {card.content?.slice(0, 60) ?? "Corte de vídeo"}
                    </span>
                  </div>
                );
              })()
            ) : card.mediaType === "infographic" ? (
              <div className="flex items-center gap-1 py-2">
                <PieChart className="w-3 h-3 text-teal-400" />
                <span className="text-[10px] text-teal-400 font-medium">Infográfico</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>clique para ver</span>
              </div>
            ) : card.mediaType === "poll" ? (
              <div className="flex items-center gap-1 py-2">
                <BarChart2 className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-cyan-400 font-medium">Enquete</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.match(/PERGUNTA:\s*(.+)/)?.[1]?.slice(0, 30) ?? card.content?.slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : (card.mediaType === "thread" || card.cardType === "post_twitter") ? (
              <div className="flex items-center gap-1 py-1">
                <List className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] text-sky-400 font-medium">Thread</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.replace(/^\d+[\/\.\)]\s*/, "").slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : card.mediaType === "article" ? (
              <div className="flex items-center gap-1 py-1">
                <BookOpen className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-medium">Artigo</span>
                <span className="text-[10px] line-clamp-1 ml-1" style={{ color: "var(--text-muted)" }}>
                  {card.content?.slice(0, 30) ?? "..."}
                </span>
              </div>
            ) : card.cardType === "preview" ? (
              (() => {
                // A primeira linha do card da Vera é "Veredito: <rótulo>"
                // quando ela já revisou (`revisarDiasDoVideo` e a campanha de
                // texto). Até 02/09 a miniatura ignorava o conteúdo e mostrava
                // "Aguardando revisão" para sempre, e o Bruno concluiu que a
                // Vera "não está fazendo o trabalho dela".
                const veredito = card.content?.match(/^Veredito:\s*(.+)$/m)?.[1]?.trim();
                // "Precisa de você" e "o squad está corrigindo" nasceram em
                // 29/09 com a correção automática depois da Vera.
                const cor = !veredito
                  ? "var(--text-muted)"
                  : /reprovad|precisa de voc/i.test(veredito)
                    ? "#f87171"
                    : /ressalva|corrigindo/i.test(veredito)
                      ? "#fbbf24"
                      : "#4ade80";
                const rotulo = veredito
                  ? veredito
                  : card.status === "approved"
                    ? "✓ Aprovado"
                    : card.status === "rejected"
                      ? "✗ Reprovado"
                      : card.status === "needs_revision"
                        ? "⚠ Revisão"
                        : "Aguardando revisão";
                return (
                  <div className="flex items-center gap-1 py-1">
                    <Eye className="w-3 h-3 text-yellow-400" />
                    <span className="text-[10px] text-yellow-400 font-medium">Veredito</span>
                    <span className="text-[10px] line-clamp-1 ml-1 font-medium" style={{ color: cor }}>
                      {rotulo}
                    </span>
                  </div>
                );
              })()
            ) : (
              card.cardType === "publish" && resumo && resumo.total > 0 ? (
                // O card do Paulo mostra o ESTADO do dia, derivado dos posts,
                // e nao o texto gravado na geracao ("2 posts prontos"), que nao
                // mudava quando o post era agendado, publicado ou falhava.
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: resumo.cor }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: resumo.cor }} />
                    {resumo.titulo}
                  </span>
                  <span className="text-[10px] line-clamp-1" style={{ color: "var(--text-primary)" }}>{resumo.linha}</span>
                  <span className="text-[10px] line-clamp-1" style={{ color: resumo.dominante === "rascunho" || resumo.dominante === "falhou" ? "var(--accent-orange)" : "var(--text-muted)" }}>{resumo.rodape}</span>
                </div>
              ) : (
              <p className="line-clamp-2 leading-relaxed text-[10px]" style={{ color: "var(--text-primary)" }}>
                {card.content ?? "..."}
              </p>
              )
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            {card.status === "approved" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
            {card.status === "rejected" && <X className="w-3 h-3 text-red-400" />}
            {card.cardType === "publish" && card.scheduledDate && (
              <span className="text-[9px] flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}>
                <AlarmClock className="w-2.5 h-2.5" />
                {new Date(card.scheduledDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── SocialPostPreview ─────────────────────────────────────────────────────────

function SocialPostPreview({
  platform,
  content,
  imageUrl,
  scheduledAt,
  status = "draft",
  poster,
  conta,
}: {
  platform: string | null;
  content: string;
  imageUrl: string | null;
  scheduledAt: string | null;
  /**
   * O status do post, que decide se o horário é "Agendado" (já aprovado, na
   * fila) ou "sai ... se aprovar" (rascunho). Sem ele a prévia dizia
   * "Agendado" sobre rascunho, e o cliente leu que ia sair sozinho (29/09).
   */
  status?: string;
  /** Capa do player quando a mídia é vídeo; sem ela o player abre preto. */
  poster?: string | null;
  /**
   * A conta por onde este post sai. Sem ela o preview mostrava "Seu perfil"
   * genérico, inclusive quando o post ia para a PÁGINA da empresa: um preview
   * que mostra a conta errada ensina a pessoa a não confiar no preview.
   */
  conta?: { platform: string; displayName: string | null; accountType: string; avatarUrl?: string | null } | null;
}) {
  const isLinkedIn = platform === "linkedin";
  const isTwitter = platform === "twitter";
  const isYouTube = platform === "youtube";
  const isInstagram = platform === "instagram";
  const isFacebook = platform === "facebook";
  const marca = isLinkedIn
    ? { cor: "#0A66C2", nome: "LinkedIn" }
    : isTwitter
      ? { cor: "#1D9BF0", nome: "X (Twitter)" }
      : isYouTube
        ? { cor: "#FF0000", nome: "YouTube" }
        : isInstagram
          ? { cor: "#E4405F", nome: "Instagram" }
          : isFacebook
            ? { cor: "#1877F2", nome: "Facebook" }
            : { cor: "var(--accent-orange)", nome: platform ?? "Plataforma" };

  // Extract links from content
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const links = content.match(urlRegex) ?? [];

  // Character count
  const maxChars = isTwitter ? 280 : 3000;
  const charCount = content.length;
  const overLimit = charCount > maxChars;

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
    >
      {/* Platform header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between text-xs"
        style={{
          background: isLinkedIn ? "rgba(10,102,194,0.15)" : isTwitter ? "rgba(29,155,240,0.15)" : isYouTube ? "rgba(255,0,0,0.12)" : isInstagram ? "rgba(228,64,95,0.12)" : isFacebook ? "rgba(24,119,242,0.12)" : "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-2">
          {isYouTube && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          )}
          {isInstagram && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16.32a4.32 4.32 0 1 1 0-8.64 4.32 4.32 0 0 1 0 8.64zm6.408-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
          )}
          {isFacebook && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          )}
          {isLinkedIn && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          )}
          {isTwitter && (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1D9BF0">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          )}
          <span className="font-semibold" style={{ color: marca.cor === "var(--accent-orange)" ? "var(--text-primary)" : marca.cor }}>
            {marca.nome}
          </span>
        </div>
        {scheduledAt && rotuloDoHorario({ status, scheduledAt }, true) && (
          <span style={{ color: "var(--text-muted)" }}>
            {rotuloDoHorario({ status, scheduledAt }, true)}
          </span>
        )}
      </div>

      {/* Post body */}
      <div className="p-4 space-y-3">
        {/* Quem publica: a conta de verdade quando ela é conhecida. */}
        <div className="flex items-center gap-3">
          {conta ? (
            <FotoDaConta conta={conta} tamanho={40} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: marca.cor === "var(--accent-orange)" ? "var(--bg-elevated)" : marca.cor }}>
              P
            </div>
          )}
          <div>
            <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {conta?.displayName ?? (isYouTube ? "Seu canal" : "Seu perfil")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {conta
                ? conta.accountType === "organization"
                  ? "Página"
                  : "Perfil"
                : isLinkedIn
                  ? "Profissional · 1ª"
                  : isTwitter || isInstagram
                    ? "@suaconta"
                    : ""}
            </p>
          </div>
        </div>

        {/* Post text */}
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-primary)", maxHeight: 480, overflowY: "auto" }}
        >
          {content}
        </div>

        {/* As hashtags em destaque, extraídas do próprio texto: o cliente
            enxerga de relance com o que o post vai marcar. */}
        {(() => {
          const tags = [...new Set(content.match(/#[\p{L}\p{N}_]+/gu) ?? [])].slice(0, 12);
          if (!tags.length) return null;
          return (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--bg-elevated)", color: marca.cor === "var(--accent-orange)" ? "var(--text-muted)" : marca.cor }}
                >
                  {t}
                </span>
              ))}
            </div>
          );
        })()}

        {/* Media preview (image or video) */}
        {imageUrl && imageUrl.length > 50 && (() => {
          const isVid = imageUrl.startsWith("data:video/") ||
            (!imageUrl.startsWith("data:") && (imageUrl.toLowerCase().includes(".mp4") || imageUrl.toLowerCase().includes(".webm")));
          if (isVid) {
            return (
              <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ background: "#000", border: "1px solid var(--border)" }}>
                <video
                  key={imageUrl}
                  src={imageUrl}
                  poster={poster ?? undefined}
                  preload="metadata"
                  controls
                  muted
                  playsInline
                  style={{ maxHeight: 300, maxWidth: "100%", width: "auto", display: "block", margin: "0 auto" }}
                />
              </div>
            );
          }
          // CARROSSEL: as lâminas vêm coladas com "|" num campo só, e o
          // `<img>` com a string inteira quebrava (e o onError escondia o
          // defeito). Cada lâmina no seu quadro, lado a lado.
          const laminas = imageUrl.split("|").filter(Boolean);
          if (laminas.length > 1) {
            return (
              <div className="flex gap-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {laminas.map((src, i) => (
                  <img key={i} src={src} alt={`Lâmina ${i + 1}`} className="flex-1 min-w-0 object-cover" style={{ maxHeight: 200 }} />
                ))}
              </div>
            );
          }
          return (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <img
                src={imageUrl}
                alt="Mídia do post"
                className="w-full object-cover"
                style={{ maxHeight: 260 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          );
        })()}

        {/* No media notice */}
        {!imageUrl && (
          <div className="rounded-lg p-3 flex items-center gap-2 text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Sem mídia: este post será publicado apenas com texto.</span>
          </div>
        )}

        {/* Links detected */}
        {links.length > 0 && (
          <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Links no post</p>
            {links.map((link, i) => (
              <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:underline truncate"
                style={{ color: isLinkedIn ? "#0A66C2" : isTwitter ? "#1D9BF0" : "var(--accent)" }}>
                <Globe className="w-3 h-3 shrink-0" />
                {link.slice(0, 60)}{link.length > 60 ? "..." : ""}
              </a>
            ))}
          </div>
        )}

        {/* Char count */}
        <div className="flex justify-end">
          <span className={`text-xs ${overLimit ? "text-red-400" : ""}`} style={overLimit ? {} : { color: "var(--text-muted)" }}>
            {charCount}/{maxChars} caracteres{overLimit ? ", EXCEDE O LIMITE" : ""}
          </span>
        </div>

        {/* Platform engagement mock */}
        <div className="flex items-center gap-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
          {isLinkedIn && (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>👍 Curtir</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>💬 Comentar</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>🔁 Compartilhar</span>
            </>
          )}
          {isTwitter && (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>🔁 Repostar</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>❤️ Curtir</span>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>📊 Estatísticas</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PollPreview ────────────────────────────────────────────────────────────────

function PollPreview({
  content,
  metadata,
  platform,
}: {
  content: string;
  metadata?: Record<string, unknown> | null;
  platform?: string;
}) {
  const isLI = platform === "linkedin";

  // Prefer structured metadata, fallback to parsing content
  let question = (metadata?.question as string) ?? "";
  let options: string[] = (metadata?.options as string[]) ?? [];
  let intro = (metadata?.intro as string) ?? "";
  const duration = (metadata?.duration as string) ?? "THREE_DAYS";

  if (!question) {
    const lines = content.split("\n").map((l) => l.trim());
    const getLine = (prefix: string) =>
      lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";
    question = getLine("PERGUNTA:");
    intro = getLine("TEXTO_INTRO:") || getLine("TWEET:");
    options = ["OPCAO_1:", "OPCAO_2:", "OPCAO_3:", "OPCAO_4:"]
      .map((p) => getLine(p))
      .filter(Boolean);
  }

  const durationLabel: Record<string, string> = {
    ONE_DAY: "1 dia",
    THREE_DAYS: "3 dias",
    ONE_WEEK: "1 semana",
    TWO_WEEKS: "2 semanas",
  };

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: isLI ? "rgba(10,102,194,0.3)" : "rgba(29,155,240,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: isLI ? "rgba(10,102,194,0.1)" : "rgba(29,155,240,0.1)", borderColor: "var(--border)" }}>
        <BarChart2 className="w-3.5 h-3.5" style={{ color: isLI ? "#0A66C2" : "#1D9BF0" }} />
        <span className="font-semibold" style={{ color: isLI ? "#0A66C2" : "#1D9BF0" }}>
          Enquete {isLI ? "LinkedIn" : "X"} · dura {durationLabel[duration] ?? duration}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {intro && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{intro}</p>
        )}
        {question ? (
          <>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{question}</p>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="rounded-lg px-3 py-2 text-sm border flex items-center gap-2"
                  style={{ borderColor: isLI ? "rgba(10,102,194,0.4)" : "rgba(29,155,240,0.4)", color: "var(--text-primary)" }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: isLI ? "rgba(10,102,194,0.15)" : "rgba(29,155,240,0.15)", color: isLI ? "#0A66C2" : "#1D9BF0" }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </div>
              ))}
            </div>
          </>
        ) : (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-primary)", fontFamily: "inherit" }}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── ThreadPreview ──────────────────────────────────────────────────────────────

function ThreadPreview({ content }: { content: string }) {
  // Parse tweets from numbered format
  const tweets = content
    .split(/\n(?=\d+[\/\.\)]\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = tweets.length >= 2
    ? tweets.map((t) => t.replace(/^\d+[\/\.\)]\s*/, "").trim())
    : content.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(29,155,240,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: "rgba(29,155,240,0.1)", borderColor: "var(--border)" }}>
        <List className="w-3.5 h-3.5 text-[#1D9BF0]" />
        <span className="font-semibold text-[#1D9BF0]">
          Thread X · {parsed.length} tweets
        </span>
      </div>
      <div className="p-3 space-y-0 max-h-80 overflow-y-auto">
        {parsed.map((tweet, i) => (
          <div key={i} className="flex gap-2 pb-3">
            {/* Thread line */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: "#1D9BF0", fontSize: 10 }}>P</div>
              {i < parsed.length - 1 && (
                <div className="w-0.5 flex-1 mt-1" style={{ background: "rgba(29,155,240,0.3)", minHeight: 12 }} />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Seu perfil</span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>@suaconta</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{i + 1}/{parsed.length}</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {tweet.slice(0, 280)}
              </p>
              {tweet.length > 280 && (
                <span className="text-[10px] text-red-400">Excede 280 chars, será truncado</span>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>🔁 💬 ❤️</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ArticlePreview ─────────────────────────────────────────────────────────────

function ArticlePreview({ content }: { content: string }) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "rgba(10,102,194,0.3)", background: "var(--bg-primary)" }}>
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs border-b"
        style={{ background: "rgba(10,102,194,0.1)", borderColor: "var(--border)" }}>
        <BookOpen className="w-3.5 h-3.5 text-[#0A66C2]" />
        <span className="font-semibold text-[#0A66C2]">Artigo LinkedIn</span>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>{content.length} chars</span>
      </div>
      <div className="p-4 max-h-80 overflow-y-auto">
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
          {content}
        </p>
      </div>
    </div>
  );
}

// ── CardDetailModal (Trello-style) ────────────────────────────────────────────

interface CardDetailModalProps {
  card: CampaignCard;
  agentRow: typeof AGENT_ROWS[0];
  projectId: string;
  socialAccounts: SocialAccount[];
  onClose: () => void;
  onCardUpdate: (card: CampaignCard) => void;
  onWeekRefresh?: () => void;
  onRestartWithTopic?: (topic: string) => void;
  /**
   * Os horários das peças da semana (id e instante). O card do Paulo usa para
   * sugerir o próximo horário LIVRE quando a agenda do dia venceu, em vez de
   * empurrar a peça para cima da peça de amanhã (29/09).
   */
  horariosDaSemana?: Array<{ id: string; scheduledAt: string }>;
}

function CardDetailModal({ card, agentRow, projectId, socialAccounts, onClose, onCardUpdate, onWeekRefresh, onRestartWithTopic, horariosDaSemana = [] }: CardDetailModalProps) {
  const [localCard, setLocalCard] = useState(card);
  const [chatMsg, setChatMsg] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  /**
   * A REVISÃO QUE ACABOU DE SER PEDIDA, antes de o servidor responder.
   *
   * O servidor grava a marca no card (lib/pipeline/revisao-do-card.ts), mas
   * quem acabou de apertar enviar não vai reler o card no meio da própria
   * chamada: a resposta só volta no fim. Este estado é o mesmo selo, mostrado
   * na hora, e sai quando a resposta chega. O calendário continua lendo do
   * banco, que é o que faz a outra aba ver a mesma coisa.
   */
  const [revisaoLocal, setRevisaoLocal] = useState<RevisaoEmAndamento | null>(null);
  /** Qual post está sendo levado para outra rede agora (o id do original). */
  const [levando, setLevando] = useState<string | null>(null);
  const [postScheduledAt, setPostScheduledAt] = useState<string | null>(null);
  const [postPlatform, setPostPlatform] = useState<string | null>(null);
  const [postContent, setPostContent] = useState<string | null>(null);
  const [postImageUrl, setPostImageUrl] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<string | null>(null);
  // All platform posts for the same day (linkedin + twitter)
  /**
   * O re-corte em andamento, com poll. Sem isto o Vitor dizia "estou
   * refazendo" e a tela ficava parada, que foi lido como travado (01/09).
   */
  const [refazendoCorte, setRefazendoCorte] = useState(false);
  const [versaoDoCorte, setVersaoDoCorte] = useState(0);
  const vigiarRecorte = useCallback(() => {
    const meta = card.metadata as { videoJobId?: string; trechoIndice?: number } | null;
    if (!meta?.videoJobId || typeof meta.trechoIndice !== "number") return;
    setRefazendoCorte(true);
    let vivo = true;
    const olhar = async () => {
      try {
        const r = await fetch(`/api/videos/${meta.videoJobId}/corte-status?trecho=${meta.trechoIndice}`);
        const d = await r.json();
        if (!vivo) return;
        if (!d.refazendo) {
          setRefazendoCorte(false);
          setVersaoDoCorte((v) => v + 1);
          toast.success("Corte refeito. O vídeo do card já é o novo.");
          return;
        }
      } catch {}
      if (vivo) setTimeout(olhar, 8000);
    };
    setTimeout(olhar, 8000);
    return () => { vivo = false; };
  }, [card.metadata]);

  // O TEXTO EDITÁVEL NO CARD DO PAULO (28/09). Pedido do Bruno: "no card,
  // os textos devem ser editáveis, se o usuário quiser mudar algo no texto
  // antes de aprovar". A edição existia só nos cards dos redatores, e é no
  // Paulo que se aprova: quem queria trocar uma palavra tinha de pedir à IA
  // e pagar para refazer a peça inteira.
  const [editandoPost, setEditandoPost] = useState<{ id: string; texto: string } | null>(null);
  const [salvandoPost, setSalvandoPost] = useState(false);
  async function salvarTextoDoPost() {
    if (!editandoPost) return;
    setSalvandoPost(true);
    try {
      const res = await fetch(`/api/posts/${editandoPost.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editandoPost.texto }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "falha ao salvar");
      setDayPosts((lista) => lista.map((x) => (x.id === editandoPost.id ? { ...x, content: editandoPost.texto } : x)));
      setEditandoPost(null);
      toast.success("Texto salvo. É esta versão que vai ao ar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o texto");
    } finally {
      setSalvandoPost(false);
    }
  }
  const [dayPosts, setDayPosts] = useState<Array<{
    id: string;
    platform: string;
    content: string;
    imageUrl: string | null;
    mediaType: string | null;
    metadata: Record<string, unknown> | null;
    scheduledAt: string | null;
    status: string;
    socialAccountId: string | null;
  }>>([]);
  const [loadingPost, setLoadingPost] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [newScheduleTime, setNewScheduleTime] = useState("09:00");
  const [rescheduling, setRescheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(localCard.content ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  /** Qual peça está sendo refeita agora, para a linha dela dizer isso. */
  const [refazendo, setRefazendo] = useState<string | null>(null);
  /** O protocolo do chamado recém-aberto, antes de o banco voltar na próxima leitura. */
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null);
  const [abrindoChamado] = useState(false); // a janela de ajuda cuida do envio (02/10)
  const [publicandoComoImagem, setPublicandoComoImagem] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0); // for carousel navigation
  const [publishResult, setPublishResult] = useState<{
    platform: string;
    accountName: string;
    publishedAt: string;
    url: string | null;
  }[] | null>(null);

  /**
   * A HISTÓRIA DA PEÇA, do parecer da Vera ao desfecho na rede.
   *
   * O modal abre pelo calendário, pelo kanban e pela ficha do agente, e só a
   * ficha carregava o parecer. Aqui ele é buscado pelo próprio card, e vem
   * junto o mp4 do dia quando o card ainda guarda o quadro 9:16 (o trabalho
   * de vídeo atualizava os posts e não o card, até 19/09).
   */
  const [parecer, setParecer] = useState<{ etapas: EtapaDoParecer[]; videoUrl: string | null } | null>(null);
  useEffect(() => {
    if (card.cardType === "preview") return;
    let vivo = true;
    fetch(`/api/campaign-cards/${card.id}/parecer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && Array.isArray(d.etapas)) setParecer({ etapas: d.etapas, videoUrl: d.videoUrl ?? null });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [card.id, card.cardType]);

  // O selo vale para quem pediu agora (estado local) e para quem abriu o card
  // no meio de um pedido feito de outra aba (a marca gravada no card).
  const revisaoAberta = revisaoLocal ?? lerRevisao(localCard.metadata);
  const isMedia = localCard.cardType === "media";
  const isInfographic = isMedia && localCard.mediaType === "infographic";
  // O mp4 no lugar do quadro, com o quadro de capa: "imagem comprida" nunca mais.
  const midiaDaPeca = isMedia && parecer?.videoUrl ? parecer.videoUrl : localCard.mediaUrl;
  const capaDaPeca =
    (localCard.metadata as { thumb?: string | null } | null)?.thumb ??
    (isMedia && parecer?.videoUrl && localCard.mediaUrl !== parecer.videoUrl ? localCard.mediaUrl : null);
  const isPublish = localCard.cardType === "publish";
  // O card do vídeo (corte ou completo) com post ligado também aprova e agenda (30/09).
  const acoesNoCardDoVideo = (localCard.cardType === "video_clip" || localCard.cardType === "video_completo") && Boolean(localCard.postId);
  const isPreview = localCard.cardType === "preview";
  const hasError = localCard.content?.startsWith("AVISO:");

  /**
   * De onde vêm os posts do dia para este card.
   *
   * Card com post ligado (Lucas, Tiago, Vitor, Paulo da campanha de texto)
   * busca pelos irmãos do próprio post. Vera e Paulo dos dias de VÍDEO nascem
   * sem post ligado (`sincronizarQuadroDoVideo` cria os dois só com a data), e
   * até 02/09 o modal só sabia buscar por `postId`: o Paulo abria com "Posts
   * não encontrados, execute uma nova campanha" e nenhum botão, e a Vera com
   * um texto mandando abrir o Paulo. Os dois cards travados foi o veredito do
   * Bruno. Para eles a busca é pela DATA do card, que a rota já aceitava.
   */
  // Card do dia (Paulo, Vera) busca pela campanha e pelo dia dela, que não
  // mudam quando o horário é remarcado (30/09); a data fica de reserva.
  const consultaDoDia = localCard.postId
    ? `postId=${localCard.postId}`
    : (isPublish || isPreview) && localCard.runId && localCard.dayOfWeek
      ? `runId=${localCard.runId}&dayOfWeek=${localCard.dayOfWeek}`
      : (isPublish || isPreview) && localCard.scheduledDate
        ? `scheduledDate=${encodeURIComponent(localCard.scheduledDate)}`
        : null;

  useEffect(() => {
    // QUALQUER card com post ligado carrega o post, e não só o do Paulo.
    //
    // O `isPublish` aqui era o defeito que o Bruno chamou de "não publica, não
    // revisa, não avança" em 02/09: o card do Vitor tem `postId` correto no
    // banco, mas a busca só rodava para o card de publicação, então `dayPosts`
    // ficava vazio, o `find` por `postId` não achava nada e o bloco inteiro de
    // prévia e publicação devolvia null. O corte abria com player e chat, e sem
    // nenhum jeito de aprovar ou publicar: o fim da linha era um beco.
    if (localCard.postId) {
      // Fetch the primary post (for scheduling info)
      fetch(`/api/posts/${localCard.postId}`)
        .then((r) => r.json())
        .then((data) => {
          setPostScheduledAt(data.post?.scheduledAt ?? null);
          setPostPlatform(data.post?.platform ?? null);
          setPostContent(data.post?.content ?? null);
          setPostImageUrl(data.post?.imageUrl ?? null);
          setPostStatus(data.post?.status ?? null);
        })
        .catch(() => {});
    }

    if (consultaDoDia) {
      setLoadingPost(true);
      // Fetch all posts for the same day (linkedin + twitter)
      fetch(`/api/posts/by-day?projectId=${projectId}&${consultaDoDia}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.posts)) {
            setDayPosts(data.posts);
            // Sem post ligado, o horário do dia é o do primeiro post que existe.
            if (!localCard.postId) {
              const primeiro = data.posts.find((p: { scheduledAt: string | null }) => p.scheduledAt);
              setPostScheduledAt(primeiro?.scheduledAt ?? null);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPost(false));
    }
  }, [localCard.postId, consultaDoDia, projectId]);

  const chatDisparaVigia = (respostaDoAgente: string) => {
    if (/refazendo o corte/i.test(respostaDoAgente)) vigiarRecorte();
  };

  async function sendChat() {
    if (!chatMsg.trim()) return;
    setChatLoading(true);
    setRevisaoLocal({
      pedido: chatMsg.trim().slice(0, 180),
      porNome: null,
      porImagem: null,
      agenteId: localCard.agentId,
      agenteNome: localCard.agentName,
      desde: new Date().toISOString(),
    });
    try {
      const isCarousel = localCard.mediaUrl?.includes("|");
      const res = await fetch(`/api/campaign-cards/${localCard.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatMsg,
          ...(isCarousel ? { slideIndex: currentSlide } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const updated: CampaignCard = {
        ...localCard,
        content: data.updatedContent ?? localCard.content,
        chatHistory: data.chatHistory,
        // For media cards, update mediaUrl if the API regenerated the image
        ...(data.updatedMediaUrl !== undefined ? { mediaUrl: data.updatedMediaUrl } : {}),
        // O card de vídeo ajustado pelo chat (30/09) volta com o estado da
        // edição: "o squad está fazendo" aparece na hora.
        ...(data.updatedMetadata !== undefined ? { metadata: data.updatedMetadata } : {}),
      };
      setLocalCard(updated);
      setEditedContent(updated.content ?? "");
      onCardUpdate(updated);
      setChatMsg("");
      if (data.refazendoCorte) vigiarRecorte();

      if (data.aviso) {
        // A resposta do Vitor pode ser uma pergunta ou um pedido de "sim":
        // "Ajuste aplicado!" ali seria mentira.
        toast.success(data.aviso);
      } else if (data.updatedMediaUrl) {
        toast.success("Imagem regenerada com sucesso!");
      } else if (data.mediaError) {
        toast.error(`Prompt atualizado, mas imagem falhou: ${data.mediaError.slice(0, 80)}`);
      } else {
        toast.success("Ajuste aplicado!");
      }
    } catch {
      toast.error("Erro ao ajustar.");
    } finally {
      setChatLoading(false);
      setRevisaoLocal(null);
      // O card que FEZ o trabalho pode ser outro (o pedido de imagem no card
      // do Paulo é atendido no da Diana), e é o calendário que mostra os dois.
      onWeekRefresh?.();
    }
  }

  /**
   * LEVA UM POST QUE JÁ SAIU PARA OUTRA REDE.
   *
   * Pedido do Bruno em 21/09. A peça nasce como RASCUNHO na rede nova, com o
   * texto adaptado pelo mesmo caminho da campanha: quem aprovou o original
   * aprova este também, e a plataforma não decide sozinha onde a marca fala.
   * O porquê inteiro está em lib/pipeline/levar-para-outra-rede.ts.
   */
  async function levarParaRede(postId: string, accountId: string, rotulo: string) {
    setLevando(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/levar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Não consegui levar o post.");
        return;
      }
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(`Post adaptado para ${rotulo}, em rascunho. Confira antes de publicar.`);
    } catch {
      toast.error("Não consegui levar o post.");
    } finally {
      setLevando(null);
    }
  }

  async function saveEdit() {
    if (!editedContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/campaign-cards/${localCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editedContent }),
      });
      if (!res.ok) throw new Error();
      const updated = { ...localCard, content: editedContent };
      setLocalCard(updated);
      onCardUpdate(updated);
      setEditing(false);
      toast.success("Conteúdo salvo!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function refreshDayPosts() {
    if (!consultaDoDia) return;
    const r = await fetch(`/api/posts/by-day?projectId=${projectId}&${consultaDoDia}`);
    const data = await r.json();
    if (Array.isArray(data.posts)) setDayPosts(data.posts);
    if (!localCard.postId) return;
    const r2 = await fetch(`/api/posts/${localCard.postId}`);
    const d2 = await r2.json();
    setPostScheduledAt(d2.post?.scheduledAt ?? null);
  }

  function accountFor(platform: string, socialAccountId?: string | null) {
    const candidates = socialAccounts.filter((a) => a.platform === platform);
    if (candidates.length === 0) return undefined;
    if (socialAccountId) {
      const exact = candidates.find((a) => a.id === socialAccountId);
      if (exact) return exact;
    }
    const personal = candidates.find((a) => a.accountType === "personal");
    return personal ?? candidates[0];
  }

  /**
   * ## O Paulo por REDE, e não por LinkedIn e X
   *
   * O card nasceu quando só havia duas redes, com grades fixas "LinkedIn, X,
   * Ambas" para agendar e para publicar. Quando entraram YouTube, Instagram e
   * Facebook (esteira do vídeo), os vídeos ganharam uma lista própria só com
   * "publicar agora", e o resto ficou como estava: três blocos com regras
   * diferentes, e o cliente sem saber o que já saiu, o que está na fila e o
   * que ainda é rascunho. Foi o "card do Paulo confuso" do Bruno em 04/09.
   *
   * Agora é UMA lista: cada post do dia é uma linha com a rede, o que é, o
   * estado e uma marcação. Embaixo, duas ações sobre o que está marcado:
   * publicar agora, ou deixar agendado no horário do dia. O cron publica o
   * agendado pela conta gravada no post, por isso "deixar agendado" grava a
   * conta junto.
   */
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  /**
   * REPROVADO NÃO SE PUBLICA. Antes de 21/09 isso nunca aparecia porque
   * reprovar derrubava o dia inteiro e a lista sumia da tela; agora que a
   * reprovação alcança uma peça só, o post reprovado continua na lista ao lado
   * dos vivos, e deixá-lo marcável seria oferecer "Publicar agora" para
   * exatamente o que o cliente acabou de recusar.
   */
  const publicavel = (p: { status: string }) => !ESTADOS_MORTOS.has(p.status);
  const chaveDosPosts = dayPosts.map((p) => `${p.id}:${p.status}`).join(",");
  useEffect(() => {
    // Ao carregar o dia, tudo o que ainda não saiu vem marcado: o caso comum
    // é publicar o dia inteiro, e desmarcar é um clique.
    setEscolhidos(new Set(dayPosts.filter((p) => publicavel(p) && accountFor(p.platform, p.socialAccountId)).map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosPosts]);

  const NOME_DA_REDE: Record<string, string> = { linkedin: "LinkedIn", twitter: "X", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
  const nomeDaRede = (plat: string) => NOME_DA_REDE[plat] ?? plat;
  const oQueE = (p: { platform: string; mediaType: string | null; content: string; metadata: Record<string, unknown> | null }) => {
    const mv = p.metadata as { trechoIndice?: number; gravacaoCompleta?: boolean } | null;
    if (p.mediaType === "video") return mv?.gravacaoCompleta ? "Gravação completa" : typeof mv?.trechoIndice === "number" ? `Corte ${mv.trechoIndice + 1}` : "Vídeo";
    const rotulo: Record<string, string> = { poll: "Enquete", thread: "Thread", article: "Artigo", image: "Imagem com legenda", carousel: "Carrossel", infographic: "Infográfico", text: "Post de texto" };
    return rotulo[p.mediaType ?? "text"] ?? "Post";
  };
  const postsDoDia = [...dayPosts].sort((a, b) => ORDEM_DA_REDE.indexOf(a.platform) - ORDEM_DA_REDE.indexOf(b.platform));
  const marcados = postsDoDia.filter((p) => escolhidos.has(p.id));
  /**
   * O HORÁRIO DO DIA TEM UMA FONTE SÓ: o `scheduledAt` do post (29/09).
   *
   * O card do Paulo mostrava 11:00 no cabeçalho, 09:00 na caixa e "o horário
   * já passou" no rascunho. O 11:00 era o `scheduledDate` do próprio card de
   * publicação, que a esteira grava duas horas depois do post (o post às 09:00,
   * a Vera às 10:00, o Paulo às 11:00) para os cards caírem em ordem no quadro.
   * Hora de card é ordem da esteira, não hora de publicação.
   *
   * `ocupados` são os horários das OUTRAS peças da semana: é com eles que a
   * agenda vencida ganha uma sugestão de horário livre.
   */
  const idsDoDia = new Set(dayPosts.map((p) => p.id));
  const ocupados = horariosDaSemana.filter((h) => !idsDoDia.has(h.id)).map((h) => h.scheduledAt);
  const naFilaDoDia = postsDoDia.filter((p) => p.status === "scheduled" || p.status === "publishing");
  const rascunhosDoDia = postsDoDia.filter((p) => publicavel(p) && p.status !== "scheduled" && p.status !== "publishing");
  const horaDoCabecalho = naFilaDoDia[0]?.scheduledAt ?? postScheduledAt ?? localCard.scheduledDate;
  // Onde o dia sai se o cliente aprovar agora: o planejado, ou a sugestão
  // quando o planejado já passou. Nulo quando não há rascunho esperando.
  const saidaSeAprovar = rascunhosDoDia.length > 0 && naFilaDoDia.length === 0 ? horarioParaFila(postScheduledAt, ocupados) : null;
  // A hora que a prévia mostra: a da fila, para o que já foi aprovado; para o
  // rascunho, a mesma que a caixa do Paulo propõe (a planejada, ou a
  // sugestão quando ela venceu). "sai 29/09 09:00 se aprovar" às 16h seria
  // outra promessa falsa.
  const horaDaPrevia = (p: { status: string; scheduledAt: string | null }): string | null => {
    const planejada = p.scheduledAt ?? postScheduledAt;
    if (p.status === "scheduled" || p.status === "publishing" || p.status === "published") return planejada;
    return horarioParaFila(planejada, ocupados)?.iso ?? planejada;
  };
  // AGENDA VENCIDA: a caixa de horário já abre com a sugestão preenchida,
  // uma vez por abertura do card. Dizer só "o horário passou" deixava o
  // cliente sem saber para quando mudar.
  const sugestaoAberta = useRef(false);
  useEffect(() => {
    if (!isPublish || sugestaoAberta.current || !saidaSeAprovar?.andou) return;
    sugestaoAberta.current = true;
    const campos = paraCampos(new Date(saidaSeAprovar.iso));
    setNewScheduleDate(campos.data);
    setNewScheduleTime(campos.hora);
    setRescheduleOpen(true);
  }, [isPublish, saidaSeAprovar?.andou, saidaSeAprovar?.iso]);

  /**
   * O alcance da reprovação vive em `lib/content/reprovacao.ts`, com prova.
   * O rótulo do botão e a ação saem da MESMA conta, que é o que faltava
   * quando a tela dizia uma coisa e o clique fazia outra.
   */
  const alcanceReprovacao = alcanceDaReprovacao(postsDoDia, escolhidos);

  /** O card fecha (aprovado) quando nada do dia ficou por decidir. */
  /**
   * O card acompanha os posts dele.
   *
   * Duas correções de 18/09, das duas metades da queixa "deixei agendado e o
   * card continua dizendo aguardando aprovação":
   *
   * 1. **grava no banco.** Antes isto só mexia no estado da tela, e um F5
   *    trazia de volta o "Aguardando aprovação" com os posts agendados;
   * 2. **basta UM post resolvido.** A regra antiga exigia que TODOS os posts
   *    do dia estivessem agendados, publicados ou arquivados. Com quatro redes
   *    e uma delas sem conta conectada, o dia nunca fechava.
   */
  async function fecharSeTerminou() {
    if (!consultaDoDia) return;
    const r = await fetch(`/api/posts/by-day?projectId=${projectId}&${consultaDoDia}`);
    const data = await r.json();
    const posts: Array<{ status: string }> = Array.isArray(data.posts) ? data.posts : [];
    const resolvidos = posts.filter((p) => ["published", "scheduled"].includes(p.status)).length;
    if (resolvidos === 0 || localCard.status === "approved") return;

    const updated = { ...localCard, status: "approved" as const };
    setLocalCard(updated);
    onCardUpdate(updated);
    await fetch(`/api/campaign-cards/${localCard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    }).catch(() => {
      // A tela já mostra aprovado; o banco tenta de novo na próxima ação.
    });
    onWeekRefresh?.();
  }

  /**
   * Tirar da fila: o post volta a rascunho e não sai mais sozinho.
   *
   * Pedido do Bruno em 18/09: "deve ser fácil cancelar o agendamento no card e
   * na tela posts". Antes, o único caminho aqui era arquivar, que some com a
   * peça: quem só queria adiar perdia o trabalho.
   */
  async function cancelarAgendamento(p: { id: string; platform: string }) {
    setApproving(true);
    try {
      const res = await fetch(`/api/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) throw new Error();
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(`${nomeDaRede(p.platform)} saiu da fila e voltou para rascunho.`);
    } catch {
      toast.error("Não consegui cancelar o agendamento. Tente de novo.");
    } finally {
      setApproving(false);
    }
  }

  /**
   * A janela do TikTok, aberta antes de publicar ou agendar quando há post do
   * TikTok entre os marcados. A promessa resolve com true depois que as
   * escolhas foram gravadas, e false se a pessoa cancelou; aí a ação inteira
   * para, porque seguir só com as outras redes sem avisar seria decidir por
   * ela o que fazer com o vídeo do TikTok.
   */
  const [janelaTikTok, setJanelaTikTok] = useState<null | {
    posts: PostParaTikTok[];
    acao: "publicar" | "agendar";
    resolver: (ok: boolean) => void;
  }>(null);
  function garantirEscolhasDoTikTok(lista: typeof marcados, acao: "publicar" | "agendar"): Promise<boolean> {
    const doTikTok = lista.filter((p) => p.platform === "tiktok");
    if (doTikTok.length === 0) return Promise.resolve(true);
    return new Promise((resolver) =>
      setJanelaTikTok({
        posts: doTikTok.map((p) => ({ id: p.id, content: p.content, imageUrl: p.imageUrl })),
        acao,
        resolver,
      })
    );
  }

  async function publicarAgoraMarcados() {
    if (marcados.length === 0) return;
    if (!(await garantirEscolhasDoTikTok(marcados, "publicar"))) return;
    setApproving(true);
    const results: { platform: string; accountName: string; publishedAt: string; url: string | null }[] = [];
    const falhas: string[] = [];
    try {
      for (const p of marcados) {
        const acc = accountFor(p.platform, p.socialAccountId);
        if (!acc) { falhas.push(`${nomeDaRede(p.platform)}: conta não conectada`); continue; }
        try {
          const res = await fetch(`/api/posts/${p.id}/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountId: acc.id }),
          });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Erro ao publicar");
          // O que deu certo mas o cliente precisa saber: o YouTube mostra SD
          // nos primeiros minutos (o Bruno achou que o arquivo tinha perdido
          // qualidade, 02/09).
          if (typeof d.aviso === "string" && d.aviso) toast(d.aviso, { duration: 12_000, icon: "ℹ️" });
          results.push({ platform: p.platform, accountName: acc.displayName ?? nomeDaRede(p.platform), publishedAt: new Date().toISOString(), url: d.url ?? null });
        } catch (err) {
          falhas.push(`${nomeDaRede(p.platform)}: ${err instanceof Error ? err.message : "erro"}`);
        }
      }
      await refreshDayPosts();
      await fecharSeTerminou();
      for (const f of falhas) toast.error(f, { duration: 8000 });
      if (results.length > 0) setPublishResult(results);
    } finally {
      setApproving(false);
    }
  }

  async function deixarAgendadoMarcados() {
    if (marcados.length === 0) return;
    if (!(await garantirEscolhasDoTikTok(marcados, "agendar"))) return;
    setApproving(true);
    let agendados = 0;
    try {
      for (const p of marcados) {
        const acc = accountFor(p.platform, p.socialAccountId);
        if (!acc) { toast.error(`${nomeDaRede(p.platform)}: conecte a rede para agendar.`); continue; }
        const fila = horarioParaFila(p.scheduledAt ?? postScheduledAt, ocupados);
        const res = await fetch(`/api/posts/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "scheduled",
            socialAccountId: acc.id,
            ...(fila && (fila.andou || !p.scheduledAt) ? { scheduledAt: fila.iso } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(`${nomeDaRede(p.platform)}: ${data.error ?? "erro ao agendar"}`, { duration: 8000 }); continue; }
        agendados += 1;
      }
      await refreshDayPosts();
      await fecharSeTerminou();
      if (agendados > 0) toast.success(agendados === 1 ? "1 post na fila: sai sozinho no horário." : `${agendados} posts na fila: saem sozinhos no horário.`);
    } finally {
      setApproving(false);
    }
  }

  /**
   * Arquivar um post do dia. Sem a caixa do navegador desde 01/10: arquivar
   * tem volta (o "Desfazer" do aviso, o "Desarquivar" da linha e a aba
   * Arquivados de Posts), e confirmação para o que se desfaz só ensina a
   * clicar em "sim" sem ler. O quadro da semana atualiza junto: antes, o post
   * arquivado continuava "falhou" no cartão até recarregar a página.
   */
  async function arquivarPost(p: { id: string; platform: string }) {
    setApproving(true);
    try {
      const res = await fetch(`/api/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error();
      await refreshDayPosts();
      onWeekRefresh?.();
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            {`Post de ${nomeDaRede(p.platform)} arquivado.`}
            <button
              type="button"
              className="rounded-md border px-2 py-0.5 text-xs font-semibold"
              onClick={() => {
                toast.dismiss(t.id);
                void desarquivarPost(p);
              }}
            >
              Desfazer
            </button>
          </span>
        ),
        { duration: 8000 }
      );
    } catch {
      toast.error("Não foi possível arquivar o post.");
    } finally {
      setApproving(false);
    }
  }

  /** A volta do arquivar: o post retorna como rascunho, para revisar e agendar de novo. */
  async function desarquivarPost(p: { id: string; platform: string }) {
    try {
      const res = await fetch(`/api/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) throw new Error();
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(`Post de ${nomeDaRede(p.platform)} de volta, como rascunho.`);
    } catch {
      toast.error("Não consegui desarquivar. Use Posts, aba Arquivados.");
    }
  }

  /**
   * REFAZER UMA PEÇA, e o custo dito ANTES do clique.
   *
   * A conta sai de `custoDeRefazerPeca`, a MESMA função que o servidor chama
   * para debitar. Tela e servidor calculando o mesmo preço em dois lugares foi
   * o defeito de 21/09 (a janela dizia 688, a cobrança era 1.092), e a regra
   * que ficou é que conta existe uma vez só.
   */
  function custoDeRefazer(p: { mediaType: string | null; imageUrl: string | null }) {
    const laminas = (p.imageUrl ?? "").split("|").filter((u) => u.trim().length > 10).length;
    return custoDeRefazerPeca({ mediaType: p.mediaType, laminas });
  }

  async function refazerUmaPeca(p: { id: string; platform: string; mediaType: string | null; imageUrl: string | null }) {
    const custo = custoDeRefazer(p);
    if (
      !window.confirm(
        `Refazer a peça de ${nomeDaRede(p.platform)}?\n\n` +
          `O redator escreve o texto de novo, do zero${(p.imageUrl ?? "").length > 10 ? ", e a arte é refeita junto" : ""}. ` +
          `A peça atual é substituída no lugar, e o dia continua como está.\n\n` +
          `Custa ${custo} créditos, porque é uma entrega nova.`
      )
    ) {
      return;
    }
    setRefazendo(p.id);
    try {
      const res = await fetch(`/api/posts/${p.id}/refazer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "não consegui refazer");
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(
        `Peça de ${nomeDaRede(p.platform)} refeita${data.arteRefeita ? " com arte nova" : ""}. ${data.custo} créditos debitados.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui refazer a peça.");
    } finally {
      setRefazendo(null);
    }
  }

  /**
   * REFAZER AS PEÇAS REPROVADAS DO DIA, com o mesmo tema.
   *
   * Uma por vez, e não em paralelo: cada uma é uma chamada de texto e, quando
   * tem arte, uma geração de imagem. Disparar quatro de uma vez multiplicaria
   * o pico de uso do gerador contra a mesma cota que já derruba vídeo.
   *
   * O que falha não derruba o resto: a peça que não voltou fica onde está e a
   * mensagem diz quantas saíram. Perder três porque a quarta falhou seria
   * cobrar por um trabalho que não aconteceu.
   */
  async function refazerDiaReprovado(reprovados: Array<{ id: string; platform: string; mediaType: string | null; imageUrl: string | null }>) {
    const custo = reprovados.reduce((s, p) => s + custoDeRefazer(p), 0);
    if (
      !window.confirm(
        `Gerar ${reprovados.length === 1 ? "a peça" : `as ${reprovados.length} peças`} de novo, com o mesmo tema?\n\n` +
          `O redator escreve do zero e a arte é refeita. As peças reprovadas são substituídas no lugar e voltam para rascunho, para você aprovar de novo.\n\n` +
          `Custa ${custo} créditos, porque é entrega nova.`
      )
    ) {
      return;
    }
    let feitas = 0;
    const falhas: string[] = [];
    for (const p of reprovados) {
      setRefazendo(p.id);
      try {
        const res = await fetch(`/api/posts/${p.id}/refazer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "não consegui refazer");
        feitas++;
      } catch (e) {
        falhas.push(`${nomeDaRede(p.platform)}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    setRefazendo(null);

    // O dia volta a esperar decisão: as peças novas são rascunho, e quem
    // reprovou o texto antigo não aprovou este.
    if (feitas > 0) {
      const updated = { ...localCard, status: "pending" };
      setLocalCard(updated);
      onCardUpdate(updated);
      await fetch(`/api/campaign-cards/${localCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", valeParaODia: true }),
      }).catch(() => {});
    }
    await refreshDayPosts();
    onWeekRefresh?.();

    if (falhas.length === 0) {
      toast.success(`${feitas === 1 ? "Peça refeita" : `${feitas} peças refeitas`} com o mesmo tema. Confira e aprove.`);
    } else {
      toast.error(`${feitas} refeita(s), ${falhas.length} não: ${falhas[0]}`);
    }
  }

  /**
   * ABRIR CHAMADO sobre uma peça que falhou.
   *
   * O cliente manda o que ele viu (a peça e o código). Quem sabe o que aquele
   * código significa é o servidor, que lê o erro real do trabalho da fila e
   * escreve o e-mail. Mandar o diagnóstico daqui seria pôr no navegador
   * exatamente a informação que não pode estar nele.
   */
  /**
   * PUBLICAR O DIA COMO IMAGEM, quando o video nao vem.
   *
   * A saida que faltava (21/09). Nao e um consolo: o quadro e uma peca de feed
   * inteira, e e assim que o dia ja sai quando o saldo acaba antes de gerar. O
   * credito de video volta e o trabalho sai da fila, senao ele acorda depois e
   * entrega um mp4 para um dia que o cliente ja publicou.
   */
  async function publicarDiaComoImagem() {
    if (!localCard.runId || !localCard.dayOfWeek) return;
    if (
      !window.confirm(
        "Publicar este dia como imagem?\n\n" +
          "A arte de abertura vira a peça: ela já tem manchete e o formato de cada rede. " +
          "O vídeo sai da fila e os créditos de vídeo voltam para você.\n\n" +
          "Isto não pode ser desfeito: para ter o vídeo depois, será preciso gerar o dia de novo."
      )
    ) {
      return;
    }
    setPublicandoComoImagem(true);
    try {
      const res = await fetch("/api/posts/dia/publicar-como-imagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: localCard.runId, dayOfWeek: localCard.dayOfWeek }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "não consegui trocar as peças");
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(
        `${data.pecas} peça(s) agora são imagem.` +
          (data.creditosDevolvidos > 0 ? ` ${data.creditosDevolvidos} créditos de vídeo devolvidos.` : "")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui publicar como imagem.");
    } finally {
      setPublicandoComoImagem(false);
    }
  }

  // O CHAMADO COM O CÓDIGO PREENCHIDO (02/10): abre a janela de ajuda já com
  // a categoria, o código e a peça, e a pessoa só conta o que viu. O
  // diagnóstico técnico continua sendo montado no servidor (lib/suporte).
  async function abrirChamado(postId: string, codigo?: string) {
    abrirJanelaDeChamado({
      categoria: "problema",
      codigo,
      postId,
      aoAbrir: (protocolo) => {
        setChamadoAberto(protocolo);
        void refreshDayPosts();
      },
    });
  }

  async function handleRestartCampaign() {
    if (!localCard.runId || !onRestartWithTopic) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/pipeline/status?runId=${localCard.runId}`);
      const data = await res.json();
      const t = data.topic as string | null | undefined;
      if (t) {
        onRestartWithTopic(t);
        onClose();
      } else {
        toast.error("Tema da campanha não encontrado.");
      }
    } catch {
      toast.error("Erro ao carregar o tema.");
    } finally {
      setApproving(false);
    }
  }

  async function handleArchiveCampaign() {
    if (!localCard.runId) return;
    if (!window.confirm("Arquivar esta campanha inteira? Ela some do quadro e vai para o arquivo (pode restaurar depois).")) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/pipeline/runs/${localCard.runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Campanha arquivada.");
      onWeekRefresh?.();
      onClose();
    } catch {
      toast.error("Não foi possível arquivar.");
    } finally {
      setApproving(false);
    }
  }

  /**
   * REPROVAR, e os dois exageros que ele tinha (relato do Bruno em 21/09:
   * "reprovei um post, a mensagem foi que eu rejeitei a campanha").
   *
   * O botão reprovava TODOS os posts do dia, sempre, ignorando a marcação que
   * as ações vizinhas ("Publicar agora", "Deixar agendado") já respeitam. Quem
   * queria derrubar a peça do Instagram derrubava também LinkedIn, X e
   * Facebook, sem ver a conta acontecendo.
   *
   * E o card virava `rejected` mesmo quando sobravam posts vivos, o que
   * acendia o aviso vermelho, escondia a lista do dia e chamava um dia de
   * CAMPANHA. Três leituras erradas a partir de um clique certo.
   *
   * Agora: reprova o que está marcado (ou o dia inteiro quando não há marcação,
   * que é o comportamento antigo, mas dito antes no rótulo do botão), e o card
   * só cai para `rejected` quando não sobra nenhum post vivo no dia.
   */
  async function handleRejectFlow() {
    if (!localCard.postId) return;
    if (!showRejectForm) {
      setShowRejectForm(true);
      return;
    }
    const alcance = alcanceReprovacao;
    if (alcance.alvos.length === 0) {
      toast.error("Nada para reprovar: os posts deste dia já foram publicados ou arquivados.");
      return;
    }
    setApproving(true);
    try {
      const ids = alcance.alvos.map((p) => p.id);
      for (const pid of ids) {
        await fetch(`/api/posts/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected" }),
        });
      }
      if (rejectReason.trim()) {
        await fetch(`/api/campaign-cards/${localCard.id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "rejection",
            reason: rejectReason,
            cardType: localCard.cardType,
          }),
        }).catch(() => {});
      }

      /**
       * O DIA SÓ É "REJEITADO" QUANDO NÃO SOBRA NADA DE PÉ NELE, e isso agora
       * é GRAVADO (21/09).
       *
       * Relato do Bruno: "rejeitei o post do dia 21, mas o card ainda fica
       * aparecendo que estava aguardando aprovação". Medido no banco: os cinco
       * posts estavam `rejected` desde 19:33 e os oito cards do dia continuavam
       * `pending`, com a última alteração às 14:05.
       *
       * A reprovação só mexia no estado da TELA. É exatamente o defeito que o
       * "aprovado" teve em 18/09 ("deixei agendado e o card continua dizendo
       * aguardando aprovação"), consertado lá e não aqui.
       *
       * `valeParaODia` porque o dia tem oito cards (pesquisa, mídia, cada
       * redator, revisão, publicação) e o calendário lê o do publicador, não o
       * que estava aberto.
       */
      if (!alcance.sobrouVivo) {
        const updated = { ...localCard, status: "rejected" };
        setLocalCard(updated);
        onCardUpdate(updated);
        await fetch(`/api/campaign-cards/${localCard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "rejected", valeParaODia: true }),
        }).catch(() => {
          // A tela já mostra reprovado; a próxima ação do dia tenta de novo.
        });
      }

      setShowRejectForm(false);
      setRejectReason("");
      setEscolhidos(new Set());
      await refreshDayPosts();
      onWeekRefresh?.();
      toast.success(avisoDaReprovacao(alcance));
    } catch {
      toast.error("Erro.");
    } finally {
      setApproving(false);
    }
  }

  async function handleCancelSchedule() {
    if (!localCard.postId) return;
    setApproving(true);
    try {
      const ids = dayPosts.length > 0 ? dayPosts.map((p) => p.id) : [localCard.postId];
      for (const pid of ids) {
        await fetch(`/api/posts/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelSchedule: true }),
        });
      }
      setPostScheduledAt(null);
      await refreshDayPosts();
      toast.success("Agendamento cancelado. Posts voltaram para rascunho.");
    } catch {
      toast.error("Erro.");
    } finally {
      setApproving(false);
    }
  }

  /**
   * REAGENDAR, e o que estava quebrado nele (achado em 21/09, relato do Bruno
   * de que "o botao reagendar nao funciona").
   *
   * Três defeitos somados, e nenhum quebrava compilação:
   *
   *   1. o campo de data nascia VAZIO, e o botão Salvar nasce desabilitado
   *      enquanto ele estiver vazio. Quem clicava em Reagendar via um painel
   *      com um botão morto, e a leitura correta disso é "não funciona".
   *      Agora o painel abre com a data e a hora que o dia JÁ tem;
   *   2. mandava a data nova para TODOS os posts do dia, inclusive os já
   *      publicados. Post publicado não reagenda: mexer nele era escrever
   *      uma data de publicação que não aconteceu;
   *   3. o erro de um post derrubava o laço no meio, com os anteriores já
   *      movidos e sem dizer quais. Agora cada falha é contada e nomeada.
   *
   * O post agendado continua agendado e sai no horário novo; o rascunho
   * continua rascunho, que é a regra da rota e não muda aqui.
   */
  async function handleReschedule() {
    if (!newScheduleDate || !newScheduleTime) {
      toast.error("Escolha a data e a hora antes de salvar.");
      return;
    }
    const moveis = postsDoDia.filter((p) => p.status !== "published" && p.status !== "cancelled");
    if (moveis.length === 0) {
      toast.error("Nada para reagendar: os posts deste dia já foram publicados ou arquivados.");
      return;
    }
    setRescheduling(true);
    try {
      // O que o cliente digitou é hora de Brasília, qualquer que seja o fuso
      // do navegador (29/09).
      const dt = deCampos(newScheduleDate, newScheduleTime).toISOString();
      const falhas: string[] = [];
      for (const post of moveis) {
        const res = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: dt }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) falhas.push(`${nomeDaRede(post.platform)}: ${data.error ?? `erro ${res.status}`}`);
      }
      await refreshDayPosts();
      onWeekRefresh?.();
      if (falhas.length === 0) {
        setRescheduleOpen(false);
        toast.success(`${moveis.length} post(s) reagendado(s) para ${formatScheduledAt(dt)}.`);
      } else if (falhas.length < moveis.length) {
        toast.error(`Reagendei ${moveis.length - falhas.length}, e ${falhas.length} falhou: ${falhas[0]}`);
      } else {
        toast.error(falhas[0]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reagendar.");
    } finally {
      setRescheduling(false);
    }
  }

  /**
   * TIRAR O DIA INTEIRO DA FILA, para mexer nas configurações de novo.
   *
   * Pedido do Bruno em 21/09: "deve ter uma opção de cancelar o agendamento e
   * mexer novamente nas configurações". Existia só por post ("Tirar da fila"),
   * uma rede de cada vez, e quem queria repensar o dia tinha que clicar quatro
   * vezes e torcer para não esquecer uma: a que sobrasse ia ao ar sozinha, que
   * é o pior desfecho possível de uma tela de revisão.
   */
  async function cancelarAgendamentoDoDia() {
    const naFila = postsDoDia.filter((p) => p.status === "scheduled" || p.status === "publishing");
    if (naFila.length === 0) {
      toast.error("Nenhum post deste dia está na fila.");
      return;
    }
    setApproving(true);
    try {
      const falhas: string[] = [];
      for (const post of naFila) {
        const res = await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // `status: draft` e nao `cancelSchedule`: o segundo APAGA o horario,
          // e quem tira o dia da fila para ajustar nao quer perder a data que
          // escolheu. Medido no dev local em 21/09: com cancelSchedule o card
          // passava a dizer "sem horario definido" e o painel de reagendar
          // sugeria daqui a uma hora, em vez do dia que era.
          body: JSON.stringify({ status: "draft" }),
        });
        if (!res.ok) falhas.push(nomeDaRede(post.platform));
      }
      await refreshDayPosts();
      onWeekRefresh?.();
      if (falhas.length === 0) {
        /**
         * O CARD VOLTA A PEDIR DECISAO junto com os posts.
         *
         * Sem isto o card continuava "aprovado" com os posts em rascunho, e a
         * lista "o que sai neste dia" (que so aparece em card nao aprovado)
         * some: a pessoa cancela o agendamento para ajustar e fica sem a tela
         * onde se ajusta. Duas telas contando a mesma historia de dois jeitos,
         * de novo.
         */
        await fetch(`/api/campaign-cards/${localCard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "pending" }),
        }).catch(() => {});
        const voltou = { ...localCard, status: "pending" };
        setLocalCard(voltou);
        onCardUpdate(voltou);
        setRescheduleOpen(true);
        toast.success(`${naFila.length} post(s) saíram da fila e voltaram para rascunho. Ajuste o que quiser e agende de novo.`);
      } else {
        toast.error(`Não consegui tirar da fila: ${falhas.join(", ")}.`);
      }
    } catch {
      toast.error("Não consegui cancelar o agendamento do dia.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        // Sem desfoque: este modal toca o corte, e o backdrop-filter refazia o
        // desfoque a cada quadro do vídeo (quadros caídos, ver semana-do-quadro).
        style={{ background: "rgba(0,0,0,0.78)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {janelaTikTok && (
          <JanelaDoTikTok
            projectId={projectId}
            posts={janelaTikTok.posts}
            acao={janelaTikTok.acao}
            onConcluir={() => {
              janelaTikTok.resolver(true);
              setJanelaTikTok(null);
            }}
            onCancelar={() => {
              janelaTikTok.resolver(false);
              setJanelaTikTok(null);
            }}
          />
        )}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Header */}
          <div className="flex items-start gap-3 p-5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
            <AgentAvatar agentId={localCard.agentId} color={agentRow.color} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{localCard.agentName}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                  {CARD_TYPE_LABELS[localCard.cardType] ?? localCard.cardType}
                </span>
                {/* A hora do POST, e não a do card (29/09): ver horaDoCabecalho. */}
                {horaDoCabecalho && (
                  <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    <AlarmClock className="w-3 h-3" />
                    {formatScheduledAt(horaDoCabecalho)}
                  </span>
                )}
              </div>
              {/* O ESTADO VEM DOS POSTS, e não do status gravado no card.

                  O Bruno agendou um dia e o cabeçalho continuou dizendo
                  "Aguardando aprovação" com os posts já na fila. O status do
                  card é uma cópia que pode envelhecer; os posts são o fato.
                  Quem decide o que a tela diz é o fato. */}
              {revisaoAberta && (
                <div className="mt-2">
                  <SeloDeRevisao revisao={revisaoAberta} grande />
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {(() => {
                  const publicados = dayPosts.filter((p) => p.status === "published").length;
                  const naFilaAgora = dayPosts.filter((p) => p.status === "scheduled").length;
                  if (publicados > 0) {
                    return (
                      <span className="text-xs flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                        {publicados === dayPosts.length ? "Publicado" : `Publicado em ${publicados} de ${dayPosts.length}`}
                      </span>
                    );
                  }
                  if (naFilaAgora > 0) {
                    return (
                      <span className="text-xs flex items-center gap-1" style={{ color: "rgb(96,165,250)" }}>
                        <AlarmClock className="w-3 h-3" />
                        {naFilaAgora === dayPosts.length
                          ? "Agendado, sai sozinho"
                          : `Agendado em ${naFilaAgora} de ${dayPosts.length}`}
                      </span>
                    );
                  }
                  if (localCard.status === "approved")
                    return <span className="text-xs flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> Aprovado</span>;
                  if (localCard.status === "rejected")
                    return <span className="text-xs flex items-center gap-1 text-red-400"><X className="w-3 h-3" /> Rejeitado</span>;
                  // Card de espera: não há o que aprovar ainda (29/09).
                  if (cardEmProducao(localCard))
                    return <span className="text-xs flex items-center gap-1" style={{ color: "#c084fc" }}><Loader2 className="w-3 h-3 animate-spin" /> O squad está fazendo esta peça</span>;
                  return (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Aguardando aprovação
                      {saidaSeAprovar ? `: ${saidaSeAprovar.andou ? "o horário planejado passou; sugerimos" : "sai"} ${diaEHora(new Date(saidaSeAprovar.iso))} se você aprovar` : ""}
                    </span>
                  );
                })()}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-all hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* A linha do tempo do parecer, antes do conteúdo: quem abre a
                peça quer saber primeiro em que pé ela está. */}
            {parecer && parecer.etapas.length > 0 && <LinhaDoTempoDoParecer etapas={parecer.etapas} />}
            {/* Content */}
            {isMedia ? (
              <div className="space-y-3">
                <MediaPreview
                  mediaUrl={midiaDaPeca}
                  cardType="media"
                  large
                  // A capa do corte (ou o quadro do vídeo) vira o quadro de abertura do player.
                  poster={capaDaPeca}
                  onSlideChange={setCurrentSlide}
                />
                {isInfographic && !hasError && localCard.mediaUrl ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <PieChart className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="text-teal-400 font-medium">Infográfico gerado pela IA</span>
                    </div>
                    <button
                      onClick={() => {
                        const url = localCard.mediaUrl!;
                        if (url.startsWith("data:")) {
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `infografico-${localCard.id}.png`;
                          a.click();
                        } else {
                          window.open(url, "_blank");
                        }
                      }}
                      className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg border hover:border-teal-500/50 hover:bg-teal-500/5 transition-all"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      <Download className="w-3 h-3" /> Baixar
                    </button>
                  </div>
                ) : hasError ? (
                  <div className="rounded-xl p-4 border space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--bg-elevated)" }}>
                        {isInfographic ? <PieChart className="w-4 h-4 text-teal-400" /> : <ImageIcon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {isInfographic ? "Infográfico não foi gerado desta vez" : "Imagem não foi gerada desta vez"}
                        </p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          {isInfographic
                            ? "Use o chat abaixo para pedir à Diana para regenerar o infográfico com mais detalhes sobre o conteúdo."
                            : "Use o campo de chat abaixo para descrever como você quer a imagem: a Diana vai gerá-la agora mesmo."}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                      style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Ex: {isInfographic ? <em>&ldquo;refaça o infográfico destacando os 3 principais dados do post&rdquo;</em> : <em>&ldquo;fundo azul com gráficos modernos, estilo corporativo&rdquo;</em>}</span>
                    </div>
                  </div>
                ) : localCard.content ? (
                  <div className="rounded-xl p-3 border space-y-1" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Prompt visual</p>
                    <p className="text-sm leading-relaxed italic" style={{ color: "var(--text-primary)" }}>{localCard.content}</p>
                    {localCard.mediaUrl && (
                      <button
                        onClick={() => {
                          const url = localCard.mediaUrl!;
                          const isVid = url.includes("mp4") || url.startsWith("data:video");
                          const ext = isVid ? "mp4" : url.startsWith("data:image/png") ? "png" : "jpg";
                          if (url.startsWith("data:")) {
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `media-${localCard.id}.${ext}`;
                            a.click();
                          } else {
                            window.open(url, "_blank");
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs mt-2 px-3 py-1.5 rounded-lg border hover:border-orange-500/50 transition-all"
                        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                      >
                        <Download className="w-3 h-3" /> Baixar mídia
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                {/* O corte de vídeo mostra O VÍDEO, antes do texto. Sem isto o
                    modal do card do Vitor era só texto e um campo de IA, e o
                    Bruno abriu, não viu o corte nem o destino, e travou
                    (teste de 31/08). O que o card representa tem que estar
                    na tela. */}
                {localCard.cardType === "video_clip" && localCard.mediaUrl && (
                  <div className="mb-4 space-y-3">
                    {refazendoCorte && (
                      <div
                        className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--accent-orange)", color: "var(--accent-orange)" }}
                      >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Vitor Vídeo está refazendo este corte. O vídeo atualiza aqui sozinho.
                      </div>
                    )}
                    {/* A revisão do corte pela Vera (lib/media/revisao-do-corte.ts):
                        enquanto o Vitor refaz, o card diz isso e o motivo; se não
                        teve conserto, o motivo chega ao cliente às claras. */}
                    {!refazendoCorte && (() => {
                      const leitura = lerRevisaoDoCorte(
                        (localCard.metadata as { revisaoDoCorte?: RevisaoDoCorte } | null)?.revisaoDoCorte
                      );
                      if (!leitura || leitura.estado === "aprovado") return null;
                      return (
                        <div
                          className="rounded-xl border px-3 py-2 text-sm space-y-1"
                          style={{
                            borderColor: leitura.trabalhando ? "#c084fc" : "var(--accent-orange)",
                            color: leitura.trabalhando ? "#c084fc" : "var(--accent-orange)",
                          }}
                        >
                          <p className="flex items-center gap-2 font-medium">
                            {leitura.trabalhando && <Loader2 className="w-4 h-4 animate-spin" />}
                            {leitura.rotulo}
                          </p>
                          {leitura.detalhe && <p style={{ color: "var(--text-muted)" }}>{leitura.detalhe}</p>}
                        </div>
                      );
                    })()}
                    {/* A edição completa, espelhada no card como `montagem`
                        (lib/media/montagem-nos-cortes.ts). */}
                    {(() => {
                      const mo = lerMontagem((localCard.metadata as { montagem?: unknown } | null)?.montagem);
                      if (!mo) return null;
                      const metaMo = localCard.metadata as { videoJobId?: string; completo?: boolean; trechoIndice?: number } | null;
                      return (
                        <div
                          className="rounded-xl border px-3 py-2 text-sm space-y-1"
                          style={{
                            borderColor: mo.trabalhando ? "#c084fc" : mo.podeTentarDeNovo ? "var(--accent-orange)" : "var(--border)",
                            color: mo.trabalhando ? "#c084fc" : mo.estado === "pronto" ? "#4ade80" : mo.podeTentarDeNovo ? "var(--accent-orange)" : "var(--text-muted)",
                          }}
                        >
                          <p className="flex items-center gap-2 font-medium">
                            {mo.trabalhando && <Loader2 className="w-4 h-4 animate-spin" />}
                            {mo.rotulo}
                          </p>
                          {mo.detalhe && <p style={{ color: "var(--text-muted)" }}>{mo.detalhe}</p>}
                          {/* A saída da falha técnica (01/10, parte 240), sem cobrar. */}
                          {mo.podeTentarDeNovo && metaMo?.videoJobId && (metaMo.completo === true || typeof metaMo.trechoIndice === "number") && (
                            <div className="pt-1">
                              <TentarMontagem
                                videoJobId={metaMo.videoJobId}
                                alvo={metaMo.completo === true ? "completo" : (metaMo.trechoIndice as number)}
                                compacto
                                aoPedir={() => {
                                  const updated = {
                                    ...localCard,
                                    metadata: { ...(localCard.metadata ?? {}), montagem: { estado: "gerando", desde: new Date().toISOString(), motivo: null, falhaTecnica: false } },
                                  };
                                  setLocalCard(updated);
                                  onCardUpdate(updated);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* A abertura por IA (Higgsfield), espelhada no card como
                        `aberturaIa` (lib/media/higgsfield-nos-cortes.ts). */}
                    {(() => {
                      const ia = lerAberturaIa((localCard.metadata as { aberturaIa?: unknown } | null)?.aberturaIa);
                      if (!ia) return null;
                      return (
                        <div
                          className="rounded-xl border px-3 py-2 text-sm space-y-1"
                          style={{
                            borderColor: ia.trabalhando ? "#c084fc" : "var(--border)",
                            color: ia.trabalhando ? "#c084fc" : ia.estado === "pronto" ? "#4ade80" : "var(--text-muted)",
                          }}
                        >
                          <p className="flex items-center gap-2 font-medium">
                            {ia.trabalhando && <Loader2 className="w-4 h-4 animate-spin" />}
                            {ia.rotulo}
                          </p>
                          {ia.detalhe && <p style={{ color: "var(--text-muted)" }}>{ia.detalhe}</p>}
                        </div>
                      );
                    })()}
                    {(() => {
                      const meta = localCard.metadata as { destinoRotulo?: string } | null;
                      const metaDest = localCard.metadata as { destino?: string } | null;
                      const plat = metaDest?.destino
                        ? (metaDest.destino === "youtube_shorts" || metaDest.destino === "youtube"
                            ? "youtube"
                            : metaDest.destino === "instagram_reels"
                              ? "instagram"
                              : metaDest.destino === "x"
                                ? "twitter"
                                : metaDest.destino)
                        : null;
                      return meta?.destinoRotulo ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border"
                          style={{ borderColor: "var(--accent-orange)", color: "var(--accent-orange)" }}
                        >
                          {plat && <RedeIcone plataforma={plat} className="w-3.5 h-3.5" />}
                          Destino: {meta.destinoRotulo}
                        </span>
                      ) : null;
                    })()}
                    <video
                      key={`v-${versaoDoCorte}`}
                      src={`${localCard.mediaUrl}${localCard.mediaUrl.includes("?") ? "&" : "?"}v=${versaoDoCorte}`}
                      // A capa do corte é o quadro de abertura. Sem ela o
                      // player abre um retângulo preto de meia tela mesmo com o
                      // vídeo carregado: o conserto de 02/09 pegou o player da
                      // Diana e este ficou de fora.
                      poster={
                        (localCard.metadata as { thumb?: string | null } | null)?.thumb ?? undefined
                      }
                      controls
                      // Aberto = a pessoa vai assistir: buffer adiantado desde já (30/09).
                      preload="auto"
                      className="w-full max-h-[50vh] rounded-xl bg-black object-contain"
                    />
                    {/* A capa do completo no YouTube: duas opções e o estilo,
                        pedido do Bruno em 02/09 depois de o vídeo subir sem
                        capa. Só no card do completo; o corte tem a capa dele
                        no ajuste de arte. */}
                    {(() => {
                      const metaCapa = localCard.metadata as { videoJobId?: string; completo?: boolean } | null;
                      if (!metaCapa?.videoJobId || metaCapa.completo !== true) return null;
                      return (
                        <CapaDoCompleto
                          videoJobId={metaCapa.videoJobId}
                          onEscolhida={(url) => {
                            const updated = { ...localCard, metadata: { ...(localCard.metadata ?? {}), thumb: url, capaUrl: url } };
                            setLocalCard(updated);
                            onCardUpdate(updated);
                          }}
                        />
                      );
                    })()}
                    {/* A prévia fiel e a publicação, aqui mesmo. Antes deste
                        bloco o card do Vitor era um beco: mostrava texto,
                        não mostrava a rede e não tinha caminho de publicar
                        (achado do teste do Bruno em 31/08). */}
                    {(() => {
                      const metaAjuste = localCard.metadata as { videoJobId?: string; trechoIndice?: number } | null;
                      if (!metaAjuste?.videoJobId || typeof metaAjuste.trechoIndice !== "number") return null;
                      const ajustar = async (inicioDelta: number, fimDelta: number) => {
                        try {
                          const r = await fetch(`/api/videos/${metaAjuste.videoJobId}/ajustar-corte`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ trecho: metaAjuste.trechoIndice, inicioDelta, fimDelta }),
                          });
                          const d = await r.json();
                          if (!r.ok) throw new Error(d.error);
                          toast.success("Refazendo o corte com o ajuste. O card avisa quando terminar.");
                          vigiarRecorte();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Não consegui ajustar agora.");
                        }
                      };
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          <span className="mr-1">Ajuste fino:</span>
                          {[
                            { r: "início +2s", i: 2, f: 0 },
                            { r: "início -2s", i: -2, f: 0 },
                            { r: "fim -2s", i: 0, f: -2 },
                            { r: "fim +2s", i: 0, f: 2 },
                          ].map((b) => (
                            <button
                              key={b.r}
                              type="button"
                              onClick={() => void ajustar(b.i, b.f)}
                              className="px-2 py-1 rounded-full border transition-colors hover:border-orange-500/50"
                              style={{ borderColor: "var(--border)" }}
                            >
                              {b.r}
                            </button>
                          ))}
                          <span className="ml-1">ou peça ao Vitor no chat abaixo.</span>
                        </div>
                      );
                    })()}
                    {/* Tirar do ar sem sair da tela.
                        Até 02/09 essa decisão só existia na tela do vídeo, que
                        era outra tela: o cliente desmarcava lá, o corte sumia
                        do quadro aqui, e a leitura era de trabalho perdido. Ele
                        continua existindo, apagado, na mesma célula. */}
                    {(() => {
                      const metaGuardar = localCard.metadata as { videoJobId?: string; trechoIndice?: number } | null;
                      if (!metaGuardar?.videoJobId || typeof metaGuardar.trechoIndice !== "number") return null;
                      return (
                        <button
                          type="button"
                          className="text-xs underline-offset-2 hover:underline"
                          style={{ color: "var(--text-muted)" }}
                          onClick={async () => {
                            if (!window.confirm("Guardar este corte? Ele sai da fila de publicação e continua no quadro, apagado, para você ligar de novo quando quiser.")) return;
                            try {
                              const r = await fetch(`/api/videos/${metaGuardar.videoJobId}/destinos`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ trecho: metaGuardar.trechoIndice, publicar: false }),
                              });
                              if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
                              toast.success("Corte guardado. Ele continua no quadro, apagado.");
                              onWeekRefresh?.();
                              onClose();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Não deu para guardar o corte.");
                            }
                          }}
                        >
                          Guardar este corte, sem publicar
                        </button>
                      );
                    })()}
                    {(() => {
                      const proprio = dayPosts.find((dp) => dp.id === localCard.postId);
                      if (!proprio) return null;
                      const conta = accountFor(proprio.platform, proprio.socialAccountId);
                      return (
                        <div className="space-y-2">
                          <SocialPostPreview
                            platform={proprio.platform}
                            content={proprio.content}
                            imageUrl={(localCard.metadata as { thumb?: string | null } | null)?.thumb ?? null}
                            scheduledAt={horaDaPrevia(proprio)}
                            status={proprio.status}
                            conta={accountFor(proprio.platform, proprio.socialAccountId) ?? null}
                          />
                          {/* Publicar NÃO é aqui. O botão "Publicar agora"
                              viveu neste card de 31/08 a 02/09 e virou um
                              segundo lugar de publicar, ao lado do Paulo: o
                              Bruno chamou de fluxo confuso. O card do Vitor é
                              onde se revisa o corte e o texto; quem publica o
                              dia é o Paulo, que lista cada post com o botão. */}
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {proprio.status === "published"
                              ? "Este post já foi publicado."
                              : conta
                                ? "Aprove e agende logo abaixo, ou pelo card do Paulo deste dia, que lista todos os posts prontos."
                                : "Conecte esta rede em Configurações; a publicação é pelo card do Paulo deste dia."}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Conteúdo</p>
                  {!editing && localCard.cardType !== "preview" && localCard.cardType !== "publish" && (
                    <button
                      onClick={() => { setEditing(true); setEditedContent(localCard.content ?? ""); }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all hover:bg-[var(--realce-1)]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  )}
                </div>
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={12}
                      className="w-full text-sm px-4 py-3 rounded-xl border outline-none resize-none leading-relaxed"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                      <Button size="sm" onClick={saveEdit} loading={savingEdit}>Salvar</Button>
                    </div>
                  </div>
                ) : localCard.mediaType === "poll" && localCard.content ? (
                  <PollPreview
                    content={localCard.content}
                    metadata={localCard.metadata as Record<string, unknown> | null | undefined}
                    platform={localCard.cardType === "post_linkedin" ? "linkedin" : "twitter"}
                  />
                ) : (localCard.mediaType === "thread" || localCard.cardType === "post_twitter") && localCard.content ? (
                  <ThreadPreview content={localCard.content} />
                ) : localCard.mediaType === "article" && localCard.content ? (
                  <ArticlePreview content={localCard.content} />
                ) : (
                  <div
                    className="rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed"
                    style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: 100 }}
                  >
                    {localCard.content ?? "..."}
                  </div>
                )}
              </div>
            )}

            {/* A prévia fiel de cada post do dia. No Paulo, porque é dali que
                se publica; na Vera, porque o card dela PROMETE "confira como
                cada post vai aparecer na rede" e até 02/09 só mostrava esse
                texto, sem prévia nenhuma. */}
            {/* ── O VÍDEO QUE NÃO SAIU, e por quê (21/09) ──
                O Bruno reprovou o dia 21 "porque estava sem vídeo", e a tela
                não dizia nada: o Veo tinha recusado as três tentativas por
                cobrança do Google, os créditos voltaram, e a peça ficou com o
                quadro dentro, calada. Falha de fornecedor que o cliente paga
                em silêncio é a pior das telas mudas. */}
            {(() => {
              type MarcaDeFalha = {
                codigo?: string;
                motivo?: string;
                podeTentarDeNovo?: boolean;
                resolveSozinho?: boolean;
                /** O trabalho está pausado esperando o gerador: ainda vai tentar. */
                aguardando?: boolean;
                /** O cliente pediu de novo e o vídeo está sendo gerado (28/09). */
                refazendo?: boolean;
                /** Engasgo do gerador (28/09): a hora da próxima tentativa. */
                proximaEm?: string;
                tentativa?: number;
                de?: number;
                chamado?: { protocolo?: string };
              };
              const peca = dayPosts.find((p) => (p.metadata as { videoFalhou?: MarcaDeFalha } | null)?.videoFalhou?.motivo);
              const falha = (peca?.metadata as { videoFalhou?: MarcaDeFalha } | null)?.videoFalhou;
              if (!peca || !falha?.motivo) return null;
              const protocolo = falha.chamado?.protocolo ?? chamadoAberto;
              return (
                <div className="rounded-xl px-4 py-3 border border-amber-500/30 flex gap-2.5" style={{ background: "rgba(245,158,11,0.06)" }}>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {/* ESPERANDO e NÃO VEIO são estados diferentes (21/09, noite).
                        O Bruno abriu o card com o vídeo pausado por cota e viu só o
                        quadro, sem uma palavra. Enquanto a fila ainda vai tentar, a
                        peça diz isso; quando desiste, diz que não veio. */}
                    <p className="text-xs font-semibold text-amber-400">
                      {falha.refazendo
                        ? "Gerando o vídeo de novo"
                        : falha.aguardando
                          ? "O vídeo desta peça ainda não foi gerado: está esperando o gerador"
                          : "O vídeo desta peça não foi gerado"}
                    </p>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>
                      {falha.motivo}
                      {falha.refazendo
                        ? ""
                        : falha.aguardando && falha.proximaEm
                        ? ` Nova tentativa às ${new Date(falha.proximaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (${falha.tentativa} de ${falha.de}). Enquanto isso, o que você vê é o quadro de abertura, e a peça não publica sem o vídeo.`
                        : falha.aguardando
                          ? " A fila tenta de novo sozinha; enquanto isso, o que você vê é o quadro de abertura, e a peça não publica sem o vídeo."
                          : ""}
                    </p>
                    {/* O CÓDIGO, e não o diagnóstico. O que ele significa é
                        assunto interno: o cliente informa o código e quem lê o
                        resto é quem pode resolver (pedido do Bruno, 21/09). */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {falha.codigo && !falha.refazendo && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-[2px] rounded font-mono"
                          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                        >
                          {falha.codigo}
                        </span>
                      )}
                      {!falha.resolveSozinho &&
                        (protocolo ? (
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            Chamado aberto: <b className="font-mono">{protocolo}</b>. Você recebe a resposta por e-mail.
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={abrindoChamado}
                            onClick={() => void abrirChamado(peca.id, falha.codigo)}
                            className="text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            {abrindoChamado ? "Abrindo…" : "Abrir chamado"}
                          </button>
                        ))}
                      {/* A SAIDA (21/09): "o usuario fica sem opcao".
                          O quadro de abertura ja e uma peca de feed inteira,
                          com manchete e formato de cada rede, e e assim que o
                          dia sai quando o saldo de video acaba ANTES. Aqui a
                          mesma saida e oferecida DEPOIS, quando o video foi
                          tentado e nao veio: o dia publica como imagem, o
                          trabalho sai da fila e o credito de video volta. */}
                      {localCard.runId && localCard.dayOfWeek && (
                        <button
                          type="button"
                          disabled={publicandoComoImagem}
                          onClick={() => void publicarDiaComoImagem()}
                          className="text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:border-orange-500/50 hover:text-orange-400 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          title="Publica a arte de abertura como imagem, tira o vídeo da fila e devolve os créditos de vídeo."
                        >
                          {publicandoComoImagem ? "Trocando…" : "Publicar como imagem"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {(isPublish || isPreview) && (
              <div className="space-y-3">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Globe className="w-3.5 h-3.5" />
                  {isPreview ? "Como cada post vai aparecer" : "Preview completo do post"}
                </p>
                {loadingPost ? (
                  <div className="rounded-xl p-6 flex items-center justify-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
                  </div>
                ) : dayPosts.length > 0 ? (
                  // Show preview for each platform (linkedin + twitter)
                  <div className="space-y-3">
                    {dayPosts.map((p) => {
                      const mt = p.mediaType;
                      const isTwitterThread =
                        p.platform === "twitter" &&
                        (mt === "thread" || /^\d+[\/\.]\s/m.test(p.content));
                      /**
                       * REFAZER ESTA PEÇA, embaixo da prévia dela (21/09).
                       *
                       * A lista "o que sai neste dia" só existe enquanto o dia
                       * não foi aprovado, e é justamente no dia aprovado que o
                       * cliente olha a peça pronta e não gosta. Sem esta barra,
                       * quem aprovou a semana ficava sem caminho e voltava para
                       * o botão que gera uma campanha inteira.
                       */
                      const barraDeRefazer =
                        p.status === "published" || p.status === "cancelled" ? null : (
                          <div className="flex items-center justify-end gap-3 px-1">
                            <button
                              type="button"
                              disabled={approving || editandoPost?.id === p.id}
                              onClick={() => setEditandoPost({ id: p.id, texto: p.content })}
                              title={`Mudar o texto de ${nomeDaRede(p.platform)} antes de aprovar. Não gasta créditos.`}
                              className="flex items-center gap-1 text-[10px] font-medium transition-all hover:text-orange-400 disabled:opacity-40"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <Pencil className="w-3 h-3" />
                              Editar texto
                            </button>
                            <button
                              type="button"
                              disabled={approving || refazendo === p.id}
                              onClick={() => void refazerUmaPeca(p)}
                              title={`Escrever de novo a peça de ${nomeDaRede(p.platform)}, do zero. Custa ${custoDeRefazer(p)} créditos.`}
                              className="flex items-center gap-1 text-[10px] font-medium transition-all hover:text-orange-400 disabled:opacity-40"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <RefreshCw className={cn("w-3 h-3", refazendo === p.id && "animate-spin")} />
                              {refazendo === p.id
                                ? "Refazendo esta peça…"
                                : `Refazer esta peça · ${custoDeRefazer(p)} créditos`}
                            </button>
                          </div>
                        );
                      const comRefazer = (previa: React.ReactNode) => (
                        <div key={p.id} className="space-y-1.5">
                          {editandoPost?.id === p.id ? (
                            <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                              <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                                Texto de {nomeDaRede(p.platform)}
                              </p>
                              <textarea
                                value={editandoPost.texto}
                                onChange={(e) => setEditandoPost({ id: p.id, texto: e.target.value })}
                                rows={10}
                                autoFocus
                                className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y leading-relaxed"
                                style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                                  {editandoPost.texto.length} caracteres
                                  {p.platform === "twitter" && !editandoPost.texto.includes("\n\n") && editandoPost.texto.length > 280 ? ", passa de 280 no X" : ""}
                                </span>
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => setEditandoPost(null)}>Cancelar</Button>
                                  <Button size="sm" onClick={() => void salvarTextoDoPost()} loading={salvandoPost} disabled={!editandoPost.texto.trim()}>
                                    Salvar texto
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            previa
                          )}
                          {barraDeRefazer}
                        </div>
                      );
                      if (mt === "poll") return comRefazer(<PollPreview content={p.content} platform={p.platform} />);
                      if (isTwitterThread) return comRefazer(<ThreadPreview content={p.content} />);
                      if (mt === "article") return comRefazer(<ArticlePreview content={p.content} />);
                      // A capa do player vem da esteira do vídeo: arte do
                      // corte para o trecho, capa da fonte para o completo.
                      // Sem isso os players do Paulo e da Vera abriam pretos.
                      const mv = p.metadata as { videoJobId?: string; trechoIndice?: number; gravacaoCompleta?: boolean; capaUrl?: string } | null;
                      const poster = mv?.videoJobId
                        ? typeof mv.trechoIndice === "number"
                          ? `/api/videos/${mv.videoJobId}/midia?trecho=${mv.trechoIndice}&tipo=capa-arte`
                          : mv.gravacaoCompleta
                            // A capa escolhida pelo cliente, quando existe;
                            // o quadro-fonte enquanto não.
                            ? mv.capaUrl ?? `/api/videos/${mv.videoJobId}/midia?tipo=capa-fonte`
                            : null
                        : null;
                      return comRefazer(
                        <SocialPostPreview
                          platform={p.platform}
                          content={p.content}
                          imageUrl={p.imageUrl}
                          scheduledAt={horaDaPrevia(p)}
                          status={p.status}
                          poster={poster}
                          conta={accountFor(p.platform, p.socialAccountId) ?? null}
                        />
                      );
                    })}

                    {/* First comment preview (LinkedIn sources) */}
                    {(() => {
                      const liPost = dayPosts.find((p) => p.platform === "linkedin");
                      const firstComment = liPost?.metadata?.firstComment as string | undefined;
                      if (!firstComment) return null;
                      return (
                        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                          <div className="px-4 py-2 flex items-center gap-2 text-xs" style={{ background: "rgba(10,102,194,0.10)", borderBottom: "1px solid var(--border)" }}>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            <span className="font-semibold" style={{ color: "#0A66C2" }}>Primeiro comentário no LinkedIn</span>
                          </div>
                          <div className="p-4">
                            <p className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>{firstComment}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : postContent ? (
                  <SocialPostPreview
                    platform={postPlatform}
                    content={postContent}
                    imageUrl={postImageUrl}
                    scheduledAt={postScheduledAt}
                    status={postStatus ?? undefined}
                  />
                ) : (
                  <div className="rounded-xl p-4 text-sm text-center" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    Nenhum post neste dia ainda.
                  </div>
                )}
              </div>
            )}

            {/* O CARD DO REDATOR (Xavier, Lucas...) CUJO POST FALHOU (01/10,
                pedido do Bruno: "os posts que falham, eu não consigo
                arquivar"). O card do X aberto mostrava o texto e o chat, e
                nada dizia que a publicação tinha falhado nem dava a saída. */}
            {!isPublish && !acoesNoCardDoVideo && localCard.postId && postStatus === "failed" && (() => {
              const p = dayPosts.find((x) => x.id === localCard.postId) ?? { id: localCard.postId, platform: postPlatform ?? "", metadata: null };
              const arquivar = async () => {
                await arquivarPost({ id: p.id, platform: p.platform });
                setPostStatus("cancelled");
              };
              const codigo = codigoDaFalha(p.metadata);
              return codigo ? (
                <FalhaDaPublicacao
                  postId={p.id}
                  codigo={codigo}
                  protocolo={chamadoDaFalha(p.metadata)}
                  motivoDaRede={motivoDaRedeNaFrase(p.metadata)}
                  onChamado={() => void refreshDayPosts()}
                  onArquivar={arquivar}
                />
              ) : (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 border"
                  style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(185,28,28,0.06)" }}
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="flex-1 min-w-0 text-xs" style={{ color: "var(--text-primary)" }}>
                    <b className="font-semibold text-red-400">A publicação no {nomeDaRede(p.platform)} falhou.</b> Arquive para tirar do Gestor; tem volta em Posts, aba Arquivados.
                  </p>
                  <button
                    type="button"
                    data-arquivar-falha
                    disabled={approving}
                    onClick={() => void arquivar()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-all hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <Archive className="w-3 h-3" />
                    Arquivar
                  </button>
                </div>
              );
            })()}

            {/* Publish card actions */}
            {/* TAMBÉM NO CARD DO VÍDEO (30/09, pedido do Bruno): o completo
                ficou pronto e o card não tinha como aprovar nem agendar, só
                "abra o card do Paulo". O vídeo é a peça que o cliente mais
                quer revisar e já sair publicando dali; o bloco é o mesmo do
                Paulo, restrito ao post deste card. */}
            {(isPublish || acoesNoCardDoVideo) && (
              <div className="space-y-3">
                {/* Scheduled time banner */}
                <div
                  className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
                >
                  {loadingPost ? (
                    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando...
                    </div>
                  ) : naFilaDoDia[0]?.scheduledAt ? (
                    // "Agendado" só quando o cliente já aprovou e o post está
                    // na fila: antes disso o horário é proposta (29/09).
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Publicação agendada</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatScheduledAt(naFilaDoDia[0].scheduledAt)}</p>
                      </div>
                    </div>
                  ) : saidaSeAprovar ? (
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          {saidaSeAprovar.andou ? "O horário planejado passou" : "Ainda não agendado"}
                        </p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {saidaSeAprovar.andou
                            ? `Sugerimos ${diaEHora(new Date(saidaSeAprovar.iso))}, se você aprovar`
                            : `Sai ${diaEHora(new Date(saidaSeAprovar.iso))} se você aprovar`}
                        </p>
                      </div>
                    </div>
                  ) : postScheduledAt ? (
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 text-orange-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Horário do dia</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatScheduledAt(postScheduledAt)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlarmClock className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sem horário definido</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* TIRAR O DIA DA FILA. Só aparece quando há algo na fila:
                        um botão que não tem o que cancelar é um botão que
                        ensina errado. */}
                    {postsDoDia.some((p) => p.status === "scheduled" || p.status === "publishing") && (
                      <button
                        type="button"
                        onClick={() => void cancelarAgendamentoDoDia()}
                        disabled={approving}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:border-orange-500/50 hover:bg-orange-500/8 disabled:opacity-50"
                        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        title="Tira todos os posts deste dia da fila e volta para rascunho, para você ajustar e agendar de novo"
                      >
                        <Ban className="w-3 h-3" />
                        Cancelar agendamento
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        // O PAINEL ABRE PREENCHIDO com o que o dia já tem.
                        // Nascer vazio deixava o botão Salvar desabilitado, e
                        // um painel com botão morto lê como "não funciona".
                        if (!rescheduleOpen) {
                          const atual = postsDoDia.find((p) => p.scheduledAt)?.scheduledAt ?? postScheduledAt;
                          // Data no passado nao serve de sugestao: a rota
                          // recusa agendar para tras, com razao, e o painel
                          // abriria ja condenado. Nesse caso vale o proximo
                          // horario LIVRE, o mesmo que a caixa acima sugere
                          // (29/09). Campos sempre em Brasilia.
                          const base = new Date(horarioParaFila(atual, ocupados)?.iso ?? Date.now() + 60 * 60 * 1000);
                          const campos = paraCampos(base);
                          setNewScheduleDate(campos.data);
                          setNewScheduleTime(campos.hora);
                        }
                        setRescheduleOpen(!rescheduleOpen);
                      }}
                      disabled={approving}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:border-blue-500/50 hover:bg-blue-500/8 disabled:opacity-50"
                      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reagendar
                    </button>
                  </div>
                </div>

                {/* ── Reagendar expandido ──

                    ELE MORAVA DENTRO DO BLOCO QUE SÓ EXISTE ENQUANTO O DIA NÃO
                    ESTÁ APROVADO, e o botão que o abre sempre esteve fora.

                    Medido em 21/09 no dev local, com o relato do Bruno de que
                    "o botão reagendar não funciona": o dia aprovado esconde o
                    bloco inteiro, então clicar em Reagendar mudava um estado
                    que nada desenhava. E aprovar é justamente o caminho normal
                    do produto, ou seja o botão estava morto exatamente para
                    quem já tinha feito tudo certo. Reagendar é sobre o
                    HORÁRIO, e o horário se muda aprovado ou não.
                */}
                {/* ── Reagendar expandido ── */}
                    <AnimatePresence>
                      {rescheduleOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-xl border p-3 space-y-2"
                          style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                        >
                          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Nova data e horário de publicação</p>
                          {(() => {
                            const moveis = postsDoDia.filter((p) => p.status !== "published" && p.status !== "cancelled");
                            const publicados = postsDoDia.filter((p) => p.status === "published").length;
                            return (
                              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                {moveis.length === 0
                                  ? "Nada para mover: os posts deste dia já foram publicados ou arquivados."
                                  : `Move ${moveis.length} post(s): ${moveis.map((p) => nomeDaRede(p.platform)).join(", ")}.`}
                                {publicados > 0 ? ` ${publicados} já publicado(s) fica(m) como está(ão).` : ""}
                              </p>
                            );
                          })()}
                          <div className="flex gap-2">
                            <input
                              type="date"
                              className="flex-1 text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={newScheduleDate}
                              onChange={(e) => setNewScheduleDate(e.target.value)}
                            />
                            <input
                              type="time"
                              className="w-32 text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={newScheduleTime}
                              onChange={(e) => setNewScheduleTime(e.target.value)}
                            />
                            <Button size="sm" onClick={handleReschedule} loading={rescheduling} disabled={!newScheduleDate}>
                              Salvar
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                {/* AS SEIS REDES, conectadas ou não (item 13, 29/09). Fica
                    fora da trava de "dia aprovado" de propósito: saber onde o
                    dia sai, e o que falta conectar, vale antes e depois de
                    aprovar. Marcar a rede aqui marca os posts dela na lista
                    de baixo, que é quem publica. */}
                <DestinosDoDia
                  projectId={projectId}
                  posts={postsDoDia}
                  contas={socialAccounts}
                  escolhidos={escolhidos}
                  aoEscolher={setEscolhidos}
                  ocupado={approving}
                  aoMudar={async () => { await refreshDayPosts(); onWeekRefresh?.(); }}
                />

                {/* AS FALHAS NO DIA APROVADO (01/10, pedido do Bruno: "os posts
                    que falham, eu não consigo arquivar"). A lista do dia, com o
                    cartão da falha e o botão de arquivar, só aparece antes da
                    aprovação; o post do X aprovado, agendado e que falhou na
                    hora de sair ficava sem nenhuma saída neste card. */}
                {localCard.status === "approved" &&
                  postsDoDia
                    .filter((p) => p.status === "failed")
                    .map((p) =>
                      codigoDaFalha(p.metadata) ? (
                        <FalhaDaPublicacao
                          key={`falha-aprovado-${p.id}`}
                          postId={p.id}
                          codigo={codigoDaFalha(p.metadata)!}
                          protocolo={chamadoDaFalha(p.metadata)}
                          motivoDaRede={motivoDaRedeNaFrase(p.metadata)}
                          onChamado={() => void refreshDayPosts()}
                          onArquivar={() => arquivarPost(p)}
                        />
                      ) : (
                        <div
                          key={`falha-aprovado-${p.id}`}
                          className="flex items-center gap-2.5 rounded-xl px-4 py-3 border"
                          style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(185,28,28,0.06)" }}
                        >
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <p className="flex-1 min-w-0 text-xs" style={{ color: "var(--text-primary)" }}>
                            {/* Sem a frase crua da rede (ela é técnica e em inglês): o
                                que fazer e a volta do arquivar. */}
                            <b className="font-semibold text-red-400">A publicação no {nomeDaRede(p.platform)} não saiu.</b> Para tentar de novo, use Reagendar acima; para tirar do Gestor, arquive (tem volta em Posts, aba Arquivados).
                          </p>
                          <button
                            type="button"
                            data-arquivar-falha
                            disabled={approving}
                            onClick={() => void arquivarPost(p)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-all hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            <Archive className="w-3 h-3" />
                            Arquivar
                          </button>
                        </div>
                      )
                    )}

                {localCard.status !== "approved" && dayPosts.length > 0 && (
                  <div className="space-y-2">
                    {/* ── Banner: o DIA foi reprovado ──
                        Dizia "Campanha rejeitada", e o card é um dia. Quem
                        reprovava uma peça lia que tinha derrubado a semana
                        inteira, que era a queixa do Bruno em 21/09. */}
                    {localCard.status === "rejected" && (() => {
                      /**
                       * GERAR DE NOVO COM O MESMO TEMA, aqui mesmo (21/09).
                       *
                       * Pedido do Bruno depois de reprovar o dia 21: "ali deve
                       * dar a opção de gerar novo post com o mesmo tema, o
                       * botão é gerar nova campanha". Ele tinha razão: no dia
                       * reprovado a única saída oferecida era abrir uma campanha
                       * nova de sete dias.
                       *
                       * Isto refaz as peças REPROVADAS deste dia, uma a uma, no
                       * lugar delas, pelo caminho que já existe e já cobra o que
                       * cobra. O custo vai no rótulo, antes do clique.
                       */
                      const reprovados = postsDoDia.filter((p) => p.status === "rejected");
                      const custoTotal = reprovados.reduce((s, p) => s + custoDeRefazer(p), 0);
                      return (
                        <div className="rounded-xl px-4 py-3 border border-red-500/30 space-y-2.5" style={{ background: "rgba(239,68,68,0.06)" }}>
                          <div className="flex items-center gap-2.5">
                            <X className="w-4 h-4 text-red-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-red-400">Dia reprovado</p>
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                Só este dia. O resto da campanha continua de pé.
                              </p>
                            </div>
                          </div>
                          {reprovados.length > 0 && (
                            <button
                              type="button"
                              disabled={approving || refazendo !== null}
                              onClick={() => void refazerDiaReprovado(reprovados)}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all hover:border-orange-500/50 hover:bg-orange-500/10 disabled:opacity-50"
                              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                            >
                              <RefreshCw className={cn("w-3.5 h-3.5 text-orange-400", refazendo !== null && "animate-spin")} />
                              {refazendo !== null
                                ? "Gerando de novo…"
                                : `Gerar ${reprovados.length === 1 ? "a peça" : `as ${reprovados.length} peças`} de novo, com o mesmo tema · ${custoTotal} créditos`}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* A lista do dia: uma linha por post, com a rede, o que
                        é, o estado e a marcação. As ações embaixo valem para o
                        que está marcado. Ela continua visível depois da
                        reprovação: esconder era tirar da tela justamente a
                        prova do que foi reprovado. */}
                    {postsDoDia.length > 0 && (() => {
                      // O resumo do dia em uma frase, antes da lista: e a
                      // resposta a "o que vai sair e quando" sem ler linha a linha.
                      const r = resumoDoDia(postsDoDia);
                      const codigoDoDia = postsDoDia.map((p) => estadoDoPost(p)).find((e) => e.chave === "falhou")?.codigo;
                      const publicados = r.porEstado.publicado;
                      const frase =
                        r.dominante === "falhou" ? `Um post falhou: ${r.linha}.`
                        : r.dominante === "rascunho" ? `${r.porEstado.rascunho} em rascunho: não ${r.porEstado.rascunho > 1 ? "saem" : "sai"} enquanto você não agendar ou publicar.`
                        : r.dominante === "agendado" ? `${r.porEstado.agendado + r.porEstado.publicando} agendado${r.porEstado.agendado + r.porEstado.publicando > 1 ? "s" : ""} ${r.proximo ? `para ${formatScheduledAt(r.proximo.toISOString())}` : ""}. ${r.porEstado.agendado + r.porEstado.publicando > 1 ? "Saem" : "Sai"} sozinho${r.porEstado.agendado + r.porEstado.publicando > 1 ? "s" : ""}.`
                        // O DIA FORA DA MESA tinha caído no ramo do publicado e
                        // dizia "0 publicado. Nada mais a fazer neste dia." sobre
                        // um dia inteiro reprovado. Achado na tela em 21/09, com
                        // o dia 21 do Bruno aberto na frente.
                        : r.dominante === "fora" ? `${r.porEstado.fora} ${r.porEstado.fora > 1 ? "peças reprovadas ou arquivadas" : "peça reprovada ou arquivada"}: ${r.porEstado.fora > 1 ? "elas não saem" : "ela não sai"}. Gere de novo com o mesmo tema, ou arquive o dia.`
                        : `${publicados} publicado${publicados > 1 ? "s" : ""}. Nada mais a fazer neste dia.`;
                      const complemento =
                        r.dominante === "agendado" && publicados > 0 ? `${publicados} já publicado${publicados > 1 ? "s" : ""}.`
                        : r.dominante === "agendado" ? "Você não precisa fazer nada."
                        : r.dominante === "rascunho" && (r.porEstado.agendado > 0 || publicados > 0) ? `${r.porEstado.agendado} agendado${r.porEstado.agendado > 1 ? "s" : ""}, ${publicados} publicado${publicados > 1 ? "s" : ""}.`
                        // Falha com código PUB-* diz o que fazer pelo dicionário:
                        // "publique de novo" é o conselho errado quando a causa é
                        // nossa e tentar de novo não muda nada (PUB-INT).
                        : r.dominante === "falhou" && codigoDoDia ? TRADUCAO_DOS_CODIGOS[codigoDoDia].oQueFazer
                        : r.dominante === "falhou" ? (r.rodape === "reconectar e tentar" ? "Reconecte a rede em Configurações e publique de novo." : "Marque o post e publique de novo.")
                        : "";
                      return (
                        <div className="rounded-xl px-4 py-3 flex items-center gap-3 border" style={{ borderColor: `${r.cor}55`, background: `${r.cor}0f` }}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.cor }} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{frase}</p>
                            {complemento && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{complemento}</p>}
                          </div>
                        </div>
                      );
                    })()}

                    {/* AS FALHAS DE PUBLICAÇÃO COM CÓDIGO (01/10): cada peça
                        que falhou com PUB-* ganha o cartão com o que aconteceu,
                        o que fazer e o chamado. O resumo acima só diz o título. */}
                    {postsDoDia
                      .filter((p) => p.status === "failed" && codigoDaFalha(p.metadata))
                      .map((p) => (
                        <FalhaDaPublicacao
                          key={`falha-${p.id}`}
                          postId={p.id}
                          codigo={codigoDaFalha(p.metadata)!}
                          protocolo={chamadoDaFalha(p.metadata)}
                          motivoDaRede={motivoDaRedeNaFrase(p.metadata)}
                          onChamado={() => void refreshDayPosts()}
                          onArquivar={() => arquivarPost(p)}
                        />
                      ))}

                    {/* A lista vale também no dia reprovado: esconder era tirar da
                        tela a prova do que foi recusado, e foi assim que uma
                        reprovação de uma peça pareceu a perda da campanha. */}
                    {postsDoDia.length > 0 && (
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                          <p className="text-xs font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                            <Send className="w-3.5 h-3.5 text-orange-400" />
                            O que sai neste dia, por rede
                          </p>
                          <button
                            type="button"
                            className="text-[10px] font-medium hover:underline"
                            style={{ color: "var(--text-muted)" }}
                            onClick={() => {
                              const todos = postsDoDia.filter((p) => publicavel(p) && accountFor(p.platform, p.socialAccountId)).map((p) => p.id);
                              setEscolhidos(marcados.length > 0 ? new Set() : new Set(todos));
                            }}
                          >
                            {marcados.length > 0 ? "Desmarcar tudo" : "Marcar tudo"}
                          </button>
                        </div>
                        <div className="flex flex-col">
                          {postsDoDia.map((p) => {
                            const conta = accountFor(p.platform, p.socialAccountId);
                            const publicado = p.status === "published";
                            const naFila = p.status === "scheduled";
                            const arquivado = p.status === "cancelled";
                            const reprovado = p.status === "rejected";
                            const podeMarcar = publicavel(p) && Boolean(conta);
                            const marcado = escolhidos.has(p.id);
                            const horario = p.scheduledAt ?? postScheduledAt;
                            const fila = horarioParaFila(horario, ocupados);
                            const url = (p.metadata as { url?: string } | null)?.url;
                            const estado = publicado
                              ? "Publicado"
                              : arquivado
                                ? "Arquivado"
                                : reprovado
                                  // A peça reprovada continua na lista, dizendo o que é.
                                  // Sem esta linha ela voltava a se chamar "Rascunho", e o
                                  // cliente lia que ainda precisava decidir o que já decidiu.
                                  ? "Reprovado: você recusou esta peça"
                                : p.status === "failed"
                                  // A peça que falhou se chamava "Rascunho" aqui,
                                  // e o cliente não ligava a linha ao aviso de cima.
                                  ? `Falhou: ${estadoDoPost(p).detalhe}`
                                : !conta
                                  ? `Conecte o ${nomeDaRede(p.platform)} em Configurações para publicar`
                                  : naFila
                                    ? `Agendado: ${estadoDoPost(p).detalhe}`
                                    : fila?.andou
                                      // Vencido: o próximo horário livre, e não só o aviso (29/09).
                                      ? `Rascunho: o horário planejado passou; sugerimos ${diaEHora(new Date(fila.iso))}, se você aprovar`
                                      : fila
                                        ? `Rascunho: sai ${diaEHora(new Date(fila.iso))} se você aprovar`
                                        : "Rascunho, sem horário definido";
                            return (
                              <label
                                key={p.id}
                                className={cn("flex items-center gap-3 py-3 px-4 transition-all", podeMarcar ? "cursor-pointer hover:bg-[var(--realce-1)]" : "opacity-60")}
                                style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}
                              >
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-orange-500 shrink-0"
                                  checked={marcado}
                                  disabled={!podeMarcar || approving}
                                  onChange={(e) => {
                                    const prox = new Set(escolhidos);
                                    if (e.target.checked) prox.add(p.id); else prox.delete(p.id);
                                    setEscolhidos(prox);
                                  }}
                                />
                                {/* A FOTO DA CONTA, e nao so o icone da rede.
                                    Em 18/09 o Bruno disse que "quando clico no card nao
                                    fica claro se sao da pagina ou do perfil". O projeto
                                    dele tem duas contas de LinkedIn, e o icone da rede e
                                    o mesmo nas duas: a foto e o que separa a logo da
                                    empresa do rosto do dono. */}
                                <FotoDaConta
                                  conta={conta ?? { platform: p.platform, displayName: null, accountType: "personal" }}
                                  tamanho={30}
                                  className={podeMarcar ? undefined : "opacity-60"}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                    {conta?.displayName ?? nomeDaRede(p.platform)}
                                    <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                                      {conta ? ` · ${conta.accountType === "organization" ? "página" : "perfil"}` : ""} · {oQueE(p)}
                                    </span>
                                  </span>
                                  <span className="block text-[10px] truncate" style={{ color: publicado ? "rgb(74,222,128)" : naFila ? "rgb(251,146,60)" : "var(--text-muted)" }}>
                                    {estado}
                                  </span>
                                </span>
                                {/* POR ONDE SAI. Ate 14/09 a linha dizia a rede e nao a
                                    conta, e o post da gravacao saiu pelo perfil com a
                                    pagina conectada, sem a tela avisar. Com mais de uma
                                    conta na rede, da para trocar enquanto nao publicou. */}
                                {(() => {
                                  const daRede = socialAccounts.filter((a) => a.platform === p.platform);
                                  const rotulo = (a: { displayName: string | null; accountType: string }) =>
                                    `${a.displayName ?? p.platform} (${a.accountType === "organization" ? "página" : "perfil"})`;
                                  // Com uma conta só na rede, o nome já está na
                                  // linha, ao lado da foto: repetir no canto era
                                  // dizer a mesma coisa duas vezes.
                                  if (publicado || daRede.length <= 1) return null;
                                  return (
                                    <select
                                      value={conta?.id ?? ""}
                                      disabled={approving}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        e.stopPropagation();
                                        const socialAccountId = e.target.value;
                                        try {
                                          const res = await fetch(`/api/posts/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ socialAccountId }) });
                                          if (!res.ok) throw new Error();
                                          await refreshDayPosts();
                                          toast.success("Destino trocado.");
                                        } catch {
                                          toast.error("Não consegui trocar o destino.");
                                        }
                                      }}
                                      className="text-[10px] rounded-md border px-1.5 py-1 shrink-0 max-w-[160px]"
                                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                                      title="Por onde este post sai"
                                    >
                                      {daRede.map((a) => (
                                        <option key={a.id} value={a.id}>{rotulo(a)}</option>
                                      ))}
                                    </select>
                                  );
                                })()}
                                {publicado && url && (
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium shrink-0 hover:underline" style={{ color: "var(--text-muted)" }} onClick={(e) => e.stopPropagation()}>
                                    Ver
                                  </a>
                                )}
                                {/* LEVAR PARA OUTRA REDE, só no post que já saiu.
                                    Antes disto, o post que foi bem numa rede só
                                    chegava a outra por copiar e colar, que é o
                                    trabalho que a plataforma existe para tirar.
                                    Só aparecem as contas que ainda não têm a peça
                                    deste dia: oferecer o que já existe é oferecer
                                    duplicata. */}
                                {publicado && (() => {
                                  const jaTem = new Set(postsDoDia.map((q) => q.socialAccountId).filter(Boolean) as string[]);
                                  const destinos = socialAccounts.filter(
                                    (a) => !jaTem.has(a.id) && a.id !== p.socialAccountId && ["linkedin", "instagram", "facebook", "twitter"].includes(a.platform)
                                  );
                                  if (destinos.length === 0) return null;
                                  return (
                                    <select
                                      value=""
                                      disabled={levando !== null}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const alvo = destinos.find((a) => a.id === e.target.value);
                                        if (!alvo) return;
                                        void levarParaRede(p.id, alvo.id, alvo.displayName ?? nomeDaRede(alvo.platform));
                                        e.target.value = "";
                                      }}
                                      className="text-[10px] rounded-md border px-1.5 py-1 shrink-0 max-w-[150px]"
                                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                                      title="Levar este post para outra rede, adaptado, como rascunho"
                                    >
                                      <option value="">{levando === p.id ? "Adaptando…" : "Levar para…"}</option>
                                      {destinos.map((a) => (
                                        <option key={a.id} value={a.id}>
                                          {a.displayName ?? nomeDaRede(a.platform)} ({a.accountType === "organization" ? "página" : "perfil"})
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()}
                                {publicado && <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />}
                                {/* TIRAR DA FILA, e não arquivar: quem só quer
                                    adiar não deveria precisar perder a peça. */}
                                {naFila && (
                                  <button
                                    type="button"
                                    disabled={approving}
                                    title={`Cancelar o agendamento de ${nomeDaRede(p.platform)}`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void cancelarAgendamento(p); }}
                                    className="flex items-center gap-1 px-1.5 py-1 rounded-md shrink-0 text-[10px] font-medium transition-all hover:bg-orange-500/10 hover:text-orange-400 disabled:opacity-40"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Tirar da fila
                                  </button>
                                )}
                                {/* REFAZER ESTA PEÇA (21/09), e não a campanha.
                                    Mora AQUI, na linha da peça, e não lá embaixo
                                    ao lado de "Arquivar campanha": foi a vizinhança
                                    que fez "Recomeçar com tema" parecer o que ele
                                    não era. O custo vai no rótulo, porque refazer
                                    é entrega nova e cobra de novo. */}
                                {/* Arquivado fica de fora: ele saiu da fila por
                                    decisão do cliente, e refazer o traria de volta
                                    como rascunho sem que ninguém tenha pedido a
                                    peça de volta. Reprovado ENTRA, porque recusar
                                    e mandar refazer é o caminho natural. */}
                                {!publicado && !arquivado && (
                                  <button
                                    type="button"
                                    disabled={approving || refazendo === p.id}
                                    title={`Escrever de novo a peça de ${nomeDaRede(p.platform)}, do zero, e refazer a arte dela. Custa ${custoDeRefazer(p)} créditos.`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void refazerUmaPeca(p); }}
                                    className="flex items-center gap-1 px-1.5 py-1 rounded-md shrink-0 text-[10px] font-medium transition-all hover:bg-orange-500/10 hover:text-orange-400 disabled:opacity-40"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <RefreshCw className={cn("w-3 h-3", refazendo === p.id && "animate-spin")} />
                                    {refazendo === p.id ? "Refazendo…" : `Refazer · ${custoDeRefazer(p)}`}
                                  </button>
                                )}
                                {!publicado && !arquivado && (
                                  <button
                                    type="button"
                                    disabled={approving}
                                    title={`Arquivar o post de ${nomeDaRede(p.platform)}`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void arquivarPost(p); }}
                                    className="flex items-center gap-1 px-1.5 py-1 rounded-md shrink-0 text-[10px] font-medium transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                    {/* Na linha que falhou o rótulo aparece: só o ícone
                                        não foi achado pelo Bruno (01/10). */}
                                    {p.status === "failed" ? "Arquivar" : null}
                                  </button>
                                )}
                                {/* A VOLTA do arquivar, na mesma linha (01/10). */}
                                {arquivado && (
                                  <button
                                    type="button"
                                    data-desarquivar
                                    disabled={approving}
                                    title={`Trazer de volta o post de ${nomeDaRede(p.platform)}, como rascunho`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void desarquivarPost(p); }}
                                    className="flex items-center gap-1 px-1.5 py-1 rounded-md shrink-0 text-[10px] font-medium transition-all hover:bg-orange-500/10 hover:text-orange-400 disabled:opacity-40"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Desarquivar
                                  </button>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-2 gap-2 p-3" style={{ background: "var(--bg-elevated)" }}>
                          <Button
                            size="sm"
                            className="text-xs"
                            disabled={marcados.length === 0}
                            loading={approving}
                            onClick={() => void publicarAgoraMarcados()}
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Publicar agora{marcados.length > 0 ? ` (${marcados.length})` : ""}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={marcados.length === 0 || approving}
                            onClick={() => void deixarAgendadoMarcados()}
                          >
                            <AlarmClock className="w-3.5 h-3.5" />
                            Deixar agendado{marcados.length > 0 ? ` (${marcados.length})` : ""}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ── Ações secundárias — visíveis mesmo quando rejeitado ── */}
                    <div className="space-y-2">
                      {/* Linha 1: Recomeçar */}
                      {onRestartWithTopic && (
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleRestartCampaign()}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all hover:border-orange-500/40 hover:bg-orange-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
                          {/* O NOME DIZ O QUE ELE FAZ (21/09). Chamava-se
                              "Recomeçar com tema" e abria a janela de campanha
                              NOVA, de sete dias, com o tema preenchido: quem
                              queria trocar uma peça pedia uma semana inteira.
                              Trocar uma peça agora é o "Refazer" da linha dela. */}
                          Gerar campanha nova com este tema
                        </button>
                      )}

                      {/* Linha 3: Arquivar campanha + Cancelar agendamento */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleArchiveCampaign()}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-zinc-500/40 hover:bg-zinc-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Archive className="w-3 h-3" />
                          Arquivar campanha
                        </button>
                        <button
                          type="button"
                          disabled={approving}
                          onClick={() => void handleCancelSchedule()}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all hover:border-red-500/40 hover:bg-red-500/5 disabled:opacity-50"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          <Ban className="w-3 h-3 text-red-400" />
                          Cancelar agendamento
                        </button>
                      </div>
                    </div>

                    {/* ── Rejeitar ── */}
                    {localCard.status === "pending" && (
                      <div className="space-y-2">
                        <AnimatePresence>
                          {showRejectForm && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="rounded-xl border p-3 space-y-2"
                              style={{ background: "var(--bg-primary)", borderColor: "rgba(245,158,11,0.3)" }}
                            >
                              <div className="flex items-center gap-2 text-sm text-amber-400">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                <span className="font-medium">
                                  {/* O alcance dito antes do clique, e não depois: quem
                                      marcou uma peça reprova uma peça. */}
                                  {alcanceReprovacao.porMarcacao
                                    ? `Motivo da reprovação de ${alcanceReprovacao.alvos.length === 1 ? nomeDaRede(alcanceReprovacao.alvos[0].platform) : `${alcanceReprovacao.alvos.length} posts marcados`}`
                                    : "Motivo da reprovação do dia inteiro"}
                                </span>
                              </div>
                              <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="Ex: sem imagem, tom muito formal, dados sem fonte, fora do nicho..."
                                className="w-full text-sm px-3 py-2 rounded-xl border outline-none resize-none"
                                style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                              />
                              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                O feedback ajuda a IA a melhorar as próximas campanhas.
                              </p>
                              <div className="flex gap-2">
                                <Button size="sm" variant="destructive" className="flex-1" onClick={() => void handleRejectFlow()} loading={approving}>
                                  <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                                  {rotuloDaReprovacao(alcanceReprovacao, nomeDaRede)}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason(""); }}>
                                  Cancelar
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        {!showRejectForm && (
                          <button
                            type="button"
                            disabled={approving}
                            onClick={() => void handleRejectFlow()}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all hover:border-red-500/40 hover:bg-red-500/5 disabled:opacity-50"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
                            {/* O rótulo diz o alcance: marcou uma peça, reprova uma
                                peça; não marcou nada, reprova o dia e avisa. */}
                            {rotuloDaReprovacao(alcanceReprovacao, nomeDaRede)}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Chat / AI adjustment */}
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
                {localCard.cardType === "video_clip" && (
                  <span className="flex flex-wrap gap-1.5 mr-2">
                    {/* O VÍDEO também se ajusta por aqui (30/09): os atalhos mostram
                        que dá, além do texto do post. */}
                    {["Tirar a parte em que eu repito", "Terminar uma frase antes", "Sem efeito nos primeiros 10 segundos", "Trocar o título", "Encurtar o texto"].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setChatMsg(a)}
                        className="text-[11px] px-2 py-1 rounded-full border transition-colors hover:border-orange-500/50"
                        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                      >
                        {a}
                      </button>
                    ))}
                  </span>
                )}
                                {isMedia ? "Regenerar mídia via IA" : "Ajustar via IA"}
              </p>
              {/* "Voltar à edição" (30/09): o vídeo inteiro (cortes e completo)
                  reaberto na tela de roteiro, para quem prefere ver tudo de uma
                  vez em vez de pedir pelo chat. Link comum: a tela é do servidor. */}
              {localCard.cardType === "video_clip" && (localCard.metadata as { videoJobId?: string } | null)?.videoJobId && (
                <a
                  href={`/projects/${projectId}/video/${(localCard.metadata as { videoJobId: string }).videoJobId}/roteiro?editar=1`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400 hover:underline"
                >
                  <Pencil className="w-3 h-3" />
                  Voltar à edição do vídeo: palavras, começo e fim dos cortes, cenas
                </a>
              )}
              {isMedia && !localCard.mediaUrl && (
                <div className="text-xs rounded-xl px-3 py-2 flex items-start gap-2 border border-blue-500/20 bg-blue-500/5">
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span style={{ color: "var(--text-muted)" }}>
                    Digite abaixo como quer a imagem (estilo, cores, composição) e pressione Enter: a Diana vai gerar a imagem agora.
                  </span>
                </div>
              )}

              {localCard.chatHistory?.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {localCard.chatHistory.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-xs px-3 py-2 rounded-xl leading-relaxed",
                        m.role === "user" ? "ml-6 bg-orange-500/10 text-orange-300" : "mr-6"
                      )}
                      style={m.role === "assistant" ? { background: "var(--bg-elevated)", color: "var(--text-primary)" } : undefined}
                    >
                      <span className="font-medium opacity-60 text-[10px] block mb-0.5">{m.role === "user" ? "Você" : localCard.agentName}</span>
                      {m.content}
                    </div>
                  ))}
                </div>
              )}

              {/* Carousel slide context indicator */}
              {isMedia && localCard.mediaUrl?.includes("|") && (
                <div className="flex items-center gap-1.5 text-xs px-1" style={{ color: "var(--text-muted)" }}>
                  <LayoutGrid className="w-3 h-3" />
                  Pedido de ajuste afetará o slide {currentSlide + 1} selecionado
                </div>
              )}

              <div className="flex gap-2">
                <input
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  placeholder={
                    isMedia && localCard.mediaUrl?.includes("|")
                      ? `Ajustar slide ${currentSlide + 1}: mude a composição, cor, estilo...`
                      : isMedia
                      ? "Mude as cores, estilo, composição... (vai regerar a imagem)"
                      : localCard.cardType === "video_clip" && (localCard.metadata as { videoJobId?: string } | null)?.videoJobId
                      ? "Ex.: termine depois de “ferramentas”, tire a parte em que eu repito, tire a imagem da cena de 0:12"
                      : "Melhore o tom, ajuste o CTA, torne mais provocativo..."
                  }
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                />
                <Button onClick={sendChat} loading={chatLoading} disabled={!chatMsg.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── Publish Success Overlay ── */}
          <AnimatePresence>
            {publishResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6 rounded-2xl"
                style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="w-full max-w-md space-y-4"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
                      style={{ background: "rgba(34,197,94,0.2)", border: "2px solid rgb(34,197,94)" }}>
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Publicado com sucesso!</h3>
                    <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                      Seu conteúdo está no ar
                    </p>
                  </div>

                  <div className="space-y-3">
                    {publishResult.map((r, i) => (
                      <div key={i} className="rounded-xl p-4 space-y-2"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center gap-2">
                          <RedeIcone plataforma={r.platform} className="w-4 h-4 shrink-0" />
                          <span className="font-semibold text-white text-sm">{r.accountName}</span>
                        </div>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Publicado em {new Date(r.publishedAt).toLocaleDateString("pt-BR", {
                            day: "2-digit", month: "long", year: "numeric",
                          })} às {new Date(r.publishedAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-80"
                            style={{ background: "var(--accent-orange)", color: "white" }}
                          >
                            <Globe className="w-3 h-3" /> Ver post publicado
                          </a>
                        ) : (
                          <p className="text-xs text-amber-400">Link não disponível: verifique diretamente na plataforma.</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => { setPublishResult(null); onClose(); }}
                  >
                    Fechar
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ContentManager({ projectId, projectName, initialCards, activeRun, lastFailedRun, socialAccounts, videos, videoEstilo, videoMusica, videoTermos, videoSemana, postFrequency, postsDaSemana, falhasDaMontagem }: ContentManagerProps) {
  const [selectedMonday, setSelectedMonday] = useState<Date>(getMonday(new Date()));
  const [cards, setCards] = useState<CampaignCard[]>(initialCards);
  const [postsSemana, setPostsSemana] = useState<PostParaEstado[]>(postsDaSemana ?? []);
  // A campanha da semana, com o registro: é dele que sai o andamento de cada
  // dia no calendário (28/09). A rota de status já mandava, e a tela ignorava.
  const [runDaSemana, setRunDaSemana] = useState<{ status: string; logs: unknown } | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(activeRun?.status === "running" ? activeRun.id : null);
  const [generating, setGenerating] = useState(activeRun?.status === "running");
  const [showSetupModal, setShowSetupModal] = useState(false);
  // A tela das duas portas, que aparece ao terminar o setup. Depois de
  // escolhida, a janela abre ja na porta certa (origemDoModal) e nao pergunta
  // de novo.
  const [primeiraCampanha, setPrimeiraCampanha] = useState(false);
  const [origemDoModal, setOrigemDoModal] = useState<"video" | "tema" | undefined>(undefined);
  /**
   * O painel de envio nasce aberto para quem nunca subiu gravação neste
   * projeto: sem isto, quem chega num quadro vazio não tem por onde começar, e
   * a tela que ensinava isso saiu de cena em 02/09. Quem já subiu uma vez sabe
   * o caminho, e o botão "Nova gravação" fica no cabeçalho.
   */
  // Aberto sozinho SO num projeto vazio de verdade: sem gravacao E sem card.
  // Ate 09/09 bastava nao ter video, entao quem gerava a semana por TEMA
  // terminava com o squad trabalhando e um painel de "envie a gravacao" aberto
  // por cima, como se a campanha nao tivesse acontecido.
  // Fechado enquanto uma campanha estiver rodando, corrigido em 13/09. O
  // painel abria para todo projeto sem vídeo e sem card, e um projeto cuja
  // campanha por TEMA acabou de começar é exatamente isso: zero card ainda,
  // zero vídeo. Resultado que o Bruno viu: "vai nessa tela de vídeo e a squad
  // fica trabalhando sozinha lá embaixo", com o planejador da semana do vídeo
  // perguntando de novo dia e formato que a janela da campanha já tinha
  // perguntado. O painel só deve aparecer quando a origem é vídeo.
  const [enviarAberto, setEnviarAberto] = useState(
    videos.length === 0 && initialCards.length === 0 && activeRun?.status !== "running"
  );
  const [menuAberto, setMenuAberto] = useState(false);
  const [gravacoesEnviadas, setGravacoesEnviadas] = useState(0);
  const [comecarNoVideo, setComecarNoVideo] = useState(false);
  const [videosAoVivo, setVideosAoVivo] = useState<VideoAoVivo[]>(videos);
  const [corteGuardadoAberto, setCorteGuardadoAberto] = useState<
    { videoId: string; corte: CorteGuardado } | null
  >(null);

  // Quem acabou de ativar o projeto chega aqui com ?novaCampanha=1 e a escolha
  // de origem (vídeo ou tema) abre sozinha. Sem isto a pessoa termina o
  // assistente e cai num quadro vazio, tendo que procurar por onde começar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // A ABA CRIAR (29/09) manda a porta já escolhida: ?abrir=video abre a
    // jornada do vídeo no passo seguinte à escolha, ?abrir=tema abre a janela
    // do tema. A escolha foi feita lá; perguntar de novo aqui seria pedágio.
    const abrir = params.get("abrir");
    if (abrir === "video") {
      setComecarNoVideo(true);
      setEnviarAberto(true);
    } else if (abrir === "tema") {
      setOrigemDoModal("tema");
      setShowSetupModal(true);
    }
    if (params.get("novaCampanha") === "1") setPrimeiraCampanha(true);
    if (!abrir && params.get("novaCampanha") !== "1") return;
    const limpa = new URL(window.location.href);
    limpa.searchParams.delete("novaCampanha");
    limpa.searchParams.delete("abrir");
    window.history.replaceState({}, "", limpa.toString());
  }, []);
  // Topic flow state
  const [topic, setTopic] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState<Array<{ title: string; description: string; format: string }>>([]);
  const [modalCard, setModalCard] = useState<CampaignCard | null>(null);
  const [modalAgentRow, setModalAgentRow] = useState<typeof AGENT_ROWS[0] | null>(null);
  // A ficha do agente aberta a partir do escritorio, com o que ele esta
  // fazendo no momento do clique.
  const [fichaAberta, setFichaAberta] = useState<{ id: string; fala: string | null } | null>(null);

  const weekStartIso = toIsoDate(selectedMonday);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // pendingConfig is set by the modal; startCampaign uses it + topic
  const [pendingConfig, setPendingConfig] = useState<CampaignConfig | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedRuns, setArchivedRuns] = useState<
    Array<{ id: string; topic: string | null; weekStart: string | null; startedAt: string }>
  >([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [restoreRunId, setRestoreRunId] = useState<string | null>(null);
  const [restoreWeekStart, setRestoreWeekStart] = useState("");
  const [restoreDays, setRestoreDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [restoring, setRestoring] = useState(false);
  // A confirmação de "Arquivar as falhas desta semana", dentro do próprio menu.
  const [confirmarFalhas, setConfirmarFalhas] = useState(false);
  // Persist dismissed state in localStorage keyed by run ID so it survives page reloads
  const DISMISSED_KEY = lastFailedRun ? `banner-dismissed-${lastFailedRun.id}` : null;
  const [failedBannerDismissed, setFailedBannerDismissed] = useState<boolean>(() => {
    if (!lastFailedRun) return true;
    try { return localStorage.getItem(`banner-dismissed-${lastFailedRun.id}`) === "1"; } catch { return false; }
  });

  function dismissFailedBanner() {
    setFailedBannerDismissed(true);
    if (DISMISSED_KEY) {
      try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
    }
  }

  // Os posts que falharam na semana aberta (01/10): a lista do menu de três pontos.
  const falhasDaSemana = postsSemana.filter((p) => p.status === "failed");
  const nomeDaRede = (plat: string) =>
    ({ linkedin: "LinkedIn", twitter: "X", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" } as Record<string, string>)[plat] ?? plat;

  const loadCardsForWeek = useCallback(async (mondayIso: string) => {
    setLoadingCards(true);
    try {
      const res = await fetch(`/api/pipeline/status?projectId=${projectId}&weekStart=${mondayIso}`);
      const data = await res.json();
      setCards(data.cards ?? []);
      setPostsSemana(data.posts ?? []);
      setRunDaSemana(data.run ? { status: data.run.status, logs: data.run.logs } : null);
    } catch {
      // silent
    } finally {
      setLoadingCards(false);
    }
  }, [projectId]);

  // Load on week change
  useEffect(() => {
    loadCardsForWeek(weekStartIso);
  }, [weekStartIso, loadCardsForWeek]);

  // O andamento de cada dia, e se ainda há algo andando (um vídeo refeito
  // anda depois do fecho da campanha, e a tela precisa continuar olhando).
  const andamento = useMemo(
    () => (runDaSemana ? andamentoDosDias(runDaSemana.logs, runDaSemana.status) : {}),
    [runDaSemana]
  );
  const algoAndando = Object.values(andamento).some((a) => a.fase === "video");

  // Real-time polling while pipeline is running
  useEffect(() => {
    if (!generating && !algoAndando) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    pollingRef.current = setInterval(() => {
      loadCardsForWeek(weekStartIso);
    }, 4000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [generating, algoAndando, weekStartIso, loadCardsForWeek]);

  function prevWeek() { setSelectedMonday((d) => addDays(d, -7)); }
  function nextWeek() { setSelectedMonday((d) => addDays(d, 7)); }
  function goToThisWeek() { setSelectedMonday(getMonday(new Date())); }

  async function suggestTopics() {
    setLoadingTopics(true);
    setSuggestedTopics([]);
    try {
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuggestedTopics(data.topics ?? []);
    } catch {
      toast.error("Erro ao buscar sugestões.");
    } finally {
      setLoadingTopics(false);
    }
  }

  /**
   * "Nova campanha" abre a JORNADA, e a jornada começa perguntando a origem.
   *
   * Até 18/09 este botão abria direto a janela do TEMA, e a porta do vídeo só
   * existia num botão separado no cabeçalho. Ou seja: a escolha entre as duas
   * origens, que é a primeira pergunta da campanha, estava resolvida de fora
   * pelo botão que a pessoa clicasse. Quem clicasse em "Nova campanha" nem
   * ficava sabendo que dava para partir de uma gravação.
   *
   * Agora é um caminho só, e ele pergunta. A janela do tema continua existindo
   * e é para onde o passo 1 encaminha quem escolhe tema.
   */
  function openNewCampaign() {
    setOrigemDoModal(undefined);
    setEnviarAberto(true);
  }

  async function openArchive() {
    setArchiveOpen(true);
    setRestoreRunId(null);
    setLoadingArchive(true);
    try {
      const res = await fetch(`/api/pipeline/runs?projectId=${projectId}&archivedOnly=true`);
      const data = await res.json();
      setArchivedRuns(data.runs ?? []);
    } catch {
      toast.error("Erro ao carregar arquivo.");
    } finally {
      setLoadingArchive(false);
    }
  }

  async function fillLastTopic() {
    try {
      const res = await fetch(`/api/pipeline/runs?projectId=${projectId}`);
      const data = await res.json();
      const run = (data.runs as Array<{ topic: string | null }> | undefined)?.find((r) => r.topic);
      if (run?.topic) {
        setTopic(run.topic);
        setShowTopicInput(true);
        setSuggestedTopics([]);
        toast.success("Tema carregado: ajuste se quiser e configure a campanha.");
      } else {
        toast.error("Nenhuma campanha com tema encontrada.");
      }
    } catch {
      toast.error("Erro ao buscar tema.");
    }
  }

  /**
   * ARQUIVAR POSTS COM FALHA (01/10, pedido do Bruno: "os posts que falham, eu
   * não consigo arquivar, preciso conseguir, para limpar o gestor"). Uma
   * chamada só (`/api/posts/em-massa`, que também esconde do quadro o dia que
   * ficou sem post vivo), sem caixa de confirmação do navegador porque tem
   * volta: o toast oferece "Desfazer" e a aba Arquivados de Posts devolve o
   * post como rascunho.
   */
  async function arquivarPostsComFalha(ids: string[]) {
    if (!ids.length) return;
    try {
      const res = await fetch("/api/posts/em-massa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, acao: "arquivar" }),
      });
      const d = (await res.json().catch(() => ({}))) as { feitos?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? "erro");
      await loadCardsForWeek(weekStartIso);
      const n = d.feitos ?? ids.length;
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            {n === 1 ? "Post com falha arquivado." : `${n} posts com falha arquivados.`}
            <button
              type="button"
              className="rounded-md border px-2 py-0.5 text-xs font-semibold"
              onClick={async () => {
                toast.dismiss(t.id);
                const volta = await fetch("/api/posts/em-massa", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids, acao: "rascunho" }),
                }).catch(() => null);
                if (volta?.ok) toast.success(n === 1 ? "O post voltou como rascunho." : "Os posts voltaram como rascunho.");
                else toast.error("Não consegui desfazer. Use Posts, aba Arquivados.");
                await loadCardsForWeek(weekStartIso);
              }}
            >
              Desfazer
            </button>
          </span>
        ),
        { duration: 8000 }
      );
    } catch {
      toast.error("Não consegui arquivar agora. Tente de novo.");
    }
  }

  async function handleArchiveWeek() {
    // Collect unique runIds from all cards visible in the current week
    const runIds = [...new Set(weekCards.map((c) => c.runId).filter(Boolean))] as string[];
    if (runIds.length === 0) {
      toast("Nenhuma campanha para arquivar nesta semana.");
      return;
    }
    const plural = runIds.length > 1 ? `${runIds.length} campanhas` : "1 campanha";
    if (!window.confirm(`Arquivar ${plural} desta semana? Elas saem do quadro e ficam disponíveis em "Arquivo" para restaurar depois.`)) return;

    try {
      await Promise.all(
        runIds.map((id) =>
          fetch(`/api/pipeline/runs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archiveWeek: true, weekStart: weekStartIso }),
          })
        )
      );
      toast.success(`${plural} arquivada${runIds.length > 1 ? "s" : ""}.`);
      dismissFailedBanner();
      await loadCardsForWeek(weekStartIso);
    } catch {
      toast.error("Erro ao arquivar.");
    }
  }

  async function cancelGeneration() {
    if (!runningPipelineId) return;
    if (!window.confirm("Cancelar a geração da campanha? Os posts já criados serão mantidos, mas a IA vai parar agora.")) return;
    try {
      const res = await fetch(`/api/pipeline/runs/${runningPipelineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Erro ao cancelar.");
        return;
      }
      setGenerating(false);
      setRunningPipelineId(null);
      toast.success("Geração cancelada. Os posts gerados até agora foram salvos.");
      await loadCardsForWeek(weekStartIso);
    } catch {
      toast.error("Erro ao cancelar.");
    }
  }

  function toggleRestoreDay(d: number) {
    setRestoreDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  async function submitRestore() {
    if (!restoreRunId || !restoreWeekStart) {
      toast.error("Escolha a semana e pelo menos um dia.");
      return;
    }
    if (restoreDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana.");
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch(`/api/pipeline/runs/${restoreRunId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archived: false,
          weekStart: restoreWeekStart,
          activeDays: restoreDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast.success("Campanha restaurada no quadro.");
      setArchiveOpen(false);
      setRestoreRunId(null);
      await loadCardsForWeek(weekStartIso);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao restaurar.");
    } finally {
      setRestoring(false);
    }
  }

  function handleTopicConfirmed() {
    // Open campaign config modal directly (topics are now configured per-day inside the modal)
    setShowSetupModal(true);
  }

  async function startCampaign(config: CampaignConfig) {
    setShowSetupModal(false);
    setShowTopicInput(false);
    setSuggestedTopics([]);

    const finalConfig: CampaignConfig = { ...config, weekStart: weekStartIso };

    // Derive a global topic summary from per-day topics (used for Roberto's research context)
    const derivedTopic = topic.trim() ||
      Object.values(finalConfig.topicsPerDay ?? {}).filter(Boolean).join(", ") ||
      "conteúdo relevante para o nicho";

    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, topic: derivedTopic, campaignConfig: finalConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRunningPipelineId(data.run.id);
      setGenerating(true);
      setPendingConfig(null);
      // A semana vai nascer de tema: o painel de gravacao sai da frente.
      setEnviarAberto(false);
      toast.success("Campanha iniciada!");
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : "tente novamente"}`);
    }
  }

  function handleSetupConfirm(config: CampaignConfig) {
    // Modal closed — start campaign immediately (topic is already set)
    setPendingConfig(config);
    startCampaign(config);
  }

  function handleOpenModal(card: CampaignCard, agentRow: typeof AGENT_ROWS[0]) {
    // Card virtual não existe no banco: mandá-lo para o modal normal faria a
    // tela buscar um id que ninguém tem. O corte guardado abre a sua própria
    // janela, que é curta porque a única decisão dele é ir ao ar ou não.
    const meta = card.metadata as { virtual?: string; videoId?: string; corte?: CorteGuardado } | null;
    if (meta?.virtual === "guardado" && meta.videoId && meta.corte) {
      setCorteGuardadoAberto({ videoId: meta.videoId, corte: meta.corte });
      return;
    }
    // O completo a caminho não tem card ainda; o clique precisa responder
    // alguma coisa, e o que há para dizer é que o squad está nele (29/09).
    if (meta?.virtual) {
      toast("O Vitor ainda está editando o vídeo completo. Ele aparece aqui para você aprovar quando ficar pronto.");
      return;
    }
    setModalCard(card);
    setModalAgentRow(agentRow);
  }

  function handleCardUpdate(updatedCard: CampaignCard) {
    setCards((prev) => prev.map((c) => c.id === updatedCard.id ? updatedCard : c));
    setModalCard(updatedCard);
  }

  const todayIso = toIsoDate(new Date()); // UTC date of today
  // A data de hoje em Sao Paulo, no formato YYYY-MM-DD do `toIsoDate`.
  const hojeEmSaoPaulo = new Date().toLocaleDateString("en-CA", { timeZone: FUSO_PADRAO });

  /** A linha do agente que assina o card, para o modal, que exige as duas coisas. */
  function linhaDoAgente(card: CampaignCard) {
    return (
      AGENT_ROWS.find((r) => r.agentId === (card.agentId === "tiago-twitter" ? "xavier-x" : card.agentId)) ??
      AGENT_ROWS.find((r) => r.cardType === card.cardType) ??
      (card.cardType === "video_completo" ? AGENT_ROWS.find((r) => r.agentId === "vitor-video")! : AGENT_ROWS[0])
    );
  }

  const aoTerminarRun = useCallback(() => {
    setGenerating(false);
    toast.success("Campanha gerada! Cards atualizados.");
    void loadCardsForWeek(weekStartIso);
    setRunningPipelineId(null);
  }, [loadCardsForWeek, weekStartIso]);

  const aoFalharRun = useCallback(() => {
    setGenerating(false);
    setRunningPipelineId(null);
    toast.error("Erro ao gerar campanha.");
  }, []);
  const isCurrentWeek = toIsoDate(selectedMonday) === toIsoDate(getMonday(new Date()));

  // Filter cards for the selected week
  const weekCardsDoBanco = cards.filter((c) => {
    if (!c.scheduledDate) return false;
    const dIso = toIsoDate(new Date(c.scheduledDate));
    const start = weekStartIso;
    const end = toIsoDate(addDays(selectedMonday, 6));
    return dIso >= start && dIso <= end;
  });
  // AS PEÇAS CHEGAM UMA A UMA (30/09): o que já estava na tela aparece inteiro,
  // e o que o squad entrega depois entra em fila, uma a cada 1,2 s. Cinco
  // peças surgindo de uma vez não parecem trabalho, parecem carga de página.
  const weekCards = useUmaAUma(weekCardsDoBanco, (c) => c.id);

  /**
   * Os dois cards que o quadro precisa mostrar e o banco não tem.
   *
   * 1. O LUGAR DO VÍDEO COMPLETO, desde o minuto zero. Ele chega uns quinze
   *    minutos depois dos cortes, e em 02/09 o Bruno disse que ele "sumiu": não
   *    tinha sumido, ainda estava sendo montado, mas não havia nada no quadro
   *    dizendo isso. Um lugar guardado, com o tempo que falta, é o conserto.
   * 2. OS CORTES DESLIGADOS. Eles foram cortados, existem no storage e não têm
   *    card porque o quadro só mostra o que vai ao ar. Ficam aqui apagados,
   *    com um clique para mudar de ideia, em vez de virarem trabalho invisível.
   *
   * São virtuais de propósito: nascem do estado da gravação, não de linha no
   * banco. Card de verdade para algo que ainda não existe seria lixo para
   * limpar depois, e daria a impressão de peça pronta que não está pronta.
   */
  const cardsVirtuais: CampaignCard[] = isCurrentWeek
    ? videosAoVivo.flatMap((v) => {
        const doDia = (dia: number) => {
          const d = addDays(selectedMonday, dia - 1);
          d.setUTCHours(9, 0, 0, 0);
          return d.toISOString();
        };
        const lista: CampaignCard[] = [];

        if (!v.temCompleto && v.status !== "failed") {
          // O MESMO relógio da linha do tempo (02/10): medido e pelo alto, com
          // efeitos, abertura e revisão dentro (lib/media/linha-do-tempo.ts).
          // Antes era uma conta própria, de 1,15 min por minuto, que dizia
          // "Terminando agora" com a montagem de efeitos ainda pela frente.
          const ateOFim = faltamAteOFim(v, Date.now());
          const faltam = Math.max(1, Math.ceil(ateOFim.segundos / 60));
          // O completo de verdade cai no PRIMEIRO dia do plano (30/09), que é o
          // dia do envio, e não mais na segunda: o lugar guardado vai no mesmo
          // dia, senão ele pularia de segunda para quarta quando chegasse.
          const isoDoEnvio = new Date(v.criadoEm).toLocaleDateString("en-CA", { timeZone: FUSO_PADRAO });
          const isoDoCompleto = isoDoEnvio >= weekStartIso ? isoDoEnvio : hojeEmSaoPaulo;
          const diaDoCompleto = new Date(`${isoDoCompleto}T12:00:00.000Z`).getUTCDay() || 7;
          lista.push({
            id: `virtual-completo-${v.id}`,
            runId: "",
            agentId: "vitor-video",
            agentName: "Vitor Vídeo",
            dayOfWeek: diaDoCompleto,
            scheduledDate: doDia(diaDoCompleto),
            cardType: "video_clip",
            mediaType: "video",
            content:
              v.durationSec != null
                ? `A gravação de ${Math.round(v.durationSec / 60)} min editada, com capítulos, para o YouTube.`
                : "A gravação inteira editada, com capítulos, para o YouTube.",
            mediaUrl: null,
            status: "pending",
            postId: null,
            chatHistory: [],
            metadata: {
              virtual: "completo",
              videoId: v.id,
              rotulo: ateOFim.passou ? `Levando mais que o previsto; até ~${faltam} min` : `Chega em até ${faltam} min`,
            },
          });
        }

        for (const c of v.cortesGuardados ?? []) {
          lista.push({
            id: `virtual-guardado-${v.id}-${c.indice}`,
            runId: "",
            agentId: "vitor-video",
            agentName: "Vitor Vídeo",
            // O mesmo dia que ele ocuparia se fosse ligado, que é a conta de
            // reserva usada em `sincronizarQuadroDoVideo`.
            dayOfWeek: ((c.indice * 3) % 7) + 1,
            scheduledDate: doDia(((c.indice * 3) % 7) + 1),
            cardType: "video_clip",
            mediaType: "video",
            content: c.titulo,
            mediaUrl: null,
            status: "pending",
            postId: null,
            chatHistory: [],
            metadata: { virtual: "guardado", videoId: v.id, corte: c },
          });
        }
        return lista;
      })
    : [];

  const activeDays = DAYS;

  /**
   * Os sete cartões do calendário, montados aqui e não dentro do componente.
   *
   * O `SemanaDoQuadro` recebe dados prontos de propósito: ele desenha e não
   * sabe o que é card, post, run ou agente. Quem sabe cruzar essas quatro
   * coisas é esta tela.
   *
   * Desde 18/09 à noite o calendário mostra PEÇAS FINAIS, não cards da
   * esteira. Veredito do Bruno: "somente as peças prontas, finais, igual um
   * card do Trello, com data e hora prevista, se está aprovado, agendado,
   * publicado, rejeitado, e os símbolos das redes (perfis e páginas)".
   *
   * Uma peça é o CONTEÚDO DO DIA com todas as suas adaptações: o mesmo tema
   * sai como texto na página e no perfil do LinkedIn, no Facebook, no
   * Instagram, e como thread no X. Isso é UMA peça com cinco destinos. Só o
   * vídeo é peça à parte, porque é outro conteúdo.
   *
   * A thread do X ficou junto em 18/09 à noite. Separada, ela virava um
   * segundo card com a MESMA imagem, a MESMA hora e o mesmo tema, e foi o que
   * o Bruno leu como dois defeitos ao mesmo tempo: "a imagem está a mesma em
   * todos os posts" e "deveria ter gerado apenas um post no dia, gerou
   * vários". Os dados diziam o contrário dos dois: quatro imagens distintas,
   * uma por dia, e um conteúdo por dia em cinco contas. **O clone era da
   * tela, não da esteira.**
   */
  // Cada peça aponta para o card que a abre por inteiro (o mesmo modal de sempre).
  const cardDaPeca = new Map<string, CampaignCard>();
  // Os posts de cada peça, para abrir a peça que ficou SEM card (30/09): o
  // post publicado de uma campanha cujos cards foram apagados na limpeza do
  // quadro aparecia como "publicado" e o clique não fazia nada.
  const postsDaPeca = new Map<string, PostParaEstado[]>();
  const contaDoPost = (p: PostParaEstado) =>
    p.socialAccountId ? socialAccounts.find((a) => a.id === p.socialAccountId) : undefined;
  const DO_REDATOR = ["post_linkedin", "post_twitter", "video_clip", "video_completo"];
  const familiaDoPost = (p: PostParaEstado, card?: CampaignCard): { chave: string; tipo: string } => {
    if (card?.cardType === "video_completo") return { chave: `video:${card.id}`, tipo: "Vídeo completo" };
    if (card?.cardType === "video_clip" || p.platform === "youtube") return { chave: `corte:${card?.id ?? p.id}`, tipo: "Corte de vídeo" };
    return { chave: "post", tipo: "Post" };
  };
  const NOME_DO_DIA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  /** Um endereço de vídeo, para a tela não pendurar um mp4 dentro de `<img>`. */
  // A rota de mídia do vídeo (`/api/videos/[id]/midia?tipo=vertical`) também é
  // vídeo: ela não termina em .mp4, e era por isso que o card do corte e o do
  // completo desenhavam o MP4 como imagem quebrada (teste de 29/09).
  const ehVideo = (url: string) =>
    /\.(mp4|webm)(\?|$)/i.test(url) ||
    url.startsWith("data:video/") ||
    /\/api\/videos\/[^/]+\/midia\?.*tipo=(vertical|horizontal|completo)(&|$)/.test(url);
  const tituloDoCard = (c?: CampaignCard): string | null => {
    if (!c?.content) return null;
    const linha = c.content
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_`>]/g, "")
      .split("\n")
      // Marcador de seção do redator ("===LINKEDIN===") nunca vira título (29/09).
      .map((l) => l.replace(/^={2,}[^=\n]{0,40}={2,}\s*/, "").trim())
      .find((l) => l.length > 0 && !/^(post|thread|tweet)\b/i.test(l));
    if (!linha) return null;
    return linha.length > 90 ? `${linha.slice(0, 90)}…` : linha;
  };
  /**
   * Título da peça sem card de redator (sábado de 29/09: carrossel só com o
   * card da Diana, e a peça aparecia como "Post"). A primeira lâmina ou a
   * frase da arte dizem do que a peça trata; a descrição da Diana ("Imagem
   * com a frase", "Carrossel de 3 lâminas") não serve de título.
   */
  const tituloDaArte = (c?: CampaignCard, p?: PostParaEstado): string | null => {
    for (const meta of [c?.metadata, p?.metadata]) {
      const m = meta as { slides?: unknown; frase?: unknown } | null | undefined;
      const primeira = Array.isArray(m?.slides) ? m.slides.find((s): s is string => typeof s === "string" && s.trim().length > 0) : undefined;
      const frase = primeira ?? (typeof m?.frase === "string" ? m.frase : undefined);
      if (frase?.trim()) return frase.trim().length > 90 ? `${frase.trim().slice(0, 90)}…` : frase.trim();
    }
    if (c?.content && !/^(imagem com a frase|infogr[aá]fico com|carrossel de)/i.test(c.content.trim())) return tituloDoCard(c);
    return null;
  };
  const estadoDaPeca = (posts: PostParaEstado[], principal?: CampaignCard, emProducao = false): EstadoDaPeca => {
    const chaves = posts.map((p) => estadoDoPost(p).chave);
    if (chaves.includes("publicado")) return "publicado";
    if (chaves.includes("falhou")) return "falhou";
    if (chaves.includes("agendado") || chaves.includes("publicando")) return "agendado";
    if (principal?.status === "rejected") return "rejeitado";
    if (principal?.status === "approved") return "aprovado";
    // Ainda sendo feita: não há o que aprovar, e "esperando você" pedia
    // decisão sobre o que não existe (29/09).
    if (emProducao) return "fazendo";
    return "esperando";
  };
  /**
   * Os cards que PRODUZEM a peça (redator e Diana). Pesquisa, revisão e
   * publicação ficam de fora: o card do Roberto guarda `aguardando` mesmo
   * depois do briefing pronto, e ele não é peça.
   */
  const PRODUTORES = ["post_linkedin", "post_twitter", "media", "video_clip", "video_completo"];
  const FASES_DO_SQUAD = ["texto", "arte", "revisao", "video"];
  const ORDEM_DA_PECA = ["Post", "Corte de vídeo", "Vídeo completo"];

  const diasDoCalendario: DiaDaSemana[] = DAYS.map((day) => {
    const dayDate = addDays(selectedMonday, day.dayOfWeek - 1);
    const iso = toIsoDate(dayDate);
    const doDia = (c: CampaignCard) => Boolean(c.scheduledDate && toIsoDate(new Date(c.scheduledDate)) === iso);
    const cardsDoDia = weekCards.filter(doDia);
    const virtuaisDoDia = cardsVirtuais.filter(doDia);

    // O formato que o cliente escolheu para o dia, quando a semana veio de um
    // vídeo: mora no metadata dos cards de espera que o agendar cria (parte
    // 90). O corte do Vitor vale como "Vídeo".
    const formato =
      [...cardsDoDia, ...virtuaisDoDia]
        .map((c) => (c.metadata as { formatoRotulo?: string } | null)?.formatoRotulo)
        .find((r): r is string => typeof r === "string" && r.length > 0) ??
      ([...cardsDoDia, ...virtuaisDoDia].some((c) => c.cardType === "video_clip" || c.cardType === "video_completo")
        ? "Vídeo"
        : null);

    const postsDoDia = postsSemana.filter((p) =>
      p.scheduledAt
        ? toIsoDate(new Date(p.scheduledAt)) === iso
        : p.publishedAt
          ? toIsoDate(new Date(p.publishedAt)) === iso
          : false
    );

    // Agrupa os posts do dia em peças.
    const grupos = new Map<string, { tipo: string; posts: PostParaEstado[]; cards: CampaignCard[] }>();
    for (const p of postsDoDia) {
      const card = cardsDoDia.find((c) => c.postId === p.id);
      const { chave: familia, tipo } = familiaDoPost(p, card);
      // A hora entra na chave: a quinta empurrada para "agora" cai no mesmo
      // dia da sexta (visto em 18/09), e sao duas pecas, nao uma com oito
      // destinos repetidos.
      // A CAMPANHA também entra na chave (21/09): duas campanhas para a mesma
      // semana, publicando no mesmo horário, viravam UMA peça com nove
      // destinos, e os rascunhos novos sumiam dentro da peça agendada da
      // anterior. Ver chaveDaPeca em lib/posts/cards-da-peca.ts.
      const chave = chaveDaPeca(familia, p.runId, p.scheduledAt ? new Date(p.scheduledAt).toISOString() : "");
      const g = grupos.get(chave) ?? { tipo, posts: [], cards: [] };
      g.posts.push(p);
      if (card) g.cards.push(card);
      grupos.set(chave, g);
    }

    const pecas: PecaDoDia[] = [];
    for (const [chaveComHora, g] of grupos) {
      const chave = familiaDaChave(chaveComHora);
      const primeiro = g.posts[0];

      // "era de quinta": quando o horário do dia já tinha passado, a esteira
      // agenda para daqui a dez minutos, e a peça cai num dia que não é o
      // dela. Sem esta linha, o dia recebe duas peças e nada explica por quê.
      //
      // Desde 19/09 a comparação é entre DATAS, e não entre `dayOfWeek` e o
      // dia da semana do quadrado: a campanha começa na data escolhida, então
      // `dayOfWeek` é "dia k da campanha" e não "quinta". Comparar índices
      // carimbava "era de segunda" numa peça criada para a sexta.
      /**
       * OS CARDS QUE VALEM PARA ESTA PEÇA: do mesmo dia da campanha E da
       * MESMA CAMPANHA (21/09, segunda vez que este filtro precisou apertar).
       *
       * A primeira vez (19/09) filtrou por dia, porque a sexta mostrava a capa
       * da quinta empurrada. A segunda foi hoje: o Bruno gerou outra campanha
       * para a mesma semana, e a peça nova do dia 21 nasceu com a tarja
       * "rejeitado" e a imagem da campanha anterior, reprovada horas antes.
       * As duas campanhas têm `dayOfWeek === 1`, então o filtro por dia
       * deixava o card de publicação e o de mídia da antiga falarem pela nova.
       * A regra vive em lib/posts/cards-da-peca.ts, com prova.
       */
      // A peça que MUDOU DE DIA (30/09): o post de terça aprovado depois da
      // terça foi para quarta, mas os cards dele continuam na terça. Procurando
      // só nos cards de quarta, o clique dizia "ainda não tem card para abrir"
      // numa peça agendada para dali a 20 minutos. Com o dia e a campanha do
      // post conhecidos, a busca vai à semana inteira; sem eles, fica no dia.
      const sabeDeOnde = g.posts.some((p) => p.dayOfWeek != null && p.runId);
      const candidatos = cardsDaPeca(sabeDeOnde ? weekCards : cardsDoDia, g.posts);
      // `cardDeOrigem`, e não `cardDaPeca`: esse nome já é o Map que liga o id
      // da peça ao card principal, mais abaixo, e o tsc pegou a colisão.
      const cardDeOrigem = candidatos[0] ?? cardsDoDia[0];
      const dataDeOrigem = cardDeOrigem?.scheduledDate ? toIsoDate(new Date(cardDeOrigem.scheduledDate)) : null;
      const origem =
        dataDeOrigem && dataDeOrigem !== iso
          ? `era de ${NOME_DO_DIA[new Date(dataDeOrigem + "T12:00:00").getDay() || 7]}`
          : null;

      // O texto que titula a peça vem do redator do LinkedIn, que é o mais
      // longo; a thread do X do mesmo dia diz a mesma coisa em outro formato.
      const redator =
        g.cards.find((c) => c.cardType === "post_linkedin") ??
        g.cards.find((c) => DO_REDATOR.includes(c.cardType)) ??
        candidatos.find((c) => c.cardType === "post_linkedin");
      // O card que abre a peça: a publicação lista todos os destinos e as
      // ações de aprovar e publicar, então ela é a porta da peça de texto.
      const principal =
        (chave === "post" ? candidatos.find((c) => c.cardType === "publish") : undefined) ?? redator ?? g.cards[0];
      const id = `${iso}:${chaveComHora}`;
      if (principal) cardDaPeca.set(id, principal);
      postsDaPeca.set(id, g.posts);
      // A CAPA É A PRIMEIRA LÂMINA. O carrossel guarda as lâminas coladas com
      // "|" num campo só, e o `<img>` recebia a string inteira: imagem
      // quebrada em todo card de carrossel (o Bruno viu no sábado, 19/09).
      //
      // NO DIA DE VIDEO A MIDIA DO CARD E UM MP4 (desde 19/09, quando o
      // trabalho de video passou a atualizar o card da Diana). Um `<img>` com
      // src de mp4 e uma imagem quebrada, entao a capa vira o QUADRO que o
      // trabalho guardou em `metadata.thumb`; sem quadro, o calendario recebe
      // o proprio mp4 e desenha um `<video>`.
      const cardDaMidia = candidatos.find((c) => c.cardType === "media" && c.mediaUrl);
      const midiaDaCapa = redator?.mediaUrl ?? cardDaMidia?.mediaUrl ?? null;
      const bruta = midiaDaCapa ? midiaDaCapa.split("|")[0] : null;
      // O quadro vem do card do próprio corte (metadata.thumb, a capa do
      // Vitor) e, sem ele, do card da Diana.
      const quadroGuardado =
        (redator?.metadata as { thumb?: string | null } | null)?.thumb ??
        (cardDaMidia?.metadata as { thumb?: string | null } | null)?.thumb ??
        null;
      const capa = bruta && ehVideo(bruta) ? quadroGuardado ?? bruta : bruta;
      // O que o visor do calendário mostra ao clicar na capa (21/09): o vídeo
      // com controles, as lâminas do carrossel, ou a arte ampliada.
      const laminas = midiaDaCapa ? midiaDaCapa.split("|").filter((u) => u.trim().length > 10) : [];
      const midia =
        !bruta
          ? null
          : ehVideo(bruta)
            ? { tipo: "video" as const, urls: [bruta], poster: quadroGuardado }
            : laminas.length > 1
              ? { tipo: "carrossel" as const, urls: laminas }
              : { tipo: "imagem" as const, urls: [bruta] };

      /**
       * A ETIQUETA DO TIPO (21/09), montada com o que a peça tem de verdade.
       *
       * O tipo sai do post, e não do card: é o post que vai para a rede, e foi
       * ele que a esteira pode ter trocado no meio do caminho (o dia de vídeo
       * sem saldo vira imagem, que é o caminho de 19/09). As lâminas são
       * CONTADAS na mídia em vez de lidas da configuração, pelo mesmo motivo:
       * o cliente precisa ver o que existe, não o que foi pedido.
       */
      const etiqueta = etiquetaDaPeca({
        mediaType: primeiro.mediaType,
        laminas: laminas.length,
        segundos: (primeiro.metadata as { segundosDoVideo?: number } | null)?.segundosDoVideo ?? null,
        formato: formatoDoPost(primeiro.metadata, primeiro.platform),
      });

      pecas.push({
        id,
        titulo: tituloDoCard(redator) ?? tituloDaArte(cardDaMidia ?? g.cards.find((c) => c.cardType === "media"), primeiro) ?? g.tipo,
        tipo: g.tipo,
        etiqueta,
        hora: primeiro.scheduledAt ? horaCurta(new Date(primeiro.scheduledAt)) : null,
        quando: primeiro.scheduledAt ? new Date(primeiro.scheduledAt).getTime() : 0,
        origem,
        // Em produção: algum card que faz ESTA peça ainda está em espera ou
        // em revisão, ou o registro da campanha diz que o dia está no texto,
        // na arte, na revisão ou no vídeo agora.
        estado: estadoDaPeca(
          g.posts,
          principal,
          (chave === "post"
            ? candidatos.filter((c) => {
                if (!PRODUTORES.includes(c.cardType)) return false;
                if (c.postId) return g.posts.some((p) => p.id === c.postId);
                // Card de espera que SOBROU: o mesmo tipo de card já entregou
                // um post desta peça (visto na quinta 10/09, com a thread
                // pronta e um segundo card do Xavier ainda "escrevendo").
                return !candidatos.some((o) => o.cardType === c.cardType && o.postId && g.posts.some((p) => p.id === o.postId));
              })
            : g.cards
          ).some((c) => cardEmProducao(c)) ||
            FASES_DO_SQUAD.includes(andamento[day.dayOfWeek]?.fase ?? "")
        ),
        midia,
        destinos: [...g.posts]
          .sort((a, b) => ORDEM_DA_REDE.indexOf(a.platform) - ORDEM_DA_REDE.indexOf(b.platform))
          .map((p) => {
            const conta = contaDoPost(p);
            return {
              plataforma: p.platform,
              tipo: conta ? (conta.accountType === "organization" ? ("pagina" as const) : ("perfil" as const)) : null,
              nome: conta?.displayName ?? null,
            };
          }),
        capa,
      });
    }
    // Por hora, e depois por tipo: quem abre o dia quer ler de cima para baixo
    // na ordem em que as coisas saem.
    pecas.sort(
      (a, b) => (a.quando ?? 0) - (b.quando ?? 0) || ORDEM_DA_PECA.indexOf(a.tipo) - ORDEM_DA_PECA.indexOf(b.tipo)
    );

    // Os cortes guardados e o vídeo completo a caminho: peças sem post ainda,
    // que continuam visíveis para não sumirem do quadro (parte 87).
    for (const v of virtuaisDoDia) {
      cardDaPeca.set(v.id, v);
      const meta = v.metadata as { virtual?: string; rotulo?: string } | null;
      pecas.push({
        id: v.id,
        titulo: v.content ?? "Corte de vídeo",
        tipo: meta?.virtual === "completo" ? (meta.rotulo ?? "Vídeo completo") : "Corte de vídeo",
        hora: null,
        // O completo virtual é o vídeo que o Vitor ainda está editando: não
        // espera o cliente, espera o squad (29/09).
        estado: meta?.virtual === "guardado" ? "guardado" : "fazendo",
        destinos: [{ plataforma: "youtube", tipo: null, nome: null }],
        capa: null,
      });
    }

    /**
     * A PEÇA QUE AINDA NÃO TEM POST (29/09): o dia cujo redator ou a Diana
     * ainda estão no card de espera. Sem isto o dia ficava só com a faixa do
     * andamento (ou vazio, na semana de vídeo) e nada para abrir; agora ele
     * mostra a peça "o squad está fazendo", e o clique abre o card de espera,
     * que diz quem está fazendo o quê. Uma peça por campanha e dia, como as
     * peças prontas.
     */
    const esperaPorRun = new Map<string, CampaignCard[]>();
    for (const c of cardsDoDia) {
      if (!PRODUTORES.includes(c.cardType) || c.postId || !cardEmProducao(c)) continue;
      esperaPorRun.set(c.runId, [...(esperaPorRun.get(c.runId) ?? []), c]);
    }
    for (const [runId, espera] of esperaPorRun) {
      // A peça pronta da mesma campanha já responde pelo dia.
      if (postsDoDia.some((p) => p.runId === runId && familiaDoPost(p, cardsDoDia.find((c) => c.postId === p.id)).chave === "post")) continue;
      const redator = espera.find((c) => c.cardType !== "media") ?? espera[0];
      const id = `espera:${iso}:${runId}`;
      cardDaPeca.set(id, redator);
      const quando = redator.scheduledDate ? new Date(redator.scheduledDate) : null;
      pecas.push({
        id,
        titulo: tituloDoCard(redator) ?? "O squad está fazendo esta peça",
        tipo: "Post",
        hora: quando ? horaCurta(quando) : null,
        quando: quando?.getTime() ?? 0,
        estado: "fazendo",
        destinos: espera.some((c) => c.cardType === "post_twitter") ? [{ plataforma: "twitter", tipo: null, nome: null }] : [],
        capa: null,
      });
    }

    return {
      dayOfWeek: day.dayOfWeek,
      curto: day.short,
      // `dayDate` e meia-noite UTC: o `getDate()` local, em Sao Paulo, cai no
      // dia ANTERIOR (21h). Em 18/09 a segunda 14 apareceu como 13.
      numero: String(dayDate.getUTCDate()).padStart(2, "0"),
      // "Hoje" e o dia em que a pessoa esta, e ela esta em Sao Paulo. O UTC
      // vira o dia as 21h daqui, e as 22h de quinta a tela destacava a sexta.
      hoje: iso === hojeEmSaoPaulo,
      formato,
      pecas,
      andamento: andamento[day.dayOfWeek] ?? null,
    };
  });

  const proximaSaida = proximaPeca(postsSemana);

  /**
   * O que o escritorio recebe: as pecas da semana (reais e virtuais), so com o
   * que a situacao do squad precisa. O escritorio nao sabe o que e card.
   */
  const pecasDoSquad = [...weekCards, ...cardsVirtuais].map((c) => ({
    id: c.id,
    agentId: c.agentId,
    cardType: c.cardType,
    status: c.status,
    // Card de espera não conta como "peça esperando você" (29/09).
    emProducao: (c.metadata as { virtual?: string } | null)?.virtual === "completo" || cardEmProducao(c),
  }));

  const tituloDoEscritorio = generating
    ? "O squad esta trabalhando"
    : `Semana de ${diasDoCalendario[0]?.numero}/${String(selectedMonday.getUTCMonth() + 1).padStart(2, "0")}`;

  /**
   * Clicar no agente abre a FICHA dele: quem e, o que faz e os trabalhos
   * recentes. Cada trabalho da ficha abre o card completo, pelo mesmo modal.
   * (Ate 18/09 a tarde o clique abria direto a primeira peca; o Bruno pediu
   * a ficha.)
   */
  function abrirAgente(agentId: string, falaAtual: string | null = null) {
    setFichaAberta({ id: agentId, fala: falaAtual });
  }

  function abrirTrabalhoDaFicha(t: TrabalhoDoAgente) {
    setFichaAberta(null);
    const card = t as unknown as CampaignCard;
    handleOpenModal(card, linhaDoAgente(card));
  }

  return (
    <div className="w-full min-w-0 space-y-4 p-4 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {/* Rótulo mono em cima do título, o padrão da referência (01/10). */}
          <p className="rotulo mb-1.5">{projectName}</p>
          <h2 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>Gestor de Conteúdo</h2>
        </div>

        {/* `flex-wrap` porque são cinco controles numa linha: no computador
            cabem, num telefone de 390px empurravam a página inteira e criavam
            rolagem lateral (medido em 23/08: 532px numa janela de 390). */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button onClick={prevWeek} className="p-2 rounded-lg border transition-all hover:border-orange-500" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[130px] sm:min-w-[160px]">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatWeekLabel(selectedMonday)}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {isCurrentWeek ? "Semana atual" : `Semana ${Math.ceil((selectedMonday.getTime() - new Date(selectedMonday.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`}
            </p>
          </div>
          <button onClick={nextWeek} className="p-2 rounded-lg border transition-all hover:border-orange-500" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && (
            <button onClick={goToThisWeek} className="text-xs px-3 py-1.5 rounded-lg border transition-all" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Hoje
            </button>
          )}
          {/* UM BOTAO E UM MENU, desde 18/09.
              
              Eram CINCO controles disputando a mesma linha: Nova gravacao,
              Ultimo tema, Limpar semana, Arquivo e Nova campanha. Quatro deles
              sao usados uma vez por mes, e ficavam com o mesmo peso visual da
              acao que a pessoa vem fazer.
              
              "Nova gravacao" sumiu daqui de vez: virou a primeira porta da
              jornada, que e onde a pergunta "de onde vem o conteudo" faz
              sentido. Ter um botao so para video ao lado de "Nova campanha"
              era a propria escolha vazando para fora da jornada. */}
          {generating ? (
            <div className="flex items-center gap-2 ml-0 sm:ml-1">
              <Button disabled className="opacity-70 cursor-not-allowed">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </Button>
              <Button
                variant="outline"
                onClick={() => void cancelGeneration()}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
              >
                <X className="w-4 h-4" />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button onClick={openNewCampaign} className="ml-0 sm:ml-1" disabled={showTopicInput}>
              <Sparkles className="w-4 h-4" />
              Nova campanha
            </Button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuAberto((a) => !a)}
              aria-label="Mais opcoes"
              aria-expanded={menuAberto}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border transition-colors hover:border-orange-500 hover:text-orange-400"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuAberto && (
              <>
                {/* A cortina que fecha o menu ao clicar fora. Sem ela o menu
                    fica aberto atras do modal que ele mesmo abriu. */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
                <div
                  className="absolute right-0 z-20 mt-1.5 w-[210px] overflow-hidden rounded-xl border py-1 shadow-xl"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
                >
                  <button
                    onClick={() => { setMenuAberto(false); void fillLastTopic(); }}
                    disabled={generating}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--realce-1)] disabled:opacity-50"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                    Repetir o ultimo tema
                  </button>
                  <button
                    onClick={() => { setMenuAberto(false); void openArchive(); }}
                    disabled={generating}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--realce-1)] disabled:opacity-50"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <Archive className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                    Arquivo de campanhas
                  </button>
                  {weekCards.length > 0 && !generating && (
                    <button
                      onClick={() => { setMenuAberto(false); void handleArchiveWeek(); }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      <Archive className="h-3.5 w-3.5 shrink-0" />
                      Limpar esta semana
                    </button>
                  )}
                  {/* ARQUIVAR AS FALHAS DA SEMANA (01/10, pedido do Bruno: "para
                      limpar o gestor"). A confirmação é aqui mesmo, no menu,
                      com o número e as redes: sem a caixa do navegador. */}
                  {falhasDaSemana.length > 0 && !confirmarFalhas && (
                    <button
                      data-arquivar-falhas
                      onClick={() => setConfirmarFalhas(true)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-red-500/10"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      Arquivar as falhas desta semana
                    </button>
                  )}
                  {falhasDaSemana.length > 0 && confirmarFalhas && (
                    <div className="space-y-2 border-t px-3.5 py-2.5" style={{ borderColor: "var(--border)" }} data-confirmar-falhas>
                      <p className="text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
                        Arquivar {falhasDaSemana.length === 1 ? "1 post que falhou" : `${falhasDaSemana.length} posts que falharam`} (
                        {[...new Set(falhasDaSemana.map((p) => nomeDaRede(p.platform)))].join(", ")})?
                      </p>
                      <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        Eles saem do quadro e ficam em Posts, aba Arquivados, para voltar quando quiser.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          data-confirmar-falhas-sim
                          onClick={() => {
                            setMenuAberto(false);
                            setConfirmarFalhas(false);
                            void arquivarPostsComFalha(falhasDaSemana.map((p) => p.id));
                          }}
                          className="flex-1 rounded-lg bg-red-500/90 px-2 py-1.5 text-[12px] font-semibold text-white hover:bg-red-500"
                        >
                          Arquivar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarFalhas(false)}
                          className="flex-1 rounded-lg border px-2 py-1.5 text-[12px]"
                          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* O processo do vídeo, em tempo real, acima do quadro que ele preenche. */}
      <EsteiraDoVideo
        projectId={projectId}
        videosIniciais={videos}
        aoMudar={(frescos, statusMudou) => {
          setVideosAoVivo(frescos);
          if (statusMudou) void loadCardsForWeek(weekStartIso);
        }}
        sinalDeRecarga={gravacoesEnviadas}
      />

      {/* A montagem de efeitos que desistiu, dita com todas as letras e com a
          saída sem custo (01/10, parte 240). Fica logo abaixo da faixa do
          vídeo, que ainda diz "pronto" quando a edição de fala chegou. */}
      {falhasDaMontagem?.length ? (
        <AvisoDaMontagem falhas={falhasDaMontagem} aoPedir={() => void loadCardsForWeek(weekStartIso)} />
      ) : null}

      {/* A JORNADA, em janela e em passos, no lugar do painel que abria dentro
          da pagina com quatro formularios de uma vez. Ver
          components/posts/jornada-da-campanha.tsx para o porque. */}
      <JornadaDaCampanha
        aberto={enviarAberto}
        projectId={projectId}
        estilo={videoEstilo}
        musica={videoMusica}
        termos={videoTermos}
        semana={videoSemana}
        redesConectadas={socialAccounts.filter((a) => a.isActive !== false).map((a) => a.platform)}
        comecarNoVideo={comecarNoVideo}
        onFechar={() => {
          setEnviarAberto(false);
          setComecarNoVideo(false);
        }}
        onEnviado={() => {
          setEnviarAberto(false);
          setComecarNoVideo(false);
          setGravacoesEnviadas((n) => n + 1);
        }}
        onEscolherTema={() => {
          setOrigemDoModal("tema");
          setShowSetupModal(true);
        }}
      />

      {/* A tela cheia das duas portas saiu em 18/09: a escolha da origem passou
          a ser o PASSO 1 da jornada, que abre sempre, e nao so quando a URL
          trazia ?novaCampanha=1. Um caminho so, e ele nao depende de parametro
          de URL que o menu nao punha. */}
      <AnimatePresence>
        {false && primeiraCampanha && !generating && (
          <motion.div
            key="primeira-campanha"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border px-6 py-10"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <EscolhaDeOrigem
              variante="tela"
              onVideo={() => {
                setPrimeiraCampanha(false);
                setEnviarAberto(true);
              }}
              onTema={() => {
                setPrimeiraCampanha(false);
                setOrigemDoModal("tema");
                setShowSetupModal(true);
              }}
              // A porta do gêmeo aqui aparecia "em breve", sem clique (01/10).
              onGemeo={() => { window.location.href = `/projects/${projectId}/gemeo`; }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Failed / cancelled run banner */}
      <AnimatePresence>
        {!generating && lastFailedRun && !failedBannerDismissed && (
          <motion.div
            key="failed-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-300">
                {lastFailedRun.status === "cancelled" ? "Geração cancelada" : "Geração interrompida"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {lastFailedRun.status === "cancelled"
                  ? "Você cancelou a geração. Os posts já criados foram mantidos."
                  : "A geração parou (timeout, troca de aba ou erro). Os posts já criados foram mantidos. Você pode gerar novamente com o mesmo tema."}
                {lastFailedRun.topic ? <><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>Tema: {lastFailedRun.topic}</span></> : null}
              </p>
            </div>
            {lastFailedRun.status !== "cancelled" && lastFailedRun.topic && (
              <button
                onClick={() => {
                  setTopic(lastFailedRun.topic ?? "");
                  openNewCampaign();
                }}
                className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            )}
            {/* Dismiss button */}
            <button
              onClick={() => dismissFailedBanner()}
              title="Fechar"
              className="shrink-0 p-1 rounded-lg hover:bg-[var(--realce-2)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Topic input with AI suggestions (shown BEFORE campaign modal) */}
      <AnimatePresence>
        {showTopicInput && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border p-5 space-y-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o tema da campanha?</p>
              <button onClick={() => { setShowTopicInput(false); setSuggestedTopics([]); setTopic(""); }} style={{ color: "var(--text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none"
                style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                placeholder="Ex: O custo real de não automatizar processos em 2025..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && handleTopicConfirmed()}
                autoFocus
              />
              <Button variant="outline" onClick={suggestTopics} loading={loadingTopics} disabled={loadingTopics}>
                <Bot className="w-4 h-4" /> Sugerir
              </Button>
              <Button onClick={handleTopicConfirmed} disabled={!topic.trim()}>
                <Sparkles className="w-3.5 h-3.5" /> Configurar
              </Button>
            </div>

            {loadingTopics && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Buscando temas em alta para seu nicho...
              </div>
            )}

            {suggestedTopics.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Sugestões da IA, clique para usar:</p>
                {suggestedTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setTopic(t.title); setSuggestedTopics([]); }}
                    className="w-full text-left p-3 rounded-xl border hover:border-orange-500/40 hover:bg-orange-500/5 transition-all group"
                    style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium group-hover:text-orange-400 transition-colors" style={{ color: "var(--text-primary)" }}>{t.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded shrink-0 capitalize" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{t.format}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* O ESCRITORIO, um robo por agente.

          Quando a matriz virou calendario por dia (18/09), os agentes sumiram
          da tela e o Bruno disse na hora: "agora ficamos sem saber onde estao
          os agentes". Aqui eles voltam, na frente do calendario: quem esta com
          o bastao senta e trabalha, quem entregou fica de pe, e a passagem do
          bastao e um robo andando ate a mesa do outro. O escritorio ouve a
          esteira sozinho e avisa quando o run termina, no lugar da faixa
          antiga (`pipeline-live.tsx`). */}
      <Escritorio
        pecas={pecasDoSquad}
        runId={generating && runningPipelineId ? runningPipelineId : null}
        titulo={tituloDoEscritorio}
        projectId={projectId}
        onRunTerminou={aoTerminarRun}
        onRunFalhou={aoFalharRun}
        onAbrirAgente={abrirAgente}
        videos={videosAoVivo}
      />

      {/* A SEMANA, um cartao por dia.

          Substituiu em 18/09 uma matriz de SETE AGENTES por sete dias: 56
          celulas para responder "o que sai esta semana". O veredito do Bruno,
          olhando a propria tela depois de criar um projeto de verdade, foi que
          ela estava poluida.
          
          **Ninguem planeja a semana por agente.** O cliente nao pergunta "o que
          o Lucas LinkedIn fez", pergunta "o que sai na terca". Os agentes
          continuam assinando cada peca e aparecem ao abrir a peca, que e quando
          a pergunta sobre quem fez o que finalmente faz sentido. */}
      {/* A NAVEGAÇÃO DA SEMANA TAMBÉM AQUI (30/09): o plano do vídeo começa no
          dia do envio e atravessa para a semana seguinte, e as setas só
          existiam no topo, acima do escritório. O Bruno, olhando o quadro lá
          embaixo, não achou como ver o segundo corte, que caiu na terça 06/10. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={prevWeek}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-all hover:border-orange-500"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Semana anterior
        </button>
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          {formatWeekLabel(selectedMonday)}
          {!isCurrentWeek && (
            <button onClick={goToThisWeek} className="ml-2 underline font-normal" style={{ color: "var(--accent-orange)" }}>
              voltar para hoje
            </button>
          )}
        </p>
        <button
          onClick={nextWeek}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-all hover:border-orange-500"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Próxima semana <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <SemanaDoQuadro
        dias={diasDoCalendario}
        onAbrirDia={() => openNewCampaign()}
        // A peça que falhou se arquiva no próprio cartão (01/10): só os posts
        // dela que falharam; o que já saiu ou está na fila fica.
        onArquivarPeca={(id) => void arquivarPostsComFalha((postsDaPeca.get(id) ?? []).filter((p) => p.status === "failed").map((p) => p.id))}
        onAbrirPeca={(id) => {
          // Pelo `handleOpenModal`, e nao pelo `setModalCard` direto: o modal
          // so desenha com card E linha do agente, e em 18/09 o clique na peca
          // setava so o card. A tela nao fazia nada, zero, e ninguem avisava.
          const card = cardDaPeca.get(id);
          if (card) handleOpenModal(card, linhaDoAgente(card));
          else {
            // Sem card: a peça publicada abre na própria rede; a que existe só
            // como post abre na aba Posts, onde ela está por inteiro.
            const posts = postsDaPeca.get(id) ?? [];
            const link = posts.find((p) => p.externalUrl)?.externalUrl;
            if (link) window.open(link, "_blank", "noopener,noreferrer");
            else if (posts.length) window.location.href = `/projects/${projectId}/posts`;
            else toast("Esta peça ainda não tem card para abrir.");
          }
        }}
      />

      {/* A LINHA DE BAIXO diz a proxima coisa que vai acontecer, que e a unica
          informacao que justifica voltar nesta tela amanha. "Sete pecas" e um
          numero que nao pede acao nenhuma; "a proxima sai hoje as 18:00" e. */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <div className="flex flex-wrap gap-3.5">
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: CORES.publicado }} />
            publicado
          </span>
          <span className="flex items-center gap-1.5">
            {/* As cores são as mesmas dos cartões (ESTADO em semana-do-quadro).
                Até 29/09 "fazendo" tinha a cor do agendado e o "esperando
                você" laranja nem aparecia na legenda. */}
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#c084fc" }} />
            o squad está fazendo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#f6803d" }} />
            esperando você aprovar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: CORES.agendado }} />
            agendado (já aprovado)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: CORES.rascunho }} />
            rascunho, nao sai
          </span>
        </div>
        {proximaSaida ? (
          <span>
            A proxima peca sai{" "}
            <b className="font-semibold" style={{ color: "var(--text-primary)" }}>{proximaSaida}</b>
          </span>
        ) : weekCards.length === 0 && !loadingCards && !generating ? (
          <span>Nada nesta semana ainda. Comece por &ldquo;Nova campanha&rdquo;.</span>
        ) : null}
      </div>


      {/* Um corte guardado, aberto para decidir se vai ao ar */}
      <AnimatePresence>
        {corteGuardadoAberto && (
          <CorteGuardadoModal
            videoId={corteGuardadoAberto.videoId}
            corte={corteGuardadoAberto.corte}
            onFechar={() => setCorteGuardadoAberto(null)}
            onLigado={() => { void loadCardsForWeek(weekStartIso); }}
          />
        )}
      </AnimatePresence>

      {/* Setup modal */}
      <AnimatePresence>
        {showSetupModal && (
          <CampaignSetupModal
            postFrequency={postFrequency}
            onConfirm={handleSetupConfirm}
            onClose={() => {
              setShowSetupModal(false);
              setOrigemDoModal(undefined);
            }}
            defaultWeekStart={weekStartIso}
            projectId={projectId}
            origemInicial={origemDoModal}
            // Conta desativada nao entra; conta sem o campo (tela que nao o
            // seleciona) entra, porque a falta do dado nao pode virar rede sumida.
            redesConectadas={socialAccounts.filter((a) => a.isActive !== false).map((a) => a.platform)}
            contasConectadas={socialAccounts.filter((a) => a.isActive !== false)}
            // "De um vídeo" abre o painel de envio aqui mesmo, em vez de
            // navegar para /video e voltar. Ver o comentário da prop.
            onEscolherVideo={() => {
              setShowSetupModal(false);
              setEnviarAberto(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* A ficha do agente, aberta pelo escritorio */}
      <AnimatePresence>
        {fichaAberta && (
          <FichaDoAgente
            key={fichaAberta.id}
            projectId={projectId}
            agentId={fichaAberta.id}
            falaAtual={fichaAberta.fala}
            onFechar={() => setFichaAberta(null)}
            onAbrirTrabalho={abrirTrabalhoDaFicha}
          />
        )}
      </AnimatePresence>

      {/* Card detail modal */}
      {modalCard && modalAgentRow && (
        <CardDetailModal
          card={modalCard}
          agentRow={modalAgentRow}
          projectId={projectId}
          socialAccounts={socialAccounts}
          onClose={() => { setModalCard(null); setModalAgentRow(null); }}
          onCardUpdate={handleCardUpdate}
          onWeekRefresh={() => { void loadCardsForWeek(weekStartIso); }}
          // Só o que ainda vai sair ocupa horário: publicado, reprovado e
          // arquivado não disputam a agenda com ninguém.
          horariosDaSemana={postsSemana
            .filter((p) => p.scheduledAt && !["published", "rejected", "cancelled", "failed"].includes(p.status))
            .map((p) => ({ id: p.id, scheduledAt: new Date(p.scheduledAt as string | Date).toISOString() }))}
          onRestartWithTopic={(t) => {
            setTopic(t);
            setShowTopicInput(true);
            setModalCard(null);
            setModalAgentRow(null);
          }}
        />
      )}

      <AnimatePresence>
        {archiveOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setArchiveOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border p-6 max-h-[85vh] overflow-y-auto shadow-2xl"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start gap-2 mb-4">
                <div>
                  <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Arquivo de campanhas</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Restaure no quadro escolhendo a semana e os dias (sem datas passadas).</p>
                </div>
                <button type="button" onClick={() => setArchiveOpen(false)} className="p-1 rounded-lg hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              {loadingArchive ? (
                <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "var(--text-muted)" }}>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Carregando...</span>
                </div>
              ) : archivedRuns.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>Nenhuma campanha arquivada.</p>
              ) : (
                <ul className="space-y-3">
                  {archivedRuns.map((r) => (
                    <li key={r.id} className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{r.topic ?? "Sem tema"}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Iniciada em {new Date(r.startedAt).toLocaleString("pt-BR")}
                      </p>
                      {restoreRunId === r.id ? (
                        <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                          <div>
                            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Segunda-feira da semana alvo</p>
                            <input
                              type="date"
                              value={restoreWeekStart}
                              onChange={(e) => setRestoreWeekStart(e.target.value)}
                              className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Dias no quadro</p>
                            <div className="flex flex-wrap gap-2">
                              {DAYS.map((d) => (
                                <label
                                  key={d.dayOfWeek}
                                  className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-lg border"
                                  style={{
                                    borderColor: restoreDays.includes(d.dayOfWeek) ? "color-mix(in srgb, var(--acento) 50%, transparent)" : "var(--border)",
                                    background: restoreDays.includes(d.dayOfWeek) ? "color-mix(in srgb, var(--acento) 8%, transparent)" : "transparent",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={restoreDays.includes(d.dayOfWeek)}
                                    onChange={() => toggleRestoreDay(d.dayOfWeek)}
                                  />
                                  {d.short}
                                </label>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => void submitRestore()} loading={restoring}>
                              Restaurar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRestoreRunId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="mt-1"
                          onClick={() => {
                            setRestoreRunId(r.id);
                            setRestoreWeekStart(weekStartIso);
                            setRestoreDays([1, 2, 3, 4, 5, 6, 7]);
                          }}
                        >
                          Restaurar no quadro…
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
