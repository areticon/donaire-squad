import type { CenaDoVideo } from "@/lib/media/video-por-ia";
import { SEGUNDOS_DA_PRIMEIRA_GERACAO, SEGUNDOS_POR_EXTENSAO } from "@/lib/credits/video-tabela";
import { numerosDoTexto, pareceAfirmacao } from "@/lib/media/numeros-falados";

/**
 * O ROTEIRO EM CENAS DO VÍDEO, e por que ele existe.
 *
 * O vídeo de 60 s é uma geração de 8 s e oito extensões de 7 s, e cada
 * extensão recebe o SEU prompt (o que acontece nos próximos 7 s) e a SUA
 * frase de narração. Mandar o mesmo prompt nove vezes faria o Veo repetir a
 * mesma cena nove vezes com o narrador repetindo a mesma frase.
 *
 * Então a Diana escreve um roteiro em N cenas, uma por geração, numa chamada
 * só. Desde 22/09 o CLIPE DE 8 s passa pelo mesmo caminho, com uma cena: ele
 * tinha um prompt próprio, em texto corrido, com exatamente os mesmos buracos
 * do roteiro longo, e manter dois lugares para a mesma doutrina era garantir
 * que só um dos dois fosse consertado.
 *
 * Este módulo é puro: monta o pedido, lê a resposta e confere os números.
 * Quem chama o modelo é a esteira.
 */

/**
 * A RÉGUA DE PALAVRAS, MEDIDA CONTRA UM VÍDEO PRONTO (22/09/2026).
 *
 * Era 2,0 palavras por segundo, herdada de `maxNarrationWordsForDuration`, e
 * nunca tinha sido conferida contra um mp4 que saiu do Veo. O vídeo do dia 21
 * (30 s, 4 cenas, 51 palavras) foi transcrito com marcação por palavra:
 *
 *   • o narrador articula a 2,56 palavras por segundo ENQUANTO fala, que é
 *     ritmo natural de português brasileiro (a literatura de fluência põe a
 *     fala espontânea entre 90 e 130 palavras por minuto, e a fala preparada
 *     perto de 180, ou seja 3,0);
 *   • mesmo assim só 69% do clipe tinha voz, e 6,89 s foram pausas de 0,4 s
 *     ou mais, duas delas de 2,3 s e 2,9 s, bem no FIM de uma geração.
 *
 * Ou seja: o narrador não é lento, o orçamento de palavras é que era curto
 * demais para o slot, e a sobra se acumulava na emenda entre uma geração e a
 * outra. A régua passa a ser 2,4, que é 94% do ritmo medido: enche a cena e
 * ainda deixa margem para a narração terminar antes do corte, que é o que o
 * prompt do Veo exige.
 */
const PALAVRAS_POR_SEGUNDO = 2.4;

/** Quantas palavras cabem numa cena, pela régua medida. */
export function palavrasDaCena(segundos: number): number {
  return Math.max(8, Math.round(segundos * PALAVRAS_POR_SEGUNDO));
}

/**
 * Quantos segundos cada cena tem. A cena 1 é a geração inicial (até 8 s) e
 * cada seguinte é uma extensão de 7 s.
 */
export function limitesDeNarracao(totalDeGeracoes: number, segundosEntregues: number): number[] {
  const limites: number[] = [];
  for (let i = 1; i <= totalDeGeracoes; i++) {
    const seg = i === 1 ? Math.min(SEGUNDOS_DA_PRIMEIRA_GERACAO, segundosEntregues) : SEGUNDOS_POR_EXTENSAO;
    limites.push(palavrasDaCena(seg));
  }
  return limites;
}

/** O roteiro lido: a tese em uma frase e as cenas, na ordem. */
export interface RoteiroDoVideo {
  tese: string;
  cenas: CenaDoVideo[];
}

