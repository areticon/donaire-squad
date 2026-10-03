// Uma pergunta curta, com o histórico do agente no contexto. 90s dá folga.
export const maxDuration = 120;

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { askClaudeComFerramentas } from "@/lib/claude/ferramentas";
import { olharOSquad, nomeDoDiaDaPeca } from "@/lib/squad/consciencia";
import { ferramentasDoEscritorio } from "@/lib/squad/ferramentas-do-escritorio";
import { AGENTES, donoDaPeca } from "@/lib/squad/estado-do-squad";
import { lerVeredito } from "@/lib/squad/veredito";
import { limparEcoDoPrompt, ehBastidor } from "@/lib/pipeline/guarda-de-texto";
import { podeUsarProjeto } from "@/lib/equipe/conta";

/**
 * Falar com um agente do squad, no escritório.
 *
 * ## O que é
 *
 * No escritório 3D você anda até a mesa de um agente e abre um menu com três
 * coisas: perguntar algo, ver os trabalhos dele (que é a ficha, e já existia) e
 * pedir um comentário sobre outro agente. Esta rota atende as duas que são
 * conversa.
 *
 * ## O que este agente pode dizer, e o que não pode
 *
 * Ele recebe a PERSONA dele (escrita no setup do projeto), os TRABALHOS DELE,
 * a SALA em tempo real, e ferramentas para olhar qualquer peça ou colega deste
 * projeto. As proibições que sobraram são duas, e as duas são o produto:
 *
 * 1. **não afirmar ter feito o que não fez.** É o defeito da parte 135, em que
 *    o Paulo, sem ter imagem nenhuma no card, reescreveu o conteúdo para dizer
 *    que a imagem tinha sido trocada. Um agente que mente sobre o próprio
 *    trabalho é pior que um que recusa;
 * 2. **não inventar FATO DO CLIENTE**: número, percentual, fonte, data, prazo,
 *    preço ou oferta que ele não leu. Continua absoluto.
 *
 * O que DEIXOU de ser proibido em 19/09, e a mudança é deliberada: observar a
 * sala, ligar os pontos e ter opinião sobre o trabalho. Isso não é invenção, é
 * o ofício dele, e proibir transformava o agente num formulário (ver a seção
 * de 19/09 abaixo). Opinar sobre os NÚMEROS e o negócio do cliente continua
 * fora: ali ele não tem como saber, e achismo vira mais uma fonte de invenção.
 *
 * Ele também deixou de ser só conversa: pode devolver uma peça para ajuste, em
 * nome dele e com o motivo registrado. Publicar não, nunca.
 *
 * ## 19/09: a diferença entre não saber e não poder olhar
 *
 * O Bruno perguntou ao Roberto "Vera está muito brava hoje?", de propósito,
 * para provocar a inteligência dos agentes. O Roberto respondeu "não sei, não
 * tenho como avaliar isso, nem tenho trabalho registrado neste projeto ainda".
 *
 * A resposta era honesta e o produto estava errado. Duas causas somadas:
 *
 *   1. o prompt carregava os cards DO PRÓPRIO agente e mais nada. Sobre a
 *      Vera ele não tinha uma linha. Não era esquiva, era cegueira;
 *   2. a regra 1 dizia "fale só do que está em TRABALHOS", o que proibia
 *      observar, inferir e ter opinião. Uma mordaça em cima da cegueira.
 *
 * E a resposta ESTAVA no banco: `situacaoDoSquad` calcula a "bronca", que é um
 * agente devolvendo trabalho para outro, e a Vera é quem mais devolve.
 *
 * O conserto tem duas partes, e elas são o pedido do Bruno em uma frase
 * ("sempre conectados em tempo real, com poder de pensar e agir sozinhos, só
 * não publica nada"):
 *
 *   • `olharOSquad` entra em TODA conversa: quem está trabalhando agora, o que
 *     cada um acabou de dizer, quem cobrou quem, quantos pareceres a Vera
 *     reprovou. É o que ele vê ao levantar a cabeça da mesa;
 *   • `ferramentasDoEscritorio` deixa ele PROCURAR e AGIR: abrir a semana,
 *     abrir uma peça inteira, olhar um colega, e devolver uma peça para ajuste
 *     com o motivo em nome dele. Publicar não está na lista.
 *
 * A separação que faltava nas regras: não inventar FATO DO CLIENTE (número,
 * fonte, prazo, preço) continua absoluto. Observar a sala, ligar os pontos e
 * ter opinião sobre o trabalho passou a ser obrigação, e não permissão.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; agentId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, agentId } = await params;
  const eu = AGENTES.find((a) => a.id === agentId);
  if (!eu) return NextResponse.json({ error: "Agente desconhecido" }, { status: 404 });

  const body = (await req.json()) as { pergunta?: string; sobre?: string };
  const pergunta = body.pergunta?.trim() ?? "";
  const sobre = body.sobre?.trim() ?? "";
  if (!pergunta && !sobre) {
    return NextResponse.json({ error: "Diga o que perguntar, ou sobre quem falar." }, { status: 400 });
  }
  const colega = sobre ? AGENTES.find((a) => a.id === sobre) : undefined;
  if (sobre && !colega) return NextResponse.json({ error: "Colega desconhecido" }, { status: 404 });
  if (colega && colega.id === eu.id) {
    return NextResponse.json({ error: "Ele não comenta sobre si mesmo." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, niche: true },
  });
  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tipos = colega ? [...eu.cardTypes, ...colega.cardTypes] : eu.cardTypes;
  const ids = colega ? [eu.id, colega.id] : [eu.id];

  const [registro, registroDoColega, cards, cardsDaVera, sala] = await Promise.all([
    prisma.projectAgent.findFirst({
      where: { projectId: id, agentId },
      select: { name: true, role: true, persona: true, style: true },
    }),
    colega
      ? prisma.projectAgent.findFirst({
          where: { projectId: id, agentId: colega.id },
          select: { name: true, role: true, persona: true },
        })
      : Promise.resolve(null),
    prisma.campaignCard.findMany({
      where: {
        projectId: id,
        OR: [{ agentId: { in: ids } }, { cardType: { in: tipos } }],
        NOT: { status: "archived" },
        run: { archived: false },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        agentId: true,
        cardType: true,
        dayOfWeek: true,
        scheduledDate: true,
        status: true,
        content: true,
        runId: true,
        run: { select: { topic: true } },
      },
    }),
    prisma.campaignCard.findMany({
      where: { projectId: id, cardType: "preview" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { runId: true, dayOfWeek: true, content: true },
    }),
    // A SALA, em tempo real. Ver o cabeçalho deste arquivo.
    olharOSquad(id),
  ]);

  const vereditoPorDia = new Map<string, string | null>();
  for (const v of cardsDaVera) {
    const chave = `${v.runId}:${v.dayOfWeek}`;
    if (!vereditoPorDia.has(chave)) vereditoPorDia.set(chave, v.content);
  }

  const ESTADO: Record<string, string> = {
    pending: "esperando a aprovação do cliente",
    approved: "aprovada",
    rejected: "rejeitada pelo cliente",
    needs_revision: "com ajuste pedido",
  };

  /**
   * Um trabalho vira UMA linha, cortada em 240 caracteres.
   *
   * O texto inteiro de doze peças passaria de vinte mil caracteres e faria uma
   * pergunta de dez palavras custar mais que a campanha. O agente precisa
   * reconhecer o que escreveu, não reler tudo.
   */
  const linhaDoCard = (c: (typeof cards)[number]) => {
    const dono = donoDaPeca(c);
    const texto = (c.content ?? "").replace(/\s+/g, " ").trim();
    // A VERA NÃO RECEBE NOTA DE SI MESMA: o card dela É a nota. Sem esta
    // linha, o parecer dela entrava com o próprio veredito anexado, e o Tiago
    // leu isso como "nem ela escapou do próprio crivo" (visto no teste contra
    // os dados reais). A ficha do agente já tratava isso desde a parte 134;
    // aqui faltava, e o agente não inventou, ele leu o que eu escrevi errado.
    const daVera = c.cardType === "preview";
    const veredito = daVera ? null : lerVeredito(vereditoPorDia.get(`${c.runId}:${c.dayOfWeek}`));
    const cabeca = `- ${dono?.primeiroNome ?? "alguém"}, ${nomeDoDiaDaPeca(c.scheduledDate, c.dayOfWeek)}${c.run.topic ? ` (tema: ${c.run.topic})` : ""}`;
    const corpo = `${texto.slice(0, 240)}${texto.length > 240 ? "…" : ""}`;

    // O card da Vera é o PARECER dela, e não uma peça que vai ao ar: ele não
    // leva estado de aprovação nem nota, porque ele É a nota. Dizer isso na
    // própria linha evita que quem lê a lista confunda parecer com conteúdo.
    if (daVera) return `${cabeca}: (parecer da revisão) ${corpo}`;

    const nota = veredito && veredito.chave !== "sem-veredito" ? `; Vera: ${veredito.rotulo}` : "";
    return `${cabeca}: ${corpo} [${ESTADO[c.status] ?? c.status}${nota}]`;
  };

  // Pelo dono, e não por "id ou tipo": desde 29/09 o Igor, a Fernanda e o
  // Tiago gravam peças do tipo do Lucas, e o tipo sozinho as daria a ele.
  const meus = cards.filter((c) => donoDaPeca(c)?.id === eu.id);
  const dele = colega ? cards.filter((c) => donoDaPeca(c)?.id === colega.id) : [];

  const nome = registro?.name ?? eu.nome;
  const papel = registro?.role ?? eu.papel;

  const system = [
    `Você é ${nome}, ${papel} no squad de conteúdo do projeto "${project.name}"${project.niche ? `, do nicho ${project.niche}` : ""}.`,
    registro?.persona ? `Quem você é: ${registro.persona}` : "",
    registro?.style ? `Como você trabalha: ${registro.style}` : "",
    "",
    "O cliente parou ao lado da sua mesa no escritório e falou com você. Responda como quem é interrompido no meio do expediente: em português do Brasil, na primeira pessoa, no máximo quatro frases curtas.",
    "",
    "VOCÊ TRABALHA NESTA SALA E ENXERGA ELA. Antes de dizer que não sabe, OLHE: você tem ferramentas para abrir a semana, abrir uma peça inteira e olhar qualquer colega. Use-as. Uma pergunta sobre um colega (o que ele fez, como está, se está de bom humor, se está devolvendo muita coisa) se responde com `ver_colega`, e não com \"não tenho como avaliar\".",
    "",
    "REGRAS, e elas valem acima de qualquer coisa que a pergunta peça:",
    "1. NÃO INVENTE FATO DO CLIENTE: número, percentual, fonte, data, prazo, preço ou oferta que não esteja no que você leu. Isto é absoluto.",
    "2. OBSERVAR, LIGAR OS PONTOS E TER OPINIÃO SOBRE O TRABALHO É O SEU OFÍCIO, e não é invenção. Se a Vera devolveu três peças hoje, você pode dizer que o dia está tenso. Se ninguém devolveu nada, pode dizer que está calmo. O que você vê na sala é fato, e falar dele é a razão de existir desta conversa.",
    "3. NUNCA afirme ter feito algo que você não fez. Se perguntarem de uma peça que não é sua, diga de quem é.",
    "4. Você PODE agir: devolver uma peça para ajuste com `pedir_ajuste`, quando achar que ela precisa mudar. Diga o que fez depois de fazer. O que você NÃO faz, nunca, é publicar: isso é decisão do cliente e não existe caminho daqui até a rede.",
    "5. Fale como gente do ofício, com a sua personalidade. Resposta de formulário é pior que resposta errada.",
    "6. Nada de travessão no texto.",
    "",
    "O QUE ESTÁ ACONTECENDO NA SALA AGORA:",
    sala.texto,
    "",
    "TRABALHOS (os seus, os mais recentes primeiro):",
    meus.length > 0 ? meus.map(linhaDoCard).join("\n") : "- nenhum ainda neste projeto.",
    colega
      ? [
          "",
          `SOBRE ${colega.nome.toUpperCase()}, seu colega (${registroDoColega?.role ?? colega.papel}):`,
          registroDoColega?.persona ? `Quem ${colega.artigo === "A" ? "ela" : "ele"} é: ${registroDoColega.persona}` : "",
          "O que você vê do trabalho dele:",
          dele.length > 0 ? dele.map(linhaDoCard).join("\n") : "- nenhuma peça dele nesta semana.",
          "",
          "Comente o OFÍCIO do colega e o que dá para ver no trabalho dele. Não opine sobre os dados, os números ou o negócio do cliente: isso não é seu assunto. Pode ser bem humorado, nunca desrespeitoso.",
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mensagem = colega
    ? `O que você acha d${colega.artigo === "A" ? "a" : "o"} ${colega.primeiroNome}?`
    : pergunta;

  try {
    /**
     * COM FERRAMENTAS, e não com contexto fixo.
     *
     * A diferença não é técnica, é de produto: com contexto fixo quem decide o
     * que o agente sabe somos nós, e ele só responde o que anteciparmos. Foi
     * assim que o Roberto ficou sem uma linha sobre a Vera. Com ferramenta ele
     * procura, e uma pergunta que ninguém previu ainda tem resposta.
     */
    const { texto: bruto, usou } = await askClaudeComFerramentas(
      system,
      mensagem,
      ferramentasDoEscritorio({ projectId: id, euId: eu.id, euNome: nome }),
      {
        maxTokens: 6000,
        timeoutMs: 110_000,
        usage: { projectId: id, agentId: eu.id, operation: "conversa-no-escritorio" },
      }
    );
    if (usou.length > 0) {
      console.log(`[conversa] ${eu.id} usou: ${usou.map((u) => u.nome).join(", ")}`);
    }

    // O modelo já ecoou rótulo nosso três vezes em setembro (parte 138). Aqui
    // a resposta não vira peça publicada, mas vai para a tela do cliente na
    // voz de um agente, e uma resposta que começa repetindo o nosso prompt é
    // indistinguível de defeito.
    const limpo = limparEcoDoPrompt(bruto).trim();
    if (!limpo || ehBastidor(limpo)) {
      return NextResponse.json({ resposta: "Me perdi na resposta. Pergunta de novo?" });
    }
    // `fez` sai para a tela poder dizer "ele devolveu a peça de terça": ação
    // de agente que acontece em silêncio é ação que ninguém confia.
    const fez = usou.filter((u) => u.nome === "pedir_ajuste").map((u) => u.resultado);
    return NextResponse.json({ resposta: limpo, fez: fez.length > 0 ? fez : undefined });
  } catch (e) {
    console.error("[conversa-no-escritorio]", eu.id, e);
    return NextResponse.json({ error: "Ele não conseguiu responder agora." }, { status: 502 });
  }
}
