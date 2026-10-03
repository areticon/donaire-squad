import { askClaude } from "@/lib/claude";
import type { Word } from "@/lib/media/transcribe";
import { margemNoSilencio, respiroDaPausa, type Remocao } from "@/lib/media/edicao";
import { falaCoberta, FALA_MAXIMA_POR_REMOCAO_SEC } from "@/lib/media/texto-final-do-corte";
import { muletasPeloJev } from "@/lib/media/decidir-retomadas";

/**
 * A limpeza da fala: hesitação, muleta e recomeço de frase.
 *
 * Existe porque a remoção de pausas não resolve o problema que o Bruno relatou.
 * Pausa é SILÊNCIO, e hesitação TEM ÁUDIO: o "é" arrastado e o "bom, vamos lá"
 * repetido atravessavam a edição inteira sem serem tocados.
 *
 * Medido na gravação real dele: 147 "é", 78 "então", 44 "né", 35 "aí", e o
 * vídeo abre com "Bom, vamos lá gente. Quero falar com vocês aqui de tema
 * sobre, é, a minha trajetória", com um recomeço logo depois ("eu saí do, bom,
 * então, eu quero falar como eu saí do CLT").
 *
 * ## Por que isso precisa de um agente, e não de uma lista de palavras
 *
 * Cortar toda ocorrência de "é" destruiria a fala: "é" é verbo. "Então" liga
 * duas ideias metade das vezes e é muleta na outra metade. A diferença está no
 * PAPEL da palavra na frase, não na palavra, e isso só se decide lendo.
 *
 * ## Por que o corte é por PALAVRA e não por tempo
 *
 * O agente devolve índices de palavras, e os tempos saem da transcrição. Se ele
 * devolvesse segundos, um erro de meio segundo cortaria a sílaba do vizinho, e
 * o resultado seria pior que a hesitação original.
 */

export type Limpeza = {
  /** Índice da primeira palavra a remover, na lista de palavras. */
  de: number;
  /** Índice da última palavra a remover, inclusive. */
  ate: number;
  motivo: string;
};


/**
 * Esta palavra FECHA uma frase?
 *
 * A transcrição vem pontuada, e a pontuação é o único sinal barato de onde uma
 * ideia termina e outra começa. Vale ouro para a limpeza: um corte que atravessa
 * um ponto final não remove muleta, ele COLA DOIS ASSUNTOS. Foi a queixa do
 * Bruno em 01/09 ("terminou em um tema e voltou em outro nada a ver").
 */
function fechaFrase(palavra: string): boolean {
  return /[.!?…]["'”’)\]]?\s*$/.test(palavra);
}

/** Tira acento e pontuação, para comparar palavra com palavra. */
function chaveDaPalavra(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * As repetições imediatas de palavra, detectadas por CÓDIGO e não pelo agente.
 *
 * ## Por que isto existe além do agente
 *
 * A regra 3 do prompt já pede a remoção de repetição imediata, e o agente não
 * dá conta: medido na gravação real em 24/08, ele deixou passar **93 palavras
 * repetidas e 12 expressões repetidas, somando 40 segundos de cópias**. O
 * "Eu, eu, eu sempre tive" e o "faz parte da, de de de mercado" que o Bruno
 * ouviu nos cortes eram isso.
 *
 * E repetição imediata não é julgamento, é aritmética sobre a transcrição:
 * mesma palavra, colada no tempo. A regra da casa manda tarefa mecânica para
 * código e julgamento para o modelo, e esta sempre foi mecânica.
 *
 * ## O que remove, e as duas escolhas que importam
 *
 * "eu, eu, eu" remove as duas primeiras e FICA A ÚLTIMA: é a última que emenda
 * na fala que continua, então a prosódia sobrevive. "que eu, que eu" (expressão
 * de duas palavras repetida) remove a primeira dupla.
 *
 * O limite de tempo entre as cópias existe porque repetição com pausa grande
 * no meio costuma ser retomada legítima ("sim. Sim, mas veja"), e não gagueira.
 */
/**
 * Palavras que gaguejam como se fossem a mesma: "dos do de Camus", "no na
 * nossa". A chave de repetição junta a família, e a família é curta de
 * propósito: só contrações de preposição com artigo, que nunca aparecem em
 * sequência numa frase inteira.
 */
const FAMILIAS = new Map<string, string>(
  Object.entries({
    de: "de", do: "de", da: "de", dos: "de", das: "de",
    no: "no", na: "no", nos: "no", nas: "no",
    pro: "pra", pra: "pra", pros: "pra", pras: "pra",
  })
);

/** Preposições que pedem complemento: a palavra depois delas é objeto. */
const PREPOSICOES = new Set(["em", "de", "pra", "para", "com", "por", "sem", "ate", "sobre", "entre"]);

/** Só letras, minúsculas, acento preservado: separa "e" de "é". */
function comAcento(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}]/gu, "");
}

function chaveDeRepeticao(t: string): string {
  const k = chaveDaPalavra(t);
  return FAMILIAS.get(k) ?? k;
}

/**
 * Quanto dura esta palavra quando a pessoa a diz de uma vez, medido na própria
 * gravação. É a mediana das ocorrências, com piso para palavra rara.
 */
function duracaoTipica(palavras: Word[]): (chave: string) => number {
  const porChave = new Map<string, number[]>();
  for (const p of palavras) {
    const k = chaveDaPalavra(p.word);
    if (!k) continue;
    const lista = porChave.get(k) ?? [];
    lista.push(p.end - p.start);
    porChave.set(k, lista);
  }
  return (chave) => {
    const lista = (porChave.get(chave) ?? []).sort((a, b) => a - b);
    if (lista.length < 3) return 0.24;
    return Math.max(0.16, lista[Math.floor(lista.length / 2)]);
  };
}