/**
 * A DOUTRINA DE ROTEIRO, e de onde ela vem.
 *
 * O vídeo do dia 21 saiu com quatro defeitos medidos (parte 161 do HANDOFF):
 * inventou um fato, não tinha gancho, entregou frases soltas e perdeu a tese
 * do post. Os quatro têm causa no prompt, e cada bloco abaixo responde a um:
 *
 *   • a tese antes das cenas, porque "baseado neste conteúdo de post" deixava
 *     o modelo pegar fragmentos;
 *   • o gancho definido, porque "abertura clara" é cumprido por qualquer
 *     frase declarativa (quem assiste decide nos 3 primeiros segundos, e
 *     curiosidade nasce de uma LACUNA de informação, não de um resumo);
 *   • a ligação obrigatória entre cenas, porque pedir "um texto contínuo" não
 *     é o mesmo que exigir que cada cena puxe a seguinte;
 *   • a regra de não acrescentar fato, que existia só para os redatores e
 *     nunca tinha sido escrita aqui.
 */
function doutrinaDoRoteiro(umaCenaSo: boolean): string {
  const ondeAbre = umaCenaSo ? "a primeira frase" : "a cena 1";
  const ondeFecha = umaCenaSo ? "a última frase" : "a última cena";
  return `ANTES DAS CENAS, ESCREVA A TESE.
A tese é a ideia do post em UMA frase, no campo "tese". Não é o assunto ("o custo do tempo"), é a afirmação que a pessoa leva embora ("as horas que você gasta escrevendo post são as horas mais caras da sua semana"). Escreva a tese primeiro e não escreva nenhuma cena que a contrarie ou que troque de assunto.

O QUE ABRE UM VÍDEO: ${ondeAbre}.
Quem assiste decide nos 3 primeiros segundos se continua. Abertura não é resumo do que vem depois nem apresentação do tema: é a TENSÃO que a pessoa já vive, dita com o que o post tem de mais concreto, de um jeito que ela se reconheça sem precisar de explicação nenhuma. Ela abre uma pergunta que a pessoa quer ver respondida, e o resto do vídeo responde.
${ondeAbre} está ERRADA se:
- serviria igual para qualquer outro post do mesmo nicho (é genérica);
- anuncia o assunto ("hoje vamos falar de", "vamos entender", "existe um problema");
- começa por saudação, por definição, por contexto ou por dado de mercado;
- afirma um episódio que o post não conta.
${ondeAbre} está CERTA se a frase seguinte for NECESSÁRIA para fechar o que ela abriu.

CADA ${umaCenaSo ? "FRASE" : "CENA"} PUXA A SEGUINTE.
Entre uma e a outra só existem duas ligações possíveis: MAS (contraria o que acabou de ser dito) e POR ISSO (decorre dele). Ligação por "e também", "além disso", "outro ponto" é lista, não é história, e é exatamente assim que o vídeo vira frases soltas.
Teste antes de entregar: leia cada ${umaCenaSo ? "frase" : "cena"} sozinha. Se ela depende de uma informação que o vídeo ainda não deu, está fora de ordem. (O vídeo que motivou esta regra dizia "aritmética: trezentos reais a hora" sem que ninguém tivesse dito de que conta se falava.)
${ondeFecha} ENTREGA o que a abertura prometeu: é a resolução que o post dá, dita como conclusão, não como convite. Nada de "clique", "saiba mais", "me chame" ou promessa de resultado.

SÓ O QUE O POST DIZ. Esta regra não tem exceção.
Você não é autor do fato, é autor da forma. Tudo que o roteiro afirma sobre o mundo tem de estar no post acima.
- Faixa continua faixa: se o post diz "de 500 a 3.000", o roteiro nunca diz "1.500".
- Comparação continua comparação: o post comparar preços não significa que alguém recebeu, recusou, pagou ou contratou.
- Não atribua à pessoa uma ação que o post não conta (recusou, contratou, tentou, desistiu, demitiu).
- Número que não está no post não entra, nem arredondado, nem "cerca de", nem como exemplo.
Se a frase ficar mais fraca sem o número, ela fica sem o número.

O ESPECÍFICO VENCE O GENÉRICO.
Entre o detalhe concreto que está no post e a formulação ampla, escolha sempre o detalhe: ele é mais fácil de acreditar e de lembrar. Corte "no mundo de hoje", "cada vez mais", "de forma estratégica", "a chave é", "muitas empresas". Prefira a coisa, a hora, o lugar e o gesto que o post já nomeia.`;
}

