import type { Word } from "@/lib/media/transcribe";

/**
 * A FRASE ERRADA E O RETAKE (03/10/2026), a parte que é só CÓDIGO.
 *
 * O Bruno, em 03/10: "eu erro a sentença, gaguejo no meio e começo de novo, e
 * a IA deixou as duas lá. Inaceitável." O caso medido no vídeo de 19 min do
 * Empreendedorismo Cristão (cmurtv2zg), aos 99,8 s:
 *
 *   "E e eu evitei usar a palavra, [1,5 s] e eu evitei usar a palavra
 *    produtividade por motivo também."
 *
 * Por que passava: a limpeza por IA tinha teto de 12 palavras e 1,2 s de fala
 * por corte (para não apagar conteúdo), e a tentativa errada tem 2,1 s. O
 * veto existia por bom motivo, então a tomada errada não pode entrar pela
 * mesma porta da muleta: ela entra por aqui, com prova própria.
 *
 * ## A divisão do trabalho
 *
 * - Este arquivo ACHA candidatos, por aritmética sobre a transcrição com
 *   tempos: frase seguida de outra que repete o começo dela (retomada), frase
 *   que se interrompe e recomeça no meio do fluxo (recomeço), fragmento solto
 *   seguido de pausa (falso começo), "não, pera" e parentes (marcador) e
 *   sílaba gaguejada antes da palavra (gaguejo).
 * - `decidir-retomadas.ts` pergunta ao JEV, em lote, se cada candidato é
 *   mesmo a tentativa errada e se a fala fica de pé sem ela. O Claude só
 *   entra quando o JEV falha ou fica em dúvida.
 *
 * Candidato demais é barato (o JEV custa centavos por mil perguntas);
 * candidato de menos é a frase errada no vídeo do cliente. Por isso a busca é
 * larga e a decisão é estreita.
 */

export type TipoDeRetomada = "retomada" | "recomeco" | "falso-comeco" | "marcador" | "gaguejo" | "eco";

export type CandidatoDeRetomada = {
  id: string;
  tipo: TipoDeRetomada;
  /** Índices (inclusive) das palavras que SAEM. */
  de: number;
  ate: number;
  /** Índice da primeira palavra que fica depois do corte (a tomada boa). */
  boa: number;
  /** A semelhança medida (0 a 1), só para o relatório. */
  semelhanca: number;
};

