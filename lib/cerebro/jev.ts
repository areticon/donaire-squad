import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import { cortar } from "@/lib/cerebro/montagem";
import { CRITERIO_DO_TEMA, ROTULO_DA_ESFERA, TEMAS, TETO_DE_CANDIDATAS, type NotaDoCerebro, type Tema } from "@/lib/cerebro/tipos";

/**
 * A LEITURA DA NOTA É DO JEV, NUNCA DO CLAUDE (06/10/2026).
 *
 * Regra do Bruno (05/10): "o Claude só escreve texto; toda decisão vai para o
 * JEV". Classificar a nota e ligá-la às outras é decisão. Um pedido só ao JEV,
 * com um estado só (a nota nova e as candidatas), responde:
 *
 *   tema        (choice) texto, arte, vídeo, tom, marca, publicação ou produto:
 *               é o que diz QUAIS agentes leem a nota no contexto;
 *   duradoura   (noul) é preferência que vale para as próximas peças, ou só um
 *               ajuste desta peça? Só a duradoura entra no prompt dos agentes;
 *   liga_<n>    (noul, uma por candidata) a nota nova e a candidata tratam do
 *               mesmo assunto? É a ligação que aparece no grafo.
 *
 * "NÃO SEI" É RESPOSTA: confiança baixa deixa o tema nulo, a duradoura nula
 * (não entra no prompt) e nenhuma ligação. Nada é ligado por padrão.
 *
 * `perguntar` é injetável para a prova rodar com o JEV trocado por respostas
 * fixas (scripts/testes/cerebro-0610.test.mts).
 */

export type Perguntar = typeof perguntarAoJev;

export type LeituraDaNota = {
  tema: Tema | null;
  duradoura: boolean | null;
  confianca: number | null;
  ligacoes: Array<{ para: string; confianca: number | null }>;
};

export const SEM_LEITURA: LeituraDaNota = { tema: null, duradoura: null, confianca: null, ligacoes: [] };

/** Acima disto o JEV disse "sim, é o mesmo assunto" com folga. */
export const PISO_DA_LIGACAO = 0.7;
/** Uma nota com mais ligações que isto vira um novelo no grafo. */
export const MAXIMO_DE_LIGACOES = 5;
const CONFIANCA_MINIMA_DO_TEMA = 0.5;

/** As esferas em que a nota pode ser uma preferência duradoura (as outras são estado ou material). */
const ESFERAS_COM_PREFERENCIA = new Set(["pedidos", "recusas", "decisoes", "feedback"]);

/**
 * As candidatas que o JEV compara com a nota nova. Código, não decisão: as
 * regras e o tom sempre (é contra eles que um pedido novo mais se liga), depois
 * as da mesma esfera, depois as mais recentes. Nota da MESMA PEÇA fica de fora:
 * essa ligação é fato do banco e já existe sem o JEV.
 */
export function escolherCandidatas(nova: NotaDoCerebro, todas: NotaDoCerebro[], teto = TETO_DE_CANDIDATAS): NotaDoCerebro[] {
  const pecas = new Set(nova.pecas);
  const elegiveis = todas
    .filter((n) => n.id !== nova.id && n.fonte !== "projeto" && n.fonte !== "esfera" && !n.id.startsWith("esfera:") && n.id !== "projeto")
    .filter((n) => !n.pecas.some((p) => pecas.has(p)))
    .sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? ""));
  const escolhidas: NotaDoCerebro[] = [];
  const por = (f: (n: NotaDoCerebro) => boolean, ate: number) => {
    for (const n of elegiveis) {
      if (escolhidas.length >= teto || ate <= 0) return;
      if (f(n) && !escolhidas.includes(n)) {
        escolhidas.push(n);
        ate--;
      }
    }
  };
  por((n) => n.esfera === "regras" || n.esfera === "tom", 10);
  por((n) => n.esfera === nova.esfera, 10);
  por(() => true, teto);
  return escolhidas.slice(0, teto);
}

/** O estado que o JEV lê. Sem nome nem e-mail do cliente: só o conteúdo das notas. */
export function estadoDaNota(nova: NotaDoCerebro, candidatas: NotaDoCerebro[]): Record<string, unknown> {
  return {
    contexto:
      "Uma plataforma que produz posts, artes e vídeos para um cliente guarda a memória de tudo o que ele pede, aprova, recusa e decide, em notas ligadas entre si. Chegou uma nota nova: é preciso saber o tema dela, se ela é uma preferência que deve guiar as próximas peças, e com quais notas antigas ela se liga.",
    nota_nova: {
      esfera: nova.esfera ? ROTULO_DA_ESFERA[nova.esfera] : "sem esfera",
      titulo: nova.titulo,
      texto: cortar(nova.texto, 1500),
      ...(nova.tags.length ? { etiquetas: nova.tags.slice(0, 8) } : {}),
    },
    notas_existentes: candidatas.map((c, i) => ({
      numero: i,
      esfera: c.esfera ? ROTULO_DA_ESFERA[c.esfera] : "sem esfera",
      titulo: c.titulo,
      texto: cortar(c.texto, 240),
    })),
  };
}

