/**
 * AS FONTES DOS NÚMEROS E O QUE CONTA COMO "PUBLICADO" (01/10), sem banco: a
 * tela importa daqui.
 *
 * Relato do Bruno em 01/10: "arquivei tudo de dois projetos e sumiram as
 * métricas". Arquivar um post grava status "cancelled" (é o que a aba de
 * posts e o Gestor leem como arquivado), e TODA tela de métricas filtrava
 * `status: "published"`. Medido no banco: o projeto Demandou tinha 70 posts que
 * foram ao ar e 0 com status "published"; o Empreendedorismo Cristão, 13 e 0.
 * A aba Resultados dizia "Nenhum dado ainda" sobre 83 posts publicados.
 *
 * A regra agora: o fato "foi ao ar" é `publishedAt`, que só a publicação
 * grava e que nenhum arquivar, restaurar ou reprovar apaga. O status diz onde
 * a peça está na TELA; `publishedAt` diz o que aconteceu na REDE.
 */

/** O filtro do Prisma para "este post foi ao ar", arquivado ou não. */
export const ONDE_SAIU = { publishedAt: { not: null } } as const;

/** Mesmo critério para quem já tem o post na mão. */
export function saiu(p: { status: string; publishedAt?: Date | string | null }): boolean {
  return Boolean(p.publishedAt) || p.status === "published";
}

/** De onde veio um número. Aparece na tela ao lado de cada leitura. */
export type FonteDaLeitura =
  | "blotato"
  | "api:linkedin"
  | "api:x"
  | "api:youtube"
  | "api:instagram"
  | "api:facebook"
  | "api:tiktok"
  | "apify:instagram"
  | "apify:tiktok"
  | "apify:linkedin"
  | "apify:facebook"
  | "nenhuma"
  | "anterior";

export const ROTULO_DA_FONTE: Record<FonteDaLeitura, string> = {
  blotato: "medido pelo Blotato",
  "api:linkedin": "pela API do LinkedIn",
  "api:x": "pela API do X",
  "api:youtube": "pela API do YouTube",
  "api:instagram": "pela API do Instagram",
  "api:facebook": "pela API do Facebook",
  "api:tiktok": "pela API do TikTok",
  "apify:instagram": "lido do perfil público",
  "apify:tiktok": "lido do perfil público",
  "apify:linkedin": "lido do post público",
  "apify:facebook": "lido da página pública",
  nenhuma: "ainda sem fonte",
  // As linhas do post_metrics gravadas antes do histórico de leituras.
  anterior: "leitura antiga (antes do histórico)",
};

export function rotuloDaFonte(f: string): string {
  return ROTULO_DA_FONTE[f as FonteDaLeitura] ?? f;
}

/**
 * Os números de uma leitura. Nulo é "esta fonte não mede isto" ou "não veio":
 * nunca vira zero (a lição de 28/09: zero falso lido como "ninguém viu").
 */
export type NumerosLidos = {
  impressoes?: number | null;
  alcance?: number | null;
  visualizacoes?: number | null;
  curtidas?: number | null;
  comentarios?: number | null;
  compartilhamentos?: number | null;
  salvamentos?: number | null;
  cliques?: number | null;
};

export const CAMPOS_DOS_NUMEROS = ["impressoes", "alcance", "visualizacoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "cliques"] as const;
export type CampoDosNumeros = (typeof CAMPOS_DOS_NUMEROS)[number];

export const ROTULO_DO_CAMPO: Record<CampoDosNumeros, string> = {
  impressoes: "impressões",
  alcance: "alcance",
  visualizacoes: "visualizações",
  curtidas: "curtidas",
  comentarios: "comentários",
  compartilhamentos: "compartilhamentos",
  salvamentos: "salvamentos",
  cliques: "cliques",
};

/** Algum número veio de fato? (um objeto só de nulos é "pendente"). */
export function temNumero(n: NumerosLidos | null | undefined): boolean {
  if (!n) return false;
  return CAMPOS_DOS_NUMEROS.some((c) => typeof n[c] === "number");
}

/** Interações: curtida + comentário + compartilhamento + salvamento, o que vier. */
export function interacoes(n: NumerosLidos | null | undefined): number | null {
  if (!temNumero(n)) return null;
  return (n!.curtidas ?? 0) + (n!.comentarios ?? 0) + (n!.compartilhamentos ?? 0) + (n!.salvamentos ?? 0);
}

/** O alcance que a tela mostra: visualização, senão impressão, senão alcance. */
export function vistos(n: NumerosLidos | null | undefined): number | null {
  if (!n) return null;
  return n.visualizacoes ?? n.impressoes ?? n.alcance ?? null;
}

/**
 * QUANDO MEDIR (01/10): 2 h, 24 h, 3 dias, 7 dias e 30 dias depois de
 * publicar. As primeiras horas dizem se o post "pegou"; depois de uma semana
 * o número quase não muda, e cada leitura de fonte paga custa.
 */
export const MARCOS_DA_MEDICAO_H = [2, 24, 72, 168, 720];
