import { jevLigado, perguntarAoJev, probabilidadeDeSim, usoVazio, type PerguntaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
import { blocoDasRegrasDoProjeto } from "@/lib/referencias/regras";

/**
 * A VERA DECIDE PELO JEV (03/10/2026).
 *
 * A Vera (gerente do time) aprova ou reprova as peças antes de chegarem ao
 * cliente. Nos últimos 30 dias ela custou US$ 37,70 em 430 chamadas de Opus e
 * Sonnet (o maior gasto de decisão da casa). Decisão do Bruno: tudo que é
 * decisão vai para o JEV; o Claude só escreve quando há MOTIVO para escrever.
 *
 * Duas portas, as duas com o mesmo princípio (o JEV só decide o que é certo,
 * a dúvida continua no Claude como antes):
 *
 * 1. `veraAprovaPeloJev`, a PRIMEIRA revisão: as regras do projeto (nicho,
 *    público, voz, regras aprovadas pelo cliente, dados pesquisados) são o
 *    estado, e cada peça recebe cinco perguntas. Tudo passando com folga, a
 *    Vera aprova sem chamar o Claude (não há motivo a escrever). Qualquer
 *    falha ou dúvida: o Claude revisa e escreve o parecer, como antes.
 * 2. `veraConfereCorrecaoPeloJev`, a SEGUNDA revisão (depois da correção do
 *    squad): o parecer anterior vira itens, e o JEV responde item a item se
 *    foi resolvido, mais uma pergunta de "tem algo que não pode ir ao ar?".
 *    Tudo resolvido com folga: aprovado sem Claude. É a revisão mais repetida
 *    da campanha (até 2 voltas por dia) e é pura conferência.
 *
 * Interruptor: VERA_PELO_JEV=0 volta tudo ao Claude.
 */

export function veraPeloJevLigada(): boolean {
  return jevLigado() && process.env.VERA_PELO_JEV !== "0";
}

export type PecaParaVera = { id: string; rede: string; tipo: string; texto: string };

export type DecisaoDaVera = {
  decisao: "aprova" | "duvida";
  /** Por peça e critério, a probabilidade que o JEV deu (relatório e prova). */
  notas: Record<string, number | null>;
  /** O que impediu a aprovação, em linguagem de gente (log). */
  porque: string[];
  uso: UsoDoJev;
  ms: number;
};

/**
 * Os critérios da primeira revisão. `bom` diz para que lado o "sim" aponta e
 * `limite` é a folga exigida para aprovar sem Claude. Limiares altos de
 * propósito: aprovar sem ler custa uma peça ruim no ar; ficar em dúvida custa
 * só a chamada de antes.
 */
const CRITERIOS: Array<{ k: string; bom: "sim" | "nao"; limite: number; pergunta: (id: string) => string }> = [
  {
    k: "pronto",
    bom: "sim",
    limite: 0.75,
    pergunta: (id) =>
      `A peça de id "${id}" em \`pecas\` está pronta para publicar como está: texto completo e coeso, em português do Brasil, sem frase quebrada, sem lixo de transcrição, sem marcador vazado ("Post 1", colchetes, instrução de bastidor como "segue a versão corrigida")?`,
  },
  {
    k: "nicho",
    bom: "sim",
    limite: 0.7,
    pergunta: (id) => `A peça de id "${id}" em \`pecas\` fala com o público e com o nicho descritos em \`projeto\`, e não de forma genérica?`,
  },
  {
    k: "regras",
    bom: "sim",
    limite: 0.7,
    pergunta: (id) =>
      `A peça de id "${id}" em \`pecas\` respeita a voz da marca e todas as regras de \`projeto\` (inclusive as regras aprovadas pelo cliente e os nomes que não podem ser citados)?`,
  },
  {
    k: "dado",
    bom: "nao",
    limite: 0.25,
    pergunta: (id) =>
      `A peça de id "${id}" em \`pecas\` traz alguma estatística, número de pesquisa ou afirmação factual que NÃO tem fonte citada e NÃO está em \`dados_pesquisados\`?`,
  },
  {
    k: "rede",
    bom: "sim",
    limite: 0.65,
    pergunta: (id) => `A peça de id "${id}" em \`pecas\` está adequada à rede dela (tamanho, formato, hashtags e chamada para ação fazem sentido ali)?`,
  },
];

async function estadoDoProjeto(p: {
  projectId: string;
  nome?: string | null;
  nicho?: string | null;
  publico?: string | null;
  voz?: string | null;
  naoCitar?: string[];
}): Promise<Record<string, string>> {
  const regras = await blocoDasRegrasDoProjeto(p.projectId, ["roteiro", "redacao"]).catch(() => "");
  return {
    nome: p.nome ?? "",
    nicho: p.nicho ?? "não informado",
    publico: p.publico ?? "não informado",
    voz: p.voz ?? "não informada",
    regras_aprovadas_pelo_cliente: regras.slice(0, 4000) || "(nenhuma)",
    nao_citar: p.naoCitar?.length ? p.naoCitar.join(", ") : "(nenhum)",
    hoje: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
  };
}

/** Primeira revisão: aprova sem Claude quando todas as peças passam com folga. */
export async function veraAprovaPeloJev(p: {
  projectId: string;
  projeto: { nome?: string | null; nicho?: string | null; publico?: string | null; voz?: string | null; naoCitar?: string[] };
  pecas: PecaParaVera[];
  dadosPesquisados?: string;
  etapa?: string;
}): Promise<DecisaoDaVera> {
  const t0 = Date.now();
  const uso = usoVazio();
  const notas: Record<string, number | null> = {};
  const porque: string[] = [];
  if (!p.pecas.length) return { decisao: "duvida", notas, porque: ["sem peças"], uso, ms: 0 };
  const state = {
    contexto: "Peças de conteúdo de um dia, prontas para ir às redes de um cliente. Você é a revisora de qualidade antes de chegar ao cliente.",
    projeto: await estadoDoProjeto({ projectId: p.projectId, ...p.projeto }),
    dados_pesquisados: (p.dadosPesquisados ?? "").slice(0, 3000) || "(nenhum)",
    pecas: p.pecas.map((x) => ({ id: x.id, rede: x.rede, tipo: x.tipo, texto: x.texto.slice(0, 3500) })),
  };
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const x of p.pecas) for (const c of CRITERIOS) perguntas[`${c.k}:${x.id}`] = { type: "noul", instructions: c.pergunta(x.id) };
  const r = await perguntarAoJev({ projectId: p.projectId, etapa: p.etapa ?? "vera", state, uso }, perguntas);
  for (const x of p.pecas) {
    for (const c of CRITERIOS) {
      const s = probabilidadeDeSim(r[`${c.k}:${x.id}`]);
      notas[`${c.k}:${x.id}`] = s;
      const passou = s !== null && (c.bom === "sim" ? s >= c.limite : s <= c.limite);
      if (!passou) porque.push(`${x.rede} (${x.tipo}): ${c.k} ${s === null ? "sem resposta" : s.toFixed(2)}`);
    }
  }
  return { decisao: porque.length ? "duvida" : "aprova", notas, porque, uso, ms: Date.now() - t0 };
}

