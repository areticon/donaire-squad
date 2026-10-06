import { prisma } from "@/lib/db/prisma";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";

/**
 * A LEITURA DO VÍDEO ANTES DO PLANO (06/10/2026).
 *
 * Regra do Bruno (06/10, 01h): "a IA deve identificar o que é, o que está
 * sendo dito, qual o cenário e gerar os prompts para o Remotion e a Higgsfield
 * de forma precisa; sem tentar adivinhar o que o usuário quer, de pastor a
 * médico; não é inteligente se preparar só para uma pessoa falando: é se
 * preparar para qualquer vídeo."
 *
 * Até aqui o editor só sabia câmera x tela (trechosDeCamera) e a caixa de UM
 * rosto medida num quadro só; o plano nascia só da transcrição e do comando.
 * Agora todo completo (e os cortes dele) ganha uma LEITURA: gênero, cenário,
 * quem está em cena e onde, tela e quadro (que a peça nunca pode tapar), o
 * que acontece e do que se fala, trecho a trecho, e as áreas livres.
 *
 * ## Duas camadas, as duas obrigatórias
 *
 * 1. MEDIÇÃO no worker, sem IA paga (worker/src/leitura.py): por amostra
 *    (quadro-chave a cada 2 s, ou 1 fps), pessoas (corpo e rosto, boca),
 *    tela, quadro e movimento. Aqui ela é resumida em trechos de 10 a 60 s,
 *    com identidades por posição (p1, p2... da esquerda para a direita).
 * 2. VISÃO por trechos, com o Gemini lendo um proxy leve do vídeo (360p,
 *    1 fps, áudio) e a transcrição com tempos: gênero, cenário, pessoas (sem
 *    inventar nome), e por trecho "acontece", "mostra", "falaDe".
 *
 * A VISÃO NÃO DECIDE EDIÇÃO: ela descreve. Quem decide continua sendo o JEV
 * (regra do Bruno: Claude e companhia só escrevem; o JEV decide).
 *
 * ## Onde fica
 *
 * `video_jobs.completoMontagem.leitura`, gravada pelo passo `preparar` da
 * montagem do completo antes de "dirigindo" (lib/media/montagem-do-completo.ts).
 * Os cortes do mesmo vídeo leem pela `leituraGravada(videoJobId)` e recortam
 * com `leituraNoIntervalo`. Falha de leitura nunca derruba a montagem: a
 * leitura sai só da medição (gênero "outro", confiança baixa) ou nem isso, e
 * o aviso vai para `sobMedida.avisos`.
 *
 * Interruptores: LEITURA_VISAO=0 desliga a visão (a medição roda sempre);
 * LEITURA_VISAO_MODELO troca o modelo (padrão gemini-2.5-flash, o mais barato
 * que lê vídeo com áudio e responde JSON com esquema).
 */

// ─────────────────────────────── o contrato ───────────────────────────────

export type CaixaNoQuadro = { x: number; y: number; w: number; h: number }; // fração do quadro, 0 a 1
export type PessoaLida = { id: string; nome?: string | null; papel?: string | null; descricao: string }; // "homem de camiseta preta, à esquerda"
export type TrechoLido = {
  de: number;
  ate: number; // segundos
  pessoasEmCena: Array<{ id: string; caixa: CaixaNoQuadro; rosto?: CaixaNoQuadro | null; falando?: boolean }>; // medido por quadro e resumido por trecho
  tela?: CaixaNoQuadro | null; // tela compartilhada / slide
  quadro?: CaixaNoQuadro | null; // lousa, quadro branco, flipchart (NUNCA cobrir)
  movimento: "parado" | "pouco" | "muito";
  acontece: string; // o que acontece na imagem, uma linha, em português
  mostra: string[]; // objetos/coisas relevantes em cena (panela, slide, livro, gráfico...)
  falaDe: string; // do que a fala trata neste trecho, uma linha
  areaLivre: CaixaNoQuadro[]; // regiões onde uma peça pode entrar sem tapar pessoa, tela ou quadro
  /**
   * OS PONTOS DA TELA OU DO QUADRO QUE A FALA APONTA (06/10, tarde): a linha
   * do código, a célula, o desenho, o tópico do slide de que a fala trata,
   * com o segundo em que ela trata e a caixa no quadro inteiro (sempre dentro
   * da tela ou do quadro do trecho). A visão descreve; o zoom no ponto mira
   * aqui em vez da tela inteira. Ausente em leitura antiga ou sem visão.
   */
  pontos?: PontoLido[];
};
export type PontoLido = { t: number; caixa: CaixaNoQuadro; oQue: string };
export type GeneroDoVideo = "pessoa-falando" | "apresentacao-com-quadro" | "conversa" | "podcast" | "palestra" | "tela" | "vlog" | "demonstracao" | "outro";
export type LeituraDoVideo = {
  versao: 1;
  genero: GeneroDoVideo;
  generoConfianca: number;
  cenario: string; // "escritório com estante azul e prateleira de madeira"
  formato: "16:9" | "9:16" | "1:1";
  pessoas: PessoaLida[];
  trechos: TrechoLido[]; // cobrindo o vídeo inteiro, trechos de 10 a 60 s
  resumo: string; // o vídeo em 2 ou 3 linhas (imagem + fala)
  fontes: { medicao: boolean; visao: string | null }; // visao = modelo usado
  custoUsd: number;
};

export const GENEROS: readonly GeneroDoVideo[] = ["pessoa-falando", "apresentacao-com-quadro", "conversa", "podcast", "palestra", "tela", "vlog", "demonstracao", "outro"];

// ─────────────────────────────── a medida crua (worker) ───────────────────────────────

/** Uma amostra do worker (leitura.py). Caixas como [x, y, w, h] em fração. */
export type AmostraMedida = {
  t: number;
  mov: number;
  luz: number;
  pessoas: Array<{ caixa: number[]; rosto: number[] | null; boca: number | null }>;
  tela: number[] | null;
  quadro: number[] | null;
};
export type MedidaDoWorker = {
  ok: true;
  largura: number;
  altura: number;
  fps: number;
  duracao: number;
  modo: "chave" | "fps1";
  amostras: AmostraMedida[];
  tempos?: Record<string, number>;
};
export type RespostaDaMedicao = {
  medida: MedidaDoWorker | null;
  proxyUrl: string | null;
  cadencia?: number;
  modo?: string;
  erros?: string[];
  tempos?: Record<string, number>;
};

export type FalaLida = { palavras: PalavraNoCorte[]; duracao: number };

/** Trecho mínimo e máximo (contrato: 10 a 60 s). */
export const TRECHO_MIN_SEG = 10;
export const TRECHO_MAX_SEG = 60;

// ─────────────────────────────── interruptores e preço ───────────────────────────────

export function leituraVisaoLigada(): boolean {
  return process.env.LEITURA_VISAO !== "0" && Boolean(process.env.GEMINI_API_KEY);
}

export function modeloDaVisao(): string {
  return process.env.LEITURA_VISAO_MODELO ?? "gemini-2.5-flash";
}

