import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import type { CenaDoRoteiro } from "@/lib/editorial/tipos";

/**
 * OS TIPOS DAS ANÁLISES DAS REFERÊNCIAS (02/10/2026), sem banco: a tela
 * importa daqui.
 *
 * Pedido do Bruno: "precisa trazer as análises para o usuário e depois
 * treinar os agentes, a documentação e regras do projeto; o usuário aprova as
 * regras ou não, e isso vale sempre". Três coisas novas sobre o estudo de
 * referências (lib/referencias/estudo.ts):
 *
 *   1. ACHADOS: frases com número e fonte, tiradas só do que foi coletado
 *      ("reels com humor renderam 70% mais que o normal do perfil", "o reel
 *      X de @fulano chegou a N visualizações"). Calculados na hora, sem IA
 *      (lib/referencias/achados.ts): número que a tela mostra é número que o
 *      código contou.
 *   2. REGRAS: o Roberto propõe, a partir dos achados, regras do projeto. O
 *      cliente aprova, edita ou recusa cada uma; só a aprovada entra no que os
 *      agentes leem, e vale até ele desligar (lib/referencias/regras.ts).
 *   3. TENDÊNCIAS DA SEMANA: áudio, meme e roteiro que se repetem nas redes,
 *      com evidência, cruzados com nicho, voz e linha do projeto
 *      (lib/referencias/tendencias.ts).
 */

/** O que a coleta já trazia e era jogado fora (coluna referencias_posts.extras). */
export type ExtrasDoPost = {
  /** O áudio do vídeo. `original` = a própria voz de quem postou. */
  audio?: { id: string | null; nome: string; autor: string | null; original: boolean } | null;
  hashtags?: string[];
  /** Salvamentos: o TikTok mostra; o Instagram não mostra para terceiros. */
  salvamentos?: number | null;
  /** O endereço da capa ou da primeira imagem. Expira em dias: só para a leitura do estilo logo depois da coleta. */
  capa?: string | null;
};

/** As etiquetas novas de 02/10, somadas às de padroes.ts dentro de `etiquetas`. */
export const TONS = ["humor", "serio", "inspirador", "educativo", "polemico", "emocional"] as const;
export const RECURSOS = ["meme", "trend_de_audio", "bordao", "pov", "react", "depoimento", "bastidor", "texto_na_tela", "nenhum"] as const;
export const ESTILOS_DE_ARTE = ["foto_de_pessoa", "texto_sobre_fundo", "print_de_tela", "meme", "ilustracao", "grafico_ou_dado", "produto_ou_objeto", "colagem"] as const;

export type EtiquetasDaArte = {
  estilo: (typeof ESTILOS_DE_ARTE)[number];
  /** Quanto texto a capa tem. */
  texto: "muito" | "pouco" | "nenhum";
  paleta: "clara" | "escura" | "colorida" | "neutra";
  rosto: boolean;
};

export type EtiquetasExtras = {
  tom?: (typeof TONS)[number];
  recurso?: (typeof RECURSOS)[number];
  /** O roteiro em até 12 palavras, abstrato, sem nome de ninguém. */
  molde?: string;
  arte?: EtiquetasDaArte | null;
};

export const ROTULO_DO_TOM: Record<string, string> = {
  humor: "com humor",
  serio: "em tom sério",
  inspirador: "inspiradores",
  educativo: "educativos",
  polemico: "polêmicos",
  emocional: "emotivos",
};

export const ROTULO_DO_RECURSO: Record<string, string> = {
  meme: "com meme",
  trend_de_audio: "com áudio em alta",
  bordao: "com bordão repetido",
  pov: "em formato de ponto de vista (POV)",
  react: "reagindo a outro conteúdo",
  depoimento: "com depoimento",
  bastidor: "de bastidor",
  texto_na_tela: "com texto grande na tela",
  nenhum: "sem recurso especial",
};

