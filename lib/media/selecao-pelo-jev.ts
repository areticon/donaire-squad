import { askClaude } from "@/lib/claude";
import { jevLigado, notaDoScore, perguntarAoJev, probabilidadeDeSim, usoVazio, type PerguntaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
import { fechaCorte } from "@/lib/media/texto-final-do-corte";
import type { Word } from "@/lib/media/transcribe";
import { defeitoDaAbertura, type MetaDaSelecao } from "@/lib/media/select-clips";

/**
 * A SELEÇÃO DE CORTES PELO JEV (03/10/2026).
 *
 * Decisão do Bruno: decisão sobre texto vai para o JEV (TypeSafe System One),
 * escrita continua no Claude. A seleção antiga (`pedirTrechos`) pedia ao
 * Sonnet a decisão E a escrita numa chamada só: 8 mil tokens de entrada e
 * quase 10 mil de saída (quase tudo pensamento), US$ 0,12 por vídeo e uns
 * 100 s. Aqui a conta se divide:
 *
 * 1. CÓDIGO parte a fala em frases (pela pontuação da transcrição).
 * 2. JEV, por frase, em lote: serve de gancho (nota)? se entende sozinha?
 *    conclui um raciocínio? é abertura ou despedida do vídeo inteiro?
 * 3. CÓDIGO monta as janelas candidatas: começam numa frase que abre bem
 *    (gancho do JEV e a guarda `defeitoDaAbertura`), terminam numa frase que
 *    conclui (JEV) e fecha corte (`fechaCorte`), entre 20 e 90 s (até 120 s).
 * 4. JEV, por janela, com a janela entre [[ ]] e um pouco de fala antes e
 *    depois: as notas de tese, prova, autonomia, emoção e fecho, e se é um
 *    assunto só. A nota final é a MENOR das seis, como no caminho antigo.
 * 5. CÓDIGO escolhe as mais fortes sem sobreposição.
 * 6. CLAUDE barato (Haiku) só escreve título, ideia e motivo das escolhidas.
 *    Falhou, o código escreve um texto simples: a decisão não depende dele.
 *
 * Quem chama (`selecionarTrechos`) ainda passa as escolhidas pela conferência
 * do fecho e cai no caminho antigo quando isto devolve `null` (JEV fora do ar,
 * ou confiança baixa: menos janelas aproveitáveis que o mínimo pedido).
 *
 * ## O que a medição mandou (03/10, vídeo de 19 min do Empreendedorismo Cristão)
 *
 * Mesma transcrição, cortes julgados um a um (abre bem sozinho? ideia
 * inteira? fecha?), 3 pontos por corte, 4 cortes:
 *
 *   antigo (Sonnet)   ~US$ 0,15   ~107 s   10,5 de 12
 *   JEV (3 rodadas)   ~US$ 0,04    ~18 s   8,5 / 6 / 9 de 12
 *
 * O JEV acha os MESMOS momentos fortes quase sempre, mas perde na abertura:
 * ele só começa corte em começo de frase, e o Bruno conta história em frase
 * corrida (o "Michelangelo ele está" do caminho antigo fica no meio de uma
 * frase de 60 palavras, então aqui o corte abre 20 s antes, no rodeio); e ele
 * oscila de rodada para rodada (nota da janela muda com a mesma entrada).
 * Até 05/10 o padrão continuava no Claude por isso. Desde 05/10 este caminho
 * é o PADRÃO, por regra do Bruno ("escolhas e decisões: nada de LLM, vai
 * para o JEV"): a seleção é escolha, o Claude só escreve os rótulos. A
 * abertura pior fica como ponto a medir e melhorar no código das janelas
 * (abrir no meio de frase longa), não voltando ao Claude.
 *
 * Interruptores: SELECAO_PELO_JEV=0 desliga este caminho (e sem o JEV no ar
 * fica o Claude antigo); SELECAO_MODELO_DO_TEXTO troca o modelo que escreve
 * (padrão Haiku); SELECAO_MODELO_DO_DESEMPATE, o da dúvida sobre raciocínio
 * repetido (padrão Sonnet com esforço baixo).
 */

export function selecaoPeloJevLigada(): boolean {
  return jevLigado() && process.env.SELECAO_PELO_JEV !== "0";
}

export type Frase = {
  id: string;
  n: number;
  /** Índices da primeira e da última palavra. */
  de: number;
  ate: number;
  inicio: number;
  fim: number;
  texto: string;
  /** Começa depois de um fim de frase de verdade (e não de uma quebra forçada). */
  comecoLimpo: boolean;
  /** A última palavra pode fechar um corte (`fechaCorte`). */
  fechaCorte: boolean;
};

export type LeituraDaFrase = { gancho: number | null; sozinha: number | null; conclui: number | null; borda: number | null };

export type JanelaDoJev = {
  id: string;
  frases: [number, number];
  inicio: number;
  fim: number;
  texto: string;
  notas: { gancho: number; tese: number; prova: number; autonomia: number; emocao: number; fecho: number };
  nota: number;
  media: number;
  umAssunto: number | null;
};

export type ResultadoDaSelecaoPeloJev = {
  trechos: Array<{
    inicio: number;
    fim: number;
    titulo: string;
    motivo: string;
    ideia: string;
    abertura: string;
    notas: JanelaDoJev["notas"];
    nota: number;
    alinhado: true;
  }>;
  diagnostico?: string;
  janelas: JanelaDoJev[];
  /** A leitura de cada frase, para a prova e o diagnóstico. */
  leituras: Array<LeituraDaFrase & { id: string; inicio: number; texto: string }>;
  uso: UsoDoJev;
  claudeChamadas: number;
  ms: number;
};

/** Fala corrida sem pontuação vira frase de no máximo isto (quebra forçada). */
const MAX_PALAVRAS_POR_FRASE = 60;
const FRASES_POR_ESTADO = 20;
const JANELAS_POR_ESTADO = 10;
const MIN_SEG = 20;
const IDEAL_MIN_SEG = 30;
const IDEAL_MAX_SEG = 60;
const PREFERIDO_MAX_SEG = 90;
const MAX_SEG = 120;
/** Quantas aberturas viram janela (as de gancho mais forte). */
const MAX_ABERTURAS = 60;
/** Quantos fins por abertura. */
const FINS_POR_ABERTURA = 3;
/** Abaixo disto o corte nem é candidato (o mesmo piso do caminho antigo). */
const NOTA_PISO = 4;

const fechaFrase = (w: string) => /[.!?…]["')\]]?$/.test(w);

export function frasesDe(palavras: Word[]): Frase[] {
  const frases: Frase[] = [];
  let de = 0;
  let limpo = true;
  for (let i = 0; i < palavras.length; i++) {
    const fim = fechaFrase(palavras[i].word);
    if (fim || i === palavras.length - 1 || i - de + 1 >= MAX_PALAVRAS_POR_FRASE) {
      frases.push({
        id: `f${frases.length}`,
        n: frases.length,
        de,
        ate: i,
        inicio: palavras[de].start,
        fim: palavras[i].end,
        texto: palavras.slice(de, i + 1).map((w) => w.word).join(" "),
        comecoLimpo: limpo,
        fechaCorte: fechaCorte(palavras[i].word),
      });
      limpo = fim;
      de = i + 1;
    }
  }
  return frases;
}

const texto = (p: Word[], de: number, ate: number) => p.slice(Math.max(0, de), Math.max(0, ate + 1)).map((w) => w.word).join(" ");

/** Roda as tarefas com no máximo `n` ao mesmo tempo (o JEV pede backoff acima disso). */
async function emPoucos(tarefas: Array<() => Promise<void>>, n = 3): Promise<void> {
  let proxima = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tarefas.length) }, async () => {
      while (proxima < tarefas.length) await tarefas[proxima++]();
    })
  );
}

