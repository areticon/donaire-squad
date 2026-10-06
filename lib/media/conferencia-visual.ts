import { prisma } from "@/lib/db/prisma";
import { conferirResposta, marcarChamadaOk } from "@/lib/fornecedores/aviso-de-saldo";
import { custoDaVisao, modeloDaVisao } from "@/lib/media/leitura-do-video";
import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type RespostaDoJev } from "@/lib/jev/cliente";
import { frasesNumeradas, resolverAncora } from "@/lib/media/editor-sob-medida/resolver";
import { ehApoio } from "@/lib/media/editor-sob-medida/pecas";
import type { EdicaoResolvida, MidiaDaInsercao } from "@/lib/media/editor-sob-medida/tipos";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { NotaDoRevisor } from "@/lib/media/editor-por-comando/diretor";

/**
 * A CONFERÊNCIA VISUAL DE VERDADE (06/10/2026).
 *
 * Diagnóstico do vídeo cmux0hoxk: o completo saiu com `revisaoVisual.final`
 * sem nenhuma IA ter olhado o resultado. Colagem de 3 fotos em tela cheia,
 * imagem genérica fora do assunto e texto sobreposto passaram. Aqui, nas duas
 * pontas, com a regra da casa (Gemini só DESCREVE, o JEV DECIDE, nada de LLM
 * de texto decidindo):
 *
 *   1. ANTES DE USAR cada imagem gerada (as `insercoes` do editor por
 *      comando): o Gemini responde perguntas objetivas sobre a imagem
 *      (colagem ou grade, texto ou letras, pessoa reconhecível, o assunto, o
 *      que o comando proíbe e aparece). O JEV decide com a descrição, a fala
 *      do momento e o comando: aprova, refaz UMA vez (a cena reescrita em
 *      código com o que a descrição achou) ou tira a imagem (o momento fica
 *      com a pessoa e as outras peças).
 *   2. DEPOIS DO RENDER do completo: quadros a cada ~2,5 s e no começo de cada
 *      peça; o Gemini descreve os problemas visuais de cada quadro (texto
 *      sobreposto ou cortado, legenda escondida, peça no rosto, janela
 *      minúscula, quadro vazio); o JEV decide, peça a peça, se reprova. As
 *      reprovadas voltam ao editor, que replaneja só aqueles momentos (teto de
 *      1 rodada).
 *
 * Custo no ai_usage: "conferencia-visual-imagem" e "conferencia-visual-video"
 * (o Gemini) e "jev-conferencia-visual-*" (o JEV). Alvo: ~US$ 0,01 por minuto
 * de vídeo mais as imagens refeitas.
 *
 * Interruptor: CONFERENCIA_VISUAL=0 desliga as duas pontas; sem GEMINI_API_KEY
 * fica desligada.
 */

export function conferenciaVisualLigada(): boolean {
  return process.env.CONFERENCIA_VISUAL !== "0" && Boolean(process.env.GEMINI_API_KEY);
}

// ─────────────────────────────── o olho (Gemini, só descreve) ───────────────────────────────

export type ImagemParaOlhar = { base64: string; mimeType?: string; rotulo?: string };

export type PedidoAoOlho = {
  sistema: string;
  tarefa: string;
  imagens: ImagemParaOlhar[];
  esquema: Record<string, unknown>;
  /** "media" para os quadros do vídeo (256 tokens por imagem); "padrao" para a imagem gerada. */
  resolucao?: "media" | "padrao";
  projectId?: string | null;
  operation: string;
};

export type Olho = (p: PedidoAoOlho) => Promise<{ json: unknown; custoUsd: number }>;

const BASE = "https://generativelanguage.googleapis.com";

