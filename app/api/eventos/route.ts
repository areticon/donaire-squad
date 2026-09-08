export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";
import {
  carimbarOrigemDoUsuario,
  origemDoCookie,
  PASSOS,
  registrarPasso,
  type Passo,
} from "@/lib/funil/eventos";

/**
 * O beacon do funil: a única rota pública que a landing chama para dizer
 * "alguém chegou".
 *
 * Responde 204 sempre, inclusive quando recusa. Rota de medição que devolve
 * erro visível vira erro no console do visitante e ruído no suporte, e não há
 * nada que o navegador possa fazer a respeito.
 *
 * Só aceita os passos que o navegador tem como saber (`visita` e `cadastro`).
 * `checkout` e `assinatura` são gravados no servidor, onde o dinheiro
 * realmente acontece: aceitar esses aqui deixaria qualquer um inflar a
 * conversão com um `curl`.
 */
const DO_NAVEGADOR: Passo[] = ["visita", "cadastro"];

/** Teto por IP e por hora, para o beacon não virar porta de escrita infinita. */
const TETO_POR_HORA = 60;

export async function POST(req: NextRequest) {
  try {
    const corpo = (await req.json().catch(() => ({}))) as {
      evento?: string;
      caminho?: string;
      origem?: string;
      campanha?: string;
      midia?: string;
      termo?: string;
    };
    const evento = corpo.evento as Passo;
    if (!evento || !PASSOS.includes(evento) || !DO_NAVEGADOR.includes(evento)) {
      return new NextResponse(null, { status: 204 });
    }

    const ipHash = hashIp(extrairIp(req.headers));
    const desde = new Date(Date.now() - 60 * 60 * 1000);
    const quantos = await prisma.funnelEvent.count({
      where: { ipHash, createdAt: { gte: desde } },
    });
    if (quantos >= TETO_POR_HORA) return new NextResponse(null, { status: 204 });

    const { userId } = await auth().catch(() => ({ userId: null }));

    await registrarPasso(evento, {
      caminho: corpo.caminho,
      origem: corpo.origem,
      campanha: corpo.campanha,
      midia: corpo.midia,
      termo: corpo.termo,
      ipHash,
      userId,
    });

    // O cadastro é o momento em que a visita anônima vira gente: é aqui que a
    // origem da PRIMEIRA visita passa do cookie para o usuário, onde ela
    // sobrevive à limpeza dos eventos.
    if (evento === "cadastro" && userId) {
      await carimbarOrigemDoUsuario(userId, await origemDoCookie());
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
