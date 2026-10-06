import { pedidoDaGuarda } from "@/lib/media/guarda-da-fala";
import { aindaEsperaOWorker, prazoDaMontagemMs } from "@/lib/media/montagem-no-worker";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { avisarVideoPronto } from "@/lib/notificacoes/avisos";
import { aplicarTermos, parseTermos } from "@/lib/media/termos";
import { MAX_KEYTERMS } from "@/lib/media/keyterms";
import { interpretarResposta, type Word } from "@/lib/media/transcribe";
import { recordTranscricao, type ContextoMidia } from "@/lib/media/usage";
import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { coresDaMarca, familiaDaLinguagem } from "@/lib/media/capa-composta";
import { dirigirMontagem, usarDiretorLimpo } from "@/lib/media/diretor-de-montagem";
import { umaTeseSo } from "@/lib/media/diretor-limpo";
import { gerarAssetsDaMontagem, recortesDoProjeto, urlsDosAssets, type AssetGerado } from "@/lib/media/assets-da-montagem";
import { concluirSePronto } from "@/lib/media/higgsfield";
import {
  ASSETS_EM_VIDEO,
  VOCABULARIO,
  intervaloDaCena,
  resolverMontagem,
  type CenaDoPlano,
  type ContextoDaResolucao,
  type Formato,
  type MontagemResolvida,
  type PalavraNoCorte,
  type PlanoDeMontagem,
  type Retangulo,
  type Zona,
} from "@/lib/media/plano-de-montagem";
import { legendaDecidida } from "@/lib/media/legenda-escolhida";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { mapaDePalavras, remapearPlano, sugestoesNaFala, type PedidoDaCena, type RoteiroDoVideo } from "@/lib/media/roteiro-em-texto";
import { faixasDaMedida, janelaDoZoomNaTela, pontoMaisPerto, webcamComFolga, type FaixaDeTela } from "@/lib/media/faixas-de-tela";
import {
  agendaDoBloco,
  completoEhCurto,
  cotasDoCompleto,
  garantirRitmo,
  insercoesNoTrecho,
  JANELA_DO_CURTO_SEG,
  JANELA_DO_LONGO_SEG,
  type CotaDeInsercoes,
} from "@/lib/media/ritmo-da-edicao";
import { aberturaAtiva, ajustarMomento, bordasDoMomento, FRASE_MAX_SEG, limparSoco, REGRAS_DA_ABERTURA } from "@/lib/media/abertura-do-roteiro";
import { enquadramentoDaBase, noQuadroEnquadrado, type EnquadramentoDoCompleto } from "@/lib/media/enquadramento-do-completo";
import { avisarAdminsDaMontagem } from "@/lib/media/aviso-da-montagem";
import { estornarEdicaoNaoEntregue } from "@/lib/credits/estorno-da-edicao";
import { detectarDemonstracao, quadrosPeloWorker, type ObterQuadros } from "@/lib/media/demonstracao";
import { conferenciaVisualLigada, conferirVideoPronto } from "@/lib/media/conferencia-visual";
import { consertosDaRevisao, RODADAS_DE_CONSERTO, revisaoVisualLigada, revisarVideoPronto, type EstadoDaRevisaoVisual } from "@/lib/media/revisao-visual";
import { conferirAssets } from "@/lib/media/conferencia-da-imagem";
import { perfilDoProjeto, perfilNoPrompt } from "@/lib/media/perfil-do-projeto";
import {
  consertarEdicao,
  editorSobMedidaLigado,
  frasesNumeradas,
  gerarInsercoes,
  concluirVideosDasInsercoes,
  duracoesDasInsercoes,
  pedirVideosDasInsercoes,
  tetoDeVideos,
  type PedidoDeVideo,
  instantesParaOEditor,
  medidasDaEdicao,
  referenciaParaOEditor,
  resolverEdicao,
  revisarPrevia,
  roteiroParaOEditor,
  temaDoEstilo,
  type EdicaoDoEditor,
  type EdicaoResolvida,
} from "@/lib/media/editor-sob-medida";
import { blocosDoEditor, escreverBloco, juntarPartes, manterDensidade, type BlocoDoEditor, type EntradaDoEditor, type ParteDaEdicao } from "@/lib/media/editor-sob-medida/editor";
import { brollsQueCabem, gerarBrolls } from "@/lib/media/editor-sob-medida/broll";
import { DEFEITOS_GRAVES } from "@/lib/media/editor-sob-medida/corte";
import type { MidiaDaInsercao } from "@/lib/media/editor-sob-medida/tipos";
import {
  comandoPadrao,
  corrigirCompletoPorComando,
  editorPorComandoLigado,
  lerComandoDoProjeto,
  paletaDoProjeto,
  planejarCompletoPorComando,
  type LeituraDoVideo,
  replanejarMomentosPorComando,
  revisarPorComando,
  tetoDeImagens,
  type ComandoDoVideo,
  type EntradaDoPlano,
  type PlanoDoDiretor,
  type PlanoPronto,
} from "@/lib/media/editor-por-comando";
import { levarEdicaoParaFalaNova } from "@/lib/media/edicao-na-fala-nova";
import { editorJornadaLigado, esteiraDoCompleto, type AmostraDaJornada } from "@/lib/media/jornada/estado";
import { amostrasNoTempoEditado } from "@/lib/media/jornada/linha-do-tempo";
import { montarPelaJornada } from "@/lib/media/jornada/montar-servidor";
import { dependenciasDaGeracao } from "@/lib/media/jornada/geracao-servidor";
import { contextoDoProjeto, jevDaJornada, redatorDaJornada } from "@/lib/media/jornada/servidor";
import type { EdicaoDaJornada } from "@/lib/media/jornada/montagem";
import { normalizarLegenda } from "@/lib/media/legenda-escolhida";
import { lerVideo as lerVideoParaLeitura, leituraVisaoLigada, medirNoWorker, type RespostaDaMedicao } from "@/lib/media/leitura-do-video";
import {
  demonstracaoNaFala,
  insercoesDoPlano,
  juntarDemonstracao,
  limitarTextoNaTela,
  planoSeguro,
  semAmpliarImagemPequena,
  semInsercaoQueNaoSeSustenta,
  voltarCenasParaPessoa,
  tirarCoberturaDaDemonstracao,
  type Demonstracao,
  type DecisaoDaGuarda,
} from "@/lib/media/guardas-do-completo";

/**
 * O VÍDEO COMPLETO EDITADO NA ESTEIRA (30/09/2026), com a trava
 * MONTAGEM_DO_COMPLETO=1 (desligada até o dono ver o vídeo).
 *
 * A promessa central: o completo do YouTube sai EDITADO no mesmo padrão dos
 * cortes (narrador no canto com colagem, narrador na foto, B-roll, cartelas,
 * letras de revista, zoom, transições, legenda), e rápido. O desenho de
 * velocidade está no worker (worker/src/montagem-do-completo.mjs): a base é o
 * completo de hoje, o Remotion desenha só as janelas de inserção, e o ffmpeg
 * emenda. Aqui mora o que é do app: a fala, o diretor por blocos, os assets e
 * a geometria, no mesmo formato do corte (`MontagemResolvida`).
 *
 * ## A fala vem do PRÓPRIO completo
 *
 * As remoções da limpeza de fala do completo só existem na hora do pedido de
 * corte (a limpeza por IA não é determinística) e não são guardadas. Refazer a
 * conta daria outro tempo; qualquer diferença viraria legenda fora da boca.
 * Então o completo pronto é transcrito de novo pela URL pública (a Deepgram
 * baixa sozinha, nada passa pela função): US$ 0,10 num vídeo de 22 min, e o
 * tempo de cada palavra é o do arquivo que vai ao ar, por construção.
 *
 * ## O diretor por blocos
 *
 * Um plano de 22 min numa chamada passaria do teto de resposta e perderia a
 * mão no meio. O completo é dividido em blocos de ~3,5 min cortados na maior
 * pausa perto do alvo; cada bloco leva o resumo do vídeo (os cortes que o
 * squad escolheu), o que os blocos anteriores já usaram (para não repetir
 * colagem nem título) e os trechos de TELA COMPARTILHADA, onde nada cobre a
 * imagem. Os blocos andam em ondas de três por passada do cron.
 *
 * ## Esteira (mesmo desenho de montagem-nos-cortes.ts: o cron anda um passo)
 *
 *   na-fila -> preparando (transcrição + análise câmera/tela no worker)
 *           -> dirigindo (uma onda de blocos por passada)
 *           -> ilustrando (imagens e pedidos da Higgsfield)
 *           -> gerando (espera as cenas; resolve e manda ao worker)
 *           -> montando (espera o callback) -> pronto | sem-montagem
 *
 * FALHA NUNCA TIRA O COMPLETO DO AR: qualquer erro termina em "sem-montagem"
 * com o motivo, e o completo de hoje continua valendo.
 */

export function montagemDoCompletoLigada(): boolean {
  return process.env.MONTAGEM_DO_COMPLETO === "1";
}

export type EstadoDoCompleto = "na-fila" | "preparando" | "dirigindo" | "ilustrando" | "gerando" | "montando" | "pronto" | "sem-montagem";

export type TrechoDeCamera = { de: number; ate: number };

export type AnaliseDoCompleto = {
  duracao: number;
  fps: number;
  largura: number;
  altura: number;
  trechosDeCamera: TrechoDeCamera[];
  fracaoDeCamera: number;
  /**
   * O que o worker mediu, guardado quando o app decidiu outra coisa (gravação
   * em pé: ver `analiseDaMontagem`). Só para conferir depois.
   */
  trechosMedidos?: TrechoDeCamera[];
  /**
   * Gravação fora de 16:9 e 9:16 (01/10, parte 240: o gêmeo sai 1080x1080):
   * o quadro padrão em que ela entra, com o fundo desfocado. Com ele,
   * `largura` e `altura` acima já são as do QUADRO, e o worker enquadra a
   * base antes de montar. Ver lib/media/enquadramento-do-completo.ts.
   */
  enquadramento?: EnquadramentoDoCompleto | null;
};

/**
 * O formato do completo é o da BASE (30/09): gravação deitada sai 16:9,
 * gravação de celular em pé sai 9:16 (worker/src/ffmpeg.mjs, prepararCompleto,
 * não gira nem recorta). A montagem segue a base, porque as janelas do
 * Remotion são intercaladas com ela quadro a quadro.
 */
export function formatoDoCompleto(dim: { largura: number; altura: number }): Formato {
  return dim.altura > dim.largura ? "9:16" : "16:9";
}

/**
 * A análise que a montagem usa. Na gravação EM PÉ (celular) não existe tela
 * compartilhada, e a medida do worker erra de vez: ela chama de "tela" todo
 * quadro que não parece o quadro típico, e o celular na mão andando pela casa
 * troca de fundo a cada passo. No vídeo do Bruno de 30/09 (cmuon0yxo), os
 * primeiros 73 s, andando da sala para o quintal, saíram como tela, e toda
 * inserção ali voltaria à base. Em pé, o vídeo inteiro é câmera; a medida
 * fica guardada em `trechosMedidos`.
 */
export function analiseDaMontagem(a: AnaliseDoCompleto): AnaliseDoCompleto {
  if (formatoDoCompleto(a) !== "9:16") return a;
  return { ...a, trechosDeCamera: [{ de: 0, ate: a.duracao }], fracaoDeCamera: 1, trechosMedidos: a.trechosMedidos ?? a.trechosDeCamera };
}

export type BlocoDoCompleto = {
  /** Índices das palavras (inclusivos) e tempos do bloco no completo. */
  de: number;
  ate: number;
  inicio: number;
  fim: number;
  plano?: PlanoDeMontagem | null;
  avisos?: string[];
  erro?: string | null;
};

export type MontagemDoCompleto = {
  estado: EstadoDoCompleto;
  desde: string;
  /** Hash curto da base: muda se o completo for refeito. */
  origem?: string;
  /** O completo de hoje, que é a base da edição (nunca a própria edição). */
  baseUrl?: string;
  fala?: { palavras: PalavraNoCorte[]; duracao: number } | null;
  analise?: AnaliseDoCompleto | null;
  blocos?: BlocoDoCompleto[];
  plano?: PlanoDeMontagem | null;
  assets?: AssetGerado[];
  papelUrl?: string | null;
  custoUsd?: number;
  chave?: string;
  montadoUrl?: string;
  /** O completo original, guardado quando a edição toma o lugar dele. */
  completoOriginal?: { url: string; bytes: number | null } | null;
  tentativas?: number;
  tentativasDoPasso?: number;
  /** Uma passada do cron está no meio deste passo (onda do diretor, imagens). */
  trabalhando?: boolean;
  esperarAte?: string | null;
  tempos?: Record<string, number>;
  resumo?: Record<string, unknown>;
  motivo?: string | null;
  /**
   * O ROTEIRO que o cliente aprovou antes de gastarmos (30/09, tela de
   * roteiro): remoções da limpeza, o plano do completo com os ajustes dele e
   * a aprovação. Viaja junto em toda troca de estado (cada uma espalha o
   * estado lido), e o `preparar` usa o plano aprovado em vez de chamar o
   * diretor de novo. Ver lib/media/roteiro-da-edicao.ts.
   */
  roteiro?: RoteiroDoVideo;
  /**
   * A abertura aprovada, levada para o tempo da BASE (01/10): os momentos
   * que o worker emenda na frente do completo editado, com efeito.
   */
  abertura?: Array<{ inicio: number; fim: number; soco: string }> | null;
  /**
   * A montagem DESISTIU por erro técnico (render, envio ao worker, prazo,
   * passo do app), depois das novas tentativas automáticas (01/10, parte 240).
   * Liga o aviso claro e o botão "Tentar a montagem de novo" na tela.
   */
  falhaTecnica?: boolean;
  /** Quando os admins foram avisados por e-mail desta desistência. */
  avisadoEm?: string | null;
  /**
   * Refazer o PLANO com o diretor, mesmo havendo plano aprovado no roteiro
   * (01/10, parte 240: o completo de 30/09 montado com a regra antiga de
   * cobertura). Só por script de admin; o `preparar` vai para "dirigindo".
   */
  replanejar?: boolean;
  /** Tetos do replanejamento por script (custo): cenas de cinema e imagens novas. */
  tetosDoReplanejamento?: { cinema: number; imagens: number } | null;
  /** O que as guardas de 02/10 tiraram e por quê (demonstração, texto, cotas). */
  guardas?: ResumoDasGuardas | null;
  /** A conferência das imagens geradas contra o perfil do projeto (02/10). */
  assetsConferidos?: { em: string; reprovados: Array<{ id: string; motivo: string }>; erro?: string } | null;
  /** A conferência do worker depois do render (02/10): vazios achados e consertados. */
  conferenciaDoRender?: unknown;
  /**
   * A REVISÃO VISUAL FINAL (02/10, lib/media/revisao-visual.ts): o vídeo
   * pronto conferido quadro a quadro antes de ir ao ar, com até 2 rodadas de
   * conserto e a versão segura no fim.
   */
  revisaoVisual?: EstadoDaRevisaoVisual | null;
  /** O plano com as inserções, guardado quando a versão segura foi ao ar (o "pedir de novo" volta a ele). */
  planoAntesDaSegura?: PlanoDeMontagem | null;
  /** O render que espera a revisão visual (ainda não trocou o completo do cliente). */
  candidato?: { url: string; bytes: number; tempos?: Record<string, number>; aberturaSeg?: number } | null;
  /**
   * O EDITOR SOB MEDIDA (03/10, lib/media/editor-sob-medida): o caminho novo,
   * atrás de EDITOR_SOB_MEDIDA. Usa os estados de sempre ("dirigindo" enquanto
   * o editor escreve, "montando" na prévia, na revisão e no final) para a tela
   * e a linha do tempo não mudarem. `desistiu`: o caminho novo falhou e o
   * completo voltou à esteira de sempre (a reserva).
   */
  sobMedida?: EstadoDoSobMedida | null;
  /**
   * A LEITURA DO VÍDEO (06/10, lib/media/leitura-do-video.ts): gênero,
   * cenário, pessoas, tela, quadro, áreas livres e o que acontece, trecho a
   * trecho. Gravada pelo `preparar` antes de "dirigindo"; os cortes do mesmo
   * vídeo leem daqui (`leituraGravada`). Null quando a leitura falhou.
   */
  leitura?: LeituraDoVideo | null;
  /**
   * A JORNADA OFICIAL NA MONTAGEM (06/10, lib/media/jornada, EDITOR_JORNADA=1):
   * a medição do arquivo (rosto e corpo para o passo 7), a edição pronta para
   * o worker e os avisos (o do cliente diz o momento do elemento que saiu).
   */
  jornada?: EstadoDaJornadaNaMontagem | null;
};

export type EstadoDaJornadaNaMontagem = {
  fase: "gerar" | "render";
  amostras: AmostraDaJornada[];
  edicao?: EdicaoDaJornada | null;
  trilha?: boolean;
  avisosDoCliente?: string[];
  avisosDoAdmin?: string[];
  escolhas?: Array<Record<string, unknown>>;
  custoUsd?: number;
  tempos?: Record<string, number>;
  reenviar?: boolean;
  falhas?: number;
};

export type EstadoDoSobMedida = {
  fase: "editar" | "previa" | "revisar" | "final";
  estiloId: string;
  blocos: Array<BlocoDoEditor & { parte?: ParteDaEdicao | null }>;
  editor?: EdicaoDoEditor | null;
  insercoes?: Record<string, MidiaDaInsercao>;
  /** Os vídeos das inserções pedidos à Higgsfield (03/10, segunda volta): entram no final. */
  videos?: PedidoDeVideo[];
  edicao?: EdicaoResolvida | null;
  rodada: number;
  historico: Array<{ rodada: number; quadros: number; nota: number | null; achados?: number; defeitos: Array<{ momento: string | null; t: number; tipo: string; descricao: string }>; falta: string[]; erro?: string | null }>;
  soIds?: string[] | null;
  previaUrl?: string | null;
  custoImagensUsd?: number;
  medidas?: Record<string, number>;
  avisos?: string[];
  /** O crédito dos B-rolls de banco (a API do Pexels pede o link de volta onde o app mostra o resultado). */
  creditos?: string[];
  desistiu?: string | null;
  /**
   * O worker reiniciou com a prévia ou o final na fila ou no meio (04/10):
   * a próxima passada reenvia a MESMA fase, com a edição guardada. Antes o
   * reinício mandava o completo para "gerando", que é a esteira de sempre e
   * não tem plano no caminho novo.
   */
  reenviar?: boolean;
  /** O EDITOR POR COMANDO (05/10): como no corte (lib/media/montagem-nos-cortes.ts), o final sai direto e o revisor olha o final. */
  comando?: {
    comando: ComandoDoVideo;
    base: string;
    plano: PlanoDoDiretor;
    montado?: { url: string; bytes: number; tempos?: Record<string, number> } | null;
    tempos?: Record<string, number>;
    correcoes: number;
  } | null;
};

/** Correções do completo depois do revisor: padrão 0 (um segundo render de 20 min estoura a meta de 40 min). */
function correcoesDoCompleto(): number {
  return Math.max(0, Math.min(1, Number(process.env.EDITOR_POR_COMANDO_RODADAS_COMPLETO ?? 0)));
}

// ─────────────────────────────── números ───────────────────────────────

/**
 * Alvo de fala por chamada do diretor. Era 210 s (o pedido: 3 a 4 min); desde
 * 01/10, 150 s: com as cotas por minuto e a tela compartilhada no contexto, o
 * Sonnet 5 gastava os 32 mil tokens pensando num bloco de 3,5 min e não
 * devolvia o plano (5 de 6 blocos na primeira prova). Blocos menores pensam
 * menos e cabem no prazo de 290 s.
 */
const BLOCO_ALVO_SEG = 150;
/**
 * Blocos dirigidos juntos numa passada do cron. Três dão aos blocos da onda
 * seguinte o "já usado" dos anteriores; seis (um completo de 22 min numa
 * onda só) cortam ~7 min do relógio e perdem essa troca. Ajustável sem deploy.
 */
const BLOCOS_POR_ONDA = Number(process.env.MONTAGEM_COMPLETO_BLOCOS_POR_ONDA ?? 3);
/**
 * Tetos de custo do completo inteiro. As regras do diretor foram medidas no
 * corte de 40 s (2 a 3 cenas de cinema por minuto, até 10 imagens por
 * minuto); aplicadas a 22 min dariam 60 cenas da Higgsfield e 200 imagens.
 */
