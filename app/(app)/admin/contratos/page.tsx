export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { contratosDoPainel, descontosDoMes } from "@/lib/contratos/painel";
import { TETO_COM_APROVACAO, TETO_SEM_APROVACAO, porcentagem } from "@/lib/contratos/preco";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { parcelamentoDoEmissorDisponivel } from "@/lib/contratos/links-de-pagamento";
import {
  COR_DO_GRUPO,
  COR_DO_STATUS_DO_CONTRATO,
  GRUPOS_DO_GESTOR,
  NOME_DO_GRUPO,
  NOME_DO_STATUS_DO_CONTRATO,
  centavosEmReais,
  ehGrupoDoGestor,
} from "@/lib/contratos/situacao";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Numero, Rosca, Vazio } from "@/components/admin/painel-graficos";
import { NovoContrato } from "@/components/admin/contratos-acoes";

/**
 * O GESTOR DE CONTRATOS (02/10/2026), no padrão gráfico do painel: quanto
 * está contratado e em que situação, o que vence nos próximos 60 dias e a
 * lista, que leva à ficha de cada cliente (/admin/contratos/[conta]). Só admin.
 *
 * 04/10: os estados na língua do dono (rascunho, enviado para assinatura,
 * assinado aguardando pagamento, pago e ativo, vencido, cancelado), com o
 * filtro por estado e o valor a receber. Contrato novo também para quem ainda
 * não tem conta (prospect).
 */
