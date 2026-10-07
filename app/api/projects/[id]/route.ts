import { alinharIdentidadeAPaleta, estadoDaIdentidade, salvarIdentidadeVisual } from "@/lib/modelos-de-arte/identidade-aprovada";
import { normalizarPapeis } from "@/lib/modelos-de-arte/identidade";
import { MAXIMO_DE_CORES, normalizarPaleta } from "@/lib/marca/cores-da-marca";
import { auth } from "@/lib/auth/server";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { revogarGemeo } from "@/lib/media/gemeo-servidor";
import { esquecerIdentidade } from "@/lib/media/identidade-visual";
import { FICHAS_DOS_AGENTES } from "@/lib/squad/definicoes-dos-agentes";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { apagarMemoriaDoProjeto } from "@/lib/cerebro/edicao";
import { CAMPOS_DO_ENVIO, soODono } from "@/lib/equipe/permissoes";
import { CHAVES_DOS_LINKS_NO_CONFIG } from "@/lib/projeto/links-do-cliente";

/**
 * O squad que o projeto ganha na ativação: as fichas centrais (29/09). Até
 * aqui era uma cópia própria, sem o Vitor, e ficaria sem os especialistas
 * novos. A esteira usa a ficha como reserva de quem não tiver linha.
 */
const DEFAULT_AGENTS = FICHAS_DOS_AGENTES;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow only safe, user-editable fields
  const ALLOWED_FIELDS = [
    "name", "description", "status", "niche", "voice",
    "targetAudience", "colorPalette", "postFrequency", "timezone", "setupStep", "config",
    // O estilo de edição de vídeo. Fica no projeto e não no envio, por decisão
    // do Bruno em 24/08: canal com estilo diferente a cada vídeo não constrói
    // reconhecimento.
    "videoStyle",
    // A trilha dos cortes: o espelho do onUploadCompleted, porque em
    // desenvolvimento o storage nao alcanca o localhost.
    "videoMusicUrl", "videoMusicName",
    // Os termos do negocio que a transcricao precisa acertar (30/08).
    "videoTerms",
    // A semana a partir do video: formato por dia, escolhido no envio (02/09).
    "videoSemana",
    // O estilo da capa do video completo no YouTube (02/09). Do projeto, como
    // o estilo de edicao: capa diferente a cada video nao constroi canal.
    "capaEstilo",
    // A marca (14/09): logo e manual. Espelho do onUploadCompleted da rota
    // /marca, pelo mesmo motivo da trilha: em desenvolvimento o storage nao
    // alcanca o localhost.
    "logoUrl", "brandManualUrl", "brandManualName",
  ] as const;
  type AllowedField = (typeof ALLOWED_FIELDS)[number];

  const data: Partial<Record<AllowedField, unknown>> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) data[key] = body[key];
  }

  // OS LINKS DO CLIENTE TÊM ROTA PRÓPRIA (06/10). Quem manda `config` aqui
  // manda o que tinha na mão quando a tela abriu; os links e o @ do YouTube
  // ficam sempre como estão no banco (quem muda é /api/projects/[id]/links).
  if (data.config && typeof data.config === "object" && !Array.isArray(data.config)) {
    const noBanco = (project.config as Record<string, unknown> | null) ?? {};
    const novo = { ...(data.config as Record<string, unknown>) };
    for (const k of CHAVES_DOS_LINKS_NO_CONFIG) {
      if (k in noBanco) novo[k] = noBanco[k];
      else delete novo[k];
    }
    data.config = novo;
  }

  // MEMBRO DA EQUIPE (01/10, acabamento): grava só as escolhas da jornada de
  // envio de vídeo. O resto (nome, voz, público, cores, capa, status, setup) é
  // configuração da marca, e é do dono. Ver lib/equipe/permissoes.ts.
  if (project.userId !== userId) {
    const doEnvio = new Set<string>(CAMPOS_DO_ENVIO);
    const foraDoEnvio = Object.keys(data).filter((k) => !doEnvio.has(k));
    if (foraDoEnvio.length > 0) {
      const recusa = await soODono(userId, project);
      if (recusa) return recusa;
    }
  }

  // A PALETA GRAVA NORMALIZADA (08/10). Até aqui a string ia crua, e cada
  // leitor filtrava de um jeito (um aceitava sem #, outro exigia #rrggbb):
  // uma cor "quase certa" valia numa peça, sumia noutra e deslocava o papel
  // das outras. Agora vai "#rrggbb" minúsculo, sem repetida, até o máximo do
  // seletor; vazio vira null (sem escolha: a arte usa logo, manual ou setor).
  if ("colorPalette" in data) {
    const bruta = data.colorPalette;
    const vazia = bruta === null || bruta === undefined || (typeof bruta === "string" && !bruta.trim()) || (Array.isArray(bruta) && !bruta.length);
    if (vazia) data.colorPalette = null;
    else if (typeof bruta !== "string" && !Array.isArray(bruta)) {
      return NextResponse.json({ error: "Mande as cores como texto, separadas por vírgula." }, { status: 400 });
    } else {
      const { cores, invalidas } = normalizarPaleta(bruta as string | string[]);
      if (invalidas.length) {
        return NextResponse.json(
          { error: `Não reconheci ${invalidas.map((c) => `"${c}"`).join(", ")} como cor. Use 6 dígitos, como #F97316 (com ou sem #).` },
          { status: 400 }
        );
      }
      data.colorPalette = cores.slice(0, MAXIMO_DE_CORES).join(",") || null;
    }
  }
  // Os papéis do book (fundo, título, destaque) que o seletor de cores manda
  // junto (08/10): só valem com a paleta, que é o que passa pela regra do dono.
  const papeisDaMarca = "colorPalette" in data && "papeisDaMarca" in body ? normalizarPapeis(body.papeisDaMarca) : null;
  const aprovadaAntes = "colorPalette" in data ? (await estadoDaIdentidade(id, project.colorPalette).catch(() => null))?.aprovada ?? false : false;

  const updated = await prisma.project.update({
    where: { id },
    data: data as Prisma.ProjectUpdateInput,
  });

  // A identidade visual fica 10 min em cache: mudou cor, logo, nicho ou
  // manual, a próxima prévia e a próxima arte já saem na marca nova (05/10).
  if (["colorPalette", "logoUrl", "niche", "name", "brandManualUrl", "targetAudience"].some((k) => k in data)) esquecerIdentidade(id);
  // A paleta salva é a fonte única da identidade (06/10): trocou a paleta, os
  // papéis aprovados acompanham, e a aprovação só cai se alguma cor saiu.
  //
  // 08/10: com os papéis do seletor, o book recebe exatamente o que a tela
  // chamou de Principal, Fundo e Texto (salvarIdentidadeVisual só derruba a
  // aprovação se algum papel mudou de cor). A resposta diz se a aprovação
  // caiu, para a tela avisar onde a pessoa está.
  let identidade: { aprovadaAntes: boolean; aprovadaAgora: boolean; papeis: unknown } | undefined;
  if ("colorPalette" in data) {
    if (papeisDaMarca) await salvarIdentidadeVisual(id, { papeis: papeisDaMarca }).catch((e) => console.error("[identidade] papéis do seletor:", e));
    else await alinharIdentidadeAPaleta(id).catch((e) => console.error("[identidade] alinhar à paleta:", e));
    const depois = await estadoDaIdentidade(id).catch(() => null);
    identidade = { aprovadaAntes, aprovadaAgora: depois?.aprovada ?? false, papeis: depois?.registro ? depois.papeis : null };
  }

  // Create default agents when project is activated for the first time
  if (body.status === "active") {
    const existing = await prisma.projectAgent.count({ where: { projectId: id } });
    if (existing === 0) {
      await prisma.projectAgent.createMany({
        data: DEFAULT_AGENTS.map((a) => ({ ...a, projectId: id })),
      });
    }
  }

  return NextResponse.json({ project: updated, ...(identidade ? { identidade } : {}) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Apagar é só do DONO (01/10): o membro da equipe usa o projeto, mas a marca
  // e o histórico são da conta que paga.
  const recusa = await soODono(userId, project, "apagar este projeto");
  if (recusa) return recusa;

  // O GÊMEO DIGITAL (01/10): o projeto some em cascata, mas a voz clonada na
  // ElevenLabs e os arquivos de rosto e voz no storage não. Revoga antes, que
  // é o que apaga os dois; falhar aqui não impede apagar o projeto.
  await revogarGemeo(id, "Projeto apagado.").catch((e) => console.error(`[gemeo][${id}] revogar ao apagar o projeto:`, e));
  // A MEMÓRIA DO PROJETO (06/10, termos): o que não sai em cascata com o
  // projeto (feedback do produto, elo com a biblioteca de design) sai aqui.
  await apagarMemoriaDoProjeto(id).catch((e) => console.error(`[cerebro][${id}] apagar a memória ao apagar o projeto:`, e));
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
