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
   * O PISO do silêncio que fica. Cortar a pausa inteira cola as frases e o
   * resultado soa apressado e artificial, o famoso corte de vídeo de internet.
   * Uma respiração curta é o que faz a edição parecer boa em vez de aparecer.
   *
   * É piso, e não valor fixo, desde 01/09: ver `respiroDaPausa`.
   */
  respiroSegundos?: number;
};

/**
 * Quanto silêncio uma pausa merece guardar, em função do tamanho dela.
 *
 * ## O defeito que isto conserta, medido antes de consertado
 *
 * Até 01/09 toda pausa acima do limiar virava 0,25s de respiro, fosse ela de
 * 0,7s ou de 3,1s. Medido no vídeo real que o Bruno reprovou (982s, 2.388
 * palavras): das 53 pausas removidas, **15 tinham mais de 1,2s**, e o arquivo
 * entregue saiu com **ZERO pausa acima de 0,8s em 14 minutos e meio de fala**.
 *
 * Pausa longa não é desperdício, é PONTUAÇÃO. É ela que diz "terminei este
 * assunto". Esmagar todas para 0,25s foi o que produziu a queixa dele: "terminou
 * em um tema e voltou em outro nada a ver". O dado mostra o caso exato, aos
 * 815,5s: uma pausa retórica de 2,6s antes de "é se você tem uma palavra"
 * virava um quarto de segundo, e a conclusão colava na pergunta.
 *
 * ## A regra
 *
 * O respiro acompanha a pausa: um terço dela, com piso de 0,30s (o suficiente
 * para não soar emendado) e teto de 0,90s (acima disso vira tempo morto).
 * Continua devolvendo tempo ao espectador, sem apagar a pontuação da fala.
 *
 * É a mesma ideia do `--margin` do auto-editor, a ferramenta de referência
 * desta categoria: o corte automático que não deixa margem soa mecânico.
 */
export function respiroDaPausa(buraco: number, piso = 0.3): number {
  return Math.min(0.9, Math.max(piso, buraco / 3));
}

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
  const respiro = opcoes.respiroSegundos ?? 0.3;
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
    const fica = respiroDaPausa(buraco, respiro);
    const de = palavras[i - 1].end + fica / 2;
    const ate = palavras[i].start - fica / 2;
    if (ate - de > 0.1) {
      remocoes.push({ de, ate, motivo: `pausa de ${buraco.toFixed(1)}s` });
    }
  }

  return remocoes.sort((a, b) => a.de - b.de);
}

/**
 * Devolve à emenda o material que o fade vai consumir.
 *
 * ## O estalo, e por que ele existia
 *
 * O worker emenda cada pedaço mantido com um fade de milissegundos no áudio,
 * para não estalar. Só que esse fade caía SOBRE A FALA: o pedaço seguinte
 * começava exatamente na primeira palavra e subia de zero, comendo o ataque da
 * consoante. O ouvido registra isso como estalo ou palavra engolida, e foi o
 * que o Bruno ouviu. Medido no arquivo entregue do vídeo reprovado: **18 pontos
 * com descontinuidade de amostra**, com o fade de 15ms em vigor.
 *
 * ## O conserto
 *
 * Cada remoção encolhe uma folga de cada lado. O material dessa folga é
 * silêncio ou rabo de muleta, ou seja, coisa que ia para o lixo, e é sobre ELE
 * que o fade acontece agora. A fala entra e sai em volume cheio.
 *
 * A folga mora aqui, e não no worker, por uma razão que já custou desencontro:
 * a legenda é calculada a partir desta mesma lista de remoções. Se o worker
 * inventasse folga por conta própria, o áudio andaria para a frente 30ms por
 * emenda e, com 160 emendas, a legenda sairia 5 segundos fora da fala.
 *
 * Remoção curta ganha folga proporcional: não faz sentido devolver 60ms a uma
 * remoção de 120ms, que é o "né" de meio segundo do gravador.
 */
export function folgaParaEmenda(remocoes: Remocao[], folga = 0.03): Remocao[] {
  return remocoes
    .map((r) => {
      const dur = r.ate - r.de;
      const f = Math.min(folga, Math.max(0, (dur - 0.12) / 2));
      return { ...r, de: r.de + f, ate: r.ate - f };
    })
    .filter((r) => r.ate - r.de > 0.05);
}

