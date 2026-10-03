import { frasesDaFala } from "@/lib/media/diretor-limpo";
import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import { acentoApagado, acentoVivo } from "@/lib/media/editor-sob-medida/cor";
import { FICHAS, passesDaPeca, pecaContinua, type FichaDaPeca } from "@/lib/media/editor-sob-medida/pecas";
import type {
  Ancora,
  Caixa,
  CamadaResolvida,
  EdicaoDoEditor,
  EdicaoResolvida,
  Enquadramento,
  MidiaDaInsercao,
  PlanoResolvido,
  Tema,
  Visual,
} from "@/lib/media/editor-sob-medida/tipos";

/**
 * O RESOLVEDOR DO EDITOR SOB MEDIDA (03/10/2026): a edição que o agente
 * escreveu (âncoras na fala) vira a edição que o worker desenha (segundos e
 * pixels). Tudo que é medível é decidido aqui, e não pelo modelo: o tempo
 * exato de cada palavra, a duração mínima e máxima de cada peça, nada por cima
 * de nada, o plano da gravação que a peça pede, o ritmo da câmera entre as
 * peças e a legenda. O que o modelo escreveu errado é corrigido ou cai, com o
 * motivo na lista de avisos.
 *
 * Módulo puro.
 */

export type Frase = { id: string; de: number; ate: number; inicio: number; fim: number; texto: string };

export function frasesNumeradas(palavras: PalavraNoCorte[]): Frase[] {
  return frasesDaFala(palavras);
}

const norm = (t: string) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