/** Score de três níveis (0 a 2) vira nota de 0 a 10. */
const notaDe = (s: number | null) => (s === null ? 0 : Math.round(Math.max(0, Math.min(2, s)) * 5));

const NIVEIS = {
  gancho: [
    "fraca: saudação, transição, continuação do que veio antes, ou pensamento solto",
    "mediana: o assunto fica claro, mas não prende em um segundo",
    "forte: afirmação discutível, aviso de erro, pergunta direta, número, cena concreta ou chamada de quem assiste",
  ],
  tese: [
    "nenhuma: só conta, descreve ou enrola; não há afirmação com que se possa concordar ou discordar",
    "morna: há uma ideia, mas genérica, que qualquer um do setor diria",
    "clara: uma afirmação própria e discutível, dita com todas as letras",
  ],
  prova: [
    "nenhuma: opinião no ar",
    "alguma: um exemplo vago ou genérico",
    "concreta: número, caso vivido, cena ou exemplo específico",
  ],
  autonomia: [
    "depende: precisa do que foi dito antes (continua uma história, usa 'isso', 'ele', 'como eu disse')",
    "quase: entende-se, mas falta um pedaço do contexto",
    "sozinho: quem chega agora entende tudo, do começo ao fim",
  ],
  emocao: [
    "morno: correto e neutro, não provoca nada",
    "algum: um momento de reconhecimento ou curiosidade",
    "forte: surpresa, indignação, riso, alívio ou identificação clara",
  ],
  entrada: [
    "rodeia: começa com ressalva, preparação, frase solta ou o fim de outro assunto antes de chegar ao ponto",
    "demora: chega ao ponto, mas depois de alguns segundos de volta",
    "direta: a primeira frase já está no ponto do corte",
  ],
  fecho: [
    "no ar: termina no meio do raciocínio, anunciando o que vem, ou o ponto só chega depois",
    "fraco: termina numa frase completa, mas o ponto não aterrissa com força",
    "aterrissa: termina na conclusão, lição ou virada do raciocínio",
  ],
};