const CENAS_DE_CINEMA_NO_COMPLETO = Number(process.env.MONTAGEM_COMPLETO_CENAS_IA ?? 4);
// 3 até 02/10 (e 6 no completo curto): menos inserções e melhores.
const IMAGENS_POR_MINUTO_NO_COMPLETO = 2;
/** Imagens novas por minuto no completo curto (em pé ou até 4 min); eram 6 até 02/10. */
const IMAGENS_POR_MINUTO_NO_CURTO = 3;
/** Fração do tempo com inserção (o resto é o narrador cheio da base). */
const COBERTURA_ALVO = "30 a 40%";

const PASSO_MORTO_MS = 15 * 60_000;
const PRAZO_DAS_CENAS_MS = 15 * 60_000;
/** O render de um completo de 22 min leva ~35 min no alvo; o prazo cobre fila e um reenvio. */
const PRAZO_DO_RENDER_MS = 120 * 60_000;
const MAX_TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 3 * 60_000;

const agora = () => new Date().toISOString();
const depois = (ms: number) => new Date(Date.now() + ms).toISOString();
const hashCurto = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// ─────────────────────────────── puro: blocos ───────────────────────────────

/**
 * Os blocos do diretor: ~`alvo` segundos cada, cortados na MAIOR pausa entre
 * palavras numa faixa de 40 s em volta do alvo (troca de assunto costuma
 * morar na pausa longa). O último bloco absorve a sobra quando ela é curta.
 */
export function blocosDaFala(palavras: PalavraNoCorte[], duracao: number, alvo = BLOCO_ALVO_SEG): BlocoDoCompleto[] {
  const blocos: BlocoDoCompleto[] = [];
  const n = palavras.length;
  if (!n) return blocos;
  let de = 0;
  while (de < n) {
    const t0 = palavras[de].inicio;
    let ate = n - 1;
    if (palavras[n - 1].fim - t0 > alvo * 1.4) {
      let melhor = -1;
      let maiorPausa = -1;
      for (let k = de + 1; k < n; k++) {
        const t = palavras[k].inicio - t0;
        if (t < alvo - 40) continue;
        if (t > alvo + 40) break;
        const pausa = palavras[k].inicio - palavras[k - 1].fim + (/[.!?]$/.test(palavras[k - 1].texto) ? 0.3 : 0);
        if (pausa > maiorPausa) {
          maiorPausa = pausa;
          melhor = k;
        }
      }
      if (melhor > de) ate = melhor - 1;
    }
    blocos.push({ de, ate, inicio: 0, fim: 0 });
    de = ate + 1;
  }
  // A borda entre blocos cai no meio da pausa: nenhuma palavra fica sem bloco.
  blocos.forEach((b, i) => {
    b.inicio = i === 0 ? 0 : +((palavras[b.de - 1].fim + palavras[b.de].inicio) / 2).toFixed(3);
    b.fim = i === blocos.length - 1 ? duracao : +((palavras[b.ate].fim + palavras[b.ate + 1].inicio) / 2).toFixed(3);
  });
  return blocos;
}

/** As palavras do bloco no tempo do bloco (o diretor sempre vê um "corte" que começa no zero). */
export function falaDoBloco(palavras: PalavraNoCorte[], b: BlocoDoCompleto): { palavras: PalavraNoCorte[]; duracao: number } {
  return {
    palavras: palavras.slice(b.de, b.ate + 1).map((p) => ({ texto: p.texto, inicio: +(p.inicio - b.inicio).toFixed(3), fim: +(p.fim - b.inicio).toFixed(3) })),
    duracao: +(b.fim - b.inicio).toFixed(3),
  };
}

/** Os trechos de tela compartilhada do bloco, em índices de palavra DO BLOCO. */
function telaNoBloco(palavras: PalavraNoCorte[], b: BlocoDoCompleto, camera: TrechoDeCamera[]): Array<[number, number]> {
  const naCamera = (t: number) => camera.some((c) => t >= c.de && t <= c.ate);
  const faixas: Array<[number, number]> = [];
  for (let i = b.de; i <= b.ate; i++) {
    const tela = !naCamera(palavras[i].inicio) || !naCamera(palavras[i].fim);
    if (!tela) continue;
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima[1] === i - b.de - 1) ultima[1] = i - b.de;
    else faixas.push([i - b.de, i - b.de]);
  }
  return faixas;
}

/**
 * As faixas de tela do bloco com O QUE é mostrado (01/10): índices de palavra
 * DO BLOCO e as descrições da visão. O diretor precisa saber o que está na
 * tela para escrever a chamada certa ("o roteiro no Notion").
 */
function telasComMostraNoBloco(palavras: PalavraNoCorte[], b: BlocoDoCompleto, faixas: FaixaDeTela[]): Array<{ de: number; ate: number; mostra: string[] }> {
  const saida: Array<{ de: number; ate: number; mostra: string[] }> = [];
  for (const f of faixas) {
    let a = -1;
    let z = -1;
    for (let i = b.de; i <= b.ate; i++) {
      const t = (palavras[i].inicio + palavras[i].fim) / 2;
      if (t >= f.de && t < f.ate) {
        if (a < 0) a = i;
        z = i;
      }
    }
    if (a >= 0) saida.push({ de: a - b.de, ate: z - b.de, mostra: f.mostra });
  }
  return saida;
}

/**
 * O que vai ao diretor além da fala. Vale sobre as regras gerais do prompt
 * (o diretor lê este bloco por último, antes da fala).
 */
export function contextoDoBloco(p: {
  indice: number;
  total: number;
  bloco: BlocoDoCompleto;
  resumoDoVideo: string;
  jaUsado: string[];
  tela: Array<[number, number]>;
  imagens: number;
  cenasDeCinema: number;
  /** Teto de inserções do bloco (cotas por minuto, ritmo-da-edicao.ts). Sem ele, vale a cobertura de 30 a 40%. */
  insercoes?: number;
  /** A agenda por minuto do bloco ("0:00 a 1:00 do bloco: 4 inserções"), para espalhar do começo ao fim. */
  agenda?: string;
  /** O que a tela mostra em cada faixa (01/10, visão antes do roteiro). */
  telasComMostra?: Array<{ de: number; ate: number; mostra: string[] }>;
  /** Completo curto (em pé ou até 4 min): ritmo de corte, não de vídeo longo. */
  curto?: boolean;
  formato?: Formato;
  /** Os pedidos do cliente neste bloco (05/10), já em linhas no tempo do bloco. */
  pedidos?: string[];
}): string {
  const min = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const emPe = p.formato === "9:16";
  // A tela compartilhada com o que ela mostra (01/10) vale sobre a lista crua.
  const telas = p.telasComMostra?.length ? p.telasComMostra : p.tela.map(([de, ate]) => ({ de, ate, mostra: [] as string[] }));
  const linhas = [
    `VÍDEO COMPLETO DO YOUTUBE (${emPe ? "9:16, gravado no celular em pé: o quadro é vertical, 1080x1920, como nos cortes" : "16:9"}), EDITADO POR BLOCOS. Este é o bloco ${p.indice + 1} de ${p.total}, de ${min(p.bloco.inicio)} a ${min(p.bloco.fim)} do vídeo. Os índices e segundos da fala abaixo são do bloco.`,
    p.resumoDoVideo ? `Do que o vídeo inteiro trata (os cortes que o squad escolheu): ${p.resumoDoVideo}` : "",
    `REGRAS DO COMPLETO, que valem sobre as regras gerais acima:`,
    p.curto
      ? `- Este completo é CURTO (${emPe ? "gravado em pé" : "até 4 minutos"}): o ritmo é o do corte, não o do vídeo longo. Algo muda na tela a cada 4 a 6 s (troca de layout, punch, zoom, palavra em destaque, ícone, imagem). ${typeof p.insercoes === "number" ? `Inserções (layout que não é narrador cheio, ou elemento sobre ele) neste bloco: até ${p.insercoes}, espalhadas do começo ao fim.` : ""}`
      : typeof p.insercoes === "number"
        ? `- O narrador cheio é a BASE do vídeo longo. Este bloco leva até ${p.insercoes} ${p.insercoes === 1 ? "inserção" : "inserções"} (narrador-canto, narrador-na-foto, broll-cheio, cartela ou um elemento sobre o narrador), ESPALHADAS do começo ao fim do bloco, nos momentos mais fortes (conceito, número, virada).${p.agenda ? ` A distribuição pedida, minuto a minuto: ${p.agenda}. O começo do vídeo pesa mais porque é ali que a retenção se decide.` : ""} Nenhum minuto fica sem nada. Todo o resto é narrador cheio, com movimento.`
        : `- O narrador cheio é a BASE do vídeo longo: ele ocupa de 60 a 70% do tempo. As inserções (narrador-canto, narrador-na-foto, tela-dividida, broll-cheio, cartela) cobrem ${COBERTURA_ALVO} do bloco, nos CONCEITOS, nas listas, nos números e nas viradas. Vídeo longo com inserção o tempo todo cansa.`,
    `- Fala longa no narrador cheio vira várias cenas narrador-cheio seguidas (até 8 s cada), alternando o movimento: estatico, zoom-in-lento na frase que pesa, punch na palavra forte.`,
    p.curto ? "" : `- No narrador cheio, no máximo UM elemento e raramente: o elemento pede o motor de montagem, que é caro. Guarde títulos, recortes e números para as inserções.`,
    `- Não use narrador-recortado no completo (vira narrador-na-foto).`,
    `- Imagens novas NESTE BLOCO (colagens mais recortes): no máximo ${p.imagens}. Reaproveite a mesma colagem em mais de uma cena.`,
    `- Cenas de cinema (cena-em-movimento): no máximo ${p.cenasDeCinema} neste bloco${p.cenasDeCinema === 0 ? " (nenhuma: use colagem)" : ""}. Não peça cena-do-narrador. Se a regra geral pedir mais, as excedentes viram colagem parada.`,
    telas.length
      ? `- TELA COMPARTILHADA (a tela do computador, com a webcam no canto): ${telas
          .map((t) => `palavras ${t.de === t.ate ? t.de : `${t.de} a ${t.ate}`}${t.mostra.length ? ` (mostra: ${t.mostra.slice(0, 4).join("; ")})` : ""}`)
          .join("; ")}. Ali a IMAGEM é a tela: use narrador-cheio (que mostra a tela inteira, com a webcam), nunca canto, foto, B-roll, cartela, colagem ou recorte por cima. Edite a tela como tela: a cada 6 a 10 s uma CHAMADA sobre o que está sendo mostrado, com palavras DITAS (tarja, marca-texto ou palavra, até 4 palavras, zona "topo" ou "base"), e entre as chamadas, cenas narrador-cheio com zoom-in-lento (o código leva o zoom para a parte da tela que importa). Nunca deixe uma faixa de tela sem chamada nenhuma.`
      : "",
    p.jaUsado.length ? `JÁ USADO nos blocos anteriores (não repita a mesma imagem nem o mesmo título):\n${p.jaUsado.slice(-40).map((u) => `- ${u}`).join("\n")}` : "",
    p.pedidos?.length
      ? `PEDIDOS DO CLIENTE NESTE BLOCO (obrigatórios; valem sobre as cotas e o ritmo naquele trecho). Ele leu a fala e pediu o ajuste ou o efeito; atenda cada um no trecho pedido, e "sem efeito" deixa o trecho em narrador cheio parado:\n${p.pedidos.map((x) => `- ${x}`).join("\n")}`
      : "",
  ];
  return linhas.filter(Boolean).join("\n");
}

/** Os pedidos do cliente que caem no bloco, em linhas no tempo DO BLOCO (o diretor vê o bloco começando no zero). */
export function pedidosNoBloco(pedidos: PedidoDaCena[] | undefined, b: BlocoDoCompleto): string[] {
  const min = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return (pedidos ?? [])
    .filter((x) => x.inicio < b.fim && x.fim > b.inicio)
    .map((x) => `de ${min(Math.max(0, x.inicio - b.inicio))} a ${min(Math.max(0, Math.min(b.fim, x.fim) - b.inicio))} do bloco, onde a fala é "${x.fala.slice(0, 120)}": "${x.texto}"`);
}

/** O que um plano já usou, em linhas curtas, para os blocos seguintes não repetirem. */
export function usadoNoPlano(plano: PlanoDeMontagem): string[] {
  const saida: string[] = [];
  for (const a of plano.assets) if (a.tipo !== "icone") saida.push(`imagem (${a.tipo}): ${a.descricao.slice(0, 90)}`);
  for (const c of plano.cenas)
    for (const e of c.elementos) {
      if (e.tipo === "letras-revista" || e.tipo === "carimbo") saida.push(`${e.tipo}: "${e.texto}"`);
      // A cartela do corte limpo (03/10): o texto dela não volta em outro bloco.
      if (c.layout === "cartela" && e.tipo === "marca-texto") saida.push(`cartela: "${e.texto}"`);
    }
  return saida;
}

// ─────────────────────────────── puro: o plano do vídeo inteiro ───────────────────────────────

/**
 * Os planos dos blocos viram UM plano do vídeo inteiro: índices de palavra
 * deslocados para o global, ids de asset com o prefixo do bloco (dois blocos
 * podem chamar de "a1" coisas diferentes). O formato é o da base (30/09: a
 * gravação em pé monta em 9:16, e é dele que as cenas da Higgsfield tiram a
 * proporção).
 */
export function juntarPlanos(blocos: BlocoDoCompleto[], formato: Formato = "16:9"): PlanoDeMontagem {
  const cenas: CenaDoPlano[] = [];
  const assets: PlanoDeMontagem["assets"] = [];
  let legenda: PlanoDeMontagem["legenda"] = { estilo: "papel" };
  let temLegenda = false;
  const resumos: string[] = [];
  blocos.forEach((b, k) => {
    const p = b.plano;
    if (!p) {
      // Bloco sem plano (o diretor falhou duas vezes): narrador cheio puro.
      cenas.push({ de: b.de, ate: b.ate, layout: "narrador-cheio", movimento: "estatico", transicao: "corte", fundo: "papel", elementos: [], motivo: "bloco sem plano" });
      return;
    }
    // A legenda é a da família (o validador já a fixa); vale a do primeiro
    // bloco que teve plano, e não só a do bloco 0 (se ele falhou, ficava
    // "papel" num vídeo de Hormozi ou BBC).
    if (!temLegenda) {
      legenda = p.legenda;
      temLegenda = true;
    }
    if (p.resumo) resumos.push(p.resumo);
    const id = (x: string | undefined) => (x ? `b${k}-${x}` : x);
    for (const a of p.assets) assets.push({ ...a, id: id(a.id)!, ancora: typeof a.ancora === "number" ? a.ancora + b.de : a.ancora });
    for (const c of p.cenas) {
      cenas.push({
        ...c,
        de: c.de + b.de,
        ate: c.ate + b.de,
        movimentoNa: typeof c.movimentoNa === "number" ? c.movimentoNa + b.de : c.movimentoNa,
        asset: id(c.asset),
        elementos: c.elementos.map((e) => ({ ...e, palavra: e.palavra + b.de, ...("asset" in e && typeof e.asset === "string" ? { asset: id(e.asset)! } : {}) })) as CenaDoPlano["elementos"],
      });
    }
  });
  return { formato, resumo: resumos.join(" "), legenda, assets, cenas };
}

const PEDE_MIDIA = new Set(["narrador-canto", "tela-dividida", "broll-cheio"]);

/** A cena volta a ser a base pura: narrador cheio, sem nada por cima. */
function paraBase(c: CenaDoPlano, motivo: string, parado = false): CenaDoPlano {
  return { ...c, layout: "narrador-cheio", asset: undefined, elementos: [], movimento: parado ? "estatico" : c.movimento, motivo: `${c.motivo} (${motivo})` };
}

/** Elementos que podem ficar sobre a tela compartilhada: chamadas de texto, sem imagem por cima. */
const CHAMADAS_NA_TELA = new Set(["marca-texto", "letras-revista", "carimbo", "tarja", "titulo", "numero", "icone-pop", "faixa", "selo", "comentario"]);

/**
 * A cena vira TELA tratada como tela (01/10), e não base parada: a tela
 * inteira com a webcam (narrador cheio, que no completo é o quadro inteiro da
 * base), no máximo duas chamadas de texto longe da webcam, e o zoom na região
 * que importa quando a cena está toda dentro da tela e não tem chamada (o
 * zoom mexeria a chamada junto). Imagem, canto, foto e B-roll saem: cobririam
 * o que está sendo mostrado.
 */
function paraTela(c: CenaDoPlano, info: NonNullable<CenaDoPlano["tela"]>, inteira: boolean, motivo: string): CenaDoPlano {
  const webcamEmBaixo = !info.narrador || info.narrador.y + info.narrador.h / 2 > 0.5;
  const elementos = c.elementos
    .filter((e) => CHAMADAS_NA_TELA.has(e.tipo))
    .slice(0, 2)
    .map((e) => ({ ...e, zona: (webcamEmBaixo ? "topo" : "base") as Zona }));
  // Zoom só com as linhas de texto medidas no print, e quando o fator passa de 1,05 (`janelaDoZoomNaTela`).
  const zoom = inteira && !elementos.length && Boolean(janelaDoZoomNaTela(info.linhas));
  return {
    ...c,
    layout: "narrador-cheio",
    asset: undefined,
    elementos,
    // O enquadramento do corte limpo não vale na tela: recortaria o que é mostrado.
    zoom: undefined,
    movimento: zoom ? "zoom-in-lento" : "estatico",
    movimentoNa: zoom ? c.movimentoNa : undefined,
    // A região fica guardada mesmo sem zoom: a parte da cena que o ritmo
    // partir depois (sem a chamada) ganha o zoom nela.
    tela: info,
    motivo: c.motivo.includes("(tela compartilhada") ? c.motivo : `${c.motivo} (${motivo})`,
  };
}

/**
 * O que o código garante no completo, depois do diretor:
 *   - TELA COMPARTILHADA editada como tela (01/10): a cena que cai nela vira
 *     a tela inteira com chamada de texto ou zoom na região certa
 *     (`paraTela`); a que só encosta nela (menos da metade) volta à base. Até
 *     30/09 tudo que encostava virava base parada, e 20 cenas do teste do
 *     Bruno sumiram assim;
 *   - narrador-recortado vira narrador-na-foto (a máscara do MediaPipe no
 *     vídeo longo custaria minutos por janela);
 *   - a cena que o `apararCenas` partiu por tamanho e jogou num layout de
 *     inserção volta a ser cheia (no completo, cheio longo é a base);
 *   - as COTAS por minuto (ritmo-da-edicao.ts): o vídeo coberto do começo ao
 *     fim, mais denso no começo;
 *   - tetos de custo do vídeo inteiro: cenas de cinema além do teto viram
 *     colagem; cenário do narrador sai (é recorte 9:16); imagens além do teto
 *     saem, e a cena que dependia delas volta ao narrador cheio.
 */
