export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { dadosDeExemplo, pedidosAoDev, type PedidosAoDev } from "@/lib/feedback/painel";
import { Numero } from "@/components/admin/painel-graficos";
import { PedidosAoDevLista } from "@/components/admin/pedidos-ao-dev";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import { AGENTE_DEV } from "@/lib/squad/estado-do-squad";

/**
 * DEV: O QUE OS CLIENTES ESTÃO PEDINDO (06/10/2026), o painel do Davi Dev.
 *
 * Pedido do Bruno: "ele tem que dizer: esta semana teve cinco clientes
 * pedindo para ajustar isso. Ele entende, pede a minha aprovação (sou o
 * administrador) e aí eu libero." Lista por grupo (o JEV agrupa), com
 * clientes e ocorrências na semana e no mês, a classificação, os exemplos sem
 * nome, e os botões "Aprovar melhoria" (grava a aprovação e o Davi escreve o
 * briefing) e "Não é produto" (descarta). Só admin, 404 para o resto.
 *
 * `?exemplo=1`, só fora de produção: dados de exemplo para olhar a tela antes
 * de a migração existir no banco.
 */
export default async function DevDoAdminPage({ searchParams }: { searchParams: Promise<{ exemplo?: string }> }) {
  if (!(await exigirAdmin())) notFound();
  const sp = await searchParams;
  const exemplo = sp.exemplo === "1" && process.env.NODE_ENV !== "production";
  let dados: PedidosAoDev;
  let semTabela = false;
  if (exemplo) dados = dadosDeExemplo();
  else {
    try {
      dados = await pedidosAoDev();
    } catch (e) {
      // A migração ainda não entrou: a tela diz isso em vez de cair.
      console.error("[admin/dev] leitura falhou:", e instanceof Error ? e.message : e);
      semTabela = true;
      dados = { grupos: [], semClasse: [], resumo: { semana: { feedbacks: 0, clientes: 0, errosDoProduto: 0 }, mes: { feedbacks: 0, clientes: 0, errosDoProduto: 0 }, aguardando: 0, aprovados: 0 } };
    }
  }
  const r = dados.resumo;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <AvatarDoAgente agenteId={AGENTE_DEV.id} tamanho={48} />
          <div>
            <p className="rotulo mb-1">Dev da Demandou</p>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              Dev: o que os clientes estão pedindo
            </h1>
            <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--text-muted)" }}>
              Todo pedido do chat das peças e todo chamado viram feedback. O JEV classifica (erro do produto, pedido de gosto, atendido como
              pedido, dúvida de uso) e agrupa os parecidos. Só o erro do produto melhora a plataforma: você aprova, o Davi escreve o briefing de
              desenvolvimento, e o time executa. Ninguém edita código daqui.
              {exemplo ? " Esta tela está com DADOS DE EXEMPLO." : ""}
            </p>
          </div>
        </div>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </header>

      {semTabela && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}>
          A tabela de feedbacks ainda não existe neste banco (a migração 20261006120000_feedbacks_do_produto entra pelo build do deploy). Até lá, nada é perdido:
          o chat e os chamados continuam funcionando, só não registram.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero rotulo="Feedbacks na semana" valor={String(r.semana.feedbacks)} nota={`${r.semana.clientes} ${r.semana.clientes === 1 ? "cliente" : "clientes"} · ${r.mes.feedbacks} no mês`} />
        <Numero rotulo="Erros do produto na semana" valor={String(r.semana.errosDoProduto)} nota={`${r.mes.errosDoProduto} no mês, pela classificação do JEV`} />
        <Numero rotulo="Aguardando a sua aprovação" valor={String(r.aguardando)} nota="grupos de erro do produto ainda sem decisão" />
        <Numero rotulo="Melhorias aprovadas" valor={String(r.aprovados)} nota="com briefing para o time executar" />
      </div>

      <PedidosAoDevLista grupos={dados.grupos} semClasse={dados.semClasse} exemplo={exemplo} />
    </div>
  );
}
