"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ROTULO_DA_FALHA, DETALHE_DA_FALHA, ROTULO_DA_SEGURA, DETALHE_DA_SEGURA } from "@/lib/media/estado-da-montagem";
import { TentarMontagem } from "@/components/video/tentar-montagem";

/** Uma montagem de efeitos que desistiu por erro técnico (vem da página do servidor). */
export type FalhaDaMontagem = {
  videoJobId: string;
  /** Nome do arquivo enviado, para o cliente saber de qual gravação é. */
  nome: string;
  /** "completo" ou o índice do corte. */
  alvo: "completo" | number;
  /** Título do corte (só nos cortes). */
  titulo?: string | null;
  /**
   * "falha": a montagem desistiu por erro técnico. "segura" (02/10): a revisão
   * visual não conseguiu consertar e foi ao ar a versão sem inserção.
   */
  tipo?: "falha" | "segura";
  /** Créditos devolvidos por esta peça (linha "estorno_edicao" do extrato). */
  devolvidos?: number;
  /**
   * Pedir de novo não resolve (08/10, o completo aprovado sem o plano da
   * jornada): sem o botão, e com a frase própria do que houve.
   */
  semNovaTentativa?: boolean;
  detalhe?: string | null;
};

/**
 * O AVISO ACIMA DO QUADRO (01/10/2026, parte 240). O Bruno leu "edição
 * finalizada" num vídeo completo que tinha voltado sem nenhum efeito: o render
 * quebrou três vezes e a plataforma entregou a versão só com a edição de fala,
 * em silêncio. Agora a falha aparece aqui, por peça, com a frase clara e o
 * botão que pede de novo sem cobrar. Componente de cliente puro: os dados vêm
 * prontos da página (app/(app)/projects/[id]/live/page.tsx).
 */
export function AvisoDaMontagem({ falhas, aoPedir }: { falhas: FalhaDaMontagem[]; aoPedir?: () => void }) {
  const [pedidas, setPedidas] = useState<string[]>([]);
  const chave = (f: FalhaDaMontagem) => `${f.videoJobId}:${f.alvo}`;
  const visiveis = falhas.filter((f) => !pedidas.includes(chave(f)));
  if (!visiveis.length) return null;
  const devolvido = visiveis.reduce((s, f) => s + (f.devolvidos ?? 0), 0);
  const soSeguras = visiveis.every((f) => f.tipo === "segura");
  // A falha sem nova tentativa não leva a frase padrão ("tentamos três vezes",
  // "pode pedir de novo"): ela diz o que houve, e o botão some (08/10).
  const semNova = visiveis.filter((f) => f.semNovaTentativa);
  const todasSemNova = semNova.length === visiveis.length;
  const detalhe = soSeguras
    ? DETALHE_DA_SEGURA
    : todasSemNova
      ? (semNova[0]?.detalhe ?? DETALHE_DA_FALHA)
      : semNova.length
        ? "Uma parte das montagens de efeitos não saiu. Onde houver o botão, você pode pedir de novo sem pagar nada; a equipe já foi avisada de todas."
        : DETALHE_DA_FALHA;
  return (
    <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-[18px] h-[18px] text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {soSeguras ? ROTULO_DA_SEGURA : ROTULO_DA_FALHA}.
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {detalhe}
          </p>
          {devolvido > 0 ? (
            <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-primary)" }}>
              Devolvemos {devolvido.toLocaleString("pt-BR")} créditos da edição que não foi entregue. A devolução já está no seu extrato.
            </p>
          ) : null}
        </div>
      </div>
      <ul className="space-y-2">
        {visiveis.map((f) => (
          <li key={chave(f)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}>
            <span className="text-sm min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
              {f.alvo === "completo" ? "Vídeo completo" : `Corte ${f.alvo + 1}${f.titulo ? `: ${f.titulo}` : ""}`}
              <span style={{ color: "var(--text-muted)" }}> · {f.nome}</span>
              {f.tipo === "segura" ? <span style={{ color: "var(--text-muted)" }}> · versão sem inserções</span> : null}
              {f.devolvidos ? <span style={{ color: "var(--text-muted)" }}> · {f.devolvidos.toLocaleString("pt-BR")} créditos devolvidos</span> : null}
              {f.semNovaTentativa && !todasSemNova && f.detalhe ? <span className="block text-xs whitespace-normal" style={{ color: "var(--text-muted)" }}>{f.detalhe}</span> : null}
            </span>
            {f.semNovaTentativa ? null : <TentarMontagem
              videoJobId={f.videoJobId}
              alvo={f.alvo}
              compacto
              aoPedir={() => {
                setPedidas((p) => [...p, chave(f)]);
                aoPedir?.();
              }}
            />}
          </li>
        ))}
      </ul>
    </div>
  );
}
