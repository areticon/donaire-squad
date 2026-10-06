import { prisma } from "@/lib/db/prisma";
import { compararComABiblioteca, TETO_DE_CANDIDATOS } from "@/lib/biblioteca-de-design/comparacao";
import { escreverFichaDoDesign } from "@/lib/biblioteca-de-design/redator";
import { fichaEstaLimpa, MARCA_DA_RESERVA, separarVisualDoCliente } from "@/lib/biblioteca-de-design/privacidade";
import { sementePorCatalogo } from "@/lib/biblioteca-de-design/semente";
import { filtrarGaleria, podeVerOPedido, semTravessao, TETO, tipoValido, type DesignDaGaleria, type TipoDeDesign, type VereditoDaComparacao } from "@/lib/biblioteca-de-design/tipos";

/**
 * O REGISTRO DA BIBLIOTECA DE DESIGN NO BANCO (06/10/2026).
 *
 * Tabelas `designs_da_biblioteca` e `designs_do_projeto` (prisma/migrations/
 * 20261006030000_biblioteca_de_design). Aqui mora o FLUXO DE ENTRADA de um
 * pedido do cliente:
 *   (a) o JEV compara o pedido com as entradas existentes (igual, variação
 *       ou novo; comparacao.ts);
 *   (b) se novo ou variação, o Claude escreve nome, descrição e linguagem
 *       numa chamada (redator.ts);
 *   (c) grava na biblioteca e liga ao projeto;
 *   (d) `usos += 1` em cada uso real: vídeo planejado com aquele comando,
 *       arte composta naquele modelo.
 * E a LEITURA da galeria: do mais usado ao menos, pública para todos, sem o
 * nome de quem criou (`criadoPorUserId` nunca sai daqui para a tela).
 *
 * PRIVACIDADE (06/10, vazamento): o pedido cru só volta para quem o escreveu
 * (`podeVerOPedido`); a entrada só fica pública quando o JEV separou o visual
 * do dado do cliente e conferiu a ficha escrita (lib/biblioteca-de-design/
 * privacidade.ts). "Só no meu projeto" e a retirada pelo autor deixam
 * `publico` falso. Entrada não pública só aparece para o projeto ou o usuário
 * que a criou, e só pode ser escolhida por eles.
 *
 * Toda contagem de uso engole erro: a biblioteca nunca derruba a esteira
 * (inclusive enquanto a migração não foi aplicada).
 */

type LinhaDoDesign = {
  id: string;
  tipo: string;
  nome: string;
  descricao: string;
  pedidoOriginal: string;
  linguagem: string;
  previaUrl: string | null;
  usos: number;
  origem: string;
  agrupadoEmId: string | null;
  catalogoId: string | null;
  criadoPorProjectId: string | null;
  criadoPorUserId: string | null;
  publico: boolean;
  createdAt: Date;
};

const SELECAO = {
  id: true,
  tipo: true,
  nome: true,
  descricao: true,
  pedidoOriginal: true,
  linguagem: true,
  previaUrl: true,
  usos: true,
  origem: true,
  agrupadoEmId: true,
  catalogoId: true,
  criadoPorProjectId: true,
  criadoPorUserId: true,
  publico: true,
  createdAt: true,
} as const;

/** Quem está olhando: o projeto (já conferido pela rota) e o usuário. */
export type QuemVe = { projectId?: string | null; userId?: string | null };

function ehDoAutor(d: Pick<LinhaDoDesign, "criadoPorProjectId" | "criadoPorUserId">, quem: QuemVe): boolean {
  return Boolean((quem.projectId && d.criadoPorProjectId === quem.projectId) || (quem.userId && d.criadoPorUserId === quem.userId));
}

function paraAGaleria(d: LinhaDoDesign, quem: QuemVe = {}, doProjeto?: Set<string>): DesignDaGaleria {
  const origem = d.origem === "semente" ? "semente" : "cliente";
  const meu = ehDoAutor(d, quem);
  return {
    id: d.id,
    tipo: tipoValido(d.tipo) ? d.tipo : "imagem",
    nome: d.nome,
    descricao: d.descricao,
    // O pedido cru só para quem o escreveu (ou da semente): pode ter marca, nome, rosto ou contato.
    pedidoOriginal: podeVerOPedido({ origem, meu }) ? d.pedidoOriginal : "",
    linguagem: d.linguagem,
    previaUrl: d.previaUrl,
    usos: d.usos,
    origem,
    agrupadoEmId: d.agrupadoEmId,
    catalogoId: d.catalogoId,
    doProjeto: doProjeto ? doProjeto.has(d.id) : undefined,
    meu: quem.projectId || quem.userId ? meu : undefined,
    publico: d.publico,
    createdAt: d.createdAt.toISOString(),
  };
}

