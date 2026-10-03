import { put, head } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";

/**
 * O CHECKPOINT DA CADEIA DE VÍDEO, pela mesma razão do checkpoint do
 * carrossel (lib/media/checkpoint-do-carrossel.ts): a fila repete um trabalho
 * que estourou o prazo, e o que já foi PAGO não pode ser pago de novo.
 *
 * Um vídeo de 60 s são 9 gerações do Veo, cada uma um trabalho da fila com
 * até três tentativas. Sem memória entre tentativas, um trabalho derrubado
 * pela plataforma depois de a geração terminar (o Veo pronto, o download no
 * meio) geraria de novo na tentativa seguinte: R$ 5,70 jogados fora por
 * tentativa, e a cadeia inteira poderia custar até o triplo.
 *
 * O que fica guardado, por passo da cadeia:
 *
 *   1. o NOME DA OPERAÇÃO, gravado assim que o Veo aceita o pedido. Se a
 *      função morrer durante a espera, a tentativa seguinte volta a olhar a
 *      MESMA operação em vez de abrir outra;
 *   2. o RESULTADO (o arquivo no lado do Google, o mp4 no nosso Blob e a
 *      duração), gravado quando o passo termina. A tentativa seguinte, se
 *      houver, só lê.
 *
 * Fica no Blob e não no banco pelo mesmo motivo do carrossel: é memória entre
 * tentativas, não estado do produto. O estado do produto continua sendo o
 * post e o card, que só recebem o mp4 quando a cadeia inteira termina.
 */

/** Quanto tempo um checkpoint serve. O arquivo do Google vive dois dias. */
const VALIDADE_HORAS = 24;

export interface PassoGuardado {
  /** O nome da operação no Veo, para retomar a espera. */
  operacao?: string;
  /** O arquivo gerado (`.../files/xxxx`), entrada do passo seguinte. */
  arquivoUri?: string;
  /** O mp4 do vídeo até aqui, no nosso Blob. */
  blobUrl?: string;
  /** Quantos segundos o vídeo tem até aqui. */
  segundos?: number;
  /** Quanto esta geração custou em dólar, para o log. */
  custoUsd?: number;
}

function caminho(referencia: string, passo: number): string {
  return `checkpoint-video/${referencia.replace(/[^a-zA-Z0-9_-]/g, "")}/g${passo}.json`;
}

/** O que já se sabe deste passo, ou `null` na primeira volta. */
export async function passoGuardado(referencia: string, passo: number): Promise<PassoGuardado | null> {
  const { token } = midiaProduzida();
  try {
    const meta = await head(caminho(referencia, passo), { token });
    const idade = Date.now() - new Date(meta.uploadedAt).getTime();
    if (idade > VALIDADE_HORAS * 3600_000) return null;
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PassoGuardado;
  } catch {
    // `head` estoura quando não existe, que é o caso normal na primeira volta.
    return null;
  }
}

/** Grava (ou completa) o que se sabe deste passo. Falhar aqui não derruba o vídeo. */
export async function guardarPasso(referencia: string, passo: number, dados: PassoGuardado): Promise<void> {
  try {
    const anterior = (await passoGuardado(referencia, passo)) ?? {};
    await put(caminho(referencia, passo), JSON.stringify({ ...anterior, ...dados }), {
      ...midiaProduzida(),
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch {
    // Checkpoint é otimização, não requisito.
  }
}
