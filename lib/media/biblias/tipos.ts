import type { Familia, Layout, TetosDoTrecho, Transicao } from "@/lib/media/plano-de-montagem";

/**
 * A BÍBLIA DE UM ESTILO DE EDIÇÃO (01/10/2026), em dados.
 *
 * Por que existe: no teste de 01/10 o Bruno escolheu "estilo MrBeast" e a
 * edição saiu igual à do Hormozi, com fundo escuro, poucos elementos e sem som.
 * O motivo medido: os 24 estilos do catálogo viravam 3 famílias
 * (capa-composta.tsx), cada uma com um prompt escrito à mão, e só o Vox tinha
 * a profundidade de uma bíblia (regras, exemplos, densidade, abertura). A
 * bíblia passa a ser a fonte única de cada estilo: o prompt do diretor, as
 * metas de ritmo, a abertura, o revisor e (na Fase 2b) o kit de desenho e o
 * som saem daqui.
 *
 * Módulo puro: sem banco, sem IA, sem rede.
 */

/** Uma meta com a faixa que define o estilo: o nicho mexe dentro dela, nunca fora. */
export type Faixa = { padrao: number; min: number; max: number };

/**
 * As metas numéricas do estilo. Cada uma tem a faixa de IDENTIDADE: o padrão
 * do nicho (lib/media/metas-do-estilo.ts) puxa a meta para perto do que rende
 * no nicho, mas nunca para fora da faixa (o Vox nunca vira MrBeast).
 */
export type MetasDoEstilo = {
  /** Duração média de cena, em segundos. */
  cenaSeg: Faixa;
  /** Algo muda na tela (corte, punch, elemento novo) a cada N segundos, no máximo. */
  mudancaACadaSeg: Faixa;
  /** O gancho visual (promessa, número, imagem forte) até este segundo. */
  ganchoAteSeg: Faixa;
  /** Fração do tempo com texto de grafismo na tela (sem contar a legenda). */
  textoNaTela: Faixa;
  /** Fração do tempo com o rosto do narrador em tela. */
  rostoNaTela: Faixa;
  /** Fração do tempo em imagem de apoio ou cena gerada em tela cheia. */
  brollNaTela: Faixa;
  /** Elementos de grafismo por minuto. */
  elementosPorMinuto: Faixa;
  /** Andamento da trilha em batidas por minuto (Fase 2b: encaixe na batida). */
  batidasPorMinuto: Faixa;
};

export type NomeDaMeta = keyof MetasDoEstilo;

/** Os elementos que o diretor pode pedir, pelo NOME QUE O PROMPT USA (ver ELEMENTOS_DO_PROMPT). */
export type NomeDoElemento =
  | "recorte"
  | "recorte-pop"
  | "icone"
  | "marca-texto"
  | "letras-revista"
  | "carimbo"
  | "tarja"
  | "tarja-telejornal"
  | "numero"
  | "numero-com-fonte"
  | "barras"
  | "seta-circulo"
  | "palavra"
  | "destaque"
  | "emoji"
  | "titulo"
  | "citacao"
  // Os do consórcio (02/10): faixa rasgada de valor, selo com check, rótulo branco e comentário respondido.
  | "faixa"
  | "selo"
  | "rotulo"
  | "comentario";

export type ElementoDaBiblia = { nome: NomeDoElemento; quando: string; porMinuto?: [number, number] };

export type AberturaDaBiblia = {
  /**
   * trailer: melhores momentos em cortes rápidos (MrBeast);
   * frase: uma frase-tese sozinha (Hormozi, keynote);
   * pergunta: a pergunta que o vídeo responde e dois ou três momentos (Vox);
   * teaser: duas ou três frases calmas de 3 a 5 s (telejornal);
   * promessa: o que a pessoa vai aprender (lousa).
   */
  tipo: "trailer" | "frase" | "pergunta" | "teaser" | "promessa";
  /** Como o diretor de abertura deve escolher, em uma ou duas frases. */
  descricao: string;
  /** Duração de cada momento (s). */
  momentoSeg: [number, number];
  /** Alvo e teto da abertura inteira (s). */
  totalAlvoSeg: number;
  totalMaxSeg: number;
  /** Já vem ligada na tela de roteiro (o cliente desliga se quiser). */
  ligadaPorPadrao: boolean;
  /** Efeito de passagem na abertura (Fase 2b: o worker desenha por estilo). */
  passagem: "flash-e-whoosh" | "corte-seco" | "fusao" | "folha-de-papel";
};

