"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, RefreshCw } from "lucide-react";
import {
  CLIMAS_DE_CAPA,
  CLIMAS_DE_CAPA_ROTULO,
  ESTILOS_DE_CAPA,
  ESTILOS_DE_CAPA_ROTULO,
  type CapasDoCompleto,
  type ClimaDaCapa,
  type EstiloDeCapa,
} from "@/lib/media/estilos-de-capa";

/**
 * A capa do vídeo completo no YouTube, dentro do card do Vitor.
 *
 * Nasceu em 02/09 do primeiro vídeo publicado de verdade pelo Bruno: subiu
 * sem capa. A regra dele: "pelo menos 2 opções para o usuário, e o usuário
 * precisa ter a opção de escolher o estilo da capa".
 *
 * Quatro decisões de tela:
 * - O estilo vem primeiro, como chips. Trocar o estilo já gera 2 opções
 *   novas (e grava o estilo no projeto, para os próximos vídeos).
 * - O clima (a cara e a luz) vem logo abaixo, também como chips, e vale só
 *   para este vídeo. Trocar o clima também gera 2 opções novas. Nasceu em
 *   02/09 da queixa do Bruno de sair sempre sério em toda capa.
 * - As duas opções são 16:9 lado a lado, com a escolhida marcada. Clicar em
 *   uma escolhe, sem botão de confirmar: a escolha é reversível.
 * - "Gerar outras 2" no mesmo estilo e clima, para quem não gostou de nenhuma.
 *
 * Quando o vídeo já está no ar, escolher troca a capa no YouTube na hora, e
 * a tela diz se o YouTube recusou (canal sem verificação por telefone).
 */
