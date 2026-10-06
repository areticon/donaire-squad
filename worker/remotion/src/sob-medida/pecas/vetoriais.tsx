import React from "react";
import { escuroDoTema, estiloDoTitulo, limitar, lista, luz, misturar, progressoDoItem, rgba, saiSuave, texto, type Ctx } from "../base";
import { brilho, itemAceso, molaFisica, sombraFunda } from "../kit";
import { ICONES } from "../icones";
import { ICONES_DE_LINHA } from "../icones-de-linha";

/**
 * AS PEÇAS VETORIAIS (06/10/2026, tarefa D). O Bruno esperava "elementos de
 * alta resolução": ícone grande de linha num cartão, a comparação "não diga /
 * diga", os cartões lado a lado com o nome e o ícone, o título na caixa branca
 * no topo e a tela de um editor de vídeo trabalhando quando a fala é sobre
 * edição, automação ou plataforma. Tudo desenhado em código (SVG e CSS), nítido
 * em 1080x1920, com a entrada curta.
 *
 *   icone-com-frase         cartão escuro: rótulo pequeno (REGRA 01), o ícone de linha grande e a frase em caixa alta
 *   comparacao-lado-a-lado  "não diga" e "diga em vez disso": os pares entram um a um, quando ditos
 *   cartoes-em-linha        2 a 4 cartões claros lado a lado, cada um com o nome e o ícone
 *   interface-de-edicao     a tela de um editor: a linha do tempo com os clipes, o cursor andando, o corte, a legenda
 *   titulo-em-caixa         o título numa caixa clara arredondada no topo do quadro
 *
 * A posição: o resolvedor mede a CAIXA (props.caixa, fração do quadro) na área
 * livre do trecho, abaixo ou acima do rosto, nunca sobre ele
 * (lib/media/editor-por-comando/resolver.ts). Sem a caixa, a reserva fica longe
 * do meio do quadro (abaixo do peito no 9:16, no topo para o título).
 *
 * A aparência: só o TEMA (o acento e a cor da marca, o escuro, o claro, a fonte
 * do título). O acabamento da linguagem (papel, vidro, bloco, luxo, neon) muda
 * o raio, a sombra e o brilho; nenhum nome de estilo decide o que entra.
 */

type Caixa = { x: number; y: number; w: number; h: number };

function caixaEmPx(c: Ctx, reserva: Caixa): Caixa {
  const cx = c.props.caixa as Partial<Caixa> | undefined;
  const ok = cx && typeof cx === "object" && [cx.x, cx.y, cx.w, cx.h].every((v) => typeof v === "number" && Number.isFinite(v)) && cx.w! > 0.05 && cx.h! > 0.03;
  const f = ok ? (cx as Caixa) : reserva;
  return { x: Math.round(f.x * c.W), y: Math.round(f.y * c.H), w: Math.round(f.w * c.W), h: Math.round(f.h * c.H) };
}

/** O acabamento da linguagem, lido do tema. */
function acabamento(c: Ctx) {
  const { tema, u } = c;
  const luxo = tema.acabamento === "luxo" && !tema.corPedida;
  const papel = tema.visual === "documental";
  const impacto = tema.visual === "impacto";
  const neon = tema.linguagem === "neon";
  const acento = luxo ? "#C9A24A" : tema.acento;
  // O acento que lê sobre o escuro (marca de cor funda vira mais clara só no traço, nunca na identidade).
  const acentoNoEscuro = luz(acento) >= 0.45 ? acento : misturar(acento, "#ffffff", (0.45 - luz(acento)) / (1 - luz(acento)));
  const escuro = papel ? "#1f1c18" : misturar(escuroDoTema(tema), "#000000", 0.25);
  const claro = papel ? "#fbf6ea" : misturar(tema.claro, "#ffffff", 0.82);
  const raio = (papel ? 6 : impacto ? 18 : luxo ? 10 : 34) * u;
  const sombra = neon ? `${sombraFunda(u, 0.9)}, ${brilho(acento, u, 0.6)}` : sombraFunda(u, papel ? 0.8 : 1.1);
  return { luxo, papel, impacto, neon, acento, acentoNoEscuro, escuro, claro, raio, sombra, tintaClara: "#f5f7fb", tintaEscura: papel ? "#1b1a17" : "#111318" };
}

