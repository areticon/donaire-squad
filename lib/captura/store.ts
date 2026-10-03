import { create } from "zustand";

/**
 * O ESTADO DA JANELA DE CAPTURA, que qualquer CTA da landing abre.
 *
 * Nasceu em 19/09, do pedido do Bruno: o formulario saiu do topo da pagina e
 * virou popup dos CTAs. A razao e de composicao, e ela e boa: a landing tem
 * cinco chamadas para acao espalhadas (topo, demo, preco, barra), e com o
 * formulario fixo no hero as quatro de baixo mandavam a pessoa de volta para
 * cima ou para outra pagina. Agora as cinco abrem a mesma janela onde a pessoa
 * estiver.
 *
 * ZUSTAND E NAO CONTEXT porque a landing e feita de componentes de SERVIDOR
 * (app/page.tsx renderiza tudo no servidor). Um provider de contexto obrigaria
 * a transformar a pagina inteira em cliente, e a landing e a unica pagina do
 * produto que se beneficia de sair estatica. A loja e um modulo: cada CTA vira
 * cliente sozinho, e o resto da pagina continua servidor.
 */

export type OrigemDoClique =
  | "hero"
  | "navbar"
  | "demo"
  | "preco"
  | "formatos"
  | "rodape"
  // Os pontos de ação novos da rodada do Matheus (02/10).
  | "equipe"
  | "referencias"
  | "valor"
  | "demanda-day"
  | "oferecemos";

interface EstadoDaCaptura {
  aberta: boolean;
  /**
   * De QUAL botao a pessoa veio.
   *
   * Vai junto do lead, e nao e enfeite: com cinco CTAs na mesma pagina, saber
   * qual converte e o que diz onde por o proximo. Sem isso, "a landing
   * converteu 3%" e um numero que nao ensina nada.
   */
  origem: OrigemDoClique | null;
  abrir: (origem: OrigemDoClique) => void;
  fechar: () => void;
}

export const useCaptura = create<EstadoDaCaptura>((set) => ({
  aberta: false,
  origem: null,
  abrir: (origem) => set({ aberta: true, origem }),
  fechar: () => set({ aberta: false }),
}));
