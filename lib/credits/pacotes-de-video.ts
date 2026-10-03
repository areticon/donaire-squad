/**
 * OS PACOTES DE CRÉDITO DE VÍDEO, vendidos à parte do plano.
 *
 * A razão de existirem está na conta de 18/09: no plano Essencial de R$ 397,
 * quatro vídeos cheios por campanha custam R$ 431 por mês de IA, ou 108,6% do
 * preço do plano. Vídeo dentro do plano é margem negativa por construção, e foi
 * exatamente a ausência dessa conta que tirou o Veo do produto em agosto.
 *
 * PREÇO, E DE ONDE ELE SAI. Um clipe de 8 segundos com narração custa R$ 6,48
 * no Veo 3.1 rápido e R$ 17,28 no cheio. O crédito de vídeo segue a mesma
 * régua do crédito do plano (R$ 0,10 para o cliente), então:
 *
 *   195 créditos = 1 clipe rápido de 8s .... R$ 19,50 .. 3,0x o custo
 *   520 créditos = 1 clipe cheio de 8s ..... R$ 52,00 .. 3,0x o custo
 *
 * Os pacotes dão desconto por volume, e o desconto sai da margem de propósito:
 * o pacote maior é o que faz o cliente experimentar vídeo, e experimentar é o
 * que decide se ele fica.
 *
 * NÃO EXISTE PRICE NO STRIPE PARA ELES, e é decisão. O checkout monta o preço
 * na hora (`price_data`), então mudar a tabela é mudar este arquivo e subir,
 * sem ninguém precisar criar produto no painel e sem o risco de a tela e o
 * Stripe discordarem sobre quanto custa, que foi o que aconteceu com o cupom
 * `50LANCAMENTO` em agosto: a landing prometia e o Stripe não tinha.
 */

export interface PacoteDeVideo {
  id: string;
  nome: string;
  creditos: number;
  /** Em centavos de real, que é o que o Stripe cobra. */
  centavos: number;
  /** A frase que a tela mostra, na língua do cliente e não em créditos. */
  equivale: string;
}

export const PACOTES_DE_VIDEO: PacoteDeVideo[] = [
  {
    id: "video-experimentar",
    nome: "Experimentar",
    creditos: 400,
    centavos: 3900,
    equivale: "2 clipes de 8 segundos com narração",
  },
  {
    id: "video-mes",
    nome: "Um mês de vídeo",
    creditos: 1000,
    centavos: 8900,
    equivale: "5 clipes de 8 segundos, um por semana e sobra",
  },
  {
    id: "video-campanha",
    nome: "Campanha",
    creditos: 2200,
    centavos: 17900,
    equivale: "11 clipes rápidos, ou 4 clipes na qualidade cheia",
  },
];

export function pacoteDeVideo(id: string): PacoteDeVideo | undefined {
  return PACOTES_DE_VIDEO.find((p) => p.id === id);
}

/** O preço por crédito de cada pacote, para a tela mostrar o desconto real. */
export function reaisPorCredito(p: PacoteDeVideo): number {
  return p.centavos / 100 / p.creditos;
}
