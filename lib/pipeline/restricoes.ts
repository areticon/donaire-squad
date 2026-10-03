import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";

/**
 * O QUE O CLIENTE PROÍBE DE CITAR, e como a esteira obedece.
 *
 * Nasceu em 21/09, na campanha da Areticon: a pesquisa do Roberto achou o
 * relatório da Volt Robotics como melhor fonte sobre curtailment, e dezenove
 * posts saíram citando a Volt como autoridade. A Volt é concorrente da
 * Areticon. O Bruno pediu no chat do card ("nunca cite a Volt Robotics, são
 * nossos concorrentes") e nada mudou, porque o chat do card do Paulo editava
 * o texto DO CARD DO PAULO ("2 posts prontos para publicação").
 *
 * A regra vive numa memória do projeto (`ProjectMemory`, tipo "restricao",
 * chave "nao_citar"), sem coluna nova, e é lida em quatro lugares:
 *
 *   1. na PESQUISA: fontes com o nome saem antes de o Roberto escrever, e ele
 *      recebe a ordem de não usar dados delas. Sem isto o número entra no
 *      brief, o redator o usa, e a regra do lastro obriga a citar a fonte;
 *   2. no PREFIXO cacheado: todo agente lê "nunca cite X";
 *   3. na VERA: menção é violação medida, reprova sozinha;
 *   4. na TESOURA antes de gravar: o que sobrar sai.
 *
 * E o chat do card passa a entender "nunca cite X": salva a regra e aplica
 * nos rascunhos da campanha inteira, porque uma restrição de concorrente não
 * é de um dia só.
 */

const TIPO = "restricao";
const CHAVE = "nao_citar";

export async function lerNaoCitar(projectId: string): Promise<string[]> {
  const m = await prisma.projectMemory.findUnique({
    where: { projectId_type_key: { projectId, type: TIPO, key: CHAVE } },
    select: { value: true },
  });
  const v = m?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

export async function salvarNaoCitar(projectId: string, nomes: string[]): Promise<string[]> {
  const atuais = await lerNaoCitar(projectId);
  const todos = [...atuais];
  for (const n of nomes) if (!todos.some((t) => t.toLowerCase() === n.toLowerCase())) todos.push(n);
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO, key: CHAVE } },
    create: { projectId, type: TIPO, key: CHAVE, value: todos, metadata: { origem: "chat do card" } },
    update: { value: todos },
  });
  return todos;
}

/**
 * "nunca cite a Volt Robotics, são nossos concorrentes" -> ["Volt Robotics"].
 *
 * O nome vai do verbo até a primeira vírgula, ponto, ou conectivo. Regex e
 * não modelo, de propósito: é uma frase de forma fixa e o erro de uma
 * extração é visível no chat na hora ("Regra salva: nunca citar X").
 */
