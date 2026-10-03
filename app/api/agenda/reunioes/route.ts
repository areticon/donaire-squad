export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { idDoLeadAtual } from "@/lib/agenda/lead";
import { ErroDeAgenda, marcarReuniao } from "@/lib/agenda/reunioes";
import { registrarPasso } from "@/lib/funil/eventos";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";

/**
 * MARCAR A DEMONSTRAÇÃO (01/10).
 *
 * QUEM MARCA É O LEAD DO COOKIE (ou do token `l` da URL), nunca um e-mail
 * vindo no corpo: senão qualquer um marcaria reunião em nome de outra pessoa
 * digitando o e-mail dela. Sem lead identificado, a tela volta ao formulário.
 */

const LIMITE_POR_HORA = 10;
const janela = new Map<string, { n: number; desde: number }>();

export async function POST(req: NextRequest) {
  const ip = hashIp(extrairIp(req.headers));
  const agora = Date.now();
  const atual = janela.get(ip);
  if (!atual || agora - atual.desde > 3_600_000) janela.set(ip, { n: 1, desde: agora });
  else if (atual.n >= LIMITE_POR_HORA) return NextResponse.json({ error: "Muitas tentativas. Tente de novo em uma hora." }, { status: 429 });
  else atual.n += 1;

  try {
    const c = (await req.json()) as Record<string, unknown>;
    const leadId = await idDoLeadAtual(typeof c.l === "string" ? c.l : null);
    if (!leadId) return NextResponse.json({ error: "Preencha os seus dados para marcar.", semLead: true }, { status: 401 });
    if (typeof c.inicio !== "string") return NextResponse.json({ error: "Escolha um horário." }, { status: 400 });
    const pessoaId = typeof c.pessoaId === "string" && c.pessoaId !== "qualquer" ? c.pessoaId : null;

    const r = await marcarReuniao({ leadId, inicioIso: c.inicio, pessoaId });
    await registrarPasso("contato", { caminho: "/demonstracao", meta: { fonte: "agendamento", escolha: pessoaId ? "pessoa" : "qualquer" } }).catch(() => {});
    return NextResponse.json({ ok: true, reuniao: r });
  } catch (e) {
    if (e instanceof ErroDeAgenda) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[agenda] marcar falhou:", e);
    return NextResponse.json({ error: "Não consegui marcar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
