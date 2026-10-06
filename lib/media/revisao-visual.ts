import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { abreFrase, fechaFraseNaFala } from "@/lib/media/abertura-do-roteiro";
import { intervaloDaCena, type PalavraNoCorte, type PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import { cenaNoInstante } from "@/lib/media/guardas-do-completo";
import type { ObterQuadros } from "@/lib/media/demonstracao";

/**
 * A REVISÃO VISUAL FINAL (02/10/2026): o olho que faltava.
 *
 * O vídeo de pitch da landing ficou bom porque foi conferido quadro a quadro
 * depois de renderizado e refeito até ficar certo. A esteira fazia uma
 * passada só, e o revisor-da-montagem lia o PLANO em texto, nunca o vídeo
 * pronto: foi assim que o completo MrBeast cmuqc9r7z saiu com colagem de IA
 * em cima da mesa real, 3,7 s de tela vazia, frases cortadas na abertura e
 * gente de biquíni numa pregação.
 *
 * Aqui:
 *   1. quadros do vídeo PRONTO (1 a cada 3 s, mais o começo e o fim de cada
 *      inserção e o meio de cada momento da abertura), cada um com a fala
 *      daquele trecho e o que o plano pôs ali;
 *   2. um modelo com visão aponta só defeitos OBJETIVOS: cobertura em cima de
 *      demonstração, tela vazia ou preta, texto cortado ou fora da área
 *      segura, imagem inadequada ao perfil, legenda tapando o rosto. A frase
 *      cortada na abertura é conferida em CÓDIGO (pontuação e pausa medida),
 *      que é mais certo que o olho;
 *   3. cada defeito vira conserto (`consertosDaRevisao`): a cena volta à
 *      pessoa, o momento da abertura sai. Teto de 2 rodadas; sobrando
 *      defeito, vai a versão segura (sem inserção) com o motivo escrito.
 *
 * Custo: medido na prova (operação "montagem-revisao-visual" no ai_usage).
 */

export type TipoDeDefeito = "cobertura-em-demonstracao" | "tela-vazia" | "texto-cortado" | "imagem-inadequada" | "legenda-no-rosto" | "frase-cortada";

export type DefeitoVisual = {
  /** Segundo no vídeo pronto. */
  t: number;
  tipo: TipoDeDefeito;
  descricao: string;
  /** Cena do plano (tempo da base); null na abertura. */
  cena: number | null;
  /** Índice do momento da abertura, quando o defeito é nela. */
  momento?: number | null;
  /** O conserto possível: a cena volta à pessoa, o momento sai, ou nada (defeito da gravação). */
  conserto: "cena-para-pessoa" | "tirar-momento" | "nenhum";
};

export type RodadaDaRevisao = {
  em: string;
  rodada: number;
  quadros: number;
  defeitos: DefeitoVisual[];
  consertadas: number[];
  momentosTirados: number[];
  erro?: string | null;
  /** A conferência visual do editor por comando (06/10, lib/media/conferencia-visual.ts): o que o olho descreveu, as peças que o JEV reprovou e o custo. */
  problemas?: Array<{ t: number; momento: string | null; tipo: string; descricao: string }>;
  reprovadas?: string[];
  custoUsd?: number;
  ms?: number;
};

export type EstadoDaRevisaoVisual = {
  /** Rodadas de conserto já feitas (teto 2). */
  rodadas: number;
  /** Há um render esperando a revisão (o `candidato`). */
  pendente: boolean;
  historico: RodadaDaRevisao[];
  /** A versão segura foi pedida: o próximo render vai ao ar sem nova revisão. */
  segura?: boolean;
  /** O próximo render vai ao ar sem revisão (versão segura ou revisão desligada). */
  final?: boolean;
  motivo?: string | null;
};

export const RODADAS_DE_CONSERTO = 2;

export function revisaoVisualLigada(): boolean {
  return process.env.REVISAO_VISUAL_DO_COMPLETO !== "0";
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type MomentoNaTela = { inicio: number; fim: number; soco: string };

/** Onde cada momento da abertura cai no vídeo pronto (eles vêm em sequência, antes do completo). */
export function momentosNoPronto(abertura: MomentoNaTela[] | null | undefined): Array<{ de: number; ate: number; k: number }> {
  let t = 0;
  return (abertura ?? []).map((m, k) => {
    const de = t;
    t += m.fim - m.inicio;
    return { de, ate: t, k };
  });
}

/**
 * Os instantes a olhar no vídeo PRONTO. `deslocamento`: a duração da abertura
 * (o completo começa depois dela). `soCenas`: na rodada de conferência depois
 * de um conserto, só as inserções que sobraram e as cenas consertadas.
 */
export function instantesDaRevisao(p: {
  plano: PlanoDeMontagem;
  palavras: PalavraNoCorte[];
  duracao: number;
  abertura?: MomentoNaTela[] | null;
  deslocamento: number;
  passoSeg?: number;
  soCenas?: number[] | null;
}): number[] {
  const ts = new Set<number>();
  const r = (t: number) => Math.round(Math.max(0, t) * 4) / 4;
  const total = p.deslocamento + p.duracao;
  // 1 quadro a cada 4 s mais as bordas de cada inserção (02/10, custo): o que
  // a revisão acha mora nas inserções e na abertura, e a base é a gravação.
  const passo = p.passoSeg ?? 4;
  if (!p.soCenas) {
    for (let t = 0.5; t < total - 0.3; t += passo) ts.add(r(t));
    for (const m of momentosNoPronto(p.abertura)) {
      ts.add(r(m.de + 0.25));
      ts.add(r((m.de + m.ate) / 2));
    }
  }
  p.plano.cenas.forEach((c, i) => {
    const insercao = c.layout !== "narrador-cheio" || c.elementos.length > 0;
    if (!insercao && !(p.soCenas ?? []).includes(i)) return;
    const { inicio, fim } = intervaloDaCena(c, p.palavras, p.duracao);
    // 0,45 s depois da troca: antes disso o quadro ainda é o flash branco da transição.
    ts.add(r(p.deslocamento + inicio + 0.45));
    ts.add(r(p.deslocamento + (inicio + fim) / 2));
    ts.add(r(p.deslocamento + Math.max(inicio + 0.2, fim - 0.2)));
  });
  return [...ts].filter((t) => t < total - 0.05).sort((a, b) => a - b);
}

/** O rótulo de cada quadro: o que o plano pôs ali e a fala daquele trecho. */
function rotulo(k: number, t: number, p: { plano: PlanoDeMontagem; palavras: PalavraNoCorte[]; duracao: number; abertura?: MomentoNaTela[] | null; deslocamento: number }): string {
  const fala = (de: number, ate: number) =>
    p.palavras
      .filter((w) => w.fim > de && w.inicio < ate)
      .map((w) => w.texto)
      .join(" ")
      .slice(0, 160);
  if (t < p.deslocamento) {
    const m = momentosNoPronto(p.abertura).find((x) => t >= x.de && t < x.ate);
    const mo = m ? p.abertura![m.k] : null;
    return `Quadro ${k} (${mmss(t)}) | ABERTURA, momento ${m ? m.k + 1 : "?"}${mo ? `: fala "${fala(mo.inicio, mo.fim)}"; texto de soco "${mo.soco}"` : ""}`;
  }
  const tb = t - p.deslocamento;
  const i = cenaNoInstante(p.plano, p.palavras, p.duracao, tb);
  const c = p.plano.cenas[i];
  const oQue = !c
    ? "?"
    : c.layout === "narrador-cheio" && !c.elementos.length
      ? "a pessoa (gravação, sem nada por cima)"
      : `${c.layout}${c.asset ? `, imagem gerada: ${p.plano.assets.find((a) => a.id === c.asset)?.resumo ?? p.plano.assets.find((a) => a.id === c.asset)?.descricao.slice(0, 80) ?? c.asset}` : ""}${c.elementos.length ? `, texto/elemento: ${c.elementos.map((e) => ("texto" in e ? `"${e.texto}"` : e.tipo)).join(", ")}` : ""}`;
  return `Quadro ${k} (${mmss(t)}) | cena ${i + 1}: ${oQue} | fala em volta: "${fala(tb - 1.5, tb + 1.5)}"`;
}

const SISTEMA = `Você é o editor-chefe que confere um vídeo vertical JÁ RENDERIZADO, quadro a quadro, antes de ele ir ao ar no canal do cliente. Cada quadro vem com um rótulo: o tempo, o que a edição pôs ali e a fala daquele trecho.

Aponte SÓ defeitos objetivos, que qualquer editor profissional reprovaria:
- "cobertura-em-demonstracao": uma imagem gerada, cartela ou texto grande COBRE o que a pessoa está mostrando ou apontando na gravação (a fala diz "olha", "ali", "aqui", "vou mostrar", "está vendo", e a inserção esconde o lugar ou o objeto real). Imagem que ilustra uma ideia abstrata enquanto a pessoa só fala NÃO é defeito.
- "tela-vazia": quadro preto, cinza ou de uma cor só, sem pessoa e sem conteúdo legível (uma palavra miúda num fundo liso também conta).
- "texto-cortado": texto na tela cortado pela borda, saindo do quadro, sobreposto a outro texto, ou ilegível.
- "imagem-inadequada": imagem gerada com pessoa de roupa de banho, biquíni, roupa íntima, peito à mostra, pose sensual, ou algo que destoa de um canal cristão de negócios; ou imagem deformada, quebrada, com texto ou rosto gerado.
- "legenda-no-rosto": legenda ou texto tapando o rosto da pessoa.
NÃO aponte: gosto, cor, enquadramento da gravação original, quadro de transição (flash branco curto), movimento de câmera, ou a pessoa piscando.

Seja rigoroso e econômico: na dúvida, não aponte. Sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"defeitos":[{"k":3,"tipo":"tela-vazia","descricao":"curto, em português"}]}`;

const POR_CHAMADA = 30;

/** A frase da abertura que não começa ou não termina em fronteira de frase (código, não visão). */
export function frasesCortadasNaAbertura(abertura: MomentoNaTela[] | null | undefined, palavras: PalavraNoCorte[]): Array<{ k: number; frase: string }> {
  const saida: Array<{ k: number; frase: string }> = [];
  (abertura ?? []).forEach((m, k) => {
    const dentro = palavras.map((w, i) => ({ w, i })).filter(({ w }) => w.inicio >= m.inicio - 0.05 && w.fim <= m.fim + 0.05);
    if (!dentro.length) return;
    const de = dentro[0].i;
    const ate = dentro[dentro.length - 1].i;
    // A muleta solta que o ajuste tirou na entrada ("Então,") conta como começo de frase.
    let j = de;
    while (j > 0 && !abreFrase(palavras, j) && /^(entao|ne|e|ai|bom|olha|tipo|assim),?$/i.test(palavras[j - 1].texto.normalize("NFD").replace(/[̀-ͯ]/g, ""))) j--;
    if (!abreFrase(palavras, j) || !fechaFraseNaFala(palavras, ate)) saida.push({ k, frase: dentro.map((x) => x.w.texto).join(" ") });
  });
  return saida;
}

/**
 * Revisa o vídeo pronto. Devolve os defeitos com o conserto de cada um. A
 * visão falhando, devolve `erro` e os defeitos achados em código.
 */
export async function revisarVideoPronto(p: {
  obterQuadros: ObterQuadros;
  plano: PlanoDeMontagem;
  palavras: PalavraNoCorte[];
  duracao: number;
  abertura?: MomentoNaTela[] | null;
  deslocamento: number;
  projectId?: string | null;
  soCenas?: number[] | null;
  passoSeg?: number;
}): Promise<{ defeitos: DefeitoVisual[]; quadros: number; erro?: string | null }> {
  const defeitos: DefeitoVisual[] = [];
  for (const f of frasesCortadasNaAbertura(p.abertura, p.palavras)) {
    defeitos.push({ t: momentosNoPronto(p.abertura)[f.k]?.de ?? 0, tipo: "frase-cortada", descricao: `abertura, momento ${f.k + 1}: "${f.frase}"`, cena: null, momento: f.k, conserto: "tirar-momento" });
  }
  const instantes = instantesDaRevisao(p);
  let erro: string | null = null;
  let quadros: Array<{ t: number; base64: string }> = [];
  try {
    quadros = await p.obterQuadros(instantes);
    for (let i = 0; i < quadros.length; i += POR_CHAMADA) {
      const lote = quadros.slice(i, i + POR_CHAMADA);
      const resposta = await askClaudeComImagens(
        SISTEMA,
        `Confira os ${lote.length} quadros acima (k de 0 a ${lote.length - 1}). Devolva a lista vazia se não houver defeito.`,
        lote.map((q, k) => ({ base64: q.base64, rotulo: rotulo(k, q.t, p) })),
        { effort: "low", maxTokens: 4000, timeoutMs: 150_000, usage: { projectId: p.projectId ?? undefined, operation: "montagem-revisao-visual" } }
      );
      const dados = extrairJson(resposta) as { defeitos?: Array<{ k?: number; tipo?: string; descricao?: string }> };
      for (const d of dados.defeitos ?? []) {
        const q = typeof d.k === "number" ? lote[d.k] : undefined;
        if (!q) continue;
        const tipo = (["cobertura-em-demonstracao", "tela-vazia", "texto-cortado", "imagem-inadequada", "legenda-no-rosto"] as const).find((x) => x === d.tipo);
        if (!tipo) continue;
        defeitos.push(defeitoNoTempo(q.t, tipo, String(d.descricao ?? "").slice(0, 200), p));
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
  }
  return { defeitos, quadros: quadros.length, erro };
}

/** O defeito no tempo do pronto vira a cena (ou o momento da abertura) e o conserto. */
export function defeitoNoTempo(t: number, tipo: TipoDeDefeito, descricao: string, p: { plano: PlanoDeMontagem; palavras: PalavraNoCorte[]; duracao: number; abertura?: MomentoNaTela[] | null; deslocamento: number }): DefeitoVisual {
  if (t < p.deslocamento) {
    const m = momentosNoPronto(p.abertura).find((x) => t >= x.de && t < x.ate);
    return { t, tipo, descricao, cena: null, momento: m?.k ?? null, conserto: m ? "tirar-momento" : "nenhum" };
  }
  const i = cenaNoInstante(p.plano, p.palavras, p.duracao, t - p.deslocamento);
  const c = p.plano.cenas[i];
  const insercao = c && (c.layout !== "narrador-cheio" || c.elementos.length > 0);
  return { t, tipo, descricao, cena: i >= 0 ? i : null, conserto: insercao ? "cena-para-pessoa" : "nenhum" };
}

/** O que consertar: cenas que voltam à pessoa e momentos que saem da abertura. */
export function consertosDaRevisao(defeitos: DefeitoVisual[]): { cenas: number[]; momentos: number[]; semConserto: DefeitoVisual[] } {
  const cenas = [...new Set(defeitos.filter((d) => d.conserto === "cena-para-pessoa" && d.cena !== null).map((d) => d.cena!))].sort((a, b) => a - b);
  const momentos = [...new Set(defeitos.filter((d) => d.conserto === "tirar-momento" && typeof d.momento === "number").map((d) => d.momento!))].sort((a, b) => a - b);
  return { cenas, momentos, semConserto: defeitos.filter((d) => d.conserto === "nenhum") };
}
