import { prisma } from "@/lib/db/prisma";
import { refazerPeca } from "@/lib/pipeline/refazer-peca";
import { regerarArtes } from "@/lib/vera/regerar-arte";
import type { Escrita, ExecutorDeAcao } from "@/lib/vera/pedidos";

/**
 * O QUE RODA quando um pedido da Vera tem ação com custo (04/10/2026).
 *
 * As duas ações usam o caminho que já existe e já cobra certo: refazer uma
 * peça é `refazerPeca` (com a cortesia da peça reprovada), refazer as artes é
 * lib/vera/regerar-arte.ts. Daqui sai só a lista do que foi gravado, para o
 * desfazer saber voltar o texto e a arte de antes.
 */
export const executarAcaoDaVera: ExecutorDeAcao = async (acao, pedido) => {
  if (acao.tipo === "regerar_artes") {
    return regerarArtes({ projectId: pedido.projectId, userId: pedido.userId, postIds: acao.postIds });
  }

  // refazer_peca: reprovar (o que dá a cortesia de quem reprova) e escrever de novo.
  const antes = await prisma.post.findFirst({
    where: { id: acao.postId, projectId: pedido.projectId },
    select: { id: true, content: true, imageUrl: true, status: true },
  });
  if (!antes) throw new Error("a peça não existe mais");
  const cardsAntes = await prisma.campaignCard.findMany({
    where: { projectId: pedido.projectId, postId: antes.id },
    select: { id: true, content: true, mediaUrl: true },
  });
  await prisma.post.update({ where: { id: antes.id }, data: { status: "rejected" } });
  const r = await refazerPeca({ postId: antes.id, userId: pedido.userId, instrucao: acao.instrucao });
  if (!r.ok) {
    await prisma.post.update({ where: { id: antes.id }, data: { status: antes.status } });
    const motivo =
      r.erro === "sem_saldo" ? `faltam ${r.necessario - r.disponivel} créditos` : r.erro === "texto_recusado" ? "o texto novo veio como bastidor, e nada foi cobrado" : r.erro;
    throw new Error(motivo);
  }
  const depois = await prisma.post.findUniqueOrThrow({ where: { id: antes.id }, select: { content: true, imageUrl: true, status: true } });
  const cardsDepois = await prisma.campaignCard.findMany({ where: { id: { in: cardsAntes.map((c) => c.id) } }, select: { id: true, content: true, mediaUrl: true } });
  const escritas: Escrita[] = [
    { onde: "post", id: antes.id, campo: "content", antes: antes.content, depois: depois.content },
    { onde: "post", id: antes.id, campo: "status", antes: antes.status, depois: depois.status },
  ];
  if (depois.imageUrl !== antes.imageUrl) escritas.push({ onde: "post", id: antes.id, campo: "imageUrl", antes: antes.imageUrl, depois: depois.imageUrl });
  for (const c of cardsDepois) {
    const a = cardsAntes.find((x) => x.id === c.id)!;
    if (c.content !== a.content) escritas.push({ onde: "card", id: c.id, campo: "content", antes: a.content, depois: c.content });
    if (c.mediaUrl !== a.mediaUrl) escritas.push({ onde: "card", id: c.id, campo: "mediaUrl", antes: a.mediaUrl, depois: c.mediaUrl });
  }
  return {
    escritas,
    frase: `Peça refeita${r.arteRefeita ? " com arte nova" : ""}${r.custo ? `, ${r.custo} créditos` : r.cortesia ? `, sem cobrança (${r.cortesia})` : ""}; ela volta como rascunho para você aprovar.`,
  };
};
