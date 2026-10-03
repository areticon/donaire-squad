import { prisma } from "@/lib/db/prisma";
import { listarContas, listarSubcontas, type ContaDoBlotato } from "@/lib/blotato";
import { caminhoDaConta, escreverVinculo, lerVinculo, type CaminhoDePublicacao } from "@/lib/publish/roteador";

/**
 * VÍNCULOS ENTRE AS CONTAS DA PONTE (BLOTATO) E AS CONTAS DA DEMANDOU (01/10).
 *
 * Saiu de scripts/blotato-contas.mts para a tela /admin/redes poder fazer o
 * mesmo sem terminal: o primeiro cliente entra em 01/10, e ligar a conta dele
 * ao projeto no meio da chamada não pode depender de abrir o Git Bash. O
 * script continua existindo e chama estas mesmas funções, então as regras
 * (Facebook exige página, rede precisa existir na Demandou, conta tem que ser
 * do projeto) valem igual nos dois caminhos.
 *
 * Só servidor: toca o banco e a API da ponte. Este arquivo pode ter o nome do
 * fornecedor; o que vai para a tela do CLIENTE nunca tem.
 */

const REDES = ["linkedin", "twitter", "instagram", "facebook", "youtube", "tiktok"];

export class RecusaDoVinculo extends Error {}

export type ContaDaPonte = ContaDoBlotato & {
  paginas: Array<{ id: string; nome: string | null }>;
  /** Falha ao ler as páginas, quando houve. */
  erroDasPaginas?: string;
};

/** As contas conectadas na conta Blotato da Demandou, com as páginas (Facebook, LinkedIn) e playlists (YouTube). */
export async function lerContasDaPonte(): Promise<ContaDaPonte[]> {
  const contas = await listarContas();
  return Promise.all(
    contas.map(async (c) => {
      if (c.platform !== "facebook" && c.platform !== "linkedin" && c.platform !== "youtube") return { ...c, paginas: [] };
      try {
        const subs = await listarSubcontas(c.id);
        return { ...c, paginas: subs.map((s) => ({ id: s.id, nome: s.name ?? null })) };
      } catch (e) {
        return { ...c, paginas: [], erroDasPaginas: e instanceof Error ? e.message : String(e) };
      }
    })
  );
}

export type ContaDoProjeto = {
  id: string;
  projectId: string;
  projeto: string;
  dono: string;
  platform: string;
  nome: string;
  accountType: string;
  temToken: boolean;
  vinculo: string | null;
  ativa: boolean;
  caminho: CaminhoDePublicacao;
  motivo: string;
  precisaReconectar: boolean;
};

/** Toda conta de rede, de todo projeto, e por onde cada uma publica hoje. */
export async function lerContasDosProjetos(projectId?: string): Promise<ContaDoProjeto[]> {
  const contas = await prisma.socialAccount.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: [{ projectId: "asc" }, { platform: "asc" }],
    select: {
      id: true,
      projectId: true,
      platform: true,
      accountType: true,
      displayName: true,
      username: true,
      accessToken: true,
      blotatoAccountId: true,
      isActive: true,
      needsReconnectAt: true,
      project: { select: { name: true, user: { select: { email: true } } } },
    },
  });
  return contas.map((c) => {
    const r = caminhoDaConta(c);
    return {
      id: c.id,
      projectId: c.projectId,
      projeto: c.project.name,
      dono: c.project.user.email,
      platform: c.platform,
      nome: c.displayName ?? c.username ?? c.platform,
      accountType: c.accountType,
      temToken: Boolean(c.accessToken),
      vinculo: c.blotatoAccountId ?? null,
      ativa: c.isActive,
      caminho: r.caminho,
      motivo: r.motivo,
      precisaReconectar: Boolean(c.needsReconnectAt),
    };
  });
}

export type ResultadoDaLigacao = { socialAccountId: string; criada: boolean; nome: string; vinculo: string };

/**
 * Liga uma conta da ponte a um projeto.
 *
 * Sem `socialId`: cria (ou atualiza) uma conta no projeto ligada só pela
 * ponte, que é o caso do cliente cujo Instagram a Meta ainda não deixa
 * conectar. Com `socialId`: liga a conta que o projeto JÁ tem, e ela passa a
 * sair pela ponte quando a rede estiver em PUBLICAR_VIA_BLOTATO.
 */