/** As perguntas do lote. A da duradoura só nas esferas em que o cliente diz um gosto. */
export function perguntasDaNota(nova: NotaDoCerebro, candidatas: NotaDoCerebro[]): Record<string, PerguntaDoJev> {
  const perguntas: Record<string, PerguntaDoJev> = {
    tema: {
      type: "choice",
      instructions: "Leia `nota_nova`. De que ela trata, principalmente? Escolha o tema que diz qual parte do trabalho a nota deve orientar.",
      criteria: Object.fromEntries(TEMAS.map((t) => [t, CRITERIO_DO_TEMA[t]])),
    },
  };
  if (nova.esfera && ESFERAS_COM_PREFERENCIA.has(nova.esfera)) {
    perguntas.duradoura = {
      type: "noul",
      instructions:
        "A `nota_nova` mostra uma preferência, um limite ou um jeito de fazer do cliente que deve valer também para as PRÓXIMAS peças (por exemplo: \"não use emoji\", \"sempre termine com uma pergunta\", \"essa cor não combina com a marca\")? Responda não quando é só um ajuste desta peça (\"troque a palavra X por Y neste post\"), uma dúvida ou um defeito da plataforma.",
    };
  }
  candidatas.forEach((c, i) => {
    perguntas[`liga_${i}`] = {
      type: "noul",
      instructions: `Compare \`nota_nova\` com a nota de \`notas_existentes\` de número ${i} ("${cortar(c.titulo, 80)}"). As duas tratam do MESMO assunto (a mesma preferência, a mesma regra, o mesmo problema, o mesmo tipo de pedido) ou uma explica a outra? Responda não quando só dividem uma palavra ou o mesmo cliente.`,
    };
  });
  return perguntas;
}

/** Lê as respostas com a margem de "não sei". Pura, para a prova. */
export function lerLeitura(respostas: Record<string, RespostaDoJev>, candidatas: NotaDoCerebro[]): LeituraDaNota {
  const rt = respostas.tema;
  const escolha = decidirChoice(rt, TEMAS, "__nao_sei__" as unknown as Tema, CONFIANCA_MINIMA_DO_TEMA);
  const tema = (TEMAS as readonly string[]).includes(escolha) ? escolha : null;
  const confianca = rt && rt.type === "choice" && typeof rt.confidence === "number" ? rt.confidence : null;

  const pd = probabilidadeDeSim(respostas.duradoura);
  const duradoura = pd === null ? null : pd >= 0.65 ? true : pd <= 0.35 ? false : null;

  const ligacoes = candidatas
    .map((c, i) => ({ para: c.id, confianca: probabilidadeDeSim(respostas[`liga_${i}`]) }))
    .filter((l): l is { para: string; confianca: number } => l.confianca !== null && l.confianca >= PISO_DA_LIGACAO)
    .sort((a, b) => b.confianca - a.confianca)
    .slice(0, MAXIMO_DE_LIGACOES);

  return { tema, duradoura, confianca, ligacoes };
}

/** Lê a nota pelo JEV. Com o JEV desligado ou em falha, devolve SEM_LEITURA (a nota fica, sem leitura). */
export async function lerNotaPeloJev(p: { nova: NotaDoCerebro; todas: NotaDoCerebro[]; projectId: string; perguntar?: Perguntar }): Promise<LeituraDaNota & { lida: boolean }> {
  const perguntar = p.perguntar ?? perguntarAoJev;
  if (!jevLigado() || !p.nova.texto.trim()) return { ...SEM_LEITURA, lida: false };
  const candidatas = escolherCandidatas(p.nova, p.todas);
  try {
    const respostas = await perguntar({ projectId: p.projectId, etapa: "cerebro-do-cliente", state: estadoDaNota(p.nova, candidatas) }, perguntasDaNota(p.nova, candidatas));
    return { ...lerLeitura(respostas, candidatas), lida: true };
  } catch (e) {
    console.warn("[cerebro] JEV falhou (a nota fica sem leitura):", e instanceof Error ? e.message : e);
    return { ...SEM_LEITURA, lida: false };
  }
}