/**
 * Lê cada frase com o JEV. Devolve a leitura por id; frase sem resposta fica
 * com nulls (quem usa trata como "não sei").
 */
export async function lerFrases(frases: Frase[], palavras: Word[], nicho: string | null, ctx: { projectId?: string | null; uso: UsoDoJev }): Promise<Map<string, LeituraDaFrase>> {
  const leitura = new Map<string, LeituraDaFrase>();
  const tarefas: Array<() => Promise<void>> = [];
  for (let k = 0; k < frases.length; k += FRASES_POR_ESTADO) {
    const lote = frases.slice(k, k + FRASES_POR_ESTADO);
    tarefas.push(async () => {
      const state = {
        contexto: `Fala transcrita de um vídeo${nicho ? ` sobre ${nicho}` : ""}, gravado de uma vez, sem roteiro, em português. Em cada item de \`frases\`, a frase de interesse está entre [[ ]]; o resto é só contexto (o que veio antes e o que vem depois).`,
        frases: lote.map((f) => ({ id: f.id, texto: `${texto(palavras, f.de - 22, f.de - 1)} [[${f.texto}]] ${texto(palavras, f.ate + 1, f.ate + 22)}`.trim() })),
      };
      const perguntas: Record<string, PerguntaDoJev> = {};
      for (const f of lote) {
        perguntas[`g:${f.id}`] = {
          type: "score",
          instructions: `Se a frase entre [[ ]] do item "${f.id}" fosse a PRIMEIRA frase de um vídeo curto (Reels), ouvida sozinha, sem nada antes, ela faria a pessoa parar de rolar o feed?`,
          criteria: NIVEIS.gancho,
        };
        perguntas[`a:${f.id}`] = {
          type: "noul",
          instructions: `A frase entre [[ ]] do item "${f.id}" se entende sozinha, sem ter ouvido o que veio antes? Responda não se ela continua uma história em andamento, responde algo dito antes, ou depende de "isso", "ele", "aquele", "como eu disse".`,
        };
        perguntas[`f:${f.id}`] = {
          type: "noul",
          instructions: `A frase entre [[ ]] do item "${f.id}" CONCLUI um raciocínio (a lição, a conclusão, a virada, a resposta), de modo que um vídeo curto poderia terminar nela sem deixar o ponto no ar? Responda não se o que vem depois continua ou completa a mesma ideia, se ela anuncia o que vem ("vamos ver", "o próximo passo"), ou se só pede confirmação ("né?", "tá?").`,
        };
        perguntas[`x:${f.id}`] = {
          type: "noul",
          instructions: `A frase entre [[ ]] do item "${f.id}" é abertura ou encerramento do vídeo inteiro (saudação ao público, apresentação do tema do vídeo, despedida, "se inscreve", "Deus abençoe, até mais") ou fala com quem está gravando?`,
        };
      }
      const r = await perguntarAoJev({ projectId: ctx.projectId, etapa: "selecao-frases", state, uso: ctx.uso }, perguntas);
      for (const f of lote) {
        leitura.set(f.id, {
          gancho: notaDoScore(r[`g:${f.id}`]),
          sozinha: probabilidadeDeSim(r[`a:${f.id}`]),
          conclui: probabilidadeDeSim(r[`f:${f.id}`]),
          borda: probabilidadeDeSim(r[`x:${f.id}`]),
        });
      }
    });
  }
  await emPoucos(tarefas);
  return leitura;
}

/** Preferência por duração: 30 a 60 s vale mais; acima de 90 só se precisar. */
function pesoDaDuracao(seg: number): number {
  if (seg < IDEAL_MIN_SEG) return 0.85;
  if (seg <= IDEAL_MAX_SEG) return 1;
  if (seg <= PREFERIDO_MAX_SEG) return 0.92;
  return 0.75;
}

/**
 * Despedida, saudação e chamada de inscrição, em código. O JEV acerta as
 * pontas ("Até mais" 0,93), mas no meio confunde: "Ontem eu estava conversando
 * com um dos meus sócios" saiu com 0,59 de "borda" em 03/10. Então a borda é o
 * JEV muito confiante (>= 0,75) OU uma destas expressões.
 */
const BORDA_DO_VIDEO = /(deus aben[cç]o[ae]|at[eé] mais|at[eé] a pr[oó]xima|se inscrev|inscreva|deixa o like|fala,? pessoal|tchau\b)/i;

/** Janela candidata: frases `a` a `b`, começando na palavra `de` (a abertura pode aparar muleta). */
export type JanelaCandidata = { a: number; b: number; de: number };

