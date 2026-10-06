import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DIAS_PARA_DESFAZER, type EstadoDoPedido, type ItemDoPedido, type PedidoNaTela } from "@/lib/vera/tipos";
import { registrarNota } from "@/lib/cerebro/captura";

/**
 * OS PEDIDOS DA VERA (04/10/2026): o que muda, o antes, o depois, quem pediu e
 * como desfazer.
 *
 * Toda mudança que a Vera prepara vira uma lista de ESCRITAS, cada uma com o
 * valor de antes lido do banco na hora da proposta e o valor de depois. Com
 * isso as três coisas que o Bruno pediu saem do mesmo dado:
 *
 *   mostrar o que vai mudar   cada item tem antes e depois legíveis;
 *   desfazer em um toque      desfazer é gravar o "antes" de volta;
 *   histórico do projeto      o pedido fica guardado com quem pediu e quando.
 *
 * A GUARDA DE CONFLITO: ao aplicar, cada escrita confere que o banco ainda tem
 * o "antes" (alguém pode ter editado a peça entre a proposta e o toque); ao
 * desfazer, confere que ainda tem o "depois". O que mudou no meio é pulado e
 * dito, nunca sobrescrito em silêncio.
 *
 * TUDO PRESO AO PROJETO: toda leitura e escrita filtra por `projectId` em
 * código. Uma escrita com id de outro projeto não acha nada e não grava nada.
 *
 * Mora em ProjectMemory (tipo "vera-pedido", uma linha por pedido), sem migração.
 */

const TIPO = "vera-pedido";

export type CampoDoProjeto = "niche" | "targetAudience" | "voice" | "colorPalette" | "videoSemana" | "videoEstiloEscolha" | "videoStyle";
export type ChaveDoConfig = "linhaEditorial" | "linksDoCliente";

export type Escrita =
  | { onde: "projeto"; campo: CampoDoProjeto; antes: unknown; depois: unknown }
  | { onde: "config"; chave: ChaveDoConfig; antes: unknown; depois: unknown }
  | { onde: "post"; id: string; campo: "content" | "scheduledAt" | "status" | "imageUrl"; antes: unknown; depois: unknown }
  | { onde: "card"; id: string; campo: "content" | "scheduledDate" | "status" | "mediaUrl"; antes: unknown; depois: unknown }
  | { onde: "memoria"; tipo: string; chave: string; antes: unknown; depois: unknown };

export type Mudanca = ItemDoPedido & { escritas: Escrita[] };

/** Ações que não são uma troca de valor: rodam ao aplicar, e o que gravaram vira escrita para desfazer. */
export type AcaoDoPedido =
  | { tipo: "regerar_artes"; postIds: string[]; custo: number; item: ItemDoPedido }
  | { tipo: "refazer_peca"; postId: string; instrucao?: string; custo: number; item: ItemDoPedido };

export type PedidoDaVera = {
  id: string;
  projectId: string;
  userId: string;
  pedidoPor: string;
  pedido: string;
  resumo: string;
  mudancas: Mudanca[];
  acoes: AcaoDoPedido[];
  amplo: boolean;
  custoCreditos: number;
  status: EstadoDoPedido;
  criadoEm: string;
  aplicadoEm?: string | null;
  desfeitoEm?: string | null;
  resultado?: string | null;
  /** O que as ações gravaram ao rodar, para o desfazer saber voltar. */
  escritasDasAcoes?: Escrita[];
};

// ── comparação estável ──────────────────────────────────────────────────────

/** Normaliza para comparar: Date vira ISO, undefined vira null, chave de objeto em ordem. */
function normal(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normal);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, normal(o[k])])
    );
  }
  return v;
}

export function mesmoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

// ── ler e gravar uma escrita ────────────────────────────────────────────────

const comoData = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : new Date(String(v)));

