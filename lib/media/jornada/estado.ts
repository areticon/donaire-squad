import { randomBytes } from "node:crypto";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";

/**
 * O EDITOR PELA JORNADA OFICIAL (06/10/2026, docs/editor-jornada-0610.md).
 *
 * A jornada do Bruno, em 8 passos: upload; transcrição e limpeza; leitura do
 * vídeo pelo Gemini; a IA escolhe os elementos; o usuário aprova ou revisa; o
 * Sonnet escreve um prompt por elemento para a Higgsfield; o JEV monta; o
 * vídeo pronto vai ao usuário. Três papéis, sem mistura: o Gemini DESCREVE, o
 * Sonnet ESCREVE, o JEV DECIDE; o código calcula opções e executa.
 *
 * Esta é a esteira nova, atrás de EDITOR_JORNADA=1 (desligada por padrão: com
 * o interruptor desligado a produção se comporta exatamente como antes). Ela
 * NÃO chama nada da seção C do documento (fichas e blocos de estilo, famílias,
 * peças desenhadas em código, catálogo de tipos, guardas que tiram peça,
 * conferência visual que replaneja, recuo silencioso, cache por hash do
 * prompt, legenda que ignora a escolha, cobertura de buracos, grão e vinheta).
 *
 * Este módulo: o estado que a jornada grava, o nome único de cada mídia
 * (CADA EDIÇÃO É NOVA) e o ROTEADOR, o único ponto que escolhe a esteira do
 * completo. Módulo puro.
 */

// ─────────────────────────────── interruptor e roteador ───────────────────────────────

/** A esteira nova do completo. Desligada por padrão. */
export function editorJornadaLigado(): boolean {
  return process.env.EDITOR_JORNADA === "1";
}

export type EsteiraDoCompleto = "jornada" | "por-comando" | "sob-medida" | "antiga";

/**
 * O ROTEADOR (risco 8 do documento): o único lugar que escolhe a esteira do
 * completo. Com a jornada ligada, os caminhos antigos (por comando, sob
 * medida, a esteira por blocos) ficam desligados para o completo; eles não são
 * apagados (decisão do Bruno: apagar depois de duas semanas).
 */
export function esteiraDoCompleto(o: { porComando: boolean; sobMedida: boolean }): EsteiraDoCompleto {
  if (editorJornadaLigado()) return "jornada";
  if (o.porComando) return "por-comando";
  if (o.sobMedida) return "sob-medida";
  return "antiga";
}

// ─────────────────────────────── o contrato ───────────────────────────────

/** Como a mídia gerada entra no vídeo (onde e como; nunca o que ela mostra). */
export const FORMATOS_DA_JORNADA = ["tela-cheia", "janela", "recorte-sobre", "broll"] as const;
export type FormatoDaJornada = (typeof FORMATOS_DA_JORNADA)[number];

export const MIDIAS_DA_JORNADA = ["imagem", "recorte", "video"] as const;
export type MidiaDaJornada = (typeof MIDIAS_DA_JORNADA)[number];

/** O papel do elemento: o comum, a abertura do vídeo e a chamada (curtir, inscrever), todos decididos pela IA. */
export type PapelDoElemento = "elemento" | "abertura" | "chamada";

export type ElementoProposto = {
  /** Único na edição. */
  id: string;
  /** O momento, no tempo da fala do completo (o tempo editado), em s. */
  momento: { indice: number; de: number; ate: number; frase: string };
  /** A palavra da fala em que o elemento entra. */
  gatilho: { palavra: string; indice: number; t: number };
  /** Em português: o que o usuário lê e pode revisar. */
  descricao: string;
  /** O texto exato pedido na arte: só palavras ditas, número dito ou marca citada (ou a chamada curta). */
  textoNaImagem: string | null;
  midia: MidiaDaJornada;
  formato: FormatoDaJornada;
  /** Uma linha: a ligação com a fala. */
  porque: string;
  /** Estimativa pela tabela única de preços. */
  custoUsd: number;
  origem: "ia" | "usuario";
  papel: PapelDoElemento;
};

