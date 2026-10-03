export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { resolveSocialAccountAccessToken } from "@/lib/publish/oauth-post";
import { ErroDoTikTok, lerInfoDoCriador } from "@/lib/oauth/tiktok";
import { vaiPeloBlotato } from "@/lib/publish/roteador";
import { projetoVisivel } from "@/lib/equipe/conta";

/**
 * O que a conta do TikTok do projeto pode fazer AGORA: nome, foto, as
 * privacidades disponíveis, quais interações a pessoa desligou no app e o teto
 * de duração do vídeo.
 *
 * A tela de publicar chama isto toda vez que abre, e não guarda em cache: as
 * regras do TikTok pedem a informação fresca, porque a lista muda (conta que
 * virou privada perde "todo mundo", conta nova tem teto de duração menor).
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const conta = await prisma.socialAccount.findFirst({
    where: { projectId, platform: "tiktok", isActive: true, project: projetoVisivel(userId) },
    orderBy: { createdAt: "desc" },
  });
  if (!conta) {
    return NextResponse.json({ error: "Nenhuma conta do TikTok conectada neste projeto." }, { status: 404 });
  }

  /**
   * Conta que publica pelo Blotato (30/09): a consulta do criador é da API do
   * TikTok com o NOSSO token, que essa conta não tem (ou não usa). Chamar
   * assim mesmo devolveria token inválido e marcaria a conta para reconectar,
   * sumindo com ela das campanhas. A janela recebe as opções completas, e as
   * escolhas da pessoa seguem no post para o Blotato.
   */
  if (vaiPeloBlotato(conta)) {
    return NextResponse.json({
      contaId: conta.id,
      nome: conta.displayName ?? conta.username ?? "TikTok",
      usuario: conta.username ?? "",
      avatarUrl: conta.avatarUrl ?? null,
      privacidades: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"],
      comentarioDesligado: false,
      duetoDesligado: false,
      costuraDesligada: false,
      duracaoMaximaSeg: 600,
    });
  }

  try {
    const { accessToken } = await resolveSocialAccountAccessToken(conta);
    const info = await lerInfoDoCriador(accessToken);
    return NextResponse.json({ contaId: conta.id, ...info });
  } catch (e) {
    // Token recusado vira a mesma marca de "reconectar" que as outras redes
    // usam, para a tela de Configurações mostrar a conta como precisa de ação.
    if (e instanceof ErroDoTikTok && (e.codigo === "access_token_invalid" || e.codigo === "scope_not_authorized")) {
      await prisma.socialAccount
        .update({ where: { id: conta.id }, data: { needsReconnectAt: new Date(), needsReconnectReason: e.codigo } })
        .catch(() => {});
    }
    const msg = e instanceof Error ? e.message : "Não consegui ler a conta do TikTok.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
