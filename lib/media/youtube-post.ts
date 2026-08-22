import type { Trecho } from "@/lib/media/select-clips";

/**
 * Monta o título e a descrição do vídeo que sobe para o canal do cliente.
 *
 * O ganho real está nos capítulos. Os trechos escolhidos pelo squad já têm
 * início, fim e título, então virar marcador de capítulo no YouTube não custa
 * uma chamada de IA a mais: é reaproveitar trabalho que já foi pago. Para quem
 * assiste, é a diferença entre uma gravação de 27 minutos sem mapa e uma com os
 * melhores momentos indexados.
 *
 * As três regras do YouTube para capítulo, e todas são obrigatórias:
 * 1. O primeiro marcador tem que ser `0:00`. Por isso a abertura entra sempre,
 *    mesmo não sendo um dos trechos escolhidos (o prompt da seleção descarta
 *    abertura de propósito, então ela nunca viria de lá).
 * 2. Precisa de pelo menos três marcadores.
 * 3. Cada capítulo precisa durar 10 segundos ou mais.
 *
 * Se as regras não fecharem, a descrição sai sem capítulo nenhum em vez de sair
 * com capítulo quebrado: o YouTube ignora a lista inteira quando uma regra
 * falha, e uma lista de horários soltos no meio do texto fica pior que nada.
 */

const MINIMO_DE_CAPITULOS = 3;
const DURACAO_MINIMA_SEGUNDOS = 10;

export function formatarCarimbo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${doisDigitos(m)}:${doisDigitos(seg)}`
    : `${m}:${doisDigitos(seg)}`;
}

export function montarCapitulos(
  trechos: Trecho[],
  duracaoSegundos: number
): string[] {
  const marcos = [
    { inicio: 0, titulo: "Abertura" },
    ...trechos
      .filter((t) => t.inicio > 0 && t.titulo?.trim())
      .map((t) => ({ inicio: Math.floor(t.inicio), titulo: t.titulo.trim() })),
  ]
    .sort((a, b) => a.inicio - b.inicio)
    // Dois trechos que começam no mesmo segundo virariam capítulo de duração
    // zero, que invalida a lista inteira.
    .filter((m, i, todos) => i === 0 || m.inicio !== todos[i - 1].inicio);

  if (marcos.length < MINIMO_DE_CAPITULOS) return [];

  const curtoDemais = marcos.some((m, i) => {
    const fim = i + 1 < marcos.length ? marcos[i + 1].inicio : duracaoSegundos;
    return fim - m.inicio < DURACAO_MINIMA_SEGUNDOS;
  });
  if (curtoDemais) return [];

  return marcos.map((m) => `${formatarCarimbo(m.inicio)} ${m.titulo}`);
}

/**
 * O texto do post de YouTube.
 *
 * A publicação usa a PRIMEIRA LINHA como título e o resto como descrição, então
 * o formato daqui não é livre: a primeira linha precisa valer como título
 * sozinha. Ver o ramo do YouTube em `lib/publish/oauth-post.ts`.
 */
export function montarPostDeVideo(
  trechos: Trecho[],
  duracaoSegundos: number,
  nomeDoProjeto: string
): string {
  const primeiro = trechos.find((t) => t.titulo?.trim());
  // O título do melhor momento diz mais do que o nome do arquivo, que é o que
  // sobraria. Cai para o nome do projeto quando a seleção não achou nada.
  const titulo = (primeiro?.titulo?.trim() || nomeDoProjeto).slice(0, 100);

  const capitulos = montarCapitulos(trechos, duracaoSegundos);

  const partes = [titulo];

  if (capitulos.length) {
    partes.push("", "Capítulos:", ...capitulos);
  }

  const ideias = trechos
    .map((t) => t.ideia?.trim())
    .filter((i): i is string => Boolean(i));
  if (ideias.length) {
    partes.push("", "Nesta conversa:", ...ideias.map((i) => `- ${i}`));
  }

  return partes.join("\n");
}