/** O Gemini com imagens inline e resposta em JSON pelo esquema. Grava o custo no ai_usage. */
export const olhoDoGemini: Olho = async (p) => {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = modeloDaVisao();
  const parts: Array<Record<string, unknown>> = [];
  for (const im of p.imagens) {
    if (im.rotulo) parts.push({ text: im.rotulo });
    parts.push({ inlineData: { mimeType: im.mimeType ?? "image/jpeg", data: im.base64 } });
  }
  parts.push({ text: p.tarefa });
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: p.sistema }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: p.esquema,
      temperature: 0.1,
      maxOutputTokens: 8192,
      ...(p.resolucao === "media" ? { mediaResolution: "MEDIA_RESOLUTION_MEDIUM" } : {}),
      // Descrever não pede raciocínio: sem os tokens de pensamento (o custo cai pela metade).
      ...(/2\.5-flash/.test(modelo) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  const url = `${BASE}/v1beta/models/${modelo}:generateContent?key=${chave}`;
  const chamar = () => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, signal: AbortSignal.timeout(180_000) });
  let r = await chamar();
  if (r.status === 429 || r.status >= 500) {
    await new Promise((x) => setTimeout(x, 3_000));
    r = await chamar();
  }
  if (!r.ok) {
    const erro = await r.text().catch(() => "");
    await conferirResposta("google", { status: r.status, corpo: erro }, "conferência visual");
    throw new Error(`visão respondeu ${r.status}: ${erro.slice(0, 200)}`);
  }
  const j = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const entrada = j.usageMetadata?.promptTokenCount ?? 0;
  const saida = (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
  const custoUsd = custoDaVisao(modelo, entrada, saida);
  marcarChamadaOk("google");
  void prisma.aiUsage
    .create({ data: { projectId: p.projectId ?? null, operation: p.operation, model: modelo, inputTokens: entrada, outputTokens: saida, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUsd: custoUsd } })
    .catch((e: unknown) => console.error("[conferencia-visual] falha ao gravar o uso (ignorado):", e instanceof Error ? e.message : e));
  const texto = j.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim < 0) throw new Error(`visão não devolveu JSON (${j.candidates?.[0]?.finishReason ?? "sem motivo"})`);
  return { json: JSON.parse(texto.slice(ini, fim + 1)), custoUsd };
};

/** O juiz (JEV): o mesmo contrato de `perguntarAoJev`, injetável na prova. */
export type Juiz = typeof perguntarAoJev;

// ─────────────────────────────── 1. a imagem gerada, antes de entrar ───────────────────────────────

export type DescricaoDaImagem = {
  colagem: boolean;
  paineis: number;
  temTexto: boolean;
  textoLido: string;
  pessoaReconhecivel: boolean;
  assunto: string;
  proibidosVistos: string[];
  defeitos: string;
};

const ESQUEMA_DA_IMAGEM = {
  type: "OBJECT",
  properties: {
    colagem: { type: "BOOLEAN" },
    paineis: { type: "INTEGER" },
    temTexto: { type: "BOOLEAN" },
    textoLido: { type: "STRING" },
    pessoaReconhecivel: { type: "BOOLEAN" },
    assunto: { type: "STRING" },
    proibidosVistos: { type: "ARRAY", items: { type: "STRING" } },
    defeitos: { type: "STRING" },
  },
  required: ["colagem", "paineis", "temTexto", "pessoaReconhecivel", "assunto", "proibidosVistos"],
};

const SISTEMA_DA_IMAGEM = `Você descreve uma imagem, de forma objetiva, para um editor de vídeo que vai decidir se ela entra. Você NÃO decide nada: só responde o que vê.
Responda em português, curto:
- "colagem": true se a imagem é colagem, grade, mosaico, díptico, tríptico, quadrinho ou tem vários painéis ou molduras separadas;
- "paineis": quantos quadros ou painéis distintos há (1 quando é uma cena só);
- "temTexto": true se há qualquer texto, letra, número, placa, logotipo ou legenda legível ou pseudo letra;
- "textoLido": o texto que dá para ler, letra por letra (vazio se não há);
- "pessoaReconhecivel": true se há rosto humano nítido e de frente que identifica alguém, ou figura pública;
- "assunto": o que a imagem mostra, em uma frase concreta (objetos, lugar, ação);
- "proibidosVistos": os elementos que o PEDIDO DO CLIENTE proíbe ou rejeita e que aparecem na imagem (lista vazia se nenhum);
- "defeitos": deformação, mão ou objeto quebrado, borda branca, marca d'água (vazio se não há).
Sem travessão.`;

