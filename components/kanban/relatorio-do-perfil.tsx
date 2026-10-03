"use client";

import { ExternalLink, Sparkles, Target, Trophy } from "lucide-react";
import type { CustoDoEstudo, DeParaDoPerfil, FatiaDoPerfil, LinhaDoDePara, RelatorioDoPerfil } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O RELATÓRIO DO PERFIL DO CLIENTE E O DE-PARA EM GRÁFICOS (03/10/2026), as
 * duas primeiras telas da jornada de entrada.
 *
 * Mesma linguagem do painel das referências (graficos-das-referencias.tsx):
 * HTML e CSS, sem biblioteca, as cores --painel-* validadas nos dois temas, o
 * número sempre escrito ao lado da barra. Aqui as barras são de PARTE DO
 * TODO (quanto do perfil é reel, é educativo, abre com pergunta) e, quando dá
 * para medir, o rendimento vai ao lado ("rende 2,1x").
 *
 * No de-para, cada medida tem duas barras na mesma escala: VOCÊ (azul) e as
 * REFERÊNCIAS (laranja, a mediana dos perfis). A cor diz o lado e o rótulo
 * também, para não depender só de cor.
 */

const COR_VOCE = "var(--painel-3)";
const COR_ELAS = "var(--painel-2)";

function numero(n: number | null | undefined): string {
  if (n === null || n === undefined) return "sem dado";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Porcentagem pequena precisa de mais casas: 0,03% não é 0%. */
const porcento = (n: number | null | undefined) =>
  n === null || n === undefined ? "sem dado" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 2 : 1 })}%`;

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) : "");

function Cartao({ titulo, children, className = "" }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${className}`} style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      {titulo && (
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {titulo}
        </h3>
      )}
      {children}
    </section>
  );
}

function Numero({ valor, rotulo, detalhe }: { valor: string; rotulo: string; detalhe?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <p className="truncate text-2xl font-extrabold tabular-nums leading-none sm:text-3xl" style={{ color: "var(--text-primary)" }}>
        {valor}
      </p>
      <p className="mt-1.5 text-xs font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
        {rotulo}
      </p>
      {detalhe && (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {detalhe}
        </p>
      )}
    </div>
  );
}

