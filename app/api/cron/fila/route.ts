export const dynamic = "force-dynamic";

// 800 s, o mesmo teto das rotas de video. Agora o teto vale por TRABALHO e nao
// pela campanha inteira: cada dia com imagem, Vera e correcao leva perto de
// 2,5 minutos, entao uma passada roda dois ou tres dias e devolve o resto para
// a proxima. Sete dias com imagem, que era o caso que estourava, passam a
// caber porque nenhum deles divide o teto com os outros.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { assinaturaDaFilaValida, cutucar } from "@/lib/fila/trabalhos";
import { passadaDaFila } from "@/lib/fila/passada";

/**
 * A fila, uma passada.
 *
 * Roda a cada minuto pelo cron e tambem por cutucao, logo depois de alguem
 * pedir uma campanha: o cron e a rede de seguranca, nao o relogio do produto.
 * O que ela faz esta em `lib/fila/passada.ts`, que e a mesma copia que a prova
 * de ponta a ponta chama.
 */

/**
 * Quem pode chamar: o cron da Vercel (com o `CRON_SECRET` no cabecalho, mesmo
 * padrao do cron de publicacao) ou o proprio servidor, com a assinatura da
 * fila. A rota mexe em trabalho de cliente e gasta API paga, entao ela nao
 * fica aberta.
 */
function autorizado(req: NextRequest): boolean {
  const segredoDoCron = process.env.CRON_SECRET;
  if (segredoDoCron && req.headers.get("authorization") === `Bearer ${segredoDoCron}`) {
    return true;
  }
  return assinaturaDaFilaValida(req.nextUrl.searchParams.get("sig"));
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await passadaDaFila();

  // Rodou alguma coisa? Cutuca de novo, para a fila nao andar no ritmo do cron
  // quando ha trabalho acumulado. A passada seguinte que nao achar nada nao
  // cutuca ninguem, entao isto termina sozinho.
  if (r.rodados > 0) cutucar();

  return NextResponse.json({ ok: true, ...r });
}

// O cron da Vercel chama com GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
