import { contraste, hexDe6, medidaDaCor, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import {
  NEUTROS,
  listaDaPaleta,
  normalizarPapeis,
  papeisNaPaleta,
  papeisPadrao,
  sugerirCor,
  type PapeisEscolhidos,
} from "@/lib/modelos-de-arte/identidade";

/**
 * O SELETOR DE CORES DA MARCA, A PARTE PURA (08/10/2026).
 *
 * A queixa do Bruno em 08/10: "o seletor de cores da marca ficou ruim, é
 * difícil de operar". O mapa daquele dia achou cinco causas: o seletor nativo
 * fechava no primeiro arraste (a key do React levava o valor da cor), o papel
 * de cada cor dependia de uma ORDEM que a tela não mostrava, não dava para
 * tirar nem reordenar sem editar a string à mão, o assistente gravava o
 * laranja da Demandou na etapa 0 (e aí o logo do cliente nunca virava cor), e
 * a rota gravava a string crua, que cada leitor filtrava de um jeito.
 *
 * Aqui mora a conta que a tela e a rota fazem igual, sem banco e sem React:
 *
 * - VAGAS POR PAPEL: Principal (o destaque), Fundo, Texto e até três de apoio.
 *   A pessoa diz o papel; a ordem da string é consequência.
 * - A ORDEM QUE OS LEITORES ESPERAM: [principal, escura, clara, ...apoio].
 *   É a ordem do padrão de sempre ("#F97316,#1e1f22,#dbdee1") e a de três
 *   leitores: a hierarquia (lib/media/papeis-da-paleta.ts, as duas primeiras
 *   são as principais), a posição (lib/media/direcao-de-arte.ts lê
 *   [acento, "dark tone", "light neutral"]) e a cor principal das capas
 *   (lib/media/capas-do-completo.ts, a primeira). Por isso Fundo e Texto
 *   entram ordenados pela luz, e não pela vaga: fundo claro com texto escuro
 *   continua "escura, clara" na string.
 * - OS PAPÉIS DO BOOK (fundo, título, destaque) saem das mesmas vagas, para o
 *   nome que a tela mostra ser o que a arte do post usa.
 * - HEX NORMALIZADO: aceita com ou sem #, 3 ou 6 dígitos, e grava "#rrggbb"
 *   minúsculo, sem repetida.
 */

/**
 * As cores de fábrica (o laranja, o carvão e o cinza da própria Demandou), a
 * mesma string de PALETA_PADRAO_DA_PLATAFORMA em lib/media/identidade-visual.ts,
 * repetida aqui porque aquele módulo usa sharp e banco e a tela não pode
 * importá-lo. Serve só para a tela dizer "estas são as de fábrica".
 */
export const PALETA_DE_FABRICA = ["#f97316", "#1e1f22", "#dbdee1"] as const;

export function ehPaletaDeFabrica(paleta: string[] | string | null | undefined): boolean {
  return listaDaPaleta(paleta).join(",") === PALETA_DE_FABRICA.join(",");
}

/** Principal, fundo e texto, mais até três de apoio. */
export const MAXIMO_DE_APOIO = 3;
export const MAXIMO_DE_CORES = 3 + MAXIMO_DE_APOIO;

export type PapelDaVaga = "principal" | "fundo" | "texto" | "apoio";

/** As vagas da tela: cada papel com a sua cor (ou vazia, ainda por escolher). */
export interface VagasDeCor {
  principal: string | null;
  fundo: string | null;
  texto: string | null;
  apoio: string[];
}

/** O nome e a dica de cada papel, como a pessoa lê. */
export const PAPEL_DA_VAGA: Record<PapelDaVaga, { nome: string; dica: string }> = {
  principal: { nome: "Principal (destaque)", dica: "A palavra marcada, a faixa, o botão e a palavra acesa da legenda do vídeo." },
  fundo: { nome: "Fundo", dica: "O fundo das artes do post e o tom escuro ou claro das cenas." },
  texto: { nome: "Texto", dica: "O título e o texto por cima do fundo. Precisa ler bem sobre ele." },
  apoio: { nome: "Apoio", dica: "Detalhes e variações. Entra pouco, e nunca no lugar das principais." },
};

/** "#abc", "abc", " #AABBCC " viram "#aabbcc"; o resto vira null. */
export function normalizarHex(texto: string | null | undefined): string | null {
  const t = String(texto ?? "").trim();
  if (!t || (t.match(/#/g)?.length ?? 0) > 1) return null;
  // Oito dígitos (com transparência) não: a tela pede seis, e a cor sem a
  // transparência seria outra coisa sem a pessoa saber.
  if (/^#?[0-9a-f]{8}$/i.test(t)) return null;
  return hexDe6(t);
}

/**
 * A paleta como chega (string livre ou lista) em cores normalizadas, sem
 * repetida e até o máximo, e as que não são cor. Separador: vírgula, ponto e
 * vírgula ou espaço (quem cola de um manual cola de todo jeito).
 */
export function normalizarPaleta(entrada: string | string[] | null | undefined): { cores: string[]; invalidas: string[] } {
  const pedacos = (Array.isArray(entrada) ? entrada.map(String) : String(entrada ?? "").split(/[,;\s]+/)).map((c) => c.trim()).filter(Boolean);
  const cores: string[] = [];
  const invalidas: string[] = [];
  for (const p of pedacos) {
    const c = normalizarHex(p);
    if (!c) invalidas.push(p);
    else if (!cores.includes(c)) cores.push(c);
  }
  return { cores: cores.slice(0, MAXIMO_DE_CORES), invalidas };
}

const luz = (c: string) => medidaDaCor(c).l;

/**
 * A string que vai para projects.colorPalette: [principal, escura, clara,
 * ...apoio]. Fundo e texto entram pela luz (a mais escura primeiro), porque é
 * assim que a posição e a hierarquia leem a segunda e a terceira cor.
 */
export function paletaDasVagas(v: VagasDeCor): string[] {
  const principal = normalizarHex(v.principal);
  const fundo = normalizarHex(v.fundo);
  const texto = normalizarHex(v.texto);
  const meio = fundo && texto ? (luz(fundo) <= luz(texto) ? [fundo, texto] : [texto, fundo]) : [fundo ?? texto].filter((c): c is string => Boolean(c));
  const apoio = v.apoio.map((c) => normalizarHex(c)).filter((c): c is string => Boolean(c));
  return listaDaPaleta([principal, ...meio, ...apoio].filter((c): c is string => Boolean(c))).slice(0, MAXIMO_DE_CORES);
}

/** Os papéis do book a partir das vagas. Null enquanto falta principal, fundo ou texto. */
export function papeisDasVagas(v: VagasDeCor): PapeisEscolhidos | null {
  return normalizarPapeis({ destaque: v.principal, fundo: v.fundo, titulo: v.texto });
}

/**
 * As vagas de uma paleta salva. Com papéis do book gravados, eles mandam: a
 * tela mostra como Fundo e Texto exatamente o que a arte do post usa (inclusive
 * branco ou quase preto, que o book deixa usar no título). Sem papéis, a
 * hierarquia: o destaque dela é a Principal, e o fundo e o título padrão do
 * book (que saem da mesma hierarquia) são Fundo e Texto, só com cores da
 * paleta. O que sobra fica de apoio, na ordem do cliente.
 */
export function vagasDaPaleta(paleta: string[] | string | null | undefined, papeis?: PapeisEscolhidos | null): VagasDeCor {
  const lista = listaDaPaleta(paleta);
  const gravados = normalizarPapeis(papeis);
  let principal: string | null = null;
  let fundo: string | null = null;
  let texto: string | null = null;
  if (gravados) {
    principal = gravados.destaque;
    fundo = gravados.fundo;
    texto = gravados.titulo;
  } else if (lista.length) {
    const h = papeisDaPaleta(lista);
    const padrao = papeisPadrao(lista);
    principal = h?.destaque ?? lista[0];
    const livre = (c: string | undefined | null, ...fora: Array<string | null>): string | null => (c && lista.includes(c) && c !== principal && !fora.includes(c) ? c : null);
    fundo = livre(padrao.fundo) ?? livre(h?.escuro) ?? livre(h?.claro);
    texto = livre(padrao.titulo, fundo) ?? livre(h?.claro, fundo) ?? livre(h?.escuro, fundo);
  }
  const usadas = [principal, fundo, texto];
  const apoio = lista.filter((c) => !usadas.includes(c)).slice(0, MAXIMO_DE_APOIO);
  return { principal, fundo, texto, apoio };
}

/** As mesmas cores nos mesmos papéis? */
export function mesmosPapeis(a: PapeisEscolhidos | null | undefined, b: PapeisEscolhidos | null | undefined): boolean {
  const x = normalizarPapeis(a);
  const y = normalizarPapeis(b);
  if (!x || !y) return !x && !y;
  return x.fundo === y.fundo && x.titulo === y.titulo && x.destaque === y.destaque;
}

/**
 * Os papéis que o book vai ter depois de gravar estas vagas: os das vagas,
 * quando as três estão preenchidas; senão os de hoje encaixados na paleta nova
 * (o que alinharIdentidadeAPaleta faz no servidor).
 */
export function papeisDepoisDeGravar(vagas: VagasDeCor, papeisDeHoje: PapeisEscolhidos | null | undefined): PapeisEscolhidos | null {
  const das = papeisDasVagas(vagas);
  if (das) return das;
  const hoje = normalizarPapeis(papeisDeHoje);
  return hoje ? papeisNaPaleta(hoje, paletaDasVagas(vagas)).papeis : null;
}

/**
 * Gravar estas vagas derruba a identidade aprovada? Só quando estava aprovada
 * e algum dos três papéis muda de cor: trocar ou somar cor de apoio não pede
 * aprovação de novo (a mesma regra de identidade.ts, 06/10).
 */
export function trocaDerrubaAprovacao(identidade: { aprovada: boolean; papeis: PapeisEscolhidos | null } | null | undefined, vagas: VagasDeCor): boolean {
  if (!identidade?.aprovada) return false;
  return !mesmosPapeis(papeisDepoisDeGravar(vagas, identidade.papeis), identidade.papeis);
}

/**
 * O destaque que o VÍDEO vai usar com esta paleta (a hierarquia). Difere da
 * Principal quando ela é escura ou clara demais para destaque (um marinho, um
 * creme): aí a tela avisa, em vez de a legenda sair numa cor que a pessoa não
 * esperava.
 */
export function destaqueNoVideo(vagas: VagasDeCor): string | null {
  return papeisDaPaleta(paletaDasVagas(vagas))?.destaque ?? null;
}

/**
 * Põe a cor numa vaga. Se ela já está em outra vaga, as duas TROCAM (a
 * sugestão de contraste aponta uma cor que já é da marca, e duplicá-la
 * deixaria a outra vaga com a mesma cor).
 */
export function porCorNaVaga(v: VagasDeCor, onde: Exclude<PapelDaVaga, "apoio"> | { apoio: number }, cor: string): VagasDeCor {
  const nova = normalizarHex(cor);
  if (!nova) return v;
  const prox: VagasDeCor = { ...v, apoio: [...v.apoio] };
  const atual = typeof onde === "string" ? prox[onde] : (prox.apoio[onde.apoio] ?? null);
  const papeis = ["principal", "fundo", "texto"] as const;
  const outraPapel = papeis.find((p) => p !== onde && normalizarHex(prox[p]) === nova);
  const outraApoio = prox.apoio.findIndex((c, i) => (typeof onde === "string" || i !== onde.apoio) && normalizarHex(c) === nova);
  // Vaga vazia não tem o que dar em troca: tirar a cor de um papel para pôr
  // num apoio novo deixaria o papel vazio.
  if (outraPapel && !atual) return v;
  if (outraPapel) prox[outraPapel] = atual;
  else if (outraApoio >= 0) {
    if (atual) prox.apoio[outraApoio] = atual;
    else prox.apoio.splice(outraApoio, 1);
  }
  if (typeof onde === "string") prox[onde] = nova;
  else prox.apoio[onde.apoio] = nova;
  return prox;
}

/** As cores da prévia: o fundo, o título, a palavra marcada e a letra do botão. */
export function previaDasVagas(v: VagasDeCor): { fundo: string; titulo: string; destaque: string; letraDoBotao: string; destaqueSublinhado: boolean } {
  const destaque = normalizarHex(v.principal) ?? "#f97316";
  const fundo = normalizarHex(v.fundo) ?? (medidaDaCor(destaque).lum > 0.4 ? "#141414" : "#ffffff");
  const titulo = normalizarHex(v.texto) ?? sugerirCor(fundo, [...NEUTROS]) ?? "#ffffff";
  const letraDoBotao = sugerirCor(destaque, [titulo, fundo, ...NEUTROS]) ?? "#ffffff";
  // O destaque que some no fundo vira sublinhado, como o desenho do book faz
  // quando o contraste não chega a 3:1 (lib/modelos-de-arte/desenho.tsx).
  return { fundo, titulo, destaque, letraDoBotao, destaqueSublinhado: contraste(destaque, fundo) < 3 };
}

/** O que a rota GET /api/projects/[id]/cores devolve para a tela. */
export interface OrigemDaSugestao {
  origem: "logo" | "manual" | "capas";
  titulo: string;
  cores: string[];
  porque?: string;
}

export interface CoresDaTela {
  /** A paleta salva, normalizada. Vazia quando a pessoa ainda não escolheu. */
  paleta: string[];
  escolhida: boolean;
  /** A salva é exatamente a de fábrica da Demandou (laranja, carvão, cinza). */
  deFabrica: boolean;
  /** O que a arte usa enquanto não há escolha: as cores e de onde vieram. */
  efetivas: { cores: string[]; origem: string; rotulo: string };
  vagas: VagasDeCor;
  identidade: { aprovada: boolean; papeis: PapeisEscolhidos | null; aguardando: number };
  sugestoes: OrigemDaSugestao[];
  podeMudar: boolean;
}

/** A chave do que está gravado: muda quando a paleta ou os papéis mudam. */
export function chaveDasVagas(v: VagasDeCor): string {
  return JSON.stringify({ p: paletaDasVagas(v), r: papeisDasVagas(v) });
}
