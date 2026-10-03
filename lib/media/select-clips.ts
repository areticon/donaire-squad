import { askClaude } from "@/lib/claude";
import type { Word } from "@/lib/media/transcribe";
import { fechaCorte } from "@/lib/media/texto-final-do-corte";
import type { RevisaoDoCorte } from "@/lib/media/estado-da-revisao-do-corte";

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
  /**
   * As bordas já caem numa pausa medida entre palavras, então o pedido ao
   * worker usa o segundo exato em vez de arredondar (ver pedido-de-corte.ts).
   * Quem marca é a refação do Vitor (`lib/media/revisao-do-corte.ts`).
   */
  emPausa?: boolean;
  /**
   * Quantas vezes o Vitor refez este corte sozinho porque a Vera reprovou.
   * Teto em `MAX_REFACOES_DO_CORTE`; passou dele, o corte vai ao cliente.
   */
  refacoes?: number;
  /** O estado da revisão do corte pela Vera, para a tela. */
  revisaoDoCorte?: RevisaoDoCorte;
};

/** O que o modelo devolve. A fala entra depois, recortada por nós. */
type TrechoBruto = Omit<Trecho, "transcricao">;

const SISTEMA = `Você é editor de vídeo curto. Escolhe quais momentos de uma gravação crua viram Reels, Shorts e TikToks, e recusa os que não viram.

Recebe a transcrição de alguém falando sem roteiro, em blocos com marcação de tempo.

## A regra que manda sobre todas: NOTA HONESTA, e o cliente escolhe

O cliente pediu um número de cortes para a semana dele e vai ESCOLHER entre os candidatos que você devolver, numa tela que mostra a nota e o motivo de cada um. Por isso devolva a quantidade de candidatos pedida, do mais forte para o mais fraco, sempre momentos diferentes da gravação.

A honestidade mora na NOTA, e não na quantidade: nunca suba nota para um trecho parecer melhor. Se a gravação só tem dois momentos fortes, os outros candidatos vêm com a nota que merecem e o "motivo" diz o que falta neles. Só deixe de completar a quantidade se não existir mais nenhum trecho que se sustente sozinho (aí explique no diagnóstico).

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

**Nota final 6 ou mais é corte recomendado.** Abaixo de 6 o trecho só entra como candidato para completar a quantidade pedida, nunca na frente de um mais forte, e nunca abaixo de 4.

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
- O trecho é UM intervalo contínuo da gravação: o que vai ao ar é tudo o que foi dito entre o início e o fim, na ordem. Não conte com juntar pedaços distantes.
- A ÚLTIMA frase do trecho precisa estar COMPLETA e terminar em ponto final, seguida de pausa. Nunca termine em "então", "e", "mas", "porque", em vírgula, nem em frase que anuncia outra ("então a forma mais inteligente que tem é..."): se a conclusão vem depois, o trecho vai até ela.
- O trecho termina ANTES de qualquer despedida ou encerramento do vídeo ("Deus abençoe, até mais", "se inscreve no canal").
- O trecho termina onde o RACIOCÍNIO termina, e não só a frase. Uma cena forte no meio de uma história ("o barco começou a afundar") NÃO é fecho se a história continua e o ponto que ela ilustra vem depois: o trecho vai até a frase em que o ponto aterrissa (a lição, a virada, a pergunta final). Quem assiste só o corte precisa sair entendendo o que você quis dizer.
- Entre 20 e 90 segundos. Entre 30 e 60 é onde a retenção vive; passe de 60 só se o raciocínio precisar. Se o raciocínio só fecha depois de 90, vá até a frase do fecho, mas nunca passe de 120.
- Os trechos não podem se sobrepor, e cada um é um momento diferente: dois recortes do mesmo raciocínio contam como um só.
- Prefira vários trechos curtos e completos a um trecho longo que junta dois assuntos: o cliente precisa de opções para escolher.

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

/**
 * QUANTOS CANDIDATOS A SELEÇÃO TRAZ (01/10).
 *
 * Até 30/09 o número saía só da duração (`clipesEstimados`) e o prompt dizia
 * "até N, menos se não houver N que prestem", com "NÃO ENCHA COTA" em
 * destaque e corte duro na nota 6. Medido em 01/10 nas duas gravações do
 * teste do Bruno: o modelo devolvia UM trecho (22 min e 4,7 min), e o número
 * de cortes que o cliente marcou no passo 4 (os dias de "Vídeo curto") nem
 * chegava aqui. Resultado: o cliente pedia três e escolhia entre um.
 *
 * Agora a conta parte do pedido: pelo menos o pedido, e de preferência
 * `MARGEM_DE_ESCOLHA` a mais para a tela de roteiro ter opção. Tudo limitado ao
 * que a gravação comporta: cortes sem sobreposição de uns 45 s em média.
 */
const MARGEM_DE_ESCOLHA = 2;
/** Duração média de um corte para dizer quantos cabem na gravação sem sobrepor. */
const SEGUNDOS_POR_CORTE_QUE_CABE = 45;
/** Teto de candidatos: acima disso o roteiro fica caro e a tela vira lista. */
const TETO_DE_CANDIDATOS = 8;
/**
 * Até quando ainda vale pedir o complemento: 300 s de primeira chamada e fecho,
 * mais até 180 s (com uma retentativa, 360) do complemento e o fecho dele,
 * ainda cabem nos 800 s da rota com folga para gravar o resultado.
 */
const ORCAMENTO_PARA_COMPLEMENTO_MS = 300_000;
/** Candidatos a mais na primeira chamada, para o descarte do fecho não deixar buraco. */
const FOLGA_CONTRA_DESCARTE = 1;

export type MetaDaSelecao = { pedido: number; minimo: number; alvo: number; capacidade: number };

export function metaDaSelecao(duracaoSegundos: number, pedido?: number | null): MetaDaSelecao {
  // Sem pedido (plano sem dia de vídeo curto, ou chamada antiga), conta como
  // um: a esteira sempre corta, e um corte com margem de escolha é o mínimo
  // que a tela de roteiro precisa para não ser um "aprove isto".
  const p = pedido && pedido > 0 ? Math.floor(pedido) : 1;
  const capacidade = Math.max(1, Math.min(TETO_DE_CANDIDATOS, Math.floor(duracaoSegundos / SEGUNDOS_POR_CORTE_QUE_CABE)));
  return {
    pedido: p,
    minimo: Math.min(p, capacidade),
    alvo: Math.min(p + MARGEM_DE_ESCOLHA, capacidade),
    capacidade,
  };
}

/**
 * A gravação não rendeu NENHUM trecho (01/10). Separada do erro técnico porque
 * a consequência é outra: aqui a rota /select devolve os créditos da primeira
 * parte (decisão do Bruno), e numa falha técnica o vídeo é tentado de novo.
 */
export class SemTrechoAproveitavel extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemTrechoAproveitavel";
  }
}

export async function selecionarTrechos(
  fonte: FonteDaFala,
  duracaoSegundos: number,
  contexto?: { nicho?: string | null; publico?: string | null; voz?: string | null },
  usageCtx?: { projectId?: string; runId?: string },
  /** Quantos cortes o cliente marcou no passo 4 (dias de "Vídeo curto"). */
  pedido?: number | null
): Promise<Trecho[]> {
  const { paragrafos, palavras } = fonte;
  if (!paragrafos.length) {
    throw new Error("Transcrição sem parágrafos: nada para escolher.");
  }

  const comeco = Date.now();
  const meta = metaDaSelecao(duracaoSegundos, pedido);
  console.log(`[selecao] pedido ${meta.pedido}, alvo ${meta.alvo} candidatos (cabem ${meta.capacidade})`);

  // O CAMINHO DO JEV (03/10): o código monta as janelas, o JEV decide e o
  // Haiku só escreve os rótulos (ver `selecao-pelo-jev.ts`). Opt-in com
  // SELECAO_PELO_JEV=1: medido no vídeo de 19 min, custa um quarto e roda em
  // um sexto do tempo, mas abriu pior os cortes (8,5 contra 10,5 de 12 na
  // melhor rodada), então o padrão segue no Claude. Qualquer falha, ou
  // confiança baixa (menos que o mínimo), cai no caminho antigo logo abaixo.
  const peloJev = await selecionarPeloJev(fonte, meta, contexto, usageCtx).catch((e: unknown) => {
    console.error("[selecao] caminho do JEV falhou, volta ao Claude:", e instanceof Error ? e.message : e);
    return null;
  });
  if (peloJev) return peloJev;

  // Pede um a mais que o alvo: a conferência do fecho descarta o trecho que
  // não conclui (medido em 01/10, um ou dois por rodada), e um candidato de
  // folga na mesma chamada sai mais barato e mais rápido que o complemento.
  const pedidos = Math.min(meta.alvo + FOLGA_CONTRA_DESCARTE, meta.capacidade + FOLGA_CONTRA_DESCARTE);
  const primeira = await pedirTrechos(paragrafos, duracaoSegundos, contexto, meta, pedidos, [], usageCtx);
  if (primeira.diagnostico) {
    console.log(`[selecao] diagnóstico do agente: ${primeira.diagnostico}`);
  }
  let escolhidos = await prepararTrechos(primeira.trechos, [], meta.alvo, duracaoSegundos, palavras, usageCtx, pedidos);

  // COMPLEMENTO (01/10): se, depois da nota, da abertura, do fecho e da
  // sobreposição, sobrou menos que o alvo, uma segunda chamada pede SÓ o que
  // falta, fora dos intervalos já escolhidos. É o que garante o pedido mesmo
  // quando o modelo é conservador ou dois trechos colapsam no mesmo momento.
  // Falha aqui não derruba a seleção: fica com o que já tinha.
  //
  // Só com tempo: a rota vive 800 s e a primeira chamada pode levar até 240
  // (o cliente da API ainda tenta de novo uma vez). Passado o orçamento, fica
  // com o que tem em vez de arriscar morrer em "selecting".
  const decorrido = Date.now() - comeco;
  if (escolhidos.length < meta.alvo && decorrido > ORCAMENTO_PARA_COMPLEMENTO_MS) {
    console.warn(`[selecao] sem tempo para o complemento (${Math.round(decorrido / 1000)} s): ficam ${escolhidos.length}`);
  } else if (escolhidos.length < meta.alvo) {
    const falta = meta.alvo - escolhidos.length;
    try {
      // Os trechos da primeira chamada que caíram (nota, fecho, sobreposição)
      // vão junto como recusados: sem isso o modelo propõe o mesmo de novo e
      // ele cai de novo (medido em 01/10, o "5%" voltou nas duas rodadas).
      const recusados = primeira.trechos.filter((b) => !sobrepoe(b, escolhidos));
      const extra = await pedirTrechos(paragrafos, duracaoSegundos, contexto, meta, falta, escolhidos, usageCtx, 180_000, recusados);
      const novos = await prepararTrechos(extra.trechos, escolhidos, falta, duracaoSegundos, palavras, usageCtx);
      console.log(`[selecao] complemento: pedidos ${falta}, vieram ${novos.length}`);
      escolhidos = [...escolhidos, ...novos].sort((a, b) => a.inicio - b.inicio);
    } catch (e) {
      console.error("[selecao] complemento falhou:", e instanceof Error ? e.message : e);
    }
  }

  if (!escolhidos.length) {
    // Classe própria (01/10): a rota /select estorna a primeira parte só neste caso.
    throw new SemTrechoAproveitavel(
      primeira.diagnostico
        ? `Nenhum trecho aproveitável nesta gravação. ${primeira.diagnostico}`
        : "O agente não devolveu nenhum trecho."
    );
  }
  if (escolhidos.length < meta.minimo) {
    console.warn(`[selecao] só ${escolhidos.length} de ${meta.minimo} cortes pedidos: a gravação não rendeu mais`);
  }

  return escolhidos.map(({ alinhado, ...t }) => ({
    ...t,
    transcricao: recortarFala(t.inicio, t.fim, paragrafos, palavras, alinhado),
  }));
}

type TrechoPreparado = TrechoBruto & { alinhado?: boolean };

/**
 * A seleção pelo JEV com a mesma conferência do fecho do caminho antigo.
 * Devolve `null` para quem chama cair no Claude antigo (desligado, JEV fora do
 * ar, confiança baixa, ou o fecho derrubou abaixo do mínimo).
 */
async function selecionarPeloJev(
  fonte: FonteDaFala,
  meta: MetaDaSelecao,
  contexto: { nicho?: string | null; publico?: string | null; voz?: string | null } | undefined,
  usageCtx?: { projectId?: string; runId?: string }
): Promise<Trecho[] | null> {
  // Import dinâmico: o módulo do JEV importa deste arquivo (guardas e tipos).
  const { escolherPeloJev, selecaoPeloJevLigada } = await import("@/lib/media/selecao-pelo-jev");
  const { paragrafos, palavras } = fonte;
  if (!selecaoPeloJevLigada() || !palavras?.length) return null;
  const r = await escolherPeloJev(palavras, contexto, usageCtx, meta, meta.alvo + FOLGA_CONTRA_DESCARTE);
  if (!r) {
    console.warn("[selecao] JEV sem confiança (abaixo do mínimo pedido): volta ao Claude");
    return null;
  }
  if (r.diagnostico) console.log(`[selecao] diagnóstico (JEV): ${r.diagnostico}`);
  // Os trechos vêm do mais forte para o mais fraco (a ordem do JEV); o fecho
  // pode estender um fim, então a sobreposição é conferida de novo nessa ordem.
  const conferidos = await conferirFecho(r.trechos, palavras, usageCtx);
  const aceitos: typeof conferidos = [];
  for (const t of conferidos) {
    if (aceitos.length >= meta.alvo) break;
    if (sobrepoe(t, aceitos)) {
      console.log(`[selecao] JEV: descartado "${t.titulo}": encosta num corte mais forte depois do fecho`);
      continue;
    }
    aceitos.push(t);
  }
  const finais = aceitos.sort((a, b) => a.inicio - b.inicio);
  console.log(`[selecao] JEV: ${finais.length} cortes em ${Math.round(r.ms / 1000)} s, JEV US$ ${r.uso.custoUsd.toFixed(5)}`);
  if (finais.length < meta.minimo) {
    console.warn(`[selecao] JEV: o fecho deixou ${finais.length} de ${meta.minimo}: volta ao Claude`);
    return null;
  }
  return finais.map(({ alinhado: _alinhado, ...t }) => ({
    ...t,
    transcricao: recortarFala(t.inicio, t.fim, paragrafos, palavras, true),
  }));
}

/**
 * Do que o modelo devolveu ao que pode ir para a tela: tempos saneados, nota
 * conferida, abertura e fim alinhados ao texto, fecho do raciocínio conferido e
 * nenhuma sobreposição, nem entre eles nem com os `jaEscolhidos`.
 *
 * A sobreposição é conferida DE NOVO no fim porque `ajustarAbertura` pode
 * recuar o começo (a abertura escolhida estava antes do tempo devolvido) e
 * estender o fim até fechar a frase: dois trechos separados na saída do modelo
 * podiam terminar encostados um no outro depois disso.
 */
async function prepararTrechos(
  brutos: TrechoBruto[],
  jaEscolhidos: TrechoPreparado[],
  vagas: number,
  duracaoSegundos: number,
  palavras: Word[] | undefined,
  usageCtx?: { projectId?: string; runId?: string },
  /** Quantos podem passar da nota antes do fecho (as vagas mais a folga). */
  comFolga = vagas
): Promise<TrechoPreparado[]> {
  const saneados = sanear(brutos, duracaoSegundos);
  const foraDosEscolhidos = saneados.filter((t) => !sobrepoe(t, jaEscolhidos));
  console.log(`[selecao] ${brutos.length} trechos do modelo, ${saneados.length} depois do saneamento, ${foraDosEscolhidos.length} fora dos já escolhidos`);
  const ajustados = comNotaSuficiente(foraDosEscolhidos, comFolga).map((t) => ajustarAbertura(t, palavras));
  const conferidos = palavras?.length ? await conferirFecho(ajustados, palavras, usageCtx, jaEscolhidos) : ajustados;
  // Sobrando mais que as vagas, ficam os mais fortes (e não os primeiros da gravação).
  return semSobreposicao(conferidos, jaEscolhidos)
    .sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))
    .slice(0, vagas)
    .sort((a, b) => a.inicio - b.inicio);
}

function sobrepoe(t: { inicio: number; fim: number }, outros: Array<{ inicio: number; fim: number }>): boolean {
  return outros.some((o) => t.inicio < o.fim && o.inicio < t.fim);
}

/**
 * Fica com os mais fortes que não se encostam: em ordem de nota (empate, o
 * mais longo, que costuma ter a ideia inteira), aceita quem não sobrepõe nada
 * já aceito. Devolve na ordem da gravação.
 */
function semSobreposicao<T extends { inicio: number; fim: number; nota?: number; titulo?: string }>(
  trechos: T[],
  jaEscolhidos: Array<{ inicio: number; fim: number }>
): T[] {
  const porForca = [...trechos].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0) || b.fim - b.inicio - (a.fim - a.inicio));
  const aceitos: T[] = [];
  for (const t of porForca) {
    if (sobrepoe(t, [...jaEscolhidos, ...aceitos])) {
      console.log(`[selecao] descartado "${t.titulo ?? ""}": encosta num corte mais forte depois do ajuste das bordas`);
      continue;
    }
    aceitos.push(t);
  }
  return aceitos.sort((a, b) => a.inicio - b.inicio);
}

/** Uma chamada ao seletor, pedindo `quantos` trechos fora dos `jaEscolhidos`. */
async function pedirTrechos(
  paragrafos: Paragrafo[],
  duracaoSegundos: number,
  contexto: { nicho?: string | null; publico?: string | null; voz?: string | null } | undefined,
  meta: MetaDaSelecao,
  quantos: number,
  jaEscolhidos: Array<{ inicio: number; fim: number; titulo?: string }>,
  usageCtx?: { projectId?: string; runId?: string },
  timeoutMs = 240_000,
  recusados: Array<{ inicio: number; fim: number; titulo?: string }> = []
): Promise<{ trechos: TrechoBruto[]; diagnostico?: string }> {
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

  // O pedido vai com o número e o porquê: sem isso o modelo lê "até N" como
  // licença para devolver um só (medido em 01/10).
  const pedidoDoCliente = jaEscolhidos.length
    ? `Já foram escolhidos estes trechos, que NÃO podem ser repetidos nem tocados (nenhum segundo em comum):
