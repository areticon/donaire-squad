import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import {
  ALVOS_DA_REGRA,
  ROTULO_DO_ALVO,
  type Achado,
  type AlvoDaRegra,
  type RegraDoProjeto,
  type StatusDaRegra,
} from "@/lib/referencias/tipos-das-analises";

/**
 * AS REGRAS DO PROJETO, PROPOSTAS PELO ROBERTO E APROVADAS PELO CLIENTE (02/10/2026).
 *
 * Pedido do Bruno: "trazer as análises para o usuário e depois treinar os
 * agentes, a documentação e regras do projeto; o usuário aprova as regras ou
 * não, e isso vale sempre". É o "caderno que aprende" que estava pendente.
 *
 * O CICLO:
 *   1. o Roberto lê os ACHADOS (lib/referencias/achados.ts, número contado
 *      pelo código) e propõe até 6 regras, cada uma presa a UM achado;
 *   2. o cliente aprova, edita (e aprova) ou recusa cada uma, e pode escrever
 *      a dele;
 *   3. só a APROVADA entra no que os agentes leem (blocoDasRegras), e vale
 *      sempre, até o cliente desligar. O achado que a sustentou fica copiado
 *      na regra: o estudo seguinte pode mudar o número, e a regra aprovada não
 *      some por isso (é decisão do cliente, não estatística);
 *   4. proposta que ninguém decidiu e cujo achado sumiu no estudo seguinte é
 *      apagada (estado que sobrevive ao fato vira mentira na tela). Recusada
 *      nunca volta: a régua de parecença barra a mesma regra com outras
 *      palavras.
 *
 * ONDE A APROVADA ENTRA (cada alvo no prompt de quem faz aquilo):
 *   roteiro  linha editorial (ideias e roteiros do Roberto) e o prefixo da
 *            campanha (lib/pipeline/executar.ts);
 *   redacao  o prefixo da campanha, que todo agente de texto lê;
 *   arte     a identidade visual (lib/media/identidade-visual.ts), que a
 *            arte com frase lê;
 *   edicao   o perfil do projeto (lib/media/perfil-do-projeto.ts), que o
 *            diretor de montagem e o revisor leem.
 *
 * Mora em ProjectMemory (tipo "regra", uma linha por regra), sem migração.
 */

const TIPO = "regra";
/** Mais que isto vira ruído no prompt e o agente obedece a lista e não o pedido. */
const MAX_APROVADAS_NO_PROMPT = 12;
const MAX_PROPOSTAS_ABERTAS = 8;

const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();

function palavras(t: string): Set<string> {
  return new Set(
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

/** Parecença por palavras em comum (0 a 1). Acima de 0,55 é a mesma regra com outras palavras. */
export function parecencaDaRegra(a: string, b: string): number {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.size || !y.size) return 0;
  let comum = 0;
  for (const w of x) if (y.has(w)) comum++;
  return comum / Math.min(x.size, y.size);
}

const ORDEM: Record<StatusDaRegra, number> = { proposta: 0, aprovada: 1, desligada: 2, recusada: 3 };

export async function listarRegras(projectId: string): Promise<RegraDoProjeto[]> {
  const linhas = await prisma.projectMemory.findMany({ where: { projectId, type: TIPO }, select: { value: true } });
  return linhas
    .map((l) => l.value as unknown as RegraDoProjeto)
    .filter((r) => r && typeof r.texto === "string" && r.id)
    .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || (b.decididaEm ?? b.propostaEm).localeCompare(a.decididaEm ?? a.propostaEm));
}

async function gravar(projectId: string, r: RegraDoProjeto) {
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO, key: r.id } },
    create: { projectId, type: TIPO, key: r.id, value: r as never },
    update: { value: r as never },
  });
}

