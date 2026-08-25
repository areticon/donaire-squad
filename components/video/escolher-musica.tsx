"use client";

import { useRef } from "react";
import { ExternalLink, Music, UploadCloud, X } from "lucide-react";
import {
  FONTES_DE_MUSICA,
  CLIMA_DO_ESTILO,
} from "@/lib/media/fontes-de-musica";
import type { NomeDoEstilo } from "@/lib/media/estilos";

/**
 * O popup de escolher a música, no desenho decidido em 23/08 e reafirmado pelo
 * Bruno em 25/08: "abrir um popup para o usuário escolher a música de uma
 * biblioteca pública, imagina o usuário ter que ter várias músicas salvas".
 *
 * O popup é um ATALHO ATÉ A FONTE, e não um catálogo hospedado: o cliente
 * abre a biblioteca pública já filtrada pelo clima do estilo dele, baixa lá, e
 * solta o arquivo aqui. A Demandou nunca toca no arquivo antes do upload dele,
 * que é a linha que a mantém ferramenta em vez de distribuidora.
 */
export function EscolherMusica({
  aberto,
  estilo,
  subindo,
  onFechar,
  onEnviar,
}: {
  aberto: boolean;
  estilo: NomeDoEstilo;
  subindo: boolean;
  onFechar: () => void;
  onEnviar: (arquivo: File) => void;
}) {
  const inputDeArquivo = useRef<HTMLInputElement>(null);
  if (!aberto) return null;

  const climas = CLIMA_DO_ESTILO[estilo] ?? CLIMA_DO_ESTILO.acelerado;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Escolher música"
    >
      {/* O fundo escurecido fecha ao clicar: popup de escolha não é decisão
          irreversível, e prender o usuário nele seria cerimônia. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
      />
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
            Escolher música
          </h3>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg border p-1.5"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
          Abra uma biblioteca, baixe a faixa que combinar, e solte o arquivo
          aqui embaixo. Para o seu estilo, procure por{" "}
          <strong>{climas.join(", ")}</strong>.
        </p>

        <div className="space-y-3">
          {FONTES_DE_MUSICA.map((f) => (
            <div
              key={f.nome}
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {f.nome}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {f.licenca}
                  </p>
                </div>
                <a
                  href={f.busca(climas[0])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              {f.obrigacao && (
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {f.obrigacao}
                </p>
              )}
            </div>
          ))}
        </div>

        <input
          ref={inputDeArquivo}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) onEnviar(arquivo);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={subindo}
          onClick={() => inputDeArquivo.current?.click()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm font-bold disabled:opacity-60"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          {subindo ? (
            <>
              <Music className="h-4 w-4 animate-pulse" /> Enviando a faixa...
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" /> Baixou? Solte ou escolha o arquivo aqui
            </>
          )}
        </button>
        <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          A faixa fica no projeto e entra em todos os cortes, no volume do
          estilo, abaixando quando você fala.
        </p>
      </div>
    </div>
  );
}