export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ conta?: string; filtro?: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const sp = await searchParams;
  const agora = new Date();
  const [contratos, contas] = await Promise.all([
    contratosDoPainel(agora),
    prisma.user.findMany({
      where: { roboEm: null },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { id: true, email: true, name: true, plan: true },
    }),
  ]);
  const provedor = provedorDeAssinatura();

  const porGrupo = new Map(GRUPOS_DO_GESTOR.map((g) => [g, contratos.filter((c) => c.grupo === g)]));
  const emVigor = porGrupo.get("ativo") ?? [];
  const valorEmVigor = emVigor.reduce((s, c) => s + c.valorCentavos, 0);
  // A RECEBER: o que falta entrar dos contratos assinados (aguardando
  // pagamento, ou pagos em parte). Em assinatura fica à parte: ainda não é
  // dívida de ninguém.
  const aReceber = contratos
    .filter((c) => c.grupo === "aguardando_pagamento" || c.grupo === "ativo")
    .reduce((s, c) => s + Math.max(0, c.valorCentavos - c.pagoCentavos), 0);
  const emAssinatura = [...(porGrupo.get("rascunho") ?? []), ...(porGrupo.get("enviado") ?? [])];
  const aVencer = contratos.filter((c) => c.situacao === "a_vencer");
  const filtro = ehGrupoDoGestor(sp.filtro) ? sp.filtro : null;
  const lista = filtro ? (porGrupo.get(filtro) ?? []) : contratos;
  const proximos = contratos
    .filter((c) => c.dias !== null && c.dias <= 60 && c.dias > -30 && (c.grupo === "ativo" || c.grupo === "vencido"))
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "a definir");
  // OS DESCONTOS DO MÊS (04/10): total e por vendedor, e o que espera o dono.
  const descontos = descontosDoMes(contratos, agora);

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo mb-1">Gestão</p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Contratos
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Contratos anuais por cliente. Assinatura eletrônica:{" "}
            {provedor ? (
              <strong>
                {provedor.nome} ({provedor.ambiente === "teste" ? "ambiente de teste" : "produção"})
              </strong>
            ) : (
              <strong>aguardando provedor (falta ZAPSIGN_API_TOKEN)</strong>
            )}
            .
          </p>
        </div>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero rotulo="Pagos e ativos" valor={String(emVigor.length)} nota={`${centavosEmReais(valorEmVigor)} por ano`} />
        <Numero
          rotulo="Aguardando pagamento"
          valor={String(porGrupo.get("aguardando_pagamento")?.length ?? 0)}
          nota={`${centavosEmReais(aReceber)} a receber`}
        />
        <Numero rotulo="Em assinatura" valor={String(emAssinatura.length)} nota={`rascunhos e enviados, ${centavosEmReais(emAssinatura.reduce((s, c) => s + c.valorCentavos, 0))}`} />
        <Numero rotulo="A vencer em 60 dias" valor={String(aVencer.length)} nota={`${porGrupo.get("vencido")?.length ?? 0} vencido(s) · avisos em 60, 30 e 7 dias`} />
      </div>

      <Cartao
        titulo={`Descontos de ${descontos.mes}`}
        subtitulo={`Até ${TETO_SEM_APROVACAO}% o vendedor concede; de ${TETO_SEM_APROVACAO}% a ${TETO_COM_APROVACAO}%, só com a aprovação de um sócio; acima de ${TETO_COM_APROVACAO}%, bloqueado. Contratos não cancelados, pela data em que o desconto foi concedido.`}
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5" data-descontos-do-mes>
          <div className="lg:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Numero
              rotulo="Desconto concedido no mês"
              valor={centavosEmReais(descontos.totalCentavos)}
              nota={
                descontos.contratos
                  ? `${descontos.contratos} contrato(s) com desconto, ${porcentagem(descontos.percentualMedio)} da tabela em média`
                  : "nenhum desconto concedido neste mês"
              }
            />
            <Numero
              rotulo="Esperando a aprovação de um sócio"
              valor={String(descontos.esperandoAprovacao.length)}
              nota={
                descontos.esperandoAprovacao.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {descontos.esperandoAprovacao.map((c) => (
                      <Link key={c.id} href={`/admin/contratos/${c.userId}`} className="underline" style={{ color: "var(--marca-laranja-texto)" }}>
                        nº {String(c.numero).padStart(4, "0")}, {porcentagem(c.descontoPercentual)}
                      </Link>
                    ))}
                  </span>
                ) : (
                  `desconto acima de ${TETO_SEM_APROVACAO}% não vai para assinatura sem aprovação`
                )
              }
            />
          </div>
          <div className="lg:col-span-3 min-w-0">
            <p className="rotulo mb-2">Por vendedor</p>
            {descontos.porVendedor.length ? (
              <BarrasHorizontais
                formatar={(n) => centavosEmReais(n).replace(",00", "")}
                linhas={descontos.porVendedor.map((v) => ({
                  nome: v.vendedor,
                  valor: v.centavos,
                  nota: `· ${v.contratos} contrato(s), ${porcentagem(v.percentual)} da tabela`,
                  cor: v.percentual > TETO_SEM_APROVACAO ? "var(--painel-2)" : "var(--painel-1)",
                }))}
              />
            ) : (
              <Vazio compacto titulo="Nenhum desconto neste mês" texto="Quando um vendedor der desconto num contrato, o valor aparece aqui, por quem concedeu." />
            )}
          </div>
        </div>
      </Cartao>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Cartao className="lg:col-span-2" titulo="Por estado" subtitulo="Valor anual de cada estado. Cancelado e rascunho ficam na conta, para nada sumir.">
          <Rosca
            centro={centavosEmReais(valorEmVigor).replace(",00", "")}
            rotuloDoCentro="pago e ativo por ano"
            formatar={(n) => centavosEmReais(n).replace(",00", "")}
            fatias={GRUPOS_DO_GESTOR.map((g) => ({
              nome: NOME_DO_GRUPO[g],
              valor: (porGrupo.get(g) ?? []).reduce((t, c) => t + c.valorCentavos, 0),
              cor: COR_DO_GRUPO[g],
              nota: `· ${(porGrupo.get(g) ?? []).length}`,
            }))}
            vazio={{ titulo: "Nenhum contrato ainda", texto: "Crie o primeiro pelo botão Novo contrato. Ele nasce como rascunho." }}
          />
        </Cartao>
        <Cartao className="lg:col-span-3" titulo="Próximos vencimentos" subtitulo="Dias até o fim da vigência. Abaixo de 7 dias, a barra é a de alerta.">
          {proximos.length ? (
            <BarrasHorizontais
              linhas={proximos.map((c) => ({
                nome: `${c.cliente} · nº ${String(c.numero).padStart(4, "0")}`,
                valor: Math.max(0, c.dias ?? 0),
                nota: (c.dias ?? 0) <= 0 ? "dias: venceu" : `dias, até ${data(c.fim)}`,
                cor: (c.dias ?? 0) <= 7 ? "var(--badge-danger-text)" : (c.dias ?? 0) <= 30 ? "var(--painel-2)" : "var(--painel-3)",
              }))}
            />
          ) : (
            <Vazio titulo="Nada vence nos próximos 60 dias" texto="Contrato que entra na janela de 60 dias aparece aqui, e o cliente e você recebem o aviso por e-mail." />
          )}
        </Cartao>
      </div>

      <Cartao
        titulo="Novo contrato"
        subtitulo="Para um novo cliente ou para uma conta que já existe. Nasce como rascunho; na ficha, vai para assinatura eletrônica, recebe o pagamento e, pago, libera o acesso."
      >
        <NovoContrato
          contas={contas.map((c) => ({ id: c.id, rotulo: `${c.name ?? "(sem nome)"} · ${c.email} · ${c.plan}`, plano: c.plan }))}
          contaInicial={sp.conta ?? null}
          emissorDisponivel={parcelamentoDoEmissorDisponivel()}
        />
      </Cartao>

      <Cartao titulo={filtro ? `Contratos: ${NOME_DO_GRUPO[filtro].toLowerCase()}` : "Todos os contratos"}>
        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtrar por estado" data-filtros-de-contrato>
          {[null, ...GRUPOS_DO_GESTOR].map((g) => {
            const ativo = g === filtro;
            const n = g ? (porGrupo.get(g)?.length ?? 0) : contratos.length;
            return (
              <Link
                key={g ?? "todos"}
                href={g ? `/admin/contratos?filtro=${g}` : "/admin/contratos"}
                aria-current={ativo ? "page" : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                style={ativo ? { borderColor: "var(--text-primary)", color: "var(--text-primary)", background: "var(--realce-2)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {g && <span className="h-2 w-2 rounded-full" style={{ background: COR_DO_GRUPO[g] }} />}
                {g ? NOME_DO_GRUPO[g] : "Todos"}
                <span className="tabular-nums">{n}</span>
              </Link>
            );
          })}
        </nav>
        {lista.length === 0 ? (
          <Vazio titulo="Nenhum contrato" texto={filtro ? "Nenhum contrato neste estado." : "A lista aparece aqui, com o estado calculado pela assinatura, pelo pagamento e pelas datas da vigência."} />
        ) : (
          <ul className="space-y-2">
            {lista.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/contratos/${c.userId}`}
                  data-contrato={c.numero}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] gap-2 rounded-xl border px-3 py-2 hover:bg-[var(--realce-2)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      nº {String(c.numero).padStart(4, "0")} · {c.cliente}
                    </span>
                    <span className="block text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {c.plano} · {centavosEmReais(c.valorCentavos)} por ano
                      {c.descontoCentavos > 0 && c.precoTabelaCentavos ? ` (tabela ${centavosEmReais(c.precoTabelaCentavos)}, desconto ${porcentagem(c.descontoPercentual)})` : ""}
                      {c.fundador ? " · Fundador" : ""} · {c.email}
                    </span>
                    <span className="block text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {c.grupo === "aguardando_pagamento"
                        ? `a receber ${centavosEmReais(Math.max(0, c.valorCentavos - c.pagoCentavos))}${c.formaDePagamento ? ` · ${c.formaDePagamento}` : ""}`
                        : c.pagoEm && c.fim
                          ? `pago em ${data(c.pagoEm)} · renova em ${data(c.fim)}`
                          : c.formaDePagamento ?? ""}
                    </span>
                  </span>
                  <span className="text-xs self-center" style={{ color: "var(--text-primary)" }}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: COR_DO_STATUS_DO_CONTRATO[c.situacao] }} />
                    {NOME_DO_STATUS_DO_CONTRATO[c.situacao]}
                    {c.provedorSituacao === "aguardando_provedor" ? " · aguardando provedor" : ""}
                    {c.esperaAprovacao ? (
                      <span className="block font-semibold" style={{ color: "var(--marca-laranja-texto)" }}>
                        desconto espera a aprovação de um sócio
                      </span>
                    ) : null}
                  </span>
                  <span className="self-center">
                    {c.inicio ? (
                    <BarraEmpilhada
                      rotulo="Vigência"
                      partes={[
                        { nome: `de ${data(c.inicio)} a ${data(c.fim)}`, valor: c.dias !== null ? Math.max(0, 365 - Math.max(0, c.dias)) : 0, cor: COR_DO_STATUS_DO_CONTRATO[c.situacao] },
                        { nome: "dias restantes", valor: Math.max(0, c.dias ?? 0), cor: "var(--painel-neutro)" },
                      ]}
                    />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Vigência de 12 meses a partir da confirmação do pagamento
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