/** A galeria: pública mais o que é deste projeto ou deste usuário, do mais usado ao menos. */
export async function listarBiblioteca(o: { tipo?: TipoDeDesign | "todos"; busca?: string; projectId?: string | null; userId?: string | null; teto?: number }): Promise<DesignDaGaleria[]> {
  const tipo = o.tipo && o.tipo !== "todos" ? o.tipo : undefined;
  const linhas = await prisma.designDaBiblioteca.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      OR: [{ publico: true }, ...(o.projectId ? [{ criadoPorProjectId: o.projectId }] : []), ...(o.userId ? [{ criadoPorUserId: o.userId }] : [])],
    },
    orderBy: [{ usos: "desc" }, { createdAt: "desc" }],
    take: o.teto ?? 400,
    select: SELECAO,
  });
  const doProjeto = o.projectId ? new Set((await prisma.designDoProjeto.findMany({ where: { projectId: o.projectId }, select: { designId: true } })).map((x) => x.designId)) : undefined;
  const lista = linhas.map((d) => paraAGaleria(d, { projectId: o.projectId, userId: o.userId }, doProjeto));
  return o.busca ? filtrarGaleria(lista, "todos", o.busca) : lista;
}

/** Um design, só se quem pede pode vê-lo: público, ou criado por este projeto ou usuário. */
export async function lerDesign(id: string, quem: QuemVe = {}): Promise<DesignDaGaleria | null> {
  const d = await prisma.designDaBiblioteca.findUnique({ where: { id }, select: SELECAO });
  if (!d || (!d.publico && !ehDoAutor(d, quem))) return null;
  return paraAGaleria(d, quem);
}

/**
 * A entrada da semente de um id do catálogo, criada na hora se o script da
 * semente ainda não rodou: escolher uma miniatura de estilo ou um modelo do
 * book sempre tem onde contar o uso.
 */
export async function garantirSemente(tipo: TipoDeDesign, catalogoId: string): Promise<LinhaDoDesign | null> {
  const existente = await prisma.designDaBiblioteca.findUnique({ where: { tipo_catalogoId: { tipo, catalogoId } }, select: SELECAO });
  if (existente) return existente;
  const s = sementePorCatalogo(tipo, catalogoId);
  if (!s) return null;
  return prisma.designDaBiblioteca.upsert({
    where: { tipo_catalogoId: { tipo, catalogoId } },
    create: { tipo, catalogoId, nome: s.nome, descricao: s.descricao, pedidoOriginal: s.pedidoOriginal, linguagem: s.linguagem, previaUrl: s.previaUrl, origem: "semente", publico: true },
    update: {},
    select: SELECAO,
  });
}

export type ComoEntrou = "pedido" | "escolhido" | "referencia";

/** Liga (ou religa) um design ao projeto; a ligação mais recente é "o design atual" daquele tipo. */
export async function ligarAoProjeto(o: { projectId: string; designId: string; tipo: TipoDeDesign; comoEntrou: ComoEntrou }): Promise<void> {
  await prisma.designDoProjeto.upsert({
    where: { projectId_designId: { projectId: o.projectId, designId: o.designId } },
    create: { projectId: o.projectId, designId: o.designId, tipo: o.tipo, comoEntrou: o.comoEntrou },
    update: { comoEntrou: o.comoEntrou, updatedAt: new Date() },
  });
}

/** Por que a entrada ficou só no projeto (null quando entrou na galeria). */
export type MotivoDeFicarNoProjeto = "pedido-do-cliente" | "so-dado-do-cliente" | "ficha-com-dado-do-cliente" | "sem-conferencia" | null;

export type ResultadoDoPedido = { design: DesignDaGaleria; veredito: VereditoDaComparacao["veredito"] | "repetido"; fichaPor?: "redator" | "reserva"; soNoProjeto?: MotivoDeFicarNoProjeto };

/**
 * O FLUXO DE ENTRADA de um pedido escrito pelo cliente (o campo livre do
 * comando de vídeo, o pedido de arte). Null quando o texto é curto demais.
 */