export function lerDescricaoDaImagem(cru: unknown): DescricaoDaImagem {
  const o = (cru ?? {}) as Record<string, unknown>;
  const s = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  return {
    colagem: Boolean(o.colagem),
    paineis: Math.max(1, Math.round(Number(o.paineis) || 1)),
    temTexto: Boolean(o.temTexto),
    textoLido: s(o.textoLido, 160),
    pessoaReconhecivel: Boolean(o.pessoaReconhecivel),
    assunto: s(o.assunto, 240),
    proibidosVistos: Array.isArray(o.proibidosVistos) ? (o.proibidosVistos as unknown[]).map((x) => s(x, 80)).filter(Boolean).slice(0, 6) : [],
    defeitos: s(o.defeitos, 200),
  };
}

export type InsercaoDoPlano = { id?: string; de: string; ate: string; briefing: string; midia?: string; combinada?: boolean; oQueAparece?: string };

export type DecisaoDaImagem = "aprovar" | "refazer" | "trocar";

export type ConferidaDaImagem = {
  id: string;
  rodada: 0 | 1;
  descricao: DescricaoDaImagem | null;
  decisao: DecisaoDaImagem;
  porQue: string;
};

/** A fala do momento da inserção (as âncoras F6:palavra resolvidas na transcrição). */
export function falaDaInsercao(ins: Pick<InsercaoDoPlano, "de" | "ate">, palavras: PalavraNoCorte[]): string {
  const frases = frasesNumeradas(palavras);
  const a = resolverAncora(ins.de as never, frases, palavras);
  const b = resolverAncora(ins.ate as never, frases, palavras);
  if (a === null) return "";
  const fim = Math.max(b ?? a + 3, a + 1.5);
  return palavras
    .filter((w) => w.fim > a - 0.3 && w.inicio < fim + 0.3)
    .map((w) => w.texto)
    .join(" ")
    .slice(0, 300);
}

/**
 * A cena REESCRITA para a única refação: o que a descrição achou vira ordem no
 * COMEÇO do briefing (o briefing estilizado é cortado no fim pelo teto), e o
 * assunto passa a ser o que a fala diz. Genérico: vale para qualquer estilo.
 */
export function cenaReescrita(briefing: string, d: DescricaoDaImagem | null, fala: string): string {
  const ordens: string[] = [];
  // "Uma cena só" e não "sem colagem": o acabamento de colagem pode ser o estilo pedido; dividir em painéis nunca é.
  if (!d || d.paineis > 1) ordens.push("ONE single scene filling the frame: never split into several panels, a grid, a triptych, separate frames or borders.");
  if (!d || d.temTexto) ordens.push("Absolutely no text, letters, numbers, signs, logos or captions anywhere.");
  if (!d || d.pessoaReconhecivel) ordens.push("No recognizable face: people only from behind, in silhouette, as hands or far away.");
  if (d?.proibidosVistos.length) ordens.push(`Do not show: ${d.proibidosVistos.join(", ")}.`);
  if (fala) ordens.push(`The scene must clearly and literally depict what this spoken line is about (Portuguese): "${fala.slice(0, 220)}".`);
  return `${ordens.join(" ")} ${briefing}`.trim();
}

const OPCOES_DA_IMAGEM = ["aprovar", "refazer", "trocar"] as const;

/** Sem o JEV (fora do ar ou desligado): o padrão seguro pelos fatos descritos. */
export function decisaoDeReserva(d: DescricaoDaImagem | null, jaRefeita: boolean): DecisaoDaImagem {
  if (!d) return "aprovar";
  const ruim = d.paineis > 1 || d.temTexto || d.pessoaReconhecivel || d.proibidosVistos.length > 0;
  if (!ruim) return "aprovar";
  return jaRefeita ? "trocar" : "refazer";
}

