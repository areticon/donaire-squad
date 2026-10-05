import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import type { ExemploDoAchado, GraficoDoPainel } from "@/lib/referencias/tipos-das-analises";

/**
 * A JORNADA DE ENTRADA (03/10/2026), sem banco: a tela importa daqui.
 *
 * Pedido do Bruno para os vendedores de segunda, o "momento uau":
 *   1. "Coloque aqui as suas redes": a plataforma estuda o PERFIL DO PRÓPRIO
 *      CLIENTE com a mesma coleta das referências e entrega um relatório em
 *      gráficos (quantos posts, o melhor post com data e link, o que rende,
 *      cores, estilo, linguagem, quem é, produto, objetivo);
 *   2. "Agora diga até 3 referências": estuda as referências e faz o DE-PARA,
 *      o que elas fazem que você não faz, com números;
 *   3. o setup vem PREENCHIDO a partir dos dois estudos, com o porquê de cada
 *      campo ("vou treinar o time assim porque o diagnóstico mostrou X").
 *
 * O perfil do cliente mora em `referencias_perfis` com status "proprio": a
 * mesma coleta, o mesmo formato de post, as mesmas etiquetas, sem migração. O
 * status separa tudo: os achados, os cartões de padrão, a medida dos vídeos e
 * as tendências leem só "confirmado", então o perfil do cliente nunca vira
 * "referência do nicho" de si mesmo.
 */

/** As redes que o cliente informa na primeira tela (X fica de fora: a leitura paga por post). */
export const REDES_DO_CLIENTE: RedeDeReferencia[] = ["instagram", "tiktok", "youtube", "linkedin"];

/** Até 3 referências por projeto (decisão do Bruno em 03/10): estudo focado e barato. */
export const MAX_REFERENCIAS_POR_PROJETO = 3;

export const STATUS_DO_PERFIL_PROPRIO = "proprio";

/**
 * CONFERE UMA REFERÊNCIA ANTES DE GRAVAR (05/10), sem banco: a tela usa para
 * avisar na hora e a API usa de novo antes de gravar. Aceita o @ ou o link do
 * perfil. No Instagram e no TikTok o nome de usuário só tem letras, números,
 * ponto e sublinhado (até 30 no Instagram, 24 no TikTok); link de post ou de
 * reel não é perfil. Devolve o perfil já no formato que o banco guarda (o
 * mesmo de perfilCanonico em lib/referencias/coletar.ts).
 */
