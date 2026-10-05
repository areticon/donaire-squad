import type { SocialAccount } from "@prisma/client";

/**
 * POR ONDE CADA POST SAI: API PRÓPRIA DA REDE OU BLOTATO (30/09).
 *
 * O lançamento não pode esperar a Meta e o TikTok aprovarem os apps: sem a
 * aprovação, só quem é testador do app consegue conectar Instagram e Facebook,
 * e o TikTok publica só como "somente eu". O Blotato já tem esses apps
 * aprovados, então serve de ponte, rede por rede, até cada aprovação sair.
 *
 * O PADRÃO É A API PRÓPRIA, para tudo, como antes. Nada muda até alguém ligar:
 *
 *   1. Sem BLOTATO_API_KEY no ambiente, nenhum post vai pelo Blotato.
 *   2. Conta sem vínculo com o Blotato (`blotatoAccountId` vazio) sai pela API
 *      própria, sempre. O vínculo só nasce pelo script
 *      scripts/blotato-contas.mts, à mão.
 *   3. Conta COM vínculo sai pelo Blotato quando:
 *        . a rede está em PUBLICAR_VIA_BLOTATO (ex.: "instagram,tiktok,facebook";
 *          "x" vale como "twitter"; "todas" liga todas);
 *        . OU o id da conta está em PUBLICAR_VIA_BLOTATO_CONTAS (lista de ids
 *          de SocialAccount, para ligar um cliente só sem mexer na rede toda);
 *        . OU a conta não tem token próprio: ela foi ligada só pelo Blotato
 *          (cliente cujo Instagram a Meta ainda não deixa conectar), e não
 *          existe outro caminho para ela.
 *
 *   4. PÁGINA DE EMPRESA DO LINKEDIN (05/10, decisão do Bruno): conta LinkedIn
 *      de organização com página no vínculo sai pelo Blotato SEMPRE que a
 *      chave existe, tenha ou não token próprio, sem precisar de "linkedin" em
 *      PUBLICAR_VIA_BLOTATO (que levaria o perfil pessoal junto). O app de
 *      páginas da Demandou está no nível de desenvolvimento da Community
 *      Management API e só publica para quem é administrador do app; o
 *      perfil pessoal continua pela API própria. Para desligar só esta regra,
 *      PAGINA_LINKEDIN_PELA_PONTE=0 (a mesma variável tira a conexão assistida
 *      da página na tela do cliente, ver lib/social/conexao-assistida.ts).
 *
 * Quando uma rede for aprovada, basta tirá-la de PUBLICAR_VIA_BLOTATO: as
 * contas com token próprio voltam na hora para a API própria. As que só têm o
 * vínculo continuam pelo Blotato até o cliente conectar pela Demandou, porque
 * derrubá-las de uma vez pararia a publicação de quem não fez nada de errado.
 * Com todas aprovadas, tirar BLOTATO_API_KEY desliga o Blotato inteiro.
 */

export type CaminhoDePublicacao = "propria" | "blotato";

const APELIDOS: Record<string, string> = { x: "twitter" };
const TODAS = ["linkedin", "twitter", "instagram", "facebook", "youtube", "tiktok"];