/** O desenho do ícone (catálogo antigo e o de linha); nome desconhecido devolve null (a peça segue sem ele). */
function nosDoIcone(nome: string) {
  const n = String(nome ?? "").trim().toLowerCase();
  return ICONES_DE_LINHA[n] ?? ICONES[n] ?? null;
}

/**
 * O ÍCONE DE LINHA que se DESENHA: cada traço corre do começo ao fim
 * (stroke-dasharray com pathLength 1), um depois do outro, e o brilho da marca
 * acende quando ele fecha.
 */
function IconeDesenhado({ nome, tam, cor, progresso, traco = 1.6, brilhoCor }: { nome: string; tam: number; cor: string; progresso: number; traco?: number; brilhoCor?: string }) {
  const nos = nosDoIcone(nome);
  if (!nos) return null;
  const n = nos.length;
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible", filter: brilhoCor ? `drop-shadow(0 0 ${tam * 0.05}px ${rgba(brilhoCor, 0.55 * progresso)})` : undefined }}>
      {nos.map(([tag, at], i) => {
        const p = limitar(progresso * (n + 1) - i * 0.9);
        const solido = (at as Record<string, string>).fill === "currentColor";
        return React.createElement(tag, { key: i, ...at, ...(solido ? { fill: cor, opacity: p } : { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - saiSuave(p) }) });
      })}
    </svg>
  );
}

/** A entrada do cartão: mola curta, sem ficar quicando. */
function entradaDoCartao(c: Ctx, atraso = 0, dy = 40) {
  const e = molaFisica(c.t - atraso, 190, 18);
  return { opacity: limitar((c.t - atraso) / 0.12) * c.fica, transform: `translateY(${((1 - e) * dy + (1 - c.fica) * 12) * c.u}px) scale(${(0.92 + 0.08 * e).toFixed(4)})` };
}

const semAsteriscos = (s: string) => s.replace(/\*\*/g, "");

/** As palavras do texto, com o trecho entre **asteriscos** marcado (a cor chapada da marca, sem brilho: lê no claro). */
function palavrasComDestaque(s: string): Array<{ palavra: string; destaque: boolean }> {
  return String(s ?? "")
    .split(/\*\*(.+?)\*\*/g)
    .flatMap((trecho, i) => trecho.split(/\s+/).filter(Boolean).map((palavra) => ({ palavra, destaque: i % 2 === 1 })));
}

// ─────────────────────────────── 1. ícone com frase ───────────────────────────────