${jaEscolhidos.map((t) => `- ${t.inicio.toFixed(0)}s a ${t.fim.toFixed(0)}s${t.titulo ? `: ${t.titulo}` : ""}`).join("\n")}
${recusados.length ? `
Estes já foram propostos e RECUSADOS (nota baixa, ou o raciocínio não fecha sem invadir outro corte): não proponha de novo o mesmo momento.
${recusados.map((t) => `- ${t.inicio.toFixed(0)}s a ${t.fim.toFixed(0)}s${t.titulo ? `: ${t.titulo}` : ""}`).join("\n")}
` : ""}
Faltam candidatos para o cliente escolher. Devolva mais ${quantos} trecho${quantos > 1 ? "s" : ""}, em outros momentos da gravação, do mais forte para o mais fraco, com nota honesta.`
    : `O cliente pediu ${meta.pedido} corte${meta.pedido > 1 ? "s" : ""} para a semana e vai escolher na tela de roteiro. Devolva ${quantos} trechos candidatos, do mais forte para o mais fraco, com nota honesta.`;

  const resposta = await askClaude(
    SISTEMA,
    `${perfil ? perfil + "\n\n" : ""}Gravação de ${Math.round(duracaoSegundos / 60)} minutos.
${pedidoDoCliente}

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
    {
      maxTokens: 32000,
      // "medium", por ordem do Bruno em 31/08 ("precisa ser muito mais
      // rapido, revise suas premissas"). A premissa revisada: a selecao era
      // tratada como julgamento puro e ficava no esforco padrao, mas 90% da
      // saida e pensamento (10.916 tokens, 121s medidos em 22/08), e a
      // medicao de 23/08 na limpeza mostrou o medio com resultado
      // equivalente na metade do tempo. O que protege a qualidade aqui nao e
      // o pensamento longo, e a verificacao em codigo que ja existe: ancora
      // textual conferida, nota minima, fala recortada por nos.
      effort: "medium",
      // 240s: aborta DENTRO da vida da funcao (maxDuration 800), entao a
      // falha vira status failed com retry, e nao um selecting mudo ate o
      // prazo da varredura (o travamento que o Bruno viu em 31/08). O
      // complemento (01/10) recebe menos, porque roda depois da primeira.
      timeoutMs,
      usage: { operation: "video_selecao", ...usageCtx },
    }
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
  // A fala entra depois, recortada do que já está no banco: o modelo devolve
  // só os tempos.
  return { trechos: dados.trechos ?? [], diagnostico: dados.diagnostico };
}

