/**
 * EMPRESAS QUE USAM CONTEÚDO PARA VENDER MAIS (02/10, pedido do Matheus).
 *
 * São REFERÊNCIAS DE MERCADO, não clientes da Demandou, e a tela diz isso.
 *
 * NÚMERO SÓ ENTRA MEDIDO. Cada ritmo abaixo foi lido no perfil público do
 * Instagram pela Apify (apify~instagram-scraper, os 20 posts mais recentes do
 * feed, sem os fixados) em 02/10/2026, por scripts/tmp/ritmo-referencias-0210.mts.
 * A conta: posts dos últimos 14 dias divididos por 14; quando o perfil passou
 * de 20 posts nesse período, a janela é a dos 20 coletados. Custo da medida:
 * US$ 0,33.
 *
 * COM LOGO desde 02/10, noite: decisão do Bruno, informado do risco de marca.
 * Nunca foto de pessoa (o cartão do João Adibe leva o logo da Cimed). Os
 * arquivos são os oficiais, sem redesenho, em public/referencias/*-0210.svg:
 *   - McDonald's: Wikimedia Commons, "McDonald's Golden Arches.svg";
 *   - Apple: Wikimedia Commons, "Apple logo black.svg";
 *   - Cimed: Wikimedia Commons, "Logotipo da Cimed.svg" (crédito do arquivo:
 *     cimedremedios.com.br);
 *   - Loovi: o site oficial, loovi.com.br (Logo-Branca.svg do próprio site).
 * Na tela todos viram branco por CSS, para o fundo escuro ficar uniforme.
 *
 * Ficaram de fora: Pablo Marçal (20 posts em 4 horas, na véspera da eleição de
 * 04/10; a janela é curta e atípica demais para virar "média") e Grupo Marçal
 * (o perfil achado, @grupomarcalgm, é de outra empresa, de serviços prediais).
 */
export type ReferenciaDeMercado = {
  nome: string;
  /** O perfil medido, para quem quiser conferir. */
  perfil: string;
  /** O ritmo exato medido, em posts por dia. */
  porDia: number;
  /** Como a frase diz o ritmo: por dia quando passa de um, senão por semana. */
  unidade: "dia" | "semana";
  /** O que sustentou a conta, para a nota de rodapé e para conferência. */
  base: string;
  /** O logo oficial da empresa (nunca foto de pessoa). */
  logo: string;
  /**
   * A altura do logo em pixels: os logos têm proporções muito diferentes (o
   * "M" é quase quadrado, a Loovi é uma palavra larga), e a mesma altura deixava
   * uns enormes e outros sumidos. Ajustado no olho para o mesmo peso visual.
   */
  logoAltura: number;
};

export const MEDIDO_EM = "02/10/2026";

export const REFERENCIAS_DE_MERCADO: ReferenciaDeMercado[] = [
  { nome: "McDonald's Brasil", perfil: "@mcdonalds_br", porDia: 1.37, unidade: "semana", base: "19 posts em 14 dias", logo: "/referencias/mcdonalds-0210.svg", logoAltura: 30 },
  { nome: "João Adibe, CEO da Cimed", perfil: "@joaoadibemarques", porDia: 5.08, unidade: "dia", base: "20 posts em 3,9 dias", logo: "/referencias/cimed-0210.svg", logoAltura: 18 },
  { nome: "Loovi Seguros", perfil: "@loovi", porDia: 0.79, unidade: "semana", base: "11 posts em 14 dias", logo: "/referencias/loovi-0210.svg", logoAltura: 17 },
  { nome: "Cimed", perfil: "@cimedco", porDia: 1.21, unidade: "semana", base: "17 posts em 14 dias", logo: "/referencias/cimed-0210.svg", logoAltura: 18 },
  { nome: "Apple", perfil: "@apple", porDia: 0.57, unidade: "semana", base: "8 posts em 14 dias", logo: "/referencias/apple-0210.svg", logoAltura: 30 },
];

/** "publica em média 10 conteúdos por semana", arredondado para inteiro. */
export function ritmoEmTexto(r: ReferenciaDeMercado): string {
  const n = Math.round(r.unidade === "dia" ? r.porDia : r.porDia * 7);
  return `${n} ${n === 1 ? "conteúdo" : "conteúdos"} por ${r.unidade}`;
}