/** Barras de parte do todo, com o rendimento ao lado quando existe. */
function Distribuicao({ titulo, pergunta, fatias }: { titulo: string; pergunta: string; fatias: FatiaDoPerfil[] }) {
  if (!fatias.length) return null;
  const maior = Math.max(...fatias.map((f) => f.pct), 1);
  return (
    <Cartao>
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </h3>
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
    </Cartao>
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

export function RelatorioDoPerfilNaTela({ relatorio }: { relatorio: RelatorioDoPerfil }) {
  const n = relatorio.numeros;
  const m = relatorio.melhorPost;
  const q = relatorio.quemE;
  const v = relatorio.visual;
  return (
    <div className="space-y-3">
      {/* Os números grandes */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero valor={String(n.posts)} rotulo="posts estudados" detalhe={n.periodoDias ? `dos últimos ${n.periodoDias} dias` : undefined} />
        <Numero valor={n.porSemana !== null ? numero(n.porSemana) : "sem dado"} rotulo="posts por semana" />
        <Numero
          valor={porcento(n.taxaDeEngajamento)}
          rotulo="engajamento por post"
          detalhe={n.seguidores ? `curtidas e comentários sobre ${numero(n.seguidores)} seguidores` : "sem o número de seguidores"}
        />
        <Numero
          valor={n.medianaVisualizacoes !== null ? numero(n.medianaVisualizacoes) : numero(n.medianaCurtidas)}
          rotulo={n.medianaVisualizacoes !== null ? "visualizações num post típico" : "curtidas num post típico"}
          detalhe="a mediana: metade dos posts fica acima"
        />
      </div>

      {/* O melhor post */}
      {m && (
        <Cartao>
          <div className="flex items-start gap-3">
            <Trophy className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--painel-2)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                O seu post de maior engajamento
                {m.publicadoEm ? <span className="font-normal" style={{ color: "var(--text-muted)" }}>{`, ${dataCurta(m.publicadoEm)}`}</span> : null}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {[
                  m.visualizacoes ? `${numero(m.visualizacoes)} visualizações` : null,
                  m.curtidas !== null ? `${numero(m.curtidas)} curtidas` : null,
                  m.comentarios !== null ? `${numero(m.comentarios)} comentários` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . {m.porQue}
              </p>
              {m.legenda && (
                <p className="mt-1.5 line-clamp-2 text-xs italic" style={{ color: "var(--text-primary)" }}>
                  &ldquo;{m.legenda}
                  {m.legenda.length >= 220 ? "..." : ""}&rdquo;
                </p>
              )}
              {m.url && (
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-orange-500 hover:underline">
                  Abrir o post <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </Cartao>
      )}

      {/* Quem é */}
      {q && (
        <Cartao titulo="O que eu entendi de você">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {[
              ["Quem é", q.pessoa],
              ["O produto", q.produto],
              ["O objetivo", q.objetivo],
              ["Público", q.publico],
            ].map(([k, t]) =>
              t ? (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {k}
                  </dt>
                  <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {t}
                  </dd>
                </div>
              ) : null
            )}
            {q.linguagem && (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  A sua linguagem
                </dt>
                <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {q.linguagem}
                </dd>
              </div>
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
        </Cartao>
      )}

      {/* O que rende */}
      {relatorio.oQueRende.length > 0 && (
        <Cartao titulo="O que mais rende no seu perfil">
          <ul className="space-y-1">
            {relatorio.oQueRende.map((f) => (
              <li key={f} className="flex gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: f.includes("rende só") ? "var(--painel-5)" : "var(--painel-2)" }} />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Cada post comparado com o normal (a mediana) do seu próprio perfil. Com poucos posts de um tipo, leia como pista.
          </p>
        </Cartao>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Distribuicao titulo="Formatos" pergunta="O que você mais posta, e quanto cada formato rende" fatias={relatorio.formatos} />
        <Distribuicao titulo="Temas" pergunta="Os assuntos dos seus posts" fatias={relatorio.temas} />
        <Distribuicao titulo="Tom" pergunta="O jeito de falar" fatias={relatorio.tons} />
        <Distribuicao titulo="Ganchos" pergunta="Como a primeira frase prende" fatias={relatorio.ganchos} />
      </div>

      {/* O visual */}
      {v && (v.cores.length > 0 || v.estilo || v.artes.length > 0) && (
        <Cartao titulo="O seu visual">
          {v.cores.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {v.cores.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  <span className="h-6 w-6 rounded-md border" style={{ background: c, borderColor: "var(--border)" }} />
                  {c}
                </span>
              ))}
            </div>
          )}
          {v.estilo && (
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {v.estilo}
            </p>
          )}
          {v.artes.length > 0 && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Capas: {v.artes.map((a) => `${a.nome} ${a.pct}%`).join(", ")}
              {v.comRostoPct !== null ? `; rosto em ${v.comRostoPct}% delas` : ""}.
            </p>
          )}
        </Cartao>
      )}

      {relatorio.redes.some((r) => r.motivo) && (
        <ul className="space-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {relatorio.redes
            .filter((r) => r.motivo)
            .map((r) => (
              <li key={r.rede + r.perfil}>
                {r.rede}: {r.motivo}
              </li>
            ))}
        </ul>
      )}
      <LinhaDeCusto custo={relatorio.custo} rotulo="Custo deste estudo" />
    </div>
  );
}

function BarraDupla({ l }: { l: LinhaDoDePara }) {
  const max = Math.max(l.voce ?? 0, l.elas ?? 0, l.unidade === "%" ? 1 : 0.1);
  const escala = l.unidade === "%" ? 100 : max;
  const txt = (x: number | null) => (x === null ? "sem dado" : l.unidade === "%" ? porcento(x) : `${numero(x)}${l.unidade === "s" ? " s" : ""}`);
  const linhaDaBarra = (rotulo: string, valor: number | null, cor: string) => (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {rotulo}
      </span>
      <span className="h-3 rounded-full" style={{ background: "var(--bg-input)" }}>
        <span className="block h-full rounded-full" style={{ width: `${valor === null ? 0 : Math.max(2, (valor / escala) * 100)}%`, background: cor }} />
      </span>
      <span className="text-right text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {txt(valor)}
      </span>
    </div>
  );
  return (
    <li className="space-y-1 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {l.medida}
        </span>
        {l.prioridade !== "baixa" && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              background: l.prioridade === "alta" ? "color-mix(in srgb, var(--painel-2) 22%, transparent)" : "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            {l.prioridade === "alta" ? "prioridade alta" : "vale olhar"}
          </span>
        )}
      </div>
      {linhaDaBarra("Você", l.voce, COR_VOCE)}
      {linhaDaBarra("Referências", l.elas, COR_ELAS)}
      {l.prova && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Por que importa: {l.prova}
        </p>
      )}
    </li>
  );
}

export function DeParaNaTela({ dePara }: { dePara: DeParaDoPerfil }) {
  const todos = [dePara.voce, ...dePara.referencias];
  const relevantes = dePara.linhas.filter((l) => l.prioridade !== "baixa");
  const resto = dePara.linhas.filter((l) => l.prioridade === "baixa");
  return (
    <div className="space-y-3">
      {dePara.manchetes.length > 0 && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {dePara.manchetes.map((f) => (
            <div key={f} className="flex gap-2.5 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
              <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--painel-2)" }} />
              <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                {f}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Os perfis lado a lado */}
      <Cartao titulo="Os perfis comparados">
        <ul className="space-y-2 sm:hidden">
          {todos.map((r, i) => (
            <li key={r.rotulo + i} className="text-xs" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i === 0 ? COR_VOCE : COR_ELAS }} />
                {r.rotulo}
              </span>
              {numero(r.seguidores)} seguidores, {numero(r.porSemana)} posts por semana, engajamento {porcento(r.taxaDeEngajamento)},{" "}
              {r.medianaVisualizacoes !== null ? `${numero(r.medianaVisualizacoes)} visualizações` : `${numero(r.medianaInteracao)} interações`} num post típico
            </li>
          ))}
        </ul>
        <div className="-mx-1 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[30rem] text-left text-xs tabular-nums">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-1 py-1 font-medium">Perfil</th>
                <th className="px-1 py-1 text-right font-medium">Seguidores</th>
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
                      <span className="h-2 w-2 rounded-full" style={{ background: i === 0 ? COR_VOCE : COR_ELAS }} />
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {r.rotulo}
                        </a>
                      ) : (
                        <b>{r.rotulo}</b>
                      )}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-right">{numero(r.seguidores)}</td>
                  <td className="px-1 py-1.5 text-right">{numero(r.porSemana)}</td>
                  <td className="px-1 py-1.5 text-right">{porcento(r.taxaDeEngajamento)}</td>
                  <td className="px-1 py-1.5 text-right">{r.medianaVisualizacoes !== null ? `${numero(r.medianaVisualizacoes)} visualizações` : `${numero(r.medianaInteracao)} interações`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao titulo="O que elas fazem que você não faz">
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-sm" style={{ background: COR_VOCE }} />
            você
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded-sm" style={{ background: COR_ELAS }} />
            referências (a mediana dos perfis)
          </span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {(relevantes.length ? relevantes : dePara.linhas.slice(0, 4)).map((l) => (
            <BarraDupla key={l.chave} l={l} />
          ))}
        </ul>
        {relevantes.length > 0 && resto.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-medium text-orange-500">Ver as outras {resto.length} medidas (diferença pequena)</summary>
            <ul className="divide-y divide-[var(--border)]">
              {resto.map((l) => (
                <BarraDupla key={l.chave} l={l} />
              ))}
            </ul>
          </details>
        )}
      </Cartao>
    </div>
  );
}
