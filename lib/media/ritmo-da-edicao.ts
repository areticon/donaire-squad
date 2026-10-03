import {
  intervaloDaCena,
  normalizarPalavra,
  REGRAS,
  type CenaDoPlano,
  type ElementoDoPlano,
  type Familia,
  type Formato,
  type PalavraNoCorte,
  type PlanoDeMontagem,
} from "@/lib/media/plano-de-montagem";

/**
 * O RITMO DA EDIÇÃO em número (01/10/2026). Módulo PURO.
 *
 * Duas regras do dono, depois de dois testes:
 *
 * 1. COMPLETO LONGO coberto do começo ao fim, com mais densidade no começo,
 *    onde a retenção se decide. Até 30/09 era "um efeito a cada 2 minutos",
 *    escolhido por janelas iguais: no completo de 22 min saíram 10 inserções
 *    e, com as cenas da tela compartilhada descartadas depois, nada entre o
 *    minuto 1 e o minuto 8. Agora a cota é por minuto e decresce: 4 no
 *    primeiro minuto, 3 no segundo, 2 no terceiro e 1 em cada minuto depois.
 *    Entre as inserções, o narrador cheio ganha movimento (punch ou zoom,
 *    feitos no ffmpeg, sem custo de render) a cada ~10 s.
 *
 * 2. VÍDEO CURTO nunca "sem graça": o vídeo do celular de 30/09 (4 min em pé)
 *    saiu com 2 inserções e cobertura de 5%, porque o completo dele seguia a
 *    regra do vídeo longo. Corte e completo curto (em pé ou até 4 min) levam
 *    um elemento ou movimento a cada 4 a 6 s (janela de 5 s): zoom de impacto,
 *    palavra em destaque, troca de cena. Sem poluir: no máximo UMA coisa nova
 *    por janela vazia, e nada é posto em cena que já tem dois elementos.
 */

export type CotaDeInsercoes = { de: number; ate: number; insercoes: number };

/** Janela da regra do curto: um evento a cada 4 a 6 s. */
export const JANELA_DO_CURTO_SEG = 5;
/** Janela de movimento do completo longo (punch ou zoom na base, sem custo de render). */
export const JANELA_DO_LONGO_SEG = 10;

/** O completo segue a regra do curto: gravação em pé ou até 4 min. */
export function completoEhCurto(duracao: number, formato: Formato): boolean {
  return formato === "9:16" || duracao <= 240;
}

/**
 * Inserções por minuto do completo longo: o começo pesa mais. Eram 4, 3, 2
 * até 02/10; caíram com a reprovação do completo MrBeast cmuqc9r7z
 * (cobertura de 39%, "as inserções pioraram a qualidade em relação à
 * gravação"): menos inserções e melhores, para todo estilo com B-roll.
 */
const COTA_POR_MINUTO_DO_LONGO = [3, 2, 1];

/**
 * As cotas de inserção do completo, por janela. Longo: janelas de 1 min com
 * 3, 2 e depois 1. Curto: janelas de 20 s com 1 (três por minuto; até 02/10
 * eram janelas de 15 s com 2, oito por minuto, e o completo em pé de 4 min
 * recebia 34 inserções). A última janela parcial leva a parte proporcional,
 * nunca menos de uma.
 */
export function cotasDoCompleto(duracao: number, formato: Formato): CotaDeInsercoes[] {
  const curto = completoEhCurto(duracao, formato);
  const passo = curto ? 20 : 60;
  const cotas: CotaDeInsercoes[] = [];
  for (let k = 0, de = 0; de < duracao - 0.5; k++, de += passo) {
    const ate = Math.min(duracao, de + passo);
    const cheia = curto ? 1 : COTA_POR_MINUTO_DO_LONGO[k] ?? 1;
    const fracao = (ate - de) / passo;
    cotas.push({ de, ate: +ate.toFixed(3), insercoes: Math.max(1, Math.round(cheia * fracao)) });
  }
  return cotas;
}

