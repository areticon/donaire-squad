import { prisma } from "@/lib/db/prisma";
import { montarCerebro, notasDoCliente, type FontesDoCerebro } from "@/lib/cerebro/montagem";
import type { CerebroNaTela, NotaDoCerebro } from "@/lib/cerebro/tipos";

/**
 * A LEITURA DAS FONTES DO CÉREBRO (06/10/2026). Só SELECT: o cérebro lê os
 * lugares onde cada coisa já mora e não grava nada aqui.
 *
 * Tabela nova que ainda não foi migrada num banco (o feedback do produto e a
 * biblioteca de design são de 06/10) vira lista vazia, e o cérebro mostra o
 * resto: uma fonte faltando nunca derruba a tela.
 *
 * Só servidor.
 */

/** Os tipos de ProjectMemory que o cérebro lê (o resto é estado interno da esteira). */
export const TIPOS_DE_MEMORIA_DO_CEREBRO = ["regra", "restricao", "preference", "rejection", "vera-pedido", "cerebro"];

async function ouVazio<T>(nome: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (e) {
    console.warn(`[cerebro] fonte ${nome} indisponível (fica de fora): ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

export async function carregarFontes(projectId: string): Promise<FontesDoCerebro | null> {
  const projeto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, voice: true, niche: true, targetAudience: true, colorPalette: true, videoStyle: true, capaEstilo: true, updatedAt: true },
  });
  if (!projeto) return null;
  const [memorias, contextos, materiais, referencias, feedbacks, designs, roteiros] = await Promise.all([
    ouVazio(
      "memorias",
      prisma.projectMemory.findMany({
        where: { projectId, type: { in: TIPOS_DE_MEMORIA_DO_CEREBRO } },
        orderBy: { updatedAt: "desc" },
        take: 3000,
        select: { type: true, key: true, value: true, metadata: true, createdAt: true, updatedAt: true },
      })
    ),
    ouVazio(
      "contextos",
      prisma.projectContext.findMany({ where: { projectId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, type: true, title: true, compiled: true, status: true, updatedAt: true } })
    ),
    ouVazio(
      "materiais",
      prisma.materialDoCliente.findMany({
        where: { projectId, status: "pronto" },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { id: true, tipo: true, nome: true, descricao: true, etiquetas: true, status: true, createdAt: true },
      })
    ),
    ouVazio(
      "referencias",
      prisma.referenciaPerfil.findMany({
        where: { projectId, status: { in: ["confirmado", "recusado"] } },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, rede: true, perfil: true, nome: true, motivo: true, status: true, origem: true, updatedAt: true },
      })
    ),
    ouVazio(
      "feedbacks",
      prisma.feedbackDoProduto.findMany({
        where: { projectId },
        orderBy: { criadoEm: "desc" },
        take: 400,
        select: { id: true, origem: true, texto: true, classificacao: true, cardId: true, postId: true, videoJobId: true, criadoEm: true },
      })
    ),
    ouVazio(
      "designs",
      prisma.designDoProjeto.findMany({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
        take: 60,
        select: { id: true, tipo: true, comoEntrou: true, updatedAt: true, design: { select: { nome: true, descricao: true } } },
      })
    ),
    ouVazio(
      "roteiros",
      prisma.roteiro.findMany({
        where: { projectId, status: { in: ["pronto", "gravado", "descartada"] } },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { id: true, titulo: true, tese: true, status: true, updatedAt: true },
      })
    ),
  ]);
  return { projeto, memorias, contextos, materiais, referencias, feedbacks, designs, roteiros };
}

export async function carregarCerebro(projectId: string): Promise<CerebroNaTela | null> {
  const f = await carregarFontes(projectId);
  return f ? montarCerebro(f) : null;
}

/** Todas as notas do cliente, sem o centro e as esferas (para o registro e para a Vera). */
export async function carregarNotas(projectId: string): Promise<NotaDoCerebro[]> {
  const f = await carregarFontes(projectId);
  return f ? notasDoCliente(f) : [];
}
