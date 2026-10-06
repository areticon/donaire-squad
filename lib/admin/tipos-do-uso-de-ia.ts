/**
 * USO DE IA E MARGEM, a parte sem banco (05/10/2026).
 *
 * Pedido do Bruno: o painel precisa SEPARAR o uso de IA dos clientes do uso
 * do time de desenvolvimento, dizer se os créditos estão funcionando e se a
 * margem respeita o que foi desenhado. Este módulo tem só os tipos, as
 * constantes de desenho e a classificação pura das operações; quem lê o
 * banco é lib/admin/uso-de-ia.ts (só servidor). A separação é a mesma de
 * tipos-do-painel.ts: um componente que importe daqui não arrasta o driver
 * do Postgres para o navegador.
 */

import { REAIS_POR_CREDITO } from "@/lib/credits/higgsfield-tabela";

// ─────────────────────────────────────────────────────────────────────────────
// O DESENHO: as constantes contra as quais a tela compara
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A régua da casa desde 01/10 (lib/media/limits.ts): nenhuma etapa pode custar
 * mais de R$ 0,027 de IA por crédito cobrado. É o número que deixa o
 * Enterprise, o de crédito mais barato, acima de 70% de margem. Vem de
 * higgsfield-tabela.ts para não existir uma segunda cópia.
 */
export const TETO_DE_CUSTO_POR_CREDITO = REAIS_POR_CREDITO;

/**
 * A margem bruta mínima desenhada em 01/10: mais de 70% sobre o custo de IA em
 * todos os planos, no uso típico e no uso máximo. Abaixo disto a tela acende
 * o sinal vermelho na conta e no plano.
 */
export const MARGEM_MINIMA_DESENHADA = 0.7;

/**
 * O teto de custo de IA por plano, como fração da mensalidade: o complemento
 * da margem mínima. Fica como constante própria para poder ser trocado por
 * plano um dia sem mexer na margem geral.
 */
export const TETO_DE_CUSTO_DO_PLANO: Record<string, number> = {
  pro: 1 - MARGEM_MINIMA_DESENHADA,
  business: 1 - MARGEM_MINIMA_DESENHADA,
  studio: 1 - MARGEM_MINIMA_DESENHADA,
};

/**
 * O DOMÍNIO DA EQUIPE: e-mail da casa é sempre equipe, mesmo sem a marca no
 * banco (conta nova de alguém do time nasce com `contaInterna` falso).
 *
 * Até 06/10 havia aqui também uma lista de e-mails EXATOS, com o Gmail do
 * Bruno, aplicada por cima do banco. Era o defeito do gráfico "Cliente ou
 * equipe": o Gmail é a conta de teste para provar o produto COMO CLIENTE (100%
 * de desconto, sem papel de admin), e todo o uso de IA dela caía em equipe, por
 * isso a fatia de cliente ficava zerada. Pessoa específica não se escreve no
 * código: quem decide se uma conta de fora do domínio é da equipe é a coluna
 * `contaInterna` (botão na ficha do cliente) ou o papel de admin.
 */
export const DOMINIOS_DA_EQUIPE = ["demandou.com"];

export function emailDoDominioDaEquipe(email: string): boolean {
  const e = email.trim().toLowerCase();
  return DOMINIOS_DA_EQUIPE.some((d) => e.endsWith(`@${d}`));
}

/**
 * CONTA DA EQUIPE, a regra única do painel (06/10): papel de admin, marca
 * `contaInterna` no banco ou e-mail do domínio da casa. Desconto, cortesia ou
 * plano sem pagamento NÃO fazem de ninguém equipe: quem usa como cliente é
 * cliente no custo, e só não gera receita porque não pagou.
 */
export function contaEhDaEquipe(c: { email: string; role: string; contaInterna?: boolean | null }): boolean {
  return c.role === "admin" || Boolean(c.contaInterna) || emailDoDominioDaEquipe(c.email);
}

// ─────────────────────────────────────────────────────────────────────────────
// O PERÍODO: 7 dias, 30 dias ou o mês corrente
// ─────────────────────────────────────────────────────────────────────────────

