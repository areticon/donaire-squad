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
  // Tela ou quadro com o rosto NA FRENTE é fundo, não conteúdo (08/10: no Igor, a leitura deu "tela" do quadro
  // inteiro atrás dele e o B-roll realista sumiu do vídeo todo), a mesma regra de protegidasNoIntervalo.
  const conteudo = [trecho?.tela, trecho?.quadro].some((c) => c && !temRostoNaFrente(c, trecho));
  const sobre: FormatoDaJornada[] =
    midia === "recorte" ? [...(recorte ? (["recorte-sobre"] as const) : []), ...(janela ? (["janela"] as const) : [])] : [...(janela ? (["janela"] as const) : []), ...(recorte ? (["recorte-sobre"] as const) : [])];
  // VÍDEO CURTO (07/10, Bruno): o efeito entra COM a pessoa na tela; sem tela cheia de imagem parada. O B-roll
  // REALISTA em vídeo volta (08/10, Bruno: "cadê os vídeos realistas no meio, família feliz, moto"), curto e com teto
  // de um a cada 20 s (planoDasRespostas), para cortar para a cena e voltar para a pessoa.
  if (!longo) {
    if (midia === "video" && !conteudo) return ["broll"];
    // Sem lugar folgado ao lado, o OBJETO entra como recorte sobre o corpo (nunca sobre o rosto), e não vira texto
    // (08/10: no Igor, a moto dita virou painel de texto em código porque o rosto ocupava o quadro).
    return sobre.length ? sobre : ["recorte-sobre"];
  }
  const cheia = conteudo ? [] : (["tela-cheia"] as const);
  if (midia === "video") return conteudo ? [] : ["broll"];
  return [...sobre, ...cheia];
}

