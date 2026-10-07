/**
 * O MOTOR DA CAMPANHA.
 *
 * Morou dentro de `app/api/pipeline/run/route.ts` até 10/09, e saiu de lá
 * quando cada dia virou um trabalho da fila: agora duas rotas precisam do
 * mesmo motor (a que enfileira e a que executa um trabalho), e motor que mora
 * numa rota só pode ser chamado por ela.
 *
 * A regra que a saída preserva: existe UM caminho para gerar um dia, e ele é
 * este. A casa já pagou pelo desenho contrário, quando a montagem do pedido de
 * corte tinha uma cópia na rota e outra no script de teste: o produto era
 * consertado, o teste continuava com o desenho velho, e dizia que funcionava.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { enfileirar, cutucar, estadoDoGrupo } from "@/lib/fila/trabalhos";
import { direcaoDaPeca } from "@/lib/media/direcao-de-arte";
import { debitar, saldo, jaCobrado, SaldoInsuficiente, TetoDoMembro, restanteDoTeto } from "@/lib/credits";
import { fraseDoTetoDeCreditos } from "@/lib/equipe/regras";
import { custoTotal, estimarCampanha } from "@/lib/credits/pricing";
import { askClaude, ehErroDeSaldo } from "@/lib/claude";
import { lerNaoCitar, mencoesProibidas, removerFontesProibidas } from "@/lib/pipeline/restricoes";
import { ehSemSaldoDaOpenAI } from "@/lib/media/gpt-image";
import { generateImage } from "@/lib/media/nano-banana";
import { extrairConteudoDoInfografico, desenharInfografico } from "@/lib/media/infographic";
import { mancheteDaPeca, desenharPecaDeFeed } from "@/lib/media/peca-de-feed";
import { marcaDaArte, promptDaArteSemTexto, desenharComFraseEmCodigo } from "@/lib/media/arte-com-frase";
import { TEXTO_DO_CARD_AGUARDANDO, diaPedeArte, pecaBaseDoDia } from "@/lib/modelos-de-arte/espera-da-identidade";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { roteiroDoCarrossel, desenharCarrossel, redesQueAceitamCarrossel, laminasPermitidas } from "@/lib/media/carrossel";
import { cabeNoSaldoDeVideo, type PedidoDeVideoDaFila } from "@/lib/media/video-por-ia";
import { researchTopic, formatSourcesSection } from "@/lib/research/web-search";
import { instanteLocalSeguro, FUSO_PADRAO } from "@/lib/fuso";
import { mencoesDeOutraRede, NOME_DA_REDE } from "@/lib/pipeline/redes";
import { fichaDoAgente, ESPECIALISTA_DA_REDE } from "@/lib/squad/definicoes-dos-agentes";
import { licoesPorAgente, blocoDeLicoes, gravarLicao, culpadosDaReprovacao, type Licao } from "@/lib/squad/licoes-da-vera";
import { agentePorId } from "@/lib/squad/estado-do-squad";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { newArticlePublicToken, parseLinkedInArticleContent } from "@/lib/articles/linkedin-article";
import {
  getMediaStylePromptFragment,
  maxNarrationWordsForDuration,
  type MediaStyleId,
} from "@/lib/media/media-style";
import { geracoesDoVideo, segundosEntregues, normalizarDuracao } from "@/lib/credits/video-tabela";
import { promptDoRoteiro, lerRoteiro, fatosInventados, calarCenas, narracoesLongas, encurtarNarracao, limitesDeNarracao, type RoteiroDoVideo } from "@/lib/media/roteiro-do-video";
import { limiteDoTeste } from "@/lib/limites-do-plano";
import { acabouAsCampanhas } from "@/lib/teste-gratis";
import { formatoValido, destinosDaRede, proporcaoDoDia } from "@/lib/publish/formato-de-destino";
import type { CenaDoVideo } from "@/lib/media/video-por-ia";
import { MAX_TENTATIVAS_DA_VERA, vereditoPedeCorrecao, type CorrecaoDaVera, type TentativaDaCorrecao } from "@/lib/squad/estado-da-correcao";
import { motivoDoParecer, oQueFazerDoCliente } from "@/lib/squad/correcao-da-vera";
import { veraConfereNaCampanha, veraRevisaNaCampanha } from "@/lib/squad/vera-pelo-jev";
import { fraseDeSaldoDoMembro, podeUsarProjeto } from "@/lib/equipe/conta";
import { blocoDasRegrasDoProjeto } from "@/lib/referencias/regras";
import { blocoDaMemoriaDoCliente } from "@/lib/cerebro/contexto";
import { REGRA_DE_PESSOAS_E_NUMEROS } from "@/lib/media/regras-de-redacao";
import { blocoDoEstudoDosPerfis } from "@/lib/referencias/estudo-na-campanha";
import { blocoDosLinks, lerLinks } from "@/lib/projeto/links-do-cliente";
import { janelaDaCampanha, substituiRascunhos } from "@/lib/pipeline/sobreposicao-de-campanha";

// O teto de tempo vive nas ROTAS (`/api/cron/fila`), e nao mais aqui: desde
// 10/09 o motor gera UM dia por chamada, e cada dia tem os seus 800 s. Antes,
// a semana inteira dividia um teto so, e a conta media em 09/09 dizia o
// resultado: cada dia com imagem, Vera e correcao leva perto de 2,5 minutos,
// entao cinco dias cabiam e o sexto ficava de fora com o log dizendo
// "concluido parcialmente". Subir o teto so empurrava o mesmo problema.

type FunnelStage = "tofu" | "mofu" | "bofu";
type ContentType = "text" | "image" | "video" | "carousel" | "infographic" | "poll" | "article" | "thread" | "free";
type CampaignMode = "single" | "weekly" | "biweekly" | "recurring";

/**
 * O que sai em cada dia da semana. Chave AUSENTE quer dizer "não postar".
 *
 * ERA UM TIPO COM CINCO CAMPOS OBRIGATÓRIOS, e ele estava errado por dois
 * motivos ao mesmo tempo, descobertos em 19/09 ao escrever a prova de ponta a
 * ponta:
 *
 *   • o produto manda PARCIAL desde sempre. O planejador apaga a chave do dia
 *     quando a pessoa desliga o dia ("key absent = não postar" está escrito no
 *     próprio modal), e uma campanha de três dias é um objeto de três chaves;
 *   • o planejador tem SETE dias, com sábado e domingo, e os dois nunca
 *     estiveram no tipo.
 *
 * Nada quebrava porque tudo que lê isto usa `Object.values` ou índice por
 * string, e o TypeScript só reclamava de quem montasse o objeto na mão, que
 * até hoje era só a tela (que monta com `as`). O primeiro a montar sem `as`
 * foi o script da prova, e ele acusou na hora.
 */
type DiaDaSemana = "1" | "2" | "3" | "4" | "5" | "6" | "7";
type WeeklySchedule = Partial<Record<DiaDaSemana, ContentType>>;

interface CampaignConfig {
  /** O "hoje" de quem esta na tela (AAAA-MM-DD, fuso do navegador). Ver o wizard. */
  hojeLocal?: string;
  campaignMode: CampaignMode;
  /**
   * A pessoa escolheu, na janela, SUBSTITUIR os rascunhos de outras campanhas
   * nos dias desta (05/10). Sem isto a campanha nova é somada ao dia e nada
   * do que já existe é tocado. Ver lib/pipeline/sobreposicao-de-campanha.ts.
   */
  substituirRascunhos?: boolean;
  funnelStage: FunnelStage;
  weeklySchedule: WeeklySchedule;
  postingTimes?: Record<string, string>; // dayOfWeek -> "HH:mm"
  singleScheduledAt?: string;            // full UTC ISO computed by browser
  postingTimestamps?: Record<string, string>; // dayOfWeek -> full UTC ISO
  singleDay?: number;
  singleDate?: string; // YYYY-MM-DD (overrides weekStart + singleDay)
  singleTime?: string; // "HH:mm"
  singlePlatform?: "linkedin" | "twitter" | "both";
  /** As redes escolhidas na janela (13/09). Sem ele, LinkedIn e X, como antes. */
  platforms?: string[];
  /**
   * Por onde sai: ids de SocialAccount escolhidos na janela (14/09). Com ele, a
   * esteira grava UM POST POR CONTA, com o socialAccountId desde o nascimento.
   * Sem ele, uma conta por rede, escolhida como antes (e com duas contas de
   * LinkedIn a escolha caia no perfil, que foi a reprovacao de 14/09).
   */
  destinos?: string[];
  singleContentType?: ContentType;
  weekStart?: string; // ISO date string of Monday
  /**
   * A duracao do video por IA: 8, 15, 30 ou 60 s desde 21/09 (4 e 6 continuam
   * valendo para campanha antiga). Acima de 8 s o video e uma CADEIA de
   * geracoes do Veo (8 s mais extensoes de 7 s), cada uma paga: a conta esta
   * em lib/credits/video-tabela.ts, e e a mesma que a janela mostra.
   */
  videoDuration?: number;
  videoAudio?: boolean; // generate Portuguese narration via Veo 3 audio
  /** Quem narra: feminina ou masculina, e o tom. Só vale com videoAudio. */
  videoVoz?: import("@/lib/media/veo").VozDoNarrador;
  mediaStyle?: MediaStyleId; // visual style for image / video / carousel
  topicsPerDay?: Record<string, string>; // dayOfWeek (1-7) -> specific topic for that day
  /**
   * O que fazer com o dia cujo HORÁRIO já passou, escolhido por quem pediu a
   * campanha (18/09). Três caminhos, e a diferença entre eles é quando a peça
   * sai:
   *
   * - `semanaSeguinte` (o padrão): mesmo dia da semana, mesmo horário, sete
   *   dias depois. É o que a esteira já fazia sozinha com dias ANTERIORES a
   *   hoje desde a parte 137;
   * - `agora`: publica ainda hoje, dez minutos à frente. Era o comportamento
   *   único até aqui, e foi ele que pôs a peça de quinta na madrugada de
   *   sexta sem ninguém ter escolhido isso;
   * - `pular`: o dia não é gerado nem cobrado.
   *
   * O campo é opcional porque campanha velha não o tem, e o padrão dela
   * continua sendo o que o Bruno aprovou na parte 137.
   */
  horarioPassado?: "semanaSeguinte" | "agora" | "pular";
  /**
   * Os dias cujo tipo de conteúdo o CLIENTE escolheu, contra os que ficaram na
   * sugestão automática da tela.
   *
   * A esteira não muda de comportamento por causa deste campo, e isso é de
   * propósito: `weeklySchedule` continua sendo a ordem, venha de onde vier.
   * Ele existe para o LOG da execução, que passa a dizer de quem foi cada
   * escolha, e para o banco poder responder essa pergunta sem alguém ter que
   * reconstituir o padrão da tela bit a bit, que foi o que a sessão de 18/09
   * teve que fazer.
   */
  diasEscolhidosPeloCliente?: string[];
  /**
   * Quantas laminas o carrossel tem. O teto e da rede mais restrita entre as
   * escolhidas (Facebook aceita 10, Instagram e LinkedIn aceitam 20).
   *
   * Vale dinheiro: cada lamina e uma imagem no GPT Image 2, US$ 0,165 em alta
   * qualidade, ou R$ 0,89. Cinco laminas custam R$ 4,46, vinte e uma vezes uma
   * imagem no Gemini. Por isso o numero e escolha do cliente e nao um padrao
   * escondido, que e a licao do card 508.
   */
  laminasDoCarrossel?: number;
  /**
   * A qualidade do video por IA. "rapido" e o padrao e o que a esteira usa.
   *
   * Medido em 18/09: 8 segundos com narracao custam R$ 6,48 no rapido e
   * R$ 17,28 no cheio, ou seja o cheio e 2,7 vezes o rapido. Por isso o padrao
   * e o rapido, e o cheio e escolha explicita com o preco na frente.
   */
  videoQualidade?: "rapido" | "cheio";
  /**
   * ONDE A PECA CAI EM CADA REDE: feed, reel ou story (21/09).
   *
   * Um padrao por REDE que vale a campanha inteira, e nao por dia. Ausente
   * significa feed em tudo, que e o que a plataforma sempre fez. A matriz do
   * que cada rede aceita vive em lib/publish/formato-de-destino.ts.
   */
  /**
   * O MATERIAL DO PRÓPRIO CLIENTE, por dia (28/09): "para cada post, ele
   * escolhe se vai subir o material dele ou gerar por IA". Com ele, a Diana
   * não gera nada naquele dia e os posts levam o arquivo enviado; a cobrança
   * conta só o texto. Chave: o dia da semana ("1" a "7").
   */
  midiaDoCliente?: Record<string, { tipo: "imagem" | "carrossel" | "video"; urls: string[] }>;
  /** Um destino ou vários por rede (28/09). Ler com `destinosDaRede`. */
  formatosPorRede?: Record<string, string | string[]>;
}

/**
 * Que pedaço da campanha este trabalho gera.
 *
 * A pesquisa roda uma vez e fica guardada na execução; cada dia roda sozinho,
 * lendo a mesma pesquisa. É esta separação que permite sete dias com imagem
 * sem nenhum deles esbarrar no teto de tempo.
 */
export type FatiaDaCampanha =
  | { fase: "pesquisa" }
  | {
      fase: "dia";
      dayOfWeek: number;
      weekOffset: number;
      /**
       * O instante (epoch ms) em que a PLATAFORMA vai matar esta função.
       *
       * Existe desde 19/09, e a causa foi um dia de carrossel: ele passou 800
       * segundos desenhando lâminas, a função foi morta no meio, e tudo o que
       * tinha sido pago no GPT Image 2 morreu junto. Quem tem prazo precisa
       * SABER o prazo; até aqui a esteira trabalhava como se tivesse tempo
       * infinito e descobria o contrário sendo desligada.
       */
      prazoEm?: number;
    };

/** A pesquisa guardada na execução, que todo dia da semana lê. */
type PesquisaGuardada = {
  brief: string;
  bruta: string;
  fontes: Array<{ title: string; url: string }>;
};

interface AgentStep {
  agentId: string;
  name: string;
  role: string;
  persona: string;
  style: string;
}

/**
 * O que cada estágio do funil pode fazer, e o que ele NÃO pode.
 *
 * A proibição entrou em 18/09. O Bruno leu um post de TOPO de funil que
 * terminava vendendo a plataforma e um infográfico com "7 dias de teste
 * grátis", e a pergunta foi direta: "no início do projeto disse que era
 * conteúdo de topo de funil, como me coloca um CTA de 7 dias grátis?".
 *
 * A instrução antiga só dizia como escrever. O modelo tem o documento da
 * marca no contexto, com o produto inteiro descrito, e sem uma regra que
 * PROÍBA ele vende: é o caminho mais fácil para terminar um texto.
 */
const FUNNEL_INSTRUCTIONS: Record<FunnelStage, string> = {
  tofu:
    "TOPO DE FUNIL. O trabalho aqui é ALCANCE: escrever algo útil para muita gente, inclusive para quem ainda não deu nome ao problema que tem. " +
    "O ASSUNTO É A DOR E A SAÍDA, nunca a categoria do produto nem a tecnologia por trás dele. " +
    "Estrutura que funciona: (1) nomeie a situação concreta que o leitor vive, com o custo dela em tempo, dinheiro ou oportunidade perdida; " +
    "(2) explique por que isso acontece, em uma ideia só; (3) aponte a direção da saída, o que fazer, sem o passo a passo detalhado; " +
    "(4) feche com uma frase que faça a pessoa pensar ou responder. " +
    "A peça precisa ser ÚTIL SOZINHA: quem ler e não contratar nada tem que sair com uma ideia aplicável. " +
    "Não pressuponha vocabulário técnico e não use jargão de dentro da área. " +
    "PROIBIDO NESTE ESTÁGIO: vender, citar a sua própria plataforma ou produto como solução, prometer teste grátis, prazo, preço, desconto ou bônus, e terminar com chamada para ação comercial.",
  mofu:
    "MEIO DE FUNIL. O leitor já reconhece o problema e está comparando caminhos. O trabalho aqui é PROVAR COMPETÊNCIA ensinando o COMO. " +
    "Continua na dor e na solução, mas agora com método: passo a passo numerado, ordem das coisas, ferramenta, critério de decisão, o que medir, erro comum e como evitar. " +
    "A régua: alguém que leia e não contrate nada precisa conseguir EXECUTAR sozinho. Se o texto só descreve o que deveria ser feito, ele ainda é topo de funil. " +
    "Diga também onde o caminho NÃO serve, e o trade-off que ele tem. É isso que separa conteúdo técnico de propaganda disfarçada. " +
    "Pode ser técnico e específico: aqui o leitor quer profundidade, não introdução. " +
    "A sua solução pode ser citada UMA vez, como exemplo de execução do que está sendo explicado, e nunca como oferta: sem teste grátis, sem preço, sem prazo, sem 'fale comigo'. " +
    "Feche com o próximo passo prático (o que dá para fazer ainda esta semana), e não com uma venda.",
  bofu:
    "FUNDO DE FUNIL. É CONVITE, e sem rodeio: quem chega aqui já entendeu o problema e já viu o método, está decidindo. " +
    "Fale do produto pelo nome, do que ele entrega e para quem ele serve. " +
    "Estrutura que funciona: (1) a promessa concreta, no que o cliente ganha; (2) a PROVA, com número medido, caso real ou comparação honesta com a alternativa que ele usa hoje; " +
    "(3) a objeção principal tratada de frente (preço, tempo, esforço, medo de perder a própria voz); (4) UMA chamada para ação, específica e que exista de verdade. " +
    "Não é conteúdo educativo com um botão no fim: aqui o assunto é a decisão. " +
    "Só prometa condição comercial (teste, prazo, preço, desconto) que esteja escrita nos documentos do projeto. Nunca invente uma oferta, e nunca use urgência inventada: escassez falsa queima a marca que o topo do funil construiu.",
};

const DAY_NAMES: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  7: "Domingo",
};

/**
 * Extrai URLs da seção "FONTES:" do brief de pesquisa e retorna texto formatado
 * para ser publicado como primeiro comentário no LinkedIn.
 */
function extractFirstComment(researchBrief: string): string | undefined {
  const sourcesMatch = researchBrief.match(/FONTES:\s*([\s\S]+?)(?:\n\n|\n(?=[A-Z])|$)/i);
  if (!sourcesMatch) return undefined;

  const lines = sourcesMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && (l.startsWith("-") || l.startsWith("•") || l.match(/^\d+\./)));

  if (lines.length === 0) return undefined;

  const formatted = lines
    .slice(0, 5)
    .map((l) => l.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "").trim())
    .join("\n");

  return `📚 Fontes e referências:\n\n${formatted}`;
}

/**
 * O NOME DO DIA, calculado da data real.
 *
 * Desde 19/09 a campanha comeca na data que a pessoa escolhe, e "dia 1" pode
 * ser uma sexta. `DAY_NAMES[dayOfWeek]` continuava dizendo "Segunda-feira", e
 * o log, o prompt da Vera e o aviso de erro chamavam a sexta de segunda.
 * A data ja saia de `inicio + (dia - 1) + 7 * semana`; o nome sai dela agora.
 */
const NOME_POR_DIA_DA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
function nomeDoDia(weekStartIso: string | undefined, dayOfWeek: number, weekOffset = 0): string {
  if (!weekStartIso) return DAY_NAMES[dayOfWeek] ?? `Dia ${dayOfWeek}`;
  const d = new Date(weekStartIso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + (dayOfWeek - 1) + weekOffset * 7);
  const nome = NOME_POR_DIA_DA_SEMANA[d.getUTCDay()];
  // "Sexta-feira 18": com a data, porque numa campanha de 14 dias existem
  // duas sextas, e o nome sozinho nao diz qual.
  return `${nome} ${d.getUTCDate()}`;
}

/** Returns the Date for a given dayOfWeek (1=Mon) relative to weekStart (a Monday ISO string) */
function getScheduledDate(weekStartIso: string, dayOfWeek: number): Date {
  const base = new Date(weekStartIso);
  base.setDate(base.getDate() + (dayOfWeek - 1));
  return base;
}

/** Merges a date with a time string "HH:mm" into a DateTime */
// `mergeDateTime` saiu em 18/09. Ela juntava data e hora em UTC cru, que era a
// causa do post das 09:00 sair às 06:00 em São Paulo. Quem faz isso agora é
// `instanteLocalSeguro`, em lib/fuso.ts, que lê o fuso do projeto.

/** Returns Monday of the current week as ISO date string */
function currentMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

async function appendLog(runId: string, entry: object) {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  const current = Array.isArray(run?.logs) ? run.logs : [];
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { logs: [...current, { ...entry, timestamp: new Date().toISOString() }] },
  });
}

// ── Platform limits (official API constraints) ───────────────────────────────
const PLATFORM_LIMITS = {
  linkedin: {
    post: 3000,        // ShareCommentary max chars
    pollIntro: 3000,   // Poll intro text max chars
    pollQuestion: 150, // Poll question max chars
    pollOption: 30,    // Poll option max chars
    articleTitle: 200,
    articleTeaser: 400,
    articleBodyTarget: 4000,
    postTarget: 1300,    // Regular post target (comfortable under cap)
  },
  twitter: {
    tweet: 280,        // Single tweet max chars
    tweetTarget: 270,  // Thread tweet target (buffer for numbering)
    pollOption: 25,    // Poll option max chars
  },
} as const;

/**
 * Returns the LinkedIn rules block to embed in every Lucas prompt.
 * This ensures the agent always knows the constraints regardless of post type.
 */
function linkedinRules(type: "post" | "article" | "poll"): string {
  if (type === "poll") {
    return `
📋 REGRAS OBRIGATÓRIAS DO LINKEDIN — ENQUETE:
• TEXTO_INTRO: máximo ${PLATFORM_LIMITS.linkedin.pollIntro} chars (ideal: até 200)
• PERGUNTA: máximo ${PLATFORM_LIMITS.linkedin.pollQuestion} chars
• Cada OPCAO_X: máximo ${PLATFORM_LIMITS.linkedin.pollOption} chars
• Não use hashtags nas opções
• Siga o formato exato — qualquer campo fora do formato causa falha na publicação`;
  }
  if (type === "article") {
    return `
📋 REGRAS OBRIGATÓRIAS — ARTIGO LINKEDIN (texto completo + card no feed):
O LinkedIn exibirá um CARD com título e resumo; ao clicar, abre a página com o texto INTEIRO (CORPO).
Formato OBRIGATÓRIO (três blocos, nesta ordem):

TITULO: [uma linha, máx ${PLATFORM_LIMITS.linkedin.articleTitle} caracteres — título editorial forte]

RESUMO_CARD: [uma linha, máx ${PLATFORM_LIMITS.linkedin.articleTeaser} caracteres — gancho para o card no feed; sem hashtags]

CORPO:
[texto completo do artigo a partir daqui — alvo ${PLATFORM_LIMITS.linkedin.articleBodyTarget}+ caracteres, bem desenvolvido]
• Parágrafos separados por linha em branco
• Pode incluir menções a fontes com link quando fizer sentido (URL completa em linha própria)
• Sem markdown (# ** *). Texto limpo.
• Não truncar o CORPO artificialmente — o leitor vê tudo na página do artigo`;
  }
  return `
📋 REGRAS OBRIGATÓRIAS DO LINKEDIN — POST:
• Comprimento alvo: até ${PLATFORM_LIMITS.linkedin.postTarget} chars
• LIMITE ABSOLUTO: ${PLATFORM_LIMITS.linkedin.post} chars — nunca exceda
• Hashtags e emojis contam no total de chars
• Use no máximo 5 hashtags
• Não invente dados ou estatísticas`;
}

/**
 * Returns the Twitter rules block to embed in every Tiago prompt.
 */
function twitterRules(type: "thread" | "poll" | "single"): string {
  if (type === "poll") {
    return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — ENQUETE:
• TWEET: máximo ${PLATFORM_LIMITS.twitter.tweet} chars (incluindo espaços e emojis)
• Cada OPCAO_X: máximo ${PLATFORM_LIMITS.twitter.pollOption} chars
• Não inclua hashtags nas opções
• Formato exato obrigatório — desvio causa falha na publicação`;
  }
  if (type === "single") {
    return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — TWEET:
• LIMITE ABSOLUTO: ${PLATFORM_LIMITS.twitter.tweet} chars — nunca exceda
• Emojis e URLs contam no total`;
  }
  return `
📋 REGRAS OBRIGATÓRIAS DO X (TWITTER) — THREAD:
• Cada tweet individualmente: máximo ${PLATFORM_LIMITS.twitter.tweet} chars
• Alvo por tweet: até ${PLATFORM_LIMITS.twitter.tweetTarget} chars (10 chars de folga para formatação)
• Numere como: 1/ 2/ 3/ ... (o número e a barra contam nos chars)
• Conte os chars de cada tweet antes de finalizar
• Emojis e URLs encurtadas contam como chars`;
}

/**
 * Validate and auto-fix Twitter thread tweets exceeding the char limit.
 * Returns { content, fixedCount } where fixedCount > 0 means some tweets needed trimming.
 */
/**
 * Tira o texto de bastidor de uma thread reescrita e apara o que ainda passar
 * do limite.
 *
 * Medido em 09/09 nos posts do X da semana do Bruno: os quatro comecavam com
 * "Segue a thread corrigida, com as quatro falhas apontadas pela Vera..." e
 * tinham tweets de 317 a 606 caracteres. O modelo, ao corrigir, conversa
 * antes de entregar, e a resposta inteira era gravada como post. No X isso
 * vira um primeiro tweet de bastidor e os demais truncados pelo publicador.
 *
 * Aparar aqui e o ultimo recurso, e fica no log: o caminho certo e o
 * reescritor caber no limite, e a Vera reprovar quando nao couber.
 */
/**
 * Este pedaco de thread e a maquina falando sobre a thread?
 *
 * O numero do tweet e tirado antes de olhar ("6/ Ajustes feitos: ..." e
 * bastidor tanto quanto "Ajustes feitos: ..."), e as marcas sao as mesmas do
 * changelog que `limparBastidorDoTexto` usa, pelo mesmo motivo: nenhuma delas
 * tem leitura inocente em cima de uma peca pronta.
 */
function ehBastidorDeTweet(pedaco: string): boolean {
  const t = pedaco.trim().replace(/^\s*\d+[\/\)]\s*/, "");
  return /^(ajustes? (feitos?|realizados?|aplicados?)|o que mudou|altera[\u00e7c][\u00f5o]es (feitas|realizadas)|mudan[\u00e7c]as (feitas|realizadas)|corre[\u00e7c][\u00f5o]es (feitas|realizadas|aplicadas)|segue a thread|thread corrigida|nota sobre (a|as) (corre|altera))/i.test(t);
}

export function limparThreadReescrita(content: string): { content: string; aparados: number } {
  const linhas = content.split("\n");
  // Tudo antes do primeiro "1/" (ou "1)") e conversa, nao tweet.
  const inicio = linhas.findIndex((l) => /^\s*1[\/\)]\s/.test(l));
  const corpo = inicio > 0 ? linhas.slice(inicio) : linhas;
  const tweets: string[] = [];
  let atual = "";
  for (const l of corpo) {
    if (/^\s*\d+[\/\)]\s/.test(l) && atual) {
      tweets.push(atual.trimEnd());
      atual = l;
    } else {
      atual = atual ? `${atual}\n${l}` : l;
    }
  }
  if (atual.trim()) tweets.push(atual.trimEnd());

  /**
   * O CHANGELOG DO FIM, que foi ao ar em duas threads e cortado no meio.
   *
   * Medido em 21/09, no relato do Bruno de que um amigo viu o post terminar
   * "sem eira nem beira". A cadeia inteira: a Vera reprova, o redator corrige
   * e escreve "Ajustes feitos: sairam '3 semanas seguidas'..." depois do
   * ultimo tweet; como esse bloco NAO e numerado, ele foi colado no fim do
   * tweet 6; o tweet passou de 280 e foi aparado na fronteira de palavra; e o
   * que o leitor viu foi a maquina falando sozinha, cortada no meio.
   *
   * Esta limpeza olhava so o COMECO (tudo antes do "1/"), porque em 09/09 o
   * defeito era "Segue a thread corrigida" virar o tweet 1. O fim tem o mesmo
   * problema e nunca foi olhado.
   */
  const limpos = tweets
    .map((t) => {
      const partes = t.split(/\n\s*\n/);
      while (partes.length > 1 && ehBastidorDeTweet(partes[partes.length - 1])) partes.pop();
      return partes.join("\n\n").trimEnd();
    })
    .filter((t) => t.trim().length > 0 && !ehBastidorDeTweet(t));

  let aparados = 0;
  const limite = PLATFORM_LIMITS.twitter.tweet;
  const prontos = (limpos.length > 0 ? limpos : tweets).map((t) => {
    if (t.length <= limite) return t;
    aparados++;
    // Corta na ultima fronteira de palavra antes do limite, sem reticencias:
    // reticencia e o sinal visivel de que a maquina cortou.
    const fatia = t.slice(0, limite);
    const ultimoEspaco = fatia.lastIndexOf(" ");
    return (ultimoEspaco > limite * 0.6 ? fatia.slice(0, ultimoEspaco) : fatia).trimEnd();
  });
  return { content: prontos.join("\n"), aparados };
}

