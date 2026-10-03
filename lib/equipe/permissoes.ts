import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { nomeDoDono, projetoVisivel } from "@/lib/equipe/conta";
import { fraseSoODono } from "@/lib/equipe/regras";

/**
 * O QUE O MEMBRO DA EQUIPE PODE E O QUE NÃO PODE (01/10, acabamento do acesso
 * de equipe).
 *
 * `podeUsarProjeto` (lib/equipe/conta.ts) responde "esta pessoa vê e usa o
 * projeto". Faltava a segunda pergunta, "esta pessoa CONFIGURA o projeto", e
 * sem ela o vendedor convidado trocava o tom de voz da marca, desconectava o
 * LinkedIn da empresa ou subia outro manual de marca, coisas que valem para a
 * equipe inteira e que o dono não espera que mudem sem ele.
 *
 * A REGRA, decidida no acabamento de 01/10:
 *
 * O MEMBRO PODE, nos projetos liberados: subir vídeo e fazer as escolhas do
 * envio (estilo de edição, trilha, termos do negócio e os dias da semana do
 * vídeo, que são passos da própria jornada de envio), aprovar e ajustar
 * roteiro, gerar campanha, pedir vídeo ao gêmeo já cadastrado, editar, refazer,
 * agendar e publicar posts, conversar com o squad.
 *
 * SÓ O DONO: Configurações e Editar setup do projeto (nome, nicho, público,
 * voz, cores, capa, semana padrão pela tela de Configurações), documentos e
 * logo da marca, direção visual das artes, agentes do squad, conexões de rede,
 * cadastro e revogação do gêmeo, apagar o projeto, cobrança e equipe.
 *
 * Esta função NÃO substitui a conferência de acesso: quem chama já sabe que a
 * pessoa usa o projeto (senão responde 404, como sempre). Aqui só a diferença
 * entre usar e configurar, com 403 e a frase que diz quem resolve.
 */
export async function soODono(
  userId: string,
  projeto: { userId: string } | string,
  oQue?: string
): Promise<NextResponse | null> {
  const donoId =
    typeof projeto === "string"
      ? (await prisma.project.findUnique({ where: { id: projeto }, select: { userId: true } }))?.userId
      : projeto.userId;
  if (!donoId || donoId === userId) return null;
  return NextResponse.json(
    { error: fraseSoODono(await nomeDoDono(donoId), oQue), codigo: "so_o_dono" },
    { status: 403 }
  );
}

/**
 * A PORTA DO OAUTH DAS REDES (01/10, acabamento). As rotas `/api/social/<rede>/
 * connect` guardavam o projectId num cookie sem conferir nada, e o retorno da
 * rede gravava a conta naquele projeto: bastava estar logado para ligar uma
 * conta num projeto alheio. Agora: projeto que a pessoa não vê é 404, membro é
 * 403 (conexão é do dono). Acesso interno passa, como em todo o resto.
 */
export async function soQuemConectaRedes(userId: string, projectId: string): Promise<NextResponse | null> {
  const eu = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (eu?.role === "admin") return null;
  const p = await prisma.project.findFirst({ where: { id: projectId, ...projetoVisivel(userId) }, select: { userId: true } });
  if (!p) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  return soODono(userId, p, "conectar as redes deste projeto");
}

/**
 * Os campos do projeto que o MEMBRO pode gravar pelo PATCH: são os da jornada
 * de envio de vídeo (components/posts/jornada-da-campanha.tsx e
 * components/video/enviar-gravacao.tsx), que salvam no projeto a cada passo.
 * Recusar estes travaria o envio, que é exatamente o trabalho do membro. O
 * estilo de edição da jornada grava por /estilo-de-edicao, que fica aberto.
 */
export const CAMPOS_DO_ENVIO = ["videoSemana", "videoTerms", "videoMusicUrl", "videoMusicName"] as const;
