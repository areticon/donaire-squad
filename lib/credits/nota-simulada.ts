/**
 * Os créditos que uma linha de ACESSO INTERNO teria cobrado, lidos da nota
 * ("Acesso interno: custaria 440 créditos"). Puro, sem banco: a tela do
 * extrato também usa (03/10). As cortesias ("Sem cobrança (...)") ficam de fora.
 */
const NOTA = /Acesso interno: custaria (\d+) cr[eé]ditos/;

/** Os créditos que a linha teria cobrado, ou 0 quando a nota não é de acesso interno. */
export function creditosDaNota(nota: string | null | undefined): number {
  const m = nota?.match(NOTA);
  return m ? Number(m[1]) : 0;
}
