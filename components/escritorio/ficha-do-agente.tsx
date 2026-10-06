"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENTES, AGENTE_DEV } from "@/lib/squad/estado-do-squad";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import type { VereditoDaVera } from "@/lib/squad/veredito";
import type { EtapaDoParecer } from "@/lib/squad/parecer-da-peca";
import { LinhaDoTempoDoParecer } from "@/components/escritorio/linha-do-tempo-do-parecer";

/**
 * A ficha do agente: quem é, o que faz, e o que já fez, do mais recente para
 * o mais antigo.
 *
 * Abre ao clicar no robô, na mesa ou na plaqueta do escritório. Cada trabalho
 * da lista abre o card completo (o mesmo modal do calendário), então a ficha
 * é a porta e não o destino: ela lista, o card mostra.
 */

export type TrabalhoDoAgente = {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  scheduledDate: string | null;
  cardType: string;
  mediaType?: string | null;
  content: string | null;
  mediaUrl: string | null;
  metadata?: unknown;
  status: string;
  postId: string | null;
  chatHistory: unknown;
  createdAt?: string;
  tema: string | null;
  /** A nota que a Vera deu ao dia deste trabalho. Nulo na ficha da própria Vera. */
  veredito?: VereditoDaVera | null;
  /**
   * A história da peça: reprovado pela Vera, corrigido, aprovado ou rejeitado
   * por você, publicado. Desde 19/09 é isto que a ficha mostra, e não o selo.
   */
  parecer?: { etapas: EtapaDoParecer[] } | null;
};

type Ficha = {
  agente: { id: string; nome: string; papel: string; persona: string; estilo: string; cor: string };
  trabalhos: TrabalhoDoAgente[];
};

const TIPO: Record<string, string> = {
  research: "Pesquisa",
  post_linkedin: "Post LinkedIn",
  post_twitter: "Thread X",
  post_instagram: "Instagram",
  post_facebook: "Facebook",
  post_tiktok: "TikTok",
  post_youtube: "YouTube",
  media: "Mídia",
  video_clip: "Corte de vídeo",
  video_completo: "Vídeo completo",
  preview: "Revisão",
  publish: "Publicação",
};

function EstadoDoTrabalho({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="flex items-center gap-1 text-[10.5px] text-green-400">
        <CheckCircle2 className="h-3 w-3" /> aprovado
      </span>
    );
  if (status === "rejected")
    return (
      <span className="flex items-center gap-1 text-[10.5px] text-red-400">
        <X className="h-3 w-3" /> rejeitado
      </span>
    );
  if (status === "needs_revision")
    return (
      <span className="flex items-center gap-1 text-[10.5px] text-yellow-500">
        <AlertCircle className="h-3 w-3" /> pediu ajuste
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
      <Clock className="h-3 w-3" /> esperando você
    </span>
  );
}

function dia(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
}