async function decidirImagens(
  itens: Array<{ id: string; fala: string; briefing: string; descricao: DescricaoDaImagem | null; jaRefeita: boolean }>,
  ctx: { comando: string; projectId?: string | null; juiz: Juiz }
): Promise<Record<string, { decisao: DecisaoDaImagem; porQue: string }>> {
  const saida: Record<string, { decisao: DecisaoDaImagem; porQue: string }> = {};
  const comDescricao = itens.filter((x) => x.descricao);
  for (const x of itens) saida[x.id] = { decisao: decisaoDeReserva(x.descricao, x.jaRefeita), porQue: x.descricao ? "padrão seguro pelos fatos descritos" : "sem descrição: a imagem fica" };
  if (!comDescricao.length || !(jevLigado() || ctx.juiz !== perguntarAoJev)) return saida;
  let r: Record<string, RespostaDoJev> = {};
  try {
    r = await ctx.juiz(
      { projectId: ctx.projectId, etapa: "conferencia-visual-imagem", state: { pedidoDoCliente: ctx.comando.slice(0, 1200), regra: "imagem de vídeo: uma cena só, sem texto, sem rosto reconhecível, mostrando o que a fala do momento diz, sem o que o cliente proíbe" } },
      Object.fromEntries(
        comDescricao.map((x, k) => [
          `i${k}`,
          {
            type: "choice" as const,
            instructions: {
              pergunta: x.jaRefeita
                ? "Esta imagem JÁ foi refeita uma vez. Ela pode entrar no vídeo neste momento, ou deve sair (o momento fica com a pessoa e as outras peças)?"
                : "Esta imagem gerada pode entrar no vídeo neste momento, deve ser refeita uma vez com a cena reescrita, ou deve sair (o momento fica com a pessoa e as outras peças)?",
              falaDoMomento: x.fala,
              cenaPedida: x.briefing.slice(0, 500),
              descricaoDaImagem: x.descricao,
            },
            criteria: (x.jaRefeita
              ? { aprovar: "a imagem é uma cena só, sem texto e sem rosto reconhecível, sem o que o cliente proíbe, e o assunto combina com a fala", trocar: "a imagem ainda é colagem, tem texto, rosto, algo proibido, ou o assunto não tem a ver com a fala" }
              : {
                  aprovar: "a imagem é uma cena só, sem texto e sem rosto reconhecível, sem o que o cliente proíbe, e o assunto combina com a fala",
                  refazer: "a imagem é colagem ou painéis, tem texto ou letras, rosto reconhecível, algo proibido, ou é genérica e fora do assunto da fala, mas uma cena reescrita resolveria",
                  trocar: "a ideia de imagem não serve para este momento (nenhuma foto ilustraria bem esta fala)",
                }) as Record<string, string>,
          },
        ])
      )
    );
  } catch {
    return saida;
  }
  comDescricao.forEach((x, k) => {
    const resp = r[`i${k}`];
    if (!resp) return;
    const opcoes = x.jaRefeita ? (["aprovar", "trocar"] as const) : OPCOES_DA_IMAGEM;
    const decisao = decidirChoice(resp, opcoes, saida[x.id].decisao, 0.4);
    saida[x.id] = { decisao, porQue: `JEV: ${resp.type === "choice" ? `${resp.choice} (${Math.round((resp.confidence ?? 0) * 100)}%)` : "sem escolha"}` };
  });
  return saida;
}

/** Baixa a imagem (Blob público ou caminho local da prova) em base64. */
export async function baixarImagem(url: string): Promise<ImagemParaOlhar> {
  if (/^https?:\/\//.test(url)) {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
    return { base64: Buffer.from(await r.arrayBuffer()).toString("base64"), mimeType: r.headers.get("content-type") ?? "image/png" };
  }
  const { readFile } = await import("node:fs/promises");
  return { base64: (await readFile(url)).toString("base64"), mimeType: /\.jpe?g$/i.test(url) ? "image/jpeg" : "image/png" };
}

export type ResultadoDasImagens = {
  insercoes: Record<string, MidiaDaInsercao>;
  /** Ids que saíram (o plano tira a inserção e a peça que dependia só dela). */
  tiradas: string[];
  conferidas: ConferidaDaImagem[];
  custoVisaoUsd: number;
  custoImagensUsd: number;
  erros: string[];
};

/**
 * ETAPA 1: confere cada imagem gerada antes de usar. `gerar` refaz UMA imagem
 * com o briefing novo (o mesmo `gerarInsercoes` de quem chama). Vídeo gerado
 * e fundo de combinada não passam aqui (o olho de vídeo é a etapa 2).
 */