export function ajustarPlanoDoCompleto(
  plano: PlanoDeMontagem,
  p: {
    palavras: PalavraNoCorte[];
    duracao: number;
    camera: TrechoDeCamera[];
    cenasDeCinema: number;
    imagens: number;
    cobertura?: number;
    /** Teto de inserções do vídeo inteiro em janelas iguais (30/09). As `cotas` valem sobre ele. */
    insercoesMax?: number;
    /** Cotas de inserção por janela (01/10, `cotasDoCompleto`). */
    cotas?: CotaDeInsercoes[];
    /**
     * As faixas de tela no tempo desta fala, com região e webcam (visão antes
     * do roteiro). Sem elas, a tela é o complemento de `camera` (a medida do
     * worker), sem região.
     */
    faixas?: FaixaDeTela[];
  }
): { plano: PlanoDeMontagem; avisos: string[] } {
  const avisos: string[] = [];
  const telas = p.faixas ?? faixasDaMedida(p.camera, p.duracao, 1);
  const sobreposicao = (a: number, b: number) => {
    let melhor: FaixaDeTela | null = null;
    let soma = 0;
    let maior = 0;
    for (const f of telas) {
      const d = Math.max(0, Math.min(b, f.ate) - Math.max(a, f.de));
      soma += d;
      if (d > maior) {
        maior = d;
        melhor = f;
      }
    }
    return { fracao: b > a ? soma / (b - a) : 0, faixa: melhor };
  };
  let cenas = plano.cenas.map((c) => ({ ...c, elementos: [...c.elementos] }));
  cenas = cenas.map((c, i) => {
    const { inicio, fim } = intervaloDaCena(c, p.palavras, p.duracao);
    // Já marcada no roteiro (com a região da visão): só confere o tratamento.
    if (c.tela) return paraTela(c, c.tela, Boolean(c.tela.linhas), "tela compartilhada");
    const { fracao, faixa } = sobreposicao(inicio, fim);
    if (faixa && fracao >= 0.5) {
      const ponto = pontoMaisPerto(faixa, (inicio + fim) / 2);
      const inteira = fracao > 0.98;
      if (c.layout !== "narrador-cheio") avisos.push(`cena ${i + 1} (${c.layout}) cai na tela compartilhada; virou tela com chamada`);
      return paraTela(
        c,
        { regiao: inteira ? ponto?.regiao ?? null : null, linhas: inteira ? ponto?.linhas ?? null : null, narrador: faixa.narrador ?? null, mostra: ponto?.mostra ?? faixa.mostra[0] ?? null },
        inteira,
        "tela compartilhada"
      );
    }
    if (faixa && fracao > 0) {
      if (c.layout !== "narrador-cheio" || c.elementos.length) avisos.push(`cena ${i + 1} encosta na tela compartilhada; virou base`);
      return paraBase(c, "encosta na tela compartilhada", true);
    }
    if (c.layout === "narrador-recortado") return { ...c, layout: "narrador-na-foto" as const };
    // Tela dividida vira canto: a caixa do narrador nela tem 960 px de largura
    // e pediria o narrador em resolução cheia no Remotion (o dobro do tempo
    // por quadro, medido em 30/09); o canto diz o mesmo com a mesma imagem.
    if (c.layout === "tela-dividida") return { ...c, layout: "narrador-canto" as const };
    if (/partida por tamanho/.test(c.motivo) && cenas[i - 1]?.layout === "narrador-cheio" && c.layout !== "narrador-cheio") return paraBase(c, "cheio longo é a base");
    return c;
  });

  // O TETO DE COBERTURA (30/09): na prova, o diretor pôs inserção em 74% do
  // bloco apesar do pedido de 30 a 40% (as regras gerais dele pedem troca de
  // layout a cada 4 a 8 s, que é o certo no corte de 40 s). Cada inserção é
  // Chrome quadro a quadro, então o código garante o teto. Escolha por
  // PRIORIDADE, e não por ordem de tempo (a primeira versão, um balde no
  // tempo, cortou todas as fotos da prova): cena de cinema paga fica sempre;
  // depois B-roll, cartela, foto e canto; o narrador cheio com elemento é o
  // último (o elemento sozinho vale menos que uma inserção). Cada repetição
  // do mesmo layout perde um pouco de prioridade, para sobrar variedade. A
  // que não cabe volta ao narrador cheio, com o movimento que tinha.
  const PESO: Record<string, number> = { "broll-cheio": 50, cartela: 45, "narrador-na-foto": 42, "narrador-canto": 38, "narrador-cheio": 10 };
  const vistas: Record<string, number> = {};
  const candidatas = cenas
    .map((c, i) => {
      if (c.layout === "narrador-cheio" && c.elementos.length === 0) return null;
      const { inicio, fim } = intervaloDaCena(c, p.palavras, p.duracao);
      // Cheio com elemento: a janela começa no elemento, ~3 s.
      const custo = c.layout === "narrador-cheio" ? Math.min(fim - inicio, 3) : fim - inicio;
      const cinemaPago = c.asset ? plano.assets.some((a) => a.id === c.asset && ASSETS_EM_VIDEO.includes(a.tipo)) : false;
      const k = (vistas[c.layout] = (vistas[c.layout] ?? 0) + 1);
      // O que o CLIENTE pediu ou reescreveu (02/10) fica, como a cena paga.
      const doCliente = Boolean(c.pedido) || c.ajuste === "editado" || c.ajuste === "nova-ideia";
      return { i, custo, peso: cinemaPago || doCliente ? 1000 : (PESO[c.layout] ?? 30) - 6 * (k - 1) };
    })
    .filter((x): x is { i: number; custo: number; peso: number } => x !== null)
    .sort((a, b) => b.peso - a.peso || a.custo - b.custo);
  const orcamento = (p.cobertura ?? 0.38) * p.duracao;
  let usado = 0;
  const fica = new Set<number>();
  // O teto antigo em janelas iguais (30/09) vira cotas de uma inserção cada:
  // quem ainda chama com `insercoesMax` recebe o mesmo comportamento de antes.
  const cotas: CotaDeInsercoes[] | null = p.cotas?.length
    ? p.cotas
    : typeof p.insercoesMax === "number" && p.insercoesMax > 0
      ? Array.from({ length: p.insercoesMax }, (_, k) => ({ de: (k * p.duracao) / p.insercoesMax!, ate: ((k + 1) * p.duracao) / p.insercoesMax!, insercoes: 1 }))
      : null;
  if (cotas) {
    // AS COTAS POR JANELA (01/10): cada janela fica com os N momentos de maior
    // prioridade dela, com 6 s de folga entre dois que ficam (dois efeitos
    // colados leem como um só). "Momento" é a sequência de cenas vizinhas com
    // a MESMA mídia (a cena de cinema em tela cheia e o narrador voltando no
    // canto com ela): para quem assiste é um efeito só.
    const momentos: Array<{ is: number[]; peso: number; inicio: number }> = [];
    for (const x of [...candidatas].sort((a, b) => a.i - b.i)) {
      const ultimo = momentos[momentos.length - 1];
      const anterior = ultimo ? cenas[ultimo.is[ultimo.is.length - 1]] : null;
      if (ultimo && ultimo.is[ultimo.is.length - 1] === x.i - 1 && cenas[x.i].asset && anterior?.asset === cenas[x.i].asset) {
        ultimo.is.push(x.i);
        ultimo.peso = Math.max(ultimo.peso, x.peso);
        continue;
      }
      momentos.push({ is: [x.i], peso: x.peso, inicio: intervaloDaCena(cenas[x.i], p.palavras, p.duracao).inicio });
    }
    for (const cota of cotas) {
      const daJanela = momentos.filter((m) => m.inicio >= cota.de && m.inicio < cota.ate).sort((a, b) => b.peso - a.peso);
      const escolhidos: number[] = [];
      for (const m of daJanela) {
        if (escolhidos.length >= cota.insercoes) break;
        if (escolhidos.some((t) => Math.abs(t - m.inicio) < 6)) continue;
        escolhidos.push(m.inicio);
        for (const i of m.is) fica.add(i);
      }
    }
  } else {
    for (const x of candidatas) {
      if (x.peso >= 1000 || usado + x.custo <= orcamento) {
        usado += x.custo;
        fica.add(x.i);
      }
    }
  }
  cenas = cenas.map((c, i) => {
    if ((c.layout === "narrador-cheio" && c.elementos.length === 0) || fica.has(i)) return c;
    avisos.push(`cena ${i + 1} (${c.layout}) passou do teto de cobertura; virou narrador cheio`);
    return c.layout === "narrador-cheio" ? { ...c, elementos: [] } : paraBase(c, "teto de cobertura do completo");
  });

  // Ordem de uso (a primeira cena que usa): o teto corta o que vem por último.
  const primeiroUso = new Map<string, number>();
  cenas.forEach((c, i) => {
    for (const id of [c.asset, ...c.elementos.map((e) => ("asset" in e ? (e.asset as string) : undefined))]) if (id && !primeiroUso.has(id)) primeiroUso.set(id, i);
  });
  const usados = plano.assets.filter((a) => primeiroUso.has(a.id)).sort((a, b) => primeiroUso.get(a.id)! - primeiroUso.get(b.id)!);
  const fora = new Set<string>();
  let cinema = 0;
  let imagens = 0;
  const assets = usados.flatMap((a) => {
    if (a.tipo === "cena-do-narrador") {
      fora.add(a.id);
      return [];
    }
    if (ASSETS_EM_VIDEO.includes(a.tipo)) {
      if (cinema < p.cenasDeCinema) {
        cinema++;
        return [a];
      }
      // Vira colagem parada, e aí conta no teto de imagens como as outras.
      a = { ...a, tipo: "colagem" };
    }
    if (a.tipo === "icone") return [a];
    if (imagens < p.imagens) {
      imagens++;
      return [a];
    }
    fora.add(a.id);
    return [];
  });
  if (fora.size) avisos.push(`${fora.size} asset(s) acima do teto do completo; as cenas voltaram ao narrador`);
  cenas = cenas.map((c) => {
    const elementos = c.elementos.filter((e) => !("asset" in e) || !fora.has(e.asset as string));
    if (c.asset && fora.has(c.asset)) {
      if (PEDE_MIDIA.has(c.layout)) return paraBase({ ...c, elementos }, "asset acima do teto");
      return { ...c, asset: undefined, elementos };
    }
    return { ...c, elementos };
  });
  return { plano: { ...plano, assets, cenas }, avisos };
}

/**
 * O FECHO DO PLANO DO COMPLETO (01/10), igual no roteiro e na montagem sem
 * roteiro: as cotas por minuto e a tela tratada como tela
 * (`ajustarPlanoDoCompleto`), depois o ritmo mínimo (`garantirRitmo`): no
 * completo curto, um evento a cada 5 s, com palavra em destaque se preciso;
 * no longo, um movimento (punch ou zoom na base, sem custo de render) a cada
 * 10 s entre as inserções. A palavra em destaque nunca vai à tela
 * compartilhada.
 */
export function fecharPlanoDoCompleto(
  plano: PlanoDeMontagem,
  p: {
    palavras: PalavraNoCorte[];
    duracao: number;
    formato: Formato;
    familia: "colagem" | "impacto" | "sobrio";
    camera: TrechoDeCamera[];
    faixas?: FaixaDeTela[];
    cenasDeCinema: number;
    imagens: number;
  }
): { plano: PlanoDeMontagem; avisos: string[]; ritmo: number } {
  const curto = completoEhCurto(p.duracao, p.formato);
  // Uma tese em tela cheia no vídeo inteiro (03/10, corte limpo): os blocos
  // planejam em paralelo e cada um pode trazer a sua.
  plano = umaTeseSo(plano);
  const ajustado = ajustarPlanoDoCompleto(plano, {
    palavras: p.palavras,
    duracao: p.duracao,
    camera: p.camera,
    faixas: p.faixas,
    cenasDeCinema: p.cenasDeCinema,
    imagens: p.imagens,
    cotas: cotasDoCompleto(p.duracao, p.formato),
  });
  const telas = p.faixas ?? faixasDaMedida(p.camera, p.duracao, 1);
  // A DEMONSTRAÇÃO PELA FALA (02/10): o que a fala aponta com força ("vou
  // mostrar", "está vendo", "olha") não leva inserção já no roteiro. A
  // confirmação pela imagem (as frases fracas, "aqui", "ali") vem no preparo
  // da montagem, com os quadros da gravação (`guardasDoCompleto`).
  const pelaFala = tirarCoberturaDaDemonstracao(ajustado.plano, p.palavras, p.duracao, juntarDemonstracao(demonstracaoNaFala(p.palavras), null, p.duracao));
  // POUCAS PALAVRAS NA TELA (02/10).
  const texto = limitarTextoNaTela(pelaFala.plano, p.palavras, p.duracao, textoNaTelaDoCompleto(curto));
  // O ritmo só com MOVIMENTO (02/10): até aqui o completo curto ganhava uma
  // palavra em destaque em cada janela vazia de 5 s, "uma a cada frase".
  const ritmo = garantirRitmo(texto.plano, p.palavras, p.duracao, {
    janelaSeg: curto ? JANELA_DO_CURTO_SEG : JANELA_DO_LONGO_SEG,
    familia: p.familia,
    comElementos: false,
    emTela: (a, b) => telas.some((f) => a < f.ate && b > f.de),
  });
  // A cena que o ritmo partiu ou mexeu dentro da tela continua tratada como tela.
  const plano2 = { ...ritmo.plano, cenas: ritmo.plano.cenas.map((c) => (c.tela ? paraTela(c, c.tela, Boolean(c.tela.linhas), "tela compartilhada") : c)) };
  return {
    plano: plano2,
    avisos: [
      ...ajustado.avisos,
      ...pelaFala.decisoes.map((d) => `cena ${d.cena + 1}: ${d.motivo}`),
      ...texto.decisoes.map((d) => `cena ${d.cena + 1}: ${d.motivo}`),
      ...(ritmo.adicionados ? [`ritmo: ${ritmo.adicionados} movimento(s) nas janelas vazias`] : []),
    ],
    ritmo: ritmo.adicionados,
  };
}

/** Teto de texto na tela do completo (02/10): 3 por minuto no curto, 2 no longo, 10 s entre dois. */
export function textoNaTelaDoCompleto(curto: boolean): { porMinuto: number; espacoSeg: number } {
  return { porMinuto: curto ? 3 : 2, espacoSeg: 10 };
}

/** Fração do tempo com inserção (cena que não é narrador cheio puro). */
export function coberturaDoPlano(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number): number {
  const s = plano.cenas
    .filter((c) => c.layout !== "narrador-cheio" || c.elementos.length > 0)
    .reduce((acc, c) => {
      const t = intervaloDaCena(c, palavras, duracao);
      return acc + (t.fim - t.inicio);
    }, 0);
  return duracao ? +(s / duracao).toFixed(3) : 0;
}

/**
 * A geometria do completo: a mesma `resolverMontagem` do corte, com UMA
 * diferença no narrador cheio. No corte o cheio é um recorte em volta do
 * rosto (o quadro 9:16 sai de dentro do 16:9); no completo o cheio é o quadro
 * INTEIRO da base, senão a janela do Remotion mostraria o narrador ampliado e
 * a base ao lado não, e a emenda pularia. O elemento de cena cheia que caiu
 * em cima do rosto (a conta foi feita com o recorte ampliado) sai.
 *
 * O formato vem da BASE (`ctx.fonte`), e não do plano (30/09): o plano do
 * roteiro é feito antes de se saber se a gravação é em pé e chega marcado
 * 16:9. Em pé vale a GEOMETRIA "9:16" dos cortes (canto, foto, B-roll e
 * cartela verticais), com o cheio no quadro inteiro também: a faixa livre de
 * 20% no topo do cheio vertical dos cortes não existe na base, e a janela que
 * a tivesse encolheria a pessoa só durante a inserção.
 */
export function resolverMontagemDoCompleto(plano: PlanoDeMontagem, ctx: ContextoDaResolucao): { montagem: MontagemResolvida; avisos: string[] } {
  const r = resolverMontagem({ ...plano, formato: formatoDoCompleto(ctx.fonte) }, ctx);
  const m = r.montagem;
  const rosto = { x: ctx.rosto.x * m.largura, y: ctx.rosto.y * m.altura, w: ctx.rosto.w * m.largura, h: ctx.rosto.h * m.altura };
  const folga = { x: rosto.x - rosto.w * 0.25, y: rosto.y - rosto.h * 0.2, w: rosto.w * 1.5, h: rosto.h * 1.4 };
  const cruza = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const avisos = [...r.avisos];
  const emPx = (b: { x: number; y: number; w: number; h: number }): Retangulo => ({ x: b.x * m.largura, y: b.y * m.altura, w: b.w * m.largura, h: b.h * m.altura });
  m.cenas = m.cenas.map((c, i) => {
    if (c.layout !== "narrador-cheio" || !c.narrador || c.narrador.modo !== "video") return c;
    // TELA COMPARTILHADA (01/10): o rosto a proteger é a webcam do canto, e a
    // região que importa também não leva texto por cima; o foco e o zoom vão
    // para a região (o ffmpeg da base faz o zoom fundo, até 1,8x).
    const tela = plano.cenas[i]?.tela;
    if (tela) {
      const webcam = webcamComFolga(tela.narrador);
      const proibidas = [webcam ? emPx(webcam) : null, tela.regiao ? emPx(tela.regiao) : null].filter((x): x is Retangulo => Boolean(x));
      const elementos = c.elementos.filter((e) => !proibidas.some((p) => cruza(e.caixa, p)));
      if (elementos.length < c.elementos.length) avisos.push(`cena ${i + 1}: chamada sobre a webcam ou sobre a região da tela; saiu`);
      // A janela do zoom contém as linhas de texto MEDIDAS no print, com
      // margem (`janelaDoZoomNaTela`): nenhuma linha cortada no meio. A webcam
      // vai junto em pixels, e o worker a cola de volta depois do zoom.
      const janela = janelaDoZoomNaTela(tela.linhas);
      const alvo = janela ? emPx(janela.caixa) : null;
      const centro = alvo ? { x: (alvo.x + alvo.w / 2) / m.largura, y: (alvo.y + alvo.h / 2) / m.altura } : { x: 0.5, y: 0.5 };
      return {
        ...c,
        narrador: { ...c.narrador, caixa: { x: 0, y: 0, w: m.largura, h: m.altura }, recorte: { x: 0, y: 0, w: ctx.fonte.largura, h: ctx.fonte.altura }, origemDoZoom: centro },
        foco: { x: Math.round(centro.x * m.largura), y: Math.round(centro.y * m.altura) },
        elementos,
        tela:
          alvo && janela && c.movimento !== "estatico"
            ? {
                regiao: { x: Math.round(alvo.x), y: Math.round(alvo.y), w: Math.round(alvo.w), h: Math.round(alvo.h) },
                zoom: janela.zoom,
                webcam: webcam ? (({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }))(emPx(webcam)) : null,
                // O POPUP (01/10): nos estilos limpos (keynote, lousa, telejornal)
                // e quando o zoom possível é pequeno demais para ajudar a ler, o
                // trecho salta para a frente ampliado num cartão, e o resto da
                // tela fica escurecido; nos outros, o zoom de antes. O contorno
                // de destaque é sempre na cor da marca.
                modo: modoDaTela(ctx.estiloId, janela.zoom),
                destaque: ctx.marca.acento,
              }
            : null,
        // Sem janela que caiba, o movimento sai: o zoom de 10% em volta do centro cortaria as bordas.
        movimento: alvo ? c.movimento : "estatico",
      };
    }
    const centro = { x: (rosto.x + rosto.w / 2) / m.largura, y: (rosto.y + rosto.h / 2) / m.altura };
    const elementos = c.elementos.filter((e) => !cruza(e.caixa, folga));
    if (elementos.length < c.elementos.length) avisos.push(`cena ${i + 1}: elemento sobre o rosto no quadro inteiro; saiu`);
    return {
      ...c,
      narrador: { ...c.narrador, caixa: { x: 0, y: 0, w: m.largura, h: m.altura }, recorte: { x: 0, y: 0, w: ctx.fonte.largura, h: ctx.fonte.altura }, origemDoZoom: centro },
      foco: { x: Math.round(centro.x * m.largura), y: Math.round(centro.y * m.altura) },
      elementos,
    };
  });
  return { montagem: m, avisos };
}

/** Zoom na tela inteira ou popup do trecho (01/10), pelo estilo e pelo zoom possível. */
export function modoDaTela(estiloId: string | null | undefined, zoom: number): "zoom" | "popup" {
  const kit = estiloId ? bibliaDoEstilo(estiloId).kitFuturo : null;
  if (kit === "keynote" || kit === "lousa" || kit === "emissora") return "popup";
  return zoom < 1.3 ? "popup" : "zoom";
}

/** O nome antigo (só deitado), mantido para os scripts de prova de 30/09 que o importam. */
export const resolverMontagemPaisagem = resolverMontagemDoCompleto;

// ─────────────────────────────── IO: fala e análise ───────────────────────────────

/**
 * Transcreve o completo pela URL (modo URL da Deepgram: ela mesma baixa o
 * arquivo público, nada atravessa a função). Os parâmetros são os mesmos de
 * lib/media/transcribe.ts (nova-3 multi, sem smart_format; lá está o porquê
 * de cada um), e a resposta passa pelo mesmo `interpretarResposta`.
 */
export async function transcreverCompleto(url: string, termos: string | null, ctx: ContextoMidia): Promise<{ palavras: PalavraNoCorte[]; duracao: number }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY não configurada");
  // mip_opt_out: fora do treino da Deepgram (02/10), ver lib/media/transcribe.ts.
  const params = new URLSearchParams({ mip_opt_out: "true", model: "nova-3", language: "multi", punctuate: "true", smart_format: "false", paragraphs: "true", utterances: "true" });
  for (const t of parseTermos(termos).slice(0, MAX_KEYTERMS)) params.append("keyterm", t);
  const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) {
    const corpoDoErro = await r.text().catch(() => "");
    await conferirResposta("deepgram", { status: r.status, corpo: corpoDoErro }, "transcrição do vídeo completo");
    throw new Error(`Deepgram respondeu ${r.status}: ${corpoDoErro.slice(0, 200)}`);
  }
  const resultado = interpretarResposta((await r.json()) as Parameters<typeof interpretarResposta>[0], "multi");
  recordTranscricao("nova-3-multi", resultado.durationSec, ctx);
  const palavras: Word[] = aplicarTermos(resultado.words, parseTermos(termos));
  return {
    palavras: palavras.map((w) => ({ texto: w.word, inicio: +w.start.toFixed(3), fim: +Math.max(w.start + 0.05, w.end).toFixed(3) })),
    duracao: resultado.durationSec,
  };
}

