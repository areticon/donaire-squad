/**
 * OS PACOTES DE CRÉDITO AVULSOS (06/10/2026): o crédito do plano comprado à
 * parte, para quem já assina e quer produzir mais no mês.
 *
 * Não confundir com os pacotes de VÍDEO POR IA (lib/credits/pacotes-de-video.ts),
 * que enchem a outra carteira. Estes enchem o saldo de produção, o mesmo que a
 * gravação, os cortes, a campanha e o gêmeo gastam.
 *
 * DE ONDE SAEM AS QUANTIDADES. O crédito vale, nos planos de hoje (preço anual
 * dividido pelos créditos de 12 ciclos; ver lib/media/limits.ts):
 *
 *   Starter     R$ 35.964 / 240.000 = R$ 0,150 por crédito (6,67 por real)
 *   Pro         R$ 47.964 / 480.000 = R$ 0,100 por crédito (10,0 por real)
 *   Enterprise  R$ 68.004 / 720.000 = R$ 0,094 por crédito (10,6 por real)
 *
 * A RÉGUA é o Starter: é o plano de entrada e o de crédito mais caro, então um
 * pacote que respeita o Starter respeita todos. A regra (proposta do Bruno em
 * 06/10):
 *
 *   - o MENOR paga um pouco mais por crédito que a assinatura, para o pacote não
 *     virar o jeito barato de não assinar: R$ 97 por 600 = R$ 0,162 (8% acima);
 *   - o MÉDIO fica perto da assinatura: R$ 197 por 1.350 = R$ 0,146 (3% abaixo);
 *   - o MAIOR compensa claramente: R$ 597 por 5.200 = R$ 0,115 (23% abaixo, ou
 *     30% a mais de crédito por real que o Starter).
 *
 * Nenhum pacote chega ao crédito do Pro (R$ 0,100): quem precisa de volume todo
 * mês continua tendo no plano de cima o melhor negócio, e o pacote não come a
 * venda do plano. A margem também fica: o teto de custo de IA é R$ 0,027 por
 * crédito (lib/media/limits.ts), então o pior pacote para nós (o de R$ 597)
 * guarda 76% de margem bruta.
 *
 * O GANHO NA TELA é contado contra o menor pacote ("41% a mais de crédito"),
 * que é a comparação que a pessoa faz olhando os três lado a lado. O que o
 * pacote rende sai de lib/credits/o-que-rende.ts, a mesma conta da tela de
 * envio (gravação de 30 minutos com a semana sugerida e corte vertical a mais).
 *
 * O PREÇO NO STRIPE é um price por pacote, achado pela `lookupKey` (ou pela
 * variável de ambiente, que tem prioridade). Quem cria os prices é
 * scripts/stripe/criar-pacotes-de-credito.mts; o app nunca cria produto.
 *
 * Sem banco e sem SDK: componente de cliente importa daqui.
 */
import { rendimento } from "@/lib/credits/o-que-rende";

/** Créditos por ciclo do Starter (PLANS.pro.credits). Um teste confere que batem. */
export const CREDITOS_DO_STARTER_POR_CICLO = 20_000;
/** O Starter em reais por mês (lib/planos.ts, mensal). Um teste confere. */
export const REAIS_DO_STARTER_POR_MES = 2997;

export type PacoteDeCredito = {
  id: "creditos-97" | "creditos-197" | "creditos-597";
  nome: string;
  reais: number;
  creditos: number;
  /** A chave do price no Stripe (lookup_key). */
  lookupKey: string;
  /** Variável de ambiente que, preenchida, manda no price em vez da lookupKey. */
  variavel: string;
};

export const PACOTES_DE_CREDITO: readonly PacoteDeCredito[] = [
  { id: "creditos-97", nome: "Para completar o mês", reais: 97, creditos: 600, lookupKey: "demandou_creditos_97", variavel: "STRIPE_PACOTE_97_PRICE_ID" },
  { id: "creditos-197", nome: "Uma semana a mais", reais: 197, creditos: 1350, lookupKey: "demandou_creditos_197", variavel: "STRIPE_PACOTE_197_PRICE_ID" },
  { id: "creditos-597", nome: "O mês turbinado", reais: 597, creditos: 5200, lookupKey: "demandou_creditos_597", variavel: "STRIPE_PACOTE_597_PRICE_ID" },
];

