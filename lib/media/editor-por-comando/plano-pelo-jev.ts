import { askClaude } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import { FICHAS } from "@/lib/media/editor-sob-medida/pecas";
import { resolverAncora, type Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { LINGUAGEM_DOS_ESTILOS, linguagemDoEstilo } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { validarPlano, type ElementoDoPlano, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import {
  COMPONENTES_COM_FOTO,
  CRITERIO_DO_TIPO,
  DURACAO_DO_TIPO,
  NOME_DO_TIPO,
  TIPOS_DECIDIVEIS,
  TIPOS_DE_ELEMENTO,
  custoPrevisto,
  estimarCusto,
  regrasDoRitmo,
  varianteDo,
  type Densidade,
  type QuantoDeMidia,
  type RegrasDoRitmo,
  type TipoDeElemento,
} from "@/lib/media/editor-por-comando/elementos";
import {
  FAMILIA,
  FAMILIAS,
  blocoDeEstiloDeReserva,
  cenarioPorPalavras,
  componenteDa,
  coresNoPrompt,
  familiaPorPalavras,
  promptDaMidia,
  type CenarioDaGravacao,
  type FamiliaVisual,
  type LinguagemDoVideo,
  type VarianteDoElemento,
} from "@/lib/media/editor-por-comando/linguagem";
import type { PedidoDaCena } from "@/lib/media/roteiro-em-texto";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";
import {
  candidatasATese,
  legendaDasRespostas,
  legendaPorPalavras,
  perguntaDaFrente,
  perguntaDaTese,
  perguntasDaLegenda,
  precisaDeVersaoNaFrente,
  teseDaResposta,
  teseServe,
  textosDaPeca,
  versaoDaResposta,
  type LegendaDoEstilo,
} from "@/lib/media/editor-por-comando/estilo-manda";
import { FUNDO, combinadaPorPalavras, decisaoDasRespostas, numeroDito, perguntasDaCombinada, promptDoFundoCombinado, segundosDoFundo, type DecisaoDaCombinada } from "@/lib/media/editor-por-comando/combinada";
import { contextoDoTrecho, movimentoEm, resumoDaLeitura, tiposPossiveis, trechoEm } from "@/lib/media/editor-por-comando/leitura-no-plano";
import {
  corEmIngles,
  corEmPortugues,
  instrucoesParaORedator,
  interpretacaoDasRespostas,
  interpretarPorPalavras,
  pedidoNasProps,
  perguntasDoPedido,
  resumoDaInterpretacao,
  type OndeDoPedido,
  type PedidoDoCliente,
} from "@/lib/media/editor-por-comando/pedido-do-cliente";

/**
 * O PEDIDO DO CLIENTE NUMA CENA É LEI (06/10/2026, 02h20). O que mudou aqui:
 *   - cada pedido cena a cena é INTERPRETADO PELO JEV (pedido-do-cliente.ts:
 *     tipo entre os tipos possíveis do trecho, forma, onde, cor, tamanho,
 *     texto literal, mais tempo), uma vez por pedido, antes das ondas; sem
 *     JEV, a reserva por palavras;
 *   - o pedido cai no UM momento da fala que ele mais cobre e entra ANTES da
 *     onda, forçado (p = 1): o ritmo, a cota, o dinheiro e o teto de vídeo não
 *     o derrubam; "sem efeito" deixa o momento limpo e a cobertura não o enche;
 *   - a interpretação vira `props.pedidoDoCliente` da peça e da inserção (o
 *     resolvedor e o worker leem: cor, tamanho, posição pedidos valem só ali);
 *   - o redator recebe o pedido literal e escreve a cena a partir dele, e o
 *     JEV CONFERE se o momento atende ao pedido; se não, uma segunda tentativa
 *     com o pedido no topo; se ainda não, aviso "pedido da cena X não pôde ser
 *     atendido" (sobMedida.avisos, que o card mostra);
 *   - o plano aprovado é REAPROVEITADO mesmo com pedidos novos: só os trechos
 *     pedidos são refeitos (`completarPlanoPeloJev`), e a linha que o cliente
 *     aprovou nas outras cenas continua valendo.
 */

/**
 * O CONTEXTO DO VÍDEO INTEIRO (06/10/2026, 01h; regra do Bruno: "a IA deve
 * decidir a edição baseado no contexto do vídeo", "de pastor a médico"). Todo
 * pedido ao JEV (linguagem, plano, cobertura, inscrever, conferência) e todo
 * pedido ao redator recebem a LEITURA do vídeo (lib/media/leitura-do-video.ts,
 * gravada em completoMontagem.leitura): o gênero, o cenário, as pessoas e, por
 * momento, o trecho lido (o que acontece, o que a imagem mostra, quem está em
 * cena e falando, tela ou quadro, movimento, área livre). Com ela:
 *   - os tipos oferecidos ao JEV por momento são os que o trecho permite
 *     (leitura-no-plano.ts, `tiposPossiveis`): nome e realce de quem fala na
 *     conversa, zoom no ponto e destaque com tela ou quadro, cartão de passo,
 *     frase-chave e slide em qualquer gênero; tela cheia e texto atrás saem
 *     quando há tela ou quadro (cobririam o conteúdo);
 *   - com movimento "muito", as peças ficam mais curtas e nada vai atrás da
 *     pessoa (o recorte em movimento falha);
 *   - o redator escreve a cena de cada imagem e vídeo a partir do cenário e
 *     do que está em cena (nada de prompt genérico), e o JEV confere.
 * Sem leitura (vídeo antigo), tudo segue como em 05/10.
 *
 * O PLANO PELO JEV EM DOIS EIXOS (05/10/2026, noite). Regra dura do Bruno:
 * "não quero hardcoded em nada; o editor tem de ser tão bom para um médico
 * quanto para um dev de IA". A versão da tarde só deixava o plano usar as
 * peças do catálogo do estilo (no Vox, 7 peças de papel, commit 4b2fb4a), e o
 * JEV saiu com 43 marca-textos em 52 peças e nenhum vídeo. Agora:
 *
 *   EIXO 1, O TIPO DE ELEMENTO (elementos.ts): o JEV escolhe, frase a frase,
 *   entre texto atrás da pessoa, ícone, imagem (janela ou tela cheia), B-roll
 *   em vídeo, dado, lista, citação, impacto, legenda de destaque e nada, com o
 *   trecho, o comando, o nicho, a marca e o que já entrou perto. As frases vão
 *   em ondas de seis (cada onda sabe o que a anterior decidiu, para variar);
 *   os blocos de ~5 min correm em paralelo. O ritmo é regra explícita em
 *   código: nada repete em sequência, nenhum tipo passa de 40%, a densidade
 *   vem do comando, o vídeo tem teto por minuto e tudo cabe no teto de custo
 *   (EDITOR_TETO_USD_POR_MINUTO, preço da tabela da Higgsfield).
 *
 *   EIXO 2, A LINGUAGEM VISUAL (linguagem.ts): o JEV escolhe a família de
 *   componentes pelo comando, pela marca e pelo nicho; o redator escreve UMA
 *   vez o bloco de estilo que vai em todo prompt de imagem e vídeo.
 *
 *   O REDATOR (Sonnet, uma chamada por bloco de ~5 min, em paralelo) só
 *   ESCREVE: os textos das peças e a cena de cada imagem e vídeo (o que
 *   aparece NESTE trecho, para ESTE nicho; nunca imagem genérica). O JEV
 *   confere cada texto e cada cena antes do render.
 *
 * AS TRÊS REGRAS DA NOITE DE 05/10 (depois do vídeo cmuvv0jje, Fé & Gestão):
 *
 *   1. O CENÁRIO DO CLIENTE NUNCA É TROCADO SEM PEDIDO EXPLÍCITO. O JEV lê o
 *      comando e responde se ele pede, com todas as letras, para trocar o
 *      fundo ("troque o meu fundo", "me coloque numa biblioteca"). Só com
 *      esse pedido existe um fundo atrás da pessoa (linguagem.cenario =
 *      "trocado"); senão a gravação fica como foi gravada e as artes entram,
 *      ficam um tempo e saem por cima dela (resolver.ts).
 *   2. A COBERTURA: nenhum trecho do vídeo fica mais de `maiorSemTroca`
 *      segundos sem elemento entrando ou saindo (`cobrirBuracos`): nos
 *      buracos, o JEV volta a escolher entre os momentos, com o limiar mais
 *      baixo. No vídeo de 17 min de hoje ficaram 203 s seguidos sem peça.
 *   3. CURTIR E INSCREVER: nos vídeos com destino YouTube, o JEV escolhe 2 a
 *      3 momentos (1 no curto), perto de momentos fortes, nunca nos primeiros
 *      15 s, para a animação de curtir e se inscrever (`decidirInscrever`).
 *
 * Nada disto conhece o nome de um estilo: a família só muda COMO cada peça é
 * desenhada e o texto dos prompts de imagem e vídeo.
 *
 * O caminho do diretor Opus (diretor.ts) continua atrás de
 * EDITOR_POR_COMANDO_DIRETOR=opus, para comparar.
 */

export const MODELO_DO_REDATOR = process.env.EDITOR_POR_COMANDO_REDATOR || "claude-sonnet-5";

/** O diretor por LLM (Opus) só quando pedido de propósito; o padrão é o JEV decidir. */
export function diretorPorLlm(): boolean {
  return process.env.EDITOR_POR_COMANDO_DIRETOR === "opus";
}

/** O teto de custo das imagens e vídeos gerados, em US$ por minuto de vídeo (padrão 1,20). */
export function tetoUsdPorMinuto(): number {
  const v = Number(process.env.EDITOR_TETO_USD_POR_MINUTO);
  return Number.isFinite(v) && v >= 0 ? v : 1.2;
}

/** O teto de B-roll em vídeo por minuto quando o comando pede muito (padrão 2 no corte, 0,6 no longo). */
export function videosPorMinutoMax(curto: boolean): number {
  const v = Number(process.env.EDITOR_VIDEOS_POR_MINUTO);
  return Number.isFinite(v) && v >= 0 ? v : curto ? 2 : 0.6;
}

export type EntradaDoPlanoPeloJev = {
  frases: Frase[];
  /** As palavras com tempo: a frase longa vira dois ou três momentos (as âncoras caem na palavra). */
  palavras?: Array<{ texto: string; inicio: number; fim: number }> | null;
  duracao: number;
  formato: "9:16" | "16:9";
  comando: ComandoDoVideo;
  /** A base antiga classificada (só a reserva sem o JEV). */
  base: string;
  titulo?: string | null;
  perfil?: string | null;
  projectId?: string | null;
  /** Os pedidos do cliente cena a cena (tela de roteiro), no tempo desta fala. */
  pedidos?: PedidoDaCena[];
  /** O nicho e o público do projeto (setup, linha editorial). */
  nicho?: string | null;
  /** O nome da marca do projeto. */
  marca?: string | null;
  /** As cores da marca (paleta inteira, na ordem do cliente) e as do comando. */
  paleta?: string[] | null;
  cores?: { acento: string; escuro: string; claro: string } | null;
  /** O teto em US$ por minuto (sem ele, EDITOR_TETO_USD_POR_MINUTO). */
  tetoUsdPorMinuto?: number;
  /** O vídeo vai para o YouTube (o completo sempre; o corte quando um destino dele é YouTube): a chamada de curtir e inscrever entra. */
  youtube?: boolean;
  /** A LEITURA DO VÍDEO INTEIRO (06/10): gênero, cenário, pessoas e os trechos lidos, no tempo desta fala. Sem ela, tudo segue como antes. */
  leitura?: LeituraDoVideo | null;
  /**
   * O DESIGN DE VÍDEO DO PROJETO NA BIBLIOTECA (06/10, card 714): a linguagem
   * em inglês que o Claude escreveu a partir do comando escrito do cliente
   * (designs_da_biblioteca), só quando a ligação é mais nova que o comando
   * (o design é desse comando). Sem ficha do catálogo, ela é a base do bloco
   * de estilo, lida inteira.
   */
  designGravado?: { linguagem: string; nome?: string | null } | null;
  /**
   * A PROVA SEM IA PAGA (06/10): o JEV e o redator simulados. Só os testes
   * puros passam isto; na esteira, ficam o cliente do JEV e o Claude.
   */
  simulacao?: { jev?: typeof perguntarAoJev; redator?: (sistema: string, pedido: string) => Promise<string> } | null;
};

/** O JEV deste pedido: o simulado da prova, ou o de verdade. */
const jevDe = (e: EntradaDoPlanoPeloJev): typeof perguntarAoJev => e.simulacao?.jev ?? perguntarAoJev;
const jevDisponivel = (e: EntradaDoPlanoPeloJev): boolean => Boolean(e.simulacao?.jev) || jevLigado();
const redatorDe = (e: EntradaDoPlanoPeloJev, operacao: string, maxTokens: number, timeoutMs: number) =>
  e.simulacao?.redator ?? ((sistema: string, pedido: string) => askClaude(sistema, pedido, { model: MODELO_DO_REDATOR, maxTokens, effort: "low", timeoutMs, usage: { projectId: e.projectId ?? undefined, operation: operacao } }));

/** Um momento decidido pelo JEV, antes do texto. */
export type MomentoDecidido = {
  id: string;
  tipo: Exclude<TipoDeElemento, "nada">;
  variante: VarianteDoElemento;
  /** A peça Remotion que desenha o tipo na linguagem; null: é inserção (imagem em tela cheia, vídeo). */
  peca: string | null;
  midia: "imagem" | "video" | null;
  /** Índices das frases que o elemento cobre (inclusivos) e as âncoras do momento na fala. */
  f0: number;
  f1: number;
  de: string;
  ate: string;
  /** A fala do momento (o redator e a conferência leem). */
  fala: string;
  /** A fala em volta (o momento anterior, o próprio e o seguinte): a conferência confere o texto contra ela. */
  falaEmVolta?: string;
  inicio: number;
  fim: number;
  tela: boolean;
  /** Onde o ícone fica, quando é ícone. */
  onde?: OndeDoPedido;
  custo: number;
  /** O pedido do cliente que caiu aqui, quando houve (o texto dele). */
  pedido?: string | null;
  /** A interpretação do pedido pelo JEV (06/10): vira `props.pedidoDoCliente` da peça. */
  pedidoDoCliente?: PedidoDoCliente | null;
  /** Entrou pela cobertura (o buraco maior que a régua), pela chamada de inscrever ou por pedido do cliente, não pela onda. */
  origem?: "onda" | "cobertura" | "inscrever" | "existente" | "pedido";
  /** O que a câmera mostra neste momento, pela leitura do vídeo (06/10): o redator e a conferência leem. */
  emCena?: string;
  /** A PEÇA COMBINADA (06/10): o fundo e a ligação que o JEV escolheu para este momento (combinada.ts). */
  combinada?: DecisaoDaCombinada;
};

export type DecisaoDaLinguagem = {
  familia: FamiliaVisual;
  densidade: Densidade;
  video: QuantoDeMidia;
  confianca: number | null;
  cenario: CenarioDaGravacao;
  /** O estilo do catálogo cuja ficha pesquisada é a base do bloco e das peças (06/10): da referência do comando, ou identificado pelo JEV. */
  estilo?: string | null;
  /** A legenda que o comando pede (06/10, noite; estilo-manda.ts): posição, tamanho, letra e palavras por vez, lidas pelo JEV. */
  legenda?: LegendaDoEstilo | null;
};

/** A linguagem do vídeo com a ficha do estilo do catálogo (06/10): o id e as peças em inglês, para o redator dos momentos. */
type LinguagemComFicha = LinguagemDoVideo & { estiloDoCatalogo?: string | null; pecasDoEstilo?: string | null; baseDoBloco?: "ficha" | "biblioteca" | null };

/**
 * A FICHA NA LINGUAGEM (card 714): o id do estilo e as peças em inglês,
 * lidas direto de LINGUAGEM_DOS_ESTILOS. Vale para o plano novo e para o
 * plano reaproveitado de antes de 06/10, que não gravou as peças: elas são
 * relidas pelo estilo do comando. Sem ficha, a linguagem segue como veio.
 */
export function linguagemComFicha(ling: LinguagemDoVideo, estilo: string | null | undefined): LinguagemComFicha {
  const atual = ling as LinguagemComFicha;
  const id = atual.estiloDoCatalogo && linguagemDoEstilo(atual.estiloDoCatalogo) ? atual.estiloDoCatalogo : estilo && linguagemDoEstilo(estilo) ? estilo : null;
  const ficha = linguagemDoEstilo(id);
  return ficha && id ? { ...atual, estiloDoCatalogo: id, pecasDoEstilo: ficha.pecas } : atual;
}

/** A sugestão de ritmo da ficha ao JEV (nunca regra), para os pedidos de decisão; vazio sem ficha. */
function ritmoDaFichaAoJev(estilo: string | null | undefined): string {
  const f = linguagemDoEstilo(estilo);
  return f && estilo ? `\nSugestão de ritmo do estilo "${estilo}" (só sugestão, nunca regra; o momento manda): ${f.ritmo}.` : "";
}

// ─────────────────────────────── eixo 2: a linguagem ───────────────────────────────

/** O contexto de TODO pedido ao JEV e ao redator: o comando, o nicho, a marca, o perfil e a leitura do vídeo inteiro (06/10). */
const contextoDoProjeto = (e: EntradaDoPlanoPeloJev) =>
  [`Comando do cliente: "${e.comando.texto}"`, e.nicho ? `Nicho e público do projeto: ${e.nicho}` : "", e.marca ? `Marca: ${e.marca}` : "", e.perfil ? e.perfil.slice(0, 600) : "", resumoDaLeitura(e.leitura)].filter(Boolean).join("\n");

/** O JEV escolhe a família da linguagem, a densidade, o quanto de vídeo e se o comando pede para trocar o cenário. */
export async function decidirLinguagem(e: EntradaDoPlanoPeloJev): Promise<DecisaoDaLinguagem> {
  const daReferencia = estiloDoComando(e.comando);
  const recuo: DecisaoDaLinguagem = { familia: familiaPorPalavras(e.comando.texto), densidade: "medio", video: "algum", confianca: null, cenario: cenarioPorPalavras(e.comando.texto), estilo: daReferencia, legenda: legendaPorPalavras(e.comando.texto) };
  if (!jevDisponivel(e)) return recuo;
  try {
    const r = await jevDe(e)(
      { projectId: e.projectId, etapa: "editor-por-comando-linguagem", state: contextoDoProjeto(e) },
      {
        familia: {
          type: "choice",
          instructions: "Qual linguagem visual o comando do cliente pede para desenhar TODOS os elementos do vídeo (textos, ícones, imagens, vídeos)? Leve em conta o nicho, a marca e, quando houver, a leitura do vídeo (o gênero e o cenário da gravação) quando o comando não diz.",
          criteria: Object.fromEntries(FAMILIAS.map((f) => [f.id, f.criterio])),
        },
        // O ESTILO DO CATÁLOGO pelo texto do comando (06/10): só quando a referência não diz; a ficha pesquisada dele
        // vira a base do bloco de imagem e das peças. É dado da ficha entrando no prompt, não condição no código.
        ...(daReferencia
          ? {}
          : {
              estilo: {
                type: "choice" as const,
                instructions: "O comando do cliente descreve um destes estilos do catálogo (a linguagem, as peças e o ritmo batem com a ficha)? Se descreve uma linguagem própria que não é nenhum deles, responda nenhum.",
                criteria: { ...Object.fromEntries(Object.entries(LINGUAGEM_DOS_ESTILOS).map(([id, f]) => [id, f.comando.slice(0, 220)])), nenhum: "nenhum destes: o comando descreve outra linguagem" },
              },
            }),
        densidade: {
          type: "choice",
          instructions: "Que ritmo de elementos na tela o comando pede (ou combina com o nicho)?",
          criteria: { calmo: "calmo, com respiro, poucos elementos, a pessoa domina", medio: "médio, algo novo a cada 6 a 10 segundos", rapido: "rápido, algo novo a cada 3 a 5 segundos, retenção alta" },
        },
        // O vídeo só fica de fora quando o comando DIZ isso (prova do médico de 05/10: o "nenhum" saía de um comando que só não falava em vídeo).
        semVideo: { type: "noul", instructions: "O comando do cliente PROÍBE ou dispensa EXPLICITAMENTE vídeo gerado, cenas em movimento ou B-roll (por exemplo: \"sem vídeo\", \"só texto\", \"nada de imagem gerada\")?" },
        video: {
          type: "choice",
          instructions: "Quanto B-roll em VÍDEO gerado (cenas com movimento) combina com este comando e este nicho?",
          criteria: { muito: "muito: cenas em movimento frequentes", algum: "algum: vídeo nos momentos que pedem movimento", pouco: "pouco: quase tudo com texto, ícone e imagem parada" },
        },
        // O CENÁRIO (regra 1 de 05/10 à noite): só o pedido com todas as letras troca o fundo da gravação.
        trocarCenario: {
          type: "noul",
          instructions:
            "O comando do cliente PEDE EXPLICITAMENTE para trocar o fundo ou o cenário da gravação, ou para colocar a pessoa dentro de um cenário (por exemplo: \"troque o meu fundo\", \"me coloque numa biblioteca antiga\", \"quero um cenário de estúdio atrás de mim\")? Descrever um estilo visual, uma colagem, papel, neon ou um acabamento para as artes NÃO é pedir para trocar o cenário: responda sim só quando o texto pede a troca do fundo em que a pessoa aparece.",
        },
        // A LEGENDA DO ESTILO (06/10, noite): posição, tamanho, letra e palavras por vez que o comando pede.
        ...perguntasDaLegenda(),
      }
    );
    const fam = r.familia?.type === "choice" ? r.familia : null;
    const familia = decidirChoice(r.familia, FAMILIAS.map((f) => f.id), recuo.familia, 0.3);
    const semVideo = (probabilidadeDeSim(r.semVideo) ?? 0) >= 0.7;
    const trocar = probabilidadeDeSim(r.trocarCenario);
    // O estilo identificado pelo JEV só vale com confiança firme (metade); "nenhum" é resposta.
    const identificado = daReferencia ?? (r.estilo ? decidirChoice(r.estilo, [...Object.keys(LINGUAGEM_DOS_ESTILOS), "nenhum"], "nenhum", 0.5) : "nenhum");
    return {
      familia,
      densidade: decidirChoice(r.densidade, ["calmo", "medio", "rapido"] as const, "medio", 0.3),
      video: semVideo ? "nenhum" : decidirChoice(r.video, ["muito", "algum", "pouco"] as const, "algum", 0.3),
      confianca: fam ? +(fam.confidence ?? 0).toFixed(2) : null,
      // Sem resposta do JEV, a reserva por palavras; com resposta, só o "sim" firme troca.
      cenario: trocar === null ? recuo.cenario : trocar >= 0.7 ? "trocado" : "gravacao",
      estilo: identificado && identificado !== "nenhum" ? identificado : null,
      legenda: legendaDasRespostas(r, recuo.legenda ?? null),
    };
  } catch {
    return recuo;
  }
}

const SISTEMA_DO_ESTILO = `Você escreve o BLOCO DE ESTILO de um vídeo: um parágrafo em INGLÊS, de 35 a 60 palavras, que vai no fim de TODO prompt de imagem e de vídeo gerado para este vídeo, para que todas as imagens e cenas tenham a mesma linguagem visual.

O bloco descreve SÓ o tratamento visual (técnica, luz, cor, textura, lente, grão, composição, material de acabamento), nunca a cena e NUNCA objeto, lugar ou assunto (nada de escritório, mesa, documento, aperto de mão, carro, palco, cidade, jornal, mapa, tela, produto): o QUE aparece vem da cena de cada momento, que vai antes do bloco; o estilo só muda COMO é desenhado. A lista do que evitar é curta (até 6 itens). Ele traduz o comando do cliente com fidelidade, combina com o nicho e com a marca, e cita as cores da marca como acento nos detalhes. Quando houver a leitura do vídeo (o cenário da gravação, o gênero), o acabamento conversa com ela: as imagens vão aparecer ao lado dessa gravação, com a luz e o ambiente dela. Sem nome de marca de terceiros, sem nome de artista vivo, sem pessoa real.

Quando houver A LINGUAGEM PESQUISADA DO ESTILO (a ficha do estilo do catálogo que o comando veio), o bloco NASCE dela e fica nos mesmos 35 a 60 palavras: mantém a luz, a cor, o grão, a composição, o acabamento e a lista do que evitar da ficha, e muda só o que o comando do cliente pede diferente (o comando do cliente vale sobre a ficha) e o que a marca e o nicho pedem; nunca a substitui por uma descrição genérica da família.

Responda só JSON: {"bloco":"..."}`;

/**
 * O AJUSTE AO CLIENTE (card 714): quando a base do bloco vai INTEIRA (a
 * ficha do estilo da miniatura sem edição, ou a linguagem do design do
 * projeto na biblioteca), o redator não reescreve a base; escreve só uma ou
 * duas frases que levam aquela linguagem ao nicho, ao público e à gravação.
 */
const SISTEMA_DO_AJUSTE = `Você recebe o BLOCO DE ESTILO pronto de um vídeo (em inglês): a linguagem visual que vai, INTEIRA, no fim de todo prompt de imagem e de vídeo gerado para este vídeo. Você NÃO reescreve esse bloco.

Escreva só o AJUSTE: uma ou duas frases em INGLÊS, de 15 a 45 palavras, que entram logo depois do bloco e dizem como o TRATAMENTO dessa linguagem encontra ESTE cliente: o tom e a temperatura de cor, o contraste, a luz e, quando houver a leitura do vídeo, a luz e o clima da gravação ao lado da qual as imagens vão aparecer. SÓ tratamento: NUNCA objeto, lugar ou assunto (nada de escritório, mesa, documento, carro, palco, cidade, produto), porque o QUE aparece vem da cena de cada momento e um objeto aqui vira o assunto de todas as imagens. Nunca contradiga o bloco, nunca repita o que ele já diz, nunca descreva uma cena. Sem cores (as da marca entram depois), sem nome de marca de terceiros, sem artista vivo, sem pessoa real, sem travessão.

Responda só JSON: {"ajuste":"..."}`;

/**
 * O ESTILO DO CATÁLOGO por trás do comando (06/10, manhã): a miniatura clicada
 * grava `comando.referencia` com o id do catálogo; quando ele tem ficha
 * pesquisada (LINGUAGEM_DOS_ESTILOS), ela é a base obrigatória do bloco de
 * estilo e das peças. Sem referência, o JEV pode identificar o estilo pelo
 * texto do comando (`decidirLinguagem`). Null: segue como sempre.
 */
export function estiloDoComando(comando: Pick<ComandoDoVideo, "referencia">): string | null {
  const id = comando.referencia ?? null;
  return id && linguagemDoEstilo(id) ? id : null;
}

/** A ficha do estilo no pedido ao redator (o bloco de imagem e as peças, em inglês), como base obrigatória. */
function fichaDoEstiloNoPedido(estilo: string | null | undefined): string {
  const f = linguagemDoEstilo(estilo);
  if (!f || !estilo) return "";
  return [`# A LINGUAGEM PESQUISADA DO ESTILO "${estilo}" (base obrigatória: adapte à marca e ao nicho, não substitua)`, `Bloco de imagem e B-roll: ${f.bloco}`, `Como cada elemento se desenha: ${f.pecas}`].join("\n");
}

/**
 * DE ONDE VEM A BASE DO BLOCO DE ESTILO (card 714), lida direto, sem passar
 * pelo texto do comando:
 *   - "ficha": o estilo do catálogo (o `estilo` decidido pelo JEV ou a
 *     referência do comando) tem ficha pesquisada; vai INTEIRA quando o
 *     comando é o da miniatura sem edição (origem "referencia" com a mesma
 *     referência); com o comando editado ou só identificado pelo JEV, o
 *     redator reescreve a partir dela (o comando do cliente vale sobre a ficha);
 *   - "biblioteca": sem ficha, a linguagem do design de vídeo do projeto
 *     (escrita pelo Claude a partir deste comando), INTEIRA;
 *   - null: só a semente da família, como antes.
 * Nenhuma condição por estilo: a ficha é conteúdo, a origem do comando é dado.
 */
export type BaseDoBloco = { texto: string; de: "ficha" | "biblioteca"; estilo: string | null; inteira: boolean };

export function baseDoBlocoDeEstilo(e: Pick<EntradaDoPlanoPeloJev, "comando" | "designGravado">, estilo?: string | null): BaseDoBloco | null {
  const doCatalogo = estilo && linguagemDoEstilo(estilo) ? estilo : estiloDoComando(e.comando);
  const ficha = linguagemDoEstilo(doCatalogo);
  if (ficha && doCatalogo) return { texto: ficha.bloco, de: "ficha", estilo: doCatalogo, inteira: e.comando.origem === "referencia" && e.comando.referencia === doCatalogo };
  const gravada = limparBloco(e.designGravado?.linguagem ?? "").slice(0, 900);
  if (gravada.split(" ").length >= 12) return { texto: gravada, de: "biblioteca", estilo: null, inteira: true };
  return null;
}

/** Espaços juntos e nenhum travessão (vira vírgula). */
function limparBloco(t: string): string {
  return String(t ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .trim();
}

/** As partes do bloco num parágrafo só, cada uma terminada em ponto. */
function juntarBloco(...partes: string[]): string {
  return partes
    .map((p) => limparBloco(p))
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
}

/**
 * O redator escreve o bloco de estilo (uma chamada curta); sem ele, a reserva.
 * `redator` é o askClaude; a prova sem IA paga (scripts/testes/estilos-0610 e
 * fichas-no-editor-0610) passa um simulado. `estilo`: o id do catálogo cuja
 * ficha pesquisada é a base (06/10); sem ele, o da referência do comando; sem
 * nenhum, a linguagem do design do projeto na biblioteca; sem nada, só a
 * semente da família.
 *
 * Com a base INTEIRA (card 714), o bloco é a base palavra por palavra, mais o
 * ajuste ao cliente que o redator escreve, mais as cores da marca; sem o
 * redator, a base e as cores (a ficha nunca se perde).
 */
export async function escreverBlocoDeEstilo(
  e: EntradaDoPlanoPeloJev,
  familia: FamiliaVisual,
  redator: typeof askClaude = askClaude,
  estilo?: string | null
): Promise<{ bloco: string; origem: "redator" | "reserva"; erro?: string; estilo?: string | null; base?: "ficha" | "biblioteca" | null }> {
  const cores = coresNoPrompt(e.paleta, e.cores);
  const base = baseDoBlocoDeEstilo(e, estilo);
  const doCatalogo = base?.estilo ?? null;
  const de = base?.de ?? null;
  const chamar = e.simulacao?.redator ?? ((sistema: string, pedido: string) => redator(sistema, pedido, { model: MODELO_DO_REDATOR, maxTokens: 4000, effort: "low", timeoutMs: 90_000, usage: { projectId: e.projectId ?? undefined, operation: "editor-por-comando-estilo" } }));
  const gravacao = e.leitura?.cenario ? `A gravação ao lado da qual as imagens vão aparecer: ${e.leitura.cenario.slice(0, 220)}.` : "";

  // A base inteira: o redator só escreve o ajuste ao cliente.
  if (base?.inteira) {
    const reserva = juntarBloco(base.texto, cores);
    try {
      const r = await chamar(SISTEMA_DO_AJUSTE, [contextoDoProjeto(e), `# O BLOCO DE ESTILO (pronto; vai inteiro, não reescreva)\n${base.texto}`, gravacao].filter(Boolean).join("\n"));
      const j = extrairJson(r) as { ajuste?: unknown };
      const ajuste = typeof j?.ajuste === "string" ? limparBloco(j.ajuste) : "";
      if (ajuste.split(" ").length < 6) return { bloco: reserva, origem: "reserva", erro: "ajuste curto demais", estilo: doCatalogo, base: de };
      return { bloco: juntarBloco(base.texto, ajuste.slice(0, 300), cores), origem: "redator", estilo: doCatalogo, base: de };
    } catch (err) {
      return { bloco: reserva, origem: "reserva", erro: err instanceof Error ? err.message.slice(0, 120) : String(err), estilo: doCatalogo, base: de };
    }
  }

  // A base reescrita (comando editado ou estilo identificado pelo JEV), ou só a família.
  const reserva = base ? juntarBloco(base.texto, `As the client described it (Portuguese), which wins over the finish above where they differ: "${e.comando.texto.replace(/\s+/g, " ").slice(0, 280)}"`, cores) : blocoDeEstiloDeReserva(familia, e.comando.texto, e.nicho, cores);
  try {
    const r = await chamar(SISTEMA_DO_ESTILO, [contextoDoProjeto(e), `Família visual escolhida: ${FAMILIA[familia].nome} (sementes: ${FAMILIA[familia].semente}).`, fichaDoEstiloNoPedido(doCatalogo), gravacao, cores].filter(Boolean).join("\n"));
    const j = extrairJson(r) as { bloco?: unknown };
    const bloco = typeof j?.bloco === "string" ? limparBloco(j.bloco) : "";
    if (bloco.split(" ").length < 12) return { bloco: reserva, origem: "reserva", erro: "bloco curto demais", estilo: doCatalogo, base: de };
    return { bloco: `${bloco.slice(0, base ? 1100 : 700)}${/#[0-9a-f]{6}/i.test(bloco) ? "" : ` ${cores}`}`.trim(), origem: "redator", estilo: doCatalogo, base: de };
  } catch (err) {
    return { bloco: reserva, origem: "reserva", erro: err instanceof Error ? err.message.slice(0, 120) : String(err), estilo: doCatalogo, base: de };
  }
}

// ─────────────────────────────── eixo 1: o tipo, momento a momento ───────────────────────────────

const ONDA = 6;
const BLOCO_SEG = 300;
const FORMAS = ["janela", "tela-cheia"] as const;
const ONDES = ["canto", "acima-da-cabeca", "ao-lado"] as const;
/** A chamada de curtir e inscrever nunca entra antes disto (s). */
const INSCREVER_DEPOIS_DE = 15;

/**
 * UM MOMENTO DA FALA: a frase inteira, ou um pedaço dela quando a frase é
 * longa (mais de 4,5 s), cortada na vírgula, nos dois-pontos ou no meio. Na
 * prova do médico de 05/10 as frases tinham 5 a 8 s e só cabia um elemento
 * por frase (4 num minuto): o momento é a unidade de decisão, não a frase.
 * As âncoras são as da fala ("F3", "F3:sal#1", "F3:dia#1/fim").
 */
export type MomentoDaFala = { k: number; i0: number; i1: number; inicio: number; fim: number; texto: string; de: string; ate: string };

const normal = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");
/** A mesma comparação de resolverAncora (prefixo de 4 letras), para a contagem "#n" bater. */
const casa = (w: string, alvo: string) => Boolean(w) && (w === alvo || (alvo.length >= 4 && w.startsWith(alvo)) || (w.length >= 4 && alvo.startsWith(w)));

function ancoraDaPalavra(f: Frase, k: number, palavras: Array<{ texto: string }>, i: number, fim: boolean): string {
  const alvo = normal(palavras[i]?.texto ?? "");
  if (!alvo) return fim ? `F${k}/fim` : `F${k}`;
  let n = 0;
  for (let j = f.de; j <= i; j++) if (casa(normal(palavras[j]?.texto ?? ""), alvo)) n++;
  return `F${k}:${alvo}#${Math.max(1, n)}${fim ? "/fim" : ""}`;
}

export function momentosDaFala(frases: Frase[], palavras?: Array<{ texto: string; inicio: number; fim: number }> | null): MomentoDaFala[] {
  const saida: MomentoDaFala[] = [];
  frases.forEach((f, k) => {
    const inteira: MomentoDaFala = { k, i0: f.de, i1: f.ate, inicio: f.inicio, fim: f.fim, texto: f.texto, de: `F${k}`, ate: `F${k}/fim` };
    if (!palavras?.length || f.fim - f.inicio <= 4.5 || f.ate - f.de < 6) return void saida.push(inteira);
    // Os cortes: depois de vírgula, ponto e vírgula ou dois-pontos, com pedaços de pelo menos 1,5 s; sem pontuação, no meio.
    const cortes: number[] = [];
    let ini = f.de;
    for (let i = f.de; i < f.ate; i++) {
      if (/[,;:]$/.test(palavras[i].texto) && palavras[i].fim - palavras[ini].inicio >= 1.5 && f.fim - palavras[i + 1].inicio >= 1.5) {
        cortes.push(i);
        ini = i + 1;
      }
    }
    if (!cortes.length) {
      const meio = f.de + Math.floor((f.ate - f.de) / 2);
      if (palavras[meio].fim - f.inicio >= 1.5 && f.fim - palavras[meio + 1].inicio >= 1.5) cortes.push(meio);
    }
    if (!cortes.length) return void saida.push(inteira);
    let de = f.de;
    for (const c of [...cortes, f.ate]) {
      saida.push({
        k,
        i0: de,
        i1: c,
        inicio: palavras[de].inicio,
        fim: palavras[c].fim,
        texto: palavras.slice(de, c + 1).map((p) => p.texto).join(" "),
        de: de === f.de ? `F${k}` : ancoraDaPalavra(f, k, palavras, de, false),
        ate: c === f.ate ? `F${k}/fim` : ancoraDaPalavra(f, k, palavras, c, true),
      });
      de = c + 1;
    }
  });
  return saida;
}

// ─────────────────────────────── o pedido do cliente (lei) ───────────────────────────────

/** Um pedido do cliente já preso ao momento da fala que ele mais cobre, com a interpretação do JEV. */
export type PedidoNoMomento = { j: number; pedido: PedidoDaCena; interp: PedidoDoCliente };

/** O momento da fala que o pedido mais cobre (o que mais se sobrepõe; empate: o que começa antes). */
function momentoDoPedido(U: MomentoDaFala[], p: PedidoDaCena): number {
  let melhor = -1;
  let maior = 0;
  U.forEach((u, j) => {
    const d = Math.min(u.fim, p.fim) - Math.max(u.inicio, p.inicio);
    if (d > maior + 1e-6) {
      maior = d;
      melhor = j;
    }
  });
  if (melhor >= 0) return melhor;
  // Sem sobreposição (tempos deslizaram): o momento mais perto do começo do pedido.
  return U.reduce((m, u, j) => (Math.abs(u.inicio - p.inicio) < Math.abs(U[m].inicio - p.inicio) ? j : m), 0);
}

/**
 * A INTERPRETAÇÃO DOS PEDIDOS PELO JEV (06/10): uma pergunta por item de cada
 * pedido (tipo, forma, onde, cor, tamanho, texto literal, mais tempo), num
 * lote só; sem JEV (ou se ele falhar), a reserva por palavras. Dois pedidos
 * no mesmo momento viram um só, com os textos juntos.
 */
export async function interpretarPedidos(e: EntradaDoPlanoPeloJev, U: MomentoDaFala[], avisos: string[]): Promise<Map<number, PedidoNoMomento>> {
  const saida = new Map<number, PedidoNoMomento>();
  const lista = (e.pedidos ?? []).filter((p) => p.texto.trim());
  if (!lista.length || !U.length) return saida;
  const porMomento = new Map<number, PedidoDaCena>();
  for (const p of lista) {
    const j = momentoDoPedido(U, p);
    const ja = porMomento.get(j);
    porMomento.set(j, ja ? { ...ja, inicio: Math.min(ja.inicio, p.inicio), fim: Math.max(ja.fim, p.fim), texto: `${ja.texto}; ${p.texto}` } : p);
  }
  const itens = [...porMomento.entries()];
  const tipos = itens.map(([j]) => tiposPossiveis(TIPOS_DE_ELEMENTO, e.leitura, trechoEm(e.leitura, U[j].inicio)));
  let r: Record<string, RespostaDoJev> = {};
  if (jevDisponivel(e)) {
    try {
      r = await jevDe(e)(
        { projectId: e.projectId, etapa: "editor-por-comando-pedido", state: `${contextoDoProjeto(e)}\nO cliente leu o roteiro cena a cena e deixou pedidos em cenas específicas. O pedido dele é lei naquela cena: interprete o que ele quer ver, não o que seria melhor.` },
        Object.assign({}, ...itens.map(([j, p], i) => perguntasDoPedido(i, p.texto, p.fala || U[j].texto, tipos[i])))
      );
    } catch (err) {
      avisos.push(`JEV falhou na interpretação dos pedidos (vale a reserva por palavras): ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }
  itens.forEach(([j, p], i) => {
    const interp = Object.keys(r).length ? interpretacaoDasRespostas(i, p.texto, r, tipos[i]) : interpretarPorPalavras(p.texto);
    saida.set(j, { j, pedido: p, interp });
  });
  return saida;
}

/** O candidato de um pedido: o tipo que o JEV interpretou com p = 1; forma e onde obedecem ao pedido. */
function candidatoDoPedido(U: MomentoDaFala[], pm: PedidoNoMomento): Candidato | null {
  const { interp } = pm;
  if (interp.tipo === "nada" || interp.tipo === "inscrever") return null;
  return {
    j: pm.j,
    u: U[pm.j],
    pedido: interp.pedido,
    pedidoDoCliente: interp,
    forcado: true,
    candidatos: [{ t: interp.tipo, p: 1 }],
    pNada: 0,
    forma: interp.forma,
    onde: interp.posicao ?? "canto",
    movimento: interp.tipo === "video" ? 1 : 0,
  };
}

/** Os pedidos de um bloco entram ANTES da onda, forçados; o que não coube vira aviso (nunca some em silêncio). */
function encaixarPedidos(e: EntradaDoPlanoPeloJev, R: RegrasDoRitmo, familia: FamiliaVisual, U: MomentoDaFala[], indices: number[], pedidos: Map<number, PedidoNoMomento>, st: Estado, orcamento: Orcamento, avisos: string[]): void {
  for (const j of indices) {
    const pm = pedidos.get(j);
    if (!pm || st.momentos.some((m) => m.id === `j${j}`)) continue;
    const c = candidatoDoPedido(U, pm);
    if (!c) continue;
    const m = encaixar(e, R, familia, U, c, st, orcamento, "onda");
    if (m) registrar(st, { ...m, origem: "pedido" });
    else avisos.push(`pedido da cena ${mmssDe(U[j].inicio)} não coube no plano ("${pm.interp.pedido.slice(0, 80)}": ${resumoDaInterpretacao(pm.interp)})`);
  }
}

const mmssDe = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, "0")}`;

type Estado = {
  momentos: MomentoDecidido[];
  segundosDeTela: number;
  videos: number;
  gasto: number;
  porTipo: Partial<Record<TipoDeElemento, number>>;
};

type Orcamento = { usd: number; videos: number; duracao: number; inicio: number };

const pTipo = (r: RespostaDoJev | undefined): Record<string, number> => (r && r.type === "choice" ? r.probabilities ?? { [r.choice]: 1 } : {});

/** O que o JEV respondeu sobre um momento (a memória que a cobertura reaproveita, sem perguntar de novo). */
type Candidato = { j: number; u: MomentoDaFala; pedido: string | null; pedidoDoCliente?: PedidoDoCliente | null; forcado: boolean; candidatos: Array<{ t: Exclude<TipoDeElemento, "nada">; p: number }>; pNada: number; forma: "janela" | "tela-cheia"; onde: OndeDoPedido; movimento: number };

/**
 * As perguntas de uma onda ao JEV (o tipo, a forma da imagem, o lugar do
 * ícone, a ênfase e o movimento). Com a leitura do vídeo (06/10), cada momento
 * leva o trecho lido (o que acontece, o que a imagem mostra, quem está em
 * cena, área livre) e os tipos oferecidos são os que o trecho permite.
 */
function perguntasDaOnda(e: EntradaDoPlanoPeloJev, U: MomentoDaFala[], onda: number[], recentes: string): Record<string, PerguntaDoJev> {
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const j of onda) {
    const ant = U[j - 1]?.texto ? `Fala anterior: "${U[j - 1].texto.slice(0, 160)}". ` : "";
    const tr = trechoEm(e.leitura, U[j].inicio);
    const cena = contextoDoTrecho(e.leitura, tr);
    const ctx = `${ant}MOMENTO AVALIADO (${U[j].inicio.toFixed(0)} s): "${U[j].texto.slice(0, 280)}".${cena ? ` ${cena}` : ""}`;
    const tipos = tiposPossiveis(TIPOS_DE_ELEMENTO, e.leitura, tr);
    perguntas[`tipo_${j}`] = {
      type: "choice",
      instructions: `${ctx} ${recentes} Qual elemento visual serve melhor a ESTE momento, para este nicho e este comando${cena ? ", pelo que a fala diz E pelo que a câmera mostra" : ""}?`,
      criteria: Object.fromEntries(tipos.map((t) => [t, CRITERIO_DO_TIPO[t]])),
    };
    perguntas[`forma_${j}`] = { type: "choice", instructions: `${ctx} Se este momento ganhasse uma IMAGEM, ela fica numa janela ao lado da pessoa ou ocupa a tela cheia?`, criteria: { janela: "janela ao lado da pessoa: a pessoa segue falando, a imagem ilustra", "tela-cheia": "tela cheia: a imagem é o assunto e merece a tela toda por alguns segundos" } };
    perguntas[`onde_${j}`] = { type: "choice", instructions: `${ctx} Se este momento ganhasse um ÍCONE animado, onde ele fica?`, criteria: { canto: "no canto de cima, discreto", "acima-da-cabeca": "acima da cabeça da pessoa, como um pensamento", "ao-lado": "ao lado da pessoa, grande, com o rótulo" } };
    perguntas[`enfase_${j}`] = { type: "noul", instructions: `${ctx} Há neste momento UMA palavra forte (o número, o nome, a palavra da tese, a virada) que mereça um soco de câmera?` };
    perguntas[`movimento_${j}`] = { type: "noul", instructions: `${ctx} Se este momento ganhasse uma imagem, ela ficaria MELHOR EM MOVIMENTO (uma ação acontecendo, um lugar com vida, uma metáfora que se mexe) do que parada?` };
  }
  return perguntas;
}

/**
 * As respostas de uma onda viram candidatos (um por momento), guardados na
 * memória. O momento com PEDIDO do cliente não entra aqui: ele já foi
 * decidido pela interpretação do pedido (`encaixarPedidos`) e, se o pedido
 * é "sem efeito", nada o enche.
 */
function candidatosDaOnda(e: EntradaDoPlanoPeloJev, U: MomentoDaFala[], onda: number[], r: Record<string, RespostaDoJev>, enfases: string[], memoria: Map<number, Candidato>, pedidos: Map<number, PedidoNoMomento>): Candidato[] {
  const depurar = process.env.EDITOR_DOIS_EIXOS_DEPURAR === "1";
  const saida: Candidato[] = [];
  for (const j of onda) {
    const u = U[j];
    if ((probabilidadeDeSim(r[`enfase_${j}`]) ?? 0) >= 0.6 && !enfases.includes(u.de)) enfases.push(u.de);
    if (pedidos.has(j)) continue;
    const probs = pTipo(r[`tipo_${j}`]);
    if (!Object.keys(probs).length) continue;
    const pNada = probs.nada ?? 0;
    // Só os tipos que a pergunta ofereceu têm probabilidade; os outros ficam em zero e nunca entram.
    const candidatos = TIPOS_DECIDIVEIS.map((t) => ({ t: t as Exclude<TipoDeElemento, "nada">, p: probs[t] ?? 0 }))
      .filter((c) => c.p > 0)
      .sort((a, b) => b.p - a.p);
    if (!candidatos[0]) continue;
    if (depurar) console.log(`[dois-eixos] U${j} ${u.inicio.toFixed(1)}s nada=${pNada.toFixed(2)} ${candidatos.slice(0, 3).map((c) => `${c.t}=${c.p.toFixed(2)}`).join(" ")} "${u.texto.slice(0, 50)}"`);
    const c: Candidato = { j, u, pedido: null, forcado: false, candidatos, pNada, forma: decidirChoice(r[`forma_${j}`], FORMAS, "janela", 0.3), onde: decidirChoice(r[`onde_${j}`], ONDES, "canto", 0.3), movimento: probabilidadeDeSim(r[`movimento_${j}`]) ?? 0 };
    memoria.set(j, c);
    saida.push(c);
  }
  return saida;
}

/** Tenta pôr um candidato no estado, com as regras do ritmo (ou as da cobertura, mais folgadas). */
function encaixar(e: EntradaDoPlanoPeloJev, R: RegrasDoRitmo, familia: FamiliaVisual, U: MomentoDaFala[], c: Candidato, st: Estado, orcamento: Orcamento, modo: "onda" | "cobertura"): MomentoDecidido | null {
  const { j, u, forcado, forma, onde, movimento } = c;
  const pedido = c.pedidoDoCliente ?? null;
  // A IMAGEM QUE PEDE MOVIMENTO (o JEV respondeu) vira B-roll em vídeo enquanto houver teto: o vídeo vem antes, com a força da imagem.
  const candidatos = c.candidatos.flatMap((x) => (x.t === "imagem" && movimento >= 0.6 && st.videos < orcamento.videos ? [{ t: "video" as const, p: x.p }, x] : [x])).filter((x, i, l) => l.findIndex((y) => y.t === x.t) === i);
  const melhor = candidatos[0];
  if (!melhor) return null;
  const cobertura = modo === "cobertura";
  // A densidade (regra explícita): a cota até aqui; o forçado pelo cliente e a cobertura passam.
  const cotaAteAqui = (R.porMinuto * Math.max(u.fim - orcamento.inicio, 20)) / 60 + 1;
  if (!forcado && !cobertura && st.momentos.length >= cotaAteAqui) return null;
  const antes = [...st.momentos].reverse().find((m) => m.inicio < u.inicio);
  const depois = st.momentos.find((m) => m.inicio > u.inicio);
  const espaco = cobertura ? Math.min(R.espaco, 2) : R.espaco;
  if (!forcado && antes && u.inicio - antes.fim < espaco) return null;
  for (const x of candidatos) {
    if (!forcado && !cobertura && x !== melhor && (x.p < R.limiar * 0.7 || x.p < melhor.p * 0.45)) break;
    // Na cobertura, qualquer tipo com alguma força vale (o JEV já ordenou); o resto das regras segue.
    if (cobertura && x.p < 0.08) break;
    const total = st.momentos.length;
    if (!forcado && !cobertura && total >= 5 && ((st.porTipo[x.t] ?? 0) + 1) / (total + 1) > 0.3) continue;
    const tentativa = montarMomento(e, R, familia, U, j, x.t, forma, onde, pedido, st, orcamento);
    if (!tentativa) continue;
    // O mesmo tipo nunca encosta no vizinho (dos dois lados), nem pela troca de vídeo por imagem.
    if (!forcado && (tentativa.tipo === antes?.tipo || tentativa.tipo === depois?.tipo)) continue;
    if (!forcado && depois && depois.inicio - tentativa.fim < espaco) continue;
    return { ...tentativa, origem: modo };
  }
  return null;
}

function registrar(st: Estado, m: MomentoDecidido): void {
  st.momentos.push(m);
  st.momentos.sort((a, b) => a.inicio - b.inicio);
  st.porTipo[m.tipo] = (st.porTipo[m.tipo] ?? 0) + 1;
  st.gasto += m.custo;
  if (m.midia === "video") st.videos++;
  if (m.tela) st.segundosDeTela += m.fim - m.inicio;
}

/** As decisões de UM bloco (~5 min), em ondas de seis momentos (cada onda sabe o que entrou antes). */
async function decidirBloco(
  e: EntradaDoPlanoPeloJev,
  L: DecisaoDaLinguagem,
  R: RegrasDoRitmo,
  U: MomentoDaFala[],
  indices: number[],
  orcamento: Orcamento,
  perguntasFeitas: { n: number },
  enfases: string[],
  avisos: string[],
  memoria: Map<number, Candidato>,
  pedidos: Map<number, PedidoNoMomento>
): Promise<MomentoDecidido[]> {
  const st: Estado = { momentos: [], segundosDeTela: 0, videos: 0, gasto: 0, porTipo: {} };
  const familia = L.familia;
  // OS PEDIDOS DO CLIENTE PRIMEIRO (lei): entram antes da onda, e a onda decide o resto em volta deles.
  encaixarPedidos(e, R, familia, U, indices, pedidos, st, orcamento, avisos);
  for (let w = 0; w < indices.length; w += ONDA) {
    const onda = indices.slice(w, w + ONDA).filter((j) => U[j].fim - U[j].inicio >= 0.6);
    if (!onda.length) continue;
    const perto = st.momentos.slice(-4).map((m) => `${m.tipo} em ${m.inicio.toFixed(0)} s`);
    const recentes = perto.length ? `Já entraram perto, nesta ordem: ${perto.join("; ")}. Varie: o mesmo tipo em sequência cansa.` : "Ainda não entrou nenhum elemento neste trecho.";
    const perguntas = perguntasDaOnda(e, U, onda, recentes);
    let r: Record<string, RespostaDoJev> = {};
    try {
      r = await jevDe(e)(
        {
          projectId: e.projectId,
          etapa: "editor-por-comando-plano",
          state: `${contextoDoProjeto(e)}\nLinguagem visual: ${FAMILIA[familia].nome}. Formato: ${e.formato}. Ritmo pedido: ${L.densidade}.${ritmoDaFichaAoJev(L.estilo)}\nRegra: decida pelo que o momento DIZ${e.leitura ? " e pelo que a câmera MOSTRA (a leitura do trecho)" : ""}; imagem e vídeo só quando há algo concreto para ver; nada é escolha válida.`,
        },
        perguntas
      );
    } catch (err) {
      avisos.push(`JEV falhou numa onda: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      continue;
    }
    perguntasFeitas.n += Object.keys(perguntas).length;
    // A ESCOLHA PELA FORÇA (prova do médico de 05/10): o momento mais claro da onda escolhe primeiro e
    // o espaço vale para os DOIS lados; na ordem do tempo, um legenda fraco ocupava o lugar do vídeo forte.
    const daOnda = candidatosDaOnda(e, U, onda, r, enfases, memoria, pedidos).filter((c) => {
      const melhor = c.candidatos[0];
      // O momento entra na disputa quando o tipo dele é claro: acima do limiar do ritmo, ou bem acima do "nada".
      return c.forcado || (melhor.p >= R.limiar && melhor.p >= c.pNada * 0.6) || (melhor.p >= 0.2 && melhor.p >= c.pNada * 1.5);
    });
    daOnda.sort((a, b) => Number(b.forcado) - Number(a.forcado) || b.candidatos[0].p - a.candidatos[0].p);
    for (const c of daOnda) {
      const escolhido = encaixar(e, R, familia, U, c, st, orcamento, "onda");
      if (escolhido) registrar(st, escolhido);
    }
  }
  return st.momentos;
}

/**
 * Um tipo vira momento se as regras deixam: a tela cheia cabe na fração e no
 * espaço; o vídeo cabe no teto por minuto e no dinheiro (senão vira imagem); a
 * imagem cabe no dinheiro (senão sai). Devolve null quando o tipo não cabe.
 */
function montarMomento(
  e: EntradaDoPlanoPeloJev,
  R: RegrasDoRitmo,
  familia: FamiliaVisual,
  U: MomentoDaFala[],
  j: number,
  tipo0: Exclude<TipoDeElemento, "nada">,
  forma0: "janela" | "tela-cheia",
  onde: OndeDoPedido,
  pedido: PedidoDoCliente | null,
  st: Estado,
  orcamento: Orcamento
): MomentoDecidido | null {
  const u = U[j];
  let tipo = tipo0;
  let forma = forma0;
  // O vídeo além do teto por minuto vira imagem em tela cheia (o momento pedia algo para ver). O vídeo PEDIDO pelo cliente fica.
  if (tipo === "video" && st.videos + 1 > orcamento.videos && !pedido) {
    tipo = "imagem";
    forma = "tela-cheia";
  }
  // A combinada é um vídeo de fundo: além do teto de vídeo por minuto, não cabe (o JEV tem outros tipos para o momento).
  if (tipo === "combinada" && st.videos + 1 > orcamento.videos && !pedido) return null;
  const variante = varianteDo(tipo, u.texto, forma);
  if (!variante) return null;
  let peca = componenteDa(familia, variante);
  const ficha = peca ? FICHAS[peca] : null;
  if (peca && !ficha) peca = null;
  const midia: "imagem" | "video" | null = tipo === "video" || tipo === "combinada" ? "video" : tipo === "imagem" ? "imagem" : null;
  // Imagem em tela cheia e vídeo são inserções (cobrem a gravação); a peça de tela também.
  let tela = !peca || ficha?.plano === "tela";
  if (peca === "imagem-janela") tela = false;
  const [dMin, dMax0] = ficha ? ficha.duracao : DURACAO_DO_TIPO[tipo];
  // A LEITURA DO TRECHO (06/10): com a pessoa se mexendo muito, nada vai atrás dela (o recorte em movimento falha)
  // e a peça fica mais curta; o que a câmera mostra vai com o momento para o redator e para a conferência.
  // O que o cliente PEDIU com todas as letras passa por cima disso (ele sabe por que pediu).
  const tr = trechoEm(e.leitura, u.inicio);
  const mexeMuito = movimentoEm(e.leitura, u.inicio, u.fim) === "muito" && !pedido;
  if (mexeMuito && tipo === "texto-atras") return null;
  // "Mais tempo" pedido: a peça vai ao máximo da ficha, sem o teto de tela do ritmo.
  const dMax = pedido?.maisTempo ? dMax0 : Math.min(tela ? Math.min(dMax0, R.telaMaxSeg) : dMax0, mexeMuito ? Math.max(dMin, 3.2) : Infinity);
  // Lista, citação e combinada seguem até o fim do momento seguinte (os itens são ditos em sequência).
  const j1 = (tipo === "lista" || tipo === "citacao" || tipo === "combinada") && U[j + 1] ? j + 1 : j;
  const inicio = u.inicio;
  const fim = Math.min(e.duracao, inicio + dMax, Math.max(inicio + dMin, U[j1].fim));
  if (fim - inicio < 0.8) return null;
  if (tela) {
    // Duas telas cheias guardam o espaço dos dois lados (o rosto volta entre elas).
    const telaAntes = [...st.momentos].reverse().find((m) => m.tela && m.inicio < inicio);
    const telaDepois = st.momentos.find((m) => m.tela && m.inicio > inicio);
    const cabe = inicio >= R.telaDepoisDe && (!telaAntes || inicio - telaAntes.fim >= R.espaco) && (!telaDepois || telaDepois.inicio - fim >= R.espaco) && (st.segundosDeTela + (fim - inicio)) / Math.max(1, orcamento.duracao) <= R.telaMaxFracao;
    if (!cabe && !pedido) {
      // A imagem que não cabe em tela cheia vai para a janela.
      if (tipo === "imagem" && forma === "tela-cheia") return montarMomento(e, R, familia, U, j, "imagem", "janela", onde, pedido, st, orcamento);
      return null;
    }
  }
  // O componente escolhido pela linguagem pede foto de arquivo recortada (seja qual for a família).
  const pecaComFoto = Boolean(peca && COMPONENTES_COM_FOTO.has(peca));
  const segundos = tipo === "combinada" ? segundosDoFundo(fim - inicio) : Math.min(5, Math.max(3, Math.ceil(fim - inicio)));
  const custo = custoPrevisto(tipo, variante, segundos, pecaComFoto);
  // O teto de dinheiro vale para o que a IA decide sozinha; o que o cliente pediu com todas as letras entra.
  if (st.gasto + custo > orcamento.usd + 1e-6 && !pedido) {
    // Fora do dinheiro: o vídeo tenta a imagem; o que custa sai.
    if (tipo === "video") return montarMomento(e, R, familia, U, j, "imagem", "tela-cheia", onde, pedido, st, orcamento);
    if (custo > 0) return null;
  }
  return {
    id: `j${j}`,
    tipo,
    variante,
    peca,
    midia,
    f0: u.k,
    f1: U[j1].k,
    de: u.de,
    ate: U[j1].ate,
    inicio,
    fim: +fim.toFixed(3),
    tela,
    ...(tipo === "icone" ? { onde: pedido?.posicao ?? onde } : {}),
    custo,
    fala: U.slice(j, j1 + 1).map((x) => x.texto).join(" "),
    falaEmVolta: U.slice(Math.max(0, j - 1), j1 + 2).map((x) => x.texto).join(" "),
    pedido: pedido?.pedido ?? null,
    ...(pedido ? { pedidoDoCliente: pedido } : {}),
    ...(tr ? { emCena: contextoDoTrecho(e.leitura, tr) } : {}),
  };
}

// ─────────────────────────────── a cobertura (regra 2) ───────────────────────────────

/** Os buracos maiores que a régua entre os momentos (e nas pontas do vídeo). */
export function buracos(momentos: Array<{ inicio: number; fim: number }>, duracao: number, maiorSemTroca: number): Array<[number, number]> {
  const ordem = [...momentos].sort((a, b) => a.inicio - b.inicio);
  const saida: Array<[number, number]> = [];
  let cursor = 0;
  for (const m of ordem) {
    if (m.inicio - cursor > maiorSemTroca) saida.push([cursor, m.inicio]);
    cursor = Math.max(cursor, m.fim);
  }
  if (duracao - cursor > maiorSemTroca) saida.push([cursor, duracao]);
  return saida;
}

/**
 * A COBERTURA (05/10, noite): nenhum trecho fica mais de `R.maiorSemTroca`
 * segundos sem elemento. Em cada buraco, os momentos que o JEV já avaliou
 * (memória das ondas) disputam de novo com o limiar baixo; os que ele nunca
 * viu (onda que falhou, plano reaproveitado) são perguntados agora, poucos por
 * buraco. O JEV continua escolhendo o tipo; o código só garante o ritmo.
 */
async function cobrirBuracos(
  e: EntradaDoPlanoPeloJev,
  L: DecisaoDaLinguagem,
  R: RegrasDoRitmo,
  U: MomentoDaFala[],
  st: Estado,
  memoria: Map<number, Candidato>,
  orcamento: Orcamento,
  perguntasFeitas: { n: number },
  enfases: string[],
  avisos: string[],
  pedidos: Map<number, PedidoNoMomento> = new Map()
): Promise<number> {
  let postos = 0;
  for (let rodada = 0; rodada < 6; rodada++) {
    const abertos = buracos(st.momentos, e.duracao, R.maiorSemTroca);
    if (!abertos.length) break;
    // Os momentos de cada buraco que o JEV ainda não avaliou: perguntados agora (até 6 por buraco, espalhados).
    // O momento com pedido do cliente fica de fora: "sem efeito" é pedido, e a cobertura não o enche.
    const faltam: number[] = [];
    for (const [a, b] of abertos) {
      const dentro = U.map((u, j) => j).filter((j) => U[j].inicio >= a + 0.5 && U[j].fim <= b - 0.5 && U[j].fim - U[j].inicio >= 0.6 && !memoria.has(j) && !pedidos.has(j));
      const passo = Math.max(1, Math.floor(dentro.length / 6));
      faltam.push(...dentro.filter((_, i) => i % passo === 0).slice(0, 6));
    }
    if (faltam.length && jevDisponivel(e)) {
      try {
        const r = await jevDe(e)(
          { projectId: e.projectId, etapa: "editor-por-comando-cobertura", state: `${contextoDoProjeto(e)}\nLinguagem visual: ${FAMILIA[L.familia].nome}. Formato: ${e.formato}.${ritmoDaFichaAoJev(L.estilo)}\nEste trecho do vídeo está há muito tempo sem nenhum elemento na tela: escolha o elemento que melhor serve a cada momento.` },
          perguntasDaOnda(e, U, faltam, "Este trecho está sem elemento há mais tempo do que o ritmo pedido permite.")
        );
        perguntasFeitas.n += faltam.length * 5;
        candidatosDaOnda(e, U, faltam, r, enfases, memoria, pedidos);
      } catch (err) {
        avisos.push(`JEV falhou na cobertura: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      }
    }
    let mudou = false;
    for (const [a, b] of abertos) {
      // O melhor candidato do buraco, pela força do tipo que o JEV deu; perto do meio em caso de empate.
      const meio = (a + b) / 2;
      const dentro = [...memoria.values()].filter((c) => c.u.inicio >= a + 0.5 && c.u.fim <= b - 0.5 && !pedidos.has(c.j)).sort((x, y) => y.candidatos[0].p - x.candidatos[0].p || Math.abs(x.u.inicio - meio) - Math.abs(y.u.inicio - meio));
      for (const c of dentro) {
        if (st.momentos.some((m) => m.id === `j${c.j}`)) continue;
        const m = encaixar(e, R, L.familia, U, c, st, orcamento, "cobertura");
        if (!m) continue;
        registrar(st, m);
        postos++;
        mudou = true;
        break;
      }
    }
    if (!mudou) {
      avisos.push(`cobertura: ${abertos.length} trecho(s) de mais de ${R.maiorSemTroca} s ficaram sem elemento (${abertos.map(([a, b]) => `${a.toFixed(0)}-${b.toFixed(0)} s`).join(", ")})`);
      break;
    }
  }
  return postos;
}

// ─────────────────────────────── curtir e inscrever (regra 3) ───────────────────────────────

/** Os trechos livres (sem elemento) de pelo menos `minimo` s, depois de `depoisDe`. */
function trechosLivres(momentos: Array<{ inicio: number; fim: number }>, duracao: number, depoisDe: number, minimo: number): Array<[number, number]> {
  const ordem = [...momentos].sort((a, b) => a.inicio - b.inicio);
  const saida: Array<[number, number]> = [];
  let cursor = depoisDe;
  for (const m of ordem) {
    if (m.fim <= cursor) continue;
    if (m.inicio - cursor >= minimo) saida.push([cursor, m.inicio]);
    cursor = Math.max(cursor, m.fim);
  }
  if (duracao - cursor >= minimo) saida.push([cursor, duracao]);
  return saida;
}

/**
 * A CHAMADA DE CURTIR E INSCREVER pelo JEV (regra 3 de 05/10 à noite): só nos
 * vídeos com destino YouTube; 1 vez no curto, 2 no médio, 3 no longo; cada vez
 * numa região do vídeo, entre os momentos livres logo depois de um elemento
 * forte (os candidatos), nunca nos primeiros 15 s. O JEV escolhe o momento
 * (ou nenhum); o código só monta a peça, desenhada na linguagem do vídeo.
 */
async function decidirInscrever(e: EntradaDoPlanoPeloJev, L: DecisaoDaLinguagem, U: MomentoDaFala[], momentos: MomentoDecidido[], enfases: string[], avisos: string[]): Promise<MomentoDecidido[]> {
  if (!e.youtube || !jevDisponivel(e)) return [];
  const [dMin, dMax] = FICHAS.inscrever?.duracao ?? DURACAO_DO_TIPO.inscrever;
  const vezes = e.duracao < 95 ? 1 : e.duracao < 360 ? 2 : 3;
  const livres = trechosLivres(momentos, e.duracao, INSCREVER_DEPOIS_DE, dMin + 1);
  if (!livres.length) return [];
  const ordem = [...momentos].sort((a, b) => a.inicio - b.inicio);
  const forte = new Set(["texto-atras", "impacto", "citacao", "dado", "video"]);
  // Os candidatos: o começo de cada trecho livre que vem logo depois de um elemento (de preferência forte) ou de uma ênfase.
  const candidatos = livres.map(([a, b]) => {
    const antes = [...ordem].reverse().find((m) => m.fim <= a + 0.05);
    const u = U.find((x) => x.inicio >= a && x.inicio <= b - dMin) ?? U.find((x) => x.fim > a && x.inicio < b);
    const inicio = Math.max(a + 0.3, u?.inicio ?? a + 0.3);
    const pontos = (antes && forte.has(antes.tipo) ? 2 : antes ? 1 : 0) + (u && enfases.includes(u.de) ? 1 : 0);
    return { inicio, fim: Math.min(b - 0.2, inicio + dMax, e.duracao), u, antes, pontos };
  }).filter((c) => c.fim - c.inicio >= dMin);
  const saida: MomentoDecidido[] = [];
  const regiao = (k: number) => [INSCREVER_DEPOIS_DE + ((e.duracao - INSCREVER_DEPOIS_DE) * k) / vezes, INSCREVER_DEPOIS_DE + ((e.duracao - INSCREVER_DEPOIS_DE) * (k + 1)) / vezes] as const;
  const perguntas: Record<string, PerguntaDoJev> = {};
  const opcoes: Array<Array<(typeof candidatos)[number]>> = [];
  for (let k = 0; k < vezes; k++) {
    const [a, b] = regiao(k);
    const daRegiao = candidatos.filter((c) => c.inicio >= a && c.inicio < b).sort((x, y) => y.pontos - x.pontos || x.inicio - y.inicio).slice(0, 8);
    opcoes.push(daRegiao);
    if (!daRegiao.length) continue;
    const criteria: Record<string, string> = Object.fromEntries(daRegiao.map((c, i) => [`c${i}`, `aos ${c.inicio.toFixed(0)} s, logo depois de ${c.antes ? `um elemento de ${c.antes.tipo} ("${c.antes.fala.slice(0, 80)}")` : "um trecho sem elemento"}; a fala ali: "${(c.u?.texto ?? "").slice(0, 160)}"`]));
    criteria.nenhum = "nenhum destes: nesta parte do vídeo não há momento que peça a chamada";
    perguntas[`r${k}`] = { type: "choice", instructions: `Entre estes momentos ${k === 0 ? "do começo" : k === vezes - 1 ? "do fim" : "do meio"} do vídeo, qual é o melhor para a chamada de curtir e se inscrever (logo depois de um momento forte, numa respiração da fala, sem atrapalhar a ideia)?`, criteria };
  }
  if (!Object.keys(perguntas).length) return [];
  try {
    const r = await jevDe(e)({ projectId: e.projectId, etapa: "editor-por-comando-inscrever", state: `${contextoDoProjeto(e)}\nO vídeo vai para o YouTube: a chamada de curtir e se inscrever entra ${vezes} vez(es), perto de momentos fortes.` }, perguntas);
    for (let k = 0; k < vezes; k++) {
      const resp = r[`r${k}`];
      if (!resp || resp.type !== "choice" || resp.choice === "nenhum" || (resp.confidence ?? 0) < 0.3) continue;
      const c = opcoes[k][Number(resp.choice.slice(1))];
      if (!c?.u) continue;
      saida.push({ id: `ins${k}`, tipo: "inscrever", variante: "inscrever", peca: componenteDa(L.familia, "inscrever"), midia: null, f0: c.u.k, f1: c.u.k, de: c.u.de, ate: c.u.ate, inicio: +c.inicio.toFixed(3), fim: +c.fim.toFixed(3), tela: false, custo: 0, fala: c.u.texto, pedido: null, origem: "inscrever" });
    }
  } catch (err) {
    avisos.push(`JEV falhou no curtir/inscrever: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
  }
  return saida;
}

/** As props da chamada de inscrever: texto fixo de interface (não é conteúdo escrito por modelo). */
const PROPS_DO_INSCREVER = { chamada: "Curtir e se inscrever", rede: "youtube" };

// ─────────────────────────────── as decisões ───────────────────────────────

/**
 * AS DECISÕES DO JEV nos dois eixos. Sem JEV (sem chave), nenhum elemento é
 * decidido: o vídeo sai com a pessoa, a legenda e a câmera de ritmo.
 */
export async function decidirPeloJev(e: EntradaDoPlanoPeloJev, ja?: DecisaoDaLinguagem): Promise<{ momentos: MomentoDecidido[]; enfases: string[]; avisos: string[]; perguntas: number; linguagem: DecisaoDaLinguagem; regras: RegrasDoRitmo; cobertura: number }> {
  const avisos: string[] = [];
  const perguntas0 = { n: 0 };
  const L = ja ?? (await decidirLinguagem(e));
  const curto = e.duracao <= 95 || e.formato === "9:16";
  const teto = e.tetoUsdPorMinuto ?? tetoUsdPorMinuto();
  const R = regrasDoRitmo({ formato: e.formato, duracao: e.duracao, densidade: L.densidade, video: L.video, tetoUsdPorMinuto: teto, videosPorMinutoMax: videosPorMinutoMax(curto) });
  if (!jevDisponivel(e)) return { momentos: [], enfases: [], avisos: ["JEV desligado: o vídeo sai sem elementos"], perguntas: 0, linguagem: L, regras: R, cobertura: 0 };
  if (!e.frases.length) return { momentos: [], enfases: [], avisos: [], perguntas: 0, linguagem: L, regras: R, cobertura: 0 };
  const U = momentosDaFala(e.frases, e.palavras);
  // OS PEDIDOS DO CLIENTE (lei): interpretados pelo JEV uma vez, antes de tudo; cada um preso ao momento que cobre.
  const pedidos = await interpretarPedidos(e, U, avisos);
  perguntas0.n += pedidos.size * 7;
  // Os blocos de ~5 min em paralelo, cada um com a parte proporcional do dinheiro e do teto de vídeo.
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, b) => U.map((u, j) => ({ u, j })).filter(({ u }) => u.inicio >= (b * e.duracao) / n && (b === n - 1 || u.inicio < ((b + 1) * e.duracao) / n)).map(({ j }) => j));
  const perguntas = perguntas0;
  const enfases: string[] = [];
  const minutos = Math.max(e.duracao / 60, 1 / 6);
  const memoria = new Map<number, Candidato>();
  const partes = await Promise.all(
    blocos.map((indices) => {
      if (!indices.length) return Promise.resolve([] as MomentoDecidido[]);
      const ini = U[indices[0]].inicio;
      const dur = U[indices[indices.length - 1]].fim - ini;
      const frac = dur / Math.max(1, e.duracao);
      return decidirBloco(e, L, R, U, indices, { usd: teto * minutos * frac, videos: Math.floor(R.videosPorMinuto * minutos * frac + 0.5), duracao: Math.max(dur, 1), inicio: ini }, perguntas, enfases, avisos, memoria, pedidos);
    })
  );
  const st: Estado = { momentos: partes.flat().sort((a, b) => a.inicio - b.inicio), segundosDeTela: 0, videos: 0, gasto: 0, porTipo: {} };
  for (const m of st.momentos) {
    st.porTipo[m.tipo] = (st.porTipo[m.tipo] ?? 0) + 1;
    st.gasto += m.custo;
    if (m.midia === "video") st.videos++;
    if (m.tela) st.segundosDeTela += m.fim - m.inicio;
  }
  // A COBERTURA (regra 2): os buracos maiores que a régua, com o que sobrou do dinheiro (e 15% a mais, para o buraco não ficar vazio por custo).
  const cobertura = await cobrirBuracos(e, L, R, U, st, memoria, { usd: teto * minutos * 1.15, videos: Math.floor(R.videosPorMinuto * minutos + 0.5), duracao: e.duracao, inicio: 0 }, perguntas, enfases, avisos, pedidos);
  const momentos = st.momentos;
  // O GANCHO DO CORTE (regra explícita): o vertical curto abre com texto na tela nos 3 primeiros segundos
  // (não quando o cliente pediu a cena limpa ali).
  if (R.curto && U[0] && !momentos.some((m) => m.inicio < 3) && !pedidos.has(0)) {
    const u = U[0];
    const tipo: "texto-atras" | "legenda-destaque" = momentos[0]?.tipo === "legenda-destaque" ? "texto-atras" : "legenda-destaque";
    const peca = componenteDa(L.familia, tipo)!;
    const d = FICHAS[peca]?.duracao ?? DURACAO_DO_TIPO[tipo];
    momentos.unshift({ id: "j0", tipo, variante: tipo, peca, midia: null, f0: u.k, f1: u.k, de: u.de, ate: u.ate, inicio: u.inicio, fim: Math.max(u.inicio + d[0], Math.min(u.fim, u.inicio + d[1])), tela: false, custo: 0, fala: u.texto, pedido: null });
  }
  const limpos = semCruzamento(momentos, avisos);
  // AS COMBINADAS (06/10): o fundo e a ligação de cada uma, pelo JEV, num pedido só.
  await decidirAsCombinadas(e, limpos, avisos);
  // CURTIR E INSCREVER (regra 3): o JEV escolhe os momentos, nos trechos livres que sobraram.
  const chamadas = await decidirInscrever(e, L, U, limpos, enfases, avisos);
  const todos = [...limpos, ...chamadas].sort((a, b) => a.inicio - b.inicio);
  return { momentos: todos, enfases, avisos, perguntas: perguntas.n, linguagem: L, regras: R, cobertura };
}

/**
 * AS COMBINADAS PELO JEV (06/10): para cada momento do tipo "combinada", o
 * fundo em movimento (vista aérea, mural, mesa, rede) e a ligação entre os
 * itens (rota, fio ou nenhuma), num pedido só. Sem JEV (ou se ele falhar), a
 * reserva por palavras (combinada.ts). O código não escolhe por estilo.
 */
export async function decidirAsCombinadas(e: EntradaDoPlanoPeloJev, momentos: MomentoDecidido[], avisos: string[]): Promise<void> {
  const lista = momentos.filter((m) => m.tipo === "combinada" && !m.combinada);
  if (!lista.length) return;
  let r: Record<string, RespostaDoJev> = {};
  if (jevDisponivel(e)) {
    try {
      r = await jevDe(e)(
        { projectId: e.projectId, etapa: "editor-por-comando-combinada", state: contextoDoProjeto(e) },
        Object.assign({}, ...lista.map((m) => perguntasDaCombinada(m.id, m.pedido ? `${m.fala} (pedido do cliente nesta cena: ${m.pedido})` : m.fala, m.emCena)))
      );
    } catch (err) {
      avisos.push(`JEV falhou nas combinadas (vale a reserva por palavras): ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }
  for (const m of lista) m.combinada = decisaoDasRespostas(m.id, m.fala, r);
}

/**
 * Dois elementos não se cruzam: o que entra enquanto o anterior está na tela
 * sai (o anterior manda). O PEDIDO do cliente é a exceção: ele manda, e o que
 * a IA decidiu sozinha por cima dele é que sai.
 */
function semCruzamento(momentos: MomentoDecidido[], avisos: string[]): MomentoDecidido[] {
  const limpos: MomentoDecidido[] = [];
  for (const m of [...momentos].sort((a, b) => a.inicio - b.inicio)) {
    const ant = limpos[limpos.length - 1];
    if (ant && m.inicio < ant.fim + 0.2) {
      if (m.pedidoDoCliente && !ant.pedidoDoCliente) {
        avisos.push(`${ant.id}: cruzava o pedido do cliente em ${m.id}, saiu`);
        limpos.pop();
        limpos.push(m);
        continue;
      }
      avisos.push(`${m.id}: cruzava ${ant.id}, saiu`);
      continue;
    }
    limpos.push(m);
  }
  return limpos;
}

// ─────────────────────────────── o redator ───────────────────────────────

const SISTEMA_DO_REDATOR = `Você é o REDATOR dos elementos visuais de um vídeo. As decisões já foram tomadas por outro sistema: qual elemento entra, em que momento, por quanto tempo e em qual linguagem visual. Você NÃO escolhe nem muda nada disso. Você só ESCREVE o texto de cada elemento, nas props pedidas.

Regras do texto na tela:
- Português do Brasil, com as palavras do próprio falante; curto (título até 5 palavras, rótulo até 3, manchete até 9). Sem travessão, sem ponto final em título. Destaque com **asteriscos** em 1 a 3 palavras quando a ficha pede.
- Nunca invente número, nome, dado ou promessa que a fala não diz.
- Lista (itens, passos, marcos): só o que a fala diz, na ordem dita, até o máximo da ficha.
- Ícone: "nome" é um dos nomes da lista da ficha.

Regras da CENA de imagem e de vídeo ("cena", em INGLÊS):
- A cena é o ASSUNTO da imagem e vai PRIMEIRO no prompt; o bloco de estilo que vem depois só muda COMO ela é desenhada, nunca O QUE aparece. Por isso a cena tem 2 ou 3 frases concretas, tiradas da fala DESTE momento e da leitura do vídeo, com o objeto específico daquele momento, o lugar e o que está acontecendo. Exemplo: a fala "edição de vídeo" vira "A laptop screen showing a video editing timeline with clips being cut, close-up. Hands resting on the trackpad, the playhead moving over the cuts.", nunca "a person working".
- Nunca imagem genérica (nada de "business people", "abstract background", "success concept", "office", "handshake"); nunca tire a cena do bloco de estilo: o objeto vem da fala.
- Vídeo: descreva a AÇÃO e o movimento que acontece (o que se mexe), em 2 ou 3 frases.
- Não descreva o estilo nem as cores (o bloco de estilo do vídeo é acrescentado depois). Sem texto na imagem. Nunca pessoa real, famosa ou identificável, nunca nome próprio; pessoas só anônimas, de costas, mãos, silhueta ou ao longe.
- "oQueAparece": a mesma cena em português, até 8 palavras, para o cliente aprovar.
- Quando houver a LEITURA DO VÍDEO (o cenário da gravação e o "EM CENA" de cada momento), a cena da imagem ou do vídeo CONVERSA com ela: o mesmo tipo de ambiente e de luz, os objetos que estão em cena quando fizer sentido, o assunto que a fala e a imagem mostram naquele momento; nunca uma cena que brigue com o que o espectador está vendo ao lado.
- O NOME DE QUEM FALA ("nome", "papel") sai da leitura do vídeo ou da própria fala; nunca inventado. Sem nome na leitura nem na fala, use o papel ("o entrevistado", "a médica").
- Fotos de arquivo das peças de papel ("descricao"): em INGLÊS, concreta (objeto, lugar, prédio, estátua genérica, figura anônima de época).
- A PEÇA COMBINADA ("camada-exata"): o fundo é um vídeo gerado e as etiquetas são desenhadas por cima em código. Os "itens" são os lugares, as pessoas ou as partes que a fala cita, com as palavras do falante e na ordem dita (nunca inventados). A "cena" do fundo, em INGLÊS, descreve só o fundo em movimento do tipo pedido, para este nicho, SEM nenhum texto, nome, número, pino, seta ou linha desenhada (tudo isso é nosso, por cima). "numero" só quando a fala diz um número.
- O CENÁRIO (id "cenario", só quando pedido): o fundo que o cliente pediu no comando para ficar atrás dele, em INGLÊS, sem pessoas, com espaço livre no centro para a pessoa.
- O PEDIDO DO CLIENTE NUMA CENA É LEI. Quando um momento traz "PEDIDO DO CLIENTE", você escreve a cena e o texto a partir do pedido, palavra por palavra, sem interpretar para outra coisa: o objeto que ele pediu é o assunto ("a soccer ball in the center of the frame"), a cor que ele pediu entra com todas as letras ("green lettering"), o texto literal que ele deu vai como está. Nesse momento, a regra "sem texto na imagem" e a regra do estilo cedem ao pedido. Escreva também "pedidoEmIngles": o pedido do cliente traduzido literalmente para o inglês (o que aparece, a cor, o lugar).

Responda só JSON: {"momentos":[{"id":"j12","props":{...}}]} com um item por momento recebido, na ordem.`;

/** As props que o redator escreve para cada momento: a ficha da peça, ou a da inserção. */
function propsParaORedator(m: MomentoDecidido): string {
  const doPedido = m.pedidoDoCliente ? ", pedidoEmIngles (o pedido do cliente traduzido literalmente para o inglês)" : "";
  if (m.peca === "imagem-janela") return `cena (EM INGLÊS, a imagem deste momento), oQueAparece (português, até 8 palavras), legenda? (até 5 palavras do falante), lado? ("direita" | "esquerda" | "topo")${doPedido}`;
  if (!m.peca) return (m.midia === "video" ? "cena (EM INGLÊS, 2 ou 3 frases concretas: a ação em movimento deste momento, com o objeto específico que a fala cita), oQueAparece (português, até 8 palavras)" : "cena (EM INGLÊS, 2 ou 3 frases concretas: a imagem em tela cheia deste momento, com o objeto específico que a fala cita), oQueAparece (português, até 8 palavras)") + doPedido;
  if (m.peca === "camada-exata") {
    const f = FUNDO[(m.combinada ?? combinadaPorPalavras(m.fala)).fundo];
    return `${FICHAS["camada-exata"].props}, cena (EM INGLÊS, 1 ou 2 frases: o fundo deste momento, partindo de "${f.cena}", com o que a fala e o nicho pedem e o que se mexe DENTRO da cena (água, nuvem, luz, fumaça, gente ao longe); sem movimento de câmera, sem texto, sem nomes, sem pinos, sem linhas desenhadas), oQueAparece (português, até 8 palavras)${doPedido}`;
  }
  if (m.peca === "icone") return `${FICHAS.icone.props} (posicao: ${m.onde === "acima-da-cabeca" ? '"topo"' : m.onde === "ao-lado" ? '"direita"' : m.onde === "centro" ? '"centro"' : '"topo-esquerda"'})${doPedido}`;
  return (FICHAS[m.peca]?.props ?? "texto") + doPedido;
}

type MomentoParaRedator = MomentoDecidido;

/** A linha de um momento no pedido ao redator; com `reforco`, o pedido do cliente vai no topo, depois de uma primeira versão que não o atendeu. */
function linhaDoMomentoParaORedator(m: MomentoParaRedator, reforco = false): string {
  const combinada = m.combinada ? `, fundo "${m.combinada.fundo}" e ligação "${m.combinada.ligacao}"` : "";
  const cabeca = `- id ${m.id}, elemento "${m.tipo}"${m.peca ? `, peça "${m.peca}"` : `, ${m.midia === "video" ? "vídeo" : "imagem em tela cheia"}`}${combinada} (${m.inicio.toFixed(0)} s a ${m.fim.toFixed(0)} s), sobre a fala: "${m.fala.slice(0, 300)}"`;
  const pedido = m.pedidoDoCliente ? `\n  ${reforco ? "ATENÇÃO: a primeira versão NÃO atendeu ao pedido do cliente. Escreva de novo a partir do pedido, literalmente.\n  " : ""}${instrucoesParaORedator(m.pedidoDoCliente)}` : m.pedido ? `\n  PEDIDO DO CLIENTE: "${m.pedido}"` : "";
  return `${cabeca}${pedido}${m.emCena ? `\n  ${m.emCena.slice(0, 500)}` : ""}\n  props: ${propsParaORedator(m)}`;
}

/** Uma chamada do redator para um bloco de momentos. */
async function redigirBloco(e: EntradaDoPlanoPeloJev, ling: LinguagemComFicha, lista: MomentoParaRedator[], falaDoBloco: string, cenario?: boolean, reforco = false): Promise<Record<string, Record<string, unknown>>> {
  if (!lista.length && !cenario) return {};
  const pedido = [
    contextoDoProjeto(e),
    e.titulo ? `TÍTULO: ${e.titulo}` : "",
    `LINGUAGEM VISUAL: ${ling.nome}. Bloco de estilo (acrescentado depois a toda cena): ${ling.blocoDeEstilo}`,
    // A ficha do estilo do catálogo (06/10): como cada elemento se desenha nessa linguagem, base obrigatória do texto e da cena.
    ling.estiloDoCatalogo && ling.pecasDoEstilo ? `COMO CADA ELEMENTO SE DESENHA NO ESTILO "${ling.estiloDoCatalogo}" (base obrigatória; adapte à marca e ao nicho): ${ling.pecasDoEstilo}` : "",
    `# A FALA DESTE BLOCO\n${falaDoBloco}`,
    `# OS MOMENTOS (escreva só as props de cada um)\n${[
      ...(cenario ? ["- id cenario, o CENÁRIO que o cliente pediu no comando para ficar atrás dele o vídeo inteiro\n  props: cena (EM INGLÊS, o cenário pedido, sem pessoas, espaço livre no centro), oQueAparece (português, até 8 palavras)"] : []),
      ...lista.map((m) => linhaDoMomentoParaORedator(m, reforco)),
    ].join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const resposta = await redatorDe(e, "editor-por-comando-redator", 12000, 180_000)(SISTEMA_DO_REDATOR, pedido);
  const j = extrairJson(resposta) as { momentos?: Array<{ id?: unknown; props?: unknown }> };
  const saida: Record<string, Record<string, unknown>> = {};
  for (const m of j?.momentos ?? []) if (typeof m?.id === "string" && m.props && typeof m.props === "object") saida[m.id] = m.props as Record<string, unknown>;
  return saida;
}

/** O texto de uma peça, para a conferência (o primeiro campo de texto das props). */
function textoDasProps(props: Record<string, unknown>): string {
  for (const k of ["texto", "titulo", "manchete", "frase", "palavra", "nome", "rotulo", "legenda", "lugar"]) {
    const v = props[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\*\*/g, "").trim();
  }
  // As etiquetas da combinada (06/10): o texto que vai à tela são os rótulos dos itens.
  if (Array.isArray(props.itens)) return (props.itens as Array<{ rotulo?: unknown }>).map((x) => (typeof x?.rotulo === "string" ? x.rotulo.trim() : "")).filter(Boolean).join(", ");
  return "";
}

/**
 * OS TEXTOS DOS MOMENTOS: o redator por bloco de ~5 min em paralelo (a
 * chamada de inscrever não passa por ele: as props são de interface), e a
 * CONFERÊNCIA PELO JEV (o texto longo, confuso ou inventado sai; a cena
 * genérica ou fora do nicho também). Devolve os textos aprovados.
 */
async function redigirEConferir(e: EntradaDoPlanoPeloJev, ling: LinguagemDoVideo, lista: MomentoDecidido[], opcoes: { cenario?: boolean } = {}): Promise<{ textos: Record<string, Record<string, unknown>>; erros: string[]; semTexto: number; tempos: { redator: number; conferencia: number }; pedidos: Record<string, ConferenciaDoPedido> }> {
  let t = Date.now();
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, k) => ({ de: (k * e.duracao) / n, ate: ((k + 1) * e.duracao) / n }));
  const textos: Record<string, Record<string, unknown>> = {};
  const erros: string[] = [];
  for (const m of lista) if (m.tipo === "inscrever") textos[m.id] = { ...PROPS_DO_INSCREVER };
  const paraRedator = lista.filter((m) => m.tipo !== "inscrever");
  const falaDoBloco = (b: { de: number; ate: number }) => e.frases.filter((f) => f.fim > b.de && f.inicio < b.ate).map((f) => `[${f.inicio.toFixed(0)}s] ${f.texto}`).join("\n");
  await Promise.all(
    blocos.map(async (b, k) => {
      const doBloco = paraRedator.filter((m) => m.inicio >= b.de && m.inicio < b.ate);
      const cenario = Boolean(opcoes.cenario && k === 0);
      if (!doBloco.length && !cenario) return;
      try {
        Object.assign(textos, await redigirBloco(e, ling, doBloco, falaDoBloco(b), cenario));
      } catch (err) {
        erros.push(`redator: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    })
  );
  const tempos = { redator: +((Date.now() - t) / 1000).toFixed(1), conferencia: 0 };
  t = Date.now();
  const reprovados = new Set<string>();
  const motivos: string[] = [];
  // O momento com PEDIDO do cliente não passa pela reprovação genérica (texto curto, cena do nicho): o pedido é lei,
  // e a conferência dele é a própria (`conferirPedidos`), que pergunta se o momento atende ao que o cliente escreveu.
  const comPedido = new Set(paraRedator.filter((m) => m.pedidoDoCliente).map((m) => m.id));
  if (jevDisponivel(e)) {
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const m of paraRedator) {
      const props = textos[m.id];
      if (!props || comPedido.has(m.id)) continue;
      const texto = textoDasProps(props);
      if (texto) perguntas[`t_${m.id}`] = { type: "noul", instructions: `A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". O texto que vai à tela é: "${texto.slice(0, 160)}". Esse texto é curto, claro, nas palavras do falante, e não inventa dado, nome ou número que a fala não diz?` };
      if (typeof props.cena === "string") perguntas[`c_${m.id}`] = { type: "noul", instructions: `Nicho do projeto: ${e.nicho ?? "não informado"}.${e.leitura?.cenario ? ` Cenário da gravação: ${e.leitura.cenario.slice(0, 160)}.` : ""}${m.emCena ? ` ${m.emCena.slice(0, 300)}` : ""} A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". A ${m.midia === "video" ? "cena em vídeo" : "imagem"} pedida é: "${String(props.cena).slice(0, 300)}". Ela mostra algo concreto que faz sentido com esta fala, com este nicho${m.emCena ? " e com o que está em cena na gravação" : ""} (não é uma imagem genérica de banco)?` };
    }
    if (Object.keys(perguntas).length) {
      try {
        const r = await jevDe(e)({ projectId: e.projectId, etapa: "editor-por-comando-conferencia", state: { comando: e.comando.texto, nicho: e.nicho ?? "" } }, perguntas);
        for (const [k, resp] of Object.entries(r)) if ((probabilidadeDeSim(resp) ?? 1) <= 0.35) {
          reprovados.add(k.slice(2));
          motivos.push(k.startsWith("c_") ? `${k.slice(2)} (cena)` : `${k.slice(2)} (texto)`);
        }
      } catch (err) {
        erros.push(`conferência falhou: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      }
    }
  }
  if (reprovados.size) erros.push(`conferência: ${reprovados.size} elemento(s) reprovado(s) pelo JEV saíram (${motivos.join(", ")})`);
  for (const id of reprovados) delete textos[id];
  // OS ELEMENTOS GERADOS POR IA (06/10, noite): o ícone não é mais escolhido de um catálogo em código; o redator descreve
  // o elemento inteiro no prompt e a Higgsfield o desenha (lib/media/editor-por-comando/elemento-gerado.ts).
  // A CONFERÊNCIA DO PEDIDO (06/10): o momento atende ao pedido do cliente? Se não, segunda tentativa com o pedido no topo.
  const pedidos = await conferirPedidos(e, ling, paraRedator.filter((m) => comPedido.has(m.id)), textos, falaDoBloco, blocos, erros);
  tempos.conferencia = +((Date.now() - t) / 1000).toFixed(1);
  const semTexto = lista.filter((m) => !textos[m.id] && !reprovados.has(m.id)).length;
  return { textos, erros, semTexto, tempos, pedidos };
}

/** O que a conferência do pedido concluiu sobre um momento (vai para `plano.elementos`). */
export type ConferenciaDoPedido = { atendido: "sim" | "nao" | "sem-conferencia"; motivo: string | null };

/** O que o momento vai fazer, em uma frase, para o JEV conferir contra o pedido. */
function oQueOMomentoFaz(m: MomentoDecidido, props: Record<string, unknown>, ling: LinguagemDoVideo): string {
  const p = m.pedidoDoCliente!;
  // A combinada (06/10) se descreve primeiro pelo que se VÊ: o fundo e o que o código desenha por cima.
  if (m.combinada) {
    const itens = Array.isArray(props.itens) ? (props.itens as Array<{ rotulo?: unknown }>).map((x) => String(x?.rotulo ?? "")).filter(Boolean) : [];
    const ligacao = m.combinada.ligacao === "fio" ? `um fio ${p.cor ? corEmPortugues(p) : "na cor da marca"} ligando os itens` : m.combinada.ligacao === "rota" ? "uma linha passando pelos itens na ordem" : "";
    return [
      `ao fundo, um vídeo gerado de ${NOME_DO_FUNDO[m.combinada.fundo]}`,
      `por cima, desenhado em código: ${FUNDO[m.combinada.fundo].marcador === "alfinete" ? "um alfinete" : "um ponto"} em cada item${ligacao ? `, ${ligacao}` : ""} e uma etiqueta com o nome de cada item (${itens.join(", ").slice(0, 200)})`,
      typeof props.titulo === "string" && props.titulo.trim() ? `título: "${props.titulo.slice(0, 80)}"` : "",
      p.cor ? `cor pedida usada nesta peça: ${corEmPortugues(p)}` : "",
    ]
      .filter(Boolean)
      .join("; ");
  }
  const partes = [
    `elemento: ${NOME_DO_TIPO[m.tipo] ?? m.tipo}${m.peca ? ` (peça ${m.peca})` : m.midia === "video" ? " (vídeo gerado)" : " (imagem gerada em tela cheia)"}`,
    `posição: ${p.posicao ?? (m.onde ?? "a de sempre")}`,
    p.cor ? `cor usada nesta peça: ${corEmPortugues(p)} (${p.cor}), por cima da cor da marca` : "cor: a da marca",
    p.tamanho ? `tamanho: ${p.tamanho}` : "",
    typeof props.cena === "string" ? `prompt da ${m.midia === "video" ? "cena em vídeo" : "imagem"} (inglês): "${promptDaMidiaDoPedido(String(props.cena), typeof props.pedidoEmIngles === "string" ? props.pedidoEmIngles : "", ling, m.midia === "video" ? "video" : "imagem").slice(0, 360)}"` : "",
    textoDasProps(props) ? `texto na tela: "${textoDasProps(props).slice(0, 160)}"` : "",
    typeof props.oQueAparece === "string" ? `o que aparece: "${String(props.oQueAparece).slice(0, 120)}"` : "",
  ].filter(Boolean);
  return partes.join("; ");
}

/** A palavra principal da etiqueta (a mais longa, sem acento) aparece na fala do momento. */
function itemDito(rotulo: string, fala: string): boolean {
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const f = sem(fala);
  const principal = sem(rotulo).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0];
  return !principal || f.includes(principal.slice(0, Math.max(4, principal.length - 2)));
}

/** O nome de cada fundo da combinada como o JEV lê na conferência do pedido. */
const NOME_DO_FUNDO: Record<keyof typeof FUNDO, string> = { "vista-aerea": "vista aérea de uma região", mural: "mural de investigação (quadro com papéis e documentos)", mesa: "mesa de trabalho vista de cima", rede: "luzes de uma cidade ou rede à noite" };

/** O prompt final de uma imagem ou vídeo PEDIDO pelo cliente: a cena do redator e, com todas as letras, o pedido dele em inglês. */
function promptDaMidiaDoPedido(cena: string, pedidoEmIngles: string, ling: LinguagemDoVideo, midia: "imagem" | "video"): string {
  const literal = pedidoEmIngles.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const junta = literal && !cena.toLowerCase().includes(literal.toLowerCase().slice(0, 24)) ? `${cena.replace(/\.$/, "")}. Client request, must appear exactly as asked: ${literal}` : cena;
  return promptDaMidia(junta, ling, midia);
}

/**
 * A CONFERÊNCIA DO PEDIDO PELO JEV (06/10): para cada momento com pedido, "o
 * momento atende ao pedido do cliente?" (pedido + tipo + props + prompt). Se
 * não, o redator escreve de novo com o pedido literal no topo e o JEV confere
 * outra vez; se ainda não, o aviso "pedido da cena X não pôde ser atendido"
 * sai em `erros` (vira sobMedida.avisos, que o card mostra) e o elemento fica
 * marcado como não atendido. Sem JEV, fica "sem-conferencia".
 */
async function conferirPedidos(
  e: EntradaDoPlanoPeloJev,
  ling: LinguagemDoVideo,
  lista: MomentoDecidido[],
  textos: Record<string, Record<string, unknown>>,
  falaDoBloco: (b: { de: number; ate: number }) => string,
  blocos: Array<{ de: number; ate: number }>,
  erros: string[]
): Promise<Record<string, ConferenciaDoPedido>> {
  const saida: Record<string, ConferenciaDoPedido> = {};
  if (!lista.length) return saida;
  const perguntar = async (momentos: MomentoDecidido[]): Promise<Record<string, number | null>> => {
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const m of momentos) {
      const props = textos[m.id];
      if (!props) continue;
      const p = m.pedidoDoCliente!;
      perguntas[`p_${m.id}`] = {
        type: "noul",
        instructions: `O cliente pediu nesta cena, com as palavras dele: "${p.pedido.slice(0, 300)}". A fala da cena: "${m.fala.slice(0, 240)}". O que vai ser feito: ${oQueOMomentoFaz(m, props, ling).slice(0, 900)}. Isso atende ao pedido do cliente como ele escreveu (o que ele pediu para ver aparece; a cor, o tamanho e o lugar que ele pediu são os usados; o texto literal, se houver, é o dele)?`,
      };
    }
    if (!Object.keys(perguntas).length) return {};
    const r = await jevDe(e)({ projectId: e.projectId, etapa: "editor-por-comando-pedido-conferencia", state: { comando: e.comando.texto, regra: "o pedido do cliente numa cena é lei: o momento tem de mostrar o que ele pediu, do jeito que ele pediu" } }, perguntas);
    return Object.fromEntries(momentos.map((m) => [m.id, probabilidadeDeSim(r[`p_${m.id}`])]));
  };
  if (!jevDisponivel(e)) {
    for (const m of lista) if (textos[m.id]) saida[m.id] = { atendido: "sem-conferencia", motivo: null };
    return saida;
  }
  const semTexto = lista.filter((m) => !textos[m.id]);
  for (const m of semTexto) {
    saida[m.id] = { atendido: "nao", motivo: "o redator não devolveu o texto deste momento" };
    erros.push(`pedido da cena ${mmssDe(m.inicio)} não pôde ser atendido: o redator não devolveu o texto ("${m.pedidoDoCliente!.pedido.slice(0, 80)}")`);
  }
  let pendentes = lista.filter((m) => textos[m.id]);
  for (let tentativa = 0; tentativa < 2 && pendentes.length; tentativa++) {
    let notas: Record<string, number | null> = {};
    try {
      notas = await perguntar(pendentes);
    } catch (err) {
      erros.push(`conferência do pedido falhou: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      for (const m of pendentes) saida[m.id] = { atendido: "sem-conferencia", motivo: null };
      return saida;
    }
    const reprovados = pendentes.filter((m) => (notas[m.id] ?? 1) <= 0.35);
    for (const m of pendentes) if (!reprovados.includes(m)) saida[m.id] = { atendido: "sim", motivo: null };
    if (!reprovados.length) break;
    if (tentativa === 0) {
      // A SEGUNDA TENTATIVA: o redator de novo, só com os reprovados, com o pedido literal no topo.
      await Promise.all(
        blocos.map(async (b) => {
          const doBloco = reprovados.filter((m) => m.inicio >= b.de && m.inicio < b.ate);
          if (!doBloco.length) return;
          try {
            const novos = await redigirBloco(e, ling, doBloco, falaDoBloco(b), false, true);
            for (const m of doBloco) if (novos[m.id]) textos[m.id] = novos[m.id];
          } catch (err) {
            erros.push(`redator (segunda tentativa do pedido): ${err instanceof Error ? err.message.slice(0, 120) : err}`);
          }
        })
      );
      pendentes = reprovados;
      continue;
    }
    for (const m of reprovados) {
      const feito = oQueOMomentoFaz(m, textos[m.id] ?? {}, ling);
      const motivo = `o JEV não reconheceu o pedido no que foi escrito (saiu: ${feito.slice(0, 200)})`;
      saida[m.id] = { atendido: "nao", motivo };
      erros.push(`pedido da cena ${mmssDe(m.inicio)} não pôde ser atendido: ${motivo} ("${m.pedidoDoCliente!.pedido.slice(0, 80)}")`);
    }
  }
  return saida;
}

/** Os momentos com texto viram peças e inserções no formato do diretor (o prompt final de cada imagem e vídeo). */
function materializar(lista: MomentoDecidido[], textos: Record<string, Record<string, unknown>>, ling: LinguagemDoVideo, conferidos: Record<string, ConferenciaDoPedido> = {}): { momentos: MomentoDoEditor[]; insercoes: Array<Record<string, unknown>>; elementos: ElementoDoPlano[] } {
  const momentos: MomentoDoEditor[] = [];
  const insercoes: Array<Record<string, unknown>> = [];
  const elementos: ElementoDoPlano[] = [];
  for (const m of lista) {
    const props0 = textos[m.id];
    if (!props0) continue;
    const props = { ...props0 };
    const cena = typeof props.cena === "string" ? props.cena : "";
    const oQueAparece = typeof props.oQueAparece === "string" ? props.oQueAparece : undefined;
    const pedidoEmIngles = typeof props.pedidoEmIngles === "string" ? props.pedidoEmIngles : "";
    delete props.pedidoEmIngles;
    // O PEDIDO DO CLIENTE vai nas props da peça e na inserção (o resolvedor e o worker leem: cor, tamanho, posição).
    const doPedido = m.pedidoDoCliente ? { pedidoDoCliente: pedidoNasProps(m.pedidoDoCliente) } : {};
    const prompt = (midia: "imagem" | "video") => (m.pedidoDoCliente ? promptDaMidiaDoPedido(cena, pedidoEmIngles || pedidoEmInglesDeReserva(m.pedidoDoCliente), ling, midia) : promptDaMidia(cena, ling, midia));
    if (m.peca === "imagem-janela") {
      if (!cena) continue;
      const idImg = `${m.id}-img`;
      insercoes.push({ id: idImg, de: m.de, ate: m.ate, briefing: prompt("imagem"), midia: "imagem", janela: true, estilizada: true, oQueAparece, ...doPedido });
      delete props.cena;
      momentos.push({ id: m.id, peca: m.peca, de: m.de, ate: m.ate, props: { ...props, midia: idImg, legenda: props.legenda ?? "", ...doPedido } });
    } else if (m.peca === "camada-exata") {
      // A PEÇA COMBINADA (06/10): o fundo em vídeo (inserção que nunca vira plano sozinha) e a camada exata que o liga.
      const itens = (Array.isArray(props.itens) ? (props.itens as Array<{ rotulo?: unknown }>) : [])
        .filter((x) => typeof x?.rotulo === "string" && x.rotulo.trim())
        .slice(0, 5)
        .map((x) => ({ rotulo: String(x.rotulo).replace(/\s+/g, " ").trim().slice(0, 40) }));
      if (!cena || !itens.length) continue;
      // SÓ O QUE É DITO DENTRO DA PEÇA (prova de 06/10: "os projetos" e "a igreja" acenderam antes de serem ditos,
      // depois do fim do momento): a etiqueta fica quando a palavra principal dela está na fala do momento.
      const ditos = itens.filter((x) => itemDito(x.rotulo, m.fala));
      if (ditos.length < itens.length) itens.splice(0, itens.length, ...(ditos.length ? ditos : itens.slice(0, 1)));
      const dec = m.combinada ?? combinadaPorPalavras(m.fala);
      const idFundo = `${m.id}-fundo`;
      // O pedido do cliente numa combinada é atendido pela CAMADA (as etiquetas, o fio, a cor pedida) e pela escolha do
      // fundo pelo JEV; o pedido literal não vai ao modelo de vídeo, que desenharia o fio e os nomes inventados no fundo.
      insercoes.push({ id: idFundo, de: m.de, ate: m.ate, briefing: promptDoFundoCombinado(cena, dec.fundo, ling), midia: "video", estilizada: true, combinada: true, segundos: segundosDoFundo(m.fim - m.inicio), oQueAparece, ...doPedido });
      const numero = numeroDito(props.numero, m.fala);
      delete props.cena;
      delete props.oQueAparece;
      delete props.numero;
      momentos.push({ id: m.id, peca: m.peca, de: m.de, ate: m.ate, props: { ...props, itens, ...(numero ? { numero } : {}), fundo: idFundo, tipoDoFundo: dec.fundo, ligacao: dec.ligacao, marcador: FUNDO[dec.fundo].marcador, ...doPedido } });
    } else if (!m.peca) {
      if (!cena) continue;
      const segundos = Math.min(5, Math.max(3, Math.ceil(m.fim - m.inicio)));
      insercoes.push({ id: m.id, de: m.de, ate: m.ate, briefing: prompt(m.midia === "video" ? "video" : "imagem"), midia: m.midia ?? "imagem", estilizada: true, ...(m.midia === "video" ? { segundos } : {}), oQueAparece, ...doPedido });
    } else {
      if (m.peca === "icone") props.posicao = m.onde === "acima-da-cabeca" ? "topo" : m.onde === "ao-lado" ? "direita" : m.onde === "centro" ? "centro" : "topo-esquerda";
      // O texto literal do cliente vale como o texto da peça.
      if (m.pedidoDoCliente?.texto && typeof props.texto === "string") props.texto = m.pedidoDoCliente.texto;
      momentos.push({ id: m.id, peca: m.peca, de: m.de, ate: m.ate, props: { ...props, ...doPedido } });
    }
    const conf = conferidos[m.id];
    elementos.push({
      id: m.id,
      tipo: m.tipo,
      variante: m.variante,
      inicio: +m.inicio.toFixed(2),
      fim: +m.fim.toFixed(2),
      peca: m.peca,
      midia: m.midia,
      fala: m.fala.slice(0, 200),
      ...(m.pedidoDoCliente ? { pedido: m.pedidoDoCliente.pedido.slice(0, 300), pedidoDoCliente: pedidoNasProps(m.pedidoDoCliente), atendido: conf?.atendido ?? "sem-conferencia", motivo: conf?.motivo ?? null } : {}),
    });
  }
  return { momentos, insercoes, elementos };
}

/** Sem o "pedidoEmIngles" do redator: o que dá para dizer em inglês a partir da interpretação (a cor, o lugar). */
function pedidoEmInglesDeReserva(p: PedidoDoCliente): string {
  const partes = [p.cor ? `${p.corNome && !p.corNome.startsWith("#") ? corEmIngles(p.corNome) : p.cor} lettering and accents` : "", p.posicao === "centro" ? "placed in the center of the frame" : ""].filter(Boolean);
  return partes.join(", ");
}

/** A inserção do cenário pedido (o fundo gerado atrás da pessoa, o vídeo inteiro), quando o redator escreveu a cena. */
function insercaoDoCenario(textos: Record<string, Record<string, unknown>>, ling: LinguagemDoVideo, frases: Frase[]): Record<string, unknown> | null {
  const cena = typeof textos.cenario?.cena === "string" ? textos.cenario.cena : "";
  if (!cena || !frases.length) return null;
  return { id: "cenario", de: "F0", ate: `F${frases.length - 1}/fim`, briefing: promptDaMidia(cena, ling, "imagem"), midia: "imagem", estilizada: true, cenario: true, oQueAparece: typeof textos.cenario?.oQueAparece === "string" ? textos.cenario.oQueAparece : "o cenário pedido no comando" };
}

/**
 * O PLANO INTEIRO EM DOIS EIXOS: a linguagem e os elementos (JEV), o bloco
 * de estilo e os textos (redator, em paralelo), a conferência (JEV) e a
 * estimativa de custo. Devolve o plano no formato do diretor (validado por
 * `validarPlano` no modo livre) e a base antiga da família, para a montagem.
 */
export async function escreverPlanoPeloJev(e: EntradaDoPlanoPeloJev): Promise<{ plano: PlanoDoDiretor; base: string; avisos: string[]; tempos: Record<string, number>; erro?: string }> {
  const tempos: Record<string, number> = {};
  const t = Date.now();
  // A linguagem primeiro (um pedido ao JEV); depois, em paralelo, os elementos (JEV, em ondas) e o bloco de estilo (redator).
  const L = await decidirLinguagem(e);
  const familia = L.familia;
  const fam = FAMILIA[familia];
  const [d, est] = await Promise.all([
    decidirPeloJev(e, L).then((x) => ((tempos.jev = +((Date.now() - t) / 1000).toFixed(1)), x)),
    escreverBlocoDeEstilo(e, familia, askClaude, L.estilo).then((x) => ((tempos.estilo = +((Date.now() - t) / 1000).toFixed(1)), x)),
  ]);
  // A ficha do estilo do catálogo (06/10; card 714) viaja na linguagem, lida direto: as peças em inglês vão ao redator de cada momento.
  const ling = linguagemComFicha({ familia, cenario: L.cenario, nome: fam.nome, blocoDeEstilo: est.bloco, origemDoBloco: est.origem, fonte: e.comando.fonte, cores: coresNoPrompt(e.paleta, e.cores), nicho: e.nicho ?? null, legenda: L.legenda ?? null, ...(est.base ? { baseDoBloco: est.base } : {}) } as LinguagemComFicha, est.estilo);
  const lista = d.momentos;
  const red = await redigirEConferir(e, ling, lista, { cenario: L.cenario === "trocado" });
  tempos.redator = red.tempos.redator;
  tempos.conferencia = red.tempos.conferencia;
  const erros = [...(est.erro ? [`bloco de estilo: ${est.erro} (usada a reserva)`] : []), ...red.erros];
  // A tese e as versões na frente (06/10, noite; estilo-manda.ts): o JEV escolhe, com critério e candidatas da fala.
  await escolherTeses(e, lista, red.textos, erros);
  const mat = materializar(lista, red.textos, ling, red.pedidos);
  await decidirVersoesNaFrente(e, mat.momentos, lista, L.cenario === "trocado", erros);
  const cenario = L.cenario === "trocado" ? insercaoDoCenario(red.textos, ling, e.frases) : null;
  const bruto = {
    leitura: `Plano em dois eixos: ${d.momentos.length} elementos decididos pelo JEV (${d.perguntas} perguntas) na linguagem "${fam.nome}"${est.estilo ? ` (ficha do estilo ${est.estilo})` : ""}, ritmo ${d.linguagem.densidade}, vídeo ${d.linguagem.video}, cobertura ${d.cobertura}, cenário ${L.cenario}.`,
    // O fundo atrás da pessoa SÓ com o pedido explícito (regra 1): nunca pela família.
    tema: { visual: fam.visual, acabamento: fam.acabamento, fundoColagem: L.cenario === "trocado", linguagem: familia },
    momentos: mat.momentos,
    insercoes: [...mat.insercoes, ...(cenario ? [cenario] : [])],
    enfases: d.enfases,
  };
  const v = validarPlano(bruto, fam.base, { livre: true });
  const validos = new Set([...v.plano.momentos.map((m) => String(m.id)), ...(v.plano.insercoes ?? []).map((x) => String(x.id))]);
  const plano: PlanoDoDiretor = {
    ...v.plano,
    linguagem: ling,
    elementos: mat.elementos.filter((x) => validos.has(x.id)),
    estimativa: estimarCusto(v.plano, e.duracao, d.regras.tetoUsdPorMinuto),
  };
  if (red.semTexto) v.avisos.push(`${red.semTexto} elemento(s) sem texto do redator saíram`);
  const vazio = !plano.momentos.length && !(plano.insercoes ?? []).length;
  return {
    plano,
    base: fam.base,
    avisos: [...d.avisos, ...erros, ...v.avisos].slice(0, 40),
    tempos,
    erro: vazio ? (d.momentos.length ? "o redator não devolveu textos" : "o JEV não decidiu nenhum elemento") : undefined,
  };
}

/** Os momentos decididos como o tipo do editor (para quem precisa só do esqueleto). */
export function esqueletoComoMomentos(m: MomentoDecidido[]): MomentoDoEditor[] {
  return m.filter((x) => x.peca).map((x) => ({ id: x.id, peca: x.peca!, de: `F${x.f0}`, ate: `F${x.f1}/fim`, props: {} }));
}

// ─────────────────────────────── o plano reaproveitado ───────────────────────────────

/** Os elementos de um plano já escrito, em segundos desta fala (as âncoras resolvidas; os que não resolvem ficam de fora). */
export function temposDoPlano(plano: PlanoDoDiretor, frases: Frase[], palavras: Array<{ texto: string; inicio: number; fim: number }>): Array<{ id: string; tipo: TipoDeElemento; inicio: number; fim: number; tela: boolean }> {
  const pal = palavras as Parameters<typeof resolverAncora>[2];
  const porId = new Map((plano.elementos ?? []).map((x) => [String(x.id), x]));
  const saida: Array<{ id: string; tipo: TipoDeElemento; inicio: number; fim: number; tela: boolean }> = [];
  for (const m of plano.momentos ?? []) {
    const a = resolverAncora(m.de, frases, pal);
    const b = resolverAncora(m.ate, frases, pal);
    if (a === null || b === null) continue;
    const ficha = FICHAS[m.peca];
    const el = porId.get(String(m.id));
    saida.push({ id: String(m.id), tipo: el?.tipo ?? "impacto", inicio: a, fim: Math.max(b, a + (ficha?.duracao[0] ?? 2)), tela: ficha?.plano === "tela" });
  }
  for (const x of plano.insercoes ?? []) {
    if ((x as { cenario?: boolean }).cenario || x.janela || x.combinada) continue;
    const a = resolverAncora(x.de, frases, pal);
    const b = resolverAncora(x.ate, frases, pal);
    if (a === null || b === null) continue;
    const el = porId.get(String(x.id));
    saida.push({ id: String(x.id), tipo: el?.tipo ?? (x.midia === "video" ? "video" : "imagem"), inicio: a, fim: Math.max(b, a + 2.4), tela: true });
  }
  return saida.sort((a, b) => a.inicio - b.inicio);
}

/**
 * O PLANO REAPROVEITADO DO ROTEIRO GANHA A COBERTURA E A CHAMADA DE
 * INSCREVER (05/10, noite): a montagem reaproveita o plano que o cliente
 * aprovou (sem decidir nem pagar de novo), mas as duas regras novas valem
 * para ele também: os buracos maiores que a régua são preenchidos pelo JEV
 * (só nos buracos: poucas perguntas) e, no YouTube, a chamada entra. O
 * redator escreve só os textos novos; a linguagem e o bloco de estilo do
 * plano ficam. Sem JEV, ou sem linguagem no plano, devolve o plano como veio.
 */
export async function completarPlanoPeloJev(plano: PlanoDoDiretor, e: EntradaDoPlanoPeloJev): Promise<{ plano: PlanoDoDiretor; avisos: string[]; tempos: Record<string, number> }> {
  // O plano de antes de 06/10 não gravou as peças da ficha: relidas pelo estilo do comando (card 714).
  const ling = plano.linguagem ? linguagemComFicha(plano.linguagem, estiloDoComando(e.comando)) : null;
  if (!ling || !jevDisponivel(e) || !e.frases.length) return { plano, avisos: [], tempos: {} };
  const t0 = Date.now();
  const avisos: string[] = [];
  const palavras = e.palavras ?? [];
  const L: DecisaoDaLinguagem = { familia: ling.familia, densidade: "medio", video: "algum", confianca: null, cenario: ling.cenario ?? "gravacao", estilo: ling.estiloDoCatalogo ?? null };
  const curto = e.duracao <= 95 || e.formato === "9:16";
  const teto = e.tetoUsdPorMinuto ?? tetoUsdPorMinuto();
  const R = regrasDoRitmo({ formato: e.formato, duracao: e.duracao, densidade: L.densidade, video: L.video, tetoUsdPorMinuto: teto, videosPorMinutoMax: videosPorMinutoMax(curto) });
  const U = momentosDaFala(e.frases, palavras);
  const perguntas = { n: 0 };
  // OS PEDIDOS DO CLIENTE sobre o plano aprovado (06/10): os que o plano ainda não atende são interpretados pelo JEV e
  // o trecho deles é refeito; o que a IA tinha decidido ali sai. As outras cenas ficam como o cliente aprovou.
  const pedidos = await interpretarPedidos({ ...e, pedidos: pedidosNaoAtendidos(plano, e.pedidos) }, U, avisos);
  perguntas.n += pedidos.size * 7;
  const janelasDosPedidos = [...pedidos.values()].map((pm) => ({ de: Math.min(U[pm.j].inicio, pm.pedido.inicio), ate: Math.max(U[pm.j].fim, pm.pedido.fim) }));
  const cruzaPedido = (inicio: number, fim: number) => janelasDosPedidos.some((w) => inicio < w.ate && fim > w.de);
  const existentes0 = temposDoPlano(plano, e.frases, palavras);
  const removidos = new Set(existentes0.filter((x) => cruzaPedido(x.inicio, x.fim)).map((x) => x.id));
  if (removidos.size) avisos.push(`pedidos do cliente: ${removidos.size} elemento(s) decidido(s) pela IA saíram dos trechos pedidos (${[...removidos].join(", ")})`);
  const existentes = existentes0.filter((x) => !removidos.has(x.id));
  const st: Estado = { momentos: [], segundosDeTela: 0, videos: 0, gasto: 0, porTipo: {} };
  for (const x of existentes) {
    const tipo = (x.tipo === "nada" ? "impacto" : x.tipo) as Exclude<TipoDeElemento, "nada">;
    st.momentos.push({ id: x.id, tipo, variante: varianteDo(tipo, "") ?? "impacto", peca: null, midia: null, f0: 0, f1: 0, de: "", ate: "", fala: "", inicio: x.inicio, fim: x.fim, tela: x.tela, custo: 0, origem: "existente" });
    st.porTipo[tipo] = (st.porTipo[tipo] ?? 0) + 1;
    if (x.tela) st.segundosDeTela += x.fim - x.inicio;
  }
  const antes = st.momentos.length;
  const minutos = Math.max(e.duracao / 60, 1 / 6);
  const gastoDoPlano = plano.estimativa?.usd ?? 0;
  const orcamento: Orcamento = { usd: Math.max(0, teto * minutos * 1.15 - gastoDoPlano), videos: Math.max(0, Math.floor(R.videosPorMinuto * minutos * 0.3)), duracao: e.duracao, inicio: 0 };
  // Os pedidos entram primeiro (lei), forçados; o pedido "sem efeito" só tira o que havia.
  encaixarPedidos(e, R, L.familia, U, [...pedidos.keys()], pedidos, st, orcamento, avisos);
  const enfases = [...(plano.enfases ?? [])];
  const memoria = new Map<number, Candidato>();
  const cobertura = await cobrirBuracos(e, L, R, U, st, memoria, orcamento, perguntas, enfases, avisos, pedidos);
  const novos = st.momentos.filter((m) => m.origem === "cobertura" || m.origem === "pedido");
  const jaTemInscrever = (plano.elementos ?? []).some((x) => x.tipo === "inscrever" && !removidos.has(x.id));
  const chamadas = jaTemInscrever ? [] : await decidirInscrever(e, L, U, st.momentos, enfases, avisos);
  const lista = [...novos, ...chamadas];
  await decidirAsCombinadas(e, lista, avisos);
  const tempos: Record<string, number> = { cobertura: +((Date.now() - t0) / 1000).toFixed(1) };
  const semRemovidos = (p: PlanoDoDiretor): PlanoDoDiretor => ({
    ...p,
    momentos: (p.momentos ?? []).filter((m) => !removidos.has(String(m.id))),
    insercoes: (p.insercoes ?? []).filter((x) => !removidos.has(String(x.id)) && !removidos.has(String(x.id).replace(/-img$/, ""))),
    elementos: (p.elementos ?? []).filter((x) => !removidos.has(x.id)),
  });
  if (!lista.length) return { plano: removidos.size ? semRemovidos(plano) : plano, avisos: [...avisos, `cobertura: nenhum elemento novo (${antes} existentes, ${perguntas.n} perguntas)`], tempos };
  const red = await redigirEConferir(e, ling, lista);
  tempos.redator = red.tempos.redator;
  tempos.conferencia = red.tempos.conferencia;
  await escolherTeses(e, lista, red.textos, avisos);
  const mat = materializar(lista, red.textos, ling, red.pedidos);
  await decidirVersoesNaFrente(e, mat.momentos, lista, ling.cenario === "trocado", avisos);
  const base = semRemovidos(plano);
  const bruto = { ...base, momentos: [...(base.momentos ?? []), ...mat.momentos], insercoes: [...(base.insercoes ?? []), ...mat.insercoes], enfases };
  const v = validarPlano(bruto, FAMILIA[ling.familia].base, { livre: true });
  const validos = new Set([...v.plano.momentos.map((m) => String(m.id)), ...(v.plano.insercoes ?? []).map((x) => String(x.id))]);
  const novo: PlanoDoDiretor = {
    ...v.plano,
    linguagem: ling,
    elementos: [...(base.elementos ?? []), ...mat.elementos].filter((x) => validos.has(x.id)).sort((a, b) => a.inicio - b.inicio),
    estimativa: estimarCusto(v.plano, e.duracao, R.tetoUsdPorMinuto),
    leitura: `${plano.leitura ?? ""} Cobertura (05/10): ${cobertura} elemento(s) novo(s) nos buracos e ${chamadas.length} chamada(s) de inscrever, pelo JEV.${pedidos.size ? ` Pedidos do cliente (06/10): ${pedidos.size} trecho(s) refeito(s) pelo pedido.` : ""}`.trim(),
  };
  return { plano: novo, avisos: [...avisos, ...red.erros, ...v.avisos, `cobertura: ${mat.momentos.length + mat.insercoes.length} elemento(s) novo(s) sobre ${antes} existentes (${perguntas.n} perguntas ao JEV)`].slice(0, 40), tempos };
}

/** Os pedidos que o plano AINDA não atende (o mesmo texto já gravado num elemento do trecho não é refeito). */
export function pedidosNaoAtendidos(plano: PlanoDoDiretor, pedidos: PedidoDaCena[] | undefined): PedidoDaCena[] {
  const feitos = (plano.elementos ?? []).filter((x) => x.pedido);
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  return (pedidos ?? []).filter((p) => !feitos.some((x) => x.inicio < p.fim + 1 && x.fim > p.inicio - 1 && norm(x.pedido ?? "").includes(norm(p.texto))));
}


// ─────────────────────────────── a tese e a versão na frente (06/10, noite) ───────────────────────────────

/**
 * A PALAVRA-TESE PELO JEV (06/10, noite; o vídeo cmux0hoxk saiu com "OLHA
 * ISSO" como tese). Para cada texto atrás da pessoa, as candidatas saem da
 * fala do momento (números e palavras com significado; interjeição nunca
 * entra), e o JEV escolhe com o critério (`CRITERIO_DA_TESE`). O texto do
 * redator entra como candidata só se servir de tese. Sem JEV, o texto do
 * redator fica se servir; senão, a primeira candidata.
 */
export async function escolherTeses(e: EntradaDoPlanoPeloJev, lista: MomentoDecidido[], textos: Record<string, Record<string, unknown>>, avisos: string[]): Promise<void> {
  const alvos = lista.filter((m) => m.peca === "titulo-atras" && textos[m.id] && !m.pedidoDoCliente);
  if (!alvos.length) return;
  const maiuscula = (x: string) => x.toLocaleUpperCase("pt-BR");
  const textoAtual = (id: string) => String(textos[id]?.texto ?? "").replace(/\*\*/g, "").trim();
  const candidatas = new Map<string, string[]>();
  for (const m of alvos) {
    const atual = textoAtual(m.id);
    const daFala = candidatasATese(m.fala, 6);
    const todas = [...(atual && teseServe(atual) ? [maiuscula(atual)] : []), ...daFala.filter((c) => c !== maiuscula(atual))].slice(0, 7);
    if (todas.length) candidatas.set(m.id, todas);
  }
  let r: Record<string, RespostaDoJev> = {};
  if (jevDisponivel(e) && candidatas.size) {
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const m of alvos) {
      const c = candidatas.get(m.id);
      if (c && c.length > 1) perguntas[`tese_${m.id}`] = perguntaDaTese(m.falaEmVolta ?? m.fala, c);
    }
    if (Object.keys(perguntas).length) {
      try {
        r = await jevDe(e)({ projectId: e.projectId, etapa: "editor-por-comando-tese", state: { comando: e.comando.texto, nicho: e.nicho ?? "" } }, perguntas);
      } catch (err) {
        avisos.push(`tese: o JEV falhou (${err instanceof Error ? err.message.slice(0, 80) : err}), ficou a reserva`);
      }
    }
  }
  for (const m of alvos) {
    const c = candidatas.get(m.id);
    const atual = textoAtual(m.id);
    const doJev = c ? (c.length === 1 ? c[0] : teseDaResposta(r[`tese_${m.id}`], c)) : null;
    const escolhida = doJev ?? (teseServe(atual) ? atual : c?.[0] ?? null);
    if (!escolhida) {
      // Sem palavra que sirva de tese, o texto atrás não entra com uma interjeição: sai.
      delete textos[m.id];
      avisos.push(`${m.id}: sem palavra com significado na fala para a tese, o texto atrás saiu`);
      continue;
    }
    if (maiuscula(escolhida) !== maiuscula(atual)) {
      avisos.push(`${m.id}: tese "${atual}" trocada por "${escolhida}"${doJev ? " (escolha do JEV)" : ""}`);
      textos[m.id] = { ...textos[m.id], texto: escolhida };
    }
  }
}

/**
 * A VERSÃO NA FRENTE PELO JEV (06/10, noite): para cada peça que depende de
 * recorte ou de área livre (o título atrás; as peças de folha sem o cenário
 * trocado), o JEV escolhe a versão na FRENTE que o resolvedor usa se a guarda
 * barrar a peça (a pessoa se mexe, falta área livre). Fica em
 * `props.naFrente`; o resolvedor confere a geometria. Nenhum estilo é citado.
 */
export async function decidirVersoesNaFrente(e: EntradaDoPlanoPeloJev, momentos: MomentoDoEditor[], lista: MomentoDecidido[], cenarioTrocado: boolean, avisos: string[]): Promise<void> {
  if (!jevDisponivel(e)) return;
  const falaDe = new Map(lista.map((m) => [m.id, m.falaEmVolta ?? m.fala]));
  const alvos = momentos
    .filter((m) => {
      const ficha = FICHAS[m.peca];
      const props = (m.props ?? {}) as Record<string, unknown>;
      if (!ficha || props.naFrente) return false;
      if (m.peca !== "titulo-atras" && cenarioTrocado) return false;
      return precisaDeVersaoNaFrente(m.peca, ficha.plano) && Boolean(textosDaPeca(props).principal);
    })
    .slice(0, 30);
  if (!alvos.length) return;
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const m of alvos) perguntas[`frente_${m.id}`] = perguntaDaFrente(m.peca, textosDaPeca((m.props ?? {}) as Record<string, unknown>).principal, falaDe.get(String(m.id)) ?? "");
  try {
    const r = await jevDe(e)({ projectId: e.projectId, etapa: "editor-por-comando-na-frente", state: { comando: e.comando.texto, nicho: e.nicho ?? "" } }, perguntas);
    for (const m of alvos) {
      const v = versaoDaResposta(r[`frente_${m.id}`]);
      if (v) m.props = { ...(m.props ?? {}), naFrente: v };
    }
  } catch (err) {
    avisos.push(`versão na frente: o JEV falhou (${err instanceof Error ? err.message.slice(0, 80) : err}), fica a geometria`);
  }
}