export function conferirReferencia(rede: RedeDeReferencia, entrada: string): { ok: true; perfil: string } | { ok: false; erro: string } {
  const e = entrada.trim();
  if (!e) return { ok: false, erro: "Escreva o @ ou o link do perfil." };
  if (rede === "linkedin") {
    const m = e.match(/linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i);
    if (!m) return { ok: false, erro: "No LinkedIn, só página de empresa (o link com /company/)." };
    return { ok: true, perfil: `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}/` };
  }
  if (rede === "youtube") {
    const m = e.match(/youtube\.com\/(@[^/?#]+|channel\/(UC[\w-]+))/i);
    if (m) return { ok: true, perfil: m[2] ?? m[1] };
    if (/^https?:\/\//i.test(e) || /\s/.test(e)) return { ok: false, erro: "No YouTube, use o @ do canal ou o link do canal." };
    return { ok: true, perfil: e.startsWith("@") || e.startsWith("UC") ? e : `@${e}` };
  }
  if (rede === "instagram" || rede === "tiktok") {
    const dominio = rede === "instagram" ? /instagram\.com/i : /tiktok\.com/i;
    let nome = e;
    if (/^(https?:\/\/)?(www\.|m\.)?[a-z]+\.com\//i.test(e)) {
      if (!dominio.test(e)) return { ok: false, erro: `Esse link não é do ${rede === "instagram" ? "Instagram" : "TikTok"}.` };
      const caminho = e.replace(/^(https?:\/\/)?(www\.|m\.)?[a-z]+\.com\//i, "").replace(/[?#].*$/, "");
      const partes = caminho.split("/").filter(Boolean);
      if (!partes.length || /^(p|reel|reels|tv|stories|explore|video)$/i.test(partes[0]) || (partes.length > 1 && /^(p|reel|video)$/i.test(partes[1]))) {
        return { ok: false, erro: "Esse link é de um post. Cole o link do perfil (ou só o @)." };
      }
      nome = partes[0];
    }
    nome = nome.replace(/^@/, "").toLowerCase();
    const max = rede === "instagram" ? 30 : 24;
    if (!new RegExp(`^[a-z0-9._]{1,${max}}$`).test(nome)) {
      return { ok: false, erro: `Esse @ não parece válido: no ${rede === "instagram" ? "Instagram" : "TikTok"} só vale letra, número, ponto e sublinhado.` };
    }
    return { ok: true, perfil: nome };
  }
  return { ok: false, erro: "Essa rede não entra nas referências." };
}

export type RedeLidaDoCliente = {
  rede: RedeDeReferencia;
  perfil: string;
  url: string | null;
  seguidores: number | null;
  /** Total de posts que o perfil diz ter (Instagram mostra). */
  postsNoPerfil: number | null;
  /** Posts lidos neste estudo. */
  lidos: number;
  /** O motivo, para a tela, quando a rede não foi lida (sem fornecedor). */
  motivo: string | null;
};

/** Uma fatia de distribuição: "Reels, 12 posts, 60%", com o rendimento quando dá para medir. */
export type FatiaDoPerfil = { chave: string; nome: string; posts: number; pct: number; vezes: number | null };

export type QuemE = {
  pessoa: string;
  produto: string;
  objetivo: string;
  publico: string;
  linguagem: string;
  temas: string[];
};

export type VisualDoPerfil = {
  /** As cores dominantes das capas, em hexadecimal. */
  cores: string[];
  /** O estilo visual em uma ou duas frases. */
  estilo: string;
  /** Estilo da arte das capas (foto de pessoa, texto sobre fundo...). */
  artes: FatiaDoPerfil[];
  /** Em quantas capas aparece rosto (0 a 100). */
  comRostoPct: number | null;
};

export type RelatorioDoPerfil = {
  geradoEm: string;
  redes: RedeLidaDoCliente[];
  nome: string | null;
  bio: string | null;
  numeros: {
    posts: number;
    /** Posts por semana no período lido. */
    porSemana: number | null;
    periodoDias: number | null;
    medianaVisualizacoes: number | null;
    medianaCurtidas: number | null;
    medianaComentarios: number | null;
    /** Interação mediana por seguidor, em %. */
    taxaDeEngajamento: number | null;
    seguidores: number | null;
  };
  melhorPost: (ExemploDoAchado & { legenda: string | null; tema: string | null; porQue: string }) | null;
  formatos: FatiaDoPerfil[];
  temas: FatiaDoPerfil[];
  tons: FatiaDoPerfil[];
  ganchos: FatiaDoPerfil[];
  /** Os gráficos de rendimento (mesma conta do painel das referências, só com o perfil do cliente). */
  graficos: GraficoDoPainel[];
  /** "Carrossel rende 2,1x o resto do seu perfil", só com 3 posts ou mais. */
  oQueRende: string[];
  visual: VisualDoPerfil | null;
  quemE: QuemE | null;
  custo: CustoDoEstudo;
};

export type CustoDoEstudo = { apifyUsd: number; iaUsd: number; estimado: boolean };

/** Uma linha do de-para: a mesma medida dos dois lados. */
export type LinhaDoDePara = {
  chave: string;
  /** "Frequência", "Reels no mix"... */
  medida: string;
  voce: number | null;
  elas: number | null;
  /** Como escrever o número: "por semana", "%", "s", "" */
  unidade: string;
  /** A frase com os dois números. */
  frase: string;
  /** Alta quando elas fazem bem mais E o estudo mostra que isso rende. */
  prioridade: "alta" | "media" | "baixa";
  /** O achado das referências que sustenta a prioridade, quando há. */
  prova: string | null;
};

export type ResumoDoPerfilNoDePara = {
  rotulo: string;
  url: string | null;
  seguidores: number | null;
  posts: number;
  porSemana: number | null;
  medianaVisualizacoes: number | null;
  medianaInteracao: number | null;
  taxaDeEngajamento: number | null;
};

export type DeParaDoPerfil = {
  geradoEm: string;
  voce: ResumoDoPerfilNoDePara;
  referencias: ResumoDoPerfilNoDePara[];
  linhas: LinhaDoDePara[];
  /** As três frases do topo, já ordenadas pela prioridade. */
  manchetes: string[];
  /**
   * O mix de formatos dos dois lados (03/10, painel executivo): o seu, contado
   * nos seus posts; o das referências, a média das porcentagens de cada perfil
   * (cada perfil pesa um, como no resto do de-para).
   */
  mix?: { voce: FatiaDoPerfil[]; referencias: FatiaDoPerfil[] };
};

/** Os campos do setup que a jornada preenche, com o porquê de cada um. */
export type CampoDoSetup = "niche" | "targetAudience" | "description" | "voice" | "colorPalette" | "postFrequency" | "references" | "linhaEditorial";

export type SetupSugerido = {
  geradoEm: string;
  campos: Partial<Record<CampoDoSetup, string>>;
  porque: Partial<Record<CampoDoSetup, string>>;
  custo: CustoDoEstudo;
};

export type EtapaDoPerfilProprio = "coletando" | "etiquetando" | "lendo" | "pronto";

export type EstadoDoPerfilProprio = {
  status: "rodando" | "pronto" | "erro";
  etapa: EtapaDoPerfilProprio;
  pedidoEm: string;
  prazoEm: string;
  terminadoEm: string | null;
  erro: string | null;
  avisos: string[];
};

export const ROTULO_DA_ETAPA_DO_PERFIL: Record<EtapaDoPerfilProprio, string> = {
  coletando: "Lendo os seus posts",
  etiquetando: "Classificando formato, tema, tom e gancho de cada post",
  lendo: "Lendo as suas capas, cores e o jeito de falar",
  pronto: "Pronto",
};

/** O que a rota devolve para a tela da jornada. */
export type RespostaDoPerfilProprio = {
  ligado: boolean;
  podeEditar: boolean;
  redes: Array<{ rede: RedeDeReferencia; perfil: string }>;
  referencias: Array<{ id: string; rede: RedeDeReferencia; perfil: string; ultimaColeta: string | null; ultimoErro: string | null }>;
  estado: EstadoDoPerfilProprio | null;
  parado: boolean;
  relatorio: RelatorioDoPerfil | null;
  dePara: DeParaDoPerfil | null;
  setup: SetupSugerido | null;
  /** Estimativa antes de gastar: o que cada estudo custa (só admin vê). */
  estimativas: { perfil: CustoDoEstudo; referencias: CustoDoEstudo; setup: CustoDoEstudo } | null;
};