/**
 * Onde a frase pode abrir um corte: o começo dela, ou depois de até três
 * palavras-muleta ("Então,", "E", "É,"), desde que o resto passe na guarda
 * `defeitoDaAbertura`. O Bruno abre quase toda frase com "Então" ou "E", e
 * exigir a frase limpa deixava de fora quase tudo (medido em 03/10: 24
 * janelas num vídeo de 19 min). Só se apara MULETA; pronome que aponta para
 * fora, gaguejo e autocorreção continuam reprovando.
 */
function aberturaDa(f: Frase, palavras: Word[]): number | null {
  for (let k = 0; k <= 3 && f.de + k <= f.ate - 3; k++) {
    const defeito = defeitoDaAbertura(palavras, f.de + k);
    if (!defeito) return f.de + k;
    if (!defeito.startsWith("abre com a muleta")) return null;
  }
  return null;
}

/** As janelas candidatas, montadas em código a partir da leitura das frases. */
export function montarJanelas(frases: Frase[], palavras: Word[], leitura: Map<string, LeituraDaFrase>): JanelaCandidata[] {
  const ehBorda = (f: Frase) => (leitura.get(f.id)?.borda ?? 0) >= 0.75 || BORDA_DO_VIDEO.test(f.texto);
  const aberturas = frases
    .map((f) => ({ f, de: f.comecoLimpo && !ehBorda(f) ? aberturaDa(f, palavras) : null, l: leitura.get(f.id) }))
    .filter((x): x is { f: Frase; de: number; l: LeituraDaFrase } => x.de !== null && !!x.l && x.l.gancho !== null)
    // Gancho manda; "se entende sozinha" desempata (no JEV ela fica quase
    // sempre entre 0,4 e 0,7, então não serve de corte duro).
    .sort((x, y) => (y.l.gancho ?? 0) + 0.5 * (y.l.sozinha ?? 0) - ((x.l.gancho ?? 0) + 0.5 * (x.l.sozinha ?? 0)))
    .slice(0, MAX_ABERTURAS);

  const janelas: JanelaCandidata[] = [];
  for (const { f: fa, de } of aberturas) {
    const inicio = palavras[de].start;
    const fins: Array<{ b: number; peso: number }> = [];
    for (let j = fa.n; j < frases.length; j++) {
      const fb = frases[j];
      const seg = fb.fim - inicio;
      if (seg > MAX_SEG) break;
      // Despedida dentro da janela: o corte acaba antes dela, nunca nela.
      if (j > fa.n && ehBorda(fb)) break;
      if (seg < MIN_SEG || !fb.fechaCorte) continue;
      // "Conclui" no JEV é tímido (quase tudo abaixo de 0,5), então aqui ele
      // só ordena os fins; quem julga o fecho é a nota da janela inteira.
      const conclui = leitura.get(fb.id)?.conclui ?? 0;
      if (conclui < 0.2) continue;
      fins.push({ b: j, peso: conclui * pesoDaDuracao(seg) });
    }
    // Acima de 90 s só quando não há fim bom antes.
    const ate90 = fins.filter((x) => frases[x.b].fim - inicio <= PREFERIDO_MAX_SEG);
    const usados = (ate90.length ? ate90 : fins).sort((x, y) => y.peso - x.peso).slice(0, FINS_POR_ABERTURA);
    for (const x of usados) janelas.push({ a: fa.n, b: x.b, de });
  }
  return janelas;
}

