import { askClaude } from "@/lib/claude";
import { decidirNoul, jevLigado, notaDoScore, perguntarAoJev, probabilidadeDeSim, usoVazio, type PerguntaDoJev, type RespostaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
import { momentoFraco } from "@/lib/media/escolha-da-abertura";
import { PAUSA_DE_FRASE_SEG } from "@/lib/media/abertura-do-roteiro";
import {
  normalizarPalavra,
  REGRAS,
  type CenaDoPlano,
  type ElementoDoPlano,
  type Familia,
  type Formato,
  type Fundo,
  type ModoDaMontagem,
  type PalavraNoCorte,
  type PlanoDeMontagem,
} from "@/lib/media/plano-de-montagem";

/**
 * O DIRETOR "CORTE LIMPO PROFISSIONAL" (03/10/2026). Substitui o plano cena a
 * cena escrito pelo Sonnet (lib/media/diretor-de-montagem.ts, que continua
 * existindo para os estilos com "inserções de IA" ligadas e para o "outra
 * ideia" do cliente).
 *
 * ## Por que existe
 *
 * O vídeo de 19 min cmurn3adj falhou três vezes na etapa do roteiro e gastou
 * US$ 10,44 em 43 chamadas do diretor (Sonnet, ~17 mil tokens de SAÍDA e 2
 * min por chamada), e não saiu. Nos 30 dias anteriores o diretor custou
 * US$ 46,75. O vídeo de pitch da landing, que ficou bom, foi um plano enxuto
 * de corte limpo com poucas inserções; os seis perfis de consórcio medidos em
 * 02/10 têm o rosto na tela 72% do tempo e texto grande em 3 de 18 Reels.
 *
 * ## O desenho
 *
 * 1. O PLANO NASCE NO CÓDIGO, da transcrição com tempos: frases (pontuação e
 *    pausa medida), pausas candidatas a corte, números ditos.
 * 2. O JEV DECIDE por candidato, em lotes: "esta frase é uma afirmação-chave
 *    que merece cartela?", "aqui a pessoa está mostrando algo?", "esta pausa
 *    pode ser cortada sem quebrar a frase?", "este número merece destaque?",
 *    "este trecho é gancho forte?". Meio segundo e US$ 0,00002 por pedido.
 * 3. COTAS DURAS no código: 3 a 5 cartelas num vídeo de até 5 min (depois,
 *    uma por minuto), punch-in a cada 15 a 30 s nas ênfases, legenda o tempo
 *    todo (a da família), ZERO B-roll ou cena gerada.
 * 4. O Haiku (ou o modelo de MODELO_DAS_CARTELAS) só escolhe o trecho curto
 *    DITO de cada cartela, numa chamada de poucas centenas de tokens. Se ela
 *    falhar, o código escolhe a primeira oração.
 * 5. A saída é o mesmo `PlanoDeMontagem` que o validador, o montador e o
 *    Remotion já leem: narrador cheio com movimento, cartela com o texto da
 *    família (marca-texto), número em código. Nenhum asset.
 *
 * O módulo é puro até `planejarLimpo`; as partes com rede estão marcadas.
 */

export type FraseDaFala = { id: string; de: number; ate: number; inicio: number; fim: number; texto: string };
export type PausaDaFala = { id: string; i: number; seg: number };
export type NumeroDaFala = { id: string; i: number; valor: number; texto: string };

/** Pausa mínima (s) entre duas palavras para virar candidata a corte de câmera. */
export const PAUSA_DE_CORTE_SEG = 0.4;
/** Distância mínima entre dois punch-ins, e janela em que pelo menos um precisa cair. */
export const PUNCH_MIN_SEG = 15;
export const PUNCH_MAX_SEG = 30;
/** Distância mínima entre duas cartelas. */
const ESPACO_ENTRE_CARTELAS_SEG = 20;
const CARTELA_MIN_SEG = 2.2;
const CARTELA_MAX_SEG = 4.5;
/** Teto de cena de narrador antes de o corte de câmera ser forçado (um pouco abaixo do validador). */
const CENA_MAX_SEG = 8;
const FRASES_POR_PEDIDO = 12;

// ─────────────────────────────── puro: candidatos ───────────────────────────────

/** As frases da fala: fecham no ponto, na pausa longa medida ou em 28 palavras. */
export function frasesDaFala(palavras: PalavraNoCorte[]): FraseDaFala[] {
  const saida: FraseDaFala[] = [];
  let de = 0;
  for (let i = 0; i < palavras.length; i++) {
    const pausa = i + 1 < palavras.length ? palavras[i + 1].inicio - palavras[i].fim : Infinity;
    const fecha = i === palavras.length - 1 || /[.!?…]["”]?$/.test(palavras[i].texto) || pausa >= PAUSA_DE_FRASE_SEG || i - de + 1 >= 28;
    if (!fecha) continue;
    saida.push({ id: `f${saida.length}`, de, ate: i, inicio: palavras[de].inicio, fim: palavras[i].fim, texto: palavras.slice(de, i + 1).map((p) => p.texto).join(" ") });
    de = i + 1;
  }
  return saida;
}

/** As pausas medidas entre palavras (o corte seria ANTES da palavra `i`), as mais longas primeiro, até `teto`. */
export function pausasDaFala(palavras: PalavraNoCorte[], teto: number, minSeg = PAUSA_DE_CORTE_SEG): PausaDaFala[] {
  const todas: PausaDaFala[] = [];
  for (let i = 1; i < palavras.length; i++) {
    const seg = palavras[i].inicio - palavras[i - 1].fim;
    if (seg >= minSeg) todas.push({ id: `p${i}`, i, seg: +seg.toFixed(2) });
  }
  return todas.sort((a, b) => b.seg - a.seg).slice(0, teto).sort((a, b) => a.i - b.i);
}

/** Os números ditos em algarismo ("120", "120.000", "30%"). */
export function numerosDaFala(palavras: PalavraNoCorte[]): NumeroDaFala[] {
  const saida: NumeroDaFala[] = [];
  palavras.forEach((p, i) => {
    const n = normalizarPalavra(p.texto);
    const m = n.match(/^(\d+)%?$/);
    if (!m) return;
    const valor = Number(m[1]);
    if (!Number.isFinite(valor) || valor === 0) return;
    saida.push({ id: `n${i}`, i, valor, texto: p.texto });
  });
  return saida;
}

/**
 * Quantas cartelas o vídeo inteiro leva: de 3 a 5 até 5 min, depois uma por
 * minuto. O corte curto (até 90 s) leva 1 ou 2: nas referências do nicho o
 * texto grande aparece em 3 de 18 Reels.
 */
export function cartelasDoVideo(duracaoSeg: number, modo: ModoDaMontagem): number {
  if (modo === "corte" || duracaoSeg <= 90) return duracaoSeg >= 45 ? 2 : 1;
  if (duracaoSeg <= 300) return Math.min(5, Math.max(3, Math.round(duracaoSeg / 75)));
  return Math.max(5, Math.round(duracaoSeg / 60));
}

/** A fatia de um trecho (o bloco do completo) na cota do vídeo inteiro. */
export function cartelasDoTrecho(duracaoDoTrecho: number, duracaoDoVideo: number, modo: ModoDaMontagem): number {
  const total = cartelasDoVideo(duracaoDoVideo, modo);
  if (duracaoDoTrecho >= duracaoDoVideo - 0.5) return total;
  const fatia = Math.round((total * duracaoDoTrecho) / Math.max(1, duracaoDoVideo));
  return Math.max(duracaoDoTrecho >= 60 ? 1 : 0, fatia);
}

const VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "um", "uma", "que", "pra", "para", "por", "com",
  "se", "eu", "voce", "ele", "ela", "isso", "esse", "essa", "aqui", "ali", "entao", "mas", "nao", "tem", "ter", "foi", "ser", "sao", "ta",
  "tava", "estava", "esta", "como", "mais", "muito", "porque", "quando", "onde", "ne", "tipo", "assim", "gente", "coisa",
]);

