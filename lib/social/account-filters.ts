import type { Prisma } from "@prisma/client";

/**
 * Contas que podem publicar: ativas, com access token, sem recusa registrada
 * pela rede, e LinkedIn com URN (`platformUserId`).
 *
 * `needsReconnectAt` entrou em 14/09. Uma conta cuja rede já devolveu 401 não
 * pode ser oferecida como destino de campanha nova: geraria posts que nascem
 * para falhar. Ela some daqui e reaparece sozinha quando a pessoa reconecta,
 * porque o callback do OAuth limpa o campo.
 */
/**
 * Com o Blotato ligado (30/09), a conta ligada SÓ por ele também publica: é o
 * Instagram do cliente que a Meta ainda não deixa conectar pela Demandou. Sem
 * a chave no ambiente ela não é oferecida, porque não teria por onde sair.
 * Lido na carga do módulo: a chave muda só com novo deploy.
 */
const temPorOndeSair: Prisma.SocialAccountWhereInput = process.env.BLOTATO_API_KEY?.trim()
  ? { OR: [{ accessToken: { not: null } }, { blotatoAccountId: { not: null } }] }
  : { accessToken: { not: null } };

export const whereSocialAccountCanPublish: Prisma.SocialAccountWhereInput = {
  isActive: true,
  ...temPorOndeSair,
  needsReconnectAt: null,
  NOT: {
    AND: [
      { platform: "linkedin" },
      { OR: [{ platformUserId: null }, { platformUserId: "" }] },
    ],
  },
};