/**
 * Os itens de um parecer: linhas numeradas ("1. ...") e blocos "Post N".
 * Item curto demais ou de elogio não conta.
 */
export function itensDoParecer(parecer: string): string[] {
  const linhas = parecer.replace(/\r/g, "").split("\n");
  const itens: string[] = [];
  let atual = "";
  const fecha = () => {
    const t = atual.trim();
    if (t.length > 20) itens.push(t.slice(0, 600));
    atual = "";
  };
  for (const l of linhas) {
    if (/^\s*VEREDITO:/i.test(l)) break;
    if (/^\s*(\d+[.)]|[-•*]|Post \d+)/i.test(l)) {
      fecha();
      atual = l;
    } else if (atual) atual += ` ${l.trim()}`;
  }
  fecha();
  return itens.slice(0, 15);
}

/** Segunda revisão: o que foi pedido foi resolvido? */
export async function veraConfereCorrecaoPeloJev(p: {
  projectId: string;
  parecerAnterior: string;
  pecas: PecaParaVera[];
  etapa?: string;
}): Promise<DecisaoDaVera & { itens: string[] }> {
  const t0 = Date.now();
  const uso = usoVazio();
  const notas: Record<string, number | null> = {};
  const porque: string[] = [];
  const itens = itensDoParecer(p.parecerAnterior);
  // Sem itens legíveis não há o que conferir: o Claude confere.
  if (!itens.length || !p.pecas.length) return { decisao: "duvida", notas, porque: ["parecer sem itens"], uso, ms: 0, itens };
  const state = {
    contexto:
      "A revisora reprovou ou fez ressalvas a peças de conteúdo, listou o que mudar (`pedidos`), e o time corrigiu. `pecas` é a versão NOVA, já corrigida. Confira cada pedido contra a versão nova.",
    pedidos: itens.map((t, i) => ({ id: `p${i + 1}`, pedido: t })),
    pecas: p.pecas.map((x) => ({ id: x.id, rede: x.rede, tipo: x.tipo, texto: x.texto.slice(0, 3500) })),
  };
  const perguntas: Record<string, PerguntaDoJev> = {};
  itens.forEach((_, i) => {
    perguntas[`ok:p${i + 1}`] = {
      type: "noul",
      instructions: `O pedido de id "p${i + 1}" em \`pedidos\` foi atendido na versão nova de \`pecas\` (o problema apontado não existe mais, de um jeito razoável)?`,
    };
  });
  perguntas.bloqueio = {
    type: "noul",
    instructions:
      "Alguma peça de `pecas` tem algo que NÃO PODE ir ao ar: dado ou estatística sem fonte, texto quebrado ou inacabado, marcador ou instrução de bastidor vazada, promessa de vídeo ou link que não existe?",
  };
  const r = await perguntarAoJev({ projectId: p.projectId, etapa: p.etapa ?? "vera-conferencia", state, uso }, perguntas);
  itens.forEach((t, i) => {
    const s = probabilidadeDeSim(r[`ok:p${i + 1}`]);
    notas[`ok:p${i + 1}`] = s;
    if (s === null || s < 0.7) porque.push(`pedido ${i + 1} (${s === null ? "sem resposta" : s.toFixed(2)}): ${t.slice(0, 90)}`);
  });
  const b = probabilidadeDeSim(r.bloqueio);
  notas.bloqueio = b;
  if (b === null || b > 0.25) porque.push(`bloqueio ${b === null ? "sem resposta" : b.toFixed(2)}`);
  return { decisao: porque.length ? "duvida" : "aprova", notas, porque, uso, ms: Date.now() - t0, itens };
}

