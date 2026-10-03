import { auth } from "@/lib/auth/server";
import { redirect, notFound } from "next/navigation";
import { montarTelaComReedicao } from "@/lib/media/reedicao";
import { TelaDeRoteiro } from "@/components/video/tela-de-roteiro";
import { ComoOSquadEdita } from "@/components/video/como-o-squad-edita";
import { resumoDaEdicao } from "@/lib/media/edicao-escolhida";
import { lerRoteiroDoVideo } from "@/lib/media/roteiro-da-edicao";
import { prisma } from "@/lib/db/prisma";

/**
 * A TELA DE ROTEIRO (30/09/2026): antes de gastar com imagem, cena, corte e
 * montagem, o cliente vê a linha editorial, os cortes possíveis com a fala
 * exata de cada um, as cenas planejadas em texto, corrige palavras, ajusta
 * cena por cena, escolhe até 3 cortes e aprova. Rota própria, e não modal do
 * Gestor, porque é uma decisão com leitura longa (texto de cada corte, cenas
 * do completo) e porque o link vai para o e-mail e para a faixa do Gestor.
 *
 * O servidor monta a tela inteira (lib/media/roteiro-da-edicao.ts) e o
 * componente só desenha e manda as ações: ele não importa nada que toque o banco.
 */
export default async function RoteiroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; videoId: string }>;
  searchParams: Promise<{ editar?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id, videoId } = await params;
  // Com a reedição (30/09): vídeo já aprovado ganha o "Voltar à edição".
  const tela = await montarTelaComReedicao(videoId, userId);
  if (!tela || tela.projectId !== id) notFound();
  // `?editar=1` vem do botão "Voltar à edição" do card e da faixa: a tela já abre a edição.
  const { editar } = await searchParams;
  // COMO O SQUAD EDITA (02/10): o estilo, a legenda e a trilha que vão ser
  // usados, no topo, com "Trocar".
  const projeto = await prisma.project.findUnique({
    where: { id },
    select: { videoEstiloEscolha: true, videoStyle: true, videoMusicUrl: true, videoMusicName: true, videoTerms: true },
  });
  const estiloDoRoteiro = (await lerRoteiroDoVideo(videoId))?.completo?.estiloId ?? null;
  return (
    <>
      {projeto && (
        <div className="mx-auto max-w-[1024px] px-4 pt-6 lg:px-8">
          <ComoOSquadEdita
            projectId={id}
            resumo={resumoDaEdicao({ ...projeto, estiloDoRoteiro })}
            estiloInicial={projeto.videoStyle}
            musica={projeto.videoMusicName ?? null}
            termos={projeto.videoTerms ?? null}
            onde="roteiro"
          />
        </div>
      )}
      <TelaDeRoteiro inicial={tela} abrirEdicao={editar === "1"} />
    </>
  );
}
