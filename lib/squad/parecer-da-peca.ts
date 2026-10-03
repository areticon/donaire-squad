import { prisma } from "@/lib/db/prisma";
import { lerVeredito, type VereditoDaVera } from "@/lib/squad/veredito";
import { lerCorrecaoDaVera, type CorrecaoDaVera } from "@/lib/squad/estado-da-correcao";

/**
 * O PARECER DE UMA PEÇA, COMO LINHA DO TEMPO.
 *
 * Pedido do Bruno em 19/09, olhando a ficha da Diana: "vejo tudo reprovado
 * pela Vera, não mostra o que foi revisado e depois aprovado". O selo único
 * ("Vera: reprovado") contava só o primeiro golpe. O que a pessoa precisa ler
 * é a HISTÓRIA da peça: a Vera reprovou, o redator corrigiu, o cliente
 * aprovou (ou rejeitou), a rede publicou (ou falhou).
 *
 * Cada etapa vem de um lugar diferente do banco, e é por isso que este módulo
 * existe: o card da Vera guarda o veredito e a correção; o card de publicação
 * guarda a aprovação do cliente; os POSTS do dia guardam a rejeição (o modal
 * rejeita marcando os posts, não o card) e o desfecho na rede.
 *
 * `linhaDoTempoDoParecer` é pura, para o renderToString provar os cenários
 * sem banco. `parecerDosCards` faz as leituras em lote, para a ficha de um
 * agente não disparar três consultas por trabalho.
 */

export type TomDaEtapa = "ok" | "alerta" | "erro" | "neutro";

export type EtapaDoParecer = {
  /** "reprovado pela Vera", "corrigido pelo redator", "aprovado por você"... */
  rotulo: string;
  tom: TomDaEtapa;
  /** O motivo, quando há um: a nota da Vera na reprovação. */
  nota?: string | null;
};

export type ParecerDaPeca = {
  veredito: VereditoDaVera;
  etapas: EtapaDoParecer[];
  /**
   * O mp4 da peça, quando o dia é de vídeo e ele já existe. Vem dos posts do
   * dia quando o card da Diana ainda guarda o quadro (o trabalho de vídeo
   * atualizava os posts e não o card, até 19/09).
   */
  videoUrl: string | null;
};

const ehMp4 = (url: string | null | undefined): url is string =>
  Boolean(url && !url.startsWith("data:image") && /\.(mp4|webm)(\?|$)/i.test(url));

export function linhaDoTempoDoParecer(entrada: {
  veredito: VereditoDaVera;
  /** O status do card aberto (a própria peça). */
  statusDoCard: string;
  /** O status do card de publicação do dia, que é onde a aprovação fica gravada. */
  statusDoPrincipal: string | null;
  /** Os status dos posts do dia: é neles que a rejeição e o desfecho na rede moram. */
  statusDosPosts: string[];
  /**
   * A correção que o squad faz sozinho depois da Vera (29/09), lida do card
   * dela. Quando existe, é ELA que conta a história do dia: o cliente não
   * recebe "reprovado", recebe "o squad está corrigindo" ou, sem conserto
   * depois de 2 tentativas, "precisa de você" com o que fazer.
   */
  correcao?: CorrecaoDaVera | null;
}): EtapaDoParecer[] {
  const etapas: EtapaDoParecer[] = [];
  const v = entrada.veredito;
  const c = entrada.correcao ?? null;

  if (c) {
    // 1 e 2 contados pela correção.
    if (c.estado === "corrigindo") {
      // Nada de "esperando você": o squad ainda está trabalhando.
      etapas.push({ rotulo: "Vera pediu correção", tom: "alerta", nota: c.motivo });
      etapas.push({ rotulo: `o squad está corrigindo (tentativa ${Math.max(1, c.tentativa)} de ${c.maxTentativas})`, tom: "neutro" });
      return etapas;
    }
    etapas.push({ rotulo: "Vera pediu correção", tom: "alerta", nota: c.motivo });
    if (c.estado === "corrigido") {
      etapas.push({ rotulo: c.tentativa === 1 ? "corrigido pelo squad" : `corrigido pelo squad em ${c.tentativa} tentativas`, tom: "ok" });
      // O veredito da última volta mora no histórico da correção: o texto do
      // card da semana do vídeo ("Veredito: Aprovado com ressalvas") é lido
      // como "aprovado" pelo `lerVeredito`, que para no primeiro espaço.
      const ultimo = c.historico?.[c.historico.length - 1]?.veredito;
      if (ultimo === "APROVADO_COM_RESSALVAS" || v.chave === "ressalvas") etapas.push({ rotulo: "aprovado com ressalvas pela Vera", tom: "alerta", nota: v.nota });
      else etapas.push({ rotulo: "aprovado pela Vera", tom: "ok" });
    }
  } else {
    // 1. A Vera. Sem veredito não há etapa: pesquisa e publicação não passam
    //    por ela, e "sem veredito" numa linha do tempo leria como pendência.
    if (v.chave === "aprovado") etapas.push({ rotulo: "aprovado pela Vera", tom: "ok" });
    if (v.chave === "ressalvas") etapas.push({ rotulo: "aprovado com ressalvas pela Vera", tom: "alerta", nota: v.nota });
    // A reprovação que JÁ foi corrigida é pedido de correção, não sentença:
    // "reprovado pela Vera" sobre peça consertada era o que o Bruno recusou.
    if (v.chave === "corrigido") etapas.push({ rotulo: "Vera pediu correção", tom: "alerta", nota: v.nota });
    if (v.chave === "reprovado") etapas.push({ rotulo: "reprovado pela Vera", tom: "erro", nota: v.nota });
    // 2. O redator, só quando a correção automática rodou de fato.
    if (v.chave === "corrigido") etapas.push({ rotulo: "corrigido pelo redator", tom: "ok" });
  }

  // 3. O cliente. A rejeição está nos POSTS (o modal marca os posts do dia),
  //    a aprovação no card de publicação, e o ajuste pedido no próprio card
  //    (é o que `pedir_ajuste` dos agentes grava).
  const posts = entrada.statusDosPosts;
  const rejeitou = posts.includes("rejected") || entrada.statusDoCard === "rejected";
  const publicou = posts.some((s) => ["published", "scheduled", "publishing"].includes(s));
  const aprovou =
    entrada.statusDoCard === "approved" || entrada.statusDoPrincipal === "approved" || publicou;
  if (rejeitou) etapas.push({ rotulo: "rejeitado por você", tom: "erro" });
  else if (entrada.statusDoCard === "needs_revision") etapas.push({ rotulo: "ajuste pedido", tom: "alerta" });
  else if (aprovou) etapas.push({ rotulo: "aprovado por você", tom: "ok" });
  // Sem conserto em 2 tentativas: o cliente recebe o que fazer, não um selo.
  else if (c?.estado === "sem_conserto") {
    etapas.push({ rotulo: `o squad tentou ${c.tentativa === 1 ? "1 vez" : `${c.tentativa} vezes`}`, tom: "alerta" });
    etapas.push({ rotulo: "precisa de você", tom: "erro", nota: c.oQueFazer ?? c.motivo });
  } else if (etapas.length > 0) etapas.push({ rotulo: "esperando você", tom: "neutro" });

  // 4. A rede. Um dia com quatro redes pode ter publicado numa e falhado em
  //    outra: a falha aparece, porque é ela que pede ação.
  if (!rejeitou) {
    if (posts.includes("failed")) etapas.push({ rotulo: "falhou ao publicar", tom: "erro" });
    if (posts.includes("published")) etapas.push({ rotulo: "publicado", tom: "ok" });
    else if (posts.some((s) => s === "scheduled" || s === "publishing")) etapas.push({ rotulo: "agendado", tom: "neutro" });
  }

  return etapas;
}

