"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Prévia do primeiro post, dentro do passo Voz e Estilo.
 *
 * Tapa o buraco mais caro da jornada: sem isto, o cliente só vê o produto
 * funcionar no passo 7 de 7, e o teste de 7 dias já cobrou o cartão dele.
 * Aqui ele vê no passo 2.
 */

export function SetupPreview({
  projectId,
  pronto,
}: {
  projectId: string;
  pronto: boolean;
}) {
  const [carregando, setCarregando] = useState(false);
  const [post, setPost] = useState<string | null>(null);
  const [tema, setTema] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setPost(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) setErro(data.error ?? "Não consegui gerar agora.");
      else {
        setPost(data.post);
        setTema(data.tema ?? null);
      }
    } catch {
      setErro("Não consegui gerar agora. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            Veja o squad escrevendo, agora
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Com o nicho e o tom que você acabou de definir, dá para escrever um
            post de verdade. Não precisa esperar terminar a configuração.
          </p>
        </div>
        <Button size="sm" onClick={gerar} disabled={carregando || !pronto}>
          {carregando ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Escrevendo
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              {post ? "Gerar outro" : "Ver um post meu"}
            </>
          )}
        </Button>
      </div>

      {!pronto && (
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Preencha o tom de voz acima para liberar.
        </p>
      )}

      {erro && <p className="text-sm text-orange-400 mt-3">{erro}</p>}

      <AnimatePresence>
        {post && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4"
          >
            <div
              className="rounded-lg border p-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              {post}
            </div>
            {tema && (
              <p className="text-xs text-[var(--text-muted)] mt-3 italic">
                {tema}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