/**
 * O mesmo limiar padrão de `detectarPausas`. Acima dele, o silêncio vizinho de
 * uma remoção é PONTUAÇÃO, e quem decide quanto dele fica é a pausa, com o
 * respiro proporcional; a remoção de fala só encosta nele.
 */
const LIMIAR_DE_PAUSA = 0.6;

/**
 * Quanto silêncio sempre fica colado numa palavra MANTIDA, no máximo.
 *
 * A Deepgram entrega tempo de palavra em degraus de uns 80ms, e o fim marcado
 * costuma vir antes do fim real do som (a vogal final some devagar). Cortar
 * rente ao número come esse rabo; 0,12s cobre um degrau e meio.
 */
const MARGEM_DA_PALAVRA = 0.12;

/** Folga para decidir se um instante está "na" fronteira da palavra. */
const EPS = 0.005;

/**
 * Quanto do buraco entre duas palavras fica do lado da palavra mantida, quando
 * a palavra do outro lado sai.
 *
 * Buraco curto (vírgula, respiração): o corte cai no MEIO dele, com teto de
 * `MARGEM_DA_PALAVRA`. Assim "funcionário, [0,16] né [0,24] agente" vira
 * "funcionário, agente" com uns 0,2s de respiro, que é o tamanho de uma
 * vírgula falada.
 *
 * Buraco longo (acima do limiar de pausa): quase todo ele fica, e a remoção só
 * tira 30ms colados na palavra que sai. O buraco longo já é uma pausa, e
 * `detectarPausas` vai encolhê-lo com o respiro certo. Se a remoção de fala
 * comesse esse silêncio, a união das duas colaria o fim de uma frase no começo
 * da outra, que é o defeito de 01/09 ("terminou em um tema e voltou em outro").
 */
export function margemNoSilencio(buraco: number): number {
  const g = Math.max(0, buraco);
  if (g > LIMIAR_DE_PAUSA) return g - 0.03;
  return Math.min(g / 2, MARGEM_DA_PALAVRA);
}

/**
 * Onde um instante cai em relação às palavras: dentro de uma, ou no buraco
 * entre duas. Busca binária porque roda duas vezes por remoção e a gravação
 * tem milhares de palavras.
 */
function ondeCai(
  palavras: Word[],
  t: number
): { dentro?: number; antes?: number; depois?: number } {
  let lo = 0;
  let hi = palavras.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (palavras[meio].start <= t) lo = meio + 1;
    else hi = meio;
  }
  // `lo` é a primeira palavra que começa depois de t.
  const i = lo - 1;
  if (i < 0) return { depois: 0 };
  const w = palavras[i];
  if (t <= w.start + EPS) {
    return { antes: i - 1 >= 0 ? i - 1 : undefined, depois: i };
  }
  if (t >= w.end - EPS) {
    return { antes: i, depois: lo < palavras.length ? lo : undefined };
  }
  return { dentro: i };
}

/** Que fração da palavra a remoção leva. Metade ou mais: a palavra sai. */
function fracaoCoberta(r: { de: number; ate: number }, w: Word): number {
  const dur = Math.max(w.end - w.start, 1e-3);
  return Math.max(0, Math.min(r.ate, w.end) - Math.max(r.de, w.start)) / dur;
}

/**
 * Leva cada borda de remoção para o silêncio entre palavras, e só então aplica
 * a folga do fade. Substitui `folgaParaEmenda` quando há palavras à mão.
 *
 * ## O defeito, medido no teste de 29/09
 *
 * O corte saiu com um "né" no meio da fala. O "né" ESTAVA na lista de remoção
 * desde 31/08; o que sobrava era o pedaço dele. As remoções de palavra iam do
 * `start` ao `end` exatos da palavra, e a folga do fade encolhia cada uma 20 a
 * 30ms para DENTRO, devolvendo ao vídeo o ataque do "n" e o fim do "é". Como a
 * Deepgram marca tempo em degraus de 80ms, o som real passava ainda mais do
 * número. A folga foi pensada para remoção de pausa, que é só silêncio; em
 * remoção de palavra ela devolve a palavra.
 *
 * ## As regras
 *
 * 1. Borda DENTRO de palavra: se a remoção leva metade ou mais da palavra, a
 *    palavra sai inteira e a borda vai para o silêncio do lado de fora dela;
 *    se leva menos, a palavra fica inteira e a borda recua para o silêncio
 *    antes (ou depois) dela. Nunca meia palavra.
 * 2. Borda no silêncio, mas colada na palavra mantida: afasta até a margem,
 *    para não comer o rabo nem o ataque dela.
 * 3. Borda no silêncio, mas colada na palavra que SAI: vai para o meio do
 *    buraco (`margemNoSilencio`), senão sobra o ataque da palavra removida.
 * 4. A folga do fade só anda dentro do silêncio do lado removido. Onde as duas
 *    palavras estão coladas (buraco zero), não há folga: o fade sobre a
 *    palavra mantida é um tique de 15ms, e sobre a removida seria a sílaba.
 *
 * O "rabo gaguejado" de `detectarRepeticoes` corta dentro da palavra DE
 * PROPÓSITO (a transcrição juntou gagueira e palavra num tempo só), então a
 * borda final dele não é mexida.
 */
