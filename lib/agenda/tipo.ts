/**
 * OS TIPOS DE REUNIÃO DA AGENDA (05/10): a demonstração (o lead, antes de
 * comprar) e o onboarding (o cliente novo, depois de o contrato ser ativado).
 *
 * Módulo puro, sem banco, para a tela (componentes de cliente), os e-mails e
 * a engine falarem o mesmo nome. A engine é uma só; o que muda entre os dois
 * tipos é o texto, quem atende e para onde os links voltam.
 */

export const TIPOS_DE_REUNIAO = ["demonstracao", "onboarding"] as const;
export type TipoDeReuniao = (typeof TIPOS_DE_REUNIAO)[number];

export function tipoDeReuniao(v: unknown): TipoDeReuniao {
  return v === "onboarding" ? "onboarding" : "demonstracao";
}

/** Como a reunião é chamada no meio da frase: "sua demonstração", "sua conversa de onboarding". */
export function nomeDaReuniao(tipo: TipoDeReuniao | string | null | undefined): string {
  return tipoDeReuniao(tipo) === "onboarding" ? "conversa de onboarding" : "demonstração";
}

/** O mesmo nome, curto e com inicial maiúscula, para títulos: "Onboarding marcado." */
export function nomeCurtoDaReuniao(tipo: TipoDeReuniao | string | null | undefined): string {
  return tipoDeReuniao(tipo) === "onboarding" ? "Onboarding" : "Demonstração";
}

/** O título do evento na agenda (convite e Google). */
export function tituloDoEvento(tipo: TipoDeReuniao | string | null | undefined): string {
  return tipoDeReuniao(tipo) === "onboarding" ? "Onboarding da Demandou" : "Demonstração da Demandou";
}

/** O que a reunião é, em uma frase, para a confirmação. */
export function descricaoDaReuniao(tipo: TipoDeReuniao | string | null | undefined): string {
  return tipoDeReuniao(tipo) === "onboarding"
    ? "São 30 minutos por vídeo. Alinhamos o seu posicionamento e o plano das primeiras semanas na plataforma, para o primeiro conteúdo sair com a sua cara."
    : "São 30 minutos por vídeo. Mostramos a plataforma produzindo o conteúdo de uma empresa de verdade e montamos com você o plano que faz sentido para a sua.";
}
