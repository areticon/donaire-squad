/**
 * Os segmentos do CRM e os nomes que a tela mostra.
 *
 * Módulo SEM banco e sem Stripe, de propósito: a tela do CRM é componente de
 * cliente e precisa destes nomes, e importar lib/admin/crm.ts no navegador
 * arrastaria o driver do banco para o bundle (armadilha já paga, ver
 * PROJETO.md). A regra de qual conta cai em qual segmento está em crm.ts.
 */
export type Segmento =
  | "lead"
  | "sem_plano"
  | "teste"
  | "pagante"
  | "cancelando"
  | "inadimplente"
  | "ex_cliente"
  | "cortesia"
  | "interno"
  | "robo";

export const NOME_DO_SEGMENTO: Record<Segmento, string> = {
  lead: "Leads",
  sem_plano: "Sem plano",
  teste: "Em teste",
  pagante: "Pagantes",
  cancelando: "Cancelando",
  inadimplente: "Cobrança falhou",
  ex_cliente: "Ex-clientes",
  cortesia: "Cortesia",
  interno: "Internos",
  robo: "Robôs",
};

