import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { redesLigadas } from "@/lib/referencias/config";
import { achadosDoProjeto } from "@/lib/referencias/achados";
import { listarRegras } from "@/lib/referencias/regras";
import { lerTendencias, liberadaEm } from "@/lib/referencias/tendencias";
import { lerEstudo } from "@/lib/referencias/andamento";
import { continuacaoValida, lerAnalise, pedirAnalise, retomarAnalise, rodarAnalise, PEDIDOS } from "@/lib/referencias/analise";
import type { EstadoDaAnalise, RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";

/**
 * AS ANÁLISES DAS REFERÊNCIAS (02/10/2026): achados, regras e tendências.
 *
 * GET: os achados (calculados agora do banco), as regras, as tendências da
 * semana e o estado do trabalho em segundo plano. Quem usa o projeto vê.
 *
 * POST { acao }:
 *   "comecar"    só o dono; { tipo: "criacao" | "analisar" | "tendencias" }.
 *                Responde 202 na hora e trabalha em `after`.
 *   "continuar"  do próprio servidor (assinatura no cabeçalho), para passar
 *                a vez entre execuções; ou do dono, para retomar um pedido
 *                que parou no meio ou falhou.
 *
 * 800 s porque o grupo mais longo (o estudo) usa quase isso; ver
 * lib/referencias/analise.ts.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

async function acesso(projectId: string) {
  const { userId } = await auth();
  if (!userId) return null;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  if (!p || !(await podeUsarProjeto(userId, p))) return null;
  return { userId, projeto: p };
}

/** O estado para a tela: sem a base nem o dono. */
function paraATela(e: (EstadoDaAnalise & { base?: unknown; userId?: unknown }) | null): EstadoDaAnalise | null {
  if (!e) return null;
  const { base: _base, userId: _userId, ...resto } = e;
  return resto;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ achados, painel, amostra }, regras, tendencias, analise, estudo] = await Promise.all([
    achadosDoProjeto(id),
    listarRegras(id),
    lerTendencias(id),
    lerAnalise(id),
    lerEstudo(id).catch(() => null),
  ]);
  const regrasEm = analise.estado?.regrasEm ? new Date(analise.estado.regrasEm).getTime() : 0;
  const estudoEm = estudo?.estado === "pronto" && estudo.terminadoEm ? new Date(estudo.terminadoEm).getTime() : 0;
  const resposta: RespostaDasAnalises = {
    ligado: redesLigadas().length > 0,
    podeEditar: a.projeto.userId === a.userId,
    estado: paraATela(analise.estado),
    parado: analise.parado,
    achados,
    painel,
    amostra,
    regras,
    tendencias,
    tendenciasLiberadasEm: liberadaEm(tendencias)?.toISOString() ?? null,
    estudoMaisNovoQueRegras: estudoEm > 0 && estudoEm > regrasEm && achados.length > 0,
  };
  return NextResponse.json(resposta);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; tipo?: string; origem?: string };
  const base = req.nextUrl.origin;

  // A passagem de vez entre execuções: assinada, sem sessão.
  if (corpo.acao === "continuar" && continuacaoValida(id, req.headers.get("x-analise-assinatura"))) {
    const { estado } = await lerAnalise(id);
    if (!estado || estado.status !== "rodando") return NextResponse.json({ error: "Nada para continuar." }, { status: 409 });
    after(() => rodarAnalise(id));
    return NextResponse.json({ aceito: true }, { status: 202 });
  }

  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(a.userId, a.projeto, "pedir as análises das referências");
  if (negado) return negado;
  if (!redesLigadas().length) {
    return NextResponse.json({ error: "O estudo de referências ainda está desligado nesta conta. Fale com o suporte para ligar." }, { status: 409 });
  }

  if (corpo.acao === "continuar") {
    const retomado = await retomarAnalise(id, base);
    if (!retomado) return NextResponse.json({ error: "Não há análise parada para continuar." }, { status: 409 });
    after(() => rodarAnalise(id));
    return NextResponse.json({ aceito: true, estado: paraATela(retomado) }, { status: 202 });
  }

  if (corpo.acao === "comecar") {
    const tipo = (["criacao", "analisar", "tendencias"] as const).find((t) => t === corpo.tipo) ?? "analisar";
    const origem: EstadoDaAnalise["origem"] = corpo.origem === "criacao" || tipo === "criacao" ? "criacao" : "painel";
    if (tipo === "tendencias") {
      const t = await lerTendencias(id);
      const quando = liberadaEm(t);
      if (quando) {
        return NextResponse.json(
          { error: `As tendências desta semana já foram buscadas. A próxima busca fica liberada ${quando.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}.` },
          { status: 409 }
        );
      }
    }
    const estado = await pedirAnalise(id, { tipo, origem, base, userId: a.userId });
    if (!estado) return NextResponse.json({ error: "Já há uma análise rodando neste projeto. Ela aparece aqui quando terminar." }, { status: 409 });
    after(() => rodarAnalise(id));
    return NextResponse.json({ aceito: true, estado: paraATela(estado), etapas: PEDIDOS[tipo] }, { status: 202 });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
