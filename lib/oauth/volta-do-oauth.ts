import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { soQuemConectaRedes } from "@/lib/equipe/permissoes";
import { returnToSeguro } from "@/lib/oauth/return-to";
import { lerEstado } from "@/lib/oauth/estado-assinado";

/**
 * A VOLTA DO LOGIN DA META (Instagram e Facebook), em qualquer navegador (04/10).
 *
 * Antes, o callback só aceitava a volta no MESMO navegador que saiu: conferia
 * o `state` contra o cookie e exigia a sessão. No celular, o app do Instagram
 * captura o link e devolve a pessoa no navegador de dentro do app, sem cookie
 * e sem sessão, e ela ficava presa lá (achado do dono em 04/10). Agora:
 *
 * - `state` igual ao cookie: o caminho de sempre.
 * - `state` assinado e no prazo (lib/oauth/estado-assinado.ts): vale também
 *   sem cookie. Se houver sessão, ela precisa ser de quem pode conectar; sem
 *   sessão, quem responde é quem iniciou, gravado no state.
 *
 * `semSessao` diz ao callback para não mandar a pessoa a uma página logada
 * (o proxy a jogaria no /sign-in de dentro do app): ela vai para /conectado,
 * que diz "pronto, volte para a Demandou", e a aba original avança sozinha.
 */
export type VoltaDoOAuth =
  | { ok: true; userId: string; projectId: string; returnTo: string; semSessao: boolean }
  | { ok: false; destino: string };

export async function lerVoltaDoOAuth(req: NextRequest, rede: string): Promise<VoltaDoOAuth> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const erro = req.nextUrl.searchParams.get("error");

  const savedState = req.cookies.get("oauth_state")?.value;
  const assinado = lerEstado(state);
  const cookieConfere = Boolean(state && savedState && state === savedState);

  const projectId = assinado?.p ?? (cookieConfere ? req.cookies.get("oauth_project_id")?.value : undefined);
  const padrao = projectId ? `/projects/${projectId}/settings` : "/dashboard";
  const returnTo = returnToSeguro(assinado?.r ?? req.cookies.get("oauth_return_to")?.value, padrao);
  const sessao = (await auth()).userId;

  const falha = (motivo?: string) => {
    if (!sessao) {
      const q = new URLSearchParams({ rede, erro: motivo ?? "1", volta: returnTo });
      return `${appUrl}/conectado?${q.toString()}`;
    }
    const sep = returnTo.includes("?") ? "&" : "?";
    return `${appUrl}${returnTo}${sep}${rede}=error${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ""}`;
  };

  if (erro || !code || !projectId || (!cookieConfere && !assinado)) {
    return { ok: false, destino: falha(erro ? "cancelado" : undefined) };
  }

  const quem = sessao ?? assinado?.u ?? null;
  if (!quem) return { ok: false, destino: `${appUrl}/sign-in` };
  // Sessão de OUTRA pessoa no navegador da volta: quem manda é a sessão, e ela
  // precisa poder conectar neste projeto, como sempre foi.
  const barrado = await soQuemConectaRedes(quem, projectId);
  if (barrado) return { ok: false, destino: falha("sem-permissao") };

  return { ok: true, userId: quem, projectId, returnTo, semSessao: !sessao };
}

/** Para onde mandar depois de gravar a conta. */
export function destinoDeSucesso(v: { returnTo: string; semSessao: boolean }, rede: string, extra = ""): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  if (v.semSessao) {
    const q = new URLSearchParams({ rede, volta: v.returnTo });
    return `${appUrl}/conectado?${q.toString()}`;
  }
  const sep = v.returnTo.includes("?") ? "&" : "?";
  return `${appUrl}${v.returnTo}${sep}${rede}=success${extra}`;
}

/** Para onde mandar quando a troca do código falha depois de validado. */
export function destinoDeErro(v: { returnTo: string; semSessao: boolean }, rede: string, motivo?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  if (v.semSessao) {
    const q = new URLSearchParams({ rede, erro: motivo ?? "1", volta: v.returnTo });
    return `${appUrl}/conectado?${q.toString()}`;
  }
  const sep = v.returnTo.includes("?") ? "&" : "?";
  return `${appUrl}${v.returnTo}${sep}${rede}=error${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ""}`;
}