export function detectarRepeticoes(palavras: Word[]): Remocao[] {
  const remocoes: Remocao[] = [];
  const tipica = duracaoTipica(palavras);

  for (let i = 3; i < palavras.length; i++) {
    const k = chaveDeRepeticao(palavras[i].word);
    if (!k) continue;

    // A B A B: a expressão de duas palavras dita duas vezes seguidas.
    if (
      chaveDeRepeticao(palavras[i - 3].word) === chaveDeRepeticao(palavras[i - 1].word) &&
      chaveDeRepeticao(palavras[i - 2].word) === k &&
      // "bastante contexto, e contexto é rei" (corte de quinta, teste de
      // 29/09): a chave sem acento via "e contexto é" como "e contexto e" e
      // tirava "contexto, e", deixando "tem bastante contexto é rei". O acento
      // separa conjunção de verbo, como já faz a regra A A A abaixo.
      comAcento(palavras[i - 2].word) === comAcento(palavras[i].word) &&
      // Primeira cópia fechada por vírgula é repetição de propósito (retórica),
      // e não gagueira: "contexto, e contexto".
      !separada(palavras[i - 3].word) &&
      palavras[i - 1].start - palavras[i - 3].end < 1.5 &&
      // "Isso é o ponto. O ponto é outro": a repetição atravessa o fim da
      // frase, então é retomada de propósito, e não gagueira.
      !fechaFrase(palavras[i - 2].word)
    ) {
      remocoes.push({
        de: palavras[i - 3].start,
        ate: palavras[i - 2].end,
        motivo: `expressão repetida: "${palavras[i - 3].word} ${palavras[i - 2].word}"`,
      });
    }
  }

  // A A A: a mesma palavra colada nela mesma, em sequência de qualquer tamanho,
  // com ou sem som de hesitação no meio ("que, ah, que").
  //
  // A sequência é tratada INTEIRA, e não par a par, por causa do que o Bruno
  // ouviu em 02/09 no poema: "ele, ele, ele, ele questiona" saiu do vídeo
  // entregue como "ele, ele, ele questiona". A transcrição tinha só três "ele"
  // (a Deepgram junta gagueira em menos palavras, com tempo de 80 em 80ms), o
  // código removeu dois e ficou o terceiro, que na verdade tinha dois dentro:
  // durava 0,56s, contra 0,24s de um "ele" dito de uma vez.
  //
  // Daí a regra do rabo: fica só a duração típica da palavra, colada na fala
  // que continua. O que a última cópia tem a mais é gagueira que a transcrição
  // não separou.
  let i = 0;
  while (i < palavras.length) {
    const k = chaveDeRepeticao(palavras[i].word);
    if (!k) {
      i++;
      continue;
    }
    // "se você centraliza tudo em você, você vai ficar esgotado" (corte de
    // Moisés, 29/09): a primeira cópia fecha a oração ("em você,") e a segunda
    // abre a seguinte. Tirar a primeira dava "tudo em você vai ficar
    // esgotado", outra frase. Cópia com vírgula logo depois de preposição é
    // objeto, não gagueira.
    if (i > 0 && separada(palavras[i].word) && PREPOSICOES.has(chaveDaPalavra(palavras[i - 1].word))) {
      i++;
      continue;
    }
    let fim = i;
    let j = i + 1;
    while (j < palavras.length) {
      const kj = chaveDeRepeticao(palavras[j].word);
      const somNoMeio =
        SONS_DE_HESITACAO.has(kj) &&
        j + 1 < palavras.length &&
        chaveDeRepeticao(palavras[j + 1].word) === k;
      if (kj !== k && !somNoMeio) break;
      // "E é ali que..." e "E é muito legal": conjunção seguida de verbo. A
      // chave tira o acento e via as duas como a mesma palavra; o vídeo saía
      // sem o "E". Para esta família, o acento decide.
      if (k === "e" && kj === k && comAcento(palavras[j].word) !== comAcento(palavras[fim].word)) break;
      // "sim. Sim, mas veja": a primeira fecha a frase, a segunda abre outra.
      // O tempo sozinho não separava esse caso da gagueira.
      if (fechaFrase(palavras[fim].word)) break;
      if (palavras[j].start - palavras[fim].end >= 1.0) break;
      if (kj === k) fim = j;
      j++;
    }
    if (fim > i) {
      const ultima = palavras[fim];
      const normal = tipica(chaveDaPalavra(ultima.word));
      const arrastada = ultima.end - ultima.start >= normal * 1.8 + 0.08;
      remocoes.push({
        de: palavras[i].start,
        ate: arrastada ? ultima.end - normal : ultima.start,
        motivo: `palavra repetida: "${ultima.word}"${arrastada ? " (rabo gaguejado)" : ""}`,
      });
    }
    i = fim + 1;
  }
  return remocoes.sort((a, b) => a.de - b.de);
}

/**
 * O falso começo: a pessoa solta uma ou duas palavras, para, respira, e só
 * então diz a frase. Detectado por código porque nenhuma camada pegava.
 *
 * O caso é o do poema que o Bruno ouviu em 02/09, aos 311s da gravação:
 * "...do mesmo jeito? [2,3s] Eu, [0,4s] o, [0,6s] por que existem uns felizes".
 * O vídeo entregue saiu com "[respira] Eu, ou, [respira] Por que existem", e
 * a queixa dele foi que "travo, erro, gaguejo e a edição não limpou". Cada
 * camada tinha um motivo para deixar passar: a pausa de 2,3s foi cortada, mas
 * as de 0,4s e 0,6s ficam abaixo do limiar de pausa; "eu" e "o" não são som de
 * hesitação; a repetição exige a mesma palavra; e o agente não marcou.
 *
 * A assinatura, medida na gravação inteira (2.388 palavras): palavra curta,
 * ISOLADA por silêncio dos dois lados, e arrastada. Só duas palavras da
 * gravação inteira batiam nisso, e eram exatamente "Eu," e "o,". Uma palavra
 * de conteúdo não fica sozinha entre dois silêncios; quem fica é o começo de
 * frase que não foi adiante.
 *
 * A lista é restrita a palavras que a frase seguinte não precisa: pronome,
 * artigo, conjunção de abertura. Preposição fica de fora de propósito: "acho
 * que [pausa] a gente" é pausa para pensar, e sem o "que" a frase quebra.
 *
 * A remoção trata "silêncio + palavras soltas + silêncio" como UMA pausa, com o
 * mesmo respiro que a pausa longa recebe, para a frase que continua não colar
 * na anterior.
 */
