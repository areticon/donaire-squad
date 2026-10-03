import { decidirRetomadas, type DecisaoDeRetomada } from "@/lib/media/decidir-retomadas";
import { emendarNoSilencio, type Remocao } from "@/lib/media/edicao";
import { detectarRepeticoes, unirRemocoes } from "@/lib/media/limpeza";
import type { Word } from "@/lib/media/transcribe";

/**
 * A GUARDA NA SAÍDA (03/10/2026): a fala do ARQUIVO QUE VAI AO AR, conferida
 * depois do render final, antes de o cliente receber.
 *
 * O Bruno, ao receber o completo de 20 min com "E eu evitei usar a palavra, e
 * eu evitei usar a palavra produtividade" aos 100 s: "como uma IA lê a
 * transcrição e acha normal repetir a mesma frase?". A limpeza roda sobre a
 * GRAVAÇÃO, e o vídeo pronto é outra coisa: uma base de antes da correção, uma
 * remoção guardada que ficou velha, um corte que a Deepgram ouve diferente
 * depois da emenda. Tudo isso só aparece olhando o arquivo final. Então o
 * worker, depois de renderizar, manda a URL do arquivo para cá; a Deepgram
 * transcreve o próprio arquivo, o detector de retomadas roda nessa fala, e o
 * que sobrar volta como trechos a tirar, NO TEMPO DO ARQUIVO. O worker apara e
 * sobe de novo (worker/src/guarda-da-fala.mjs).
 *
 * ## O que sai, e o critério
 *
 * - Frase interrompida seguida da mesma frase recomeçada: sai a primeira
 *   (`tentativaIncompletaRefeita`, por código, e o resto pelo JEV e o Claude).
 * - Na dúvida entre deixar uma frase repetida e cortar, CORTA a tentativa
 *   incompleta (`naDuvidaCorta`): a repetição é o erro que o cliente vê.
 * - Gagueira de palavra colada ("E, e, e eu"): `detectarRepeticoes`, a mesma
 *   regra que já roda na gravação.
 * - Muleta solta NÃO entra aqui: na dúvida entre cortar uma palavra de muleta
 *   e deixar, deixa (a limpeza da gravação já cuidou disso).
 *
 * `protegido` são janelas que não se mexem: a abertura e o gancho repetem de
 * propósito uma frase que aparece depois.
 */

export function guardaDaFalaLigada(): boolean {
  return process.env.GUARDA_DA_FALA !== "0";
}

export type SobraNaFala = { de: number; ate: number; motivo: string; texto: string; quem: string };

export type ConferenciaDaFala = {
  /** O que o worker tira, no tempo do arquivo, com as bordas no silêncio. */
  remover: Remocao[];
  /** O mesmo, legível: o texto que sai e quem decidiu. */
  sobras: SobraNaFala[];
  palavras: number;
  decisoes: Pick<DecisaoDeRetomada, "tipo" | "inicio" | "cortado" | "fica" | "quem" | "corta">[];
  claudeChamadas: number;
};

const dentro = (r: { de: number; ate: number }, janelas: Array<{ de: number; ate: number }>) => janelas.some((j) => r.ate > j.de && r.de < j.ate);