export async function ligarContaDaPonte(args: {
  projectId: string;
  contaId: string;
  paginaId?: string | null;
  socialId?: string | null;
}): Promise<ResultadoDaLigacao> {
  const pagina = args.paginaId?.trim() || null;
  const projeto = await prisma.project.findUnique({ where: { id: args.projectId }, select: { id: true, name: true } });
  if (!projeto) throw new RecusaDoVinculo(`Projeto ${args.projectId} não existe.`);

  const contas = await listarContas();
  const conta = contas.find((c) => c.id === args.contaId);
  if (!conta) throw new RecusaDoVinculo(`A conta ${args.contaId} não está na conta da ponte. Atualize a lista.`);
  if (!REDES.includes(conta.platform)) throw new RecusaDoVinculo(`A rede ${conta.platform} não existe na Demandou.`);
  if (conta.platform === "facebook" && !pagina) {
    throw new RecusaDoVinculo("Facebook precisa da página: a publicação é na página, não no perfil.");
  }

  let nomeDaPagina: string | null = null;
  if (pagina) {
    const subs = await listarSubcontas(args.contaId);
    const sub = subs.find((s) => s.id === pagina);
    if (!sub) throw new RecusaDoVinculo(`A página ${pagina} não está ligada à conta ${args.contaId} na ponte.`);
    nomeDaPagina = sub.name ?? null;
  }
  // Playlist do YouTube não é destino: o vínculo do YouTube é só o canal.
  const vinculo = escreverVinculo({ contaId: args.contaId, paginaId: conta.platform === "youtube" ? null : pagina });

  if (args.socialId) {
    const social = await prisma.socialAccount.findUnique({ where: { id: args.socialId } });
    if (!social || social.projectId !== args.projectId) throw new RecusaDoVinculo(`A conta ${args.socialId} não é deste projeto.`);
    if (social.platform !== conta.platform) {
      throw new RecusaDoVinculo(`A conta ${args.socialId} é de ${social.platform}, e a da ponte é de ${conta.platform}.`);
    }
    await prisma.socialAccount.update({ where: { id: args.socialId }, data: { blotatoAccountId: vinculo } });
    return { socialAccountId: social.id, criada: false, nome: social.displayName ?? social.platform, vinculo };
  }

  // O `platformUserId` leva o vínculo para não colidir com a conta que o
  // cliente conectar depois pela Demandou (essa grava o id da rede, e as duas
  // convivem até alguém desligar esta).
  const platformUserId = `blotato:${vinculo}`;
  const organizacao = (conta.platform === "linkedin" && Boolean(pagina)) || conta.platform === "facebook";
  const dados = {
    blotatoAccountId: vinculo,
    displayName: nomeDaPagina ?? conta.fullname ?? conta.username ?? conta.platform,
    username: conta.username ?? null,
    accountType: organizacao ? "organization" : "personal",
    organizationId: conta.platform === "linkedin" && pagina ? pagina : null,
    isActive: true,
    needsReconnectAt: null,
    needsReconnectReason: null,
  };
  const existente = await prisma.socialAccount.findUnique({
    where: { projectId_platform_platformUserId: { projectId: args.projectId, platform: conta.platform, platformUserId } },
    select: { id: true },
  });
  const social = await prisma.socialAccount.upsert({
    where: { projectId_platform_platformUserId: { projectId: args.projectId, platform: conta.platform, platformUserId } },
    create: { projectId: args.projectId, platform: conta.platform, platformUserId, ...dados },
    update: dados,
  });
  return { socialAccountId: social.id, criada: !existente, nome: dados.displayName, vinculo };
}

/**
 * Tira o vínculo. Conta só da ponte (sem token próprio) é APAGADA, pelo mesmo
 * caminho da tela do cliente (os posts guardam para onde iam, ver
 * lib/publish/contas-orfas.ts); conta com token volta para a API própria.
 */
export async function desligarContaDaPonte(socialId: string): Promise<{ apagada: boolean; platform: string; projectId: string }> {
  const social = await prisma.socialAccount.findUnique({ where: { id: socialId } });
  if (!social) throw new RecusaDoVinculo(`Conta ${socialId} não existe.`);
  if (!lerVinculo(social.blotatoAccountId)) throw new RecusaDoVinculo("Esta conta não tinha vínculo com a ponte.");
  if (!social.accessToken) {
    const { marcarPostsDaConta } = await import("@/lib/publish/contas-orfas");
    await marcarPostsDaConta(socialId);
    await prisma.socialAccount.delete({ where: { id: socialId } });
    return { apagada: true, platform: social.platform, projectId: social.projectId };
  }
  await prisma.socialAccount.update({ where: { id: socialId }, data: { blotatoAccountId: null } });
  return { apagada: false, platform: social.platform, projectId: social.projectId };
}