/** Quantas inserções cabem num trecho (o bloco do diretor), somando as cotas pela parte que cai nele. */
export function insercoesNoTrecho(cotas: CotaDeInsercoes[], de: number, ate: number): number {
  let soma = 0;
  for (const c of cotas) {
    const dentro = Math.max(0, Math.min(ate, c.ate) - Math.max(de, c.de));
    if (dentro > 0) soma += (c.insercoes * dentro) / Math.max(1, c.ate - c.de);
  }
  return Math.max(1, Math.round(soma));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A agenda do bloco em texto para o diretor, no tempo DO BLOCO ("0:00 a 1:00: 4 inserções"). */
export function agendaDoBloco(cotas: CotaDeInsercoes[], de: number, ate: number): string {
  const linhas: string[] = [];
  for (const c of cotas) {
    const a = Math.max(de, c.de);
    const b = Math.min(ate, c.ate);
    if (b - a < 3) continue;
    const n = Math.max(1, Math.round((c.insercoes * (b - a)) / Math.max(1, c.ate - c.de)));
    linhas.push(`${mmss(a - de)} a ${mmss(b - de)} do bloco: ${n} ${n === 1 ? "inserção" : "inserções"}`);
  }
  return linhas.join("; ");
}

// ─────────────────────────────── eventos ───────────────────────────────

/**
 * Os instantes em que algo MUDA na tela: troca de layout ou de mídia, o
 * movimento da cena (na palavra forte), a entrada de cada elemento.
 */
export function eventosDoPlano(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number): number[] {
  const eventos: number[] = [];
  plano.cenas.forEach((c, i) => {
    const { inicio } = intervaloDaCena(c, palavras, duracao);
    const anterior = plano.cenas[i - 1];
    if (i === 0 || c.layout !== anterior.layout || c.asset !== anterior.asset) eventos.push(inicio);
    if (c.movimento !== "estatico") eventos.push(typeof c.movimentoNa === "number" ? palavras[c.movimentoNa]?.inicio ?? inicio : inicio);
    for (const e of c.elementos) eventos.push(palavras[e.palavra]?.inicio ?? inicio);
  });
  return eventos.sort((a, b) => a - b);
}

/** Quantas janelas de `janela` segundos passam sem nada mudar. */
export function janelasVazias(plano: PlanoDeMontagem, palavras: PalavraNoCorte[], duracao: number, janela = JANELA_DO_CURTO_SEG): number {
  const n = Math.max(1, Math.ceil(duracao / janela));
  const cheias = new Set(eventosDoPlano(plano, palavras, duracao).map((t) => Math.min(n - 1, Math.floor(t / janela))));
  let vazias = 0;
  for (let k = 0; k < n; k++) if (!cheias.has(k)) vazias++;
  return vazias;
}

// ─────────────────────────────── a garantia ───────────────────────────────

const VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "um", "uma", "que", "pra", "para", "por", "com",
  "se", "eu", "voce", "ele", "ela", "isso", "esse", "essa", "aqui", "ali", "entao", "mas", "nao", "tem", "ter", "foi", "ser", "sao", "ta",
  "tava", "estava", "esta", "como", "mais", "muito", "porque", "quando", "onde", "ne", "tipo", "assim", "gente", "coisa",
]);

/** A palavra que mais pesa num intervalo de índices: longa, de conteúdo, de preferência no fim de frase ou número. */
function palavraForte(palavras: PalavraNoCorte[], de: number, ate: number): number {
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
  return melhor;
}

const limparTexto = (t: string) => t.replace(/[.,!?;:"“”]+$/g, "").replace(/^["“”]+/, "");

/** O elemento barato de cada família: palavra em destaque, sempre com palavra DITA. */
function elementoDeRitmo(familia: Familia, palavras: PalavraNoCorte[], i: number, ate: number): ElementoDoPlano | null {
  const p = limparTexto(palavras[i]?.texto ?? "");
  if (!p) return null;
  if (familia === "impacto") {
    if (p.length > REGRAS.letrasPorTitulo) return null;
    return { tipo: "letras-revista", texto: p.toUpperCase(), zona: "centro", palavra: i };
  }
  if (familia === "colagem") {
    // Duas a quatro palavras ditas a partir da forte, sem atravessar o fim da frase.
    const texto: string[] = [];
    for (let k = i; k <= Math.min(ate, i + 3); k++) {
      texto.push(limparTexto(palavras[k].texto));
      if (/[.!?,;:]$/.test(palavras[k].texto)) break;
    }
    return { tipo: "marca-texto", texto: texto.join(" "), zona: "base", palavra: i };
  }
  // Sóbrio: o telejornal não enfeita fala comum; o ritmo vem só do movimento.
  return null;
}

/**
 * Garante o ritmo mínimo: toda janela de `janelaSeg` tem um evento. Na janela
 * vazia, a cena que a cobre ganha UMA coisa, nesta ordem:
 *   1. narrador cheio parado: movimento na palavra forte da janela, alternando
 *      punch e zoom lento;
 *   2. narrador cheio que já tem movimento fora da janela: a cena é partida
 *      na janela (as duas partes com pelo menos 1,5 s) e a parte nova entra
 *      com o outro movimento, um corte de câmera;
 *   3. sem dar para partir, e se `comElementos`: uma palavra em destaque
 *      (nunca em tela compartilhada nem em cena que já tem dois elementos).
 * Inserção (canto, foto, B-roll) já é o evento dela e não recebe nada.
 */
