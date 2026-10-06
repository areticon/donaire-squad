import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { emailDeChamadoNovo, emailDeRespostaDoChamado } from "@/lib/email/suporte";
import { contaDoPlano, podeUsarProjetoPorId } from "@/lib/equipe/conta";
import { midiaPrivada } from "@/lib/media/storage";
import { PLANOS_PUBLICOS } from "@/lib/planos";
import { diagnosticarPeca } from "@/lib/suporte/diagnostico";
import { capturarFeedbackDoChamado } from "@/lib/feedback/captura";
import {
  CATEGORIA_DO_DEV,
  RESPOSTA_DO_DEV,
  LIMITE_POR_HORA,
  NOME_DA_CATEGORIA,
  NOME_DO_STATUS,
  PRINT_MAXIMO,
  TEXTO_MAXIMO,
  TEXTO_MINIMO,
  TIPOS_DO_PRINT,
  linkDoWhatsapp,
  protocoloDoChamado,
  type Categoria,
  type ChamadoNaTela,
  type ChamadoNoPainel,
  type ContextoDaTela,
  type StatusDoChamado,
} from "@/lib/suporte/regras";
import { enviarModelo, whatsappLigado } from "@/lib/whatsapp/enviar";
import { numeroDoWhatsapp } from "@/lib/whatsapp/numero";

/**
 * O CHAMADO DE SUPORTE, do lado do servidor (02/10/2026).
 *
 * Pedido para a segunda em que os 10 vendedores da Gaberlini começam: a pessoa
 * pede ajuda em dois cliques, recebe um número (#0012) e pode chamar uma
 * pessoa no WhatsApp com a mensagem já escrita. No começo essa pessoa é o
 * Bruno, e o número vem de SUPORTE_WHATSAPP: sem a variável, o botão não
 * aparece e o chamado continua valendo (e-mail e painel).
 *
 * O AVISO NUNCA DERRUBA O CHAMADO: e-mail e WhatsApp saem depois de o chamado
 * estar gravado, e falha neles vira log, não erro para o cliente (mesma regra
 * de lib/email e lib/whatsapp, que nunca lançam).
 *
 * Só servidor: toca o banco e o storage.
 */

export class RecusaDoChamado extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/** O número do WhatsApp do suporte, no formato da wa.me, ou null. */
export function numeroDoSuporte(): string | null {
  return numeroDoWhatsapp(process.env.SUPORTE_WHATSAPP ?? null);
}

/** Quem recebe o e-mail do chamado: SUPORTE_EMAIL (lista com vírgula) ou os admins. */
async function destinosDoSuporte(): Promise<string[]> {
  const fixo = (process.env.SUPORTE_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fixo.length) return fixo;
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
  return admins.map((a) => a.email).filter(Boolean);
}

function nomeDoPlano(plano: string | null | undefined, role?: string): string {
  if (role === "admin") return "acesso interno";
  return PLANOS_PUBLICOS.find((p) => p.id === plano)?.nome ?? (plano && plano !== "free" ? plano : "sem plano");
}

export type ChamadoCriado = {
  id: string;
  numero: number;
  protocolo: string;
  /** O link wa.me com a mensagem pronta; null sem SUPORTE_WHATSAPP. */
  whatsapp: string | null;
  /** No chamado direto no Dev (06/10): o que o Davi respondeu na hora. */
  respostaDoDev: string | null;
};

