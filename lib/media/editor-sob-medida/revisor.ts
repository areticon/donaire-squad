import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
import type { DefeitoDaRevisao } from "@/lib/media/editor-sob-medida/editor";

/**
 * O REVISOR COM VISÃO DO EDITOR SOB MEDIDA (03/10/2026): olha os quadros da
 * PRÉVIA renderizada (não o plano em texto) e julga cada peça contra a fala
 * daquele instante e contra a referência do estilo: texto legível, nada
 * cobrindo a demonstração ou o rosto sem motivo, peça coerente com o que é
 * dito, acabamento. Cada peça é vista pelo menos uma vez, já assentada.
 *
 * JUIZ CONTRA REFERÊNCIA (03/10/2026, à tarde): só reprovar o que está ERRADO
 * deixava passar o que está FRACO. O dono olhou um corte aprovado com nota 7 e
 * viu o que o revisor não via: parece slide, falta imagem real, cor apagada.
 * Agora cada quadro também recebe nota de 0 a 10 em impacto visual, hierarquia
 * tipográfica, profundidade, densidade e coerência com a fala, comparado LADO
 * A LADO com quadros de referência reais do estilo (as imagens de
 * docs/overlays/referencias, lousa e vox; senão, os `quadrosDeReferencia`
 * descritos em lib/media/referencias-de-estilo). Peça com algum critério
 * abaixo de 7 vai para o conserto com uma instrução concreta.
 *
 * Custo: os mesmos quadros de antes (amostra, nunca o vídeo todo) mais 3 a 4
 * imagens de referência por chamada, e cerca de 60 tokens de saída por quadro.
 * O defeito de QUALIDADE só vira conserto enquanto há rodada (`rodada` < 2):
 * na última, a nota fica registrada, mas a peça fraca não é arrancada (só sai
 * o que está errado, como antes).
 */

const POR_CHAMADA = 12;
/** A régua: abaixo disto, a peça vai para o conserto. */
export const NOTA_MINIMA = 7;
/** No máximo tantos defeitos de qualidade em trecho sem peça por revisão (cada um vira momento novo). */
const MAX_VAZIOS = 3;
/** Os defeitos que tiram a peça (espelho de DEFEITOS_GRAVES em corte.ts). */
const GRAVES = new Set(["ilegivel", "cobre", "incoerente", "imagem"]);

/**
 * OS PIORES PRIMEIRO, COM TETO (03/10, à noite): uma peça entra uma vez só
 * (com o defeito mais sério dela) e a lista vai ao conserto na ordem grave,
 * vazio, feio, qualidade (a nota mais baixa antes). O resto fica registrado,
 * mas não vai ao conserto nesta rodada: o conserto de 124 peças numa chamada
 * só refazia uma parte e o código apagava o resto.
 */
