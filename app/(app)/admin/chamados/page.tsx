export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { numero, periodoDaUrl, soma } from "@/lib/admin/tipos-do-painel";
import { chamadosDoPainel, numeroDoSuporte } from "@/lib/suporte/chamados";
import { resumoDoSuporte } from "@/lib/suporte/painel";
import { CATEGORIAS, NOME_DA_CATEGORIA, ehStatus } from "@/lib/suporte/regras";
import { BarraEmpilhada, BarrasHorizontais, Cartao, Numero, Vazio } from "@/components/admin/painel-graficos";
import { GraficoNoTempo } from "@/components/admin/grafico-no-tempo";
import { ChamadosDoSuporte } from "@/components/admin/chamados-do-suporte";

/**
 * A FILA DO SUPORTE (02/10/2026), no padrão gráfico do painel: a situação da
 * fila, as categorias e os chamados por dia em gráfico; embaixo, a lista com
 * filtro por status, a resposta (que vai por e-mail ao cliente) e a troca de
 * status. Só admin, 404 para o resto.
 */
export default async function ChamadosDoAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; abrir?: string; dias?: string; conta?: string }>;
}) {
  if (!(await exigirAdmin())) notFound();
  const sp = await searchParams;
  const status = ehStatus(sp.status) ? sp.status : null;
  const dias = periodoDaUrl(sp.dias);
  const [resumo, chamados] = await Promise.all([resumoDoSuporte(dias), chamadosDoPainel({ status, userId: sp.conta ?? null })]);
  const total = resumo.porStatus.aberto + resumo.porStatus.andamento + resumo.porStatus.resolvido;
  const horas = resumo.primeiraRespostaHoras;

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rotulo mb-1">Suporte</p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Chamados
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Cada resposta vai por e-mail ao cliente e aparece em Meus chamados.{" "}
            {numeroDoSuporte() ? "O botão de WhatsApp está ligado para o cliente." : "O botão de WhatsApp está desligado: falta a variável SUPORTE_WHATSAPP."}
          </p>
        </div>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Numero rotulo="Na fila" valor={String(resumo.porStatus.aberto + resumo.porStatus.andamento)} nota={`${resumo.porStatus.aberto} sem resposta`}>
          <BarraEmpilhada
            rotulo="Chamados por situação"
            partes={[
              { nome: "Abertos", valor: resumo.porStatus.aberto, cor: "var(--painel-2)" },
              { nome: "Em andamento", valor: resumo.porStatus.andamento, cor: "var(--painel-3)" },
              { nome: "Resolvidos", valor: resumo.porStatus.resolvido, cor: "var(--painel-1)" },
            ]}
          />
        </Numero>
        <Numero rotulo="Resolvidos" valor={String(resumo.porStatus.resolvido)} nota={total ? `${Math.round((resumo.porStatus.resolvido / total) * 100)}% de ${total}` : "nenhum chamado ainda"} />
        <Numero rotulo="Reclamações" valor={String(resumo.reclamacoes)} nota="cobrança, problema técnico ou marcados à mão" />
        <Numero
          rotulo="Primeira resposta"
          valor={horas === null ? "sem dado" : horas < 1 ? `${Math.max(1, Math.round(horas * 60))} min` : `${numero(horas)} h`}
          nota={`mediana dos últimos ${dias} dias`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Cartao className="lg:col-span-3" titulo={`Chamados nos últimos ${dias} dias`} subtitulo="Pelo dia em que foram abertos, no horário de São Paulo. A segunda linha é a parte que conta como reclamação.">
          {soma(resumo.noTempo.series[0].valores) > 0 ? (
            <GraficoNoTempo dados={resumo.noTempo} modo="linhas" rotulo={`Chamados abertos nos últimos ${dias} dias`} />
          ) : (
            <Vazio titulo="Nenhum chamado no período" texto="Cada chamado aberto pela janela de Ajuda vira um ponto aqui, no dia em que chegou." />
          )}
        </Cartao>
        <Cartao className="lg:col-span-2" titulo="Por categoria" subtitulo="Todos os chamados, de sempre.">
          <BarrasHorizontais linhas={CATEGORIAS.map((c) => ({ nome: NOME_DA_CATEGORIA[c], valor: resumo.porCategoria[c] ?? 0 }))} />
        </Cartao>
      </div>

      <ChamadosDoSuporte chamados={chamados} status={status} abrir={sp.abrir ?? null} />
    </div>
  );
}