/** Nota cada janela com o JEV: os cinco critérios de conteúdo e se é um assunto só. */
export async function notarJanelas(
  janelas: JanelaCandidata[],
  frases: Frase[],
  palavras: Word[],
  leitura: Map<string, LeituraDaFrase>,
  nicho: string | null,
  ctx: { projectId?: string | null; uso: UsoDoJev }
): Promise<JanelaDoJev[]> {
  const saida: JanelaDoJev[] = [];
  const tarefas: Array<() => Promise<void>> = [];
  const comId = janelas.map((j, i) => ({ ...j, id: `j${i}` }));
  for (let k = 0; k < comId.length; k += JANELAS_POR_ESTADO) {
    const lote = comId.slice(k, k + JANELAS_POR_ESTADO);
    tarefas.push(async () => {
      const state = {
        contexto: `Candidatos a corte de vídeo curto (Reels, Shorts, TikTok) tirados de uma gravação${nicho ? ` sobre ${nicho}` : ""}, falada sem roteiro. Em cada item de \`cortes\`, o CORTE é o que está entre [[ ]]; o texto fora dos colchetes é só o que vinha antes e o que vem depois na gravação, e NÃO vai ao ar. Quem assiste o corte não ouviu nada de fora dele.`,
        cortes: lote.map((j) => {
          const fb = frases[j.b];
          return { id: j.id, texto: `${texto(palavras, j.de - 25, j.de - 1)} [[${texto(palavras, j.de, fb.ate)}]] ${texto(palavras, fb.ate + 1, fb.ate + 25)}`.trim() };
        }),
      };
      const perguntas: Record<string, PerguntaDoJev> = {};
      for (const j of lote) {
        perguntas[`t:${j.id}`] = { type: "score", instructions: `No corte "${j.id}" (o texto entre [[ ]]), qual a força da TESE?`, criteria: NIVEIS.tese };
        perguntas[`p:${j.id}`] = { type: "score", instructions: `No corte "${j.id}" (o texto entre [[ ]]), há PROVA do que é dito?`, criteria: NIVEIS.prova };
        perguntas[`a:${j.id}`] = { type: "score", instructions: `O corte "${j.id}" (o texto entre [[ ]]) se entende sozinho, por quem não ouviu nada do que veio antes?`, criteria: NIVEIS.autonomia };
        perguntas[`e:${j.id}`] = { type: "score", instructions: `O corte "${j.id}" (o texto entre [[ ]]) provoca alguma EMOÇÃO em quem assiste?`, criteria: NIVEIS.emocao };
        perguntas[`f:${j.id}`] = {
          type: "score",
          instructions: `Como termina o corte "${j.id}"? Olhe a última frase entre [[ ]] e o que vem depois dos colchetes: se o ponto do raciocínio só chega depois, o corte termina no ar.`,
          criteria: NIVEIS.fecho,
        };
        perguntas[`i:${j.id}`] = {
          type: "score",
          instructions: `Como COMEÇA o corte "${j.id}" (o texto entre [[ ]])? Olhe os primeiros segundos: entram direto no ponto do corte, ou enrolam antes de chegar nele?`,
          criteria: NIVEIS.entrada,
        };
        perguntas[`u:${j.id}`] = {
          type: "noul",
          instructions: `O corte "${j.id}" (o texto entre [[ ]]) trata de UM assunto só, do começo ao fim, sem juntar dois assuntos diferentes?`,
        };
      }
      const r = await perguntarAoJev({ projectId: ctx.projectId, etapa: "selecao-cortes", state, uso: ctx.uso }, perguntas);
      for (const j of lote) {
        const fa = frases[j.a];
        const fb = frases[j.b];
        const notas = {
          // O gancho é o elo mais fraco entre a frase de abertura (lida
          // sozinha) e a entrada do corte (lida no corte inteiro): frase boa
          // seguida de 20 s de rodeio não prende (Michelangelo, 03/10).
          gancho: Math.min(notaDe(leitura.get(fa.id)?.gancho ?? null), notaDoScore(r[`i:${j.id}`]) === null ? 10 : notaDe(notaDoScore(r[`i:${j.id}`]))),
          tese: notaDe(notaDoScore(r[`t:${j.id}`])),
          prova: notaDe(notaDoScore(r[`p:${j.id}`])),
          autonomia: notaDe(notaDoScore(r[`a:${j.id}`])),
          emocao: notaDe(notaDoScore(r[`e:${j.id}`])),
          fecho: notaDe(notaDoScore(r[`f:${j.id}`])),
        };
        // Sem resposta do JEV para algum critério, a janela não entra: nota
        // zero por silêncio seria injusta, e nota inventada seria pior.
        if (["t", "p", "a", "e", "f"].some((q) => notaDoScore(r[`${q}:${j.id}`]) === null)) continue;
        const valores = Object.values(notas);
        const umAssunto = probabilidadeDeSim(r[`u:${j.id}`]);
        saida.push({
          id: j.id,
          frases: [j.a, j.b],
          inicio: palavras[j.de].start,
          fim: fb.fim,
          texto: texto(palavras, j.de, fb.ate),
          notas,
          nota: Math.min(...valores),
          media: valores.reduce((s, v) => s + v, 0) / valores.length,
          umAssunto,
        });
      }
    });
  }
  await emPoucos(tarefas);
  return saida;
}

/**
 * Ordem de força: a nota final (a menor das seis) manda; a média desempata;
 * dois assuntos colados perdem; e a duração fora do ideal pesa um pouco.
 *
 * O "um assunto só" pesa de forma gradual abaixo de 0,75 (medido em 03/10:
 * "não tenha medo porque quem está fazendo é Deus" colado em "o trabalho não
 * é fardo" saiu com 0,41, e o mesmo fim com a abertura certa, 0,83).
 */
export function forca(j: JanelaDoJev): number {
  const assunto = j.umAssunto === null ? 0 : -3 * Math.max(0, 0.75 - j.umAssunto);
  return j.nota + 0.35 * j.media + assunto + 2 * (pesoDaDuracao(j.fim - j.inicio) - 1);
}

