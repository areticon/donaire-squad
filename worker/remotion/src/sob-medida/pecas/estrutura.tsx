import React from "react";
import { corDoTexto, corFraca, estiloDoApoio, estiloDoTitulo, Icone, limitar, lista, margens, misturar, progressoDoItem, rgba, saiSuave, sobreOAcento, texto, type Ctx } from "../base";
import { brilho, Cantoneiras, EtiquetaHud, molaFisica, Palco, Regua, TextoCinetico, Vidro, entradaMola } from "../kit";
import { semente, SeloVivo } from "./texto";

/**
 * AS PEÇAS DE ESTRUTURA (03/10, segunda volta): listas, passos, escada,
 * comparação e fluxo, no palco com câmera e no jeito do Dan Martell: o item
 * dito acende (nítido, com luz), os outros ficam desfocados e apagados.
 */

/** O título da peça de tela: o selo de HUD e o título palavra a palavra, no alto. */
function Cabeca({ c, titulo, rotulo }: { c: Ctx; titulo?: unknown; rotulo?: unknown }) {
  if (!titulo) return null;
  const { u, vertical } = c;
  const m = margens(c);
  return (
    <div style={{ position: "absolute", left: m.x, top: m.topo, maxWidth: m.largura }}>
      {rotulo ? <SeloVivo c={c} texto={texto(rotulo)} estilo={{ marginBottom: 14 * u }} atraso={0.25} /> : <EtiquetaHud c={c} texto={vertical ? "" : "· · ·"} estilo={{ marginBottom: 10 * u, opacity: saiSuave((c.t - 0.3) / 0.3) }} />}
      <div style={{ ...estiloDoTitulo(c, vertical ? 64 : 72), color: "#f4f7fb", textShadow: `0 ${4 * c.u}px ${24 * c.u}px rgba(0,0,0,.6)` }}>
        <TextoCinetico c={c} texto={texto(titulo)} estilo={{}} inicio={0.3} />
      </div>
    </div>
  );
}

function area(c: Ctx, comTitulo: boolean) {
  const m = margens(c);
  // No 9:16 o conteúdo desce para o meio da tela (o alto fica do título).
  const topo = c.vertical ? c.H * (comTitulo ? 0.36 : 0.24) : comTitulo ? m.topo + 210 * c.u : m.topo;
  return { x: m.x, topo, largura: m.largura, altura: m.base - topo };
}

/** O índice do último item aceso (o "atual"). */
function atualDe(prog: number[]): number {
  let a = -1;
  prog.forEach((q, k) => q > 0.05 && (a = k));
  return a;
}

/** O estilo de um item conforme o foco: o atual nítido e aceso, os vistos apagados, os futuros fantasmas. */
function foco(k: number, atual: number, q: number, u: number): React.CSSProperties {
  if (k === atual) return { opacity: limitar(q * 3), filter: "none" };
  if (q > 0.05) return { opacity: 0.55, filter: `blur(${2 * u}px) saturate(.6)` };
  return { opacity: 0.18, filter: `blur(${3 * u}px)` };
}