/**
 * Tira o BASTIDOR do texto: o modelo conversando antes de entregar o post.
 *
 * Medido na prova de 10/09, numa semana de sete dias gerada de ponta a ponta:
 * TRES dos sete posts de LinkedIn comecavam com "Segue o post do LinkedIn
 * corrigido...", um comecava com "Preciso alertar sobre uma inconsistencia
 * antes de reescrever" e um comecava com o rotulo "LINKEDIN". Ou seja, mais da
 * metade da semana iria ao ar com a maquina falando com ela mesma no topo, no
 * lugar da primeira linha, que e a unica que o LinkedIn mostra antes do "ver
 * mais".
 *
 * O X ganhou este conserto em 09/09 (`limparThreadReescrita`, que joga fora
 * tudo antes do "1/"). O LinkedIn nao tinha equivalente porque nao tem uma
 * marca de inicio como o "1/": aqui a marca precisa ser o BLOCO, e o criterio
 * precisa ser apertado, senao a limpeza come a abertura legitima de um post.
 *
 * O criterio tem duas travas ao mesmo tempo, e as duas precisam bater:
 *  1. o bloco COMECA como quem entrega trabalho ("segue", "aqui esta",
 *     "nota sobre", "reescrevi", "corrigi");
 *  2. e o bloco FALA DO PROPRIO TEXTO ("post", "texto", "versao", "correcao",
 *     "Vera", "LinkedIn", "thread").
 *
 * "Segue o post do LinkedIn corrigido" bate nas duas e sai. "Segue uma verdade
 * dura sobre o seu mercado", que e abertura legitima, bate so na primeira e
 * fica. Nunca apaga o texto inteiro: se sobrar nada, devolve o original.
 */
/**
 * O post que o modelo entregou, separado do que ele falou sobre o post.
 *
 * A limpeza por padrao de frase (limparBastidorDoTexto) resolve o caso comum e
 * nao resolve o geral: provada nos sete posts de 10/09, ela tirou os cinco
 * blocos de abertura e ainda sobrou bastidor de outro sabor logo abaixo ("De
 * acordo com o feedback da Vera...", "Problema 1 corrigido: o texto agora..."),
 * porque essas frases nao comecam como quem entrega trabalho. Perseguir padrao
 * a padrao e enxugar gelo, e cada padrao novo aumenta o risco de comer a
 * abertura legitima de um post.
 *
 * A raiz e outra: ninguem tinha dito ao modelo ONDE o post comeca. Com a marca
 * pedida no prompt, a extracao vira determinismo e ele pode conversar a vontade
 * do lado de fora. A limpeza por padrao fica como queda, para o dia em que o
 * modelo esquecer a marca.
 */
function extrairPostEntregue(content: string): { content: string; removidos: number } {
  const m = content.match(/<POST>([\s\S]*?)<\/POST>/i);
  if (m && m[1].trim()) return { content: m[1].trim(), removidos: 0 };
  return limparBastidorDoTexto(content);
}

export function limparBastidorDoTexto(content: string): { content: string; removidos: number } {
  // "Ajustes feitos:" e "O que mudou:" entraram em 21/09: \u00e9 o changelog que o
  // redator escreve ao corrigir, e ele vazava para o t\u00edtulo da pe\u00e7a.
  const ENTREGA = /^\s*(segue|aqui (esta|est\u00e1|vai|v\u00e3o)|abaixo|nota sobre|obs(erva\u00e7\u00e3o)?:|vers\u00e3o corrigida|post corrigido|texto corrigido|reescrevi|corrigi|preciso alertar|antes de reescrever|ajustes? (feitos?|realizados?|aplicados?)|altera[\u00e7c][\u00f5o]es (feitas|realizadas)|mudan[\u00e7c]as (feitas|realizadas)|o que mudou)/i;
  const FALA_DO_TEXTO = /(post|texto|vers\u00e3o|corre\u00e7\u00f5es|corre\u00e7\u00e3o|corrigid|reescrev|vera|linkedin|thread|problema[s]? (apontado|identificado))/i;
  // Rotulo solto que o modelo deixa como cabecalho da resposta.
  const ROTULO = /^\s*(linkedin|post|texto|x|twitter)\s*:?\s*$/i;
  /**
   * O CHANGELOG NAO PRECISA DA SEGUNDA TRAVA, e essa foi a brecha de 21/09.
   *
   * A regra geral exige duas coisas ao mesmo tempo (comecar como quem entrega
   * E falar do proprio texto), porque "Segue uma verdade dura sobre o seu
   * mercado" e abertura legitima. So que "Ajustes feitos: sairam '3 semanas
   * seguidas', '3 frases', '23h'" comeca como entrega e NAO fala de post,
   * texto nem versao: fala das frases que sairam. Passou nas duas travas e foi
   * PUBLICADO numa thread do X, colado no ultimo tweet e cortado no meio, que
   * e o que o amigo do Bruno viu.
   *
   * Estas marcas nao tem leitura inocente em cima de uma peca pronta: ninguem
   * abre nem fecha um post com "Ajustes feitos:".
   */
  const CHANGELOG = /^\s*(ajustes? (feitos?|realizados?|aplicados?)|o que mudou|altera[\u00e7c][\u00f5o]es (feitas|realizadas)|mudan[\u00e7c]as (feitas|realizadas)|corre[\u00e7c][\u00f5o]es (feitas|realizadas|aplicadas))/i;

  const blocos = content.split(/\n\s*\n/);
  let inicio = 0;
  let removidos = 0;

  while (inicio < blocos.length - 1) {
    const bloco = blocos[inicio].trim();
    const ehRotulo = ROTULO.test(bloco);
    const ehBastidor = (ENTREGA.test(bloco) && FALA_DO_TEXTO.test(bloco)) || CHANGELOG.test(bloco);
    if (!ehRotulo && !ehBastidor) break;
    inicio++;
    removidos++;
  }

  // Nota de rodape do tipo "Nota sobre as correcoes: removi a frase...".
  let fim = blocos.length;
  while (fim - 1 > inicio) {
    const bloco = blocos[fim - 1].trim();
    if (!((ENTREGA.test(bloco) && FALA_DO_TEXTO.test(bloco)) || CHANGELOG.test(bloco))) break;
    fim--;
    removidos++;
  }

  const limpo = blocos.slice(inicio, fim).join("\n\n").trim();
  // Cinto de seguranca: limpeza que esvazia o post e pior que o bastidor.
  if (!limpo) return { content, removidos: 0 };
  return { content: limpo, removidos };
}

/**
 * LASTRO: toda frase com numero precisa de fonte.
 *
 * Em 09/09 um post saiu com "a Fitch atribuiu perspectiva negativa a 11
 * financiamentos, citando taxas entre 15% e 25% no segundo trimestre". A Fitch
 * publicou "mais de 30% do portfolio"; o 11, o 15 e o 25 nao existem em fonte
 * nenhuma. O Roberto deu forma de numero exato a um dado vago, o Lucas copiou,
 * e a Vera aprovou porque conferiu o post contra o brief que o proprio modelo
 * escreveu. O Bruno chamou isso de inaceitavel, e e.
 *
 * A regua e de codigo, nao de prompt: cada numero do texto precisa aparecer,
 * com os mesmos digitos, na PESQUISA BRUTA (o que a busca devolveu) ou nas
 * fontes. Frase com numero sem lastro e devolvida a quem escreveu e, se
 * voltar, e removida antes de gravar. Preferimos um post com menos numeros a
 * um post com numero inventado em nome do cliente.
 *
 * O que fica de fora da conta: numeracao de tweet ("1/"), anos sozinhos
 * (1900 a 2100) e horas ("10h"), que aparecem em qualquer texto e nao sao
 * "dado".
 */