export type PlanoDaJornada = {
  versao: 1;
  /** Novo a cada plano. */
  edicaoId: string;
  /** O comando do cliente, literal (o estilo em linguagem natural). */
  estiloDoCliente: string;
  densidade: { segundosEntreElementos: [number, number]; porque: string };
  elementos: ElementoProposto[];
  custoTotalUsd: number;
  feitoEm: string;
  formato: "9:16" | "16:9";
  duracao: number;
};

export type RevisaoDoElemento = {
  id: string;
  acao: "aprovado" | "removido" | "alterado" | "novo";
  /** O que o usuário escreveu, literal, em ordem. */
  pedidos: Array<{ texto: string; em: string }>;
  descricaoAprovada: string;
  textoNaImagemAprovado: string | null;
};

/** O elemento como foi aprovado (congelado): é exatamente o que vai ao ar. */
export type ElementoAprovado = ElementoProposto & { pedidos: string[] };

/** `completoMontagem.roteiro.jornada`: o que a jornada grava até a aprovação. */
export type EstadoDaJornada = {
  versao: 1;
  edicaoId: string;
  /** A leitura do vídeo ANTES do plano (passo 3), no tempo editado. */
  leitura: LeituraDoVideo | null;
  /** As amostras da medição no tempo editado (rosto e corpo a cada ~2 s), para o passo 7. */
  amostras?: AmostraDaJornada[] | null;
  plano: PlanoDaJornada | null;
  revisao: Record<string, RevisaoDoElemento>;
  /** A aprovação congela o plano: nada depois acrescenta, tira ou troca elemento. */
  aprovado: { em: string; elementos: ElementoAprovado[] } | null;
  erro?: string | null;
  avisos?: string[];
  custoUsd?: number;
  tempos?: Record<string, number>;
};

/** Uma amostra da medição (fração do quadro), compacta. */
export type AmostraDaJornada = { t: number; rostos: Caixa[]; corpos: Caixa[]; tela?: Caixa | null; quadro?: Caixa | null };
export type Caixa = { x: number; y: number; w: number; h: number };

// ─────────────────────────────── cada edição é nova ───────────────────────────────

/** Um id novo de edição: o instante e bytes aleatórios. Nunca repete. */
export function novaEdicaoId(): string {
  return `e${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
}

const limpo = (s: string | null | undefined, n: number) =>
  String(s ?? "")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, n);

/**
 * O NOME ÚNICO de uma mídia da jornada: `edicao/{video}/{edicao}/{elemento}-{aleatorio}.{ext}`.
 * Duas gerações com a mesma entrada nunca dão o mesmo nome; nada de hash do
 * prompt, nada de consulta a geração anterior.
 */
export function nomeDaMidia(o: { videoId: string | null | undefined; edicaoId: string; elementoId: string; ext: string }): string {
  const aleatorio = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  return `edicao/${limpo(o.videoId, 40) || "sem-video"}/${limpo(o.edicaoId, 40) || "sem-edicao"}/${limpo(o.elementoId, 40) || "el"}-${aleatorio}.${limpo(o.ext, 5) || "bin"}`;
}

/** As opções do `put` do Blob na jornada: sufixo aleatório, nunca por cima. */
export const GRAVACAO_DA_JORNADA = { addRandomSuffix: true, allowOverwrite: false } as const;

/** O estado vazio da jornada de um vídeo. */
export function estadoNovo(): EstadoDaJornada {
  return { versao: 1, edicaoId: novaEdicaoId(), leitura: null, amostras: null, plano: null, revisao: {}, aprovado: null, avisos: [] };
}

/** Sem travessão em texto nenhum (regra do Bruno): troca o em dash e o en dash por vírgula. */
export function semTravessao(s: string): string {
  return String(s ?? "").replace(new RegExp("\\s*[" + String.fromCharCode(0x2014, 0x2013) + "]\\s*", "g"), ", ");
}

/** mm:ss de um instante (para os avisos ao cliente). */
export function mmss(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