function urlDoWorker(): string {
  const w = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
  if (!w) throw new Error("VIDEO_WORKER_URL não configurado");
  return w;
}

/** Câmera ou tela, no worker (decodifica só os quadros-chave; ~1 min com o download). */
export async function analisarNoWorker(completoUrl: string): Promise<AnaliseDoCompleto> {
  const corpo = JSON.stringify({ completoUrl });
  const r = await fetch(`${urlDoWorker()}/analisar-completo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
    body: corpo,
    signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new Error(`worker recusou a análise (HTTP ${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return (await r.json()) as AnaliseDoCompleto;
}

// ─────────────────────────────── o banco ───────────────────────────────

/**
 * Grava o estado SÓ se o lido ainda é o mesmo (estado e `desde`): duas
 * passadas do cron sobrepostas não dirigem nem montam o mesmo completo duas
 * vezes. SQL cru porque a coluna é nova e o cliente do Prisma pode estar
 * gerado sem ela (mesmo motivo do jsonb dos cortes).
 */
async function trocarEstado(videoJobId: string, lido: MontagemDoCompleto | null, novo: MontagemDoCompleto): Promise<boolean> {
  const json = JSON.stringify(novo);
  const n = await prisma.$executeRaw`
    UPDATE video_jobs SET "completoMontagem" = ${json}::jsonb
    WHERE id = ${videoJobId}
      AND COALESCE("completoMontagem" ->> 'estado', '') = ${lido?.estado ?? ""}
      AND COALESCE("completoMontagem" ->> 'desde', '') = ${lido?.desde ?? ""}`;
  // O card do vídeo completo mostra o estado (30/09): enquanto a edição roda,
  // a peça fica "em construção" no quadro, e não com a versão crua como pronta.
  if (n > 0) {
    // O card leva também `desde`, o motivo e a marca de falha técnica (01/10,
    // parte 240): só com o estado, o card do completo que desistiu dizia
    // "Corte sem a edição completa" sem explicar nem oferecer saída.
    const espelho = JSON.stringify({ estado: novo.estado, desde: novo.desde, motivo: novo.motivo ?? null, falhaTecnica: Boolean(novo.falhaTecnica) });
    await prisma.$executeRaw`
      UPDATE campaign_cards SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('montagem', ${espelho}::jsonb)
      WHERE metadata ->> 'videoJobId' = ${videoJobId} AND (metadata ->> 'completo')::boolean IS TRUE`.catch(() => 0);
    // A DESISTÊNCIA POR ERRO TÉCNICO avisa os admins, uma vez por desistência
    // (a troca para "sem-montagem" só acontece uma vez por rodada).
    if (novo.estado === "sem-montagem" && novo.falhaTecnica && lido?.estado !== "sem-montagem") {
      await avisarAdminsDaMontagem({ videoJobId, alvo: "completo", motivo: novo.motivo ?? "sem detalhe" }).catch((e) =>
        console.error(`[montagem-do-completo][${videoJobId}] aviso aos admins falhou:`, e)
      );
      // A DEVOLUÇÃO (02/10): a montagem não foi entregue por erro nosso.
      await estornarEdicaoNaoEntregue({
        videoId: videoJobId,
        alvo: "completo",
        motivo: novo.motivo ?? "a montagem de efeitos falhou",
        comAbertura: Boolean(novo.roteiro?.abertura && aberturaAtiva(novo.roteiro.abertura)),
      }).catch((e) => console.error(`[montagem-do-completo][${videoJobId}] devolução falhou:`, e));
    }
  }
  return n > 0;
}

type VideoDoCompleto = {
  id: string;
  projectId: string;
  completoUrl: string | null;
  completoBytes: bigint | null;
  clips: unknown;
  completoMontagem: MontagemDoCompleto | null;
  niche: string | null;
  colorPalette: string | null;
  logoUrl: string | null;
  videoEstiloEscolha: unknown;
  videoStyle: string | null;
  videoTerms: string | null;
  videoMusicUrl?: string | null;
};

async function lerVideo(id: string): Promise<VideoDoCompleto | null> {
  const linhas = await prisma.$queryRaw<VideoDoCompleto[]>`
    SELECT v.id, v."projectId", v."completoUrl", v."completoBytes", v.clips, v."completoMontagem",
           p.niche, p."colorPalette", p."logoUrl", p."videoEstiloEscolha", p."videoStyle", p."videoTerms", p."videoMusicUrl"
    FROM video_jobs v JOIN projects p ON p.id = v."projectId"
    WHERE v.id = ${id}`;
  return linhas[0] ?? null;
}

type TrechoComMidia = {
  titulo?: string;
  motivo?: string;
  midia?: { recorte?: { rosto?: Retangulo } | null; enquadramento?: { pessoa?: Retangulo | null; cena?: string } | null } | null;
};

/** Rosto e pessoa da gravação (fração), do primeiro corte filmado em câmera. */
export function geometriaDaPessoa(clips: unknown): { rosto: Retangulo; pessoa: Retangulo } {
  const trechos = (Array.isArray(clips) ? clips : []) as TrechoComMidia[];
  const t = trechos.find((x) => x?.midia?.recorte?.rosto && x.midia.enquadramento?.cena !== "tela") ?? trechos.find((x) => x?.midia?.recorte?.rosto);
  const pessoa = t?.midia?.enquadramento?.pessoa ?? { x: 0.2, y: 0, w: 0.6, h: 1 };
  const rosto = t?.midia?.recorte?.rosto ?? { x: pessoa.x + pessoa.w * 0.3, y: pessoa.y + 0.1, w: pessoa.w * 0.4, h: 0.3 };
  return { rosto, pessoa };
}

/**
 * Rosto e pessoa NO QUADRO DA MONTAGEM (01/10, parte 240). Na base enquadrada
 * (gêmeo 1:1 dentro do vertical), as frações medidas nos cortes valem para a
 * gravação original, e o quadro agora tem faixas em volta: sem levar a caixa
 * para dentro do quadro, o diretor, a legenda e o zoom mirariam fora do rosto.
 */
export function geometriaNoQuadro(clips: unknown, analise?: Pick<AnaliseDoCompleto, "enquadramento"> | null): { rosto: Retangulo; pessoa: Retangulo } {
  const g = geometriaDaPessoa(clips);
  const e = analise?.enquadramento;
  return e ? { rosto: noQuadroEnquadrado(g.rosto, e), pessoa: noQuadroEnquadrado(g.pessoa, e) } : g;
}

/** O resumo que todo bloco recebe: os títulos dos cortes do vídeo. */
export function resumoDoVideo(clips: unknown): string {
  const trechos = (Array.isArray(clips) ? clips : []) as TrechoComMidia[];
  return trechos
    .map((t) => t?.titulo)
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");
}

// ─────────────────────────────── 1. marcar ───────────────────────────────

/**
 * Chamado quando um completo NOVO chega (cortar-callback). Só marca. Não
 * marca de novo a mesma base, nem a própria edição (que vira `completoUrl`).
 */
export async function marcarCompletoNaFila(videoJobId: string, opcoes: { forcar?: boolean } = {}): Promise<boolean> {
  if (!montagemDoCompletoLigada() && !opcoes.forcar) return false;
  const v = await lerVideo(videoJobId);
  if (!v?.completoUrl) return false;
  const m = v.completoMontagem;
  if (m?.montadoUrl && v.completoUrl === m.montadoUrl && !opcoes.forcar) return false;
  // A base de uma refeita nunca é um editado (06/10): do original gravado, ou
  // da base da primeira montagem, nunca do arquivo com peças desenhadas.
  const semEditado = (url: string | null | undefined) => (url && !/completo-editado-/.test(url) ? url : null);
  const base =
    m?.montadoUrl && v.completoUrl === m.montadoUrl
      ? semEditado(m.completoOriginal?.url) ?? semEditado(m.baseUrl) ?? m.completoOriginal?.url ?? m.baseUrl ?? v.completoUrl
      : v.completoUrl;
  const origem = hashCurto(base);
  if (!opcoes.forcar && m && m.origem === origem) return false;
  // O roteiro aprovado viaja junto: é dele que sai o plano (sem diretor de novo).
  // O ORIGINAL TAMBÉM (06/10, tarde): a passada 3 da refeita do Fé & Gestão
  // saiu com completoOriginal null porque o estado novo não o carregava; a
  // entrega então dependia de o completoUrl da hora ainda ser o original.
  return trocarEstado(videoJobId, m ?? null, {
    estado: "na-fila",
    desde: agora(),
    origem,
    baseUrl: base,
    ...(m?.roteiro ? { roteiro: m.roteiro } : {}),
    completoOriginal: originalDaBase(base, m?.completoOriginal ?? null, v.completoUrl, v.completoBytes),
  });
}

/**
 * O original que acompanha a base da fila: o gravado, quando é a mesma base;
 * senão a própria base, se não for um editado (com o tamanho quando é o
 * completoUrl de agora). Um editado nunca vira original. Puro, para a prova.
 */
export function originalDaBase(
  base: string,
  gravado: { url: string; bytes: number | null } | null,
  completoUrl: string | null,
  completoBytes: bigint | number | null | undefined
): { url: string; bytes: number | null } | null {
  const editado = (url: string | null | undefined) => Boolean(url && /completo-editado-/.test(url));
  if (gravado && gravado.url === base && !editado(gravado.url)) return gravado;
  if (editado(base)) return gravado && !editado(gravado.url) ? gravado : null;
  return { url: base, bytes: base === completoUrl && completoBytes != null ? Number(completoBytes) : null };
}

/** Recomeça do zero (o plano e as imagens saem de novo; imagem igual é reaproveitada pelo hash). */
export async function refazerMontagemDoCompleto(videoJobId: string): Promise<boolean> {
  return marcarCompletoNaFila(videoJobId, { forcar: true });
}

// ─────────────────────────────── 2. os passos ───────────────────────────────

function contextoVisual(v: VideoDoCompleto) {
  const escolha = normalizarEscolha(v.videoEstiloEscolha, v.videoStyle);
  const familia = familiaDaLinguagem(escolha.estiloId);
  // A legenda escolhida (30/09), lida na hora do pedido ao worker: "sem" vai
  // com a lista de páginas vazia e o acabamento não queima nada.
  return { escolha, familia, marca: coresDaMarca(v.colorPalette), legenda: legendaDecidida(escolha.legenda, familia) };
}

/** na-fila -> preparando -> dirigindo: a fala do completo e a análise câmera/tela. */
async function preparar(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, estado: "preparando", desde: agora() };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const base = lido.baseUrl ?? v.completoUrl!;
    // A LEITURA DO VÍDEO (06/10, lib/media/leitura-do-video.ts): a medição no
    // worker corre junto da transcrição e da análise; a visão vem depois, com
    // a fala pronta. Falha de leitura nunca derruba a montagem: vira aviso.
    // Nova tentativa do passo (ou refeita) com a leitura já gravada: ela vale
    // (o vídeo é o mesmo) e a visão não é paga de novo.
    const avisosDaLeitura: string[] = [];
    const leituraGuardada = lido.leitura?.versao === 1 ? lido.leitura : null;
    // A JORNADA (E5): a leitura com visão já foi feita antes do plano; aqui só a medição do arquivo (rosto e corpo), sem visão paga.
    const naJornada = editorJornadaLigado() && Boolean(lido.roteiro?.jornada?.aprovado);
    const [fala, medida, medicao] = await Promise.all([
      transcreverCompleto(base, v.videoTerms, { projectId: v.projectId, operation: "montagem-completo-fala" }),
      analisarNoWorker(base),
      leituraGuardada && !naJornada
        ? Promise.resolve<RespostaDaMedicao>({ medida: null, proxyUrl: null })
        : medirNoWorker(base, { proxy: !naJornada && leituraVisaoLigada() }).catch((e: unknown): RespostaDaMedicao => {
            avisosDaLeitura.push(`leitura: medição no worker falhou (${e instanceof Error ? e.message : String(e)})`);
            return { medida: null, proxyUrl: null };
          }),
    ]);
    // GRAVAÇÃO EM PÉ (celular): o completo dela sai EM PÉ, 9:16, do jeito que
    // foi gravado (worker/src/ffmpeg.mjs, prepararCompleto). Até 30/09 ela
    // parava aqui em "sem-montagem", porque a montagem era toda 16:9 e janela
    // deitada intercalada com base em pé quebraria o vídeo. Agora a montagem
    // segue o formato da base (`formatoDoCompleto`): o plano vai marcado 9:16
    // (as cenas da Higgsfield saem verticais), a geometria é a dos cortes
    // verticais (`resolverMontagemDoCompleto`) e o worker desenha as janelas
    // em 1080x1920. A tela compartilhada não existe no celular
    // (`analiseDaMontagem`).
    // QUADRO FORA DO PADRÃO (01/10, parte 240): o gêmeo digital (1080x1080) e
    // o celular que grava 4:3 ou 19,5:9 entram num quadro padrão com o fundo
    // desfocado (lib/media/enquadramento-do-completo.ts), e a montagem segue
    // a desse quadro: o quadrado vira vertical 1080x1920, com abertura e
    // efeitos. Até aqui eles paravam em "sem-montagem" e nunca tinham efeito.
    const enquadramento = enquadramentoDaBase(medida);
    const analise = analiseDaMontagem(
      enquadramento ? { ...medida, largura: enquadramento.largura, altura: enquadramento.altura, enquadramento } : medida
    );
    const formato = formatoDoCompleto(analise);
    // Defesa: com o enquadramento, o quadro sempre é um dos dois padrões. Se
    // algum dia não for, parar aqui evita pagar diretor e imagens para nada.
    const alvo = formato === "9:16" ? 9 / 16 : 16 / 9;
    if (analise.largura && analise.altura && Math.abs(analise.largura / analise.altura / alvo - 1) > 0.03) {
      await trocarEstado(v.id, tomado, {
        ...tomado,
        estado: "sem-montagem",
        desde: agora(),
        analise,
        motivo: `O quadro da gravação (${analise.largura}x${analise.altura}) não é 16:9 nem 9:16: o vídeo completo sai com a edição de fala, sem a montagem de efeitos.`,
      });
      return;
    }
    const blocos = blocosDaFala(fala.palavras, analise.duracao || fala.duracao);
    const falaDoCompleto = { palavras: fala.palavras, duracao: analise.duracao || fala.duracao };
    // A leitura só depois da defesa do formato acima: vídeo que para em
    // "sem-montagem" não paga visão. Sem visão disponível, sai só da medição.
    const leitura: LeituraDoVideo | null = naJornada
      ? lido.roteiro?.jornada?.leitura ?? null
      : leituraGuardada ??
      (await lerVideoParaLeitura({
        url: base,
        fala: falaDoCompleto,
        projectId: v.projectId,
        duracao: falaDoCompleto.duracao,
        medicao,
        avisos: avisosDaLeitura,
      }).catch((e: unknown) => {
        avisosDaLeitura.push(`leitura: falhou (${e instanceof Error ? e.message : String(e)})`);
        return null;
      }));
    if (avisosDaLeitura.length) console.warn(`[montagem-do-completo][${v.id}] ${avisosDaLeitura.join("; ")}`);
    // O EDITOR SOB MEDIDA (03/10): com o interruptor ligado e o estilo com
    // referência, o completo vai para o editor (passo "dirigindo" com
    // `sobMedida`), e não para o plano por cenas. Se o caminho novo já
    // desistiu neste vídeo, segue a esteira de sempre (a reserva).
    const estiloDoVideo = contextoVisual(v).escolha.estiloId;
    // O ROTEADOR (E0 da jornada): o único ponto que escolhe a esteira do completo.
    const esteira = esteiraDoCompleto({ porComando: editorPorComandoLigado(), sobMedida: editorSobMedidaLigado(estiloDoVideo) });
    // A JORNADA OFICIAL (E5): o plano aprovado (congelado) vai aos passos 6 e 7; nenhum caminho antigo entra.
    if (esteira === "jornada") {
      if (!naJornada) {
        await trocarEstado(v.id, tomado, { ...tomado, estado: "sem-montagem", desde: agora(), fala: falaDoCompleto, analise, motivo: "Este vídeo foi aprovado sem o plano da jornada do editor: o completo segue com a fala editada." });
        return;
      }
      await trocarEstado(v.id, tomado, {
        ...tomado,
        estado: "dirigindo",
        desde: agora(),
        fala: falaDoCompleto,
        analise,
        blocos,
        abertura: null,
        leitura,
        motivo: null,
        jornada: { fase: "gerar", amostras: amostrasNoTempoEditado(medicao.medida, null) },
      });
      return;
    }
    if ((esteira === "por-comando" || esteira === "sob-medida") && !lido.sobMedida?.desistiu) {
      const falaAprovada = lido.roteiro?.completo?.fala?.palavras;
      const aberturaSm = falaAprovada?.length ? aberturaNaBase(lido.roteiro, falaAprovada, falaDoCompleto.palavras) : null;
      const frases = frasesNumeradas(falaDoCompleto.palavras);
      await trocarEstado(v.id, tomado, {
        ...tomado,
        estado: "dirigindo",
        desde: agora(),
        fala: falaDoCompleto,
        analise,
        blocos,
        abertura: aberturaSm,
        leitura,
        motivo: null,
        sobMedida: {
          fase: "editar",
          estiloId: estiloDoVideo,
          blocos: blocosDoEditor(frases, falaDoCompleto.duracao),
          rodada: 0,
          historico: [],
          ...(avisosDaLeitura.length ? { avisos: avisosDaLeitura.slice(0, 10) } : {}),
        },
      });
      return;
    }
    // O PLANO APROVADO NA TELA DE ROTEIRO (30/09): o diretor já foi pago antes
    // da aprovação, e o cliente ajustou cena por cena. Aqui ele só é levado
    // para a fala transcrita do arquivo (alinhamento por sequência, em
    // lib/media/roteiro-em-texto.ts) e passa pelos consertos do completo que
    // dependem da análise (tela compartilhada). Os tetos de imagem e cinema
    // ficam no que o cliente aprovou: cortar aqui apagaria o que ele pediu.
    // `replanejar` (script de admin, 01/10): o plano aprovado fica de lado e o
    // diretor planeja de novo com as regras de hoje; a abertura aprovada vale.
    const aprovado = lido.roteiro?.aprovadoEm && !lido.replanejar ? lido.roteiro.completo : null;
    if (aprovado?.plano && aprovado.fala.palavras.length) {
      // O roteiro planeja antes de saber a orientação da gravação e marca 16:9;
      // o formato certo é o da base.
      const remapeado = { ...remapearPlano(aprovado.plano, aprovado.fala.palavras, falaDoCompleto.palavras), formato };
      const ajustado = ajustarPlanoDoCompleto(remapeado, {
        palavras: falaDoCompleto.palavras,
        duracao: falaDoCompleto.duracao,
        camera: analise.trechosDeCamera,
        cenasDeCinema: remapeado.assets.filter((a) => ASSETS_EM_VIDEO.includes(a.tipo)).length,
        imagens: remapeado.assets.length,
        cobertura: 1,
      });
      // A abertura aprovada (01/10) vai para o tempo da base pelo mesmo
      // alinhamento por sequência do plano.
      const abertura = aberturaNaBase(lido.roteiro, aprovado.fala.palavras, falaDoCompleto.palavras);
      // AS GUARDAS DE 02/10 valem também sobre o plano aprovado: nada cobre a
      // demonstração (fala e imagem), cotas menores e pouco texto. Só tiram
      // inserção (nada novo é gerado nem cobrado), antes de pagar as imagens.
      const guardado = await guardasDoCompleto({
        plano: ajustado.plano,
        palavras: falaDoCompleto.palavras,
        duracao: falaDoCompleto.duracao,
        formato,
        baseUrl: base,
        projectId: v.projectId,
      });
      await trocarEstado(v.id, tomado, {
        ...tomado,
        estado: "ilustrando",
        desde: agora(),
        fala: falaDoCompleto,
        analise,
        blocos,
        plano: guardado.plano,
        abertura,
        leitura,
        guardas: guardado.resumo,
        resumo: {
          cobertura: coberturaDoPlano(guardado.plano, falaDoCompleto.palavras, falaDoCompleto.duracao),
          avisos: [...avisosDaLeitura, ...ajustado.avisos, ...guardado.avisos].slice(0, 30),
          doRoteiro: true,
          abertura: abertura ? `${abertura.length} momentos, ${abertura.reduce((s, m) => s + m.fim - m.inicio, 0).toFixed(1)} s` : null,
        },
        motivo: null,
      });
      return;
    }
    // A abertura aprovada no roteiro também vale quando o diretor planeja aqui
    // (sem roteiro aprovado, ou `replanejar`): ela viaja no estado até o worker.
    const fala0 = lido.roteiro?.completo?.fala?.palavras;
    const abertura = fala0?.length ? aberturaNaBase(lido.roteiro, fala0, falaDoCompleto.palavras) : null;
    await trocarEstado(v.id, tomado, {
      ...tomado,
      estado: "dirigindo",
      desde: agora(),
      fala: falaDoCompleto,
      analise,
      blocos,
      abertura,
      leitura,
      motivo: null,
      ...(avisosDaLeitura.length ? { resumo: { ...(tomado.resumo ?? {}), avisos: avisosDaLeitura.slice(0, 10) } } : {}),
    });
  } catch (e) {
    await falhouNoPasso(v.id, lido, tomado, e, "preparar o completo");
  }
}

/**
 * AS GUARDAS DO COMPLETO COM A IMAGEM (02/10), lib/media/guardas-do-completo.ts:
 *   1. a DEMONSTRAÇÃO: a fala que aponta, confirmada por quadros da gravação
 *      classificados com visão (lib/media/demonstracao.ts); nada cobre esses
 *      trechos, e a gravação que é majoritariamente demonstração fica com
 *      quase nenhuma inserção;
 *   2. as COTAS por minuto (menores desde 02/10, ritmo-da-edicao.ts), também
 *      sobre o plano aprovado;
 *   3. POUCO TEXTO na tela.
 * Só TIRA inserção. Falha da visão vira só a fala (o aviso fica no resumo).
 */
export async function guardasDoCompleto(p: {
  plano: PlanoDeMontagem;
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  baseUrl: string;
  projectId?: string | null;
  /** Os quadros da gravação: pelo worker na esteira; da cópia local na prova. */
  obterQuadros?: ObterQuadros;
}): Promise<{ plano: PlanoDeMontagem; avisos: string[]; resumo: ResumoDasGuardas }> {
  const demonstracao = await detectarDemonstracao({
    plano: p.plano,
    palavras: p.palavras,
    duracao: p.duracao,
    obterQuadros: p.obterQuadros ?? quadrosPeloWorker(p.baseUrl),
    projectId: p.projectId,
  });
  const semDemo = tirarCoberturaDaDemonstracao(p.plano, p.palavras, p.duracao, demonstracao);
  const sustenta = semInsercaoQueNaoSeSustenta(semDemo.plano, p.palavras, p.duracao);
  const comCotas = ajustarPlanoDoCompleto(sustenta.plano, {
    palavras: p.palavras,
    duracao: p.duracao,
    camera: [{ de: 0, ate: p.duracao }],
    cenasDeCinema: 99,
    imagens: 999,
    cotas: cotasDoCompleto(p.duracao, p.formato),
  });
  const texto = limitarTextoNaTela(comCotas.plano, p.palavras, p.duracao, textoNaTelaDoCompleto(completoEhCurto(p.duracao, p.formato)));
  const decisoes = [...semDemo.decisoes, ...sustenta.decisoes, ...texto.decisoes];
  return {
    plano: texto.plano,
    avisos: [
      ...(demonstracao.erro ? [`demonstração sem a imagem (${demonstracao.erro}); valeu só a fala`] : []),
      ...decisoes.map((d) => `cena ${d.cena + 1}: ${d.motivo}`),
      ...comCotas.avisos,
    ],
    resumo: { demonstracao, decisoes, insercoes: insercoesDoPlano(texto.plano, p.palavras, p.duracao) },
  };
}

export type ResumoDasGuardas = {
  demonstracao: Demonstracao & { erro?: string };
  decisoes: DecisaoDaGuarda[];
  insercoes: ReturnType<typeof insercoesDoPlano>;
};

/** As palavras `alvo` em sequência na fala `palavras` (sem acento nem pontuação), na ocorrência mais perto de `perto` segundos. */
export function acharFrase(palavras: PalavraNoCorte[], alvo: PalavraNoCorte[], perto: number): { de: number; ate: number } | null {
  const n = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
  const quer = alvo.map((w) => n(w.texto)).filter(Boolean);
  if (quer.length < 2) return null;
  const tem = palavras.map((w) => n(w.texto));
  let melhor: { de: number; ate: number; d: number } | null = null;
  for (let i = 0; i + quer.length <= tem.length; i++) {
    if (quer.every((q, k) => tem[i + k] === q)) {
      const d = Math.abs(palavras[i].inicio - perto);
      if (!melhor || d < melhor.d) melhor = { de: i, ate: i + quer.length - 1, d };
    }
  }
  return melhor && melhor.d < 20 ? { de: melhor.de, ate: melhor.ate } : null;
}

/**
 * A abertura aprovada no roteiro, no tempo da BASE (01/10). Os índices de
 * palavra do roteiro vão para a fala transcrita do arquivo pelo alinhamento
 * por sequência; momento cujo alinhamento quebrou (esticou mais de 3 palavras,
 * ou saiu com menos de 0,6 s ou mais de 4,5 s) fica de fora, para nenhuma
 * frase sair cortada. As bordas caem no silêncio, palavra inteira.
 */
export function aberturaNaBase(
  r: RoteiroDoVideo | undefined | null,
  antigas: PalavraNoCorte[],
  novas: PalavraNoCorte[]
): Array<{ inicio: number; fim: number; soco: string }> | null {
  const a = r?.abertura;
  if (!a || !aberturaAtiva(a) || !novas.length) return null;
  const mapa = mapaDePalavras(antigas, novas);
  const saida: Array<{ inicio: number; fim: number; soco: string }> = [];
  for (const m of a.momentos) {
    // A FRASE APROVADA PELO TEXTO, antes do alinhamento (02/10): no completo
    // cmuqc9r7z o mapa por sequência deslocou o primeiro momento 6 palavras
    // ("usa o barco como plataforma de pregação." saiu "pregação. Então, você
    // pode usar o seu"). Achar as mesmas palavras na fala nova, na ocorrência
    // mais perto do tempo aprovado, é exato; o mapa fica de reserva.
    const pelaFrase = acharFrase(novas, antigas.slice(m.de, m.ate + 1), antigas[m.de]?.inicio ?? 0);
    const de0 = pelaFrase?.de ?? mapa[m.de];
    const ate0 = pelaFrase?.ate ?? mapa[m.ate];
    if (de0 === undefined || ate0 === undefined || ate0 < de0 || ate0 - de0 > m.ate - m.de + 3) continue;
    // FRASE INTEIRA (02/10): o momento aprovado antes da regra nova (o soco
    // aparado) vira a frase que o contém; se ela não cabe ou não fecha, sai.
    const frase = ajustarMomento(novas, de0, ate0, REGRAS_DA_ABERTURA.momentoMin, REGRAS_DA_ABERTURA.momentoMax);
    if (!frase) continue;
    const { de, ate } = frase;
    const b = bordasDoMomento(novas, de, ate);
    if (b.fim - b.inicio < 0.6 || b.fim - b.inicio > FRASE_MAX_SEG + 0.6) continue;
    // Dois momentos aprovados dentro da mesma frase viram um só.
    if (saida.some((x) => b.inicio < x.fim && b.fim > x.inicio)) continue;
    // Frases inteiras são mais longas que o soco: o teto da abertura inteira vale.
    if (saida.reduce((s, x) => s + x.fim - x.inicio, 0) + (b.fim - b.inicio) > REGRAS_DA_ABERTURA.totalMax) continue;
    // O soco passa de novo pela regra de sentido fechado: planos aprovados
    // antes de 01/10 à tarde traziam "DOZE MESES EM".
    saida.push({ inicio: b.inicio, fim: b.fim, soco: limparSoco(m.soco) ?? "" });
  }
  return saida.length ? saida : null;
}

/** Uma onda de blocos do diretor; com todos prontos, o plano do vídeo inteiro. */
async function dirigir(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, desde: agora(), trabalhando: true };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const fala = lido.fala!;
    const analise = analiseDaMontagem(lido.analise!);
    const formato = formatoDoCompleto(analise);
    const blocos = (lido.blocos ?? []).map((b) => ({ ...b }));
    // Com o diretor limpo (03/10) um bloco leva segundos, não minutos: a onda
    // leva todos os blocos pendentes de uma vez e o completo não espera três
    // passadas do cron. Bloco pronto nunca é refeito (`plano === undefined`).
    const porOnda = usarDiretorLimpo(v.videoEstiloEscolha, v.videoStyle) ? Math.max(BLOCOS_POR_ONDA, 10) : BLOCOS_POR_ONDA;
    const pendentes = blocos.map((b, i) => ({ b, i })).filter(({ b }) => b.plano === undefined).slice(0, porOnda);
    const { rosto, pessoa } = geometriaNoQuadro(v.clips, analise);
    const jaUsado = blocos.flatMap((b) => (b.plano ? usadoNoPlano(b.plano) : []));
    const recortes = await recortesDoProjeto(v.projectId).catch(() => []);
    const cotas = cotasDoCompleto(fala.duracao, formato);
    // As sugestões cena a cena do roteiro (05/10), no tempo desta fala: cada bloco recebe as suas.
    const pedidos = sugestoesDoCliente(lido);
    await Promise.all(
      pendentes.map(async ({ b, i }) => {
        try {
          b.plano = await dirigirBloco({
            v, bloco: b, indice: i, total: blocos.length, fala, analise, rosto, pessoa, jaUsado, recortesProntos: recortes.map((r) => r.descricao), formato, cotas, pedidos,
            // Tetos do replanejamento por script (custo combinado com o dono).
            ...(lido.tetosDoReplanejamento ? { cenasDeCinema: lido.tetosDoReplanejamento.cinema === 0 ? 0 : undefined } : {}),
          });
        } catch (e) {
          // Bloco que falhou vira narrador cheio (juntarPlanos): o vídeo sai
          // com menos edição naquele trecho, em vez de não sair.
          b.plano = null;
          b.erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
        }
      })
    );
    const faltam = blocos.some((b) => b.plano === undefined);
    if (faltam) {
      await trocarEstado(v.id, tomado, { ...tomado, blocos, desde: agora(), trabalhando: false });
      return;
    }
    const minutos = fala.duracao / 60;
    const ajustado = fecharPlanoDoCompleto(juntarPlanos(blocos, formato), {
      palavras: fala.palavras,
      duracao: fala.duracao,
      formato,
      familia: contextoVisual(v).familia,
      camera: analise.trechosDeCamera,
      cenasDeCinema: lido.tetosDoReplanejamento?.cinema ?? CENAS_DE_CINEMA_NO_COMPLETO,
      imagens:
        lido.tetosDoReplanejamento?.imagens ??
        Math.max(4, Math.round(minutos * (completoEhCurto(fala.duracao, formato) ? IMAGENS_POR_MINUTO_NO_CURTO : IMAGENS_POR_MINUTO_NO_COMPLETO))),
    });
    // As guardas de 02/10 com a imagem da gravação (a demonstração vista).
    const guardado = await guardasDoCompleto({ plano: ajustado.plano, palavras: fala.palavras, duracao: fala.duracao, formato, baseUrl: lido.baseUrl ?? v.completoUrl!, projectId: v.projectId });
    await trocarEstado(v.id, tomado, {
      ...tomado,
      estado: "ilustrando",
      desde: agora(),
      trabalhando: false,
      blocos,
      plano: guardado.plano,
      guardas: guardado.resumo,
      resumo: { cobertura: coberturaDoPlano(guardado.plano, fala.palavras, fala.duracao), avisos: [...ajustado.avisos, ...guardado.avisos].slice(0, 30), blocosSemPlano: blocos.filter((b) => !b.plano).length },
    });
  } catch (e) {
    await falhouNoPasso(v.id, lido, tomado, e, "dirigir o completo");
  }
}

