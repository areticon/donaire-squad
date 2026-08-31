export const dynamic = "force-dynamic";
// Uma chamada de texto e uma de imagem por corte, em paralelo. Com 7 cortes e a
// composição de capa levando até 90s, o teto precisa ser generoso.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { put, get } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { escreverTextoDoCorte, comporCapa } from "@/lib/media/capa-e-titulo";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";

/**
 * Título, descrição e capa de cada corte marcado.
 *
 * Roda depois que o cliente escolheu o que sobe, e não antes: gerar texto e
 * capa para corte que ele vai desmarcar é gastar dinheiro em trabalho que
 * ninguém pediu. Com 7 cortes, gerar para todos custaria quase o dobro de quem
 * publica 4.
 *
 * A capa é COMPOSIÇÃO sobre o quadro real (decisão do Bruno, opção A). Quando a
 * composição falha, o corte fica com o quadro real puro, que é pior mas honesto:
 * arte genérica sem o cliente dentro é exatamente o que a decisão descartou.
 */

type TrechoComTudo = Trecho & {
  publicar?: boolean;
  midia?: {
    capa?: { url: string } | null;
    capaArte?: { url: string } | null;
  } | null;
  texto?: {
    titulo: string;
    descricao: string;
    fraseDaCapa: string;
    expressao?: string;
    cenario?: string;
  };
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const video = await prisma.videoJob.findFirst({
    where: { id, project: { userId } },
    select: {
      id: true,
      status: true,
      clips: true,
      capaFonteUrl: true,
      projectId: true,
      project: { select: { niche: true, targetAudience: true, voice: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  if (video.status !== "cut" && video.status !== "ready") {
    return NextResponse.json(
      { error: `Vídeo está em "${video.status}". Os textos saem depois do corte.` },
      { status: 409 }
    );
  }

  const trechos = (video.clips as unknown as TrechoComTudo[]) ?? [];
  const alvos = trechos
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.publicar !== false);

  if (!alvos.length) {
    return NextResponse.json(
      { error: "Nenhum corte está marcado. Marque pelo menos um." },
      { status: 400 }
    );
  }

  const contexto = {
    nicho: video.project.niche,
    publico: video.project.targetAudience,
    voz: video.project.voice,
  };

  const resultados = await Promise.all(
    alvos.map(async ({ t, i }) => {
      try {
        const texto = await escreverTextoDoCorte(t, contexto, {
          projectId: video.projectId,
        });

        let capaArte: { url: string } | null = null;
        // O quadro do ROSTO, escolhido pelo squad varrendo o vídeo inteiro, e
        // não o quadro de dentro do trecho.
        //
        // A diferença decide se a capa presta: os melhores momentos de fala não
        // coincidem com os melhores momentos de imagem. Na gravação de teste,
        // todos os sete trechos caíam em tela compartilhada, e a capa saía com
        // texto branco em cima de um slide. O quadro certo estava no segundo 20,
        // na abertura, que a seleção de trechos descarta de propósito.
        //
        // Cai para o quadro do trecho quando a varredura não achou nada, que é
        // melhor que não ter capa.
        const quadro = video.capaFonteUrl ?? t.midia?.capa?.url;
        if (quadro) {
          // O quadro vive no storage privado, então precisa do SDK. `fetch`
          // devolveria 403, armadilha que este projeto já pagou três vezes.
          const blob = await get(quadro, {
            access: "private",
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          if (blob && blob.statusCode === 200) {
            const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
            const arte = await comporCapa(bytes.toString("base64"), texto.fraseDaCapa, {
              expressao: texto.expressao,
              cenario: texto.cenario,
              nicho: video.project.niche,
              usageCtx: { projectId: video.projectId },
              // O corte é vertical, a capa dele também. A thumb 16:9 do vídeo
              // completo vem do quadro-fonte, não daqui.
              formato: "9:16",
            });
            if (arte) {
              const { url } = await put(
                `cortes/${video.id}/capa-arte-${i}.jpg`,
                dataUrlToBuffer(arte),
                {
                  access: "public",
                  token: process.env.BLOB_READ_WRITE_TOKEN,
                  contentType: "image/jpeg",
                  addRandomSuffix: true,
                }
              );
              capaArte = { url };
            }
          }
        }

        return { i, texto, capaArte, erro: null as string | null };
      } catch (err) {
        // Um corte que falha não derruba os outros, mesma regra do worker.
        return {
          i,
          texto: null,
          capaArte: null,
          erro: err instanceof Error ? err.message : "falhou",
        };
      }
    })
  );

  const atualizados = trechos.map((t, i) => {
    const r = resultados.find((x) => x.i === i);
    if (!r || !r.texto) return t;
    return {
      ...t,
      texto: r.texto,
      midia: { ...(t.midia ?? {}), capaArte: r.capaArte },
    };
  });

  await prisma.videoJob.update({
    where: { id },
    data: { clips: atualizados as never },
  });

  const comTexto = resultados.filter((r) => r.texto).length;
  const comArte = resultados.filter((r) => r.capaArte).length;
  const falhas = resultados.filter((r) => r.erro);

  return NextResponse.json({
    ok: comTexto > 0,
    comTexto,
    comArte,
    // A diferença entre texto e arte importa para a tela: capa que não compôs
    // não é falha do corte, é o quadro real seguindo sem tratamento.
    erros: falhas.map((f) => `corte ${f.i}: ${f.erro}`),
  });
}