export const PERIODOS_DE_IA = ["7", "30", "mes"] as const;
export type PeriodoDeIa = (typeof PERIODOS_DE_IA)[number];

export function periodoDeIaDaUrl(valor: string | string[] | undefined): PeriodoDeIa {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (PERIODOS_DE_IA as readonly string[]).includes(v ?? "") ? (v as PeriodoDeIa) : "30";
}

export const NOME_DO_PERIODO: Record<PeriodoDeIa, string> = {
  "7": "7 dias",
  "30": "30 dias",
  mes: "Mês atual",
};

// ─────────────────────────────────────────────────────────────────────────────
// A CLASSIFICAÇÃO: categoria, fornecedor, família e grupo de cobrança
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De quem é o gasto:
 *  - cliente: projeto de uma conta que não é interna;
 *  - dev: projeto de conta interna (ou admin);
 *  - orfao: linha sem projeto, ou com projeto que já foi apagado (a demo
 *    pública, provas de script e afins). Conta como desenvolvimento.
 */
export type Categoria = "cliente" | "dev" | "orfao";

export const NOME_DA_CATEGORIA: Record<Categoria, string> = {
  cliente: "Clientes",
  dev: "Desenvolvimento",
  orfao: "Sem projeto ou projeto apagado",
};

export const COR_DA_CATEGORIA: Record<Categoria, string> = {
  cliente: "var(--painel-1)",
  dev: "var(--painel-2)",
  orfao: "var(--painel-neutro)",
};

/** O fornecedor, deduzido do nome do modelo que de fato respondeu. */
export function fornecedorDoModelo(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith("claude")) return "Anthropic";
  if (m.startsWith("gpt-") || m.startsWith("openai")) return "OpenAI";
  if (m.startsWith("gemini") || m.startsWith("imagen") || m.startsWith("veo")) return "Google";
  if (m.startsWith("higgsfield")) return "Higgsfield";
  if (m.startsWith("fal-ai/") || m.startsWith("kling-video/") || m.includes("omnihuman") || m.includes("birefnet")) return "fal.ai";
  if (m.startsWith("heygen")) return "HeyGen";
  if (m.startsWith("elevenlabs")) return "ElevenLabs";
  if (m.startsWith("nova-")) return "Deepgram";
  if (m.startsWith("jev")) return "JEV (motor próprio)";
  if (m.startsWith("apify") || m.startsWith("x-api")) return "Apify e API do X";
  return "Outro";
}

/**
 * A FAMÍLIA de uma linha de `ai_usage`, pelo nome da operação. É o lado do
 * CUSTO. O lado da COBRANÇA (extrato de créditos) usa outros nomes, e os dois
 * se encontram no GRUPO DE COBRANÇA logo abaixo.
 *
 *  - post: o texto das peças da campanha (redatores, revisora, ajustes);
 *  - arte: a imagem e o carrossel da campanha, e a conferência deles;
 *  - roteiro: a primeira parte do vídeo (transcrição, limpeza, seleção,
 *    radar, roteiro em texto), cobrada no envio;
 *  - edicao: o completo e os cortes (montagem, efeitos, capa, cenas,
 *    enquadramento, revisão), cobrados na aprovação;
 *  - gemeo: o gêmeo digital (treino, voz, vídeo, cenário);
 *  - video_ia: o vídeo gerado por IA (Veo), da carteira de vídeo;
 *  - incluido: o que o plano cobre sem cobrar por uso (setup, referências,
 *    linha editorial, chat do card, materiais);
 *  - prova: testes e provas do time, que nunca são de cliente.
 */
export type Familia = "post" | "arte" | "roteiro" | "edicao" | "gemeo" | "video_ia" | "incluido" | "prova";

export const NOME_DA_FAMILIA: Record<Familia, string> = {
  post: "Post (texto das peças)",
  arte: "Arte (imagem e carrossel)",
  roteiro: "Vídeo: roteiro (1ª parte)",
  edicao: "Vídeo: completo e cortes (aprovação)",
  gemeo: "Gêmeo digital",
  video_ia: "Vídeo por IA (Veo)",
  incluido: "Incluído no plano (sem cobrança por uso)",
  prova: "Provas e testes do time",
};