function lista(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[,;\s]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/** As redes ligadas no Blotato pela variável de ambiente. */
export function redesPeloBlotato(valor = process.env.PUBLICAR_VIA_BLOTATO): Set<string> {
  const itens = lista(valor).map((v) => APELIDOS[v] ?? v);
  return new Set(itens.includes("todas") || itens.includes("*") ? TODAS : itens);
}

/** Os ids de SocialAccount ligados um a um. Id não muda de caixa. */
export function contasPeloBlotato(valor = process.env.PUBLICAR_VIA_BLOTATO_CONTAS): Set<string> {
  return new Set(
    (valor ?? "")
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

export function blotatoLigado(): boolean {
  return Boolean(process.env.BLOTATO_API_KEY?.trim());
}

/**
 * A página de empresa do LinkedIn conecta e publica pela ponte (regra 4 do
 * topo). Ligada por padrão com a chave presente; "0", "nao" ou "false" em
 * PAGINA_LINKEDIN_PELA_PONTE desliga.
 */
export function paginaDoLinkedInPelaPonte(valor = process.env.PAGINA_LINKEDIN_PELA_PONTE): boolean {
  if (!blotatoLigado()) return false;
  return !/^(0|n[aã]o|false|off)$/i.test((valor ?? "").trim());
}

/**
 * O VÍNCULO COM O BLOTATO, guardado na coluna `blotatoAccountId` que já existe
 * (herança de março), sem migração.
 *
 * Facebook exige a PÁGINA além da conta, e a página de empresa do LinkedIn
 * também é um número à parte; os dois cabem na mesma coluna, separados por
 * dois-pontos: "98433" (perfil, X, Instagram, TikTok, YouTube) ou
 * "98433:123456789" (conta e página). Os ids do Blotato são números, então os
 * dois-pontos nunca aparecem dentro de um deles.
 */
export type VinculoBlotato = { contaId: string; paginaId: string | null };

export function lerVinculo(valor: string | null | undefined): VinculoBlotato | null {
  const v = valor?.trim();
  if (!v) return null;
  const [contaId, paginaId] = v.split(":", 2).map((p) => p.trim());
  if (!contaId) return null;
  return { contaId, paginaId: paginaId || null };
}

export function escreverVinculo(v: VinculoBlotato): string {
  return v.paginaId ? `${v.contaId}:${v.paginaId}` : v.contaId;
}

type ContaParaRotear = Pick<SocialAccount, "id" | "platform" | "accessToken" | "blotatoAccountId"> & {
  /** "organization" é página; sem o campo, a conta é tratada como perfil. */
  accountType?: string | null;
};

export function caminhoDaConta(
  conta: ContaParaRotear,
  env: { redes?: string; contas?: string; paginaLinkedIn?: string } = {}
): { caminho: CaminhoDePublicacao; motivo: string } {
  const vinculo = lerVinculo(conta.blotatoAccountId);
  if (!vinculo) {
    return { caminho: "propria", motivo: "conta sem vínculo com o Blotato" };
  }
  if (!conta.accessToken) {
    // Mesmo com o Blotato desligado: a única saída desta conta é o Blotato, e
    // quem publica devolve o erro claro ("falta a chave") em vez de tentar a
    // API da rede com token vazio e culpar o cliente por um "reconecte".
    return { caminho: "blotato", motivo: "conta ligada só pelo Blotato (sem token próprio)" };
  }
  if (!blotatoLigado()) {
    return { caminho: "propria", motivo: "Blotato desligado (sem BLOTATO_API_KEY)" };
  }
  if (
    conta.platform === "linkedin" &&
    conta.accountType === "organization" &&
    vinculo.paginaId &&
    paginaDoLinkedInPelaPonte(env.paginaLinkedIn ?? process.env.PAGINA_LINKEDIN_PELA_PONTE)
  ) {
    return { caminho: "blotato", motivo: "página de empresa do LinkedIn (sempre pela ponte)" };
  }
  if (contasPeloBlotato(env.contas ?? process.env.PUBLICAR_VIA_BLOTATO_CONTAS).has(conta.id)) {
    return { caminho: "blotato", motivo: "conta ligada em PUBLICAR_VIA_BLOTATO_CONTAS" };
  }
  if (redesPeloBlotato(env.redes ?? process.env.PUBLICAR_VIA_BLOTATO).has(conta.platform)) {
    return { caminho: "blotato", motivo: `rede ${conta.platform} ligada em PUBLICAR_VIA_BLOTATO` };
  }
  return { caminho: "propria", motivo: "rede fora de PUBLICAR_VIA_BLOTATO" };
}

export function vaiPeloBlotato(conta: ContaParaRotear): boolean {
  return caminhoDaConta(conta).caminho === "blotato";
}