export async function conferirImagensGeradas(p: {
  insercoes: Record<string, MidiaDaInsercao>;
  plano: InsercaoDoPlano[];
  palavras: PalavraNoCorte[];
  comando: string;
  projectId?: string | null;
  gerar: (ins: InsercaoDoPlano) => Promise<{ midia: MidiaDaInsercao | null; custoUsd: number }>;
  olho?: Olho;
  juiz?: Juiz;
  baixar?: (url: string) => Promise<ImagemParaOlhar>;
}): Promise<ResultadoDasImagens> {
  const olho = p.olho ?? olhoDoGemini;
  const juiz = p.juiz ?? perguntarAoJev;
  const baixar = p.baixar ?? baixarImagem;
  const insercoes = { ...p.insercoes };
  const conferidas: ConferidaDaImagem[] = [];
  const erros: string[] = [];
  let custoVisaoUsd = 0;
  let custoImagensUsd = 0;
  const alvos = p.plano.filter((x) => x.id && !x.combinada && x.midia !== "video" && insercoes[String(x.id)]?.tipo === "imagem");
  const descrever = async (url: string, fala: string): Promise<DescricaoDaImagem | null> => {
    try {
      const im = await baixar(url);
      const r = await olho({
        sistema: SISTEMA_DA_IMAGEM,
        tarefa: `PEDIDO DO CLIENTE (o estilo e o que ele proíbe): "${p.comando.slice(0, 800)}"\nFALA DO MOMENTO em que a imagem entra: "${fala}"\nDescreva a imagem acima.`,
        imagens: [im],
        esquema: ESQUEMA_DA_IMAGEM,
        projectId: p.projectId,
        operation: "conferencia-visual-imagem",
      });
      custoVisaoUsd += r.custoUsd;
      return lerDescricaoDaImagem(r.json);
    } catch (e) {
      erros.push(`olho da imagem: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      return null;
    }
  };
  const itens = await Promise.all(
    alvos.map(async (x) => {
      const id = String(x.id);
      const fala = falaDaInsercao(x, p.palavras);
      return { id, fala, briefing: x.briefing, descricao: await descrever(insercoes[id].url, fala), jaRefeita: false, ins: x };
    })
  );
  const decisoes = await decidirImagens(itens, { comando: p.comando, projectId: p.projectId, juiz });
  const tiradas: string[] = [];
  const refazer = itens.filter((x) => decisoes[x.id].decisao === "refazer");
  for (const x of itens) {
    const d = decisoes[x.id];
    conferidas.push({ id: x.id, rodada: 0, descricao: x.descricao, decisao: d.decisao, porQue: d.porQue });
    if (d.decisao === "trocar") {
      delete insercoes[x.id];
      tiradas.push(x.id);
    }
  }
  // A ÚNICA refação por imagem, conferida de novo; sobrando defeito, a imagem sai.
  const refeitas = await Promise.all(
    refazer.map(async (x) => {
      const briefing = cenaReescrita(x.briefing, x.descricao, x.fala);
      try {
        const g = await p.gerar({ ...x.ins, briefing });
        custoImagensUsd += g.custoUsd;
        if (!g.midia) return { ...x, briefing, descricao: null as DescricaoDaImagem | null, midia: null as MidiaDaInsercao | null };
        return { ...x, briefing, descricao: await descrever(g.midia.url, x.fala), midia: g.midia, jaRefeita: true };
      } catch (e) {
        erros.push(`refação de ${x.id}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        return { ...x, briefing, descricao: null, midia: null };
      }
    })
  );
  const semNova = refeitas.filter((x) => !x.midia);
  const comNova = refeitas.filter((x) => x.midia);
  const segunda = await decidirImagens(comNova.map((x) => ({ ...x, jaRefeita: true })), { comando: p.comando, projectId: p.projectId, juiz });
  for (const x of semNova) {
    // A refação falhou: a primeira imagem tinha defeito, então sai.
    delete insercoes[x.id];
    tiradas.push(x.id);
    conferidas.push({ id: x.id, rodada: 1, descricao: null, decisao: "trocar", porQue: "a refação não gerou imagem" });
  }
  for (const x of comNova) {
    const d = segunda[x.id];
    const decisao: DecisaoDaImagem = d.decisao === "aprovar" ? "aprovar" : "trocar";
    conferidas.push({ id: x.id, rodada: 1, descricao: x.descricao, decisao, porQue: d.porQue });
    if (decisao === "aprovar") insercoes[x.id] = x.midia!;
    else {
      delete insercoes[x.id];
      tiradas.push(x.id);
    }
  }
  return { insercoes, tiradas, conferidas, custoVisaoUsd: +custoVisaoUsd.toFixed(5), custoImagensUsd: +custoImagensUsd.toFixed(4), erros };
}

