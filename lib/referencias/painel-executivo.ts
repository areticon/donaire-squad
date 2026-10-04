import type { AlvoDaRegra, BarraDoPainel, GraficoDoPainel, IdDoGrafico, PainelExecutivo, RegraDoProjeto, Tendencia } from "@/lib/referencias/tipos-das-analises";
import type { DeParaDoPerfil, LinhaDoDePara, RelatorioDoPerfil } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O PAINEL EXECUTIVO DO ESTUDO DE PERFIS (03/10/2026), sem banco: a tela
 * importa daqui.
 *
 * Pedido do Bruno sobre a tela de referências: "muita informação misturada e
 * confusa, precisa ser gráfico e executivo". A tela passou a ter três
 * andares, e este arquivo monta os dois que são decisão, a partir dos estudos
 * que JÁ existem (nenhuma chamada nova, nenhum número novo):
 *
 *   1. OS NÚMEROS DO TOPO: de 3 a 4 números grandes (posts por semana,
 *      engajamento, o formato que mais rende, o maior gap contra as
 *      referências), cada um com uma frase de uma linha;
 *   2. O QUE FAZER: no máximo 3 recomendações, na ordem: o que as referências
 *      fazem que você não faz e que o estudo prova que rende (o de-para de
 *      prioridade alta); a regra que o Roberto propôs e espera você; a
 *      tendência que combina e ainda não virou roteiro; o que rende forte nas
 *      referências e ainda não é regra. Cada uma traz o dado que a justifica e
 *      a ação (virar regra, aprovar a regra, levar para a linha editorial).
 *
 * O terceiro andar (os detalhes: achados, legendas, tabelas) continua nos
 * componentes de sempre, recolhido em "ver detalhes".
 */

// ── Números escritos como gente lê ──

export function numeroCurto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "sem dado";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Porcentagem pequena precisa de mais casas: 0,03% não é 0%. */
export function porcentoCurto(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "sem dado";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 2 : 1 })}%`;
}

export function vezesCurto(v: number): string {
  if (v < 0.1) return "<0,1x";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 0 : 1 })}x`;
}

/** O valor de uma linha do de-para na unidade dela. */
export function valorDaLinha(l: Pick<LinhaDoDePara, "unidade">, x: number | null): string {
  if (x === null) return "sem dado";
  if (l.unidade === "%") return porcentoCurto(x);
  if (l.unidade === "s") return `${Math.round(x)} s`;
  return numeroCurto(x);
}

function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

// ── 1. Os números do topo ──

export type NumeroDoTopo = {
  chave: string;
  /** "Posts por semana" */
  rotulo: string;
  /** O número grande. */
  valor: string;
  /** O outro lado, menor, ao lado do número ("contra 6,2 das referências"). */
  contra?: string;
  /** A frase de uma linha. */
  frase: string;
  /** Laranja quando o número pede ação (o gap), azul quando é o seu lado bom. */
  tom: "acao" | "bom" | "neutro";
};

/** O melhor formato do gráfico de formatos: forte primeiro, com 3 posts ou mais. */
function melhorBarra(g: GraficoDoPainel | undefined): BarraDoPainel | null {
  if (!g) return null;
  const venc = g.barras.find((b) => b.chave === g.vencedora);
  if (venc) return venc;
  return [...g.barras].filter((b) => b.posts >= 3 && b.vezes >= 1.3).sort((a, b) => b.vezes - a.vezes)[0] ?? null;
}

/**
 * Os números do topo. Com o de-para (o perfil do cliente E as referências
 * estudados), cada número vem com o outro lado; sem ele, o relatório do
 * perfil sozinho (primeira tela da jornada) ou as frases do painel das
 * referências (projeto sem o perfil próprio estudado).
 */