type CardParaParecer = {
  id: string;
  runId: string;
  dayOfWeek: number;
  cardType: string;
  status: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
};

/**
 * O parecer de vários cards de uma vez, com três consultas no total.
 *
 * A Vera não recebe parecer de si mesma: o card dela É o parecer. Para ela
 * as etapas saem vazias.
 */
export async function parecerDosCards(projectId: string, cards: CardParaParecer[]): Promise<Map<string, ParecerDaPeca>> {
  const resultado = new Map<string, ParecerDaPeca>();
  if (cards.length === 0) return resultado;
  const runIds = [...new Set(cards.map((c) => c.runId))];

  const [cardsDaVera, cardsDePublicacao, posts] = await Promise.all([
    prisma.campaignCard.findMany({
      where: { projectId, runId: { in: runIds }, cardType: "preview" },
      orderBy: { createdAt: "desc" },
      select: { runId: true, dayOfWeek: true, content: true, metadata: true },
    }),
    prisma.campaignCard.findMany({
      where: { projectId, runId: { in: runIds }, cardType: "publish" },
      orderBy: { createdAt: "desc" },
      select: { runId: true, dayOfWeek: true, status: true },
    }),
    prisma.post.findMany({
      where: { projectId, runId: { in: runIds } },
      select: { runId: true, dayOfWeek: true, status: true, mediaType: true, imageUrl: true },
    }),
  ]);

  const chave = (runId: string, dia: number | null) => `${runId}:${dia ?? 0}`;
  // O card mais recente de cada dia vale: é o desfecho.
  const vereditoPorDia = new Map<string, string | null>();
  const correcaoPorDia = new Map<string, CorrecaoDaVera | null>();
  for (const v of cardsDaVera) {
    if (vereditoPorDia.has(chave(v.runId, v.dayOfWeek))) continue;
    vereditoPorDia.set(chave(v.runId, v.dayOfWeek), v.content);
    correcaoPorDia.set(chave(v.runId, v.dayOfWeek), lerCorrecaoDaVera(v.metadata));
  }
  const principalPorDia = new Map<string, string>();
  for (const p of cardsDePublicacao) if (!principalPorDia.has(chave(p.runId, p.dayOfWeek))) principalPorDia.set(chave(p.runId, p.dayOfWeek), p.status);
  const postsPorDia = new Map<string, string[]>();
  const mp4PorDia = new Map<string, string>();
  for (const p of posts) {
    if (!p.runId) continue;
    const k = chave(p.runId, p.dayOfWeek);
    postsPorDia.set(k, [...(postsPorDia.get(k) ?? []), p.status]);
    if (p.mediaType === "video" && ehMp4(p.imageUrl) && !mp4PorDia.has(k)) mp4PorDia.set(k, p.imageUrl);
  }

  for (const c of cards) {
    const k = chave(c.runId, c.dayOfWeek);
    const daVera = c.cardType === "preview";
    const veredito = lerVeredito(daVera ? null : vereditoPorDia.get(k));
    const etapas = daVera
      ? []
      : linhaDoTempoDoParecer({
          veredito,
          statusDoCard: c.status,
          statusDoPrincipal: principalPorDia.get(k) ?? null,
          statusDosPosts: postsPorDia.get(k) ?? [],
          correcao: correcaoPorDia.get(k) ?? null,
        });
    const videoUrl = c.mediaType === "video" ? (ehMp4(c.mediaUrl) ? c.mediaUrl : mp4PorDia.get(k) ?? null) : null;
    resultado.set(c.id, { veredito, etapas, videoUrl });
  }
  return resultado;
}
