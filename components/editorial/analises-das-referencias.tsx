"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Lightbulb, Loader2, Music, Plus, RotateCw, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Exemplo, PainelExecutivoDasReferencias } from "@/components/editorial/graficos-das-referencias";
import { ListaDeRegras } from "@/components/editorial/regras-do-projeto";
import {
  Bloco,
  BarrasDeRende,
  BarrasPorPerfil,
  CartaoDoPost,
  Detalhes,
  MixDeFormatos,
  mostrarNaLinhaEditorial,
  NumerosDoTopo,
  OQueFazer,
  VoceContraReferencias,
} from "@/components/editorial/painel-do-estudo";
import { barrasQueMaisRendem, numeroCurto, numerosDoTopo, porcentoCurto, recomendacoes } from "@/lib/referencias/painel-executivo";
import { ROTULO_DA_ETAPA, type Achado, type RespostaDasAnalises, type Tendencia } from "@/lib/referencias/tipos-das-analises";
import type { RespostaDoPerfilProprio } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * AS ANÁLISES DAS REFERÊNCIAS NA TELA (02/10/2026): achados com número e
 * fonte, regras propostas pelo Roberto para o cliente aprovar e tendências da
 * semana que viram ideia.
 *
 * Mora em dois lugares: dentro do painel "Perfis de referência do seu nicho"
 * (linha editorial) e no passo "Referências" da criação do projeto
 * (components/kanban/step-referencias.tsx). Tudo vem de
 * /api/projects/[id]/referencias/analises; o trabalho pesado roda no
 * servidor e a tela só acompanha (consulta a cada 5 s enquanto roda).
 *
 * Só o dono decide regra e pede análise; quem é da equipe vê em leitura.
 *
 * PAINEL EXECUTIVO (03/10, pedido do Bruno: "muita informação misturada e
 * confusa, precisa ser gráfico e executivo"): três andares
 * (components/editorial/painel-do-estudo.tsx). Os números grandes do topo; os
 * gráficos (você contra as referências e o mix de formatos quando o perfil do
 * próprio cliente foi estudado na jornada de entrada, o ritmo de cada perfil,
 * o que rende mais, o post de maior alcance com a miniatura); o que fazer, com
 * no máximo 3 ações e o botão. Regras, tendências, os 7 gráficos completos e
 * os achados ficam em "ver detalhes", com a mesma funcionalidade de antes.
 */

const CONSULTA_MS = 5000;

function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

function SeloDaForca({ a }: { a: Pick<Achado, "forca" | "tipo"> }) {
  if (a.tipo === "destaque") return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">Post real</span>;
  return a.forca === "forte" ? (
    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Forte</span>
  ) : (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Indício</span>
  );
}

function amostraDoAchado(a: Pick<Achado, "amostra" | "forca" | "tipo">): string {
  if (a.tipo === "destaque") return "";
  const base = `${a.amostra.posts} ${a.amostra.posts === 1 ? "post" : "posts"} de ${a.amostra.perfis} ${a.amostra.perfis === 1 ? "perfil" : "perfis"}`;
  return a.forca === "forte" ? `Amostra: ${base}.` : `Amostra pequena: ${base}. Leia como pista, não como lei.`;
}

function CartaoDoAchado({ a }: { a: Achado }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {a.frase}
        </p>
        <SeloDaForca a={a} />
      </div>
      {amostraDoAchado(a) && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {amostraDoAchado(a)}
        </p>
      )}
      {a.exemplos.length > 0 && <ul className="mt-2 space-y-0.5">{a.exemplos.map((e, i) => <Exemplo key={i} e={e} />)}</ul>}
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px]" style={{ color: "var(--text-muted)" }}>
          Como contamos
        </summary>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {a.comoMedimos}
        </p>
      </details>
    </div>
  );
}

/** Mora no painel do estudo (03/10); reexportada aqui para quem já importava daqui. */
export { mostrarNaLinhaEditorial };

