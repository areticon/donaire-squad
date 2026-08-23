import { askClaude } from "@/lib/claude";
import type { Trecho } from "@/lib/media/select-clips";
import type { Remocao } from "@/lib/media/edicao";
import { mapearTempo } from "@/lib/media/edicao";

/**
 * A abertura do vídeo completo: ganchos antes do começo.
 *
 * Pedido do Bruno em 23/08, com a razão certa: "o vídeo começa com uma promessa
 * mas não entrega". O vídeo dele abre com "Bom, vamos lá gente, quero falar
 * sobre..." e quem chega decide em 3 segundos se fica.
 *
 * ## O que a pesquisa diz, e os números mandaram no desenho
 *
 * - O espectador decide em **3 segundos**.
 * - Gancho desalinhado do título perde **mais de 40% nos primeiros 5s**.
 * - Gancho alinhado retém **78% até os 30s**.
 * - Com 70% ainda assistindo aos 30s, o YouTube **empurra o vídeo**.
 * - Intro acima de 5s derruba a métrica de Intro do YouTube Studio.
 * - O padrão mais forte NÃO é choque, é a **alça aberta**: começar num ponto de
 *   tensão não resolvida, cortar, e voltar ao começo.
 *
 * Por isso cada gancho tem de 5 a 12 segundos e são no máximo dois: três
 * ganchos passam dos 30 segundos antes de o vídeo começar, e aí a promessa vira
 * enrolação.
 *
 * ## Uma ressalva sobre "copiar o MrBeast"
 *
 * Em 2024 ele abandonou publicamente a edição hiper-rápida: desacelerou, pôs
 * respiro, cortou a gritaria, foi para narrativa, e as visualizações subiram.
 * O que se copia aqui é a alça aberta e o corte a frio, não o ritmo de 2020.
 */

export type Gancho = {
  /** Segundo do vídeo ORIGINAL em que o gancho começa. */
  inicio: number;
  /** Segundo em que termina. */
  fim: number;
  /** O que ele promete, para conferência humana. */
  promessa: string;
};

const SISTEMA = `Você monta a abertura de um vídeo de YouTube, no padrão de corte a frio.

Recebe os melhores momentos que já foram escolhidos da gravação, cada um com início, fim, título e o que a pessoa falou. Escolha DOIS deles para abrir o vídeo, antes do começo de verdade.

O que faz um bom gancho de abertura:
1. **Alça aberta.** Ele promete ou anuncia algo e é cortado ANTES de entregar. "Eu levei dois anos pra entender que consultoria não escala" abre uma alça; "Consultoria não escala porque você vende hora" fecha e não serve.
2. Se entende sozinho, sem contexto nenhum. Quem clicou não viu nada ainda.
3. Tem tensão: contraria o senso comum, admite um erro, ou anuncia uma revelação.
4. Começa em fronteira de frase. Nunca no meio de uma palavra.

Regras de tempo, e elas são duras:
- Cada gancho tem entre 5 e 12 segundos. Menos que 5 não dá para entender; mais que 12 deixa de ser gancho e vira trecho.
- Os dois somados não podem passar de 22 segundos.
- Os dois precisam vir de momentos DIFERENTES da gravação, com assuntos diferentes. Dois ganchos sobre a mesma coisa cansam antes de engajar.

Ordem: o mais forte vem primeiro. O espectador decide em três segundos.

Você pode usar um recorte MENOR de um momento: se o trecho tem 60 segundos e a promessa está nos primeiros 8, devolva só esses 8.

No campo "promessa", diga em uma frase o que aquele gancho promete e não entrega ali. Português do Brasil, sem travessão.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"ganchos":[{"inicio":0,"fim":0,"promessa":"..."}]}`;

const MIN_SEGUNDOS = 5;
const MAX_SEGUNDOS = 12;
const MAX_TOTAL = 22;

export async function escolherGanchos(
  trechos: Trecho[],
  usageCtx?: { projectId?: string }
): Promise<Gancho[]> {
  const comFala = trechos.filter((t) => t.transcricao?.trim());
  if (comFala.length < 2) return [];

  const lista = comFala
    .map(
      (t) =>
        `[${Math.floor(t.inicio)}s a ${Math.ceil(t.fim)}s] ${t.titulo}\nTese: ${t.ideia}\nFala: ${t.transcricao}`
    )
    .join("\n\n");

  const resposta = await askClaude(
    SISTEMA,
    `Momentos escolhidos da gravação:\n\n${lista}`,
    { maxTokens: 8000, usage: { operation: "video_abertura", ...usageCtx } }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const dados = JSON.parse(limpo) as { ganchos?: Gancho[] };
  return sanearGanchos(dados.ganchos ?? [], comFala);
}

/**
 * Descarta gancho que não cabe nas regras.
 *
 * O tamanho é o que mais importa: um gancho de 40 segundos não é gancho, é o
 * vídeo começando duas vezes, e é o erro que mais destrói retenção. O prompt
 * pede, isto garante.
 */
export function sanearGanchos(ganchos: Gancho[], trechos: Trecho[]): Gancho[] {
  const limite = trechos.reduce((m, t) => Math.max(m, t.fim), 0);

  const validos = ganchos
    .filter(
      (g) =>
        Number.isFinite(g.inicio) &&
        Number.isFinite(g.fim) &&
        g.inicio >= 0 &&
        g.fim > g.inicio &&
        g.fim <= limite + 1
    )
    .map((g) => ({
      ...g,
      // Aperta no teto em vez de descartar: um gancho de 15s vira um de 12,
      // que ainda é um bom gancho, e descartar deixaria a abertura sem nada.
      fim: Math.min(g.fim, g.inicio + MAX_SEGUNDOS),
    }))
    .filter((g) => g.fim - g.inicio >= MIN_SEGUNDOS)
    .slice(0, 2);

  // Dois ganchos do mesmo instante seriam o mesmo conteúdo duas vezes.
  const distintos = validos.filter(
    (g, i) => i === 0 || Math.abs(g.inicio - validos[0].inicio) > 5
  );

  let total = 0;
  return distintos.filter((g) => {
    total += g.fim - g.inicio;
    return total <= MAX_TOTAL;
  });
}

/**
 * Os ganchos com os tempos convertidos para o vídeo DEPOIS da limpeza.
 *
 * Sem isto, o gancho apontaria para o instante do arquivo original, e como a
 * edição remove pausa e hesitação ao longo de toda a gravação, o desvio cresce:
 * no fim do vídeo passa de meio minuto. O gancho pegaria a frase errada.
 */
export function ganchosNoTempoEditado(
  ganchos: Gancho[],
  remocoes: Remocao[]
): Gancho[] {
  return ganchos
    .map((g) => ({
      ...g,
      inicio: mapearTempo(g.inicio, remocoes),
      fim: mapearTempo(g.fim, remocoes),
    }))
    .filter((g) => g.fim - g.inicio >= 2);
}
