export const dynamic = "force-dynamic";
// Uma chamada de texto e uma de imagem por corte, em paralelo. Com 7 cortes e a
// composição de capa levando até 90s, o teto precisa ser generoso.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { lerMidia, midiaProduzida } from "@/lib/media/storage";
import { put } from "@vercel/blob";
import { acessoAoVideo } from "@/lib/media/piloto-do-servidor";
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id } = await params;
  // Sessão do dono OU assinatura do piloto do servidor (ver piloto-do-servidor.ts).
  const acesso = await acessoAoVideo(req, id);
  if (!acesso) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const video = await prisma.videoJob.findFirst({
    where: acesso.where,
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
          // O quadro pode estar no store privado (acervo antigo) ou no
          // público (produzido a partir de 01/09), então quem lê precisa
          // saber dos dois. `fetch` puro numa URL privada devolve 403,
          // armadilha que este projeto já pagou três vezes.
          const bytes = await lerMidia(quadro);
          if (bytes) {
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
                  // Capa é mídia PRODUZIDA: vai para o store público, que é
                  // quem entrega cache e Range ao navegador do cliente.
                  ...midiaProduzida(),
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
