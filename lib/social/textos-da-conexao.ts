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

/**
 * A PÁGINA DE EMPRESA DO LINKEDIN COMO DESTINO PRÓPRIO DA CONEXÃO ASSISTIDA
 * (05/10, decisão do Bruno).
 *
 * O perfil pessoal do LinkedIn conecta pelo app da Demandou e funciona para
 * todo mundo. A página de empresa não: o app de páginas (Community Management
 * API) está no nível de desenvolvimento, e só quem é administrador do app
 * consegue autorizar. Por isso a página entra pela ponte de publicação, com a
 * conexão assistida, e o perfil continua com o botão de sempre. Os dois são a
 * mesma rede ("linkedin") no banco; este nome existe só para o pedido, a tela
 * e o roteador saberem de qual dos dois se fala.
 */
export const PAGINA_DO_LINKEDIN = "linkedin-pagina";

/** Tudo que pode ser pedido na conexão assistida: as redes e a página do LinkedIn. */
export const DESTINOS_DA_CONEXAO: readonly string[] = [...REDES_DA_DEMANDOU, PAGINA_DO_LINKEDIN];

/** A rede do banco (`SocialAccount.platform`) de cada destino. */
export function redeDoDestino(destino: string): string {
  return destino === PAGINA_DO_LINKEDIN ? "linkedin" : destino;
}

export const NOME_DA_REDE: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  [PAGINA_DO_LINKEDIN]: "LinkedIn (página de empresa)",
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
  linkedin: "Login do LinkedIn à mão e acesso ao código de confirmação.",
  [PAGINA_DO_LINKEDIN]:
    "Login do LinkedIn de quem é Superadministrador ou Administrador de conteúdo da página (confira em Ferramentas de administrador, na página da empresa) e acesso ao código de confirmação.",
  twitter: "Login do X à mão e acesso ao código de confirmação.",
  youtube: "Entrar com a conta do Google dona do canal e escolher o canal certo.",
};

/** O código do pedido no corpo da chamada e na resposta. */
export type PedidoDeConexao = { rede: string; pedidoEm: string };
