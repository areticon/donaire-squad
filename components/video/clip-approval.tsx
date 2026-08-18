"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Clock } from "lucide-react";
import { MAX_X } from "@/lib/media/limits";

/**
 * Tela de aprovação dos posts que saíram do vídeo.
 *
 * Editável de propósito. O squad acerta o tom na maior parte das vezes, mas a
 * pessoa conhece o próprio caso melhor que qualquer modelo, e obrigar a aprovar
 * como está transformaria uma correção de dez segundos em um pedido de refazer,
 * que custa uma chamada nova.
 *
 * Aprovar cria posts de verdade no fluxo que já existe, com publicação,
 * agendamento e métricas. O vídeo não ganha um caminho próprio de publicação.
 */

export type TrechoComPosts = {
  inicio: number;
  fim: number;
  titulo: string;
  motivo: string;
  aprovado?: boolean;
  erro?: string;
  posts?: { linkedin: string; x: string; instagram: string };
};

const REDES = [
  { chave: "linkedin" as const, nome: "LinkedIn" },
  { chave: "x" as const, nome: "X" },
  { chave: "instagram" as const, nome: "Instagram", aviso: "Publicação liberada quando o App Review da Meta sair" },
];

function tempo(s: number): string {
  const m = Math.floor(s / 60);
  const seg = Math.round(s % 60);
  return `${m}:${String(seg).padStart(2, "0")}`;
}

export function ClipApproval({
  videoId,
  index,
  trecho,
  onAprovado,
}: {
  videoId: string;
  index: number;
  trecho: TrechoComPosts;
  onAprovado: () => void;
}) {
  const [aba, setAba] = useState<"linkedin" | "x" | "instagram">("linkedin");
  const [textos, setTextos] = useState(trecho.posts);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (trecho.erro) {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
          {trecho.titulo}
        </p>
        <p className="text-sm text-orange-400 mt-1">
          Esse trecho não virou post: {trecho.erro}
        </p>
      </div>
    );
  }

  if (!textos) return null;

  const excedeX = textos.x.length > MAX_X;

  async function aprovar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipIndex: index, redes: textos }),
      });
      const data = await res.json();
      if (!res.ok) setErro(data.error ?? "Não consegui aprovar.");
      else onAprovado();
    } catch {
      setErro("Não consegui aprovar agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {trecho.titulo}
          </p>
          <p
            className="text-sm mt-0.5 flex items-center gap-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <Clock className="w-3.5 h-3.5" />
            {tempo(trecho.inicio)} a {tempo(trecho.fim)} da gravação
          </p>
        </div>
        {trecho.aprovado && (
          <span className="text-sm text-green-400 flex items-center gap-1.5 shrink-0">
            <Check className="w-4 h-4" />
            Aprovado
          </span>
        )}
      </div>

      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        {trecho.motivo}
      </p>

      <div className="flex gap-2 mb-3 flex-wrap">
        {REDES.map((r) => (
          <button
            key={r.chave}
            onClick={() => setAba(r.chave)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: aba === r.chave ? "var(--bg-elevated)" : "transparent",
              color: aba === r.chave ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {r.nome}
            {r.chave === "x" && (
              <span className={excedeX ? "text-orange-400 ml-1.5" : "ml-1.5 opacity-60"}>
                {textos.x.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <textarea
        value={textos[aba]}
        onChange={(e) => setTextos({ ...textos, [aba]: e.target.value })}
        rows={aba === "x" ? 4 : 10}
        className="w-full rounded-xl p-4 text-sm leading-relaxed resize-y focus:outline-none focus:border-orange-500"
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      />

      {aba === "instagram" && (
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          {REDES[2].aviso}
        </p>
      )}

      {excedeX && (
        <p className="text-sm text-orange-400 mt-2">
          O post do X tem {textos.x.length} caracteres e o limite da rede é{" "}
          {MAX_X}. Acima disso a publicação é recusada.
        </p>
      )}

      {erro && <p className="text-sm text-orange-400 mt-2">{erro}</p>}

      <div className="mt-4">
        <Button onClick={aprovar} disabled={salvando || excedeX}>
          {salvando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Aprovando
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              {trecho.aprovado ? "Aprovar de novo" : "Aprovar e mandar para Posts"}
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
