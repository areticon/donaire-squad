import { prisma } from "@/lib/db/prisma";
import { AGENTES, donoDaPeca } from "@/lib/squad/estado-do-squad";
import { lerVeredito } from "@/lib/squad/veredito";
import { resumoDaPeca, olharOSquad, nomeDoDiaDaPeca } from "@/lib/squad/consciencia";
import type { Ferramenta } from "@/lib/claude/ferramentas";

/**
 * O QUE UM AGENTE PODE FAZER SOZINHO, no escritório.
 *
 * Segunda metade do pedido do Bruno de 19/09: "ter poder de pensar e agirem
 * sozinho, só não publica nada".
 *
 * A lista é curta de propósito e tem uma fronteira só, mas ela é dura:
 *
 *   LER qualquer coisa deste projeto. A semana, a peça inteira, o colega, o
 *   parecer da Vera. Um agente que precisa pedir licença para olhar o próprio
 *   trabalho não é agente, é formulário.
 *
 *   AGIR em UMA coisa: pedir ajuste numa peça, que devolve ela para a mesa de
 *   quem escreveu. É a ação que um colega de verdade toma, e ela é reversível:
 *   ninguém perde texto, a peça volta para revisão com o motivo escrito.
 *
 *   PUBLICAR, nunca. Foi a única coisa que o Bruno nomeou como proibida, e ela
 *   não está nesta lista nem vai estar. Não existe caminho daqui até a rede
 *   social.
 *
 * Toda ferramenta é presa ao `projectId` de quem está conversando, em código e
 * não por instrução: um agente não alcança outro projeto nem que o prompt peça.
 */