/** CARTÕES EM SEQUÊNCIA: em perspectiva, cada um chega da profundidade quando é dito; o atual acende. */
export function Cartoes(c: Ctx) {
  const { props: p, u, vertical, tema } = c;
  const itens = lista<{ titulo?: string; texto?: string; icone?: string }>(p.itens).slice(0, 5);
  const marca = texto(p.marca, "nenhuma");
  const a = area(c, Boolean(p.titulo));
  const n = Math.max(1, itens.length);
  const gap = 34 * u;
  const largCartao = vertical ? a.largura : Math.min(600 * u, (a.largura - gap * (n - 1)) / n);
  const topo = vertical ? a.topo + 10 * u : Math.max(a.topo + 40 * u, c.H * 0.4);
  // No 9:16 os cartões dividem a altura toda (prova de 03/10: dois cartões finos e dois terços de tela vazia).
  const altV = vertical ? Math.min(340 * u, (c.H * 0.86 - topo - 22 * u * (n - 1)) / n) : 0;
  const prog = itens.map((_, k) => progressoDoItem(c, k, 0.25));
  const atual = atualDe(prog);
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, top: topo, width: vertical ? a.largura : "auto", display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 22 * u : gap, perspective: 1800 * u }}>
        {itens.map((it, k) => {
          const q = prog[k];
          const s = molaFisica(q * 0.9, 160, 15);
          const ativo = k === atual;
          const giro = vertical ? 0 : (k - (n - 1) / 2) * -7;
          const sinal =
            marca === "x" ? "x" : marca === "check" ? "check" : marca === "numero" ? null : it.icone ?? null;
          return (
            <div key={k} style={{ width: largCartao, transform: `translateZ(${(1 - s) * -500 * u + (ativo ? 40 * u : 0)}px) translateY(${(1 - s) * 60 * u}px) rotateY(${giro}deg)`, opacity: limitar(q * 3), transition: "none" }}>
              <Vidro c={c} forte={false} estilo={{ ...(vertical ? { minHeight: altV, display: "flex", flexDirection: "column", justifyContent: "center" } : {}), padding: `${(vertical ? 24 : 34) * u}px ${34 * u}px`, border: `${1.5 * u}px solid ${ativo ? rgba(tema.acento, 0.85) : "rgba(255,255,255,.14)"}`, boxShadow: ativo ? `${brilho(tema.acento, u, 0.6)}, 0 ${30 * u}px ${70 * u}px rgba(0,0,0,.5)` : `0 ${20 * u}px ${50 * u}px rgba(0,0,0,.45)`, ...(atual > k ? { filter: `saturate(.55) brightness(.75)` } : {}) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 * u, marginBottom: it.texto ? 12 * u : 0 }}>
                  <span style={{ width: 56 * u, height: 56 * u, flex: "0 0 auto", borderRadius: 14 * u, display: "flex", alignItems: "center", justifyContent: "center", background: ativo ? tema.acento : rgba(tema.acento, 0.16), boxShadow: ativo ? brilho(tema.acento, u, 0.6) : "none", fontFamily: "Geist", fontWeight: 700, fontSize: 28 * u, color: ativo ? sobreOAcento(tema) : tema.acento }}>
                    {sinal ? <Icone nome={sinal} tam={30 * u} cor={ativo ? sobreOAcento(tema) : tema.acento} traco={2.6} /> : k + 1}
                  </span>
                  <span style={{ ...estiloDoTitulo(c, vertical ? 58 : n > 3 ? 38 : 46), color: corDoTexto(c) }}>{texto(it.titulo)}</span>
                </div>
                {it.texto ? <div style={{ ...estiloDoApoio(c, vertical ? 36 : n > 3 ? 26 : 30) }}>{texto(it.texto)}</div> : null}
              </Vidro>
            </div>
          );
        })}
      </div>
    </Palco>
  );
}

/**
 * LINHA DO TEMPO QUE A CÂMERA PERCORRE: a trilha é mais larga que a tela; a
 * linha de luz corre até o passo dito e a câmera anda junto, parando em cada
 * nó que acende. Em pé, a trilha desce e a câmera desce.
 */