function afirmacoesSemLastro(texto: string, lastro: string): string[] {
  // Tira separador de milhar (1.234 e 1,234 viram 1234) e unifica a virgula
  // decimal em ponto (6,5 vira 6.5), dos dois lados da comparacao.
  const normalizar = (t: string) => t.replace(/[.,](?=\d{3}(?!\d))/g, "").replace(/(\d),(\d)/g, "$1.$2");
  const lastroNorm = normalizar(lastro);
  const lastroBaixo = lastroNorm.toLowerCase();
  const frases = texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  // Palavras de conteudo da frase: 5 letras ou mais, sem as que aparecem em
  // qualquer texto. E o que liga o numero ao assunto.
  const VAZIAS = new Set(["entre", "sobre", "quando", "porque", "ainda", "sendo", "mesmo", "desde", "todos", "todas", "outro", "outra", "muito", "menos", "apenas", "nesta", "neste", "dessa", "desse", "cada", "como", "para", "pelo", "pela", "essa", "esse", "isso", "aqui", "hoje", "agora", "assim", "depois", "antes", "segundo", "primeiro", "milhoes", "milhao", "bilhoes", "bilhao", "reais", "vezes", "anos", "meses", "dias"]);
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const palavrasDeConteudo = (frase: string) =>
    [...new Set(semAcento(frase.toLowerCase()).match(/[a-z]{5,}/g) ?? [])].filter((w) => !VAZIAS.has(w));

  // Um numero so conta como lastreado se aparece na pesquisa PERTO de uma
  // palavra de conteudo da frase. Sem isto, "entre 5 e 15 ferramentas" passava
  // porque "5" batia com "5 de agosto" e "15" com "15 ideias" em outro lugar da
  // pesquisa (visto na prova de 09/09). Numero solto nao e fonte; numero com
  // contexto e.
  const temLastro = (n: string, palavras: string[]): boolean => {
    const re = new RegExp(`(?<![\d\.])${n.replace(".", "\\.")}(?![\d\.])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lastroNorm)) !== null) {
      const janela = semAcento(lastroBaixo.slice(Math.max(0, m.index - 160), m.index + n.length + 160));
      if (palavras.length === 0) return true; // frase so com numero e sem assunto: nao da para cobrar contexto
      if (palavras.some((w) => janela.includes(w))) return true;
    }
    return false;
  };

  /**
   * O QUE É AFIRMAÇÃO E O QUE É CONTAGEM.
   *
   * Até 20/09 todo número era suspeito, e a tesoura cortava "Liste as 5
   * perguntas que clientes repetem", "um teste de 30 segundos" e "cada
   * marcação vira 3 peças": instrução com número, não estatística. Quando a
   * tesoura passou a rodar ANTES da Vera, em todas as quatro peças, esse corte
   * virou o maior estrago de qualidade da campanha de prova. A regra do lastro
   * existe para número que AFIRMA algo sobre o mundo (percentual, dinheiro,
   * milhares, decimal, ou número apresentado como pesquisa, estudo, regra de
   * alguém). Contagem pequena numa instrução fica.
   */
  const pareceAfirmacao = (n: string, frase: string): boolean => {
    if (n.includes(".")) return true; // 6.5, 2.3
    if (Number(n) >= 100) return true;
    const escapado = n.replace(".", "\\.");
    if (new RegExp(`(R\\$|US\\$|€)\\s*${escapado}|${escapado}\\s*(%|por cento|mil\\b|milh|bilh|x\\b|vezes)`, "i").test(frase)) return true;
    return /pesquisa|estudo|segundo|de acordo|conforme|relat[óo]rio|levantamento|dados|m[ée]dia|taxa|cresc|regra|instituto|universidade|ranking|posi[çc][ãa]o/i.test(frase);
  };

  const semLastro: string[] = [];
  for (const frase of frases) {
    const corpo = frase.replace(/^\d+[\/\)]\s*/, ""); // tira a numeracao de tweet
    const numeros = [...normalizar(corpo).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    const palavras = palavrasDeConteudo(corpo);
    const suspeitos = numeros.filter((n) => {
      if (/^(19|20)\d{2}$/.test(n)) return false; // ano sozinho
      if (new RegExp(`${n}\\s*h(?:\\b|\\d)`).test(corpo)) return false; // hora (10h)
      if (!pareceAfirmacao(n, corpo)) return false; // contagem numa instrucao
      return !temLastro(n, palavras);
    });
    if (suspeitos.length) semLastro.push(frase);
  }
  return semLastro;
}

/**
 * PROMESSA DE MÍDIA QUE NÃO EXISTE, medida por código.
 *
 * "Gravei uma leitura de 3 minutos", "o vídeo está nos comentários", "assista
 * ao vídeo completo": frases que a esteira NUNCA consegue cumprir, porque o
 * vídeo por IA é um clipe curto que sai junto do post, e a esteira de tema
 * não tem gravação nenhuma. Em 21/09 a Vera apontou a frase, deu duas saídas
 * ("reescrever OU confirmar o vídeo"), o Lucas escolheu a segunda, e o post
 * foi para o rascunho prometendo três minutos que não existem. O que é
 * medido não fica a critério de ninguém: é reprovação, e o que sobrar depois
 * da correção sai na tesoura.
 */
const PROMESSA_DE_MIDIA =
  /\b(gravei|gravamos|v[ií]deo (completo|inteiro|na [ií]ntegra)|assist(a|am|ir|e) (ao|o|este|esse) v[ií]deo|\d+\s*min(utos?)?\s*(de\s*)?(v[ií]deo|leitura|aula|conversa|gravação)|v[ií]deo (est[aá]|fica|vai estar) (nos|no|aqui nos) coment|link (do v[ií]deo|nos coment[aá]rios abaixo)|clique para assistir)/i;

export function promessasDeMidia(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && PROMESSA_DE_MIDIA.test(f));
}

/**
 * Tira do prompt visual as linhas de abertura que são conversa, não cena:
 * "Segue o prompt pronto:", "Aqui está o prompt em inglês:", "Prompt:".
 */
function limparPreambuloDoPrompt(texto: string): string {
  const linhas = limparBastidorDoTexto(texto).content.split("\n");
  while (linhas.length > 1) {
    const primeira = linhas[0].trim();
    const conversa =
      primeira.length === 0 ||
      /^(segue|aqui (est[aá]|vai|tem)|prompt|abaixo|claro|perfeito|ok\b|pronto|conforme)/i.test(primeira) ||
      (/:$/.test(primeira) && primeira.length < 140);
    if (!conversa) break;
    linhas.shift();
  }
  return linhas.join("\n").trim();
}

/** Tira do texto as frases listadas, preservando o resto. Ultimo recurso. */
function removerFrases(texto: string, frases: string[]): string {
  let saida = texto;
  for (const f of frases) saida = saida.replace(f, "");
  return saida.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function validateTwitterThread(content: string): { content: string; violations: string[] } {
  const lines = content.split("\n");
  const tweets: string[] = [];
  let currentTweet = "";

  for (const line of lines) {
    if (/^\d+[\/\)]\s/.test(line) && currentTweet) {
      tweets.push(currentTweet.trim());
      currentTweet = line;
    } else {
      currentTweet += (currentTweet ? "\n" : "") + line;
    }
  }
  if (currentTweet.trim()) tweets.push(currentTweet.trim());

  const violations: string[] = [];
  for (let i = 0; i < tweets.length; i++) {
    if (tweets[i].length > PLATFORM_LIMITS.twitter.tweet) {
      violations.push(`Tweet ${i + 1} tem ${tweets[i].length} chars (limite: ${PLATFORM_LIMITS.twitter.tweet})`);
    }
  }
  return { content, violations };
}

/**
 * A NARRACAO QUE A DIANA ESCREVEU DENTRO DO PROMPT.
 *
 * O prompt do video manda escrever "o texto exato que o narrador dira", e o
 * modelo devolve isso entre aspas no meio da descricao em ingles. O Veo precisa
 * da frase separada para poder repeti-la no bloco de audio.
 *
 * Tirar daqui em vez de pedir num campo proprio e deliberado: pedir duas vezes
 * a mesma frase daria duas fontes de verdade para o que o narrador diz, e elas
 * discordariam na primeira vez que o modelo reescrevesse uma delas.
 *
 * Sem narracao reconhecivel, devolve `undefined` e o video sai mudo, que e
 * melhor do que um narrador lendo descricao de cena em ingles.
 */
export function narracaoDoPrompt(prompt: string): string | undefined {
  /**
   * AS ASPAS SAO PAREADAS POR CONTAGEM, e nao por expressao regular.
   *
   * A primeira versao usava um regex do tipo `"([^"]{12,240})"` e falhava no
   * caso mais comum, que o teste pegou: num prompt com `"editorial" grade ...
   * voice-over: "Voce ja tem vinte horas gravadas"`, o regex descarta o
   * primeiro par (curto demais), engata na aspa de FECHAMENTO de "editorial"
   * e consome a aspa de ABERTURA da narracao como se fosse fechamento. A frase
   * que interessa sai do pareamento e o video sai mudo.
   *
   * Partir o texto nas aspas resolve de vez: os pedacos de indice IMPAR sao,
   * por construcao, o que esta dentro de aspas.
   */
  const pedacos = prompt.split(/["“”]/);
  const dentroDeAspas = pedacos.filter((_, i) => i % 2 === 1).map((t) => t.trim());
  const candidatos = dentroDeAspas.filter((t) => t.length >= 12 && t.length <= 240);
  if (candidatos.length === 0) return undefined;

  // Uma narracao em portugues tem acento ou palavra de ligacao portuguesa. Se
  // o que veio e ingles, e descricao de cena e nao fala, e um narrador lendo
  // descricao de cena em ingles e pior que um video mudo.
  const ehPortugues = (t: string) =>
    /[à-üÀ-Ü]/.test(t) || /(de|da|do|que|para|com|nao|voce|seu|sua)/i.test(t);

  const emPortugues = candidatos.filter(ehPortugues);
  if (emPortugues.length === 0) return undefined;
  // A maior: o prompt pode ter outras aspas curtas (nomes de estilo, termos).
  return emPortugues.sort((a, b) => b.length - a.length)[0];
}

async function saveCard(data: {
  runId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  dayOfWeek: number;
  scheduledDate?: Date;
  cardType: string;
  mediaType?: string;
  content?: string;
  mediaUrl?: string;
  postId?: string;
  metadata?: Record<string, unknown>;
  status?: string;
}) {
  const { metadata, ...rest } = data;

  /**
   * A ÚLTIMA PENEIRA, e ela é aqui porque aqui passa tudo.
   *
   * Todo texto de agente que vira peça entra por esta função. Em 18/09 um
   * parecer da Vera foi gravado como peça do Instagram por um caminho que
   * ninguém tinha previsto (o modelo ecoou o prompt inteiro). Prompt bom não
   * é garantia; esta conferência é.
   *
   * Vale só para os cards que VIRAM POST. O card da Vera (`preview`) contém o
   * parecer por definição, e o da pesquisa contém o briefing: barrar esses
   * seria apagar o trabalho deles.
   */
  const VIRA_POST = ["post_linkedin", "post_twitter", "video_clip", "video_completo"];
  if (rest.content && VIRA_POST.includes(rest.cardType)) {
    const peca = pecaPublicavel(rest.content);
    if ("recusado" in peca) {
      // O card é gravado assim mesmo, porém MARCADO: some do quadro e não vira
      // post. Descartar em silêncio deixaria o dia sem peça e sem explicação.
      rest.content = `⚠ Esta peça foi barrada antes de publicar: a resposta do agente veio como bastidor (${peca.recusado}).\n\nO texto bruto está guardado no histórico do card. Peça "refazer" no chat da peça.`;
      rest.status = "needs_revision";
    } else if (peca.texto !== rest.content) {
      // Recuperado do eco: fica o texto, sem o bastidor em volta.
      rest.content = peca.texto;
    }
  }

  return prisma.campaignCard.create({
    data: {
      ...rest,
      ...(metadata !== undefined ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

/** Parse poll content from structured agent output */
function parsePollContent(content: string): Record<string, unknown> {
  const lines = content.split("\n").map((l) => l.trim());
  const get = (prefix: string) =>
    lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";

  const intro = get("TEXTO_INTRO:");
  const question = get("PERGUNTA:");
  const opt1 = get("OPCAO_1:");
  const opt2 = get("OPCAO_2:");
  const opt3 = get("OPCAO_3:");
  const opt4 = get("OPCAO_4:");
  const duration = (get("DURACAO:") || "THREE_DAYS") as string;
  const options = [opt1, opt2, opt3, opt4].filter(Boolean);

  return { type: "poll", intro, question, options, duration };
}

/** Parse Twitter poll content from structured agent output */
function parseTwitterPollContent(content: string): Record<string, unknown> {
  const lines = content.split("\n").map((l) => l.trim());
  const get = (prefix: string) =>
    lines.find((l) => l.startsWith(prefix))?.replace(prefix, "").trim() ?? "";

  const tweet = get("TWEET:");
  const opt1 = get("OPCAO_1:");
  const opt2 = get("OPCAO_2:");
  const durationHours = parseInt(get("DURACAO_HORAS:") || "1440");
  const options = [opt1, opt2].filter(Boolean);

  return { type: "twitter_poll", tweet, options, durationHours };
}

/**
 * Regras que valem para todo agente, de todo projeto. Ficam separadas e
 * imutáveis de propósito: é o começo do prefixo cacheável, e qualquer byte
 * diferente aqui invalida o cache de todas as chamadas seguintes.
 */
const REGRAS_GLOBAIS = `Você está trabalhando em um projeto de conteúdo para redes sociais.
Responda sempre em português, com qualidade profissional e acentos corretos.
IMPORTANTE: Não use markdown (sem #, sem **, sem *). Escreva texto limpo com parágrafos separados por linha em branco.

REGRA DE OURO - INTEGRIDADE DE DADOS (obrigatório):
Você NUNCA pode inventar estatísticas, nomes de pessoas reais, nomes de empresas, estudos, pesquisas ou indicadores de mercado.
Se precisar citar um número, um estudo, uma empresa ou indicador, use SOMENTE dados reais e verificáveis, indicando sempre a fonte (ex: "segundo a McKinsey, 2024" ou "de acordo com o IBGE, 2025").
Apenas a redação, argumentação e estrutura textual devem ser criativas: os fatos devem ser sempre reais.
Se não tiver dados reais sobre um ponto específico, deixe em aberto para o usuário preencher com dados reais, não invente.

PESSOAS E NÚMEROS NO TEXTO PÚBLICO (obrigatório):
${REGRA_DE_PESSOAS_E_NUMEROS}`;

/**
 * Monta o prefixo cacheável de um projeto: regras globais mais os documentos
 * de contexto. Idêntico em todas as chamadas de agente do mesmo projeto, que é
 * exatamente o que o cache exige. Numa campanha de 5 dias são mais de 20
 * chamadas compartilhando esse mesmo bloco.
 */
/**
 * OS CRITÉRIOS DA VERA, ANTES DE ESCREVER.
 *
 * Medido em 20/09: a Vera reprovava 7 de 7 dias, e cada reprovação eram duas
 * chamadas de Opus a mais (Lucas e Tiago corrigindo). Os redatores nunca
 * tinham visto a lista contra a qual seriam julgados. Ela vai no PREFIXO
 * CACHEADO, e não em cada tarefa: custa tokens uma vez por campanha, e todo
 * agente a lê. A peça nasce certa em vez de ser consertada.
 */
const CRITERIOS_DE_ACEITE = `

O QUE A REVISORA (VERA VEREDITO) REPROVA, sem exceção. Confira ANTES de entregar:
1. Número, percentual, ranking ou "segundo a pesquisa X" que não esteja, com os mesmos dígitos, nos dados da pesquisa desta campanha. Sem fonte, a frase sai inteira; nunca troque por outro número nem arredonde.
2. Promessa de resultado (faturamento, clientes, alcance) e chamada para comprar ou contratar num conteúdo de topo de funil.
3. Tweet acima de 280 caracteres, e thread que começa com texto de bastidor ("segue a thread", "aqui está") em vez do tweet 1.
4. Numa adaptação para Facebook ou Instagram, frase que trata OUTRA rede como o lugar onde o leitor está ("seu post no LinkedIn", "o algoritmo do LinkedIn mudou"). Um fato da pesquisa que menciona uma rede continua valendo.
5. Texto que não está pronto para publicar: pedaço de rascunho, colchetes, "[inserir]", frase quebrada, markdown.
6. Travessão (o caractere —). Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
7. Promessa de mídia que a peça não tem: "gravei", "vídeo completo", "assista ao vídeo", duração ("3 minutos"), "vídeo nos comentários", link que não existe. A mídia do dia é dita na tarefa; se não foi dita, a peça é só texto e imagem.`;

function buildCachedPrefix(contextDocs: string, naoCitar: string[] = [], regrasDoProjeto = ""): string {
  // A restrição do cliente vai ANTES dos documentos, junto das regras: é
  // regra, não contexto. Ver lib/pipeline/restricoes.ts.
  const restricao = naoCitar.length
    ? `\n\nNUNCA CITE, em nenhuma peça, nem como fonte, nem como exemplo, nem como autoridade (é concorrente do cliente): ${naoCitar.join(", ")}. Se um dado só existe nessa fonte, o dado não entra.`
    : "";
  // As regras do projeto que o cliente APROVOU (02/10, lib/referencias/regras.ts):
  // também antes dos documentos, pelo mesmo motivo.
  return REGRAS_GLOBAIS + CRITERIOS_DE_ACEITE + restricao + regrasDoProjeto + contextDocs;
}

async function runAgent(
  agent: AgentStep,
  task: string,
  context: string,
  runId: string,
  funnelInstruction: string,
  cachedPrefix: string,
  projectId: string,
  agentOptions?: { maxTokens?: number }
): Promise<string> {
  await appendLog(runId, {
    agent: agent.name,
    message: `Iniciando: ${task.slice(0, 80)}...`,
    status: "running",
  });

  // A parte variável (quem é o agente, qual a tarefa) fica no system normal.
  // A parte estável vai em cachedPrefix, logo antes, e é o que a API cacheia.
  const system = `Você é ${agent.name}, ${agent.role}.
Persona: ${agent.persona}
Estilo: ${agent.style}

Diretriz de funil: ${funnelInstruction}`;

  const result = await askClaude(system, `${task}\n\nContexto:\n${context}`, {
    // 16.000, e nao 8192, e antes disso nao 2048. A REGRA DA CASA desde 22/08
    // e que nenhuma chamada que faz trabalho de verdade fica abaixo de 4000,
    // porque o teto inclui os tokens de PENSAMENTO: teto apertado nao gera
    // resposta curta, gera resposta VAZIA. A campanha de tema ficou fora dessa
    // regra e cobrou o preco duas vezes. Em 09/09, com 2048: o Tiago morreu
    // dizendo "gastou o limite de 2048 tokens pensando e nao chegou a
    // responder" e a Vera derrubou a semana inteira pelo mesmo motivo. Em
    // 10/09, ja com 8192 e na prova de sete dias: o Tiago morreu de novo, com
    // a mesma frase e o numero novo, e o sabado saiu sem post do X.
    //
    // O padrao passa a ser o mesmo teto que a Vera ganhou em 09/09. Subir o
    // teto nao encarece por si: o cobrado e o que o modelo escreve, e o teto
    // so decide quando ele morre no meio do proprio raciocinio.
    maxTokens: agentOptions?.maxTokens ?? 16_000,
    cachedPrefix,
    // Uma hora, e não cinco minutos: a campanha leva 51 min e são 54 chamadas
    // seguidas sobre o mesmo prefixo. Ver `cacheTtl` em lib/claude/index.ts.
    cacheTtl: "1h",
    usage: { operation: "agent", runId, agentId: agent.agentId, projectId },
  });

  await appendLog(runId, {
    agent: agent.name,
    message: `Tarefa concluída.`,
    output: result,
    status: "completed",
  });

  return result;
}

export type PedidoDeCampanha = {
  userId: string;
  projectId: string;
  topic: string;
  campaignConfig?: CampaignConfig;
};

export type RespostaDoPedido =
  | {
      ok: true;
      /** A execução inteira, e não só o id: a tela lê `run.status` dela. */
      run: Awaited<ReturnType<typeof prisma.pipelineRun.create>>;
      dias: number;
    }
  | { ok: false; status: number; error: string; necessario?: number; disponivel?: number; equipe?: boolean };

/**
 * Aceita o pedido de campanha, cria a execução e PÕE OS DIAS NA FILA.
 *
 * Até 10/09 esta função gerava a semana inteira ali mesmo, dentro do `after`
 * da requisição do cliente, e por isso o teto da plataforma decidia quantos
 * dias o produto entregava. Agora ela só valida, cobra a entrada (saldo),
 * abre a execução e enfileira: um trabalho para a pesquisa do Roberto e um
 * para cada dia. Quem trabalha é a fila, e a tela só acompanha.
 *
 * Continua respondendo em segundos, e é isso que o cliente vê.
 */
export async function agendarCampanha({
  userId,
  projectId,
  topic,
  campaignConfig,
}: PedidoDeCampanha): Promise<RespostaDoPedido> {
  if (!projectId || !topic) {
    return { ok: false, status: 400, error: "projectId and topic required" };
  }

  const config: CampaignConfig = campaignConfig ?? {
    campaignMode: "weekly",
    funnelStage: "tofu",
    weeklySchedule: { "1": "text", "2": "image", "3": "text", "4": "image", "5": "free" }, // Sáb/Dom ausentes = não gerar
    weekStart: currentMonday(),
  };

  // Ensure weekStart is set
  if (!config.weekStart) config.weekStart = currentMonday();

  /**
   * O INÍCIO NUNCA FICA ANTES DE HOJE, e quem garante é o servidor.
   *
   * Em 19/09 o modal já tinha o piso em hoje e mesmo assim chegou um pedido
   * com `weekStart` 14/09 numa sexta 18: a aba do Bruno estava aberta desde
   * antes do deploy, com o bundle antigo. O Paulo passou a falar de "material
   * de segunda" porque, para a esteira, o dia 1 ERA segunda 14. Confiar no
   * navegador para uma regra de negócio é confiar numa versão que a gente não
   * escolhe.
   *
   * Ao mover o início, `postingTimestamps` cai fora: ele foi calculado pelo
   * navegador para as datas antigas e os índices dos dias não casam mais. O
   * servidor recalcula a partir de `postingTimes` (HH:mm no fuso do projeto),
   * que é o caminho certo desde 18/09.
   */
  const hojeDoPedido = /^\d{4}-\d{2}-\d{2}$/.test(config.hojeLocal ?? "") ? config.hojeLocal! : null;
  if (
    hojeDoPedido &&
    (config.campaignMode === "weekly" || config.campaignMode === "biweekly") &&
    config.weekStart < hojeDoPedido
  ) {
    console.warn(`[campanha] weekStart ${config.weekStart} está no passado; movido para ${hojeDoPedido}`);
    config.weekStart = hojeDoPedido;
    delete config.postingTimestamps;
  }

  /**
   * POST ÚNICO É UMA DATA, e a data nunca fica antes de hoje.
   *
   * O piso acima só valia para semanal e quinzenal, e o Bruno pegou o buraco
   * minutos depois: um post único chegou com `singleDay: 1` e `weekStart`
   * 14/09 numa sexta 18, sem `singleDate`. O log disse "Gerando o quadro de
   * Segunda-feira 14". Aqui a regra é uma só: sem data, a data é hoje; com
   * data no passado, vira hoje; e `weekStart` passa a ser a segunda da semana
   * dessa data, porque é sobre ele que `nomeDoDia` e `getScheduledDate`
   * contam os dias. Sem isso o nome sairia de outra semana.
   */
  if (hojeDoPedido && config.campaignMode === "single") {
    const dataDoAgendamento = config.singleScheduledAt
      ? new Date(config.singleScheduledAt).toISOString().slice(0, 10)
      : null;
    if (!config.singleDate && !dataDoAgendamento) config.singleDate = hojeDoPedido;
    if (config.singleDate && config.singleDate < hojeDoPedido) {
      console.warn(`[campanha] singleDate ${config.singleDate} está no passado; movido para ${hojeDoPedido}`);
      config.singleDate = hojeDoPedido;
      delete config.singleScheduledAt;
    }
    const data = config.singleDate ?? dataDoAgendamento!;
    const d = new Date(data + "T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    config.weekStart = d.toISOString().slice(0, 10);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      agents: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      socialAccounts: { where: { isActive: true } },
      contexts: true,
    },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) {
    return { ok: false, status: 404, error: "Not found" };
  }

  // Clean old media from drafts
  const oldRuns = await prisma.pipelineRun.findMany({
    where: { projectId, status: "completed" },
    orderBy: { startedAt: "desc" },
    skip: 2,
    select: { id: true },
  });
  if (oldRuns.length > 0) {
    await prisma.post.updateMany({
      where: {
        projectId,
        runId: { in: oldRuns.map((r) => r.id) },
        imageUrl: { not: null },
        status: { in: ["draft", "failed"] },
      },
      data: { imageUrl: null },
    });
  }

  // Verificação de saldo antes de qualquer chamada paga. A estimativa
  // superestima de propósito: barrar quem não tem saldo é o objetivo, e a
  // cobrança real acontece no fim, pelo que foi entregue. Rodar a campanha
  // inteira para descobrir no fim que o cliente não podia pagar seria gastar
  // com a API e não receber.
  /**
   * A MESMA CONTA QUE A JANELA MOSTROU, e isso mudou em 21/09.
   *
   * Duas correções, e as duas vinham mentindo para lados opostos:
   *
   *   1. as REDES da campanha, e não todas as contas conectadas. Quem tem
   *      quatro redes ligadas e escolhe publicar em duas era barrado por uma
   *      conta que nunca ia acontecer;
   *   2. as SEMANAS. Uma campanha quinzenal roda a mesma semana duas vezes, e
   *      a estimativa contava uma. Ela passava na porta e o saldo acabava no
   *      meio, que é o pior lugar para acabar.
   */
  const redesDaCampanha =
    config.platforms?.length
      ? config.platforms
      : project.socialAccounts.map((c) => c.platform);
  const estimativa = estimarCampanha({
    dias: Object.values(config.weeklySchedule ?? {}).map((tipo) => ({ tipo, redes: redesDaCampanha })),
    redesConectadas: Math.max(1, redesDaCampanha.length),
    laminasDoCarrossel: config.laminasDoCarrossel,
    semanas: config.campaignMode === "biweekly" ? 2 : 1,
  });
  /**
   * OS LIMITES DO TESTE, antes de qualquer coisa custar dinheiro (22/09).
   *
   * Decisao do Bruno: no teste, UMA campanha de ate sete dias, com UM video
   * de ate 30 s. O motivo e de caixa: o cartao so e cobrado no oitavo dia, e
   * tudo o que a conta consumir ate la e custo nosso. Uma campanha de sete
   * dias em quatro redes custa R$ 31 de IA, e um video de 60 s custa mais
   * R$ 52 e come NOVE das dez geracoes que o fornecedor libera por dia para a
   * plataforma inteira.
   *
   * A janela ja oferece so o que cabe, mas a janela e o navegador: quem entra
   * pela rota ou com uma aba antiga passa por cima dela. A guarda e aqui.
   *
   * O video e ENCURTADO em vez de recusado. Recusar a campanha inteira por
   * causa da duracao do clipe seria punir sete dias de trabalho por um
   * detalhe que tem conserto obvio, e o cliente sai sem entender o que fez de
   * errado. O aviso vai no log da execucao.
   */
  const teste = await limiteDoTeste(userId);
  if (teste.emTeste) {
    if (acabouAsCampanhas(teste)) {
      return {
        ok: false,
        status: 402,
        error:
          `O teste inclui ${teste.campanhas} campanha, e ela já foi gerada. ` +
          `Assine para gerar quantas quiser: a cobrança só começa quando o teste terminar.`,
      };
    }
    const diasPedidos = Object.keys(config.weeklySchedule ?? {}).length;
    if (diasPedidos > teste.dias || config.campaignMode === "biweekly") {
      return {
        ok: false,
        status: 402,
        error:
          `Durante o teste a campanha vai até ${teste.dias} dias, e esta tem ${config.campaignMode === "biweekly" ? diasPedidos * 2 : diasPedidos}. ` +
          `Tire os dias que sobram, ou assine para liberar as semanas inteiras.`,
      };
    }
    const pedidoDeVideo = normalizarDuracao(config.videoDuration);
    if (pedidoDeVideo > teste.segundosDeVideo) {
      config.videoDuration = teste.segundosDeVideo;
    }
  }

  const disponivel = await saldo(userId);
  if (disponivel < estimativa) {
    // MEMBRO DA EQUIPE (01/10, acabamento): não compra; a frase diz a quem
    // pedir, pelo nome, e a saída que ele tem sozinho é tirar um dia.
    const doMembro = await fraseDeSaldoDoMembro(userId, { necessario: estimativa, disponivel });
    if (doMembro) {
      return {
        ok: false,
        status: 402,
        error: `${doMembro} Ou tire um dia da semana para caber no saldo.`,
        necessario: estimativa,
        disponivel,
        equipe: true,
      };
    }
    return {
      ok: false,
      status: 402,
      /**
       * O QUE FALTA, E O QUE FAZER, em vez de só "não deu".
       *
       * Pedido do Bruno em 21/09: "se de fato acabar, precisa levar o cliente
       * a comprar mais créditos, não só dar erro". A mensagem diz o número que
       * falta (que é o que decide entre comprar e cortar um dia) e as duas
       * saídas, na ordem em que uma pessoa pensa: comprar para fazer o que
       * queria, ou reduzir para caber no que tem.
       */
      error:
        `Faltam ${estimativa - disponivel} créditos para esta campanha: ela usa ${estimativa} e você tem ${disponivel}. ` +
        `Você pode comprar mais créditos e rodar a campanha inteira, ou tirar um dia da semana para caber no saldo.`,
      necessario: estimativa,
      disponivel,
    };
  }

  // O TETO DO MEMBRO DA EQUIPE (01/10): a campanha é cobrada só no fim, então
  // o teto que o dono deu ao membro é conferido aqui, antes de gerar.
  const teto = await restanteDoTeto(userId);
  if (teto && teto.restante < estimativa) {
    return {
      ok: false,
      status: 402,
      error: fraseDoTetoDeCreditos(teto.usados, teto.teto, estimativa),
      necessario: estimativa,
      disponivel: teto.restante,
    };
  }

  const weekStartDate = new Date(config.weekStart + "T00:00:00.000Z");

  /**
   * A CAMPANHA NOVA NÃO MEXE NO QUE JÁ EXISTE, a não ser que a pessoa peça.
   *
   * De 21/09 a 05/10 este trecho arquivava sozinho todo rascunho do projeto
   * que caísse nos dias da campanha nova ("a proposta nova substitui a
   * antiga"). Em 05/10 um POST ÚNICO de segunda cancelou os seis posts da
   * semana que o vídeo tinha acabado de gerar: a janela do único é a semana
   * inteira e o filtro não olhava run nem modo. Regra do Bruno desde então:
   * uma campanha NUNCA arquiva peça de outra por conta própria. O quadro
   * aceita várias peças por dia, e a nova é SOMADA. A tela avisa "já existe
   * peça neste dia" e oferece substituir; só com essa escolha explícita
   * (`substituirRascunhos`), e só na campanha de semana, os rascunhos de
   * OUTRAS campanhas saem. Post único e recorrente nunca substituem.
   *
   * Arquivar e nao apagar: a peca continua no banco e volta se alguem quiser.
   */
  const { fim: fimDaJanela } = janelaDaCampanha({ campaignMode: config.campaignMode, weekStart: config.weekStart });
  let aposentados = 0;
  if (substituiRascunhos(config)) {
    const r = await prisma.post.updateMany({
      where: {
        projectId: project.id,
        status: "draft",
        scheduledAt: { gte: weekStartDate, lt: fimDaJanela },
      },
      data: { status: "cancelled" },
    });
    aposentados = r.count;
    if (aposentados > 0) {
      console.log(`[campanha] ${aposentados} rascunho(s) de outras campanhas arquivados a pedido do cliente`);
    }
  }

  const run = await prisma.pipelineRun.create({
    data: {
      projectId,
      status: "running",
      topic,
      campaignMode: config.campaignMode,
      weekStart: weekStartDate,
      config: config as unknown as Prisma.InputJsonValue,
      logs: [],
    },
  });

  // O cliente precisa saber o que sumiu do calendario dele, e por que. Sem
  // esta linha, quatro pecas desaparecem em silencio e ninguem liga uma coisa
  // a outra.
  if (aposentados > 0) {
    await appendLog(run.id, {
      agent: "Sistema",
      message:
        `${aposentados} rascunho(s) de outras campanhas para estes dias foram arquivados, como voce escolheu ` +
        `ao gerar esta campanha. Posts agendados e publicados nao foram tocados.`,
      status: "running",
    });
  }

  // ── A fila ────────────────────────────────────────────────────────────────
  // A pesquisa é a ordem 0 e cada dia vem depois, na ordem da semana. A fila
  // roda um trabalho por grupo de cada vez, então esta numeração é o que
  // garante que nenhum dia comece antes de a pesquisa existir.
  // O instante do RUN, e não `new Date()`: a mesma referência vale aqui e em
  // cada dia que rodar depois, senão a virada da meia-noite entre o pedido e a
  // execução mudaria a regra debaixo de um trabalho já enfileirado.
  const dias = diasDaCampanha(config, { agora: run.startedAt, fuso: project.timezone });
  if (dias.length === 0) {
    await appendLog(run.id, {
      agent: "Sistema",
      message:
        "Nenhum dia para gerar (todos os dias configurados já passaram ou não há agendamento).",
      status: "failed",
    });
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "failed", endedAt: new Date() },
    });
    return { ok: false, status: 400, error: "Nenhum dia para gerar." };
  }

  await enfileirar([
    {
      tipo: "campanha-pesquisa",
      grupo: run.id,
      ordem: 0,
      userId: project.userId,
      projectId: project.id,
    },
    ...dias.map((d, i) => ({
      tipo: "campanha-dia" as const,
      grupo: run.id,
      // A pesquisa é a 0; os dias vão de 10 em 10 para o vídeo de um dia
      // caber entre ele e o seguinte (ordem do dia + 5). Ver o enfileirar do
      // vídeo em runPipeline.
      ordem: (i + 1) * 10,
      userId: project.userId,
      projectId: project.id,
      payload: { dayOfWeek: d.dayOfWeek, weekOffset: d.weekOffset, contentType: d.contentType },
    })),
  ]);

  await appendLog(run.id, {
    agent: "Sistema",
    message: `${dias.length} dia(s) na fila: ${dias.map((d) => nomeDoDia(config.weekStart, d.dayOfWeek, d.weekOffset)).join(", ")}. A pesquisa começa agora.`,
    status: "running",
  });

  // Acorda a fila sem esperar o cron: quem acabou de pedir não deve esperar
  // até um minuto para a pesquisa começar.
  cutucar();

  return { ok: true, run, dias: dias.length };
}

/**
 * Roda UM trabalho da campanha, que é o que a fila chama.
 *
 * Recarrega projeto e execução do banco em vez de receber o estado pronto, de
 * propósito: entre um trabalho e o seguinte pode ter passado meia hora, o
 * cliente pode ter cancelado, e payload que carrega estado vira cópia que
 * envelhece.
 */
export async function rodarTrabalhoDaCampanha(
  runId: string,
  fatia: FatiaDaCampanha
): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    // `startedAt` entra no select porque é a referência de tempo da lista de
    // dias: sem ele, um dia enfileirado antes da meia-noite seria recalculado
    // depois dela contra outra regra e o trabalho se acharia fora da semana.
    select: { id: true, status: true, topic: true, config: true, projectId: true, startedAt: true },
  });
  if (!run) throw new Error(`Execução ${runId} não existe mais.`);
  if (run.status === "cancelled") return;

  const project = await prisma.project.findUnique({
    where: { id: run.projectId },
    include: {
      agents: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      socialAccounts: { where: { isActive: true } },
      contexts: true,
    },
  });
  if (!project) throw new Error(`Projeto da execução ${runId} não existe mais.`);

  const config = (run.config ?? {}) as unknown as CampaignConfig;
  await runPipeline(runId, project, run.topic ?? "", config, fatia, run.startedAt);
}

/**
 * Fecha a campanha: cobra pelo que foi entregue e marca a execução.
 *
 * Roda quando o último trabalho do grupo termina, e não no fim de cada dia,
 * porque a cobrança é por campanha e é idempotente pelo id da execução.
 *
 * Cobra pelo que foi ENTREGUE, não pelo que foi planejado: se a geração de
 * imagem falhou e o post saiu só com texto, o cliente paga texto. Os posts são
 * lidos do banco pelo `runId`, e não de uma lista em memória, porque agora
 * cada dia rodou numa função diferente e nenhuma delas viu a semana inteira.
 */
export async function fecharCampanha(runId: string): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, config: true, project: { select: { id: true, userId: true } } },
  });
  if (!run || run.status === "cancelled") return;
  // Já fechada: o cron pode chamar duas vezes se dois trabalhos terminarem
  // quase juntos, e fechar duas vezes não pode cobrar duas vezes.
  if (run.status === "completed" || run.status === "failed") return;

  const config = (run.config ?? {}) as unknown as CampaignConfig;
  const postsDaCampanha = await prisma.post.findMany({
    where: { runId },
    // `dayOfWeek` e `imageUrl` entraram em 19/09 para a cobrança do carrossel:
    // o dia agrupa as peças que compartilham a arte, e a url diz quantas
    // lâminas ela tem de verdade (elas vêm juntas, separadas por "|").
    select: { id: true, mediaType: true, platform: true, sourcesComment: true, dayOfWeek: true, imageUrl: true, metadata: true },
  });

  // QUEM PEDIU a campanha (01/10): o trabalho da fila guarda o userId de quem
  // disparou. Com a equipe, é ele que marca o gasto no extrato do dono
  // (autorId) e conta no teto dele. Sem trabalho, vale o dono do projeto.
  const quemPediu =
    (await prisma.trabalho.findFirst({ where: { grupo: runId }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId ??
    run.project.userId;

  let creditosCobrados = 0;
  if (postsDaCampanha.length > 0 && !(await jaCobrado("campanha", runId))) {
    creditosCobrados = custoTotal(
      postsDaCampanha.map((p) => ({
        // Material que o cliente subiu não é arte gerada: cobra como texto. A
        // arte que ficou aguardando a identidade (05/10) também: ela é cobrada
        // quando sair, depois da aprovação.
        mediaType: (p.metadata as { midiaPropria?: boolean; aguardandoIdentidade?: boolean } | null)?.midiaPropria || (p.metadata as { aguardandoIdentidade?: boolean } | null)?.aguardandoIdentidade ? "text" : p.mediaType,
        platform: p.platform,
        temLink: Boolean(p.sourcesComment),
        // `dia` e `laminas` existem para o carrossel: as tres redes que o
        // aceitam recebem a MESMA arte, entao ele e cobrado uma vez por dia e
        // nao uma por rede. Ver o comentario em ItemCobravel.dia.
        dia: p.dayOfWeek,
        laminas: p.mediaType === "carousel" && p.imageUrl ? p.imageUrl.split("|").length : undefined,
      }))
    );
    const cobranca = {
      quantidade: creditosCobrados,
      operation: "campanha",
      projectId: run.project.id,
      refId: runId,
      note: `${postsDaCampanha.length} posts`,
    };
    try {
      try {
        await debitar({ userId: quemPediu, ...cobranca });
      } catch (e) {
        // O teto do membro passou entre a conferência da entrada e o fim (outra
        // geração dele no meio). A campanha já foi entregue e a CONTA tem
        // saldo: cobra da conta, sem o teto, em vez de entregar de graça.
        if (!(e instanceof TetoDoMembro)) throw e;
        await debitar({ userId: run.project.userId, ...cobranca, note: `${cobranca.note}; pedida por membro da equipe acima do teto` });
      }
    } catch (err) {
      // O trabalho já foi feito e entregue. Cobrar não pode apagar a entrega,
      // então o saldo insuficiente aqui vira registro, não erro para o cliente.
      // A estimativa na entrada existe justamente para isso quase nunca cair
      // aqui.
      if (err instanceof SaldoInsuficiente) {
        creditosCobrados = 0;
        console.error(`[pipeline] run ${runId} entregue sem cobrar: ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  const { falhados } = await estadoDoGrupo(runId);

  /**
   * CAMPANHA SEM PEÇA NENHUMA É CAMPANHA FALHADA.
   *
   * "Concluída! 0 posts criados" foi a mensagem que o Bruno leu em 19/09 com
   * a plataforma inteira parada. Concluída é a palavra do sucesso, e um
   * cliente que a lê vai procurar os posts. Zero posts fecha como falhou, com
   * o número de dias que não deram certo, e nada é cobrado.
   */
  const semNada = postsDaCampanha.length === 0;

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: semNada ? "failed" : "completed",
      endedAt: new Date(),
      output: {
        campaignMode: config.campaignMode,
        funnelStage: config.funnelStage,
        weeklySchedule: config.weeklySchedule,
        postsCreated: postsDaCampanha.map((p) => p.id),
        totalPosts: postsDaCampanha.length,
        diasQueFalharam: falhados,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await appendLog(runId, {
    agent: "Sistema",
    creditsCharged: creditosCobrados,
    message: semNada
      ? `A campanha não gerou nenhuma peça: ${falhados} dia(s) falharam. Nada foi cobrado. Veja os avisos acima e peça de novo.`
      : falhados
        ? `Campanha ${config.campaignMode} concluída com ${falhados} dia(s) que não deram certo. ${postsDaCampanha.length} posts criados para aprovação.`
        : `Campanha ${config.campaignMode} concluída! ${postsDaCampanha.length} posts criados para aprovação.`,
    status: semNada ? "error" : "completed",
  });
}

/**
 * Quais dias esta campanha gera, lidos so da configuracao.
 *
 * Vive no nivel do modulo porque quem ENFILEIRA precisa da lista antes de
 * qualquer dia rodar: e ela que vira um trabalho por dia. Enquanto morou
 * dentro do motor, so quem ja estava gerando sabia quantos dias existiam.
 */
/**
 * Quando a peça de um dia da SEMANA ATUAL sairia, se nada a empurrasse.
 *
 * A ordem das fontes é a mesma do `getScheduledAt`, e isso não é coincidência:
 * são duas respostas para a mesma pergunta, e duas regras parecidas para a
 * mesma pergunta é o que produziu o defeito de fuso da parte 130 e o do dia
 * empurrado da parte 137. O caminho do navegador (`postingTimestamps`) é o
 * preferido porque chega como instante absoluto, com o fuso da pessoa dentro.
 */
function instantePrevisto(
  config: CampaignConfig,
  dayOfWeek: number,
  dayDate: Date,
  fuso?: string | null
): Date {
  const doNavegador = config.postingTimestamps?.[String(dayOfWeek)];
  if (doNavegador) {
    const d = new Date(doNavegador);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const hora = config.postingTimes?.[String(dayOfWeek)] ?? "09:00";
  return instanteLocalSeguro(dayDate.toISOString().slice(0, 10), hora, fuso ?? FUSO_PADRAO);
}

export function diasDaCampanha(
  config: CampaignConfig,
  /**
   * O instante de referência e o fuso do projeto.
   *
   * `agora` existe porque esta função é chamada DUAS vezes por campanha (ao
   * enfileirar e de novo quando cada dia roda, para o dia velho não sair de
   * uma regra diferente da que o criou), e a decisão sobre hora vencida
   * depende do relógio. Com `new Date()` dentro da função, um dia enfileirado
   * às 23h59 seria recalculado depois da meia-noite e a fatia se acharia fora
   * da lista. Quem chama passa `run.startedAt`, que é o mesmo nas duas.
   */
  opcoes?: { agora?: Date; fuso?: string | null }
): Array<{ dayOfWeek: number; contentType: ContentType; weekOffset: number }> {
  const weeksToGenerate: number[] = config.campaignMode === "biweekly" ? [0, 1] : [0];
  if (config.campaignMode === "single") {
    // Derive actual dayOfWeek from the scheduled date/timestamp (not the stale singleDay field)
    let day = config.singleDay ?? 1;
    if (config.singleScheduledAt) {
      const utcDay = new Date(config.singleScheduledAt).getUTCDay(); // 0=Sun
      day = utcDay === 0 ? 7 : utcDay; // convert to 1=Mon…7=Sun
    } else if (config.singleDate) {
      const utcDay = new Date(config.singleDate + "T12:00:00.000Z").getUTCDay();
      day = utcDay === 0 ? 7 : utcDay;
    }
    const ct = config.singleContentType ?? "text";
    return [{ dayOfWeek: day, contentType: ct, weekOffset: 0 }];
  }

  if (config.campaignMode === "recurring") {
    // Agent decides — Mon(text), Wed(image or carousel), Fri(poll or article)
    return [
      { dayOfWeek: 1, contentType: "text" as ContentType, weekOffset: 0 },
      { dayOfWeek: 3, contentType: "image" as ContentType, weekOffset: 0 },
      { dayOfWeek: 5, contentType: "poll" as ContentType, weekOffset: 0 },
    ];
  }

  const result: Array<{ dayOfWeek: number; contentType: ContentType; weekOffset: number }> = [];

  // Cutoff: yesterday midnight UTC.
  // Using "yesterday" instead of "today" gives a 24h buffer so that a user in UTC-3
  // who is generating at 9pm local time (= midnight UTC next day) doesn't lose "today".
  // A MESMA regra da tela, e nao uma parecida. A tela omite todo dia anterior
  // a "hoje" no fuso da pessoa, e diz isso a ela ("1 dia omitido"). Aqui o
  // corte era "ontem, meia-noite UTC", que deixa passar o dia anterior
  // inteiro: em 09/09 a terca foi gerada numa quarta, empurrada para "agora"
  // e apareceu na coluna de quarta com rotulo de terca. Duas regras para a
  // mesma pergunta e o que produz esse tipo de defeito.
  //
  // O "hoje" vem do navegador (`hojeLocal`). Sem ele (pedido antigo), cai no
  // Brasil, UTC-3, que e onde o produto vende.
  const hojeLocal = /^\d{4}-\d{2}-\d{2}$/.test(config.hojeLocal ?? "")
    ? config.hojeLocal!
    : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const cutoffUtc = new Date(hojeLocal + "T00:00:00.000Z");

  for (const weekOffset of weeksToGenerate) {
    for (const [dayKey, contentType] of Object.entries(config.weeklySchedule)) {
      if (!contentType) continue; // skip days without content type (= off)

      const dayOfWeek = parseInt(dayKey);

      if (weekOffset === 0) {
        // Skip days that are clearly in the past (more than 1 full day ago in UTC).
        // The 24h buffer handles users in UTC-3 (Brazil): at 9pm local time the UTC
        // clock already shows "tomorrow", so without buffer "today" would be skipped.
        const dayDate = new Date(config.weekStart + "T00:00:00.000Z");
        dayDate.setUTCDate(dayDate.getUTCDate() + (dayOfWeek - 1));
        // DIA QUE JÁ PASSOU VAI PARA A SEMANA SEGUINTE, e não para o lixo.
        //
        // Até 18/09 a linha aqui era `continue`: quem pedia sete dias numa
        // sexta recebia três, e a tela ainda mostrava os sete campos de tema.
        // O Bruno viu a conta não fechar: "se a campanha é de 7 dias é de 7
        // dias e pronto, está cortando, quebrando".
        //
        // Empurrar para `weekOffset + 1` mantém a promessa (sete dias são
        // sete peças) e mantém o dia da semana que a pessoa escolheu: quem
        // pediu infográfico na terça continua com infográfico na terça, só que
        // na terça que ainda vai chegar.
        //
        // Vai para depois da ÚLTIMA semana pedida, e não para a seguinte: na
        // campanha quinzenal a semana 1 já gera esse mesmo dia, e somar 1
        // criaria duas peças iguais no mesmo dia.
        if (dayDate < cutoffUtc) {
          if (config.horarioPassado === "pular") continue;
          if (config.horarioPassado === "agora") {
            // Escolha explícita de publicar já: o dia fica nesta semana e o
            // `getScheduledAt` empurra para dez minutos à frente.
            result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset });
            continue;
          }
          const depoisDeTudo = Math.max(...weeksToGenerate) + 1;
          result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset: depoisDeTudo });
          continue;
        }

        /**
         * O DIA É HOJE, E SÓ A HORA JÁ PASSOU.
         *
         * Este é o caso que nenhuma das duas regras acima pegava, e é o que o
         * Bruno viveu: ele mandou a campanha de sete dias às 23h41 de uma
         * quinta, com horário das 09:00. A quinta não é um dia anterior, então
         * entrava nesta semana, e o `getScheduledAt` a empurrava para "agora
         * mais dez minutos", que caiu 01:25 da SEXTA. A peça de quinta saiu na
         * madrugada de sexta sem ninguém ter escolhido isso.
         *
         * Agora quem escolhe é quem pede a campanha, na tela de resumo. Sem
         * escolha (campanha antiga, ou chamada direta da API) o comportamento
         * não muda: continua sendo publicar agora, porque mudar o padrão de um
         * pedido que já existia seria decidir no lugar de quem pediu.
         */
        if (config.horarioPassado && config.horarioPassado !== "agora") {
          const previsto = instantePrevisto(config, dayOfWeek, dayDate, opcoes?.fuso);
          if (previsto <= (opcoes?.agora ?? new Date())) {
            if (config.horarioPassado === "pular") continue;
            const depoisDeTudo = Math.max(...weeksToGenerate) + 1;
            result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset: depoisDeTudo });
            continue;
          }
        }
        // postingTimestamps are used only by getScheduledAt for the exact posting time.
        // Never skip a day just because its timestamp is absent — the user explicitly
        // requested this week and getScheduledAt will schedule past slots for +10min.
      }

      result.push({ dayOfWeek, contentType: contentType as ContentType, weekOffset });
    }
  }
  return result;
}

async function runPipeline(
  runId: string,
  project: Awaited<ReturnType<typeof prisma.project.findUnique>> & {
    agents: Array<{
      id: string;
      agentId: string;
      name: string;
      role: string;
      persona: string | null;
      style: string | null;
    }>;
    socialAccounts: Array<{ id: string; platform: string; blotatoAccountId: string | null }>;
    contexts: Array<{ id: string; type: string; title: string; compiled: string; status: string }>;
  },
  topic: string,
  config: CampaignConfig,
  fatia: FatiaDaCampanha,
  /** Quando a campanha começou. É a referência de tempo da lista de dias. */
  runStartedAt: Date
) {
  if (!project) return;

  const funnelInstruction = FUNNEL_INSTRUCTIONS[config.funnelStage];
  const weekStartIso = config.weekStart ?? currentMonday();

  /** Get scheduledAt datetime for a given dayOfWeek + weekOffset, including time from config */
  function getScheduledAt(dayOfWeek: number, weekOffset: number): Date {
    const now = new Date();

    // Prefer pre-computed UTC ISO from the browser (timezone-correct)
    if (config.campaignMode === "single" && config.singleScheduledAt) {
      const d = new Date(config.singleScheduledAt);
      // Never schedule in the past — bump to 10 min from now
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
    }
    if (weekOffset === 0 && config.postingTimestamps?.[String(dayOfWeek)]) {
      const d = new Date(config.postingTimestamps[String(dayOfWeek)]);
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
    }
    // Fallback do SERVIDOR, e ele estava três horas errado até 18/09.
    //
    // A linha antiga dizia "always use UTC to avoid local-timezone drift" e
    // fazia `setUTCHours(9, 0)` para uma campanha marcada às 09:00. A Vercel
    // roda em UTC, então o post saía às **06:00 em São Paulo**, de madrugada,
    // que é o pior horário possível para publicar.
    //
    // O caminho do navegador (`postingTimestamps`, acima) sempre esteve certo:
    // ele calcula na máquina da pessoa e chega como instante absoluto. Só este
    // ramo errava, e ele é justamente quem agenda SEMANA FUTURA, o caso que
    // ninguém confere na hora de criar.
    //
    // `project.timezone` existia no banco, aparecia na tela e não era lido por
    // nenhuma linha do código. Agora é. Sem ele, o padrão é São Paulo, e não
    // UTC: o produto é brasileiro e o fuso da casa é o nosso.
    const fuso = project.timezone ?? FUSO_PADRAO;
    if (config.campaignMode === "single" && config.singleDate) {
      const time = config.singleTime ?? "09:00";
      const d = instanteLocalSeguro(config.singleDate, time, fuso);
      return d <= now ? new Date(now.getTime() + 10 * 60 * 1000) : d;
    }
    const offsetDays = weekOffset * 7;
    const base = new Date(weekStartIso + "T00:00:00.000Z");
    base.setUTCDate(base.getUTCDate() + (dayOfWeek - 1) + offsetDays); // UTC-safe
    const timeStr =
      config.campaignMode === "single"
        ? (config.singleTime ?? "09:00")
        : (config.postingTimes?.[String(dayOfWeek)] ?? "09:00");
    // A data sai em UTC de propósito (é só um contador de dias); a HORA é que
    // passa a ser lida no fuso do projeto.
    const d = instanteLocalSeguro(base.toISOString().slice(0, 10), timeStr, fuso);
    // If the computed date is in the past, schedule for +10min (don't advance to next week —
    // the user explicitly requested this week's campaign and wants today's content generated)
    if (d <= now) return new Date(now.getTime() + 10 * 60 * 1000);
    return d;
  }


  // Só o dia desta fatia. A lista inteira já foi decidida na hora de
  // enfileirar, e é relida aqui a partir da MESMA função, para o dia de um
  // trabalho velho não sair de uma regra diferente da que o criou.
  const daysList =
    fatia.fase === "dia"
      ? diasDaCampanha(config, { agora: runStartedAt, fuso: project.timezone }).filter(
          (d) => d.dayOfWeek === fatia.dayOfWeek && d.weekOffset === fatia.weekOffset
        )
      : [];

  if (fatia.fase === "dia" && daysList.length === 0) {
    // O dia saiu da lista entre o pedido e a execução: a semana virou, ou a
    // configuração mudou. Não é falha, é trabalho que perdeu a razão de ser.
    await appendLog(runId, {
      agent: "Sistema",
      message: `O dia ${nomeDoDia(config.weekStart, fatia.dayOfWeek, fatia.weekOffset)} não está mais na semana pedida e foi dispensado.`,
      status: "warning",
    });
    return;
  }

  // Build context block from ProjectContext
  //
  // SO ENTRA O QUE FOI LIDO DE VERDADE (status "pronto"), regra de 18/09. Um
  // documento ainda sendo lido, ou que falhou, tem `compiled` vazio: ele entrava
  // aqui como um titulo seguido de nada, gastando lugar no prompt e dizendo ao
  // modelo que existe material de marca onde nao existe. Titulo sem conteudo e
  // pior que ausencia, porque o modelo tenta honrar a promessa do titulo.
  const prontos = project.contexts.filter((c) => c.status === "pronto" && c.compiled.trim().length > 0);
  const contextDocs = prontos.length > 0
    ? "\n\n--- CONTEXTO DO PROJETO ---\n" + prontos.map((c) => `## ${c.title}\n${c.compiled}`).join("\n\n")
    : "";

  // O que o cliente proíbe de citar (concorrentes). Lido do banco a cada
  // fatia, para uma regra dada no meio da campanha valer no dia seguinte.
  const naoCitar = await lerNaoCitar(project.id);
  if (naoCitar.length && fatia.fase === "pesquisa") {
    await appendLog(runId, { agent: "Sistema", message: `Regra do cliente: nunca citar ${naoCitar.join(", ")}.`, status: "running" });
  }

  // Prefixo cacheável: idêntico em todas as chamadas de agente deste run.
  // Numa campanha de 5 dias isso é reaproveitado por mais de 20 chamadas.
  // As regras aprovadas pelo cliente (roteiro e textos) leem do banco a cada
  // fatia, como a restrição: aprovou hoje, vale no próximo dia da campanha.
  const regrasDoProjeto = await blocoDasRegrasDoProjeto(project.id, ["roteiro", "redacao"]);
  // O ESTUDO DOS PERFIS (03/10, lib/referencias/estudo-na-campanha.ts): o que
  // rende no perfil do cliente e nas referências, o de-para, a linha editorial
  // e as tendências que combinam. Entra no prefixo junto das regras: é estável
  // durante a campanha e vale para todo agente. Vazio sem estudo.
  const estudoDosPerfis = await blocoDoEstudoDosPerfis(project.id);
  // OS LINKS DO CLIENTE (03/10, lib/projeto/links-do-cliente.ts): como DADO,
  // com a regra de cada rede. Estáveis na campanha, por isso no prefixo.
  const linksDoCliente = blocoDosLinks(lerLinks(project.config));
  // A MEMÓRIA DO CLIENTE (06/10, lib/cerebro/contexto.ts): o que ele já pediu,
  // recusou e decidiu e que o JEV marcou como valendo para as próximas peças.
  // Lida a cada fatia, como as regras; vazia enquanto nada foi marcado.
  const memoriaDoCliente = await blocoDaMemoriaDoCliente(project.id, "texto");
  const cachedPrefix = buildCachedPrefix(contextDocs, naoCitar, regrasDoProjeto + memoriaDoCliente + estudoDosPerfis + linksDoCliente);

  // As lições da Vera (29/09): o erro de cada agente volta para ele antes de
  // escrever. Lidas uma vez por fatia; falha aqui só tira as lições.
  const licoesDoSquad = await licoesPorAgente(project.id).catch(() => new Map<string, Licao[]>());

  /**
   * O agente desta etapa: a linha do projeto quando existe (o cliente pode ter
   * ajustado a persona no Treinamento), senão a ficha central.
   *
   * A ficha como reserva nasceu em 29/09 com os especialistas por rede: projeto
   * criado antes disso não tem linha do Xavier, do Igor, da Fernanda, do Tiago
   * do TikTok nem do Yan, e sem a reserva a esteira pularia a rede calada.
   */
  function makeAgent(agentId: string): AgentStep | null {
    const a = project!.agents.find((x) => x.agentId === agentId);
    const ficha = fichaDoAgente(agentId);
    if (!a && !ficha) return null;
    // A Vera foi promovida a gerente: a persona antiga de "revisora" gravada
    // nos projetos troca pela da ficha, a não ser que o cliente a tenha mudado.
    const personaAntigaDaVera = agentId === "vera-veredito" && (!a?.persona || a.persona.startsWith("Revisora rigorosa"));
    return {
      agentId,
      name: a?.name ?? ficha!.name,
      role: personaAntigaDaVera ? ficha!.role : a?.role ?? ficha!.role,
      persona: personaAntigaDaVera ? ficha!.persona : a?.persona ?? ficha?.persona ?? "",
      style: `${a?.style ?? ficha?.style ?? ""}${blocoDeLicoes(licoesDoSquad.get(agentId))}`,
    };
  }

  const baseContext = JSON.stringify({
    topic,
    projectName: project.name,
    niche: project.niche ?? "",
    targetAudience: project.targetAudience ?? "",
    voice: project.voice ?? "",
    funnelStage: config.funnelStage,
    campaignMode: config.campaignMode,
    /**
     * O CONTEXTO DO PROJETO NÃO VAI AQUI: ele já está no prefixo cacheado.
     *
     * Medido em 20/09, na primeira campanha com o cache de uma hora: cada
     * chamada ainda mandava 10.500 tokens fora do cache, e 7.000 deles eram
     * os documentos do projeto, que o prefixo já carregava. Eram enviados
     * duas vezes em toda chamada, uma a preço cheio. O ponteiro basta.
     */
    contexto: "(os documentos do projeto estão no início destas instruções, em CONTEXTO DO PROJETO)",
  });

  // ── Step 1: Research (Roberto) ────────────────────────────────────────────
  // Projeto sem squad nao gera nada, e ate 09/09 isso saia como "campanha
  // concluida, 0 posts" em 130 ms, sem aviso. Um projeto criado fora do fluxo
  // normal (script, migracao, importacao) chega aqui sem `ProjectAgent`, e a
  // resposta certa e dizer isso, nao fingir que a semana foi feita.
  if (!project.agents.length) {
    await appendLog(runId, {
      agent: "Sistema",
      message: "Este projeto está sem squad (nenhum agente cadastrado), então nada pôde ser escrito. Refaça o setup do projeto ou fale com o suporte.",
      status: "failed",
    });
    await prisma.pipelineRun.update({ where: { id: runId }, data: { status: "failed", endedAt: new Date() } });
    return;
  }

  const researcher = makeAgent("roberto-radar");
  let researchBrief = "";
  let webSourcesGlobal: Array<{ title: string; url: string }> = [];
  let webSearchDataGlobal = "";

  if (fatia.fase === "dia") {
    // O dia NÃO pesquisa: lê a pesquisa que a ordem 0 guardou na execução.
    // Pesquisar de novo custaria uma busca e um brief por dia, daria uma
    // semana sem fio condutor, e faria a régua de lastro medir cada dia contra
    // uma pesquisa diferente da do dia anterior.
    const guardada = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { pesquisa: true },
    });
    const p = (guardada?.pesquisa ?? null) as PesquisaGuardada | null;
    if (p) {
      researchBrief = p.brief ?? "";
      webSearchDataGlobal = p.bruta ?? "";
      webSourcesGlobal = p.fontes ?? [];
    }
  }

  if (fatia.fase === "pesquisa" && researcher) {
    await appendLog(runId, { agent: "Sistema", message: "Iniciando pesquisa...", status: "running" });
    // 1a. Busca web em tempo real — Grok (xAI) com live X/news/web, fallback Gemini
    let webSearchData = "";
    let webSources: Array<{ title: string; url: string }> = [];
    const geminiKey = process.env.GEMINI_API_KEY;

    try {
      await appendLog(runId, { agent: "Roberto Radar", message: "Buscando dados em tempo real no X e web...", status: "running" });
      const searchResult = await researchTopic(
        topic,
        project.niche ?? "geral",
        project.targetAudience ?? "profissionais",
        geminiKey ?? ""
      );
      // Fonte proibida sai ANTES do brief: se o número entra, o redator o
      // usa e a regra do lastro obriga a citar quem o cliente proibiu.
      const filtrada = removerFontesProibidas(searchResult.sources, searchResult.summary, naoCitar);
      if (filtrada.removidas > 0) {
        await appendLog(runId, { agent: "Roberto Radar", message: `${filtrada.removidas} fonte(s) ou linha(s) da pesquisa descartada(s) por citar ${naoCitar.join(", ")}.`, status: "warning" });
      }
      webSearchData = filtrada.resumo;
      webSources = filtrada.fontes;
      webSourcesGlobal = filtrada.fontes;
      webSearchDataGlobal = filtrada.resumo;
      await appendLog(runId, {
        agent: "Roberto Radar",
        message: `Pesquisa concluída — ${webSources.length} fontes encontradas.`,
        status: "running",
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await appendLog(runId, { agent: "Roberto Radar", message: `Aviso: busca falhou — ${errMsg.slice(0, 300)}`, status: "warning" });
    }

    // 1b. Roberto estrutura os dados reais em um brief — SEM inventar nada
    const sourcesSection = formatSourcesSection(webSources);

    if (!webSearchData) {
      // Sem dados reais, brief mínimo sem alucinar fontes
      researchBrief = `AVISO: Busca em tempo real não retornou dados. Brief baseado apenas no tema: "${topic}".
Nicho: ${project.niche ?? "geral"}. Público: ${project.targetAudience ?? "profissionais"}.
Gere o conteúdo com base no conhecimento do nicho, sem citar fontes ou números que não puder verificar.`;
    } else {
      const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

      researchBrief = await runAgent(
        researcher,
        `Você é o Roberto Radar. Sua função é estruturar e apresentar os dados reais encontrados agora na internet — NÃO inventar nada.

DADOS REAIS COLETADOS AGORA (${today}) via busca live no X, notícias e web:
═══════════════════════════════════════════════════════════
${webSearchData}
═══════════════════════════════════════════════════════════

⚠️ REGRAS ABSOLUTAS:${naoCitar.length ? `\n- NUNCA cite nem use dados de: ${naoCitar.join(", ")} (concorrentes do cliente). O que só existe nessas fontes não entra no brief.` : ""}
- Use APENAS os dados acima. Não adicione fontes, números, pesquisas ou casos que não estejam nos dados acima.
- Se os dados citam posts do X, cite-os. Se citam notícias, cite-as. Se não há dados suficientes sobre um ponto, diga "não encontrado nos dados desta pesquisa".
- NUNCA invente percentuais, estatísticas, relatórios (McKinsey, Gartner, etc.) que não estejam explicitamente nos dados acima.
- Se os dados acima forem ricos em posts do X e notícias do dia, isso é ouro — use tudo.

ESTRUTURA DO BRIEF (organize os dados acima nesta ordem):
1. O QUE ESTÁ ACONTECENDO AGORA: posts do X, notícias do dia, debates de hoje (use os dados acima)
2. NÚMEROS E FATOS REAIS: apenas os dados e estatísticas que aparecem nos resultados acima
3. QUEM ESTÁ FALANDO E O QUE ESTÁ DIZENDO: influenciadores, empresas, pessoas mencionadas nos dados
4. OPORTUNIDADE DE CONTEÚDO: ângulos para o criador de conteúdo explorar ESTE tema AGORA

TAMANHO: no máximo 1.500 palavras no total. Listas curtas, um fato por linha, sem repetir o mesmo dado em duas seções. Este brief é lido por cada redator em cada peça da semana: o que sobra aqui custa em todas elas.

Tema: "${topic}" | Nicho: ${project.niche ?? "geral"} | Público: ${project.targetAudience ?? "profissionais"}
${sourcesSection ? `\nFONTES REAIS ENCONTRADAS (inclua ao final):\n${sourcesSection}` : ""}`,
        baseContext,
        runId,
        funnelInstruction,
        cachedPrefix,
        project.id,
        /**
         * 16.000, e não 6.000. Medido em 20/09: com 6.000 o brief batia no
         * teto EXATO em toda campanha (out=6000 nas quatro últimas), saía
         * cortado no meio de uma frase, e ainda era reenviado em 54 chamadas.
         * O teto inclui o pensamento; o tamanho do texto é pedido no prompt.
         */
        { maxTokens: 16_000 },
      );

      // O brief passa pela regua do lastro contra a pesquisa BRUTA. Uma chance
      // de o Roberto tirar o que inventou; o que sobrar sai na tesoura.
      const lastroDoBrief = `${webSearchData}\n${sourcesSection}\n${topic}`;
      const semLastro = afirmacoesSemLastro(researchBrief, lastroDoBrief);
      if (semLastro.length) {
        /**
         * A TESOURA, E NÃO UMA SEGUNDA CHAMADA.
         *
         * Até 20/09 o brief voltava para o Roberto reescrever inteiro sem as
         * frases sem fonte: uma chamada de Opus de R$ 1,50 a mais em TODA
         * campanha (medido: as quatro últimas passaram por ela), e no fim a
         * tesoura de código rodava de qualquer jeito sobre o que sobrasse.
         * A tesoura sozinha faz o mesmo serviço, de graça e sem esperar.
         */
        researchBrief = removerFrases(researchBrief, semLastro);
        await appendLog(runId, {
          agent: "Roberto Radar",
          message: `${semLastro.length} afirmação(ões) removida(s) do brief por não ter fonte: ${semLastro.map((f) => f.slice(0, 90)).join(" | ")}`,
          status: "warning",
        });
      }
    }

    // Research card is saved inside the day loop (one per day, at the start of each day)
    // so the sequence Roberto → Lucas → Tiago → Diana → Vera → Paulo is visible per day.
  }

  if (fatia.fase === "pesquisa") {
    // A pesquisa acabou aqui, e é tudo o que este trabalho tinha para fazer.
    // Guardar a BRUTA junto com o brief não é luxo: é o que a régua de lastro
    // mede, e foi a falta dela que deixou passar "a Fitch atribuiu perspectiva
    // negativa a 11 financiamentos", número que não existia em fonte nenhuma.
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: {
        pesquisa: {
          brief: researchBrief,
          // Mesmo teto do card do Roberto, para não guardar duas medidas
          // diferentes da mesma coisa.
          bruta: webSearchDataGlobal.slice(0, 20_000),
          fontes: webSourcesGlobal,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await appendLog(runId, {
      agent: "Roberto Radar",
      message: `Pesquisa guardada: ${webSourcesGlobal.length} fonte(s). Os dias começam agora.`,
      status: "running",
    });
    return;
  }

  /**
   * O BRIEF VAI PARA O PREFIXO CACHEADO, e não para a mensagem de cada chamada.
   *
   * Medido em 20/09: cada chamada de agente mandava 21.500 tokens de entrada e
   * só 7.643 (regras + documentos) vinham do cache. O resto era o brief da
   * pesquisa e o contexto, reenviados em 54 chamadas a preço cheio. O brief é
   * o MESMO em todos os dias da campanha (cada dia o relê do banco), então ele
   * é prefixo por definição. Junto com o TTL de uma hora, o cache do Opus sai
   * de 35% para perto de 75%, e o custo de entrada cai a um quinto.
   *
   * `contextWithResearch` fica com um ponteiro no lugar do brief, para o
   * contexto não carregar o texto duas vezes.
   */
  const prefixoDaCampanha = `${cachedPrefix}

=== PESQUISA DA CAMPANHA (Roberto Radar) ===
${researchBrief}
=== FIM DA PESQUISA ===`;
  const contextWithResearch = JSON.stringify({
    ...JSON.parse(baseContext),
    researchBrief: "(a pesquisa completa do Roberto está no início destas instruções, na seção PESQUISA DA CAMPANHA)"
  });

  // ── Steps 2–6: Process each day completely (Lucas → Tiago → Diana → Vera → Paulo) ──────────
  // This way Day 1 is fully ready for review before Day 2 starts.
  const linkedinWriter = makeAgent("lucas-linkedin");
  // O X é do Xavier desde 29/09 (o Tiago foi para o TikTok).
  const twitterWriter = makeAgent("xavier-x");
  const designer = makeAgent("diana-design");
  const reviewer = makeAgent("vera-veredito");

  // As redes desta campanha. Desde 13/09 a janela manda `platforms`; sem ele
  // (post unico ou janela antiga), o par de sempre: LinkedIn e X. YouTube nunca
  // entra aqui, porque campanha por tema nao tem video para subir.
  const redesPedidas: string[] = config.platforms?.length
    ? config.platforms
    : config.campaignMode === "single"
      ? config.singlePlatform === "linkedin"
        ? ["linkedin"]
        : config.singlePlatform === "twitter"
          ? ["twitter"]
          : ["linkedin", "twitter"]
      : ["linkedin", "twitter"];
  const contaDaRede = new Map(project.socialAccounts.map((a) => [a.platform, a]));
  // As contas escolhidas na janela, por rede. Vazio quando a janela e antiga.
  const destinosPorRede = new Map<string, typeof project.socialAccounts>();
  for (const a of project.socialAccounts) {
    if (config.destinos?.includes(a.id)) destinosPorRede.set(a.platform, [...(destinosPorRede.get(a.platform) ?? []), a]);
  }
  // So escreve para rede pedida E conectada: pedir Instagram sem conta
  // conectada geraria um rascunho sem destino, que e o pior estado de um post.
  const redes = redesPedidas.filter((r) => contaDaRede.has(r));
  const shouldWriteLinkedin = redes.includes("linkedin");
  const shouldWriteTwitter = redes.includes("twitter");
  // O TikTok entrou em 28/09 como derivada do LinkedIn, igual ao Instagram,
  // mas só nos dias de VÍDEO (ver o laço das derivadas): ele não publica
  // texto nem imagem.
  const derivadas = redes.filter((r) => r === "instagram" || r === "facebook" || r === "tiktok");

  // SEM REDE, A ESTEIRA PARA AQUI E DIZ POR QUE. Em 14/09 o projeto ficou sem
  // conta nenhuma (o Bruno removeu as tres do LinkedIn), a campanha rodou a
  // pesquisa, pulou os redatores em silencio e terminou "concluida! 0 posts".
  // Recusar calado e o pior estado: a pessoa pagou a espera, nao recebeu nada
  // e nao sabe o que mudar. O filtro acima continua certo (nao escrever para
  // rede sem conta); o que faltava era transformar "nada para escrever" em
  // erro com frase de gente, e nao em sucesso vazio.
  if (redes.length === 0) {
    const nomes: Record<string, string> = { linkedin: "LinkedIn", twitter: "X", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
    const pedidas = redesPedidas.map((r) => nomes[r] ?? r).join(", ");
    await appendLog(runId, {
      agent: "Sistema",
      message: `Nenhuma rede conectada para escrever (pedidas: ${pedidas}). Conecte uma rede em Configurações do projeto e gere de novo.`,
      status: "failed",
    });
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "failed", endedAt: new Date() },
    });
    return;
  }

  interface DayPost {
    day: string;
    platform: string;
    content: string;
    mediaType: ContentType;
    dayOfWeek: number;
    scheduledDate: Date;
    cardId?: string;
    metadata?: Record<string, unknown>;
  }

  const dayPosts: DayPost[] = [];

  // A MEMÓRIA DE NÃO REPETIR, relida do banco.
  //
  // Ela existe para o Lucas e o Tiago não repetirem ângulo, dado, abertura e
  // CTA de um dia para o outro. Enquanto a semana inteira rodava numa função
  // só, essa memória era uma lista em memória que os dias herdavam de graça.
  // Com um dia por trabalho, cada dia roda numa função que nunca viu os
  // outros: sem esta leitura, a quinta-feira escreveria de novo o post da
  // quarta sem saber. Ler do banco é melhor que a lista antiga também porque
  // sobrevive a retentativa.
  const jaEscritos = await prisma.post.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    select: { platform: true, content: true, dayOfWeek: true },
  });
  const writtenPostsLog: string[] = jaEscritos.map((p) => {
    const dia = DAY_NAMES[p.dayOfWeek ?? 0] ?? "Dia";
    const rede = { linkedin: "LinkedIn", twitter: "X", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" }[p.platform] ?? p.platform;
    const limite = p.platform === "twitter" ? 100 : 120;
    return `[${dia} - ${rede}] ${p.content.slice(0, limite).replace(/\n/g, " ")}…`;
  });
  const agentRetries: Record<string, number> = {};
  /**
 * A MIDIA DE CADA DIA.
 *
 * `imagemPorRede` entrou em 19/09 e e o conserto do card 509: ate entao havia
 * uma `imageUrl` so, e ela ia igual para Instagram, Facebook, LinkedIn e X.
 * Cada rede tem formato proprio, entao cada rede tem a arte dela. A `imageUrl`
 * continua existindo como a arte principal, para o card da Diana e para as
 * telas que so sabem mostrar uma.
 */
// O texto do card da Diana quando a arte espera a identidade (05/10) mora em
// lib/modelos-de-arte/espera-da-identidade.ts, junto com os outros caminhos.

const mediaByDayKey: Record<string, {
  imageUrl?: string;
  imagemPorRede?: Record<string, string>;
  conferenciaDaArte?: string;
  videoUrl?: string;
  imagePrompt?: string;
  visualStyle?: string;
  /** A TRAVA DA IDENTIDADE (05/10): o dia ficou sem arte de propósito, sem gastar, até o cliente aprovar modelo, letra e cores. */
  aguardandoIdentidade?: boolean;
}> = {};
  const hasApiKey = !!process.env.GEMINI_API_KEY;
  const liAccount = project.socialAccounts.find((a) => a.platform === "linkedin");
  const twAccount = project.socialAccounts.find((a) => a.platform === "twitter");
  const createdPostIds: string[] = [];

  /** Build Vera's review task string for a given day */
  function buildVeraTask(
    dow: number,
    liC: string | undefined,
    twC: string | undefined,
    mediaSt: string,
    isRetryRound: boolean,
    /**
     * As adaptações do dia (Facebook, Instagram). Elas entraram na revisão em
     * 18/09: até então a Vera só via LinkedIn e X, e foi por isso que passou
     * um post de Facebook abrindo com "O LinkedIn não penaliza".
     */
    derivadasDoDia: Array<{ platform: string; content: string }> = []
  ): string {
    // O que da para medir, mede-se ANTES de pedir opiniao. Em 09/09 a Vera
    // aprovou threads com tweets de 317 a 606 caracteres e com "Segue a thread
    // corrigida" como primeiro tweet: ela nao tinha o limite no checklist e nao
    // conta caractere. O numero vai pronto para ela, e a regra de reprovar
    // fica escrita.
    const violacoesMedidas: string[] = [];
    if (twC) {
      violacoesMedidas.push(...validateTwitterThread(twC).violations);
      if (/^\s*(segue|aqui est[aá]|abaixo|a thread foi)/i.test(twC)) {
        violacoesMedidas.push("A thread do X começa com texto de bastidor, e não com o tweet 1/");
      }
    }
    if (liC && liC.length > PLATFORM_LIMITS.linkedin.post) {
      violacoesMedidas.push(`Post do LinkedIn tem ${liC.length} chars (limite: ${PLATFORM_LIMITS.linkedin.post})`);
    }
    // Nome proibido pelo cliente (concorrente): reprova sozinha.
    for (const [rotulo, texto] of [["LinkedIn", liC], ["X", twC], ...derivadasDoDia.map((d) => [NOME_DA_REDE[d.platform] ?? d.platform, d.content] as const)] as Array<[string, string | undefined]>) {
      for (const f of texto ? mencoesProibidas(texto, naoCitar) : []) {
        violacoesMedidas.push(`${rotulo} cita um nome que o cliente PROIBIU (${naoCitar.join(", ")}): "${f.slice(0, 140)}". Remova a menção; se o dado só se sustenta por essa fonte, remova o dado.`);
      }
    }
    // Promessa de mídia que não existe: reprova sozinha, e a correção é
    // REESCREVER a frase, nunca "confirmar o vídeo" (não há o que confirmar).
    for (const [rotulo, texto] of [["LinkedIn", liC], ["X", twC], ...derivadasDoDia.map((d) => [NOME_DA_REDE[d.platform] ?? d.platform, d.content] as const)] as Array<[string, string | undefined]>) {
      for (const f of texto ? promessasDeMidia(texto) : []) {
        violacoesMedidas.push(`${rotulo} promete mídia que não existe: "${f.slice(0, 140)}". A peça tem, no máximo, um clipe curto por IA que sai junto do post. Reescreva a frase sem a promessa.`);
      }
    }
    // LASTRO: frase com numero que nao esta na pesquisa bruta nem nas fontes.
    // Contra a pesquisa BRUTA, e nao contra o brief: o brief e escrito pelo
    // mesmo tipo de modelo que escreve o post, e "bate com o brief" e conferir a
    // copia contra a copia (foi assim que o "11 financiamentos" passou).
    const lastroDaVera = `${webSearchDataGlobal}\n${webSourcesGlobal.map((f) => `${f.title} ${f.url}`).join("\n")}\n${topic}`;
    const semLastroVera = [
      ...(liC ? afirmacoesSemLastro(liC, lastroDaVera).map((f) => `LinkedIn: ${f}`) : []),
      ...(twC ? afirmacoesSemLastro(twC, lastroDaVera).map((f) => `X: ${f}`) : []),
    ];
    // REDE ERRADA: frases da adaptação que falam de outra rede. Medido, não
    // julgado: "16 mil criadores do LinkedIn" é um fato legítimo dentro de um
    // post de Instagram, e "seu post no LinkedIn" não é. A diferença é de
    // sentido, e sentido é trabalho da Vera.
    const redeErrada = derivadasDoDia.flatMap((d) =>
      mencoesDeOutraRede(d.content, d.platform).map(
        (m) => `${NOME_DA_REDE[d.platform] ?? d.platform}: "${m.frase}" (cita ${NOME_DA_REDE[m.rede] ?? m.rede})`
      )
    );

    const blocoDerivadas = derivadasDoDia.length
      ? derivadasDoDia.map((d) => `\n${NOME_DA_REDE[d.platform] ?? d.platform}: ${d.content}`).join("")
      : "\n(nenhuma adaptação para outras redes neste dia)";

    return `${isRetryRound ? "⟳ SEGUNDA REVISÃO (após correção solicitada)\n\n" : ""}Faça uma revisão de qualidade COMPLETA e CRÍTICA do conteúdo para ${DAY_NAMES[dow]}.

CONTEÚDO PARA REVISAR:
LinkedIn: ${liC ?? "Não gerado"}

X (Twitter): ${twC ?? "Não gerado"}

ADAPTAÇÕES PARA OUTRAS REDES (o mesmo tema, reescrito por rede):${blocoDerivadas}

STATUS DA MÍDIA (Diana Design): ${mediaSt}

CRITÉRIOS DE ACEITE OBRIGATÓRIOS — reprove se qualquer um falhar:
1. TOM DE VOZ: está alinhado ao projeto? Tom profissional e adequado ao nicho?
2. QUALIDADE DO TEXTO: coesão, coerência, ortografia correta, sem frases quebradas
3. DADOS REAIS: NENHUM dado inventado — se houver estatística sem fonte mencionável, é reprovação imediata
4. ADERÊNCIA AO FUNIL: segue a diretriz "${funnelInstruction}"?
5. MÍDIA OBRIGATÓRIA: se o tipo de conteúdo requer imagem/vídeo e o STATUS DA MÍDIA for "FALHOU", REPROVE — não aceite post sem mídia quando ela foi solicitada
6. COMPLETUDE: o post está finalizado e pronto para publicação sem edições manuais?
7. LIMITES DA REDE, medidos por código antes desta revisão (não são opinião):
${violacoesMedidas.length ? violacoesMedidas.map((v) => `   • ${v}`).join("\n") : "   • nenhuma violação medida"}
   Se houver qualquer violação acima, o veredito é REPROVADO_TEXTO: tweet acima de ${PLATFORM_LIMITS.twitter.tweet} caracteres sai TRUNCADO no X, e texto de bastidor ("segue a thread corrigida", "aqui está") vai ao ar como primeiro tweet.
8. LASTRO DOS NÚMEROS, medido por código contra a PESQUISA BRUTA (não contra o brief):
${semLastroVera.length ? semLastroVera.map((f) => `   • ${f.slice(0, 220)}`).join("\n") : "   • todos os números do texto aparecem na pesquisa"}
   Se houver qualquer frase acima, o veredito é REPROVADO_TEXTO e a correção é REMOVER a frase, nunca trocar o número por outro. A plataforma não publica número que não tem fonte, em hipótese nenhuma.
9. REDE CERTA NA ADAPTAÇÃO, medido por código (a decisão é sua):
${redeErrada.length ? redeErrada.map((f) => `   • ${f.slice(0, 260)}`).join("\n") : "   • nenhuma adaptação cita outra rede"}
   Julgue cada frase acima por SENTIDO, não por palavra. Um FATO da pesquisa que menciona uma rede continua verdadeiro em qualquer rede ("a pesquisa ouviu 16 mil criadores do LinkedIn") e não é motivo de reprovação. Já uma frase que trata a outra rede como o lugar onde o leitor está ("seu post no LinkedIn está competindo", "o algoritmo do LinkedIn mudou") está errada numa legenda de Instagram ou num post de Facebook: ali o veredito é REPROVADO_TEXTO e a correção é reescrever a frase para a rede da peça.

O QUE REPROVA E O QUE É RESSALVA (regra de 21/09, e ela custa dinheiro):
REPROVADO só quando há algo que NÃO PODE ir ao ar: violação medida acima (itens 7, 8 e 9), dado inventado ou sem fonte, promessa de mídia que não existe, nome proibido pelo cliente, texto quebrado ou inacabado, mídia obrigatória faltando. Tom, ritmo, escolha de palavra, gancho fraco, CTA que podia ser melhor, frase que você escreveria diferente: isso é APROVADO_COM_RESSALVAS, com a sugestão na lista. Cada reprovação são duas reescritas pagas; reprove o que é erro, não o que é gosto.

FORMATO DO VEREDITO (escreva exatamente uma das opções abaixo na última linha):
VEREDITO: APROVADO
VEREDITO: APROVADO_COM_RESSALVAS
VEREDITO: REPROVADO_TEXTO (se o problema é no conteúdo escrito — Lucas deve reescrever)
VEREDITO: REPROVADO_MIDIA (se o problema é na imagem/vídeo ausente ou incorreta — Diana deve regenerar)
VEREDITO: REPROVADO_AMBOS (se há problemas em texto E mídia)

FORMATO DA RESPOSTA (obrigatório, e curto de propósito):
Sem cabeçalho, sem resumo do tema, sem elogio, sem "o que está bom". Comece com a linha "O QUE PRECISA MUDAR" e liste um problema por item numerado: a rede, a frase exata entre aspas e a correção em uma linha. No máximo 12 itens. Se não houver nada a mudar, escreva só "Sem problemas." e o veredito. A resposta inteira cabe em 1.500 tokens; o redator só usa a lista, e cada palavra a mais aqui é paga e ignorada.`;
  }

  /**
   * A primeira queixa da Vera, em uma linha, para o log e para o balão do
   * escritório. O veredito dela vem com a lista de problemas antes da linha
   * "VEREDITO:", e a primeira linha que parece um problema é a que resume.
   */
  function primeiraQueixa(saida: string): string {
    const linha = saida
      .split("\n")
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
      .find((l) => l.length > 25 && !/^veredito/i.test(l) && !/^(revis|an[aá]lise|conte[uú]do)/i.test(l));
    if (!linha) return "o texto precisa de correção.";
    return linha.length > 150 ? `${linha.slice(0, 150)}…` : linha;
  }

  /** Parse Vera's structured verdict */
  function parseVeraVerdict(output: string): {
    verdict: "APROVADO" | "APROVADO_COM_RESSALVAS" | "REPROVADO_TEXTO" | "REPROVADO_MIDIA" | "REPROVADO_AMBOS";
    needsTextRetry: boolean;
    needsMediaRetry: boolean;
    approved: boolean;
  } {
    const lower = output.toLowerCase();
    const match = output.match(/VEREDITO:\s*(APROVADO_COM_RESSALVAS|APROVADO|REPROVADO_TEXTO|REPROVADO_MIDIA|REPROVADO_AMBOS)/i);
    if (match) {
      const v = match[1].toUpperCase() as ReturnType<typeof parseVeraVerdict>["verdict"];
      return {
        verdict: v,
        needsTextRetry: v === "REPROVADO_TEXTO" || v === "REPROVADO_AMBOS",
        needsMediaRetry: v === "REPROVADO_MIDIA" || v === "REPROVADO_AMBOS",
        approved: v === "APROVADO" || v === "APROVADO_COM_RESSALVAS",
      };
    }
    const isReprovado = lower.includes("reprovado");
    const mediaFailed = lower.includes("mídia") || lower.includes("imagem") || lower.includes("diana");
    const textFailed = lower.includes("texto") || lower.includes("lucas") || lower.includes("reescrever");
    return {
      verdict: isReprovado ? (mediaFailed && textFailed ? "REPROVADO_AMBOS" : mediaFailed ? "REPROVADO_MIDIA" : "REPROVADO_TEXTO") : "APROVADO",
      needsTextRetry: isReprovado && (textFailed || (!mediaFailed)),
      needsMediaRetry: isReprovado && mediaFailed,
      approved: !isReprovado,
    };
  }

  const robertoCardSavedForDays = new Set<string>();

  for (const { dayOfWeek, contentType, weekOffset } of daysList) {
   // O DIA E A UNIDADE DE FALHA, e nao a campanha.
   //
   // Em 09/09 a Vera falhou na terca e levou junto quarta, quinta, sexta,
   // sabado e domingo: o erro subiu ate o `catch` de fora, que marca a
   // execucao inteira como falha. O cliente pediu seis dias, pagou a espera de
   // seis, e recebeu um. Entregar cinco de seis e ruim; entregar um de seis
   // porque o sexto tropecou e outra coisa.
   try {
    // ── Cancellation check ────────────────────────────────────────────────────
    const runCheck = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (runCheck?.status === "cancelled") {
      await appendLog(runId, { agent: "Sistema", message: "Geração cancelada pelo usuário.", status: "error" });
      return;
    }

    const dayName = nomeDoDia(config.weekStart, dayOfWeek, weekOffset);
    const scheduledDate = getScheduledAt(dayOfWeek, weekOffset);
    const dayKey = `${dayOfWeek}-${weekOffset}`;
    // Use per-day topic if provided (from modal).
    // If not, add a day-specific angle so each day's content has a distinct focus
    // even when the global topic is the same — prevents Twitter threads from repeating.
    const DAY_ANGLES: Record<number, string> = {
      1: "(ângulo: o PROBLEMA — dores e desafios que o público enfrenta)",
      2: "(ângulo: a SOLUÇÃO — estratégias práticas e como superar os obstáculos)",
      3: "(ângulo: DADOS e evidências — pesquisas e tendências reais)",
      4: "(ângulo: CASOS REAIS — exemplos concretos e situações que o público reconhece)",
      5: "(ângulo: FUTURO — oportunidades, riscos e próximos passos para agir agora)",
      6: "(ângulo: MITOS — derrube uma crença comum ou questione o senso comum)",
      7: "(ângulo: IMPACTO HUMANO — o lado humano, efeitos nas pessoas e nas equipes)",
    };
    const dayTopic = config.topicsPerDay?.[String(dayOfWeek)]?.trim()
      || `${topic} ${DAY_ANGLES[dayOfWeek] ?? ""}`;
    let dianaCardId: string | undefined;
    /**
     * A Diana refaz a arte do dia com o motivo da Vera (29/09). Só existe no
     * caminho da imagem de feed, que é o único em que refazer é uma chamada
     * de arte e não um trabalho inteiro (carrossel, vídeo e infográfico têm
     * esteira própria). Sem ela, reprovação de mídia sem conserto vai ao
     * cliente com o motivo, depois do laço.
     */
    let refazerArteDoDia: ((motivo: string) => Promise<boolean>) | null = null;

    // ── Step 1 (per day): Save Roberto's research card at the START of each day ──
    // This preserves the sequence Roberto → Lucas → Tiago → Diana → Vera → Paulo per day.
    if (researchBrief && researcher && !robertoCardSavedForDays.has(dayKey)) {
      robertoCardSavedForDays.add(dayKey);
      await saveCard({
        runId,
        projectId: project.id,
        agentId: "roberto-radar",
        agentName: researcher.name,
        dayOfWeek,
        scheduledDate,
        cardType: "research",
        content: researchBrief,
        // PROVENIENCIA. Em 09/09 um post saiu com "a Fitch atribuiu perspectiva
        // negativa a 11 financiamentos", numero que nao existe em fonte nenhuma:
        // a Fitch publicou "mais de 30% do portfolio", e o modelo inventou o 11
        // ao estruturar. Sem a pesquisa bruta guardada nao havia como saber onde
        // a distorcao entrou. O card do Roberto leva o que a busca devolveu e as
        // fontes, para auditar.
        metadata: { pesquisaBruta: webSearchDataGlobal.slice(0, 20_000), fontes: webSourcesGlobal },
      });
    }

    const resolvedType: ContentType =
      contentType === "free"
        ? (["text", "image", "poll", "image", "article"][((dayOfWeek - 1) % 5)] as ContentType)
        : contentType;

    /**
     * DE QUEM FOI A ESCOLHA DESTE DIA, dito no log da execução.
     *
     * A esteira obedece `weeklySchedule` venha ele de onde vier, e continua
     * assim. O que mudou em 19/09 é que ela agora DIZ de quem era a ordem. Sem
     * esta linha, o cliente que reclama "eu não escolhi texto" e o sistema que
     * escolheu texto por ele contam a mesma história, e foi preciso um script e
     * meia sessão para separar as duas em 18/09.
     */
    if (config.diasEscolhidosPeloCliente) {
      const doCliente = config.diasEscolhidosPeloCliente.includes(String(dayOfWeek));
      await appendLog(runId, {
        agent: "Sistema",
        message: doCliente
          ? `${dayName}: ${resolvedType}, escolha sua.`
          : `${dayName}: ${resolvedType}, sugestão nossa (você não mexeu neste dia).`,
        status: "running",
      });
    }

    // Build uniqueness guard ONCE per day — shared by LinkedIn and Twitter prompts
    const uniquenessBlock = writtenPostsLog.length > 0
      ? `\n\n⛔ POSTS JÁ ESCRITOS NESTA CAMPANHA (NUNCA repita o mesmo ângulo, dado, frase de abertura, conclusão ou CTA):\n${writtenPostsLog.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

    // ── Lucas (LinkedIn) + Tiago (Twitter) em paralelo ───────────────────────
    // Os dois redatores são independentes — usam o mesmo brief de pesquisa e o
    // mesmo snapshot do uniquenessBlock. Rodar em paralelo poupa ~20-30s por dia.
    const [liResult, twResult] = await Promise.allSettled([
      // ── Lucas — LinkedIn ──────────────────────────────────────────────────
      (async () => {
        // A BASE DAS DERIVADAS (08/10): Instagram, Facebook e TikTok são adaptados do texto do Lucas. Campanha
        // só de Instagram (sem LinkedIn) não escrevia base nenhuma, e o laço das derivadas parava no primeiro
        // passo: 5 dias falhados em 0,1 s cada, "nenhum redator entregou" (campanha do Igor, 07/10). Agora o
        // Lucas escreve a base mesmo sem LinkedIn na campanha; ela só não vira card nem post do LinkedIn.
        const soBase = !shouldWriteLinkedin && derivadas.length > 0;
        if ((!shouldWriteLinkedin && !soBase) || !linkedinWriter) return null;
        let linkedinContent: string;
        let linkedinMetadata: Record<string, unknown> | undefined;

        if (resolvedType === "poll") {
          linkedinContent = await runAgent(
            linkedinWriter,
            `Crie uma ENQUETE (poll) para LinkedIn para ${dayName} sobre: "${dayTopic}".
${linkedinRules("poll")}

Formato OBRIGATÓRIO (siga exatamente, sem acrescentar campos extras):
TEXTO_INTRO: [1-2 frases instigantes, máx 200 chars]
PERGUNTA: [pergunta clara e direta, máx ${PLATFORM_LIMITS.linkedin.pollQuestion} chars]
OPCAO_1: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_2: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_3: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
OPCAO_4: [opção, máx ${PLATFORM_LIMITS.linkedin.pollOption} chars]
DURACAO: THREE_DAYS

Use os dados da pesquisa. Não invente estatísticas.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );
          linkedinMetadata = parsePollContent(linkedinContent);

        } else if (resolvedType === "article") {
          linkedinContent = await runAgent(
            linkedinWriter,
            `Escreva um ARTIGO COMPLETO para LinkedIn para ${dayName} sobre: "${dayTopic}".
Tom de voz: ${project.voice || "especialista e reflexivo"}.
Estrutura sugerida no CORPO: abertura forte → desenvolvimento com dados reais e fontes → conclusão com CTA.
${linkedinRules("article")}
Use os dados da pesquisa. Não invente fatos.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
            { maxTokens: 8192 },
          );
          const parsedArt = parseLinkedInArticleContent(linkedinContent);
          linkedinMetadata = {
            type: "linkedin_article",
            articleTitle: parsedArt.title,
            articleTeaser: parsedArt.teaser,
          };

        } else {
          const formatHint = resolvedType === "text"
            ? "apenas texto"
            : resolvedType === "image" || resolvedType === "carousel" || resolvedType === "infographic"
            ? "acompanha imagem/infográfico — o texto deve ser auto-suficiente sem ver a imagem"
            : resolvedType === "video"
            ? /**
               * O REDATOR PRECISA SABER O QUE É O VÍDEO, senão inventa um.
               *
               * Achado em 21/09 na campanha da Areticon: a dica era "acompanha
               * vídeo, chame para assistir", e o Lucas escreveu "Gravei uma
               * leitura de 3 minutos" e "O vídeo está nos comentários". O vídeo
               * do dia é um clipe de 8 segundos por IA, sem fala, gerado
               * DEPOIS do dia. Ninguém tinha contado isso a ele.
               */
              (geracoesDoVideo(normalizarDuracao(config.videoDuration)) > 1
                ? `acompanha um VÍDEO de cerca de ${segundosEntregues(normalizarDuracao(config.videoDuration))} segundos gerado por IA (${config.videoAudio ? "com narração contínua em português" : "sem fala, só imagem"}), ANEXADO ao post. O texto se sustenta sozinho. NÃO diga "gravei", NÃO cite duração, NÃO prometa "vídeo completo", "assista ao vídeo" nem "vídeo nos comentários": o vídeo vai junto do post, e nada além dele existe`
                : `acompanha um CLIPE de ${normalizarDuracao(config.videoDuration)} segundos gerado por IA (${config.videoAudio ? "com narração curta" : "sem fala, só imagem"}), publicado JUNTO com o post como vídeo curto de apoio. O texto se sustenta sozinho. NÃO diga "gravei", NÃO cite duração, NÃO prometa "vídeo completo", "assista ao vídeo" nem "vídeo nos comentários": nada disso existe`)
            : "conteúdo rico";

          linkedinContent = await runAgent(
            linkedinWriter,
            `Escreva um post de LinkedIn para ${dayName} sobre: "${dayTopic}".
Tom de voz: ${project.voice || "provocativo e direto, usa dados"}.
Formato: ${formatHint}.
${linkedinRules("post")}
Aborde um ÂNGULO DIFERENTE dos posts anteriores — perspectiva nova, dado diferente, CTA distinto.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );
        }

        // ── LinkedIn character limit enforcement ────────────────────────────
        // Bastidor fora ANTES de qualquer conta de tamanho: o rotulo
        // "LINKEDIN" sozinho no topo, visto na prova de 10/09, nasce aqui e
        // nao na correcao da Vera. Contar caractere de bastidor tambem
        // falsearia a conta do limite.
        {
          const limpo = limparBastidorDoTexto(linkedinContent);
          if (limpo.removidos) {
            linkedinContent = limpo.content;
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `${limpo.removidos} bloco(s) de bastidor removido(s) do rascunho de ${dayName}.`,
              status: "warning",
            });
          }
        }

        const LI_LIMIT = 3000;
        if (linkedinContent.length > LI_LIMIT && resolvedType !== "poll" && resolvedType !== "article") {
          await appendLog(runId, {
            agent: "Lucas LinkedIn",
            message: `Post gerado com ${linkedinContent.length} chars (limite: ${LI_LIMIT}). Solicitando reescrita...`,
            status: "warning",
          });
          const overLimitType = "post" as const;
          const rewritten = await runAgent(
            linkedinWriter,
            `O post abaixo ultrapassou o limite de ${LI_LIMIT} caracteres do LinkedIn (gerado com ${linkedinContent.length} chars).
Reescreva-o mantendo as ideias principais, mas OBRIGATORIAMENTE dentro de ${LI_LIMIT} caracteres. Não corte abruptamente — conclua com CTA.
${linkedinRules(overLimitType)}

POST ORIGINAL:
${linkedinContent}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );
          if (rewritten.length <= LI_LIMIT) {
            // A reescrita por tamanho tem a mesma doenca da reescrita da Vera.
            linkedinContent = limparBastidorDoTexto(rewritten).content;
            await appendLog(runId, { agent: "Lucas LinkedIn", message: `Reescrito com ${linkedinContent.length} chars ✓`, status: "running" });
          } else {
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `⚠ Segunda tentativa ainda acima do limite (${rewritten.length} chars). Usando versão original — publicação pode falhar.`,
              status: "warning",
            });
          }
        }

        // Primeiro comentário com fontes da pesquisa
        if (resolvedType !== "article" && resolvedType !== "poll") {
          let firstComment = extractFirstComment(researchBrief);
          if (!firstComment && webSourcesGlobal.length > 0) {
            const lines = webSourcesGlobal
              .slice(0, 5)
              .map((s) => `- ${s.title}: ${s.url}`)
              .join("\n");
            firstComment = `📚 Fontes e referências:\n\n${lines}`;
          }
          if (firstComment) {
            linkedinMetadata = { ...(linkedinMetadata ?? {}), firstComment };
          }
        }

        if (soBase) return { content: linkedinContent, metadata: linkedinMetadata, card: null, soBase: true as const };
        const card = await saveCard({
          runId,
          projectId: project.id,
          agentId: "lucas-linkedin",
          agentName: linkedinWriter.name,
          dayOfWeek,
          scheduledDate,
          cardType: "post_linkedin",
          mediaType: resolvedType,
          content: linkedinContent,
          ...(linkedinMetadata ? { metadata: linkedinMetadata } : {}),
        });

        return { content: linkedinContent, metadata: linkedinMetadata, card, soBase: false as const };
      })(),

      // ── Tiago — Twitter ───────────────────────────────────────────────────
      (async () => {
        if (!shouldWriteTwitter || !twitterWriter) return null;
        let twitterContent: string;
        let twitterMetadata: Record<string, unknown> | undefined;

        if (resolvedType === "poll") {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma ENQUETE para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("poll")}

Formato OBRIGATÓRIO (siga exatamente):
TWEET: [texto apresentando a enquete, máx ${PLATFORM_LIMITS.twitter.tweet} chars]
OPCAO_1: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
OPCAO_2: [máx ${PLATFORM_LIMITS.twitter.pollOption} chars]
DURACAO_HORAS: 1440

Seja direto e provocativo.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva sem números.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );
          twitterMetadata = parseTwitterPollContent(twitterContent);

        } else if (resolvedType === "thread") {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma THREAD para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("thread")}
6-8 tweets no total. Numere como 1/ 2/ 3/ etc.
→ Tweet 1: abertura impactante que gere curiosidade imediata
→ Tweets 2-N: desenvolvimento com dados e argumentos
→ Último tweet: CTA claro + hashtags (máx 2)
Aborde um ângulo diferente dos posts anteriores.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );

        } else {
          twitterContent = await runAgent(
            twitterWriter,
            `Crie uma thread para X (Twitter) para ${dayName} sobre: "${dayTopic}".
${twitterRules("thread")}
5-7 tweets no total. Numere como 1/ 2/ etc.
→ Tweet 1: abertura impactante
→ Tweets intermediários: conteúdo de valor
→ Último tweet: CTA claro
Aborde um ângulo diferente dos posts anteriores.
⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos presentes no brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.${uniquenessBlock}`,
            contextWithResearch,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          );
        }

        // ── Twitter thread validation ───────────────────────────────────────
        if (resolvedType === "thread" || resolvedType !== "poll") {
          const { violations } = validateTwitterThread(twitterContent);
          if (violations.length > 0) {
            await appendLog(runId, {
              agent: "Xavier X",
              message: `Thread com tweets acima do limite: ${violations.join("; ")}. Solicitando correção...`,
              status: "warning",
            });
            const fixed = await runAgent(
              twitterWriter,
              `A thread abaixo tem tweets que ultrapassam o limite de ${PLATFORM_LIMITS.twitter.tweet} chars do X/Twitter.
Problemas encontrados: ${violations.join("; ")}.

Reescreva APENAS os tweets problemáticos, mantendo o conteúdo e a numeração dos demais.
CADA tweet deve ter NO MÁXIMO ${PLATFORM_LIMITS.twitter.tweet} chars — conte os chars antes de finalizar.

THREAD ORIGINAL:
${twitterContent}`,
              contextWithResearch,
              runId,
              funnelInstruction,
              prefixoDaCampanha,
              project.id,
            );
            const { violations: remaining } = validateTwitterThread(fixed);
            if (remaining.length === 0) {
              twitterContent = fixed;
              await appendLog(runId, { agent: "Xavier X", message: "Thread corrigida ✓", status: "running" });
            } else {
              await appendLog(runId, {
                agent: "Xavier X",
                message: `⚠ Thread ainda com problemas após correção (${remaining.join("; ")}). Publicador aplicará limite por tweet.`,
                status: "warning",
              });
            }
          }
        }

        const card = await saveCard({
          runId,
          projectId: project.id,
          agentId: "xavier-x",
          agentName: twitterWriter.name,
          dayOfWeek,
          scheduledDate,
          cardType: "post_twitter",
          mediaType: resolvedType === "thread" || resolvedType === "free" ? "thread" : resolvedType,
          content: twitterContent,
          ...(twitterMetadata ? { metadata: twitterMetadata } : {}),
        });

        return { content: twitterContent, metadata: twitterMetadata, card };
      })(),
    ]);

    /**
     * SEM SALDO NÃO É "ERRO AO GERAR POST", É A PLATAFORMA PARADA.
     *
     * Em 19/09 a conta da Anthropic zerou e os dois redatores caíram aqui como
     * aviso; o dia seguiu vazio, se marcou concluído, e a campanha fechou com
     * zero posts. O erro de saldo sobe inteiro para a fila, que sabe pausar.
     */
    for (const r of [liResult, twResult]) {
      if (r.status === "rejected" && (ehErroDeSaldo(r.reason) || ehSemSaldoDaOpenAI(r.reason))) throw r.reason;
    }

    // Collect results into dayPosts and uniqueness log
    if (liResult.status === "fulfilled" && liResult.value && !liResult.value.soBase && liResult.value.card) {
      const { content, metadata, card } = liResult.value;
      dayPosts.push({ day: dayName, platform: "linkedin", content, mediaType: resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata });
      writtenPostsLog.push(`[${dayName} - LinkedIn] ${content.slice(0, 120).replace(/\n/g, " ")}…`);
    } else if (liResult.status === "rejected") {
      await appendLog(runId, { agent: "Lucas LinkedIn", message: `Erro ao gerar post: ${liResult.reason instanceof Error ? liResult.reason.message : String(liResult.reason)}`, status: "warning" });
    }
    if (twResult.status === "fulfilled" && twResult.value) {
      const { content, metadata, card } = twResult.value;
      dayPosts.push({ day: dayName, platform: "twitter", content, mediaType: resolvedType === "thread" ? "thread" as ContentType : resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata });
      writtenPostsLog.push(`[${dayName} - X] ${content.slice(0, 100).replace(/\n/g, " ")}…`);
    } else if (twResult.status === "rejected") {
      await appendLog(runId, { agent: "Xavier X", message: `Erro ao gerar post: ${twResult.reason instanceof Error ? twResult.reason.message : String(twResult.reason)}`, status: "warning" });
    }

    // ── Instagram e Facebook, derivados do post do LinkedIn ──────────────
    //
    // O mesmo Lucas adapta o texto ja escrito, em vez de escrever do zero:
    // metade do custo, e a tese do dia continua a mesma nas redes, que e o que
    // a pessoa espera de uma campanha. Instagram so nos dias com peca visual
    // (imagem, carrossel, infografico), porque o Instagram nao publica texto
    // solto. Enquete e thread ficam onde nasceram, LinkedIn e X.
    const postDoLinkedIn = liResult.status === "fulfilled" ? liResult.value : null;
    for (const redeDerivada of derivadas) {
      if (!postDoLinkedIn || !linkedinWriter) break;
      // O ESPECIALISTA DA REDE adapta (29/09): Igor no Instagram, Fernanda no
      // Facebook, Tiago no TikTok. Até aqui era o próprio Lucas, que escrevia
      // bem para o LinkedIn e adaptava para as outras com o jeito do LinkedIn.
      const especialista = makeAgent(ESPECIALISTA_DA_REDE[redeDerivada]) ?? linkedinWriter;
      /**
       * O VÍDEO ENTROU NA LISTA DO INSTAGRAM em 19/09.
       *
       * Ele ficava de fora porque o dia de vídeo entrega primeiro o QUADRO e
       * o vídeo chega depois pela fila, e um post de Instagram com um JPEG no
       * lugar do vídeo era exatamente o tipo de peça que não podia sair. O
       * Bruno conectou a página da Demandou no Instagram e viu o dia de vídeo
       * não chegar lá, sem explicação nenhuma na tela.
       *
       * Agora a proteção mora no publicador (lib/publish/oauth-post.ts): post
       * de vídeo sem vídeo não publica em rede nenhuma. Com isso o Instagram
       * pode receber o dia; a peça fica esperando o mp4 como as outras redes.
       */
      const visual = ["image", "carousel", "infographic", "video"].includes(resolvedType);
      if (redeDerivada === "instagram" && !visual) continue;
      // TikTok é vídeo e nada mais: dia de imagem ou texto não gera peça lá.
      if (redeDerivada === "tiktok" && resolvedType !== "video") continue;
      if (["poll", "thread"].includes(resolvedType)) continue;
      const nomeDaRede =
        redeDerivada === "instagram" ? "Instagram" : redeDerivada === "tiktok" ? "TikTok" : "Facebook";
      // As frases do post original que citam OUTRA rede, medidas por código.
      // Elas vão nomeadas para o prompt porque "adapte para o Facebook" não
      // basta: em 18/09 o Facebook e o Instagram saíram abrindo com "O
      // LinkedIn não penaliza inteligência artificial", que é a primeira
      // frase do post do LinkedIn, copiada inteira.
      const mencoesNoOriginal = mencoesDeOutraRede(postDoLinkedIn.content, redeDerivada);
      const avisoDeRede = mencoesNoOriginal.length
        ? `\nATENCAO, a rede muda o texto. Estas frases do post original falam de outra rede e voce esta escrevendo para o ${nomeDaRede}:
${mencoesNoOriginal.map((m) => `   • ${m.frase}`).join("\n")}
   Reescreva cada uma para o ${nomeDaRede}. Quando a rede citada for so o cenario da frase ("seu post no LinkedIn", "o algoritmo do LinkedIn"), troque pelo ${nomeDaRede} ou por uma forma neutra ("o feed", "as redes"). Quando ela fizer parte de um FATO da pesquisa ("16 mil criadores usam o LinkedIn"), mantenha: o fato nao muda de rede.\n`
        : "";
      try {
        const bruto = await runAgent(
          especialista,
          `Adapte o post abaixo para o ${nomeDaRede}, mantendo a tese, os dados e as fontes exatamente como estao.
${redeDerivada === "instagram"
  ? "- Legenda de Instagram: primeira linha e o gancho, paragrafos curtos, ate 1.500 caracteres, no maximo 5 hashtags no fim."
  : redeDerivada === "tiktok"
    ? "- Legenda de TikTok para um video vertical: a primeira linha e o gancho e precisa funcionar sozinha, texto curto (ate 600 caracteres), de 3 a 5 hashtags no fim."
    : "- Post de Facebook: tom de conversa, paragrafos curtos, ate 1.200 caracteres, sem hashtags."}
- Nao acrescente fatos, numeros nem fontes que nao estejam no post original.
- Devolva SO o texto adaptado.
${avisoDeRede}
POST ORIGINAL:
${postDoLinkedIn.content}`,
          contextWithResearch,
          runId,
          funnelInstruction,
          prefixoDaCampanha,
          project.id,
        );
        const conteudo = limparBastidorDoTexto(bruto).content;
        const card = await saveCard({
          runId,
          projectId: project.id,
          agentId: especialista.agentId,
          agentName: especialista.name,
          dayOfWeek,
          scheduledDate,
          cardType: "post_linkedin",
          mediaType: resolvedType,
          content: conteudo,
          metadata: { ...(postDoLinkedIn.metadata ?? {}), rede: redeDerivada },
        });
        dayPosts.push({ day: dayName, platform: redeDerivada, content: conteudo, mediaType: resolvedType, dayOfWeek, scheduledDate, cardId: card.id, metadata: { ...(postDoLinkedIn.metadata ?? {}), rede: redeDerivada } });
        // Medido DEPOIS da adaptação: o que sobrou vai para a Vera decidir.
        const sobrou = mencoesDeOutraRede(conteudo, redeDerivada);
        await appendLog(runId, {
          agent: especialista.name,
          message: sobrou.length
            ? `${nomeDaRede} de ${dayName} adaptado, e ainda cita outra rede em ${sobrou.length} frase(s). A Vera decide.`
            : `${nomeDaRede} de ${dayName} adaptado do post do LinkedIn.`,
          status: "running",
        });
      } catch (err) {
        await appendLog(runId, { agent: especialista.name, message: `Erro ao adaptar para ${nomeDaRede}: ${err instanceof Error ? err.message : String(err)}`, status: "warning" });
      }
    }

    // Look up what was just generated for this day (used by Diana, Vera, Paulo below)
    const liPost = dayPosts.find((p) => p.platform === "linkedin" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());
    const twPost = dayPosts.find((p) => p.platform === "twitter" && p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString());

    /**
     * AS REDES QUE ESTE DIA VAI PUBLICAR, que é o que decide quantos formatos
     * de arte o dia precisa.
     *
     * Sai de `dayPosts`, e não da configuração da campanha, porque é a lista de
     * peças que EXISTEM: uma rede que o Lucas não conseguiu adaptar não deve
     * gerar uma arte que ninguém vai usar, e o Instagram nem entra nos dias sem
     * peça visual. Vazio cai no LinkedIn, que é o formato mais conservador.
     */
    const redesDoDia = Array.from(
      new Set(
        dayPosts
          .filter((p) => p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString())
          .map((p) => p.platform)
      )
    );

    /**
     * OS VÍDEOS QUE ESTE DIA PEDIU, esperando o post existir.
     *
     * Eles só podem ser enfileirados DEPOIS do Paulo, porque o trabalho precisa
     * do `postId` para saber onde pendurar o arquivo quando ficar pronto.
     * Enfileirar antes daria um vídeo órfão, que é o defeito da parte 135 com
     * outra roupa: mídia existindo sem peça a que pertencer.
     */
    const videosParaEnfileirar: Array<Omit<PedidoDeVideoDaFila, "postId" | "cardId"> & { dayOfWeek: number }> = [];

    // ── Material do próprio cliente: ocupa o lugar da Diana neste dia ────────
    const midiaPropria = config.midiaDoCliente?.[String(dayOfWeek)];
    if (midiaPropria?.urls?.length) {
      const urls = midiaPropria.urls.filter((u) => typeof u === "string" && u.startsWith("http"));
      mediaByDayKey[dayKey] = {
        ...(mediaByDayKey[dayKey] ?? {}),
        // Carrossel mora como "url|url|url", igual ao que a Diana entrega.
        imageUrl: midiaPropria.tipo === "carrossel" ? urls.join("|") : urls[0],
        imagePrompt: "material do cliente",
        visualStyle: "proprio",
      };
      await appendLog(runId, {
        agent: "Diana Design",
        message: `${dayName}: usando ${midiaPropria.tipo === "video" ? "o vídeo" : midiaPropria.tipo === "carrossel" ? `as ${urls.length} lâminas` : "a imagem"} que você subiu. Nada foi gerado por IA neste dia.`,
        status: "completed",
      });
    }

    // ── Diana — Media (inclui capa para artigos LinkedIn) ────────────────────
    /**
     * A PEÇA DE QUE A DIANA PARTE (05/10, noite). Até aqui era `liPost`, e só
     * ele: a campanha de um post só para o X (carrossel de segunda do Fé &
     * Gestão) saía sem a Diana, sem arte, sem a marca de espera e sem o card
     * "aguardando a sua identidade visual". O quadro dizia "esperando você
     * aprovar" sobre um post sem arte. Agora o X (ou qualquer peça do dia)
     * serve de base quando não há LinkedIn.
     */
    const pecaBase = pecaBaseDoDia(
      liPost,
      twPost,
      dayPosts.filter((p) => p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString())
    );
    const needsMedia = designer && pecaBase && diaPedeArte(resolvedType, Boolean(midiaPropria?.urls?.length));
    const visualPromptSource =
      resolvedType === "article" && liPost
        ? parseLinkedInArticleContent(liPost.content).body.slice(0, 2800)
        : pecaBase?.content ?? "";

    if (needsMedia && designer && pecaBase) {
      if (!hasApiKey) {
        await appendLog(runId, {
          agent: "Diana Design",
          message: "GEMINI_API_KEY não configurada — gerando apenas prompts visuais.",
          status: "warning",
        });
      }

      const isInfographicType = resolvedType === "infographic";
      const isVideoType = resolvedType === "video";
      const videoDuration = normalizarDuracao(config.videoDuration);
      const videoAudio = config.videoAudio ?? false;
      // Quantas geracoes do Veo o video pede, e quantos segundos saem de fato
      // (60 s pedidos sao 9 geracoes e 64 s). Acima de uma, a Diana escreve um
      // roteiro em cenas em vez de um prompt so.
      const geracoesDoDia = geracoesDoVideo(videoDuration);
      const segundosDoVideo = segundosEntregues(videoDuration);
      // A DIRECAO DE ARTE DO DIA. Estilo alternando por dia e cores da marca
      // do projeto, em vez de "cinematic" fixo e "paleta alinhada ao nicho".
      // Quem escolheu um estilo na janela continua sendo obedecido; o
      // automatico (padrao desde 14/09) e o que alterna. O porque inteiro esta
      // em lib/media/direcao-de-arte.ts.
      // `preferido` entrou em 18/09. Sem ele, o cliente marcava "Desenho
      // animado" e o infográfico saía com fotos realistas: o `styleHintEn`
      // abaixo já respeitava a escolha para a imagem livre, e a chamada do
      // infográfico usava `estiloDoDia`, que era sorteado.
      // Desde 30/09 (item 10) a precedencia inteira mora em direcaoDaPeca:
      // estilo escolhido na campanha, senao a LINGUAGEM DO VIDEO do catalogo
      // (Project.videoEstiloEscolha), com o estilo proprio da Diana refinando
      // por cima; so sem nada disso vale a rotacao. Antes o estilo proprio
      // substituia tudo e o infografico usava o sorteio, entao imagem e
      // infografico do mesmo projeto podiam sair com caras diferentes.
      const direcao = await direcaoDaPeca({
        projectId: project.id,
        runId,
        dayOfWeek,
        infografico: isInfographicType,
        preferido: config.mediaStyle,
      });
      const estiloDoDia = direcao.estilo;
      const paleta = direcao.paleta;
      const styleHintEn = direcao.styleHint;
      // A família da linguagem e as cores da marca: a manchete e o infográfico
      // são compostos em código com elas desde 30/09 (lib/media/arte-com-frase).
      const marcaDaPeca = await marcaDaArte(project.id);
      mediaByDayKey[dayKey] = { ...(mediaByDayKey[dayKey] ?? {}), visualStyle: direcao.visualStyle };
      const maxNarrWords = maxNarrationWordsForDuration(videoDuration);
      const mediaTypeLabel = isVideoType
        ? "vídeo"
        : isInfographicType
          ? "infográfico"
          : resolvedType === "article"
            ? "capa do artigo"
            : "imagem";
      /**
       * A TRAVA DA IDENTIDADE (05/10/2026).
       *
       * Queixa do Bruno: a esteira gerou o carrossel (fundo laranja, texto
       * vinho sobre faixas creme, sem contraste) ANTES de ele aprovar o
       * estilo, a letra e onde cada cor entra, e queimou crédito à toa. Agora
       * nada pago sai enquanto o projeto não tem a identidade aprovada
       * (modelos do book + letra + papéis das cores, em
       * lib/modelos-de-arte/identidade.ts). O dia sai com os textos, e o card
       * da Diana fica em "aguardando a sua identidade visual", com o botão que
       * leva à escolha; depois de aprovar, "Aprovar e gerar" desenha o que
       * ficou esperando (lib/media/artes-aguardando-identidade.ts).
       */
      const identidadeAprovada = marcaDaPeca.identidadeAprovada !== false;
      if (!identidadeAprovada) {
        mediaByDayKey[dayKey] = { ...(mediaByDayKey[dayKey] ?? {}), aguardandoIdentidade: true };
        await appendLog(runId, {
          agent: "Diana Design",
          message: `${mediaTypeLabel[0].toUpperCase()}${mediaTypeLabel.slice(1)} de ${dayName} NÃO foi gerado(a): aguardando a sua identidade visual (modelo de arte, letra e cores). Nenhum crédito de imagem foi gasto. Aprove em Configurações, aba Modelos, e as artes saem.`,
          status: "warning",
        });
        if (isVideoType) {
          // Sem o quadro, o vídeo por IA também espera: o dia sai como imagem
          // (como no caso sem crédito) e volta a ser pedido depois da aprovação.
          for (const p of dayPosts) if (p.mediaType === "video") p.mediaType = "image";
        }
      }

      await appendLog(runId, {
        agent: "Diana Design",
        // A direção vai no log para o cliente ver que a arte segue a linguagem que ele escolheu.
        message: `Criando ${mediaTypeLabel} para ${dayName}${weekOffset > 0 ? ` (semana ${weekOffset + 1})` : ""}. Direção visual: ${direcao.resumo}.`,
        status: "running",
      });

      let dianaFinalUrl: string | undefined;
      let dianaMediaError: string | undefined;

      if (isInfographicType) {
        if (hasApiKey && identidadeAprovada) {
          try {
            // A EXTRAÇÃO ACONTECE UMA VEZ, O DESENHO UMA POR PROPORÇÃO.
            //
            // Extrair custa uma chamada de texto e não muda com o formato;
            // desenhar custa uma de imagem e muda. Um dia que sai em Instagram e
            // LinkedIn precisa de duas artes e de uma extração só, e a função
            // antiga, que fazia as duas coisas, pagava a extração duas vezes.
            const conteudoDoInfografico = await Promise.race([
              extrairConteudoDoInfografico(
                visualPromptSource,
                project.niche ?? "business",
                process.env.GEMINI_API_KEY!,
                // O funil e os documentos do projeto, que até 18/09 não
                // chegavam aqui: a Diana era o único agente cego ao contexto.
                { funil: config.funnelStage, marca: contextDocs },
              ),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout: infographic > 80s")), 80_000)),
            ]);

            const arte = await produzirArtePorRede({
              redes: redesDoDia,
              contentType: "infographic",
              promptBase: "",
              textoDoPost: pecaBase?.content,
              projectId: project.id,
              runId,
              desenhar: async (_prompt, proporcao) => {
                const url = await desenharInfografico(conteudoDoInfografico, process.env.GEMINI_API_KEY!, proporcao, {
                  estilo: estiloDoDia.prompt,
                  paleta,
                  marca: marcaDaPeca,
                });
                if (!url) throw new Error("o modelo não devolveu o infográfico");
                return url;
              },
            });

            dianaFinalUrl = arte.principal;
            mediaByDayKey[dayKey] = {
              ...mediaByDayKey[dayKey],
              imageUrl: dianaFinalUrl,
              imagemPorRede: arte.porRede,
              conferenciaDaArte: arte.algumaReprovada ? arte.avisos.join(" ") : undefined,
              imagePrompt: "infographic",
            };
            for (const aviso of arte.avisos) {
              await appendLog(runId, { agent: "Diana Design", message: aviso, status: "running" });
            }
            await appendLog(runId, {
              agent: "Diana Design",
              message: `Infográfico de ${dayName} pronto em ${Object.keys(arte.porRede).length} formato(s) de rede.`,
              status: arte.algumaReprovada ? "warning" : "completed",
            });
          } catch (err) {
            dianaMediaError = err instanceof Error ? err.message : "Erro desconhecido";
            mediaByDayKey[dayKey] = { ...mediaByDayKey[dayKey], imagePrompt: "infographic" };
            await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar infográfico: ${dianaMediaError}.`, status: "warning" });
          }
        } else {
          mediaByDayKey[dayKey] = { ...mediaByDayKey[dayKey], imagePrompt: "infographic" };
        }
        const dc = await saveCard({
          runId,
          projectId: project.id,
          agentId: "diana-design",
          agentName: designer.name,
          dayOfWeek,
          scheduledDate,
          cardType: "media",
          mediaType: "infographic",
          content: !identidadeAprovada ? `${TEXTO_DO_CARD_AGUARDANDO}\n\nPrompt: infographic` : dianaMediaError ? `AVISO: ${dianaMediaError}\n\nPrompt: infographic` : "infographic",
          mediaUrl: dianaFinalUrl,
          ...(identidadeAprovada ? {} : { metadata: { aguardandoIdentidade: true } }),
        });
        dianaCardId = dc.id;
      } else {
        /**
         * TODO VIDEO PEDE UM ROTEIRO EM CENAS, nao um prompt.
         *
         * Uma cena por geracao do Veo (8 s e depois 7 s por extensao), cada
         * uma com o seu visual e a sua frase de narracao, formando um texto
         * continuo. Mandar o mesmo prompt nove vezes faria o modelo repetir a
         * mesma cena com o narrador repetindo a mesma frase.
         *
         * Desde 22/09 o CLIPE DE 8 s entra aqui tambem, com uma cena so. Ele
         * tinha um prompt proprio, em texto corrido, e os quatro defeitos
         * medidos no video do dia 21 (inventa fato, nao tem gancho, entrega
         * frases soltas, perde a tese) estavam nos dois lugares. Doutrina de
         * roteiro escrita duas vezes e doutrina consertada uma vez so. Ver
         * lib/media/roteiro-do-video.ts.
         */
        const pedidoDoRoteiro =
          isVideoType
            ? promptDoRoteiro({
                textoDoPost: visualPromptSource,
                totalDeGeracoes: geracoesDoDia,
                segundosEntregues: segundosDoVideo,
                comNarracao: videoAudio,
                estiloVisual: styleHintEn,
                nicho: project.niche ?? "business",
              })
            : null;
        const visualPromptBruto = await runAgent(
          designer,
          pedidoDoRoteiro
            ? pedidoDoRoteiro
            : `Crie um prompt visual profissional em INGLÊS para imagem baseado neste conteúdo:

${visualPromptSource}

ESTILO VISUAL ESCOLHIDO PELO USUÁRIO (obrigatório):
${styleHintEn}

O prompt deve ser específico: composição, iluminação, materiais, mood, e a cena precisa nascer do TEMA deste post, não de uma cena genérica de negócios.
As cores acima são da marca do cliente e valem mais que o nicho (${project.niche ?? "business"}).
Formato: uma descrição detalhada em inglês, sem marcadores, sem listas.`,
          contextWithResearch,
          runId,
          funnelInstruction,
          prefixoDaCampanha,
          project.id,
        );
        /**
         * O PREÂMBULO EM PORTUGUÊS NÃO VAI PARA O MODELO DE VÍDEO.
         *
         * Visto em 21/09 na campanha da Areticon: a Diana respondeu "Segue o
         * prompt pronto para geração de vídeo, em inglês, calibrado..." e a
         * frase inteira foi para o Veo como se fosse a cena. O modelo de vídeo
         * não sabe que aquilo é conversa. Linha de abertura que fala do prompt
         * em vez de descrever a cena sai; o resto é o prompt.
         */
        let roteiro: RoteiroDoVideo | null = null;
        if (pedidoDoRoteiro) {
          roteiro = lerRoteiro(visualPromptBruto, geracoesDoDia, videoAudio);
          /**
           * A SEGUNDA CHANCE COBRE OS DOIS DEFEITOS QUE SE MEDEM.
           *
           * Ate 22/09 ela existia so para JSON quebrado. Agora tambem para
           * numero que o post nao tem: a narracao do dia 21 abriu com "mil e
           * quinhentos reais" contra uma FAIXA de mercado no post, e nenhuma
           * peneira do produto enxergava isso, porque a guarda de lastro
           * compara digito com digito e o narrador fala por extenso.
           */
          const limitesDoDia = limitesDeNarracao(geracoesDoDia, segundosDoVideo);
          const inventadosNaPrimeira = roteiro ? fatosInventados(roteiro.cenas, visualPromptSource) : [];
          const longasNaPrimeira = roteiro ? narracoesLongas(roteiro.cenas, limitesDoDia) : [];
          const reclamacao = !roteiro
            ? `A resposta anterior nao era JSON valido com exatamente ${geracoesDoDia} cenas.`
            : inventadosNaPrimeira.length
              ? `A resposta anterior afirma numero que NAO esta no post: ${inventadosNaPrimeira.map((f) => `cena ${f.cena} diz ${f.numeros.join(", ")}`).join("; ")}. Reescreva usando so o que o post diz; se a frase ficar mais fraca sem o numero, ela fica sem o numero.`
              : longasNaPrimeira.length
                ? `A narracao da resposta anterior nao cabe no tempo: ${longasNaPrimeira.map((f) => `cena ${f.cena} tem ${f.palavras} palavras e o limite e ${f.limite}`).join("; ")}. Reescreva dentro da faixa, contando as palavras.`
                : null;
          if (reclamacao) {
            const segunda = await runAgent(
              designer,
              `${pedidoDoRoteiro}\n\n${reclamacao} Responda SOMENTE o JSON.`,
              contextWithResearch,
              runId,
              funnelInstruction,
              prefixoDaCampanha,
              project.id,
            );
            const relido = lerRoteiro(segunda, geracoesDoDia, videoAudio);
            if (relido) roteiro = relido;
          }
          if (!roteiro) {
            await appendLog(runId, {
              agent: "Diana Design",
              message: `O roteiro do vídeo em ${geracoesDoDia} cenas não veio em formato válido; o vídeo vai continuar a mesma cena, sem narração nova nos trechos seguintes.`,
              status: "warning",
            });
          } else {
            /**
             * ULTIMO RECURSO: cena que insistiu no numero inventado fica MUDA.
             *
             * Entre publicar um fato que o post nao disse e entregar o trecho
             * sem voz, a casa escolhe o trecho sem voz. E a mesma escolha que
             * o texto ja faz ("preferimos um post com menos numeros a um post
             * com numero inventado em nome do cliente"), e `narracao` e
             * opcional por cena, entao o video continua saindo.
             */
            /**
             * A NARRACAO LONGA E CORTADA POR FRASE INTEIRA.
             *
             * Medido na prova de 22/09: com o prompt novo o modelo entregou
             * 25 palavras num limite de 19, ou seja trocou o silencio sobrando
             * por frase cortada no meio pelo Veo. Contar palavra e barato e
             * nao depende de o modelo obedecer.
             */
            const longas = narracoesLongas(roteiro.cenas, limitesDoDia);
            if (longas.length) {
              roteiro = { tese: roteiro.tese, cenas: encurtarNarracao(roteiro.cenas, limitesDoDia) };
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Narração encurtada em ${longas.length} cena(s) do vídeo de ${dayName}: não cabia no tempo (${longas
                  .map((f) => `${f.palavras} palavras para ${f.limite}`)
                  .join("; ")}).`,
                status: "warning",
              });
            }
            const teimosos = fatosInventados(roteiro.cenas, visualPromptSource);
            if (teimosos.length) {
              roteiro = { tese: roteiro.tese, cenas: calarCenas(roteiro.cenas, teimosos) };
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Narração removida de ${teimosos.length} cena(s) do vídeo de ${dayName}: afirmavam número que o post não traz (${teimosos.map((f) => f.numeros.join(", ")).join("; ")}).`,
                status: "warning",
              });
            }
            if (roteiro.tese) {
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Tese do vídeo de ${dayName}: ${roteiro.tese}`,
                status: "running",
              });
            }
          }
        }
        const visualPrompt = roteiro ? roteiro.cenas[0].visual : limparPreambuloDoPrompt(visualPromptBruto);

        if (hasApiKey && identidadeAprovada) {
          /**
           * O teto de tempo de UMA geração de arte.
           *
           * Era 70 s, e 70 s deixou de servir em 19/09, quando a imagem passou
           * a sair no GPT Image 2 (que escreve a manchete certa) em vez do
           * Gemini. UMA lâmina no GPT Image 2 em alta qualidade foi medida em
           * 69 segundos no mesmo dia: manter 70 seria derrubar a arte na
           * moeda, e o dia cairia no `catch` entregando post sem imagem com a
           * mensagem errada ("Timeout") em vez do motivo real.
           *
           * 180 s cabe no dia: os escritores levam cerca de 170 s, a Vera 60,
           * e sobram mais de 500 dos 800 para duas proporções com uma
           * refeita cada.
           */
          const withDianaCap = <T>(p: Promise<T>): Promise<T> =>
            Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout: a geração da arte passou de 180s")), 180_000))]);

          try {
            if (isVideoType) {
              /**
               * O VÍDEO POR IA VOLTOU EM 19/09, e ele NÃO acontece aqui.
               *
               * O Veo leva de 60 a 300 segundos, e este dia tem 830 no total
               * contando os cinco agentes. Esperá-lo aqui derrubaria o dia
               * inteiro, e foi essa conta que manteve o vídeo desligado desde
               * agosto mesmo depois de o problema de custo ser resolvido.
               *
               * Então o dia entrega o QUADRO (uma imagem cinematográfica, que é
               * o que a rede mostra enquanto o vídeo não chega) e enfileira o
               * vídeo como trabalho próprio, com prazo próprio.
               *
               * A COBRANÇA SAI DA CARTEIRA DE VÍDEO, e é conferida ANTES de
               * enfileirar. Sem saldo, o dia entrega o quadro e diz por que o
               * vídeo não veio: descobrir isso depois de gerar seria gastar na
               * nossa conta e não receber.
               */
              const qualidade = config.videoQualidade ?? "rapido";
              const conta = await cabeNoSaldoDeVideo(project.userId, videoDuration, qualidade);

              await appendLog(runId, {
                agent: "Diana Design",
                message: `Gerando o quadro de ${dayName}; o vídeo entra na fila logo depois.`,
                status: "running",
              });
              try {
                /**
                 * O QUADRO NÃO NASCE DO PROMPT DO VÍDEO.
                 *
                 * Até 19/09 esta linha era `${visualPrompt} — cinematic still
                 * frame`, e `visualPrompt` é o roteiro do Veo: uma descrição
                 * de SEQUÊNCIA, com "Scene one, zero to two point five
                 * seconds", "Scene two, two point five to five seconds". O
                 * modelo de imagem leu aquilo como briefing de arte e desenhou
                 * exatamente o que estava escrito: um STORYBOARD, três painéis
                 * empilhados com os códigos de tempo desenhados no canto
                 * ("0-2", "2,5-5", "5-8"), mais um "headlime creator" escrito
                 * errado.
                 *
                 * Entregar um roteiro para quem desenha é pedir o roteiro
                 * desenhado. O quadro é uma PEÇA DE FEED como qualquer outra, e
                 * nasce do post, não do plano de filmagem.
                 */
                const pecaDoQuadro = await mancheteDaPeca({
                  textoDoPost: pecaBase?.content ?? visualPromptSource,
                  estiloVisual: styleHintEn,
                  nicho: project.niche,
                  projectId: project.id,
                  runId,
                });
                const arte = await produzirArtePorRede({
                  redes: redesDoDia,
                  contentType: "video",
                  // Arte sem texto e manchete em código (30/09): o modelo não escreve mais.
                  promptBase: promptDaArteSemTexto({ visual: pecaDoQuadro.visual, estilo: styleHintEn, marca: marcaDaPeca }),
                  textoEsperado: [pecaDoQuadro.manchete],
                  textoDoPost: pecaBase?.content,
                  /**
                   * O OLHO CONFERE O QUADRO TAMBÉM, desde 19/09.
                   *
                   * Ele ficava desligado ("o quadro é provisório, o vídeo o
                   * substitui em minutos"). A premissa caiu no mesmo dia: sem
                   * saldo de vídeo o Veo não roda, o quadro vira a ÚNICA arte
                   * do dia, é a capa do card e o poster do vídeo quando ele
                   * chega. Cinco centavos por quadro é o preço de a revisora
                   * enxergar a única arte que o cliente vai ver.
                   */
                  usarOlho: true,
                  projectId: project.id,
                  runId,
                  desenhar: desenharComFraseEmCodigo(pecaDoQuadro.manchete, { ...marcaDaPeca, contexto: pecaBase?.content }, (prompt, proporcao) =>
                    withDianaCap(
                      desenharPecaDeFeed({
                        prompt,
                        proporcao,
                        permitirGemini: true,
                        ctx: { projectId: project.id, runId, operation: "campanha_imagem" },
                      })
                    )
                  ),
                });
                dianaFinalUrl = arte.principal;
                mediaByDayKey[dayKey] = { imageUrl: dianaFinalUrl, imagemPorRede: arte.porRede, imagePrompt: visualPrompt };
              } catch (erroDoQuadro) {
                // Saldo zerado não é "falha ao gerar": é a plataforma parada, e a fila precisa saber.
                if (ehErroDeSaldo(erroDoQuadro) || ehSemSaldoDaOpenAI(erroDoQuadro)) throw erroDoQuadro;
                mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
                await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar o quadro de ${dayName}. Prompt salvo.`, status: "warning" });
              }

              if (!conta.cabe) {
                /**
                 * SEM CRÉDITO, O DIA VIRA IMAGEM, e não um vídeo que nunca chega.
                 *
                 * Até 19/09 os posts ficavam como `video` com o quadro dentro,
                 * e o publicador (certo) barrava todos: "o vídeo ainda não
                 * existe". O Bruno viu quatro erros iguais e nenhuma saída. O
                 * quadro é uma peça de feed inteira (manchete, colagem, formato
                 * da rede), então ele sai como imagem, e o aviso diz que o
                 * vídeo fica para quando houver crédito.
                 */
                for (const p of dayPosts) if (p.mediaType === "video") p.mediaType = "image";
                // Campanha disparada por MEMBRO da equipe (01/10): ele não
                // compra pacote, então o aviso diz a quem pedir, pelo nome.
                const quemDisparou = (await prisma.trabalho.findFirst({ where: { grupo: runId }, orderBy: { createdAt: "asc" }, select: { userId: true } }))?.userId;
                const doMembro = quemDisparou ? await fraseDeSaldoDoMembro(quemDisparou, { necessario: conta.custo, disponivel: conta.disponivel }) : null;
                await appendLog(runId, {
                  agent: "Diana Design",
                  message: doMembro
                    ? `O vídeo de ${dayName} NÃO foi gerado: ${doMembro} O dia sai como IMAGEM, com o quadro, e pode ser regenerado depois para ter o clipe.`
                    : `O vídeo de ${dayName} NÃO foi gerado: custa ${conta.custo} créditos de vídeo e você tem ${conta.disponivel}. O dia sai como IMAGEM, com o quadro. Vídeo por IA não sai do saldo do plano: compre um pacote de vídeo e regenere o dia para ter o clipe.`,
                  status: "warning",
                });
              } else {
                videosParaEnfileirar.push({
                  projectId: project.id,
                  runId,
                  userId: project.userId,
                  prompt: visualPrompt,
                  // A narração é a da cena 1 do roteiro. Desde 22/09 todo
                  // vídeo tem roteiro, inclusive o clipe de 8 s, então a
                  // extração da fala de dentro do prompt em texto corrido
                  // (`narracaoDoPrompt`) virou só o resgate do pedido antigo.
                  narracao: videoAudio ? (roteiro?.cenas[0]?.narracao ?? narracaoDoPrompt(visualPrompt)) : undefined,
                  voz: videoAudio ? config.videoVoz : undefined,
                  segundos: videoDuration,
                  qualidade,
                  /**
                   * A PROPORCAO SAI DO FORMATO ESCOLHIDO (21/09), e nao de um
                   * padrao fixo.
                   *
                   * O reel do Instagram pede 9:16; story tambem. Escolher reel
                   * e mudar a GERACAO, e nao so o endpoint: sem isto o cliente
                   * receberia um video deitado dentro de uma moldura em pe.
                   *
                   * O dia gera UM video para todas as redes, entao basta uma
                   * pedir vertical para ele nascer vertical. Gerar dois seria
                   * pagar duas vezes (R$ 51,84 cada), e video em pe publica no
                   * feed do LinkedIn e do X, enquanto video deitado num reel e
                   * recusado. A janela avisa isto antes de o cliente escolher.
                   */
                  // O TikTok conta como vertical sempre: ele só aceita
                  // video em pe, entao basta estar no dia para o video
                  // nascer 9:16, pela mesma regra de "uma rede pede, o
                  // dia inteiro segue".
                  proporcao: proporcaoDoDia(
                    // Todos os destinos de todas as redes: basta um vertical.
                    redesDoDia.flatMap((r) => (r === "tiktok" ? ["reel"] : destinosDaRede(r, config.formatosPorRede?.[r])))
                  ),
                  dayOfWeek,
                  // O roteiro em cenas, uma por geracao. Sem ele (roteiro
                  // invalido duas vezes), a cadeia usa a continuacao generica.
                  cenas: roteiro?.cenas ?? undefined,
                });
                /**
                 * A DURACAO FICA NA PECA, para o calendario dizer "Video 60 s"
                 * sem abrir o card (21/09). E a duracao ENTREGUE, e nao a
                 * pedida: 60 s pedidos viram 64 s em nove geracoes, e o numero
                 * que o cliente ve tem que ser o do arquivo que ele recebe.
                 *
                 * So os posts DESTE dia, e nao todos: o laco de cima existe
                 * desde 19/09 sem esse filtro e carimbaria a semana inteira.
                 */
                for (const p of dayPosts) {
                  if (p.dayOfWeek === dayOfWeek && p.mediaType === "video") {
                    p.metadata = { ...(p.metadata ?? {}), segundosDoVideo: segundosDoVideo };
                  }
                }
                await appendLog(runId, {
                  agent: "Diana Design",
                  message:
                    geracoesDoDia > 1
                      ? `Vídeo de ${dayName} na fila: ${segundosDoVideo}s em ${geracoesDoDia} gerações encadeadas (Veo 3.1 ${qualidade}, ${conta.custo} créditos de vídeo)${videoAudio ? ", com narração em português" : ""}. Cada geração leva de 1 a 5 minutos.`
                      : `Vídeo de ${dayName} na fila (${videoDuration}s, Veo 3.1 ${qualidade}, ${conta.custo} créditos de vídeo)${videoAudio ? ", com narração em português" : ""}.`,
                  status: "running",
                });
              }
            } else if (resolvedType === "carousel") {
              /**
               * O CARROSSEL DE VERDADE, e não três imagens parecidas.
               *
               * O que havia aqui até 18/09 era o mesmo prompt chamado três
               * vezes com "slide 2, continuation" e "slide 3, call to action"
               * colados no fim, em 1:1 e sem roteiro nenhum. Saíam três artes
               * sem fio condutor, no formato errado, com o texto que o modelo
               * quisesse desenhar.
               *
               * Agora o roteiro vem antes das imagens (a frase de cada lâmina é
               * copy, não sobra de prompt de imagem) e as lâminas saem todas na
               * mesma proporção, que é o que o Instagram exige.
               */
              const aceitam = redesQueAceitamCarrossel(redesDoDia);
              const teto = laminasPermitidas(redesDoDia.length ? redesDoDia : ["instagram"]);
              const pedidas = Math.min(config.laminasDoCarrossel ?? 5, teto || 5);

              if (aceitam.length === 0 && redesDoDia.length > 0) {
                await appendLog(runId, {
                  agent: "Diana Design",
                  message: `Nenhuma rede deste dia aceita carrossel (${redesDoDia.join(", ")}). Gerei uma imagem única.`,
                  status: "warning",
                });
              }

              /**
               * A CHAVE DO CHECKPOINT: execução mais dia, estável entre as
               * tentativas da fila. É ela que faz uma lâmina ser paga UMA vez
               * mesmo quando o trabalho é reiniciado. Ver
               * lib/media/checkpoint-do-carrossel.ts para a medição que a
               * originou.
               */
              const chaveDoCarrossel = `${runId}-${dayKey}`;

              const roteiro = await roteiroDoCarrossel({
                textoDoPost: pecaBase?.content ?? visualPromptSource,
                laminas: pedidas,
                estiloVisual: styleHintEn,
                nicho: project.niche,
                projectId: project.id,
                runId,
                chave: chaveDoCarrossel,
              });
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Roteiro do carrossel de ${dayName}: ${roteiro.map((l, i) => `${i + 1}. ${l.frase}`).join(" · ")}`,
                status: "running",
              });

              const carrossel = await desenharCarrossel({
                roteiro,
                estiloVisual: styleHintEn,
                // Sem a chave da OpenAI o carrossel sai no Gemini, dito no log.
                // Cair em silêncio é o que a esteira não pode fazer: o cliente
                // pagaria premium e receberia o modelo de sempre.
                permitirGemini: true,
                projectId: project.id,
                runId,
                chave: chaveDoCarrossel,
                prazoEm: fatia.fase === "dia" ? fatia.prazoEm : undefined,
                // Uma linha por lâmina. Antes disto, o log ficava 800 segundos
                // mudo entre "roteiro pronto" e a morte da função, e era
                // impossível saber onde o tempo tinha ido.
                aoTerminarLamina: async (i, total, reaproveitada) => {
                  await appendLog(runId, {
                    agent: "Diana Design",
                    message: reaproveitada
                      ? `Lâmina ${i + 1}/${total} reaproveitada da tentativa anterior, sem cobrar de novo.`
                      : `Lâmina ${i + 1}/${total} pronta.`,
                    status: "running",
                  });
                },
              });
              dianaFinalUrl = carrossel.urls.join("|");
              mediaByDayKey[dayKey] = {
                imageUrl: dianaFinalUrl,
                // Todas as redes recebem o MESMO carrossel: as três que aceitam
                // usam a mesma proporção, então não há o que variar.
                imagemPorRede: Object.fromEntries(redesDoDia.map((r) => [r, dianaFinalUrl!])),
                imagePrompt: visualPrompt,
              };
              for (const aviso of carrossel.avisos) {
                await appendLog(runId, { agent: "Diana Design", message: aviso, status: "running" });
              }
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Carrossel de ${carrossel.urls.length} lâminas pronto para ${dayName}.`,
                status: "completed",
              });
            } else {
              /**
               * UMA ARTE POR PROPORÇÃO, UM RECORTE POR REDE.
               *
               * Até 18/09 esta linha era uma chamada só, em
               * "linkedin-landscape", e a mesma arte ia para Instagram,
               * Facebook, LinkedIn e X. Medido nas dez últimas publicadas: todas
               * saíram 1376x768, que não é o formato de rede nenhuma.
               *
               * `hd` (2K) passou a ser obrigatório aqui, e não é capricho: o
               * recorte final para 1080x1350 a partir do padrão de 1376x768
               * seria AMPLIAR 1,76 vezes na altura, e ampliação amolece a
               * imagem. 2K é o menor tamanho que deixa todo recorte ser redução.
               */
              /**
               * A IMAGEM NASCE DE UMA MANCHETE, como a lâmina do carrossel.
               *
               * Até 19/09 esta chamada mandava `visualPrompt` cru, que é uma
               * descrição de cena sem uma palavra de copy, e o modelo
               * preenchia o vazio inventando rótulo: saiu um painel de
               * dashboard com "WEEK 1", "TIME", "CLARITY", "SUSTAINABLE
               * FLOOR", em inglês, com "syetem" escrito errado, e a versão
               * 16:9 saiu sem nenhuma palavra. No mesmo dia, o carrossel saiu
               * perfeito, porque lá a frase vinha escrita antes.
               *
               * Ver lib/media/peca-de-feed.ts para a comparação completa.
               */
              const avisosDaArte: string[] = [];
              const peca = await mancheteDaPeca({
                textoDoPost: pecaBase?.content ?? visualPromptSource,
                estiloVisual: styleHintEn,
                nicho: project.niche,
                projectId: project.id,
                runId,
              });
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Manchete da arte de ${dayName}: "${peca.manchete}"`,
                status: "running",
              });

              const arte = await produzirArtePorRede({
                redes: redesDoDia,
                contentType: resolvedType,
                // TEXTO EM ARTE É CÓDIGO (30/09): o modelo desenha a cena sem
                // letra nem gente, e a manchete é composta por cima com a fonte
                // e as cores da marca. Ver lib/media/arte-com-frase.tsx.
                promptBase: promptDaArteSemTexto({ visual: peca.visual, estilo: styleHintEn, marca: marcaDaPeca }),
                textoEsperado: [peca.manchete],
                textoDoPost: pecaBase?.content,
                projectId: project.id,
                runId,
                desenhar: desenharComFraseEmCodigo(peca.manchete, { ...marcaDaPeca, contexto: pecaBase?.content }, (prompt, proporcao) =>
                  withDianaCap(
                    desenharPecaDeFeed({
                      prompt,
                      proporcao,
                      permitirGemini: true,
                      avisos: avisosDaArte,
                      ctx: { projectId: project.id, runId, operation: "campanha_imagem" },
                    })
                  )
                ),
                // O outro modelo, quando a conferência achou texto ou gente
                // desenhados. Ver lib/media/arte-por-rede.ts. Desde 01/10 o
                // principal da arte é o seletor IMAGEM_ARTE, e o "outro" é o
                // recuo dele (`outroModelo`); generateImage puro cairia no
                // MESMO modelo que acabou de errar.
                desenharAlternativo: desenharComFraseEmCodigo(peca.manchete, { ...marcaDaPeca, contexto: pecaBase?.content }, (prompt, proporcao) =>
                  withDianaCap(
                    generateImage(prompt, proporcao, "hd", {
                      projectId: project.id,
                      runId,
                      operation: "campanha_imagem",
                    }, { outroModelo: true })
                  )
                ),
              });
              arte.avisos.unshift(...avisosDaArte);
              dianaFinalUrl = arte.principal;
              mediaByDayKey[dayKey] = {
                imageUrl: dianaFinalUrl,
                imagemPorRede: arte.porRede,
                conferenciaDaArte: arte.algumaReprovada ? arte.avisos.join(" ") : undefined,
                imagePrompt: visualPrompt,
              };
              refazerArteDoDia = async (motivo: string) => {
                const avisosDaRefeita: string[] = [];
                const refeita = await produzirArtePorRede({
                  redes: redesDoDia,
                  contentType: resolvedType,
                  // A manchete é a mesma: o que a Vera apontou vai como
                  // correção, e a conferência de arte roda de novo por dentro.
                  // A manchete continua composta em código; a correção vai só para a cena.
                  promptBase: `${promptDaArteSemTexto({ visual: peca.visual, estilo: styleHintEn, marca: marcaDaPeca })}\n\nCORRECTION REQUESTED BY THE REVIEWER (fix this in the scene; the headline is added later in code): ${motivo}`,
                  textoEsperado: [peca.manchete],
                  textoDoPost: pecaBase?.content,
                  projectId: project.id,
                  runId,
                  desenhar: desenharComFraseEmCodigo(peca.manchete, { ...marcaDaPeca, contexto: pecaBase?.content }, (prompt, proporcao) =>
                    withDianaCap(desenharPecaDeFeed({ prompt, proporcao, permitirGemini: true, avisos: avisosDaRefeita, ctx: { projectId: project.id, runId, operation: "campanha_imagem" } }))
                  ),
                  desenharAlternativo: desenharComFraseEmCodigo(peca.manchete, { ...marcaDaPeca, contexto: pecaBase?.content }, (prompt, proporcao) =>
                    withDianaCap(generateImage(prompt, proporcao, "hd", { projectId: project.id, runId, operation: "campanha_imagem" }, { outroModelo: true }))
                  ),
                });
                if (!refeita.principal) return false;
                mediaByDayKey[dayKey] = {
                  ...mediaByDayKey[dayKey],
                  imageUrl: refeita.principal,
                  imagemPorRede: refeita.porRede,
                  conferenciaDaArte: refeita.algumaReprovada ? refeita.avisos.join(" ") : undefined,
                };
                if (dianaCardId) await prisma.campaignCard.update({ where: { id: dianaCardId }, data: { mediaUrl: refeita.principal } });
                return true;
              };
              for (const aviso of arte.avisos) {
                await appendLog(runId, { agent: "Diana Design", message: aviso, status: "running" });
              }
              await appendLog(runId, {
                agent: "Diana Design",
                message: `Imagem de ${dayName} pronta em ${Object.keys(arte.porRede).length} formato(s) de rede.`,
                status: arte.algumaReprovada ? "warning" : "completed",
              });
            }
          } catch (err) {
            // Saldo zerado não é "falha ao gerar mídia": é a plataforma parada, e a fila precisa saber.
            if (ehErroDeSaldo(err) || ehSemSaldoDaOpenAI(err)) throw err;
            dianaMediaError = err instanceof Error ? err.message : "Erro desconhecido";
            console.error(`[diana] media generation failed for day ${dayOfWeek}:`, err);
            mediaByDayKey[dayKey] = { imagePrompt: visualPrompt };
            await appendLog(runId, { agent: "Diana Design", message: `Falha ao gerar mídia para ${dayName}: ${dianaMediaError}. Prompt salvo para regeneração manual.`, status: "warning" });
          }
        } else {
          mediaByDayKey[dayKey] = { ...(mediaByDayKey[dayKey] ?? {}), imagePrompt: visualPrompt };
        }

        const dc = await saveCard({
          runId,
          projectId: project.id,
          agentId: "diana-design",
          agentName: designer.name,
          dayOfWeek,
          scheduledDate,
          cardType: "media",
          // O dia de vídeo que ficou aguardando vira imagem (ver a trava acima).
          mediaType: !identidadeAprovada && isVideoType ? "image" : resolvedType,
          content: !identidadeAprovada ? `${TEXTO_DO_CARD_AGUARDANDO}\n\nPrompt: ${visualPrompt}` : dianaMediaError ? `AVISO: ${dianaMediaError}\n\nPrompt: ${visualPrompt}` : visualPrompt,
          mediaUrl: dianaFinalUrl,
          ...(identidadeAprovada ? {} : { metadata: { aguardandoIdentidade: true } }),
        });
        dianaCardId = dc.id;
      }
    }

    // ── Vera — Review ─────────────────────────────────────────────────────────
    // As adaptações do dia entram na revisão desde 18/09. Antes disso a Vera
    // via só LinkedIn e X, e o Facebook saía com "O LinkedIn não penaliza".
    const derivadasDoDia = dayPosts.filter(
      (p) =>
        // O TikTok entrou em 29/09: ele era escrito e nunca revisado.
        ["facebook", "instagram", "tiktok"].includes(p.platform) &&
        p.dayOfWeek === dayOfWeek &&
        p.scheduledDate.toDateString() === scheduledDate.toDateString()
    );

    if (reviewer && (liPost || twPost)) {
      const dayMedia = mediaByDayKey[dayKey];

      /**
       * A TESOURA RODA ANTES DA VERA, e não depois.
       *
       * O critério 8 dela (número sem fonte) é medido por código e reprova
       * sozinho; em 20/09 era a causa mais frequente das 7 reprovações em 7
       * dias, e cada uma custava duas chamadas de Opus para tirar frases que
       * a tesoura já sabia tirar. Agora as frases saem primeiro, com aviso no
       * log, e a Vera julga o texto limpo. O que ela reprovar depois disso é
       * julgamento de verdade, não contagem.
       */
      {
        const lastroPrevio = `${webSearchDataGlobal}\n${webSourcesGlobal.map((f) => `${f.title} ${f.url}`).join("\n")}\n${topic}`;
        const pecasDoDia = [
          ...(liPost ? [{ rotulo: "linkedin", peca: liPost }] : []),
          ...(twPost ? [{ rotulo: "twitter", peca: twPost }] : []),
          ...derivadasDoDia.map((d) => ({ rotulo: d.platform, peca: d })),
        ];
        for (const { rotulo, peca } of pecasDoDia) {
          const semLastro = afirmacoesSemLastro(peca.content, lastroPrevio);
          if (!semLastro.length) continue;
          peca.content = removerFrases(peca.content, semLastro);
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `${rotulo}: ${semLastro.length} frase(s) com número sem fonte removida(s) antes da revisão: ${semLastro.map((f) => f.slice(0, 90)).join(" | ")}`,
            status: "warning",
          });
        }
      }

      /**
       * O QUE A VERA SABE SOBRE A ARTE.
       *
       * Até 18/09 era uma frase de três palavras, "GERADA com sucesso", e foi
       * com ela na mão que a Vera aprovou a arte do "61%" cortado no topo.
       * Agora vem junto quantos formatos de rede foram entregues e o que a
       * conferência de margem achou, que é informação que dá para julgar.
       */
      function getMediaStatus(): string {
        // O vídeo por IA sai DEPOIS do dia, pela fila: na hora da revisão o
        // que existe é o quadro. A Vera precisa saber que o clipe tem 8 s e
        // não tem fala, senão ela mesma sugere "confirmar o vídeo".
        if (resolvedType === "video") {
          const dur = normalizarDuracao(config.videoDuration);
          if (geracoesDoVideo(dur) > 1) {
            return `VÍDEO DE CERCA DE ${segundosEntregues(dur)} SEGUNDOS por IA (${config.videoAudio ? "com narração contínua em português" : "SEM fala"}), gerado depois do dia em ${geracoesDoVideo(dur)} trechos encadeados e publicado ANEXADO ao post; o quadro de abertura ${dayMedia?.imageUrl ? "já foi gerado e conferido" : "FALHOU"}. Não existe gravação, link nem "vídeo nos comentários": qualquer frase que prometa isso, ou que cite duração, está errada.`;
          }
          return `CLIPE DE ${dur} SEGUNDOS por IA (${config.videoAudio ? "com narração curta" : "SEM fala"}), gerado depois do dia e publicado junto do post como vídeo curto de apoio; o quadro de abertura ${dayMedia?.imageUrl ? "já foi gerado e conferido" : "FALHOU"}. Não existe vídeo longo, gravação nem link: qualquer frase do texto que prometa isso está errada.`;
        }
        if (dayMedia?.imageUrl || dayMedia?.videoUrl) {
          const redes = Object.keys(dayMedia.imagemPorRede ?? {});
          const formatos = redes.length ? ` em ${redes.length} formato(s) de rede (${redes.join(", ")})` : "";
          if (dayMedia.conferenciaDaArte) {
            return `GERADA${formatos}, mas a CONFERÊNCIA DE ARTE REPROVOU: ${dayMedia.conferenciaDaArte}`;
          }
          return `GERADA com sucesso${formatos}, conferência de margem aprovada (nenhum elemento encosta na borda)`;
        }
        // A trava da identidade (05/10): não é falha, é espera combinada com o cliente.
        if (dayMedia?.aguardandoIdentidade) return "NÃO GERADA DE PROPÓSITO: o cliente ainda não aprovou a identidade visual (modelo de arte, letra e cores), e a arte sai depois da aprovação sem gastar agora. Não é falha; não peça para refazer a arte nem cite a falta dela como erro.";
        if (dayMedia?.imagePrompt) return "FALHOU — apenas prompt salvo, sem imagem/vídeo real";
        return "NAO SOLICITADA (post de texto)";
      }

      // A PRIMEIRA REVISÃO SEM CLAUDE (05/10, lib/squad/vera-pelo-jev.ts): as
      // réguas medidas da tarefa, a mídia e os critérios por peça vão ao JEV,
      // e o parecer sai composto em código no formato que o laço abaixo lê.
      // O Claude só revisa com o JEV desligado ou fora do ar.
      const tarefaDaPrimeira = buildVeraTask(dayOfWeek, liPost?.content, twPost?.content, getMediaStatus(), false, derivadasDoDia);
      const pecasDaPrimeira = [
        ...(liPost?.content ? [{ id: "linkedin", rede: "linkedin", tipo: "post", texto: liPost.content }] : []),
        ...(twPost?.content ? [{ id: "x", rede: "twitter", tipo: "thread", texto: twPost.content }] : []),
        ...derivadasDoDia.map((d) => ({ id: d.platform, rede: d.platform, tipo: "adaptação", texto: d.content })),
      ];
      const primeiraPeloJev = await veraRevisaNaCampanha({
        projectId: project.id,
        projeto: { nome: project.name, nicho: project.niche, publico: project.targetAudience, voz: project.voice, naoCitar },
        pecas: pecasDaPrimeira,
        dadosPesquisados: webSearchDataGlobal.slice(0, 3000),
        tarefa: tarefaDaPrimeira,
        midia: getMediaStatus(),
      });
      if (primeiraPeloJev) {
        await appendLog(runId, { agent: "Vera Veredito", message: `${dayName}: revisei as ${pecasDaPrimeira.length} peça(s) pelo JEV: ${primeiraPeloJev.veredito}.`, status: "running" });
      }
      const firstOutput =
        primeiraPeloJev?.parecer ??
        (await runAgent(
          reviewer,
          tarefaDaPrimeira,
          `${contextWithResearch}\n\nTema da campanha: ${topic}`,
          runId,
          funnelInstruction,
          prefixoDaCampanha,
          project.id,
          // 16000 para a Vera, e nao os 8192 do padrao: o checklist dela cresceu com
          // as duas reguas medidas (limites da rede e lastro dos numeros), e em
          // 09/09 ela gastou o teto inteiro pensando na quarta e derrubou o dia.
          // O padrao ja e 16.000 desde 10/09; a Vera foi a primeira a precisar.
        ));

      const { verdict } = parseVeraVerdict(firstOutput);

      // A GERENTE ANOTA QUEM ERROU (29/09). Toda reprovação vira lição para o
      // agente culpado, e a lição entra no prompt dele nas próximas campanhas.
      const culpados = verdict.startsWith("REPROVADO") ? culpadosDaReprovacao(firstOutput, verdict) : [];
      for (const culpadoId of culpados) {
        await gravarLicao(project.id, { agentId: culpadoId, motivo: primeiraQueixa(firstOutput), runId });
      }

      let liContentFinal = liPost?.content;
      let twContentFinal = twPost?.content;

      /**
       * A CORREÇÃO DO SQUAD, EM LAÇO (29/09).
       *
       * Até aqui a reprovação era corrigida UMA vez, sem a Vera olhar de novo,
       * e a reprovação de mídia ia direto ao cliente como "reprovado,
       * esperando você". O Bruno recusou: reprovação é conversa da gerente
       * com o time. Agora cada peça volta ao dono com o parecer, a Vera
       * revisa de novo, e isso até 2 vezes. Só o que não tem conserto chega
       * ao cliente, com o motivo e o que fazer (lib/squad/estado-da-correcao.ts).
       */
      let parecerDaVez = firstOutput;
      let rodada = parseVeraVerdict(firstOutput);
      let tentativas = 0;
      const historico: TentativaDaCorrecao[] = [];
      const motivoInicial = motivoDoParecer(firstOutput);
      while (tentativas < MAX_TENTATIVAS_DA_VERA && vereditoPedeCorrecao(rodada.verdict, parecerDaVez)) {
        // Ressalva que é defeito (texto quebrado, dado sem fonte) é texto.
        const corrigeTexto = rodada.needsTextRetry || rodada.verdict === "APROVADO_COM_RESSALVAS";
        const corrigeArte = rodada.needsMediaRetry && refazerArteDoDia !== null;
        if (!corrigeTexto && !corrigeArte) break;
        // O dia tem prazo (a função é morta em 800 s): uma volta leva a
        // reescrita, talvez uma arte e a Vera de novo. Não cabe, não começa.
        if (fatia.fase === "dia" && fatia.prazoEm && fatia.prazoEm - Date.now() < 240_000) {
          await appendLog(runId, { agent: "Vera Veredito", message: `Sem tempo para mais uma correção de ${dayName} dentro do dia.`, status: "warning" });
          break;
        }
        tentativas++;
        const quem: string[] = [];

        if (corrigeTexto) {
        // `para` é novo em 18/09 e existe para o ESCRITÓRIO: sem ele, a tela
        // sabe que a Vera reprovou e não sabe de quem é a mesa para onde ela
        // vai reclamar. O campo é opcional e ninguém mais depende dele.
        // Vai à mesa de QUEM errou, e não sempre à do Lucas (até 29/09 era fixo).
        const culpado = agentePorId(culpados.find((c) => c !== "diana-design") ?? "lucas-linkedin");
        await appendLog(runId, {
          agent: "Vera Veredito",
          para: culpado?.id ?? "lucas-linkedin",
          message: `Reprovei ${dayName} e voltei na mesa ${culpado?.artigo === "A" ? "da" : "do"} ${culpado?.primeiroNome ?? "Lucas"}: ${primeiraQueixa(parecerDaVez)}`,
          status: "warning",
        });

        const [liFixed, twFixed] = await Promise.allSettled([
          // LinkedIn: retry only if Vera's output mentions linkedin-specific issues
          (async () => {
            if (!liPost?.cardId || !linkedinWriter) return null;
            const veraLower = parecerDaVez.toLowerCase();
            const liMentionedBad = /linkedin[\s\S]{0,400}(violação|invent|problem|reprovad|errad|incorret)/i.test(parecerDaVez);
            if (!liMentionedBad) return null; // LinkedIn was OK — don't touch it
            const fixed = await runAgent(
              linkedinWriter,
              `A Vera reprovou o post do LinkedIn. Corrija os problemas identificados e reescreva.

REGRA QUE NÃO SE NEGOCIA: toda frase que a Vera listou em "LASTRO DOS NÚMEROS" sai do texto. Não troque o número por outro, não arredonde, não estime. Um post com menos números é aceitável; um número sem fonte, não.

FEEDBACK DA VERA:
${parecerDaVez.slice(0, 2000)}

⚠ NUNCA invente estatísticas, percentuais ou dados — use APENAS fatos do brief de pesquisa acima.

COMO ENTREGAR: escreva o post final entre <POST> e </POST>. O que estiver fora dessas marcas não vai para o ar, então comente o que quiser lá fora; dentro delas vai SÓ o texto que o cliente publica, começando pela primeira palavra do post.

POST ATUAL:
${liPost.content}`,
              contextWithResearch, runId, funnelInstruction,
              prefixoDaCampanha,
              project.id,
            );
            /**
             * O CARD RECEBE O POST ENTREGUE, e não a resposta crua.
             *
             * Visto em 21/09: doze cards começavam com "Ajustes feitos: saiu
             * 'automatizar', saiu 'ticket alto'...", o changelog que o Lucas
             * escreve fora das marcas <POST>. O post ia limpo para o banco
             * (`extrairPostEntregue` roda no caminho do post), mas o card
             * recebia `fixed` inteiro, e é do card que o calendário tira o
             * título da peça. A mesma extração vale para os dois.
             */
            const entregue = limparBastidorDoTexto(extrairPostEntregue(fixed).content).content;
            await prisma.campaignCard.update({ where: { id: liPost.cardId }, data: { content: entregue } });
            return entregue;
          })(),
          // Twitter: always retry when REPROVADO_TEXTO (Tiago is the main offender for invented stats)
          (async () => {
            if (!twPost?.cardId || !twitterWriter) return null;
            const fixed = await runAgent(
              twitterWriter,
              `A Vera reprovou a thread do Twitter. Corrija os problemas identificados e reescreva.

REGRA QUE NÃO SE NEGOCIA: toda frase que a Vera listou em "LASTRO DOS NÚMEROS" sai do texto. Não troque o número por outro, não arredonde, não estime. Um post com menos números é aceitável; um número sem fonte, não.

FEEDBACK DA VERA:
${parecerDaVez.slice(0, 2000)}

⚠ REGRA ABSOLUTA: NUNCA invente percentuais, estatísticas ou dados — use APENAS fatos do brief de pesquisa acima. Se não há dados reais, escreva narrativa qualitativa sem números inventados.

THREAD ATUAL:
${twPost.content}`,
              contextWithResearch, runId, funnelInstruction,
              prefixoDaCampanha,
              project.id,
            );
            // A reescrita passa pela MESMA regua do primeiro rascunho. Ate 09/09
            // ela era gravada crua, e foi assim que "Segue a thread corrigida"
            // virou o primeiro tweet de quatro posts.
            const limpa = limparThreadReescrita(fixed);
            const { violations: sobras } = validateTwitterThread(limpa.content);
            if (limpa.aparados > 0 || sobras.length > 0) {
              await appendLog(runId, {
                agent: "Xavier X",
                message: `Thread corrigida veio fora do limite (${limpa.aparados} tweet(s) aparados${sobras.length ? `; ainda: ${sobras.join("; ")}` : ""}).`,
                status: "warning",
              });
            }
            await prisma.campaignCard.update({ where: { id: twPost.cardId }, data: { content: limpa.content } });
            return limpa.content;
          })(),
        ]);

        if (liFixed.status === "fulfilled" && liFixed.value) {
          // A REESCRITA E O LUGAR MAIS SUJO DO FLUXO: o modelo acabou de ser
          // reprovado, entao ele explica o que corrigiu antes de entregar. Na
          // prova de 10/09 tres dos sete posts da semana comecavam com essa
          // explicacao, que e a primeira linha que o LinkedIn mostra.
          const limpo = extrairPostEntregue(liFixed.value);
          liContentFinal = limpo.content;
          const idx = dayPosts.findIndex(p => p.cardId === liPost!.cardId);
          if (idx >= 0) dayPosts[idx].content = limpo.content;
          await appendLog(runId, { agent: "Lucas LinkedIn", message: `Post de ${dayName} corrigido automaticamente ✓`, status: "running" });
          if (limpo.removidos) {
            await appendLog(runId, {
              agent: "Lucas LinkedIn",
              message: `${limpo.removidos} bloco(s) de bastidor removido(s) do post de ${dayName} antes de gravar.`,
              status: "warning",
            });
          }
        }
        if (twFixed.status === "fulfilled" && twFixed.value) {
          twContentFinal = twFixed.value;
          const idx = dayPosts.findIndex(p => p.cardId === twPost!.cardId);
          if (idx >= 0) dayPosts[idx].content = twFixed.value;
          await appendLog(runId, { agent: "Xavier X", message: `Thread de ${dayName} corrigida automaticamente ✓`, status: "running" });
        }

        // ── A adaptação que ficou na rede errada ──────────────────────────
        //
        // Só entra aqui a derivada que AINDA cita outra rede depois de
        // adaptada, e só quando a Vera reclamou disso: sem as duas condições
        // isto viraria uma chamada a mais por rede em toda campanha.
        //
        // A correção é cirúrgica, frase a frase, e não uma reescrita: o texto
        // já passou pela Vera no resto, e reescrever inteiro reabre tudo o que
        // ela acabou de aprovar.
        const veraFalouDeRede = /rede certa|outra rede|cita\s+o?\s*(linkedin|facebook|instagram)/i.test(parecerDaVez);
        if (veraFalouDeRede && linkedinWriter) {
          for (const d of derivadasDoDia) {
            const mencoes = mencoesDeOutraRede(d.content, d.platform);
            if (mencoes.length === 0 || !d.cardId) continue;
            const nome = NOME_DA_REDE[d.platform] ?? d.platform;
            // Quem corrige é o especialista da rede, o mesmo que adaptou.
            const corretor = makeAgent(ESPECIALISTA_DA_REDE[d.platform]) ?? linkedinWriter;
            try {
              const bruto = await runAgent(
                corretor,
                `A Vera reprovou a versão de ${nome} de ${dayName} porque ela fala de outra rede.

FRASES APONTADAS:
${mencoes.map((m) => `   • ${m.frase}`).join("\n")}

O QUE FAZER: reescreva SOMENTE essas frases para o ${nome}. Onde a outra rede é só o cenário ("seu post no LinkedIn"), troque por ${nome} ou por uma forma neutra ("o feed", "as redes"). Onde ela faz parte de um fato da pesquisa, mantenha o fato. **Não mexa em nada além dessas frases**, não acrescente dados e não mude os números.

RESUMO DO QUE A VERA APONTOU: ${primeiraQueixa(parecerDaVez)}

COMO ENTREGAR: escreva o texto final entre <POST> e </POST>. O que estiver fora dessas marcas não vai para o ar. Dentro delas vai SÓ o texto que o cliente publica, começando pela primeira palavra do post. Não repita este pedido, não repita o parecer da Vera e não escreva explicações dentro das marcas.

<POST_ATUAL>
${d.content}
</POST_ATUAL>`,
                contextWithResearch, runId, funnelInstruction, prefixoDaCampanha, project.id,
              );
              /**
               * TRÊS PENEIRAS antes de gravar, e a terceira é a que faltava.
               *
               * Em 18/09 este ponto gravou o PARECER DA VERA como peça do
               * Instagram: o prompt antigo mandava o parecer inteiro e o texto
               * separados por "TEXTO ATUAL:", e o modelo devolveu tudo de
               * volta, colado. O parecer interno foi parar na peça que ia ao
               * ar no nome do cliente.
               *
               * O prompt melhorou (marcas `<POST>`), mas prompt não é
               * garantia: o que impede o desastre é esta conferência entre o
               * modelo e o banco.
               */
              const entregue = extrairPostEntregue(bruto).content;
              const peca = pecaPublicavel(limparBastidorDoTexto(entregue).content);
              if ("recusado" in peca) {
                await appendLog(runId, {
                  agent: corretor.name,
                  message: `Recusei a correção de ${nome} de ${dayName}: a resposta veio como bastidor (${peca.recusado}). O texto anterior foi mantido.`,
                  status: "warning",
                });
                continue;
              }
              const corrigido = peca.texto;
              const sobrou = mencoesDeOutraRede(corrigido, d.platform);
              await prisma.campaignCard.update({ where: { id: d.cardId }, data: { content: corrigido } });
              const idx = dayPosts.findIndex((p) => p.cardId === d.cardId);
              if (idx >= 0) dayPosts[idx].content = corrigido;
              await appendLog(runId, {
                agent: corretor.name,
                message: sobrou.length
                  ? `${nome} de ${dayName} reescrito, e ainda cita outra rede em ${sobrou.length} frase(s).`
                  : `${nome} de ${dayName} reescrito para a rede certa ✓`,
                status: sobrou.length ? "warning" : "running",
              });
            } catch (err) {
              await appendLog(runId, {
                agent: corretor.name,
                message: `Não consegui corrigir a rede na versão de ${nome}: ${err instanceof Error ? err.message : String(err)}`,
                status: "warning",
              });
            }
          }
        }
          quem.push(...culpados.filter((c) => c !== "diana-design").map((c) => agentePorId(c)?.nome ?? c));
        }

        if (corrigeArte) {
          await appendLog(runId, { agent: "Vera Veredito", para: "diana-design", message: `Voltei a arte de ${dayName} para a Diana: ${primeiraQueixa(parecerDaVez)}`, status: "warning" });
          try {
            if (await refazerArteDoDia!(primeiraQueixa(parecerDaVez))) quem.push("Diana Design");
          } catch (err) {
            if (ehErroDeSaldo(err) || ehSemSaldoDaOpenAI(err)) throw err;
            await appendLog(runId, { agent: "Diana Design", message: `Não consegui refazer a arte de ${dayName}: ${err instanceof Error ? err.message : String(err)}`, status: "warning" });
          }
        }

        // A Vera olha de novo, com as peças já corrigidas. Desde 03/10 a
        // conferência é do JEV (lib/squad/vera-pelo-jev.ts): pedido a pedido,
        // com as réguas medidas limpas; tudo atendido, aprova sem o Claude.
        // Dúvida ou falha: o Claude revisa como antes. VERA_PELO_JEV=0 desliga.
        const tarefaDaVolta = buildVeraTask(dayOfWeek, liPost?.content, twPost?.content, getMediaStatus(), true, derivadasDoDia);
        const conferida = await veraConfereNaCampanha({
          projectId: project.id,
          parecerAnterior: parecerDaVez,
          tarefa: tarefaDaVolta,
          midia: getMediaStatus(),
          pecas: [
            ...(liPost?.content ? [{ id: "linkedin", rede: "linkedin", tipo: "post", texto: liPost.content }] : []),
            ...(twPost?.content ? [{ id: "x", rede: "twitter", tipo: "thread", texto: twPost.content }] : []),
            ...derivadasDoDia.map((d) => ({ id: d.platform, rede: d.platform, tipo: "adaptação", texto: d.content })),
          ],
        });
        if (conferida.parecer) {
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: conferida.porque.length
              ? `${dayName}: conferi os pedidos da correção um a um; ainda falta: ${conferida.porque.slice(0, 3).join("; ").slice(0, 200)}`
              : `${dayName}: conferi os pedidos da correção um a um, todos atendidos.`,
            status: "running",
          });
        }
        parecerDaVez =
          conferida.parecer ??
          (await runAgent(
            reviewer,
            tarefaDaVolta,
            `${contextWithResearch}\n\nTema da campanha: ${topic}`,
            runId,
            funnelInstruction,
            prefixoDaCampanha,
            project.id,
          ));
        rodada = parseVeraVerdict(parecerDaVez);
        historico.push({ tentativa: tentativas, quem, veredito: rodada.verdict, queixa: motivoDoParecer(parecerDaVez) });
      }

      // O desfecho: corrigido pelo squad, ou sem conserto e com o que fazer.
      // Só REPROVADO que sobrou chega ao cliente como pendência; ressalva que
      // sobrou é aprovação com sugestão, como sempre foi (regra de 21/09).
      const corrigido = tentativas > 0 && !vereditoPedeCorrecao(rodada.verdict, parecerDaVez);
      const precisaDoCliente = rodada.verdict.startsWith("REPROVADO");
      const correcao: CorrecaoDaVera | null =
        tentativas > 0 || precisaDoCliente
          ? {
              estado: precisaDoCliente ? "sem_conserto" : "corrigido",
              tentativa: tentativas,
              maxTentativas: MAX_TENTATIVAS_DA_VERA,
              desde: new Date().toISOString(),
              motivo: precisaDoCliente ? motivoDoParecer(parecerDaVez) : motivoInicial,
              ...(precisaDoCliente ? { oQueFazer: oQueFazerDoCliente(parecerDaVez, tentativas) } : {}),
              historico,
            }
          : null;
      if (correcao) {
        await appendLog(runId, {
          agent: "Vera Veredito",
          message: precisaDoCliente
            ? `${dayName}: o squad refez ${tentativas} vez(es) e não resolveu. Vai para você com o motivo: ${correcao.motivo}`
            : `${dayName} corrigido pelo squad em ${tentativas} tentativa(s) e liberado na nova revisão ✓`,
          status: precisaDoCliente ? "warning" : "running",
        });
      }

      const hasMediaError = getMediaStatus().startsWith("FALHOU");
      const cardStatus = precisaDoCliente ? "needs_revision" : "pending";
      await saveCard({
        runId,
        projectId: project.id,
        agentId: "vera-veredito",
        agentName: reviewer.name,
        dayOfWeek,
        scheduledDate,
        cardType: "preview",
        content: [
          hasMediaError ? "⚠ ATENÇÃO: Mídia não gerada — deve ser corrigida antes de publicar.\n" : "",
          corrigido ? `✅ Corrigido pelo squad em ${tentativas === 1 ? "1 tentativa" : `${tentativas} tentativas`}, com base no parecer da Vera.\n` : "",
          precisaDoCliente && correcao?.oQueFazer ? `PRECISA DE VOCÊ\n${correcao.oQueFazer}\n` : "",
          `LinkedIn:\n${liContentFinal ?? "—"}\n\nX (Twitter):\n${twContentFinal ?? "—"}\n\nVeredito da Vera:\n${firstOutput}`,
          tentativas > 0 ? `\nRevisão da Vera depois da correção ${tentativas}:\n${parecerDaVez}` : "",
          /**
           * O DESFECHO, escrito no fim, depois da reprovação inteira.
           *
           * Sem esta linha o card terminava na primeira revisão, e a tela lia
           * "reprovado" mesmo em peça corrigida e liberada: 12 de 12 pareceres
           * do banco em 19/09, que foi o que o Bruno viu na Diana. A
           * reprovação continua acima, inteira, porque ela é o MOTIVO; isto
           * aqui é o que aconteceu com ela.
           */
          corrigido ? "\nVEREDITO: CORRIGIDO" : "",
        ].filter(Boolean).join("\n"),
        ...(correcao ? { metadata: { correcaoDaVera: correcao } } : {}),
        ...(cardStatus === "needs_revision" ? { status: "needs_revision" } : {}),
      });

      void verdict;
    }

    // ── Paulo — Publish Card ──────────────────────────────────────────────────
    {
      const postsForDay = dayPosts.filter(
        (p) => p.dayOfWeek === dayOfWeek && p.scheduledDate.toDateString() === scheduledDate.toDateString()
      );
      const postIds: string[] = [];
      const dayMedia = mediaByDayKey[dayKey];
      /**
       * A ARTE DE CADA REDE, E NÃO UMA PARA TODAS.
       *
       * Este era o último metro do defeito do card 509: a Diana podia ter
       * gerado cinco formatos que aqui se gravava um só, o mesmo em todas.
       * `imagemPorRede` tem a arte já recortada no tamanho que a rede publica;
       * o `??` cobre o vídeo e as campanhas antigas, que só têm uma.
       */
      const arteDaRede = (platform: string) =>
        dayMedia?.imagemPorRede?.[platform] ?? dayMedia?.imageUrl ?? dayMedia?.videoUrl ?? undefined;

      for (const dp of postsForDay) {
        /**
         * A GUARDA CONTRA BASTIDOR, no último metro antes do banco.
         *
         * O post é criado a partir de `dayPosts`, e não do card: a peneira do
         * `saveCard` não passa por aqui. Em 18/09 foi por este caminho que o
         * parecer da Vera chegou à peça do Instagram.
         *
         * Um dia sem peça é um problema. Uma peça com o parecer interno indo
         * ao ar no nome do cliente é outro, bem maior.
         */
        const pecaLimpa = pecaPublicavel(dp.content);
        if ("recusado" in pecaLimpa) {
          await appendLog(runId, {
            agent: "Paulo Publicador",
            message: `Não publiquei a peça de ${dp.platform} de ${dayName}: o texto veio como bastidor (${pecaLimpa.recusado}). Nada foi gravado para esta rede.`,
            status: "warning",
          });
          continue;
        }
        if (pecaLimpa.texto !== dp.content) {
          await appendLog(runId, {
            agent: "Paulo Publicador",
            message: `Tirei o bastidor que veio junto da peça de ${dp.platform} de ${dayName} antes de gravar.`,
            status: "warning",
          });
          dp.content = pecaLimpa.texto;
        }

        // Ultima regua antes do banco: se depois da Vera e da reescrita ainda
        // sobrou numero sem fonte, a frase sai. O cliente ve o aviso no card.
        const lastroFinal = `${webSearchDataGlobal}\n${webSourcesGlobal.map((f) => `${f.title} ${f.url}`).join("\n")}\n${topic}`;
        const proibidasFinais = mencoesProibidas(dp.content, naoCitar);
        if (proibidasFinais.length) {
          dp.content = removerFrases(dp.content, proibidasFinais);
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `${dp.platform}: ${proibidasFinais.length} frase(s) que citavam ${naoCitar.join(", ")} removida(s) antes de gravar.`,
            status: "warning",
          });
        }
        const promessasFinais = promessasDeMidia(dp.content);
        if (promessasFinais.length) {
          dp.content = removerFrases(dp.content, promessasFinais);
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `${dp.platform}: ${promessasFinais.length} frase(s) que prometiam mídia inexistente removida(s) antes de gravar: ${promessasFinais.map((f) => f.slice(0, 90)).join(" | ")}`,
            status: "warning",
          });
        }
        const semLastroFinal = afirmacoesSemLastro(dp.content, lastroFinal);
        if (semLastroFinal.length) {
          dp.content = removerFrases(dp.content, semLastroFinal);
          await appendLog(runId, {
            agent: "Vera Veredito",
            message: `${dp.platform}: ${semLastroFinal.length} frase(s) removida(s) antes de gravar por número sem fonte: ${semLastroFinal.map((f) => f.slice(0, 90)).join(" | ")}`,
            status: "warning",
          });
        }
        // Uma linha por CONTA de destino. Com a janela nova, sao as contas
        // escolhidas; sem ela, a conta da rede como antes. O texto e a midia
        // sao os mesmos: duas paginas da mesma rede recebem a mesma peca.
        const contasDoPost = destinosPorRede.get(dp.platform)
          ?? [contaDaRede.get(dp.platform) ?? (dp.platform === "linkedin" ? liAccount : twAccount)].filter(Boolean);
        // UM POST POR DESTINO (28/09): quem marcou feed, reel e story no
        // Instagram recebe três posts com o mesmo texto e a mesma mídia, cada
        // um com o seu `formato`, que é o que o publicador lê.
        const destinosDoPost = destinosDaRede(dp.platform, config.formatosPorRede?.[dp.platform]);
        for (const account of contasDoPost.length ? contasDoPost : [undefined]) {
        for (const formatoDoDestino of destinosDoPost) {
        const post = await prisma.post.create({
          data: {
            projectId: project.id,
            runId,
            platform: dp.platform,
            content: dp.content,
            imageUrl: arteDaRede(dp.platform),
            imagePrompt: dayMedia?.imagePrompt ?? null,
            mediaType: dp.mediaType,
            // `visualStyle` e a memoria da rotacao de estilos: o proximo dia le
            // os ultimos e desvia deles (lib/media/direcao-de-arte).
            //
            // `formato` e onde a peca cai dentro da rede (feed, reel, story),
            // escolhido na janela por REDE (21/09). Fica no metadata, como a
            // `rede` da adaptacao, e quem le e o publicador. Sem escolha, o
            // valido devolve "feed", que e o que a plataforma sempre fez.
            metadata: ({
              ...(dp.metadata ?? {}),
              ...(dayMedia?.visualStyle ? { visualStyle: dayMedia.visualStyle } : {}),
              formato: formatoDoDestino,
              // Marca de material próprio: a cobrança do fecho conta só o texto.
              ...(config.midiaDoCliente?.[String(dp.dayOfWeek)]?.urls?.length ? { midiaPropria: true } : {}),
              // A trava da identidade (05/10): a arte ficou esperando a
              // aprovação; o fecho cobra só o texto, e a arte é cobrada quando sair.
              ...(dayMedia?.aguardandoIdentidade ? { aguardandoIdentidade: true } : {}),
            }) as Prisma.InputJsonValue,
            dayOfWeek: dp.dayOfWeek,
            status: "draft",
            socialAccountId: account?.id,
            scheduledAt: scheduledDate,
            articlePublicToken:
              dp.platform === "linkedin" && dp.mediaType === "article" ? newArticlePublicToken() : null,
          },
        });
        postIds.push(post.id);
        createdPostIds.push(post.id);
        if (dp.cardId) {
          await prisma.campaignCard.update({ where: { id: dp.cardId }, data: { postId: post.id } }).catch(() => {});
        }
        }
        }
      }

      if (postIds.length > 0) {
        await saveCard({
          runId,
          projectId: project.id,
          agentId: "paulo-publicador",
          agentName: "Paulo Publicador",
          dayOfWeek,
          scheduledDate,
          cardType: "publish",
          content: `${postsForDay.length} post(s) prontos para publicação na ${dayName}.`,
          postId: postIds[0],
        });
      } else {
        /**
         * DIA SEM PEÇA É DIA FALHADO, e não concluído.
         *
         * Até 19/09 um dia em que nenhum redator entregou terminava em silêncio
         * e o trabalho da fila se marcava concluído: foi assim que sete dias
         * "concluíram" em quatro segundos com a conta da Anthropic zerada, e a
         * campanha fechou como "concluída! 0 posts". Lançar aqui devolve o dia
         * para a fila (até três tentativas) e, se nada mudar, ele fica como
         * falhou, que é o que ele é.
         */
        throw new Error(`${dayName} terminou sem nenhuma peça: nenhum redator entregou.`);
      }

      /**
       * O VÍDEO ENTRA NA FILA AGORA, com o post já criado.
       *
       * Um trabalho por dia, e não um por rede: o arquivo é o mesmo e pendurar
       * o mesmo vídeo em várias peças é uma atualização, não uma geração. O
       * `grupo` é o próprio runId, então o vídeo entra na mesma fila da
       * campanha e respeita a ordem dela.
       */
      /**
       * O VÍDEO RODA LOGO DEPOIS DO DIA DELE, e não depois da campanha inteira.
       *
       * Até 21/09 a ordem era 100 + dia: numa campanha de 14 dias o clipe do
       * dia 1 só nascia uma hora depois, e o Bruno abriu a Diana e viu uma
       * foto onde esperava o vídeo. Os dias entram na fila em passos de 10
       * (ver agendarCampanha); o vídeo entra em ordem + 5, logo atrás do dia
       * que o pediu. O grupo roda um trabalho por vez, então ele nunca
       * disputa com um dia que ainda não escreveu.
       */
      const trabalhoDoDia = await prisma.trabalho.findFirst({
        where: { grupo: runId, tipo: "campanha-dia", status: "rodando" },
        select: { ordem: true },
      });
      for (const v of videosParaEnfileirar) {
        await enfileirar([
          {
            tipo: "video-ia",
            grupo: runId,
            ordem: trabalhoDoDia ? trabalhoDoDia.ordem + 5 : 100 + v.dayOfWeek,
            userId: project.userId,
            projectId: project.id,
            // O card da Diana vai junto para o mp4 chegar nele, e não só nos
            // posts (o "vídeo" da ficha dela era o quadro, até 19/09).
            // `postIds` são os posts DESTE dia: numa campanha quinzenal o dia 1
            // existe duas vezes, e a chave (runId, dayOfWeek) pegava as duas
            // semanas (visto em 21/09 na Areticon).
            payload: { ...v, postId: postIds[0], postIds, cardId: dianaCardId } as unknown as Record<string, unknown>,
          },
        ]);
      }
    }
   } catch (erroDoDia) {
     // Segue para o proximo dia. O que falhou fica escrito no log da execucao,
     // que e onde o cliente ve o que aconteceu com a semana dele.
     const motivo = erroDoDia instanceof Error ? erroDoDia.message : String(erroDoDia);
     console.error(`[pipeline] run ${runId} dia ${dayOfWeek} falhou:`, erroDoDia);
     await appendLog(runId, {
       agent: "Sistema",
       message: `O dia ${nomeDoDia(config.weekStart, dayOfWeek, weekOffset)} não pôde ser gerado (${motivo.slice(0, 160)}).`,
       status: "warning",
     });
     // O erro SOBE, e isso mudou em 10/09. Enquanto a semana rodava numa
     // função só, engolir o erro aqui era a única forma de o dia seguinte
     // acontecer. Agora quem garante isso é a fila, que trata cada dia como um
     // trabalho: engolir aqui faria o trabalho terminar dizendo que deu certo,
     // e o dia nunca seria tentado de novo.
     throw erroDoDia;
   }
  }

  // Aqui o dia acabou. Quem cobra e quem marca a campanha como concluida e a
  // fila, em fecharCampanha, quando o ultimo trabalho do grupo termina: a
  // cobranca e por campanha, e nenhum dia sozinho sabe se foi o ultimo.
}
