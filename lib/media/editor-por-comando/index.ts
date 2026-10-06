import { prisma } from "@/lib/db/prisma";
import { jevLigado, perguntarAoJev, decidirChoice } from "@/lib/jev/cliente";
import { estiloDoCatalogo, type EscolhaDeEstilo } from "@/lib/media/catalogo-de-estilos";
import { gerarInsercoes, frasesNumeradas, temaDoEstilo } from "@/lib/media/editor-sob-medida";
import { blocosDoEditor } from "@/lib/media/editor-sob-medida/editor";
import { fotosDoMomento, prepararFotosDoVox, tirarFotosSemImagem, type GuardaDoRecorte } from "@/lib/media/editor-sob-medida/recortes-vox";
import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import type { EdicaoResolvida, MidiaDaInsercao, Tema } from "@/lib/media/editor-sob-medida/tipos";
import { fichaDaFonte, normalizarComando, REFERENCIAS_DE_COMANDO, type ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { corrigirPlano, escreverPlano, type EntradaDoDiretor, type NotaDoRevisor, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import { resolverPorComando } from "@/lib/media/editor-por-comando/resolver";
import { completarPlanoPeloJev, diretorPorLlm, escreverPlanoPeloJev, type EntradaDoPlanoPeloJev } from "@/lib/media/editor-por-comando/plano-pelo-jev";
import { acentosDoVox } from "@/lib/media/acentos-do-vox";
import type { PedidoDaCena } from "@/lib/media/roteiro-em-texto";
import { contarUsoDoDesignDoProjeto } from "@/lib/biblioteca-de-design/registro";

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

/**
 * Quantas correções por LLM depois do revisor. ZERO por padrão desde 05/10 à
 * tarde (regra do Bruno: nenhuma decisão ou correção por LLM; o JEV decide e
 * confere antes do render). EDITOR_POR_COMANDO_RODADAS=1 religa para comparar.
 */
export function rodadasDeCorrecao(): number {
  return Math.max(0, Math.min(2, Number(process.env.EDITOR_POR_COMANDO_RODADAS ?? 0)));
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
    // OS PAPÉIS DA MARCA NAS PEÇAS (realce, tinta, carimbo, fio), pela hierarquia da paleta: para TODA linguagem
    // (05/10 à noite: antes só entravam quando a base era "vox", uma condição fixa por estilo; a peça decide como usa).
    vox: acentosDoVox(c.cores.tipo === "marca" ? paleta ?? [cores.acento, cores.escuro, cores.claro] : [c.cores.acento, c.cores.escuro, c.cores.claro]),
  };
}

/**
 * Os acentos da marca no Vox pela hierarquia da paleta moram em
 * lib/media/acentos-do-vox.ts (módulo puro, 05/10): a prévia do estilo na
 * tela faz a mesma conta que a montagem. Re-exportados daqui para quem já
 * importava deste módulo.
 */
export { acentosDoVox, type AcentosDoVox } from "@/lib/media/acentos-do-vox";

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
  /**
   * OS PEDIDOS DO CLIENTE CENA A CENA (05/10, tela de roteiro do completo):
   * "zoom aqui", "põe um mapa", "sem efeito nesta parte", já no tempo desta
   * fala. O diretor os trata como instrução obrigatória daquele trecho.
   */
  pedidos?: PedidoDaCena[];
  /** O nicho e o público do projeto (setup, linha editorial): o JEV e o redator leem (05/10, noite). */
  nicho?: string | null;
  /** O nome da marca do projeto. */
  marcaNome?: string | null;
  /** O vídeo vai para o YouTube (o completo sempre; o corte quando um destino é YouTube): a chamada de curtir e inscrever entra (05/10, noite). */
  youtube?: boolean;
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
    pedidos: e.pedidos,
  };
}

/** Quantas fotos das peças de papel ficaram sem url (a peça sai sem a foto, ou não sai). */
const semFoto = (plano: PlanoDoDiretor) => (plano.momentos ?? []).flatMap(fotosDoMomento).filter((f) => !f.url).length;

/**
 * As imagens que o plano pede, dentro do teto: as fotos das peças de papel e
 * as cenas, em paralelo. Devolve o plano LIMPO (05/10 à noite): a foto que
 * não foi gerada sai da peça (nunca a reserva do worker, que já representou
 * uma pessoa citada), e a peça que não existe sem foto sai inteira.
 */