/** A palavra que mais pesa num intervalo: longa, de conteúdo, número ou fim de frase. */
export function palavraForte(palavras: PalavraNoCorte[], de: number, ate: number): number {
  let melhor = -1;
  let nota = -Infinity;
  for (let i = de; i <= ate; i++) {
    const n = normalizarPalavra(palavras[i]?.texto ?? "");
    if (!n || VAZIAS.has(n)) continue;
    const s = Math.min(n.length, 11) + (/\d/.test(n) ? 4 : 0) + (/[.!?]$/.test(palavras[i].texto) ? 2 : 0);
    if (s > nota) {
      nota = s;
      melhor = i;
    }
  }
  return melhor >= 0 ? melhor : de;
}

const FIM_FRACO = new Set([
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "a", "o", "as", "os", "um", "uma", "e", "ou", "que", "com", "para", "pra", "por",
  "se", "mas", "nao", "bem", "mais", "muito", "tao", "ao", "aos", "pelo", "pela", "ele", "ela", "eles", "elas", "seu", "sua", "seus", "suas", "meu",
  "minha", "isso", "esse", "essa", "este", "esta", "aquele", "aquela", "aqui", "ali", "la", "entao", "ne", "tambem", "ja", "so", "ainda", "vai",
  "vou", "ser", "estar", "ter", "fazer", "pode", "quando", "como", "onde", "porque", "voce", "eu", "nos", "te", "me", "lhe", "sobre", "ate", "sem",
  "dentro", "fora", "cima", "baixo", "atras", "frente", "la", "ca", "entre", "contra", "desde",
]);
const COMECO_FRACO = new Set(["que", "e", "mas", "entao", "porque", "ai", "ne", "ou", "pois", "se", "tambem", "tipo", "assim", "eh", "aí"]);

/**
 * A oração mais forte da frase: a janela de 2 a 6 palavras ditas e seguidas
 * que carrega mais conteúdo (palavras longas, números), que não começa em
 * conector nem termina em palavra de liga, e de preferência fecha num sinal
 * de pontuação. É o fallback de código quando o modelo de texto não responde
 * ou devolve trecho que não foi dito assim.
 */
