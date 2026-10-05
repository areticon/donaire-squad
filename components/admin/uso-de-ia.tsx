import Link from "next/link";
import { reais, numero } from "@/lib/admin/tipos-do-painel";
import {
  COR_DA_CATEGORIA,
  COR_DA_FAMILIA,
  dolares,
  MARGEM_MINIMA_DESENHADA,
  NOME_DA_CATEGORIA,
  NOME_DA_FAMILIA,
  NOME_DO_PERIODO,
  pct,
  PERIODOS_DE_IA,
  TETO_DE_CUSTO_POR_CREDITO,
  type CruzamentoPorGrupo,
  type DadosDoUsoDeIa,
  type LinhaDeConta,
} from "@/lib/admin/tipos-do-uso-de-ia";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Rosca, Vazio } from "@/components/admin/painel-graficos";

/**
 * USO DE IA E MARGEM, a seção do painel de admin (05/10/2026).
 *
 * Componente de SERVIDOR sem banco: recebe os números prontos de
 * lib/admin/uso-de-ia.ts e só desenha. Segue as peças do painel gráfico
 * (rosca, barras, barra empilhada) e as mesmas regras: a cor diz qual série,
 * o número está sempre escrito, e sem dado a peça explica o que a preenche.
 *
 * Três perguntas, três blocos:
 *  1. de quem é o gasto (cliente, desenvolvimento, órfão), por fornecedor,
 *     por família de operação;
 *  2. a margem por cliente e por plano, com o sinal vermelho do desenho;
 *  3. os créditos estão funcionando: o cruzamento por grupo de cobrança.
 *
 * Funciona a 390 px: tudo em coluna única no celular, e a tabela de contas
 * rola na horizontal dentro do cartão.
 */
