import { prisma } from "@/lib/db/prisma";
import { enviarEmail, type Email } from "@/lib/email";
import { casca, escapar, item, MARCA, paragrafo, titulo, botao } from "@/lib/email/layout";
import { blotatoLigado, redesPeloBlotato } from "@/lib/publish/roteador";
import { NOME_DA_REDE, O_QUE_PREPARAR, REDES_DA_DEMANDOU, type PedidoDeConexao } from "@/lib/social/textos-da-conexao";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * CONEXÃO ASSISTIDA (01/10): a rede que o cliente de fora não consegue
 * conectar sozinho pela Demandou.
 *
 * Motivo: sem a aprovação da Meta (Instagram e Facebook) e do TikTok, o OAuth
 * próprio só aceita quem é testador do app. O primeiro cliente entra em 01/10
 * e precisa publicar em todas as redes. Para essas redes, o time conecta a
 * conta do cliente na ponte de publicação (lib/publish/roteador.ts) numa
 * chamada curta, e liga a conta ao projeto pela tela /admin/redes.
 *
 * UMA VARIÁVEL MANDA NAS DUAS COISAS: as redes em PUBLICAR_VIA_BLOTATO são as
 * que publicam pela ponte E as que mostram "Conexão assistida" no lugar de
 * "Conectar". Quando a Meta aprovar, tirar "instagram,facebook" da variável
 * devolve o botão de sempre e a publicação pela API própria no mesmo deploy.
 * Duas variáveis para o mesmo fato acabariam discordando.
 *
 * Sem BLOTATO_API_KEY nenhuma rede é assistida: não haveria por onde publicar
 * o que o time conectasse, e prometer a chamada seria mentir.
 */
export function redesDeConexaoAssistida(): string[] {
  if (!blotatoLigado()) return [];
  const ligadas = redesPeloBlotato();
  return REDES_DA_DEMANDOU.filter((r) => ligadas.has(r));
}

/**
 * Onde o pedido fica guardado: em `admin_acoes`, sem migração. A ação é
 * "pedido-de-conexao" e quem "fez" é o próprio cliente (adminId e adminEmail
 * levam o id e o e-mail dele), o que faz o pedido aparecer na ficha do
 * cliente no CRM, na mesma linha do tempo das ações do time.
 */
const ACAO = "pedido-de-conexao";
/** Pedido repetido da mesma rede no mesmo projeto dentro deste prazo não gera outro e-mail. */
const JANELA_SEM_REPETIR_MS = 12 * 60 * 60 * 1000;

type Detalhe = { projectId: string; projeto: string; rede: string; nota?: string | null };

export class RecusaDoPedido extends Error {}

