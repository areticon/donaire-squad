"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Film, Search } from "lucide-react";
import {
  creditosDaSemana,
  DIAS_DA_SEMANA,
  FORMATOS,
  normalizarSemana,
  type FormatoDoDia,
  type SemanaDoVideo,
} from "@/lib/media/semana-do-video";

/**
 * O planejador da semana a partir do vídeo: um dia por linha, terça a
 * domingo, com o formato de cada um. Segunda aparece travada porque é o vídeo
 * (completo mais cortes) e vem da gravação.
 *
 * A escolha mora no PROJETO (`videoSemana`), como o estilo e a trilha: vale
 * para as próximas gravações até o cliente mudar, e o agendar congela uma
 * cópia no run da semana. Salva a cada troca, sem botão, porque a escolha é
 * barata e reversível, e esperar a rede para pintar a linha faria a tela
 * parecer travada.
 *
 * Desenho aprovado pelo Bruno em 02/09 (docs/design/campanha-do-video).
 */
export function SemanaDoVideoPlanejador({
  projectId,
  inicial,
}: {
  projectId: string;
  /** Project.videoSemana como veio do banco (pode ser nulo). */
  inicial: unknown;
}) {
  const [semana, setSemana] = useState<SemanaDoVideo>(() => normalizarSemana(inicial));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ultimaSalva = useRef<string>(JSON.stringify(normalizarSemana(inicial)));

  // Salva com um pequeno atraso, para uma sequência de cliques virar um PATCH.
  useEffect(() => {
    const atual = JSON.stringify(semana);
    if (atual === ultimaSalva.current) return;
    const t = setTimeout(async () => {
      setSalvando(true);
      setErro(null);
      try {
        const r = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoSemana: semana }),
        });
        if (!r.ok) throw new Error();
        ultimaSalva.current = atual;
      } catch {
        setErro("Não consegui guardar a semana. A escolha continua na tela; tente trocar de novo.");
      } finally {
        setSalvando(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [semana, projectId]);

  const creditos = creditosDaSemana(semana);
  const diasComPost = DIAS_DA_SEMANA.filter((d) => semana[String(d.dia) as keyof SemanaDoVideo]).length;

  function ligar(dia: number, ligado: boolean) {
    setSemana((s) => ({ ...s, [String(dia)]: ligado ? "text" : null }));
  }
  function trocar(dia: number, formato: FormatoDoDia) {
    setSemana((s) => ({ ...s, [String(dia)]: formato }));
  }

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      <div className="mb-3">
        <h4 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Como você quer a semana a partir deste vídeo?
        </h4>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sugerido pelo squad. Troque o que quiser.
        </p>
      </div>

      <div className="divide-y rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {/* Segunda: o vídeo, sem escolha. */}
        <div className="grid items-center gap-3 px-3 py-2.5" style={{ gridTemplateColumns: "44px 1fr auto", background: "var(--bg-card)" }}>
          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>Seg</span>
          <div className="flex items-center gap-2 min-w-0">
            <Film className="w-4 h-4 shrink-0 text-orange-400" />
            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>Vídeo completo + cortes</span>
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Vem da gravação. Não dá para trocar.</span>
        </div>

        {DIAS_DA_SEMANA.map(({ dia, curto }) => {
          const formato = semana[String(dia) as keyof SemanaDoVideo] ?? null;
          const ligado = Boolean(formato);
          const info = FORMATOS.find((f) => f.id === formato);
          return (
            <div
              key={dia}
              className="grid items-center gap-3 px-3 py-2"
              style={{ gridTemplateColumns: "44px 1fr auto", background: "var(--bg-card)", opacity: ligado ? 1 : 0.7 }}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded accent-orange-500"
                  checked={ligado}
                  onChange={(e) => ligar(dia, e.target.checked)}
                  aria-label={`Postar na ${curto}`}
                />
                <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{curto}</span>
              </label>
              {ligado ? (
                <select
                  value={formato ?? "text"}
                  onChange={(e) => trocar(dia, e.target.value as FormatoDoDia)}
                  className="text-sm px-2 py-1.5 rounded-lg border outline-none max-w-[260px]"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)", colorScheme: "dark" }}
                  aria-label={`Formato de ${curto}`}
                >
                  {FORMATOS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                      {f.creditos ? ` (${f.creditos} cr)` : ""}
                      {f.id === "free" ? " (o squad decide)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>não postar</span>
              )}
              <span className="text-[11px] text-right" style={{ color: "var(--text-muted)" }}>
                {ligado && info ? info.dica : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <Search className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
        <p>
          O Roberto pesquisa antes de qualquer texto: o que você disse no vídeo, o que estão falando sobre
          isso agora e dados com fonte. Lucas, Tiago e Diana escrevem a partir dessa pesquisa.
        </p>
      </div>

      <p className="mt-2 text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
        {diasComPost === 0
          ? "Só o vídeo de segunda. Nenhum outro dia vai ter post."
          : `${diasComPost} ${diasComPost === 1 ? "dia" : "dias"} além do vídeo, cerca de ${creditos} ${creditos === 1 ? "crédito" : "créditos"} em peças visuais.`}
        {salvando ? (
          <span className="opacity-70">Guardando...</span>
        ) : erro ? (
          <span className="text-orange-300">{erro}</span>
        ) : (
          <span className="inline-flex items-center gap-1 opacity-70">
            <Check className="w-3 h-3" /> Guardado no projeto
          </span>
        )}
      </p>
    </section>
  );
}