export const COR_DA_FAMILIA: Record<Familia, string> = {
  post: "var(--painel-1)",
  arte: "var(--painel-3)",
  roteiro: "var(--painel-4)",
  edicao: "var(--painel-2)",
  gemeo: "var(--painel-5)",
  video_ia: "var(--painel-neutro)",
  incluido: "var(--painel-neutro)",
  prova: "var(--painel-neutro)",
};

const OPERACOES_DE_POST = new Set([
  "agent",
  "ajuste_do_dia",
  "restricao_nao_citar",
  "manchete_da_peca",
  "manchete_curta",
  "refazer_peca",
  "levar_para_outra_rede",
  "reescrever_campo",
  "capa_acentuacao",
  "vera_gerente",
  "vera_gerente_reescrever",
  "editor-por-comando-revisor",
]);

const OPERACOES_DE_ARTE = new Set([
  "campanha_imagem",
  "modelo_por_prompt",
  "carrossel_lamina",
  "carrossel_roteiro",
  "conferencia_da_arte",
  "conferencia_da_arte_descricao",
  "item11_refazer_arte",
  "vera_regerar_arte",
  "texto_do_modelo_de_arte",
  "peca_de_feed",
  "cena_da_frase",
]);

const OPERACOES_DE_ROTEIRO = new Set([
  "video_transcricao",
  "video_limpeza",
  "video_selecao",
  "video_selecao_texto",
  "video_selecao_desempate",
  "video_radar",
  "video_retomada",
  "guarda-da-fala",
  "guarda-da-fala-prova",
  "telas-da-gravacao",
  "roteiro-abertura",
  "roteiro-ganchos",
  "roteiro-nova-ideia",
  "montagem-diretor",
  "montagem-demonstracao",
  "montagem-revisor",
]);

const OPERACOES_INCLUIDAS = new Set([
  "contexto_pdf",
  "perfil_proprio_setup",
  "perfil_proprio_leitura",
  "preview_setup",
  "sugerir_campos",
  "sugerir_estilo",
  "estilo_interpretar",
  "linha_editorial_ideias",
  "linha_editorial_ideias_completa",
  "linha_editorial_roteiro",
  "radar_territorio",
  "radar_filtro_x",
  "conversa-no-escritorio",
  "chat_do_card_texto",
  "chat_do_card_entender",
  "material_escolha",
  "material_etiquetas",
  "material_recorte",
  "landing_equipe",
  "imagem_sem_contexto",
  "demo_publica",
]);

export function familiaDaOperacao(operation: string): Familia {
  const op = operation.toLowerCase();
  if (op.startsWith("prova") || op.startsWith("teste") || op.startsWith("previa") || op.includes("-prova") || op.includes("_prova")) return "prova";
  if (OPERACOES_DE_POST.has(op)) return "post";
  if (OPERACOES_DE_ARTE.has(op)) return "arte";
  if (op.startsWith("gemeo")) return "gemeo";
  if (op === "video_ia" || op === "video_ia_avulso") return "video_ia";
  if (OPERACOES_DE_ROTEIRO.has(op)) return "roteiro";
  if (op.startsWith("jev-selecao") || op.startsWith("jev-retomadas") || op.startsWith("jev-limpeza") || op.startsWith("jev-diretor") || op.startsWith("jev-referencias"))
    return "roteiro";
  if (op.startsWith("referencias")) return "incluido";
  if (OPERACOES_INCLUIDAS.has(op)) return "incluido";
  // Tudo o que sobra de vídeo é a edição aprovada: montagem-*, editor-sob-medida-*,
  // video_capa*, video_efeitos, video_fecho, refacao-do-corte, revisao-do-corte,
  // jev-vera-*, jev-abertura, jev-conferencia-da-arte, jev-editor-por-comando-*.
  if (op.startsWith("montagem") || op.startsWith("editor-sob-medida") || op.startsWith("video_") || op.startsWith("jev-") || op.includes("corte"))
    return "edicao";
  return "incluido";
}

/**
 * O GRUPO DE COBRANÇA: onde o custo (família) e a cobrança (operação do
 * extrato) se encontram. A campanha cobra texto e arte numa linha só
 * ("campanha"), então post e arte viram um grupo; a aprovação do vídeo cobra
 * o completo e os cortes numa linha só ("video_aprovacao"), então os dois são
 * um grupo. Separar além disto seria inventar um cruzamento que o extrato
 * não permite.
 */