export type BibliaDoEstilo = {
  /** O id do catálogo (lib/media/catalogo-de-estilos.ts). */
  id: string;
  nome: string;
  /** false: estilo derivado do kit, com o selo "beta" na tela. */
  completa: boolean;
  /**
   * O prompt do diretor escrito à mão que continua valendo (só o Vox, o
   * aprovado pelo Bruno). Sem o campo, o prompt é gerado da bíblia.
   */
  promptProprio?: "colagem-legado";
  /** O kit que o worker desenha HOJE (as 3 famílias do Remotion). */
  kit: Familia;
  /** O kit próprio que a Fase 2b vai desenhar (Remotion). */
  kitFuturo: "colagem" | "retencao" | "emissora" | "keynote" | "lousa" | "tipografia" | "consorcio";
  /** A essência em duas ou três frases: o que o espectador sente. */
  essencia: string;
  /** De onde a bíblia saiu (canais medidos, observação). */
  referencias: string[];
  tipografia: { titulo: string; texto: string; numero: string; legenda: string; regras: string[] };
  /**
   * Como as três cores da marca (acento, escuro, claro) viram papéis na tela.
   * `fundos`: fração máxima do tempo de cada fundo nas cenas que mostram fundo
   * (o código corrige o que passar, ver ajustarAoEstilo).
   */
  paleta: { papeis: string; fundosMax: Partial<Record<"papel" | "papel-marca" | "escuro", number>>; regras: string[] };
  /** A gramática de movimento: câmera, entradas e saídas dos elementos. */
  movimento: { camera: string; entradas: string; punchPorMinuto: [number, number] };
  transicoes: Array<{ id: Transicao; porMinuto: [number, number]; quando: string }>;
  /** Layouts com a fatia do tempo (fração) e quando usar. */
  layouts: Array<{ id: Layout; fatia: [number, number]; quando: string }>;
  elementos: { permitidos: ElementoDaBiblia[]; proibidos: string[]; maxPorCena: number };
  /** Como pedir as imagens geradas (o diretor escreve as descrições em inglês). */
  imagens: {
    /** O asset "colagem" (imagem de apoio inteira). */
    apoio: string;
    /** O asset "elemento" (objeto recortado); null: o estilo não usa recorte. */
    elemento: string | null;
    /** A cena de cinema gerada em vídeo. */
    cinema: string;
    /** Exemplos "substantivo dito" -> descrição. */
    exemplos: Array<[string, string]>;
    nunca: string[];
  };
  metas: MetasDoEstilo;
  /** O quanto se corta de tempo morto na limpeza (Fase 2b liga na limpeza). */
  tempoMorto: "agressivo" | "medio" | "respira";
  /** Fase 2b: trilha e efeitos sonoros por evento. */
  som: { trilha: string; efeitos: Array<{ evento: string; som: string }> };
  /** Fase 2b: layouts que o kit novo desenha (PIP com um terço livre, destaque e janela de trecho). */
  layoutsFuturos: string[];
  abertura: AberturaDaBiblia;
  fecho: string;
  legenda: "papel" | "destaque" | "limpa";
  /** As regras do estilo, em ordem de importância (vão ao diretor e ao revisor). */
  regras: string[];
  /** Duas ou três cenas de exemplo, no formato do plano, para o diretor imitar a forma. */
  exemplos: string;
  /** O que o revisor confere, item a item, contra o plano. */
  checklist: string[];
  /**
   * Cenas geradas no CORTE quando o estilo pede menos que a regra geral (02/10,
   * consórcio: no nicho medido o que rende é a gravação real, e cena de
   * cinema de IA puxa para o "dinheiro voando"). Sem o campo, vale REGRAS.
   */
  tetosDoCorte?: TetosDoTrecho;
};
