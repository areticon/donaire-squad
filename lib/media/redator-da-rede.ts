import type { FormatoEscrito, RedeDoPlano } from "@/lib/media/semana-do-video";

/**
 * QUEM ASSINA O TEXTO DE CADA REDE na semana do vídeo (04/10).
 *
 * Achado do Bruno na conta de teste: a legenda do carrossel do Instagram
 * aparecia no quadro como "Lucas LinkedIn · Post LinkedIn", num projeto em que
 * ele não marcou LinkedIn em dia nenhum. O post estava certo (Instagram); o
 * card é que era sempre do Lucas, herança de quando ele escrevia tudo. O card
 * agora leva o especialista DA REDE DO POST: legenda do Instagram é do Igor,
 * do Facebook é da Fernanda, e assim por diante.
 *
 * O tipo do card segue `post_linkedin` para as redes que não são o X: é o tipo
 * de "texto de rede" que as rotas de edição, de chat e a esteira já tratam, e
 * quem separa o dono é o `agentId` (ver `donoDaPeca` em estado-do-squad.ts).
 * O rótulo que a tela mostra sai da rede em `metadata.rede`.
 */

export type RedatorDaRede = { agentId: string; agentName: string; cardType: string };

export const REDATOR_DA_REDE: Record<string, RedatorDaRede> = {
  linkedin: { agentId: "lucas-linkedin", agentName: "Lucas LinkedIn", cardType: "post_linkedin" },
  twitter: { agentId: "xavier-x", agentName: "Xavier X", cardType: "post_twitter" },
  instagram: { agentId: "igor-instagram", agentName: "Igor Instagram", cardType: "post_linkedin" },
  facebook: { agentId: "fernanda-facebook", agentName: "Fernanda Facebook", cardType: "post_linkedin" },
  tiktok: { agentId: "tiago-tiktok", agentName: "Tiago TikTok", cardType: "post_linkedin" },
  youtube: { agentId: "yan-youtube", agentName: "Yan YouTube", cardType: "post_linkedin" },
};

/** Os ids de todos os redatores de rede, para achar o card de texto do dia seja de quem for. */
export const IDS_DOS_REDATORES = Object.values(REDATOR_DA_REDE).map((r) => r.agentId);

export function redatorDaRede(rede: string): RedatorDaRede {
  return REDATOR_DA_REDE[rede] ?? REDATOR_DA_REDE.linkedin;
}


/**
 * A REDE PRINCIPAL de cada formato (30/09): é para ela que o redator escreve,
 * e as outras redes marcadas no dia recebem a adaptação desse texto. Imagem e
 * carrossel começam no Instagram, onde a peça visual vive; texto e
 * infográfico no LinkedIn. O X só é principal quando é a única rede do dia.
 * Mora aqui (e não em pecas-da-semana.ts) desde 04/10 porque o card de espera
 * do quadro precisa saber, antes de qualquer texto, de quem é o dia.
 */
const PRINCIPAL: Record<FormatoEscrito, RedeDoPlano[]> = {
  text: ["linkedin", "facebook", "twitter"],
  poll: ["linkedin"],
  thread: ["twitter"],
  image: ["instagram", "linkedin", "facebook", "twitter"],
  carousel: ["instagram", "linkedin", "facebook"],
  infographic: ["linkedin", "instagram", "facebook", "twitter"],
};

export function principalDoDia(formato: FormatoEscrito, redes: RedeDoPlano[]): RedeDoPlano {
  return PRINCIPAL[formato].find((r) => redes.includes(r)) ?? redes[0] ?? PRINCIPAL[formato][0];
}

/** O redator do texto de um dia: o especialista da rede principal (thread é sempre do Xavier). */
export function redatorDoDia(formato: FormatoEscrito, redes: RedeDoPlano[]): RedatorDaRede {
  return redatorDaRede(formato === "thread" ? "twitter" : principalDoDia(formato, redes));
}