/**
 * A CONFERÊNCIA DO FECHO (30/09).
 *
 * O código já garante que o corte termina em frase completa, mas frase
 * completa não é raciocínio completo. No vídeo do celular do Bruno o corte
 * "Jesus entrou na empresa, não no templo" terminava em "o barco começou a
 * afundar.", com a história e o ponto dela ainda por vir; o seletor chamou de
 * "fecha numa cena forte". O Bruno: "como a plataforma pode finalizar um vídeo
 * antes de concluir o raciocínio?".
 *
 * Aqui um segundo olhar, barato e focado, lê o fim do corte e o minuto de fala
 * seguinte, numerado por frase, e responde só: o raciocínio fechou? Se não, em
 * que frase ele fecha. O fim é estendido até lá quando cabe (até 120 s de
 * corte e sem invadir o trecho seguinte). Falha da conferência nunca derruba a
 * seleção: o trecho segue como estava.
 *
 * Desde 01/10, quando o fecho NÃO cabe (o próximo corte está logo ali, o teto
 * de 120 s chegou ou a gravação acabou), o conferente também vê as últimas
 * frases de dentro do corte e pode RECUAR o fim para a frase em que um ponto
 * completo já aterrissou. Sem recuo possível, o trecho sai da lista: antes ele
 * ia para a tela terminando no ar ("os próximos etapas da nossa casa, tá?").
 */
