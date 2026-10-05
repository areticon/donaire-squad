export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { reais } from "@/lib/admin/tipos-do-painel";
import { fichaDoCliente } from "@/lib/contratos/painel";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { COR_DO_STATUS_DO_CONTRATO, NOME_DA_FORMA, NOME_DO_STATUS_DO_CONTRATO, centavosEmReais, fracaoDaVigencia } from "@/lib/contratos/situacao";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Medidor, Numero, Rosca, Vazio } from "@/components/admin/painel-graficos";
import { AcoesDoContrato } from "@/components/admin/contratos-acoes";
import { AcoesDoAditivo, DecisaoDoDesconto } from "@/components/admin/contratos-preco";
import { aprovadorDoDesconto, ehAprovador } from "@/lib/contratos/contratos";
import { MOTIVOS_DE_DESCONTO, ehMotivoDeDesconto, porcentagem, valorDoContrato } from "@/lib/contratos/preco";

/**
 * A FICHA DE CONTRATO DE UM CLIENTE (02/10/2026), a tela que o Bruno usa:
 * vigência e prazo (com o alerta de 60, 30 e 7 dias), uso no ciclo (créditos,
 * gravações, posts publicados), quanto ele já pagou (LTV, pelo Stripe e pelo
 * extrato), chamados e reclamações, e cada contrato com as ações e a trilha de
 * auditoria. Tudo em gráfico, no padrão do painel.
 */

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }) : "a definir");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const NOME_DO_EVENTO: Record<string, string> = {
  criado: "Contrato criado",
  renovacao_criada: "Renovação criada",
  aguardando_provedor: "Envio pedido: aguardando provedor de assinatura",
  envio_barrado_minuta: "Envio barrado: o modelo ainda é minuta",
  enviado: "Enviado para assinatura",
  erro_no_envio: "Erro no envio ao provedor",
  assinado: "Assinado",
  recusado_pelo_signatario: "Recusado por quem assina",
  pdf_anexado: "PDF assinado anexado",
  cancelado: "Cancelado",
  renovado: "Renovado",
  situacao: "Situação atualizada pelo relógio",
  aviso_d60: "Aviso de 60 dias enviado",
  aviso_d30: "Aviso de 30 dias enviado",
  aviso_d7: "Aviso de 7 dias enviado",
  aviso_vencido: "Aviso de vencido enviado",
  pagamento_registrado: "Pagamento registrado",
  link_de_pagamento: "Link de pagamento do Stripe gerado",
  conta_ativada: "Conta ativada: plano, créditos e boas-vindas",
  onboarding_iniciado: "Onboarding iniciado (setup do projeto)",
  onboarding_agendado: "Onboarding agendado pelo cliente",
  onboarding_remarcado: "Onboarding remarcado",
  onboarding_cancelado: "Onboarding cancelado",
  creditos_repostos: "Créditos do ciclo repostos",
  desconto_concedido: "Desconto concedido",
  desconto_pede_aprovacao: "Desconto acima do teto: pedida a aprovação de um sócio",
  desconto_aprovado: "Desconto aprovado pelo dono",
  desconto_recusado: "Desconto recusado pelo dono",
  envio_barrado_desconto: "Envio barrado: desconto sem aprovação",
  nova_versao: "Versão nova do contrato",
  envio_cancelado: "Envio anterior cancelado no provedor",
  erro_no_cancelamento_do_envio: "Erro ao cancelar o envio anterior",
  aditivo_criado: "Aditivo criado",
  aditivo_enviado: "Aditivo enviado para assinatura",
  aditivo_assinado: "Aditivo assinado",
  aditivo_pagamento: "Pagamento do aditivo registrado",
  aditivo_link_de_pagamento: "Link de pagamento do aditivo gerado",
  aditivo_aplicado: "Aditivo aplicado na conta",
  aditivo_cancelado: "Aditivo cancelado",
};

const NOME_DO_STATUS_DO_ADITIVO: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado para assinatura",
  aguardando_pagamento: "Assinado, aguardando pagamento da diferença",
  aplicado: "Assinado e aplicado na conta",
  cancelado: "Cancelado",
};

const motivo = (m: string | null) => (ehMotivoDeDesconto(m) ? MOTIVOS_DE_DESCONTO[m] : (m ?? ""));

