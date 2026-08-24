import { askClaude } from "@/lib/claude";
import { clipesEstimados } from "@/lib/media/limits";
import type { Word } from "@/lib/media/transcribe";

/**
 * Passo 3: escolher os melhores trechos da gravação.
 *
 * O desenho é ditado por uma restrição de custo, não por elegância. A saída
 * daqui precisa alimentar UMA chamada por trecho no Passo 4, devolvendo os
 * textos das três redes juntos. Uma chamada por trecho por rede levaria o
 * trabalho de R$ 1,50 para R$ 7,50 e derrubaria a margem dos créditos cobrados
 * de 85% para 25%. Por isso cada trecho já sai daqui com contexto suficiente
 * para o redator não precisar reler a transcrição inteira.
 *
 * O agente lê os parágrafos com marcação de tempo, não a transcrição corrida:
 * ele precisa dizer onde o trecho começa e termina em segundos, e parágrafo já
 * vem com esses limites da Deepgram.
 */

export type Trecho = {
  /** Segundo em que o trecho começa. */
  inicio: number;
  /** Segundo em que termina. */
  fim: number;
  /** Título curto, do jeito que o cliente reconheceria o momento. */
  titulo: string;
  /** Por que este trecho e não outro. Fica visível na tela de aprovação. */
  motivo: string;
  /** A ideia central em uma frase, que é o que o redator do Passo 4 recebe. */
  ideia: string;
  /**
   * As primeiras palavras do trecho, escolhidas pelo AGENTE.
   *
   * Existe porque os três primeiros segundos decidem se alguém fica, e julgar
   * se uma abertura prende é julgamento, não regra. Em 23/08 eu tentei fazer
   * isso em código, com lista de palavras-muleta, e o resultado foi o código
   * BURLANDO a própria métrica: aparar "Então" de "Então por exemplo" fazia
   * passar no crivo e produzia "por exemplo, ah voltei pro mercado", que não é
   * melhor em nada.
   *
   * Então o agente escolhe e o código só confere que a escolha EXISTE na
   * gravação, o que impede alinhar o corte por um texto inventado.
   */
  abertura?: string;
  /**
   * A nota de cada critério, de 0 a 10, dada pelo agente.
   *
   * Fica gravada e visível na tela: o Bruno pediu em 24/08 que a plataforma
   * fosse honesta com o cliente sobre a matéria-prima, dizendo quantos cortes
   * o vídeo REALMENTE tem e por qual critério os outros caíram.
   */
  notas?: {
    gancho: number;
    tese: number;
    prova: number;
    autonomia: number;
    emocao: number;
    fecho: number;
  };
  /**
   * A nota final: a MENOR das seis, e não a média.
   *
   * O elo mais fraco decide, porque um trecho com tese ótima e gancho fraco não
   * funciona: ninguém chega na tese. Média premiaria justamente o trecho
   * desequilibrado, que é o que sai morno.
   */
  nota?: number;
  /**
   * O que a pessoa realmente falou ali, para o redator não inventar.
   *
   * **Preenchido em código, não pelo modelo.** Ver `recortarFala`: a
   * transcrição com marcação de tempo por palavra já está no banco, então
   * pedir ao modelo que copiasse era gastar token para reescrever o que já
   * temos, e ainda por cima sem garantia de fidelidade.
   */
  transcricao: string;
};

/** O que o modelo devolve. A fala entra depois, recortada por nós. */
type TrechoBruto = Omit<Trecho, "transcricao">;

