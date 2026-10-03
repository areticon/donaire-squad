import crypto from "crypto";
import { put, head } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";
import type { LaminaDoCarrossel } from "@/lib/media/carrossel";

/**
 * O CHECKPOINT DO CARROSSEL, que existe por um defeito de DINHEIRO.
 *
 * Medido na campanha de prova de 19/09, e é a mesma família do estorno
 * duplicado do vídeo: a fila repete um trabalho que estourou o prazo, e o que
 * já foi PAGO é pago de novo.
 *
 * O que aconteceu, pelo relógio do log:
 *
 *   21:48:02  roteiro do carrossel pronto
 *   21:49:25  lâmina 1 cobrada
 *   21:50:51  21:50:53  21:51:15  lâminas 2, 3 e 4 (leva paralela)
 *   21:52:08  lâmina 5
 *   21:52:31  uma lâmina refeita por margem (a SEXTA cobrada)
 *   22:01:22  a função morreu em 800 s e a fila recomeçou O DIA INTEIRO
 *
 * Seis lâminas do GPT Image 2 a US$ 0,165, jogadas fora, e a segunda tentativa
 * começou do zero: dez cobradas e nenhum carrossel entregue. Com
 * MAX_TENTATIVAS = 3, um carrossel de cinco lâminas custaria até quinze
 * lâminas (cerca de R$ 13) e ainda assim terminaria sem nada.
 *
 * O prazo da fila é 830 s e a função morre em 800 s (`maxDuration` em
 * app/api/cron/fila/route.ts). Ou seja o teto real é 800, e o dia de carrossel
 * não cabe nele quando alguma lâmina precisa ser refeita.
 *
 * ## Por que guardar o ROTEIRO junto, e não só as lâminas
 *
 * Porque o roteiro é escrito pelo Claude e NÃO É DETERMINÍSTICO. Na prova, a
 * tentativa 1 abriu com "2. Post no Instagram..." e a tentativa 2 com
 * "2. Você montou uma r...". Guardar lâmina por índice sem guardar o roteiro
 * misturaria duas sequências diferentes: a lâmina 2 desenhada seria a frase de
 * um roteiro e as vizinhas de outro, e o carrossel sairia sem fio condutor,
 * que é exatamente o defeito que o roteiro veio corrigir.
 *
 * ## Por que Blob e não banco
 *
 * A lâmina é um JPEG de algumas centenas de KB. Guardar isso em coluna de
 * Postgres é o que já acontece com `post.imageUrl` (data URL) e é justamente o
 * que faz a linha do post passar de 2 MB num carrossel de cinco. O checkpoint
 * não vai repetir esse erro.
 *
 * ## O que ele NÃO faz
 *
 * Não muda o que a esteira devolve: `desenharCarrossel` continua entregando
 * data URL, byte a byte igual ao de antes. O Blob aqui é memória entre
 * tentativas, não o novo endereço da arte. Trocar o endereço mexeria no
 * caminho de publicação (a rota pública do Instagram), e uma coisa de cada
 * vez.
 */

/** Quanto tempo um checkpoint serve. Depois disso a fila já desistiu faz tempo. */
const VALIDADE_HORAS = 6;

/** A pasta de um dia de campanha. `chave` é estável entre tentativas. */
function pasta(chave: string): string {
  return `checkpoint-carrossel/${chave.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * A digital da frase que vai desenhada.
 *
 * Entra no nome do arquivo como trava de segurança: se por algum caminho o
 * roteiro guardado não for reaproveitado, a lâmina cacheada não é confundida
 * com a nova, porque o nome não bate. Errar para o lado de desenhar de novo é
 * barato; errar para o lado de colar a frase errada estraga a peça.
 */
function digital(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

async function existe(caminho: string): Promise<string | null> {
  const { token } = midiaProduzida();
  try {
    const meta = await head(caminho, { token });
    // Checkpoint velho é lixo de um run que já morreu. Reaproveitar arte de
    // seis horas atrás seria entregar conteúdo de outra campanha.
    const idade = Date.now() - new Date(meta.uploadedAt).getTime();
    if (idade > VALIDADE_HORAS * 3600_000) return null;
    return meta.url;
  } catch {
    // `head` estoura quando não existe, que é o caso normal na primeira volta.
    return null;
  }
}

/** O roteiro já escrito nesta chave, se houver. */
export async function roteiroGuardado(chave: string): Promise<LaminaDoCarrossel[] | null> {
  const url = await existe(`${pasta(chave)}/roteiro.json`);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const lido = (await res.json()) as LaminaDoCarrossel[];
    return Array.isArray(lido) && lido.length >= 3 ? lido : null;
  } catch {
    return null;
  }
}

export async function guardarRoteiro(chave: string, roteiro: LaminaDoCarrossel[]): Promise<void> {
  try {
    await put(`${pasta(chave)}/roteiro.json`, JSON.stringify(roteiro), {
      ...midiaProduzida(),
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch {
    // Checkpoint é otimização, não requisito: falhar em guardar não pode
    // derrubar um dia que está indo bem.
  }
}

/** A lâmina `i` desta chave e desta frase, se já foi desenhada. */
export async function laminaGuardada(chave: string, i: number, frase: string): Promise<string | null> {
  const url = await existe(`${pasta(chave)}/${i}-${digital(frase)}.jpg`);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    // Volta como data URL porque é esse o contrato de `desenharCarrossel`.
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function guardarLamina(chave: string, i: number, frase: string, dataUri: string): Promise<void> {
  try {
    const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
    await put(`${pasta(chave)}/${i}-${digital(frase)}.jpg`, Buffer.from(base64, "base64"), {
      ...midiaProduzida(),
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  } catch {
    // Idem: guardar é bônus.
  }
}