export function extrairNaoCitar(mensagem: string): string[] {
  // Só "citar" e "mencionar": "não use travessão" é instrução de estilo, não
  // nome de concorrente, e "usar" no padrão transformava a palavra em regra.
  const re =
    /\b(?:nunca|n[ãa]o|jamais|proibido)\s+(?:cite|citar|mencione|mencionar)\s+(?:[ao]s?\s+|d[ao]s?\s+)?([^,.;:\n]+?)(?=\s*(?:,|\.|;|:|\n|\bque\b|\bs[ãa]o\b|\bporque\b|\bpois\b|\bcomo fonte\b|$))/gi;
  const nomes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(mensagem)) !== null) {
    // Só o artigo sai: "Empresa X" e "Marca Y" podem ser o nome inteiro.
    const nome = m[1].trim().replace(/^(a|o|as|os)\s+/i, "").trim();
    if (nome.length >= 3 && nome.length <= 60 && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** As frases do texto que mencionam algum nome proibido. */
export function mencoesProibidas(texto: string, nomes: string[]): string[] {
  if (nomes.length === 0) return [];
  const alvos = nomes.map(semAcento);
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && alvos.some((n) => semAcento(f).includes(n)));
}

/** Tira das fontes e do resumo da pesquisa tudo que vem de um nome proibido. */
export function removerFontesProibidas<T extends { title: string; url: string }>(
  fontes: T[],
  resumo: string,
  nomes: string[]
): { fontes: T[]; resumo: string; removidas: number } {
  if (nomes.length === 0) return { fontes, resumo, removidas: 0 };
  const alvos = nomes.map(semAcento);
  const cita = (t: string) => alvos.some((n) => semAcento(t).includes(n));
  const fontesLimpas = fontes.filter((f) => !cita(`${f.title} ${f.url}`));
  const linhas = resumo.split("\n");
  const resumoLimpo = linhas.filter((l) => !cita(l)).join("\n");
  return { fontes: fontesLimpas, resumo: resumoLimpo, removidas: fontes.length - fontesLimpas.length + (linhas.length - resumoLimpo.split("\n").length) };
}

/**
 * Reescreve UM texto sem os nomes proibidos. O dado que só existia naquela
 * fonte sai junto: trocar a fonte por outra seria inventar lastro.
 */
export async function reescreverSemCitar(opcoes: {
  texto: string;
  nomes: string[];
  plataforma: string;
  projeto: { id: string; name: string; voice?: string | null };
  runId?: string | null;
}): Promise<string> {
  const { texto, nomes } = opcoes;
  const frases = mencoesProibidas(texto, nomes);
  if (frases.length === 0) return texto;
  const system = `Você edita um texto de ${opcoes.plataforma} do projeto "${opcoes.projeto.name}". Tom: ${opcoes.projeto.voice ?? "profissional"}.
Devolva APENAS o texto final, sem comentários, sem prefixos, sem markdown.`;
  const pedido = `REGRA DO CLIENTE: nunca citar ${nomes.map((n) => `"${n}"`).join(", ")} (concorrentes). Nem como fonte, nem como exemplo, nem como autoridade.

Reescreva o texto abaixo removendo TODA menção a esses nomes. Se um número, ranking ou afirmação só se sustenta por essa fonte, remova o dado inteiro em vez de trocar a fonte por outra (trocar seria inventar). Mantenha tudo o mais igual: estrutura, tom, tamanho, numeração dos tweets se houver.

TEXTO:
${texto}`;
  const bruto = await askClaude(system, pedido, {
    maxTokens: 8000,
    usage: { operation: "restricao_nao_citar", projectId: opcoes.projeto.id, runId: opcoes.runId ?? undefined },
  });
  const peca = pecaPublicavel(bruto);
  let final = "recusado" in peca ? texto : peca.texto;
  // O que o modelo deixou passar sai na tesoura: a regra é do cliente.
  const sobra = mencoesProibidas(final, nomes);
  if (sobra.length) final = sobra.reduce((t, f) => t.replace(f, ""), final).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return final;
}

/**
 * Aplica a regra em TODOS os rascunhos de uma execução (posts e cards dos
 * redatores). Só mexe em post não publicado. Devolve quantos mudaram.
 */
export async function aplicarNaoCitarNaExecucao(runId: string, nomes: string[]): Promise<{ posts: number; cards: number }> {
  if (nomes.length === 0) return { posts: 0, cards: 0 };
  const run = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: runId },
    select: { projectId: true, project: { select: { id: true, name: true, voice: true } } },
  });
  const posts = await prisma.post.findMany({
    where: { runId, status: { notIn: ["published", "publishing"] } },
    select: { id: true, platform: true, content: true },
  });
  let nPosts = 0;
  const porTexto = new Map<string, string>();
  for (const p of posts) {
    if (mencoesProibidas(p.content, nomes).length === 0) continue;
    // O mesmo texto em duas contas da mesma rede é reescrito uma vez.
    const chave = `${p.platform}\n${p.content}`;
    const novo = porTexto.get(chave) ?? (await reescreverSemCitar({ texto: p.content, nomes, plataforma: p.platform, projeto: run.project, runId }));
    porTexto.set(chave, novo);
    if (novo !== p.content) {
      await prisma.post.update({ where: { id: p.id }, data: { content: novo } });
      nPosts++;
    }
  }
  const cards = await prisma.campaignCard.findMany({
    where: { runId, cardType: { in: ["post_linkedin", "post_twitter"] }, NOT: { status: "archived" } },
    select: { id: true, cardType: true, content: true },
  });
  let nCards = 0;
  for (const c of cards) {
    if (!c.content || mencoesProibidas(c.content, nomes).length === 0) continue;
    const plataforma = c.cardType === "post_twitter" ? "twitter" : "linkedin";
    const chave = `${plataforma}\n${c.content}`;
    const novo = porTexto.get(chave) ?? (await reescreverSemCitar({ texto: c.content, nomes, plataforma, projeto: run.project, runId }));
    porTexto.set(chave, novo);
    if (novo !== c.content) {
      await prisma.campaignCard.update({ where: { id: c.id }, data: { content: novo } });
      nCards++;
    }
  }
  return { posts: nPosts, cards: nCards };
}
