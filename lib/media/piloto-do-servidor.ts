import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * O PILOTO DO SERVIDOR: quem encadeia as etapas do vídeo é a plataforma, e
 * não a aba do cliente.
 *
 * Até 04/09 cada etapa era disparada pelo navegador ao ver o status mudar
 * (`components/video/esteira-do-video.tsx`). Medido no teste do Bruno desse
 * dia: os cortes ficaram prontos aos 6,9 min e a etapa seguinte só saiu aos
 * 12,5 min, porque a aba estava em segundo plano e o navegador segura o
 * relógio de aba escondida. Cinco minutos e meio de máquina parada com o
 * cliente esperando. E os redatores só começavam depois de capas, redação e
 * agendamento, quando tudo o que eles precisam é a transcrição.
 *
 * O desenho novo: cada callback de fora (Deepgram, worker) DESPACHA o passo
 * seguinte para a rota `/piloto`, que responde 202 na hora e trabalha em
 * `after`, com o próprio teto de tempo. O piloto da tela continua existindo,
 * mas como CURA: só age quando uma etapa está parada há mais de um minuto e
 * meio, o que agora significa que o servidor falhou.
 *
 * A autenticação entre as rotas é uma assinatura por vídeo, com finalidade
 * própria ("piloto:"), diferente da assinatura do callback da Deepgram: a
 * URL do callback fica com um terceiro, e ela não pode servir para mandar
 * cortar, escrever ou agendar nada.
 */

export type PassoDoPiloto = "selecionar" | "cortar" | "semana" | "preparar" | "capas-do-completo";

export function assinarPiloto(videoId: string): string {
  const segredo = process.env.BETTER_AUTH_SECRET ?? "demandou";
  return createHmac("sha256", segredo).update(`piloto:${videoId}`).digest("hex");
}

export function assinaturaDoPilotoValida(videoId: string, assinatura: string | null): boolean {
  if (!assinatura) return false;
  const esperada = assinarPiloto(videoId);
  if (assinatura.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada));
}

/**
 * Quem pode mexer neste vídeo nesta requisição: o dono logado (filtro por
 * `project.userId`) ou o próprio servidor, com a assinatura do piloto na
 * query (`?sig=`). Devolve o `where` que a rota usa no `findFirst`, ou null
 * para responder 401.
 *
 * O caminho assinado não substitui o filtro de dono por descuido: a
 * assinatura já é por vídeo, então ela SÓ abre este id, e não outro.
 */
export async function acessoAoVideo(
  req: NextRequest,
  videoId: string
): Promise<{ where: { id: string; project?: { userId: string } }; interno: boolean } | null> {
  const sig = req.nextUrl.searchParams.get("sig");
  if (sig && assinaturaDoPilotoValida(videoId, sig)) {
    return { where: { id: videoId }, interno: true };
  }
  const { userId } = await auth();
  if (!userId) return null;
  return { where: { id: videoId, project: { userId } }, interno: false };
}

function baseDoApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

/**
 * Chama uma rota do vídeo como o servidor e ESPERA a resposta inteira. Quem
 * chama paga o tempo, então isto só roda dentro do `after` da rota `/piloto`,
 * que tem teto de 800s.
 */
export async function chamarRota(
  videoId: string,
  rota: string,
  opts?: { timeoutMs?: number }
): Promise<{ ok: boolean; status: number; corpo: Record<string, unknown> }> {
  const separador = rota.includes("?") ? "&" : "?";
  const r = await fetch(`${baseDoApp()}/api/videos/${videoId}/${rota}${separador}sig=${assinarPiloto(videoId)}`, {
    method: "POST",
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 790_000),
  });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    console.warn(`[piloto][${videoId}] ${rota} respondeu ${r.status}: ${String(corpo.error ?? "").slice(0, 200)}`);
  }
  return { ok: r.ok, status: r.status, corpo };
}

/**
 * Manda a rota `/piloto` executar um passo, sem esperar por ele. A rota
 * responde 202 antes de trabalhar, então isto leva um segundo e não prende
 * quem despachou.
 *
 * Falha aqui nunca sobe: quem despacha é um callback que precisa responder
 * 200 para a Deepgram ou para o worker, e o piloto da tela cura o que ficar
 * parado.
 */
export async function despacharPasso(videoId: string, passo: PassoDoPiloto): Promise<boolean> {
  try {
    const r = await fetch(`${baseDoApp()}/api/videos/${videoId}/piloto?passo=${passo}&sig=${assinarPiloto(videoId)}`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.error(`[piloto][${videoId}] despachar ${passo} respondeu ${r.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[piloto][${videoId}] despachar ${passo} falhou:`, e);
    return false;
  }
}
