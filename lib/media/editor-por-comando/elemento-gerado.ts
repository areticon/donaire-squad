import { DOLAR_POR_IMAGEM, DOLAR_POR_RECORTE } from "@/lib/credits/higgsfield-tabela";
import type { perguntarAoJev, RespostaDoJev } from "@/lib/jev/cliente";

/**
 * OS ELEMENTOS GERADOS POR IA (06/10/2026, noite). Regra do Bruno, repetida
 * muitas vezes: TODOS os elementos visuais da edição são gerados por IA, pela
 * Higgsfield. O código (Remotion) só posiciona, anima a entrada e a saída e
 * desenha a legenda da fala. As cinco peças vetoriais de 06/10 à tarde
 * (desenhadas em código com 76 ícones lucide) saíram no vídeo
 * cmux4417u000004l56g3x5urx com ícone genérico no lugar do logo das redes,
 * ícone quebrado e coladas na borda; foram removidas do worker.
 *
 * A ESTEIRA DE CADA ELEMENTO:
 *   1. o REDATOR (Claude, só escreve) descreve o elemento inteiro em inglês
 *      em `props.prompt`, com o texto exato e as marcas citadas;
 *   2. `montarPromptDoElemento` (código, regra explícita) acrescenta o texto
 *      exato entre aspas, o LOGO OFICIAL de cada marca citada, as cores da
 *      identidade em hex, o fundo liso para recorte, a alta resolução e "no
 *      misspellings";
 *   3. a imagem sai da Higgsfield pelo GPT Image 2.5 em qualidade média
 *      (marketing-studio/image/sunburst, o melhor modelo da conta para texto
 *      legível e logo, US$ 0,06; IMAGEM_ELEMENTO_IA troca sem deploy);
 *   4. o fundo sai no BiRefNet da fal (US$ 0,003), e a imagem é aparada;
 *   5. A REVISÃO É DO USUÁRIO (jornada oficial do editor, 06/10 à noite: o
 *      passo 5 é o usuário aprovar ou revisar, e o passo 8 é ele aprovar o
 *      vídeo). A conferência visual automática foi DESLIGADA na produção e
 *      não está na jornada: `olhar` fica fora das dependências de verdade. O
 *      código dela (o Gemini descreve e lê, o JEV decide, refaz uma vez, se
 *      persistir o elemento sai) continua aqui, testado, para quando o Bruno
 *      quiser ligar (ELEMENTO_CONFERENCIA=1).
 *
 * SEM MOLDE: não existe composição de reserva por tipo. Sem o prompt do
 * redator (Sonnet, a partir da fala, da leitura do vídeo e do pedido do
 * usuário), o elemento não é gerado e sai do plano. Dois momentos com o mesmo
 * prompt: o segundo sai (cada elemento é próprio do seu momento).
 *
 * CADA EDIÇÃO É ALGO NOVO (06/10): o elemento é gravado num nome único por
 * geração (lib/media/geracao-unica.ts) e nunca procurado antes de gerar.
 *
 * Módulo puro: a geração, o recorte, o olho e o juiz entram por injeção (a
 * prova sem IA paga usa simulações; o servidor passa os de verdade em
 * `elemento-gerado-servidor.ts`).
 */

/** Os tipos de elemento cujo VISUAL é gerado por IA (o nome só dá a caixa e a âncora no worker). */
export const TIPOS_GERADOS_POR_IA = ["icone-com-frase", "comparacao-lado-a-lado", "cartoes-em-linha", "interface-de-edicao", "titulo-em-caixa"] as const;
export type TipoGeradoPorIa = (typeof TIPOS_GERADOS_POR_IA)[number];

/** As peças do plano que passam pela esteira (os cinco tipos e o ícone do catálogo antigo, que também era desenhado em código). */
export const PECAS_GERADAS = new Set<string>([...TIPOS_GERADOS_POR_IA, "icone"]);
export const ehPecaGerada = (peca: string) => PECAS_GERADAS.has(peca);

// ─────────────────────────────── as marcas e o logo oficial ───────────────────────────────