function resumo(t: TrabalhoDoAgente): string {
  const texto = (t.content ?? "").replace(/^<[^>]+>\s*/gm, "").replace(/[#*_`>]/g, "").trim();
  const linha = texto.split("\n").find((l) => l.trim().length > 0) ?? "";
  return linha.length > 110 ? `${linha.slice(0, 110)}…` : linha;
}

export function FichaDoAgente({
  projectId,
  agentId,
  falaAtual,
  onFechar,
  onAbrirTrabalho,
}: {
  projectId: string;
  agentId: string;
  /** O que ele está fazendo AGORA, quando a esteira está rodando. */
  falaAtual?: string | null;
  onFechar: () => void;
  onAbrirTrabalho: (trabalho: TrabalhoDoAgente) => void;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O Davi Dev (06/10) não está em AGENTES: trabalha para a Demandou, em todo projeto.
  const fixo = AGENTES.find((a) => a.id === agentId) ?? (agentId === AGENTE_DEV.id ? AGENTE_DEV : undefined);
  const ehODev = agentId === AGENTE_DEV.id;

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/squad/${agentId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Ficha;
      })
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "não consegui carregar");
      });
    return () => {
      vivo = false;
    };
  }, [projectId, agentId]);

  const nome = ficha?.agente.nome ?? fixo?.nome ?? agentId;
  const papel = ficha?.agente.papel ?? fixo?.papel ?? "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        role="dialog"
        aria-label={`Ficha de ${nome}`}
        className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-start gap-3 border-b p-5" style={{ borderColor: "var(--border)" }}>
          <AvatarDoAgente agenteId={agentId} tamanho={56} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              {nome}
            </h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {papel}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-elevated)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {/* O QUE ELE ESTÁ FAZENDO AGORA. Fica no topo porque, com a esteira
              rodando, é a única linha da ficha que muda enquanto se olha. */}
          {falaAtual && (
            <div
              className="flex items-start gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: "color-mix(in srgb, var(--acento) 45%, transparent)", background: "var(--bg-elevated)" }}
            >
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-orange-400" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[10.5px] font-bold uppercase tracking-[.06em] text-orange-400">
                  Fazendo agora
                </span>
                <span className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {falaAtual}
                </span>
              </span>
            </div>
          )}

          {/* O Dev trabalha para a Demandou, não para este projeto (06/10). */}
          {ehODev && (
            <div
              className="rounded-lg border px-3 py-2 text-xs leading-relaxed"
              style={{ borderColor: "color-mix(in srgb, #0f766e 45%, transparent)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
            >
              <span className="font-bold" style={{ color: "#0f766e" }}>
                Trabalha para a Demandou.
              </span>{" "}
              Não entra na sua campanha nem escreve peça: ele lê o que você e os outros clientes pedem no chat das peças e nos chamados,
              separa o que é erro do produto, e leva para o time melhorar a plataforma para todo mundo. Para falar com ele, abra um chamado
              em &quot;Falar com o Dev (melhoria do produto)&quot;.
            </div>
          )}

          {ficha && (ficha.agente.persona || ficha.agente.estilo) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ficha.agente.persona && (
                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[.06em]" style={{ color: "var(--text-muted)" }}>
                    Quem é
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                    {ficha.agente.persona}
                  </p>
                </div>
              )}
              {ficha.agente.estilo && (
                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[.06em]" style={{ color: "var(--text-muted)" }}>
                    Como trabalha
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>
                    {ficha.agente.estilo}
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[.06em]" style={{ color: "var(--text-muted)" }}>
              Trabalhos recentes
            </p>
            {!ficha && !erro && (
              <p className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> buscando o histórico…
              </p>
            )}
            {erro && (
              <p className="text-xs text-red-400">Não consegui carregar o histórico ({erro}). Tente abrir de novo.</p>
            )}
            {ficha && ficha.trabalhos.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {nome.split(" ")[0]} ainda não fez nenhum trabalho neste projeto.
              </p>
            )}
            {ficha && ficha.trabalhos.length > 0 && (
              <ul className="space-y-1.5">
                {ficha.trabalhos.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onAbrirTrabalho(t)}
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors hover:border-orange-500/50"
                      )}
                      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                    >
                      <span className="flex items-center justify-between gap-2 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                        <span className="flex items-center gap-1.5 tabular-nums">
                          {dia(t.scheduledDate ?? t.createdAt ?? null)}
                          <span aria-hidden>·</span>
                          {t.cardType === "post_linkedin" && agentId !== "lucas-linkedin" && papel ? `Post ${papel}` : TIPO[t.cardType] ?? t.cardType}
                        </span>
                        {/* Com linha do tempo, o selo do canto sai: ele lia o
                            status do card da Diana ("esperando você") quando
                            a peça inteira já tinha sido rejeitada nos posts. */}
                        {!(t.parecer && t.parecer.etapas.length > 0) && <EstadoDoTrabalho status={t.status} />}
                      </span>
                      <span className="line-clamp-2 text-xs" style={{ color: "var(--text-primary)" }}>
                        {resumo(t) || t.tema || "sem texto"}
                      </span>
                      {t.tema && resumo(t) && (
                        <span className="truncate text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                          tema: {t.tema}
                        </span>
                      )}
                      {t.parecer && t.parecer.etapas.length > 0 && (
                        <LinhaDoTempoDoParecer etapas={t.parecer.etapas} compacta className="mt-1 w-full" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
