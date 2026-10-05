import type { FonteId } from "@/lib/modelos-de-arte/fontes";
import type { ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import { contraste, hexDe6, medidaDaCor, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";

/**
 * A IDENTIDADE VISUAL APROVADA PELO CLIENTE (05/10/2026).
 *
 * A queixa do Bruno em 05/10: a esteira gerou as artes do carrossel (fundo
 * laranja #df931b, texto vinho sobre faixas creme, sem contraste nenhum)
 * ANTES de ele aprovar o estilo de arte, a letra e onde cada cor entra. Cada
 * arte dessas custa crédito de imagem, e saiu para o lixo.
 *
 * A regra, para qualquer cliente: ele escolhe o tipo de arte (os modelos do
 * book), a LETRA (uma das quatro famílias abaixo) e os PAPÉIS das cores da
 * paleta (qual é o fundo, qual é o título, qual é o destaque), vê a prévia na
 * hora com o texto dele, e só depois de "Aprovar e gerar" os agentes gastam
 * com arte. Sem aprovação, o card do dia fica em "aguardando a sua
 * identidade visual", sem gastar.
 *
 * Este arquivo é PURO (sem banco, sem fs): a galeria, que é componente de
 * cliente, importa daqui; o desenho e a geração também. O registro no banco
 * mora em lib/modelos-de-arte/identidade-aprovada.ts.
 */

export type LetraId = "impacto" | "moderna" | "classica" | "amigavel";

/** As três letras da composição por família (lib/media/arte-com-frase.tsx). */
export type FamiliaDaLetra = "condensada" | "serifada" | "sem-serifa";

export interface Letra {
  id: LetraId;
  nome: string;
  /** Como o cliente lê, em uma linha. */
  descricao: string;
  titulo: FonteId;
  texto: FonteId;
  caixaAlta: boolean;
  /** A família equivalente para a peça composta sem modelo do book. */
  familia: FamiliaDaLetra;
}

/** As quatro letras que o cliente escolhe. Todas já existem no book (lib/modelos-de-arte/fontes.ts). */
export const LETRAS: Record<LetraId, Letra> = {
  impacto: { id: "impacto", nome: "Impacto", descricao: "Condensada e em caixa alta: manchete, chamada forte.", titulo: "Anton-400", texto: "Inter-400", caixaAlta: true, familia: "condensada" },
  moderna: { id: "moderna", nome: "Moderna", descricao: "Geométrica e limpa: empresa, tecnologia, serviço.", titulo: "Montserrat-800", texto: "Montserrat-500", caixaAlta: false, familia: "sem-serifa" },
  classica: { id: "classica", nome: "Clássica", descricao: "Com serifa: editorial, fé, jurídico, elegância.", titulo: "PlayfairDisplay-700", texto: "Inter-400", caixaAlta: false, familia: "serifada" },
  amigavel: { id: "amigavel", nome: "Amigável", descricao: "Arredondada e leve: próxima, acolhedora, didática.", titulo: "Poppins-700", texto: "Poppins-400", caixaAlta: false, familia: "sem-serifa" },
};

export const LETRA_PADRAO: LetraId = "moderna";

export function letraValida(v: unknown): v is LetraId {
  return typeof v === "string" && v in LETRAS;
}

/**
 * Modelos cuja letra é o próprio desenho (caderno à mão, pincel, código):
 * trocar a letra deles seria trocar o modelo. Esses mantêm a tipografia.
 */
const FONTES_DE_CARATER: ReadonlySet<FonteId> = new Set<FonteId>(["Caveat-700", "PermanentMarker-400", "JetBrainsMono-500"]);

/** A tipografia de um modelo com a letra escolhida por cima (ou a dele, quando a letra é o caráter do modelo). */
export function tipografiaDaLetra(letra: LetraId | null | undefined, modelo: ModeloDeArte): { titulo: FonteId; texto: FonteId; caixaAlta: boolean } {
  const m = modelo.tipografia;
  if (!letra || !LETRAS[letra] || FONTES_DE_CARATER.has(m.titulo)) return { titulo: m.titulo, texto: m.texto, caixaAlta: Boolean(m.caixaAlta) };
  const l = LETRAS[letra];
  // O texto de apoio de um modelo de caráter (pincel) fica; só o título muda.
  return { titulo: l.titulo, texto: FONTES_DE_CARATER.has(m.texto) ? m.texto : l.texto, caixaAlta: l.caixaAlta };
}

// ── Os papéis das cores ──────────────────────────────────────────────────────

export interface PapeisEscolhidos {
  /** A cor do fundo da peça. */
  fundo: string;
  /** A cor do título (e do texto) sobre o fundo. */
  titulo: string;
  /** A cor do destaque: a palavra marcada, a faixa, o número, o botão. */
  destaque: string;
}

export type PapelDaCor = keyof PapeisEscolhidos;

export const ROTULO_DO_PAPEL: Record<PapelDaCor, string> = { fundo: "Fundo", titulo: "Título", destaque: "Destaque" };

/** Dois neutros que toda marca pode usar para o título, além da paleta. */
export const NEUTROS = ["#ffffff", "#141414"] as const;

/** Contraste mínimo WCAG para texto normal; o destaque, quando vira letra, segue o mesmo. */
export const CONTRASTE_MINIMO_DO_TEXTO = 4.5;
/** O destaque como elemento gráfico (faixa, bloco, sublinhado) precisa de 3:1. */
export const CONTRASTE_MINIMO_DO_DESTAQUE = 3;

/** A paleta como lista de hex válidos, sem repetição e em minúsculas. */
export function listaDaPaleta(paleta: string[] | string | null | undefined): string[] {
  const lista = (Array.isArray(paleta) ? paleta : String(paleta ?? "").split(","))
    .map((c) => hexDe6(String(c)))
    .filter((c): c is string => Boolean(c));
  return lista.filter((c, i) => lista.indexOf(c) === i);
}

/**
 * A paleta que o cliente pode distribuir nos papéis: a da configuração quando
 * ele escolheu uma; senão as três cores efetivas da identidade (manual, logo
 * ou setor), que é o que o book já mostra.
 */
export function paletaParaOsPapeis(colorPalette: string | null | undefined, coresEfetivas: { acento: string; escuro: string; claro: string }, paletaPadrao: string): string[] {
  const escolhida = (colorPalette ?? "").replace(/\s/g, "").toLowerCase() === paletaPadrao.replace(/\s/g, "").toLowerCase() ? [] : listaDaPaleta(colorPalette);
  return escolhida.length ? escolhida : listaDaPaleta([coresEfetivas.acento, coresEfetivas.escuro, coresEfetivas.claro]);
}

/** A cor, entre as opções, que mais contrasta com o fundo. */
export function sugerirCor(fundo: string, opcoes: string[], excluir: string[] = []): string | undefined {
  const f = hexDe6(fundo) ?? fundo;
  const candidatas = listaDaPaleta(opcoes).filter((c) => c !== f && !excluir.includes(c));
  return [...candidatas].sort((a, b) => contraste(b, f) - contraste(a, f))[0];
}

/**
 * Os papéis pela HIERARQUIA da paleta (lib/media/papeis-da-paleta.ts): o fundo
 * é o escuro da marca (ou o claro, se não há escuro), o título é a cor da
 * marca que lê sobre esse fundo (senão branco ou quase preto), e o destaque é
 * o destaque da hierarquia. É o padrão; o cliente troca o que quiser.
 */
export function papeisPadrao(paleta: string[] | string | null | undefined): PapeisEscolhidos {
  const lista = listaDaPaleta(paleta);
  const p = papeisDaPaleta(lista);
  if (!p) return { fundo: "#1e1f22", titulo: "#ffffff", destaque: "#f97316" };
  const fundo = p.escuro ?? p.claro ?? p.segunda ?? p.destaque;
  const opcoesDoTitulo = [...lista, ...NEUTROS].filter((c) => c !== fundo && c !== p.destaque);
  const daMarca = [p.claro, p.escuro, p.segunda, ...p.apoio].filter((c): c is string => Boolean(c) && c !== fundo && c !== p.destaque);
  const titulo = daMarca.find((c) => contraste(c, fundo) >= CONTRASTE_MINIMO_DO_TEXTO) ?? sugerirCor(fundo, opcoesDoTitulo) ?? (medidaDaCor(fundo).lum > 0.3 ? "#141414" : "#ffffff");
  const destaque = p.destaque === fundo ? (p.segunda ?? p.apoio[0] ?? titulo) : p.destaque;
  return { fundo, titulo, destaque };
}

export function papeisValidos(v: unknown): v is PapeisEscolhidos {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (["fundo", "titulo", "destaque"] as const).every((k) => typeof o[k] === "string" && Boolean(hexDe6(o[k] as string)));
}

/** Os papéis normalizados (hex de 6, minúsculas). Null quando algum falta. */
export function normalizarPapeis(v: unknown): PapeisEscolhidos | null {
  if (!papeisValidos(v)) return null;
  return { fundo: hexDe6(v.fundo)!, titulo: hexDe6(v.titulo)!, destaque: hexDe6(v.destaque)! };
}

export interface ChecagemDeContraste {
  papel: "titulo" | "destaque";
  razao: number;
  minimo: number;
  ok: boolean;
  /** A cor sugerida no lugar, quando falha. */
  sugestao?: string;
  mensagem: string;
}

/** O contraste do título e do destaque sobre o fundo, com a troca sugerida quando falha. */
export function checarContraste(papeis: PapeisEscolhidos, paleta: string[]): ChecagemDeContraste[] {
  const opcoes = [...paleta, ...NEUTROS];
  const r = (n: number) => Math.round(n * 10) / 10;
  const titulo = contraste(papeis.titulo, papeis.fundo);
  const destaque = contraste(papeis.destaque, papeis.fundo);
  const sugTitulo = titulo < CONTRASTE_MINIMO_DO_TEXTO ? sugerirCor(papeis.fundo, opcoes, [papeis.titulo]) : undefined;
  const sugDestaque = destaque < CONTRASTE_MINIMO_DO_DESTAQUE ? sugerirCor(papeis.fundo, paleta, [papeis.destaque, papeis.titulo]) ?? sugerirCor(papeis.fundo, opcoes, [papeis.destaque, papeis.titulo]) : undefined;
  return [
    {
      papel: "titulo",
      razao: r(titulo),
      minimo: CONTRASTE_MINIMO_DO_TEXTO,
      ok: titulo >= CONTRASTE_MINIMO_DO_TEXTO,
      sugestao: sugTitulo,
      mensagem:
        titulo >= CONTRASTE_MINIMO_DO_TEXTO
          ? `Título sobre o fundo: ${r(titulo)}:1, lê bem.`
          : `Título sobre o fundo: ${r(titulo)}:1, abaixo do mínimo de ${CONTRASTE_MINIMO_DO_TEXTO}:1 para texto.${sugTitulo ? ` Sugestão: título em ${sugTitulo}.` : ""}`,
    },
    {
      papel: "destaque",
      razao: r(destaque),
      minimo: CONTRASTE_MINIMO_DO_DESTAQUE,
      ok: destaque >= CONTRASTE_MINIMO_DO_DESTAQUE,
      sugestao: sugDestaque,
      mensagem:
        destaque >= CONTRASTE_MINIMO_DO_DESTAQUE
          ? `Destaque sobre o fundo: ${r(destaque)}:1, aparece.`
          : `Destaque sobre o fundo: ${r(destaque)}:1, some no fundo (mínimo ${CONTRASTE_MINIMO_DO_DESTAQUE}:1); a palavra marcada sai sublinhada.${sugDestaque ? ` Sugestão: destaque em ${sugDestaque}.` : ""}`,
    },
  ];
}

/** As cores do desenho a partir dos papéis: o acento é o destaque; escuro e claro saem do fundo e do título. */
export function coresDaIdentidade(papeis: PapeisEscolhidos): { acento: string; escuro: string; claro: string; papeis: PapeisEscolhidos } {
  const luz = (c: string) => medidaDaCor(c).l;
  const [escuro, claro] = luz(papeis.fundo) <= luz(papeis.titulo) ? [papeis.fundo, papeis.titulo] : [papeis.titulo, papeis.fundo];
  return { acento: papeis.destaque, escuro, claro, papeis };
}

// ── O registro e a aprovação ─────────────────────────────────────────────────

export interface IdentidadeVisualEscolhida {
  letra: LetraId;
  papeis: PapeisEscolhidos;
  /** Quando o cliente apertou "Aprovar e gerar". Sem isto, nada pago sai. */
  aprovadaEm?: string | null;
  /** Os modelos que estavam escolhidos na aprovação, para a tela mostrar. */
  modelos?: string[];
}

/**
 * A identidade está aprovada quando há aprovação gravada, ao menos um modelo
 * escolhido e os papéis ainda apontam para cores da paleta de agora (trocou
 * a paleta, a aprovação cai: a cor aprovada não existe mais).
 */
export function identidadeAprovada(registro: IdentidadeVisualEscolhida | null | undefined, modelosEscolhidos: string[] | null | undefined, paletaAtual?: string[]): boolean {
  if (!registro?.aprovadaEm || !letraValida(registro.letra) || !papeisValidos(registro.papeis)) return false;
  if (!modelosEscolhidos?.length) return false;
  if (paletaAtual?.length) {
    const opcoes = new Set([...listaDaPaleta(paletaAtual), ...NEUTROS]);
    const p = normalizarPapeis(registro.papeis)!;
    if (![p.fundo, p.titulo, p.destaque].every((c) => opcoes.has(c))) return false;
  }
  return true;
}

export const MENSAGEM_AGUARDANDO = "Aguardando a sua identidade visual";

/** O erro que a geração paga lança quando a identidade não foi aprovada. */
export class IdentidadeNaoAprovada extends Error {
  constructor(detalhe?: string) {
    super(`${MENSAGEM_AGUARDANDO}: escolha o modelo, a letra e as cores e aprove antes de gerar artes${detalhe ? ` (${detalhe})` : ""}. Nenhum crédito de imagem foi gasto.`);
    this.name = "IdentidadeNaoAprovada";
  }
}

export function ehIdentidadeNaoAprovada(e: unknown): boolean {
  return e instanceof IdentidadeNaoAprovada || (e instanceof Error && e.name === "IdentidadeNaoAprovada");
}
