import { auth } from "@/lib/auth/server";
import { garantirPrimeiroProjeto } from "@/lib/onboarding/portao";
import { redirect } from "next/navigation";
import Link from "next/link";
import { membroAtivo, projetoVisivel } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { numerosDoPainel } from "@/lib/painel/numeros-do-painel";
import { BarrasPorSemana, BarrasPorRede, Variacao } from "@/components/painel/graficos";
import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import { NOMES_DAS_REDES } from "@/lib/posts/estado";

/**
 * "QUARTA-FEIRA, 30 DE SETEMBRO · 23:23", o rótulo de data da referência
 * (01/10). Fuso de São Paulo de propósito: o servidor roda em UTC e, sem o
 * fuso, a data virava o dia seguinte às 21h.
 */
function hojePorExtenso(): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} · ${hora}`;
}

async function getDashboardData(userId: string) {
  // Só o que a tela ainda usa daqui: o nome e os projetos. Os números do
  // painel vêm de lib/painel/numeros-do-painel.ts desde 28/09.
  const [user, projects] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    // Os projetos que ela vê: os dela, ou os que o dono da equipe liberou (01/10).
    prisma.project.findMany({ where: projetoVisivel(userId), orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);
  return { user, projects };
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Quem acabou de assinar não deve ver dashboard vazio com um quadrinho de
  // "criar projeto": o primeiro projeto nasce sozinho e a pessoa cai na etapa
  // 1 do assistente, que é conectar as redes. Ver lib/onboarding/portao.ts.
  const primeiroProjeto = await garantirPrimeiroProjeto(userId);
  if (primeiroProjeto) redirect(`/projects/${primeiroProjeto}/setup`);

  const [{ user, projects }, numeros, membro] = await Promise.all([getDashboardData(userId), numerosDoPainel(userId), membroAtivo(userId)]);

  // MEMBRO DA EQUIPE sem projeto liberado (01/10): quem cria projeto é o dono,
  // então o convite para criar seria um botão que não funciona para ele.
  if (projects.length === 0 && membro) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Bem-vindo, {user?.name?.split(" ")[0] ?? "por aqui"}
        </h1>
        <p className="mt-2 text-lg" style={{ color: "var(--text-muted)" }}>
          Você já está na equipe. Falta quem administra a conta liberar o seu projeto; assim que liberar,
          ele aparece aqui.
        </p>
      </div>
    );
  }

  // Primeira vez: sem projeto nenhum, os quatro números são zero. Painel de
  // zeros é a pior primeira tela possível, porque não diz o que fazer. Aqui a
  // tela vira a próxima ação, e só depois vira painel.
  if (projects.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Bem-vindo, {user?.name?.split(" ")[0] ?? "por aqui"}
        </h1>
        <p className="mt-2 text-lg" style={{ color: "var(--text-muted)" }}>
          Falta uma coisa para o seu squad começar a trabalhar: contar para ele
          quem é você e como você fala.
        </p>

        <div
          className="mt-8 rounded-xl border p-6"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <p className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            São três minutos, e no segundo passo você já vê o squad escrevendo
            um post seu.
          </p>
          <ol className="space-y-2 mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>1. Seu nicho e o seu público</li>
            <li>2. Como você fala, e aí o squad te mostra um post</li>
            <li>3. Conecte as redes e escolha o ritmo</li>
          </ol>
          <Button size="lg" asChild>
            <Link href="/projects/new">
              <Plus className="w-4 h-4" />
              Criar meu primeiro projeto
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header no cartão azul-noite da referência do rebranding (01/10): a
          data em rótulo mono, o nome e uma frase que fala com o dono da
          empresa (o ICP de R$ 100 mil por mês), não com quem quer "postar". */}
      <div className="cartao-noite mb-8 rounded-3xl px-6 py-7 sm:px-10 sm:py-9 shadow-[0_16px_40px_-12px_rgba(10,31,59,.45)]">
        <p className="rotulo" style={{ color: "#b7c6da" }}>{hojePorExtenso()}</p>
        <p className="mt-5 text-lg font-medium" style={{ color: "#dbe5f1" }}>
          {user?.name?.split(" ")[0] ?? "Olá"},
        </p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]" style={{ color: "#ffffff" }}>
          sua marca, <span className="destaque">no ritmo certo</span>.
        </h1>
        <p className="mt-3 max-w-2xl" style={{ color: "#b7c6da" }}>
          O squad cuida da pauta, da escrita e da publicação. Você aprova o que importa e volta para o negócio.
        </p>
      </div>

      {/* O PAINEL EM NÚMEROS (28/09). Pedido do Bruno: a tela inicial com os
          agentes, os números deles, os projetos, campanhas, posts e redes, em
          gráficos e não em cards soltos. Os números moram em
          lib/painel/numeros-do-painel.ts; os gráficos, em components/painel.
          O contador antigo de campanhas vinha de uma lista cortada em 5 e
          nunca passava de 5. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { rotulo: "Posts publicados", valor: numeros.kpis.publicados30, anterior: numeros.kpis.publicadosAnt as number | null, nota: "nos últimos 30 dias" },
          { rotulo: "Engajamento", valor: numeros.kpis.engajamento30, anterior: numeros.kpis.engajamentoAnt as number | null, nota: `curtidas, comentários e compartilhamentos em ${numeros.kpis.medidos30} posts medidos` },
          { rotulo: "Campanhas", valor: numeros.kpis.campanhas30, anterior: numeros.kpis.campanhasAnt as number | null, nota: "rodadas nos últimos 30 dias" },
          { rotulo: "Créditos usados", valor: numeros.kpis.creditosPlano30, anterior: null as number | null, nota: numeros.kpis.creditosVideo30 ? `mais ${numeros.kpis.creditosVideo30.toLocaleString("pt-BR")} de vídeo, em 30 dias` : "em 30 dias" },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-2xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
            <p className="rotulo">{k.rotulo}</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums mt-2" style={{ color: "var(--text-primary)" }}>{k.valor.toLocaleString("pt-BR")}</p>
            <div className="mt-1 min-h-[16px]">{k.anterior !== null ? <Variacao atual={k.valor} anterior={k.anterior} /> : null}</div>
            <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{k.nota}</p>
          </div>
        ))}
      </div>

      {/* O squad: cada agente com o que fez no mês. */}
      <div className="rounded-2xl border p-4 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>O seu squad nos últimos 30 dias</h2>
          <Link href={projects[0] ? `/projects/${projects[0].id}/live` : "/projects"} className="whitespace-nowrap text-xs text-orange-500 hover:underline">ver o escritório</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {numeros.agentes.map((a) => (
            <div key={a.id} className="flex flex-col items-center text-center rounded-lg px-2 py-3" style={{ background: "var(--bg-input)" }}>
              <AvatarDoAgente agenteId={a.id} tamanho={44} />
              <p className="text-xs font-semibold mt-1.5 leading-tight" style={{ color: "var(--text-primary)" }}>{a.nome.split(" ")[0]}</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{a.papel}</p>
              <p className="text-xl font-black tabular-nums mt-1" style={{ color: a.cor }}>{a.numero.toLocaleString("pt-BR")}</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{a.unidade}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        <div className="lg:col-span-3 rounded-2xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Posts publicados por semana</h2>
          <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Últimas 8 semanas, por rede. Passe o mouse numa barra para ver o número.</p>
          <BarrasPorSemana semanas={numeros.semanas} />
        </div>
        <div className="lg:col-span-2 rounded-2xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Qual rede rende mais</h2>
          <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>Engajamento médio por post medido, nos últimos 90 dias.</p>
          {numeros.porRede.length ? (
            <BarrasPorRede
              linhas={numeros.porRede.map((r) => ({
                rede: r.rede,
                valor: Math.round(r.media * 10) / 10,
                nota: `por post · ${r.medidos} de ${r.posts} medidos`,
              }))}
            />
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Publique e sincronize as métricas em Analytics para ver este gráfico.</p>
          )}
          <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
            {numeros.kpis.contas} conta{numeros.kpis.contas === 1 ? "" : "s"} conectada{numeros.kpis.contas === 1 ? "" : "s"} em {numeros.kpis.redes.length} rede{numeros.kpis.redes.length === 1 ? "" : "s"}.
          </p>
        </div>
      </div>

      {/* grid-cols-1 (03/10): a coluna automática crescia até a largura da tabela e a página ganhava rolagem lateral no celular. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Projetos</h2>
            {!membro && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/projects/new"><Plus className="w-3.5 h-3.5" /> Novo</Link>
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-xs tabular-nums">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="text-left font-medium pb-2">Projeto</th>
                  <th className="text-right font-medium pb-2">Publicados 30d</th>
                  <th className="text-right font-medium pb-2">Agendados</th>
                  <th className="text-right font-medium pb-2">Engajamento 30d</th>
                </tr>
              </thead>
              <tbody>
                {numeros.projetos.map((pr) => (
                  <tr key={pr.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2">
                      <Link href={`/projects/${pr.id}`} className="font-medium hover:text-orange-500" style={{ color: "var(--text-primary)" }}>{pr.nome}</Link>
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--text-primary)" }}>{pr.publicados30}</td>
                    <td className="py-2 text-right" style={{ color: "var(--text-primary)" }}>{pr.agendados}</td>
                    <td className="py-2 text-right font-semibold" style={{ color: "var(--text-primary)" }}>{pr.engajamento30.toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Os posts que mais renderam</h2>
          {numeros.melhores.length ? (
            <ol className="space-y-2.5">
              {numeros.melhores.map((m, i) => (
                <li key={m.id} className="flex gap-2.5">
                  <span className="text-sm font-black tabular-nums w-4 shrink-0" style={{ color: "var(--text-muted)" }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>{m.titulo}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{NOMES_DAS_REDES[m.rede] ?? m.rede}</span>
                      {" · "}{m.curtidas} curtida{m.curtidas === 1 ? "" : "s"} · {m.comentarios} comentário{m.comentarios === 1 ? "" : "s"}
                      {m.projeto ? ` · ${m.projeto}` : ""}
                      {m.url ? <> · <a href={m.url} target="_blank" rel="noreferrer" className="hover:text-orange-500">abrir</a></> : null}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{m.engajamento}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Ainda sem números. Sincronize as métricas em Analytics depois de publicar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
