import { CAMPOS_DOS_NUMEROS, temNumero, type CampoDosNumeros, type NumerosLidos } from "@/lib/analytics/fontes-da-leitura";

/**
 * O RESULTADO DE CADA REDE NA TELA INICIAL (06/10), sem banco: puro, para o
 * teste em scripts/testes e para a tela.
 *
 * Pedido do Bruno: os números do bloco "O seu squad nos últimos 30 dias"
 * "precisam ser reais, vir do Apify (curtidas, comentários, views, tempo, tudo
 * que tiver)". Até aqui o painel lia o post_metrics, que grava ZERO no campo
 * que a fonte não mede (impressão do Instagram, visualização do LinkedIn): o
 * zero aparecia como "ninguém viu". A conta agora sai das leituras
 * (leituras_de_metrica, com a fonte de cada uma: API oficial, Blotato ou o
 * perfil público pela Apify), campo a campo, e o que nenhuma fonte trouxe
 * fica NULO, que a tela escreve "sem medição ainda" (memórias "receita e
 * custo só reais" e "estado que sobrevive ao fato").
 */

/** Um campo a mais que as leituras não têm em coluna: o tempo médio assistido. */
export type CampoDoResultado = CampoDosNumeros | "tempoMedioSeg";

/**
 * O que cada rede consegue medir, na ordem em que a tela mostra. É a lista do
 * que a rede DÁ (na API oficial ou no perfil público), não do que já veio:
 * o que estiver aqui e não tiver número aparece como "sem medição ainda".
 *
 * Tempo médio de exibição: só a API oficial dá (YouTube Analytics com o
 * escopo yt-analytics.readonly; Instagram com instagram_business_manage_insights,
 * ainda em revisão na Meta; TikTok não dá a terceiros). Nenhum ator da Apify
 * traz retenção, porque ela não é pública.
 */
