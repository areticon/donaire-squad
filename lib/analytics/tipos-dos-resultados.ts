import type { NumerosLidos } from "@/lib/analytics/fontes-da-leitura";

/**
 * O FORMATO DA ABA RESULTADOS (01/10), sem banco: o componente de cliente
 * importa daqui, e lib/analytics/resultados.ts (servidor) monta.
 */

/**
 * O estado de cada peça NA CONTA DOS RESULTADOS. "publicado" vem primeiro e
 * ganha de tudo: arquivado depois de ir ao ar continua publicado, com a marca
 * `arquivado` ao lado. Arquivar é limpeza de tela, não apaga o que aconteceu.
 */
export type EstadoNaConta = "publicado" | "publicando" | "agendado" | "rascunho" | "arquivado" | "falhou" | "reprovado";

export const ORDEM_DOS_ESTADOS: EstadoNaConta[] = ["publicado", "publicando", "agendado", "rascunho", "arquivado", "falhou", "reprovado"];

export const ROTULO_DO_ESTADO: Record<EstadoNaConta, string> = {
  publicado: "Publicados",
  publicando: "Saindo agora",
  agendado: "Agendados",
  rascunho: "Rascunhos",
  arquivado: "Cancelados ou arquivados",
  falhou: "Com falha",
  reprovado: "Reprovados",
};

export type ResumoDoPeriodo = {
  rotulo: string;
  porEstado: Record<EstadoNaConta, number>;
  /** Passaram pela aprovação: publicados, saindo e agendados. */
  aprovados: number;
  /** Dos publicados, quantos estão arquivados na tela. */
  publicadosArquivados: number;
  /** Publicados com pelo menos uma leitura de número. */
  medidos: number;
  /** Publicados sem número ainda (pendente não é zero). */
  pendentes: number;
  interacoes: number;
  vistos: number;
  porRede: Array<{ rede: string; publicados: number; medidos: number; interacoes: number; vistos: number }>;
};

export type PontoDoHistorico = { lidoEm: string; interacoes: number | null; vistos: number | null; fonte: string };

export type PostNosResultados = {
  id: string;
  rede: string;
  /** "@usuario", "Página X" ou null quando a conta foi desconectada. */
  conta: string | null;
  mediaType: string | null;
  titulo: string;
  publicadoEm: string;
  arquivado: boolean;
  link: string | null;
  numeros: NumerosLidos | null;
  fonte: string | null;
  lidoEm: string | null;
  /** O motivo, quando ainda não há número. */
  pendente: string | null;
  historico: PontoDoHistorico[];
};

export type ResultadosDoProjeto = {
  geradoEm: string;
  semana: ResumoDoPeriodo;
  mes: ResumoDoPeriodo;
  tudo: ResumoDoPeriodo;
  /** Posts publicados por semana, empilhados por rede (8 semanas, arquivados inclusos). */
  semanas: Array<{ rotulo: string; porRede: Record<string, number> }>;
  posts: PostNosResultados[];
  /** Quantos posts têm o último número vindo de cada fonte. */
  fontes: Array<{ fonte: string; rotulo: string; posts: number }>;
  ultimaLeitura: string | null;
};
