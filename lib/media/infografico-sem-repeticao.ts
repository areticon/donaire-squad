import type { ConteudoDoInfografico } from "@/lib/media/infographic";

/**
 * O MESMO NÚMERO NÃO APARECE DUAS VEZES NO INFOGRÁFICO (06/10/2026).
 *
 * O caso: no infográfico do Demandou de 06/10, "9,3 horas" estava no bloco
 * grande do destaque, de novo no cartão 1 ("9,3 horas por dia") e de novo no
 * rodapé ("9,3 horas"). A guarda antiga só tirava do rodapé o valor IDÊNTICO
 * ao do destaque, e "9,3 horas/dia" contra "9,3 horas" passava.
 *
 * Duas camadas:
 *   1. a extração pede um conjunto sem repetição, e o JEV veta o conjunto
 *      repetido (lib/squad/coerencia-da-arte.ts, `infograficoRepeteDado`);
 *   2. esta guarda, pura, que vale sempre (com o JEV fora inclusive): o número
 *      fica onde aparece primeiro (destaque, depois cartões, depois rodapé) e
 *      sai dos outros lugares. O cartão perde só o número; o texto fica.
 */

/** A chave de um número: o primeiro valor numérico, com "%" quando é porcentagem. "9,3 horas/dia" e "9,3h" dão "9.3". */
export function chaveDoNumero(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim();
  const m = t.match(/\d+(?:[.,]\d+)*/);
  if (!m) return null;
  // "1.500" (milhar) e "1,5" (decimal) não se confundem: o milhar perde o ponto, o decimal vira ponto.
  const bruto = m[0];
  const normal = /^\d{1,3}(\.\d{3})+$/.test(bruto) ? bruto.replace(/\./g, "") : bruto.replace(",", ".");
  const porcento = t.slice((m.index ?? 0) + bruto.length).trimStart().startsWith("%");
  return `${normal}${porcento ? "%" : ""}`;
}

export interface Repeticoes {
  conteudo: ConteudoDoInfografico;
  /** O que saiu, para o log ("cartão 1: 9,3 horas por dia"). */
  removidos: string[];
}

export function semNumerosRepetidos(c: ConteudoDoInfografico): Repeticoes {
  const vistos = new Set<string>();
  const removidos: string[] = [];
  const marcar = (v: string | null | undefined) => {
    const k = chaveDoNumero(v);
    if (k) vistos.add(k);
  };
  const jaVisto = (v: string | null | undefined) => {
    const k = chaveDoNumero(v);
    return Boolean(k && vistos.has(k));
  };
  const temDestaque = Boolean(c.highlight?.value && c.highlight?.label);
  if (temDestaque) marcar(c.highlight!.value);
  const sections = (c.sections ?? []).map((s, i) => {
    if (!s.stat) return s;
    if (jaVisto(s.stat)) {
      removidos.push(`cartão ${i + 1}: ${s.stat}`);
      const semStat = { ...s };
      delete semStat.stat;
      return semStat;
    }
    marcar(s.stat);
    return s;
  });
  const keyNumbers = (c.keyNumbers ?? []).filter((n, i) => {
    if (!n.value) return false;
    if (jaVisto(n.value)) {
      removidos.push(`rodapé ${i + 1}: ${n.value}`);
      return false;
    }
    marcar(n.value);
    return true;
  });
  return { conteudo: { ...c, sections, keyNumbers }, removidos };
}

/** Há número repetido no conjunto? (o teste e o log usam) */
export function temNumeroRepetido(c: ConteudoDoInfografico): boolean {
  return semNumerosRepetidos(c).removidos.length > 0;
}
