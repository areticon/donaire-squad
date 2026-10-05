import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import { FICHAS, passesDaPeca, pecaContinua } from "@/lib/media/editor-sob-medida/pecas";
import { caixaDoCartao, cameraDeRitmo, frasesNumeradas, limparSvg, paginasDaLegenda, resolverAncora } from "@/lib/media/editor-sob-medida/resolver";
import { posicionarLegenda } from "@/lib/media/editor-sob-medida/faixa-da-legenda";
import type { CamadaResolvida, EdicaoResolvida, Enquadramento, MidiaDaInsercao, PlanoResolvido, Tema } from "@/lib/media/editor-sob-medida/tipos";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";

/**
 * O RESOLVEDOR DO EDITOR POR COMANDO (05/10/2026): o plano do diretor (âncoras
 * na fala) vira a edição que o worker desenha (segundos e pixels), SEM as
 * regras de colisão do editor sob medida. Nada é derrubado por cruzar outra
 * peça, nada é inventado para encher buraco (o "sublinhado" genérico), nenhum
 * gancho é imposto: o diretor é o responsável pelo layout.
 *
 * O que fica aqui é só o que é medida:
 *   - a âncora vira segundo; a duração respeita o mínimo e o máximo da peça;
 *   - o plano da gravação que a peça pede (tela cheia, cartão ao lado);
 *     dois planos que se cruzam são APARADOS no encontro (o worker compõe um
 *     plano por vez), nunca removidos;
 *   - a câmera de ritmo do corte por baixo e a pedida pelo diretor por cima;
 *   - a ÚNICA checagem de sobreposição: a legenda sobe para o topo ou some
 *     quando o texto de uma peça ocupa a faixa dela (posicionarLegenda).
 *
 * Módulo puro.
 */

export type ContextoDoComando = {
  palavras: PalavraNoCorte[];
  duracao: number;
  largura: number;
  altura: number;
  tema: Tema;
  rosto: Retangulo;
  comLegenda: boolean;
  logoUrl: string | null;
  insercoes: Record<string, MidiaDaInsercao>;
};

function limparProps(v: unknown, prof = 0): unknown {
  if (prof > 4) return null;
  if (typeof v === "string") return v.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim().slice(0, 220);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => limparProps(x, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).map(([k, x]) => [k, k === "svg" ? limparSvg(String(x)) : limparProps(x, prof + 1)]));
  return null;
}