export const CAMPOS_DA_REDE: Record<string, CampoDoResultado[]> = {
  linkedin: ["impressoes", "curtidas", "comentarios", "compartilhamentos", "cliques"],
  twitter: ["impressoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos"],
  instagram: ["visualizacoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "tempoMedioSeg"],
  facebook: ["visualizacoes", "curtidas", "comentarios", "compartilhamentos"],
  tiktok: ["visualizacoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "tempoMedioSeg"],
  youtube: ["visualizacoes", "curtidas", "comentarios", "tempoMedioSeg"],
};

export const ROTULO_DO_RESULTADO: Record<CampoDoResultado, [string, string]> = {
  impressoes: ["impressão", "impressões"],
  alcance: ["pessoa alcançada", "pessoas alcançadas"],
  visualizacoes: ["visualização", "visualizações"],
  curtidas: ["curtida", "curtidas"],
  comentarios: ["comentário", "comentários"],
  compartilhamentos: ["compartilhamento", "compartilhamentos"],
  salvamentos: ["salvamento", "salvamentos"],
  cliques: ["clique", "cliques"],
  tempoMedioSeg: ["tempo médio", "tempo médio"],
};

/** A rede de cada especialista do squad. */
export const REDE_DO_AGENTE: Record<string, string> = {
  "lucas-linkedin": "linkedin",
  "xavier-x": "twitter",
  "igor-instagram": "instagram",
  "fernanda-facebook": "facebook",
  "tiago-tiktok": "tiktok",
  "yan-youtube": "youtube",
};

export type LeituraParaConsolidar = NumerosLidos & {
  lidoEm: Date;
  fonte: string;
  extras?: unknown;
};

export type NumerosDoPost = NumerosLidos & { tempoMedioSeg?: number | null; fonte: string | null };

/** O tempo médio assistido, quando a fonte gravou em `extras.tempoMedioSeg`. */
function tempoDe(extras: unknown): number | null {
  const v = (extras as { tempoMedioSeg?: unknown } | null | undefined)?.tempoMedioSeg;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Os números de UM post: para cada campo, a leitura mais recente que trouxe
 * aquele campo (a mesma regra da aba Resultados). Sem leitura nenhuma, usa o
 * post_metrics antigo, com impressão, visualização e clique zerados lidos como
 * "não medido" (o post_metrics grava 0 no que a fonte não dá).
 */
export function consolidarNumerosDoPost(
  leituras: LeituraParaConsolidar[],
  antigo?: { impressions: number; likes: number; comments: number; shares: number; clicks: number; videoViews: number } | null
): NumerosDoPost | null {
  if (leituras.length) {
    const ordem = [...leituras].sort((a, b) => b.lidoEm.getTime() - a.lidoEm.getTime());
    const n: NumerosDoPost = { fonte: ordem[0].fonte };
    for (const c of CAMPOS_DOS_NUMEROS) {
      const com = ordem.find((l) => typeof l[c] === "number");
      n[c] = com ? (com[c] as number) : null;
    }
    n.tempoMedioSeg = ordem.map((l) => tempoDe(l.extras)).find((t) => t !== null) ?? null;
    return temNumero(n) || n.tempoMedioSeg !== null ? n : null;
  }
  if (antigo) {
    return {
      fonte: "anterior",
      curtidas: antigo.likes,
      comentarios: antigo.comments,
      compartilhamentos: antigo.shares,
      impressoes: antigo.impressions || null,
      visualizacoes: antigo.videoViews || null,
      cliques: antigo.clicks || null,
    };
  }
  return null;
}

export type ResultadoDaRede = {
  rede: string;
  /** Posts que foram ao ar na janela. */
  publicados: number;
  /** Destes, quantos têm pelo menos um número lido. */
  medidos: number;
  /** Soma de cada campo nos posts que o mediram; NULO quando nenhum post mediu. */
  totais: Partial<Record<CampoDoResultado, number | null>>;
  /** Em quantos posts cada campo veio (a tela diz "em 3 de 5 posts"). */
  postsComCampo: Partial<Record<CampoDoResultado, number>>;
  /** curtida + comentário + compartilhamento + salvamento, nos medidos; nulo sem medição. */
  interacoes: number | null;
  /** O que a tela usa como "quantos viram": visualização, senão impressão, senão alcance. */
  vistos: { campo: CampoDosNumeros; valor: number } | null;
  /** As fontes que deram o último número, com quantos posts cada uma. */
  fontes: Record<string, number>;
};

/**
 * O resultado de uma rede numa janela: soma por campo, só onde o campo veio.
 * Média de tempo assistido é média simples entre os posts que a têm.
 */
export function resultadoDaRede(rede: string, posts: Array<{ numeros: NumerosDoPost | null }>): ResultadoDaRede {
  const campos: CampoDoResultado[] = [...CAMPOS_DOS_NUMEROS, "tempoMedioSeg"];
  const totais: ResultadoDaRede["totais"] = {};
  const postsComCampo: ResultadoDaRede["postsComCampo"] = {};
  const fontes: Record<string, number> = {};
  let medidos = 0;
  for (const p of posts) {
    if (!p.numeros) continue;
    medidos++;
    if (p.numeros.fonte) fontes[p.numeros.fonte] = (fontes[p.numeros.fonte] ?? 0) + 1;
    for (const c of campos) {
      const v = p.numeros[c];
      if (typeof v !== "number") continue;
      totais[c] = (totais[c] ?? 0) + v;
      postsComCampo[c] = (postsComCampo[c] ?? 0) + 1;
    }
  }
  for (const c of campos) if (!(c in totais)) totais[c] = null;
  if (typeof totais.tempoMedioSeg === "number") totais.tempoMedioSeg = totais.tempoMedioSeg / (postsComCampo.tempoMedioSeg ?? 1);

  const interacoesVieram = (["curtidas", "comentarios", "compartilhamentos", "salvamentos"] as const).some((c) => typeof totais[c] === "number");
  const interacoes = interacoesVieram
    ? (totais.curtidas ?? 0) + (totais.comentarios ?? 0) + (totais.compartilhamentos ?? 0) + (totais.salvamentos ?? 0)
    : null;
  const campoVisto = (["visualizacoes", "impressoes", "alcance"] as const).find((c) => typeof totais[c] === "number");
  return {
    rede,
    publicados: posts.length,
    medidos,
    totais,
    postsComCampo,
    interacoes,
    vistos: campoVisto ? { campo: campoVisto, valor: totais[campoVisto] as number } : null,
    fontes,
  };
}

/** Número curto para cartão pequeno: 1.234, 12,3 mil, 1,2 mi. */
export function numeroCurto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

/** Segundos em "38 s" ou "1 min 12 s". */
export function tempoCurto(seg: number): string {
  const s = Math.round(seg);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}