export function priorizarDefeitos(defeitos: DefeitoDaRevisao[], teto: number): DefeitoDaRevisao[] {
  const peso = (d: DefeitoDaRevisao) => (GRAVES.has(d.tipo) ? 0 : d.tipo === "vazio" ? 1 : d.tipo === "feio" ? 2 : 3);
  const notaDe = (d: DefeitoDaRevisao) => d.nota ?? 10;
  const ordem = [...defeitos].sort((a, b) => peso(a) - peso(b) || notaDe(a) - notaDe(b) || a.t - b.t);
  const vistos = new Set<string>();
  const saida: DefeitoDaRevisao[] = [];
  for (const d of ordem) {
    const chave = d.momento ?? `vazio-${Math.round(d.t / 10)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(d);
    if (saida.length >= teto) break;
  }
  return saida.sort((a, b) => a.t - b.t);
}

export const CRITERIOS = ["impacto", "hierarquia", "profundidade", "densidade", "coerencia"] as const;
export type Criterio = (typeof CRITERIOS)[number];
export type NotasDoQuadro = Record<Criterio, number>;

/**
 * Os quadros reais de cada estilo que o juiz vê ao lado da prévia. Só o que
 * existe em docs/overlays/referencias (lido do disco; o next.config leva a
 * pasta para a função da Vercel). Quatro, escolhidos para cobrir os modos do
 * estilo: tela cheia, conceito sobre a pessoa, cartão ao lado, slate.
 */
const IMAGENS_DE_REFERENCIA: Record<string, Array<{ arquivo: string; descricao: string }>> = {
  lousa: [
    { arquivo: "dan-martell/slate-fases.jpg", descricao: "tela cheia: título enorme com sublinhado ciano, seis blocos ciano com brilho em perspectiva, lousa escura com curvas de nível" },
    { arquivo: "dan-martell/conceito-durable.jpg", descricao: "conceito sobre a pessoa: duas palavras em serifa itálica gigante com brilho no espaço livre do cenário quente" },
    { arquivo: "dan-martell/card-lista.jpg", descricao: "cartão escuro arredondado ao lado da pessoa, título ciano, item numerado em branco bold" },
    { arquivo: "dan-martell/barra-1080.jpg", descricao: "dado em tela cheia: título com número em ciano itálico, barra com borda neon, rótulos em serifa" },
  ],
  vox: [
    { arquivo: "vox/cartao-pergunta.jpg", descricao: "título gigante em três linhas ATRÁS da pessoa recortada, cor forte sobre fundo claro texturizado" },
    { arquivo: "vox/stats-pessoa.jpg", descricao: "pessoa de perfil à esquerda; no espaço livre, nome e cargo, rótulo e o número dito enorme na cor de destaque" },
    { arquivo: "vox/grafico-linha.jpg", descricao: "gráfico de linha limpo com título e fonte ao lado da pessoa, fundo claro com papel texturizado" },
    { arquivo: "vox/revista-grifo.jpg", descricao: "documento real de arquivo em close, com o marca-texto amarelo entrando na frase dita, grão e vinheta" },
  ],
};

const cacheDeImagens = new Map<string, Array<{ base64: string; rotulo: string }>>();

/** As imagens de referência do estilo, prontas para a chamada (vazio quando o estilo não tem ou o disco falha). */
export function imagensDeReferencia(estiloId: string | null | undefined): Array<{ base64: string; rotulo: string }> {
  if (!estiloId) return [];
  const lista = IMAGENS_DE_REFERENCIA[estiloId];
  if (!lista) return [];
  const pronto = cacheDeImagens.get(estiloId);
  if (pronto) return pronto;
  const saida: Array<{ base64: string; rotulo: string }> = [];
  for (const [i, r] of lista.entries()) {
    try {
      const b = readFileSync(join(process.cwd(), "docs", "overlays", "referencias", r.arquivo));
      saida.push({ base64: b.toString("base64"), rotulo: `REF ${i + 1} (REFERÊNCIA REAL do estilo, NÃO é da prévia; só a régua de qualidade, o formato pode ser outro): ${r.descricao}` });
    } catch {
      // Sem a imagem, o juiz usa a descrição dos quadros típicos.
    }
  }
  cacheDeImagens.set(estiloId, saida);
  return saida;
}

const SISTEMA = `Você é o diretor de arte que aprova a edição de vídeo antes de ir ao ar. A régua é PROFISSIONAL: o quadro da prévia precisa ficar no nível dos quadros de referência do estilo (as imagens REF, quando vierem, ou a descrição dos quadros típicos). Hierarquia clara (rótulo, título, apoio), peça desenhada para o que é dito, legível no celular, nas cores da marca, nada mal alinhado ou cortado.

Cada quadro da prévia vem com k, o instante, a peça que está na tela (ou nenhuma) e a frase que está sendo dita. Faça DUAS coisas.

1. DEFEITOS reais (o que está ERRADO):
- "ilegivel": texto pequeno demais para o celular, cortado na borda, sobreposto a outro texto, baixo contraste;
- "cobre": a peça cobre o rosto ou algo que a pessoa está mostrando (objeto, tela) quando não devia;
  (o TÍTULO GIGANTE ATRÁS DA PESSOA é proposital: a pessoa recortada passa na frente dele e esconde parte das letras; só é defeito se a palavra ficar impossível de ler)
- "incoerente": a peça não tem a ver com a frase dita, ou mostra dado/número/nome que a fala não diz;
- "feio": desalinhado, apertado, amador, fora do estilo de referência;
- "vazio": tela sem pessoa e sem conteúdo;
- "imagem": inserção gerada inadequada (estranha, gente sensual, texto deformado, fora do setor).
A legenda pequena embaixo é esperada e não é defeito. Peça entrando ou saindo (meio transparente) não é defeito. Não invente defeito.

2. QUALIDADE (o que está FRACO), para TODO quadro, comparando LADO A LADO com a referência. Notas inteiras de 0 a 10:
- "impacto": faria o dedo parar no feed? tamanho, contraste, cor saturada da marca, luz. Cor apagada, cinza, pastel ou fundo lavado derruba.
- "hierarquia": o título domina (no 9:16, pelo menos ~7% da altura do quadro por linha), rótulo e apoio claramente menores, leitura em 1 segundo. Título do mesmo tamanho do apoio, ou miúdo num cartão, derruba.
- "profundidade": camadas de verdade (pessoa na frente do texto, vidro desfocado, sombra, luz, foto ou vídeo real atrás) contra cartão chapado colado por cima do vídeo. PARECE SLIDE (retângulo escuro com texto em cima da pessoa) não passa de 4.
- "densidade": o quadro carrega informação visual que sustenta a fala (dado, número, diagrama, imagem real do assunto) ou está vazio/genérico (cabeça falando sem nada, cartão com 3 palavras repetindo a fala). Quadro sem peça vale pela densidade do momento: história contada só com a cabeça falando é densidade baixa.
- "coerencia": a peça diz e mostra o que a fala diz naquele instante.
Calibração: 10 = indistinguível da referência; 8 = profissional, publicável num canal grande; 7 = o mínimo para ir ao ar; 5 = amador limpo (parece template ou slide); 3 = fraco. Seja exigente de verdade: a média dos cortes de criador grande é 8; o que só "não está errado" fica em 5 ou 6.
Para todo quadro com algum critério abaixo de 7, escreva "conserto": UMA instrução concreta e executável, no vocabulário de edição, por exemplo:
"título pequeno demais: dobrar o tamanho, 2 a 4 palavras, a palavra-chave no acento";
"parece slide: tirar o cartão chapado, título gigante ATRÁS da pessoa recortada, vidro desfocado e sombra";
"tela vazia: entrar o dado dito em tela cheia (número grande) ou uma inserção (B-roll) do que é contado";
"falta imagem real: inserção de foto ou vídeo do assunto (lugar, objeto, cena) no lugar do cartão";
"cor apagada: fundo escuro com o acento saturado da marca no título e na faixa, contraste máximo".
Diga O QUÊ mudar e COMO; nunca "melhorar o visual".

Responda só JSON:
{ "defeitos": [ { "k": 0, "tipo": "ilegivel", "descricao": "curta, o que está errado", "conserto": "o que fazer" } ],
  "quadros": [ { "k": 0, "impacto": 0, "hierarquia": 0, "profundidade": 0, "densidade": 0, "coerencia": 0, "conserto": "só se algum < 7" } ],
  "nota": 0 a 10 (o conjunto destes quadros contra a referência), "falta": "uma frase: o que mais falta para chegar na referência" }`;

export type QualidadeDoQuadro = { t: number; momento: string | null; notas: NotasDoQuadro; menor: number; conserto: string };

export type ResultadoDaRevisao = {
  defeitos: DefeitoDaRevisao[];
  /** Quantos defeitos o juiz achou antes do teto da rodada (os que foram ao conserto estão em `defeitos`). */
  achados?: number;
  quadros: number;
  nota: number | null;
  falta: string[];
  erro?: string | null;
  /** O juiz contra a referência: a média de cada critério, os quadros fracos e quantos defeitos de qualidade foram para o conserto. */
  qualidade?: {
    media: NotasDoQuadro | null;
    abaixo: number;
    paraConserto: number;
    referenciasVistas: number;
    porQuadro: QualidadeDoQuadro[];
  };
};

/**
 * A AMOSTRA POR BLOCO DO COMPLETO (03/10, à noite): o juiz olhava cada peça
 * do completo de 17 min (170 quadros, 186 defeitos numa rodada) e o conserto
 * não dava conta de tudo. Com `tetoPorBloco`, cada bloco de `BLOCO_DA_AMOSTRA`
 * segundos leva no máximo tantos quadros, espalhados pelo bloco; a peça que
 * não foi olhada fica como está (não vira defeito).
 */
export const BLOCO_DA_AMOSTRA = 300;

function espalhar<T extends { t: number }>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const passo = xs.length / n;
  return Array.from({ length: n }, (_, i) => xs[Math.min(xs.length - 1, Math.floor(i * passo + passo / 2))]);
}

/** Os instantes a olhar: cada peça assentada (e depois do último passo) e uma amostra a cada `passo` s; com `tetoPorBloco`, no máximo tantos por bloco de 5 min. */
export function instantesDaRevisaoSobMedida(ed: EdicaoResolvida, passo = 20, soIds?: string[] | null, tetoPorBloco?: number): Array<{ t: number; momento: string | null }> {
  const todos = instantesSemTeto(ed, passo, soIds);
  if (!tetoPorBloco || tetoPorBloco <= 0) return todos;
  const saida: Array<{ t: number; momento: string | null }> = [];
  for (let b = 0; b * BLOCO_DA_AMOSTRA < ed.duracao; b++) {
    const doBloco = todos.filter((x) => x.t >= b * BLOCO_DA_AMOSTRA && x.t < (b + 1) * BLOCO_DA_AMOSTRA);
    // O trecho sem peça entra sempre (no máximo 1/4 do teto): é ali que o vazio aparece.
    const vazios = espalhar(doBloco.filter((x) => !x.momento), Math.max(1, Math.floor(tetoPorBloco / 4)));
    // Uma olhada por peça (a primeira, assentada), espalhadas pelo bloco.
    const vistos = new Set<string>();
    const pecas = doBloco.filter((x) => x.momento && !vistos.has(x.momento) && vistos.add(x.momento));
    saida.push(...vazios, ...espalhar(pecas, tetoPorBloco - vazios.length));
  }
  return saida.sort((a, b) => a.t - b.t);
}

function instantesSemTeto(ed: EdicaoResolvida, passo: number, soIds?: string[] | null): Array<{ t: number; momento: string | null }> {
  const saida: Array<{ t: number; momento: string | null }> = [];
  for (const c of ed.camadas) {
    if (c.peca === "moldura-do-cartao") continue;
    if (soIds && !soIds.includes(c.id)) continue;
    const assentado = Math.min(c.ate - 0.2, c.de + c.entrada + 0.35);
    saida.push({ t: assentado, momento: c.id });
    const ult = c.eventos.at(-1);
    if (ult !== undefined && ult + c.evento + 0.2 < c.ate - 0.2 && ult - assentado > 1) saida.push({ t: ult + c.evento + 0.15, momento: c.id });
  }
  if (!soIds) {
    for (let t = passo / 2; t < ed.duracao; t += passo) {
      const ocupado = ed.camadas.some((c) => t >= c.de && t < c.ate);
      if (!ocupado) saida.push({ t, momento: null });
    }
  }
  return saida.sort((a, b) => a.t - b.t);
}

function fraseEm(frases: Frase[], t: number): string {
  const f = frases.find((x) => t >= x.inicio - 0.2 && t <= x.fim + 0.4) ?? frases.find((x) => x.inicio > t);
  return f ? f.texto.slice(0, 220) : "";
}

const nota = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(10, x)) : null);

/** Os defeitos de QUALIDADE: a pior nota de cada peça (e dos trechos sem peça, os piores), com a instrução do juiz. */
export function defeitosDeQualidade(porQuadro: QualidadeDoQuadro[], minima = NOTA_MINIMA): DefeitoDaRevisao[] {
  const pior = new Map<string, QualidadeDoQuadro>();
  const vazios: QualidadeDoQuadro[] = [];
  for (const q of porQuadro) {
    if (q.menor >= minima) continue;
    if (!q.momento) {
      vazios.push(q);
      continue;
    }
    const atual = pior.get(q.momento);
    if (!atual || q.menor < atual.menor) pior.set(q.momento, q);
  }
  const escolhidos = [...pior.values(), ...vazios.sort((a, b) => a.menor - b.menor).slice(0, MAX_VAZIOS)];
  return escolhidos
    .sort((a, b) => a.t - b.t)
    .map((q) => {
      const fracos = CRITERIOS.filter((c) => q.notas[c] < minima).map((c) => `${c} ${q.notas[c]}`);
      return {
        momento: q.momento,
        t: q.t,
        tipo: "qualidade",
        nota: q.menor,
        descricao: `abaixo da referência do estilo (${fracos.join(", ")}, de 10)`.slice(0, 220),
        conserto: (q.conserto || "subir ao nível da referência: título maior, profundidade e cor da marca").slice(0, 220),
      };
    });
}

type Perguntar = typeof askClaudeComImagens;

export async function revisarPrevia(p: {
  edicao: EdicaoResolvida;
  frases: Frase[];
  obterQuadros: (instantes: number[]) => Promise<Array<{ t: number; base64: string }>>;
  referencia: string;
  /** O estilo, para as imagens de referência reais (lousa: Dan Martell). */
  estiloId?: string | null;
  /**
   * A rodada desta prévia (0, 1, 2). Defeito de QUALIDADE só vai para o
   * conserto quando ainda há rodada (< 2); sem o campo, a qualidade só é
   * medida e registrada.
   */
  rodada?: number;
  /** Deslocamento do arquivo (abertura na frente); a prévia não tem. */
  deslocamento?: number;
  soIds?: string[] | null;
  projectId?: string | null;
  modelo?: string;
  /** Amostra dos trechos sem peça, em segundos (20 no completo; o corte curto olha mais de perto). */
  passo?: number;
  /** Para a prova local medir o custo sem gravar no banco. */
  perguntar?: Perguntar;
  /** O completo: no máximo tantos quadros por bloco de 5 min (o teto de custo do juiz). */
  tetoPorBloco?: number;
  /** O completo: no máximo tantos defeitos vão ao conserto por rodada, os piores primeiro. */
  tetoDeDefeitos?: number;
}): Promise<ResultadoDaRevisao & { olhados: Array<{ t: number; momento: string | null; base64: string }> }> {
  const alvo = instantesDaRevisaoSobMedida(p.edicao, p.passo ?? 20, p.soIds, p.tetoPorBloco);
  const desloc = p.deslocamento ?? 0;
  const perguntar = p.perguntar ?? askClaudeComImagens;
  const refs = imagensDeReferencia(p.estiloId);
  const defeitos: DefeitoDaRevisao[] = [];
  const notas: number[] = [];
  const falta: string[] = [];
  const porQuadro: QualidadeDoQuadro[] = [];
  let erro: string | null = null;
  let olhados: Array<{ t: number; momento: string | null; base64: string }> = [];
  try {
    const q = await p.obterQuadros(alvo.map((a) => a.t + desloc));
    olhados = q.map((x) => {
      const a = alvo.find((y) => Math.abs(y.t + desloc - x.t) < 0.01) ?? alvo[0];
      return { t: x.t - desloc, momento: a?.momento ?? null, base64: x.base64 };
    });
    const lotes: Array<typeof olhados> = [];
    for (let i = 0; i < olhados.length; i += POR_CHAMADA) lotes.push(olhados.slice(i, i + POR_CHAMADA));
    const pecaDe = (id: string | null) => (id ? p.edicao.camadas.find((c) => c.id === id) : null);
    await Promise.all(
      lotes.map(async (lote) => {
        const resposta = await perguntar(
          SISTEMA,
          `# REFERÊNCIA DO ESTILO\n${p.referencia.slice(0, 2500)}\n\n${refs.length ? `As ${refs.length} imagens REF acima são quadros REAIS do estilo: a régua de qualidade. ` : "Sem imagem de referência: a régua são os quadros típicos descritos acima. "}Julgue os ${lote.length} quadros da prévia (k de 0 a ${lote.length - 1}): defeitos e as cinco notas de cada um.`,
          [
            ...refs,
            ...lote.map((q, k) => {
              const c = pecaDe(q.momento);
              return { base64: q.base64, rotulo: `PRÉVIA k=${k}, ${q.t.toFixed(1)} s, peça: ${c ? `${c.id} (${c.peca}: ${JSON.stringify(c.props).slice(0, 160)})` : "nenhuma"}; fala: "${fraseEm(p.frases, q.t)}"` };
            }),
          ],
          { model: p.modelo, effort: "low", maxTokens: 8000, timeoutMs: 180_000, usage: { projectId: p.projectId ?? undefined, operation: "editor-sob-medida-revisao" } }
        );
        const j = extrairJson(resposta) as {
          defeitos?: Array<{ k?: number; tipo?: string; descricao?: string; conserto?: string }>;
          quadros?: Array<Partial<Record<Criterio, number>> & { k?: number; conserto?: string }>;
          nota?: number;
          falta?: string;
        };
        if (typeof j.nota === "number") notas.push(j.nota);
        if (j.falta) falta.push(String(j.falta).slice(0, 240));
        for (const d of j.defeitos ?? []) {
          const q = typeof d.k === "number" ? lote[d.k] : undefined;
          if (!q) continue;
          defeitos.push({ momento: q.momento, t: q.t, tipo: String(d.tipo ?? "feio"), descricao: String(d.descricao ?? "").slice(0, 220), conserto: String(d.conserto ?? "").slice(0, 220) });
        }
        for (const x of j.quadros ?? []) {
          const q = typeof x.k === "number" ? lote[x.k] : undefined;
          if (!q) continue;
          const n = CRITERIOS.map((c) => nota(x[c]));
          if (n.some((v) => v === null)) continue;
          const notasDoQuadro = Object.fromEntries(CRITERIOS.map((c, i) => [c, n[i]!])) as NotasDoQuadro;
          porQuadro.push({ t: q.t, momento: q.momento, notas: notasDoQuadro, menor: Math.min(...(n as number[])), conserto: String(x.conserto ?? "").slice(0, 220) });
        }
      })
    );
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
  }
  porQuadro.sort((a, b) => a.t - b.t);
  const fracos = defeitosDeQualidade(porQuadro);
  const consertar = typeof p.rodada === "number" && p.rodada < 2;
  if (consertar) defeitos.push(...fracos);
  const achados = defeitos.length;
  if (p.tetoDeDefeitos) defeitos.splice(0, defeitos.length, ...priorizarDefeitos(defeitos, p.tetoDeDefeitos));
  const media = porQuadro.length
    ? (Object.fromEntries(CRITERIOS.map((c) => [c, +(porQuadro.reduce((s, q) => s + q.notas[c], 0) / porQuadro.length).toFixed(1)])) as NotasDoQuadro)
    : null;
  // A nota do conjunto passa a ser a média do juiz (os cinco critérios), mais estável que a impressão geral.
  const notaDoJuiz = media ? +(CRITERIOS.reduce((s, c) => s + media[c], 0) / CRITERIOS.length).toFixed(1) : null;
  return {
    defeitos,
    achados,
    quadros: olhados.length,
    nota: notaDoJuiz ?? (notas.length ? +(notas.reduce((s, x) => s + x, 0) / notas.length).toFixed(1) : null),
    falta,
    erro,
    qualidade: { media, abaixo: porQuadro.filter((q) => q.menor < NOTA_MINIMA).length, paraConserto: consertar ? fracos.length : 0, referenciasVistas: refs.length, porQuadro },
    olhados,
  };
}
