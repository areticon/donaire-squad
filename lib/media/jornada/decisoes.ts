import type { perguntarAoJev, PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import type { GeneroDoVideo, LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { DOLAR_POR_IMAGEM, DOLAR_POR_RECORTE, DOLAR_POR_SEGUNDO_DE_VIDEO } from "@/lib/credits/higgsfield-tabela";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { IdeiaCrua } from "@/lib/media/jornada/ideias";
import type { Frase } from "@/lib/media/jornada/linha-do-tempo";
import { FORMATOS_DA_JORNADA, type AmostraDaJornada, type ElementoProposto, type FormatoDaJornada, type MidiaDaJornada } from "@/lib/media/jornada/estado";

/**
 * O PASSO 4 DA JORNADA, terceiro movimento (E2): as DECISÕES, todas pelo JEV.
 *
 * Num lote só: a força de cada momento (score), a ideia de cada momento entre
 * as do Sonnet ou "nenhuma" (choice), o formato de composição entre os que o
 * código sabe posicionar naquele trecho (choice; o formato diz ONDE e COMO a
 * mídia entra, nunca o que ela mostra) e a densidade do vídeo (choice entre
 * opções que dependem só da duração e do gênero lido).
 *
 * O código só aplica limites físicos: espaço mínimo entre elementos (o da
 * densidade escolhida), nunca dois ao mesmo tempo, teto de custo mostrado ao
 * cliente. Não há catálogo de peças, regra por estilo nem cota por minuto.
 */

export type Jev = typeof perguntarAoJev;

// ─────────────────────────────── a densidade ───────────────────────────────

export type OpcaoDeDensidade = { id: string; faixa: [number, number]; criterio: string };

/**
 * As opções de densidade ("segundos médios entre elementos"): dependem SÓ da
 * duração e do gênero lido. Vídeo longo cai naturalmente nas espaçadas (e o
 * B-roll gerado intercala); vídeo em que a tela ou a demonstração é o assunto
 * ganha opções mais espaçadas. Nenhum número preso a estilo.
 */
export function opcoesDeDensidade(duracao: number, genero: GeneroDoVideo | null | undefined): OpcaoDeDensidade[] {
  // 07/10 (Bruno): vídeo curto pede efeito o tempo todo; quanto mais longo, mais espaçado.
  const niveis: Array<[number, number]> =
    duracao <= 75 ? [[2, 3.5], [2.5, 4.5], [3.5, 6]] : duracao <= 180 ? [[2.5, 4.5], [3.5, 6], [5, 8]] : duracao <= 600 ? [[5, 8], [8, 15], [15, 25]] : [[12, 20], [20, 35], [35, 60]];
  const espacar = genero === "tela" || genero === "apresentacao-com-quadro" || genero === "demonstracao";
  const faixas = espacar ? [...niveis.slice(1), [niveis[2][1], Math.round(niveis[2][1] * 1.7)] as [number, number]] : niveis;
  const nomes = ["intensa", "media", "espacada"];
  return faixas.map((f, i) => ({ id: nomes[i], faixa: f, criterio: `um elemento a cada ${f[0]} a ${f[1]} s em média` }));
}

// ─────────────────────────────── os formatos possíveis ───────────────────────────────

const cabe = (areas: TrechoLido["areaLivre"], w: number, h: number) => areas.some((a) => a.w >= w && a.h >= h);

/**
 * Os formatos que o código sabe posicionar no trecho, pela área livre lida
 * (geometria, não escolha): janela e recorte só onde há espaço sem cobrir
 * pessoa, tela ou quadro; tela cheia para imagem; B-roll para vídeo.
 */
export function formatosPossiveis(midia: MidiaDaJornada, trecho: TrechoLido | null, formato: "9:16" | "16:9", livre?: EspacoLivre | null, longo = true): FormatoDaJornada[] {
  // O GRÁFICO (07/10) é desenhado em código e se acomoda no espaço que houver (acima da cabeça, sobre o peito, ao lado): sempre cabe.
  if (midia === "grafico") return ["grafico"];
  const areas = trecho?.areaLivre ?? [];
  const vertical = formato === "9:16";
  // Com a medição do rosto no momento (amostras), o espaço real decide: o elemento só entra sobre a gravação se couber GRANDE.
  // 07/10: o elemento pode cobrir o corpo (nunca o rosto); a faixa entre o queixo e a legenda também vale.
  const baixo = livre?.baixo ?? 0;
  const janela = livre ? (vertical ? livre.lateral >= 0.5 || livre.topo >= 0.3 || baixo >= 0.24 : livre.lateral >= 0.34 || baixo >= 0.3) : cabe(areas, vertical ? 0.55 : 0.28, vertical ? 0.2 : 0.3);
  // No vertical, o recorte só vale onde ele entra GRANDE (lateral larga ou faixa alta acima da cabeça); senão a ideia vira imagem em tela cheia.
  const recorte = livre ? (vertical ? livre.lateral >= 0.45 || livre.topo >= 0.12 || baixo >= 0.16 : livre.lateral >= 0.28 || livre.topo >= 0.3 || baixo >= 0.24) : cabe(areas, vertical ? 0.45 : 0.2, vertical ? 0.2 : 0.24);
  // Tela compartilhada ou quadro no trecho: nada os cobre (nem tela cheia, nem B-roll); só o que cabe ao lado.
  const conteudo = Boolean(trecho?.tela || trecho?.quadro);
  const sobre: FormatoDaJornada[] =
    midia === "recorte" ? [...(recorte ? (["recorte-sobre"] as const) : []), ...(janela ? (["janela"] as const) : [])] : [...(janela ? (["janela"] as const) : []), ...(recorte ? (["recorte-sobre"] as const) : [])];
  // VÍDEO CURTO (07/10, Bruno): o efeito entra COM a pessoa na tela; sem tela cheia e sem B-roll (só no vídeo longo).
  if (!longo) {
    // Sem lugar folgado ao lado, o OBJETO entra como recorte sobre o corpo (nunca sobre o rosto), e não vira texto
    // (08/10: no Igor, a moto dita virou painel de texto em código porque o rosto ocupava o quadro).
    return sobre.length ? sobre : ["recorte-sobre"];
  }
  const cheia = conteudo ? [] : (["tela-cheia"] as const);
  if (midia === "video") return conteudo ? [] : ["broll"];
  return [...sobre, ...cheia];
}

/** A mídia que o formato pede (o recorte entra sobre a gravação; a janela e a tela cheia levam a composição; o B-roll é vídeo). */
export function midiaDoFormato(f: FormatoDaJornada): MidiaDaJornada {
  return f === "recorte-sobre" ? "recorte" : f === "broll" ? "video" : f === "grafico" ? "grafico" : "imagem";
}

export const CRITERIO_DO_FORMATO: Record<FormatoDaJornada, string> = {
  "tela-cheia": "a imagem ocupa a tela inteira por 2 a 4 s, com a voz por baixo: para a ideia central que pede atenção total",
  janela: "a imagem numa janela ao lado da pessoa, que segue em cena: para ilustrar sem tirar a pessoa",
  "recorte-sobre": "o objeto, ícone ou logo recortado entra sobre a gravação, na área livre: para o detalhe, a marca, o número",
  broll: "B-roll em vídeo, tela cheia, com a voz por baixo: para respirar e mostrar o assunto em movimento",
  grafico: "gráfico desenhado ao lado da pessoa (texto, número, ícone, cronômetro, lista, linha do tempo): a pessoa segue falando na tela",
};

// ─────────────────────────────── o custo ───────────────────────────────

/** A janela da abertura obrigatória (07/10): algo de impacto sempre entra nos primeiros 6 s. */
export const SEGUNDOS_DA_ABERTURA = 6;

/** Segundos de B-roll gerado por elemento (o Kling cobra no mínimo 3 s). */
export const SEGUNDOS_DO_BROLL = 3;

/** A estimativa de UM elemento pela tabela única de preços. */
export function custoDoElementoDaJornada(midia: MidiaDaJornada, comTexto: boolean): number {
  const imagem = DOLAR_POR_IMAGEM["higgsfield-gpt-image-2.5-high"];
  const leitura = comTexto ? 0.002 : 0;
  if (midia === "grafico") return 0;
  if (midia === "video") return +(SEGUNDOS_DO_BROLL * DOLAR_POR_SEGUNDO_DE_VIDEO["kling-pro"]).toFixed(4);
  if (midia === "recorte") return +(imagem + DOLAR_POR_RECORTE + leitura).toFixed(4);
  return +(imagem + leitura).toFixed(4);
}

/** O teto de custo das mídias por vídeo (mostrado ao cliente na tela do passo 5). */
export function tetoDoVideoUsd(duracao: number): number {
  // 1,7 desde 07/10: a imagem foi para a qualidade ALTA (2,8x o preço do medium) e o teto subiu na mesma
  // proporção, para a quantidade de elementos não cair com a troca (o Bruno pediu qualidade alta, sem corte).
  const porMinuto = Number(process.env.JORNADA_TETO_USD_POR_MINUTO ?? 1.7);
  return +Math.max(1, (duracao / 60) * porMinuto).toFixed(2);
}

// ─────────────────────────────── as perguntas ───────────────────────────────

function trechoEm(leitura: LeituraDoVideo | null, t: number): TrechoLido | null {
  if (!leitura?.trechos?.length) return null;
  return leitura.trechos.find((x) => t >= x.de && t < x.ate) ?? leitura.trechos.at(-1) ?? null;
}

export type EspacoLivre = { topo: number; lateral: number; baixo?: number };
export type MomentoComIdeias = { frase: Frase; ideias: IdeiaCrua[]; trecho: TrechoLido | null; livre?: EspacoLivre | null };

/**
 * O ESPAÇO LIVRE do momento pela medição (geometria): a faixa acima do rosto e a maior lateral fora dele, dentro da
 * área segura, na união dos rostos de todas as amostras do momento. Sem amostra, null (vale a área livre lida).
 */
export function espacoLivre(amostras: AmostraDaJornada[] | null | undefined, de: number, ate: number, formato: "9:16" | "16:9"): EspacoLivre | null {
  const dentro = (amostras ?? []).filter((a) => a.t >= de - 1.2 && a.t <= ate + 1.2 && a.rostos.length);
  if (!dentro.length) return null;
  const seg = formato === "9:16" ? { topo: 0.1, esquerda: 0.05, direita: 0.12 } : { topo: 0.06, esquerda: 0.04, direita: 0.04 };
  const rostos = dentro.flatMap((a) => a.rostos);
  const topo = Math.min(...rostos.map((r) => r.y - 0.018)) - seg.topo;
  // A lateral livre é a de fora do CORPO (o passo 7 não põe elemento sobre a pessoa), com a mesma tolerância de beirada.
  const corpos = dentro.flatMap((a) => a.corpos);
  const pessoa = corpos.length ? corpos : rostos;
  const esquerda = Math.min(...pessoa.map((r) => r.x + r.w * 0.08)) - seg.esquerda;
  const direita = 1 - seg.direita - Math.max(...pessoa.map((r) => r.x + r.w * 0.92));
  // A faixa entre o queixo e a legenda (07/10): pode cobrir o corpo, nunca o rosto.
  const fimDoRosto = Math.max(...rostos.map((r) => r.y + r.h)) + 0.02;
  const baixo = (formato === "9:16" ? 0.68 : 0.83) - fimDoRosto;
  return { topo: Math.max(0, +topo.toFixed(3)), lateral: Math.max(0, +Math.max(esquerda, direita).toFixed(3)), baixo: Math.max(0, +baixo.toFixed(3)) };
}

/** Os momentos que têm ideia, com o trecho lido e o espaço livre medido. */
export function momentosComIdeias(frases: Frase[], ideias: IdeiaCrua[], leitura: LeituraDoVideo | null, amostras?: AmostraDaJornada[] | null, formato: "9:16" | "16:9" = "16:9"): MomentoComIdeias[] {
  const porFrase = new Map<number, IdeiaCrua[]>();
  for (const i of ideias) porFrase.set(i.frase, [...(porFrase.get(i.frase) ?? []), i]);
  return frases.filter((f) => porFrase.has(f.indice)).map((f) => ({ frase: f, ideias: porFrase.get(f.indice)!, trecho: trechoEm(leitura, f.inicio), livre: espacoLivre(amostras, f.inicio, f.fim, formato) }));
}

const LETRAS = ["a", "b"];

/** As perguntas do lote (puro): força, ideia e formato por momento, e a densidade. */
export function perguntasDoPlano(momentos: MomentoComIdeias[], o: { formato: "9:16" | "16:9"; duracao: number; genero: GeneroDoVideo | null }): Record<string, PerguntaDoJev> {
  const q: Record<string, PerguntaDoJev> = {};
  q.densidade = {
    type: "choice",
    instructions: { pergunta: "Qual o ritmo de elementos visuais deste vídeo (segundos médios entre um elemento e o seguinte)?", duracaoSegundos: Math.round(o.duracao), formato: o.formato, generoLido: o.genero ?? "outro" },
    criteria: Object.fromEntries(opcoesDeDensidade(o.duracao, o.genero).map((x) => [x.id, x.criterio])),
  };
  momentos.forEach((m, j) => {
    const anterior = momentos[j - 1]?.ideias.map((x) => x.descricao) ?? [];
    const k = m.frase.indice;
    const cena = m.trecho ? { acontece: m.trecho.acontece, mostra: m.trecho.mostra, movimento: m.trecho.movimento } : null;
    q[`f${k}`] = {
      type: "score",
      instructions: { pergunta: "Quanto este momento da fala pede um elemento visual?", fala: m.frase.texto, emCena: cena },
      criteria: ["não pede: ligação, hesitação, repetição", "pede pouco: complemento", "pede: uma ideia clara que a imagem reforça", "pede muito: a ideia central, um número, um nome, uma imagem concreta dita"],
    };
    q[`i${k}`] = {
      type: "choice",
      instructions: { pergunta: "Qual destas ideias serve melhor a esta fala, a este público e a esta cena? Ou nenhuma. Uma ideia que repete o assunto do momento anterior do mesmo jeito não serve.", fala: m.frase.texto, emCena: cena, ideiasDoMomentoAnterior: anterior },
      criteria: { ...Object.fromEntries(m.ideias.map((x, i) => [LETRAS[i], `${x.descricao}${x.textoNaImagem ? ` (texto na arte: "${x.textoNaImagem}")` : ""}`])), nenhuma: "nenhuma serve, ou repete o assunto do momento anterior: o momento fica com a gravação" },
    };
    const possiveis = [...new Set(m.ideias.flatMap((x) => formatosPossiveis(x.midia, m.trecho, o.formato, m.livre, o.duracao > 180)))];
    if (possiveis.length > 1) {
      q[`m${k}`] = {
        type: "choice",
        instructions: { pergunta: "Como o elemento entra neste momento?", fala: m.frase.texto, emCena: cena, ideias: m.ideias.map((x) => x.descricao) },
        criteria: Object.fromEntries(possiveis.map((f) => [f, CRITERIO_DO_FORMATO[f]])),
      };
    }
  });
  return q;
}

// ─────────────────────────────── a escolha ───────────────────────────────

// A escolha do JEV vale mesmo com confiança baixa (é a opção mais provável dele); só a falta de resposta é falta.
const escolhaDe = (r: RespostaDoJev | undefined, opcoes: readonly string[], _minimo = 0.3): string | null => {
  void _minimo;
  return r && r.type === "choice" && opcoes.includes(r.choice) ? r.choice : null;
};

const notaDe = (r: RespostaDoJev | undefined): number | null => (r && r.type === "score" && typeof r.score === "number" ? r.score : null);

export type DecisaoDoPlano = {
  densidade: OpcaoDeDensidade;
  elementos: ElementoProposto[];
  descartados: Array<{ frase: number; motivo: string }>;
  custoTotalUsd: number;
};

/**
 * As respostas do JEV viram o plano (puro). O código só aplica os limites
 * físicos: ordem pela força, espaço mínimo da densidade, nunca dois juntos,
 * a quantidade que a densidade dá na duração e o teto de custo.
 */
export function planoDasRespostas(
  momentos: MomentoComIdeias[],
  r: Record<string, RespostaDoJev>,
  o: { formato: "9:16" | "16:9"; duracao: number; duracaoTotal?: number; genero: GeneroDoVideo | null; tetoUsd: number; novoId: (k: number) => string }
): DecisaoDoPlano {
  const opcoes = opcoesDeDensidade(o.duracaoTotal ?? o.duracao, o.genero);
  const idDens = escolhaDe(r.densidade, opcoes.map((x) => x.id), 0.2);
  // Sem a resposta do JEV, a do meio (só a geometria das opções; nada por estilo).
  const densidade = opcoes.find((x) => x.id === idDens) ?? opcoes[1];
  const descartados: DecisaoDoPlano["descartados"] = [];
  type Cand = { m: MomentoComIdeias; ideia: IdeiaCrua; formato: FormatoDaJornada; forca: number };
  const cands: Cand[] = [];
  const primeiros: Cand[] = [];
  for (const m of momentos) {
    const k = m.frase.indice;
    // Pergunta sem resposta do JEV (falha do lote) não descarta a ideia em silêncio: a força fica no meio e a ideia é a primeira, com o motivo anotado.
    const semForca = notaDe(r[`f${k}`]) === null;
    const semIdeia = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) === null;
    const forca = notaDe(r[`f${k}`]) ?? 1.5;
    const letra = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) ?? "a";
    if (semForca || semIdeia) descartados.push({ frase: k, motivo: `o JEV não respondeu (${semForca ? "força" : "ideia"}); a ideia seguiu para a escolha com força média` });
    // OS PRIMEIROS 6 s (07/10): guardados mesmo com força baixa, para a abertura obrigatória.
    const ideiaCedo = m.ideias.filter((x) => x.gatilho.t < SEGUNDOS_DA_ABERTURA).sort((a, b) => Number(b.papel === "abertura") - Number(a.papel === "abertura"))[0];
    if (ideiaCedo) {
      const pos = formatosPossiveis(ideiaCedo.midia, m.trecho, o.formato, m.livre, (o.duracaoTotal ?? o.duracao) > 180);
      if (pos.length) primeiros.push({ m, ideia: ideiaCedo, formato: pos[0], forca });
    }
    // No vídeo curto, "pede pouco" já entra (07/10, Bruno: mais efeitos); no longo, só o que pede.
    const piso = (o.duracaoTotal ?? o.duracao) <= 180 ? 0.9 : 1.5;
    if (letra === "nenhuma" || forca < piso) {
      descartados.push({ frase: k, motivo: letra === "nenhuma" ? "o JEV disse nenhuma" : `força ${forca.toFixed(2)}` });
      continue;
    }
    const ideia = m.ideias[LETRAS.indexOf(letra)];
    const possiveis = formatosPossiveis(ideia.midia, m.trecho, o.formato, m.livre, (o.duracaoTotal ?? o.duracao) > 180);
    if (!possiveis.length) {
      descartados.push({ frase: k, motivo: "a tela ou o quadro ocupam o momento e não há lugar ao lado" });
      continue;
    }
    const escolhido = escolhaDe(r[`m${k}`], FORMATOS_DA_JORNADA as unknown as string[]) as FormatoDaJornada | null;
    const formato = escolhido && possiveis.includes(escolhido) ? escolhido : possiveis[0];
    cands.push({ m, ideia, formato, forca });
  }
  const meta = Math.max(1, Math.floor(o.duracao / ((densidade.faixa[0] + densidade.faixa[1]) / 2)));
  // A densidade é uma MÉDIA: dois momentos fortes podem ficar mais perto que ela (nunca a menos de metade do piso, nem de 2,5 s).
  const minimo = Math.max(2.5, densidade.faixa[0] / 2);
  const escolhidos: Cand[] = [];
  let custo = 0;
  for (const c of [...cands].sort((a, b) => b.forca - a.forca || a.ideia.gatilho.t - b.ideia.gatilho.t)) {
    if (escolhidos.length >= meta) {
      descartados.push({ frase: c.m.frase.indice, motivo: "a densidade escolhida já está cheia" });
      continue;
    }
    if (escolhidos.some((e) => Math.abs(e.ideia.gatilho.t - c.ideia.gatilho.t) < minimo)) {
      descartados.push({ frase: c.m.frase.indice, motivo: `a menos de ${minimo} s de outro elemento` });
      continue;
    }
    const preco = custoDoElementoDaJornada(midiaDoFormato(c.formato), Boolean(c.ideia.textoNaImagem));
    if (custo + preco > o.tetoUsd + 1e-9) {
      descartados.push({ frase: c.m.frase.indice, motivo: `teto de US$ ${o.tetoUsd}` });
      continue;
    }
    custo += preco;
    escolhidos.push(c);
  }
  // A ABERTURA OBRIGATÓRIA (07/10, Bruno): nos primeiros 6 s sempre entra algo de impacto. Se nada escolhido cai ali,
  // entra o candidato mais forte da janela, mesmo com a densidade cheia (o gráfico não custa geração).
  if (!escolhidos.some((e) => e.ideia.gatilho.t < SEGUNDOS_DA_ABERTURA) && primeiros.length) {
    const melhor = [...primeiros].sort((a, b) => b.forca - a.forca || a.ideia.gatilho.t - b.ideia.gatilho.t)[0];
    const longe = escolhidos.filter((e) => Math.abs(e.ideia.gatilho.t - melhor.ideia.gatilho.t) < 2);
    for (const l of longe) escolhidos.splice(escolhidos.indexOf(l), 1);
    custo += custoDoElementoDaJornada(midiaDoFormato(melhor.formato), Boolean(melhor.ideia.textoNaImagem));
    escolhidos.push({ ...melhor, ideia: { ...melhor.ideia, papel: melhor.ideia.papel === "chamada" ? "chamada" : "abertura" } });
    descartados.push({ frase: melhor.m.frase.indice, motivo: "entrou como abertura obrigatória dos primeiros 6 s" });
  }
  // NO MÁXIMO UM GRÁFICO A CADA TRÊS ELEMENTOS (08/10, Bruno: "parece feito em código"; no Igor, 6 de 6 e 6 de 7
  // elementos foram gráficos de código). O excedente TROCA pela ideia de IA do mesmo momento (o redator escreve as
  // duas); sem ela, o gráfico mais fraco sai. A abertura é a última a trocar e nunca sai.
  const tetoDeGraficos = Math.max(1, Math.floor(escolhidos.length / 3));
  let excesso = escolhidos.filter((e) => e.formato === "grafico").length - tetoDeGraficos;
  const graficos = escolhidos
    .filter((e) => e.formato === "grafico")
    .sort((a, b) => Number(a.ideia.papel === "abertura") - Number(b.ideia.papel === "abertura") || a.forca - b.forca);
  for (const g of graficos) {
    if (excesso <= 0) break;
    // Sem ideia de IA no momento, uma é derivada do próprio gráfico: o objeto do assunto gerado por IA, e o número ou
    // a frase entram como texto em camada por cima (o redator do texto recebe a fala), a receita da landing.
    const alternativa =
      g.m.ideias.find((x) => x.midia !== "grafico") ??
      (g.ideia.papel !== "abertura" ? { ...g.ideia, midia: "recorte" as const, textoNaImagem: null, descricao: `Objeto ou símbolo concreto gerado por IA, isolado, que representa este momento: ${g.ideia.descricao}`.slice(0, 400) } : undefined);
    const possiveis = alternativa ? formatosPossiveis(alternativa.midia, g.m.trecho, o.formato, g.m.livre, (o.duracaoTotal ?? o.duracao) > 180) : [];
    const i = escolhidos.indexOf(g);
    if (alternativa && possiveis.length) {
      escolhidos[i] = { ...g, ideia: { ...alternativa, papel: g.ideia.papel }, formato: possiveis[0] };
      custo += custoDoElementoDaJornada(midiaDoFormato(possiveis[0]), Boolean(alternativa.textoNaImagem));
      descartados.push({ frase: g.m.frase.indice, motivo: "gráfico trocado pela ideia gerada por IA do mesmo momento (teto de um gráfico a cada três)" });
    } else if (g.ideia.papel !== "abertura") {
      escolhidos.splice(i, 1);
      descartados.push({ frase: g.m.frase.indice, motivo: "gráficos de código acima do teto de um a cada três elementos" });
    } else continue;
    excesso--;
  }
  escolhidos.sort((a, b) => a.ideia.gatilho.t - b.ideia.gatilho.t);
  const elementos: ElementoProposto[] = escolhidos.map((c, i) => {
    const midia = midiaDoFormato(c.formato);
    return {
      id: o.novoId(i),
      momento: { indice: c.m.frase.indice, de: c.m.frase.inicio, ate: c.m.frase.fim, frase: c.m.frase.texto },
      gatilho: c.ideia.gatilho,
      descricao: c.ideia.descricao,
      textoNaImagem: c.ideia.textoNaImagem,
      midia,
      formato: c.formato,
      porque: c.ideia.porque,
      custoUsd: custoDoElementoDaJornada(midia, Boolean(c.ideia.textoNaImagem)),
      origem: "ia",
      papel: c.ideia.papel,
    };
  });
  return { densidade, elementos, descartados, custoTotalUsd: +custo.toFixed(4) };
}

