/**
 * OS PAPÉIS DA PALETA DA MARCA (05/10/2026): qual cor é o destaque, qual é o
 * escuro e qual é o claro, RESPEITANDO A ORDEM que o cliente gravou.
 *
 * O Bruno, na prova do Vox de Fé & Gestão (#1f2f3a, #98092b, #df931b,
 * #e0daa3, #9fb982): "a minha marca é azul escuro e vermelho". A prova saiu
 * com o dourado no marca-texto e o vinho só no carimbo; o azul-marinho nem
 * apareceu. O erro foi escolher a cor "que combina mais com o estilo" (a mais
 * viva da lista) em vez da hierarquia que o cliente deu.
 *
 * A regra, para qualquer cliente:
 * - As DUAS PRIMEIRAS cores são as principais. Uma delas é o destaque e a
 *   outra entra como escuro (texto, título, carimbo, borda) ou claro.
 * - O destaque é a primeira cor que é COR de verdade. Cor de tinta (escura e
 *   pouco saturada, como um azul-marinho ou um preto) ou de papel (quase
 *   branca) não é destaque: assume o papel dela, e o destaque passa para a
 *   segunda. Assim "#1f2f3a, #98092b" dá destaque vinho e escuro marinho, e
 *   "#F97316, #1e1f22, #dbdee1" (a ordem padrão) continua igual.
 * - O escuro e o claro saem primeiro das principais (a outra principal é o
 *   escuro quando segura letra sobre branco); só sem elas vêm do resto
 *   da lista (a mais escura, a mais clara). As outras cores ficam de apoio.
 *
 * Sem dependência de nada: a capa, a identidade visual e o editor por
 * comando usam a mesma conta.
 */

export type PapeisDaPaleta = {
  destaque: string;
  /** A outra cor principal (a segunda da hierarquia), quando há. */
  segunda?: string;
  escuro?: string;
  claro?: string;
  /** As cores que sobram, na ordem do cliente: só apoio. */
  apoio: string[];
};

export function hexDe6(c: string): string | null {
  const f = c.trim().replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(f)) return `#${f.split("").map((x) => x + x).join("")}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(f)) return `#${f}`.toLowerCase();
  if (/^[0-9a-f]{8}$/i.test(f)) return `#${f.slice(0, 6)}`.toLowerCase();
  return null;
}

/** Luz (HSL), saturação (HSL) e luminância relativa (WCAG). */
export function medidaDaCor(hex: string): { l: number; s: number; lum: number } {
  const h = hexDe6(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return { l, s, lum: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) };
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: string, b: string): number {
  const x = medidaDaCor(a).lum;
  const y = medidaDaCor(b).lum;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Cor de tinta: escura e pouco saturada (marinho, grafite, preto), ou quase preta. */
export function corDeTinta(c: string): boolean {
  const m = medidaDaCor(c);
  return m.l < 0.3 && (m.s < 0.45 || m.l < 0.12);
}

/** Cor de papel: quase branca, ou clara e quase sem cor. */
export function corDePapel(c: string): boolean {
  const m = medidaDaCor(c);
  return m.l > 0.9 || (m.l > 0.78 && m.s < 0.3);
}

/** Os papéis da paleta, na hierarquia do cliente. Null sem cor válida. */
export function papeisDaPaleta(paleta: string[] | string | null | undefined): PapeisDaPaleta | null {
  const lista = (Array.isArray(paleta) ? paleta : String(paleta ?? "").split(","))
    .map((c) => hexDe6(String(c)))
    .filter((c): c is string => Boolean(c));
  const cores = lista.filter((c, i) => lista.indexOf(c) === i);
  if (!cores.length) return null;
  const principais = cores.slice(0, 2);
  const ehCor = (c: string) => !corDeTinta(c) && !corDePapel(c);
  const destaque = principais.find(ehCor) ?? cores.find(ehCor) ?? cores[0];
  const segunda = principais.find((c) => c !== destaque);
  const resto = cores.filter((c) => c !== destaque);
  const luz = (c: string) => medidaDaCor(c).l;
  // A outra principal é o escuro quando é tinta ou quando segura letra sobre
  // branco (4,5:1, luminância até 0,18): um azul royal de marca é o escuro dela,
  // e não o preto que o cliente deixou no fim da lista.
  const escuro =
    principais.find((c) => c !== destaque && (corDeTinta(c) || medidaDaCor(c).lum <= 0.18)) ??
    [...resto].filter((c) => luz(c) < 0.3).sort((a, b) => luz(a) - luz(b))[0];
  const claro =
    principais.find((c) => c !== destaque && c !== escuro && corDePapel(c)) ??
    [...resto].filter((c) => c !== escuro && luz(c) > 0.7).sort((a, b) => luz(b) - luz(a))[0];
  const apoio = cores.filter((c) => c !== destaque && c !== segunda && c !== escuro && c !== claro);
  return { destaque, ...(segunda ? { segunda } : {}), ...(escuro ? { escuro } : {}), ...(claro ? { claro } : {}), apoio };
}
