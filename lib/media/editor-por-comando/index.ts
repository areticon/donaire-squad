import { prisma } from "@/lib/db/prisma";
import { jevLigado, perguntarAoJev, decidirChoice } from "@/lib/jev/cliente";
import { estiloDoCatalogo, type EscolhaDeEstilo } from "@/lib/media/catalogo-de-estilos";
import { gerarInsercoes, frasesNumeradas, temaDoEstilo } from "@/lib/media/editor-sob-medida";
import { blocosDoEditor } from "@/lib/media/editor-sob-medida/editor";
import { fotosDoMomento, prepararFotosDoVox, type GuardaDoRecorte } from "@/lib/media/editor-sob-medida/recortes-vox";
import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import type { EdicaoResolvida, MidiaDaInsercao, Tema } from "@/lib/media/editor-sob-medida/tipos";
import { fichaDaFonte, normalizarComando, REFERENCIAS_DE_COMANDO, type ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { corrigirPlano, escreverPlano, type EntradaDoDiretor, type NotaDoRevisor, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import { resolverPorComando } from "@/lib/media/editor-por-comando/resolver";

/**
 * O EDITOR POR COMANDO (05/10/2026), atrás do interruptor EDITOR_POR_COMANDO=1.
 *
 * O caminho:
 *   comando do cliente (+ letra + cores)
 *     -> o JEV classifica o comando (a base do acabamento, meio segundo)
 *     -> o DIRETOR (Opus) escreve o plano da composição (props validadas)
 *     -> as imagens (fotos das peças de papel e cenas) em paralelo, com teto
 *        de custo por vídeo e cache pelo hash do pedido
 *     -> o resolvedor sem regras de colisão
 *     -> o worker renderiza o FINAL direto (sem prévia em meia resolução)
 *     -> o REVISOR olha quadros do final contra o comando; com nota, o diretor
 *        corrige UMA vez e o final sai de novo (EDITOR_POR_COMANDO_RODADAS).
 *
 * Desligado, nada muda: o editor sob medida e a montagem de sempre seguem.
 */

export function editorPorComandoLigado(): boolean {
  return process.env.EDITOR_POR_COMANDO === "1";
}

/** Quantas correções o diretor faz depois do revisor (padrão 1; 0 entrega o primeiro final). */
export function rodadasDeCorrecao(): number {
  return Math.max(0, Math.min(2, Number(process.env.EDITOR_POR_COMANDO_RODADAS ?? 1)));
}

/** O teto de imagens NOVAS por vídeo (o custo): corte 6, completo 1 a cada ~40 s até 30. */
export function tetoDeImagens(alvo: "corte" | "completo", duracaoSeg = 60): number {
  if (alvo === "corte") return Math.max(0, Number(process.env.EDITOR_POR_COMANDO_IMAGENS_CORTE ?? 6));
  return Math.max(0, Math.min(30, Math.round(duracaoSeg / Number(process.env.EDITOR_POR_COMANDO_SEG_POR_IMAGEM ?? 40))));
}

// ─────────────────────────────── o comando guardado ───────────────────────────────

/** O comando do projeto (projects.config.comandoDoVideo). */
export async function lerComandoDoProjeto(projectId: string): Promise<ComandoDoVideo | null> {
  const r = await prisma.$queryRaw<Array<{ c: unknown }>>`SELECT config -> 'comandoDoVideo' AS c FROM projects WHERE id = ${projectId}`;
  return normalizarComando(r[0]?.c ?? null);
}

/** Grava SÓ a chave do comando dentro do config (o resto do config fica como está). */
export async function salvarComandoDoProjeto(projectId: string, c: ComandoDoVideo): Promise<void> {
  const json = JSON.stringify({ ...c, atualizadoEm: new Date().toISOString() });
  await prisma.$executeRaw`
    UPDATE projects
    SET config = jsonb_set(CASE WHEN jsonb_typeof(config) = 'object' THEN config ELSE '{}'::jsonb END, '{comandoDoVideo}', ${json}::jsonb), "updatedAt" = now()
    WHERE id = ${projectId}`;
}

/** Projeto sem comando com a flag ligada: o comando sai do estilo escolhido antes (a referência pronta mais parecida). */
export function comandoPadrao(escolha: EscolhaDeEstilo): ComandoDoVideo {
  const id = escolha.estiloId;
  const ref =
    id === "vox" || id === "documentario" || id === "johnny-harris"
      ? REFERENCIAS_DE_COMANDO[0]
      : id === "consorcio" || id === "wes-anderson"
        ? REFERENCIAS_DE_COMANDO[2]
        : id === "lousa"
          ? REFERENCIAS_DE_COMANDO[3]
          : null;
  if (ref) return { texto: ref.texto, fonte: ref.fonte, cores: { tipo: "marca" }, origem: "referencia", referencia: ref.id };
  const nome = estiloDoCatalogo(id)?.nome ?? id;
  return { texto: escolha.texto?.trim() || `Edição no estilo ${nome}, com as peças que combinam com ele e algo novo na tela a cada 4 a 8 segundos.`, fonte: "geist", cores: { tipo: "marca" }, origem: "escrito" };
}

// ─────────────────────────────── a classificação (JEV) ───────────────────────────────

const BASES = ["vox", "lousa", "consorcio", "hormozi", "documentario", "keynote"] as const;
type Base = (typeof BASES)[number];

/** A base do acabamento pelo texto (o recuo sem o JEV). */
function basePorPalavras(texto: string): Base {
  const t = texto.toLowerCase();
  if (/vox|papel|colagem|recorte|jornal|arquivo/.test(t)) return "vox";
  if (/lousa|quadro branco|dan martell|diagrama/.test(t)) return "lousa";
  if (/luxo|high ticket|premium|dourad|minimalis/.test(t)) return "consorcio";
  if (/hormozi|mrbeast|retenç|viral|impacto/.test(t)) return "hormozi";
  if (/document|cinema|bbc/.test(t)) return "documentario";
  return "keynote";
}

/** O JEV classifica o comando numa base (só o acabamento padrão; o diretor pode trocar). */
export async function classificarComando(texto: string, projectId?: string | null): Promise<Base> {
  const recuo = basePorPalavras(texto);
  if (!jevLigado()) return recuo;
  try {
    const r = await perguntarAoJev(
      { projectId, etapa: "editor-por-comando-classe", state: { comando: texto } },
      {
        base: {
          type: "choice",
          instructions: "Qual destas linguagens de edição o comando do cliente descreve?",
          criteria: {
            vox: "documentário explicativo com colagem de papel, recortes, jornal, mapa antigo, fotos de arquivo",
            lousa: "lousa ou quadro com diagramas desenhados, frameworks, aula de negócios",
            consorcio: "luxo, high ticket, premium, preto e dourado, minimalista",
            hormozi: "impacto, retenção, texto grande e rápido, viral",
            documentario: "documentário cinematográfico sóbrio",
            keynote: "tecnológico, limpo, didático, passo a passo, painéis",
          },
        },
      }
    );
    return decidirChoice(r.base, BASES, recuo, 0.4);
  } catch {
    return recuo;
  }
}

// ─────────────────────────────── o tema ───────────────────────────────

/** As cores: as da marca, ou as escolhidas no comando. */
export function coresDoComando(c: ComandoDoVideo, marca: { acento: string; escuro: string; claro: string }): { acento: string; escuro: string; claro: string } {
  return c.cores.tipo === "outra" ? { acento: c.cores.acento, escuro: c.cores.escuro, claro: c.cores.claro } : marca;
}

/** O tema da edição: a base classificada, a letra escolhida, as cores e o acabamento que o diretor pediu. */
export function temaDoComando(c: ComandoDoVideo, base: string, cores: { acento: string; escuro: string; claro: string }, plano?: PlanoDoDiretor | null, paleta?: string[] | null): Tema {
  const b = temaDoEstilo(base, cores);
  const f = fichaDaFonte(c.fonte);
  return {
    ...b,
    fonteTitulo: f.familia,
    pesoTitulo: f.peso,
    caixaAlta: f.caixaAlta,
    ...(plano?.tema?.visual ? { visual: plano.tema.visual } : {}),
    ...(plano?.tema?.acabamento ? { acabamento: plano.tema.acabamento } : {}),
    escuroLegenda: "#06111F",
    // NO VOX a base é o papel envelhecido da peça; a marca entra só como ACENTO no marca-texto e no carimbo.
    ...(base === "vox" ? { vox: acentosDoVox(c.cores.tipo === "marca" ? paleta ?? [cores.acento, cores.escuro, cores.claro] : [c.cores.acento]) } : {}),
  };
}

function hsl(hex: string): { l: number; s: number; lum: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return { l, s, lum: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) };
}

/**
 * Os acentos da marca no Vox: o REALCE (a faixa do marca-texto, com tinta preta
 * por cima: a cor mais viva da paleta que ainda deixa o preto legível) e o
 * CARIMBO (a cor viva e escura da paleta). Sem cor que sirva, o amarelo e o
 * vermelho do Vox. Ex.: Fé & Gestão (#1f2f3a,#98092b,#df931b,#e0daa3,#9fb982)
 * dá realce #df931b e carimbo #98092b.
 */
export function acentosDoVox(paleta: string[]): { realce?: string; carimbo?: string } {
  const cs = paleta.map((h) => ({ h: h.trim(), c: hsl(h) })).filter((x): x is { h: string; c: NonNullable<ReturnType<typeof hsl>> } => Boolean(x.c));
  const realce = cs.filter((x) => x.c.lum >= 0.3 && x.c.s >= 0.45).sort((a, b) => b.c.s - a.c.s)[0]?.h;
  const carimbo = cs.filter((x) => x.c.lum < 0.3 && x.c.lum > 0.02 && x.c.s >= 0.45).sort((a, b) => b.c.s - a.c.s)[0]?.h;
  return { ...(realce ? { realce } : {}), ...(carimbo ? { carimbo } : {}) };
}

/** A paleta inteira do projeto (projects.colorPalette), em hex. */
export function paletaDoProjeto(colorPalette: string | null | undefined): string[] {
  return String(colorPalette ?? "").split(",").map((x) => x.trim()).filter((x) => /^#[0-9a-f]{6}$/i.test(x));
}

// ─────────────────────────────── o plano inteiro ───────────────────────────────

export type EntradaDoPlano = {
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: "9:16" | "16:9";
  comando: ComandoDoVideo;
  marca: { acento: string; escuro: string; claro: string };
  /** A paleta inteira da marca (todas as cores do projeto): o Vox escolhe dela os acentos. */
  paleta?: string[] | null;
  rosto: Retangulo;
  comLegenda: boolean;
  logoUrl: string | null;
  titulo?: string | null;
  perfil?: string | null;
  quadros?: Array<{ t: number; base64: string }>;
  projectId?: string | null;
  /** Teto de imagens novas (fotos + cenas). */
  imagens: number;
  /** A prova grava em disco: as cenas e os recortes vão para cá. */
  local?: (nome: string, dados: Buffer) => Promise<string>;
  guardaDosRecortes?: GuardaDoRecorte;
};

export type PlanoPorComando = {
  base: string;
  plano: PlanoDoDiretor;
  edicao: EdicaoResolvida;
  insercoes: Record<string, MidiaDaInsercao>;
  custoImagensUsd: number;
  avisos: string[];
  tempos: Record<string, number>;
};

function entradaDoDiretor(e: EntradaDoPlano, cores: { acento: string; escuro: string; claro: string }, base: string): EntradaDoDiretor {
  return {
    base,
    frases: frasesNumeradas(e.palavras),
    duracao: e.duracao,
    formato: e.formato,
    comando: e.comando,
    cores,
    fonte: fichaDaFonte(e.comando.fonte).nome,
    perfil: e.perfil,
    titulo: e.titulo,
    imagens: e.imagens,
    quadros: e.quadros,
    projectId: e.projectId,
  };
}

/** Quantas fotos das peças de papel ficaram sem url (a peça usa a reserva do assunto). */
const semFoto = (plano: PlanoDoDiretor) => (plano.momentos ?? []).flatMap(fotosDoMomento).filter((f) => !f.url).length;

/** As imagens que o plano pede, dentro do teto: as fotos das peças de papel e as cenas, em paralelo. */
async function imagensDoPlano(plano: PlanoDoDiretor, e: EntradaDoPlano, ja: Record<string, MidiaDaInsercao> = {}): Promise<{ insercoes: Record<string, MidiaDaInsercao>; custoUsd: number; erros: string[] }> {
  // As cenas que já existem (a correção que manteve a imagem) não são geradas de novo.
  const novas = (plano.insercoes ?? []).filter((x) => !ja[String(x.id)]);
  const tetoCenas = Math.min(novas.length, Math.max(0, Math.floor(e.imagens / 3)));
  const tetoFotos = Math.max(0, e.imagens - tetoCenas);
  const [fotos, cenas] = await Promise.all([
    prepararFotosDoVox(plano, { projectId: e.projectId, teto: tetoFotos, guarda: e.guardaDosRecortes }).catch((err) => ({ prontas: 0, custoUsd: 0, erros: [`fotos: ${String(err).slice(0, 120)}`] })),
    tetoCenas
      ? gerarInsercoes({ ...plano, momentos: [], insercoes: novas }, { formato: e.formato, projectId: e.projectId, teto: tetoCenas, local: e.local }).catch((err) => ({ insercoes: {}, custoUsd: 0, erros: [`cenas: ${String(err).slice(0, 120)}`] }))
      : Promise.resolve({ insercoes: {}, custoUsd: 0, erros: [] as string[] }),
  ]);
  return { insercoes: cenas.insercoes, custoUsd: +(fotos.custoUsd + cenas.custoUsd).toFixed(4), erros: [...fotos.erros, ...cenas.erros, ...(semFoto(plano) ? [`${semFoto(plano)} foto(s) sem imagem gerada: as peças de papel usam as fotos de reserva (worker/fontes/vox)`] : [])] };
}

/** Classificação + diretor + imagens + resolução. Lança se o diretor não devolveu plano. */
export async function planejarPorComando(e: EntradaDoPlano): Promise<PlanoPorComando> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const marcar = (n: string) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const cores = coresDoComando(e.comando, e.marca);
  // A classificação (JEV, meio segundo) corre junto com o diretor: só decide o tema padrão.
  // A base vem antes do diretor (meio segundo no JEV): o catálogo dele é só o do estilo.
  const base = await classificarComando(e.comando.texto, e.projectId);
  const d = await escreverPlano(entradaDoDiretor(e, cores, base));
  marcar("diretor");
  if (!d.plano.momentos.length) throw new Error(`o diretor não devolveu plano (${d.erro ?? "sem momentos"})`);
  const img = await imagensDoPlano(d.plano, e);
  marcar("imagens");
  const r = resolverPorComando(d.plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base, tema: temaDoComando(e.comando, base, cores, d.plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes: img.insercoes });
  marcar("resolver");
  return { base, plano: d.plano, edicao: r.edicao, insercoes: img.insercoes, custoImagensUsd: img.custoUsd, avisos: [...d.avisos, ...img.erros, ...r.avisos].slice(0, 40), tempos };
}

/** A correção: o diretor refaz o plano com as notas, as imagens novas (dentro do que sobrou do teto) e a resolução. */
export async function corrigirPorComando(
  e: EntradaDoPlano,
  anterior: { base: string; plano: PlanoDoDiretor; insercoes: Record<string, MidiaDaInsercao>; custoImagensUsd: number },
  notas: NotaDoRevisor[],
  resumo: string
): Promise<PlanoPorComando> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const cores = coresDoComando(e.comando, e.marca);
  const c = await corrigirPlano(entradaDoDiretor(e, cores, anterior.base), anterior.plano, notas, resumo);
  tempos.correcao = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  // As fotos já pagas voltam pelo cache (mesmo pedido, mesmo hash); as novas cabem no que sobrou do teto.
  const sobra = Math.max(0, e.imagens - Math.round(anterior.custoImagensUsd / 0.065));
  const img = await imagensDoPlano(c.plano, { ...e, imagens: sobra }, anterior.insercoes);
  tempos.imagens = +((Date.now() - t) / 1000).toFixed(1);
  const insercoes = { ...anterior.insercoes, ...img.insercoes };
  const r = resolverPorComando(c.plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base: anterior.base, tema: temaDoComando(e.comando, anterior.base, cores, c.plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes });
  return { base: anterior.base, plano: c.plano, edicao: r.edicao, insercoes, custoImagensUsd: +(anterior.custoImagensUsd + img.custoUsd).toFixed(4), avisos: [...(c.erro ? [`correção: ${c.erro}`] : []), ...c.avisos, ...img.erros, ...r.avisos].slice(0, 40), tempos };
}

