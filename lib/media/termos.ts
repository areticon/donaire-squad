import type { Word } from "@/lib/media/transcribe";

/**
 * Os termos do negócio do cliente, e a correção determinística da transcrição.
 *
 * Nasceu do teste do Bruno em 30/08: a legenda escreveu "Arétcon" para
 * Areticon e "dois reais" para "dor real". O modelo de transcrição não conhece
 * o vocabulário de cada cliente, e o `keyterm` da Deepgram satura com mais de
 * cinco termos (medido em 18/08), então o glossário precisa de uma segunda
 * camada que não dependa do modelo: comparar cada palavra transcrita com os
 * termos e trocar a que ficou perto o bastante.
 *
 * É a regra deste projeto: decisão de modelo sempre com rede determinística
 * por baixo. O keyterm ajuda a Deepgram a acertar; esta função conserta o que
 * ela ainda errar, e vale também para transcrição antiga, sem transcrever de
 * novo.
 */

/** Quantos termos o cliente pode cadastrar. Acima disso é lista, não glossário. */
export const MAX_TERMOS = 30;

/**
 * UMA TROCA EXPLÍCITA (30/09): "Cloud => Claude". O Bruno viu várias vezes a
 * legenda escrever "Cloud" quando ele fala "Claude", com "Claude" já cadastrado
 * nos termos: a comparação por semelhança não pega o par (cloud x claude dá
 * 0,67, abaixo do limiar de 0,75), e baixar o limiar trocaria palavra comum
 * por termo do cliente. Então o cliente diz a troca, na tela de roteiro ou nas
 * configurações, e ela vale por igualdade exata (sem acento, sem caixa), antes
 * da semelhança. Mora no mesmo texto de `Project.videoTerms`, sem coluna nova.
 */
export type Troca = { errado: string; certo: string };

/** A lista de termos, com as trocas explícitas penduradas (quem fatia a lista, como o keyterm, não precisa delas). */
export type ListaDeTermos = string[] & { trocas?: Troca[] };

const SETA_DA_TROCA = /\s*(?:=>|->|→)\s*/;

/** Lê "errado => certo" (ou -> e →); devolve null quando a entrada é um termo simples. */
export function lerTroca(entrada: string): Troca | null {
  const partes = entrada.split(SETA_DA_TROCA);
  if (partes.length !== 2) return null;
  const errado = partes[0].trim().replace(/\s+/g, " ");
  const certo = partes[1].trim().replace(/\s+/g, " ");
  if (!normalizar(errado) || !normalizar(certo) || normalizar(errado) === normalizar(certo)) return null;
  return { errado, certo };
}

export function parseTermos(texto: string | null | undefined): ListaDeTermos {
  if (!texto) return [];
  const vistos = new Set<string>();
  const termos: ListaDeTermos = [];
  const trocas: Troca[] = [];
  for (const bruto of texto.split(/[,\n;]+/)) {
    // A troca entra nas duas listas: o lado CERTO vira termo (reforça o keyterm
    // da transcrição e a comparação por semelhança), e o par vira troca exata.
    const troca = lerTroca(bruto);
    if (troca && trocas.length < MAX_TERMOS) trocas.push(troca);
    const t = (troca ? troca.certo : bruto).trim().replace(/\s+/g, " ");
    if (t.length < 2) continue;
    const chave = normalizar(t);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    termos.push(t);
    if (termos.length >= MAX_TERMOS) break;
  }
  if (trocas.length) termos.trocas = trocas;
  return termos;
}

/** O texto de `videoTerms` com uma troca a mais (a mesma troca errada substitui a anterior). */
export function comTroca(texto: string | null | undefined, troca: Troca): string {
  const entradas = (texto ?? "")
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => {
      const t = lerTroca(e);
      return !t || normalizar(t.errado) !== normalizar(troca.errado);
    });
  entradas.push(`${troca.errado} => ${troca.certo}`);
  return entradas.join(", ");
}

/**
 * Aplica as trocas explícitas: a janela de palavras (1 a N, N = palavras do
 * lado errado) que bate EXATAMENTE com o errado vira o certo, com o tempo de
 * fim da última palavra preservado (mesmo cuidado de `aplicarTermos`).
 */