export function numerosDoTopo({
  relatorio,
  dePara,
  painel,
}: {
  relatorio?: RelatorioDoPerfil | null;
  dePara?: DeParaDoPerfil | null;
  painel?: PainelExecutivo | null;
}): NumeroDoTopo[] {
  const nums: NumeroDoTopo[] = [];
  const refs = dePara?.referencias ?? [];
  const refPorSemana = mediana(refs.map((r) => r.porSemana ?? NaN));
  const refTaxa = mediana(refs.map((r) => r.taxaDeEngajamento ?? NaN));

  // POSTS POR SEMANA
  const seuRitmo = dePara?.voce.porSemana ?? relatorio?.numeros.porSemana ?? null;
  if (seuRitmo !== null) {
    if (dePara && refPorSemana !== null) {
      const razao = refPorSemana / Math.max(seuRitmo, 0.05);
      nums.push({
        chave: "ritmo",
        rotulo: "Posts por semana",
        valor: numeroCurto(seuRitmo),
        contra: `contra ${numeroCurto(refPorSemana)} das referências`,
        frase:
          razao >= 1.5
            ? `As referências postam ${razao >= 10 ? "mais de 10" : numeroCurto(Math.round(razao * 10) / 10)} vezes mais que você.`
            : razao <= 0.67
              ? "Você posta mais que as referências."
              : "No mesmo ritmo das referências.",
        tom: razao >= 1.5 ? "acao" : "neutro",
      });
    } else if (relatorio) {
      const n = relatorio.numeros;
      nums.push({
        chave: "ritmo",
        rotulo: "Posts por semana",
        valor: numeroCurto(seuRitmo),
        frase: n.periodoDias ? `${n.posts} posts lidos, dos últimos ${n.periodoDias} dias.` : `${n.posts} posts lidos.`,
        tom: "neutro",
      });
    }
  }

  // ENGAJAMENTO
  const suaTaxa = dePara?.voce.taxaDeEngajamento ?? relatorio?.numeros.taxaDeEngajamento ?? null;
  if (suaTaxa !== null) {
    if (dePara && refTaxa !== null) {
      const melhor = suaTaxa >= refTaxa;
      nums.push({
        chave: "engajamento",
        rotulo: "Engajamento por post",
        valor: porcentoCurto(suaTaxa),
        contra: `contra ${porcentoCurto(refTaxa)} das referências`,
        frase: melhor ? "Seu público responde mais, por seguidor: a vantagem a manter." : "As referências tiram mais resposta de cada seguidor.",
        tom: melhor ? "bom" : "acao",
      });
    } else {
      const seg = dePara?.voce.seguidores ?? relatorio?.numeros.seguidores ?? null;
      nums.push({
        chave: "engajamento",
        rotulo: "Engajamento por post",
        valor: porcentoCurto(suaTaxa),
        frase: seg ? `Curtidas e comentários sobre ${numeroCurto(seg)} seguidores.` : "Curtidas e comentários por seguidor.",
        tom: "neutro",
      });
    }
  }

  // O FORMATO QUE MAIS RENDE: nas referências quando há o estudo delas, senão no seu perfil.
  const formatoRef = melhorBarra(painel?.graficos.find((g) => g.id === "formatos"));
  if (formatoRef) {
    nums.push({
      chave: "formato",
      rotulo: "Formato que mais rende nas referências",
      valor: formatoRef.nome,
      frase: `Rende ${vezesCurto(formatoRef.vezes)} o resto do perfil (${formatoRef.posts} posts de ${formatoRef.perfis} ${formatoRef.perfis === 1 ? "perfil" : "perfis"}).`,
      tom: "neutro",
    });
  } else if (relatorio?.formatos.length) {
    const comRende = relatorio.formatos.filter((f) => f.vezes !== null && f.posts >= 3).sort((a, b) => (b.vezes ?? 0) - (a.vezes ?? 0))[0];
    const f = comRende ?? relatorio.formatos[0];
    nums.push({
      chave: "formato",
      rotulo: "Formato que mais rende",
      valor: f.nome,
      frase: comRende && comRende.vezes !== null ? `Rende ${vezesCurto(comRende.vezes)} o resto do seu perfil (${comRende.posts} posts).` : `O que você mais posta: ${f.pct}% dos posts.`,
      tom: "bom",
    });
  }

  // O MAIOR GAP contra as referências (o de-para de maior prioridade, fora o engajamento, que já está acima).
  const gap = dePara?.linhas.find((l) => l.prioridade !== "baixa" && l.chave !== "engajamento" && l.chave !== "frequencia");
  if (gap) {
    nums.push({
      chave: "gap",
      rotulo: "Maior gap contra as referências",
      valor: valorDaLinha(gap, gap.voce),
      contra: `contra ${valorDaLinha(gap, gap.elas)}`,
      frase: `${gap.medida}${gap.prioridade === "alta" ? ", e o estudo prova que rende." : "."}`,
      tom: "acao",
    });
  } else if (relatorio && !dePara) {
    const n = relatorio.numeros;
    const tipico = n.medianaVisualizacoes ?? n.medianaCurtidas;
    if (tipico !== null) {
      nums.push({
        chave: "tipico",
        rotulo: n.medianaVisualizacoes !== null ? "Visualizações num post típico" : "Curtidas num post típico",
        valor: numeroCurto(tipico),
        frase: "A mediana: metade dos seus posts fica acima.",
        tom: "neutro",
      });
    }
  }

  // Faltou número (projeto sem o perfil do cliente estudado): as frases grandes
  // do painel das referências completam, sem repetir o gráfico de formatos.
  if (painel && nums.length < 4) {
    const semPerfil = !dePara && !relatorio;
    for (const f of painel.frases) {
      if (nums.length >= (semPerfil ? 4 : nums.length + 1)) break;
      if (formatoRef && f.grafico === "formatos") continue;
      const evitar = f.texto.startsWith("Evite");
      if (!semPerfil && evitar) continue;
      nums.push({
        chave: `frase-${f.grafico}-${f.numero}`,
        rotulo: evitar ? "O que rende menos nas referências" : "O que mais rende nas referências",
        valor: f.numero,
        frase: f.texto,
        tom: evitar ? "neutro" : "acao",
      });
    }
  }
  return nums.slice(0, 4);
}

