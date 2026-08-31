"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Download, Loader2 } from "lucide-react";
import {
  DESTINOS_DE_CORTE,
  DESTINO_COMPLETO,
  cabeNoDestino,
} from "@/lib/media/destinos";

/**
 * A entrega do vídeo: a gravação inteira editada, e os cortes.
 *
 * O desenho segue a regra que o Bruno deu: **o trabalho dele é aprovar ou pedir
 * revisão, nunca montar.** Por isso tudo nasce marcado e com destino escolhido,
 * e a interação é DESmarcar o que não serve. Obrigar a marcar sete caixinhas
 * para conseguir o que ele já pediu ao subir o vídeo seria devolver o trabalho
 * para ele.
 *
 * Pelo mesmo motivo não existe escolha de formato: corte é sempre vertical e o
 * completo é sempre horizontal, decisão de 23/08. Cada destino já sabe o que
 * consome.
 */

export type Corte = {
  titulo?: string;
  ideia?: string;
  inicio: number;
  fim: number;
  publicar?: boolean;
  destinos?: string[];
  texto?: { titulo: string; descricao: string; fraseDaCapa: string };
  midia?: {
    vertical?: { url: string; bytes: number } | null;
    horizontal?: { url: string; bytes: number } | null;
    capa?: { url: string; bytes: number } | null;
    capaArte?: { url: string } | null;
    enquadramento?: { cena: string; vertical: string; motivo: string } | null;
    erro?: string | null;
  } | null;
};

function duracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return m > 0 ? `${m}min ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function megabytes(bytes?: number): string {
  if (!bytes) return "";
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const NOME_DA_CENA: Record<string, string> = {
  pessoa: "Você na câmera",
  tela: "Gravação de tela",
  misto: "Tela e câmera",
};

export function CortesPanel({
  videoId,
  projectId,
  cortes,
  completo,
}: {
  videoId: string;
  projectId: string;
  cortes: Corte[];
  completo: { url: string | null; bytes: number | null; duracaoSec: number | null };
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<number | null>(null);
  const [local, setLocal] = useState<Record<number, { publicar: boolean; destinos: string[] }>>(
    () =>
      Object.fromEntries(
        cortes.map((c, i) => [
          i,
          { publicar: c.publicar ?? false, destinos: c.destinos ?? [] },
        ])
      )
  );

  async function salvar(indice: number, mudanca: { publicar?: boolean; destinos?: string[] }) {
    const atual = local[indice];
    const novo = { ...atual, ...mudanca };
    // Otimista: a caixinha responde na hora. Esperar o servidor para marcar um
    // checkbox faz a tela parecer travada, e o custo de errar aqui é baixo.
    setLocal((l) => ({ ...l, [indice]: novo }));
    setSalvando(indice);
    try {
      await fetch(`/api/videos/${videoId}/destinos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trecho: indice, ...novo }),
      });
    } finally {
      setSalvando(null);
    }
  }

  function alternarDestino(indice: number, destinoId: string) {
    const atuais = local[indice]?.destinos ?? [];
    const novos = atuais.includes(destinoId)
      ? atuais.filter((d) => d !== destinoId)
      : [...atuais, destinoId];
    salvar(indice, { destinos: novos });
  }

  const marcados = Object.values(local).filter((l) => l.publicar).length;

  const [escrevendo, setEscrevendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [etapa, setEtapa] = useState<string>("");

  /**
   * Título, descrição, capa e os textos das redes, num clique só.
   *
   * São duas rotas porque fazem coisas diferentes, mas para quem usa é UMA
   * ação: "manda seguir". Expor dois botões devolveria ao cliente a decisão de
   * em que ordem rodar as etapas do nosso pipeline, que é o oposto da regra de
   * que o trabalho dele é aprovar.
   */
  async function escrever() {
    setEscrevendo(true);
    setErro(null);
    try {
      setEtapa("Escrevendo título, descrição e montando as capas");
      const capas = await fetch(`/api/videos/${videoId}/capas`, { method: "POST" });
      if (!capas.ok) {
        const corpo = await capas.json().catch(() => ({}));
        setErro(corpo.error ?? `A plataforma recusou com código ${capas.status}.`);
        return;
      }

      setEtapa("Escrevendo os textos de cada rede");
      const r = await fetch(`/api/videos/${videoId}/write`, { method: "POST" });
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        setErro(corpo.error ?? `A plataforma recusou com código ${r.status}.`);
        return;
      }

      setEtapa("Montando o cronograma da semana");
      const agenda = await fetch(`/api/videos/${videoId}/agendar`, { method: "POST" });
      if (!agenda.ok) {
        const corpo = await agenda.json().catch(() => ({}));
        setErro(corpo.error ?? `A plataforma recusou com código ${agenda.status}.`);
        return;
      }

      // Vai direto para o quadro. É lá que o cliente revisa, conversa com os
      // agentes e publica, e mandar ele voltar sozinho seria pedir para
      // descobrir que o trabalho terminou em outro lugar.
      router.push(`/projects/${projectId}/live`);
    } catch {
      setErro("A requisição não completou. Recarregue para ver o estado.");
    } finally {
      setEscrevendo(false);
      setEtapa("");
    }
  }

  return (
    <div className="space-y-6">
      {/* A gravação inteira, primeiro: é ela que o cliente subiu, e é o que ele
          quer ver antes de olhar os pedaços. */}
      {completo.url && (
        <section
          className="rounded-xl border p-4 space-y-3"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Sua gravação, editada
              </h3>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                Completa, com as pausas longas removidas e os momentos em
                destaque na tela. {megabytes(completo.bytes ?? undefined)}
              </p>
            </div>
            <Badge variant="secondary">{DESTINO_COMPLETO.rotulo}</Badge>
          </div>

          <video
            src={`/api/videos/${videoId}/midia?tipo=completo`}
            controls
            preload="metadata"
            className="w-full rounded-lg bg-black max-h-96"
          />

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const a = document.createElement("a");
                a.href = `/api/videos/${videoId}/midia?tipo=completo&download=1`;
                a.click();
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Baixar
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {cortes.length} cortes para as redes
          </h3>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {marcados} marcados para publicar
          </p>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Todos já vêm marcados. Desmarque o que não quiser, e ajuste para onde
          cada um vai.
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cortes.map((c, i) => {
            const estado = local[i] ?? { publicar: false, destinos: [] };
            const dur = c.fim - c.inicio;
            const falhou = Boolean(c.midia?.erro) || !c.midia?.vertical;

            return (
              <article
                key={i}
                className="rounded-xl border overflow-hidden flex flex-col"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: estado.publicar ? "var(--accent-orange)" : "var(--border)",
                  opacity: falhou ? 0.6 : 1,
                }}
              >
                {falhou ? (
                  <div className="aspect-[9/16] flex items-center justify-center p-4 text-center text-sm"
                       style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}>
                    Este corte não foi produzido.
                    {c.midia?.erro ? ` ${c.midia.erro}` : ""}
                  </div>
                ) : (
                  <video
                    src={`/api/videos/${videoId}/midia?trecho=${i}&tipo=vertical`}
                    poster={`/api/videos/${videoId}/midia?trecho=${i}&tipo=${c.midia?.capaArte ? "capa-arte" : "capa"}`}
                    controls
                    preload="none"
                    // `contain`, e não `cover`: a capa-arte é paisagem (1376x768,
                    // pensada para o YouTube) e o `cover` num quadro 9:16 cortava
                    // dois terços dela, que foi a "capa cortada" que o Bruno viu
                    // em 31/08. O vídeo em si é 9:16 exato, então para ele os
                    // dois se comportam igual. Capa vertical própria virou card.
                    className="w-full aspect-[9/16] object-contain bg-black"
                  />
                )}

                <div className="p-3 space-y-2.5 flex-1 flex flex-col">
                  <div>
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                      {c.texto?.titulo ?? c.titulo ?? `Corte ${i + 1}`}
                    </p>
                    {c.texto?.descricao && (
                      <p className="text-xs mt-1 line-clamp-3" style={{ color: "var(--text-muted)" }}>
                        {c.texto.descricao}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {duracao(dur)}
                      {c.midia?.enquadramento
                        ? `, ${NOME_DA_CENA[c.midia.enquadramento.cena] ?? c.midia.enquadramento.cena}`
                        : ""}
                      {c.midia?.vertical ? `, ${megabytes(c.midia.vertical.bytes)}` : ""}
                    </p>
                  </div>

                  {!falhou && (
                    <>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={estado.publicar}
                          onChange={(e) => salvar(i, { publicar: e.target.checked })}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span style={{ color: "var(--text-primary)" }}>Publicar este corte</span>
                        {salvando === i && (
                          <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--text-muted)" }} />
                        )}
                      </label>

                      <div className="flex flex-wrap gap-1.5 mt-auto">
                        {DESTINOS_DE_CORTE.map((d) => {
                          const marcado = estado.destinos.includes(d.id);
                          const cabe = cabeNoDestino(dur, d);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              disabled={!cabe || !estado.publicar || !d.publicaVideo}
                              onClick={() => alternarDestino(i, d.id)}
                              title={
                                !d.publicaVideo
                                  ? `Publicar vídeo no ${d.rotulo} ainda não existe na plataforma. Está no caminho.`
                                  : cabe
                                    ? d.rotulo
                                    : `Este corte tem ${duracao(dur)} e o ${d.rotulo} aceita até ${duracao(d.limiteSegundos!)}`
                              }
                              className="text-xs px-2 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{
                                borderColor: marcado ? "var(--accent-orange)" : "var(--border)",
                                background: marcado ? "var(--accent-orange)" : "transparent",
                                color: marcado ? "#fff" : "var(--text-muted)",
                              }}
                            >
                              {marcado && <Check className="w-3 h-3 inline mr-0.5" />}
                              {d.rotulo}
                              {!d.publicaVideo && " (em breve)"}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {erro && <p className="text-sm text-orange-400">{erro}</p>}
        <Button disabled={marcados === 0 || escrevendo} onClick={escrever}>
          {escrevendo ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              {etapa || "Trabalhando"}
            </>
          ) : (
            `Preparar os ${marcados} cortes e levar para o quadro`
          )}
        </Button>
      </div>
    </div>
  );
}
