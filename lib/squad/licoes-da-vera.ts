import { prisma } from "@/lib/db/prisma";
import { AGENTES, agentePorId } from "@/lib/squad/estado-do-squad";

/**
 * AS LIÇÕES DA VERA: o retreino dos agentes que mais erram (29/09/2026).
 *
 * ## Por que existe
 *
 * O Bruno promoveu a Vera a gerente com três tarefas: supervisionar, conferir a
 * qualidade da peça final e RETREINAR quem erra mais. As duas primeiras ela já
 * fazia dentro do dia; a terceira não existia. O mapa do código de 29/09 achou
 * o buraco exato: a reprovação da Vera ia para o log da campanha e morria ali.
 * O mesmo agente podia errar a mesma coisa toda semana, porque nenhum prompt
 * dele jamais soube que tinha errado.
 *
 * ## Como funciona
 *
 * 1. Toda reprovação vira uma LIÇÃO gravada para o agente que errou (quem é o
 *    culpado sai de `culpadosDaReprovacao`, que lê o parecer dela).
 * 2. Na próxima campanha, cada agente recebe no próprio prompt as lições dele
 *    dos últimos 30 dias, as mais recentes primeiro. Quem erra mais recebe mais
 *    lições, e é isso que "retreinar quem erra mais" quer dizer na prática:
 *    não é ajuste de modelo, é o erro dele voltando para ele antes de escrever.
 * 3. O placar (`placarDeErros`) diz quem está errando mais, para a tela da Vera.
 *
 * Mora em `ProjectMemory` (type "licao"), que já é a memória por projeto, e
 * não em tabela nova: é pouco dado, lido uma vez por fatia da esteira.
 */

const TIPO = "licao";
const JANELA_MS = 30 * 24 * 3600_000;
/** Mais que isto vira ruído no prompt e o agente passa a obedecer a lista e não o pedido. */
const MAX_POR_AGENTE = 5;

export type Licao = { agentId: string; motivo: string; rede?: string; runId?: string; quando: string };

/** Grava uma lição. Falha nunca derruba a esteira: lição perdida é só uma lição a menos. */
export async function gravarLicao(projectId: string, licao: Omit<Licao, "quando">): Promise<void> {
  const quando = new Date().toISOString();
  await prisma.projectMemory
    .create({
      data: {
        projectId,
        type: TIPO,
        // Chave única por lição: agente, instante e um sufixo, porque duas
        // reprovações no mesmo milissegundo (dois agentes do mesmo dia) existem.
        key: `${licao.agentId}:${quando}:${Math.random().toString(36).slice(2, 7)}`,
        value: { ...licao, quando } as never,
      },
    })
    .catch((e) => console.warn(`[licoes] não gravei a lição de ${licao.agentId}: ${e instanceof Error ? e.message : e}`));
}

/** As lições recentes de cada agente, das mais novas para as mais velhas. */
export async function licoesPorAgente(projectId: string, agora = Date.now()): Promise<Map<string, Licao[]>> {
  const linhas = await prisma.projectMemory.findMany({
    where: { projectId, type: TIPO, createdAt: { gte: new Date(agora - JANELA_MS) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { value: true },
  });
  const mapa = new Map<string, Licao[]>();
  for (const { value } of linhas) {
    const l = value as unknown as Licao;
    if (!l?.agentId || !l.motivo) continue;
    const id = agentePorId(l.agentId)?.id ?? l.agentId;
    mapa.set(id, [...(mapa.get(id) ?? []), l]);
  }
  return mapa;
}

/**
 * O bloco que entra no prompt do agente. Vazio quando ele não errou.
 *
 * Diz quantas vezes ele foi reprovado, e não só o quê: "3 reprovações em 30
 * dias" muda o peso que o modelo dá à lista.
 */
export function blocoDeLicoes(licoes: Licao[] | undefined): string {
  if (!licoes?.length) return "";
  const ultimas = licoes.slice(0, MAX_POR_AGENTE).map((l) => `- ${l.rede ? `(${l.rede}) ` : ""}${l.motivo}`);
  return `\n\nLIÇÕES DA VERA, SUA GERENTE: ela reprovou trabalho seu ${licoes.length === 1 ? "1 vez" : `${licoes.length} vezes`} nos últimos 30 dias. Não repita estes erros:\n${ultimas.join("\n")}`;
}

/** Quem mais errou nos últimos 30 dias, para a sala da Vera. */
export async function placarDeErros(projectId: string): Promise<Array<{ agentId: string; nome: string; erros: number; ultimo: string }>> {
  const mapa = await licoesPorAgente(projectId);
  return [...mapa.entries()]
    .map(([agentId, ls]) => ({ agentId, nome: agentePorId(agentId)?.nome ?? agentId, erros: ls.length, ultimo: ls[0].motivo }))
    .sort((a, b) => b.erros - a.erros);
}

/**
 * DE QUEM É O ERRO, lido do parecer da Vera.
 *
 * Até 29/09 toda reprovação de texto ia "para a mesa do Lucas", fixo, mesmo
 * quando o problema era a thread do X. A regra é a mesma que a esteira já usava
 * para decidir quem reescreve: a rede citada perto de uma palavra de defeito.
 * Reprovação de mídia é da Diana. Se nada casar, o dono é o Lucas, que escreve
 * o texto-mãe de que as outras redes derivam.
 */
export function culpadosDaReprovacao(parecer: string, veredito: string): string[] {
  const defeito = "(violação|violacao|invent|problem|reprovad|errad|incorret|corrig|falta|cita)";
  const redes: Array<[string, RegExp]> = [
    ["lucas-linkedin", new RegExp(`linkedin[\\s\\S]{0,400}${defeito}`, "i")],
    ["xavier-x", new RegExp(`(\\bX\\b|thread|twitter)[\\s\\S]{0,400}${defeito}`, "i")],
    ["igor-instagram", new RegExp(`instagram[\\s\\S]{0,400}${defeito}`, "i")],
    ["fernanda-facebook", new RegExp(`facebook[\\s\\S]{0,400}${defeito}`, "i")],
    ["tiago-tiktok", new RegExp(`tiktok[\\s\\S]{0,400}${defeito}`, "i")],
  ];
  const culpados = veredito === "REPROVADO_MIDIA" ? [] : redes.filter(([, re]) => re.test(parecer)).map(([id]) => id);
  if (veredito === "REPROVADO_MIDIA" || veredito === "REPROVADO_AMBOS") culpados.push("diana-design");
  if (!culpados.length) culpados.push("lucas-linkedin");
  return [...new Set(culpados)].filter((id) => AGENTES.some((a) => a.id === id));
}
