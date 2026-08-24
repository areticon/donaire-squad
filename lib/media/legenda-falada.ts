import type { Word } from "@/lib/media/transcribe";
import type { Estilo } from "@/lib/media/estilos";
import { larguraEmCorpos } from "@/lib/media/metricas-de-fonte";

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
 * O ASS tem a marca `\k`, feita exatamente para karaokê, e o ffmpeg desenha
 * nativamente, sem biblioteca extra.
 *
 * ## O tempo aqui é o do corte, e ele vem de UMA lista
 *
 * As palavras chegam com o tempo do arquivo original. O corte começa em outro
 * instante e teve trechos removidos no meio. Converter é obrigatório: sem isso a
 * legenda vai andando para trás ao longo do vídeo, e no fim está meio minuto
 * fora.
 *
 * A conversão usa exatamente os mesmos intervalos que o worker vai emendar,
 * calculados uma vez em `intervalosDoTrecho`. Antes cada lado calculava por
 * conta, com limiares diferentes, e a diferença ACUMULA. Legenda fora de
 * sincronia é pior que legenda nenhuma, porque parece defeito de plataforma.
 */

/** Um pedaço que FICA, em segundos relativos ao início do trecho. */
export type Intervalo = { de: number; ate: number };

/** O quadro em que a legenda vai ser desenhada. */
export type Quadro = { largura: number; altura: number; margemDeBaixo: number };

/**
 * O corte vertical de rede social, que é o caso principal.
 *
 * A margem de 800 (legenda acima da cabeça) valia para a composição com a
 * pessoa recortada encostada na base. Desde o reset de 24/08 o corte é o vídeo
 * real com a pessoa preenchendo o quadro, e ali a margem de 800 caía NO ROSTO,
 * visto no quadro de produção. A legenda volta ao terço inferior clássico, que
 * é onde a pesquisa e o mercado inteiro a põem: abaixo do rosto, acima da
 * interface do aplicativo.
 */
export const QUADRO_VERTICAL: Quadro = { largura: 1080, altura: 1920, margemDeBaixo: 380 };

/**
 * O corte horizontal.
 *
 * Aqui a margem é a da pesquisa, e não a exceção do vertical: no quadro
 * deitado a pessoa não ocupa o terço inferior, então a regra original (terço
 * inferior central) volta a cumprir a própria intenção.
 */
export const QUADRO_HORIZONTAL: Quadro = { largura: 1920, altura: 1080, margemDeBaixo: 90 };

/**
 * Onde um instante da GRAVAÇÃO cai dentro do corte já limpo.
 *
 * Devolve `null` quando o instante caiu num pedaço removido: palavra que não
 * está no áudio não pode aparecer escrita.
 */
