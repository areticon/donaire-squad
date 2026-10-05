import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { PALETA_PADRAO_DA_PLATAFORMA, esquecerIdentidade, identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { lerModelosEscolhidos, salvarModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import { fotosDaVitrine, pessoaDeBanco, type PessoaDaPrevia } from "@/lib/modelos-de-arte/fotos-do-book";
import { estadoDaIdentidade, salvarIdentidadeVisual } from "@/lib/modelos-de-arte/identidade-aprovada";
import { artesAguardandoIdentidade, gerarArtesAguardando } from "@/lib/media/artes-aguardando-identidade";

/**
 * O BOOK DE MODELOS DO PROJETO (03/10/2026).
 *
 * GET devolve a escolha e o que a galeria precisa para desenhar cada modelo na
 * marca do cliente (cores efetivas, logo, nome, setor para o texto de exemplo).
 * PUT { ids } grava a escolha, que a geração das artes obedece
 * (lib/media/arte-com-frase.tsx). Só o dono muda, como a direção visual.
 *
 * 05/10: devolve também as fotos das prévias (uma diferente por modelo) e a
 * pessoa do "Você na frente do título" (a foto real do cliente já recortada,
 * ou uma pessoa de banco de imagem recortada; nunca silhueta).
 *
 * 05/10, A IDENTIDADE APROVADA (lib/modelos-de-arte/identidade.ts): GET traz
 * a paleta, a letra, os papéis das cores e se está aprovada; PUT aceita
 * { letra, papeis, aprovar } além de { ids }; POST gera as artes que ficaram
 * aguardando a aprovação (só o dono, e só com a identidade aprovada).
 */
export const dynamic = "force-dynamic";
/** O POST desenha as artes que esperavam: até 800 s, como a esteira. */
export const maxDuration = 800;

async function projetoDoUsuario(projectId: string, userId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, name: true, logoUrl: true, colorPalette: true, socialAccounts: { where: { platform: "instagram" }, select: { username: true }, take: 1 } },
  });
  return p && (await podeUsarProjeto(userId, p)) ? p : null;
}

/**
 * A foto real do cliente com a pessoa JÁ recortada (o recorte é pago uma vez,
 * na geração da arte; aqui só se reaproveita, nunca se paga). Sem nenhuma, a
 * prévia usa uma pessoa de banco de imagem.
 */
async function pessoaDoCliente(projectId: string): Promise<PessoaDaPrevia | null> {
  const m = await prisma.materialDoCliente
    .findFirst({
      where: { projectId, tipo: "foto", status: "pronto", recorteUrl: { not: null }, etiquetas: { has: "pessoa" }, NOT: { qualidade: "fraca" } },
      orderBy: [{ usos: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    })
    .catch(() => null);
  if (!m) return null;
  const base = `/api/projects/${projectId}/materiais/${m.id}/arquivo`;
  return { fundo: `${base}?v=original`, recorte: `${base}?v=recorte`, origem: "cliente" };
}

/** O estado da identidade como a galeria lê. */
async function identidadeParaATela(projectId: string, colorPalette: string | null) {
  const [estado, aguardando] = await Promise.all([estadoDaIdentidade(projectId, colorPalette), artesAguardandoIdentidade(projectId).catch(() => [])]);
  return {
    letra: estado.letra,
    papeis: estado.papeis,
    paleta: estado.paleta,
    aprovada: estado.aprovada,
    aprovadaEm: estado.registro?.aprovadaEm ?? null,
    aguardando: aguardando.length,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [escolha, identidadeGuardada, daFotoReal] = await Promise.all([lerModelosEscolhidos(id), identidadeDoProjeto(id), pessoaDoCliente(id)]);
  // A identidade fica 10 min em cache por processo. Se a paleta mudou nesse
  // meio tempo (o Bruno trocou para o escarlate em 05/10), a prévia não pode
  // seguir na cor velha: confere com a paleta gravada e refaz quando diverge.
  let identidade = identidadeGuardada;
  const primeira = (p.colorPalette ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const divergiu = identidade.origemDasCores === "configuracao" ? primeira !== identidade.cores.acento.toLowerCase() : /^#[0-9a-f]{6}$/.test(primeira) && primeira !== PALETA_PADRAO_DA_PLATAFORMA.split(",")[0].toLowerCase();
  if (divergiu) {
    esquecerIdentidade(id);
    identidade = await identidadeDoProjeto(id);
  }
  const usuario = p.socialAccounts[0]?.username?.replace(/^@/, "");
  return NextResponse.json({
    escolha: escolha?.ids ?? [],
    em: escolha?.em ?? null,
    podeMudar: p.userId === userId,
    marca: {
      // O nome que aparece nas prévias é o do projeto (o do cliente), nunca fixo.
      nome: p.name,
      cores: identidade.cores,
      origemDasCores: identidade.origemDasCores,
      logoUrl: p.logoUrl,
      setor: identidade.setor.id,
      setorNome: identidade.setor.nome,
      arroba: usuario ? `@${usuario}` : undefined,
    },
    fotos: fotosDaVitrine(identidade.setor.id, id),
    pessoa: daFotoReal ?? pessoaDeBanco(id),
    identidade: await identidadeParaATela(id, p.colorPalette),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, p, "mudar os modelos de arte da marca");
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown; letra?: unknown; papeis?: unknown; aprovar?: unknown };
  let escolha = await lerModelosEscolhidos(id);
  let modelosMudaram = false;
  if (Array.isArray(corpo.ids)) {
    const ids = corpo.ids.filter((x): x is string => typeof x === "string");
    const antes = JSON.stringify(escolha?.ids ?? []);
    escolha = await salvarModelosEscolhidos(id, ids);
    modelosMudaram = antes !== JSON.stringify(escolha?.ids ?? []);
  }
  const aprovar = corpo.aprovar === true;
  if (aprovar && !escolha?.ids.length) return NextResponse.json({ error: "Escolha ao menos um modelo de arte antes de aprovar." }, { status: 400 });
  // Qualquer mudança (modelo, letra ou papéis) derruba a aprovação; só o
  // "Aprovar e gerar" carimba de novo, com o que está na tela agora.
  if (aprovar || modelosMudaram || corpo.letra !== undefined || corpo.papeis !== undefined) {
    await salvarIdentidadeVisual(id, { letra: corpo.letra, papeis: corpo.papeis, aprovar, modelosMudaram });
  }
  return NextResponse.json({ escolha: escolha?.ids ?? [], em: escolha?.em ?? null, identidade: await identidadeParaATela(id, p.colorPalette) });
}

/** Gera as artes que ficaram aguardando a identidade. Cobra cada uma depois de sair. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, p, "gerar as artes que aguardavam a identidade visual");
  if (recusa) return recusa;
  try {
    const r = await gerarArtesAguardando({ projectId: id, userId: p.userId });
    return NextResponse.json({ ...r, identidade: await identidadeParaATela(id, p.colorPalette) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui gerar as artes." }, { status: 400 });
  }
}