export async function registrarPedidoDeDesign(o: { projectId: string; userId: string; tipo: TipoDeDesign; pedido: string; nicho?: string | null; publico?: string | null; soNoMeuProjeto?: boolean }): Promise<ResultadoDoPedido | null> {
  const quem: QuemVe = { projectId: o.projectId, userId: o.userId };
  const pedido = semTravessao(o.pedido).slice(0, TETO.pedido);
  if (pedido.length < 12) return null;

  // O mesmo texto de novo (o cliente só trocou a letra ou as cores): nada de IA, só religa.
  const repetido = await prisma.designDoProjeto.findFirst({
    where: { projectId: o.projectId, tipo: o.tipo, design: { pedidoOriginal: pedido } },
    select: { designId: true },
    orderBy: { updatedAt: "desc" },
  });
  if (repetido) {
    await ligarAoProjeto({ projectId: o.projectId, designId: repetido.designId, tipo: o.tipo, comoEntrou: "pedido" });
    const d = await lerDesign(repetido.designId, quem);
    return d ? { design: d, veredito: "repetido" } : null;
  }

  // (a) O JEV compara com as entradas mais usadas do tipo.
  const candidatos = await prisma.designDaBiblioteca.findMany({
    where: { tipo: o.tipo, OR: [{ publico: true }, { criadoPorProjectId: o.projectId }] },
    orderBy: [{ usos: "desc" }, { createdAt: "desc" }],
    take: TETO_DE_CANDIDATOS,
    select: { id: true, nome: true, descricao: true, linguagem: true },
  });
  const veredito = await compararComABiblioteca({ tipo: o.tipo, pedido, candidatos, projectId: o.projectId });

  if (veredito.veredito === "igual") {
    await ligarAoProjeto({ projectId: o.projectId, designId: veredito.designId, tipo: o.tipo, comoEntrou: "pedido" });
    const d = await lerDesign(veredito.designId, quem);
    return d ? { design: d, veredito: "igual" } : null;
  }

  // (b) PRIVACIDADE: o JEV separa os trechos que são só visual dos que são do
  // cliente; a ficha pública é escrita só com os visuais. "Só no meu projeto"
  // pula a separação: a ficha sai do pedido inteiro e não vai para a galeria.
  const separacao = o.soNoMeuProjeto ? null : await separarVisualDoCliente({ pedido, projectId: o.projectId });
  const candidataAGaleria = Boolean(separacao?.peloJev && separacao.visual.length);
  const textoDaFicha = candidataAGaleria && separacao ? separacao.visual.join(". ") : pedido;

  // (c) O Claude escreve a ficha (nome, descrição, linguagem), uma chamada. Na candidata à galeria, sem o nicho e o público do projeto.
  const referencia = veredito.veredito === "variacao" ? candidatos.find((c) => c.id === veredito.designId) ?? null : null;
  const { ficha, origem } = await escreverFichaDoDesign({ tipo: o.tipo, pedido: textoDaFicha, nicho: candidataAGaleria ? null : o.nicho, publico: candidataAGaleria ? null : o.publico, variacaoDe: referencia, projectId: o.projectId });

  // (d) O JEV confere a ficha escrita antes de publicar. A reserva copia o pedido cru: nunca é pública.
  let soNoProjeto: MotivoDeFicarNoProjeto = null;
  if (o.soNoMeuProjeto) soNoProjeto = "pedido-do-cliente";
  else if (!separacao?.peloJev) soNoProjeto = "sem-conferencia";
  else if (!separacao.visual.length) soNoProjeto = "so-dado-do-cliente";
  else if (origem !== "redator" || ficha.linguagem.includes(MARCA_DA_RESERVA)) soNoProjeto = "sem-conferencia";
  else if (!(await fichaEstaLimpa({ ...ficha, projectId: o.projectId }))) soNoProjeto = "ficha-com-dado-do-cliente";

  // (e) Grava e liga ao projeto. O nome do cliente nunca entra na linha.
  const criado = await prisma.designDaBiblioteca.create({
    data: {
      tipo: o.tipo,
      nome: ficha.nome,
      descricao: ficha.descricao,
      pedidoOriginal: pedido,
      linguagem: ficha.linguagem,
      origem: "cliente",
      publico: soNoProjeto === null,
      criadoPorProjectId: o.projectId,
      criadoPorUserId: o.userId,
      agrupadoEmId: referencia?.id ?? null,
    },
    select: SELECAO,
  });
  await ligarAoProjeto({ projectId: o.projectId, designId: criado.id, tipo: o.tipo, comoEntrou: "pedido" });
  return { design: paraAGaleria(criado, quem, new Set([criado.id])), veredito: veredito.veredito, fichaPor: origem, soNoProjeto };
}

