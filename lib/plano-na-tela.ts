/**
 * O que a faixa do topo mostra. Arquivo SEM banco de propósito: a faixa se
 * atualiza no navegador (components/billing/faixa-do-plano.tsx), e componente
 * de cliente não importa módulo que toca o banco.
 */
export type PlanoNaTela = {
  /** O nome que o cliente vê: "Autoridade", "Sem plano", "Acesso interno". */
  nome: string;
  planoId: string;
  creditos: number;
  creditosDeVideo: number;
  /** Acesso interno: sem cobrança, sem cota e sem convite. */
  admin: boolean;
  /** Em teste agora, com o dia em que ele acaba. */
  emTeste: boolean;
  diasDeTesteRestantes: number | null;
  /** Para onde o botão leva, e o que ele diz. Null para acesso interno. */
  acao: { rotulo: string; href: string } | null;
  /**
   * MEMBRO DA EQUIPE (01/10): o saldo mostrado é o da conta do dono, e a faixa
   * diz de quem é a conta em vez de oferecer upgrade (membro não vê cobrança).
   */
  equipe?: { dono: string; tetoCreditos: number | null; creditosUsados: number } | null;
};
