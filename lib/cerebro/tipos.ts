/**
 * O SEGUNDO CÉREBRO DO CLIENTE (06/10/2026): os tipos.
 *
 * Regra do Bruno (memória produto-aprende-com-quem-usa): tudo o que o cliente
 * faz e diz no produto vira memória dele, numa tela igual ao Donaire Brains.
 * Quanto mais ele usa, mais o produto o conhece, e maior o custo de migrar.
 *
 * ## Como o cérebro é montado (sem duplicar o que já existe)
 *
 * Quase tudo o que o cliente decide JÁ MORA em algum lugar: as regras
 * aprovadas, a restrição de citar, os documentos da marca, os materiais, os
 * perfis de referência, o feedback do chat, as recusas com motivo, os pedidos
 * à Vera, o tom e as cores do setup. O cérebro LÊ esses lugares e os mostra
 * como notas (`fontes.ts`); não copia nenhum deles para outra tabela.
 *
 * O que não morava em lugar nenhum eram os ATOS sobre as peças: aprovar,
 * recusar, mandar revisar, editar o texto à mão, agendar, arquivar. Esses
 * viram a nota de PEÇA (uma por peça, com o histórico e o estado de agora,
 * para a nota nunca dizer "aprovou" de uma peça que depois foi recusada).
 *
 * E o que liga as notas entre si é DECISÃO, então é do JEV (`jev.ts`), nunca
 * do Claude. O registro do cérebro (`RegistroDoCerebro`) guarda a leitura do
 * JEV sobre cada nota: o tema, se é preferência que vale para as próximas
 * peças, e com quais notas ela se liga.
 *
 * Mora em ProjectMemory (tipo "cerebro", uma linha por nota registrada), sem
 * migração, como as regras, as lições e os pedidos da Vera.
 */

/** As esferas do cérebro: os grupos de cor da tela, como as pastas do Donaire Brains. */
export const ESFERAS = ["pedidos", "aprovacoes", "recusas", "regras", "tom", "materiais", "referencias", "decisoes", "feedback"] as const;
export type Esfera = (typeof ESFERAS)[number];

export const ROTULO_DA_ESFERA: Record<Esfera, string> = {
  pedidos: "Pedidos e ajustes",
  aprovacoes: "Aprovações",
  recusas: "Recusas",
  regras: "Regras",
  tom: "Tom e marca",
  materiais: "Materiais e documentos",
  referencias: "Referências",
  decisoes: "Decisões",
  feedback: "Feedback do produto",
};

/**
 * As cores das esferas: tons médios que leem no fundo claro e no escuro (a
 * tela troca de tema). A cor é da CATEGORIA da nota, não da marca do cliente.
 */
export const COR_DA_ESFERA: Record<Esfera, string> = {
  pedidos: "#f08a3c",
  aprovacoes: "#2fb37a",
  recusas: "#e0526b",
  regras: "#7c6cf0",
  tom: "#d9a520",
  materiais: "#3a9bdc",
  referencias: "#20a9a0",
  decisoes: "#b066d6",
  feedback: "#8a94a6",
};

/** O tema de uma nota, lido pelo JEV: diz quais agentes devem ler a nota. */
export const TEMAS = ["texto", "arte", "video", "tom", "marca", "publicacao", "produto"] as const;
export type Tema = (typeof TEMAS)[number];

export const CRITERIO_DO_TEMA: Record<Tema, string> = {
  texto: "Sobre o TEXTO das peças: legenda, post, roteiro, palavras, tamanho, gancho, chamada.",
  arte: "Sobre a ARTE ou imagem: carrossel, foto, frase na imagem, layout, cor da arte.",
  video: "Sobre o VÍDEO editado ou os cortes: legenda do vídeo, cortes, música, ritmo, elementos na tela.",
  tom: "Sobre o TOM DE VOZ e o jeito de falar: formal, informal, gírias, emojis, firmeza.",
  marca: "Sobre a MARCA e o negócio: cores, logo, nome, produto, público, o que a empresa faz ou não faz.",
  publicacao: "Sobre QUANDO e ONDE publicar: dia, horário, rede, agendamento, frequência.",
  produto: "Sobre a PLATAFORMA em si (um defeito, uma dúvida de uso), não sobre o conteúdo do cliente.",
};

/** A origem de uma nota: a linha de onde ela foi lida, para a tela abrir o lugar certo. */
export type FonteDaNota =
  | "projeto"
  | "esfera"
  | "peca"
  | "regra"
  | "restricao"
  | "contexto"
  | "material"
  | "referencia"
  | "feedback"
  | "preferencia"
  | "recusa"
  | "vera"
  | "design"
  | "roteiro";