async function imagensDoPlano(plano: PlanoDoDiretor, e: EntradaDoPlano, ja: Record<string, MidiaDaInsercao> = {}): Promise<{ plano: PlanoDoDiretor; insercoes: Record<string, MidiaDaInsercao>; custoUsd: number; erros: string[] }> {
  // As cenas que já existem (a correção que manteve a imagem) não são geradas de novo.
  const novas = (plano.insercoes ?? []).filter((x) => !ja[String(x.id)]);
  // O plano em dois eixos (05/10, noite) já cabe no teto de custo por minuto: as imagens dele saem todas.
  const livre = Boolean(plano.tema?.linguagem);
  const tetoCenas = livre ? novas.length : Math.min(novas.length, Math.max(0, Math.floor(e.imagens / 3)));
  const tetoFotos = livre ? Math.max(e.imagens, plano.estimativa?.imagens ?? 0) : Math.max(0, e.imagens - tetoCenas);
  const [fotos, cenas] = await Promise.all([
    prepararFotosDoVox(plano, { projectId: e.projectId, teto: tetoFotos, guarda: e.guardaDosRecortes }).catch((err) => ({ prontas: 0, custoUsd: 0, erros: [`fotos: ${String(err).slice(0, 120)}`] })),
    tetoCenas
      ? gerarInsercoes({ ...plano, momentos: [], insercoes: novas }, { formato: e.formato, projectId: e.projectId, teto: tetoCenas, local: e.local }).catch((err) => ({ insercoes: {}, custoUsd: 0, erros: [`cenas: ${String(err).slice(0, 120)}`] }))
      : Promise.resolve({ insercoes: {}, custoUsd: 0, erros: [] as string[] }),
  ]);
  const faltaram = semFoto(plano);
  const limpo = tirarFotosSemImagem(plano);
  return {
    plano: limpo.plano,
    insercoes: cenas.insercoes,
    custoUsd: +(fotos.custoUsd + cenas.custoUsd).toFixed(4),
    erros: [...fotos.erros, ...cenas.erros, ...(faltaram ? [`${faltaram} foto(s) sem imagem gerada saíram das peças${limpo.removidos.length ? `; ${limpo.removidos.length} peça(s) sem o que mostrar saíram (${limpo.removidos.join(", ")})` : ""}`] : [])],
  };
}

/** A entrada do plano pelo JEV (a mesma para escrever o plano e para completar o reaproveitado). */
function entradaPeloJev(e: EntradaDoPlano, base: string, cores: { acento: string; escuro: string; claro: string }): EntradaDoPlanoPeloJev {
  return {
    frases: frasesNumeradas(e.palavras),
    palavras: e.palavras,
    duracao: e.duracao,
    formato: e.formato,
    comando: e.comando,
    base,
    titulo: e.titulo,
    perfil: e.perfil,
    projectId: e.projectId,
    pedidos: e.pedidos,
    nicho: e.nicho,
    marca: e.marcaNome,
    paleta: e.comando.cores.tipo === "marca" ? e.paleta ?? null : [cores.acento, cores.escuro, cores.claro],
    cores,
    youtube: e.youtube,
  };
}

/**
 * O PLANO REAPROVEITADO DO ROTEIRO ganha a cobertura e a chamada de inscrever
 * (05/10 à noite): as regras novas valem para o plano que o cliente aprovou,
 * sem decidir de novo o que já estava decidido.
 */
async function reaproveitar(pronto: PlanoPronto, e: EntradaDoPlano, cores: { acento: string; escuro: string; claro: string }): Promise<{ plano: PlanoDoDiretor; base: string; avisos: string[]; tempos: Record<string, number> }> {
  if (diretorPorLlm()) return { plano: pronto.plano, base: pronto.base, avisos: ["plano do roteiro reaproveitado"], tempos: {} };
  const c = await completarPlanoPeloJev(pronto.plano, entradaPeloJev(e, pronto.base, cores)).catch((err) => ({ plano: pronto.plano, avisos: [`cobertura do plano reaproveitado falhou: ${err instanceof Error ? err.message.slice(0, 120) : err}`], tempos: {} }));
  return { plano: c.plano, base: pronto.base, avisos: ["plano do roteiro reaproveitado", ...c.avisos], tempos: c.tempos };
}