// ── 2. O que fazer ──

export type AcaoDaRecomendacao =
  /** Cria uma regra do cliente, já aprovada. */
  | { tipo: "regra"; texto: string; alvos: AlvoDaRegra[]; porque: string }
  /** Aprova a regra que o Roberto propôs. */
  | { tipo: "aprovar"; regraId: string }
  /** Leva a ideia da tendência para a linha editorial (vira roteiro). */
  | { tipo: "tendencia"; tendenciaId: string };

export type Recomendacao = {
  id: string;
  /** A ação, no imperativo e curta. */
  titulo: string;
  /** O número que a justifica. */
  dado: string;
  /** De onde veio o número (amostra, achado). */
  fonte: string | null;
  /** Já feita: a regra existe e vale, ou a tendência já virou roteiro. */
  feita: { rotulo: string; roteiroId?: string | null } | null;
  acao: AcaoDaRecomendacao | null;
};

/** O que cada medida do de-para vira como ação e como regra. */
function acaoDaLinha(l: LinhaDoDePara): { titulo: string; regra: string; alvos: AlvoDaRegra[] } | null {
  const e = l.elas ?? 0;
  const n = Math.max(1, Math.round(e));
  switch (l.chave) {
    case "frequencia":
      return { titulo: `Postar ${n} ${n === 1 ? "vez" : "vezes"} por semana`, regra: `Manter o ritmo de pelo menos ${n} ${n === 1 ? "post" : "posts"} por semana, como as referências`, alvos: ["roteiro"] };
    case "video":
      return { titulo: "Fazer do vídeo a maior parte da pauta", regra: `Priorizar vídeo curto na pauta, perto de ${Math.round(e)}% dos posts, como as referências`, alvos: ["roteiro", "edicao"] };
    case "carrossel":
      return { titulo: "Postar mais carrosséis", regra: `Usar carrossel em cerca de ${Math.round(e)}% dos posts, como as referências`, alvos: ["roteiro", "arte"] };
    case "chamada":
      return { titulo: "Fechar todo post pedindo uma ação", regra: "Fechar todo post pedindo uma ação clara (comentar, salvar, seguir)", alvos: ["redacao", "roteiro"] };
    case "gancho":
      return { titulo: "Abrir com um gancho forte", regra: "Abrir os posts com pergunta, número, promessa ou algo que contraria o senso comum", alvos: ["roteiro", "redacao"] };
    case "duracao":
      return { titulo: `Fazer vídeos de cerca de ${Math.round(e)} s`, regra: `Fazer vídeos de cerca de ${Math.round(e)} segundos, como as referências`, alvos: ["roteiro", "edicao"] };
    case "musica":
      return { titulo: "Pôr música por baixo dos vídeos", regra: "Usar música por baixo da fala nos vídeos", alvos: ["edicao"] };
    case "rosto":
      return { titulo: "Mostrar o rosto na capa", regra: "Mostrar um rosto na capa dos posts", alvos: ["arte"] };
    case "texto-na-arte":
      return { titulo: "Escrever mais na arte", regra: "Usar texto grande e legível na arte dos posts", alvos: ["arte"] };
    case "hashtags":
      return { titulo: `Usar ${n} hashtags por post`, regra: `Usar cerca de ${n} hashtags por post`, alvos: ["redacao"] };
    case "engajamento":
      return null;
  }
  if (l.chave.startsWith("gancho:")) {
    const resto = l.medida.replace(/^Abre /, "");
    return { titulo: `Abrir mais posts ${resto}`, regra: `Abrir mais posts ${resto}`, alvos: ["roteiro", "redacao"] };
  }
  if (l.chave.startsWith("tom:")) {
    const resto = minuscula(l.medida.replace(/^Posts /, ""));
    return { titulo: `Fazer mais posts ${resto}`, regra: `Escrever mais posts ${resto}`, alvos: ["roteiro", "redacao"] };
  }
  return null;
}

