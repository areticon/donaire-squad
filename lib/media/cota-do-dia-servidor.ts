import { prisma } from "@/lib/db/prisma";
import {
  inicioDoDiaDeCota,
  tetoDeVideosPorDia,
  videosPorDiaDoPlano,
  type CotaDeVideo,
  type CotaDoCliente,
} from "@/lib/media/cota-do-dia";
import { planoPublico, type PlanoId } from "@/lib/planos";
import { contaDoPlano } from "@/lib/equipe/conta";

/**
 * A LEITURA DA COTA, que toca o banco e por isso mora longe da tela.
 *
 * `lib/media/cota-do-dia.ts` e puro de proposito: a janela da campanha e
 * componente cliente e importa `avisoDaCota` de la. Se a funcao abaixo
 * estivesse no mesmo arquivo, o `import` arrastaria o Prisma para o navegador
 * e a tela cairia com 500, que foi o que aconteceu na primeira versao.
 */
/** Quantas geracoes de video a plataforma ja fez no dia de cota corrente. */
export async function cotaDeVideoDoDia(agora = new Date()): Promise<CotaDeVideo> {
  const inicio = inicioDoDiaDeCota(agora);
  const linhas = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: inicio } },
    select: { model: true },
  });
  const usadas = linhas.filter((l) => /veo/i.test(l.model ?? "")).length;
  const teto = tetoDeVideosPorDia();
  const zera = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { teto, usadas, restam: Math.max(0, teto - usadas), zeraEm: zera.toISOString() };
}


/**
 * A COTA DO PLANO DESTA PESSOA, no dia de cota corrente.
 *
 * Conta pelos PROJETOS dela, porque `ai_usage` guarda o projeto e nao o dono:
 * e a mesma fonte da cota da plataforma, sem tabela nova. Acesso interno nao
 * tem teto, pela mesma razao de sempre: cobrar cota de quem opera a plataforma
 * e o produto pedindo licenca ao dono.
 */
export async function cotaDeVideoDoCliente(userIdDeQuemPede: string, agora = new Date()): Promise<CotaDoCliente> {
  // A cota do dia é da CONTA (01/10): membro da equipe usa a do plano do dono,
  // contada pelos projetos do dono.
  const userId = await contaDoPlano(userIdDeQuemPede);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true, projects: { select: { id: true } } },
  });
  if (!user) return { teto: 0, usadas: 0, restam: 0, plano: null, semTeto: false };
  if (user.role === "admin") return { teto: 0, usadas: 0, restam: 0, plano: null, semTeto: true };

  const teto = videosPorDiaDoPlano(user.plan);
  const projectIds = user.projects.map((p) => p.id);
  const usadas = projectIds.length
    ? (
        await prisma.aiUsage.findMany({
          where: { createdAt: { gte: inicioDoDiaDeCota(agora) }, projectId: { in: projectIds } },
          select: { model: true },
        })
      ).filter((l) => /veo/i.test(l.model ?? "")).length
    : 0;

  // Sem plano na tabela nao ha teto a cobrar: quem nao tem plano ja nao passa
  // do portao de entrada, e inventar um teto aqui seria uma segunda parede
  // dizendo outra coisa.
  if (teto === null) return { teto: 0, usadas, restam: 0, plano: null, semTeto: true };

  return {
    teto,
    usadas,
    restam: Math.max(0, teto - usadas),
    plano: planoPublico(user.plan as PlanoId).nome,
    semTeto: false,
  };
}