const JANELA_DO_FECHO_SEG = 75;
const MAX_CORTE_SEG = 120;

export async function conferirFecho<T extends { inicio: number; fim: number; titulo?: string; ideia?: string }>(
  trechos: T[],
  palavras: Word[],
  usageCtx?: { projectId?: string; runId?: string },
  /**
   * Cortes já escolhidos fora desta lista (o complemento da seleção, 01/10):
   * o fecho também não pode avançar sobre eles.
   */
  vizinhos: Array<{ inicio: number; fim: number }> = []
): Promise<T[]> {
  const ordenados: Array<{ inicio: number }> = [...trechos, ...vizinhos].sort((a, b) => a.inicio - b.inicio);
  const conferidos = await Promise.all(
    trechos.map(async (t): Promise<T | null> => {
      try {
        const dentro = palavras.filter((w) => w.start >= t.inicio - 0.05 && w.end <= t.fim + 0.05);
        if (!dentro.length) return t;
        const fimDoCorte = dentro[dentro.length - 1].end;
        const proximo = ordenados.find((o) => o.inicio > t.inicio);
        const limite = Math.min(t.inicio + MAX_CORTE_SEG, proximo ? proximo.inicio - 0.3 : Infinity, fimDoCorte + JANELA_DO_FECHO_SEG);
        // As frases depois do corte, numeradas, com o segundo em que acabam.
        const frases: Array<{ n: number; texto: string; fim: number }> = [];
        let atual: string[] = [];
        for (const w of palavras) {
          if (w.start < fimDoCorte - 0.01 || w.start > limite) continue;
          atual.push(w.word);
          if (fechaCorte(w.word)) {
            frases.push({ n: frases.length + 1, texto: atual.join(" "), fim: w.end });
            atual = [];
          }
        }
        // As últimas frases DE DENTRO do corte, numeradas também (01/10): são
        // o recuo quando o fecho não cabe. Só valem as que deixam o corte com
        // pelo menos `MIN_CORTE_SEG`; a última é o fim atual e não é recuo.
        const internas: Array<{ n: number; texto: string; fim: number }> = [];
        atual = [];
        for (const w of dentro) {
          atual.push(w.word);
          if (fechaCorte(w.word)) {
            internas.push({ n: 0, texto: atual.join(" "), fim: w.end });
            atual = [];
          }
        }
        if (atual.length) internas.push({ n: 0, texto: atual.join(" "), fim: fimDoCorte });
        const finais = internas.slice(-FRASES_FINAIS_MOSTRADAS).map((f, i) => ({ ...f, n: i + 1 }));
        const atualFim = finais.length;
        const bruto = await askClaude(
          `Você confere se um CORTE de vídeo curto termina com o raciocínio concluído. Quem assiste só o corte precisa sair entendendo o ponto. Uma cena forte no meio de uma história não é conclusão se o ponto que ela ilustra vem depois. Frase que anuncia o que vem ("vamos ver", "o próximo passo é"), muda de assunto ou só pede confirmação ("né?", "tá?") também não é conclusão. Despedida ou encerramento do vídeo ("Deus abençoe, até mais", "se inscreve", "espero que tenha ajudado") NUNCA fica no corte: se o corte termina nela, concluido é false e recuarAte aponta a última frase antes da despedida.
Responda APENAS JSON: {"concluido": true|false, "fraseDoFecho": número da frase DEPOIS do corte em que o raciocínio conclui, ou null, "recuarAte": número da frase FINAL DO CORTE em que um raciocínio completo já terminou, ou null, "motivo": "curto"}.
Se já concluiu, os dois são null. Se não concluiu e a conclusão aparece nas frases depois, use fraseDoFecho. Se não concluiu e a conclusão NÃO aparece depois, use recuarAte (só se cortar ali deixa um ponto completo e entendível); se nem isso, os dois são null.`,
          `TÍTULO DO CORTE: ${t.titulo ?? ""}
IDEIA: ${t.ideia ?? ""}

FRASES FINAIS DO CORTE (a ${atualFim} é a última que vai ao ar hoje):
${finais.map((f) => `[${f.n}] ${f.texto}`).join("\n")}

O QUE VEM DEPOIS NA GRAVAÇÃO:
${frases.length ? frases.map((f) => `[${f.n}] ${f.texto}`).join("\n") : "(nada: o corte não pode avançar, por acabar a gravação, encostar no próximo corte ou bater o teto de duração)"}`,
          // Esforço médio (01/10): no baixo, o conferente aceitava fins fracos
          // como "Então essa é a ideia aqui.", e o Bruno pediu corte preciso.
          // Custa centavos a mais por vídeo.
          { maxTokens: 1500, effort: "medium", usage: { operation: "video_fecho", ...usageCtx } }
        );
        const r = JSON.parse(bruto.replace(/^[^{]*/, "").replace(/[^}]*$/, "")) as { concluido?: boolean; fraseDoFecho?: number | null; recuarAte?: number | null; motivo?: string };
        if (r.concluido !== false) return t;
        const alvo = r.fraseDoFecho ? frases.find((f) => f.n === r.fraseDoFecho) : undefined;
        if (alvo && alvo.fim > t.fim) {
          console.log(`[selecao] fecho: "${t.titulo ?? ""}" estendido de ${t.fim.toFixed(0)}s para ${alvo.fim.toFixed(0)}s (${r.motivo ?? ""})`);
          return { ...t, fim: alvo.fim };
        }
        // O fecho não cabe (próximo corte, teto de 120 s ou fim da gravação).
        // Antes o corte seguia assim mesmo, terminando no ar; agora recua para
        // a frase em que um ponto completo já aterrissou, ou sai da lista: um
        // candidato que termina no meio do raciocínio não vai para a tela, e
        // o complemento da seleção pede outro no lugar.
        const recuo = r.recuarAte ? finais.find((f) => f.n === r.recuarAte && f.n < atualFim) : undefined;
        if (recuo && recuo.fim - t.inicio >= MIN_CORTE_SEG) {
          console.log(`[selecao] fecho: "${t.titulo ?? ""}" recuado de ${t.fim.toFixed(0)}s para ${recuo.fim.toFixed(0)}s (${r.motivo ?? ""})`);
          return { ...t, fim: recuo.fim };
        }
        console.log(`[selecao] fecho: "${t.titulo ?? ""}" descartado, termina sem concluir e não há onde fechar (${r.motivo ?? ""})`);
        return null;
      } catch (e) {
        console.error("[selecao] conferência do fecho falhou:", e instanceof Error ? e.message : e);
        return t;
      }
    })
  );
  return conferidos.filter((t): t is Awaited<T> => t !== null) as T[];
}