export function promptDoRoteiro(args: {
  textoDoPost: string;
  totalDeGeracoes: number;
  segundosEntregues: number;
  comNarracao: boolean;
  estiloVisual: string;
  nicho: string;
}): string {
  const { textoDoPost, totalDeGeracoes, segundosEntregues, comNarracao, estiloVisual, nicho } = args;
  const umaCenaSo = totalDeGeracoes === 1;
  const cenas: string[] = [];
  for (let i = 1; i <= totalDeGeracoes; i++) {
    const seg = i === 1 ? Math.min(SEGUNDOS_DA_PRIMEIRA_GERACAO, segundosEntregues) : SEGUNDOS_POR_EXTENSAO;
    const papel = umaCenaSo
      ? "gancho, virada e fecho"
      : i === 1
        ? "o gancho"
        : i === totalDeGeracoes
          ? "a entrega da promessa"
          : "desenvolve, ligada à anterior por MAS ou POR ISSO";
    const teto = palavrasDaCena(seg);
    cenas.push(
      `cena ${i} (${papel}): ${seg} segundos${comNarracao ? `, narração de ${Math.round(teto * 0.8)} a ${teto} palavras` : ""}`,
    );
  }

  return `Escreva o ROTEIRO de um vídeo de cerca de ${segundosEntregues} segundos, gerado por IA, a partir do post abaixo.

O POST, que é a sua ÚNICA fonte de fatos:

${textoDoPost}

${doutrinaDoRoteiro(umaCenaSo)}

ESTILO VISUAL ESCOLHIDO PELO USUÁRIO (obrigatório refletir no campo "visual" de cada cena, em inglês):
${estiloVisual}

COMO O VÍDEO É GERADO, e por que o roteiro tem esta forma: ${
    umaCenaSo
      ? `o modelo gera UM clipe contínuo de ${segundosEntregues} segundos, sem corte.`
      : `o modelo gera a cena 1 (${SEGUNDOS_DA_PRIMEIRA_GERACAO} s) e depois ESTENDE o vídeo cena a cena, ${SEGUNDOS_POR_EXTENSAO} s por vez, sempre continuando o último quadro sem corte.`
  } São exatamente ${totalDeGeracoes} cena${totalDeGeracoes > 1 ? "s" : ""}:
${cenas.map((c) => `- ${c}`).join("\n")}

REGRAS DE PRODUÇÃO:
- UMA ideia completa do início ao fim${umaCenaSo ? "" : ": a cena 1 abre, as do meio desenvolvem, a última fecha"}, com desfecho natural (gesto final, plano de encerramento). Nunca cortar no meio de uma frase ou gesto.
- CONTINUIDADE: todas as cenas acontecem no MESMO ambiente, com a mesma luz e a mesma paleta; cada "visual" descreve o que acontece ${umaCenaSo ? "no clipe" : "a partir do último quadro da cena anterior"} (movimento de câmera, o que entra em quadro, o que muda), em INGLÊS, sem marcadores.
- O "visual" nasce do TEMA deste post, e não de uma cena genérica de escritório.
- Sem pessoas falando em câmera e sem boca visível: voice-over com B-roll, objetos, mãos, ambientes, motion graphics. Sem texto na tela, sem legendas.
- NÃO DESCREVA OBJETO CUJO CONTEÚDO É TEXTO: calendário com os dias escritos, planilha, fatura, contrato, manchete, placa, tela de aplicativo, relógio digital. O gerador escreve as palavras erradas e em inglês, e texto errado na tela reprova a peça inteira. Diga a mesma coisa com forma, cor, quantidade e gesto: quatro blocos que somem da semana valem mais que um calendário com os dias escritos.
${comNarracao
      ? `- NARRAÇÃO EM PORTUGUÊS BRASILEIRO: o campo "narracao" de cada cena é a frase exata que o narrador diz naquele trecho, DENTRO da faixa de palavras daquela cena. CONTE as palavras antes de entregar. Abaixo da faixa sobra silêncio no fim da cena, e o silêncio é o que faz o vídeo parecer vazio; acima dela a frase é cortada no meio, porque o clipe tem duração fixa. Nenhuma frase pode terminar no meio: cada uma é completa.`
      : `- Sem fala: o campo "narracao" fica vazio em todas as cenas.`}
- Contexto brasileiro quando fizer sentido. Nicho: ${nicho}.

Responda SOMENTE com JSON válido, sem cerca de código, sem comentário, sem travessão, neste formato:
{"tese":"...","cenas":[{"visual":"...","narracao":"..."}${totalDeGeracoes > 1 ? ',{"visual":"...","narracao":"..."}' : ""}]}
com exatamente ${totalDeGeracoes} item${totalDeGeracoes > 1 ? "s" : ""} em "cenas", na ordem.`;
}

