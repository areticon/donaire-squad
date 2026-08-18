import { askClaude } from "@/lib/claude";
import { clipesEstimados } from "@/lib/media/limits";

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
  /** O que a pessoa realmente falou ali, para o redator não inventar. */
  transcricao: string;
};

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
- No campo "transcricao", copie o que ela falou naquele intervalo, sem editar.

Responda SOMENTE com JSON válido, sem cercas de código:
{"trechos":[{"inicio":0,"fim":0,"titulo":"...","motivo":"...","ideia":"...","transcricao":"..."}]}`;

type Paragrafo = { text: string; start: number; end: number };

export async function selecionarTrechos(
  paragrafos: Paragrafo[],
  duracaoSegundos: number,
  contexto?: { nicho?: string | null; publico?: string | null; voz?: string | null },
  usageCtx?: { projectId?: string; runId?: string }
): Promise<Trecho[]> {
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
    { maxTokens: 4000, usage: { operation: "video_selecao", ...usageCtx } }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const dados = JSON.parse(limpo) as { trechos?: Trecho[] };
  const trechos = dados.trechos ?? [];
  if (!trechos.length) throw new Error("O agente não devolveu nenhum trecho.");

  return sanear(trechos, duracaoSegundos);
}

/**
 * O modelo às vezes devolve tempo fora da gravação, trecho invertido ou
 * sobreposto. Nada disso pode chegar ao Passo 4, porque vira corte errado e
 * post sobre a frase errada. A limpeza é barata e evita retrabalho caro.
 */
export function sanear(trechos: Trecho[], duracaoSegundos: number): Trecho[] {
  const limpos = trechos
    .map((t) => ({
      ...t,
      inicio: Math.max(0, Math.min(t.inicio, duracaoSegundos)),
      fim: Math.max(0, Math.min(t.fim, duracaoSegundos)),
    }))
    .filter((t) => t.fim - t.inicio >= 10)
    .sort((a, b) => a.inicio - b.inicio);

  const semSobreposicao: Trecho[] = [];
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
