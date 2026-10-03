import { put } from "@vercel/blob";
import { lerMidia, midiaProduzida } from "@/lib/media/storage";
import { prisma } from "@/lib/db/prisma";
import { montarPedidoDeCorte, type VideoParaCortar } from "@/lib/media/pedido-de-corte";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { comporCapa, type Expressao } from "@/lib/media/capa-e-titulo";
import { dataUrlToBuffer } from "@/lib/media/nano-banana";
import { apagarMidias } from "@/lib/media/faxina";
import { gravarEdicaoDoPedido } from "@/lib/media/edicao-gravada";
import type { Word } from "@/lib/media/transcribe";
import type { Trecho } from "@/lib/media/select-clips";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * Os ajustes que o cliente pede depois de assistir: recomeçar o corte uns
 * segundos depois, terminar antes, refazer a capa com uma instrução.
 *
 * Nasceu do pedido do Bruno em 01/09: "o meu segundo corte começou um
 * pouquinho fora; se tivesse um controle igual tem no CapCut eu cortaria o
 * início... quero que o usuário interaja com os agentes pedindo ajustes".
 *
 * O re-corte manda ao worker um pedido SÓ com o trecho ajustado
 * (`soTrechos`), montado pelo MESMO `montarPedidoDeCorte` de produção, então
 * limpeza, legenda e estilo continuam idênticos; o completo não é refeito. O
 * callback funde só a mídia daquele índice, sem tocar em aprovação nem posts.
 */

type ClipEmEdicao = Trecho & {
  midia?: Record<string, unknown> | null;
};

const DURACAO_MINIMA = 10;

export async function refazerCorte(
  videoJobId: string,
  userId: string,
  indice: number,
  ajuste: { inicioDelta?: number; fimDelta?: number }
): Promise<{ inicio: number; fim: number }> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("A edição de vídeo não está disponível agora.");

  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: projetoVisivel(userId) },
    select: {
      id: true,
      blobUrl: true,
      durationSec: true,
      projectId: true,
      clips: true,
      transcript: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true } },
    },
  });
  if (!video) throw new Error("Vídeo não encontrado.");

  const trechos = (video.clips as unknown as ClipEmEdicao[]) ?? [];
  const alvo = trechos[indice];
  if (!alvo) throw new Error("Esse corte não existe.");

  const duracaoTotal = video.durationSec ?? 0;
  const inicioNovo = Math.max(0, alvo.inicio + (ajuste.inicioDelta ?? 0));
  const fimNovo = Math.min(duracaoTotal || alvo.fim, alvo.fim + (ajuste.fimDelta ?? 0));
  if (fimNovo - inicioNovo < DURACAO_MINIMA) {
    throw new Error(`O corte ficaria com menos de ${DURACAO_MINIMA} segundos.`);
  }

  trechos[indice] = {
    ...alvo,
    inicio: inicioNovo,
    fim: fimNovo,
    // O ajuste do cliente é um delta em segundos sobre a borda que estava, sem
    // garantia de cair em pausa: o arredondamento de sempre volta a valer
    // (ver `emPausa` em pedido-de-corte.ts).
    emPausa: false,
    midia: { ...(alvo.midia ?? {}), refazendo: true },
  };
  await prisma.videoJob.update({
    where: { id: video.id },
    data: { clips: trechos as never },
  });

  await enviarRecorteDoTrecho(
    {
      id: video.id,
      blobUrl: video.blobUrl,
      durationSec: duracaoTotal,
      projectId: video.projectId,
      palavras: (video.transcript as { words?: Word[] } | null)?.words ?? [],
      estilo: video.project?.videoStyle ?? null,
      musicaUrl: video.project?.videoMusicUrl ?? null,
      termos: video.project?.videoTerms ?? null,
      escolha: video.project?.videoEstiloEscolha ?? null,
      colorPalette: video.project?.colorPalette ?? null,
    },
    trechos[indice] as Trecho,
    indice
  );
  return { inicio: inicioNovo, fim: fimNovo };
}

/**
 * Pede ao worker o recorte de UM trecho, com o mesmo pipeline do corte
 * original. Usado pelo ajuste do cliente (`refazerCorte`) e pela refação que o
 * Vitor faz sozinho quando a Vera reprova (`lib/media/revisao-do-corte.ts`).
 *
 * Monta o pedido SÓ com o trecho alvo e só com as palavras em volta dele. Até
 * 29/09 o pedido era montado com todos os trechos e a transcrição inteira, e
 * filtrado depois: a limpeza de fala (uma chamada de modelo sobre a gravação
 * toda, US$ 0,51 num vídeo de 16 min) e os efeitos de TODOS os trechos eram
 * pagos para refazer um corte só. Com a janela, a limpeza lê 30 segundos a
 * mais de cada lado, que é tudo o que o trecho usa.
 *
 * O índice é reposto no pedido porque `montarPedidoDeCorte` numera pela
 * posição na lista, e aqui a lista tem um trecho só.
 */
const FOLGA_DE_PALAVRAS_SEC = 30;