/** O prefixo da chave do achado que corresponde a cada gráfico (para saber se já virou regra). */
const PREFIXO_DO_GRAFICO: Record<IdDoGrafico, string> = {
  formatos: "formato",
  fechamento: "chamada",
  estrutura: "estrutura",
  ganchos: "gancho",
  tom: "tom",
  arte: "arte",
  audio: "audio",
};

/** A regra que sai de uma barra do gráfico de rendimento. */
function regraDaBarra(g: GraficoDoPainel["id"], b: BarraDoPainel): { titulo: string; alvos: AlvoDaRegra[] } {
  const mais = b.vezes >= 1;
  const nome = minuscula(b.nome);
  switch (g) {
    case "formatos":
      return { titulo: mais ? `Priorizar ${nome} na pauta` : `Usar menos ${nome} na pauta`, alvos: ["roteiro"] };
    case "fechamento":
      return { titulo: "Fechar todo post pedindo uma ação clara (comentar, salvar, seguir)", alvos: ["redacao", "roteiro"] };
    case "estrutura":
      return { titulo: mais ? `Organizar mais posts como ${nome}` : `Evitar posts de ${nome}`, alvos: ["roteiro", "redacao"] };
    case "ganchos":
      return { titulo: mais ? `Abrir mais posts com ${nome}` : `Evitar abrir com ${nome}`, alvos: ["roteiro", "redacao"] };
    case "tom":
      return { titulo: mais ? `Usar mais o tom ${nome}` : `Evitar o tom ${nome}`, alvos: ["roteiro", "redacao"] };
    case "arte":
      return { titulo: mais ? `Usar mais capas de ${nome}` : `Evitar capas de ${nome}`, alvos: ["arte"] };
    case "audio":
      return { titulo: mais ? `Preferir vídeos com ${nome}` : `Evitar vídeos com ${nome}`, alvos: ["edicao"] };
  }
}

const normal = (t: string) => t.trim().toLowerCase().replace(/[.!]+$/, "");

/**
 * As até 3 recomendações, na ordem de prioridade. `proprio` liga o modo da
 * primeira tela da jornada: só o perfil do cliente, sem referências, e as
 * ações saem do que rende ou não no próprio perfil.
 */
