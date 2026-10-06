import { prisma } from "@/lib/db/prisma";
import { limiteDeReferencias } from "@/lib/limites-do-plano";
import type { LimiteDeReferencias } from "@/lib/planos";

/**
 * O LIMITE DE REFERÊNCIAS APLICADO A UM PROJETO (06/10/2026).
 *
 * O número vem do plano do dono do projeto (lib/planos.ts, referenciasDoPlano).
 * Projeto de antes da regra pode ter MAIS confirmadas do que o plano inclui:
 * nenhuma é escondida nem apagada, e remover sempre funciona (a regra de
 * c6ef046: o teto só barra quem aumenta a lista).
 *
 * O ESTUDO, porém, é leitura paga por perfil. Para o custo não crescer com o
 * que ficou de antes, ele lê no máximo o limite do plano, as MAIS RECENTES
 * (pela data em que entraram no projeto). A tela diz isso ao lado da lista.
 */
export async function limiteDoProjeto(projectId: string): Promise<LimiteDeReferencias> {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { userId: true } });
  return limiteDeReferencias(p.userId);
}

/** Os ids das confirmadas que entram no estudo: as mais recentes, até o limite do plano. */
export async function idsQueOEstudoLe(projectId: string, limite?: number): Promise<string[]> {
  const n = limite ?? (await limiteDoProjeto(projectId)).porProjeto;
  const perfis = await prisma.referenciaPerfil.findMany({
    where: { projectId, status: "confirmado" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: n,
    select: { id: true },
  });
  return perfis.map((p) => p.id);
}