/**
 * Lê o roteiro. Devolve `null` quando a resposta não serve (JSON quebrado,
 * número errado de cenas, cena sem visual): quem chama decide o que fazer.
 * Tolerante à cerca de código e a texto antes do JSON, como `lerJson` do
 * radar. A tese é opcional na leitura: roteiro bom com tese faltando não é
 * motivo para derrubar o dia, e o prompt já a cobra. A NARRAÇÃO não é: vídeo
 * que pediu voz e voltou sem ela é roteiro inválido.
 */
export function lerRoteiro(bruto: string, totalDeGeracoes: number, comNarracao = false): RoteiroDoVideo | null {
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let dados: { tese?: unknown; cenas?: Array<{ visual?: unknown; narracao?: unknown }> };
  try {
    dados = JSON.parse(limpo);
  } catch {
    const a = limpo.indexOf("{");
    const b = limpo.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try {
      dados = JSON.parse(limpo.slice(a, b + 1));
    } catch {
      return null;
    }
  }
  if (!Array.isArray(dados.cenas) || dados.cenas.length !== totalDeGeracoes) return null;
  const cenas: CenaDoVideo[] = [];
  for (const c of dados.cenas) {
    const visual = typeof c?.visual === "string" ? c.visual.trim() : "";
    if (visual.length < 20) return null;
    const narracao = typeof c?.narracao === "string" ? c.narracao.trim().replace(/[—–]/g, ",") : "";
    /**
     * CENA MUDA QUANDO O VIDEO PEDIU VOZ E ROTEIRO INVALIDO.
     *
     * Medido na prova de 22/09: numa das rodadas o modelo devolveu a cena com
     * o visual inteiro e sem o campo "narracao", e o clipe teria saido mudo
     * sem ninguem perceber, porque as duas guardas seguintes acham que cena
     * sem fala esta em ordem. Aqui vira roteiro invalido, que ja tem caminho:
     * a segunda chance.
     */
    if (comNarracao && !narracao) return null;
    cenas.push(narracao ? { visual, narracao } : { visual });
  }
  const tese = typeof dados.tese === "string" ? dados.tese.trim().replace(/[—–]/g, ",") : "";
  return { tese, cenas };
}

/** Uma cena cuja narração afirma número que o post não tem. */
export interface FatoInventado {
  /** 1 para a primeira cena. */
  cena: number;
  numeros: string[];
  narracao: string;
}

/**
 * O FATO INVENTADO, MEDIDO EM VEZ DE COMBINADO.
 *
 * O prompt agora proíbe acrescentar fato, e prompt não é garantia: a mesma
 * proibição existe no texto desde sempre e ainda assim precisou de uma guarda
 * de código (`afirmacoesSemLastro`) para parar de sair post com número
 * inventado. Aqui a régua é a mesma: todo número que a narração AFIRMA tem de
 * aparecer no post, e o número por extenso é lido por
 * `lib/media/numeros-falados.ts`, porque na narração ele vem falado.
 *
 * Por que a guarda não é a Vera: ela não revisa roteiro, custaria mais uma
 * chamada de Opus por dia de vídeo, e em 09/09 ela aprovou número inventado
 * porque conferiu o texto contra um brief escrito pelo próprio modelo. O que
 * é medido não fica a critério de ninguém.
 */