/** O instante de uma âncora ("F12", "F12/fim", "F12:palavra", "F12:palavra/fim", "F12:palavra#2"). */
export function resolverAncora(a: Ancora, frases: Frase[], palavras: PalavraNoCorte[]): number | null {
  const m = String(a ?? "").trim().match(/^F?(\d+)(?:\s*:\s*([^/#]+?))?(?:#(\d+))?\s*(\/\s*fim)?$/i);
  if (!m) return null;
  const k = Number(m[1]);
  const f = frases[k];
  if (!f) return null;
  const fim = Boolean(m[4]);
  if (!m[2]) return fim ? f.fim : f.inicio;
  const alvo = norm(m[2].split(/\s+/)[0]);
  const n = Math.max(1, Number(m[3] ?? 1));
  const procurar = (de: number, ate: number) => {
    let achou = 0;
    for (let i = de; i <= ate; i++) {
      const w = norm(palavras[i]?.texto ?? "");
      if (w && (w === alvo || (alvo.length >= 4 && w.startsWith(alvo)) || (w.length >= 4 && alvo.startsWith(w)))) {
        achou++;
        if (achou === n) return i;
      }
    }
    return -1;
  };
  let i = procurar(f.de, f.ate);
  // O modelo às vezes erra a frase por uma: procura nas vizinhas.
  if (i < 0 && frases[k + 1]) i = procurar(frases[k + 1].de, frases[k + 1].ate);
  if (i < 0 && frases[k - 1]) i = procurar(frases[k - 1].de, frases[k - 1].ate);
  if (i < 0) return fim ? f.fim : f.inicio;
  return fim ? palavras[i].fim : palavras[i].inicio;
}

// ─────────────────────────────── tema ───────────────────────────────

/** O acabamento e a letra de cada estilo (as cores são sempre as da marca). */
export function temaDoEstilo(estiloId: string | null | undefined, cores: { acento: string; escuro: string; claro: string }): Tema {
  const id = estiloId ?? "lousa";
  // A COR VIVA (03/10, terceira volta): acento apagado brilha no matiz dele; o original fica para a identidade.
  const acento = acentoApagado(cores.acento) ? acentoVivo(cores.acento) : cores.acento;
  const base = { ...cores, acento, acentoMarca: cores.acento, fonteTexto: "Geist", fonteMono: "Geist Mono" };
  const t = (visual: Visual, fonteTitulo: string, pesoTitulo: number, caixaAlta: boolean): Tema => ({ ...base, visual, fonteTitulo, pesoTitulo, caixaAlta });
  if (["hormozi", "mrbeast", "tipografia", "ugc", "vlog"].includes(id)) return t("impacto", "Archivo Black", 400, true);
  if (id === "consorcio") return t("impacto", "Oswald", 700, true);
  if (["documentario", "vox", "bbc", "natgeo", "60-minutes", "wes-anderson", "depoimento"].includes(id)) return t("documental", "Playfair Display", 700, false);
  if (id === "johnny-harris") return t("documental", "Oswald", 600, true);
  if (id === "crime-real") return t("vidro", "Oswald", 600, true);
  return t("vidro", "Geist", 600, false);
}

// ─────────────────────────────── geometria ───────────────────────────────

/** O cartão da gravação quando a peça fica do lado `ladoDaPeca` (o cartão vai do outro). */
export function caixaDoCartao(W: number, H: number, ladoDaPeca: "esquerda" | "direita"): Caixa {
  if (H > W) {
    const u = W / 1080;
    // Em pé: a peça ocupa o alto; o cartão fica embaixo dela, acima da legenda.
    return { x: Math.round(90 * u), y: Math.round(1000 * u), w: Math.round(900 * u), h: Math.round(500 * u) };
  }
  const u = H / 1080;
  const w = Math.round(840 * u);
  const h = Math.round(780 * u);
  const y = Math.round(150 * u);
  return ladoDaPeca === "esquerda" ? { x: W - w - Math.round(80 * u), y, w, h } : { x: Math.round(80 * u), y, w, h };
}

// ─────────────────────────────── a limpeza dos textos ───────────────────────────────

const TAGS_DO_SVG = /^(svg|g|path|rect|circle|ellipse|line|polyline|polygon|text|tspan|defs|lineargradient|radialgradient|stop)$/i;

/** O SVG do "desenho": só formas (lista de tags permitidas), sem script, evento, link ou estilo. */
export function limparSvg(svg: string): string {
  let s = String(svg ?? "").slice(0, 6000);
  s = s.replace(/<\s*\/?\s*([a-z][a-z0-9:-]*)[^>]*>/gi, (tag, nome: string) => (TAGS_DO_SVG.test(nome) ? tag : ""));
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "").replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
  s = s.replace(/<\s*\/?\s*svg[^>]*>/gi, "");
  return s;
}

function limparProps(v: unknown, prof = 0): unknown {
  if (prof > 4) return null;
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim().slice(0, 220);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => limparProps(x, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).map(([k, x]) => [k, k === "svg" ? limparSvg(String(x)) : limparProps(x, prof + 1)]));
  return null;
}

// ─────────────────────────────── a câmera ───────────────────────────────

const ZOOMS = { aberto: 1, medio: 1.12, fechado: 1.24 } as const;

/**
 * O RITMO DA CÂMERA entre as peças: o enquadramento troca na virada de frase,
 * em blocos de 4 a 9 s, alternando aberto, médio e fechado (o corte de câmera
 * do Dan Martell e do Hormozi), com o foco no rosto. Nos estilos de aula e
 * documentário cada plano ainda empurra devagar (100% a 107%).
 */
export function cameraDeRitmo(frases: Frase[], duracao: number, rosto: Retangulo, estiloId: string | null | undefined, palavras?: PalavraNoCorte[], suave = false): Enquadramento[] {
  if (palavras?.length) return cameraDeCorte(palavras, duracao, rosto, suave);
  const empurra = ["lousa", "documentario", "johnny-harris", "keynote", "vox", "bbc"].includes(estiloId ?? "");
  const ciclo: Array<keyof typeof ZOOMS> = ["medio", "fechado", "aberto", "fechado", "medio", "aberto"];
  const x = Math.min(0.85, Math.max(0.15, rosto.x + rosto.w / 2));
  const y = Math.min(0.75, Math.max(0.2, rosto.y + rosto.h * 0.55));
  const saida: Enquadramento[] = [];
  let de = 0;
  let k = 0;
  for (let i = 0; i < frases.length; i++) {
    const fim = i + 1 < frases.length ? frases[i + 1].inicio - 0.02 : duracao;
    const span = fim - de;
    if (span < 4 && i < frases.length - 1) continue;
    // Bloco longo (frase comprida) vira pedaços de ~7 s.
    const partes = Math.max(1, Math.ceil(span / 9));
    for (let p = 0; p < partes; p++) {
      const a = de + (span * p) / partes;
      const b = de + (span * (p + 1)) / partes;
      const zoom = ZOOMS[ciclo[k % ciclo.length]];
      saida.push({ de: +a.toFixed(3), ate: +b.toFixed(3), zoom, x, y, movimento: empurra && b - a > 2.5 ? "empurrao" : "fixo", zoomFinal: empurra ? +(zoom * 1.07).toFixed(3) : undefined });
      k++;
    }
    de = fim;
  }
  if (duracao - de > 0.05) saida.push({ de, ate: duracao, zoom: 1, x, y, movimento: "fixo" });
  return saida;
}

/**
 * O RITMO DO CORTE (03/10, terceira volta): no vertical curto a câmera muda a
 * cada 2 a 3,6 s, sempre na fronteira entre duas palavras (nunca no meio
 * de uma), alternando aberto, médio e fechado; cada plano ainda empurra 4%
 * devagar, então o rosto nunca fica parado. É o corte de câmera dos shorts.
 */
export function cameraDeCorte(palavras: PalavraNoCorte[], duracao: number, rosto: Retangulo, suave = false): Enquadramento[] {
  // O documental (Vox, BBC, documentário) corta menos e mais perto: planos de 2,8 a 4 s, zoom até 1,12.
  const ciclo = suave ? [1.04, 1.12, 1, 1.08] : [1.1, 1.22, 1, 1.16, 1.06, 1.26];
  const [minimo, base, maximo] = suave ? [2.8, 3.2, 4] : [2, 2.4, 3.6];
  const x = Math.min(0.85, Math.max(0.15, rosto.x + rosto.w / 2));
  const y = Math.min(0.75, Math.max(0.2, rosto.y + rosto.h * 0.55));
  const saida: Enquadramento[] = [];
  let de = 0;
  let k = 0;
  while (duracao - de > 0.05) {
    const alvo = de + base + (k % 3) * 0.4;
    // A fronteira de palavra mais perto do alvo, entre 2 e 3,6 s depois do começo.
    let corte = Math.min(duracao, alvo);
    let melhor = Infinity;
    for (const p of palavras) {
      if (p.inicio < de + minimo || p.inicio > de + maximo) continue;
      const d = Math.abs(p.inicio - alvo);
      if (d < melhor) {
        melhor = d;
        corte = p.inicio - 0.02;
      }
    }
    if (duracao - corte < 1.6) corte = duracao;
    const zoom = ciclo[k % ciclo.length];
    saida.push({ de: +de.toFixed(3), ate: +corte.toFixed(3), zoom, x, y, movimento: "empurrao", zoomFinal: +(zoom * 1.04).toFixed(3) });
    de = corte;
    k++;
  }
  return saida;
}

/** O zoom da câmera num instante (1 fora de todo enquadramento). */
function zoomEm(camera: Enquadramento[], t: number): number {
  return camera.find((c) => c.de <= t && c.ate > t)?.zoom ?? 1;
}

/** Junta a câmera pedida pelo editor (zoom no que se mostra) por cima do ritmo. */
function sobreporCamera(base: Enquadramento[], pedidos: Enquadramento[]): Enquadramento[] {
  let saida = base.map((c) => ({ ...c }));
  for (const p of pedidos.sort((a, b) => a.de - b.de)) {
    const nova: Enquadramento[] = [];
    for (const c of saida) {
      if (c.ate <= p.de || c.de >= p.ate) {
        nova.push(c);
        continue;
      }
      if (c.de < p.de) nova.push({ ...c, ate: p.de });
      if (c.ate > p.ate) nova.push({ ...c, de: p.ate });
    }
    nova.push(p);
    saida = nova.sort((a, b) => a.de - b.de).filter((c) => c.ate - c.de > 0.05);
  }
  return saida;
}

// ─────────────────────────────── a legenda ───────────────────────────────

/** Frases curtas (até ~30 letras), como a legenda do pitch. */
export function paginasDaLegenda(palavras: PalavraNoCorte[]): Array<{ inicio: number; fim: number; texto: string }> {
  const saida: Array<{ inicio: number; fim: number; texto: string }> = [];
  let g: PalavraNoCorte[] = [];
  palavras.forEach((p, j) => {
    g.push(p);
    const txt = g.map((x) => x.texto).join(" ");
    const prox = palavras[j + 1];
    const pausa = prox ? prox.inicio - p.fim : 1;
    if (txt.length >= 30 || (/[.,:;?!]$/.test(p.texto) && g.length >= 2) || pausa > 0.6 || !prox) {
      const fim = Math.min(prox ? prox.inicio : p.fim + 0.4, p.fim + 0.35);
      saida.push({ inicio: g[0].inicio, fim, texto: txt.replace(/[,.:;]+$/, "") });
      g = [];
    }
  });
  return saida;
}

// ─────────────────────────────── a resolução ───────────────────────────────

export type ContextoDaResolucao = {
  palavras: PalavraNoCorte[];
  duracao: number;
  largura: number;
  altura: number;
  tema: Tema;
  rosto: Retangulo;
  estiloId: string | null;
  comLegenda: boolean;
  logoUrl: string | null;
  /** As inserções já geradas (id -> url). As que faltam caem. */
  insercoes: Record<string, MidiaDaInsercao>;
  /** "corte": o vídeo curto vertical (câmera a cada 2 a 3,6 s, B-roll depois dos 2 s do gancho). */
  ritmo?: "corte" | "longo";
};

export type MomentoResolvido = CamadaResolvida & { ficha: FichaDaPeca; plano: "cheio" | "grafico" | "cartao" };

export function resolverEdicao(e: EdicaoDoEditor, ctx: ContextoDaResolucao): { edicao: EdicaoResolvida; avisos: string[]; momentos: MomentoResolvido[] } {
  const avisos: string[] = [];
  const frases = frasesNumeradas(ctx.palavras);
  const D = ctx.duracao;
  const t = (a: Ancora) => resolverAncora(a, frases, ctx.palavras);

  // 1. Os momentos, em segundos.
  const brutos: MomentoResolvido[] = [];
  (e.momentos ?? []).forEach((m, k) => {
    const ficha = FICHAS[m.peca];
    const id = String(m.id ?? `m${k + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || `m${k + 1}`;
    if (!ficha) return avisos.push(`${id}: peça desconhecida "${m.peca}"`);
    const t0 = t(m.de);
    const t1 = t(m.ate);
    if (t0 === null || t1 === null) return avisos.push(`${id}: âncora inválida (${m.de} a ${m.ate})`);
    let de = Math.max(0, t0 - 0.12);
    let ate = Math.min(D, Math.max(t1 + 0.25, de + ficha.duracao[0]));
    if (ate - de > ficha.duracao[1]) ate = de + ficha.duracao[1];
    if (ate - de < Math.min(1, ficha.duracao[0])) return avisos.push(`${id}: curto demais no fim do vídeo`);
    const props = limparProps(m.props ?? {}) as Record<string, unknown>;
    // As listas cortadas no teto da peça.
    if (ficha.eventosDe && Array.isArray(props[ficha.eventosDe])) props[ficha.eventosDe] = (props[ficha.eventosDe] as unknown[]).slice(0, ficha.maxItens ?? 6);
    const nItens = ficha.eventosDe ? (Array.isArray(props[ficha.eventosDe]) ? (props[ficha.eventosDe] as unknown[]).length : 0) : ficha.umEvento ? 1 : 0;
    // Os eventos: um por item, crescentes, dentro da camada.
    let eventos = (m.eventos ?? [])
      .map((a) => t(a))
      .filter((x): x is number => x !== null)
      .map((x) => Math.max(de + 0.25, x - 0.05))
      .filter((x) => x < ate - 0.4)
      .sort((a, b) => a - b)
      .slice(0, nItens);
    if (nItens && eventos.length < nItens) {
      // Os que faltam se espalham entre o último evento e o fim (a voz costuma listar em ritmo).
      // Um evento só (a resposta, o lado "depois") sem âncora: no meio da peça,
      // e não logo na entrada (a resposta aparecia antes de ser dita, prova de 03/10).
      const ini = eventos.length ? eventos[eventos.length - 1] : ficha.umEvento ? de + (ate - de) * 0.4 : de + ficha.entrada * 0.6;
      const faltam = nItens - eventos.length;
      const passo = Math.max(0.35, (ate - 0.8 - ini) / (faltam + (eventos.length ? 0 : 0)));
      for (let i = 0; i < faltam; i++) eventos.push(Math.min(ate - 0.5, ini + passo * (i + (eventos.length ? 1 : 0))));
      if (m.eventos?.length) avisos.push(`${id}: ${faltam} evento(s) que faltavam foram espalhados`);
    }
    eventos = eventos.map((x) => +x.toFixed(3));
    // O plano: o do catálogo, ou o pedido (só se fizer sentido: peça de tela nunca fica sobre a pessoa).
    let plano: MomentoResolvido["plano"] = ficha.plano === "tela" ? "grafico" : ficha.plano === "lado" ? "cartao" : "cheio";
    if (m.plano === "grafico" && ficha.plano !== "tela") plano = "grafico";
    if (m.plano === "cartao" && ficha.plano === "sobre" && ["titulo", "icone"].includes(ficha.nome)) plano = "cartao";
    if (plano === "grafico" && ate - de > 8.5) ate = de + 8.5;
    // O título atrás da pessoa precisa saber onde a cabeça está: as letras
    // ficam acima dela e a pessoa corta só a base (prova de 03/10: com o
    // título no meio, a cabeça escondia a palavra inteira no 9:16).
    if (ficha.nome === "titulo-atras") props.cabeca = +Math.max(0.05, ctx.rosto.y).toFixed(3);
    // O lado do painel (a pessoa vai para o outro).
    if (plano === "cartao") {
      const lado = props.lado === "direita" || props.posicao === "direita" ? "direita" : "esquerda";
      props.lado = lado;
      if (ficha.nome === "desenho" || ficha.nome === "icone") props.posicao = lado === "direita" ? "direita" : ficha.nome === "icone" ? "topo-esquerda" : "esquerda";
      if (ficha.nome === "titulo") props.posicao = "esquerda-meio";
    }
    brutos.push({ id, peca: ficha.nome, de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: ficha.entrada, saida: ficha.saida, evento: ficha.evento, eventos, props, ficha, plano, passes: passesDaPeca(ficha), ...(pecaContinua(ficha) ? { continua: true } : {}) });
  });

  // 2. Nada por cima de nada: o anterior manda; o seguinte começa depois ou cai.
  const momentos: MomentoResolvido[] = [];
  for (const m of brutos.sort((a, b) => a.de - b.de)) {
    const ant = momentos[momentos.length - 1];
    if (ant && m.de < ant.ate + 0.15) {
      const novoDe = ant.ate + 0.15;
      if (m.ate - novoDe >= Math.max(1.2, m.ficha.duracao[0] * 0.7)) {
        m.eventos = m.eventos.map((x) => Math.max(x, novoDe + 0.25));
        m.de = +novoDe.toFixed(3);
      } else {
        avisos.push(`${m.id}: caiu por ficar por cima de ${ant.id}`);
        continue;
      }
    }
    momentos.push(m);
  }

  // 3. Os planos da gravação e a moldura dos cartões.
  const W = ctx.largura;
  const H = ctx.altura;
  const x0 = Math.min(0.85, Math.max(0.15, ctx.rosto.x + ctx.rosto.w / 2));
  const y0 = Math.min(0.75, Math.max(0.2, ctx.rosto.y + ctx.rosto.h * 0.55));
  const planos: PlanoResolvido[] = [];
  const camadas: CamadaResolvida[] = [];
  for (const m of momentos) {
    const { ficha: _f, plano, ...camada } = m;
    void _f;
    camadas.push(camada);
    if (plano === "grafico") planos.push({ de: m.de, ate: m.ate, tipo: "grafico" });
    if (plano === "cartao") {
      const caixa = caixaDoCartao(W, H, m.props.lado === "direita" ? "direita" : "esquerda");
      planos.push({ de: m.de, ate: m.ate, tipo: "cartao", caixa, zoom: 1.15, x: x0, y: y0 });
      camadas.push({ id: `${m.id}-moldura`, peca: "moldura-do-cartao", de: m.de, ate: m.ate, entrada: 0.55, saida: 0.2, evento: 0.5, eventos: [], props: { ...caixa }, passes: ["frente"] });
    }
  }

  // 4. As inserções geradas: só onde não há peça de tela ou de lado.
  for (const [k, ins] of (e.insercoes ?? []).entries()) {
    const id = String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}`;
    const midia = ctx.insercoes[id];
    if (!midia) continue;
    const a = t(ins.de);
    const b = t(ins.ate);
    if (a === null || b === null) continue;
    // No corte, os 2 primeiros segundos são do rosto e do título (o gancho).
    const de = Math.max(ctx.ritmo === "corte" ? 2 : 0, a - 0.05);
    // No corte a cena de cinema é curta (2,6 a 3,6 s: são 3 a 4 por corte e o rosto volta entre elas); no longo, 3,2 a 5 s.
    const [minIns, maxIns] = ctx.ritmo === "corte" ? [2.6, 3.6] : [3.2, 5];
    const ate = Math.min(D, Math.min(de + maxIns, Math.max(b + 0.2, de + minIns)));
    const gap = ctx.ritmo === "corte" ? 1.5 : 0;
    if (planos.some((p) => p.de < ate + gap && p.ate > de - gap)) {
      avisos.push(`${id}: inserção caiu (cruza ou encosta numa peça de tela, de lado ou outra inserção)`);
      continue;
    }
    planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "insercao", midia: id });
  }
  planos.sort((a, b) => a.de - b.de);

  // 4b. O B-ROLL de banco (03/10, terceira volta): 1,5 a 3 s de imagem real na
  // palavra que a pede. Não cobre demonstração (câmera pedida, seta, círculo),
  // nem o título de trás (a pessoa recortada é da gravação), e nunca encosta
  // em tela cheia, cartão ou outra inserção: o rosto volta entre eles.
  const camerasPedidas = (e.camera ?? []).map((c) => [t(c.de), t(c.ate)]).filter((x): x is [number, number] => x[0] !== null && x[1] !== null);
  const naoCobre = new Set(["titulo-atras", "seta", "circulo", "fecho"]);
  const inicioMinimo = ctx.ritmo === "corte" ? 2 : 1;
  for (const [k, b] of (e.broll ?? []).entries()) {
    const id = String(b.id ?? `b${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `b${k + 1}`;
    const midia = ctx.insercoes[id];
    if (!midia || midia.origem !== "banco") continue;
    const a = t(b.de);
    const z = t(b.ate);
    if (a === null || z === null) continue;
    let de = Math.max(inicioMinimo, a - 0.05);
    const dur = Math.min(3, Math.max(1.5, z + 0.1 - de));
    // O rosto volta por pelo menos 0,8 s entre duas imagens. Se encosta, o
    // B-roll DESLIZA para depois do que atrapalha, enquanto a fala ainda é
    // dele (até 1,5 s depois do "ate"); só cai se não couber.
    const folga = 0.8;
    const bate = (x: number, y: number) => planos.find((p) => p.de < y + folga && p.ate > x - folga);
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const b0 = bate(de, de + dur);
      if (!b0) break;
      de = b0.ate + folga;
    }
    const ate = Math.min(D - 0.4, de + dur);
    if (ate - de < 1.4 || de > z + 1.5) {
      avisos.push(`${id}: B-roll caiu (sem espaço perto da palavra)`);
      continue;
    }
    if (bate(de, ate)) {
      avisos.push(`${id}: B-roll caiu (encosta numa tela, cartão ou inserção)`);
      continue;
    }
    if (momentos.some((m) => naoCobre.has(m.peca) && m.de < ate && m.ate > de) || camerasPedidas.some(([x, y]) => x < ate && y > de)) {
      avisos.push(`${id}: B-roll caiu (cobriria uma demonstração ou o título de trás)`);
      continue;
    }
    planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "insercao", midia: id });
    planos.sort((x, y) => x.de - y.de);
  }

  // 5. A câmera: o ritmo e, por cima, o que o editor pediu.
  const pedidos: Enquadramento[] = [];
  for (const c of e.camera ?? []) {
    const a = t(c.de);
    const b = t(c.ate);
    if (a === null || b === null || b - a < 0.6) continue;
    const zoom = Math.min(2, Math.max(1, Number(c.zoom) || 1));
    pedidos.push({ de: Math.max(0, a - 0.05), ate: Math.min(D, b + 0.2), zoom, x: Math.min(0.95, Math.max(0.05, c.foco?.x ?? x0)), y: Math.min(0.95, Math.max(0.05, c.foco?.y ?? y0)), movimento: c.movimento === "empurrao" ? "empurrao" : "fixo", zoomFinal: c.movimento === "empurrao" ? zoom * 1.08 : undefined });
  }
  const corte = ctx.ritmo === "corte";
  let camera = sobreporCamera(cameraDeRitmo(frases, D, ctx.rosto, ctx.estiloId, corte ? ctx.palavras : undefined, ctx.tema.visual === "documental"), pedidos);
  // Peça "sobre" com texto no topo: a câmera não fecha demais (o rosto não sobe para baixo do título).
  // No corte o título e a pergunta já descem para o peito (arejarCorte): só o título de trás segura a câmera.
  const seguram = corte ? ["titulo-atras"] : ["titulo", "capitulo", "pergunta-resposta", "titulo-atras"];
  for (const m of momentos.filter((x) => x.plano === "cheio" && seguram.includes(x.peca))) {
    for (const c of camera)
      if (c.de < m.ate && c.ate > m.de && c.zoom > 1.15 && !pedidos.includes(c)) {
        c.zoom = 1.12;
        if (c.zoomFinal) c.zoomFinal = +(1.12 * 1.04).toFixed(3);
      }
  }
  // 5b. O ZOOM DE SOCO (03/10, terceira volta): na palavra de ênfase a câmera
  // fecha de uma vez (+18% sobre o plano do momento, até 1,32: a gravação deitada recortada em 9:16 não aguenta mais sem amolecer) por ~1 s e volta.
  // Sem ênfase do editor, as palavras-chave e os sublinhados dão o instante.
  const socos = (e.enfases ?? []).map((a) => t(a)).filter((x): x is number => x !== null);
  if (!socos.length) for (const m of momentos) if (m.peca === "palavra-chave" || m.peca === "sublinhado") socos.push(m.de + 0.12);
  const ocupado = (de: number, ate: number) =>
    planos.some((p) => p.de < ate && p.ate > de) || momentos.some((m) => m.peca === "titulo-atras" && m.de < ate && m.ate > de) || pedidos.some((p) => p.de < ate && p.ate > de);
  let ultimoSoco = -10;
  const socosFeitos: Enquadramento[] = [];
  for (const s0 of socos.sort((a, b) => a - b)) {
    const de = Math.max(0, s0 - 0.03);
    const ate = Math.min(D, de + 1.1);
    if (de - ultimoSoco < 2.5 || ate - de < 0.6 || ocupado(de, ate)) continue;
    const z = Math.min(1.32, +(zoomEm(camera, de) * (ctx.tema.visual === "documental" ? 1.1 : 1.18)).toFixed(3));
    socosFeitos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), zoom: z, x: x0, y: y0, movimento: "fixo" });
    ultimoSoco = de;
  }
  if (socosFeitos.length) camera = sobreporCamera(camera, socosFeitos);

  const edicao: EdicaoResolvida = {
    versao: 1,
    largura: W,
    altura: H,
    fps: 30,
    duracao: D,
    tema: ctx.tema,
    logoUrl: ctx.logoUrl,
    camadas,
    planos,
    camera,
    legenda: ctx.comLegenda ? { paginas: paginasDaLegenda(ctx.palavras) } : null,
    insercoes: ctx.insercoes,
    palco: true,
  };
  return { edicao, avisos, momentos };
}

/** Números para o relatório: quanto da duração tem peça, quanto o rosto some. */
export function medidasDaEdicao(ed: EdicaoResolvida): { pecas: number; porMinuto: number; comPeca: number; semRosto: number; insercoes: number; broll: number; tiposDePeca: number } {
  const D = Math.max(1, ed.duracao);
  const reais = ed.camadas.filter((c) => c.peca !== "moldura-do-cartao");
  const soma = (xs: Array<{ de: number; ate: number }>) => xs.reduce((s, x) => s + (x.ate - x.de), 0);
  return {
    pecas: reais.length,
    porMinuto: +(reais.length / (D / 60)).toFixed(1),
    comPeca: +(soma(reais) / D).toFixed(3),
    semRosto: +(soma(ed.planos.filter((p) => p.tipo === "grafico" || p.tipo === "insercao")) / D).toFixed(3),
    insercoes: ed.planos.filter((p) => p.tipo === "insercao" && ed.insercoes[p.midia]?.origem !== "banco").length,
    broll: ed.planos.filter((p) => p.tipo === "insercao" && ed.insercoes[p.midia]?.origem === "banco").length,
    tiposDePeca: new Set(reais.map((c) => c.peca)).size,
  };
}