export function recomendacoes({
  dePara,
  painel,
  regras = [],
  tendencias = [],
  relatorio,
  max = 3,
}: {
  dePara?: DeParaDoPerfil | null;
  painel?: PainelExecutivo | null;
  regras?: RegraDoProjeto[];
  tendencias?: Tendencia[];
  relatorio?: RelatorioDoPerfil | null;
  max?: number;
}): Recomendacao[] {
  const saida: Recomendacao[] = [];
  const usadas = new Set<string>();
  const valendo = (t: string) => regras.find((r) => r.status === "aprovada" && normal(r.texto) === normal(t));
  const cabe = () => saida.length < max;
  const ja = (texto: string) => usadas.has(normal(texto));
  const usar = (texto: string) => usadas.add(normal(texto));

  // A. O que as referências fazem que você não faz (de-para alta e média).
  for (const l of dePara?.linhas ?? []) {
    if (!cabe()) break;
    if (l.prioridade === "baixa") continue;
    const a = acaoDaLinha(l);
    if (!a || ja(a.regra)) continue;
    const dado = `Você: ${valorDaLinha(l, l.voce)}. Referências: ${valorDaLinha(l, l.elas)}.`;
    // A regra do Roberto que nasceu do mesmo achado: aprovar a dele, em vez de criar outra.
    const doRoberto = l.prova ? regras.find((r) => r.achado?.frase === l.prova && r.status !== "recusada") : undefined;
    if (doRoberto) usadas.add(`regra:${doRoberto.id}`);
    usar(a.regra);
    const feita = doRoberto?.status === "aprovada" || valendo(a.regra) ? { rotulo: "Já é regra do projeto" } : null;
    saida.push({
      id: `de-para:${l.chave}`,
      titulo: a.titulo,
      dado,
      fonte: l.prova ? `Por que importa: ${l.prova}` : null,
      feita,
      acao: feita ? null : doRoberto?.status === "proposta" ? { tipo: "aprovar", regraId: doRoberto.id } : { tipo: "regra", texto: a.regra, alvos: a.alvos, porque: `${l.frase}${l.prova ? ` ${l.prova}` : ""}` },
    });
  }

  // Na primeira tela (só o seu perfil), as propostas e as tendências das
  // referências ficam para depois: o que fazer sai só do que rende em você.
  const soDoPerfil = !dePara && !painel && Boolean(relatorio);

  // B. A regra que o Roberto propôs e espera a sua decisão (forte primeiro).
  const propostas = soDoPerfil ? [] : regras
    .filter((r) => r.status === "proposta" && !usadas.has(`regra:${r.id}`))
    .sort((a, b) => (a.achado?.forca === "forte" ? 0 : 1) - (b.achado?.forca === "forte" ? 0 : 1));
  for (const r of propostas) {
    if (!cabe()) break;
    if (ja(r.texto)) continue;
    usar(r.texto);
    usadas.add(`regra:${r.id}`);
    saida.push({
      id: `regra:${r.id}`,
      titulo: r.texto,
      dado: r.achado?.frase ?? r.porque,
      fonte: r.achado ? `${r.achado.amostra.posts} posts de ${r.achado.amostra.perfis} ${r.achado.amostra.perfis === 1 ? "perfil" : "perfis"}, ${r.achado.forca === "forte" ? "forte" : "indício"}. Proposta do Roberto.` : "Proposta do Roberto.",
      feita: null,
      acao: { tipo: "aprovar", regraId: r.id },
    });
  }

  // C. A tendência da semana que combina com você e ainda não virou roteiro.
  for (const t of soDoPerfil ? [] : tendencias) {
    if (!cabe()) break;
    if (!t.combina || !t.sugestao || t.roteiroId) continue;
    saida.push({
      id: `tendencia:${t.id}`,
      titulo: `Gravar: ${t.sugestao.tema}`,
      dado: `Tendência da semana: ${t.nome}. ${t.evidencia.frase.charAt(0).toUpperCase()}${t.evidencia.frase.slice(1)}.`,
      fonte: t.motivo || null,
      feita: null,
      acao: { tipo: "tendencia", tendenciaId: t.id },
    });
  }

  // D. O que rende forte (nas referências, ou no seu perfil na primeira tela) e ainda não é regra.
  const graficos = painel?.graficos ?? relatorio?.graficos ?? [];
  const doProprio = soDoPerfil;
  const candidatas: Array<{ g: GraficoDoPainel; b: BarraDoPainel }> = [];
  for (const g of graficos) {
    for (const b of g.barras) {
      const forte = doProprio ? b.posts >= 3 : b.forca === "forte";
      if (forte && (b.vezes >= 1.3 || b.vezes <= 0.7)) candidatas.push({ g, b });
    }
  }
  // A maior diferença primeiro (em dobros, para 0,3x e 3x pesarem igual).
  candidatas.sort((x, y) => Math.abs(Math.log2(y.b.vezes)) - Math.abs(Math.log2(x.b.vezes)));
  for (const { g, b } of candidatas) {
    if (!cabe()) break;
    const prefixo = PREFIXO_DO_GRAFICO[g.id];
    const qualquerDoPrefixo = g.id === "fechamento" || g.id === "audio";
    const coberta = regras.some((r) => {
      const k = r.achado?.chave ?? "";
      return k.startsWith(`${prefixo}:`) && (qualquerDoPrefixo || k.split(":")[1] === b.chave);
    });
    if (coberta) continue;
    const r = regraDaBarra(g.id, b);
    if (ja(r.titulo)) continue;
    usar(r.titulo);
    const lado = doProprio ? "o resto do seu perfil" : "o resto do perfil, nas referências";
    const dado = b.vezes >= 1 ? `${b.nome} rende ${vezesCurto(b.vezes)} ${lado}.` : `${b.nome} rende só ${vezesCurto(b.vezes)} ${lado}.`;
    const fonte = doProprio ? `${b.posts} dos seus posts. Com poucos posts de um tipo, leia como pista.` : `${b.posts} posts de ${b.perfis} ${b.perfis === 1 ? "perfil" : "perfis"}, forte.`;
    const feita = valendo(r.titulo) ? { rotulo: "Já é regra do projeto" } : null;
    saida.push({ id: `grafico:${g.id}:${b.chave}`, titulo: r.titulo, dado, fonte, feita, acao: feita ? null : { tipo: "regra", texto: r.titulo, alvos: r.alvos, porque: `${dado} ${fonte}` } });
  }
  return saida;
}

