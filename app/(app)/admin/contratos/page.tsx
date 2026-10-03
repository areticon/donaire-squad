export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db/prisma";
import { contratosDoPainel } from "@/lib/contratos/painel";
import { provedorDeAssinatura } from "@/lib/contratos/assinatura";
import { COR_DO_STATUS_DO_CONTRATO, NOME_DO_STATUS_DO_CONTRATO, STATUS_DO_CONTRATO, centavosEmReais } from "@/lib/contratos/situacao";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Numero, Rosca, Vazio } from "@/components/admin/painel-graficos";
import { NovoContrato } from "@/components/admin/contratos-acoes";

/**
 * O GESTOR DE CONTRATOS (02/10/2026), no padrão gráfico do painel: quanto
 * está contratado e em que situação, o que vence nos próximos 60 dias e a
 * lista, que leva à ficha de cada cliente (/admin/contratos/[conta]). Só admin.
 */
export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
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

  const porSituacao = new Map(STATUS_DO_CONTRATO.map((s) => [s, contratos.filter((c) => c.situacao === s)]));
  const emVigor = contratos.filter((c) => c.situacao === "vigente" || c.situacao === "a_vencer");
  const valorEmVigor = emVigor.reduce((s, c) => s + c.valorCentavos, 0);
  const proximos = contratos
    .filter((c) => c.dias !== null && c.dias <= 60 && c.dias > -30 && c.situacao !== "cancelado" && c.situacao !== "rascunho" && c.situacao !== "enviado")
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "a definir");

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
        <Numero rotulo="Em vigor" valor={String(emVigor.length)} nota={`${centavosEmReais(valorEmVigor)} por ano`} />
        <Numero rotulo="A vencer em 60 dias" valor={String(porSituacao.get("a_vencer")?.length ?? 0)} nota="avisos em 60, 30 e 7 dias" />
        <Numero rotulo="Vencidos" valor={String(porSituacao.get("vencido")?.length ?? 0)} nota="sem renovação registrada" />
        <Numero rotulo="Esperando assinatura" valor={String((porSituacao.get("rascunho")?.length ?? 0) + (porSituacao.get("enviado")?.length ?? 0))} nota="rascunhos e enviados" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Cartao className="lg:col-span-2" titulo="Por situação" subtitulo="Valor anual de cada situação. Cancelado e rascunho ficam na conta, para nada sumir.">
          <Rosca
            centro={centavosEmReais(valorEmVigor).replace(",00", "")}
            rotuloDoCentro="em vigor por ano"
            formatar={(n) => centavosEmReais(n).replace(",00", "")}
            fatias={STATUS_DO_CONTRATO.map((s) => ({
              nome: NOME_DO_STATUS_DO_CONTRATO[s],
              valor: (porSituacao.get(s) ?? []).reduce((t, c) => t + c.valorCentavos, 0),
              cor: COR_DO_STATUS_DO_CONTRATO[s],
              nota: `· ${(porSituacao.get(s) ?? []).length}`,
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

      <Cartao titulo="Novo contrato" subtitulo="Nasce como rascunho. Depois, na ficha do cliente, vai para assinatura eletrônica ou é marcado como assinado com o PDF.">
        <NovoContrato contas={contas.map((c) => ({ id: c.id, rotulo: `${c.name ?? "(sem nome)"} · ${c.email} · ${c.plan}`, plano: c.plan }))} contaInicial={sp.conta ?? null} />
      </Cartao>

      <Cartao titulo="Todos os contratos">
        {contratos.length === 0 ? (
          <Vazio titulo="Nenhum contrato" texto="A lista aparece aqui, com a situação calculada pelas datas da vigência." />
        ) : (
          <ul className="space-y-2">
            {contratos.map((c) => (
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
                      {c.plano} · {centavosEmReais(c.valorCentavos)} por ano · {c.email}
                    </span>
                  </span>
                  <span className="text-xs self-center" style={{ color: "var(--text-primary)" }}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: COR_DO_STATUS_DO_CONTRATO[c.situacao] }} />
                    {NOME_DO_STATUS_DO_CONTRATO[c.situacao]}
                    {c.provedorSituacao === "aguardando_provedor" ? " · aguardando provedor" : ""}
                  </span>
                  <span className="self-center">
                    <BarraEmpilhada
                      rotulo="Vigência"
                      partes={[
                        { nome: `de ${data(c.inicio)} a ${data(c.fim)}`, valor: c.dias !== null ? Math.max(0, 365 - Math.max(0, c.dias)) : 0, cor: COR_DO_STATUS_DO_CONTRATO[c.situacao] },
                        { nome: "dias restantes", valor: Math.max(0, c.dias ?? 0), cor: "var(--painel-neutro)" },
                      ]}
                    />
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