/**
 * O AUTOR TIRA (OU DEVOLVE) O DESIGN DA GALERIA. Tirar é sempre permitido ao
 * projeto que criou. Devolver passa de novo pela conferência do JEV na ficha
 * (a ficha de reserva, que copia o pedido cru, nunca volta). Quem já escolheu
 * o design continua com ele no projeto; só some da galeria dos outros.
 */
export async function mudarVisibilidadeNaGaleria(o: { projectId: string; designId: string; publico: boolean }): Promise<{ ok: true; publico: boolean } | { ok: false; erro: string }> {
  const d = await prisma.designDaBiblioteca.findUnique({ where: { id: o.designId }, select: SELECAO });
  if (!d || d.origem !== "cliente" || d.criadoPorProjectId !== o.projectId) return { ok: false, erro: "Só o projeto que pediu este design pode mudar onde ele aparece." };
  if (!o.publico) {
    await prisma.designDaBiblioteca.update({ where: { id: d.id }, data: { publico: false } });
    return { ok: true, publico: false };
  }
  if (d.linguagem.includes(MARCA_DA_RESERVA)) return { ok: false, erro: "Este design foi registrado sem a ficha da IA e fica só no seu projeto. Escreva o pedido de novo para ele entrar na galeria." };
  if (!(await fichaEstaLimpa({ nome: d.nome, descricao: d.descricao, linguagem: d.linguagem, projectId: o.projectId }))) {
    return { ok: false, erro: "A ficha deste design cita algo da sua marca ou de alguém, então ele fica só no seu projeto." };
  }
  await prisma.designDaBiblioteca.update({ where: { id: d.id }, data: { publico: true } });
  return { ok: true, publico: true };
}

/** A miniatura de estilo ou o modelo do book escolhido: liga a semente ao projeto. */
export async function ligarCatalogoAoProjeto(o: { projectId: string; tipo: TipoDeDesign; catalogoId: string; comoEntrou?: ComoEntrou }): Promise<DesignDaGaleria | null> {
  const s = await garantirSemente(o.tipo, o.catalogoId);
  if (!s) return null;
  await ligarAoProjeto({ projectId: o.projectId, designId: s.id, tipo: o.tipo, comoEntrou: o.comoEntrou ?? "referencia" });
  return paraAGaleria(s, { projectId: o.projectId }, new Set([s.id]));
}

/** O design atual do projeto naquele tipo: a ligação mais recente. */
export async function designAtualDoProjeto(projectId: string, tipo: TipoDeDesign): Promise<DesignDaGaleria | null> {
  const elo = await prisma.designDoProjeto.findFirst({ where: { projectId, tipo }, orderBy: { updatedAt: "desc" }, select: { design: { select: SELECAO } } }).catch(() => null);
  return elo ? paraAGaleria(elo.design, { projectId }, new Set([elo.design.id])) : null;
}

/**
 * A LINGUAGEM DO DESIGN ATUAL DO PROJETO para o editor (card 714): a do
 * design ligado mais recente naquele tipo, só quando a ligação é tão nova
 * quanto o comando (`desde`, o atualizadoEm do comando gravado): a rota do
 * comando liga o design logo depois de gravar o texto, e um design mais
 * velho que o comando é de outro texto. Null sem ligação, sem banco ou
 * com a ligação velha; nunca lança.
 */
export async function linguagemDoDesignAtual(projectId: string | null | undefined, tipo: TipoDeDesign, desde?: string | null): Promise<{ linguagem: string; nome: string; catalogoId: string | null } | null> {
  if (!projectId) return null;
  try {
    const elo = await prisma.designDoProjeto.findFirst({ where: { projectId, tipo }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, design: { select: { linguagem: true, nome: true, catalogoId: true } } } });
    if (!elo?.design?.linguagem) return null;
    const corte = desde ? Date.parse(desde) : NaN;
    if (!Number.isFinite(corte) || elo.updatedAt.getTime() < corte) return null;
    return { linguagem: elo.design.linguagem, nome: elo.design.nome, catalogoId: elo.design.catalogoId ?? null };
  } catch {
    return null;
  }
}

