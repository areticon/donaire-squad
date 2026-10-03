import { prisma } from "@/lib/db/prisma";
import { AGENTES, donoDaPeca, situacaoDoSquad, type LogDaEsteira, type PecaDoSquad } from "@/lib/squad/estado-do-squad";
import { lerVeredito } from "@/lib/squad/veredito";

/**
 * O QUE UM AGENTE SABE AGORA, e nao o que nos lembramos de contar para ele.
 *
 * Nasceu em 19/09 do defeito que o Bruno provocou de proposito. Ele perguntou
 * ao Roberto "Vera esta muito brava hoje?" e ouviu "nao sei, nao tenho como
 * avaliar isso, nem tenho trabalho registrado neste projeto ainda".
 *
 * A resposta era HONESTA e o produto estava errado, por dois motivos que se
 * somam:
 *
 *   1. o prompt daquela conversa carregava so os cards DO PROPRIO agente. Ele
 *      nao tinha uma linha sobre a Vera, nem sobre a semana, nem sobre quem
 *      estava trabalhando. Nao era esquiva, era cegueira;
 *   2. a resposta ESTAVA no banco. `situacaoDoSquad` ja calcula a "bronca", que
 *      e literalmente um agente cobrando outro, e a Vera e quem mais cobra. A
 *      pergunta do Bruno tinha resposta e ninguem tinha ligado os dois lados.
 *
 * Entao este arquivo e a resposta a primeira metade do pedido: "eles precisam
 * estar sempre conectados em tempo real". Ele monta o que o agente enxerga da
 * sala ao olhar em volta, e nao um resumo do que ele mesmo fez.
 *
 * A segunda metade, "ter poder de pensar e agirem sozinho", e o laco de
 * ferramentas em lib/claude/ferramentas.ts: aqui e o que ele ja sabe sem
 * perguntar, la e o que ele vai buscar quando quiser.
 */

/**
 * O nome do dia, pela DATA da peca.
 *
 * "dayOfWeek" e o dia K da campanha, nao um dia da semana: a campanha comeca
 * na data que o cliente escolhe. Ate 19/09 isto era uma tabela
 * ["", "segunda", ...][k], e o Paulo dizia "material de segunda" numa sexta.
 */
export function nomeDoDiaDaPeca(scheduledDate: Date | string | null | undefined, dayOfWeek: number): string {
  const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  if (!scheduledDate) return `dia ${dayOfWeek} da campanha`;
  const d = new Date(scheduledDate);
  if (Number.isNaN(d.getTime())) return `dia ${dayOfWeek} da campanha`;
  // A data de agendamento e gravada a meia-noite UTC; ler em UTC evita cair no
  // dia anterior em Sao Paulo (a mesma armadilha do calendario, 18/09).
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

const ESTADO_EM_PALAVRAS: Record<string, string> = {
  trabalhando: "trabalhando agora",
  pronto: "entregou e está livre",
  esperando: "esperando a vez",
  aviso: "com problema na mesa",
  ocioso: "parado, sem trabalho",
};

export type OlharDoSquad = {
  /** O bloco de texto que vai para o prompt. */
  texto: string;
  /** Quem está com o bastão, para quem quiser usar fora do prompt. */
  trabalhando: string | null;
};

/**
 * A sala, agora.
 *
 * Inclui de propósito coisas que o agente que pergunta NÃO fez: quem está
 * trabalhando, o que cada um falou por último, e quem cobrou quem. É isso que
 * transforma sete processos numa equipe que divide uma sala.
 */
export async function olharOSquad(projectId: string): Promise<OlharDoSquad> {
  const [cards, run] = await Promise.all([
    prisma.campaignCard.findMany({
      where: { projectId, NOT: { status: "archived" }, run: { archived: false } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, agentId: true, cardType: true, status: true, dayOfWeek: true, runId: true, content: true, scheduledDate: true },
    }),
    prisma.pipelineRun.findFirst({
      where: { projectId, archived: false },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true, topic: true, logs: true, startedAt: true },
    }),
  ]);

  const logs = (Array.isArray(run?.logs) ? run.logs : []) as LogDaEsteira[];
  const pecas: PecaDoSquad[] = cards.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    cardType: c.cardType,
    status: c.status,
  }));

  const s = situacaoDoSquad({ pecas, logs, rodando: run?.status === "running" });

  const linhas: string[] = [];

  linhas.push(
    run
      ? `A CAMPANHA DE AGORA: "${run.topic ?? "sem tema"}", ${run.status === "running" ? "rodando neste instante" : `estado ${run.status}`}.`
      : "Nenhuma campanha rodando neste projeto ainda."
  );
  linhas.push("");
  linhas.push("A SALA, agora:");
  for (const a of s.agentes) {
    const fala = s.falas[a.agente.id];
    linhas.push(
      `- ${a.agente.primeiroNome} (${a.agente.papel}): ${ESTADO_EM_PALAVRAS[a.estado] ?? a.estado}` +
        `, ${a.detalhe}` +
        (fala ? `. Acabou de dizer: "${fala}"` : "")
    );
  }

  /**
   * A BRONCA, que é a resposta da pergunta que originou este arquivo.
   *
   * Ela é um agente cobrando outro, gravada pela Vera quando ela reprova um
   * dia. Perguntar "a Vera está brava hoje?" e ter isto na mão é a diferença
   * entre um colega e um formulário.
   */
  if (s.bronca) {
    const de = AGENTES.find((a) => a.id === s.bronca!.de);
    const para = AGENTES.find((a) => a.id === s.bronca!.para);
    linhas.push("");
    linhas.push(
      `A ÚLTIMA COBRANÇA NA SALA: ${de?.primeiroNome ?? s.bronca.de} devolveu trabalho para ` +
        `${para?.primeiroNome ?? s.bronca.para}. Motivo: ${s.bronca.motivo}`
    );
  } else {
    linhas.push("");
    linhas.push("Ninguém devolveu trabalho de ninguém nesta rodada.");
  }

  // Quantas reprovações a Vera assinou, que é o número que diz se o dia foi
  // tenso. Uma pergunta sobre humor tem resposta factual aqui.
  const pareceres = cards.filter((c) => c.cardType === "preview");
  const reprovados = pareceres.filter((c) => {
    // `chave` e o campo canonico do veredito; casar no rotulo seria depender
    // do texto que a tela mostra, e ele muda.
    return lerVeredito(c.content).chave === "reprovado";
  }).length;
  if (pareceres.length > 0) {
    linhas.push(
      `A Vera assinou ${pareceres.length} parecer(es) recentes, ${reprovados} com reprovação.`
    );
  }

  const esperando = cards.filter((c) => c.status === "pending").length;
  linhas.push(`${esperando} peça(s) esperando a aprovação do cliente.`);

  return { texto: linhas.join("\n"), trabalhando: s.trabalhando };
}

/** Uma peça em uma linha, do jeito que um colega descreveria de longe. */
export function resumoDaPeca(c: {
  id: string;
  agentId: string;
  cardType: string;
  dayOfWeek: number;
  status: string;
  content: string | null;
  scheduledDate?: Date | string | null;
}): string {
  const dono = donoDaPeca(c);
  const texto = (c.content ?? "").replace(/\s+/g, " ").trim();
  return (
    `[${c.id}] ${dono?.primeiroNome ?? "alguém"}, ${nomeDoDiaDaPeca(c.scheduledDate, c.dayOfWeek)}, ` +
    `${c.cardType}, ${c.status}: ${texto.slice(0, 200)}${texto.length > 200 ? "…" : ""}`
  );
}
