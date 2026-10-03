export const dynamic = "force-dynamic";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * Upload de vídeo direto do navegador para o object storage.
 *
 * O arquivo NÃO passa por aqui. Esta rota só assina um token de permissão e
 * recebe o aviso de conclusão. É obrigatório ser assim: função serverless tem
 * limite de corpo de requisição na casa das dezenas de megabytes, e um vídeo
 * de 20 minutos passa de 1 GB. O navegador envia direto para o storage.
 */

// Limites e o porquê de cada número vivem em lib/media/limits.ts, que o
// navegador também usa. Duplicar os valores aqui sairia caro no dia em que um
// dos dois lados mudasse sozinho.
import { TIPOS_ACEITOS } from "@/lib/media/limits";
import {
  conferirGravacao,
  conferirArmazenamento,
  descartarGravacaoRecusada,
  fraseDoEstouro,
  limitesDoEnvio,
  registrarGravacao,
} from "@/lib/limites-do-plano";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,

      // Roda ANTES do upload começar. É o portão: sem sessão válida e sem ser
      // dono do projeto, nenhum token é emitido.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Não autenticado");

        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const projectId: string | undefined = payload.projectId;
        if (!projectId) throw new Error("projectId é obrigatório");

        const project = await prisma.project.findFirst({
          where: { id: projectId, ...projetoVisivel(userId) },
          select: { id: true },
        });
        if (!project) throw new Error("Projeto não encontrado");

        // A cota de GRAVAÇÕES do ciclo, aplicada em 18/09. É aqui que ela vale
        // de verdade: a tela também pergunta antes (GET /api/videos/cota) para
        // poder oferecer o upgrade em vez de um erro seco, mas quem emite o
        // token é esta função, e token é a única defesa que uma aba aberta com o
        // devtools não contorna.
        const estouro = await conferirGravacao(userId);
        if (estouro) throw new Error(fraseDoEstouro(estouro));

        /**
         * O TETO DE ARMAZENAMENTO, no mesmo lugar e pelo mesmo motivo (22/09).
         *
         * Gravacao e o que pesa: medido, de 0,8 a 1,8 GB cada, contra 8 MB de
         * toda a arte somada. Ate aqui nao havia teto nenhum, entao o custo de
         * armazenamento crescia por cliente sem nada no caminho, que e o
         * buraco que o card 470 nomeia.
         *
         * Aqui nao da para saber o tamanho do arquivo que vem (o token e
         * emitido ANTES do upload), entao a conferencia e do que JA existe
         * contra o teto: quem ja estourou nao sobe mais nada. O teto do
         * arquivo em si e o do plano, logo abaixo.
         */
        const cheio = await conferirArmazenamento(userId);
        if (cheio) throw new Error(fraseDoEstouro(cheio));

        // O TETO DO ARQUIVO E DO PLANO desde 29/09 (4, 8 e 20 GB). O storage
        // recusa sozinho o que passar daqui, entao a tela do cliente, que ja
        // recusa antes, nao e a unica defesa.
        const envio = await limitesDoEnvio(userId);

        return {
          allowedContentTypes: TIPOS_ACEITOS,
          maximumSizeInBytes: envio.bytesMaximo,
          addRandomSuffix: true,
          // Volta para nós no onUploadCompleted, já validado.
          tokenPayload: JSON.stringify({ userId, projectId }),
        };
      },

      // Chamado pelo storage quando o upload termina. Em desenvolvimento local
      // o storage não alcança o localhost, então este passo não dispara: por
      // isso a criação do registro também é exposta na rota /api/videos.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { userId, projectId } = JSON.parse(tokenPayload ?? "{}");
        // O navegador também registra, pela rota /api/videos, e os dois chegam
        // quase juntos. `registrarGravacao` (30/09) resolve a corrida e confere
        // a cota de novo: o token foi emitido com a cota livre, mas entre o
        // token e o fim do upload outra aba pode ter usado a última gravação.
        const registro = await registrarGravacao({
          userId,
          projectId,
          blobUrl: blob.url,
          originalName: blob.pathname.split("/").pop() ?? null,
        });
        if (!registro.ok) {
          // Recusada: o arquivo sai do storage e a esteira não começa. A tela
          // recebe a mesma frase pela rota /api/videos, que recusa igual.
          await descartarGravacaoRecusada(blob.url, projectId);
          return;
        }
        const video = registro.video;

        // E AQUI que a esteira comeca, e nao na aba do cliente. Falha nao sobe:
        // o storage precisa do 200, e a tela continua curando o que ficar
        // parado. So despacha quando o video ainda esta em "uploaded", senao um
        // aviso repetido do storage pediria transcricao de novo.
        if (video.status === "uploaded") await despacharPasso(video.id, "transcrever");
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha no upload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