// ─────────────────────────────── o completo (blocos em paralelo) ───────────────────────────────

/** Os blocos do completo: ~5 min cada, em frases inteiras (os mesmos do editor sob medida). */
export function blocosDoCompleto(palavras: PalavraNoCorte[], duracao: number): Array<{ de: number; ate: number; f0: number; f1: number }> {
  return blocosDoEditor(frasesNumeradas(palavras), duracao);
}

/** Junta os planos dos blocos num só (o tema do primeiro que pediu, o fundo se algum pediu). */
function juntarPlanos(planos: PlanoDoDiretor[]): PlanoDoDiretor {
  return {
    leitura: planos.map((p) => p.leitura).find(Boolean) ?? "",
    tema: { visual: planos.map((p) => p.tema?.visual).find(Boolean), acabamento: planos.map((p) => p.tema?.acabamento).find(Boolean), fundoColagem: planos.some((p) => p.tema?.fundoColagem) },
    momentos: planos.flatMap((p) => p.momentos),
    camera: planos.flatMap((p) => p.camera ?? []),
    insercoes: planos.flatMap((p) => p.insercoes ?? []),
    enfases: planos.flatMap((p) => p.enfases ?? []),
  };
}

/**
 * O COMPLETO POR COMANDO: um diretor por bloco de ~5 min, TODOS EM PARALELO
 * (cada um vê só a fala do bloco, com a numeração global), as imagens com o
 * teto do vídeo inteiro, e a resolução única. Bloco que falhou fica sem peça
 * (a pessoa segue falando); só lança se nenhum bloco voltou.
 */