/**
 * Preço por milhão de tokens (entrada com vídeo e áudio / saída), da tabela
 * pública do Gemini em 06/10/2026. Modelo fora da tabela cobra como o
 * 2.5 Flash e deixa aviso no log: o custo nunca sai zerado por engano.
 */
const PRECO_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 },
  "gemini-2.5-flash-lite": { entrada: 0.1, saida: 0.4 },
  "gemini-flash-latest": { entrada: 0.3, saida: 2.5 },
  "gemini-flash-lite-latest": { entrada: 0.1, saida: 0.4 },
};

export function custoDaVisao(modelo: string, entrada: number, saida: number): number {
  const p = PRECO_POR_MILHAO[modelo];
  if (!p) console.warn(`[leitura-do-video] modelo ${modelo} sem preço na tabela; cobrado como gemini-2.5-flash`);
  const preco = p ?? PRECO_POR_MILHAO["gemini-2.5-flash"];
  return (entrada * preco.entrada + saida * preco.saida) / 1_000_000;
}

// ─────────────────────────────── 1. a medição no worker ───────────────────────────────

function urlDoWorker(): string {
  const w = (process.env.VIDEO_WORKER_URL ?? "").replace(/\/$/, "");
  if (!w) throw new Error("VIDEO_WORKER_URL não configurado");
  return w;
}

/**
 * POST /ler-video no worker: baixa (ou reaproveita) o original, mede por
 * amostra em Python e, com `proxy`, gera e sobe o proxy leve para a visão.
 * Síncrona; o prazo acompanha o do worker (10 min no teto).
 */
export async function medirNoWorker(sourceUrl: string, opcoes: { proxy?: boolean; ate?: number | null } = {}): Promise<RespostaDaMedicao> {
  const corpo = JSON.stringify({ sourceUrl, proxy: opcoes.proxy !== false, ate: opcoes.ate ?? null });
  const r = await fetch(`${urlDoWorker()}/ler-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(corpo) },
    body: corpo,
    signal: AbortSignal.timeout(620_000),
  });
  if (!r.ok) throw new Error(`worker recusou a leitura (HTTP ${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return (await r.json()) as RespostaDaMedicao;
}

// ─────────────────────────────── 2. o resumo em trechos (puro) ───────────────────────────────

const caixa = (v: number[] | null | undefined): CaixaNoQuadro | null =>
  v && v.length === 4 && v.every((n) => Number.isFinite(n)) ? { x: v[0], y: v[1], w: v[2], h: v[3] } : null;

const arred = (n: number) => Math.round(n * 1000) / 1000;

function quantil(valores: number[], q: number): number {
  if (!valores.length) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)));
  return s[i];
}

/** A caixa que cobre a pessoa (ou a tela) durante o trecho: envelope dos quantis 15 e 85 de cada borda. */
function envelope(caixas: CaixaNoQuadro[]): CaixaNoQuadro {
  const x0 = quantil(caixas.map((c) => c.x), 0.15);
  const y0 = quantil(caixas.map((c) => c.y), 0.15);
  const x1 = quantil(caixas.map((c) => c.x + c.w), 0.85);
  const y1 = quantil(caixas.map((c) => c.y + c.h), 0.85);
  return { x: arred(x0), y: arred(y0), w: arred(Math.max(0.01, x1 - x0)), h: arred(Math.max(0.01, y1 - y0)) };
}

export function formatoDaMedida(largura: number, altura: number): LeituraDoVideo["formato"] {
  if (!largura || !altura) return "16:9";
  const r = largura / altura;
  if (Math.abs(r - 1) < 0.06) return "1:1";
  return altura > largura ? "9:16" : "16:9";
}

type PessoaNaAmostra = { id: string; caixa: CaixaNoQuadro; rosto: CaixaNoQuadro | null; boca: number | null };
type AmostraComIds = { t: number; mov: number; pessoas: PessoaNaAmostra[]; tela: CaixaNoQuadro | null; quadro: CaixaNoQuadro | null };

/**
 * IDENTIDADES POR POSIÇÃO. A medição não reconhece rosto (nem deve): quem
 * está à esquerda numa amostra é a mesma pessoa que está à esquerda na
 * seguinte, salvo troca de lugar, que a visão descreve. K = quantas pessoas o
 * vídeo tem "normalmente" (a contagem mais frequente, nunca menos que o que
 * aparece em pelo menos um quinto das amostras); os lugares são os centros
 * ordenados; cada pessoa de cada amostra vai para o lugar mais perto.
 */
export function identificarPessoas(amostras: AmostraMedida[]): { amostras: AmostraComIds[]; lugares: Array<{ id: string; centro: number; tamanho: number; presencas: number }> } {
  const contagens = new Map<number, number>();
  for (const a of amostras) contagens.set(a.pessoas.length, (contagens.get(a.pessoas.length) ?? 0) + 1);
  let K = 0;
  let maisFrequente = -1;
  for (const [n, c] of contagens) if (c > maisFrequente || (c === maisFrequente && n > K)) [K, maisFrequente] = [n, c];
  for (const [n, c] of contagens) if (n > K && c >= amostras.length / 5) K = n;
  const lugares: Array<{ id: string; centro: number; tamanho: number; presencas: number; soma: number }> = [];
  // Sementes: a primeira amostra com K pessoas, da esquerda para a direita.
  const semente = amostras.find((a) => a.pessoas.length === K) ?? amostras.find((a) => a.pessoas.length > 0);
  if (semente) {
    const ordenadas = [...semente.pessoas].sort((a, b) => a.caixa[0] + a.caixa[2] / 2 - (b.caixa[0] + b.caixa[2] / 2));
    for (const p of ordenadas) lugares.push({ id: `p${lugares.length + 1}`, centro: p.caixa[0] + p.caixa[2] / 2, tamanho: p.caixa[3], presencas: 0, soma: 0 });
  }
  const saida: AmostraComIds[] = amostras.map((a) => {
    const usados = new Set<number>();
    const pessoas: PessoaNaAmostra[] = [];
    const ordenadas = [...a.pessoas].sort((p, q) => q.caixa[2] * q.caixa[3] - p.caixa[2] * p.caixa[3]);
    for (const p of ordenadas) {
      const cx = p.caixa[0] + p.caixa[2] / 2;
      let melhor = -1;
      let dist = Infinity;
      lugares.forEach((l, i) => {
        if (usados.has(i)) return;
        const d = Math.abs(l.centro - cx) + 0.3 * Math.abs(l.tamanho - p.caixa[3]);
        if (d < dist) [melhor, dist] = [i, d];
      });
      if (melhor < 0 || dist > 0.35) {
        lugares.push({ id: `p${lugares.length + 1}`, centro: cx, tamanho: p.caixa[3], presencas: 0, soma: 0 });
        melhor = lugares.length - 1;
      }
      usados.add(melhor);
      const l = lugares[melhor];
      l.presencas++;
      l.soma += cx;
      l.centro = l.soma / l.presencas;
      pessoas.push({ id: l.id, caixa: caixa(p.caixa)!, rosto: caixa(p.rosto), boca: p.boca });
    }
    return { t: a.t, mov: a.mov, pessoas, tela: caixa(a.tela), quadro: caixa(a.quadro) };
  });
  return { amostras: saida, lugares: lugares.map(({ id, centro, tamanho, presencas }) => ({ id, centro: arred(centro), tamanho: arred(tamanho), presencas })) };
}

