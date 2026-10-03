import React from "react";
import {
  ComDestaque,
  corDoTexto,
  corFraca,
  entradaDoBloco,
  estiloDoApoio,
  estiloDoPainel,
  estiloDoTitulo,
  Icone,
  IconeNaCaixa,
  limitar,
  lista,
  margens,
  misturar,
  mola,
  Numero,
  progressoDoItem,
  rgba,
  saiSuave,
  sobreOAcento,
  texto,
  type Ctx,
} from "../base";

/** O título da peça (quando há), no canto de cima, como o pitch. */
function Cabeca({ c, titulo, rotulo }: { c: Ctx; titulo?: unknown; rotulo?: unknown }) {
  if (!titulo) return null;
  const { u, vertical } = c;
  const m = margens(c);
  return (
    <div style={{ position: "absolute", left: m.x, top: m.topo, maxWidth: m.largura, ...entradaDoBloco(c, c.entra, 20) }}>
      {rotulo ? (
        <div style={{ ...estiloDoApoio(c, 22), fontFamily: c.tema.fonteMono, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12 * u, color: c.tema.visual === "documental" ? "#f4efe4" : "#dfe6ef" }}>
          {texto(rotulo)}
        </div>
      ) : null}
      <div style={{ ...estiloDoPainel(c), display: "inline-block", padding: `${22 * u}px ${32 * u}px` }}>
        <div style={{ ...estiloDoTitulo(c, vertical ? 60 : 66), color: corDoTexto(c) }}>
          <ComDestaque c={c} texto={texto(titulo)} />
        </div>
      </div>
    </div>
  );
}

/** A região de conteúdo abaixo do título. */
function area(c: Ctx, comTitulo: boolean) {
  const m = margens(c);
  const topo = comTitulo ? m.topo + (c.vertical ? 230 : 200) * c.u : m.topo;
  return { x: m.x, topo, largura: m.largura, altura: m.base - topo };
}