export const ROTULO_DO_ESTILO_DE_ARTE: Record<string, string> = {
  foto_de_pessoa: "foto de pessoa",
  texto_sobre_fundo: "texto sobre fundo liso",
  print_de_tela: "print de tela ou de post",
  meme: "meme",
  ilustracao: "ilustração",
  grafico_ou_dado: "gráfico ou número em destaque",
  produto_ou_objeto: "produto ou objeto",
  colagem: "colagem",
};

/** Um post real citado como prova, com link. */
export type ExemploDoAchado = {
  rede: RedeDeReferencia;
  perfil: string;
  url: string | null;
  formato: string;
  publicadoEm: string | null;
  visualizacoes: number | null;
  curtidas: number | null;
  comentarios: number | null;
  compartilhamentos: number | null;
  salvamentos: number | null;
  /** Quantas vezes o normal do próprio perfil. */
  ganho: number | null;
};

export type TipoDeAchado =
  | "formato"
  | "gancho"
  | "estrutura"
  | "chamada"
  | "duracao"
  | "tom"
  | "recurso"
  | "audio"
  | "arte"
  | "combinacao"
  | "destaque"
  | "conversa"
  | "salvamento"
  | "ritmo";

export type Achado = {
  /** Estável entre estudos: "formato:reel", "combinacao:reel+humor", "destaque:<id do post>". */
  chave: string;
  tipo: TipoDeAchado;
  /** A frase para o cliente, com o número. */
  frase: string;
  /** Como o número foi contado, em uma frase. */
  comoMedimos: string;
  sentido: "melhor" | "pior" | "neutro";
  /** Quantas vezes o resto (1,7 = 70% a mais). Null quando não é comparação. */
  vezes: number | null;
  amostra: { posts: number; perfis: number; base: number };
  /** "forte": 5 posts, 2 perfis e diferença de 1,5 vez ou mais. "indicio": o resto. */
  forca: "forte" | "indicio";
  rede: RedeDeReferencia | "todas";
  exemplos: ExemploDoAchado[];
};

/**
 * O PAINEL EXECUTIVO (02/10, pedido do Bruno: "precisa ser gráfico, executivo;
 * deixe os cards para quem quer estudar mais"). Uma barra por categoria com o
 * rendimento MEDIANO dos posts dela em relação ao normal do próprio perfil
 * (1 = normal), a amostra e a força. Calculado em achados.ts das mesmas
 * medidas (o `ganho` de cada post), sem número novo.
 */
export type BarraDoPainel = {
  chave: string;
  nome: string;
  /** Mediana do ganho dos posts da categoria (1 = o normal do perfil). */
  vezes: number;
  posts: number;
  perfis: number;
  /** Forte: 5 posts ou mais de 2 perfis ou mais. O resto é indício. */
  forca: "forte" | "indicio";
  exemplos: ExemploDoAchado[];
};

export type IdDoGrafico = "formatos" | "tom" | "ganchos" | "estrutura" | "fechamento" | "arte" | "audio";

export type GraficoDoPainel = {
  id: IdDoGrafico;
  titulo: string;
  /** A pergunta que o gráfico responde, em uma linha. */
  pergunta: string;
  barras: BarraDoPainel[];
  /** A chave da barra que vence (forte e acima de 1,2 vez), ou null. */
  vencedora: string | null;
};

/** Uma frase-resumo grande do topo, presa ao gráfico que a sustenta. */
export type FraseDoPainel = { numero: string; texto: string; detalhe: string; grafico: IdDoGrafico };

export type PainelExecutivo = { graficos: GraficoDoPainel[]; frases: FraseDoPainel[] };

export type AlvoDaRegra = "roteiro" | "redacao" | "arte" | "edicao";

export const ALVOS_DA_REGRA: AlvoDaRegra[] = ["roteiro", "redacao", "arte", "edicao"];

export const ROTULO_DO_ALVO: Record<AlvoDaRegra, string> = {
  roteiro: "Roteiro e ideias",
  redacao: "Textos e legendas",
  arte: "Artes e capas",
  edicao: "Edição de vídeo",
};

export type StatusDaRegra = "proposta" | "aprovada" | "recusada" | "desligada";

