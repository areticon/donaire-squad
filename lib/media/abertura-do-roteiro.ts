import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";

/**
 * A ABERTURA COM OS MELHORES MOMENTOS (01/10/2026), estilo MrBeast. Módulo
 * PURO: a tela do cliente importa daqui, o servidor também.
 *
 * O pedido do Bruno: "em toda edição, o vídeo começa com um gancho: os
 * melhores momentos ligados ao tema principal, em cortes rápidos, com efeitos,
 * antes do conteúdo". No completo, 15 a 25 s de frases de 1 a 3 s, cada uma
 * com zoom de impacto, texto de soco, flash e som de transição. No corte
 * curto, 3 a 5 s: uma frase forte do próprio corte, antes do começo dele.
 *
 * Quem escolhe as frases é o diretor, pela transcrição
 * (lib/media/escolha-da-abertura.ts); quem aprova e troca é o cliente, na tela
 * de roteiro, antes de gastar; quem monta é o worker
 * (worker/src/abertura-de-impacto.mjs). A fala NUNCA é cortada no meio da
 * palavra: cada momento é uma sequência de palavras inteiras, e a borda cai
 * no meio da pausa vizinha, com teto de respiro (o mesmo desenho de
 * `bordasDoCorte`).
 *
 * A abertura de 23/08 (lib/media/abertura.ts, dois ganchos de 5 a 12 s sem
 * efeito) foi desligada pelo Bruno porque abria com frase solta, sem
 * contexto. A diferença aqui: frases curtas e fortes, escolhidas pelo TEMA, em
 * ritmo de trailer, e aprovadas por ele antes de ir ao ar.
 */

export type MomentoDaAbertura = {
  /** Índices de palavra (inclusivos) na fala do completo ou do corte. */
  de: number;
  ate: number;
  /** Segundos na mesma fala, já com as bordas no silêncio. */
  inicio: number;
  fim: number;
  /** O que é dito, palavra por palavra. */
  frase: string;
  /** O texto de soco na tela: 1 a 3 palavras DITAS, em caixa alta. */
  soco: string;
  /** Por que o diretor escolheu (a tela mostra). */
  porque?: string | null;
};

/** `completoMontagem.roteiro.abertura`. */
export type AberturaDoCompleto = {
  momentos: MomentoDaAbertura[];
  /** Outras frases fortes, na ordem do diretor: o "trocar" da tela puxa daqui. */
  reservas: MomentoDaAbertura[];
  /** O cliente tirou a abertura inteira (não cobra, não monta). */
  desligada?: boolean;
  erro?: string | null;
  feitoEm: string;
  /** O tipo de abertura da bíblia do estilo (01/10): trailer, frase, pergunta, teaser, promessa. */
  tipo?: string;
  /** A passagem visual que o estilo pede (01/10); o worker passa a ler na Fase 2b. */
  passagem?: string;
};

/** `clips[i].roteiro.gancho`: a frase que abre o corte curto. */
export type GanchoDoCorte = MomentoDaAbertura & { reservas?: MomentoDaAbertura[]; desligado?: boolean };

export const REGRAS_DA_ABERTURA = {
  /** Cada momento do completo: uma FRASE INTEIRA (02/10), de 1,5 a 6,5 s. */
  momentoMin: 1.5,
  momentoMax: 6.5,
  /** O total do completo: 15 a 25 s, mirando 20. */
  totalMin: 15,
  totalAlvo: 20,
  totalMax: 25,
  /** O gancho do corte curto: uma frase inteira de 2,6 a 6,5 s (02/10). */
  ganchoMin: 2.6,
  ganchoMax: 6.5,
  /** O gancho não sai dos primeiros segundos do corte (seria a mesma frase duas vezes seguidas). */
  ganchoDepoisDe: 6,
} as const;

const norm = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

/**
 * As bordas do momento: no meio da pausa vizinha, com folga de RESPIRO (02/10)
 * de até 0,2 s antes e 0,3 s depois (eram 0,12 e 0,15: a frase saía colada no
 * corte). Nunca passa do meio da pausa: a palavra vizinha não entra.
 */