/**
 * A primeira revisão pelo JEV é OPCIONAL (VERA_PRIMEIRA_PELO_JEV=1). Medido em
 * 03/10 em 37 dias de vídeo que o Claude aprovou: o JEV aprovou 0 (nenhuma
 * aprovação errada, mas nenhuma economia). A pergunta "tem dado sem fonte?"
 * acusa opinião do próprio cliente ("menos de 5%") e dado já citado
 * ("McKinsey, 2025") em 2 de cada 3 peças, e dia de vídeo tem de 3 a 27
 * peças: "todas passam" quase nunca acontece. Fica pronta, desligada.
 */
export function veraPrimeiraPeloJevLigada(): boolean {
  return veraPeloJevLigada() && process.env.VERA_PRIMEIRA_PELO_JEV === "1";
}

/**
 * A segunda revisão da CAMPANHA pelo JEV. Devolve o parecer pronto quando o
 * JEV aprova, ou null para seguir com o Claude. Só aprova se as réguas
 * medidas por código (limite da rede, lastro dos números, rede certa, mídia)
 * estão limpas na tarefa que a Vera receberia: o JEV confere o pedido, o
 * código continua sendo quem reprova o que é medido.
 */
export async function veraConfereNaCampanha(p: {
  projectId: string;
  parecerAnterior: string;
  tarefa: string;
  midia: string;
  pecas: PecaParaVera[];
}): Promise<{ parecer: string; porque: string[] } | { parecer: null; porque: string[] }> {
  if (!veraPeloJevLigada()) return { parecer: null, porque: ["desligada"] };
  const medidasLimpas =
    p.tarefa.includes("nenhuma violação medida") &&
    p.tarefa.includes("todos os números do texto aparecem na pesquisa") &&
    p.tarefa.includes("nenhuma adaptação cita outra rede");
  if (!medidasLimpas) return { parecer: null, porque: ["régua medida acusou"] };
  if (/^FALHOU|REPROVOU/.test(p.midia)) return { parecer: null, porque: ["mídia com problema"] };
  try {
    const d = await veraConfereCorrecaoPeloJev({ projectId: p.projectId, parecerAnterior: p.parecerAnterior, pecas: p.pecas, etapa: "vera-conferencia" });
    return d.decisao === "aprova" ? { parecer: parecerDaConferencia(d.itens), porque: [] } : { parecer: null, porque: d.porque };
  } catch (e) {
    return { parecer: null, porque: [`JEV falhou: ${e instanceof Error ? e.message.slice(0, 80) : "erro"}`] };
  }
}

