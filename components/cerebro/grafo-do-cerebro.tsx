"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Maximize2, Search, X } from "lucide-react";
import { criarSimulacao, type MolaDaForca, type NoDaForca, type Simulacao } from "@/components/cerebro/forca";
import { buscarNotas, dataCurta } from "@/lib/cerebro/montagem";
import { COR_DA_ESFERA, ESFERAS, ROTULO_DA_ESFERA, acoesDaNota, type CerebroNaTela, type Esfera, type LigacaoDoCerebro, type NotaDoCerebro } from "@/lib/cerebro/tipos";

/**
 * A TELA DO SEGUNDO CÉREBRO (06/10/2026), o mesmo jeito do Donaire Brains: um
 * grafo de forças em canvas, as esferas como pastas coloridas, a busca, e a
 * nota aberta ao clicar. No celular a nota abre como folha de baixo e o grafo
 * aceita arrastar e pinçar.
 *
 * As cores dos rótulos e das linhas saem das variáveis do tema (claro e
 * escuro); só as esferas têm cor própria, que é a da categoria.
 */

type No = NoDaForca & { nota: NotaDoCerebro; grau: number; nasceu: number };
type Transformacao = { x: number; y: number; k: number };
type Cores = { texto: string; fraco: string; fundo: string; borda: string; destaque: string };

const RAIO_DO_CENTRO = 11;
const RAIO_DA_ESFERA = 7.5;

const corDaNota = (n: NotaDoCerebro, cores: Cores) => (n.id === "projeto" ? cores.texto : n.esfera ? COR_DA_ESFERA[n.esfera] : cores.fraco);

function lerCores(el: HTMLElement | null): Cores {
  const css = el ? getComputedStyle(el) : null;
  const v = (nome: string, padrao: string) => css?.getPropertyValue(nome).trim() || padrao;
  return {
    texto: v("--text-primary", "#111827"),
    fraco: v("--text-muted", "#6b7280"),
    fundo: v("--bg-card", "#ffffff"),
    borda: v("--border", "rgba(0,0,0,.12)"),
    destaque: "#f08a3c",
  };
}

const ondeMora = (link: string | null): string => {
  if (!link) return "na tela dela";
  if (link.includes("/settings")) return "em Configurações";
  if (link.includes("/training")) return "em Treinamento";
  if (link.includes("/linha-editorial")) return "em Linha editorial";
  if (link.includes("/criar")) return "em Criar";
  if (link.includes("/live")) return "no Gestor";
  return "na tela dela";
};

const AVISO_DE_APAGAR: Partial<Record<NotaDoCerebro["fonte"], string>> = {
  regra: "A regra é apagada e deixa de valer para os agentes.",
  restricao: "A proibição de citar esses nomes deixa de valer.",
  feedback: "O pedido é apagado da plataforma, inclusive do registro de melhorias.",
  preferencia: "O pedido sai da memória e os agentes deixam de lê-lo.",
  recusa: "A recusa e o motivo saem da memória.",
  vera: "O registro do pedido à Vera é apagado (o que ela mudou continua como está).",
  peca: "O histórico desta peça sai da memória (a peça continua no quadro).",
  material: "O arquivo é apagado da sua biblioteca de materiais.",
  contexto: "O documento sai do treinamento do squad.",
};

