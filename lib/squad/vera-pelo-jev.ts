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
    // Ressalva e "Recomendações" do parecer composto em código (05/10): não
    // são pedido, e não podem grudar no item anterior.
    if (/^\s*(Ressalva\b|Recomenda)/i.test(l)) {
      fecha();
      continue;
    }
    if (/^\s*(\d+[.)]|[-•*]|Post \d+)/i.test(l)) {
      fecha();
      atual = l;
    } else if (atual) atual += ` ${l.trim()}`;
  }
  fecha();
  // Cabeçalho de peça ("Post 1 (Instagram): o que precisa mudar:") e peça sem
  // problema ("Post 2 (X): sem problemas.") não são pedidos.
  return itens.filter((t) => !/:\s*$/.test(t) && !/^Post \d+\b[^\n]*:\s*sem problemas\.?\s*$/i.test(t)).slice(0, 15);
}

/** Segunda revisão: o que foi pedido foi resolvido? */
export async function veraConfereCorrecaoPeloJev(
  p: {
    projectId: string;
    parecerAnterior: string;
    pecas: PecaParaVera[];
    etapa?: string;
  },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<DecisaoDaVera & { itens: string[] }> {
  const t0 = Date.now();
  const uso = usoVazio();
  const notas: Record<string, number | null> = {};
  const porque: string[] = [];
  const itens = itensDoParecer(p.parecerAnterior);
  if (!p.pecas.length) return { decisao: "duvida", notas, porque: ["sem peças"], uso, ms: 0, itens };
  // Sem itens legíveis (parecer antigo, escrito corrido) fica só a pergunta de
  // bloqueio: desde 05/10 a dúvida não vai mais ao Claude, então ela precisa
  // ser respondida aqui.
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
  const r = await perguntar({ projectId: p.projectId, etapa: p.etapa ?? "vera-conferencia", state, uso }, perguntas);
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
 * A primeira revisão pelo JEV é o PADRÃO desde 05/10 (VERA_PRIMEIRA_PELO_JEV=0
 * desliga). Regra do Bruno de 05/10: o Claude só escreve texto; revisão,
 * decisão e classificação vão ao JEV. Na medição de 03/10 ela ficou desligada
 * porque a dúvida voltava ao Claude e "todas passam com folga" quase nunca
 * acontecia. Agora a dúvida não vai a lugar nenhum: vira RESSALVA no parecer
 * (aprovado, com a observação), e só a falha com certeza reprova
 * (`veraRevisaPeloJev`). O Claude fica só para quando o JEV está fora do ar.
 */
export function veraPrimeiraPeloJevLigada(): boolean {
  return veraPeloJevLigada() && process.env.VERA_PRIMEIRA_PELO_JEV !== "0";
}

/**
 * A segunda revisão da CAMPANHA pelo JEV. Devolve o parecer pronto (aprovado
 * ou reprovado com o que ainda falta), ou null só quando o JEV está desligado
 * ou falhou: aí o Claude revisa como antes. As réguas medidas por código
 * (limite da rede, lastro dos números, rede certa, mídia) continuam sendo quem
 * reprova o que é medido; o JEV confere os pedidos e a rede errada por
 * sentido.
 */
export async function veraConfereNaCampanha(
  p: {
    projectId: string;
    parecerAnterior: string;
    tarefa: string;
    midia: string;
    pecas: PecaParaVera[];
  },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<{ parecer: string; porque: string[] } | { parecer: null; porque: string[] }> {
  if (!veraPeloJevLigada()) return { parecer: null, porque: ["desligada"] };
  try {
    const reguas = reguasDaTarefa(p.tarefa);
    const midiaRuim = midiaReprovada(p.midia);
    const [d, redeErrada] = await Promise.all([
      veraConfereCorrecaoPeloJev({ projectId: p.projectId, parecerAnterior: p.parecerAnterior, pecas: p.pecas, etapa: "vera-conferencia" }, perguntar),
      redeErradaPeloJev({ projectId: p.projectId, frases: reguas.redeErrada }, perguntar),
    ]);
    const medidas = [...reguas.medidas, ...redeErrada];
    // Régua e mídia o código acabou de medir de novo (acima): o pedido antigo
    // sobre elas não fica pendente pelo JEV, senão o laço nunca fecha.
    const pendentes = pendentesDaConferencia(d).filter((t) => !/^(\d+[.)]\s*)?(Régua|A mídia do dia)/i.test(t));
    if (!pendentes.length && !medidas.length && !midiaRuim) return { parecer: parecerDaConferencia(d.itens), porque: [] };
    const porque = [...d.porque, ...medidas.map((m) => `régua: ${m.slice(0, 80)}`), ...(midiaRuim ? ["mídia com problema"] : [])];
    return { parecer: parecerDaConferenciaPendente({ itens: d.itens, pendentes, medidas, midiaRuim, estilo: "campanha" }), porque };
  } catch (e) {
    return { parecer: null, porque: [`JEV falhou: ${e instanceof Error ? e.message.slice(0, 80) : "erro"}`] };
  }
}

// ───────────── a revisão inteira sem Claude (05/10) ─────────────
//
// Regra do Bruno de 05/10: "o Claude só escreve texto; escolhas, decisões,
// revisões e classificações vão ao JEV". A Vera deixa de escrever o parecer:
// o JEV responde os critérios peça a peça, e o parecer é COMPOSTO EM CÓDIGO
// no formato que o laço da correção já lê (leitura geral, "Post N" com itens
// numerados, "Recomendações", linha do VEREDITO). O redator corrige lendo os
// itens, e a segunda revisão confere item a item (`veraConfereCorrecaoPeloJev`).
//
// O que reprova e o que é ressalva: só a falha com CERTEZA reprova (o JEV
// abaixo de 0,3 num critério bom, ou acima de 0,75 no "dado sem fonte"); a
// dúvida vira ressalva, que não gera reescrita paga. É a regra de 21/09
// ("reprove o que é erro, não o que é gosto") aplicada a um juiz que não
// escreve.

export type VereditoDaRevisao = "APROVADO" | "APROVADO_COM_RESSALVAS" | "REPROVADO";

/** Abaixo disto, num critério "bom = sim", o JEV tem certeza de que a peça falha. */
export const CERTEZA_DE_FALHA_SIM = 0.3;
/** Acima disto, no critério "dado sem fonte" (bom = não), o JEV tem certeza. */
export const CERTEZA_DE_FALHA_NAO = 0.75;

const TEXTO_DO_CRITERIO: Record<string, { reprova: string; ressalva: string }> = {
  pronto: {
    reprova: "o texto não está pronto para publicar (frase quebrada, lixo de transcrição ou marcador de bastidor); entregue só o texto final, inteiro",
    ressalva: "confira se o texto está inteiro e sem marcador de bastidor",
  },
  nicho: {
    reprova: "o texto é genérico e não fala com o público e o nicho do projeto; reescreva ligando a ideia a quem lê",
    ressalva: "o texto poderia falar mais de perto com o público do projeto",
  },
  regras: {
    reprova: "o texto fere a voz da marca ou uma regra aprovada pelo cliente; reescreva dentro das regras do projeto",
    ressalva: "confira a voz da marca e as regras aprovadas pelo cliente",
  },
  dado: {
    reprova: "há número, estatística ou afirmação factual sem fonte e fora da pesquisa; remova a frase, sem trocar o número por outro",
    ressalva: "confira se todo número do texto tem a fonte da pesquisa",
  },
  rede: {
    reprova: "a peça não está no formato da rede dela (tamanho, formato, chamada); ajuste ao formato da rede",
    ressalva: "a peça poderia aproveitar melhor o formato da rede",
  },
};

const NOME_DA_REDE_NO_PARECER: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export type AvaliacaoDaPeca = { id: string; rede: string; tipo: string; reprovas: string[]; ressalvas: string[] };

/** Das notas do JEV ao que reprova e ao que é ressalva, peça a peça. Puro. */
export function avaliarNotas(pecas: PecaParaVera[], notas: Record<string, number | null>): AvaliacaoDaPeca[] {
  return pecas.map((x) => {
    const reprovas: string[] = [];
    const ressalvas: string[] = [];
    for (const c of CRITERIOS) {
      const s = notas[`${c.k}:${x.id}`];
      // Sem resposta é "não sei", e "não sei" não reprova ninguém.
      if (s === null || s === undefined) continue;
      const texto = TEXTO_DO_CRITERIO[c.k];
      if (c.bom === "sim") {
        if (s <= CERTEZA_DE_FALHA_SIM) reprovas.push(texto.reprova);
        else if (s < c.limite) ressalvas.push(texto.ressalva);
      } else if (s >= CERTEZA_DE_FALHA_NAO) reprovas.push(texto.reprova);
      else if (s > c.limite) ressalvas.push(texto.ressalva);
    }
    return { id: x.id, rede: x.rede, tipo: x.tipo, reprovas, ressalvas };
  });
}

function rotuloDaPeca(a: { rede: string; tipo: string }): string {
  return `${NOME_DA_REDE_NO_PARECER[a.rede] ?? a.rede}, ${a.tipo}`;
}

/**
 * O parecer composto em código. Formato lido por `secoesPorPeca`,
 * `secaoPedeMudanca`, `itensDoParecer`, `leituraGeralDoParecer` e
 * `recomendacoesDoParecer` (lib/squad/correcao-da-vera.ts): "Post N (rede,
 * tipo): o que precisa mudar:" seguido de itens numerados; ressalva vai numa
 * linha "Ressalva" sem número nem marcador, para não virar pedido nem
 * mandar a peça de volta. No estilo "campanha" o veredito ganha o sufixo que
 * a esteira lê (REPROVADO_TEXTO, REPROVADO_MIDIA, REPROVADO_AMBOS).
 */
export function parecerDaRevisao(p: {
  avaliacoes: AvaliacaoDaPeca[];
  /** Réguas medidas por código que reprovam sozinhas (campanha). */
  medidas?: string[];
  midiaRuim?: boolean;
  estilo: "video" | "campanha";
}): { veredito: string; parecer: string } {
  const medidas = p.medidas ?? [];
  const comReprova = p.avaliacoes.filter((a) => a.reprovas.length);
  const comRessalva = p.avaliacoes.filter((a) => !a.reprovas.length && a.ressalvas.length);
  const reprovaTexto = comReprova.length > 0 || medidas.length > 0;
  const reprova = reprovaTexto || Boolean(p.midiaRuim);
  const base: VereditoDaRevisao = reprova ? "REPROVADO" : comRessalva.length ? "APROVADO_COM_RESSALVAS" : "APROVADO";
  const veredito =
    p.estilo === "campanha" && reprova ? (reprovaTexto && p.midiaRuim ? "REPROVADO_AMBOS" : p.midiaRuim ? "REPROVADO_MIDIA" : "REPROVADO_TEXTO") : base;

  const n = p.avaliacoes.length;
  const leitura = reprova
    ? `Leitura geral: conferi ${n} peça(s) contra o nicho, o público, a voz, as regras do projeto e os dados pesquisados. ${comReprova.length ? `${comReprova.length} peça(s) precisam de correção antes de ir ao ar` : ""}${comReprova.length && (medidas.length || p.midiaRuim) ? "; " : ""}${medidas.length ? `${medidas.length} régua(s) medida(s) por código acusaram` : ""}${(comReprova.length || medidas.length) && p.midiaRuim ? "; " : ""}${p.midiaRuim ? "a mídia do dia falhou ou foi reprovada na conferência" : ""}.`
    : `Leitura geral: conferi ${n} peça(s) contra o nicho, o público, a voz, as regras do projeto e os dados pesquisados. Nada impede a publicação${comRessalva.length ? `; ${comRessalva.length} peça(s) com ressalva, sem reescrita` : ""}.`;

  const blocos: string[] = [leitura];
  if (medidas.length) {
    blocos.push(`Réguas medidas por código (não são opinião), o que precisa mudar:\n${medidas.map((m, i) => `${i + 1}. Régua: ${m}`).join("\n")}`);
  }
  if (p.midiaRuim) {
    blocos.push(`Mídia, o que precisa mudar:\n1. A mídia do dia falhou ou foi reprovada na conferência de arte; a Diana refaz a arte antes da publicação.`);
  }
  p.avaliacoes.forEach((a, i) => {
    const n = i + 1;
    const linhas: string[] = [];
    if (a.reprovas.length) {
      linhas.push(`Post ${n} (${rotuloDaPeca(a)}): o que precisa mudar (problemas encontrados):`);
      for (const r of a.ressalvas) linhas.push(`Ressalva (não reprova): ${r}.`);
      a.reprovas.forEach((r, k) => linhas.push(`${k + 1}. Post ${n} (${NOME_DA_REDE_NO_PARECER[a.rede] ?? a.rede}): ${r}.`));
    } else {
      linhas.push(`Post ${n} (${rotuloDaPeca(a)}): sem problemas.`);
      for (const r of a.ressalvas) linhas.push(`Ressalva (não reprova): ${r}.`);
    }
    blocos.push(linhas.join("\n"));
  });
  blocos.push(
    reprova
      ? "Recomendações: cada peça apontada volta ao agente dono com os itens acima; a segunda revisão confere item a item."
      : "Recomendações: nenhuma correção pendente."
  );
  blocos.push(`VEREDITO: ${veredito}`);
  return { veredito, parecer: blocos.join("\n\n") };
}

/**
 * As notas da primeira revisão, peça a peça. O critério "dado sem fonte" só é
 * perguntado para peça que TEM número (medido em 03/10: ele acusava opinião
 * do cliente, "menos de 5%", em 2 de cada 3 peças; peça sem dígito não tem o
 * que acusar).
 */
async function notasDaPrimeiraRevisao(
  p: {
    projectId: string;
    projeto: { nome?: string | null; nicho?: string | null; publico?: string | null; voz?: string | null; naoCitar?: string[] };
    pecas: PecaParaVera[];
    dadosPesquisados?: string;
    etapa?: string;
  },
  uso: UsoDoJev,
  perguntar: typeof perguntarAoJev
): Promise<Record<string, number | null>> {
  const state = {
    contexto: "Peças de conteúdo de um dia, prontas para ir às redes de um cliente. Você é a revisora de qualidade antes de chegar ao cliente.",
    projeto: await estadoDoProjeto({ projectId: p.projectId, ...p.projeto }),
    dados_pesquisados: (p.dadosPesquisados ?? "").slice(0, 3000) || "(nenhum)",
    pecas: p.pecas.map((x) => ({ id: x.id, rede: x.rede, tipo: x.tipo, texto: x.texto.slice(0, 3500) })),
  };
  const perguntas: Record<string, PerguntaDoJev> = {};
  for (const x of p.pecas) {
    for (const c of CRITERIOS) {
      // A numeração dos tweets ("1/", "2/") não é número do texto.
      if (c.k === "dado" && !/\d/.test(x.texto.replace(/(^|\s)\d+\/\s*/g, " "))) continue;
      perguntas[`${c.k}:${x.id}`] = { type: "noul", instructions: c.pergunta(x.id) };
    }
  }
  const r = await perguntar({ projectId: p.projectId, etapa: p.etapa ?? "vera", state, uso }, perguntas);
  const notas: Record<string, number | null> = {};
  for (const k of Object.keys(perguntas)) notas[k] = probabilidadeDeSim(r[k]);
  return notas;
}

/**
 * A primeira revisão INTEIRA pelo JEV, sem Claude: veredito e parecer prontos
 * para o card e para o laço da correção. Devolve null quando está desligada;
 * lança quando o JEV falha (quem chama decide se cai no Claude).
 */
export async function veraRevisaPeloJev(
  p: {
    projectId: string;
    projeto: { nome?: string | null; nicho?: string | null; publico?: string | null; voz?: string | null; naoCitar?: string[] };
    pecas: PecaParaVera[];
    dadosPesquisados?: string;
    estilo?: "video" | "campanha";
    medidas?: string[];
    midiaRuim?: boolean;
    etapa?: string;
  },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<{ veredito: string; parecer: string; avaliacoes: AvaliacaoDaPeca[]; notas: Record<string, number | null>; uso: UsoDoJev; ms: number } | null> {
  if (!veraPrimeiraPeloJevLigada()) return null;
  const t0 = Date.now();
  const uso = usoVazio();
  const notas = p.pecas.length ? await notasDaPrimeiraRevisao({ ...p, etapa: p.etapa ?? "vera" }, uso, perguntar) : {};
  const avaliacoes = avaliarNotas(p.pecas, notas);
  const { veredito, parecer } = parecerDaRevisao({ avaliacoes, medidas: p.medidas, midiaRuim: p.midiaRuim, estilo: p.estilo ?? "video" });
  return { veredito, parecer, avaliacoes, notas, uso, ms: Date.now() - t0 };
}

/**
 * As réguas medidas por código que a tarefa da Vera da campanha carrega
 * (itens 7, 8 e 9 de `buildVeraTask`): os marcadores "•" de cada seção, menos
 * as sentinelas de "nada acusou". Os de 7 e 8 reprovam sozinhos; os de 9
 * (adaptação citando outra rede) são julgados por sentido, no JEV.
 */
export function reguasDaTarefa(tarefa: string): { medidas: string[]; redeErrada: string[] } {
  const secao = (de: RegExp, ate: RegExp): string[] => {
    const i = tarefa.search(de);
    if (i < 0) return [];
    const resto = tarefa.slice(i);
    const j = resto.slice(1).search(ate);
    const corpo = j >= 0 ? resto.slice(0, j + 1) : resto;
    return corpo
      .split("\n")
      .map((l) => l.match(/^\s*•\s*(.+?)\s*$/)?.[1] ?? "")
      .filter((l) => l && !/^(nenhuma viola|todos os números|nenhuma adaptação)/i.test(l));
  };
  return {
    medidas: [...secao(/^7\. LIMITES DA REDE/m, /^8\. LASTRO/m), ...secao(/^8\. LASTRO/m, /^9\. REDE CERTA/m)],
    redeErrada: secao(/^9\. REDE CERTA/m, /^O QUE REPROVA/m),
  };
}

/** A mídia do dia, como a esteira descreve, impede a publicação? */
export function midiaReprovada(midia: string): boolean {
  return /^FALHOU/.test(midia) || /REPROVOU/.test(midia);
}

/**
 * A adaptação cita outra rede como o lugar onde o leitor está? Julgado por
 * sentido no JEV: "a pesquisa ouviu 16 mil criadores do LinkedIn" é fato e
 * vale em qualquer rede; "seu post no LinkedIn está competindo" está errado
 * numa legenda de Instagram. Só o que o JEV confirma (>= 0,7) vira régua.
 */
export async function redeErradaPeloJev(p: { projectId: string; frases: string[] }, perguntar: typeof perguntarAoJev = perguntarAoJev): Promise<string[]> {
  if (!p.frases.length) return [];
  const state = {
    contexto:
      "Frases de peças ADAPTADAS para uma rede social, que mencionam OUTRA rede. Cada item diz a rede da peça e a frase. Um FATO da pesquisa que cita uma rede (\"a pesquisa ouviu 16 mil criadores do LinkedIn\") continua verdadeiro em qualquer rede e está certo. Uma frase que trata a outra rede como o lugar onde o leitor está (\"seu post no LinkedIn está competindo\", \"o algoritmo do LinkedIn mudou\") está errada na peça.",
    frases: p.frases.map((f, i) => ({ id: `f${i + 1}`, frase: f.slice(0, 400) })),
  };
  const perguntas: Record<string, PerguntaDoJev> = {};
  p.frases.forEach((_, i) => {
    perguntas[`f${i + 1}`] = { type: "noul", instructions: `A frase de id "f${i + 1}" em \`frases\` trata a outra rede como o lugar onde o leitor está (e não como um fato da pesquisa), e por isso está errada na peça?` };
  });
  const r = await perguntar({ projectId: p.projectId, etapa: "vera-rede", state }, perguntas);
  return p.frases.filter((_, i) => (probabilidadeDeSim(r[`f${i + 1}`]) ?? 0) >= 0.7).map((f) => `${f}. Reescreva a frase para a rede da peça.`);
}

/** Os pedidos que a conferência não viu atendidos, na ordem do parecer anterior. */
export function pendentesDaConferencia(d: { itens: string[]; notas: Record<string, number | null> }): string[] {
  const pendentes = d.itens.filter((_, i) => {
    const s = d.notas[`ok:p${i + 1}`];
    return s === null || s === undefined || s < 0.7;
  });
  const b = d.notas.bloqueio;
  if (b === null || b === undefined || b > 0.25) {
    pendentes.push("Alguma peça ainda tem algo que não pode ir ao ar (dado sem fonte, texto quebrado, marcador de bastidor vazado ou promessa de mídia que não existe); revise cada peça por isso.");
  }
  return pendentes;
}

/** O parecer da segunda revisão quando ainda falta algo: reprovado, com a lista do que ficou. */
export function parecerDaConferenciaPendente(p: { itens: string[]; pendentes: string[]; medidas?: string[]; midiaRuim?: boolean; estilo: "video" | "campanha" }): string {
  const medidas = p.medidas ?? [];
  const atendidos = Math.max(0, p.itens.length - p.pendentes.filter((x) => p.itens.includes(x)).length);
  const textoRuim = p.pendentes.length > 0 || medidas.length > 0;
  const veredito = p.estilo === "campanha" ? (textoRuim && p.midiaRuim ? "REPROVADO_AMBOS" : p.midiaRuim ? "REPROVADO_MIDIA" : "REPROVADO_TEXTO") : "REPROVADO";
  const itens = [...medidas.map((m) => `Régua medida por código: ${m}`), ...p.pendentes, ...(p.midiaRuim ? ["A mídia do dia falhou ou foi reprovada na conferência de arte; a Diana refaz a arte."] : [])];
  return (
    `Conferi os ${p.itens.length} pedido(s) do parecer anterior na versão corrigida: ${atendidos} atendido(s). O que precisa mudar ainda:\n` +
    itens.map((t, i) => `${i + 1}. ${t}`).join("\n") +
    `\n\nVEREDITO: ${veredito}`
  );
}

/**
 * A primeira revisão da CAMPANHA sem Claude: as réguas medidas da tarefa, a
 * mídia, a rede errada por sentido e os critérios por peça, tudo no JEV, com
 * o parecer composto no formato que a esteira lê. Null quando desligada ou
 * quando o JEV falhou: aí a esteira chama o Claude como antes.
 */
export async function veraRevisaNaCampanha(
  p: {
    projectId: string;
    projeto: { nome?: string | null; nicho?: string | null; publico?: string | null; voz?: string | null; naoCitar?: string[] };
    pecas: PecaParaVera[];
    dadosPesquisados?: string;
    tarefa: string;
    midia: string;
  },
  perguntar: typeof perguntarAoJev = perguntarAoJev
): Promise<{ parecer: string; veredito: string } | null> {
  if (!veraPrimeiraPeloJevLigada()) return null;
  try {
    const reguas = reguasDaTarefa(p.tarefa);
    const [redeErrada, r] = await Promise.all([
      redeErradaPeloJev({ projectId: p.projectId, frases: reguas.redeErrada }, perguntar),
      veraRevisaPeloJev({ ...p, estilo: "campanha", medidas: reguas.medidas, midiaRuim: midiaReprovada(p.midia), etapa: "vera" }, perguntar),
    ]);
    if (!r) return null;
    if (!redeErrada.length) return { parecer: r.parecer, veredito: r.veredito };
    const { veredito, parecer } = parecerDaRevisao({ avaliacoes: r.avaliacoes, medidas: [...reguas.medidas, ...redeErrada], midiaRuim: midiaReprovada(p.midia), estilo: "campanha" });
    return { parecer, veredito };
  } catch (e) {
    console.error("[vera] JEV falhou na primeira revisão da campanha, segue o Claude:", e instanceof Error ? e.message : e);
    return null;
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
