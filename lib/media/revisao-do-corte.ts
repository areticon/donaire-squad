import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import type { Word } from "@/lib/media/transcribe";
import type { Trecho } from "@/lib/media/select-clips";
import { enviarRecorteDoTrecho } from "@/lib/media/refazer";
import {
  bordasDoCliente,
  MAX_REFACOES_DO_CORTE,
  motivoParaQuemEscolheu,
  type RevisaoDoCorte,
  type TentativaDoCorte,
} from "@/lib/media/estado-da-revisao-do-corte";
import { textoFinalParaRevisao, type EdicaoDoTrecho } from "@/lib/media/edicao-gravada";
import { fechaCorte } from "@/lib/media/texto-final-do-corte";
import { corteAprovadoPeloJev } from "@/lib/squad/vera-pelo-jev";

/**
 * A Vera revisa cada CORTE, e o que ela reprova volta ao Vitor.
 *
 * Até 29/09 a Vera só revisava o dia inteiro (`vera-do-video.ts`), pelo texto
 * dos posts, e declarava que "o vídeo em si você não vê". Um corte reprovado
 * chegava ao cliente como "esperando você", e o conserto era trabalho dele.
 * No teste do Bruno desse dia, o corte 2 abria no "Funcionário bem treinado e
 * sênior", sem o "o estagiário faz o que você manda" que dava sentido à frase,
 * com o rabo de um "né?" antes, e fechava em "como a gente já disse", que
 * aponta para uma parte da gravação que quem vê o Reels nunca viu.
 *
 * O desenho:
 * 1. A Vera lê a fala do corte (com o que vem antes e depois, marcado como
 *    fora) e julga o que um espectador sente: abertura que se sustenta
 *    sozinha, fecho que aterrissa, ideia inteira. Devolve veredito e motivo.
 * 2. Reprovado, o Vitor escolhe novo início e fim NUMA LISTA DE PONTOS DE
 *    CORTE medidos na transcrição (fronteiras entre palavras, com a pausa de
 *    cada uma). O modelo escolhe; o código confere que a escolha é um desses
 *    pontos, que a duração cabe e que não invade outro corte. Nunca corta no
 *    meio de palavra porque não existe essa opção na lista.
 * 3. O trecho é recortado sozinho no worker (`enviarRecorteDoTrecho`, o mesmo
 *    caminho do ajuste do cliente), e o `cortar-callback` despacha a revisão
 *    de novo quando a mídia nova chega.
 * 4. Na terceira reprovação (ou se o Vitor não achar corte melhor), o corte
 *    vai ao cliente com o motivo da Vera dito às claras.
 *
 * O contador é `trecho.refacoes`, no JSON de `VideoJob.clips`; o estado para a
 * tela é `trecho.revisaoDoCorte`, espelhado no card do Vitor.
 */

type TrechoGravado = Trecho & {
  texto?: { titulo?: string };
  /** A edição que o worker recebeu (ver edicao-gravada.ts). */
  edicao?: EdicaoDoTrecho | null;
  midia?: { vertical?: unknown; erro?: string | null; refazendo?: boolean } & Record<string, unknown>;
};

/** Um lugar onde dá para cortar: entre a palavra `indice - 1` e a `indice`. */
export type PontoDeCorte = {
  /** Índice da palavra que vem DEPOIS do corte. */
  indice: number;
  /** O segundo exato do corte, no meio do silêncio entre as duas palavras. */
  instante: number;
  /** Quanto silêncio há entre as duas palavras, em segundos. */
  pausa: number;
  /** A palavra de antes fecha frase (ponto, interrogação, exclamação). */
  fimDeFrase: boolean;
};

/**
 * A palavra `i` abre uma frase: a anterior fecha frase, ou a anterior é uma
 * muleta de abertura ("Então", "Né") que por sua vez vem logo depois de um
 * ponto. Pular essa muleta é o que a Vera pede ("o estagiário faz o que você
 * manda", sem o "Então" que vinha antes), e continua sendo começo de frase.
 */
const MULETA_DE_ABERTURA = new Set(["entao", "ne", "e", "ai", "bom", "olha", "mas", "tipo", "assim"]);
function comecaFrase(palavras: Word[], i: number): boolean {
  if (i === 0 || fechaFrase(palavras[i - 1].word)) return true;
  const ant = palavras[i - 1].word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
  return MULETA_DE_ABERTURA.has(ant) && (i - 1 === 0 || fechaFrase(palavras[i - 2].word));
}

/** Duração aceita para um corte refeito. 90 s é o teto do Reels. */
const DURACAO_MINIMA_SEC = 12;
const DURACAO_MAXIMA_SEC = 90;
/** Quanto de fala em volta do corte a Vera e o Vitor enxergam. */
const CONTEXTO_DA_VERA_SEC = 20;
const JANELA_DO_VITOR_SEC = 45;
/** Pausa a partir da qual a tela do modelo marca o silêncio entre palavras. */
const PAUSA_VISIVEL_SEC = 0.15;

