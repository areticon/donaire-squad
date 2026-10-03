import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { redesLigadas } from "@/lib/referencias/config";
import { perfilCanonico, urlDoPerfil } from "@/lib/referencias/coletar";
import { lerAnalise, pedirAnalise, rodarAnalise } from "@/lib/referencias/analise";
import { deParaDoProjeto } from "@/lib/referencias/de-para";
import { estimativaDasTendencias } from "@/lib/referencias/tendencias";
import { gerarSetupSugerido, lerSetupSugerido } from "@/lib/referencias/setup-sugerido";
import {
  estimarEstudoDasReferencias,
  estimarEstudoDoPerfil,
  lerEstadoDoPerfil,
  lerRelatorio,
  pedirEstudoDoPerfil,
  redesDoCliente,
  rodarEstudoDoPerfil,
  salvarRedesDoCliente,
} from "@/lib/referencias/perfil-proprio";
import { MAX_REFERENCIAS_POR_CONTA, REDES_DE_REFERENCIA, type RedeDeReferencia } from "@/lib/referencias/tipos";
import { MAX_REFERENCIAS_POR_PROJETO, type RespostaDoPerfilProprio } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * A JORNADA DE ENTRADA (03/10/2026): o perfil do próprio cliente, as até 3
 * referências dele, o de-para e o setup sugerido.
 *
 * GET: as redes do cliente, as referências, o estado do estudo do perfil, o
 * relatório, o de-para (calculado agora do banco) e o setup sugerido. A
 * estimativa de custo de cada estudo só vai para admin: o cliente nunca lê
 * dólar nem fornecedor (regra de 21/09).
 *
 * POST { acao } (só o dono):
 *   "estudar"      { redes: [{ rede, perfil }] } grava as redes e estuda o
 *                  perfil em `after` (202 na hora, a tela consulta o GET);
 *   "referencias"  { referencias: [{ rede, perfil }] } até 3: viram as
 *                  confirmadas do projeto e o estudo delas sai pelas análises
 *                  (pedido "cliente": estudar, etiquetar, regras, tendências);
 *   "setup"        gera o setup sugerido (uma chamada de Sonnet, ~30 s).
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