export async function criarChamado(args: {
  userId: string;
  categoria: Categoria;
  texto: string;
  codigo?: string | null;
  postId?: string | null;
  contexto?: ContextoDaTela;
  print?: File | null;
}): Promise<ChamadoCriado> {
  const texto = args.texto.trim();
  if (texto.length < TEXTO_MINIMO) throw new RecusaDoChamado("Conte em poucas palavras o que aconteceu.");
  if (texto.length > TEXTO_MAXIMO) throw new RecusaDoChamado(`O texto pode ter até ${TEXTO_MAXIMO} caracteres.`);
  if (args.print) {
    if (!TIPOS_DO_PRINT.includes(args.print.type)) throw new RecusaDoChamado("O print precisa ser PNG, JPG ou WEBP.");
    if (args.print.size > PRINT_MAXIMO) throw new RecusaDoChamado("O print pode ter no máximo 4 MB.");
  }

  // O LIMITE, contado no banco e não em memória: função da Vercel não divide
  // memória entre instâncias (a lição de lib/anti-robo).
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
  const naUltimaHora = await prisma.chamado.count({ where: { userId: args.userId, createdAt: { gt: umaHoraAtras } } });
  if (naUltimaHora >= LIMITE_POR_HORA) {
    throw new RecusaDoChamado(
      `Você já abriu ${LIMITE_POR_HORA} chamados na última hora. Se for urgente, fale com a gente pelo WhatsApp ou responda um chamado aberto.`,
      429
    );
  }

  const eu = await prisma.user.findUniqueOrThrow({ where: { id: args.userId }, select: { email: true, name: true, plan: true, role: true } });
  const pagante = await contaDoPlano(args.userId);
  const plano =
    pagante === args.userId
      ? nomeDoPlano(eu.plan, eu.role)
      : nomeDoPlano((await prisma.user.findUnique({ where: { id: pagante }, select: { plan: true } }))?.plan) + " (equipe)";

  // O que veio da tela só entra se for da pessoa: projeto que ela não enxerga
  // vira nulo, e não um rastro de outra conta no chamado.
  const ctx = args.contexto ?? {};
  let projectId = ctx.projectId && (await podeUsarProjetoPorId(args.userId, ctx.projectId)) ? ctx.projectId : null;
  const postIdPedido = args.postId ?? ctx.postId ?? null;
  const diag = postIdPedido ? await diagnosticarPeca(args.userId, postIdPedido, args.codigo) : null;
  if (diag) projectId = diag.projectId;
  const projeto = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }) : null;
  const codigo = (diag?.codigo ?? args.codigo ?? "").slice(0, 40) || null;

  const contexto = {
    pagina: ctx.pagina?.slice(0, 300) ?? null,
    projeto: projectId ? { id: projectId, nome: projeto?.name ?? null } : null,
    videoId: ctx.videoId?.slice(0, 60) ?? null,
    postId: diag ? postIdPedido : (ctx.postId?.slice(0, 60) ?? null),
    navegador: ctx.navegador?.slice(0, 300) ?? null,
    tela: ctx.tela?.slice(0, 40) ?? null,
    plano,
    email: eu.email,
  };

  const chamado = await prisma.chamado.create({
    data: {
      userId: args.userId,
      categoria: args.categoria,
      texto,
      codigo,
      contexto,
      diagnostico: diag?.diagnostico ?? null,
      projectId,
      postId: diag ? postIdPedido : null,
      videoId: contexto.videoId,
      eventos: { create: { tipo: "aberto", lado: "cliente", autorId: args.userId, autorNome: eu.name ?? eu.email, texto } },
    },
    select: { id: true, numero: true },
  });
  const protocolo = protocoloDoChamado(chamado.numero);

  // O print vai para o store PRIVADO: tela de cliente pode ter dado de cliente.
  let temPrint = false;
  if (args.print) {
    try {
      const destino = midiaPrivada();
      const ext = args.print.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const blob = await put(`suporte/${args.userId}/${chamado.id}.${ext}`, args.print, {
        access: destino.access,
        token: destino.token,
        addRandomSuffix: true,
        contentType: args.print.type,
      });
      await prisma.chamado.update({ where: { id: chamado.id }, data: { printUrl: blob.url } });
      temPrint = true;
    } catch (e) {
      // O chamado vale sem o print; o e-mail diz que ele não subiu.
      console.error(`[suporte] print do chamado ${protocolo} não subiu:`, e);
    }
  }

  if (diag) await diag.marcar(protocolo);

  // O CHAMADO DIRETO NO DEV (06/10): o Davi responde na hora que o pedido
  // entrou na fila de melhoria (texto fixo, sem IA por chamado), e o chamado
  // fica "em andamento" até haver novidade. Todo chamado, de qualquer
  // categoria, vira feedback do produto (classificado pelo JEV, sem travar).
  let respostaDoDev: string | null = null;
  if (args.categoria === CATEGORIA_DO_DEV) {
    respostaDoDev = RESPOSTA_DO_DEV;
    await prisma
      .$transaction([
        prisma.eventoDoChamado.create({ data: { chamadoId: chamado.id, tipo: "resposta", lado: "suporte", autorNome: "Davi Dev", texto: RESPOSTA_DO_DEV } }),
        prisma.eventoDoChamado.create({ data: { chamadoId: chamado.id, tipo: "status", lado: "suporte", autorNome: "Davi Dev", de: "aberto", para: "andamento" } }),
        prisma.chamado.update({ where: { id: chamado.id }, data: { status: "andamento", respondidoEm: new Date() } }),
      ])
      .catch((e) => console.error(`[suporte] resposta do Dev no ${protocolo} não gravou:`, e instanceof Error ? e.message : e));
  }
  void capturarFeedbackDoChamado({
    chamadoId: chamado.id,
    userId: args.userId,
    texto,
    categoria: args.categoria,
    codigo,
    projectId,
    postId: diag ? postIdPedido : null,
    videoId: contexto.videoId,
    pagina: contexto.pagina,
  });

  // Os avisos, depois de gravado. Nenhum deles lança.
  const categoriaNome = NOME_DA_CATEGORIA[args.categoria];
  const linhasDeContexto = [
    `Página: ${contexto.pagina ?? "?"}`,
    contexto.projeto ? `Projeto: ${contexto.projeto.nome ?? "?"} (${contexto.projeto.id})` : "",
    contexto.videoId ? `Vídeo: ${contexto.videoId}` : "",
    contexto.postId ? `Post: ${contexto.postId}` : "",
    `Navegador: ${contexto.navegador ?? "?"}${contexto.tela ? `, tela ${contexto.tela}` : ""}`,
  ].filter(Boolean);
  const email = emailDeChamadoNovo({
    protocolo,
    categoria: categoriaNome,
    cliente: { nome: eu.name, email: eu.email, plano },
    texto,
    codigo,
    contexto: linhasDeContexto,
    diagnostico: diag?.diagnostico ?? null,
    temPrint: Boolean(args.print) && temPrint,
    resumoDoErro: diag ? `${diag.resumo} no projeto ${diag.projectName}` : null,
  });
  const destinos = await destinosDoSuporte().catch(() => []);
  const avisos: Promise<unknown>[] = destinos.map((para) => enviarEmail({ ...email, para }));
  const zap = numeroDoSuporte();
  if (zap && whatsappLigado()) {
    avisos.push(
      enviarModelo({
        para: zap,
        chave: "chamadoTime",
        lado: "time",
        valores: [protocolo, `${eu.name ?? "sem nome"}, ${eu.email}`, categoriaNome, texto.slice(0, 200)],
      })
    );
  }
  await Promise.allSettled(avisos);

  return { id: chamado.id, numero: chamado.numero, protocolo, whatsapp: zap ? linkDoWhatsapp(zap, protocolo, texto) : null, respostaDoDev };
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