export type GrupoDeCobranca = "campanha" | "roteiro" | "edicao" | "gemeo" | "video_ia";

export const GRUPOS_DE_COBRANCA: GrupoDeCobranca[] = ["campanha", "roteiro", "edicao", "gemeo", "video_ia"];

export const NOME_DO_GRUPO: Record<GrupoDeCobranca, string> = {
  campanha: "Campanha (post e arte)",
  roteiro: "Vídeo: roteiro",
  edicao: "Vídeo: completo e cortes",
  gemeo: "Gêmeo digital",
  video_ia: "Vídeo por IA (Veo)",
};

export function grupoDaFamilia(f: Familia): GrupoDeCobranca | null {
  switch (f) {
    case "post":
    case "arte":
      return "campanha";
    case "roteiro":
      return "roteiro";
    case "edicao":
      return "edicao";
    case "gemeo":
      return "gemeo";
    case "video_ia":
      return "video_ia";
    default:
      return null;
  }
}

/**
 * Operações do extrato que são RECARGA ou ACERTO, e não consumo: ficam fora de
 * "créditos cobrados". O estorno NÃO está aqui de propósito: ele é consumo
 * negativo, e a soma líquida é o que o cliente de fato pagou.
 */
const OPERACOES_DE_RECARGA = new Set([
  "renovacao",
  "recarga",
  "plano_video",
  "compra_video",
  "credito_de_teste",
  "credito_de_prova",
  "credito_do_dono",
  "ajuste_admin",
  "acerto_estorno_duplicado",
  "acesso_extra",
  // 06/10: concessão do admin (não é receita nem consumo) e o reset de saldo.
  "concessao_admin",
  "reset_de_saldo",
  // 06/10: pacote de crédito avulso pago no Stripe (a receita vem da cobrança).
  "compra_creditos",
]);

export function operacaoEhRecarga(operation: string): boolean {
  return OPERACOES_DE_RECARGA.has(operation);
}

/**
 * Linhas do extrato que são CONTAGEM e não cobrança: a gravação enviada é um
 * marcador de cota (amount 0, sempre). Não serve de prova de que o roteiro foi
 * cobrado, então fica fora do cruzamento.
 */
const OPERACOES_DE_CONTAGEM = new Set(["gravacao_enviada"]);