export function pacoteDeCredito(id: string): PacoteDeCredito | undefined {
  return PACOTES_DE_CREDITO.find((p) => p.id === id);
}

export const creditosPorReal = (p: { creditos: number; reais: number }) => p.creditos / p.reais;

/** Créditos por real que a assinatura do Starter dá. */
export const CREDITOS_POR_REAL_DO_STARTER = CREDITOS_DO_STARTER_POR_CICLO / REAIS_DO_STARTER_POR_MES;

export type PacoteNaTela = PacoteDeCredito & {
  /** "41% a mais de crédito" contra o menor pacote; null no próprio menor. */
  ganho: string | null;
  ganhoPorcento: number;
  /** Contra o Starter, em %: negativo é pagar mais caro por crédito. Para a documentação e os testes. */
  contraOPlanoPorcento: number;
  /** "1 gravação de 30 minutos com a semana inteira e mais 2 cortes verticais". */
  rende: string;
};

export function pacotesNaTela(): PacoteNaTela[] {
  const menor = PACOTES_DE_CREDITO[0];
  return PACOTES_DE_CREDITO.map((p) => {
    const ganhoPorcento = Math.round((creditosPorReal(p) / creditosPorReal(menor) - 1) * 100);
    return {
      ...p,
      ganhoPorcento,
      ganho: ganhoPorcento > 0 ? `${ganhoPorcento}% a mais de crédito por real que o pacote de R$ ${menor.reais}` : null,
      contraOPlanoPorcento: Math.round((creditosPorReal(p) / CREDITOS_POR_REAL_DO_STARTER - 1) * 100),
      rende: rendimento(p.creditos).frase,
    };
  });
}

/*
 * QUEM PODE COMPRAR (06/10): só assinatura ATIVA. A regra é pura, para a tela,
 * a rota e os testes dizerem a mesma coisa; quem junta os dados é
 * lib/credits/pacotes-de-credito-servidor.ts.
 */
export type MotivoSemCompra = "membro" | "interno" | "teste" | "pendente" | "sem_plano";

export type Elegibilidade = { pode: true; motivo: null; frase: null } | { pode: false; motivo: MotivoSemCompra; frase: string };

export function decidirElegibilidade(d: {
  membroDe: string | null;
  admin: boolean;
  plano: string | null;
  /** Status da assinatura viva no Stripe, ou null quando não há. */
  statusDaAssinatura: string | null;
  /** O teste ainda corre (trialEndsAt no futuro). */
  emTeste: boolean;
  /** Contrato anual pago e vigente, sem assinatura no Stripe (Pix, boleto). */
  contratoPago: boolean;
}): Elegibilidade {
  if (d.membroDe) {
    return { pode: false, motivo: "membro", frase: `Quem compra créditos é quem administra a conta da equipe. Peça a ${d.membroDe} para comprar mais.` };
  }
  if (d.admin) {
    return { pode: false, motivo: "interno", frase: "Conta interna da Demandou: crédito a mais se concede pelo painel de admin, na ficha da conta." };
  }
  if (d.emTeste || d.statusDaAssinatura === "trialing") {
    return { pode: false, motivo: "teste", frase: "Durante o teste grátis, os pacotes ficam fechados. Eles abrem quando a assinatura começar a ser cobrada." };
  }
  if (d.statusDaAssinatura === "past_due" || d.statusDaAssinatura === "unpaid" || d.statusDaAssinatura === "incomplete") {
    return { pode: false, motivo: "pendente", frase: "Há uma cobrança da assinatura pendente. Acerte o pagamento em Plano e cobrança e os pacotes abrem." };
  }
  const temPlano = Boolean(d.plano && d.plano !== "free");
  if (temPlano && (d.statusDaAssinatura === "active" || (!d.statusDaAssinatura && d.contratoPago))) {
    return { pode: true, motivo: null, frase: null };
  }
  return { pode: false, motivo: "sem_plano", frase: "Os pacotes são para quem tem assinatura ativa. Escolha um plano para começar." };
}