export function oracaoCurta(palavras: PalavraNoCorte[], de: number, ate: number): { de: number; ate: number } | null {
  const peso = (i: number) => {
    const n = normalizarPalavra(palavras[i].texto);
    if (!n) return 0;
    if (VAZIAS.has(n)) return 0.2;
    return Math.min(n.length, 10) / 4 + (/\d/.test(n) ? 2 : 0);
  };
  let melhor: { de: number; ate: number } | null = null;
  let nota = -Infinity;
  for (let i = de; i <= ate; i++) {
    const ni = normalizarPalavra(palavras[i].texto);
    if (!ni || COMECO_FRACO.has(ni)) continue;
    // Começo depois de vírgula ou no início da frase vale mais: oração inteira.
    const abre = i === de || /[,;:]$/.test(palavras[i - 1].texto) ? 1.5 : 0;
    let soma = 0;
    for (let j = i; j <= Math.min(ate, i + REGRAS.palavrasPorTexto - 1); j++) {
      const nj = normalizarPalavra(palavras[j].texto);
      // Gagueira da transcrição ("multidão, multidão") não vai para a tela.
      if (j > i && nj && nj === normalizarPalavra(palavras[j - 1].texto)) break;
      soma += peso(j);
      if (j - i + 1 < 2 || FIM_FRACO.has(nj)) {
        // A janela não atravessa pontuação no meio: oração é até o sinal.
        if (/[,;:.!?…]$/.test(palavras[j].texto)) break;
        continue;
      }
      const fecha = /[,;:.!?…]$/.test(palavras[j].texto) ? 1.5 : 0;
      const s = soma + abre + fecha + (j - i + 1) * 0.15;
      if (s > nota) {
        nota = s;
        melhor = { de: i, ate: j };
      }
      if (fecha) break;
    }
  }
  return melhor;
}

