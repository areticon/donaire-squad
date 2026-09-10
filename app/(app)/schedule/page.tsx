import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { CORES, estadoDoPost, faltaQuanto, horaCurta, nomeDaRede, type ChaveDeEstado } from "@/lib/posts/estado";

export const dynamic = "force-dynamic";

/**
 * A AGENDA: o que sai, quando, e onde, em todos os projetos da pessoa.
 *
 * Até 10/09 esta rota redirecionava para a lista de projetos, ou seja, o único
 * lugar do menu chamado "Agenda" mostrava nada, e o Bruno não conseguia dizer o
 * que estava programado. A resposta é a lista cronológica dos posts, agrupada
 * por dia, com hoje em destaque e "em X h Y min" para o que ainda sai.
 *
 * É uma tela de LEITURA, de propósito. Publicar, agendar e reagendar continuam
 * no card do Paulo, no Gestor: a regra da casa desde 02/09 é um lugar só para a
 * mesma ação, e aqui cada linha leva para lá.
 */

const ROTULO_DO_TIPO: Record<string, string> = {
  text: "Texto",
  image: "Imagem",
  carousel: "Carrossel",
  infographic: "Infográfico",
  poll: "Enquete",
  thread: "Thread",
  article: "Artigo",
  video: "Vídeo",
};

function inicioDoDiaLocal(d: Date): Date {
  // A agenda é lida no Brasil (UTC-3). O servidor está em UTC, então o "dia"
  // é calculado com esse deslocamento, senão um post das 22h cai no dia seguinte.
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + 3 * 60 * 60 * 1000);
}

function chaveDoDia(d: Date): string {
  return inicioDoDiaLocal(d).toISOString().slice(0, 10);
}