/**
 * A Vera revisando UM CORTE (lib/media/revisao-do-corte.ts). O defeito
 * mecânico já reprovou por código antes daqui; o JEV responde as quatro
 * perguntas que ela fazia ao Claude (abertura, fecho, ideia inteira,
 * emendas). Tudo sim com folga: aprovado sem Claude. Qualquer dúvida: o
 * Claude revisa e escreve o motivo para o Vitor e para o cliente.
 * VERA_CORTE_PELO_JEV=0 desliga só esta porta.
 */
export async function corteAprovadoPeloJev(p: {
  projectId?: string | null;
  titulo?: string;
  ideia?: string;
  antes: string;
  fala: string;
  depois: string;
}): Promise<{ aprova: boolean; notas: Record<string, number | null>; uso: UsoDoJev }> {
  const uso = usoVazio();
  const notas: Record<string, number | null> = {};
  if (!veraPeloJevLigada() || process.env.VERA_CORTE_PELO_JEV === "0") return { aprova: false, notas, uso };
  const state = {
    contexto:
      "Um CORTE de vídeo curto (Reels, Shorts), recortado de uma gravação longa. Quem assiste o corte NÃO viu o resto. `fala_no_ar` é o que o espectador ouve, já editado; \" / \" marca cada ponto onde a edição tirou palavras e emendou. `antes` e `depois` ficam FORA do vídeo.",
    titulo: p.titulo ?? "",
    ideia_que_o_corte_entrega: p.ideia ?? "",
    antes: p.antes.slice(-800),
    fala_no_ar: p.fala.slice(0, 6000),
    depois: p.depois.slice(0, 800),
  };
  const perguntas: Record<string, PerguntaDoJev> = {
    abertura: {
      type: "noul",
      instructions:
        "A primeira frase de `fala_no_ar` se entende sozinha, sem o `antes`? (Não começa no meio de frase, nem com muleta como \"né\", \"então\", \"e aí\", nem apoiada em algo dito fora, como \"isso\", \"ele\", \"como eu falei\".)",
    },
    fecho: {
      type: "noul",
      instructions:
        "A última frase de `fala_no_ar` está completa e a ideia aterrissa? (Não para no meio, não termina em \"então\", \"e\", \"mas\", \"porque\" ou vírgula, não anuncia uma conclusão que não vem, não aponta para fora.)",
    },
    ideia: { type: "noul", instructions: "A ideia do corte está inteira dentro de `fala_no_ar`, sem que a parte que dá sentido tenha ficado no `antes` ou no `depois`?" },
  };
  if (p.fala.includes(" / ")) {
    perguntas.emendas = {
      type: "noul",
      instructions:
        "Lendo cada \" / \" de `fala_no_ar` emendado, como o espectador ouve, a frase de antes continua na de depois com sentido (sem saltar de assunto, sem apagar a palavra que era a ideia, sem juntar começo de uma frase com fim de outra)?",
    };
  }
  const r = await perguntarAoJev({ projectId: p.projectId, etapa: "vera-corte", state, uso }, perguntas);
  let aprova = true;
  for (const k of Object.keys(perguntas)) {
    const s = probabilidadeDeSim(r[k]);
    notas[k] = s;
    if (s === null || s < 0.7) aprova = false;
  }
  return { aprova, notas, uso };
}

/** O parecer que a Vera grava quando o JEV aprovou: curto, sem inventar elogio. */
export function parecerDaAprovacao(pecas: PecaParaVera[]): string {
  return `Conferi as ${pecas.length} peça(s) do dia contra o nicho, o público, a voz e as regras do projeto: prontas para publicar, sem dado sem fonte. Sem problemas.\n\nVEREDITO: APROVADO`;
}

export function parecerDaConferencia(itens: string[]): string {
  return `Conferi os ${itens.length} pedido(s) do parecer anterior na versão corrigida: todos atendidos, e nada que impeça a publicação. Sem problemas.\n\nVEREDITO: APROVADO`;
}