function posicaoEmTexto(centro: number): string {
  return centro < 0.38 ? "à esquerda" : centro > 0.62 ? "à direita" : "ao centro";
}

/** A pausa da fala mais perto de `alvo` (entre `de` e `ate`), para cortar trecho onde a frase respira. */
function pausaPerto(palavras: PalavraNoCorte[], alvo: number, de: number, ate: number): number {
  let melhor = alvo;
  let nota = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const p = palavras[i - 1];
    const q = palavras[i];
    if (q.inicio <= de || q.inicio >= ate) continue;
    const pausa = q.inicio - p.fim;
    const pontua = /[.!?;:]$/.test(p.texto);
    const custo = Math.abs(q.inicio - alvo) - 6 * Math.min(pausa, 1.5) - (pontua ? 3 : 0);
    if (custo < nota) [melhor, nota] = [q.inicio, custo];
  }
  return melhor;
}

/**
 * OS TRECHOS: começa um novo quando a cena muda de verdade (quantidade de
 * pessoas, tela ou quadro aparecendo ou sumindo, por três amostras seguidas),
 * nunca com menos de 10 s (o curto é engolido pelo vizinho) nem com mais de
 * 60 s (o longo é partido na pausa da fala mais perto do meio).
 */
export function dividirEmTrechos(amostras: AmostraComIds[], duracao: number, palavras: PalavraNoCorte[]): Array<{ de: number; ate: number }> {
  const assinatura = (a: AmostraComIds) => `${Math.min(a.pessoas.length, 6)}|${a.tela ? 1 : 0}|${a.quadro ? 1 : 0}`;
  const cortes: number[] = [0];
  if (amostras.length) {
    let atual = assinatura(amostras[0]);
    let candidata: string | null = null;
    let desde = 0;
    for (let i = 1; i < amostras.length; i++) {
      const s = assinatura(amostras[i]);
      if (s === atual) {
        candidata = null;
        continue;
      }
      if (s !== candidata) [candidata, desde] = [s, i];
      if (i - desde >= 2) {
        cortes.push(amostras[desde].t);
        atual = s;
        candidata = null;
      }
    }
  }
  cortes.push(duracao);
  // Engole o curto no vizinho anterior (ou no seguinte, se for o primeiro).
  let limites = [...new Set(cortes)].sort((a, b) => a - b);
  let mudou = true;
  while (mudou && limites.length > 2) {
    mudou = false;
    for (let i = 1; i < limites.length - 1; i++) {
      const antes = limites[i] - limites[i - 1];
      const depois = limites[i + 1] - limites[i];
      if (antes < TRECHO_MIN_SEG || depois < TRECHO_MIN_SEG) {
        limites.splice(i, 1);
        mudou = true;
        break;
      }
    }
  }
  if (limites.length === 2 && duracao < TRECHO_MIN_SEG) return [{ de: 0, ate: arred(duracao) }];
  // Parte o longo na pausa mais perto do meio.
  const saida: Array<{ de: number; ate: number }> = [];
  for (let i = 0; i < limites.length - 1; i++) {
    let de = limites[i];
    const fim = limites[i + 1];
    while (fim - de > TRECHO_MAX_SEG) {
      const partes = Math.ceil((fim - de) / TRECHO_MAX_SEG);
      const alvo = de + (fim - de) / partes;
      let corte = pausaPerto(palavras, alvo, de + TRECHO_MIN_SEG, fim - TRECHO_MIN_SEG);
      if (!(corte > de + TRECHO_MIN_SEG && corte < fim - TRECHO_MIN_SEG)) corte = alvo;
      saida.push({ de: arred(de), ate: arred(corte) });
      de = corte;
    }
    saida.push({ de: arred(de), ate: arred(fim) });
  }
  return saida.filter((t) => t.ate > t.de);
}

/** Os limiares do movimento, por segundo (cinza 32x18, diferença média entre amostras). Medido em 06/10 no Fé & Gestão: pessoa falando sentada dá 2,5 a 6 por segundo. */
export function movimentoEmTexto(movPorSegundo: number): TrechoLido["movimento"] {
  return movPorSegundo < 2 ? "parado" : movPorSegundo < 7 ? "pouco" : "muito";
}

const GRADE = 12;

/**
 * AS ÁREAS LIVRES: a grade 12x12 marca o que está ocupado (pessoas com folga
 * de 2%, tela e quadro) e os maiores retângulos vazios saem um a um (até
 * quatro), com pelo menos 15% da largura e 12% da altura. É geometria; o que
 * entra ali é decisão de quem monta.
 */
export function areasLivres(ocupadas: CaixaNoQuadro[], formato: LeituraDoVideo["formato"]): CaixaNoQuadro[] {
  const grade: boolean[][] = Array.from({ length: GRADE }, () => Array(GRADE).fill(false));
  const marcar = (c: CaixaNoQuadro, folga: number) => {
    const c0 = Math.max(0, Math.floor((c.x - folga) * GRADE));
    const c1 = Math.min(GRADE - 1, Math.ceil((c.x + c.w + folga) * GRADE) - 1);
    const r0 = Math.max(0, Math.floor((c.y - folga) * GRADE));
    const r1 = Math.min(GRADE - 1, Math.ceil((c.y + c.h + folga) * GRADE) - 1);
    for (let r = r0; r <= r1; r++) for (let k = c0; k <= c1; k++) grade[r][k] = true;
  };
  for (const c of ocupadas) marcar(c, 0.02);
  const minCol = Math.max(2, Math.round(0.15 * GRADE));
  const minLin = Math.max(2, Math.round((formato === "9:16" ? 0.08 : 0.12) * GRADE));
  const saida: CaixaNoQuadro[] = [];
  for (let vez = 0; vez < 4; vez++) {
    // Maior retângulo vazio (histograma por linha).
    const alturas = Array(GRADE).fill(0);
    let melhor: { r0: number; c0: number; nr: number; nc: number; area: number } | null = null;
    for (let r = 0; r < GRADE; r++) {
      for (let k = 0; k < GRADE; k++) alturas[k] = grade[r][k] ? 0 : alturas[k] + 1;
      const pilha: Array<[number, number]> = [];
      for (let k = 0; k <= GRADE; k++) {
        const h = k < GRADE ? alturas[k] : 0;
        let inicio = k;
        while (pilha.length && pilha[pilha.length - 1][1] >= h) {
          const [i0, h0] = pilha.pop()!;
          const area = h0 * (k - i0);
          if (h0 >= minLin && k - i0 >= minCol && (!melhor || area > melhor.area)) melhor = { r0: r - h0 + 1, c0: i0, nr: h0, nc: k - i0, area };
          inicio = i0;
        }
        pilha.push([inicio, h]);
      }
    }
    if (!melhor) break;
    saida.push({ x: arred(melhor.c0 / GRADE), y: arred(melhor.r0 / GRADE), w: arred(melhor.nc / GRADE), h: arred(melhor.nr / GRADE) });
    for (let r = melhor.r0; r < melhor.r0 + melhor.nr; r++) for (let k = melhor.c0; k < melhor.c0 + melhor.nc; k++) grade[r][k] = true;
  }
  return saida;
}