export type RegraDoProjeto = {
  id: string;
  texto: string;
  /** O texto que o Roberto propôs, quando o cliente editou. */
  textoOriginal?: string | null;
  porque: string;
  alvos: AlvoDaRegra[];
  status: StatusDaRegra;
  origem: "roberto" | "cliente";
  /** O achado que sustentou a proposta, copiado no dia (o achado pode mudar depois). */
  achado: { chave: string; frase: string; amostra: Achado["amostra"]; forca: Achado["forca"] } | null;
  propostaEm: string;
  decididaEm?: string | null;
};

/** Uma prova de tendência: um vídeo real ou uma página que falou dela. */
export type ProvaDaTendencia = {
  tipo: "video" | "pagina";
  rede?: RedeDeReferencia;
  autor?: string | null;
  url: string | null;
  titulo?: string | null;
  visualizacoes?: number | null;
  publicadoEm?: string | null;
};

export type Tendencia = {
  id: string;
  nome: string;
  /** "audio" | "meme" | "roteiro" | "formato" | "data" */
  tipo: string;
  oQueE: string;
  /** Contado pelo código a partir das provas citadas, nunca pelo modelo. */
  evidencia: { videos: number; autores: number; visualizacoes: number; paginas: number; amostra: number; frase: string };
  provas: ProvaDaTendencia[];
  /** O áudio, quando a tendência é de áudio (para achar na biblioteca da rede). */
  audio?: { nome: string; autor: string | null } | null;
  combina: boolean;
  motivo: string;
  sugestao?: {
    tema: string;
    formato: string;
    redes: string[];
    abertura: string;
    cenas: CenaDoRoteiro[];
    comoUsarOAudio?: string | null;
    cuidado?: string | null;
  } | null;
  /** O roteiro criado na linha editorial a partir desta sugestão. */
  roteiroId?: string | null;
};

export type TendenciasDaSemana = {
  geradaEm: string;
  itens: Tendencia[];
  sinais: { videos: number; paginas: number };
  custoUsd: number;
  avisos: string[];
};

export type EtapaDaAnalise = "descobrir" | "confirmar" | "estudar" | "etiquetar" | "regras" | "tendencias" | "pronto";

export const ROTULO_DA_ETAPA: Record<EtapaDaAnalise, string> = {
  descobrir: "Procurando os perfis de referência do seu nicho",
  confirmar: "Escolhendo os perfis mais relevantes",
  estudar: "Estudando os posts dos perfis (alguns minutos)",
  etiquetar: "Lendo o tom, o recurso e o estilo da arte de cada post",
  regras: "O Roberto está escrevendo as regras propostas",
  tendencias: "Buscando as tendências da semana nas redes",
  pronto: "Pronto",
};

/** O estado do trabalho em segundo plano (ProjectMemory tipo "analise_ref", chave "estado"). */
export type EstadoDaAnalise = {
  status: "rodando" | "pronto" | "erro";
  etapa: EtapaDaAnalise;
  etapas: EtapaDaAnalise[];
  origem: "criacao" | "painel";
  pedidoEm: string;
  /** Depois deste instante sem notícia, a tela considera que o trabalho parou. */
  prazoEm: string;
  terminadoEm?: string | null;
  erro?: string | null;
  avisos: string[];
  custo: { apifyUsd: number; iaUsdEstimado: number };
  /** Quando o Roberto propôs regras pela última vez (para saber se o estudo é mais novo). */
  regrasEm?: string | null;
};

export type RespostaDasAnalises = {
  ligado: boolean;
  podeEditar: boolean;
  estado: EstadoDaAnalise | null;
  /** O estado gravado passou do prazo sem terminar. */
  parado: boolean;
  achados: Achado[];
  /** Os gráficos do topo (02/10). */
  painel: PainelExecutivo;
  amostra: { posts: number; perfis: number; comGanho: number };
  regras: RegraDoProjeto[];
  tendencias: TendenciasDaSemana | null;
  /** Quando a próxima busca de tendências fica liberada (uma a cada 24 h). */
  tendenciasLiberadasEm: string | null;
  /** O último estudo é mais novo que as regras: vale pedir regras de novo. */
  estudoMaisNovoQueRegras: boolean;
};
