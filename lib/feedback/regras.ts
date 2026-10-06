/**
 * AS REGRAS DO FEEDBACK DO PRODUTO (06/10/2026). Módulo PURO: sem banco, sem
 * IA, sem rede. A tela do admin, a captura e a prova importam daqui.
 *
 * Pedido do Bruno (06/10, 02h20): "o chat do card tem que retroalimentar a
 * plataforma com o feedback dos clientes. Se o cliente reclama que o áudio
 * está descasado, que a palavra de destaque não aparece no momento exato,
 * isso é erro de arquitetura, de produto, de código nosso; esse feedback tem
 * que melhorar o produto. Mas se o cliente reclama de cor (a letra apareceu
 * vermelha mas eu queria rosa) e o roteiro aprovado dizia vermelho, isso é
 * prompt, é o usuário que não pediu certo: não melhora produto."
 *
 * Daí as quatro classes abaixo, decididas pelo JEV (nunca pelo Claude), e o
 * agrupamento para contar "cinco clientes esta semana pediram isso".
 */

export const CLASSIFICACOES = ["erro_do_produto", "pedido_de_gosto", "atendido_como_pedido", "duvida_de_uso"] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const NOME_DA_CLASSIFICACAO: Record<Classificacao, string> = {
  erro_do_produto: "Erro do produto",
  pedido_de_gosto: "Pedido de gosto",
  atendido_como_pedido: "Atendido como pedido",
  duvida_de_uso: "Dúvida de uso",
};

/** O que cada classe significa: é o texto que o JEV lê como critério e que o painel mostra como legenda. */
export const CRITERIO_DA_CLASSIFICACAO: Record<Classificacao, string> = {
  erro_do_produto:
    "O que o cliente descreve é falha da plataforma, e não escolha dele: áudio descasado da imagem, peça ou efeito fora do tempo, palavra de destaque que não aparece no momento exato, elemento que não apareceu, texto cortado ou ilegível, tela travada, erro, resultado diferente do que a plataforma prometeu ou do que o cliente tinha aprovado.",
  pedido_de_gosto:
    "O cliente quer outra escolha de estilo ou preferência (outra cor, outra letra, trocar uma palavra, outro tom, outra foto, mais curto, mais longo), sem a plataforma ter feito nada errado e sem contrariar o que ele tinha aprovado antes.",
  atendido_como_pedido:
    "O que saiu é exatamente o que o cliente tinha aprovado antes (a linha do roteiro, a frase aprovada, a cor da marca gravada): ele mudou de ideia ou pediu errado. A plataforma fez o que foi pedido.",
  duvida_de_uso:
    "O cliente pergunta como fazer algo, onde fica uma coisa ou não entende uma tela; não descreve defeito nem pede mudança numa peça.",
};

export const SITUACOES_DO_GRUPO = ["aberto", "aprovado", "nao_e_produto", "feito"] as const;
export type SituacaoDoGrupo = (typeof SITUACOES_DO_GRUPO)[number];

export const NOME_DA_SITUACAO: Record<SituacaoDoGrupo, string> = {
  aberto: "Aguardando o admin",
  aprovado: "Melhoria aprovada",
  nao_e_produto: "Não é produto",
  feito: "Feito",
};

export const ORIGENS = ["chat", "chamado"] as const;
export type Origem = (typeof ORIGENS)[number];

export function ehClassificacao(v: unknown): v is Classificacao {
  return typeof v === "string" && (CLASSIFICACOES as readonly string[]).includes(v);
}

export function ehSituacaoDoGrupo(v: unknown): v is SituacaoDoGrupo {
  return typeof v === "string" && (SITUACOES_DO_GRUPO as readonly string[]).includes(v);
}

/** Só o erro do produto melhora o produto. Gosto, atendido e dúvida ficam registrados, mas não viram briefing. */
export function melhoraOProduto(c: string | null | undefined): boolean {
  return c === "erro_do_produto";
}

/** Abaixo disto o JEV "não sabe", e o feedback fica sem classe (nunca vira erro do produto por padrão). */
export const CONFIANCA_MINIMA = 0.5;

/**
 * O contexto que vai junto com o texto do cliente: o que a plataforma fez,
 * o que respondeu, e o que o cliente TINHA APROVADO antes (é o que separa
 * "erro do produto" de "atendido como pedido"). Sem nome de cliente.
 */
export type ContextoDoFeedback = {
  /** "imagem", "carrossel", "post de texto", "corte de vídeo", "vídeo completo", "chamado"... */
  tipoDePeca?: string | null;
  rede?: string | null;
  /** O estilo ou modelo da peça (nome do modelo de arte, estilo de vídeo). */
  estilo?: string | null;
  /** As ações que a plataforma fez pelo pedido ("texto", "arte", "data", "rede") ou o caminho que tratou. */
  oQueAPlataformaFez?: string[] | null;
  /** A resposta que o cliente leu. */
  respostaDaPlataforma?: string | null;
  /** "feito" | "parte" | "falhou" | null */
  resultado?: string | null;
  /** O que o cliente tinha aprovado antes do pedido: texto da peça, frase da arte, cor da marca, linha do roteiro. */
  aprovadoAntes?: Record<string, string | null | undefined> | null;
  /** Os módulos do código por onde a peça passou (pelo tipo da peça): a pista do briefing. */
  modulos?: string[] | null;
  /** No chamado: a categoria e o código de erro que a tela mostrou. */
  categoriaDoChamado?: string | null;
  codigo?: string | null;
};