/** ÍCONE COM FRASE: o cartão escuro, o rótulo pequeno, o ícone de linha que se desenha e a frase em caixa alta. */
export function IconeComFrase(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const frase = texto(p.frase ?? p.texto);
  const rotulo = semAsteriscos(texto(p.rotulo)).toUpperCase();
  const nome = texto(p.icone);
  if (!frase) return null;
  const caixa = caixaEmPx(c, vertical ? { x: 0.2, y: 0.54, w: 0.6, h: 0.3 } : { x: 0.62, y: 0.2, w: 0.3, h: 0.55 });
  // O cartão é quadrado (como a referência), no tamanho que cabe na caixa.
  const lado = Math.min(caixa.w, caixa.h * 1.05);
  const x = caixa.x + (caixa.w - lado) / 2;
  const temIcone = Boolean(nosDoIcone(nome));
  const limpa = semAsteriscos(frase);
  const tamFrase = Math.min(44, Math.max(22, ((lado / u - 60) / Math.max(8, Math.min(limpa.length, 22))) * 1.75));
  const fundo = a.papel
    ? `linear-gradient(180deg, #2a2621, #1a1714)`
    : `radial-gradient(ellipse at 50% 38%, ${rgba(a.acento, a.neon ? 0.32 : 0.2)}, transparent 62%), linear-gradient(180deg, ${misturar(a.escuro, "#ffffff", 0.06)}, ${a.escuro})`;
  return (
    <div style={{ position: "absolute", left: x, top: caixa.y, width: lado, height: lado, ...entradaDoCartao(c), transformOrigin: "50% 60%" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: a.raio, background: fundo, border: a.luxo ? `${1.5 * u}px solid ${rgba(a.acento, 0.7)}` : `${1.2 * u}px solid rgba(255,255,255,.08)`, boxShadow: a.sombra, overflow: "hidden" }}>
        {a.impacto ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 6 * u, background: a.acento }} /> : null}
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: `${lado * 0.07}px ${lado * 0.08}px ${lado * 0.08}px` }}>
        <div style={{ height: 24 * u, fontFamily: c.tema.fonteMono, fontWeight: 500, fontSize: 17 * u, letterSpacing: "0.32em", color: a.acentoNoEscuro, opacity: saiSuave((c.t - 0.15) / 0.3) }}>{rotulo}</div>
        {temIcone ? (
          <div style={{ transform: `scale(${(0.86 + 0.14 * molaFisica(c.t - 0.12, 200, 14)).toFixed(4)})` }}>
            <IconeDesenhado nome={nome} tam={lado * 0.36} cor={a.tintaClara} progresso={limitar((c.t - 0.12) / 0.75)} traco={1.5} brilhoCor={a.acentoNoEscuro} />
          </div>
        ) : (
          <div style={{ width: lado * 0.18, height: 5 * u, borderRadius: 3 * u, background: a.acentoNoEscuro, transform: `scaleX(${saiSuave((c.t - 0.2) / 0.4)})` }} />
        )}
        <div style={{ ...estiloDoTitulo(c, tamFrase), textTransform: "uppercase", letterSpacing: "0.02em", textAlign: "center", color: a.tintaClara, maxWidth: "100%" }}>
          {palavrasComDestaque(frase).map((w, i) => {
            const q = saiSuave((c.t - 0.35 - i * 0.05) / 0.3);
            return (
              <React.Fragment key={i}>
                <span style={{ display: "inline-block", color: w.destaque ? a.acentoNoEscuro : a.tintaClara, opacity: q, transform: `translateY(${(1 - q) * 12 * u}px)` }}>{w.palavra}</span>{" "}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── 2. comparação lado a lado ───────────────────────────────

/** COMPARAÇÃO LADO A LADO: "não diga" (vermelho de alerta) e "diga" (a cor da marca); cada par acende quando é dito. */
export function ComparacaoLadoALado(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const pares = lista<{ nao?: unknown; sim?: unknown }>(p.pares)
    .map((x) => ({ nao: semAsteriscos(texto(x?.nao)), sim: semAsteriscos(texto(x?.sim)) }))
    .filter((x) => x.nao || x.sim)
    .slice(0, 4);
  if (!pares.length) return null;
  const caixa = caixaEmPx(c, vertical ? { x: 0.08, y: 0.56, w: 0.84, h: 0.3 } : { x: 0.54, y: 0.2, w: 0.42, h: 0.56 });
  const rotNao = semAsteriscos(texto(p.rotuloNao, "Não diga"));
  const rotSim = semAsteriscos(texto(p.rotuloSim, "Diga"));
  const vermelho = "#ef3b3b";
  const sim = a.acentoNoEscuro;
  const gap = caixa.w * 0.06;
  const col = (caixa.w - gap) / 2;
  const cab = 64 * u;
  const linha = Math.min(96 * u, (caixa.h - cab) / pares.length);
  const barra = linha * 0.84;
  const tamItem = (txt: string) => Math.min(34, Math.max(18, ((col / u - 36) / Math.max(6, txt.length)) * 1.85));
  const cabecalho = (rot: string, cor: string, atraso: number) => {
    const e = saiSuave((c.t - atraso) / 0.35);
    const [primeira, ...resto] = rot.split(/\s+/);
    return (
      <div style={{ height: cab, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.28em", ...estiloDoTitulo(c, 38), textTransform: "none", color: "#ffffff", textShadow: `0 ${2 * u}px ${12 * u}px rgba(0,0,0,.65)`, opacity: e * c.fica, transform: `translateY(${(1 - e) * 16 * u}px)` }}>
        <span style={{ color: cor }}>{primeira}</span>
        {resto.length ? <span>{resto.join(" ")}</span> : null}
      </div>
    );
  };
  const item = (txt: string, cor: string, q: number, riscado: boolean, k: number, lado: number) => {
    const { e, pulso } = itemAceso(q);
    const tinta = luz(cor) > 0.6 ? "#0d1014" : "#ffffff";
    return (
      <div key={`${lado}-${k}`} style={{ height: linha, display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative", width: "100%", height: barra, borderRadius: (a.papel ? 2 : a.impacto ? 6 : 12) * u, background: cor, boxShadow: `0 ${6 * u}px ${18 * u}px ${rgba("#000000", 0.35)}, 0 0 ${(6 + 22 * pulso) * u}px ${rgba(cor, 0.55)}`, opacity: limitar(q * 2.5) * c.fica, transform: `scaleX(${(0.2 + 0.8 * e).toFixed(4)})`, transformOrigin: lado === 0 ? "right center" : "left center", display: "flex", alignItems: "center", justifyContent: "center", padding: `0 ${14 * u}px` }}>
          <span style={{ ...estiloDoTitulo(c, tamItem(txt)), textTransform: "uppercase", letterSpacing: "0.01em", color: tinta, whiteSpace: "nowrap", opacity: limitar((q - 0.25) / 0.4) }}>{txt}</span>
          {riscado && txt ? <div style={{ position: "absolute", left: "12%", right: "12%", top: "50%", height: 3 * u, background: rgba(tinta, 0.85), transform: `scaleX(${saiSuave((q - 0.55) / 0.35)})`, transformOrigin: "left" }} /> : null}
        </div>
      </div>
    );
  };
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, display: "flex", gap }}>
      <div style={{ width: col }}>
        {cabecalho(rotNao, vermelho, 0.05)}
        {pares.map((x, k) => item(x.nao, vermelho, progressoDoItem(c, k, 0.35), true, k, 0))}
      </div>
      <div style={{ width: col }}>
        {cabecalho(rotSim, sim, 0.2)}
        {pares.map((x, k) => item(x.sim, sim, limitar(progressoDoItem(c, k, 0.35) * 1.15 - 0.15), false, k, 1))}
      </div>
    </div>
  );
}

// ─────────────────────────────── 3. cartões em linha ───────────────────────────────

/** CARTÕES EM LINHA: 2 a 4 cartões claros lado a lado, o nome em cima e o ícone de linha na cor da marca. */
export function CartoesEmLinha(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const itens = lista<{ titulo?: unknown; icone?: unknown }>(p.itens)
    .map((x) => ({ titulo: semAsteriscos(texto(x?.titulo)), icone: texto(x?.icone) }))
    .filter((x) => x.titulo)
    .slice(0, 4);
  if (itens.length < 2) return null;
  const caixa = caixaEmPx(c, vertical ? { x: 0.06, y: 0.58, w: 0.88, h: 0.16 } : { x: 0.5, y: 0.25, w: 0.46, h: 0.3 });
  const gap = caixa.w * 0.035;
  const larg = (caixa.w - gap * (itens.length - 1)) / itens.length;
  const alt = Math.min(caixa.h, larg * 1.02);
  const corDoIcone = luz(a.acento) > 0.72 ? misturar(a.acento, "#000000", 0.45) : a.acento;
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, height: alt, display: "flex", gap }}>
      {itens.map((it, k) => {
        const q = progressoDoItem(c, k, 0.14);
        const e = molaFisica(Math.max(0, q) * 0.9, 200, 15);
        const tam = Math.min(26, Math.max(14, ((larg / u - 24) / Math.max(5, it.titulo.length)) * 1.75));
        return (
          <div key={k} style={{ width: larg, height: alt, borderRadius: (a.papel ? 4 : a.impacto ? 12 : 18) * u, background: a.claro, border: a.luxo ? `${1.5 * u}px solid ${rgba(a.acento, 0.8)}` : undefined, boxShadow: a.neon ? `${sombraFunda(u, 0.8)}, ${brilho(a.acento, u, 0.5)}` : sombraFunda(u, 0.8), opacity: limitar(q * 3) * c.fica, transform: `translateY(${(1 - e) * 46 * u}px) scale(${(0.9 + 0.1 * e).toFixed(4)})`, display: "flex", flexDirection: "column", alignItems: "center", padding: `${alt * 0.1}px ${8 * u}px ${alt * 0.08}px`, gap: alt * 0.06 }}>
            <div style={{ ...estiloDoTitulo(c, tam), fontFamily: c.tema.fonteTitulo, textTransform: "uppercase", letterSpacing: "0.02em", color: a.tintaEscura, textAlign: "center", whiteSpace: "nowrap" }}>{it.titulo}</div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {nosDoIcone(it.icone) ? <IconeDesenhado nome={it.icone} tam={Math.min(larg * 0.5, alt * 0.52)} cor={corDoIcone} progresso={limitar(q * 1.2 - 0.15)} traco={1.7} /> : <div style={{ width: larg * 0.3, height: 5 * u, borderRadius: 3 * u, background: corDoIcone }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────── 4. interface de edição ───────────────────────────────

/**
 * INTERFACE DE EDIÇÃO: a janela de um editor de vídeo, em código. Em cima a
 * prévia (a silhueta de quem fala, a legenda aparecendo palavra por palavra);
 * embaixo a linha do tempo com a trilha de vídeo, a de legenda e a do áudio;
 * o cursor anda o tempo todo, a tesoura corta um clipe no meio da peça e o
 * pedaço sai, e as etapas ditas (props.etapas) acendem como chips. A cor da
 * marca vai nos clipes, no cursor e nos chips; o resto é a interface escura.
 */
export function InterfaceDeEdicao(c: Ctx) {
  const { props: p, u, vertical, t, dur } = c;
  const a = acabamento(c);
  const caixa = caixaEmPx(c, vertical ? { x: 0.06, y: 0.55, w: 0.88, h: 0.32 } : { x: 0.5, y: 0.14, w: 0.46, h: 0.62 });
  const titulo = semAsteriscos(texto(p.titulo, "projeto"));
  const legenda = semAsteriscos(texto(p.legenda, ""));
  const etapas = lista<unknown>(p.etapas).map((x) => semAsteriscos(texto(typeof x === "object" && x ? (x as { texto?: unknown }).texto : x))).filter(Boolean).slice(0, 3);
  const W = caixa.w;
  const H = Math.min(caixa.h, W * (vertical ? 0.78 : 0.72));
  const r = (a.papel ? 6 : a.impacto ? 14 : 22) * u;
  const ui = a.papel ? "#24211d" : misturar(escuroDoTema(c.tema), "#000000", 0.4);
  const painel = misturar(ui, "#ffffff", 0.06);
  const linhaFina = rgba("#ffffff", 0.08);
  const ac = a.acentoNoEscuro;
  const acEscuro = misturar(ac, "#000000", 0.35);
  // As medidas: barra do topo, prévia, régua, três trilhas.
  const topo = 34 * u;
  const previaH = (H - topo) * 0.5;
  const tlY = topo + previaH;
  const tlH = H - tlY;
  const trilhaH = (tlH - 30 * u) / 3.3;
  const pad = 14 * u;
  const largTl = W - pad * 2 - 46 * u;
  // O tempo: o cursor varre a linha do tempo (com volta), o corte acontece a 42% da peça.
  const ciclo = Math.max(2.4, dur * 0.9);
  const cursor = ((t / ciclo) % 1);
  const tCorte = Math.max(0.9, dur * 0.42);
  const corte = saiSuave((t - tCorte) / 0.35);
  const fecha = saiSuave((t - tCorte - 0.4) / 0.45);
  // Os clipes da trilha de vídeo (fração da largura). O terceiro é cortado e o pedaço do meio sai.
  const clipes = [
    { x: 0, w: 0.22 },
    { x: 0.235, w: 0.18 },
    { x: 0.43, w: 0.3, cortado: true },
    { x: 0.745, w: 0.255 },
  ];
  const sai = 0.1 * fecha;
  const palavras = legenda.split(/\s+/).filter(Boolean);
  const nPal = Math.min(palavras.length, Math.floor(limitar((t - 0.5) / Math.max(1, dur * 0.6)) * (palavras.length + 0.99)));
  const onda = (i: number) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.37 + 1));
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: W, height: H, ...entradaDoCartao(c, 0, 50) }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: r, background: ui, border: `${1.2 * u}px solid ${a.luxo ? rgba(a.acento, 0.6) : "rgba(255,255,255,.1)"}`, boxShadow: a.sombra, overflow: "hidden" }}>
        {/* a barra do topo */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: topo, background: painel, borderBottom: `${1 * u}px solid ${linhaFina}`, display: "flex", alignItems: "center", gap: 7 * u, padding: `0 ${pad}px` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((cor) => (
            <i key={cor} style={{ width: 10 * u, height: 10 * u, borderRadius: "50%", background: cor, display: "inline-block", opacity: 0.85 }} />
          ))}
          <span style={{ marginLeft: 10 * u, fontFamily: c.tema.fonteMono, fontSize: 14 * u, color: rgba("#ffffff", 0.6), whiteSpace: "nowrap", overflow: "hidden" }}>{titulo}</span>
          <span style={{ marginLeft: "auto", fontFamily: c.tema.fonteMono, fontSize: 13 * u, color: ac }}>● REC</span>
        </div>
        {/* a prévia: a silhueta de quem fala e a legenda */}
        <div style={{ position: "absolute", left: pad, right: pad, top: topo + 10 * u, height: previaH - 20 * u, borderRadius: 10 * u, overflow: "hidden", background: `radial-gradient(ellipse at 50% 30%, ${misturar(ui, ac, 0.18)}, ${misturar(ui, "#000000", 0.3)})` }}>
          <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMax meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <circle cx="50" cy="25" r="10" fill={rgba("#ffffff", 0.16)} />
            <path d="M28 62 C30 44, 40 38, 50 38 C60 38, 70 44, 72 62 Z" fill={rgba("#ffffff", 0.12)} />
          </svg>
          {/* os cantos de enquadramento */}
          {[0, 1, 2, 3].map((k) => (
            <div key={k} style={{ position: "absolute", width: 16 * u, height: 16 * u, [k < 2 ? "top" : "bottom"]: 8 * u, [k % 2 ? "right" : "left"]: 8 * u, borderColor: rgba("#ffffff", 0.35), borderStyle: "solid", borderWidth: 0, [k < 2 ? "borderTopWidth" : "borderBottomWidth"]: 2 * u, [k % 2 ? "borderRightWidth" : "borderLeftWidth"]: 2 * u } as React.CSSProperties} />
          ))}
          {palavras.length ? (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 12 * u, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: `0 ${0.28}em`, padding: `0 ${10 * u}px`, ...estiloDoTitulo(c, vertical ? 24 : 22), textTransform: "uppercase", color: "#ffffff", textShadow: `0 ${2 * u}px ${6 * u}px rgba(0,0,0,.8)` }}>
              {palavras.slice(0, Math.max(0, nPal)).map((w, i) => (
                <span key={i} style={{ color: i === nPal - 1 ? ac : "#ffffff" }}>{w}</span>
              ))}
            </div>
          ) : null}
          {etapas.length ? (
            <div style={{ position: "absolute", top: 8 * u, right: 8 * u, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 * u }}>
              {etapas.map((et, k) => {
                const q = progressoDoItem(c, k, 0.5);
                return (
                  <div key={k} style={{ fontFamily: c.tema.fonteMono, fontSize: 13 * u, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: luz(ac) > 0.6 ? "#0d1014" : "#ffffff", background: ac, padding: `${4 * u}px ${10 * u}px`, borderRadius: 999, opacity: limitar(q * 2) * c.fica, transform: `translateX(${(1 - saiSuave(q)) * 20 * u}px)`, boxShadow: `0 0 ${12 * u}px ${rgba(ac, 0.5)}` }}>
                    ✓ {et}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {/* a linha do tempo */}
        <div style={{ position: "absolute", left: 0, right: 0, top: tlY, bottom: 0, background: painel, borderTop: `${1 * u}px solid ${linhaFina}` }}>
          {/* a régua */}
          <div style={{ position: "absolute", left: pad + 46 * u, width: largTl, top: 6 * u, height: 16 * u }}>
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} style={{ position: "absolute", left: `${i * 5}%`, bottom: 0, width: 1 * u, height: (i % 5 === 0 ? 10 : 5) * u, background: rgba("#ffffff", 0.3) }} />
            ))}
          </div>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ position: "absolute", left: pad, top: 28 * u + k * (trilhaH + 5 * u), width: 38 * u, height: trilhaH, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 * u, background: rgba("#ffffff", 0.05) }}>
              <svg width={18 * u} height={18 * u} viewBox="0 0 24 24" fill="none" stroke={rgba("#ffffff", 0.55)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {k === 0 ? <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5" /></> : k === 1 ? <><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></> : <><path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" /></>}
              </svg>
            </div>
          ))}
          <div style={{ position: "absolute", left: pad + 46 * u, width: largTl, top: 28 * u, height: 3 * trilhaH + 10 * u }}>
            {/* trilha de vídeo */}
            {clipes.map((cl, i) => {
              const x = cl.x - (cl.x > 0.5 ? sai : 0);
              if (!cl.cortado) {
                return (
                  <div key={i} style={{ position: "absolute", left: `${x * 100}%`, width: `${cl.w * 100}%`, top: 0, height: trilhaH, borderRadius: 6 * u, background: `linear-gradient(180deg, ${ac}, ${acEscuro})`, border: `${1 * u}px solid ${rgba("#ffffff", 0.25)}`, overflow: "hidden" }}>
                    {[0.15, 0.5, 0.85].map((f) => (
                      <div key={f} style={{ position: "absolute", left: `${f * 100}%`, top: "22%", width: trilhaH * 0.7, height: "56%", marginLeft: -trilhaH * 0.35, borderRadius: 3 * u, background: rgba("#000000", 0.18) }} />
                    ))}
                  </div>
                );
              }
              // O clipe cortado: a parte da esquerda fica, o meio (10%) sai, a direita fecha o buraco.
              const esq = cl.w * 0.45;
              const meio = 0.1;
              const dir = cl.w - esq - meio;
              const destaque = corte > 0 && fecha < 1;
              return (
                <React.Fragment key={i}>
                  <div style={{ position: "absolute", left: `${x * 100}%`, width: `${(corte > 0 ? esq : cl.w) * 100}%`, top: 0, height: trilhaH, borderRadius: 6 * u, background: `linear-gradient(180deg, ${ac}, ${acEscuro})`, border: `${1 * u}px solid ${rgba("#ffffff", 0.25)}` }} />
                  {corte > 0 ? (
                    <>
                      <div style={{ position: "absolute", left: `${(x + esq) * 100}%`, width: `${meio * 100}%`, top: 0, height: trilhaH, borderRadius: 6 * u, background: rgba("#ef3b3b", 0.85), border: `${1.5 * u}px dashed ${rgba("#ffffff", 0.7)}`, opacity: 1 - fecha, transform: `translateY(${-fecha * trilhaH * 0.9}px)` }} />
                      <div style={{ position: "absolute", left: `${(x + esq + meio - sai) * 100}%`, width: `${dir * 100}%`, top: 0, height: trilhaH, borderRadius: 6 * u, background: `linear-gradient(180deg, ${ac}, ${acEscuro})`, border: `${1 * u}px solid ${rgba("#ffffff", 0.25)}`, boxShadow: destaque ? `0 0 ${14 * u}px ${rgba(ac, 0.7)}` : undefined }} />
                    </>
                  ) : null}
                </React.Fragment>
              );
            })}
            {/* trilha de legenda: os blocos aparecem em sequência */}
            {Array.from({ length: 7 }, (_, i) => {
              const q = saiSuave((t - 0.3 - i * 0.22) / 0.3);
              return <div key={i} style={{ position: "absolute", left: `${(i * 0.14 + 0.005) * 100}%`, width: "12%", top: trilhaH + 5 * u + trilhaH * 0.18, height: trilhaH * 0.64, borderRadius: 4 * u, background: rgba("#ffffff", 0.82), opacity: q, transform: `scaleX(${q})`, transformOrigin: "left" }} />;
            })}
            {/* trilha do áudio: a onda */}
            <svg viewBox="0 0 200 20" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 2 * (trilhaH + 5 * u), width: "100%", height: trilhaH }}>
              {Array.from({ length: 100 }, (_, i) => {
                const h = onda(i) * 16;
                return <rect key={i} x={i * 2 + 0.4} y={10 - h / 2} width={1.1} height={h} fill={i / 100 < cursor ? ac : rgba("#ffffff", 0.35)} />;
              })}
            </svg>
            {/* o cursor */}
            <div style={{ position: "absolute", left: `${cursor * 100}%`, top: -18 * u, bottom: -4 * u, width: 2 * u, background: "#ffffff", boxShadow: `0 0 ${8 * u}px ${rgba(ac, 0.9)}` }}>
              <div style={{ position: "absolute", left: -7 * u, top: 0, width: 16 * u, height: 12 * u, background: "#ffffff", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
            </div>
            {/* a tesoura no corte */}
            {t > tCorte - 0.35 && fecha < 1 ? (
              <div style={{ position: "absolute", left: `${(0.43 + 0.3 * 0.45) * 100}%`, top: -trilhaH * 0.9, marginLeft: -14 * u, opacity: limitar((t - tCorte + 0.35) / 0.2) * (1 - fecha), transform: `scale(${(0.8 + 0.3 * Math.sin(limitar((t - tCorte + 0.2) / 0.4) * Math.PI)).toFixed(3)})` }}>
                <svg width={28 * u} height={28 * u} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 ${6 * u}px ${rgba(ac, 0.9)})` }}>
                  <circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" />
                </svg>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── 5. título em caixa ───────────────────────────────

/** TÍTULO EM CAIXA: a caixa clara arredondada no topo, com o título na fonte do projeto; o **destaque** na cor da marca. */
export function TituloEmCaixa(c: Ctx) {
  const { props: p, u, vertical } = c;
  const a = acabamento(c);
  const titulo = texto(p.texto ?? p.titulo);
  if (!titulo) return null;
  const caixa = caixaEmPx(c, vertical ? { x: 0.12, y: 0.1, w: 0.76, h: 0.11 } : { x: 0.25, y: 0.06, w: 0.5, h: 0.14 });
  const limpa = semAsteriscos(titulo);
  // Até duas linhas: a letra pela largura e pela altura.
  const porLinha = Math.max(8, Math.ceil(limpa.length / (limpa.length > 22 ? 2 : 1)));
  const tam = Math.min(vertical ? 54 : 50, Math.max(24, ((caixa.w / u - 50) / porLinha) * 1.85), (caixa.h / u / (limpa.length > 22 ? 2 : 1)) * 0.78);
  const e = molaFisica(c.t, 210, 17);
  const corDestaque = luz(a.acento) > 0.7 ? misturar(a.acento, "#000000", 0.4) : a.acento;
  return (
    <div style={{ position: "absolute", left: caixa.x, top: caixa.y, width: caixa.w, display: "flex", justifyContent: "center", opacity: limitar(c.t / 0.1) * c.fica, transform: `translateY(${((1 - e) * -24 + (1 - c.fica) * -10) * u}px) scale(${(0.9 + 0.1 * e).toFixed(4)})`, transformOrigin: "50% 0%" }}>
      <div style={{ maxWidth: "100%", background: a.claro, borderRadius: (a.papel ? 4 : a.impacto ? 12 : 20) * u, padding: `${12 * u}px ${26 * u}px ${14 * u}px`, boxShadow: a.neon ? `${sombraFunda(u, 0.7)}, ${brilho(a.acento, u, 0.5)}` : sombraFunda(u, 0.7), borderBottom: a.luxo || a.impacto ? `${5 * u}px solid ${a.acento}` : undefined }}>
        <div style={{ ...estiloDoTitulo(c, tam), color: a.tintaEscura, textAlign: "center" }}>
          {palavrasComDestaque(titulo).map((w, i) => {
            const q = saiSuave((c.t - 0.12 - i * 0.045) / 0.3);
            return (
              <React.Fragment key={i}>
                <span style={{ display: "inline-block", color: w.destaque ? corDestaque : a.tintaEscura, opacity: q, transform: `translateY(${(1 - q) * 14 * u}px)` }}>{w.palavra}</span>{" "}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

