"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Images, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_DA_ETIQUETA, type MaterialNaTela } from "@/lib/materiais/tipos";

/**
 * "USE ESTAS FOTOS NESTA CAMPANHA" (03/10/2026). O cliente marca materiais da
 * biblioteca; a campanha leva os ids em `materiaisDaCampanha` e a geração das
 * artes (lib/materiais/escolha.ts) prefere os marcados, distribuindo pelos
 * posts: cada peça leva o que serve à frase dela, o menos usado primeiro.
 * Sem marcar nada, a biblioteca inteira continua valendo.
 */
export function MateriaisDaCampanha({ projectId, valor, aoMudar }: { projectId: string; valor: string[]; aoMudar: (ids: string[]) => void }) {
  const [lista, setLista] = useState<MaterialNaTela[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/materiais`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { materiais: [] }))
      .then((j: { materiais: MaterialNaTela[] }) => vivo && setLista(j.materiais.filter((m) => m.status !== "falhou" && !m.etiquetas.includes("documento"))))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  if (lista === null) return null;

  const marcados = new Set(valor);
  const trocar = (id: string) => aoMudar(marcados.has(id) ? valor.filter((x) => x !== id) : [...valor, id]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            <Images className="h-4 w-4 text-orange-400" />
            Seus materiais nesta campanha
          </p>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-muted)" }}>
            {lista.length === 0
              ? "Suba fotos suas, do local e dos produtos: o squad usa a foto real antes de gerar imagem."
              : valor.length
                ? `${valor.length} marcado(s). O squad distribui pelas peças com imagem, cada foto onde ela serve.`
                : "Marque as fotos que você quer ver nesta campanha. Sem marcar, o squad escolhe na biblioteca inteira."}
          </p>
        </div>
        <Link href={`/projects/${projectId}/criar#materiais`} className="shrink-0 text-[12px] font-medium text-orange-400 underline-offset-2 hover:underline">
          {lista.length ? "Subir mais" : "Subir agora"}
        </Link>
      </div>
      {lista.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {lista.map((m) => {
            const sel = marcados.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => trocar(m.id)}
                aria-pressed={sel}
                title={m.descricao ?? undefined}
                className={cn("relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all", sel ? "border-orange-500" : "border-transparent opacity-80 hover:opacity-100")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/projects/${projectId}/materiais/${m.id}/arquivo?v=mini`} alt="" loading="lazy" className="h-full w-full object-cover" />
                {m.tipo === "video" && <Play className="absolute left-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />}
                {sel && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                {m.etiquetas[0] && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">{ROTULO_DA_ETIQUETA[m.etiquetas[0]]}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
