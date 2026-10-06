"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ExternalLink, GitCompareArrows, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeParaNaTela, LinhaDeCusto } from "@/components/kanban/relatorio-do-perfil";
import { ROTULO_DA_ETAPA, type RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";
import type { EstudoNaTela, RedeDeReferencia } from "@/lib/referencias/tipos";
import { conferirReferencia, type RespostaDoPerfilProprio } from "@/lib/referencias/tipos-do-perfil-proprio";

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
 *
 * MUDAR AS REFERÊNCIAS DEPOIS (05/10, pedido do Bruno: "depois de adicionar
 * não achei como mudar"). Com referências já gravadas, a etapa vira a lista
 * delas, cada uma com "Remover" (confirmação dentro da página), e um campo
 * para adicionar outra até o teto do projeto. Trocar é remover uma e
 * adicionar a outra. Cada mudança grava na hora SEM estudar (acao
 * "salvar-referencias"); o estudo novo só sai quando a pessoa clica em
 * "Refazer o estudo", com o custo escrito ao lado do botão.
 *
 * O LIMITE VEM DO PLANO (06/10): Starter 3, Pro 6, Enterprise 10, mandado
 * pelo servidor em `dados.limite`; esta tela nunca escreve o número. Projeto
 * de antes da regra com mais referências do que o plano inclui mostra todas,
 * diz quantas o plano inclui e quais ficam fora do estudo (o estudo lê as mais
 * recentes, até o limite). Remover sempre funciona.
 *
 * A removida volta a "sugerido", como já fazia a troca da lista: os posts
 * lidos dela ficam guardados até a retenção de 90 dias apagar, e o de-para e
 * os achados, que leem só as confirmadas, deixam de contar com ela na hora.
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
  // A gestão das referências já gravadas (05/10).
  const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novaRede, setNovaRede] = useState<RedeDeReferencia>("instagram");
  const [novoPerfil, setNovoPerfil] = useState("");
  const [erroDaNova, setErroDaNova] = useState<string | null>(null);
  // Mudou a lista nesta visita: o estudo guardado é das referências antigas.
  const [mudou, setMudou] = useState(false);

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

  // `base`: a lista gravada, quando o estudo é refeito pela gestão das referências.
  const estudar = async (base?: Linha[]) => {
    const lista = (base ?? linhas).map((l) => ({ ...l, perfil: l.perfil.trim() })).filter((l) => l.perfil);
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
      setMudou(false);
      await carregar();
    } finally {
      setEnviando(false);
    }
  };

  /** Grava a lista nova sem estudar (remover, trocar, adicionar). */
  const salvarLista = async (lista: Linha[]): Promise<boolean> => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/perfil-proprio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar-referencias", referencias: lista }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error ?? "Não consegui mudar as referências agora.");
        return false;
      }
      setMudou(true);
      // O formulário da primeira vez acompanha a lista gravada (se a lista esvaziar, ele volta).
      setLinhas(lista.length ? lista.map((x) => ({ ...x, perfil: x.rede === "instagram" || x.rede === "tiktok" ? `@${x.perfil}` : x.perfil })) : [{ rede: "instagram", perfil: "" }]);
      await carregar();
      return true;
    } finally {
      setSalvando(false);
    }
  };

  const salvas: Linha[] = (dados?.referencias ?? []).map((x) => ({ rede: x.rede, perfil: x.perfil }));
  // O limite do plano, que o servidor manda pronto (06/10). Null até carregar.
  const teto = dados?.limite.porProjeto ?? null;
  const acimaDoPlano = teto !== null && salvas.length > teto;

  const remover = async (id: string) => {
    const ok = await salvarLista((dados?.referencias ?? []).filter((x) => x.id !== id).map((x) => ({ rede: x.rede, perfil: x.perfil })));
    if (ok) {
      setConfirmandoRemocao(null);
      toast.success("Referência removida.");
    }
  };

  const adicionar = async () => {
    const c = conferirReferencia(novaRede, novoPerfil);
    if (!c.ok) {
      setErroDaNova(c.erro);
      return;
    }
    if (salvas.some((x) => x.rede === novaRede && x.perfil === c.perfil)) {
      setErroDaNova("Essa referência já está na lista.");
      return;
    }
    if (teto !== null && salvas.length >= teto) {
      setErroDaNova(`O seu plano inclui ${teto} referências por projeto. Remova uma para colocar esta no lugar.`);
      return;
    }
    setErroDaNova(null);
    const ok = await salvarLista([...salvas, { rede: novaRede, perfil: c.perfil }]);
    if (ok) {
      setNovoPerfil("");
      toast.success("Referência adicionada.");
    }
  };

  const etapa = analise?.estado?.etapa;
  const estudando = rodando && (etapa === "estudar" || etapa === "descobrir" || etapa === "confirmar");
  const semPerfil = dados && !dados.relatorio;
  const temSalvas = Boolean(dados?.referencias.length);
  const podeMexer = Boolean(dados?.podeEditar) && !rodando && !salvando;
  // Referência nova que nunca foi estudada, ou lista mudada nesta visita: o estudo guardado é das antigas.
  const precisaRefazer = temSalvas && !rodando && (mudou || (dados?.referencias ?? []).some((x) => !x.ultimaColeta && !x.ultimoErro));
  const rotuloDo = (rede: RedeDeReferencia) => (rede === "linkedin" ? "LinkedIn" : (OPCOES.find((o) => o.rede === rede)?.nome ?? rede));
  const nomeNaTela = (rede: RedeDeReferencia, perfil: string) => (rede === "instagram" || rede === "tiktok" ? `@${perfil}` : perfil);
  // O mesmo endereço de urlDoPerfil (lib/referencias/coletar.ts), que é de servidor.
  const urlNaTela = (rede: RedeDeReferencia, perfil: string): string | null => {
    if (rede === "instagram") return `https://www.instagram.com/${perfil}/`;
    if (rede === "tiktok") return `https://www.tiktok.com/@${perfil}`;
    if (rede === "youtube") return perfil.startsWith("UC") ? `https://www.youtube.com/channel/${perfil}` : `https://www.youtube.com/${perfil}`;
    return perfil.startsWith("http") ? perfil : null;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <GitCompareArrows className="h-5 w-5 text-pink-500" />
          Agora diga quais são as suas referências
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          {teto !== null ? `Até ${teto} perfis` : "Perfis"} de sucesso no seu segmento, de quem você gostaria de ter os resultados. Eu estudo os posts deles e
          mostro, com números, o que eles fazem que você ainda não faz. Molde sim, cópia não: o time aprende a forma, nunca o texto de ninguém.
        </p>
      </div>

      {semPerfil && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Para comparar, eu preciso do seu perfil estudado. Volte uma etapa e estude o seu perfil (pode fazer as duas coisas ao mesmo tempo).
        </p>
      )}

      {/* AS REFERÊNCIAS JÁ GRAVADAS (05/10): remover, adicionar e refazer o estudo. */}
      {temSalvas && dados && (
        <div className="space-y-3 rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {acimaDoPlano
                ? `${dados.referencias.length} referências (seu plano inclui ${teto})`
                : `Suas referências (${dados.referencias.length} de ${teto})`}
            </p>
            {dados.podeEditar && <p className="text-xs text-[var(--text-muted)]">Para trocar, remova uma e adicione a outra.</p>}
          </div>

          {acimaDoPlano && (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              Este projeto é de antes do limite do plano. As que passam de {teto} continuam aqui até você remover, e remover sempre funciona. O estudo
              lê só as {dados.limite.estudadas} mais recentes.
            </p>
          )}

          <ul className="space-y-2">
            {dados.referencias.map((x) => {
              const url = urlNaTela(x.rede, x.perfil);
              const confirmando = confirmandoRemocao === x.id;
              return (
                <li
                  key={x.id}
                  className="rounded-lg border p-2.5"
                  style={{ borderColor: confirmando ? "rgb(239 68 68 / 0.5)" : "var(--border)", background: "var(--bg-primary)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-semibold text-pink-600 dark:text-pink-400">{rotuloDo(x.rede)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
                        <span className="truncate">{nomeNaTela(x.rede, x.perfil)}</span>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-orange-500" aria-label="Abrir o perfil">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">
                        {acimaDoPlano && !x.noEstudo
                          ? "Fora do estudo, passa do seu plano"
                          : x.ultimoErro
                          ? `Última leitura: ${x.ultimoErro}`
                          : x.ultimaColeta
                            ? `Estudada em ${new Date(x.ultimaColeta).toLocaleDateString("pt-BR")}`
                            : "Ainda não estudada"}
                      </p>
                    </div>
                    {dados.podeEditar && !confirmando && (
                      <button
                        type="button"
                        onClick={() => setConfirmandoRemocao(x.id)}
                        disabled={!podeMexer}
                        className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    )}
                  </div>
                  {confirmando && (
                    <div className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-700 dark:text-red-400">
                      <p>
                        Remover {nomeNaTela(x.rede, x.perfil)} das suas referências? Ela sai do comparativo na hora. As regras que você já aprovou
                        continuam valendo, e os posts que eu li dela são apagados sozinhos em até 90 dias.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="destructive" loading={salvando} disabled={salvando} onClick={() => void remover(x.id)}>
                          Sim, remover
                        </Button>
                        <Button size="sm" variant="ghost" disabled={salvando} onClick={() => setConfirmandoRemocao(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {dados.podeEditar &&
            (teto !== null && dados.referencias.length < teto ? (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void adicionar();
                }}
              >
                <p className="text-xs font-semibold text-[var(--text-muted)]">Adicionar referência</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={novaRede}
                    onChange={(e) => {
                      setNovaRede(e.target.value as RedeDeReferencia);
                      setErroDaNova(null);
                    }}
                    disabled={!podeMexer}
                    className="h-10 rounded-md border px-2 text-sm sm:w-44"
                    style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    {OPCOES.map((o) => (
                      <option key={o.rede} value={o.rede}>
                        {o.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    value={novoPerfil}
                    onChange={(e) => {
                      setNovoPerfil(e.target.value);
                      setErroDaNova(null);
                    }}
                    placeholder={novaRede === "linkedin" ? "linkedin.com/company/..." : "@perfil ou o link do perfil"}
                    disabled={!podeMexer}
                    aria-invalid={Boolean(erroDaNova)}
                    className="h-10 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none focus:border-orange-500"
                    style={{ background: "var(--bg-input)", borderColor: erroDaNova ? "rgb(239 68 68)" : "var(--border)", color: "var(--text-primary)" }}
                  />
                  <Button type="submit" variant="outline" loading={salvando} disabled={!podeMexer || !novoPerfil.trim()}>
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
                {erroDaNova && <p className="text-xs text-red-600 dark:text-red-400">{erroDaNova}</p>}
              </form>
            ) : acimaDoPlano ? null : (
              <p className="text-xs text-[var(--text-muted)]">
                Chegou às {teto} referências que o seu plano inclui. Para trocar, remova uma e o campo de adicionar aparece.
              </p>
            ))}
          {rodando && dados.podeEditar && <p className="text-xs text-[var(--text-muted)]">Há um estudo rodando. Dá para mudar a lista assim que ele terminar.</p>}

          {/* Refazer o estudo: nunca sozinho, sempre com o custo escrito antes do clique. */}
          {!rodando && dados.podeEditar && (
            <div
              className={precisaRefazer ? "space-y-2 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3" : "space-y-2 rounded-lg border p-3"}
              style={precisaRefazer ? undefined : { borderColor: "var(--border)" }}
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {precisaRefazer ? "Refazer o estudo com as referências novas?" : "Estudar as mesmas referências de novo?"}
              </p>
              {precisaRefazer && (
                <p className="text-xs text-[var(--text-muted)]">
                  O comparativo já conta só com as referências da lista. Os moldes e as regras sugeridas ainda vêm do estudo anterior até você refazer.
                </p>
              )}
              <p className="text-xs text-[var(--text-primary)]">
                Custo: <b>0 créditos</b>. O estudo das referências faz parte do seu plano. Leva de 2 a 5 minutos e você pode seguir enquanto isso.
              </p>
              <LinhaDeCusto custo={dados.estimativas?.referencias} rotulo="Custo deste estudo (com regras e tendências)" />
              <Button onClick={() => void estudar(salvas)} loading={enviando} disabled={!dados.ligado || enviando || salvando}>
                <RefreshCw className="h-4 w-4" />
                Refazer o estudo
              </Button>
              {!dados.ligado && <p className="text-xs text-amber-700 dark:text-amber-400">O estudo de referências está desligado nesta conta agora.</p>}
            </div>
          )}
        </div>
      )}

      {!temSalvas && (
        <>
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
        {teto !== null && linhas.length < teto && (
          <button
            type="button"
            onClick={() => setLinhas((ls) => [...ls, { rede: "instagram", perfil: "" }])}
            disabled={rodando}
            className="text-sm font-medium text-orange-500 hover:underline"
          >
            + adicionar referência ({linhas.length} de {teto})
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void estudar()} loading={enviando} disabled={!dados?.podeEditar || !dados?.ligado || rodando}>
          <GitCompareArrows className="h-4 w-4" />
          {dados?.dePara ? "Comparar de novo" : "Estudar e comparar comigo"}
        </Button>
        <span className="text-xs text-[var(--text-muted)]">Leva de 2 a 5 minutos. Pode seguir enquanto isso.</span>
      </div>
      {!dados?.dePara && <LinhaDeCusto custo={dados?.estimativas?.referencias} rotulo="Custo deste estudo (com regras e tendências)" />}
        </>
      )}

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
