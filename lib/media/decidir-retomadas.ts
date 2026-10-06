import { askClaude } from "@/lib/claude";
import { jevLigado, perguntarAoJev, probabilidadeDeSim, usoVazio, type PerguntaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
import type { Remocao } from "@/lib/media/edicao";
import { candidatosDeRetomada, chave, ecoDaPalavra, provaDeRetomada, tentativaIncompletaRefeita, textoDe, type CandidatoDeRetomada } from "@/lib/media/retomadas";
import type { Word } from "@/lib/media/transcribe";

/**
 * A FRASE ERRADA E O RETAKE (03/10/2026), a parte que DECIDE.
 *
 * O código (`retomadas.ts`) acha os candidatos; aqui o JEV lê cada um com a
 * parte candidata entre [[ ]] dentro da fala e responde, em lote:
 *
 *   r: a parte marcada é uma tentativa que a pessoa abandonou e disse de novo?
 *   c: o que ela é (refez, hesitação, lista, ênfase, conteúdo)?
 *
 * ## O que a medição mandou (03/10, 59 candidatos julgados um a um)
 *
 * O JEV sozinho NÃO dá conta desta decisão: a melhor regra só com ele acertou
 * 2 das 11 tomadas erradas (com 0 cortes errados), e as regras mais soltas
 * cortavam fala boa na mesma proporção em que acertavam. Ele é ótimo nas
 * pontas: quando diz "refez" acima de 0,7 está certo, e quando diz "não" com
 * confiança quase nunca erra. Então:
 *
 * - JEV corta o que é certo (r >= 0,7).
 * - JEV descarta o que é certo (r <= 0,3, escolha longe de "refez" e
 *   confiança >= 0,5). É a maior parte dos candidatos.
 * - O meio vai ao Claude numa chamada só, com exemplos reais do que sai e do
 *   que fica (lista, ênfase, reformulação). O JEV fora do ar manda tudo ao
 *   Claude. Na dúvida que sobra, NÃO corta.
 *
 * ## O JEV DECIDE TUDO (06/10, tarde; regra do Bruno de 05/10: "deixe LLM
 * somente para texto que precisa ser criado, não escolhas, decisões, nada")
 *
 * Desde 06/10 o Claude não decide mais nada aqui, nem a dúvida:
 * - a dúvida do JEV não corta (a tomada repetida é defeito pequeno, a frase
 *   boa apagada é defeito grande); na GUARDA DA SAÍDA, onde a regra do Bruno
 *   é "na dúvida corte a tentativa incompleta", corta quando o próprio JEV
 *   pende para "refez" (r >= 0,5 e refez ou hesitação >= 0,5), sempre com a
 *   prova em código por cima;
 * - o JEV fora do ar não chama o Claude: sai só o que o código prova;
 * - a muleta vai ao JEV por padrão (antes, LIMPEZA_PELO_JEV=1 era preciso).
 * LIMITE CONHECIDO, sem suavizar: na medição de 03/10 o JEV sozinho acertou 2
 * das 11 tomadas erradas (o Claude desempatava o meio) e cortou 18 muletas
 * contra 47 do Claude no vídeo de 19 min. Os interruptores abaixo devolvem o
 * Claude se a primeira gravação real mostrar a falta.
 *
 * ## Interruptores
 * - RETOMADAS_LIGADAS=0: desliga a detecção inteira (volta ao 02/10).
 * - RETOMADAS_PELO_JEV=0: decide tudo no Claude (o caminho de antes de 03/10).
 * - RETOMADAS_DUVIDA_NO_CLAUDE=1: a dúvida do JEV e a queda dele voltam ao Claude (o caminho de 03/10 a 06/10).
 * - LIMPEZA_PELO_JEV=0: a muleta volta ao Claude.
 */

export type DecisaoDeRetomada = CandidatoDeRetomada & {
  inicio: number;
  fim: number;
  cortado: string;
  fica: string;
  /** "Refez?" do JEV (0 a 1) e a escolha dele, para o relatório. */
  r: number | null;
  escolha: string | null;
  quem: "codigo" | "jev" | "claude" | "nenhum" | "codigo+veto" | "jev+veto" | "claude+veto";
  corta: boolean;
};

export type ResultadoDasRetomadas = {
  remocoes: Remocao[];
  decisoes: DecisaoDeRetomada[];
  uso: UsoDoJev;
  claudeChamadas: number;
  ms: number;
};

export function retomadasLigadas(): boolean {
  return process.env.RETOMADAS_LIGADAS !== "0";
}

/** O Claude só decide retomada com o interruptor explícito (06/10, tarde). */
export function claudeNasRetomadas(): { tudo: boolean; duvida: boolean } {
  return { tudo: process.env.RETOMADAS_PELO_JEV === "0", duvida: process.env.RETOMADAS_DUVIDA_NO_CLAUDE === "1" };
}

/** A muleta é do JEV por padrão (06/10, tarde); LIMPEZA_PELO_JEV=0 devolve ao Claude. */
export function limpezaNoClaude(): boolean {
  return process.env.LIMPEZA_PELO_JEV === "0";
}

/**
 * A DÚVIDA DO JEV, decidida pelo próprio JEV (06/10, tarde): fora da guarda
 * da saída, a dúvida não corta. Na guarda (`naDuvidaCorta`), corta quando ele
 * pende para "refez": r >= 0,5 e refez + hesitação >= 0,5. A prova em código
 * (`provaDeRetomada`) ainda veta depois. Puro, para a prova.
 */
export function cortaNaDuvida(r: number | null, pRefez: number | null, naDuvidaCorta: boolean): boolean {
  if (!naDuvidaCorta || r === null || pRefez === null) return false;
  return r >= 0.5 && pRefez >= 0.5;
}

const CORTA_R = 0.7;
const DESCARTA_R = 0.3;
const DESCARTA_REFEZ = 0.25;
const DESCARTA_CONFIANCA = 0.5;
const CANDIDATOS_POR_ESTADO = 20;

/** Roda as tarefas com no máximo `n` ao mesmo tempo (o JEV pede backoff acima disso). */
async function emPoucos(tarefas: Array<() => Promise<void>>, n = 3): Promise<void> {
  let proxima = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tarefas.length) }, async () => {
      while (proxima < tarefas.length) await tarefas[proxima++]();
    })
  );
}