function aplicarTrocas(palavras: Word[], trocas: Troca[]): Word[] {
  const lista = trocas
    .map((t) => ({ ...t, chave: normalizar(t.errado), n: t.errado.split(/\s+/).length }))
    .filter((t) => t.chave.length >= 2)
    // A troca mais longa primeiro: "Cloud Code" ganha de "Cloud".
    .sort((a, b) => b.n - a.n);
  if (!lista.length) return palavras;
  const saida: Word[] = [];
  let i = 0;
  while (i < palavras.length) {
    let feita = false;
    for (const t of lista) {
      if (i + t.n > palavras.length) continue;
      const janela = palavras.slice(i, i + t.n);
      if (normalizar(janela.map((w) => partir(w.word).miolo).join("")) !== t.chave) continue;
      const { antes } = partir(janela[0].word);
      const { depois } = partir(janela[janela.length - 1].word);
      saida.push({ ...janela[0], word: `${antes}${t.certo}${depois}`, end: janela[janela.length - 1].end });
      i += t.n;
      feita = true;
      break;
    }
    if (!feita) {
      saida.push(palavras[i]);
      i += 1;
    }
  }
  return saida;
}

/** Minúsculas, sem acento, só letras e números. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 é igual, 0 é nada a ver. */
function semelhanca(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  if (!maior) return 0;
  return 1 - levenshtein(a, b) / maior;
}

/**
 * O quão perto uma palavra transcrita precisa chegar do termo para ser
 * trocada. Termo curto exige mais, porque "sas" e "saas" são vizinhos mas
 * "casa" e "caso" também são, e trocar palavra comum por termo do cliente
 * seria pior que o erro original.
 */
function limiar(termoNormalizado: string): number {
  if (termoNormalizado.length <= 5) return 0.74;
  if (termoNormalizado.length <= 8) return 0.75;
  return 0.7;
}

/** Separa a pontuação que fica grudada na palavra transcrita. */
function partir(palavra: string): { miolo: string; antes: string; depois: string } {
  const m = palavra.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  return m ? { antes: m[1], miolo: m[2], depois: m[3] } : { antes: "", miolo: palavra, depois: "" };
}

/**
 * Devolve as palavras com os termos do cliente aplicados. Cada termo é
 * comparado com janelas de 1 a N palavras (N = quantas palavras o termo tem,
 * mais uma, porque "Areticon" às vezes sai como "arete com"). Quando uma
 * janela casa, a primeira palavra recebe o termo e as outras somem, com o
 * tempo de fim da última preservado, para a legenda continuar sincronizada.
 */
export function aplicarTermos(palavras: Word[], termosDoCliente: ListaDeTermos): Word[] {
  // As trocas explícitas vêm antes: são decisão do cliente, e a semelhança
  // depois só completa o que ele não disse.
  if (termosDoCliente.trocas?.length) palavras = aplicarTrocas(palavras, termosDoCliente.trocas);
  const termos: string[] = termosDoCliente;
  const lista = termos
    .map((t) => ({ termo: t, chave: normalizar(t), n: t.split(/\s+/).length }))
    .filter((t) => t.chave.length >= 3);
  if (!lista.length || !palavras.length) return palavras;

  const saida: Word[] = [];
  let i = 0;
  while (i < palavras.length) {
    let melhor: { fim: number; termo: string; nota: number; chave: string } | null = null;
    for (const t of lista) {
      const maxJanela = Math.min(t.n + 1, palavras.length - i);
      for (let n = 1; n <= maxJanela; n++) {
        const janela = palavras.slice(i, i + n);
        const chave = normalizar(janela.map((w) => partir(w.word).miolo).join(""));
        if (!chave) continue;
        // Janela de várias palavras só vale se cada pedaço for curto: juntar
        // duas palavras inteiras e comuns para casar um termo é falso positivo.
        if (n > t.n && chave.length > t.chave.length + 2) continue;
        // Termo curto exige a mesma letra inicial: "sas" vira SaaS, "casa" não.
        if (t.chave.length <= 5 && chave[0] !== t.chave[0]) continue;
        const nota = semelhanca(chave, t.chave);
        if (nota >= limiar(t.chave) && (!melhor || nota > melhor.nota)) {
          melhor = { fim: i + n, termo: t.termo, nota, chave: t.chave };
        }
      }
    }
    // Lookahead: se a mesma janela SEM a primeira palavra casa tão bem ou
    // melhor, a primeira palavra é artigo ou preposição e fica onde está.
    // Sem isto "a Areticon" virava "Areticon" e sumia o "a".
    if (melhor && melhor.fim - i > 1) {
      const semPrimeira = normalizar(
        palavras.slice(i + 1, melhor.fim).map((w) => partir(w.word).miolo).join("")
      );
      if (semPrimeira && semelhanca(semPrimeira, melhor.chave) >= melhor.nota) melhor = null;
    }
    if (!melhor) {
      saida.push(palavras[i]);
      i += 1;
      continue;
    }
    const primeira = palavras[i];
    const ultima = palavras[melhor.fim - 1];
    const { antes } = partir(primeira.word);
    const { depois } = partir(ultima.word);
    saida.push({
      ...primeira,
      word: `${antes}${melhor.termo}${depois}`,
      end: ultima.end,
    });
    i = melhor.fim;
  }
  return saida;
}