/** Os chamados da própria pessoa, sem diagnóstico e sem nota interna. */
export async function chamadosDoUsuario(userId: string): Promise<ChamadoNaTela[]> {
  const lista = await prisma.chamado.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { eventos: { where: { interno: false }, orderBy: { createdAt: "asc" } } },
  });
  return lista.map((c) => ({
    id: c.id,
    protocolo: protocoloDoChamado(c.numero),
    categoria: c.categoria,
    status: c.status,
    texto: c.texto,
    codigo: c.codigo,
    temPrint: Boolean(c.printUrl),
    criadoEm: c.createdAt.toISOString(),
    atualizadoEm: c.updatedAt.toISOString(),
    eventos: c.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      lado: e.lado,
      // Quem respondeu aparece como "Suporte Demandou": o nome do admin é interno.
      autorNome: e.lado === "suporte" ? "Suporte Demandou" : e.autorNome,
      texto: e.texto,
      de: e.de,
      para: e.para,
      em: e.createdAt.toISOString(),
    })),
  }));
}

export async function chamadosDoPainel(filtro: { status?: StatusDoChamado | null; userId?: string | null } = {}): Promise<ChamadoNoPainel[]> {
  const lista = await prisma.chamado.findMany({
    where: { ...(filtro.status ? { status: filtro.status } : {}), ...(filtro.userId ? { userId: filtro.userId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      eventos: { orderBy: { createdAt: "asc" } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return lista.map((c) => ({
    id: c.id,
    numero: c.numero,
    protocolo: protocoloDoChamado(c.numero),
    categoria: c.categoria,
    status: c.status,
    texto: c.texto,
    codigo: c.codigo,
    temPrint: Boolean(c.printUrl),
    criadoEm: c.createdAt.toISOString(),
    atualizadoEm: c.updatedAt.toISOString(),
    reclamacao: c.reclamacao,
    diagnostico: c.diagnostico,
    contexto: c.contexto,
    cliente: { id: c.user.id, nome: c.user.name, email: c.user.email },
    eventos: c.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo + (e.interno ? ":interno" : ""),
      lado: e.lado,
      autorNome: e.autorNome,
      texto: e.texto,
      de: e.de,
      para: e.para,
      em: e.createdAt.toISOString(),
    })),
  }));
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

type Admin = { id: string; email: string };

/**
 * A resposta do suporte: entra no histórico, muda o status (padrão: "em
 * andamento"; "resolvido" quando o admin marca) e vai por e-mail ao cliente.
 */
export async function responderChamado(admin: Admin, id: string, resposta: string, status?: StatusDoChamado | null) {
  const texto = resposta.trim();
  if (texto.length < 2) throw new RecusaDoChamado("Escreva a resposta.");
  const c = await prisma.chamado.findUnique({ where: { id }, include: { user: { select: { email: true, name: true } } } });
  if (!c) throw new RecusaDoChamado("Chamado não encontrado.", 404);
  const novo: StatusDoChamado = status ?? (c.status === "aberto" ? "andamento" : (c.status as StatusDoChamado));
  const agora = new Date();
  await prisma.$transaction([
    prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "resposta", lado: "suporte", autorId: admin.id, autorNome: admin.email, texto } }),
    ...(novo !== c.status
      ? [prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "status", lado: "suporte", autorId: admin.id, autorNome: admin.email, de: c.status, para: novo } })]
      : []),
    prisma.chamado.update({
      where: { id },
      data: { status: novo, respondidoEm: agora, ...(novo === "resolvido" ? { resolvidoEm: agora } : {}) },
    }),
  ]);
  const enviado = await enviarEmail({
    ...emailDeRespostaDoChamado({ nome: c.user.name, protocolo: protocoloDoChamado(c.numero), resposta: texto, status: NOME_DO_STATUS[novo] }),
    para: c.user.email,
  });
  return { status: novo, emailEnviado: enviado };
}