/**
 * A fala com o candidato entre [[ ]]. Medido em 03/10: com o trecho marcado
 * dentro da fala, o JEV separou melhor do que com "primeira versão" e
 * "segunda versão" em campos separados.
 */
function falaMarcada(p: Word[], c: { de: number; ate: number }): string {
  return `${textoDe(p, c.de - 14, c.de - 1)} [[${textoDe(p, c.de, c.ate)}]] ${textoDe(p, c.ate + 1, c.ate + 16)}`.trim();
}

const ESCOLHAS = {
  refez: "tentativa errada ou interrompida que a pessoa repete ou corrige logo depois",
  hesitacao: "palavras soltas ou hesitação antes de a frase sair",
  lista: "um item de uma lista ou paralelismo de propósito",
  enfase: "repetição de propósito para dar ênfase",
  conteudo: "parte necessária da frase, que não se repete",
};

const SISTEMA_CLAUDE = `Você é editor de vídeo. A pessoa gravou falando de uma vez, sem roteiro, e às vezes erra uma frase e diz de novo. Você decide, para cada trecho marcado entre [[ ]], se ele SAI da edição.

SAI (true) só quando a parte entre [[ ]] é uma tentativa que a pessoa abandonou e DISSE DE NOVO logo depois, de modo que, se ficar, o espectador ouve a mesma frase duas vezes. Exemplos (inventados, para mostrar o padrão):
- "hoje eu [[Hoje eu quero falar sobre o, o processo de,]] hoje eu quero falar sobre o processo de vendas" -> true
- "[[porque o caixa é o que é o que faz, é a,]] porque o caixa é o que sustenta a empresa" -> true
- "[[O cliente pagou em março,]] o cliente pagou em abril, e aí a conta fechou" -> true (corrigiu a palavra)

FICA (false):
- Lista ou paralelismo: "o problema [[é o preço alto,]] é o prazo longo, é o suporte fraco" -> false
- Ênfase ou pergunta retórica repetida: "[[Você quer crescer?]] Você quer vender mais?" -> false
- Começo de ideia que continua: "[[Então é você organizar,]] separar o que importa do resto" -> false
- Explicação que reformula de propósito: "[[vender e entregar.]] Vender no sentido de convencer" -> false
- Qualquer coisa que tire informação que não é dita de novo.

Na dúvida, false: a tomada repetida é um defeito pequeno; a frase boa apagada é um defeito grande.

Responda SOMENTE com JSON válido, sem cercas de código: {"r":{"<id>":true,"<id2>":false}}`;