export function ferramentasDoEscritorio(opcoes: {
  projectId: string;
  /** Quem está falando. Entra na nota do ajuste, para a peça dizer quem pediu. */
  euId: string;
  euNome: string;
}): Ferramenta[] {
  const { projectId, euId, euNome } = opcoes;

  return [
    {
      nome: "ver_a_semana",
      descricao:
        "Lista as peças da campanha atual deste projeto, com o dia, quem fez, o tipo, o estado e o começo do texto. " +
        "Use quando a pergunta for sobre o que está sendo produzido, o que já saiu ou o que falta.",
      entrada: { type: "object", properties: {}, required: [] },
      rodar: async () => {
        const cards = await prisma.campaignCard.findMany({
          where: { projectId, NOT: { status: "archived" }, run: { archived: false } },
          orderBy: [{ dayOfWeek: "asc" }, { createdAt: "desc" }],
          take: 40,
          select: { id: true, agentId: true, cardType: true, dayOfWeek: true, status: true, content: true, scheduledDate: true },
        });
        if (cards.length === 0) return "Não há peça nenhuma neste projeto ainda.";
        return cards.map(resumoDaPeca).join("\n");
      },
    },

    {
      nome: "ver_peca",
      descricao:
        "Abre UMA peça inteira pelo id, com o texto completo e o parecer da Vera sobre o dia dela. " +
        "Use quando precisar do conteúdo de verdade e não do resumo.",
      entrada: {
        type: "object",
        properties: { id: { type: "string", description: "O id da peça, como aparece entre colchetes na lista." } },
        required: ["id"],
      },
      rodar: async (args) => {
        const id = String(args.id ?? "");
        const c = await prisma.campaignCard.findFirst({
          where: { id, projectId },
          select: { id: true, agentId: true, cardType: true, dayOfWeek: true, status: true, content: true, runId: true, scheduledDate: true },
        });
        if (!c) return "Essa peça não existe neste projeto.";
        const parecer = await prisma.campaignCard.findFirst({
          where: { projectId, runId: c.runId, dayOfWeek: c.dayOfWeek, cardType: "preview" },
          orderBy: { createdAt: "desc" },
          select: { content: true },
        });
        const v = lerVeredito(parecer?.content);
        const dono = donoDaPeca(c);
        return [
          `Peça ${c.id}, de ${dono?.primeiroNome ?? "alguém"}, ${nomeDoDiaDaPeca(c.scheduledDate, c.dayOfWeek)}, ${c.cardType}, estado ${c.status}.`,
          `Veredito da Vera para este dia: ${v.rotulo}${v.nota != null ? ` (nota ${v.nota})` : ""}.`,
          "",
          c.content ?? "(sem texto)",
        ].join("\n");
      },
    },

    {
      nome: "ver_colega",
      descricao:
        "Olha um colega do squad: quem ele é, o que ele está fazendo agora e as peças recentes dele, com o que a Vera achou. " +
        "Use SEMPRE que a pergunta mencionar outro agente do squad, inclusive quando for sobre o humor, o ritmo ou o jeito dele.",
      entrada: {
        type: "object",
        properties: {
          quem: {
            type: "string",
            description: `O primeiro nome ou o id do colega. Os do squad: ${AGENTES.map((a) => `${a.primeiroNome} (${a.id})`).join(", ")}.`,
          },
        },
        required: ["quem"],
      },
      rodar: async (args) => {
        const busca = String(args.quem ?? "").trim().toLowerCase();
        const colega = AGENTES.find(
          (a) => a.id === busca || a.primeiroNome.toLowerCase() === busca || a.nome.toLowerCase() === busca
        );
        if (!colega) return `Não conheço ninguém chamado "${args.quem}" neste squad.`;

        const [registro, todos, sala] = await Promise.all([
          prisma.projectAgent.findFirst({
            where: { projectId, agentId: colega.id },
            select: { name: true, role: true, persona: true, style: true },
          }),
          prisma.campaignCard.findMany({
            where: {
              projectId,
              OR: [{ agentId: colega.id }, { cardType: { in: colega.cardTypes } }],
              NOT: { status: "archived" },
              run: { archived: false },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { id: true, agentId: true, cardType: true, dayOfWeek: true, status: true, content: true, scheduledDate: true },
          }),
          olharOSquad(projectId),
        ]);
        // O dono decide, e não o tipo: ver `donoDaPeca`.
        const cards = todos.filter((c) => donoDaPeca(c)?.id === colega.id);

        /**
         * A SALA INTEIRA volta junto de propósito.
         *
         * Perguntar "a Vera está brava?" se responde com a bronca mais recente
         * e com quantos pareceres ela reprovou, e nada disso está nos cards
         * dela. Era exatamente essa a informação que faltava em 19/09.
         */
        return [
          `${colega.nome}, ${registro?.role ?? colega.papel}.`,
          registro?.persona ? `Quem ${colega.artigo === "A" ? "ela" : "ele"} é: ${registro.persona}` : "",
          registro?.style ? `Como trabalha: ${registro.style}` : "",
          "",
          "O QUE ESTÁ ACONTECENDO NA SALA AGORA:",
          sala.texto,
          "",
          `PEÇAS RECENTES DE ${colega.primeiroNome.toUpperCase()}:`,
          cards.length > 0 ? cards.map(resumoDaPeca).join("\n") : "- nenhuma nesta semana.",
        ]
          .filter(Boolean)
          .join("\n");
      },
    },

    {
      nome: "pedir_ajuste",
      descricao:
        "Devolve uma peça para a mesa de quem escreveu, com o motivo. A peça fica marcada como precisando de ajuste e o pedido entra no histórico dela. " +
        "Use quando você mesmo achar que uma peça precisa mudar, e diga o motivo em uma frase. Isto NÃO publica nada e NÃO reescreve o texto.",
      entrada: {
        type: "object",
        properties: {
          id: { type: "string", description: "O id da peça." },
          motivo: { type: "string", description: "O que precisa mudar, em uma frase, em português." },
        },
        required: ["id", "motivo"],
      },
      rodar: async (args) => {
        const id = String(args.id ?? "");
        const motivo = String(args.motivo ?? "").trim();
        if (!motivo) return "Preciso do motivo para devolver a peça.";

        const c = await prisma.campaignCard.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, chatHistory: true, dayOfWeek: true, cardType: true, scheduledDate: true },
        });
        if (!c) return "Essa peça não existe neste projeto.";
        // Peça já publicada não volta. Uma vez no ar, o caminho é outro post.
        if (c.status === "published") return "Essa peça já foi publicada, não dá para devolver.";

        const historico = Array.isArray(c.chatHistory) ? c.chatHistory : [];
        await prisma.campaignCard.update({
          where: { id: c.id },
          data: {
            status: "needs_revision",
            chatHistory: [
              ...historico,
              {
                role: "agent",
                agentId: euId,
                agentName: euNome,
                // Fica escrito QUEM pediu: um ajuste sem autor vira "o sistema
                // mandou", e o produto inteiro é construído contra isso.
                content: `${euNome} pediu ajuste: ${motivo}`,
                at: new Date().toISOString(),
              },
            ] as never,
          },
        });
        return `Pronto. A peça ${c.id} (${nomeDoDiaDaPeca(c.scheduledDate, c.dayOfWeek)}, ${c.cardType}) voltou para ajuste com o motivo registrado em seu nome.`;
      },
    },
  ];
}