/** Um bloco no diretor, com o contexto do completo. */
export async function dirigirBloco(p: {
  v: Pick<VideoDoCompleto, "id" | "projectId" | "clips" | "videoEstiloEscolha" | "videoStyle" | "colorPalette" | "niche">;
  bloco: BlocoDoCompleto;
  indice: number;
  total: number;
  fala: { palavras: PalavraNoCorte[]; duracao: number };
  analise: Pick<AnaliseDoCompleto, "trechosDeCamera">;
  rosto: Retangulo;
  pessoa: Retangulo;
  jaUsado: string[];
  recortesProntos?: string[];
  cenasDeCinema?: number;
  imagens?: number;
  /** Teto de inserções do bloco (tela de roteiro). Com `cotas`, sai delas. */
  insercoes?: number;
  /** O formato da base (gravação em pé: 9:16). Sem ele, 16:9. */
  formato?: Formato;
  /** As cotas por minuto do vídeo inteiro (01/10): o bloco recebe a agenda dele. */
  cotas?: CotaDeInsercoes[];
  /** As faixas de tela no tempo da fala do completo, com o que mostram (01/10). */
  faixas?: FaixaDeTela[];
  /** As sugestões cena a cena do cliente (05/10), no tempo da fala do completo. */
  pedidos?: PedidoDaCena[];
}): Promise<PlanoDeMontagem> {
  const formato = p.formato ?? "16:9";
  const doBloco = falaDoBloco(p.fala.palavras, p.bloco);
  const minutos = doBloco.duracao / 60;
  const curto = completoEhCurto(p.fala.duracao, formato);
  const contexto = contextoDoBloco({
    indice: p.indice,
    total: p.total,
    bloco: p.bloco,
    resumoDoVideo: resumoDoVideo(p.v.clips),
    jaUsado: p.jaUsado,
    pedidos: pedidosNoBloco(p.pedidos, p.bloco),
    tela: telaNoBloco(p.fala.palavras, p.bloco, p.analise.trechosDeCamera),
    telasComMostra: p.faixas ? telasComMostraNoBloco(p.fala.palavras, p.bloco, p.faixas) : undefined,
    imagens: p.imagens ?? Math.max(3, Math.round(minutos * (curto ? IMAGENS_POR_MINUTO_NO_CURTO : IMAGENS_POR_MINUTO_NO_COMPLETO))),
    cenasDeCinema: p.cenasDeCinema ?? Math.max(0, Math.round(CENAS_DE_CINEMA_NO_COMPLETO / Math.max(1, p.total))),
    insercoes: p.cotas ? insercoesNoTrecho(p.cotas, p.bloco.inicio, p.bloco.fim) : p.insercoes,
    agenda: p.cotas ? agendaDoBloco(p.cotas, p.bloco.inicio, p.bloco.fim) : undefined,
    curto,
    formato,
  });
  const pedido = (esforco: "medium" | "low") => dirigirMontagem({
    projectId: p.v.projectId,
    referencia: `${p.v.id}/completo/${p.indice}${esforco === "low" ? "/2a" : ""}`,
    palavras: doBloco.palavras,
    duracao: doBloco.duracao,
    formato,
    rosto: p.rosto,
    pessoa: p.pessoa,
    escolha: p.v.videoEstiloEscolha,
    videoStyle: p.v.videoStyle,
    colorPalette: p.v.colorPalette,
    nicho: p.v.niche,
    titulo: `Vídeo completo, bloco ${p.indice + 1} de ${p.total}`,
    recortesProntos: p.recortesProntos,
    contexto,
    // O diretor limpo (03/10) tira daqui a fatia do bloco na cota de cartelas,
    // e não repete a cartela que outro bloco já pôs.
    duracaoDoVideo: p.fala.duracao,
    jaUsado: p.jaUsado,
    // O validador cobra o teto do bloco, e não o piso dos cortes (30/09): sem
    // isto, cada bloco pedia uma 2a rodada ao diretor para bater o mínimo de
    // cinema dos cortes, dobrando tempo e custo. O cenário do narrador fica só
    // no primeiro bloco, uma vez no vídeo inteiro.
    modo: "completo",
    // Esforço médio (01/10): no alto, o Sonnet 5 gastava o teto pensando num
    // bloco de 3,5 min e não devolvia plano nenhum.
    esforco,
    tetos: {
      cinema: p.cenasDeCinema ?? Math.max(0, Math.round(CENAS_DE_CINEMA_NO_COMPLETO / Math.max(1, p.total))),
      cenarioDoNarrador: p.indice === 0 ? 1 : 0,
    },
  });
  // Bloco que falhou (teto de pensamento, JSON quebrado duas vezes) ganha UMA
  // nova chance em esforço baixo, antes de virar 2,5 min de narrador parado.
  try {
    return (await pedido("medium")).plano;
  } catch (e) {
    console.warn(`[completo ${p.v.id}] bloco ${p.indice + 1} falhou no esforço médio (${e instanceof Error ? e.message.slice(0, 80) : e}); tentando no baixo`);
    return (await pedido("low")).plano;
  }
}

/** ilustrando -> gerando: imagens e pedidos da Higgsfield do plano inteiro. */
async function ilustrar(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, desde: agora(), trabalhando: true };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const { escolha, familia, marca } = contextoVisual(v);
    const { pessoa } = geometriaNoQuadro(v.clips, lido.analise);
    const { assets, papelUrl } = await gerarAssetsDaMontagem(lido.plano!, {
      familia,
      marca,
      referencia: v.id,
      palavras: lido.fala!.palavras,
      duracao: lido.fala!.duracao,
      camera: escolha.camera[0] ?? null,
      cameras: escolha.camera,
      estiloId: escolha.estiloId,
      projectId: v.projectId,
      pessoa,
      ctx: { projectId: v.projectId, operation: "montagem-completo" },
      prazoDasCenasMs: 0,
    });
    await trocarEstado(v.id, tomado, { ...tomado, estado: "gerando", desde: agora(), trabalhando: false, assets, papelUrl, custoUsd: +assets.reduce((s, a) => s + a.custoEstimadoUsd, 0).toFixed(3) });
  } catch (e) {
    await falhouNoPasso(v.id, lido, tomado, e, "gerar as imagens do completo");
  }
}