function falaNoTrecho(palavras: PalavraNoCorte[], de: number, ate: number): string {
  return palavras
    .filter((p) => p.inicio >= de - 0.2 && p.inicio < ate)
    .map((p) => p.texto)
    .join(" ")
    .trim();
}

function primeirasPalavras(texto: string, n = 14): string {
  const partes = texto.split(/\s+/).filter(Boolean);
  return partes.length > n ? `${partes.slice(0, n).join(" ")}...` : partes.join(" ");
}

export type ResumoDaMedicao = {
  formato: LeituraDoVideo["formato"];
  pessoas: PessoaLida[];
  trechos: TrechoLido[];
  /** O que a medição viu no vídeo inteiro, para a visão e para o resumo. */
  visaoGeral: { pessoasTipicas: number; comTela: number; comQuadro: number; amostras: number };
};

/**
 * A MEDIÇÃO RESUMIDA EM TRECHOS (puro, sem IA). Cada trecho junta as amostras
 * dele: pessoa presente em pelo menos 40% das amostras entra com a caixa
 * envelope; tela e quadro presentes em pelo menos metade entram; quem fala é
 * quem mais mexe a boca (desvio do jawOpen), e com uma pessoa só é ela quando
 * há fala transcrita no trecho.
 */
export function resumirMedida(medida: MedidaDoWorker, fala: FalaLida | null): ResumoDaMedicao {
  const formato = formatoDaMedida(medida.largura, medida.altura);
  const palavras = fala?.palavras ?? [];
  const duracao = medida.duracao || fala?.duracao || (medida.amostras.at(-1)?.t ?? 0);
  const { amostras, lugares } = identificarPessoas(medida.amostras);
  const pessoas: PessoaLida[] = lugares
    .filter((l) => l.presencas >= Math.max(2, amostras.length * 0.1))
    .map((l) => ({ id: l.id, nome: null, papel: null, descricao: `pessoa ${posicaoEmTexto(l.centro)}${l.tamanho > 0.7 ? ", em plano fechado" : l.tamanho < 0.35 ? ", longe da câmera" : ""}` }));
  const idsValidos = new Set(pessoas.map((p) => p.id));
  const limites = dividirEmTrechos(amostras, duracao, palavras);
  let comTela = 0;
  let comQuadro = 0;
  const trechos: TrechoLido[] = limites.map((lim) => {
    const dentro = amostras.filter((a) => a.t >= lim.de - 0.01 && a.t < lim.ate);
    const n = Math.max(1, dentro.length);
    const porPessoa = new Map<string, { caixas: CaixaNoQuadro[]; rostos: CaixaNoQuadro[]; bocas: number[] }>();
    for (const a of dentro)
      for (const p of a.pessoas) {
        if (!idsValidos.has(p.id)) continue;
        const e = porPessoa.get(p.id) ?? { caixas: [], rostos: [], bocas: [] };
        e.caixas.push(p.caixa);
        if (p.rosto) e.rostos.push(p.rosto);
        if (typeof p.boca === "number") e.bocas.push(p.boca);
        porPessoa.set(p.id, e);
      }
    const desvio = (v: number[]) => {
      if (v.length < 3) return 0;
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
    };
    const falaAqui = falaNoTrecho(palavras, lim.de, lim.ate);
    const candidatas = [...porPessoa.entries()].filter(([, e]) => e.caixas.length >= 0.4 * n);
    const desvios = new Map(candidatas.map(([id, e]) => [id, desvio(e.bocas)]));
    const maior = Math.max(0, ...desvios.values());
    const pessoasEmCena = candidatas.map(([id, e]) => {
      const d = desvios.get(id) ?? 0;
      const falando = candidatas.length === 1 ? falaAqui.length > 0 : d >= 0.04 && d >= 0.6 * maior;
      return { id, caixa: envelope(e.caixas), rosto: e.rostos.length ? envelope(e.rostos) : null, falando };
    });
    const telas = dentro.map((a) => a.tela).filter((c): c is CaixaNoQuadro => Boolean(c));
    const quadros = dentro.map((a) => a.quadro).filter((c): c is CaixaNoQuadro => Boolean(c));
    const tela = telas.length >= 0.5 * n ? envelope(telas) : null;
    const quadro = quadros.length >= 0.5 * n ? envelope(quadros) : null;
    if (tela) comTela++;
    if (quadro) comQuadro++;
    const movs: number[] = [];
    for (let i = 1; i < dentro.length; i++) {
      const dt = dentro[i].t - dentro[i - 1].t;
      if (dt > 0) movs.push(dentro[i].mov / dt);
    }
    const movPorSeg = movs.length ? movs.reduce((s, x) => s + x, 0) / movs.length : 0;
    const partes: string[] = [];
    partes.push(pessoasEmCena.length === 0 ? "ninguém em cena" : pessoasEmCena.length === 1 ? "uma pessoa em cena" : `${pessoasEmCena.length} pessoas em cena`);
    if (tela) partes.push("tela compartilhada no quadro");
    if (quadro) partes.push("quadro escrito ao fundo");
    const mostra: string[] = [];
    if (tela) mostra.push("tela");
    if (quadro) mostra.push("quadro");
    return {
      de: lim.de,
      ate: lim.ate,
      pessoasEmCena,
      tela,
      quadro,
      movimento: movimentoEmTexto(movPorSeg),
      acontece: `${partes.join(", ")} (medição, sem visão)`,
      mostra,
      falaDe: falaAqui ? primeirasPalavras(falaAqui) : "sem fala transcrita neste trecho",
      areaLivre: areasLivres([...pessoasEmCena.map((p) => p.caixa), ...(tela ? [tela] : []), ...(quadro ? [quadro] : [])], formato),
    };
  });
  const contagens = new Map<number, number>();
  for (const a of amostras) contagens.set(a.pessoas.length, (contagens.get(a.pessoas.length) ?? 0) + 1);
  const pessoasTipicas = [...contagens.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return { formato, pessoas, trechos, visaoGeral: { pessoasTipicas, comTela, comQuadro, amostras: amostras.length } };
}

/**
 * SEM MEDIÇÃO (o worker falhou): trechos de até 45 s cortados nas pausas da
 * fala, sem pessoa, sem tela, sem quadro, com o quadro inteiro como área
 * livre menos o terço central (a pessoa costuma estar ali). É o mínimo para a
 * visão alinhar e para a montagem seguir.
 */
export function resumoSemMedida(duracao: number, formato: LeituraDoVideo["formato"], fala: FalaLida | null): ResumoDaMedicao {
  const palavras = fala?.palavras ?? [];
  const limites: Array<{ de: number; ate: number }> = [];
  let de = 0;
  while (duracao - de > 45) {
    let corte = pausaPerto(palavras, de + 40, de + TRECHO_MIN_SEG, de + TRECHO_MAX_SEG);
    if (!(corte > de + TRECHO_MIN_SEG)) corte = de + 40;
    limites.push({ de: arred(de), ate: arred(corte) });
    de = corte;
  }
  limites.push({ de: arred(de), ate: arred(duracao) });
  const centro: CaixaNoQuadro = formato === "9:16" ? { x: 0.15, y: 0.2, w: 0.7, h: 0.6 } : { x: 0.3, y: 0.15, w: 0.4, h: 0.85 };
  const trechos: TrechoLido[] = limites
    .filter((l) => l.ate > l.de)
    .map((l) => {
      const f = falaNoTrecho(palavras, l.de, l.ate);
      return {
        de: l.de,
        ate: l.ate,
        pessoasEmCena: [],
        tela: null,
        quadro: null,
        movimento: "pouco" as const,
        acontece: "sem medição da imagem",
        mostra: [],
        falaDe: f ? primeirasPalavras(f) : "sem fala transcrita neste trecho",
        areaLivre: areasLivres([centro], formato),
      };
    });
  return { formato, pessoas: [], trechos, visaoGeral: { pessoasTipicas: 0, comTela: 0, comQuadro: 0, amostras: 0 } };
}

// ─────────────────────────────── 3. a visão (Gemini lendo o vídeo) ───────────────────────────────

export type VisaoDoVideo = {
  modelo: string;
  genero: GeneroDoVideo;
  generoConfianca: number;
  cenario: string;
  pessoas: PessoaLida[];
  trechos: Array<{ i: number; acontece: string; mostra: string[]; falaDe: string; temTela: boolean; temQuadro: boolean; quemFala: string[]; pontos?: PontoLido[] }>;
  resumo: string;
  custoUsd: number;
  tokens: { entrada: number; saida: number };
};

const BASE = "https://generativelanguage.googleapis.com";

function chaveDoGemini(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY não configurada");
  return k;
}

/** Sobe um vídeo para a Files API do Gemini (resumable em um passo) e espera ficar ACTIVE. */
export async function subirParaOGemini(dados: Uint8Array, nome: string, mimeType = "video/mp4"): Promise<{ uri: string; name: string }> {
  const chave = chaveDoGemini();
  const inicio = await fetch(`${BASE}/upload/v1beta/files?key=${chave}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(dados.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: nome } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!inicio.ok) throw new Error(`Files API recusou o início do upload (HTTP ${inicio.status}): ${(await inicio.text().catch(() => "")).slice(0, 200)}`);
  const urlDoUpload = inicio.headers.get("x-goog-upload-url");
  if (!urlDoUpload) throw new Error("Files API não devolveu a URL do upload");
  const envio = await fetch(urlDoUpload, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": String(dados.byteLength) },
    body: dados as unknown as BodyInit,
    signal: AbortSignal.timeout(600_000),
  });
  if (!envio.ok) throw new Error(`Files API recusou o upload (HTTP ${envio.status}): ${(await envio.text().catch(() => "")).slice(0, 200)}`);
  const j = (await envio.json()) as { file?: { name?: string; uri?: string; state?: string } };
  const name = j.file?.name;
  const uri = j.file?.uri;
  if (!name || !uri) throw new Error("Files API não devolveu o arquivo");
  let estado = j.file?.state ?? "PROCESSING";
  const prazo = Date.now() + 240_000;
  while (estado === "PROCESSING" && Date.now() < prazo) {
    await new Promise((r) => setTimeout(r, 3_000));
    const s = await fetch(`${BASE}/v1beta/${name}?key=${chave}`, { signal: AbortSignal.timeout(30_000) });
    if (!s.ok) continue;
    estado = ((await s.json()) as { state?: string }).state ?? estado;
  }
  if (estado !== "ACTIVE") throw new Error(`o arquivo no Gemini ficou em ${estado}`);
  return { uri, name };
}

/** Apaga o arquivo da Files API (ele expiraria em 48 h; apagar é só limpeza). */
export async function apagarNoGemini(name: string): Promise<void> {
  await fetch(`${BASE}/v1beta/${name}?key=${chaveDoGemini()}`, { method: "DELETE", signal: AbortSignal.timeout(30_000) }).catch(() => null);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const ESQUEMA_DA_VISAO = {
  type: "OBJECT",
  properties: {
    genero: { type: "STRING", enum: [...GENEROS] },
    generoConfianca: { type: "NUMBER" },
    cenario: { type: "STRING" },
    pessoas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, descricao: { type: "STRING" }, nome: { type: "STRING", nullable: true }, papel: { type: "STRING", nullable: true } },
        required: ["id", "descricao"],
      },
    },
    trechos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          i: { type: "INTEGER" },
          acontece: { type: "STRING" },
          mostra: { type: "ARRAY", items: { type: "STRING" } },
          falaDe: { type: "STRING" },
          temTela: { type: "BOOLEAN" },
          temQuadro: { type: "BOOLEAN" },
          quemFala: { type: "ARRAY", items: { type: "STRING" } },
          pontos: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { segundo: { type: "NUMBER" }, x: { type: "NUMBER" }, y: { type: "NUMBER" }, w: { type: "NUMBER" }, h: { type: "NUMBER" }, oQue: { type: "STRING" } },
              required: ["segundo", "x", "y", "w", "h", "oQue"],
            },
          },
        },
        required: ["i", "acontece", "mostra", "falaDe", "temTela", "temQuadro", "quemFala"],
      },
    },
    resumo: { type: "STRING" },
  },
  required: ["genero", "generoConfianca", "cenario", "pessoas", "trechos", "resumo"],
};

function promptDaVisao(r: ResumoDaMedicao, fala: FalaLida | null, deslocamento: number, trechosDaJanela: Array<{ i: number; t: TrechoLido }>): string {
  const palavras = fala?.palavras ?? [];
  const pessoasMedidas = r.pessoas.length
    ? r.pessoas.map((p) => `${p.id}: ${p.descricao}`).join("; ")
    : "a medição não achou pessoa (pode ser gente longe, de costas, ou só tela)";
  const linhas = trechosDaJanela.map(({ i, t }) => {
    const f = falaNoTrecho(palavras, t.de, t.ate);
    const medido = [
      t.pessoasEmCena.length ? `${t.pessoasEmCena.length} pessoa(s): ${t.pessoasEmCena.map((p) => p.id).join(", ")}` : "0 pessoa medida",
      t.tela ? "tela medida" : null,
      t.quadro ? "quadro medido" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `Trecho ${i} (${mmss(t.de - deslocamento)} a ${mmss(t.ate - deslocamento)} do arquivo; medição: ${medido}). Fala: "${f ? f.slice(0, 700) : "(sem fala transcrita)"}"`;
  });
  return `Você está LENDO um vídeo de um criador de conteúdo brasileiro, para descrever o que ele é. Você descreve; você NÃO decide edição nenhuma.

O arquivo tem imagem a 1 quadro por segundo e áudio. Os tempos abaixo são do ARQUIVO.

Pessoas medidas em código pela posição (da esquerda para a direita): ${pessoasMedidas}. Use esses ids quando falar das pessoas; se vir alguém que a medição não achou, use "v1", "v2"...

REGRAS:
- Nunca invente nome: "nome" só se o nome for dito na fala ou aparecer escrito na tela; senão null. "papel" é o que a pessoa faz no vídeo (apresentador, convidado, aluno...), ou null.
- "genero": o que o vídeo É (uma pessoa falando para a câmera; apresentação com quadro ou lousa; conversa entre duas ou mais pessoas; podcast com microfones; palestra filmada de longe com plateia; tela compartilhada ou slides dominando; vlog com câmera na mão mostrando lugares; demonstração de algo com as mãos, cozinha, oficina, produto; outro). "generoConfianca" de 0 a 1.
- "cenario": o lugar e o que se vê nele, uma linha concreta (móveis, cores, objetos, luz).
- Por trecho: "acontece" é o que a IMAGEM mostra naquele trecho, uma linha de até 20 palavras (quem faz o quê, gesto, movimento, troca de plano); "mostra" lista objetos ou coisas relevantes visíveis (livro, slide, gráfico, panela, produto, quadro, tela...), vazia se nada; "falaDe" é do que a FALA trata ali, uma linha de até 25 palavras (use a transcrição); "temTela" se há tela compartilhada ou slide visível; "temQuadro" se há quadro branco, lousa ou flipchart visível; "quemFala" os ids de quem fala no trecho; "pontos" só quando há tela ou quadro: as regiões ESPECÍFICAS dele de que a fala trata (uma linha de código, uma célula, um tópico do slide, um desenho ou palavra no quadro), até 4 por trecho, cada uma com o "segundo" do arquivo em que a fala trata dela, a caixa em fração do quadro inteiro (x e y do canto de cima à esquerda, w e h, de 0 a 1) e "oQue" em até 8 palavras; vazia se a fala não aponta nada específico.
- Português do Brasil, frases diretas, sem travessão (use vírgula ou dois pontos).
- "resumo": o vídeo em 2 ou 3 linhas, imagem e fala.

TRECHOS:
${linhas.join("\n")}`;
}

/**
 * A VISÃO: o Gemini lê o proxy (upload na Files API) e devolve o JSON no
 * esquema fixo. Vídeos com mais de 30 min vão em janelas de 30 min (offset no
 * arquivo); o custo soma. `fonte` é a URL pública do proxy ou os bytes dele
 * (a prova local manda o arquivo).
 */
export async function verComGemini(
  fonte: { url?: string; bytes?: Uint8Array },
  resumo: ResumoDaMedicao,
  fala: FalaLida | null,
  ctx: { projectId?: string | null; modelo?: string; operation?: string }
): Promise<VisaoDoVideo> {
  const modelo = ctx.modelo ?? modeloDaVisao();
  let bytes = fonte.bytes;
  if (!bytes) {
    if (!fonte.url) throw new Error("visão sem fonte (url ou bytes)");
    const r = await fetch(fonte.url, { signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`proxy respondeu ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  const arquivo = await subirParaOGemini(bytes, `leitura-${Date.now()}.mp4`);
  const JANELA = 30 * 60;
  const total = resumo.trechos.at(-1)?.ate ?? 0;
  const janelas: Array<{ de: number; ate: number }> = [];
  for (let de = 0; de < Math.max(total, 1); de += JANELA) janelas.push({ de, ate: Math.min(total, de + JANELA) });
  const tokens = { entrada: 0, saida: 0 };
  const respostas: Array<Record<string, unknown>> = [];
  try {
    for (const j of janelas) {
      const dentro = resumo.trechos.map((t, i) => ({ i, t })).filter(({ t }) => t.de >= j.de - 0.01 && t.de < j.ate);
      if (!dentro.length) continue;
      const parteDoVideo: Record<string, unknown> = { fileData: { mimeType: "video/mp4", fileUri: arquivo.uri } };
      if (janelas.length > 1) parteDoVideo.videoMetadata = { startOffset: `${Math.floor(j.de)}s`, endOffset: `${Math.ceil(j.ate)}s` };
      const corpo = {
        contents: [{ role: "user", parts: [parteDoVideo, { text: promptDaVisao(resumo, fala, 0, dentro) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_DA_VISAO, temperature: 0.2, maxOutputTokens: 16384 },
      };
      let r = await fetch(`${BASE}/v1beta/models/${modelo}:generateContent?key=${chaveDoGemini()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(600_000),
      });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((x) => setTimeout(x, 4_000));
        r = await fetch(`${BASE}/v1beta/models/${modelo}:generateContent?key=${chaveDoGemini()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(600_000),
        });
      }
      if (!r.ok) throw new Error(`Gemini ${modelo} respondeu ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
      const j2 = (await r.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      tokens.entrada += j2.usageMetadata?.promptTokenCount ?? 0;
      tokens.saida += (j2.usageMetadata?.candidatesTokenCount ?? 0) + (j2.usageMetadata?.thoughtsTokenCount ?? 0);
      const texto = j2.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const ini = texto.indexOf("{");
      const fim = texto.lastIndexOf("}");
      if (ini < 0 || fim < 0) throw new Error(`Gemini não devolveu JSON (${j2.candidates?.[0]?.finishReason ?? "sem motivo"})`);
      respostas.push(JSON.parse(texto.slice(ini, fim + 1)) as Record<string, unknown>);
    }
  } finally {
    void apagarNoGemini(arquivo.name);
  }
  const custoUsd = custoDaVisao(modelo, tokens.entrada, tokens.saida);
  void gravarUsoDaVisao(modelo, tokens, custoUsd, ctx);
  // Junta as janelas: gênero e cenário da primeira (o vídeo é um só), trechos de todas.
  const primeira = respostas[0] ?? {};
  const generoCru = String(primeira.genero ?? "outro") as GeneroDoVideo;
  const pessoasVistas = new Map<string, PessoaLida>();
  const trechos: VisaoDoVideo["trechos"] = [];
  for (const resp of respostas) {
    for (const p of (resp.pessoas as Array<Record<string, unknown>> | undefined) ?? []) {
      const id = String(p.id ?? "").trim();
      if (!id || pessoasVistas.has(id)) continue;
      pessoasVistas.set(id, { id, descricao: String(p.descricao ?? "").slice(0, 160), nome: p.nome ? String(p.nome).slice(0, 80) : null, papel: p.papel ? String(p.papel).slice(0, 80) : null });
    }
    for (const t of (resp.trechos as Array<Record<string, unknown>> | undefined) ?? []) {
      const semPontoFinal = (s: unknown, n: number) => String(s ?? "").trim().replace(/[.\s]+$/, "").slice(0, n);
      trechos.push({
        i: Number(t.i),
        acontece: semPontoFinal(t.acontece, 240),
        mostra: Array.isArray(t.mostra) ? (t.mostra as unknown[]).map(String).slice(0, 8) : [],
        falaDe: semPontoFinal(t.falaDe, 300),
        temTela: Boolean(t.temTela),
        temQuadro: Boolean(t.temQuadro),
        quemFala: Array.isArray(t.quemFala) ? (t.quemFala as unknown[]).map(String) : [],
        pontos: pontosDaVisao(t.pontos),
      });
    }
  }
  return {
    modelo,
    genero: GENEROS.includes(generoCru) ? generoCru : "outro",
    generoConfianca: Math.max(0, Math.min(1, Number(primeira.generoConfianca ?? 0.5))),
    cenario: String(primeira.cenario ?? "").trim().replace(/[.\s]+$/, "").slice(0, 300),
    pessoas: [...pessoasVistas.values()],
    trechos,
    resumo: String(primeira.resumo ?? "").slice(0, 600),
    custoUsd,
    tokens,
  };
}

async function gravarUsoDaVisao(modelo: string, tokens: { entrada: number; saida: number }, custoUsd: number, ctx: { projectId?: string | null; operation?: string }): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        projectId: ctx.projectId ?? null,
        operation: ctx.operation ?? "leitura-do-video",
        model: modelo,
        inputTokens: tokens.entrada,
        outputTokens: tokens.saida,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        costUsd: custoUsd,
      },
    });
  } catch (e) {
    console.error("[leitura-do-video] falha ao gravar o uso (ignorado):", e instanceof Error ? e.message : e);
  }
}

// ─────────────────────────────── 4. juntar as camadas ───────────────────────────────

/**
 * A LEITURA FINAL: a geometria é da medição; o texto é da visão quando ela
 * existe. Tela e quadro medidos só ficam se a visão (quando há) também os
 * viu no trecho; quem fala segue a visão quando ela diz. Sem visão: gênero
 * "outro" com confiança baixa, como manda o contrato.
 */
/** Os pontos crus da visão: números válidos, caixa dentro do quadro e com tamanho, até 4. Puro. */
export function pontosDaVisao(cru: unknown): PontoLido[] {
  if (!Array.isArray(cru)) return [];
  const saida: PontoLido[] = [];
  for (const p of cru as Array<Record<string, unknown>>) {
    const [t, x, y, w, h] = [p?.segundo, p?.x, p?.y, p?.w, p?.h].map(Number);
    if (![t, x, y, w, h].every(Number.isFinite) || t < 0 || w < 0.02 || h < 0.02 || x < 0 || y < 0 || x >= 1 || y >= 1) continue;
    const cw = Math.min(w, 1 - x);
    const ch = Math.min(h, 1 - y);
    if (cw < 0.02 || ch < 0.02) continue;
    saida.push({ t: arred(t), caixa: { x: arred(x), y: arred(y), w: arred(cw), h: arred(ch) }, oQue: String(p.oQue ?? "").trim().replace(/[.\s]+$/, "").slice(0, 80) });
    if (saida.length >= 4) break;
  }
  return saida;
}

/**
 * Só os pontos que caem na tela ou no quadro do trecho (recortados a ele) e
 * no tempo do trecho (com 1 s de folga, preso às bordas). Sem tela nem quadro,
 * nenhum ponto. Puro.
 */
export function pontosNoConteudo(pontos: PontoLido[] | null | undefined, conteudo: CaixaNoQuadro | null | undefined, de: number, ate: number): PontoLido[] {
  if (!conteudo || !pontos?.length) return [];
  const saida: PontoLido[] = [];
  for (const p of pontos) {
    if (p.t < de - 1 || p.t > ate + 1) continue;
    const x0 = Math.max(p.caixa.x, conteudo.x);
    const y0 = Math.max(p.caixa.y, conteudo.y);
    const x1 = Math.min(p.caixa.x + p.caixa.w, conteudo.x + conteudo.w);
    const y1 = Math.min(p.caixa.y + p.caixa.h, conteudo.y + conteudo.h);
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue;
    saida.push({ t: arred(Math.min(Math.max(p.t, de), ate)), caixa: { x: arred(x0), y: arred(y0), w: arred(x1 - x0), h: arred(y1 - y0) }, oQue: p.oQue });
  }
  return saida;
}

export function juntarLeitura(r: ResumoDaMedicao, visao: VisaoDoVideo | null, fontes: { medicao: boolean }): LeituraDoVideo {
  const porIndice = new Map((visao?.trechos ?? []).map((t) => [t.i, t]));
  const trechos: TrechoLido[] = r.trechos.map((t, i) => {
    const v = porIndice.get(i);
    if (!v) return t;
    const pessoasEmCena = t.pessoasEmCena.map((p) => (v.quemFala.length ? { ...p, falando: v.quemFala.includes(p.id) } : p));
    // A medição acha a SUPERFÍCIE (região lisa com traço); se ela é tela ou
    // quadro é ambíguo em código (texto grande num quadro branco parece
    // slide). A visão desempata: a região medida vai para o que ela viu.
    let tela = t.tela && !v.temTela ? null : t.tela;
    let quadro = t.quadro && !v.temQuadro ? null : t.quadro;
    if (t.tela && !v.temTela && v.temQuadro && !quadro) [tela, quadro] = [null, t.tela];
    if (t.quadro && !v.temQuadro && v.temTela && !tela) [tela, quadro] = [t.quadro, null];
    const mostra = [...new Set([...v.mostra, ...(quadro && !v.mostra.some((m) => /quadro|lousa|flip/i.test(m)) ? ["quadro"] : []), ...(tela && !v.mostra.some((m) => /tela|slide/i.test(m)) ? ["tela"] : [])])];
    const ocupadas = [...pessoasEmCena.map((p) => p.caixa), ...(tela ? [tela] : []), ...(quadro ? [quadro] : [])];
    const pontos = pontosNoConteudo(v.pontos, tela ?? quadro ?? null, t.de, t.ate);
    return {
      ...t,
      pessoasEmCena,
      tela,
      quadro,
      acontece: v.acontece || t.acontece,
      mostra,
      falaDe: v.falaDe || t.falaDe,
      areaLivre: tela !== t.tela || quadro !== t.quadro ? areasLivres(ocupadas, r.formato) : t.areaLivre,
      ...(pontos.length ? { pontos } : {}),
    };
  });
  const pessoas: PessoaLida[] = r.pessoas.map((p) => {
    const v = visao?.pessoas.find((x) => x.id === p.id);
    return v ? { id: p.id, nome: v.nome ?? null, papel: v.papel ?? null, descricao: v.descricao || p.descricao } : p;
  });
  for (const v of visao?.pessoas ?? []) if (!pessoas.some((p) => p.id === v.id)) pessoas.push(v);
  const geral = `${r.visaoGeral.pessoasTipicas} pessoa(s) na maior parte do tempo${r.visaoGeral.comQuadro ? ", quadro em " + r.visaoGeral.comQuadro + " trecho(s)" : ""}${r.visaoGeral.comTela ? ", tela em " + r.visaoGeral.comTela + " trecho(s)" : ""}`;
  return {
    versao: 1,
    genero: visao ? visao.genero : "outro",
    generoConfianca: visao ? visao.generoConfianca : fontes.medicao ? 0.2 : 0.05,
    cenario: visao?.cenario || (fontes.medicao ? "cenário não descrito (sem visão)" : "cenário não lido"),
    formato: r.formato,
    pessoas,
    trechos,
    resumo: visao?.resumo || `Medição sem visão: ${geral}, ${r.trechos.length} trecho(s).`,
    fontes: { medicao: fontes.medicao, visao: visao?.modelo ?? null },
    custoUsd: Math.round((visao?.custoUsd ?? 0) * 1e6) / 1e6,
  };
}

// ─────────────────────────────── 5. a leitura inteira ───────────────────────────────

export type PedidoDeLeitura = {
  /** O vídeo (a base do completo), público ou no store privado. */
  url: string;
  fala: FalaLida | null;
  projectId?: string | null;
  /** Duração conhecida (da análise); sem ela, a do worker ou a da fala. */
  duracao?: number | null;
  /** Só o começo (a prova lê 3 min). */
  ate?: number | null;
  /** A medição já feita (o `preparar` a dispara junto da transcrição). */
  medicao?: RespostaDaMedicao | null;
  /** Força a visão ligada ou desligada (padrão: `leituraVisaoLigada()`). */
  visao?: boolean;
  avisos?: string[];
};

/**
 * A leitura de um vídeo, inteira: medição (já feita ou pedida ao worker),
 * resumo em trechos, visão quando ligada, e a junção. Lança só quando nem a
 * medição nem a duração existem; fora isso devolve o que conseguiu e anota
 * em `avisos` o que faltou.
 */
export async function lerVideo(p: PedidoDeLeitura): Promise<LeituraDoVideo> {
  const avisos = p.avisos ?? [];
  let medicao = p.medicao ?? null;
  if (!medicao) {
    try {
      medicao = await medirNoWorker(p.url, { proxy: p.visao ?? leituraVisaoLigada(), ate: p.ate ?? null });
    } catch (e) {
      avisos.push(`leitura: medição no worker falhou (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  for (const erro of medicao?.erros ?? []) avisos.push(`leitura: ${erro}`);
  const duracao = p.ate ?? medicao?.medida?.duracao ?? p.duracao ?? p.fala?.duracao ?? 0;
  if (!duracao) throw new Error("leitura sem duração conhecida");
  const resumo = medicao?.medida
    ? resumirMedida({ ...medicao.medida, duracao: Math.min(medicao.medida.duracao || duracao, duracao) }, p.fala)
    : resumoSemMedida(duracao, "16:9", p.fala);
  let visao: VisaoDoVideo | null = null;
  const querVisao = p.visao ?? leituraVisaoLigada();
  if (querVisao && medicao?.proxyUrl) {
    try {
      visao = await verComGemini({ url: medicao.proxyUrl }, resumo, p.fala, { projectId: p.projectId });
    } catch (e) {
      avisos.push(`leitura: visão falhou (${e instanceof Error ? e.message : String(e)})`);
    }
  } else if (querVisao) {
    avisos.push("leitura: sem proxy do worker, a visão não rodou");
  }
  return juntarLeitura(resumo, visao, { medicao: Boolean(medicao?.medida) });
}

// ─────────────────────────────── 6. para quem consome ───────────────────────────────

/** O trecho que cobre o instante `t` (segundos do vídeo lido). */
export function trechoEm(leitura: LeituraDoVideo, t: number): TrechoLido | null {
  return leitura.trechos.find((x) => t >= x.de && t < x.ate) ?? leitura.trechos.at(-1) ?? null;
}

/**
 * A leitura recortada para um intervalo (um corte do completo): os trechos
 * que tocam [de, ate), com os tempos levados para o início do intervalo
 * (`relativo`), para o corte ler em segundos dele mesmo.
 */
export function leituraNoIntervalo(leitura: LeituraDoVideo, de: number, ate: number, relativo = true): LeituraDoVideo {
  const trechos = leitura.trechos
    .filter((t) => t.ate > de && t.de < ate)
    .map((t) => {
      const pontos = (t.pontos ?? []).filter((p) => p.t >= de && p.t < ate).map((p) => ({ ...p, t: arred(p.t - (relativo ? de : 0)) }));
      return { ...t, de: arred(Math.max(t.de, de) - (relativo ? de : 0)), ate: arred(Math.min(t.ate, ate) - (relativo ? de : 0)), pontos };
    });
  const ids = new Set(trechos.flatMap((t) => t.pessoasEmCena.map((p) => p.id)));
  return { ...leitura, trechos, pessoas: leitura.pessoas.filter((p) => ids.has(p.id) || !leitura.pessoas.some((q) => ids.has(q.id))) };
}

/** A leitura gravada em video_jobs.completoMontagem.leitura (null se não há). */
export async function leituraGravada(videoJobId: string): Promise<LeituraDoVideo | null> {
  const linhas = await prisma.$queryRaw<Array<{ leitura: unknown }>>`
    SELECT "completoMontagem" -> 'leitura' AS leitura FROM video_jobs WHERE id = ${videoJobId}`;
  const l = linhas[0]?.leitura as LeituraDoVideo | null | undefined;
  return l && typeof l === "object" && (l as LeituraDoVideo).versao === 1 ? (l as LeituraDoVideo) : null;
}

const caixaEmTexto = (c: CaixaNoQuadro) => `x${Math.round(c.x * 100)}-${Math.round((c.x + c.w) * 100)}% y${Math.round(c.y * 100)}-${Math.round((c.y + c.h) * 100)}%`;

/**
 * A leitura em texto curto, para o estado do JEV e para o redator: cabeçalho
 * (gênero, cenário, pessoas) e uma linha por trecho com o que não pode ser
 * tapado. Sem travessão.
 */
export function leituraEmTexto(leitura: LeituraDoVideo, opcoes: { trechos?: boolean; maxTrechos?: number } = {}): string {
  const linhas = [
    `Vídeo: ${leitura.genero} (confiança ${Math.round(leitura.generoConfianca * 100)}%), ${leitura.formato}. Cenário: ${leitura.cenario}.`,
    leitura.pessoas.length ? `Pessoas: ${leitura.pessoas.map((p) => `${p.id} ${p.nome ? `(${p.nome}) ` : ""}${p.descricao}${p.papel ? `, ${p.papel}` : ""}`).join("; ")}.` : "Pessoas: nenhuma medida.",
    `Resumo: ${leitura.resumo}`,
  ];
  if (opcoes.trechos !== false) {
    for (const t of leitura.trechos.slice(0, opcoes.maxTrechos ?? 200)) {
      const quem = t.pessoasEmCena.map((p) => `${p.id}${p.falando ? "*" : ""} ${caixaEmTexto(p.caixa)}`).join(", ") || "ninguém";
      const fixo = [t.tela ? `tela ${caixaEmTexto(t.tela)}` : null, t.quadro ? `quadro ${caixaEmTexto(t.quadro)}` : null].filter(Boolean).join(", ");
      const livre = t.areaLivre.map(caixaEmTexto).join(" | ") || "nenhuma";
      const pontos = (t.pontos ?? []).map((p) => `${mmss(p.t)} ${p.oQue}`).join("; ");
      linhas.push(`[${mmss(t.de)}-${mmss(t.ate)}] ${t.acontece}. Fala: ${t.falaDe}. Em cena: ${quem}${fixo ? `; ${fixo}` : ""}. Mostra: ${t.mostra.join(", ") || "nada"}.${pontos ? ` A fala aponta: ${pontos}.` : ""} Movimento ${t.movimento}. Livre: ${livre}.`);
    }
  }
  return linhas.join("\n");
}
