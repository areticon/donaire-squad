import { askClaude } from "@/lib/claude";
import { clipesEstimados } from "@/lib/media/limits";
import type { Word } from "@/lib/media/transcribe";

/**
 * Passo 3: escolher os melhores trechos da gravação.
 *
 * O desenho é ditado por uma restrição de custo, não por elegância. A saída
 * daqui precisa alimentar UMA chamada por trecho no Passo 4, devolvendo os
 * textos das três redes juntos. Uma chamada por trecho por rede levaria o
 * trabalho de R$ 1,50 para R$ 7,50 e derrubaria a margem dos créditos cobrados
 * de 85% para 25%. Por isso cada trecho já sai daqui com contexto suficiente
 * para o redator não precisar reler a transcrição inteira.
 *
 * O agente lê os parágrafos com marcação de tempo, não a transcrição corrida:
 * ele precisa dizer onde o trecho começa e termina em segundos, e parágrafo já
 * vem com esses limites da Deepgram.
 */

export type Trecho = {
  /** Segundo em que o trecho começa. */
  inicio: number;
  /** Segundo em que termina. */
  fim: number;
  /** Título curto, do jeito que o cliente reconheceria o momento. */
  titulo: string;
  /** Por que este trecho e não outro. Fica visível na tela de aprovação. */
  motivo: string;
  /** A ideia central em uma frase, que é o que o redator do Passo 4 recebe. */
  ideia: string;
  /**
   * O que a pessoa realmente falou ali, para o redator não inventar.
   *
   * **Preenchido em código, não pelo modelo.** Ver `recortarFala`: a
   * transcrição com marcação de tempo por palavra já está no banco, então
   * pedir ao modelo que copiasse era gastar token para reescrever o que já
   * temos, e ainda por cima sem garantia de fidelidade.
   */
  transcricao: string;
};

/** O que o modelo devolve. A fala entra depois, recortada por nós. */
type TrechoBruto = Omit<Trecho, "transcricao">;

const SISTEMA = `Você escolhe os melhores momentos de uma gravação crua.

Recebe a transcrição de alguém falando sem roteiro, em blocos com marcação de
tempo. Sua tarefa é achar os momentos que sustentam um post sozinhos.

O que faz um momento ser bom, em ordem:
1. Tem uma tese, ou seja, alguém poderia discordar. "Consistência é sistema, não
   disciplina" é tese. "É importante ser consistente" não é nada.
2. Tem prova concreta: um caso, um número, uma cena que a pessoa viveu.
3. Se sustenta fora do contexto. Se o trecho depende de algo dito dez minutos
   antes para fazer sentido, ele não serve.
4. Tem tensão: contraria o senso comum, ou nomeia um erro que muita gente comete.

O que NÃO serve, mesmo que soe bem:
- Abertura, encerramento, e qualquer "então é isso, pessoal".
- Conselho genérico que caberia na boca de qualquer um do setor.
- Trecho que só existe para ligar dois assuntos.

Regras de recorte:
- Comece e termine em fronteira de frase, nunca no meio.
- Entre 20 e 120 segundos.
- Os trechos não podem se sobrepor.
- Prefira menos trechos bons a completar a cota com trecho fraco. Se a gravação
  só tem três momentos que prestam, devolva três.

Regras de escrita:
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Português do Brasil.
- No campo "ideia", escreva a tese do trecho em uma frase, na voz da pessoa.
- NÃO copie a fala. Nós recortamos a fala pelos tempos que você devolver.

Responda SOMENTE com JSON válido, sem cercas de código.

Regra que evita JSON quebrado, e ela é obrigatória: **nunca use quebra de linha
dentro de um campo de texto.** Se a fala tinha pausa, use ponto ou vírgula. JSON
com quebra de linha crua dentro de string é inválido, e aí o trabalho inteiro
falha.

{"trechos":[{"inicio":0,"fim":0,"titulo":"...","motivo":"...","ideia":"..."}]}`;

type Paragrafo = { text: string; start: number; end: number };

/**
 * O que já está gravado no banco sobre a fala. `palavras` é opcional porque
 * transcrição antiga pode não ter sido salva com marcação por palavra; sem ela
 * o recorte cai para fronteira de parágrafo, que é mais grosso mas funciona.
 */
export type FonteDaFala = { paragrafos: Paragrafo[]; palavras?: Word[] };

