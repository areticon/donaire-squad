"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import type { CorteGuardado } from "@/components/video/esteira-do-video";
import { DESTINOS_DE_CORTE, cabeNoDestino } from "@/lib/media/destinos";

/**
 * Um corte que foi produzido e está desligado.
 *
 * A janela é curta de propósito: a única decisão aqui é "vai ao ar ou não", e
 * para onde. Ligar cria o post e o card de verdade pelo caminho que já existe
 * (`/destinos` chama `sincronizarQuadroDoVideo`), então este componente não
 * duplica nenhuma regra de publicação.
 *
 * Ele existe porque, no teste de 02/09, dois dos três cortes estavam
 * desligados e sumiam do quadro inteiro. Eles tinham sido cortados, pagos e
 * guardados no storage: o que faltava era um lugar para vê-los e um jeito de
 * mudar de ideia sem sair da tela.
 */
export function CorteGuardadoModal({
  videoId,
  corte,
  onFechar,
  onLigado,
}: {
  videoId: string;
  corte: CorteGuardado;
  onFechar: () => void;
  onLigado: () => void;
}) {
  // Já nasce com as redes que o corte trazia quando foi desligado: quem
  // desligou não perdeu a escolha de destino junto.
  const [destinos, setDestinos] = useState<string[]>(corte.destinos ?? []);
  const [salvando, setSalvando] = useState(false);

  function alternar(id: string) {
    setDestinos((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function ligar() {
    if (destinos.length === 0) {
      toast.error("Escolha pelo menos uma rede.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(`/api/videos/${videoId}/destinos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trecho: corte.indice, publicar: true, destinos }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
      toast.success("Corte no quadro. Ele já aparece no dia dele, pronto para revisar.");
      onLigado();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para colocar o corte no quadro.");
    } finally {
      setSalvando(false);
    }
  }

  const duracao =
    corte.inicio != null && corte.fim != null ? Math.round(corte.fim - corte.inicio) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between gap-4 px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-0">
            <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
              Este corte está guardado
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Ele foi cortado e está pronto. Escolha as redes para ele entrar no quadro.
            </p>
          </div>
          <button
            onClick={onFechar}
            className="p-1 rounded-lg hover:bg-white/10 shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid gap-5" style={{ gridTemplateColumns: "180px minmax(0, 1fr)" }}>
          <video
            className="w-full rounded-xl border"
            style={{ borderColor: "var(--border)", background: "var(--bg-input)", aspectRatio: "9/16" }}
            src={corte.video}
            poster={corte.capa}
            controls
            preload="none"
          />

          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {corte.titulo}
              </p>
              {duracao !== null && (
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {duracao} segundos, tirados de {Math.floor((corte.inicio ?? 0) / 60)}:
                  {String(Math.round((corte.inicio ?? 0) % 60)).padStart(2, "0")} da gravação
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
                Onde este corte vai
              </p>
              <div className="flex flex-col gap-1.5">
                {DESTINOS_DE_CORTE.filter((d) => d.publicaVideo).map((d) => {
                  const marcado = destinos.includes(d.id);
                  // Rede cujo limite o corte estoura fica fora desde já: avisar
                  // aqui vale mais do que falhar na hora de publicar.
                  const cabe = duracao === null || cabeNoDestino(duracao, d);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={!cabe}
                      onClick={() => alternar(d.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        borderColor: marcado ? "var(--accent-orange)" : "var(--border)",
                        background: marcado ? "rgba(239,97,34,0.08)" : "transparent",
                        color: marcado ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {d.rotulo}
                      {!cabe && (
                        <span className="ml-auto text-[10px]">
                          o corte passa do limite de {d.limiteSegundos}s
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-auto">
              <Button onClick={() => void ligar()} loading={salvando} disabled={salvando}>
                Colocar no quadro
              </Button>
              <Button variant="outline" onClick={onFechar}>
                Deixar guardado
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
