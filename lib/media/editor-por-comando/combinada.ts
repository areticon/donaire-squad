import { createHash } from "node:crypto";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import { decidirChoice } from "@/lib/jev/cliente";
import type { LinguagemDoVideo } from "@/lib/media/editor-por-comando/linguagem";
import type { MidiaDaInsercao } from "@/lib/media/editor-sob-medida/tipos";

/**
 * AS PEÇAS COMBINADAS (06/10/2026; proposta aprovada pelo Bruno às 12h03):
 * um VÍDEO DE IA AO FUNDO (Higgsfield, Kling 3.0 Pro, texto para vídeo) e a
 * CAMADA EXATA DO REMOTION POR CIMA (pontos, linha, número, fio, etiquetas).
 *
 * Por que as duas metades: o modelo de vídeo dá o que o código não desenha
 * (a vista aérea que anda, o mural com papel e luz de verdade), e erra o que
 * precisa ser exato (nome escrito, número, ponto no lugar, linha ligando duas
 * coisas). Então o fundo é pedido SEM texto, sem rótulo, sem marcador, e tudo
 * o que precisa ser exato é desenhado em código, por cima, com as palavras do
 * falante (worker/remotion/src/sob-medida/pecas/combinadas.tsx).
 *
 * Quem decide o quê (regra do Bruno, 05/10: o JEV decide, o Claude só escreve):
 *   - o TIPO "combinada" num momento: o JEV, entre os tipos de sempre
 *     (elementos.ts, `CRITERIO_DO_TIPO`);
 *   - o FUNDO (vista aérea, mural, mesa, rede) e a LIGAÇÃO (rota, fio ou
 *     nenhuma): o JEV, por momento (`perguntasDaCombinada`);
 *   - a cena em inglês do fundo, as etiquetas, o título e o número: o redator;
 *   - o número só fica quando a fala diz um número (`numeroDito`): regra
 *     explícita, nunca o redator inventando.
 * Nada aqui conhece o nome de um estilo: a linguagem do vídeo entra pelo bloco
 * de estilo do prompt (o acabamento do fundo) e pelo tema das peças (como a
 * etiqueta, o ponto e o fio são desenhados).
 *
 * O quadro branco claro, o VHS e a barra de progresso NÃO são combinadas:
 * ficam só no Remotion, sem fundo de IA (a proposta de 06/10).
 */

/** Os fundos que o JEV escolhe para a combinada. `cena` é a base em inglês que o redator completa; `marcador` é como o ponto se desenha sobre esse fundo. */
export type FundoDaCombinada = "vista-aerea" | "mural" | "mesa" | "rede";
export type LigacaoDaCombinada = "rota" | "fio" | "nenhuma";

export type FichaDoFundo = { id: FundoDaCombinada; criterio: string; cena: string; marcador: "ponto" | "alfinete" };

export const FUNDOS_DA_COMBINADA: FichaDoFundo[] = [
  {
    id: "vista-aerea",
    criterio: "VISTA AÉREA OU DE SATÉLITE de uma região, cidades, estradas, campo ou território: a fala cita lugares, uma expansão, de onde para onde, um caminho, um alcance no mapa.",
    cena: "a slow top-down aerial or satellite view of a real-looking territory (towns, roads, fields, rivers), seen from high above",
    marcador: "ponto",
  },
  {
    id: "mural",
    criterio: "MURAL DE INVESTIGAÇÃO ou quadro de cortiça com papéis, fotos sem rosto e documentos: a fala liga pessoas, fatos, causas e partes de uma história, ou mostra que tudo está conectado.",
    // Sem "documentos" (prova de 06/10: o fundo do mural saiu com letras inventadas nos papéis): só papel em branco e fotos sem gente.
    cena: "a frontal view of a cork investigation wall with blank paper notes, blank index cards and small blank photographs pinned to it, every paper empty, warm practical light",
    marcador: "alfinete",
  },
  {
    id: "mesa",
    criterio: "SUPERFÍCIE DE TRABALHO VISTA DE CIMA (mesa, planta, caderno, mapa de papel): a fala organiza, planeja, monta um projeto, um processo ou uma rotina por partes.",
    cena: "a top-down view of a work table with blank paper sheets, a closed plain notebook and simple tools, every paper empty, soft window light moving across it",
    marcador: "alfinete",
  },
  {
    id: "rede",
    criterio: "CÉU NOTURNO, CIDADE À NOITE OU REDE DE LUZES: a fala fala de conexões, alcance, comunidade, gente espalhada, crescimento em rede.",
    cena: "a slow drift over a night landscape or city lights seen from far above, small points of light scattered in the dark",
    marcador: "ponto",
  },
];

export const FUNDO = Object.fromEntries(FUNDOS_DA_COMBINADA.map((f) => [f.id, f])) as Record<FundoDaCombinada, FichaDoFundo>;

