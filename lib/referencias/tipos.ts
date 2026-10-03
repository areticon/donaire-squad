/**
 * OS TIPOS DO TRILHO DE REFERÊNCIAS (01/10), sem banco: a tela importa daqui.
 *
 * O trilho estuda perfis famosos e relevantes do nicho do cliente para achar
 * MOLDES que rendem (formato, gancho, estrutura, duração), nunca para copiar
 * conteúdo. Ver a pesquisa de 01/10 (Blotato x Apify x APIs oficiais) e
 * lib/referencias/padroes.ts.
 */

export type RedeDeReferencia = "instagram" | "tiktok" | "linkedin" | "youtube" | "x";

export const REDES_DE_REFERENCIA: RedeDeReferencia[] = ["instagram", "tiktok", "linkedin", "youtube", "x"];

export const ROTULO_DA_REDE: Record<RedeDeReferencia, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn (página de empresa)",
  youtube: "YouTube",
  x: "X",
};

/** Teto de perfis confirmados por conta (do dono), somando os projetos. */
export const MAX_REFERENCIAS_POR_CONTA = 15; // era 10; subiu para 15 em 03/10 (Bruno): 5 projetos com 3 referências cada

export type StatusDaReferencia = "sugerido" | "confirmado" | "recusado";

export type PerfilDeReferenciaNaTela = {
  id: string;
  rede: RedeDeReferencia;
  perfil: string;
  nome: string | null;
  url: string | null;
  motivo: string | null;
  seguidores: number | null;
  status: StatusDaReferencia;
  origem: "roberto" | "cliente";
  ultimaColeta: string | null;
  ultimoErro: string | null;
};

/**
 * O ANDAMENTO DO "ESTUDAR AGORA" NA TELA (01/10). O estudo roda depois da
 * resposta (lib/referencias/andamento.ts) e a tela consulta isto a cada
 * poucos segundos: nunca mais um botão girando sem dizer nada.
 */
export type EstudoNaTela = {
  estado: "estudando" | "pronto" | "falhou";
  iniciadoEm: string;
  terminadoEm: string | null;
  /** "coletando", "etiquetando", "medindo" (só enquanto estuda). */
  etapa: "coletando" | "etiquetando" | "medindo" | null;
  /** Perfil da vez: 2 de 5. */
  atual: number;
  total: number;
  /** "Instagram @anatex" (só enquanto coleta). */
  perfil: string | null;
  /** Resumo do que terminou ("38 posts estudados, 4 padrões..."). */
  resumo: string | null;
  /** O motivo da falha, em português, para a tela. */
  erro: string | null;
  avisos: string[];
};

/**
 * Um post de referência no formato único, venha de qual fonte vier (ator da
 * Apify ou API oficial). Trocar de fonte não muda nada daqui para a frente.
 */
export type PostDeReferencia = {
  rede: RedeDeReferencia;
  perfil: string;
  externoId: string;
  url: string | null;
  /** reel, carrossel, imagem, video, short, texto, documento */
  formato: string;
  /** Texto bruto do autor. Só o analista lê; apagado em 90 dias. */
  legenda: string;
  duracaoSeg: number | null;
  publicadoEm: string | null;
  curtidas: number | null;
  comentarios: number | null;
  visualizacoes: number | null;
  compartilhamentos: number | null;
  seguidoresDoAutor: number | null;
  /**
   * O endereço do ARQUIVO do vídeo (01/10), só para a medida da mesma coleta
   * (lib/referencias/medidas.ts): NUNCA é gravado. O link do Instagram expira
   * em horas; o do YouTube é a própria página.
   */
  midiaUrl?: string | null;
  /** Áudio, hashtags, salvamentos e capa (02/10): gravados em referencias_posts.extras. */
  extras?: import("@/lib/referencias/tipos-das-analises").ExtrasDoPost | null;
};

/**
 * O CARTÃO DE PADRÃO: o molde abstrato que o gerador de ideias recebe.
 * Molde sim, conteúdo não: aqui não entra legenda, frase, caso nem nome de
 * quem fez. Só a forma e a prova estatística.
 */
export type CartaoDePadrao = {
  /** "gancho:numero", "formato:reel", "duracao:15-30"... */
  chave: string;
  rede: RedeDeReferencia | "todas";
  /** O que é, em uma frase ("reel de 15 a 30 s que abre com um número"). */
  oQueE: string;
  prova: { posts: number; perfis: number; ganho: number };
  comoAplicar: string;
  oQueNaoLevar: string;
  geradoEm: string;
};