const SISTEMA_DO_TEXTO = `Você escreve os rótulos de cortes de vídeo curto que JÁ foram escolhidos. Não escolha nem descarte nada: só escreva.

Para cada corte, a partir da fala dele:
- "titulo": curto, até 8 palavras, do jeito que a pessoa que gravou reconheceria o momento.
- "ideia": a tese do trecho em uma frase, na voz da pessoa (primeira pessoa quando ela fala de si).
- "motivo": uma frase dizendo por que o corte vale e, se alguma nota está baixa, o que falta nele (seja honesto: não elogie o que a nota não sustenta).

Além disso, "diagnostico": uma frase honesta sobre a matéria-prima da gravação, como um editor experiente diria ao cliente.

Regras: português do Brasil; nunca use travessão (use vírgula, dois-pontos, ponto e vírgula ou parênteses); nunca use quebra de linha dentro de um texto.

Responda SOMENTE com JSON válido, sem cercas de código: {"diagnostico":"...","cortes":{"<id>":{"titulo":"...","ideia":"...","motivo":"..."}}}`;

const MODELO_DO_TEXTO = "claude-haiku-4-5";

async function escreverRotulos(
  escolhidas: JanelaDoJev[],
  contexto: { nicho?: string | null; publico?: string | null; voz?: string | null } | undefined,
  usageCtx?: { projectId?: string; runId?: string }
): Promise<{ cortes: Record<string, { titulo?: string; ideia?: string; motivo?: string }>; diagnostico?: string }> {
  const perfil = [contexto?.nicho ? `Nicho: ${contexto.nicho}` : "", contexto?.publico ? `Público: ${contexto.publico}` : ""].filter(Boolean).join("\n");
  const bruto = await askClaude(
    SISTEMA_DO_TEXTO,
    `${perfil ? perfil + "\n\n" : ""}${JSON.stringify({
      cortes: escolhidas.map((j) => ({ id: j.id, segundos: Math.round(j.fim - j.inicio), notas: j.notas, fala: j.texto })),
    })}`,
    {
      model: process.env.SELECAO_MODELO_DO_TEXTO || MODELO_DO_TEXTO,
      maxTokens: 4000,
      timeoutMs: 90_000,
      usage: { operation: "video_selecao_texto", ...usageCtx },
    }
  );
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const dados = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1)) as {
    diagnostico?: string;
    cortes?: Record<string, { titulo?: string; ideia?: string; motivo?: string }>;
  };
  return { cortes: dados.cortes ?? {}, diagnostico: dados.diagnostico };
}

const semTravessao = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").trim();

/** Rótulo de reserva, quando o Claude que escreve falha: a decisão já está tomada. */
function rotuloDeReserva(j: JanelaDoJev): { titulo: string; ideia: string; motivo: string } {
  const primeira = j.texto.split(/(?<=[.!?…])\s+/)[0] ?? j.texto;
  const palavras = primeira.split(/\s+/);
  const nomes: Record<string, string> = { gancho: "gancho", tese: "tese", prova: "prova", autonomia: "autonomia", emocao: "emoção", fecho: "fecho" };
  const pior = (Object.entries(j.notas) as Array<[string, number]>).sort((a, b) => a[1] - b[1])[0];
  return {
    titulo: palavras.slice(0, 8).join(" ").replace(/[,.;:!?…]+$/, ""),
    ideia: primeira,
    motivo: `Nota ${j.nota}; o critério mais fraco é ${nomes[pior[0]]} (${pior[1]}).`,
  };
}

/** Até quantos segundos de distância dois cortes podem ser o mesmo raciocínio. */
const VIZINHANCA_SEG = 60;
/** "Mesmo raciocínio" do JEV: a partir daqui veta sozinho; até `REPETE_NAO`, libera; o meio vai ao Claude. */
const REPETE_SIM = 0.76;
const REPETE_NAO = 0.5;

/** O desempate da dúvida do JEV sobre raciocínio repetido, numa chamada só. */
async function repeticaoNoClaude(pares: Array<{ i: number; a: JanelaDoJev; b: JanelaDoJev }>, projectId?: string | null): Promise<Set<string>> {
  const bruto = await askClaude(
    `Você é editor de vídeo curto. Recebe pares de cortes da mesma gravação, que vão ao ar em dias diferentes. Para cada par, diga se o segundo desenvolve o MESMO raciocínio do primeiro (continua a mesma história ou repete o mesmo ponto central), de modo que publicar os dois seria repetir o assunto. Dividir só o tema geral do vídeo NÃO é repetir: dois exemplos diferentes, com pontos diferentes, são cortes diferentes.
Responda SOMENTE com JSON válido, sem cercas de código: {"repete":{"<id>":true,"<id2>":false}}`,
    JSON.stringify({ pares: pares.map((x) => ({ id: `p${x.i}`, primeiro: x.a.texto, segundo: x.b.texto })) }),
    {
      model: process.env.SELECAO_MODELO_DO_DESEMPATE || "claude-sonnet-5",
      effort: "low",
      maxTokens: 4000,
      timeoutMs: 90_000,
      usage: { projectId: projectId ?? undefined, operation: "video_selecao_desempate" },
    }
  );
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const dados = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1)) as { repete?: Record<string, boolean> };
  return new Set(Object.entries(dados.repete ?? {}).filter(([, v]) => v === true).map(([k]) => k));
}