/** O modelo que desempata a dúvida do JEV (RETOMADAS_MODELO troca). */
const MODELO_DO_DESEMPATE = "claude-opus-5";

/**
 * Na GUARDA DA SAÍDA (03/10), a regra da dúvida vira para o outro lado, pelo
 * critério do Bruno: "na dúvida entre deixar uma frase repetida e cortar,
 * corte a tentativa incompleta (a repetição é o erro que o cliente vê)". Ali a
 * fala já passou por toda a limpeza; o que sobra repetido é defeito.
 */
const DUVIDA_NA_SAIDA = `

ATENÇÃO, esta é a conferência do vídeo PRONTO: a fala já foi limpa uma vez. Aqui a regra da dúvida muda: se a parte marcada é uma frase que ficou pela metade e a pessoa recomeçou a MESMA frase logo depois, responda true mesmo na dúvida. Lista, ênfase e informação que não volta continuam false.`;

async function decidirNoClaude(p: Word[], cands: CandidatoDeRetomada[], projectId?: string | null, naDuvidaCorta = false): Promise<Map<string, boolean>> {
  const saida = new Map<string, boolean>();
  if (!cands.length) return saida;
  const bruto = await askClaude(naDuvidaCorta ? SISTEMA_CLAUDE + DUVIDA_NA_SAIDA : SISTEMA_CLAUDE, JSON.stringify({ trechos: cands.map((c) => ({ id: c.id, fala: falaMarcada(p, c) })) }), {
    maxTokens: 4000,
    model: process.env.RETOMADAS_MODELO || MODELO_DO_DESEMPATE,
    effort: (process.env.RETOMADAS_ESFORCO as "low" | "medium" | undefined) || "low",
    timeoutMs: 120_000,
    usage: { projectId: projectId ?? undefined, operation: "video_retomada" },
  });
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const dados = JSON.parse(limpo) as { r?: Record<string, boolean> };
  for (const [id, v] of Object.entries(dados.r ?? {})) saida.set(id, v === true);
  return saida;
}

/**
 * Acha, decide e devolve as remoções das tentativas erradas. Nunca lança:
 * falhou tudo, devolve lista vazia (o vídeo sai como sairia em 02/10).
 */