/** gerando -> montando: cenas prontas (ou prazo), resolve e manda ao worker. */
async function montar(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  if (lido.esperarAte && Date.now() < new Date(lido.esperarAte).getTime()) return;
  const assets = (lido.assets ?? []).map((a) => ({ ...a }));
  const idade = Date.now() - new Date(lido.desde).getTime();
  let mudou = false;
  for (const a of assets) {
    if (!ASSETS_EM_VIDEO.includes(a.tipo) || a.url || a.origem !== "pendente" || !a.chave) continue;
    const pronto = await concluirSePronto(v.id, a.chave, { projectId: v.projectId, operation: "montagem-completo-cena" }).catch(() => null);
    if (pronto?.blobUrl) {
      a.url = pronto.blobUrl;
      a.origem = "gerado";
      mudou = true;
    } else if (["failed", "nsfw", "canceled", "cancelled"].includes(pronto?.status ?? "")) {
      a.origem = "falhou";
      mudou = true;
    }
  }
  const pendentes = assets.filter((a) => ASSETS_EM_VIDEO.includes(a.tipo) && a.origem === "pendente");
  if (pendentes.length && idade < PRAZO_DAS_CENAS_MS) {
    if (mudou) await trocarEstado(v.id, lido, { ...lido, assets });
    return;
  }
  const tomado: MontagemDoCompleto = { ...lido, assets, estado: "montando", desde: agora(), tentativas: (lido.tentativas ?? 0) + 1 };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const pronto = await conferirAntesDoRender(v, tomado);
    const corpo = corpoDaMontagem(v, pronto);
    const r = await fetch(`${urlDoWorker()}/montar-completo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo.texto) },
      body: corpo.texto,
      signal: AbortSignal.timeout(60_000),
    });
    if (r.status !== 202) throw new Error(`worker recusou a montagem do completo (HTTP ${r.status})`);
    await trocarEstado(v.id, tomado, { ...pronto, chave: corpo.chave });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falhou";
    await trocarEstado(v.id, tomado, {
      ...tomado,
      estado: tomado.tentativas! >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
      desde: agora(),
      esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
      motivo: tomado.tentativas! >= MAX_TENTATIVAS ? `Não consegui mandar a edição do completo ao worker (${erro.slice(0, 160)}).` : null,
      falhaTecnica: tomado.tentativas! >= MAX_TENTATIVAS,
    });
  }
}

/**
 * A CONFERÊNCIA DAS IMAGENS ANTES DO PRIMEIRO RENDER (02/10), uma vez por
 * plano: toda imagem e todo vídeo gerado passa pela visão contra o perfil do
 * projeto (lib/media/conferencia-da-imagem.ts) e a reprovada perde a URL (a
 * cena volta à pessoa na resolução); e o B-roll cheio de imagem menor que o
 * quadro vira canto, para nada ser ampliado. Falha aqui não segura o render.
 */
/** Os assets que o CLIENTE pediu ou reescreveu, com o texto dele (02/10), para a conferência com visão. */
export function pedidosDoCliente(plano: PlanoDeMontagem): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const a of plano.assets) if (a.comPessoas || a.doCliente) saida[a.id] = a.resumo ?? a.descricao;
  for (const c of plano.cenas) if (c.pedido && c.asset) saida[c.asset] = c.pedido.texto;
  return saida;
}

async function conferirAntesDoRender(v: VideoDoCompleto, m: MontagemDoCompleto): Promise<MontagemDoCompleto> {
  if (m.assetsConferidos || !m.assets?.length || !m.plano || !m.analise) return m;
  try {
    const perfil = await perfilDoProjeto(v.projectId).catch(() => null);
    const c = await conferirAssets(m.assets, { perfil, projectId: v.projectId, quadroDoVideo: (url) => quadrosPeloWorker(url, 512), pedidos: pedidosDoCliente(m.plano) });
    const medidas = Object.fromEntries(c.assets.map((a) => [a.id, a.conferencia]));
    const familia = contextoVisual(v).familia;
    const semAmpliar = semAmpliarImagemPequena(m.plano, medidas, { largura: m.analise.largura, altura: m.analise.altura }, VOCABULARIO[familia].layouts.includes("narrador-canto"));
    return { ...m, assets: c.assets, plano: semAmpliar.plano, assetsConferidos: { em: agora(), reprovados: c.reprovados, ...(c.erro ? { erro: c.erro } : {}) } };
  } catch (e) {
    return { ...m, assetsConferidos: { em: agora(), reprovados: [], erro: e instanceof Error ? e.message.slice(0, 160) : "falhou" } };
  }
}

/**
 * A TERCEIRA tentativa vai LEVE (01/10, parte 240): depois de duas falhas
 * técnicas, o worker monta com lotes de 30 s um de cada vez, menos fios e um
 * render do Remotion só. As duas primeiras usam os parâmetros normais, porque
 * a falha costuma ser de momento (outro trabalho disputando o contêiner). O
 * reinício do worker não conta tentativa (`concluirMontagemDoCompleto`).
 */
export function tentativaLeve(tentativas: number | undefined): boolean {
  return (tentativas ?? 1) >= MAX_TENTATIVAS;
}

/** O pedido ao worker: a montagem resolvida do vídeo inteiro e a base. */
export function corpoDaMontagem(v: VideoDoCompleto, m: MontagemDoCompleto): { texto: string; chave: string; montagem: MontagemResolvida } {
  const { familia, marca, legenda } = contextoVisual(v);
  const analise = m.analise!;
  const { rosto, pessoa } = geometriaNoQuadro(v.clips, analise);
  const { montagem } = resolverMontagemDoCompleto(m.plano!, {
    palavras: m.fala!.palavras,
    duracao: m.fala!.duracao,
    fps: Math.round(analise.fps) || 30,
    fonte: { largura: analise.largura, altura: analise.altura },
    rosto,
    pessoa,
    marca: { ...marca, logoUrl: null },
    familia,
    urls: urlsDosAssets(m.assets ?? []),
    papelUrl: m.papelUrl ?? null,
    legenda,
    // O estilo e o sound design (01/10): o Remotion e o worker leem daqui.
    estiloId: contextoVisual(v).escolha.estiloId,
  });
  // A LEGENDA NA FAIXA DE BAIXO da base enquadrada (01/10, parte 240): no
  // gêmeo 1:1 dentro do vertical, a posição dos cortes verticais punha a
  // legenda sobre o peito, dentro do quadrado, e a faixa de 420 px embaixo
  // ficava vazia. Na faixa, ela não cobre nada da pessoa.
  const enq = analise.enquadramento;
  if (enq) {
    const fimDoConteudo = enq.conteudo.y + enq.conteudo.h;
    const faixa = enq.altura - fimDoConteudo;
    if (faixa >= 200) {
      const y = Math.round(fimDoConteudo + faixa / 2);
      for (const c of montagem.cenas) if (c.legenda) c.legenda = { ...c.legenda, y };
    }
  }
  const chave = `cortes/${v.id}/completo-editado.mp4`;
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const texto = JSON.stringify({
    chave,
    videoJobId: v.id,
    completoUrl: m.baseUrl ?? v.completoUrl,
    montagem,
    pessoa,
    // A ABERTURA com os melhores momentos (01/10): o worker monta na frente do
    // completo editado, a partir da base. Worker antigo ignora o campo e o
    // completo sai sem abertura, sem quebrar.
    // A passagem é a do estilo (01/10): fusão no telejornal e no keynote.
    abertura: m.abertura?.length ? { momentos: m.abertura, familia, acento: marca.acento, escuro: marca.escuro, passagem: bibliaDoEstilo(contextoVisual(v).escolha.estiloId).abertura.passagem } : null,
    // A base fora do padrão entra no quadro antes de tudo (01/10, parte 240).
    // Worker antigo ignora o campo e recusa a proporção, como antes.
    enquadramento: analise.enquadramento ?? null,
    leve: tentativaLeve(m.tentativas),
    // A GUARDA NA SAÍDA (03/10): o worker confere a fala do arquivo pronto.
    guardaDaFala: pedidoDaGuarda(v.id, "completo editado", app),
    callbackUrl: `${app}/api/videos/${v.id}/montar-completo-callback`,
    // Volta no corpo assinado: o callback só troca o completo se o estado
    // ainda for este mesmo "montando".
    retorno: { desde: m.desde },
  });
  return { texto, chave, montagem };
}

async function falhouNoPasso(id: string, lido: MontagemDoCompleto, tomado: MontagemDoCompleto, e: unknown, oQue: string): Promise<void> {
  const erro = e instanceof Error ? e.message : "falhou";
  console.error(`[montagem-do-completo][${id}] ${oQue}:`, erro);
  const falhas = (lido.tentativasDoPasso ?? 0) + 1;
  await trocarEstado(
    id,
    tomado,
    falhas < 2
      ? { ...lido, desde: agora(), tentativasDoPasso: falhas, esperarAte: depois(2 * 60_000), motivo: null }
      : { ...tomado, estado: "sem-montagem", desde: agora(), tentativasDoPasso: falhas, motivo: `Não consegui ${oQue} (${erro.slice(0, 160)}).`, falhaTecnica: true }
  );
}

/** O passo do cron. Devolve contagens para o log; null com a trava desligada. */
export async function avancarMontagemDoCompleto(opcoes: { orcamentoMs?: number } = {}): Promise<{ olhados: number } | null> {
  if (!montagemDoCompletoLigada()) return null;
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 240_000;
  const r = { olhados: 0 };
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM video_jobs
    WHERE "createdAt" > now() - interval '14 days'
      AND status <> 'cancelado'
      AND "completoMontagem" ->> 'estado' IN ('na-fila', 'preparando', 'dirigindo', 'ilustrando', 'gerando', 'montando')
    ORDER BY "createdAt" DESC
    LIMIT 10`;
  for (const { id } of ids) {
    // O diretor de uma onda leva de 3 a 6 min: só começa passo novo no
    // começo da passada, para a soma caber no teto de 800 s do cron.
    if (Date.now() - inicio > orcamento - 150_000) break;
    const v = await lerVideo(id);
    const m = v?.completoMontagem;
    if (!v || !m) continue;
    const idade = Date.now() - new Date(m.desde).getTime();
    const esperando = Boolean(m.esperarAte && Date.now() < new Date(m.esperarAte).getTime());
    try {
      if (m.jornada && m.estado === "dirigindo" && !esperando && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        // A JORNADA (E5): passos 6 e 7 e o envio do render.
        r.olhados++;
        await gerarEMontarPelaJornada(v, m);
      } else if (m.jornada && m.estado === "montando" && m.jornada.reenviar && m.jornada.edicao && !esperando) {
        r.olhados++;
        await enviarPelaJornada(v, { ...m, jornada: { ...m.jornada, reenviar: false } }, m);
      } else if (m.jornada && m.estado === "montando" && idade > prazoDaMontagemMs(m.jornada.edicao?.duracao ?? m.fala?.duracao, true) && !(await aindaEsperaOWorker(v.id, m.chave, idade))) {
        r.olhados++;
        await falhouNaJornada(v.id, m, "o render da jornada não terminou no prazo");
      } else if (m.jornada) {
        // Jornada em andamento: nenhum outro caminho mexe neste vídeo.
      } else if (m.estado === "na-fila" && !esperando) {
        r.olhados++;
        await preparar(v, m);
      } else if (m.estado === "preparando" && idade > PASSO_MORTO_MS) {
        r.olhados++;
        await trocarEstado(v.id, m, { ...m, estado: "na-fila", desde: agora() });
      } else if (m.estado === "dirigindo" && m.sobMedida && !m.sobMedida.desistiu && !esperando && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        // O editor sob medida (03/10).
        r.olhados++;
        await editarSobMedida(v, m);
      } else if (m.estado === "montando" && m.sobMedida && !m.sobMedida.desistiu && m.sobMedida.reenviar && m.sobMedida.edicao && (m.sobMedida.fase === "previa" || m.sobMedida.fase === "final") && !esperando) {
        // O worker reiniciou (ou a montagem foi recolocada na fila): reenvia a mesma fase, sem IA.
        r.olhados++;
        await enviarSobMedida(v, { ...m, trabalhando: false, sobMedida: { ...m.sobMedida, reenviar: false } }, m);
      } else if (m.estado === "montando" && m.sobMedida?.fase === "revisar" && !m.sobMedida.desistiu && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        r.olhados++;
        await revisarSobMedida(v, m);
      } else if (
        m.estado === "montando" &&
        m.sobMedida &&
        !m.sobMedida.desistiu &&
        // O PRAZO PROPORCIONAL (04/10, lib/media/montagem-no-worker.ts): o do
        // worker para a duração (prévia ou final) mais a fila; passado ele,
        // pergunta ao worker antes de desistir (rodando ou na fila não é morto).
        idade > prazoDaMontagemMs(m.sobMedida.edicao?.duracao ?? m.fala?.duracao, m.sobMedida.fase === "final") &&
        !(await aindaEsperaOWorker(v.id, m.chave, idade))
      ) {
        r.olhados++;
        await desistirDoSobMedida(v.id, m, "o render da edição sob medida não terminou no prazo");
      } else if (m.estado === "dirigindo" && !esperando && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        // `trabalhando`: outra passada está no meio da onda. Tomar de novo
        // jogaria fora a onda dela e pagaria o diretor duas vezes.
        r.olhados++;
        await dirigir(v, m);
      } else if (m.estado === "ilustrando" && !esperando && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        r.olhados++;
        await ilustrar(v, m);
      } else if (m.estado === "gerando") {
        r.olhados++;
        await montar(v, m);
      } else if (m.estado === "montando" && m.revisaoVisual?.pendente && m.candidato && (!m.trabalhando || idade > PASSO_MORTO_MS)) {
        // A revisão visual do render pronto (02/10).
        r.olhados++;
        await revisarCandidato(v, m);
      } else if (m.estado === "montando" && !(m.sobMedida && !m.sobMedida.desistiu) && idade > PRAZO_DO_RENDER_MS && !(await aindaEsperaOWorker(v.id, m.chave, idade))) {
        // A reserva também pergunta ao worker antes (04/10): em 04/10 ela foi
        // dada por morta três vezes na fila parada atrás de um render pendurado.
        r.olhados++;
        await trocarEstado(v.id, m, {
          ...m,
          estado: (m.tentativas ?? 1) >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
          desde: agora(),
          esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
          motivo: (m.tentativas ?? 1) >= MAX_TENTATIVAS ? "O render do completo não terminou no prazo. O completo segue sem a edição." : null,
          falhaTecnica: (m.tentativas ?? 1) >= MAX_TENTATIVAS,
        });
      }
    } catch (e) {
      console.error(`[montagem-do-completo][${id}]`, e);
    }
  }
  return r;
}

// ─────────────────────────────── 2b. o editor sob medida ───────────────────────────────

// ─────────────────────────────── 2c. a jornada oficial (E5) ───────────────────────────────

/** Uma falha da jornada: tenta de novo (até 3 vezes no total); depois para com o motivo dito e os admins avisados. Nunca cai na esteira antiga. */
async function falhouNaJornada(id: string, lido: MontagemDoCompleto, motivo: string): Promise<void> {
  const falhas = (lido.jornada?.falhas ?? 0) + 1;
  console.error(`[montagem-do-completo][${id}] jornada: ${motivo} (falha ${falhas})`);
  if (falhas < MAX_TENTATIVAS && lido.jornada?.edicao) {
    await trocarEstado(id, lido, { ...lido, desde: agora(), trabalhando: false, esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS), jornada: { ...lido.jornada, falhas, reenviar: true } });
    return;
  }
  if (falhas < MAX_TENTATIVAS && lido.estado === "dirigindo") {
    await trocarEstado(id, lido, { ...lido, desde: agora(), trabalhando: false, esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS), jornada: { ...(lido.jornada as EstadoDaJornadaNaMontagem), falhas } });
    return;
  }
  await trocarEstado(id, lido, { ...lido, estado: "sem-montagem", desde: agora(), trabalhando: false, motivo: `A edição não ficou pronta (${motivo.slice(0, 160)}).`, falhaTecnica: true, jornada: lido.jornada ? { ...lido.jornada, falhas } : null });
  await avisarAdminsDaMontagem({ videoJobId: id, alvo: "completo", motivo: `jornada: ${motivo}` }).catch(() => {});
}

/** "dirigindo" na jornada: os prompts e a geração (passo 6), a montagem pelo JEV (passo 7) e o envio do render. */
async function gerarEMontarPelaJornada(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, desde: agora(), trabalhando: true };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const rj = lido.roteiro?.jornada;
    const analise = lido.analise!;
    const formato = analise.altura > analise.largura ? "9:16" : "16:9";
    const fala = lido.fala!;
    const contexto = await contextoDoProjeto(v.projectId, formato, fala.duracao);
    const leg = normalizarLegenda((v.videoEstiloEscolha as { legenda?: unknown } | null)?.legenda);
    const m = await montarPelaJornada({
      estado: { aprovado: rj?.aprovado ?? null, leitura: rj?.leitura ?? null },
      falaDoPlano: lido.roteiro?.completo?.fala?.palavras ?? fala.palavras,
      falaDoRender: fala.palavras,
      duracao: fala.duracao,
      formato,
      W: analise.largura,
      H: analise.altura,
      fps: analise.fps || 30,
      amostras: lido.jornada?.amostras ?? [],
      contexto,
      legenda: leg.modo === "sem" ? { mostrar: false } : leg.modo === "estilo" && leg.estilo ? { mostrar: true, estilo: leg.estilo, automatica: false } : { mostrar: true, estilo: "limpa", automatica: true },
      temTrilha: Boolean(v.videoMusicUrl),
      redator: redatorDaJornada(v.projectId, "jornada-prompts"),
      jev: jevDaJornada(),
      geracao: dependenciasDaGeracao({ projectId: v.projectId, videoId: v.id, edicaoId: rj?.edicaoId ?? "sem-edicao" }),
      projectId: v.projectId,
    });
    const jornada: EstadoDaJornadaNaMontagem = {
      ...(lido.jornada as EstadoDaJornadaNaMontagem),
      fase: "render",
      edicao: m.edicao,
      trilha: m.trilha,
      avisosDoCliente: m.avisosDoCliente,
      avisosDoAdmin: m.avisosDoAdmin.slice(0, 40),
      escolhas: m.escolhas,
      custoUsd: m.custoUsd.geracao,
      tempos: m.tempos,
    };
    await enviarPelaJornada(v, { ...tomado, trabalhando: false, jornada }, tomado);
  } catch (e) {
    await falhouNaJornada(v.id, { ...tomado, trabalhando: false }, e instanceof Error ? e.message : String(e));
  }
}

