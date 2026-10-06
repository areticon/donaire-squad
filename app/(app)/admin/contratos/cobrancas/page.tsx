export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { automaticoLigado, listaDeCobrancas, opcoesDeCloser, resumoDasCobrancas } from "@/lib/contratos/cobrancas";
import { CADENCIA_PADRAO, MOTIVOS_DA_COBRANCA, NOME_DO_MOTIVO, TETO_DO_AUTOMATICO_EM_DIAS } from "@/lib/contratos/fup";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { Cartao, Numero, Vazio } from "@/components/admin/painel-graficos";
import { CobrancaDoContrato } from "@/components/admin/contratos-cobrancas";

/**
 * A ABA DE COBRANÇAS (05/10/2026): os contratos enviados e sem assinatura, os
 * assinados sem pagamento e os com parcela em atraso, ordenados pelo
 * acompanhamento (FUP, follow-up) mais vencido e pelo tempo sem resposta,
 * com o telefone do cliente, o closer e os botões que registram cada
 * acompanhamento. Só admin.
 */
export default async function CobrancasPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const sp = await searchParams;
  const agora = new Date();
  const [todas, closers] = await Promise.all([listaDeCobrancas(agora), opcoesDeCloser()]);
  const resumo = resumoDasCobrancas(todas);
  const motivo = (MOTIVOS_DA_COBRANCA as readonly string[]).includes(sp.motivo ?? "") ? (sp.motivo as (typeof MOTIVOS_DA_COBRANCA)[number]) : null;
  const lista = motivo ? todas.filter((c) => c.motivo === motivo) : todas;
  const cadencia = `D+${CADENCIA_PADRAO.dias.join(", D+")} depois do envio, e a cada ${CADENCIA_PADRAO.depois} dias até ${TETO_DO_AUTOMATICO_EM_DIAS} dias`;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5" data-cobrancas>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo mb-1">Gestão</p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Cobranças
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Contratos enviados sem assinatura, assinados sem pagamento e parcelas em atraso. Cadência do acompanhamento: {cadencia}. E-mail automático{" "}
            {automaticoLigado() ? "ligado, em horário comercial" : "desligado (COBRANCAS_FUP_AUTOMATICO=0)"}; WhatsApp automático ainda não (o botão abre a mensagem pronta no celular do vendedor).
          </p>
        </div>
        <Link href="/admin/contratos" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar aos contratos
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero rotulo="Em cobrança" valor={String(resumo.total)} nota={`${centavosEmReais(resumo.valorCentavos)} por ano em jogo`} />
        <Numero rotulo="Acompanhamento vencido" valor={String(resumo.vencidas)} nota={resumo.vencidas ? "o vendedor precisa falar com o cliente hoje" : "ninguém atrasado"} />
        <Numero rotulo="Sem telefone" valor={String(resumo.semTelefone)} nota="informe o contato na própria cobrança" />
        <Numero rotulo="Sem assinatura" valor={String(todas.filter((c) => c.motivo === "assinatura").length)} nota={`${todas.filter((c) => c.motivo === "entrada").length} sem pagamento · ${todas.filter((c) => c.motivo === "parcela").length} parcela(s) em atraso`} />
      </div>

      <Cartao titulo={motivo ? `Cobranças: ${NOME_DO_MOTIVO[motivo].toLowerCase()}` : "Todas as cobranças"} subtitulo="Da mais atrasada para a mais recente. Ligar, WhatsApp e E-mail agora registram o acompanhamento na trilha do contrato.">
        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Filtrar por motivo" data-filtros-de-cobranca>
          {[null, ...MOTIVOS_DA_COBRANCA].map((m) => {
            const ativo = m === motivo;
            const n = m ? todas.filter((c) => c.motivo === m).length : todas.length;
            return (
              <Link
                key={m ?? "todas"}
                href={m ? `/admin/contratos/cobrancas?motivo=${m}` : "/admin/contratos/cobrancas"}
                aria-current={ativo ? "page" : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                style={ativo ? { borderColor: "var(--text-primary)", color: "var(--text-primary)", background: "var(--realce-2)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {m ? NOME_DO_MOTIVO[m] : "Todas"}
                <span className="tabular-nums">{n}</span>
              </Link>
            );
          })}
        </nav>
        {lista.length === 0 ? (
          <Vazio titulo="Nenhuma cobrança" texto={motivo ? "Nenhum contrato neste motivo." : "Contrato enviado sem assinatura, assinado sem pagamento ou com parcela em atraso aparece aqui, com o próximo acompanhamento previsto."} />
        ) : (
          <ul className="space-y-2">
            {lista.map((c) => (
              <li key={c.contratoId}>
                <CobrancaDoContrato cobranca={c} closers={closers} comLinkDaFicha />
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