function fechaFrase(palavra: string): boolean {
  return /[.!?…]["')\]]?$/.test(palavra);
}

/**
 * O instante de corte entre duas palavras: no meio do silêncio, sem passar de
 * 0,12 s antes da palavra que começa (respiro curto soa natural; silêncio
 * longo na ponta a limpeza de pausas já tira).
 */
function instanteEntre(antes: Word | undefined, depois: Word): number {
  if (!antes) return Math.max(0, depois.start - 0.12);
  const pausa = depois.start - antes.end;
  if (pausa <= 0) return depois.start;
  return depois.start - Math.min(0.12, pausa / 2);
}

/** Onde o corte termina depois da palavra `ultima`: um respiro, nunca a próxima palavra. */
function instanteDoFim(palavras: Word[], ultima: number): number {
  const w = palavras[ultima];
  const proxima = palavras[ultima + 1];
  if (!proxima) return w.end + 0.2;
  const pausa = proxima.start - w.end;
  if (pausa <= 0) return w.end;
  return w.end + Math.min(0.25, pausa / 2);
}

/** Os pontos de corte possíveis numa janela de tempo. */
export function pontosDeCorte(palavras: Word[], de: number, ate: number): PontoDeCorte[] {
  const pontos: PontoDeCorte[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const w = palavras[i];
    if (w.start < de || w.start > ate) continue;
    const antes = palavras[i - 1];
    pontos.push({
      indice: i,
      instante: instanteEntre(antes, w),
      pausa: antes ? Math.max(0, w.start - antes.end) : w.start,
      fimDeFrase: !antes || fechaFrase(antes.word),
    });
  }
  return pontos;
}

/** Primeira e última palavra que o corte contém, pelo tempo. */
export function palavrasDoCorte(palavras: Word[], inicio: number, fim: number): [number, number] {
  // Palavra que termina até 0,05 s depois do início é rabo da anterior, e não
  // conta como dentro: é exatamente o "né?" que o corte de 29/09 carregava.
  let primeira = palavras.findIndex((w) => w.start >= inicio - 0.05);
  if (primeira < 0) primeira = palavras.length - 1;
  let ultima = primeira;
  for (let i = primeira; i < palavras.length && palavras[i].end <= fim + 0.05; i++) ultima = i;
  return [primeira, ultima];
}

/**
 * A fala com índice e pausa visível, que é como o modelo enxerga onde dá para
 * cortar. `#512 Funcionário` e `‖0.57s‖` entre palavras separadas por silêncio.
 */
function falaNumerada(palavras: Word[], de: number, ate: number, marcas: Map<number, string>): string {
  const partes: string[] = [];
  for (let i = de; i <= ate && i < palavras.length; i++) {
    const marca = marcas.get(i);
    if (marca) partes.push(`\n${marca}\n`);
    const antes = palavras[i - 1];
    const pausa = antes ? palavras[i].start - antes.end : 0;
    if (pausa >= PAUSA_VISIVEL_SEC) partes.push(`‖${pausa.toFixed(2)}s‖`);
    partes.push(`#${i} ${palavras[i].word}`);
  }
  const fim = marcas.get(ate + 1);
  if (fim) partes.push(`\n${fim}`);
  return partes.join(" ").replace(/ \n/g, "\n").replace(/\n /g, "\n");
}

function texto(palavras: Word[], de: number, ate: number): string {
  return palavras.slice(Math.max(0, de), ate + 1).map((w) => w.word).join(" ");
}

/** O texto vai para a tela do cliente, e a casa não usa travessão. */
function semTravessao(s: string): string {
  return s.replace(new RegExp("\\s*[\\u2013\\u2014]\\s*", "g"), ", ").trim();
}

function lerJson<T>(saida: string): T | null {
  const m = saida.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// ─── A Vera ────────────────────────────────────────────────────────────────

export type ParecerDoCorte = {
  veredito: "APROVADO" | "REPROVADO";
  /** Uma ou duas frases, para o Vitor corrigir e o cliente entender. */
  motivo: string;
  /** Onde está o defeito: é o que diz ao Vitor qual borda mexer. */
  problema: "inicio" | "fim" | "inicio_e_fim" | "conteudo" | null;
};

export async function veraRevisaCorte(entrada: {
  palavras: Word[];
  inicio: number;
  fim: number;
  titulo?: string;
  ideia?: string;
  projectId?: string;
  /**
   * O TEXTO FINAL, depois das remoções da limpeza, com " / " onde a edição
   * tirou palavras, e os defeitos mecânicos dele. Até 29/09 a Vera lia a
   * transcrição bruta do trecho e aprovou o corte de Moisés, cuja edição
   * tinha apagado "você, é delegar, né" e colado "a forma mais inteligente
   * que tem é / então tanto pro seu time". Ela precisa ler o que vai ao ar.
   */
  final?: { texto: string; defeitos: string[] };
}): Promise<ParecerDoCorte> {
  const { palavras, inicio, fim } = entrada;

  // Defeito mecânico reprova sem gastar modelo: fim pendurado, começo no meio
  // de frase, emenda que tira fala demais ou atravessa fim de frase. Não é
  // julgamento, é conta sobre o texto final, e conta o código faz melhor.
  const defeitos = entrada.final?.defeitos ?? [];
  if (defeitos.length) {
    const noInicio = defeitos.some((d) => d.startsWith("começa"));
    const noFim = defeitos.some((d) => d.startsWith("termina") || d.startsWith("o fim"));
    const noMeio = defeitos.some((d) => d.startsWith("emenda"));
    return {
      veredito: "REPROVADO",
      motivo: semTravessao(`O corte editado tem defeito: ${defeitos.join("; ")}.`),
      problema: noMeio ? "conteudo" : noInicio && noFim ? "inicio_e_fim" : noInicio ? "inicio" : "fim",
    };
  }
  const [primeira, ultima] = palavrasDoCorte(palavras, inicio, fim);
  const antesDe = palavras.findIndex((w) => w.start >= inicio - CONTEXTO_DA_VERA_SEC);
  let depoisAte = ultima;
  while (depoisAte + 1 < palavras.length && palavras[depoisAte + 1].start <= fim + CONTEXTO_DA_VERA_SEC) depoisAte++;

  // A VERA DECIDE PELO JEV (03/10, lib/squad/vera-pelo-jev.ts): as quatro
  // perguntas abaixo vão ao JEV; tudo sim com folga, o corte está aprovado e
  // não há motivo a escrever. Dúvida ou falha: o Claude revisa como antes.
  try {
    const jev = await corteAprovadoPeloJev({
      projectId: entrada.projectId,
      titulo: entrada.titulo,
      ideia: entrada.ideia,
      antes: texto(palavras, antesDe, primeira - 1),
      fala: entrada.final?.texto ?? texto(palavras, primeira, ultima),
      depois: texto(palavras, ultima + 1, depoisAte),
    });
    if (jev.aprova) return { veredito: "APROVADO", motivo: "Corte fechado.", problema: null };
  } catch (e) {
    console.error("[revisao-do-corte] JEV falhou, segue o Claude:", e instanceof Error ? e.message : e);
  }

  const tarefa = `Revise este CORTE de vídeo curto (Reels, Shorts). Ele foi recortado de uma gravação longa, e quem assiste o corte NÃO viu o resto da gravação.

TÍTULO DO CORTE: ${entrada.titulo ?? "(sem título)"}
IDEIA QUE O CORTE PRECISA ENTREGAR: ${entrada.ideia ?? "(não informada)"}
DURAÇÃO: ${Math.round(fim - inicio)} segundos

O QUE FOI DITO ANTES DO CORTE (fica FORA do vídeo, o espectador não ouve):
${texto(palavras, antesDe, primeira - 1) || "(nada, o corte começa no início da gravação)"}

>>> A FALA DO CORTE COMO VAI AO AR, JÁ EDITADA (é isto que o espectador ouve; " / " marca cada ponto onde a edição tirou palavras e emendou):
${entrada.final?.texto ?? texto(palavras, primeira, ultima)}
<<<

O QUE VEM DEPOIS (também FORA do vídeo):
${texto(palavras, ultima + 1, depoisAte) || "(nada, a gravação acaba aqui)"}

Julgue só o que um espectador sente ao ver o corte sozinho:
1. ABERTURA: a primeira frase se entende sem o que veio antes? Reprove se começa no meio de frase, com muleta ("né", "então", "e aí"), ou apoiada em algo dito fora ("isso", "ele", "como eu falei").
2. FECHO: a ÚLTIMA frase está completa, termina em ponto final e a ideia aterrissa? Reprove se para no meio da frase, se termina em "então", "e", "mas", "porque" ou vírgula, se anuncia uma conclusão que não vem ("a forma mais inteligente é..."), ou se fecha apontando para fora ("como a gente já disse", "vou mostrar agora").
3. IDEIA INTEIRA: a ideia do corte está completa dentro dele, ou a parte que dá sentido ficou fora?
4. EMENDAS: leia cada " / " como o espectador ouve, emendado. A frase de antes continua na de depois com sentido? Reprove (problema "conteudo") se a emenda salta de assunto, apaga a palavra que era a ideia da frase, ou junta o começo de uma frase com o fim de outra.

NÃO reprove por vício de fala que sobrou no meio (né, é, repetição). Não reprove por gosto nem pelo assunto em si. Reprove só o que faz o corte parecer quebrado para quem chega nele pelo feed.

Responda SÓ com um JSON, sem nada antes ou depois:
{"veredito": "APROVADO" ou "REPROVADO", "problema": "inicio" | "fim" | "inicio_e_fim" | "conteudo" | null, "motivo": "uma ou duas frases, em português do Brasil, citando a frase que incomoda"}

Sem travessão no texto: use vírgula, dois-pontos ou parênteses.`;

  const saida = await askClaude(
    "Você é Vera Veredito, a revisora de qualidade do squad. Assiste cortes de vídeo com o olhar de quem chega pelo feed.",
    tarefa,
    {
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 90_000,
      usage: { operation: "revisao-do-corte", agentId: "vera-veredito", projectId: entrada.projectId },
    }
  );
  const lido = lerJson<Partial<ParecerDoCorte>>(saida);
  const veredito = lido?.veredito === "REPROVADO" ? "REPROVADO" : "APROVADO";
  return {
    veredito,
    motivo: semTravessao(lido?.motivo ?? "") || (veredito === "APROVADO" ? "Corte fechado." : "O corte não se sustenta sozinho."),
    problema: veredito === "APROVADO" ? null : (lido?.problema ?? "inicio_e_fim"),
  };
}

// ─── O Vitor ───────────────────────────────────────────────────────────────

export type AjusteDasBordas = {
  inicio: number;
  fim: number;
  /** Primeira e última palavra do corte novo. */
  primeira: number;
  ultima: number;
  /** O que o Vitor mudou e por quê, em uma frase. */
  ajuste: string;
  /** A fala do corte novo, que substitui `trecho.transcricao`. */
  transcricao: string;
};

/**
 * Escolhe o novo início e fim a partir do parecer da Vera. Devolve null quando
 * não há corte melhor dentro das regras (o que manda o corte ao cliente).
 *
 * `limites` são as bordas dos cortes vizinhos: o corte refeito não pode
 * engolir a fala de outro corte da mesma gravação.
 */
export async function vitorAjustaBordas(entrada: {
  palavras: Word[];
  inicio: number;
  fim: number;
  parecer: ParecerDoCorte;
  titulo?: string;
  ideia?: string;
  limites?: { depoisDe: number; antesDe: number };
  /**
   * Os cortes que a Vera já reprovou neste trecho, com o motivo. No ensaio de
   * 29/09 o Vitor, sem ver o histórico, voltou na segunda refação exatamente
   * ao corte original: a Vera tinha reprovado a abertura com "o estagiário"
   * por muleta, ele tirou, e caiu no problema que ela apontou primeiro.
   */
  jaReprovados?: Array<{ inicio: number; fim: number; motivo: string }>;
  projectId?: string;
}): Promise<AjusteDasBordas | null> {
  const { palavras, inicio, fim, parecer } = entrada;
  if (!palavras.length) return null;
  const piso = Math.max(0, entrada.limites?.depoisDe ?? 0, inicio - JANELA_DO_VITOR_SEC);
  const teto = Math.min(entrada.limites?.antesDe ?? Infinity, fim + JANELA_DO_VITOR_SEC);

  const [primeiraAtual, ultimaAtual] = palavrasDoCorte(palavras, inicio, fim);
  const pontos = pontosDeCorte(palavras, piso, teto);
  if (pontos.length < 2) return null;
  const de = pontos[0].indice;
  const ate = Math.max(de, pontos[pontos.length - 1].indice - 1);

  const marcas = new Map<number, string>([
    [primeiraAtual, "[[INÍCIO ATUAL DO CORTE]]"],
    [ultimaAtual + 1, "[[FIM ATUAL DO CORTE]]"],
  ]);

  const tarefa = `A Vera reprovou este corte de vídeo curto e devolveu para você refazer ajustando ONDE ele começa e ONDE termina.

TÍTULO: ${entrada.titulo ?? "(sem título)"}
IDEIA QUE O CORTE PRECISA ENTREGAR: ${entrada.ideia ?? "(não informada)"}
PARECER DA VERA: ${parecer.motivo}
ONDE ESTÁ O PROBLEMA: ${parecer.problema ?? "não disse"}
${historicoParaOVitor(palavras, entrada.jaReprovados ?? [])}
A gravação em volta do corte, palavra por palavra. "#N" é o número da palavra; "‖0.57s‖" é um silêncio entre duas palavras. As marcas [[...]] mostram o corte de hoje.

${falaNumerada(palavras, de, ate, marcas)}

Escolha a PRIMEIRA e a ÚLTIMA palavra do corte novo.
- A primeira palavra ABRE uma frase: a palavra anterior termina em ponto, interrogação ou exclamação. Pode pular UMA muleta de abertura logo depois do ponto: em "YouTube. Então o estagiário faz o que você manda", comece em "o estagiário". Não comece em muleta ("né", "então", "e", "aí", "porque") nem em algo que aponta para fora ("isso", "ele").
- A última palavra FECHA uma frase completa: termina em ponto, interrogação ou exclamação, e não é "então", "e", "mas" nem "porque". Nunca termine em vírgula. A ideia aterrissa; não feche em frase que aponta para outra parte da gravação. O código recusa escolha fora destas duas regras.
- O corte novo precisa ter entre ${DURACAO_MINIMA_SEC} e ${DURACAO_MAXIMA_SEC} segundos e continuar sendo sobre a mesma ideia.
- Resolva o que a Vera apontou. Mexa só na borda que precisa.
- Não repita um corte que a Vera já reprovou: o novo precisa resolver os motivos de TODAS as tentativas acima.
- Se não houver corte melhor dentro dessas regras, diga: {"impossivel": true, "ajuste": "por quê"}.

Responda SÓ com um JSON, sem nada antes ou depois:
{"primeira": N, "ultima": N, "ajuste": "uma frase dizendo o que mudou e por quê, em português do Brasil"}

Sem travessão no texto.`;

  const saida = await askClaude(
    "Você é Vitor Vídeo, o editor de vídeo do squad. Refaz cortes com precisão de palavra.",
    tarefa,
    {
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 90_000,
      usage: { operation: "refacao-do-corte", agentId: "vitor-video", projectId: entrada.projectId },
    }
  );
  const lido = lerJson<{ primeira?: number; ultima?: number; ajuste?: string; impossivel?: boolean }>(saida);
  if (!lido || lido.impossivel || typeof lido.primeira !== "number" || typeof lido.ultima !== "number") {
    return null;
  }
  return conferirAjuste(palavras, lido.primeira, lido.ultima, {
    piso,
    teto,
    jaReprovados: [{ inicio, fim }, ...(entrada.jaReprovados ?? [])],
    ajuste: lido.ajuste ?? "",
  });
}

/** As tentativas reprovadas, com a primeira e a última frase de cada uma. */
function historicoParaOVitor(palavras: Word[], jaReprovados: Array<{ inicio: number; fim: number; motivo: string }>): string {
  if (!jaReprovados.length) return "";
  const linhas = jaReprovados.map((t, n) => {
    const [a, b] = palavrasDoCorte(palavras, t.inicio, t.fim);
    const abre = texto(palavras, a, Math.min(b, a + 7));
    const fecha = texto(palavras, Math.max(a, b - 7), b);
    return `${n + 1}. de #${a} ("${abre}...") a #${b} ("...${fecha}"): ${t.motivo}`;
  });
  return `\nTENTATIVAS QUE A VERA JÁ REPROVOU NESTE CORTE:\n${linhas.join("\n")}\n`;
}

/**
 * O que o código garante sobre a escolha do modelo, em vez de confiar nela:
 * as bordas caem entre palavras (é a única coisa que `instanteEntre` e
 * `instanteDoFim` sabem produzir, então não há como cortar no meio de uma),
 * dentro da janela, sem invadir os vizinhos, com duração que cabe no Reels, e
 * diferentes de todo corte que a Vera já reprovou.
 *
 * O código NÃO empurra a borda para o começo da frase. A primeira versão
 * empurrava, e no ensaio de 29/09 isso desfez a escolha certa do modelo: ele
 * abriu em "Se você usa o ChatGPT" e o código recuou para "Porque se você
 * usa", que era o defeito que a Vera tinha apontado.
 */
export function conferirAjuste(
  palavras: Word[],
  primeira: number,
  ultima: number,
  regras: { piso: number; teto: number; jaReprovados: Array<{ inicio: number; fim: number }>; ajuste: string }
): AjusteDasBordas | null {
  if (!Number.isInteger(primeira) || !Number.isInteger(ultima)) return null;
  if (primeira < 0 || ultima >= palavras.length || ultima <= primeira) return null;
  // Regra do Bruno de 29/09, conferida em código e não só pedida: o corte
  // começa no início de uma frase e termina no FIM de uma frase completa.
  // O corte de quinta do teste saiu terminando em "ele já tem bastante",
  // porque nada aqui conferia a última palavra.
  if (!comecaFrase(palavras, primeira)) return null;
  if (!fechaCorte(palavras[ultima].word)) return null;

  const inicio = Math.round(instanteEntre(palavras[primeira - 1], palavras[primeira]) * 1000) / 1000;
  const fim = Math.round(instanteDoFim(palavras, ultima) * 1000) / 1000;
  if (inicio < regras.piso - 0.01 || fim > regras.teto + 0.3) return null;
  const duracao = fim - inicio;
  if (duracao < DURACAO_MINIMA_SEC || duracao > DURACAO_MAXIMA_SEC) return null;
  const repete = regras.jaReprovados.some((t) => Math.abs(inicio - t.inicio) < 0.5 && Math.abs(fim - t.fim) < 0.5);
  if (repete) return null;

  return {
    inicio,
    fim,
    primeira,
    ultima,
    ajuste: semTravessao(regras.ajuste),
    transcricao: texto(palavras, primeira, ultima),
  };
}

// ─── A esteira ─────────────────────────────────────────────────────────────

/**
 * Funde campos num trecho SÓ, direto no banco (jsonb), sem regravar a lista.
 * O `clips` é escrito por várias rotas ao mesmo tempo (capas, destinos,
 * callback do worker); ler, mudar e regravar a lista inteira apagaria o que
 * outra rota gravou no meio. `midia` é fundida um nível abaixo.
 */
async function fundirNoTrecho(
  videoJobId: string,
  indice: number,
  campos: Record<string, unknown>,
  midia?: Record<string, unknown>
): Promise<void> {
  const camposJson = JSON.stringify(campos);
  const midiaJson = JSON.stringify(midia ?? {});
  await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(
      clips,
      ARRAY[${String(indice)}]::text[],
      (clips -> ${indice}::int)
        || ${camposJson}::jsonb
        || jsonb_build_object('midia', COALESCE(clips -> ${indice}::int -> 'midia', '{}'::jsonb) || ${midiaJson}::jsonb)
    )
    WHERE id = ${videoJobId} AND jsonb_typeof(clips -> ${indice}::int) = 'object'`;
}

/**
 * Toma o trecho para revisar: só passa se o estado ainda é o que foi lido.
 * Duas revisões do mesmo corte ao mesmo tempo (o `preparar` e o callback de
 * um re-corte, por exemplo) pagariam a Vera duas vezes e poderiam mandar o
 * mesmo trecho ao worker duas vezes.
 */
async function tomarTrecho(videoJobId: string, indice: number, estadoLido: string, revisao: RevisaoDoCorte): Promise<boolean> {
  const json = JSON.stringify(revisao);
  const n = await prisma.$executeRaw`
    UPDATE video_jobs
    SET clips = jsonb_set(clips, ARRAY[${String(indice)}, 'revisaoDoCorte']::text[], ${json}::jsonb, true)
    WHERE id = ${videoJobId}
      AND COALESCE(clips -> ${indice}::int -> 'revisaoDoCorte' ->> 'estado', '') = ${estadoLido}`;
  return n > 0;
}

/** O card do Vitor (um por destino) mostra o mesmo estado que o trecho. */
async function espelharNoCard(videoJobId: string, indice: number, revisao: RevisaoDoCorte): Promise<void> {
  const json = JSON.stringify(revisao);
  await prisma.$executeRaw`
    UPDATE campaign_cards
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('revisaoDoCorte', ${json}::jsonb)
    WHERE "agentId" = 'vitor-video'
      AND metadata ->> 'videoJobId' = ${videoJobId}
      AND metadata ->> 'trechoIndice' = ${String(indice)}`.catch((e) =>
    console.error(`[revisao-do-corte][${videoJobId}] espelhar no card ${indice} falhou:`, e)
  );
}

/**
 * Copia o estado de todos os trechos para os cards do Vitor. Existe porque a
 * revisão pode terminar ANTES de o `agendar` criar os cards (as duas saem do
 * mesmo callback do worker, em paralelo); o `preparar` chama isto no fim.
 */
export async function espelharRevisaoNosCards(videoJobId: string): Promise<void> {
  const video = await prisma.videoJob.findUnique({ where: { id: videoJobId }, select: { clips: true } });
  const trechos = (video?.clips as unknown as TrechoGravado[] | null) ?? [];
  for (const [i, t] of trechos.entries()) {
    if (t.revisaoDoCorte) await espelharNoCard(videoJobId, i, t.revisaoDoCorte);
  }
}

async function gravarEstado(
  videoJobId: string,
  indice: number,
  revisao: RevisaoDoCorte,
  extra?: { campos?: Record<string, unknown>; midia?: Record<string, unknown> }
): Promise<void> {
  await fundirNoTrecho(videoJobId, indice, { ...(extra?.campos ?? {}), revisaoDoCorte: revisao }, extra?.midia);
  await espelharNoCard(videoJobId, indice, revisao);
}

/** Revisão que ficou "revisando" mais que isto morreu no meio e pode ser retomada. */
const REVISAO_MORTA_MS = 10 * 60_000;

/**
 * Revisa os cortes que precisam: nunca revisados, ou refeitos e com a mídia
 * nova já de volta. Idempotente e seguro de chamar de novo a qualquer hora:
 * corte aprovado, entregue ao cliente, ou esperando o worker é pulado.
 */
export async function revisarCortesDoVideo(videoJobId: string): Promise<{
  revisados: number;
  aprovados: number;
  refazendo: number;
  paraOCliente: number;
}> {
  const resultado = { revisados: 0, aprovados: 0, refazendo: 0, paraOCliente: 0 };
  const video = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    select: {
      id: true,
      blobUrl: true,
      durationSec: true,
      projectId: true,
      clips: true,
      transcript: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true } },
    },
  });
  if (!video) return resultado;
  const palavras = (video.transcript as { words?: Word[] } | null)?.words ?? [];
  const trechos = (video.clips as unknown as TrechoGravado[] | null) ?? [];
  if (!palavras.length || !trechos.length) return resultado;

  const agora = () => new Date().toISOString();

  await Promise.all(
    trechos.map(async (t, i) => {
      const atual = t.revisaoDoCorte;
      const estadoLido = atual?.estado ?? "";
      if (!t.midia?.vertical && !t.midia?.erro) return; // ainda não cortado
      if (estadoLido === "aprovado" || estadoLido === "para-voce") return;
      if (estadoLido === "refazendo" && t.midia?.refazendo) return; // worker trabalhando
      if (estadoLido === "revisando" && Date.now() - new Date(atual!.desde).getTime() < REVISAO_MORTA_MS) return;

      const refacoes = t.refacoes ?? 0;
      const historico: TentativaDoCorte[] = atual?.historico ?? [];
      const base = { refacoes, historico, motivo: atual?.motivo ?? null, ajuste: atual?.ajuste ?? null };

      // A refação voltou com erro do worker: não há corte novo para a Vera
      // olhar, e insistir seria gastar worker no mesmo erro.
      if (estadoLido === "refazendo" && t.midia?.erro) {
        await gravarEstado(videoJobId, i, {
          ...base,
          estado: "para-voce",
          motivo: `${atual?.motivo ?? "A Vera pediu para refazer"}. O recorte novo falhou no estúdio de vídeo.`,
          desde: agora(),
        });
        resultado.paraOCliente++;
        return;
      }
      if (!t.midia?.vertical) return;

      const tomou = await tomarTrecho(videoJobId, i, estadoLido, { ...base, estado: "revisando", desde: agora() });
      if (!tomou) return;

      let parecer: ParecerDoCorte;
      try {
        // O texto FINAL (depois das remoções), e não a transcrição bruta.
        const final = textoFinalParaRevisao(palavras, t, video.durationSec ?? 0);
        if (final.defeitos.length) {
          console.warn(`[revisao-do-corte][${videoJobId}] corte ${i} com defeito no texto final (${final.fonte}): ${final.defeitos.join(" | ")}`);
        }
        parecer = await veraRevisaCorte({
          palavras, inicio: t.inicio, fim: t.fim, titulo: t.texto?.titulo ?? t.titulo, ideia: t.ideia, projectId: video.projectId,
          final: { texto: final.texto, defeitos: final.defeitos },
        });
      } catch (e) {
        // A Vera falhou: o corte existe e pode ser visto, só não foi revisado.
        // Some o estado em vez de dizer "reprovado" sem ninguém ter reprovado.
        console.error(`[revisao-do-corte][${videoJobId}] Vera falhou no corte ${i}:`, e);
        await fundirNoTrecho(videoJobId, i, { revisaoDoCorte: null });
        return;
      }
      resultado.revisados++;
      const tentativa: TentativaDoCorte = { inicio: t.inicio, fim: t.fim, veredito: parecer.veredito, motivo: parecer.motivo, em: agora() };
      const comHistorico = { ...base, historico: [...historico, tentativa].slice(-6) };

      if (parecer.veredito === "APROVADO") {
        await gravarEstado(videoJobId, i, { ...comHistorico, estado: "aprovado", motivo: null, desde: agora() });
        resultado.aprovados++;
        return;
      }

      // AS BORDAS SÃO DO CLIENTE (05/10): ele puxou início e fim no controle do corte, e o
      // Vitor não recorta por cima. O motivo da Vera vai a ele, o corte fica como está.
      if (bordasDoCliente(t as TrechoGravado & { controleDoCorte?: { ultima?: unknown } | null })) {
        await gravarEstado(videoJobId, i, { ...comHistorico, estado: "para-voce", motivo: motivoParaQuemEscolheu(parecer.motivo), desde: agora() });
        resultado.paraOCliente++;
        return;
      }

      // Terceira reprovação: vai ao cliente, com o motivo da Vera.
      if (refacoes >= MAX_REFACOES_DO_CORTE) {
        await gravarEstado(videoJobId, i, { ...comHistorico, estado: "para-voce", motivo: parecer.motivo, desde: agora() });
        resultado.paraOCliente++;
        return;
      }

      const vizinhos = trechos.filter((_, j) => j !== i);
      const limites = {
        depoisDe: Math.max(0, ...vizinhos.filter((v) => v.fim <= t.inicio + 0.5).map((v) => v.fim)),
        antesDe: Math.min(video.durationSec ?? Infinity, ...vizinhos.filter((v) => v.inicio >= t.fim - 0.5).map((v) => v.inicio)),
      };
      let ajuste: AjusteDasBordas | null = null;
      try {
        ajuste = await vitorAjustaBordas({
          palavras, inicio: t.inicio, fim: t.fim, parecer, titulo: t.texto?.titulo ?? t.titulo, ideia: t.ideia, limites, projectId: video.projectId,
          jaReprovados: comHistorico.historico
            .filter((h) => h.veredito === "REPROVADO" && !(h.inicio === t.inicio && h.fim === t.fim))
            .map((h) => ({ inicio: h.inicio, fim: h.fim, motivo: h.motivo })),
        });
      } catch (e) {
        console.error(`[revisao-do-corte][${videoJobId}] Vitor falhou no corte ${i}:`, e);
      }
      if (!ajuste) {
        await gravarEstado(videoJobId, i, { ...comHistorico, estado: "para-voce", motivo: parecer.motivo, desde: agora() });
        resultado.paraOCliente++;
        return;
      }

      const revisao: RevisaoDoCorte = {
        ...comHistorico,
        estado: "refazendo",
        refacoes: refacoes + 1,
        motivo: parecer.motivo,
        ajuste: ajuste.ajuste || null,
        desde: agora(),
      };
      await gravarEstado(videoJobId, i, revisao, {
        campos: { inicio: ajuste.inicio, fim: ajuste.fim, emPausa: true, transcricao: ajuste.transcricao, refacoes: refacoes + 1 },
        midia: { refazendo: true },
      });
      try {
        await enviarRecorteDoTrecho(
          {
            id: video.id,
            blobUrl: video.blobUrl,
            durationSec: video.durationSec ?? 0,
            projectId: video.projectId,
            palavras,
            estilo: video.project?.videoStyle ?? null,
            musicaUrl: video.project?.videoMusicUrl ?? null,
            termos: video.project?.videoTerms ?? null,
            escolha: video.project?.videoEstiloEscolha ?? null,
            colorPalette: video.project?.colorPalette ?? null,
          },
          { ...t, inicio: ajuste.inicio, fim: ajuste.fim, emPausa: true, transcricao: ajuste.transcricao },
          i
        );
        resultado.refazendo++;
      } catch (e) {
        // O worker recusou: devolve as bordas antigas (a mídia no ar é delas)
        // e leva ao cliente, dizendo o que houve.
        console.error(`[revisao-do-corte][${videoJobId}] recorte do corte ${i} recusado:`, e);
        await gravarEstado(
          videoJobId,
          i,
          { ...revisao, estado: "para-voce", motivo: `${parecer.motivo} O estúdio de vídeo não aceitou o recorte novo agora.`, desde: agora() },
          { campos: { inicio: t.inicio, fim: t.fim, emPausa: t.emPausa ?? false, transcricao: t.transcricao }, midia: { refazendo: false } }
        );
        resultado.paraOCliente++;
      }
    })
  );
  return resultado;
}

/**
 * RETOMA A REVISÃO QUE MORREU NO MEIO (30/09).
 *
 * A revisão só era disparada pelo callback do worker. Quando a função caía no
 * meio (prazo, falha de rede), o corte ficava "revisando" para sempre e ninguém
 * revisava: no teste de 30/09 os 4 cortes ficaram assim, e o corte com a borda
 * errada chegou ao Bruno sem a Vera ter lido. O cron da fila chama isto a cada
 * minuto; `revisarCortesDoVideo` só retoma o que está parado há mais de 10 min.
 */
export async function retomarRevisoesParadas(limite = 3): Promise<number> {
  const linhas = await prisma.$queryRaw<Array<{ id: string }>>`
    select id from video_jobs
    where "updatedAt" > now() - interval '2 days'
      and clips::jsonb @? '$[*] ? (@.revisaoDoCorte.estado == "revisando")'
    order by "updatedAt" desc
    limit ${limite}`;
  for (const { id } of linhas) {
    await revisarCortesDoVideo(id).catch((e) => console.error(`[revisao-do-corte][${id}] retomada falhou:`, e));
  }
  return linhas.length;
}
