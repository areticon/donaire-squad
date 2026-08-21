export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Quais provedores sociais estão de pé, segundo o servidor.
 *
 * Existe porque a alternativa (uma flag `NEXT_PUBLIC_*` por provedor) é
 * resolvida em tempo de build: gravar a credencial na Vercel não bastava, e
 * esquecer o rebuild deixava o botão invisível sem nenhum erro, que foi
 * exatamente o que aconteceu em 20/08. Aqui a verdade vem de uma fonte só, as
 * credenciais que o `lib/auth` usa, e vale em runtime.
 *
 * Só devolve booleanos: nada de valor de credencial nesta resposta.
 */
export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
  });
}
