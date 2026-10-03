import { prisma } from "@/lib/db/prisma";
import { faixaDeDuracao } from "@/lib/referencias/padroes";
import type { MedidaDoVideo } from "@/lib/referencias/medidas";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import {
  type BarraDoPainel,
  type FraseDoPainel,
  type GraficoDoPainel,
  type IdDoGrafico,
  type PainelExecutivo,
  ROTULO_DO_ESTILO_DE_ARTE,
  ROTULO_DO_RECURSO,
  ROTULO_DO_TOM,
  type Achado,
  type EtiquetasExtras,
  type ExemploDoAchado,
  type ExtrasDoPost,
} from "@/lib/referencias/tipos-das-analises";

/**
 * OS ACHADOS DAS REFERÊNCIAS (02/10/2026): frases com número e fonte, tiradas
 * SÓ do que foi coletado.
 *
 * Pedido do Bruno: "Reels com meme e piadas com .gov geraram 70% mais
 * engajamento, no post tal de fulano de tal chegou a XXXX views, XX
 * comentários". Aqui não entra IA: o código conta e escreve a frase, para que
 * todo número da tela seja um número que existe no banco. A IA só entra
 * depois, nas regras (regras.ts), lendo estes achados prontos.
 *
 * A COMPARAÇÃO é a mesma do padrão de 01/10 (padroes.ts): cada post contra o
 * normal (a mediana) do PRÓPRIO perfil, o que tira o efeito do tamanho da
 * conta; depois o grupo ("reels com humor") contra o resto. Visualização onde
 * a rede mostra; curtida, comentário e compartilhamento ponderados onde não
 * mostra. Post com menos de 7 dias fica fora do cálculo.
 *
 * A AMOSTRA vai sempre junto. "Forte" é a régua do padrão (5 posts, 2
 * perfis, diferença de 1,5 vez); abaixo disso é "indício", e a tela diz o
 * tamanho: 4 posts de 1 perfil não é lei, é pista.
 *
 * Calculado na hora em cada leitura (é barato: algumas centenas de linhas),
 * então nunca fica um achado velho na tela depois de um estudo novo.
 */

export type PostParaAchado = {
  id: string;
  perfilId: string;
  rede: RedeDeReferencia;
  perfil: string;
  url: string | null;
  formato: string;
  duracaoSeg: number | null;
  publicadoEm: Date | null;
  curtidas: number | null;
  comentarios: number | null;
  visualizacoes: number | null;
  compartilhamentos: number | null;
  ganho: number | null;
  etiquetas: (Record<string, unknown> & EtiquetasExtras) | null;
  extras: ExtrasDoPost | null;
  medidas: MedidaDoVideo | null;
};

const COMO_MEDIMOS =
  "Comparação dentro de cada perfil: os posts do grupo contra os outros posts do mesmo perfil, cada um medido pelo normal (a mediana) daquele perfil; visualizações onde a rede mostra, curtidas, comentários e compartilhamentos onde não mostra. Depois os perfis são somados. Posts com menos de 7 dias ficam de fora.";

/** Abaixo disto o grupo nem vira achado. */
const MIN_GRUPO = 3;
/** Diferença mínima para dizer alguma coisa (30% para cima, 25% para baixo). */
const MIN_ACIMA = 1.3;
const MAX_ABAIXO = 0.75;

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const VIDEO = new Set(["reel", "video", "short"]);
const ESTATICO = new Set(["imagem", "carrossel", "documento"]);

/** O formato como o cliente fala, no plural, já com a rede quando importa. */
function formatoNoPlural(formato: string, rede?: RedeDeReferencia | "todas"): string {
  if (formato === "carrossel" && rede === "tiktok") return "Carrosséis de fotos no TikTok";
  const nomes: Record<string, string> = {
    reel: "Reels",
    carrossel: "Carrosséis",
    imagem: "Posts de imagem única",
    video: rede === "youtube" ? "Vídeos longos do YouTube" : rede === "tiktok" ? "Vídeos do TikTok" : "Vídeos",
    short: "Shorts",
    texto: "Posts só de texto",
    documento: "Documentos (PDF em carrossel)",
  };
  return nomes[formato] ?? formato;
}

function formatoNoSingular(formato: string, rede: RedeDeReferencia): string {
  const nomes: Record<string, string> = {
    reel: "reel",
    carrossel: rede === "tiktok" ? "carrossel de fotos" : "carrossel",
    imagem: "post de imagem",
    video: rede === "youtube" ? "vídeo" : "vídeo",
    short: "short",
    texto: "post",
    documento: "documento",
  };
  return nomes[formato] ?? formato;
}

