/**
 * ESPELHO dos tipos de lib/media/plano-de-montagem.ts (MontagemResolvida).
 *
 * O worker é publicado com o contexto de build da pasta worker/, que não
 * enxerga lib/, então o tipo mora nos dois lados. A conta (geometria, tempo,
 * regra de não cobrir o rosto) mora SÓ lá; aqui o Remotion apenas desenha o
 * que recebeu pronto. Mudou lá, muda aqui: `versao` existe para o worker
 * recusar um plano de desenho que ele não conhece.
 */

export type Retangulo = { x: number; y: number; w: number; h: number };

export type Layout =
  | "narrador-cheio"
  | "narrador-canto"
  | "narrador-na-foto"
  | "narrador-recortado"
  | "tela-dividida"
  | "broll-cheio"
  | "cartela"
  // PIP com um terço livre (01/10): a pessoa num terço, entrando e saindo de lado.
  | "pip-terco";

export type Movimento = "estatico" | "zoom-in-lento" | "zoom-out" | "punch";
export type Transicao = "corte" | "folha-de-papel" | "deslize" | "flash" | "fundir";
export type Fundo = "papel" | "papel-marca" | "escuro";
// faixa, selo e comentario (02/10): os do consórcio (faixa rasgada de valor, selo com check, comentário respondido).
export type TipoDeElemento = "recorte" | "marca-texto" | "letras-revista" | "carimbo" | "tarja" | "numero" | "barras" | "seta" | "circulo" | "titulo" | "icone-pop" | "faixa" | "selo" | "comentario";
export type SaidaDoElemento = "cair" | "encolher" | "deslizar" | "fica";

export type NarradorResolvido = {
  modo: "video" | "recortado";
  caixa: Retangulo;
  recorte: Retangulo;
  moldura: "nenhuma" | "canto" | "foto";
  rotacao: number;
  origemDoZoom: { x: number; y: number };
};

export type MidiaResolvida = {
  url: string;
  tipo: "imagem" | "video";
  caixa: Retangulo;
  rotacao: number;
  /** papel: foto impressa com fita (colagem); limpa: janela reta (impacto e sóbrio). */
  moldura: "papel" | "nenhuma" | "limpa";
  /** Segundo do vídeo gerado em que a cena começa (continuação da cena anterior). */
  inicioNoVideo?: number;
};

export type ElementoResolvido = {
  tipo: TipoDeElemento;
  caixa: Retangulo;
  inicio: number;
  /**
   * Segundo em que começa a sair, e como. Opcionais AQUI (obrigatórios no
   * app): um plano resolvido antes de 29/09 não os tem, e o elemento fica até
   * o fim da cena como antes.
   */
  fim?: number;
  saida?: SaidaDoElemento;
  /** Palavras faladas do texto com o tempo de cada uma (marca-texto e tarja). */
  palavras?: { texto: string; inicio: number; fim: number }[];
  rotacao: number;
  texto?: string;
  url?: string;
  entrada?: "cair" | "deslizar" | "pop";
  valor?: number;
  prefixo?: string;
  sufixo?: string;
  rotulo?: string;
  titulo?: string;
  itens?: { rotulo: string; valor: number; texto: string }[];
  semente: number;
  /** Ícone pop do impacto (check, x, raio...). */
  nome?: string;
  /** Fonte do número no sóbrio, só quando foi dita. */
  fonte?: string;
  /** Selo do consórcio: com o círculo de check (marca) ou sem (rótulo da frase dita). */
  check?: boolean;
  /** Comentário respondido: o @ de quem comentou, só quando foi dito. */
  autor?: string;
};

export type CenaResolvida = {
  inicio: number;
  fim: number;
  layout: Layout;
  movimento: Movimento;
  /** Segundo da palavra forte (punch e zoom). Opcional pelo mesmo motivo de `fim`. */
  movimentoEm?: number;
  /** Ponto para onde a câmera da cena aponta, em pixels do quadro. */
  foco?: { x: number; y: number };
  transicao: Transicao;
  fundo: Fundo;
  narrador: NarradorResolvido | null;
  midia: MidiaResolvida | null;
  elementos: ElementoResolvido[];
  legenda: { x: number; y: number; largura: number };
  /** A pessoa em tela cheia (01/10), para quando o recorte da cena recortada falhar. */
  reserva?: NarradorResolvido;
  /** Tela compartilhada no completo (01/10): zoom na região, feito pelo ffmpeg da base; aqui só viaja. */
  tela?: { regiao: Retangulo; zoom: number; webcam?: Retangulo | null; modo?: "zoom" | "popup"; destaque?: string | null } | null;
};

export type PaginaDaLegenda = { inicio: number; fim: number; palavras: { texto: string; inicio: number; fim: number }[]; oculta?: boolean };

export type MontagemResolvida = {
  versao: 1;
  largura: number;
  altura: number;
  fps: number;
  duracao: number;
  marca: { acento: string; escuro: string; claro: string; logoUrl: string | null };
  familia: "colagem" | "impacto" | "sobrio";
  papelUrl: string | null;
  fonte: { largura: number; altura: number };
  pessoaNaFonte: Retangulo;
  // "caixa" e "marca-texto" (30/09): estilos que o cliente fixa na tela; lista
  // de páginas vazia quando ele escolhe "sem legenda".
  legenda: { estilo: "papel" | "destaque" | "limpa" | "caixa" | "marca-texto"; paginas: PaginaDaLegenda[] };
  cenas: CenaResolvida[];
  /** O estilo (01/10): o kit da bíblia e a entrada pelos lados. Worker antigo ignora. */
  estilo?: { id: string; kit: string; entradaLateral: boolean } | null;
  /** O sound design (01/10): o worker mistura depois do render (src/sons.mjs). */
  sons?: { t: number; som: string; volume: number }[];
};

/** As props da composição: o plano e as fontes que o worker preparou. */
export type PropsDaMontagem = {
  montagem: MontagemResolvida;
  /** A gravação limpa no tempo do corte (tem o áudio). */
  narradorUrl: string;
  /** A pessoa recortada (WebM com transparência), quando alguma cena pede. */
  recortadoUrl: string | null;
  /** Duração de cada vídeo de mídia (cena gerada), para esticar sem acabar antes. */
  duracaoDasMidias?: Record<string, number>;
  /**
   * O que o worker adiantou no ffmpeg para o Chrome não refazer em todo quadro
   * (30/09, velocidade): fundos com textura já misturada, o narrador cheio já
   * enquadrado e as cenas recortadas já compostas (índice da cena -> vídeo).
   */
  fundos?: Partial<Record<Fundo | "folha", string>> | null;
  cheio?: { url: string; recorte: Retangulo } | null;
  recortados?: Record<string, string>;
};