/** CARTÕES EM SEQUÊNCIA: cada um entra quando é dito (as barreiras do pitch). */
export function Cartoes(c: Ctx) {
  const { props: p, u, vertical } = c;
  const itens = lista<{ titulo?: string; texto?: string; icone?: string }>(p.itens).slice(0, 5);
  const marca = texto(p.marca, "nenhuma");
  const a = area(c, Boolean(p.titulo));
  const n = Math.max(1, itens.length);
  const gap = 36 * u;
  const largCartao = vertical ? a.largura : Math.min(620 * u, (a.largura - gap * (n - 1)) / n);
  const topo = vertical ? a.topo + 10 * u : Math.max(a.topo + 40 * u, c.H * 0.42);
  return (
    <>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, top: topo, display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 22 * u : gap, opacity: c.fica }}>
        {itens.map((it, k) => {
          const q = progressoDoItem(c, k);
          const e = c.tema.visual === "impacto" ? mola(q) : saiSuave(q);
          const sinal =
            marca === "x" ? <IconeNaCaixa c={c} nome="x" tam={vertical ? 50 : 56} /> : marca === "check" ? <IconeNaCaixa c={c} nome="check" tam={vertical ? 50 : 56} /> : marca === "numero" ? <Numero c={c} n={k + 1} tam={vertical ? 54 : 58} /> : it.icone ? <IconeNaCaixa c={c} nome={it.icone} tam={vertical ? 50 : 56} /> : null;
          return (
            <div key={k} style={{ ...estiloDoPainel(c), width: largCartao, padding: `${(vertical ? 24 : 34) * u}px ${36 * u}px`, opacity: limitar(q * 2.5), transform: `translateY(${(1 - e) * 40 * u}px) scale(${0.96 + 0.04 * e})` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 * u, marginBottom: it.texto ? 12 * u : 0 }}>
                {sinal}
                <span style={{ ...estiloDoTitulo(c, vertical ? 42 : n > 3 ? 38 : 44), color: corDoTexto(c) }}>{texto(it.titulo)}</span>
              </div>
              {it.texto ? <div style={{ ...estiloDoApoio(c, vertical ? 28 : n > 3 ? 26 : 30) }}>{texto(it.texto)}</div> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * LINHA DO TEMPO DE N PASSOS: a linha corre até o passo dito, o nó acende e o
 * rótulo sobe. Deitada no 16:9, em pé no 9:16.
 */
export function LinhaDoTempo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const passos = lista<{ rotulo?: string; texto?: string; icone?: string }>(p.passos).slice(0, 6);
  const n = Math.max(1, passos.length);
  const a = area(c, Boolean(p.titulo));
  const prog = passos.map((_, k) => progressoDoItem(c, k, 0.35));
  // A linha anda até o último passo aceso (com a parte do que está acendendo).
  let linhaP = 0;
  prog.forEach((q, k) => {
    if (k > 0 && q > 0) linhaP = Math.max(linhaP, (k - 1 + saiSuave(q)) / (n - 1));
  });
  linhaP = limitar(linhaP);
  const N = vertical ? 64 : 92;
  const no = (k: number, q: number) => {
    const aceso = q > 0.02;
    const s = 0.6 + 0.4 * mola(q);
    return (
      <div style={{ width: N * u, height: N * u, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${aceso ? s : 0.8})`, background: aceso ? `linear-gradient(135deg, ${misturar(tema.acento, "#ffffff", 0.15)}, ${misturar(tema.acento, "#000000", 0.2)})` : rgba("#0b1220", 0.85), border: `${3 * u}px solid ${aceso ? rgba(tema.acento, 0.9) : "rgba(255,255,255,.25)"}`, boxShadow: aceso ? `0 0 ${30 * u}px ${rgba(tema.acento, 0.55)}` : "none", fontFamily: "Geist", fontWeight: 700, fontSize: N * 0.46 * u, color: aceso ? sobreOAcento(tema) : "rgba(255,255,255,.6)" }}>
        {passos[k].icone ? <Icone nome={passos[k].icone!} tam={N * 0.46 * u} cor={aceso ? sobreOAcento(tema) : "rgba(255,255,255,.6)"} traco={2.4} /> : k + 1}
      </div>
    );
  };
  if (vertical) {
    const passo = Math.min(200 * u, (a.altura - 40 * u) / n);
    const x0 = a.x + 32 * u;
    return (
      <>
        <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
        <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity: c.fica * limitar(c.entra * 3) }}>
          <div style={{ position: "absolute", left: x0 - 3 * u, top: a.topo + 32 * u, width: 6 * u, height: passo * (n - 1), background: "rgba(255,255,255,.18)", borderRadius: 3 * u }} />
          <div style={{ position: "absolute", left: x0 - 3 * u, top: a.topo + 32 * u, width: 6 * u, height: passo * (n - 1) * linhaP, background: tema.acento, borderRadius: 3 * u, boxShadow: `0 0 ${16 * u}px ${rgba(tema.acento, 0.6)}` }} />
          {passos.map((ps, k) => {
            const q = prog[k];
            return (
              <div key={k} style={{ position: "absolute", left: x0 - 32 * u, top: a.topo + k * passo, display: "flex", alignItems: "flex-start", gap: 26 * u }}>
                {no(k, q)}
                <div style={{ ...estiloDoPainel(c), padding: `${14 * u}px ${24 * u}px`, maxWidth: a.largura - 110 * u, opacity: 0.25 + 0.75 * saiSuave(q), transform: `translateX(${(1 - saiSuave(q)) * 20 * u}px)` }}>
                  <div style={{ ...estiloDoTitulo(c, 40), color: corDoTexto(c) }}>{texto(ps.rotulo)}</div>
                  {ps.texto ? <div style={{ ...estiloDoApoio(c, 26), marginTop: 4 * u }}>{texto(ps.texto)}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }
  const y = Math.max(a.topo + 160 * u, c.H * 0.48);
  const x0 = a.x + (n > 4 ? 150 : 210) * u;
  const x1 = a.x + a.largura - (n > 4 ? 150 : 210) * u;
  const passo = n === 1 ? 0 : (x1 - x0) / (n - 1);
  const largRot = Math.min(460 * u, passo * 0.94 || 460 * u);
  return (
    <>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", inset: 0, opacity: c.fica * limitar(c.entra * 3) }}>
        <div style={{ position: "absolute", left: x0, top: y - 3 * u, width: x1 - x0, height: 6 * u, background: "rgba(255,255,255,.18)", borderRadius: 3 * u }} />
        <div style={{ position: "absolute", left: x0, top: y - 4 * u, width: (x1 - x0) * linhaP, height: 8 * u, background: `linear-gradient(90deg, ${rgba(tema.acento, 0.6)}, ${tema.acento})`, borderRadius: 3 * u, boxShadow: `0 0 ${18 * u}px ${rgba(tema.acento, 0.6)}` }} />
        {passos.map((ps, k) => {
          const q = prog[k];
          const x = x0 + passo * k;
          const e = saiSuave(q);
          return (
            <React.Fragment key={k}>
              <div style={{ position: "absolute", left: x - (N / 2) * u, top: y - (N / 2) * u }}>{no(k, q)}</div>
              <div style={{ position: "absolute", left: x - largRot / 2, top: y + 78 * u, width: largRot, textAlign: "center", opacity: 0.2 + 0.8 * e, transform: `translateY(${(1 - e) * 18 * u}px)` }}>
                <div style={{ ...estiloDoTitulo(c, n > 4 ? 44 : 54), color: "#ffffff", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{texto(ps.rotulo)}</div>
                {ps.texto ? <div style={{ ...estiloDoApoio(c, n > 4 ? 26 : 30), marginTop: 6 * u, color: "#c9d3df", textShadow: "0 2px 10px rgba(0,0,0,.7)" }}>{texto(ps.texto)}</div> : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}

/** ESCADA: degraus que sobem um a um, com a bandeira no último dito. */
export function Escada(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const degraus = lista<{ rotulo?: string }>(p.degraus).slice(0, 6);
  const n = Math.max(1, degraus.length);
  const a = area(c, Boolean(p.titulo));
  const largTotal = vertical ? a.largura : Math.min(a.largura, 1500 * u);
  const x0 = vertical ? a.x : (c.W - largTotal) / 2;
  const gap = 12 * u;
  const lw = (largTotal - gap * (n - 1)) / n;
  const baseY = vertical ? a.topo + a.altura * 0.92 : c.H - 190 * u;
  const altMax = vertical ? a.altura * 0.75 : (baseY - a.topo) * 0.85;
  const prog = degraus.map((_, k) => progressoDoItem(c, k, 0.3));
  let ultimo = -1;
  prog.forEach((q, k) => q > 0.3 && (ultimo = k));
  return (
    <>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", inset: 0, opacity: c.fica }}>
        {degraus.map((d, k) => {
          const q = prog[k];
          const e = c.tema.visual === "impacto" ? mola(q) : saiSuave(q);
          const h = (altMax * (k + 1)) / n;
          const x = x0 + k * (lw + gap);
          const topo = baseY - h * e;
          const aceso = k === ultimo;
          return (
            <React.Fragment key={k}>
              <div
                style={{
                  position: "absolute",
                  left: x,
                  top: topo,
                  width: lw,
                  height: h * e,
                  borderRadius: `${14 * u}px ${14 * u}px ${4 * u}px ${4 * u}px`,
                  background: aceso ? `linear-gradient(180deg, ${misturar(tema.acento, "#ffffff", 0.1)}, ${misturar(tema.acento, "#000000", 0.35)})` : `linear-gradient(180deg, ${rgba("#ffffff", 0.16)}, ${rgba("#ffffff", 0.05)})`,
                  border: `${1.5 * u}px solid ${aceso ? rgba(tema.acento, 0.9) : "rgba(255,255,255,.18)"}`,
                  boxShadow: aceso ? `0 0 ${40 * u}px ${rgba(tema.acento, 0.45)}` : `0 ${16 * u}px ${30 * u}px rgba(0,0,0,.35)`,
                  backdropFilter: "blur(2px)",
                }}
              >
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 16 * u, textAlign: "center", fontFamily: "Geist", fontWeight: 700, fontSize: 46 * u, color: aceso ? sobreOAcento(tema) : "rgba(255,255,255,.55)", opacity: limitar(e * 2 - 0.8) }}>{k + 1}</div>
              </div>
              <div style={{ position: "absolute", left: x - 20 * u, width: lw + 40 * u, top: topo - (vertical ? 92 : 100) * u, textAlign: "center", opacity: limitar(q * 2 - 0.6) }}>
                <div style={{ ...estiloDoTitulo(c, vertical ? 30 : n > 4 ? 32 : 38), color: "#ffffff", textShadow: "0 2px 14px rgba(0,0,0,.8)" }}>{texto(d.rotulo)}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}

/** LISTA COM CHECK: cada item é marcado quando é dito. */
export function Checklist(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const itens = lista<{ texto?: string }>(p.itens).slice(0, 7);
  const m = margens(c);
  const larg = vertical ? m.largura : 900 * u;
  const direita = texto(p.lado) === "direita";
  return (
    <div style={{ position: "absolute", top: vertical ? m.topo : 120 * u, ...(direita ? { right: m.x } : { left: m.x }), width: larg, ...estiloDoPainel(c), padding: `${36 * u}px ${42 * u}px`, ...entradaDoBloco(c, c.entra, 24) }}>
      {p.titulo ? (
        <div style={{ ...estiloDoTitulo(c, vertical ? 52 : 56), color: corDoTexto(c), marginBottom: 26 * u }}>
          <ComDestaque c={c} texto={texto(p.titulo)} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 * u }}>
        {itens.map((it, k) => {
          const q = progressoDoItem(c, k, 0.2);
          const marcado = saiSuave((q - 0.2) / 0.5);
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 20 * u, opacity: 0.35 + 0.65 * limitar(q * 2) }}>
              <span style={{ width: 46 * u, height: 46 * u, flex: "0 0 auto", borderRadius: 12 * u, border: `${3 * u}px solid ${marcado > 0 ? tema.acento : rgba(corFraca(c), 0.6)}`, background: rgba(tema.acento, 0.9 * marcado), display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ transform: `scale(${marcado})` }}>
                  <Icone nome="check" tam={30 * u} cor={sobreOAcento(tema)} traco={3.2} />
                </span>
              </span>
              <span style={{ fontFamily: tema.fonteTexto, fontWeight: 600, fontSize: (vertical ? 36 : 38) * u, color: corDoTexto(c), lineHeight: 1.25 }}>{texto(it.texto)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** COMPARAÇÃO: o antes (apagado, com x) e o depois (aceso, com check), lado a lado. */
export function Comparacao(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const esq = (p.esquerda ?? {}) as { titulo?: string; itens?: string[] };
  const dir = (p.direita ?? {}) as { titulo?: string; itens?: string[] };
  const a = area(c, Boolean(p.titulo));
  const gap = 36 * u;
  const lw = vertical ? a.largura : (a.largura - gap) / 2;
  const qd = c.passos.length ? c.passos[0] : saiSuave((c.t - 0.45) / 0.5);
  const lado = (lb: { titulo?: string; itens?: string[] }, bom: boolean, q: number) => (
    <div
      style={{
        ...estiloDoPainel(c),
        width: lw,
        padding: `${32 * u}px ${36 * u}px`,
        opacity: limitar(q * 2) * (bom ? 1 : 0.92),
        transform: `translateY(${(1 - saiSuave(q)) * 30 * u}px)`,
        border: bom ? `${2 * u}px solid ${rgba(tema.acento, 0.85)}` : estiloDoPainel(c).border,
        boxShadow: bom ? `0 0 ${50 * u}px ${rgba(tema.acento, 0.28)}, 0 ${24 * u}px ${60 * u}px rgba(0,0,0,.45)` : estiloDoPainel(c).boxShadow,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 * u, marginBottom: 20 * u }}>
        <IconeNaCaixa c={c} nome={bom ? "check" : "x"} tam={52} aceso={bom} />
        <span style={{ ...estiloDoTitulo(c, vertical ? 42 : 46), color: bom ? corDoTexto(c) : corFraca(c) }}>{texto(lb.titulo)}</span>
      </div>
      {(lb.itens ?? []).slice(0, 4).map((t, k) => (
        <div key={k} style={{ ...estiloDoApoio(c, vertical ? 30 : 31), color: bom ? corDoTexto(c) : corFraca(c), textDecoration: bom ? "none" : `line-through ${rgba(corFraca(c), 0.5)}`, marginTop: 10 * u }}>
          {t}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, top: vertical ? a.topo : Math.max(a.topo + 20 * u, c.H * 0.32), display: "flex", flexDirection: vertical ? "column" : "row", gap, opacity: c.fica }}>
        {lado(esq, false, c.entra)}
        {lado(dir, true, qd)}
      </div>
    </>
  );
}

/** FLUXO: A, depois B, depois C, com a seta que se desenha entre eles. */
export function Fluxo(c: Ctx) {
  const { props: p, u, tema, vertical } = c;
  const nos = lista<{ rotulo?: string; icone?: string }>(p.nos).slice(0, 5);
  const n = Math.max(1, nos.length);
  const a = area(c, Boolean(p.titulo));
  const prog = nos.map((_, k) => progressoDoItem(c, k, 0.4));
  const tamNo = vertical ? 150 * u : Math.min(380 * u, (a.largura - (n - 1) * 110 * u) / n);
  return (
    <>
      <Cabeca c={c} titulo={p.titulo} rotulo={p.rotulo} />
      <div style={{ position: "absolute", left: a.x, right: c.W - a.x - a.largura, top: vertical ? a.topo : Math.max(a.topo + 30 * u, c.H * 0.38), display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center", justifyContent: "center", gap: 0, opacity: c.fica }}>
        {nos.map((no, k) => {
          const q = prog[k];
          const e = c.tema.visual === "impacto" ? mola(q) : saiSuave(q);
          const seta = k > 0 ? saiSuave(prog[k] * 1.6) : 0;
          return (
            <React.Fragment key={k}>
              {k > 0 ? (
                <svg width={vertical ? 60 * u : 110 * u} height={vertical ? 70 * u : 60 * u} viewBox={vertical ? "0 0 60 70" : "0 0 110 60"} style={{ overflow: "visible" }}>
                  {vertical ? (
                    <path d="M30 6 L30 56 M18 44 L30 58 L42 44" fill="none" stroke={tema.acento} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={90} strokeDashoffset={90 * (1 - seta)} />
                  ) : (
                    <path d="M8 30 L96 30 M82 16 L98 30 L82 44" fill="none" stroke={tema.acento} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={130} strokeDashoffset={130 * (1 - seta)} />
                  )}
                </svg>
              ) : null}
              <div style={{ ...estiloDoPainel(c), width: vertical ? a.largura * 0.8 : tamNo, padding: `${26 * u}px ${22 * u}px`, display: "flex", flexDirection: vertical ? "row" : "column", alignItems: "center", gap: 16 * u, textAlign: "center", opacity: limitar(q * 2.5), transform: `scale(${0.85 + 0.15 * e})` }}>
                <IconeNaCaixa c={c} nome={no.icone ?? "estrela"} tam={vertical ? 60 : 110} />
                <div style={{ ...estiloDoTitulo(c, vertical ? 38 : n > 3 ? 40 : 50), color: corDoTexto(c) }}>{texto(no.rotulo)}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
