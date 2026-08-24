export const dynamic = "force-dynamic";
// Uma chamada de visão sobre alguns quadros, mais a geração do fundo. Não é
// rápida, mas também não é a etapa longa: o corte em si roda no worker, sem
// teto de tempo.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { decidirEnquadramento, type QuadroDeTrecho } from "@/lib/media/enquadramento";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import {
  brilhoAoRedorDaPessoa,
  brilhoDoVideo,
  type GradeDeLuz,
} from "@/lib/media/brilho-do-fundo";
import { gerarFundoDoCorte } from "@/lib/media/fundo-do-corte";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";

/**
 * O worker pergunta como enquadrar cada corte, e quem responde é o squad.
 *
 * Por que a decisão mora AQUI e não no worker, que já tem os quadros na mão:
 *
 * 1. A conta de custo de IA do projeto vive num lugar só, a tabela `ai_usage`.
 *    Worker chamando o modelo por fora seria gasto invisível, que é exatamente
 *    o problema que o timeout de 90s criou em 22/08, quando três tentativas
 *    abortadas foram cobradas sem virar uma linha sequer.
 * 2. Prompt de agente é produto, e produto se edita num lugar só.
 *
 * Esta rota NÃO tem sessão, e não pode ter: quem chama é o worker, de outra
 * hospedagem. A autenticação é a assinatura sobre o corpo inteiro.
 *
 * ## Por que o FUNDO dos cortes passou a ser gerado aqui
 *
 * Até 24/08 ele era gerado antes de despachar o trabalho, junto do resto do
 * pedido. Isso deixou de servir quando o fundo passou a depender do brilho da
 * gravação, que é a sacada do Bruno para o halo do recorte: para medir esse
 * brilho é preciso saber ONDE a pessoa está, e quem diz isso é o agente de
 * visão, que só responde aqui.
 *
 * Este é o único ponto do fluxo em que as duas coisas existem ao mesmo tempo: a
 * caixa da pessoa e os pixels do quadro. Gerar em qualquer outro lugar exigiria
 * uma ida e volta a mais entre o app e o worker.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const corpoCru = await req.text();

  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      clips: true,
      // A paleta e o estilo alimentam a ARTE do fundo: as cores da marca e a
      // direcao de arte do estilo de edicao. O nicho saiu do prompt quando o
      // fundo deixou de ser um "ambiente" e virou design.
      project: { select: { colorPalette: true, videoStyle: true } },
    },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  let trechos: QuadroDeTrecho[];
  let candidatosDeCapa: string[] = [];
  let grades = new Map<number, GradeDeLuz>();
  try {
    const corpo = JSON.parse(corpoCru) as {
      trechos?: (QuadroDeTrecho & { luz?: GradeDeLuz })[];
      candidatosDeCapa?: string[];
    };
    trechos = Array.isArray(corpo.trechos) ? corpo.trechos : [];
    candidatosDeCapa = Array.isArray(corpo.candidatosDeCapa) ? corpo.candidatosDeCapa : [];
    grades = new Map(
      (corpo.trechos ?? [])
        .filter((t) => t.luz?.luz)
        .map((t) => [t.indice, t.luz as GradeDeLuz])
    );
  } catch {
    return NextResponse.json({ error: "Corpo não é JSON" }, { status: 400 });
  }
  if (!trechos.length) {
    return NextResponse.json({ error: "Nenhum quadro recebido" }, { status: 400 });
  }

  try {
    const { enquadramentos, capa } = await decidirEnquadramento(
      trechos,
      { projectId: video.projectId },
      candidatosDeCapa
    );

    // O brilho do fundo ORIGINAL, medido no anel em volta da caixa da pessoa.
    // Só faz sentido nos trechos em que ela aparece: onde é só tela, o que está
    // atrás dela não existe.
    const brilho = brilhoDoVideo(
      enquadramentos.map((e) => {
        const grade = grades.get(e.indice);
        if (!grade || !e.pessoa) return null;
        return brilhoAoRedorDaPessoa(grade, e.pessoa);
      })
    );

    // O FUNDO GERADO ESTA DESLIGADO, por decisao do Bruno em 24/08 a noite,
    // depois de tres iteracoes de arte reprovadas: "sera que nao esta usando
    // as premissas erradas?". Estava. O formato que o mercado inteiro usa em
    // corte de fala (OpusClip, CapCut, todo canal grande) e o video REAL da
    // pessoa, com o fundo real dela, cortado em 9:16 no rosto, com legenda
    // grande. Ninguem recorta a pessoa e cola numa arte gerada. Sem fundo
    // gerado tambem morrem juntos: o halo, a mascara vazando, o gosto da arte
    // e uma geracao de imagem por video.
    const fundo = null as { url: string; brilhoAlvo: number } | null;
    void gerarEGuardarFundo;
    void brilho;

    console.log(
      `[${id}] enquadramento pronto. Brilho do fundo original: ` +
        `${brilho ?? "nao medido"}. Fundo gerado: ${fundo ? "sim" : "nao"}`
    );

    return NextResponse.json({
      enquadramentos,
      capa,
      fundoUrl: fundo?.url ?? null,
      brilhoAlvo: fundo?.brilhoAlvo ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao decidir o enquadramento";
    // 200 com `ok: false` de propósito: o worker deve SEGUIR, usando o
    // tratamento seguro, em vez de abortar o trabalho inteiro. Entregar corte
    // com enquadramento mediano é muito melhor que não entregar corte nenhum
    // porque o agente de visão teve um dia ruim.
    return NextResponse.json({
      ok: false,
      erro: message,
      enquadramentos: [],
      capa: null,
      fundoUrl: null,
      brilhoAlvo: null,
    });
  }
}

/**
 * Gera o fundo e guarda no storage.
 *
 * Separado e com try próprio porque falhar aqui NÃO pode derrubar o
 * enquadramento, que é a resposta principal desta rota. Sem fundo o corte sai
 * na composição com o slide, que é pior mas existe; sem enquadramento ele sai
 * com o tratamento seguro em todos os trechos, que é bem pior.
 */
async function gerarEGuardarFundo(
  id: string,
  video: {
    clips: unknown;
    projectId: string;
    project: { colorPalette: string | null; videoStyle: string | null } | null;
  },
  brilho: number | null
): Promise<{ url: string; brilhoAlvo: number } | null> {
  try {
    const fundo = await gerarFundoDoCorte(
      {
        paleta: video.project?.colorPalette,
        estilo: video.project?.videoStyle,
        brilhoDoOriginal: brilho,
      },
      { projectId: video.projectId }
    );
    if (!fundo) return null;

    const { url } = await put(
      `cortes/${id}/fundo.jpg`,
      dataUrlToBuffer(fundo.imagem),
      { access: "private", contentType: "image/jpeg", addRandomSuffix: true }
    );
    console.log(`[${id}] fundo dos cortes gerado: ${fundo.descricao}`);
    return { url, brilhoAlvo: fundo.brilhoAlvo };
  } catch (e) {
    console.error(
      `[${id}] fundo dos cortes falhou, cortes saem com o slide: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
    return null;
  }
}
