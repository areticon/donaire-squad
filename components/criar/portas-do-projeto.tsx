"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotebookPen, ArrowRight } from "lucide-react";
import { EscolhaDeOrigem } from "@/components/posts/escolha-de-origem";

/**
 * A ABA CRIAR: a porta de entrada do projeto (29/09).
 *
 * O Bruno pediu uma plataforma mais fácil de entender: "tem muitas
 * funcionalidades, mas no final são 3 caminhos de entrada". Até aqui a escolha
 * vivia escondida em dois lugares (o botão do Gestor e a janela da campanha), e
 * a aba que abria por padrão era a lista de Posts, que mostra o que JÁ saiu e
 * não por onde começar. Agora o projeto abre aqui, com as três portas e a linha
 * editorial logo abaixo, porque é dela que saem os roteiros dos vídeos.
 *
 * As portas só levam a pessoa para onde cada caminho já mora: a jornada do
 * vídeo e a janela do tema abrem no Gestor (por ?abrir=), o gêmeo tem página
 * própria. Nenhum fluxo foi refeito, só a entrada.
 */
export function PortasDoProjeto({ projectId }: { projectId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-10">
      <EscolhaDeOrigem
        variante="tela"
        onVideo={() => router.push(`/projects/${projectId}/live?abrir=video`)}
        onGemeo={() => router.push(`/projects/${projectId}/gemeo`)}
        onTema={() => router.push(`/projects/${projectId}/live?abrir=tema`)}
      />

      <Link
        href={`/projects/${projectId}/linha-editorial`}
        className="group flex w-full max-w-[1080px] items-center gap-4 rounded-xl border p-5 transition-colors hover:border-orange-500/40"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--bg-elevated)" }}>
          <NotebookPen className="h-5 w-5 text-orange-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Linha editorial: ideias e roteiros para gravar
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            O squad propõe pautas novas no seu nicho, você escolhe uma e recebe o roteiro por cenas.
            É esse roteiro que guia a edição do vídeo que você gravar.
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" style={{ color: "var(--text-muted)" }} />
      </Link>
    </div>
  );
}
