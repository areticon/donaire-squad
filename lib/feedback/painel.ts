import { prisma } from "@/lib/db/prisma";
import type { Admin } from "@/lib/admin/acoes";
import { escreverBriefing } from "@/lib/feedback/briefing";
import {
  contarPorGrupo,
  melhoraOProduto,
  ordemDoPainel,
  semEmail,
  type Classificacao,
  type Contagem,
  type ContagemDoGrupo,
  type ContextoDoFeedback,
  type SituacaoDoGrupo,
} from "@/lib/feedback/regras";

/**
 * O PAINEL "DEV: O QUE OS CLIENTES ESTÃO PEDINDO" (06/10/2026), lado do servidor.
 *
 * Lista por grupo, com a contagem de clientes e de ocorrências na semana e no
 * mês, a classificação do JEV, os exemplos (texto do cliente, sem nome), e as
 * duas ações do admin: "Aprovar melhoria" (grava quem aprovou e quando, e o
 * Davi Dev escreve o briefing) e "Não é produto" (descarta). Só admin, pela
 * rota /api/admin/dev/[id].
 */

export type ExemploNoPainel = {
  id: string;
  texto: string;
  origem: string;
  quando: string;
  tipoDePeca: string | null;
  resposta: string | null;
  resultado: string | null;
  confianca: number | null;
};

export type GrupoNoPainel = {
  id: string;
  titulo: string;
  classificacao: string;
  situacao: string;
  briefing: string | null;
  aprovadoEm: string | null;
  criadoEm: string;
  semana: Contagem;
  mes: Contagem;
  total: Contagem;
  ultimoEm: string | null;
  modulos: string[];
  exemplos: ExemploNoPainel[];
};

export type PedidosAoDev = {
  grupos: GrupoNoPainel[];
  semClasse: ExemploNoPainel[];
  resumo: {
    semana: { feedbacks: number; clientes: number; errosDoProduto: number };
    mes: { feedbacks: number; clientes: number; errosDoProduto: number };
    aguardando: number;
    aprovados: number;
  };
};

const VAZIA: Contagem = { clientes: 0, ocorrencias: 0 };

function exemplo(f: { id: string; texto: string; origem: string; criadoEm: Date; contexto: unknown; confianca: number | null }): ExemploNoPainel {
  const c = (f.contexto as ContextoDoFeedback | null) ?? {};
  return {
    id: f.id,
    texto: semEmail(f.texto).slice(0, 600),
    origem: f.origem,
    quando: f.criadoEm.toISOString(),
    tipoDePeca: c.tipoDePeca ?? null,
    resposta: c.respostaDaPlataforma ? semEmail(c.respostaDaPlataforma).slice(0, 400) : null,
    resultado: c.resultado ?? null,
    confianca: f.confianca,
  };
}