/** As marcas que a fala costuma citar: o nome oficial e como reconhecer o logo (para o prompt e para a conferência). */
export const MARCAS: Array<{ nome: string; padrao: RegExp; logo: string }> = [
  { nome: "YouTube", padrao: /\byou ?tube\b/i, logo: "the official YouTube logo (red rounded rectangle with a white play triangle)" },
  { nome: "Instagram", padrao: /\binsta(gram)?\b/i, logo: "the official Instagram logo (camera glyph on the purple, pink and orange gradient rounded square)" },
  { nome: "TikTok", padrao: /\btik ?tok\b/i, logo: "the official TikTok logo (the cyan and red offset musical note on black)" },
  { nome: "Facebook", padrao: /\bfacebook\b/i, logo: "the official Facebook logo (white lowercase f on a blue circle)" },
  { nome: "LinkedIn", padrao: /\blinked ?in\b/i, logo: "the official LinkedIn logo (white \"in\" on a blue rounded square)" },
  { nome: "X", padrao: /\b(twitter|x \(antigo twitter\)|rede x)\b/i, logo: "the official X logo (white X mark on black)" },
  { nome: "WhatsApp", padrao: /\bwhats ?app\b|\bzap\b/i, logo: "the official WhatsApp logo (white phone in a speech bubble on green)" },
  { nome: "Telegram", padrao: /\btelegram\b/i, logo: "the official Telegram logo (white paper plane on a light blue circle)" },
  { nome: "Spotify", padrao: /\bspotify\b/i, logo: "the official Spotify logo (three black curved bars on a green circle)" },
  { nome: "Pinterest", padrao: /\bpinterest\b/i, logo: "the official Pinterest logo (white P on a red circle)" },
  { nome: "Threads", padrao: /\bthreads\b/i, logo: "the official Threads logo (black @-like spiral on white)" },
  { nome: "Kwai", padrao: /\bkwai\b/i, logo: "the official Kwai logo (orange rounded square with a white camera glyph)" },
  { nome: "Google", padrao: /\bgoogle\b/i, logo: "the official Google \"G\" logo (blue, red, yellow and green)" },
  { nome: "ChatGPT", padrao: /\bchat ?gpt\b/i, logo: "the official ChatGPT logo (the hexagonal knot mark)" },
  { nome: "CapCut", padrao: /\bcap ?cut\b/i, logo: "the official CapCut logo (black and white geometric mark)" },
  { nome: "Canva", padrao: /\bcanva\b/i, logo: "the official Canva logo (white script wordmark on a teal to purple gradient circle)" },
  { nome: "Netflix", padrao: /\bnetflix\b/i, logo: "the official Netflix logo (red N)" },
];

/** As marcas citadas nas props (lista `marcas` do redator e qualquer texto das props), sem repetir, no nome oficial. */
export function marcasCitadas(props: Record<string, unknown>, fala = ""): string[] {
  const declaradas = Array.isArray(props.marcas) ? (props.marcas as unknown[]).map((x) => String(x ?? "")) : [];
  const tudo = [...declaradas, ...textosExatos("", props), fala].join(" | ");
  return MARCAS.filter((m) => m.padrao.test(tudo) || declaradas.some((d) => d.trim().toLowerCase() === m.nome.toLowerCase())).map((m) => m.nome);
}

// ─────────────────────────────── o texto exato ───────────────────────────────

