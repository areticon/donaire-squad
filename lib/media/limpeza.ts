import { askClaude } from "@/lib/claude";
import type { Word } from "@/lib/media/transcribe";
import type { Remocao } from "@/lib/media/edicao";

/**
 * A limpeza da fala: hesitação, muleta e recomeço de frase.
 *
 * Existe porque a remoção de pausas não resolve o problema que o Bruno relatou.
 * Pausa é SILÊNCIO, e hesitação TEM ÁUDIO: o "é" arrastado e o "bom, vamos lá"
 * repetido atravessavam a edição inteira sem serem tocados.
 *
 * Medido na gravação real dele: 147 "é", 78 "então", 44 "né", 35 "aí", e o
 * vídeo abre com "Bom, vamos lá gente. Quero falar com vocês aqui de tema
 * sobre, é, a minha trajetória", com um recomeço logo depois ("eu saí do, bom,
 * então, eu quero falar como eu saí do CLT").
 *
 * ## Por que isso precisa de um agente, e não de uma lista de palavras
 *
 * Cortar toda ocorrência de "é" destruiria a fala: "é" é verbo. "Então" liga
 * duas ideias metade das vezes e é muleta na outra metade. A diferença está no
 * PAPEL da palavra na frase, não na palavra, e isso só se decide lendo.
 *
 * ## Por que o corte é por PALAVRA e não por tempo
 *
 * O agente devolve índices de palavras, e os tempos saem da transcrição. Se ele
 * devolvesse segundos, um erro de meio segundo cortaria a sílaba do vizinho, e
 * o resultado seria pior que a hesitação original.
 */

export type Limpeza = {
  /** Índice da primeira palavra a remover, na lista de palavras. */
  de: number;
  /** Índice da última palavra a remover, inclusive. */
  ate: number;
  motivo: string;
};

const SISTEMA = `Você limpa a fala de uma gravação, marcando o que sai.

Recebe as palavras numeradas, com o tempo de cada uma. Devolva os intervalos que devem ser REMOVIDOS para o vídeo ficar melhor de assistir, sem mudar o que a pessoa disse.

O que SAI:

1. Hesitação: "é", "eh", "hum", "ahn", "ééé", arrastados ou soltos no meio da frase. Só quando NÃO forem parte do sentido.
2. Recomeço de frase: a pessoa começa, se interrompe e recomeça. Sai a primeira tentativa, fica a segunda. Exemplo: "eu saí do, bom, então, eu quero falar como eu saí do CLT" vira "eu quero falar como eu saí do CLT".
3. Repetição imediata da mesma palavra ou expressão: "o, o ponto é", "eu eu acho". Fica uma.
4. Abertura vazia de gravador: "bom, vamos lá gente", "então, vamos lá", quando não diz nada e só existe para a pessoa se ajeitar.
5. Muleta que não liga nada: "né" no fim de frase, "tipo" no meio, "aí" como enfeite.

O que FICA, e isto é mais importante que o que sai:

- "É" como VERBO. "Isso é caro" nunca vira "isso caro".
- "Então" como CONSEQUÊNCIA. "Não captamos, então voltei" precisa do então.
- "Aí" como TEMPO. "Aí eu voltei" está contando uma sequência.
- Qualquer palavra cuja remoção mude o sentido, quebre a gramática ou deixe a frase incompleta.
- Pausa para respirar entre ideias. Vídeo sem respiro cansa mais que vídeo com muleta.

Regras de decisão:

- **O corte só pode conter hesitação.** Se a hesitação está colada a uma palavra que a frase precisa, corte SÓ a hesitação. Exemplo: em "de tema sobre, é, a minha trajetória", o corte é apenas "é". Cortar "sobre, é" deixaria "de tema a minha trajetória", que está quebrado. Antes de devolver cada corte, leia a frase sem ele e confirme que ela continua de pé.
- Na dúvida, NÃO corte. Uma muleta que ficou é um detalhe; uma frase quebrada é um defeito que a pessoa ouve na hora.
- Não corte mais que 15% das palavras. Se você está cortando mais que isso, está cortando conteúdo.
- Cada intervalo precisa ser CURTO: no máximo 8 palavras. Intervalo longo é conteúdo disfarçado de hesitação.
- Não corte a última palavra de uma frase nem a primeira da seguinte, para não colar duas frases sem respiro.

Escreva o "motivo" em português do Brasil, em duas ou três palavras ("hesitação", "recomeço de frase", "muleta"). Nunca use travessão.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string.

Cada corte é uma lista de três posições: [primeira palavra, última palavra, motivo]. Formato compacto de propósito, para caber a resposta inteira:

{"c":[[12,14,"hesitação"],[40,45,"recomeço de frase"]]}`;