/** O trecho do modelo, aparado pelo código: sem palavra de liga no fim e dentro das 6 palavras. */
export function apararTrecho(trecho: string): string | null {
  let ps = trecho.replace(/[.,!?;:"“”]+$/g, "").split(/\s+/).filter(Boolean);
  while (ps.length > REGRAS.palavrasPorTexto && COMECO_FRACO.has(normalizarPalavra(ps[0]))) ps = ps.slice(1);
  while (ps.length > 2 && FIM_FRACO.has(normalizarPalavra(ps[ps.length - 1]))) ps = ps.slice(0, -1);
  if (ps.length < 2 || ps.length > REGRAS.palavrasPorTexto) return null;
  return ps.join(" ");
}

/** Onde um trecho de texto (2 a 6 palavras seguidas) aparece dentro da frase; null se não foi dito assim. */
export function trechoNaFrase(trecho: string, palavras: PalavraNoCorte[], de: number, ate: number): { de: number; ate: number } | null {
  const quer = trecho.split(/\s+/).map(normalizarPalavra).filter(Boolean);
  if (quer.length < 2 || quer.length > REGRAS.palavrasPorTexto) return null;
  const tem = palavras.slice(de, ate + 1).map((p) => normalizarPalavra(p.texto));
  for (let i = 0; i + quer.length <= tem.length; i++) {
    if (quer.every((q, k) => tem[i + k] === q)) return { de: de + i, ate: de + i + quer.length - 1 };
  }
  return null;
}

// ─────────────────────────────── as decisões ───────────────────────────────

export type DecisoesDoLimpo = {
  /** Probabilidade de cada frase merecer cartela, pela chave da frase. */
  cartela: Map<string, number>;
  /** Frases em que a pessoa está mostrando algo (nada cobre, sem punch). */
  mostra: Set<string>;
  /** Nota de gancho (0 fraca, 1 mediana, 2 forte) por frase, só no corte. */
  gancho: Map<string, number>;
  /** Índices de palavra onde o corte de câmera na pausa não quebra a frase. */
  cortes: Set<number>;
  /** Índices de palavra dos números que merecem destaque. */
  numeros: Set<number>;
};

export type MedidaDoLimpo = {
  jev: UsoDoJev;
  /** Chamadas ao modelo de texto para as cartelas (0 ou 1). */
  chamadasDeTexto: number;
  modeloDoTexto: string | null;
  ms: number;
  frases: number;
  pausas: number;
  numeros: number;
  /** O JEV respondeu; falso quando caiu no padrão de código (sem chave ou falha). */
  comJev: boolean;
};

const decisoesVazias = (): DecisoesDoLimpo => ({ cartela: new Map(), mostra: new Set(), gancho: new Map(), cortes: new Set(), numeros: new Set() });

const resumoDe = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n)}...` : t);

/**
 * AS PERGUNTAS AO JEV (rede). Cada lote leva no estado só as frases do lote
 * (com a vizinha de cada lado como contexto) e perguntas que apontam para a
 * frase pelo id. Falha no JEV devolve decisões vazias: o plano sai em corte
 * limpo puro de código, nunca deixa de sair.
 */
export async function decidirComJev(p: {
  palavras: PalavraNoCorte[];
  frases: FraseDaFala[];
  pausas: PausaDaFala[];
  numeros: NumeroDaFala[];
  modo: ModoDaMontagem;
  nicho?: string | null;
  projectId?: string | null;
  referencia: string;
  uso: UsoDoJev;
}): Promise<{ decisoes: DecisoesDoLimpo; ok: boolean }> {
  const d = decisoesVazias();
  const base = { projectId: p.projectId, uso: p.uso };
  const tarefas: Array<Promise<void>> = [];
  const nicho = p.nicho ? resumoDe(p.nicho, 160) : null;

  // 1. As frases: cartela, demonstração e (no corte) gancho.
  for (let k = 0; k < p.frases.length; k += FRASES_POR_PEDIDO) {
    const lote = p.frases.slice(k, k + FRASES_POR_PEDIDO);
    const state = {
      contexto: `Fala de um vídeo${nicho ? ` sobre ${nicho}` : ""}, transcrita. Cada item de "frases" é uma frase dita, com a anterior e a seguinte só como contexto.`,
      frases: lote.map((f) => {
        const k0 = p.frases.indexOf(f);
        return { id: f.id, antes: resumoDe(p.frases[k0 - 1]?.texto ?? ""), frase: f.texto, depois: resumoDe(p.frases[k0 + 1]?.texto ?? "") };
      }),
    };
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const f of lote) {
      perguntas[`c:${f.id}`] = { type: "noul", instructions: `A frase de id "${f.id}" em \`frases\` é uma afirmação-chave do vídeo (tese, conselho direto, promessa, virada, dado) que vale ser escrita grande na tela, sozinha, numa cartela de texto? Saudação, transição, enrolação e frase que só faz sentido com o contexto não valem.` };
      perguntas[`m:${f.id}`] = { type: "noul", instructions: `Na frase de id "${f.id}" em \`frases\`, a pessoa está MOSTRANDO algo físico ou na tela dela (tour, demonstração, "olha aqui", "está vendo", "esse aqui") em vez de só falar para a câmera?` };
      if (p.modo === "corte") {
        perguntas[`g:${f.id}`] = {
          type: "score",
          instructions: `Quão forte é a frase de id "${f.id}" em \`frases\` como GANCHO de abertura de um vídeo curto, ouvida sozinha, sem o contexto?`,
          criteria: ["fraca: saudação, transição, ou só faz sentido com o contexto", "mediana: interessante, mas não prende em 2 segundos", "forte: promessa, número, virada ou afirmação que contraria o senso comum e abre curiosidade"],
        };
      }
    }
    tarefas.push(
      perguntarAoJev({ ...base, etapa: "diretor-frases", state }, perguntas).then((r) => {
        for (const f of lote) {
          const c = probabilidadeDeSim(r[`c:${f.id}`]);
          if (c !== null) d.cartela.set(f.id, c);
          // "Mostrando" só com margem: na dúvida, trata como fala normal (a
          // guarda da demonstração pela imagem confere depois).
          if (decidirNoul(r[`m:${f.id}`], false, 0.4, 0.62)) d.mostra.add(f.id);
          const g = notaDoScore(r[`g:${f.id}`]);
          if (g !== null) d.gancho.set(f.id, g);
        }
      })
    );
  }

  // 2. As pausas: corte de câmera sem quebrar a frase.
  const POR_PEDIDO = 20;
  for (let k = 0; k < p.pausas.length; k += POR_PEDIDO) {
    const lote = p.pausas.slice(k, k + POR_PEDIDO);
    const state = {
      contexto: "Pausas medidas no áudio de uma fala, entre as cinco palavras antes e as cinco depois.",
      pausas: lote.map((x) => ({ id: x.id, antes: p.palavras.slice(Math.max(0, x.i - 5), x.i).map((w) => w.texto).join(" "), pausaSeg: x.seg, depois: p.palavras.slice(x.i, x.i + 5).map((w) => w.texto).join(" ") })),
    };
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const x of lote) perguntas[x.id] = { type: "noul", instructions: `A pausa de id "${x.id}" em \`pausas\` cai entre dois pensamentos (um corte de câmera ali não quebra a frase nem deixa uma oração pela metade)?` };
    tarefas.push(
      perguntarAoJev({ ...base, etapa: "diretor-pausas", state }, perguntas).then((r) => {
        for (const x of lote) if (decidirNoul(r[x.id], false, 0.4, 0.58)) d.cortes.add(x.i);
      })
    );
  }

  // 3. Os números ditos.
  if (p.numeros.length) {
    const state = {
      contexto: "Números ditos numa fala, cada um com a frase em que aparece.",
      numeros: p.numeros.slice(0, 40).map((n) => {
        const f = p.frases.find((x) => n.i >= x.de && n.i <= x.ate);
        return { id: n.id, numero: n.texto, frase: f?.texto ?? p.palavras.slice(Math.max(0, n.i - 6), n.i + 7).map((w) => w.texto).join(" ") };
      }),
    };
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const n of p.numeros.slice(0, 40)) perguntas[n.id] = { type: "noul", instructions: `O número de id "${n.id}" em \`numeros\` é um DADO que importa para quem assiste (valor, prazo, resultado, porcentagem) e merece aparecer grande na tela? Contagem casual, hora do dia e número de passagem não merecem.` };
    tarefas.push(
      perguntarAoJev({ ...base, etapa: "diretor-numeros", state }, perguntas).then((r) => {
        for (const n of p.numeros.slice(0, 40)) if (decidirNoul(r[n.id], false, 0.4, 0.6)) d.numeros.add(n.i);
      })
    );
  }

  try {
    await Promise.all(tarefas);
    return { decisoes: d, ok: true };
  } catch (e) {
    console.error(`[diretor-limpo ${p.referencia}] JEV falhou; plano em código puro:`, e instanceof Error ? e.message : e);
    return { decisoes: decisoesVazias(), ok: false };
  }
}