export function LinhaDoTempo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const passos = lista<{ rotulo?: string; texto?: string; icone?: string }>(p.passos).slice(0, 6);
  const n = Math.max(1, passos.length);
  const a = area(c, Boolean(p.titulo));
  const prog = passos.map((_, k) => progressoDoItem(c, k, 0.45));
  const atual = atualDe(prog);
  // Onde a câmera está: entre o passo anterior e o atual, suave.
  let alvo = 0;
  prog.forEach((q, k) => {
    if (q > 0) alvo = Math.max(alvo, k - 1 + saiSuave(Math.min(1, q * 1.3)));
  });
  alvo = Math.max(0, alvo);
  const N = vertical ? 74 : 96;
  const passo = vertical ? 300 * u : 560 * u;
  const linhaP = n > 1 ? limitar(alvo / (n - 1)) : 1;
  const comp = passo * (n - 1);
  // A câmera: mantém o nó atual perto do centro (no 16:9) ou do terço de cima (no 9:16).
  const desloc = vertical ? Math.max(0, alvo * passo - a.altura * 0.25) : Math.max(0, Math.min(Math.max(0, comp - (c.W - 2 * a.x - 2 * N * u)), alvo * passo - c.W * 0.3));
  const x0 = a.x + N * u;
  const y0 = vertical ? a.topo + 40 * u : Math.max(a.topo + 170 * u, c.H * 0.5);
  const no = (k: number, q: number) => {
    const aceso = q > 0.02;
    const s = molaFisica(q * 0.8, 220, 14);
    const ativo = k === atual;
    return (
      <div style={{ position: "relative", width: N * u, height: N * u }}>
        {ativo ? <div style={{ position: "absolute", inset: -20 * u, borderRadius: "50%", border: `${2 * u}px solid ${rgba(tema.acento, 0.5 * (1 - ((c.t * 1.2) % 1)))}`, transform: `scale(${1 + ((c.t * 1.2) % 1) * 0.5})` }} /> : null}
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${aceso ? 0.6 + 0.4 * s : 0.75})`, background: aceso ? `radial-gradient(circle at 35% 30%, ${misturar(tema.acento, "#ffffff", 0.35)}, ${misturar(tema.acento, "#000000", 0.25)})` : "rgba(12,18,30,.9)", border: `${3 * u}px solid ${aceso ? "#ffffff" : "rgba(255,255,255,.22)"}`, boxShadow: aceso ? brilho(tema.acento, u, ativo ? 1.2 : 0.6) : "none", fontFamily: "Geist", fontWeight: 700, fontSize: N * 0.42 * u, color: aceso ? sobreOAcento(tema) : "rgba(255,255,255,.5)" }}>
          {passos[k].icone ? <Icone nome={passos[k].icone!} tam={N * 0.46 * u} cor={aceso ? sobreOAcento(tema) : "rgba(255,255,255,.5)"} traco={2.4} /> : k + 1}
        </div>
      </div>
    );
  };
  const trilha = (
    <div style={{ position: "absolute", left: 0, top: 0, transform: vertical ? `translateY(${-desloc}px)` : `translateX(${-desloc}px)` }}>
      {vertical ? (
        <>
          <div style={{ position: "absolute", left: x0 - 3 * u, top: y0 + (N / 2) * u, width: 6 * u, height: comp, background: "rgba(255,255,255,.14)", borderRadius: 3 * u }} />
          <div style={{ position: "absolute", left: x0 - 4 * u, top: y0 + (N / 2) * u, width: 8 * u, height: comp * linhaP, background: `linear-gradient(180deg, ${rgba(tema.acento, 0.5)}, ${tema.acento})`, borderRadius: 4 * u, boxShadow: brilho(tema.acento, u, 0.8) }} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: x0, top: y0 - 3 * u, width: comp, height: 6 * u, background: "rgba(255,255,255,.14)", borderRadius: 3 * u }} />
          <div style={{ position: "absolute", left: x0, top: y0 - 4 * u, width: comp * linhaP, height: 8 * u, background: `linear-gradient(90deg, ${rgba(tema.acento, 0.4)}, ${tema.acento})`, borderRadius: 4 * u, boxShadow: brilho(tema.acento, u, 0.8) }} />
          <div style={{ position: "absolute", left: x0 + comp * linhaP - 14 * u, top: y0 - 14 * u, width: 28 * u, height: 28 * u, borderRadius: "50%", background: "#ffffff", boxShadow: brilho(tema.acento, u, 1.4), opacity: linhaP > 0 && linhaP < 1 ? 1 : 0 }} />
          <div style={{ position: "absolute", left: x0, top: y0 + 150 * u, width: comp }}>
            <Regua c={c} comprimento={comp} marcas={(n - 1) * 10} progresso={saiSuave(c.t / 1)} />
          </div>
        </>
      )}
      {passos.map((ps, k) => {
        const q = prog[k];
        const e = saiSuave(q);
        const f = foco(k, atual, q, u);
        if (vertical) {
          return (
            <div key={k} style={{ position: "absolute", left: x0 - (N / 2) * u, top: y0 + k * passo, display: "flex", alignItems: "flex-start", gap: 26 * u }}>
              {no(k, q)}
              <div style={{ maxWidth: a.largura - 130 * u, ...f, transform: `translateX(${(1 - e) * 24 * u}px)` }}>
                <Vidro c={c} estilo={{ padding: `${14 * u}px ${24 * u}px` }}>
                  <div style={{ ...estiloDoTitulo(c, 44), color: corDoTexto(c) }}>{texto(ps.rotulo)}</div>
                  {ps.texto ? <div style={{ ...estiloDoApoio(c, 28), marginTop: 4 * u }}>{texto(ps.texto)}</div> : null}
                </Vidro>
              </div>
            </div>
          );
        }
        const x = x0 + passo * k;
        return (
          <React.Fragment key={k}>
            <div style={{ position: "absolute", left: x - (N / 2) * u, top: y0 - (N / 2) * u }}>{no(k, q)}</div>
            <div style={{ position: "absolute", left: x - 230 * u, top: y0 + 84 * u, width: 460 * u, textAlign: "center", ...f, transform: `translateY(${(1 - e) * 22 * u}px)` }}>
              <EtiquetaHud c={c} texto={`Passo ${String(k + 1).padStart(2, "0")}`} estilo={{ justifyContent: "center", fontSize: 16 * u, marginBottom: 8 * u }} />
              <div style={{ ...estiloDoTitulo(c, n > 4 ? 48 : 58), color: "#ffffff", textShadow: `0 2px 16px rgba(0,0,0,.7)${k === atual ? `, ${brilho(tema.acento, u, 0.4)}` : ""}` }}>{texto(ps.rotulo)}</div>
              {ps.texto ? <div style={{ ...estiloDoApoio(c, n > 4 ? 26 : 30), marginTop: 6 * u, color: "#c9d3df", textShadow: "0 2px 10px rgba(0,0,0,.7)" }}>{texto(ps.texto)}</div> : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: limitar((c.t - 0.2) * 4) }}>{trilha}</div>
    </Palco>
  );
}

/**
 * ESCADA EM 3D: blocos em projeção isométrica que sobem do chão um a um; o
 * degrau dito acende com a luz da marca e o rótulo flutua com a linha de mira.
 */
export function Escada(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const degraus = lista<{ rotulo?: string }>(p.degraus).slice(0, 6);
  const n = Math.max(1, degraus.length);
  const a = area(c, Boolean(p.titulo));
  const prog = degraus.map((_, k) => progressoDoItem(c, k, 0.35));
  const atual = atualDe(prog);
  const larg = vertical ? a.largura * 0.92 : Math.min(a.largura * 0.8, 1400 * u);
  const bw = larg / (n + 0.6);
  const prof = bw * 0.42; // a profundidade do bloco na projeção
  const alturaMax = vertical ? a.altura * 0.6 : (c.H - a.topo - 200 * u) * 0.78;
  const x0 = vertical ? a.x + 20 * u : (c.W - larg) / 2;
  const chao = vertical ? a.topo + a.altura * 0.9 : c.H - 170 * u;
  const blocos = degraus.map((d, k) => {
    const q = prog[k];
    const s = molaFisica(q * 0.85, 170, 14);
    const h = (alturaMax * (k + 1)) / n * Math.max(0, s);
    const x = x0 + k * bw;
    return { d, k, q, h, x, ativo: k === atual };
  });
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="esc-frente" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,.22)" />
            <stop offset="1" stopColor="rgba(255,255,255,.04)" />
          </linearGradient>
          <linearGradient id="esc-acesa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={misturar(tema.acento, "#ffffff", 0.25)} />
            <stop offset="1" stopColor={misturar(tema.acento, "#000000", 0.35)} />
          </linearGradient>
        </defs>
        {/* a sombra no chão */}
        <ellipse cx={x0 + larg / 2} cy={chao + 18 * u} rx={larg * 0.62} ry={40 * u} fill="rgba(0,0,0,.45)" style={{ filter: `blur(${14 * u}px)` }} />
        {blocos.map(({ k, h, x, ativo, q }) => {
          if (h < 1) return null;
          const top = chao - h;
          const frente = `M${x} ${top} L${x + bw} ${top} L${x + bw} ${chao} L${x} ${chao} Z`;
          const cima = `M${x} ${top} L${x + prof} ${top - prof * 0.55} L${x + bw + prof} ${top - prof * 0.55} L${x + bw} ${top} Z`;
          const lado = `M${x + bw} ${top} L${x + bw + prof} ${top - prof * 0.55} L${x + bw + prof} ${chao - prof * 0.55} L${x + bw} ${chao} Z`;
          const visto = q > 0.05 && !ativo;
          return (
            <g key={k} style={{ filter: ativo ? `drop-shadow(0 0 ${22 * u}px ${rgba(tema.acento, 0.7)})` : visto ? "saturate(.5)" : "none" }} opacity={ativo ? 1 : visto ? 0.7 : 0.5}>
              <path d={lado} fill={ativo ? misturar(tema.acento, "#000000", 0.45) : "rgba(255,255,255,.07)"} stroke="rgba(255,255,255,.18)" strokeWidth={1 * u} />
              <path d={frente} fill={ativo ? "url(#esc-acesa)" : "url(#esc-frente)"} stroke={ativo ? "#ffffff" : "rgba(255,255,255,.25)"} strokeWidth={1.5 * u} />
              <path d={cima} fill={ativo ? misturar(tema.acento, "#ffffff", 0.45) : "rgba(255,255,255,.2)"} stroke="rgba(255,255,255,.35)" strokeWidth={1 * u} />
              <text x={x + bw / 2} y={chao - 24 * u} textAnchor="middle" fontFamily="Geist" fontWeight={700} fontSize={Math.min(64, bw / u / 2.6) * u} fill={ativo ? sobreOAcento(tema) : "rgba(255,255,255,.55)"}>{k + 1}</text>
            </g>
          );
        })}
      </svg>
      {blocos.map(({ d, k, h, x, q, ativo }) => {
        if (q <= 0.05) return null;
        const e = saiSuave((q - 0.3) / 0.5);
        const top = chao - h - prof * 0.55;
        return (
          <div key={k} style={{ position: "absolute", left: x + bw / 2 + prof / 2 - 200 * u, width: 400 * u, top: top - (vertical ? 110 : 120) * u, textAlign: "center", opacity: e * (ativo ? 1 : 0.6), filter: ativo ? "none" : `blur(${1.2 * u}px)` }}>
            <div style={{ ...estiloDoTitulo(c, vertical ? 34 : n > 4 ? 34 : 42), color: "#ffffff", textShadow: `0 2px 14px rgba(0,0,0,.8)${ativo ? `, ${brilho(tema.acento, u, 0.4)}` : ""}` }}>{texto(d.rotulo)}</div>
            <div style={{ margin: `${8 * u}px auto 0`, width: 2 * u, height: 40 * u * e, background: `linear-gradient(180deg, ${tema.acento}, transparent)` }} />
          </div>
        );
      })}
    </Palco>
  );
}

/** LISTA COM CHECK: o vidro ao lado; o check se desenha quando o item é dito e o atual fica em foco. */
export function Checklist(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const itens = lista<{ texto?: string }>(p.itens).slice(0, 7);
  const m = margens(c);
  const larg = vertical ? m.largura : 900 * u;
  const direita = texto(p.lado) === "direita";
  const prog = itens.map((_, k) => progressoDoItem(c, k, 0.2));
  const atual = atualDe(prog);
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo : 120 * u, ...(direita ? { right: m.x } : { left: m.x }), width: larg, ...entradaMola(c, 0, 30) }}>
      <Vidro c={c} estilo={{ padding: `${36 * u}px ${42 * u}px` }}>
        {p.titulo ? (
          <div style={{ ...estiloDoTitulo(c, vertical ? 52 : 58), color: corDoTexto(c), marginBottom: 26 * u }}>
            <TextoCinetico c={c} texto={texto(p.titulo)} estilo={{}} inicio={0.15} />
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 * u }}>
          {itens.map((it, k) => {
            const q = prog[k];
            const marcado = saiSuave((q - 0.15) / 0.45);
            const ativo = k === atual;
            const f = foco(k, atual, q, u);
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 20 * u, ...f, transform: `translateX(${(1 - saiSuave(q)) * 14 * u}px) scale(${ativo ? 1.02 : 1})`, transformOrigin: "left center" }}>
                <svg width={48 * u} height={48 * u} viewBox="0 0 48 48" style={{ flex: "0 0 auto", overflow: "visible", filter: marcado > 0 ? `drop-shadow(0 0 ${8 * u}px ${rgba(tema.acento, 0.7)})` : "none" }}>
                  <rect x={2} y={2} width={44} height={44} rx={12} fill={rgba(tema.acento, 0.9 * marcado)} stroke={marcado > 0 ? tema.acento : "rgba(255,255,255,.35)"} strokeWidth={3} />
                  <path d="M13 25 L21 33 L36 16" fill="none" stroke={sobreOAcento(tema)} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={40} strokeDashoffset={40 * (1 - marcado)} />
                </svg>
                <span style={{ fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 38 : 40) * u, color: corDoTexto(c), lineHeight: 1.25 }}>{texto(it.texto)}</span>
              </div>
            );
          })}
        </div>
      </Vidro>
    </div>
  );
}

/** COMPARAÇÃO: no palco, o antes apagado e riscado contra o depois que acende quando é dito, separados pela linha de luz. */
export function Comparacao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const esq = (p.esquerda ?? {}) as { titulo?: string; itens?: string[] };
  const dir = (p.direita ?? {}) as { titulo?: string; itens?: string[] };
  const a = area(c, Boolean(p.titulo));
  const gap = 90 * u;
  const lw = vertical ? a.largura : (a.largura - gap) / 2;
  const qd = c.passos.length ? c.passos[0] : saiSuave((c.t - 0.6) / 0.5);
  const qe = saiSuave((c.t - 0.2) / 0.5);
  const lado = (lb: { titulo?: string; itens?: string[] }, bom: boolean, q: number) => {
    const s = molaFisica(q * 0.9, 170, 15);
    return (
      <div style={{ width: lw, opacity: limitar(q * 3), transform: `perspective(${1400 * u}px) translateY(${(1 - s) * 50 * u}px) rotateY(${(1 - s) * (bom ? -18 : 18)}deg) scale(${bom ? 1 + 0.03 * qd : 1 - 0.04 * qd})`, filter: !bom && qd > 0.3 ? `saturate(${1 - 0.6 * qd}) brightness(${1 - 0.25 * qd})` : "none" }}>
        <Vidro c={c} estilo={{ padding: `${32 * u}px ${36 * u}px`, border: `${2 * u}px solid ${bom ? rgba(tema.acento, 0.9) : "rgba(255,90,90,.35)"}`, boxShadow: bom ? `${brilho(tema.acento, u, 0.7)}, 0 ${30 * u}px ${70 * u}px rgba(0,0,0,.5)` : `0 ${20 * u}px ${50 * u}px rgba(0,0,0,.45)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 * u, marginBottom: 18 * u }}>
            <span style={{ width: 54 * u, height: 54 * u, borderRadius: 14 * u, display: "flex", alignItems: "center", justifyContent: "center", background: bom ? tema.acento : "rgba(255,80,80,.18)", boxShadow: bom ? brilho(tema.acento, u, 0.6) : "none" }}>
              <Icone nome={bom ? "check" : "x"} tam={32 * u} cor={bom ? sobreOAcento(tema) : "#ff8a8a"} traco={2.8} />
            </span>
            <span style={{ ...estiloDoTitulo(c, vertical ? 44 : 50), color: bom ? corDoTexto(c) : corFraca(c) }}>{texto(lb.titulo)}</span>
          </div>
          {(lb.itens ?? []).slice(0, 4).map((t, k) => {
            const qi = saiSuave((q - 0.2 - k * 0.12) / 0.4);
            const risco = bom ? 0 : saiSuave((qd - 0.1 - k * 0.1) / 0.4);
            return (
              <div key={k} style={{ position: "relative", ...estiloDoApoio(c, vertical ? 30 : 32), color: bom ? corDoTexto(c) : corFraca(c), marginTop: 10 * u, opacity: qi, transform: `translateX(${(1 - qi) * 12 * u}px)`, display: "table" }}>
                {t}
                {!bom ? <span style={{ position: "absolute", left: -4 * u, right: -4 * u, top: "55%", height: 3 * u, background: "rgba(255,110,110,.85)", transform: `scaleX(${risco})`, transformOrigin: "left" }} /> : null}
                <br />
              </div>
            );
          })}
        </Vidro>
      </div>
    );
  };
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, top: vertical ? a.topo : Math.max(a.topo + 20 * u, c.H * 0.32), display: "flex", flexDirection: vertical ? "column" : "row", gap, alignItems: "flex-start" }}>
        {lado(esq, false, qe)}
        {!vertical ? (
          <div style={{ position: "absolute", left: lw + gap / 2 - 1 * u, top: -40 * u, width: 2 * u, height: 560 * u, background: `linear-gradient(180deg, transparent, ${tema.acento}, transparent)`, boxShadow: brilho(tema.acento, u, 0.6), transform: `scaleY(${saiSuave((c.t - 0.3) / 0.6)})` }}>
            <div style={{ position: "absolute", left: -34 * u, top: 250 * u, width: 70 * u, height: 70 * u, borderRadius: "50%", background: "rgba(10,14,24,.9)", border: `${2 * u}px solid ${tema.acento}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: tema.fonteMono, fontSize: 22 * u, color: "#ffffff", boxShadow: brilho(tema.acento, u, 0.5) }}>VS</div>
          </div>
        ) : null}
        {lado(dir, true, qd)}
      </div>
    </Palco>
  );
}

/** FLUXO: os nós de vidro ligados por feixes de luz; uma faísca corre de um nó ao seguinte quando ele é dito. */
export function Fluxo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const nos = lista<{ rotulo?: string; icone?: string }>(p.nos).slice(0, 5);
  const n = Math.max(1, nos.length);
  const a = area(c, Boolean(p.titulo));
  const prog = nos.map((_, k) => progressoDoItem(c, k, 0.45));
  const atual = atualDe(prog);
  const tamNo = vertical ? 140 * u : Math.min(330 * u, (a.largura - (n - 1) * 120 * u) / n);
  const gapX = vertical ? 0 : (a.largura - n * tamNo) / Math.max(1, n - 1);
  const centro = (k: number) => (vertical ? { x: c.W / 2, y: a.topo + 90 * u + k * (a.altura / n) } : { x: a.x + tamNo / 2 + k * (tamNo + gapX), y: Math.max(a.topo + 220 * u, c.H * 0.52) });
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <svg width={c.W} height={c.H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {nos.map((_, k) => {
          if (k === 0) return null;
          const A = centro(k - 1);
          const B = centro(k);
          const raio = vertical ? 70 * u : tamNo / 2;
          const x1 = vertical ? A.x : A.x + raio;
          const y1 = vertical ? A.y + raio : A.y;
          const x2 = vertical ? B.x : B.x - raio;
          const y2 = vertical ? B.y - raio : B.y;
          const q = saiSuave(prog[k] * 1.5);
          const comp = Math.hypot(x2 - x1, y2 - y1);
          const fx = x1 + (x2 - x1) * q;
          const fy = y1 + (y2 - y1) * q;
          return (
            <g key={k}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.15)" strokeWidth={4 * u} strokeDasharray={`${8 * u} ${10 * u}`} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tema.acento} strokeWidth={5 * u} strokeLinecap="round" strokeDasharray={comp} strokeDashoffset={comp * (1 - q)} style={{ filter: `drop-shadow(0 0 ${8 * u}px ${tema.acento})` }} />
              {q > 0 && q < 1 ? <circle cx={fx} cy={fy} r={9 * u} fill="#ffffff" style={{ filter: `drop-shadow(0 0 ${12 * u}px ${tema.acento})` }} /> : null}
              {q >= 1 ? <circle cx={x1 + (x2 - x1) * ((c.t * 0.8) % 1)} cy={y1 + (y2 - y1) * ((c.t * 0.8) % 1)} r={4 * u} fill={misturar(tema.acento, "#ffffff", 0.5)} opacity={0.8} /> : null}
            </g>
          );
        })}
      </svg>
      {nos.map((no, k) => {
        const q = prog[k];
        const s = molaFisica(q * 0.85, 200, 14);
        const ativo = k === atual;
        const C = centro(k);
        const f = foco(k, atual, q, u);
        return (
          <div key={k} style={{ position: "absolute", left: C.x - (vertical ? a.largura * 0.4 : tamNo / 2), top: C.y - (vertical ? 70 : tamNo / 2 / u) * u, width: vertical ? a.largura * 0.8 : tamNo, transform: `scale(${0.6 + 0.4 * s})`, ...f, opacity: q > 0.05 ? (ativo ? 1 : 0.65) : 0.15 }}>
            <Vidro c={c} estilo={{ padding: `${24 * u}px ${20 * u}px`, display: "flex", flexDirection: vertical ? "row" : "column", alignItems: "center", gap: 14 * u, textAlign: "center", border: `${1.5 * u}px solid ${ativo ? rgba(tema.acento, 0.9) : "rgba(255,255,255,.15)"}`, boxShadow: ativo ? `${brilho(tema.acento, u, 0.6)}, 0 ${24 * u}px ${60 * u}px rgba(0,0,0,.5)` : undefined }}>
              <span style={{ width: (vertical ? 70 : 100) * u, height: (vertical ? 70 : 100) * u, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: ativo ? `radial-gradient(circle at 35% 30%, ${misturar(tema.acento, "#ffffff", 0.3)}, ${tema.acento})` : rgba(tema.acento, 0.15), boxShadow: ativo ? brilho(tema.acento, u, 0.7) : "none", flex: "0 0 auto" }}>
                <Icone nome={no.icone ?? "estrela"} tam={(vertical ? 38 : 54) * u} cor={ativo ? sobreOAcento(tema) : tema.acento} traco={2.2} />
              </span>
              <div style={{ ...estiloDoTitulo(c, vertical ? 38 : n > 3 ? 38 : 46), color: corDoTexto(c) }}>{texto(no.rotulo)}</div>
            </Vidro>
          </div>
        );
      })}
    </Palco>
  );
}

/**
 * PASSOS EM FOCO (o "7 passos" do Dan Martell): os N blocos numerados em luz,
 * em perspectiva; o passo dito acende inteiro com o nome, os outros ficam
 * fantasmas desfocados só com o número. O passo anterior fica com um check.
 */
export function PassosFoco(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const itens = lista<{ rotulo?: string; texto?: string }>(p.itens).slice(0, 8);
  const n = Math.max(1, itens.length);
  const a = area(c, Boolean(p.titulo));
  const prog = itens.map((_, k) => (c.passos.length > k ? c.passos[k] : 0));
  const atual = atualDe(prog);
  // No 9:16, uma coluna até 4 passos: os blocos ocupam a altura (prova de 03/10: meia tela vazia).
  const porLinha = vertical ? (n <= 4 ? 1 : 2) : n <= 4 ? n : Math.ceil(n / 2);
  const linhas = Math.ceil(n / porLinha);
  const gap = 28 * u;
  const bw = (a.largura - gap * (porLinha - 1)) / porLinha;
  const bh = Math.min(vertical ? 300 * u : 230 * u, (a.altura - gap * (linhas - 1)) / linhas);
  const entra = molaFisica(c.t - 0.2, 140, 16);
  return (
    <Palco c={c} semente={semente(c)}>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, top: a.topo + 20 * u, width: a.largura, perspective: 1600 * u }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap, transform: `rotateX(${(1 - entra) * 30 + 8}deg)`, transformOrigin: "50% 0" }}>
          {itens.map((it, k) => {
            const q = prog[k];
            const ativo = k === atual;
            const feito = atual > k;
            const chega = molaFisica(c.t - 0.25 - k * 0.07, 200, 15);
            const pulso = ativo ? Math.sin(limitar(q) * Math.PI) : 0;
            return (
              <div key={k} style={{ width: bw, height: bh, opacity: limitar((c.t - 0.25 - k * 0.07) / 0.15), transform: `translateY(${(1 - chega) * 60 * u}px) scale(${ativo ? 1.04 + 0.04 * pulso : 0.97}) translateZ(${ativo ? 60 * u : 0}px)`, filter: ativo ? "none" : `blur(${(feito ? 2 : 3.5) * u}px)` }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 26 * u, position: "relative", overflow: "hidden", background: ativo ? `linear-gradient(160deg, ${misturar(tema.acento, "#ffffff", 0.3)}, ${tema.acento} 45%, ${misturar(tema.acento, "#000000", 0.35)})` : `linear-gradient(160deg, ${rgba(tema.acento, feito ? 0.45 : 0.3)}, ${rgba(misturar(tema.acento, "#000000", 0.6), 0.6)})`, border: `${2 * u}px solid ${ativo ? "#ffffff" : rgba(tema.acento, 0.5)}`, boxShadow: ativo ? `${brilho(tema.acento, u, 1.3)}, inset 0 ${2 * u}px 0 rgba(255,255,255,.5)` : `0 0 ${24 * u}px ${rgba(tema.acento, 0.35)}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 18 * u, textAlign: "center" }}>
                  {ativo ? (
                    <>
                      <div style={{ fontFamily: tema.fonteMono, fontSize: 18 * u, letterSpacing: "0.2em", color: rgba(sobreOAcento(tema), 0.8) }}>{String(k + 1).padStart(2, "0")}</div>
                      <div style={{ ...estiloDoTitulo(c, n > 6 ? 36 : 44), color: sobreOAcento(tema), marginTop: 6 * u }}>{texto(it.rotulo)}</div>
                      {it.texto ? <div style={{ ...estiloDoApoio(c, 24), color: rgba(sobreOAcento(tema), 0.85), marginTop: 6 * u }}>{texto(it.texto)}</div> : null}
                    </>
                  ) : (
                    <div style={{ fontFamily: "Playfair Display", fontStyle: "italic", fontSize: bh * 0.42, color: "rgba(255,255,255,.75)" }}>{feito ? "✓" : k + 1}</div>
                  )}
                  {ativo ? <div style={{ position: "absolute", top: 0, bottom: 0, width: "35%", left: `${-40 + limitar(q * 1.5) * 170}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,.45), transparent)", transform: "skewX(-18deg)" }} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: "absolute", right: margens(c).x, top: margens(c).topo + 6 * u, opacity: saiSuave((c.t - 0.4) / 0.3) }}>
        <EtiquetaHud c={c} texto={`${String(Math.max(1, atual + 1)).padStart(2, "0")} / ${String(n).padStart(2, "0")}`} />
      </div>
      <div style={{ position: "absolute", left: a.x, top: a.topo, width: a.largura, height: 1 }}>
        <Cantoneiras c={c} w={a.largura} h={linhas * bh + (linhas - 1) * gap + 40 * u} abre={(c.t - 0.3) / 0.5} cor={rgba("#ffffff", 0.35)} />
      </div>
    </Palco>
  );
}
