// Refazer as artes pendentes leva até 90 s por dia de campanha.
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { aplicarPedido, desfazerPedido, gravarPedido, lerPedido, paraATela, type PedidoDaVera } from "@/lib/vera/pedidos";
import { executarAcaoDaVera } from "@/lib/vera/executar-acao";

/**
 * O TOQUE DE UM PEDIDO DA VERA (04/10/2026): aplicar, desfazer ou descartar.
 *
 * Só quem pediu, ou o dono da conta, decide sobre o pedido: o membro da equipe
 * não aplica o pedido de outro membro.
 *
 * Pedido com ação de custo (refazer peça, refazer artes) roda depois da
 * resposta (`after`), porque pode passar de um minuto; a tela relê o pedido
 * pelo GET até ele sair de "aplicando". Um "aplicando" com mais de dez minutos
 * é uma função que morreu no meio, e a tela passa a ver "falhou" (estado que
 * sobrevive ao fato vira mentira na tela).
 */

const DEZ_MINUTOS = 10 * 60_000;

async function carregar(id: string, pedidoId: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const projeto = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return { erro: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  let pedido = await lerPedido(id, pedidoId);
  if (!pedido) return { erro: NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 }) } as const;
  if (pedido.status === "aplicando" && Date.now() - new Date(pedido.aplicadoEm ?? pedido.criadoEm).getTime() > DEZ_MINUTOS) {
    pedido = { ...pedido, status: "falhou", resultado: "A aplicação parou no meio. Confira o quadro e peça de novo se faltou alguma coisa." };
    await gravarPedido(pedido);
  }
  return { userId, projeto, pedido } as const;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; pedidoId: string }> }) {
  const { id, pedidoId } = await params;
  const c = await carregar(id, pedidoId);
  if ("erro" in c) return c.erro;
  return NextResponse.json({ pedido: paraATela(c.pedido) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; pedidoId: string }> }) {
  const { id, pedidoId } = await params;
  const c = await carregar(id, pedidoId);
  if ("erro" in c) return c.erro;
  const { userId, projeto, pedido } = c;
  if (pedido.userId !== userId && projeto.userId !== userId) {
    return NextResponse.json({ error: "Só quem fez o pedido, ou o dono da conta, decide sobre ele." }, { status: 403 });
  }
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: string };

  if (acao === "descartar") {
    if (pedido.status !== "proposto") return NextResponse.json({ error: "Esse pedido não está mais esperando." }, { status: 409 });
    const final: PedidoDaVera = { ...pedido, status: "descartado", resultado: "Deixado de lado, nada mudou." };
    await gravarPedido(final);
    return NextResponse.json({ pedido: paraATela(final) });
  }

  if (acao === "aplicar") {
    if (pedido.status !== "proposto") return NextResponse.json({ error: "Esse pedido já foi decidido." }, { status: 409 });
    if (pedido.acoes.length) {
      const marcado: PedidoDaVera = { ...pedido, status: "aplicando", aplicadoEm: new Date().toISOString() };
      await gravarPedido(marcado);
      after(async () => {
        try {
          await aplicarPedido(marcado, executarAcaoDaVera);
        } catch (e) {
          console.error("[vera-gerente] aplicar", pedidoId, e);
          await gravarPedido({ ...marcado, status: "falhou", resultado: "Não consegui aplicar agora. Nada foi cobrado pelo que não saiu." });
        }
      });
      return NextResponse.json({ pedido: paraATela(marcado) });
    }
    const final = await aplicarPedido(pedido, executarAcaoDaVera);
    return NextResponse.json({ pedido: paraATela(final) });
  }

  if (acao === "desfazer") {
    if (!paraATela(pedido).podeDesfazer) return NextResponse.json({ error: "Esse pedido não pode mais ser desfeito." }, { status: 409 });
    const final = await desfazerPedido(pedido);
    return NextResponse.json({ pedido: paraATela(final) });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