export const CRITERIO_DA_LIGACAO: Record<LigacaoDaCombinada, string> = {
  rota: "ROTA: os itens são ditos em sequência, como um caminho, uma expansão ou uma ordem (de um lugar para o outro, um depois do outro): uma linha passa por eles na ordem.",
  fio: "FIO: os itens se ligam entre si como causa, relação ou parte de um todo (isso está ligado àquilo): fios ligam os itens.",
  nenhuma: "NENHUMA: os itens só são citados juntos, sem ordem nem ligação entre eles.",
};

/** A combinada decidida pelo JEV num momento. */
export type DecisaoDaCombinada = { fundo: FundoDaCombinada; ligacao: LigacaoDaCombinada };

/** A reserva sem resposta do JEV: lugar dito vai para a vista aérea; o resto para o mural, sem ligação. */
export function combinadaPorPalavras(fala: string): DecisaoDaCombinada {
  const t = fala.toLowerCase();
  const lugar = /\b(cidade|cidades|pa[ií]s|na[cç][oõ]es|regi[aã]o|estado|estrada|caminho|terra|territ[oó]rio|bairro|mundo|norte|sul|leste|oeste|direita|esquerda)\b/.test(t);
  return { fundo: lugar ? "vista-aerea" : "mural", ligacao: "nenhuma" };
}

/** As perguntas ao JEV de um momento combinado: o fundo e a ligação (pergunta de escolha, com a fala do momento). */
export function perguntasDaCombinada(id: string, fala: string, emCena?: string | null): Record<string, PerguntaDoJev> {
  const ctx = `MOMENTO (${id}): "${fala.slice(0, 320)}".${emCena ? ` ${emCena.slice(0, 240)}` : ""}`;
  return {
    [`fundo_${id}`]: {
      type: "choice",
      instructions: `${ctx} Este momento vai ter um VÍDEO GERADO AO FUNDO com etiquetas, pontos e linhas desenhados por cima. Qual fundo em movimento serve melhor ao que a fala diz?`,
      criteria: Object.fromEntries(FUNDOS_DA_COMBINADA.map((f) => [f.id, f.criterio])),
    },
    [`ligacao_${id}`]: {
      type: "choice",
      instructions: `${ctx} Os itens que a fala cita neste momento (lugares, pessoas, partes) se ligam como?`,
      criteria: CRITERIO_DA_LIGACAO,
    },
  };
}

/** A decisão de um momento pelas respostas do JEV (com a reserva por palavras quando a confiança é baixa). */
export function decisaoDasRespostas(id: string, fala: string, r: Record<string, RespostaDoJev>): DecisaoDaCombinada {
  const recuo = combinadaPorPalavras(fala);
  return {
    fundo: decidirChoice(r[`fundo_${id}`], FUNDOS_DA_COMBINADA.map((f) => f.id), recuo.fundo, 0.3),
    ligacao: decidirChoice(r[`ligacao_${id}`], ["rota", "fio", "nenhuma"] as const, recuo.ligacao, 0.3),
  };
}

// ─────────────────────────────── o número só quando dito ───────────────────────────────

// "um" e "uma" ficam de fora: são artigo na maioria das falas ("uma igreja").
const PALAVRA_DE_NUMERO = /\b(dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte|trinta|cem|cento|mil|milh[aã]o|milh[oõ]es|bilh[aã]o|bilh[oõ]es|metade|dobro|triplo)\b/i;

/**
 * O NÚMERO DA CAMADA só fica quando a fala DIZ um número (regra explícita, a
 * mesma do resto do editor: nunca inventar dado). Com algarismo na fala, os
 * algarismos do valor têm de estar nela; sem algarismo, a fala precisa ter
 * uma palavra de número. Devolve o número limpo, ou null.
 */
export function numeroDito(numero: unknown, fala: string): { valor: number; prefixo?: string; sufixo?: string; rotulo?: string } | null {
  if (!numero || typeof numero !== "object") return null;
  const n = numero as Record<string, unknown>;
  const valor = Number(String(n.valor ?? "").replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const digitosDaFala = (fala.match(/\d+([.,]\d+)?/g) ?? []).map((x) => x.replace(/[.,]/g, ""));
  const digitosDoValor = String(valor).replace(/[.,-]/g, "");
  const dito = digitosDaFala.length ? digitosDaFala.some((d) => d === digitosDoValor || d.startsWith(digitosDoValor)) : PALAVRA_DE_NUMERO.test(fala);
  if (!dito) return null;
  const curto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined);
  return { valor, ...(curto(n.prefixo, 6) ? { prefixo: curto(n.prefixo, 6) } : {}), ...(curto(n.sufixo, 10) ? { sufixo: curto(n.sufixo, 10) } : {}), ...(curto(n.rotulo, 40) ? { rotulo: curto(n.rotulo, 40) } : {}) };
}