// ─────────────────────────────── o texto das cartelas (rede) ───────────────────────────────

const MODELO_DAS_CARTELAS = process.env.MODELO_DAS_CARTELAS ?? "claude-haiku-4-5";

const SISTEMA_DAS_CARTELAS = `Você escreve o texto curto das cartelas de um vídeo falado. Para cada frase, escolha "trecho": de 2 a 6 palavras DITAS e SEGUIDAS, copiadas EXATAMENTE da frase (mesma grafia, mesma ordem, sem trocar nem tirar palavra do meio), com sentido fechado: nunca termina em preposição, artigo, conjunção, advérbio solto ou verbo que pede complemento ("em", "do", "que", "bem", "não sabia" estão errados). Prefira o pedaço que carrega a ideia (a promessa, o número, a virada). Português do Brasil, sem travessão.
Responda SOMENTE com JSON válido, sem cerca de código: {"cartelas":[{"id":"f3","trecho":"..."}]}`;

function primeiroJson(t: string): unknown {
  const limpo = t.replace(/```(?:json)?/g, "");
  const i = limpo.indexOf("{");
  const f = limpo.lastIndexOf("}");
  if (i < 0 || f <= i) throw new Error("sem JSON");
  return JSON.parse(limpo.slice(i, f + 1));
}

/** O trecho dito de cada cartela, numa chamada só; falha vira mapa vazio (o código escolhe a oração). */
async function trechosDasCartelas(frases: FraseDaFala[], ctx: { projectId?: string | null; referencia: string }): Promise<{ trechos: Map<string, string>; chamadas: number }> {
  if (!frases.length) return { trechos: new Map(), chamadas: 0 };
  try {
    const usuario = frases.map((f) => `${f.id}: ${f.texto}`).join("\n");
    const resposta = await askClaude(SISTEMA_DAS_CARTELAS, usuario, {
      model: MODELO_DAS_CARTELAS,
      // Regra da casa: nunca abaixo de 4000 (o teto inclui o pensamento).
      maxTokens: 4000,
      timeoutMs: 60_000,
      usage: { projectId: ctx.projectId ?? undefined, operation: "montagem-cartelas" },
    });
    const dados = primeiroJson(resposta) as { cartelas?: Array<{ id?: string; trecho?: string }> };
    const trechos = new Map<string, string>();
    for (const c of dados.cartelas ?? []) if (typeof c.id === "string" && typeof c.trecho === "string") trechos.set(c.id, c.trecho.trim());
    if (process.env.DIRETOR_LIMPO_DEBUG === "1") console.log(`[diretor-limpo ${ctx.referencia}] trechos do modelo:`, JSON.stringify([...trechos]));
    return { trechos, chamadas: 1 };
  } catch (e) {
    console.warn(`[diretor-limpo ${ctx.referencia}] texto das cartelas falhou (${e instanceof Error ? e.message.slice(0, 80) : e}); vale a oração do código`);
    return { trechos: new Map(), chamadas: 1 };
  }
}

// ─────────────────────────────── puro: o plano ───────────────────────────────

export type EscolhasDoLimpo = {
  /** As frases que viram cartela, com o trecho dito (índices de palavra). */
  cartelas: Array<{ frase: FraseDaFala; de: number; ate: number }>;
  /** As palavras do punch-in. */
  enfases: number[];
  /** Os cortes de câmera (índice da primeira palavra da cena nova). */
  cortes: number[];
  /** Os números em destaque. */
  numeros: number[];
  /** Frases em que a pessoa mostra algo. */
  mostra: FraseDaFala[];
};

/**
 * As escolhas, em código, a partir das decisões: as cotas e os espaçamentos
 * são garantidos aqui, não ficam na mão de nenhum modelo.
 */
export function escolherDoLimpo(p: {
  palavras: PalavraNoCorte[];
  duracao: number;
  frases: FraseDaFala[];
  decisoes: DecisoesDoLimpo;
  cartelas: number;
  trechos: Map<string, string>;
  /** Textos já usados em blocos anteriores (o refrão do vídeo não vira três cartelas iguais). */
  jaUsado?: string[];
}): EscolhasDoLimpo {
  const { palavras, frases, decisoes } = p;
  const usados: string[][] = (p.jaUsado ?? []).map((t) => t.replace(/^[a-z-]+:\s*"?/i, "").split(/\s+/).map(normalizarPalavra).filter(Boolean));
  const repetido = (de: number, ate: number) => {
    const ps = palavras.slice(de, ate + 1).map((w) => normalizarPalavra(w.texto)).filter((x) => x && !VAZIAS.has(x));
    if (!ps.length) return true;
    return usados.some((u) => ps.filter((x) => u.includes(x)).length / ps.length >= 0.6);
  };
  const mostra = frases.filter((f) => decisoes.mostra.has(f.id));
  const naDemonstracao = (f: FraseDaFala) => decisoes.mostra.has(f.id);

  // 1. As cartelas: as frases mais prováveis, espaçadas, fora da demonstração
  // e dos primeiros 3 s, com o trecho dito (do modelo de texto ou a oração do código).
  const candidatas = frases
    .filter((f) => f.ate - f.de + 1 >= 3 && f.fim - f.inicio >= 1.2 && f.inicio >= 3 && !naDemonstracao(f) && !momentoFraco(f.texto))
    .map((f) => ({ f, prob: decisoes.cartela.get(f.id) ?? 0 }))
    .filter((x) => x.prob >= 0.55)
    .sort((a, b) => b.prob - a.prob);
  const cartelas: EscolhasDoLimpo["cartelas"] = [];
  for (const { f } of candidatas) {
    if (cartelas.length >= p.cartelas) break;
    if (cartelas.some((c) => Math.abs(c.frase.inicio - f.inicio) < ESPACO_ENTRE_CARTELAS_SEG)) continue;
    const pedido = p.trechos.get(f.id);
    const aparado = pedido ? apararTrecho(pedido) : null;
    const doModelo = aparado ? trechoNaFrase(aparado, palavras, f.de, f.ate) : null;
    if (pedido && !doModelo) console.warn(`[diretor-limpo] trecho "${pedido}" não está dito assim em "${f.texto.slice(0, 80)}"; vale a oração do código`);
    const trecho = doModelo ?? oracaoCurta(palavras, f.de, f.ate);
    if (!trecho) continue;
    // O mesmo texto duas vezes (o refrão do vídeo) é uma cartela só.
    if (repetido(trecho.de, trecho.ate)) continue;
    usados.push(palavras.slice(trecho.de, trecho.ate + 1).map((w) => normalizarPalavra(w.texto)).filter(Boolean));
    cartelas.push({ frase: f, de: trecho.de, ate: trecho.ate });
  }
  cartelas.sort((a, b) => a.de - b.de);

  // 2. Os punch-ins: nas ênfases (frase quase cartela), a cada 15 a 30 s.
  const emCartela = (i: number) => cartelas.some((c) => i >= c.de && i <= c.ate);
  const fortes = frases
    .filter((f) => !naDemonstracao(f) && (decisoes.cartela.get(f.id) ?? 0) >= 0.4)
    .map((f) => palavraForte(palavras, f.de, f.ate))
    .filter((i) => !emCartela(i))
    .sort((a, b) => palavras[a].inicio - palavras[b].inicio);
  const enfases: number[] = [];
  const longe = (i: number) => enfases.every((e) => Math.abs(palavras[e].inicio - palavras[i].inicio) >= PUNCH_MIN_SEG);
  for (const i of fortes) if (longe(i)) enfases.push(i);
  // Janela de 30 s sem punch ganha um na palavra forte dela (fora da demonstração e da cartela).
  for (let a = 0; a < p.duracao; a += PUNCH_MAX_SEG) {
    const b = Math.min(p.duracao, a + PUNCH_MAX_SEG);
    if (b - a < PUNCH_MIN_SEG) break;
    if (enfases.some((e) => palavras[e].inicio >= a && palavras[e].inicio < b)) continue;
    const idx = palavras.map((w, i) => (w.inicio >= a + 2 && w.inicio < b - 2 ? i : -1)).filter((i) => i >= 0 && !emCartela(i));
    const livres = idx.filter((i) => !mostra.some((f) => i >= f.de && i <= f.ate));
    const lista = livres.length ? livres : idx;
    if (lista.length < 2) continue;
    const forte = palavraForte(palavras, lista[0], lista[lista.length - 1]);
    if (!emCartela(forte) && longe(forte)) enfases.push(forte);
  }
  enfases.sort((a, b) => a - b);

  // 3. Os cortes de câmera nas pausas aprovadas (o jump cut), mais as bordas das cartelas.
  const cortes = new Set<number>();
  for (const i of decisoes.cortes) if (i > 0 && i < palavras.length) cortes.add(i);
  // Só o começo da cartela é borda: o fim é decidido na montagem (2,2 a 4,5 s),
  // e o resto da cena volta ao narrador.
  for (const c of cartelas) cortes.add(c.de);

  // 4. Os números: no máximo um por minuto, longe das cartelas.
  const numeros: number[] = [];
  for (const i of [...decisoes.numeros].sort((a, b) => a - b)) {
    if (emCartela(i)) continue;
    if (cartelas.some((c) => Math.abs(palavras[c.de].inicio - palavras[i].inicio) < 10)) continue;
    if (numeros.some((n) => Math.abs(palavras[n].inicio - palavras[i].inicio) < 60)) continue;
    numeros.push(i);
  }

  return { cartelas, enfases, cortes: [...cortes].sort((a, b) => a - b), numeros, mostra };
}

const FUNDO_DA_FAMILIA: Record<Familia, Fundo> = { colagem: "papel", impacto: "escuro", sobrio: "papel-marca" };

/** As cenas do plano, no formato que o validador lê. */
export function montarPlanoLimpo(p: {
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  familia: Familia;
  frases: FraseDaFala[];
  escolhas: EscolhasDoLimpo;
}): PlanoDeMontagem {
  const { palavras, duracao, familia, escolhas } = p;
  const n = palavras.length;
  const fundo = FUNDO_DA_FAMILIA[familia];
  const tempo = (i: number) => (i < n ? palavras[i].inicio : duracao);
  // As bordas das cenas: o começo, os cortes, e o que o teto de 8 s obriga.
  const bordas = new Set<number>([0, ...escolhas.cortes.filter((i) => i > 0 && i < n)]);
  const fimDeFrase = new Set(p.frases.map((f) => f.ate + 1).filter((i) => i < n));
  const partir = (de: number, ate: number) => {
    // Divide o trecho [de, ate] enquanto passar do teto, na pausa ou no fim de
    // frase mais perto do meio; sem nenhum, na palavra do meio.
    const fila: Array<[number, number]> = [[de, ate]];
    while (fila.length) {
      const [a, b] = fila.pop()!;
      const dur = (b + 1 < n ? palavras[b + 1].inicio : duracao) - palavras[a].inicio;
      if (dur <= CENA_MAX_SEG || b - a < 3) continue;
      const meio = palavras[a].inicio + dur / 2;
      let melhor = -1;
      let nota = Infinity;
      for (let i = a + 2; i <= b - 1; i++) {
        const pausa = palavras[i].inicio - palavras[i - 1].fim;
        const d = Math.abs(palavras[i].inicio - meio) - (fimDeFrase.has(i) ? 1.5 : 0) - Math.min(1.5, pausa * 2);
        if (d < nota) {
          nota = d;
          melhor = i;
        }
      }
      if (melhor < 0) continue;
      bordas.add(melhor);
      fila.push([a, melhor - 1], [melhor, b]);
    }
  };
  const ordenadas = [...bordas].sort((a, b) => a - b);
  for (let k = 0; k < ordenadas.length; k++) partir(ordenadas[k], (ordenadas[k + 1] ?? n) - 1);
  const inicios = [...bordas].sort((a, b) => a - b);

  const cartelaEm = new Map(escolhas.cartelas.map((c) => [c.de, c]));
  const enfases = new Set(escolhas.enfases);
  const numeros = new Set(escolhas.numeros);
  const mostra = (i: number) => escolhas.mostra.some((f) => i >= f.de && i <= f.ate);
  const cenas: CenaDoPlano[] = [];
  let alterna = 0;
  for (let k = 0; k < inicios.length; k++) {
    const de = inicios[k];
    const ate = (inicios[k + 1] ?? n) - 1;
    if (ate < de) continue;
    const cartela = cartelaEm.get(de);
    if (cartela) {
      // A cartela cobre o trecho dito, entre 1,5 e 4,5 s: o que sobrar da cena fica com o narrador.
      let fimDaCartela = Math.min(ate, cartela.ate);
      while (fimDaCartela < ate && tempo(fimDaCartela + 1) - palavras[de].inicio < CARTELA_MIN_SEG) fimDaCartela++;
      while (fimDaCartela > cartela.ate && tempo(fimDaCartela + 1) - palavras[de].inicio > CARTELA_MAX_SEG) fimDaCartela--;
      const texto = palavras.slice(cartela.de, cartela.ate + 1).map((w) => w.texto.replace(/[.,!?;:"“”]+$/g, "")).join(" ");
      const elementos: ElementoDoPlano[] = [{ tipo: "marca-texto", texto, zona: "centro", palavra: cartela.de }];
      cenas.push({ de, ate: fimDaCartela, layout: "cartela", movimento: "estatico", transicao: "corte", fundo, elementos, motivo: `corte limpo: cartela com a afirmação-chave "${texto}"` });
      if (fimDaCartela < ate) {
        cenas.push({ de: fimDaCartela + 1, ate, layout: "narrador-cheio", movimento: "estatico", transicao: "corte", fundo, elementos: [], motivo: "corte limpo: a pessoa volta depois da cartela" });
      }
      continue;
    }
    const enfase = [...enfases].find((i) => i >= de && i <= ate);
    const numero = [...numeros].find((i) => i >= de && i <= ate);
    const elementos: ElementoDoPlano[] = [];
    if (numero !== undefined) {
      const w = palavras[numero];
      const valor = Number(normalizarPalavra(w.texto).replace("%", ""));
      const sufixo = /%$/.test(normalizarPalavra(w.texto)) ? "%" : undefined;
      const rotulo = palavras.slice(numero + 1, numero + 4).map((x) => x.texto.replace(/[.,!?;:"“”]+$/g, "")).filter((x) => !/^\d/.test(x)).join(" ");
      elementos.push({ tipo: "numero", valor, rotulo: rotulo || w.texto, ...(sufixo ? { sufixo } : {}), zona: "base", palavra: numero });
    }
    const parado = mostra(de) || mostra(ate);
    let movimento: CenaDoPlano["movimento"] = "estatico";
    let movimentoNa: number | undefined;
    let motivo = "corte limpo: narrador cheio";
    if (enfase !== undefined && !parado) {
      movimento = "punch";
      movimentoNa = enfase;
      motivo = `corte limpo: punch-in na ênfase "${palavras[enfase].texto}"`;
    } else if (parado) {
      motivo = "corte limpo: a pessoa está mostrando algo; nada por cima";
    } else {
      // Entre dois cortes de câmera o enquadramento alterna, para o jump cut ler como corte.
      movimento = alterna % 2 === 1 ? "zoom-in-lento" : "estatico";
      alterna++;
    }
    cenas.push({ de, ate, layout: "narrador-cheio", movimento, ...(movimentoNa !== undefined ? { movimentoNa } : {}), transicao: "corte", fundo, elementos, motivo });
  }
  return {
    formato: p.formato,
    resumo: `Corte limpo profissional: ${escolhas.cartelas.length} cartela(s), ${escolhas.enfases.length} punch-in(s), ${escolhas.cortes.length} corte(s) de câmera, ${escolhas.numeros.length} número(s) em destaque, sem imagem gerada.`,
    legenda: { estilo: familia === "impacto" ? "destaque" : familia === "sobrio" ? "limpa" : "papel" },
    assets: [],
    cenas,
  };
}

// ─────────────────────────────── a porta de entrada ───────────────────────────────

export type EntradaDoLimpo = {
  projectId?: string | null;
  referencia: string;
  palavras: PalavraNoCorte[];
  duracao: number;
  formato: Formato;
  familia: Familia;
  modo: ModoDaMontagem;
  nicho?: string | null;
  /** A duração do vídeo inteiro, para a cota de cartelas do bloco (sem ela, vale a do trecho). */
  duracaoDoVideo?: number;
  /** O que os blocos anteriores já puseram na tela (montagem-do-completo.ts, `usadoNoPlano`). */
  jaUsado?: string[];
  /** Prova sem rede: nem JEV nem modelo de texto. */
  semRede?: boolean;
};

export type SaidaDoLimpo = { plano: PlanoDeMontagem; avisos: string[]; medida: MedidaDoLimpo; escolhas: EscolhasDoLimpo; decisoes: DecisoesDoLimpo };

/** Liga o diretor limpo: JEV com chave e DIRETOR_LIMPO diferente de "0". */
export function diretorLimpoLigado(): boolean {
  return jevLigado() && process.env.DIRETOR_LIMPO !== "0";
}

/**
 * O plano de corte limpo de um trecho (um corte, ou um bloco do completo).
 * Sem rede (ou com o JEV fora do ar) sai o plano de código puro: cortes nas
 * pausas longas, punch na palavra forte a cada 30 s, cartela nenhuma.
 */
export async function planejarLimpo(e: EntradaDoLimpo): Promise<SaidaDoLimpo> {
  const t0 = Date.now();
  const uso = usoVazio();
  const frases = frasesDaFala(e.palavras);
  const pausas = pausasDaFala(e.palavras, Math.max(4, Math.ceil(e.duracao / 6)));
  const numeros = numerosDaFala(e.palavras);
  const comRede = !e.semRede && jevLigado();
  const { decisoes, ok } = comRede
    ? await decidirComJev({ palavras: e.palavras, frases, pausas, numeros, modo: e.modo, nicho: e.nicho, projectId: e.projectId, referencia: e.referencia, uso })
    : { decisoes: decisoesVazias(), ok: false };
  const cota = cartelasDoTrecho(e.duracao, e.duracaoDoVideo ?? e.duracao, e.modo);
  // O texto só das frases que PODEM virar cartela (as mais prováveis, com folga de 2 sobre a cota).
  const possiveis = frases
    .filter((f) => (decisoes.cartela.get(f.id) ?? 0) >= 0.55 && !decisoes.mostra.has(f.id) && f.inicio >= 3 && !momentoFraco(f.texto))
    .sort((a, b) => (decisoes.cartela.get(b.id) ?? 0) - (decisoes.cartela.get(a.id) ?? 0))
    .slice(0, cota + 2);
  const texto = comRede && possiveis.length ? await trechosDasCartelas(possiveis, { projectId: e.projectId, referencia: e.referencia }) : { trechos: new Map<string, string>(), chamadas: 0 };
  const escolhas = escolherDoLimpo({ palavras: e.palavras, duracao: e.duracao, frases, decisoes, cartelas: cota, trechos: texto.trechos, jaUsado: e.jaUsado });
  const plano = montarPlanoLimpo({ palavras: e.palavras, duracao: e.duracao, formato: e.formato, familia: e.familia, frases, escolhas });
  const avisos: string[] = [];
  if (!ok) avisos.push(comRede ? "JEV sem resposta: plano de corte limpo em código puro" : "sem JEV: plano de corte limpo em código puro");
  if (escolhas.cartelas.length < Math.min(cota, 1) && cota > 0) avisos.push("nenhuma frase forte o bastante para cartela");
  return {
    plano,
    avisos,
    escolhas,
    decisoes,
    medida: { jev: uso, chamadasDeTexto: texto.chamadas, modeloDoTexto: texto.chamadas ? MODELO_DAS_CARTELAS : null, ms: Date.now() - t0, frases: frases.length, pausas: pausas.length, numeros: numeros.length, comJev: ok },
  };
}

/** Exposto para a prova: as respostas cruas de um lote, sem decisão. */
export type { RespostaDoJev };