const GANCHO: Record<string, string> = {
  pergunta: "abrem com uma pergunta",
  numero: "abrem com um número",
  contraintuitivo: "abrem contrariando o senso comum",
  historia: "abrem contando uma história",
  promessa: "abrem com uma promessa de resultado",
  lista: "abrem anunciando uma lista",
  polemica: "abrem com uma polêmica",
};
const ESTRUTURA: Record<string, string> = {
  problema_solucao: "seguem problema e solução",
  lista: "são em lista",
  antes_depois: "mostram antes e depois",
  bastidor: "mostram bastidor",
  tutorial: "são passo a passo",
  opiniao: "são opinião direta",
  caso: "contam um caso",
};
const CHAMADA: Record<string, string> = {
  comentar: "terminam pedindo comentário",
  salvar: "terminam pedindo para salvar",
  compartilhar: "terminam pedindo para compartilhar",
  link: "terminam mandando para um link",
  seguir: "terminam pedindo para seguir",
  nenhuma: "terminam sem pedir nada",
};
const DURACAO: Record<string, string> = {
  "ate-15s": "de até 15 segundos",
  "15-30s": "de 15 a 30 segundos",
  "30-60s": "de 30 a 60 segundos",
  "1-3min": "de 1 a 3 minutos",
  "mais-de-3min": "de mais de 3 minutos",
};

const TOM_NO_SINGULAR: Record<string, string> = {
  humor: "com humor",
  serio: "tom sério",
  inspirador: "tom inspirador",
  educativo: "tom educativo",
  polemico: "tom polêmico",
  emocional: "tom emotivo",
};

/** "70% mais", "2,3 vezes o que rendem", "40% menos". */
export function quantoMais(vezes: number): string {
  // Acima de 10 vezes a conta já bateu no limite de um perfil só: dizer o teto.
  if (vezes >= 10) return "mais de 10 vezes o que renderam";
  if (vezes <= 0.1) return "menos de um décimo do que renderam";
  if (vezes >= 2) return `${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} vezes o que renderam`;
  if (vezes >= 1) return `${Math.round((vezes - 1) * 100)}% mais que`;
  return `${Math.round((1 - vezes) * 100)}% menos que`;
}

