"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronRight, ChevronLeft, Zap, Image, Video, LayoutGrid, Type, Lightbulb,
  Shuffle, AlertTriangle, CalendarDays, Repeat2, Split, Bot,
  BarChart2, FileText, List, PieChart, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanejadorSemanal } from "@/components/posts/planejador-semanal";
import { cn } from "@/lib/utils";
import { GaleriaDeModelos } from "@/components/modelos-de-arte/galeria-de-modelos";
import { AvisoDaIdentidade } from "@/components/modelos-de-arte/aviso-da-identidade";
import { tipoGeraArte } from "@/lib/modelos-de-arte/espera-da-identidade";
import { MateriaisDaCampanha } from "@/components/materiais/materiais-da-campanha";
import { MEDIA_STYLE_OPTIONS, type MediaStyleId } from "@/lib/media/media-style";
import { avisoDaCota, type CotaDoCliente } from "@/lib/media/cota-do-dia";
import { fraseDoTeste, SEM_TESTE, type LimiteDoTeste } from "@/lib/teste-gratis";
import {
  formatosDaRede,
  formatoValido,
  avisoDoFormato,
  ehVertical,
  rotuloDoFormatoNaRede,
  type FormatoDeDestino,
} from "@/lib/publish/formato-de-destino";
import { NOMES_DAS_REDES } from "@/lib/posts/estado";
import { EscolhaDeOrigem } from "@/components/posts/escolha-de-origem";
import { OrigemDoDiaCampo, origemIncompleta, type OrigemDoDia } from "@/components/posts/origem-do-dia";
import { EscolhaDoHorarioVencido } from "@/components/posts/escolha-do-horario-vencido";

export type FunnelStage = "tofu" | "mofu" | "bofu";
import {
  DURACOES_DE_VIDEO,
  custoDoVideo,
  geracoesDoVideo,
  segundosEntregues,
} from "@/lib/credits/video-tabela";
import { estimarCampanha } from "@/lib/credits/estimativa";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";

export type ContentType = "text" | "image" | "video" | "carousel" | "infographic" | "poll" | "article" | "thread" | "free";
export type CampaignMode = "single" | "weekly" | "biweekly" | "recurring";

export interface WeeklySchedule {
  "1"?: ContentType;
  "2"?: ContentType;
  "3"?: ContentType;
  "4"?: ContentType;
  "5"?: ContentType;
  "6"?: ContentType; // Sábado (opcional)
  "7"?: ContentType; // Domingo (opcional)
}

export interface DayScheduleTime {
  time: string; // "HH:mm"
}

export interface CampaignConfig {
  campaignMode: CampaignMode;
  /**
   * A pessoa escolheu substituir os rascunhos de outras campanhas nos dias
   * desta (05/10). Sem isto a campanha é somada ao dia; nada existente é tocado.
   */
  substituirRascunhos?: boolean;
  funnelStage: FunnelStage;
  weeklySchedule: WeeklySchedule;
  // Posting times: key = dayOfWeek (1-7), value = "HH:mm"
  postingTimes: Record<string, string>;
  // Full UTC ISO timestamps computed by the browser (preserves user timezone)
  singleScheduledAt?: string;            // for single mode
  postingTimestamps?: Record<string, string>; // dayOfWeek -> full ISO UTC
  singleDay?: number;
  singleTime?: string; // "HH:mm" for single post
  singleDate?: string; // ISO date for single post (overrides weekStart + singleDay)
  singlePlatform?: "linkedin" | "twitter" | "both";
  /**
   * As redes em que a campanha sai, escolhidas na janela entre as conectadas.
   * Vale para toda campanha por tema desde 13/09; antes a esteira escrevia
   * sempre para LinkedIn e X, e a tela so oferecia esses dois. Sem o campo
   * (janela antiga, PostsPanel), a esteira cai no par antigo.
   */
  platforms?: string[];
  /**
   * Por onde sai: ids de SocialAccount. Quando vem, a esteira grava um post por
   * conta escolhida e `platforms` e so o resumo das redes delas.
   */
  destinos?: string[];
  singleContentType?: ContentType;
  weekStart: string; // ISO date of the Monday for this campaign
  /** 4, 6 ou 8 segundos: o que o Veo 3.1 aceita. */
  videoDuration?: number;
  videoAudio?: boolean; // generate audio/narration in Portuguese
  /**
   * Quem narra (28/09). O mesmo formato de `VozDoNarrador` em lib/media/veo.ts,
   * repetido aqui porque este é componente de cliente e o veo.ts grava custo
   * no banco: importar de lá puxaria o banco para o navegador.
   */
  videoVoz?: VozDaNarracao;
  mediaStyle?: MediaStyleId; // visual style for image / video / carousel
  topicsPerDay: Record<string, string>; // dayOfWeek (1-7) -> topic string
  /**
   * O "hoje" de quem esta na tela (AAAA-MM-DD, no fuso do navegador).
   *
   * Existe porque a tela e o servidor discordavam sobre qual dia ja passou: a
   * tela olha a meia-noite LOCAL, o servidor olhava a meia-noite UTC de ontem.
   * Em 09/09 (quarta) a tela avisou "1 dia omitido" e o servidor gerou a terca
   * mesmo assim, empurrou o horario para "agora" e a terca apareceu na coluna
   * de quarta, com o rotulo de terca. Quem sabe que dia e hoje para a pessoa e
   * o navegador dela.
   */
  hojeLocal?: string;
  /**
   * O que fazer com os dias cujo HORÁRIO já passou, escolhido aqui na tela
   * antes de gerar (18/09). Ver o bloco "o horário já passou" no resumo, e
   * `lib/pipeline/executar.ts` para o que a esteira faz com cada escolha.
   */
  horarioPassado?: "semanaSeguinte" | "agora" | "pular";
  /**
   * Os dias (chaves "1".."7") cujo tipo de conteúdo a PESSOA escolheu, contra
   * os que ficaram na sugestão automática da tela.
   *
   * Existe desde 19/09 e é o registro que faltava no card 508: o `weeklySchedule`
   * sozinho não distingue "o cliente pediu texto na segunda" de "a tela sugeriu
   * texto na segunda e ninguém mexeu". Os dois viravam o mesmo JSON, e foi por
   * isso que a queixa "os agentes ignoram a minha escolha" levou uma sessão
   * inteira para ser respondida.
   */
  diasEscolhidosPeloCliente?: string[];
  /** Quantas laminas o carrossel tem. Cada uma e uma imagem paga. */
  laminasDoCarrossel?: number;
  /** "rapido" ou "cheio". O cheio custa 2,7 vezes o rapido. */
  videoQualidade?: "rapido" | "cheio";
  /**
   * ONDE A PEÇA CAI EM CADA REDE: feed, reel ou story (21/09).
   *
   * Um padrão por REDE que vale a campanha inteira, e não por dia: quatro
   * escolhas em vez de vinte e oito, e a esteira sabe a proporção do vídeo
   * antes de gerar. Ausente significa feed em tudo, que é o que a plataforma
   * sempre fez.
   */
  /** Um ou mais destinos por rede (28/09): feed, reel e story juntos. */
  formatosPorRede?: Record<string, FormatoDeDestino[]>;
  /** O material do próprio cliente, por dia (28/09). Ver lib/pipeline/executar.ts. */
  midiaDoCliente?: Record<string, { tipo: "imagem" | "carrossel" | "video"; urls: string[] }>;
  /**
   * Os materiais da biblioteca que o cliente marcou para esta campanha
   * (03/10). A geração das artes prefere estes e distribui pelos posts; ver
   * lib/materiais/escolha.ts (lido do config da execução pelo id do run).
   */
  materiaisDaCampanha?: string[];
}

export interface ContaConectada {
  id: string;
  platform: string;
  accountType: string;
  displayName: string | null;
}