/** O render da jornada: só o final, sem prévia e sem segundo render automático. */
async function enviarPelaJornada(v: VideoDoCompleto, estado: MontagemDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const j = estado.jornada!;
  const tomado: MontagemDoCompleto = { ...estado, estado: "montando", desde: agora(), tentativas: (estado.tentativas ?? 0) + 1, candidato: null };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
    const edicaoId = lido.roteiro?.jornada?.edicaoId ?? "e";
    const chave = `cortes/${v.id}/completo-editado-${edicaoId}-${(tomado.tentativas ?? 1)}.mp4`;
    const texto = JSON.stringify({
      chave,
      videoJobId: v.id,
      completoUrl: estado.baseUrl ?? v.completoUrl,
      edicao: j.edicao,
      escala: 1,
      abertura: null,
      guardaDaFala: null,
      trilha: j.trilha && v.videoMusicUrl ? { url: v.videoMusicUrl, volume: 0.12, abaixar: true } : null,
      callbackUrl: `${app}/api/videos/${v.id}/montar-completo-callback`,
      retorno: { desde: tomado.desde },
    });
    const r = await fetch(`${urlDoWorker()}/montar-completo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
      body: texto,
      signal: AbortSignal.timeout(60_000),
    });
    if (r.status !== 202) throw new Error(`worker recusou a edição da jornada (HTTP ${r.status})`);
    await trocarEstado(v.id, tomado, { ...tomado, chave });
  } catch (e) {
    await falhouNaJornada(v.id, tomado, e instanceof Error ? e.message : "envio falhou");
  }
}

/** A edição sob medida desiste e o completo volta à esteira de sempre (a reserva), do começo. */
async function desistirDoSobMedida(id: string, lido: MontagemDoCompleto, motivo: string): Promise<void> {
  console.warn(`[montagem-do-completo][${id}] editor sob medida desistiu: ${motivo}`);
  await trocarEstado(id, lido, {
    ...lido,
    estado: "na-fila",
    desde: agora(),
    trabalhando: false,
    candidato: null,
    tentativas: 0,
    esperarAte: null,
    sobMedida: { ...(lido.sobMedida as EstadoDoSobMedida), desistiu: motivo.slice(0, 300) },
  });
}

async function entradaDoEditor(v: VideoDoCompleto, m: MontagemDoCompleto, quadros: Array<{ t: number; base64: string }>): Promise<EntradaDoEditor> {
  const sm = m.sobMedida!;
  const analise = m.analise!;
  const perfil = await perfilDoProjeto(v.projectId).catch(() => null);
  const { marca } = contextoVisual(v);
  const tema = temaDoEstilo(sm.estiloId, marca);
  return {
    palavras: m.fala!.palavras,
    frases: frasesNumeradas(m.fala!.palavras),
    duracao: m.fala!.duracao,
    formato: analise.altura > analise.largura ? "9:16" : "16:9",
    referencia: referenciaParaOEditor(sm.estiloId).texto,
    estiloId: sm.estiloId,
    perfil: [perfilNoPrompt(perfil), `MARCA: cores ${marca.acento} (acento) e ${marca.escuro} (escuro); acabamento ${tema.visual}. Logo: ${v.logoUrl ? "sim" : "não (o fecho usa o nome do projeto)"}.`].join("\n"),
    roteiro: roteiroParaOEditor(m.roteiro),
    quadros,
    projectId: v.projectId,
    referenciaDeUso: v.id,
  };
}

/**
 * A LEITURA DO VÍDEO INTEIRO gravada na montagem (06/10, lib/media/leitura-do-video.ts
 * escreve `completoMontagem.leitura` no contrato de lib/media/editor-por-comando/leitura-tipos.ts).
 * Lida aqui pelo campo, sem depender do tipo da montagem (o módulo da leitura
 * está sendo escrito em paralelo); sem ela, o editor segue como antes.
 */
function leituraDaMontagem(m: MontagemDoCompleto): LeituraDoVideo | null {
  const l = (m as { leitura?: LeituraDoVideo | null }).leitura;
  return l && typeof l === "object" && Array.isArray(l.trechos) ? l : null;
}

function resolverSobMedida(v: VideoDoCompleto, m: MontagemDoCompleto, editor: EdicaoDoEditor, insercoes: Record<string, MidiaDaInsercao>) {
  const sm = m.sobMedida!;
  const analise = m.analise!;
  const { marca, legenda } = contextoVisual(v);
  const { rosto } = geometriaNoQuadro(v.clips, analise);
  return resolverEdicao(editor, {
    palavras: m.fala!.palavras,
    duracao: m.fala!.duracao,
    largura: analise.largura,
    altura: analise.altura,
    tema: { ...temaDoEstilo(sm.estiloId, marca), escuroLegenda: "#06111F" },
    rosto,
    leitura: leituraDaMontagem(m),
    estiloId: sm.estiloId,
    // A legenda pequena do pitch, a menos que o cliente tenha escolhido "sem legenda".
    comLegenda: legenda.mostrar,
    logoUrl: v.logoUrl ?? null,
    insercoes,
  });
}

/** "dirigindo" com `sobMedida`: o editor escreve os blocos que faltam; com todos prontos, inserções, resolução e a prévia. */
async function editarSobMedida(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, desde: agora(), trabalhando: true };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  const sm = lido.sobMedida!;
  try {
    const base = lido.baseUrl ?? v.completoUrl!;
    // O EDITOR POR COMANDO (05/10): um diretor por bloco, em paralelo; o final sai direto, sem prévia.
    if (editorPorComandoLigado()) {
      const comando = (await lerComandoDoProjeto(v.projectId).catch(() => null)) ?? comandoPadrao(contextoVisual(v).escolha);
      // O PLANO DO ROTEIRO (05/10, à tarde): o que o cliente aprovou cena a cena,
      // levado para a fala transcrita do arquivo pronto; a montagem não decide de novo.
      const rc = lido.roteiro?.completo?.comando;
      const falaDoRoteiro = lido.roteiro?.completo?.fala?.palavras;
      let pronto: PlanoPronto | null = null;
      if (rc?.plano?.momentos?.length && rc.texto === comando.texto && falaDoRoteiro?.length && lido.fala?.palavras?.length) {
        const levada = levarEdicaoParaFalaNova(rc.plano, falaDoRoteiro, lido.fala.palavras, mapaDePalavras(falaDoRoteiro, lido.fala.palavras));
        pronto = { base: rc.base, plano: { ...rc.plano, ...levada.editor } };
        console.log(`[montagem-do-completo][${v.id}] plano do roteiro reaproveitado: ${pronto.plano.momentos.length} peças (${levada.perdidos} saíram com a fala)`);
      }
      const quadros = pronto ? [] : await quadrosPeloWorker(base, 320)(instantesParaOEditor(lido.fala!.duracao).filter((_, k) => k % 3 === 0)).catch(() => []);
      const p = await planejarCompletoPorComando(await entradaDoPlanoDoCompleto(v, lido, comando, quadros), pronto);
      const novo: EstadoDoSobMedida = {
        ...sm,
        estiloId: p.base,
        editor: p.plano,
        insercoes: p.insercoes,
        edicao: p.edicao,
        fase: "final",
        custoImagensUsd: p.custoImagensUsd,
        medidas: medidasDaEdicao(p.edicao),
        avisos: p.avisos.slice(0, 30),
        comando: { comando, base: p.base, plano: p.plano, tempos: p.tempos, correcoes: 0 },
      };
      await enviarSobMedida(v, { ...tomado, trabalhando: false, sobMedida: novo }, tomado);
      return;
    }
    const quadros = await quadrosPeloWorker(base, 384)(instantesParaOEditor(lido.fala!.duracao)).catch(() => []);
    const entrada = await entradaDoEditor(v, lido, quadros);
    // Bloco pronto nunca é refeito; os que faltam vão juntos.
    const blocos = sm.blocos.map((b) => ({ ...b }));
    await Promise.all(
      blocos.map(async (b, k) => {
        if (b.parte) return;
        b.parte = await escreverBloco(entrada, b, k, blocos.length);
      })
    );
    const editor = juntarPartes(blocos.map((b) => b.parte!));
    if (!editor.momentos.length) {
      await desistirDoSobMedida(v.id, tomado, `o editor não devolveu edição (${blocos.map((b) => b.parte?.erro).filter(Boolean).join("; ").slice(0, 200)})`);
      return;
    }
    const formato = lido.analise!.altura > lido.analise!.largura ? "9:16" : "16:9";
    const ins = await gerarInsercoes(editor, { formato, projectId: v.projectId });
    // O B-ROLL de banco (03/10, terceira volta): 1 a cada 15 a 25 s; sem PEXELS_API_KEY nem PIXABAY_API_KEY, segue sem ele.
    const so = brollsQueCabem(editor, ins.insercoes, (x) => resolverSobMedida(v, lido, editor, x).edicao);
    const broll = await gerarBrolls(editor, { formato, projectId: v.projectId, referencia: `${v.id}-completo`, teto: 80, prazoMs: 120_000, so }).catch((e) => ({ insercoes: {}, custoUsd: 0, erros: [`B-roll falhou: ${e instanceof Error ? e.message.slice(0, 120) : e}`], fonte: null, creditos: [] as string[] }));
    ins.insercoes = { ...ins.insercoes, ...broll.insercoes };
    const r = resolverSobMedida(v, lido, editor, ins.insercoes);
    // A HIGGSFIELD DE VERDADE (03/10, segunda volta): as primeiras inserções viram vídeo de cinema (teto pela régua de preço); entram no final.
    const videos = await pedirVideosDasInsercoes(editor, ins.insercoes, { formato, referencia: `${v.id}-completo`, teto: tetoDeVideos("completo", lido.fala!.duracao / 60), duracoes: duracoesDasInsercoes(r.edicao) }).catch(() => ({ pedidos: [], erros: [] }));
    const novo: EstadoDoSobMedida = { ...sm, blocos, editor, insercoes: ins.insercoes, videos: videos.pedidos, edicao: r.edicao, fase: "previa", custoImagensUsd: ins.custoUsd, medidas: medidasDaEdicao(r.edicao), avisos: [...r.avisos, ...broll.erros].slice(0, 30), creditos: broll.creditos };
    await enviarSobMedida(v, { ...tomado, trabalhando: false, sobMedida: novo }, tomado);
  } catch (e) {
    await desistirDoSobMedida(v.id, tomado, `o editor falhou (${e instanceof Error ? e.message.slice(0, 200) : e})`);
  }
}

/** O que o diretor do editor por comando recebe para o completo. */
async function entradaDoPlanoDoCompleto(v: VideoDoCompleto, m: MontagemDoCompleto, comando: ComandoDoVideo, quadros: Array<{ t: number; base64: string }>): Promise<EntradaDoPlano> {
  const analise = m.analise!;
  const perfil = await perfilDoProjeto(v.projectId).catch(() => null);
  const { marca, legenda } = contextoVisual(v);
  const { rosto } = geometriaNoQuadro(v.clips, analise);
  return {
    // A LEITURA DO VÍDEO INTEIRO (06/10): gravada pela leitura em completoMontagem.leitura; o editor decide por ela.
    leitura: leituraDaMontagem(m),
    palavras: m.fala!.palavras,
    duracao: m.fala!.duracao,
    formato: analise.altura > analise.largura ? "9:16" : "16:9",
    comando,
    marca,
    paleta: paletaDoProjeto(v.colorPalette),
    rosto,
    comLegenda: legenda.mostrar,
    // A legenda do estilo vale na "Automática"; só o estilo de legenda fixado pelo cliente passa por cima (06/10, noite).
    legendaFixa: legenda.mostrar && !legenda.automatica ? legenda.estilo : null,
    logoUrl: v.logoUrl ?? null,
    titulo: resumoDoVideo(v.clips) || null,
    perfil: perfilNoPrompt(perfil),
    quadros,
    projectId: v.projectId,
    imagens: tetoDeImagens("completo", m.fala!.duracao),
    // As sugestões cena a cena do roteiro (05/10) viram instrução obrigatória do trecho no diretor.
    pedidos: sugestoesDoCliente(m),
    // O completo é o vídeo do YouTube (decisão de 23/08): a chamada de curtir e inscrever entra (05/10, noite).
    youtube: true,
  };
}

/**
 * AS SUGESTÕES CENA A CENA que o cliente deixou na tela de roteiro (05/10),
 * levadas para a fala da montagem (a transcrição do completo pronto) pelo
 * mesmo alinhamento por sequência do plano.
 */
function sugestoesDoCliente(m: MontagemDoCompleto): PedidoDaCena[] {
  const sugestoes = m.roteiro?.completo?.sugestoes ?? [];
  if (!sugestoes.length || !m.fala?.palavras?.length) return [];
  return sugestoesNaFala(sugestoes, m.roteiro?.completo?.fala?.palavras ?? [], m.fala.palavras);
}

/** A revisão do completo por comando: sem nota (ou sem rodada), o final vai ao ar; com nota, só os blocos com nota voltam ao diretor. */
async function revisarCompletoPorComando(v: VideoDoCompleto, lido: MontagemDoCompleto, tomado: MontagemDoCompleto): Promise<void> {
  const sm = lido.sobMedida!;
  const c = sm.comando!;
  const vertical = lido.analise!.altura > lido.analise!.largura;
  if (conferenciaVisualLigada()) {
    await conferirCompletoPronto(v, lido, tomado, vertical);
    return;
  }
  const rev = await revisarPorComando({ edicao: sm.edicao!, comando: c.comando.texto, obterQuadros: quadrosPeloWorker(sm.previaUrl!, vertical ? 360 : 512), projectId: v.projectId, teto: Math.min(24, Math.max(10, Math.round(lido.fala!.duracao / 50))) });
  const historico = [...sm.historico, { rodada: sm.rodada, quadros: rev.quadros, nota: rev.nota, defeitos: rev.notas.map((n) => ({ momento: n.momento, t: n.t, tipo: "comando", descricao: n.problema })), falta: rev.resumo ? [rev.resumo] : [], erro: rev.erro ?? null }].slice(-6);
  if (!rev.notas.length || c.correcoes >= correcoesDoCompleto()) {
    await entregarCompleto(v, { ...tomado, sobMedida: { ...sm, historico }, revisaoVisual: { rodadas: sm.rodada, historico: [], pendente: false, final: true, motivo: "editor por comando: revisado no final" } }, c.montado!);
    return;
  }
  const entrada = await entradaDoPlanoDoCompleto(v, lido, c.comando, []);
  const p = await corrigirCompletoPorComando(entrada, { base: c.base, plano: c.plano, insercoes: sm.insercoes ?? {}, custoImagensUsd: sm.custoImagensUsd ?? 0 }, rev.notas, rev.resumo);
  const novo: EstadoDoSobMedida = { ...sm, editor: p.plano, insercoes: p.insercoes, edicao: p.edicao, fase: "final", rodada: sm.rodada + 1, historico, custoImagensUsd: p.custoImagensUsd, medidas: medidasDaEdicao(p.edicao), avisos: [...(sm.avisos ?? []), ...p.avisos].slice(-30), comando: { ...c, plano: p.plano, montado: null, correcoes: c.correcoes + 1 } };
  await enviarSobMedida(v, { ...tomado, trabalhando: false, tentativas: 0, sobMedida: novo }, tomado);
}

/**
 * A CONFERÊNCIA VISUAL DO COMPLETO PRONTO (06/10, lib/media/conferencia-visual.ts):
 * o Gemini descreve os problemas dos quadros, o JEV reprova peça a peça, e o
 * editor replaneja só os momentos reprovados (1 rodada). O render corrigido
 * vai ao ar com a rodada gravada em `revisaoVisual`.
 */
async function conferirCompletoPronto(v: VideoDoCompleto, lido: MontagemDoCompleto, tomado: MontagemDoCompleto, vertical: boolean): Promise<void> {
  const sm = lido.sobMedida!;
  const c = sm.comando!;
  const rv = lido.revisaoVisual ?? { rodadas: 0, pendente: false, historico: [] };
  const rev = await conferirVideoPronto({ edicao: sm.edicao!, palavras: lido.fala!.palavras, comando: c.comando.texto, obterQuadros: quadrosPeloWorker(sm.previaUrl!, vertical ? 360 : 512), projectId: v.projectId });
  const rodada = { em: agora(), rodada: rv.rodadas + 1, quadros: rev.quadros, defeitos: [], consertadas: [], momentosTirados: [], erro: rev.erro, problemas: rev.problemas.slice(0, 60), reprovadas: rev.reprovadas.map((r) => r.momento), custoUsd: rev.custoUsd, ms: rev.ms };
  const historico = [...rv.historico, rodada].slice(-6);
  if (!rev.reprovadas.length || c.correcoes >= 1) {
    const motivo = rev.erro ? `conferência visual: ${rev.erro}` : `conferência visual: ${rev.quadros} quadros, ${rev.problemas.length} problema(s), nenhuma peça reprovada`;
    await entregarCompleto(v, { ...tomado, revisaoVisual: { rodadas: rv.rodadas, historico, pendente: false, final: true, motivo } }, c.montado!);
    return;
  }
  let p: Awaited<ReturnType<typeof replanejarMomentosPorComando>>;
  try {
    const entrada = await entradaDoPlanoDoCompleto(v, lido, c.comando, []);
    p = await replanejarMomentosPorComando(entrada, { base: c.base, plano: c.plano, insercoes: sm.insercoes ?? {}, custoImagensUsd: sm.custoImagensUsd ?? 0 }, rev.reprovadas.map((r) => r.momento));
  } catch (e) {
    // O replanejamento falhando não joga fora o render pronto: ele vai ao ar com o motivo escrito.
    const motivo = `conferência visual: ${rev.reprovadas.length} peça(s) reprovada(s), mas o replanejamento falhou (${e instanceof Error ? e.message.slice(0, 120) : e}); foi ao ar o render conferido`;
    await entregarCompleto(v, { ...tomado, revisaoVisual: { rodadas: rv.rodadas, historico, pendente: false, final: true, motivo } }, c.montado!);
    return;
  }
  const novo: EstadoDoSobMedida = { ...sm, editor: p.plano, insercoes: p.insercoes, edicao: p.edicao, fase: "final", rodada: sm.rodada + 1, custoImagensUsd: p.custoImagensUsd, medidas: medidasDaEdicao(p.edicao), avisos: [...(sm.avisos ?? []), ...p.avisos].slice(-30), comando: { ...c, plano: p.plano, montado: null, correcoes: c.correcoes + 1 } };
  const revisaoVisual = { rodadas: rv.rodadas + 1, historico, pendente: false, motivo: `conferência visual: ${rev.reprovadas.length} peça(s) reprovada(s), replanejadas (${p.tirados.join(", ")})` };
  await enviarSobMedida(v, { ...tomado, trabalhando: false, tentativas: 0, sobMedida: novo, revisaoVisual }, tomado);
}

/** Manda a prévia (metade da resolução) ou o final (com a abertura) ao worker, pela porta do completo. */
async function enviarSobMedida(v: VideoDoCompleto, estado: MontagemDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const sm = estado.sobMedida!;
  const final = sm.fase === "final";
  const tomado: MontagemDoCompleto = { ...estado, estado: "montando", desde: agora(), tentativas: (estado.tentativas ?? 0) + 1, candidato: null };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  try {
    const { marca } = contextoVisual(v);
    const app = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
    const chave = final ? `cortes/${v.id}/completo-editado.mp4` : `cortes/${v.id}/previa-sob-medida-${sm.rodada}.mp4`;
    const texto = JSON.stringify({
      chave,
      videoJobId: v.id,
      completoUrl: estado.baseUrl ?? v.completoUrl,
      edicao: sm.edicao,
      escala: final ? 1 : 0.5,
      abertura: final && estado.abertura?.length ? { momentos: estado.abertura, familia: "sobrio", acento: marca.acento, passagem: bibliaDoEstilo(sm.estiloId).abertura.passagem } : null,
      // A GUARDA NA SAÍDA (03/10): só o final; a prévia não vai ao cliente.
      guardaDaFala: final ? pedidoDaGuarda(v.id, "completo sob medida", app) : null,
      callbackUrl: `${app}/api/videos/${v.id}/montar-completo-callback`,
      retorno: { desde: tomado.desde },
    });
    const r = await fetch(`${urlDoWorker()}/montar-completo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
      body: texto,
      signal: AbortSignal.timeout(60_000),
    });
    if (r.status !== 202) throw new Error(`worker recusou a edição sob medida (HTTP ${r.status})`);
    await trocarEstado(v.id, tomado, { ...tomado, chave });
  } catch (e) {
    await desistirDoSobMedida(v.id, tomado, e instanceof Error ? e.message : "envio falhou");
  }
}

/** O juiz do completo: quadros por bloco de 5 min e defeitos que vão ao conserto por rodada (o teto de custo). */
const QUADROS_DO_JUIZ_POR_BLOCO = Number(process.env.EDITOR_SOB_MEDIDA_JUIZ_POR_BLOCO ?? 24);
const DEFEITOS_POR_RODADA = Number(process.env.EDITOR_SOB_MEDIDA_DEFEITOS_POR_RODADA ?? 30);

/**
 * Os B-rolls da edição que ainda não têm vídeo: os que o conserto pediu no
 * lugar de uma peça e os que o prazo da primeira passada deixou de fora. O
 * banco é grátis e a escolha fica em cache pela consulta; 60 s de prazo.
 */
async function brollsQueFaltam(v: VideoDoCompleto, m: MontagemDoCompleto, editor: EdicaoDoEditor, insercoes: Record<string, MidiaDaInsercao>): Promise<Record<string, MidiaDaInsercao>> {
  const faltam = (editor.broll ?? []).filter((b) => b.id && !insercoes[String(b.id)]);
  if (!faltam.length) return {};
  const formato = m.analise!.altura > m.analise!.largura ? "9:16" : "16:9";
  const parcial = { ...editor, broll: faltam };
  const so = brollsQueCabem(parcial, insercoes, (x) => resolverSobMedida(v, m, editor, x).edicao);
  const r = await gerarBrolls(parcial, { formato, projectId: v.projectId, referencia: `${v.id}-completo`, teto: 40, prazoMs: 60_000, so }).catch(() => null);
  return r?.insercoes ?? {};
}

/** A prévia voltou: o revisor olha; com defeito, o editor conserta (até 2 rodadas); o que ainda tem defeito sai; vai o final. */
async function revisarSobMedida(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, trabalhando: true, desde: agora() };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  const sm = lido.sobMedida!;
  try {
    if (sm.comando) {
      await revisarCompletoPorComando(v, lido, tomado);
      return;
    }
    const frases = frasesNumeradas(lido.fala!.palavras);
    const ref = referenciaParaOEditor(sm.estiloId);
    const rev = await revisarPrevia({
      edicao: sm.edicao!,
      frases,
      obterQuadros: quadrosPeloWorker(sm.previaUrl!, lido.analise!.altura > lido.analise!.largura ? 360 : 512),
      referencia: `${ref.texto.slice(0, 1800)}\nQuadros típicos: ${ref.quadros.join(" | ")}`,
      soIds: sm.soIds ?? null,
      projectId: v.projectId,
      estiloId: sm.estiloId,
      rodada: sm.rodada,
      // O TETO DO JUIZ NO COMPLETO (03/10, à noite): 24 quadros por bloco de 5 min e os 30 piores defeitos por rodada.
      tetoPorBloco: QUADROS_DO_JUIZ_POR_BLOCO,
      tetoDeDefeitos: DEFEITOS_POR_RODADA,
    });
    const historico = [
      ...sm.historico,
      { rodada: sm.rodada, quadros: rev.quadros, nota: rev.nota, achados: rev.achados ?? rev.defeitos.length, defeitos: rev.defeitos.map((d) => ({ momento: d.momento, t: d.t, tipo: d.tipo, descricao: d.descricao })), falta: rev.falta, erro: rev.erro ?? null },
    ].slice(-6);
    let editor = sm.editor!;
    if (rev.defeitos.length && sm.rodada < 2) {
      const entrada = await entradaDoEditor(v, lido, []);
      const quadrosDoDefeito = rev.olhados.filter((q) => rev.defeitos.some((d) => Math.abs(d.t - q.t) < 0.05));
      const c = await consertarEdicao(entrada, editor, rev.defeitos, quadrosDoDefeito);
      // O B-roll que o conserto pediu no lugar de uma peça, e o que o prazo da primeira passada deixou de fora.
      const insercoes = { ...(sm.insercoes ?? {}), ...(await brollsQueFaltam(v, lido, c.edicao, sm.insercoes ?? {})) };
      // A densidade nunca cai no conserto: se a consertada ficou mais vazia, as peças boas da anterior voltam.
      const graves = new Set(rev.defeitos.filter((d) => DEFEITOS_GRAVES.has(d.tipo)).map((d) => d.momento).filter((x): x is string => Boolean(x)));
      const md = manterDensidade(editor, c.edicao, graves, (x) => medidasDaEdicao(resolverSobMedida(v, lido, x, insercoes).edicao).comPecaOuMidia);
      editor = md.edicao;
      if (md.motivo) c.erros.push(`densidade ${md.antes} -> ${md.depois}: ${md.motivo}`);
      const soIds = [...new Set([...rev.defeitos.map((d) => d.momento).filter((x): x is string => Boolean(x)), ...editor.momentos.map((m) => String(m.id)).filter((id) => !sm.editor!.momentos.some((x) => String(x.id) === id))])];
      const r = resolverSobMedida(v, lido, editor, insercoes);
      const novo: EstadoDoSobMedida = { ...sm, editor, insercoes, edicao: r.edicao, fase: "previa", rodada: sm.rodada + 1, soIds, historico, medidas: medidasDaEdicao(r.edicao), avisos: [...(sm.avisos ?? []), `rodada ${sm.rodada}: ${rev.achados ?? rev.defeitos.length} defeito(s) achados, ${rev.defeitos.length} ao conserto, ${c.trocados} refeitos, ${c.removidos} removidos`, ...c.erros].slice(-30) };
      await enviarSobMedida(v, { ...tomado, trabalhando: false, sobMedida: novo }, tomado);
      return;
    }
    // SÓ VAI AO AR O QUE PASSOU: a peça que ainda tem defeito sai.
    // No fim só sai a peça com defeito GRAVE (ilegível, cobrindo, incoerente,
    // imagem ruim). A nota baixa do juiz ("qualidade") e o "feio" foram ao
    // conserto enquanto havia rodada; tirar a peça no fim deixava a cabeça
    // falando sozinha e a nota caía mais (prova Vox de 03/10: 5,8 para 5,1).
    const reprovadas = new Set(rev.defeitos.filter((d) => DEFEITOS_GRAVES.has(d.tipo)).map((d) => d.momento).filter((x): x is string => Boolean(x)));
    if (reprovadas.size) editor = { ...editor, momentos: editor.momentos.filter((x) => !reprovadas.has(String(x.id))) };
    // O lugar da peça que saiu: o B-roll que ainda falta entra, e o resolvedor põe o sublinhado da ênfase no buraco longo.
    const comBroll = { ...(sm.insercoes ?? {}), ...(await brollsQueFaltam(v, lido, editor, sm.insercoes ?? {})) };
    // Os vídeos da Higgsfield que já ficaram prontos trocam as fotos no final.
    const comVideos = sm.videos?.length ? (await concluirVideosDasInsercoes(comBroll, sm.videos, { projectId: v.projectId, esperarMs: 60_000 }).catch(() => null))?.insercoes ?? comBroll : comBroll;
    const r = resolverSobMedida(v, lido, editor, comVideos);
    const novo: EstadoDoSobMedida = { ...sm, insercoes: comVideos, editor, edicao: r.edicao, fase: "final", historico, soIds: null, medidas: medidasDaEdicao(r.edicao) };
    await enviarSobMedida(v, { ...tomado, trabalhando: false, tentativas: 0, sobMedida: novo }, tomado);
  } catch (e) {
    await desistirDoSobMedida(v.id, tomado, `a revisão da prévia falhou (${e instanceof Error ? e.message.slice(0, 200) : e})`);
  }
}