/** O detalhe que vale mostrar na trilha, em uma linha (04/10). */
function resumoDoEvento(tipo: string, d: unknown): string {
  const x = (d ?? {}) as Record<string, unknown>;
  if (tipo === "pagamento_registrado") return `${String(x.valor ?? "")} por ${NOME_DA_FORMA[String(x.forma)] ?? String(x.forma ?? "")}${x.comComprovante ? ", com comprovante" : ""}`;
  if (tipo === "conta_ativada") return `plano ${String(x.plano ?? "")}, ${Number(x.creditos ?? 0).toLocaleString("pt-BR")} créditos, boas-vindas ${String(x.boasVindas ?? "")}`;
  if (tipo === "criado" && x.contaCriada) return `conta criada para ${String(x.contaCriada)}`;
  if (tipo === "onboarding_agendado" || tipo === "onboarding_remarcado")
    return `${quando(String(x.inicio))} (horário de Brasília), com ${String(x.pessoa ?? "")}`;
  if (tipo === "onboarding_cancelado") return `era ${quando(String(x.inicio))}, cancelado ${x.por === "painel" ? "pelo painel" : "pelo cliente"}`;
  if (tipo === "cancelado" && x.motivo) return String(x.motivo);
  if (tipo === "desconto_concedido" || tipo === "desconto_pede_aprovacao" || tipo === "desconto_aprovado")
    return `${String(x.percentual ?? "")} (${motivo((x.motivo as string) ?? null).toLowerCase()}), tabela ${String(x.tabela ?? "")}, final ${String(x.final ?? "")}${x.onde && x.onde !== "contrato" ? `, ${String(x.onde)}` : ""}`;
  if (tipo === "desconto_recusado") return String(x.motivo ?? "");
  if (tipo === "nova_versao") return `versão ${String(x.de)} para ${String(x.para)}; mudou: ${Array.isArray(x.mudou) ? (x.mudou as string[]).join(", ") : ""}`;
  if (tipo === "envio_cancelado") return String(x.motivo ?? "");
  if (tipo === "aditivo_criado") return `nº ${String(x.ordem)}: de ${String(x.de)} para ${String(x.para)}; diferença ${String(x.diferenca)}`;
  if (tipo === "aditivo_pagamento") return `nº ${String(x.ordem)}: ${String(x.valor ?? "")} por ${NOME_DA_FORMA[String(x.forma)] ?? String(x.forma ?? "")}`;
  if (tipo === "aditivo_aplicado") return `nº ${String(x.ordem)}: plano ${String(x.plano)}, ${String(x.acessosExtras)} extra(s), ${Number(x.creditos ?? 0).toLocaleString("pt-BR")} créditos somados`;
  if ((tipo === "aditivo_enviado" || tipo === "aditivo_assinado" || tipo === "aditivo_cancelado") && x.ordem) return `nº ${String(x.ordem)}`;
  return "";
}

