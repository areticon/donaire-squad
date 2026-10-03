/**
 * OS NÚMEROS QUE O NARRADOR FALA, lidos por código.
 *
 * A guarda de número sem lastro (`afirmacoesSemLastro`, em lib/pipeline/executar.ts)
 * compara DÍGITO com DÍGITO e por isso nunca enxergou o roteiro de vídeo: ali
 * o número vem escrito por extenso, porque é o que o narrador vai dizer.
 * O vídeo do dia 21 abriu com "você recusou um orçamento de mil e quinhentos
 * reais", e o post nunca disse isso: ele citava uma FAIXA de mercado (de 500 a
 * 3.000). Como "mil e quinhentos" não é "1500" para uma expressão regular, a
 * invenção passou pelo único lugar do produto que sabe reconhecê-la.
 *
 * Este módulo é puro e faz uma coisa só: transformar o número por extenso em
 * dígito, para a comparação com o texto do post voltar a ser possível.
 */

/** Unidades, dezenas e centenas. O acento sai antes da busca. */
const VALORES: Record<string, number> = {
  zero: 0,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100,
  duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};

/** Multiplicadores. "mil" sozinho vale 1.000; "dois mil" vale 2.000. */
const ESCALAS: Record<string, number> = {
  mil: 1_000,
  milhao: 1_000_000, milhoes: 1_000_000,
  bilhao: 1_000_000_000, bilhoes: 1_000_000_000,
};

/**
 * As palavras que só contam como número quando estão acompanhadas.
 *
 * "um orçamento" é artigo, não quantidade, e tratá-lo como o número 1 encheria
 * a guarda de alarme falso em qualquer frase em português. Já "um milhão" e
 * "mil e quinhentos" são número, porque vêm com escala ou com corrente.
 */
const SOZINHAS_NAO_CONTAM = new Set(["um", "uma", "zero"]);

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Todos os números do texto, em dígitos, venham eles escritos por extenso
 * ("quatro mil e oitocentos") ou já em algarismo ("R$ 4.800", "4,5").
 * O separador de milhar sai e a vírgula decimal vira ponto, como na guarda
 * de lastro, para os dois lados da comparação falarem a mesma língua.
 */
export function numerosDoTexto(texto: string): string[] {
  const achados: string[] = [];

  // 1. Os que já são algarismo.
  const normalizado = texto.replace(/[.,](?=\d{3}(?!\d))/g, "").replace(/(\d),(\d)/g, "$1.$2");
  for (const m of normalizado.matchAll(/\d+(?:\.\d+)?/g)) achados.push(m[0]);

  // 2. Os que estão por extenso. Cada corrente de palavras de número vira um
  //    valor; qualquer outra palavra ou pontuação fecha a corrente.
  const palavras = semAcento(texto.toLowerCase()).split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let grupo = 0;
  let tokens = 0;
  let temEscala = false;
  let ultimaFoiNumero = false;

  const fechar = () => {
    const valor = total + grupo;
    // Corrente de uma palavra só que é artigo ("um") não é número.
    const soArtigo = tokens === 1 && !temEscala && valor <= 1;
    if (tokens > 0 && !soArtigo && valor > 0) achados.push(String(valor));
    total = 0;
    grupo = 0;
    tokens = 0;
    temEscala = false;
    ultimaFoiNumero = false;
  };

  for (const p of palavras) {
    if (p === "e") {
      // O "e" só continua a corrente se ela já começou ("mil E quinhentos").
      if (!ultimaFoiNumero) fechar();
      continue;
    }
    if (p in VALORES) {
      // Duas centenas seguidas sem escala são dois números, não um só
      // ("trezentos" e depois "quinhentos" em frases coladas).
      if (ultimaFoiNumero && VALORES[p] >= 100 && grupo >= 100) fechar();
      if (SOZINHAS_NAO_CONTAM.has(p) && tokens === 0) {
        // Guarda o 1 provisoriamente: vira número se vier "mil" ou "milhão".
        grupo += VALORES[p];
        tokens += 1;
        ultimaFoiNumero = true;
        continue;
      }
      grupo += VALORES[p];
      tokens += 1;
      ultimaFoiNumero = true;
      continue;
    }
    if (p in ESCALAS) {
      const escala = ESCALAS[p];
      total += (grupo || 1) * escala;
      grupo = 0;
      tokens += 1;
      temEscala = true;
      ultimaFoiNumero = true;
      continue;
    }
    fechar();
  }
  fechar();

  return [...new Set(achados)];
}

/**
 * O número AFIRMA algo sobre o mundo, ou é só uma contagem?
 *
 * Mesma linha da guarda de lastro do texto: "quatro horas por semana" é
 * contagem e fica; "mil e quinhentos reais" é afirmação e precisa de lastro.
 * Sem esta separação a guarda cortaria qualquer frase com um número pequeno,
 * que foi o maior estrago de qualidade medido em 20/09 no texto.
 */
export function pareceAfirmacao(numero: string, frase: string): boolean {
  if (numero.includes(".")) return true; // decimal é sempre dado
  if (Number(numero) >= 100) return true;
  const semAcentoFrase = semAcento(frase.toLowerCase());
  return /(r\$|us\$|€|reais|d[oó]lares|por cento|%|mil\b|milh|bilh)/i.test(semAcentoFrase);
}
