import type { Prisma } from "@prisma/client";

/**
 * Contas que podem publicar: ativas, com access token, e LinkedIn com URN (`platformUserId`).
 */
export const whereSocialAccountCanPublish: Prisma.SocialAccountWhereInput = {
  isActive: true,
  accessToken: { not: null },
  NOT: {
    AND: [
      { platform: "linkedin" },
      { OR: [{ platformUserId: null }, { platformUserId: "" }] },
    ],
  },
};