export function grupoDaCobranca(operation: string): GrupoDeCobranca | null {
  if (OPERACOES_DE_CONTAGEM.has(operation) || operacaoEhRecarga(operation)) return null;
  switch (operation) {
    case "campanha":
    case "post_text":
    case "post_image":
    case "arte_apos_identidade":
    case "refazer_peca":
    case "levar_para_outra_rede":
    case "reescrever_campo":
      return "campanha";
    case "video_roteiro":
      return "roteiro";
    case "video_aprovacao":
    case "video_job":
    case "corte_refacao":
    case "roteiro_nova_ideia":
    case "video_higgsfield":
    case "video_ajuste_chat":
    case "montagem":
      return "edicao";
    case "gemeo_video":
    case "gemeo_video_estorno":
      return "gemeo";
    case "video_ia":
    case "estorno_video_ia":
      return "video_ia";
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A TELA RECEBE, já contado no servidor
// ─────────────────────────────────────────────────────────────────────────────

export type Parcela = { nome: string; usd: number; n: number };

export type LinhaDeConta = {
  id: string | null;
  email: string;
  nome: string | null;
  plano: string;
  planoNome: string;
  categoria: Categoria;
  /** Chamadas de IA no período. */
  chamadas: number;
  custoUsd: number;
  custoReais: number;
  /** Créditos cobrados no período, líquidos de estorno (só carteira do plano e de vídeo somadas). */
  creditosCobrados: number;
  /** O que a conta interna TERIA pago: a soma dos "custaria N créditos" das linhas a zero. */
  creditosQueCustariam: number;
  /** creditosCobrados vezes a régua de R$ 0,027. */
  custoDesenhadoReais: number;
  /** Custo real por crédito cobrado, em reais. Null sem crédito cobrado. */
  custoPorCredito: number | null;
  /** Receita REAL no período: pagamento confirmado (Stripe pago, ou por fora com comprovante). */
  receitaReais: number;
  /** PROJEÇÃO: a mensalidade do plano ou do contrato, proporcional aos dias. Não é caixa. */
  receitaProjetadaReais: number;
  margemReais: number;
  /** Margem sobre a receita, de 0 a 1. Null sem receita. */
  margemPct: number | null;
  /** Vermelho: margem abaixo do desenhado, ou custo por crédito acima da régua. */
  alerta: string | null;
};

export type LinhaDePlano = {
  plano: string;
  planoNome: string;
  contas: number;
  receitaReais: number;
  custoReais: number;
  creditosCobrados: number;
  margemReais: number;
  margemPct: number | null;
  /** O teto de custo desenhado para o plano, em reais, no período. */
  tetoDeCustoReais: number;
  alerta: string | null;
};

/**
 * OS CRÉDITOS POR CONTA E PROJETO (05/10, à noite): o que cada projeto
 * consumiu nas duas carteiras, lado a lado com o custo real de IA do mesmo
 * projeto no mesmo período, e o custo por crédito contra a régua.
 */
export type LinhaDeProjeto = {
  projectId: string | null;
  projeto: string;
  contaId: string | null;
  email: string;
  nome: string | null;
  categoria: Categoria;
  /** Créditos consumidos na carteira do plano, líquidos de estorno. */
  creditosPlano: number;
  /** Créditos consumidos na carteira de vídeo, líquidos de estorno. */
  creditosVideo: number;
  /** O que a conta da equipe teria pago (linhas a zero com "custaria N"). */
  creditosQueCustariam: number;
  /** Linhas de consumo no extrato. */
  linhas: number;
  chamadas: number;
  custoUsd: number;
  custoReais: number;
  /** Custo real por crédito (consumido mais o que custaria). Null sem crédito. */
  custoPorCredito: number | null;
};

export type CruzamentoPorGrupo = {
  grupo: GrupoDeCobranca;
  nome: string;
  usd: number;
  /** Linhas do extrato (inclusive as de valor zero das contas internas). */
  cobrancas: number;
  creditos: number;
  creditosQueCustariam: number;
  /** Projetos com gasto de IA neste grupo e nenhuma linha no extrato. */
  vazamentos: Array<{ projeto: string; conta: string; categoria: Categoria; usd: number }>;
  /** Projetos com linha no extrato e nenhum gasto de IA neste grupo. */
  semGasto: Array<{ projeto: string; conta: string; categoria: Categoria; creditos: number; cobrancas: number }>;
};

export type DadosDoUsoDeIa = {
  /** O período pedido: um dos três nomeados, ou o número de dias do seletor do painel. */
  periodo: PeriodoDeIa | number;
  rotuloDoPeriodo: string;
  dias: number;
  dolar: number;
  /** A coluna `contaInterna` já existe no banco? Senão a classificação usa só o papel e o domínio da casa. */
  colunaDeInterna: boolean;
  totalUsd: number;
  porCategoria: Array<{ categoria: Categoria; usd: number; n: number }>;
  porFornecedor: Array<Parcela & { cliente: number; dev: number }>;
  porModelo: Array<Parcela & { fornecedor: string }>;
  porFamilia: Array<{ familia: Familia; usd: number; n: number; cliente: number; dev: number }>;
  porOperacao: Array<Parcela & { familia: Familia; cliente: number; dev: number }>;
  clientes: LinhaDeConta[];
  internas: LinhaDeConta[];
  orfao: { usd: number; n: number };
  porPlano: LinhaDePlano[];
  cruzamento: CruzamentoPorGrupo[];
  porProjeto: LinhaDeProjeto[];
};

export const dolares = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const pct = (n: number | null) => (n === null ? "sem base" : `${Math.round(n * 100)}%`);

/** Reais com três casas, para o custo por crédito: "R$ 0,057", e não "R$ 0.057". */
export const reaisPorCredito = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** O dólar do ambiente, escrito à brasileira: "5,40". */
export const cotacao = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
