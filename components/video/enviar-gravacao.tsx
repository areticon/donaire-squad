"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { EstiloDoProjeto } from "@/components/video/estilo-do-projeto";
import { VideoUpload } from "@/components/video/video-upload";

/**
 * O envio da gravação, dentro do Gestor de Conteúdo.
 *
 * O envio morava na tela do vídeo, que sai de cena. Ele vem inteiro, com o
 * estilo, a trilha e os termos do negócio ao lado, porque essas três escolhas
 * decidem como o corte é editado: pedi-las depois seria pedir para o cliente
 * escolher como editar um vídeo que já foi editado.
 */
export function EnviarGravacao({
  projectId,
  aberto,
  estilo,
  musica,
  termos,
  onFechar,
  onEnviado,
}: {
  projectId: string;
  aberto: boolean;
  estilo: string | null;
  musica: string | null;
  termos: string | null;
  onFechar: () => void;
  onEnviado: () => void;
}) {
  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="enviar-gravacao"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-2xl border p-5 space-y-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                Envie a gravação da semana
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Você grava uma vez. O squad ouve, escolhe os melhores momentos, corta, escreve o
                texto de cada rede e enche este quadro. Os primeiros cortes aparecem em cerca de 5
                minutos, e o vídeo completo em cerca de 18.
              </p>
            </div>
            <button
              onClick={onFechar}
              title="Fechar"
              className="p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <EstiloDoProjeto
            projectId={projectId}
            inicial={estilo}
            musicaInicial={musica}
            termosIniciais={termos}
          />

          <VideoUpload projectId={projectId} onEnviado={onEnviado} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
