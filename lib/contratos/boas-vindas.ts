/**
 * O E-MAIL DE BOAS-VINDAS COM O LINK DE ESCOLHER A SENHA (04/10/2026).
 *
 * O link de senha é do better-auth: quem o gera é `requestPasswordReset`, e
 * quem o manda é o `sendResetPassword` de lib/auth. Para o cliente do contrato
 * receber UM e-mail (boas-vindas com o link dentro), e não dois, a ativação
 * deixa aqui o recado "o próximo link de senha deste e-mail é de boas-vindas",
 * pede o link, e o `sendResetPassword` troca o texto. O recado vale só durante
 * a chamada (é tirado na leitura e apagado no fim), dentro do mesmo processo.
 *
 * Módulo puro, sem banco, para lib/auth poder importar sem peso.
 */

export type BoasVindasPendente = {
  numero: number;
  plano: string;
  fim: Date | null;
};

const PENDENTES: Map<string, BoasVindasPendente> = ((globalThis as { __boasVindasDoContrato?: Map<string, BoasVindasPendente> }).__boasVindasDoContrato ??=
  new Map());

export function marcarBoasVindas(email: string, dados: BoasVindasPendente): void {
  PENDENTES.set(email.trim().toLowerCase(), dados);
}

/** Tira o recado (uma vez só): o próximo link de senha volta a ser o comum. */
export function tirarBoasVindas(email: string): BoasVindasPendente | null {
  const chave = email.trim().toLowerCase();
  const d = PENDENTES.get(chave) ?? null;
  PENDENTES.delete(chave);
  return d;
}
