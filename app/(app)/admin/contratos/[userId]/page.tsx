export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { reais } from "@/lib/admin/tipos-do-painel";
import { fichaDoCliente } from "@/lib/contratos/painel";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { COR_DO_STATUS_DO_CONTRATO, NOME_DO_STATUS_DO_CONTRATO, centavosEmReais, fracaoDaVigencia } from "@/lib/contratos/situacao";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Medidor, Numero, Rosca, Vazio } from "@/components/admin/painel-graficos";
import { AcoesDoContrato } from "@/components/admin/contratos-acoes";

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
};

export default async function FichaDeContratoPage({ params }: { params: Promise<{ userId: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const { userId } = await params;
  const f = await fichaDoCliente(userId);
  if (!f) notFound();
  const provedor = provedorDeAssinatura();
  // O contrato que vale HOJE vem antes do assinado que ainda vai começar (a
  // renovação já assinada não esconde o aviso do contrato que está vencendo).
  const atual =
    f.contratos.find((c) => c.situacao === "vigente" || c.situacao === "a_vencer") ??
    f.contratos.find((c) => c.situacao === "assinado") ??
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

      {alerta && (
        <p className="rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: alerta.cor, color: alerta.cor, background: "var(--bg-elevated)" }} data-alerta-de-vencimento>
          {alerta.texto} {atual?.renovacaoAutomatica ? "A renovação é automática." : "A renovação não é automática."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero
          rotulo="Vigência"
          valor={atual ? NOME_DO_STATUS_DO_CONTRATO[atual.situacao] : "sem contrato"}
          nota={atual ? `${data(atual.inicio)} a ${data(atual.fim)}${dias !== null && dias > 0 ? `, faltam ${dias} dias` : ""}` : "crie o primeiro contrato"}
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
        <Cartao titulo="Quanto já pagou (LTV)" subtitulo={f.ltv.leuStripe ? "Cobranças pagas no Stripe, menos devoluções; os pacotes de vídeo saem do extrato." : "Sem Stripe ligado a esta conta (ou sem resposta): só o extrato de pacotes."}>
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
                      {data(c.inicio)} a {data(c.fim)} · renovação {c.renovacaoAutomatica ? "automática" : "manual"}
                      {c.formaDePagamento ? ` · ${c.formaDePagamento}` : ""}
                      {c.assinadoEm ? ` · assinado em ${data(c.assinadoEm)}` : ""}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Quem assina: {c.signatarioNome ?? "?"} ({c.signatarioEmail ?? "?"}){c.signatarioDocumento ? `, ${c.signatarioDocumento}` : ""}
                      {c.modeloVersao ? ` · modelo ${c.modeloVersao}` : ""}
                      {c.textoHash ? ` · texto ${c.textoHash.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: COR_DO_STATUS_DO_CONTRATO[c.situacao] }} />
                    {NOME_DO_STATUS_DO_CONTRATO[c.situacao]}
                    {c.provedorSituacao === "aguardando_provedor" ? " · aguardando provedor" : c.provedorSituacao ? ` · ${c.provedor ?? "provedor"}: ${c.provedorSituacao}` : ""}
                  </span>
                </div>
                {c.inicio && c.fim && (
                  <div className="mt-3">
                    <Medidor valor={Math.round(fracaoDaVigencia({ status: c.status, inicioVigencia: c.inicio, fimVigencia: c.fim }) * 365)} teto={365} rotulo={`Vigência do contrato ${c.numero}`} />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AcoesDoContrato id={c.id} status={c.situacao} temProvedor={Boolean(provedor)} provedorSituacao={c.provedorSituacao} />
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
