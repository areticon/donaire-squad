/**
 * AS LÂMINAS DE UM CARROSSEL REFEITO PELA VERA (05/10/2026).
 *
 * Puro de propósito (sem banco, sem modelo): a regra que não pode quebrar fica
 * aqui, onde a prova roda sem gastar uma imagem. A regra: carrossel refeito
 * continua carrossel, com o MESMO número de lâminas, na mesma ordem. Já houve
 * o caso de um carrossel de 3 lâminas virar uma imagem só (um tríptico) e
 * essa imagem tomar o lugar das três; aqui isso não tem como acontecer.
 */

/** As lâminas gravadas no post ou no card ("url1|url2|url3"). */
export function laminasDaUrl(url: string | null | undefined): string[] {
  return (url ?? "")
    .split("|")
    .map((u) => u.trim())
    .filter((u) => u.length > 10);
}

/**
 * Desenha de novo cada lâmina com a frase dela. A lâmina que não sai fica como
 * estava (a arte antiga no mesmo lugar), e o resultado tem SEMPRE o mesmo
 * tamanho do carrossel de antes. Sem frase para cada lâmina, não desenha nada:
 * melhor deixar o carrossel como está do que inventar lâmina.
 */
export async function redesenharLaminas(
  frases: string[],
  atuais: string[],
  desenhar: (frase: string, indice: number) => Promise<string>
): Promise<{ urls: string[]; feitas: number }> {
  if (atuais.length < 2) throw new Error("não é carrossel (menos de duas lâminas)");
  if (frases.length < atuais.length) throw new Error(`as frases das lâminas não estão gravadas (${frases.length} de ${atuais.length})`);
  const urls = [...atuais];
  let feitas = 0;
  await Promise.all(
    atuais.map(async (_antiga, i) => {
      try {
        const nova = (await desenhar(frases[i], i))?.trim();
        // Uma URL só: se vier algo com "|", não é uma lâmina, e a antiga fica.
        if (nova && nova.length > 10 && !nova.includes("|")) {
          urls[i] = nova;
          feitas++;
        }
      } catch (e) {
        console.warn(`[vera][laminas] lâmina ${i + 1}: ${e instanceof Error ? e.message : e}`);
      }
    })
  );
  if (urls.length !== atuais.length) throw new Error("o número de lâminas mudou");
  return { urls, feitas };
}
