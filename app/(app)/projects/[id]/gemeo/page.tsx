import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { contaDoPlano } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { cadastroParaTela, videoParaTela } from "@/lib/media/gemeo";
import { geradorDoCadastro, lerCadastro, listarVideos } from "@/lib/media/gemeo-servidor";
import { GemeoDoProjeto } from "@/components/gemeo/gemeo-do-projeto";
import { ComoOSquadEdita } from "@/components/video/como-o-squad-edita";
import { resumoDaEdicao } from "@/lib/media/edicao-escolhida";
import { nomeDoDono, podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * A PORTA DO GÊMEO DIGITAL.
 *
 * 29/09: nasceu honesta, "em teste", com os três passos aprovados (fotos, voz,
 * autorização gravada pela própria pessoa) enquanto o teste comparativo dos
 * geradores rodava.
 *
 * 01/10: o teste terminou (OmniHuman 1.5 no fal.ai, decisão do Bruno) e a
 * página virou o fluxo real: os três passos funcionam e o quarto gera o vídeo
 * a partir de um roteiro, que entra na esteira como uma gravação enviada. Ver
 * `components/gemeo/gemeo-do-projeto.tsx` e `lib/media/gemeo*.ts`.
 *
 * O terceiro passo é o que bloqueia rosto e voz de terceiros POR CONSTRUÇÃO:
 * a autorização é gravada pela própria pessoa, com a câmera aberta, dizendo o
 * próprio nome (Código Civil, art. 20), e nada é clonado antes dela valer.
 */
export default async function GemeoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ roteiro?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const { roteiro } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, videoEstiloEscolha: true, videoStyle: true, videoMusicUrl: true, videoMusicName: true, videoTerms: true },
  });
  if (!project || !(await podeUsarProjeto(userId, project))) notFound();

  const [cadastro, videos, usuario] = await Promise.all([
    lerCadastro(id),
    listarVideos(id),
    prisma.user.findUnique({ where: { id: userId }, select: { creditsBalance: true, role: true, name: true } }),
  ]);
  // Saldo e acesso interno são da CONTA que paga; o nome (que entra na frase
  // da autorização) é o de quem está gravando (01/10, acesso de equipe).
  const conta = await prisma.user.findUnique({ where: { id: await contaDoPlano(userId) }, select: { creditsBalance: true, role: true } });
  // Membro da equipe (01/10, acabamento): o gêmeo é de quem administra a conta.
  const donoDaEquipe = project.userId === userId ? null : ((await nomeDoDono(project.userId)) ?? "quem administra a conta");

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-8 px-4 py-10 lg:px-8">
      <Link href={`/projects/${id}/criar`} className="inline-flex w-fit items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft className="h-4 w-4" /> Voltar para Criar
      </Link>

      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          {donoDaEquipe ? "O gêmeo digital do projeto" : "O seu gêmeo digital"}
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {donoDaEquipe
            ? `Para as semanas sem tempo de gravar. O gêmeo fala o roteiro da linha editorial com o rosto e a voz de quem se cadastrou, e o vídeo segue o mesmo caminho dos outros: revisão da Vera, aprovação e publicação. O cadastro é de ${donoDaEquipe}.`
            : "Para as semanas sem tempo de gravar. O gêmeo fala o roteiro da sua linha editorial com o seu rosto e a sua voz, e o vídeo segue o mesmo caminho dos outros: revisão da Vera, sua aprovação e publicação. Só você pode criar o seu."}
        </p>
      </div>

      {/* COMO O SQUAD EDITA (02/10): o vídeo do gêmeo usava o padrão do
          projeto calado; agora o estilo, a legenda e a trilha aparecem antes
          de gerar, com "Trocar" (o mesmo passo do modal "Nova campanha"). */}
      <ComoOSquadEdita
        projectId={id}
        resumo={resumoDaEdicao(project)}
        estiloInicial={project.videoStyle}
        musica={project.videoMusicName ?? null}
        termos={project.videoTerms ?? null}
        onde="gemeo"
      />

      <GemeoDoProjeto
        projectId={id}
        roteiroInicial={roteiro ?? null}
        inicial={{
          cadastro: cadastroParaTela(cadastro),
          videos: videos.map(videoParaTela),
          saldo: conta?.creditsBalance ?? 0,
          acessoInterno: conta?.role === "admin",
          nome: usuario?.name ?? "",
          projeto: project.name,
          gerador: geradorDoCadastro(cadastro),
          // 05/10: o erro do fornecedor por extenso, só para admin.
          erroTecnico: conta?.role === "admin" ? cadastro?.avatar?.erroTecnico ?? null : null,
          // Membro da equipe (01/10): cadastro e revogação ficam com o dono.
          equipe: donoDaEquipe ? { dono: donoDaEquipe } : null,
        }}
      />

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        O caminho que mais rende continua sendo o seu próprio vídeo.{" "}
        <Link href={`/projects/${id}/live?abrir=video`} className="font-semibold text-orange-400 hover:underline">
          Subir uma gravação
        </Link>
      </p>
    </div>
  );
}