// ─────────────────────────────── o prompt do fundo ───────────────────────────────

/**
 * A GUARDA DO FUNDO COMBINADO: diferente da guarda do B-roll (que pede câmera
 * que se mexe muito), o fundo da combinada é uma PLACA para gráfico: a câmera
 * anda devagar e sempre para o centro (o worker põe um empurrão de 10% por
 * cima, e a camada do Remotion acompanha o mesmo empurrão), sem corte, sem
 * giro, e sem nada escrito ou marcado (as etiquetas, os pontos, as linhas e
 * os números são nossos, em código).
 */
export const GUARDA_DO_FUNDO_COMBINADO =
  " Background plate for animated graphics: one continuous shot with a LOCKED-OFF STATIC CAMERA (no pan, no tilt, no drift, no zoom, no cuts); only small things inside the scene move (light, shadows, dust, water, clouds). Leave calm open areas for labels. Absolutely no text, no letters, no numbers, no handwriting, no printed documents, no labels, no captions, no map pins, no markers, no arrows, no drawn lines, no threads, no logos, no watermark; every paper and sign is blank. No recognizable person; people only far away or as silhouettes. Nothing sensual.";

/**
 * O QUE É DA CAMADA NÃO VAI AO FUNDO (06/10, prova do trecho de Isaías 54:3):
 * o bloco de estilo do vídeo descreve TODA a linguagem, inclusive o que na
 * combinada é trabalho do código por cima (títulos serifados, recortes de
 * jornal com letra, setas, carimbos, marca-texto, rabiscos de caneta). Pedir
 * isso ao modelo de vídeo é pedir texto e marca inventados no fundo. Então o
 * fundo leva o bloco SEM as orações que falam disso (o material, a luz, o
 * grão e a cor ficam), e a cena SEM movimento de câmera (o empurrão é nosso).
 * É limpeza por regra explícita, como a do travessão: não decide estilo.
 */
const DA_CAMADA = /\b(titles?|text|texts|letters?|lettering|words?|typograph\w*|type|font|serif|sans|headlines?|captions?|labels?|newspapers?|letterpress|print(ed)? fragments?|arrows?|stamps?|scribbl\w*|highlighter|ballpoint|pens?|markers?|pins?|notes? with|handwrit\w*|writing|signs?|numbers?|logos?|threads?|strings?|yarn|connected by|linking|connecting|lines? between)\b/i;
const DA_CAMERA = /\b(camera|dolly|pan(s|ning)?|zoom(s|ing)?|orbit(s|ing)?|tilt(s|ing)?|tracking|crane|drift(s|ing)? (slowly )?(out|left|right|up|down))\b/i;

/** As orações (separadas por vírgula, ponto e vírgula, dois-pontos ou ponto) que sobram sem o que é da camada. */
export function semOQueEDaCamada(texto: string, proibido: RegExp = DA_CAMADA): string {
  return texto
    .replace(/\s+/g, " ")
    .split(/(?<=[,;:.])\s+/)
    .filter((o) => !proibido.test(o))
    .join(" ")
    .replace(/[,;:]\s*$/, "")
    .trim();
}

/** O prompt final do fundo: a cena do redator (com a base do fundo), o bloco de estilo do vídeo sem o que é da camada, e a guarda do fundo. */
export function promptDoFundoCombinado(cena: string, fundo: FundoDaCombinada, linguagem: Pick<LinguagemDoVideo, "blocoDeEstilo">): string {
  const limpa = cena.replace(/\s+/g, " ").replace(/\s*\u2014\s*/g, ", ").trim();
  const c = semOQueEDaCamada(semOQueEDaCamada(semOQueEDaCamada(limpa, DA_CAMERA), /\b(documents?|newspapers?|books?|letters?|notes? with|written|printed)\b/i)).replace(/\.$/, "").slice(0, 500);
  const base = FUNDO[fundo]?.cena ?? FUNDO["vista-aerea"].cena;
  const bloco = semOQueEDaCamada(linguagem.blocoDeEstilo.trim()).replace(/\.$/, "");
  return `${c || base}. Setting: ${base}.${bloco ? ` Look and material: ${bloco}.` : ""}${GUARDA_DO_FUNDO_COMBINADO}`;
}

/** Os segundos do vídeo de fundo: o tempo da peça com folga, na faixa que o Kling cobra (3 a 5 s; a ficha da peça vai até 5 s). */
export const segundosDoFundo = (duracaoDaPeca: number) => Math.min(5, Math.max(3, Math.ceil(duracaoDaPeca + 0.4)));

// ─────────────────────────────── a geração (Higgsfield) ───────────────────────────────

