"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeParaNaTela, LinhaDeCusto } from "@/components/kanban/relatorio-do-perfil";
import { ROTULO_DA_ETAPA, type RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";
import type { EstudoNaTela, RedeDeReferencia } from "@/lib/referencias/tipos";
import { MAX_REFERENCIAS_POR_PROJETO, type RespostaDoPerfilProprio } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * A SEGUNDA TELA DA JORNADA DE ENTRADA (03/10/2026): "Agora diga quais são as
 * suas referências, até 3 perfis de sucesso no seu segmento".
 *
 * As referências viram as confirmadas do projeto e o estudo delas sai pelas
 * análises que já existem (lib/referencias/analise.ts, pedido "cliente":
 * estudar, etiquetar, regras e tendências), em segundo plano. Assim que os
 * posts estão lidos, o DE-PARA aparece (lib/referencias/de-para.ts): o que
 * elas fazem que você não faz, com os dois números lado a lado. As regras e
 * as tendências continuam chegando depois, sem segurar a tela.
 */

const OPCOES: Array<{ rede: RedeDeReferencia; nome: string }> = [
  { rede: "instagram", nome: "Instagram" },
  { rede: "tiktok", nome: "TikTok" },
  { rede: "youtube", nome: "YouTube" },
  { rede: "linkedin", nome: "LinkedIn (página)" },
];

type Linha = { rede: RedeDeReferencia; perfil: string };

export function StepReferenciasDoCliente({ projectId }: { projectId: string }) {
  const [dados, setDados] = useState<RespostaDoPerfilProprio | null>(null);
  const [analise, setAnalise] = useState<RespostaDasAnalises | null>(null);
  const [estudo, setEstudo] = useState<EstudoNaTela | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([{ rede: "instagram", perfil: "" }]);
  const [enviando, setEnviando] = useState(false);
  const preencheu = useRef(false);

  const carregar = useCallback(async () => {
    const [p, a, e] = await Promise.all([
      fetch(`/api/projects/${projectId}/perfil-proprio`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/projects/${projectId}/referencias/analises`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/projects/${projectId}/referencias?estudo=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (p) {
      const d = p as RespostaDoPerfilProprio;
      setDados(d);
      if (!preencheu.current && d.referencias.length) {
        preencheu.current = true;
        setLinhas(d.referencias.map((x) => ({ rede: x.rede, perfil: x.rede === "instagram" || x.rede === "tiktok" ? `@${x.perfil}` : x.perfil })));
      }
    }
    if (a) setAnalise(a as RespostaDasAnalises);
    if (e) setEstudo((e.estudo as EstudoNaTela | null) ?? null);
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rodando = analise?.estado?.status === "rodando" && !analise.parado;
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [rodando, carregar]);

  const estudar = async () => {
    const lista = linhas.map((l) => ({ ...l, perfil: l.perfil.trim() })).filter((l) => l.perfil);
    if (!lista.length) {
      toast.error("Escreva pelo menos uma referência: o @ ou o link do perfil.");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/perfil-proprio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "referencias", referencias: lista }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error ?? "Não consegui começar o estudo agora.");
        return;
      }
      await carregar();
    } finally {
      setEnviando(false);
    }
  };

  const etapa = analise?.estado?.etapa;
  const estudando = rodando && (etapa === "estudar" || etapa === "descobrir" || etapa === "confirmar");
  const semPerfil = dados && !dados.relatorio;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <GitCompareArrows className="h-5 w-5 text-pink-500" />
          Agora diga quais são as suas referências
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Até {MAX_REFERENCIAS_POR_PROJETO} perfis de sucesso no seu segmento, de quem você gostaria de ter os resultados. Eu estudo os posts deles e
          mostro, com números, o que eles fazem que você ainda não faz. Molde sim, cópia não: o time aprende a forma, nunca o texto de ninguém.
        </p>
      </div>

      {semPerfil && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Para comparar, eu preciso do seu perfil estudado. Volte uma etapa e estude o seu perfil (pode fazer as duas coisas ao mesmo tempo).
        </p>
      )}

      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold text-[var(--text-muted)] sm:w-6">{i + 1}.</span>
            <select
              value={l.rede}
              onChange={(e) => setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, rede: e.target.value as RedeDeReferencia } : x)))}
              disabled={!dados?.podeEditar || rodando}
              className="h-9 rounded-md border px-2 text-sm sm:w-44"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {OPCOES.map((o) => (
                <option key={o.rede} value={o.rede}>
                  {o.nome}
                </option>
              ))}
            </select>
            <input
              value={l.perfil}
              onChange={(e) => setLinhas((ls) => ls.map((x, k) => (k === i ? { ...x, perfil: e.target.value } : x)))}
              placeholder={l.rede === "linkedin" ? "linkedin.com/company/..." : "@perfil ou o link"}
              disabled={!dados?.podeEditar || rodando}
              className="h-9 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            {linhas.length > 1 && (
              <button type="button" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))} disabled={rodando} className="text-xs text-[var(--text-muted)] hover:text-red-500">
                tirar
              </button>
            )}
          </div>
        ))}
        {linhas.length < MAX_REFERENCIAS_POR_PROJETO && (
          <button
            type="button"
            onClick={() => setLinhas((ls) => [...ls, { rede: "instagram", perfil: "" }])}
            disabled={rodando}
            className="text-sm font-medium text-orange-500 hover:underline"
          >
            + adicionar referência ({linhas.length} de {MAX_REFERENCIAS_POR_PROJETO})
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={estudar} loading={enviando} disabled={!dados?.podeEditar || !dados?.ligado || rodando}>
          <GitCompareArrows className="h-4 w-4" />
          {dados?.dePara ? "Comparar de novo" : "Estudar e comparar comigo"}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">Leva de 2 a 5 minutos. Pode seguir enquanto isso.</span>
      </div>
      {!dados?.dePara && <LinhaDeCusto custo={dados?.estimativas?.referencias} rotulo="Custo deste estudo (com regras e tendências)" />}

      {rodando && analise?.estado && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          <p className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {ROTULO_DA_ETAPA[analise.estado.etapa]}
            {estudando && estudo?.estado === "estudando" && estudo.perfil ? `: ${estudo.perfil} (${estudo.atual} de ${estudo.total})` : ""}
          </p>
          {!estudando && dados?.dePara && <p className="mt-1 text-xs text-[var(--text-muted)]">O de-para já está pronto abaixo; as regras e as tendências continuam chegando.</p>}
        </div>
      )}
      {analise?.estado?.status === "erro" && analise.estado.erro && (
        <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">{analise.estado.erro}</p>
      )}
      {dados?.referencias.some((r) => r.ultimoErro) && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--text-muted)]">
          {dados.referencias
            .filter((r) => r.ultimoErro)
            .map((r) => (
              <li key={r.id}>
                {r.perfil}: {r.ultimoErro}
              </li>
            ))}
        </ul>
      )}

      {dados?.dePara && !estudando && (
        <DeParaNaTela dePara={dados.dePara} relatorio={dados.relatorio} projectId={projectId} podeEditar={dados.podeEditar} analise={analise} aoMudar={carregar} />
      )}
    </div>
  );
}