/** Os módulos prováveis pelo tipo do card: a ficha do contexto que o briefing usa para dizer "onde no código". */
export function modulosDoTipoDeCard(cardType: string | null | undefined, mediaType?: string | null): string[] {
  if (cardType === "video_clip" || cardType === "video_completo" || mediaType === "video") {
    return ["lib/media/ajuste-pelo-chat.ts", "lib/media/montagem-do-completo.ts", "worker/src/edicao-sob-medida.mjs", "worker/remotion/src/sob-medida", "lib/media/editor-por-comando"];
  }
  if (cardType === "media") {
    return ["lib/media/pedido-do-card.ts", "lib/media/arte-com-frase.ts", "lib/modelos-de-arte", "lib/media/fotos-do-carrossel.ts"];
  }
  if (cardType === "publish") {
    return ["lib/media/pedido-do-card.ts", "lib/pipeline/publicar", "lib/posts"];
  }
  return ["lib/media/pedido-do-card.ts", "lib/media/write-posts.ts", "lib/squad"];
}

/** O e-mail nunca vai para o estado do JEV nem para o painel. */
export function semEmail(texto: string): string {
  return texto.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]");
}

/** O título do grupo: a primeira linha do texto do cliente, curta, sem e-mail. */
export function tituloDoGrupo(texto: string): string {
  const linha = semEmail(texto).replace(/\s+/g, " ").trim();
  if (linha.length <= 90) return linha || "Pedido sem texto";
  const corte = linha.slice(0, 90);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimoEspaco > 40 ? ultimoEspaco : 90)}...`;
}

// ── A contagem por grupo ────────────────────────────────────────────────────

export type FeedbackParaContar = { grupoId: string | null; userId: string; criadoEm: Date };
export type Contagem = { clientes: number; ocorrencias: number };
export type ContagemDoGrupo = { semana: Contagem; mes: Contagem; total: Contagem; ultimoEm: Date | null };

export const DIAS_DA_SEMANA = 7;
export const DIAS_DO_MES = 30;

function contar(lista: FeedbackParaContar[]): Contagem {
  return { clientes: new Set(lista.map((f) => f.userId)).size, ocorrencias: lista.length };
}

/**
 * "Esta semana teve cinco clientes pedindo para ajustar isso": por grupo,
 * quantos CLIENTES diferentes e quantas OCORRÊNCIAS nos últimos 7 e 30 dias,
 * e no total. Um cliente que reclamou três vezes conta 1 cliente, 3 ocorrências.
 */
export function contarPorGrupo(feedbacks: FeedbackParaContar[], agora = new Date()): Map<string, ContagemDoGrupo> {
  const semanaDesde = agora.getTime() - DIAS_DA_SEMANA * 86_400_000;
  const mesDesde = agora.getTime() - DIAS_DO_MES * 86_400_000;
  const porGrupo = new Map<string, FeedbackParaContar[]>();
  for (const f of feedbacks) {
    if (!f.grupoId) continue;
    const lista = porGrupo.get(f.grupoId) ?? [];
    lista.push(f);
    porGrupo.set(f.grupoId, lista);
  }
  const saida = new Map<string, ContagemDoGrupo>();
  for (const [grupoId, lista] of porGrupo) {
    const semana = lista.filter((f) => f.criadoEm.getTime() >= semanaDesde);
    const mes = lista.filter((f) => f.criadoEm.getTime() >= mesDesde);
    const ultimo = lista.reduce<Date | null>((m, f) => (!m || f.criadoEm > m ? f.criadoEm : m), null);
    saida.set(grupoId, { semana: contar(semana), mes: contar(mes), total: contar(lista), ultimoEm: ultimo });
  }
  return saida;
}

/** "5 clientes, 7 vezes" ou "1 cliente, 1 vez". */
export function fraseDaContagem(c: Contagem): string {
  if (c.ocorrencias === 0) return "nenhum";
  const clientes = c.clientes === 1 ? "1 cliente" : `${c.clientes} clientes`;
  const vezes = c.ocorrencias === 1 ? "1 vez" : `${c.ocorrencias} vezes`;
  return `${clientes}, ${vezes}`;
}

/**
 * A ordem do painel: o que precisa do admin primeiro (aberto), erro do produto
 * antes dos outros, e dentro disso quem mais clientes teve na semana.
 */
export function ordemDoPainel<T extends { situacao: string; classificacao: string; semana: Contagem; mes: Contagem }>(a: T, b: T): number {
  const peso = (s: string) => (s === "aberto" ? 0 : s === "aprovado" ? 1 : s === "feito" ? 2 : 3);
  if (peso(a.situacao) !== peso(b.situacao)) return peso(a.situacao) - peso(b.situacao);
  const produto = (c: string) => (melhoraOProduto(c) ? 0 : 1);
  if (produto(a.classificacao) !== produto(b.classificacao)) return produto(a.classificacao) - produto(b.classificacao);
  if (a.semana.clientes !== b.semana.clientes) return b.semana.clientes - a.semana.clientes;
  return b.mes.ocorrencias - a.mes.ocorrencias;
}
