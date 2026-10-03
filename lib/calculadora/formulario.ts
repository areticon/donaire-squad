/**
 * O FORMULÁRIO QUE LIBERA A CALCULADORA (01/10): as listas e a validação do
 * WhatsApp, num módulo puro para a tela e a rota usarem as mesmas regras.
 *
 * Tudo em lista fechada, menos e-mail e WhatsApp: o time de vendas segmenta
 * por esses campos, e texto livre ("dono", "sócio-diretor", "CEO") vira três
 * segmentos para a mesma pessoa.
 */

/** As mesmas faixas do pedido de demonstração (app/api/demonstracao). */
export const FAIXAS_FATURAMENTO = [
  ["ate_50k", "Até R$ 50 mil por mês"],
  ["50k_100k", "De R$ 50 mil a R$ 100 mil"],
  ["100k_500k", "De R$ 100 mil a R$ 500 mil"],
  ["500k_1m", "De R$ 500 mil a R$ 1 milhão"],
  ["acima_1m", "Acima de R$ 1 milhão"],
] as const;

export const TAMANHOS_TIME = [
  ["so_eu", "Só eu"],
  ["2_10", "De 2 a 10 pessoas"],
  ["11_50", "De 11 a 50 pessoas"],
  ["51_200", "De 51 a 200 pessoas"],
  ["acima_200", "Mais de 200 pessoas"],
] as const;

export const SETORES = [
  "Consultoria e serviços profissionais",
  "Saúde e clínicas",
  "Educação e cursos",
  "Tecnologia e software",
  "Indústria",
  "Varejo e comércio eletrônico",
  "Imobiliário e construção",
  "Jurídico, contábil e financeiro",
  "Igreja e terceiro setor",
  "Agronegócio",
  "Outro",
] as const;

export const CARGOS = [
  "Dono, sócio ou CEO",
  "Diretor",
  "Gerente de marketing",
  "Analista ou coordenador de marketing",
  "Comercial e vendas",
  "Outro",
] as const;

export const AVISO_LGPD =
  "Usamos estes dados só para mostrar o resultado e para o nosso time comercial falar com você sobre a Demandou, por e-mail ou WhatsApp. Não vendemos nem repassamos a ninguém. Você pode pedir a exclusão a qualquer momento em contato@demandou.com.";

/** Só os dígitos, sem o 55 do país. */
export function digitosDoWhatsApp(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, 11);
}

/** "(11) 98765-4321" enquanto a pessoa digita. */
export function mascaraWhatsApp(v: string): string {
  const d = digitosDoWhatsApp(v);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Celular brasileiro: DDD válido (11 a 99, sem zero) e nove dígitos começando
 * por 9. Fixo não serve, porque o contato é pelo WhatsApp.
 */
export function whatsAppValido(v: string): boolean {
  const d = digitosDoWhatsApp(v);
  return /^[1-9][1-9]9\d{8}$/.test(d);
}

export function emailValido(v: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && t.length <= 200;
}