export async function pedirConexaoAssistida(args: {
  userId: string;
  projectId: string;
  rede: string;
  nota?: string | null;
  /** Para o e-mail dos admins abrir a tela certa. */
  baseUrl?: string;
}): Promise<{ pedidoEm: string; jaPedido: boolean; avisados: number }> {
  const { userId, projectId, rede } = args;
  if (!(REDES_DA_DEMANDOU as readonly string[]).includes(rede)) throw new RecusaDoPedido("Rede desconhecida.");
  const projeto = await prisma.project.findFirst({
    where: { id: projectId, ...projetoVisivel(userId) },
    select: { id: true, name: true, user: { select: { id: true, email: true, name: true } } },
  });
  if (!projeto) throw new RecusaDoPedido("Projeto não encontrado.");
  const nota = (args.nota ?? "").trim().slice(0, 500) || null;

  const anterior = await prisma.acaoDeAdmin.findFirst({
    where: { acao: ACAO, alvoId: userId, createdAt: { gte: new Date(Date.now() - JANELA_SEM_REPETIR_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, detalhe: true },
  });
  const det = anterior?.detalhe as Detalhe | null;
  if (anterior && det?.projectId === projectId && det?.rede === rede) {
    return { pedidoEm: anterior.createdAt.toISOString(), jaPedido: true, avisados: 0 };
  }

  const detalhe: Detalhe = { projectId, projeto: projeto.name, rede, nota };
  const linha = await prisma.acaoDeAdmin.create({
    data: {
      adminId: projeto.user.id,
      adminEmail: projeto.user.email,
      alvoId: projeto.user.id,
      alvoEmail: projeto.user.email,
      acao: ACAO,
      detalhe: detalhe as object,
    },
    select: { createdAt: true },
  });

  const base = (args.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? MARCA.site).replace(/\/$/, "");
  const nomeRede = NOME_DA_REDE[rede] ?? rede;
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
  let avisados = 0;
  for (const a of admins) {
    if (!a.email) continue;
    const ok = await enviarEmail({
      para: a.email,
      assunto: `Conexão assistida: ${nomeRede} de ${projeto.user.name ?? projeto.user.email} (${projeto.name})`,
      texto: [
        `${projeto.user.name ?? "Um cliente"} pediu a conexão assistida do ${nomeRede}.`,
        "",
        `Cliente: ${projeto.user.name ?? "(sem nome)"} <${projeto.user.email}>`,
        `Projeto: ${projeto.name} (${projeto.id})`,
        `Rede: ${nomeRede}`,
        nota ? `Recado do cliente: ${nota}` : "Sem recado.",
        "",
        "Responda este e-mail ao cliente para marcar a chamada. Na chamada, conecte a rede no painel da ponte",
        "(janela anônima, o cliente digita a própria senha) e depois ligue a conta ao projeto em:",
        `${base}/admin/redes?projeto=${projeto.id}`,
      ].join("\n"),
    });
    if (ok) avisados++;
  }

  // Confirmação ao cliente, com o que preparar. Sem o nome do fornecedor.
  const confirmacao = emailDoPedidoRecebido({ nome: projeto.user.name, rede, projeto: projeto.name, link: `${base}/projects/${projeto.id}/settings` });
  await enviarEmail({ ...confirmacao, para: projeto.user.email });

  return { pedidoEm: linha.createdAt.toISOString(), jaPedido: false, avisados };
}

/** Os pedidos do projeto nos últimos 14 dias, para a tela dizer "pedido enviado". */
export async function pedidosDoProjeto(userId: string, projectId: string): Promise<PedidoDeConexao[]> {
  const linhas = await prisma.acaoDeAdmin.findMany({
    where: { acao: ACAO, alvoId: userId, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, detalhe: true },
  });
  const vistas = new Set<string>();
  const saida: PedidoDeConexao[] = [];
  for (const l of linhas) {
    const d = l.detalhe as Detalhe | null;
    if (!d || d.projectId !== projectId || vistas.has(d.rede)) continue;
    vistas.add(d.rede);
    saida.push({ rede: d.rede, pedidoEm: l.createdAt.toISOString() });
  }
  return saida;
}

export type PedidoParaOAdmin = {
  em: string;
  email: string;
  projectId: string;
  projeto: string;
  rede: string;
  nota: string | null;
  /** O projeto já tem conta ativa desta rede (pela ponte ou pela API própria). */
  atendido: boolean;
};

/** Os pedidos dos últimos 30 dias, para a tela do admin. */
export async function pedidosRecentes(): Promise<PedidoParaOAdmin[]> {
  const linhas = await prisma.acaoDeAdmin.findMany({
    where: { acao: ACAO, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { createdAt: true, alvoEmail: true, detalhe: true },
  });
  const ids = [...new Set(linhas.map((l) => (l.detalhe as Detalhe | null)?.projectId).filter(Boolean) as string[])];
  const contas = await prisma.socialAccount.findMany({
    where: { projectId: { in: ids }, isActive: true },
    select: { projectId: true, platform: true },
  });
  const tem = new Set(contas.map((c) => `${c.projectId}|${c.platform}`));
  return linhas.flatMap((l) => {
    const d = l.detalhe as Detalhe | null;
    if (!d) return [];
    return [{
      em: l.createdAt.toISOString(),
      email: l.alvoEmail,
      projectId: d.projectId,
      projeto: d.projeto,
      rede: d.rede,
      nota: d.nota ?? null,
      atendido: tem.has(`${d.projectId}|${d.rede}`),
    }];
  });
}

function emailDoPedidoRecebido(args: { nome?: string | null; rede: string; projeto: string; link: string }): Email {
  const primeiro = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const nomeRede = NOME_DA_REDE[args.rede] ?? args.rede;
  const oi = primeiro ? `${primeiro}, recebemos seu pedido` : "Recebemos seu pedido";
  const preparar = O_QUE_PREPARAR[args.rede] ?? "";
  const texto = [
    `${oi}.`,
    "",
    `Vamos conectar o ${nomeRede} do projeto ${args.projeto} junto com você, numa chamada rápida de 15 minutos. Respondemos este e-mail para combinar o horário.`,
    "",
    "Na chamada, você mesmo entra na sua conta: nunca pedimos a sua senha.",
    preparar ? `Para a chamada: ${preparar}` : "",
    "",
    `Suas redes: ${args.link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  const miolo = [
    titulo(oi + "."),
    paragrafo(
      `Vamos conectar o <strong style="font-weight:600">${escapar(nomeRede)}</strong> do projeto ${escapar(args.projeto)} junto com você, numa chamada rápida de 15 minutos. Respondemos este e-mail para combinar o horário.`
    ),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${[
      item("Você entra na sua conta", "Na chamada, você mesmo digita o login. Nunca pedimos a sua senha."),
      preparar ? item("Tenha à mão", preparar) : "",
    ].join("")}</table>`,
    botao("Ver minhas redes", args.link),
  ].join("\n");
  return {
    para: "",
    assunto: `Conexão do ${nomeRede}: vamos marcar 15 minutos`,
    texto,
    html: casca({ previa: `Conectamos o ${nomeRede} junto com você, numa chamada curta.`, miolo }),
  };
}