function CartaoDaTendencia({ t, projectId, aoLevar }: { t: Tendencia; projectId: string; aoLevar?: (id: string) => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const s = t.sugestao;
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {t.audio ? <Music className="mr-1 inline h-3.5 w-3.5 text-violet-500" /> : <TrendingUp className="mr-1 inline h-3.5 w-3.5 text-violet-500" />}
          {t.nome}
        </p>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">{t.tipo}</span>
      </div>
      {t.oQueE && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {t.oQueE}
        </p>
      )}
      <p className="mt-1.5 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Evidência: {t.evidencia.frase}.
      </p>
      {t.provas.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {t.provas.map((p, i) => (
            <li key={i} className="text-xs">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-orange-500 hover:underline">
                  {p.tipo === "video" ? `${p.autor ? `@${p.autor.replace(/^@/, "")}` : "vídeo"}${p.visualizacoes ? ` (${numero(p.visualizacoes)})` : ""}` : (p.titulo ?? "página").slice(0, 40)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>{p.titulo ?? p.autor}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <b>{t.combina ? "Por que combina com você:" : "Por que ficou de fora:"}</b> {t.motivo}
      </p>
      {s && (
        <div className="mt-2 rounded-lg p-2.5" style={{ background: "var(--bg-elevated)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
            <Lightbulb className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
            Ideia: {s.tema} <span className="font-normal" style={{ color: "var(--text-muted)" }}>({s.formato}{s.redes.length ? `, ${s.redes.join(", ")}` : ""})</span>
          </p>
          <ol className="mt-1.5 space-y-1">
            {s.cenas.map((c) => (
              <li key={c.id} className="text-xs" style={{ color: "var(--text-primary)" }}>
                <span className="font-semibold capitalize">{c.papel}:</span> &ldquo;{c.fala}&rdquo;
                {c.naTela && <span style={{ color: "var(--text-muted)" }}> Na tela: {c.naTela}</span>}
              </li>
            ))}
          </ol>
          {s.comoUsarOAudio && (
            <p className="mt-2 rounded-md bg-violet-500/10 p-2 text-xs text-violet-800 dark:text-violet-200">
              <Music className="mr-1 inline h-3 w-3" />
              {s.comoUsarOAudio}
            </p>
          )}
          {s.cuidado && (
            <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              Cuidado: {s.cuidado}
            </p>
          )}
          {aoLevar && t.roteiroId && (
            <a
              href={`/projects/${projectId}/linha-editorial#roteiro-${t.roteiroId}`}
              onClick={(e) => {
                if (mostrarNaLinhaEditorial(t.roteiroId!)) e.preventDefault();
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Ver na linha editorial
            </a>
          )}
          {aoLevar && !t.roteiroId && (
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  await aoLevar(t.id);
                } finally {
                  setOcupado(false);
                }
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Levar para a linha editorial
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AnalisesDasReferencias({ projectId, modo = "painel" }: { projectId: string; modo?: "painel" | "criacao" }) {
  const [d, setD] = useState<RespostaDasAnalises | null>(null);
  // O perfil do próprio cliente e o de-para (jornada de entrada), quando existem.
  const [proprio, setProprio] = useState<RespostaDoPerfilProprio | null>(null);
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [pedindo, setPedindo] = useState<null | string>(null);

  const carregar = useCallback(async () => {
    const [r, p] = await Promise.all([
      fetch(`/api/projects/${projectId}/referencias/analises`).catch(() => null),
      fetch(`/api/projects/${projectId}/perfil-proprio`).catch(() => null),
    ]);
    if (p?.ok) setProprio((await p.json().catch(() => null)) as RespostaDoPerfilProprio | null);
    if (!r?.ok) return;
    setD((await r.json()) as RespostaDasAnalises);
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rodando = d?.estado?.status === "rodando" && !d.parado;
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void carregar(), CONSULTA_MS);
    return () => clearInterval(t);
  }, [rodando, carregar]);

  async function pedir(acao: "comecar" | "continuar", tipo?: "criacao" | "analisar" | "tendencias") {
    setPedindo(tipo ?? acao);
    try {
      const r = await fetch(`/api/projects/${projectId}/referencias/analises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, tipo, origem: modo }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Não consegui pedir agora.");
    } finally {
      setPedindo(null);
    }
  }

  async function levar(id: string) {
    const r = await fetch(`/api/projects/${projectId}/referencias/tendencias/${id}`, { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; roteiroId?: string };
    if (!r.ok) {
      toast.error(j.error ?? "Não consegui levar agora.");
      return;
    }
    await carregar();
    // Até 02/10 a lista de baixo não recarregava e o Bruno não achou as ideias
    // levadas: agora ela recarrega, rola até o roteiro novo e o destaca.
    if (j.roteiroId && mostrarNaLinhaEditorial(j.roteiroId)) toast.success("Roteiro criado: está destacado na linha editorial, logo abaixo.");
    else toast.success("Roteiro criado na linha editorial, pronto para você ajustar e gravar.");
  }

  if (!d) {
    return modo === "criacao" ? (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    ) : null;
  }

  const estado = d.estado;
  const regrasAbertas = d.regras.filter((r) => r.status !== "recusada");
  const aprovadas = d.regras.filter((r) => r.status === "aprovada").length;
  const propostas = d.regras.filter((r) => r.status === "proposta").length;
  const tendencias = d.tendencias?.itens ?? [];
  const combinam = tendencias.filter((t) => t.combina);
  const descartadas = tendencias.filter((t) => !t.combina);
  const etapaAtual = estado ? estado.etapas.indexOf(estado.etapa) + 1 : 0;
  const temEstudo = d.achados.length > 0 || d.painel.graficos.length > 0;

  // O painel executivo: com o de-para quando o perfil do cliente foi estudado.
  const dePara = proprio?.dePara ?? null;
  const relatorio = proprio?.relatorio ?? null;
  const numeros = numerosDoTopo({ dePara, painel: d.painel, relatorio: dePara ? relatorio : null });
  const principais = dePara ? dePara.linhas.filter((l) => l.chave !== "engajamento" && l.chave !== "frequencia").slice(0, 4) : [];
  const rende = barrasQueMaisRendem(d.painel.graficos, { max: 6 });
  const destaque = d.achados.find((a) => a.tipo === "destaque" && a.exemplos[0]);
  const itens = recomendacoes({ dePara, painel: d.painel, regras: d.regras, tendencias });
  const vezesDoSeu = new Map((relatorio?.formatos ?? []).map((f) => [f.chave, f.vezes]));
  const mixSeu = dePara?.mix?.voce.map((f) => ({ ...f, vezes: vezesDoSeu.get(f.chave) ?? null })) ?? [];
  const todos = dePara ? [dePara.voce, ...dePara.referencias] : [];
  const perfil = (r: (typeof todos)[number], i: number) => ({ rotulo: i === 0 ? "Você" : r.rotulo.replace(/^(Instagram|TikTok|YouTube|LinkedIn) /, ""), voce: i === 0, url: r.url });

  return (
    <div className="space-y-4">
      {/* O trabalho em segundo plano: em que etapa está, ou por que parou. */}
      {estado && rodando && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            {ROTULO_DA_ETAPA[estado.etapa]}
            {estado.etapas.length > 1 && etapaAtual > 0 ? ` (etapa ${etapaAtual} de ${estado.etapas.length})` : ""}...
            {modo === "criacao" ? " Pode seguir para a próxima etapa: isto continua sozinho." : ""}
          </span>
        </div>
      )}
      {estado && (d.parado || estado.status === "erro") && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {estado.erro ?? `A análise parou no meio, na etapa "${ROTULO_DA_ETAPA[estado.etapa]}". O que já foi feito ficou guardado.`}
          </span>
          {d.podeEditar && (
            <button type="button" disabled={pedindo !== null} onClick={() => void pedir("continuar")} className="inline-flex items-center gap-1 rounded-lg border border-amber-500/50 px-3 py-1.5 text-xs font-semibold">
              <RotateCw className="h-3.5 w-3.5" /> Continuar de onde parou
            </button>
          )}
        </div>
      )}

      {!temEstudo ? (
        <p className="rounded-lg border border-dashed p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {d.amostra.posts
            ? "Ainda não há diferença clara entre os posts estudados. Com mais perfis ou um novo estudo, os achados aparecem aqui."
            : rodando
              ? "Os achados aparecem aqui assim que o estudo terminar."
              : "Confirme perfis de referência e estude os posts para ver aqui o que funciona no seu nicho."}
        </p>
      ) : (
        <>
          {/* ANDAR 1: os números grandes */}
          <NumerosDoTopo numeros={numeros} />

          {/* ANDAR 2: os gráficos */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {principais.length > 0 && (
              <Bloco titulo="Você contra as referências" pergunta="As medidas de maior diferença, na mesma escala dos dois lados">
                <VoceContraReferencias linhas={principais} />
              </Bloco>
            )}
            {rende.length > 0 && (
              <Bloco titulo="O que rende mais nas referências" pergunta={`Cada tipo de post contra o normal do próprio perfil (${d.amostra.comGanho} posts de ${d.amostra.perfis} perfis)`}>
                <BarrasDeRende barras={rende} />
              </Bloco>
            )}
            {mixSeu.length > 0 && (
              <Bloco titulo="Mix de formatos" pergunta="Quanto de cada formato, você e as referências">
                <MixDeFormatos voce={mixSeu} referencias={dePara?.mix?.referencias} />
              </Bloco>
            )}
            {todos.length > 0 && (
              <Bloco titulo="Ritmo e engajamento por perfil" pergunta="Quantos posts por semana, e quanto cada post engaja por seguidor">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Posts por semana
                </p>
                <BarrasPorPerfil itens={todos.map((r, i) => ({ ...perfil(r, i), valor: r.porSemana }))} formato={numeroCurto} />
                <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Engajamento por post
                </p>
                <BarrasPorPerfil itens={todos.map((r, i) => ({ ...perfil(r, i), valor: r.taxaDeEngajamento }))} formato={porcentoCurto} />
              </Bloco>
            )}
            {destaque && (
              <Bloco titulo="O post de maior alcance das referências" pergunta="O que chegou mais longe entre os posts estudados">
                <CartaoDoPost post={destaque.exemplos[0]} titulo={destaque.exemplos[0].formato} />
              </Bloco>
            )}
          </div>
          {!dePara && modo === "painel" && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Para ver você contra as referências (ritmo, mix de formatos, o maior gap), estude o seu próprio perfil em Editar setup, na etapa Seu perfil.
            </p>
          )}
        </>
      )}

      {/* ANDAR 3: o que fazer */}
      {(temEstudo || itens.length > 0) && (
        <OQueFazer
          projectId={projectId}
          itens={itens}
          podeEditar={d.podeEditar}
          aoMudar={carregar}
          vazio={aprovadas ? `Nada pendente: o que o estudo mostrou já virou regra (${aprovadas} valendo).` : undefined}
        />
      )}

      {/* OS DETALHES, recolhidos */}
      <div className="space-y-2">
        <Detalhes
          titulo="Regras do projeto"
          resumo={`${aprovadas} valendo${propostas ? `, ${propostas} para você decidir` : ""}. Só a regra aprovada entra no que a equipe lê.`}
          abertoDeInicio={modo === "criacao" && propostas > 0}
        >
          <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            O Roberto propõe regras a partir dos achados. Só a regra que você aprovar entra no que o squad lê (roteiro, textos, arte e edição), e vale sempre, até você desligar.
          </p>
          {d.podeEditar && (d.estudoMaisNovoQueRegras || (!regrasAbertas.length && d.achados.length > 0)) && !rodando && (
            <button
              type="button"
              disabled={pedindo !== null}
              onClick={() => void pedir("comecar", "analisar")}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pedindo === "analisar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {regrasAbertas.length ? "Atualizar as regras com o último estudo" : "Pedir as regras ao Roberto"}
            </button>
          )}
          <ListaDeRegras projectId={projectId} regras={d.regras} achados={d.achados} podeEditar={d.podeEditar} aoMudar={carregar} />
        </Detalhes>

        <Detalhes
          titulo="Tendências da semana"
          resumo={
            d.tendencias
              ? `${combinam.length} ${combinam.length === 1 ? "combina" : "combinam"} com você, ${descartadas.length} de fora. Buscadas em ${new Date(d.tendencias.geradaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}.`
              : "Ainda não buscamos as tendências desta semana."
          }
        >
          <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            O que está se repetindo nas redes (áudio, meme, roteiro), cruzado com o seu nicho e a sua voz. O que não combina fica de fora, com o motivo.
            {d.tendencias ? ` Lidos ${d.tendencias.sinais.videos} vídeos e ${d.tendencias.sinais.paginas} páginas.` : ""}
          </p>
          {d.podeEditar && !rodando && (
            <button
              type="button"
              disabled={pedindo !== null || Boolean(d.tendenciasLiberadasEm)}
              onClick={() => void pedir("comecar", "tendencias")}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {pedindo === "tendencias" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              {d.tendenciasLiberadasEm
                ? `Próxima busca liberada ${new Date(d.tendenciasLiberadasEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}`
                : "Buscar as tendências desta semana"}
            </button>
          )}
          {tendencias.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              {d.tendencias ? "Nenhuma tendência com prova suficiente nesta semana." : "Ainda não buscamos as tendências desta semana."}
            </p>
          ) : (
            <>
              {combinam.length > 0 && (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {combinam.map((t) => (
                    <CartaoDaTendencia key={t.id} t={t} projectId={projectId} aoLevar={levar} />
                  ))}
                </div>
              )}
              {descartadas.length > 0 && (
                <div className="mt-2">
                  <button type="button" onClick={() => setVerDescartadas(!verDescartadas)} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", verDescartadas && "rotate-180")} />
                    Descartadas para o seu nicho ({descartadas.length})
                  </button>
                  {verDescartadas && (
                    <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {descartadas.map((t) => (
                        <CartaoDaTendencia key={t.id} t={t} projectId={projectId} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Detalhes>

        {d.painel.graficos.length > 0 && (
          <Detalhes titulo="Todos os gráficos de rendimento" resumo={d.painel.graficos.map((g) => g.titulo).join(", ")}>
            <PainelExecutivoDasReferencias painel={d.painel} amostra={d.amostra} semFrases />
          </Detalhes>
        )}

        {d.achados.length > 0 && (
          <Detalhes titulo="Os achados em detalhe" resumo={`${d.achados.length} achados, cada um com a amostra, os posts de prova e como contamos`}>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {d.achados.map((a) => (
                <CartaoDoAchado key={a.chave} a={a} />
              ))}
            </div>
          </Detalhes>
        )}

        {estado?.status === "pronto" && estado.avisos.length > 0 && (
          <Detalhes titulo="Avisos do último estudo" resumo={`${estado.avisos.length} ${estado.avisos.length === 1 ? "aviso" : "avisos"} da leitura dos perfis`}>
            <ul className="space-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {estado.avisos.map((a) => (
                <li key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}.</li>
              ))}
            </ul>
          </Detalhes>
        )}
      </div>
    </div>
  );
}