export async function selecionarTrechos(
  fonte: FonteDaFala,
  duracaoSegundos: number,
  contexto?: { nicho?: string | null; publico?: string | null; voz?: string | null },
  usageCtx?: { projectId?: string; runId?: string }
): Promise<Trecho[]> {
  const { paragrafos, palavras } = fonte;
  if (!paragrafos.length) {
    throw new Error("Transcrição sem parágrafos: nada para escolher.");
  }

  const alvo = clipesEstimados(duracaoSegundos);

  const blocos = paragrafos
    .map((p, i) => `[${i}] ${p.start.toFixed(0)}s a ${p.end.toFixed(0)}s: ${p.text}`)
    .join("\n\n");

  const perfil = [
    contexto?.nicho ? `Nicho: ${contexto.nicho}` : "",
    contexto?.publico ? `Público: ${contexto.publico}` : "",
    contexto?.voz ? `Tom de voz: ${contexto.voz}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resposta = await askClaude(
    SISTEMA,
    `${perfil ? perfil + "\n\n" : ""}Gravação de ${Math.round(duracaoSegundos / 60)} minutos.
Escolha até ${alvo} trechos, menos se não houver ${alvo} que prestem.

${blocos}`,
    // 16000 é teto, não meta, e teto não custa: o cobrado é o que o modelo
    // gera. Ele precisa ser alto porque o teto INCLUI o pensamento, e com 4000
    // o vídeo de 27 minutos gastou tudo pensando e voltou sem texto nenhum
    // (22/08). O que encolheu de verdade foi a resposta: sem o campo da fala
    // copiada, a saída real caiu de uns 4.500 tokens para menos de 1.000, que
    // é o que tira esta chamada da beirada do maxDuration da Vercel.
    { maxTokens: 16000, usage: { operation: "video_selecao", ...usageCtx } }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  // Rede de segurança para o mesmo problema que derrubou o Passo 4: o modelo
  // às vezes emite quebra de linha crua dentro da string, o que invalida o
  // JSON. Escapar antes de parsear salva a chamada em vez de perder o trabalho
  // inteiro por um caractere.
  const dados = parseTolerante(limpo);
  const trechos = dados.trechos ?? [];
  if (!trechos.length) throw new Error("O agente não devolveu nenhum trecho.");

  // A fala entra aqui, recortada do que já está no banco. O modelo devolve só
  // os tempos.
  return sanear(trechos, duracaoSegundos).map((t) => ({
    ...t,
    transcricao: recortarFala(t.inicio, t.fim, paragrafos, palavras),
  }));
}

/**
 * Recorta o que foi falado entre dois instantes, a partir da transcrição que já
 * está gravada.
 *
 * Existe para tirar do modelo o trabalho de copiar a fala de volta. Isso era a
 * maior parte da resposta dele (cerca de 3.700 dos ~4.500 tokens de saída num
 * vídeo de 27 minutos), e a chamada inteira vivia na beirada do teto de tempo
 * da Vercel por causa disso. Recortar em código é instantâneo, de graça, e mais
 * fiel: o modelo era só *instruído* a não editar, aqui ele não tem como.
 *
 * Prefere palavra a parágrafo porque parágrafo tem fronteira grossa e arrastaria
 * fala de fora do trecho para dentro do post.
 */
export function recortarFala(
  inicio: number,
  fim: number,
  paragrafos: Paragrafo[],
  palavras?: Word[]
): string {
  if (palavras?.length) {
    const primeira = palavras.findIndex((w) => w.end > inicio);
    let ultima = -1;
    for (let i = palavras.length - 1; i >= 0; i--) {
      if (palavras[i].start < fim) {
        ultima = i;
        break;
      }
    }
    if (primeira >= 0 && ultima >= primeira) {
      const [a, b] = encaixarNaFrase(palavras, primeira, ultima);
      return palavras
        .slice(a, b + 1)
        .map((w) => w.word)
        .join(" ");
    }
  }

  // Sem marcação por palavra, cai para parágrafo que encoste no intervalo.
  // Parágrafo já vem fechado em frase, então não precisa de encaixe.
  return paragrafos
    .filter((p) => p.start < fim && p.end > inicio)
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/** Escapa quebra de linha crua dentro de string antes de parsear. */
function parseTolerante(bruto: string): { trechos?: TrechoBruto[] } {
  try {
    return JSON.parse(bruto) as { trechos?: TrechoBruto[] };
  } catch {
    let dentro = false;
    let escapando = false;
    let saida = "";
    for (const ch of bruto) {
      if (escapando) {
        saida += ch;
        escapando = false;
        continue;
      }
      if (ch === "\\") {
        saida += ch;
        escapando = true;
        continue;
      }
      if (ch === '"') dentro = !dentro;
      if (dentro && (ch === "\n" || ch === "\r")) {
        saida += "\\n";
        continue;
      }
      saida += ch;
    }
    return JSON.parse(saida) as { trechos?: TrechoBruto[] };
  }
}

/**
 * Encaixa as bordas do recorte em fronteira de frase.
 *
 * Necessário desde que a fala passou a ser recortada em código: o modelo devolve
 * segundos aproximados, e cortar exatamente ali abre o trecho no meio da frase
 * ("faço? Eu coloco o Cloud..."), o que o redator do Passo 4 recebe como se
 * fosse a fala inteira. Enquanto era o modelo que copiava, ele fechava a frase
 * sozinho e o defeito ficava escondido.
 *
 * As duas bordas se movem para o MESMO lado, para a frente, e a razão é
 * assimétrica de propósito:
 *
 * - No início, aparar o fragmento da frase anterior custa algumas palavras.
 *   Recuar até o começo dela custaria importar fala que o modelo não escolheu.
 *   Medido na gravação de 27 minutos do Bruno: recuar trouxe trinta palavras
 *   sobre outro assunto para dentro do trecho. Perder o pedaço é mais barato
 *   que ganhar o pedaço errado.
 * - No fim, avançar é a única direção que fecha a frase.
 *
 * O limite de palavras existe para o caso de a Deepgram não pontuar o trecho, e
 * ao batê-lo o encaixe **desiste** e devolve a borda original, em vez de parar
 * num lugar arbitrário. Um dos cinco trechos daquela gravação cai justamente
 * numa parte de fala corrida, sem ponto final nenhum.
 */
const MAX_PALAVRAS_DE_ENCAIXE = 40;

function fechaFrase(palavra: string): boolean {
  return /[.!?…]["')\]]?$/.test(palavra);
}

function encaixarNaFrase(
  palavras: Word[],
  primeira: number,
  ultima: number
): [number, number] {
  // Início: avança até a primeira palavra cuja anterior fecha frase.
  let a = primeira;
  let achouInicio = a === 0 || fechaFrase(palavras[a - 1].word);
  while (!achouInicio && a < ultima && a - primeira < MAX_PALAVRAS_DE_ENCAIXE) {
    a++;
    achouInicio = fechaFrase(palavras[a - 1].word);
  }

  // Fim: avança até a primeira palavra que fecha frase.
  let b = ultima;
  let achouFim = fechaFrase(palavras[b].word);
  while (!achouFim && b < palavras.length - 1 && b - ultima < MAX_PALAVRAS_DE_ENCAIXE) {
    b++;
    achouFim = fechaFrase(palavras[b].word);
  }

  return [achouInicio ? a : primeira, achouFim ? b : ultima];
}

/**
 * O modelo às vezes devolve tempo fora da gravação, trecho invertido ou
 * sobreposto. Nada disso pode chegar ao Passo 4, porque vira corte errado e
 * post sobre a frase errada. A limpeza é barata e evita retrabalho caro.
 */
export function sanear(
  trechos: TrechoBruto[],
  duracaoSegundos: number
): TrechoBruto[] {
  const limpos = trechos
    .map((t) => ({
      ...t,
      inicio: Math.max(0, Math.min(t.inicio, duracaoSegundos)),
      fim: Math.max(0, Math.min(t.fim, duracaoSegundos)),
    }))
    .filter((t) => t.fim - t.inicio >= 10)
    .sort((a, b) => a.inicio - b.inicio);

  const semSobreposicao: TrechoBruto[] = [];
  for (const t of limpos) {
    const anterior = semSobreposicao[semSobreposicao.length - 1];
    if (anterior && t.inicio < anterior.fim) {
      // Sobrepôs: fica o mais longo, que costuma ser o que tem a ideia inteira.
      if (t.fim - t.inicio > anterior.fim - anterior.inicio) {
        semSobreposicao[semSobreposicao.length - 1] = t;
      }
      continue;
    }
    semSobreposicao.push(t);
  }
  return semSobreposicao;
}
