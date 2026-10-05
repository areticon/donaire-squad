import { ACESSO_EXTRA } from "@/lib/equipe/regras";
import { PLANOS_PUBLICOS } from "@/lib/planos";

/**
 * O PREÇO DO CONTRATO: TABELA, DESCONTO E VALOR FINAL (04/10/2026).
 *
 * Pergunta do dono: "como funciona o valor? o time de vendas dá desconto;
 * nesses casos o contrato é alterado como?". Resposta: o valor não é mais
 * digitado. Ele NASCE do plano (o preço anual de tabela de lib/planos.ts) mais
 * os acessos extras pelo preço de tabela (lib/equipe/regras.ts), e o vendedor
 * aplica um DESCONTO, em porcentagem ou em reais, com o motivo e quem
 * concedeu. O contrato e a Proposta Comercial mostram os três números.
 *
 * Módulo PURO, sem banco: o formulário do gestor (componente de cliente) e o
 * servidor fazem a MESMA conta. Quando cada lado tinha a sua cópia, as cópias
 * divergiram (a lição da tabela de planos de 02/09).
 */

/**
 * OS TETOS DO DESCONTO, em porcentagem do preço de tabela. Para trocar, troque
 * aqui: o formulário, o servidor e o texto dos avisos leem estas constantes.
 *
 * - até TETO_SEM_APROVACAO, o próprio vendedor (qualquer admin) concede;
 * - acima dele e até TETO_COM_APROVACAO, o contrato só vai para assinatura
 *   depois da aprovação do dono, registrada na trilha;
 * - acima de TETO_COM_APROVACAO, bloqueado.
 */
export const TETO_SEM_APROVACAO = 10;
export const TETO_COM_APROVACAO = 30;

/**
 * Quem aprova desconto acima do teto livre: o dono (Bruno, admin principal).
 * Pela variável CONTRATOS_APROVADOR_EMAIL dá para trocar sem publicar código
 * (e a prova do dev local usa uma conta de teste no lugar do Bruno).
 */
export const APROVADOR_PADRAO = "bruno.donaire@demandou.com";

export const MOTIVOS_DE_DESCONTO = {
  campanha: "Campanha",
  negociacao: "Negociação",
  fundador: "Fundador",
  parceiro: "Parceiro",
} as const;
export type MotivoDoDesconto = keyof typeof MOTIVOS_DE_DESCONTO;

export function ehMotivoDeDesconto(v: unknown): v is MotivoDoDesconto {
  return typeof v === "string" && v in MOTIVOS_DE_DESCONTO;
}

/** O preço de tabela de um acesso extra no ano, em centavos (R$ 197 x 12). */
export const ACESSO_EXTRA_ANUAL_CENTAVOS = ACESSO_EXTRA.precoMensal * 12 * 100;

export type TipoDeDesconto = "percentual" | "valor";

export type PrecoDeTabela = {
  planoCentavos: number;
  extrasCentavos: number;
  totalCentavos: number;
};

export function precoDeTabela(plano: string, acessosExtras: number): PrecoDeTabela | null {
  const p = PLANOS_PUBLICOS.find((x) => x.id === plano);
  if (!p) return null;
  const planoCentavos = p.anual * 100;
  const extrasCentavos = Math.max(0, Math.floor(acessosExtras || 0)) * ACESSO_EXTRA_ANUAL_CENTAVOS;
  return { planoCentavos, extrasCentavos, totalCentavos: planoCentavos + extrasCentavos };
}

/**
 * O desconto como o vendedor digitou: `valor` é a porcentagem (8 = 8%, aceita
 * 7,5) ou o valor em centavos. Devolve o desconto em centavos, a porcentagem
 * efetiva sobre a tabela e o valor final.
 */