export default async function FichaDeContratoPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const { userId } = await params;
  const f = await fichaDoCliente(userId);
  if (!f) notFound();
  const provedor = provedorDeAssinatura();
  const eu = await exigirAdmin();
  const souDono = eu ? ehAprovador(eu) : false;
  const aprovador = aprovadorDoDesconto();
  // O contrato que vale HOJE vem antes do assinado que ainda vai começar (a
  // renovação já assinada não esconde o aviso do contrato que está vencendo).
  const atual =
    f.contratos.find((c) => c.situacao === "vigente" || c.situacao === "a_vencer") ??
    f.contratos.find((c) => c.situacao === "assinado") ??
    f.contratos.find((c) => c.situacao === "aguardando_pagamento") ??
    f.contratos.find((c) => c.situacao === "vencido") ??
    f.contratos[0] ??
    null;
  const dias = atual?.dias ?? null;
  const alerta =
    atual && (atual.situacao === "a_vencer" || atual.situacao === "vencido")
      ? dias !== null && dias <= 0
        ? { cor: "var(--badge-danger-text)", texto: `O contrato nº ${String(atual.numero).padStart(4, "0")} venceu em ${data(atual.fim)}.` }
        : { cor: dias !== null && dias <= 7 ? "var(--badge-danger-text)" : "var(--marca-laranja-texto)", texto: `Faltam ${dias} dias para o contrato nº ${String(atual.numero).padStart(4, "0")} vencer (${data(atual.fim)}).` }
      : null;
  const ch = f.chamados.porStatus;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5" data-ficha-de-contrato={userId}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="rotulo mb-1">Contrato do cliente</p>
          <h1 className="text-2xl font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {atual?.empresa ?? f.conta.nome ?? f.conta.email}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {f.conta.email} · plano {f.conta.plano} · cliente desde {data(f.conta.desde)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/contratos?conta=${userId}`} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-sm font-semibold text-white">
            Novo contrato
          </Link>
          <Link href="/admin/contratos" className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
            Todos os contratos
          </Link>
        </div>
      </header>

      {atual?.situacao === "aguardando_pagamento" && (
        <p className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--painel-2)", color: "var(--marca-laranja-texto)", background: "var(--bg-elevated)" }} data-aguarda-pagamento>
          O contrato nº {String(atual.numero).padStart(4, "0")} está assinado e aguarda pagamento de {centavosEmReais(atual.valorCentavos - atual.pagoCentavos)}. Até o pagamento ser registrado, esta conta
          não entra na plataforma.
        </p>
      )}

      {alerta && (
        <p className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: alerta.cor, color: alerta.cor, background: "var(--bg-elevated)" }} data-alerta-de-vencimento>
          {alerta.texto} {atual?.renovacaoAutomatica ? "A renovação é automática." : "A renovação não é automática."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero
          rotulo="Vigência"
          valor={atual ? NOME_DO_STATUS_DO_CONTRATO[atual.situacao] : "sem contrato"}
          nota={
            atual
              ? atual.inicio
                ? `${data(atual.inicio)} a ${data(atual.fim)}${dias !== null && dias > 0 ? `, faltam ${dias} dias` : ""}`
                : "12 meses a partir da confirmação do pagamento"
              : "crie o primeiro contrato"
          }
        >
          {atual && <Medidor valor={Math.round(fracaoDaVigencia({ status: atual.status, inicioVigencia: atual.inicio, fimVigencia: atual.fim }) * 365)} teto={365} rotulo="Dias da vigência já passados" />}
        </Numero>
        <Numero rotulo="Créditos no ciclo" valor={`${f.uso.creditosUsados.toLocaleString("pt-BR")}`} nota={f.uso.cotaDeCreditos ? `de ${f.uso.cotaDeCreditos.toLocaleString("pt-BR")} do plano · saldo ${f.uso.saldo.toLocaleString("pt-BR")}` : `saldo ${f.uso.saldo.toLocaleString("pt-BR")}`}>
          <Medidor valor={f.uso.creditosUsados} teto={Math.max(1, f.uso.cotaDeCreditos)} rotulo="Créditos usados no ciclo contra a cota" />
        </Numero>
        <Numero rotulo="Gravações no ciclo" valor={String(f.uso.gravacoes)} nota={f.uso.cotaDeGravacoes ? `de ${f.uso.cotaDeGravacoes} por mês` : "sem cota de plano"}>
          <Medidor valor={f.uso.gravacoes} teto={Math.max(1, f.uso.cotaDeGravacoes)} rotulo="Gravações no ciclo contra a cota" />
        </Numero>
        <Numero rotulo="Posts publicados" valor={String(f.uso.publicadosNoCiclo)} nota={`no ciclo desde ${data(f.uso.cicloDesde)} · ${f.uso.publicadosTotal} no total`}>
          <BarraEmpilhada
            rotulo="Posts publicados"
            partes={[
              { nome: "No ciclo", valor: f.uso.publicadosNoCiclo, cor: "var(--painel-1)" },
              { nome: "Antes", valor: Math.max(0, f.uso.publicadosTotal - f.uso.publicadosNoCiclo), cor: "var(--painel-neutro)" },
            ]}
          />
        </Numero>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Cartao
          titulo="Quanto já pagou (LTV)"
          subtitulo={`${f.ltv.leuStripe ? "Cobranças pagas no Stripe, menos devoluções; os pacotes de vídeo saem do extrato." : "Sem Stripe ligado a esta conta (ou sem resposta): o extrato de pacotes."}${f.ltv.porFora > 0 ? ` Inclui ${reais(f.ltv.porFora)} de contrato pago por fora do Stripe.` : ""}`}
        >
          <Rosca
            centro={reais(f.ltv.total)}
            rotuloDoCentro="pago no total"
            formatar={(n) => reais(n)}
            fatias={[
              { nome: "Assinatura e contrato", valor: f.ltv.assinatura, cor: "var(--painel-1)" },
              { nome: "Pacotes de vídeo", valor: f.ltv.pacotes, cor: "var(--painel-3)" },
            ]}
            vazio={{ titulo: "Nada pago ainda", texto: "Quando a primeira cobrança for paga, ela aparece aqui separada por origem." }}
          />
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            Valor dos contratos assinados: <strong style={{ color: "var(--text-primary)" }}>{reais(f.ltv.contratado)}</strong>
          </p>
        </Cartao>
        <Cartao
          titulo="Chamados e reclamações"
          subtitulo="Todos os chamados desta conta. Reclamação é cobrança, problema técnico ou o que foi marcado à mão."
          acao={
            <Link href={`/admin/chamados?conta=${userId}`} className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              Ver os chamados
            </Link>
          }
        >
          {ch.aberto + ch.andamento + ch.resolvido > 0 ? (
            <>
              <BarraEmpilhada
                rotulo="Chamados por situação"
                partes={[
                  { nome: "Abertos", valor: ch.aberto, cor: "var(--painel-2)" },
                  { nome: "Em andamento", valor: ch.andamento, cor: "var(--painel-3)" },
                  { nome: "Resolvidos", valor: ch.resolvido, cor: "var(--painel-1)" },
                ]}
              />
              <div className="mt-4">
                <BarrasHorizontais
                  linhas={[
                    { nome: "Reclamações", valor: f.chamados.reclamacoes, cor: "var(--badge-danger-text)" },
                    { nome: "Dúvidas e sugestões", valor: (f.chamados.porCategoria.duvida ?? 0) + (f.chamados.porCategoria.sugestao ?? 0) },
                  ]}
                />
              </div>
            </>
          ) : (
            <Vazio compacto titulo="Nenhum chamado" texto="Os chamados que esta conta abrir pela Ajuda aparecem aqui." />
          )}
        </Cartao>
      </div>

      <Cartao titulo="Contratos" subtitulo={`Assinatura eletrônica: ${provedor ? `${provedor.nome}, ${provedor.ambiente === "teste" ? "ambiente de teste" : "produção"}` : "aguardando provedor (falta ZAPSIGN_API_TOKEN)"}. Cada ação fica na trilha.`}>
        {f.contratos.length === 0 ? (
          <Vazio titulo="Nenhum contrato para esta conta" texto="Crie pelo botão Novo contrato. Ele nasce como rascunho." />
        ) : (
          <ul className="space-y-4">
            {f.contratos.map((c) => (
              <li key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }} data-contrato-da-ficha={c.numero}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      nº {String(c.numero).padStart(4, "0")} · {c.plano} · {centavosEmReais(c.valorCentavos)} por ano
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {c.inicio ? `${data(c.inicio)} a ${data(c.fim)}` : "vigência começa na confirmação do pagamento"} · renovação {c.renovacaoAutomatica ? "automática" : "manual"}
                      {c.fim && c.pagoEm ? ` em ${data(c.fim)}` : ""}
                      {c.formaDePagamento ? ` · ${c.formaDePagamento}` : ""}
                      {c.assinadoEm ? ` · assinado em ${data(c.assinadoEm)}` : ""}
                      {c.acessosExtras > 0 ? ` · ${c.acessosExtras} acesso(s) extra(s)` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Quem assina: {c.signatarioNome ?? "?"} ({c.signatarioEmail ?? "?"}){c.signatarioDocumento ? `, ${c.signatarioDocumento}` : ""}
                      {c.modeloVersao ? ` · modelo ${c.modeloVersao}` : ""}
                      {c.textoHash ? ` · texto ${c.textoHash.slice(0, 10)}` : ""}
                      {c.versao > 1 ? ` · versão ${c.versao}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: COR_DO_STATUS_DO_CONTRATO[c.situacao] }} />
                    {NOME_DO_STATUS_DO_CONTRATO[c.situacao]}
                    {c.provedorSituacao === "aguardando_provedor" ? " · aguardando provedor" : c.provedorSituacao ? ` · ${c.provedor ?? "provedor"}: ${c.provedorSituacao}` : ""}
                  </span>
                </div>
                {c.precoTabelaCentavos ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border px-3 py-2 text-sm sm:grid-cols-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-preco-do-contrato={c.numero}>
                    <div>
                      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Preço de tabela
                      </dt>
                      <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {centavosEmReais(c.precoTabelaCentavos)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Desconto
                      </dt>
                      <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {c.descontoCentavos > 0 ? `${porcentagem(c.descontoPercentual)}, menos ${centavosEmReais(c.descontoCentavos)}` : "nenhum"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Valor anual final
                      </dt>
                      <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {centavosEmReais(c.valorCentavos)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Motivo e quem concedeu
                      </dt>
                      <dd className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {c.descontoCentavos > 0 ? `${motivo(c.descontoMotivo)} · ${c.descontoConcedidoPor ?? "?"}` : "sem desconto"}
                        {c.descontoAprovadoPor ? ` · aprovado por ${c.descontoAprovadoPor}` : ""}
                        {c.fundador ? " · Fundador (5.6)" : ""}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {(() => {
                  // O contrato assinado não muda; o que vale HOJE é o último aditivo aplicado.
                  const vale = c.aditivos.find((a) => a.status === "aplicado");
                  return vale ? (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }} data-vale-hoje={c.numero}>
                      Vale hoje, pelo aditivo nº {vale.ordem}: {vale.plano}, {vale.acessosExtras} acesso(s) extra(s), {centavosEmReais(vale.valorAnualCentavos)} por ano
                      {vale.fundador ? ", Fundador" : ""}.
                    </p>
                  ) : null;
                })()}
                {c.esperaAprovacao && (
                  <div className="mt-3">
                    <DecisaoDoDesconto url={`/api/admin/contratos/${c.id}`} souDono={souDono} aprovador={aprovador} percentual={c.descontoPercentual} />
                  </div>
                )}
                {c.inicio && c.fim && (
                  <div className="mt-3">
                    <Medidor valor={Math.round(fracaoDaVigencia({ status: c.status, inicioVigencia: c.inicio, fimVigencia: c.fim }) * 365)} teto={365} rotulo={`Vigência do contrato ${c.numero}`} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AcoesDoContrato
                    id={c.id}
                    status={c.situacao}
                    temProvedor={Boolean(provedor)}
                    provedorSituacao={c.provedorSituacao}
                    faltaCentavos={Math.max(0, c.valorCentavos - c.pagoCentavos)}
                    linkDePagamento={c.linkDePagamento}
                    edicao={
                      c.situacao === "rascunho" || c.situacao === "enviado"
                        ? {
                            inicial: valorDoContrato(c),
                            dados: { empresa: c.empresa, signatarioNome: c.signatarioNome, signatarioEmail: c.signatarioEmail, signatarioDocumento: c.signatarioDocumento, inicio: c.inicioIso },
                          }
                        : null
                    }
                    aditivo={
                      c.ativadoEm && c.inicio && c.fim && c.situacao !== "cancelado" && c.situacao !== "vencido" && !c.aditivos.some((a) => ["rascunho", "enviado", "aguardando_pagamento"].includes(a.status))
                        ? (() => {
                            const ultimo = c.aditivos.find((a) => a.status === "aplicado");
                            const base = ultimo
                              ? { planoId: ultimo.planoId, acessosExtras: ultimo.acessosExtras, valor: ultimo.valorAnualCentavos, nome: ultimo.plano, fundador: ultimo.fundador }
                              : { planoId: c.planoId, acessosExtras: c.acessosExtras, valor: c.valorCentavos, nome: c.plano, fundador: c.fundador };
                            return {
                              atual: {
                                ...valorDoContrato({ ...c, planoId: base.planoId, acessosExtras: base.acessosExtras, fundador: base.fundador, ...(ultimo ? { descontoTipo: null, descontoValor: null, descontoMotivo: null, descontoObservacao: null } : {}) }),
                                valorAnualCentavos: base.valor,
                                nomeDoPlano: base.nome,
                              },
                              vigencia: { inicio: c.inicio, fim: c.fim },
                            };
                          })()
                        : null
                    }
                  />
                  {c.temPdf && (
                    <a href={`/api/admin/contratos/${c.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                      PDF assinado
                    </a>
                  )}
                  {c.linkDeAssinatura && c.situacao === "enviado" && (
                    <a href={c.linkDeAssinatura} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                      link de assinatura
                    </a>
                  )}
                </div>
                {c.aditivos.length > 0 && (
                  <div className="mt-3 space-y-2" data-aditivos-do-contrato={c.numero}>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      Aditivos ({c.aditivos.length})
                    </p>
                    {c.aditivos.map((a) => (
                      <div key={a.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-aditivo={a.ordem}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            Aditivo nº {a.ordem}: {a.de.plano} para {a.plano}
                            {a.de.acessosExtras !== a.acessosExtras ? `, ${a.de.acessosExtras} para ${a.acessosExtras} acesso(s) extra(s)` : ""}
                          </p>
                          <span className="text-xs font-semibold" style={{ color: a.status === "aplicado" ? "var(--painel-1)" : a.status === "cancelado" ? "var(--text-muted)" : "var(--marca-laranja-texto)" }}>
                            {NOME_DO_STATUS_DO_ADITIVO[a.status] ?? a.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          Valor anual {centavosEmReais(a.de.valorAnualCentavos)} para {centavosEmReais(a.valorAnualCentavos)} (tabela {centavosEmReais(a.precoTabelaCentavos)}
                          {a.descontoCentavos > 0 ? `, desconto ${porcentagem(a.descontoPercentual)} ${motivo(a.descontoMotivo).toLowerCase()} por ${a.descontoConcedidoPor ?? "?"}` : ", sem desconto"}) · vale desde {data(a.valeDesde)} ·{" "}
                          {a.diferencaCentavos > 0
                            ? `diferença a pagar ${centavosEmReais(a.diferencaCentavos)} (${a.diasRestantes} dias)${a.pagoCentavos > 0 ? `, pago ${centavosEmReais(a.pagoCentavos)}` : ""}`
                            : a.diferencaCentavos < 0
                              ? `crédito de ${centavosEmReais(-a.diferencaCentavos)} na renovação`
                              : "sem diferença"}
                          {a.assinadoEm ? ` · assinado em ${data(a.assinadoEm)}` : ""}
                          {a.aplicadoEm ? ` · aplicado em ${data(a.aplicadoEm)}` : ""}
                          {a.motivoCancelamento ? ` · cancelado: ${a.motivoCancelamento}` : ""}
                        </p>
                        {a.esperaAprovacao && (
                          <div className="mt-2">
                            <DecisaoDoDesconto url={`/api/admin/contratos/${c.id}/aditivos/${a.id}`} souDono={souDono} aprovador={aprovador} percentual={a.descontoPercentual} />
                          </div>
                        )}
                        <div className="mt-2">
                          <AcoesDoAditivo
                            contratoId={c.id}
                            id={a.id}
                            status={a.status}
                            assinado={Boolean(a.assinadoEm)}
                            faltaCentavos={Math.max(0, a.diferencaCentavos - a.pagoCentavos)}
                            temProvedor={Boolean(provedor)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(c.pagamentos.length > 0 || c.situacao === "aguardando_pagamento") && (
                  <div className="mt-3" data-pagamentos-do-contrato={c.numero}>
                    <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      Pago {centavosEmReais(c.pagoCentavos)} de {centavosEmReais(c.valorCentavos)}
                      {c.valorCentavos > c.pagoCentavos ? (
                        <span style={{ color: "var(--marca-laranja-texto)" }}> · a receber {centavosEmReais(c.valorCentavos - c.pagoCentavos)}</span>
                      ) : null}
                    </p>
                    <div
                      className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--bg-elevated)" }}
                      role="img"
                      aria-label={`Pago ${centavosEmReais(c.pagoCentavos)} de ${centavosEmReais(c.valorCentavos)}`}
                    >
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.pagoCentavos / Math.max(1, c.valorCentavos)) * 100)}%`, background: "var(--painel-1)" }} />
                    </div>
                    {c.pagamentos.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {c.pagamentos.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                              {centavosEmReais(p.valorCentavos)}
                            </span>
                            <span>
                              em {data(p.pagoEm)} · {NOME_DA_FORMA[p.forma] ?? p.forma} · registrado por {p.autor ?? "?"}
                              {p.observacao ? ` · ${p.observacao}` : ""}
                            </span>
                            {p.temComprovante && (
                              <a href={`/api/admin/contratos/${c.id}/comprovante/${p.id}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--text-primary)" }}>
                                comprovante
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.linkDePagamento && c.situacao === "aguardando_pagamento" && (
                      <p className="mt-1 text-xs break-all" style={{ color: "var(--text-muted)" }}>
                        Link de pagamento do Stripe: {c.linkDePagamento}
                      </p>
                    )}
                    {/* A CONDIÇÃO PARCELADA (05/10): a entrada (por fora, registrada
                        com o comprovante acima, ou no cartão pelo link) e o restante
                        (recorrência, parcelado pelo emissor ou à vista) pelos links
                        que não vencem, para o vendedor copiar e mandar. */}
                    {c.parcelado && (
                      <div className="mt-2 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-condicao-parcelada>
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          Condição: {c.parcelado.porExtenso}
                        </p>
                        <ul className="mt-1 space-y-0.5" style={{ color: "var(--text-muted)" }}>
                          <li data-entrada-do-parcelado>
                            Entrada ({c.parcelado.nomeDaFormaDaEntrada}): {centavosEmReais(c.parcelado.entradaPagaCentavos)} de {centavosEmReais(c.parcelado.entradaCentavos)}{" "}
                            {c.parcelado.entradaOk
                              ? "· paga"
                              : c.parcelado.formaDaEntrada === "cartao_stripe"
                                ? `· falta ${centavosEmReais(c.parcelado.entradaCentavos - c.parcelado.entradaPagaCentavos)} (o cliente paga pelo link da entrada)`
                                : `· falta ${centavosEmReais(c.parcelado.entradaCentavos - c.parcelado.entradaPagaCentavos)}: registre o comprovante`}
                          </li>
                          <li data-restante-do-parcelado>
                            Restante ({c.parcelado.nomeDaFormaDoRestante}):{" "}
                            {c.parcelado.formaDoRestante === "cartao_recorrente"
                              ? c.parcelado.cartaoCadastrado
                                ? `cartão cadastrado · ${c.parcelado.parcelasPagas} de ${c.parcelado.parcelas} parcelas de ${centavosEmReais(c.parcelado.parcelaCentavos)} pagas`
                                : `${c.parcelado.parcelas} parcelas de ${centavosEmReais(c.parcelado.parcelaCentavos)} · cartão ainda não cadastrado pelo cliente`
                              : c.parcelado.restanteOk
                                ? `${centavosEmReais(c.parcelado.restanteCentavos)} · pago`
                                : `${centavosEmReais(c.parcelado.restantePagoCentavos)} de ${centavosEmReais(c.parcelado.restanteCentavos)} · falta o cliente pagar pelo link do restante`}
                          </li>
                          {c.parcelado.parcelaEmAtrasoDesde && (
                            <li style={{ color: "var(--badge-danger-text)" }}>Parcela em atraso desde {data(c.parcelado.parcelaEmAtrasoDesde)}: o Stripe tenta de novo sozinho; se não entrar, fale com o cliente.</li>
                          )}
                        </ul>
                        {c.parcelado.links.entrada && (
                          <p className="mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                            Link da entrada (não vence, vai no contrato e no e-mail):{" "}
                            <a href={c.parcelado.links.entrada} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--text-primary)" }}>
                              {c.parcelado.links.entrada}
                            </a>
                          </p>
                        )}
                        <p className="mt-1 break-all" style={{ color: "var(--text-muted)" }}>
                          Link do restante (não vence, vai no contrato e no e-mail):{" "}
                          <a href={c.parcelado.links.restante} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--text-primary)" }}>
                            {c.parcelado.links.restante}
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {c.motivoCancelamento && (
                  <p className="mt-2 text-xs" style={{ color: "var(--badge-danger-text)" }}>
                    Cancelado: {c.motivoCancelamento}
                  </p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    Trilha de auditoria ({c.eventos.length})
                  </summary>
                  <ol className="mt-2 space-y-1">
                    {c.eventos.map((e) => (
                      <li key={e.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span className="tabular-nums">{quando(e.em)}</span> · {NOME_DO_EVENTO[e.tipo] ?? e.tipo} · {e.autor ?? "?"}
                        {resumoDoEvento(e.tipo, e.detalhe) ? ` · ${resumoDoEvento(e.tipo, e.detalhe)}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