/**
 * Escolhe as mais fortes sem se tocarem (3 s de folga) e sem repetir
 * raciocínio. Medido em 03/10: "só que eu cheguei num momento da minha vida"
 * (13:24) e "Meu, não tenha vergonha, faça" (14:16) eram dois recortes do
 * mesmo raciocínio, e o caminho antigo já proíbe isso no prompt. Aqui o JEV
 * decide por par vizinho (menos de 60 s entre eles); a mais fraca do par sai
 * e a próxima da fila entra. JEV falhou nesta pergunta, fica como estava.
 */
async function escolherSemRepetir(
  ordem: JanelaDoJev[],
  quantos: number,
  nicho: string | null,
  ctx: { projectId?: string | null; uso: UsoDoJev }
): Promise<JanelaDoJev[]> {
  const vetadas = new Set<string>();
  const perguntados = new Set<string>();
  let escolhidas: JanelaDoJev[] = [];
  for (let rodada = 0; rodada < 4; rodada++) {
    escolhidas = [];
    for (const j of ordem) {
      if (escolhidas.length >= quantos) break;
      if (vetadas.has(j.id)) continue;
      if (escolhidas.some((o) => j.inicio < o.fim + 3 && o.inicio < j.fim + 3)) continue;
      escolhidas.push(j);
    }
    const pares: Array<[JanelaDoJev, JanelaDoJev]> = [];
    const porTempo = [...escolhidas].sort((a, b) => a.inicio - b.inicio);
    for (let i = 1; i < porTempo.length; i++) {
      const [a, b] = [porTempo[i - 1], porTempo[i]];
      if (b.inicio - a.fim < VIZINHANCA_SEG && !perguntados.has(`${a.id}|${b.id}`)) pares.push([a, b]);
    }
    if (!pares.length) return escolhidas;
    let r: Awaited<ReturnType<typeof perguntarAoJev>>;
    try {
      const state = {
        contexto: `Pares de cortes de vídeo curto tirados da mesma gravação${nicho ? ` sobre ${nicho}` : ""}, um logo depois do outro. Cada corte vai ao ar sozinho, num dia diferente.`,
        pares: pares.map(([a, b], i) => ({ id: `p${i}`, primeiro: a.texto, segundo: b.texto })),
      };
      const perguntas: Record<string, PerguntaDoJev> = {};
      pares.forEach((_, i) => {
        perguntas[`p${i}`] = {
          type: "noul",
          instructions: `No par "p${i}", o segundo corte desenvolve o MESMO raciocínio do primeiro (continua ou repete a mesma ideia central), de modo que publicar os dois seria repetir o assunto?`,
        };
      });
      r = await perguntarAoJev({ projectId: ctx.projectId, etapa: "selecao-repeticao", state, uso: ctx.uso }, perguntas);
    } catch (e) {
      console.error("[selecao-jev] a pergunta de raciocínio repetido falhou (ignorada):", e instanceof Error ? e.message : e);
      return escolhidas;
    }
    // O JEV decide as pontas; o meio vai ao Claude numa chamada só. Medido em
    // 03/10: os pares que eram mesmo raciocínio saíram entre 0,77 e 0,83, e
    // os que só dividiam o tema do vídeo ("o essencial bem feito"), entre
    // 0,69 e 0,74. Uma régua só do JEV em 0,6 vetava os dois.
    const duvida: Array<{ i: number; a: JanelaDoJev; b: JanelaDoJev }> = [];
    const repetidos: Array<[JanelaDoJev, JanelaDoJev, string]> = [];
    pares.forEach(([a, b], i) => {
      perguntados.add(`${a.id}|${b.id}`);
      const p = probabilidadeDeSim(r[`p${i}`]);
      if (p === null) return;
      if (p >= REPETE_SIM) repetidos.push([a, b, `JEV ${p.toFixed(2)}`]);
      else if (p > REPETE_NAO) duvida.push({ i, a, b });
    });
    if (duvida.length) {
      try {
        const sim = await repeticaoNoClaude(duvida, ctx.projectId);
        for (const x of duvida) if (sim.has(`p${x.i}`)) repetidos.push([x.a, x.b, "Claude"]);
      } catch (e) {
        console.error("[selecao-jev] desempate de raciocínio repetido falhou (ficam os dois):", e instanceof Error ? e.message : e);
      }
    }
    for (const [a, b, quem] of repetidos) {
      const fraca = forca(a) >= forca(b) ? b : a;
      console.log(`[selecao-jev] mesmo raciocínio (${quem}): sai ${fraca.id} ${fraca.inicio.toFixed(0)}s`);
      vetadas.add(fraca.id);
    }
    if (!repetidos.length) return escolhidas;
  }
  return escolhidas;
}

