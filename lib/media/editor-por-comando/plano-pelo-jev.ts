import { askClaude } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import { FICHAS } from "@/lib/media/editor-sob-medida/pecas";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { validarPlano, type ElementoDoPlano, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import {
  CRITERIO_DO_TIPO,
  DURACAO_DO_TIPO,
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
  componenteDa,
  coresNoPrompt,
  familiaPorPalavras,
  promptDaMidia,
  type FamiliaVisual,
  type LinguagemDoVideo,
  type VarianteDoElemento,
} from "@/lib/media/editor-por-comando/linguagem";
import type { PedidoDaCena } from "@/lib/media/roteiro-em-texto";

/**
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
};

export type DecisaoDaLinguagem = { familia: FamiliaVisual; densidade: Densidade; video: QuantoDeMidia; confianca: number | null };

// ─────────────────────────────── eixo 2: a linguagem ───────────────────────────────

const contextoDoProjeto = (e: EntradaDoPlanoPeloJev) =>
  [`Comando do cliente: "${e.comando.texto}"`, e.nicho ? `Nicho e público do projeto: ${e.nicho}` : "", e.marca ? `Marca: ${e.marca}` : "", e.perfil ? e.perfil.slice(0, 600) : ""].filter(Boolean).join("\n");

/** O JEV escolhe a família da linguagem, a densidade e o quanto de vídeo, pelo comando, pela marca e pelo nicho. */
export async function decidirLinguagem(e: EntradaDoPlanoPeloJev): Promise<DecisaoDaLinguagem> {
  const recuo: DecisaoDaLinguagem = { familia: familiaPorPalavras(e.comando.texto), densidade: "medio", video: "algum", confianca: null };
  if (!jevLigado()) return recuo;
  try {
    const r = await perguntarAoJev(
      { projectId: e.projectId, etapa: "editor-por-comando-linguagem", state: contextoDoProjeto(e) },
      {
        familia: {
          type: "choice",
          instructions: "Qual linguagem visual o comando do cliente pede para desenhar TODOS os elementos do vídeo (textos, ícones, imagens, vídeos)? Leve em conta o nicho e a marca quando o comando não diz.",
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
      }
    );
    const fam = r.familia?.type === "choice" ? r.familia : null;
    const familia = decidirChoice(r.familia, FAMILIAS.map((f) => f.id), recuo.familia, 0.3);
    const semVideo = (probabilidadeDeSim(r.semVideo) ?? 0) >= 0.7;
    return {
      familia,
      densidade: decidirChoice(r.densidade, ["calmo", "medio", "rapido"] as const, "medio", 0.3),
      video: semVideo ? "nenhum" : decidirChoice(r.video, ["muito", "algum", "pouco"] as const, "algum", 0.3),
      confianca: fam ? +(fam.confidence ?? 0).toFixed(2) : null,
    };
  } catch {
    return recuo;
  }
}

const SISTEMA_DO_ESTILO = `Você escreve o BLOCO DE ESTILO de um vídeo: um parágrafo em INGLÊS, de 35 a 60 palavras, que vai no fim de TODO prompt de imagem e de vídeo gerado para este vídeo, para que todas as imagens e cenas tenham a mesma linguagem visual.

O bloco descreve SÓ o acabamento (técnica, material, luz, textura, enquadramento, paleta), nunca a cena. Ele traduz o comando do cliente com fidelidade, combina com o nicho e com a marca, e cita as cores da marca como acento nos detalhes. Sem nome de marca de terceiros, sem nome de artista vivo, sem pessoa real.

Responda só JSON: {"bloco":"..."}`;

/** O redator escreve o bloco de estilo (uma chamada curta); sem ele, a reserva com as palavras do comando. */
export async function escreverBlocoDeEstilo(e: EntradaDoPlanoPeloJev, familia: FamiliaVisual): Promise<{ bloco: string; origem: "redator" | "reserva"; erro?: string }> {
  const cores = coresNoPrompt(e.paleta, e.cores);
  const reserva = blocoDeEstiloDeReserva(familia, e.comando.texto, e.nicho, cores);
  try {
    const r = await askClaude(
      SISTEMA_DO_ESTILO,
      [contextoDoProjeto(e), `Família visual escolhida: ${FAMILIA[familia].nome} (sementes: ${FAMILIA[familia].semente}).`, cores].filter(Boolean).join("\n"),
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
  avisos: string[]
): Promise<MomentoDecidido[]> {
  const st: Estado = { momentos: [], segundosDeTela: 0, videos: 0, gasto: 0, porTipo: {} };
  const familia = L.familia;
  const depurar = process.env.EDITOR_DOIS_EIXOS_DEPURAR === "1";
  const pedidoNo = (u: MomentoDaFala) => (e.pedidos ?? []).find((p) => p.inicio < u.fim && p.fim > u.inicio)?.texto ?? null;
  for (let w = 0; w < indices.length; w += ONDA) {
    const onda = indices.slice(w, w + ONDA).filter((j) => U[j].fim - U[j].inicio >= 0.6);
    if (!onda.length) continue;
    const perto = st.momentos.slice(-4).map((m) => `${m.tipo} em ${m.inicio.toFixed(0)} s`);
    const recentes = perto.length ? `Já entraram perto, nesta ordem: ${perto.join("; ")}. Varie: o mesmo tipo em sequência cansa.` : "Ainda não entrou nenhum elemento neste trecho.";
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const j of onda) {
      const ant = U[j - 1]?.texto ? `Fala anterior: "${U[j - 1].texto.slice(0, 160)}". ` : "";
      const ctx = `${ant}MOMENTO AVALIADO (${U[j].inicio.toFixed(0)} s): "${U[j].texto.slice(0, 280)}".`;
      perguntas[`tipo_${j}`] = { type: "choice", instructions: `${ctx} ${recentes} Qual elemento visual serve melhor a ESTE momento, para este nicho e este comando?`, criteria: { ...CRITERIO_DO_TIPO } };
      perguntas[`forma_${j}`] = { type: "choice", instructions: `${ctx} Se este momento ganhasse uma IMAGEM, ela fica numa janela ao lado da pessoa ou ocupa a tela cheia?`, criteria: { janela: "janela ao lado da pessoa: a pessoa segue falando, a imagem ilustra", "tela-cheia": "tela cheia: a imagem é o assunto e merece a tela toda por alguns segundos" } };
      perguntas[`onde_${j}`] = { type: "choice", instructions: `${ctx} Se este momento ganhasse um ÍCONE animado, onde ele fica?`, criteria: { canto: "no canto de cima, discreto", "acima-da-cabeca": "acima da cabeça da pessoa, como um pensamento", "ao-lado": "ao lado da pessoa, grande, com o rótulo" } };
      perguntas[`enfase_${j}`] = { type: "noul", instructions: `${ctx} Há neste momento UMA palavra forte (o número, o nome, a palavra da tese, a virada) que mereça um soco de câmera?` };
      perguntas[`movimento_${j}`] = { type: "noul", instructions: `${ctx} Se este momento ganhasse uma imagem, ela ficaria MELHOR EM MOVIMENTO (uma ação acontecendo, um lugar com vida, uma metáfora que se mexe) do que parada?` };
    }
    let r: Record<string, RespostaDoJev> = {};
    try {
      r = await perguntarAoJev(
        {
          projectId: e.projectId,
          etapa: "editor-por-comando-plano",
          state: `${contextoDoProjeto(e)}\nLinguagem visual: ${FAMILIA[familia].nome}. Formato: ${e.formato}. Ritmo pedido: ${L.densidade}.\nRegra: decida pelo que o momento DIZ; imagem e vídeo só quando há algo concreto para ver; nada é escolha válida.`,
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
    type Candidato = { j: number; u: MomentoDaFala; pedido: string | null; forcado: boolean; candidatos: Array<{ t: Exclude<TipoDeElemento, "nada">; p: number }>; forma: "janela" | "tela-cheia"; onde: "canto" | "acima-da-cabeca" | "ao-lado"; movimento: number };
    const daOnda: Candidato[] = [];
    for (const j of onda) {
      const u = U[j];
      if ((probabilidadeDeSim(r[`enfase_${j}`]) ?? 0) >= 0.6) enfases.push(u.de);
      const pedido = pedidoNo(u);
      if (pedido && /sem efeito|sem peça|sem nada|deixa limpo|s[oó] eu/i.test(pedido)) continue;
      const forcado = Boolean(pedido);
      const probs = pTipo(r[`tipo_${j}`]);
      const pNada = probs.nada ?? 0;
      let candidatos = TIPOS_DE_ELEMENTO.filter((t) => t !== "nada")
        .map((t) => ({ t: t as Exclude<TipoDeElemento, "nada">, p: probs[t] ?? 0 }))
        .sort((a, b) => b.p - a.p);
      const doPedido = pedido ? tipoDoPedido(pedido) : null;
      if (doPedido && doPedido !== "nada") candidatos = [{ t: doPedido, p: 1 }, ...candidatos.filter((c) => c.t !== doPedido)];
      const melhor = candidatos[0];
      if (!melhor) continue;
      if (depurar) console.log(`[dois-eixos] U${j} ${u.inicio.toFixed(1)}s nada=${pNada.toFixed(2)} ${candidatos.slice(0, 3).map((c) => `${c.t}=${c.p.toFixed(2)}`).join(" ")} "${u.texto.slice(0, 50)}"`);
      // O momento entra na disputa quando o tipo dele é claro: acima do limiar do ritmo, ou bem acima do "nada".
      if (!forcado && !((melhor.p >= R.limiar && melhor.p >= pNada * 0.6) || (melhor.p >= 0.2 && melhor.p >= pNada * 1.5))) continue;
      daOnda.push({ j, u, pedido, forcado, candidatos, forma: decidirChoice(r[`forma_${j}`], FORMAS, "janela", 0.3), onde: decidirChoice(r[`onde_${j}`], ONDES, "canto", 0.3), movimento: probabilidadeDeSim(r[`movimento_${j}`]) ?? 0 });
    }
    daOnda.sort((a, b) => Number(b.forcado) - Number(a.forcado) || b.candidatos[0].p - a.candidatos[0].p);
    for (const { j, u, pedido, forcado, candidatos: candidatos0, forma, onde, movimento } of daOnda) {
      // A IMAGEM QUE PEDE MOVIMENTO (o JEV respondeu) vira B-roll em vídeo enquanto houver teto: o vídeo vem antes, com a força da imagem.
      const candidatos = candidatos0.flatMap((c) => (c.t === "imagem" && movimento >= 0.6 && st.videos < orcamento.videos ? [{ t: "video" as const, p: c.p }, c] : [c])).filter((c, i, l) => l.findIndex((x) => x.t === c.t) === i);
      const melhor = candidatos[0];
      // A densidade (regra explícita): a cota até aqui; o forçado pelo cliente passa.
      const cotaAteAqui = (R.porMinuto * Math.max(u.fim - orcamento.inicio, 20)) / 60 + 1;
      if (!forcado && st.momentos.length >= cotaAteAqui) continue;
      const antes = [...st.momentos].reverse().find((m) => m.inicio < u.inicio);
      const depois = st.momentos.find((m) => m.inicio > u.inicio);
      if (!forcado && antes && u.inicio - antes.fim < R.espaco) continue;
      let escolhido: MomentoDecidido | null = null;
      for (const c of candidatos) {
        if (!forcado && c !== melhor && (c.p < R.limiar * 0.7 || c.p < melhor.p * 0.45)) break;
        const total = st.momentos.length;
        if (!forcado && total >= 5 && ((st.porTipo[c.t] ?? 0) + 1) / (total + 1) > 0.3) continue;
        const tentativa = montarMomento(e, R, familia, U, j, c.t, forma, onde, pedido, st, orcamento);
        if (!tentativa) continue;
        // O mesmo tipo nunca encosta no vizinho (dos dois lados), nem pela troca de vídeo por imagem.
        if (!forcado && (tentativa.tipo === antes?.tipo || tentativa.tipo === depois?.tipo)) continue;
        if (!forcado && depois && depois.inicio - tentativa.fim < R.espaco) continue;
        escolhido = tentativa;
        break;
      }
      if (!escolhido) continue;
      st.momentos.push(escolhido);
      st.momentos.sort((a, b) => a.inicio - b.inicio);
      st.porTipo[escolhido.tipo] = (st.porTipo[escolhido.tipo] ?? 0) + 1;
      st.gasto += escolhido.custo;
      if (escolhido.midia === "video") st.videos++;
      if (escolhido.tela) st.segundosDeTela += escolhido.fim - escolhido.inicio;
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
  const dMax = tela ? Math.min(dMax0, R.telaMaxSeg) : dMax0;
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
  const pecaDePapel = familia === "papel" && Boolean(peca && ["colagem", "jornal", "cronologia", "mapa-antigo", "censura"].includes(peca));
  const segundos = Math.min(5, Math.max(3, Math.ceil(fim - inicio)));
  const custo = custoPrevisto(tipo, variante, segundos, pecaDePapel);
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
  };
}

/**
 * AS DECISÕES DO JEV nos dois eixos. Sem JEV (sem chave), nenhum elemento é
 * decidido: o vídeo sai com a pessoa, a legenda e a câmera de ritmo.
 */
export async function decidirPeloJev(e: EntradaDoPlanoPeloJev, ja?: DecisaoDaLinguagem): Promise<{ momentos: MomentoDecidido[]; enfases: string[]; avisos: string[]; perguntas: number; linguagem: DecisaoDaLinguagem; regras: RegrasDoRitmo }> {
  const avisos: string[] = [];
  const L = ja ?? (await decidirLinguagem(e));
  const curto = e.duracao <= 95 || e.formato === "9:16";
  const teto = e.tetoUsdPorMinuto ?? tetoUsdPorMinuto();
  const R = regrasDoRitmo({ formato: e.formato, duracao: e.duracao, densidade: L.densidade, video: L.video, tetoUsdPorMinuto: teto, videosPorMinutoMax: videosPorMinutoMax(curto) });
  if (!jevLigado()) return { momentos: [], enfases: [], avisos: ["JEV desligado: o vídeo sai sem elementos"], perguntas: 0, linguagem: L, regras: R };
  if (!e.frases.length) return { momentos: [], enfases: [], avisos: [], perguntas: 0, linguagem: L, regras: R };
  const U = momentosDaFala(e.frases, e.palavras);
  // Os blocos de ~5 min em paralelo, cada um com a parte proporcional do dinheiro e do teto de vídeo.
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, b) => U.map((u, j) => ({ u, j })).filter(({ u }) => u.inicio >= (b * e.duracao) / n && (b === n - 1 || u.inicio < ((b + 1) * e.duracao) / n)).map(({ j }) => j));
  const perguntas = { n: 0 };
  const enfases: string[] = [];
  const minutos = Math.max(e.duracao / 60, 1 / 6);
  const partes = await Promise.all(
    blocos.map((indices) => {
      if (!indices.length) return Promise.resolve([] as MomentoDecidido[]);
      const ini = U[indices[0]].inicio;
      const dur = U[indices[indices.length - 1]].fim - ini;
      const frac = dur / Math.max(1, e.duracao);
      return decidirBloco(e, L, R, U, indices, { usd: teto * minutos * frac, videos: Math.floor(R.videosPorMinuto * minutos * frac + 0.5), duracao: Math.max(dur, 1), inicio: ini }, perguntas, enfases, avisos);
    })
  );
  const momentos = partes.flat().sort((a, b) => a.inicio - b.inicio);
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
  return { momentos: limpos, enfases, avisos, perguntas: perguntas.n, linguagem: L, regras: R };
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
- Fotos de arquivo das peças de papel ("descricao"): em INGLÊS, concreta (objeto, lugar, prédio, estátua genérica, figura anônima de época).
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
async function redigirBloco(e: EntradaDoPlanoPeloJev, ling: LinguagemDoVideo, lista: MomentoParaRedator[], falaDoBloco: string): Promise<Record<string, Record<string, unknown>>> {
  if (!lista.length) return {};
  const pedido = [
    contextoDoProjeto(e),
    e.titulo ? `TÍTULO: ${e.titulo}` : "",
    `LINGUAGEM VISUAL: ${ling.nome}. Bloco de estilo (acrescentado depois a toda cena): ${ling.blocoDeEstilo}`,
    `# A FALA DESTE BLOCO\n${falaDoBloco}`,
    `# OS MOMENTOS (escreva só as props de cada um)\n${lista
      .map((m) => `- id ${m.id}, elemento "${m.tipo}"${m.peca ? `, peça "${m.peca}"` : `, ${m.midia === "video" ? "vídeo" : "imagem em tela cheia"}`} (${m.inicio.toFixed(0)} s a ${m.fim.toFixed(0)} s), sobre a fala: "${m.fala.slice(0, 300)}"${m.pedido ? `\n  PEDIDO DO CLIENTE: "${m.pedido}"` : ""}\n  props: ${propsParaORedator(m)}`)
      .join("\n")}`,
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
  for (const k of ["texto", "titulo", "manchete", "frase", "palavra", "rotulo", "legenda", "lugar"]) {
    const v = props[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\*\*/g, "").trim();
  }
  return "";
}


/**
 * O PLANO INTEIRO EM DOIS EIXOS: a linguagem e os elementos (JEV), o bloco
 * de estilo e os textos (redator, em paralelo), a conferência (JEV) e a
 * estimativa de custo. Devolve o plano no formato do diretor (validado por
 * `validarPlano` no modo livre) e a base antiga da família, para a montagem.
 */
export async function escreverPlanoPeloJev(e: EntradaDoPlanoPeloJev): Promise<{ plano: PlanoDoDiretor; base: string; avisos: string[]; tempos: Record<string, number>; erro?: string }> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  // A linguagem primeiro (um pedido ao JEV); depois, em paralelo, os elementos (JEV, em ondas) e o bloco de estilo (redator).
  const L = await decidirLinguagem(e);
  const familia = L.familia;
  const fam = FAMILIA[familia];
  const [d, est] = await Promise.all([
    decidirPeloJev(e, L).then((x) => ((tempos.jev = +((Date.now() - t) / 1000).toFixed(1)), x)),
    escreverBlocoDeEstilo(e, familia).then((x) => ((tempos.estilo = +((Date.now() - t) / 1000).toFixed(1)), x)),
  ]);
  const ling: LinguagemDoVideo = { familia, nome: fam.nome, blocoDeEstilo: est.bloco, origemDoBloco: est.origem, fonte: e.comando.fonte, cores: coresNoPrompt(e.paleta, e.cores), nicho: e.nicho ?? null };
  t = Date.now();
  const lista: MomentoParaRedator[] = d.momentos;
  const n = Math.max(1, Math.round(e.duracao / BLOCO_SEG));
  const blocos = Array.from({ length: n }, (_, k) => ({ de: (k * e.duracao) / n, ate: ((k + 1) * e.duracao) / n }));
  const textos: Record<string, Record<string, unknown>> = {};
  const erros: string[] = est.erro ? [`bloco de estilo: ${est.erro} (usada a reserva)`] : [];
  await Promise.all(
    blocos.map(async (b) => {
      const doBloco = lista.filter((m) => m.inicio >= b.de && m.inicio < b.ate);
      if (!doBloco.length) return;
      const fala = e.frases.filter((f) => f.fim > b.de && f.inicio < b.ate).map((f) => `[${f.inicio.toFixed(0)}s] ${f.texto}`).join("\n");
      try {
        Object.assign(textos, await redigirBloco(e, ling, doBloco, fala));
      } catch (err) {
        erros.push(`redator: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    })
  );
  tempos.redator = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();

  // A CONFERÊNCIA PELO JEV: o texto longo, confuso ou inventado sai; a cena genérica ou fora do nicho também.
  const reprovados = new Set<string>();
  const motivos: string[] = [];
  if (jevLigado()) {
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const m of lista) {
      const props = textos[m.id];
      if (!props) continue;
      const texto = textoDasProps(props);
      if (texto) perguntas[`t_${m.id}`] = { type: "noul", instructions: `A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". O texto que vai à tela é: "${texto.slice(0, 160)}". Esse texto é curto, claro, nas palavras do falante, e não inventa dado, nome ou número que a fala não diz?` };
      if (typeof props.cena === "string") perguntas[`c_${m.id}`] = { type: "noul", instructions: `Nicho do projeto: ${e.nicho ?? "não informado"}. A fala do trecho é: "${(m.falaEmVolta ?? m.fala).slice(0, 420)}". A ${m.midia === "video" ? "cena em vídeo" : "imagem"} pedida é: "${String(props.cena).slice(0, 300)}". Ela mostra algo concreto que faz sentido com esta fala e com este nicho (não é uma imagem genérica de banco)?` };
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
  tempos.conferencia = +((Date.now() - t) / 1000).toFixed(1);

  // O plano no formato do diretor: as peças viram momentos; imagem e vídeo viram inserções com o prompt final.
  const momentos: MomentoDoEditor[] = [];
  const insercoes: Array<Record<string, unknown>> = [];
  const elementos: ElementoDoPlano[] = [];
  let semTexto = 0;
  for (const m of lista) {
    const props0 = textos[m.id];
    if (!props0) {
      semTexto++;
      continue;
    }
    if (reprovados.has(m.id)) continue;
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
  const bruto = {
    leitura: `Plano em dois eixos: ${d.momentos.length} elementos decididos pelo JEV (${d.perguntas} perguntas) na linguagem "${fam.nome}", ritmo ${d.linguagem.densidade}, vídeo ${d.linguagem.video}.`,
    tema: { visual: fam.visual, acabamento: fam.acabamento, fundoColagem: familia === "papel", linguagem: familia },
    momentos,
    insercoes,
    enfases: d.enfases,
  };
  const v = validarPlano(bruto, fam.base, { livre: true });
  const validos = new Set([...v.plano.momentos.map((m) => String(m.id)), ...(v.plano.insercoes ?? []).map((x) => String(x.id))]);
  const plano: PlanoDoDiretor = {
    ...v.plano,
    linguagem: ling,
    elementos: elementos.filter((x) => validos.has(x.id)),
    estimativa: estimarCusto(v.plano, e.duracao, d.regras.tetoUsdPorMinuto),
  };
  if (semTexto) v.avisos.push(`${semTexto} elemento(s) sem texto do redator saíram`);
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