/** Sem acento, sem pontuação, minúscula: compara palavra com palavra. */
export function chave(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function fechaFrase(palavra: string): boolean {
  return /[.!?…]["'”’)\]]?\s*$/.test(palavra);
}

/**
 * Maior subsequência comum entre duas listas de chaves, com as chaves que
 * casaram. Retomada de verdade repete a frase NA ORDEM; palavra solta que
 * reaparece em outra ordem é assunto voltando.
 */
export function subsequenciaComum(a: string[], b: string[]): { tamanho: number; casadas: string[]; primeiraEmA: number; primeiraEmB: number } {
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a[i] && a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const casadas: string[] = [];
  let primeiraEmA = -1;
  let primeiraEmB = -1;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      if (primeiraEmA < 0) {
        primeiraEmA = i;
        primeiraEmB = j;
      }
      casadas.push(a[i]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return { tamanho: t[0][0], casadas, primeiraEmA, primeiraEmB };
}

/** Pedaço de fala: termina em fim de frase, em pausa, ou em vírgula com respiro. */
export type Pedaco = { i0: number; i1: number };

export function pedacosDaFala(p: Word[]): Pedaco[] {
  const saida: Pedaco[] = [];
  let i0 = 0;
  for (let i = 0; i < p.length; i++) {
    const buraco = i + 1 < p.length ? p[i + 1].start - p[i].end : Infinity;
    if (fechaFrase(p[i].word) || buraco >= 0.5 || (/,\s*$/.test(p[i].word) && buraco >= 0.3) || i === p.length - 1) {
      saida.push({ i0, i1: i });
      i0 = i + 1;
    }
  }
  return saida;
}

/** Palavras que, sozinhas, não provam nada (aparecem em toda frase). */
const FRACAS = new Set([
  "e", "o", "a", "os", "as", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "um", "uma",
  "que", "eu", "se", "me", "te", "pra", "pro", "por", "com", "ne", "ai", "ta", "entao", "mas", "ou", "ele", "ela",
]);
const forte = (k: string) => k.length >= 3 && !FRACAS.has(k);

/**
 * Os marcadores de "errei, vou de novo". A lista é de expressões que, ditas
 * no meio da gravação, quase sempre anunciam o refazer; a decisão final
 * continua no JEV, porque "não, pera" também pode ser fala de personagem.
 */
const MARCADORES: string[][] = [
  ["nao", "pera"], ["pera", "ai"], ["perai"], ["peraí"], ["pera"],
  ["deixa", "eu", "falar", "de", "novo"], ["deixa", "eu", "comecar", "de", "novo"], ["vou", "comecar", "de", "novo"],
  ["vou", "falar", "de", "novo"], ["deixa", "eu", "repetir"], ["deixa", "eu", "refazer"], ["deixa", "eu", "reformular"],
  ["comecando", "de", "novo"], ["corta", "isso"], ["corta"], ["me", "enrolei"], ["falei", "errado"], ["errei"],
  ["nao", "nao", "e", "isso"], ["melhor", "dizendo"], ["ou", "melhor"],
];

/** Palavras curtas que são palavra de verdade: não contam como sílaba gaguejada. */
const PALAVRAS_CURTAS = new Set([
  "de", "do", "da", "no", "na", "em", "um", "pro", "pra", "com", "se", "que", "por", "para", "mais", "me", "te",
  "o", "a", "os", "as", "e", "eu", "tu", "ele", "ela", "nos", "vos", "ou", "so", "ja", "la", "ca", "mas", "sem",
  "nao", "sim", "bem", "mal", "ser", "ter", "ver", "dar", "ir", "vai", "foi", "faz", "diz", "sei", "sou", "tem",
]);

/**
 * ENUMERAÇÃO não é retomada: "é o produto mais caro, é o computador mais
 * caro, é o celular mais caro" e "pra algumas coisas, pra algumas pessoas,
 * pra alguns projetos". A assinatura é o molde aparecendo uma TERCEIRA vez
 * logo depois; quem erra e refaz diz duas vezes. Medido no vídeo de 19 min
 * de 03/10: sem esta guarda, o Claude cortou as duas primeiras peças da lista.
 */
function ehEnumeracao(k: string[], i: number, j: number): boolean {
  const passo = j - i;
  // Pedaço repetido IGUAL ("que é a que é a que é o") é gagueira, não lista:
  // item de lista muda por definição.
  if (k.slice(i, j).join(" ") === k.slice(j, j + passo).join(" ")) return false;
  const molde = k.slice(i, Math.min(i + 3, j)).filter(Boolean);
  for (let t = j + 2; t <= Math.min(k.length - 1, j + passo + 4); t++) {
    if (k[t] !== k[i]) continue;
    const terceira = k.slice(t, t + molde.length + 2);
    if (subsequenciaComum(molde, terceira).tamanho >= Math.min(2, molde.length)) return true;
  }
  return false;
}

/**
 * Todos os candidatos da gravação. Não decide nada: devolve o que um editor
 * humano pararia para ouvir. Candidatos podem se sobrepor; quem decide
 * escolhe entre eles.
 */
export function candidatosDeRetomada(p: Word[]): CandidatoDeRetomada[] {
  const k = p.map((w) => chave(w.word));
  const pedacos = pedacosDaFala(p);
  const saida: CandidatoDeRetomada[] = [];
  const vistos = new Set<string>();
  const add = (tipo: TipoDeRetomada, de: number, ate: number, boa: number, semelhanca: number) => {
    if (de < 0 || ate < de || ate >= p.length || boa > p.length) return;
    const id = `${tipo[0]}${de}-${ate}`;
    if (vistos.has(`${de}-${ate}`)) return;
    vistos.add(`${de}-${ate}`);
    saida.push({ id, tipo, de, ate, boa, semelhanca: +semelhanca.toFixed(2) });
  };

  // 1. RETOMADA entre pedaços: o pedaço A e o B (ou o C, com um aparte curto
  // no meio) começam do mesmo jeito e repetem A em ordem. Sai A (e o aparte).
  for (let u = 0; u < pedacos.length - 1; u++) {
    const A = pedacos[u];
    const tamA = A.i1 - A.i0 + 1;
    if (tamA < 2 || tamA > 45) continue;
    if (p[A.i1].end - p[A.i0].start > 15) continue;
    const ka = k.slice(A.i0, A.i1 + 1);
    for (const salto of [1, 2]) {
      const B = pedacos[u + salto];
      if (!B) break;
      if (salto === 2) {
        const meio = pedacos[u + 1];
        if (meio.i1 - meio.i0 + 1 > 10) break;
      }
      if (p[B.i0].start - p[A.i1].end > 6) break;
      const kb = k.slice(B.i0, Math.min(p.length, B.i0 + tamA + 6));
      const lcs = subsequenciaComum(ka, kb);
      const fortes = lcs.casadas.filter(forte).length;
      const razao = lcs.tamanho / ka.filter(Boolean).length;
      if (lcs.tamanho >= 2 && fortes >= 1 && razao >= 0.5 && lcs.primeiraEmA <= 3 && lcs.primeiraEmB <= 3 && !ehEnumeracao(k, A.i0, B.i0)) {
        add("retomada", A.i0, B.i0 - 1, B.i0, razao);
      }
    }
  }

  // 2. RECOMEÇO dentro do fluxo: a pessoa volta para a palavra de onde partiu
  // e repete o que tinha dito, sem pausa que separe pedaço. "eu saí do, bom,
  // então, eu quero falar como eu saí do CLT". Distância mínima de 3 palavras
  // (a repetição colada já sai por `detectarRepeticoes`).
  for (let i = 0; i < p.length; i++) {
    if (!k[i]) continue;
    for (let j = i + 3; j <= Math.min(p.length - 2, i + 14); j++) {
      if (k[j] !== k[i]) continue;
      // Fim de frase no meio do fragmento: é outra frase, não recomeço (o
      // caso entre pedaços já é o 1).
      if (p.slice(i, j - 1).some((w) => fechaFrase(w.word))) break;
      const f = k.slice(i, j);
      const lcs = subsequenciaComum(f, k.slice(j, Math.min(p.length, j + f.length + 5)));
      const minimo = Math.max(2, Math.ceil(0.6 * f.filter(Boolean).length));
      if (lcs.tamanho >= minimo && lcs.casadas.some(forte) && lcs.primeiraEmA === 0 && lcs.primeiraEmB === 0 && !ehEnumeracao(k, i, j)) {
        add("recomeco", i, j - 1, j, lcs.tamanho / f.length);
      }
      break;
    }
  }

  // 2b. ECO DA PALAVRA (05/10): a palavra forte que fecha a frase volta
  // colada, sozinha, e fica pendurada numa pausa. "Lembra Jesus com Marta e
  // Maria? Maria [0,8 s] nos pés de Jesus" (cmurtv2zg, corte 0): o Bruno
  // tropeçou no nome e repetiu; a transcrição junta a tomada boa numa palavra
  // só, então nem a repetição colada (a primeira cópia fecha frase) nem o
  // falso começo (a prova não acha "Maria" depois) pegavam. Vem antes do
  // falso começo para o mesmo trecho ficar com a prova certa (`ecoDaPalavra`).
  for (let i = 0; i + 2 < p.length; i++) {
    if (ecoDaPalavra(p, i + 1)) add("eco", i + 1, i + 1, i + 2, 1);
  }

  // 3. FALSO COMEÇO: fragmento de 1 a 4 palavras que não fecha frase, solto
  // por pausa, e a fala segue com outra coisa. "Mas, é, [1,2 s] o que Deus
  // nos pede". Também pega o contrário ("Então é você buscar, [1,2 s]
  // entender quais são"), que NÃO é falso começo: o JEV separa os dois.
  for (let u = 0; u < pedacos.length - 1; u++) {
    const A = pedacos[u];
    const tam = A.i1 - A.i0 + 1;
    if (tam > 4 || fechaFrase(p[A.i1].word)) continue;
    const depois = p[A.i1 + 1].start - p[A.i1].end;
    if (depois < 0.5) continue;
    add("falso-comeco", A.i0, A.i1, A.i1 + 1, 0);
  }

  // 4. MARCADOR: "não, pera", "deixa eu falar de novo", "errei". Sai a
  // tentativa (o pedaço antes do marcador) e o próprio marcador.
  for (let i = 0; i < p.length; i++) {
    for (const m of MARCADORES) {
      if (m.every((x, n) => k[i + n] === x)) {
        const fim = i + m.length - 1;
        const doMarcador = pedacos.findIndex((q) => q.i0 <= i && q.i1 >= i);
        const ped = pedacos[doMarcador];
        // A tentativa: do começo do pedaço do marcador, ou do pedaço anterior
        // quando o marcador abre o pedaço dele.
        const inicio = ped && ped.i0 < i ? ped.i0 : (pedacos[doMarcador - 1]?.i0 ?? i);
        if (p[i].start - p[inicio].start <= 15) add("marcador", inicio, fim, fim + 1, 0);
        break;
      }
    }
  }

  // 5. GAGUEJO de sílaba: "pro- produtividade", "ex excelência". A primeira
  // é começo da segunda, colada nela, e não é palavra curta de verdade.
  for (let i = 0; i + 1 < p.length; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (a.length < 2 || b.length < a.length + 2 || !b.startsWith(a)) continue;
    if (p[i + 1].start - p[i].end > 0.6) continue;
    if (PALAVRAS_CURTAS.has(a) && !/-$/.test(p[i].word)) continue;
    add("gaguejo", i, i, i + 1, a.length / b.length);
  }

  // O recomeço por janela desliza: "é o produto mais caro, é o computador
  // mais caro" gera um candidato a cada palavra deslocada. Fica só o
  // primeiro de cada trecho, e nenhum que encoste numa retomada, num
  // marcador ou num falso começo (esses têm prova melhor).
  const fortes = saida.filter((c) => c.tipo !== "recomeco");
  const comProva = fortes.filter((c) => c.tipo === "retomada" || c.tipo === "marcador");
  const recomecos: CandidatoDeRetomada[] = [];
  for (const c of saida.filter((x) => x.tipo === "recomeco").sort((x, y) => x.de - y.de)) {
    const encosta = (x: CandidatoDeRetomada) => !(c.ate < x.de || c.de > x.ate);
    if (comProva.some(encosta) || recomecos.some(encosta)) continue;
    recomecos.push(c);
  }
  return [...fortes, ...recomecos].sort((x, y) => x.de - y.de || y.ate - x.ate);
}

/**
 * Este trecho removido é uma RETOMADA (o que sai é dito de novo logo depois)?
 * Serve à conferência do texto final: a emenda longa é defeito quando cola
 * duas ideias, e é a edição certa quando tira a tomada errada.
 */
export function ehTomadaRefeita(palavras: Array<{ word: string }>, de: number, ate: number): boolean {
  const ka = palavras.slice(de, ate + 1).map((w) => chave(w.word)).filter(Boolean);
  if (ka.length < 2) return false;
  const kb = palavras.slice(ate + 1, ate + 1 + ka.length + 8).map((w) => chave(w.word));
  const lcs = subsequenciaComum(ka, kb);
  return lcs.tamanho >= 2 && lcs.casadas.some(forte) && lcs.tamanho / ka.length >= 0.5 && lcs.primeiraEmA <= 3 && lcs.primeiraEmB <= 3;
}

/**
 * A PROVA EM CÓDIGO de que um corte aprovado (pelo JEV ou pelo Claude) só tira
 * o que a pessoa disse de novo: das palavras de conteúdo do trecho, no máximo
 * um quarto pode faltar no que vem logo depois. Uma palavra trocada passa ("pra
 * uma cidade" refeito como "pra uma nação"); uma ideia inteira não passa.
 *
 * Medido em 03/10 no vídeo de 19 min: o Claude aprovou "faz força e não tenha
 * vergonha do que vão falar" porque a frase seguinte repetia "não tenha
 * vergonha"; o "faz força" sumiria. Esta guarda recusa. Mesmo papel do
 * `cortePlausivel` da limpeza: o modelo decide, o código confere.
 */
export function provaDeRetomada(palavras: Array<{ word: string }>, de: number, ate: number): boolean {
  const doCorte = palavras.slice(de, ate + 1).map((w) => chave(w.word)).filter(forte);
  if (!doCorte.length) return true;
  const depois = new Set(palavras.slice(ate + 1, ate + 1 + (ate - de + 1) + 10).map((w) => chave(w.word)));
  const faltam = doCorte.filter((k) => !depois.has(k)).length;
  return faltam / doCorte.length <= 0.25;
}

/**
 * FRASE INTERROMPIDA SEGUIDA DA MESMA FRASE RECOMEÇADA (03/10), a certeza que
 * dispensa modelo. O caso que chegou ao Bruno no vídeo pronto, aos 100 s:
 *
 *   "E eu evitei usar a palavra, e eu evitei usar a palavra produtividade"
 *
 * A assinatura, toda medível:
 * - a tentativa NÃO fecha frase (termina em vírgula, hífen ou nada);
 * - ela é PREFIXO da tomada seguinte, na ordem (uma palavra trocada passa a
 *   partir de 5 palavras: "pagou em março" refeito como "pagou em abril");
 * - a tomada seguinte CONTINUA depois do prefixo (senão é ênfase: "você
 *   precisa orar, você precisa orar.");
 * - a prova de que nada de conteúdo some (`provaDeRetomada`).
 *
 * Lista não passa: o item muda logo na primeira palavra forte e, sem a
 * troca tolerada (menos de 5 palavras), deixa de ser prefixo.
 */
export function tentativaIncompletaRefeita(p: Array<{ word: string }>, c: Pick<CandidatoDeRetomada, "tipo" | "de" | "ate" | "boa">): boolean {
  if (c.tipo !== "retomada" && c.tipo !== "recomeco") return false;
  if (c.boa !== c.ate + 1 || fechaFrase(p[c.ate].word)) return false;
  const ka0 = p.slice(c.de, c.ate + 1).map((w) => chave(w.word));
  if (ka0.filter(Boolean).length < 3 || ka0.length > 25) return false;
  // A tentativa pode abrir com gagueira ("E e eu evitei...") e a tomada boa
  // com um conectivo ("então, eu evitei..."): o alinhamento pula até duas
  // palavras no começo da tentativa e uma no começo da tomada boa. O que é
  // pulado na tentativa sai junto com ela.
  for (let sa = 0; sa <= 2; sa++) {
    for (let sb = 0; sb <= 1; sb++) {
      const ka = ka0.slice(sa);
      if (ka.length < 3 || !ka[0]) continue;
      const i0 = c.boa + sb;
      const kb = p.slice(i0, i0 + ka.length + 1).map((w) => chave(w.word));
      if (kb.length <= ka.length) continue;
      let iguais = 0;
      for (let i = 0; i < ka.length; i++) if (ka[i] === kb[i]) iguais++;
      const tolera = ka.length >= 5 ? 1 : 0;
      if (ka[0] !== kb[0] || iguais < ka.length - tolera) continue;
      if (!ka.some((k, i) => forte(k) && kb[i] === k)) continue;
      // A tomada boa continua: a palavra do fim do prefixo não fecha frase e
      // há fala depois dela.
      const fimDoPrefixo = i0 + ka.length - 1;
      if (!p[fimDoPrefixo + 1] || fechaFrase(p[fimDoPrefixo].word)) continue;
      return provaDeRetomada(p, c.de, c.ate);
    }
  }
  return false;
}

/**
 * O ECO DA PALAVRA (05/10), certeza por código: a palavra `i` repete a
 * anterior, que é forte (nome, substantivo; 4 letras ou mais) e fecha a frase
 * ou a oração ("Maria?", "Maria,"); as duas estão coladas (menos de 0,6 s) e a
 * cópia fica solta, sem fechar frase, seguida de pausa de 0,3 s ou mais (na
 * fala já limpa do corte a pausa de 0,8 s da gravação sobra com 0,36 s). Nada
 * de conteúdo some ao tirar a cópia: a palavra acabou de ser dita. "Sim. Sim,
 * mas veja" não passa (a cópia emenda na fala sem pausa).
 */
export function ecoDaPalavra(p: Array<{ word: string; start: number; end: number }>, i: number): boolean {
  if (i < 1 || i + 1 >= p.length) return false;
  const k = chave(p[i].word);
  if (k.length < 4 || FRACAS.has(k) || chave(p[i - 1].word) !== k) return false;
  if (!fechaFrase(p[i - 1].word) && !/,\s*$/.test(p[i - 1].word)) return false;
  if (fechaFrase(p[i].word)) return false;
  if (p[i].start - p[i - 1].end >= 0.6) return false;
  return p[i + 1].start - p[i].end >= 0.3;
}

/** O texto de [de..ate], para o relatório e para o JEV. */
export function textoDe(p: Array<{ word: string }>, de: number, ate: number): string {
  return p.slice(Math.max(0, de), Math.max(0, ate + 1)).map((w) => w.word).join(" ");
}