export async function planejarCompletoPorComando(e: EntradaDoPlano): Promise<PlanoPorComando & { blocos: number; errosDosBlocos: string[] }> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const cores = coresDoComando(e.comando, e.marca);
  const blocos = blocosDoCompleto(e.palavras, e.duracao);
  const base = await classificarComando(e.comando.texto, e.projectId);
  const base0 = entradaDoDiretor(e, cores, base);
  const [partes] = await Promise.all([
    Promise.all(blocos.map((b, k) => escreverPlano({ ...base0, imagens: Math.max(1, Math.round(e.imagens / blocos.length)), quadros: (e.quadros ?? []).filter((q) => q.t >= b.de - 1 && q.t <= b.ate + 1), bloco: { f0: b.f0, f1: b.f1, k, total: blocos.length } }))),
  ]);
  tempos.diretor = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  const plano = juntarPlanos(partes.map((p) => p.plano));
  if (!plano.momentos.length) throw new Error(`o diretor não devolveu plano em nenhum bloco (${partes.map((p) => p.erro).filter(Boolean).join("; ").slice(0, 200)})`);
  const img = await imagensDoPlano(plano, e);
  tempos.imagens = +((Date.now() - t) / 1000).toFixed(1);
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base, tema: temaDoComando(e.comando, base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes: img.insercoes });
  const errosDosBlocos = partes.map((p, k) => (p.erro ? `bloco ${k + 1}: ${p.erro}` : "")).filter(Boolean);
  return { base, plano, edicao: r.edicao, insercoes: img.insercoes, custoImagensUsd: img.custoUsd, avisos: [...errosDosBlocos, ...partes.flatMap((p) => p.avisos), ...img.erros, ...r.avisos].slice(0, 40), tempos, blocos: blocos.length, errosDosBlocos };
}