export async function enviarRecorteDoTrecho(
  video: Omit<VideoParaCortar, "trechos">,
  trecho: Trecho,
  indice: number
): Promise<void> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("A edição de vídeo não está disponível agora.");

  const palavras = video.palavras.filter(
    (w) => w.end > trecho.inicio - FOLGA_DE_PALAVRAS_SEC && w.start < trecho.fim + FOLGA_DE_PALAVRAS_SEC
  );
  const { corpo } = await montarPedidoDeCorte(
    { ...video, trechos: [trecho], palavras },
    { appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com" }
  );

  const pedido = JSON.parse(corpo) as { trechos: Array<{ indice: number }> } & Record<string, unknown>;
  pedido.trechos = pedido.trechos.slice(0, 1).map((t) => ({ ...t, indice }));
  // O worker pula o completo e o aviso parcial; o callback trata como fusão.
  pedido.soTrechos = true;
  pedido.reCorte = true;

  const texto = JSON.stringify(pedido);
  const res = await fetch(`${base.replace(/\/$/, "")}/cortar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CABECALHO_ASSINATURA]: assinarCorpo(texto),
    },
    body: texto,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error("O estúdio de vídeo não aceitou o pedido agora. Tente de novo.");
  // A edição que o worker vai emendar fica no trecho, para a Vera revisar o
  // texto FINAL (depois da limpeza) quando a mídia nova voltar.
  await gravarEdicaoDoPedido(video.id, texto);
}

export async function refazerCapa(
  videoJobId: string,
  userId: string,
  indice: number,
  instrucao: string
): Promise<string> {
  const video = await prisma.videoJob.findFirst({
    where: { id: videoJobId, project: projetoVisivel(userId) },
    select: {
      id: true,
      clips: true,
      capaFonteUrl: true,
      projectId: true,
      project: { select: { niche: true } },
    },
  });
  if (!video) throw new Error("Vídeo não encontrado.");

  const trechos = (video.clips as unknown as Array<
    ClipEmEdicao & { texto?: { fraseDaCapa?: string; expressao?: string; cenario?: string } }
  >) ?? [];
  const alvo = trechos[indice];
  if (!alvo?.texto?.fraseDaCapa) throw new Error("Esse corte ainda não tem capa para refazer.");

  // O corte que chegou com o recorte próprio (quadro escolhido pelo rosto
  // dentro do trecho, desde 30/09) usa o dele; o antigo cai na capa-fonte.
  const recorteDoTrecho = (alvo.midia as { recorte?: { url?: string } | null } | undefined)?.recorte?.url ?? null;
  const quadro = recorteDoTrecho
    ? (alvo.midia?.capa as { url?: string } | undefined)?.url
    : video.capaFonteUrl ?? (alvo.midia?.capa as { url?: string } | undefined)?.url;
  if (!quadro) throw new Error("Não encontrei o quadro base da capa.");

  const bytes = await lerMidia(quadro);
  if (!bytes) throw new Error("Não consegui ler o quadro base.");

  const arte = await comporCapa(bytes.toString("base64"), alvo.texto.fraseDaCapa, {
    expressao: alvo.texto.expressao as Expressao | undefined,
    cenario: alvo.texto.cenario,
    nicho: video.project?.niche,
    formato: "9:16",
    ajuste: instrucao,
    usageCtx: { projectId: video.projectId },
    quadroUrl: quadro,
    recorteUrl: recorteDoTrecho,
    chaveDoRecorte: `cortes/${video.id}/recorte-capa-${indice}.png`,
  });
  if (!arte) throw new Error("A capa nova não saiu desta vez. Tente descrever o ajuste de outro jeito.");

  const { url } = await put(
    `cortes/${video.id}/capa-arte-${indice}.jpg`,
    dataUrlToBuffer(arte),
    {
      // A capa refeita é mídia produzida, mesmo destino da original.
      ...midiaProduzida(),
      contentType: "image/jpeg",
      addRandomSuffix: true,
    }
  );

  // A capa ANTERIOR sai, e sai DEPOIS de a nova estar gravada no banco.
  //
  // Esta funcao era um dos dois geradores de arquivo orfao da plataforma: cada
  // "refazer capa" gravava um arquivo novo e abandonava o anterior, para sempre.
  // Numa conta so isso e invisivel; medido em 18/09 eram 23 GB.
  //
  // A ordem importa e e deliberada: gravar primeiro, apagar depois. Na ordem
  // inversa, uma falha entre o apagar e o gravar deixaria o cliente sem capa
  // nenhuma, e capa e coisa que ele ja aprovou.
  const anterior = (alvo.midia?.capaArte as { url?: string } | undefined)?.url;

  trechos[indice] = {
    ...alvo,
    midia: { ...(alvo.midia ?? {}), capaArte: { url } },
  };
  await prisma.videoJob.update({
    where: { id: video.id },
    data: { clips: trechos as never },
  });

  if (anterior && anterior !== url) await apagarMidias([anterior], "refazerCapa");

  return url;
}