/** Os designs deste projeto, os mais recentes primeiro. */
export async function designsDoProjeto(projectId: string): Promise<DesignDaGaleria[]> {
  const elos = await prisma.designDoProjeto.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, select: { design: { select: SELECAO } } }).catch(() => []);
  const ids = new Set(elos.map((e) => e.design.id));
  return elos.map((e) => paraAGaleria(e.design, { projectId }, ids));
}

/**
 * O DESIGN DE IMAGEM MAIS RECENTE DO PROJETO, com a hora em que foi ligado
 * (06/10, tarde): a marca da peça decide por ele se as artes saem no modelo
 * por prompt do cliente (lib/modelos-de-arte/modelo-do-cliente.ts).
 */
export async function designDeImagemMaisRecente(projectId: string): Promise<{ design: DesignDaGaleria; ligadoEm: Date } | null> {
  const elo = await prisma.designDoProjeto
    .findFirst({ where: { projectId, tipo: "imagem" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, design: { select: SELECAO } } })
    .catch(() => null);
  return elo?.design ? { design: paraAGaleria(elo.design, { projectId }), ligadoEm: elo.updatedAt } : null;
}

/** (d) Um uso real do design do cliente numa arte: conta no design e no elo do projeto, uma vez por frase. */
export async function contarUsoDoDesign(o: { designId: string; projectId?: string | null; chave: string }): Promise<void> {
  if (jaContado(`${o.projectId ?? "-"}|design|${o.designId}|${o.chave}`)) return;
  try {
    await prisma.designDaBiblioteca.update({ where: { id: o.designId }, data: { usos: { increment: 1 } } });
    if (o.projectId) await prisma.designDoProjeto.updateMany({ where: { projectId: o.projectId, designId: o.designId }, data: { usos: { increment: 1 } } });
  } catch (e) {
    console.warn("[biblioteca-de-design] uso do design não contado:", e instanceof Error ? e.message.slice(0, 120) : e);
  }
}

// ─────────────────────────────── os usos ───────────────────────────────

/** A mesma campanha ou o mesmo vídeo não conta duas vezes neste processo. */
const USOS_CONTADOS = new Set<string>();
function jaContado(chave: string): boolean {
  if (USOS_CONTADOS.has(chave)) return true;
  USOS_CONTADOS.add(chave);
  if (USOS_CONTADOS.size > 2000) USOS_CONTADOS.delete(USOS_CONTADOS.values().next().value as string);
  return false;
}

/**
 * (d) Um uso real do design atual do projeto naquele tipo (o vídeo planejado
 * pelo comando). `chave` identifica o uso (o id do vídeo), para contar uma
 * vez por vídeo e não por corte.
 */
export async function contarUsoDoDesignDoProjeto(projectId: string | null | undefined, tipo: TipoDeDesign, chave: string): Promise<void> {
  if (!projectId || jaContado(`${projectId}|${tipo}|${chave}`)) return;
  try {
    const elo = await prisma.designDoProjeto.findFirst({ where: { projectId, tipo }, orderBy: { updatedAt: "desc" }, select: { id: true, designId: true } });
    if (!elo) return;
    await prisma.$transaction([
      prisma.designDaBiblioteca.update({ where: { id: elo.designId }, data: { usos: { increment: 1 } } }),
      prisma.designDoProjeto.update({ where: { id: elo.id }, data: { usos: { increment: 1 } } }),
    ]);
  } catch (e) {
    console.warn("[biblioteca-de-design] uso não contado:", e instanceof Error ? e.message.slice(0, 120) : e);
  }
}

/**
 * (d) Um uso real de um modelo do book (a arte composta naquele molde): conta
 * na semente daquele modelo e, se o projeto a tem ligada, no elo. A chave é
 * a frase da arte, para o carrossel de 5 lâminas contar uma vez.
 */
export async function contarUsoDoCatalogo(o: { tipo: TipoDeDesign; catalogoId: string; projectId?: string | null; chave: string }): Promise<void> {
  if (jaContado(`${o.projectId ?? "-"}|${o.tipo}|${o.catalogoId}|${o.chave}`)) return;
  try {
    const s = await garantirSemente(o.tipo, o.catalogoId);
    if (!s) return;
    await prisma.designDaBiblioteca.update({ where: { id: s.id }, data: { usos: { increment: 1 } } });
    if (o.projectId) await prisma.designDoProjeto.updateMany({ where: { projectId: o.projectId, designId: s.id }, data: { usos: { increment: 1 } } });
  } catch (e) {
    console.warn("[biblioteca-de-design] uso do catálogo não contado:", e instanceof Error ? e.message.slice(0, 120) : e);
  }
}