export function emendarNoSilencio(
  remocoes: Remocao[],
  palavras: Word[],
  folga = 0.03
): Remocao[] {
  if (!palavras.length) return folgaParaEmenda(remocoes, folga);

  const encaixadas = remocoes.map((r) => {
    let { de, ate } = r;
    const rabo = r.motivo.includes("rabo gaguejado");

    // Começo da remoção: o que vem antes dela fica.
    const a = ondeCai(palavras, r.de);
    if (a.dentro !== undefined) {
      const w = palavras[a.dentro];
      const ant = palavras[a.dentro - 1];
      if (fracaoCoberta(r, w) >= 0.5) {
        de = ant ? Math.min(w.start, ant.end + margemNoSilencio(w.start - ant.end)) : w.start;
      } else {
        const seg = palavras[a.dentro + 1];
        const g = seg ? seg.start - w.end : Infinity;
        de = w.end + Math.min(g / 2, MARGEM_DA_PALAVRA);
      }
    } else if (a.antes !== undefined) {
      const fimAnt = palavras[a.antes].end;
      const g = a.depois !== undefined ? palavras[a.depois].start - fimAnt : Infinity;
      const piso = fimAnt + Math.min(g / 2, MARGEM_DA_PALAVRA);
      if (de < piso) de = piso;
      else if (a.depois !== undefined && g > 0 && de >= palavras[a.depois].start - EPS) {
        de = fimAnt + margemNoSilencio(g);
      }
    }

    // Fim da remoção: o que vem depois dela fica.
    const b = ondeCai(palavras, r.ate);
    if (b.dentro !== undefined && !rabo) {
      const w = palavras[b.dentro];
      const seg = palavras[b.dentro + 1];
      if (fracaoCoberta(r, w) >= 0.5) {
        ate = seg ? Math.max(w.end, seg.start - margemNoSilencio(seg.start - w.end)) : w.end;
      } else {
        const ant = palavras[b.dentro - 1];
        const g = ant ? w.start - ant.end : Infinity;
        ate = w.start - Math.min(g / 2, MARGEM_DA_PALAVRA);
      }
    } else if (b.depois !== undefined && b.dentro === undefined) {
      const inicioSeg = palavras[b.depois].start;
      const g = b.antes !== undefined ? inicioSeg - palavras[b.antes].end : Infinity;
      const teto = inicioSeg - Math.min(g / 2, MARGEM_DA_PALAVRA);
      if (ate > teto) ate = teto;
      else if (b.antes !== undefined && g > 0 && ate <= palavras[b.antes].end + EPS) {
        ate = inicioSeg - margemNoSilencio(g);
      }
    }
    return { ...r, de, ate, rabo };
  });

  // Encaixar pode fazer duas remoções vizinhas se tocarem no mesmo buraco.
  const ordenadas = encaixadas.filter((r) => r.ate > r.de).sort((x, y) => x.de - y.de);
  const unidas: Array<Remocao & { rabo: boolean }> = [];
  for (const r of ordenadas) {
    const anterior = unidas[unidas.length - 1];
    if (anterior && r.de <= anterior.ate) {
      if (r.ate > anterior.ate) {
        anterior.ate = r.ate;
        anterior.rabo = r.rabo;
      }
      if (!anterior.motivo.includes(r.motivo)) anterior.motivo = `${anterior.motivo} e ${r.motivo}`;
    } else {
      unidas.push({ ...r });
    }
  }

  return unidas
    .map(({ rabo, ...r }) => {
      const dur = r.ate - r.de;
      const teto = Math.max(0, (dur - 0.05) / 2);
      // Silêncio disponível do lado de DENTRO de cada borda: é só ali que o
      // fade pode acontecer sem tocar em palavra removida.
      const a = ondeCai(palavras, r.de);
      const livreNoInicio =
        a.dentro !== undefined ? 0 : a.depois !== undefined ? palavras[a.depois].start - r.de : dur;
      const b = ondeCai(palavras, r.ate);
      const livreNoFim = rabo
        ? folga
        : b.dentro !== undefined
          ? 0
          : b.antes !== undefined
            ? r.ate - palavras[b.antes].end
            : dur;
      const fDe = Math.min(folga, teto, Math.max(0, livreNoInicio));
      const fAte = Math.min(folga, teto, Math.max(0, livreNoFim));
      return { ...r, de: r.de + fDe, ate: r.ate - fAte };
    })
    .filter((r) => r.ate - r.de > 0.05);
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
  opcoes: {
    segundosNaTela?: number;
    corDeDestaque?: string;
    fonte?: string;
    /**
     * As frases que o agente de efeitos tirou da fala, em tempo do ORIGINAL.
     *
     * Entram no vídeo completo pelo pedido do Bruno em 24/08, de que os
     * comentários dele valem para o completo também. Elas são PONTUAIS, então
     * não brigam com a decisão dele de 23/08 de o completo não ter legenda
     * contínua: legenda em tudo polui o vídeo longo e compete com quem fala.
     */
    frases?: { segundo: number; valor: string }[];
  } = {}
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
    // A fonte é a do ESTILO do projeto, e o padrão é Liberation Sans e não
    // Arial. Não é troca de gosto: o contêiner do worker é Debian e não tem
    // nenhuma fonte da Microsoft. Verificado no quadro do vídeo completo de
    // produção em 24/08: este estilo pedia Arial e o que apareceu na tela foi
    // DejaVu Sans Bold, escolhida em silêncio pelo libass. A Liberation Sans
    // tem as mesmas métricas da Arial e está instalada de propósito.
    `Style: Destaque,${opcoes.fonte ?? "Liberation Sans"},64,&H00FFFFFF,${destaque},&HB0000000,-1,3,4,0,2,120,120,90,1`,
    // A frase que sai da fala é MENOR e sem caixa, porque ela não é o título do
    // momento, é um reforço do que acabou de ser dito. Alignment 8 põe ela no
    // topo, longe do destaque de baixo: no vídeo deitado sobra tela em cima, e
    // duas caixas empilhadas embaixo tapariam o slide.
    `Style: Frase,${opcoes.fonte ?? "Liberation Sans"},48,${destaque},&H00000000,&H00000000,-1,1,4,0,8,120,120,60,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const frases = (opcoes.frases ?? [])
    .map((f) => {
      const inicio = mapearTempo(f.segundo, remocoes);
      const texto = limparTexto(f.valor).toUpperCase();
      if (!texto) return null;
      // Dois segundos e meio, o mesmo do corte: tempo de ler quatro palavras
      // sem a frase virar parte do cenário. Camada 1 para nunca disputar
      // posição com o destaque do momento, que é a informação principal.
      return (
        `Dialogue: 1,${carimboAss(inicio)},${carimboAss(inicio + 2.5)},Frase,,0,0,0,,` +
        `{\\fscx70\\fscy70\\t(0,150,\\fscx100\\fscy100)}${texto}`
      );
    })
    .filter((l): l is string => l !== null);

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

  return [...cabecalho, ...linhas, ...frases].join("\n") + "\n";
}

/**
 * Os pedaços de um trecho que SOBREVIVEM à limpeza, já relativos ao início dele.
 *
 * ## Por que isto existe, e por que ele é a fonte única
 *
 * Três lugares precisam saber exatamente onde cada segundo do trecho vai parar
 * depois da limpeza: o worker, que emenda os pedaços; a legenda, que precisa
 * acender a palavra no instante certo; e a duração, que a composição usa para o
 * zoom e para o `-t`.
 *
 * Até 24/08 cada um calculava por conta. O worker filtrava remoção menor que
 * 0,05 s e descartava pedaço mantido menor que 0,05 s; a legenda descontava
 * TODAS as remoções. A diferença é pequena por trecho e ela ACUMULA, e legenda
 * fora de sincronia é pior que legenda nenhuma, porque parece defeito.
 *
 * Agora existe uma lista só. O app calcula, manda pronta, e o worker apenas
 * emenda o que recebeu. Se a regra mudar, ela muda num lugar e os dois lados
 * andam juntos por construção, e não por disciplina.
 *
 * Os limiares de 0,05 s vieram do worker e ficam aqui pelo mesmo motivo de
 * sempre: pedaço menor que um quadro e meio não vira vídeo, vira um nó a mais
 * no grafo de filtro e um risco de `trim` vazio.
 */
export function intervalosDoTrecho(
  remocoes: { de: number; ate: number }[],
  inicio: number,
  fim: number,
  /**
   * Opcional, e quem passa ganha bordas no silêncio.
   *
   * As bordas do trecho vêm arredondadas para o segundo inteiro, e o segundo
   * inteiro cai onde cair: no teste de 29/09 o corte 2 começava em 504, dentro
   * do "né?" dito antes (503,82 a 504,30). A remoção do "né" cobria até 504,27
   * e o vídeo abria com o rabo dele. Com as palavras, a primeira e a última
   * borda mantidas saem de dentro de palavra que pertence ao lado de fora.
   */
  palavras?: Word[]
): { de: number; ate: number }[] {
  const duracao = fim - inicio;
  const dentro = remocoes
    .filter((r) => r.ate > inicio && r.de < fim && r.ate > r.de)
    .map((r) => ({
      de: Math.max(0, Math.min(r.de, fim) - inicio),
      ate: Math.max(0, Math.min(r.ate, fim) - inicio),
    }))
    .filter((r) => r.ate - r.de > 0.05)
    .sort((a, b) => a.de - b.de);

  const fica: { de: number; ate: number }[] = [];
  let cursor = 0;
  for (const r of dentro) {
    if (r.de > cursor) fica.push({ de: cursor, ate: r.de });
    cursor = Math.max(cursor, r.ate);
  }
  if (duracao > cursor) fica.push({ de: cursor, ate: duracao });

  if (palavras?.length && fica.length) {
    // Primeira borda mantida: se cai dentro de uma palavra que é quase toda
    // de ANTES do trecho, ou colada no fim dela, o trecho abre com o rabo de
    // uma palavra que não é dele. Pula para o silêncio depois dela. O caso
    // oposto (palavra quase toda dentro) não tem conserto aqui, porque o
    // intervalo não pode começar antes do início do trecho: isso é assunto de
    // quem escolhe as bordas.
    const primeira = fica[0];
    const s = inicio + primeira.de;
    const a = ondeCai(palavras, s);
    let novoInicio = s;
    if (a.dentro !== undefined) {
      const w = palavras[a.dentro];
      if (s - w.start > w.end - s) {
        const seg = palavras[a.dentro + 1];
        novoInicio = w.end + (seg ? Math.min((seg.start - w.end) / 2, MARGEM_DA_PALAVRA) : 0);
      }
    } else if (a.antes !== undefined && a.depois !== undefined) {
      const fimAnt = palavras[a.antes].end;
      const g = palavras[a.depois].start - fimAnt;
      novoInicio = Math.max(s, fimAnt + Math.min(g / 2, MARGEM_DA_PALAVRA));
    }
    primeira.de = Math.min(primeira.ate, novoInicio - inicio);

    // Última borda mantida: o espelho, contra o ataque da palavra seguinte.
    const ultima = fica[fica.length - 1];
    const e = inicio + ultima.ate;
    const b = ondeCai(palavras, e);
    let novoFim = e;
    if (b.dentro !== undefined) {
      const w = palavras[b.dentro];
      if (w.end - e > e - w.start) {
        const ant = palavras[b.dentro - 1];
        novoFim = w.start - (ant ? Math.min((w.start - ant.end) / 2, MARGEM_DA_PALAVRA) : 0);
      }
    } else if (b.antes !== undefined && b.depois !== undefined) {
      const inicioSeg = palavras[b.depois].start;
      const g = inicioSeg - palavras[b.antes].end;
      novoFim = Math.min(e, inicioSeg - Math.min(g / 2, MARGEM_DA_PALAVRA));
    }
    ultima.ate = Math.max(ultima.de, novoFim - inicio);
  }

  return fica.filter((f) => f.ate - f.de > 0.05);
}

/** Quanto o trecho passa a durar depois da limpeza. */
export function duracaoDosIntervalos(
  intervalos: { de: number; ate: number }[]
): number {
  return intervalos.reduce((s, i) => s + (i.ate - i.de), 0);
}
