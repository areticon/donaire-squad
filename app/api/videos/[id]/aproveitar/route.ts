export const dynamic = "force-dynamic";
// A esteira escreve as peças pedidas depois da resposta (`after`): Roberto,
// redatores, a Diana nas artes e a Vera, como na semana do vídeo.
export const maxDuration = 300;

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { projetoVisivel } from "@/lib/equipe/conta";
import { SaldoInsuficiente, saldo } from "@/lib/credits";
import { escreverPedido, oQueJaExiste, pedirMaisPecas, RecusaDoAproveitar } from "@/lib/media/aproveitar-roteiro";
import type { OpcaoDeAproveitar } from "@/lib/media/aproveitar-tipos";
import type { RedeDoPlano } from "@/lib/media/semana-do-video";

/**
 * "APROVEITAR O ROTEIRO" (02/10/2026): o vídeo ficou pronto e a plataforma
 * oferece mais peças a partir dele. Ver lib/media/aproveitar-roteiro.ts.
 *
 *   GET   o que já foi gerado (para não oferecer de novo) e o que ainda cabe;
 *   POST  { formatos, redes }: cobra pela conta da campanha e manda a esteira
 *         escrever; o que não sair volta ao saldo.
 */

async function podeVer(videoId: string): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const v = await prisma.videoJob.findFirst({ where: { id: videoId, project: projetoVisivel(userId) }, select: { id: true } });
  return v ? userId : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await podeVer(id);
  if (!userId) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  const existe = await oQueJaExiste(id);
  if (!existe) return NextResponse.json({ error: "O quadro deste vídeo ainda não existe. Espere a edição terminar." }, { status: 409 });
  const [disponivel, eu] = await Promise.all([
    saldo(userId).catch(() => null),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  // Acesso interno não tem crédito debitado (12/09): a janela diz isso em vez do saldo.
  return NextResponse.json({ ...existe, saldo: disponivel, acessoInterno: eu?.role === "admin" });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await podeVer(id);
  if (!userId) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { formatos?: unknown; redes?: unknown };
  const formatos = (Array.isArray(corpo.formatos) ? corpo.formatos : []).filter((f): f is OpcaoDeAproveitar => typeof f === "string");
  const redes = (Array.isArray(corpo.redes) ? corpo.redes : []).filter((r): r is RedeDoPlano => typeof r === "string");
  try {
    const pedido = await pedirMaisPecas(id, userId, { formatos, redes });
    after(async () => {
      const r = await escreverPedido(id, userId, pedido).catch((e) => {
        console.error(`[aproveitar][${id}]`, e);
        return null;
      });
      console.log(`[aproveitar][${id}] ${pedido.dias.length} dia(s), ${pedido.creditos} créditos, entregues=${r?.entregues ?? "?"}`);
    });
    return NextResponse.json({ ok: true, creditos: pedido.creditos, dias: pedido.dias });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) {
      return NextResponse.json(
        { error: e.equipe ? e.message : `Estas peças custam ${e.necessario.toLocaleString("pt-BR")} créditos e você tem ${e.disponivel.toLocaleString("pt-BR")}.` },
        { status: 402 }
      );
    }
    if (e instanceof RecusaDoAproveitar) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[aproveitar][${id}]`, e);
    return NextResponse.json({ error: "Não consegui pedir as peças agora. Nada foi cobrado." }, { status: 500 });
  }
}