export function noTempoDoCorte(
  segundo: number,
  inicioDoCorte: number,
  intervalos: Intervalo[]
): number | null {
  const t = segundo - inicioDoCorte;
  let acumulado = 0;
  for (const i of intervalos) {
    if (t < i.de) return null;
    if (t <= i.ate) return acumulado + (t - i.de);
    acumulado += i.ate - i.de;
  }
  return null;
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
  intervalos: Intervalo[],
  estilo: Estilo,
  quadro: Quadro = QUADRO_VERTICAL,
  /**
   * As frases de destaque escolhidas pelo agente a partir da fala, já no tempo
   * da gravação. Entram no mesmo arquivo da legenda, num estilo próprio: dois
   * arquivos ASS sobre o mesmo vídeo significariam dois passes de `subtitles`
   * no filtro, e o segundo redesenharia por cima sem saber do primeiro.
   */
  destaques: { segundo: number; valor: string }[] = []
): string {
  if (!intervalos.length) return "";
  const fimDoCorte = inicioDoCorte + intervalos[intervalos.length - 1].ate;
  // Quanto o corte dura DEPOIS da limpeza. A última linha não pode passar
  // disto: medido em 24/08, ela sobrava 0,77 s além do fim do arquivo, o que o
  // ffmpeg simplesmente descarta, mas deixa o arquivo de legenda dizendo uma
  // coisa que o vídeo não faz, e é assim que se depura o lugar errado depois.
  const duracaoDoCorte = intervalos.reduce((s, i) => s + (i.ate - i.de), 0);

  // Cada palavra vira o par (início, fim) JÁ no tempo do corte. Palavra que
  // caiu dentro de uma remoção some aqui, porque `noTempoDoCorte` devolve null.
  const marcadas: { inicio: number; fim: number; texto: string }[] = [];
  for (const p of palavras) {
    if (p.end <= inicioDoCorte || p.start >= fimDoCorte) continue;
    const inicio = noTempoDoCorte(p.start, inicioDoCorte, intervalos);
    const fim = noTempoDoCorte(p.end, inicioDoCorte, intervalos);
    if (inicio === null || fim === null || fim <= inicio) continue;
    const texto = limpar(p.word);
    if (texto) marcadas.push({ inicio, fim, texto });
  }
  if (!marcadas.length) return "";

  const L = estilo.legenda;

  // Agrupa em blocos do tamanho que o estilo pede. Um bloco vira uma linha na
  // tela, e dentro dele o karaokê acende palavra por palavra.
  const blocos: (typeof marcadas)[] = [];
  for (let i = 0; i < marcadas.length; i += L.palavrasPorVez) {
    blocos.push(marcadas.slice(i, i + L.palavrasPorVez));
  }

  // A margem lateral acompanha a largura do quadro: 80 num quadro de 1080 é
  // 7,4%, e o mesmo 80 num quadro de 1920 seria 4,2%, encostando na borda.
  const margemLateral = Math.round(quadro.largura * 0.074);
  const larguraUtil = quadro.largura - 2 * margemLateral;

  const linhas: string[] = [];
  for (const [b, bloco] of blocos.entries()) {
    const inicio = bloco[0].inicio;
    const fimDaFala = bloco[bloco.length - 1].fim;
    if (fimDaFala <= inicio) continue;

    // Cada bloco fica na tela ATÉ o próximo aparecer, e nunca depois disso.
    //
    // As duas metades desta regra vieram do primeiro quadro renderizado, em
    // 24/08, que mostrou dois blocos ao mesmo tempo, empilhados em alturas
    // diferentes. O segundo entrava antes de o primeiro sair, e o libass, ao
    // ver duas linhas ocupando o mesmo lugar, empurra uma para cima. Legenda
    // que pula de altura parece defeito.
    //
    // O outro lado é o buraco: com uma palavra por vez, terminar no fim da
    // palavra deixa a tela vazia entre uma e outra, e o olho lê isso como
    // piscar. Ficar até o próximo entrar resolve os dois.
    //
    // O teto de 0,8 s existe para a pausa longa: sem ele a última palavra antes
    // de um silêncio ficaria parada na tela até a fala voltar.
    const proximo = blocos[b + 1]?.[0].inicio ?? Infinity;
    const fim = Math.min(proximo - 0.02, fimDaFala + 0.8, duracaoDoCorte);
    if (fim <= inicio) continue;

    // `\k` conta em CENTÉSIMOS de segundo, e não em segundos. Errar a unidade
    // aqui faz o destaque correr cem vezes mais rápido que a fala, e o sintoma
    // é uma legenda que pisca inteira no primeiro quadro.
    const texto = bloco
      .map((p, i) => {
        const anterior = i === 0 ? bloco[0].inicio : bloco[i - 1].fim;
        const duracao = Math.max(1, Math.round((p.fim - anterior) * 100));
        const palavra = L.caixaAlta ? p.texto.toUpperCase() : p.texto;
        return `{\\k${duracao}}${palavra} `;
      })
      .join("")
      .trimEnd();

    // CADA LINHA ENTRA NO MAIOR CORPO QUE AINDA CABE.
    //
    // Um corpo fixo para o estilo inteiro erra dos dois lados, e os dois lados
    // foram medidos em 24/08 no corte real. Com corpo grande, a palavra mais
    // longa da gravação passa da tela, e no modo de uma palavra por vez a
    // quebra automática não salva, porque não há espaço onde quebrar. Com corpo
    // pequeno o suficiente para a pior palavra caber, a palavra MEDIANA ocupa
    // 13% da largura, que é invisível num telefone.
    //
    // O `corpo` do estilo vira portanto um TETO, e não um valor. Palavra curta
    // sobe até ele; frase longa desce até caber. É o que as ferramentas do
    // mercado fazem, e é a razão de a legenda delas parecer grande sem nunca
    // vazar.
    //
    // A conta é exata porque a largura de cada caractere vem da tabela hmtx da
    // própria fonte. O único erro que sobra é o kerning, que em fonte de
    // legenda é desprezível e sempre para menos.
    const emCorpos = larguraEmCorpos(
      bloco.map((p) => (L.caixaAlta ? p.texto.toUpperCase() : p.texto)).join(" "),
      L.fonte
    );
    const corpo = Math.max(
      24,
      Math.min(L.corpo, Math.floor(larguraUtil / Math.max(0.1, emCorpos)))
    );
    // `s` só entra quando muda alguma coisa, para o arquivo não ficar cheio
    // de marca que não faz nada.
    const ajuste = corpo < L.corpo ? `{\\fs${corpo}}` : "";

    linhas.push(
      `Dialogue: 0,${carimbo(inicio)},${carimbo(fim)},Fala,,0,0,0,,${ajuste}${texto}`
    );
  }
  if (!linhas.length) return "";

  // As frases de destaque, convertidas para o tempo do corte pela MESMA lista de
  // intervalos que a legenda usa. Nada de segunda conta em outro lugar.
  //
  // Camada 1 e não 0: se por acaso uma frase e uma linha de legenda ocuparem o
  // mesmo espaço, a legenda é quem tem que ficar por baixo, porque ela é
  // contínua e a frase é pontual.
  const linhasDeDestaque: string[] = [];
  for (const d of destaques) {
    const inicio = noTempoDoCorte(d.segundo, inicioDoCorte, intervalos);
    if (inicio === null) continue;
    const texto = limpar(d.valor).toUpperCase();
    if (!texto) continue;
    // Dois segundos e meio: tempo de ler quatro palavras sem a frase virar
    // parte do cenário.
    const fim = Math.min(inicio + 2.5, duracaoDoCorte);
    if (fim <= inicio) continue;
    // Entra crescendo, em 150 ms. É o mínimo que o olho registra como algo
    // NOVO aparecendo, em vez de algo que já estava lá.
    linhasDeDestaque.push(
      `Dialogue: 1,${carimbo(inicio)},${carimbo(fim)},Destaque,,0,0,0,,` +
        `{\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)}${texto}`
    );
  }


  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${quadro.largura}`,
    `PlayResY: ${quadro.altura}`,
    // WrapStyle 0 mantém a quebra automática ligada, e ela é uma REDE DE
    // SEGURANÇA e não um recurso. Com poucas palavras por vez a quebra quase
    // nunca dispara; quando dispara, é porque a linha ia passar da largura da
    // tela, e nesse caso quebrar é o único desfecho aceitável. O WrapStyle 2,
    // que estava aqui antes, deixaria a frase correr para fora do quadro.
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // PrimaryColour é a cor de quem JÁ foi falado; SecondaryColour é a de quem
    // ainda vem. O karaokê do ASS anda da secundária para a primária, então o
    // destaque entra em PrimaryColour, o que é o contrário do que o nome sugere.
    //
    // O nome da fonte vai INTEIRO, e não só a primeira parte antes da vírgula.
    // Fonte é escolhida pelo fontconfig do contêiner, e lá dentro só existe o
    // que o Dockerfile instalou; pilha de alternativas ao estilo do navegador
    // não significa nada para o libass, que trata a string toda como um nome.
    `Style: Fala,${L.fonte},${L.corpo},${L.corDoDestaque},${L.cor},&H00000000,&HA0000000,${L.negrito ? -1 : 0},0,1,${L.contorno},2,2,${margemLateral},${margemLateral},${quadro.margemDeBaixo},1`,
    // A frase de destaque mora ACIMA da legenda, com o corpo pela metade e na
    // cor de destaque do estilo. Menor de propósito: ela reforça a legenda e
    // não compete com ela, e duas linhas do mesmo tamanho na tela fazem o olho
    // ter que escolher qual ler.
    `Style: Destaque,${L.fonte},${Math.round(L.corpo * 0.5)},${L.corDoDestaque},${L.corDoDestaque},&H00000000,&HA0000000,${L.negrito ? -1 : 0},0,1,${L.contorno},2,2,${margemLateral},${margemLateral},${quadro.margemDeBaixo + Math.round(quadro.altura * 0.13)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...linhas,
    ...linhasDeDestaque,
  ].join("\n");
}