type InsercaoCombinada = { id?: string; briefing: string; segundos?: number };

/** Quanto a montagem espera os fundos ficarem prontos (s). EDITOR_COMBINADA_ESPERA_SEG ajusta sem deploy de código. */
export function esperaDosFundos(): number {
  const v = Number(process.env.EDITOR_COMBINADA_ESPERA_SEG);
  return Number.isFinite(v) && v >= 0 ? v : 300;
}

/**
 * OS FUNDOS DAS COMBINADAS: pede todos ao mesmo tempo (o checkpoint de cada
 * pedido fica no Blob antes de qualquer outra coisa: um pedido pago nunca se
 * repete, regra de lib/media/higgsfield.ts) e espera até `esperarSeg`. O que
 * ficou pronto volta como inserção em vídeo; o que não ficou sai com aviso, e
 * a camada da peça cai na folha sobre a gravação (resolver.ts), desenhada com
 * o fundo próprio dela. O pedido continua guardado: uma refeita com o mesmo
 * prompt pega o vídeo pronto sem pagar de novo. Sem HIGGSFIELD_NA_EDICAO=1,
 * nada é pedido.
 */
export async function gerarFundosCombinados(
  lista: InsercaoCombinada[],
  o: { formato: "16:9" | "9:16"; projectId?: string | null; esperarSeg?: number; aoPedir?: (id: string, custoUsd: number) => void }
): Promise<{ insercoes: Record<string, MidiaDaInsercao>; custoUsd: number; erros: string[] }> {
  const insercoes: Record<string, MidiaDaInsercao> = {};
  const erros: string[] = [];
  if (!lista.length) return { insercoes, custoUsd: 0, erros };
  const { pedirGeracao, concluirSePronto, higgsfieldNaEdicaoLigada } = await import("@/lib/media/higgsfield");
  if (!higgsfieldNaEdicaoLigada()) return { insercoes, custoUsd: 0, erros: ["fundos das combinadas: HIGGSFIELD_NA_EDICAO desligada, as peças saem na folha sobre a gravação"] };
  const referencia = `combinada-${String(o.projectId ?? "sem-projeto").replace(/[^a-z0-9-]/gi, "")}`;
  const pedidos: Array<{ id: string; chave: string; custo: number }> = [];
  await Promise.all(
    lista.map(async (ins, k) => {
      const id = String(ins.id ?? `c${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `c${k + 1}`;
      const segundos = Math.min(5, Math.max(3, Math.ceil(ins.segundos ?? 4)));
      const prompt = String(ins.briefing ?? "").slice(0, 1600);
      const chave = `fundo-${createHash("sha1").update(`${prompt}|${segundos}|${o.formato}`).digest("hex").slice(0, 16)}`;
      try {
        const g = await pedirGeracao({ modelo: "kling-pro", prompt, segundos, proporcao: o.formato, referencia, chave });
        pedidos.push({ id, chave, custo: g.custoEstimadoUsd });
        o.aoPedir?.(id, g.custoEstimadoUsd);
      } catch (err) {
        erros.push(`fundo ${id}: ${err instanceof Error ? err.message.slice(0, 160) : err}`);
      }
    })
  );
  const prazo = Date.now() + (o.esperarSeg ?? esperaDosFundos()) * 1000;
  const pendentes = new Set(pedidos.map((p) => p.id));
  let custo = 0;
  while (pendentes.size && Date.now() < prazo) {
    for (const p of pedidos) {
      if (!pendentes.has(p.id)) continue;
      try {
        const g = await concluirSePronto(referencia, p.chave, { projectId: o.projectId ?? undefined, operation: "editor-combinada-fundo" });
        if (g?.blobUrl) {
          insercoes[p.id] = { url: g.blobUrl, tipo: "video", origem: "gerado" };
          custo += p.custo;
          pendentes.delete(p.id);
        } else if (g && ["failed", "nsfw", "canceled", "cancelled"].includes(g.status ?? "")) {
          erros.push(`fundo ${p.id}: a Higgsfield fechou o pedido como ${g.status}`);
          pendentes.delete(p.id);
        }
      } catch (err) {
        // Instabilidade na consulta: o pedido segue lá; tenta na volta seguinte.
        console.warn(`[combinada] consulta do fundo ${p.id} falhou: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    }
    if (pendentes.size) await new Promise((r) => setTimeout(r, 8000));
  }
  if (pendentes.size) erros.push(`fundos das combinadas: ${pendentes.size} não ficaram prontos em ${o.esperarSeg ?? esperaDosFundos()} s (${[...pendentes].join(", ")}); o pedido fica guardado e uma refeita usa o vídeo pronto`);
  return { insercoes, custoUsd: +custo.toFixed(4), erros };
}