/** A tela ou o quadro tem o centro de algum rosto do trecho dentro dele (a pessoa está na frente: é fundo). Puro. */
export function temRostoNaFrente(c: { x: number; y: number; w: number; h: number }, trecho: TrechoLido | null): boolean {
  return (trecho?.pessoasEmCena ?? []).some((p) => {
    const r = p.rosto;
    if (!r) return false;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h;
  });
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

// Até três ideias por momento: as duas do redator e a cena em vídeo do pedido dirigido (08/10).
const LETRAS = ["a", "b", "c"];

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
      criteria: { ...Object.fromEntries(m.ideias.map((x, i) => [LETRAS[i], `${x.descricao}${x.textoNaImagem ? ` (texto na arte: "${x.textoNaImagem}")` : ""}`])), nenhuma: "todas fogem do que a fala diz, ou repetem do mesmo jeito o momento anterior: o momento fica só com a gravação" },
    };
    // AS CENAS REALISTAS (08/10, Bruno: "cadê os vídeos realistas top no meio"): no vídeo curto, cada cena em vídeo
    // proposta ganha nota própria; na escolha do momento, ao lado de um número ou de uma palavra, ela sempre perdia.
    if (o.duracao <= 180)
      m.ideias.forEach((x, i) => {
        if (x.midia !== "video") return;
        q[`v${k}_${i}`] = {
          type: "score",
          instructions: { pergunta: "Quanto esta cena realista em vídeo (B-roll cinematográfico de 2 a 3 s: o vídeo corta da pessoa para a cena e volta) prende o espectador e serve a esta fala, a este público e ao estilo do cliente?", fala: m.frase.texto, cena: x.descricao },
          criteria: ["não serve: fora do que a fala conta, ou algo que o cliente proibiu com todas as letras", "serve pouco: genérica", "serve: mostra o que a fala conta", "prende: a cena que faz parar de rolar o feed"],
        };
      });
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
  // A RESERVA (08/10): os candidatos que caíram só por força baixa, densidade ou espaçamento (nunca os que o JEV
  // recusou com "nenhuma"), para tapar buraco longo no vídeo curto. E os NÚMEROS DITOS, que sempre aparecem.
  const reserva: Cand[] = [];
  const numeros: Cand[] = [];
  const curto = (o.duracaoTotal ?? o.duracao) <= 180;
  for (const m of momentos) {
    const k = m.frase.indice;
    // Pergunta sem resposta do JEV (falha do lote) não descarta a ideia em silêncio: a força fica no meio e a ideia é a primeira, com o motivo anotado.
    const semForca = notaDe(r[`f${k}`]) === null;
    const semIdeia = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) === null;
    const forca = notaDe(r[`f${k}`]) ?? 1.5;
    const letra = escolhaDe(r[`i${k}`], [...LETRAS.slice(0, m.ideias.length), "nenhuma"]) ?? "a";
    if (semForca || semIdeia) descartados.push({ frase: k, motivo: `o JEV não respondeu (${semForca ? "força" : "ideia"}); a ideia seguiu para a escolha com força média` });
    // OS PRIMEIROS 6 s (07/10): guardados mesmo com força baixa, para a abertura obrigatória.
    // A ideia gerada por IA antes do gráfico de código (08/10), e a de papel "abertura" antes das outras.
    const ideiaCedo = m.ideias
      .filter((x) => x.gatilho.t < SEGUNDOS_DA_ABERTURA)
      .sort((a, b) => Number(a.midia === "grafico") - Number(b.midia === "grafico") || Number(b.papel === "abertura") - Number(a.papel === "abertura"))[0];
    if (ideiaCedo) {
      const pos = formatosPossiveis(ideiaCedo.midia, m.trecho, o.formato, m.livre, (o.duracaoTotal ?? o.duracao) > 180);
      if (pos.length) primeiros.push({ m, ideia: ideiaCedo, formato: pos[0], forca });
    }
    if (curto) for (const x of m.ideias) if (x.midia === "grafico" && /\d/.test(x.textoNaImagem ?? "")) numeros.push({ m, ideia: x, formato: "grafico", forca });
    // No vídeo curto, "pede pouco" já entra (07/10, Bruno: mais efeitos); no longo, só o que pede.
    const piso = curto ? 0.9 : 1.5;
    if (letra === "nenhuma") {
      descartados.push({ frase: k, motivo: "o JEV disse nenhuma" });
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
    if (forca < piso) {
      descartados.push({ frase: k, motivo: `força ${forca.toFixed(2)}` });
      reserva.push({ m, ideia, formato, forca });
      continue;
    }
    cands.push({ m, ideia, formato, forca });
  }
  const meta = Math.max(1, Math.floor(o.duracao / ((densidade.faixa[0] + densidade.faixa[1]) / 2)));
  // A densidade é uma MÉDIA: dois momentos fortes podem ficar mais perto que ela (nunca a menos de metade do piso, nem de 2,5 s).
  const minimo = Math.max(2.5, densidade.faixa[0] / 2);
  const escolhidos: Cand[] = [];
  let custo = 0;
  const numeroNoCand = (c: Cand) => /\d/.test(`${c.ideia.textoNaImagem ?? ""} ${c.ideia.gatilho.palavra}`);
  for (const c of [...cands].sort((a, b) => b.forca - a.forca || a.ideia.gatilho.t - b.ideia.gatilho.t)) {
    if (escolhidos.length >= meta) {
      descartados.push({ frase: c.m.frase.indice, motivo: "a densidade escolhida já está cheia" });
      reserva.push(c);
      continue;
    }
    if (escolhidos.some((e) => Math.abs(e.ideia.gatilho.t - c.ideia.gatilho.t) < minimo)) {
      descartados.push({ frase: c.m.frase.indice, motivo: `a menos de ${minimo} s de outro elemento` });
      reserva.push(c);
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
  // O NÚMERO DITO SEMPRE APARECE (08/10, Bruno: "o que a pessoa fala aparece"; no Igor, o JEV disse "nenhuma" no
  // momento do R$ 152.638 e o plano ficou 14 s vazio). No vídeo curto, o número que o redator escreveu entra mesmo
  // assim, e o que estiver a menos de 2 s dele (que não seja a abertura nem outro número) dá lugar.
  for (const n of numeros) {
    if (escolhidos.some((e) => e.formato === "grafico" && (e.ideia.textoNaImagem ?? "") === n.ideia.textoNaImagem)) continue;
    const perto = escolhidos.filter((e) => Math.abs(e.ideia.gatilho.t - n.ideia.gatilho.t) < 2);
    if (perto.some((e) => e.ideia.papel === "abertura" || (e.formato === "grafico" && numeroNoCand(e)))) continue;
    for (const p of perto) {
      escolhidos.splice(escolhidos.indexOf(p), 1);
      descartados.push({ frase: p.m.frase.indice, motivo: "deu lugar ao número dito" });
    }
    escolhidos.push(n);
    descartados.push({ frase: n.m.frase.indice, motivo: "número dito: sempre aparece no vídeo curto" });
  }
  // AS CENAS REALISTAS QUE O JEV PONTUOU (08/10): no vídeo curto, as de nota "serve" para cima entram, da melhor
  // para a pior, até uma a cada 20 s, nunca na abertura e a pelo menos 8 s uma da outra; o que estiver no mesmo
  // momento (ou mais perto que o espaço mínimo) dá lugar a ela.
  if ((o.duracaoTotal ?? o.duracao) <= 180) {
    const querem = Math.max(1, Math.floor(o.duracao / 20));
    const cenas = momentos
      .flatMap((m) => m.ideias.map((ideia, i) => ({ m, ideia, nota: notaDe(r[`v${m.frase.indice}_${i}`]) })))
      .filter((c): c is { m: MomentoComIdeias; ideia: IdeiaCrua; nota: number } => c.ideia.midia === "video" && c.nota !== null && c.nota >= 1.5)
      .filter((c) => c.ideia.gatilho.t >= SEGUNDOS_DA_ABERTURA && formatosPossiveis("video", c.m.trecho, o.formato, c.m.livre, false).includes("broll"))
      .sort((a, b) => b.nota - a.nota);
    for (const c of cenas) {
      if (escolhidos.filter((e) => e.formato === "broll").length >= querem) break;
      if (escolhidos.some((e) => e.ideia === c.ideia)) continue;
      if (escolhidos.some((e) => e.formato === "broll" && Math.abs(e.ideia.gatilho.t - c.ideia.gatilho.t) < 8)) continue;
      // Só sai o que cai dentro da cena (ela dura uns 3 s) ou mais perto que o espaço mínimo: no Igor, o número dito
      // 3,7 s depois do "depositado", na mesma frase, saía junto.
      const perto = escolhidos.filter((e) => Math.abs(e.ideia.gatilho.t - c.ideia.gatilho.t) < Math.max(minimo, SEGUNDOS_DO_BROLL + 0.5));
      // Nem a abertura nem o NÚMERO dito saem para a cena (08/10: no Igor, a cena dos 17,6 s tirou o R$ 424.757).
      if (perto.some((e) => e.ideia.papel === "abertura" || (e.formato === "grafico" && numeroNoCand(e)))) continue;
      for (const p of perto) {
        escolhidos.splice(escolhidos.indexOf(p), 1);
        descartados.push({ frase: p.m.frase.indice, motivo: "deu lugar à cena realista em vídeo que o JEV pontuou" });
      }
      escolhidos.push({ m: c.m, ideia: { ...c.ideia, papel: "elemento" }, formato: "broll", forca: c.nota });
      descartados.push({ frase: c.m.frase.indice, motivo: `cena realista em vídeo, nota ${c.nota.toFixed(2)} do JEV` });
    }
  }
  // O B-ROLL NO VÍDEO CURTO (08/10): no máximo um a cada 20 s; o excedente mais fraco troca pela outra ideia do
  // momento (o objeto junto da pessoa) ou sai. A pessoa fica na tela a maior parte do tempo.
  if ((o.duracaoTotal ?? o.duracao) <= 180) {
    const tetoDeBroll = Math.max(1, Math.floor(o.duracao / 20));
    const brolls = escolhidos.filter((e) => e.formato === "broll").sort((a, b) => a.forca - b.forca);
    for (const b of brolls.slice(0, Math.max(0, brolls.length - tetoDeBroll))) {
      const i = escolhidos.indexOf(b);
      const outra = b.m.ideias.find((x) => x.midia !== "video");
      const pos = outra ? formatosPossiveis(outra.midia, b.m.trecho, o.formato, b.m.livre, false) : [];
      if (outra && pos.length) {
        escolhidos[i] = { ...b, ideia: { ...outra, papel: b.ideia.papel }, formato: pos[0] };
        descartados.push({ frase: b.m.frase.indice, motivo: "B-roll acima do teto de um a cada 20 s: entrou a outra ideia do momento" });
      } else {
        escolhidos.splice(i, 1);
        descartados.push({ frase: b.m.frase.indice, motivo: "B-roll acima do teto de um a cada 20 s" });
      }
    }
  }
  // NO MÁXIMO UM GRÁFICO A CADA TRÊS ELEMENTOS (08/10, Bruno: "parece feito em código"; no Igor, 6 de 6 e 6 de 7
  // elementos foram gráficos de código). O excedente TROCA pela ideia de IA do mesmo momento (o redator escreve as
  // duas); sem ela, o gráfico mais fraco sai. A abertura é a última a trocar e nunca sai.
  // NENHUM BURACO LONGO NO VÍDEO CURTO (08/10: no Igor, 14 s sem nada entre o R$ 2.645 e o fim): enquanto houver
  // trecho sem elemento maior que duas vezes o espaço da densidade (no mínimo 6 s), entra o candidato mais forte da
  // reserva dentro dele, longe das pontas. B-roll não entra por aqui (ele tem teto próprio).
  if (curto) {
    const lacuna = Math.max(6, densidade.faixa[1] * 2);
    for (let volta = 0; volta < 30; volta++) {
      const marcos = [0, ...escolhidos.map((e) => e.ideia.gatilho.t).sort((a, b) => a - b), o.duracao];
      let melhor: Cand | null = null;
      for (let j = 0; j < marcos.length - 1; j++) {
        const de = marcos[j] + (j === 0 ? 0.5 : minimo);
        const ate = marcos[j + 1] - (j === marcos.length - 2 ? 1 : minimo);
        if (marcos[j + 1] - marcos[j] <= lacuna) continue;
        for (const c of reserva) {
          if (c.formato === "broll" || c.ideia.gatilho.t <= de || c.ideia.gatilho.t >= ate) continue;
          if (escolhidos.some((e) => e.ideia === c.ideia)) continue;
          if (!melhor || c.forca > melhor.forca) melhor = c;
        }
      }
      if (!melhor) break;
      escolhidos.push(melhor);
      descartados.push({ frase: melhor.m.frase.indice, motivo: `entrou para o vídeo curto não ficar mais de ${lacuna} s sem elemento` });
    }
  }
  // O NÚMERO DITO fica fora do teto (08/10, Bruno: "o valor bem grande subindo até chegar no valor final"): ele é a
  // prova do momento, nunca vira objeto vago (no Igor, o R$ 424.757 virou) nem cena. O teto vale para palavra e frase.
  const ehNumero = numeroNoCand;
  const tetoDeGraficos = Math.max(1, Math.floor(escolhidos.length / 3));
  let excesso = escolhidos.filter((e) => e.formato === "grafico" && !ehNumero(e)).length - tetoDeGraficos;
  const graficos = escolhidos
    .filter((e) => e.formato === "grafico" && !ehNumero(e))
    .sort((a, b) => Number(a.ideia.papel === "abertura") - Number(b.ideia.papel === "abertura") || a.forca - b.forca);
  for (const g of graficos) {
    if (excesso <= 0) break;
    // Sem ideia de IA no momento, uma é derivada do próprio gráfico: o objeto do assunto gerado por IA, e o número ou
    // a frase entram como texto em camada por cima (o redator do texto recebe a fala), a receita da landing.
    // O número dito só troca por uma ideia de IA de verdade do mesmo momento; nunca por objeto derivado (ele é a prova).
    const alternativa =
      g.m.ideias.find((x) => x.midia !== "grafico") ??
      // A descrição sai da FALA, não do gráfico (08/10: "objeto que representa: número contando até R$ 424.757" virava
      // pedido de imagem com número escrito, o que o gerador erra).
      (g.ideia.papel !== "abertura" && !ehNumero(g) ? { ...g.ideia, midia: "recorte" as const, textoNaImagem: null, descricao: `O objeto concreto do que é dito aqui, gerado por IA, isolado, sem número nem texto escrito: "${g.m.frase.texto}"`.slice(0, 400) } : undefined);
    const possiveis = alternativa ? formatosPossiveis(alternativa.midia, g.m.trecho, o.formato, g.m.livre, (o.duracaoTotal ?? o.duracao) > 180) : [];
    const i = escolhidos.indexOf(g);
    if (alternativa && possiveis.length) {
      escolhidos[i] = { ...g, ideia: { ...alternativa, papel: g.ideia.papel }, formato: possiveis[0] };
      custo += custoDoElementoDaJornada(midiaDoFormato(possiveis[0]), Boolean(alternativa.textoNaImagem));
      descartados.push({ frase: g.m.frase.indice, motivo: "gráfico trocado pela ideia gerada por IA do mesmo momento (teto de um gráfico a cada três)" });
    } else if (g.ideia.papel !== "abertura" && !ehNumero(g)) {
      escolhidos.splice(i, 1);
      descartados.push({ frase: g.m.frase.indice, motivo: "gráficos de código acima do teto de um a cada três elementos" });
    } else continue;
    excesso--;
  }
  // O TETO conferido sobre os elementos FINAIS (as trocas acima mudam o preço): acima dele, sai o mais fraco que custa,
  // nunca a abertura.
  const precoDe = (c: Cand) => custoDoElementoDaJornada(midiaDoFormato(c.formato), Boolean(c.ideia.textoNaImagem));
  while (escolhidos.reduce((s, c) => s + precoDe(c), 0) > o.tetoUsd + 1e-9) {
    const sai = escolhidos.filter((c) => c.ideia.papel !== "abertura" && precoDe(c) > 0).sort((a, b) => a.forca - b.forca)[0];
    if (!sai) break;
    escolhidos.splice(escolhidos.indexOf(sai), 1);
    descartados.push({ frase: sai.m.frase.indice, motivo: `teto de US$ ${o.tetoUsd}` });
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
  return { densidade, elementos, descartados, custoTotalUsd: +elementos.reduce((s, e) => s + e.custoUsd, 0).toFixed(4) };
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
    // A DIREÇÃO DO PRODUTO (08/10, Bruno): no Igor, o estilo "pouquíssimo texto, muito respiro" virou "nenhuma" em
    // metade dos momentos e o vídeo saiu com 4 elementos. O estilo diz COMO o efeito aparece, não SE ele aparece.
    direcaoDoProduto:
      total <= 180
        ? "vídeo curto que prende: algo novo na tela a cada 2 a 4 s, com a pessoa falando, e cenas realistas em vídeo cortando para a história cerca de uma a cada 20 s. O estilo do cliente decide COMO cada elemento aparece (cor, tom, acabamento, quanto texto), não se o vídeo tem elementos."
        : "vídeo longo: elementos mais espaçados, nos momentos que pedem; o estilo do cliente decide como cada elemento aparece.",
    destino: o.contexto.destino,
    leitura: o.leitura ? { genero: o.leitura.genero, cenario: o.leitura.cenario, resumo: o.leitura.resumo } : null,
  };
  const r = await o.jev({ projectId: o.projectId, etapa: "jornada-plano", state: estado }, perguntas);
  return planoDasRespostas(momentos, r, { formato: o.contexto.formato, duracao: o.contexto.duracao, duracaoTotal: total, genero, tetoUsd: tetoDoVideoUsd(o.contexto.duracao), novoId: o.novoId });
}
