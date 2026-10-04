/**
 * O EDITOR SOB MEDIDA (03/10/2026): os tipos da edição que o agente editor
 * escreve e o app resolve (lib/media/editor-sob-medida/tipos.ts é o ESPELHO
 * deste arquivo; mudou lá, muda aqui, e `versao` existe para o worker recusar
 * uma edição que ele não conhece).
 *
 * O desenho é o do vídeo de pitch da landing (scratchpad/pitch/v4): a
 * gravação passa pelo ffmpeg (enquadramento, zoom, cartão, inserção) e as
 * CAMADAS (títulos, cartões, linhas do tempo, números) são desenhadas aqui,
 * transparentes, e compostas por cima. O Remotion só desenha os quadros em que
 * alguma camada se mexe; o resto é um quadro parado que o ffmpeg segura.
 */

export type Visual = "vidro" | "impacto" | "documental";

export type Tema = {
  /** O acento que brilha (avivado quando a cor da marca é apagada). */
  acento: string;
  /** A cor original da marca, só para o que é identidade. */
  acentoMarca?: string;
  escuro: string;
  claro: string;
  /** Família do título e do texto, já carregadas (ver carregarFontesDoTema). */
  fonteTitulo: string;
  pesoTitulo: number;
  fonteTexto: string;
  fonteMono: string;
  /** O acabamento das peças: o vidro do pitch, o bloco do Hormozi ou o papel do documentário. */
  visual: Visual;
  caixaAlta: boolean;
  /**
   * O ACABAMENTO DAS PEÇAS DA LOUSA (04/10): "tecnologico" (a lousa do Dan
   * Martell: azul, ciano, vidro claro) ou "luxo" (a autoridade high ticket:
   * preto e marinho, dourado metálico, serifa elegante). Sem o campo, tecnológico.
   */
  acabamento?: "tecnologico" | "luxo";
};

export type CamadaResolvida = {
  id: string;
  peca: string;
  /** Segundos no tempo da base (o completo limpo). */
  de: number;
  ate: number;
  /** Duração da entrada e da saída (s): a animação só acontece nelas e nos eventos. */
  entrada: number;
  saida: number;
  /** Instantes (s, tempo da base) em que um passo da peça acende. */
  eventos: number[];
  /** Duração da animação de cada evento (s). */
  evento: number;
  props: Record<string, unknown>;
  /**
   * As passadas em que a camada é desenhada (03/10, segunda volta): "frente"
   * (sempre), "atras" (o que vai por baixo da pessoa recortada) e "vidro" (a
   * máscara do desfoque da gravação). Sem o campo, só "frente".
   */
  passes?: Array<"frente" | "atras" | "vidro">;
  /** A camada se mexe o tempo todo (palco com câmera, título que deriva): todo quadro vai ao Chrome. */
  continua?: boolean;
};

/** Um trecho da linha condensada: quadros c0..c0+n-1 mostram o tempo t0 + k/fps (n=1: um quadro parado). */
export type Trecho = { c0: number; t0: number; n: number };

export type PropsDasCamadas = {
  largura: number;
  altura: number;
  fps: number;
  tema: Tema;
  camadas: CamadaResolvida[];
  trechos: Trecho[];
  logoUrl?: string | null;
  /** A passada desta renderização (ver Camadas.tsx). */
  passe?: "frente" | "atras" | "vidro";
};

export type PropsDoFundo = {
  largura: number;
  altura: number;
  tema: Tema;
  /** Cartão da gravação (pixels): o fundo leva a sombra dele. */
  cartao?: { x: number; y: number; w: number; h: number } | null;
};

/** O que cada peça recebe para desenhar o instante. */
export type ContextoDaPeca = {
  /** Segundos desde o começo da camada. */
  t: number;
  dur: number;
  /** 0 a 1, a entrada já suavizada. */
  entra: number;
  /** 1 a 0 na saída. */
  fica: number;
  /** Progresso suavizado de cada evento (0 antes, 1 depois). */
  passos: number[];
  props: Record<string, unknown>;
  tema: Tema;
  W: number;
  H: number;
  vertical: boolean;
  /** Unidade de medida: 1 = 1 px num quadro de 1080 de lado menor. */
  u: number;
  logoUrl?: string | null;
};
