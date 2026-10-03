"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { Sparkles, Upload, X, Loader2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DE ONDE VEM A PEÇA DO DIA: gerada por IA ou do próprio cliente (28/09).
 *
 * Pedido do Bruno: "para cada post, ele escolhe se vai subir o material dele
 * ou gerar por IA. Por exemplo, segunda vai ser um vídeo: ele pode pedir para
 * gerar ou subir. O carrossel, o texto, tudo deve ser assim." E, na mesma
 * conversa, a decisão de incentivar o vídeo do próprio cliente no lugar do
 * vídeo por IA, que custa caro e ainda não entrega o que ele quer.
 *
 * Mídia sobe direto do navegador para o storage (/api/campanha/material só
 * assina); texto próprio vai como base, e os redatores só ajustam o formato de
 * cada rede.
 */
export type OrigemDoDia =
  | { modo: "ia" }
  | { modo: "meu"; tipo: "imagem" | "carrossel" | "video" | "texto"; urls: string[]; texto?: string };

const EH_MIDIA = new Set(["image", "carousel", "video", "infographic"]);

function tipoDoConteudo(ct: string): "imagem" | "carrossel" | "video" | "texto" {
  if (ct === "carousel") return "carrossel";
  if (ct === "video") return "video";
  if (EH_MIDIA.has(ct)) return "imagem";
  return "texto";
}

export function OrigemDoDiaCampo({
  projectId,
  contentType,
  valor,
  aoMudar,
}: {
  projectId: string;
  contentType: string;
  valor: OrigemDoDia | undefined;
  aoMudar: (v: OrigemDoDia) => void;
}) {
  const tipo = tipoDoConteudo(contentType);
  const meu = valor?.modo === "meu" ? valor : null;
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    const lista = Array.from(arquivos).slice(0, tipo === "carrossel" ? 10 : 1);
    const urls: string[] = tipo === "carrossel" ? [...(meu?.urls ?? [])] : [];
    try {
      for (const [i, f] of lista.entries()) {
        setEnviando(Math.round((i / lista.length) * 100));
        const b = await upload(`campanhas/${projectId}/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/campanha/material",
          clientPayload: JSON.stringify({ projectId }),
          multipart: f.size > 50 * 1024 * 1024,
          onUploadProgress: (p) => setEnviando(Math.round(((i + p.percentage / 100) / lista.length) * 100)),
        });
        urls.push(b.url);
      }
      aoMudar({ modo: "meu", tipo, urls: urls.slice(0, 10) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O envio falhou.");
    } finally {
      setEnviando(null);
    }
  }

  const botao = (ativo: boolean) =>
    cn(
      "flex items-center gap-1 h-6 px-2 rounded-md border text-[10.5px] font-medium transition-all",
      ativo ? "bg-orange-500/10 border-orange-500 text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-accent)]"
    );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button type="button" className={botao(!meu)} onClick={() => aoMudar({ modo: "ia" })}>
          <Sparkles className="w-3 h-3" /> {tipo === "texto" ? "Escrever por IA" : "Gerar por IA"}
        </button>
        <button type="button" className={botao(Boolean(meu))} onClick={() => aoMudar({ modo: "meu", tipo, urls: meu?.urls ?? [], texto: meu?.texto })}>
          {tipo === "texto" ? <PenLine className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
          {tipo === "texto" ? "Escrever eu" : tipo === "video" ? "Subir o meu vídeo" : tipo === "carrossel" ? "Subir as minhas lâminas" : "Subir a minha imagem"}
        </button>
        {tipo === "video" && !meu && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            vídeo seu não gasta crédito de vídeo
          </span>
        )}
      </div>

      {meu && tipo === "texto" && (
        <textarea
          value={meu.texto ?? ""}
          onChange={(e) => aoMudar({ ...meu, texto: e.target.value })}
          rows={4}
          placeholder="Escreva o seu texto. Os agentes só ajustam o formato de cada rede, sem mudar as suas ideias."
          className="w-full text-xs px-3 py-2 rounded-lg border outline-none resize-y"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
      )}

      {meu && tipo !== "texto" && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {meu.urls.map((u, i) => (
              <div key={u} className="relative h-12 w-12 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
                {tipo === "video" ? (
                  <video src={u} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u} alt={`lâmina ${i + 1}`} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  aria-label="Tirar"
                  onClick={() => aoMudar({ ...meu, urls: meu.urls.filter((x) => x !== u) })}
                  className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {(tipo === "carrossel" ? meu.urls.length < 10 : meu.urls.length === 0) && (
              <label
                className="flex h-12 min-w-12 cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed px-2 text-[10px]"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {enviando !== null ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> {enviando}%
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3" /> {tipo === "carrossel" ? "lâminas" : "arquivo"}
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  disabled={enviando !== null}
                  multiple={tipo === "carrossel"}
                  accept={tipo === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"}
                  onChange={(e) => void enviar(e.target.files)}
                />
              </label>
            )}
          </div>
          <p className="text-[10px]" style={{ color: erro ? "#f87171" : "var(--text-muted)" }}>
            {erro ??
              (tipo === "carrossel"
                ? "De 2 a 10 imagens, na ordem em que você quer que apareçam. O tema acima diz aos agentes sobre o que é."
                : "O tema acima diz aos agentes sobre o que é o seu material, para os textos acompanharem.")}
          </p>
        </div>
      )}
    </div>
  );
}

/** A escolha está completa? Material próprio sem arquivo (ou sem texto) não está. */
export function origemIncompleta(v: OrigemDoDia | undefined): string | null {
  if (!v || v.modo === "ia") return null;
  if (v.tipo === "texto") return v.texto?.trim() ? null : "escreva o seu texto";
  if (v.tipo === "carrossel") return v.urls.length >= 2 ? null : "suba pelo menos 2 lâminas";
  return v.urls.length ? null : "suba o arquivo";
}