export function UsoDeIa({ dados, dias, extra = "" }: { dados: DadosDoUsoDeIa; dias: number; extra?: string }) {
  const d = dados;
  const custoReais = d.totalUsd * d.dolar;
  const dev = d.porCategoria.find((c) => c.categoria === "dev")?.usd ?? 0;
  const orfao = d.porCategoria.find((c) => c.categoria === "orfao")?.usd ?? 0;
  const cliente = d.porCategoria.find((c) => c.categoria === "cliente")?.usd ?? 0;
  const creditosDeCliente = d.clientes.reduce((s, c) => s + c.creditosCobrados, 0);
  const alertas = [...d.clientes.filter((c) => c.alerta), ...d.porPlano.filter((p) => p.alerta)].length;
  const vazamentos = d.cruzamento.reduce((s, c) => s + c.vazamentos.length, 0);
  const semGasto = d.cruzamento.reduce((s, c) => s + c.semGasto.length, 0);
  const usdVazado = d.cruzamento.reduce((s, c) => s + c.vazamentos.reduce((t, v) => t + v.usd, 0), 0);

  return (
    <section id="uso-de-ia" className="space-y-5 scroll-mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo mb-1">Uso de IA e margem</p>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            De quem é o gasto, e se os créditos pagam por ele
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {d.rotuloDoPeriodo[0].toUpperCase() + d.rotuloDoPeriodo.slice(1)}, no horário de São Paulo. Dólar a {d.dolar.toFixed(2)} (DOLAR_PARA_REAL).{" "}
            {d.colunaDeInterna
              ? "Conta interna é a marcada no banco (contaInterna) ou com acesso de admin."
              : "A coluna contaInterna ainda não existe no banco: conta interna é a de admin, a @demandou.com e o Gmail do Bruno, pela lista do código."}
          </p>
        </div>
        <nav aria-label="Período do uso de IA" className="inline-flex rounded-xl border p-1 gap-1" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          {PERIODOS_DE_IA.map((p) => {
            const ativo = p === d.periodo;
            return (
              <Link
                key={p}
                href={`/admin?dias=${dias}&ia=${p}${extra}#uso-de-ia`}
                aria-current={ativo ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                  ativo ? "bg-[var(--acento-forte)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--realce-2)] hover:text-[var(--text-primary)]"
                }`}
              >
                {NOME_DO_PERIODO[p]}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* OS NÚMEROS DE CABEÇA DA SEÇÃO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Resumo rotulo="Gasto de IA no período" valor={dolares(d.totalUsd)} nota={`${reais(custoReais, 2)} · ${numero(d.porCategoria.reduce((s, c) => s + c.n, 0))} chamadas`}>
          <BarraEmpilhada
            rotulo="Gasto por categoria, em dólar"
            partes={d.porCategoria.map((c) => ({ nome: NOME_DA_CATEGORIA[c.categoria], valor: Math.round(c.usd), cor: COR_DA_CATEGORIA[c.categoria] }))}
          />
        </Resumo>
        <Resumo
          rotulo="Dos clientes"
          valor={dolares(cliente)}
          nota={d.totalUsd > 0 ? `${Math.round((cliente / d.totalUsd) * 100)}% do gasto · ${numero(creditosDeCliente)} créditos cobrados` : "nenhum gasto no período"}
        />
        <Resumo
          rotulo="Do time (dev e órfão)"
          valor={dolares(dev + orfao)}
          nota={`${dolares(dev)} em conta interna · ${dolares(orfao)} sem projeto ou projeto apagado`}
        />
        <Resumo
          rotulo="Sinais"
          valor={`${alertas + vazamentos + semGasto}`}
          nota={`${alertas} de margem · ${vazamentos} vazamento(s) de crédito · ${semGasto} cobrança(s) sem gasto`}
          cor={alertas + vazamentos > 0 ? "var(--badge-danger-text)" : "var(--badge-success-text)"}
        />
      </div>

      {/* DE QUEM É, POR FORNECEDOR E POR FAMÍLIA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Cartao titulo="Cliente ou desenvolvimento" subtitulo="Linha sem projeto, ou de projeto apagado, conta como desenvolvimento: ninguém paga por ela.">
          <Rosca
            centro={dolares(d.totalUsd)}
            rotuloDoCentro="no período"
            formatar={dolares}
            fatias={d.porCategoria.map((c) => ({ nome: NOME_DA_CATEGORIA[c.categoria], valor: c.usd, cor: COR_DA_CATEGORIA[c.categoria], nota: `· ${numero(c.n)} chamadas` }))}
            vazio={{ titulo: "Nenhum gasto de IA no período", texto: "Cada chamada de modelo (texto, imagem, vídeo, voz, transcrição) grava uma linha em ai_usage, e ela entra aqui." }}
          />
        </Cartao>

        <Cartao titulo="Por fornecedor" subtitulo="Deduzido do modelo que de fato respondeu. A parte clara da barra é de cliente; a escura, do time.">
          {d.porFornecedor.length > 0 ? (
            <BarrasDuplas linhas={d.porFornecedor.map((f) => ({ nome: f.nome, cliente: f.cliente, dev: f.dev, nota: `${numero(f.n)} chamadas` }))} />
          ) : (
            <Vazio compacto titulo="Sem fornecedor no período" texto="Anthropic, Google, OpenAI, fal.ai, Higgsfield, HeyGen, ElevenLabs e Deepgram aparecem aqui quando houver chamada." />
          )}
        </Cartao>

        <Cartao titulo="Por família de operação" subtitulo="O custo agrupado pelo que o cliente compra: campanha, roteiro, completo e cortes, gêmeo, vídeo por IA.">
          {d.porFamilia.length > 0 ? (
            <BarrasHorizontais
              formatar={dolares}
              linhas={d.porFamilia.map((f) => ({ nome: NOME_DA_FAMILIA[f.familia], valor: f.usd, cor: COR_DA_FAMILIA[f.familia], nota: `· ${numero(f.n)}` }))}
            />
          ) : (
            <Vazio compacto titulo="Sem operação no período" texto="A família vem do nome da operação gravada em ai_usage." />
          )}
        </Cartao>
      </div>

      {/* POR MODELO E POR OPERAÇÃO, dobrados: é detalhe, não cabeçalho. */}
      <details className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Por modelo e por operação ({d.porModelo.length} modelos, {d.porOperacao.length} operações)
        </summary>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <p className="rotulo mb-2">Modelos, os 15 mais caros</p>
            <BarrasHorizontais formatar={dolares} linhas={d.porModelo.slice(0, 15).map((m) => ({ nome: `${m.nome} · ${m.fornecedor}`, valor: m.usd, nota: `· ${numero(m.n)}` }))} />
          </div>
          <div>
            <p className="rotulo mb-2">Operações, as 20 mais caras</p>
            <BarrasHorizontais
              formatar={dolares}
              linhas={d.porOperacao.slice(0, 20).map((o) => ({ nome: o.nome, valor: o.usd, cor: COR_DA_FAMILIA[o.familia], nota: `· ${numero(o.n)}` }))}
            />
          </div>
        </div>
      </details>

      {/* A MARGEM POR CLIENTE E POR PLANO */}
      <Cartao
        titulo="Margem por cliente"
        subtitulo={`Receita do plano (ou do contrato) proporcional aos ${d.dias} dias do período contra o custo real de IA em real. Vermelho quando a margem fica abaixo de ${Math.round(MARGEM_MINIMA_DESENHADA * 100)}% ou o custo passa de R$ ${TETO_DE_CUSTO_POR_CREDITO.toFixed(3)} por crédito cobrado.`}
      >
        {d.clientes.length > 0 ? (
          <TabelaDeContas linhas={d.clientes} comReceita />
        ) : (
          <Vazio
            titulo="Nenhum cliente com uso ou plano no período"
            texto="Quando uma conta que não é interna gerar campanha, enviar gravação ou pagar plano, ela entra aqui com créditos cobrados, custo real, receita e margem. Hoje todo o gasto é do time."
          />
        )}
        {d.porPlano.length > 0 && (
          <div className="mt-4">
            <p className="rotulo mb-2">Por plano</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {d.porPlano.map((p) => (
                <div key={p.plano} className="rounded-xl border px-3 py-2" style={{ borderColor: p.alerta ? "var(--badge-danger-text)" : "var(--border)", background: "var(--bg-input)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {p.planoNome} · {p.contas} conta(s)
                  </p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: p.alerta ? "var(--badge-danger-text)" : "var(--badge-success-text)" }}>
                    {pct(p.margemPct)} de margem
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {reais(p.receitaReais)} de receita · {reais(p.custoReais, 2)} de custo · teto {reais(p.tetoDeCustoReais)}
                  </p>
                  {p.alerta && (
                    <p className="text-[11px] font-semibold" style={{ color: "var(--badge-danger-text)" }}>
                      {p.alerta}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
          Receita e custo sem infraestrutura nem imposto. A coluna R$ pela régua é o que os créditos cobrados deveriam custar de IA no máximo (R$ {TETO_DE_CUSTO_POR_CREDITO.toFixed(3)} cada): custo real acima disso é a régua furada.
        </p>
      </Cartao>

      <Cartao
        titulo="Contas do time"
        subtitulo="O que o desenvolvimento gastou, por conta. Sem receita e sem margem de propósito; a coluna de créditos mostra o que a conta teria pago se fosse cliente."
      >
        {d.internas.length > 0 || d.orfao.usd > 0 ? (
          <>
            {d.internas.length > 0 && <TabelaDeContas linhas={d.internas} />}
            <p className="text-xs mt-3 tabular-nums" style={{ color: "var(--text-muted)" }}>
              Fora de qualquer conta (sem projeto ou projeto apagado): <strong style={{ color: "var(--text-primary)" }}>{dolares(d.orfao.usd)}</strong> em {numero(d.orfao.n)} chamadas.
            </p>
          </>
        ) : (
          <Vazio compacto titulo="Nenhum gasto interno no período" texto="Testes, provas e demonstrações com conta interna aparecem aqui." />
        )}
      </Cartao>

      {/* OS CRÉDITOS ESTÃO FUNCIONANDO? */}
      <Cartao
        titulo="Os créditos estão funcionando?"
        subtitulo="Por grupo de cobrança, o gasto de IA de cada projeto cruzado com as linhas do extrato do mesmo projeto no mesmo período. Gasto sem linha é vazamento; linha sem gasto é cobrança sem entrega. Conta interna conta pela linha a zero, e o 'custaria' da nota entra na régua."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {d.cruzamento.map((c) => (
            <Grupo key={c.grupo} c={c} dolar={d.dolar} />
          ))}
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
          Na borda do período a cobrança pode ter caído do outro lado da janela (o roteiro é cobrado no envio e a aprovação dias depois): vazamento de centavos em projeto que já pagou é borda, não defeito. Vazamento de dólares inteiros, ou em cliente, é defeito.
          {usdVazado > 0 ? ` Total apontado como vazamento: ${dolares(usdVazado)}.` : ""}
        </p>
      </Cartao>
    </section>
  );
}

function Resumo({ rotulo, valor, nota, cor, children }: { rotulo: string; valor: string; nota?: string; cor?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 min-w-0" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}>
      <p className="rotulo mb-1">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: cor ?? "var(--text-primary)" }}>
        {valor}
      </p>
      {nota && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {nota}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Barras com duas partes (cliente e time) na mesma escala, o total escrito na ponta. */
function BarrasDuplas({ linhas }: { linhas: Array<{ nome: string; cliente: number; dev: number; nota?: string }> }) {
  const max = Math.max(0.01, ...linhas.map((l) => l.cliente + l.dev));
  return (
    <ul className="space-y-2.5">
      {linhas.map((l) => (
        <li key={l.nome}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {l.nome}
            </span>
            <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{dolares(l.cliente + l.dev)}</strong>
              {l.nota ? ` · ${l.nota}` : ""}
            </span>
          </div>
          <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full gap-[1px]" style={{ background: "var(--bg-input)" }} title={`cliente ${dolares(l.cliente)}, time ${dolares(l.dev)}`}>
            {l.cliente > 0 && <div className="h-full" style={{ width: `${(l.cliente / max) * 100}%`, background: COR_DA_CATEGORIA.cliente }} />}
            {l.dev > 0 && <div className="h-full" style={{ width: `${(l.dev / max) * 100}%`, background: COR_DA_CATEGORIA.dev }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TabelaDeContas({ linhas, comReceita = false }: { linhas: LinhaDeConta[]; comReceita?: boolean }) {
  const cabecalho = comReceita
    ? ["Conta", "Créditos cobrados", "R$ pela régua", "Custo real", "Por crédito", "Receita no período", "Margem"]
    : ["Conta", "Créditos cobrados", "Teria pago", "Custo real", "Por crédito"];
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className={`w-full ${comReceita ? "min-w-[52rem]" : "min-w-[38rem]"} text-sm`}>
        <thead>
          <tr style={{ background: "var(--bg-input)" }}>
            {cabecalho.map((h) => (
              <th key={h} className="text-left font-medium px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const corDaMargem = l.alerta ? "var(--badge-danger-text)" : "var(--badge-success-text)";
            const reguaFurada = l.custoPorCredito !== null && l.custoPorCredito > TETO_DE_CUSTO_POR_CREDITO;
            return (
              <tr key={l.id ?? l.email} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2">
                  <span style={{ color: "var(--text-primary)" }}>{l.nome ?? l.email}</span>
                  <br />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {l.email} · {l.planoNome} · {numero(l.chamadas)} chamadas
                  </span>
                  {l.alerta && (
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: "var(--badge-danger-text)" }}>
                      {l.alerta}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--text-primary)" }}>
                  {numero(l.creditosCobrados)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--text-muted)" }}>
                  {comReceita ? reais(l.custoDesenhadoReais, 2) : `${numero(l.creditosQueCustariam)} créditos`}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--text-primary)" }}>
                  {reais(l.custoReais, 2)}
                  <br />
                  <span style={{ color: "var(--text-muted)" }}>{dolares(l.custoUsd)}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs" style={{ color: reguaFurada ? "var(--badge-danger-text)" : "var(--text-muted)" }}>
                  {l.custoPorCredito === null ? "sem crédito cobrado" : `R$ ${l.custoPorCredito.toFixed(3)}`}
                </td>
                {comReceita && (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--text-primary)" }}>
                      {reais(l.receitaReais)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums font-medium" style={{ color: corDaMargem }}>
                      {reais(l.margemReais)}
                      <br />
                      <span className="text-xs">{pct(l.margemPct)}</span>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Grupo({ c, dolar }: { c: CruzamentoPorGrupo; dolar: number }) {
  const creditosNaRegua = c.creditos + c.creditosQueCustariam;
  const custoPorCredito = creditosNaRegua > 0 ? (c.usd * dolar) / creditosNaRegua : null;
  const reguaFurada = custoPorCredito !== null && custoPorCredito > TETO_DE_CUSTO_POR_CREDITO;
  const vazio = c.usd === 0 && c.cobrancas === 0;
  const temProblema = c.vazamentos.length > 0 || c.semGasto.length > 0;
  const borda = vazio ? "var(--border)" : temProblema ? "var(--badge-warning-text)" : "var(--border)";
  return (
    <div className="rounded-xl border p-3 min-w-0" style={{ borderColor: borda, background: "var(--bg-input)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {c.nome}
        </p>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
          style={{
            background: vazio ? "var(--bg-elevated)" : temProblema ? "var(--badge-warning-bg)" : "var(--bg-elevated)",
            color: vazio ? "var(--text-muted)" : temProblema ? "var(--badge-warning-text)" : "var(--badge-success-text)",
          }}
        >
          {vazio ? "sem uso" : temProblema ? "conferir" : "fechou"}
        </span>
      </div>
      <p className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text-primary)" }}>{dolares(c.usd)}</strong> de IA · {c.cobrancas} linha(s) no extrato · {numero(c.creditos)} créditos cobrados
        {c.creditosQueCustariam > 0 ? ` (+ ${numero(c.creditosQueCustariam)} que conta interna teria pago)` : ""}
      </p>
      {custoPorCredito !== null && (
        <p className="text-xs mt-0.5 tabular-nums" style={{ color: reguaFurada ? "var(--badge-danger-text)" : "var(--text-muted)" }}>
          R$ {custoPorCredito.toFixed(3)} de IA por crédito{reguaFurada ? `, acima da régua de R$ ${TETO_DE_CUSTO_POR_CREDITO.toFixed(3)}` : ", dentro da régua"}
        </p>
      )}
      {c.vazamentos.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {c.vazamentos.slice(0, 6).map((v) => (
            <li key={`${v.projeto}-${v.conta}`} className="text-[11px] tabular-nums" style={{ color: v.categoria === "cliente" ? "var(--badge-danger-text)" : "var(--text-muted)" }}>
              vazamento: {v.projeto} ({v.conta}) gastou {dolares(v.usd)} e não tem linha no extrato
            </li>
          ))}
          {c.vazamentos.length > 6 && (
            <li className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              e mais {c.vazamentos.length - 6} projeto(s)
            </li>
          )}
        </ul>
      )}
      {c.semGasto.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {c.semGasto.slice(0, 6).map((s) => (
            <li key={`${s.projeto}-${s.conta}`} className="text-[11px] tabular-nums" style={{ color: "var(--badge-warning-text)" }}>
              cobrança sem gasto: {s.projeto} ({s.conta}) tem {s.cobrancas} linha(s) e {numero(s.creditos)} créditos sem chamada de IA
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