export async function conferirFala(
  palavras: Word[],
  opcoes: { projectId?: string | null; protegido?: Array<{ de: number; ate: number }> } = {}
): Promise<ConferenciaDaFala> {
  const protegido = opcoes.protegido ?? [];
  const retomadas = await decidirRetomadas(palavras, { projectId: opcoes.projectId, naDuvidaCorta: true });
  const gagueira = detectarRepeticoes(palavras).filter((r) => /palavra repetida|expressão repetida/.test(r.motivo));
  const escolhidas = unirRemocoes(retomadas.remocoes, gagueira).filter((r) => !dentro(r, protegido));
  const remover = emendarNoSilencio(escolhidas, palavras).filter((r) => r.ate - r.de >= 0.05 && !dentro(r, protegido));
  const texto = (r: { de: number; ate: number }) =>
    palavras
      .filter((w) => w.start >= r.de - 0.02 && w.end <= r.ate + 0.02)
      .map((w) => w.word)
      .join(" ");
  const quemCortou = (r: { de: number; ate: number }) =>
    retomadas.decisoes.find((d) => d.corta && d.inicio >= r.de - 0.3 && d.inicio <= r.ate)?.quem ?? "código (gagueira)";
  return {
    remover,
    sobras: remover.map((r) => ({ de: +r.de.toFixed(3), ate: +r.ate.toFixed(3), motivo: r.motivo, texto: texto(r), quem: quemCortou(r) })),
    palavras: palavras.length,
    decisoes: retomadas.decisoes.map((d) => ({ tipo: d.tipo, inicio: d.inicio, cortado: d.cortado, fica: d.fica, quem: d.quem, corta: d.corta })),
    claudeChamadas: retomadas.claudeChamadas,
  };
}

/**
 * O campo `guardaDaFala` dos pedidos de render FINAL ao worker. Nulo com a
 * guarda desligada (GUARDA_DA_FALA=0); worker antigo ignora o campo.
 */
export function pedidoDaGuarda(videoId: string, rotulo: string, appUrl?: string, corte?: number): { url: string; rotulo: string } | null {
  if (!guardaDaFalaLigada()) return null;
  const app = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  // O índice do corte vai na URL (03/10), e não no corpo: o corpo quem monta é
  // o worker, e assim a regra vale sem publicar o worker.
  return { url: `${app}/api/videos/${videoId}/guarda-da-fala${typeof corte === "number" ? `?corte=${corte}` : ""}`, rotulo };
}

/** O que o cliente devolveu no controle do corte (`clips[i].mantidosPeloUsuario`). */
export type MantidoPeloUsuario = { texto: string; antes?: string; depois?: string };

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");
const fichas = (t: string | undefined) => (t ?? "").split(/\s+/).map(normal).filter(Boolean);

/**
 * O AJUSTE DO CLIENTE É SOBERANO (03/10): as janelas, no tempo do ARQUIVO
 * pronto, do que ele devolveu de propósito no controle do corte. A guarda não
 * tira nada que encoste nelas, nem a "frase repetida" que ele quis repetida.
 *
 * O arquivo é transcrito de novo, então o trecho é achado pelo TEXTO: primeiro
 * com as palavras vizinhas que ficaram no ar (acha o lugar exato); sem elas,
 * pelo texto sozinho quando ele tem 3 palavras ou mais (texto curto, como um
 * "e", casaria com o vídeo inteiro).
 */
export function janelasMantidasPeloUsuario(palavras: Word[], mantidos: MantidoPeloUsuario[]): Array<{ de: number; ate: number }> {
  const P = palavras.map((w) => normal(w.word));
  const janelas: Array<{ de: number; ate: number }> = [];
  const achar = (seq: string[]): number[] => {
    const saida: number[] = [];
    if (!seq.length) return saida;
    for (let i = 0; i + seq.length <= P.length; i++) if (seq.every((s, k) => P[i + k] === s)) saida.push(i);
    return saida;
  };
  for (const m of mantidos) {
    const meio = fichas(m.texto);
    if (!meio.length) continue;
    const antes = fichas(m.antes);
    const depois = fichas(m.depois);
    const comVizinhas = [...antes, ...meio, ...depois];
    let inicios = achar(comVizinhas).map((i) => i + antes.length);
    if (!inicios.length && antes.length) inicios = achar([...antes, ...meio]).map((i) => i + antes.length);
    if (!inicios.length && depois.length) inicios = achar([...meio, ...depois]);
    if (!inicios.length && meio.length >= 3) inicios = achar(meio);
    for (const i of inicios) janelas.push({ de: palavras[i].start - 0.05, ate: palavras[i + meio.length - 1].end + 0.05 });
  }
  return janelas;
}