/** Teto de segurança: acima disto, alguma coisa saiu muito errada. */
const FRACAO_MAXIMA = 0.15;
// 12 e não 8: o teto vale DEPOIS da junção, e um recomeço partido em dois
// pedaços de 6 palavras é legítimo.
const PALAVRAS_MAXIMAS_POR_CORTE = 12;

/**
 * O vocabulário que pode sair sozinho.
 *
 * Curto de propósito: qualquer palavra fora desta lista só sai como parte de um
 * recomeço de frase comprovado, nunca por conta própria.
 */
const MULETAS = new Set([
  "é", "e", "eh", "ééé", "éé", "ah", "ahn", "hum", "hmm", "ó",
  "né", "ne", "tipo", "então", "entao", "aí", "ai", "assim", "bom",
  "cara", "sabe", "olha", "certo", "tá", "ta", "que", "o", "a",
  "vamos", "lá", "la", "gente", "pois", "enfim", "beleza",
]);

function normalizar(p: string): string {
  return p.toLowerCase().replace(/[.,!?;:"'()…]/g, "").trim();
}

/**
 * Este corte é seguro de aplicar?
 *
 * A verificação existe porque o modelo erra do jeito mais caro possível: no
 * teste de 23/08 ele devolveu "sobre, é" como hesitação, e cortar isso deixaria
 * "de tema a minha trajetória", quebrado. Com esforço baixo o erro se repetiu em
 * uma de duas rodadas, então não dá para confiar no cuidado dele.
 *
 * Duas formas de um corte ser legítimo:
 *
 * 1. Só tem muleta. Nenhuma palavra de conteúdo some.
 * 2. É repetição ou recomeço de frase, e a assinatura disso é objetiva: alguma
 *    palavra de conteúdo do corte APARECE DE NOVO logo antes ou logo depois
 *    dele. "eu saí do, bom, então, eu quero falar como eu saí do CLT" tem "eu"
 *    e "saí" reaparecendo depois; "eu, eu, eu sempre tive" tem "eu" antes,
 *    quando o que se corta é a última das repetições. Já "sobre, é" não tem
 *    "sobre" de nenhum dos lados, então não é recomeço, é engano.
 *
 * Olhar para os DOIS lados importa: sem isso, cortar a última repetição de uma
 * sequência era recusado, e é justamente o que o modelo faz na maior parte das
 * vezes.
 *
 * Qualquer outra coisa é descartada. Perder um corte bom custa uma muleta que
 * ficou; aceitar um corte ruim custa uma frase quebrada no vídeo do cliente.
 */
export function cortePlausivel(
  corte: Limpeza,
  palavras: Array<{ word: string }>,
  janela = 8
): boolean {
  const doCorte = palavras.slice(corte.de, corte.ate + 1).map((p) => normalizar(p.word));
  const conteudo = doCorte.filter((p) => p.length > 1 && !MULETAS.has(p));

  if (conteudo.length === 0) return true;

  const vizinhas = [
    ...palavras.slice(Math.max(0, corte.de - janela), corte.de),
    ...palavras.slice(corte.ate + 1, corte.ate + 1 + janela),
  ].map((p) => normalizar(p.word));

  return conteudo.some((p) => vizinhas.includes(p));
}

/**
 * Quantas palavras cabem numa chamada.
 *
 * A gravação do Bruno tem 4.529 palavras. Mandar tudo numa chamada faria o
 * modelo perder precisão no meio, e uma gravação de duas horas nem caberia.
 *
 * 800 e não 1200: no teste de 23/08, um bloco de 1200 palavras estourou o teto
 * de 8.000 tokens de SAÍDA e o JSON voltou cortado ao meio. O teto inclui o
 * pensamento, e a resposta é uma lista longa, então bloco menor é o que garante
 * a resposta inteira.
 */
const PALAVRAS_POR_BLOCO = 800;

export async function detectarHesitacao(
  palavras: Word[],
  usageCtx?: { projectId?: string }
): Promise<Limpeza[]> {
  if (palavras.length < 50) return [];

  const blocos: Array<{ inicio: number; palavras: Word[] }> = [];
  for (let i = 0; i < palavras.length; i += PALAVRAS_POR_BLOCO) {
    blocos.push({ inicio: i, palavras: palavras.slice(i, i + PALAVRAS_POR_BLOCO) });
  }

  const porBloco = await Promise.all(
    blocos.map(async ({ inicio, palavras: bloco }) => {
      const numeradas = bloco
        .map((p, i) => `${inicio + i}:${p.word}`)
        .join(" ");

      try {
        const resposta = await askClaude(
          SISTEMA,
          `Palavras ${inicio} a ${inicio + bloco.length - 1}:\n\n${numeradas}`,
          // 16000, e não 8000: o teto inclui o pensamento, e com 8000 o JSON
          // voltava truncado no meio de um corte (teste de 23/08). Teto alto
          // não encarece: o cobrado é o que o modelo gera.
          {
            maxTokens: 16000,
            // Esforço baixo, com verificação em código do que voltou. Medido:
            // o alto gastava 10.213 tokens de saída contra 2.500 do baixo, e
            // entregava o mesmo, porque achar muleta é leitura e não raciocínio.
            // O que o baixo erra, `cortePlausivel` recusa.
            effort: "low",
            usage: { operation: "video_limpeza", ...usageCtx },
          }
        );
        const limpo = resposta
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "");
        const dados = JSON.parse(limpo) as { c?: Array<[number, number, string]> };
        return (dados.c ?? []).map(([de, ate, motivo]) => ({ de, ate, motivo }));
      } catch {
        // Um bloco que falha não derruba a limpeza inteira: o resto do vídeo
        // continua limpo, e a parte dele sai como estava.
        return [];
      }
    })
  );

  return sanearLimpeza(porBloco.flat(), palavras);
}

/**
 * Descarta o que o agente devolveu errado.
 *
 * Vale mais que o prompt: o modelo é instruído a não exagerar, mas quem garante
 * é isto. Um corte inválido não vira frase quebrada no vídeo do cliente, vira
 * corte descartado.
 */
export function sanearLimpeza(
  cortes: Limpeza[],
  palavras: Array<{ word: string }>
): Limpeza[] {
  const totalDePalavras = palavras.length;
  const validos = cortes
    .filter(
      (c) =>
        Number.isInteger(c.de) &&
        Number.isInteger(c.ate) &&
        c.de >= 0 &&
        c.ate >= c.de &&
        c.ate < totalDePalavras
    )
    .sort((a, b) => a.de - b.de);

  // Junta ANTES de validar, e com folga de duas palavras.
  //
  // A ordem importa e custou um teste para descobrir. Um recomeço de frase
  // costuma vir partido em dois cortes vizinhos ("Bom, então o, o ponto é, eu
  // saí" mais "do, bom, então,"), e cada metade sozinha parece inválida: aplicar
  // só uma delas deixaria "eu saí eu quero falar", que é pior que o original.
  // Juntas, elas formam um recomeço legítimo e passam.
  const unidos: Limpeza[] = [];
  for (const c of validos) {
    const anterior = unidos[unidos.length - 1];
    if (anterior && c.de <= anterior.ate + 3) {
      anterior.ate = Math.max(anterior.ate, c.ate);
    } else {
      unidos.push({ ...c });
    }
  }

  const plausiveis = unidos
    .filter((c) => c.ate - c.de + 1 <= PALAVRAS_MAXIMAS_POR_CORTE)
    .filter((c) => cortePlausivel(c, palavras));

  // Teto duro. Se o agente marcou meio vídeo, alguma coisa saiu muito errada, e
  // entregar a gravação sem limpeza é melhor que entregar picotada.
  const removidas = plausiveis.reduce((s, c) => s + (c.ate - c.de + 1), 0);
  if (removidas > totalDePalavras * FRACAO_MAXIMA) return [];

  return plausiveis;
}

/**
 * Converte cortes de palavra em cortes de tempo, prontos para o ffmpeg.
 *
 * O corte vai do FIM da palavra anterior ao COMEÇO da palavra seguinte, e não
 * do início ao fim das palavras removidas. A diferença é audível: cortar
 * exatamente na fronteira da palavra leva junto o ataque da consoante seguinte,
 * e a fala fica com um estalo.
 */
export function limpezaParaRemocoes(
  cortes: Limpeza[],
  palavras: Word[]
): Remocao[] {
  return cortes
    .map((c) => {
      const anterior = palavras[c.de - 1];
      const seguinte = palavras[c.ate + 1];
      const de = anterior ? anterior.end : palavras[c.de].start;
      const ate = seguinte ? seguinte.start : palavras[c.ate].end;
      return { de, ate, motivo: c.motivo || "hesitação" };
    })
    .filter((r) => r.ate - r.de > 0.08);
}

/** Junta as remoções de pausa com as de fala, sem sobrepor. */
export function unirRemocoes(a: Remocao[], b: Remocao[]): Remocao[] {
  const todas = [...a, ...b].sort((x, y) => x.de - y.de);
  const unidas: Remocao[] = [];
  for (const r of todas) {
    const anterior = unidas[unidas.length - 1];
    if (anterior && r.de <= anterior.ate) {
      anterior.ate = Math.max(anterior.ate, r.ate);
      if (!anterior.motivo.includes(r.motivo)) {
        anterior.motivo = `${anterior.motivo} e ${r.motivo}`;
      }
    } else {
      unidas.push({ ...r });
    }
  }
  return unidas;
}