const ABERTURAS_SOLTAS = new Set([
  "eu", "o", "a", "os", "as", "e", "um", "uma", "ou", "mas",
  "ai", "entao", "ne", "bom", "olha", "tipo", "assim",
]);

export function detectarFalsosComecos(palavras: Word[]): Remocao[] {
  const remocoes: Remocao[] = [];
  const tipica = duracaoTipica(palavras);
  const silencio = 0.3;

  const solta = (i: number): boolean => {
    if (i < 1 || i >= palavras.length - 1) return false;
    const p = palavras[i];
    const k = chaveDaPalavra(p.word);
    if (!ABERTURAS_SOLTAS.has(k) && !SONS_DE_HESITACAO.has(k)) return false;
    if (fechaFrase(p.word)) return false;
    const antes = p.start - palavras[i - 1].end;
    const depois = palavras[i + 1].start - p.end;
    if (antes < silencio || depois < silencio) return false;
    const duracao = p.end - p.start;
    return duracao >= Math.max(0.4, tipica(k) * 1.8) || SONS_DE_HESITACAO.has(k);
  };

  let i = 1;
  while (i < palavras.length - 1) {
    if (!solta(i)) {
      i++;
      continue;
    }
    let fim = i;
    while (fim + 1 < palavras.length - 1 && solta(fim + 1)) fim++;
    const anterior = palavras[i - 1];
    const seguinte = palavras[fim + 1];
    const buraco = seguinte.start - anterior.end;
    const fica = respiroDaPausa(buraco);
    remocoes.push({
      de: anterior.end + fica / 2,
      ate: seguinte.start - fica / 2,
      motivo: `falso começo: "${palavras.slice(i, fim + 1).map((p) => p.word).join(" ")}"`,
    });
    i = fim + 1;
  }
  return remocoes;
}

/**
 * As muletas ARRASTADAS, detectadas por código.
 *
 * O Bruno pegou um "é eeeee" logo no início do vídeo completo de 24/08, DEPOIS
 * de o agente de limpeza ter rodado (137,5s removidos naquela rodada). Fomos ao
 * dado: a palavra era "é," aos 5,6s, com 0,48s de duração, solta entre duas
 * frases. O agente marca muitas e deixa outras, e não há prompt que garanta.
 *
 * O que É garantível por código: um som de hesitação ("é", "eh", "ah", "hum")
 * que dura muito mais do que a palavra falada normalmente dura. Medido na
 * própria gravação: o "é" verbo de "essa é uma decisão" dura 0,10s; o "é"
 * muleta arrastado dura 0,48s. A folga entre os dois é enorme.
 *
 * O limiar de 0,38s fica no meio dessa folga, e a lista é curta de propósito:
 * só sons que nunca são conteúdo quando arrastados.
 */
/*
 * O "e" SAIU desta lista em 02/09, e a medição é o motivo.
 *
 * A comparação por palavra tira o acento, então uma única entrada "e" pegava
 * três coisas diferentes: o "é" VERBO, o "e" CONJUNÇÃO e o "é" muleta. Medido
 * na gravação real do Bruno: das 52 remoções determinísticas de muleta, **24
 * eram da família "e/é"**, e as que eu li uma a uma eram quase todas conteúdo:
 *
 *   "O ponto é, não [é] a mudança em si"
 *   "pra ele não [é] necessário tentar dar sentido"
 *   "[É] preciso imaginar Sísifo feliz"
 *   "a grandeza de Cícero [é] durante a descida"
 *   "Se lembrar do que [é] o seu propósito"
 *   "[E] a grandeza de..."   "[e] não falhará"   "[E] eu aponto..."
 *
 * O corte entregue saiu com "se lembrar do que o seu propósito", que é frase
 * quebrada, e o Bruno ouviu.
 *
 * A premissa de 24/08 era que "é" arrastado nunca é conteúdo, medida numa
 * gravação onde o verbo durava 0,10s e a muleta 0,48s. Nesta gravação ele fala
 * mais devagar e o VERBO dura 0,64s. A folga sumiu, e com ela a regra.
 *
 * Tentei salvar por acústica (silêncio dos dois lados) e o dado não deixa: há
 * muleta colada na fala seguinte e verbo com pausa antes. Separar "é" verbo de
 * "é" muleta é LEITURA, não aritmética, e a regra da casa manda leitura para o
 * agente, que tem contexto e ainda passa pela verificação de plausibilidade.
 *
 * Ficam aqui só os sons que não são palavra nenhuma em português.
 */
const SONS_DE_HESITACAO = new Set([
  "eh", "ah", "ahn", "hum", "uhm", "mmm",
  // Grafias que a transcrição usa para o mesmo som, nenhuma é palavra.
  "hmm", "hm", "humm", "mm", "ee", "eee", "eeee",
]);

/**
 * Sons que saem SEMPRE, sem exigir duração: murmúrio nasal e "ééé" escrito
 * como tal. O "ah" e o "eh" continuam exigindo arrasto porque, curtos, às vezes
 * são interjeição com sentido ("ah, entendi").
 */
