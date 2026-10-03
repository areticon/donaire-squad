"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Captions, Music, Sparkles, Volume2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstiloDoProjeto } from "@/components/video/estilo-do-projeto";
import type { ResumoDaEdicao } from "@/lib/media/edicao-escolhida";

/**
 * "COMO O SQUAD EDITA", em resumo e com "Trocar" (02/10/2026). O Bruno gerou
 * um vídeo do gêmeo e perguntou "como ele vai editar? baseado em quê?": o
 * fluxo usava o padrão do projeto sem dizer. Este cartão diz o estilo, a
 * legenda, a trilha e os efeitos que vão ser usados, e abre o MESMO passo do
 * modal "Nova campanha" (EstiloDoProjeto, que salva no projeto) para trocar.
 * Usado na página do gêmeo, antes de gerar, e no topo da tela de roteiro.
 * Componente de cliente puro: o resumo vem pronto do servidor.
 */
export function ComoOSquadEdita({
  projectId,
  resumo,
  estiloInicial,
  musica,
  termos,
  onde,
}: {
  projectId: string;
  resumo: ResumoDaEdicao;
  /** Project.videoStyle, o que o passo do estilo recebe. */
  estiloInicial: string | null;
  /** O nome do arquivo da trilha do projeto, se houver. */
  musica: string | null;
  termos: string | null;
  onde: "gemeo" | "roteiro";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const linhas = [
    { Icone: Captions, texto: `Legenda: ${resumo.legenda}` },
    { Icone: Music, texto: resumo.trilha },
    { Icone: Volume2, texto: resumo.efeitos },
  ];
  return (
    <section className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Como o squad edita {onde === "gemeo" ? "o vídeo do gêmeo" : "este vídeo"}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
            <Wand2 className="mr-1 inline h-4 w-4 -mt-0.5" style={{ color: "var(--accent-orange)" }} />
            {resumo.doPadrao ? "Usando o padrão do projeto: " : "Estilo: "}
            <strong>{resumo.estilo}</strong>
            {resumo.referencia ? <span style={{ color: "var(--text-muted)" }}> ({resumo.referencia})</span> : null}.
          </p>
        </div>
        <Button size="sm" variant={aberto ? "outline" : "default"} onClick={() => (aberto ? (setAberto(false), router.refresh()) : setAberto(true))}>
          {aberto ? "Pronto" : "Trocar"}
        </Button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {linhas.map(({ Icone, texto }) => (
          <li key={texto} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
            <Icone className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
            {texto}
          </li>
        ))}
      </ul>
      {resumo.planejadoEm && (
        <p className="mt-2 text-xs" style={{ color: "var(--accent-orange)" }}>
          <Sparkles className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />
          Este roteiro foi planejado em {resumo.planejadoEm}. A legenda e a trilha novas já valem; o estilo novo entra no próximo
          vídeo, ou aqui pelo &quot;Replanejar no estilo novo&quot; de &quot;Voltar à edição&quot;.
        </p>
      )}
      {aberto && (
        <div className="mt-4 space-y-4">
          <EstiloDoProjeto projectId={projectId} inicial={estiloInicial} musicaInicial={musica} termosIniciais={termos} mostrar="estilo" />
          <EstiloDoProjeto projectId={projectId} inicial={estiloInicial} musicaInicial={musica} termosIniciais={termos} mostrar="trilha-e-termos" />
        </div>
      )}
    </section>
  );
}
