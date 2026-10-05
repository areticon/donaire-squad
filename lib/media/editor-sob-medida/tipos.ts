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
  /** O acento que BRILHA (lib/media/editor-sob-medida/cor.ts): o da marca, avivado quando apagado. */
  acento: string;
  /** A cor original da marca, só para o que é identidade (o botão do fecho). */
  acentoMarca?: string;
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
  /**
   * O ACABAMENTO DAS PEÇAS DA LOUSA (04/10): "tecnologico" (a lousa do Dan
   * Martell: azul, ciano, vidro claro) ou "luxo" (a autoridade high ticket:
   * preto e marinho, dourado metálico, serifa elegante). Sem o campo, tecnológico.
   */
  acabamento?: "tecnologico" | "luxo";
  /**
   * OS ACENTOS DA MARCA NO VOX (05/10, editor por comando): a faixa do
   * marca-texto e a tinta do carimbo na cor da marca; o papel continua o do
   * Vox. Sem o campo, o amarelo e o vermelho do Vox.
   */
  vox?: { realce?: string; carimbo?: string };
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
  /** As passadas do Remotion (03/10, segunda volta): "frente", "atras" (por baixo da pessoa recortada), "vidro" (a máscara do desfoque). Sem o campo, só "frente". */
  passes?: Array<"frente" | "atras" | "vidro">;
  /** A camada se mexe o tempo todo (palco com câmera virtual): todo quadro vai ao Chrome. */
  continua?: boolean;
};

export type Caixa = { x: number; y: number; w: number; h: number };

/** Como a gravação aparece num trecho. Fora de todo plano, ela está cheia (com a câmera). */
export type PlanoResolvido =
  | { de: number; ate: number; tipo: "grafico" }
  | { de: number; ate: number; tipo: "cartao"; caixa: Caixa; zoom: number; x: number; y: number }
  | { de: number; ate: number; tipo: "insercao"; midia: string };

/**
 * A mídia de uma inserção. `origem` "banco" é o B-ROLL de banco de vídeo
 * (Pexels, lib/media/editor-sob-medida/broll.ts): curto, reenquadrado, com a
 * cor casada à gravação e transição de chicote; `inicio` é o segundo do
 * arquivo em que o trecho começa. Sem `origem`, a inserção de cinema gerada.
 */
export type MidiaDaInsercao = { url: string; tipo: "imagem" | "video"; origem?: "banco" | "gerado"; inicio?: number; credito?: string };

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
  /**
   * `faixa` (05/10, lib/media/editor-sob-medida/faixa-da-legenda.ts): onde a
   * página vai no 9:16 para não cair em cima do texto de uma peça. Sem o
   * campo, embaixo (o lugar de sempre).
   */
  legenda: { paginas: Array<{ inicio: number; fim: number; texto: string; faixa?: "baixo" | "topo" | "oculta" }> } | null;
  insercoes: Record<string, MidiaDaInsercao>;
  /** As telas cheias têm PALCO próprio (opaco, com câmera): o worker deixa a gravação por baixo em vez do fundo parado. */
  palco?: boolean;
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

/** O B-ROLL que o editor pede: uma consulta CURTA e concreta em inglês para o banco de vídeo. */
export type BrollDoEditor = {
  id?: string;
  de: Ancora;
  ate: Ancora;
  /** 2 a 4 palavras concretas em inglês ("hands kneading dough", "city traffic night"). */
  consulta: string;
  porque?: string;
};

export type EdicaoDoEditor = {
  /** A leitura do vídeo em duas ou três frases: o que é, para quem, o fio. */
  leitura?: string;
  momentos: MomentoDoEditor[];
  camera?: CameraDoEditor[];
  insercoes?: InsercaoDoEditor[];
  /** B-roll de banco (03/10, terceira volta): imagem real que a fala cita. */
  broll?: BrollDoEditor[];
  /** As palavras de ênfase (âncoras) que levam ZOOM DE SOCO na câmera. */
  enfases?: Ancora[];
};