export function bordasDoMomento(palavras: PalavraNoCorte[], de: number, ate: number): { inicio: number; fim: number } {
  const a = palavras[de];
  const b = palavras[ate];
  const antes = palavras[de - 1];
  const depois = palavras[ate + 1];
  const inicio = antes ? Math.max(antes.fim, a.inicio - Math.min(0.2, (a.inicio - antes.fim) / 2)) : Math.max(0, a.inicio - 0.2);
  const fim = depois ? Math.min(depois.inicio, b.fim + Math.min(0.3, (depois.inicio - b.fim) / 2)) : b.fim + 0.3;
  return { inicio: +inicio.toFixed(3), fim: +fim.toFixed(3) };
}

/**
 * FRASE COMPLETA (02/10, reprovação do Bruno): as 5 frases da abertura do
 * completo cmuqc9r7z começavam e terminavam no meio ("que era a empresa deles
 * né, eles tinham", "a afundar. Dois barcos precisou", "E isso não é
 * colocar"). O ajuste de 01/10 aparava o começo para caber em 3,4 s e
 * escolhia "a oração que fecha a ideia" depois de uma vírgula: o soco curto
 * ganhava da frase inteira. Agora vale o contrário: cada momento é uma frase
 * que começa no início de frase e termina no fim de frase, pela pontuação da
 * transcrição E pela pausa medida no áudio (o silêncio entre as palavras).
 * Ideia sem fechamento não entra: frase longa demais para o teto devolve null,
 * e nunca é aparada.
 */
/** Pausa (s) que, sozinha, marca fronteira de frase na fala sem pontuação. */
export const PAUSA_DE_FRASE_SEG = 0.55;
/** Teto de uma frase da abertura: acima disto a frase não cabe e o momento sai. */
export const FRASE_MAX_SEG = 6.5;

const pausaDepois = (palavras: PalavraNoCorte[], i: number) => (i + 1 < palavras.length ? palavras[i + 1].inicio - palavras[i].fim : Infinity);