export function calcularDesconto(tabelaCentavos: number, tipo: TipoDeDesconto | null, valor: number | null) {
  let descontoCentavos = 0;
  if (tipo && valor && valor > 0) {
    descontoCentavos = tipo === "percentual" ? Math.round((tabelaCentavos * valor) / 100) : Math.round(valor);
  }
  descontoCentavos = Math.min(Math.max(0, descontoCentavos), tabelaCentavos);
  const percentual = tabelaCentavos > 0 ? (descontoCentavos / tabelaCentavos) * 100 : 0;
  return { descontoCentavos, percentual, finalCentavos: tabelaCentavos - descontoCentavos };
}

export type FaixaDoDesconto = "sem_desconto" | "livre" | "aprovacao" | "bloqueado";

/** Em que faixa cai o desconto. Uma folga de 0,001 ponto evita que 10% vire 10,0000001% no arredondamento. */
export function faixaDoDesconto(percentual: number): FaixaDoDesconto {
  if (percentual <= 0) return "sem_desconto";
  if (percentual <= TETO_SEM_APROVACAO + 0.001) return "livre";
  if (percentual <= TETO_COM_APROVACAO + 0.001) return "aprovacao";
  return "bloqueado";
}

export const NOME_DA_FAIXA: Record<FaixaDoDesconto, string> = {
  sem_desconto: "Sem desconto",
  livre: `Até ${TETO_SEM_APROVACAO}%: o vendedor concede`,
  aprovacao: `De ${TETO_SEM_APROVACAO}% a ${TETO_COM_APROVACAO}%: precisa da aprovação do dono antes de enviar`,
  bloqueado: `Acima de ${TETO_COM_APROVACAO}%: bloqueado`,
};

/** "8%" e "7,5%": a porcentagem com no máximo uma casa, no jeito brasileiro. */
export function porcentagem(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * A DIFERENÇA DO ADITIVO: a mudança do valor anual, proporcional aos dias que
 * faltam da vigência a partir da data em que a mudança vale. Positiva, o
 * cliente paga à vista (como o acesso extra no meio da vigência, cláusula
 * 4.9); negativa, vira crédito abatido na renovação.
 */
export function diferencaProporcional(args: { valorAtualCentavos: number; valorNovoCentavos: number; inicioVigencia: Date; fimVigencia: Date; desde: Date }) {
  const DIA = 24 * 60 * 60 * 1000;
  const total = Math.max(1, Math.round((args.fimVigencia.getTime() - args.inicioVigencia.getTime()) / DIA));
  const restantes = Math.min(total, Math.max(0, Math.ceil((args.fimVigencia.getTime() - args.desde.getTime()) / DIA)));
  const anual = args.valorNovoCentavos - args.valorAtualCentavos;
  const diferencaCentavos = Math.round((anual * restantes) / total);
  return { anualCentavos: anual, diasRestantes: restantes, diasDaVigencia: total, diferencaCentavos };
}

/**
 * OS CAMPOS DO PREÇO no formulário do gestor (04/10). Moram aqui, e não no
 * componente, porque a ficha (servidor) monta o valor inicial da versão nova e
 * do aditivo, e função de componente de cliente não roda no servidor.
 */
export type ValorDoPreco = {
  plano: string;
  extras: number;
  tipo: TipoDeDesconto;
  valor: string;
  motivo: string;
  observacao: string;
  fundador: boolean;
};

export function valorInicialDoPreco(plano: string, extras = 0): ValorDoPreco {
  return { plano, extras, tipo: "percentual", valor: "", motivo: "", observacao: "", fundador: false };
}

/** O que está gravado no contrato, de volta para os campos. */
export function valorDoContrato(c: { planoId: string; acessosExtras: number; descontoTipo: string | null; descontoValor: number | null; descontoMotivo: string | null; descontoObservacao: string | null; fundador: boolean }): ValorDoPreco {
  const v = c.descontoValor ? (c.descontoValor / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
  return {
    plano: c.planoId,
    extras: c.acessosExtras,
    tipo: c.descontoTipo === "valor" ? "valor" : "percentual",
    valor: v,
    motivo: c.descontoMotivo ?? "",
    observacao: c.descontoObservacao ?? "",
    fundador: c.fundador,
  };
}