export async function decidirRetomadas(
  p: Word[],
  ctx: {
    projectId?: string | null;
    /** A guarda da saída (lib/media/guarda-da-fala.ts): a dúvida corta a tentativa incompleta. */
    naDuvidaCorta?: boolean;
  } = {}
): Promise<ResultadoDasRetomadas> {
  const t0 = Date.now();
  const uso = usoVazio();
  const vazio: ResultadoDasRetomadas = { remocoes: [], decisoes: [], uso, claudeChamadas: 0, ms: 0 };
  if (!retomadasLigadas() || p.length < 10) return vazio;

  const cands = candidatosDeRetomada(p);
  if (!cands.length) return { ...vazio, ms: Date.now() - t0 };
  const decisoes: DecisaoDeRetomada[] = cands.map((c) => ({
    ...c,
    inicio: p[c.de].start,
    fim: p[c.ate].end,
    cortado: textoDe(p, c.de, c.ate),
    fica: textoDe(p, c.ate + 1, c.ate + 12),
    r: null,
    escolha: null,
    quem: "nenhum",
    corta: false,
  }));

  // 0. A CERTEZA POR CÓDIGO (03/10, o vídeo que o Bruno recebeu): frase
  // interrompida seguida da MESMA frase recomeçada sai sem perguntar a
  // ninguém. "E eu evitei usar a palavra, e eu evitei usar a palavra
  // produtividade": a primeira é prefixo exato da segunda, não fecha a frase,
  // e a segunda continua. Lista não passa (o item muda), ênfase não passa (a
  // segunda não continua), e a prova de baixo ainda confere.
  const paraDecidir: DecisaoDeRetomada[] = [];
  for (const c of decisoes) {
    // O eco da palavra (05/10, `ecoDaPalavra`) também é certeza: a cópia solta
    // repete a palavra que acabou de ser dita.
    if (tentativaIncompletaRefeita(p, c) || (c.tipo === "eco" && ecoDaPalavra(p, c.de))) {
      c.quem = "codigo";
      c.corta = true;
    } else paraDecidir.push(c);
  }

  // 1. O JEV, em lote: corta o que é certo, descarta o que é certo.
  const duvida: DecisaoDeRetomada[] = [];
  const pRefezDe = new Map<string, number>();
  const claude = claudeNasRetomadas();
  const peloJev = jevLigado() && !claude.tudo;
  if (peloJev && paraDecidir.length) {
    try {
      await emPoucos(
        Array.from({ length: Math.ceil(paraDecidir.length / CANDIDATOS_POR_ESTADO) }, (_, n) => async () => {
          const lote = paraDecidir.slice(n * CANDIDATOS_POR_ESTADO, (n + 1) * CANDIDATOS_POR_ESTADO);
          const state = {
            contexto:
              "Fala transcrita de um vídeo gravado de uma vez, sem roteiro, em português. Em cada item de `trechos`, a parte entre [[ ]] é candidata a sair da edição.",
            trechos: lote.map((c) => ({ id: c.id, fala: falaMarcada(p, c) })),
          };
          const perguntas: Record<string, PerguntaDoJev> = {};
          for (const c of lote) {
            perguntas[`r:${c.id}`] = {
              type: "noul",
              instructions: `No trecho de id "${c.id}", a parte entre [[ ]] é uma tentativa que a pessoa abandonou e DISSE DE NOVO logo depois (fica sobrando, o espectador ouviria a mesma frase duas vezes), ou um falso começo? Responda não se for item de lista, repetição de ênfase de propósito, ou parte que a frase precisa.`,
            };
            perguntas[`c:${c.id}`] = { type: "choice", instructions: `No trecho de id "${c.id}", o que é a parte entre [[ ]]?`, criteria: { ...ESCOLHAS } };
          }
          const r = await perguntarAoJev({ projectId: ctx.projectId, etapa: "retomadas", state, uso }, perguntas);
          for (const c of lote) {
            c.r = probabilidadeDeSim(r[`r:${c.id}`]);
            const esc = r[`c:${c.id}`];
            if (c.r === null || !esc || esc.type !== "choice") {
              duvida.push(c);
              continue;
            }
            const pRefez = (esc.probabilities?.refez ?? 0) + (esc.probabilities?.hesitacao ?? 0);
            pRefezDe.set(c.id, pRefez);
            c.escolha = `${esc.choice} ${(esc.confidence ?? 0).toFixed(2)}`;
            if (c.r >= CORTA_R) {
              c.quem = "jev";
              c.corta = true;
            } else if (c.r <= DESCARTA_R && pRefez <= DESCARTA_REFEZ && (esc.confidence ?? 0) >= DESCARTA_CONFIANCA) {
              c.quem = "jev";
              c.corta = false;
            } else duvida.push(c);
          }
        })
      );
    } catch (e) {
      console.error(`[retomadas] JEV falhou; ${claude.duvida ? "tudo vai ao Claude" : "sai só o que o código prova"}:`, e instanceof Error ? e.message : e);
      duvida.length = 0;
      pRefezDe.clear();
      for (const c of paraDecidir) {
        c.quem = "nenhum";
        c.corta = false;
        c.r = null;
        duvida.push(c);
      }
    }
  } else if (!peloJev) {
    duvida.push(...paraDecidir);
  }

  // 2. A DÚVIDA (06/10, tarde): decidida pelo JEV, pela leitura que ele já deu.
  // O Claude só entra com o interruptor explícito (ou com tudo no Claude).
  let claudeChamadas = 0;
  const comClaude = claude.tudo || claude.duvida;
  if (!comClaude) {
    for (const c of duvida) {
      if (cortaNaDuvida(c.r, pRefezDe.get(c.id) ?? null, Boolean(ctx.naDuvidaCorta))) {
        c.quem = "jev";
        c.corta = true;
      }
    }
  }
  for (let i = 0; comClaude && i < duvida.length; i += 40) {
    const lote = duvida.slice(i, i + 40);
    try {
      claudeChamadas++;
      const r = await decidirNoClaude(p, lote, ctx.projectId, ctx.naDuvidaCorta);
      for (const c of lote) {
        c.quem = "claude";
        c.corta = r.get(c.id) === true;
      }
    } catch (e) {
      console.error("[retomadas] Claude falhou, a dúvida fica sem corte:", e instanceof Error ? e.message : e);
    }
  }

  // 3. A prova em código: corte que tira ideia que não volta é recusado,
  // venha de quem vier (ver `provaDeRetomada`).
  for (const c of decisoes) {
    // Falso começo sem palavra repetida não tem prova de texto; vale a
    // leitura do JEV: só sai se ele o classificou como refez ou hesitação
    // ("em Isaías," e "ele" saíam no Claude e eram conteúdo, 03/10).
    const semLeitura = c.tipo === "falso-comeco" && c.escolha !== null && !/^(refez|hesitacao) /.test(c.escolha);
    // O eco tem a prova para TRÁS (a palavra veio logo antes), e não para frente.
    const provado = c.tipo === "eco" ? ecoDaPalavra(p, c.de) : provaDeRetomada(p, c.de, c.ate);
    if (c.corta && (semLeitura || !provado)) {
      c.corta = false;
      c.quem = `${c.quem}+veto` as DecisaoDeRetomada["quem"];
    }
  }

  // 4. Sobreposição: fica o candidato mais forte, e os que encostam nele saem.
  const sim = decisoes.filter((c) => c.corta).sort((a, b) => (b.r ?? 0.8) - (a.r ?? 0.8) || b.ate - b.de - (a.ate - a.de));
  const escolhidos: DecisaoDeRetomada[] = [];
  for (const c of sim) {
    if (escolhidos.some((x) => !(c.ate < x.de || c.de > x.ate))) {
      c.corta = false;
      continue;
    }
    escolhidos.push(c);
  }

  // 5. Remoção no tempo: do começo da tentativa até o começo da tomada boa.
  // As bordas caem no silêncio depois, em `emendarNoSilencio`.
  const remocoes: Remocao[] = escolhidos
    .sort((a, b) => a.de - b.de)
    .map((c) => {
      const ate = p[c.ate + 1] ? p[c.ate + 1].start : p[c.ate].end;
      const texto = c.cortado.length > 70 ? `${c.cortado.slice(0, 67)}...` : c.cortado;
      return { de: p[c.de].start, ate, motivo: `tomada refeita: "${texto}"` };
    });

  return { remocoes, decisoes, uso, claudeChamadas, ms: Date.now() - t0 };
}