/** A palavra `i` ABRE frase: é a primeira, a anterior fecha com ponto, ou há pausa longa antes dela. */
export function abreFrase(palavras: PalavraNoCorte[], i: number): boolean {
  if (i <= 0) return true;
  const ant = palavras[i - 1].texto;
  return /[.!?…]["”]?$/.test(ant) || pausaDepois(palavras, i - 1) >= PAUSA_DE_FRASE_SEG;
}

/** A palavra `i` FECHA frase: termina em ponto, ou vem pausa longa depois e ela não pede continuação. */
export function fechaFraseNaFala(palavras: PalavraNoCorte[], i: number): boolean {
  if (i >= palavras.length - 1) return true;
  const t = palavras[i].texto;
  if (/[.!?…]["”]?$/.test(t)) return true;
  return pausaDepois(palavras, i) >= PAUSA_DE_FRASE_SEG && !FECHA_FRACO.has(norm(t)) && !/,$/.test(t);
}

/**
 * O momento vira a FRASE INTEIRA que o contém: o começo recua até o início
 * da frase, o fim avança até o fim dela. Curta demais, ganha a frase seguinte
 * se a fala continua sem pausa longa. Uma muleta solta na abertura ("Então,",
 * "Né", "E aí") sai, porque a frase continua inteira sem ela. Null quando a
 * frase inteira não cabe no teto ou não fecha.
 */
export function ajustarMomento(palavras: PalavraNoCorte[], de: number, ate: number, min: number, max: number): { de: number; ate: number } | null {
  if (!(de >= 0 && ate >= de && ate < palavras.length)) return null;
  const teto = Math.max(max, FRASE_MAX_SEG);
  const dur = (x: number, y: number) => {
    const b = bordasDoMomento(palavras, x, y);
    return b.fim - b.inicio;
  };
  // O começo recua até o início da frase (no máximo 40 palavras).
  let k = 0;
  while (!abreFrase(palavras, de) && k++ < 40) de--;
  if (!abreFrase(palavras, de)) return null;
  // O fim avança até o fim da frase.
  k = 0;
  while (!fechaFraseNaFala(palavras, ate) && k++ < 40) ate++;
  if (!fechaFraseNaFala(palavras, ate)) return null;
  // Muleta solta na entrada sai (a frase continua inteira).
  while (de < ate && ABRE_FRACO.has(norm(palavras[de].texto)) && /^[A-Za-zÀ-ÿ]+,?$/.test(palavras[de].texto) && dur(de + 1, ate) >= min) de++;
  // Curta demais: a frase seguinte entra, se a fala continua e se ela fecha dentro do teto.
  while (dur(de, ate) < min && ate + 1 < palavras.length && pausaDepois(palavras, ate) < PAUSA_DE_FRASE_SEG) {
    let fim = ate + 1;
    let j = 0;
    while (!fechaFraseNaFala(palavras, fim) && j++ < 40) fim++;
    if (!fechaFraseNaFala(palavras, fim) || dur(de, fim) > teto) break;
    ate = fim;
  }
  const d = dur(de, ate);
  if (d > teto || d < min * 0.8) return null;
  if (FECHA_FRACO.has(norm(palavras[ate].texto)) && !/[.!?…]$/.test(palavras[ate].texto)) return null;
  return { de, ate };
}

/**
 * O GANCHO DO CORTE vira frase inteira (02/10): o gancho aprovado antes da
 * regra nova (um pedaço de frase) passa por `ajustarMomento` com as palavras
 * do corte; se a frase inteira não cabe, o corte sai sem gancho.
 */
export function ganchoEmFraseInteira(palavras: PalavraNoCorte[], g: { inicio: number; fim: number; soco: string } | null | undefined): { inicio: number; fim: number; soco: string } | null {
  if (!g) return null;
  const dentro = palavras.map((w, i) => ({ w, i })).filter(({ w }) => w.inicio >= g.inicio - 0.05 && w.fim <= g.fim + 0.05);
  if (!dentro.length) return null;
  const a = ajustarMomento(palavras, dentro[0].i, dentro[dentro.length - 1].i, REGRAS_DA_ABERTURA.ganchoMin, REGRAS_DA_ABERTURA.ganchoMax);
  if (!a) return null;
  const b = bordasDoMomento(palavras, a.de, a.ate);
  return { inicio: b.inicio, fim: b.fim, soco: socoDoMomento(palavras, a.de, a.ate, g.soco) };
}

/** Confere uma lista de momentos já escolhidos: cada um é frase inteira? (para a tela e para a prova) */
export function momentoEhFraseInteira(palavras: PalavraNoCorte[], de: number, ate: number): boolean {
  const semMuleta = (i: number) => {
    // A muleta que saiu na entrada conta como começo de frase.
    let j = i;
    while (j > 0 && ABRE_FRACO.has(norm(palavras[j - 1].texto)) && !abreFrase(palavras, j)) j--;
    return abreFrase(palavras, j);
  };
  return semMuleta(de) && fechaFraseNaFala(palavras, ate);
}

/** Palavras que não abrem um soco. */
const ABRE_FRACO = new Set(["entao", "bom", "ne", "e", "tipo", "assim", "ai", "gente", "olha", "ok", "beleza"]);
/** Palavras que não fecham uma frase: pedem a seguinte. */
const FECHA_FRACO = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "um", "uma", "que", "pra", "para", "por", "pelo", "pela",
  "com", "se", "mas", "ou", "como", "porque", "quando", "onde", "seu", "sua", "meu", "minha", "esse", "essa", "este", "esta", "aquele", "aquela", "mais", "muito", "nao", "e",
]);

/**
 * Palavras que nunca FECHAM um texto de soco (01/10, prévia reprovada pelo
 * coordenador: "DOZE MESES EM", "PEQUENA PARCELA DO", "NEM ESTAGIÁRIO BEM",
 * "MOISÉS NÃO SABIA"): preposição, artigo, conjunção, advérbio solto e verbo
 * que pede complemento. O soco tem sentido fechado ou sai mais curto.
 */
export const FIM_PROIBIDO_DO_SOCO = new Set([
  ...FECHA_FRACO,
  "bem", "tao", "tambem", "so", "ja", "ainda", "sabia", "sabe", "vai", "vou", "ser", "sao", "ta", "tem", "tinha", "faz", "fazer", "foi", "era",
  "pode", "quer", "precisa", "estava", "esta", "nem", "eu", "ele", "ela", "voce", "isso", "ate", "sem", "sobre", "entre", "ao", "aos", "à", "às",
]);

/** Até 4 palavras, sem fim proibido; null se não sobra nada com sentido. */
export function limparSoco(texto: string | null | undefined): string | null {
  const partes = String(texto ?? "").replace(/[.,!?;:"“”]+/g, "").split(/\s+/).filter(Boolean).slice(0, 4);
  while (partes.length && FIM_PROIBIDO_DO_SOCO.has(norm(partes[partes.length - 1]))) partes.pop();
  // Uma palavra sozinha que não diz nada ("NEM", "MAS") também não serve.
  if (!partes.length || (partes.length === 1 && norm(partes[0]).length < 4)) return null;
  const s = partes.join(" ").toUpperCase();
  return s.length <= 30 ? s : null;
}

/**
 * O soco precisa ser falado no momento (1 a 4 palavras, sentido fechado); o
 * pedido do diretor vale se passa na `limparSoco`. Senão, a palavra de
 * conteúdo mais longa do momento.
 */
export function socoDoMomento(palavras: PalavraNoCorte[], de: number, ate: number, pedido?: string | null): string {
  const ditas = palavras.slice(de, ate + 1).map((p) => p.texto.replace(/[.,!?;:"“”]+$/g, ""));
  const conjunto = new Set(ditas.map(norm));
  const limpo = limparSoco(pedido);
  if (limpo && limpo.split(" ").every((x) => conjunto.has(norm(x)))) return limpo;
  const longa = [...ditas].filter((x) => !FIM_PROIBIDO_DO_SOCO.has(norm(x))).sort((x, y) => norm(y).length - norm(x).length)[0] ?? ditas[0] ?? "";
  return longa.toUpperCase().slice(0, 18);
}

export function montarMomento(palavras: PalavraNoCorte[], de: number, ate: number, soco?: string | null, porque?: string | null): MomentoDaAbertura {
  const { inicio, fim } = bordasDoMomento(palavras, de, ate);
  return {
    de,
    ate,
    inicio,
    fim,
    frase: palavras.slice(de, ate + 1).map((p) => p.texto).join(" "),
    soco: socoDoMomento(palavras, de, ate, soco),
    porque: porque ?? null,
  };
}

export const duracaoDosMomentos = (m: MomentoDaAbertura[]) => +m.reduce((s, x) => s + (x.fim - x.inicio), 0).toFixed(2);

/**
 * Da lista do diretor (a mais forte primeiro) para a abertura: pega na ordem,
 * sem sobrepor nem encostar (2 s de folga entre momentos de origem), até o
 * alvo de 20 s, sem passar de 25. O resto fica de reserva para o "trocar".
 * Os momentos vão ao ar na ordem do diretor (o mais forte abre).
 */
export function escolherMomentos(candidatos: MomentoDaAbertura[], alvo: number = REGRAS_DA_ABERTURA.totalAlvo, maximo: number = REGRAS_DA_ABERTURA.totalMax): { momentos: MomentoDaAbertura[]; reservas: MomentoDaAbertura[] } {
  const momentos: MomentoDaAbertura[] = [];
  const reservas: MomentoDaAbertura[] = [];
  let total = 0;
  for (const c of candidatos) {
    const encosta = momentos.some((m) => c.inicio < m.fim + 2 && c.fim + 2 > m.inicio);
    const dur = c.fim - c.inicio;
    if (!encosta && total < alvo && total + dur <= maximo) {
      momentos.push(c);
      total += dur;
    } else if (!reservas.some((m) => c.inicio < m.fim && c.fim > m.inicio)) {
      reservas.push(c);
    }
  }
  return { momentos, reservas };
}

// ─────────────────────────────── ajustes do cliente (puros) ───────────────────────────────

/** Troca o momento k pela primeira reserva que não encosta nos outros; o trocado vai para o fim da fila. */
export function trocarMomento(a: AberturaDoCompleto, k: number): AberturaDoCompleto {
  const atual = a.momentos[k];
  if (!atual) return a;
  const outros = a.momentos.filter((_, i) => i !== k);
  const total = duracaoDosMomentos(outros);
  const r = a.reservas.findIndex(
    (c) => !outros.some((m) => c.inicio < m.fim + 2 && c.fim + 2 > m.inicio) && total + (c.fim - c.inicio) <= REGRAS_DA_ABERTURA.totalMax
  );
  if (r < 0) return a;
  const momentos = [...a.momentos];
  momentos[k] = a.reservas[r];
  const reservas = [...a.reservas.slice(0, r), ...a.reservas.slice(r + 1), atual];
  return { ...a, momentos, reservas };
}

/** Tira o momento k (ele volta para as reservas). */
export function tirarMomento(a: AberturaDoCompleto, k: number): AberturaDoCompleto {
  const atual = a.momentos[k];
  if (!atual) return a;
  return { ...a, momentos: a.momentos.filter((_, i) => i !== k), reservas: [...a.reservas, atual] };
}

/** Põe de volta a próxima reserva no fim da abertura (sem passar dos 25 s). */
export function acrescentarMomento(a: AberturaDoCompleto): AberturaDoCompleto {
  const total = duracaoDosMomentos(a.momentos);
  const r = a.reservas.findIndex(
    (c) => !a.momentos.some((m) => c.inicio < m.fim + 2 && c.fim + 2 > m.inicio) && total + (c.fim - c.inicio) <= REGRAS_DA_ABERTURA.totalMax
  );
  if (r < 0) return a;
  return { ...a, momentos: [...a.momentos, a.reservas[r]], reservas: a.reservas.filter((_, i) => i !== r) };
}

/** O gancho do corte: a próxima reserva entra, o atual vai para o fim. */
export function trocarGancho(g: GanchoDoCorte): GanchoDoCorte {
  const reservas = g.reservas ?? [];
  if (!reservas.length) return g;
  const { reservas: _r, desligado: _d, ...atual } = g;
  void _r;
  void _d;
  return { ...reservas[0], reservas: [...reservas.slice(1), atual] };
}

/** A abertura vale (vai ao ar e é cobrada)? */
export function aberturaAtiva(a: AberturaDoCompleto | null | undefined): boolean {
  return Boolean(a && !a.desligada && a.momentos.length);
}

// ─────────────────────────────── a tela ───────────────────────────────

export type AberturaNaTela = {
  ativa: boolean;
  duracao: number;
  momentos: Array<{ indice: number; inicio: number; fim: number; frase: string; soco: string; porque: string | null }>;
  reservas: number;
  /** Por que não há abertura (falha do diretor), em português. */
  semAbertura: string | null;
};

export function aberturaNaTela(a: AberturaDoCompleto | null | undefined): AberturaNaTela | null {
  if (!a) return null;
  return {
    ativa: aberturaAtiva(a),
    duracao: duracaoDosMomentos(a.momentos),
    momentos: a.momentos.map((m, indice) => ({ indice, inicio: m.inicio, fim: m.fim, frase: m.frase, soco: m.soco, porque: m.porque ?? null })),
    reservas: a.reservas.length,
    semAbertura: a.erro ? `Não consegui escolher os melhores momentos agora (${a.erro}). O vídeo começa direto no conteúdo.` : null,
  };
}

export type GanchoNaTela = { ativo: boolean; inicio: number; fim: number; frase: string; soco: string; reservas: number };

export function ganchoNaTela(g: GanchoDoCorte | null | undefined): GanchoNaTela | null {
  if (!g) return null;
  return { ativo: !g.desligado, inicio: g.inicio, fim: g.fim, frase: g.frase, soco: g.soco, reservas: g.reservas?.length ?? 0 };
}