/** A correção do completo: só os blocos com nota voltam ao diretor (em paralelo); os outros ficam como estão. */
export async function corrigirCompletoPorComando(
  e: EntradaDoPlano,
  anterior: { base: string; plano: PlanoDoDiretor; insercoes: Record<string, MidiaDaInsercao>; custoImagensUsd: number },
  notas: NotaDoRevisor[],
  resumo: string
): Promise<PlanoPorComando> {
  const t = Date.now();
  const cores = coresDoComando(e.comando, e.marca);
  const blocos = blocosDoCompleto(e.palavras, e.duracao);
  const blocoDe = (seg: number) => Math.max(0, blocos.findIndex((b) => seg >= b.de - 0.01 && seg <= b.ate + 0.01));
  const doBloco = (k: number) => {
    const n = (a: string) => Number(String(a).match(/^F(\d+)/)?.[1] ?? -1);
    const dentro = (a: string) => n(a) >= blocos[k].f0 && n(a) <= blocos[k].f1;
    return { ...anterior.plano, momentos: anterior.plano.momentos.filter((m) => dentro(m.de)), camera: (anterior.plano.camera ?? []).filter((c) => dentro(c.de)), insercoes: (anterior.plano.insercoes ?? []).filter((x) => dentro(x.de)), enfases: (anterior.plano.enfases ?? []).filter(dentro) };
  };
  const comNota = [...new Set(notas.map((n) => blocoDe(n.t)))];
  const base0 = entradaDoDiretor(e, cores, anterior.base);
  const novos = await Promise.all(
    blocos.map(async (b, k) => {
      if (!comNota.includes(k)) return { plano: doBloco(k), avisos: [] as string[] };
      return corrigirPlano({ ...base0, quadros: [], bloco: { f0: b.f0, f1: b.f1, k, total: blocos.length } }, doBloco(k), notas.filter((n) => blocoDe(n.t) === k), resumo);
    })
  );
  const plano = juntarPlanos(novos.map((x) => x.plano));
  const sobra = Math.max(0, e.imagens - Math.round(anterior.custoImagensUsd / 0.065));
  const img = await imagensDoPlano(plano, { ...e, imagens: sobra }, anterior.insercoes);
  const insercoes = { ...anterior.insercoes, ...img.insercoes };
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base: anterior.base, tema: temaDoComando(e.comando, anterior.base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes });
  return { base: anterior.base, plano, edicao: r.edicao, insercoes, custoImagensUsd: +(anterior.custoImagensUsd + img.custoUsd).toFixed(4), avisos: [...novos.flatMap((x) => x.avisos), ...img.erros, ...r.avisos].slice(0, 40), tempos: { correcao: +((Date.now() - t) / 1000).toFixed(1) } };
}

export { revisarPorComando } from "@/lib/media/editor-por-comando/revisor";
export type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
export type { PlanoDoDiretor, NotaDoRevisor } from "@/lib/media/editor-por-comando/diretor";