const limpar = (s: unknown) =>
  String(s ?? "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Os letreiros que a imagem tem de trazer, letra por letra (a ordem é a de leitura). */
export function textosExatos(peca: string, props: Record<string, unknown>): string[] {
  const p = props ?? {};
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  const saida: string[] = [];
  const por = (v: unknown) => {
    const t = limpar(v);
    if (t) saida.push(t);
  };
  switch (peca) {
    case "icone-com-frase":
      por(p.rotulo);
      por(p.frase);
      break;
    case "comparacao-lado-a-lado":
      por(p.rotuloNao ?? (p.pares ? "Não diga" : ""));
      por(p.rotuloSim ?? (p.pares ? "Diga" : ""));
      for (const par of lista(p.pares)) {
        por((par as Record<string, unknown>)?.nao);
        por((par as Record<string, unknown>)?.sim);
      }
      break;
    case "cartoes-em-linha":
      for (const it of lista(p.itens)) por((it as Record<string, unknown>)?.titulo);
      break;
    case "interface-de-edicao":
      por(p.titulo);
      por(p.legenda);
      for (const et of lista(p.etapas)) por(et);
      break;
    case "titulo-em-caixa":
      por(p.texto);
      break;
    case "icone":
      por(p.rotulo);
      por(p.apoio);
      break;
    default:
      // Qualquer outra peça: os campos de texto mais comuns, para a lista de marcas.
      for (const k of ["texto", "titulo", "frase", "rotulo", "legenda"]) por(p[k]);
  }
  return [...new Set(saida)];
}

// ─────────────────────────────── o prompt ───────────────────────────────

export type CoresDoElemento = { acento: string; escuro: string; claro: string };

/** O fundo liso do elemento (o recorte tira): cinza médio neutro, que não se confunde com cartão claro nem escuro. */
export const FUNDO_DO_ELEMENTO = "#7F7F7F";

/** A proporção pedida ao modelo pela forma do elemento (as que o GPT Image 2.5 aceita). */
export function proporcaoDoElemento(peca: string, formato: "9:16" | "16:9", itens = 1): string {
  if (peca === "titulo-em-caixa") return "21:9";
  if (peca === "cartoes-em-linha") return itens >= 4 ? "21:9" : itens === 3 ? "16:9" : "3:2";
  if (peca === "comparacao-lado-a-lado") return formato === "9:16" ? "4:3" : "1:1";
  if (peca === "interface-de-edicao") return formato === "9:16" ? "4:3" : "3:4";
  return "1:1";
}

/**
 * O PROMPT FINAL do elemento: a descrição do redator (inglês) e as garantias
 * que são regra explícita (texto exato entre aspas, logo oficial de cada marca,
 * cores da marca em hex, fundo liso, alta resolução, sem erro de grafia).
 * `reforco`: o que a conferência achou de errado na primeira imagem.
 */
export function montarPromptDoElemento(o: { peca: string; props: Record<string, unknown>; cores: CoresDoElemento; fala?: string; reforco?: string[] }): string {
  const textos = textosExatos(o.peca, o.props);
  const marcas = marcasCitadas(o.props, o.fala);
  const doRedator = limpar(o.props.prompt).slice(0, 1400);
  const partes: string[] = [];
  if (o.reforco?.length) partes.push(`FIX FROM THE PREVIOUS ATTEMPT: ${o.reforco.join(" ")}`);
  // Sem molde (06/10, noite): a composição é sempre a do redator; sem ela não há prompt (ver `temPromptDoRedator`).
  partes.push(doRedator);
  if (textos.length) {
    partes.push(`The ONLY text in the image, in Brazilian Portuguese, spelled exactly letter by letter as written here, with every accent: ${textos.map((t) => `"${t}"`).join(", ")}. No other words, letters or numbers anywhere.`);
  } else {
    partes.push("No text, letters or numbers anywhere.");
  }
  if (marcas.length) {
    partes.push(`Show ${marcas.map((n) => MARCAS.find((m) => m.nome === n)!.logo).join("; ")}, faithful to the real brand, correct colors and shape, never a generic icon in its place.`);
  }
  partes.push(`Brand identity colors used only on accents, highlights and details: ${o.cores.acento} (accent), ${o.cores.escuro} (dark), ${o.cores.claro} (light). Official brand logos keep their own colors.`);
  partes.push(`Isolated graphic element centered on a plain flat solid ${FUNDO_DO_ELEMENTO} background, a single uniform color with no gradient, no texture, no scene, no frame, no shadow on the background, generous empty margin on every side so nothing touches the edges.`);
  partes.push("Ultra high resolution, crisp clean edges, sharp legible typography, premium modern design, no misspellings, no extra text, no watermark, no people, no hands, no collage.");
  return partes.join(" ").slice(0, 4800);
}

/** O redator escreveu a descrição do elemento (sem ela, o elemento não é gerado: nada de molde). */
export const temPromptDoRedator = (props: Record<string, unknown>) => limpar(props?.prompt).length >= 20;

// ─────────────────── a conferência (fora da jornada oficial; ELEMENTO_CONFERENCIA=1 liga) ───────────────────

/** O que o Gemini descreve do elemento gerado (só fatos; quem decide é o JEV). */
export type DescricaoDoElemento = {
  textoLido: string;
  logosVistos: string[];
  colagem: boolean;
  cortadoNaBorda: boolean;
  fundoLiso: boolean;
  defeitos: string;
};

export const ESQUEMA_DO_ELEMENTO = {
  type: "OBJECT",
  properties: {
    textoLido: { type: "STRING" },
    logosVistos: { type: "ARRAY", items: { type: "STRING" } },
    colagem: { type: "BOOLEAN" },
    cortadoNaBorda: { type: "BOOLEAN" },
    fundoLiso: { type: "BOOLEAN" },
    defeitos: { type: "STRING" },
  },
  required: ["textoLido", "logosVistos", "colagem", "cortadoNaBorda", "fundoLiso"],
};

export const SISTEMA_DO_ELEMENTO = `Você descreve um elemento gráfico gerado para um vídeo, de forma objetiva. Você NÃO decide nada: só responde o que vê.
- "textoLido": todo texto legível, letra por letra, com acentos, na ordem de leitura, separado por " | " (vazio se não há);
- "logosVistos": os logotipos de marca que aparecem, pelo nome da marca (YouTube, Instagram, TikTok...); um ícone genérico não é logo;
- "colagem": true se a imagem é colagem, grade de fotos ou tem vários painéis soltos sem relação;
- "cortadoNaBorda": true se algum cartão, letra ou logo encosta ou é cortado pela borda da imagem;
- "fundoLiso": true se o fundo atrás do elemento é uma cor só, sem cena;
- "defeitos": letra deformada, palavra inventada, logo deformado, objeto quebrado (vazio se não há).
Sem travessão.`;

export function lerDescricaoDoElemento(cru: unknown): DescricaoDoElemento {
  const o = (cru ?? {}) as Record<string, unknown>;
  return {
    textoLido: String(o.textoLido ?? "").slice(0, 600),
    logosVistos: Array.isArray(o.logosVistos) ? (o.logosVistos as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 10) : [],
    colagem: Boolean(o.colagem),
    cortadoNaBorda: Boolean(o.cortadoNaBorda),
    fundoLiso: o.fundoLiso === undefined ? true : Boolean(o.fundoLiso),
    defeitos: String(o.defeitos ?? "").slice(0, 300),
  };
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Os fatos que o código mede da descrição (o JEV lê; sem o JEV, decidem o padrão seguro). */
export function fatosDaConferencia(d: DescricaoDoElemento, esperado: { textos: string[]; marcas: string[] }, comAcento = true) {
  const lido = normal(d.textoLido);
  const lidoBruto = d.textoLido.toLowerCase();
  const faltando = esperado.textos.filter((t) => !lido.includes(normal(t)));
  // Grafia: a palavra está lá sem o acento pedido (o modelo "esqueceu" o til ou o agudo).
  const semAcento = comAcento ? esperado.textos.filter((t) => lido.includes(normal(t)) && !lidoBruto.includes(t.toLowerCase())) : [];
  const vistos = d.logosVistos.map((x) => x.toLowerCase());
  const logosFaltando = esperado.marcas.filter((m) => !vistos.some((v) => v.includes(m.toLowerCase())));
  return { faltando, semAcento, logosFaltando, colagem: d.colagem, cortado: d.cortadoNaBorda, defeitos: d.defeitos };
}

export type DecisaoDoElemento = "aprovar" | "refazer" | "trocar";

/** Sem o JEV: o padrão seguro pelos fatos. */
export function decisaoDeReservaDoElemento(f: ReturnType<typeof fatosDaConferencia>, jaRefeito: boolean): DecisaoDoElemento {
  const ruim = f.faltando.length > 0 || f.semAcento.length > 0 || f.logosFaltando.length > 0 || f.colagem || f.cortado || Boolean(f.defeitos);
  if (!ruim) return "aprovar";
  return jaRefeito ? "trocar" : "refazer";
}

/** O que a refação pede, em inglês, pelos fatos achados. */
export function reforcoDaRefacao(f: ReturnType<typeof fatosDaConferencia>): string[] {
  const r: string[] = [];
  if (f.faltando.length || f.semAcento.length) r.push(`The text was wrong: write exactly ${[...f.faltando, ...f.semAcento].map((t) => `"${t}"`).join(", ")}, letter by letter, with the accents.`);
  if (f.logosFaltando.length) r.push(`The official logos of ${f.logosFaltando.join(", ")} were missing or wrong: draw the real logos.`);
  if (f.colagem) r.push("One single graphic element, never a collage or a grid of pictures.");
  if (f.cortado) r.push("Leave a wide empty margin: nothing may touch or be cut by the image border.");
  if (f.defeitos) r.push(`Avoid: ${f.defeitos.slice(0, 160)}.`);
  return r;
}

// ─────────────────────────────── a esteira (com injeção) ───────────────────────────────

export type DependenciasDoElemento = {
  /** Gera a imagem (fundo liso) pelo prompt e devolve os bytes e o custo. */
  gerar: (prompt: string, proporcao: string) => Promise<{ png: Buffer; custoUsd: number; modelo: string }>;
  /** Tira o fundo; null quando o recorte falha (o elemento sai). */
  recortar: (png: Buffer) => Promise<{ png: Buffer | null; custoUsd: number }>;
  /** O Gemini descreve o elemento (só fatos). Ausente: sem conferência automática (a revisão é do usuário, jornada oficial). */
  olhar?: ((png: Buffer) => Promise<{ json: unknown; custoUsd: number }>) | null;
  /** O JEV decide (opcional: sem ele, o padrão seguro). */
  juiz?: typeof perguntarAoJev | null;
  /** Grava o recorte num nome único e devolve a url (ou o caminho da prova). */
  gravar: (png: Buffer, momento: string) => Promise<string>;
  /** Largura / altura da imagem recortada (aparada). */
  medir?: (png: Buffer) => Promise<number>;
  projectId?: string | null;
};

export type ElementoPronto = {
  id: string;
  url: string | null;
  proporcao: number | null;
  custoUsd: number;
  rodadas: number;
  decisao: DecisaoDoElemento;
  porQue: string;
  prompt: string;
};

/** O custo previsto de UM elemento: a imagem e o recorte (com a conferência ligada, mais o olho). */
export const DOLAR_DA_VISAO_DO_ELEMENTO = 0.002;
export function custoDoElemento(modelo: keyof typeof DOLAR_POR_IMAGEM = "higgsfield-gpt-image-2.5-medium", comConferencia = false): number {
  return +(DOLAR_POR_IMAGEM[modelo] + DOLAR_POR_RECORTE + (comConferencia ? DOLAR_DA_VISAO_DO_ELEMENTO : 0)).toFixed(4);
}

async function decidirPeloJev(
  juiz: typeof perguntarAoJev,
  x: { id: string; peca: string; fala: string; textos: string[]; marcas: string[]; descricao: DescricaoDoElemento; fatos: ReturnType<typeof fatosDaConferencia>; jaRefeito: boolean },
  projectId?: string | null
): Promise<{ decisao: DecisaoDoElemento; porQue: string } | null> {
  const opcoes = x.jaRefeito ? (["aprovar", "trocar"] as const) : (["aprovar", "refazer", "trocar"] as const);
  let r: Record<string, RespostaDoJev> = {};
  try {
    r = await juiz(
      { projectId, etapa: "conferencia-elemento-gerado", state: { regra: "elemento gráfico de vídeo gerado por IA: o texto exato pedido, sem erro de grafia, o logo oficial certo de cada marca citada, uma peça só, nada cortado na borda" } },
      {
        e: {
          type: "choice",
          instructions: {
            pergunta: x.jaRefeito ? "Este elemento JÁ foi refeito uma vez. Ele entra no vídeo ou sai (o JEV troca por outro tipo)?" : "Este elemento gerado entra no vídeo, deve ser refeito uma vez com a correção, ou sai?",
            tipo: x.peca,
            falaDoMomento: x.fala,
            textoPedido: x.textos,
            marcasPedidas: x.marcas,
            descricaoDoGemini: x.descricao,
            fatosMedidos: x.fatos,
          },
          criteria: (x.jaRefeito
            ? { aprovar: "o texto lido bate com o pedido, letra por letra, os logos pedidos aparecem certos e nada está cortado ou colado", trocar: "ainda há erro de grafia, logo errado ou faltando, colagem ou corte na borda" }
            : {
                aprovar: "o texto lido bate com o pedido, letra por letra, os logos pedidos aparecem certos e nada está cortado ou colado",
                refazer: "há erro de grafia, palavra faltando, logo errado ou genérico, colagem ou corte na borda, que uma nova geração com a correção resolve",
                trocar: "a ideia do elemento não serve para esta fala",
              }) as Record<string, string>,
        },
      }
    );
  } catch {
    return null;
  }
  const resp = r.e;
  if (!resp || resp.type !== "choice") return null;
  const padrao = decisaoDeReservaDoElemento(x.fatos, x.jaRefeito);
  const conf = resp.confidence ?? 0;
  const decisao = conf >= 0.4 && (opcoes as readonly string[]).includes(resp.choice) ? (resp.choice as DecisaoDoElemento) : padrao;
  return { decisao, porQue: `JEV: ${resp.choice} (${Math.round(conf * 100)}%)` };
}

/**
 * UM ELEMENTO, do prompt à url: gera, recorta, confere; refaz UMA vez com a
 * correção; se persistir, devolve url null (o elemento sai e o JEV troca).
 */
export async function gerarElemento(
  m: { id: string; peca: string; props: Record<string, unknown>; fala?: string },
  o: { cores: CoresDoElemento; formato: "9:16" | "16:9"; deps: DependenciasDoElemento }
): Promise<ElementoPronto> {
  const textos = textosExatos(m.peca, m.props);
  const marcas = marcasCitadas(m.props, m.fala);
  const itens = Array.isArray(m.props.itens) ? (m.props.itens as unknown[]).length : Array.isArray(m.props.pares) ? (m.props.pares as unknown[]).length : 1;
  const proporcao = proporcaoDoElemento(m.peca, o.formato, itens);
  let custo = 0;
  let reforco: string[] | undefined;
  let prompt = "";
  if (!temPromptDoRedator(m.props)) return { id: m.id, url: null, proporcao: null, custoUsd: 0, rodadas: 0, decisao: "trocar", porQue: "o redator não escreveu o prompt do elemento (sem molde, não se gera)", prompt };
  for (let rodada = 0; rodada < 2; rodada++) {
    prompt = montarPromptDoElemento({ peca: m.peca, props: m.props, cores: o.cores, fala: m.fala, reforco });
    const img = await o.deps.gerar(prompt, proporcao);
    custo += img.custoUsd;
    const rec = await o.deps.recortar(img.png);
    custo += rec.custoUsd;
    if (!rec.png) return { id: m.id, url: null, proporcao: null, custoUsd: +custo.toFixed(4), rodadas: rodada + 1, decisao: "trocar", porQue: "o recorte não achou o elemento", prompt };
    // Sem o olho (a jornada oficial): o elemento entra, e a revisão é do usuário.
    if (!o.deps.olhar) {
      const url = await o.deps.gravar(rec.png, m.id);
      const prop = o.deps.medir ? await o.deps.medir(rec.png).catch(() => null) : null;
      return { id: m.id, url, proporcao: prop, custoUsd: +custo.toFixed(4), rodadas: 1, decisao: "aprovar", porQue: "sem conferência automática: a revisão é do usuário", prompt };
    }
    const visto = await o.deps.olhar(rec.png).catch(() => null);
    custo += visto?.custoUsd ?? 0;
    // Sem o olho (fora do ar), o elemento não entra às cegas: o texto exato é a regra.
    if (!visto) return { id: m.id, url: null, proporcao: null, custoUsd: +custo.toFixed(4), rodadas: rodada + 1, decisao: "trocar", porQue: "a conferência visual não respondeu: sem conferir, o elemento não entra", prompt };
    const descricao = lerDescricaoDoElemento(visto.json);
    const fatos = fatosDaConferencia(descricao, { textos, marcas });
    const jaRefeito = rodada === 1;
    const doJev = o.deps.juiz ? await decidirPeloJev(o.deps.juiz, { id: m.id, peca: m.peca, fala: m.fala ?? "", textos, marcas, descricao, fatos, jaRefeito }, o.deps.projectId) : null;
    const d = doJev ?? { decisao: decisaoDeReservaDoElemento(fatos, jaRefeito), porQue: "padrão seguro pelos fatos (sem o JEV)" };
    if (d.decisao === "aprovar") {
      const url = await o.deps.gravar(rec.png, m.id);
      const prop = o.deps.medir ? await o.deps.medir(rec.png).catch(() => null) : null;
      return { id: m.id, url, proporcao: prop, custoUsd: +custo.toFixed(4), rodadas: rodada + 1, decisao: "aprovar", porQue: d.porQue, prompt };
    }
    if (d.decisao === "trocar" || jaRefeito) return { id: m.id, url: null, proporcao: null, custoUsd: +custo.toFixed(4), rodadas: rodada + 1, decisao: "trocar", porQue: d.porQue, prompt };
    reforco = reforcoDaRefacao(fatos);
    if (!reforco.length) reforco = ["Follow the text and the logos exactly as requested."];
  }
  return { id: m.id, url: null, proporcao: null, custoUsd: +custo.toFixed(4), rodadas: 2, decisao: "trocar", porQue: "sem aprovação em duas rodadas", prompt };
}

type MomentoDoPlano = { id?: string; peca: string; props?: Record<string, unknown>; de?: unknown; ate?: unknown };

/**
 * TODOS OS ELEMENTOS GERADOS DO PLANO, 2 de cada vez (a conta da Higgsfield
 * faz 2 ao mesmo tempo), até o teto de custo. Preenche `props.imagem` e
 * `props.proporcaoDaImagem` NO LUGAR; os que não saíram (reprovados, teto,
 * falha) SAEM do plano (`removidos`): nada desenhado em código aparece no
 * lugar deles.
 */
export async function prepararElementosGerados<P extends { momentos?: MomentoDoPlano[] }>(
  plano: P,
  o: { cores: CoresDoElemento; formato: "9:16" | "16:9"; deps: DependenciasDoElemento; tetoUsd?: number; falaDe?: (m: MomentoDoPlano) => string }
): Promise<{ plano: P; prontos: ElementoPronto[]; removidos: string[]; custoUsd: number; erros: string[] }> {
  const alvo = (plano.momentos ?? []).filter((m) => ehPecaGerada(m.peca));
  const prontos: ElementoPronto[] = [];
  const erros: string[] = [];
  let custo = 0;
  let reservado = 0;
  const teto = o.tetoUsd ?? Infinity;
  // Cada elemento é próprio do seu momento: prompt repetido (o redator copiou a cena) não é gerado de novo.
  const vistos = new Set<string>();
  const fila = alvo.filter((m) => {
    const chave = limpar(m.props?.prompt).toLowerCase();
    if (chave && vistos.has(chave)) {
      erros.push(`${String(m.id ?? "")}: prompt igual ao de outro momento; cada elemento é próprio do seu momento, este sai`);
      return false;
    }
    if (chave) vistos.add(chave);
    return true;
  });
  const trabalhar = async () => {
    for (let m = fila.shift(); m; m = fila.shift()) {
      const id = String(m.id ?? "");
      // O pior caso de um elemento (duas rodadas com a conferência, uma sem) tem de caber no teto antes de pedir.
      // A reserva: os dois trabalhadores correm juntos, e o pior caso fica comprometido antes de pedir.
      const pior = o.deps.olhar ? 2 * custoDoElemento(undefined, true) : custoDoElemento();
      if (custo + reservado + pior > teto + 1e-9) {
        erros.push(`${id}: teto de US$ ${teto} atingido, o elemento sai`);
        continue;
      }
      reservado += pior;
      try {
        const r = await gerarElemento({ id, peca: m.peca, props: (m.props ??= {}), fala: o.falaDe?.(m) }, o).finally(() => {
          reservado -= pior;
        });
        custo += r.custoUsd;
        prontos.push(r);
        if (r.url) {
          m.props!.imagem = r.url;
          if (r.proporcao) m.props!.proporcaoDaImagem = +r.proporcao.toFixed(4);
        }
      } catch (err) {
        erros.push(`${id}: ${err instanceof Error ? err.message.slice(0, 140) : err}`);
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar()]);
  const semImagem = new Set(alvo.filter((m) => !m.props?.imagem).map((m) => String(m.id ?? "")));
  const limpo = { ...plano, momentos: (plano.momentos ?? []).filter((m) => !(ehPecaGerada(m.peca) && semImagem.has(String(m.id ?? "")))) } as P;
  return { plano: limpo, prontos, removidos: [...semImagem], custoUsd: +custo.toFixed(4), erros };
}
