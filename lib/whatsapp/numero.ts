/**
 * O NÚMERO DE WHATSAPP NO FORMATO DA META (01/10): só dígitos, com o código do
 * país, sem "+" (5511987654321). Módulo puro: a tela do admin e o servidor
 * normalizam do mesmo jeito.
 *
 * O lead digita do jeito dele na calculadora e na demonstração, e o banco
 * guarda a máscara da tela ("(11) 98765-4321", sem o 55). Aqui vira o formato
 * internacional que a API exige. Número estrangeiro só passa se vier com "+":
 * sem o sinal, 10 ou 11 dígitos são sempre lidos como Brasil (DDD + número).
 */

/** Devolve "55DDNNNNNNNNN" (ou o internacional com "+"), ou null quando não dá para confiar no número. */
export function numeroDoWhatsapp(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const bruto = texto.trim();
  const internacional = bruto.startsWith("+");
  let d = bruto.replace(/\D/g, "");
  if (!d) return null;

  if (internacional && !d.startsWith("55")) {
    // Fora do Brasil: a Meta aceita de 8 a 15 dígitos com o código do país.
    return d.length >= 8 && d.length <= 15 ? d : null;
  }
  // Prefixo de discagem nacional ("0", ou "0" + operadora de dois dígitos).
  if (!d.startsWith("55") && d.startsWith("0")) {
    d = d.replace(/^0+/, "");
    if (d.length === 12 || d.length === 13) d = d.slice(2);
  }
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  // DDD válido (11 a 99, sem zero) mais 8 dígitos (fixo ou celular antigo) ou
  // 9 dígitos de celular, que começa com 9.
  if (/^[1-9][1-9]9\d{8}$/.test(d) || /^[1-9][1-9][2-9]\d{7}$/.test(d)) return `55${d}`;
  return null;
}

/** "+55 11 98765-4321", para mostrar na tela e nos e-mails. */
export function numeroNaTela(numero: string | null | undefined): string {
  if (!numero) return "";
  const d = numero.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    return `+55 ${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
  }
  return `+${d}`;
}
