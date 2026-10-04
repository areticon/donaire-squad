"use client";

import {
  Bloco,
  BarrasDeRende,
  BarrasPorPerfil,
  CartaoDoPost,
  COR_REFS,
  COR_VOCE,
  Detalhes,
  MixDeFormatos,
  NumerosDoTopo,
  OQueFazer,
  Paleta,
  VoceContraReferencias,
} from "@/components/editorial/painel-do-estudo";
import { barrasQueMaisRendem, numeroCurto, numerosDoTopo, porcentoCurto, recomendacoes } from "@/lib/referencias/painel-executivo";
import type { RespostaDasAnalises } from "@/lib/referencias/tipos-das-analises";
import type { CustoDoEstudo, DeParaDoPerfil, FatiaDoPerfil, RelatorioDoPerfil } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O RELATÓRIO DO PERFIL DO CLIENTE E O DE-PARA (03/10/2026), as duas
 * primeiras telas da jornada de entrada, como PAINEL EXECUTIVO.
 *
 * Pedido do Bruno no mesmo dia: "muita informação misturada e confusa,
 * precisa ser gráfico e executivo". Cada tela tem três andares
 * (components/editorial/painel-do-estudo.tsx): os números grandes do topo, os
 * gráficos (mix de formatos, o que rende, a paleta, o post de maior
 * engajamento com a miniatura; no de-para, você contra as referências e o
 * ritmo de cada perfil) e o que fazer, com o botão de virar regra. O resto
 * (temas, tom, ganchos, a tabela dos perfis, todas as medidas) fica em "ver
 * detalhes".
 */