/** Quantas frases do fim do corte o conferente vê para poder recuar. */
const FRASES_FINAIS_MOSTRADAS = 8;
/** Recuar o fim nunca deixa o corte mais curto que isto. */
const MIN_CORTE_SEG = 20;

/** Abaixo disto o trecho sai morno e queima o alcance de quem publicar. */
const NOTA_MINIMA = 6;
/**
 * Abaixo disto nem como candidato: nota 3 quer dizer que algum critério
 * quebrou de vez (não se entende sozinho, não tem tese), e mostrar isso como
 * opção seria empurrar ao cliente um corte que a gente sabe que não funciona.
 */
const NOTA_PISO = 4;

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
  trechos: T[],
  /** Quantos candidatos o cliente precisa ver (pedido mais a margem). */
  vagas: number
): T[] {
  const criterios = ["gancho", "tese", "prova", "autonomia", "emocao", "fecho"] as const;

  const comNota: Array<{ trecho: T; nota: number; pior: string }> = trechos.map((t) => {
    if (!t.notas) return { trecho: t, nota: t.nota ?? NOTA_MINIMA, pior: "" };
    const valores = criterios.map((c) => Number(t.notas?.[c] ?? 0));
    const menor = Math.min(...valores);
    return { trecho: t, nota: menor, pior: criterios[valores.indexOf(menor)] };
  });

  // Os recomendados (6 ou mais) entram sempre. Abaixo disso, desde 01/10, o
  // trecho pode entrar como CANDIDATO para completar o que o cliente pediu,
  // do mais forte para o mais fraco e nunca abaixo do piso: a nota fica
  // gravada e visível, então a honestidade sobre a matéria-prima continua; o
  // que mudou é que o cliente escolhe em vez de o código decidir por ele.
  const passam = comNota.filter((x) => x.nota >= NOTA_MINIMA);
  const reserva = comNota
    .filter((x) => x.nota < NOTA_MINIMA && x.nota >= NOTA_PISO)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, Math.max(0, vagas - passam.length));
  for (const x of comNota) {
    if (x.nota < NOTA_MINIMA && !reserva.includes(x)) {
      console.log(
        `[selecao] descartado "${x.trecho.titulo ?? "sem título"}": ` +
          `nota ${x.nota}, pior critério ${x.pior || "?"}`
      );
    }
  }
  for (const x of reserva) {
    console.log(`[selecao] candidato abaixo da nota ${NOTA_MINIMA} para completar o pedido: "${x.trecho.titulo ?? ""}", nota ${x.nota}, pior critério ${x.pior || "?"}`);
  }
  console.log(
    `[selecao] ${passam.length} de ${trechos.length} trechos passaram da nota ${NOTA_MINIMA}, ${reserva.length} entram como candidatos`
  );
  return [...passam, ...reserva].map((x) => ({ ...x.trecho, nota: x.nota }));
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
  //
  // `>=` e não `>` (29/09): quando a última palavra já fechava a frase, o fim
  // ficava no número do modelo, que pode cair antes do fim dessa palavra.
  const fechou = fimEncaixado < palavras.length && fechaCorte(palavras[fimEncaixado].word);
  const fim = fechou && fimEncaixado >= ultima ? palavras[fimEncaixado].end : t.fim;
  if (!fechou) {
    // Checagem em código da regra do prompt: nenhum trecho termina sem frase
    // completa sem que o log diga. A Vera lê o texto final e reprova depois.
    console.warn(
      `[selecao] trecho de ${t.inicio.toFixed(0)}s termina sem frase completa, em "${palavras[fimEncaixado]?.word ?? "?"}"`
    );
  }

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

  // Fim: avança até a primeira palavra que fecha frase E pode fechar corte.
  // `fechaCorte` e não só `fechaFrase` (29/09): a transcrição às vezes põe
  // ponto depois de "então" ou "e", que puxam a frase seguinte, e o corte
  // que termina ali fica pendurado. Mesma regra da Vera e do Vitor.
  let b = ultima;
  let achouFim = fechaCorte(palavras[b].word);
  while (!achouFim && b < palavras.length - 1 && b - ultima < MAX_PALAVRAS_DE_ENCAIXE) {
    b++;
    achouFim = fechaCorte(palavras[b].word);
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