function nomeDoDia(d: Date, hoje: Date): string {
  const dia = inicioDoDiaLocal(d).getTime();
  const h = inicioDoDiaLocal(hoje).getTime();
  const diff = Math.round((dia - h) / 86_400_000);
  const nome = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
  if (diff === 0) return `Hoje, ${nome}`;
  if (diff === 1) return `Amanhã, ${nome}`;
  if (diff === -1) return `Ontem, ${nome}`;
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export default async function SchedulePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const agora = new Date();
  const desde = new Date(inicioDoDiaLocal(agora).getTime() - 7 * 86_400_000);
  const ate = new Date(inicioDoDiaLocal(agora).getTime() + 15 * 86_400_000);

  const posts = await prisma.post.findMany({
    where: {
      project: { userId },
      status: { not: "cancelled" },
      OR: [
        { scheduledAt: { gte: desde, lt: ate } },
        { publishedAt: { gte: desde, lt: ate } },
        { scheduledAt: null, publishedAt: null, createdAt: { gte: desde } },
      ],
    },
    select: {
      id: true,
      platform: true,
      mediaType: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      externalUrl: true,
      socialAccountId: true,
      metadata: true,
      content: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledAt: "asc" }],
  });

  // Agrupa por dia: publicado pelo dia em que saiu, o resto pelo dia marcado.
  // Rascunho sem horário fica no dia em que nasceu.
  const porDia = new Map<string, typeof posts>();
  for (const p of posts) {
    const quando = p.publishedAt ?? p.scheduledAt ?? p.createdAt;
    const chave = chaveDoDia(quando);
    porDia.set(chave, [...(porDia.get(chave) ?? []), p]);
  }
  const dias = [...porDia.keys()].sort();
  const hojeChave = chaveDoDia(agora);
  // Hoje e o futuro primeiro, em ordem; o passado depois, do mais recente ao
  // mais antigo. Quem abre a agenda quer saber o que vem, não o que foi.
  const futuros = dias.filter((d) => d >= hojeChave);
  const passados = dias.filter((d) => d < hojeChave).reverse();

  const contagem: Record<ChaveDeEstado, number> = { publicado: 0, agendado: 0, publicando: 0, rascunho: 0, falhou: 0 };
  for (const p of posts) contagem[estadoDoPost(p, agora).chave]++;

  const Bloco = ({ chave }: { chave: string }) => {
    const lista = porDia.get(chave) ?? [];
    const dia = new Date(chave + "T03:00:00.000Z");
    const eHoje = chave === hojeChave;
    const proximos = lista.filter((p) => estadoDoPost(p, agora).chave === "agendado" && p.scheduledAt);
    const proximo = proximos.map((p) => new Date(p.scheduledAt!)).sort((a, b) => a.getTime() - b.getTime())[0];
    const rascunhos = lista.filter((p) => estadoDoPost(p, agora).chave === "rascunho").length;
    const subtitulo = proximo
      ? `${proximos.length} ${proximos.length === 1 ? "sai" : "saem"} às ${horaCurta(proximo)}${eHoje ? `, ${faltaQuanto(proximo, agora)}` : ""}`
      : rascunhos
        ? `${rascunhos} rascunho${rascunhos > 1 ? "s" : ""}, sem horário. Não ${rascunhos > 1 ? "saem" : "sai"} enquanto você não agendar.`
        : lista.every((p) => p.status === "published")
          ? "publicado"
          : "";
    return (
      <div>
        <div className="flex items-baseline gap-2.5 mb-2">
          <span className="text-[13px] font-semibold" style={{ color: eHoje ? "var(--accent-orange)" : chave < hojeChave ? "var(--text-muted)" : "var(--text-primary)" }}>
            {nomeDoDia(dia, agora)}
          </span>
          {subtitulo && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{subtitulo}</span>}
        </div>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg-surface)", opacity: chave < hojeChave ? 0.85 : 1 }}>
          {lista.map((p, i) => {
            const e = estadoDoPost(p, agora);
            const quando = p.publishedAt ?? p.scheduledAt;
            const hora = quando ? horaCurta(new Date(quando)) : "--:--";
            const gestor = `/projects/${p.project.id}/live`;
            return (
              <div
                key={p.id}
                className="grid items-center gap-3 px-4 py-3"
                style={{ gridTemplateColumns: "56px 170px minmax(0,1fr) 240px 150px", borderBottom: i < lista.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <div className="text-[13px] font-semibold" style={{ color: quando ? "var(--text-primary)" : "var(--text-muted)" }}>{hora}</div>
                <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                  {nomeDaRede(p.platform)} · {ROTULO_DO_TIPO[p.mediaType ?? "text"] ?? p.mediaType ?? "Texto"}
                  <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{p.project.name}</div>
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{p.content.split("\n")[0].slice(0, 120)}</div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: e.cor }} />
                  <span className="text-[11px] font-medium truncate" style={{ color: e.cor }} title={e.detalhe}>
                    {e.rotulo}{e.chave === "agendado" ? ", sai sozinho" : e.chave === "rascunho" ? ", não sai" : ""}
                  </span>
                </div>
                <div className="flex justify-end gap-3 text-[11px]">
                  {e.chave === "publicado" && p.externalUrl ? (
                    <a href={p.externalUrl} target="_blank" rel="noopener" className="hover:underline" style={{ color: "var(--accent-orange)" }}>
                      Abrir no {nomeDaRede(p.platform)}
                    </a>
                  ) : (
                    <Link href={gestor} className="hover:underline" style={{ color: e.chave === "rascunho" || e.chave === "falhou" ? "var(--accent-orange)" : "var(--text-muted)" }}>
                      {e.chave === "rascunho" ? "Agendar no Gestor" : e.chave === "falhou" ? "Resolver no Gestor" : "Ver no Gestor"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>Agenda</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>O que sai, quando, e onde. Próximos 14 dias, e a semana que passou.</p>
        </div>
        <div className="flex gap-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CORES.agendado }} />{contagem.agendado + contagem.publicando} agendados</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CORES.rascunho }} />{contagem.rascunho} rascunhos</span>
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CORES.publicado }} />{contagem.publicado} publicados</span>
          {contagem.falhou > 0 && (
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ background: CORES.falhou }} />{contagem.falhou} falharam</span>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Nada agendado. Gere uma semana no Gestor de Conteúdo de um projeto e ela aparece aqui.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {futuros.map((d) => <Bloco key={d} chave={d} />)}
          {passados.length > 0 && (
            <div className="text-[11px] uppercase tracking-wide pt-2" style={{ color: "var(--text-muted)" }}>Já passou</div>
          )}
          {passados.map((d) => <Bloco key={d} chave={d} />)}
        </div>
      )}
    </div>
  );
}