const SONS_SEMPRE = new Set(["hum", "hmm", "hm", "humm", "uhm", "mmm", "mm", "ee", "eee", "eeee"]);

/**
 * A remoção de palavras [i..j] com as bordas no SILÊNCIO vizinho, e não no
 * `start`/`end` delas. Ver `margemNoSilencio`: o tempo da palavra é impreciso,
 * e cortar rente devolvia ao vídeo o ataque do "n" e o fim do "é" do "né" que
 * o Bruno ouviu no teste de 29/09.
 */
function remocaoNoSilencio(palavras: Word[], i: number, j: number, motivo: string): Remocao {
  const ant = palavras[i - 1];
  const seg = palavras[j + 1];
  const de = ant ? ant.end + margemNoSilencio(palavras[i].start - ant.end) : palavras[i].start;
  const ate = seg ? seg.start - margemNoSilencio(seg.start - palavras[j].end) : palavras[j].end;
  return { de: Math.min(de, palavras[i].start), ate: Math.max(ate, palavras[j].end), motivo };
}

export function detectarMuletasArrastadas(palavras: Word[]): Remocao[] {
  const remocoes: Remocao[] = [];
  palavras.forEach((p, i) => {
    const chave = chaveDaPalavra(p.word);
    if (!SONS_DE_HESITACAO.has(chave)) return;
    const duracao = p.end - p.start;
    if (SONS_SEMPRE.has(chave) || duracao >= 0.38) {
      remocoes.push(
        remocaoNoSilencio(palavras, i, i, `hesitação arrastada: "${p.word}" (${duracao.toFixed(2)}s)`)
      );
    }
  });
  // As muletas curtas entram por aqui para o pedido de corte pegá-las sem
  // mudar a chamada: as duas são "vício de fala garantível por código".
  return [...remocoes, ...detectarMuletasCurtas(palavras)].sort((a, b) => a.de - b.de);
}

/**
 * As muletas CURTAS no meio da fala: "né", "tá?", "hein", "tipo".
 *
 * ## Por que existe, com o "né" já saindo desde 31/08
 *
 * O "né" saía, mas saía mal: a remoção ia do `start` ao `end` exatos e a folga
 * do fade devolvia uns 20ms de cada ponta, que é exatamente o "n" e o "é". O
 * teste de 29/09 (vídeo de 22 min) tem 27 "né", e o corte entregue ainda tinha
 * um audível. Agora o "né" sai com as bordas no silêncio vizinho, e a lista
 * ganhou as outras muletas curtas que só o agente pegava, quando pegava.
 *
 * ## Quando cada uma é muleta, e não conteúdo
 *
 * - "né" e "hein": sempre. São marcador de discurso; tirar nunca muda o que a
 *   frase diz, nem no fim ("é caro, né?" vira "é caro").
 * - "tá": só como pergunta de confirmação no fim, e ISOLADA antes (vírgula ou
 *   respiro): "eu não pago, tá?" e "é pago tá pessoal?". Sem isolamento é
 *   verbo: "como é que tá?", "ele tá cansado". E "tá bom", "tá certo" ficam.
 * - "tipo": só isolado (vírgula ou respiro de um lado) e fora das construções
 *   em que é substantivo: nada de "esse tipo", "que tipo", "um tipo", nem
 *   "tipo de". "Tipo assim" sai junto.
 *
 * "Então" e "assim" ficam com o agente: metade das vezes ligam ideias ("não
 * captamos, então voltei", "e assim nasceu"), e isso é leitura, não aritmética.
 */
const TA_EXPRESSOES = new Set([
  "bom", "certo", "ok", "okay", "legal", "beleza", "vendo", "ligado", "bem", "combinado",
]);
const VOCATIVOS = new Set(["pessoal", "gente", "galera"]);
const INTERROGATIVOS = new Set(["como", "que", "onde", "quanto", "quem", "qual"]);
const TIPO_SUBSTANTIVO_ANTES = new Set([
  "o", "um", "uns", "esse", "este", "aquele", "nesse", "neste", "desse", "deste", "daquele",
  "que", "qual", "quais", "todo", "outro", "mesmo", "cada", "qualquer", "algum", "nenhum",
  "seu", "meu", "nosso", "teu", "novo", "de", "do", "no", "pelo", "ao", "certo", "ultimo",
]);
const TIPO_SUBSTANTIVO_DEPOIS = new Set(["de", "do", "da", "dos", "das"]);