export async function pedidosAoDev(agora = new Date()): Promise<PedidosAoDev> {
  const desde = new Date(agora.getTime() - 90 * 86_400_000);
  const [grupos, feedbacks] = await Promise.all([
    prisma.grupoDeFeedback.findMany({ orderBy: { atualizadoEm: "desc" }, take: 200 }),
    prisma.feedbackDoProduto.findMany({
      where: { criadoEm: { gte: desde } },
      orderBy: { criadoEm: "desc" },
      select: { id: true, texto: true, origem: true, criadoEm: true, contexto: true, confianca: true, classificacao: true, grupoId: true, userId: true },
    }),
  ]);
  const contagens = contarPorGrupo(feedbacks, agora);
  const porGrupo = new Map<string, typeof feedbacks>();
  for (const f of feedbacks) {
    if (!f.grupoId) continue;
    const l = porGrupo.get(f.grupoId) ?? [];
    l.push(f);
    porGrupo.set(f.grupoId, l);
  }
  const lista: GrupoNoPainel[] = grupos.map((g) => {
    const c: ContagemDoGrupo = contagens.get(g.id) ?? { semana: VAZIA, mes: VAZIA, total: VAZIA, ultimoEm: null };
    const meus = porGrupo.get(g.id) ?? [];
    const modulos = [...new Set(meus.flatMap((f) => ((f.contexto as ContextoDoFeedback | null)?.modulos ?? []) as string[]))];
    return {
      id: g.id,
      titulo: g.titulo,
      classificacao: g.classificacao,
      situacao: g.situacao,
      briefing: g.briefing,
      aprovadoEm: g.aprovadoEm?.toISOString() ?? null,
      criadoEm: g.criadoEm.toISOString(),
      semana: c.semana,
      mes: c.mes,
      total: c.total,
      ultimoEm: c.ultimoEm?.toISOString() ?? null,
      modulos,
      exemplos: meus.slice(0, 5).map(exemplo),
    };
  });
  lista.sort(ordemDoPainel);

  const semanaDesde = agora.getTime() - 7 * 86_400_000;
  const mesDesde = agora.getTime() - 30 * 86_400_000;
  const daSemana = feedbacks.filter((f) => f.criadoEm.getTime() >= semanaDesde);
  const doMes = feedbacks.filter((f) => f.criadoEm.getTime() >= mesDesde);
  const resumoDe = (l: typeof feedbacks) => ({
    feedbacks: l.length,
    clientes: new Set(l.map((f) => f.userId)).size,
    errosDoProduto: l.filter((f) => melhoraOProduto(f.classificacao)).length,
  });
  return {
    grupos: lista,
    semClasse: feedbacks.filter((f) => !f.classificacao).slice(0, 10).map(exemplo),
    resumo: {
      semana: resumoDe(daSemana),
      mes: resumoDe(doMes),
      aguardando: lista.filter((g) => g.situacao === "aberto" && melhoraOProduto(g.classificacao)).length,
      aprovados: lista.filter((g) => g.situacao === "aprovado").length,
    },
  };
}

export class RecusaDoDev extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

/**
 * "Aprovar melhoria": grava a aprovação do admin e o Davi Dev escreve o
 * briefing. Se o modelo falhar, a aprovação fica e o briefing pode ser
 * pedido de novo ("briefing"). Nenhum código é editado por aqui.
 */
export async function aprovarMelhoria(admin: Admin, grupoId: string): Promise<{ situacao: SituacaoDoGrupo; briefing: string | null }> {
  const g = await prisma.grupoDeFeedback.findUnique({ where: { id: grupoId }, select: { id: true, situacao: true } });
  if (!g) throw new RecusaDoDev("Grupo não encontrado.", 404);
  await prisma.grupoDeFeedback.update({ where: { id: grupoId }, data: { situacao: "aprovado", aprovadoPorId: admin.id, aprovadoEm: new Date() } });
  const briefing = await gerarBriefing(grupoId).catch((e) => {
    console.error("[feedback] briefing não saiu (a aprovação ficou):", e instanceof Error ? e.message : e);
    return null;
  });
  return { situacao: "aprovado", briefing };
}

/** O Davi Dev escreve (ou reescreve) o briefing de um grupo aprovado. */
export async function gerarBriefing(grupoId: string): Promise<string> {
  const g = await prisma.grupoDeFeedback.findUnique({
    where: { id: grupoId },
    include: { feedbacks: { orderBy: { criadoEm: "desc" }, take: 6, select: { texto: true, origem: true, contexto: true, userId: true } } },
  });
  if (!g) throw new RecusaDoDev("Grupo não encontrado.", 404);
  if (g.situacao !== "aprovado") throw new RecusaDoDev("Só grupo aprovado ganha briefing.");
  const briefing = await escreverBriefing({
    titulo: g.titulo,
    classificacao: g.classificacao as Classificacao,
    exemplos: g.feedbacks.map((f) => ({ texto: f.texto, origem: f.origem, contexto: (f.contexto as ContextoDoFeedback | null) ?? null })),
    contagem: { clientes: new Set(g.feedbacks.map((f) => f.userId)).size, ocorrencias: g.feedbacks.length },
  });
  await prisma.grupoDeFeedback.update({ where: { id: grupoId }, data: { briefing } });
  return briefing;
}