/** As decisões do plano pelo JEV (uma chamada em lote). Sem o JEV, lança: a decisão é dele, sem recuo silencioso. */
export async function decidirPlano(
  momentos: MomentoComIdeias[],
  o: { contexto: ContextoDaJornada; leitura: LeituraDoVideo | null; jev: Jev; projectId?: string | null; novoId: (k: number) => string }
): Promise<DecisaoDoPlano> {
  const genero = o.leitura?.genero ?? null;
  // As opções de densidade são as da duração do vídeo inteiro; a quantidade, a do trecho planejado.
  const total = o.contexto.duracaoTotal ?? o.contexto.duracao;
  const perguntas = perguntasDoPlano(momentos, { formato: o.contexto.formato, duracao: total, genero });
  const estado = {
    tarefa: "decidir os elementos visuais de um vídeo, momento a momento, para o público deste nicho",
    empresa: o.contexto.marca,
    nicho: o.contexto.nicho,
    estiloDoCliente: o.contexto.estiloDoCliente || "não escreveu",
    destino: o.contexto.destino,
    leitura: o.leitura ? { genero: o.leitura.genero, cenario: o.leitura.cenario, resumo: o.leitura.resumo } : null,
  };
  const r = await o.jev({ projectId: o.projectId, etapa: "jornada-plano", state: estado }, perguntas);
  return planoDasRespostas(momentos, r, { formato: o.contexto.formato, duracao: o.contexto.duracao, duracaoTotal: total, genero, tetoUsd: tetoDoVideoUsd(o.contexto.duracao), novoId: o.novoId });
}
