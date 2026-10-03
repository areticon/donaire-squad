/**
 * PROMESSA QUE NÃO VAI PARA A TELA (02/10/2026).
 *
 * Por que existe: a Gaberlini Consórcios começa a usar a plataforma com 10
 * vendedores, e consórcio é regulado pelo Banco Central (Lei 11.795/2008).
 * Ninguém pode prometer contemplação garantida, data de contemplação ou
 * rendimento; o mesmo vale para quem vende crédito, investimento ou seguro.
 * O prompt do diretor já recebe a guarda do setor (perfil-do-projeto.ts), mas
 * regra da casa: o que dá para garantir em código não fica na mão do modelo.
 * Todo texto que a edição desenha na tela (palavra, destaque, faixa de valor,
 * comentário, selo, frase de destaque da legenda) passa por aqui antes.
 *
 * Vale para todo projeto, não só consórcio: "lucro garantido" na tela é
 * problema em qualquer setor. A lista é de PROMESSA, não de assunto: falar de
 * contemplação, lance e crédito é o trabalho do vendedor e continua livre.
 *
 * Módulo puro.
 */

/** Sem acento e em minúsculas, para a comparação não depender de grafia. */
function plano(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Cada promessa, com o motivo que vai para o log e para o diretor. */
const PROMESSAS: Array<{ re: RegExp; motivo: string }> = [
  { re: /contempla(cao|do|da)s? (e )?(garantid|certa|certo|assegurad)|garant\w* (de |da |sua )?contempla|contempla\w* (100|cem) ?%|contempla\w* na (primeira|1a) (assembleia|parcela)/, motivo: "promete contemplação garantida" },
  { re: /contempla\w* (em|no|na|ate|dentro de) (\d+|um|uma|dois|duas|tres|poucos?|pouco) ?(dia|semana|mes|meses|ano|anos|assembleia)/, motivo: "promete data ou prazo de contemplação" },
  { re: /(rendimento|retorno|lucro|renda|ganho|juros?)s? (garantid|cert|assegurad|fixo garantid)|garant\w* (de )?(rendimento|retorno|lucro|renda)/, motivo: "promete rendimento ou retorno" },
  { re: /(rende|renda de|rendimento de|retorno de|lucro de) (\d+([.,]\d+)? ?%|\d+ (por cento|mil))/, motivo: "promete rendimento em número" },
  { re: /sem (nenhum )?risco|risco zero|dinheiro facil|fique rico|ficar rico|enriquec\w* (rapido|facil|garantid)|investimento garantido/, motivo: "promete ganho sem risco ou enriquecimento" },
  { re: /(credito|carta) (aprovad|liberad)\w* (na hora|garantid|sem consulta|para todos)|aprovacao garantida/, motivo: "promete crédito aprovado ou liberado" },
];

/**
 * O motivo, quando o texto promete o que a regulação proíbe; null quando
 * pode ir para a tela.
 */
export function promessaProibida(texto: string | null | undefined): string | null {
  const t = plano(texto ?? "");
  if (!t) return null;
  for (const p of PROMESSAS) if (p.re.test(t)) return p.motivo;
  return null;
}

/** A guarda do setor em uma linha, para os prompts (diretor, revisor, conferência). */
export const GUARDA_DE_PROMESSA_FINANCEIRA =
  "Nunca escreva na tela (palavra, destaque, faixa, comentário, selo) promessa de contemplação garantida, data ou prazo de contemplação, rendimento, retorno, lucro, crédito aprovado ou ganho sem risco. Se a fala prometer isso, o texto na tela não repete: escolha outra frase.";
