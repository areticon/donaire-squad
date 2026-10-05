import { prisma } from "@/lib/db/prisma";
import { askClaudeComFerramentas } from "@/lib/claude/ferramentas";
import { nomeDoDono } from "@/lib/equipe/conta";
import { fraseSoODono } from "@/lib/equipe/regras";
import { limparEcoDoPrompt } from "@/lib/pipeline/guarda-de-texto";
import { ferramentasDaGerente, classificarPlano, type PlanoDaVera } from "@/lib/vera/ferramentas-da-gerente";
import { promptDaGerente, mensagemParaAVera, type TurnoParaAVera } from "@/lib/vera/prompt-da-gerente";
import { aplicarPedido, gravarPedido, novoPedido, paraATela, type ExecutorDeAcao } from "@/lib/vera/pedidos";
import { mapaDaTela } from "@/lib/vera/mapa-da-tela";
import { ID_DA_VERA, type PedidoNaTela } from "@/lib/vera/tipos";

/**
 * O MODELO DA GERENTE: Opus 5, e não o Sonnet padrão da casa (01/10).
 *
 * Ela decide sozinha que ferramenta usar e escreve para o dono da conta o que
 * vai mudar no projeto dele: é onde errar custa confiança. Medido na prova de
 * 05/10, com as mesmas seis falas: o Sonnet escreveu "já corrigi" num pedido
 * que ainda esperava o ok e inventou uma âncora de link; o Opus não. O volume
 * é pequeno (uma fala por pedido do cliente), então a diferença de preço quase
 * não aparece na conta. A reescrita das legendas continua no Sonnet, que só
 * aplica uma instrução fechada. Para testar outro: VERA_MODELO.
 */
const MODELO_DA_VERA = process.env.VERA_MODELO || "claude-opus-5";

/**
 * OS LINKS DA FALA SÓ APONTAM PARA ONDE EXISTE. Visto na prova de 05/10: a Vera
 * escreveu "#regras-do-votação-do-projeto", uma âncora que não existe. Link da
 * fala que não está no mapa da tela nem nos itens do pedido é corrigido para o
 * caminho conhecido de mesma página, ou perde o link e fica só o texto.
 */
function linksConferidos(texto: string, projectId: string, extras: string[]): string {
  const conhecidos = new Set([...(mapaDaTela(projectId).match(/\/projects\/[^\s),]+/g) ?? []), ...extras]);
  const pagina = (u: string) => u.split(/[?#]/)[0];
  return texto
    .replace(/\[([^\]]{1,80})\]\((\/[^\s)]+)\)/g, (_m, rotulo: string, href: string) => {
      if (conhecidos.has(href)) return `[${rotulo}](${href})`;
      const mesma = [...conhecidos].find((c) => pagina(c) === pagina(href));
      return mesma ? `[${rotulo}](${mesma})` : rotulo;
    })
    .replace(/\(\s*(\/projects\/[^\s),]+)\s*\)/g, (m, href: string) => (conhecidos.has(href) ? m : ""));
}

/**
 * UMA FALA COM A VERA GERENTE, do pedido ao plano (04/10/2026).
 *
 * A Vera lê o projeto e prepara as mudanças com as ferramentas; daqui sai a
 * decisão do que acontece com o plano:
 *
 *   vazio   foi só conversa ou dúvida; volta a resposta;
 *   pequeno uma regra, uma peça, um dia da agenda: gravado AGORA, e a tela
 *           mostra "Desfazer";
 *   amplo   várias peças, setup da marca, custo: fica PROPOSTO, e a tela
 *           mostra a lista com antes e depois e o botão "Aplicar".
 *
 * Quem chama já conferiu que a pessoa usa o projeto (a rota faz isso).
 */
export async function conversarComAVera(args: {
  projectId: string;
  userId: string;
  mensagem: string;
  conversa?: TurnoParaAVera[];
  executar: ExecutorDeAcao;
}): Promise<{ resposta: string; pedido?: PedidoNaTela; usou: string[] }> {
  const { projectId, userId } = args;
  const [projeto, eu, registro] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, userId: true, name: true, niche: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.projectAgent.findFirst({ where: { projectId, agentId: ID_DA_VERA }, select: { name: true, persona: true } }),
  ]);
  const ehDono = projeto.userId === userId;
  const quemPede = eu?.name?.trim() || eu?.email || "você";
  const dono = ehDono ? quemPede : await nomeDoDono(projeto.userId);

  const plano: PlanoDaVera = { mudancas: [], acoes: [] };
  const ferramentas = ferramentasDaGerente({ projectId, userId, ehDono, fraseSoODono: (oQue) => fraseSoODono(dono, oQue), plano });
  const system = promptDaGerente({
    projectId,
    nomeDoProjeto: projeto.name,
    nicho: projeto.niche,
    nomeDaVera: registro?.name,
    persona: registro?.persona,
    quemPede,
    ehDono,
    dono,
  });

  const r = await askClaudeComFerramentas(system, mensagemParaAVera(args.conversa, args.mensagem), ferramentas, {
    model: MODELO_DA_VERA,
    maxTokens: 6000,
    effort: "medium",
    timeoutMs: 120_000,
    usage: { projectId, agentId: ID_DA_VERA, operation: "vera_gerente" },
  });
  const usou = r.usou.map((u) => u.nome);
  const extras = [...plano.mudancas.map((m) => m.link), ...plano.acoes.map((a) => a.item.link)].filter((l): l is string => Boolean(l));
  const texto = linksConferidos(limparEcoDoPrompt(r.texto).replace(/\s*[—–]\s*/g, ", ").trim(), projectId, extras);

  if (!plano.mudancas.length && !plano.acoes.length) {
    return { resposta: texto || "Me perdi na resposta. Pode repetir?", usou };
  }

  const titulos = [...plano.mudancas.map((m) => m.titulo), ...plano.acoes.map((x) => x.item.titulo)];
  const { amplo, custo } = classificarPlano(plano);
  let pedido = novoPedido({
    projectId,
    userId,
    pedidoPor: quemPede,
    pedido: args.mensagem,
    resumo: titulos.length <= 3 ? titulos.join("; ") : `${titulos.length} mudanças: ${titulos.slice(0, 2).join("; ")} e mais ${titulos.length - 2}`,
    mudancas: plano.mudancas,
    acoes: plano.acoes,
    amplo,
    custoCreditos: custo,
  });
  await gravarPedido(pedido);
  // Pequeno grava agora. Ação de custo sempre torna o pedido amplo, então aqui não roda geração.
  if (!amplo) pedido = await aplicarPedido(pedido, args.executar);
  return { resposta: texto || "Pronto.", pedido: paraATela(pedido), usou };
}