export function CapaDoCompleto({
  videoJobId,
  onEscolhida,
}: {
  videoJobId: string;
  /** A URL da capa escolhida, para o pôster do player e a prévia do post. */
  onEscolhida?: (url: string) => void;
}) {
  const [capas, setCapas] = useState<CapasDoCompleto | null>(null);
  const [estilo, setEstilo] = useState<EstiloDeCapa>("impacto");
  const [clima, setClima] = useState<ClimaDaCapa>("automatico");
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [escolhendo, setEscolhendo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/videos/${videoJobId}/capas-do-completo`);
      if (!r.ok) return;
      const d = (await r.json()) as { capas: CapasDoCompleto | null; estilo: EstiloDeCapa };
      setCapas(d.capas);
      setEstilo(d.capas?.estilo ?? d.estilo);
      setClima(d.capas?.clima ?? "automatico");
    } finally {
      setCarregando(false);
    }
  }, [videoJobId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O piloto da esteira gera as capas sozinho quando o completo chega; se o
  // cliente abriu o card antes disso, a tela espera e consulta de novo.
  useEffect(() => {
    if (carregando || capas || gerando) return;
    const t = setInterval(() => void carregar(), 8_000);
    return () => clearInterval(t);
  }, [carregando, capas, gerando, carregar]);

  const gerar = async (pedido: { estilo?: EstiloDeCapa; clima?: ClimaDaCapa } = {}) => {
    setGerando(true);
    if (pedido.estilo) setEstilo(pedido.estilo);
    if (pedido.clima) setClima(pedido.clima);
    try {
      const r = await fetch(`/api/videos/${videoJobId}/capas-do-completo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O clima vai sempre: sem ele o servidor repetiria o das capas
        // anteriores, e o chip na tela é o que o cliente está vendo.
        body: JSON.stringify({ ...pedido, clima: pedido.clima ?? clima }),
      });
      const d = (await r.json().catch(() => ({}))) as { capas?: CapasDoCompleto; error?: string };
      if (!r.ok || !d.capas) throw new Error(d.error ?? "Não consegui gerar as capas.");
      setCapas(d.capas);
      onEscolhida?.(d.capas.opcoes[d.capas.escolhida]?.url);
      toast.success("Duas capas novas. Clique na que vai para o YouTube.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui gerar as capas.");
    } finally {
      setGerando(false);
    }
  };

  const escolher = async (indice: number) => {
    if (!capas || capas.escolhida === indice || escolhendo !== null) return;
    setEscolhendo(indice);
    try {
      const r = await fetch(`/api/videos/${videoJobId}/capas-do-completo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escolhida: indice }),
      });
      const d = (await r.json().catch(() => ({}))) as { capas?: CapasDoCompleto; aviso?: string; error?: string };
      if (!r.ok || !d.capas) throw new Error(d.error ?? "Não consegui gravar a escolha.");
      setCapas(d.capas);
      onEscolhida?.(d.capas.opcoes[indice].url);
      if (d.aviso) toast.error(d.aviso, { duration: 9_000 });
      else toast.success("Capa escolhida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui gravar a escolha.");
    } finally {
      setEscolhendo(null);
    }
  };

  const ocupado = gerando || carregando;

  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Capa no YouTube
        </p>
        {capas && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void gerar()}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all hover:border-orange-500/50 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {gerando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Gerar outras 2
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ESTILOS_DE_CAPA.map((e) => {
          const ativo = e === estilo;
          return (
            <button
              key={e}
              type="button"
              disabled={ocupado}
              title={ESTILOS_DE_CAPA_ROTULO[e].descricao}
              onClick={() => void gerar({ estilo: e })}
              className="text-xs px-2.5 py-1 rounded-full border transition-all disabled:opacity-50"
              style={{
                borderColor: ativo ? "var(--accent-orange)" : "var(--border)",
                color: ativo ? "var(--accent-orange)" : "var(--text-muted)",
                background: ativo ? "rgba(249,115,22,0.08)" : "transparent",
              }}
            >
              {ESTILOS_DE_CAPA_ROTULO[e].rotulo}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {ESTILOS_DE_CAPA_ROTULO[estilo].descricao} O estilo vale para o canal inteiro.
      </p>

      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Clima da capa
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CLIMAS_DE_CAPA.map((c) => {
          const ativo = c === clima;
          return (
            <button
              key={c}
              type="button"
              disabled={ocupado}
              title={CLIMAS_DE_CAPA_ROTULO[c].descricao}
              onClick={() => void gerar({ clima: c })}
              className="text-xs px-2.5 py-1 rounded-full border transition-all disabled:opacity-50"
              style={{
                borderColor: ativo ? "var(--accent-orange)" : "var(--border)",
                color: ativo ? "var(--accent-orange)" : "var(--text-muted)",
                background: ativo ? "rgba(249,115,22,0.08)" : "transparent",
              }}
            >
              {CLIMAS_DE_CAPA_ROTULO[c].rotulo}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {CLIMAS_DE_CAPA_ROTULO[clima].descricao} O clima é só deste vídeo.
      </p>

      {ocupado || !capas ? (
        <div className="flex items-center gap-2 text-xs py-3" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          {gerando
            ? "Vitor Vídeo está montando duas capas com o seu rosto. Leva até 2 minutos."
            : carregando
              ? "Carregando as capas..."
              : "As capas ainda estão sendo montadas. Esta parte atualiza sozinha."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {capas.opcoes.map((o, i) => {
            const marcada = capas.escolhida === i;
            return (
              <button
                key={o.url}
                type="button"
                onClick={() => void escolher(i)}
                disabled={escolhendo !== null}
                className="relative text-left rounded-lg overflow-hidden border-2 transition-all"
                style={{ borderColor: marcada ? "var(--accent-orange)" : "var(--border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.url} alt={o.frase} className="w-full aspect-video object-cover bg-black" />
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                    {o.frase}
                  </span>
                  {escolhendo === i ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: "var(--accent-orange)" }} />
                  ) : marcada ? (
                    <span className="flex items-center gap-1 text-[11px] shrink-0" style={{ color: "var(--accent-orange)" }}>
                      <Check className="w-3 h-3" /> Vai para o YouTube
                    </span>
                  ) : (
                    <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>Escolher</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