/**
 * As barras de "rende Nx" para o gráfico do topo: a melhor e a pior de cada
 * gráfico, com amostra mínima, na ordem da diferença. Os 7 gráficos completos
 * continuam nos detalhes.
 */
export function barrasQueMaisRendem(graficos: GraficoDoPainel[], { max = 6, minimoDePosts = 3 }: { max?: number; minimoDePosts?: number } = {}): Array<BarraDoPainel & { grafico: string }> {
  const lista: Array<BarraDoPainel & { grafico: string }> = [];
  for (const g of graficos) {
    const validas = g.barras.filter((b) => b.posts >= minimoDePosts);
    // Dentro de cada gráfico, a barra forte vence o indício (20x de 9 posts de um perfil não esconde 5x de 24 posts de dois).
    const forteAntes = (a: BarraDoPainel, b: BarraDoPainel) => (a.forca === b.forca ? 0 : a.forca === "forte" ? -1 : 1);
    const melhor = [...validas].filter((b) => b.vezes >= 1.2).sort((a, b) => forteAntes(a, b) || b.vezes - a.vezes)[0];
    const pior = [...validas].filter((b) => b.vezes <= 0.8).sort((a, b) => forteAntes(a, b) || a.vezes - b.vezes)[0];
    if (melhor) lista.push({ ...melhor, grafico: g.titulo });
    if (pior) lista.push({ ...pior, grafico: g.titulo });
  }
  // As fortes primeiro; dentro delas, a maior diferença.
  lista.sort((a, b) => (a.forca === b.forca ? 0 : a.forca === "forte" ? -1 : 1) || Math.abs(Math.log2(b.vezes)) - Math.abs(Math.log2(a.vezes)));
  return lista.slice(0, max).sort((a, b) => b.vezes - a.vezes);
}