function sobreporCamera(base: Enquadramento[], pedidos: Enquadramento[]): Enquadramento[] {
  let saida = base.map((c) => ({ ...c }));
  for (const p of [...pedidos].sort((a, b) => a.de - b.de)) {
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

const PECAS_COM_FOTO: Record<string, string> = { colagem: "recortes", jornal: "foto", "mapa-antigo": "foto", censura: "figura", cronologia: "marcos" };

export function resolverPorComando(p: PlanoDoDiretor, ctx: ContextoDoComando): { edicao: EdicaoResolvida; avisos: string[] } {
  const avisos: string[] = [];
  const frases = frasesNumeradas(ctx.palavras);
  const D = ctx.duracao;
  const W = ctx.largura;
  const H = ctx.altura;
  const t = (a: string) => resolverAncora(a, frases, ctx.palavras);
  const x0 = Math.min(0.85, Math.max(0.15, ctx.rosto.x + ctx.rosto.w / 2));
  const y0 = Math.min(0.75, Math.max(0.2, ctx.rosto.y + ctx.rosto.h * 0.55));

  // 1. As peças, em segundos.
  const camadas: CamadaResolvida[] = [];
  const planos: PlanoResolvido[] = [];
  for (const [k, m] of (p.momentos ?? []).entries()) {
    const ficha = FICHAS[m.peca];
    const id = String(m.id ?? `m${k + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || `m${k + 1}`;
    if (!ficha) {
      avisos.push(`${id}: peça desconhecida "${m.peca}"`);
      continue;
    }
    const t0 = t(m.de);
    const t1 = t(m.ate);
    if (t0 === null || t1 === null) {
      avisos.push(`${id}: âncora que não está na fala (${m.de} a ${m.ate})`);
      continue;
    }
    const de = Math.max(0, t0 - 0.12);
    let ate = Math.min(D, Math.max(t1 + 0.2, de + ficha.duracao[0]));
    if (ate - de > ficha.duracao[1]) ate = de + ficha.duracao[1];
    if (ate - de < 0.6) {
      avisos.push(`${id}: curto demais no fim do vídeo`);
      continue;
    }
    const props = limparProps(m.props ?? {}) as Record<string, unknown>;
    if (ficha.eventosDe && Array.isArray(props[ficha.eventosDe])) props[ficha.eventosDe] = (props[ficha.eventosDe] as unknown[]).slice(0, ficha.maxItens ?? 6);
    const nItens = ficha.eventosDe ? (Array.isArray(props[ficha.eventosDe]) ? (props[ficha.eventosDe] as unknown[]).length : 0) : ficha.umEvento ? 1 : 0;
    const eventos = (m.eventos ?? [])
      .map((a) => t(a))
      .filter((x): x is number => x !== null)
      .map((x) => Math.max(de + 0.25, x - 0.05))
      .filter((x) => x < ate - 0.3)
      .sort((a, b) => a - b)
      .slice(0, nItens);
    // Eventos que o diretor não ancorou: espalhados no tempo da peça (a peça precisa de um por item para desenhar).
    if (nItens && eventos.length < nItens) {
      const ini = eventos.length ? eventos[eventos.length - 1] : ficha.umEvento ? de + (ate - de) * 0.4 : de + ficha.entrada * 0.6;
      const faltam = nItens - eventos.length;
      const passo = Math.max(0.35, (ate - 0.6 - ini) / Math.max(1, faltam));
      for (let i = 0; i < faltam; i++) eventos.push(Math.min(ate - 0.4, ini + passo * (i + (eventos.length ? 1 : 0))));
    }
    if (ficha.nome === "titulo-atras") props.cabeca = +Math.max(0.05, ctx.rosto.y).toFixed(3);
    let plano: "cheio" | "grafico" | "cartao" = ficha.plano === "tela" ? "grafico" : ficha.plano === "lado" ? "cartao" : "cheio";
    if (m.plano === "grafico" && ficha.plano !== "tela") plano = "grafico";
    if (plano === "cartao") {
      const lado = props.lado === "direita" || props.posicao === "direita" ? "direita" : "esquerda";
      props.lado = lado;
    }
    camadas.push({ id, peca: ficha.nome, de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: ficha.entrada, saida: ficha.saida, evento: ficha.evento, eventos: eventos.map((x) => +x.toFixed(3)), props, passes: passesDaPeca(ficha), ...(pecaContinua(ficha) ? { continua: true } : {}) });
    if (plano === "grafico") planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "grafico" });
    if (plano === "cartao") {
      const caixa = caixaDoCartao(W, H, props.lado === "direita" ? "direita" : "esquerda");
      planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "cartao", caixa, zoom: 1.15, x: x0, y: y0 });
      camadas.push({ id: `${id}-moldura`, peca: "moldura-do-cartao", de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: 0.55, saida: 0.2, evento: 0.5, eventos: [], props: { ...caixa }, passes: ["frente"] });
    }
  }

  // 2. As imagens de cinema (tela cheia, foto com movimento): onde o diretor pôs.
  for (const [k, ins] of (p.insercoes ?? []).entries()) {
    const id = String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}`;
    if (!ctx.insercoes[id]) {
      avisos.push(`${id}: imagem não gerada, ficou de fora`);
      continue;
    }
    const a = t(ins.de);
    const b = t(ins.ate);
    if (a === null || b === null) continue;
    const de = Math.max(0, a - 0.05);
    const ate = Math.min(D, Math.min(de + 5, Math.max(b + 0.2, de + 2.4)));
    planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "insercao", midia: id });
  }

  // 3. Planos que se cruzam: o que começa depois manda, o anterior é aparado no encontro (nunca sai).
  planos.sort((a, b) => a.de - b.de);
  for (let i = 0; i + 1 < planos.length; i++) {
    const a = planos[i];
    const b = planos[i + 1];
    if (a.ate > b.de) {
      avisos.push(`plano ${a.tipo} em ${a.de.toFixed(1)} s aparado em ${b.de.toFixed(1)} s (cruzava o seguinte)`);
      a.ate = +Math.max(a.de + 0.1, b.de).toFixed(3);
    }
  }
  const planosOk = planos.filter((x) => x.ate - x.de >= 0.1);

  // 4. O fundo de colagem atrás da pessoa, quando o diretor pediu (os recortes que as peças já pagaram).
  if (p.tema?.fundoColagem && FICHAS["fundo-colagem"]) {
    const ficha = FICHAS["fundo-colagem"];
    const fotos = (p.momentos ?? []).flatMap((m) => {
      const campo = PECAS_COM_FOTO[m.peca];
      const v0 = campo ? (m.props as Record<string, unknown> | undefined)?.[campo] : null;
      const v = m.peca === "cronologia" && Array.isArray(v0) ? v0.map((x) => (x as { foto?: unknown } | null)?.foto) : v0;
      return (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter((f): f is { url: string; assunto?: string } => Boolean(f && typeof (f as { url?: unknown }).url === "string"));
    });
    const recortes = fotos.slice(0, 6).map((f) => ({ url: f.url, assunto: f.assunto ?? "objeto" }));
    // Só nos trechos com a pessoa cheia (fora dos planos): sob a tela cheia ele não aparece e não precisa de render.
    let cursor = 0;
    let k = 0;
    const trechos: Array<[number, number]> = [];
    for (const pl of planosOk) {
      if (pl.de - cursor > 0.3) trechos.push([cursor, pl.de]);
      cursor = Math.max(cursor, pl.ate);
    }
    if (D - cursor > 0.3) trechos.push([cursor, D]);
    for (const [a, b] of trechos) camadas.push({ id: `fundo-${Math.round(a * 10)}`, peca: "fundo-colagem", de: +a.toFixed(3), ate: +b.toFixed(3), entrada: ficha.entrada, saida: ficha.saida, evento: ficha.evento, eventos: [], props: { semente: k++, recortes }, passes: ["atras"] });
  }
  camadas.sort((a, b) => a.de - b.de);

  // 5. A câmera: o ritmo do corte e, por cima, o que o diretor pediu.
  const pedidos: Enquadramento[] = [];
  for (const c of p.camera ?? []) {
    const a = t(c.de);
    const b = t(c.ate);
    if (a === null || b === null || b - a < 0.5) continue;
    const zoom = Math.min(2, Math.max(1, Number(c.zoom) || 1));
    pedidos.push({ de: Math.max(0, a - 0.05), ate: Math.min(D, b + 0.2), zoom, x: Math.min(0.95, Math.max(0.05, c.foco?.x ?? x0)), y: Math.min(0.95, Math.max(0.05, c.foco?.y ?? y0)), movimento: c.movimento === "empurrao" ? "empurrao" : "fixo", zoomFinal: c.movimento === "empurrao" ? zoom * 1.06 : undefined });
  }
  const vertical = H > W;
  let camera = sobreporCamera(cameraDeRitmo(frases, D, ctx.rosto, null, vertical ? ctx.palavras : undefined, ctx.tema.visual === "documental"), pedidos);
  // O título atrás da pessoa mede a cabeça no quadro aberto: ali a câmera fica aberta (senão a cabeça cobre as letras).
  for (const c0 of camadas.filter((c) => c.peca === "titulo-atras"))
    camera = camera.map((c) => (c.de < c0.ate && c.ate > c0.de && !pedidos.includes(c) ? { ...c, zoom: 1, zoomFinal: c.zoomFinal ? 1.03 : undefined } : c));
  // O soco de câmera nas ênfases, fora dos planos.
  const socos: Enquadramento[] = [];
  let ultimo = -10;
  for (const s0 of (p.enfases ?? []).map((a) => t(a)).filter((x): x is number => x !== null).sort((a, b) => a - b)) {
    const de = Math.max(0, s0 - 0.03);
    const ate = Math.min(D, de + 1.1);
    if (de - ultimo < 2.5 || planosOk.some((pl) => pl.de < ate && pl.ate > de) || pedidos.some((pl) => pl.de < ate && pl.ate > de)) continue;
    const z = Math.min(1.32, +((camera.find((c) => c.de <= de && c.ate > de)?.zoom ?? 1) * (ctx.tema.visual === "documental" ? 1.1 : 1.18)).toFixed(3));
    socos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), zoom: z, x: x0, y: y0, movimento: "fixo" });
    ultimo = de;
  }
  if (socos.length) camera = sobreporCamera(camera, socos);

  const edicao: EdicaoResolvida = {
    versao: 1,
    largura: W,
    altura: H,
    // O FPS DAS CAMADAS (05/10): o Chrome desenha cada quadro com movimento, e no corte de
    // 42 s as camadas a 30 fps levaram ~14 min no render local. A 15 fps (o padrão aqui) o
    // Chrome desenha a metade; o vídeo continua no fps da gravação (o worker segura o quadro).
    // EDITOR_POR_COMANDO_FPS volta para 30 sem deploy de código.
    fps: Math.min(30, Math.max(10, Number(process.env.EDITOR_POR_COMANDO_FPS) || 15)),
    duracao: D,
    tema: ctx.tema,
    logoUrl: ctx.logoUrl,
    camadas,
    planos: planosOk,
    camera,
    legenda: ctx.comLegenda ? { paginas: paginasDaLegenda(ctx.palavras) } : null,
    insercoes: ctx.insercoes,
    palco: true,
  };
  // 6. A única checagem de sobreposição: texto de peça contra a legenda.
  const l = posicionarLegenda(edicao);
  if (l.movidas || l.ocultas) avisos.push(`legenda: ${l.movidas} página(s) no topo e ${l.ocultas} escondida(s) sob peça com texto`);
  return { edicao: l.edicao, avisos };
}
