export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { tiktokConfigured } from "@/lib/oauth/tiktok";
import { exigirAdmin } from "@/lib/admin/guarda";
import { redesDeConexaoAssistida } from "@/lib/social/conexao-assistida";

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
 * Só booleanos e nomes de rede saem daqui. Nenhuma credencial.
 *
 * `assistidas` (01/10): redes em que o cliente de fora ainda não conecta
 * sozinho (app da rede sem aprovação), e a tela troca "Conectar" por
 * "Conexão assistida". `conectarDireto` diz se quem pergunta é admin: o admin
 * é papel nos apps da Meta e do TikTok, então para ele o OAuth próprio
 * funciona e a tela mantém um link discreto para isso. Ver
 * lib/social/conexao-assistida.ts.
 */
export async function GET() {
  const admin = await exigirAdmin().catch(() => null);
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
    // Sandbox ou produção, conforme TIKTOK_AMBIENTE (ver lib/oauth/tiktok.ts).
    tiktok: tiktokConfigured(),
    assistidas: redesDeConexaoAssistida(),
    conectarDireto: Boolean(admin),
  });
}
