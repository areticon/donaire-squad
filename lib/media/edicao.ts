import type { Word } from "@/lib/media/transcribe";
import type { Trecho } from "@/lib/media/select-clips";

/**
 * A edição do vídeo completo: o que sai fora e o que ganha destaque na tela.
 *
 * Decisão do Bruno em 23/08: o vídeo completo é COMPLETO. Saem erros, pausas
 * longas e sons estranhos, nunca conteúdo. E as legendas não são contínuas: só
 * os tópicos e as frases de destaque, no meio do vídeo.
 *
 * Medido na gravação real dele antes de construir, e o número corrigiu a
 * expectativa: 27,4 minutos têm apenas 54 segundos de pausa removível acima de
 * meio segundo, e a maior pausa da gravação inteira tem 3,1 segundos. Para quem
 * fala corrido, a economia de tempo é modesta. O ganho visível está no destaque.
 * Para quem hesita muito, o mesmo código devolve bem mais.
 */

/** Um pedaço que sai do vídeo final. Tempos em segundos do arquivo ORIGINAL. */
export type Remocao = { de: number; ate: number; motivo: string };

export type OpcoesDePausa = {
  /** Acima disto, o silêncio é considerado pausa. */
  limiarSegundos?: number;
  /**
   * Quanto de silêncio fica. Cortar a pausa inteira cola as frases e o
   * resultado soa apressado e artificial, o famoso corte de vídeo de internet.
   * Uma respiração curta é o que faz a edição parecer boa em vez de aparecer.
   */
  respiroSegundos?: number;
};

/**
 * As pausas longas da gravação, deduzidas dos tempos por palavra.
 *
 * Usa o buraco entre o fim de uma palavra e o começo da seguinte, e não detecção
 * de silêncio no áudio. A diferença importa: silêncio no áudio também acusa
 * respiração, ar-condicionado e ruído de sala, enquanto o buraco entre palavras
 * diz exatamente o que interessa, que é "aqui ninguém está falando".
 */
export function detectarPausas(
  palavras: Word[],
  duracaoSegundos: number,
  opcoes: OpcoesDePausa = {}
): Remocao[] {
  const limiar = opcoes.limiarSegundos ?? 0.6;
  const respiro = opcoes.respiroSegundos ?? 0.25;
  if (!palavras.length) return [];

  const remocoes: Remocao[] = [];

  // As pontas: o clique do gravador antes da primeira palavra e o silêncio
  // depois da última. Aqui não se deixa respiro, porque ninguém quer abrir um
  // vídeo olhando para uma pessoa parada esperando.
  const primeira = palavras[0].start;
  if (primeira > 0.4) {
    remocoes.push({ de: 0, ate: primeira - 0.15, motivo: "silêncio antes de começar" });
  }
  const ultima = palavras[palavras.length - 1].end;
  if (duracaoSegundos - ultima > 0.4) {
    remocoes.push({ de: ultima + 0.3, ate: duracaoSegundos, motivo: "silêncio no fim" });
  }

  for (let i = 1; i < palavras.length; i++) {
    const buraco = palavras[i].start - palavras[i - 1].end;
    if (buraco <= limiar) continue;
    const de = palavras[i - 1].end + respiro / 2;
    const ate = palavras[i].start - respiro / 2;
    if (ate - de > 0.1) {
      remocoes.push({ de, ate, motivo: `pausa de ${buraco.toFixed(1)}s` });
    }
  }

  return remocoes.sort((a, b) => a.de - b.de);
}

/** Quanto tempo a edição devolve, para a tela poder dizer ao cliente. */
export function segundosRemovidos(remocoes: Remocao[]): number {
  return remocoes.reduce((s, r) => s + (r.ate - r.de), 0);
}

/**
 * Onde um instante do vídeo ORIGINAL vai parar no vídeo EDITADO.
 *
 * Sem isto, as legendas de destaque apareceriam no lugar errado, e o erro cresce
 * ao longo do vídeo: cada remoção anterior empurra tudo que vem depois. Num
 * vídeo com 89 remoções, o destaque do fim sairia quase um minuto atrasado.
 */
export function mapearTempo(t: number, remocoes: Remocao[]): number {
  let deslocamento = 0;
  for (const r of remocoes) {
    if (r.ate <= t) deslocamento += r.ate - r.de;
    else if (r.de < t) deslocamento += t - r.de;
    else break;
  }
  return Math.max(0, t - deslocamento);
}

function carimboAss(segundos: number): string {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${h}:${dd(m)}:${dd(seg)}.${dd(cs)}`;
}

/** ASS não tem escape de chave, e chave crua vira comando de estilo. */
function limparTexto(t: string): string {
  return t.replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
}

/**
 * As legendas de destaque do vídeo completo.
 *
 * NÃO é legenda contínua, por decisão do Bruno: legenda em tudo polui o vídeo
 * longo e compete com quem fala. Aqui aparecem só os tópicos, e eles já existem:
 * são os mesmos momentos que o squad escolheu para virar corte. Isso dá
 * coerência de graça, porque o destaque na tela, o capítulo do YouTube e o corte
 * publicado falam do mesmo instante.
 *
 * ASS e não SRT porque SRT não tem estilo: seria texto branco padrão do player.
 * O destaque precisa de peso, contorno e caixa para ler em cima de qualquer
 * imagem.
 */
export function montarLegendasDestaque(
  trechos: Trecho[],
  remocoes: Remocao[],
  opcoes: { segundosNaTela?: number; corDeDestaque?: string } = {}
): string {
  const naTela = opcoes.segundosNaTela ?? 4;
  // ASS usa BGR com &H prefixo, não RGB. O laranja da marca (#f36a22) vira
  // &H226AF3. Errar a ordem entrega azul onde deveria ser laranja.
  const destaque = opcoes.corDeDestaque ?? "&H0022 6A F3".replace(/ /g, "");

  const cabecalho = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BorderStyle 3 desenha uma caixa atrás do texto, que é o que garante
    // leitura sobre slide claro E sobre cena escura. Alignment 2 é embaixo ao
    // centro, MarginV afasta da borda.
    `Style: Destaque,Arial,64,&H00FFFFFF,${destaque},&HB0000000,-1,3,4,0,2,120,120,90,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const linhas = trechos
    .filter((t) => t.titulo?.trim())
    .map((t) => {
      // O destaque entra no instante em que o momento começa, já convertido
      // para o tempo do vídeo editado.
      const inicio = mapearTempo(t.inicio, remocoes);
      const fim = Math.min(
        inicio + naTela,
        mapearTempo(t.fim, remocoes)
      );
      if (fim <= inicio) return null;
      return `Dialogue: 0,${carimboAss(inicio)},${carimboAss(fim)},Destaque,,0,0,0,,${limparTexto(t.titulo)}`;
    })
    .filter((l): l is string => l !== null);

  return [...cabecalho, ...linhas].join("\n") + "\n";
}