/**
 * O caminho do JEV inteiro. Devolve `null` quando não dá para confiar no
 * resultado (quem chama cai no Claude antigo): JEV desligado ou fora do ar,
 * sem marcação por palavra, ou menos janelas aproveitáveis que o mínimo.
 */
export async function escolherPeloJev(
  palavras: Word[] | undefined,
  contexto: { nicho?: string | null; publico?: string | null; voz?: string | null } | undefined,
  usageCtx: { projectId?: string; runId?: string } | undefined,
  meta: MetaDaSelecao,
  /** Quantas escolher (o alvo mais a folga contra o descarte do fecho). */
  quantos: number
): Promise<ResultadoDaSelecaoPeloJev | null> {
  if (!selecaoPeloJevLigada() || !palavras?.length) return null;
  const t0 = Date.now();
  const uso = usoVazio();
  const nicho = contexto?.nicho ? contexto.nicho.slice(0, 160) : null;
  const ctx = { projectId: usageCtx?.projectId ?? null, uso };

  const frases = frasesDe(palavras);
  const leitura = await lerFrases(frases, palavras, nicho, ctx);
  const candidatas = montarJanelas(frases, palavras, leitura);
  console.log(`[selecao-jev] ${frases.length} frases, ${candidatas.length} janelas candidatas`);
  if (!candidatas.length) return null;
  const janelas = await notarJanelas(candidatas, frases, palavras, leitura, nicho, ctx);

  // As mais fortes sem sobreposição e sem repetir raciocínio.
  // "Um assunto só" abaixo de 0,5 é o JEV confiante de que o corte cola dois
  // assuntos: sai. Entre 0,5 e 0,75 só pesa (ver `forca`).
  const ordem = janelas
    .filter((j) => j.nota >= NOTA_PISO && (j.umAssunto === null || j.umAssunto >= 0.5))
    .sort((x, y) => forca(y) - forca(x));
  const escolhidas = await escolherSemRepetir(ordem, quantos, nicho, ctx);
  console.log(
    `[selecao-jev] ${janelas.length} janelas notadas, ${ordem.length} acima do piso ${NOTA_PISO}, ${escolhidas.length} escolhidas (mínimo ${meta.minimo}); JEV ${uso.pedidos} pedidos, US$ ${uso.custoUsd.toFixed(5)}`
  );
  // CONFIANÇA BAIXA: o JEV não achou o mínimo que o cliente pediu. O Claude
  // antigo lê a gravação inteira e pode achar o que a régua daqui não viu.
  if (escolhidas.length < meta.minimo) return null;

  let rotulos: Awaited<ReturnType<typeof escreverRotulos>> = { cortes: {} };
  let claudeChamadas = 0;
  try {
    claudeChamadas++;
    rotulos = await escreverRotulos(escolhidas, contexto, usageCtx);
  } catch (e) {
    console.error("[selecao-jev] o texto dos rótulos falhou, fica o rótulo de reserva:", e instanceof Error ? e.message : e);
  }

  // Na ordem de força (a mais forte primeiro): quem chama corta a sobra por
  // esta ordem depois do fecho, e não pela posição na gravação.
  const trechos = escolhidas
    .sort((a, b) => forca(b) - forca(a))
    .map((j) => {
      const reserva = rotuloDeReserva(j);
      const r = rotulos.cortes[j.id] ?? {};
      return {
        inicio: j.inicio,
        fim: j.fim,
        titulo: semTravessao(r.titulo || reserva.titulo),
        motivo: semTravessao(r.motivo || reserva.motivo),
        ideia: semTravessao(r.ideia || reserva.ideia),
        abertura: j.texto.split(/\s+/).slice(0, 10).join(" "),
        notas: j.notas,
        nota: j.nota,
        alinhado: true as const,
      };
    });
  const leituras = frases.map((f) => ({ id: f.id, inicio: f.inicio, texto: f.texto, ...(leitura.get(f.id) ?? { gancho: null, sozinha: null, conclui: null, borda: null }) }));
  const resultado = { trechos, diagnostico: rotulos.diagnostico ? semTravessao(rotulos.diagnostico) : undefined, janelas, leituras, uso, claudeChamadas, ms: Date.now() - t0 };
  ultimaSelecaoPeloJev = resultado;
  return resultado;
}

/** A última rodada, só para a prova e o diagnóstico (nada de produção lê isto). */
export let ultimaSelecaoPeloJev: ResultadoDaSelecaoPeloJev | null = null;