/** Barras de parte do todo, com o rendimento ao lado quando existe (os detalhes). */
function Distribuicao({ titulo, pergunta, fatias }: { titulo: string; pergunta: string; fatias: FatiaDoPerfil[] }) {
  if (!fatias.length) return null;
  const maior = Math.max(...fatias.map((f) => f.pct), 1);
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </p>
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {pergunta}
      </p>
      <ul className="space-y-1.5">
        {fatias.slice(0, 6).map((f) => (
          <li key={f.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]">
            <span className="truncate text-sm" style={{ color: "var(--text-primary)" }} title={f.nome}>
              {f.nome}
            </span>
            <span className="order-3 col-span-2 h-2.5 rounded-full sm:order-none sm:col-span-1" style={{ background: "var(--bg-input)" }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (f.pct / maior) * 100)}%`, background: COR_VOCE }} />
            </span>
            <span className="whitespace-nowrap text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              <b style={{ color: "var(--text-primary)" }}>{f.pct}%</b> ({f.posts})
              {f.vezes !== null && (
                <span
                  className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-bold"
                  style={{ background: f.vezes >= 1 ? "color-mix(in srgb, var(--painel-2) 18%, transparent)" : "var(--bg-input)", color: "var(--text-primary)" }}
                  title="Quanto rendeu contra os outros posts do seu perfil"
                >
                  rende {f.vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O custo do estudo (só admin recebe valores; para o cliente vem zerado e some). */
export function LinhaDeCusto({ custo, rotulo }: { custo: CustoDoEstudo | null | undefined; rotulo: string }) {
  if (!custo || (custo.apifyUsd === 0 && custo.iaUsd === 0)) return null;
  const f = (n: number) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
  return (
    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
      {rotulo} {custo.estimado ? "(estimado, antes de gastar)" : "(real)"}: leitura {f(custo.apifyUsd)} + IA {f(custo.iaUsd)} = <b>{f(custo.apifyUsd + custo.iaUsd)}</b>. Só admins veem esta linha.
    </p>
  );
}

type Comum = {
  projectId: string;
  podeEditar: boolean;
  /** As análises das referências (regras e tendências), para o "o que fazer" saber o que já é regra. */
  analise?: RespostaDasAnalises | null;
  aoMudar?: () => void | Promise<void>;
};

export function RelatorioDoPerfilNaTela({ relatorio, projectId, podeEditar, analise, aoMudar }: Comum & { relatorio: RelatorioDoPerfil }) {
  const n = relatorio.numeros;
  const m = relatorio.melhorPost;
  const q = relatorio.quemE;
  const v = relatorio.visual;
  const rende = barrasQueMaisRendem(relatorio.graficos, { max: 5 });
  // Na primeira tela, o que fazer sai do que rende ou não no SEU perfil.
  const itens = recomendacoes({ relatorio, regras: analise?.regras ?? [] });
  return (
    <div className="space-y-3">
      <NumerosDoTopo numeros={numerosDoTopo({ relatorio })} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {m && (
          <Bloco titulo="O seu post de maior engajamento">
            <CartaoDoPost post={m} titulo={m.tema ? `Sobre ${m.tema}` : "O post"} porQue={m.porQue} legenda={m.legenda} />
          </Bloco>
        )}
        {relatorio.formatos.length > 0 && (
          <Bloco titulo="Mix de formatos" pergunta="O que você mais posta, e quanto cada formato rende">
            <MixDeFormatos voce={relatorio.formatos} />
          </Bloco>
        )}
        {rende.length > 0 && (
          <Bloco titulo="O que rende mais no seu perfil" pergunta="Cada tipo de post contra o normal do seu próprio perfil">
            <BarrasDeRende barras={rende} lado="do seu perfil" />
          </Bloco>
        )}
        {v && (v.cores.length > 0 || v.estilo) && (
          <Bloco titulo="O seu visual" pergunta="As cores que mais aparecem nas suas capas">
            <Paleta cores={v.cores} />
            {(v.artes.length > 0 || v.comRostoPct !== null) && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                {v.artes.slice(0, 2).map((a) => (
                  <span key={a.chave} className="min-w-0">
                    <span className="block text-xl font-extrabold leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {a.pct}%
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      capas de {a.nome}
                    </span>
                  </span>
                ))}
                {v.comRostoPct !== null && (
                  <span className="min-w-0">
                    <span className="block text-xl font-extrabold leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {v.comRostoPct}%
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      com rosto
                    </span>
                  </span>
                )}
              </div>
            )}
          </Bloco>
        )}
      </div>

      <OQueFazer
        projectId={projectId}
        itens={itens}
        podeEditar={podeEditar}
        aoMudar={aoMudar}
        vazio="Ainda não há diferença clara entre os seus posts. O próximo passo é comparar com as suas referências."
      />

      <div className="space-y-2">
        {q && (
          <Detalhes titulo="O que eu entendi de você" resumo={q.pessoa}>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {[
                ["Quem é", q.pessoa],
                ["O produto", q.produto],
                ["O objetivo", q.objetivo],
                ["Público", q.publico],
                ["A sua linguagem", q.linguagem],
              ].map(([k, t]) =>
                t ? (
                  <div key={k} className={k === "A sua linguagem" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {k}
                    </dt>
                    <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {t}
                    </dd>
                  </div>
                ) : null
              )}
            </dl>
            {q.temas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.temas.map((t) => (
                  <span key={t} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {v?.estilo && (
              <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
                <b>Estilo das capas:</b> {v.estilo}
              </p>
            )}
          </Detalhes>
        )}
        {(relatorio.temas.length > 0 || relatorio.tons.length > 0 || relatorio.ganchos.length > 0) && (
          <Detalhes titulo="Temas, tom e ganchos" resumo="Os assuntos, o jeito de falar e como a primeira frase prende, post a post">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Distribuicao titulo="Temas" pergunta="Os assuntos dos seus posts" fatias={relatorio.temas} />
              <Distribuicao titulo="Tom" pergunta="O jeito de falar" fatias={relatorio.tons} />
              <Distribuicao titulo="Ganchos" pergunta="Como a primeira frase prende" fatias={relatorio.ganchos} />
            </div>
          </Detalhes>
        )}
        <Detalhes titulo="Os números do estudo" resumo={`${n.posts} posts lidos${n.periodoDias ? ` dos últimos ${n.periodoDias} dias` : ""}`}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {[
              [String(n.posts), "posts estudados"],
              [n.seguidores ? numeroCurto(n.seguidores) : "sem dado", "seguidores"],
              [numeroCurto(n.medianaCurtidas), "curtidas num post típico"],
              [numeroCurto(n.medianaComentarios), "comentários num post típico"],
              [numeroCurto(n.medianaVisualizacoes), "visualizações num post típico"],
              [porcentoCurto(n.taxaDeEngajamento), "engajamento por post"],
            ].map(([valor, rotulo]) => (
              <li key={rotulo}>
                <span className="block text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {valor}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {rotulo}
                </span>
              </li>
            ))}
          </ul>
          {relatorio.oQueRende.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-primary)" }}>
              {relatorio.oQueRende.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Cada post comparado com o normal (a mediana) do seu próprio perfil. A mediana: metade dos posts fica acima. Com poucos posts de um tipo, leia como pista.
          </p>
          {relatorio.redes.some((r) => r.motivo) && (
            <ul className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {relatorio.redes
                .filter((r) => r.motivo)
                .map((r) => (
                  <li key={r.rede + r.perfil}>
                    {r.rede}: {r.motivo}
                  </li>
                ))}
            </ul>
          )}
        </Detalhes>
      </div>
      <LinhaDeCusto custo={relatorio.custo} rotulo="Custo deste estudo" />
    </div>
  );
}

export function DeParaNaTela({
  dePara,
  relatorio,
  projectId,
  podeEditar,
  analise,
  aoMudar,
}: Comum & {
  dePara: DeParaDoPerfil;
  /** O relatório do seu perfil, para o mix trazer o "rende Nx" de cada formato. */
  relatorio?: RelatorioDoPerfil | null;
}) {
  const todos = [dePara.voce, ...dePara.referencias];
  const painel = analise?.painel ?? null;
  const principais = dePara.linhas.filter((l) => l.chave !== "engajamento" && l.chave !== "frequencia").slice(0, 4);
  const rende = painel ? barrasQueMaisRendem(painel.graficos, { max: 6 }) : [];
  const itens = recomendacoes({ dePara, painel, regras: analise?.regras ?? [], tendencias: analise?.tendencias?.itens ?? [] });
  const vezesDoSeu = new Map((relatorio?.formatos ?? []).map((f) => [f.chave, f.vezes]));
  const mixSeu = dePara.mix?.voce.map((f) => ({ ...f, vezes: vezesDoSeu.get(f.chave) ?? null })) ?? [];
  const perfil = (r: (typeof todos)[number], i: number) => ({ rotulo: i === 0 ? "Você" : r.rotulo.replace(/^Instagram |^TikTok |^YouTube |^LinkedIn /, ""), voce: i === 0, url: r.url });
  return (
    <div className="space-y-3">
      <NumerosDoTopo numeros={numerosDoTopo({ dePara, painel })} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {principais.length > 0 && (
          <Bloco titulo="Você contra as referências" pergunta="As medidas de maior diferença, na mesma escala dos dois lados">
            <VoceContraReferencias linhas={principais} />
          </Bloco>
        )}
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
        {mixSeu.length > 0 && (
          <Bloco titulo="Mix de formatos" pergunta="Quanto de cada formato, você e as referências">
            <MixDeFormatos voce={mixSeu} referencias={dePara.mix?.referencias} />
          </Bloco>
        )}
        {rende.length > 0 && (
          <Bloco titulo="O que rende mais nas referências" pergunta="Cada tipo de post contra o normal do próprio perfil">
            <BarrasDeRende barras={rende} />
          </Bloco>
        )}
      </div>

      <OQueFazer
        projectId={projectId}
        itens={itens}
        podeEditar={podeEditar}
        aoMudar={aoMudar}
        vazio="Você já faz o que as referências fazem de diferente. As regras e as tendências continuam chegando na linha editorial."
      />

      <div className="space-y-2">
        <Detalhes titulo="Todas as medidas comparadas" resumo={`${dePara.linhas.length} medidas, do maior gap ao menor`}>
          <VoceContraReferencias linhas={dePara.linhas} />
          {dePara.linhas.some((l) => l.prova) && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-muted)" }}>
              {dePara.linhas
                .filter((l) => l.prova)
                .map((l) => (
                  <li key={l.chave}>
                    <b style={{ color: "var(--text-primary)" }}>{l.medida}:</b> {l.prova}
                  </li>
                ))}
            </ul>
          )}
        </Detalhes>
        <Detalhes titulo="Os perfis comparados" resumo={dePara.referencias.map((r) => r.rotulo).join(", ")}>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-xs tabular-nums">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="px-1 py-1 font-medium">Perfil</th>
                  <th className="px-1 py-1 text-right font-medium">Seguidores</th>
                  <th className="px-1 py-1 text-right font-medium">Posts lidos</th>
                  <th className="px-1 py-1 text-right font-medium">Posts por semana</th>
                  <th className="px-1 py-1 text-right font-medium">Engajamento</th>
                  <th className="px-1 py-1 text-right font-medium">Post típico</th>
                </tr>
              </thead>
              <tbody>
                {todos.map((r, i) => (
                  <tr key={r.rotulo + i} className="border-t" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <td className="px-1 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: i === 0 ? COR_VOCE : COR_REFS }} />
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {r.rotulo}
                          </a>
                        ) : (
                          <b>{r.rotulo}</b>
                        )}
                      </span>
                    </td>
                    <td className="px-1 py-1.5 text-right">{numeroCurto(r.seguidores)}</td>
                    <td className="px-1 py-1.5 text-right">{r.posts}</td>
                    <td className="px-1 py-1.5 text-right">{numeroCurto(r.porSemana)}</td>
                    <td className="px-1 py-1.5 text-right">{porcentoCurto(r.taxaDeEngajamento)}</td>
                    <td className="px-1 py-1.5 text-right">{r.medianaVisualizacoes !== null ? `${numeroCurto(r.medianaVisualizacoes)} visualizações` : `${numeroCurto(r.medianaInteracao)} interações`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dePara.manchetes.length > 0 && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-primary)" }}>
              {dePara.manchetes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </Detalhes>
      </div>
    </div>
  );
}