// ─────────────────────────────── 2. o vídeo pronto ───────────────────────────────

export const TIPOS_DE_PROBLEMA = ["texto-sobreposto", "texto-cortado", "legenda-escondida", "peca-no-rosto", "janela-minuscula", "quadro-vazio", "colagem-em-tela-cheia", "outro"] as const;
export type TipoDeProblema = (typeof TIPOS_DE_PROBLEMA)[number];

/** Sem o JEV: só os problemas que qualquer pessoa vê reprovam a peça. */
const GRAVES_SEM_JEV = new Set<TipoDeProblema>(["texto-sobreposto", "texto-cortado", "legenda-escondida", "peca-no-rosto", "quadro-vazio", "colagem-em-tela-cheia"]);

export type ProblemaNoQuadro = { t: number; momento: string | null; tipo: TipoDeProblema; descricao: string };

export type PecaReprovada = { momento: string; t: number; problemas: ProblemaNoQuadro[]; probabilidade: number | null };

export type ResultadoDoVideo = {
  quadros: number;
  problemas: ProblemaNoQuadro[];
  reprovadas: PecaReprovada[];
  notas: NotaDoRevisor[];
  custoUsd: number;
  erro: string | null;
  ms: number;
};

/** A peça na tela num instante: a de começo mais recente entre as que cobrem t (apoios fora). */
export function pecaNoInstante(ed: EdicaoResolvida, t: number): EdicaoResolvida["camadas"][number] | null {
  let melhor: EdicaoResolvida["camadas"][number] | null = null;
  for (const c of ed.camadas) {
    if (ehApoio(c) || t < c.de || t >= c.ate) continue;
    if (!melhor || c.de > melhor.de) melhor = c;
  }
  return melhor;
}

/**
 * Os instantes a olhar: um a cada `passo` segundos e logo depois do começo de
 * cada peça (0,5 s, a entrada já assentou), sem repetir vizinhos.
 */
export function instantesDaConferencia(ed: EdicaoResolvida, passo = 2.5, teto = 900): Array<{ t: number; momento: string | null }> {
  const ts: number[] = [];
  for (let t = 0.8; t < ed.duracao - 0.2; t += passo) ts.push(+t.toFixed(2));
  for (const c of ed.camadas) {
    if (ehApoio(c)) continue;
    const t = +Math.min(c.ate - 0.1, c.de + 0.5).toFixed(2);
    if (t >= 0 && t < ed.duracao) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const unicos: number[] = [];
  for (const t of ts) if (!unicos.length || t - unicos[unicos.length - 1] >= 0.4) unicos.push(t);
  const escolhidos = unicos.length <= teto ? unicos : Array.from({ length: teto }, (_, k) => unicos[Math.floor((k * unicos.length) / teto)]);
  return escolhidos.map((t) => ({ t, momento: pecaNoInstante(ed, t)?.id ?? null }));
}

const ESQUEMA_DO_VIDEO = {
  type: "OBJECT",
  properties: {
    quadros: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          k: { type: "INTEGER" },
          problemas: { type: "ARRAY", items: { type: "OBJECT", properties: { tipo: { type: "STRING", enum: [...TIPOS_DE_PROBLEMA] }, descricao: { type: "STRING" } }, required: ["tipo", "descricao"] } },
        },
        required: ["k", "problemas"],
      },
    },
  },
  required: ["quadros"],
};

