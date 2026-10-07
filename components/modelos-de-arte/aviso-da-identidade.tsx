"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Palette } from "lucide-react";
import { ROTULO_DO_BOTAO_ESCOLHER } from "@/lib/modelos-de-arte/espera-da-identidade";

/**
 * O ESTILO É PERGUNTADO ANTES (06/10/2026).
 *
 * O Bruno, em 06/10, sobre o infográfico da campanha nova: "onde foi que foi
 * determinado esse estilo de arte? os agentes geraram as artes sem perguntar
 * o estilo antes". A trava do servidor já segurava imagem e carrossel sem
 * identidade aprovada (o infográfico escapava, e isso foi corrigido em
 * lib/media/pecas-da-semana.ts), mas a tela do vídeo não dizia nada ANTES de
 * gerar: só o quadro, depois, mostrava "aguardando a sua identidade visual".
 *
 * Este aviso aparece onde a semana é planejada, antes de gastar: com dia de
 * arte (imagem, carrossel, infográfico) e a identidade sem aprovação, diz que
 * esses dias saem só com o texto até o cliente escolher o modelo, a letra e as
 * cores, e leva direto a Modelos de arte. Nada é bloqueado: os textos saem.
 *
 * `aprovada` vindo de fora (o book já carregado na mesma tela) evita outra
 * leitura; sem ele, o aviso lê o estado do projeto sozinho.
 *
 * 08/10: o aviso não é mais o único caminho. A janela da campanha e a
 * jornada do vídeo abrem o passo do estilo dos posts antes de gerar
 * (components/estilo-dos-posts), e o texto diz isso.
 */
export function AvisoDaIdentidade({ projectId, temArte, aprovada: deFora, compacto }: { projectId: string; temArte: boolean; aprovada?: boolean | null; compacto?: boolean }) {
  const [lida, setLida] = useState<boolean | null>(null);
  useEffect(() => {
    if (deFora !== undefined) return;
    let vivo = true;
    fetch(`/api/projects/${projectId}/modelos-de-arte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && d.identidade && typeof d.identidade.aprovada === "boolean") setLida(d.identidade.aprovada);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, deFora]);
  const aprovada = deFora !== undefined ? deFora : lida;
  if (!temArte || aprovada !== false) return null;
  return (
    <div
      className={compacto ? "flex max-w-[320px] flex-col items-end gap-1 text-right" : "mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"}
      style={compacto ? undefined : { borderColor: "rgba(234,88,12,0.4)", background: "rgba(234,88,12,0.08)" }}
    >
      <p className={compacto ? "text-[10px] leading-snug" : "flex items-start gap-2 text-xs leading-snug"} style={{ color: "#ea580c" }}>
        {!compacto && <Palette className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
          O estilo dos posts ainda não foi escolhido. Antes de gerar, você escreve como quer ou escolhe um da biblioteca, e os dias com imagem, carrossel ou infográfico saem nele. Nenhum crédito de imagem é gasto até lá.
        </span>
      </p>
      <Link
        href={`/projects/${projectId}/settings?aba=modelos`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600"
      >
        {ROTULO_DO_BOTAO_ESCOLHER} o estilo dos posts
      </Link>
    </div>
  );
}
