import type { Caixa } from "@/lib/media/enquadramento";

/**
 * Quanto brilha o fundo ATRÁS da pessoa, na gravação original.
 *
 * ## Para que serve
 *
 * O recorte da pessoa deixa um halo claro em volta da silhueta, e a sacada do
 * Bruno em 24/08 explica por quê: a borda da máscara é semitransparente por
 * construção, então cada pixel da borda mistura a pessoa com o que estava atrás
 * dela na gravação. Se atrás dela havia uma parede branca, a borda fica branca,
 * e ela só APARECE porque o fundo gerado é escuro.
 *
 * Medido na gravação dele: a parede tem brilho **241 de 255** e o fundo gerado
 * tinha 49. Casando os dois, o halo perde o contraste que o faz aparecer.
 *
 * Para casar é preciso medir, e este módulo é a medida.
 *
 * ## Por que uma grade grosseira, e não a imagem
 *
 * Quem tem os pixels é o worker; quem gera o fundo é o app, porque a conta de
 * IA do projeto vive num lugar só. Mandar os quadros já é feito (o agente de
 * visão precisa deles), mas o app não tem como decodificar JPEG: não há
 * biblioteca de imagem nas dependências, e acrescentar uma por causa de um
 * número seria caro.
 *
 * Então o worker manda também uma grade de luminância, que é o mesmo quadro
 * reduzido a 128x72 em tons de cinza. São 9 KB por trecho e nenhuma dependência
 * nova dos dois lados.
 *
 * **Conferido antes de confiar**, no quadro real da gravação: o anel medido no
 * pixel cheio dá 241 e na grade de 128x72 dá 237. Quatro pontos de erro em 255,
 * ou seja 1,6%, para uma medida que alimenta um prompt e uma correção de
 * exposição. Serve.
 *
 * ## Por que o ANEL da caixa, e não a caixa inteira
 *
 * A caixa que o agente devolve é a janela da webcam, e a pessoa ocupa cerca de
 * 60% dela. Medir a caixa inteira mistura a pessoa com a parede: no quadro real
 * a caixa inteira dá 198 e o anel dá 241, e é o 241 que a borda da máscara
 * mistura.
 *
 * A faixa de baixo fica de fora porque ali costuma estar a mesa, o teclado ou o
 * peito da pessoa, e nada disso é o fundo.
 */

/** O quadro reduzido a tons de cinza, como o worker manda. */
export type GradeDeLuz = {
  largura: number;
  altura: number;
  /** `largura * altura` bytes de luminância, em base64. */
  luz: string;
};

/** Quanto de cada lado da caixa é considerado anel. */
const ANEL = 0.12;
/** Quanto da base da caixa é descartado (mesa, teclado, peito). */
const BASE_DESCARTADA = 0.15;

/**
 * O brilho do anel em volta da pessoa, de 0 a 255.
 *
 * Devolve `null` quando a caixa é pequena demais para ter anel, ou quando a
 * grade não bate com o tamanho declarado. Quem chama trata isso como "não
 * medido" e cai no padrão, em vez de usar um número inventado.
 */
export function brilhoAoRedorDaPessoa(
  grade: GradeDeLuz,
  caixa: Caixa
): number | null {
  const { largura: L, altura: A } = grade;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(grade.luz, "base64");
  } catch {
    return null;
  }
  if (!L || !A || bytes.length < L * A) return null;

  const x0 = Math.max(0, Math.round(caixa.x * L));
  const y0 = Math.max(0, Math.round(caixa.y * A));
  const x1 = Math.min(L, Math.round((caixa.x + caixa.w) * L));
  const y1 = Math.min(A, Math.round((caixa.y + caixa.h) * A));
  const larguraDaCaixa = x1 - x0;
  const alturaDaCaixa = y1 - y0;
  // Menos que isto e o anel some no arredondamento.
  if (larguraDaCaixa < 6 || alturaDaCaixa < 6) return null;

  const mx = Math.max(1, Math.round(larguraDaCaixa * ANEL));
  const my = Math.max(1, Math.round(alturaDaCaixa * ANEL));
  const ate = y1 - Math.round(alturaDaCaixa * BASE_DESCARTADA);

  const amostras: number[] = [];
  for (let y = y0; y < ate; y++) {
    const linha = y * L;
    const noTopo = y < y0 + my;
    for (let x = x0; x < x1; x++) {
      const naLateral = x < x0 + mx || x >= x1 - mx;
      if (noTopo || naLateral) amostras.push(bytes[linha + x]);
    }
  }
  if (amostras.length < 20) return null;

  // Mediana e nao media: um reflexo de janela ou uma lampada dentro do anel
  // puxariam a media para cima e o fundo gerado sairia claro demais.
  amostras.sort((a, b) => a - b);
  return amostras[Math.floor(amostras.length / 2)];
}

/**
 * O brilho do fundo do VÍDEO, juntando o que foi medido em cada trecho.
 *
 * Um número só para a gravação inteira, e não um por corte, porque o fundo
 * gerado também é um só: gerar sete custaria sete vezes o preço, e fundos
 * diferentes em cortes do mesmo vídeo fazem a série parecer de canais
 * diferentes.
 *
 * Mediana de novo, e pela mesma razão: um trecho em que a pessoa aparece grande
 * dentro da caixa mediria a pessoa, e não a parede.
 */
export function brilhoDoVideo(
  medidas: (number | null)[]
): number | null {
  const validas = medidas.filter((m): m is number => m !== null).sort((a, b) => a - b);
  if (!validas.length) return null;
  return validas[Math.floor(validas.length / 2)];
}