const SISTEMA = `Você é editor de vídeo curto. Escolhe quais momentos de uma gravação crua viram Reels, Shorts e TikToks, e recusa os que não viram.

Recebe a transcrição de alguém falando sem roteiro, em blocos com marcação de tempo.

## A regra que manda sobre todas: NÃO ENCHA COTA

Devolver um trecho fraco é pior que devolver menos trechos. O cliente publica o que você escolher, no nome dele, para o público dele. Um corte morno queima o alcance da conta e o crédito que ele tem com quem o segue.

Se a gravação tem dois momentos que prestam, devolva DOIS. Se tem zero, devolva zero e explique. Ser honesto sobre a matéria-prima é o serviço, não a cota.

## Como o público realmente assiste, e isso manda no que você escolhe

- A pessoa decide se fica em **UM segundo**. Não três. O feed é de rolagem.
- **85% assiste SEM SOM.** O que prende primeiro é o que se lê e o que se vê.
- Vídeo abaixo de 90 segundos retém metade do público em média. Cada segundo paga o próximo.
- O que mais viraliza não é informação boa: é **afirmação contrária**, **aviso de erro** e **chamada de identidade** ("se você é CLT, isso é pra você").

## Os seis critérios, e você pontua cada um de 0 a 10

1. **Gancho.** A PRIMEIRA frase para a rolagem sozinha? Ela afirma algo discutível, nomeia um erro, ou chama uma identidade? Frase que só apresenta assunto não é gancho.
2. **Tese.** Dá para discordar? "Consistência é sistema, não disciplina" é tese. "É importante ser consistente" não é nada.
3. **Prova.** Tem número, caso vivido, cena concreta? Ou é opinião no ar?
4. **Autonomia.** Se entende sem nada antes? Se depende do que foi dito dez minutos atrás, não serve, por melhor que seja.
5. **Emoção.** Provoca alguma coisa: surpresa, indignação, riso, reconhecimento, alívio? Trecho correto e morno não viraliza.
6. **Fecho.** Termina numa aterrissagem, ou se dissolve? Corte que acaba no ar deixa a sensação de vídeo quebrado.

**A nota final é a MENOR das seis, e não a média.** Um trecho com tese ótima e gancho fraco não funciona, porque ninguém chega na tese. O elo mais fraco decide.

**Só devolva trechos com nota final 6 ou mais.** Abaixo disso, descarte, mesmo que sobrem poucos.

## O que NUNCA serve, por melhor que soe

- Abertura, encerramento, e qualquer "então é isso, pessoal".
- Conselho genérico que caberia na boca de qualquer um do setor.
- Trecho que só existe para ligar dois assuntos.
- Trecho em que a pessoa está pensando alto, se corrigindo, ou procurando a palavra.

A ABERTURA DECIDE TUDO, e é a parte mais importante da sua tarefa.

Quem abre um Reels decide em três segundos se fica. Um trecho com tese ótima que
abre mal não funciona, e é pior que não existir, porque gastou o clique.

Escolha o trecho de forma que a PRIMEIRA FRASE já seja forte sozinha. Uma
abertura forte:
- Fala direto com quem assiste, ou afirma algo com que dá para discordar.
- Se entende sem nada antes dela.
- Não começa com palavra de ligação: então, ah, aí, mas, mesmo, bom, cara, tipo,
  enfim, por exemplo, olha, sabe, é.
- Não começa apontando para fora: assim, isso, esse, aquele, ele, ela, lá, ali.
  Quem chegou agora não viu o que "isso" quer dizer.
- Não é a pessoa se corrigindo nem gaguejando. Se ela disse "software como
  serviço, é software as a service", comece DEPOIS da correção.

Devolva no campo "abertura" as PRIMEIRAS PALAVRAS do trecho, copiadas exatamente
da transcrição, de cinco a doze palavras. Nós conferimos se elas existem ali e
alinhamos o corte por elas. Se você não achar nenhuma abertura boa dentro do
trecho, prefira outro trecho.

Regras de recorte:
- Comece e termine em fronteira de frase, nunca no meio.
- Entre 20 e 120 segundos.
- Os trechos não podem se sobrepor.
- Prefira menos trechos bons a completar a cota com trecho fraco. Se a gravação
  só tem três momentos que prestam, devolva três.
- Entre 20 e 60 segundos é onde a retenção vive. Passe de 60 só se o trecho
  realmente precisar, e nunca de 90.

Regras de escrita:
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Português do Brasil.
- No campo "ideia", escreva a tese do trecho em uma frase, na voz da pessoa.
- NÃO copie a fala. Nós recortamos a fala pelos tempos que você devolver.

Responda SOMENTE com JSON válido, sem cercas de código.

Regra que evita JSON quebrado, e ela é obrigatória: **nunca use quebra de linha
dentro de um campo de texto.** Se a fala tinha pausa, use ponto ou vírgula. JSON
com quebra de linha crua dentro de string é inválido, e aí o trabalho inteiro
falha.

Além dos trechos, devolva um "diagnostico": uma frase honesta sobre a matéria-prima, do jeito que um editor experiente diria ao cliente. Se você achou poucos trechos, diga por quê, e diga o que a próxima gravação precisaria ter. Sem consolo e sem grosseria.

{"diagnostico":"...","trechos":[{"inicio":0,"fim":0,"titulo":"...","motivo":"...","ideia":"...","abertura":"...","notas":{"gancho":0,"tese":0,"prova":0,"autonomia":0,"emocao":0,"fecho":0},"nota":0}]}`;

type Paragrafo = { text: string; start: number; end: number };