function numeroCurto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} milhões de`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

/** Só a primeira letra em minúscula ("Reels" vira "reels", "TikTok" continua). */
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function exemplo(p: PostParaAchado): ExemploDoAchado {
  return {
    rede: p.rede,
    perfil: p.perfil,
    url: p.url,
    formato: p.formato,
    publicadoEm: p.publicadoEm?.toISOString() ?? null,
    visualizacoes: p.visualizacoes,
    curtidas: p.curtidas,
    comentarios: p.comentarios,
    compartilhamentos: p.compartilhamentos,
    salvamentos: p.extras?.salvamentos ?? null,
    ganho: p.ganho !== null ? Math.round(p.ganho * 10) / 10 : null,
  };
}

type Dimensao = {
  nome: Achado["tipo"];
  /** O valor do post nesta dimensão; null = a dimensão não se aplica a ele. */
  valor: (p: PostParaAchado) => string | null;
  /** O sujeito da frase ("Reels", "Posts que abrem com uma pergunta"). */
  sujeito: (v: string, rede: RedeDeReferencia | "todas") => string;
  /** Com o que se compara ("os outros formatos"). */
  contra: string;
  /**
   * Compara só dentro do mesmo valor disto (o formato, nas combinações):
   * "reels com humor" contra os outros REELS do perfil, e não contra as fotos.
   */
  estrato?: (p: PostParaAchado) => string;
};

const et = (p: PostParaAchado) => p.etiquetas ?? {};

const DIMENSOES: Dimensao[] = [
  { nome: "formato", valor: (p) => p.formato, sujeito: (v, r) => formatoNoPlural(v, r), contra: "os outros formatos" },
  { nome: "gancho", valor: (p) => (GANCHO[String(et(p).gancho)] ? String(et(p).gancho) : null), sujeito: (v) => `Posts que ${GANCHO[v]}`, contra: "os que abrem de outro jeito" },
  { nome: "estrutura", valor: (p) => (ESTRUTURA[String(et(p).estrutura)] ? String(et(p).estrutura) : null), sujeito: (v) => `Posts que ${ESTRUTURA[v]}`, contra: "os de outra estrutura" },
  { nome: "chamada", valor: (p) => (CHAMADA[String(et(p).cta)] ? String(et(p).cta) : null), sujeito: (v) => `Posts que ${CHAMADA[v]}`, contra: "os que terminam de outro jeito" },
  { nome: "duracao", valor: (p) => (VIDEO.has(p.formato) ? faixaDeDuracao(p.duracaoSeg) : null), sujeito: (v) => `Vídeos ${DURACAO[v] ?? v}`, contra: "os vídeos de outra duração" },
  { nome: "tom", valor: (p) => (et(p).tom ? String(et(p).tom) : null), sujeito: (v) => `Posts ${ROTULO_DO_TOM[v] ?? v}`, contra: "os de outro tom" },
  {
    nome: "recurso",
    valor: (p) => (et(p).recurso && et(p).recurso !== "nenhum" ? String(et(p).recurso) : et(p).recurso === "nenhum" ? "nenhum" : null),
    sujeito: (v) => `Posts ${ROTULO_DO_RECURSO[v] ?? v}`,
    contra: "os sem esse recurso",
  },
  {
    nome: "audio",
    valor: (p) => (VIDEO.has(p.formato) && p.extras?.audio ? (p.extras.audio.original ? "original" : "musica") : null),
    sujeito: (v) => (v === "original" ? "Vídeos só com a voz de quem fala (áudio original)" : "Vídeos com música por baixo"),
    contra: "os outros vídeos",
  },
  {
    nome: "arte",
    valor: (p) => (ESTATICO.has(p.formato) && et(p).arte?.estilo ? String(et(p).arte!.estilo) : null),
    sujeito: (v) => `Artes com ${ROTULO_DO_ESTILO_DE_ARTE[v] ?? v}`,
    contra: "as artes de outro estilo",
  },
  {
    nome: "arte",
    valor: (p) => (ESTATICO.has(p.formato) && et(p).arte?.texto ? `texto-${et(p).arte!.texto}` : null),
    sujeito: (v) => (v === "texto-muito" ? "Artes com muito texto escrito" : v === "texto-pouco" ? "Artes com pouco texto" : "Artes sem texto"),
    contra: "as outras artes",
  },
  {
    nome: "arte",
    valor: (p) => (ESTATICO.has(p.formato) && et(p).arte?.paleta ? `paleta-${et(p).arte!.paleta}` : null),
    sujeito: (v) => `Artes de paleta ${v.replace("paleta-", "")}`,
    contra: "as de outra paleta",
  },
  // As combinações: é aqui que aparece "reels com humor" e "carrossel em lista".
  {
    nome: "combinacao",
    valor: (p) => (et(p).tom ? `${p.formato}+${et(p).tom}` : null),
    sujeito: (v, r) => `${formatoNoPlural(v.split("+")[0], r)} ${ROTULO_DO_TOM[v.split("+")[1]] ?? v.split("+")[1]}`,
    contra: "os outros do mesmo formato",
    estrato: (p) => p.formato,
  },
  {
    nome: "combinacao",
    valor: (p) => (et(p).recurso && et(p).recurso !== "nenhum" ? `${p.formato}+${et(p).recurso}` : null),
    sujeito: (v, r) => `${formatoNoPlural(v.split("+")[0], r)} ${ROTULO_DO_RECURSO[v.split("+")[1]] ?? v.split("+")[1]}`,
    contra: "os outros do mesmo formato",
    estrato: (p) => p.formato,
  },
  {
    nome: "combinacao",
    valor: (p) => (ESTRUTURA[String(et(p).estrutura)] ? `${p.formato}+${et(p).estrutura}` : null),
    sujeito: (v, r) => `${formatoNoPlural(v.split("+")[0], r)} que ${ESTRUTURA[v.split("+")[1]]}`,
    contra: "os outros do mesmo formato",
    estrato: (p) => p.formato,
  },
  {
    nome: "combinacao",
    valor: (p) => (GANCHO[String(et(p).gancho)] ? `${p.formato}+${et(p).gancho}` : null),
    sujeito: (v, r) => `${formatoNoPlural(v.split("+")[0], r)} que ${GANCHO[v.split("+")[1]]}`,
    contra: "os outros do mesmo formato",
    estrato: (p) => p.formato,
  },
];

/** Os grupos que diferem do resto, com a régua da amostra. Puro, sem banco. */
export type Contraste = { valor: string; vezes: number; grupo: PostParaAchado[]; perfis: number; concordam: boolean; resto: number };

/**
 * O CONTRASTE DENTRO DO PERFIL, a conta única dos achados e do painel (02/10):
 * para cada valor da dimensão, os posts dele contra os outros posts do MESMO
 * perfil (e do mesmo formato, quando há `estrato`). Juntar todos os perfis
 * numa conta só confundia "vídeo longo" com "o canal do YouTube" (o único que
 * tem vídeo longo). Só conta o perfil com pelo menos 2 posts de cada lado;
 * depois a média geométrica, pesada pelo lado menor.
 */
export function contrastesDentroDoPerfil(posts: PostParaAchado[], valor: (p: PostParaAchado) => string | null, estrato?: (p: PostParaAchado) => string): Contraste[] {
  const aplicaveis = posts.filter((p) => p.ganho !== null && valor(p) !== null);
  const valores = new Set(aplicaveis.map((p) => valor(p)!));
  if (valores.size < 2) return [];
  const porCelula = new Map<string, PostParaAchado[]>();
  const celula = (p: PostParaAchado) => (estrato ? `${p.perfilId}|${estrato(p)}` : p.perfilId);
  for (const p of aplicaveis) porCelula.set(celula(p), [...(porCelula.get(celula(p)) ?? []), p]);
  const saida: Contraste[] = [];
  for (const v of valores) {
    const contribuicoes: Array<{ perfilId: string; razao: number; peso: number; grupo: PostParaAchado[]; resto: number }> = [];
    for (const [chaveDaCelula, lista] of porCelula) {
      const perfilId = chaveDaCelula.split("|")[0];
      const grupo = lista.filter((p) => valor(p) === v);
      const resto = lista.filter((p) => valor(p) !== v);
      if (grupo.length < 2 || resto.length < 2) continue;
      const base = mediana(resto.map((p) => p.ganho!));
      const doGrupo = mediana(grupo.map((p) => p.ganho!));
      if (base <= 0 && doGrupo <= 0) continue;
      const razao = Math.min(20, Math.max(0.05, base > 0 ? doGrupo / base : 20));
      contribuicoes.push({ perfilId, razao, peso: Math.min(grupo.length, resto.length), grupo, resto: resto.length });
    }
    if (!contribuicoes.length) continue;
    const grupo = contribuicoes.flatMap((c) => c.grupo);
    const somaPeso = contribuicoes.reduce((s, c) => s + c.peso, 0);
    const vezes = Math.round(Math.exp(contribuicoes.reduce((s, c) => s + c.peso * Math.log(c.razao), 0) / somaPeso) * 100) / 100;
    const melhor = vezes >= 1;
    saida.push({
      valor: v,
      vezes,
      grupo,
      perfis: new Set(contribuicoes.map((c) => c.perfilId)).size,
      concordam: contribuicoes.every((c) => (melhor ? c.razao > 1 : c.razao < 1)),
      resto: contribuicoes.reduce((s, c) => s + c.resto, 0),
    });
  }
  return saida;
}

function achadosDeComparacao(posts: PostParaAchado[]): Array<Achado & { peso: number }> {
  const saida: Array<Achado & { peso: number }> = [];
  DIMENSOES.forEach((d) => {
    for (const c of contrastesDentroDoPerfil(posts, d.valor, d.estrato)) {
      const v = c.valor;
      const posGrupo = c.grupo;
      const vezes = c.vezes;
      const perfis = c.perfis;
      const concordam = c.concordam;
      if (posGrupo.length < MIN_GRUPO) continue;
      if (vezes < MIN_ACIMA && vezes > MAX_ABAIXO) continue;
      const melhor = vezes >= 1;
      // Forte: a régua do padrão E todos os perfis apontando para o mesmo lado.
      const forte = posGrupo.length >= 5 && perfis >= 2 && concordam && (vezes >= 1.5 || vezes <= 0.67);
      const redes = new Set(posGrupo.map((p) => p.rede));
      const rede: Achado["rede"] = redes.size === 1 ? [...redes][0] : "todas";
      const frase = `${d.sujeito(v, rede)} renderam ${quantoMais(vezes)} ${d.contra}, dentro do mesmo perfil.`;
      const exemplos = [...posGrupo].sort((a, b) => (melhor ? b.ganho! - a.ganho! : a.ganho! - b.ganho!)).slice(0, 2).map(exemplo);
      saida.push({
        chave: `${d.nome}:${v}`,
        tipo: d.nome,
        frase,
        comoMedimos: COMO_MEDIMOS,
        sentido: melhor ? "melhor" : "pior",
        vezes,
        amostra: { posts: posGrupo.length, perfis, base: posGrupo.length + c.resto },
        forca: forte ? "forte" : "indicio",
        rede,
        exemplos,
        // O que mais pesa: diferença grande, amostra grande, mais de um perfil.
        peso: Math.abs(Math.log(vezes)) * Math.sqrt(Math.min(posGrupo.length, 20)) * (perfis >= 2 ? 1 : 0.6) * (concordam ? 1 : 0.7),
      });
    }
  });
  return saida.sort((a, b) => b.peso - a.peso);
}

/** Os posts que mais passaram do normal do perfil, com os números reais e o link. */
function destaques(posts: PostParaAchado[], quantos = 3): Achado[] {
  const fortes = posts.filter((p) => (p.ganho ?? 0) >= 2.5).sort((a, b) => b.ganho! - a.ganho!);
  // No máximo dois do mesmo perfil, para o destaque não virar o perfil de um só.
  const porPerfil = new Map<string, number>();
  const escolhidos: PostParaAchado[] = [];
  for (const p of fortes) {
    if ((porPerfil.get(p.perfilId) ?? 0) >= 2) continue;
    porPerfil.set(p.perfilId, (porPerfil.get(p.perfilId) ?? 0) + 1);
    escolhidos.push(p);
    if (escolhidos.length >= quantos) break;
  }
  return escolhidos.map((p) => {
    const numeros: string[] = [];
    if (p.visualizacoes) numeros.push(`${numeroCurto(p.visualizacoes)} visualizações`);
    if (p.curtidas) numeros.push(`${numeroCurto(p.curtidas)} curtidas`);
    if (p.comentarios) numeros.push(`${numeroCurto(p.comentarios)} comentários`);
    if (p.extras?.salvamentos) numeros.push(`${numeroCurto(p.extras.salvamentos)} salvamentos`);
    const quando = p.publicadoEm ? ` de ${p.publicadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}` : "";
    const comoE = [
      GANCHO[String(et(p).gancho)] ? GANCHO[String(et(p).gancho)].replace(/^abrem/, "abre") : null,
      ESTRUTURA[String(et(p).estrutura)] ? ESTRUTURA[String(et(p).estrutura)].replace(/^são /, "é ").replace(/^seguem/, "segue").replace(/^mostram/, "mostra").replace(/^contam/, "conta") : null,
      et(p).tom ? TOM_NO_SINGULAR[String(et(p).tom)] ?? null : null,
    ].filter(Boolean);
    const autor = p.rede === "linkedin" ? "a página" : p.perfil.startsWith("@") ? p.perfil : `@${p.perfil}`;
    const vezes = Math.round(p.ganho! * 10) / 10;
    return {
      chave: `destaque:${p.id}`,
      tipo: "destaque" as const,
      frase: `O ${formatoNoSingular(p.formato, p.rede)} de ${autor}${quando} chegou a ${numeros.slice(0, 3).join(", ") || "um alcance alto"}: ${vezes.toLocaleString("pt-BR")} vezes o normal do próprio perfil${comoE.length ? ` (${comoE.join(", ")})` : ""}.`,
      comoMedimos: "Os números são os que a rede mostrava no dia da coleta; o normal do perfil é a mediana dos posts dele com mais de 7 dias.",
      sentido: "melhor" as const,
      vezes,
      amostra: { posts: 1, perfis: 1, base: posts.filter((x) => x.perfilId === p.perfilId).length },
      forca: "indicio" as const,
      rede: p.rede,
      exemplos: [exemplo(p)],
    };
  });
}

/** Qual formato puxa mais conversa (comentário por curtida), por rede. */
function conversa(posts: PostParaAchado[]): Achado[] {
  const saida: Achado[] = [];
  for (const rede of ["instagram", "tiktok", "linkedin"] as RedeDeReferencia[]) {
    const daRede = posts.filter((p) => p.rede === rede && (p.curtidas ?? 0) > 0 && p.comentarios !== null);
    const porFormato = new Map<string, PostParaAchado[]>();
    for (const p of daRede) porFormato.set(p.formato, [...(porFormato.get(p.formato) ?? []), p]);
    const taxas = [...porFormato.entries()]
      .filter(([, l]) => l.length >= 4)
      .map(([formato, l]) => {
        const curtidas = l.reduce((s, p) => s + (p.curtidas ?? 0), 0);
        const comentarios = l.reduce((s, p) => s + (p.comentarios ?? 0), 0);
        return { formato, l, curtidasPorComentario: comentarios > 0 ? curtidas / comentarios : Infinity };
      })
      .filter((t) => Number.isFinite(t.curtidasPorComentario))
      .sort((a, b) => a.curtidasPorComentario - b.curtidasPorComentario);
    if (taxas.length < 2) continue;
    const [primeiro, ...outros] = taxas;
    const vezes = Math.round((outros[0].curtidasPorComentario / primeiro.curtidasPorComentario) * 100) / 100;
    if (vezes < 1.3) continue;
    const todos = taxas.flatMap((t) => t.l);
    const perfis = new Set(primeiro.l.map((p) => p.perfilId)).size;
    const umACada = (n: number) => `1 comentário a cada ${Math.round(n).toLocaleString("pt-BR")} curtidas`;
    saida.push({
      chave: `conversa:${rede}:${primeiro.formato}`,
      tipo: "conversa",
      frase: `No ${rede === "instagram" ? "Instagram" : rede === "tiktok" ? "TikTok" : "LinkedIn"}, ${minuscula(formatoNoPlural(primeiro.formato, rede)).replace(/ no TikTok$/, "")} são o formato que mais puxa conversa: ${umACada(primeiro.curtidasPorComentario)}, contra ${outros
        .slice(0, 2)
        .map((o) => `1 a cada ${Math.round(o.curtidasPorComentario).toLocaleString("pt-BR")} em ${minuscula(formatoNoPlural(o.formato, rede)).replace(/ no TikTok$/, "")}`)
        .join(" e ")}.`,
      comoMedimos: "Soma dos comentários dividida pela soma das curtidas de cada formato, na mesma rede. O salvamento não entra: o Instagram não mostra salvamentos de terceiros.",
      sentido: "melhor",
      vezes,
      amostra: { posts: primeiro.l.length, perfis, base: todos.length },
      forca: primeiro.l.length >= 5 && perfis >= 2 ? "forte" : "indicio",
      rede,
      exemplos: [...primeiro.l].sort((a, b) => (b.comentarios ?? 0) - (a.comentarios ?? 0)).slice(0, 2).map(exemplo),
    });
  }
  return saida;
}

/** Qual formato mais salva, onde a rede mostra o salvamento (TikTok). */
function salvamentos(posts: PostParaAchado[]): Achado[] {
  const comSalvos = posts.filter((p) => p.extras?.salvamentos !== null && p.extras?.salvamentos !== undefined && (p.visualizacoes ?? 0) > 0);
  const porFormato = new Map<string, PostParaAchado[]>();
  for (const p of comSalvos) porFormato.set(`${p.rede}:${p.formato}`, [...(porFormato.get(`${p.rede}:${p.formato}`) ?? []), p]);
  const taxas = [...porFormato.entries()]
    .filter(([, l]) => l.length >= 4)
    .map(([chave, l]) => ({
      chave,
      l,
      porMil: (l.reduce((s, p) => s + (p.extras!.salvamentos ?? 0), 0) / l.reduce((s, p) => s + (p.visualizacoes ?? 0), 0)) * 1000,
    }))
    .sort((a, b) => b.porMil - a.porMil);
  if (taxas.length < 2 || taxas[1].porMil <= 0) return [];
  const [primeiro, segundo] = taxas;
  const vezes = Math.round((primeiro.porMil / segundo.porMil) * 100) / 100;
  if (vezes < 1.3) return [];
  const [rede, formato] = primeiro.chave.split(":") as [RedeDeReferencia, string];
  const perfis = new Set(primeiro.l.map((p) => p.perfilId)).size;
  const n = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return [
    {
      chave: `salvamento:${primeiro.chave}`,
      tipo: "salvamento",
      frase: `${formatoNoPlural(formato, rede)} são o que mais salva: ${n(primeiro.porMil)} salvamentos a cada mil visualizações, contra ${n(segundo.porMil)} em ${minuscula(formatoNoPlural(segundo.chave.split(":")[1], rede)).replace(/ no TikTok$/, "")}.`,
      comoMedimos: "Salvamentos divididos pelas visualizações de cada formato. Só o TikTok mostra salvamentos de terceiros; no Instagram esse número não é público.",
      sentido: "melhor",
      vezes,
      amostra: { posts: primeiro.l.length, perfis, base: primeiro.l.length + segundo.l.length },
      forca: primeiro.l.length >= 5 && perfis >= 2 ? "forte" : "indicio",
      rede,
      exemplos: [...primeiro.l].sort((a, b) => (b.extras?.salvamentos ?? 0) - (a.extras?.salvamentos ?? 0)).slice(0, 2).map(exemplo),
    },
  ];
}

/** O ritmo dos vídeos que rendem contra os que não rendem (vídeos medidos no worker). */
function ritmo(posts: PostParaAchado[]): Achado[] {
  const medidos = posts.filter((p) => p.medidas && typeof p.medidas.cenaMediana === "number" && p.ganho !== null);
  const rendem = medidos.filter((p) => p.ganho! >= 1);
  const naoRendem = medidos.filter((p) => p.ganho! < 1);
  if (rendem.length < 3 || naoRendem.length < 3) return [];
  const s = (x: number | undefined) => (x === undefined ? "?" : `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`);
  const med = (l: PostParaAchado[], f: (m: MedidaDoVideo) => number | null | undefined) => {
    const xs = l.map((p) => f(p.medidas!)).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return xs.length ? mediana(xs) : undefined;
  };
  const corteA = med(rendem, (m) => m.primeiroCorte);
  const corteB = med(naoRendem, (m) => m.primeiroCorte);
  const cenaA = med(rendem, (m) => m.cenaMediana);
  const cenaB = med(naoRendem, (m) => m.cenaMediana);
  const textoA = med(rendem, (m) => m.quadros?.texto);
  const falaA = med(rendem, (m) => m.falaComecaEm);
  const partes = [
    corteA !== undefined ? `a primeira troca de cena vem aos ${s(corteA)}${corteB !== undefined ? ` (contra ${s(corteB)} nos que rendem abaixo)` : ""}` : null,
    cenaA !== undefined ? `cada cena dura ${s(cenaA)}${cenaB !== undefined ? ` (contra ${s(cenaB)})` : ""}` : null,
    falaA !== undefined ? `a fala começa aos ${s(falaA)}` : null,
    textoA !== undefined ? `há texto na tela em ${Math.round(textoA * 100)}% dos quadros` : null,
  ].filter(Boolean);
  if (!partes.length) return [];
  const perfis = new Set(medidos.map((p) => p.perfilId)).size;
  return [
    {
      chave: "ritmo:videos",
      tipo: "ritmo",
      frase: `Nos vídeos que rendem acima do normal do perfil, ${partes.join(", ")}.`,
      comoMedimos: "Vídeos baixados, medidos e apagados na hora (cortes, fala e quadros); aqui ficam só os números. Comparação entre os que rendem acima e abaixo do normal do próprio perfil.",
      sentido: "neutro",
      vezes: null,
      amostra: { posts: rendem.length, perfis, base: medidos.length },
      forca: rendem.length >= 5 && perfis >= 2 ? "forte" : "indicio",
      rede: "todas",
      exemplos: [...rendem].sort((a, b) => b.ganho! - a.ganho!).slice(0, 2).map(exemplo),
    },
  ];
}

/** Todos os achados de uma lista de posts. Pura, para o teste com dados reais. */
export function calcularAchados(posts: PostParaAchado[], opcoes: { maxComparacoes?: number } = {}): Achado[] {
  const comparacoes = achadosDeComparacao(posts);
  // Não repete a mesma ideia: se "reels" já entrou, "reels com humor" só entra
  // se disser outra coisa (o outro lado da combinação ainda não apareceu).
  const escolhidos: Array<Achado & { peso: number }> = [];
  const vistos = new Set<string>();
  for (const a of comparacoes) {
    const partes = a.chave.split(":")[1]?.split("+") ?? [];
    const chaveDoSentido = `${a.sentido}:${partes.sort().join("+")}`;
    if (vistos.has(chaveDoSentido)) continue;
    if (a.tipo === "combinacao" && partes.every((x) => vistos.has(`${a.sentido}:${x}`))) continue;
    vistos.add(chaveDoSentido);
    escolhidos.push(a);
    if (escolhidos.length >= (opcoes.maxComparacoes ?? 10)) break;
  }
  // Forte antes de indício; dentro de cada um, o peso.
  escolhidos.sort((a, b) => (a.forca === b.forca ? b.peso - a.peso : a.forca === "forte" ? -1 : 1));
  return [
    ...escolhidos.map(({ peso: _peso, ...a }) => a),
    ...destaques(posts),
    ...conversa(posts),
    ...salvamentos(posts),
    ...ritmo(posts),
  ];
}

/** Os achados do projeto, lidos do banco agora. */
export async function achadosDoProjeto(projectId: string): Promise<{ achados: Achado[]; painel: PainelExecutivo; amostra: { posts: number; perfis: number; comGanho: number } }> {
  const linhas = await prisma.referenciaPost.findMany({
    where: { projectId, perfil: { status: "confirmado" } },
    select: {
      id: true,
      perfilId: true,
      rede: true,
      url: true,
      formato: true,
      duracaoSeg: true,
      publicadoEm: true,
      curtidas: true,
      comentarios: true,
      visualizacoes: true,
      compartilhamentos: true,
      ganho: true,
      etiquetas: true,
      extras: true,
      medidas: true,
      perfil: { select: { perfil: true } },
    },
  });
  const posts: PostParaAchado[] = linhas.map((l) => ({
    id: l.id,
    perfilId: l.perfilId,
    rede: l.rede as RedeDeReferencia,
    perfil: l.perfil.perfil,
    url: l.url,
    formato: l.formato,
    duracaoSeg: l.duracaoSeg,
    publicadoEm: l.publicadoEm,
    curtidas: l.curtidas,
    comentarios: l.comentarios,
    visualizacoes: l.visualizacoes,
    compartilhamentos: l.compartilhamentos,
    ganho: l.ganho,
    etiquetas: (l.etiquetas as PostParaAchado["etiquetas"]) ?? null,
    extras: (l.extras as ExtrasDoPost | null) ?? null,
    medidas: (l.medidas as MedidaDoVideo | null) ?? null,
  }));
  return {
    achados: calcularAchados(posts),
    painel: painelExecutivo(posts),
    amostra: { posts: posts.length, perfis: new Set(posts.map((p) => p.perfilId)).size, comGanho: posts.filter((p) => p.ganho !== null).length },
  };
}

/**
 * O PAINEL EXECUTIVO (02/10/2026): os gráficos do topo da aba.
 *
 * Pedido do Bruno: "precisa ser gráfico. Não pode ser um monte de card,
 * precisa ser executivo". Cada barra é uma categoria (carrossel, tom
 * educativo, abre com pergunta...) e o número é o MESMO contraste dos achados
 * (contrastesDentroDoPerfil): quantas vezes os posts dela renderam contra os
 * outros posts do mesmo perfil (1 = igual ao resto do perfil). Primeira
 * versão usava a mediana solta do ganho e contradizia os cards ("fundo liso
 * 1,7x" no gráfico e "menos de um décimo" no card): número de tela tem de ser
 * um só.
 *
 * Força: 5 posts ou mais, de 2 perfis ou mais, e todos os perfis apontando
 * para o mesmo lado é "forte"; o resto é "indício", e a tela desenha a barra
 * hachurada. As frases do topo só saem de barra forte: um indício de 1
 * perfil nunca vira manchete.
 */
const ROTULO_DO_FORMATO = (formato: string, rede: RedeDeReferencia): string => {
  if (formato === "carrossel") return rede === "tiktok" ? "Carrossel de fotos (TikTok)" : "Carrossel";
  if (formato === "video") return rede === "youtube" ? "Vídeo longo (YouTube)" : rede === "tiktok" ? "Vídeo (TikTok)" : "Vídeo";
  return ({ reel: "Reel", imagem: "Imagem única", short: "Short", texto: "Só texto", documento: "Documento" } as Record<string, string>)[formato] ?? formato;
};
const ROTULO_CURTO_DO_TOM: Record<string, string> = { humor: "Humor", serio: "Sério", inspirador: "Inspirador", educativo: "Educativo", polemico: "Polêmico", emocional: "Emotivo" };
const ROTULO_DO_GANCHO: Record<string, string> = {
  pergunta: "Pergunta",
  numero: "Número",
  contraintuitivo: "Contra o senso comum",
  historia: "História",
  promessa: "Promessa de resultado",
  lista: "Anuncia uma lista",
  polemica: "Polêmica",
};
const ROTULO_DA_ESTRUTURA: Record<string, string> = {
  problema_solucao: "Problema e solução",
  lista: "Lista",
  antes_depois: "Antes e depois",
  bastidor: "Bastidor",
  tutorial: "Passo a passo",
  opiniao: "Opinião direta",
  caso: "Caso contado",
};
const ROTULO_DA_ARTE: Record<string, string> = {
  foto_de_pessoa: "Foto de pessoa",
  texto_sobre_fundo: "Texto sobre fundo liso",
  print_de_tela: "Print de tela",
  meme: "Meme",
  ilustracao: "Ilustração",
  grafico_ou_dado: "Gráfico ou número",
  produto_ou_objeto: "Produto ou objeto",
  colagem: "Colagem",
};

function barrasDoPainel(posts: PostParaAchado[], valor: (p: PostParaAchado) => string | null, nome: (v: string) => string): BarraDoPainel[] {
  return contrastesDentroDoPerfil(posts, valor)
    .filter((c) => c.grupo.length >= MIN_GRUPO)
    .map((c) => ({
      chave: c.valor,
      nome: nome(c.valor),
      vezes: c.vezes,
      posts: c.grupo.length,
      perfis: c.perfis,
      forca: (c.grupo.length >= 5 && c.perfis >= 2 && c.concordam ? "forte" : "indicio") as BarraDoPainel["forca"],
      exemplos: [...c.grupo].sort((a, b) => b.ganho! - a.ganho!).slice(0, 2).map(exemplo),
    }))
    .sort((a, b) => b.vezes - a.vezes);
}

function graficoDoPainel(id: IdDoGrafico, titulo: string, pergunta: string, lista: BarraDoPainel[]): GraficoDoPainel {
  const vencedora = lista.find((b) => b.forca === "forte" && b.vezes >= 1.3)?.chave ?? null;
  return { id, titulo, pergunta, barras: lista, vencedora };
}

const vezesCurto = (v: number) => (v < 0.1 ? "<0,1x" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 0 : 1 })}x`);