interface Props {
  onConfirm: (config: CampaignConfig) => void;
  onClose: () => void;
  defaultWeekStart?: string; // passed by ContentManager
  /** Frequencia escolhida no setup ("3x por semana"); vira os dias pre-marcados. */
  postFrequency?: string | null;
  /**
   * O que fazer quando a pessoa escolhe "de um vídeo". Adicionado em 13/09.
   *
   * Sem isto o botão navegava para /projects/[id]/video, que redireciona para
   * /live: a pessoa saía do Gestor de Conteúdo para voltar ao mesmo lugar, e a
   * jornada do vídeo virava outra jornada, com outra cara. Quem já está no
   * Gestor (ContentManager) passa este callback e o painel de envio abre no
   * lugar, sem sair da tela. Quem não passa (a tela antiga de posts) continua
   * navegando, que é o comportamento de antes.
   */
  onEscolherVideo?: () => void;
  /**
   * Entrar direto numa porta, sem mostrar o seletor. A tela da primeira
   * campanha (Gestor, ?novaCampanha=1) ja perguntou de onde vem o conteudo e
   * nao faz sentido perguntar de novo aqui: era a "pergunta duplicada" que o
   * Bruno apontou em 13/09.
   */
  origemInicial?: "video" | "tema";
  /**
   * As redes conectadas e ativas do projeto, para a janela oferecer so o que
   * existe. Quem nao passa (a tela antiga) ve LinkedIn e X, como antes.
   */
  redesConectadas?: string[];
  /**
   * As CONTAS conectadas, e nao so as redes. Existe desde 14/09, quando o post
   * da gravacao saiu pelo perfil pessoal com a pagina demandou conectada no
   * mesmo projeto: "LinkedIn" nao diz por onde o post sai, e a esteira escolhia
   * sozinha. A unidade de escolha passou a ser a conta.
   */
  contasConectadas?: ContaConectada[];
  /**
   * Obrigatório desde 22/08. Era opcional, e o posts-panel abria o modal sem
   * passar: a escolha "de um vídeo" montava /projects/undefined/video e caía
   * em 404 na cara do Bruno, no meio da gravação. Opcional aqui significa que
   * o compilador não avisa quem esquecer, então virou obrigatório.
   */
  projectId: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const CAMPAIGN_MODES = [
  {
    id: "single" as CampaignMode,
    label: "Post único",
    icon: CalendarDays,
    description: "Um único post para um dia específico da semana.",
    badge: "1 post",
    color: "border-sky-500/30 hover:border-sky-400",
    activeColor: "border-sky-400 bg-sky-500/10",
    badgeColor: "bg-sky-500/20 text-sky-300",
  },
  {
    id: "weekly" as CampaignMode,
    label: "Semana completa",
    icon: Split,
    description: "Posts de Seg a Dom para a semana selecionada.",
    badge: "7 posts",
    color: "border-orange-500/30 hover:border-orange-400",
    activeColor: "border-orange-400 bg-orange-500/10",
    badgeColor: "bg-orange-500/20 text-orange-300",
  },
  {
    id: "biweekly" as CampaignMode,
    label: "Quinzenal",
    icon: Repeat2,
    description: "Duas semanas consecutivas de conteúdo de uma vez.",
    badge: "14 posts",
    color: "border-purple-500/30 hover:border-purple-400",
    activeColor: "border-purple-400 bg-purple-500/10",
    badgeColor: "bg-purple-500/20 text-purple-300",
  },
  {
    id: "recurring" as CampaignMode,
    label: "Recorrente",
    icon: Bot,
    description: "A IA decide o melhor dia e formato baseado no histórico.",
    badge: "IA decide",
    color: "border-green-500/30 hover:border-green-400",
    activeColor: "border-green-400 bg-green-500/10",
    badgeColor: "bg-green-500/20 text-green-300",
  },
];

const FUNNEL_OPTIONS = [
  {
    id: "tofu" as FunnelStage,
    label: "Topo de funil",
    badge: "ToFu",
    description: "Alcance máximo. Curiosidades, tendências, conteúdo leve e informativo.",
    examples: ["Dados surpreendentes do setor", "Mitos e verdades", "Tendências do mercado"],
    color: "border-blue-500/40 bg-blue-500/5 hover:border-blue-400",
    activeColor: "border-blue-400 bg-blue-500/15",
    badgeColor: "bg-blue-500/20 text-blue-300",
    emoji: "🌱",
  },
  {
    id: "mofu" as FunnelStage,
    label: "Meio de funil",
    badge: "MoFu",
    description: "Aprofundamento. Conteúdo técnico, provocativo e nichado.",
    examples: ["Análises comparativas", "Opiniões polarizadoras", "Casos de uso detalhados"],
    color: "border-orange-500/40 bg-orange-500/5 hover:border-orange-400",
    activeColor: "border-orange-400 bg-orange-500/15",
    badgeColor: "bg-orange-500/20 text-orange-300",
    emoji: "🔥",
  },
  {
    id: "bofu" as FunnelStage,
    label: "Fundo de funil",
    badge: "BoFu",
    description: "Conversão. CTA direto, prova social, urgência e ofertas.",
    examples: ["Cases de sucesso com números", "Comparativo com concorrentes", "Ofertas e CTAs claros"],
    color: "border-green-500/40 bg-green-500/5 hover:border-green-400",
    activeColor: "border-green-400 bg-green-500/15",
    badgeColor: "bg-green-500/20 text-green-300",
    emoji: "🎯",
  },
];

const CONTENT_TYPES = [
  { id: "text" as ContentType,    label: "Texto",    icon: Type,      description: "Post escrito sem mídia",         credits: 0,    time: null,    activeColor: "border-orange-500 bg-orange-500/10" },
  { id: "image" as ContentType,   label: "Imagem",   icon: Image,     description: "Imagem gerada por IA",           credits: 8,    time: "~30s",  activeColor: "border-blue-500 bg-blue-500/10" },
  // O VIDEO VOLTOU EM 19/09, com narracao em portugues e carteira propria.
  // `credits: null` porque ele NAO sai do saldo do plano: sai do saldo de
  // video, comprado a parte. Poe-lo na mesma conta seria repetir o erro que o
  // tirou do produto em agosto, quando quatro videos cheios numa campanha
  // custavam 108,6% do preco do plano Essencial.
  { id: "video" as ContentType,   label: "Vídeo",    icon: Video,     description: "Clipe por IA com narração em português", credits: null, time: "~3min", activeColor: "border-rose-500 bg-rose-500/10" },
  // `credits: null` porque o carrossel e o unico tipo cujo preco depende de uma
  // segunda escolha, o numero de laminas. Quem calcula e `creditosDoCarrossel`.
  { id: "carousel" as ContentType,    label: "Carrossel",    icon: LayoutGrid, description: "Lâminas navegáveis, no Instagram, LinkedIn e Facebook", credits: null, time: "~2min", activeColor: "border-purple-500 bg-purple-500/10" },
  { id: "infographic" as ContentType, label: "Infográfico",  icon: PieChart,   description: "Visual com dados, texto e gráficos perfeitos", credits: 5, time: "~45s", activeColor: "border-teal-500 bg-teal-500/10" },
  { id: "poll" as ContentType,    label: "Enquete",  icon: BarChart2, description: "LinkedIn poll / X poll",         credits: 0,    time: null,    activeColor: "border-cyan-500 bg-cyan-500/10" },
  { id: "article" as ContentType, label: "Artigo",   icon: FileText,  description: "Post longo (LinkedIn Article)",  credits: 0,    time: null,    activeColor: "border-emerald-500 bg-emerald-500/10" },
  { id: "thread" as ContentType,  label: "Thread",   icon: List,      description: "Série de tweets encadeados (X)", credits: 0,    time: null,    activeColor: "border-sky-500 bg-sky-500/10" },
  { id: "free" as ContentType,    label: "Livre",    icon: Shuffle,   description: "IA escolhe o melhor formato",    credits: null, time: null,    activeColor: "border-[var(--border-accent)] bg-[var(--bg-elevated)]" },
];

/**
 * OS SETE DIAS SAO POSICOES A PARTIR DO INICIO, e nao dias da semana fixos.
 *
 * Ate 19/09 esta lista dizia Segunda..Domingo e `weekStart` era sempre uma
 * segunda. Quem pedia uma campanha numa sexta via quatro dias "vencidos" e
 * uma pergunta sobre o que fazer com eles; o Bruno escolheu "publicar agora"
 * e seg, ter, qua e qui cairam todos em cima da sexta. Nas palavras dele:
 * "e para comecar hoje, o segundo dia seria sab, e assim por diante".
 *
 * Agora "dia 1" e a data de inicio, seja ela qual for, e os rotulos saem da
 * data real. `key`/`dayNum` continuam 1..7 porque a esteira e o banco contam
 * assim (`inicio + (dia - 1)`), e essa conta sempre esteve certa.
 */
const NOME_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const NOME_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function diasDaCampanha(inicioIso: string) {
  return [1, 2, 3, 4, 5, 6, 7].map((n) => {
    const d = new Date(inicioIso + "T12:00:00");
    d.setDate(d.getDate() + (n - 1));
    const dow = d.getDay();
    return {
      key: String(n) as keyof WeeklySchedule,
      // "Sex 18": o dia da semana e o numero do mes, que e o que a pessoa
      // reconhece. "Dia 1" sozinho obriga a fazer conta.
      label: `${NOME_LONGO[dow]} ${d.getDate()}`,
      short: `${NOME_CURTO[dow]} ${d.getDate()}`,
      dayNum: n,
      isWeekend: dow === 0 || dow === 6,
    };
  });
}

/** A lista fixa continua existindo para o modo de post unico, que escolhe um dia da semana. */
const WEEK_DAYS = [
  { key: "1" as keyof WeeklySchedule, label: "Segunda", short: "Seg", dayNum: 1, isWeekend: false },
  { key: "2" as keyof WeeklySchedule, label: "Terça",   short: "Ter", dayNum: 2, isWeekend: false },
  { key: "3" as keyof WeeklySchedule, label: "Quarta",  short: "Qua", dayNum: 3, isWeekend: false },
  { key: "4" as keyof WeeklySchedule, label: "Quinta",  short: "Qui", dayNum: 4, isWeekend: false },
  { key: "5" as keyof WeeklySchedule, label: "Sexta",   short: "Sex", dayNum: 5, isWeekend: false },
  { key: "6" as keyof WeeklySchedule, label: "Sábado",  short: "Sáb", dayNum: 6, isWeekend: true  },
  { key: "7" as keyof WeeklySchedule, label: "Domingo", short: "Dom", dayNum: 7, isWeekend: true  },
];

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function maisDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * O CARROSSEL VOLTOU AO SELETOR EM 19/09, e artigo e thread continuam fora.
 *
 * Ele estava escondido aqui desde que nasceu, e com razao: o que a esteira
 * chamava de carrossel eram tres chamadas ao mesmo prompt de imagem com "slide
 * 2, continuation" colado no fim, sem roteiro e no formato errado. Agora ele
 * tem roteiro escrito antes das imagens, laminas todas em 1080x1350 e modelo
 * proprio. Artigo e thread seguem escondidos porque continuam sem entrega.
 */
const VISIBLE_CONTENT_TYPES = CONTENT_TYPES.filter(
  (ct) => !["article", "thread"].includes(ct.id)
);

/** Quantos creditos custa um carrossel de N laminas, com o texto junto. */
const CREDITOS_POR_LAMINA = 42;
const CREDITOS_DE_TEXTO = 15;
function creditosDoCarrossel(laminas: number): number {
  return CREDITOS_DE_TEXTO + CREDITOS_POR_LAMINA * laminas;
}

/** As redes que aceitam carrossel, e quantas laminas cada uma aceita. */
const REDES_DE_CARROSSEL = ["instagram", "linkedin", "facebook"];
const TETO_DE_LAMINAS: Record<string, number> = { instagram: 20, linkedin: 20, facebook: 10 };

function getThisMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function getNextMonday(weeksAhead = 1): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday + (weeksAhead - 1) * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

/** Snap any date to its Monday */
function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/** Format week range like "31 mar – 6 abr" */
function formatWeekRange(mondayIso: string, weeksCount = 1): string {
  const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const start = new Date(mondayIso + "T12:00:00");
  const end = new Date(mondayIso + "T12:00:00");
  end.setDate(end.getDate() + weeksCount * 7 - 1);
  const fmtDay = (d: Date) =>
    `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/**
 * Os créditos da campanha, contando só os dias que vão ser gerados.
 *
 * `fora` existe desde 18/09: com a escolha de PULAR os dias vencidos, a grade
 * encolhia e o preço não. Visto na tela logada, com quatro dias pulados e os
 * mesmos 16 créditos embaixo. Cobrar na tela por peça que não vai existir é o
 * tipo de número que faz a pessoa parar de ler o resto.
 */
/**
 * O QUE A CAMPANHA VAI COBRAR, pela conta do SERVIDOR.
 *
 * Esta funcao somava um preco fixo por tipo de peca (imagem 8, infografico 5),
 * herdado de agosto, e ignorava as REDES. O texto e cobrado por rede, e num
 * dia em quatro redes ele e a maior parte da conta: a janela dizia 688
 * creditos e o servidor recusava a mesma campanha por custar mais que o saldo.
 * O Bruno viu as duas telas discordando e disse o obvio, que elas precisam se
 * conversar.
 *
 * Agora as duas chamam `estimarCampanha` (lib/credits/estimativa.ts). Nao ha
 * preco novo aqui: ha um preco so, num lugar so.
 */
function calcTotalCredits(
  schedule: WeeklySchedule,
  fora: Set<string> | undefined,
  laminas: number,
  redes: string[],
  semanas: number
): number {
  const dias = Object.entries(schedule)
    .filter(([dia, tipo]) => Boolean(tipo) && !fora?.has(dia))
    .map(([, tipo]) => ({ tipo: tipo as string, redes }));
  return estimarCampanha({
    dias,
    redesConectadas: Math.max(1, redes.length),
    laminasDoCarrossel: laminas,
    semanas,
  });
}

function hasVideo(schedule: WeeklySchedule | ContentType): boolean {
  if (typeof schedule === "string") return schedule === "video";
  return (Object.values(schedule).filter(Boolean) as ContentType[]).includes("video");
}

function scheduleHasVisualMedia(ws: WeeklySchedule): boolean {
  return Object.values(ws).some((v) => v === "image" || v === "video" || v === "carousel");
}

function campaignUsesMediaStyle(
  isSingle: boolean,
  singleCt: ContentType,
  ws: WeeklySchedule,
  isRecurring: boolean
): boolean {
  // infographic has its own theme picker, not the media style
  if (isSingle) return ["image", "video", "carousel"].includes(singleCt);
  if (isRecurring) return true;
  return scheduleHasVisualMedia(ws);
}


/**
 * AS OPCOES DO VIDEO, e por que elas viraram um componente.
 *
 * Ate 21/09 este bloco morava DENTRO do passo do post unico. Numa campanha
 * semanal, que e o caminho normal do produto, ele nunca era desenhado: quem
 * marcava video num dia da semana nao escolhia duracao, qualidade nem
 * narracao, e a esteira usava o padrao (8 s, rapido, sem fala). O Bruno pediu
 * um video de 60 s na campanha da Demandou e recebeu um clipe de 8 s mudo,
 * porque a pergunta nunca foi feita.
 *
 * Agora e um componente so, desenhado nos dois caminhos. Duas telas que
 * perguntam a mesma coisa de dois jeitos e como o defeito nasce, e aqui uma
 * delas simplesmente nao perguntava.
 */
export type VozDaNarracao = { genero: "feminina" | "masculina"; tom: "acolhedor" | "energico" | "serio" };
const VOZ_PADRAO: VozDaNarracao = { genero: "feminina", tom: "acolhedor" };

export function OpcoesDoVideo({
  saldos,
  creditosDeVideo,
  creditosDeVideoPorDia,
  diasDeVideo,
  quinzenal,
  videoQualidade,
  setVideoQualidade,
  videoDuration,
  setVideoDuration,
  videoAudio,
  setVideoAudio,
  videoVoz = VOZ_PADRAO,
  setVideoVoz,
  cota,
}: {
  saldos: { plano: number; video: number } | null;
  /**
   * Quantos videos o GERADOR ainda aceita hoje, que e uma conta diferente do
   * saldo (21/09). O cliente pode ter credito e nao caber: o limite e de uso
   * por dia do fornecedor, e vale para a plataforma inteira.
   */
  cota?: { teto: number; usadas: number; restam: number; zeraEm: string; doCliente?: CotaDoCliente | null; teste?: LimiteDoTeste | null } | null;
  creditosDeVideo: number;
  creditosDeVideoPorDia: number;
  diasDeVideo: number;
  quinzenal: boolean;
  videoQualidade: "rapido" | "cheio";
  setVideoQualidade: (q: "rapido" | "cheio") => void;
  videoDuration: number;
  setVideoDuration: (s: number) => void;
  videoAudio: boolean;
  setVideoAudio: (v: boolean) => void;
  videoVoz?: VozDaNarracao;
  setVideoVoz?: (v: VozDaNarracao) => void;
}) {
  const geracoesPorVideo = geracoesDoVideo(videoDuration);
  // Duracao, qualidade e narracao. Numeros de 18/09, cadeia de 21/09.
  return (
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--acento)", background: "color-mix(in srgb, var(--acento) 6%, transparent)" }}>
        <div className="flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--acento)" }}>Vídeo tem saldo próprio</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              O vídeo por IA <strong style={{ color: "var(--text-primary)" }}>não consome os créditos de texto e imagem</strong>:
              ele sai do saldo de vídeo do seu plano, reposto a cada mês. Gerado com{" "}
              <strong style={{ color: "var(--text-primary)" }}>Veo 3.1</strong>, que tem narração em
              português sincronizada. Sem saldo, o dia sai como imagem, com o quadro.
            </p>
            {/* O VÍDEO DO PRÓPRIO CLIENTE PRIMEIRO (28/09, decisão do Bruno): o
                vídeo por IA custa caro e o resultado ainda não compensa, então a
                janela oferece antes o caminho que não gasta crédito nenhum. */}
            <p className="text-xs mt-2 rounded-lg px-2.5 py-2 leading-relaxed" style={{ background: "rgba(34,197,94,0.08)", color: "var(--text-primary)" }}>
              <strong>Tem um vídeo seu?</strong> No tema de cada dia, escolha <strong>Subir o meu vídeo</strong>: ele vai
              direto para as redes, não gasta crédito de vídeo e fica com a sua cara. Um vídeo mais longo, gravado por você,
              ainda vira cortes pela tela de vídeos.
            </p>
            {/* O SALDO E A CONTA, lado a lado. É a linha que
                faltava: sem ela a pessoa só descobre que não tem
                saldo quando o dia de vídeo sai sem vídeo. */}
            <p
              className="text-xs mt-2 font-semibold"
              style={{ color: saldos && saldos.video < creditosDeVideo ? "#f87171" : "var(--text-primary)" }}
            >
              {saldos === null
                ? "Conferindo o seu saldo de vídeo…"
                : // A conta em VÍDEOS, e não em dias vezes semanas. Em 28/09 o Bruno
                  // escolheu um dia de vídeo numa campanha de duas semanas e leu
                  // "1 dia(s) × 1755 × 2 semanas" como um vídeo que custava o
                  // dobro. Eram dois vídeos, um por semana: agora a frase diz isso.
                  `Esta campanha gera ${diasDeVideo * (quinzenal ? 2 : 1)} vídeo${diasDeVideo * (quinzenal ? 2 : 1) === 1 ? "" : "s"} de ${videoDuration}s` +
                  (quinzenal ? ` (${diasDeVideo} por semana, durante 2 semanas)` : "") +
                  `, ${creditosDeVideoPorDia} créditos cada (${geracoesPorVideo === 1 ? "1 geração" : `${geracoesPorVideo} gerações do Veo`}): ${creditosDeVideo} no total. Você tem ${saldos.video}.`}
              {saldos !== null && saldos.video < creditosDeVideo && (
                <> Faltam {creditosDeVideo - saldos.video}: sem eles, os dias de vídeo saem como imagem.</>
              )}
            </p>
            {/* A COTA DO GERADOR, que NAO e o saldo (21/09).
                O limite de video do fornecedor e por DIA e vale para a
                plataforma inteira: o cliente pode ter credito e nao caber. O
                Bruno passou o dia 21 com uma peca presa sem saber disso, e a
                frase dele foi "o usuario fica sem opcao e sem saber o que esta
                acontecendo". So aparece quando NAO cabe: aviso que aparece
                sempre vira paisagem. */}
            {(() => {
              // Sem a cota lida ainda, nao se inventa aviso: `restam` infinito
              // faz `avisoDaCota` devolver null, que e o silencio certo.
              const aviso = avisoDaCota(
                cota ?? { teto: 0, usadas: 0, restam: Number.POSITIVE_INFINITY, zeraEm: new Date().toISOString() },
                videoDuration,
                cota?.doCliente
              );
              return aviso ? (
                <p className="text-xs mt-2 font-semibold leading-relaxed" style={{ color: "#fbbf24" }}>
                  {aviso}
                </p>
              ) : null;
            })()}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Qualidade</p>
          {/* O QUE CADA QUALIDADE É, dito no botão (28/09). Antes o botão só
              trazia "195 cr." e "520 cr.", e o Bruno perguntou "qual a
              diferença entre rápido e cheio?". Quem não sabe a diferença
              escolhe o mais caro achando que é o certo, e o saldo do mês vai
              em dois vídeos. Agora cada um diz para que serve e quantos
              vídeos o saldo rende nele, na duração escolhida. */}
          <div className="flex gap-2">
            {([
              {
                id: "rapido" as const,
                nome: "Rápido",
                selo: "Recomendado",
                paraQue: "Imagem de apoio com a narração por cima: escritório, produto, gráfico, pessoa trabalhando.",
              },
              {
                id: "cheio" as const,
                nome: "Cheio",
                selo: "2,7x os créditos",
                paraQue: "Quando a cena é o assunto: câmera em movimento, gente em ação, rosto e mãos de perto.",
              },
            ]).map((q) => {
              const ativo = videoQualidade === q.id;
              const porVideo = custoDoVideo(videoDuration, q.id);
              const rende = saldos ? Math.floor(saldos.video / porVideo) : null;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setVideoQualidade(q.id)}
                  className={cn("flex-1 p-2.5 rounded-xl border text-left text-xs font-medium transition-all", ativo ? "border-orange-500 bg-orange-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]")}
                  style={{ color: ativo ? "var(--acento)" : "var(--text-primary)" }}
                >
                  <span className="flex items-center justify-between gap-2">
                    {q.nome}
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{q.selo}</span>
                  </span>
                  <span className="block text-[10px] font-normal mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{q.paraQue}</span>
                  <span className="block text-[10px] font-semibold mt-1.5" style={{ color: "var(--text-primary)" }}>
                    {porVideo} cr. por vídeo de {videoDuration}s
                    {rende !== null && ` · seu saldo rende ${rende}`}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Os dois têm a mesma narração em português e o mesmo tamanho (1280x720). O Cheio é o
            modelo completo do Google: mais detalhe e menos deformação em movimento, rosto e mão.
            Em post com narração a diferença quase não aparece, e o Rápido rende 2,7 vezes mais vídeos.
          </p>
        </div>
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Duração do vídeo</p>
          <div className="flex gap-2">
            {DURACOES_DE_VIDEO.map((sec) => {
              /**
               * O CRÉDITO É POR GERAÇÃO, e não por segundo.
               *
               * Nenhum gerador entrega 60 s numa chamada: o Veo faz
               * 8 s e estende de 7 em 7, e cada passo é cobrado por
               * inteiro. Por isso 15 s custam o dobro de 8 s, e não
               * o dobro menos um pouco. A conta é a mesma que o
               * servidor debita (lib/credits/video-tabela.ts).
               */
              const credits = custoDoVideo(sec, videoQualidade);
              const isActive = videoDuration === sec;
              const gera = geracoesDoVideo(sec);
              /**
               * O TESTE NAO OFERECE O QUE NAO PODE ENTREGAR (22/09).
               *
               * O servidor ja recusa, mas oferecer e recusar depois e pior que
               * nao oferecer: o cliente escolhe, clica e leva um nao por uma
               * regra que ninguem tinha contado. Aqui o botao fica apagado e a
               * frase logo abaixo diz o motivo e a saida.
               */
              const teste = cota?.teste ?? SEM_TESTE;
              const foraDoTeste = teste.emTeste && sec > teste.segundosDeVideo;
              return (
                <button
                  key={sec}
                  disabled={foraDoTeste}
                  title={foraDoTeste ? `No teste o vídeo vai até ${teste.segundosDeVideo}s` : undefined}
                  onClick={() => { if (!foraDoTeste) setVideoDuration(sec); }}
                  className={cn("flex-1 py-2 rounded-xl border text-xs font-medium transition-all", isActive ? "border-orange-500 bg-orange-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]", foraDoTeste && "opacity-40 cursor-not-allowed")}
                  style={{ color: isActive ? "var(--acento)" : "var(--text-primary)" }}
                >
                  {sec}s
                  <span className="block text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>{credits} cr.</span>
                  <span className="block text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
        {gera === 1 ? "1 geração" : `${gera} gerações`}
                  </span>
                </button>
              );
            })}
          </div>
          {(() => {
            const frase = fraseDoTeste(cota?.teste ?? SEM_TESTE);
            return frase ? (
              <p className="text-[11px] mt-2 leading-relaxed font-medium" style={{ color: "#fbbf24" }}>{frase}</p>
            ) : null;
          })()}
          {geracoesPorVideo > 1 && (
            <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Acima de 8 segundos o vídeo é feito em {geracoesPorVideo} trechos encadeados
              (8s e depois 7s por trecho, saindo com {segundosEntregues(videoDuration)}s no total).
              Cada trecho é uma geração paga e leva de 1 a 5 minutos, então o vídeo aparece no card
              depois do post do dia. Se um trecho falhar, o vídeo sai mais curto e os trechos que não
              saíram voltam para o seu saldo.
            </p>
          )}
        </div>

        {/* Audio narration toggle */}
        <button
          onClick={() => setVideoAudio(!videoAudio)}
          className="w-full flex items-center justify-between p-3 rounded-xl border transition-all"
          style={{
            borderColor: videoAudio ? "#3b82f6" : "var(--border)",
            background: videoAudio ? "rgba(59,130,246,0.08)" : "transparent",
          }}
        >
          <div className="text-left">
            <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>🎙️ Narração em português</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              O Veo 3.1 gera o áudio junto do vídeo, com o narrador sincronizado
            </p>
          </div>
          <div className={cn("w-9 h-5 rounded-full flex items-center transition-all px-0.5 shrink-0", videoAudio ? "justify-end bg-blue-500" : "justify-start bg-[var(--border)]")}>
            <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
          </div>
        </button>

        {/* A VOZ DO NARRADOR (28/09). Pedido do Bruno: "nao tem a opcao de
            escolher a narracao do video?". Antes o Veo sorteava a voz a cada
            vídeo. Só aparece com a narração ligada: escolher voz de vídeo
            mudo é pergunta sem sentido. */}
        {videoAudio && setVideoVoz && (
          <div className="space-y-2 px-1">
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Voz do narrador</p>
              <div className="flex gap-2">
                {([
                  { id: "feminina" as const, nome: "Feminina" },
                  { id: "masculina" as const, nome: "Masculina" },
                ]).map((g) => {
                  const ativo = videoVoz.genero === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setVideoVoz({ ...videoVoz, genero: g.id })}
                      className={cn("flex-1 py-2 rounded-xl border text-xs font-medium transition-all", ativo ? "border-blue-500 bg-blue-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]")}
                      style={{ color: ativo ? "#3b82f6" : "var(--text-primary)" }}
                    >
                      {g.nome}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Tom</p>
              <div className="flex gap-2">
                {([
                  { id: "acolhedor" as const, nome: "Acolhedor", dica: "calmo e próximo" },
                  { id: "energico" as const, nome: "Enérgico", dica: "animado e confiante" },
                  { id: "serio" as const, nome: "Sério", dica: "firme, de autoridade" },
                ]).map((t) => {
                  const ativo = videoVoz.tom === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setVideoVoz({ ...videoVoz, tom: t.id })}
                      className={cn("flex-1 py-2 rounded-xl border text-xs font-medium transition-all", ativo ? "border-blue-500 bg-blue-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]")}
                      style={{ color: ativo ? "#3b82f6" : "var(--text-primary)" }}
                    >
                      {t.nome}
                      <span className="block text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>{t.dica}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              A mesma voz do começo ao fim do vídeo, em todos os trechos. Sem custo a mais.
            </p>
          </div>
        )}

        <p className="text-[10px] leading-relaxed px-1" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-primary)" }}>Mensagem completa:</strong> a IA planeja o roteiro para caber na duração escolhida: ideia com início, meio e fim, sem cortar no meio da fala ou da cena.
          {videoAudio ? " Com narração, o texto fica curto o suficiente para terminar antes do fim do clipe." : null}
        </p>
      </div>
  );
}

/**
 * O FORMATO DE DESTINO, POR REDE (21/09, pedido do Bruno).
 *
 * Até aqui toda peça saía no FEED, porque o publicador escolhia o endpoint só
 * pelo tipo da peça. Agora o cliente escolhe onde ela cai: feed, reel ou
 * story.
 *
 * DUAS DECISÕES DE DESENHO, e as duas são do Bruno:
 *
 *   1. a escolha é um PADRÃO POR REDE que vale a semana inteira, e não uma
 *      grade de 7 dias por 4 redes. São 4 escolhas em vez de 28, e a esteira
 *      sabe a proporção do vídeo antes de gerar. Um dia que saia errado se
 *      conserta refazendo aquela peça;
 *   2. os três formatos entram nas duas redes da Meta.
 *
 * A MATRIZ NÃO É SIMÉTRICA, e a tela mostra isso em vez de esconder: LinkedIn
 * e X aparecem dizendo "só feed", porque o LinkedIn desligou stories em 2021 e
 * nenhum dos dois tem reels. Oferecer três botões em todas as redes seria
 * vender duas falhas.
 */
export function FormatoPorRede({
  redes,
  formatos,
  aoEscolher,
  temVideo,
}: {
  /** As redes desta campanha, na ordem em que a tela já as mostra. */
  redes: string[];
  formatos: Record<string, FormatoDeDestino[]>;
  /** Marca ou desmarca o destino (vários por rede, nunca nenhum). */
  aoEscolher: (rede: string, formato: FormatoDeDestino) => void;
  /** Se algum dia da campanha tem vídeo: decide se o aviso da proporção vale. */
  temVideo: boolean;
}) {
  if (redes.length === 0) return null;

  const escolhidos = redes.flatMap((r) => formatos[r] ?? ["feed"]);
  const avisos = [...new Set(escolhidos.map(avisoDoFormato).filter((a): a is string => Boolean(a)))];
  // O vídeo do dia é UM só para todas as redes: se alguma pede vertical, ele
  // nasce vertical, e as outras recebem o mesmo arquivo. Dizer isto antes é o
  // que evita a pergunta "por que o vídeo do LinkedIn ficou em pé?".
  const vertical = escolhidos.some(ehVertical);
  const misturado = vertical && escolhidos.some((f) => !ehVertical(f));

  return (
    <div>
      <p className="text-xs font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
        Onde a peça cai, em cada rede
      </p>
      {/* VÁRIOS DE UMA VEZ (28/09): marque feed, reel e story para sair nos
          três. Cada lugar marcado vira um post, com o mesmo texto e a mesma
          mídia. */}
      <p className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>
        Marque um ou mais: cada lugar marcado vira uma publicação.
      </p>
      <div className="space-y-1.5">
        {redes.map((rede) => {
          const aceitos = formatosDaRede(rede);
          const atuais = formatos[rede] ?? ["feed"];
          return (
            <div key={rede} className="flex items-center gap-2">
              <span className="text-xs font-semibold w-20 shrink-0" style={{ color: "var(--text-primary)" }}>
                {NOMES_DAS_REDES[rede] ?? rede}
              </span>
              {aceitos.length === 1 ? (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  só feed (esta rede não tem reel nem story)
                </span>
              ) : (
                <div className="flex gap-1.5">
                  {aceitos.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => aoEscolher(rede, f)}
                      aria-pressed={atuais.includes(f)}
                      className={cn(
                        "h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-all",
                        atuais.includes(f)
                          ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                      )}
                    >
                      {atuais.includes(f) ? "✓ " : ""}
                      {rotuloDoFormatoNaRede(rede, f)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {avisos.map((a) => (
        <p key={a} className="text-[10px] mt-1.5 leading-snug" style={{ color: "var(--text-muted)" }}>
          {a}
        </p>
      ))}
      {misturado && temVideo && (
        <p className="text-[10px] mt-1.5 leading-snug text-amber-400">
          O dia gera UM vídeo para todas as redes: como uma delas vai de reel ou story, ele sai em pé (9:16) também no feed das outras. Gerar dois vídeos custaria o dobro.
        </p>
      )}
    </div>
  );
}


/**
 * A LINHA QUE DIZ DE ONDE VEM A CARA DAS ARTES (30/09, item 10).
 *
 * As artes da semana passaram a seguir a linguagem que o cliente escolheu no
 * catálogo de edição do vídeo (lib/media/direcao-de-arte.ts, direcaoDaPeca).
 * Sem esta linha a janela continuaria mostrando só a lista de estilos, e o
 * cliente não saberia que o "Automático" agora quer dizer "igual ao vídeo".
 * Não troca nada da tela: só acrescenta a frase quando há linguagem escolhida.
 */
function LinhaDaLinguagem({ projectId, noEstiloProprio }: { projectId: string; noEstiloProprio?: boolean }) {
  const [linguagem, setLinguagem] = useState<{ nome: string; referencia?: string; arte: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/estilo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setLinguagem(d?.linguagem ?? null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [projectId]);
  if (!linguagem) return null;
  return (
    <p className="text-[10px] leading-relaxed rounded-lg px-2 py-1.5" style={{ background: "color-mix(in srgb, var(--acento) 8%, transparent)", color: "var(--text-muted)" }}>
      As artes seguem a linguagem escolhida no vídeo:{" "}
      <strong style={{ color: "var(--text-primary)" }}>{linguagem.nome}{linguagem.referencia ? ` (${linguagem.referencia})` : ""}</strong>, {linguagem.arte}, sempre com as cores e o logo da marca.
      {noEstiloProprio
        ? " O seu estilo próprio refina essa linguagem, não a substitui."
        : " No Automático vale para todas as peças; escolher um estilo abaixo troca só nesta campanha."}
    </p>
  );
}

/**
 * O ESTILO PROPRIO DO CLIENTE, escrito por ele e guardado no projeto.
 *
 * Pedido do Bruno em 21/09: os estilos prontos sao bons e sao de outra pessoa.
 * Quem tem linha editorial propria escreve uma vez, a plataforma guarda, e a
 * campanha seguinte sai igual sem redigitar nada.
 *
 * O BOTAO DE AJUDA existe pela mesma razao da manchete da peca (19/09):
 * descrever direcao de arte e um trabalho que a pessoa nao escolheu ter, e
 * pagina em branco e onde ela desiste. A IA le o nicho, as cores e os
 * documentos do projeto e escreve a primeira versao, em portugues, para ele
 * corrigir. Sugerir nao salva: quem decide e quem assina a marca.
 */
function EstiloProprio({ projectId, aoMudar }: { projectId: string; aoMudar?: (temEstilo: boolean) => void }) {
  const [descricao, setDescricao] = useState("");
  const [prompt, setPrompt] = useState("");
  const [salvo, setSalvo] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sugerindo, setSugerindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/estilo`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d?.estilo) {
          setDescricao(d.estilo.descricao ?? "");
          setPrompt(d.estilo.prompt ?? "");
          setSalvo(true);
          setAberto(true);
          aoMudar?.(true);
        } else {
          setSalvo(false);
        }
      })
      .catch(() => setSalvo(false))
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [projectId, aoMudar]);

  async function sugerir() {
    setSugerindo(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estilo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "sugerir", rascunho: descricao }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setDescricao(d.descricao);
      setPrompt(d.prompt);
      toast.success("Escrevi uma primeira versão. Leia e corrija o que não for você.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui escrever a direção visual.");
    } finally {
      setSugerindo(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estilo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao, prompt }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSalvo(true);
      aoMudar?.(true);
      toast.success("Estilo guardado. Vale para esta campanha e para as próximas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/estilo`, { method: "DELETE" });
      // Membro da equipe recebe 403 com a frase de quem muda (01/10): mostrar,
      // em vez de dizer "removido" sobre algo que continuou lá.
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Não consegui remover o estilo.");
        return;
      }
      setDescricao("");
      setPrompt("");
      setSalvo(false);
      aoMudar?.(false);
      toast.success("Estilo próprio removido. Voltam a valer os estilos da lista.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return null;

  return (
    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: salvo ? "var(--acento)" : "var(--border)", background: salvo ? "color-mix(in srgb, var(--acento) 6%, transparent)" : "var(--bg-primary)" }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between text-left"
      >
        <span>
          <span className="text-xs font-semibold block" style={{ color: "var(--text-primary)" }}>
            {salvo ? "O seu estilo, guardado neste projeto" : "Escrever o meu próprio estilo"}
          </span>
          <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>
            {salvo
              ? "Vale para todas as peças. Com linguagem de vídeo escolhida, refina essa linguagem em vez de substituí-la."
              : "Descreva a sua linha editorial uma vez. As próximas campanhas seguem ela."}
          </span>
        </span>
        <ChevronRight className={cn("w-4 h-4 shrink-0 transition-transform", aberto && "rotate-90")} style={{ color: "var(--text-muted)" }} />
      </button>

      {aberto && (
        <div className="mt-3 space-y-2">
          <LinhaDaLinguagem projectId={projectId} noEstiloProprio />
          <textarea
            value={descricao}
            onChange={(e) => { setDescricao(e.target.value); setSalvo(false); }}
            rows={4}
            placeholder="Ex.: fotografia crua, luz dura de canteiro de obra, sem gente posando, paleta de concreto e laranja. Nada de holograma, nada de escritório de vidro."
            className="w-full text-xs px-3 py-2 rounded-xl border outline-none resize-none"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          {prompt && (
            <p className="text-[10px] leading-relaxed rounded-lg px-2 py-1.5" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-primary)" }}>O que o gerador recebe:</strong> {prompt}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => void sugerir()} loading={sugerindo}>
              <Sparkles className="w-3.5 h-3.5" />
              A IA escreve para mim
            </Button>
            <Button size="sm" className="flex-1 text-xs" onClick={() => void salvar()} loading={salvando} disabled={!descricao.trim() || !prompt.trim()}>
              Guardar estilo
            </Button>
          </div>
          {!prompt && descricao.trim() && (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Clique em "A IA escreve para mim" para transformar a sua descrição na instrução que o gerador entende.
            </p>
          )}
          {salvo && (
            <button type="button" onClick={() => void apagar()} className="text-[10px] hover:underline" style={{ color: "var(--text-muted)" }}>
              Remover o estilo próprio
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Os dias pre-marcados saem da frequencia que a pessoa ja escolheu no setup.
 *
 * Ate 09/09 o setup perguntava "quantas vezes por semana" e o wizard perguntava
 * de novo, do zero, com cinco dias marcados por padrao fossem quais fossem a
 * resposta. O Bruno chamou isso de redundancia, e era: a primeira resposta nao
 * valia para nada. Agora ela vale como ponto de partida, e o wizard vira
 * confirmacao ("e nesses dias mesmo?") em vez de pergunta repetida.
 */
function diasDaFrequencia(freq: string | null | undefined): WeeklySchedule {
  const padrao: WeeklySchedule = { "1": "text", "2": "image", "3": "text", "4": "image", "5": "free" };
  const f = (freq ?? "").toLowerCase();
  const ritmo = (dias: string[]): WeeklySchedule =>
    Object.fromEntries(dias.map((d, i) => [d, i % 2 === 0 ? "text" : "image"])) as WeeklySchedule;
  if (f.startsWith("1x por dia")) return ritmo(["1", "2", "3", "4", "5", "6", "7"]);
  if (f.startsWith("5x")) return ritmo(["1", "2", "3", "4", "5"]);
  if (f.startsWith("3x")) return ritmo(["1", "3", "5"]);
  if (f.startsWith("2x")) return ritmo(["2", "4"]);
  if (f.startsWith("1x")) return ritmo(["3"]);
  return padrao;
}

export function CampaignSetupModal({ onConfirm, onClose, defaultWeekStart, projectId, postFrequency, onEscolherVideo, origemInicial, redesConectadas, contasConectadas }: Props) {
  const router = useRouter();

  /**
   * De onde vem o conteúdo desta campanha, escolha que abre o fluxo.
   *
   * Decisão do Bruno em 22/08, junto com a virada de que vídeo é o produto:
   * o cliente ou grava um vídeo e o squad tira cortes dele, ou dá um tema e o
   * squad cria peça do zero. São dois produtos diferentes e os formatos
   * disponíveis mudam conforme a escolha.
   *
   * Fica aqui e não na Ideação do assistente porque o assistente roda uma vez
   * por projeto, e isto se repete toda semana. Enquanto ninguém escolheu, o
   * resto do modal não aparece; escolher "vídeo" leva ao fluxo de vídeo, que
   * já existe inteiro em página própria (upload, transcrição, seleção de
   * trechos e redação).
   */
  const [origem, setOrigem] = useState<"video" | "tema" | null>(origemInicial ?? null);
  const [step, setStep] = useState(0);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("weekly");
  /**
   * "JÁ EXISTE PEÇA NESTE DIA" (05/10): a campanha pronta para sair espera a
   * pessoa escolher entre somar ao dia (padrão) e substituir os rascunhos
   * que já estão lá. A esteira nunca decide isso sozinha.
   */
  const [sobreposicao, setSobreposicao] = useState<{ aviso: string; config: CampaignConfig } | null>(null);
  const [conferindoSobreposicao, setConferindoSobreposicao] = useState(false);
  const [funnelStage, setFunnelStage] = useState<FunnelStage>("tofu");
  // Default: Mon–Fri active, Sat–Sun off (key absent = não postar naquele dia)
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(() => diasDaFrequencia(postFrequency));
  /**
   * OS DIAS QUE A PESSOA ESCOLHEU DE VERDADE.
   *
   * Nasce vazio, e é isso que importa: tudo o que aparece na grade quando a
   * janela abre é SUGESTÃO, montada por `diasDaFrequencia` a partir da
   * frequência do projeto, alternando texto e imagem sozinha.
   *
   * O Bruno reclamou em 18/09 que escolhia o conteúdo de cada dia e os agentes
   * ignoravam. Medido: a esteira obedeceu exatamente o que estava gravado, e o
   * que estava gravado era, bit a bit, essa sugestão. Ninguém tinha escolhido
   * texto; o sistema escolheu e a tela mostrou como se fosse escolha dele.
   *
   * É o mesmo defeito do horário vencido da parte 140, e ele não é de código:
   * é decisão de produto tomada por omissão. A cura é a mesma das duas vezes,
   * e é só uma: a tela dizer o que é dela e o que é da pessoa.
   */
  const [diasEscolhidos, setDiasEscolhidos] = useState<Set<string>>(new Set());
  /** Grava o dia no schedule E marca que a escolha passou a ser da pessoa. */
  const escolherDoDia = (dia: keyof WeeklySchedule, tipo: ContentType | undefined) => {
    setWeeklySchedule((s) => {
      const next = { ...s };
      if (tipo === undefined) delete next[dia];
      else next[dia] = tipo;
      return next;
    });
    setDiasEscolhidos((d) => new Set(d).add(dia));
  };
  /** Assume a sugestão inteira de uma vez, com um clique e sem ambiguidade. */
  const aceitarSugestaoInteira = () =>
    setDiasEscolhidos(new Set(DIAS.map((d) => d.key as string)));
  const diasSugeridos = Object.keys(weeklySchedule).filter(
    (k) => weeklySchedule[k as keyof WeeklySchedule] !== undefined && !diasEscolhidos.has(k)
  );
  /**
   * QUANTAS LÂMINAS O CARROSSEL TEM.
   *
   * Cinco de padrão, e o padrão está DITO na tela: cada lâmina é uma imagem
   * paga no modelo premium (R$ 0,89 a peça), então o número mexe direto no
   * preço. Escondê-lo seria repetir o defeito que esta mesma sessão acabou de
   * consertar no planejador.
   */
  const [laminasDoCarrossel, setLaminasDoCarrossel] = useState(5);
  /**
   * A QUALIDADE DO VIDEO POR IA.
   *
   * "rapido" de padrao, e o padrao esta DITO no preco de cada botao: o cheio
   * custa 2,7 vezes o rapido (R$ 17,28 contra R$ 6,48 por clipe de 8s, medido
   * em 18/09). Esconder essa diferenca e o mesmo defeito que esta sessao
   * consertou no planejador.
   */
  const [videoQualidade, setVideoQualidade] = useState<"rapido" | "cheio">("rapido");

  /**
   * OS DOIS SALDOS, buscados ao abrir a janela.
   *
   * Pedido do Bruno em 19/09: "precisa estar mostrando os créditos sempre,
   * para o usuário saber quanto tem e quanto a campanha vai cobrar". Até aqui
   * a janela dizia quanto custava e nunca quanto havia; ele descobriu o saldo
   * de vídeo zerado quando o dia de vídeo saiu sem vídeo.
   *
   * `null` enquanto carrega: a tela não pode mostrar "0" antes de saber.
   */
  /**
   * O SALDO, e se a conta DEBITA.
   *
   * `interna` entrou em 21/09: a conta admin registra o lancamento com valor
   * zero e o saldo nunca desce. O Bruno viu a janela dizer "cobra 688
   * creditos" e o saldo parado, e concluiu que a cobranca estava quebrada.
   * Estava certa e muda.
   */
  // `dono` (01/10, acabamento): quem vê é membro da equipe, e a caixa de saldo
  // troca o "Comprar créditos" pela frase de a quem pedir.
  const [saldos, setSaldos] = useState<{ plano: number; video: number; interna: boolean; dono: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d)
          setSaldos({
            plano: Number(d.saldo ?? 0),
            video: Number(d.saldoDeVideo ?? 0),
            interna: Boolean(d.contaInterna),
            dono: typeof d.equipe?.dono === "string" ? d.equipe.dono : null,
          });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * A COTA DO GERADOR DE VIDEO, que e outra conta (21/09).
   *
   * Saldo e do cliente; cota e do fornecedor, por dia, para a plataforma
   * inteira. O Bruno comprou credito e o video continuou sem sair, porque o
   * que tinha acabado era a cota. As duas contas aparecem lado a lado no bloco
   * do video.
   */
  const [cotaDeVideo, setCotaDeVideo] = useState<{ teto: number; usadas: number; restam: number; zeraEm: string; doCliente?: CotaDoCliente | null; teste?: LimiteDoTeste | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/videos/cota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && typeof d.restam === "number") setCotaDeVideo(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const [singleDay, setSingleDay] = useState<number>(1);
  // Nasce em HOJE, e não vazio. Vazio caía num seletor "Segunda..Domingo" sem
  // data, e o post único do Bruno em 19/09 saiu como "Segunda-feira 14" numa
  // sexta 18: dia 1 sobre a segunda da semana. Post único é uma DATA.
  const [singleDate, setSingleDate] = useState<string>(hojeIso()); // YYYY-MM-DD
  const [singleTime, setSingleTime] = useState<string>("09:00");
  // O POST UNICO SO SABE LINKEDIN E X. Nao e a lista de redes do produto: a
  // esteira do post unico escreve para esses dois e mais nada (executar.ts,
  // `redesPedidas` quando campaignMode e "single"). Oferecer Instagram aqui
  // seria prometer o que o caminho nao entrega.
  // DECLARADA AQUI, ANTES DE QUALQUER USO. Em 14/09 ela nasceu vinte linhas
  // abaixo e o `filter` da linha seguinte a alcancava dentro de um callback:
  // o TypeScript nao acusa uso antes da declaracao dentro de arrow function,
  // e em runtime o filter roda na hora e morre em "Cannot access 'conectadas'
  // before initialization". O modal quebrava ao abrir, em toda tela, e foi ao
  // ar assim. `tsc` limpo nao prova que o componente renderiza.
  const conectadas = redesConectadas ?? [];
  // As contas por onde a campanha pode sair. YouTube fica fora pelo mesmo
  // motivo das redes: campanha por tema nao tem video. Padrao: PAGINAS ligadas
  // e perfil pessoal desligado quando existe pagina da mesma rede; quem so tem
  // perfil sai pelo perfil. Foi o que o Bruno pediu em 14/09: "eu teria
  // selecionado para postar somente pela demandou".
  const contas = (contasConectadas ?? []).filter((c) => c.platform !== "youtube");
  const temPaginaNaRede = (rede: string) => contas.some((c) => c.platform === rede && c.accountType === "organization");
  const [destinos, setDestinos] = useState<string[]>(() =>
    contas.filter((c) => c.accountType === "organization" || !temPaginaNaRede(c.platform)).map((c) => c.id)
  );
  const alternarDestino = (id: string) =>
    setDestinos((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const redesDosDestinos = Array.from(new Set(contas.filter((c) => destinos.includes(c.id)).map((c) => c.platform)));

  /**
   * O FORMATO DE DESTINO POR REDE (21/09). Tudo nasce em feed, que é o que a
   * plataforma sempre fez: ninguém perde comportamento por não mexer aqui.
   * Duas contas da mesma rede (perfil e página do LinkedIn) compartilham a
   * escolha, porque o formato é da REDE e não da conta.
   */
  const [formatosPorRede, setFormatosPorRede] = useState<Record<string, FormatoDeDestino[]>>({});
  // Marca ou desmarca. Desmarcar o último não vale: a rede precisa sair em
  // algum lugar, e quem não quer a rede a tira da lista de redes.
  const escolherFormato = (rede: string, formato: FormatoDeDestino) =>
    setFormatosPorRede((f) => {
      const valido = formatoValido(rede, formato);
      const atuais = f[rede] ?? ["feed"];
      const novos = atuais.includes(valido) ? atuais.filter((x) => x !== valido) : [...atuais, valido];
      return { ...f, [rede]: novos.length ? novos : atuais };
    });

  const REDES_DE_POST_UNICO = ["linkedin", "twitter"] as const;
  const unicoDisponiveis = REDES_DE_POST_UNICO.filter((r) => conectadas.includes(r));
  // O padrao e o que esta conectado, e nao "both" fixo. Com uma rede so, ela
  // ja vem escolhida e "Ambos" nem aparece: escolher entre uma opcao nao e
  // escolha, e "Ambos" com uma rede so e mentira de rotulo.
  const [singlePlatform, setSinglePlatform] = useState<"linkedin" | "twitter" | "both">(() =>
    unicoDisponiveis.length > 1 ? "both" : (unicoDisponiveis[0] ?? "linkedin")
  );

  // As redes da campanha. YouTube fica fora: campanha por tema nao tem video
  // para subir. O padrao e tudo que esta conectado, e a pessoa desmarca.
  // O TikTok entra na lista, mas a esteira só escreve para ele nos dias de
  // vídeo (executar.ts), e o vídeo do dia nasce vertical quando ele está
  // marcado. A tela avisa com o selo "só vídeo" no botão.
  const REDES_DE_TEMA = ["linkedin", "instagram", "facebook", "twitter", "tiktok"] as const;
  const NOME_DA_REDE: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", twitter: "X", tiktok: "TikTok" };
  // O FALLBACK ["linkedin","twitter"] SAIU EM 14/09, e ele era o defeito.
  //
  // Quem nao recebia `redesConectadas` (a tela de posts nao passava) via
  // LinkedIn e X oferecidos como se estivessem conectados. A esteira recusa
  // rede sem conta (executar.ts), entao o pedido nao virava post: virava
  // silencio. Lista vazia e a resposta honesta, e a tela avisa em vez de
  // oferecer destino que nao existe.
  const disponiveis = REDES_DE_TEMA.filter((r) => conectadas.includes(r));
  const [platforms, setPlatforms] = useState<string[]>(() => [...disponiveis]);
  const alternarRede = (r: string) =>
    setPlatforms((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const [singleContentType, setSingleContentType] = useState<ContentType>("text");
  const [videoDuration, setVideoDuration] = useState<number>(8);
  const [videoAudio, setVideoAudio] = useState<boolean>(false);
  const [videoVoz, setVideoVoz] = useState<VozDaNarracao>(VOZ_PADRAO);

  /**
   * Quanto de VÍDEO esta campanha pede, em créditos de vídeo.
   *
   * A conta vem de `lib/credits/video-tabela.ts`, a MESMA função que debita no
   * servidor. Até 21/09 havia uma cópia aqui (`(base / 8) * segundos`), e ela
   * mentia duas vezes: por segundo em vez de por geração, e sem saber que 60 s
   * são nove gerações do Veo. Promessa e cobrança calculadas em dois lugares
   * discordam no dia em que uma das duas muda.
   * Fica DEPOIS dos estados que usa: `const` não sobe, e usar antes é erro.
   */
  // No post único a grade da semana não vale: o vídeo é o post escolhido. Sem
  // isto a janela dizia "gera 0 vídeos, 0 no total" com o vídeo marcado (28/09).
  // De onde vem a peça de cada dia: IA ou material do cliente (28/09).
  const [origens, setOrigens] = useState<Record<string, OrigemDoDia>>({});
  // Os materiais da biblioteca marcados para esta campanha (03/10).
  const [materiaisDaCampanha, setMateriaisDaCampanha] = useState<string[]>([]);
  // A IDENTIDADE APROVADA (05/10): sem ela, a campanha sai com os textos e as artes ficam esperando, sem gastar. Null até o book responder.
  const [identidadeAprovada, setIdentidadeAprovada] = useState<boolean | null>(null);
  // A campanha tem dia de arte (imagem, carrossel, infográfico)? É o que decide o aviso do estilo (06/10).
  const campanhaTemArte = campaignMode === "single" ? tipoGeraArte(singleContentType) : Object.values(weeklySchedule).some((v) => tipoGeraArte(v));
  const diaComVideoProprio = (key: string) => origens[key]?.modo === "meu";
  const diasDeVideo =
    campaignMode === "single"
      ? singleContentType === "video" && !diaComVideoProprio(String(singleDay)) ? 1 : 0
      // Dia com vídeo próprio não gasta crédito de vídeo: sai da conta.
      : Object.entries(weeklySchedule).filter(([k, v]) => v === "video" && !diaComVideoProprio(k)).length;
  const creditosDeVideoPorDia = custoDoVideo(videoDuration, videoQualidade);
  const quinzenal = campaignMode === "biweekly";
  const creditosDeVideo = diasDeVideo * creditosDeVideoPorDia * (quinzenal ? 2 : 1);
  const geracoesPorVideo = geracoesDoVideo(videoDuration);
  // "auto" de padrao desde 14/09: com um estilo fixo por campanha, toda peca
  // da semana saia com a mesma cara. No automatico a esteira alterna o estilo
  // por dia e usa as cores da marca (lib/media/direcao-de-arte). Quem escolhe
  // um estilo aqui continua sendo obedecido.
  const [mediaStyle, setMediaStyle] = useState<MediaStyleId>("auto");
  // Default posting time for all weekdays (can be overridden per-day)
  const [defaultPostTime, setDefaultPostTime] = useState<string>("09:00");
  // Per-day posting times
  const [postingTimes, setPostingTimes] = useState<Record<string, string>>({
    "1": "09:00", "2": "09:00", "3": "09:00", "4": "09:00", "5": "09:00", "6": "09:00", "7": "09:00",
  });

  const [topicsPerDay, setTopicsPerDay] = useState<Record<string, string>>({});
  const [loadingTopicsPerDay, setLoadingTopicsPerDay] = useState(false);

  /**
   * O que fazer com os dias cujo horário já passou.
   *
   * O padrão é jogar para a semana seguinte, que é o que a esteira já fazia com
   * dias ANTERIORES desde 18/09 e o que mantém a promessa dos sete dias. O que
   * não existia era perguntar: o dia de HOJE com a hora vencida saía "agora
   * mais dez minutos", e foi assim que a peça de quinta foi publicada 01:25 da
   * sexta sem ninguém ter pedido isso.
   */
  const [horarioPassado, setHorarioPassado] = useState<"semanaSeguinte" | "agora" | "pular">("semanaSeguinte");


  // O padrao e HOJE. "Proxima segunda" era o padrao ate 19/09, e fazia quem
  // queria comecar agora esperar ate quatro dias sem ter pedido isso.
  const todayIso = hojeIso();
  /**
   * NUNCA ANTES DE HOJE. O calendário passa `defaultWeekStart` como a segunda
   * da semana que está aberta na tela, e numa sexta isso é quatro dias atrás.
   * Foi assim que o Bruno viu "Seg 14, Ter 15..." em 19/09 depois de o padrão
   * já ser "hoje": o padrão era hoje só quando ninguém passava nada. Uma data
   * de início no passado não é escolha de ninguém, é sobra de outra tela.
   */
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
    defaultWeekStart && defaultWeekStart > todayIso ? defaultWeekStart : todayIso
  );
  // Os rotulos dos sete dias, calculados da data de inicio. Muda junto com ela.
  const DIAS = useMemo(() => diasDaCampanha(selectedWeekStart), [selectedWeekStart]);
  const [customDateInput, setCustomDateInput] = useState<string>("");
  const weekStart = selectedWeekStart;

  // total steps depends on mode
  const isSingle = campaignMode === "single";
  const isRecurring = campaignMode === "recurring";
  // step 0: mode, step 1: funnel, step 2: schedule (or single picker), step 2.5: times, step 3: confirm
  const totalSteps = isSingle ? 3 : isRecurring ? 2 : 4;

  /**
   * Quais dias pedidos já venceram, e a que horas estamos.
   *
   * O relógio é lido quando a pessoa CHEGA no resumo (`step` é dependência), e
   * não a cada render: sem isso, um "agora" novo a cada pintura faria o bloco
   * mudar de texto enquanto se lê. Ler uma vez ao entrar na tela é o que a
   * pessoa entende por "agora".
   */
  const vencidos = useMemo(() => {
    if (isSingle || isRecurring) return [] as Array<{ dia: (typeof DIAS)[number]; previsto: Date }>;
    const agora = new Date();
    const lista: Array<{ dia: (typeof DIAS)[number]; previsto: Date }> = [];
    for (const d of DIAS) {
      if (!weeklySchedule[d.key]) continue;
      const previsto = new Date(weekStart + "T00:00:00");
      previsto.setDate(previsto.getDate() + (d.dayNum - 1));
      const [h, m] = (postingTimes[d.key] ?? "09:00").split(":").map(Number);
      previsto.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
      if (previsto <= agora) lista.push({ dia: d, previsto });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, weeklySchedule, postingTimes, weekStart, isSingle, isRecurring]);

  const agoraCurto = useMemo(
    () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  function applyDefaultTimeToAll(time: string) {
    setDefaultPostTime(time);
    setPostingTimes({ "1": time, "2": time, "3": time, "4": time, "5": time, "6": time, "7": time });
  }

  /**
   * Antes de mandar a campanha de semana, pergunta ao servidor se os dias
   * escolhidos já têm peça. Com sobreposição, a decisão fica com a pessoa
   * (somar ou substituir). Post único e recorrente saem direto: nunca
   * substituem nada. Falha na conferência não barra: sai somando, que é o
   * caminho que não mexe em nada.
   */
  async function confirmarComAvisoDeSobreposicao(config: CampaignConfig) {
    const diasEscolhidos = Object.keys(config.weeklySchedule).filter((k) => config.weeklySchedule[k as keyof WeeklySchedule]);
    if (isSingle || isRecurring || !projectId || !config.weekStart || diasEscolhidos.length === 0) {
      onConfirm(config);
      return;
    }
    setConferindoSobreposicao(true);
    try {
      const q = new URLSearchParams({
        projectId,
        weekStart: config.weekStart,
        dias: diasEscolhidos.join(","),
        semanas: config.campaignMode === "biweekly" ? "2" : "1",
      });
      const res = await fetch(`/api/pipeline/sobreposicao?${q.toString()}`);
      const data = res.ok ? ((await res.json()) as { aviso: string | null }) : { aviso: null };
      if (data.aviso) {
        setSobreposicao({ aviso: data.aviso, config });
        return;
      }
    } catch {
      // Sem resposta, sai somando: é o caminho que não toca em nada.
    } finally {
      setConferindoSobreposicao(false);
    }
    onConfirm(config);
  }

  function handleConfirm() {
    // SEM REDE NAO HA O QUE PEDIR. Em 14/09 o projeto estava sem conta nenhuma,
    // a janela deixou confirmar, e a esteira devolveu "concluida! 0 posts". A
    // esteira agora recusa com frase de gente; aqui a pessoa nem chega a esperar.
    const semRede = contas.length > 0
      ? destinos.length === 0
      : isSingle ? unicoDisponiveis.length === 0 : platforms.length === 0;
    if (semRede) {
      toast.error("Conecte pelo menos uma rede em Configurações do projeto antes de gerar.");
      return;
    }

    // Compute full UTC ISO timestamps in the browser to preserve user timezone
    let singleScheduledAt: string | undefined;
    let postingTimestamps: Record<string, string> | undefined;

    if (isSingle && singleDate && singleTime) {
      singleScheduledAt = new Date(`${singleDate}T${singleTime}:00`).toISOString();
    }

    if (!isSingle) {
      postingTimestamps = {};
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      for (const [dayKey, time] of Object.entries(postingTimes)) {
        // Only include days that are active in the weekly schedule
        if (!weeklySchedule[dayKey as keyof WeeklySchedule]) continue;

        const dayNum = parseInt(dayKey);
        const base = new Date(weekStart + "T00:00:00");
        base.setDate(base.getDate() + (dayNum - 1));

        // Skip days that are already in the past
        if (base < todayMidnight) continue;

        const dateStr = base.toISOString().split("T")[0];
        postingTimestamps[dayKey] = new Date(`${dateStr}T${time}:00`).toISOString();
      }
    }

    // MATERIAL PRÓPRIO: confere antes de sair, e monta o que vai para a esteira.
    const diasAtivos = isSingle ? [String(singleDay)] : Object.keys(weeklySchedule).filter((k) => weeklySchedule[k as keyof WeeklySchedule]);
    for (const k of diasAtivos) {
      const falta = origemIncompleta(origens[k]);
      if (falta) {
        toast.error(`${WEEK_DAYS.find((d) => String(d.dayNum) === k)?.label ?? "Um dia"}: ${falta}, ou volte para gerar por IA.`);
        return;
      }
    }
    const midiaDoCliente: NonNullable<CampaignConfig["midiaDoCliente"]> = {};
    const temasFinais = { ...topicsPerDay };
    for (const k of diasAtivos) {
      const o = origens[k];
      if (o?.modo !== "meu") continue;
      if (o.tipo === "texto") {
        // O texto do cliente vai como BASE do tema: os redatores ajustam o
        // formato de cada rede e não inventam outra coisa.
        temasFinais[k] =
          `${topicsPerDay[k] ? `${topicsPerDay[k]}. ` : ""}TEXTO DO CLIENTE, use como base e mantenha as ideias, os dados e a voz dele; ajuste só o formato e o tamanho de cada rede, sem acrescentar fatos: """${o.texto?.trim()}"""`;
      } else {
        midiaDoCliente[k] = { tipo: o.tipo, urls: o.urls };
      }
    }

    void confirmarComAvisoDeSobreposicao({
      midiaDoCliente: Object.keys(midiaDoCliente).length ? midiaDoCliente : undefined,
      materiaisDaCampanha: materiaisDaCampanha.length ? materiaisDaCampanha : undefined,
      campaignMode,
      funnelStage,
      weeklySchedule,
      postingTimes,
      singleScheduledAt,
      postingTimestamps,
      singleDay: isSingle ? singleDay : undefined,
      singleDate: isSingle && singleDate ? singleDate : undefined,
      singleTime: isSingle ? singleTime : undefined,
      singlePlatform: isSingle ? singlePlatform : undefined,
      platforms: contas.length > 0 ? redesDosDestinos : isSingle ? undefined : platforms,
      destinos: contas.length > 0 ? destinos : undefined,
      // O formato por rede vai só quando alguém escolheu algo diferente de
      // feed: campanha antiga e cliente que não mexeu continuam exatamente
      // como estavam, sem um campo novo mudando o caminho por acidente.
      formatosPorRede: Object.keys(formatosPorRede).length > 0 ? formatosPorRede : undefined,
      singleContentType: isSingle ? singleContentType : undefined,
      weekStart,
      videoDuration: (isSingle ? singleContentType : Object.values(weeklySchedule).find(v => v === "video") ? "video" : undefined) === "video" ? videoDuration : undefined,
      videoAudio: (isSingle ? singleContentType : Object.values(weeklySchedule).find(v => v === "video") ? "video" : undefined) === "video" ? videoAudio : undefined,
      videoVoz: (isSingle ? singleContentType : Object.values(weeklySchedule).find(v => v === "video") ? "video" : undefined) === "video" && videoAudio ? videoVoz : undefined,
      mediaStyle: campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) ? mediaStyle : undefined,
      topicsPerDay: temasFinais,
      hojeLocal: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
      // Vai sempre, mesmo sem dia vencido: a esteira recalcula o vencimento com
      // o relógio dela, e pode achar um que a tela não viu (a pessoa deixou a
      // janela aberta e o horário venceu no meio). Mandar só quando a tela viu
      // deixaria justamente esse caso sem escolha, que é o defeito de origem.
      horarioPassado: isSingle || isRecurring ? undefined : horarioPassado,
      /**
       * QUAIS DIAS A PESSOA ESCOLHEU DE VERDADE.
       *
       * Fica gravado no config da execução, e não só na tela, porque a próxima
       * vez que alguém perguntar "quem escolheu isto?" a resposta vai estar no
       * banco. Foi exatamente essa pergunta que consumiu uma sessão inteira em
       * 18/09: sem o registro, a única forma de responder foi comparar bit a
       * bit o que estava gravado com o que a tela geraria sozinha.
       */
      diasEscolhidosPeloCliente: isSingle ? undefined : [...diasEscolhidos].sort(),
      laminasDoCarrossel: Object.values(weeklySchedule).includes("carousel") || singleContentType === "carousel"
        ? laminasDoCarrossel
        : undefined,
      videoQualidade: videoWarning ? videoQualidade : undefined,
    });
  }

  /**
   * Sugerir tema de UM dia só.
   *
   * Pedido do Bruno em 18/09: "precisa ter a opção de pedir ajuste de um tema
   * específico, um botão de gerar novo com IA por dia". Sugerir os sete de
   * novo para trocar um custa 21 segundos e derruba os seis que ele já tinha
   * aprovado; é o tipo de escolha que faz a pessoa desistir de ajustar.
   */
  const [diaSugerindo, setDiaSugerindo] = useState<string | null>(null);

  async function sugerirUmDia(chave: string, rotulo: string, formato: string) {
    if (!projectId || diaSugerindo) return;
    setDiaSugerindo(chave);
    try {
      const res = await fetch("/api/ai/topics/per-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          days: [{ dayOfWeek: chave, dayName: rotulo, contentType: formato }],
          // Os outros dias vão junto para a IA não repetir o que já está na
          // tela: trocar um tema por outro igual ao do vizinho não é ajuste.
          evitar: Object.entries(topicsPerDay)
            .filter(([k, v]) => k !== chave && typeof v === "string" && v.trim())
            .map(([, v]) => v),
          // E o tema DESTE dia vai separado, como recusado. Sem ele a IA não
          // sabe o que a pessoa não quis e devolve o mesmo assunto, que foi o
          // que o Bruno viu em 18/09: "carrega, fala que gera, mas nada".
          rejeitado: topicsPerDay[chave] ?? "",
          funnelStage,
        }),
      });
      const data = (await res.json()) as { topicsPerDay?: Record<string, string>; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Erro ${res.status}`);
      const novo = (data.topicsPerDay ?? {})[chave];
      if (!novo?.trim()) throw new Error("A IA não devolveu tema para este dia.");

      // Veio igual ao que já estava? Isso é falha, não sucesso. Dizer "novo
      // tema" com o mesmo texto na tela é o pior dos dois mundos: a pessoa
      // esperou meio minuto e ainda fica achando que o clique não funcionou.
      const anterior = (topicsPerDay[chave] ?? "").trim();
      if (novo.trim() === anterior) {
        toast.error(`A IA devolveu o mesmo tema para ${rotulo}. Tente de novo, ou edite na mão.`, { duration: 6000 });
        return;
      }

      setTopicsPerDay((prev) => ({ ...prev, [chave]: novo }));
      toast.success(`Novo tema para ${rotulo}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(
        msg.includes("Failed to fetch") || msg.includes("504")
          ? "A busca demorou demais. Tente de novo, ou escreva o tema na mão."
          : `Não consegui sugerir: ${msg}`,
        { duration: 6000 }
      );
    } finally {
      setDiaSugerindo(null);
    }
  }

  async function fetchTopicsPerDay() {
    if (!projectId) return;
    setLoadingTopicsPerDay(true);
    try {
      // Build list of active days for this campaign
      const days = isSingle
        ? [{ dayOfWeek: String(singleDay), dayName: WEEK_DAYS.find((d) => d.dayNum === singleDay)?.label ?? "Dia", contentType: singleContentType }]
        : DIAS
            .filter((d) => weeklySchedule[d.key] !== undefined)
            .map((d) => ({ dayOfWeek: d.key, dayName: d.label, contentType: weeklySchedule[d.key] ?? "text" }));

      const res = await fetch("/api/ai/topics/per-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O estagio do funil vai junto: tema de topo, de meio e de fundo sao
        // tipos diferentes de pauta, e nao o mesmo tema escrito de outro jeito.
        body: JSON.stringify({ projectId, days, funnelStage }),
      });
      const data = await res.json() as { topicsPerDay?: Record<string, string>; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Erro ${res.status}`);

      const vindos = data.topicsPerDay ?? {};
      const quantos = Object.values(vindos).filter((v) => typeof v === "string" && v.trim()).length;
      // Resposta VAZIA não é sucesso. Sem esta checagem, um JSON `{}` deixava a
      // tela exatamente igual a uma falha, e as duas voltavam sem dizer nada.
      if (quantos === 0) throw new Error("A IA não devolveu nenhum tema desta vez.");

      setTopicsPerDay((prev) => ({ ...prev, ...vindos }));
      toast.success(`${quantos} ${quantos === 1 ? "tema sugerido" : "temas sugeridos"}. Edite o que não gostar.`);
    } catch (e) {
      /**
       * O ERRO APARECE, e isso é metade do conserto de 18/09.
       *
       * Aqui havia um `catch {}` vazio com o comentário "silently fail, user can
       * type manually". A intenção era boa e o efeito foi o pior possível:
       * **sucesso e falha viravam a mesma coisa do lado de fora**, um spinner
       * que roda e volta.
       *
       * A rota estava morrendo por timeout em TODAS as chamadas (ela leva 21 s
       * e não declarava `maxDuration`), e esse silêncio escondeu isso até o
       * Bruno relatar "roda e nada acontece". Um defeito que o produto não
       * consegue relatar só é encontrado por quem está usando, e tarde.
       *
       * Falha silenciosa não protege ninguém: ela transfere para a pessoa o
       * trabalho de descobrir que falhou.
       */
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(
        msg.includes("Failed to fetch") || msg.includes("504")
          ? "A busca demorou demais e foi interrompida. Tente de novo, ou escreva os temas na mão."
          : `Não consegui sugerir os temas: ${msg}`,
        { duration: 7000 }
      );
    } finally {
      setLoadingTopicsPerDay(false);
    }
  }

  function nextStep() {
    // single: 0 → 1 → 2(picker) → 3(confirm)
    // recurring: 0 → 1 → 3(confirm)
    // weekly/biweekly: 0 → 1 → 2(schedule) → 3(times) → 4(confirm) but we use step 3=times, 4=confirm mapped to step index
    if (isRecurring && step === 1) { setStep(3); return; }
    setStep((s) => s + 1);
  }

  function prevStep() {
    if (isRecurring && step === 3) { setStep(1); return; }
    if (step === 0) { onClose(); return; }
    setStep((s) => s - 1);
  }

  // Dia pulado não é cobrado, e a tela precisa dizer isso antes de gerar.
  // As redes da campanha, que sao as escolhidas e nao as conectadas: publicar
  // em duas custa metade de publicar em quatro, e a janela dizia o mesmo nos
  // dois casos.
  const redesDaCampanha = contas.length > 0 ? redesDosDestinos : platforms;
  const diasComPeca = Object.values(weeklySchedule).filter(Boolean).length;
  const totalCredits = calcTotalCredits(
    weeklySchedule,
    horarioPassado === "pular" ? new Set(vencidos.map((v) => v.dia.key)) : undefined,
    laminasDoCarrossel,
    redesDaCampanha,
    quinzenal ? 2 : 1
  );
  /**
   * Quanto falta para a campanha caber, e ZERO quando cabe.
   *
   * Conta interna não falta nada: o débito não acontece, e mostrar "faltam
   * créditos" para quem não paga é a tela inventando um problema.
   */
  const faltamCreditos =
    saldos === null || saldos.interna ? 0 : Math.max(0, totalCredits - saldos.plano);
  const videoWarning = isSingle ? hasVideo(singleContentType) : hasVideo(weeklySchedule);
  // Last step: single=3, recurring=3, weekly/biweekly=4
  const isLastStep = isSingle ? step === 3 : isRecurring ? step === 3 : step === 4;

  const modeInfo = CAMPAIGN_MODES.find((m) => m.id === campaignMode)!;

  // Determine label for step indicator
  const stepLabels: Record<number, string> = {
    0: "Tipo", 1: "Funil", 2: isSingle ? "Post único" : "Planejamento",
    3: isSingle ? "Confirmar" : isRecurring ? "Confirmar" : "Horários",
    4: "Confirmar",
  };
  const currentLabel = stepLabels[step] ?? "";

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onWheel={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", maxHeight: "92vh" }}
        className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Configurar campanha</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{currentLabel}, passo {step + 1} de {totalSteps + 1}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps + 1 }).map((_, i) => (
                <div
                  key={i}
                  className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-orange-500" : i < step ? "w-3 bg-orange-500/60" : "w-3")}
                  style={i > step ? { background: "var(--border)" } : undefined}
                />
              ))}
            </div>
            <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content — scrollable */}
        <div className="p-6 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
          {origem === null ? (
            <EscolhaDeOrigem
              variante="janela"
              onVideo={() =>
                onEscolherVideo ? onEscolherVideo() : router.push(`/projects/${projectId}/video`)
              }
              onTema={() => setOrigem("tema")}
              onGemeo={() => router.push(`/projects/${projectId}/gemeo`)}
            />
          ) : (
          <AnimatePresence mode="wait">

            {/* Step 0: Campaign mode */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o formato desta campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha se vai criar um post avulso, uma semana inteira ou um ciclo recorrente.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {CAMPAIGN_MODES.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setCampaignMode(mode.id)}
                        className={cn("text-left p-4 rounded-xl border transition-all duration-200", campaignMode === mode.id ? mode.activeColor : mode.color)}
                      >
                        <div className="flex items-start gap-3">
                          <Icon className="w-5 h-5 mt-0.5 shrink-0 text-[var(--text-muted)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{mode.label}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", mode.badgeColor)}>{mode.badge}</span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{mode.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 1: Funnel stage */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qual o propósito desta campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Define o tom, linguagem e tipo de conteúdo que a IA vai gerar.</p>
                </div>
                <div className="grid gap-3">
                  {FUNNEL_OPTIONS.map((opt) => (
                    <button key={opt.id} onClick={() => setFunnelStage(opt.id)} className={cn("w-full text-left p-4 rounded-xl border transition-all", funnelStage === opt.id ? opt.activeColor : opt.color)}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{opt.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{opt.label}</span>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", opt.badgeColor)}>{opt.badge}</span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{opt.description}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {opt.examples.map((ex) => (
                              <span key={ex} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-muted)" }}>{ex}</span>
                            ))}
                          </div>
                        </div>
                        <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all", funnelStage === opt.id ? "border-orange-500 bg-orange-500" : "border-[var(--border)]")} />
                      </div>
                    </button>
                  ))}
                </div>

                {isRecurring && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        A campanha recorrente inclui posts com imagem: escolha o estilo (também vale para vídeos se adicionar depois).
                      </p>
                    </div>
                    <LinhaDaLinguagem projectId={projectId} />
                    {/* O book de modelos (03/10): o molde da arte, já na marca. */}
                    <GaleriaDeModelos projectId={projectId} variante="compacta" aoMudarAprovacao={setIdentidadeAprovada} />
                    {/* A biblioteca de materiais (03/10): as fotos reais desta campanha. */}
                    <MateriaisDaCampanha projectId={projectId} valor={materiaisDaCampanha} aoMudar={setMateriaisDaCampanha} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Weekly schedule OR single post picker */}
            {step === 2 && !isSingle && !isRecurring && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>{contas.length > 0 ? "Por onde sai?" : "Em quais redes?"}</p>
                  <div className="flex flex-wrap gap-2">
                    {contas.map((c) => {
                      const ligada = destinos.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => alternarDestino(c.id)}
                          className={cn(
                            "h-8 px-3 rounded-lg border text-xs font-medium transition-all inline-flex items-center gap-1.5",
                            ligada ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <span className="font-semibold">{NOME_DA_REDE[c.platform] ?? c.platform}</span>
                          <span>· {c.displayName ?? c.platform}</span>
                          <span className="text-[10px] px-1.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                            {c.accountType === "organization" ? "página" : "perfil"}
                          </span>
                          {c.platform === "tiktok" && (
                            <span className="text-[10px] px-1.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                              só vídeo
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {contas.length === 0 && disponiveis.map((r) => {
                      const ligada = platforms.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => alternarRede(r)}
                          className={cn(
                            "h-8 px-3 rounded-lg border text-xs font-medium transition-all",
                            ligada ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          {NOME_DA_REDE[r]}
                        </button>
                      );
                    })}
                    {contas.length === 0 && disponiveis.length === 0 && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma rede conectada ainda. Conecte em Configurações.</span>
                    )}
                  </div>
                  <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                    Cada conta ligada é uma peça a mais por dia. Duas contas da mesma rede recebem o mesmo texto, uma publicação em cada. Instagram só recebe os dias com imagem, carrossel ou infográfico.
                  </p>
                </div>

                {/* Onde a peça cai dentro de cada rede. Vem logo depois de
                    "por onde sai", porque é a mesma pergunta em dois níveis:
                    a rede, e o lugar dentro dela. */}
                <FormatoPorRede
                  redes={contas.length > 0 ? redesDosDestinos : platforms}
                  formatos={formatosPorRede}
                  aoEscolher={escolherFormato}
                  temVideo={Object.values(weeklySchedule).some((t) => t === "video")}
                />

                <PlanejadorSemanal
                  dias={DIAS}
                  tipos={VISIBLE_CONTENT_TYPES}
                  agenda={weeklySchedule as Record<string, string | undefined>}
                  escolhidos={diasEscolhidos}
                  frequencia={postFrequency}
                  quinzenal={campaignMode === "biweekly"}
                  onEscolher={(dia, tipo) =>
                    escolherDoDia(dia as keyof WeeklySchedule, tipo as ContentType | undefined)
                  }
                  onAceitarSugestao={aceitarSugestaoInteira}
                />

                {/*
                  O CARROSSEL, e o número que decide o preço dele.
                  Só aparece quando algum dia pediu carrossel, e ele diz o
                  custo antes de a pessoa escolher, não depois.
                */}
                {Object.values(weeklySchedule).includes("carousel") && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                        Lâminas do carrossel
                      </p>
                      <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        Cada lâmina é uma arte desenhada por IA, com a frase dela. Vale para o
                        Instagram, o LinkedIn e o Facebook; o X não aceita carrossel e recebe o texto.
                        {(() => {
                          const comCarrossel = platforms.filter((p) => REDES_DE_CARROSSEL.includes(p));
                          const teto = comCarrossel.length
                            ? Math.min(...comCarrossel.map((p) => TETO_DE_LAMINAS[p] ?? 10))
                            : 20;
                          return teto < 20 ? ` O Facebook aceita no máximo ${teto}.` : "";
                        })()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[3, 5, 7, 10].map((n) => {
                        const ativo = laminasDoCarrossel === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setLaminasDoCarrossel(n)}
                            className={cn(
                              "flex-1 min-w-[72px] py-2 rounded-xl border text-xs font-medium transition-all",
                              ativo ? "border-purple-500 bg-purple-500/10" : "border-[var(--border)] hover:border-[var(--border-accent)]"
                            )}
                            style={{ color: ativo ? "#c084fc" : "var(--text-primary)" }}
                          >
                            {n} lâminas
                            <span className="block text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
                              {creditosDoCarrossel(n)} créditos
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {scheduleHasVisualMedia(weeklySchedule) && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Vale para todos os dias em que há imagem, vídeo ou carrossel.
                      </p>
                    </div>
                    <LinhaDaLinguagem projectId={projectId} />
                    {/* O book de modelos (03/10): o molde da arte, já na marca. */}
                    <GaleriaDeModelos projectId={projectId} variante="compacta" aoMudarAprovacao={setIdentidadeAprovada} />
                    {/* A biblioteca de materiais (03/10): as fotos reais desta campanha. */}
                    <MateriaisDaCampanha projectId={projectId} valor={materiaisDaCampanha} aoMudar={setMateriaisDaCampanha} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* AS OPCOES DO VIDEO, e elas NAO existiam aqui ate 21/09.
                    O bloco morava so no passo do POST UNICO, entao quem marcava
                    video num dia da semana, que e o caminho normal do produto,
                    recebia o padrao sem ser perguntado: 8 s, rapido, sem fala.
                    O Bruno pediu um video de 60 s na campanha da Demandou e
                    recebeu um clipe mudo de 8 s, porque a pergunta nao existia. */}
                {Object.values(weeklySchedule).includes("video") && (
                  <OpcoesDoVideo
                  cota={cotaDeVideo}
                    saldos={saldos}
                    creditosDeVideo={creditosDeVideo}
                    creditosDeVideoPorDia={creditosDeVideoPorDia}
                    diasDeVideo={diasDeVideo}
                    quinzenal={quinzenal}
                    videoQualidade={videoQualidade}
                    setVideoQualidade={setVideoQualidade}
                    videoDuration={videoDuration}
                    setVideoDuration={setVideoDuration}
                    videoAudio={videoAudio}
                    setVideoAudio={setVideoAudio}
                    videoVoz={videoVoz}
                    setVideoVoz={setVideoVoz}
                  />
                )}
              </motion.div>
            )}

            {/* Step 2 for single: day + date + time + platform + type */}
            {step === 2 && isSingle && (
              <motion.div key="step2-single" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Configure o post único</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha quando, onde e como publicar.</p>
                </div>

                {/* Date + Time row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Data de publicação</p>
                    <input
                      type="date"
                      className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                      value={singleDate}
                      min={todayIso}
                      onChange={(e) => {
                        setSingleDate(e.target.value);
                        if (e.target.value) {
                          const d = new Date(e.target.value + "T00:00:00");
                          const dow = d.getDay() === 0 ? 7 : d.getDay();
                          setSingleDay(dow);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Horário de publicação</p>
                    <input
                      type="time"
                      className="w-full text-sm px-3 py-2 rounded-xl border outline-none"
                      style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                      value={singleTime}
                      onChange={(e) => setSingleTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* O seletor "ou escolha o dia da semana" SAIU em 19/09. Ele só
                    aparecia com a data vazia, e era a armadilha: um dia da
                    semana sem data virava "dia N sobre a segunda da semana",
                    e o post único do Bruno saiu como "Segunda-feira 14" numa
                    sexta 18. Post único é uma data, e a data nasce em hoje. */}

                {/* Platform */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Plataforma</p>
                  {contas.some((c) => c.platform === "linkedin" || c.platform === "twitter") ? (
                    <div className="flex flex-wrap gap-2">
                      {contas.filter((c) => c.platform === "linkedin" || c.platform === "twitter").map((c) => {
                        const ligada = destinos.includes(c.id);
                        return (
                          <button key={c.id} type="button" onClick={() => alternarDestino(c.id)} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all inline-flex items-center gap-1.5", ligada ? "bg-orange-500 border-orange-500 text-white" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]")}>
                            <span className="font-semibold">{NOME_DA_REDE[c.platform] ?? c.platform}</span>
                            <span>· {c.displayName ?? c.platform}</span>
                            <span className="text-[10px] opacity-80">{c.accountType === "organization" ? "página" : "perfil"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : unicoDisponiveis.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Nenhuma rede conectada aceita post único. Conecte o LinkedIn ou o X em
                      Configurações do projeto.
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      {[
                        ...unicoDisponiveis.map((r) => ({ id: r, label: NOME_DA_REDE[r] ?? r })),
                        // "Ambos" só existe quando existem dois.
                        ...(unicoDisponiveis.length > 1 ? [{ id: "both" as const, label: "Ambos" }] : []),
                      ].map((p) => (
                        <button key={p.id} onClick={() => setSinglePlatform(p.id as "linkedin" | "twitter" | "both")} className={cn("px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", singlePlatform === p.id ? "bg-orange-500 border-orange-500 text-white" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]")}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Content type */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>Tipo de conteúdo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {VISIBLE_CONTENT_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      const isActive = singleContentType === ct.id;
                      return (
                        <button key={ct.id} onClick={() => setSingleContentType(ct.id)} className={cn("p-3 rounded-xl border text-left transition-all", isActive ? ct.activeColor : "border-[var(--border)] hover:border-[var(--border-accent)]")}>
                          <Icon className="w-4 h-4 mb-1.5" style={{ color: isActive ? undefined : "var(--text-muted)" }} />
                          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{ct.label}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{ct.description}</p>
                          {ct.credits ? <p className="text-[10px] text-orange-400 mt-1">{ct.credits} créditos · {ct.time}</p> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AS OPCOES DO VIDEO, nos DOIS caminhos desde 21/09.
                    Ate aqui elas so existiam no passo do POST UNICO, e quem marcava
                    video num dia da semana (o caminho normal do produto) recebia o
                    padrao sem ser perguntado: 8 s, rapido, sem fala. O Bruno pediu um
                    video de 60 s na campanha da Demandou e recebeu um clipe mudo de 8 s,
                    porque a pergunta nunca chegou a ser feita. */}
                {singleContentType === "video" && (
                  <OpcoesDoVideo
                  cota={cotaDeVideo}
                    saldos={saldos}
                    creditosDeVideo={creditosDeVideo}
                    creditosDeVideoPorDia={creditosDeVideoPorDia}
                    diasDeVideo={diasDeVideo}
                    quinzenal={quinzenal}
                    videoQualidade={videoQualidade}
                    setVideoQualidade={setVideoQualidade}
                    videoDuration={videoDuration}
                    setVideoDuration={setVideoDuration}
                    videoAudio={videoAudio}
                    setVideoAudio={setVideoAudio}
                    videoVoz={videoVoz}
                    setVideoVoz={setVideoVoz}
                  />
                )}

                {campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Estilo visual da mídia</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Escolha como imagens, vídeos e carrosséis devem parecer (realismo, charge, reportagem, etc.).
                      </p>
                    </div>
                    <LinhaDaLinguagem projectId={projectId} />
                    {/* O book de modelos (03/10): o molde da arte, já na marca. */}
                    <GaleriaDeModelos projectId={projectId} variante="compacta" aoMudarAprovacao={setIdentidadeAprovada} />
                    {/* A biblioteca de materiais (03/10): as fotos reais desta campanha. */}
                    <MateriaisDaCampanha projectId={projectId} valor={materiaisDaCampanha} aoMudar={setMateriaisDaCampanha} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {MEDIA_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMediaStyle(opt.id)}
                          className={cn(
                            "text-left p-2.5 rounded-lg border text-xs transition-all",
                            mediaStyle === opt.id
                              ? "border-orange-500 bg-orange-500/10"
                              : "border-[var(--border)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          <p className="font-medium leading-tight" style={{ color: "var(--text-primary)" }}>{opt.label}</p>
                          <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-muted)" }}>{opt.short}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Start date + Posting times (weekly / biweekly only) */}
            {step === 3 && !isSingle && !isRecurring && (
              <motion.div key="step3-times" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Quando começa a campanha?</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Escolha a data de início e os horários de publicação.</p>
                </div>

                {/* Campaign start date picker */}
                {(() => {
                  const hoje = todayIso;
                  const amanha = maisDias(todayIso, 1);
                  const nextMonday = getNextMonday(1);
                  const isHoje = selectedWeekStart === hoje;
                  const isAmanha = selectedWeekStart === amanha;
                  const isNextWeek = selectedWeekStart === nextMonday;
                  const isCustom = !isHoje && !isAmanha && !isNextWeek;
                  const weeksCount = campaignMode === "biweekly" ? 2 : 1;
                  // Nao existe mais "dia que ja passou": a campanha comeca na
                  // data escolhida e o dia 1 e ela. O unico caso que sobra e
                  // a HORA de hoje ja ter passado, e disso cuida `vencidos`.
                  // Tipado como número e não literal 0: o bloco de aviso
                  // abaixo compara com 1, e o tsc recusa comparar 0 com 1.
                  const pastDaysCount: number = 0;

                  return (
                    <div className="rounded-xl border p-3 space-y-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      {/* Quick presets */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: "Hoje", value: hoje },
                          { label: "Amanhã", value: amanha },
                          { label: "Próxima segunda", value: nextMonday },
                        ].map((opt) => {
                          const isActive = selectedWeekStart === opt.value && !isCustom;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => { setSelectedWeekStart(opt.value); setCustomDateInput(""); }}
                              className={cn(
                                "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                isActive
                                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => { setCustomDateInput(selectedWeekStart); }}
                          className={cn(
                            "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                            isCustom
                              ? "border-orange-500 bg-orange-500/10 text-orange-400"
                              : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
                          )}
                        >
                          Personalizado
                        </button>
                      </div>

                      {/* Warning: past days will be skipped */}
                      {pastDaysCount > 0 && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-yellow-700/40 bg-yellow-900/10">
                          <span className="text-yellow-400 text-[10px] mt-0.5">⚠</span>
                          <p className="text-[10px] text-yellow-300">
                            {pastDaysCount} {pastDaysCount === 1 ? "dia já passou" : "dias já passaram"} e {pastDaysCount === 1 ? "será pulado" : "serão pulados"}.
                            Apenas os dias a partir de hoje serão gerados. Prefira <strong>Próxima segunda</strong> para uma semana completa.
                          </p>
                        </div>
                      )}

                      {/* Custom date input */}
                      {(isCustom || customDateInput) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>Início:</span>
                          <input
                            type="date"
                            className="flex-1 text-xs px-3 py-1.5 rounded-lg border outline-none"
                            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                            value={customDateInput || selectedWeekStart}
                            min={todayIso}
                            onChange={(e) => {
                              // A data e a data. Ate 19/09 ela era encaixada na
                              // segunda-feira daquela semana, e quem escolhia
                              // uma sexta comecava quatro dias antes.
                              setCustomDateInput(e.target.value);
                              setSelectedWeekStart(e.target.value);
                            }}
                          />
                          <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                            (dia 1 em {new Date((customDateInput || selectedWeekStart) + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })})
                          </span>
                        </div>
                      )}

                      {/* Campaign range preview — show actual first/last posting day */}
                      {(() => {
                        const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                        const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

                        // Find first and last FUTURE active day across all weeks
                        const todayMs = new Date().setHours(0,0,0,0);
                        let firstDate: Date | null = null;
                        let lastDate: Date | null = null;

                        for (let wo = 0; wo < weeksCount; wo++) {
                          for (const [key, ct] of Object.entries(weeklySchedule)) {
                            if (!ct) continue;
                            const d = new Date(selectedWeekStart + "T00:00:00");
                            d.setDate(d.getDate() + (parseInt(key) - 1) + wo * 7);
                            if (d.getTime() < todayMs) continue;
                            if (!firstDate || d < firstDate) firstDate = d;
                            if (!lastDate || d > lastDate) lastDate = d;
                          }
                        }

                        if (!firstDate) return null; // all days in the past — handled elsewhere

                        const label = pastDaysCount > 0
                          ? `Começa em ${fmt(firstDate)}${lastDate && lastDate > firstDate ? ` · termina em ${fmt(lastDate)}` : ""}`
                          : `${fmt(firstDate)}${lastDate && lastDate > firstDate ? ` – ${fmt(lastDate)}` : ""}`;

                        return (
                          <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {pastDaysCount > 0 ? "🗓 Início real:" : "Período:"}
                            </span>
                            <span className="text-[10px] font-semibold" style={{ color: pastDaysCount > 0 ? "var(--accent-orange)" : "var(--text-primary)" }}>
                              {label}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Quick time setter */}
                <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>Aplicar mesma hora a todos:</p>
                  <input
                    type="time"
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg border outline-none"
                    style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                    value={defaultPostTime}
                    onChange={(e) => applyDefaultTimeToAll(e.target.value)}
                  />
                </div>

                {/* Per-day times — shows "Dia N" + real calendar date */}
                {(() => {
                  const todayMidnightStep3 = new Date(); todayMidnightStep3.setHours(0, 0, 0, 0);
                  // Only show days that will actually be generated (not in the past)
                  const futureDays = DIAS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const postDate = new Date(weekStart + "T00:00:00");
                    postDate.setDate(postDate.getDate() + (d.dayNum - 1));
                    return postDate >= todayMidnightStep3;
                  });
                  const skippedCount = DIAS.filter((d) => {
                    if (weeklySchedule[d.key] === undefined) return false;
                    const postDate = new Date(weekStart + "T00:00:00");
                    postDate.setDate(postDate.getDate() + (d.dayNum - 1));
                    return postDate < todayMidnightStep3;
                  }).length;
                  return (
                    <div className="space-y-2">
                      {skippedCount > 0 && (
                        <p className="text-[11px] px-1" style={{ color: "var(--text-muted)" }}>
                          ⚠ {skippedCount} {skippedCount === 1 ? "dia anterior foi omitido" : "dias anteriores foram omitidos"}, e apenas os dias abaixo serão gerados.
                        </p>
                      )}
                      {futureDays.map((day, idx) => {
                        const postDate = new Date(weekStart + "T00:00:00");
                        postDate.setDate(postDate.getDate() + (day.dayNum - 1));
                        const dateFmt = postDate.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
                        const contentLabel = CONTENT_TYPES.find((c) => c.id === weeklySchedule[day.key as keyof WeeklySchedule])?.label ?? "";
                        return (
                          <div
                            key={day.dayNum}
                            className="flex items-center gap-3 p-2.5 rounded-xl border"
                            style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
                          >
                            <div className="shrink-0 text-center w-14">
                              <p className="text-[10px] font-bold" style={{ color: "var(--accent-orange)" }}>Dia {idx + 1}</p>
                              <p className="text-[10px] capitalize leading-tight" style={{ color: "var(--text-muted)" }}>{dateFmt}</p>
                            </div>
                            <div className="w-px h-6 shrink-0" style={{ background: "var(--border)" }} />
                            <span className="text-xs flex-1" style={{ color: "var(--text-muted)" }}>{contentLabel}</span>
                            <input
                              type="time"
                              className="text-sm px-2 py-1 rounded-lg border outline-none"
                              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                              value={postingTimes[String(day.dayNum)] ?? "09:00"}
                              onChange={(e) => setPostingTimes((prev) => ({ ...prev, [String(day.dayNum)]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                      {futureDays.length === 0 && (
                        <div className="p-4 rounded-xl border border-yellow-700/40 bg-yellow-900/10 text-center">
                          <p className="text-xs text-yellow-300">Todos os dias desta semana já passaram.</p>
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Escolha <strong>Próxima segunda</strong> na etapa anterior.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {/* Nada sai sem aprovação no card do Paulo: estes horários são a proposta (29/09). */}
                  Cada post sai no horário dele se você aprovar no card do Paulo; sem aprovação, nada é publicado. No Gestor de Conteúdo você também pode publicar na hora ou mudar o horário.
                </p>
              </motion.div>
            )}

            {/* Step 3: Confirmation (single/recurring) or Step 4: Confirmation (weekly/biweekly) */}
            {((step === 3 && (isSingle || isRecurring)) || step === 4) && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Temas por dia</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>A IA sugere um tema atual por dia. Edite ou confirme cada um antes de gerar.</p>
                </div>

                {/* Per-day topics */}
                {(() => {
                  const activeDaysForThemes = isSingle
                    ? [{ key: String(singleDay), label: WEEK_DAYS.find((d) => d.dayNum === singleDay)?.label ?? "Dia", contentType: singleContentType }]
                    : DIAS
                        .filter((d) => weeklySchedule[d.key] !== undefined)
                        .map((d) => ({ key: d.key, label: d.label, contentType: weeklySchedule[d.key] ?? "text" }));

                  const contentTypeLabel = (ct: string) => CONTENT_TYPES.find((c) => c.id === ct)?.label ?? ct;

                  return (
                    <div className="space-y-2 rounded-xl border p-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                          {activeDaysForThemes.length} {activeDaysForThemes.length === 1 ? "dia" : "dias"} selecionado{activeDaysForThemes.length !== 1 ? "s" : ""}
                        </p>
                        {projectId && (
                          <button
                            type="button"
                            onClick={fetchTopicsPerDay}
                            disabled={loadingTopicsPerDay}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all"
                            style={{
                              borderColor: "var(--border)",
                              color: loadingTopicsPerDay ? "var(--text-muted)" : "var(--accent-orange)",
                              background: "var(--bg-elevated)",
                            }}
                          >
                            {loadingTopicsPerDay ? (
                              <><span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Buscando...</>
                            ) : (
                              <><Zap className="w-3 h-3" /> Sugerir todos com IA</>
                            )}
                          </button>
                        )}
                      </div>
                      {activeDaysForThemes.map((d) => (
                        <div key={d.key} className="space-y-1">
                          <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                            {d.label}
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                              {contentTypeLabel(d.contentType)}
                            </span>
                            {/* UM TEMA NOVO SÓ DESTE DIA, sem derrubar os outros seis. */}
                            {projectId && (
                              <button
                                type="button"
                                onClick={() => sugerirUmDia(d.key, d.label, d.contentType)}
                                disabled={diaSugerindo !== null || loadingTopicsPerDay}
                                title={`Gerar outro tema para ${d.label}`}
                                className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-all disabled:opacity-50"
                                style={{
                                  borderColor: "var(--border)",
                                  color: diaSugerindo === d.key ? "var(--text-muted)" : "var(--accent-orange)",
                                  background: "var(--bg-elevated)",
                                }}
                              >
                                {diaSugerindo === d.key ? (
                                  <>
                                    <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    Buscando
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-2.5 h-2.5" />
                                    Outro tema
                                  </>
                                )}
                              </button>
                            )}
                          </p>
                          <input
                            type="text"
                            placeholder={loadingTopicsPerDay ? "Buscando tema..." : "Ex: Como IA está redefinindo o setor financeiro em 2025"}
                            value={topicsPerDay[d.key] ?? ""}
                            onChange={(e) => setTopicsPerDay((prev) => ({ ...prev, [d.key]: e.target.value }))}
                            className="w-full text-xs px-3 py-2 rounded-lg border outline-none transition-all"
                            style={{
                              background: "var(--bg-input)",
                              borderColor: "var(--border)",
                              color: "var(--text-primary)",
                            }}
                          />
                          {projectId && (
                            <OrigemDoDiaCampo
                              projectId={projectId}
                              contentType={d.contentType}
                              valor={origens[d.key]}
                              aoMudar={(v) => setOrigens((o) => ({ ...o, [d.key]: v }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Resumo da campanha</h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Confirme as configurações antes de iniciar.</p>
                </div>

                {/* Mode summary */}
                {(() => {
                  // Compute real first/last posting day (skipping past days)
                  const MONTHS2 = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                  const fmt2 = (d: Date) => `${d.getDate()} ${MONTHS2[d.getMonth()]}`;
                  const weeksCount2 = campaignMode === "biweekly" ? 2 : 1;
                  const todayMs2 = new Date().setHours(0, 0, 0, 0);
                  let firstPostDate: Date | null = null;
                  let lastPostDate: Date | null = null;
                  let futurePostCount = 0;

                  if (!isSingle && !isRecurring) {
                    for (let wo = 0; wo < weeksCount2; wo++) {
                      for (const [key, ct] of Object.entries(weeklySchedule)) {
                        if (!ct) continue;
                        const d = new Date(selectedWeekStart + "T00:00:00");
                        d.setDate(d.getDate() + (parseInt(key) - 1) + wo * 7);
                        if (d.getTime() < todayMs2) continue;
                        futurePostCount++;
                        if (!firstPostDate || d < firstPostDate) firstPostDate = d;
                        if (!lastPostDate || d > lastPostDate) lastPostDate = d;
                      }
                    }
                  }

                  const periodLabel = firstPostDate
                    ? `${fmt2(firstPostDate)}${lastPostDate && lastPostDate > firstPostDate ? ` – ${fmt2(lastPostDate)}` : ""}`
                    : null;

                  // If some days were skipped, adjust the badge count
                  const badgeLabel = (!isSingle && !isRecurring && futurePostCount > 0 && futurePostCount < totalCredits)
                    ? `${futurePostCount} posts`
                    : modeInfo.badge;

                  return (
                    <div className="p-3 rounded-xl border flex items-center gap-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      <modeInfo.icon className="w-5 h-5 text-orange-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{modeInfo.label}</p>
                        {!isSingle && !isRecurring && periodLabel && (
                          <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--accent-orange)" }}>
                            {periodLabel}
                          </p>
                        )}
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{modeInfo.description}</p>
                      </div>
                      <span className={cn("ml-auto text-[10px] font-bold px-2 py-0.5 rounded shrink-0", modeInfo.badgeColor)}>{badgeLabel}</span>
                    </div>
                  );
                })()}

                {/* Funnel summary */}
                {(() => {
                  const f = FUNNEL_OPTIONS.find((o) => o.id === funnelStage)!;
                  return (
                    <div className="p-3 rounded-xl border flex items-center gap-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                      <span className="text-xl">{f.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{f.label}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{f.description}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Single post details */}
                {isSingle && (
                  <div className="p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Post único</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>Dia: <strong className="text-[var(--text-primary)]">{WEEK_DAYS.find((d) => d.dayNum === singleDay)?.label}</strong></span>
                      <span>Plataforma: <strong className="text-[var(--text-primary)]">{singlePlatform === "both" ? "LinkedIn + X" : singlePlatform}</strong></span>
                      <span>Tipo: <strong className="text-[var(--text-primary)]">{CONTENT_TYPES.find((c) => c.id === singleContentType)?.label}</strong></span>
                      {campaignUsesMediaStyle(isSingle, singleContentType, weeklySchedule, isRecurring) && (
                        <span>Estilo de mídia: <strong className="text-[var(--text-primary)]">{MEDIA_STYLE_OPTIONS.find((m) => m.id === mediaStyle)?.label}</strong></span>
                      )}
                    </div>
                  </div>
                )}

                {/* O HORÁRIO JÁ PASSOU, e a escolha é de quem pede a campanha.

                    Nasce de 18/09: a peça de quinta saiu 01:25 da sexta porque
                    a esteira empurrava sozinha o dia vencido para "agora mais
                    dez minutos". O componente está à parte para poder ser
                    renderizado nos cenários reais: aqui dentro ele só existe no
                    último passo, onde nenhum script alcança. */}
                {!isSingle && !isRecurring && (
                  <EscolhaDoHorarioVencido
                    diasVencidos={vencidos.map((v) => v.dia.label)}
                    agora={agoraCurto}
                    totalPedido={Object.values(weeklySchedule).filter(Boolean).length}
                    escolha={horarioPassado}
                    onEscolher={setHorarioPassado}
                  />
                )}
                {/* Weekly grid — only future campaign days */}
                {!isSingle && !isRecurring && (() => {
                  // A meia-noite de hoje saiu daqui: quem decide o que já
                  // venceu agora é `vencidos`, que compara com a HORA e não só
                  // com o dia, e é o mesmo cálculo que alimenta o bloco acima.
                  // Only show days that will actually be generated
                  /**
                   * TODOS os dias pedidos entram no resumo, e não só os que
                   * sobram nesta semana.
                   *
                   * Até 18/09 este bloco listava apenas os dias futuros e
                   * avisava "4 dias omitidos". A esteira agora empurra o que
                   * já passou para a semana seguinte (sete dias pedidos, sete
                   * peças), então o resumo conta a mesma história: cada dia
                   * com a data REAL em que vai sair.
                   */
                  /**
                    * A grade segue a ESCOLHA feita no bloco acima.
                    *
                    * Isto é o conserto da parte 137 levado até o fim: lá a tela
                    * mostrava sete campos de tema e o resumo avisava que quatro
                    * seriam omitidos, duas histórias na mesma janela. Aqui a
                    * promessa e a entrega são a mesma coisa porque saem do mesmo
                    * lugar: o que a pessoa marcar, a grade mostra.
                    */
                  const venceu = new Set(vencidos.map((v) => v.dia.key));
                  const diasPedidos = DIAS.filter(
                    (d) => weeklySchedule[d.key] !== undefined && !(horarioPassado === "pular" && venceu.has(d.key))
                  );
                  const dataDoDia = (d: (typeof DIAS)[number]) => {
                    const dayDate = new Date(weekStart + "T00:00:00");
                    dayDate.setDate(dayDate.getDate() + (d.dayNum - 1));
                    // Passou do horário e a escolha foi adiar: mesmo dia da
                    // semana, sete dias depois. Com "publicar ainda hoje" a
                    // data não muda, e quem empurra é o agendamento.
                    if (venceu.has(d.key) && horarioPassado === "semanaSeguinte") dayDate.setDate(dayDate.getDate() + 7);
                    return dayDate;
                  };
                  const futureDays2 = [...diasPedidos].sort(
                    (a, b) => dataDoDia(a).getTime() - dataDoDia(b).getTime()
                  );
                  const naProximaSemana = horarioPassado === "semanaSeguinte" ? vencidos.length : 0;
                  const colClass =
                    futureDays2.length <= 3 ? "grid-cols-3" :
                    futureDays2.length === 4 ? "grid-cols-4" :
                    futureDays2.length === 5 ? "grid-cols-5" :
                    futureDays2.length === 6 ? "grid-cols-6" :
                    "grid-cols-7";
                  return (
                    <div className="space-y-2">
                      {/* A conta de baixo é a mesma escolha de cima, dita em
                          peças. Frase e grade saem do mesmo cálculo: é isso
                          que impede a tela de prometer sete e entregar três. */}
                      {vencidos.length > 0 && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {horarioPassado === "pular"
                            ? `${futureDays2.length} ${futureDays2.length === 1 ? "peça" : "peças"}. ${vencidos.length === 1 ? "O dia vencido não entra" : `Os ${vencidos.length} dias vencidos não entram`} nesta campanha.`
                            : horarioPassado === "agora"
                              ? `${futureDays2.length} ${futureDays2.length === 1 ? "peça" : "peças"}. ${vencidos.length === 1 ? "Uma sai" : `${vencidos.length} saem`} agora, fora do horário escolhido.`
                              : `${futureDays2.length} ${futureDays2.length === 1 ? "peça" : "peças"}, todas no horário. ${naProximaSemana === 1 ? "Uma cai" : `${naProximaSemana} caem`} na semana que vem.`}
                        </p>
                      )}
                      <div className={cn("grid gap-2", colClass)}>
                        {futureDays2.map((day, idx) => {
                          const ct = CONTENT_TYPES.find((c) => c.id === weeklySchedule[day.key])!;
                          const Icon = ct.icon;
                          const dayDate = dataDoDia(day);
                          // A tarja do cartão diz o que mudou naquele dia, e é
                          // diferente por escolha: "semana que vem" é uma data
                          // nova, "fora do horário" é o mesmo dia noutra hora.
                          const vencido = venceu.has(day.key);
                          const empurrado = vencido && horarioPassado === "semanaSeguinte";
                          const foraDoHorario = vencido && horarioPassado === "agora";
                          const dateShort = dayDate.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
                          return (
                            <div
                              key={day.key}
                              className="p-2.5 rounded-xl border text-center"
                              style={{
                                background: "var(--bg-primary)",
                                borderColor: foraDoHorario
                                  ? "color-mix(in srgb, var(--accent-orange) 55%, transparent)"
                                  : day.isWeekend
                                    ? "color-mix(in srgb, var(--acento) 30%, transparent)"
                                    : "var(--border)",
                              }}
                            >
                              <p className="text-[9px] font-bold mb-0.5" style={{ color: "var(--accent-orange)" }}>Dia {idx + 1}</p>
                              <p className="text-[9px] capitalize mb-1 leading-tight" style={{ color: "var(--text-muted)" }}>
                                {dateShort}
                                {empurrado && <span className="block text-[8px]" style={{ color: "var(--accent-orange)" }}>semana que vem</span>}
                                {foraDoHorario && <span className="block text-[8px]" style={{ color: "var(--accent-orange)" }}>fora do horário</span>}
                              </p>
                              <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--text-primary)" }} />
                              <p className="text-[9px] font-medium" style={{ color: "var(--text-primary)" }}>{ct.label}</p>
                              {ct.credits && <p className="text-[9px] text-[var(--text-muted)]">{ct.credits}cr</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Credits */}
                {!isSingle && !isRecurring && (
                  <div className="p-3 rounded-xl border" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Esta campanha cobra do plano</span>
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{totalCredits} créditos</span>
                    </div>
                    {/* QUANTO VOCÊ TEM, na mesma caixa da conta. Pedido do Bruno
                        em 19/09: custo sem saldo do lado "fica ruim". Vermelho
                        quando não cabe, porque a esteira vai barrar de qualquer
                        jeito e é melhor saber aqui. */}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Você tem no plano</span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: faltamCreditos > 0 ? "#f87171" : "var(--text-muted)" }}
                      >
                        {saldos === null ? "…" : `${saldos.plano} créditos`}
                      </span>
                    </div>
                    {diasDeVideo > 0 && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Vídeo (saldo próprio)</span>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: saldos && saldos.video < creditosDeVideo ? "#f87171" : "var(--text-muted)" }}
                        >
                          {saldos === null ? "…" : `${creditosDeVideo} de ${saldos.video} que você tem`}
                        </span>
                      </div>
                    )}
                    {quinzenal && (
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        O total já conta as duas semanas da quinzenal.
                      </p>
                    )}

                    {/* A CONTA INTERNA NAO DEBITA, e a tela precisa dizer isso.

                        O Bruno viu "cobra do plano 688 créditos" e depois viu o
                        saldo parado em 1400: a conta dele é admin, o débito
                        grava uma linha de valor zero com a nota "custaria N
                        créditos", e o saldo nunca desce. Estava certo e mudo,
                        que é como uma pessoa conclui que a plataforma quebrou. */}
                    {saldos?.interna && (
                      <p className="text-[10px] mt-2 rounded-lg px-2 py-1.5" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Conta interna:</strong> nada será debitado.
                        O extrato registra o que a campanha teria custado, e o custo real de IA continua medido.
                      </p>
                    )}

                    {/* SEM SALDO, UM CONVITE, e não um beco.

                        Pedido do Bruno em 21/09: "se de fato acabar, precisa
                        levar o cliente a comprar mais créditos, não só dar
                        erro; o usuário precisa querer tanto gerar aquela
                        campanha que vai colocar mais créditos". Então a caixa
                        diz o que falta, o que ele perde se cortar, e leva
                        direto para a compra. */}
                    {faltamCreditos > 0 && (
                      <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.08)" }}>
                        <p className="text-xs font-semibold" style={{ color: "#b45309" }}>
                          Faltam {faltamCreditos} créditos para esta campanha sair inteira.
                        </p>
                        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                          São {totalCredits} créditos de {diasComPeca} dia(s) de conteúdo em{" "}
                          {Math.max(1, redesDaCampanha.length)} rede(s){quinzenal ? ", em duas semanas" : ""}.
                          {" "}
                          {saldos?.dono
                            ? `${fraseDosCreditosDaEquipe(saldos.dono, { necessario: totalCredits, disponivel: saldos.plano })} Ou tire um dia e rode o resto agora.`
                            : "Com mais créditos, a semana sai completa; sem eles, dá para tirar um dia e rodar o resto agora."}
                        </p>
                        <div className="flex gap-2 mt-2.5">
                          {/* Membro da equipe não compra (01/10): sem o botão. */}
                          {!saldos?.dono && (
                            <a
                              href="/settings?comprar=1#comprar-creditos"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-center text-xs font-semibold py-2 rounded-lg transition-all"
                              style={{ background: "#f59e0b", color: "#1f1300" }}
                            >
                              Comprar créditos
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="flex-1 text-xs font-medium py-2 rounded-lg border transition-all"
                            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                          >
                            Tirar um dia
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {videoWarning && !isSingle && (
                  <div className="flex items-start gap-2 p-3 rounded-xl border border-yellow-800/40 bg-yellow-900/10">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    {/* O AVISO ESTAVA MENTINDO DESDE 19/09.

                        "Mantenha a aba aberta" era verdade quando o vídeo era
                        gerado dentro da requisição. Desde 19/09 ele roda na
                        FILA, no servidor, e fechar a aba não muda nada. O
                        Bruno leu isso em 21/09 e a primeira reação foi de
                        desconfiança, com razão: um aviso que pede vigília para
                        algo que roda sozinho ensina que a plataforma é frágil. */}
                    <p className="text-xs text-yellow-300">
                      {diasDeVideo > 0 ? `${diasDeVideo} dia(s) com vídeo. ` : ""}
                      Cada geração leva de 1 a 5 minutos e roda no servidor, depois do dia:
                      {" "}você pode fechar a aba. O vídeo aparece no card quando fica pronto
                      {geracoesPorVideo > 1 ? `, e um de ${videoDuration}s são ${geracoesPorVideo} gerações encadeadas` : ""}.
                    </p>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
          )}
        </div>

        {/* Footer — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
          <Button
            variant="ghost"
            onClick={origem === null ? onClose : step === 0 ? () => setOrigem(null) : prevStep}
            style={{ color: "var(--text-muted)" }}
          >
            {origem === null ? "Cancelar" : <><ChevronLeft className="w-4 h-4" />Voltar</>}
          </Button>

          {origem === null ? null : !isLastStep ? (
            <Button onClick={nextStep}>
              Próximo
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : sobreposicao ? (
            // A escolha é da pessoa: somar ao dia (nada é tocado) ou substituir os rascunhos.
            <div className="flex flex-col items-end gap-2">
              <p className="max-w-[360px] text-right text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {sobreposicao.aviso}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const config = { ...sobreposicao.config, substituirRascunhos: true };
                    setSobreposicao(null);
                    onConfirm(config);
                  }}
                  style={{ color: "var(--text-muted)" }}
                >
                  Substituir os rascunhos desses dias
                </Button>
                <Button
                  onClick={() => {
                    const config = { ...sobreposicao.config, substituirRascunhos: false };
                    setSobreposicao(null);
                    onConfirm(config);
                  }}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <Zap className="w-4 h-4" />
                  Somar ao dia
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              {/* A trava da identidade (05/10): avisa antes de gerar, sem barrar os textos.
                  06/10: com o link direto para Modelos de arte, e lendo o estado
                  sozinho quando o book não apareceu nesta campanha. */}
              <AvisoDaIdentidade projectId={projectId} temArte={campanhaTemArte} aprovada={identidadeAprovada === null ? undefined : identidadeAprovada} compacto />
              <Button onClick={handleConfirm} disabled={conferindoSobreposicao} className="bg-orange-500 hover:bg-orange-600">
                <Zap className="w-4 h-4" />
                {conferindoSobreposicao ? "Conferindo os dias..." : "Gerar campanha"}
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