/** Uma nota do cérebro como a tela e o JEV leem. */
export type NotaDoCerebro = {
  /** Estável: "<fonte>:<id da linha>" (ex.: "regra:abc", "peca:post:xyz"). */
  id: string;
  fonte: FonteDaNota;
  esfera: Esfera | null;
  titulo: string;
  texto: string;
  /** ISO da última vez que o fato mudou (aprovada em, enviado em, decidido em). */
  quando: string | null;
  tags: string[];
  /** Onde abrir na tela (caminho do app), quando há. */
  link: string | null;
  /** Card, post ou vídeo de que a nota fala: notas da mesma peça se ligam por fato. */
  pecas: string[];
  /** A leitura do JEV, quando ela já existe. */
  tema?: Tema | null;
  duradoura?: boolean | null;
  /** O cliente corrigiu o texto desta nota. */
  corrigida?: boolean;
  /** O texto que a caixa "Corrigir" abre (o da fonte, sem as linhas que a montagem acrescenta). */
  editavel?: string | null;
};

export type TipoDeLigacao = "esfera" | "mesma_peca" | "jev";

export type LigacaoDoCerebro = { de: string; para: string; tipo: TipoDeLigacao; confianca?: number | null };

export type CerebroNaTela = {
  projeto: { id: string; nome: string };
  notas: NotaDoCerebro[];
  ligacoes: LigacaoDoCerebro[];
  /** Quantas notas ficaram de fora pelo teto (as mais antigas), para a tela dizer. */
  cortadas: number;
  montadoEm: string;
};

/** Os atos do cliente sobre uma peça (o que não morava em lugar nenhum). */
export const ATOS_DA_PECA = ["aprovou", "recusou", "pediu_revisao", "editou_texto", "agendou", "voltou_rascunho", "arquivou", "desarquivou"] as const;
export type AtoDaPeca = (typeof ATOS_DA_PECA)[number];

export type AtoRegistrado = { ato: AtoDaPeca; quando: string; detalhe?: string | null };

/** A nota de peça: uma por peça (card ou post) em que o cliente agiu. */
export type EventoDaPeca = {
  /** "post" quando a peça tem post; senão "card". */
  alvo: "post" | "card";
  alvoId: string;
  cardId?: string | null;
  postId?: string | null;
  rede?: string | null;
  tipoDePeca?: string | null;
  /** Um trecho do texto da peça no último ato (até 280 caracteres). */
  trecho?: string | null;
  /** Do mais novo para o mais velho, até HISTORICO_MAXIMO. */
  historico: AtoRegistrado[];
};

/** O registro do cérebro sobre uma nota (ProjectMemory tipo "cerebro", chave = id da nota). */
export type RegistroDoCerebro = {
  v: 1;
  nota: string;
  /** Só na nota de peça: o fato que não mora em outro lugar. */
  evento?: EventoDaPeca | null;
  /**
   * Um resumo curto da nota no momento do registro, só de fonte que não muda
   * depois (feedback, recusa, pedido à Vera, peça). Regra, tom e documento
   * mudam, então nunca têm resumo aqui: são lidos da fonte na hora.
   */
  resumo?: string | null;
  esfera?: Esfera | null;
  tema: Tema | null;
  duradoura: boolean | null;
  confianca: number | null;
  ligacoes: Array<{ para: string; confianca: number | null }>;
  /** Quando o JEV leu; null quando ainda não leu (desligado ou falhou). */
  lidoEm: string | null;
  quando: string;
  /**
   * O texto que o CLIENTE corrigiu, nas notas cuja fonte é o próprio registro
   * (peça e pedido à Vera). Nas outras a correção vai para a fonte.
   */
  correcao?: string | null;
  corrigidaEm?: string | null;
};

/**
 * O QUE O CLIENTE PODE FAZER COM CADA NOTA (06/10), pelos termos: a memória é
 * dele; ele consulta, corrige, apaga e leva uma cópia.
 *
 *   "aqui"      o cérebro corrige ou apaga (na fonte, ou no registro quando
 *               o registro é a fonte);
 *   "material" / "contexto"  apaga pela rota que já existe (que também tira o
 *               arquivo do storage);
 *   "tela"      a nota mora numa tela própria (setup, design, roteiro,
 *               referência): o botão leva até lá.
 */
export type AcaoDaNota = "aqui" | "material" | "contexto" | "tela" | null;

export function acoesDaNota(fonte: FonteDaNota): { corrigir: AcaoDaNota; apagar: AcaoDaNota } {
  switch (fonte) {
    case "peca":
    case "vera":
    case "feedback":
    case "preferencia":
    case "recusa":
    case "regra":
      return { corrigir: "aqui", apagar: "aqui" };
    case "restricao":
      return { corrigir: "tela", apagar: "aqui" };
    case "material":
      return { corrigir: "tela", apagar: "material" };
    case "contexto":
      return { corrigir: "tela", apagar: "contexto" };
    case "projeto":
    case "referencia":
    case "design":
    case "roteiro":
      return { corrigir: "tela", apagar: "tela" };
    default:
      return { corrigir: null, apagar: null };
  }
}

export const TIPO_DO_REGISTRO = "cerebro";
export const HISTORICO_MAXIMO = 12;
/** Até quantas notas candidatas o JEV compara com a nota nova (o estado vai inteiro em cada pedido). */
export const TETO_DE_CANDIDATAS = 30;
/** Teto de notas na tela: além disto o grafo deixa de ser legível no celular. */
export const TETO_DE_NOTAS_NA_TELA = 600;