export function painelExecutivo(posts: PostParaAchado[]): PainelExecutivo {
  const formatos = barrasDoPainel(posts, (p) => p.formato, (v) => ROTULO_DO_FORMATO(v, "instagram"));
  const tom = barrasDoPainel(posts, (p) => (et(p).tom ? String(et(p).tom) : null), (v) => ROTULO_CURTO_DO_TOM[v] ?? v);
  const ganchos = barrasDoPainel(posts, (p) => (ROTULO_DO_GANCHO[String(et(p).gancho)] ? String(et(p).gancho) : null), (v) => ROTULO_DO_GANCHO[v]);
  const estrutura = barrasDoPainel(posts, (p) => (ROTULO_DA_ESTRUTURA[String(et(p).estrutura)] ? String(et(p).estrutura) : null), (v) => ROTULO_DA_ESTRUTURA[v]);
  const fechamento = barrasDoPainel(
    posts,
    (p) => (et(p).cta ? (et(p).cta === "nenhuma" ? "sem-pedir" : "pede-acao") : null),
    (v) => (v === "pede-acao" ? "Pede uma ação" : "Termina sem pedir nada")
  );
  const arte = barrasDoPainel(posts, (p) => (ESTATICO.has(p.formato) && et(p).arte?.estilo ? String(et(p).arte!.estilo) : null), (v) => ROTULO_DA_ARTE[v] ?? v);
  const audio = barrasDoPainel(
    posts,
    (p) => (VIDEO.has(p.formato) && p.extras?.audio ? (p.extras.audio.original ? "fala" : "musica") : null),
    (v) => (v === "fala" ? "Só a fala" : "Música por baixo")
  );

  const graficos: GraficoDoPainel[] = [
    graficoDoPainel("formatos", "Formatos", "Qual tipo de post rende mais", formatos),
    graficoDoPainel("fechamento", "Fechamento", "Terminar pedindo uma ação faz diferença?", fechamento),
    graficoDoPainel("estrutura", "Estrutura", "Como o conteúdo é organizado", estrutura),
    graficoDoPainel("ganchos", "Ganchos", "Como a primeira frase prende", ganchos),
    graficoDoPainel("tom", "Tom", "O jeito de falar", tom),
    graficoDoPainel("arte", "Estilo da arte", "A capa dos posts de imagem e carrossel", arte),
    graficoDoPainel("audio", "Áudio dos vídeos", "Música por baixo ou só a fala", audio),
  ].filter((g) => g.barras.length > 0);

  // AS FRASES DO TOPO: só de barra forte, no máximo 4, cada uma presa ao gráfico.
  const frases: FraseDoPainel[] = [];
  const g = (id: IdDoGrafico) => graficos.find((x) => x.id === id);
  const vencedoraDe = (gr?: GraficoDoPainel) => gr?.barras.find((b) => b.chave === gr.vencedora);
  const fortes = (gr?: GraficoDoPainel) => (gr?.barras ?? []).filter((b) => b.forca === "forte");
  const comoContamos = (b: BarraDoPainel) => `${b.posts} posts de ${b.perfis} perfis, contra os outros posts do mesmo perfil`;

  const formato = vencedoraDe(g("formatos"));
  if (formato) frases.push({ numero: vezesCurto(formato.vezes), texto: `${formato.nome} rende ${vezesCurto(formato.vezes)} o resto do perfil.`, detalhe: comoContamos(formato), grafico: "formatos" });
  const pede = fortes(g("fechamento")).find((b) => b.chave === "pede-acao" && b.vezes >= 1.3);
  if (pede) frases.push({ numero: vezesCurto(pede.vezes), texto: `Feche pedindo uma ação: rende ${vezesCurto(pede.vezes)} o post que termina sem pedir nada.`, detalhe: comoContamos(pede), grafico: "fechamento" });
  const est = vencedoraDe(g("estrutura"));
  if (est) frases.push({ numero: vezesCurto(est.vezes), texto: `${est.nome} rende ${vezesCurto(est.vezes)} o resto do perfil.`, detalhe: comoContamos(est), grafico: "estrutura" });
  for (const id of ["tom", "arte", "ganchos", "formatos", "estrutura"] as IdDoGrafico[]) {
    if (frases.length >= 4) break;
    const pior = [...fortes(g(id))].sort((a, b) => a.vezes - b.vezes)[0];
    if (pior && pior.vezes <= 0.7) {
      frases.push({
        numero: vezesCurto(pior.vezes),
        texto: `Evite ${id === "tom" ? "o tom " : ""}${pior.nome.toLowerCase()}: rende só ${vezesCurto(pior.vezes)} o resto do perfil.`,
        detalhe: comoContamos(pior),
        grafico: id,
      });
    }
  }
  return { graficos, frases: frases.slice(0, 4) };
}