async function eAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }).catch(() => null);
  return u?.role === "admin";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [redes, refs, { estado, parado }, relatorio, dePara, setup, admin] = await Promise.all([
    redesDoCliente(id),
    prisma.referenciaPerfil.findMany({ where: { projectId: id, status: "confirmado" }, orderBy: { createdAt: "asc" } }),
    lerEstadoDoPerfil(id),
    lerRelatorio(id),
    deParaDoProjeto(id).catch((e) => {
      console.warn(`[perfil-proprio][${id}] de-para: ${e instanceof Error ? e.message : e}`);
      return null;
    }),
    lerSetupSugerido(id),
    eAdmin(a.userId),
  ]);
  const doCliente = redes.map((r) => r.rede as RedeDeReferencia);
  const dasRefs = refs.map((r) => r.rede as RedeDeReferencia);
  const resposta: RespostaDoPerfilProprio = {
    ligado: redesLigadas().length > 0,
    podeEditar: a.projeto.userId === a.userId,
    redes: redes.map((r) => ({ rede: r.rede as RedeDeReferencia, perfil: r.perfil })),
    referencias: refs.map((r) => ({ id: r.id, rede: r.rede as RedeDeReferencia, perfil: r.perfil, ultimaColeta: r.ultimaColeta?.toISOString() ?? null, ultimoErro: r.ultimoErro })),
    estado,
    parado,
    relatorio: relatorio && !admin ? { ...relatorio, custo: { apifyUsd: 0, iaUsd: 0, estimado: true } } : relatorio,
    dePara,
    setup: setup && !admin ? { ...setup, custo: { apifyUsd: 0, iaUsd: 0, estimado: true } } : setup,
    estimativas: admin
      ? {
          perfil: estimarEstudoDoPerfil(doCliente.length ? doCliente : ["instagram"]),
          referencias: estimarEstudoDasReferencias(dasRefs.length ? dasRefs : ["instagram", "instagram", "instagram"], estimativaDasTendencias()),
          setup: { apifyUsd: 0, iaUsd: 0.08, estimado: true },
        }
      : null,
  };
  return NextResponse.json(resposta);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await acesso(id);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const negado = await soODono(a.userId, a.projeto, "estudar o perfil e as referências");
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as {
    acao?: string;
    redes?: Array<{ rede?: string; perfil?: string }>;
    referencias?: Array<{ rede?: string; perfil?: string }>;
  };
  if (!redesLigadas().length && corpo.acao !== "setup") {
    return NextResponse.json({ error: "O estudo de perfis ainda está desligado nesta conta. Pode seguir e preencher o setup à mão." }, { status: 409 });
  }

  try {
    if (corpo.acao === "estudar") {
      const { redes, recusadas } = await salvarRedesDoCliente(
        id,
        (corpo.redes ?? []).map((r) => ({ rede: String(r.rede ?? ""), perfil: String(r.perfil ?? "") }))
      );
      if (!redes.length) {
        return NextResponse.json({ error: recusadas[0] ?? "Escreva pelo menos uma rede (o @ ou o link do perfil)." }, { status: 400 });
      }
      const estado = await pedirEstudoDoPerfil(id);
      if (!estado) return NextResponse.json({ error: "O estudo do seu perfil já está rodando. Ele aparece aqui quando terminar." }, { status: 409 });
      after(() => rodarEstudoDoPerfil(id).then(() => undefined));
      return NextResponse.json({ aceito: true, estado, avisos: recusadas }, { status: 202 });
    }

    if (corpo.acao === "referencias") {
      const lista: Array<{ rede: RedeDeReferencia; perfil: string }> = [];
      for (const r of corpo.referencias ?? []) {
        const rede = String(r.rede ?? "") as RedeDeReferencia;
        const bruto = String(r.perfil ?? "").trim();
        if (!bruto || !REDES_DE_REFERENCIA.includes(rede) || rede === "x") continue;
        if (rede === "linkedin" && !/linkedin\.com\/(company|school|showcase)\//i.test(bruto)) {
          return NextResponse.json({ error: "No LinkedIn, só página de empresa (o link com /company/)." }, { status: 400 });
        }
        const perfil = perfilCanonico(rede, bruto);
        if (perfil && !lista.some((x) => x.rede === rede && x.perfil === perfil)) lista.push({ rede, perfil });
      }
      if (!lista.length) return NextResponse.json({ error: "Escreva pelo menos uma referência (o @ ou o link do perfil)." }, { status: 400 });
      if (lista.length > MAX_REFERENCIAS_POR_PROJETO) {
        return NextResponse.json({ error: `São até ${MAX_REFERENCIAS_POR_PROJETO} referências por projeto. Fique com as que mais parecem com o que você quer ser.` }, { status: 400 });
      }
      const proprias = await redesDoCliente(id);
      if (lista.some((x) => proprias.some((p) => p.rede === x.rede && p.perfil === x.perfil))) {
        return NextResponse.json({ error: "Uma das referências é o seu próprio perfil. Escolha perfis de outras pessoas do seu segmento." }, { status: 400 });
      }
      // O teto da conta (10, somando os projetos), sem contar as deste projeto
      // que serão trocadas. Conta admin (a nossa) não tem teto, como nos limites do plano.
      const naConta = await prisma.referenciaPerfil.count({ where: { status: "confirmado", project: { userId: a.projeto.userId }, NOT: { projectId: id } } });
      if (naConta + lista.length > MAX_REFERENCIAS_POR_CONTA && !(await eAdmin(a.userId))) {
        return NextResponse.json({ error: `A conta já tem ${naConta} perfis de referência em outros projetos (o limite é ${MAX_REFERENCIAS_POR_CONTA}). Tire algum lá para estudar estes.` }, { status: 409 });
      }
      // As de antes que saíram da lista voltam a "sugerido" (não apaga: o histórico e os posts ficam).
      await prisma.referenciaPerfil.updateMany({
        where: { projectId: id, status: "confirmado", NOT: { OR: lista.map((x) => ({ rede: x.rede, perfil: x.perfil })) } },
        data: { status: "sugerido" },
      });
      for (const x of lista) {
        await prisma.referenciaPerfil.upsert({
          where: { projectId_rede_perfil: { projectId: id, rede: x.rede, perfil: x.perfil } },
          create: { projectId: id, rede: x.rede, perfil: x.perfil, url: urlDoPerfil(x.rede, x.perfil), nome: x.perfil, motivo: "indicado por você", status: "confirmado", origem: "cliente" },
          update: { status: "confirmado" },
        });
      }
      const estado = await pedirAnalise(id, { tipo: "cliente", origem: "criacao", base: req.nextUrl.origin, userId: a.userId });
      if (!estado) {
        const { estado: vivo } = await lerAnalise(id);
        return NextResponse.json({ error: "Já há um estudo rodando neste projeto. As novas referências entram assim que ele terminar.", estado: vivo }, { status: 409 });
      }
      after(() => rodarAnalise(id));
      return NextResponse.json({ aceito: true, referencias: lista }, { status: 202 });
    }

    if (corpo.acao === "setup") {
      const setup = await gerarSetupSugerido(id);
      if (!setup) return NextResponse.json({ error: "Ainda não há estudo suficiente para sugerir o setup. Estude o seu perfil primeiro." }, { status: 409 });
      const admin = await eAdmin(a.userId);
      return NextResponse.json({ setup: admin ? setup : { ...setup, custo: { apifyUsd: 0, iaUsd: 0, estimado: true } } });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    console.error(`[perfil-proprio][${corpo.acao}] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui terminar agora (código REF-PRO). Tente de novo em instantes." }, { status: 502 });
  }
}