/**
 * O que já está gravado no banco sobre a fala. `palavras` é opcional porque
 * transcrição antiga pode não ter sido salva com marcação por palavra; sem ela
 * o recorte cai para fronteira de parágrafo, que é mais grosso mas funciona.
 */
export type FonteDaFala = { paragrafos: Paragrafo[]; palavras?: Word[] };

export async function selecionarTrechos(
  fonte: FonteDaFala,
  duracaoSegundos: number,
  contexto?: { nicho?: string | null; publico?: string | null; voz?: string | null },
  usageCtx?: { projectId?: string; runId?: string }
): Promise<Trecho[]> {
  const { paragrafos, palavras } = fonte;
  if (!paragrafos.length) {
    throw new Error("Transcrição sem parágrafos: nada para escolher.");
  }

  const alvo = clipesEstimados(duracaoSegundos);

  const blocos = paragrafos
    .map((p, i) => `[${i}] ${p.start.toFixed(0)}s a ${p.end.toFixed(0)}s: ${p.text}`)
    .join("\n\n");

  const perfil = [
    contexto?.nicho ? `Nicho: ${contexto.nicho}` : "",
    contexto?.publico ? `Público: ${contexto.publico}` : "",
    contexto?.voz ? `Tom de voz: ${contexto.voz}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resposta = await askClaude(
    SISTEMA,
    `${perfil ? perfil + "\n\n" : ""}Gravação de ${Math.round(duracaoSegundos / 60)} minutos.
Escolha até ${alvo} trechos, menos se não houver ${alvo} que prestem.

${blocos}`,
    // 16000 é teto, não meta, e teto não custa: o cobrado é o que o modelo
    // gera. Ele precisa ser alto porque o teto INCLUI o pensamento, e com 4000
    // o vídeo de 27 minutos gastou tudo pensando e voltou sem texto nenhum
    // (22/08). O que encolheu de verdade foi a resposta: sem o campo da fala
    // copiada, a saída real caiu de uns 4.500 tokens para menos de 1.000, que
    // é o que tira esta chamada da beirada do maxDuration da Vercel.
    // 32000, e nao 16000. Pedir a FRASE DE ABERTURA (23/08) fez o agente pensar
    // bem mais, porque escolher onde o trecho comeca deixou de ser consequencia
    // do intervalo e virou uma decisao propria. Com 16000 ele gastava o teto
    // inteiro pensando e voltava sem texto, exatamente como em 22/08.
    //
    // Teto alto nao custa por si: o cobrado e o que o modelo GERA, e o teto so
    // decide se ele consegue terminar.
    { maxTokens: 32000, usage: { operation: "video_selecao", ...usageCtx } }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  // Rede de segurança para o mesmo problema que derrubou o Passo 4: o modelo
  // às vezes emite quebra de linha crua dentro da string, o que invalida o
  // JSON. Escapar antes de parsear salva a chamada em vez de perder o trabalho
  // inteiro por um caractere.
  const dados = parseTolerante(limpo);
  const trechos = dados.trechos ?? [];
  if (dados.diagnostico) {
    console.log(`[selecao] diagnóstico do agente: ${dados.diagnostico}`);
  }
  if (!trechos.length) {
    throw new Error(
      dados.diagnostico
        ? `Nenhum trecho aproveitável nesta gravação. ${dados.diagnostico}`
        : "O agente não devolveu nenhum trecho."
    );
  }

  // A fala entra aqui, recortada do que já está no banco. O modelo devolve só
  // os tempos.
  return comNotaSuficiente(sanear(trechos, duracaoSegundos))
    .map((t) => ajustarAbertura(t, palavras))
    .map(({ alinhado, ...t }) => ({
      ...t,
      transcricao: recortarFala(t.inicio, t.fim, paragrafos, palavras, alinhado),
    }));
}

/** Abaixo disto o trecho sai morno e queima o alcance de quem publicar. */
const NOTA_MINIMA = 6;

/**
 * Descarta o que não passa da nota, e recalcula a nota em código.
 *
 * Recalcular não é desconfiança gratuita: o prompt diz que a nota final é a
 * MENOR das seis, e "pegue o menor de seis números" é aritmética, que é
 * justamente onde modelo de linguagem erra. Medido nos dois dias anteriores: o
 * agente acerta julgamento e erra conta. Então ele julga cada critério e o
 * código faz a conta.
 *
 * Quem cai vai para o log com o critério que derrubou, porque o cliente vai
 * perguntar por que o vídeo dele rendeu dois cortes e não seis, e "o agente
 * decidiu" não é resposta.
 */
function comNotaSuficiente<T extends { titulo?: string; notas?: Record<string, number>; nota?: number }>(
  trechos: T[]
): T[] {
  const criterios = ["gancho", "tese", "prova", "autonomia", "emocao", "fecho"] as const;

  const comNota: Array<{ trecho: T; nota: number; pior: string }> = trechos.map((t) => {
    if (!t.notas) return { trecho: t, nota: t.nota ?? NOTA_MINIMA, pior: "" };
    const valores = criterios.map((c) => Number(t.notas?.[c] ?? 0));
    const menor = Math.min(...valores);
    return { trecho: t, nota: menor, pior: criterios[valores.indexOf(menor)] };
  });

  const passam = comNota.filter((x) => x.nota >= NOTA_MINIMA);
  for (const x of comNota) {
    if (x.nota < NOTA_MINIMA) {
      console.log(
        `[selecao] descartado "${x.trecho.titulo ?? "sem título"}": ` +
          `nota ${x.nota}, pior critério ${x.pior || "?"}`
      );
    }
  }
  console.log(
    `[selecao] ${passam.length} de ${trechos.length} trechos passaram da nota ${NOTA_MINIMA}`
  );
  return passam.map((x) => ({ ...x.trecho, nota: x.nota }));
}

/**
 * Empurra o começo do trecho até uma frase que abra bem.
 *
 * O agente escolhe pela TESE, e faz isso bem. O que ele não faz é garantir que
 * os três primeiros segundos prestem, e é isso que decide se alguém fica. Aqui
 * o tempo de início é corrigido de verdade, e não só o texto: o worker corta o
 * vídeo por este número.
 */
function ajustarAbertura<T extends { inicio: number; fim: number; abertura?: string }>(
  t: T,
  palavras?: Word[]
): T & { alinhado?: boolean } {
  if (!palavras?.length) return t;

  const primeira = palavras.findIndex((w) => w.end > t.inicio);
  let ultima = -1;
  for (let i = palavras.length - 1; i >= 0; i--) {
    if (palavras[i].start < t.fim) {
      ultima = i;
      break;
    }
  }
  if (primeira < 0 || ultima <= primeira) return t;

  const [encaixado, fimEncaixado] = encaixarNaFrase(palavras, primeira, ultima);

  // O FIM também vem do texto, e não do número que o modelo chutou.
  //
  // `encaixarNaFrase` sempre calculou onde a frase fecha, e esse número era
  // usado só para recortar a TRANSCRIÇÃO. O vídeo continuava terminando no
  // segundo que o modelo devolveu, que quase nunca é fronteira de frase.
  // Medido em 24/08 nos sete cortes: QUATRO terminavam no meio, em "antes era o
  // meu emprego, o CLT," e "quer ver, né? E aí eu vou". O Bruno assistiu e
  // descreveu como "corta do nada no final".
  //
  // É o mesmo defeito da abertura, do outro lado: modelo de linguagem erra
  // aritmética de tempo e acerta julgamento de conteúdo. Onde houver texto e
  // número sobre a mesma coisa, o texto manda.
  const fim =
    fimEncaixado > ultima && fimEncaixado < palavras.length
      ? palavras[fimEncaixado].end
      : t.fim;

  // O agente escolheu a abertura. O código só confere que ela EXISTE ali.
  const alvo = acharAbertura(palavras, t.abertura, encaixado, ultima);
  if (alvo === null) {
    if (t.abertura?.trim()) {
      console.warn(
        `[selecao] trecho de ${t.inicio.toFixed(0)}s: a abertura prometida ` +
          `("${t.abertura.slice(0, 40)}") não existe no trecho, mantendo o corte original`
      );
    }
    const defeito = defeitoDaAbertura(palavras, encaixado);
    if (defeito) {
      console.warn(
        `[selecao] trecho de ${t.inicio.toFixed(0)}s abre mal: ${defeito}`
      );
    }
    // Mesmo sem alinhar a abertura, o fim fecha a frase: cortar no meio da
    // frase é defeito independente de onde o trecho começa.
    return fim !== t.fim ? { ...t, fim } : t;
  }

  const defeito = defeitoDaAbertura(palavras, alvo);
  if (defeito) {
    // O agente escolheu, existe, mas ainda tropeça no crivo mecânico. Vai ao ar
    // com a escolha dele, e o log diz o que ficou torto, porque a alternativa
    // era eu inventar um recorte que ele não pediu.
    console.warn(
      `[selecao] abertura escolhida pelo agente ainda tem defeito: ${defeito}`
    );
  }

  const segundos = palavras[alvo].start;
  if (alvo !== encaixado) {
    console.log(
      `[selecao] trecho alinhado pela abertura do agente: ` +
        `${t.inicio.toFixed(0)}s vira ${segundos.toFixed(0)}s`
    );
  }
  if (fim !== t.fim) {
    console.log(
      `[selecao] fim do trecho estendido de ${t.fim.toFixed(0)}s para ` +
        `${fim.toFixed(0)}s, para fechar a frase`
    );
  }
  return { ...t, inicio: segundos, fim, alinhado: true };
}

/**
 * Onde, dentro do trecho, começam as palavras que o agente prometeu como abertura.
 *
 * Devolve o índice da palavra, ou `null` quando a promessa não se cumpre. Isso
 * NÃO é desconfiança gratuita do modelo: sem conferir, uma abertura inventada
 * viraria um corte alinhado por um texto que não existe na gravação, e o
 * sintoma seria um vídeo começando num ponto aleatório.
 *
 * A comparação ignora pontuação, caixa e acento, porque a Deepgram pontua de um
 * jeito e o modelo copia de outro, e reprovar por causa de uma vírgula seria
 * jogar fora uma escolha boa.
 */
function acharAbertura(
  palavras: Word[],
  abertura: string | undefined,
  de: number,
  ate: number
): number | null {
  const alvo = (abertura ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (alvo.length < 3) return null;

  const limpa = (w: string) =>
    w
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  // Procura para os DOIS lados, e a razão inverteu depois da medição de 23/08.
  //
  // A primeira versão só andava para a frente, pelo mesmo motivo de
  // `encaixarNaFrase`: não importar fala que o agente não escolheu. Medido nos
  // sete trechos da gravação real, isso falhou em SEIS: o agente escolhia uma
  // abertura boa e devolvia um tempo de início que não batia com ela, quase
  // sempre depois da frase que ele mesmo tinha escolhido.
  //
  // As aberturas escolhidas eram boas: "Em dois mil e vinte e quatro eu estava
  // num emprego", "O problema é que eu vendi muita consultoria". O que estava
  // errado era a ARITMÉTICA DE TEMPO, que é fraqueza conhecida de modelo de
  // linguagem, e não o julgamento, que é a parte que ele faz bem.
  //
  // Então o texto vira a fonte da verdade e o tempo vira palpite. Andar para
  // trás aqui não importa fala não escolhida: importa exatamente as palavras
  // que o agente APONTOU como começo.
  const chave = alvo.slice(0, 4);
  const bateEm = (i: number) => {
    if (i < 0 || i + chave.length > palavras.length) return false;
    for (let k = 0; k < chave.length; k++) {
      if (limpa(palavras[i + k].word) !== chave[k]) return false;
    }
    return true;
  };

  // Em anéis a partir do encaixe, para ficar com a ocorrência MAIS PRÓXIMA:
  // uma frase comum pode aparecer duas vezes na gravação, e a mais perto do
  // que o agente indicou é a que ele quis dizer.
  for (let raio = 0; raio <= JANELA_DE_BUSCA_EM_PALAVRAS; raio++) {
    if (de + raio <= ate && bateEm(de + raio)) return de + raio;
    if (de - raio >= 0 && bateEm(de - raio)) return de - raio;
  }
  return null;
}

/**
 * Quanto a busca pela abertura pode se afastar do tempo que o agente devolveu.
 *
 * 220 palavras é perto de um minuto e meio de fala. Parece muito, e é de
 * propósito: o erro medido de aritmética do agente chegou a mais de um minuto,
 * e limitar a busca a poucos segundos faria a verificação reprovar escolhas
 * boas. O risco de ir longe demais é pegar outra ocorrência da mesma frase, e
 * contra isso a busca é em anéis, ficando com a mais próxima.
 */
const JANELA_DE_BUSCA_EM_PALAVRAS = 220;

/**
 * Recorta o que foi falado entre dois instantes, a partir da transcrição que já
 * está gravada.
 *
 * Existe para tirar do modelo o trabalho de copiar a fala de volta. Isso era a
 * maior parte da resposta dele (cerca de 3.700 dos ~4.500 tokens de saída num
 * vídeo de 27 minutos), e a chamada inteira vivia na beirada do teto de tempo
 * da Vercel por causa disso. Recortar em código é instantâneo, de graça, e mais
 * fiel: o modelo era só *instruído* a não editar, aqui ele não tem como.
 *
 * Prefere palavra a parágrafo porque parágrafo tem fronteira grossa e arrastaria
 * fala de fora do trecho para dentro do post.
 */
export function recortarFala(
  inicio: number,
  fim: number,
  paragrafos: Paragrafo[],
  palavras?: Word[],
  /**
   * O começo já foi alinhado pela abertura que o agente escolheu, então não
   * pode ser re-encaixado.
   *
   * Sem isto o texto e o vídeo divergem, e foi o que aconteceu em 23/08: o
   * corte começava certo, na frase que o agente apontou, e a transcrição que ia
   * para o redator começava DEPOIS, porque `encaixarNaFrase` empurrava para a
   * próxima fronteira de frase. O redator escrevia sobre uma fala que não é a
   * que abre o vídeo.
   */
  inicioJaAlinhado = false
): string {
  if (palavras?.length) {
    const primeira = palavras.findIndex((w) => w.end > inicio);
    let ultima = -1;
    for (let i = palavras.length - 1; i >= 0; i--) {
      if (palavras[i].start < fim) {
        ultima = i;
        break;
      }
    }
    if (primeira >= 0 && ultima >= primeira) {
      const [encaixe, b] = encaixarNaFrase(palavras, primeira, ultima);
      const a = inicioJaAlinhado ? primeira : encaixe;
      return palavras
        .slice(a, b + 1)
        .map((w) => w.word)
        .join(" ");
    }
  }

  // Sem marcação por palavra, cai para parágrafo que encoste no intervalo.
  // Parágrafo já vem fechado em frase, então não precisa de encaixe.
  return paragrafos
    .filter((p) => p.start < fim && p.end > inicio)
    .map((p) => p.text)
    .join(" ")
    .trim();
}

/** Escapa quebra de linha crua dentro de string antes de parsear. */
function parseTolerante(bruto: string): { trechos?: TrechoBruto[]; diagnostico?: string } {
  try {
    return JSON.parse(bruto) as { trechos?: TrechoBruto[]; diagnostico?: string };
  } catch {
    let dentro = false;
    let escapando = false;
    let saida = "";
    for (const ch of bruto) {
      if (escapando) {
        saida += ch;
        escapando = false;
        continue;
      }
      if (ch === "\\") {
        saida += ch;
        escapando = true;
        continue;
      }
      if (ch === '"') dentro = !dentro;
      if (dentro && (ch === "\n" || ch === "\r")) {
        saida += "\\n";
        continue;
      }
      saida += ch;
    }
    return JSON.parse(saida) as { trechos?: TrechoBruto[] };
  }
}

/**
 * Encaixa as bordas do recorte em fronteira de frase.
 *
 * Necessário desde que a fala passou a ser recortada em código: o modelo devolve
 * segundos aproximados, e cortar exatamente ali abre o trecho no meio da frase
 * ("faço? Eu coloco o Cloud..."), o que o redator do Passo 4 recebe como se
 * fosse a fala inteira. Enquanto era o modelo que copiava, ele fechava a frase
 * sozinho e o defeito ficava escondido.
 *
 * As duas bordas se movem para o MESMO lado, para a frente, e a razão é
 * assimétrica de propósito:
 *
 * - No início, aparar o fragmento da frase anterior custa algumas palavras.
 *   Recuar até o começo dela custaria importar fala que o modelo não escolheu.
 *   Medido na gravação de 27 minutos do Bruno: recuar trouxe trinta palavras
 *   sobre outro assunto para dentro do trecho. Perder o pedaço é mais barato
 *   que ganhar o pedaço errado.
 * - No fim, avançar é a única direção que fecha a frase.
 *
 * O limite de palavras existe para o caso de a Deepgram não pontuar o trecho, e
 * ao batê-lo o encaixe **desiste** e devolve a borda original, em vez de parar
 * num lugar arbitrário. Um dos cinco trechos daquela gravação cai justamente
 * numa parte de fala corrida, sem ponto final nenhum.
 */
const MAX_PALAVRAS_DE_ENCAIXE = 40;

function fechaFrase(palavra: string): boolean {
  return /[.!?…]["')\]]?$/.test(palavra);
}

function encaixarNaFrase(
  palavras: Word[],
  primeira: number,
  ultima: number
): [number, number] {
  // Início: avança até a primeira palavra cuja anterior fecha frase.
  let a = primeira;
  let achouInicio = a === 0 || fechaFrase(palavras[a - 1].word);
  while (!achouInicio && a < ultima && a - primeira < MAX_PALAVRAS_DE_ENCAIXE) {
    a++;
    achouInicio = fechaFrase(palavras[a - 1].word);
  }

  // Fim: avança até a primeira palavra que fecha frase.
  let b = ultima;
  let achouFim = fechaFrase(palavras[b].word);
  while (!achouFim && b < palavras.length - 1 && b - ultima < MAX_PALAVRAS_DE_ENCAIXE) {
    b++;
    achouFim = fechaFrase(palavras[b].word);
  }

  return [achouInicio ? a : primeira, achouFim ? b : ultima];
}

/**
 * Os três primeiros segundos decidem o corte, e ninguém estava conferindo.
 *
 * `encaixarNaFrase` garante que o trecho comece numa fronteira de frase. Isso
 * NÃO é o mesmo que começar bem. Medido nos seis cortes da gravação real do
 * Bruno em 23/08, cinco abriam com defeito:
 *
 *   "software como serviço, é software as a service"  autocorreção
 *   "Diligência, todo AQUELE negócio falou..."          referência sem antecedente
 *   "AH, mas eu sou CLT..."                             muleta
 *   "MESMO, pra fazer trabalho social..."               fragmento de frase anterior
 *   "ENTÃO por exemplo, AH voltei pro mercado..."       muleta dupla
 *
 * O Bruno assistiu e resumiu: "pega uma parte totalmente desinteressante, com
 * erros na minha fala". O corte 0 chamava-se "Consultoria não escala" e abria
 * com ele gaguejando sobre software: o título prometia uma coisa e os primeiros
 * segundos entregavam outra.
 *
 * Isto é verificação em CÓDIGO, e não mais um pedido no prompt, pela mesma razão
 * da limpeza de hesitação: reconhecer muleta no começo de uma frase é mecânico e
 * conferível, e prompt não garante nada que dependa de o modelo lembrar.
 */

/** Palavra que só liga a frase ao que veio antes. Quem chega não viu o antes. */
const MULETA_DE_ABERTURA = new Set([
  "então", "entao", "ah", "aí", "ai", "e", "mas", "mesmo", "bom", "cara",
  "tipo", "né", "ne", "pô", "po", "enfim", "daí", "dai", "olha", "sabe",
  "é", "eh", "assim", "beleza", "certo", "agora", "aliás", "alias",
]);

/**
 * Pronome ou demonstrativo que aponta para fora do trecho. "A maior parte das
 * empresas não é ASSIM" exige ter visto o "assim", e quem abre o Reels não viu.
 */
const APONTA_PRA_FORA = new Set([
  "assim", "isso", "esse", "essa", "esses", "essas", "aquele", "aquela",
  "aquilo", "aqueles", "aquelas", "ele", "ela", "eles", "elas", "disso",
  "nisso", "dele", "dela", "ali", "lá", "la", "daí", "dai",
]);

function semPontuacao(palavra: string): string {
  return palavra
    .toLowerCase()
    .replace(/[.,!?;:"'()\[\]…]/g, "")
    .trim();
}

/**
 * Por que a abertura é ruim, ou `null` quando ela presta.
 *
 * Devolve o motivo em vez de um booleano porque este julgamento vai para o log
 * e para o teste: saber QUE reprovou sem saber POR QUE só transfere o mistério
 * de lugar.
 */
export function defeitoDaAbertura(
  palavras: Word[],
  inicio: number
): string | null {
  const janela = palavras.slice(inicio, inicio + 8).map((p) => semPontuacao(p.word));
  if (janela.length < 3) return "trecho curto demais para julgar";

  if (MULETA_DE_ABERTURA.has(janela[0])) {
    return `abre com a muleta "${janela[0]}"`;
  }

  // Gaguejo: a mesma palavra duas vezes seguidas.
  for (let i = 1; i < janela.length; i++) {
    if (janela[i] && janela[i] === janela[i - 1]) {
      return `repete "${janela[i]}" logo na abertura`;
    }
  }

  // Autocorreção: palavra de conteúdo que volta em seis palavras. É a assinatura
  // de "software como serviço, é software as a service".
  const conteudo = janela
    .slice(0, 6)
    .filter((w) => w.length > 3 && !MULETA_DE_ABERTURA.has(w));
  const repetida = conteudo.find((w, i) => conteudo.indexOf(w) !== i);
  if (repetida) return `autocorreção em "${repetida}"`;

  // Aponta para fora nas primeiras palavras, antes de nomear o assunto.
  const aponta = janela.slice(0, 5).find((w) => APONTA_PRA_FORA.has(w));
  if (aponta) return `abre apontando para fora com "${aponta}"`;

  return null;
}

/** Quantas palavras-muleta dá para aparar da frente antes de virar outra frase. */
const MAX_PALAVRAS_APARADAS = 3;

/** Quantas frases o começo pode andar antes de a gente desistir e ficar com o que tem. */
const MAX_FRASES_DE_BUSCA = 3;

/** O corte não pode encolher abaixo disto só para achar uma abertura melhor. */
const MIN_PALAVRAS_RESTANTES = 25;

/**
 * Teto de quanto do trecho pode ser jogado fora atrás de uma abertura melhor.
 *
 * Sem isto, a busca por abertura vira uma máquina de descaracterizar trecho.
 * Medido na gravação real em 23/08: sem teto, um trecho de 63 segundos avançava
 * 43, ou seja 68% do que o agente escolheu ia embora, junto com a tese que
 * justificava o corte existir. Abertura boa num trecho que virou outro assunto
 * não é conserto, é troca.
 */
const MAX_FRACAO_DESCARTADA = 0.25;

/**
 * Empurra o começo até uma frase que abra bem, sem destruir o trecho.
 *
 * Anda por FRASE e não por palavra: começar no meio de uma frase foi justamente
 * um dos defeitos ("mesmo, pra fazer trabalho social"). E desiste em vez de
 * andar sem limite, porque trecho que anda demais deixa de ser o trecho que o
 * agente escolheu e vira outro assunto.
 */
export function abrirNaFraseBoa(
  palavras: Word[],
  primeira: number,
  ultima: number
): { inicio: number; motivo: string | null } {
  let ultimoDefeito = defeitoDaAbertura(palavras, primeira);
  if (!ultimoDefeito) return { inicio: primeira, motivo: null };

  // ESTÁGIO 1: aparar a muleta da frente, e só ela.
  //
  // A maioria dos defeitos é a primeira palavra, não a primeira frase: "AH, mas
  // eu sou CLT" vira "mas eu sou CLT" e depois "eu sou CLT", que abre bem e não
  // perde conteúdo nenhum. Tentar isto antes de andar por frase é o que
  // preserva o trecho que o agente escolheu.
  for (let i = 1; i <= MAX_PALAVRAS_APARADAS; i++) {
    const a = primeira + i;
    if (ultima - a < MIN_PALAVRAS_RESTANTES) break;
    const defeito = defeitoDaAbertura(palavras, a);
    if (!defeito) return { inicio: a, motivo: null };
    ultimoDefeito = defeito;
  }

  // ESTÁGIO 2: andar por frase, com teto de quanto pode ser descartado.
  const limite = primeira + Math.floor((ultima - primeira) * MAX_FRACAO_DESCARTADA);
  let a = primeira;
  for (let frase = 0; frase < MAX_FRASES_DE_BUSCA; frase++) {
    let b = a;
    while (b < ultima && !fechaFrase(palavras[b].word)) b++;
    b++;
    if (b > limite || b >= ultima || ultima - b < MIN_PALAVRAS_RESTANTES) break;

    a = b;
    const defeito = defeitoDaAbertura(palavras, a);
    if (!defeito) return { inicio: a, motivo: null };
    ultimoDefeito = defeito;
  }

  // Nenhuma abertura próxima presta sem descaracterizar o trecho. Fica com a
  // original e DIZ o motivo, porque trecho que abre mal em silêncio foi o que
  // gerou esta função.
  return { inicio: primeira, motivo: ultimoDefeito };
}

/**
 * O modelo às vezes devolve tempo fora da gravação, trecho invertido ou
 * sobreposto. Nada disso pode chegar ao Passo 4, porque vira corte errado e
 * post sobre a frase errada. A limpeza é barata e evita retrabalho caro.
 */
export function sanear(
  trechos: TrechoBruto[],
  duracaoSegundos: number
): TrechoBruto[] {
  const limpos = trechos
    .map((t) => ({
      ...t,
      inicio: Math.max(0, Math.min(t.inicio, duracaoSegundos)),
      fim: Math.max(0, Math.min(t.fim, duracaoSegundos)),
    }))
    .filter((t) => t.fim - t.inicio >= 10)
    .sort((a, b) => a.inicio - b.inicio);

  const semSobreposicao: TrechoBruto[] = [];
  for (const t of limpos) {
    const anterior = semSobreposicao[semSobreposicao.length - 1];
    if (anterior && t.inicio < anterior.fim) {
      // Sobrepôs: fica o mais longo, que costuma ser o que tem a ideia inteira.
      if (t.fim - t.inicio > anterior.fim - anterior.inicio) {
        semSobreposicao[semSobreposicao.length - 1] = t;
      }
      continue;
    }
    semSobreposicao.push(t);
  }
  return semSobreposicao;
}