// ───────────────────────── a muleta pelo JEV ─────────────────────────

/**
 * Muletas que dependem de LEITURA ("é" verbo ou hesitação, "então" consequência
 * ou enfeite). As garantidas por código ("né", "tá?", sons) já saem em
 * `detectarMuletasArrastadas`.
 */
const AMBIGUAS = new Set(["e", "entao", "ai", "assim", "bom", "cara", "olha", "enfim", "sabe", "beleza", "ah", "eh", "o", "tipo"]);

/**
 * A limpeza de muleta com o JEV decidindo palavra por palavra. Devolve os
 * cortes no formato de `detectarHesitacao` (índices de palavra), ou `null`
 * quando o JEV não está disponível ou falhou (quem chama cai no Claude).
 */
export async function muletasPeloJev(
  palavras: Word[],
  ctx: { projectId?: string | null; uso?: UsoDoJev } = {}
): Promise<Array<{ de: number; ate: number; motivo: string }> | null> {
  if (!jevLigado() || limpezaNoClaude()) return null;
  const itens: Array<{ de: number; ate: number; gaguejo?: boolean }> = [];
  palavras.forEach((w, i) => {
    const k = chave(w.word);
    if (!AMBIGUAS.has(k)) return;
    // "e" conjunção sem acento não é candidato; só "é" (verbo ou hesitação).
    if (k === "e" && !/é/i.test(w.word)) return;
    // "o" só quando solto com vírgula (o "o, o ponto é").
    if (k === "o" && !/,/.test(w.word)) return;
    itens.push({ de: i, ate: i });
  });
  // "vamos lá" de gravador.
  palavras.forEach((w, i) => {
    if (chave(w.word) === "vamos" && palavras[i + 1] && chave(palavras[i + 1].word) === "la") itens.push({ de: i, ate: i + 1 });
  });
  // GAGUEIRA CURTA com vírgula: "esse é o, é o foco", "pro meu, pro meu
  // comércio", "o a o a intento". `detectarRepeticoes` deixa passar quando a
  // primeira cópia fecha com vírgula (lá isso é retórica), e o Claude pegava
  // por leitura; aqui o JEV lê. Sai a primeira cópia.
  const k = palavras.map((w) => chave(w.word));
  for (let i = 0; i < k.length; i++) {
    for (const m of [2, 3]) {
      if (i + 2 * m > k.length || !k[i]) continue;
      const a = k.slice(i, i + m).join(" ");
      if (a === k.slice(i + m, i + 2 * m).join(" ") && !itens.some((t) => t.de === i)) itens.push({ de: i, ate: i + m - 1, gaguejo: true });
    }
  }
  if (!itens.length) return [];

  const uso = ctx.uso ?? usoVazio();
  const decididos: Array<{ de: number; ate: number; motivo: string }> = [];
  try {
    await emPoucos(
      Array.from({ length: Math.ceil(itens.length / 40) }, (_, n) => async () => {
        const lote = itens.slice(n * 40, (n + 1) * 40);
        const state = {
          contexto:
            "Trechos de uma fala transcrita em português. Em cada item de `trechos`, a palavra ou expressão entre [[ ]] é candidata a sair da edição por ser muleta ou hesitação.",
          trechos: lote.map((t) => ({ id: `m${t.de}`, texto: falaMarcada(palavras, t) })),
        };
        const perguntas: Record<string, PerguntaDoJev> = {};
        for (const t of lote) {
          perguntas[`m${t.de}`] = {
            type: "noul",
            instructions: t.gaguejo
              ? `No trecho de id "m${t.de}", o que está entre [[ ]] é gagueira (a pessoa disse as mesmas palavras duas vezes sem querer, e a segunda vez vem logo depois) e pode sair sem mudar o que a frase diz? Repetição de propósito, para dar ênfase, fica.`
              : `No trecho de id "m${t.de}", o que está entre [[ ]] é muleta ou hesitação (não acrescenta sentido) e pode sair sem quebrar a gramática nem mudar o que a frase diz? Verbo ("isso é caro"), consequência ("então voltei") e tempo ("aí eu voltei") ficam.`,
          };
        }
        const r = await perguntarAoJev({ projectId: ctx.projectId, etapa: "limpeza-muletas", state, uso }, perguntas);
        for (const t of lote) {
          const s = probabilidadeDeSim(r[`m${t.de}`]);
          // Na dúvida, fica: muleta que ficou é detalhe, frase quebrada é defeito.
          if (s !== null && s >= 0.75) decididos.push({ de: t.de, ate: t.ate, motivo: t.gaguejo ? "gagueira" : "muleta" });
        }
      })
    );
  } catch (e) {
    // O JEV fora do ar não chama o Claude (06/10, tarde): a muleta fica, e as garantidas por código já saíram.
    console.error("[limpeza] JEV falhou, as muletas ambíguas ficam nesta passada:", e instanceof Error ? e.message : e);
    return [];
  }
  return decididos.sort((a, b) => a.de - b.de);
}