export async function valorAtual(projectId: string, e: Escrita): Promise<unknown> {
  switch (e.onde) {
    case "projeto": {
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { [e.campo]: true } as Prisma.ProjectSelect });
      return (p as Record<string, unknown> | null)?.[e.campo] ?? null;
    }
    case "config": {
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { config: true } });
      return ((p?.config as Record<string, unknown> | null) ?? {})[e.chave] ?? null;
    }
    case "post": {
      const p = await prisma.post.findFirst({ where: { id: e.id, projectId }, select: { [e.campo]: true } as Prisma.PostSelect });
      return (p as Record<string, unknown> | null)?.[e.campo] ?? null;
    }
    case "card": {
      const c = await prisma.campaignCard.findFirst({ where: { id: e.id, projectId }, select: { [e.campo]: true } as Prisma.CampaignCardSelect });
      return (c as Record<string, unknown> | null)?.[e.campo] ?? null;
    }
    case "memoria": {
      const m = await prisma.projectMemory.findUnique({
        where: { projectId_type_key: { projectId, type: e.tipo, key: e.chave } },
        select: { value: true },
      });
      return m?.value ?? null;
    }
  }
}

async function gravarValor(projectId: string, e: Escrita, valor: unknown): Promise<void> {
  switch (e.onde) {
    case "projeto":
      await prisma.project.update({ where: { id: projectId }, data: { [e.campo]: valor ?? null } as Prisma.ProjectUpdateInput });
      return;
    case "config": {
      // Lido na hora: o config guarda outras coisas ao lado (referências,
      // links, linha editorial), e trocar o objeto inteiro apagaria vizinho.
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { config: true } });
      const config = { ...((p?.config as Record<string, unknown> | null) ?? {}) };
      if (valor === null || valor === undefined) delete config[e.chave];
      else config[e.chave] = valor;
      await prisma.project.update({ where: { id: projectId }, data: { config: config as Prisma.InputJsonValue } });
      return;
    }
    case "post": {
      const dado = e.campo === "scheduledAt" ? comoData(valor) : valor;
      await prisma.post.updateMany({ where: { id: e.id, projectId }, data: { [e.campo]: dado } as Prisma.PostUpdateManyMutationInput });
      return;
    }
    case "card": {
      const dado = e.campo === "scheduledDate" ? comoData(valor) : valor;
      await prisma.campaignCard.updateMany({
        where: { id: e.id, projectId },
        data: { [e.campo]: dado } as Prisma.CampaignCardUpdateManyMutationInput,
      });
      return;
    }
    case "memoria":
      if (valor === null || valor === undefined) {
        await prisma.projectMemory.deleteMany({ where: { projectId, type: e.tipo, key: e.chave } });
      } else {
        await prisma.projectMemory.upsert({
          where: { projectId_type_key: { projectId, type: e.tipo, key: e.chave } },
          create: { projectId, type: e.tipo, key: e.chave, value: valor as Prisma.InputJsonValue },
          update: { value: valor as Prisma.InputJsonValue },
        });
      }
      return;
  }
}

// ── guardar e ler os pedidos ────────────────────────────────────────────────

export function novoPedido(args: Omit<PedidoDaVera, "id" | "status" | "criadoEm">): PedidoDaVera {
  return { ...args, id: randomUUID(), status: "proposto", criadoEm: new Date().toISOString() };
}

export async function gravarPedido(p: PedidoDaVera): Promise<void> {
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId: p.projectId, type: TIPO, key: p.id } },
    create: { projectId: p.projectId, type: TIPO, key: p.id, value: p as never },
    update: { value: p as never },
  });
}

export async function lerPedido(projectId: string, id: string): Promise<PedidoDaVera | null> {
  const m = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: TIPO, key: id } }, select: { value: true } });
  return (m?.value as unknown as PedidoDaVera) ?? null;
}

export async function listarPedidos(projectId: string, quantos = 30): Promise<PedidoDaVera[]> {
  const linhas = await prisma.projectMemory.findMany({
    where: { projectId, type: TIPO },
    orderBy: { createdAt: "desc" },
    take: quantos,
    select: { value: true },
  });
  return linhas.map((l) => l.value as unknown as PedidoDaVera).filter((p) => p && p.id);
}

function podeDesfazer(p: PedidoDaVera): boolean {
  if (p.status !== "aplicado" || !p.aplicadoEm) return false;
  return Date.now() - new Date(p.aplicadoEm).getTime() < DIAS_PARA_DESFAZER * 86_400_000;
}