/** "Não é produto": descarta o grupo (fica registrado, sai da fila). */
export async function descartarGrupo(admin: Admin, grupoId: string): Promise<{ situacao: SituacaoDoGrupo }> {
  const g = await prisma.grupoDeFeedback.findUnique({ where: { id: grupoId }, select: { id: true } });
  if (!g) throw new RecusaDoDev("Grupo não encontrado.", 404);
  await prisma.grupoDeFeedback.update({ where: { id: grupoId }, data: { situacao: "nao_e_produto", aprovadoPorId: admin.id, aprovadoEm: null, briefing: null } });
  return { situacao: "nao_e_produto" };
}

/** Marca como feito (depois que o HANDOFF executou o briefing) ou reabre. */
export async function mudarSituacaoDoGrupo(admin: Admin, grupoId: string, situacao: "feito" | "aberto"): Promise<{ situacao: SituacaoDoGrupo }> {
  void admin;
  const g = await prisma.grupoDeFeedback.findUnique({ where: { id: grupoId }, select: { id: true } });
  if (!g) throw new RecusaDoDev("Grupo não encontrado.", 404);
  await prisma.grupoDeFeedback.update({ where: { id: grupoId }, data: { situacao } });
  return { situacao };
}

/**
 * DADOS DE EXEMPLO para olhar a tela antes de a migração existir (só fora de
 * produção, por ?exemplo=1). Nenhum nome de cliente; os textos são os casos
 * do pedido do Bruno.
 */