/** O plano já escrito (no roteiro) que a montagem reaproveita em vez de decidir de novo. */
export type PlanoPronto = { base: string; plano: PlanoDoDiretor };

/**
 * O PLANO DO VÍDEO INTEIRO: pelo JEV e pelo redator (o padrão desde 05/10 à
 * tarde: o JEV decide, o Sonnet só escreve os textos, uma chamada por bloco
 * em paralelo), ou pelo diretor Opus (EDITOR_POR_COMANDO_DIRETOR=opus), um
 * por bloco de ~5 min em paralelo. Sem imagem e sem resolução: é o que o
 * roteiro grava para o cliente aprovar e a montagem reaproveita.
 */
export async function escreverPlanoDoVideo(e: EntradaDoPlano, base: string): Promise<{ plano: PlanoDoDiretor; base?: string; avisos: string[]; tempos: Record<string, number>; erro?: string }> {
  const cores = coresDoComando(e.comando, e.marca);
  if (!diretorPorLlm()) {
    // Os dois eixos (05/10, noite): a linguagem e os elementos pelo JEV; a base volta da família escolhida.
    return escreverPlanoPeloJev(entradaPeloJev(e, base, cores));
  }
  const t = Date.now();
  const blocos = e.duracao > 95 ? blocosDoCompleto(e.palavras, e.duracao) : [];
  const base0 = entradaDoDiretor(e, cores, base);
  const partes = blocos.length > 1
    ? await Promise.all(blocos.map((b, k) => escreverPlano({ ...base0, imagens: Math.max(1, Math.round(e.imagens / blocos.length)), quadros: (e.quadros ?? []).filter((q) => q.t >= b.de - 1 && q.t <= b.ate + 1), bloco: { f0: b.f0, f1: b.f1, k, total: blocos.length } })))
    : [await escreverPlano(base0)];
  const plano = partes.length > 1 ? juntarPlanos(partes.map((p) => p.plano)) : partes[0].plano;
  const erros = partes.map((p, k) => (p.erro ? `bloco ${k + 1}: ${p.erro}` : "")).filter(Boolean);
  return { plano, avisos: [...erros, ...partes.flatMap((p) => p.avisos)], tempos: { diretor: +((Date.now() - t) / 1000).toFixed(1) }, erro: plano.momentos.length ? undefined : erros.join("; ") || "sem momentos" };
}

/** Só o plano do completo (o roteiro): a base pelo JEV e o plano, sem imagem nem resolução. */
export async function escreverPlanoDoCompletoPorComando(e: EntradaDoPlano): Promise<{ base: string; plano: PlanoDoDiretor; avisos: string[]; tempos: Record<string, number>; erro?: string }> {
  // No plano em dois eixos a família da linguagem dá a base; a classificação antiga só serve ao diretor Opus.
  const base0 = diretorPorLlm() ? await classificarComando(e.comando.texto, e.projectId) : "keynote";
  const p = await escreverPlanoDoVideo(e, base0);
  // A biblioteca de design (06/10): um vídeo inteiro planejado com o comando é um uso real do design atual do projeto.
  if (p.plano.momentos.length) void contarUsoDoDesignDoProjeto(e.projectId, "video", `${e.palavras.length}|${Math.round(e.duracao)}`);
  return { ...p, base: p.base ?? base0 };
}