/** O pedido como a tela mostra: sem as escritas cruas (que levam texto inteiro duas vezes). */
export function paraATela(p: PedidoDaVera): PedidoNaTela {
  return {
    id: p.id,
    status: p.status,
    resumo: p.resumo,
    itens: [...p.mudancas.map(({ escritas: _e, ...item }) => item), ...p.acoes.map((a) => a.item)],
    amplo: p.amplo,
    custoCreditos: p.custoCreditos,
    pedidoPor: p.pedidoPor,
    pedido: p.pedido,
    criadoEm: p.criadoEm,
    aplicadoEm: p.aplicadoEm ?? null,
    desfeitoEm: p.desfeitoEm ?? null,
    resultado: p.resultado ?? null,
    podeDesfazer: podeDesfazer(p),
  };
}

// ── aplicar e desfazer ──────────────────────────────────────────────────────

export type ExecutorDeAcao = (acao: AcaoDoPedido, p: PedidoDaVera) => Promise<{ escritas: Escrita[]; frase: string }>;

/**
 * Aplica as mudanças (com a guarda de conflito) e depois roda as ações, na
 * ordem: a cor nova precisa estar gravada antes de as artes serem refeitas.
 */
export async function aplicarPedido(p: PedidoDaVera, executar: ExecutorDeAcao): Promise<PedidoDaVera> {
  const pulados: string[] = [];
  let gravados = 0;
  for (const m of p.mudancas) {
    const atuais = await Promise.all(m.escritas.map((e) => valorAtual(p.projectId, e)));
    const mudou = m.escritas.some((e, i) => !mesmoValor(atuais[i], e.antes) && !mesmoValor(atuais[i], e.depois));
    if (mudou) {
      pulados.push(m.titulo);
      continue;
    }
    for (const e of m.escritas) await gravarValor(p.projectId, e, e.depois);
    gravados++;
  }

  const frases: string[] = [];
  const escritasDasAcoes: Escrita[] = [];
  for (const a of p.acoes) {
    try {
      const r = await executar(a, p);
      escritasDasAcoes.push(...r.escritas);
      frases.push(r.frase);
    } catch (e) {
      frases.push(`${a.item.titulo}: não deu (${e instanceof Error ? e.message : "erro"}).`);
    }
  }

  const partes = [
    gravados ? `${gravados} ${gravados === 1 ? "mudança gravada" : "mudanças gravadas"}.` : "",
    pulados.length ? `Não mexi em ${pulados.join("; ")}: mudou depois da proposta, então deixei como está.` : "",
    ...frases,
  ].filter(Boolean);
  const nada = gravados === 0 && escritasDasAcoes.length === 0;
  const final: PedidoDaVera = {
    ...p,
    status: nada ? "falhou" : "aplicado",
    aplicadoEm: new Date().toISOString(),
    resultado: partes.join(" ") || "Nada mudou.",
    escritasDasAcoes,
  };
  await gravarPedido(final);
  // O SEGUNDO CÉREBRO (06/10): o pedido aplicado vira nota do cliente, lida
  // pelo JEV. Nunca trava a Vera: registrarNota engole o próprio erro.
  if (final.status === "aplicado") void registrarNota(final.projectId, `vera:${final.id}`);
  return final;
}

export async function desfazerPedido(p: PedidoDaVera): Promise<PedidoDaVera> {
  const todas = [...p.mudancas.flatMap((m) => m.escritas), ...(p.escritasDasAcoes ?? [])];
  let voltaram = 0;
  let pulados = 0;
  // De trás para frente: se a mesma coisa foi escrita duas vezes, a primeira
  // escrita guarda o "antes" de verdade.
  for (const e of [...todas].reverse()) {
    const atual = await valorAtual(p.projectId, e);
    if (!mesmoValor(atual, e.depois)) {
      if (!mesmoValor(atual, e.antes)) pulados++;
      continue;
    }
    await gravarValor(p.projectId, e, e.antes);
    voltaram++;
  }
  const gastou = p.acoes.some((a) => a.custo > 0);
  const final: PedidoDaVera = {
    ...p,
    status: "desfeito",
    desfeitoEm: new Date().toISOString(),
    resultado: [
      voltaram ? "Voltei tudo como estava." : "Não havia nada para voltar.",
      pulados ? `${pulados} ${pulados === 1 ? "item mudou" : "itens mudaram"} depois do meu pedido e ficaram como estão.` : "",
      gastou ? "Os créditos gastos para gerar não voltam." : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
  await gravarPedido(final);
  void registrarNota(final.projectId, `vera:${final.id}`);
  return final;
}
