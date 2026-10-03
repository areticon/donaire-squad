/**
 * O EDITOR SOB MEDIDA (03/10/2026): os tipos.
 *
 * Dois níveis:
 *   - EdicaoDoEditor: o que o agente editor ESCREVE, com o tempo ancorado na
 *     fala ("F12:Diana" = começo da palavra Diana na frase 12), como o
 *     `q(bloco, palavra)` do programa do pitch. O modelo nunca escreve segundo.
 *   - EdicaoResolvida: o que vai ao worker, em segundos e pixels. ESPELHO de
 *     worker/remotion/src/sob-medida/tipos.ts (o worker é publicado sem lib/).
 *
 * Módulo puro.
 */

export type Visual = "vidro" | "impacto" | "documental";

export type Tema = {
  acento: string;
  escuro: string;
  claro: string;
  fonteTitulo: string;
  pesoTitulo: number;
  fonteTexto: string;
  fonteMono: string;
  visual: Visual;
  caixaAlta: boolean;
  /** A cor da caixa da legenda (o escuro da marca levado ao quase preto). */
  escuroLegenda?: string;
};

export type CamadaResolvida = {
  id: string;
  peca: string;
  de: number;
  ate: number;
  entrada: number;
  saida: number;
  eventos: number[];
  evento: number;
  props: Record<string, unknown>;
};

export type Caixa = { x: number; y: number; w: number; h: number };

/** Como a gravação aparece num trecho. Fora de todo plano, ela está cheia (com a câmera). */
export type PlanoResolvido =
  | { de: number; ate: number; tipo: "grafico" }
  | { de: number; ate: number; tipo: "cartao"; caixa: Caixa; zoom: number; x: number; y: number }
  | { de: number; ate: number; tipo: "insercao"; midia: string };

/** Um enquadramento da gravação cheia: zoom (1 = quadro inteiro) com o foco em fração do quadro. */
export type Enquadramento = { de: number; ate: number; zoom: number; x: number; y: number; movimento: "fixo" | "empurrao"; zoomFinal?: number };

export type EdicaoResolvida = {
  versao: 1;
  largura: number;
  altura: number;
  /** Fps das camadas (o Remotion); o vídeo sai no fps da base. */
  fps: number;
  duracao: number;
  tema: Tema;
  logoUrl: string | null;
  camadas: CamadaResolvida[];
  planos: PlanoResolvido[];
  camera: Enquadramento[];
  legenda: { paginas: Array<{ inicio: number; fim: number; texto: string }> } | null;
  insercoes: Record<string, { url: string; tipo: "imagem" | "video" }>;
};

// ─────────────────────────────── o que o editor escreve ───────────────────────────────

/** Âncora na fala: "F12", "F12/fim", "F12:palavra", "F12:palavra/fim", "F12:palavra#2". */
export type Ancora = string;

export type MomentoDoEditor = {
  id?: string;
  peca: string;
  de: Ancora;
  ate: Ancora;
  /** Os instantes em que cada passo/item acende, na ordem dos itens. */
  eventos?: Ancora[];
  /** Força o plano da gravação (sem ele, o catálogo decide pela peça). */
  plano?: "cheio" | "grafico" | "cartao";
  props: Record<string, unknown>;
  porque?: string;
};

export type CameraDoEditor = {
  de: Ancora;
  ate: Ancora;
  zoom: number;
  foco?: { x: number; y: number };
  movimento?: "fixo" | "empurrao";
  porque?: string;
};

export type InsercaoDoEditor = {
  id?: string;
  de: Ancora;
  ate: Ancora;
  /** O pedido de imagem como briefing de foto, em inglês. */
  briefing: string;
  porque?: string;
};

export type EdicaoDoEditor = {
  /** A leitura do vídeo em duas ou três frases: o que é, para quem, o fio. */
  leitura?: string;
  momentos: MomentoDoEditor[];
  camera?: CameraDoEditor[];
  insercoes?: InsercaoDoEditor[];
};