/** As aprovadas, de um alvo (ou de todos). Falha de leitura vira lista vazia: regra nunca derruba agente. */
export async function regrasAprovadas(projectId: string | null | undefined, alvos?: AlvoDaRegra[]): Promise<RegraDoProjeto[]> {
  if (!projectId) return [];
  try {
    const todas = await listarRegras(projectId);
    return todas.filter((r) => r.status === "aprovada" && (!alvos || r.alvos.some((a) => alvos.includes(a)))).slice(0, MAX_APROVADAS_NO_PROMPT);
  } catch (e) {
    console.warn(`[regras] ${projectId}: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** O bloco que entra no prompt. Vazio quando não há regra aprovada. */
export function blocoDasRegras(regras: RegraDoProjeto[]): string {
  if (!regras.length) return "";
  return `\n\nREGRAS DO PROJETO (aprovadas pelo cliente a partir do que rende nos perfis de referência; valem sempre, acima das preferências de estilo, mas nunca acima da verdade dos fatos nem das guardas do setor):\n${regras
    .map((r) => `- ${r.texto}`)
    .join("\n")}`;
}

/** O bloco de um alvo, lido do banco: o atalho para quem monta prompt. */
export async function blocoDasRegrasDoProjeto(projectId: string | null | undefined, alvos: AlvoDaRegra[]): Promise<string> {
  return blocoDasRegras(await regrasAprovadas(projectId, alvos));
}

/**
 * Apaga as propostas que ninguém decidiu e cujo achado não existe mais.
 * Aprovada, recusada e desligada ficam: são decisão do cliente.
 */
export async function limparPropostasVencidas(projectId: string, achados: Achado[]): Promise<number> {
  const chaves = new Set(achados.map((a) => a.chave));
  const todas = await listarRegras(projectId);
  const vencidas = todas.filter((r) => r.status === "proposta" && r.origem === "roberto" && r.achado && !chaves.has(r.achado.chave));
  if (!vencidas.length) return 0;
  await prisma.projectMemory.deleteMany({ where: { projectId, type: TIPO, key: { in: vencidas.map((r) => r.id) } } });
  return vencidas.length;
}

/** Custo estimado de uma rodada de propostas (Sonnet 5, esforço médio, medido em 02/10). */
export const CUSTO_DAS_PROPOSTAS_USD = 0.06;

/**
 * O Roberto propõe regras a partir dos achados. Devolve as novas.
 * Não propõe de novo o que já existe (em qualquer estado) nem o que foi recusado.
 */
export async function proporRegras(projectId: string, achados: Achado[]): Promise<{ novas: RegraDoProjeto[]; apagadas: number }> {
  const apagadas = await limparPropostasVencidas(projectId, achados);
  // Só o que pode virar regra: comparação, conversa, salvamento e ritmo. O
  // destaque (um post) é exemplo, não regra; ele vai junto como contexto.
  const base = achados.filter((a) => a.tipo !== "destaque");
  if (!base.length) return { novas: [], apagadas };
  const existentes = await listarRegras(projectId);
  const abertas = existentes.filter((r) => r.status === "proposta").length;
  const vagas = Math.max(0, Math.min(6, MAX_PROPOSTAS_ABERTAS - abertas));
  if (!vagas) return { novas: [], apagadas };

  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, niche: true, targetAudience: true, voice: true } });
  const listaDeAchados = base
    .map((a, i) => `${i + 1}. [${a.forca === "forte" ? "FORTE" : "INDÍCIO"}; ${a.amostra.posts} posts de ${a.amostra.perfis} perfil(is)] ${a.frase}`)
    .join("\n");
  const exemplos = achados
    .filter((a) => a.tipo === "destaque")
    .map((a) => `- ${a.frase}`)
    .join("\n");
  const jaExistem = existentes.map((r) => `- (${r.status}) ${r.texto}`).join("\n");

  const sistema =
    "Você é o Roberto, estrategista da linha editorial. Transforma o que os números dos perfis de referência mostram em REGRAS de trabalho para o squad (roteiro, textos, arte e edição) de UM cliente. Nunca use travessão: use vírgula, dois-pontos ou parênteses. Nunca invente número: cite só os achados que recebeu. Não use sigla sem explicar (escreva \"chamada para ação\", não CTA). Responda só com JSON.";
  const pedido = `CLIENTE: ${p.name}
NICHO: ${(p.niche ?? "").slice(0, 600)}
PÚBLICO: ${(p.targetAudience ?? "").slice(0, 500)}
VOZ DA MARCA: ${(p.voice ?? "").slice(0, 1200)}

ACHADOS DOS PERFIS DE REFERÊNCIA (contados pelo sistema; FORTE = 5 posts ou mais, 2 perfis ou mais, todos na mesma direção):
${listaDeAchados}
${exemplos ? `\nPOSTS QUE MAIS PASSARAM DO NORMAL (só contexto, não viram regra sozinhos):\n${exemplos}\n` : ""}
REGRAS QUE JÁ EXISTEM (não repita, nem com outras palavras; as recusadas nunca voltam):
${jaExistem || "(nenhuma)"}

Proponha até ${vagas} regras novas. Cada regra:
- nasce de UM achado (o número dele em "achado");
- é uma instrução prática e conferível para quem escreve, desenha ou edita, no imperativo, em até 200 caracteres (ex.: "Abrir o reel com a frase de efeito antes do contexto", "Carrossel em lista de 5 itens, um por lâmina");
- respeita a voz, o nicho e o público deste cliente: se o achado não combina com a voz (humor numa marca sóbria, polêmica num tema sensível), adapte a regra para o jeito do cliente ou não proponha;
- copia o MOLDE, nunca o conteúdo: nada de frase, caso, visual ou nome de quem fez;
- em "alvos", quem precisa obedecer: ${ALVOS_DA_REGRA.map((a) => `"${a}" (${ROTULO_DO_ALVO[a]})`).join(", ")};
- em "porque", uma frase que repete o número que o achado mostra (a porcentagem ou as vezes) e o tamanho da amostra, sem escrever "achado 3" (o cliente não vê essa numeração); se o achado for INDÍCIO, diga que é um teste. Não escreva as palavras FORTE nem INDÍCIO (são rótulos internos).
Prefira os achados FORTES. Achado que diz o que NÃO funciona também vira regra ("evitar ...").

Responda {"regras":[{"achado":1,"texto":"...","porque":"...","alvos":["roteiro"]}]}`;

  const bruto = await askClaude(sistema, pedido, { maxTokens: 8000, effort: "medium", usage: { projectId, operation: "referencias_regras" } });
  let lidas: Array<{ achado?: number; texto?: string; porque?: string; alvos?: string[] }> = [];
  try {
    lidas = (JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { regras?: typeof lidas }).regras ?? [];
  } catch {
    console.warn(`[regras] resposta sem JSON: ${bruto.slice(0, 200)}`);
  }
  const novas: RegraDoProjeto[] = [];
  const agora = new Date().toISOString();
  for (const l of lidas) {
    const achado = base[Number(l.achado) - 1];
    const texto = semTravessao(String(l.texto ?? "")).slice(0, 220);
    if (!achado || texto.length < 12) continue;
    // A régua contra tudo que já existe (inclusive recusadas) e contra as novas.
    if ([...existentes, ...novas].some((r) => parecencaDaRegra(r.texto, texto) >= 0.55)) continue;
    const alvos = (Array.isArray(l.alvos) ? l.alvos : []).filter((a): a is AlvoDaRegra => (ALVOS_DA_REGRA as string[]).includes(a));
    const regra: RegraDoProjeto = {
      id: randomUUID(),
      texto,
      textoOriginal: null,
      // A numeração da lista é nossa: "Achado 3 (FORTE, ...):" não diz nada ao cliente.
      porque: semTravessao(String(l.porque ?? "")).replace(/^\s*achado\s*\d+\s*(\([^)]*\))?\s*[:,.]?\s*/i, "").replace(/^./, (c) => c.toUpperCase()).slice(0, 300),
      alvos: alvos.length ? [...new Set(alvos)] : ["roteiro", "redacao"],
      status: "proposta",
      origem: "roberto",
      achado: { chave: achado.chave, frase: achado.frase, amostra: achado.amostra, forca: achado.forca },
      propostaEm: agora,
      decididaEm: null,
    };
    await gravar(projectId, regra);
    novas.push(regra);
    if (novas.length >= vagas) break;
  }
  return { novas, apagadas };
}

export type DecisaoDaRegra = { acao: "aprovar" | "recusar" | "desligar" | "religar" | "editar"; texto?: string; alvos?: string[] };

/** O cliente decide. "editar" grava o texto novo e aprova junto (é o que o botão "Salvar e aprovar" faz). */
export async function decidirRegra(projectId: string, id: string, d: DecisaoDaRegra): Promise<RegraDoProjeto | null> {
  const linha = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: TIPO, key: id } }, select: { value: true } });
  const r = linha?.value as unknown as RegraDoProjeto | undefined;
  if (!r) return null;
  const agora = new Date().toISOString();
  const alvos = (d.alvos ?? []).filter((a): a is AlvoDaRegra => (ALVOS_DA_REGRA as string[]).includes(a));
  const nova: RegraDoProjeto = { ...r, decididaEm: agora, ...(alvos.length ? { alvos } : {}) };
  if (d.acao === "aprovar" || d.acao === "religar") nova.status = "aprovada";
  else if (d.acao === "recusar") nova.status = "recusada";
  else if (d.acao === "desligar") nova.status = "desligada";
  else if (d.acao === "editar") {
    const texto = semTravessao(String(d.texto ?? "")).slice(0, 220);
    if (texto.length < 8) throw new Error("Escreva a regra com pelo menos uma frase curta.");
    if (texto !== r.texto) nova.textoOriginal = r.textoOriginal ?? r.texto;
    nova.texto = texto;
    nova.status = "aprovada";
  }
  await gravar(projectId, nova);
  return nova;
}

/** Uma regra escrita pelo próprio cliente: já nasce aprovada. */
/**
 * `porque` (03/10): quando a regra nasce de uma recomendação do painel
 * executivo ("Virar regra"), o dado que a justificou vai junto, para a lista
 * de regras mostrar de onde ela veio.
 */
export async function criarRegraDoCliente(projectId: string, texto: string, alvos: string[], porque?: string): Promise<RegraDoProjeto> {
  const limpo = semTravessao(texto).slice(0, 220);
  if (limpo.length < 8) throw new Error("Escreva a regra com pelo menos uma frase curta.");
  const validos = alvos.filter((a): a is AlvoDaRegra => (ALVOS_DA_REGRA as string[]).includes(a));
  const agora = new Date().toISOString();
  const r: RegraDoProjeto = {
    id: randomUUID(),
    texto: limpo,
    textoOriginal: null,
    porque: porque ? semTravessao(porque).slice(0, 300) : "Regra escrita por você.",
    alvos: validos.length ? validos : ["roteiro", "redacao"],
    status: "aprovada",
    origem: "cliente",
    achado: null,
    propostaEm: agora,
    decididaEm: agora,
  };
  await gravar(projectId, r);
  return r;
}

/** A última vez que o Roberto propôs regras (para a tela saber se o estudo é mais novo). */
export async function ultimaProposta(projectId: string): Promise<Date | null> {
  const todas = await listarRegras(projectId);
  const datas = todas.filter((r) => r.origem === "roberto").map((r) => new Date(r.propostaEm).getTime());
  return datas.length ? new Date(Math.max(...datas)) : null;
}
