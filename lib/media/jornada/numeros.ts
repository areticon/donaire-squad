/**
 * OS NÚMEROS DITOS NA FALA (08/10/2026). A transcrição escreve número ora em
 * dígito ("2.645", "24h", "88%"), ora por extenso ("dois mil seiscentos e
 * quarenta e cinco"). Um número só vai para a tela se o VALOR EXATO foi dito:
 * no vídeo do Igor (07/10) o "2.645" passou porque a conferência aceitava
 * qualquer número por extenso na fala, e o desenho ainda o mostrou como "2,6".
 * Módulo puro.
 */

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800,
  novecentos: 900, novecentas: 900,
};
const MULTIPLICADORES: Record<string, number> = { mil: 1_000, milhao: 1_000_000, milhoes: 1_000_000, bilhao: 1_000_000_000, bilhoes: 1_000_000_000 };

const normal = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "2.645" -> 2645; "2,5" -> 2.5; "424.757,30" -> 424757.3; "1.5" (sem 3 dígitos depois do ponto) -> 1.5. */
export function valorDoNumero(texto: string): number | null {
  const m = /(\d[\d.,]*)/.exec(String(texto ?? ""));
  if (!m) return null;
  let d = m[1].replace(/[.,]$/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(d)) d = d.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(d)) d = d.replace(/,/g, "");
  else d = d.replace(",", ".");
  const v = Number(d);
  return Number.isFinite(v) ? v : null;
}

/** Os valores ditos por extenso, em sequência ("dois mil seiscentos e quarenta e cinco" -> 2645). */
export function numerosPorExtenso(fala: string): number[] {
  const palavras = normal(fala).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const saida: number[] = [];
  let total = 0;
  let grupo = 0;
  let aberto = false;
  const fechar = () => {
    if (aberto) saida.push(total + grupo);
    total = 0;
    grupo = 0;
    aberto = false;
  };
  for (let i = 0; i < palavras.length; i++) {
    const w = palavras[i];
    if (w in UNIDADES) {
      grupo += UNIDADES[w];
      aberto = true;
    } else if (w in MULTIPLICADORES) {
      total += (grupo || 1) * MULTIPLICADORES[w];
      grupo = 0;
      aberto = true;
    } else if (w === "e" && aberto && (palavras[i + 1] ?? "") in UNIDADES) {
      continue;
    } else if (/^\d/.test(w) && aberto && (MULTIPLICADORES[palavras[i + 1] ?? ""] ?? 0)) {
      grupo += Number(w);
    } else {
      fechar();
    }
  }
  fechar();
  return saida;
}

/** Todos os valores numéricos ditos (dígitos e por extenso). */
export function numerosDitos(fala: string): number[] {
  const digitos = [...String(fala ?? "").matchAll(/\d[\d.,]*/g)].map((m) => valorDoNumero(m[0])).filter((v): v is number => v !== null);
  return [...digitos, ...numerosPorExtenso(fala)];
}

/** O número escrito pelo redator foi DITO, com o mesmo valor? (tolerância só de arredondamento). */
export function numeroFoiDito(numero: string, fala: string): boolean {
  const v = valorDoNumero(numero);
  if (v === null) return false;
  return numerosDitos(fala).some((d) => Math.abs(d - v) < 1e-9 || (v >= 100 && Math.abs(d - v) / v < 0.001));
}

/** Para o desenho contar: as partes do número (prefixo, valor, sufixo) e o formato pt-BR do valor. */
export function partesDoNumero(numero: string): { antes: string; valor: number; casas: number; depois: string } | null {
  const m = /^(\D*)(\d[\d.,]*)(.*)$/.exec(String(numero ?? "").trim());
  if (!m) return null;
  const valor = valorDoNumero(m[2]);
  if (valor === null) return null;
  const casas = Number.isInteger(valor) ? 0 : Math.min(2, String(valor).split(".")[1]?.length ?? 0);
  return { antes: m[1], valor, casas, depois: m[3] };
}

/** A palavra da legenda com o número legível: "424757" vira "424.757" e "424757," vira "424.757," (ano de 4 dígitos fica como está). */
export function numeroNaLegenda(texto: string): string {
  return String(texto ?? "").replace(/^(\D*)(\d{4,})(\D*)$/, (todo, antes: string, d: string, depois: string) => {
    const v = Number(d);
    if (d.length === 4 && v >= 1900 && v <= 2100) return todo;
    return `${antes}${v.toLocaleString("pt-BR")}${depois}`;
  });
}
