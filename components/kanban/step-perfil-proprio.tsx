"use client";

import { useCallback, useEffect, useState } from "react";
import { AvisoDescartavel } from "@/components/ui/descartar";
import { chaveDaDica, chaveDoEstudo, marca } from "@/lib/avisos/chaves";
import toast from "react-hot-toast";
import { Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinhaDeCusto, RelatorioDoPerfilNaTela } from "@/components/kanban/relatorio-do-perfil";
import { SecaoDeLinksNoSetup } from "@/components/projects/links-no-setup";
import { CamposDasRedes, EstadoDasRedes, useRedesDoCliente } from "@/components/projects/redes-do-cliente";
import { REDES_DO_CLIENTE } from "@/lib/referencias/tipos-do-perfil-proprio";
import type { RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";
import { ROTULO_DA_ETAPA_DO_PERFIL, type EtapaDoPerfilProprio, type RespostaDoPerfilProprio } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * A PRIMEIRA TELA DA JORNADA DE ENTRADA (03/10/2026): "Coloque aqui as suas
 * redes". A pessoa escreve o @ ou o link, a plataforma lê os posts dela e
 * devolve o relatório em gráficos (lib/referencias/perfil-proprio.ts).
 *
 * O estudo roda no servidor e leva de 1 a 3 minutos; a tela consulta o estado
 * a cada 4 s e diz em que passo está, nunca um botão girando calado (lição do
 * "Estudar agora" de 01/10). Não trava: dá para seguir e voltar depois.
 */

/*
 * As redes (06/10, fonte única): os campos são os mesmos de Configurações,
 * Seus links (components/projects/redes-do-cliente.tsx), e gravam sozinhos no
 * endereço que as descrições usam. O estudo lê só as redes que ele sabe ler
 * (REDES_DO_CLIENTE); o Facebook fica salvo para as descrições.
 */

const ETAPAS: EtapaDoPerfilProprio[] = ["coletando", "etiquetando", "lendo"];

export function StepPerfilProprio({ projectId }: { projectId: string }) {
  const [dados, setDados] = useState<RespostaDoPerfilProprio | null>(null);
  const [enviando, setEnviando] = useState(false);
  // As regras do projeto, para o "o que fazer" do relatório saber o que já virou regra.
  const [analise, setAnalise] = useState<RespostaDasAnalises | null>(null);

  const carregarRegras = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/referencias/analises`).catch(() => null);
    if (r?.ok) setAnalise((await r.json()) as RespostaDasAnalises);
  }, [projectId]);

  useEffect(() => {
    void carregarRegras();
  }, [carregarRegras]);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/perfil-proprio`).catch(() => null);
    if (!r?.ok) return null;
    const d = (await r.json()) as RespostaDoPerfilProprio;
    setDados(d);
    return d;
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rodando = dados?.estado?.status === "rodando" && !dados.parado;
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [rodando, carregar]);

  const redesNaTela = useRedesDoCliente(projectId, dados?.podeEditar ?? false);

  const estudar = async () => {
    const redes = REDES_DO_CLIENTE.map((rede) => ({ rede, perfil: (redesNaTela.valores[rede as keyof typeof redesNaTela.valores] ?? "").trim() })).filter((r) => r.perfil);
    if (!redes.length) {
      toast.error("Escreva pelo menos uma rede: o @ ou o link do seu perfil.");
      return;
    }
    setEnviando(true);
    try {
      // O que está nos campos fica salvo antes de o estudo começar.
      await redesNaTela.gravarAgora();
      const r = await fetch(`/api/projects/${projectId}/perfil-proprio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "estudar", redes }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error ?? "Não consegui começar o estudo agora.");
        return;
      }
      for (const a of (d.avisos ?? []) as string[]) toast(a, { duration: 7000 });
      await carregar();
    } finally {
      setEnviando(false);
    }
  };

  const estado = dados?.estado;
  const etapaAtual = estado?.etapa ?? "coletando";
  const segundos = estado ? Math.max(0, Math.round((Date.now() - new Date(estado.pedidoEm).getTime()) / 1000)) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <ScanSearch className="h-5 w-5 text-pink-500" />
          Coloque aqui as suas redes
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Escreva o @ ou o link. Eu leio os seus posts e devolvo um relatório: o que você posta, o que rende mais, o seu post de maior engajamento, as
          suas cores, o seu jeito de falar e o que eu entendi do seu negócio. É com isso que eu treino o seu time.
        </p>
      </div>

      {dados && !dados.ligado && (
        <AvisoDescartavel chave={chaveDaDica("estudo-desligado", projectId)} className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          A leitura de perfis está desligada nesta conta. Pode seguir e preencher o setup à mão.
        </AvisoDescartavel>
      )}

      <div className="space-y-1.5">
        <CamposDasRedes redes={redesNaTela} desabilitado={!dados?.podeEditar || rodando} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-[var(--text-muted)]">
            Fica salvo sozinho e entra nas descrições dos posts. Para mudar depois: Configurações, Seus links.
          </p>
          <EstadoDasRedes estado={redesNaTela.estado} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={estudar} loading={enviando} disabled={!dados?.podeEditar || !dados?.ligado || rodando}>
          <ScanSearch className="h-4 w-4" />
          {dados?.relatorio ? "Estudar de novo" : "Estudar o meu perfil"}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">Leva de 1 a 3 minutos. Pode seguir para a próxima etapa enquanto isso.</span>
      </div>
      {!dados?.relatorio && <LinhaDeCusto custo={dados?.estimativas?.perfil} rotulo="Custo deste estudo" />}

      {/* Além das redes, os links do cliente, um de cada vez (06/10). */}
      <SecaoDeLinksNoSetup projetoId={projectId} podeEditar={dados?.podeEditar ?? true} />

      {rodando && estado && (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <ol className="space-y-1.5">
            {ETAPAS.map((e) => {
              const i = ETAPAS.indexOf(e);
              const atual = ETAPAS.indexOf(etapaAtual);
              return (
                <li key={e} className="flex items-center gap-2 text-sm" style={{ color: i <= atual ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {i < atual ? (
                    <span className="inline-block h-4 w-4 text-center text-xs text-green-500">✓</span>
                  ) : i === atual ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="inline-block h-4 w-4 rounded-full border" style={{ borderColor: "var(--border)" }} />
                  )}
                  {ROTULO_DA_ETAPA_DO_PERFIL[e]}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">{segundos} s desde o pedido.</p>
        </div>
      )}

      {/* Parado e erro se descartam (07/10); o "Estudar de novo" fica logo acima. */}
      {dados?.parado && (
        <AvisoDescartavel chave={chaveDoEstudo(projectId, estado?.pedidoEm ?? "perfil", "parado")} className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          O estudo parou no meio (passou do tempo máximo). O que já foi lido ficou guardado: clique em Estudar de novo.
        </AvisoDescartavel>
      )}
      {estado?.status === "erro" && estado.erro && (
        <AvisoDescartavel chave={chaveDoEstudo(projectId, estado.pedidoEm ?? marca(estado.erro), "erro")} className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          <p>{estado.erro}</p>
          {estado.avisos.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {estado.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </AvisoDescartavel>
      )}

      {dados?.relatorio && !rodando && (
        <RelatorioDoPerfilNaTela relatorio={dados.relatorio} projectId={projectId} podeEditar={dados.podeEditar} analise={analise} aoMudar={carregarRegras} />
      )}
    </div>
  );
}
