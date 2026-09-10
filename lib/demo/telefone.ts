/**
 * O telefone que a demonstração pública recebe, normalizado para E.164.
 *
 * Mora no SERVIDOR e é chamado pela rota, nunca só pela tela. Máscara de
 * campo é conveniência para quem digita, não validação: quem manda o corpo
 * direto na rota não passa por máscara nenhuma, e o formato guardado precisa
 * ser um só. Se cada lugar convertesse na leitura, cada lugar erraria de um
 * jeito diferente, e o erro apareceria no dia de disparar a mensagem.
 *
 * E.164 sem o sinal de mais, que é como a API do WhatsApp pede o destinatário:
 * 5511987654321.
 *
 * O Brasil tem duas formas válidas e uma armadilha:
 *  - 11 dígitos com DDD, celular com o nono dígito: 11987654321
 *  - 10 dígitos com DDD, fixo ou celular antigo: 1132654321
 *  - a armadilha é o 55: "5511987654321" já vem com país, e prefixar de novo
 *    produz "555511987654321", que passa em qualquer checagem de tamanho e
 *    falha na hora de mandar a mensagem.
 */

/** DDDs que existem no Brasil. Os que faltam nunca foram alocados. */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type TelefoneNormalizado =
  | { ok: true; e164: string }
  | { ok: false; erro: string };

/**
 * Devolve o telefone em E.164 ou a frase que a pessoa lê na tela.
 *
 * A frase é humana e diz o que fazer, e não "formato inválido": quem está
 * preenchendo não sabe o que o código considera válido, sabe o que digitou.
 */
export function normalizarTelefone(entrada: string): TelefoneNormalizado {
  const digitos = (entrada ?? "").replace(/\D+/g, "");

  if (!digitos) {
    return { ok: false, erro: "Confere o telefone, ele parece vazio." };
  }

  // Já veio com o código do país. Tirar o 55 aqui e conferir o resto pelas
  // mesmas regras evita o "555511..." descrito acima.
  const semPais = digitos.startsWith("55") && digitos.length >= 12
    ? digitos.slice(2)
    : digitos;

  if (semPais.length !== 10 && semPais.length !== 11) {
    return {
      ok: false,
      erro: "Confere o telefone: preciso do DDD e do número, como (11) 98765 4321.",
    };
  }

  const ddd = Number(semPais.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) {
    return { ok: false, erro: `O DDD ${semPais.slice(0, 2)} não existe. Confere o começo do número.` };
  }

  const numero = semPais.slice(2);

  // Celular de 9 dígitos SEMPRE começa com 9. Sem esta checagem, um fixo de 8
  // dígitos digitado com um zero na frente viraria um celular que não existe.
  if (numero.length === 9 && !numero.startsWith("9")) {
    return { ok: false, erro: "Confere o telefone: celular com nove dígitos começa com 9." };
  }

  // Fixo não começa com 0 nem com 1: essas faixas são serviço.
  if (numero.length === 8 && /^[01]/.test(numero)) {
    return { ok: false, erro: "Confere o telefone, esse número não parece de linha comum." };
  }

  return { ok: true, e164: `55${semPais}` };
}

/**
 * O telefone de volta em forma de gente, para relatório e para a tela.
 * 5511987654321 vira (11) 98765 4321.
 */
export function telefoneLegivel(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D+/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`;
  return e164;
}