export function garantirRitmo(
  plano: PlanoDeMontagem,
  palavras: PalavraNoCorte[],
  duracao: number,
  opcoes: { janelaSeg: number; familia: Familia; comElementos: boolean; emTela?: (inicio: number, fim: number) => boolean }
): { plano: PlanoDeMontagem; adicionados: number } {
  if (!palavras.length || !plano.cenas.length) return { plano, adicionados: 0 };
  const cenas: CenaDoPlano[] = plano.cenas.map((c) => ({ ...c, elementos: [...c.elementos] }));
  const p: PlanoDeMontagem = { ...plano, cenas };
  const J = opcoes.janelaSeg;
  const n = Math.max(1, Math.ceil(duracao / J));
  let adicionados = 0;
  let ultimoMovimento: "punch" | "zoom-in-lento" = "zoom-in-lento";
  for (let k = 0; k < n; k++) {
    const a = k * J;
    const b = Math.min(duracao, a + J);
    if (b - a < J * 0.6) break;
    const eventos = eventosDoPlano(p, palavras, duracao);
    if (eventos.some((t) => t >= a && t < b)) continue;
    // As palavras da janela.
    const idx = palavras.map((w, i) => (w.inicio >= a && w.inicio < b ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) continue;
    const meio = palavras[idx[Math.floor(idx.length / 2)]].inicio;
    const ci = p.cenas.findIndex((c) => {
      const t = intervaloDaCena(c, palavras, duracao);
      return meio >= t.inicio && meio < t.fim;
    });
    if (ci < 0) continue;
    const c = p.cenas[ci];
    if (c.layout !== "narrador-cheio") continue;
    const deJ = Math.max(c.de, idx[0]);
    const ateJ = Math.min(c.ate, idx[idx.length - 1]);
    if (ateJ < deJ) continue;
    const forte = palavraForte(palavras, deJ, ateJ);
    if (forte < 0) continue;
    const proximo: "punch" | "zoom-in-lento" = ultimoMovimento === "punch" ? "zoom-in-lento" : "punch";
    const tempo = intervaloDaCena(c, palavras, duracao);
    const emTela = opcoes.emTela?.(tempo.inicio, tempo.fim) ?? false;
    if (c.movimento === "estatico") {
      p.cenas[ci] = { ...c, movimento: proximo, movimentoNa: forte, motivo: `${c.motivo} (ritmo: movimento na janela vazia)` };
      ultimoMovimento = proximo;
      adicionados++;
      continue;
    }
    // Partir a cena: a parte nova começa na primeira palavra da janela.
    const corte = idx.find((i) => i > c.de && i <= c.ate);
    if (typeof corte === "number") {
      const antes = palavras[corte].inicio - tempo.inicio;
      const depois = tempo.fim - palavras[corte].inicio;
      if (antes >= 1.5 && depois >= 1.5) {
        const outro: "punch" | "zoom-in-lento" = c.movimento === "punch" ? "zoom-in-lento" : "punch";
        const primeira: CenaDoPlano = {
          ...c,
          ate: corte - 1,
          movimentoNa: typeof c.movimentoNa === "number" && c.movimentoNa < corte ? c.movimentoNa : undefined,
          elementos: c.elementos.filter((e) => e.palavra < corte),
        };
        const segunda: CenaDoPlano = {
          ...c,
          de: corte,
          movimento: outro,
          movimentoNa: Math.max(corte, forte),
          transicao: "corte",
          asset: undefined,
          elementos: c.elementos.filter((e) => e.palavra >= corte),
          motivo: `${c.motivo} (ritmo: corte de câmera na janela vazia)`,
        };
        p.cenas.splice(ci, 1, primeira, segunda);
        ultimoMovimento = outro;
        adicionados++;
        continue;
      }
    }
    if (opcoes.comElementos && !emTela && c.elementos.length < 2) {
      const e = elementoDeRitmo(opcoes.familia, palavras, forte, ateJ);
      if (e) {
        p.cenas[ci] = { ...c, elementos: [...c.elementos, e], motivo: `${c.motivo} (ritmo: palavra em destaque)` };
        adicionados++;
      }
    }
  }
  return { plano: p, adicionados };
}