// ─────────────────────────────── 3. o callback ───────────────────────────────

/**
 * O worker terminou (ou falhou). Troca `completoUrl` pela edição, guardando o
 * original no estado. O card e o post do YouTube leem a mídia pela rota
 * /midia, que resolve `completoUrl` na hora: trocar a URL basta.
 */
export async function concluirMontagemDoCompleto(
  videoJobId: string,
  desde: string,
  resultado: {
    ok?: boolean;
    montado?: { url: string; bytes: number };
    tempos?: Record<string, number>;
    erro?: string;
    reiniciado?: boolean;
    /** A conferência do worker depois do render (02/10). */
    conferencia?: unknown;
    /** A duração da abertura no arquivo pronto (02/10). */
    aberturaSeg?: number;
  }
): Promise<"trocado" | "ignorado" | "falhou" | "revisando"> {
  const v = await lerVideo(videoJobId);
  const lido = v?.completoMontagem;
  if (!v || !lido || lido.estado !== "montando" || lido.desde !== desde) return "ignorado";
  // O WORKER REINICIOU (deploy, 01/10): o render foi cortado no meio, não
  // falhou. Volta para "gerando" sem espera e sem gastar tentativa; a próxima
  // passada do cron reenvia ao worker novo.
  if (resultado.reiniciado && lido.sobMedida && !lido.sobMedida.desistiu) {
    await trocarEstado(videoJobId, lido, { ...lido, desde: agora(), tentativas: Math.max(0, (lido.tentativas ?? 1) - 1), sobMedida: { ...lido.sobMedida, reenviar: true } });
    return "falhou";
  }
  if (resultado.reiniciado) {
    await trocarEstado(videoJobId, lido, {
      ...lido,
      estado: "gerando",
      desde: agora(),
      tentativas: Math.max(0, (lido.tentativas ?? 1) - 1),
      esperarAte: undefined,
      motivo: null,
    });
    return "falhou";
  }
  // A JORNADA (E5): sem reserva escondida. Reinício reenvia; falha tenta de novo (até 3) e depois diz que falhou; pronto vai ao ar.
  if (lido.jornada) {
    if (resultado.reiniciado) {
      await trocarEstado(videoJobId, lido, { ...lido, desde: agora(), tentativas: Math.max(0, (lido.tentativas ?? 1) - 1), jornada: { ...lido.jornada, reenviar: true } });
      return "falhou";
    }
    if (!resultado.ok || !resultado.montado?.url) {
      await falhouNaJornada(videoJobId, lido, `o render falhou (${resumoDoErro(resultado.erro ?? "sem detalhe")})`);
      return "falhou";
    }
    return entregarCompleto(v, { ...lido, revisaoVisual: null, resumo: { ...(lido.resumo ?? {}), avisosDoCliente: lido.jornada.avisosDoCliente ?? [] } }, { url: resultado.montado.url, bytes: resultado.montado.bytes, tempos: resultado.tempos });
  }
  // A edição sob medida que falha no render desiste para a reserva (voltar a
  // "gerando" mandaria ao worker um plano que não existe).
  if ((!resultado.ok || !resultado.montado?.url) && lido.sobMedida && !lido.sobMedida.desistiu) {
    await desistirDoSobMedida(videoJobId, lido, `o render da edição sob medida falhou (${resumoDoErro(resultado.erro ?? "sem detalhe")})`);
    return "falhou";
  }
  if (!resultado.ok || !resultado.montado?.url) {
    await trocarEstado(videoJobId, lido, {
      ...lido,
      estado: (lido.tentativas ?? 1) >= MAX_TENTATIVAS ? "sem-montagem" : "gerando",
      desde: agora(),
      esperarAte: depois(ESPERA_ENTRE_TENTATIVAS_MS),
      // Começo e fim do erro: no ffmpeg a causa ("Resource temporarily
      // unavailable") vem no FIM, e cortar em 300 caracteres a escondia.
      motivo: `O render do completo falhou (${resumoDoErro(resultado.erro ?? "sem detalhe")}).`,
      // As duas primeiras falhas voltam a "gerando" e o cron reenvia (a
      // terceira vai leve, ver `tentativaLeve`); só a desistência é marcada.
      falhaTecnica: (lido.tentativas ?? 1) >= MAX_TENTATIVAS,
    });
    return "falhou";
  }
  // O EDITOR SOB MEDIDA (03/10): a prévia volta para o revisor; o final já
  // passou pela revisão da prévia e vai ao ar.
  if (lido.sobMedida && !lido.sobMedida.desistiu) {
    if (lido.sobMedida.fase === "previa") {
      const ok = await trocarEstado(videoJobId, lido, { ...lido, desde: agora(), trabalhando: false, sobMedida: { ...lido.sobMedida, fase: "revisar", previaUrl: resultado.montado.url } });
      return ok ? "revisando" : "ignorado";
    }
    // O EDITOR POR COMANDO (05/10): o primeiro final vai ao revisor (que entrega ou manda corrigir); o corrigido vai ao ar.
    // Sem rodada de correção (o padrão desde 05/10 à tarde), o final vai ao ar sem passar pelo revisor por LLM.
    // A CONFERÊNCIA VISUAL (06/10): o primeiro final sempre passa pelo olho (1 rodada de correção no máximo).
    if (lido.sobMedida.comando && (lido.sobMedida.comando.correcoes < correcoesDoCompleto() || (conferenciaVisualLigada() && lido.sobMedida.comando.correcoes === 0))) {
      const montado = { url: resultado.montado.url, bytes: resultado.montado.bytes, tempos: resultado.tempos };
      const ok = await trocarEstado(videoJobId, lido, { ...lido, desde: agora(), trabalhando: false, sobMedida: { ...lido.sobMedida, fase: "revisar", previaUrl: resultado.montado.url, comando: { ...lido.sobMedida.comando, montado } } });
      return ok ? "revisando" : "ignorado";
    }
    return entregarCompleto(
      v,
      { ...lido, revisaoVisual: { rodadas: lido.revisaoVisual?.rodadas ?? lido.sobMedida.rodada, historico: lido.revisaoVisual?.historico ?? [], pendente: false, final: true, motivo: lido.revisaoVisual?.motivo ? `${lido.revisaoVisual.motivo}; o corrigido foi ao ar` : "editor sob medida: revisado na prévia" } },
      { url: resultado.montado.url, bytes: resultado.montado.bytes, tempos: resultado.tempos }
    );
  }
  // A REVISÃO VISUAL FINAL (02/10): o render pronto vira CANDIDATO e o cron
  // confere quadro a quadro antes de trocar o completo do cliente
  // (`revisarCandidato`). A versão segura e a revisão desligada vão direto.
  const candidato = { url: resultado.montado.url, bytes: resultado.montado.bytes, tempos: resultado.tempos, aberturaSeg: resultado.aberturaSeg ?? 0 };
  if (revisaoVisualLigada() && !lido.revisaoVisual?.final) {
    const ok = await trocarEstado(videoJobId, lido, {
      ...lido,
      desde: agora(),
      candidato,
      conferenciaDoRender: resultado.conferencia ?? null,
      revisaoVisual: { rodadas: lido.revisaoVisual?.rodadas ?? 0, historico: lido.revisaoVisual?.historico ?? [], pendente: true },
      trabalhando: false,
    });
    return ok ? "revisando" : "ignorado";
  }
  return entregarCompleto(v, { ...lido, conferenciaDoRender: resultado.conferencia ?? lido.conferenciaDoRender ?? null }, candidato);
}

/**
 * O completo vai ao ar: troca `completoUrl` pela edição (guardando o
 * original), aponta os posts não publicados para ela e avisa o dono.
 */
async function entregarCompleto(
  v: VideoDoCompleto,
  lido: MontagemDoCompleto,
  montado: { url: string; bytes: number; tempos?: Record<string, number> }
): Promise<"trocado" | "ignorado"> {
  const videoJobId = v.id;
  const resultado = { montado, tempos: montado.tempos };
  // O ORIGINAL É GRAVADO UMA VEZ E NUNCA SOBRESCRITO (06/10): na segunda
  // refeita do completo do Fé & Gestão, o completoUrl anterior era o PRIMEIRO
  // editado, e ele virou "original"; a refeita seguinte montou peça em cima de
  // peça, com a sincronia velha de volta. Um editado nunca é original.
  const ehEditado = (url: string | null | undefined) => Boolean(url && /completo-editado-/.test(url));
  const original =
    lido.completoOriginal && !ehEditado(lido.completoOriginal.url)
      ? lido.completoOriginal
      : v.completoUrl && v.completoUrl !== lido.montadoUrl && !ehEditado(v.completoUrl)
        ? { url: v.completoUrl, bytes: v.completoBytes ? Number(v.completoBytes) : null }
        : lido.completoOriginal ?? null;
  const trocou = await trocarEstado(videoJobId, lido, {
    ...lido,
    estado: "pronto",
    desde: agora(),
    montadoUrl: resultado.montado.url,
    completoOriginal: original,
    tempos: resultado.tempos,
    motivo: null,
    falhaTecnica: false,
    replanejar: false,
    candidato: null,
    trabalhando: false,
    revisaoVisual: lido.revisaoVisual ? { ...lido.revisaoVisual, pendente: false } : lido.revisaoVisual,
  });
  if (!trocou) return "ignorado";
  // A VERSÃO SEGURA foi ao ar (02/10): a montagem de efeitos não foi
  // entregue, e a parte dela volta para o cliente, com linha no extrato.
  if (lido.revisaoVisual?.segura) {
    await estornarEdicaoNaoEntregue({
      videoId: videoJobId,
      alvo: "completo",
      motivo: lido.revisaoVisual.motivo ?? "a revisão visual entregou a versão segura, sem inserção",
      comAbertura: Boolean(lido.roteiro?.abertura && aberturaAtiva(lido.roteiro.abertura) && !lido.abertura?.length),
    }).catch((e) => console.error(`[montagem-do-completo][${videoJobId}] devolução falhou:`, e));
  }
  await prisma.$executeRaw`
    UPDATE video_jobs SET "completoUrl" = ${resultado.montado.url}, "completoBytes" = ${BigInt(resultado.montado.bytes ?? 0)}
    WHERE id = ${videoJobId}`;
  // OS POSTS QUE AINDA NÃO SAÍRAM passam a apontar para o completo editado
  // (30/09): o do YouTube guardava o arquivo sem edição e foi publicado assim.
  // Na REMONTAGEM (01/10, parte 240: o completo de 30/09 refeito com a regra
  // nova) o post não publicado aponta para a edição ANTERIOR, e não para o
  // original: as duas saem do post, senão ele publicaria a versão velha.
  const antigas = [...new Set([original?.url, v.completoUrl, lido.montadoUrl].filter((u): u is string => Boolean(u) && u !== resultado.montado!.url))];
  if (antigas.length) {
    await prisma.post.updateMany({
      where: { imageUrl: { in: antigas }, status: { notIn: ["published", "publishing"] } },
      data: { imageUrl: resultado.montado.url },
    });
  }
  // O AVISO DE PRONTO (30/09, pedido do Bruno): a faixa promete "você recebe um
  // e-mail quando terminar", e o completo é a peça que mais demora. Uma vez,
  // só quando a troca de fato aconteceu; falha de e-mail não derruba nada.
  // Desde 02/10 pelo sino (lib/notificacoes): a chave é o render que foi ao
  // ar, e o observador do cron confere o mesmo fato sem mandar outro e-mail.
  await avisarVideoPronto(videoJobId, resultado.montado.url, { versaoLimpa: Boolean(lido.revisaoVisual?.segura) }).catch(() => {});
  return "trocado";
}

/**
 * A REVISÃO VISUAL DO CANDIDATO (02/10, lib/media/revisao-visual.ts). Sem
 * defeito consertável, vai ao ar. Com defeito: as cenas voltam à pessoa e os
 * momentos da abertura saem, e o worker refaz (sem imagem nova, sem cobrar),
 * até 2 rodadas; sobrando defeito, vai a versão segura (sem inserção), com o
 * motivo escrito. A revisão que falha (rede, modelo) não segura o vídeo: ele
 * vai ao ar com a conferência do worker, que já tira tela vazia, e o erro fica
 * registrado.
 */
async function revisarCandidato(v: VideoDoCompleto, lido: MontagemDoCompleto): Promise<void> {
  const tomado: MontagemDoCompleto = { ...lido, trabalhando: true, desde: agora() };
  if (!(await trocarEstado(v.id, lido, tomado))) return;
  const cand = lido.candidato!;
  const rv: EstadoDaRevisaoVisual = lido.revisaoVisual ?? { rodadas: 0, pendente: true, historico: [] };
  const fala = lido.fala!;
  const plano = lido.plano!;
  try {
    const ultima = rv.historico.at(-1);
    const r = await revisarVideoPronto({
      obterQuadros: quadrosPeloWorker(cand.url, 256),
      plano,
      palavras: fala.palavras,
      duracao: fala.duracao,
      abertura: lido.abertura,
      deslocamento: cand.aberturaSeg ?? 0,
      projectId: v.projectId,
      // Depois de um conserto, a conferência olha só as inserções que sobraram e as cenas consertadas.
      soCenas: ultima ? ultima.consertadas : null,
    });
    const { cenas, momentos } = consertosDaRevisao(r.defeitos);
    const rodada = { em: agora(), rodada: rv.rodadas + 1, quadros: r.quadros, defeitos: r.defeitos, consertadas: cenas, momentosTirados: momentos, erro: r.erro ?? null };
    const historico = [...rv.historico, rodada].slice(-6);
    if (!cenas.length && !momentos.length) {
      await entregarCompleto(v, { ...tomado, revisaoVisual: { ...rv, historico, pendente: false, motivo: r.erro ? `revisão visual falhou (${r.erro}); foi ao ar com a conferência do worker` : null } }, cand);
      return;
    }
    const abertura = (lido.abertura ?? []).filter((_, k) => !momentos.includes(k));
    if (rv.rodadas < RODADAS_DE_CONSERTO) {
      await trocarEstado(v.id, tomado, {
        ...tomado,
        estado: "gerando",
        desde: agora(),
        trabalhando: false,
        tentativas: 0,
        esperarAte: null,
        candidato: null,
        plano: voltarCenasParaPessoa(plano, cenas, "revisão visual"),
        abertura: abertura.length ? abertura : null,
        revisaoVisual: { ...rv, rodadas: rv.rodadas + 1, historico, pendente: false },
      });
      return;
    }
    const motivo = `a revisão visual ainda achou ${r.defeitos.length} defeito(s) depois de ${rv.rodadas} rodada(s) de conserto (${[...new Set(r.defeitos.map((d) => d.tipo))].join(", ")}); foi ao ar a versão segura, sem inserção`;
    await trocarEstado(v.id, tomado, {
      ...tomado,
      estado: "gerando",
      desde: agora(),
      trabalhando: false,
      tentativas: 0,
      esperarAte: null,
      candidato: null,
      plano: planoSeguro(plano),
      planoAntesDaSegura: plano,
      abertura: abertura.length ? abertura : null,
      revisaoVisual: { ...rv, historico, pendente: false, segura: true, final: true, motivo },
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
    console.error(`[montagem-do-completo][${v.id}] revisão visual:`, erro);
    await entregarCompleto(v, { ...tomado, revisaoVisual: { ...rv, pendente: false, motivo: `revisão visual falhou (${erro}); foi ao ar com a conferência do worker` } }, cand);
  }
}

function resumoDoErro(erro: string): string {
  const e = erro.replace(/\s+/g, " ").trim();
  return e.length <= 360 ? e : `${e.slice(0, 160)} (...) ${e.slice(-200)}`;
}

/**
 * "TENTAR A MONTAGEM DE NOVO" (01/10, parte 240), o botão da falha técnica e
 * o caminho dos scripts de refação. Nada aqui cobra crédito: a montagem de
 * efeitos nunca debita (o crédito do completo é cobrado na aprovação do
 * roteiro), e o que já foi pago fica:
 *
 *   - com plano e imagens prontos (a falha foi no render): volta a "gerando"
 *     com as tentativas zeradas e o cron reenvia ao worker na próxima passada.
 *     Nenhum diretor, nenhuma imagem nova;
 *   - sem plano (a falha foi antes, no preparo ou no diretor): recomeça da
 *     fila (`marcarCompletoNaFila`), com o roteiro aprovado junto; imagem
 *     igual é reaproveitada pelo hash.
 *
 * Recusa enquanto a montagem está andando: dois renders do mesmo completo
 * disputariam o worker.
 */
export async function tentarMontagemDoCompletoDeNovo(videoJobId: string): Promise<{ ok: boolean; caminho: "reenvio" | "do-comeco" | null; motivo?: string }> {
  const v = await lerVideo(videoJobId);
  const m = v?.completoMontagem;
  if (!v || !m) return { ok: false, caminho: null, motivo: "Este vídeo ainda não tem a montagem do completo." };
  const idade = Date.now() - new Date(m.desde).getTime();
  const andando = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"].includes(m.estado);
  // Parado além do prazo do render conta como morto (estado que sobrevive ao fato).
  // 60 min: o prazo em que a tela deixa de mostrar "montando" (estado-da-montagem.ts).
  if (andando && idade < 60 * 60_000) return { ok: false, caminho: null, motivo: "A montagem já está rodando. O card avisa quando terminar." };
  if (m.plano && m.fala && m.analise && m.assets) {
    // Pedir de novo depois da VERSÃO SEGURA (02/10): o plano com as inserções
    // volta e a revisão visual recomeça; a devolução já feita fica (cortesia).
    const volta = m.planoAntesDaSegura ? { plano: m.planoAntesDaSegura, planoAntesDaSegura: null, revisaoVisual: null } : {};
    const ok = await trocarEstado(videoJobId, m, {
      ...m,
      ...volta,
      candidato: null,
      estado: "gerando",
      desde: agora(),
      tentativas: 0,
      esperarAte: null,
      motivo: null,
      falhaTecnica: false,
      trabalhando: false,
    });
    return { ok, caminho: "reenvio" };
  }
  // Sem plano: do começo, com a trava ligada ou não (é um pedido explícito).
  const ok = await marcarCompletoNaFila(videoJobId, { forcar: true });
  return { ok, caminho: "do-comeco" };
}