const SISTEMA_DO_VIDEO = `Você descreve, de forma objetiva, problemas VISUAIS em quadros de um vídeo já editado. Você NÃO decide nada: só descreve o que vê. Cada quadro vem com um rótulo (k, o instante, a peça prevista e a fala).
Liste para cada quadro só os problemas que se veem:
- "texto-sobreposto": um texto em cima de outro texto, ou a legenda em cima do texto de uma peça;
- "texto-cortado": texto saindo da borda, cortado no meio, ou letras ilegíveis;
- "legenda-escondida": a legenda coberta por uma peça ou imagem;
- "peca-no-rosto": peça, imagem ou texto cobrindo o rosto da pessoa;
- "janela-minuscula": imagem ou janela tão pequena que não dá para ver o que mostra;
- "quadro-vazio": tela preta, de uma cor só, ou sem pessoa e sem conteúdo;
- "colagem-em-tela-cheia": imagem em colagem, grade ou vários painéis ocupando a tela;
- "outro": outro defeito visual óbvio (imagem deformada, marca d'água).
Quadro sem problema não entra na lista. Transição curta (flash) não é problema. Descrição curta, em português, sem travessão.`;

const POR_LOTE = 30;
const LOTES_EM_PARALELO = 4;

function rotuloDoQuadro(k: number, t: number, ed: EdicaoResolvida, palavras: PalavraNoCorte[]): string {
  const c = pecaNoInstante(ed, t);
  const texto = c ? Object.values(c.props).filter((v): v is string => typeof v === "string" && !/^(https?:|data:|#)/.test(v)).join(" / ").slice(0, 120) : "";
  const fala = palavras.filter((w) => w.fim > t - 1.5 && w.inicio < t + 1.5).map((w) => w.texto).join(" ").slice(0, 140);
  return `Quadro k=${k} (${t.toFixed(1)} s) | peça: ${c ? `${c.peca}${texto ? ` "${texto}"` : ""}` : "nenhuma (só a pessoa)"} | fala: "${fala}"`;
}

/** O id da camada vira o id do plano (as camadas levam sufixos: "-moldura", "-img"). */
export function idNoPlano(camada: string, ids: Set<string>): string | null {
  let id = camada;
  while (id) {
    if (ids.has(id)) return id;
    const i = id.lastIndexOf("-");
    if (i <= 0) break;
    id = id.slice(0, i);
  }
  return null;
}

/**
 * ETAPA 2: confere o vídeo pronto. Devolve as peças reprovadas pelo JEV e as
 * notas no formato do revisor (o editor replaneja só esses momentos).
 */
export async function conferirVideoPronto(p: {
  edicao: EdicaoResolvida;
  palavras: PalavraNoCorte[];
  comando: string;
  obterQuadros: (instantes: number[]) => Promise<Array<{ t: number; base64: string }>>;
  projectId?: string | null;
  passo?: number;
  olho?: Olho;
  juiz?: Juiz;
}): Promise<ResultadoDoVideo> {
  const t0 = Date.now();
  const olho = p.olho ?? olhoDoGemini;
  const juiz = p.juiz ?? perguntarAoJev;
  const alvos = instantesDaConferencia(p.edicao, p.passo ?? 2.5);
  let quadros: Array<{ t: number; base64: string }> = [];
  try {
    // O worker devolve até 400 prints por pedido.
    for (let i = 0; i < alvos.length; i += 300) quadros.push(...(await p.obterQuadros(alvos.slice(i, i + 300).map((a) => a.t))));
  } catch (e) {
    return { quadros: 0, problemas: [], reprovadas: [], notas: [], custoUsd: 0, erro: `sem quadros do vídeo (${e instanceof Error ? e.message.slice(0, 120) : e})`, ms: Date.now() - t0 };
  }
  quadros = quadros.filter((q) => q?.base64);
  if (!quadros.length) return { quadros: 0, problemas: [], reprovadas: [], notas: [], custoUsd: 0, erro: "sem quadros do vídeo", ms: Date.now() - t0 };
  const lotes: Array<Array<{ t: number; base64: string }>> = [];
  for (let i = 0; i < quadros.length; i += POR_LOTE) lotes.push(quadros.slice(i, i + POR_LOTE));
  const problemas: ProblemaNoQuadro[] = [];
  let custoUsd = 0;
  let falhas = 0;
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < lotes.length) {
      const lote = lotes[proximo++];
      try {
        const r = await olho({
          sistema: SISTEMA_DO_VIDEO,
          tarefa: `PEDIDO DO CLIENTE (o estilo): "${p.comando.slice(0, 600)}"\nDescreva os problemas dos ${lote.length} quadros acima (k de 0 a ${lote.length - 1}). Lista vazia se nenhum tiver problema.`,
          imagens: lote.map((q, k) => ({ base64: q.base64, mimeType: "image/jpeg", rotulo: rotuloDoQuadro(k, q.t, p.edicao, p.palavras) })),
          esquema: ESQUEMA_DO_VIDEO,
          resolucao: "media",
          projectId: p.projectId,
          operation: "conferencia-visual-video",
        });
        custoUsd += r.custoUsd;
        for (const q of ((r.json as { quadros?: Array<{ k?: number; problemas?: Array<{ tipo?: string; descricao?: string }> }> }).quadros ?? [])) {
          const quadro = typeof q.k === "number" ? lote[q.k] : undefined;
          if (!quadro) continue;
          for (const pr of q.problemas ?? []) {
            const tipo = TIPOS_DE_PROBLEMA.find((x) => x === pr.tipo);
            if (!tipo) continue;
            problemas.push({ t: quadro.t, momento: pecaNoInstante(p.edicao, quadro.t)?.id ?? null, tipo, descricao: String(pr.descricao ?? "").slice(0, 200) });
          }
        }
      } catch {
        falhas++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOTES_EM_PARALELO, lotes.length) }, trabalhador));
  const erro = falhas === lotes.length ? "a visão falhou em todos os lotes" : falhas ? `a visão falhou em ${falhas} de ${lotes.length} lote(s)` : null;
  // Por peça: só o que tem peça é consertável (o rosto sozinho é a gravação do cliente).
  const porPeca = new Map<string, ProblemaNoQuadro[]>();
  for (const pr of problemas) if (pr.momento) porPeca.set(pr.momento, [...(porPeca.get(pr.momento) ?? []), pr]);
  const pecas = [...porPeca.entries()];
  const probs: Record<string, number | null> = {};
  if (pecas.length && (jevLigado() || juiz !== perguntarAoJev)) {
    try {
      const r = await juiz(
        { projectId: p.projectId, etapa: "conferencia-visual-video", state: { pedidoDoCliente: p.comando.slice(0, 1200) } },
        Object.fromEntries(
          pecas.map(([id, lista], k) => {
            const c = p.edicao.camadas.find((x) => x.id === id);
            return [
              `p${k}`,
              {
                type: "noul" as const,
                instructions: {
                  pergunta: "No vídeo pronto, esta peça tem problema visual que qualquer espectador vê e que estraga o momento, a ponto de valer tirar a peça e refazer só esse momento?",
                  peca: c ? `${c.peca} de ${c.de.toFixed(1)} s a ${c.ate.toFixed(1)} s` : id,
                  problemasVistos: lista.slice(0, 6).map((x) => `${x.t.toFixed(1)} s, ${x.tipo}: ${x.descricao}`),
                },
              },
            ];
          })
        )
      );
      pecas.forEach(([id], k) => (probs[id] = probabilidadeDeSim(r[`p${k}`])));
    } catch {
      // Sem o JEV, vale o padrão pelos tipos graves.
    }
  }
  const reprovadas: PecaReprovada[] = pecas
    .map(([id, lista]) => {
      const pr = probs[id] ?? null;
      const reprova = pr === null ? lista.some((x) => GRAVES_SEM_JEV.has(x.tipo)) : pr >= 0.5;
      return reprova ? { momento: id, t: lista[0].t, problemas: lista, probabilidade: pr } : null;
    })
    .filter((x): x is PecaReprovada => Boolean(x));
  const notas: NotaDoRevisor[] = reprovadas.map((r) => ({
    t: r.t,
    momento: r.momento,
    problema: [...new Set(r.problemas.map((x) => `${x.tipo}: ${x.descricao}`))].slice(0, 3).join("; "),
    conserto: "tirar a peça e refazer só este momento",
  }));
  return { quadros: quadros.length, problemas, reprovadas, notas, custoUsd: +custoUsd.toFixed(5), erro, ms: Date.now() - t0 };
}