/** Termina com sinal que separa: vírgula, ponto, interrogação. */
function separada(palavra: string): boolean {
  return /[,;:.!?…]["'”’)\]]?\s*$/.test(palavra);
}

export function detectarMuletasCurtas(palavras: Word[]): Remocao[] {
  const RESPIRO = 0.15;
  const isoladaAntes = (i: number): boolean => {
    const ant = palavras[i - 1];
    return !ant || separada(ant.word) || palavras[i].start - ant.end >= RESPIRO;
  };
  const isoladaDepois = (i: number): boolean => {
    const seg = palavras[i + 1];
    return !seg || separada(palavras[i].word) || seg.start - palavras[i].end >= RESPIRO;
  };

  /** Quantas palavras a partir de i formam a muleta (0 se não é muleta). */
  const muleta = (i: number): number => {
    const p = palavras[i];
    const k = chaveDaPalavra(p.word);
    const seg = palavras[i + 1];
    const kSeg = seg ? chaveDaPalavra(seg.word) : "";

    if (k === "ne" || k === "hein" || k === "ein") return 1;

    if (k === "ta") {
      // "tá pessoal?": a confirmação com vocativo, as duas saem juntas. Não
      // exige isolamento porque o vocativo com interrogação já é a prova (no
      // teste de 29/09 veio colado: "o cursor ele é pago tá pessoal?"); só não
      // vale depois de pergunta de verdade ("como tá, pessoal?").
      const kAnt = i > 0 ? chaveDaPalavra(palavras[i - 1].word) : "";
      if (!separada(p.word) && VOCATIVOS.has(kSeg) && /\?/.test(seg.word) && !INTERROGATIVOS.has(kAnt)) {
        return 2;
      }
      if (!isoladaAntes(i)) return 0;
      if (/\?/.test(p.word)) return 1;
      if (/,/.test(p.word) && !TA_EXPRESSOES.has(kSeg)) return 1;
      return 0;
    }

    if (k === "tipo") {
      if (fechaFrase(p.word)) return 0;
      const kAnt = i > 0 ? chaveDaPalavra(palavras[i - 1].word) : "";
      if (TIPO_SUBSTANTIVO_ANTES.has(kAnt) && !separada(palavras[i - 1].word)) return 0;
      if (TIPO_SUBSTANTIVO_DEPOIS.has(kSeg) && !separada(p.word)) return 0;
      if (!isoladaAntes(i) && !isoladaDepois(i)) return 0;
      if (kSeg === "assim" && !fechaFrase(seg.word)) return 2;
      return 1;
    }
    return 0;
  };

  const remocoes: Remocao[] = [];
  let i = 0;
  while (i < palavras.length) {
    const n = muleta(i);
    if (!n) {
      i++;
      continue;
    }
    // Muletas em sequência ("né, tipo,") saem numa remoção só, para a emenda
    // cair uma vez no silêncio e não duas vezes entre elas.
    let fim = i + n - 1;
    while (fim + 1 < palavras.length) {
      const m = muleta(fim + 1);
      if (!m) break;
      fim += m;
    }
    remocoes.push(
      remocaoNoSilencio(
        palavras,
        i,
        fim,
        `muleta: "${palavras.slice(i, fim + 1).map((p) => p.word).join(" ")}"`
      )
    );
    i = fim + 1;
  }
  return remocoes;
}

const SISTEMA = `Você limpa a fala de uma gravação, marcando o que sai.

Recebe as palavras numeradas, com o tempo de cada uma. Devolva os intervalos que devem ser REMOVIDOS para o vídeo ficar melhor de assistir, sem mudar o que a pessoa disse.

O que SAI:

1. Hesitação: "é", "eh", "hum", "ahn", "ééé", arrastados ou soltos no meio da frase. Só quando NÃO forem parte do sentido.
2. Recomeço de frase: a pessoa começa, se interrompe e recomeça. Sai a primeira tentativa, fica a segunda. Exemplo: "eu saí do, bom, então, eu quero falar como eu saí do CLT" vira "eu quero falar como eu saí do CLT".
   O recomeço também acontece com um aparte no meio, e aí sai a primeira tentativa MAIS o aparte. Caso real: "Deus pede pra ele escrever. Eu vou até fazer aqui com você. Deus pede pra Habacuque escrever." vira "Deus pede pra Habacuque escrever." Repare que a primeira tentativa termina em ponto final: isso é normal no recomeço e não impede o corte.
   Vale também para o começo que não foi adiante, uma ou duas palavras soltas antes de a frase sair: "do mesmo jeito? Eu, o, por que existem uns felizes" vira "do mesmo jeito? Por que existem uns felizes".
3. Repetição imediata da mesma palavra ou expressão: "o, o ponto é", "eu eu acho". Fica uma.
4. Abertura vazia de gravador: "bom, vamos lá gente", "então, vamos lá", quando não diz nada e só existe para a pessoa se ajeitar.
5. Muleta que não liga nada: "né" no fim de frase, "tipo" no meio, "aí" como enfeite.

O que FICA, e isto é mais importante que o que sai:

- "É" como VERBO. "Isso é caro" nunca vira "isso caro".
- "Então" como CONSEQUÊNCIA. "Não captamos, então voltei" precisa do então.
- "Aí" como TEMPO. "Aí eu voltei" está contando uma sequência.
- Qualquer palavra cuja remoção mude o sentido, quebre a gramática ou deixe a frase incompleta.
- Pausa para respirar entre ideias. Vídeo sem respiro cansa mais que vídeo com muleta.

Regras de decisão:

- **O corte só pode conter hesitação.** Se a hesitação está colada a uma palavra que a frase precisa, corte SÓ a hesitação. Exemplo: em "de tema sobre, é, a minha trajetória", o corte é apenas "é". Cortar "sobre, é" deixaria "de tema a minha trajetória", que está quebrado. Antes de devolver cada corte, leia a frase sem ele e confirme que ela continua de pé.
- Na dúvida, NÃO corte. Uma muleta que ficou é um detalhe; uma frase quebrada é um defeito que a pessoa ouve na hora.
- Não corte mais que 15% das palavras. Se você está cortando mais que isso, está cortando conteúdo.
- Cada intervalo precisa ser CURTO: no máximo 8 palavras e cerca de 1 segundo de fala. Intervalo longo é conteúdo disfarçado de hesitação.
- Só é recomeço quando a pessoa DIZ DE NOVO o que cortou. Palavra de conteúdo que não reaparece logo em seguida é a ideia da frase e fica. Caso real que saiu errado: em "a forma mais inteligente que tem é você, é delegar, né, então tanto pro seu time", cortar "você, é delegar, né" apagou o "delegar", que era a conclusão, e o vídeo ficou "a forma mais inteligente que tem é, então tanto pro seu time". Ali o corte certo era só o "né".
- Não corte a última palavra de uma frase nem a primeira da seguinte, para não colar duas frases sem respiro.

Escreva o "motivo" em português do Brasil, em duas ou três palavras ("hesitação", "recomeço de frase", "muleta"). Nunca use travessão.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string.

Cada corte é uma lista de três posições: [primeira palavra, última palavra, motivo]. Formato compacto de propósito, para caber a resposta inteira:

{"c":[[12,14,"hesitação"],[40,45,"recomeço de frase"]]}`;

/** Teto de segurança: acima disto, alguma coisa saiu muito errada. */
const FRACAO_MAXIMA = 0.15;
// 12 e não 8: o teto vale DEPOIS da junção, e um recomeço partido em dois
// pedaços de 6 palavras é legítimo.
const PALAVRAS_MAXIMAS_POR_CORTE = 12;

/**
 * O vocabulário que pode sair sozinho.
 *
 * Curto de propósito: qualquer palavra fora desta lista só sai como parte de um
 * recomeço de frase comprovado, nunca por conta própria.
 */
const MULETAS = new Set([
  "é", "e", "eh", "ééé", "éé", "ah", "ahn", "hum", "hmm", "ó",
  "né", "ne", "tipo", "então", "entao", "aí", "ai", "assim", "bom",
  "cara", "sabe", "olha", "certo", "tá", "ta", "que", "o", "a",
  "vamos", "lá", "la", "gente", "pois", "enfim", "beleza",
]);

function normalizar(p: string): string {
  return p.toLowerCase().replace(/[.,!?;:"'()…]/g, "").trim();
}

/**
 * Este corte é seguro de aplicar?
 *
 * A verificação existe porque o modelo erra do jeito mais caro possível: no
 * teste de 23/08 ele devolveu "sobre, é" como hesitação, e cortar isso deixaria
 * "de tema a minha trajetória", quebrado. Com esforço baixo o erro se repetiu em
 * uma de duas rodadas, então não dá para confiar no cuidado dele.
 *
 * Duas formas de um corte ser legítimo:
 *
 * 1. Só tem muleta. Nenhuma palavra de conteúdo some.
 * 2. É repetição ou recomeço de frase, e a assinatura disso é objetiva: alguma
 *    palavra de conteúdo do corte APARECE DE NOVO logo antes ou logo depois
 *    dele. "eu saí do, bom, então, eu quero falar como eu saí do CLT" tem "eu"
 *    e "saí" reaparecendo depois; "eu, eu, eu sempre tive" tem "eu" antes,
 *    quando o que se corta é a última das repetições. Já "sobre, é" não tem
 *    "sobre" de nenhum dos lados, então não é recomeço, é engano.
 *
 * Olhar para os DOIS lados importa: sem isso, cortar a última repetição de uma
 * sequência era recusado, e é justamente o que o modelo faz na maior parte das
 * vezes.
 *
 * Qualquer outra coisa é descartada. Perder um corte bom custa uma muleta que
 * ficou; aceitar um corte ruim custa uma frase quebrada no vídeo do cliente.
 */
export function cortePlausivel(
  corte: Limpeza,
  palavras: Array<{ word: string }>,
  janela = 8
): boolean {
  const doCorte = palavras.slice(corte.de, corte.ate + 1).map((p) => normalizar(p.word));
  const conteudo = doCorte.filter((p) => p.length > 1 && !MULETAS.has(p));

  if (conteudo.length === 0) return true;

  const vizinhas = [
    ...palavras.slice(Math.max(0, corte.de - janela), corte.de),
    ...palavras.slice(corte.ate + 1, corte.ate + 1 + janela),
  ].map((p) => normalizar(p.word));

  // TODAS as palavras de conteúdo precisam reaparecer, e não só uma. Até
  // 29/09 bastava uma, e isso deixou passar o corte que o Bruno ouviu no
  // Moisés: o agente marcou "você, é delegar, né" como recomeço, "você"
  // reaparecia adiante (palavra comum reaparece sempre) e "delegar", que era
  // A IDEIA da frase, sumiu. O vídeo saiu com "a forma mais inteligente que
  // tem é / então tanto pro seu time". Repetição de verdade repete tudo o que
  // sai; o recomeço longo com aparte tem a própria prova (`ehReleitura`).
  return conteudo.every((p) => vizinhas.includes(p)) || ehReleitura(corte, palavras);
}

/**
 * Este corte é uma RELEITURA, ou seja, a pessoa disse, se interrompeu e disse
 * de novo?
 *
 * A assinatura é objetiva e não depende de julgamento: as palavras de conteúdo
 * do trecho cortado REAPARECEM logo depois dele, na mesma ordem. Duas ou mais,
 * porque uma só é coincidência num assunto que se repete.
 *
 * Serve para uma coisa só: liberar a guarda de fim de frase, que de outro modo
 * reprovaria todo recomeço (a transcrição fecha a tentativa abortada com
 * ponto). Não afrouxa a verificação de plausibilidade, que continua valendo
 * depois desta.
 */
function ehReleitura(corte: Limpeza, palavras: Array<{ word: string }>): boolean {
  const doCorte = palavras
    .slice(corte.de, corte.ate + 1)
    .map((p) => normalizar(p.word))
    .filter((p) => p.length > 2 && !MULETAS.has(p));
  if (doCorte.length < 2) return false;

  const depois = palavras
    .slice(corte.ate + 1, corte.ate + 15)
    .map((p) => normalizar(p.word));

  // As DUAS PRIMEIRAS palavras de conteúdo do corte, e elas precisam reaparecer
  // QUASE COLADAS logo depois. Releitura repete uma frase; palavra solta se
  // repetindo é assunto voltando, que é outra coisa.
  //
  // Provado com contraprova em 02/09: a versão frouxa (duas palavras quaisquer
  // reaparecendo em qualquer posição) aceitava "ela fala do fim e não falhará"
  // como releitura, porque "ela" e "não" reaparecem adiante. Aceita agora só o
  // caso real: "Deus pede pra ele escrever [...] Deus pede pra Habacuque
  // escrever".
  const primeira = depois.indexOf(doCorte[0]);
  if (primeira < 0) return false;
  const segunda = depois.indexOf(doCorte[1], primeira + 1);
  return segunda > 0 && segunda - primeira <= 3;
}

/**
 * Quantas palavras cabem numa chamada.
 *
 * A gravação do Bruno tem 4.529 palavras. Mandar tudo numa chamada faria o
 * modelo perder precisão no meio, e uma gravação de duas horas nem caberia.
 *
 * 800 e não 1200: no teste de 23/08, um bloco de 1200 palavras estourou o teto
 * de 8.000 tokens de SAÍDA e o JSON voltou cortado ao meio. O teto inclui o
 * pensamento, e a resposta é uma lista longa, então bloco menor é o que garante
 * a resposta inteira.
 */
const PALAVRAS_POR_BLOCO = 800;

export async function detectarHesitacao(
  palavras: Word[],
  usageCtx?: { projectId?: string }
): Promise<Limpeza[]> {
  if (palavras.length < 50) return [];

  // A MULETA PELO JEV (03/10, "tudo que é decisão vai para o JEV"): cada "é",
  // "então", "aí", "assim" vira uma pergunta de sim ou não ao JEV, em lote.
  // O recomeço de frase saiu deste caminho e tem o dele (`decidirRetomadas`).
  // JEV fora do ar ou LIMPEZA_PELO_JEV=0: segue o Claude de antes.
  const peloJev = await muletasPeloJev(palavras, { projectId: usageCtx?.projectId });
  if (peloJev) return sanearLimpeza(peloJev, palavras);

  const blocos: Array<{ inicio: number; palavras: Word[] }> = [];
  for (let i = 0; i < palavras.length; i += PALAVRAS_POR_BLOCO) {
    blocos.push({ inicio: i, palavras: palavras.slice(i, i + PALAVRAS_POR_BLOCO) });
  }

  const porBloco = await Promise.all(
    blocos.map(async ({ inicio, palavras: bloco }) => {
      const numeradas = bloco
        .map((p, i) => `${inicio + i}:${p.word}`)
        .join(" ");

      try {
        const resposta = await askClaude(
          SISTEMA,
          `Palavras ${inicio} a ${inicio + bloco.length - 1}:\n\n${numeradas}`,
          // 16000, e não 8000: o teto inclui o pensamento, e com 8000 o JSON
          // voltava truncado no meio de um corte (teste de 23/08). Teto alto
          // não encarece: o cobrado é o que o modelo gera.
          {
            maxTokens: 16000,
            // Esforço baixo, com verificação em código do que voltou. Medido:
            // o alto gastava 10.213 tokens de saída contra 2.500 do baixo, e
            // entregava o mesmo, porque achar muleta é leitura e não raciocínio.
            // O que o baixo erra, `cortePlausivel` recusa.
            effort: "low",
            usage: { operation: "video_limpeza", ...usageCtx },
          }
        );
        const limpo = resposta
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "");
        const dados = JSON.parse(limpo) as { c?: Array<[number, number, string]> };
        return (dados.c ?? []).map(([de, ate, motivo]) => ({ de, ate, motivo }));
      } catch {
        // Um bloco que falha não derruba a limpeza inteira: o resto do vídeo
        // continua limpo, e a parte dele sai como estava.
        return [];
      }
    })
  );

  return sanearLimpeza(porBloco.flat(), palavras);
}

/**
 * Descarta o que o agente devolveu errado.
 *
 * Vale mais que o prompt: o modelo é instruído a não exagerar, mas quem garante
 * é isto. Um corte inválido não vira frase quebrada no vídeo do cliente, vira
 * corte descartado.
 */
export function sanearLimpeza(
  cortes: Limpeza[],
  palavras: Array<{ word: string; start?: number; end?: number }>
): Limpeza[] {
  const totalDePalavras = palavras.length;
  const validos = cortes
    .filter(
      (c) =>
        Number.isInteger(c.de) &&
        Number.isInteger(c.ate) &&
        c.de >= 0 &&
        c.ate >= c.de &&
        c.ate < totalDePalavras
    )
    .sort((a, b) => a.de - b.de);

  // Junta ANTES de validar, e com folga de duas palavras.
  //
  // A ordem importa e custou um teste para descobrir. Um recomeço de frase
  // costuma vir partido em dois cortes vizinhos ("Bom, então o, o ponto é, eu
  // saí" mais "do, bom, então,"), e cada metade sozinha parece inválida: aplicar
  // só uma delas deixaria "eu saí eu quero falar", que é pior que o original.
  // Juntas, elas formam um recomeço legítimo e passam.
  const unidos: Limpeza[] = [];
  for (const c of validos) {
    const anterior = unidos[unidos.length - 1];
    if (anterior && c.de <= anterior.ate + 3) {
      anterior.ate = Math.max(anterior.ate, c.ate);
    } else {
      unidos.push({ ...c });
    }
  }

  const plausiveis = unidos
    .filter((c) => c.ate - c.de + 1 <= PALAVRAS_MAXIMAS_POR_CORTE)
    // Teto de FALA por corte (29/09, ordem do Bruno depois do salto no corte
    // de Moisés): hesitação, muleta e repetição cabem em 1,2 s de voz; o que
    // passa disso é conteúdo, e tirar conteúdo do meio cola duas ideias. O
    // teto é de fala e não de tempo: silêncio no meio não conta.
    .filter((c) => falaDasPalavras(palavras, c.de, c.ate) <= FALA_MAXIMA_POR_REMOCAO_SEC)
    // Corte que engole um fim de frase costuma estar colando dois assuntos, e
    // não limpando muleta. O prompt já pede isso ("não corte a última palavra
    // de uma frase nem a primeira da seguinte"), e pedir nunca garantiu nada.
    //
    // COM UMA EXCEÇÃO, medida em 02/09: o RECOMEÇO de fala quase sempre
    // atravessa um ponto final, porque a transcrição fecha a tentativa
    // abortada com ponto. O caso real que o Bruno ouviu:
    //
    //   "Deus pede pra ele escrever. Eu vou até fazer aqui com você.
    //    Deus pede pra Habacuque escrever."
    //
    // A guarda de 01/09, sem exceção, bloqueava exatamente o corte que o
    // agente existe para fazer. Agora o fim de frase só reprova quando NÃO há
    // prova de releitura logo depois.
    .filter((c) => ehReleitura(c, palavras) || !palavras.slice(c.de, c.ate).some((p) => fechaFrase(p.word)))
    .filter((c) => cortePlausivel(c, palavras));

  // Teto duro. Se o agente marcou meio vídeo, alguma coisa saiu muito errada, e
  // entregar a gravação sem limpeza é melhor que entregar picotada.
  const removidas = plausiveis.reduce((s, c) => s + (c.ate - c.de + 1), 0);
  if (removidas > totalDePalavras * FRACAO_MAXIMA) return [];

  return plausiveis;
}

/**
 * Converte cortes de palavra em cortes de tempo, prontos para o ffmpeg.
 *
 * O corte vai do FIM da palavra anterior ao COMEÇO da palavra seguinte, e não
 * do início ao fim das palavras removidas. A diferença é audível: cortar
 * exatamente na fronteira da palavra leva junto o ataque da consoante seguinte,
 * e a fala fica com um estalo.
 */
export function limpezaParaRemocoes(
  cortes: Limpeza[],
  palavras: Word[]
): Remocao[] {
  return cortes
    .map((c) => {
      const anterior = palavras[c.de - 1];
      const seguinte = palavras[c.ate + 1];
      const de = anterior ? anterior.end : palavras[c.de].start;
      const ate = seguinte ? seguinte.start : palavras[c.ate].end;
      return { de, ate, motivo: c.motivo || "hesitação" };
    })
    .filter((r) => r.ate - r.de > 0.08);
}

/** Soma da duração das palavras [de..ate]; sem tempo (teste), conta zero. */
function falaDasPalavras(
  palavras: Array<{ start?: number; end?: number }>,
  de: number,
  ate: number
): number {
  let s = 0;
  for (let i = de; i <= ate && i < palavras.length; i++) {
    const w = palavras[i];
    if (typeof w.start === "number" && typeof w.end === "number") s += Math.max(0, w.end - w.start);
  }
  return s;
}

/**
 * A última trava, sobre a lista JÁ UNIDA de remoções que vai ao worker.
 *
 * Cada detector sozinho respeita o teto de fala, mas a união pode juntar
 * vizinhos (uma repetição colada numa muleta colada num recomeço) e o
 * resultado tirar vários segundos de voz de uma vez. Remoção que passa de
 * `FALA_MAXIMA_POR_REMOCAO_SEC` de FALA é trocada pelas pausas que ela
 * continha: o silêncio continua saindo, a fala fica inteira. Perder uma
 * muleta é detalhe; juntar duas ideias no meio da frase é o defeito que o
 * Bruno ouviu no corte de Moisés em 29/09.
 */
/**
 * A FRASE REGRAVADA (30/09): o veto de 1,2 s protegia a conclusão ("é
 * delegar") de ser apagada, mas deixou no vídeo o erro que o Bruno repete logo
 * em seguida ("eu erro, repito a frase e o erro está no vídeo"). Remoção longa
 * passa quando quase tudo o que ela tira (70% das palavras de conteúdo) é dito
 * de novo nos 12 s seguintes: é a tomada ruim, e a boa vem logo depois.
 */
function ehRegravacao(palavras: Word[], r: Remocao): boolean {
  const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const conteudo = (ws: Word[]) => ws.map((w) => norm(w.word)).filter((w) => w.length > 3);
  const tiradas = conteudo(palavras.filter((w) => w.start >= r.de - 0.02 && w.end <= r.ate + 0.02));
  if (tiradas.length < 3) return false;
  const depois = new Set(conteudo(palavras.filter((w) => w.start >= r.ate && w.start <= r.ate + 12)));
  const repetidas = tiradas.filter((w) => depois.has(w)).length;
  return repetidas / tiradas.length >= 0.7;
}

export function vetarRemocoesLongasDeFala(
  remocoes: Remocao[],
  palavras: Word[],
  pausas: Remocao[]
): Remocao[] {
  const saida: Remocao[] = [];
  for (const r of remocoes) {
    if (falaCoberta(palavras, r.de, r.ate) <= FALA_MAXIMA_POR_REMOCAO_SEC || ehRegravacao(palavras, r)) {
      saida.push(r);
      continue;
    }
    console.warn(
      `[limpeza] remoção de ${(r.ate - r.de).toFixed(2)}s em ${r.de.toFixed(2)}s vetada ` +
        `(tiraria ${falaCoberta(palavras, r.de, r.ate).toFixed(2)}s de fala): ${r.motivo}`
    );
    for (const p of pausas) {
      if (p.ate > r.de && p.de < r.ate) saida.push({ ...p, de: Math.max(p.de, r.de), ate: Math.min(p.ate, r.ate) });
    }
  }
  return saida.sort((a, b) => a.de - b.de);
}

/** Junta as remoções de pausa com as de fala, sem sobrepor. */
export function unirRemocoes(a: Remocao[], b: Remocao[]): Remocao[] {
  const todas = [...a, ...b].sort((x, y) => x.de - y.de);
  const unidas: Remocao[] = [];
  for (const r of todas) {
    const anterior = unidas[unidas.length - 1];
    if (anterior && r.de <= anterior.ate) {
      anterior.ate = Math.max(anterior.ate, r.ate);
      if (!anterior.motivo.includes(r.motivo)) {
        anterior.motivo = `${anterior.motivo} e ${r.motivo}`;
      }
    } else {
      unidas.push({ ...r });
    }
  }
  return unidas;
}