export function GrafoDoCerebro({ projectId, inicial, souDono }: { projectId: string; inicial: CerebroNaTela; souDono: boolean }) {
  const [cerebro, setCerebro] = useState(inicial);
  const [busca, setBusca] = useState("");
  const [desligadas, setDesligadas] = useState<Set<Esfera>>(new Set());
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Simulacao | null>(null);
  const nos = useRef<Map<string, No>>(new Map());
  const vizinhos = useRef<Map<string, Set<string>>>(new Map());
  const ligacoesVivas = useRef<Array<{ a: No; b: No; tipo: LigacaoDoCerebro["tipo"] }>>([]);
  const posicoes = useRef<Map<string, { x: number; y: number }>>(new Map());
  const transf = useRef<Transformacao>({ x: 0, y: 0, k: 1 });
  const alvo = useRef<Transformacao | null>(null);
  const tamanho = useRef({ w: 0, h: 0, dpr: 1 });
  const cores = useRef<Cores>(lerCores(null));
  const foco = useRef<string | null>(null);
  const achadas = useRef<Set<string> | null>(null);
  const mexeu = useRef(false);
  const enquadrouUmaVez = useRef(false);
  const brilho = useRef(0);

  const notasPorId = useMemo(() => new Map(cerebro.notas.map((n) => [n.id, n])), [cerebro]);
  const resultados = useMemo(() => (busca.trim() ? buscarNotas(cerebro.notas.filter((n) => n.fonte !== "esfera" && n.id !== "projeto"), busca) : null), [busca, cerebro]);
  const totalDeNotas = cerebro.notas.filter((n) => n.fonte !== "esfera" && n.id !== "projeto").length;
  const totalDeLigacoes = cerebro.ligacoes.filter((l) => l.tipo !== "esfera").length;
  const contagem = useMemo(() => {
    const c = new Map<Esfera, number>();
    for (const n of cerebro.notas) if (n.esfera && n.fonte !== "esfera") c.set(n.esfera, (c.get(n.esfera) ?? 0) + 1);
    return c;
  }, [cerebro]);

  useEffect(() => {
    achadas.current = resultados ? new Set(resultados.map((n) => n.id)) : null;
  }, [resultados]);
  useEffect(() => {
    foco.current = selecionada;
  }, [selecionada]);

  // ── o tema ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ler = () => (cores.current = lerCores(caixa.current));
    ler();
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => obs.disconnect();
  }, []);

  // ── enquadrar ─────────────────────────────────────────────────────────────
  const enquadrar = useCallback((imediato = false) => {
    const lista = [...nos.current.values()];
    const { w, h } = tamanho.current;
    if (!lista.length || !w || !h) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of lista) {
      x0 = Math.min(x0, n.x - n.r);
      x1 = Math.max(x1, n.x + n.r);
      y0 = Math.min(y0, n.y - n.r);
      y1 = Math.max(y1, n.y + n.r);
    }
    const folga = w < 640 ? 28 : 60;
    const lateral = w >= 900 ? 300 : 0; // o painel da esquerda no computador
    const topo = w < 640 ? 64 : 0; // a busca por cima no celular
    const k = Math.max(0.15, Math.min(2.4, Math.min((w - lateral - folga * 2) / (x1 - x0 || 1), (h - topo - folga * 2) / (y1 - y0 || 1))));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const t = { x: -cx * k + lateral / 2, y: -cy * k + topo / 2, k };
    if (imediato) transf.current = t;
    else alvo.current = t;
  }, []);

  const centrarEm = useCallback((id: string) => {
    const n = nos.current.get(id);
    if (!n) return;
    const { w } = tamanho.current;
    const k = Math.max(transf.current.k, 1.5);
    const lateral = w >= 900 ? 300 : 0;
    const cartao = w >= 640 ? 372 : 0; // o cartão da nota à direita no computador
    const baixo = w < 640 ? tamanho.current.h * 0.22 : 0; // a folha da nota cobre a metade de baixo no celular
    alvo.current = { x: -n.x * k + (lateral - cartao) / 2, y: -n.y * k - baixo, k };
  }, []);

  const selecionadaRef = useRef<string | null>(null);
  const escolher = useCallback(
    (id: string | null, centrar = false) => {
      selecionadaRef.current = id;
      foco.current = id;
      setSelecionada(id);
      if (id && centrar) centrarEm(id);
    },
    [centrarEm]
  );
  const escolherRef = useRef(escolher);
  useEffect(() => {
    escolherRef.current = escolher;
  }, [escolher]);

  // ── o grafo: refeito quando as notas ou as esferas ligadas mudam ──────────
  useEffect(() => {
    const visiveis = cerebro.notas.filter((n) => !(n.esfera && desligadas.has(n.esfera)));
    const ids = new Set(visiveis.map((n) => n.id));
    const ligs = cerebro.ligacoes.filter((l) => ids.has(l.de) && ids.has(l.para));
    const grau = new Map<string, number>();
    for (const l of ligs) {
      if (l.tipo === "esfera") continue;
      grau.set(l.de, (grau.get(l.de) ?? 0) + 1);
      grau.set(l.para, (grau.get(l.para) ?? 0) + 1);
    }
    const esferasPresentes = ESFERAS.filter((e) => visiveis.some((n) => n.id === `esfera:${e}`));
    const agora = performance.now();
    const mapa = new Map<string, No>();
    for (const n of visiveis) {
      const antes = posicoes.current.get(n.id);
      let x: number, y: number;
      if (antes) ({ x, y } = antes);
      else if (n.id === "projeto") {
        x = 0;
        y = 0;
      } else {
        const e = n.esfera ? esferasPresentes.indexOf(n.esfera) : -1;
        const ang = e >= 0 ? (e / Math.max(1, esferasPresentes.length)) * Math.PI * 2 : Math.random() * Math.PI * 2;
        const raio = n.fonte === "esfera" ? 120 : 150 + Math.random() * 70;
        const giro = n.fonte === "esfera" ? 0 : (Math.random() - 0.5) * 0.9;
        x = Math.cos(ang + giro) * raio;
        y = Math.sin(ang + giro) * raio;
      }
      const g = grau.get(n.id) ?? 0;
      const r = n.id === "projeto" ? RAIO_DO_CENTRO : n.fonte === "esfera" ? RAIO_DA_ESFERA : Math.min(9, 3.2 + Math.sqrt(g) * 1.5);
      mapa.set(n.id, { id: n.id, x, y, vx: 0, vy: 0, r, nota: n, grau: g, nasceu: antes ? 0 : agora });
    }
    const molas: MolaDaForca[] = [];
    const vivas: Array<{ a: No; b: No; tipo: LigacaoDoCerebro["tipo"] }> = [];
    const viz = new Map<string, Set<string>>([...mapa.keys()].map((k) => [k, new Set<string>()]));
    for (const l of ligs) {
      const a = mapa.get(l.de)!;
      const b = mapa.get(l.para)!;
      const doCentro = a.id === "projeto" || b.id === "projeto";
      const distancia = l.tipo === "esfera" ? (doCentro ? 95 : 42) : l.tipo === "mesma_peca" ? 28 : 50;
      const forca = l.tipo === "esfera" ? (doCentro ? 0.6 : 0.32) : l.tipo === "mesma_peca" ? 0.7 : 0.45;
      molas.push({ a, b, distancia, forca });
      vivas.push({ a, b, tipo: l.tipo });
      viz.get(a.id)!.add(b.id);
      viz.get(b.id)!.add(a.id);
    }
    nos.current = mapa;
    ligacoesVivas.current = vivas;
    vizinhos.current = viz;
    // Medido aqui, e não do `tamanho` (o efeito que mede o canvas roda depois deste).
    const largura = tela.current?.clientWidth ?? 0;
    const altura = tela.current?.clientHeight ?? 0;
    const emPe = altura > largura * 1.15;
    const s = criarSimulacao([...mapa.values()], molas, { repulsao: emPe ? 45 : 55, centroX: emPe ? 0.1 : 0.04, centroY: emPe ? 0.025 : 0.04 });
    if (posicoes.current.size) s.alpha = 0.5;
    sim.current = s;
  }, [cerebro, desligadas]);

  // ── tamanho do canvas ─────────────────────────────────────────────────────
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      tamanho.current = { w, h, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // ── o laço de desenho ─────────────────────────────────────────────────────
  useEffect(() => {
    let quadro = 0;
    let vivo = true;
    const desenhar = (agora: number) => {
      if (!vivo) return;
      quadro = requestAnimationFrame(desenhar);
      const c = tela.current;
      const s = sim.current;
      if (!c || !s) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      s.passo();
      for (const n of nos.current.values()) posicoes.current.set(n.id, { x: n.x, y: n.y });
      if (!enquadrouUmaVez.current && !mexeu.current && s.alpha < 0.08) {
        enquadrouUmaVez.current = true;
        enquadrar();
      }
      if (alvo.current) {
        const t = transf.current;
        const a = alvo.current;
        t.x += (a.x - t.x) * 0.16;
        t.y += (a.y - t.y) * 0.16;
        t.k += (a.k - t.k) * 0.16;
        if (Math.abs(a.x - t.x) < 0.5 && Math.abs(a.y - t.y) < 0.5 && Math.abs(a.k - t.k) < 0.002) {
          transf.current = { ...a };
          alvo.current = null;
        }
      }
      const { w, h, dpr } = tamanho.current;
      const { x: tx, y: ty, k } = transf.current;
      const cor = cores.current;
      const idFoco = foco.current;
      const viz = idFoco ? vizinhos.current.get(idFoco) : null;
      const ach = achadas.current;
      const querBrilho = idFoco || ach ? 1 : 0;
      brilho.current += (querBrilho - brilho.current) * 0.15;
      const b = brilho.current;
      const aceso = (id: string) => (idFoco ? id === idFoco || Boolean(viz?.has(id)) : ach ? ach.has(id) : true);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + tx, h / 2 + ty);
      ctx.scale(k, k);
      ctx.lineCap = "round";
      for (const l of ligacoesVivas.current) {
        const ligada = idFoco ? l.a.id === idFoco || l.b.id === idFoco : ach ? ach.has(l.a.id) && ach.has(l.b.id) : false;
        const base = l.tipo === "esfera" ? 0.16 : l.tipo === "jev" ? 0.55 : 0.4;
        ctx.globalAlpha = ligada ? base + (0.9 - base) * b : base * (1 - 0.75 * b);
        ctx.strokeStyle = ligada ? cor.destaque : l.tipo === "jev" ? cor.texto : cor.fraco;
        ctx.lineWidth = ((ligada ? 1.6 : l.tipo === "jev" ? 1.1 : 0.8) / Math.max(0.6, Math.sqrt(k))) * (l.tipo === "esfera" ? 0.8 : 1);
        if (l.tipo === "mesma_peca") ctx.setLineDash([3 / k, 3 / k]);
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        ctx.stroke();
        if (l.tipo === "mesma_peca") ctx.setLineDash([]);
      }
      for (const n of nos.current.values()) {
        const luz = aceso(n.id);
        // O relógio do quadro pode vir um pouco antes do instante em que a nota
        // nasceu: sem o piso em zero, o raio sai negativo e o canvas lança erro.
        const cresce = n.nasceu ? Math.max(0, Math.min(1, (agora - n.nasceu) / 450)) : 1;
        const r = Math.max(0.1, n.r * (cresce < 1 ? 1 - Math.pow(1 - cresce, 3) : 1));
        ctx.globalAlpha = luz ? 1 : 1 - 0.8 * b;
        if (n.id === idFoco) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 4 / Math.sqrt(k) + 1.5, 0, Math.PI * 2);
          ctx.fillStyle = cor.destaque;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = corDaNota(n.nota, cor);
        ctx.fill();
        if (n.nota.fonte === "esfera" || n.id === "projeto") {
          ctx.lineWidth = 1.5 / k;
          ctx.strokeStyle = cor.fundo;
          ctx.stroke();
        }
        if (n.nota.duradoura) {
          ctx.lineWidth = 1.2 / k;
          ctx.strokeStyle = cor.texto;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 1.8 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Rótulos em coordenada de tela, com fundo do tema para ler sobre as linhas.
      // Por prioridade (a nota aberta, o centro, as esferas, as maiores), e um
      // rótulo que cairia em cima de outro já desenhado fica de fora: nome
      // embaralhado é pior que nome escondido, que aparece ao aproximar.
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const ocupados: Array<[number, number, number, number]> = [];
      const prioridade = (n: No) => (n.id === idFoco ? 0 : n.id === "projeto" ? 1 : n.nota.fonte === "esfera" ? 2 : 3);
      const ordem = [...nos.current.values()].sort((p, q) => prioridade(p) - prioridade(q) || q.r - p.r);
      for (const n of ordem) {
        const luz = aceso(n.id);
        const fixo = n.id === "projeto" || n.nota.fonte === "esfera";
        const px = n.r * k;
        // Nome da nota só quando ela já está grande na tela: no enquadramento
        // inicial ficam os nomes do centro e das esferas, sem o emaranhado.
        const porZoom = Math.max(0, Math.min(1, (px - 10) / 4));
        let a = fixo ? 1 : porZoom;
        if (idFoco || ach) a = luz ? Math.max(a, b) : a * (1 - b);
        if (a < 0.05) continue;
        const sx = n.x * k + tx + w / 2;
        const sy = n.y * k + ty + h / 2 + n.r * k + 3;
        if (sx < -120 || sx > w + 120 || sy < -20 || sy > h + 20) continue;
        const grande = n.id === idFoco || fixo;
        ctx.font = `${grande ? 600 : 400} ${grande ? 12.5 : 11.5}px Inter, ui-sans-serif, system-ui, sans-serif`;
        const t = n.nota.titulo.length > 40 ? `${n.nota.titulo.slice(0, 38)}...` : n.nota.titulo;
        const largura = ctx.measureText(t).width;
        const caixaDoRotulo: [number, number, number, number] = [sx - largura / 2 - 3, sy - 1, sx + largura / 2 + 3, sy + (grande ? 16 : 14)];
        if (n.id !== idFoco && ocupados.some((o) => caixaDoRotulo[0] < o[2] && caixaDoRotulo[2] > o[0] && caixaDoRotulo[1] < o[3] && caixaDoRotulo[3] > o[1])) continue;
        ocupados.push(caixaDoRotulo);
        ctx.globalAlpha = a * 0.82;
        ctx.fillStyle = cor.fundo;
        ctx.fillRect(sx - largura / 2 - 3, sy - 1, largura + 6, grande ? 17 : 15);
        ctx.globalAlpha = a;
        ctx.fillStyle = cor.texto;
        ctx.fillText(t, sx, sy);
      }
      ctx.globalAlpha = 1;
    };
    quadro = requestAnimationFrame(desenhar);
    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
    };
  }, [enquadrar]);

  // ── toque, mouse e roda ───────────────────────────────────────────────────
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const ponteiros = new Map<number, { x: number; y: number }>();
    let arrastando: No | null = null;
    let inicio: { x: number; y: number } | null = null;
    let andou = false;
    let pinca: { d: number; k: number; mx: number; my: number; tx: number; ty: number } | null = null;

    const local = (ev: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const paraMundo = (px: number, py: number) => {
      const { w, h } = tamanho.current;
      const { x, y, k } = transf.current;
      return { x: (px - w / 2 - x) / k, y: (py - h / 2 - y) / k };
    };
    const acharNo = (px: number, py: number, dedo: boolean) => {
      const m = paraMundo(px, py);
      let melhor: No | null = null;
      let md = Infinity;
      const folga = (dedo ? 14 : 5) / transf.current.k;
      for (const n of nos.current.values()) {
        const d = Math.hypot(n.x - m.x, n.y - m.y);
        if (d < n.r + folga && d < md) {
          md = d;
          melhor = n;
        }
      }
      return melhor;
    };

    const baixar = (ev: PointerEvent) => {
      c.setPointerCapture(ev.pointerId);
      const p = local(ev);
      ponteiros.set(ev.pointerId, p);
      alvo.current = null;
      if (ponteiros.size === 2) {
        const [a, b] = [...ponteiros.values()];
        pinca = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: transf.current.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, tx: transf.current.x, ty: transf.current.y };
        if (arrastando) {
          arrastando.fx = null;
          arrastando.fy = null;
          arrastando = null;
        }
        return;
      }
      inicio = p;
      andou = false;
      arrastando = acharNo(p.x, p.y, ev.pointerType !== "mouse");
      if (arrastando) {
        arrastando.fx = arrastando.x;
        arrastando.fy = arrastando.y;
        if (sim.current) sim.current.alvoDoAlpha = 0.2;
      }
    };
    const mover = (ev: PointerEvent) => {
      const p = local(ev);
      if (!ponteiros.has(ev.pointerId)) {
        if (ev.pointerType === "mouse") {
          const n = acharNo(p.x, p.y, false);
          c.style.cursor = n ? "pointer" : "grab";
          foco.current = n?.id ?? selecionadaRef.current;
        }
        return;
      }
      const antes = ponteiros.get(ev.pointerId)!;
      ponteiros.set(ev.pointerId, p);
      if (pinca && ponteiros.size >= 2) {
        const [a, b] = [...ponteiros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k = Math.max(0.12, Math.min(8, (pinca.k * d) / pinca.d));
        const { w, h } = tamanho.current;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const wx = (pinca.mx - w / 2 - pinca.tx) / pinca.k;
        const wy = (pinca.my - h / 2 - pinca.ty) / pinca.k;
        transf.current = { k, x: mx - w / 2 - wx * k, y: my - h / 2 - wy * k };
        mexeu.current = true;
        andou = true;
        return;
      }
      if (inicio && Math.hypot(p.x - inicio.x, p.y - inicio.y) > 5) andou = true;
      if (arrastando) {
        const m = paraMundo(p.x, p.y);
        arrastando.fx = m.x;
        arrastando.fy = m.y;
        sim.current?.reaquecer(0.3);
      } else if (andou) {
        transf.current = { ...transf.current, x: transf.current.x + p.x - antes.x, y: transf.current.y + p.y - antes.y };
        mexeu.current = true;
        c.style.cursor = "grabbing";
      }
    };
    const soltar = (ev: PointerEvent) => {
      const p = local(ev);
      ponteiros.delete(ev.pointerId);
      if (ponteiros.size < 2) pinca = null;
      if (ponteiros.size > 0) return;
      if (sim.current) sim.current.alvoDoAlpha = 0;
      if (arrastando) {
        const n = arrastando;
        n.fx = null;
        n.fy = null;
        arrastando = null;
        if (!andou) escolherRef.current(n.id);
      } else if (!andou) {
        const n = acharNo(p.x, p.y, ev.pointerType !== "mouse");
        escolherRef.current(n ? n.id : null);
      }
      c.style.cursor = "grab";
      inicio = null;
    };
    const roda = (ev: WheelEvent) => {
      ev.preventDefault();
      alvo.current = null;
      const p = local(ev);
      const { w, h } = tamanho.current;
      const t = transf.current;
      const k = Math.max(0.12, Math.min(8, t.k * Math.exp(-ev.deltaY * 0.0015)));
      const wx = (p.x - w / 2 - t.x) / t.k;
      const wy = (p.y - h / 2 - t.y) / t.k;
      transf.current = { k, x: p.x - w / 2 - wx * k, y: p.y - h / 2 - wy * k };
      mexeu.current = true;
    };
    const sair = () => {
      if (!ponteiros.size) foco.current = selecionadaRef.current;
    };
    c.addEventListener("pointerdown", baixar);
    c.addEventListener("pointermove", mover);
    c.addEventListener("pointerup", soltar);
    c.addEventListener("pointercancel", soltar);
    c.addEventListener("pointerleave", sair);
    c.addEventListener("wheel", roda, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", baixar);
      c.removeEventListener("pointermove", mover);
      c.removeEventListener("pointerup", soltar);
      c.removeEventListener("pointercancel", soltar);
      c.removeEventListener("pointerleave", sair);
      c.removeEventListener("wheel", roda);
    };
  }, []);

  const recarregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/cerebro`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { cerebro: CerebroNaTela };
    setCerebro(j.cerebro);
  }, [projectId]);

  const aberta = selecionada ? notasPorId.get(selecionada) ?? null : null;

  const ligadasA = useMemo(() => {
    if (!aberta) return [];
    const ids = new Map<string, LigacaoDoCerebro["tipo"]>();
    for (const l of cerebro.ligacoes) {
      if (l.de === aberta.id) ids.set(l.para, l.tipo);
      else if (l.para === aberta.id) ids.set(l.de, l.tipo);
    }
    return [...ids.entries()]
      .map(([id, tipo]) => ({ nota: notasPorId.get(id)!, tipo }))
      .filter((x) => x.nota)
      .sort((a, b) => (a.tipo === "esfera" ? 1 : 0) - (b.tipo === "esfera" ? 1 : 0) || (b.nota.quando ?? "").localeCompare(a.nota.quando ?? ""));
  }, [aberta, cerebro, notasPorId]);

  const vazio = totalDeNotas === 0;

  return (
    <div className="px-4 pb-6 pt-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Segundo cérebro
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Tudo o que você pediu, aprovou, recusou e decidiu neste projeto, ligado nota a nota. Os agentes leem daqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-muted)" }} data-testid="contagem-do-cerebro">
            {totalDeNotas} {totalDeNotas === 1 ? "nota" : "notas"} · {totalDeLigacoes} {totalDeLigacoes === 1 ? "ligação" : "ligações"}
          </span>
          {souDono && !vazio && (
            <a
              href={`/api/projects/${projectId}/cerebro?baixar=md`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-orange-500"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              title="Baixar a memória inteira em texto"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar cópia
            </a>
          )}
        </div>
      </div>

      <div
        ref={caixa}
        className="relative overflow-hidden rounded-xl border"
        style={{ height: "min(78dvh, 860px)", minHeight: 460, borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <canvas ref={tela} className="block h-full w-full" style={{ touchAction: "none", cursor: "grab" }} aria-label="Grafo das notas do segundo cérebro" />

        {vazio && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <p className="max-w-sm text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Ainda não há notas. Cada aprovação, recusa, pedido no chat, regra e material entra aqui sozinho, e o cérebro cresce com o uso.
            </p>
          </div>
        )}

        {/* O PAINEL: busca e esferas. Coluna à esquerda no computador; barra por cima no celular. */}
        <aside
          className="absolute left-3 right-3 top-3 z-10 rounded-lg border shadow-lg backdrop-blur lg:right-auto lg:w-[284px]"
          style={{ background: "color-mix(in srgb, var(--bg-card) 92%, transparent)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nota, etiqueta ou assunto"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-primary)" }}
              aria-label="Buscar no segundo cérebro"
            />
            <button type="button" onClick={() => enquadrar()} className="shrink-0 rounded p-1 transition-colors hover:bg-black/5" title="Enquadrar tudo" aria-label="Enquadrar tudo">
              <Maximize2 className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
          {resultados && (
            <ul className="max-h-48 overflow-auto border-t px-1 py-1" style={{ borderColor: "var(--border)" }}>
              {resultados.length === 0 && (
                <li className="px-2 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Nenhuma nota com isso.
                </li>
              )}
              {resultados.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => escolher(n.id, true)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-black/5">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: n.esfera ? COR_DA_ESFERA[n.esfera] : "var(--text-muted)" }} />
                    <span className="truncate" style={{ color: "var(--text-primary)" }}>
                      {n.titulo}
                    </span>
                  </button>
                </li>
              ))}
              {resultados.length > 8 && (
                <li className="px-2 py-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  e mais {resultados.length - 8} acesas no grafo
                </li>
              )}
            </ul>
          )}
          <div className="flex gap-1.5 overflow-x-auto border-t px-3 py-2 scrollbar-none lg:flex-col lg:gap-0.5 lg:overflow-visible" style={{ borderColor: "var(--border)" }}>
            {ESFERAS.filter((e) => contagem.get(e)).map((e) => {
              const desligada = desligadas.has(e);
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={!desligada}
                  onClick={() =>
                    setDesligadas((s) => {
                      const n = new Set(s);
                      if (n.has(e)) n.delete(e);
                      else n.add(e);
                      return n;
                    })
                  }
                  className="flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-opacity lg:rounded-md lg:border-0 lg:px-1.5"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", opacity: desligada ? 0.4 : 1 }}
                >
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_DA_ESFERA[e] }} />
                  <span className="whitespace-nowrap">{ROTULO_DA_ESFERA[e]}</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {contagem.get(e)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="hidden border-t px-3 py-2 text-[11px] lg:block" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            Arraste para mover, role para aproximar, clique numa nota. Anel em volta: preferência que vale para as próximas peças. Linha tracejada: mesma peça.
          </p>
        </aside>

        {aberta && (
          <NotaAberta
            key={aberta.id}
            projectId={projectId}
            nota={aberta}
            ligadas={ligadasA}
            souDono={souDono}
            aoEscolher={(id) => escolher(id, true)}
            aoFechar={() => escolher(null)}
            aoMudar={recarregar}
          />
        )}
        {cerebro.cortadas > 0 && (
          <p className="pointer-events-none absolute bottom-2 left-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Mostrando as {totalDeNotas} notas mais recentes; {cerebro.cortadas} mais antigas estão na cópia.
          </p>
        )}
      </div>
    </div>
  );
}

function NotaAberta({
  projectId,
  nota,
  ligadas,
  souDono,
  aoEscolher,
  aoFechar,
  aoMudar,
}: {
  projectId: string;
  nota: NotaDoCerebro;
  ligadas: Array<{ nota: NotaDoCerebro; tipo: LigacaoDoCerebro["tipo"] }>;
  souDono: boolean;
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
  aoMudar: () => Promise<void>;
}) {
  const [corrigindo, setCorrigindo] = useState(false);
  const [texto, setTexto] = useState(nota.editavel ?? nota.texto);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehNota = nota.fonte !== "esfera" && nota.id !== "projeto";
  const acoes = ehNota ? acoesDaNota(nota.fonte) : { corrigir: null, apagar: null };
  const cor = nota.esfera ? COR_DA_ESFERA[nota.esfera] : "var(--text-muted)";
  const rotulo = nota.id === "projeto" ? "projeto" : nota.esfera ? ROTULO_DA_ESFERA[nota.esfera] : "nota";
  const conexoes = ligadas.filter((l) => l.tipo !== "esfera");
  const daEsfera = ligadas.filter((l) => l.tipo === "esfera" && l.nota.id !== "projeto" && !l.nota.id.startsWith("esfera:"));

  const pedir = async (metodo: "PATCH" | "DELETE", url: string, corpo: unknown) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error || "Não consegui agora. Tente de novo.");
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui agora.");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    if (await pedir("PATCH", `/api/projects/${projectId}/cerebro/notas`, { nota: nota.id, texto })) {
      setCorrigindo(false);
      await aoMudar();
    }
  };
  const apagar = async () => {
    const id = nota.id.slice(nota.id.indexOf(":") + 1);
    const ok =
      acoes.apagar === "material"
        ? await pedir("DELETE", `/api/projects/${projectId}/materiais/${id}`, {})
        : acoes.apagar === "contexto"
          ? await pedir("DELETE", `/api/projects/${projectId}/context`, { contextId: id })
          : await pedir("DELETE", `/api/projects/${projectId}/cerebro/notas`, { nota: nota.id });
    if (ok) {
      aoFechar();
      await aoMudar();
    }
  };

  return (
    <aside
      data-testid="nota-aberta"
      // No celular, folha de baixo com folga no fim para os botões rolarem acima
      // do "Falar com a Vera"; no computador, cartão no alto à direita, longe dele.
      className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-auto rounded-t-xl border-t p-4 pb-24 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-24px)] sm:w-[360px] sm:rounded-xl sm:border sm:pb-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      aria-label={`Nota: ${nota.titulo}`}
    >
      <button type="button" onClick={aoFechar} className="absolute right-2 top-2 rounded p-1.5 transition-colors hover:bg-black/5" aria-label="Fechar a nota">
        <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </button>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
        <i className="h-2 w-2 rounded-full" style={{ background: cor }} />
        {rotulo}
      </span>
      <h3 className="mb-1 mr-7 mt-1 text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
        {nota.titulo}
      </h3>
      <p className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
        {[nota.quando ? dataCurta(nota.quando) : "", conexoes.length ? `${conexoes.length} ${conexoes.length === 1 ? "ligação" : "ligações"}` : ""].filter(Boolean).join(" · ")}
      </p>
      {(nota.duradoura || nota.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {nota.duradoura && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-orange-500" style={{ background: "color-mix(in srgb, var(--color-orange-500, #f08a3c) 14%, transparent)" }}>
              vale para as próximas peças
            </span>
          )}
          {nota.tags.slice(0, 8).map((t) => (
            <span key={t} className="rounded-full px-2 py-0.5 font-mono text-[11px]" style={{ background: "color-mix(in srgb, var(--text-muted) 14%, transparent)", color: "var(--text-muted)" }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {corrigindo ? (
        <div className="mt-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            className="w-full rounded-md border p-2 text-sm"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            aria-label="Texto corrigido da nota"
          />
          {nota.fonte === "regra" && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Corrigir a regra também a aprova: ela passa a valer com o texto novo.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={ocupado} onClick={salvar} className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {ocupado ? "Salvando..." : "Salvar correção"}
            </button>
            <button type="button" onClick={() => setCorrigindo(false)} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        nota.texto && (
          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {nota.texto}
          </p>
        )
      )}

      {conexoes.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Ligações ({conexoes.length})
          </h4>
          <ListaDeNotas itens={conexoes.map((c) => c.nota)} aoEscolher={aoEscolher} />
        </>
      )}
      {(nota.fonte === "esfera" || nota.id === "projeto") && daEsfera.length > 0 && (
        <>
          <h4 className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Notas ({daEsfera.length})
          </h4>
          <ListaDeNotas itens={daEsfera.map((c) => c.nota)} aoEscolher={aoEscolher} />
        </>
      )}
      {nota.id === "projeto" && (
        <>
          <h4 className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Esferas
          </h4>
          <ListaDeNotas itens={ligadas.map((l) => l.nota)} aoEscolher={aoEscolher} />
        </>
      )}

      {ehNota && !corrigindo && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {nota.link && (
            <Link href={nota.link} className="text-xs font-medium text-orange-500 underline-offset-2 hover:underline">
              Abrir {ondeMora(nota.link)}
            </Link>
          )}
          {souDono && acoes.corrigir === "aqui" && (
            <button type="button" onClick={() => setCorrigindo(true)} className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--text-primary)" }}>
              Corrigir
            </button>
          )}
          {souDono && acoes.corrigir === "tela" && nota.link && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Corrige-se {ondeMora(nota.link)}.
            </span>
          )}
          {souDono && acoes.apagar && acoes.apagar !== "tela" && !confirmar && (
            <button type="button" onClick={() => setConfirmar(true)} className="text-xs font-medium text-red-500 underline-offset-2 hover:underline">
              Apagar
            </button>
          )}
          {!souDono && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Só o dono da conta corrige ou apaga a memória.
            </span>
          )}
        </div>
      )}
      {confirmar && (
        <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: "rgb(239 68 68 / 0.45)" }}>
          <p className="text-xs" style={{ color: "var(--text-primary)" }}>
            Apagar de vez? {AVISO_DE_APAGAR[nota.fonte] ?? "A nota sai da memória."} Não dá para desfazer.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={ocupado} onClick={apagar} className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {ocupado ? "Apagando..." : "Apagar"}
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="rounded-md border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              Manter
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {erro}
        </p>
      )}
    </aside>
  );
}

function ListaDeNotas({ itens, aoEscolher }: { itens: NotaDoCerebro[]; aoEscolher: (id: string) => void }) {
  return (
    <ul className="grid min-w-0 grid-cols-1 gap-px">
      {itens.slice(0, 30).map((m) => (
        <li key={m.id} className="min-w-0">
          <button type="button" onClick={() => aoEscolher(m.id)} className="flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-black/5">
            <i className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: m.esfera ? COR_DA_ESFERA[m.esfera] : "var(--text-muted)" }} />
            <span className="min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
              {m.titulo}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
