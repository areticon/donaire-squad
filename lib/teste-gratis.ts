/**
 * O QUE CABE NO PERÍODO DE TESTE.
 *
 * Decisão do Bruno em 22/09: "a conta durante o período de teste deve ter
 * limitação de 1 campanha no máximo 7 dias com 1 vídeo de 30 s, no máximo".
 *
 * ## Por que o teste precisa de teto próprio
 *
 * O teste é de sete dias e o cartão só é cobrado no oitavo. Tudo que a conta
 * consumir até lá é custo nosso, e ele é real: uma campanha de sete dias em
 * quatro redes custa R$ 31 de IA, e um vídeo de 60 s custa mais R$ 52 e come
 * NOVE das dez gerações que o fornecedor libera por dia para a plataforma
 * inteira. Sem teto, quem cancela no sexto dia sai levando mais em custo do
 * que muitos clientes pagantes geram de margem no mês.
 *
 * ## Por que estes números
 *
 * Eles são o suficiente para a pessoa ver o produto inteiro funcionando:
 * uma campanha de uma semana já entrega o ciclo completo (pesquisa, texto,
 * arte, vídeo, agendamento e publicação), e 30 s de vídeo é a mesma duração
 * que o Autoridade produz por dia. O teste mostra o produto, não substitui o
 * plano.
 *
 * ## Este módulo é PURO
 *
 * A janela da campanha é componente de cliente e lê daqui as opções que pode
 * oferecer. Quem lê o banco é `lib/limites-do-plano.ts`. Módulo que a tela
 * importa não toca no banco, que é a regra paga com uma tela caída em 21/09.
 */

/** Uma campanha, e só uma, enquanto o teste durar. */
export const CAMPANHAS_NO_TESTE = 1;

/** Sete dias de campanha, que é o ciclo completo do produto. */
export const DIAS_DE_CAMPANHA_NO_TESTE = 7;

/** Trinta segundos de vídeo: quatro gerações, o mesmo que o Autoridade faz por dia. */
export const SEGUNDOS_DE_VIDEO_NO_TESTE = 30;

/** Um vídeo, no dia que a pessoa escolher. */
export const VIDEOS_NO_TESTE = 1;

export type LimiteDoTeste = {
  emTeste: boolean;
  /** ISO do fim do teste. Null fora do teste. */
  terminaEm: string | null;
  campanhasUsadas: number;
  campanhas: number;
  dias: number;
  segundosDeVideo: number;
  videos: number;
};

/** O teto fora do teste: sem teto nenhum, que é o que o plano paga. */
export const SEM_TESTE: LimiteDoTeste = {
  emTeste: false,
  terminaEm: null,
  campanhasUsadas: 0,
  campanhas: 0,
  dias: 0,
  segundosDeVideo: 0,
  videos: 0,
};

/** Quantos dias de campanha esta conta pode pedir agora. */
export function diasPermitidos(limite: LimiteDoTeste, pedido: number): number {
  if (!limite.emTeste) return pedido;
  return Math.min(pedido, limite.dias);
}

/** Quantos segundos de vídeo esta conta pode pedir agora. */
export function segundosPermitidos(limite: LimiteDoTeste, pedido: number): number {
  if (!limite.emTeste) return pedido;
  return Math.min(pedido, limite.segundosDeVideo);
}

/** Já usou a campanha do teste? */
export function acabouAsCampanhas(limite: LimiteDoTeste): boolean {
  return limite.emTeste && limite.campanhasUsadas >= limite.campanhas;
}

/**
 * A frase que a tela mostra, montada aqui e não em cada lugar.
 *
 * Diz o teto E a saída na mesma frase. Teto sem saída é parede, e parede no
 * meio do teste é o cliente decidindo cancelar por um limite que ele acha que
 * é o produto inteiro.
 */
export function fraseDoTeste(limite: LimiteDoTeste): string | null {
  if (!limite.emTeste) return null;
  if (acabouAsCampanhas(limite)) {
    return `O teste inclui ${limite.campanhas} campanha, e ela já foi gerada. Assine para gerar quantas quiser, ou espere o teste terminar.`;
  }
  return `No teste: ${limite.campanhas} campanha de até ${limite.dias} dias, com até ${limite.videos} vídeo de ${limite.segundosDeVideo}s. Assinando, os limites são os do plano.`;
}

/** O aviso curto, para quando o cliente escolhe algo acima do teto. */
export function avisoDoTeste(
  limite: LimiteDoTeste,
  escolha: { dias?: number; segundosDeVideo?: number }
): string | null {
  if (!limite.emTeste) return null;
  if (escolha.dias !== undefined && escolha.dias > limite.dias) {
    return `Durante o teste a campanha vai até ${limite.dias} dias. Assine para liberar as semanas inteiras.`;
  }
  if (escolha.segundosDeVideo !== undefined && escolha.segundosDeVideo > limite.segundosDeVideo) {
    return `Durante o teste o vídeo vai até ${limite.segundosDeVideo}s. Assine para liberar os 60s.`;
  }
  return null;
}
