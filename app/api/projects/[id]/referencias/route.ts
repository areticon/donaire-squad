import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { redesLigadas } from "@/lib/referencias/config";
import { perfilCanonico, urlDoPerfil } from "@/lib/referencias/coletar";
import { sugerirPerfis } from "@/lib/referencias/descobrir";
import { gastoDoMes } from "@/lib/referencias/estudo";
import { comecarEstudo, lerEstudo, rodarEstudo } from "@/lib/referencias/andamento";
import { padroesDoProjeto } from "@/lib/editorial/fontes-da-linha";
import { REDES_DE_REFERENCIA, type RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * OS PERFIS DE REFERÊNCIA DO PROJETO (01/10, trilho de referências).
 *
 * GET: os perfis (sugeridos e confirmados), os cartões de padrão, as redes
 * ligadas e o gasto do mês. Quem usa o projeto vê; só o dono muda.
 * POST { acao }:
 *   "sugerir"   o Roberto procura perfis do nicho (Apify e APIs oficiais);
 *   "adicionar" o dono indica um perfil { rede, perfil };
 *   "estudar"   coleta os confirmados, etiqueta e recalcula os padrões.
 *
 * O "estudar" NÃO espera o estudo (01/10): grava "estudando", responde 202 na
 * hora e roda em `after`. Medido em produção: o estudo do projeto Demandou
 * levou 5 min 22 s com a requisição presa, e o botão só girava. Agora a tela
 * consulta GET ?estudo=1 (só o andamento, consulta curta) a cada poucos
 * segundos. Ver lib/referencias/andamento.ts.
 *
 * 800 s continua sendo o teto da função que roda o `after`: atores da Apify em
 * série (cada um leva de 20 s a 2 min), etiqueta e a medida dos vídeos.
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A consulta curta da tela enquanto o estudo roda: só o andamento.
  if (req.nextUrl.searchParams.get("estudo") === "1") return NextResponse.json({ estudo: await lerEstudo(id) });
  const [perfis, padroes, gasto, confirmadosNaConta, estudo] = await Promise.all([
    prisma.referenciaPerfil.findMany({ where: { projectId: id, status: { in: ["sugerido", "confirmado"] } }, orderBy: [{ status: "asc" }, { seguidores: "desc" }] }),
    padroesDoProjeto(id),
    gastoDoMes(id),
    prisma.referenciaPerfil.count({ where: { status: "confirmado", project: { userId: a.projeto.userId } } }),
    lerEstudo(id),
  ]);
  return NextResponse.json({
    ligadas: redesLigadas(),
    podeEditar: a.projeto.userId === a.userId,
    perfis: perfis.map((p) => ({ ...p, ultimaColeta: p.ultimaColeta?.toISOString() ?? null })),
    padroes,
    gastoDoMesUsd: gasto,
    confirmadosNaConta,
    estudo,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(a.userId, a.projeto, "mexer nos perfis de referência");
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; rede?: string; perfil?: string };
  const ligadas = redesLigadas();
  if (!ligadas.length) {
    return NextResponse.json({ error: "O estudo de referências ainda está desligado nesta conta. Fale com o suporte para ligar." }, { status: 409 });
  }

  try {
    if (corpo.acao === "sugerir") {
      const r = await sugerirPerfis(id);
      return NextResponse.json({ ok: true, ...r });
    }
    if (corpo.acao === "adicionar") {
      const rede = corpo.rede as RedeDeReferencia;
      if (!REDES_DE_REFERENCIA.includes(rede) || !corpo.perfil?.trim()) return NextResponse.json({ error: "Escolha a rede e escreva o perfil." }, { status: 400 });
      if (rede === "linkedin" && !/linkedin\.com\/(company|school|showcase)\//i.test(corpo.perfil)) {
        return NextResponse.json({ error: "No LinkedIn, só página de empresa (o link com /company/)." }, { status: 400 });
      }
      const perfil = perfilCanonico(rede, corpo.perfil);
      const r = await prisma.referenciaPerfil.upsert({
        where: { projectId_rede_perfil: { projectId: id, rede, perfil } },
        create: { projectId: id, rede, perfil, url: urlDoPerfil(rede, perfil), nome: perfil, motivo: "indicado por você", status: "sugerido", origem: "cliente" },
        update: { status: "sugerido" },
      });
      return NextResponse.json({ ok: true, perfil: r });
    }
    if (corpo.acao === "estudar") {
      const total = await prisma.referenciaPerfil.count({ where: { projectId: id, status: "confirmado" } });
      if (!total) return NextResponse.json({ error: "Confirme pelo menos um perfil antes de estudar." }, { status: 400 });
      const andamento = await comecarEstudo(id, total);
      if (!andamento) {
        // Já há um estudo rodando (outra aba, clique duplo): a tela só acompanha.
        return NextResponse.json({ ok: true, jaEstudando: true, estudo: await lerEstudo(id) }, { status: 202 });
      }
      after(() => rodarEstudo(id, andamento).then(() => undefined));
      return NextResponse.json({ ok: true, estudo: andamento.estudo }, { status: 202 });
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    console.error(`[referencias][${corpo.acao}] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui terminar agora. Tente de novo em instantes." }, { status: 502 });
  }
}
