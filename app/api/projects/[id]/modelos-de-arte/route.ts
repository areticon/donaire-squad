import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";
import { esquecerIdentidade, identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { listaDaPaleta } from "@/lib/modelos-de-arte/identidade";
import { lerModelosEscolhidos, salvarModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import { fotosDaVitrine, pessoasDeBanco, type PessoaDaPrevia } from "@/lib/modelos-de-arte/fotos-do-book";
import { estadoDaIdentidade, lerIdentidadeVisual, salvarIdentidadeVisual } from "@/lib/modelos-de-arte/identidade-aprovada";
import { artesAguardandoIdentidade, gerarGruposMarcados, iniciarGeracaoDasArtes } from "@/lib/media/artes-aguardando-identidade";
import { contarArtesEsperando } from "@/lib/modelos-de-arte/espera-da-identidade";

/**
 * O BOOK DE MODELOS DO PROJETO (03/10/2026).
 *
 * GET devolve a escolha e o que a galeria precisa para desenhar cada modelo na
 * marca do cliente (cores efetivas, logo, nome, setor para o texto de exemplo).
 * PUT { ids } grava a escolha, que a geração das artes obedece
 * (lib/media/arte-com-frase.tsx). Só o dono muda, como a direção visual.
 *
 * 05/10: devolve também as fotos das prévias (uma diferente por modelo), a
 * pessoa do cliente (a foto real já recortada, quando existe; tem prioridade)
 * e a lista de pessoas de banco sorteada para o projeto, de onde cada modelo
 * com recorte pega a sua (lib/modelos-de-arte/fotos-do-book.ts); nunca silhueta.
 *
 * 05/10, A IDENTIDADE APROVADA (lib/modelos-de-arte/identidade.ts): GET traz
 * a paleta, a letra, os papéis das cores, as fotos (naturais, preto e branco
 * ou nas cores da marca) e se está aprovada; PUT aceita { letra, papeis,
 * fotos, aprovar } além de { ids }; POST gera as artes que ficaram
 * aguardando a aprovação (só o dono, e só com a identidade aprovada).
 *
 * 05/10, noite: o POST RESPONDE NA HORA. O Bruno clicou em "Aprovar e gerar
 * (1 arte esperando)" e o botão ficou girando minutos com "Gerando...". Agora
 * o clique só marca o que vai ser desenhado ("o squad está fazendo" no
 * quadro) e responde; o desenho roda depois da resposta, com `after()`, e a
 * tela manda o cliente de volta ao quadro, onde a arte cai.
 */
export const dynamic = "force-dynamic";
/** O desenho depois da resposta (`after`) ainda precisa do tempo da função: até 800 s, como a esteira. */
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
  const [estado, aguardando, todas] = await Promise.all([
    estadoDaIdentidade(projectId, colorPalette),
    artesAguardandoIdentidade(projectId).catch(() => []),
    artesAguardandoIdentidade(projectId, { incluirGerando: true }).catch(() => []),
  ]);
  // Conta ARTES (um grupo por dia e campanha), não posts: o carrossel do X e
  // do Instagram do mesmo dia é uma arte esperando, e não duas.
  const esperando = contarArtesEsperando(aguardando);
  return {
    letra: estado.letra,
    papeis: estado.papeis,
    fotos: estado.fotos,
    paleta: estado.paleta,
    aprovada: estado.aprovada,
    aprovadaEm: estado.registro?.aprovadaEm ?? null,
    aguardando: esperando,
    /** Quantas artes o "Aprovar e gerar" está desenhando agora. */
    gerando: Math.max(0, contarArtesEsperando(todas) - esperando),
    /** O design da biblioteca aprovado como estilo dos posts (08/10). */
    design: estado.design,
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
  // Fonte única (06/10): com paleta salva, a identidade tem que vir dela.
  const salva = listaDaPaleta(p.colorPalette);
  const divergiu = salva.length > 0 && (identidade.origemDasCores !== "configuracao" || !salva.includes(identidade.cores.acento.toLowerCase()));
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
    pessoa: daFotoReal,
    pessoas: pessoasDeBanco(id),
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
  const corpo = (await req.json().catch(() => ({}))) as { ids?: unknown; letra?: unknown; papeis?: unknown; fotos?: unknown; aprovar?: unknown };
  let escolha = await lerModelosEscolhidos(id);
  let modelosMudaram = false;
  if (Array.isArray(corpo.ids)) {
    const ids = corpo.ids.filter((x): x is string => typeof x === "string");
    const antes = JSON.stringify(escolha?.ids ?? []);
    escolha = await salvarModelosEscolhidos(id, ids);
    modelosMudaram = antes !== JSON.stringify(escolha?.ids ?? []);
  }
  const aprovar = corpo.aprovar === true;
  // O design escrito ou escolhido na biblioteca vale como estilo (08/10): quem
  // tem um aprovado e só mexeu na letra ou nas cores aprova sem modelo do book.
  const comDesign = aprovar && !modelosMudaram && Boolean((await lerIdentidadeVisual(id))?.design);
  if (aprovar && !escolha?.ids.length && !comDesign) return NextResponse.json({ error: "Escolha ao menos um modelo de arte (ou escreva o estilo dos posts) antes de aprovar." }, { status: 400 });
  // Qualquer mudança (modelo, letra ou papéis) derruba a aprovação; só o
  // "Aprovar e gerar" carimba de novo, com o que está na tela agora.
  if (aprovar || modelosMudaram || corpo.letra !== undefined || corpo.papeis !== undefined || corpo.fotos !== undefined) {
    await salvarIdentidadeVisual(id, { letra: corpo.letra, papeis: corpo.papeis, fotos: corpo.fotos, aprovar, modelosMudaram });
  }
  return NextResponse.json({ escolha: escolha?.ids ?? [], em: escolha?.em ?? null, identidade: await identidadeParaATela(id, p.colorPalette) });
}

/**
 * Começa a gerar as artes que ficaram aguardando a identidade e responde na
 * hora com quantas são; o desenho roda depois da resposta e cobra cada arte
 * depois de ela sair. O mesmo POST é o "Tentar de novo" do quadro: a arte
 * que falhou continua marcada e entra de novo.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await projetoDoUsuario(id, userId);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const recusa = await soODono(userId, p, "gerar as artes que aguardavam a identidade visual");
  if (recusa) return recusa;
  try {
    const args = { projectId: id, userId: p.userId };
    const { grupos, frase } = await iniciarGeracaoDasArtes(args);
    if (grupos.length) {
      after(async () => {
        const r = await gerarGruposMarcados(args, grupos).catch((e) => ({ frase: e instanceof Error ? e.message : String(e) }));
        console.log(`[identidade][gerar] ${id}: ${r.frase}`);
      });
    }
    return NextResponse.json({ iniciadas: grupos.length, total: grupos.length, frase, identidade: await identidadeParaATela(id, p.colorPalette) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui gerar as artes." }, { status: 400 });
  }
}
