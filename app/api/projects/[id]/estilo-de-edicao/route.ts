import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import {
  CATALOGO_DE_ESTILOS,
  MOVIMENTOS_DE_CAMERA,
  EFEITOS,
  LOOKS,
  estiloDoCatalogo,
  normalizarEscolha,
} from "@/lib/media/catalogo-de-estilos";
import { coresDaMarca, familiaDaLinguagem } from "@/lib/media/capa-composta";
import { LEGENDA_AUTOMATICA, normalizarLegenda } from "@/lib/media/legenda-escolhida";

/**
 * O estilo de edição do projeto, em camadas (29/09).
 *
 * GET devolve a escolha guardada. PUT grava a escolha e o perfil de legenda
 * (`videoStyle`) que a base da linguagem pede, no MESMO lugar: se a tela
 * gravasse os dois separados, um dia um ficaria para trás e o corte sairia com
 * o ritmo de outro estilo.
 *
 * POST { texto } é o "escrever com as minhas palavras": o diretor lê o texto e
 * devolve a linguagem mais próxima, as camadas e a leitura dele em uma frase,
 * SEM gravar. A tela mostra a leitura e só grava quando o cliente confirma,
 * que é o desenho aprovado ("a tela mostra a interpretação para ele confirmar
 * antes de editar").
 *
 * PATCH { legenda } muda SÓ a legenda (30/09). O PUT guarda a legenda que já
 * estava, e não a do corpo: a tela de roteiro também muda a legenda, e um PUT
 * atrasado do catálogo, com a escolha que ele carregou antes, desfaria a
 * troca sem ninguém ver. Cada campo tem um só caminho de escrita.
 *
 * As respostas levam `legendaAutomatica` (o estilo que o modo automático usa
 * com a linguagem guardada) e as cores da marca, para a prévia da tela sair
 * nas cores do cliente sem o componente tocar no banco.
 */
export const dynamic = "force-dynamic";

async function donoDoProjeto(id: string): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true } });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  return podeUsarProjeto(userId, p);
}

/** O estilo que "legenda automática" usa com esta linguagem. */
const automaticaDa = (estiloId: string) => LEGENDA_AUTOMATICA[familiaDaLinguagem(estiloId)];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = await prisma.project.findUnique({ where: { id }, select: { videoEstiloEscolha: true, videoStyle: true, colorPalette: true } });
  const escolha = normalizarEscolha(p?.videoEstiloEscolha, p?.videoStyle);
  return NextResponse.json({ escolha, legendaAutomatica: automaticaDa(escolha.estiloId), marca: coresDaMarca(p?.colorPalette) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guardada = await prisma.project.findUnique({ where: { id }, select: { videoEstiloEscolha: true } });
  const escolha = {
    ...normalizarEscolha(await req.json().catch(() => ({}))),
    // A legenda que já estava, e não a do corpo (ver o comentário do topo).
    legenda: normalizarLegenda((guardada?.videoEstiloEscolha as { legenda?: unknown } | null)?.legenda),
  };
  const base = estiloDoCatalogo(escolha.estiloId)?.base ?? "acelerado";
  await prisma.project.update({ where: { id }, data: { videoEstiloEscolha: escolha as never, videoStyle: base } });
  return NextResponse.json({ ok: true, escolha, base, legendaAutomatica: automaticaDa(escolha.estiloId) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const corpo = (await req.json().catch(() => ({}))) as { legenda?: unknown };
  if (!corpo.legenda || typeof corpo.legenda !== "object") {
    return NextResponse.json({ error: "Diga se quer legenda e em qual estilo." }, { status: 400 });
  }
  const p = await prisma.project.findUnique({ where: { id }, select: { videoEstiloEscolha: true, videoStyle: true } });
  // A escolha normalizada, e não o Json cru: projeto que nunca abriu o
  // catálogo passa a ter a escolha guardada, com a mesma linguagem que o
  // padrão já dava (o `videoStyle` não muda).
  const escolha = { ...normalizarEscolha(p?.videoEstiloEscolha, p?.videoStyle), legenda: normalizarLegenda(corpo.legenda) };
  await prisma.project.update({ where: { id }, data: { videoEstiloEscolha: escolha as never } });
  return NextResponse.json({ ok: true, legenda: escolha.legenda, legendaAutomatica: automaticaDa(escolha.estiloId) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await donoDoProjeto(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { texto } = (await req.json().catch(() => ({}))) as { texto?: string };
  const limpo = (texto ?? "").trim().slice(0, 600);
  if (limpo.length < 8) return NextResponse.json({ error: "Escreva um pouco mais sobre o estilo que você quer." }, { status: 400 });

  const lista = (itens: Array<{ id: string; nome: string; resumo: string }>) => itens.map((i) => `- ${i.id}: ${i.nome}. ${i.resumo}`).join("\n");
  const sistema = `Você é o diretor de edição de vídeo da Demandou. O cliente descreveu com as próprias palavras o estilo de edição que quer. Traduza para o catálogo abaixo, sem inventar opção fora dele. As cores, a fonte e o logo são sempre os da marca do cliente, então "estilo Vox" quer dizer a linguagem da Vox com as cores dele.

LINGUAGENS:
${lista(CATALOGO_DE_ESTILOS.map((e) => ({ id: e.id, nome: `${e.nome}${e.referencia ? ` (${e.referencia})` : ""}`, resumo: e.resumo })))}

MOVIMENTOS DE CÂMERA (zero a três):
${lista(MOVIMENTOS_DE_CAMERA)}

EFEITOS (zero a três):
${lista(EFEITOS)}

LOOKS (um ou nenhum):
${lista(LOOKS)}

Responda SOMENTE com JSON válido, sem cerca de código:
{"estiloId":"...","camera":["..."],"efeitos":["..."],"look":"..." ou null,"interpretacao":"uma ou duas frases em português, dirigidas ao cliente, dizendo o que você entendeu e o que muda em relação à linguagem de base (ritmo, legenda, trilha, grafismo). Nunca use travessão."}`;

  try {
    const bruto = await askClaude(sistema, `O cliente escreveu: "${limpo}"`, {
      maxTokens: 4000,
      usage: { projectId: id, operation: "estilo_interpretar" },
    } as never);
    const a = bruto.indexOf("{");
    const b = bruto.lastIndexOf("}");
    const dados = JSON.parse(bruto.slice(a, b + 1));
    const escolha = normalizarEscolha({ ...dados, texto: limpo, interpretacao: String(dados.interpretacao ?? "").replace(/[—–]/g, ",") });
    return NextResponse.json({ escolha });
  } catch (e) {
    console.error(`[estilo][interpretar] ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui ler o estilo agora. Tente de novo ou escolha na lista." }, { status: 502 });
  }
}