/** Classificação + plano + imagens + resolução. Lança se não houve plano. */
export async function planejarPorComando(e: EntradaDoPlano, pronto?: PlanoPronto | null): Promise<PlanoPorComando> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const marcar = (n: string) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const cores = coresDoComando(e.comando, e.marca);
  // O plano do roteiro é reaproveitado (sem decidir nem pagar de novo), a não ser que haja pedido novo do cliente.
  const reusar = pronto && !e.pedidos?.length ? pronto : null;
  const base0 = reusar?.base ?? (diretorPorLlm() ? await classificarComando(e.comando.texto, e.projectId) : "keynote");
  const d: { plano: PlanoDoDiretor; base?: string; avisos: string[]; tempos: Record<string, number>; erro?: string } = reusar ? await reaproveitar(reusar, e, cores) : await escreverPlanoDoVideo(e, base0);
  const base = d.base ?? base0;
  Object.assign(tempos, d.tempos);
  marcar("diretor");
  if (!d.plano.momentos.length) throw new Error(`o diretor não devolveu plano (${d.erro ?? "sem momentos"})`);
  const img = await imagensDoPlano(d.plano, e);
  const plano = img.plano;
  marcar("imagens");
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base, tema: temaDoComando(e.comando, base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes: img.insercoes });
  marcar("resolver");
  return { base, plano, edicao: r.edicao, insercoes: img.insercoes, custoImagensUsd: img.custoUsd, avisos: [...d.avisos, ...img.erros, ...r.avisos].slice(0, 40), tempos };
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
  const plano = img.plano;
  tempos.imagens = +((Date.now() - t) / 1000).toFixed(1);
  const insercoes = { ...anterior.insercoes, ...img.insercoes };
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base: anterior.base, tema: temaDoComando(e.comando, anterior.base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes });
  return { base: anterior.base, plano, edicao: r.edicao, insercoes, custoImagensUsd: +(anterior.custoImagensUsd + img.custoUsd).toFixed(4), avisos: [...(c.erro ? [`correção: ${c.erro}`] : []), ...c.avisos, ...img.erros, ...r.avisos].slice(0, 40), tempos };
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
export async function planejarCompletoPorComando(e: EntradaDoPlano, pronto?: PlanoPronto | null): Promise<PlanoPorComando & { blocos: number; errosDosBlocos: string[] }> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const cores = coresDoComando(e.comando, e.marca);
  const blocos = blocosDoCompleto(e.palavras, e.duracao);
  // O plano do roteiro (já aprovado pelo cliente) é reaproveitado; com pedido novo cena a cena, o plano sai de novo com os pedidos.
  const reusar = pronto && !e.pedidos?.length ? pronto : null;
  const base0 = reusar?.base ?? (diretorPorLlm() ? await classificarComando(e.comando.texto, e.projectId) : "keynote");
  const d: { plano: PlanoDoDiretor; base?: string; avisos: string[]; tempos: Record<string, number>; erro?: string } = reusar ? await reaproveitar(reusar, e, cores) : await escreverPlanoDoVideo(e, base0);
  const base = d.base ?? base0;
  Object.assign(tempos, d.tempos);
  tempos.diretor = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  if (!d.plano.momentos.length) throw new Error(`nenhum plano para o completo (${d.erro ?? "sem momentos"})`);
  const img = await imagensDoPlano(d.plano, e);
  const plano = img.plano;
  tempos.imagens = +((Date.now() - t) / 1000).toFixed(1);
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base, tema: temaDoComando(e.comando, base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes: img.insercoes });
  const errosDosBlocos = d.avisos.filter((a) => /^bloco \d+:/.test(a));
  return { base, plano, edicao: r.edicao, insercoes: img.insercoes, custoImagensUsd: img.custoUsd, avisos: [...d.avisos, ...img.erros, ...r.avisos].slice(0, 40), tempos, blocos: blocos.length, errosDosBlocos };
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
  const sobra = Math.max(0, e.imagens - Math.round(anterior.custoImagensUsd / 0.065));
  const img = await imagensDoPlano(juntarPlanos(novos.map((x) => x.plano)), { ...e, imagens: sobra }, anterior.insercoes);
  const plano = img.plano;
  const insercoes = { ...anterior.insercoes, ...img.insercoes };
  const r = resolverPorComando(plano, { palavras: e.palavras, duracao: e.duracao, largura: e.formato === "9:16" ? 1080 : 1920, altura: e.formato === "9:16" ? 1920 : 1080, base: anterior.base, tema: temaDoComando(e.comando, anterior.base, cores, plano, e.paleta), rosto: e.rosto, comLegenda: e.comLegenda, logoUrl: e.logoUrl, insercoes });
  return { base: anterior.base, plano, edicao: r.edicao, insercoes, custoImagensUsd: +(anterior.custoImagensUsd + img.custoUsd).toFixed(4), avisos: [...novos.flatMap((x) => x.avisos), ...img.erros, ...r.avisos].slice(0, 40), tempos: { correcao: +((Date.now() - t) / 1000).toFixed(1) } };
}

export { revisarPorComando } from "@/lib/media/editor-por-comando/revisor";
export type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
export type { PlanoDoDiretor, NotaDoRevisor } from "@/lib/media/editor-por-comando/diretor";
