/**
 * TEXTOS DA CONEXÃO ASSISTIDA (01/10), sem import nenhum de propósito: este
 * arquivo é lido por componente de cliente (painel de redes e assistente do
 * projeto), e componente de cliente nunca importa módulo que toca o banco.
 *
 * Por que existe: até a Meta e o TikTok aprovarem os apps da Demandou, o botão
 * "Conectar" dessas redes só funciona para quem é testador do app. Um cliente
 * de fora clicava, via a tela da Meta recusar e achava que o defeito era dele.
 * Na conexão assistida, o time conecta junto com o cliente numa chamada curta,
 * e a publicação segue igual. O nome do fornecedor que faz a ponte nunca
 * aparece aqui (regra do Bruno de 21/09).
 */

export const REDES_DA_DEMANDOU = ["linkedin", "twitter", "instagram", "facebook", "youtube", "tiktok"] as const;
export type RedeDaDemandou = (typeof REDES_DA_DEMANDOU)[number];

export const NOME_DA_REDE: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/** A frase curta que explica por que a rede não tem o botão de sempre. */
export const POR_QUE_ASSISTIDA =
  "Esta rede ainda está liberando o acesso direto da Demandou. Até lá, conectamos junto com você numa chamada rápida de 15 minutos, e a publicação funciona igual.";

/**
 * O que o cliente precisa ter antes da chamada, por rede. É o que mais derruba
 * a conexão na hora (conta pessoal no Instagram, perfil sem papel de admin na
 * página), então vai na tela e no e-mail.
 */
export const O_QUE_PREPARAR: Record<string, string> = {
  instagram:
    "Conta profissional (Empresa ou Criador de conteúdo), com o login e a senha do Instagram à mão e acesso ao código de confirmação.",
  facebook: "Ser administrador da página com acesso total (a publicação é na página, não no perfil pessoal).",
  tiktok: "Login do TikTok à mão e acesso ao código de confirmação. Conta nova precisa de algumas semanas de uso normal antes.",
  linkedin: "Para a página da empresa, ser Superadministrador ou Administrador de conteúdo da página.",
  twitter: "Login do X à mão e acesso ao código de confirmação.",
  youtube: "Entrar com a conta do Google dona do canal e escolher o canal certo.",
};

/** O código do pedido no corpo da chamada e na resposta. */
export type PedidoDeConexao = { rede: string; pedidoEm: string };
