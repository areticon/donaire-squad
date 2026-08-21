export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Diz quais redes estão prontas para conectar, em tempo de execução.
 *
 * Mesmo padrão de `/api/auth/providers`, adotado em 21/08 depois da armadilha
 * do `NEXT_PUBLIC_*`: variável resolvida em tempo de build não vale sem
 * rebuild, e a ausência não gera erro nenhum, só some o recurso. Aqui o
 * servidor responde e a tela pergunta, então credencial nova passa a valer na
 * hora.
 *
 * Serve também para não mostrar botão que leva a 404: rede sem integração
 * pronta aparece como "em breve" em vez de quebrar na cara de quem clicou.
 *
 * Só booleanos saem daqui. Nenhuma credencial.
 */
export function GET() {
  return NextResponse.json({
    linkedin: Boolean(
      process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
    ),
    twitter: Boolean(
      process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
    ),
    instagram: Boolean(
      process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET
    ),
    facebook: Boolean(
      process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET
    ),
    youtube: Boolean(
      process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET
    ),
  });
}
