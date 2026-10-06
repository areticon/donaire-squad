import { askClaude } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import { FICHAS } from "@/lib/media/editor-sob-medida/pecas";
import { resolverAncora, type Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { validarPlano, type ElementoDoPlano, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import {
  COMPONENTES_COM_FOTO,
  CRITERIO_DO_TIPO,
  DURACAO_DO_TIPO,
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
import { contextoDoTrecho, movimentoEm, resumoDaLeitura, tiposPossiveis, trechoEm } from "@/lib/media/editor-por-comando/leitura-no-plano";

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
};

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
  onde?: "canto" | "acima-da-cabeca" | "ao-lado";
  custo: number;
  /** O pedido do cliente que caiu aqui, quando houve. */
  pedido?: string | null;
  /** Entrou pela cobertura (o buraco maior que a régua) ou pela chamada de inscrever, não pela onda. */
  origem?: "onda" | "cobertura" | "inscrever" | "existente";
  /** O que a câmera mostra neste momento, pela leitura do vídeo (06/10): o redator e a conferência leem. */
  emCena?: string;
};

export type DecisaoDaLinguagem = { familia: FamiliaVisual; densidade: Densidade; video: QuantoDeMidia; confianca: number | null; cenario: CenarioDaGravacao };

// ─────────────────────────────── eixo 2: a linguagem ───────────────────────────────

/** O contexto de TODO pedido ao JEV e ao redator: o comando, o nicho, a marca, o perfil e a leitura do vídeo inteiro (06/10). */
const contextoDoProjeto = (e: EntradaDoPlanoPeloJev) =>
  [`Comando do cliente: "${e.comando.texto}"`, e.nicho ? `Nicho e público do projeto: ${e.nicho}` : "", e.marca ? `Marca: ${e.marca}` : "", e.perfil ? e.perfil.slice(0, 600) : "", resumoDaLeitura(e.leitura)].filter(Boolean).join("\n");

/** O JEV escolhe a família da linguagem, a densidade, o quanto de vídeo e se o comando pede para trocar o cenário. */
export async function decidirLinguagem(e: EntradaDoPlanoPeloJev): Promise<DecisaoDaLinguagem> {
  const recuo: DecisaoDaLinguagem = { familia: familiaPorPalavras(e.comando.texto), densidade: "medio", video: "algum", confianca: null, cenario: cenarioPorPalavras(e.comando.texto) };
  if (!jevLigado()) return recuo;
  try {
    const r = await perguntarAoJev(
      { projectId: e.projectId, etapa: "editor-por-comando-linguagem", state: contextoDoProjeto(e) },
      {
        familia: {
          type: "choice",
          instructions: "Qual linguagem visual o comando do cliente pede para desenhar TODOS os elementos do vídeo (textos, ícones, imagens, vídeos)? Leve em conta o nicho, a marca e, quando houver, a leitura do vídeo (o gênero e o cenário da gravação) quando o comando não diz.",
          criteria: Object.fromEntries(FAMILIAS.map((f) => [f.id, f.criterio])),
        },
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
      }
    );
    const fam = r.familia?.type === "choice" ? r.familia : null;
    const familia = decidirChoice(r.familia, FAMILIAS.map((f) => f.id), recuo.familia, 0.3);
    const semVideo = (probabilidadeDeSim(r.semVideo) ?? 0) >= 0.7;
    const trocar = probabilidadeDeSim(r.trocarCenario);
    return {
      familia,
      densidade: decidirChoice(r.densidade, ["calmo", "medio", "rapido"] as const, "medio", 0.3),
      video: semVideo ? "nenhum" : decidirChoice(r.video, ["muito", "algum", "pouco"] as const, "algum", 0.3),
      confianca: fam ? +(fam.confidence ?? 0).toFixed(2) : null,
      // Sem resposta do JEV, a reserva por palavras; com resposta, só o "sim" firme troca.
      cenario: trocar === null ? recuo.cenario : trocar >= 0.7 ? "trocado" : "gravacao",
    };
  } catch {
    return recuo;
  }
}

const SISTEMA_DO_ESTILO = `Você escreve o BLOCO DE ESTILO de um vídeo: um parágrafo em INGLÊS, de 35 a 60 palavras, que vai no fim de TODO prompt de imagem e de vídeo gerado para este vídeo, para que todas as imagens e cenas tenham a mesma linguagem visual.

O bloco descreve SÓ o acabamento (técnica, material, luz, textura, enquadramento, paleta), nunca a cena. Ele traduz o comando do cliente com fidelidade, combina com o nicho e com a marca, e cita as cores da marca como acento nos detalhes. Quando houver a leitura do vídeo (o cenário da gravação, o gênero), o acabamento conversa com ela: as imagens vão aparecer ao lado dessa gravação, com a luz e o ambiente dela. Sem nome de marca de terceiros, sem nome de artista vivo, sem pessoa real.

Responda só JSON: {"bloco":"..."}`;

/** O redator escreve o bloco de estilo (uma chamada curta); sem ele, a reserva com as palavras do comando. */
export async function escreverBlocoDeEstilo(e: EntradaDoPlanoPeloJev, familia: FamiliaVisual): Promise<{ bloco: string; origem: "redator" | "reserva"; erro?: string }> {
  const cores = coresNoPrompt(e.paleta, e.cores);
  const reserva = blocoDeEstiloDeReserva(familia, e.comando.texto, e.nicho, cores);
  try {
    const r = await askClaude(
      SISTEMA_DO_ESTILO,
      [contextoDoProjeto(e), `Família visual escolhida: ${FAMILIA[familia].nome} (sementes: ${FAMILIA[familia].semente}).`, e.leitura?.cenario ? `A gravação ao lado da qual as imagens vão aparecer: ${e.leitura.cenario.slice(0, 220)}.` : "", cores].filter(Boolean).join("\n"),
      { model: MODELO_DO_REDATOR, maxTokens: 4000, effort: "low", timeoutMs: 90_000, usage: { projectId: e.projectId ?? undefined, operation: "editor-por-comando-estilo" } }
    );
    const j = extrairJson(r) as { bloco?: unknown };
    const bloco = typeof j?.bloco === "string" ? j.bloco.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim() : "";
    if (bloco.split(" ").length < 12) return { bloco: reserva, origem: "reserva", erro: "bloco curto demais" };
    return { bloco: `${bloco.slice(0, 700)}${/#[0-9a-f]{6}/i.test(bloco) ? "" : ` ${cores}`}`.trim(), origem: "redator" };
  } catch (err) {
    return { bloco: reserva, origem: "reserva", erro: err instanceof Error ? err.message.slice(0, 120) : String(err) };
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

/** Pedido do cliente que diz o tipo ("põe um vídeo", "uma foto aqui", "um número"). */
function tipoDoPedido(pedido: string): TipoDeElemento | null {
  const p = pedido.toLowerCase();
  if (/v[ií]deo|b-?roll|cena em movimento|filmagem/.test(p)) return "video";
  if (/imagem|foto|ilustra/.test(p)) return "imagem";
  if (/n[uú]mero|dado|gr[aá]fico|porcentagem/.test(p)) return "dado";
  if (/lista|passos|etapas/.test(p)) return "lista";
  if (/cita[cç][aã]o|vers[ií]culo|manchete/.test(p)) return "citacao";
  if (/[ií]cone|s[ií]mbolo|emoji/.test(p)) return "icone";
  if (/atr[aá]s de mim|palavra gigante/.test(p)) return "texto-atras";
  if (/impacto|tela cheia/.test(p)) return "impacto";
  if (/destaque|grifa|marca-texto|sublinha/.test(p)) return "legenda-destaque";
  return null;
}

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
type Candidato = { j: number; u: MomentoDaFala; pedido: string | null; forcado: boolean; candidatos: Array<{ t: Exclude<TipoDeElemento, "nada">; p: number }>; pNada: number; forma: "janela" | "tela-cheia"; onde: "canto" | "acima-da-cabeca" | "ao-lado"; movimento: number };

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

/** As respostas de uma onda viram candidatos (um por momento), guardados na memória. */
function candidatosDaOnda(e: EntradaDoPlanoPeloJev, U: MomentoDaFala[], onda: number[], r: Record<string, RespostaDoJev>, enfases: string[], memoria: Map<number, Candidato>): Candidato[] {
  const pedidoNo = (u: MomentoDaFala) => (e.pedidos ?? []).find((p) => p.inicio < u.fim && p.fim > u.inicio)?.texto ?? null;
  const depurar = process.env.EDITOR_DOIS_EIXOS_DEPURAR === "1";
  const saida: Candidato[] = [];
  for (const j of onda) {
    const u = U[j];
    if ((probabilidadeDeSim(r[`enfase_${j}`]) ?? 0) >= 0.6 && !enfases.includes(u.de)) enfases.push(u.de);
    const pedido = pedidoNo(u);
    if (pedido && /sem efeito|sem peça|sem nada|deixa limpo|s[oó] eu/i.test(pedido)) continue;
    const probs = pTipo(r[`tipo_${j}`]);
    if (!Object.keys(probs).length) continue;
    const pNada = probs.nada ?? 0;
    // Só os tipos que a pergunta ofereceu têm probabilidade; os outros ficam em zero e nunca entram.
    let candidatos = TIPOS_DECIDIVEIS.map((t) => ({ t: t as Exclude<TipoDeElemento, "nada">, p: probs[t] ?? 0 }))
      .filter((c) => c.p > 0)
      .sort((a, b) => b.p - a.p);
    const doPedido = pedido ? tipoDoPedido(pedido) : null;
    if (doPedido && doPedido !== "nada") candidatos = [{ t: doPedido, p: 1 }, ...candidatos.filter((c) => c.t !== doPedido)];
    if (!candidatos[0]) continue;
    if (depurar) console.log(`[dois-eixos] U${j} ${u.inicio.toFixed(1)}s nada=${pNada.toFixed(2)} ${candidatos.slice(0, 3).map((c) => `${c.t}=${c.p.toFixed(2)}`).join(" ")} "${u.texto.slice(0, 50)}"`);
    const c: Candidato = { j, u, pedido, forcado: Boolean(pedido), candidatos, pNada, forma: decidirChoice(r[`forma_${j}`], FORMAS, "janela", 0.3), onde: decidirChoice(r[`onde_${j}`], ONDES, "canto", 0.3), movimento: probabilidadeDeSim(r[`movimento_${j}`]) ?? 0 };
    memoria.set(j, c);
    saida.push(c);
  }
  return saida;
}

/** Tenta pôr um candidato no estado, com as regras do ritmo (ou as da cobertura, mais folgadas). */
function encaixar(e: EntradaDoPlanoPeloJev, R: RegrasDoRitmo, familia: FamiliaVisual, U: MomentoDaFala[], c: Candidato, st: Estado, orcamento: Orcamento, modo: "onda" | "cobertura"): MomentoDecidido | null {
  const { j, u, pedido, forcado, forma, onde, movimento } = c;
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
  memoria: Map<number, Candidato>
): Promise<MomentoDecidido[]> {
  const st: Estado = { momentos: [], segundosDeTela: 0, videos: 0, gasto: 0, porTipo: {} };
  const familia = L.familia;
  for (let w = 0; w < indices.length; w += ONDA) {
    const onda = indices.slice(w, w + ONDA).filter((j) => U[j].fim - U[j].inicio >= 0.6);
    if (!onda.length) continue;
    const perto = st.momentos.slice(-4).map((m) => `${m.tipo} em ${m.inicio.toFixed(0)} s`);
    const recentes = perto.length ? `Já entraram perto, nesta ordem: ${perto.join("; ")}. Varie: o mesmo tipo em sequência cansa.` : "Ainda não entrou nenhum elemento neste trecho.";
    const perguntas = perguntasDaOnda(e, U, onda, recentes);
    let r: Record<string, RespostaDoJev> = {};
    try {
      r = await perguntarAoJev(
        {
          projectId: e.projectId,
          etapa: "editor-por-comando-plano",
          state: `${contextoDoProjeto(e)}\nLinguagem visual: ${FAMILIA[familia].nome}. Formato: ${e.formato}. Ritmo pedido: ${L.densidade}.\nRegra: decida pelo que o momento DIZ${e.leitura ? " e pelo que a câmera MOSTRA (a leitura do trecho)" : ""}; imagem e vídeo só quando há algo concreto para ver; nada é escolha válida.`,
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
    const daOnda = candidatosDaOnda(e, U, onda, r, enfases, memoria).filter((c) => {
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
  onde: "canto" | "acima-da-cabeca" | "ao-lado",
  pedido: string | null,
  st: Estado,
  orcamento: Orcamento
): MomentoDecidido | null {
  const u = U[j];
  let tipo = tipo0;
  let forma = forma0;
  // O vídeo além do teto por minuto vira imagem em tela cheia (o momento pedia algo para ver).
  if (tipo === "video" && st.videos + 1 > orcamento.videos) {
    tipo = "imagem";
    forma = "tela-cheia";
  }
  const variante = varianteDo(tipo, u.texto, forma);
  if (!variante) return null;
  let peca = componenteDa(familia, variante);
  const ficha = peca ? FICHAS[peca] : null;
  if (peca && !ficha) peca = null;
  const midia: "imagem" | "video" | null = tipo === "video" ? "video" : tipo === "imagem" ? "imagem" : null;
  // Imagem em tela cheia e vídeo são inserções (cobrem a gravação); a peça de tela também.
  let tela = !peca || ficha?.plano === "tela";
  if (peca === "imagem-janela") tela = false;
  const [dMin, dMax0] = ficha ? ficha.duracao : DURACAO_DO_TIPO[tipo];
  // A LEITURA DO TRECHO (06/10): com a pessoa se mexendo muito, nada vai atrás dela (o recorte em movimento falha)
  // e a peça fica mais curta; o que a câmera mostra vai com o momento para o redator e para a conferência.
  const tr = trechoEm(e.leitura, u.inicio);
  const mexeMuito = movimentoEm(e.leitura, u.inicio, u.fim) === "muito";
  if (mexeMuito && tipo === "texto-atras") return null;
  const dMax = Math.min(tela ? Math.min(dMax0, R.telaMaxSeg) : dMax0, mexeMuito ? Math.max(dMin, 3.2) : Infinity);
  // Lista e citação seguem até o fim do momento seguinte (os itens são ditos em sequência).
  const j1 = (tipo === "lista" || tipo === "citacao") && U[j + 1] ? j + 1 : j;
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
  const segundos = Math.min(5, Math.max(3, Math.ceil(fim - inicio)));
  const custo = custoPrevisto(tipo, variante, segundos, pecaComFoto);
  if (st.gasto + custo > orcamento.usd + 1e-6) {
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
    ...(tipo === "icone" ? { onde } : {}),
    custo,
    fala: U.slice(j, j1 + 1).map((x) => x.texto).join(" "),
    falaEmVolta: U.slice(Math.max(0, j - 1), j1 + 2).map((x) => x.texto).join(" "),
    pedido,
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
  avisos: string[]
): Promise<number> {
  let postos = 0;
  for (let rodada = 0; rodada < 6; rodada++) {
    const abertos = buracos(st.momentos, e.duracao, R.maiorSemTroca);
    if (!abertos.length) break;
    // Os momentos de cada buraco que o JEV ainda não avaliou: perguntados agora (até 6 por buraco, espalhados).
    const faltam: number[] = [];
    for (const [a, b] of abertos) {
      const dentro = U.map((u, j) => j).filter((j) => U[j].inicio >= a + 0.5 && U[j].fim <= b - 0.5 && U[j].fim - U[j].inicio >= 0.6 && !memoria.has(j));
      const passo = Math.max(1, Math.floor(dentro.length / 6));
      faltam.push(...dentro.filter((_, i) => i % passo === 0).slice(0, 6));
    }
    if (faltam.length && jevLigado()) {
      try {
        const r = await perguntarAoJev(
          { projectId: e.projectId, etapa: "editor-por-comando-cobertura", state: `${contextoDoProjeto(e)}\nLinguagem visual: ${FAMILIA[L.familia].nome}. Formato: ${e.formato}.\nEste trecho do vídeo está há muito tempo sem nenhum elemento na tela: escolha o elemento que melhor serve a cada momento.` },
          perguntasDaOnda(e, U, faltam, "Este trecho está sem elemento há mais tempo do que o ritmo pedido permite.")
        );
        perguntasFeitas.n += faltam.length * 5;
        candidatosDaOnda(e, U, faltam, r, enfases, memoria);
      } catch (err) {
        avisos.push(`JEV falhou na cobertura: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
      }
    }
    let mudou = false;
    for (const [a, b] of abertos) {
      // O melhor candidato do buraco, pela força do tipo que o JEV deu; perto do meio em caso de empate.
      const meio = (a + b) / 2;
      const dentro = [...memoria.values()].filter((c) => c.u.inicio >= a + 0.5 && c.u.fim <= b - 0.5).sort((x, y) => y.candidatos[0].p - x.candidatos[0].p || Math.abs(x.u.inicio - meio) - Math.abs(y.u.inicio - meio));
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
  if (!e.youtube || !jevLigado()) return [];
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
    const r = await perguntarAoJev({ projectId: e.projectId, etapa: "editor-por-comando-inscrever", state: `${contextoDoProjeto(e)}\nO vídeo vai para o YouTube: a chamada de curtir e se inscrever entra ${vezes} vez(es), perto de momentos fortes.` }, perguntas);
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
  const L = ja ?? (await decidirLinguagem(e));
  const curto = e.duracao <= 95 || e.formato === "9:16";
  const teto = e.tetoUsdPorMinuto ?? tetoUsdPorMinuto();
  const R = regrasDoRitmo({ formato: e.formato, duracao: e.duracao, densidade: L.densidade, video: L.video, tetoUsdPorMinuto: teto, videosPorMinutoMax: videosPorMinutoMax(curto) });
  if (!jevLigado()) return { momentos: [], enfases: [], avisos: ["JEV desligado: o vídeo sai sem elementos"], perguntas: 0, linguagem: L, regras: R, cobertura: 0 };
  if (!e.frases.length) return { momentos: [], enfases: [], avisos: [], perguntas: 0, linguagem: L, regras: R, cobertura: 0 };
  const U = momentosDaFala(e.frases, e.palavras);
  // Os blocos de ~5 min em paralelo, cada um com a parte proporcional do dinheiro e do teto de vídeo.
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, b) => U.map((u, j) => ({ u, j })).filter(({ u }) => u.inicio >= (b * e.duracao) / n && (b === n - 1 || u.inicio < ((b + 1) * e.duracao) / n)).map(({ j }) => j));
  const perguntas = { n: 0 };
  const enfases: string[] = [];
  const minutos = Math.max(e.duracao / 60, 1 / 6);
  const memoria = new Map<number, Candidato>();
  const partes = await Promise.all(
    blocos.map((indices) => {
      if (!indices.length) return Promise.resolve([] as MomentoDecidido[]);
      const ini = U[indices[0]].inicio;
      const dur = U[indices[indices.length - 1]].fim - ini;
      const frac = dur / Math.max(1, e.duracao);
      return decidirBloco(e, L, R, U, indices, { usd: teto * minutos * frac, videos: Math.floor(R.videosPorMinuto * minutos * frac + 0.5), duracao: Math.max(dur, 1), inicio: ini }, perguntas, enfases, avisos, memoria);
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
  const cobertura = await cobrirBuracos(e, L, R, U, st, memoria, { usd: teto * minutos * 1.15, videos: Math.floor(R.videosPorMinuto * minutos + 0.5), duracao: e.duracao, inicio: 0 }, perguntas, enfases, avisos);
  const momentos = st.momentos;
  // O GANCHO DO CORTE (regra explícita): o vertical curto abre com texto na tela nos 3 primeiros segundos.
  if (R.curto && U[0] && !momentos.some((m) => m.inicio < 3)) {
    const u = U[0];
    const tipo: "texto-atras" | "legenda-destaque" = momentos[0]?.tipo === "legenda-destaque" ? "texto-atras" : "legenda-destaque";
    const peca = componenteDa(L.familia, tipo)!;
    const d = FICHAS[peca]?.duracao ?? DURACAO_DO_TIPO[tipo];
    momentos.unshift({ id: "j0", tipo, variante: tipo, peca, midia: null, f0: u.k, f1: u.k, de: u.de, ate: u.ate, inicio: u.inicio, fim: Math.max(u.inicio + d[0], Math.min(u.fim, u.inicio + d[1])), tela: false, custo: 0, fala: u.texto, pedido: null });
  }
  // Dois elementos não se cruzam: o que entra enquanto o anterior está na tela sai (o anterior manda).
  const limpos: MomentoDecidido[] = [];
  for (const m of momentos) {
    const ant = limpos[limpos.length - 1];
    if (ant && m.inicio < ant.fim + 0.2) {
      avisos.push(`${m.id}: cruzava ${ant.id}, saiu`);
      continue;
    }
    limpos.push(m);
  }
  // CURTIR E INSCREVER (regra 3): o JEV escolhe os momentos, nos trechos livres que sobraram.
  const chamadas = await decidirInscrever(e, L, U, limpos, enfases, avisos);
  const todos = [...limpos, ...chamadas].sort((a, b) => a.inicio - b.inicio);
  return { momentos: todos, enfases, avisos, perguntas: perguntas.n, linguagem: L, regras: R, cobertura };
}

// ─────────────────────────────── o redator ───────────────────────────────

const SISTEMA_DO_REDATOR = `Você é o REDATOR dos elementos visuais de um vídeo. As decisões já foram tomadas por outro sistema: qual elemento entra, em que momento, por quanto tempo e em qual linguagem visual. Você NÃO escolhe nem muda nada disso. Você só ESCREVE o texto de cada elemento, nas props pedidas.

Regras do texto na tela:
- Português do Brasil, com as palavras do próprio falante; curto (título até 5 palavras, rótulo até 3, manchete até 9). Sem travessão, sem ponto final em título. Destaque com **asteriscos** em 1 a 3 palavras quando a ficha pede.
- Nunca invente número, nome, dado ou promessa que a fala não diz.
- Lista (itens, passos, marcos): só o que a fala diz, na ordem dita, até o máximo da ficha.
- Ícone: "nome" é um dos nomes da lista da ficha.

Regras da CENA de imagem e de vídeo ("cena", em INGLÊS):
- A cena concreta DESTE momento: o que aparece na imagem (ou o que acontece no vídeo) que faz sentido com a fala, com o NICHO do projeto e com a marca. Nunca imagem genérica (nada de "business people", "abstract background", "success concept").
- Vídeo: descreva a AÇÃO e o movimento que acontece (o que se mexe), em 1 ou 2 frases.
- Não descreva o estilo nem as cores (o bloco de estilo do vídeo é acrescentado depois). Sem texto na imagem. Nunca pessoa real, famosa ou identificável, nunca nome próprio; pessoas só anônimas, de costas, mãos, silhueta ou ao longe.
- "oQueAparece": a mesma cena em português, até 8 palavras, para o cliente aprovar.
- Quando houver a LEITURA DO VÍDEO (o cenário da gravação e o "EM CENA" de cada momento), a cena da imagem ou do vídeo CONVERSA com ela: o mesmo tipo de ambiente e de luz, os objetos que estão em cena quando fizer sentido, o assunto que a fala e a imagem mostram naquele momento; nunca uma cena que brigue com o que o espectador está vendo ao lado.
- O NOME DE QUEM FALA ("nome", "papel") sai da leitura do vídeo ou da própria fala; nunca inventado. Sem nome na leitura nem na fala, use o papel ("o entrevistado", "a médica").
- Fotos de arquivo das peças de papel ("descricao"): em INGLÊS, concreta (objeto, lugar, prédio, estátua genérica, figura anônima de época).
- O CENÁRIO (id "cenario", só quando pedido): o fundo que o cliente pediu no comando para ficar atrás dele, em INGLÊS, sem pessoas, com espaço livre no centro para a pessoa.
- Quando houver PEDIDO DO CLIENTE no momento, o texto atende ao pedido.

Responda só JSON: {"momentos":[{"id":"j12","props":{...}}]} com um item por momento recebido, na ordem.`;

/** As props que o redator escreve para cada momento: a ficha da peça, ou a da inserção. */
function propsParaORedator(m: MomentoDecidido): string {
  if (m.peca === "imagem-janela") return 'cena (EM INGLÊS, a imagem deste momento), oQueAparece (português, até 8 palavras), legenda? (até 5 palavras do falante), lado? ("direita" | "esquerda" | "topo")';
  if (!m.peca) return m.midia === "video" ? "cena (EM INGLÊS, a ação em movimento deste momento, 1 ou 2 frases), oQueAparece (português, até 8 palavras)" : "cena (EM INGLÊS, a imagem em tela cheia deste momento), oQueAparece (português, até 8 palavras)";
  if (m.peca === "icone") return `${FICHAS.icone.props} (posicao: ${m.onde === "acima-da-cabeca" ? '"topo"' : m.onde === "ao-lado" ? '"direita"' : '"topo-esquerda"'})`;
  return FICHAS[m.peca]?.props ?? "texto";
}

type MomentoParaRedator = MomentoDecidido;

/** Uma chamada do redator para um bloco de momentos. */
async function redigirBloco(e: EntradaDoPlanoPeloJev, ling: LinguagemDoVideo, lista: MomentoParaRedator[], falaDoBloco: string, cenario?: boolean): Promise<Record<string, Record<string, unknown>>> {
  if (!lista.length && !cenario) return {};
  const pedido = [
    contextoDoProjeto(e),
    e.titulo ? `TÍTULO: ${e.titulo}` : "",
    `LINGUAGEM VISUAL: ${ling.nome}. Bloco de estilo (acrescentado depois a toda cena): ${ling.blocoDeEstilo}`,
    `# A FALA DESTE BLOCO\n${falaDoBloco}`,
    `# OS MOMENTOS (escreva só as props de cada um)\n${[
      ...(cenario ? ["- id cenario, o CENÁRIO que o cliente pediu no comando para ficar atrás dele o vídeo inteiro\n  props: cena (EM INGLÊS, o cenário pedido, sem pessoas, espaço livre no centro), oQueAparece (português, até 8 palavras)"] : []),
      ...lista.map((m) => `- id ${m.id}, elemento "${m.tipo}"${m.peca ? `, peça "${m.peca}"` : `, ${m.midia === "video" ? "vídeo" : "imagem em tela cheia"}`} (${m.inicio.toFixed(0)} s a ${m.fim.toFixed(0)} s), sobre a fala: "${m.fala.slice(0, 300)}"${m.pedido ? `\n  PEDIDO DO CLIENTE: "${m.pedido}"` : ""}${m.emCena ? `\n  ${m.emCena.slice(0, 500)}` : ""}\n  props: ${propsParaORedator(m)}`),
    ].join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const resposta = await askClaude(SISTEMA_DO_REDATOR, pedido, {
    model: MODELO_DO_REDATOR,
    maxTokens: 12000,
    effort: "low",
    timeoutMs: 180_000,
    usage: { projectId: e.projectId ?? undefined, operation: "editor-por-comando-redator" },
  });
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
  return "";
}

/**
 * OS TEXTOS DOS MOMENTOS: o redator por bloco de ~5 min em paralelo (a
 * chamada de inscrever não passa por ele: as props são de interface), e a
 * CONFERÊNCIA PELO JEV (o texto longo, confuso ou inventado sai; a cena
 * genérica ou fora do nicho também). Devolve os textos aprovados.
 */
async function redigirEConferir(e: EntradaDoPlanoPeloJev, ling: LinguagemDoVideo, lista: MomentoDecidido[], opcoes: { cenario?: boolean } = {}): Promise<{ textos: Record<string, Record<string, unknown>>; erros: string[]; semTexto: number; tempos: { redator: number; conferencia: number } }> {
  let t = Date.now();
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, k) => ({ de: (k * e.duracao) / n, ate: ((k + 1) * e.duracao) / n }));
  const textos: Record<string, Record<string, unknown>> = {};
  const erros: string[] = [];
  for (const m of lista) if (m.tipo === "inscrever") textos[m.id] = { ...PROPS_DO_INSCREVER };
  const paraRedator = lista.filter((m) => m.tipo !== "inscrever");
  await Promise.all(
    blocos.map(async (b, k) => {
      const doBloco = paraRedator.filter((m) => m.inicio >= b.de && m.inicio < b.ate);
      const cenario = Boolean(opcoes.cenario && k === 0);
      if (!doBloco.length && !cenario) return;
      const fala = e.frases.filter((f) => f.fim > b.de && f.inicio < b.ate).map((f) => `[${f.inicio.toFixed(0)}s] ${f.texto}`).join("\n");
      try {
        Object.assign(textos, await redigirBloco(e, ling, doBloco, fala, cenario));
      } catch (err) {
        erros.push(`redator: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    })
  );
  const tempos = { redator: +((Date.now() - t) / 1000).toFixed(1), conferencia: 0 };
  t = Date.now();
  const reprovados = new Set<string>();
  const motivos: string[] = [];
  if (jevLigado()) {
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const m of paraRedator) {
      const props = textos[m.id];
      if (!props) continue;
      const texto = textoDasProps(props);
      if (texto) perguntas[`t_${m.id}`] = { type: "noul", instructions: `A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". O texto que vai à tela é: "${texto.slice(0, 160)}". Esse texto é curto, claro, nas palavras do falante, e não inventa dado, nome ou número que a fala não diz?` };
      if (typeof props.cena === "string") perguntas[`c_${m.id}`] = { type: "noul", instructions: `Nicho do projeto: ${e.nicho ?? "não informado"}.${e.leitura?.cenario ? ` Cenário da gravação: ${e.leitura.cenario.slice(0, 160)}.` : ""}${m.emCena ? ` ${m.emCena.slice(0, 300)}` : ""} A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". A ${m.midia === "video" ? "cena em vídeo" : "imagem"} pedida é: "${String(props.cena).slice(0, 300)}". Ela mostra algo concreto que faz sentido com esta fala, com este nicho${m.emCena ? " e com o que está em cena na gravação" : ""} (não é uma imagem genérica de banco)?` };
    }
    if (Object.keys(perguntas).length) {
      try {
        const r = await perguntarAoJev({ projectId: e.projectId, etapa: "editor-por-comando-conferencia", state: { comando: e.comando.texto, nicho: e.nicho ?? "" } }, perguntas);
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
  tempos.conferencia = +((Date.now() - t) / 1000).toFixed(1);
  const semTexto = lista.filter((m) => !textos[m.id] && !reprovados.has(m.id)).length;
  return { textos, erros, semTexto, tempos };
}

/** Os momentos com texto viram peças e inserções no formato do diretor (o prompt final de cada imagem e vídeo). */
function materializar(lista: MomentoDecidido[], textos: Record<string, Record<string, unknown>>, ling: LinguagemDoVideo): { momentos: MomentoDoEditor[]; insercoes: Array<Record<string, unknown>>; elementos: ElementoDoPlano[] } {
  const momentos: MomentoDoEditor[] = [];
  const insercoes: Array<Record<string, unknown>> = [];
  const elementos: ElementoDoPlano[] = [];
  for (const m of lista) {
    const props0 = textos[m.id];
    if (!props0) continue;
    const props = { ...props0 };
    const cena = typeof props.cena === "string" ? props.cena : "";
    const oQueAparece = typeof props.oQueAparece === "string" ? props.oQueAparece : undefined;
    if (m.peca === "imagem-janela") {
      if (!cena) continue;
      const idImg = `${m.id}-img`;
      insercoes.push({ id: idImg, de: m.de, ate: m.ate, briefing: promptDaMidia(cena, ling, "imagem"), midia: "imagem", janela: true, estilizada: true, oQueAparece });
      delete props.cena;
      momentos.push({ id: m.id, peca: m.peca, de: m.de, ate: m.ate, props: { ...props, midia: idImg, legenda: props.legenda ?? "" } });
    } else if (!m.peca) {
      if (!cena) continue;
      const segundos = Math.min(5, Math.max(3, Math.ceil(m.fim - m.inicio)));
      insercoes.push({ id: m.id, de: m.de, ate: m.ate, briefing: promptDaMidia(cena, ling, m.midia === "video" ? "video" : "imagem"), midia: m.midia ?? "imagem", estilizada: true, ...(m.midia === "video" ? { segundos } : {}), oQueAparece });
    } else {
      if (m.peca === "icone") props.posicao = m.onde === "acima-da-cabeca" ? "topo" : m.onde === "ao-lado" ? "direita" : "topo-esquerda";
      momentos.push({ id: m.id, peca: m.peca, de: m.de, ate: m.ate, props });
    }
    elementos.push({ id: m.id, tipo: m.tipo, variante: m.variante, inicio: +m.inicio.toFixed(2), fim: +m.fim.toFixed(2), peca: m.peca, midia: m.midia, fala: m.fala.slice(0, 200) });
  }
  return { momentos, insercoes, elementos };
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
    escreverBlocoDeEstilo(e, familia).then((x) => ((tempos.estilo = +((Date.now() - t) / 1000).toFixed(1)), x)),
  ]);
  const ling: LinguagemDoVideo = { familia, cenario: L.cenario, nome: fam.nome, blocoDeEstilo: est.bloco, origemDoBloco: est.origem, fonte: e.comando.fonte, cores: coresNoPrompt(e.paleta, e.cores), nicho: e.nicho ?? null };
  const lista = d.momentos;
  const red = await redigirEConferir(e, ling, lista, { cenario: L.cenario === "trocado" });
  tempos.redator = red.tempos.redator;
  tempos.conferencia = red.tempos.conferencia;
  const erros = [...(est.erro ? [`bloco de estilo: ${est.erro} (usada a reserva)`] : []), ...red.erros];
  const mat = materializar(lista, red.textos, ling);
  const cenario = L.cenario === "trocado" ? insercaoDoCenario(red.textos, ling, e.frases) : null;
  const bruto = {
    leitura: `Plano em dois eixos: ${d.momentos.length} elementos decididos pelo JEV (${d.perguntas} perguntas) na linguagem "${fam.nome}", ritmo ${d.linguagem.densidade}, vídeo ${d.linguagem.video}, cobertura ${d.cobertura}, cenário ${L.cenario}.`,
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
    if ((x as { cenario?: boolean }).cenario || x.janela) continue;
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
  const ling = plano.linguagem;
  if (!ling || !jevLigado() || !e.frases.length) return { plano, avisos: [], tempos: {} };
  const t0 = Date.now();
  const avisos: string[] = [];
  const palavras = e.palavras ?? [];
  const L: DecisaoDaLinguagem = { familia: ling.familia, densidade: "medio", video: "algum", confianca: null, cenario: ling.cenario ?? "gravacao" };
  const curto = e.duracao <= 95 || e.formato === "9:16";
  const teto = e.tetoUsdPorMinuto ?? tetoUsdPorMinuto();
  const R = regrasDoRitmo({ formato: e.formato, duracao: e.duracao, densidade: L.densidade, video: L.video, tetoUsdPorMinuto: teto, videosPorMinutoMax: videosPorMinutoMax(curto) });
  const U = momentosDaFala(e.frases, palavras);
  const existentes = temposDoPlano(plano, e.frases, palavras);
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
  const perguntas = { n: 0 };
  const enfases = [...(plano.enfases ?? [])];
  const memoria = new Map<number, Candidato>();
  const cobertura = await cobrirBuracos(e, L, R, U, st, memoria, { usd: Math.max(0, teto * minutos * 1.15 - gastoDoPlano), videos: Math.max(0, Math.floor(R.videosPorMinuto * minutos * 0.3)), duracao: e.duracao, inicio: 0 }, perguntas, enfases, avisos);
  const novos = st.momentos.filter((m) => m.origem === "cobertura");
  const jaTemInscrever = (plano.elementos ?? []).some((x) => x.tipo === "inscrever");
  const chamadas = jaTemInscrever ? [] : await decidirInscrever(e, L, U, st.momentos, enfases, avisos);
  const lista = [...novos, ...chamadas];
  const tempos: Record<string, number> = { cobertura: +((Date.now() - t0) / 1000).toFixed(1) };
  if (!lista.length) return { plano, avisos: [...avisos, `cobertura: nenhum elemento novo (${antes} existentes, ${perguntas.n} perguntas)`], tempos };
  const red = await redigirEConferir(e, ling, lista);
  tempos.redator = red.tempos.redator;
  tempos.conferencia = red.tempos.conferencia;
  const mat = materializar(lista, red.textos, ling);
  const bruto = { ...plano, momentos: [...(plano.momentos ?? []), ...mat.momentos], insercoes: [...(plano.insercoes ?? []), ...mat.insercoes], enfases };
  const v = validarPlano(bruto, FAMILIA[ling.familia].base, { livre: true });
  const validos = new Set([...v.plano.momentos.map((m) => String(m.id)), ...(v.plano.insercoes ?? []).map((x) => String(x.id))]);
  const novo: PlanoDoDiretor = {
    ...v.plano,
    linguagem: ling,
    elementos: [...(plano.elementos ?? []), ...mat.elementos].filter((x) => validos.has(x.id)).sort((a, b) => a.inicio - b.inicio),
    estimativa: estimarCusto(v.plano, e.duracao, R.tetoUsdPorMinuto),
    leitura: `${plano.leitura ?? ""} Cobertura (05/10): ${cobertura} elemento(s) novo(s) nos buracos e ${chamadas.length} chamada(s) de inscrever, pelo JEV.`.trim(),
  };
  return { plano: novo, avisos: [...avisos, ...red.erros, ...v.avisos, `cobertura: ${mat.momentos.length + mat.insercoes.length} elemento(s) novo(s) sobre ${antes} existentes (${perguntas.n} perguntas ao JEV)`].slice(0, 40), tempos };
}