export async function mudarStatusDoChamado(admin: Admin, id: string, status: StatusDoChamado) {
  const c = await prisma.chamado.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new RecusaDoChamado("Chamado não encontrado.", 404);
  if (c.status === status) return { status };
  await prisma.$transaction([
    prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "status", lado: "suporte", autorId: admin.id, autorNome: admin.email, de: c.status, para: status } }),
    prisma.chamado.update({ where: { id }, data: { status, ...(status === "resolvido" ? { resolvidoEm: new Date() } : { resolvidoEm: null }) } }),
  ]);
  return { status };
}

export async function marcarReclamacao(admin: Admin, id: string, reclamacao: boolean) {
  await prisma.$transaction([
    prisma.chamado.update({ where: { id }, data: { reclamacao } }),
    prisma.eventoDoChamado.create({
      data: { chamadoId: id, tipo: "reclamacao", lado: "suporte", autorId: admin.id, autorNome: admin.email, para: reclamacao ? "sim" : "não", interno: true },
    }),
  ]);
  return { reclamacao };
}

export async function notaInterna(admin: Admin, id: string, nota: string) {
  const texto = nota.trim();
  if (!texto) throw new RecusaDoChamado("Escreva a nota.");
  await prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "nota", lado: "suporte", autorId: admin.id, autorNome: admin.email, texto, interno: true } });
  return { ok: true };
}

/**
 * A pessoa complementa o próprio chamado. Chamado resolvido volta a "aberto":
 * se ela escreveu de novo, não estava resolvido para ela. O suporte recebe um
 * e-mail curto.
 */
export async function mensagemDoCliente(userId: string, id: string, mensagem: string) {
  const texto = mensagem.trim();
  if (texto.length < 2) throw new RecusaDoChamado("Escreva a mensagem.");
  if (texto.length > TEXTO_MAXIMO) throw new RecusaDoChamado(`A mensagem pode ter até ${TEXTO_MAXIMO} caracteres.`);
  const c = await prisma.chamado.findFirst({ where: { id, userId }, include: { user: { select: { name: true, email: true } } } });
  if (!c) throw new RecusaDoChamado("Chamado não encontrado.", 404);
  const reabre = c.status === "resolvido";
  await prisma.$transaction([
    prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "mensagem", lado: "cliente", autorId: userId, autorNome: c.user.name ?? c.user.email, texto } }),
    ...(reabre
      ? [prisma.eventoDoChamado.create({ data: { chamadoId: id, tipo: "status", lado: "cliente", autorId: userId, autorNome: c.user.name ?? c.user.email, de: "resolvido", para: "aberto" } })]
      : []),
    prisma.chamado.update({ where: { id }, data: { ...(reabre ? { status: "aberto", resolvidoEm: null } : {}), updatedAt: new Date() } }),
  ]);
  const protocolo = protocoloDoChamado(c.numero);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const destinos = await destinosDoSuporte().catch(() => []);
  await Promise.allSettled(
    destinos.map((para) =>
      enviarEmail({
        para,
        assunto: `Chamado ${protocolo}: nova mensagem de ${c.user.name ?? c.user.email}${reabre ? " (reaberto)" : ""}`,
        texto: [`${c.user.name ?? c.user.email} escreveu no chamado ${protocolo}:`, "", texto, "", `Responder: ${base}/admin/chamados?abrir=${c.numero}`].join("\n"),
      })
    )
  );
  return { status: reabre ? "aberto" : c.status };
}
