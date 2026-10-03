import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { conferirGravacao, conferirArmazenamento, usoDeGravacoes, limitesDoEnvio } from "@/lib/limites-do-plano";

/**
 * O QUE A TELA DE ENVIO PRECISA SABER ANTES de o cliente escolher o arquivo.
 *
 * Existe desde 29/09 porque a tela perguntava isso a `/api/videos/cota`, que é
 * a cota do vídeo POR IA e responde outra coisa: `pode` e `limite` chegavam
 * vazios, e o aviso de última gravação e a oferta de subir de plano nunca
 * apareciam. O servidor continuava recusando no token, então nada vazava, mas a
 * recusa chegava depois de o cliente escolher um arquivo de gigabytes.
 *
 * Junta as três respostas numa chamada só: gravações do ciclo, espaço guardado
 * e os tetos do plano (duração e tamanho do arquivo).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [gravacao, armazenamento, uso, envio] = await Promise.all([
    conferirGravacao(userId),
    conferirArmazenamento(userId),
    usoDeGravacoes(userId),
    limitesDoEnvio(userId),
  ]);
  const limite = gravacao ?? armazenamento;
  return NextResponse.json({ pode: !limite, limite, uso, envio });
}
