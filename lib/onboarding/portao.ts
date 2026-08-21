import { prisma } from "@/lib/db/prisma";

/**
 * Portão de entrada da plataforma.
 *
 * Existe por causa de um achado do teste de jornada de 21/08: quem entrava
 * pelo login social (ou por qualquer URL que não trouxesse `?plan=`) caía
 * direto no dashboard como plano "free", sem nunca ver a página de planos e
 * sem pôr cartão. E "free" não é um plano de verdade: `creditsBalance` nasce
 * em 0, então a pessoa percorria o onboarding inteiro para bater no muro de
 * "essa campanha custa X créditos e você tem 0" no último passo.
 *
 * Duas decisões que este módulo carrega:
 *
 * 1. **Sem plano, não entra.** Quem não tem plano ativo vai para /planos. O
 *    teste de 7 dias já pede cartão, então isso não é barreira nova, é a
 *    barreira que já era para existir.
 * 2. **Com plano e sem projeto, não vê tela vazia.** O primeiro projeto nasce
 *    sozinho e a pessoa cai na etapa 1 do assistente, que é conectar as redes.
 *    Tela inicial vazia com um quadrinho de "criar projeto" é trabalho que a
 *    plataforma empurra para quem acabou de pagar.
 */

/** Rotas do app que um usuário sem plano ainda pode abrir. */
const LIVRES_SEM_PLANO = ["/billing", "/settings"];

export function isentaDoPortao(pathname: string): boolean {
  return LIVRES_SEM_PLANO.some(
    (rota) => pathname === rota || pathname.startsWith(rota + "/")
  );
}

export type Destino =
  | { tipo: "segue" }
  | { tipo: "planos" }
  | { tipo: "setup"; projectId: string };

/**
 * Decide para onde mandar quem acabou de entrar. Recebe o pathname para não
 * redirecionar quem já está justamente na tela de resolver a pendência.
 */
export async function destinoDeEntrada(
  userId: string,
  pathname: string
): Promise<Destino> {
  if (isentaDoPortao(pathname)) return { tipo: "segue" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  // "free" é ausência de plano, não um plano gratuito. Ver o comentário do
  // topo: com 0 créditos a plataforma não entrega nada.
  if (!user || user.plan === "free") return { tipo: "planos" };

  return { tipo: "segue" };
}

/**
 * Primeiro projeto de quem acabou de assinar. Idempotente por consulta: se já
 * existe projeto, devolve o mais recente em setup, ou nada.
 *
 * O nome provisório é trocado na Ideação, onde a IA preenche os campos.
 */
export async function garantirPrimeiroProjeto(
  userId: string
): Promise<string | null> {
  const existente = await prisma.project.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true },
  });

  if (existente) {
    return existente.status === "setup" ? existente.id : null;
  }

  const criado = await prisma.project.create({
    data: {
      userId,
      name: "Meu projeto",
      status: "setup",
      setupStep: 0,
    },
    select: { id: true },
  });

  await herdarLinkedInDoLogin(userId, criado.id);

  return criado.id;
}

/**
 * Aproveita o login do LinkedIn como conexão de publicação.
 *
 * Decisão de 21/08: quem entra pelo LinkedIn não deveria precisar conectar o
 * LinkedIn de novo. Só é possível porque o login passou a pedir também
 * `w_member_social` (ver components/auth/auth-form.tsx); sem esse escopo o
 * token da sessão identifica a pessoa mas não publica nada, e herdar aqui
 * criaria uma conexão que falha na hora de postar.
 *
 * Por isso a checagem do escopo é obrigatória e não decorativa: quem entrou
 * antes desta mudança tem token sem permissão de publicar, e para essas
 * contas a etapa 1 continua pedindo o clique de conectar.
 */
export async function herdarLinkedInDoLogin(
  userId: string,
  projectId: string
): Promise<boolean> {
  const conta = await prisma.account.findFirst({
    where: { userId, providerId: "linkedin" },
    orderBy: { createdAt: "desc" },
    select: {
      accountId: true,
      accessToken: true,
      accessTokenExpiresAt: true,
      scope: true,
    },
  });

  if (!conta?.accessToken) return false;
  if (!conta.scope?.includes("w_member_social")) return false;

  const jaExiste = await prisma.socialAccount.findFirst({
    where: { projectId, platform: "linkedin" },
    select: { id: true },
  });
  if (jaExiste) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  await prisma.socialAccount.create({
    data: {
      projectId,
      platform: "linkedin",
      accountType: "personal",
      platformUserId: conta.accountId,
      displayName: user?.name ?? null,
      accessToken: conta.accessToken,
      tokenExpiresAt: conta.accessTokenExpiresAt,
      isActive: true,
    },
  });

  return true;
}