export function dadosDeExemplo(agora = new Date()): PedidosAoDev {
  const ha = (horas: number) => new Date(agora.getTime() - horas * 3_600_000).toISOString();
  const ex = (id: string, texto: string, horas: number, extra: Partial<ExemploNoPainel> = {}): ExemploNoPainel => ({
    id,
    texto,
    origem: "chat",
    quando: ha(horas),
    tipoDePeca: "corte de vídeo",
    resposta: null,
    resultado: null,
    confianca: 0.9,
    ...extra,
  });
  const grupos: GrupoNoPainel[] = [
    {
      id: "ex-sincronia",
      titulo: "O áudio está descasado da boca a partir do meio do vídeo",
      classificacao: "erro_do_produto",
      situacao: "aberto",
      briefing: null,
      aprovadoEm: null,
      criadoEm: ha(130),
      semana: { clientes: 5, ocorrencias: 7 },
      mes: { clientes: 6, ocorrencias: 9 },
      total: { clientes: 6, ocorrencias: 9 },
      ultimoEm: ha(3),
      modulos: ["lib/media/montagem-do-completo.ts", "worker/src/edicao-sob-medida.mjs"],
      exemplos: [
        ex("f1", "O áudio está descasado da boca a partir do meio do vídeo, uns 8 minutos pra frente.", 3, { tipoDePeca: "vídeo completo", resposta: "Refiz a montagem do completo a partir da base original.", resultado: "feito" }),
        ex("f2", "a voz não bate com a imagem no final do corte 2", 20, { resposta: "Pedi o corte de novo com a sincronia por índice de quadro.", resultado: "feito" }),
        ex("f3", "No vídeo completo a boca fala antes do som.", 44, { origem: "chamado", tipoDePeca: "chamado" }),
      ],
    },
    {
      id: "ex-destaque",
      titulo: "A palavra de destaque não aparece no momento exato em que eu falo",
      classificacao: "erro_do_produto",
      situacao: "aberto",
      briefing: null,
      aprovadoEm: null,
      criadoEm: ha(100),
      semana: { clientes: 3, ocorrencias: 3 },
      mes: { clientes: 3, ocorrencias: 4 },
      total: { clientes: 3, ocorrencias: 4 },
      ultimoEm: ha(9),
      modulos: ["worker/remotion/src/sob-medida", "lib/media/editor-por-comando"],
      exemplos: [
        ex("f4", "A palavra de destaque aparece meio segundo depois de eu falar, dá pra ver que está atrasada.", 9, { resposta: "Refiz o corte.", resultado: "feito" }),
        ex("f5", "o destaque 'FÉ' entra antes da hora", 30),
      ],
    },
    {
      id: "ex-cortado",
      titulo: "O texto do título saiu cortado na lateral do carrossel",
      classificacao: "erro_do_produto",
      situacao: "aprovado",
      briefing:
        "O que o cliente vê\nO título da lâmina 2 do carrossel termina fora da área visível: a última palavra some na borda direita.\n\nO que deveria ver\nO título inteiro dentro da área segura da lâmina, com quebra de linha quando não cabe.\n\nOnde no código provavelmente está\nlib/media/arte-com-frase.ts (desenharComFraseEmCodigo): a medida da largura do texto usa a fonte padrão e não a fonte do modelo, então a quebra acontece tarde demais. Olhar depois lib/modelos-de-arte/ajustes-da-peca.ts, que desloca o título sem reconferir a largura.\n\nComo provar\nTeste puro com a frase dos exemplos e a fonte do modelo: a caixa medida tem que caber em 1080 menos as margens. Depois, gerar a lâmina 2 com os mesmos parâmetros e medir a última coluna de pixels com texto.",
      aprovadoEm: ha(28),
      criadoEm: ha(160),
      semana: { clientes: 2, ocorrencias: 2 },
      mes: { clientes: 4, ocorrencias: 5 },
      total: { clientes: 4, ocorrencias: 5 },
      ultimoEm: ha(31),
      modulos: ["lib/media/arte-com-frase.ts", "lib/modelos-de-arte"],
      exemplos: [ex("f6", "o título da segunda lâmina está cortado na direita", 31, { tipoDePeca: "carrossel", resposta: "Refiz a lâmina 2.", resultado: "feito" })],
    },
    {
      id: "ex-cor",
      titulo: "A letra apareceu vermelha mas eu queria rosa",
      classificacao: "atendido_como_pedido",
      situacao: "aberto",
      briefing: null,
      aprovadoEm: null,
      criadoEm: ha(50),
      semana: { clientes: 1, ocorrencias: 1 },
      mes: { clientes: 1, ocorrencias: 1 },
      total: { clientes: 1, ocorrencias: 1 },
      ultimoEm: ha(50),
      modulos: ["lib/media/pedido-do-card.ts"],
      exemplos: [ex("f7", "A letra apareceu vermelha mas eu queria rosa.", 50, { tipoDePeca: "imagem", resposta: "Refiz a arte com o rosa #E91E63 como cor de destaque.", resultado: "feito" })],
    },
    {
      id: "ex-gosto",
      titulo: "Troca 'minha preta' por 'minha amiga' na legenda",
      classificacao: "pedido_de_gosto",
      situacao: "nao_e_produto",
      briefing: null,
      aprovadoEm: null,
      criadoEm: ha(70),
      semana: { clientes: 1, ocorrencias: 1 },
      mes: { clientes: 1, ocorrencias: 1 },
      total: { clientes: 1, ocorrencias: 1 },
      ultimoEm: ha(70),
      modulos: ["lib/media/pedido-do-card.ts"],
      exemplos: [ex("f8", "troca 'minha preta' por 'minha amiga' na legenda", 70, { tipoDePeca: "post de texto", resposta: "Tirei o 'minha preta' da legenda.", resultado: "feito" })],
    },
    {
      id: "ex-duvida",
      titulo: "Como eu troco o dia de publicação do post de sexta?",
      classificacao: "duvida_de_uso",
      situacao: "aberto",
      briefing: null,
      aprovadoEm: null,
      criadoEm: ha(12),
      semana: { clientes: 2, ocorrencias: 2 },
      mes: { clientes: 2, ocorrencias: 2 },
      total: { clientes: 2, ocorrencias: 2 },
      ultimoEm: ha(12),
      modulos: ["app/(app)", "lib/suporte"],
      exemplos: [ex("f9", "Como eu troco o dia de publicação do post de sexta?", 12, { origem: "chamado", tipoDePeca: "chamado" })],
    },
  ];
  grupos.sort(ordemDoPainel);
  return {
    grupos,
    semClasse: [ex("f10", "ficou estranho", 5, { confianca: 0.31, tipoDePeca: "imagem" })],
    resumo: {
      semana: { feedbacks: 16, clientes: 9, errosDoProduto: 12 },
      mes: { feedbacks: 22, clientes: 11, errosDoProduto: 17 },
      aguardando: 2,
      aprovados: 1,
    },
  };
}