export function fatosInventados(cenas: CenaDoVideo[], textoDoPost: string): FatoInventado[] {
  const doPost = new Set(numerosDoTexto(textoDoPost));
  const achados: FatoInventado[] = [];
  cenas.forEach((cena, i) => {
    const narracao = cena.narracao?.trim();
    if (!narracao) return;
    const suspeitos = numerosDoTexto(narracao).filter(
      (n) => pareceAfirmacao(n, narracao) && !doPost.has(n),
    );
    if (suspeitos.length) achados.push({ cena: i + 1, numeros: suspeitos, narracao });
  });
  return achados;
}

/** Uma cena cuja narração não cabe no tempo dela. */
export interface NarracaoLonga {
  cena: number;
  palavras: number;
  limite: number;
}

/**
 * A NARRAÇÃO QUE NÃO CABE, medida em vez de pedida.
 *
 * O prompt manda usar o limite quase inteiro, porque narração curta demais
 * deixa silêncio, e na primeira rodada de prova o modelo respondeu a isso com
 * 25 palavras num limite de 19. Trocar um defeito pelo outro seria só mudar
 * de lado: a 2,56 palavras por segundo, 25 palavras precisam de 9,8 s e o
 * clipe tem 8, então a frase seria cortada no meio, que é exatamente o que o
 * prompt do Veo pede para não acontecer.
 *
 * Contar palavra é barato e não depende de o modelo obedecer.
 */
export function narracoesLongas(cenas: CenaDoVideo[], limites: number[]): NarracaoLonga[] {
  const achados: NarracaoLonga[] = [];
  cenas.forEach((cena, i) => {
    const palavras = (cena.narracao ?? "").split(/\s+/).filter(Boolean).length;
    const limite = limites[i] ?? limites[limites.length - 1] ?? 0;
    if (palavras > limite) achados.push({ cena: i + 1, palavras, limite });
  });
  return achados;
}

/**
 * O ÚLTIMO RECURSO DA NARRAÇÃO LONGA: corta por FRASE INTEIRA.
 *
 * Depois de duas tentativas, a narração que não cabe é reduzida às frases que
 * cabem, na ordem. Cortar no meio de uma frase seria fazer com a tesoura o
 * mesmo estrago que o corte do Veo faria sozinho. Se nem a primeira frase
 * couber, ela fica: uma frase inteira estourando um pouco é melhor que uma
 * cena muda, e o teto já tem 6% de folga sobre o ritmo medido.
 */
export function encurtarNarracao(cenas: CenaDoVideo[], limites: number[]): CenaDoVideo[] {
  return cenas.map((cena, i) => {
    const limite = limites[i] ?? limites[limites.length - 1] ?? 0;
    const narracao = cena.narracao?.trim();
    if (!narracao || narracao.split(/\s+/).filter(Boolean).length <= limite) return cena;
    const frases = narracao.split(/(?<=[.!?:])\s+/).filter(Boolean);
    const mantidas: string[] = [];
    let total = 0;
    for (const f of frases) {
      const n = f.split(/\s+/).filter(Boolean).length;
      if (mantidas.length && total + n > limite) break;
      mantidas.push(f);
      total += n;
    }
    return { ...cena, narracao: mantidas.join(" ") };
  });
}

/**
 * O ÚLTIMO RECURSO: cena que insistiu em número inventado fica MUDA.
 *
 * Depois de duas tentativas, entre publicar um número que o post não disse e
 * entregar o trecho sem voz, a casa escolhe o trecho sem voz. É a mesma
 * escolha do texto ("preferimos um post com menos números a um post com
 * número inventado em nome do cliente"), e o campo `narracao` já é opcional
 * por cena, então o vídeo continua saindo.
 */
export function calarCenas(cenas: CenaDoVideo[], inventados: FatoInventado[]): CenaDoVideo[] {
  const calar = new Set(inventados.map((f) => f.cena));
  return cenas.map((c, i) => (calar.has(i + 1) ? { visual: c.visual } : c));
}
