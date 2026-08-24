import type { Word } from "@/lib/media/transcribe";
import type { Estilo } from "@/lib/media/estilos";

/**
 * A legenda palavra a palavra, queimada no corte.
 *
 * ## Por que isto é a peça mais cara que faltava
 *
 * Pesquisado em 24/08: **85% dos vídeos curtos são assistidos sem som**. Um
 * corte sem legenda não é um corte com um recurso a menos, é um corte que a
 * maioria do público não entende. Antes disto, os cortes da Demandou não tinham
 * legenda nenhuma.
 *
 * O padrão de 2026 é palavra a palavra, com a palavra falada em destaque, alto
 * contraste, no terço inferior central. Não é estética: é o que mantém o olho
 * em movimento no ritmo da fala.
 *
 * ## Por que ASS com karaokê, e não SRT
 *
 * SRT só liga texto a um intervalo de tempo. Para destacar a palavra que está
 * sendo dita AGORA é preciso mudar a cor dentro da linha, e isso o SRT não faz.
 * O ASS tem a marca `\\k`, feita exatamente para karaokê, e o ffmpeg desenha
 * nativamente, sem biblioteca extra.
 *
 * ## O tempo aqui é o do corte, não o da gravação
 *
 * As palavras chegam com o tempo do arquivo original. O corte começa em outro
 * instante e teve trechos removidos no meio. Converter é obrigatório: sem isso a
 * legenda vai andando para trás ao longo do vídeo, e no fim está meio minuto
 * fora.
 */

export type Remocao = { de: number; ate: number };

/** Converte um instante da gravação para o instante dentro do corte já limpo. */
function noTempoDoCorte(
  segundo: number,
  inicioDoCorte: number,
  remocoes: Remocao[]
): number {
  let descontado = 0;
  for (const r of remocoes) {
    if (r.ate <= inicioDoCorte) continue;
    if (r.de >= segundo) break;
    const de = Math.max(r.de, inicioDoCorte);
    const ate = Math.min(r.ate, segundo);
    if (ate > de) descontado += ate - de;
  }
  return Math.max(0, segundo - inicioDoCorte - descontado);
}

function carimbo(segundos: number): string {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sg = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${h}:${dd(m)}:${dd(sg)}.${dd(cs)}`;
}

/** O ASS não aceita chave nem barra crua dentro do texto do diálogo. */
function limpar(texto: string): string {
  return texto.replace(/[{}\\]/g, "").trim();
}

/**
 * Monta o arquivo ASS da legenda de um corte.
 *
 * Devolve string vazia quando não há palavra no intervalo, e quem chama trata
 * isso como "sem legenda" em vez de erro: corte sem fala não deve quebrar o
 * trabalho.
 */
export function legendaDoCorte(
  palavras: Word[],
  inicioDoCorte: number,
  fimDoCorte: number,
  remocoes: Remocao[],
  estilo: Estilo
): string {
  const dentro = palavras.filter(
    (p) =>
      p.end > inicioDoCorte &&
      p.start < fimDoCorte &&
      // Palavra que caiu numa remoção não aparece: ela não está no áudio.
      !remocoes.some((r) => p.start >= r.de - 0.02 && p.end <= r.ate + 0.02)
  );
  if (!dentro.length) return "";

  const L = estilo.legenda;

  // Agrupa em blocos do tamanho que o estilo pede. Um bloco vira uma linha na
  // tela, e dentro dele o karaokê acende palavra por palavra.
  const blocos: Word[][] = [];
  for (let i = 0; i < dentro.length; i += L.palavrasPorVez) {
    blocos.push(dentro.slice(i, i + L.palavrasPorVez));
  }

  const linhas: string[] = [];
  for (const bloco of blocos) {
    const inicio = noTempoDoCorte(bloco[0].start, inicioDoCorte, remocoes);
    const fim = noTempoDoCorte(bloco[bloco.length - 1].end, inicioDoCorte, remocoes);
    if (fim <= inicio) continue;

    // `\k` conta em CENTÉSIMOS de segundo, e não em segundos. Errar a unidade
    // aqui faz o destaque correr cem vezes mais rápido que a fala, e o sintoma
    // é uma legenda que pisca inteira no primeiro quadro.
    const texto = bloco
      .map((p, i) => {
        const anterior = i === 0 ? bloco[0].start : bloco[i - 1].end;
        const duracao = Math.max(1, Math.round((p.end - anterior) * 100));
        const palavra = L.caixaAlta ? p.word.toUpperCase() : p.word;
        return `{\\k${duracao}}${limpar(palavra)} `;
      })
      .join("")
      .trimEnd();

    linhas.push(
      `Dialogue: 0,${carimbo(inicio)},${carimbo(fim + 0.12)},Fala,,0,0,0,,${texto}`
    );
  }
  if (!linhas.length) return "";

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    // WrapStyle 2 desliga a quebra automática: com poucas palavras por linha ela
    // só atrapalha, quebrando no lugar errado.
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // PrimaryColour é a cor de quem JÁ foi falado; SecondaryColour é a de quem
    // ainda vem. O karaokê do ASS anda da secundária para a primária, então o
    // destaque entra em PrimaryColour, o que é o contrário do que o nome sugere.
    `Style: Fala,${L.fonte.split(",")[0]},${L.corpo},${L.corDoDestaque},${L.cor},&H00000000,&HA0000000,-1,0,1,${L.contorno},2,2,80,80,${L.margemDeBaixo},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...linhas,
  ].join("\n");
}
