export const dynamic = "force-dynamic";
// Cada passo roda em `after`, depois do 202, e precisa do teto inteiro: a
// seleção de uma gravação de uma hora passa de 4 minutos, e a semana de texto
// (Roberto, redatores em paralelo, Vera) chega perto disso.
export const maxDuration = 800;

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assinaturaDoPilotoValida,
  chamarRota,
  type PassoDoPiloto,
} from "@/lib/media/piloto-do-servidor";
import { abrirQuadroDoVideo } from "@/lib/media/quadro-do-video";
import { completarEsteiraDoVideo } from "@/lib/media/esteira-do-video";

/**
 * A rota que EXECUTA um passo do piloto do servidor (ver
 * `lib/media/piloto-do-servidor.ts`). Sem sessão: quem chama é a própria
 * plataforma, a partir de um callback, com a assinatura do vídeo.
 *
 * Responde 202 antes de trabalhar, de propósito: quem despachou é um callback
 * que precisa devolver 200 para a Deepgram ou para o worker em segundos, e
 * não pode ficar preso esperando dois minutos de seleção.
 */

const PASSOS: Record<PassoDoPiloto, (videoId: string) => Promise<void>> = {
  // Escolhe os trechos. O `cortar` sai de dentro da rota de seleção, quando
  // ela termina bem, seja quem for que a chamou (servidor ou tela).
  async selecionar(videoId) {
    await chamarRota(videoId, "select");
  },

  // Manda o worker cortar. A rota responde assim que o worker aceita o pedido;
  // o resto chega pelo `cortar-callback`, que despacha o `preparar`.
  async cortar(videoId) {
    await chamarRota(videoId, "cortar", { timeoutMs: 290_000 });
  },

  // A semana de texto, direto da transcrição: abre o quadro com os cards de
  // espera (é o que faz o cliente ver o squad trabalhando um minuto depois de
  // subir o vídeo) e roda Roberto, redatores e Vera. Não depende dos cortes.
  async semana(videoId) {
    await abrirQuadroDoVideo(videoId);
    const r = await completarEsteiraDoVideo(videoId);
    console.log(`[piloto][${videoId}] semana: radar=${r.pesquisou} escritos=${r.escritos} revisados=${r.revisados}`);
  },

  // Depois dos cortes: título, descrição e capa de cada corte, os posts por
  // rede, e os cards do Vitor no quadro. Uma etapa que falha não segura as
  // outras: cada uma é idempotente e o quadro fica melhor com o que houver.
  async preparar(videoId) {
    await chamarRota(videoId, "capas");
    await chamarRota(videoId, "write");
    await chamarRota(videoId, "agendar");
  },

  async "capas-do-completo"(videoId) {
    await chamarRota(videoId, "capas-do-completo");
  },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!assinaturaDoPilotoValida(id, req.nextUrl.searchParams.get("sig"))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  const passo = req.nextUrl.searchParams.get("passo") as PassoDoPiloto | null;
  if (!passo || !(passo in PASSOS)) {
    return NextResponse.json({ error: "Passo desconhecido" }, { status: 400 });
  }
  const existe = await prisma.videoJob.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  after(async () => {
    const t0 = Date.now();
    try {
      await PASSOS[passo](id);
      console.log(`[piloto][${id}] ${passo} terminou em ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      console.error(`[piloto][${id}] ${passo} falhou:`, e);
    }
  });

  return NextResponse.json({ aceito: true, passo }, { status: 202 });
}
